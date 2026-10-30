/**
 * src/utils/syncProgressTracker.js
 * ✅ Database-backed progress tracker cho sync operations
 * Lưu trạng thái sync trong PostgreSQL để frontend có thể polling
 */

const { getAppPool } = require("../config/db");
const pool = getAppPool();
const notificationService = require("../service/notificationService");
const cancelledSyncIds = new Set();
const SYNC_CANCELLED_CODE = "SYNC_CANCELLED_BY_USER";

const normalizeBacktestAction = (value, fallback = "BACKTEST_SYNC") => {
  const normalized = String(value || "").toUpperCase();
  return normalized === "NEW_RUN" || normalized === "UPDATE" ? normalized : fallback;
};

/**
 * Khởi tạo bảng sync_jobs
 */
async function initSyncJobsTable() {
  const query = `
    CREATE TABLE IF NOT EXISTS sync_jobs (
      sync_id VARCHAR(255) PRIMARY KEY,
      table_name VARCHAR(100) NOT NULL,
      status VARCHAR(20) NOT NULL,
      start_time BIGINT NOT NULL,
      end_time BIGINT,
      duration BIGINT,
      total_files INTEGER DEFAULT 0,
      processed_files INTEGER DEFAULT 0,
      success_files INTEGER DEFAULT 0,
      failed_files INTEGER DEFAULT 0,
      current_file VARCHAR(255),
      progress INTEGER DEFAULT 0,
      result JSONB,
      error TEXT,
      username VARCHAR(100),
      user_id INTEGER,
      operation_type VARCHAR(50) NOT NULL DEFAULT 'BACKTEST_SYNC',
      action VARCHAR(100) NOT NULL DEFAULT 'BACKTEST_SYNC',
      unique_names INTEGER DEFAULT 0,
      warning_count INTEGER DEFAULT 0,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      has_warnings BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    ALTER TABLE sync_jobs
      ADD COLUMN IF NOT EXISTS operation_type VARCHAR(50) NOT NULL DEFAULT 'BACKTEST_SYNC',
      ADD COLUMN IF NOT EXISTS action VARCHAR(100) NOT NULL DEFAULT 'BACKTEST_SYNC',
      ADD COLUMN IF NOT EXISTS unique_names INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS warning_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS has_warnings BOOLEAN NOT NULL DEFAULT FALSE;

    UPDATE sync_jobs
       SET operation_type = 'CHECK_FILES', action = 'CHECK_FILES'
     WHERE LOWER(table_name) = 'check-files';

    UPDATE sync_jobs
       SET operation_type = 'LOT_THRESHOLD_ANALYSIS', action = 'LOT_THRESHOLD_ANALYSIS'
     WHERE LOWER(table_name) = 'lot_threshold_analysis';

    UPDATE sync_jobs
       SET action = UPPER(metadata->>'sync_mode')
     WHERE operation_type = 'BACKTEST_SYNC'
       AND UPPER(metadata->>'sync_mode') IN ('NEW_RUN', 'UPDATE')
       AND action IS DISTINCT FROM UPPER(metadata->>'sync_mode');

    CREATE INDEX IF NOT EXISTS idx_sync_jobs_status ON sync_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_sync_jobs_created ON sync_jobs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sync_jobs_operation_table_created
      ON sync_jobs(operation_type, table_name, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sync_jobs_user_created
      ON sync_jobs(user_id, created_at DESC);
  `;

  try {
    await pool.query(query);
    console.log("Table sync_jobs initialized");
  } catch (err) {
    console.error("❌ Failed to initialize sync_jobs table:", err.message);
    throw err;
  }
}

/**
 * Tạo sync job mới
 */
async function createSyncJob(tableName, totalFiles, username, userId = null, requestedAction = null) {
  const syncId = `${tableName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const startTime = Date.now();
  const status = "PROCESSING";
  const normalizedName = String(tableName || "").toLowerCase();
  const operationType = normalizedName === "check-files"
    ? "CHECK_FILES"
    : normalizedName === "drive-summary"
      ? "DRIVE_SUMMARY"
    : normalizedName === "lot_threshold_analysis"
      ? "LOT_THRESHOLD_ANALYSIS"
      : "BACKTEST_SYNC";
  const action = operationType === "BACKTEST_SYNC"
    ? normalizeBacktestAction(requestedAction)
    : operationType;

  const query = `
    INSERT INTO sync_jobs (
      sync_id, table_name, status, start_time, total_files, username, user_id,
      operation_type, action
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `;

  try {
    await pool.query(query, [
      syncId,
      tableName,
      status,
      startTime,
      totalFiles,
      username,
      userId,
      operationType,
      action,
    ]);

    // Gửi thông báo sync started
    if (operationType !== "DRIVE_SUMMARY") {
      await notificationService.notifyWebSyncStarted({ userId, tableName, syncId });
    }

    return syncId;
  } catch (err) {
    console.error("❌ Failed to create sync job:", err.message);
    throw err;
  }
}

/**
 * Update progress của sync job
 */
async function updateSyncProgress(syncId, updates) {
  try {
    if (cancelledSyncIds.has(syncId)) return;
    const job = await getSyncJob(syncId);
    if (!job) return;

    Object.assign(job, updates);

    if (job.totalFiles > 0) {
      job.progress = Math.round((job.processedFiles / job.totalFiles) * 100);
    }

    const query = `
      UPDATE sync_jobs
      SET 
        total_files = $1,
        processed_files = $2,
        success_files = $3,
        failed_files = $4,
        current_file = $5,
        progress = $6,
        result = $7,
        error = $8,
        status = $9,
        metadata = $10,
        updated_at = NOW()
      WHERE sync_id = $11
        AND status = 'PROCESSING'
    `;
    if (cancelledSyncIds.has(syncId)) return;
    await pool.query(query, [
      job.totalFiles,
      job.processedFiles,
      job.successFiles,
      job.failedFiles,
      job.currentFile,
      job.progress,
      job.result ? JSON.stringify(job.result) : null,
      job.error,
      job.status,
      JSON.stringify(job.metadata || {}),
      syncId
    ]);
  } catch (err) {
    console.error(`❌ Failed to update sync progress for ${syncId}:`, err.message);
  }
}

/**
 * Đánh dấu sync hoàn thành
 */
async function completeSyncJob(syncId, result) {
  try {
    const endTime = Date.now();
    const job = await getSyncJob(syncId);
    if (!job) return;
    if (job.status !== "PROCESSING" || cancelledSyncIds.has(syncId)) return;

    const duration = endTime - job.startTime;
    const progress = 100;
    const status = "COMPLETED";
    const syncSummary = result?._syncSummary || {};
    const publicResult = result && typeof result === "object" ? { ...result, syncId } : result;
    if (publicResult && typeof publicResult === "object") delete publicResult._syncSummary;
    if (publicResult?.stats && typeof publicResult.stats === "object") {
      publicResult.stats = { ...publicResult.stats };
      delete publicResult.stats.totalRows;
      delete publicResult.stats.strategyIds;
    }
    const metadata = syncSummary.metadata || {};
    const uniqueNames = Number(syncSummary.uniqueNames || 0);
    const warningCount = Number(syncSummary.warningCount || 0);
    const hasWarnings = Boolean(syncSummary.hasWarnings || warningCount > 0);
    const stats = publicResult?.stats || {};
    const action = job.operationType === "BACKTEST_SYNC"
      ? normalizeBacktestAction(metadata.sync_mode, job.action)
      : job.action;

    const query = `
      UPDATE sync_jobs
      SET 
        status = $1,
        end_time = $2,
        duration = $3,
        result = $4,
        progress = $5,
        total_files = COALESCE($6, total_files),
        processed_files = COALESCE($7, processed_files),
        success_files = COALESCE($8, success_files),
        failed_files = COALESCE($9, failed_files),
        unique_names = $10,
        warning_count = $11,
        metadata = $12,
        has_warnings = $13,
        action = $14,
        updated_at = NOW()
      WHERE sync_id = $15
        AND status = 'PROCESSING'
    `;
    const completeResult = await pool.query(query, [
      status,
      endTime,
      duration,
      publicResult ? JSON.stringify(publicResult) : null,
      progress,
      Number.isFinite(Number(stats.total)) ? Number(stats.total) : null,
      Number.isFinite(Number(stats.total)) ? Number(stats.total) : null,
      Number.isFinite(Number(stats.success)) ? Number(stats.success) : null,
      Number.isFinite(Number(stats.failed)) ? Number(stats.failed) : null,
      uniqueNames,
      warningCount,
      JSON.stringify(metadata),
      hasWarnings,
      action,
      syncId
    ]);

    if (completeResult.rowCount === 0) return;

    // Gửi thông báo sync completed
    if (job.operationType !== "DRIVE_SUMMARY") {
      await notificationService.notifyWebSyncCompleted({
        userId: job.userId,
        tableName: job.tableName,
        syncId,
        stats: result?.stats || result,
      });
    }
  } catch (err) {
    console.error(`❌ Failed to complete sync job ${syncId}:`, err.message);
  }
}

/**
 * Đánh dấu sync thất bại
 */
async function failSyncJob(syncId, error) {
  try {
    const endTime = Date.now();
    const job = await getSyncJob(syncId);
    if (!job) return;
    if (cancelledSyncIds.has(syncId)) return;

    const duration = endTime - job.startTime;
    const status = "FAILED";

    const query = `
      UPDATE sync_jobs
      SET 
        status = $1,
        end_time = $2,
        duration = $3,
        error = $4,
        metadata = metadata || $5::jsonb,
        updated_at = NOW()
      WHERE sync_id = $6
    `;
    await pool.query(query, [
      status,
      endTime,
      duration,
      error,
      JSON.stringify({ failure: { message: String(error || "Unknown error") } }),
      syncId
    ]);

    if (job.operationType !== "DRIVE_SUMMARY") {
      await notificationService.notifyWebSyncFailed({
        userId: job.userId,
        tableName: job.tableName,
        syncId,
        error,
      });
    }
  } catch (err) {
    console.error(`❌ Failed to fail sync job ${syncId}:`, err.message);
  }
}

/**
 * Lấy thông tin sync job
 */
function isSyncCancelled(syncId) {
  return Boolean(syncId && cancelledSyncIds.has(syncId));
}

function throwIfSyncCancelled(syncId) {
  if (!isSyncCancelled(syncId)) return;
  const error = new Error("Sync stopped by user");
  error.code = SYNC_CANCELLED_CODE;
  throw error;
}

async function cancelSyncJob(syncId, cancelledByUserId = null) {
  const job = await getSyncJob(syncId);
  if (!job) return { status: "NOT_FOUND", job: null };
  if (job.status !== "PROCESSING") return { status: "NOT_PROCESSING", job };

  cancelledSyncIds.add(syncId);
  const endTime = Date.now();
  const duration = endTime - job.startTime;
  const { rowCount } = await pool.query(
    `UPDATE sync_jobs
        SET status = 'FAILED',
            end_time = $1,
            duration = $2,
            error = 'Sync stopped by user',
            metadata = metadata || $3::jsonb,
            updated_at = NOW()
      WHERE sync_id = $4
        AND status = 'PROCESSING'`,
    [
      endTime,
      duration,
      JSON.stringify({
        cancellation: {
          code: SYNC_CANCELLED_CODE,
          requested_by_user_id: cancelledByUserId,
          requested_at: new Date(endTime).toISOString(),
        },
      }),
      syncId,
    ],
  );
  if (rowCount === 0) {
    cancelledSyncIds.delete(syncId);
    return { status: "NOT_PROCESSING", job: await getSyncJob(syncId) };
  }
  console.warn(`[SYNC] Stop requested sync_id=${syncId} by_user_id=${cancelledByUserId || "unknown"}`);
  return { status: "CANCELLED", job: { ...job, status: "FAILED", error: "Sync stopped by user" } };
}

function releaseSyncCancellation(syncId) {
  cancelledSyncIds.delete(syncId);
}

async function getSyncJob(syncId) {
  try {
    const res = await pool.query(
      `SELECT 
        sync_id AS "syncId",
        table_name AS "tableName",
        status,
        start_time AS "startTime",
        end_time AS "endTime",
        duration,
        total_files AS "totalFiles",
        processed_files AS "processedFiles",
        success_files AS "successFiles",
        failed_files AS "failedFiles",
        current_file AS "currentFile",
        progress,
        result,
        error,
        username,
        user_id AS "userId",
        operation_type AS "operationType",
        action,
        unique_names AS "uniqueNames",
        warning_count AS "warningCount",
        metadata,
        has_warnings AS "hasWarnings"
      FROM sync_jobs WHERE sync_id = $1`,
      [syncId]
    );
    if (res.rows.length === 0) return null;
    const job = res.rows[0];
    
    // Đảm bảo kiểu số cho các trường thời gian
    job.startTime = Number(job.startTime);
    if (job.endTime) job.endTime = Number(job.endTime);
    if (job.duration) job.duration = Number(job.duration);
    
    return job;
  } catch (err) {
    console.error(`❌ Failed to get sync job ${syncId}:`, err.message);
    return null;
  }
}

/**
 * Lấy tất cả sync jobs đang chạy
 */
async function getActiveSyncs() {
  try {
    const res = await pool.query(
      `SELECT 
        sync_id AS "syncId",
        table_name AS "tableName",
        status,
        start_time AS "startTime",
        end_time AS "endTime",
        duration,
        total_files AS "totalFiles",
        processed_files AS "processedFiles",
        success_files AS "successFiles",
        failed_files AS "failedFiles",
        current_file AS "currentFile",
        progress,
        result,
        error,
        username,
        user_id AS "userId",
        operation_type AS "operationType",
        action,
        unique_names AS "uniqueNames",
        warning_count AS "warningCount",
        metadata,
        has_warnings AS "hasWarnings"
      FROM sync_jobs 
      WHERE status = 'PROCESSING'
      ORDER BY created_at DESC`
    );
    return res.rows.map(job => {
      job.startTime = Number(job.startTime);
      if (job.endTime) job.endTime = Number(job.endTime);
      if (job.duration) job.duration = Number(job.duration);
      return job;
    });
  } catch (err) {
    console.error("❌ Failed to get active syncs:", err.message);
    return [];
  }
}

/**
 * Clear sync job
 */
async function clearSyncJob(syncId) {
  try {
    await pool.query("DELETE FROM sync_jobs WHERE sync_id = $1", [syncId]);
  } catch (err) {
    console.error(`❌ Failed to clear sync job ${syncId}:`, err.message);
  }
}

module.exports = {
  initSyncJobsTable,
  createSyncJob,
  updateSyncProgress,
  completeSyncJob,
  failSyncJob,
  cancelSyncJob,
  isSyncCancelled,
  throwIfSyncCancelled,
  releaseSyncCancellation,
  SYNC_CANCELLED_CODE,
  getSyncJob,
  getActiveSyncs,
  clearSyncJob,
};
