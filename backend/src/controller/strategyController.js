// server/controller/strategyController.js

const strategyService = require("../service/strategyService");
const strategyMetadataDAO = require("../dao/strategyMetadataDao");
const notificationService = require("../service/notificationService");
const backtestAccessService = require("../service/backtestAccessService");
const { GENERAL, VALIDATION } = require("../utils/messages");

const CLIENT_ERROR_STATUSES = new Set([400, 401, 403, 404, 422]);

const sendStrategyError = (res, error, publicError, options = {}) => {
  if (res.headersSent) return null;
  const requestedStatus = Number(options.status ?? error.status);
  const status = CLIENT_ERROR_STATUSES.has(requestedStatus) ? requestedStatus : 500;
  const exposeClientMessage = status < 500 && options.exposeClientMessage !== false;
  const payload = {
    success: false,
    error: status === 400 ? "Bad Request" : publicError,
    message: exposeClientMessage ? error.message : status >= 500 ? GENERAL.INTERNAL_ERROR : publicError,
  };
  if (status < 500 && error.code) payload.code = error.code;
  return res.status(status).json(payload);
};

const parseJsonQuery = (value, fallback, label) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (err) {
    const error = new Error(`${label} must be valid JSON`);
    error.status = 400;
    throw error;
  }
};

const validateDateRange = (startDate, endDate) => {
  if (!startDate || !endDate) return null;

  const parseDateOnly = (value) => {
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const [year, month, day] = match.slice(1).map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
      ? date
      : null;
  };
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);

  if (!start || !end) {
    const error = new Error(VALIDATION.INVALID_DATE_FORMAT);
    error.status = 400;
    throw error;
  }

  if (start > end) {
    const error = new Error(VALIDATION.INVALID_DATE_ORDER);
    error.status = 400;
    throw error;
  }

  return { start, end };
};

// ─── User preferences ────────────────────────────────────────────────────────
const getPreferences = async (req, res) => {
  try {
    const data = await strategyMetadataDAO.getUserPreferences(req.userId);
    res.status(200).json({ strategyFilters: data });
  } catch (err) {
    console.error('❌ getPreferences error:', err.message);
    return sendStrategyError(res, err, 'Failed to load preferences');
  }
};

const savePreferences = async (req, res) => {
  try {
    const { strategyFilters } = req.body;
    if (!strategyFilters || typeof strategyFilters !== 'object') {
      return res.status(400).json({ message: 'Invalid payload' });
    }
    await strategyMetadataDAO.saveUserPreferences(req.userId, strategyFilters);
    res.status(200).json({ message: 'Preferences saved' });
  } catch (err) {
    console.error('❌ savePreferences error:', err.message);
    return sendStrategyError(res, err, 'Failed to save preferences');
  }
};

/**
 * GET /api/strategies
 * ✅ Thêm filter type
 */
const getStrategies = async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 20,
      backtest_table,
      analysis_run_id, // ✅ NEW: Analysis Run ID
      start_date,      // ✅ NEW: support start_date for API consolidation
      end_date,        // ✅ NEW: support end_date for API consolidation
      symbol,
      search,
      type, // ✅ 'buy' | 'sell'
      timeframe, // ✅ NEW: Timeframe filter (H1/H4)
      pd, // ✅ NEW: P/D ratio filter
      total_net_profit, // ✅ NEW: Total net profit filter
      total_trades, // ✅ NEW: Total trades filter
      winrate, // ✅ NEW: Winrate % filter
      largest_profit_trade_ratio, // ✅ NEW: Largest profit trade ratio filter
      risk_reward_ratio, // ✅ NEW: Risk-Reward Ratio filter
      history_quality, // ✅ NEW: History Quality % filter
      drawdown, // ✅ NEW: Drawdown % filter
      largest_loss_trade, // ✅ NEW: Largest Loss Trade filter
      profit_factor, // ✅ NEW: Profit Factor filter
      sharpe_ratio, // ✅ NEW: Sharpe Ratio filter
      recovery_factor, // ✅ NEW: Recovery Factor filter
      lr_correlation, // ✅ NEW: LR Correlation filter
      sort_by,        // ✅ Sort field (e.g. 'quantity')
      sort_dir,       // ✅ Sort direction: 'asc' | 'desc'
      filter_operators, // ✅ Operator per filter field (JSON string)
      filter_ranges,    // ✅ Range values per filter field (JSON string)
    } = req.query;

    console.log("🔍 [CONTROLLER] Received filter params:", {
      start_date,
      end_date,
      pd,
      total_net_profit,
      total_trades,
      winrate,
      largest_profit_trade_ratio,
      risk_reward_ratio,
      history_quality,
      drawdown,
      largest_loss_trade,
      profit_factor,
      sharpe_ratio,
      recovery_factor,
      lr_correlation,
      sort_by,
      sort_dir,
    });

    const effectiveStartDate = start_date || req.query.startDate;
    const effectiveEndDate = end_date || req.query.endDate;
    const effectiveBacktestTable = backtest_table || req.query.backtestTable || req.query.tableName;

    validateDateRange(effectiveStartDate, effectiveEndDate);

    let result;
    if (analysis_run_id || (effectiveStartDate && effectiveEndDate)) {
      console.log("🔄 Routing getStrategies to strategyService.getStrategiesByTimeRange");
      result = await strategyService.getStrategiesByTimeRange({
        analysis_run_id,
        backtestTable: effectiveBacktestTable,
        startDate: effectiveStartDate,
        endDate: effectiveEndDate,
        symbol,
        search,
        type,
        timeframe,
        pd,
        totalNetProfit: total_net_profit,
        totalTrades: total_trades,
        winrate,
        largestLossTrade: largest_loss_trade,
        largestProfitTradeRatio: largest_profit_trade_ratio,
        riskRewardRatio: risk_reward_ratio,
        drawdown,
        profitFactor: profit_factor,
        sharpeRatio: sharpe_ratio,
        recoveryFactor: recovery_factor,
        lrCorrelation: lr_correlation,
        operators: parseJsonQuery(filter_operators, {}, "filter_operators"),
        ranges: parseJsonQuery(filter_ranges, {}, "filter_ranges"),
        sortBy: sort_by,
        sortDir: sort_dir,
        page: parseInt(page, 10),
        pageSize: parseInt(pageSize, 10)
      });
    } else {
      console.log("🔄 Routing getStrategies to strategyService.getStrategies");
      result = await strategyService.getStrategies({
        analysis_run_id,
        backtestTable: effectiveBacktestTable,
        symbol,
        search,
        type,
        timeframe,
        pd,
        totalNetProfit: total_net_profit,
        totalTrades: total_trades,
        winrate,
        largestProfitTradeRatio: largest_profit_trade_ratio,
        riskRewardRatio: risk_reward_ratio,
        drawdown,
        largestLossTrade: largest_loss_trade,
        profitFactor: profit_factor,
        sharpeRatio: sharpe_ratio,
        recoveryFactor: recovery_factor,
        lrCorrelation: lr_correlation,
        sortBy: sort_by,
        sortDir: sort_dir,
        filterOperators: parseJsonQuery(filter_operators, {}, "filter_operators"),
        filterRanges: parseJsonQuery(filter_ranges, {}, "filter_ranges"),
        page: parseInt(page, 10),
        pageSize: parseInt(pageSize, 10),
      });
    }

    res.json(result);
  } catch (err) {
    console.error("❌ Error in getStrategies:", err.message);
    return sendStrategyError(res, err, "Failed to fetch strategies");
  }
};

/**
 * GET /api/strategies/:strategyId/:backtestTable
 */
const getStrategyDetail = async (req, res) => {
  try {
    const { strategyId, backtestTable } = req.params;

    // ✅ Use strategyService with caching
    const strategy = await strategyService.getStrategyDetail(strategyId, backtestTable);

    if (!strategy) {
      return res.status(404).json({
        error: "Strategy not found",
        strategyId,
        backtestTable,
      });
    }

    res.json(strategy);
  } catch (err) {
    console.error("❌ Error in getStrategyDetail:", err.message);
    return sendStrategyError(res, err, "Failed to fetch strategy detail");
  }
};

/**
 * GET /api/strategies/symbols/distinct
 */
const getDistinctSymbols = async (req, res) => {
  try {
    const { backtest_table } = req.query;

    // ✅ Use strategyService with caching
    const symbols = await strategyService.getDistinctSymbols(backtest_table);

    res.json({ symbols });
  } catch (err) {
    console.error("❌ Error in getDistinctSymbols:", err.message);
    return sendStrategyError(res, err, "Failed to fetch symbols");
  }
};

/**
 * GET /api/strategies/statistics/summary
 */
const getStatistics = async (req, res) => {
  try {
    const { backtest_table } = req.query;

    // ✅ Use strategyService with caching
    const stats = await strategyService.getStrategyStatistics(backtest_table);

    res.json(stats);
  } catch (err) {
    console.error("❌ Error in getStatistics:", err.message);
    return sendStrategyError(res, err, "Failed to fetch statistics");
  }
};

/**
 * DELETE /api/strategies/:strategyId
 */
const deleteStrategy = async (req, res) => {
  try {
    const { strategyId } = req.params;
    const requestedBacktestTable = req.params.backtestTable || req.query.backtest_table || req.query.backtestTable || req.body?.backtest_table || req.body?.backtestTable;

    if (!requestedBacktestTable) {
      return res.status(400).json({
        error: "backtestTable is required",
        strategyId,
      });
    }

    const source = await backtestAccessService.assertCanManageBacktestTable(req.actor, requestedBacktestTable);
    const backtestTable = source.source_name;

    const deleted = await strategyMetadataDAO.deleteStrategyMetadata(strategyId, backtestTable);

    if (!deleted) {
      return res.status(404).json({
        error: "Strategy not found",
        strategyId,
        backtestTable,
      });
    }

    // Xoa sach deals lien quan trong bang backtest tuong ung
    const pool = require("../config/db").getAppPool();
    try {
      await pool.query(`DELETE FROM "${backtestTable}" WHERE "Strategy_id" = $1`, [strategyId]);
    } catch (delErr) {
      await pool.query(`DELETE FROM "${backtestTable}" WHERE "strategy_id" = $1`, [strategyId]).catch(() => {});
    }

    console.log(`🗑️  [DELETE STRATEGY] Đã xóa thành công strategy_id: ${strategyId} khỏi bảng: ${backtestTable}. Đang làm mới dữ liệu all_backtests...`);

    // Refresh materialized view và clear cache ở background
    const { scheduleRefresh } = require("../dao/materializedViewDao");
    const opService = require("../service/opService");
    try {
      scheduleRefresh(backtestTable, `delete-strategy:${strategyId}`);
      console.log(`🔄 [MV] scheduleRefresh scheduled in background after deleting strategy ${strategyId}`);
    } catch (err) {
      console.error("❌ Failed background materialized view refresh after deleteStrategy:", err.message);
    } finally {
      opService.clearAllCaches(backtestTable);
    }

    res.json({
      message: "Strategy deleted successfully",
      strategyId: deleted.strategy_id,
      backtestTable: deleted.backtest_table,
    });

    await notificationService.notifyStrategyDeleted({
      userId: req.userId,
      strategyId: deleted.strategy_id,
      tableName: deleted.backtest_table,
    });
  } catch (err) {
    console.error("❌ Error in deleteStrategy:", err.message);

    await notificationService.notifyStrategyDeleteFailed({
      userId: req.userId,
      strategyId: req.params?.strategyId,
      error: err.message,
    });

    return sendStrategyError(res, err, "Failed to delete strategy");
  }
};

/**
 * ✅ NEW: GET /api/strategies/ids
 * Get ONLY strategy IDs (optimized for copy operations)
 */
const getStrategyIdsOnly = async (req, res) => {
  try {
    const {
      backtest_table,
      analysis_run_id, // ✅ NEW: Analysis Run ID
      start_date,      // ✅ NEW
      end_date,        // ✅ NEW
      symbol,
      search,
      type,
      timeframe,
      pd,
      total_net_profit,
      total_trades,
      winrate,
      largest_profit_trade_ratio,
      risk_reward_ratio,
      drawdown,
      largest_loss_trade,
      profit_factor,
      sharpe_ratio,
      recovery_factor,
      lr_correlation,
      filter_operators,
      filter_ranges,
    } = req.query;

    console.log("🔍 [CONTROLLER] Get IDs Only - filters:", {
      backtest_table,
      analysis_run_id,
      start_date,
      end_date,
      symbol,
      search,
      type,
      timeframe,
      pd,
      total_net_profit,
      total_trades,
      winrate,
      largest_profit_trade_ratio,
      risk_reward_ratio,
      drawdown,
      largest_loss_trade,
      profit_factor,
      sharpe_ratio,
      recovery_factor,
      lr_correlation,
    });

    const effectiveStartDate = start_date || req.query.startDate;
    const effectiveEndDate = end_date || req.query.endDate;
    const effectiveBacktestTable = backtest_table || req.query.backtestTable || req.query.tableName;

    validateDateRange(effectiveStartDate, effectiveEndDate);

    const ids = await strategyService.getStrategyIdsOnly({
      analysis_run_id,
      backtestTable: effectiveBacktestTable,
      startDate: effectiveStartDate,      // ✅ NEW
      endDate: effectiveEndDate,          // ✅ NEW
      symbol,
      search,
      type,
      timeframe,
      pd,
      totalNetProfit: total_net_profit,
      totalTrades: total_trades,
      winrate,
      largestProfitTradeRatio: largest_profit_trade_ratio,
      riskRewardRatio: risk_reward_ratio,
      drawdown,
      largestLossTrade: largest_loss_trade,
      profitFactor: profit_factor,
      sharpeRatio: sharpe_ratio,
      recoveryFactor: recovery_factor,
      lrCorrelation: lr_correlation,
      filterOperators: parseJsonQuery(filter_operators, {}, "filter_operators"),
      filterRanges: parseJsonQuery(filter_ranges, {}, "filter_ranges"),
    });

    res.json({
      ids,
      count: ids.length,
    });
  } catch (err) {
    console.error("❌ Error in getStrategyIdsOnly:", err.message);
    return sendStrategyError(res, err, "Failed to fetch strategy IDs");
  }
};

/**
 * Get service account emails
 */
const getServiceAccountEmails = async (req, res) => {
  try {
    const ggSheetService = require("../service/ggSheetService");
    const emails = ggSheetService.getServiceAccountEmails();

    res.status(200).json({
      success: true,
      message: "Lấy danh sách service account emails thành công",
      data: {
        emails,
        count: emails.length,
      },
    });
  } catch (error) {
    console.error("Error getting service account emails:", error);
    return sendStrategyError(res, error, "Failed to fetch service account emails");
  }
};

/**
 * POST /api/strategies/cache/clear
 * ✅ Clear backend in-memory cache (call when data is deleted directly from DB)
 */
const clearCache = (req, res) => {
  try {
    // Clear all backend caches thưa đại ca Xuân Sơn
    const opService = require("../service/opService");
    opService.clearAllCaches();
    console.log('🗑️  [CONTROLLER] Backend all caches cleared via API');
    res.json({ success: true, message: 'Strategy cache cleared successfully' });
  } catch (err) {
    console.error('❌ Error clearing cache:', err.message);
    return sendStrategyError(res, err, 'Failed to clear cache');
  }
};

/**
 * GET /api/strategies/sheet/download/:sheetId
 * ✅ Download Google Sheet as xlsx via service account
 */
const downloadSheet = async (req, res) => {
  const { sheetId } = req.params;
  const { filename = 'strategy' } = req.query;

  if (!sheetId) {
    return res.status(400).json({ error: 'sheetId is required' });
  }

  try {
    const googleSheet = require('../config/googleSheet');
    const drive = googleSheet.getNextDriveClient();

    const exportRes = await drive.files.export(
      { fileId: sheetId, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      { responseType: 'arraybuffer', timeout: 60000 }
    );

    const safeFilename = encodeURIComponent(`${filename}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${safeFilename}`);
    res.send(Buffer.from(exportRes.data));

    console.log(`✅ [DOWNLOAD] Sheet ${sheetId} downloaded as ${filename}.xlsx`);
  } catch (err) {
    console.error('❌ Error downloading sheet:', err.message);
    const googleStatus = Number(err.code || err.status);
    const msg = String(err.message || '');

    let status = 500;
    if (googleStatus === 404 || msg.toLowerCase().includes('file not found') || msg.toLowerCase().includes('not found')) {
      status = 404;
    } else if (googleStatus === 403 || msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('access denied')) {
      status = 403;
    } else if (googleStatus === 400 || msg.toLowerCase().includes('invalid')) {
      status = 400;
    }

    if (res.getHeader('Content-Disposition')) {
      res.removeHeader('Content-Disposition');
    }
    res.setHeader('Content-Type', 'application/json');
    return sendStrategyError(res, err, 'Failed to download sheet', {
      status,
      exposeClientMessage: false,
    });
  }
};

/**
 * Get strategy IDs (sheet names) from Google Drive folder
 */
const getStrategyIdsFromFolder = async (req, res) => {
  try {
    const { folderLink } = req.body;

    if (!folderLink) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp link Google Drive folder",
      });
    }

    const ggSheetService = require("../service/ggSheetService");
    const sheetNames = await ggSheetService.getSheetNamesFromFolder(folderLink);

    res.status(200).json({
      success: true,
      message: `Đã tìm thấy ${sheetNames.length} strategy IDs`,
      data: {
        sheetNames,
        count: sheetNames.length,
        folderLink,
      },
    });
  } catch (error) {
    console.error("Error getting strategy IDs:", error.message);
    return sendStrategyError(res, error, "Failed to fetch strategy IDs from folder");
  }
};

module.exports = {
  getStrategies,
  getStrategyDetail,
  getDistinctSymbols,
  getStatistics,
  getStrategyIdsOnly,
  deleteStrategy,
  getServiceAccountEmails,
  getStrategyIdsFromFolder,
  clearCache,
  downloadSheet,
  getPreferences,
  savePreferences,
};
