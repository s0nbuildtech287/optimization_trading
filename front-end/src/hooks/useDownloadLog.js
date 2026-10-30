import { useState, useCallback } from 'react';
import { downloadLogFile } from 'api/order';

export default function useDownloadLog() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const downloadLog = useCallback(async (type, syncId = null) => {
    try {
      setLoading(true);
      setError(null);
      
      const blob = await downloadLogFile(type, syncId);
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}.txt`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      return true;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { downloadLog, loading, error };
}
