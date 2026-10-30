import { API_ENDPOINTS } from 'config';
import { authFetch } from './authFetch';

export async function runLotThresholdAnalysis(payload) {
  const res = await authFetch(API_ENDPOINTS.LOT_THRESHOLD_RUN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to trigger lot threshold analysis');
  }
  return res.json();
}

export async function getLotThresholdStatus(syncId) {
  const res = await authFetch(`${API_ENDPOINTS.LOT_THRESHOLD_STATUS}/${syncId}`);
  if (!res.ok) throw new Error('Failed to get analysis status');
  return res.json();
}

export async function getLotThresholdResults(params) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, String(value));
    }
  });
  const res = await authFetch(`${API_ENDPOINTS.LOT_THRESHOLD_RESULTS}?${searchParams.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch analysis results');
  return res.json();
}

export async function getLotThresholdOptimal(params) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, String(value));
    }
  });
  const res = await authFetch(`${API_ENDPOINTS.LOT_THRESHOLD_OPTIMAL}?${searchParams.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch optimal results');
  return res.json();
}

export async function getLotThresholdTimeRange() {
  const res = await authFetch(API_ENDPOINTS.LOT_THRESHOLD_TIME_RANGE);
  if (!res.ok) throw new Error('Failed to fetch time range');
  return res.json();
}

export async function getLotThresholdRuns(params = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, String(value));
    }
  });
  const query = searchParams.toString();
  const res = await authFetch(`${API_ENDPOINTS.LOT_THRESHOLD_RUNS}${query ? `?${query}` : ''}`);
  if (!res.ok) throw new Error('Failed to fetch analysis runs');
  return res.json();
}

export async function deleteLotThresholdRun(analysisRunId) {
  const res = await authFetch(`${API_ENDPOINTS.LOT_THRESHOLD_DELETE_RUN}/${encodeURIComponent(analysisRunId)}`, {
    method: 'DELETE'
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete analysis run');
  }
  return res.json();
}

async function submitLotThresholdSelection(endpoint, method, payload) {
  const res = await authFetch(endpoint, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update lot threshold selection');
  }
  return res.json();
}

export function selectLotThresholdCandidate(payload) {
  return submitLotThresholdSelection(API_ENDPOINTS.LOT_THRESHOLD_SELECTION, 'PUT', payload);
}

export function resetLotThresholdCandidate(payload) {
  return submitLotThresholdSelection(API_ENDPOINTS.LOT_THRESHOLD_SELECTION_RESET, 'POST', payload);
}
