// ============================================
// FILE: controller/lotThresholdController.js
// Lot Threshold Analysis - Controller Layer
// ============================================
const lotThresholdService = require("../service/lotThresholdService");
const lotThresholdDao = require("../dao/lotThresholdDao");
const syncProgressTracker = require("../utils/syncProgressTracker");
const backtestAccessService = require('../service/backtestAccessService');
let isLotThresholdAnalysisRunning = false;

/**
 * POST /api/lot-threshold/run
 * Trigger lot threshold analysis (async background job)
 * Body: { configs?, username? }
 */
const runAnalysis = async (req, res) => {
  try {
    if (isLotThresholdAnalysisRunning) {
      return res.status(409).json({
        error: "Lot threshold analysis is already running",
      });
    }

    const configs = req.body.configs || null;
    const sourceInput = req.body.sourceTables || req.body.sourceTable || null;
    if (sourceInput) {
      await backtestAccessService.validateAccessibleSourceNames(req.actor, sourceInput);
    }
    const sourceTables = await lotThresholdDao.getSourceTables(sourceInput);
    const runName = String(req.body.name || '').trim() || `Volume Optimization ${new Date().toISOString()}`;
    const username = req.body.username || "SYSTEM";
    isLotThresholdAnalysisRunning = true;

    const analysisRun = await lotThresholdDao.createAnalysisRun({
      name: runName,
      sourceTables,
      configs,
      createdBy: req.userId,
    });

    // Tạo sync job để frontend polling
    const syncId = await syncProgressTracker.createSyncJob("lot_threshold_analysis", 0, username, req.userId);

    // Trả về ngay 202 + syncId
    res.status(202).json({
      message: `Lot threshold analysis started with custom configs`,
      syncId,
      analysisRunId: analysisRun.analysis_run_id,
      run: analysisRun,
      pollUrl: `/api/lot-threshold/status/${syncId}`,
    });

    // Chạy background
    (async () => {
      try {
        const result = await lotThresholdService.runAnalysis({
          configs,
          syncId,
          analysisRunId: analysisRun.analysis_run_id,
          sourceInput: sourceTables,
        });
        await syncProgressTracker.completeSyncJob(syncId, result);
      } catch (err) {
        console.error("❌ Lot threshold analysis failed:", err.message);
        await lotThresholdDao.updateAnalysisRun(analysisRun.analysis_run_id, {
          status: 'FAILED',
          error_message: err.message,
          completed_at: new Date(),
        });
        await syncProgressTracker.failSyncJob(syncId, err.message);
      } finally {
        isLotThresholdAnalysisRunning = false;
      }
    })();
  } catch (err) {
    isLotThresholdAnalysisRunning = false;
    res.status(err.status || 500).json({ error: err.message });
  }
};

/**
 * GET /api/lot-threshold/status/:syncId
 * Polling progress
 */
const getStatus = async (req, res) => {
  try {
    const { syncId } = req.params;
    const job = await syncProgressTracker.getSyncJob(syncId);

    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    if (!req.actor?.isAdmin && Number(job.userId) !== Number(req.userId)) {
      return res.status(403).json({ error: 'Job not found or access denied' });
    }

    res.json(job);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

/**
 * GET /api/lot-threshold/results
 * Lấy kết quả (có phân trang + filter)
 * Query: symbol, strategyId, sourceTable, page, pageSize, sortBy, sortDir
 */
const getResults = async (req, res) => {
  try {
    const { analysisRunId, symbol, strategyId, sourceTable, page, pageSize, sortBy, sortDir } = req.query;

    const result = await lotThresholdDao.getResults({
      analysisRunId,
      symbol,
      strategyId,
      sourceTable,
      page: parseInt(page) || 1,
      pageSize: parseInt(pageSize) || 50,
      sortBy: sortBy || "pd_ratio",
      sortDir: sortDir || "desc",
    });

    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

/**
 * GET /api/lot-threshold/optimal
 * Lấy optimal lot threshold cho mỗi strategy (P/D cao nhất)
 * Query: symbol, sourceTable, page, pageSize
 */
const getOptimalResults = async (req, res) => {
  try {
    const { analysisRunId, symbol, sourceTable, strategyId, page, pageSize, isFallback } = req.query;

    const result = await lotThresholdDao.getOptimalResults({
      analysisRunId,
      symbol,
      sourceTable,
      strategyId,
      page: parseInt(page) || 1,
      pageSize: parseInt(pageSize) || 50,
      isFallback: isFallback !== undefined ? isFallback : undefined,
    });

    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

/**
 * GET /api/lot-threshold/time-range
 * Lấy khoảng thời gian đặc quánh nhất (để frontend hiển thị)
 */
const getTimeRange = async (req, res) => {
  try {
    const sourceInput = req.query.sourceTables || req.query.sourceTable || null;
    const timeRange = await lotThresholdDao.getOverlapTimeRange(sourceInput);
    res.json(timeRange);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

const getRuns = async (req, res) => {
  try {
    const { sourceTable, source_table, limit } = req.query;
    const selectedSource = sourceTable || source_table || null;
    const runs = await lotThresholdDao.getAnalysisRuns({ sourceTable: selectedSource, limit, actor: req.actor });
    res.json({ data: runs });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

const deleteRun = async (req, res) => {
  try {
    const deleted = await lotThresholdDao.deleteAnalysisRun(req.params.analysisRunId, req.actor);
    if (!deleted) return res.status(404).json({ error: 'Analysis run not found' });
    res.json({ success: true, analysisRunId: req.params.analysisRunId });
  } catch (err) {
    if (err.code === 'ANALYSIS_RUN_RUNNING') {
      return res.status(409).json({ error: err.message });
    }
    res.status(err.status || 500).json({ error: err.message });
  }
};

const selectCandidate = async (req, res) => {
  try {
    const data = await lotThresholdService.selectManualCandidate(req.body, req.actor);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
};

const resetCandidate = async (req, res) => {
  try {
    const data = await lotThresholdService.resetAutomaticCandidate(req.body, req.actor);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
};

module.exports = {
  runAnalysis,
  getStatus,
  getResults,
  getOptimalResults,
  getTimeRange,
  getRuns,
  deleteRun,
  selectCandidate,
  resetCandidate,
};
