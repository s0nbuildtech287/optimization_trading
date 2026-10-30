const { getAppPool } = require("../config/db");
const { getRequestActor, getActorScopeKey } = require("../utils/requestContext");
const { BACKTEST_ACCESS_ERROR_CODE } = require("../utils/constants");
const { VALIDATION } = require("../utils/messages");

const pool = getAppPool();
const BACKTEST_NAME_RE = /^backtest[a-z0-9_]*$/i;

function normalizeActor(actor = getRequestActor()) {
  if (!actor || !Number.isInteger(Number(actor.userId))) {
    const error = new Error("Authentication is required for backtest data access");
    error.status = 401;
    error.code = "BACKTEST_AUTH_REQUIRED";
    throw error;
  }
  return {
    userId: Number(actor.userId),
    role: String(actor.role || "user").toLowerCase(),
    isAdmin: actor.isAdmin === true || String(actor.role || "").toLowerCase() === "admin",
  };
}

function normalizeSourceName(sourceName) {
  const value = String(sourceName || "").trim().toLowerCase();
  if (!BACKTEST_NAME_RE.test(value)) {
    const error = new Error("Invalid backtest table name");
    error.status = 400;
    error.code = "INVALID_BACKTEST_TABLE";
    throw error;
  }
  return value;
}

function parseSourceInput(sourceInput) {
  if (Array.isArray(sourceInput)) return sourceInput;
  if (typeof sourceInput === "string") {
    const trimmed = sourceInput.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
      } catch (_) {
        // Fall through to comma-separated input.
      }
    }
    return trimmed.split(",");
  }
  return [];
}

async function getAccessibleDataSources(actor, { includeDisabled = false } = {}) {
  const accessActor = normalizeActor(actor);
  const params = [];
  const where = ["d.source_type = 'TABLE'", "d.source_name ~ '^backtest[a-zA-Z0-9_]*$'"];
  if (!includeDisabled) where.push("d.enabled = true");
  if (!accessActor.isAdmin) {
    params.push(accessActor.userId);
    where.push(`d.owner_user_id = $${params.length}`);
  }

  const result = await pool.query(
    `SELECT d.id, d.source_name, d.display_name, d.source_type, d.enabled,
            d.owner_user_id, u.username AS owner_username,
            u.email AS owner_email,
            d.created_at, d.updated_at
       FROM data_source d
       LEFT JOIN users u ON u.id = d.owner_user_id
       JOIN information_schema.tables t
         ON t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        AND t.table_name = d.source_name
      WHERE ${where.join(" AND ")}
      ORDER BY d.created_at DESC, d.source_name ASC`,
    params,
  );
  return result.rows;
}

async function getDataSourceByName(sourceName) {
  const cleanName = normalizeSourceName(sourceName);
  const result = await pool.query(
    `SELECT d.id, d.source_name, d.display_name, d.source_type, d.enabled,
            d.owner_user_id, d.created_at, d.updated_at,
            EXISTS (
              SELECT 1 FROM information_schema.tables t
               WHERE t.table_schema = 'public'
                 AND t.table_type = 'BASE TABLE'
                 AND t.table_name = d.source_name
            ) AS physical_table_exists,
            (
              SELECT COUNT(DISTINCT LOWER(c.column_name)) = 13
              FROM information_schema.columns c
              WHERE c.table_schema = 'public'
                AND c.table_name = d.source_name
                AND LOWER(c.column_name) = ANY(ARRAY[
                  'time','deal','symbol','type','direction','volume','price',
                  'order','commission','swap','profit','comment','strategy_id'
                ])
            ) AS is_backtest_schema
       FROM data_source d
      WHERE d.source_name = $1
      LIMIT 1`,
    [cleanName],
  );
  return result.rows[0] || null;
}

function canAccessDataSource(actor, source) {
  const accessActor = normalizeActor(actor);
  if (!source || !source.enabled || !source.physical_table_exists || !source.is_backtest_schema) return false;
  if (accessActor.isAdmin) return true;
  return source.owner_user_id !== null
    && source.owner_user_id !== undefined
    && Number(source.owner_user_id) === accessActor.userId;
}

async function assertCanAccessBacktestTable(actor, sourceName) {
  const accessActor = normalizeActor(actor);
  const source = await getDataSourceByName(sourceName);
  if (!source) {
    const error = new Error("Backtest table is not registered");
    error.status = 404;
    error.code = "BACKTEST_TABLE_NOT_FOUND";
    throw error;
  }
  if (!canAccessDataSource(accessActor, source)) {
    const error = new Error("You do not have access to this backtest table");
    error.status = 403;
    error.code = "BACKTEST_TABLE_FORBIDDEN";
    throw error;
  }
  return source;
}

async function assertCanManageBacktestTable(actor, sourceName) {
  return assertCanAccessBacktestTable(actor, sourceName);
}

async function assertCanCreateOrWriteBacktestTable(actor, sourceName) {
  const accessActor = normalizeActor(actor);
  const cleanName = normalizeSourceName(sourceName);
  const source = await getDataSourceByName(cleanName);
  if (source) {
    if (source.physical_table_exists) {
      return assertCanAccessBacktestTable(accessActor, cleanName);
    }
    return { source_name: cleanName, owner_user_id: accessActor.userId, is_new: true };
  }

  const physical = await pool.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
          AND table_name = $1
     ) AS exists`,
    [cleanName],
  );
  if (physical.rows[0]?.exists && !accessActor.isAdmin) {
    const error = new Error("This backtest table exists but has no assigned owner");
    error.status = 403;
    error.code = "BACKTEST_TABLE_UNASSIGNED";
    throw error;
  }
  return { source_name: cleanName, owner_user_id: accessActor.userId, is_new: true };
}

async function validateAccessibleSourceNames(actor, sourceInput, { allowAll = true } = {}) {
  const accessActor = normalizeActor(actor);
  const rawNames = parseSourceInput(sourceInput)
    .map((name) => String(name || "").trim().toLowerCase())
    .filter(Boolean);
  const isAll = rawNames.length === 0 || rawNames.includes("all_backtests");
  if (isAll) {
    if (!allowAll) {
      const error = new Error("all_backtests is not allowed for this operation");
      error.status = 400;
      throw error;
    }
    const sources = await getAccessibleDataSources(accessActor);
    return sources.map((source) => source.source_name);
  }

  const cleanNames = [...new Set(rawNames.map(normalizeSourceName))];
  const accessible = await getAccessibleDataSources(accessActor);
  const allowed = new Set(accessible.map((source) => source.source_name));
  const unavailable = cleanNames.filter((name) => !allowed.has(name));
  if (unavailable.length > 0) {
    const error = new Error(VALIDATION.SOURCE_NOT_FOUND_OR_INACCESSIBLE);
    error.status = 404;
    error.code = BACKTEST_ACCESS_ERROR_CODE.SOURCE_NOT_FOUND_OR_INACCESSIBLE;
    throw error;
  }
  return cleanNames;
}

function getBacktestScopeKey(actor = getRequestActor()) {
  return getActorScopeKey(normalizeActor(actor));
}

module.exports = {
  normalizeActor,
  normalizeSourceName,
  parseSourceInput,
  getAccessibleDataSources,
  getDataSourceByName,
  canAccessDataSource,
  assertCanAccessBacktestTable,
  assertCanManageBacktestTable,
  assertCanCreateOrWriteBacktestTable,
  validateAccessibleSourceNames,
  getBacktestScopeKey,
};
