import { API_BASE_URL } from 'config';
import { getDemoResponse, isDemoRequest } from './demoMock';

const DEFAULT_TIMEOUT_MS = 180000; // 3 phÃºt

function clearAuthState() {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('auth:expired'));
  }
}

function createTimeoutSignal(signal, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  return { signal: controller.signal, timeoutId };
}

/**
 * Custom fetch wrapper that automatically:
 * 1. Prepends the API_BASE_URL if the URL is relative.
 * 2. Injects the Authorization header with the JWT token from localStorage.
 */
export async function authFetch(url, options = {}) {
  if (isDemoRequest()) return getDemoResponse(url, options);
  const token = localStorage.getItem('authToken');
  const headers = { ...options.headers };
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { signal, timeoutId } = createTimeoutSignal(options.signal, timeoutMs);

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;

  const fetchOptions = { ...options };
  delete fetchOptions.timeoutMs;

  try {
    const response = await fetch(fullUrl, {
      ...fetchOptions,
      headers,
      signal
    });

    // A valid user can receive 403 for an admin-only endpoint. Do not log
    // them out in that case; only an invalid/expired token is a 401.
    if (response.status === 401) {
      clearAuthState();
    }

    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}
