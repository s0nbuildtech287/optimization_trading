import { API_ENDPOINTS } from 'config';
import { authFetch } from './authFetch';

function buildSearchParams(params = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== 'all') {
      if (Array.isArray(value)) {
        value.forEach((v) => {
          if (v) searchParams.append(key, String(v));
        });
      } else {
        searchParams.set(key, String(value));
      }
    }
  });
  return searchParams;
}

export async function getDashboardData(params = {}) {
  const searchParams = buildSearchParams(params);
  const url = `${API_ENDPOINTS.DASHBOARD}?${searchParams.toString()}`;
  const res = await authFetch(url);
  if (!res.ok) throw new Error('Failed to fetch dashboard data');
  return res.json();
}

export async function getRiskAnalysisData(params = {}) {
  const searchParams = buildSearchParams(params);
  const url = `${API_ENDPOINTS.DASHBOARD}/risk-analysis?${searchParams.toString()}`;
  const res = await authFetch(url);
  if (!res.ok) throw new Error('Failed to fetch risk analysis data');
  return res.json();
}

export async function getRiskAnalysisCore(params = {}) {
  const searchParams = buildSearchParams(params);
  const url = `${API_ENDPOINTS.DASHBOARD}/risk-analysis/core?${searchParams.toString()}`;
  const res = await authFetch(url);
  if (!res.ok) throw new Error('Failed to fetch risk analysis core data');
  return res.json();
}

export async function getRiskAnalysisMarginExposure(params = {}) {
  const searchParams = buildSearchParams(params);
  const url = `${API_ENDPOINTS.DASHBOARD}/risk-analysis/margin-exposure?${searchParams.toString()}`;
  const res = await authFetch(url);
  if (!res.ok) throw new Error('Failed to fetch margin exposure data');
  return res.json();
}

export async function getRiskAnalysisDoubleExposure(params = {}) {
  const searchParams = buildSearchParams(params);
  const url = `${API_ENDPOINTS.DASHBOARD}/risk-analysis/double-exposure?${searchParams.toString()}`;
  const res = await authFetch(url);
  if (!res.ok) throw new Error('Failed to fetch double exposure data');
  return res.json();
}

export async function getRiskAnalysisLightCharts(params = {}) {
  const searchParams = buildSearchParams(params);
  const url = `${API_ENDPOINTS.DASHBOARD}/risk-analysis/light-charts?${searchParams.toString()}`;
  const res = await authFetch(url);
  if (!res.ok) throw new Error('Failed to fetch risk light charts data');
  return res.json();
}

export async function getBehaviorAnalysisData(params = {}) {
  const searchParams = buildSearchParams(params);
  const url = `${API_ENDPOINTS.DASHBOARD}/behavior-analysis?${searchParams.toString()}`;
  const res = await authFetch(url);
  if (!res.ok) throw new Error('Failed to fetch behavior analysis data');
  return res.json();
}

export async function getBehaviorAnalysisCore(params = {}) {
  const searchParams = buildSearchParams(params);
  const url = `${API_ENDPOINTS.DASHBOARD}/behavior-analysis/core?${searchParams.toString()}`;
  const res = await authFetch(url);
  if (!res.ok) throw new Error('Failed to fetch behavior analysis core data');
  return res.json();
}

export async function getBehaviorAnalysisActivity(params = {}) {
  const searchParams = buildSearchParams(params);
  const url = `${API_ENDPOINTS.DASHBOARD}/behavior-analysis/activity?${searchParams.toString()}`;
  const res = await authFetch(url);
  if (!res.ok) throw new Error('Failed to fetch behavior activity data');
  return res.json();
}

export async function getBehaviorAnalysisHoldingRecovery(params = {}) {
  const searchParams = buildSearchParams(params);
  const url = `${API_ENDPOINTS.DASHBOARD}/behavior-analysis/holding-recovery?${searchParams.toString()}`;
  const res = await authFetch(url);
  if (!res.ok) throw new Error('Failed to fetch behavior holding recovery data');
  return res.json();
}

export async function getBehaviorAnalysisExit(params = {}) {
  const searchParams = buildSearchParams(params);
  const url = `${API_ENDPOINTS.DASHBOARD}/behavior-analysis/exit?${searchParams.toString()}`;
  const res = await authFetch(url);
  if (!res.ok) throw new Error('Failed to fetch behavior exit data');
  return res.json();
}

export async function getBehaviorStrategyDetail(params = {}) {
  const searchParams = buildSearchParams(params);
  const url = `${API_ENDPOINTS.DASHBOARD}/behavior-analysis/strategy-detail?${searchParams.toString()}`;
  const res = await authFetch(url);
  if (!res.ok) throw new Error('Failed to fetch strategy behavior details');
  return res.json();
}

export async function getDashboardOverviewCore(params = {}) {
  const searchParams = buildSearchParams(params);
  const res = await authFetch(`${API_ENDPOINTS.DASHBOARD}/overview/core?${searchParams.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch overview core');
  return res.json();
}

export async function getDashboardOverviewMonthlyProfit(params = {}) {
  const searchParams = buildSearchParams(params);
  const res = await authFetch(`${API_ENDPOINTS.DASHBOARD}/overview/monthly-profit?${searchParams.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch overview monthly profit');
  return res.json();
}

export async function getDashboardOverviewTopStats(params = {}) {
  const searchParams = buildSearchParams(params);
  const res = await authFetch(`${API_ENDPOINTS.DASHBOARD}/overview/top-stats?${searchParams.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch overview top stats');
  return res.json();
}

export async function getDashboardOverviewYearlyPerformance(params = {}) {
  const searchParams = buildSearchParams(params);
  const res = await authFetch(`${API_ENDPOINTS.DASHBOARD}/overview/yearly-performance?${searchParams.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch overview yearly performance');
  return res.json();
}

export async function getDashboardOverviewBehaviorSummary(params = {}) {
  const searchParams = buildSearchParams(params);
  const res = await authFetch(`${API_ENDPOINTS.DASHBOARD}/overview/behavior-summary?${searchParams.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch overview behavior summary');
  return res.json();
}

export async function getDashboardOverviewComparative(params = {}) {
  const searchParams = buildSearchParams(params);
  const res = await authFetch(`${API_ENDPOINTS.DASHBOARD}/overview/comparative?${searchParams.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch overview comparative');
  return res.json();
}

export async function getDashboardOverviewBreakdown(params = {}) {
  const searchParams = buildSearchParams(params);
  const res = await authFetch(`${API_ENDPOINTS.DASHBOARD}/overview/breakdown?${searchParams.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch overview breakdown');
  return res.json();
}
