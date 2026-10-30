// ============================================
// FILE: dao/lotThresholdDao.js
// Lot Threshold Analysis - DAO Layer
// ============================================
const { getAppPool, safeConnect } = require("../config/db");
const pool = getAppPool();
const { resolveTableSubquery } = require('./queryBuilderHelper');
const { getRequestActor } = require('../utils/requestContext');
const { LOT_SELECTION_TYPE } = require('../utils/constants');
const { LOT_THRESHOLD: LOT_THRESHOLD_MESSAGES } = require('../utils/messages');

async function assertAnalysisRunAccess(run, actor = getRequestActor()) {
  if (!run) return run;
  if (!actor || actor.isAdmin) return run;
  const sources = normalizeSourceTables(run.source_tables);
  if (sources.length > 0) {
    await require('../service/backtestAccessService').validateAccessibleSourceNames(
      actor,
      sources,
      { allowAll: false },
    );
    return run;
  }
  // Legacy runs without source metadata remain visible to their creator only.
  if (Number(run.created_by) === Number(actor.userId)) {
    return run;
  }
  const error = new Error('Analysis Run not found or access denied');
  error.code = 'ANALYSIS_RUN_ACCESS_DENIED';
  error.status = 403;
  throw error;
}

/**
 * ✅ Tạo bảng lot_threshold_analysis
 */
async function initLotThresholdTable() {
  const query = `
    CREATE SEQUENCE IF NOT EXISTS lot_threshold_analysis_run_seq;

    CREATE TABLE IF NOT EXISTS lot_threshold_analysis_runs (
      id BIGSERIAL PRIMARY KEY,
      analysis_run_id VARCHAR(64) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      source_tables JSONB NOT NULL DEFAULT '[]'::jsonb,
      configs_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      time_begin TIMESTAMP,
      time_end TIMESTAMP,
      status VARCHAR(32) NOT NULL DEFAULT 'RUNNING',
      total_strategies INTEGER NOT NULL DEFAULT 0,
      succeeded_strategies INTEGER NOT NULL DEFAULT 0,
      failed_strategies INTEGER NOT NULL DEFAULT 0,
      started_at TIMESTAMP NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMP,
      created_by INTEGER,
      error_message TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_lot_analysis_runs_status
      ON lot_threshold_analysis_runs(status);
    CREATE INDEX IF NOT EXISTS idx_lot_analysis_runs_started_at
      ON lot_threshold_analysis_runs(started_at DESC);

    CREATE TABLE IF NOT EXISTS lot_threshold_analysis (
      analysis_run_id VARCHAR(64) NOT NULL DEFAULT 'run-lot-01',
      strategy_id VARCHAR(255) NOT NULL,
      source_table VARCHAR(50) NOT NULL,
      symbol VARCHAR(50),
      lot_threshold INTEGER NOT NULL,
      pd_ratio NUMERIC,
      total_profit NUMERIC,
      max_drawdown NUMERIC,
      total_trades INTEGER,
      winrate NUMERIC,
      profit_factor NUMERIC,
      recovery_factor NUMERIC,
      sharpe_ratio NUMERIC,
      largest_loss_trade NUMERIC,
      largest_profit_trade NUMERIC,
      largest_profit_trade_ratio NUMERIC,
      risk_reward_ratio NUMERIC,
      lr_correlation NUMERIC,
      avg_profit NUMERIC,
      avg_loss NUMERIC,
      metrics_complete BOOLEAN NOT NULL DEFAULT FALSE,
      the_chosen_one BOOLEAN NOT NULL DEFAULT FALSE,
      time_begin TIMESTAMP,
      time_end TIMESTAMP,
      computed_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (analysis_run_id, strategy_id, source_table, lot_threshold)
    );

    CREATE INDEX IF NOT EXISTS idx_lot_threshold_strategy ON lot_threshold_analysis(strategy_id);
    CREATE INDEX IF NOT EXISTS idx_lot_threshold_source ON lot_threshold_analysis(source_table);
    CREATE INDEX IF NOT EXISTS idx_lot_threshold_symbol ON lot_threshold_analysis(symbol);
    CREATE INDEX IF NOT EXISTS idx_lot_threshold_pd ON lot_threshold_analysis(pd_ratio DESC);

    CREATE TABLE IF NOT EXISTS lot_threshold_final (
      analysis_run_id VARCHAR(64) NOT NULL DEFAULT 'run-lot-01',
      strategy_id VARCHAR(255) NOT NULL,
      source_table VARCHAR(50) NOT NULL,
      symbol VARCHAR(50),
      lot_threshold INTEGER NOT NULL,
      best_pd NUMERIC,
      total_profit NUMERIC,
      max_drawdown NUMERIC,
      total_trades INTEGER,
      winrate NUMERIC,
      profit_factor NUMERIC,
      recovery_factor NUMERIC,
      sharpe_ratio NUMERIC,
      largest_loss_trade NUMERIC,
      largest_profit_trade NUMERIC,
      largest_profit_trade_ratio NUMERIC,
      risk_reward_ratio NUMERIC,
      lr_correlation NUMERIC,
      avg_profit NUMERIC,
      avg_loss NUMERIC,
      time_begin TIMESTAMP,
      time_end TIMESTAMP,
      is_fallback BOOLEAN DEFAULT FALSE,
      selection_type VARCHAR(16) NOT NULL DEFAULT 'AUTO'
        CHECK (selection_type IN ('AUTO', 'FALLBACK', 'MANUAL')),
      selected_by INTEGER,
      selected_at TIMESTAMP,
      auto_lot_threshold INTEGER,
      computed_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (analysis_run_id, strategy_id, source_table)
    );

    CREATE INDEX IF NOT EXISTS idx_lot_final_strategy ON lot_threshold_final(strategy_id);
    CREATE INDEX IF NOT EXISTS idx_lot_final_symbol ON lot_threshold_final(symbol);
    CREATE INDEX IF NOT EXISTS idx_lot_final_pd ON lot_threshold_final(best_pd DESC);
    CREATE INDEX IF NOT EXISTS idx_lot_analysis_run ON lot_threshold_analysis(analysis_run_id);
    CREATE INDEX IF NOT EXISTS idx_lot_final_run ON lot_threshold_final(analysis_run_id);

    CREATE UNIQUE INDEX IF NOT EXISTS uq_chosen_one_per_strategy
      ON lot_threshold_analysis (analysis_run_id, strategy_id, source_table)
      WHERE the_chosen_one = TRUE;

  `;

  try {
    await pool.query(query);
    console.log("[DB] Volume optimization tables initialized: lot_threshold_analysis_runs, lot_threshold_analysis, lot_threshold_final; run sequence checked");
  } catch (err) {
    console.error("❌ Failed to initialize lot threshold tables:", err.message);
    throw err;
  }
}

/**
 * ✅ Lấy khoảng thời gian "đặc quánh" nhất (intersection)
 * MAX(min_time) → MIN(max_time) per (source_table, symbol)
 */
async function getOverlapTimeRange(sourceInput = null) {
  const { fromClause } = await resolveTableSubquery(sourceInput);
  const query = `
    WITH min_max_time_symbol_backtest_name AS (
      SELECT source_table, symbol, MIN(time) AS min_time, MAX(time) AS max_time
      FROM ${fromClause}
      WHERE symbol IS NOT NULL AND type NOT IN ('balance')
      GROUP BY source_table, symbol
    )
    SELECT
      MAX(min_time) AS time_begin, 
      MIN(max_time) AS time_end
    FROM min_max_time_symbol_backtest_name;
  `;

  try {
    const { rows } = await pool.query(query);
    if (!rows[0] || !rows[0].time_begin || !rows[0].time_end) {
      throw new Error("Không tìm thấy time range từ backtest data sources");
    }
    return {
      time_begin: rows[0].time_begin,
      time_end: rows[0].time_end,
    };
  } catch (err) {
    console.error("❌ Failed to get overlap time range:", err.message);
    throw err;
  }
}

/**
 * ✅ Lấy danh sách tất cả (strategy_id, source_table, symbol)
 */
async function getStrategyList(sourceInput = null) {
  const resolved = await resolveTableSubquery(sourceInput);
  const query = `
    SELECT strategy_id, backtest_table AS source_table, symbol
    FROM strategy_metadata
    ${resolved.strategyWhere.replace(/^WHERE /, 'WHERE ')}
    ORDER BY symbol, strategy_id;
  `;

  try {
    const { rows } = await pool.query(query, resolved.strategyParams);
    return rows;
  } catch (err) {
    console.error("❌ Failed to get strategy list:", err.message);
    throw err;
  }
}

async function getSourceTables(sourceInput = null) {
  const resolved = await resolveTableSubquery(sourceInput);
  return resolved.validTables;
}

function createAnalysisRunId() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  return pool.query("SELECT nextval('lot_threshold_analysis_run_seq') AS seq")
    .then(({ rows }) => `LTA-${date}-${String(rows[0].seq).padStart(4, '0')}`);
}

async function createAnalysisRun({ name, sourceTables, configs, createdBy = null }) {
  const analysisRunId = await createAnalysisRunId();
  const result = await pool.query(
    `INSERT INTO lot_threshold_analysis_runs
      (analysis_run_id, name, source_tables, configs_json, status, created_by)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, 'RUNNING', $5)
     RETURNING *`,
    [analysisRunId, name || analysisRunId, JSON.stringify(sourceTables || []), JSON.stringify(configs || {}), createdBy]
  );
  return result.rows[0];
}

async function updateAnalysisRun(analysisRunId, patch = {}) {
  const allowed = ['status', 'time_begin', 'time_end', 'total_strategies', 'succeeded_strategies', 'failed_strategies', 'completed_at', 'error_message'];
  const entries = Object.entries(patch).filter(([key, value]) => allowed.includes(key) && value !== undefined);
  if (entries.length === 0) return null;
  const values = [analysisRunId];
  const assignments = entries.map(([key, value], index) => {
    values.push(value);
    return `${key} = $${index + 2}`;
  });
  assignments.push('updated_at = NOW()');
  const result = await pool.query(
    `UPDATE lot_threshold_analysis_runs SET ${assignments.join(', ')} WHERE analysis_run_id = $1 RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

function normalizeSourceTables(sourceInput) {
  if (!sourceInput || sourceInput === 'all_backtests') return [];
  let tables = [];
  if (Array.isArray(sourceInput)) {
    tables = sourceInput;
  } else if (typeof sourceInput === 'string') {
    tables = sourceInput.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [...new Set(tables.map((table) => String(table).trim().toLowerCase()))].sort();
}

async function validateAnalysisRun(analysisRunId, sourceInput = null, actor = getRequestActor()) {
  const runResult = await pool.query(
    `SELECT * FROM lot_threshold_analysis_runs WHERE analysis_run_id = $1`,
    [analysisRunId]
  );
  const run = runResult.rows[0];
  if (!run) {
    const error = new Error(`Analysis Run '${analysisRunId}' không tồn tại`);
    error.code = 'ANALYSIS_RUN_NOT_FOUND';
    error.status = 404;
    throw error;
  }
  await assertAnalysisRunAccess(run, actor);
  if (run.status !== 'COMPLETED') {
    const error = new Error(`Analysis Run '${analysisRunId}' chưa hoàn tất (trạng thái: ${run.status})`);
    error.code = 'ANALYSIS_RUN_NOT_COMPLETED';
    error.status = 400;
    throw error;
  }

  if (sourceInput) {
    const reqSources = sourceInput === 'all_backtests'
      ? normalizeSourceTables(await getSourceTables('all_backtests'))
      : normalizeSourceTables(sourceInput);
    const runSources = normalizeSourceTables(run.source_tables);
    const isMatch = reqSources.length === runSources.length && reqSources.every((val, idx) => val === runSources[idx]);
    if (!isMatch) {
      const error = new Error(`Analysis Run '${analysisRunId}' không khớp với Data Source đã chọn`);
      error.code = 'ANALYSIS_RUN_SOURCE_MISMATCH';
      error.status = 400;
      throw error;
    }
  }

  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM lot_threshold_final WHERE analysis_run_id = $1`,
    [analysisRunId]
  );
  if (parseInt(countResult.rows[0].total) === 0) {
    const error = new Error(`Analysis Run '${analysisRunId}' không có dữ liệu threshold`);
    error.code = 'ANALYSIS_RUN_NO_THRESHOLD_DATA';
    error.status = 400;
    throw error;
  }

  return run;
}

async function getAnalysisRuns({ sourceTable = null, limit = 50, actor = getRequestActor() } = {}) {
  const params = [];
  let where = "WHERE status = 'COMPLETED'";
  const requestedLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const normalized = sourceTable === 'all_backtests'
    ? normalizeSourceTables(await getSourceTables('all_backtests'))
    : normalizeSourceTables(sourceTable);
  if (sourceTable) {
    params.push(JSON.stringify(normalized));
    where += ` AND source_tables = $${params.length}::jsonb`;
  }
  const { rows } = await pool.query(
    `SELECT * FROM lot_threshold_analysis_runs ${where}
     ORDER BY started_at DESC`,
    params
  );
  if (!actor || actor.isAdmin) return rows.slice(0, requestedLimit);
  const accessible = new Set(
    (await require('../service/backtestAccessService').getAccessibleDataSources(actor))
      .map((source) => source.source_name),
  );
  return rows.filter((run) => {
    const sources = normalizeSourceTables(run.source_tables);
    return sources.length > 0 && sources.every((source) => accessible.has(source));
  }).slice(0, requestedLimit);
}

async function deleteAnalysisRun(analysisRunId, actor = getRequestActor()) {
  if (!analysisRunId) throw new Error('analysisRunId is required');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const runResult = await client.query(
      `SELECT analysis_run_id, status, created_by, source_tables
       FROM lot_threshold_analysis_runs
       WHERE analysis_run_id = $1
       FOR UPDATE`,
      [analysisRunId]
    );
    const run = runResult.rows[0];
    if (!run) {
      await client.query('ROLLBACK');
      return false;
    }
    await assertAnalysisRunAccess(run, actor);
    if (run.status === 'RUNNING') {
      await client.query('ROLLBACK');
      const error = new Error('Cannot delete a running analysis');
      error.code = 'ANALYSIS_RUN_RUNNING';
      throw error;
    }

    await client.query('DELETE FROM lot_threshold_final WHERE analysis_run_id = $1', [analysisRunId]);
    await client.query('DELETE FROM lot_threshold_analysis WHERE analysis_run_id = $1', [analysisRunId]);
    await client.query('DELETE FROM lot_threshold_analysis_runs WHERE analysis_run_id = $1', [analysisRunId]);
    await client.query('COMMIT');
    return true;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* rollback best effort */ }
    throw error;
  } finally {
    client.release();
  }
}

async function resolveRunId(analysisRunId = null, sourceTable = null, actor = getRequestActor()) {
  if (analysisRunId) {
    const result = await pool.query(
      'SELECT analysis_run_id, created_by, source_tables FROM lot_threshold_analysis_runs WHERE analysis_run_id = $1',
      [analysisRunId]
    );
    if (!result.rows[0]) {
      const error = new Error(`Analysis Run '${analysisRunId}' does not exist`);
      error.code = 'ANALYSIS_RUN_NOT_FOUND';
      error.status = 404;
      throw error;
    }
    await assertAnalysisRunAccess(result.rows[0], actor);
    return analysisRunId;
  }
  const runs = await getAnalysisRuns({ sourceTable, limit: 1, actor });
  return runs[0]?.analysis_run_id || 'run-lot-01';
}

/**
 * ✅ Lấy time range riêng cho từng strategy
 * Dùng để tránh phụ thuộc vào global intersection bị rỗng
 */
async function getStrategyTimeRanges(sourceInput = null) {
  const { fromClause } = await resolveTableSubquery(sourceInput);
  const query = `
    SELECT
      strategy_id,
      source_table,
      MIN(time) AS time_begin,
      MAX(time) AS time_end
    FROM ${fromClause}
    WHERE type NOT IN ('balance')
    GROUP BY strategy_id, source_table
    ORDER BY strategy_id, source_table;
  `;

  try {
    const { rows } = await pool.query(query);
    return rows;
  } catch (err) {
    console.error("❌ Failed to get strategy time ranges:", err.message);
    throw err;
  }
}

/**
 * ✅ Lấy tất cả deals của 1 strategy trong time range
 * Fetch 1 lần, không filter volume → JS-side sẽ filter cho 91 levels
 * Sort theo deal ASC để tính cumulative_profit đúng thứ tự
 */
async function getDealsForStrategy(strategyId, sourceTable, timeBegin, timeEnd) {
  const { fromClause } = await resolveTableSubquery(sourceTable);
  const query = `
    SELECT deal, time, direction, profit::numeric AS profit, commission::numeric AS commission,
           swap::numeric AS swap, volume::numeric AS volume
    FROM ${fromClause}
    WHERE strategy_id = $1 
      AND source_table = $2
      AND time >= $3 AND time <= $4
      AND type NOT IN ('balance')
    ORDER BY deal ASC;
  `;

  try {
    const { rows } = await pool.query(query, [strategyId, sourceTable, timeBegin, timeEnd]);
    return rows.map((row) => ({
      deal: row.deal,
      time: row.time,
      direction: row.direction,
      profit: row.profit !== null && row.profit !== undefined ? parseFloat(row.profit) : 0,
      commission: row.commission !== null && row.commission !== undefined ? parseFloat(row.commission) : 0,
      swap: row.swap !== null && row.swap !== undefined ? parseFloat(row.swap) : 0,
      volume: row.volume !== null && row.volume !== undefined ? parseFloat(row.volume) : 0,
    }));
  } catch (err) {
    console.error(`❌ Failed to get deals for ${strategyId}/${sourceTable}:`, err.message);
    throw err;
  }
}

/**
 * ✅ Batch insert kết quả analysis
 * Dùng ON CONFLICT DO UPDATE để có thể chạy lại
 */
async function batchInsertResults(rows) {
  if (!rows || rows.length === 0) return;

  const client = await safeConnect(pool, 'LOT_THRESHOLD');
  try {
    await client.query("BEGIN");

    // Insert theo batch 100 rows
    const BATCH_SIZE = 100;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const values = [];
      const placeholders = [];

      batch.forEach((row, idx) => {
        const offset = idx * 23;
        placeholders.push(
          `(${Array.from({ length: 23 }, (_, valueIndex) => `$${offset + valueIndex + 1}`).join(', ')})`
        );
        values.push(
          row.analysis_run_id,
          row.strategy_id,
          row.source_table,
          row.symbol,
          row.lot_threshold,
          row.pd_ratio,
          row.total_profit,
          row.max_drawdown,
          row.total_trades,
          row.winrate,
          row.profit_factor ?? null,
          row.recovery_factor ?? null,
          row.sharpe_ratio ?? null,
          row.largest_loss_trade ?? null,
          row.largest_profit_trade ?? null,
          row.largest_profit_trade_ratio ?? null,
          row.risk_reward_ratio ?? null,
          row.lr_correlation ?? null,
          row.avg_profit ?? null,
          row.avg_loss ?? null,
          true,
          row.time_begin,
          row.time_end
        );
      });

      const query = `
        INSERT INTO lot_threshold_analysis 
          (analysis_run_id, strategy_id, source_table, symbol, lot_threshold, pd_ratio,
           total_profit, max_drawdown, total_trades, winrate, profit_factor, recovery_factor,
           sharpe_ratio, largest_loss_trade, largest_profit_trade, largest_profit_trade_ratio,
           risk_reward_ratio, lr_correlation, avg_profit, avg_loss, metrics_complete, time_begin, time_end)
        VALUES ${placeholders.join(", ")}
        ON CONFLICT (analysis_run_id, strategy_id, source_table, lot_threshold)
        DO UPDATE SET
          symbol = EXCLUDED.symbol,
          pd_ratio = EXCLUDED.pd_ratio,
          total_profit = EXCLUDED.total_profit,
          max_drawdown = EXCLUDED.max_drawdown,
          total_trades = EXCLUDED.total_trades,
          winrate = EXCLUDED.winrate,
          profit_factor = EXCLUDED.profit_factor,
          recovery_factor = EXCLUDED.recovery_factor,
          sharpe_ratio = EXCLUDED.sharpe_ratio,
          largest_loss_trade = EXCLUDED.largest_loss_trade,
          largest_profit_trade = EXCLUDED.largest_profit_trade,
          largest_profit_trade_ratio = EXCLUDED.largest_profit_trade_ratio,
          risk_reward_ratio = EXCLUDED.risk_reward_ratio,
          lr_correlation = EXCLUDED.lr_correlation,
          avg_profit = EXCLUDED.avg_profit,
          avg_loss = EXCLUDED.avg_loss,
          metrics_complete = EXCLUDED.metrics_complete,
          time_begin = EXCLUDED.time_begin,
          time_end = EXCLUDED.time_end,
          computed_at = NOW();
      `;

      await client.query(query, values);
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Failed to batch insert results:", err.message);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * ✅ Chèn một kết quả optimal trực tiếp vào lot_threshold_final
 */
async function selectCandidate({ analysisRunId, strategyId, sourceTable, lotThreshold, selectionType, selectedBy = null }) {
  if (!Object.values(LOT_SELECTION_TYPE).includes(selectionType)) {
    const error = new Error(LOT_THRESHOLD_MESSAGES.INVALID_SELECTION_TYPE);
    error.status = 400;
    throw error;
  }
  const client = await safeConnect(pool, 'LOT_THRESHOLD_SELECTION');
  try {
    await client.query('BEGIN');
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
      [analysisRunId, `${strategyId}:${sourceTable}`]
    );

    const groupResult = await client.query(
      `SELECT * FROM lot_threshold_analysis
       WHERE analysis_run_id = $1 AND strategy_id = $2 AND source_table = $3
       FOR UPDATE`,
      [analysisRunId, strategyId, sourceTable]
    );
    const candidate = groupResult.rows.find((row) => Number(row.lot_threshold) === Number(lotThreshold));
    if (!candidate) {
      const error = new Error(LOT_THRESHOLD_MESSAGES.CANDIDATE_NOT_FOUND);
      error.code = 'LOT_THRESHOLD_CANDIDATE_NOT_FOUND';
      error.status = 404;
      throw error;
    }
    if (selectionType === LOT_SELECTION_TYPE.MANUAL && !candidate.metrics_complete) {
      const error = new Error(LOT_THRESHOLD_MESSAGES.METRICS_INCOMPLETE);
      error.code = 'LOT_THRESHOLD_METRICS_INCOMPLETE';
      error.status = 409;
      throw error;
    }

    const currentResult = await client.query(
      `SELECT lot_threshold, auto_lot_threshold, is_fallback FROM lot_threshold_final
       WHERE analysis_run_id = $1 AND strategy_id = $2 AND source_table = $3`,
      [analysisRunId, strategyId, sourceTable]
    );
    const current = currentResult.rows[0] || null;
    const autoLotThreshold = selectionType === LOT_SELECTION_TYPE.MANUAL
      ? (current?.auto_lot_threshold ?? current?.lot_threshold ?? lotThreshold)
      : lotThreshold;
    const isFallback = selectionType === LOT_SELECTION_TYPE.MANUAL
      ? Boolean(current?.is_fallback)
      : selectionType === LOT_SELECTION_TYPE.FALLBACK;

    await client.query(
      `UPDATE lot_threshold_analysis
       SET the_chosen_one = FALSE
       WHERE analysis_run_id = $1 AND strategy_id = $2 AND source_table = $3`,
      [analysisRunId, strategyId, sourceTable]
    );
    await client.query(
      `UPDATE lot_threshold_analysis
       SET the_chosen_one = TRUE
       WHERE analysis_run_id = $1 AND strategy_id = $2 AND source_table = $3 AND lot_threshold = $4`,
      [analysisRunId, strategyId, sourceTable, lotThreshold]
    );

    const finalResult = await client.query(
      `INSERT INTO lot_threshold_final (
         analysis_run_id, strategy_id, source_table, symbol, lot_threshold, best_pd,
         total_profit, max_drawdown, total_trades, winrate, profit_factor, recovery_factor,
         sharpe_ratio, largest_loss_trade, largest_profit_trade, largest_profit_trade_ratio,
         risk_reward_ratio, lr_correlation, avg_profit, avg_loss, time_begin, time_end,
         is_fallback, selection_type, selected_by, selected_at, auto_lot_threshold, computed_at
       )
       SELECT
         analysis_run_id, strategy_id, source_table, symbol, lot_threshold, pd_ratio,
         total_profit, max_drawdown, total_trades, winrate, profit_factor, recovery_factor,
         sharpe_ratio, largest_loss_trade, largest_profit_trade, largest_profit_trade_ratio,
         risk_reward_ratio, lr_correlation, avg_profit, avg_loss, time_begin, time_end,
         $8, $5, $6, NOW(), $7, NOW()
       FROM lot_threshold_analysis
       WHERE analysis_run_id = $1 AND strategy_id = $2 AND source_table = $3 AND lot_threshold = $4
       ON CONFLICT (analysis_run_id, strategy_id, source_table) DO UPDATE SET
         symbol = EXCLUDED.symbol, lot_threshold = EXCLUDED.lot_threshold, best_pd = EXCLUDED.best_pd,
         total_profit = EXCLUDED.total_profit, max_drawdown = EXCLUDED.max_drawdown,
         total_trades = EXCLUDED.total_trades, winrate = EXCLUDED.winrate,
         profit_factor = EXCLUDED.profit_factor, recovery_factor = EXCLUDED.recovery_factor,
         sharpe_ratio = EXCLUDED.sharpe_ratio, largest_loss_trade = EXCLUDED.largest_loss_trade,
         largest_profit_trade = EXCLUDED.largest_profit_trade,
         largest_profit_trade_ratio = EXCLUDED.largest_profit_trade_ratio,
         risk_reward_ratio = EXCLUDED.risk_reward_ratio, lr_correlation = EXCLUDED.lr_correlation,
         avg_profit = EXCLUDED.avg_profit, avg_loss = EXCLUDED.avg_loss,
         time_begin = EXCLUDED.time_begin, time_end = EXCLUDED.time_end,
         is_fallback = EXCLUDED.is_fallback, selection_type = EXCLUDED.selection_type,
         selected_by = EXCLUDED.selected_by, selected_at = EXCLUDED.selected_at,
         auto_lot_threshold = EXCLUDED.auto_lot_threshold, computed_at = NOW()
       RETURNING *, lot_threshold AS optimal_lot_threshold`,
      [analysisRunId, strategyId, sourceTable, lotThreshold, selectionType, selectedBy, autoLotThreshold, isFallback]
    );

    await client.query('COMMIT');
    return { previousLotThreshold: current?.lot_threshold ?? null, selection: finalResult.rows[0] };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* rollback best effort */ }
    throw error;
  } finally {
    client.release();
  }
}

async function insertOptimalResult(row) {
  return selectCandidate({
    analysisRunId: row.analysis_run_id,
    strategyId: row.strategy_id,
    sourceTable: row.source_table,
    lotThreshold: row.lot_threshold,
    selectionType: row.is_fallback ? LOT_SELECTION_TYPE.FALLBACK : LOT_SELECTION_TYPE.AUTO,
  });
}

/**
 * ✅ Lấy kết quả analysis (có phân trang + filter)
 */
async function getResults({ analysisRunId, symbol, strategyId, sourceTable, page = 1, pageSize = 50, sortBy = 'pd_ratio', sortDir = 'desc' }) {
  const params = [];
  let paramIdx = 1;
  const resolvedRunId = await resolveRunId(analysisRunId, sourceTable);
  let where = `WHERE analysis_run_id = $${paramIdx}`;
  params.push(resolvedRunId);
  paramIdx++;

  if (symbol) {
    where += ` AND UPPER(symbol) = UPPER($${paramIdx})`;
    params.push(symbol);
    paramIdx++;
  }
  if (strategyId) {
    where += ` AND strategy_id ILIKE $${paramIdx}`;
    params.push(`%${strategyId}%`);
    paramIdx++;
  }
  if (sourceTable) {
    where += ` AND source_table = $${paramIdx}`;
    params.push(sourceTable);
    paramIdx++;
  }

  // Safe sort columns - map volume_threshold sang lot_threshold
  const allowedSorts = ['pd_ratio', 'total_profit', 'max_drawdown', 'total_trades', 'total_orders', 'winrate', 'volume_threshold', 'lot_threshold', 'strategy_id', 'symbol'];
  let safeSortBy = allowedSorts.includes(sortBy) ? sortBy : 'pd_ratio';
  if (safeSortBy === 'volume_threshold') {
    safeSortBy = 'lot_threshold';
  }
  if (safeSortBy === 'total_orders') {
    safeSortBy = 'total_trades';
  }
  const safeSortDir = sortDir === 'asc' ? 'ASC' : 'DESC';

  const countQuery = `SELECT COUNT(*) AS total FROM lot_threshold_analysis ${where}`;
  const countResult = await pool.query(countQuery, params);
  const total = parseInt(countResult.rows[0].total);

  const offset = (page - 1) * pageSize;
  const dataQuery = `
    SELECT
      analysis_run_id, strategy_id, source_table, symbol, lot_threshold, lot_threshold AS volume_threshold,
      pd_ratio, total_profit, max_drawdown, total_trades, total_trades AS total_orders, winrate,
      profit_factor, recovery_factor, sharpe_ratio, largest_loss_trade, largest_profit_trade,
      largest_profit_trade_ratio, risk_reward_ratio, lr_correlation, avg_profit, avg_loss,
      metrics_complete, the_chosen_one, time_begin, time_end, computed_at
    FROM lot_threshold_analysis 
    ${where}
    ORDER BY ${safeSortBy} ${safeSortDir} NULLS LAST
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
  `;
  params.push(pageSize, offset);

  const dataResult = await pool.query(dataQuery, params);

  return {
    data: dataResult.rows,
    pagination: {
      total,
      totalPages: Math.ceil(total / pageSize),
      currentPage: page,
      pageSize,
    },
  };
}

async function clearResults() {
  await pool.query("TRUNCATE TABLE lot_threshold_analysis, lot_threshold_final RESTART IDENTITY");
  console.log("🧹 Cleared lot_threshold_analysis & lot_threshold_final tables");
}


/**
 * ✅ Lấy optimal lot threshold cho mỗi strategy (P/D cao nhất) từ bảng lot_threshold_final
 */
async function getOptimalResults({ analysisRunId, symbol, sourceTable, strategyId, page = 1, pageSize = 50, isFallback }) {
  const params = [];
  let paramIdx = 1;
  const resolvedRunId = await resolveRunId(analysisRunId, sourceTable);
  let where = `WHERE analysis_run_id = $${paramIdx}`;
  params.push(resolvedRunId);
  paramIdx++;

  if (symbol) {
    where += ` AND UPPER(symbol) = UPPER($${paramIdx})`;
    params.push(symbol);
    paramIdx++;
  }
  if (sourceTable) {
    where += ` AND source_table = $${paramIdx}`;
    params.push(sourceTable);
    paramIdx++;
  }
  if (strategyId) {
    where += ` AND strategy_id ILIKE $${paramIdx}`;
    params.push(`%${strategyId}%`);
    paramIdx++;
  }
  if (isFallback !== undefined && isFallback !== null && isFallback !== 'all') {
    const val = isFallback === 'true' || isFallback === true;
    where += ` AND is_fallback = $${paramIdx}`;
    params.push(val);
    paramIdx++;
  }

  const countQuery = `
    SELECT COUNT(*) AS total FROM lot_threshold_final ${where}
  `;
  const countResult = await pool.query(countQuery, params);
  const total = parseInt(countResult.rows[0].total);

  const offset = (page - 1) * pageSize;
  const query = `
    SELECT
      analysis_run_id, strategy_id, source_table, symbol, lot_threshold, lot_threshold AS optimal_lot_threshold,
      best_pd, total_profit, max_drawdown, total_trades, total_trades AS total_orders, winrate,
      profit_factor, recovery_factor, sharpe_ratio, largest_loss_trade, largest_profit_trade,
      largest_profit_trade_ratio, risk_reward_ratio, lr_correlation, avg_profit, avg_loss,
      time_begin, time_end, is_fallback, selection_type, selected_by, selected_at,
      auto_lot_threshold, computed_at
    FROM lot_threshold_final
    ${where}
    ORDER BY
      -- Sort theo stt bot (3 số đầu của strategy_id), sau đó symbol, timeframe, direction

      (REGEXP_MATCH(strategy_id, '^(\\d+)'))[1]::int ASC NULLS LAST,
      REGEXP_REPLACE(strategy_id, '^(\\d+)', '') ASC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
  `;
  params.push(pageSize, offset);

  const dataResult = await pool.query(query, params);

  return {
    data: dataResult.rows,
    pagination: {
      total,
      totalPages: Math.ceil(total / pageSize),
      currentPage: page,
      pageSize,
    },
  };
}

async function getCandidateGroup(analysisRunId, strategyId, sourceTable) {
  const { rows } = await pool.query(
    `SELECT * FROM lot_threshold_analysis
     WHERE analysis_run_id = $1 AND strategy_id = $2 AND source_table = $3
     ORDER BY lot_threshold DESC`,
    [analysisRunId, strategyId, sourceTable]
  );
  return rows;
}

/**
 * Lấy ngưỡng volume tối đa động của từng symbol dựa trên commission >= -500
 */
async function getSymbolMaxVolumes(sourceInput = null) {
  const { fromClause } = await resolveTableSubquery(sourceInput);
  const query = `
    SELECT symbol, max(volume) as optimal_volume
    FROM ${fromClause}
    WHERE commission >= -500 AND direction = 'in' AND symbol IS NOT NULL
    GROUP BY symbol;
  `;
  try {
    const { rows } = await pool.query(query);
    return rows;
  } catch (err) {
    console.error("❌ Failed to get symbol max volumes:", err.message);
    throw err;
  }
}

const { safeOp } = require("./strategyFilterHelper");

async function getStrategiesByAnalysisRun(options) {
  const {
    analysisRunId,
    backtestTable,
    symbol,
    search,
    type,
    timeframe,
    pd,
    totalNetProfit,
    totalTrades,
    winrate,
    largestProfitTradeRatio,
    riskRewardRatio,
    drawdown,
    largestLossTrade,
    profitFactor,
    sharpeRatio,
    recoveryFactor,
    lrCorrelation,
    operators = {},
    ranges = {},
    sortBy = 'pd_ratio',
    sortDir = 'desc',
    page = 1,
    pageSize = 20,
    idsOnly = false
  } = options;

  const run = await validateAnalysisRun(analysisRunId, backtestTable);

  const ops = {
    pd:                      safeOp(operators?.pd),
    totalNetProfit:          safeOp(operators?.totalNetProfit),
    totalTrades:             safeOp(operators?.totalTrades),
    winrate:                 safeOp(operators?.winrate),
    largestProfitTradeRatio: safeOp(operators?.largestProfitTradeRatio),
    riskRewardRatio:         safeOp(operators?.riskRewardRatio),
    drawdown:                safeOp(operators?.drawdown),
    largestLossTrade:        safeOp(operators?.largestLossTrade),
    profitFactor:            safeOp(operators?.profitFactor),
    sharpeRatio:             safeOp(operators?.sharpeRatio),
    recoveryFactor:          safeOp(operators?.recoveryFactor),
    lrCorrelation:           safeOp(operators?.lrCorrelation),
  };

  const params = [analysisRunId];
  let paramIdx = 2;
  let where = "WHERE f.analysis_run_id = $1";

  if (symbol) {
    if (symbol.includes(',')) {
      const symbolList = symbol.split(',').map(s => s.trim()).filter(Boolean);
      const placeholders = symbolList.map((_, i) => `$${paramIdx + i}`).join(', ');
      where += ` AND f.symbol IN (${placeholders})`;
      params.push(...symbolList);
      paramIdx += symbolList.length;
    } else {
      where += ` AND f.symbol = $${paramIdx}`;
      params.push(symbol);
      paramIdx++;
    }
  }

  if (search) {
    where += ` AND f.strategy_id ILIKE $${paramIdx}`;
    params.push(`%${search}%`);
    paramIdx++;
  }

  if (timeframe) {
    where += ` AND m.timeframe = $${paramIdx}`;
    params.push(timeframe);
    paramIdx++;
  }

  if (type === "buy") {
    where += " AND (m.settings->'inputs'->>'AcceptBuy' IN ('true', '1') OR (m.settings->'inputs'->'AcceptBuy')::text::boolean = true)";
  } else if (type === "sell") {
    where += " AND (m.settings->'inputs'->>'AcceptSell' IN ('true', '1') OR (m.settings->'inputs'->'AcceptSell')::text::boolean = true)";
  }

  const addNumFilter = (key, colExpr, val, op, isInt = false) => {
    if (op === 'range') {
      const r = ranges?.[key];
      if (!r) return;
      const parse = isInt ? parseInt : parseFloat;
      if (r.min !== undefined && r.min !== '' && r.min !== null) {
        where += ` AND (${colExpr}) >= $${paramIdx}`;
        params.push(parse(r.min)); paramIdx++;
      }
      if (r.max !== undefined && r.max !== '' && r.max !== null) {
        where += ` AND (${colExpr}) <= $${paramIdx}`;
        params.push(parse(r.max)); paramIdx++;
      }
    } else if (val !== undefined && val !== null && val !== '') {
      const parse = isInt ? parseInt : parseFloat;
      where += ` AND (${colExpr}) ${op} $${paramIdx}`;
      params.push(parse(val)); paramIdx++;
    }
  };

  addNumFilter('pd', 'f.best_pd', pd, ops.pd);
  addNumFilter('totalNetProfit', 'f.total_profit', totalNetProfit, ops.totalNetProfit);
  addNumFilter('totalTrades', 'f.total_trades', totalTrades, ops.totalTrades, true);
  addNumFilter('winrate', 'f.winrate', winrate, ops.winrate);
  addNumFilter('largestProfitTradeRatio', 'f.largest_profit_trade_ratio', largestProfitTradeRatio, ops.largestProfitTradeRatio);
  addNumFilter('riskRewardRatio', 'f.risk_reward_ratio', riskRewardRatio, ops.riskRewardRatio);
  addNumFilter('profitFactor', 'f.profit_factor', profitFactor, ops.profitFactor);
  addNumFilter('sharpeRatio', 'f.sharpe_ratio', sharpeRatio, ops.sharpeRatio);
  addNumFilter('recoveryFactor', 'f.recovery_factor', recoveryFactor, ops.recoveryFactor);
  addNumFilter('lrCorrelation', 'f.lr_correlation', lrCorrelation, ops.lrCorrelation);

  const drawdownUnit = operators?._drawdownUnit || 'percent';
  const drawdownExpr = drawdownUnit === 'absolute'
    ? 'f.max_drawdown'
    : '((f.max_drawdown / NULLIF(COALESCE((m.settings->>\'initialDeposit\')::numeric, 10000), 0)) * 100)';
  addNumFilter('drawdown', drawdownExpr, drawdown, ops.drawdown);
  addNumFilter('largestLossTrade', 'ABS(f.largest_loss_trade)', largestLossTrade, ops.largestLossTrade);

  if (idsOnly) {
    const idQuery = `
      SELECT f.strategy_id
      FROM lot_threshold_final f
      INNER JOIN strategy_metadata m ON f.strategy_id = m.strategy_id AND f.source_table = m.backtest_table
      ${where}
    `;
    const { rows } = await pool.query(idQuery, params);
    return rows.map((r) => r.strategy_id);
  }

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM lot_threshold_final f
    INNER JOIN strategy_metadata m ON f.strategy_id = m.strategy_id AND f.source_table = m.backtest_table
    ${where}
  `;
  const countRes = await pool.query(countQuery, params);
  const total = parseInt(countRes.rows[0].total) || 0;

  let sortCol = 'f.best_pd';
  if (sortBy === 'profit' || sortBy === 'totalNetProfit') sortCol = 'f.total_profit';
  else if (sortBy === 'drawdown') sortCol = 'f.max_drawdown';
  else if (sortBy === 'quantity' || sortBy === 'total_orders' || sortBy === 'totalTrades') sortCol = 'f.total_trades';
  else if (sortBy === 'winrate') sortCol = 'f.winrate';
  else if (sortBy === 'profitFactor') sortCol = 'f.profit_factor';
  else if (sortBy === 'sharpeRatio') sortCol = 'f.sharpe_ratio';
  else if (sortBy === 'recoveryFactor') sortCol = 'f.recovery_factor';
  else if (sortBy === 'lrCorrelation') sortCol = 'f.lr_correlation';
  else if (sortBy === 'strategy_id') sortCol = 'f.strategy_id';

  const dir = sortDir === 'asc' ? 'ASC' : 'DESC';
  let orderByClause = `ORDER BY ${sortCol} ${dir} NULLS LAST`;
  if (sortBy === 'pd_ratio' || sortBy === 'pd') {
    orderByClause = `ORDER BY f.best_pd ${dir} NULLS LAST, (REGEXP_MATCH(f.strategy_id, '^(\\d+)'))[1]::int ASC NULLS LAST`;
  }

  const offset = (page - 1) * pageSize;
  const dataQuery = `
    SELECT
      f.analysis_run_id,
      f.strategy_id,
      f.source_table AS backtest_table,
      f.symbol,
      f.lot_threshold AS threshold_applied,
      f.best_pd AS pd_ratio,
      f.total_profit,
      f.max_drawdown,
      f.total_trades AS total_orders,
      f.winrate,
      f.profit_factor,
      f.recovery_factor,
      f.sharpe_ratio,
      f.largest_loss_trade,
      f.largest_profit_trade,
      f.largest_profit_trade_ratio,
      f.risk_reward_ratio,
      f.lr_correlation,
      f.avg_profit,
      f.avg_loss,
      f.time_begin,
      f.time_end,
      f.is_fallback AS is_fallback_threshold,
      m.expert_name,
      m.expert_id,
      m.timeframe,
      m.results,
      m.settings
    FROM lot_threshold_final f
    INNER JOIN strategy_metadata m ON f.strategy_id = m.strategy_id AND f.source_table = m.backtest_table
    ${where}
    ${orderByClause}
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
  `;
  params.push(pageSize, offset);

  const { rows } = await pool.query(dataQuery, params);

  const data = rows.map((row) => ({
    strategy_id: row.strategy_id,
    backtest_table: row.backtest_table,
    symbol: row.symbol,
    expert_name: row.expert_name,
    expert_id: row.expert_id,
    timeframe: row.timeframe,
    settings: row.settings,
    analysis_run_id: run.analysis_run_id,
    analysis_run_name: run.name,
    threshold_applied: row.threshold_applied,
    is_fallback_threshold: row.is_fallback_threshold,
    time_begin: run.time_begin,
    time_end: run.time_end,
    metrics_mode: "ANALYSIS_RUN_THRESHOLD",
    total_profit: row.total_profit === null ? null : parseFloat(row.total_profit),
    max_drawdown: row.max_drawdown === null ? null : parseFloat(row.max_drawdown),
    pd_ratio: row.pd_ratio === null ? null : parseFloat(row.pd_ratio),
    quantity: row.total_orders === null ? null : parseInt(row.total_orders, 10),
    winrate: row.winrate === null ? null : parseFloat(row.winrate),
    profit_factor: row.profit_factor === null ? null : parseFloat(row.profit_factor),
    recovery_factor: row.recovery_factor === null ? null : parseFloat(row.recovery_factor),
    sharpe_ratio: row.sharpe_ratio === null ? null : parseFloat(row.sharpe_ratio),
    largest_loss_trade: row.largest_loss_trade === null ? null : parseFloat(row.largest_loss_trade),
    largest_profit_trade_ratio: row.largest_profit_trade_ratio === null ? null : parseFloat(row.largest_profit_trade_ratio),
    risk_reward_ratio: row.risk_reward_ratio === null ? null : parseFloat(row.risk_reward_ratio),
    lr_correlation: row.lr_correlation === null ? null : parseFloat(row.lr_correlation),
    results: row.results || {}
  }));

  return {
    mode: "ANALYSIS_RUN_THRESHOLD",
    analysisRunId: run.analysis_run_id,
    analysisRunName: run.name,
    timeRange: {
      from: run.time_begin,
      to: run.time_end
    },
    thresholdApplied: true,
    data,
    pagination: {
      total,
      totalPages: Math.ceil(total / pageSize),
      currentPage: page,
      pageSize
    }
  };
}

module.exports = {
  initLotThresholdTable,
  getOverlapTimeRange,
  getSourceTables,
  createAnalysisRun,
  updateAnalysisRun,
  getAnalysisRuns,
  deleteAnalysisRun,
  resolveRunId,
  getStrategyList,
  getStrategyTimeRanges,
  getDealsForStrategy,
  batchInsertResults,
  insertOptimalResult,
  selectCandidate,
  getCandidateGroup,
  getResults,
  clearResults,
  getOptimalResults,
  getSymbolMaxVolumes,
  normalizeSourceTables,
  validateAnalysisRun,
  getStrategiesByAnalysisRun,
};
