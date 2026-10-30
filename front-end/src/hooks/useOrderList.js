import { useState, useCallback } from 'react';
import { getOrderList } from 'api/order';

export default function useOrderList() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchOrderList = useCallback(async (params) => {
    try {
      setLoading(true);
      setError(null);
      return await getOrderList(params);
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { fetchOrderList, loading, error };
}
