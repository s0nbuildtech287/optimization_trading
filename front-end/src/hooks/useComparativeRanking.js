import { useCallback, useState } from 'react';
import {
  getComparativeRankingData,
  getComparativeRankingCore,
  getComparativeRankingDimensions
} from 'api/comparative';

export function useComparativeRanking() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [coreLoading, setCoreLoading] = useState(false);
  const [coreError, setCoreError] = useState(null);

  const [dimensionsLoading, setDimensionsLoading] = useState(false);
  const [dimensionsError, setDimensionsError] = useState(null);

  const fetchComparativeRanking = useCallback(async (params = {}) => {
    try {
      setLoading(true);
      setError(null);
      return await getComparativeRankingData(params);
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchComparativeRankingCore = useCallback(async (params = {}) => {
    try {
      setCoreLoading(true);
      setCoreError(null);
      return await getComparativeRankingCore(params);
    } catch (err) {
      setCoreError(err);
      throw err;
    } finally {
      setCoreLoading(false);
    }
  }, []);

  const fetchComparativeRankingDimensions = useCallback(async (params = {}) => {
    try {
      setDimensionsLoading(true);
      setDimensionsError(null);
      return await getComparativeRankingDimensions(params);
    } catch (err) {
      setDimensionsError(err);
      throw err;
    } finally {
      setDimensionsLoading(false);
    }
  }, []);

  return {
    fetchComparativeRanking,
    fetchComparativeRankingCore,
    fetchComparativeRankingDimensions,
    loading,
    error,
    coreLoading,
    coreError,
    dimensionsLoading,
    dimensionsError
  };
}
