const dashboardService = require('../service/dashboardService');
const riskAnalysisService = require('../service/riskAnalysisService');
const behaviorAnalysisService = require('../service/behaviorAnalysisService');
const comparativeRankingService = require('../service/comparativeRankingService');
const { GENERAL } = require('../utils/messages');

const getSourceInput = (req) => req.query.sourceNames || req.query.tableName || 'all_backtests';

const getDashboard = async (req, res) => {
  const { year, startDate, endDate } = req.query;
  try {
    const data = await dashboardService.getDashboardData(getSourceInput(req), year, startDate, endDate);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || GENERAL.INTERNAL_ERROR });
  }
};

const getDashboardCore = async (req, res) => {
  const { year, startDate, endDate } = req.query;
  try {
    const data = await dashboardService.getDashboardCoreData(getSourceInput(req), year, startDate, endDate);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || GENERAL.INTERNAL_ERROR });
  }
};

const getDashboardMonthlyProfit = async (req, res) => {
  const { year, startDate, endDate } = req.query;
  try {
    const data = await dashboardService.getDashboardMonthlyProfit(getSourceInput(req), year, startDate, endDate);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || GENERAL.INTERNAL_ERROR });
  }
};

const getDashboardTopStats = async (req, res) => {
  const { year, startDate, endDate } = req.query;
  try {
    const data = await dashboardService.getDashboardTopStats(getSourceInput(req), year, startDate, endDate);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || GENERAL.INTERNAL_ERROR });
  }
};

const getDashboardYearlyPerformance = async (req, res) => {
  const { year, startDate, endDate } = req.query;
  try {
    const data = await dashboardService.getDashboardYearlyPerformance(getSourceInput(req), year, startDate, endDate);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || GENERAL.INTERNAL_ERROR });
  }
};

const getDashboardBehaviorSummary = async (req, res) => {
  const { startDate, endDate } = req.query;
  try {
    const data = await dashboardService.getDashboardBehaviorSummary(getSourceInput(req), startDate, endDate);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || GENERAL.INTERNAL_ERROR });
  }
};

const getDashboardComparative = async (req, res) => {
  const { startDate, endDate } = req.query;
  try {
    const data = await dashboardService.getDashboardComparative(getSourceInput(req), startDate, endDate);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || GENERAL.INTERNAL_ERROR });
  }
};

const getDashboardBreakdown = async (req, res) => {
  const { year, startDate, endDate } = req.query;
  try {
    const data = await dashboardService.getDashboardBreakdown(getSourceInput(req), year, startDate, endDate);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || GENERAL.INTERNAL_ERROR });
  }
};

const clearCache = async (req, res) => {
  try {
    const { tableName } = req.query;
    dashboardService.clearDashboardCache(tableName);
    riskAnalysisService.clearRiskAnalysisCache(tableName);
    behaviorAnalysisService.clearBehaviorAnalysisCache(tableName);
    comparativeRankingService.clearComparativeCache(tableName);
    
    res.json({
      success: true,
      message: `Cache cleared for ${tableName || 'all tables'}`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || GENERAL.INTERNAL_ERROR
    });
  }
};

const getCacheStats = async (req, res) => {
  try {
    const dashboardStats = dashboardService.getCacheStats();
    const riskStats = riskAnalysisService.getRiskAnalysisCacheStats();
    const behaviorStats = behaviorAnalysisService.getBehaviorAnalysisCacheStats();
    const comparativeStats = comparativeRankingService.getComparativeCacheStats();
    const stats = {
      dashboard: dashboardStats,
      riskAnalyst: riskStats,
      behaviorAnalyst: behaviorStats,
      comparativeRanking: comparativeStats,
      totalEntries:
        (dashboardStats.totalEntries || 0) +
        (riskStats.totalEntries || 0) +
        (behaviorStats.totalEntries || 0) +
        (comparativeStats.totalEntries || 0)
    };
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || GENERAL.INTERNAL_ERROR
    });
  }
};

module.exports = {
  getDashboard,
  getDashboardCore,
  getDashboardMonthlyProfit,
  getDashboardTopStats,
  getDashboardYearlyPerformance,
  getDashboardBehaviorSummary,
  getDashboardComparative,
  getDashboardBreakdown,
  clearCache,
  getCacheStats
};
