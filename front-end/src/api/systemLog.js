import { API_ENDPOINTS } from 'config';
import { authFetch } from './authFetch';

/**
 * Lấy log sync cuối cùng của từng bảng backtest
 */
export async function getLatestBacktestLogs() {
  const url = API_ENDPOINTS.SYSTEM_LOGS_LATEST_BACKTEST;

  const res = await authFetch(url);

  if (!res.ok) {
    throw new Error('Failed to fetch latest backtest logs');
  }

  const data = await res.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to fetch logs');
  }

  return data.data;
}

/**
 * Lấy lịch sử log của 1 bảng
 */
export async function getTableLogHistory(tableName, limit = 50) {
  const url = `${API_ENDPOINTS.SYSTEM_LOGS_HISTORY}/${tableName}?limit=${limit}`;

  const res = await authFetch(url);

  if (!res.ok) {
    throw new Error('Failed to fetch table log history');
  }

  const data = await res.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to fetch log history');
  }

  return data.data;
}

/**
 * Lấy tất cả logs (có filter)
 */
export async function getAllLogs(logType = 'SYNC', limit = 100) {
  const searchParams = new URLSearchParams({
    logType,
    limit: String(limit)
  });

  const url = `${API_ENDPOINTS.SYSTEM_LOGS_ALL}?${searchParams.toString()}`;

  const res = await authFetch(url);

  if (!res.ok) {
    throw new Error('Failed to fetch all logs');
  }

  const data = await res.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to fetch logs');
  }

  return data.data;
}

/**
 * Xóa logs cũ (admin only)
 */
export async function cleanupOldLogs(daysToKeep = 90) {
  const url = API_ENDPOINTS.SYSTEM_LOGS_CLEANUP;

  const res = await authFetch(url, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ daysToKeep })
  });

  if (!res.ok) {
    throw new Error('Failed to cleanup old logs');
  }

  const data = await res.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to cleanup logs');
  }

  return data;
}

export async function deleteLogsByTable(tableName) {
  const url = `${API_ENDPOINTS.SYSTEM_LOGS_DELETE_TABLE}/${tableName}`;
  const res = await authFetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete logs');
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Failed to delete logs');
  return data;
}

/**
 * Lấy activity logs trong 3 tháng (NEW_RUN, UPDATE)
 */
export async function getActivityLogs(tableName) {
  const url = `${API_ENDPOINTS.SYSTEM_LOGS_ACTIVITY}/${tableName}`;

  const res = await authFetch(url);

  if (!res.ok) {
    throw new Error('Failed to fetch activity logs');
  }

  const data = await res.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to fetch activity logs');
  }

  return data.data;
}
