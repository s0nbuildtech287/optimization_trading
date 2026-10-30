import { useState, useCallback } from 'react';
import {
  runLotThresholdAnalysis,
  getLotThresholdStatus,
  getLotThresholdResults,
  getLotThresholdOptimal,
  getLotThresholdTimeRange,
  getLotThresholdRuns,
  deleteLotThresholdRun,
  selectLotThresholdCandidate,
  resetLotThresholdCandidate
} from 'api/lotThreshold';

export function useLotThreshold() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchOptimal = useCallback(async (params = {}) => {
    try {
      setLoading(true);
      setError(null);
      const res = await getLotThresholdOptimal(params);
      return res;
    } catch (err) {
      setError(err.message || 'Failed to fetch optimal results');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchResults = useCallback(async (params = {}) => {
    try {
      setLoading(true);
      setError(null);
      const res = await getLotThresholdResults(params);
      return res;
    } catch (err) {
      setError(err.message || 'Failed to fetch analysis details');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTimeRange = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getLotThresholdTimeRange();
      return res;
    } catch (err) {
      setError(err.message || 'Failed to fetch time range');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRuns = useCallback(async (params = {}) => {
    try {
      setLoading(true);
      setError(null);
      return await getLotThresholdRuns(params);
    } catch (err) {
      setError(err.message || 'Failed to fetch analysis runs');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const removeRun = useCallback(async (analysisRunId) => {
    try {
      setError(null);
      return await deleteLotThresholdRun(analysisRunId);
    } catch (err) {
      setError(err.message || 'Failed to delete analysis run');
      throw err;
    }
  }, []);

  const triggerAnalysis = useCallback(async (payload = {}) => {
    try {
      setLoading(true);
      setError(null);
      const res = await runLotThresholdAnalysis(payload);
      return res;
    } catch (err) {
      setError(err.message || 'Failed to trigger lot threshold analysis');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const checkStatus = useCallback(async (syncId) => {
    try {
      setError(null);
      const res = await getLotThresholdStatus(syncId);
      return res;
    } catch (err) {
      setError(err.message || 'Failed to check analysis status');
      throw err;
    }
  }, []);

  const selectCandidate = useCallback(async (payload) => {
    setError(null);
    try {
      return await selectLotThresholdCandidate(payload);
    } catch (err) {
      setError(err.message || 'Failed to select lot threshold candidate');
      throw err;
    }
  }, []);

  const resetCandidate = useCallback(async (payload) => {
    setError(null);
    try {
      return await resetLotThresholdCandidate(payload);
    } catch (err) {
      setError(err.message || 'Failed to reset lot threshold candidate');
      throw err;
    }
  }, []);

  return {
    loading,
    error,
    fetchOptimal,
    fetchResults,
    fetchTimeRange,
    fetchRuns,
    removeRun,
    triggerAnalysis,
    checkStatus,
    selectCandidate,
    resetCandidate
  };
}
