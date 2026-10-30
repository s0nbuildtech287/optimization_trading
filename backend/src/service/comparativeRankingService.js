const dashboardService = require('./dashboardService');
const { buildSourceCacheKey } = require('../dao/queryBuilderHelper');

const comparativeCache = new Map();
const inflightRequests = new Map();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

const cacheKey = (tableName, startDate, endDate) => {
  const sourceKey = buildSourceCacheKey(tableName);
  if (startDate && endDate) {
    return `comparative_v1_${sourceKey}_${startDate}_${endDate}`;
  }
  return `comparative_v1_${sourceKey}`;
};
const isValid = (entry) => entry && Date.now() - entry.timestamp < CACHE_TTL;

const getComparativeRankingData = async (tableName = 'all_backtests', startDate = null, endDate = null) => {
  require('../dao/materializedViewDao').logReadSnapshot('COMPARATIVE', tableName);
  const key = cacheKey(tableName, startDate, endDate);
  const cached = comparativeCache.get(key);
  if (isValid(cached)) {
    console.log(`💾 [CACHE HIT] Full Comparative Ranking | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''}`);
    return cached.data;
  }

  if (inflightRequests.has(key)) {
    return inflightRequests.get(key);
  }

  const startTime = Date.now();
  const requestPromise = dashboardService
    .getComparativeData(tableName, startDate, endDate)
    .then((data) => {
      comparativeCache.set(key, { data, timestamp: Date.now() });
      const duration = Date.now() - startTime;
      console.log(`🔄 [CACHE MISS/SAVED] Full Comparative Ranking | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''} | Loaded in ${duration}ms`);
      return data;
    })
    .finally(() => {
      inflightRequests.delete(key);
    });

  inflightRequests.set(key, requestPromise);
  return requestPromise;
};

const getComparativeRankingCoreData = async (tableName = 'all_backtests', startDate = null, endDate = null) => {
  require('../dao/materializedViewDao').logReadSnapshot('COMPARATIVE CORE', tableName);
  const baseKey = cacheKey(tableName, startDate, endDate);
  const key = `core_${baseKey}`;
  const cached = comparativeCache.get(key);
  if (isValid(cached)) {
    console.log(`💾 [CACHE HIT] Comparative Ranking Core | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''}`);
    return cached.data;
  }

  if (inflightRequests.has(key)) {
    return inflightRequests.get(key);
  }

  const startTime = Date.now();
  const requestPromise = dashboardService
    .getComparativeCoreOnly(tableName, startDate, endDate)
    .then((data) => {
      comparativeCache.set(key, { data, timestamp: Date.now() });
      const duration = Date.now() - startTime;
      console.log(`🔄 [CACHE MISS/SAVED] Comparative Ranking Core | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''} | Loaded in ${duration}ms`);
      return data;
    })
    .finally(() => {
      inflightRequests.delete(key);
    });

  inflightRequests.set(key, requestPromise);
  return requestPromise;
};

const getComparativeRankingDimensionsData = async (tableName = 'all_backtests', startDate = null, endDate = null) => {
  require('../dao/materializedViewDao').logReadSnapshot('COMPARATIVE DIMENSIONS', tableName);
  const baseKey = cacheKey(tableName, startDate, endDate);
  const key = `dimensions_${baseKey}`;
  const cached = comparativeCache.get(key);
  if (isValid(cached)) {
    console.log(`💾 [CACHE HIT] Comparative Ranking Dimensions | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''}`);
    return cached.data;
  }

  if (inflightRequests.has(key)) {
    return inflightRequests.get(key);
  }

  const startTime = Date.now();
  const requestPromise = dashboardService
    .getComparativeDimensionsOnly(tableName, startDate, endDate)
    .then((data) => {
      comparativeCache.set(key, { data, timestamp: Date.now() });
      const duration = Date.now() - startTime;
      console.log(`🔄 [CACHE MISS/SAVED] Comparative Ranking Dimensions | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''} | Loaded in ${duration}ms`);
      return data;
    })
    .finally(() => {
      inflightRequests.delete(key);
    });

  inflightRequests.set(key, requestPromise);
  return requestPromise;
};

const clearComparativeCache = (tableName = null) => {
  if (!tableName || buildSourceCacheKey(tableName).endsWith(':src_all') || Array.isArray(tableName)) {
    comparativeCache.clear();
    inflightRequests.clear();
    return;
  }
  comparativeCache.clear();
  inflightRequests.clear();
};

const getComparativeCacheStats = () => ({
  totalEntries: comparativeCache.size,
  entries: [...comparativeCache.entries()].map(([key, value]) => ({
    key,
    ageMs: Date.now() - value.timestamp,
    isValid: Date.now() - value.timestamp < CACHE_TTL
  }))
});

module.exports = {
  getComparativeRankingData,
  getComparativeRankingCoreData,
  getComparativeRankingDimensionsData,
  clearComparativeCache,
  getComparativeCacheStats
};
