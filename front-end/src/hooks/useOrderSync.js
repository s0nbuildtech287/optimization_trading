import { useEffect, useState, useRef } from 'react';
import { syncOrder, syncOrderAsync, getSyncStatus, cancelSyncJob } from 'api/order';
import { clearStrategiesCache } from 'hooks/useStrategy';

export default function useOrderSync() {
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  // ✅ NEW: Progress tracking
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState(null);
  const [stats, setStats] = useState(null);
  const [currentSyncId, setCurrentSyncId] = useState(null);
  const [stopping, setStopping] = useState(false);
  const pollingIntervalRef = useRef(null);
  const mountedRef = useRef(true);

  const clearPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      clearPolling();
    };
  }, []);

  // ✅ Sync với async mode (cho production)
  const syncAsync = async ({ tableName, driveFolderUrl, runType, strategyArr = [] }) => {
    setSyncing(true);
    setError(null);
    setResult(null);
    setProgress(0);
    setCurrentFile(null);
    setStats(null);
    setCurrentSyncId(null);
    setStopping(false);
    clearPolling();

    try {
      // Lấy username từ localStorage
      const userStr = localStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;
      const username = user?.username || 'UNKNOWN';

      // ✅ Start async sync
      const { syncId } = await syncOrderAsync({
        tableName,
        driveFolderUrl,
        runType,
        strategyArr,
        username
      });
      setCurrentSyncId(syncId);


      // ✅ Poll for progress
      return new Promise((resolve, reject) => {
        pollingIntervalRef.current = setInterval(async () => {
          try {
            const status = await getSyncStatus(syncId);

            // Update UI
            if (!mountedRef.current) return;

            setProgress(status.progress || 0);
            setCurrentFile(status.currentFile);
            setStats({
              total: status.totalFiles,
              processed: status.processedFiles,
              success: status.successFiles,
              failed: status.failedFiles
            });


            // Check if completed
            if (status.status === 'COMPLETED') {
              clearPolling();
              setSyncing(false);
              setCurrentSyncId(null);
              setStopping(false);
              setResult(status.result);
              if (runType !== 'SUMMARY') {
                clearStrategiesCache(); // ✅ Dữ liệu mới đã sync, xóa cache cũ
                window.dispatchEvent(new CustomEvent('dashboard:data-changed')); // ✅ Notify dashboard tabs
              }
              resolve(status.result);
            } else if (status.status === 'FAILED') {
              clearPolling();
              setSyncing(false);
              setCurrentSyncId(null);
              setStopping(false);
              const err = new Error(status.error || 'Sync failed');
              setError(err.message);
              console.error('❌ Sync failed:', err.message);
              reject(err);
            }
          } catch (err) {
            console.error('Polling error:', err);
            // Continue polling unless it's a fatal error
            if (err.message.includes('not found')) {
              clearPolling();
              setSyncing(false);
              setError(err.message);
              reject(err);
            }
          }
        }, 3000); // Poll every 3 seconds
      });
    } catch (err) {
      setSyncing(false);
      setError(err.message);
      throw err;
    }
  };

  // ✅ Sync đồng bộ (cho local/test - giữ nguyên logic cũ)
  const sync = async ({ tableName, driveFolderUrl, runType, strategyArr = [] }) => {
    setSyncing(true);
    setError(null);
    setResult(null);
    setProgress(0);
    setCurrentFile(null);
    setStats(null);
    clearPolling();

    try {
      // Lấy username từ localStorage
      const userStr = localStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;
      const username = user?.username || 'UNKNOWN';

      const res = await syncOrder({
        tableName,
        driveFolderUrl,
        runType,
        strategyArr,
        username
      });

      setResult(res);
      clearStrategiesCache(); // ✅ Sync xong, xóa cache cũ
      window.dispatchEvent(new CustomEvent('dashboard:data-changed')); // ✅ Notify dashboard tabs
      return res;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setSyncing(false);
    }
  };

  // ✅ Cancel sync (dừng polling)
  const cancelSync = async () => {
    if (!currentSyncId || stopping) return null;
    setStopping(true);
    try {
      return await cancelSyncJob(currentSyncId);
    } catch (err) {
      setStopping(false);
      throw err;
    }
  };

  return {
    sync, // Đồng bộ (cũ)
    syncAsync, // Bất đồng bộ (mới)
    cancelSync, // Cancel
    stopping,
    canCancel: Boolean(currentSyncId),
    syncing, // Đang sync hay không
    progress, // 0-100%
    currentFile, // File đang xử lý
    stats, // { total, processed, success, failed }
    error, // Lỗi nếu có
    result // Kết quả sau khi xong
  };
}
