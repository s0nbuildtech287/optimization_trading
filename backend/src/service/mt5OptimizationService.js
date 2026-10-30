const fs = require('fs');
const path = require('path');
const { randomBytes, createHash } = require('crypto');
const AdmZip = require('adm-zip');
const XLSX = require('xlsx');
const dao = require('../dao/mt5OptimizationDao');
const resultDao = require('../dao/mt5ResultDao');
const strategyMetadataDao = require('../dao/strategyMetadataDao');
const backtestAccessService = require('./backtestAccessService');
const opService = require('./opService');
const notificationService = require('./notificationService');
const { MT5 } = require('../utils/constants');
const { MT5: MESSAGES } = require('../utils/messages');
const { formatStrategyFilename, parseStrategyName, TIMEFRAMES } = require('../utils/strategyNaming');
const { parseVolume } = require('../utils/parseDeals');
const { convertMt5HtmlToXlsxBuffer } = require('../utils/convertMt5HtmlToXlsx');

const uploadRoot = path.resolve(__dirname, '../../uploads/mt5_runtime');
const optimizeMetricKeys = new Set([
  'Result','Profit','Expected Payoff','Profit Factor','Recovery Factor','Sharpe Ratio',
  'Custom','Equity DD','Equity DD %','Drawdown %','Balance DD','Balance DD %','Trades'
]);
const internalRowKeys = new Set([
  'template_ini_name','template_ini_relpath','optimize_run_no','selected','filter_reason',
  'rank_no','is_fallback','fallback_reason','DD_Deviation','Result_Value','pd_ratio','Pass','pass'
]);

function httpError(message, status=400, code='MT5_ERROR') {
  const error=new Error(message); error.status=status; error.code=code; return error;
}

function requireText(value,label,max=10000000) {
  const text=String(value??'').trim();
  if(!text) throw httpError(`${label} is required`,400,'MT5_VALIDATION');
  if(text.length>max) throw httpError(`${label} is too long`,413,'MT5_VALIDATION');
  return text;
}

function pageLimit(value) {
  const parsed=Number.parseInt(value,10);
  return Math.max(1,Math.min(Number.isInteger(parsed)?parsed:50,MT5.MAX_PAGE_SIZE));
}

const filterPreferenceFields = Object.freeze({
  [MT5.FILTER_PREFERENCE_SCOPES.OPTIMIZATION]: Object.freeze({
    filterRules: Object.freeze(['minProfit', 'minRecoveryFactor', 'trades', 'profitFactor', 'balanceDD', 'sharpeRatio', 'topN', 'clusterRadius']),
    inputFilters: Object.freeze(['search', 'symbol', 'strategy', 'status', 'backtestRuns'])
  }),
  [MT5.FILTER_PREFERENCE_SCOPES.BACKTEST_CANDIDATES]: Object.freeze({
    filterRules: Object.freeze(['minProfit', 'minRecoveryFactor', 'trades', 'profitFactor', 'balanceDD', 'pdRatio', 'sharpeRatio', 'largestLossTrade']),
    inputFilters: Object.freeze(['search', 'symbol', 'strategy', 'status']),
    dateRange: Object.freeze(['mode', 'from', 'to'])
  }),
  [MT5.FILTER_PREFERENCE_SCOPES.BACKTEST_STAGING]: Object.freeze({
    filterRules: Object.freeze(['minProfit', 'minRecoveryFactor', 'trades', 'profitFactor', 'balanceDD', 'pdRatio', 'sharpeRatio', 'largestLossTrade']),
    inputFilters: Object.freeze(['search']),
    dateRange: Object.freeze(['mode', 'from', 'to'])
  })
});

function sanitizeFilterPreference(scope, payload) {
  const schema = filterPreferenceFields[scope];
  if (!schema) throw httpError(MESSAGES.INVALID_FILTER_PREFERENCE_SCOPE, 400, 'MT5_INVALID_FILTER_PREFERENCE_SCOPE');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw httpError(MESSAGES.INVALID_FILTER_PREFERENCE, 400, 'MT5_INVALID_FILTER_PREFERENCE');
  }
  const preference = {};
  Object.entries(schema).forEach(([section, fields]) => {
    const source = payload[section];
    if (!source || typeof source !== 'object' || Array.isArray(source)) return;
    preference[section] = Object.fromEntries(
      fields
        .filter((field) => Object.prototype.hasOwnProperty.call(source, field))
        .map((field) => [field, String(source[field] ?? '').slice(0, 500)]),
    );
  });
  if (!Object.keys(preference).length || Buffer.byteLength(JSON.stringify(preference), 'utf8') > MT5.FILTER_PREFERENCE_MAX_BYTES) {
    throw httpError(MESSAGES.INVALID_FILTER_PREFERENCE, 400, 'MT5_INVALID_FILTER_PREFERENCE');
  }
  return preference;
}

const getFilterPreferences = (actor) => dao.getFilterPreferences(actor.userId);

async function saveFilterPreference(actor, scope, payload) {
  return dao.saveFilterPreference(actor.userId, scope, sanitizeFilterPreference(scope, payload));
}

async function deleteFilterPreference(actor, scope) {
  if (!filterPreferenceFields[scope]) {
    throw httpError(MESSAGES.INVALID_FILTER_PREFERENCE_SCOPE, 400, 'MT5_INVALID_FILTER_PREFERENCE_SCOPE');
  }
  return dao.deleteFilterPreference(actor.userId, scope);
}

async function requireSession(actor,sessionId) {
  const session=await dao.getSession(sessionId,actor);
  if(!session) throw httpError(MESSAGES.SESSION_NOT_FOUND,404,'MT5_SESSION_NOT_FOUND');
  return session;
}

async function createSession(actor,payload) {
  return dao.createSession(actor.userId,{name:requireText(payload.name,'name',160),description:payload.description||null});
}
const listSessions=(actor)=>dao.listSessions(actor);
async function updateSession(actor,id,payload) {
  if(payload.status && !Object.values(MT5.SESSION_STATUS).includes(payload.status))
    throw httpError('Invalid session status');
  const session=await dao.updateSession(id,actor,payload);
  if(!session) throw httpError(MESSAGES.SESSION_NOT_FOUND,404,'MT5_SESSION_NOT_FOUND');
  return session;
}

function cleanupChunkSize(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return MT5.CLEANUP_CHUNK_DEFAULT;
  return Math.max(MT5.CLEANUP_CHUNK_MIN, Math.min(parsed, MT5.CLEANUP_CHUNK_MAX));
}

function normalizeCleanupPreview(row) {
  const numericKeys = [
    'total_results','watchlist_results','candidate_linked_results','purgeable_results',
    'retained_results','candidate_count','staging_count','synced_staging_count',
    'unsynced_staging_count','job_count','active_job_count','log_count',
  ];
  const normalized = { ...row };
  for (const key of numericKeys) normalized[key] = Number(row[key] || 0);
  return normalized;
}

async function getSessionCleanupPreview(actor, id) {
  const preview = await dao.getSessionCleanupPreview(id, actor);
  if (!preview) throw httpError(MESSAGES.SESSION_NOT_FOUND, 404, 'MT5_SESSION_NOT_FOUND');
  return normalizeCleanupPreview(preview);
}

async function purgeUnusedOptimizeResults(actor, id, payload = {}) {
  const result = await dao.purgeUnusedOptimizeResults(id, actor, cleanupChunkSize(payload.chunkSize || payload.chunk_size));
  if (!result) throw httpError(MESSAGES.SESSION_NOT_FOUND, 404, 'MT5_SESSION_NOT_FOUND');
  if (result.busy) throw httpError(MESSAGES.SESSION_MAINTENANCE_BUSY, 409, 'MT5_SESSION_MAINTENANCE_BUSY');
  if (result.activeJobs) throw httpError(MESSAGES.SESSION_HAS_ACTIVE_JOBS, 409, 'MT5_SESSION_HAS_ACTIVE_JOBS');
  return result;
}

async function deleteSession(actor, id, payload = {}) {
  const confirmationName = requireText(payload.confirmationName || payload.confirmation_name, 'confirmation_name', 160);
  const result = await dao.deleteSessionChunk(id, actor, confirmationName, cleanupChunkSize(payload.chunkSize || payload.chunk_size));
  if (!result) throw httpError(MESSAGES.SESSION_NOT_FOUND, 404, 'MT5_SESSION_NOT_FOUND');
  if (result.confirmationMismatch) throw httpError(MESSAGES.SESSION_CONFIRMATION_MISMATCH, 409, 'MT5_SESSION_CONFIRMATION_MISMATCH');
  if (result.busy) throw httpError(MESSAGES.SESSION_MAINTENANCE_BUSY, 409, 'MT5_SESSION_MAINTENANCE_BUSY');
  if (result.activeJobs) throw httpError(MESSAGES.SESSION_HAS_ACTIVE_JOBS, 409, 'MT5_SESSION_HAS_ACTIVE_JOBS');
  if (result.unsyncedStaging) throw httpError(MESSAGES.SESSION_HAS_UNSYNCED_STAGING, 409, 'MT5_SESSION_HAS_UNSYNCED_STAGING');
  for (const jobId of result.runtimeJobIds || []) removeJobRuntime(jobId);
  return result;
}

async function createApiKey(actor,payload) {
  const name=requireText(payload.name,'name',120);
  const key=`lq_${randomBytes(30).toString('base64url')}`;
  return dao.createApiKey(actor.userId,name,key,Array.isArray(payload.scopes)&&payload.scopes.length?payload.scopes:['mt5:worker']);
}
const listApiKeys=(actor)=>dao.listApiKeys(actor);
async function revokeApiKey(actor,id) {
  const key=await dao.revokeApiKey(id,actor);
  if(!key) throw httpError('API key not found',404,'MT5_API_KEY_NOT_FOUND');
  return key;
}
async function deleteApiKey(actor,id) {
  const key=await dao.deleteApiKey(id,actor);
  if(!key) throw httpError('API key not found or unauthorized',404,'MT5_API_KEY_NOT_FOUND');
  return key;
}

const listWorkers=(actor)=>dao.listWorkers(actor);
async function updateWorker(actor,id,payload) {
  if(payload.allowedJobTypes && (!Array.isArray(payload.allowedJobTypes) ||
    payload.allowedJobTypes.some(type=>!Object.values(MT5.JOB_TYPE).includes(type)))) {
    throw httpError('Invalid allowed job types');
  }
  const worker=await dao.updateWorker(id,actor,{
    runAccess:typeof payload.runAccess==='boolean'?payload.runAccess:null,
    isPublic:typeof payload.isPublic==='boolean'?payload.isPublic:null,
    allowedJobTypes:payload.allowedJobTypes||null,
  });
  if(!worker) throw httpError(MESSAGES.WORKER_NOT_FOUND,404,'MT5_WORKER_NOT_FOUND');
  return worker;
}

async function deleteWorker(actor,id) {
  const worker=await dao.deleteWorker(id,actor);
  if(!worker) throw httpError('Worker not found or still has an active job',409,'MT5_WORKER_ACTIVE');
  return worker;
}

async function authenticateWorker(apiKey) {
  const key=await dao.findActiveApiKey(apiKey);
  if(!key) throw httpError(MESSAGES.INVALID_API_KEY,401,'MT5_INVALID_API_KEY');
  return key;
}

function normalizeJobType(value) {
  const raw=String(value||'').toUpperCase();
  if(['0','OPTIMIZE_ONLY','OPEN_PRICE'].includes(raw)) return MT5.JOB_TYPE.OPEN_PRICE;
  if(['1','BACKTEST_ONLY','SINGLE_BACKTEST','EVERY_TICK'].includes(raw)) return MT5.JOB_TYPE.EVERY_TICK;
  if(Object.values(MT5.JOB_TYPE).includes(raw)) return raw;
  throw httpError('Invalid MT5 job type');
}

function normalizeStrategyId(value) {
  const raw=requireText(value,'strategy_id',160);
  return formatStrategyFilename(raw,null,'')||raw.replace(/\.(ini|xlsx?|csv)$/i,'');
}

function hasEnabledOptimizationInput(iniContent) {
  let inTesterInputs=false;
  return String(iniContent||'').split(/\r?\n/).some(line=>{
    const value=line.trim();
    if(/^\[TesterInputs\]$/i.test(value)) { inTesterInputs=true; return false; }
    if(/^\[.+\]$/.test(value)) { inTesterInputs=false; return false; }
    return inTesterInputs && !/^[;#]/.test(value) && /\|\|(?:Y|true)\s*$/i.test(value);
  });
}

async function createJobs(actor,payload) {
  const sessionId=requireText(payload.sessionId||payload.session_id,'session_id',80);
  const session=await requireSession(actor,sessionId);
  const sourceJobs=Array.isArray(payload.jobs)?payload.jobs:[];
  if(!sourceJobs.length) throw httpError('jobs must contain at least one item');
  if(sourceJobs.length>1000) throw httpError('A request may create at most 1000 jobs',413);
  const jobs=sourceJobs.map(item=>{
    const jobType=normalizeJobType(item.jobType||item.job_type||item.mode);
    const strategyId=normalizeStrategyId(item.strategyId||item.strategy_id);
    const requestedTarget=item.targetStrategyIdR||item.target_strategy_id_r||null;
    const target=jobType===MT5.JOB_TYPE.EVERY_TICK?requestedTarget:null;
    if(jobType===MT5.JOB_TYPE.EVERY_TICK&&!target) throw httpError('Every Tick job requires target_strategy_id_r');
    const iniContent=requireText(item.iniContent||item.ini_content,'ini_content');
    if(jobType===MT5.JOB_TYPE.OPEN_PRICE&&!hasEnabledOptimizationInput(iniContent))
      throw httpError(MESSAGES.OPEN_PRICE_REQUIRES_OPTIMIZED_INPUT,400,'MT5_NO_OPTIMIZED_INPUT');
    return {
      sessionId,jobType,
      priority:Number.isInteger(Number(item.priority))?Number(item.priority):0,
      strategyId,
      targetStrategyIdR:target,
      iniContent,
      jobPayload:{...(item.jobPayload||item.job_payload||{}),job_name:item.jobName||item.job_name||item.strategyId||item.strategy_id},
      maxAttempts:Math.max(1,Math.min(Number(item.maxAttempts||item.max_attempts)||3,10)),
    };
  });
  const client=await dao.pool.connect();
  try { await client.query('BEGIN'); const created=await dao.createJobs(client,jobs); await client.query('COMMIT'); return created; }
  catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;} finally{client.release();}
}

async function createEveryTickJobs(actor,payload) {
  const sessionId=requireText(payload.sessionId||payload.session_id,'session_id',80);
  await requireSession(actor,sessionId);
  const resultIds=[...new Set((payload.resultIds||payload.result_ids||[]).map(Number).filter(Number.isInteger))];
  if(!resultIds.length) throw httpError('result_ids is required');
  const jobs=[];
  for(const resultId of resultIds) {
    const result=await resultDao.getOptimizeResult(resultId,actor);
    if(!result||result.session_id!==sessionId) throw httpError(MESSAGES.RESULT_NOT_FOUND,404,'MT5_RESULT_NOT_FOUND');
    if(!result.picked_bt) throw httpError(MESSAGES.BACKTEST_CANDIDATE_REQUIRED,409,'MT5_BACKTEST_CANDIDATE_REQUIRED');
    const iniContent=renderEveryTickIni(result.summary_op.template_ini,result.summary_op.inputs);
    const passNumber=result.summary_op.pass??result.id;
    jobs.push({jobType:MT5.JOB_TYPE.EVERY_TICK,strategyId:result.strategy_id,
      targetStrategyIdR:result.strategy_id_r,iniContent,jobPayload:{mode:'1',
      job_name:`${result.strategy_id} - Pass #${passNumber}`,pass:passNumber,
      bot_name:result.summary_op.bot_name||'allbot',max_ini:1,optimize_runs:1,filters:{}},priority:0});
  }
  const activeTargets=await dao.findActiveEveryTickTargets(sessionId,jobs.map((job)=>job.targetStrategyIdR));
  if(activeTargets.length) throw httpError(
    `${MESSAGES.BACKTEST_ALREADY_QUEUED}: ${activeTargets.join(', ')}`,
    409,
    'MT5_BACKTEST_ALREADY_QUEUED',
  );
  return createJobs(actor,{sessionId,jobs});
}

async function startBacktestResult(actor, resultId) {
  const result = await resultDao.getOptimizeResult(Number(resultId), actor);
  if (!result) throw httpError(MESSAGES.RESULT_NOT_FOUND, 404, 'MT5_RESULT_NOT_FOUND');
  const activeTargets = await dao.findActiveEveryTickTargets(
    result.session_id,
    [result.strategy_id_r],
  );
  if (activeTargets.length) {
    throw httpError(
      MESSAGES.BACKTEST_ALREADY_QUEUED,
      409,
      'MT5_BACKTEST_ALREADY_QUEUED',
    );
  }
  if (result.picked_bt) {
    await resultDao.clearBacktestPick(result.session_id, result.strategy_id_r);
  }
  await resultDao.setOptimizeFlag(result.id, actor, 'picked_bt', true);
  const changedPick = true;
  try {
    const jobs = await createEveryTickJobs(actor, {
      sessionId: result.session_id,
      resultIds: [result.id],
    });
    return jobs[0];
  } catch (error) {
    const activeConflict = error.code === 'MT5_BACKTEST_ALREADY_QUEUED' || error.code === '23505';
    if (changedPick && !activeConflict) {
      await resultDao.setOptimizeFlag(result.id, actor, 'picked_bt', false).catch(() => {});
    }
    if (error.code === '23505') {
      throw httpError(MESSAGES.BACKTEST_ALREADY_QUEUED, 409, 'MT5_BACKTEST_ALREADY_QUEUED');
    }
    throw error;
  }
}

async function getRunningBacktestCount(actor, sessionId) {
  await requireSession(actor, sessionId);
  return { count: await dao.countRunningEveryTickJobs(sessionId) };
}

function renderEveryTickIni(template,inputs) {
  const source=requireText(template,'Stored template INI');
  const values=inputs&&typeof inputs==='object'?inputs:{};
  const lines=source.split(/\r?\n/).map(line=>{
    if(/^Optimization=/i.test(line)) return 'Optimization=0';
    if(/^Model=/i.test(line)) return 'Model=0';
    const match=line.match(/^([^=;#]+)=(.*)$/);
    if(!match||!Object.prototype.hasOwnProperty.call(values,match[1].trim())) return line;
    const oldParts=String(match[2]).split('||');
    const value=String(values[match[1].trim()]);
    return `${match[1]}=${oldParts.length>1?`${value}||${value}||0||${value}||N`:value}`;
  });
  return lines.join('\r\n');
}

function getJobFilters(query, sessionId) {
  return {
    sessionId,
    status:query.status||null,
    jobType:query.job_type||null,
    worker:query.worker||null,
    owner:query.owner||null,
    search:String(query.search||'').trim()||null,
    symbol:query.symbol&&query.symbol!=='ALL'?String(query.symbol).trim():null,
  };
}

async function listJobs(actor,query) {
  const sessionId=query.session_id||query.sessionId;
  await requireSession(actor,sessionId);
  const filters=getJobFilters(query,sessionId);
  if(query.page===undefined&&query.page_size===undefined)
    return dao.listJobs(actor,{...filters,beforeId:query.before_id||null,limit:pageLimit(query.limit)});
  const page=Math.max(1,Number(query.page)||1);
  const pageSize=pageLimit(query.page_size||query.limit||25);
  const [items,total,filterOptions,summary]=await Promise.all([
    dao.listJobs(actor,{...filters,limit:pageSize,offset:(page-1)*pageSize}),
    dao.countJobs(actor,filters),
    dao.getJobFilterOptions(actor,sessionId),
    dao.getJobOverview(actor,sessionId),
  ]);
  return {items,total,page,pageSize,filterOptions,summary};
}

async function listJobSelection(actor,query) {
  const sessionId=query.session_id||query.sessionId;
  await requireSession(actor,sessionId);
  const rows=await dao.listJobSelection(actor,getJobFilters(query,sessionId));
  return {
    items:rows.map((row)=>({id:row.job_id,jobType:row.job_type,status:row.status})),
    total:rows.length,
  };
}

async function mutateJob(actor,id,action) {
  const job=await dao.mutateJob(id,actor,action);
  if(!job) throw httpError(MESSAGES.JOB_NOT_FOUND,404,'MT5_JOB_NOT_FOUND');
  if(action==='cancel'&&job.job_type===MT5.JOB_TYPE.EVERY_TICK) {
    await resultDao.clearBacktestPick(job.session_id,job.target_strategy_id_r);
  }
  return job;
}

function rerunCount(value) {
  const count=Number.parseInt(value,10);
  if(!Number.isInteger(count)||count<1||count>MT5.MAX_RERUN_COUNT) {
    throw httpError(`number_of_runs must be between 1 and ${MT5.MAX_RERUN_COUNT}`,400,'MT5_INVALID_RERUN_COUNT');
  }
  return count;
}

async function rerunJob(actor,id,payload={}) {
  const count=rerunCount(payload.numberOfRuns??payload.number_of_runs??payload.count??1);
  const source=await dao.getJob(id);
  if(!source) throw httpError(MESSAGES.JOB_NOT_FOUND,404,'MT5_JOB_NOT_FOUND');
  await requireSession(actor,source.session_id);
  if(![MT5.JOB_STATUS.DONE,MT5.JOB_STATUS.FAILED,MT5.JOB_STATUS.CANCELLED].includes(source.status)) {
    throw httpError('Only terminal jobs can be rerun',409,'MT5_JOB_NOT_RERUNNABLE');
  }
  if(source.job_type===MT5.JOB_TYPE.EVERY_TICK) {
    const active=await dao.findActiveEveryTickTargets(source.session_id,[source.target_strategy_id_r]);
    if(active.length) throw httpError(MESSAGES.BACKTEST_ALREADY_QUEUED,409,'MT5_BACKTEST_ALREADY_QUEUED');
  }
  const client=await dao.pool.connect();
  try {
    await client.query('BEGIN');
    const job=await dao.rerunJob(id,actor,count,client);
    if(!job) throw httpError('Only terminal jobs can be rerun',409,'MT5_JOB_NOT_RERUNNABLE');
    if(job.job_type===MT5.JOB_TYPE.EVERY_TICK) {
      const result=await resultDao.setBacktestPickByTarget(job.session_id,job.target_strategy_id_r,true,client);
      if(!result) throw httpError(MESSAGES.RESULT_NOT_FOUND,404,'MT5_RESULT_NOT_FOUND');
    }
    await client.query('COMMIT');
    return {requestedCount:count,sequential:true,job};
  } catch(error) {
    await client.query('ROLLBACK').catch(()=>{});
    throw error;
  } finally {
    client.release();
  }
}

async function deleteJob(actor,id) {
  const job=await dao.deleteJob(id,actor);
  if(!job) throw httpError('Only pending or terminal jobs can be deleted',409,'MT5_JOB_NOT_DELETABLE');
  if(job.job_type===MT5.JOB_TYPE.EVERY_TICK) {
    await resultDao.clearBacktestPick(job.session_id,job.target_strategy_id_r);
  }
  removeJobRuntime(id); return job;
}

function workerMode(jobType) { return jobType===MT5.JOB_TYPE.OPEN_PRICE?'0':'1'; }
function workerJob(job) {
  const payload=job.job_payload||{};
  return {...payload,job_id:job.job_id,external_job_id:job.job_id,run_id:job.run_id,
    job_name:payload.job_name||job.strategy_id,bot_name:payload.bot_name||'allbot',
    mode:payload.mode??workerMode(job.job_type),max_ini:payload.max_ini||1,
    optimize_runs:payload.optimize_runs||1,filters:payload.filters||{},
    artifact_download_url:`/artifacts/jobs/${job.job_id}/download`,
    target_strategy_id_r:job.target_strategy_id_r};
}

async function claimJob(apiKey,workerName,workerInstanceId=null) {
  requireText(workerName,'worker_name',160);
  const normalizedInstanceId=workerInstanceId?requireText(workerInstanceId,'worker_instance_id',64):null;
  const claimed=await dao.claimJob({apiKey,workerName,workerInstanceId:normalizedInstanceId});
  if(claimed.invalidKey) throw httpError(MESSAGES.INVALID_API_KEY,401,'MT5_INVALID_API_KEY');
  return claimed.job?workerJob(claimed.job):null;
}

async function workerContext(apiKey,jobId,workerName=null) {
  const key=await authenticateWorker(apiKey);
  const job=await dao.getJob(jobId);
  if(!job) throw httpError(MESSAGES.JOB_NOT_FOUND,404,'MT5_JOB_NOT_FOUND');
  let worker;
  if(workerName) worker=await dao.getWorkerByName(key.user_id,workerName);
  if(!worker&&job.claimed_by_worker_id) {
    const listed=await dao.listWorkers({userId:key.user_id,isAdmin:false});
    worker=listed.find(item=>item.id===job.claimed_by_worker_id);
  }
  if(!worker||worker.id!==job.claimed_by_worker_id) throw httpError(MESSAGES.INVALID_JOB_CALLBACK,409,'MT5_STALE_CALLBACK');
  return {key,job,worker};
}

async function workerHeartbeat(apiKey,payload) {
  const workerName=requireText(payload.worker_name,'worker_name',160);
  const workerInstanceId=payload.worker_instance_id
    ? requireText(payload.worker_instance_id,'worker_instance_id',64)
    : null;
  const key=await authenticateWorker(apiKey);
  const reportedStatus=String(payload.status||'online').trim().toLowerCase();
  const status=reportedStatus==='offline'
    ? MT5.WORKER_STATUS.OFFLINE
    : reportedStatus==='busy'
      ? MT5.WORKER_STATUS.BUSY
      : reportedStatus==='draining'
        ? MT5.WORKER_STATUS.DRAINING
        : MT5.WORKER_STATUS.ONLINE;
  return dao.upsertWorker({
    ownerUserId:key.user_id,
    apiKeyId:key.id,
    workerName,
    workerInstanceId,
    status,
    capabilities:payload.capabilities||{},
  });
}

async function getWorkerStatus(apiKey,workerName) {
  const key=await authenticateWorker(apiKey);
  const worker=await dao.getWorkerByName(key.user_id,workerName);
  if(!worker) throw httpError(MESSAGES.WORKER_NOT_FOUND,404,'MT5_WORKER_NOT_FOUND');
  return worker;
}

async function getJobStatuses(apiKey,payload) {
  const key=await authenticateWorker(apiKey);
  const ids=Array.isArray(payload.external_job_ids)?payload.external_job_ids:[];
  const names=new Set(Array.isArray(payload.job_names)?payload.job_names.map(String):[]);
  const ownedWorkers=await dao.listWorkers({userId:key.user_id,isAdmin:false},{});
  const ownedWorkerIds=new Set(ownedWorkers.map((worker)=>worker.id));
  const canObserve=(job)=>job.user_id===key.user_id||ownedWorkerIds.has(job.claimed_by_worker_id);
  const jobs=[];
  for(const id of ids) {
    const job=await dao.getJob(id);
    if(job&&canObserve(job)) jobs.push({external_job_id:job.job_id,job_name:job.job_payload?.job_name,status:job.status.toLowerCase()});
  }
  if(names.size) {
    const sessions=await dao.listSessions({userId:key.user_id,isAdmin:false});
    for(const session of sessions) {
      const rows=await dao.listJobs({userId:key.user_id,isAdmin:false},{sessionId:session.id,limit:MT5.MAX_PAGE_SIZE});
      for(const job of rows) if(names.has(String(job.job_payload?.job_name))&&!jobs.some(item=>item.external_job_id===job.job_id))
        jobs.push({external_job_id:job.job_id,job_name:job.job_payload?.job_name,status:job.status.toLowerCase()});
    }
  }
  return jobs;
}

async function jobHeartbeat(apiKey,payload) {
  const jobId=payload.external_job_id||payload.job_id;
  const context=await workerContext(apiKey,jobId,payload.worker_name);
  const done=Number(payload.done_ini)||0,total=Number(payload.total_ini)||0;
  const progress=total>0?Math.min(99,Math.round(done*100/total)):0;
  const updated=await dao.updateActiveJob(jobId,payload.run_id,context.worker.id,{
    status:MT5.JOB_STATUS.RUNNING,progress,heartbeat_at:new Date(),
    lease_expires_at:new Date(Date.now()+MT5.LEASE_SECONDS*1000),
  });
  if(!updated) throw httpError(MESSAGES.INVALID_JOB_CALLBACK,409,'MT5_STALE_CALLBACK');
  return updated;
}

async function finishWorkerJob(apiKey,payload,status) {
  const jobId=payload.external_job_id||payload.job_id;
  const context=await workerContext(apiKey,jobId,payload.worker_name);
  if(status===MT5.JOB_STATUS.DONE && context.job.job_type===MT5.JOB_TYPE.OPEN_PRICE &&
    context.job.job_payload?.optimize_ingested_run_id!==payload.run_id) {
    throw httpError('Open Price results were not stored before job completion',409,'MT5_RESULTS_NOT_INGESTED');
  }
  if(status===MT5.JOB_STATUS.DONE && context.job.job_type===MT5.JOB_TYPE.EVERY_TICK &&
    context.job.job_payload?.backtest_ingested_run_id!==payload.run_id) {
    throw httpError(MESSAGES.BACKTEST_RESULTS_NOT_INGESTED,409,'MT5_BACKTEST_RESULTS_NOT_INGESTED');
  }
  const client=await dao.pool.connect();
  let job;
  try {
    await client.query('BEGIN');
    job=await dao.finishJob(jobId,payload.run_id,context.worker.id,status,payload.error||null,client);
    if(!job) throw httpError(MESSAGES.INVALID_JOB_CALLBACK,409,'MT5_STALE_CALLBACK');
    if(Number(job.job_payload?.rerun_remaining)<=0&&status!==MT5.JOB_STATUS.DONE&&job.job_type===MT5.JOB_TYPE.EVERY_TICK) {
      await resultDao.clearBacktestPick(job.session_id,job.target_strategy_id_r,client);
    }
    await client.query('COMMIT');
  } catch(error) {
    await client.query('ROLLBACK').catch(()=>{});
    throw error;
  } finally {
    client.release();
  }
  removeJobRuntime(jobId);
  let continuedJob=null;
  if(job.job_type===MT5.JOB_TYPE.EVERY_TICK&&Number(job.job_payload?.rerun_remaining)>0) {
    const continueClient=await dao.pool.connect();
    try {
      await continueClient.query('BEGIN');
      if(job.job_type===MT5.JOB_TYPE.EVERY_TICK) {
        const result=await resultDao.setBacktestPickByTarget(job.session_id,job.target_strategy_id_r,true,continueClient);
        if(!result) throw httpError(MESSAGES.RESULT_NOT_FOUND,404,'MT5_RESULT_NOT_FOUND');
      }
      continuedJob=await dao.continueRerunJob(job.job_id,continueClient);
      if(!continuedJob) throw httpError('Unable to continue rerun job',409,'MT5_RERUN_CONTINUE_FAILED');
      await continueClient.query('COMMIT');
    } catch(error) {
      await continueClient.query('ROLLBACK').catch(()=>{});
      if(job.job_type===MT5.JOB_TYPE.EVERY_TICK) {
        await resultDao.clearBacktestPick(job.session_id,job.target_strategy_id_r).catch(()=>{});
      }
      throw error;
    } finally {
      continueClient.release();
    }
  }
  await dao.insertLog({sessionId:job.session_id,userId:context.key.user_id,jobId,workerId:context.worker.id,
    level:status==='DONE'?'INFO':'ERROR',eventType:`JOB_${status}`,message:`MT5 job ${status.toLowerCase()}`,
    context:{attempt_count:job.attempt_count,error:payload.error||null,rerun_continued:Boolean(continuedJob),
      rerun_index:job.job_payload?.rerun_index||null,rerun_total:job.job_payload?.rerun_total||null}});
  await notificationService.notifyMt5JobFinished({
    userId: context.job.user_id,
    jobId,
    jobType: context.job.job_type,
    strategyId: context.job.strategy_id,
    jobName: context.job.job_payload?.job_name,
    status,
    error: payload.error || null,
  });
  return job;
}

function runtimeDir(jobId,...parts) { return path.join(uploadRoot,String(jobId),...parts); }
function ensureRuntimeDir(jobId,...parts) { const dir=runtimeDir(jobId,...parts);fs.mkdirSync(dir,{recursive:true});return dir; }
function removeJobRuntime(jobId) {
  try {
    const target=runtimeDir(jobId);
    if(!fs.existsSync(target)) return false;
    fs.rmSync(target,{recursive:true,force:true});
    return true;
  } catch(error) {
    console.warn(`[mt5] runtime cleanup failed job=${jobId}: ${error.message}`);
    return false;
  }
}

async function sweepRuntimeDirectories() {
  if(!fs.existsSync(uploadRoot)) return {scanned:0,removed:0,kept:0,failed:0};
  const entries=fs.readdirSync(uploadRoot,{withFileTypes:true}).filter(entry=>entry.isDirectory());
  if(!entries.length) return {scanned:0,removed:0,kept:0,failed:0};
  const states=new Map();
  const names=entries.map(entry=>entry.name);
  for(let offset=0;offset<names.length;offset+=1000) {
    const rows=await dao.getJobRuntimeStates(names.slice(offset,offset+1000));
    for(const row of rows) states.set(String(row.job_id),row);
  }
  const activeStatuses=new Set([MT5.JOB_STATUS.CLAIMED,MT5.JOB_STATUS.RUNNING]);
  const cutoff=Date.now()-MT5.RUNTIME_ORPHAN_GRACE_MS;
  let removed=0,kept=0,failed=0;
  for(const entry of entries) {
    const state=states.get(entry.name);
    if(state&&activeStatuses.has(state.status)) { kept+=1;continue; }
    const target=runtimeDir(entry.name);
    try {
      const before=fs.statSync(target);
      if(before.mtimeMs>cutoff) { kept+=1;continue; }
      const after=fs.statSync(target);
      if(after.mtimeMs!==before.mtimeMs) { kept+=1;continue; }
      if(removeJobRuntime(entry.name)) removed+=1;
      else failed+=1;
    } catch(error) {
      if(error.code!=='ENOENT') {
        failed+=1;
        console.warn(`[mt5] runtime sweep skipped job=${entry.name}: ${error.message}`);
      }
    }
  }
  if(removed||failed) console.log(`[mt5] runtime sweep scanned=${entries.length} removed=${removed} kept=${kept} failed=${failed}`);
  return {scanned:entries.length,removed,kept,failed};
}

async function convertEveryTickArtifact(job, sourcePath) {
  if (job.job_type !== MT5.JOB_TYPE.EVERY_TICK) return null;
  const sourceExtension = path.extname(sourcePath).toLowerCase();
  const outputFilename = formatStrategyFilename(job.strategy_id, null, '.xlsx') || `${job.strategy_id}.xlsx`;
  const outputPath = path.join(ensureRuntimeDir(job.job_id, 'artifacts'), path.basename(outputFilename));

  if (sourceExtension === '.xlsx') {
    if (path.resolve(sourcePath) !== path.resolve(outputPath)) fs.copyFileSync(sourcePath, outputPath);
    return { path: outputPath, filename: outputFilename };
  }

  const reports = [];
  const images = [];
  if (sourceExtension === '.zip') {
    const archive = new AdmZip(sourcePath);
    let imageBytes = 0;
    for (const entry of archive.getEntries()) {
      if (entry.isDirectory) continue;
      const entryName = String(entry.entryName || '');
      const entryExtension = path.extname(entryName).toLowerCase();
      const entrySize = Number(entry.header?.size || 0);
      if (['.htm', '.html', '.xml'].includes(entryExtension) && entrySize <= 100 * 1024 * 1024) {
        reports.push({ name: entryName, buffer: entry.getData() });
      } else if (entryExtension === '.png' && entrySize <= 25 * 1024 * 1024 && imageBytes + entrySize <= 100 * 1024 * 1024) {
        images.push({ name: entryName, buffer: entry.getData() });
        imageBytes += entrySize;
      }
    }
    reports.sort((left, right) => {
      const leftHtml = /\.html?$/i.test(left.name) ? 0 : 1;
      const rightHtml = /\.html?$/i.test(right.name) ? 0 : 1;
      return leftHtml - rightHtml || left.name.localeCompare(right.name);
    });
  } else if (['.htm', '.html', '.xml'].includes(sourceExtension)) {
    reports.push({ name: path.basename(sourcePath), buffer: fs.readFileSync(sourcePath) });
  }

  let lastError = null;
  for (const report of reports) {
    try {
      const workbook = await convertMt5HtmlToXlsxBuffer(report.buffer, images);
      fs.writeFileSync(outputPath, workbook);
      console.log(`[mt5] converted Every Tick report to XLSX job=${job.job_id} source=${report.name} output=${outputFilename}`);
      return { path: outputPath, filename: outputFilename };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    console.warn(`[mt5] full Every Tick report conversion failed job=${job.job_id}: ${lastError.message}`);
  } else {
    console.warn(`[mt5] no convertible Every Tick report found job=${job.job_id} artifact=${path.basename(sourcePath)}`);
  }
  return null;
}

async function getInputArtifact(apiKey,jobId) {
  const key=await authenticateWorker(apiKey); const job=await dao.getJob(jobId);
  if(!job) throw httpError(MESSAGES.JOB_NOT_FOUND,404);
  const worker=await dao.listWorkers({userId:key.user_id,isAdmin:false});
  if(!worker.some(item=>item.id===job.claimed_by_worker_id)) throw httpError('Forbidden',403);
  return {filename:`${job.strategy_id||job.job_id}.ini`,content:job.ini_content};
}

async function saveArtifact(apiKey,jobId,runId,filename,buffer) {
  const context=await workerContext(apiKey,jobId);
  if(runId&&String(context.job.run_id)!==String(runId)) throw httpError(MESSAGES.INVALID_JOB_CALLBACK,409);
  const clean=path.basename(filename||'result.bin'); const dir=ensureRuntimeDir(jobId,'artifacts');
  const target=path.join(dir,clean); fs.writeFileSync(target,buffer);
  return await convertEveryTickArtifact(context.job,target) || {path:target,filename:clean};
}

async function saveArtifactChunk(apiKey,jobId,query,buffer) {
  const context=await workerContext(apiKey,jobId);
  if(query.run_id&&String(context.job.run_id)!==String(query.run_id)) throw httpError(MESSAGES.INVALID_JOB_CALLBACK,409);
  const uploadId=path.basename(requireText(query.upload_id,'upload_id',255));
  const chunkIndex=Number(query.chunk_index),totalChunks=Number(query.total_chunks);
  if(!Number.isInteger(chunkIndex)||!Number.isInteger(totalChunks)||chunkIndex<1||chunkIndex>totalChunks)
    throw httpError('Invalid artifact chunk');
  const dir=ensureRuntimeDir(jobId,'artifact_chunks',uploadId);
  fs.writeFileSync(path.join(dir,`${chunkIndex}.part`),buffer);
  if(chunkIndex!==totalChunks) return {complete:false,chunk_index:chunkIndex};
  const targetDir=ensureRuntimeDir(jobId,'artifacts');
  const filename=path.basename(query.filename||'result.bin');
  const target=path.join(targetDir,filename);const descriptor=fs.openSync(target,'w');
  try { for(let index=1;index<=totalChunks;index++) fs.writeSync(descriptor,fs.readFileSync(path.join(dir,`${index}.part`))); }
  finally { fs.closeSync(descriptor); }
  fs.rmSync(dir,{recursive:true,force:true});
  const converted=await convertEveryTickArtifact(context.job,target);
  return {complete:true,filename:converted?.filename||filename,path:converted?.path||target,result_artifact_relpath:`/jobs/${jobId}/artifacts/result/download`};
}

async function getResultArtifact(apiKey,jobId) {
  await workerContext(apiKey,jobId);
  const dir=runtimeDir(jobId,'artifacts');
  if(!fs.existsSync(dir)) return null;
  const names=fs.readdirSync(dir).filter(name=>fs.statSync(path.join(dir,name)).isFile())
    .sort((left,right)=>Number(!/\.xlsx$/i.test(left))-Number(!/\.xlsx$/i.test(right))||left.localeCompare(right));
  if(!names.length) return null;
  const filename=names[0];return {filename,path:path.join(dir,filename)};
}

function uploadDir(jobId,uploadId) { return ensureRuntimeDir(jobId,'optimize',path.basename(uploadId)); }
async function startOptimizeUpload(apiKey,jobId,payload) {
  const context=await workerContext(apiKey,jobId);
  if(String(context.job.run_id)!==String(payload.run_id)) throw httpError(MESSAGES.INVALID_JOB_CALLBACK,409);
  const dir=uploadDir(jobId,requireText(payload.upload_id,'upload_id',255));
  fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({totalChunks:Number(payload.total_chunks),runId:payload.run_id}));
  return {upload_id:payload.upload_id};
}

async function saveOptimizeChunk(apiKey,jobId,payload) {
  const context=await workerContext(apiKey,jobId);
  if(payload.run_id&&String(context.job.run_id)!==String(payload.run_id))
    throw httpError(MESSAGES.INVALID_JOB_CALLBACK,409,'MT5_STALE_CALLBACK');
  const rows=Array.isArray(payload.rows)?payload.rows:[];
  if(rows.length>MT5.UPLOAD_CHUNK_LIMIT) throw httpError('Optimize chunk is too large',413);
  const dir=uploadDir(jobId,requireText(payload.upload_id,'upload_id',255));
  const index=Number(payload.chunk_index);
  if(!Number.isInteger(index)||index<1) throw httpError('Invalid chunk_index');
  const temp=path.join(dir,`${index}.json.tmp`),target=path.join(dir,`${index}.json`);
  fs.writeFileSync(temp,JSON.stringify(rows));fs.renameSync(temp,target);
  return {chunk_index:index,rows:rows.length};
}

function numberValue(value) {
  if(value===null||value===undefined||value==='') return 0;
  const parsed=Number(String(value).replace(/[%,$ ]/g,'').replace(/,/g,'')); return Number.isFinite(parsed)?parsed:0;
}
function optimizeMetricValue(metrics, keys) {
  for(const key of keys) {
    if(metrics[key]!==undefined&&metrics[key]!==null&&metrics[key]!=='') return numberValue(metrics[key]);
  }
  return 0;
}
function canonicalOpenPrice(row,job) {
  const metrics={},inputs={};
  for(const [key,value] of Object.entries(row||{})) {
    if(internalRowKeys.has(key)) continue;
    if(optimizeMetricKeys.has(key)) metrics[key]=value;
    else inputs[key]=value;
  }
  if(!Object.keys(metrics).length||Object.values(metrics).every(value=>numberValue(value)===0)) return null;
  const summaryOp={pass:row.Pass??row.pass??null,inputs,metrics,template_ini:job.ini_content,
    bot_name:job.job_payload?.bot_name||'allbot'};
  return {
    summary_op:summaryOp,
    result_value:optimizeMetricValue(metrics,['Result','result']),
    profit:optimizeMetricValue(metrics,['Profit','profit','Net Profit']),
    expected_payoff:optimizeMetricValue(metrics,['Expected Payoff','expected_payoff']),
    trades:Math.trunc(optimizeMetricValue(metrics,['Trades','trades','Total Trades'])),
    profit_factor:optimizeMetricValue(metrics,['Profit Factor','profit_factor']),
    recovery_factor:optimizeMetricValue(metrics,['Recovery Factor','recovery_factor']),
    equity_dd_percent:optimizeMetricValue(metrics,['Equity DD %','Balance DD %','Drawdown %']),
    sharpe_ratio:optimizeMetricValue(metrics,['Sharpe Ratio','sharpe_ratio']),
    pd_ratio:optimizeMetricValue(metrics,['P/D','pd_ratio','Recovery Factor']),
  };
}

async function finalizeOptimizeUpload(apiKey,jobId,payload) {
  const context=await workerContext(apiKey,jobId);
  if(String(context.job.run_id)!==String(payload.run_id)) throw httpError(MESSAGES.INVALID_JOB_CALLBACK,409);
  const already=context.job.job_payload?.optimize_ingested_run_id;
  if(already===payload.run_id) return {stored_count:Number(context.job.job_payload.optimize_stored_count)||0,idempotent:true};
  const dir=uploadDir(jobId,requireText(payload.upload_id,'upload_id',255));
  const total=Number(payload.total_chunks);
  for(let index=1;index<=total;index++) {
    const file=path.join(dir,`${index}.json`);if(!fs.existsSync(file)) throw httpError(`Missing optimize chunk ${index}`,409);
  }
  let receivedCount=0,storedCount=0;
  const client=await dao.pool.connect();
  try {
    await client.query('BEGIN');
    const locked=(await client.query(
      `SELECT * FROM mt5_job_queue WHERE job_id=$1 AND run_id=$2 AND status IN ('CLAIMED','RUNNING') FOR UPDATE`,
      [jobId,payload.run_id])).rows[0];
    if(!locked) throw httpError(MESSAGES.INVALID_JOB_CALLBACK,409,'MT5_STALE_CALLBACK');
    if(locked.job_payload?.optimize_ingested_run_id===payload.run_id) { await client.query('COMMIT'); return {stored_count:locked.job_payload.optimize_stored_count,idempotent:true}; }
    const normalizedStrategyId=normalizeStrategyId(locked.strategy_id);
    if(normalizedStrategyId!==locked.strategy_id) {
      await client.query(`UPDATE mt5_job_queue SET strategy_id=$2 WHERE job_id=$1`,[jobId,normalizedStrategyId]);
      locked.strategy_id=normalizedStrategyId;
    }
    const strategyExisted=await dao.lockOptimizeStrategy(client,locked.session_id,locked.strategy_id);
    for(let index=1;index<=total;index++) {
      const rows=JSON.parse(fs.readFileSync(path.join(dir,`${index}.json`),'utf8'));
      receivedCount+=rows.length;
      const summaries=rows.map(row=>canonicalOpenPrice(row,locked)).filter(Boolean);
      const inserted=await dao.insertOptimizeResults(client,locked,summaries);
      storedCount+=inserted.storedCount;
    }
    if(storedCount>0) {
      await dao.finalizeOptimizeIngest(client,locked,{storedCount,strategyExisted});
    }
    await client.query(
      `UPDATE mt5_job_queue SET job_payload=job_payload || $2::jsonb WHERE job_id=$1`,
      [jobId,JSON.stringify({optimize_ingested_run_id:payload.run_id,optimize_stored_count:storedCount})]);
    await client.query('COMMIT');
  } catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;} finally{client.release();}
  fs.rmSync(dir,{recursive:true,force:true});
  await dao.insertLog({sessionId:context.job.session_id,userId:context.key.user_id,jobId,workerId:context.worker.id,
    eventType:'OPEN_PRICE_INGESTED',message:'Open Price results stored',context:{received:receivedCount,stored:storedCount,skipped_all_zero:receivedCount-storedCount}});
  return {stored_count:storedCount,skipped_all_zero:receivedCount-storedCount};
}

async function saveLegacyOptimizeChunk(apiKey,jobId,payload) {
  const uploadId=`legacy_${path.basename(String(payload.run_id||'run'))}`;
  if(Number(payload.chunk_index)===1) await startOptimizeUpload(apiKey,jobId,{...payload,upload_id:uploadId});
  const saved=await saveOptimizeChunk(apiKey,jobId,{...payload,upload_id:uploadId});
  if(Number(payload.chunk_index)===Number(payload.total_chunks))
    return finalizeOptimizeUpload(apiKey,jobId,{...payload,upload_id:uploadId});
  return saved;
}

function normalizeBacktestPayload(payload) {
  const settings=payload.settings||payload.params_json;
  const results=payload.results||payload.results_json;
  const deals=payload.deals||payload.deals_json;
  const populated=value=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length>0;
  if(!populated(settings)||!populated(results)||!Array.isArray(deals)||!deals.length)
    throw httpError(MESSAGES.EMPTY_BACKTEST_RESULT,422,'MT5_BACKTEST_NO_DATA');
  return {summaryBt:{settings,results},deals};
}

function writeBacktestXlsxArtifact(job, summaryBt, deals) {
  const rows = [['Settings']];
  for (const [key, value] of Object.entries(summaryBt.settings || {})) rows.push([key, value]);
  rows.push([], ['Results']);
  for (const [key, value] of Object.entries(summaryBt.results || {})) rows.push([key, value]);
  rows.push([], ['Deals']);
  const dealKeys = [...new Set(deals.flatMap((deal) => Object.keys(deal || {})))];
  rows.push(dealKeys);
  for (const deal of deals) rows.push(dealKeys.map((key) => deal?.[key] ?? ''));
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
  const filename = formatStrategyFilename(job.strategy_id, null, '.xlsx') || `${job.strategy_id}.xlsx`;
  const target = path.join(ensureRuntimeDir(job.job_id, 'artifacts'), path.basename(filename));
  XLSX.writeFile(workbook, target, { compression: true });
  return target;
}

function backtestMetricValue(results, keys) {
  for (const key of keys) {
    if (results?.[key] === undefined || results[key] === null || results[key] === '') continue;
    return numberValue(results[key]);
  }
  return 0;
}

function pick(source, keys) {
  for (const key of keys) {
    if (source?.[key] !== undefined && source[key] !== null) return source[key];
  }
  return null;
}

function nullablePick(source, keys) {
  const value = pick(source, keys);
  return typeof value === 'string' && value.trim() === '' ? null : value;
}

function numericPick(source, keys, fallback = null) {
  const value = nullablePick(source, keys);
  if (value === null) return fallback;
  return parseVolume(value) ?? fallback;
}

function integerPick(source, keys) {
  const value = nullablePick(source, keys);
  if (value === null) return null;
  const normalized = String(value).replace(/[\s,]/g, '');
  return /^[-+]?\d+$/.test(normalized) ? normalized : null;
}

function metadataTimeframe(settings, strategyId) {
  const period = nullablePick(settings, ['Period', 'period']);
  if (period !== null) {
    const pattern = new RegExp(`(?:^|[^A-Z0-9])(${TIMEFRAMES.join('|')})(?=[^A-Z0-9]|$)`, 'i');
    const matched = String(period).match(pattern)?.[1];
    if (matched) return matched.toUpperCase();
  }
  return parseStrategyName(strategyId).timeframe || null;
}

function metadataDate(settings, position) {
  const directKeys = position === 0 ? ['From', 'period_start', 'from'] : ['To', 'period_end', 'to'];
  const direct = nullablePick(settings, directKeys);
  if (direct !== null) return String(direct).replace(/\./g, '-');
  const period = String(nullablePick(settings, ['Period', 'period']) || '');
  const dates = period.match(/\d{4}[.-]\d{2}[.-]\d{2}/g) || [];
  return dates[position] ? dates[position].replace(/\./g, '-') : null;
}

function normalizeStrategySettings(rawSettings, strategyId) {
  const settings = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
  const periodText = nullablePick(settings, ['Period', 'period']);
  const dateRange = nullablePick(settings, ['Date Range', 'dateRange', 'date_range']) ||
    String(periodText || '').match(/\(([^)]+)\)/)?.[1]?.trim() || null;
  const reservedKeys = new Set([
    'Expert', 'expert', 'Symbol', 'symbol', 'Period', 'period', 'Date Range', 'dateRange', 'date_range',
    'Company', 'company', 'Currency', 'currency', 'Initial Deposit', 'initialDeposit', 'initial_deposit',
    'Leverage', 'leverage', 'From', 'from', 'period_start', 'To', 'to', 'period_end', 'inputs',
  ]);
  const inputs = settings.inputs && typeof settings.inputs === 'object' ? { ...settings.inputs } : {};
  for (const [key, value] of Object.entries(settings)) {
    if (!reservedKeys.has(key)) inputs[key] = value;
  }
  return {
    expert: nullablePick(settings, ['Expert', 'expert']),
    symbol: nullablePick(settings, ['Symbol', 'symbol']),
    period: metadataTimeframe(settings, strategyId),
    dateRange,
    inputs,
    company: nullablePick(settings, ['Company', 'company']),
    currency: nullablePick(settings, ['Currency', 'currency']),
    initialDeposit: numericPick(settings, ['Initial Deposit', 'initialDeposit', 'initial_deposit']),
    leverage: nullablePick(settings, ['Leverage', 'leverage']),
  };
}

const STRATEGY_RESULT_FIELDS = {
  historyQuality: ['History Quality', 'historyQuality'],
  bars: ['Bars', 'bars'], ticks: ['Ticks', 'ticks'], symbols: ['Symbols', 'symbols'],
  totalNetProfit: ['Total Net Profit', 'Profit', 'totalNetProfit', 'total_net_profit'],
  grossProfit: ['Gross Profit', 'grossProfit'], grossLoss: ['Gross Loss', 'grossLoss'],
  balanceDrawdownAbsolute: ['Balance Drawdown Absolute', 'balanceDrawdownAbsolute'],
  equityDrawdownAbsolute: ['Equity Drawdown Absolute', 'equityDrawdownAbsolute'],
  balanceDrawdownMaximal: ['Balance Drawdown Maximal', 'balanceDrawdownMaximal'],
  equityDrawdownMaximal: ['Equity Drawdown Maximal', 'equityDrawdownMaximal'],
  balanceDrawdownRelative: ['Balance Drawdown Relative', 'balanceDrawdownRelative'],
  equityDrawdownRelative: ['Equity Drawdown Relative', 'equityDrawdownRelative'],
  profitFactor: ['Profit Factor', 'profitFactor'], expectedPayoff: ['Expected Payoff', 'expectedPayoff'],
  marginLevel: ['Margin Level', 'marginLevel'], recoveryFactor: ['Recovery Factor', 'recoveryFactor'],
  sharpeRatio: ['Sharpe Ratio', 'sharpeRatio'], zScore: ['Z-Score', 'zScore'],
  onTesterResult: ['OnTester result', 'onTesterResult'], ahpr: ['AHPR', 'ahpr'], ghpr: ['GHPR', 'ghpr'],
  lrCorrelation: ['LR Correlation', 'lrCorrelation'], lrStandardError: ['LR Standard Error', 'lrStandardError'],
  correlationProfitsMFE: ['Correlation (Profits,MFE)', 'correlationProfitsMFE'],
  correlationProfitsMAE: ['Correlation (Profits,MAE)', 'correlationProfitsMAE'],
  correlationMFEMAE: ['Correlation (MFE,MAE)', 'correlationMFEMAE'],
  minPositionHoldingTime: ['Minimal position holding time', 'minPositionHoldingTime'],
  maxPositionHoldingTime: ['Maximal position holding time', 'maxPositionHoldingTime'],
  avgPositionHoldingTime: ['Average position holding time', 'avgPositionHoldingTime'],
  totalTrades: ['Total Trades', 'Trades', 'totalTrades'], totalDeals: ['Total Deals', 'totalDeals'],
  shortTrades: ['Short Trades (won %)', 'shortTrades'], longTrades: ['Long Trades (won %)', 'longTrades'],
  profitTrades: ['Profit Trades (% of total)', 'profitTrades'], lossTrades: ['Loss Trades (% of total)', 'lossTrades'],
  largestProfitTrade: ['Largest Profit Trade', 'largestProfitTrade'], largestLossTrade: ['Largest Loss Trade', 'largestLossTrade'],
  averageProfitTrade: ['Average profit trade', 'averageProfitTrade'], averageLossTrade: ['Average loss trade', 'averageLossTrade'],
  maxConsecutiveWins: ['Maximum consecutive wins ($)', 'maxConsecutiveWins'],
  maxConsecutiveLosses: ['Maximum consecutive losses ($)', 'maxConsecutiveLosses'],
  maximalConsecutiveProfitCount: ['Maximal consecutive profit (count)', 'maximalConsecutiveProfitCount'],
  maximalConsecutiveLossCount: ['Maximal consecutive loss (count)', 'maximalConsecutiveLossCount'],
  avgConsecutiveWins: ['Average consecutive wins', 'avgConsecutiveWins'],
  avgConsecutiveLosses: ['Average consecutive losses', 'avgConsecutiveLosses'],
};

function normalizeStrategyResults(rawResults) {
  const results = rawResults && typeof rawResults === 'object' ? rawResults : {};
  return Object.fromEntries(
    Object.entries(STRATEGY_RESULT_FIELDS).map(([key, aliases]) => [key, nullablePick(results, aliases)]),
  );
}

function extractBacktestMetrics(summaryBt) {
  const results = summaryBt.results || {};
  const drawdownRaw = String(
    results['Balance Drawdown Maximal'] ??
    results.balanceDrawdownMaximal ??
    results['Balance DD'] ??
    results.balance_drawdown ??
    ''
  );
  const amountText = drawdownRaw.split('(')[0];
  const percentageMatch = drawdownRaw.match(/\((-?[0-9.,]+)%\)/) || drawdownRaw.match(/(-?[0-9.,]+)%/);
  const netProfit = backtestMetricValue(results, ['Profit','profit','Total Net Profit','totalNetProfit','total_net_profit']);
  const balanceDrawdownValue = Math.abs(numberValue(amountText));
  const balanceDrawdownPercent = percentageMatch
    ? Number(percentageMatch[1].replace(',', '.')) || 0
    : backtestMetricValue(results, ['Balance Drawdown %','balance_drawdown_percent']);
  return {
    netProfit,
    totalTrades: Math.max(0, Math.trunc(backtestMetricValue(results, ['Trades','Total Trades','totalTrades','total_trades']))),
    balanceDrawdownPercent,
    balanceDrawdownValue,
    profitFactor: backtestMetricValue(results, ['Profit Factor','profitFactor','profit_factor']),
    recoveryFactor: backtestMetricValue(results, ['Recovery Factor','recoveryFactor','recovery_factor']),
    sharpeRatio: backtestMetricValue(results, ['Sharpe Ratio','sharpeRatio','sharpe_ratio']),
    pdRatio: balanceDrawdownValue > 0 ? netProfit / balanceDrawdownValue : 0,
    largestLossTrade: backtestMetricValue(results, ['Largest Loss Trade','largestLossTrade','largest_loss_trade']),
    expectedPayoff: backtestMetricValue(results, ['Expected Payoff','expectedPayoff','expected_payoff']),
  };
}

async function saveBacktestResult(apiKey,jobId,payload) {
  const context=await workerContext(apiKey,jobId);
  const normalized=normalizeBacktestPayload(payload);
  const metrics=extractBacktestMetrics(normalized.summaryBt);
  const result=await resultDao.saveBacktestCandidate(
    jobId,payload.run_id,context.worker.id,normalized.summaryBt,normalized.deals,metrics,
  );
  if(!result) throw httpError(MESSAGES.INVALID_JOB_CALLBACK,409,'MT5_STALE_CALLBACK');
  writeBacktestXlsxArtifact(context.job, normalized.summaryBt, normalized.deals);
  return result;
}

function parseRangeFilter(combined, explicitMin, explicitMax) {
  let min = explicitMin !== undefined && explicitMin !== null && explicitMin !== '' ? Number(explicitMin) : null;
  let max = explicitMax !== undefined && explicitMax !== null && explicitMax !== '' ? Number(explicitMax) : null;
  if (combined !== undefined && combined !== null && combined !== '' && min === null && max === null) {
    const match = String(combined).trim().match(/^\s*(-?\d+(?:\.\d+)?)?\s*-\s*(-?\d+(?:\.\d+)?)?\s*$/);
    if (match) {
      min = match[1] === undefined ? null : Number(match[1]);
      max = match[2] === undefined ? null : Number(match[2]);
    } else {
      const value = Number(combined);
      min = Number.isFinite(value) ? value : null;
    }
  }
  return { min: Number.isFinite(min) ? min : null, max: Number.isFinite(max) ? max : null };
}

function parseMt5DealTime(value) {
  const normalized = String(value || '').trim().replace(/^(\d{4})\.(\d{2})\.(\d{2})\s+/, '$1-$2-$3T');
  const timestamp = Date.parse(normalized.endsWith('Z') ? normalized : `${normalized}Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function candidateRangeCoversFullPeriod(row, startDate, endDate) {
  const fromTime = Date.parse(`${startDate}T00:00:00.000Z`);
  const toTime = Date.parse(`${endDate}T23:59:59.999Z`);
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) return false;

  let firstDealTime = Infinity;
  let lastDealTime = -Infinity;
  for (const deal of Array.isArray(row.deals) ? row.deals : []) {
    const type = String(deal?.type ?? deal?.Type ?? '').trim().toLowerCase();
    if (['balance', 'credit', 'deposit', 'withdrawal'].includes(type)) continue;
    const timestamp = parseMt5DealTime(deal?.time ?? deal?.Time ?? deal?.date);
    if (timestamp === null) continue;
    firstDealTime = Math.min(firstDealTime, timestamp);
    lastDealTime = Math.max(lastDealTime, timestamp);
  }

  return Number.isFinite(firstDealTime)
    && fromTime <= firstDealTime
    && toTime >= lastDealTime;
}

function storedCandidateMetrics(row) {
  const metrics = extractBacktestMetrics({ results: row.backtest_results || {} });
  return {
    profit: metrics.netProfit,
    trades: metrics.totalTrades,
    profitFactor: metrics.profitFactor,
    recoveryFactor: metrics.recoveryFactor,
    sharpeRatio: metrics.sharpeRatio,
    balanceDrawdownAmount: metrics.balanceDrawdownValue,
    balanceDrawdownPercent: metrics.balanceDrawdownPercent,
    pdRatio: metrics.pdRatio,
    largestLossTrade: Math.abs(metrics.largestLossTrade),
  };
}

function calculateDateRangeMetrics(row, startDate, endDate) {
  const fromTime = Date.parse(`${startDate}T00:00:00.000Z`);
  const toTime = Date.parse(`${endDate}T23:59:59.999Z`);
  const deals = Array.isArray(row.deals) ? row.deals : [];
  const settings = row.backtest_settings || {};
  let initialBalance = Number(settings['Initial Deposit'] ?? settings.initialDeposit ?? settings.initial_deposit) || 0;
  if (initialBalance <= 0) {
    const deposit = deals.find((deal) => ['balance', 'credit', 'deposit'].includes(String(deal?.type ?? deal?.Type ?? '').toLowerCase()));
    initialBalance = Number(deposit?.profit ?? deposit?.Profit) || 0;
  }
  const tradingDeals = deals
    .filter((deal) => {
      const type = String(deal?.type ?? deal?.Type ?? '').trim().toLowerCase();
      if (['balance', 'credit', 'deposit', 'withdrawal'].includes(type)) return false;
      const timestamp = parseMt5DealTime(deal?.time ?? deal?.Time ?? deal?.date);
      return timestamp !== null;
    })
    .sort((left, right) => parseMt5DealTime(left?.time ?? left?.Time) - parseMt5DealTime(right?.time ?? right?.Time));
  const tradePairs = [];
  const openDeals = [];
  for (const deal of tradingDeals) {
    const direction = String(deal?.direction ?? deal?.Direction ?? '').trim().toLowerCase();
    if (direction === 'in') {
      openDeals.push(deal);
    } else if (direction === 'out' && openDeals.length) {
      tradePairs.push([openDeals.shift(), deal]);
    }
  }
  if (!tradePairs.length && tradingDeals.length >= 2) {
    for (let index = 0; index + 1 < tradingDeals.length; index += 2) {
      tradePairs.push([tradingDeals[index], tradingDeals[index + 1]]);
    }
  }
  const selectedPairs = tradePairs.filter((pair) => {
    const openingDeal = pair.find((deal) => String(deal?.direction ?? deal?.Direction ?? '').toLowerCase() === 'in') || pair[0];
    const closingDeal = pair.find((deal) => String(deal?.direction ?? deal?.Direction ?? '').toLowerCase() === 'out') || pair[pair.length - 1];
    const openingTime = parseMt5DealTime(openingDeal?.time ?? openingDeal?.Time ?? openingDeal?.date);
    const closingTime = parseMt5DealTime(closingDeal?.time ?? closingDeal?.Time ?? closingDeal?.date);
    return openingTime !== null && closingTime !== null && openingTime >= fromTime && closingTime <= toTime;
  });
  if (!selectedPairs.length) return null;
  const selectedDeals = selectedPairs.flat();

  let netProfit = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let largestLoss = 0;
  let balance = initialBalance;
  let peakBalance = initialBalance;
  let maxDrawdownAmount = 0;
  let maxDrawdownPercent = 0;
  const dailyProfit = new Map();
  for (const deal of selectedDeals) {
    const profit = Number(deal?.profit ?? deal?.Profit) || 0;
    const commission = Number(deal?.commission ?? deal?.Commission) || 0;
    const swap = Number(deal?.swap ?? deal?.Swap) || 0;
    const pnl = profit + commission + swap;
    netProfit += pnl;
    if (pnl > 0) grossProfit += pnl;
    if (pnl < 0) {
      grossLoss += Math.abs(pnl);
      largestLoss = Math.max(largestLoss, Math.abs(pnl));
    }
    balance += pnl;
    peakBalance = Math.max(peakBalance, balance);
    const drawdown = peakBalance - balance;
    maxDrawdownAmount = Math.max(maxDrawdownAmount, drawdown);
    if (peakBalance > 0) maxDrawdownPercent = Math.max(maxDrawdownPercent, (drawdown / peakBalance) * 100);
    const timestamp = parseMt5DealTime(deal?.time ?? deal?.Time ?? deal?.date);
    const day = new Date(timestamp).toISOString().slice(0, 10);
    dailyProfit.set(day, (dailyProfit.get(day) || 0) + pnl);
  }

  const dailyValues = [...dailyProfit.values()];
  let sharpe = 0;
  if (dailyValues.length > 1) {
    const mean = dailyValues.reduce((sum, value) => sum + value, 0) / dailyValues.length;
    const variance = dailyValues.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (dailyValues.length - 1);
    const deviation = Math.sqrt(variance);
    if (deviation > 0) sharpe = (mean / deviation) * Math.sqrt(252);
  }
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999.99 : 0;
  const recovery = maxDrawdownAmount > 0 ? netProfit / maxDrawdownAmount : netProfit > 0 ? 999.99 : 0;
  return {
    profit: netProfit,
    trades: selectedPairs.length,
    profitFactor,
    recoveryFactor: recovery,
    sharpeRatio: sharpe,
    balanceDrawdownAmount: maxDrawdownAmount,
    balanceDrawdownPercent: initialBalance > 0 ? maxDrawdownPercent : 0,
    pdRatio: recovery,
    largestLossTrade: largestLoss,
  };
}

function matchesDateRangeFilters(metrics, filters) {
  const checks = [
    [metrics.profit, parseRangeFilter(filters.minProfit, filters.minProfit, filters.maxProfit)],
    [metrics.recoveryFactor, parseRangeFilter(filters.minRecoveryFactor, filters.minRecoveryFactor, filters.maxRecoveryFactor)],
    [metrics.trades, parseRangeFilter(filters.trades, filters.minTrades, filters.maxTrades)],
    [metrics.profitFactor, parseRangeFilter(filters.profitFactor, filters.minProfitFactor, filters.maxProfitFactor)],
    [metrics.balanceDrawdownPercent, parseRangeFilter(filters.balanceDD, filters.minBalanceDD, filters.maxBalanceDD)],
    [metrics.pdRatio, parseRangeFilter(filters.pdRatio, filters.minPdRatio, filters.maxPdRatio)],
    [metrics.sharpeRatio, parseRangeFilter(filters.sharpeRatio, filters.minSharpeRatio, filters.maxSharpeRatio)],
    [metrics.largestLossTrade, parseRangeFilter(filters.largestLossTrade, filters.minLargestLossTrade, filters.maxLargestLossTrade)],
  ];
  return checks.every(([value, range]) =>
    (range.min === null || value >= range.min) && (range.max === null || value <= range.max));
}

function applyDateRangeMetrics(row, metrics) {
  return {
    ...row,
    deals: undefined,
    backtest_results: {
      ...(row.backtest_results || {}),
      Profit: Number(metrics.profit.toFixed(2)),
      Trades: metrics.trades,
      'Profit Factor': Number(metrics.profitFactor.toFixed(6)),
      'Recovery Factor': Number(metrics.recoveryFactor.toFixed(6)),
      'Sharpe Ratio': Number(metrics.sharpeRatio.toFixed(6)),
      'Balance Drawdown Maximal': `${metrics.balanceDrawdownAmount.toFixed(2)} (${metrics.balanceDrawdownPercent.toFixed(2)}%)`,
      'Largest Loss Trade': -Number(metrics.largestLossTrade.toFixed(2)),
      'P/D': Number(metrics.pdRatio.toFixed(6)),
    },
    date_range_metrics: true,
  };
}

function resolveCandidateDateRange(row, startDate, endDate) {
  if (candidateRangeCoversFullPeriod(row, startDate, endDate)) {
    return { metrics: storedCandidateMetrics(row), row };
  }
  const metrics = calculateDateRangeMetrics(row, startDate, endDate);
  return metrics ? { metrics, row: applyDateRangeMetrics(row, metrics) } : null;
}

function buildBalanceSparkline(source, startDate, endDate) {
  const deals = Array.isArray(source?.deals) ? source.deals : [];
  const settings = source?.settings || {};
  const fromTime = startDate ? Date.parse(`${startDate}T00:00:00.000Z`) : null;
  const toTime = endDate ? Date.parse(`${endDate}T23:59:59.999Z`) : null;
  const deposit = deals.find((deal) => ['balance', 'credit', 'deposit'].includes(String(deal?.type ?? deal?.Type ?? '').toLowerCase()));
  let balance = Number(settings['Initial Deposit'] ?? settings.initialDeposit ?? settings.initial_deposit) ||
    Number(deposit?.profit ?? deposit?.Profit ?? deposit?.balance ?? deposit?.Balance) || 0;
  const points = [];
  const tradingDeals = deals
    .map((deal) => ({ deal, timestamp: parseMt5DealTime(deal?.time ?? deal?.Time ?? deal?.date) }))
    .filter(({ deal, timestamp }) => {
      const type = String(deal?.type ?? deal?.Type ?? '').trim().toLowerCase();
      return timestamp !== null && !['balance', 'credit', 'deposit', 'withdrawal'].includes(type) &&
        (fromTime === null || timestamp >= fromTime) && (toTime === null || timestamp <= toTime);
    })
    .sort((left, right) => left.timestamp - right.timestamp);
  for (const { deal } of tradingDeals) {
    balance += (Number(deal?.profit ?? deal?.Profit) || 0) +
      (Number(deal?.commission ?? deal?.Commission) || 0) +
      (Number(deal?.swap ?? deal?.Swap) || 0);
    points.push(Number(balance.toFixed(2)));
  }
  if (points.length <= 80) return points;
  const step = Math.ceil(points.length / 80);
  const sampled = points.filter((_, index) => index % step === 0);
  if (sampled[sampled.length - 1] !== points[points.length - 1]) sampled.push(points[points.length - 1]);
  return sampled;
}

const FILTER_NUMBER_PATTERN = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)';

function validateNumericFilter(value, label, { range = false, percent = false, integer = false, min = null, max = null } = {}) {
  if (value === undefined || value === null || value === '') return;
  let text = String(value).trim();
  if (percent && text.endsWith('%')) text = text.slice(0, -1).trim();
  const pattern = range
    ? new RegExp(`^(${FILTER_NUMBER_PATTERN})(?:\\s*-\\s*(${FILTER_NUMBER_PATTERN}))?$`)
    : new RegExp(`^(${integer ? '[+]?(?:\\d+)' : FILTER_NUMBER_PATTERN})$`);
  const match = text.match(pattern);
  if (!match) throw httpError(`${MESSAGES.INVALID_RESULT_FILTER}: ${label}`, 400, 'MT5_INVALID_RESULT_FILTER');
  const first = Number(match[1]);
  const second = match[2] === undefined ? null : Number(match[2]);
  if ((min !== null && first < min) || (max !== null && first > max)
      || (second !== null && ((min !== null && second < min) || (max !== null && second > max)))
      || (second !== null && first > second)) {
    throw httpError(`${MESSAGES.INVALID_RESULT_FILTER}: ${label}`, 400, 'MT5_INVALID_RESULT_FILTER');
  }
}

function validateResultFilters(filters) {
  validateNumericFilter(filters.minProfit, 'Min Profit', { range: true });
  validateNumericFilter(filters.maxProfit, 'Max Profit');
  validateNumericFilter(filters.minRecoveryFactor, 'Recovery Factor', { range: true });
  validateNumericFilter(filters.maxRecoveryFactor, 'Max Recovery Factor');
  validateNumericFilter(filters.trades, 'Trades', { range: true, min: 0 });
  validateNumericFilter(filters.minTrades, 'Min Trades', { min: 0 });
  validateNumericFilter(filters.maxTrades, 'Max Trades', { min: 0 });
  validateNumericFilter(filters.profitFactor, 'Profit Factor', { range: true, min: 0 });
  validateNumericFilter(filters.minProfitFactor, 'Min Profit Factor', { min: 0 });
  validateNumericFilter(filters.maxProfitFactor, 'Max Profit Factor', { min: 0 });
  validateNumericFilter(filters.balanceDD, 'Equity DD %', { range: true, percent: true, min: 0 });
  validateNumericFilter(filters.minBalanceDD, 'Min Equity DD %', { percent: true, min: 0 });
  validateNumericFilter(filters.maxBalanceDD, 'Max Equity DD %', { percent: true, min: 0 });
  validateNumericFilter(filters.pdRatio, 'P/D Ratio', { range: true });
  validateNumericFilter(filters.minPdRatio, 'Min P/D Ratio');
  validateNumericFilter(filters.maxPdRatio, 'Max P/D Ratio');
  validateNumericFilter(filters.sharpeRatio, 'Sharpe Ratio', { range: true });
  validateNumericFilter(filters.minSharpeRatio, 'Min Sharpe Ratio');
  validateNumericFilter(filters.maxSharpeRatio, 'Max Sharpe Ratio');
  validateNumericFilter(filters.largestLossTrade, 'Largest Loss Trade', { range: true, min: 0 });
  validateNumericFilter(filters.minLargestLossTrade, 'Min Largest Loss Trade', { min: 0 });
  validateNumericFilter(filters.maxLargestLossTrade, 'Max Largest Loss Trade', { min: 0 });
  validateNumericFilter(filters.topN, 'Top N Results', { integer: true, min: 0, max: 50 });
  validateNumericFilter(filters.clusterRadius, 'Cluster Radius %', { percent: true, min: 0, max: 50 });
  if (Number(filters.clusterRadius) > 0 && !(Number(filters.topN) > 0)) {
    throw httpError(
      `${MESSAGES.INVALID_RESULT_FILTER}: Top N Results is required when Cluster Radius is enabled`,
      400,
      'MT5_INVALID_RESULT_FILTER',
    );
  }
}

function resultFilters(query) {
  const filters = {
    sessionId: query.session_id || query.sessionId,
    view: query.view || 'all',
    strategyId: query.strategy_id || null,
    search: query.search || null,
    symbol: query.symbol && query.symbol !== 'ALL' ? query.symbol : null,
    state: query.state && query.state !== 'ALL' ? query.state : null,
    backtestRuns: query.backtest_runs !== undefined
      && query.backtest_runs !== null
      && query.backtest_runs !== 'ALL'
      ? query.backtest_runs
      : null,
    minProfit: query.min_profit || query.minProfit || null,
    maxProfit: query.max_profit || query.maxProfit || null,
    minRecoveryFactor: query.min_recovery_factor || query.minRecoveryFactor || null,
    maxRecoveryFactor: query.max_recovery_factor || query.maxRecoveryFactor || null,
    trades: query.trades || null,
    minTrades: query.min_trades || query.minTrades || null,
    maxTrades: query.max_trades || query.maxTrades || null,
    profitFactor: query.profit_factor || query.profitFactor || null,
    minProfitFactor: query.min_profit_factor || query.minProfitFactor || null,
    maxProfitFactor: query.max_profit_factor || query.maxProfitFactor || null,
    balanceDD: query.balance_dd || query.balanceDD || null,
    minBalanceDD: query.min_balance_dd || query.minBalanceDD || null,
    maxBalanceDD: query.max_balance_dd || query.maxBalanceDD || null,
    pdRatio: query.pd_ratio || query.pdRatio || null,
    minPdRatio: query.min_pd_ratio || query.minPdRatio || null,
    maxPdRatio: query.max_pd_ratio || query.maxPdRatio || null,
    sharpeRatio: query.sharpe_ratio || query.sharpeRatio || null,
    minSharpeRatio: query.min_sharpe_ratio || query.minSharpeRatio || null,
    maxSharpeRatio: query.max_sharpe_ratio || query.maxSharpeRatio || null,
    largestLossTrade: query.largest_loss_trade || query.largestLossTrade || null,
    minLargestLossTrade: query.min_largest_loss_trade || query.minLargestLossTrade || null,
    maxLargestLossTrade: query.max_largest_loss_trade || query.maxLargestLossTrade || null,
    startDate: query.start_date || query.startDate || null,
    endDate: query.end_date || query.endDate || null,
    includeCommonRange: query.include_common_range === '1' || query.include_common_range === 'true',
    topN: query.top_n || query.topN || null,
    clusterRadius: query.cluster_radius || query.clusterRadius || null,
    groupBy: query.group_by || query.groupBy || null,
    cursor: decodeOptimizeCursor(query.cursor),
  };
  for (const key of ['balanceDD', 'minBalanceDD', 'maxBalanceDD', 'clusterRadius']) {
    if (typeof filters[key] === 'string' && filters[key].trim().endsWith('%')) {
      filters[key] = filters[key].trim().slice(0, -1).trim();
    }
  }
  validateResultFilters(filters);
  return filters;
}

function decodeOptimizeCursor(token) {
  if(!token) return null;
  try {
    const value=JSON.parse(Buffer.from(String(token),'base64url').toString('utf8'));
    if(value?.version!==1||!value.strategyId||!Number.isInteger(Number(value.sessionVersion))) throw new Error('invalid');
    if(!['flat','grouped'].includes(value.mode)) throw new Error('invalid');
    if(value.mode==='flat'&&(!value.id||value.resultValue===undefined)) throw new Error('invalid');
    return value;
  } catch {
    throw httpError(MESSAGES.INVALID_RESULT_CURSOR,400,'MT5_INVALID_RESULT_CURSOR');
  }
}

function encodeOptimizeCursor(item,mode,sessionVersion) {
  if(!item) return null;
  return Buffer.from(JSON.stringify({
    version:1,mode,sessionVersion:Number(sessionVersion)||0,
    strategyId:item.strategy_id,resultValue:item.result_value??0,id:item.id,
  }),'utf8').toString('base64url');
}

const OPTIMIZE_RESULT_CACHE_TTL_MS = 60 * 60 * 1000;
const OPTIMIZE_RESULT_CACHE_MAX_ENTRIES = 200;
const OPTIMIZE_RESULT_CACHE_MAX_BYTES = 64 * 1024 * 1024;
const optimizeResultCache = new Map();
const optimizeResultInflight = new Map();
let optimizeResultCacheBytes = 0;

function stableCacheValue(value) {
  if (Array.isArray(value)) return value.map(stableCacheValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableCacheValue(value[key])]),
  );
}

function optimizeResultCacheKey(kind, actor, sessionVersion, payload) {
  const serialized = JSON.stringify(stableCacheValue({
    kind,
    actor: actor?.isAdmin ? 'admin' : `user:${actor?.userId}`,
    sessionVersion: Number(sessionVersion) || 0,
    payload,
  }));
  return createHash('sha256').update(serialized).digest('hex');
}

function getOptimizeResultCache(key) {
  const entry = optimizeResultCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    optimizeResultCacheBytes -= entry.sizeBytes;
    optimizeResultCache.delete(key);
    return null;
  }
  optimizeResultCache.delete(key);
  optimizeResultCache.set(key, entry);
  return entry.value;
}

function setOptimizeResultCache(key, value) {
  const sizeBytes = Buffer.byteLength(JSON.stringify(value), 'utf8');
  if (sizeBytes > OPTIMIZE_RESULT_CACHE_MAX_BYTES) return;
  const existing = optimizeResultCache.get(key);
  if (existing) {
    optimizeResultCacheBytes -= existing.sizeBytes;
    optimizeResultCache.delete(key);
  }
  optimizeResultCache.set(key, {
    value,
    sizeBytes,
    expiresAt: Date.now() + OPTIMIZE_RESULT_CACHE_TTL_MS,
  });
  optimizeResultCacheBytes += sizeBytes;
  while (
    optimizeResultCache.size > OPTIMIZE_RESULT_CACHE_MAX_ENTRIES
    || optimizeResultCacheBytes > OPTIMIZE_RESULT_CACHE_MAX_BYTES
  ) {
    const oldestKey = optimizeResultCache.keys().next().value;
    const oldest = optimizeResultCache.get(oldestKey);
    optimizeResultCacheBytes -= oldest?.sizeBytes || 0;
    optimizeResultCache.delete(oldestKey);
  }
}

async function withOptimizeResultCache(key, factory) {
  const cached = getOptimizeResultCache(key);
  if (cached) {
    console.log(`[mt5-results] cache hit key=${key.slice(0, 12)}`);
    return cached;
  }
  if (optimizeResultInflight.has(key)) {
    console.log(`[mt5-results] cache join key=${key.slice(0, 12)}`);
    return optimizeResultInflight.get(key);
  }
  console.log(`[mt5-results] cache miss key=${key.slice(0, 12)}`);
  const request = Promise.resolve().then(factory);
  optimizeResultInflight.set(key, request);
  try {
    const value = await request;
    setOptimizeResultCache(key, value);
    return value;
  } finally {
    optimizeResultInflight.delete(key);
  }
}

async function listOptimizeResults(actor, query) {
  const filters = resultFilters(query);
  await requireSession(actor, filters.sessionId);
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = pageLimit(query.page_size || query.limit || 25);
  const includeMeta = query.include_meta !== 'false' && query.include_meta !== '0';
  const state=await resultDao.getOptimizeResultState(actor,filters.sessionId);
  const sessionVersion=Number(state?.result_version)||0;
  if(filters.cursor&&Number(filters.cursor.sessionVersion)!==sessionVersion) {
    throw httpError(MESSAGES.STALE_RESULT_CURSOR,409,'MT5_STALE_RESULT_CURSOR');
  }
  if(filters.cursor) {
    const requestedMode=filters.groupBy==='strategy'?'grouped':'flat';
    if(filters.cursor.mode!==requestedMode) throw httpError(MESSAGES.INVALID_RESULT_CURSOR,400,'MT5_INVALID_RESULT_CURSOR');
  }

  const cacheKey = optimizeResultCacheKey('list', actor, sessionVersion, {
    filters,
    page,
    pageSize,
    includeMeta,
  });
  return withOptimizeResultCache(cacheKey, async () => {
    if (!includeMeta) {
      const items=await resultDao.listOptimizeResults(actor, {
        ...filters,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      const cursorSupported=!(Number(filters.topN)||Number(filters.clusterRadius));
      const mode=filters.groupBy==='strategy'?'grouped':'flat';
      return {
        items,
        total: null,
        qualifiedCount: null,
        summaryTotal: null,
        summaryQualifiedCount: null,
        strategyCount: null,
        symbolCount: null,
        symbolOptions: null,
        watchlistCount: null,
        backtestCandidateCount: null,
        runningBacktestCount: null,
        filteredSetCount: null,
        commonDateRange: null,
        sessionVersion,
        snapshotMaxResultId:items.reduce((max,item)=>Math.max(max,Number(item.id)||0),0),
        nextCursor:cursorSupported&&items.length===pageSize
          ? encodeOptimizeCursor(items[items.length-1],mode,sessionVersion):null,
        page,
        pageSize,
      };
    }

    const [items, total, overview] = await Promise.all([
      resultDao.listOptimizeResults(actor, {
        ...filters,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
      resultDao.countOptimizeResults(actor, filters),
      resultDao.getOptimizeOverview(actor, filters.sessionId),
    ]);
    return {
      items,
      total,
      qualifiedCount: overview.qualified,
      summaryTotal: overview.total,
      summaryQualifiedCount: overview.qualified,
      strategyCount: overview.strategies,
      symbolCount: overview.symbols,
      symbolOptions: overview.symbolOptions,
      watchlistCount: overview.watchlist,
      backtestCandidateCount: overview.backtestCandidates,
      runningBacktestCount: overview.runningBacktests,
      filteredSetCount: total,
      commonDateRange: null,
      sessionVersion:overview.resultVersion,
      snapshotMaxResultId:items.reduce((max,item)=>Math.max(max,Number(item.id)||0),0),
      nextCursor:!(Number(filters.topN)||Number(filters.clusterRadius))&&items.length===pageSize
        ? encodeOptimizeCursor(items[items.length-1],filters.groupBy==='strategy'?'grouped':'flat',overview.resultVersion):null,
      page,
      pageSize,
    };
  });
}

async function getOptimizeResultsSummary(actor, query) {
  const filters = resultFilters(query);
  await requireSession(actor, filters.sessionId);
  const state=await resultDao.getOptimizeResultState(actor,filters.sessionId);
  const sessionVersion=Number(state?.result_version)||0;
  const cacheKey=optimizeResultCacheKey('summary',actor,sessionVersion,{filters});
  return withOptimizeResultCache(cacheKey,async()=>{
    const [total, overview] = await Promise.all([
      resultDao.countOptimizeResults(actor, filters),
      resultDao.getOptimizeOverview(actor, filters.sessionId),
    ]);
    return {
      total,
      qualifiedCount: overview.qualified,
      summaryTotal: overview.total,
      summaryQualifiedCount: overview.qualified,
      strategyCount: overview.strategies,
      symbolCount: overview.symbols,
      symbolOptions: overview.symbolOptions,
      watchlistCount: overview.watchlist,
      backtestCandidateCount: overview.backtestCandidates,
      runningBacktestCount: overview.runningBacktests,
      filteredSetCount: total,
      resultVersion:overview.resultVersion,
    };
  });
}

async function getOptimizeResultsState(actor,sessionId) {
  await requireSession(actor,sessionId);
  const state=await resultDao.getOptimizeResultState(actor,sessionId);
  if(!state) throw httpError(MESSAGES.SESSION_NOT_FOUND,404);
  return {
    sessionId:state.session_id,
    resultVersion:Number(state.result_version)||0,
    resultCount:Number(state.optimize_result_count)||0,
    strategyCount:Number(state.optimize_strategy_count)||0,
    activeJobCount:Number(state.active_job_count)||0,
    lastResultAt:state.last_result_at,
  };
}

function groupBacktestCandidatesByStrategy(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const metrics = row.metrics || {};
    const score = Number(String(metrics.Result ?? metrics.result ?? 0).replace(/[^0-9.-]/g, "")) || 0;
    const current = grouped.get(row.strategy_id);
    if (!current) {
      grouped.set(row.strategy_id, { row, score, count: 1 });
      continue;
    }
    current.count += 1;
    if (score > current.score || (score === current.score && Number(row.id) > Number(current.row.id))) {
      current.row = row;
      current.score = score;
    }
  }
  return [...grouped.values()].map(({ row, count }) => ({ ...row, total_passes: count }));
}

async function listBacktestCandidates(actor, query) {
  const filters = resultFilters(query);
  await requireSession(actor, filters.sessionId);
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = pageLimit(query.page_size || query.limit || 25);
  const commonFilters = {
    sessionId: filters.sessionId,
    view: filters.view,
    strategyId: filters.strategyId,
    search: filters.search,
    symbol: filters.symbol,
  };
  const overviewPromise = resultDao.getCandidateOverview(actor, filters.sessionId);
  const commonRangePromise = filters.includeCommonRange
    ? resultDao.getCandidatesCommonDateRange(actor, commonFilters)
    : Promise.resolve(null);

  if (filters.startDate && filters.endDate) {
    const [sourceRows, overview, commonDateRange] = await Promise.all([
      resultDao.listDateRangeCandidateSources(actor, filters),
      overviewPromise,
      commonRangePromise,
    ]);
    const recalculated = [];
    for (const row of sourceRows) {
      const resolved = resolveCandidateDateRange(row, filters.startDate, filters.endDate);
      if (resolved && matchesDateRangeFilters(resolved.metrics, filters)) {
        recalculated.push(resolved.row);
      }
    }
    const visibleRows = filters.groupBy === "strategy"
      ? groupBacktestCandidatesByStrategy(recalculated)
      : recalculated;
    const offset = (page - 1) * pageSize;
    return {
      items: visibleRows.slice(offset, offset + pageSize),
      total: visibleRows.length,
      qualifiedCount: visibleRows.filter((row) =>
        Number(row.backtest_results?.Trades || 0) >= 100 &&
        Number(row.backtest_results?.Profit || 0) >= 10000).length,
      summaryTotal: overview.total,
      summaryQualifiedCount: overview.qualified,
      strategyCount: overview.strategies,
      symbolCount: overview.symbols,
      stagedCount: overview.staged,
      syncedCount: overview.synced,
      filteredSetCount: visibleRows.length,
      commonDateRange,
      dateRangeRecalculated: true,
      page,
      pageSize,
    };
  }

  const [items, total, overview, commonDateRange] = await Promise.all([
    resultDao.listBacktestCandidates(actor, {
      ...filters,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    resultDao.countBacktestCandidates(actor, filters),
    overviewPromise,
    commonRangePromise,
  ]);
  return {
    items,
    total,
    qualifiedCount: overview.qualified,
    summaryTotal: overview.total,
    summaryQualifiedCount: overview.qualified,
    strategyCount: overview.strategies,
    symbolCount: overview.symbols,
    stagedCount: overview.staged,
    syncedCount: overview.synced,
    filteredSetCount: total,
    commonDateRange,
    page,
    pageSize,
  };
}

async function getOptimizeResult(actor, id) {
  const result = await resultDao.getOptimizeResult(Number(id), actor);
  if (!result) throw httpError(MESSAGES.RESULT_NOT_FOUND, 404, 'MT5_RESULT_NOT_FOUND');
  return result;
}

async function updateOptimizeFlag(actor, id, column, value) {
  const result = await resultDao.setOptimizeFlag(Number(id), actor, column, Boolean(value));
  if (!result) throw httpError(MESSAGES.RESULT_NOT_FOUND, 404, 'MT5_RESULT_NOT_FOUND');
  return result;
}

async function getBacktestCandidate(actor, id, includeDeals = false) {
  const candidate = await resultDao.getBacktestCandidate(Number(id), actor, { includeDeals });
  if (!candidate) throw httpError(MESSAGES.RESULT_NOT_FOUND, 404, 'MT5_CANDIDATE_NOT_FOUND');
  return candidate;
}

async function deleteBacktestCandidate(actor, id) {
  const candidate = await resultDao.deleteBacktestCandidate(Number(id), actor);
  if (!candidate) {
    throw httpError(MESSAGES.BACKTEST_CANDIDATE_NOT_FOUND, 404, 'MT5_CANDIDATE_NOT_FOUND');
  }
  return candidate;
}

async function getBacktestCandidateSparkline(actor, id, query = {}) {
  const source = await resultDao.getCandidateSparklineSource(Number(id), actor);
  if (!source) throw httpError(MESSAGES.RESULT_NOT_FOUND, 404, 'MT5_CANDIDATE_NOT_FOUND');
  const startDate = query.start_date || query.startDate || null;
  const endDate = query.end_date || query.endDate || null;
  if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
    throw httpError('Khoảng thời gian không hợp lệ: Ngày bắt đầu (startDate) không được lớn hơn ngày kết thúc (endDate).', 400, 'MT5_INVALID_DATE_RANGE');
  }
  return {
    points: buildBalanceSparkline(
      source,
      startDate,
      endDate,
    ),
  };
}

const AUTO_REVIEW_RANKINGS = {
  pd_ratio: { key: 'pdRatio', direction: 'desc' },
  net_profit: { key: 'netProfit', direction: 'desc' },
  recovery_factor: { key: 'recoveryFactor', direction: 'desc' },
  profit_factor: { key: 'profitFactor', direction: 'desc' },
  sharpe_ratio: { key: 'sharpeRatio', direction: 'desc' },
  total_trades: { key: 'totalTrades', direction: 'desc' },
  balance_drawdown_percent: { key: 'balanceDrawdownPercent', direction: 'asc' },
  largest_loss_trade: { key: 'largestLossTrade', direction: 'asc', absolute: true },
  op_result: { key: 'result', direction: 'desc' },
};

const DEFAULT_AUTO_PICK_PRIORITY = [
  'pd_ratio',
  'balance_drawdown_percent',
  'net_profit',
  'recovery_factor',
  'profit_factor',
  'sharpe_ratio',
  'total_trades',
  'largest_loss_trade',
  'op_result',
];

function autoReviewMetrics(row) {
  const results = row.backtest_results || {};
  const metrics = extractBacktestMetrics({ results });
  return {
    ...metrics,
    largestLossTrade: Math.abs(metrics.largestLossTrade),
    result: backtestMetricValue(row.metrics || {}, ['Result', 'result', 'Custom', 'custom']),
    pass: Number(row.pass) || Number(row.id),
  };
}

function compareAutoReviewCandidates(left, right, rankingOrder) {
  for (const ranking of rankingOrder) {
    const rule = AUTO_REVIEW_RANKINGS[ranking];
    const leftValue = rule.absolute ? Math.abs(left.metrics[rule.key]) : left.metrics[rule.key];
    const rightValue = rule.absolute ? Math.abs(right.metrics[rule.key]) : right.metrics[rule.key];
    if (leftValue !== rightValue) {
      return rule.direction === 'asc' ? leftValue - rightValue : rightValue - leftValue;
    }
  }
  return Number(right.row.id) - Number(left.row.id);
}

function normalizeAutoPickPriority(payload) {
  const requested = payload.ranking_order || payload.rankingOrder;
  const legacyRanking = payload.ranking_metric || payload.rankingMetric;
  const values = Array.isArray(requested)
    ? requested
    : typeof requested === 'string'
      ? requested.split(',')
      : legacyRanking
        ? [legacyRanking]
        : DEFAULT_AUTO_PICK_PRIORITY;
  const rankingOrder = [...new Set(values.map((value) => String(value).trim().toLowerCase()).filter(Boolean))];
  if (!rankingOrder.length || rankingOrder.some((ranking) => !AUTO_REVIEW_RANKINGS[ranking])) {
    throw httpError(MESSAGES.INVALID_AUTO_REVIEW_RANKING, 400, 'MT5_INVALID_AUTO_REVIEW_RANKING');
  }
  return rankingOrder;
}

async function autoReviewBacktestCandidates(actor, payload = {}) {
  const filters = resultFilters(payload);
  await requireSession(actor, filters.sessionId);
  const rankingOrder = normalizeAutoPickPriority(payload);
  if ((filters.startDate && !filters.endDate) || (!filters.startDate && filters.endDate)) {
    throw httpError('Both start_date and end_date are required for date-range auto review', 400, 'MT5_INVALID_DATE_RANGE');
  }

  let eligibleRows;
  if (filters.startDate && filters.endDate) {
    const sourceRows = await resultDao.listDateRangeCandidateSources(actor, filters);
    eligibleRows = [];
    for (const row of sourceRows) {
      const resolved = resolveCandidateDateRange(row, filters.startDate, filters.endDate);
      if (resolved && matchesDateRangeFilters(resolved.metrics, filters)) {
        eligibleRows.push(resolved.row);
      }
    }
  } else {
    eligibleRows = await resultDao.listAutoReviewCandidates(actor, filters, false);
  }
  if (!eligibleRows.length) {
    return {
      rankingMetric: rankingOrder[0],
      rankingOrder,
      candidateCount: 0,
      strategyCount: 0,
      replacedCount: 0,
      unchangedCount: 0,
      applied: false,
      items: [],
    };
  }

  const grouped = new Map();
  for (const row of eligibleRows) {
    const entry = { row, metrics: autoReviewMetrics(row) };
    const current = grouped.get(row.strategy_id);
    if (!current || compareAutoReviewCandidates(entry, current, rankingOrder) < 0) grouped.set(row.strategy_id, entry);
  }
  const winners = [...grouped.values()].sort((left, right) =>
    String(left.row.strategy_id).localeCompare(String(right.row.strategy_id)));
  const currentSelections = new Map(
    (await resultDao.getStagingSelections(actor, filters.sessionId))
      .map((row) => [row.strategy_id, Number(row.candidate_id)]),
  );
  const replacedCount = winners.filter(({ row }) =>
    currentSelections.has(row.strategy_id) && currentSelections.get(row.strategy_id) !== Number(row.id)).length;
  const unchangedCount = winners.filter(({ row }) => currentSelections.get(row.strategy_id) === Number(row.id)).length;
  const apply = payload.apply === true || payload.apply === 'true';
  const replaceExisting = payload.replace_existing !== false && payload.replaceExisting !== false;
  const winnersToStage = replaceExisting
    ? winners
    : winners.filter(({ row }) => !currentSelections.has(row.strategy_id));
  if (apply) {
    await resultDao.applyAutoReviewStaging(actor, filters.sessionId, winnersToStage.map(({ row }) => Number(row.id)));
  }
  const previewLimit = 100;
  return {
    rankingMetric: rankingOrder[0],
    rankingOrder,
    candidateCount: eligibleRows.length,
    strategyCount: winners.length,
    replacedCount,
    unchangedCount,
    stagedCount: apply ? winnersToStage.length : 0,
    skippedExistingCount: apply && !replaceExisting ? winners.length - winnersToStage.length : 0,
    applied: apply,
    previewTruncated: winners.length > previewLimit,
    items: winners.slice(0, previewLimit).map(({ row, metrics }) => ({
      id: row.id,
      strategyId: row.strategy_id,
      strategyIdR: row.strategy_id_r,
      pass: metrics.pass,
      netProfit: metrics.netProfit,
      totalTrades: metrics.totalTrades,
      profitFactor: metrics.profitFactor,
      recoveryFactor: metrics.recoveryFactor,
      balanceDrawdownPercent: metrics.balanceDrawdownPercent,
      pdRatio: metrics.pdRatio,
      largestLossTrade: metrics.largestLossTrade,
      result: metrics.result,
      replacesCandidateId: currentSelections.get(row.strategy_id) || null,
    })),
  };
}

async function selectBacktestStaging(actor, id, targetTable, value = true, overwriteExisting = true) {
  if (targetTable) await backtestAccessService.assertCanAccessBacktestTable(actor, targetTable);
  const candidate = await resultDao.selectStagingCandidate(
    Number(id), actor, targetTable || null, Boolean(value), Boolean(overwriteExisting),
  );
  if (!candidate) throw httpError(MESSAGES.RESULT_NOT_FOUND, 404, 'MT5_CANDIDATE_NOT_FOUND');
  return candidate;
}

async function syncBacktestCandidate(actor, id, { targetTable, overwrite = false }) {
  await backtestAccessService.assertCanAccessBacktestTable(actor, targetTable);
  const candidate = await resultDao.getBacktestCandidate(Number(id), actor, { includeDeals: true });
  if (!candidate || !candidate.summary_bt || !Array.isArray(candidate.deals) || !candidate.deals.length) {
    throw httpError(MESSAGES.EMPTY_BACKTEST_RESULT, 409, 'MT5_BACKTEST_NO_DATA');
  }
  if (!candidate.picked_bt_staging) {
    throw httpError('Candidate must be selected in Backtest Staging before sync', 409, 'MT5_STAGING_REQUIRED');
  }
  const safeTable = String(targetTable).toLowerCase();
  const client = await resultDao.pool.connect();
  try {
    await client.query('BEGIN');
    const exists = await client.query(
      `SELECT 1 FROM "${safeTable}" WHERE strategy_id=$1 LIMIT 1`,
      [candidate.strategy_id],
    );
    if (exists.rowCount && !overwrite) {
      await client.query('ROLLBACK');
      return { conflict: true, strategyId: candidate.strategy_id, targetTable: safeTable };
    }
    if (exists.rowCount) {
      await client.query(`DELETE FROM "${safeTable}" WHERE strategy_id=$1`, [candidate.strategy_id]);
    }
    const rows = candidate.deals.map((deal) => [
      nullablePick(deal,['time','Time']), integerPick(deal,['deal','Deal']), nullablePick(deal,['symbol','Symbol']) || '',
      nullablePick(deal,['type','Type']) || '', nullablePick(deal,['direction','Direction']) || '',
      numericPick(deal,['volume','Volume']), numericPick(deal,['price','Price']), integerPick(deal,['order','Order']),
      numericPick(deal,['commission','Commission'],0), numericPick(deal,['swap','Swap'],0), numericPick(deal,['profit','Profit'],0),
      nullablePick(deal,['comment','Comment']) || '', candidate.strategy_id,
    ]).filter((row) => row[1] !== null);
    if (!rows.length) {
      throw httpError(MESSAGES.EMPTY_BACKTEST_RESULT, 409, 'MT5_BACKTEST_NO_VALID_DEALS');
    }
    for (let offset = 0; offset < rows.length; offset += 500) {
      const chunk = rows.slice(offset, offset + 500);
      const values = [];
      const placeholders = chunk.map((row) => `(${row.map((value) => {
        values.push(value);
        return `$${values.length}`;
      }).join(',')})`).join(',');
      await client.query(
        `INSERT INTO "${safeTable}" (time,deal,symbol,type,direction,volume,price,"order",commission,swap,profit,comment,strategy_id)
         VALUES ${placeholders} ON CONFLICT DO NOTHING`,
        values,
      );
    }
    const rawSettings = candidate.summary_bt.settings;
    const rawResults = candidate.summary_bt.results;
    const settings = normalizeStrategySettings(rawSettings, candidate.strategy_id);
    const results = normalizeStrategyResults(rawResults);
    await client.query(
      `INSERT INTO strategy_metadata(strategy_id,backtest_table,symbol,expert_name,expert_id,timeframe,period_start,period_end,settings,results,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
       ON CONFLICT(strategy_id,backtest_table) DO UPDATE SET
         symbol=EXCLUDED.symbol,expert_name=EXCLUDED.expert_name,expert_id=EXCLUDED.expert_id,
         timeframe=EXCLUDED.timeframe,period_start=EXCLUDED.period_start,period_end=EXCLUDED.period_end,
         settings=EXCLUDED.settings,results=EXCLUDED.results,updated_at=NOW()`,
      [
        candidate.strategy_id, safeTable, settings.symbol, settings.expert,
        nullablePick(rawSettings,['Expert ID','expert_id']), settings.period,
        metadataDate(rawSettings,0), metadataDate(rawSettings,1),
        JSON.stringify(settings), JSON.stringify(results),
      ],
    );
    const staging = await resultDao.markStagingSynced(client, candidate.id, safeTable);
    if (!staging) throw httpError('Candidate is no longer selected in Backtest Staging', 409, 'MT5_STAGING_REQUIRED');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  opService.clearAllCaches(safeTable);
  return { conflict: false, synced: true, strategyId: candidate.strategy_id, targetTable: safeTable };
}

async function listLogs(actor,query) {
  const sessionId=query.session_id||query.sessionId;
  await requireSession(actor,sessionId);
  return dao.listLogs(actor,{sessionId,beforeId:query.before_id||null,limit:pageLimit(query.limit)});
}
async function recoverExpiredJobs(){
  const jobs=await dao.recoverExpiredJobs();
  for(const job of jobs) {
    removeJobRuntime(job.job_id);
    if(job.job_type===MT5.JOB_TYPE.EVERY_TICK&&
      [MT5.JOB_STATUS.DONE,MT5.JOB_STATUS.FAILED].includes(job.status)&&
      Number(job.job_payload?.rerun_remaining)>1) {
      const client=await dao.pool.connect();
      try {
        await client.query('BEGIN');
        if(job.job_type===MT5.JOB_TYPE.EVERY_TICK) {
          await resultDao.setBacktestPickByTarget(job.session_id,job.target_strategy_id_r,true,client);
        }
        await client.query(
          `UPDATE mt5_job_queue
              SET job_payload=job_payload || jsonb_build_object(
                'rerun_remaining',GREATEST((job_payload->>'rerun_remaining')::integer-1,0),
                'rerun_index',COALESCE((job_payload->>'rerun_index')::integer,0)+1
              )
            WHERE job_id=$1`,
          [job.job_id],
        );
        await dao.continueRerunJob(job.job_id,client);
        await client.query('COMMIT');
      } catch(error) {
        await client.query('ROLLBACK').catch(()=>{});
        console.error(`[mt5] failed to continue rerun chain job=${job.job_id}: ${error.message}`);
      } finally {
        client.release();
      }
    } else if(job.status===MT5.JOB_STATUS.FAILED&&job.job_type===MT5.JOB_TYPE.EVERY_TICK) {
      await resultDao.clearBacktestPick(job.session_id,job.target_strategy_id_r);
    }
  }
  if(jobs.length)console.warn(`[mt5] recovered ${jobs.length} expired jobs and cleaned runtime data`);
  return jobs;
}

module.exports={
  createSession,listSessions,updateSession,getSessionCleanupPreview,purgeUnusedOptimizeResults,deleteSession,createApiKey,listApiKeys,revokeApiKey,deleteApiKey,listWorkers,updateWorker,deleteWorker,
  createJobs,createEveryTickJobs,startBacktestResult,getRunningBacktestCount,listJobs,listJobSelection,mutateJob,rerunJob,deleteJob,claimJob,workerHeartbeat,jobHeartbeat,
  getWorkerStatus,getJobStatuses,
  finishWorkerJob,getInputArtifact,saveArtifact,startOptimizeUpload,saveOptimizeChunk,finalizeOptimizeUpload,
  saveArtifactChunk,getResultArtifact,
  saveLegacyOptimizeChunk,saveBacktestResult,
  listResults:listOptimizeResults,getResultsSummary:getOptimizeResultsSummary,getResult:getOptimizeResult,
  setResultFlag:updateOptimizeFlag,getOptimizeResultsState,
  listBacktestCandidates,getBacktestCandidate,deleteBacktestCandidate,getBacktestCandidateSparkline,
  autoReviewBacktestCandidates,selectBacktestStaging,syncBacktestCandidate,
  listLogs,getFilterPreferences,saveFilterPreference,deleteFilterPreference,recoverExpiredJobs,sweepRuntimeDirectories,authenticateWorker,
};
