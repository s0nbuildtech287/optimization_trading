const systemLogDAO = require("../dao/systemLogDAO");
const opDao = require("../dao/opDao");
const { SYSTEM_LOG } = require("../utils/messages");
const backtestAccessService = require('../service/backtestAccessService');

const mapWithConcurrency = async (items, concurrency, mapper) => {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
};

const normalizeIssues = (metadata = {}) => {
  const issues = metadata?.issues || {};
  return {
    duplicate_files: issues.duplicate_files || metadata.duplicate_files || [],
    failed_files: issues.failed_files || metadata.failed_files || [],
    warning_files: issues.warning_files || metadata.warning_files || [],
    not_found_strategies: issues.not_found_strategies || metadata.not_found_strategies || [],
  };
};

const getIssueSummary = (metadata) => {
  const issues = normalizeIssues(metadata);
  const names = (items) => items
    .map((item) => typeof item === "string" ? item : item.strategy_name || item.file_name || item.name)
    .filter(Boolean);
  return {
    duplicate: {
      count: issues.duplicate_files.reduce(
        (total, item) => total + Math.max(1, Number(item.occurrences || item.count || 1) - 1),
        0,
      ),
      preview: names(issues.duplicate_files).slice(0, 3),
    },
    error: { count: issues.failed_files.length, preview: names(issues.failed_files).slice(0, 3) },
    notfound: { count: issues.not_found_strategies.length, preview: names(issues.not_found_strategies).slice(0, 3) },
  };
};

const formatIssueFile = (issueType, job) => {
  const issues = normalizeIssues(job.metadata);
  const header = [
    `SYNC ID: ${job.sync_id}`,
    `TABLE: ${job.table_name}`,
    "",
  ];
  if (issueType === "duplicate") {
    const lines = issues.duplicate_files.flatMap((item, index) => [
      `${index + 1}. ${item.strategy_name || item.file_name || item.name || "Unknown"} (${item.occurrences || item.count || 0} lan)`,
      ...(item.files || []).map((file) => `   - ${file.file_name || file.sheetName || ""} | ${file.sheet_id || file.sheetID || ""}`),
    ]);
    return [...header, ...lines].join("\n");
  }
  if (issueType === "error") {
    const lines = issues.failed_files.flatMap((item, index) => [
      `${index + 1}. ${item.file_name || item.name || "Unknown"}`,
      `   ${item.error_code || "SYNC_FILE_FAILED"}: ${item.message || item.error || "File sync failed"}`,
    ]);
    return [...header, ...lines].join("\n");
  }
  return [
    ...header,
    ...issues.not_found_strategies.map((item, index) => `${index + 1}. ${typeof item === "string" ? item : item.file_name || item.name || "Unknown"}`),
  ].join("\n");
};

/**
 * GET /api/system-logs/latest-backtest
 * Lấy log sync cuối cùng của từng bảng backtest đang tồn tại trong database
 */
const getLatestBacktestLogs = async (req, res) => {
  try {
    const [logs, existingTables, accessibleSources] = await Promise.all([
      systemLogDAO.getLatestLogsByTable("SYNC", "BACKTEST_SYNC"),
      opDao.getAllBacktestTables(req.actor),
      backtestAccessService.getAccessibleDataSources(req.actor),
    ]);

    const logsByTable = new Map();
    for (const log of logs) {
      if (log.target_table) {
        logsByTable.set(String(log.target_table).toLowerCase(), log);
      }
    }

    const sourcesByName = new Map(
      accessibleSources.map((source) => [String(source.source_name).toLowerCase(), source]),
    );

    // Duyệt qua TẤT CẢ các bảng backtest đang tồn tại trong database
    const formatted = await mapWithConcurrency(existingTables, 4, async (tableName) => {
        const log = logsByTable.get(String(tableName).toLowerCase());
        const source = sourcesByName.get(String(tableName).toLowerCase());
        let currentStats = { totalRows: 0, totalStrategies: 0 };
        let statisticsError = null;
        try {
          currentStats = await opDao.getBacktestCurrentStats(tableName);
        } catch (error) {
          statisticsError = error.message;
        }

        return {
          backtest: log?.target_table || tableName,
          ownerUserId: source?.owner_user_id ?? null,
          ownerUsername: source?.owner_username || null,
          ownerEmail: source?.owner_email || null,
          totalFiles: log?.total_files || 0,
          uniqueNames: log?.unique_names || 0,
          success: log?.success_count || 0,
          failed: log?.failed_count || 0,
          warning: log?.warning_count || 0,
          totalRowsInDB: currentStats.totalRows,
          strategyIds: currentStats.totalStrategies,
          lastUpload: log?.created_at || null,
          duration: log?.duration_ms ?? null,
          status: log?.status || "NO DATA",
          metadata: log?.metadata || null,
          statisticsError,
        };
      });

    res.json({ success: true, data: formatted });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: SYSTEM_LOG.FETCH_LATEST_ERROR,
    });
  }
};

/**
 * GET /api/system-logs/history/:tableName
 * Lấy lịch sử log của 1 bảng
 */
const getTableLogHistory = async (req, res) => {
  try {
    const { tableName } = req.params;
    await backtestAccessService.assertCanAccessBacktestTable(req.actor, tableName);
    const limit = parseInt(req.query.limit) || 50;

    const logs = await systemLogDAO.getLogsByTable(tableName, limit);

    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: SYSTEM_LOG.FETCH_HISTORY_ERROR,
    });
  }
};

/**
 * GET /api/system-logs/all
 * Lấy tất cả logs (có phân trang)
 */
const getAllLogs = async (req, res) => {
  try {
    const { logType = "SYNC", limit = 100 } = req.query;

    const accessibleTables = req.actor?.isAdmin
      ? null
      : (await backtestAccessService.getAccessibleDataSources(req.actor)).map((source) => source.source_name);
    const logs = await systemLogDAO.getLogsByType(logType, parseInt(limit), accessibleTables);

    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: SYSTEM_LOG.FETCH_ALL_ERROR,
    });
  }
};

/**
 * DELETE /api/system-logs/cleanup
 * Xóa log cũ (admin only)
 */
const cleanupOldLogs = async (req, res) => {
  try {
    const { daysToKeep = 90 } = req.body;

    const deletedCount = await systemLogDAO.cleanupOldLogs(daysToKeep);

    res.json({
      success: true,
      message: SYSTEM_LOG.CLEANUP_SUCCESS(deletedCount),
      deletedCount,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: SYSTEM_LOG.CLEANUP_ERROR,
    });
  }
};

/**
 * GET /api/system-logs/activity/:tableName
 * Lấy activity logs trong 3 tháng (NEW_RUN, UPDATE)
 */
const getActivityLogs = async (req, res) => {
  try {
    const { tableName } = req.params;
    await backtestAccessService.assertCanAccessBacktestTable(req.actor, tableName);

    const logs = await systemLogDAO.getActivityLogsByTable(tableName);

    // Format dữ liệu cho frontend
    const formatted = logs.map((log) => {
      const syncMode = ["NEW_RUN", "UPDATE"].includes(log.action)
        ? log.action
        : log.metadata?.sync_mode || "UNKNOWN";
      const strategyFilter = log.metadata?.strategy_filter || [];

      return {
        id: log.id,
        username: log.triggered_by || "SYSTEM",
        command: syncMode === "NEW_RUN" ? "NEW RUN" : "UPDATE",
        tableName: log.target_table,
        sheetNames: strategyFilter.length > 0 ? strategyFilter : null,
        status: log.status,
        totalFiles: Number(log.total_files || 0),
        successFiles: Number(log.success_count || 0),
        failedFiles: Number(log.failed_count || 0),
        createdAt: log.created_at,
        duration: log.duration_ms,
        issueSummary: getIssueSummary(log.metadata),
      };
    });
    res.json({ success: true, data: formatted });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: SYSTEM_LOG.FETCH_ACTIVITY_ERROR,
    });
  }
};

const downloadSyncJobIssues = async (req, res) => {
  try {
    const { syncId, issueType } = req.params;
    if (!['duplicate', 'error', 'notfound'].includes(issueType)) {
      return res.status(400).json({ success: false, error: 'Invalid issue type' });
    }
    const job = await systemLogDAO.getSyncJobIssues(syncId);
    if (!job) return res.status(404).json({ success: false, error: 'Sync job not found' });

    await backtestAccessService.assertCanAccessBacktestTable(req.actor, job.table_name);
    const issues = normalizeIssues(job.metadata);
    const selected = issueType === 'duplicate'
      ? issues.duplicate_files
      : issueType === 'error'
        ? issues.failed_files
        : issues.not_found_strategies;
    if (!selected.length) return res.status(404).json({ success: false, error: 'No issues found' });

    const fileName = issueType === 'duplicate' ? 'duplicate.txt' : issueType === 'error' ? 'error.txt' : 'notfound.txt';
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(formatIssueFile(issueType, job));
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, error: err.message });
  }
};

/**
 * DELETE /api/system-logs/table/:tableName
 * Xóa tất cả logs của 1 bảng backtest
 */
const deleteLogsByTable = async (req, res) => {
  try {
    const { tableName } = req.params;
    const deletedCount = await systemLogDAO.deleteLogsByTable(tableName);
    res.json({ success: true, deletedCount });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to delete logs' });
  }
};

module.exports = {
  getLatestBacktestLogs,
  getTableLogHistory,
  getAllLogs,
  cleanupOldLogs,
  getActivityLogs,
  deleteLogsByTable,
  downloadSyncJobIssues,
};
