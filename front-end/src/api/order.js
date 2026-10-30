import { API_ENDPOINTS } from 'config';
import { authFetch } from './authFetch';

// api Sync (original - sử dụng cho local/test)
export async function syncOrder(payload) {
  const res = await authFetch(API_ENDPOINTS.SYNC_SHEET, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Sync failed');
  }

  return res.json();
}

// ✅ NEW: Async sync (cho production - tránh Cloudflare timeout)
export async function syncOrderAsync(payload) {
  const endpoint = payload.runType === 'SUMMARY' ? '/api/drive-summary-async' : '/api/sync-sheet-async';
  const res = await authFetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Sync failed');
  }

  return res.json(); // { syncId, pollUrl, status, ... }
}

// ✅ NEW: Check sync status (polling)
export async function getSyncStatus(syncId) {
  const res = await authFetch(`/api/sync-status/${syncId}`);

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error('Sync job not found or expired');
    }
    throw new Error('Failed to get sync status');
  }

  return res.json();
}

export async function cancelSyncJob(syncId) {
  const res = await authFetch(`/api/sync-status/${encodeURIComponent(syncId)}/cancel`, {
    method: 'POST'
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to stop sync');
  }
  return data;
}

// api get order list
export async function getOrderList(params) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== 'all') {
      searchParams.set(key, String(value));
    }
  });

  const url = `${API_ENDPOINTS.ORDER_LIST}?${searchParams.toString()}`;

  const res = await authFetch(url);
  if (!res.ok) throw new Error('Failed to fetch order data');

  return res.json();
}

// ✅ api get order totals (separate endpoint for lazy loading)
export async function getOrderTotals(params) {
  const searchParams = new URLSearchParams();

  // only pass filter params + tableName (no page/sort)
  const allowedKeys = ['tableName', 'filter[strategy_id]', 'filter[symbol]', 'filter[year]', 'filter[search]', 'filter[start_date]', 'filter[end_date]'];
  Object.entries(params).forEach(([key, value]) => {
    if (allowedKeys.includes(key) && value !== undefined && value !== null && value !== 'all') {
      searchParams.set(key, String(value));
    }
  });

  const url = `${API_ENDPOINTS.ORDER_LIST}/totals?${searchParams.toString()}`;

  const res = await authFetch(url);
  if (!res.ok) throw new Error('Failed to fetch order totals');

  return res.json();
}

// api download log file
export async function downloadLogFile(type, syncId = null) {
  const url = syncId
    ? `/api/sync-jobs/${encodeURIComponent(syncId)}/issues/${encodeURIComponent(type)}/download`
    : `${API_ENDPOINTS.DOWNLOAD_LOG}?type=${type}`;
  const response = await authFetch(url);

  if (!response.ok) {
    throw new Error('File không tồn tại hoặc lỗi server');
  }

  return response.blob();
}

// api get filter options
export async function getFilterOptions(tableName = 'all_backtests') {
  const url = `/api/filter-options?tableName=${tableName}`;

  const res = await authFetch(url);
  if (!res.ok) throw new Error('Failed to fetch filter options');

  return res.json();
}

// ─── BACKTEST TABLE MANAGEMENT ─────────────────────────────────────────────────
/**
 * ✅ Get all backtest tables from database
 */
export async function getBacktestTables() {
  const url = `/api/backtest-tables`;

  const res = await authFetch(url);
  if (!res.ok) throw new Error('Failed to fetch backtest tables');

  return res.json();
}

/**
 * ✅ Create new backtest table
 */
export async function createBacktestTable(tableName) {
  const url = `/api/backtest-tables`;

  const res = await authFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ tableName })
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to create backtest table');
  }

  return res.json();
}

export async function deleteBacktestTable(tableName) {
  const url = `/api/backtest-tables/${encodeURIComponent(tableName)}`;

  const res = await authFetch(url, { method: 'DELETE' });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to delete backtest table');
  }

  return res.json();
}

/**
 * Assign a backtest table to a user. Admin only.
 */
export async function assignBacktestTableOwner(tableName, ownerUserId) {
  const url = `/api/data-sources/${encodeURIComponent(tableName)}/owner`;
  const res = await authFetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ owner_user_id: Number(ownerUserId) })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || 'Failed to assign backtest table owner');
  }

  return res.json();
}

// ─── STRATEGY FILE CHECK ───────────────────────────────────────────────────────
/**
 * ✅ Get strategy file check — bots thiếu file theo từng backtest table
 */
export async function getStrategyFileCheck() {
  const url = `/api/strategy-file-check`;
  const res = await authFetch(url);
  if (!res.ok) throw new Error('Failed to fetch strategy file check');
  return res.json();
}
