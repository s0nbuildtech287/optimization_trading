import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';

// ==============================|| PROTECTED ROUTE ||============================== //

function isTokenExpired(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const payload = JSON.parse(atob(padded));
    return payload.exp ? payload.exp * 1000 <= Date.now() : false;
  } catch {
    return true;
  }
}

function clearAuth() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('user');
}

export default function ProtectedRoute({ children }) {
  const [authExpired, setAuthExpired] = useState(false);
  const token = localStorage.getItem('authToken');

  useEffect(() => {
    const handleAuthExpired = () => setAuthExpired(true);
    window.addEventListener('auth:expired', handleAuthExpired);
    return () => window.removeEventListener('auth:expired', handleAuthExpired);
  }, []);

  if (!token || authExpired || isTokenExpired(token)) {
    clearAuth();
    return <Navigate to="/login" replace />;
  }

  return children;
}
