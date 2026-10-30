// ============================================
// FILE: service/strategyService.js - OPTIMIZED WITH CACHE
// ============================================
const strategyMetadataDAO = require("../dao/strategyMetadataDao");
const backtestAccessService = require("./backtestAccessService");
const { getRequestActor, getActorScopeKey } = require("../utils/requestContext");

// ✅ CACHE CONFIGURATION
const strategyCache = new Map();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 ngày (604800000 ms)

/**
 * ✅ Generate cache key
 */
const getCacheKey = (operation, params = {}) => {
  const sortedParams = Object.keys(params)
    .filter((key) => params[key] !== null && params[key] !== undefined)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return `${getActorScopeKey(getRequestActor())}:strategy_${operation}_${sortedParams || "default"}`;
};

const resolveAccessibleBacktestInput = async (backtestTable) => {
  const tables = await backtestAccessService.validateAccessibleSourceNames(
    getRequestActor(),
    backtestTable || "all_backtests",
  );
  if (tables.length === 0) {
    const error = new Error("No accessible backtest tables");
    error.status = 404;
    throw error;
  }
  return tables.join(",");
};

/**
 * ✅ Check if cache is valid
 */
const isCacheValid = (cacheEntry) => {
  if (!cacheEntry) return false;
  return Date.now() - cacheEntry.timestamp < CACHE_TTL;
};

/**
 * ✅ Get strategies with caching
 */
const getStrategies = async ({
  analysisRunId,
  analysis_run_id,
  backtestTable,
  symbol,
  search,
  type,
  timeframe,
  pd,
  totalNetProfit,
  totalTrades,
  winrate,
  largestProfitTradeRatio,
  riskRewardRatio,
  drawdown,
  largestLossTrade,
  profitFactor,
  sharpeRatio,
  recoveryFactor,
  lrCorrelation,
  filterOperators = {},
  filterRanges = {},
  page,
  pageSize,
  sortBy,
  sortDir,
}) => {
  backtestTable = await resolveAccessibleBacktestInput(backtestTable);
  const runId = analysisRunId || analysis_run_id;
  if (runId) {
    console.log(`🔄 [STRATEGY SERVICE] Analysis Run Threshold mode: ${runId}`);
    const lotThresholdDao = require("../dao/lotThresholdDao");
    return await lotThresholdDao.getStrategiesByAnalysisRun({
      analysisRunId: runId,
      backtestTable,
      symbol,
      search,
      type,
      timeframe,
      pd,
      totalNetProfit,
      totalTrades,
      winrate,
      largestProfitTradeRatio,
      riskRewardRatio,
      drawdown,
      largestLossTrade,
      profitFactor,
      sharpeRatio,
      recoveryFactor,
      lrCorrelation,
      operators: filterOperators,
      ranges: filterRanges,
      page: parseInt(page, 10) || 1,
      pageSize: parseInt(pageSize, 10) || 20,
      sortBy,
      sortDir,
    });
  }

  const cacheKey = getCacheKey("list", {
    backtestTable,
    symbol,
    search,
    type,
    timeframe,
    pd,
    totalNetProfit,
    totalTrades,
    winrate,
    largestProfitTradeRatio,
    riskRewardRatio,
    drawdown,
    largestLossTrade,
    profitFactor,
    sharpeRatio,
    recoveryFactor,
    lrCorrelation,
    page,
    pageSize,
    sortBy: sortBy || 'default',
    sortDir: sortDir || 'default',
    filterOperators: JSON.stringify(filterOperators || {}),
    filterRanges: JSON.stringify(filterRanges || {}),
  });
  console.log(`🔑 [STRATEGY CACHE KEY] ${cacheKey}`);
  const cached = strategyCache.get(cacheKey);

  // ✅ Return from cache if valid
  if (isCacheValid(cached)) {
    console.log(`✅ [STRATEGY CACHE HIT] ${cacheKey}`);
    return cached.data;
  }

  try {
    console.log(`🔄 [STRATEGY CACHE MISS] Loading ${cacheKey}...`);
    const startTime = Date.now();

    const result = await strategyMetadataDAO.getPagedStrategies({
      backtestTable,
      symbol,
      search,
      type,
      timeframe,
      pd,
      totalNetProfit,
      totalTrades,
      winrate,
      largestProfitTradeRatio,
      riskRewardRatio,
      drawdown,
      largestLossTrade,
      profitFactor,
      sharpeRatio,
      recoveryFactor,
      lrCorrelation,
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
      operators: filterOperators,
      ranges: filterRanges,
      sortBy,
      sortDir,
    });

    // ✅ Store in cache
    strategyCache.set(cacheKey, {
      data: result,
      timestamp: Date.now(),
    });

    const duration = Date.now() - startTime;
    console.log(`✅ [STRATEGY] Loaded in ${duration}ms and cached`);

    return result;
  } catch (error) {
    console.error("❌ Error loading strategies:", error);
    throw error;
  }
};

/**
 * ✅ Get strategy detail with caching
 */
const getStrategyDetail = async (strategyId, backtestTable) => {
  await backtestAccessService.assertCanAccessBacktestTable(getRequestActor(), backtestTable);
  const cacheKey = getCacheKey("detail", { strategyId, backtestTable });
  const cached = strategyCache.get(cacheKey);

  // ✅ Return from cache if valid
  if (isCacheValid(cached)) {
    console.log(`✅ [STRATEGY DETAIL CACHE HIT] ${cacheKey}`);
    return cached.data;
  }

  try {
    console.log(`🔄 [STRATEGY DETAIL CACHE MISS] Loading ${cacheKey}...`);
    const startTime = Date.now();

    const result = await strategyMetadataDAO.getStrategyMetadata(strategyId, backtestTable);

    // ✅ Store in cache
    strategyCache.set(cacheKey, {
      data: result,
      timestamp: Date.now(),
    });

    const duration = Date.now() - startTime;
    console.log(`✅ [STRATEGY DETAIL] Loaded in ${duration}ms and cached`);

    return result;
  } catch (error) {
    console.error("❌ Error loading strategy detail:", error);
    throw error;
  }
};

/**
 * ✅ Get distinct symbols with caching
 */
const getDistinctSymbols = async (backtestTable) => {
  backtestTable = await resolveAccessibleBacktestInput(backtestTable);
  const cacheKey = getCacheKey("symbols", { backtestTable });
  const cached = strategyCache.get(cacheKey);

  // ✅ Return from cache if valid
  if (isCacheValid(cached)) {
    console.log(`✅ [SYMBOLS CACHE HIT] ${cacheKey}`);
    return cached.data;
  }

  try {
    console.log(`🔄 [SYMBOLS CACHE MISS] Loading ${cacheKey}...`);
    const startTime = Date.now();

    const result = await strategyMetadataDAO.getDistinctSymbols(backtestTable);

    // ✅ Store in cache
    strategyCache.set(cacheKey, {
      data: result,
      timestamp: Date.now(),
    });

    const duration = Date.now() - startTime;
    console.log(`✅ [SYMBOLS] Loaded in ${duration}ms and cached`);

    return result;
  } catch (error) {
    console.error("❌ Error loading symbols:", error);
    throw error;
  }
};

/**
 * ✅ Get strategy statistics with caching
 */
const getStrategyStatistics = async (backtestTable) => {
  backtestTable = await resolveAccessibleBacktestInput(backtestTable);
  const cacheKey = getCacheKey("statistics", { backtestTable });
  const cached = strategyCache.get(cacheKey);

  // ✅ Return from cache if valid
  if (isCacheValid(cached)) {
    console.log(`✅ [STRATEGY STATS CACHE HIT] ${cacheKey}`);
    return cached.data;
  }

  try {
    console.log(`🔄 [STRATEGY STATS CACHE MISS] Loading ${cacheKey}...`);
    const startTime = Date.now();

    const result = await strategyMetadataDAO.getStrategyStatistics(backtestTable);

    // ✅ Store in cache
    strategyCache.set(cacheKey, {
      data: result,
      timestamp: Date.now(),
    });

    const duration = Date.now() - startTime;
    console.log(`✅ [STRATEGY STATS] Loaded in ${duration}ms and cached`);

    return result;
  } catch (error) {
    console.error("❌ Error loading strategy statistics:", error);
    throw error;
  }
};

/**
 * ✅ Clear strategy cache (call after sync)
 */
const clearStrategyCache = (backtestTable = null) => {
  if (backtestTable) {
    // Clear specific backtest table cache
    const keysToDelete = [];
    for (const key of strategyCache.keys()) {
      if (key.includes(`backtestTable=${backtestTable}`)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach((key) => strategyCache.delete(key));
    console.log(`🗑️  Cleared strategy cache for ${backtestTable}`);
  } else {
    // Clear all cache
    strategyCache.clear();
    console.log("[CACHE] Cleared strategy cache");
  }
};

/**
 * ✅ Get cache stats (for monitoring)
 */
const getCacheStats = () => {
  const stats = {
    totalEntries: strategyCache.size,
    entries: [],
  };

  for (const [key, value] of strategyCache.entries()) {
    const age = Date.now() - value.timestamp;
    stats.entries.push({
      key,
      ageMs: age,
      isValid: age < CACHE_TTL,
    });
  }

  return stats;
};

/**
 * ✅ NEW: Get ONLY strategy IDs (optimized for copy)
 * Returns array of IDs without full data - super fast!
 */
const getStrategyIdsOnly = async ({
  analysisRunId,
  analysis_run_id,
  backtestTable,
  startDate, // ✅ NEW
  endDate,   // ✅ NEW
  symbol,
  search,
  type,
  timeframe,
  pd,
  totalNetProfit,
  totalTrades,
  winrate,
  largestProfitTradeRatio,
  riskRewardRatio,
  drawdown,
  largestLossTrade,
  profitFactor,
  sharpeRatio,
  recoveryFactor,
  lrCorrelation,
  filterOperators = {},
  filterRanges = {},
}) => {
  backtestTable = await resolveAccessibleBacktestInput(backtestTable);
  const runId = analysisRunId || analysis_run_id;
  if (runId) {
    console.log(`🔄 [STRATEGY SERVICE] getStrategyIdsOnly Analysis Run mode: ${runId}`);
    const lotThresholdDao = require("../dao/lotThresholdDao");
    return await lotThresholdDao.getStrategiesByAnalysisRun({
      analysisRunId: runId,
      backtestTable,
      symbol,
      search,
      type,
      timeframe,
      pd,
      totalNetProfit,
      totalTrades,
      winrate,
      largestProfitTradeRatio,
      riskRewardRatio,
      drawdown,
      largestLossTrade,
      profitFactor,
      sharpeRatio,
      recoveryFactor,
      lrCorrelation,
      operators: filterOperators,
      ranges: filterRanges,
      idsOnly: true,
    });
  }
  // ✅ If date range is active, fetch dynamically without cache
  if (startDate && endDate) {
    console.log(`🔄 [STRATEGY SERVICE] getStrategyIdsOnly: Dynamic time range ${startDate} to ${endDate}`);
    const strategyTimeRangeDao = require("../dao/strategyTimeRangeDao");
    return await strategyTimeRangeDao.getStrategiesByTimeRange({
      backtestTable,
      startDate,
      endDate,
      symbol,
      search,
      type,
      timeframe,
      pd,
      totalNetProfit,
      totalTrades,
      winrate,
      largestLossTrade,
      largestProfitTradeRatio,
      riskRewardRatio,
      drawdown,
      profitFactor,
      sharpeRatio,
      recoveryFactor,
      lrCorrelation,
      operators: filterOperators,
      ranges: filterRanges,
      idsOnly: true,
    });
  }

  const cacheKey = getCacheKey("ids_only", {
    backtestTable,
    symbol,
    search,
    type,
    timeframe,
    pd,
    totalNetProfit,
    totalTrades,
    winrate,
    largestProfitTradeRatio,
    riskRewardRatio,
    drawdown,
    largestLossTrade,
    profitFactor,
    sharpeRatio,
    recoveryFactor,
    lrCorrelation,
    filterOperators: JSON.stringify(filterOperators || {}),
    filterRanges: JSON.stringify(filterRanges || {}),
  });
  const cached = strategyCache.get(cacheKey);

  // ✅ Return from cache if valid
  if (isCacheValid(cached)) {
    console.log(`✅ [IDS CACHE HIT] ${cacheKey} - ${cached.data.length} IDs`);
    return cached.data;
  }

  try {
    console.log(`🔄 [IDS CACHE MISS] Loading ${cacheKey}...`);
    const startTime = Date.now();

    const result = await strategyMetadataDAO.getStrategyIdsOnly({
      backtestTable,
      symbol,
      search,
      type,
      timeframe,
      pd,
      totalNetProfit,
      totalTrades,
      winrate,
      largestProfitTradeRatio,
      riskRewardRatio,
      drawdown,
      largestLossTrade,
      profitFactor,
      sharpeRatio,
      recoveryFactor,
      lrCorrelation,
      operators: filterOperators,
      ranges: filterRanges,
    });

    // ✅ Store in cache
    strategyCache.set(cacheKey, {
      data: result,
      timestamp: Date.now(),
    });

    const duration = Date.now() - startTime;
    console.log(`✅ [IDS ONLY] Loaded ${result.length} IDs in ${duration}ms and cached`);

    return result;
  } catch (error) {
    console.error("❌ Error loading strategy IDs:", error);
    throw error;
  }
};

/**
 * ✅ NEW: Get strategies by time range (với cache)
 * KHÔNG cache vì kết quả thay đổi theo date range động
 */
const getStrategiesByTimeRange = async (params) => {
  try {
    params = {
      ...params,
      backtestTable: await resolveAccessibleBacktestInput(params.backtestTable),
    };
    const runId = params.analysisRunId || params.analysis_run_id;
    if (runId) {
      console.log(`🔄 [STRATEGY SERVICE] getStrategiesByTimeRange Analysis Run mode: ${runId}`);
      const lotThresholdDao = require("../dao/lotThresholdDao");
      return await lotThresholdDao.getStrategiesByAnalysisRun({
        analysisRunId: runId,
        backtestTable: params.backtestTable,
        symbol: params.symbol,
        search: params.search,
        type: params.type,
        timeframe: params.timeframe,
        pd: params.pd,
        totalNetProfit: params.totalNetProfit,
        totalTrades: params.totalTrades,
        winrate: params.winrate,
        largestProfitTradeRatio: params.largestProfitTradeRatio,
        riskRewardRatio: params.riskRewardRatio,
        drawdown: params.drawdown,
        largestLossTrade: params.largestLossTrade,
        profitFactor: params.profitFactor,
        sharpeRatio: params.sharpeRatio,
        recoveryFactor: params.recoveryFactor,
        lrCorrelation: params.lrCorrelation,
        operators: params.operators,
        ranges: params.ranges,
        sortBy: params.sortBy,
        sortDir: params.sortDir,
        page: params.page,
        pageSize: params.pageSize
      });
    }

    console.log(`🔄 [STRATEGY SERVICE] getStrategiesByTimeRange: ${params.startDate} to ${params.endDate}`);
    const startTime = Date.now();

    const result = await strategyMetadataDAO.getStrategiesByTimeRange(params);

    const duration = Date.now() - startTime;
    console.log(`✅ [STRATEGY SERVICE] Loaded ${result.data.length} strategies in ${duration}ms`);

    return result;
  } catch (error) {
    console.error("❌ Error in getStrategiesByTimeRange:", error);
    throw error;
  }
};

module.exports = {
  getStrategies,
  getStrategyDetail,
  getDistinctSymbols,
  getStrategyStatistics,
  getStrategyIdsOnly,
  getStrategiesByTimeRange,  // ✅ NEW
  clearStrategyCache,
  getCacheStats,
};
