import { authFetch } from './authFetch';

const CHECK_FILES_ENDPOINT = '/api/check-files';
const SYNC_STATUS_ENDPOINT = '/api/sync-status';

/**
 * Check files uploaded from local folder (multipart/form-data).
 * @param {File[]} files - Array of File objects
 * @param {{ minProfit: number, minTrades: number, maxLoss: number, enableGroup4: boolean }} config
 */
export const checkFilesLocal = async (files, config) => {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file, file.name);
  }
  formData.append('config', JSON.stringify(config));

  const res = await authFetch(CHECK_FILES_ENDPOINT, {
    method: 'POST',
    body: formData
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
};

/**
 * Check files from a Google Drive folder URL.
 * @param {string} driveUrl - Google Drive folder URL
 * @param {{ minProfit: number, minTrades: number, maxLoss: number, enableGroup4: boolean }} config
 */
export const checkFilesDrive = async (driveUrl, config) => {
  const res = await authFetch(CHECK_FILES_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ driveUrl, config })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
};

/**
 * Poll progress of a running check-files job.
 * Reuses the existing /api/sync-status/:syncId endpoint.
 * @param {string} syncId
 */
export const getCheckProgress = async (syncId) => {
  const res = await authFetch(`${SYNC_STATUS_ENDPOINT}/${syncId}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
};
