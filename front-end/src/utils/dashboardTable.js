let dashboardSourcesInMemory = [];
const DASHBOARD_DATE_RANGE_STORAGE_KEY = 'lotusquant.dashboard.dateRange';
const DASHBOARD_TABLE_STORAGE_KEY = 'lotusquant.dashboard.selectedTable';
const DASHBOARD_SOURCES_STORAGE_KEY = 'lotusquant.dashboard.selectedSources';

export const getStoredDashboardSources = (fallback = []) => {
  if (dashboardSourcesInMemory.length > 0) return [...dashboardSourcesInMemory];
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = window.localStorage.getItem(DASHBOARD_SOURCES_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : null;
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

export const setStoredDashboardSources = (sourceNames) => {
  dashboardSourcesInMemory = Array.isArray(sourceNames) ? [...sourceNames] : [];
  if (typeof window === 'undefined') return;
  try {
    if (dashboardSourcesInMemory.length > 0) {
      window.localStorage.setItem(
        DASHBOARD_SOURCES_STORAGE_KEY,
        JSON.stringify(dashboardSourcesInMemory)
      );
    } else {
      window.localStorage.removeItem(DASHBOARD_SOURCES_STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures; in-memory state remains authoritative.
  }
};

export const removeStoredDashboardSource = (sourceName) => {
  if (typeof window === 'undefined' || !sourceName) return;
  const current = getStoredDashboardSources([]);
  setStoredDashboardSources(current.filter((name) => name !== sourceName));
};

export const getStoredDashboardTable = (fallback = 'all_backtests') => {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = window.localStorage.getItem(DASHBOARD_TABLE_STORAGE_KEY);
    return stored || fallback;
  } catch {
    return fallback;
  }
};

export const setStoredDashboardTable = (tableName) => {
  if (typeof window === 'undefined') return;
  try {
    if (tableName) {
      window.localStorage.setItem(DASHBOARD_TABLE_STORAGE_KEY, tableName);
    } else {
      window.localStorage.removeItem(DASHBOARD_TABLE_STORAGE_KEY);
    }
  } catch {
    // Ignore
  }
};

export const getStoredDashboardDateRange = () => {
  if (typeof window === 'undefined') return { startDate: null, endDate: null };

  try {
    const stored = window.localStorage.getItem(DASHBOARD_DATE_RANGE_STORAGE_KEY);
    if (!stored) return { startDate: null, endDate: null };
    const parsed = JSON.parse(stored);
    return {
      startDate: parsed.startDate || null,
      endDate: parsed.endDate || null
    };
  } catch {
    return { startDate: null, endDate: null };
  }
};

export const setStoredDashboardDateRange = (startDate, endDate) => {
  if (typeof window === 'undefined') return;

  try {
    if (startDate && endDate) {
      window.localStorage.setItem(
        DASHBOARD_DATE_RANGE_STORAGE_KEY,
        JSON.stringify({ startDate, endDate })
      );
    } else {
      window.localStorage.removeItem(DASHBOARD_DATE_RANGE_STORAGE_KEY);
    }
  } catch {
    // Ignore
  }
};
