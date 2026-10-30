/**
 * Notification business logic shared by sync and backtest modules.
 */

const notificationDAO = require("../dao/notificationDAO");

async function notifyBestEffort(notificationData) {
  try {
    return await notificationDAO.createNotification(notificationData);
  } catch (err) {
    console.warn(`[NOTIFICATION WARNING] Failed to insert notification (${notificationData.event_type}):`, err.message);
    return null;
  }
}

async function notify({
  userId = null,
  actorId = null,
  eventType,
  severity = "info",
  title,
  message,
  entityType = null,
  entityId = null,
  targetUrl = null,
  metadata = {},
  dedupeKey = null,
}) {
  return notifyBestEffort({
    recipient_user_id: userId,
    actor_user_id: actorId,
    event_type: eventType,
    severity,
    title,
    message,
    entity_type: entityType,
    entity_id: entityId,
    target_url: targetUrl,
    metadata,
    dedupe_key: dedupeKey,
  });
}

async function notifyWebSyncStarted({ userId, tableName, syncId }) {
  return notify({
    userId,
    eventType: "WEB_SYNC_STARTED",
    severity: "info",
    title: "Bắt đầu đồng bộ dữ liệu",
    message: `Đang tiến hành đồng bộ dữ liệu cho bảng ${tableName}...`,
    entityType: "sync_job",
    entityId: syncId,
    targetUrl: "/order-pages/order-list",
    metadata: { tableName, syncId },
    dedupeKey: `web-sync:STARTED:${syncId}`,
  });
}

const firstFiniteStat = (...values) => {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return 0;
};

const normalizeWebSyncStats = (stats = {}) => ({
  ...stats,
  // Backtest sync currently returns `total`; older callers used
  // `totalFiles`/`filesCount`. Keep one canonical payload for the message
  // and notification metadata.
  totalFiles: firstFiniteStat(stats.totalFiles, stats.filesCount, stats.total),
  totalRows: firstFiniteStat(stats.totalRows, stats.rowsCount),
});

async function notifyWebSyncCompleted({ userId, tableName, syncId, stats }) {
  const normalizedStats = normalizeWebSyncStats(stats);
  const fileCount = normalizedStats.totalFiles;
  const rowCount = normalizedStats.totalRows;
  return notify({
    userId,
    eventType: "WEB_SYNC_COMPLETED",
    severity: "success",
    title: "Đồng bộ dữ liệu hoàn tất",
    message: `Đồng bộ ${tableName} hoàn tất: ${fileCount} file, ${rowCount} dòng dữ liệu.`,
    entityType: "sync_job",
    entityId: syncId,
    targetUrl: "/order-pages/order-list",
    metadata: { tableName, syncId, stats: normalizedStats },
    dedupeKey: `web-sync:COMPLETED:${syncId}`,
  });
}

async function notifyWebSyncFailed({ userId, tableName, syncId, error }) {
  return notify({
    userId,
    eventType: "WEB_SYNC_FAILED",
    severity: "error",
    title: "Đồng bộ dữ liệu thất bại",
    message: `Đồng bộ ${tableName} gặp lỗi: ${error || "Lỗi không xác định"}`,
    entityType: "sync_job",
    entityId: syncId,
    targetUrl: "/order-pages/order-list",
    metadata: { tableName, syncId, error },
    dedupeKey: `web-sync:FAILED:${syncId}`,
  });
}

async function notifyBacktestTableCreated({ userId, tableName }) {
  return notify({
    userId,
    eventType: "BACKTEST_TABLE_CREATED",
    severity: "success",
    title: "Tạo bảng Backtest mới",
    message: `Đã tạo thành công bảng Backtest "${tableName}".`,
    entityType: "backtest_table",
    entityId: tableName,
    targetUrl: "/backtest-pages/backtest-tables",
    metadata: { tableName },
  });
}

async function notifyBacktestTableDeleted({ userId, tableName }) {
  return notify({
    userId,
    eventType: "BACKTEST_TABLE_DELETED",
    severity: "info",
    title: "Đã xóa bảng Backtest",
    message: `Đã xóa thành công bảng Backtest "${tableName}".`,
    entityType: "backtest_table",
    entityId: tableName,
    targetUrl: "/backtest-pages/backtest-tables",
    metadata: { tableName },
  });
}

async function notifyStrategyDeleted({ userId, strategyId, tableName }) {
  return notify({
    userId,
    eventType: "STRATEGY_DELETED",
    severity: "info",
    title: "Đã xóa Strategy",
    message: `Đã xóa thành công Strategy ${strategyId} khỏi bảng ${tableName || ""}.`,
    entityType: "strategy",
    entityId: strategyId,
    targetUrl: "/strategy-input",
    metadata: { strategyId, tableName },
  });
}

async function notifyStrategyDeleteFailed({ userId, strategyId, error }) {
  return notify({
    userId,
    eventType: "STRATEGY_DELETE_FAILED",
    severity: "error",
    title: "Xóa Strategy thất bại",
    message: `Xóa Strategy ${strategyId} thất bại: ${error || "Lỗi hệ thống"}`,
    entityType: "strategy",
    entityId: strategyId,
    targetUrl: "/strategy-input",
    metadata: { strategyId, error },
  });
}

async function notifyMt5JobFinished({ userId, jobId, jobType, strategyId, jobName, status, error }) {
  const isEveryTick = jobType === "EVERY_TICK";
  const succeeded = status === "DONE";
  const operation = isEveryTick ? "Every Tick" : "Open Price";
  const subject = jobName || strategyId || jobId;
  return notify({
    userId,
    eventType: `${isEveryTick ? "EVERY_TICK" : "OPEN_PRICE"}_${succeeded ? "COMPLETED" : "FAILED"}`,
    severity: succeeded ? "success" : "error",
    title: `${operation} ${succeeded ? "completed" : "failed"}`,
    message: succeeded
      ? `${operation} for ${subject} completed successfully.`
      : `${operation} for ${subject} failed: ${error || "Unknown error"}`,
    entityType: isEveryTick ? "every_tick_job" : "open_price_job",
    entityId: jobId,
    targetUrl: "/optimization/optimize",
    metadata: { jobId, jobType, strategyId, jobName, status, error: error || null },
    dedupeKey: `mt5-job:${status}:${jobId}`,
  });
}

async function getUserNotifications({ userId, isAdmin, limit, offset, unreadOnly }) {
  return notificationDAO.listNotifications({ userId, isAdmin, limit, offset, unreadOnly });
}

async function getUnreadCount({ userId, isAdmin }) {
  return notificationDAO.getUnreadCount({ userId, isAdmin });
}

async function getNotificationPreference({ userId }) {
  return notificationDAO.getNotificationPreference(userId);
}

async function setNotificationPreference({ userId, enabled }) {
  return notificationDAO.setNotificationPreference(userId, enabled);
}

async function markNotificationAsRead({ id, userId, isAdmin }) {
  return notificationDAO.markAsRead({ id, userId, isAdmin });
}

async function markAllNotificationsAsRead({ userId, isAdmin }) {
  return notificationDAO.markAllAsRead({ userId, isAdmin });
}

async function deleteNotification({ id, userId, isAdmin }) {
  return notificationDAO.deleteNotification({ id, userId, isAdmin });
}

async function deleteAllNotifications({ userId, isAdmin }) {
  return notificationDAO.deleteAllNotifications({ userId, isAdmin });
}

module.exports = {
  notifyBestEffort,
  notify,
  notifyWebSyncStarted,
  notifyWebSyncCompleted,
  notifyWebSyncFailed,
  notifyBacktestTableCreated,
  notifyBacktestTableDeleted,
  notifyStrategyDeleted,
  notifyStrategyDeleteFailed,
  notifyMt5JobFinished,
  getUserNotifications,
  getUnreadCount,
  getNotificationPreference,
  setNotificationPreference,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  deleteAllNotifications,
};
