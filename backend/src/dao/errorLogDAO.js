const strategyIds = new Set();

async function initErrorLogTable() {
  return true;
}

async function insertErrorLog({ strategyId, functionName, errorMessage, type }) {
  if (strategyId) strategyIds.add(String(strategyId));
  console.error("[APP_ERROR]", {
    strategyId: strategyId || null,
    functionName: functionName || "LOG_ERROR",
    type: type || null,
    errorMessage: errorMessage || "Unknown error",
  });
  return true;
}

async function getDistinctStrategies() {
  return Array.from(strategyIds);
}

async function clearErrorLogs() {
  strategyIds.clear();
  return true;
}

module.exports = {
  initErrorLogTable,
  insertErrorLog,
  getDistinctStrategies,
  clearErrorLogs,
};
