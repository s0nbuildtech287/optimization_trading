import { authFetch } from './authFetch';

export async function requestOTP(username, email, password) {
  const res = await authFetch('/auth/request-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password })
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to send OTP');
  }

  return res.json();
}

export async function register(username, email, password, otp) {
  const res = await authFetch('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password, otp })
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Registration failed');
  }

  return res.json();
}

export async function login(username, password) {
  const res = await authFetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Login failed');
  }

  return res.json();
}
