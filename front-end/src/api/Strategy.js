// src/api/Strategy.js

import { API_ENDPOINTS } from 'config';
import { authFetch } from './authFetch';

/**
 * ✅ Clear backend in-memory strategy cache
 * Gọi khi cần buộc server fetch dữ liệu mới từ DB (ví dụ: sau khi xóa thẳng trong DB)
 */
export async function clearServerCache() {
  try {
    const res = await authFetch(`${API_ENDPOINTS.STRATEGY_CACHE_CLEAR}`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error(`Clear cache failed: ${res.statusText}`);
  } catch (error) {
    console.error('Error clearing server cache:', error);
  }
}

/**
 * ✅ Download Google Sheet as xlsx via backend (service account)
 */
export async function downloadStrategySheet(sheetId, filename = 'strategy') {
  const url = `${API_ENDPOINTS.STRATEGY_SHEET_DOWNLOAD}/${sheetId}?filename=${encodeURIComponent(filename)}`;
  const res = await authFetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

/**
 * Shared helper to build URLSearchParams from filtering options
 */
function buildStrategyParams(options) {
  const params = new URLSearchParams();
  const {
    backtestTable,
    analysisRunId,
    analysis_run_id,
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
    largestProfitTradeRatio,
    riskRewardRatio,
    drawdown,
    largestLossTrade,
    profitFactor,
    sharpeRatio,
    recoveryFactor,
    lrCorrelation,
    filterOperators,
    filterRanges
  } = options;

  const runId = analysisRunId || analysis_run_id;
  if (runId) params.append('analysis_run_id', runId);
  if (backtestTable) params.append('backtest_table', backtestTable);
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  if (symbol) {
    const symbolValue = Array.isArray(symbol) ? symbol.join(',') : symbol;
    if (symbolValue) params.append('symbol', symbolValue);
  }
  if (search) params.append('search', search);
  if (type) params.append('type', type);
  if (timeframe) params.append('timeframe', timeframe);
  if (pd) params.append('pd', pd);
  if (totalNetProfit) params.append('total_net_profit', totalNetProfit);
  if (totalTrades) params.append('total_trades', totalTrades);
  if (winrate) params.append('winrate', winrate);
  if (largestProfitTradeRatio) params.append('largest_profit_trade_ratio', largestProfitTradeRatio);
  if (riskRewardRatio) params.append('risk_reward_ratio', riskRewardRatio);
  if (drawdown) params.append('drawdown', drawdown);
  if (largestLossTrade) params.append('largest_loss_trade', largestLossTrade);
  if (profitFactor) params.append('profit_factor', profitFactor);
  if (sharpeRatio) params.append('sharpe_ratio', sharpeRatio);
  if (recoveryFactor) params.append('recovery_factor', recoveryFactor);
  if (lrCorrelation) params.append('lr_correlation', lrCorrelation);

  if (filterOperators && Object.keys(filterOperators).length > 0) {
    params.append('filter_operators', JSON.stringify(filterOperators));
  }
  if (filterRanges && Object.keys(filterRanges).length > 0) {
    params.append('filter_ranges', JSON.stringify(filterRanges));
  }

  return params;
}

/**
 * ✅ OPTIMIZED: Lấy tất cả strategy IDs (không phân trang) - dùng để copy
 * Uses dedicated backend endpoint that only returns IDs - SUPER FAST!
 */
export async function getAllStrategyIds(options) {
  const { signal = null, onProgress = null, ...filterOptions } = options || {};
  try {
    // Show progress: preparing
    if (onProgress) {
      onProgress(1, 1, 0);
    }

    const params = buildStrategyParams(filterOptions);
    const url = `${API_ENDPOINTS.STRATEGY_IDS}?${params.toString()}`;

    const res = await authFetch(url, { signal });

    if (!res.ok) {
      throw new Error(`Failed to fetch strategy IDs: ${res.statusText}`);
    }

    const data = await res.json();

    // Show progress: complete
    if (onProgress) {
      onProgress(1, 1, data.ids.length);
    }

    return data.ids;
  } catch (error) {
    console.error('Error fetching all strategy IDs:', error);
    throw error;
  }
}

/**
 * Lấy danh sách strategies với phân trang và filter
 */
export async function getStrategies(options) {
  const {
    page = 1,
    pageSize = 20,
    sortBy = null,
    sortDir = null,
    signal = null,
    ...filterOptions
  } = options || {};

  const params = buildStrategyParams(filterOptions);
  params.append('page', String(page));
  params.append('pageSize', String(pageSize));

  if (sortBy) params.append('sort_by', sortBy);
  if (sortDir) params.append('sort_dir', sortDir);

  const url = `${API_ENDPOINTS.STRATEGIES}?${params.toString()}`;

  // ✅ Pass abort signal to fetch
  const res = await authFetch(url, { signal });

  if (!res.ok) {
    throw new Error('Failed to fetch strategies');
  }

  const data = await res.json();
  return data;
}

/**
 * Lấy chi tiết 1 strategy
 */
export async function getStrategyDetail(strategyId, backtestTable) {
  const url = `${API_ENDPOINTS.STRATEGY_DETAIL}/${encodeURIComponent(strategyId)}/${encodeURIComponent(backtestTable)}`;

  const res = await authFetch(url);

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error('Strategy not found');
    }
    throw new Error('Failed to fetch strategy detail');
  }

  const data = await res.json();
  return data;
}

/**
 * Lấy danh sách symbols duy nhất
 */
export async function getDistinctSymbols(backtestTable = null) {
  const params = new URLSearchParams();
  if (backtestTable) params.append('backtest_table', backtestTable);

  const url = `${API_ENDPOINTS.STRATEGY_SYMBOLS}?${params.toString()}`;

  const res = await authFetch(url);

  if (!res.ok) {
    throw new Error('Failed to fetch symbols');
  }

  const data = await res.json();
  return data.symbols || [];
}

/**
 * Lấy thống kê strategies
 */
export async function getStrategyStatistics(backtestTable = null) {
  const params = new URLSearchParams();
  if (backtestTable) params.append('backtest_table', backtestTable);

  const url = `${API_ENDPOINTS.STRATEGY_STATISTICS}?${params.toString()}`;

  const res = await authFetch(url);

  if (!res.ok) {
    throw new Error('Failed to fetch statistics');
  }

  const data = await res.json();
  return data;
}

/**
 * Xóa 1 strategy
 */
export async function deleteStrategy(strategyId, backtestTable) {
  if (!backtestTable) {
    throw new Error('backtestTable is required');
  }

  const url = `${API_ENDPOINTS.STRATEGY_DETAIL}/${encodeURIComponent(strategyId)}/${encodeURIComponent(backtestTable)}`;

  const res = await authFetch(url, {
    method: 'DELETE'
  });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error('Strategy not found');
    }
    throw new Error('Failed to delete strategy');
  }

  const data = await res.json();
  return data;
}

/**
 * Lấy dữ liệu biểu đồ balance cho strategy
 */
export async function getBalanceChart(tableName, strategyId, initialDeposit = 1000000, filters = {}) {
  const params = new URLSearchParams({ initialDeposit: String(initialDeposit) });
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.maxVolume !== null && filters.maxVolume !== undefined && filters.maxVolume !== '') {
    params.set('maxVolume', String(filters.maxVolume));
  }
  const url = `${API_ENDPOINTS.BALANCE_CHART}/${encodeURIComponent(tableName)}/${encodeURIComponent(strategyId)}?${params.toString()}`;

  const res = await authFetch(url);

  if (!res.ok) {
    throw new Error('Failed to fetch balance chart data');
  }

  const data = await res.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to load balance data');
  }

  return data.data;
}

/**
 * ✅ NEW: Lấy strategies theo khoảng thời gian (date range)
 * 
 * DATE RANGE METRICS (tính từ deals trong khoảng thời gian):
 * - P/D Ratio, Total Net Profit, Total Trades, Winrate %, Largest Loss Trade, Largest Profit Trade Ratio, Risk-Reward Ratio, Max Drawdown
 * 
 * FULL PERIOD METRICS (lấy từ results - dùng để filter):
 * - Profit Factor, Sharpe Ratio, Recovery Factor, LR Correlation
 */
export async function getStrategiesByTimeRange(options) {
  const {
    page = 1,
    pageSize = 20,
    sortBy = null,
    sortDir = null,
    signal = null,
    ...filterOptions
  } = options || {};

  const params = buildStrategyParams(filterOptions);
  params.append('page', String(page));
  params.append('pageSize', String(pageSize));

  if (sortBy) params.append('sort_by', sortBy);
  if (sortDir) params.append('sort_dir', sortDir);

  const url = `${API_ENDPOINTS.STRATEGIES_BY_TIME_RANGE}?${params.toString()}`;

  const res = await authFetch(url, { signal });

  if (!res.ok) {
    throw new Error('Failed to fetch strategies by time range');
  }

  const data = await res.json();
  return data;
}

/**
 * Get service account emails
 */
export async function getServiceAccountEmails() {
  const res = await authFetch(API_ENDPOINTS.STRATEGY_SERVICE_ACCOUNTS, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to get service account emails');
  }

  return res.json();
}

/**
 * Get strategy IDs (sheet names) from Google Drive folder
 */
export async function getStrategyIdsFromFolder(folderLink) {
  const res = await authFetch(API_ENDPOINTS.STRATEGY_GET_FROM_FOLDER, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ folderLink })
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to get strategy IDs');
  }

  return res.json();
}

// ──────────────────────────────────── User Preferences ────────────────────────────────────

/**
 * Lấy filter preferences của user từ DB
 */
export async function getPreferences() {
  const res = await authFetch(API_ENDPOINTS.STRATEGY_PREFERENCES, {
    headers: { 'Content-Type': 'application/json' }
  });
  if (!res.ok) throw new Error('Failed to load preferences');
  return res.json();
}

/**
 * Lưu filter preferences của user lên DB
 * @param {Object} strategyFilters - { activeFilters, filterOperators, filterRanges, inputFilters }
 */
export async function savePreferences(strategyFilters) {
  const res = await authFetch(API_ENDPOINTS.STRATEGY_PREFERENCES, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ strategyFilters })
  });
  if (!res.ok) throw new Error('Failed to save preferences');
  return res.json();
}

/**
 * Lấy danh sách Analysis Runs theo sourceTable
 */
export async function getAnalysisRuns(sourceTable = null) {
  let url = `${API_ENDPOINTS.LOT_THRESHOLD_RUNS || '/api/lot-threshold/runs'}`;
  if (sourceTable) {
    const val = Array.isArray(sourceTable) ? sourceTable.join(',') : sourceTable;
    url += `?source_table=${encodeURIComponent(val)}`;
  }
  const res = await authFetch(url);
  if (!res.ok) throw new Error('Failed to fetch analysis runs');
  return res.json();
}
