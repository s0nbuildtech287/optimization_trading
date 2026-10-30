import { useState, useCallback } from 'react';
import { getBehaviorAnalysisData, getBehaviorStrategyDetail } from 'api/dashboard';

export function useBehaviorAnalysis() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchBehaviorAnalysis = useCallback(async (params = {}) => {
    try {
      setLoading(true);
      setError(null);
      const res = await getBehaviorAnalysisData(params);
      return res;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBehaviorStrategyDetail = useCallback(async (params = {}) => {
    try {
      setLoading(true);
      setError(null);
      const res = await getBehaviorStrategyDetail(params);
      return res;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { fetchBehaviorAnalysis, fetchBehaviorStrategyDetail, loading, error };
}

