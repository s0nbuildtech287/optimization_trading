const schemaDao = require('../src/dao/mt5OptimizationSchemaDao');
const dao = require('../src/dao/mt5OptimizationDao');
const service = require('../src/service/mt5OptimizationService');

async function verify() {
  await schemaDao.initMt5OptimizationSchema();
  const expectedTables = [
    'api_keys','mt5_backtest_candidates','mt5_backtest_staging','mt5_job_queue',
    'mt5_logs','mt5_optimize_results','mt5_sessions','mt5_workers',
  ];
  const actualTables = (await dao.pool.query(`
    SELECT tablename FROM pg_tables
     WHERE schemaname='public' AND (tablename LIKE 'mt5\\_%' ESCAPE '\\' OR tablename='api_keys')
     ORDER BY tablename
  `)).rows.map((row) => row.tablename);
  if (JSON.stringify(actualTables) !== JSON.stringify(expectedTables)) {
    throw new Error(`Unexpected MT5 tables: ${actualTables.join(', ')}`);
  }
  const legacyColumns = (await dao.pool.query(`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='mt5_optimize_results'
       AND column_name=ANY($1::text[])
  `, [[
    'picked_bt_staging','summary_bt','deals','backtest_completed_at',
    'staging_target_table','source_table','sync_status','synced_at',
  ]])).rows;
  if (legacyColumns.length) throw new Error('Legacy Every Tick columns remain on mt5_optimize_results');
  const duplicatedOwnerColumns = (await dao.pool.query(`
    SELECT table_name FROM information_schema.columns
     WHERE table_schema='public'
       AND table_name=ANY($1::text[])
       AND column_name='user_id'
  `, [[
    'mt5_job_queue','mt5_optimize_results',
    'mt5_backtest_candidates','mt5_backtest_staging',
  ]])).rows;
  if (duplicatedOwnerColumns.length) {
    throw new Error(`Duplicated MT5 owner columns remain: ${duplicatedOwnerColumns.map((row) => row.table_name).join(', ')}`);
  }
  const user = (await dao.pool.query('SELECT id FROM users ORDER BY id LIMIT 1')).rows[0];
  if (!user) throw new Error('A user is required for the MT5 integration verification');
  const actor = { userId: Number(user.id), role: 'user', isAdmin: false };
  let session;
  let apiKey;
  const notificationEntityIds = [];
  try {
    session = await service.createSession(actor, { name: `MT5 verify ${Date.now()}` });
    apiKey = await service.createApiKey(actor, { name: `verify-${Date.now()}` });
    const [createdJob] = await service.createJobs(actor, {
      sessionId: session.id,
      jobs: [{
        jobType: 'OPEN_PRICE',
        strategyId: 'VERIFYBTCUSDH1OB',
        priority: 2147483647,
        iniContent: '[Tester]\r\nModel=2\r\nOptimization=2\r\n[TesterInputs]\r\nADX=14||10||1||20||Y',
        jobPayload: { mode: '0', job_name: 'VERIFYBTCUSDH1OB', optimize_runs: 1 },
      }],
    });
    const blockedClaim = await service.claimJob(apiKey.api_key, 'verify-worker');
    if (blockedClaim) throw new Error('New worker claimed a job before being allowed');
    const worker = await dao.getWorkerByName(actor.userId, 'verify-worker');
    if (!worker || worker.run_access) throw new Error('New worker must start with run_access disabled');
    await service.updateWorker(actor, worker.id, { runAccess: true });
    const claimed = await service.claimJob(apiKey.api_key, 'verify-worker');
    if (!claimed || claimed.external_job_id !== createdJob.job_id) throw new Error('Atomic claim failed');
    await service.startOptimizeUpload(apiKey.api_key, createdJob.job_id, {
      upload_id: 'verify-upload', total_chunks: 1, run_id: claimed.run_id,
    });
    await service.saveOptimizeChunk(apiKey.api_key, createdJob.job_id, {
      upload_id: 'verify-upload', chunk_index: 1, total_chunks: 1,
      rows: [
        { Pass: 1, Result: 2.5, Profit: 12345, Trades: 101, ADX: 14 },
        { Pass: 2, Result: 0, Profit: 0, Trades: 0, ADX: 15 },
      ],
    });
    const finalized = await service.finalizeOptimizeUpload(apiKey.api_key, createdJob.job_id, {
      upload_id: 'verify-upload', total_chunks: 1, run_id: claimed.run_id,
    });
    if (finalized.stored_count !== 1 || finalized.skipped_all_zero !== 1) throw new Error('All-zero filtering failed');
    await service.finishWorkerJob(apiKey.api_key, {
      worker_name: 'verify-worker', external_job_id: createdJob.job_id, run_id: claimed.run_id,
    }, 'DONE');
    notificationEntityIds.push(createdJob.job_id);
    const resultPage = await service.listResults(actor, { session_id: session.id, page: 1, page_size: 10 });
    const results = resultPage.items;
    if (results.length !== 1 || results[0].strategy_id_r !== `VERIFYBTCUSDH1OB_${results[0].id}`) {
      throw new Error('Result identity failed');
    }
    const everyTickJob = await service.startBacktestResult(actor, results[0].id);
    if (!everyTickJob || everyTickJob.target_strategy_id_r !== results[0].strategy_id_r) {
      throw new Error('Every Tick queue mapping failed');
    }
    const runningPage = await service.listResults(actor, { session_id: session.id, page: 1, page_size: 10 });
    if (runningPage.runningBacktestCount !== 1) throw new Error('Running Every Tick count failed');
    const everyTickClaim = await service.claimJob(apiKey.api_key, 'verify-worker');
    const backtestPayload = {
      run_id: everyTickClaim.run_id,
      params_json: { Expert: 'verify.ex5', Symbol: 'BTCUSD', Period: 'H1' },
      results_json: {
        Profit: 12345,
        Trades: 101,
        'Balance Drawdown Maximal': '1234.50 (2.10%)',
        'Profit Factor': 1.8,
        'Recovery Factor': 10,
        'Sharpe Ratio': 1.4,
        'Largest Loss Trade': -250,
        'Expected Payoff': 122.23,
      },
      deals_json: [{ time: '2026-01-01 00:00:00', deal: 1, symbol: 'BTCUSD', type: 'buy', direction: 'in', volume: 1, price: 1, order: 1, profit: 10 }],
    };
    await service.saveBacktestResult(apiKey.api_key, everyTickClaim.external_job_id, backtestPayload);
    const duplicate = await service.saveBacktestResult(apiKey.api_key, everyTickClaim.external_job_id, backtestPayload);
    if (!duplicate.idempotent) throw new Error('Every Tick idempotency failed');
    const artifact = await service.getResultArtifact(apiKey.api_key, everyTickClaim.external_job_id);
    if (!artifact || !artifact.filename.endsWith('.xlsx')) throw new Error('Every Tick XLSX artifact generation failed');
    await service.finishWorkerJob(apiKey.api_key, {
      worker_name: 'verify-worker', external_job_id: everyTickClaim.external_job_id, run_id: everyTickClaim.run_id,
    }, 'DONE');
    notificationEntityIds.push(everyTickClaim.external_job_id);
    const notificationCount = (await dao.pool.query(
      `SELECT COUNT(*)::int AS count FROM user_notifications
        WHERE entity_id=ANY($1::text[]) AND event_type IN ('OPEN_PRICE_COMPLETED','EVERY_TICK_COMPLETED')`,
      [notificationEntityIds],
    )).rows[0].count;
    if (notificationCount !== 2) throw new Error('MT5 completion notifications failed');
    const candidatePage = await service.listBacktestCandidates(actor, {
      session_id: session.id, page: 1, page_size: 10, min_profit: 12000, min_pd_ratio: 9,
    });
    if (candidatePage.total !== 1) throw new Error('Every Tick candidate insert failed');
    const completed = await service.getBacktestCandidate(actor, candidatePage.items[0].id, true);
    if (!completed.summary_bt || completed.deals.length !== 1) throw new Error('Every Tick result mapping failed');
    if (Number(completed.pd_ratio).toFixed(2) !== '10.00') throw new Error('Candidate metric extraction failed');
    const parent = await service.getResult(actor, results[0].id);
    if (parent.backtest_run_count !== 1 || parent.picked_bt) throw new Error('Backtest counter or pick reset failed');
    await service.selectBacktestStaging(actor, completed.id, null, true);
    const stagingPage = await service.listBacktestCandidates(actor, {
      session_id: session.id, view: 'staging', page: 1, page_size: 10,
    });
    if (stagingPage.total !== 1 || stagingPage.items[0].id !== completed.id) {
      throw new Error('Backtest staging selection failed');
    }
    const nextOwner = (await dao.pool.query(
      'SELECT id FROM users WHERE id<>$1 ORDER BY id LIMIT 1',
      [actor.userId],
    )).rows[0];
    if (nextOwner) {
      await dao.pool.query('UPDATE mt5_sessions SET user_id=$2 WHERE id=$1', [session.id, nextOwner.id]);
      let oldOwnerCanRead = true;
      try {
        await service.listResults(actor, { session_id: session.id, page: 1, page_size: 10 });
      } catch (error) {
        oldOwnerCanRead = false;
      }
      const nextActor = { userId: Number(nextOwner.id), role: 'user', isAdmin: false };
      const reassignedPage = await service.listResults(nextActor, {
        session_id: session.id, page: 1, page_size: 10,
      });
      if (oldOwnerCanRead || reassignedPage.total !== 1) {
        throw new Error('Session ownership reassignment failed');
      }
    }
    console.log('[VERIFY] MT5 Optimization integration passed');
  } finally {
    if (notificationEntityIds.length) {
      await dao.pool.query('DELETE FROM user_notifications WHERE entity_id=ANY($1::text[])', [notificationEntityIds]);
    }
    if (session) await dao.pool.query('DELETE FROM mt5_sessions WHERE id=$1', [session.id]);
    if (apiKey) await dao.pool.query('DELETE FROM api_keys WHERE id=$1', [apiKey.id]);
    await dao.pool.query("DELETE FROM mt5_workers WHERE worker_name='verify-worker'");
    await dao.pool.end();
  }
}

verify().catch((error) => {
  console.error('[VERIFY] MT5 Optimization integration failed:', error);
  process.exitCode = 1;
});
