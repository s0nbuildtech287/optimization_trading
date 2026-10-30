const opService = require("../service/opService");
const constants = require("../utils/constants");
const { OPERATION, GENERAL, DRIVE_SUMMARY } = require("../utils/messages");
const dataValidationService = require("../service/dataValidationService.js");
const syncProgressTracker = require("../utils/syncProgressTracker");
const checkFileService = require("../service/checkFileService");
const ggSheetService = require("../service/ggSheetService");
const notificationService = require("../service/notificationService");
const fs = require("fs");
const path = require("path");
const strategyMetadataDAO = require("../dao/strategyMetadataDao");
const opDao = require("../dao/opDao");
const backtestAccessService = require("../service/backtestAccessService");

const getIssueFileFlags = (syncResult) => {
  const issues = syncResult?._syncSummary?.metadata?.issues || {};
  return {
    hasDuplicate: (issues.duplicate_files || []).length > 0,
    hasError: (issues.failed_files || []).length > 0,
    hasNotFound: (issues.not_found_strategies || []).length > 0,
  };
};

const requestTableName = (req) => (
  req.body?.tableName
  || req.body?.TableName
  || req.query?.tableName
  || req.params?.tableName
  || null
);

const assertTableRead = async (req, tableName = requestTableName(req)) => {
  if (!tableName) return null;
  if (String(tableName).toLowerCase() === "all_backtests" || String(tableName).includes(",")) {
    return backtestAccessService.validateAccessibleSourceNames(req.actor, tableName);
  }
  return backtestAccessService.assertCanAccessBacktestTable(req.actor, tableName);
};

const assertTableWriteOrCreate = async (req, tableName = requestTableName(req)) => {
  if (!tableName) return null;
  return backtestAccessService.assertCanCreateOrWriteBacktestTable(req.actor, tableName);
};

// Đồng bộ dữ liệu trực tiếp (chạy đồng bộ)
const syncSheet = async (req, res) => {
  const startTime = Date.now();
  const TABLE_NAME = req.body?.tableName || "UNKNOWN_TABLE";
  const username = req.body?.username || req.user?.username || "SYSTEM";
  let syncId = null;

  try {
    await assertTableWriteOrCreate(req, requestTableName(req));
    syncId = await syncProgressTracker.createSyncJob(
      TABLE_NAME,
      0,
      username,
      req.userId,
      req.body?.runType || constants.RUN_TYPE.NEW_RUN,
    );
    const statsBefore = await dataValidationService.getCurrentStats(TABLE_NAME);
    const syncResult = await opService.asyncProcessSheetGroups(req, constants.LOAD_TYPE.DRIVE, 12, syncId);

    const duration = Date.now() - startTime;
    const logFiles = getIssueFileFlags(syncResult);
    await syncProgressTracker.completeSyncJob(syncId, {
      statsBefore,
      stats: syncResult.stats,
      logFiles,
      notFoundStrategies: syncResult.notFoundStrategies,
      availableStrategies: syncResult.availableStrategies,
      _syncSummary: syncResult._syncSummary,
    });

    res.status(200).json({
      message: OPERATION.SYNC_SUCCESS(TABLE_NAME),
      syncId,
      durationMs: duration,
      statsBefore: statsBefore,
      stats: syncResult.stats,
      logFiles: logFiles,
      notFoundStrategies: syncResult.notFoundStrategies,
      availableStrategies: syncResult.availableStrategies,
    });
  } catch (err) {
    const duration = Date.now() - startTime;
    if (syncId) await syncProgressTracker.failSyncJob(syncId, err.message);

    res.status(500).json({
      error: err.message || OPERATION.SYNC_ERROR,
      durationMs: duration,
    });
  }
};

// Đồng bộ dữ liệu qua background (chạy bất đồng bộ)
const syncSheetAsync = async (req, res) => {
  const TABLE_NAME = req.body?.tableName || "UNKNOWN_TABLE";
  const username = req.body?.username || req.user?.username || "SYSTEM";

  try {
    await assertTableWriteOrCreate(req, requestTableName(req));
    // Ước tính số files (sẽ update chính xác sau)
    const estimatedFiles = 3500;

    // Tạo sync job
    const syncId = await syncProgressTracker.createSyncJob(
      TABLE_NAME,
      estimatedFiles,
      username,
      req.userId,
      req.body?.runType || constants.RUN_TYPE.NEW_RUN,
    );

    console.log(`🚀 Starting async sync for ${TABLE_NAME}, syncId: ${syncId}`);

    // Trả response NGAY LẬP TỨC
    res.status(202).json({
      message: "Sync started in background",
      syncId,
      tableName: TABLE_NAME,
      status: "PROCESSING",
      pollUrl: `/api/sync-status/${syncId}`,
    });

    // Chạy sync trong background (không await)
    (async () => {
      try {
        const statsBefore = await dataValidationService.getCurrentStats(TABLE_NAME);

        // Chạy sync với progress callback
        const syncResult = await opService.asyncProcessSheetGroups(
          req,
          constants.LOAD_TYPE.DRIVE,
          12, // noAsyncCall
          syncId, // truyền syncId để report progress
        );

        const logFiles = getIssueFileFlags(syncResult);

        // Hoàn thành
        await syncProgressTracker.completeSyncJob(syncId, {
          statsBefore,
          stats: syncResult.stats,
          logFiles,
          notFoundStrategies: syncResult.notFoundStrategies,
          availableStrategies: syncResult.availableStrategies,
          _syncSummary: syncResult._syncSummary,
        });

        console.log(`✅ Async sync completed: ${syncId}`);
      } catch (err) {
        console.error(`❌ Async sync failed: ${syncId}`, err.message);
        if (err?.code === syncProgressTracker.SYNC_CANCELLED_CODE) {
          opService.clearAllCaches(TABLE_NAME);
          const mvManager = require("../dao/materializedViewDao");
          mvManager.scheduleRefresh(TABLE_NAME, `cancelled-sync:${TABLE_NAME}`);
          console.warn(`[SYNC] Stopped sync_id=${syncId} table=${TABLE_NAME}; caches cleared`);
        }
        await syncProgressTracker.failSyncJob(syncId, err.message);
      } finally {
        syncProgressTracker.releaseSyncCancellation(syncId);
      }
    })();
  } catch (err) {
    res.status(500).json({
      error: err.message || OPERATION.SYNC_ERROR,
    });
  }
};

// Kiểm tra trạng thái tiến độ đồng bộ (polling)
const getSyncStatus = async (req, res) => {
  const { syncId } = req.params;
  const job = await syncProgressTracker.getSyncJob(syncId);

  if (!job) {
    return res.status(404).json({
      error: "Sync job not found or expired",
    });
  }

  const jobUserId = job.userId ?? job.user_id;
  if (!req.actor?.isAdmin && Number(jobUserId) !== Number(req.userId)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (String(job.tableName || '').toLowerCase().startsWith('backtest')) {
    await backtestAccessService.assertCanAccessBacktestTable(req.actor, job.tableName);
    if (job.status === 'COMPLETED' && job.result?.stats) {
      const currentStats = await opDao.getBacktestCurrentStats(job.tableName);
      job.result.stats = {
        ...job.result.stats,
        totalRows: currentStats.totalRows,
        strategyIds: currentStats.totalStrategies,
      };
    }
  }

  res.status(200).json(job);
};

const cancelSync = async (req, res) => {
  const { syncId } = req.params;
  try {
    const job = await syncProgressTracker.getSyncJob(syncId);
    if (!job) return res.status(404).json({ success: false, error: "Sync job not found" });

    if (!req.actor?.isAdmin && Number(job.userId) !== Number(req.userId)) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }
    if (job.operationType !== "BACKTEST_SYNC") {
      return res.status(400).json({ success: false, error: "Only backtest sync jobs can be stopped" });
    }

    const result = await syncProgressTracker.cancelSyncJob(syncId, req.userId);
    if (result.status === "NOT_PROCESSING") {
      return res.status(409).json({ success: false, error: "Sync job is no longer running" });
    }
    return res.json({ success: true, syncId, status: "FAILED", message: "Sync stopped by user" });
  } catch (error) {
    console.error(`[SYNC] Failed to stop sync_id=${syncId}:`, error.message);
    return res.status(500).json({ success: false, error: "Failed to stop sync" });
  }
};

const deleteRowsById = async (req, res) => {
  const { tableName, column, values } = req.body;

  try {
    if (!tableName || !column || !values) {
      return res.status(400).json({ error: OPERATION.MISSING_INPUT });
    }
    await assertTableRead(req, tableName);
    await opService.deleteRowsById(tableName, column, values);
    res.status(200).send(OPERATION.DELETE_SUCCESS);
  } catch (error) {
    res.status(500).send(OPERATION.DELETE_ERROR);
  }
};

const dropTable = async (req, res) => {
  try {
    const tableName = req.body?.tableName || req.query?.tableName;
    if (!tableName) {
      return res.status(400).json({ error: OPERATION.MISSING_INPUT });
    }
    await assertTableRead(req, tableName);
    await opService.dropTable(tableName);
    res.status(200).json({ message: OPERATION.DROP_TABLE_SUCCESS });
  } catch (error) {
    res.status(500).json({ error: OPERATION.DROP_TABLE_ERROR });
  }
};

const clearData = async (req, res) => {
  try {
    const tableName = req.body?.tableName || req.query?.tableName;
    if (!tableName) {
      return res.status(400).json({ success: false, error: OPERATION.MISSING_INPUT });
    }
    await assertTableRead(req, tableName);
    const message = await opService.clearData(tableName);
    res.status(200).json({ success: true, message });
  } catch (error) {
    res.status(500).json({ success: false, error: OPERATION.CLEAR_TABLE_ERROR });
  }
};

const updateRow = async (req, res) => {
  try {
    const tableName = req.body?.tableName || req.query?.tableName;
    if (!tableName) {
      return res.status(400).json({ error: OPERATION.MISSING_INPUT });
    }
    await assertTableRead(req, tableName);
    const { column, sheetNames } = await opService.getDataBySheetName(req.query);
    if (!sheetNames || sheetNames.length === 0) {
      return res.status(400).json({
        error: OPERATION.UPDATE_ERROR,
        details: OPERATION.NO_VALID_SHEETS,
      });
    }

    await opService.updateRowsByColumn(tableName, column, sheetNames);

    res.status(200).json({
      message: OPERATION.UPDATE_SUCCESS(column, sheetNames.join(", ")),
    });
  } catch (error) {
    res.status(500).json({
      error: OPERATION.UPDATE_ERROR,
      details: error.message,
    });
  }
};

const getOrderTotals = async (req, res) => {
  try {
    const { tableName } = req.query;

    if (!tableName) {
      return res.status(400).json({ error: "Missing tableName" });
    }

    const strategy_id = req.query["filter[strategy_id]"] || null;
    const symbol = req.query["filter[symbol]"] || null;
    const year = req.query["filter[year]"] || null;
    const search = req.query["filter[search]"] || null;
    const start_date = req.query["filter[start_date]"] || req.query.startDate || req.query.start_date || null;
    const end_date = req.query["filter[end_date]"] || req.query.endDate || req.query.end_date || null;

    if (start_date && end_date && new Date(start_date) > new Date(end_date)) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Khoảng thời gian không hợp lệ: Ngày bắt đầu (startDate) không được lớn hơn ngày kết thúc (endDate)."
      });
    }

    await assertTableRead(req, tableName);
    const orderService = require("../service/orderService");
    const result = await orderService.getOrderTotals(tableName, strategy_id, symbol, year, search, start_date, end_date);

    res.json({ totals: result });
  } catch (error) {
    console.error("❌ Error fetching order totals:", error);
    res.status(500).json({ error: OPERATION.FETCH_ERROR });
  }
};

const getPagedData = async (req, res) => {
  try {
    const { page = 1, pageSize = 50, tableName } = req.query;

    if (!tableName) {
      return res.status(400).json({ error: "Missing tableName" });
    }

    const strategy_id = req.query["filter[strategy_id]"] || null;
    const symbol = req.query["filter[symbol]"] || null;
    const year = req.query["filter[year]"] || null;
    const search = req.query["filter[search]"] || null;

    const start_date = req.query["filter[start_date]"] || req.query.startDate || req.query.start_date || null;
    const end_date = req.query["filter[end_date]"] || req.query.endDate || req.query.end_date || null;

    if (start_date && end_date && new Date(start_date) > new Date(end_date)) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Khoảng thời gian không hợp lệ: Ngày bắt đầu (startDate) không được lớn hơn ngày kết thúc (endDate)."
      });
    }
    const sort_time_dir = req.query["sort_time_dir"] || null;
    const sort_deal_dir = req.query["sort_deal_dir"] || null;
    const sort_symbol_dir = req.query["sort_symbol_dir"] || null;
    const sort_commission_dir = req.query["sort_commission_dir"] || null;
    const sort_swap_dir = req.query["sort_swap_dir"] || null;
    const sort_profit_dir = req.query["sort_profit_dir"] || null;

    await assertTableRead(req, tableName);
    const pageNum = parseInt(page, 10);
    const pageSizeNum = parseInt(pageSize, 10);

    // ✅ Use orderService with caching
    const orderService = require("../service/orderService");
    const result = await orderService.getPagedOrders(
      tableName,
      pageNum,
      pageSizeNum,
      strategy_id,
      symbol,
      year,
      search,
      start_date,
      end_date,
      sort_time_dir,
      sort_deal_dir,
      sort_symbol_dir,
      sort_commission_dir,
      sort_swap_dir,
      sort_profit_dir,
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: OPERATION.FETCH_ERROR });
  }
};

const downloadLog = async (req, res) => {
  try {
    const { type } = req.query;

    if (!type || !["duplicate", "error", "notfound"].includes(type)) {
      return res.status(400).json({ error: "Type phải là 'duplicate', 'error' hoặc 'notfound'" });
    }

    const logsDir = path.join(__dirname, "..", "..", "logs");
    const fileName = type === "duplicate" ? "duplicate.txt" : type === "error" ? "error.txt" : "notfound.txt";
    const filePath = path.join(logsDir, fileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: `File ${fileName} không tồn tại` });
    }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    res.status(500).json({ error: OPERATION.DOWNLOAD_ERROR });
  }
};

// ✅ API RIÊNG CHO FILTER OPTIONS
const getFilterOptions = async (req, res) => {
  try {
    const { tableName = "all_backtests" } = req.query;

    await assertTableRead(req, tableName);
    console.log(`📊 Loading filter options for: ${tableName}`);
    const filterOptions = await opService.getFilterOptions(tableName);

    // Trả về data trực tiếp
    res.json(filterOptions);
  } catch (error) {
    console.error("❌ Error loading filter options:", error);
    res.status(500).json({
      error: error.message || "Failed to load filter options",
    });
  }
};

// ✅ NEW: Get balance chart data
const getBalanceChart = async (req, res) => {
  try {
    const { tableName, strategyId } = req.params;
    const { initialDeposit = 1000000, startDate = null, endDate = null, maxVolume = null } = req.query;

    if (!tableName || !strategyId) {
      return res.status(400).json({
        success: false,
        error: "tableName and strategyId are required",
      });
    }

    const effectiveStartDate = startDate || req.query.start_date || null;
    const effectiveEndDate = endDate || req.query.end_date || null;

    if (effectiveStartDate && effectiveEndDate && new Date(effectiveStartDate) > new Date(effectiveEndDate)) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Khoảng thời gian không hợp lệ: Ngày bắt đầu (startDate) không được lớn hơn ngày kết thúc (endDate)."
      });
    }

    await assertTableRead(req, tableName);
    const data = await opService.getBalanceChartData(tableName, strategyId, parseFloat(initialDeposit), {
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
      maxVolume: maxVolume === null || maxVolume === '' ? null : parseFloat(maxVolume)
    });

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error fetching balance chart:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to load balance chart data",
    });
  }
};

// ─── BACKTEST TABLE MANAGEMENT ─────────────────────────────────────────────────
/**
 * ✅ Get all backtest tables
 */
const getDataSources = async (req, res) => {
  try {
    const dataSourceDao = require("../dao/dataSourceDao");
    const sources = await dataSourceDao.getEnabledDataSources();
    res.json({
      success: true,
      sources,
      tables: sources.map((s) => s.source_name),
      count: sources.length,
    });
  } catch (error) {
    console.error("❌ Error getting data sources:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch data sources",
      message: error.message,
    });
  }
};

const getBacktestTables = async (req, res) => {
  try {
    const dataSourceDao = require("../dao/dataSourceDao");
    const sources = await dataSourceDao.getEnabledDataSources(req.actor);
    const tables = sources.map((source) => source.source_name);
    res.json({
      success: true,
      tables,
      sources,
      count: tables.length,
    });
  } catch (error) {
    console.error("❌ Error getting backtest tables:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch backtest tables",
      message: error.message,
    });
  }
};

/**
 * ✅ Create new backtest table
 */
const createBacktestTable = async (req, res) => {
  try {
    const { tableName } = req.body;

    if (!tableName) {
      return res.status(400).json({
        success: false,
        error: "Table name is required",
      });
    }

    const backtestAccessService = require("../service/backtestAccessService");
    await backtestAccessService.assertCanCreateOrWriteBacktestTable(req.actor, tableName);
    const result = await opService.createBacktestTable(tableName, req.userId);

    await notificationService.notifyBacktestTableCreated({
      userId: req.userId,
      tableName,
    });

    res.json({
      success: true,
      message: `Table "${tableName}" created successfully`,
      table: result.tableName,
    });
  } catch (error) {
    console.error("❌ Error creating backtest table:", error);
    res.status(error.status || 500).json({
      success: false,
      error: "Failed to create backtest table",
      message: error.message,
    });
  }
};

const deleteBacktestTable = async (req, res) => {
  console.log(`🗑️  [CONTROLLER] DELETE /api/backtest-tables/${req.params?.tableName} received`);
  try {
    const { tableName } = req.params;
    if (!tableName) {
      return res.status(400).json({ success: false, error: "Table name is required" });
    }
    const backtestAccessService = require("../service/backtestAccessService");
    await backtestAccessService.assertCanManageBacktestTable(req.actor, tableName);
    console.log(`🗑️  [CONTROLLER] Calling opService.deleteBacktestTable("${tableName}")`);
    const result = await opService.deleteBacktestTable(tableName);
    console.log(`✅ [CONTROLLER] Table "${tableName}" deleted successfully`);

    await notificationService.notifyBacktestTableDeleted({
      userId: req.userId,
      tableName,
    });

    res.json({ success: true, message: `Table "${tableName}" deleted successfully`, table: result.tableName });
  } catch (error) {
    console.error("❌ Error deleting backtest table:", error);
    res.status(500).json({ success: false, error: "Failed to delete backtest table", message: error.message });
  }
};

const assignBacktestTableOwner = async (req, res) => {
  try {
    const tableName = req.params.sourceName || req.params.tableName;
    const ownerUserId = req.body?.ownerUserId ?? req.body?.owner_user_id ?? null;
    if (ownerUserId !== null) {
      const { getAppPool } = require('../config/db');
      const userResult = await getAppPool().query('SELECT id FROM users WHERE id = $1 LIMIT 1', [Number(ownerUserId)]);
      if (!userResult.rows[0]) {
        return res.status(400).json({ success: false, error: 'Owner user does not exist' });
      }
    }
    const dataSourceDao = require('../dao/dataSourceDao');
    const registeredSource = await backtestAccessService.getDataSourceByName(tableName);
    if (!registeredSource || !registeredSource.physical_table_exists || !registeredSource.is_backtest_schema) {
      return res.status(404).json({ success: false, error: 'Backtest table is not registered' });
    }
    const source = await dataSourceDao.assignDataSourceOwner(
      tableName,
      ownerUserId === null ? null : Number(ownerUserId),
      { changedByUserId: req.userId },
    );
    if (!source) return res.status(404).json({ success: false, error: 'Backtest table is not registered' });
    opService.clearAllCaches(tableName);
    res.json({ success: true, source });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
};

// ─── CHECK FILES (Group 3 + 4) ────────────────────────────────────────────────
/**
 * POST /check-files
 * Accepts multipart files (Mode Local) or JSON { driveUrl } (Mode Drive).
 * Returns syncId immediately; processing runs in background.
 */
const checkFiles = async (req, res) => {
  const reqStart = Date.now();
  const username = req.body?.username || req.user?.username || "SYSTEM";

  // Parse config from form-data or JSON body
  let config;
  try {
    const rawConfig = req.body?.config || "{}";
    config = typeof rawConfig === "string" ? JSON.parse(rawConfig) : rawConfig;
  } catch {
    config = {};
  }

  const checkConfig = {
    minProfit: config.minProfit !== undefined ? Number(config.minProfit) : 0,
    minTrades: config.minTrades !== undefined ? Number(config.minTrades) : 100,
    maxLoss: config.maxLoss !== undefined ? Number(config.maxLoss) : -20000,
  };
  const enableGroup4 = true;

  const driveUrl = req.body?.driveUrl || null;
  const files = req.files || [];

  const totalUploadSize = files.reduce((sum, file) => sum + (file.size || 0), 0);
  const MAX_TOTAL_UPLOAD_SIZE = 500 * 1024 * 1024;

  console.log("[check-files] Incoming request", {
    username,
    mode: files.length > 0 ? "local" : "drive",
    localFiles: files.length,
    hasDriveUrl: Boolean(driveUrl),
    enableGroup4,
    config: checkConfig,
  });

  if (files.length === 0 && !driveUrl) {
    return res.status(400).json({ success: false, error: "Cần cung cấp files hoặc driveUrl" });
  }

  if (files.length > 0 && totalUploadSize > MAX_TOTAL_UPLOAD_SIZE) {
    return res.status(413).json({
      success: false,
      error: "Kích thước upload vượt giới hạn cho phép",
    });
  }

  // Estimate total files
  const estimatedTotal = files.length > 0 ? files.length : 100;
  const syncId = await syncProgressTracker.createSyncJob("check-files", estimatedTotal, username, req.userId);

  console.log("[check-files] Job accepted", {
    syncId,
    estimatedTotal,
    responseLatencyMs: Date.now() - reqStart,
  });

  // Return syncId immediately
  res.status(202).json({
    success: true,
    syncId,
    totalFiles: estimatedTotal,
    pollUrl: `/api/sync-status/${syncId}`,
  });

  // Run in background
  (async () => {
    try {
      const results = await checkFileService.run({
        files,
        driveUrl,
        config: checkConfig,
        enableGroup4,
        syncId,
      });

      // checkFileService đã gọi updateSyncProgress({ totalFiles: fileList.length })
      // nên lấy từ job là chính xác nhất
      const jobSnapshot = await syncProgressTracker.getSyncJob(syncId);
      const actualTotalFiles = jobSnapshot?.totalFiles || (files.length > 0 ? files.length : estimatedTotal);
      const violationRows = results.filter(r => r.status === 'Lỗi' || r.errorCode);

      await syncProgressTracker.completeSyncJob(syncId, {
        results,
        stats: {
          total: actualTotalFiles,
          totalFiles: actualTotalFiles,
          totalRows: violationRows.length,
        },
      });
      console.log(`[check-files] Job completed`, {
        syncId,
        resultRows: results.length,
      });
    } catch (err) {
      console.error(`[check-files] Job failed`, {
        syncId,
        error: err.message,
      });
      await syncProgressTracker.failSyncJob(syncId, err.message);
    }
  })();
};

const getDriveSummary = async (req, res) => {
  const driveFolderUrl = req.body?.driveFolderUrl;
  if (!driveFolderUrl) {
    return res.status(400).json({ success: false, error: DRIVE_SUMMARY.MISSING_URL });
  }
  const folderId = ggSheetService.extractFolderId(driveFolderUrl);
  if (!folderId) {
    return res.status(400).json({ success: false, error: DRIVE_SUMMARY.INVALID_URL });
  }

  const username = req.body?.username || req.user?.username || "SYSTEM";
  let syncId;
  try {
    syncId = await syncProgressTracker.createSyncJob(
      "drive-summary",
      1,
      username,
      req.userId,
      constants.RUN_TYPE.SUMMARY,
    );
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  res.status(202).json({
    success: true,
    syncId,
    status: "PROCESSING",
    pollUrl: `/api/sync-status/${syncId}`,
  });

  (async () => {
    const startedAt = Date.now();
    console.log("\n========== DRIVE SUMMARY START ==========");
    console.log(`[DRIVE SUMMARY] sync_id=${syncId} user=${username} user_id=${req.userId || "unknown"} folder_id=${folderId}`);
    try {
      const summary = await ggSheetService.getDriveStructureSummary(driveFolderUrl, syncId);
      await syncProgressTracker.completeSyncJob(syncId, { mode: constants.RUN_TYPE.SUMMARY, summary });
      const assetTotals = (summary.assets || [])
        .map((asset) => `${asset.symbol || asset.folderName || "unknown"}=${asset.totalFiles || 0}`)
        .join(" | ");
      console.log(`[DRIVE SUMMARY] COMPLETED sync_id=${syncId} duration_ms=${Date.now() - startedAt}`);
      console.log(
        `[DRIVE SUMMARY] total_files=${summary.totalFiles || 0} excel=${summary.excelFiles || 0} assets=${summary.assetCount || 0} folders=${summary.folderCount || 0}`,
      );
      console.log(
        `[DRIVE SUMMARY] invalid=${summary.invalidFormatCount || 0} duplicates=${summary.duplicateNameCount || 0} unexpected=${summary.unexpectedItemCount || 0}`,
      );
      console.log(`[DRIVE SUMMARY] files_by_asset: ${assetTotals || "none"}`);
      console.log("========== DRIVE SUMMARY END ==========\n");
    } catch (error) {
      console.error(
        `[DRIVE SUMMARY] FAILED sync_id=${syncId} duration_ms=${Date.now() - startedAt} error=${error.message}`,
      );
      console.log("========== DRIVE SUMMARY END ==========\n");
      await syncProgressTracker.failSyncJob(syncId, `${DRIVE_SUMMARY.SCAN_FAILED}: ${error.message}`);
    }
  })();
};

// ✅ Strategy File Check — chi tiết bots thiếu file theo từng backtest table
const getStrategyFileCheck = async (req, res) => {
  const { getAppPool } = require('../config/db');
  const pool = getAppPool();
  const FILES_PER_BOT = 36; // 4 files × 9 assets

  try {
    const accessibleTables = (
      await backtestAccessService.getAccessibleDataSources(req.actor)
    ).map((source) => source.source_name);
    if (accessibleTables.length === 0) {
      return res.json({
        success: true,
        data: {
          filesPerBot: FILES_PER_BOT,
          grandTotal: 0,
          grandExpected: 0,
          grandBots: 0,
          grandMissing: 0,
          tables: [],
        },
      });
    }
    const tablesRes = await pool.query(`
      SELECT backtest_table, COUNT(DISTINCT strategy_id) AS total
      FROM strategy_metadata
      WHERE backtest_table = ANY($1::text[])
      GROUP BY backtest_table
      ORDER BY backtest_table
    `, [accessibleTables]);

    const tables = [];
    let grandTotal = 0;
    let grandBots = 0;

    for (const { backtest_table, total } of tablesRes.rows) {
      const actualTotal = parseInt(total) || 0;

      const botRes = await pool.query(`
        SELECT
          (regexp_match(strategy_id, '^(\\d+)'))[1] AS bot_prefix,
          COUNT(*) AS file_count
        FROM strategy_metadata
        WHERE backtest_table = $1
        GROUP BY 1
        ORDER BY (regexp_match(strategy_id, '^(\\d+)'))[1]::int
      `, [backtest_table]);

      const botRows = botRes.rows;
      const totalBots = botRows.length;
      const fullBots = botRows.filter(r => parseInt(r.file_count) === FILES_PER_BOT);
      const missingBots = botRows.filter(r => parseInt(r.file_count) < FILES_PER_BOT);
      const totalMissing = missingBots.reduce((s, r) => s + (FILES_PER_BOT - parseInt(r.file_count)), 0);

      tables.push({
        tableName: backtest_table,
        actualTotal,
        expectedTotal: totalBots * FILES_PER_BOT,
        totalBots,
        fullBots: fullBots.length,
        missingBotsCount: missingBots.length,
        totalMissingFiles: totalMissing,
        diff: actualTotal - totalBots * FILES_PER_BOT,
        missingBots: missingBots.map(r => ({
          botId: r.bot_prefix,
          fileCount: parseInt(r.file_count),
          missing: FILES_PER_BOT - parseInt(r.file_count)
        }))
      });

      grandTotal += actualTotal;
      grandBots += totalBots;
    }

    res.json({
      success: true,
      data: {
        filesPerBot: FILES_PER_BOT,
        grandTotal,
        grandExpected: grandBots * FILES_PER_BOT,
        grandBots,
        grandMissing: grandBots * FILES_PER_BOT - grandTotal,
        tables
      }
    });
  } catch (err) {
    console.error('❌ getStrategyFileCheck error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  syncSheet,
  syncSheetAsync,
  getSyncStatus,
  cancelSync,
  dropTable,
  clearData,
  deleteRowsById,
  updateRow,
  getPagedData,
  getOrderTotals,
  downloadLog,
  getFilterOptions,
  getBalanceChart,
  getDataSources,
  getBacktestTables,
  createBacktestTable,
  deleteBacktestTable,
  assignBacktestTableOwner,
  checkFiles,
  getDriveSummary,
  getStrategyFileCheck,
};
