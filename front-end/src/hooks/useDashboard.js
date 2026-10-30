import { useState, useCallback } from 'react';
import { getDashboardData } from 'api/dashboard';

export default function useDashboard() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchDashboard = useCallback(async (params) => {
    try {
      setLoading(true);
      setError(null);
      return await getDashboardData(params);
    } catch (err) {
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        throw err;
      }
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { fetchDashboard, loading, error };
}