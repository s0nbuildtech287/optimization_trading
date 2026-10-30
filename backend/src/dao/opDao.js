const pg_format = require("pg-format");
const { adminPool, getAppPool, safeConnect } = require("../config/db");
const pool = getAppPool();
const { getRequestActor } = require("../utils/requestContext");

function assertBacktestIdentifier(tableName) {
  if (!tableName || !/^backtest[a-z0-9_]*$/i.test(tableName)) {
    throw new Error("Invalid table name. Must start with 'backtest' followed by letters, numbers, or underscores.");
  }
}

function assertSafeIdentifier(identifier, label = "identifier") {
  if (!identifier || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid ${label}.`);
  }
}

const createDatabase = async (dbName) => {
  const query = `CREATE DATABASE "${dbName}"`;
  await adminPool.query(query);
};

async function checkIfDatabaseExists(dbName) {
  const result = await pool.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]);
  return result.rowCount > 0;
}

const checkIfTableExists = async (tableName) => {
  const result = await pool.query(
    `
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = $1
    )
  `,
    [tableName],
  );
  return result.rows[0].exists;
};

const dropTable = async (tableName) => {
  assertBacktestIdentifier(tableName);
  const query = `DROP TABLE IF EXISTS "${tableName}"`;
  await pool.query(query);
};

const clearData = async (tableName) => {
  assertBacktestIdentifier(tableName);
  await pool.query(`DELETE FROM "${tableName}"`);
};

const { upsertDataSource, deleteDataSource, validateAndFilterSourceNames } = require("./dataSourceDao");

const createTable = async (pool, tableName, columns, pkClause = "", ownerUserId = undefined) => {
  assertBacktestIdentifier(tableName);
  const columnsWithTypes = columns.map((col) => `"${col.name}" ${col.type}`).join(", ");
  const query = `CREATE TABLE IF NOT EXISTS "${tableName}" (${columnsWithTypes}${pkClause ? `, ${pkClause}` : ""})`;
  await pool.query(query);
  await upsertDataSource(tableName, null, ownerUserId);
};

const insertRows = async (tableName, headers, data) => {
  assertBacktestIdentifier(tableName);
  const columns = headers.map((h) => `"${h.toLowerCase()}"`).join(", ");
  const query = `INSERT INTO "${tableName}" (${columns}) VALUES %L ON CONFLICT DO NOTHING`;
  const formattedQuery = pg_format(query, data);
  await pool.query(formattedQuery);
};

const deleteRowsById = async (tableName, column, values) => {
  if (!Array.isArray(values) || values.length === 0) return;
  assertBacktestIdentifier(tableName);
  assertSafeIdentifier(column, "column name");

  const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
  const query = `
    DELETE FROM "${tableName}"
    WHERE "${column}" IN (${placeholders})
  `;
  await pool.query(query, values);
};
// Tổng hợp 5 bảng backtest
/**
 * ✅ Tạo indexes cho các bảng backtest
 */
async function createBacktestIndexes() {
  const tables = await getAllBacktestTables(); // ✅ Chỉ trả về bảng chuẩn rồi

  for (const tableName of tables) {
    try {
      const tableExists = await checkIfTableExists(tableName);
      if (!tableExists) continue;

      await pool.query(`CREATE INDEX IF NOT EXISTS idx_${tableName}_time ON ${tableName}(time DESC)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_${tableName}_strategy ON ${tableName}(strategy_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_${tableName}_symbol ON ${tableName}(symbol)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_${tableName}_year ON ${tableName}(EXTRACT(YEAR FROM time))`);

      console.log(` Indexes created for ${tableName}`);
    } catch (err) {
      console.error(` Error creating indexes for ${tableName}:`, err.message);
    }
  }
}

/**
 * ✅ Tạo VIEW cho All Backtest (KHÔNG có index, giữ tất cả dữ liệu kể cả balance)
 */
/**
 * ✅ Kiểm tra xem Materialized View đã tồn tại chưa
 */
const {
  scheduleRefresh,
  scheduleRebuild,
  waitForReady,
  checkIfMaterializedViewExists,
  createAllBacktestMaterializedView,
  ensureMaterializedViewExists,
  hasStandardBacktestStructure,
  recreateMaterializedViewIfNeeded,
  refreshAllBacktestMaterializedView,
} = require("./materializedViewDao");

const { resolveTableSubquery } = require("./queryBuilderHelper");

/**
 * Helper: Resolve table name
 */
function resolveTableName(tableName) {
  if (!tableName || tableName === "all_backtests") {
    return "backtest";
  }
  if (typeof tableName === 'string' && tableName.includes(',')) {
    tableName
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .forEach(assertBacktestIdentifier);
    return tableName;
  }
  assertBacktestIdentifier(tableName);
  return tableName;
}

/**
 * ✅ Nếu tableName là comma-separated (multi-select), trả về array các table
 * Dùng để thêm WHERE source_table IN (...) khi query all_backtests
 */
function resolveSourceTableFilter(tableName) {
  if (!tableName || tableName === "all_backtests") return null;
  if (typeof tableName === 'string' && tableName.includes(',')) {
    return tableName.split(',').map(t => t.trim()).filter(Boolean).filter((t) => {
      assertBacktestIdentifier(t);
      return true;
    });
  }
  return null; // single table → không cần filter source_table
}

// FIX: HÀM BUILD WHERE CLAUSE MỚI - HỖ TRỢ MULTI-SELECT
const buildWhereClause = (
  strategyId = null,
  symbol = null,
  year = null,
  search = null,
  startDate = null,
  endDate = null,
  sourceTables = null, // ✅ multi-select backtest filter
) => {
  let conditions = [];
  let values = [];

  // ✅ SOURCE_TABLE filter (khi chọn nhiều backtest)
  // Dùng literal string thay vì parameterized vì source_table là whitelist từ DB
  if (sourceTables && sourceTables.length > 0) {
    const safeTables = sourceTables
      .map(t => t.replace(/[^a-zA-Z0-9_]/g, '')) // strip non-alphanumeric/underscore
      .filter(Boolean)
      .map(t => `'${t}'`)
      .join(', ');
    conditions.push(`source_table IN (${safeTables})`);
  }

  // STRATEGY_ID: Single value
  if (strategyId !== null) {
    values.push(`%${strategyId}%`);
    conditions.push(`strategy_id ILIKE $${values.length}`);
  }

  // SYMBOL: Multiple values (comma-separated)
  if (symbol !== null) {
    const symbols = symbol
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s);
    if (symbols.length > 0) {
      const symbolConditions = symbols.map((s) => {
        values.push(`%${s}%`);
        return `symbol ILIKE $${values.length}`;
      });
      conditions.push(`(${symbolConditions.join(" OR ")})`);
    }
  }

  // YEAR: Multiple values (comma-separated)
  if (year !== null) {
    const years = year
      .split(",")
      .map((y) => y.trim())
      .filter((y) => y);
    if (years.length > 0) {
      const yearConditions = years.map((y) => {
        values.push(parseInt(y, 10));
        return `EXTRACT(YEAR FROM time) = $${values.length}`;
      });
      conditions.push(`(${yearConditions.join(" OR ")})`);
    }
  }

  // Date range filter
  if (startDate !== null) {
    values.push(startDate);
    conditions.push(`time >= $${values.length}::timestamp`);
  }

  if (endDate !== null) {
    values.push(endDate);
    // Thêm 1 ngày để bao gồm cả ngày kết thúc
    conditions.push(`time < ($${values.length}::timestamp + INTERVAL '1 day')`);
  }

  // SEARCH: Multiple terms (comma-separated) - CASE INSENSITIVE
  if (search !== null) {
    const searchTerms = search
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s);
    if (searchTerms.length > 0) {
      const searchConditions = searchTerms.map((term) => {
        values.push(`%${term}%`);
        return `(
          LOWER(strategy_id) LIKE $${values.length} OR 
          LOWER(symbol) LIKE $${values.length} OR 
          CAST(EXTRACT(YEAR FROM time) AS TEXT) LIKE $${values.length}
        )`;
      });
      conditions.push(`(${searchConditions.join(" OR ")})`);
    }
  }

  const queryConditions = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
  return { queryConditions, values };
};

const getDataPage = async (
  tableName,
  limit,
  offset,
  strategyId = null,
  symbol = null,
  year = null,
  search = null,
  startDate = null,
  endDate = null,
  sortTimeDir = "desc",
  sortDealDir = null,
  sortSymbolDir = null,
  sortCommissionDir = null,
  sortSwapDir = null,
  sortProfitDir = null,
) => {
  const { fromClause } = await resolveTableSubquery(tableName);
  const { queryConditions, values } = buildWhereClause(strategyId, symbol, year, search, startDate, endDate);

  const balanceFilter = queryConditions ? `${queryConditions} AND type != 'balance'` : ` WHERE type != 'balance'`;

  // ✅ Symbol priority CASE expression (dùng khi sort by symbol)
  const symbolCaseExpr = `
    CASE symbol
      WHEN 'BTCUSD' THEN 1
      WHEN 'ETHUSD' THEN 2
      WHEN 'XAUUSD' THEN 3
      WHEN 'XAGUSD' THEN 4
      WHEN 'US500'  THEN 5
      WHEN 'DE30'   THEN 6
      WHEN 'JP225'  THEN 7
      WHEN 'HK50'   THEN 8
      WHEN 'USOIL'  THEN 9
      ELSE 999
    END`;

  let orderClause;
  if (sortDealDir) {
    const safeDir = sortDealDir === "asc" ? "ASC" : "DESC";
    orderClause = `ORDER BY CAST(deal AS BIGINT) ${safeDir}`;
  } else if (sortSymbolDir) {
    const safeDir = sortSymbolDir === "desc" ? "DESC" : "ASC";
    orderClause = `ORDER BY ${symbolCaseExpr} ${safeDir}, time DESC`;
  } else if (sortCommissionDir) {
    const safeDir = sortCommissionDir === "asc" ? "ASC" : "DESC";
    orderClause = `ORDER BY CAST(commission AS NUMERIC) ${safeDir}`;
  } else if (sortSwapDir) {
    const safeDir = sortSwapDir === "asc" ? "ASC" : "DESC";
    orderClause = `ORDER BY CAST(swap AS NUMERIC) ${safeDir}`;
  } else if (sortProfitDir) {
    const safeDir = sortProfitDir === "asc" ? "ASC" : "DESC";
    orderClause = `ORDER BY CAST(profit AS NUMERIC) ${safeDir}`;
  } else if (sortTimeDir) {
    const safeDir = sortTimeDir === "asc" ? "ASC" : "DESC";
    orderClause = `ORDER BY time ${safeDir}`;
  } else {
    orderClause = `ORDER BY time DESC`;
  }

  const query = `SELECT * FROM ${fromClause}${balanceFilter} ${orderClause} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
  values.push(limit, offset);

  const { rows } = await pool.query(query, values);
  return rows;
};

const getTotalCount = async (tableName, strategyId = null, symbol = null, year = null, search = null, startDate = null, endDate = null) => {
  const { fromClause } = await resolveTableSubquery(tableName);
  const { queryConditions, values } = buildWhereClause(strategyId, symbol, year, search, startDate, endDate);

  const query = `SELECT COUNT(*) FROM ${fromClause}${queryConditions}`;
  const result = await pool.query(query, values);
  return parseInt(result.rows[0].count, 10);
};

// Function riêng để đếm chỉ data hiển thị (không có balance) - dùng cho pagination
const getTotalCountDisplayed = async (tableName, strategyId = null, symbol = null, year = null, search = null, startDate = null, endDate = null) => {
  const { fromClause } = await resolveTableSubquery(tableName);
  const { queryConditions, values } = buildWhereClause(strategyId, symbol, year, search, startDate, endDate);

  const balanceFilter = queryConditions ? `${queryConditions} AND type != 'balance'` : ` WHERE type != 'balance'`;

  const query = `SELECT COUNT(*) FROM ${fromClause}${balanceFilter}`;
  const result = await pool.query(query, values);
  return parseInt(result.rows[0].count, 10);
};

const getBacktestCurrentStats = async (tableName) => {
  assertBacktestIdentifier(tableName);
  const result = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE COALESCE(LOWER(type), '') <> 'balance')::bigint AS total_rows,
       COUNT(DISTINCT strategy_id)
         FILTER (WHERE COALESCE(LOWER(type), '') <> 'balance')::bigint AS total_strategies
     FROM "${tableName}"`,
  );
  return {
    totalRows: Number(result.rows[0]?.total_rows || 0),
    totalStrategies: Number(result.rows[0]?.total_strategies || 0),
  };
};

// Calculate totals: commission, swap, profit for all filtered records
const getTotals = async (tableName, strategyId = null, symbol = null, year = null, search = null, startDate = null, endDate = null) => {
  const { fromClause } = await resolveTableSubquery(tableName);
  const { queryConditions, values } = buildWhereClause(strategyId, symbol, year, search, startDate, endDate);

  const balanceFilter = queryConditions ? `${queryConditions} AND type != 'balance'` : ` WHERE type != 'balance'`;
  const strategyCountExpr = `COUNT(DISTINCT (source_table, strategy_id))`;

  const query = `
    SELECT 
      COALESCE(SUM(CAST("commission" AS NUMERIC)), 0) as total_commission,
      COALESCE(SUM(CAST("swap" AS NUMERIC)), 0) as total_swap,
      COALESCE(SUM(CAST("profit" AS NUMERIC)), 0) as total_profit,
      COUNT(*) as total_orders,
      COUNT(CASE WHEN LOWER(direction) = 'out' AND CAST("profit" AS NUMERIC) > 0 THEN 1 END) as profitable_orders,
      COUNT(CASE WHEN LOWER(direction) = 'out' THEN 1 END) as total_out_orders,
      ${strategyCountExpr} as total_strategies
    FROM ${fromClause}${balanceFilter}
  `;
  const result = await pool.query(query, values);
  const totals = {
    totalCommission: parseFloat(result.rows[0].total_commission),
    totalSwap: parseFloat(result.rows[0].total_swap),
    totalProfit: parseFloat(result.rows[0].total_profit),
    totalOrders: parseInt(result.rows[0].total_orders, 10),
    profitableOrders: parseInt(result.rows[0].profitable_orders, 10),
    totalOutOrders: parseInt(result.rows[0].total_out_orders, 10),
    totalStrategies: parseInt(result.rows[0].total_strategies, 10),
  };

  return totals;
};

const countRows = async (tableName, strategyId) => {
  const sql = `SELECT COUNT(*) as cnt FROM "${tableName}" WHERE strategy_id = $1`;
  const values = [strategyId];

  const result = await pool.query(sql, values);
  return result.rows[0]?.cnt || 0;
};
const sumStrategyProfit = async (tableName, strategyId) => {
  const sql = `SELECT SUM(profit) as cnt FROM "${tableName}" WHERE strategy_id = $1`;
  const values = [strategyId];

  const result = await pool.query(sql, values);
  return result.rows[0]?.cnt || -1;
};

async function getDistinctColumn(tableName, columnName) {
  const { fromClause } = await resolveTableSubquery(tableName);
  const allowedColumns = ["type", "symbol", "strategy_id"];
  if (!allowedColumns.includes(columnName)) {
    throw new Error(`Column ${columnName} is not allowed`);
  }

  const query = `SELECT DISTINCT ${columnName} FROM ${fromClause}`;
  try {
    const { rows } = await pool.query(query);
    return rows.map((r) => r[columnName]);
  } catch (err) {
    console.error(`DAO getDistinctColumn(${columnName}) error:`, err.message);
    throw err;
  }
}

async function getDistinctYears(tableName) {
  const { fromClause } = await resolveTableSubquery(tableName);

  const query = `
    SELECT DISTINCT EXTRACT(YEAR FROM time) AS year
    FROM ${fromClause}
    WHERE time IS NOT NULL
    ORDER BY year;
  `;
  try {
    const { rows } = await pool.query(query);
    return rows.map((r) => parseInt(r.year, 10));
  } catch (err) {
    console.error(`DAO getDistinctYears error:`, err.message);
    throw err;
  }
}
async function getDistinctSymbols(tableName) {
  return getDistinctColumn(tableName, "symbol");
}

async function getDistinctStrategyIds(tableName) {
  return getDistinctColumn(tableName, "strategy_id");
}

async function deleteByStrategyId(tableName, strategyId) {
  const startTime = Date.now();
  try {
    console.log(`🗑️  Deleting strategy_id: ${strategyId} from table: ${tableName}`);

    // Thêm timeout 30 giây
    const query = `DELETE FROM "${tableName}" WHERE strategy_id = $1`;
    const result = await Promise.race([pool.query(query, [strategyId]), new Promise((_, reject) => setTimeout(() => reject(new Error("DELETE timeout after 30s")), 30000))]);

    const duration = Date.now() - startTime;
    console.log(`✅ Deleted ${result.rowCount} rows from ${tableName} in ${duration}ms`);
    return result.rowCount;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Lỗi khi xóa bản ghi từ bảng ${tableName} sau ${duration}ms:`, error.message);
    throw error;
  }
}

// ✅ NEW: Get balance chart data for strategy
const getBalanceChartData = async (tableName, strategyId, initialDeposit = 1000000, filters = {}) => {
  const { fromClause } = await resolveTableSubquery(tableName);
  const startDate = filters.startDate || null;
  const endDate = filters.endDate || null;
  const maxVolume = Number.isFinite(filters.maxVolume) ? filters.maxVolume : null;

  const query = `
    WITH deals_with_cumulative AS (
      SELECT
        time,
        deal,
        "order",
        type,
        CAST(profit AS NUMERIC) as profit,
        CAST(commission AS NUMERIC) as commission,
        CAST(swap AS NUMERIC) as swap,
        SUM(CAST(profit AS NUMERIC) + CAST(commission AS NUMERIC) + CAST(swap AS NUMERIC))
          OVER (ORDER BY time, deal, "order") AS cumulative_profit
      FROM ${fromClause}
      WHERE TRIM(strategy_id) = TRIM($2)
        AND type NOT IN ('balance')
        AND ($3::timestamp IS NULL OR time >= $3::timestamp)
        AND ($4::timestamp IS NULL OR time <= $4::timestamp)
        AND ($5::numeric IS NULL OR volume::numeric <= $5::numeric)
    )
    SELECT
      time,
      type,
      profit,
      commission,
      swap,
      cumulative_profit + $1 AS balance,
      GREATEST(
        MAX(cumulative_profit) OVER (
          ORDER BY time, deal, "order"
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ),
        0
      ) - cumulative_profit AS drawdown
    FROM deals_with_cumulative
    ORDER BY time, deal, "order"
  `;

  const result = await pool.query(query, [initialDeposit, strategyId, startDate, endDate, maxVolume]);

  return result.rows;
};

// ─── BACKTEST TABLE MANAGEMENT ─────────────────────────────────────────────────
/**
 * ✅ Get all backtest tables from database
 * Returns tables that start with "backtest" prefix
 */
async function getAllBacktestTables(actor = getRequestActor()) {
  try {
    if (actor) {
      const sources = await require('./dataSourceDao').getEnabledDataSources(actor);
      return sources.map((source) => source.source_name);
    }
    // ✅ Chỉ trả về bảng có đủ cột chuẩn (bỏ qua backtest_population, backtest_settings, v.v.)
    const requiredColumns = ['time', 'deal', 'symbol', 'type', 'direction', 'volume',
      'price', 'order', 'commission', 'swap', 'profit', 'comment', 'strategy_id'];

    const query = `
      SELECT t.tablename
      FROM pg_tables t
      WHERE t.schemaname = 'public'
        AND t.tablename LIKE 'backtest%'
        AND (
          SELECT COUNT(DISTINCT c.column_name)
          FROM information_schema.columns c
          WHERE c.table_schema = 'public'
            AND c.table_name = t.tablename
            AND LOWER(c.column_name) = ANY($1)
        ) = $2
      ORDER BY t.tablename
    `;
    const result = await pool.query(query, [requiredColumns, requiredColumns.length]);
    return result.rows.map((row) => row.tablename);
  } catch (err) {
    console.error("❌ Error fetching backtest tables:", err.message);
    throw err;
  }
}

/**
 * ✅ Create new backtest table with standard structure
 * @param {string} tableName - Name of the table to create
 */
async function createBacktestTable(tableName, ownerUserId = undefined) {
  try {
    // Validate table name: must start with "backtest" followed by alphanumeric/underscore
    if (!/^backtest[a-z0-9_]*$/i.test(tableName)) {
      throw new Error("Invalid table name. Must start with 'backtest' followed by letters, numbers, or underscores.");
    }

    // Check if table already exists
    const exists = await checkIfTableExists(tableName);
    if (exists) {
      throw new Error(`Table "${tableName}" already exists`);
    }

    // A deleted physical table must not retain ownership of its old name.
    await deleteDataSource(tableName);

    // Create table with standard backtest structure
    const { db } = require("../config/db");
    const columns = db.backtest.ALLOWED_COLUMNS.map((colName) => ({
      name: colName.toLowerCase(),
      type: db.backtest.COLUMN_TYPES[colName],
    }));

    const pkColumns = db.backtest.PRIMARY_KEY.map((col) => `"${col.toLowerCase()}"`).join(", ");
    const pkClause = `PRIMARY KEY (${pkColumns})`;

    await createTable(pool, tableName, columns, pkClause, ownerUserId);

    // Create indexes for the new table
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_${tableName}_time 
      ON ${tableName}(time DESC)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_${tableName}_strategy 
      ON ${tableName}(strategy_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_${tableName}_symbol 
      ON ${tableName}(symbol)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_${tableName}_year 
      ON ${tableName}(EXTRACT(YEAR FROM time))
    `);

    console.log(`✅ Created new backtest table: ${tableName}`);
    return { success: true, tableName };
  } catch (err) {
    console.error(`❌ Error creating table ${tableName}:`, err.message);
    throw err;
  }
}

async function deleteBacktestTable(tableName) {
  if (!/^backtest[a-z0-9_]*$/i.test(tableName)) {
    throw new Error("Invalid table name.");
  }
  const exists = await checkIfTableExists(tableName);
  if (!exists) {
    throw new Error(`Table "${tableName}" does not exist`);
  }

  console.log(`[MV] Waiting for current operation before dropping table "${tableName}"...`);
  await waitForReady();

  const client = await safeConnect(pool, 'OP_DAO');
  try {
    await client.query(`SET lock_timeout = 0`);
    await client.query(`DROP TABLE IF EXISTS "${tableName}" CASCADE`);
    console.log(`✅ Dropped backtest table: ${tableName}`);

    const deleted = await client.query(
      `DELETE FROM strategy_metadata WHERE backtest_table = $1`,
      [tableName]
    );
    console.log(`🧹 Deleted ${deleted.rowCount} strategies from strategy_metadata for table: ${tableName}`);

    const deletedLogs = await client.query(
      `DELETE FROM sync_jobs
        WHERE LOWER(table_name) = LOWER($1)
          AND operation_type = 'BACKTEST_SYNC'`,
      [tableName]
    ).catch((err) => {
      console.warn(`⚠️ Could not delete sync history for ${tableName}:`, err.message);
      return { rowCount: 0 };
    });
    console.log(`🧹 Deleted ${deletedLogs.rowCount || 0} sync history rows for table: ${tableName}`);

    await deleteDataSource(tableName).catch(() => { });
  } finally {
    try { await client.query(`SET lock_timeout = 0`); } catch (_) { }
    client.release();
  }

  // Rebuild materialized view in background (non-blocking)
  scheduleRebuild(`delete-table:${tableName}`);

  return { success: true, tableName };
}

module.exports = {
  checkIfTableExists,
  dropTable,
  deleteBacktestTable,
  clearData,
  createTable,
  insertRows,
  deleteRowsById,
  getDataPage,
  getTotalCount,
  getTotalCountDisplayed,
  getBacktestCurrentStats,
  getTotals,
  createDatabase,
  checkIfDatabaseExists,
  countRows,
  getDistinctYears,
  getDistinctSymbols,
  getDistinctStrategyIds,
  deleteByStrategyId,
  sumStrategyProfit,
  createBacktestIndexes,
  createAllBacktestMaterializedView,
  ensureMaterializedViewExists,
  refreshAllBacktestMaterializedView,
  recreateMaterializedViewIfNeeded,
  getBalanceChartData,
  getAllBacktestTables,
  createBacktestTable,
  deleteBacktestTable,
};
