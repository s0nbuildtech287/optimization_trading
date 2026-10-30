const opDao = require("../dao/opDao");
const constants = require("../utils/constants");
const { db } = require("../config/db");
const ggService = require("./ggSheetService");
const dashboardService = require("./dashboardService");
const strategyMetadataDAO = require("../dao/strategyMetadataDao");
const { parseVolume } = require("../utils/parseDeals");

const { getAppPool } = require("../config/db");
const pool = getAppPool();

const TABLE_NAME = db.backtest.TABLE_NAME;
const PRIMARY_KEYS = db.backtest.PRIMARY_KEY;
const ALLOWED_COLUMNS = db.backtest.ALLOWED_COLUMNS;
const COLUMN_TYPES = db.backtest.COLUMN_TYPES;
const DATABASE_NAME = db.backtest.DATABASE_NAME;

const filterCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 phút

const validateBacktestTableName = (tableName) => {
  if (!tableName || !/^backtest[a-z0-9_]*$/i.test(tableName)) {
    throw new Error("Invalid table name. Must start with 'backtest' followed by letters, numbers, or underscores.");
  }
};

const getFilterOptions = async (tableName) => {
  const cacheKey = `filter_${tableName}`;
  const cached = filterCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const [years, symbols, strategyIds] = await Promise.all([opDao.getDistinctYears(tableName), opDao.getDistinctSymbols(tableName), opDao.getDistinctStrategyIds(tableName)]);

  const data = { year: years, symbol: symbols, strategyIds };

  filterCache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
};

const clearFilterCache = (tableName = null) => {
  if (tableName) {
    filterCache.delete(`filter_${tableName}`);
  } else {
    filterCache.clear();
  }
};

const clearAllCaches = (tableName = null) => {
  try {
    clearFilterCache(tableName);

    // Sử dụng require động để tránh dependency vòng tròn khi import
    const strategyService = require("./strategyService");
    const orderService = require("./orderService");
    const dashboardService = require("./dashboardService");
    const riskAnalysisService = require("./riskAnalysisService");
    const behaviorAnalysisService = require("./behaviorAnalysisService");
    const comparativeRankingService = require("./comparativeRankingService");

    strategyService.clearStrategyCache(tableName);
    orderService.clearOrderCache(tableName);
    orderService.clearOrderCache("all_backtests");
    dashboardService.clearDashboardCache();

    riskAnalysisService.clearRiskAnalysisCache(tableName);
    riskAnalysisService.clearRiskAnalysisCache();

    behaviorAnalysisService.clearBehaviorAnalysisCache(tableName);
    behaviorAnalysisService.clearBehaviorAnalysisCache();

    comparativeRankingService.clearComparativeCache(tableName);
    comparativeRankingService.clearComparativeCache();

    console.log(`🧹 Đã dọn dẹp sạch sẽ toàn bộ caches cho bảng: ${tableName || "ALL"}`);
  } catch (err) {
    console.error("⚠️ Lỗi khi dọn dẹp hệ thống caches:", err.message);
  }
};

const createDatabaseIfNotExists = async () => {
  const exists = await opDao.checkIfDatabaseExists(DATABASE_NAME);
  if (exists) {
    return 1;
  }
  await opDao.createDatabase(DATABASE_NAME);
  return 0;
};

const createTable = async (tableName, columns) => {
  try {
    validateBacktestTableName(tableName);
    const exists = await opDao.checkIfTableExists(tableName);
    if (exists) {
      return 1;
    }

    if (!columns || columns.length === 0) {
      throw new Error("Danh sách cột là bắt buộc");
    }

    const formattedColumns = columns.map((col) => ({
      name: col.toLowerCase(),
      type: COLUMN_TYPES[col] || "TEXT",
    }));

    const pkColumns = PRIMARY_KEYS;
    const columnNames = columns.map((col) => col.toLowerCase());
    const missingPkColumns = pkColumns.filter((pk) => !columnNames.includes(pk.toLowerCase()));
    if (missingPkColumns.length > 0) {
      throw new Error(`Các cột khóa chính (${missingPkColumns.join(", ")}) không tồn tại trong danh sách cột`);
    }

    const pkClause = `PRIMARY KEY (${PRIMARY_KEYS.map((k) => `"${k.toLowerCase()}"`).join(", ")})`;
    await opDao.createTable(pool, tableName, formattedColumns, pkClause);
  } catch (error) {
    throw error;
  }
};

const insertRows = async (tableName, data, sheetName) => {
  let insertedRows = [];
  if (!data || data.length === 0) {
    return insertedRows;
  }
  const headers = Object.keys(data[0]).filter((h) => ALLOWED_COLUMNS.includes(h));
  if (!headers.includes("Volume") || !headers.includes("Strategy_id")) {
    console.error(`Dữ liệu thiếu cột Volume hoặc Strategy_id. Header: ${headers.join(", ")}`);
    return insertedRows;
  }
  for (const row of data) {
    if (!row["Strategy_id"] || !row["Deal"]) continue;
    const values = headers.map((h) => {
      let value = row[h];
      if (value === null || value === undefined || value === "") return null;

      // Volume có thể bị MT5 rút gọn thành dạng "5.12821K" hoặc "1.5M"
      if (h === "Volume") {
        return parseVolume(value);
      }

      if (typeof value === "string" && (COLUMN_TYPES[h] === "NUMERIC" || COLUMN_TYPES[h] === "BIGINT")) {
        value = value.replace(/[\s,]/g, ""); // Dọn dẹp cả dấu phẩy và khoảng trắng cho cột số
      }

      if (COLUMN_TYPES[h] === "NUMERIC") {
        value = parseFloat(value);
      } else if (COLUMN_TYPES[h] === "BIGINT") {
        value = parseInt(value, 10);
      } else if (COLUMN_TYPES[h] === "TIMESTAMP" || COLUMN_TYPES[h] === "TEXT") {
        return String(value).replace(/'/g, "''");
      }
      return value;
    });
    insertedRows.push(values);
  }

  try {
    await opDao.insertRows(tableName, headers, insertedRows);
  } catch (error) {
    console.error(`Lỗi chèn dòng vào bảng "${tableName}":`, error.message);
    throw error;
  }
  return insertedRows;
};

const { processSheetGroups, asyncProcessSheetGroups } = require("./syncService");

const deleteRowsById = async (tableName, column, values) => {
  validateBacktestTableName(tableName);

  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("Dữ liệu không hợp lệ");
  }

  await opDao.deleteRowsById(tableName, column, values);

  clearAllCaches(tableName);
};

const dropTable = async (tableName) => {
  validateBacktestTableName(tableName);

  const exists = await opDao.checkIfTableExists(tableName);
  if (exists) {
    await opDao.dropTable(tableName);
    clearAllCaches(tableName);
  }
};

const clearData = async (tableName, runType) => {
  validateBacktestTableName(tableName);

  var isClear = runType == null ? constants.RUN_TYPE.NEW_RUN : runType;
  const exists = await opDao.checkIfTableExists(tableName);
  if (exists && isClear == constants.RUN_TYPE.NEW_RUN) {
    await opDao.clearData(tableName);
    // ✅ Clear strategy_metadata for this backtest table to avoid orphan strategies
    try {
      await strategyMetadataDAO.deleteStrategiesByBacktestTable(tableName);
      console.log(`🧹 Cleared strategy_metadata for backtest table ${tableName}`);
    } catch (err) {
      console.error(`⚠️  Failed to clear strategy_metadata for ${tableName}:`, err.message);
    }
    clearAllCaches(tableName);
  }
};

const checkTableExists = async (tableName) => {
  return await opDao.checkIfTableExists(tableName);
};

const updateRowsByColumn = async (tableName, column, sheetNames) => {
  const tasks = sheetNames.map(async (sheetName, index) => {
    const sheetID = await ggService.findSheetIdByName(sheetName);
    if (!sheetID) {
      throw new Error(`Không tìm thấy sheet "${sheetName}" trong bất kỳ sheetID nào.`);
    }
    await deleteRowsById(tableName, column, [sheetName]);

    const auth = authClients[index % authClients.length];
    await readAndInsertSheet({ sheetID, sheetName, auth, tableName });
  });

  await Promise.all(tasks);
};

const { readAndInsertSheet, readSheet, readDriveSheet } = require("./syncService");

const getDataBySheetName = async (query) => {
  const queryKeys = Object.keys(query);
  if (queryKeys.length === 0) {
    throw new Error("Thiếu tham số truy vấn (query parameters)");
  }
  const column = queryKeys[0];
  const rawValue = query[column];
  const sheetNames = rawValue
    .split(",")
    .map((id) => id.trim().replace(/"/g, ""))
    .filter((id) => id);

  if (sheetNames.length === 0) {
    throw new Error(`Thiếu giá trị cho tham số ${column}`);
  }
  return { column, sheetNames };
};

const getPagedData = async (tableName, page, pageSize, strategyId = null, symbol = null, year = null, search = null, startDate = null, endDate = null) => {
  const limit = pageSize;
  const offset = (page - 1) * pageSize;

  // Lấy data, counts và totals
  const [data, totalWithBalance, totalDisplayed, totals] = await Promise.all([
    opDao.getDataPage(tableName, limit, offset, strategyId, symbol, year, search, startDate, endDate),
    opDao.getTotalCount(tableName, strategyId, symbol, year, search, startDate, endDate),
    opDao.getTotalCountDisplayed(tableName, strategyId, symbol, year, search, startDate, endDate),
    opDao.getTotals(tableName, strategyId, symbol, year, search, startDate, endDate),
  ]);

  // Pagination tính theo displayed count (không có balance)
  const totalPages = Math.ceil(totalDisplayed / pageSize);

  const result = {
    data,
    pagination: {
      total: totalWithBalance, // Frontend hiển thị tổng số (có balance)
      totalDisplayed: totalDisplayed, // Số dòng hiển thị (không balance)
      totalPages, // Pagination tính theo displayed
      currentPage: page,
      pageSize,
    },
    totals: {
      commission: totals.totalCommission,
      swap: totals.totalSwap,
      profit: totals.totalProfit,
    },
    // ✅ KHÔNG TRẢ FILTER NỮA - TÁCH THÀNH API RIÊNG
  };

  return result;
};

// ✅ NEW: Get balance chart data
const getBalanceChartData = async (tableName, strategyId, initialDeposit = 1000000, filters = {}) => {
  return await opDao.getBalanceChartData(tableName, strategyId, initialDeposit, filters);
};

// ─── BACKTEST TABLE MANAGEMENT ─────────────────────────────────────────────────
/**
 * ✅ Get all backtest tables
 */
const getBacktestTables = async () => {
  try {
    const tables = await opDao.getAllBacktestTables();
    return tables;
  } catch (err) {
    console.error("❌ Error getting backtest tables:", err.message);
    throw err;
  }
};

/**
 * ✅ Create new backtest table
 */
const createBacktestTable = async (tableName, ownerUserId = undefined) => {
  try {
    validateBacktestTableName(tableName);
    const result = await opDao.createBacktestTable(tableName, ownerUserId);
    clearFilterCache();
    return result;
  } catch (err) {
    console.error("❌ Error creating backtest table:", err.message);
    throw err;
  }
};

const deleteBacktestTable = async (tableName) => {
  try {
    validateBacktestTableName(tableName);
    const result = await opDao.deleteBacktestTable(tableName);
    clearAllCaches(tableName);
    return result;
  } catch (err) {
    console.error("Error deleting backtest table:", err.message);
    throw err;
  }
};

module.exports = {
  createTable,
  dropTable,
  clearData,
  insertRows,
  deleteRowsById,
  checkTableExists,
  updateRowsByColumn,
  processSheetGroups,
  getDataBySheetName,
  getPagedData,
  createDatabaseIfNotExists,
  asyncProcessSheetGroups,
  readSheet,
  readDriveSheet,
  readAndInsertSheet,
  getFilterOptions,
  clearFilterCache,
  clearAllCaches,
  getBalanceChartData,
  getBacktestTables,
  createBacktestTable,
  deleteBacktestTable,
};
