const service = require('../service/mt5OptimizationService');
const { MT5 } = require('../utils/constants');

function sendError(res,error) {
  res.status(error.status||500).json({error:error.message,code:error.code||'MT5_INTERNAL_ERROR'});
}

const handler = (operation, status=200) => async (req,res) => {
  try { const data=await operation(req);res.status(status).json({data}); }
  catch(error){sendError(res,error);}
};

const createSession=handler(req=>service.createSession(req.actor,req.body),201);
const listSessions=handler(req=>service.listSessions(req.actor));
const updateSession=handler(req=>service.updateSession(req.actor,req.params.id,req.body));
const getSessionCleanupPreview=handler(req=>service.getSessionCleanupPreview(req.actor,req.params.id));
const purgeUnusedOptimizeResults=handler(req=>service.purgeUnusedOptimizeResults(req.actor,req.params.id,req.body));
const deleteSession=handler(req=>service.deleteSession(req.actor,req.params.id,req.body));
const createApiKey=handler(req=>service.createApiKey(req.actor,req.body),201);
const listApiKeys=handler(req=>service.listApiKeys(req.actor));
const revokeApiKey=handler(req=>service.revokeApiKey(req.actor,req.params.id));
const deleteApiKey=handler(req=>service.deleteApiKey(req.actor,req.params.id));
const listWorkers=handler(req=>service.listWorkers(req.actor));
const updateWorker=handler(req=>service.updateWorker(req.actor,req.params.id,req.body));
const deleteWorker=handler(req=>service.deleteWorker(req.actor,req.params.id));
const getFilterPreferences=handler(req=>service.getFilterPreferences(req.actor));
const saveFilterPreference=handler(req=>service.saveFilterPreference(req.actor,req.params.scope,req.body));
const deleteFilterPreference=handler(req=>service.deleteFilterPreference(req.actor,req.params.scope));
const createJobs=handler(req=>service.createJobs(req.actor,req.body),202);
const createEveryTickJobs=handler(req=>service.createEveryTickJobs(req.actor,req.body),202);
const listJobs=handler(req=>service.listJobs(req.actor,req.query));
const listJobSelection=handler(req=>service.listJobSelection(req.actor,req.query));
const cancelJob=handler(req=>service.mutateJob(req.actor,req.params.id,'cancel'));
const retryJob=handler(req=>service.rerunJob(req.actor,req.params.id,req.body),202);
const deleteJob=handler(req=>service.deleteJob(req.actor,req.params.id));
const listResults=handler(req=>service.listResults(req.actor,req.query));
const getResultsSummary=handler(req=>service.getResultsSummary(req.actor,req.query));
const getResultsState=handler(req=>service.getOptimizeResultsState(req.actor,req.params.id));
const getResult=handler(req=>service.getResult(req.actor,req.params.id));
const setWatchlist=handler(req=>service.setResultFlag(req.actor,req.params.id,'picked_watchlist',req.body.value));
const setBacktestCandidate=handler(req=>service.setResultFlag(req.actor,req.params.id,'picked_bt',req.body.value));
const startBacktestResult=handler(req=>service.startBacktestResult(req.actor,req.params.id),202);
const getRunningBacktestCount=handler(req=>service.getRunningBacktestCount(req.actor,req.params.id));
const listBacktestCandidates=handler(req=>service.listBacktestCandidates(req.actor,req.query));
const autoReviewBacktestCandidates=handler(req=>service.autoReviewBacktestCandidates(req.actor,req.body));
const getBacktestCandidate=handler(req=>service.getBacktestCandidate(
  req.actor,req.params.id,req.query.include_deals==='true',
));
const deleteBacktestCandidate=handler(req=>service.deleteBacktestCandidate(req.actor,req.params.id));
const getBacktestCandidateSparkline=handler(req=>service.getBacktestCandidateSparkline(
  req.actor,req.params.id,req.query,
));
const selectBacktestStaging=handler(req=>service.selectBacktestStaging(
  req.actor,
  req.params.id,
  req.body.targetTable||req.body.target_table||null,
  req.body.value!==false,
  req.body.overwriteExisting!==false && req.body.overwrite_existing!==false,
));
const syncBacktestCandidate=handler(req=>service.syncBacktestCandidate(req.actor,req.params.id,req.body));
const listLogs=handler(req=>service.listLogs(req.actor,req.query));

function apiKey(req) {
  return String(
    req.get('X-API-Key') ||
    req.get('x-api-key') ||
    req.body?.api_key ||
    '',
  ).trim();
}
const verifyApiKey=async(req,res)=>{try{const key=await service.authenticateWorker(apiKey(req));res.json({valid:true,user_id:key.user_id});}catch(error){sendError(res,error);}};
const queueHealth=async(_req,res)=>res.json({status:'ok',service:'mt5-queue-v2'});
const claimJob=async(req,res)=>{try{const job=await service.claimJob(apiKey(req),req.body.worker_name,req.body.worker_instance_id);res.json({job});}catch(error){sendError(res,error);}};
const workerHeartbeat=async(req,res)=>{try{const worker=await service.workerHeartbeat(apiKey(req),req.body);res.json({worker});}catch(error){sendError(res,error);}};
const jobHeartbeat=async(req,res)=>{try{const job=await service.jobHeartbeat(apiKey(req),req.body);res.json({job});}catch(error){sendError(res,error);}};
const jobDone=async(req,res)=>{try{const job=await service.finishWorkerJob(apiKey(req),req.body,MT5.JOB_STATUS.DONE);res.json({job});}catch(error){sendError(res,error);}};
const jobFail=async(req,res)=>{try{const job=await service.finishWorkerJob(apiKey(req),req.body,MT5.JOB_STATUS.FAILED);res.json({job});}catch(error){sendError(res,error);}};
const getStatuses=async(req,res)=>{try{res.json({jobs:await service.getJobStatuses(apiKey(req),req.body)});}catch(error){sendError(res,error);}};
const getWorker=async(req,res)=>{try{res.json({worker:await service.getWorkerStatus(apiKey(req),req.params.worker)});}catch(error){sendError(res,error);}};
const downloadInput=async(req,res)=>{try{const file=await service.getInputArtifact(apiKey(req),req.params.id);res.type('application/octet-stream').attachment(file.filename).send(Buffer.from(file.content,'utf8'));}catch(error){sendError(res,error);}};
const uploadArtifact=async(req,res)=>{try{const file=await service.saveArtifact(apiKey(req),req.params.id,req.query.run_id,req.query.filename,req.body);res.json({artifact:{filename:file.filename},artifact_relpath:`/jobs/${req.params.id}/artifacts/result/download`});}catch(error){sendError(res,error);}};
const uploadArtifactChunk=async(req,res)=>{try{const result=await service.saveArtifactChunk(apiKey(req),req.params.id,req.query,req.body);res.json(result);}catch(error){sendError(res,error);}};
const artifactStatus=async(req,res)=>{try{const artifact=await service.getResultArtifact(apiKey(req),req.params.id);res.json({complete:Boolean(artifact),ready:Boolean(artifact),status:artifact?'READY':'PROCESSING',filename:artifact?.filename||null,result_artifact_relpath:artifact?`/jobs/${req.params.id}/artifacts/result/download`:null});}catch(error){sendError(res,error);}};
const downloadResult=async(req,res)=>{try{const artifact=await service.getResultArtifact(apiKey(req),req.params.id);if(!artifact)return res.status(404).json({error:'Result artifact not found'});res.download(artifact.path,artifact.filename);}catch(error){sendError(res,error);}};
const startOptimizeUpload=async(req,res)=>{try{const data=await service.startOptimizeUpload(apiKey(req),req.params.id,req.body);res.json(data);}catch(error){sendError(res,error);}};
const saveOptimizeChunk=async(req,res)=>{try{const data=await service.saveOptimizeChunk(apiKey(req),req.params.id,req.body);res.json(data);}catch(error){sendError(res,error);}};
const finalizeOptimizeUpload=async(req,res)=>{try{const data=await service.finalizeOptimizeUpload(apiKey(req),req.params.id,req.body);res.json({data,job:{optimize_snapshot_relpath:'stored-in-database'}});}catch(error){sendError(res,error);}};
const saveLegacyOptimizeChunk=async(req,res)=>{try{const data=await service.saveLegacyOptimizeChunk(apiKey(req),req.params.id,req.body);res.json({data});}catch(error){sendError(res,error);}};
const saveBacktestResult=async(req,res)=>{try{const data=await service.saveBacktestResult(apiKey(req),req.params.id,req.body);res.json({data});}catch(error){sendError(res,error);}};

module.exports={createSession,listSessions,updateSession,getSessionCleanupPreview,purgeUnusedOptimizeResults,deleteSession,createApiKey,listApiKeys,revokeApiKey,deleteApiKey,listWorkers,
  updateWorker,deleteWorker,getFilterPreferences,saveFilterPreference,deleteFilterPreference,createJobs,createEveryTickJobs,listJobs,listJobSelection,cancelJob,retryJob,deleteJob,listResults,getResultsSummary,getResultsState,getResult,
  setWatchlist,setBacktestCandidate,startBacktestResult,getRunningBacktestCount,listBacktestCandidates,autoReviewBacktestCandidates,getBacktestCandidate,deleteBacktestCandidate,getBacktestCandidateSparkline,
  selectBacktestStaging,syncBacktestCandidate,listLogs,verifyApiKey,queueHealth,claimJob,
  workerHeartbeat,jobHeartbeat,jobDone,jobFail,getStatuses,getWorker,downloadInput,uploadArtifact,
  uploadArtifactChunk,artifactStatus,downloadResult,startOptimizeUpload,saveOptimizeChunk,
  finalizeOptimizeUpload,saveLegacyOptimizeChunk,saveBacktestResult};
