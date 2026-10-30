const behaviorAnalysisDao = require('../dao/behaviorAnalysisDao');
const { buildSourceCacheKey } = require('../dao/queryBuilderHelper');

const behaviorCache = new Map();
const behaviorInflightRequests = new Map();
let behaviorCacheEpoch = 0;
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days TTL

const cacheKey = (tableName, startDate, endDate) => {
  const base = buildSourceCacheKey(tableName);
  if (startDate && endDate) {
    return `behavior_v1_${base}_${startDate}_${endDate}`;
  }
  return `behavior_v1_${base}`;
};
const valid = (entry) => entry && Date.now() - entry.timestamp < CACHE_TTL;

const getBehaviorAnalysisData = async (tableName = 'all_backtests', startDate = null, endDate = null, { skipCharts = false, signal } = {}) => {
  require('../dao/materializedViewDao').logReadSnapshot('BEHAVIOR', tableName);
  const baseKey = cacheKey(tableName, startDate, endDate);
  const key = skipCharts ? `${baseKey}_skip` : baseKey;
  const cached = behaviorCache.get(key);
  if (valid(cached)) {
    console.log(`💾 [CACHE HIT] Full Behavior Analysis | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''}`);
    return cached.data;
  }

  if (behaviorInflightRequests.has(key)) {
    return behaviorInflightRequests.get(key);
  }

  const requestEpoch = behaviorCacheEpoch;
  const requestPromise = (async () => {
    const startTime = Date.now();
    const data = await behaviorAnalysisDao.getBehaviorAnalysis(tableName, startDate, endDate, { skipCharts, signal });
    if (requestEpoch === behaviorCacheEpoch) {
      behaviorCache.set(key, { data, timestamp: Date.now() });
    }
  const duration = Date.now() - startTime;
  console.log(`🔄 [CACHE MISS/SAVED] Full Behavior Analysis | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''} | Loaded in ${duration}ms`);
    return data;
  })().finally(() => {
    behaviorInflightRequests.delete(key);
  });

  behaviorInflightRequests.set(key, requestPromise);
  return requestPromise;
};

const clearBehaviorAnalysisCache = (tableName = null) => {
  behaviorCacheEpoch += 1;
  if (!tableName || buildSourceCacheKey(tableName).endsWith(':src_all') || Array.isArray(tableName)) {
    behaviorCache.clear();
    behaviorInflightRequests.clear();
    return;
  }
  // A cache entry can represent a combination containing this source, so clear
  // the whole namespace to avoid serving stale multi-source results.
  behaviorCache.clear();
  behaviorInflightRequests.clear();
};

const getBehaviorAnalysisCacheStats = () => ({
  totalEntries: behaviorCache.size,
  entries: [...behaviorCache.entries()].map(([key, value]) => ({
    key,
    ageMs: Date.now() - value.timestamp,
    isValid: Date.now() - value.timestamp < CACHE_TTL
  }))
});

const getBehaviorStrategyDetail = async (strategyId, tableName = 'all_backtests', { signal } = {}) => {
  const key = `behavior_detail_v1_${strategyId}_${buildSourceCacheKey(tableName)}`;
  const cached = behaviorCache.get(key);
  if (valid(cached)) {
    console.log(`💾 [CACHE HIT] Behavior Strategy Detail | Strategy: "${strategyId}" | Table: "${tableName}"`);
    return cached.data;
  }

  const startTime = Date.now();
  const raw = await behaviorAnalysisDao.getBehaviorStrategyDetail(strategyId, tableName, { signal });
  
  // Format volumeEscalationData
  const streaksMap = {};
  raw.volumeEscalationRaw.forEach(row => {
    streaksMap[row.streak] = row.avg_volume;
  });

  const baseVolume = streaksMap[0] || 0;

  const names = ['Base Lot', '1 Loss', '2 Losses', '3 Losses', '4 Losses', '5+ Losses'];
  const volumeEscalationData = names.map((name, index) => {
    const avgVol = streaksMap[index];
    let multiplier = 1.0;
    if (avgVol !== undefined && baseVolume > 0) {
      multiplier = avgVol / baseVolume;
    }
    return {
      name,
      multiplier: Math.round(multiplier * 100) / 100
    };
  });

  const result = {
    scatterData: raw.scatterData,
    volumeEscalationData
  };

  behaviorCache.set(key, { data: result, timestamp: Date.now() });
  const duration = Date.now() - startTime;
  console.log(`🔄 [CACHE MISS/SAVED] Behavior Strategy Detail | Strategy: "${strategyId}" | Table: "${tableName}" | Loaded in ${duration}ms`);
  return result;
};

const getBehaviorCoreData = async (tableName = 'all_backtests', startDate = null, endDate = null, { signal } = {}) => {
  const key = `behavior_core_${buildSourceCacheKey(tableName)}${startDate && endDate ? `_${startDate}_${endDate}` : ''}`;
  const cached = behaviorCache.get(key);
  if (valid(cached)) {
    console.log(`💾 [CACHE HIT] Behavior Core | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''}`);
    return cached.data;
  }

  const startTime = Date.now();
  const data = await behaviorAnalysisDao.getBehaviorCoreOnly(tableName, startDate, endDate, { signal });
  behaviorCache.set(key, { data, timestamp: Date.now() });
  const duration = Date.now() - startTime;
  console.log(`🔄 [CACHE MISS/SAVED] Behavior Core | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''} | Loaded in ${duration}ms`);
  return data;
};

const getBehaviorActivityData = async (tableName = 'all_backtests', startDate = null, endDate = null, { signal } = {}) => {
  const key = `behavior_activity_${buildSourceCacheKey(tableName)}${startDate && endDate ? `_${startDate}_${endDate}` : ''}`;
  const cached = behaviorCache.get(key);
  if (valid(cached)) {
    console.log(`💾 [CACHE HIT] Behavior Activity | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''}`);
    return cached.data;
  }

  const startTime = Date.now();
  const data = await behaviorAnalysisDao.getBehaviorActivityOnly(tableName, startDate, endDate, { signal });
  behaviorCache.set(key, { data, timestamp: Date.now() });
  const duration = Date.now() - startTime;
  console.log(`🔄 [CACHE MISS/SAVED] Behavior Activity | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''} | Loaded in ${duration}ms`);
  return data;
};

const getBehaviorHoldingRecoveryData = async (tableName = 'all_backtests', startDate = null, endDate = null, { signal } = {}) => {
  const key = `behavior_holding_${buildSourceCacheKey(tableName)}${startDate && endDate ? `_${startDate}_${endDate}` : ''}`;
  const cached = behaviorCache.get(key);
  if (valid(cached)) {
    console.log(`💾 [CACHE HIT] Behavior Holding Recovery | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''}`);
    return cached.data;
  }

  const startTime = Date.now();
  const raw = await behaviorAnalysisDao.getBehaviorHoldingRecoveryOnly(tableName, startDate, endDate, { signal });

  // Merge htrData + veiData by (id, backtestTable)
  const veiMap = {};
  (raw.veiData || []).forEach(r => {
    veiMap[`${r.id}__${r.backtestTable}`] = r;
  });

  const holdingRecoveryData = (raw.htrData || []).map(r => {
    const vei = veiMap[`${r.id}__${r.backtestTable}`];
    const htr = r.htr || 0;
    const veiVal = vei?.vei || 1.0;

    // Extract symbol from strategy_id (e.g. "001EURUSDH1OB" → "EURUSD")
    const symbolMatch = r.id ? r.id.match(/^\d+([A-Z]+)(H[14])(OB|OS)$/) : null;
    const symbol = symbolMatch ? symbolMatch[1] : r.id || '';

    let status = 'Excellent';
    if (htr > 2.0 && veiVal > 1.2) status = 'Critical Risk';
    else if (htr > 2.0) status = 'Loss Averse';
    else if (veiVal > 1.2) status = 'Martingale Risk';

    return {
      id: r.id,
      symbol,
      backtestTable: r.backtestTable,
      avgWinTime: Math.round(r.avgWinTime || 0),
      avgLossTime: Math.round(r.avgLossTime || 0),
      totalTrades: r.totalTrades || 0,
      htr: parseFloat(htr) || 0,
      vei: parseFloat(veiVal) || 1.0,
      status
    };
  });

  const data = {
    holdingRecoveryData,
    htrData: raw.htrData || [],
    veiData: raw.veiData || []
  };

  behaviorCache.set(key, { data, timestamp: Date.now() });
  const duration = Date.now() - startTime;
  console.log(`🔄 [CACHE MISS/SAVED] Behavior Holding Recovery | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''} | Loaded in ${duration}ms`);
  return data;
};

const getBehaviorExitData = async (tableName = 'all_backtests', startDate = null, endDate = null, { signal } = {}) => {
  const key = `behavior_exit_${buildSourceCacheKey(tableName)}${startDate && endDate ? `_${startDate}_${endDate}` : ''}`;
  const cached = behaviorCache.get(key);
  if (valid(cached)) {
    console.log(`💾 [CACHE HIT] Behavior Exit | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''}`);
    return cached.data;
  }

  const startTime = Date.now();
  const data = await behaviorAnalysisDao.getBehaviorExitOnly(tableName, startDate, endDate, { signal });
  behaviorCache.set(key, { data, timestamp: Date.now() });
  const duration = Date.now() - startTime;
  console.log(`🔄 [CACHE MISS/SAVED] Behavior Exit | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''} | Loaded in ${duration}ms`);
  return data;
};

module.exports = {
  getBehaviorAnalysisData,
  getBehaviorStrategyDetail,
  getBehaviorCoreData,
  getBehaviorActivityData,
  getBehaviorHoldingRecoveryData,
  getBehaviorExitData,
  clearBehaviorAnalysisCache,
  getBehaviorAnalysisCacheStats
};
