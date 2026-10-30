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

export async function getComparativeRankingData(params = {}) {
  const searchParams = buildSearchParams(params);
  const query = searchParams.toString();
  const url = `${API_ENDPOINTS.DASHBOARD}/comparative-ranking${query ? `?${query}` : ''}`;
  const res = await authFetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || 'Failed to fetch comparative ranking data');
  }
  return res.json();
}

export async function getComparativeRankingCore(params = {}) {
  const searchParams = buildSearchParams(params);
  const query = searchParams.toString();
  const url = `${API_ENDPOINTS.DASHBOARD}/comparative-ranking/core${query ? `?${query}` : ''}`;
  const res = await authFetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || 'Failed to fetch comparative ranking core data');
  }
  return res.json();
}

export async function getComparativeRankingDimensions(params = {}) {
  const searchParams = buildSearchParams(params);
  const query = searchParams.toString();
  const url = `${API_ENDPOINTS.DASHBOARD}/comparative-ranking/dimensions${query ? `?${query}` : ''}`;
  const res = await authFetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || 'Failed to fetch comparative ranking dimensions data');
  }
  return res.json();
}
