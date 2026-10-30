// src/hooks/useSystemLogs.js

import { useState, useCallback } from 'react';
import { getLatestBacktestLogs, getTableLogHistory, getAllLogs, cleanupOldLogs } from 'api/systemLog';

export default function useSystemLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Lấy log sync cuối cùng của từng backtest
   */
  const fetchLatestBacktestLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await getLatestBacktestLogs();
      setLogs(data);
      return data;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Lấy lịch sử log của 1 bảng
   */
  const fetchTableHistory = useCallback(async (tableName, limit = 50) => {
    try {
      setLoading(true);
      setError(null);

      return await getTableLogHistory(tableName, limit);
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Lấy tất cả logs
   */
  const fetchAllLogs = useCallback(async (logType = 'SYNC', limit = 100) => {
    try {
      setLoading(true);
      setError(null);

      const data = await getAllLogs(logType, limit);
      setLogs(data);
      return data;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Xóa logs cũ
   */
  const handleCleanupLogs = useCallback(async (daysToKeep = 90) => {
    try {
      setLoading(true);
      setError(null);

      return await cleanupOldLogs(daysToKeep);
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    logs,
    loading,
    error,
    fetchLatestBacktestLogs,
    fetchTableHistory,
    fetchAllLogs,
    handleCleanupLogs
  };
}
