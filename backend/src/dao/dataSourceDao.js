/** Registry of physical backtest tables that may be queried by the app. */

const { getAppPool } = require("../config/db");
const { getRequestActor } = require("../utils/requestContext");

const pool = getAppPool();

async function initDataSourceTable() {
  const query = `
    CREATE TABLE IF NOT EXISTS data_source (
      id SERIAL PRIMARY KEY,
      source_name VARCHAR(255) NOT NULL UNIQUE,
      display_name VARCHAR(255),
      source_type VARCHAR(50) NOT NULL DEFAULT 'TABLE',
      enabled BOOLEAN NOT NULL DEFAULT true,
      owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_data_source_enabled
      ON data_source(enabled, source_type);
    CREATE INDEX IF NOT EXISTS idx_data_source_owner_enabled
      ON data_source(owner_user_id, enabled, source_type);
  `;

  try {
    await pool.query(query);
    await syncExistingBacktestTablesToDataSource();
    console.log("[DB] data_source table initialized with backtest ownership registry");
  } catch (err) {
    console.error("Failed to initialize data_source table:", err.message);
    throw err;
  }
}

/** Register physical legacy tables without claiming ownership. */
async function syncExistingBacktestTablesToDataSource() {
  try {
    const res = await pool.query(`
      SELECT t.table_name
        FROM information_schema.tables t
       WHERE t.table_schema = 'public'
         AND t.table_type = 'BASE TABLE'
         AND t.table_name LIKE 'backtest%'
         AND (
           SELECT COUNT(DISTINCT LOWER(c.column_name))
           FROM information_schema.columns c
           WHERE c.table_schema = 'public'
             AND c.table_name = t.table_name
             AND LOWER(c.column_name) = ANY(ARRAY[
               'time','deal','symbol','type','direction','volume','price',
               'order','commission','swap','profit','comment','strategy_id'
             ])
         ) = 13
    `);
    for (const { table_name: tableName } of res.rows) {
      await upsertDataSource(tableName, null, null);
    }
  } catch (err) {
    console.warn("Warning syncing existing backtest tables to data_source:", err.message);
  }
}

/** Preserve ownership on conflict; owner transfer is an explicit admin action. */
async function upsertDataSource(sourceName, displayName = null, ownerUserId = undefined) {
  if (!sourceName || typeof sourceName !== "string") return null;
  const cleanName = sourceName.trim().toLowerCase();
  if (!/^backtest[a-z0-9_]*$/i.test(cleanName)) return null;

  const actor = getRequestActor();
  const resolvedOwnerUserId = ownerUserId === undefined
    ? (actor?.userId ?? null)
    : (ownerUserId === null ? null : Number(ownerUserId));
  if (resolvedOwnerUserId !== null && !Number.isInteger(resolvedOwnerUserId)) {
    throw new Error("owner_user_id must be a valid user id");
  }

  const label = displayName || cleanName;
  const result = await pool.query(
    `INSERT INTO data_source
       (source_name, display_name, source_type, enabled, owner_user_id, updated_at)
     VALUES ($1, $2, 'TABLE', true, $3, NOW())
     ON CONFLICT (source_name)
     DO UPDATE SET
       display_name = EXCLUDED.display_name,
       enabled = true,
       updated_at = NOW()
     RETURNING *`,
    [cleanName, label, resolvedOwnerUserId],
  );
  const source = result.rows[0];
  if (
    resolvedOwnerUserId !== null
    && (
      source.owner_user_id === null
      || Number(source.owner_user_id) !== resolvedOwnerUserId
    )
  ) {
    const error = new Error("Backtest table already exists and requires explicit admin ownership assignment");
    error.status = 403;
    error.code = "BACKTEST_TABLE_OWNER_CONFLICT";
    throw error;
  }
  return source;
}

async function assignDataSourceOwner(sourceName, ownerUserId, { changedByUserId = null } = {}) {
  const cleanName = String(sourceName || "").trim().toLowerCase();
  const nextOwner = ownerUserId === null ? null : Number(ownerUserId);
  if (nextOwner !== null && !Number.isInteger(nextOwner)) {
    throw new Error("owner_user_id must be a valid user id");
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const previousResult = await client.query(
      'SELECT owner_user_id FROM data_source WHERE source_name = $1 FOR UPDATE',
      [cleanName],
    );
    if (!previousResult.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    const result = await client.query(
      `UPDATE data_source
          SET owner_user_id = $2, updated_at = NOW()
        WHERE source_name = $1
        RETURNING *`,
      [cleanName, nextOwner],
    );
    await client.query('COMMIT');
    console.info('[AUDIT] BACKTEST_OWNER_TRANSFER', {
      sourceName: cleanName,
      previousOwnerUserId: previousResult.rows[0].owner_user_id,
      ownerUserId: nextOwner,
      changedByUserId,
    });
    return result.rows[0];
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* best effort */ }
    throw error;
  } finally {
    client.release();
  }
}

async function disableDataSource(sourceName) {
  if (!sourceName) return;
  const cleanName = String(sourceName).trim().toLowerCase();
  await pool.query(
    `UPDATE data_source SET enabled = false, updated_at = NOW() WHERE source_name = $1`,
    [cleanName],
  );
}

async function deleteDataSource(sourceName) {
  if (!sourceName) return;
  const cleanName = String(sourceName).trim().toLowerCase();
  await pool.query(`DELETE FROM data_source WHERE source_name = $1`, [cleanName]);
}

async function getEnabledDataSources(actor = getRequestActor()) {
  const accessService = require("../service/backtestAccessService");
  return accessService.getAccessibleDataSources(actor);
}

async function validateAndFilterSourceNames(sourceInput, actor = getRequestActor()) {
  const accessService = require("../service/backtestAccessService");
  return accessService.validateAccessibleSourceNames(actor, sourceInput);
}

module.exports = {
  initDataSourceTable,
  syncExistingBacktestTablesToDataSource,
  upsertDataSource,
  assignDataSourceOwner,
  disableDataSource,
  deleteDataSource,
  getEnabledDataSources,
  validateAndFilterSourceNames,
};
