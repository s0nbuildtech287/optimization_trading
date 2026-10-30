const { getAppPool } = require("../config/db");
const pool = getAppPool();

const STANDARD_BACKTEST_COLUMNS = new Set([
  'time', 'deal', 'symbol', 'type', 'direction', 'volume',
  'price', 'order', 'commission', 'swap', 'profit', 'comment', 'strategy_id'
]);

async function checkIfMaterializedViewExists(viewName = "all_backtests") {
  return false;
}

async function getValidBacktestTables(tables) {
  if (!tables || tables.length === 0) return [];
  try {
    const colRes = await pool.query(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [tables]
    );
    const tableCols = {};
    for (const r of colRes.rows) {
      if (!tableCols[r.table_name]) tableCols[r.table_name] = new Set();
      tableCols[r.table_name].add(r.column_name.toLowerCase());
    }
    return tables.filter((t) => {
      const cols = tableCols[t];
      if (!cols) return false;
      for (const req of STANDARD_BACKTEST_COLUMNS) {
        if (!cols.has(req)) return false;
      }
      return true;
    });
  } catch (err) {
    console.error("❌ Lỗi kiểm tra cấu trúc danh sách bảng:", err.message);
    return [];
  }
}

async function hasStandardBacktestStructure(tableName) {
  try {
    const result = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1`,
      [tableName]
    );
    const cols = new Set(result.rows.map((r) => r.column_name.toLowerCase()));
    for (const req of STANDARD_BACKTEST_COLUMNS) {
      if (!cols.has(req)) return false;
    }
    return true;
  } catch (err) {
    console.error(`❌ Error checking structure of ${tableName}:`, err.message);
    return false;
  }
}

function scheduleRefresh(tableName = null, reason = 'data-change') {
  try {
    const opService = require('../service/opService');
    opService.clearAllCaches();
  } catch (_) {}
}

function scheduleRebuild(reason = 'structure-change') {
  try {
    const opService = require('../service/opService');
    opService.clearAllCaches();
  } catch (_) {}
}

async function waitForReady() {
  return Promise.resolve();
}

function logReadSnapshot(reader, tableName) {
  // No-op for dynamic table query system
}

async function createAllBacktestMaterializedView() {
  console.log("ℹ️ [MV] System is operating in dynamic multi-table mode (no materialized view required)");
}

const recreateMaterializedViewIfNeeded = async () => { scheduleRebuild(); return false; };
const refreshAllBacktestMaterializedView = async () => { scheduleRefresh(); };
const waitForMaterializedViewRefresh = waitForReady;
const ensureMaterializedViewExists = async () => { scheduleRebuild(); };

module.exports = {
  scheduleRefresh,
  scheduleRebuild,
  waitForReady,
  logReadSnapshot,
  checkIfMaterializedViewExists,
  getValidBacktestTables,
  hasStandardBacktestStructure,
  createAllBacktestMaterializedView,
  recreateMaterializedViewIfNeeded,
  refreshAllBacktestMaterializedView,
  waitForMaterializedViewRefresh,
  ensureMaterializedViewExists,
};
