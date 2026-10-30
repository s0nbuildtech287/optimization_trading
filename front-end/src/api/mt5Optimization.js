import { authFetch } from './authFetch';

const ROOT = '/api/mt5-optimization';

async function request(path, options = {}) {
  const response = await authFetch(`${ROOT}${path}`, {
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json', ...options.headers } : options.headers
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `MT5 request failed (${response.status})`);
    error.code = payload.code || 'MT5_REQUEST_FAILED';
    error.status = response.status;
    throw error;
  }
  return payload.data;
}

export const isMt5SessionNotFoundError = (error) => error?.code === 'MT5_SESSION_NOT_FOUND';

const query = (params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  const value = search.toString();
  return value ? `?${value}` : '';
};

export const listMt5Sessions = () => request('/sessions');
export const getMt5FilterPreferences = () => request('/filter-preferences');
export const saveMt5FilterPreference = (scope, body) =>
  request(`/filter-preferences/${scope}`, { method: 'PUT', body: JSON.stringify(body) });
export const deleteMt5FilterPreference = (scope) =>
  request(`/filter-preferences/${scope}`, { method: 'DELETE' });
export const createMt5Session = (body) => request('/sessions', { method: 'POST', body: JSON.stringify(body) });
export const getMt5SessionCleanupPreview = (id) => request(`/sessions/${id}/cleanup-preview`);
export const purgeUnusedMt5Results = (id, body = {}) =>
  request(`/sessions/${id}/purge-unused-results`, { method: 'POST', body: JSON.stringify(body) });
export const getMt5SessionDeletePreview = (id) => request(`/sessions/${id}/delete-preview`);
export const deleteMt5Session = (id, body) =>
  request(`/sessions/${id}`, { method: 'DELETE', body: JSON.stringify(body) });
export const getRunningMt5BacktestCount = (id) => request(`/sessions/${id}/running-backtests`);
export const listMt5ApiKeys = () => request('/api-keys');
export const createMt5ApiKey = (body) => request('/api-keys', { method: 'POST', body: JSON.stringify(body) });
export const revokeMt5ApiKey = (id) => request('/api-keys/' + id + '/revoke', { method: 'POST' });
export const deleteMt5ApiKey = (id) => request(`/api-keys/${id}`, { method: 'DELETE' });
export const listMt5Workers = () => request('/workers');
export const updateMt5Worker = (id, body) => request(`/workers/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteMt5Worker = (id) => request(`/workers/${id}`, { method: 'DELETE' });
export const listMt5Jobs = (params) => request(`/jobs${query(params)}`);
export const listMt5JobSelection = (params) => request(`/jobs/selection${query(params)}`);
export const createMt5Jobs = (body) => request('/jobs', { method: 'POST', body: JSON.stringify(body) });
export const createEveryTickJobs = (body) => request('/jobs/every-tick', { method: 'POST', body: JSON.stringify(body) });
export const cancelMt5Job = (id) => request(`/jobs/${id}/cancel`, { method: 'POST' });
export const retryMt5Job = (id, numberOfRuns = 1) =>
  request(`/jobs/${id}/retry`, {
    method: 'POST',
    body: JSON.stringify({ number_of_runs: numberOfRuns })
  });
export const deleteMt5Job = (id) => request(`/jobs/${id}`, { method: 'DELETE' });
export const listMt5Results = (params, options = {}) => request(`/results${query(params)}`, options);
export const getMt5ResultsSummary = (params, options = {}) => request(`/results-summary${query(params)}`, options);
export const getMt5ResultsState = (sessionId) => request(`/sessions/${sessionId}/results-state`);
export const getMt5Result = (id) => request(`/results/${id}`);
export const listMt5BacktestCandidates = (params) => request(`/backtest-candidates${query(params)}`);
export const autoReviewMt5BacktestCandidates = (body) =>
  request('/backtest-candidates/auto-review', { method: 'POST', body: JSON.stringify(body) });
export const getMt5BacktestCandidate = (id, includeDeals = false) =>
  request(`/backtest-candidates/${id}${query({ include_deals: includeDeals })}`);
export const deleteMt5BacktestCandidate = (id) =>
  request(`/backtest-candidates/${id}`, { method: 'DELETE' });
export const getMt5BacktestCandidateSparkline = (id, params = {}) =>
  request(`/backtest-candidates/${id}/sparkline${query(params)}`);
export const setMt5Watchlist = (id, value) =>
  request(`/results/${id}/watchlist`, { method: 'PATCH', body: JSON.stringify({ value }) });
export const setMt5BacktestCandidate = (id, value) =>
  request(`/results/${id}/backtest-candidate`, { method: 'PATCH', body: JSON.stringify({ value }) });
export const startMt5Backtest = (id) =>
  request(`/results/${id}/start-backtest`, { method: 'POST' });
export const selectMt5Staging = (id, targetTable = null, value = true, overwriteExisting = true) =>
  request(`/backtest-candidates/${id}/staging`, {
    method: 'PATCH',
    body: JSON.stringify({ targetTable, value, overwriteExisting })
  });
export const syncMt5Result = (id, targetTable, overwrite = false) =>
  request(`/backtest-candidates/${id}/sync`, { method: 'POST', body: JSON.stringify({ targetTable, overwrite }) });
