// src/hooks/useActivityLogs.js

import { useState, useEffect } from 'react';
import { getActivityLogs } from 'api/systemLog';

/**
 * Custom hook để fetch activity logs cho một bảng backtest
 * @param {string} tableName - Tên bảng backtest (backtest1, backtest2, etc.)
 * @param {boolean} autoFetch - Tự động fetch khi mount (default: true)
 */
export const useActivityLogs = (tableName, autoFetch = true) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchLogs = async () => {
    if (!tableName) {
      setLogs([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await getActivityLogs(tableName);
      setLogs(data || []);
    } catch (err) {
      setError(err.message);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoFetch && tableName) {
      fetchLogs();
    }
  }, [tableName, autoFetch]);

  return {
    logs,
    loading,
    error,
    refetch: fetchLogs
  };
};
