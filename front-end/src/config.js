// ==============================|| THEME CONSTANT ||============================== //

export const APP_DEFAULT_PATH = '/dashboard/overview';
export const DRAWER_WIDTH = 260;
export const MINI_DRAWER_WIDTH = 60;

// ==============================|| API CONSTANTS ||============================== //
// deploy server cloud:
// export const API_BASE_URL = 'http://34.2.156.21:5000';
// local server:
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
// deploy server backtest with domain:
// export const API_BASE_URL = 'https://backtest.lotusquant.co';
// deploy server backtest test with domain: 
// export const API_BASE_URL = 'https://test-backtest.lotusquant.co';
export const API_ENDPOINTS = {
  BACKTEST_LIST: '/api/data',
  ORDER_LIST: '/api/data',
  SYNC_SHEET: '/api/sync-sheet',
  DOWNLOAD_LOG: '/api/download-log',
  DASHBOARD: '/api/dashboard',
  // Notifications
  NOTIFICATIONS: '/api/notifications',
  NOTIFICATIONS_UNREAD_COUNT: '/api/notifications/unread-count',
  NOTIFICATIONS_READ_ALL: '/api/notifications/read-all',
  NOTIFICATIONS_PREFERENCES: '/api/notifications/preferences',
  // System Logs
  SYSTEM_LOGS_LATEST_BACKTEST: '/api/latest-backtest',
  SYSTEM_LOGS_HISTORY: '/api/history',
  SYSTEM_LOGS_ALL: '/api/all',
  SYSTEM_LOGS_CLEANUP: '/api/cleanup',
  SYSTEM_LOGS_ACTIVITY: '/api/activity',
  SYSTEM_LOGS_DELETE_TABLE: '/api/table',
  // Login / Register
  AUTH_REQUEST_OTP: '/auth/request-otp',
  AUTH_REGISTER: '/auth/register',
  AUTH_LOGIN: '/auth/login',

   //  Strategy Endpoints
  STRATEGIES: '/api/strategies',
  STRATEGY_CACHE_CLEAR: '/api/strategies/cache/clear',
  STRATEGIES_BY_TIME_RANGE: '/api/strategies',  // ✅ Consolidated to main endpoint
  STRATEGY_IDS: '/api/strategies/ids',
  STRATEGY_DETAIL: '/api/strategies',
  STRATEGY_SYMBOLS: '/api/strategies/symbols/distinct',
  STRATEGY_STATISTICS: '/api/strategies/statistics/summary',
  STRATEGY_SHEET_DOWNLOAD: '/api/strategies/sheet/download',
  STRATEGY_SERVICE_ACCOUNTS: '/api/strategies/service-accounts',
  STRATEGY_GET_FROM_FOLDER: '/api/strategies/get-from-folder',
  STRATEGY_PREFERENCES: '/api/strategies/preferences',
  BALANCE_CHART: '/api/balance-chart',
  // Lot Threshold Analysis
  LOT_THRESHOLD_RUN: '/api/lot-threshold/run',
  LOT_THRESHOLD_STATUS: '/api/lot-threshold/status',
  LOT_THRESHOLD_RESULTS: '/api/lot-threshold/results',
  LOT_THRESHOLD_OPTIMAL: '/api/lot-threshold/optimal',
  LOT_THRESHOLD_TIME_RANGE: '/api/lot-threshold/time-range',
  LOT_THRESHOLD_RUNS: '/api/lot-threshold/runs',
  LOT_THRESHOLD_DELETE_RUN: '/api/lot-threshold/runs',
  LOT_THRESHOLD_SELECTION: '/api/lot-threshold/selection',
  LOT_THRESHOLD_SELECTION_RESET: '/api/lot-threshold/selection/reset',
  // Backtest Tables
  BACKTEST_TABLES: '/api/backtest-tables',
};

// ==============================|| PAGINATION CONSTANTS ||============================== //

export const DEFAULT_PAGE_SIZE = 50;
export const PAGE_SIZE_OPTIONS = [50, 100];
