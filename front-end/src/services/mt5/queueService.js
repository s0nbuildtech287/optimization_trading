import { MT5_QUEUE_BASE, API_BASE_URL, API_ENDPOINTS } from 'config';

function buildHeaders(extraHeaders = {}, includeJson = true) {
  const token = localStorage.getItem('authToken');
  const headers = {
    ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
    ...extraHeaders,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function readJsonResponse(response) {
  let payload = null;

  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload?.error ||
      payload?.message ||
      `Request failed with status ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    err.payload = payload;
    throw err;
  }

  return payload;
}

async function readBlobResponse(response) {
  if (!response.ok) {
    await readJsonResponse(response);
  }

  return response.blob();
}

function buildQuery(params = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    searchParams.set(key, String(value));
  });

  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

const QueueService = {
  async health() {
    const response = await fetch(`${MT5_QUEUE_BASE}/health`, {
      method: 'GET',
      headers: buildHeaders({}, false),
    });
    return readJsonResponse(response);
  },

  async listJobs() {
    const response = await fetch(`${MT5_QUEUE_BASE}/jobs`, {
      method: 'GET',
      headers: buildHeaders({}, false),
    });
    return readJsonResponse(response);
  },

  async listWorkers() {
    const response = await fetch(`${MT5_QUEUE_BASE}/workers`, {
      method: 'GET',
      headers: buildHeaders({}, false),
    });
    return readJsonResponse(response);
  },

  async getJob(externalJobId) {
    const response = await fetch(`${MT5_QUEUE_BASE}/jobs/${encodeURIComponent(externalJobId)}`, {
      method: 'GET',
      headers: buildHeaders({}, false),
    });
    return readJsonResponse(response);
  },

  async uploadBundle({
    externalJobId,
    jobName,
    botName,
    file,
    mode = 'full_pipeline',
    optimizeRuns = 1,
    maxIni = null,
    ownerUserId = null,
    filters = null,
    claimable = false,
  }) {
    const query = buildQuery({
      external_job_id: externalJobId,
      job_name: jobName,
      bot_name: botName,
      filename: file?.name || 'bundle.zip',
      mode,
      optimize_runs: optimizeRuns,
      max_ini: maxIni,
      owner_user_id: ownerUserId,
      filters_json: filters ? JSON.stringify(filters) : null,
      claimable,
    });

    const response = await fetch(`${MT5_QUEUE_BASE}/jobs/upload-bundle${query}`, {
      method: 'POST',
      headers: buildHeaders({}, false),
      body: file,
    });

    return readJsonResponse(response);
  },

  async splitJob(externalJobId) {
    const response = await fetch(`${MT5_QUEUE_BASE}/jobs/${encodeURIComponent(externalJobId)}/split`, {
      method: 'POST',
      headers: buildHeaders({}, false),
    });

    return readJsonResponse(response);
  },

  async requeueJob(externalJobId) {
    const response = await fetch(`${MT5_QUEUE_BASE}/jobs/${encodeURIComponent(externalJobId)}/requeue`, {
      method: 'POST',
      headers: buildHeaders({}, false),
    });

    return readJsonResponse(response);
  },

  async recoverJob(externalJobId) {
    const response = await fetch(`${MT5_QUEUE_BASE}/jobs/${encodeURIComponent(externalJobId)}/recover`, {
      method: 'POST',
      headers: buildHeaders(),
    });

    return readJsonResponse(response);
  },

  async reassignJob(externalJobId, ownerUserId) {
    const response = await fetch(`${MT5_QUEUE_BASE}/jobs/${encodeURIComponent(externalJobId)}/reassign`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ owner_user_id: ownerUserId }),
    });

    return readJsonResponse(response);
  },

  async deleteJob(externalJobId) {
    const response = await fetch(`${MT5_QUEUE_BASE}/jobs/${encodeURIComponent(externalJobId)}`, {
      method: 'DELETE',
      headers: buildHeaders({}, false),
    });

    return readJsonResponse(response);
  },

  async deleteAllJobs() {
    const response = await fetch(`${MT5_QUEUE_BASE}/jobs`, {
      method: 'DELETE',
      headers: buildHeaders({}, false),
    });

    return readJsonResponse(response);
  },

  async drainWorker(workerName) {
    const response = await fetch(`${MT5_QUEUE_BASE}/workers/drain`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ worker_name: workerName }),
    });

    return readJsonResponse(response);
  },

  async resumeWorker(workerName) {
    const response = await fetch(`${MT5_QUEUE_BASE}/workers/resume`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ worker_name: workerName }),
    });

    return readJsonResponse(response);
  },

  async allowWorker(workerName) {
    const response = await fetch(`${MT5_QUEUE_BASE}/workers/allow`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ worker_name: workerName }),
    });

    return readJsonResponse(response);
  },

  async allowAllWorkers(ownerUserId) {
    const response = await fetch(`${MT5_QUEUE_BASE}/workers/allow-all`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ owner_user_id: ownerUserId }),
    });

    return readJsonResponse(response);
  },

  async blockWorker(workerName) {
    const response = await fetch(`${MT5_QUEUE_BASE}/workers/block`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ worker_name: workerName }),
    });

    return readJsonResponse(response);
  },

  async deleteWorker(workerName) {
    const response = await fetch(`${MT5_QUEUE_BASE}/workers/${encodeURIComponent(workerName)}`, {
      method: 'DELETE',
      headers: buildHeaders({}, false),
    });

    return readJsonResponse(response);
  },

    async exportResultReport(externalJobId, sourceResultId) {
    const response = await fetch(
      `${MT5_QUEUE_BASE}/jobs/${encodeURIComponent(externalJobId)}/export-result-report`,
      {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({ source_result_id: sourceResultId }),
      },
    );

    return readJsonResponse(response);
  },

  async getJobStatus(externalJobId) {
    const response = await fetch(
      `${MT5_QUEUE_BASE}/jobs/${encodeURIComponent(externalJobId)}`,
      {
        method: 'GET',
        headers: buildHeaders(),
      },
    );

    return readJsonResponse(response);
  },

  async downloadResult(externalJobId) {
    const response = await fetch(
      `${MT5_QUEUE_BASE}/jobs/${encodeURIComponent(externalJobId)}/artifacts/result`,
      {
        method: 'GET',
        headers: buildHeaders({}, false),
      },
    );

    return readBlobResponse(response);
  },

  async downloadResultIni(externalJobId, sourceResultId) {
    const response = await fetch(
      `${MT5_QUEUE_BASE}/jobs/${encodeURIComponent(externalJobId)}/results/${encodeURIComponent(sourceResultId)}/ini`,
      {
        method: 'GET',
        headers: buildHeaders({}, false),
      },
    );

    return readBlobResponse(response);
  },

  async listOptimizeResults(externalJobId, params = {}) {
    const response = await fetch(
      `${MT5_QUEUE_BASE}/jobs/${encodeURIComponent(externalJobId)}/optimize-results${buildQuery(params)}`,
      {
        method: 'GET',
        headers: buildHeaders(),
      },
    );

    return readJsonResponse(response);
  },

  async getOptimizeResults(externalJobId, params = {}) {
    return this.listOptimizeResults(externalJobId, params);
  },

  async getOptimizeResultsBatchSummary(jobIds = [], options = {}) {
    if (!Array.isArray(jobIds) || jobIds.length === 0) return { success: true, summaries: [] };

    const response = await fetch(`${MT5_QUEUE_BASE}/optimize-results/summary`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        job_ids: jobIds,
        filters: options.filters || {},
        options,
      }),
    });
    return readJsonResponse(response);
  },

  async getOtmRequestStatus(externalJobId, requestId) {
    const response = await fetch(
      `${MT5_QUEUE_BASE}/jobs/${encodeURIComponent(externalJobId)}/otm-requests/${encodeURIComponent(requestId)}`,
      {
        method: 'GET',
        headers: buildHeaders(),
      },
    );
    return readJsonResponse(response);
  },

  async getActiveOtmRequest(externalJobId) {
    const response = await fetch(
      `${MT5_QUEUE_BASE}/jobs/${encodeURIComponent(externalJobId)}/otm-requests/active`,
      {
        method: 'GET',
        headers: buildHeaders(),
      },
    );
    return readJsonResponse(response);
  },

  async getOptimizeResultsWithPolling(externalJobId, params = {}, onStatusUpdate = null) {
    const initial = await this.getOptimizeResults(externalJobId, params);

    // If already ready or contains results array directly
    if (initial?.status === 'READY' || Array.isArray(initial?.results)) {
      return initial;
    }

    // Polling mode if queued or running
    const requestId = initial?.request_id;
    if (!requestId) return initial;

    let currentStatus = initial?.status || 'QUEUED';
    if (onStatusUpdate) onStatusUpdate(currentStatus, requestId, initial);

    while (currentStatus === 'QUEUED' || currentStatus === 'RUNNING') {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      try {
        const pollRes = await this.getOtmRequestStatus(externalJobId, requestId);
        currentStatus = pollRes?.status || 'FAILED';
        if (onStatusUpdate) onStatusUpdate(currentStatus, requestId, pollRes);

        if (currentStatus === 'READY') {
          return {
            results: pollRes.results || [],
            request_id: requestId,
            status: 'READY',
            metrics: pollRes.metrics,
          };
        } else if (currentStatus === 'FAILED' || currentStatus === 'CANCELLED') {
          throw new Error(pollRes.error || `OTM calculation ${currentStatus}`);
        }
      } catch (err) {
        if (err.message && err.message.includes('OTM calculation')) throw err;
        // Continue polling if network glitch
      }
    }

    return initial;
  },

  async getBacktestResults(externalJobId) {
    const response = await fetch(
      `${MT5_QUEUE_BASE}/jobs/${encodeURIComponent(externalJobId)}/backtest-results`,
      {
        method: 'GET',
        headers: buildHeaders(),
      },
    );

    return readJsonResponse(response);
  },

  async refilterAllJobs(filters = {}, jobIds = null) {
    const response = await fetch(`${MT5_QUEUE_BASE}/jobs/refilter-all`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ filters: { ...filters, ...(Array.isArray(jobIds) ? { job_ids: jobIds } : {}) } }),
    });

    return readJsonResponse(response);
  },

  async rerunOpenPriceJob(externalJobId, optimizeRuns, filters = {}, otmConfig = null) {
    const response = await fetch(`${MT5_QUEUE_BASE}/jobs/${encodeURIComponent(externalJobId)}/rerun-open-price`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ optimize_runs: optimizeRuns, filters, otm_config: otmConfig }),
    });
    return readJsonResponse(response);
  },

  async updateOtmConfig(externalJobId, config = {}) {
    const response = await fetch(`${MT5_QUEUE_BASE}/jobs/${encodeURIComponent(externalJobId)}/otm-config`, {
      method: 'PATCH',
      headers: buildHeaders(),
      body: JSON.stringify({ config }),
    });
    return readJsonResponse(response);
  },

  async exportJobs(format = 'csv') {
    const response = await fetch(`${MT5_QUEUE_BASE}/jobs/export${buildQuery({ format })}`, {
      method: 'GET',
      headers: buildHeaders({}, false),
    });

    if (format === 'json') {
      return readJsonResponse(response);
    }

    return readBlobResponse(response);
  },

  async syncEveryTickToDb(externalJobId, tableName) {
    const token = localStorage.getItem('authToken');
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const response = await fetch(
      `${API_BASE_URL}${API_ENDPOINTS.SYNC_EVERY_TICK_TO_DB}/${encodeURIComponent(externalJobId)}/sync-to-db`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ tableName }),
      }
    );

    return readJsonResponse(response);
  },

  async createAutoEveryTickBatch(payload = {}) {
    const normalizedPayload = {
      ...payload,
      target_backtest_table: payload.target_backtest_table ?? payload.targetBacktestTable,
      largest_loss_threshold: payload.largest_loss_threshold ?? payload.largestLossThreshold,
      max_rank_to_try: payload.max_rank_to_try ?? payload.maxRankToTry,
      source_mode: payload.source_mode ?? payload.sourceMode,
      source_job_ids: payload.source_job_ids ?? payload.sourceJobIds,
      run_full_candidates: payload.run_full_candidates ?? payload.runFullCandidates,
      use_stable_filter: payload.use_stable_filter ?? payload.useStableFilter,
    };
    const response = await fetch(`${MT5_QUEUE_BASE}/auto-every-tick`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(normalizedPayload),
    });
    return readJsonResponse(response);
  },

  async getAutoEveryTickBatch(batchId) {
    const response = await fetch(`${MT5_QUEUE_BASE}/auto-every-tick/${encodeURIComponent(batchId)}`, {
      method: 'GET',
      headers: buildHeaders({}, false),
    });
    const payload = await readJsonResponse(response);
    return payload?.batch || payload;
  },

  async cancelAutoEveryTickBatch(batchId) {
    const response = await fetch(`${MT5_QUEUE_BASE}/auto-every-tick/${encodeURIComponent(batchId)}/cancel`, {
      method: 'POST',
      headers: buildHeaders(),
    });
    return readJsonResponse(response);
  },

  async listAutoEveryTickBatches() {
    const response = await fetch(`${MT5_QUEUE_BASE}/auto-every-tick`, {
      method: 'GET',
      headers: buildHeaders({}, false),
    });
    return readJsonResponse(response);
  },

  async syncAutoEveryTickBatch(batchId, itemsToSync = [], overrideTargetTable = null) {
    const response = await fetch(`${MT5_QUEUE_BASE}/auto-every-tick/${encodeURIComponent(batchId)}/sync`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ itemsToSync, ...(overrideTargetTable ? { overrideTargetTable } : {}) }),
    });
    const payload = await readJsonResponse(response);
    return payload?.batch || payload;
  },

  async deleteAutoEveryTickBatch(batchId, force = false) {
    const response = await fetch(`${MT5_QUEUE_BASE}/auto-every-tick/${encodeURIComponent(batchId)}`, {
      method: 'DELETE',
      headers: buildHeaders(),
      body: JSON.stringify({ force }),
    });
    return readJsonResponse(response);
  },

  // Phase 10: Manual Override — chon thu cong mot attempt Failed de Sync
  async selectManualOverrideAttempt(batchId, { sourceJobId, selectedEveryTickJobId, selectedAttemptRank, selectedResultId, manualSyncReason } = {}) {
    const response = await fetch(`${MT5_QUEUE_BASE}/auto-every-tick/${encodeURIComponent(batchId)}/select-attempt`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ sourceJobId, selectedEveryTickJobId, selectedAttemptRank, selectedResultId, manualSyncReason }),
    });
    return readJsonResponse(response);
  },

  async clearManualOverrideSelection(batchId, sourceJobId) {
    const response = await fetch(`${MT5_QUEUE_BASE}/auto-every-tick/${encodeURIComponent(batchId)}/clear-selection`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ sourceJobId }),
    });
    return readJsonResponse(response);
  },

  async updateAutoEveryTickBatchNote(batchId, note) {
    const response = await fetch(`${MT5_QUEUE_BASE}/auto-every-tick/${encodeURIComponent(batchId)}/note`, {
      method: 'PATCH',
      headers: buildHeaders(),
      body: JSON.stringify({ note }),
    });
    return readJsonResponse(response);
  },

  async getAutoEveryTickBatchDateRange(batchId, { mode = 'full', from = '', to = '' } = {}) {
    const params = new URLSearchParams({ mode });
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    const response = await fetch(`${MT5_QUEUE_BASE}/auto-every-tick/batches/${encodeURIComponent(batchId)}/date-range?${params.toString()}`, {
      method: 'GET',
      headers: buildHeaders(),
    });
    return readJsonResponse(response);
  },
};

export default QueueService;
