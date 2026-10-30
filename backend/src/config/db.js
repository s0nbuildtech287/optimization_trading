require("dotenv").config();
const pg = require("pg");
const { Pool } = pg;

// Override pg parser for TIMESTAMP (OID 1114) to always parse as UTC.
// PostgreSQL TIMESTAMP (without timezone) returns a bare string like "2026-07-23 06:38:10.661"
// (space separator, no timezone). We must normalise it to ISO 8601 with Z suffix so
// JavaScript treats it as UTC, not local time.
pg.types.setTypeParser(1114, (stringValue) => {
  if (!stringValue) return null;
  // Postgres sends "YYYY-MM-DD HH:MM:SS.mmm" – replace the space with T and append Z.
  const iso = stringValue.replace(" ", "T") + "Z";
  return new Date(iso);
});

const attachPoolErrorListener = (p, name = 'pool') => {
  p.on('error', (err) => {
    console.warn(`[DB Pool Warning][${name}] Network/socket error caught:`, err.message || err);
  });
  return p;
};

const readPoolMax = (envName, fallback) => {
  const value = Number.parseInt(process.env[envName], 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

const POOL_CONFIG = {
  connectionString: process.env.DATABASE_URL,
  // Keep the combined connection budget below PostgreSQL's server limit.
  // Individual requests queue in pg-pool instead of exhausting the database.
  max: readPoolMax('DB_MAIN_POOL_MAX', 12),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};

const pool = attachPoolErrorListener(new Pool(POOL_CONFIG), 'mainPool');

const adminPool = attachPoolErrorListener(new Pool({
  ...POOL_CONFIG,
  max: readPoolMax('DB_ADMIN_POOL_MAX', 4),
}), 'adminPool');

let appPoolSingleton = null;

const getAppPool = () => {
  if (!appPoolSingleton) {
    appPoolSingleton = attachPoolErrorListener(new Pool({
      ...POOL_CONFIG,
      // Shared by Dashboard, Risk, Behavior and Comparative queries.
      max: readPoolMax('DB_APP_POOL_MAX', 16),
    }), 'appPoolSingleton');
  }
  return appPoolSingleton;
};

const safeConnect = async (targetPool = pool, label = 'client') => {
  const client = await targetPool.connect();
  if (!client._hasErrorListener) {
    client.on('error', (err) => {
      console.warn(`[DB Client Warning][${label}] Connection socket error caught:`, err.message || err);
    });
    client._hasErrorListener = true;
  }
  return client;
};

const dbUrl = new URL(process.env.DATABASE_URL);
const dbName = dbUrl.pathname.replace("/", "");
const db = {
  backtest: {
    DATABASE_NAME: dbName,
    // DEPRECATED: Use getAllBacktestTables() from opDao instead for dynamic table list
    // TABLES: ["backtest1", "backtest2", "backtest3", "backtest4", "backtestoil"],
    ALLOWED_COLUMNS: ["Time", "Deal", "Symbol", "Type", "Direction", "Volume", "Price", "Order", "Commission", "Swap", "Profit", "Comment", "Strategy_id"],
    COLUMN_TYPES: {
      Time: "TIMESTAMP",
      Deal: "BIGINT",
      Symbol: "TEXT",
      Type: "TEXT",
      Direction: "TEXT",
      Volume: "NUMERIC",
      Price: "NUMERIC",
      Order: "BIGINT",
      Commission: "NUMERIC",
      Profit: "NUMERIC",
      Swap: "NUMERIC",
      Comment: "TEXT",
      Strategy_id: "TEXT",
    },
    PRIMARY_KEY: ["Deal", "Strategy_id"],
  },
};
module.exports = { pool, db, adminPool, getAppPool, safeConnect };
