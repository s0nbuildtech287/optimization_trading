// ============================================
// FILE: service/dashboardService.js - OPTIMIZED WITH CACHE & CLEAN LOGS
// ============================================
const dashboardDao = require('../dao/dashboardDao');
const riskAnalysisService = require('./riskAnalysisService');
const aiAnalysisReportDao = require('../dao/aiAnalysisReportDao');
const { buildSourceCacheKey } = require('../dao/queryBuilderHelper');
const { getAppPool } = require('../config/db');
const { getSoftFlagPenalty } = require('../config/riskFlagDefinitions');
const appPool = getAppPool();

// ✅ CACHE CONFIGURATION
const dashboardCache = new Map();
const dashboardInflightRequests = new Map();
let dashboardCacheEpoch = 0;
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days (604800000 ms)
const sourceCacheKey = (sourceInput) => buildSourceCacheKey(sourceInput);

const dashboardRelationExists = async (relationName) => {
  const { validateAndFilterSourceNames } = require('../dao/dataSourceDao');
  const valid = await validateAndFilterSourceNames(relationName);
  return Array.isArray(valid) && valid.length > 0;
};

const isAllSourceSelection = (sourceInput) => (
  !sourceInput || sourceInput === 'all_backtests'
);

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const round = (value, digits = 2) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(digits));
};

const safeDivide = (numerator, denominator, fallback = 0) => {
  const n = Number(numerator);
  const d = Number(denominator);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return fallback;
  return n / d;
};

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));

const getConcentrationScore = (coverageRatio) => {
  const ratio = Number(coverageRatio);
  if (!Number.isFinite(ratio) || ratio <= 0) return 0;
  if (ratio >= 3) return 100;
  if (ratio >= 2) return round(60 + ((ratio - 2) / 1) * 19, 2);
  if (ratio >= 1.5) return round(35 + ((ratio - 1.5) / 0.5) * 24, 2);
  if (ratio >= 1) return round(10 + ((ratio - 1) / 0.5) * 24, 2);
  return round(clamp(ratio * 10), 2);
};

const getSharpeScore = (sharpeVal) => {
  const s = Number(sharpeVal);
  if (!Number.isFinite(s) || s <= 0) return 0;
  
  if (s < 0.5) {
    return round((s / 0.5) * 20, 2);
  }
  if (s >= 0.5 && s < 1.0) {
    return round(20 + ((s - 0.5) / 0.5) * 40, 2);
  }
  if (s >= 1.0 && s < 2.0) {
    return round(60 + ((s - 1.0) / 1.0) * 30, 2);
  }
  if (s >= 2.0 && s <= 3.0) {
    return round(90 + ((s - 2.0) / 1.0) * 10, 2);
  }
  if (s > 3.0 && s <= 5.0) {
    return round(100 - ((s - 3.0) / 2.0) * 60, 2);
  }
  if (s > 5.0 && s <= 10.0) {
    return round(40 - ((s - 5.0) / 5.0) * 30, 2);
  }
  return 0;
};

const normalizeMetric = (rows, key) => {
  const numericValues = rows
    .map((row) => Number(row[key]))
    .filter((value) => Number.isFinite(value));

  if (numericValues.length === 0) {
    return {};
  }

  const min = Math.min(...numericValues);
  const max = Math.max(...numericValues);

  return rows.reduce((acc, row) => {
    const value = Number(row[key]);
    const rowKey = `${row.backtest || row.backtest_table || ''}:${row.id || row.strategy_id}`;
    if (!Number.isFinite(value)) {
      acc[rowKey] = 0;
      return acc;
    }

    if (max === min) {
      acc[rowKey] = 100;
      return acc;
    }

    acc[rowKey] = round(((value - min) / (max - min)) * 100, 2);
    return acc;
  }, {});
};

const buildRanking = (rawRows, riskOverview = null) => {
  const riskMap = {};
  if (riskOverview && Array.isArray(riskOverview.strategies)) {
    riskOverview.strategies.forEach((s) => {
      let priorityScore = 100;
      const hardCount = Number(s.hardCount || 0);
      if (hardCount > 0) {
        priorityScore = 0;
      } else {
        const softs = Array.isArray(s.softFlags) ? s.softFlags : [];
        const penalty = softs.reduce((acc, sfId) => {
          const cleanId = String(sfId).replace(/^SF/, '');
          return acc + getSoftFlagPenalty(cleanId);
        }, 0);
        const scoreAfterPenalty = Math.max(0, 100 - penalty);
        const softCount = Math.max(softs.length, Number(s.softCount || 0));
        priorityScore = softCount >= 3 ? Math.min(49, scoreAfterPenalty) : scoreAfterPenalty;
      }

      const key = `${s.backtest || ''}:${s.id}`;
      riskMap[key] = {
        hardCount,
        softCount: Number(s.softCount || 0),
        status: s.status || 'Passed',
        hardFlags: s.hardFlags || [],
        softFlags: s.softFlags || [],
        winratePct: Number(s.winratePct || 0),
        priorityScore
      };
    });
  }

  const baseRows = rawRows.map((row) => {
    const strategyId = row.strategy_id;
    const backtestTable = row.backtest_table || '';
    const key = `${backtestTable}:${strategyId}`;
    const direction = strategyId?.toUpperCase().endsWith('OB')
      ? 'OB'
      : strategyId?.toUpperCase().endsWith('OS')
        ? 'OS'
        : 'UNKNOWN';

    const risks = riskMap[key] || {
      hardCount: 0,
      softCount: 0,
      status: 'Passed',
      hardFlags: [],
      softFlags: [],
      winratePct: 0,
      priorityScore: 100
    };

    return {
      id: strategyId,
      bot: strategyId,
      backtest: backtestTable,
      symbol: row.symbol || 'UNKNOWN',
      timeframe: row.timeframe || 'UNKNOWN',
      direction,
      profit: toNumber(row.total_net_profit),
      grossProfit: toNumber(row.gross_profit),
      grossLoss: toNumber(row.gross_loss),
      sharpe: toNumber(row.sharpe_ratio),
      sharpeCapped: Math.min(3.0, toNumber(row.sharpe_ratio)),
      pf: toNumber(row.profit_factor),
      rf: toNumber(row.recovery_factor),
      pd: toNumber(row.pd_ratio),
      ep: toNumber(row.expected_payoff),
      lr: toNumber(row.lr_correlation),
      drawdownPct: toNumber(row.drawdown_pct),
      drawdownValue: toNumber(row.drawdown_value),
      trades: toNumber(row.total_trades),
      largestProfitTrade: toNumber(row.largest_profit_trade),
      averageProfitTrade: toNumber(row.average_profit_trade),
      averageLossTrade: Math.abs(toNumber(row.average_loss_trade)),
      maxConsecutiveWins: toNumber(row.max_consecutive_wins),
      maxConsecutiveLosses: toNumber(row.max_consecutive_losses),
      hardCount: risks.hardCount,
      softCount: risks.softCount,
      riskStatus: risks.status,
      hardFlags: risks.hardFlags,
      softFlags: risks.softFlags,
      winratePct: risks.winratePct,
      priorityScore: risks.priorityScore
    };
  });

  const getRowKey = (row) => `${row.backtest || ''}:${row.id}`;

  const sharpeNorm = baseRows.reduce((acc, row) => {
    acc[getRowKey(row)] = getSharpeScore(row.sharpe);
    return acc;
  }, {});
  const pfNorm = normalizeMetric(baseRows, 'pf');
  const rfNorm = normalizeMetric(baseRows, 'rf');
  const pdNorm = normalizeMetric(baseRows, 'pd');
  const epNorm = normalizeMetric(baseRows, 'ep');
  const lrNorm = normalizeMetric(baseRows, 'lr');
  const concentrationNorm = baseRows.reduce((acc, row) => {
    const concentrationCoverage = safeDivide(
      Math.abs(row.profit),
      Math.max(Math.abs(row.largestProfitTrade), 1),
      0
    );
    acc[getRowKey(row)] = getConcentrationScore(concentrationCoverage);
    return acc;
  }, {});

  return baseRows
    .map((row) => {
      const key = getRowKey(row);
      const performanceScore = round(
        ((sharpeNorm[key] || 0) * 0.16) +
        ((pfNorm[key] || 0) * 0.16) +
        ((rfNorm[key] || 0) * 0.16) +
        ((pdNorm[key] || 0) * 0.18) +
        ((concentrationNorm[key] || 0) * 0.18) +
        ((epNorm[key] || 0) * 0.08) +
        ((lrNorm[key] || 0) * 0.08),
        2
      );
      const penaltyScore = 0;
      const finalScore = Math.max(0, round(performanceScore, 2));

      const concentrationRisk = round(safeDivide(Math.abs(row.largestProfitTrade), Math.max(Math.abs(row.profit), 1), 0) * 100, 2);
      const concentrationCoverage = round(safeDivide(Math.abs(row.profit), Math.max(Math.abs(row.largestProfitTrade), 1), 0), 2);

      return {
        ...row,
        concentrationScore: concentrationNorm[key] || 0,
        performanceScore,
        penaltyScore,
        finalScore,
        normalized: {
          sharpe: sharpeNorm[key] || 0,
          pf: pfNorm[key] || 0,
          rf: rfNorm[key] || 0,
          pd: pdNorm[key] || 0,
          ep: epNorm[key] || 0,
          lr: lrNorm[key] || 0,
          concentration: concentrationNorm[key] || 0,
          concentrationRisk: concentrationNorm[key] || 0
        },
        penalty: {
          concentrationRisk,
          concentrationCoverage
        },
        composite: finalScore
      };
    })
    .sort((a, b) => {
      if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
      if (b.sharpe !== a.sharpe) return b.sharpe - a.sharpe;
      return a.id.localeCompare(b.id);
    });
};

const buildDuels = (rows) =>
  rows.map((row) => {
    const h1Profit = toNumber(row.h1_profit);
    const h4Profit = toNumber(row.h4_profit);
    const h1Sharpe = toNumber(row.h1_sharpe);
    const h4Sharpe = toNumber(row.h4_sharpe);
    const h1Pf = toNumber(row.h1_pf);
    const h4Pf = toNumber(row.h4_pf);
    const h1Dd = toNumber(row.h1_dd);
    const h4Dd = toNumber(row.h4_dd);
    const h1Pd = toNumber(row.h1_pd);
    const h4Pd = toNumber(row.h4_pd);

    const h1Score = h1Profit + h1Sharpe * 1000 + h1Pd * 1000;
    const h4Score = h4Profit + h4Sharpe * 1000 + h4Pd * 1000;

    return {
      symbol: row.symbol || 'UNKNOWN',
      h1: {
        profit: round(h1Profit, 2),
        sharpe: round(h1Sharpe, 2),
        pf: round(h1Pf, 2),
        drawdownPct: round(h1Dd, 2),
        pd: round(h1Pd, 2)
      },
      h4: {
        profit: round(h4Profit, 2),
        sharpe: round(h4Sharpe, 2),
        pf: round(h4Pf, 2),
        drawdownPct: round(h4Dd, 2),
        pd: round(h4Pd, 2)
      },
      winner: h1Score >= h4Score ? 'H1' : 'H4'
    };
  });

const buildAverages = (rows) =>
  rows.map((row) => {
    const avgProfit = round(toNumber(row.avg_profit), 2);
    return {
      symbol: row.symbol || 'UNKNOWN',
      avgProfit,
      profit: avgProfit,
      sharpe: round(toNumber(row.avg_sharpe), 2),
      pf: round(toNumber(row.avg_pf), 2),
      rf: round(toNumber(row.avg_rf), 2),
      pd: round(toNumber(row.avg_pd), 2),
      maxDrawdownPct: round(toNumber(row.avg_drawdown_pct), 2),
      strategies: toNumber(row.strategy_count)
    };
  });

const buildObOs = (rows) =>
  rows.map((row) => ({
    symbol: row.symbol || 'UNKNOWN',
    obValue: round(toNumber(row.ob_avg_profit), 2),
    osValue: round(toNumber(row.os_avg_profit), 2),
    ob: {
      profit: round(toNumber(row.ob_avg_profit), 2),
      winrate: round(toNumber(row.ob_avg_winrate), 2),
      trades: round(toNumber(row.ob_avg_trades), 0),
      sharpe: round(toNumber(row.ob_avg_sharpe), 2),
      pf: round(toNumber(row.ob_avg_pf), 2)
    },
    os: {
      profit: round(toNumber(row.os_avg_profit), 2),
      winrate: round(toNumber(row.os_avg_winrate), 2),
      trades: round(toNumber(row.os_avg_trades), 0),
      sharpe: round(toNumber(row.os_avg_sharpe), 2),
      pf: round(toNumber(row.os_avg_pf), 2)
    }
  }));

/**
 * Build comparative / breakdown payload (Symbol Ranking, H1 vs H4, OB vs OS).
 */
const getComparativeData = async (tableName = 'all_backtests', startDate = null, endDate = null) => {
  const [rawRanking, duelRows, averageRows, obOsRows, riskOverview] = await Promise.all([
    dashboardDao.getComparativeRankingRawData(tableName, startDate, endDate),
    dashboardDao.getTimeframeDuelData(tableName, startDate, endDate),
    dashboardDao.getSymbolAverageData(tableName, startDate, endDate),
    dashboardDao.getObOsAverageData(tableName, startDate, endDate),
    riskAnalysisService.getRiskOverviewData(tableName, startDate, endDate).catch(() => null)
  ]);

  return {
    ranking: buildRanking(rawRanking, riskOverview),
    duels: buildDuels(duelRows),
    averages: buildAverages(averageRows),
    obOs: buildObOs(obOsRows)
  };
};

const getComparativeCoreOnly = async (tableName = 'all_backtests', startDate = null, endDate = null) => {
  const [rawRanking, riskOverview] = await Promise.all([
    dashboardDao.getComparativeRankingRawData(tableName, startDate, endDate),
    riskAnalysisService.getRiskOverviewData(tableName, startDate, endDate).catch(() => null)
  ]);
  return {
    ranking: buildRanking(rawRanking, riskOverview)
  };
};

const getComparativeDimensionsOnly = async (tableName = 'all_backtests', startDate = null, endDate = null) => {
  const [duelRows, averageRows, obOsRows] = await Promise.all([
    dashboardDao.getTimeframeDuelData(tableName, startDate, endDate),
    dashboardDao.getSymbolAverageData(tableName, startDate, endDate),
    dashboardDao.getObOsAverageData(tableName, startDate, endDate)
  ]);
  return {
    duels: buildDuels(duelRows),
    averages: buildAverages(averageRows),
    obOs: buildObOs(obOsRows)
  };
};

/**
 * ✅ Generate cache key
 */
const getCacheKey = (tableName, year, startDate, endDate) => {
  const sourceKey = sourceCacheKey(tableName);
  if (startDate && endDate) {
    return `dashboard_v5_${sourceKey}_${startDate}_${endDate}`;
  }
  return `dashboard_v5_${sourceKey}_${year || 'all'}`;
};

/**
 * ✅ Check if cache is valid
 */
const isCacheValid = (cacheEntry) => {
  if (!cacheEntry) return false;
  return (Date.now() - cacheEntry.timestamp) < CACHE_TTL;
};

const getEmptyDashboardData = () => ({
  overview: {
    totalNetProfit: 0,
    totalTrades: 0,
    winrate: 0,
    profitFactor: 0,
    sharpeRatio: 0,
    maxDrawdownPercent: 0,
    totalStrategies: 0,
  },
  monthlyProfit: [],
  topStrategies: [],
  topSymbols: [],
  yearlyComparison: [],
  detailedReport: [],
  fileOptimizationCheck: { passed: 0, total: 0 },
  riskFlagsCheck: { totalFlags: 0, highRisk: 0 },
  qualityDistribution: [],
  comparativeData: [],
});

const getDashboardCoreData = async (tableName = 'all_backtests', year = null, startDate = null, endDate = null) => {
  require('../dao/materializedViewDao').logReadSnapshot('DASHBOARD CORE', tableName);
  const requestedRelation = isAllSourceSelection(tableName) ? null : tableName;
  if (!(await dashboardRelationExists(requestedRelation))) {
    console.warn(`⚠️ Dashboard Core: relation not found (${requestedRelation}), returning empty state`);
    return { overview: {}, fileOptimizationCheck: {}, riskFlagsCheck: {} };
  }

  const cacheKey = `db_core_${sourceCacheKey(tableName)}_${year || 'all'}_${startDate || 'any'}_${endDate || 'any'}`;
  const cached = dashboardCache.get(cacheKey);
  if (isCacheValid(cached)) {
    console.log(`💾 [CACHE HIT] Dashboard Core | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''}`);
    return cached.data;
  }

  const startTime = Date.now();
  try {
    const [overview, fileOptimizationCheck, riskFlagsCheck] = await Promise.all([
      dashboardDao.getDashboardOverview(tableName, year, startDate, endDate),
      dashboardDao.getFileOptimizationSummary(tableName),
      riskAnalysisService.getRiskOverviewSummary(tableName, startDate, endDate)
    ]);
    const data = { overview, fileOptimizationCheck, riskFlagsCheck };
    dashboardCache.set(cacheKey, { data, timestamp: Date.now() });
    const duration = Date.now() - startTime;
    console.log(`🔄 [CACHE MISS/SAVED] Dashboard Core | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''} | Loaded in ${duration}ms`);
    return data;
  } catch (error) {
    console.error('❌ Error loading dashboard core data:', error);
    throw error;
  }
};

const getDashboardMonthlyProfit = async (tableName = 'all_backtests', year = null, startDate = null, endDate = null) => {
  const cacheKey = `db_monthly_${sourceCacheKey(tableName)}_${year || 'all'}_${startDate || 'any'}_${endDate || 'any'}`;
  const cached = dashboardCache.get(cacheKey);
  if (isCacheValid(cached)) {
    console.log(`💾 [CACHE HIT] Dashboard Monthly | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''}`);
    return cached.data;
  }

  const startTime = Date.now();
  try {
    const monthlyProfit = await dashboardDao.getMonthlyProfit(tableName, year, startDate, endDate);
    dashboardCache.set(cacheKey, { data: monthlyProfit, timestamp: Date.now() });
    const duration = Date.now() - startTime;
    console.log(`🔄 [CACHE MISS/SAVED] Dashboard Monthly | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''} | Loaded in ${duration}ms`);
    return monthlyProfit;
  } catch (error) {
    console.error('❌ Error loading monthly profit data:', error);
    throw error;
  }
};

const getDashboardComparativeCoreRanking = async (tableName = 'all_backtests', startDate = null, endDate = null) => {
  const cacheKey = `db_comparative_core_${sourceCacheKey(tableName)}_${startDate || 'any'}_${endDate || 'any'}`;
  const cached = dashboardCache.get(cacheKey);
  if (isCacheValid(cached)) return cached.data;
  if (dashboardInflightRequests.has(cacheKey)) return dashboardInflightRequests.get(cacheKey);

  const requestEpoch = dashboardCacheEpoch;
  const requestPromise = getComparativeCoreOnly(tableName, startDate, endDate)
    .then((data) => {
      if (requestEpoch === dashboardCacheEpoch) {
        dashboardCache.set(cacheKey, { data, timestamp: Date.now() });
      }
      return data;
    })
    .finally(() => {
      dashboardInflightRequests.delete(cacheKey);
    });

  dashboardInflightRequests.set(cacheKey, requestPromise);
  return requestPromise;
};

const getDashboardTopStats = async (tableName = 'all_backtests', year = null, startDate = null, endDate = null) => {
  const cacheKey = `db_top_stats_${sourceCacheKey(tableName)}_${year || 'all'}_${startDate || 'any'}_${endDate || 'any'}`;
  const cached = dashboardCache.get(cacheKey);
  if (isCacheValid(cached)) {
    console.log(`💾 [CACHE HIT] Dashboard Top Stats | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''}`);
    return cached.data;
  }

  const startTime = Date.now();
  try {
    const [comparativeCore, topSymbols] = await Promise.all([
      getDashboardComparativeCoreRanking(tableName, startDate, endDate),
      dashboardDao.getTopSymbols(tableName, 10, year, startDate, endDate)
    ]);
    const topStrategies = (comparativeCore?.ranking || []).slice(0, 10).map((strategy) => ({
      strategyId: strategy.id,
      backtestTable: strategy.backtest,
      totalNetProfit: strategy.profit,
      drawdownValue: strategy.drawdownValue,
      pd: strategy.pd,
      profitFactor: strategy.pf,
      recoveryFactor: strategy.rf,
      expectedPayoff: strategy.ep,
      lrCorrelation: strategy.lr,
      finalScore: strategy.finalScore,
      composite: strategy.finalScore
    }));
    const data = { topStrategies, topSymbols };
    dashboardCache.set(cacheKey, { data, timestamp: Date.now() });
    const duration = Date.now() - startTime;
    console.log(`🔄 [CACHE MISS/SAVED] Dashboard Top Stats | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''} | Loaded in ${duration}ms`);
    return data;
  } catch (error) {
    console.error('❌ Error loading top stats data:', error);
    throw error;
  }
};

const getDashboardYearlyPerformance = async (tableName = 'all_backtests', year = null, startDate = null, endDate = null) => {
  const cacheKey = `db_yearly_${sourceCacheKey(tableName)}_${year || 'all'}_${startDate || 'any'}_${endDate || 'any'}`;
  const cached = dashboardCache.get(cacheKey);
  if (isCacheValid(cached)) {
    console.log(`💾 [CACHE HIT] Dashboard Yearly | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''}`);
    return cached.data;
  }

  const startTime = Date.now();
  try {
    const [yearlyComparison, qualityDistribution] = await Promise.all([
      dashboardDao.getYearlyComparison(tableName, year, startDate, endDate),
      dashboardDao.getQualityDistribution(tableName, startDate, endDate)
    ]);
    const data = { yearlyComparison, qualityDistribution };
    dashboardCache.set(cacheKey, { data, timestamp: Date.now() });
    const duration = Date.now() - startTime;
    console.log(`🔄 [CACHE MISS/SAVED] Dashboard Yearly | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''} | Loaded in ${duration}ms`);
    return data;
  } catch (error) {
    console.error('❌ Error loading yearly performance data:', error);
    throw error;
  }
};

const getDashboardBehaviorSummary = async (tableName = 'all_backtests', startDate = null, endDate = null) => {
  require('../dao/materializedViewDao').logReadSnapshot('DASHBOARD BEHAVIOR', tableName);
  const cacheKey = `db_behavior_summary_${sourceCacheKey(tableName)}_${startDate || 'any'}_${endDate || 'any'}`;
  const cached = dashboardCache.get(cacheKey);
  if (isCacheValid(cached)) {
    console.log(`💾 [CACHE HIT] Dashboard Behavior Summary | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''}`);
    return cached.data;
  }

  if (dashboardInflightRequests.has(cacheKey)) {
    return dashboardInflightRequests.get(cacheKey);
  }

  const requestEpoch = dashboardCacheEpoch;
  const startTime = Date.now();
  const requestPromise = (async () => {
   try {
    const behaviorAnalysisService = require('./behaviorAnalysisService');
    const raw = await behaviorAnalysisService.getBehaviorAnalysisData(tableName, startDate, endDate, { skipCharts: true });
    
    const data = {
      summary: raw.summary,
      strategyYears: raw.strategyYears,
      directionalBiasData: raw.directionalBiasData,
      timeframeMismatchData: raw.timeframeMismatchData,
      activityGapData: raw.activityGapData,
      holdingRecoveryData: raw.holdingRecoveryData
    };
    
    if (requestEpoch === dashboardCacheEpoch) {
      dashboardCache.set(cacheKey, { data, timestamp: Date.now() });
    }
    const duration = Date.now() - startTime;
    console.log(`🔄 [CACHE MISS/SAVED] Dashboard Behavior Summary | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''} | Loaded in ${duration}ms`);
    return data;
  } catch (error) {
    console.error('❌ Error loading behavior summary:', error);
    throw error;
  }
  })().finally(() => {
    dashboardInflightRequests.delete(cacheKey);
  });

  dashboardInflightRequests.set(cacheKey, requestPromise);
  return requestPromise;
};

const getDashboardComparative = async (tableName = 'all_backtests', startDate = null, endDate = null) => {
  const cacheKey = `db_comparative_${sourceCacheKey(tableName)}_${startDate || 'any'}_${endDate || 'any'}`;
  const cached = dashboardCache.get(cacheKey);
  if (isCacheValid(cached)) {
    console.log(`💾 [CACHE HIT] Dashboard Comparative | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''}`);
    return cached.data;
  }

  const startTime = Date.now();
  try {
    const data = await getComparativeData(tableName, startDate, endDate);
    dashboardCache.set(cacheKey, { data, timestamp: Date.now() });
    const duration = Date.now() - startTime;
    console.log(`🔄 [CACHE MISS/SAVED] Dashboard Comparative | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''} | Loaded in ${duration}ms`);
    return data;
  } catch (error) {
    console.error('❌ Error loading comparative data:', error);
    throw error;
  }
};

const getDashboardBreakdown = async (tableName = 'all_backtests', year = null, startDate = null, endDate = null) => {
  const cacheKey = `db_breakdown_${sourceCacheKey(tableName)}_${year || 'all'}_${startDate || 'any'}_${endDate || 'any'}`;
  const cached = dashboardCache.get(cacheKey);
  if (isCacheValid(cached)) {
    console.log(`💾 [CACHE HIT] Dashboard Breakdown | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''}`);
    return cached.data;
  }

  const startTime = Date.now();
  try {
    const data = await dashboardDao.getDetailedReport(tableName, year, startDate, endDate);
    dashboardCache.set(cacheKey, { data, timestamp: Date.now() });
    const duration = Date.now() - startTime;
    console.log(`🔄 [CACHE MISS/SAVED] Dashboard Breakdown | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''} | Loaded in ${duration}ms`);
    return data;
  } catch (error) {
    console.error('❌ Error loading breakdown data:', error);
    throw error;
  }
};

/**
 * ✅ Get dashboard data with caching
 */
const getDashboardData = async (tableName = 'all_backtests', year = null, startDate = null, endDate = null) => {
  if (!(await dashboardRelationExists(isAllSourceSelection(tableName) ? null : tableName))) {
    console.log(`ℹ️ Dashboard: no valid data source selected (${String(tableName)}), returning empty state.`);
    return getEmptyDashboardData();
  }

  const cacheKey = getCacheKey(tableName, year, startDate, endDate);
  const cached = dashboardCache.get(cacheKey);

  if (isCacheValid(cached)) {
    console.log(`💾 [CACHE HIT] Full Dashboard Data | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''}`);
    return cached.data;
  }

  try {
    const startTime = Date.now();

    const [
      overview,
      monthlyProfit,
      topStrategies,
      topSymbols,
      yearlyComparison,
      detailedReport,
      fileOptimizationCheck,
      riskFlagsCheck,
      qualityDistribution,
      comparativeData
    ] = await Promise.all([
      dashboardDao.getDashboardOverview(tableName, year, startDate, endDate),
      dashboardDao.getMonthlyProfit(tableName, year, startDate, endDate),
      dashboardDao.getTopStrategies(tableName, 10, year, startDate, endDate),
      dashboardDao.getTopSymbols(tableName, 10, year, startDate, endDate),
      dashboardDao.getYearlyComparison(tableName, year, startDate, endDate),
      dashboardDao.getDetailedReport(tableName, year, startDate, endDate),
      dashboardDao.getFileOptimizationSummary(tableName),
      riskAnalysisService.getRiskOverviewSummary(tableName, startDate, endDate),
      dashboardDao.getQualityDistribution(tableName, startDate, endDate),
      getComparativeData(tableName, startDate, endDate)
    ]);

    const data = {
      overview,
      monthlyProfit,
      topStrategies,
      topSymbols,
      yearlyComparison,
      detailedReport,
      fileOptimizationCheck,
      riskFlagsCheck,
      qualityDistribution,
      comparativeData
    };

    dashboardCache.set(cacheKey, {
      data,
      timestamp: Date.now()
    });

    const duration = Date.now() - startTime;
    console.log(`🔄 [CACHE MISS/SAVED] Full Dashboard Data | Table: "${tableName}"${startDate && endDate ? ` [${startDate} -> ${endDate}]` : ''} | Loaded in ${duration}ms`);

    return data;
  } catch (error) {
    if (error.code === '42P01' || (error.message && error.message.includes('does not exist'))) {
      console.warn(`⚠️  Dashboard: table/view not found (${tableName}), returning empty state`);
      return getEmptyDashboardData();
    }
    console.error('❌ Error loading dashboard data:', error);
    throw error;
  }
};

/**
 * ✅ Clear dashboard cache (call after sync)
 */
const clearDashboardCache = (tableName = null) => {
  dashboardCacheEpoch += 1;
  if (tableName) {
    const keysToDelete = [];
    for (const key of dashboardCache.keys()) {
      const sourceKey = sourceCacheKey(tableName);
      if (key.includes(sourceKey)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach((key) => dashboardCache.delete(key));
    console.log(`🗑️  Cleared dashboard cache for ${tableName}`);
    
    // Clear persisted AI reports in DB as well
    aiAnalysisReportDao.deleteAiReportsByTable(tableName)
      .then(res => console.log(`🗑️  Cleared database AI reports for ${tableName}: deleted ${res.count} rows`))
      .catch(err => console.error(`❌ Failed to clear database AI reports for ${tableName}:`, err.message));
  }
  // Sync invalidates the shared dashboard snapshot even when no table name
  // is provided (for example, all-backtest sync).
  dashboardCache.clear();
  console.log(`[CACHE] Cleared dashboard cache${tableName ? ` for ${tableName}` : ' (ALL)'}`);
};

/**
 * ✅ Get cache stats (for monitoring)
 */
const getCacheStats = () => {
  const stats = {
    totalEntries: dashboardCache.size,
    entries: []
  };

  for (const [key, value] of dashboardCache.entries()) {
    const age = Date.now() - value.timestamp;
    stats.entries.push({
      key,
      ageMs: age,
      isValid: age < CACHE_TTL
    });
  }

  return stats;
};

module.exports = {
  getDashboardData,
  getDashboardCoreData,
  getDashboardMonthlyProfit,
  getDashboardTopStats,
  getDashboardYearlyPerformance,
  getDashboardBehaviorSummary,
  getDashboardComparative,
  getDashboardBreakdown,
  getComparativeData,
  getComparativeCoreOnly,
  getComparativeDimensionsOnly,
  clearDashboardCache,
  getCacheStats
};
