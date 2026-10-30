// src/hooks/useStrategy.js

import { useState, useCallback } from 'react';
import { getStrategies, getStrategyDetail, getDistinctSymbols, getStrategyStatistics, deleteStrategy, getBalanceChart, getStrategiesByTimeRange, getAnalysisRuns } from 'api/Strategy';

// ─── FRONTEND IN-MEMORY CACHE ─────────────────────────────────────────────────
// Module-level: survives re-renders, cleared on page refresh
const FRONTEND_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const strategiesCache = new Map();

const buildCacheKey = (params) => {
  return Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k] ?? ''}`)
    .join('&');
};

const getCached = (key) => {
  const entry = strategiesCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > FRONTEND_CACHE_TTL) {
    strategiesCache.delete(key);
    return null;
  }
  return entry.data;
};

const setCached = (key, data) => {
  strategiesCache.set(key, { data, timestamp: Date.now() });
};

// ─── BALANCE CHART CACHE ──────────────────────────────────────────────────────────────────────
// Permanent (không có TTL) — giới hạn LRU 100 entries để tránh rò rỉ bộ nhớ
const balanceChartCache = new Map();
const BALANCE_CHART_CACHE_LIMIT = 100;

const getChartCached = (key) => {
  const data = balanceChartCache.get(key);
  if (!data) return null;
  // Di chuyển key xuống cuối Map (được sử dụng gần đây nhất)
  balanceChartCache.delete(key);
  balanceChartCache.set(key, data);
  return data;
};

const setChartCached = (key, data) => {
  if (balanceChartCache.has(key)) {
    balanceChartCache.delete(key);
  } else if (balanceChartCache.size >= BALANCE_CHART_CACHE_LIMIT) {
    // Xóa phần tử cũ nhất (ít sử dụng nhất - đầu tiên trong Map)
    const firstKey = balanceChartCache.keys().next().value;
    balanceChartCache.delete(firstKey);
  }
  balanceChartCache.set(key, data);
};

// ✅ Exported: gọi từ bên ngoài khi cần clear (sau sync)
export const clearStrategiesCache = () => {
  strategiesCache.clear();
  balanceChartCache.clear();
};
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hook để fetch danh sách strategies
 * ✅ Support AbortController to cancel previous requests
 * ✅ Frontend in-memory cache để tránh re-fetch khi chuyển backtest/sort
 */
export function useStrategies() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortControllerRef = useState({ current: null })[0];

  const fetchStrategies = useCallback(
    async ({
      page = 1,
      pageSize = 20,
      backtestTable = null,
      analysisRunId = null,
      symbol = null,
      search = null,
      type = null,
      timeframe = null,
      pd = null,
      totalNetProfit = null,
      totalTrades = null,
      winrate = null,
      largestProfitTradeRatio = null,
      riskRewardRatio = null,
      drawdown = null,
      largestLossTrade = null,
      profitFactor = null,
      sharpeRatio = null,
      recoveryFactor = null,
      lrCorrelation = null,
      filterOperators = {},
      filterRanges = {},
      sortBy = null,
      sortDir = null
    }) => {
      // ✅ Cancel previous in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        setLoading(true);
        setError(null);

        const data = await getStrategies({
          page,
          pageSize,
          backtestTable,
          analysisRunId,
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
          filterOperators,
          filterRanges,
          sortBy,
          sortDir,
          signal: abortControllerRef.current.signal
        });

        return data;
      } catch (err) {
        // ✅ Ignore abort errors
        if (err.name === 'AbortError') {
          return null;
        }
        setError(err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { fetchStrategies, loading, error };
}

/**
 * ✅ Hook để fetch strategies theo DATE RANGE
 * - Tính 5 metrics từ date range: P/D, Total Net Profit, Total Trades, Winrate %, Largest Loss Trade
 * - Filter 7 metrics từ full period results: Largest Profit Ratio, Risk-Reward, Drawdown %, Profit Factor, Sharpe, Recovery Factor, LR Correlation
 */
export function useStrategiesByTimeRange() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortControllerRef = useState({ current: null })[0];

  const fetchStrategiesByTimeRange = useCallback(
    async ({
      page = 1,
      pageSize = 20,
      backtestTable = null,
      analysisRunId = null,
      startDate,
      endDate,
      symbol = null,
      search = null,
      type = null,
      timeframe = null,
      // ✅ DATE RANGE filters (8 metrics)
      pd = null,
      totalNetProfit = null,
      totalTrades = null,
      winrate = null,
      largestLossTrade = null,
      largestProfitTradeRatio = null,
      riskRewardRatio = null,
      drawdown = null,
      // ✅ FULL PERIOD filters (4 metrics)
      profitFactor = null,
      sharpeRatio = null,
      recoveryFactor = null,
      lrCorrelation = null,
      // Operators và Ranges
      filterOperators = {},
      filterRanges = {},
      sortBy = null,
      sortDir = null
    }) => {
      // ❌ Cache disabled for date range filters - always fetch fresh data
      // const cacheKey = buildCacheKey({
      //   page, pageSize, backtestTable, startDate, endDate, symbol, search, type, timeframe,
      //   pd, totalNetProfit, totalTrades, winrate, largestLossTrade,
      //   largestProfitTradeRatio, riskRewardRatio, drawdown, profitFactor,
      //   sharpeRatio, recoveryFactor, lrCorrelation,
      //   filterOperators: JSON.stringify(filterOperators || {}),
      //   filterRanges: JSON.stringify(filterRanges || {}),
      //   sortBy: sortBy || 'default', sortDir: sortDir || 'default'
      // });

      // const cached = getCached(cacheKey);
      // if (cached) {
      //   return cached;
      // }

      // ✅ Cancel previous in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        setLoading(true);
        setError(null);

        const data = await getStrategiesByTimeRange({
          page,
          pageSize,
          backtestTable,
          analysisRunId,
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
          filterOperators,
          filterRanges,
          sortBy,
          sortDir,
          signal: abortControllerRef.current.signal
        });

        // ❌ Cache disabled - no setCached for date range filters
        // if (data) {
        //   setCached(cacheKey, data);
        // }

        return data;
      } catch (err) {
        // ✅ Ignore abort errors
        if (err.name === 'AbortError') {
          return null;
        }
        setError(err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { fetchStrategiesByTimeRange, loading, error };
}

/**
 * Hook để fetch chi tiết 1 strategy
 */
export function useStrategyDetail() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchStrategyDetail = useCallback(async (strategyId, backtestTable) => {
    try {
      setLoading(true);
      setError(null);

      return await getStrategyDetail(strategyId, backtestTable);
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { fetchStrategyDetail, loading, error };
}

/**
 * Hook để lấy distinct symbols
 */
export function useDistinctSymbols() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchSymbols = useCallback(async (backtestTable = null) => {
    try {
      setLoading(true);
      setError(null);

      return await getDistinctSymbols(backtestTable);
    } catch (err) {
      setError(err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  return { fetchSymbols, loading, error };
}

/**
 * Hook để lấy dữ liệu balance chart
 */
export function useBalanceChart() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchBalanceChart = useCallback(async (tableName, strategyId, initialDeposit = 1000000, filters = {}) => {
    const cacheKey = [
      tableName,
      strategyId,
      initialDeposit,
      filters.startDate || '',
      filters.endDate || '',
      filters.maxVolume ?? ''
    ].join('__');
    const cached = getChartCached(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      setLoading(true);
      setError(null);

      const data = await getBalanceChart(tableName, strategyId, initialDeposit, filters);
      if (data) setChartCached(cacheKey, data);
      return data;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { fetchBalanceChart, loading, error };
}

/**
 * Hook để lấy statistics
 */
export function useStrategyStatistics() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchStatistics = useCallback(async (backtestTable = null) => {
    try {
      setLoading(true);
      setError(null);

      return await getStrategyStatistics(backtestTable);
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { fetchStatistics, loading, error };
}

/**
 * Hook để xóa strategy
 */
export function useDeleteStrategy() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleDeleteStrategy = useCallback(async (strategyId, backtestTable) => {
    try {
      setLoading(true);
      setError(null);

      return await deleteStrategy(strategyId, backtestTable);
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { deleteStrategy: handleDeleteStrategy, loading, error };
}

/**
 * Hook để lấy danh sách Analysis Runs
 */
export function useAnalysisRuns() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [runs, setRuns] = useState([]);

  const fetchRuns = useCallback(async (sourceTable = null) => {
    if (Array.isArray(sourceTable) && sourceTable.length === 0) {
      setRuns([]);
      setError(null);
      setLoading(false);
      return [];
    }
    try {
      setLoading(true);
      setError(null);
      const response = await getAnalysisRuns(sourceTable);
      const data = Array.isArray(response) ? response : (response?.data || []);
      setRuns(data);
      return data;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearRuns = useCallback(() => {
    setRuns([]);
    setError(null);
    setLoading(false);
  }, []);

  return { fetchRuns, clearRuns, runs, loading, error };
}
