const aiAnalysisService = require("../service/aiAnalysisService");
const aiAnalysisReportDao = require("../dao/aiAnalysisReportDao");
const { buildSourceCacheKey } = require("../dao/queryBuilderHelper");
const { GENERAL } = require("../utils/messages");

const getSourceInput = (req) => {
  const raw = req.query?.sourceNames || req.body?.sourceNames || req.query?.tableName || req.body?.tableName;
  if (!raw) return "all_backtests";
  if (Array.isArray(raw)) {
    return raw.length === 0 ? "all_backtests" : raw;
  }
  if (typeof raw === "string" && raw.includes(",")) {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (raw === "all_backtests") return "all_backtests";
  return raw;
};

const normalizeCacheKey = (sourceInput) => {
  return buildSourceCacheKey(sourceInput);
};

const getAiReport = async (req, res) => {
  try {
    const { targetType = "tab", targetId, startDate, endDate } = req.query;
    const sourceInput = getSourceInput(req);
    const cacheKey = normalizeCacheKey(sourceInput);
    const userId = req.user?.id || req.ip || "anonymous";

    if (!targetId) {
      return res.status(400).json({ success: false, error: "targetId is required" });
    }

    const effectiveStartDate = startDate || req.query.start_date;
    const effectiveEndDate = endDate || req.query.end_date;

    const result = await aiAnalysisService.getAiAnalysis({
      targetType,
      targetId,
      sourceInput,
      cacheKey,
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
      forceRefresh: false,
      userId
    });

    res.json(result);
  } catch (error) {
    console.error("❌ [AI REPORT CONTROLLER] getAiReport error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message || GENERAL.INTERNAL_ERROR,
    });
  }
};

const refreshAiReport = async (req, res) => {
  try {
    const { targetType = "tab", targetId, startDate, endDate } = req.body;
    const sourceInput = getSourceInput(req);
    const cacheKey = normalizeCacheKey(sourceInput);
    const userId = req.user?.id || req.ip || "anonymous";

    if (!targetId) {
      return res.status(400).json({ success: false, error: "targetId is required" });
    }

    const effectiveStartDate = startDate || req.body.start_date;
    const effectiveEndDate = endDate || req.body.end_date;

    const result = await aiAnalysisService.getAiAnalysis({
      targetType,
      targetId,
      sourceInput,
      cacheKey,
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
      forceRefresh: true,
      userId
    });

    res.json(result);
  } catch (error) {
    console.error("❌ [AI REPORT CONTROLLER] refreshAiReport error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message || GENERAL.INTERNAL_ERROR,
    });
  }
};

const saveUserRemarks = async (req, res) => {
  try {
    const { targetType = "chart", targetId, startDate, endDate, content } = req.body;
    const sourceInput = getSourceInput(req);
    const cacheKey = normalizeCacheKey(sourceInput);

    if (!targetId) {
      return res.status(400).json({ success: false, error: "targetId is required" });
    }

    const effectiveStartDate = startDate || req.body.start_date;
    const effectiveEndDate = endDate || req.body.end_date;

    const saved = await aiAnalysisReportDao.upsertAiReport({
      targetType,
      targetId,
      backtestTable: cacheKey,
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
      content: content || ""
    });

    res.json({ success: true, data: saved });
  } catch (error) {
    console.error("❌ [AI REPORT CONTROLLER] saveUserRemarks error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message || GENERAL.INTERNAL_ERROR,
    });
  }
};

const getUserRemarks = async (req, res) => {
  try {
    const { targetType = "chart", targetId, startDate, endDate } = req.query;
    const sourceInput = getSourceInput(req);
    const cacheKey = normalizeCacheKey(sourceInput);

    if (!targetId) {
      return res.status(400).json({ success: false, error: "targetId is required" });
    }

    const effectiveStartDate = startDate || req.query.start_date;
    const effectiveEndDate = endDate || req.query.end_date;

    const existing = await aiAnalysisReportDao.getAiReport({
      targetType,
      targetId,
      backtestTable: cacheKey,
      startDate: effectiveStartDate,
      endDate: effectiveEndDate
    });

    res.json({ success: true, data: existing || { analysis_content: "" } });
  } catch (error) {
    console.error("❌ [AI REPORT CONTROLLER] getUserRemarks error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message || GENERAL.INTERNAL_ERROR,
    });
  }
};

module.exports = {
  getAiReport,
  refreshAiReport,
  saveUserRemarks,
  getUserRemarks
};
