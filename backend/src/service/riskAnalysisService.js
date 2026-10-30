const riskAnalysisDao = require('../dao/riskAnalysisDao');
const { buildSourceCacheKey } = require('../dao/queryBuilderHelper');

const riskCache = new Map();
const inflightRequests = new Map();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

const cacheKey = (tableName, startDate, endDate) => {
  const base = buildSourceCacheKey(tableName);
  if (startDate && endDate) {
    return `risk_v6_${base}_${startDate}_${endDate}`;
  }
  return `risk_v6_${base}`;
};
const valid = (entry) => entry && Date.now() - entry.timestamp < CACHE_TTL;

const getRiskAnalysisData = async (tableName = 'all_backtests', startDate = null, endDate = null, options = {}) => {
  require('../dao/materializedViewDao').logReadSnapshot('RISK', tableName);
  const key = cacheKey(tableName, startDate, endDate);
  const cached = riskCache.get(key);
  if (valid(cached)) {
    console.log(`💾 [CACHE HIT] Full Risk Analysis | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''}`);
    return cached.data;
  }

  if (inflightRequests.has(key)) {
    return inflightRequests.get(key);
  }

  const startTime = Date.now();
  const requestPromise = riskAnalysisDao
    .getRiskAnalysis(tableName, startDate, endDate, options)
    .then((data) => {
      riskCache.set(key, { data, timestamp: Date.now() });
      const duration = Date.now() - startTime;
      console.log(`🔄 [CACHE MISS/SAVED] Full Risk Analysis | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''} | Loaded in ${duration}ms`);
      return data;
    })
    .finally(() => {
      inflightRequests.delete(key);
    });

  inflightRequests.set(key, requestPromise);
  return requestPromise;
};

const clearRiskAnalysisCache = (tableName = null) => {
  if (!tableName || buildSourceCacheKey(tableName).endsWith(':src_all') || Array.isArray(tableName)) {
    riskCache.clear();
    inflightRequests.clear();
    return;
  }
  riskCache.clear();
  inflightRequests.clear();
};

const getRiskAnalysisCacheStats = () => ({
  totalEntries: riskCache.size,
  entries: [...riskCache.entries()].map(([key, value]) => ({
    key,
    ageMs: Date.now() - value.timestamp,
    isValid: Date.now() - value.timestamp < CACHE_TTL
  }))
});

/**
 * Lightweight risk data for dashboard overview (skips heavy chart queries).
 * Uses separate cache to avoid polluting full risk analysis cache.
 */
const getRiskOverviewData = async (tableName = 'all_backtests', startDate = null, endDate = null, options = {}) => {
  const key = `risk_overview_${buildSourceCacheKey(tableName)}${startDate && endDate ? `_${startDate}_${endDate}` : ''}`;
  const cached = riskCache.get(key);
  if (valid(cached)) {
    console.log(`💾 [CACHE HIT] Risk Overview Summary | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''}`);
    return cached.data;
  }

  if (inflightRequests.has(key)) {
    return inflightRequests.get(key);
  }

  const startTime = Date.now();
  const requestPromise = riskAnalysisDao
    .getRiskAnalysis(tableName, startDate, endDate, { ...options, skipCharts: true })
    .then((data) => {
      riskCache.set(key, { data, timestamp: Date.now() });
      const duration = Date.now() - startTime;
      console.log(`🔄 [CACHE MISS/SAVED] Risk Overview Summary | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''} | Loaded in ${duration}ms`);
      return data;
    })
    .finally(() => {
      inflightRequests.delete(key);
    });

  inflightRequests.set(key, requestPromise);
  return requestPromise;
};

/**
 * Lightweight overview widget payload for dashboard (uses skipCharts mode).
 */
const getRiskOverviewSummary = async (tableName = 'all_backtests', startDate = null, endDate = null, options = {}) => {
  const data = await getRiskOverviewData(tableName, startDate, endDate, options);
  const strategies = data?.strategies || [];
  const totalStrategies = strategies.length;

  const disqualifiedCount = strategies.filter(
    (s) => Number(s.hardCount || 0) > 0
  ).length;
  const passedCount = totalStrategies - disqualifiedCount;
  const warningCount = strategies.filter(
    (s) => Number(s.hardCount || 0) === 0 && Number(s.softCount || 0) > 0
  ).length;

  const errorRate = totalStrategies > 0
    ? Number(((disqualifiedCount / totalStrategies) * 100).toFixed(1))
    : 0;

  return {
    totalStrategies,
    riskStrategies: disqualifiedCount,
    hardFlaggedStrategies: disqualifiedCount,
    softFlaggedStrategies: passedCount,
    warningStrategies: warningCount,
    errorRate,
    pieData: [
      { name: 'Disqualified (Bị Loại)', value: disqualifiedCount },
      { name: 'Warning (Soft Flags)', value: warningCount },
      { name: 'Passed Clean (Sạch Cờ)', value: Math.max(0, passedCount - warningCount) }
    ]
  };
};

const getRiskCoreData = async (tableName = 'all_backtests', startDate = null, endDate = null, options = {}) => {
  require('../dao/materializedViewDao').logReadSnapshot('RISK CORE', tableName);
  const key = `risk_core_${buildSourceCacheKey(tableName)}${startDate && endDate ? `_${startDate}_${endDate}` : ''}`;
  const cached = riskCache.get(key);
  if (valid(cached)) {
    console.log(`💾 [CACHE HIT] Risk Core | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''}`);
    return cached.data;
  }

  if (inflightRequests.has(key)) {
    return inflightRequests.get(key);
  }

  const startTime = Date.now();
  const requestPromise = riskAnalysisDao
    .getRiskAnalysis(tableName, startDate, endDate, { ...options, skipCharts: true })
    .then((data) => {
      riskCache.set(key, { data, timestamp: Date.now() });
      const duration = Date.now() - startTime;
      console.log(`🔄 [CACHE MISS/SAVED] Risk Core | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''} | Loaded in ${duration}ms`);
      return data;
    })
    .finally(() => {
      inflightRequests.delete(key);
    });

  inflightRequests.set(key, requestPromise);
  return requestPromise;
};

const getRiskMarginExposureData = async (tableName = 'all_backtests', startDate = null, endDate = null, options = {}) => {
  const key = `risk_margin_${buildSourceCacheKey(tableName)}${startDate && endDate ? `_${startDate}_${endDate}` : ''}`;
  const cached = riskCache.get(key);
  if (valid(cached)) {
    console.log(`💾 [CACHE HIT] Risk Margin Exposure | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''}`);
    return cached.data;
  }

  if (inflightRequests.has(key)) {
    return inflightRequests.get(key);
  }

  const startTime = Date.now();
  const requestPromise = riskAnalysisDao
    .getMarginExposureOnly(tableName, startDate, endDate, options)
    .then((data) => {
      riskCache.set(key, { data, timestamp: Date.now() });
      const duration = Date.now() - startTime;
      console.log(`🔄 [CACHE MISS/SAVED] Risk Margin Exposure | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''} | Loaded in ${duration}ms`);
      return data;
    })
    .finally(() => {
      inflightRequests.delete(key);
    });

  inflightRequests.set(key, requestPromise);
  return requestPromise;
};

const getRiskDoubleExposureData = async (tableName = 'all_backtests', startDate = null, endDate = null, options = {}) => {
  const key = `risk_double_${buildSourceCacheKey(tableName)}${startDate && endDate ? `_${startDate}_${endDate}` : ''}`;
  const cached = riskCache.get(key);
  if (valid(cached)) {
    console.log(`💾 [CACHE HIT] Risk Double Exposure | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''}`);
    return cached.data;
  }

  if (inflightRequests.has(key)) {
    return inflightRequests.get(key);
  }

  const startTime = Date.now();
  const requestPromise = riskAnalysisDao
    .getDoubleExposureOnly(tableName, startDate, endDate, options)
    .then((data) => {
      riskCache.set(key, { data, timestamp: Date.now() });
      const duration = Date.now() - startTime;
      console.log(`🔄 [CACHE MISS/SAVED] Risk Double Exposure | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''} | Loaded in ${duration}ms`);
      return data;
    })
    .finally(() => {
      inflightRequests.delete(key);
    });

  inflightRequests.set(key, requestPromise);
  return requestPromise;
};

const getRiskLightChartsData = async (tableName = 'all_backtests', startDate = null, endDate = null, options = {}) => {
  const key = `risk_light_charts_${buildSourceCacheKey(tableName)}${startDate && endDate ? `_${startDate}_${endDate}` : ''}`;
  const cached = riskCache.get(key);
  if (valid(cached)) {
    console.log(`💾 [CACHE HIT] Risk Light Charts | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''}`);
    return cached.data;
  }

  if (inflightRequests.has(key)) {
    return inflightRequests.get(key);
  }

  const startTime = Date.now();
  const requestPromise = riskAnalysisDao
    .getLightChartsOnly(tableName, startDate, endDate, options)
    .then((data) => {
      riskCache.set(key, { data, timestamp: Date.now() });
      const duration = Date.now() - startTime;
      console.log(`🔄 [CACHE MISS/SAVED] Risk Light Charts | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''} | Loaded in ${duration}ms`);
      return data;
    })
    .finally(() => {
      inflightRequests.delete(key);
    });

  inflightRequests.set(key, requestPromise);
  return requestPromise;
};

module.exports = {
  getRiskAnalysisData,
  getRiskOverviewData,
  getRiskOverviewSummary,
  getRiskCoreData,
  getRiskMarginExposureData,
  getRiskDoubleExposureData,
  getRiskLightChartsData,
  clearRiskAnalysisCache,
  getRiskAnalysisCacheStats
};
