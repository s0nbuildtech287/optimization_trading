import { authFetch } from './authFetch';

/**
 * ✅ Fetch or generate AI Analysis report for a specific tab
 */
export async function getAiReport({ targetType = 'tab', targetId, tableName, startDate, endDate }) {
  const params = new URLSearchParams({
    targetType,
    targetId
  });

  if (Array.isArray(tableName)) {
    params.append('sourceNames', tableName.join(','));
  } else if (tableName) {
    params.append('tableName', tableName);
  } else {
    params.append('tableName', 'all_backtests');
  }

  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);

  const url = `/api/dashboard/ai-analysis?${params.toString()}`;
  const res = await authFetch(url);

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to fetch AI report');
  }

  return res.json();
}

/**
 * ✅ Force regeneration of an AI Analysis report
 */
export async function refreshAiReport({ targetType = 'tab', targetId, tableName, startDate, endDate }) {
  const url = `/api/dashboard/ai-analysis/refresh`;
  const tableVal = Array.isArray(tableName) ? tableName.join(',') : (tableName || 'all_backtests');
  const res = await authFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      targetType,
      targetId,
      tableName: tableVal,
      sourceNames: Array.isArray(tableName) ? tableName : undefined,
      startDate: startDate || null,
      endDate: endDate || null
    })
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to refresh AI report');
  }

  return res.json();
}
