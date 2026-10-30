const { getAppPool } = require("../config/db");

const pool = getAppPool();
const normalizeLimit = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 1000) : fallback;
};

const STATUS_SQL = `CASE
  WHEN status = 'COMPLETED' AND has_warnings THEN 'WARNING'
  WHEN status = 'COMPLETED' THEN 'SUCCESS'
  ELSE status
END`;

const HISTORY_COLUMNS = `
  sync_id AS id,
  sync_id,
  operation_type AS log_type,
  action,
  table_name AS target_table,
  ${STATUS_SQL} AS status,
  total_files,
  unique_names,
  success_files AS success_count,
  failed_files AS failed_count,
  warning_count,
  NULL::bigint AS total_rows_in_db,
  NULL::integer AS strategy_ids_count,
  metadata,
  duration AS duration_ms,
  username AS triggered_by,
  user_id,
  COALESCE(to_timestamp(end_time / 1000.0), updated_at, created_at) AS created_at,
  updated_at
`;

// Compatibility no-op. sync_jobs is initialized by syncProgressTracker.
async function initSystemLogTable() {
  return true;
}

async function getLatestLogsByTable(logType = "SYNC", action = "BACKTEST_SYNC") {
  if (logType !== "SYNC") return [];
  void action;
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (LOWER(table_name)) ${HISTORY_COLUMNS}
       FROM sync_jobs
      WHERE operation_type = 'BACKTEST_SYNC'
        AND table_name IS NOT NULL
      ORDER BY LOWER(table_name), created_at DESC`,
  );
  return rows;
}

async function getLogsByTable(targetTable, limit = 50) {
  const { rows } = await pool.query(
    `SELECT ${HISTORY_COLUMNS}
       FROM sync_jobs
      WHERE LOWER(table_name) = LOWER($1)
        AND operation_type = 'BACKTEST_SYNC'
      ORDER BY created_at DESC
      LIMIT $2`,
    [targetTable, normalizeLimit(limit, 50)],
  );
  return rows;
}

async function getLogsByType(logType, limit = 100, targetTables = null) {
  if (logType !== "SYNC") return [];
  const params = [];
  let tableFilter = "";
  if (Array.isArray(targetTables)) {
    params.push(targetTables.map((table) => String(table).toLowerCase()));
    tableFilter = ` AND LOWER(table_name) = ANY($${params.length}::text[])`;
  }
  params.push(normalizeLimit(limit, 100));
  const { rows } = await pool.query(
    `SELECT ${HISTORY_COLUMNS}
       FROM sync_jobs
      WHERE operation_type = 'BACKTEST_SYNC'
        ${tableFilter}
      ORDER BY created_at DESC
      LIMIT $${params.length}`,
    params,
  );
  return rows;
}

async function cleanupOldLogs(daysToKeep = 90) {
  const parsedDays = Number.parseInt(daysToKeep, 10);
  const retentionDays = Number.isInteger(parsedDays) && parsedDays > 0 ? parsedDays : 90;
  const result = await pool.query(
    `DELETE FROM sync_jobs
      WHERE status IN ('COMPLETED', 'FAILED')
        AND created_at < NOW() - ($1 * INTERVAL '1 day')`,
    [retentionDays],
  );
  return result.rowCount;
}

async function getActivityLogsByTable(targetTable) {
  const { rows } = await pool.query(
    `SELECT ${HISTORY_COLUMNS}
       FROM sync_jobs
      WHERE LOWER(table_name) = LOWER($1)
        AND operation_type = 'BACKTEST_SYNC'
      ORDER BY created_at DESC
      LIMIT 50`,
    [targetTable],
  );
  return rows;
}

async function deleteLogsByTable(targetTable) {
  const result = await pool.query(
    `DELETE FROM sync_jobs
      WHERE LOWER(table_name) = LOWER($1)
        AND operation_type = 'BACKTEST_SYNC'
        AND status IN ('COMPLETED', 'FAILED')`,
    [targetTable],
  );
  return result.rowCount;
}

async function getSyncJobIssues(syncId) {
  const { rows } = await pool.query(
    `SELECT sync_id, table_name, user_id, username, metadata
       FROM sync_jobs
      WHERE sync_id = $1
        AND operation_type = 'BACKTEST_SYNC'`,
    [syncId],
  );
  return rows[0] || null;
}

module.exports = {
  initSystemLogTable,
  getLatestLogsByTable,
  getLogsByTable,
  getLogsByType,
  cleanupOldLogs,
  getActivityLogsByTable,
  deleteLogsByTable,
  getSyncJobIssues,
};
