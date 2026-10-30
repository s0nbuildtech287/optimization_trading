const authClients = require("../config/multiServiceAccounts");

const processQueueWithWorkers = async (queue, taskFunction, noAsyncCall, shouldStop = () => false) => {
  let cursor = 0;

  const worker = async (workerId) => {
    while (true) {
      if (shouldStop()) break;
      const currentIndex = cursor++;
      if (currentIndex >= queue.length) break;

      const item = queue[currentIndex];
      try {
        await taskFunction(item);
      } catch (err) {
        if (err?.code === "SYNC_CANCELLED_BY_USER") break;
        console.error(`Worker ${workerId} lỗi sheet=${item.sheetName}:`, err.message);
      }
    }
  };

  const workers = Array.from({ length: noAsyncCall }, (_, i) => worker(i + 1));

  await Promise.all(workers);
};

const buildQueueAndRun = async ({ sheetGroups, filterFn = () => true, taskFunction, noAsyncCall = 8, extraFields = {}, shouldStop }) => {
  if (!Array.isArray(sheetGroups)) {
    throw new Error("sheetGroups phải là một mảng");
  }

  const workerIndex = parseInt(process.env.MACHINE_ID || "0");
  const totalWorkers = parseInt(process.env.TOTAL_MACHINES || "1");
  const filteredSheets = sheetGroups.filter(filterFn).filter((_, idx) => idx % totalWorkers === workerIndex);

  const queue = filteredSheets.map((sheet, idx) => ({
    ...sheet,
    auth: authClients[idx % authClients.length],
    ...extraFields,
  }));

  await processQueueWithWorkers(queue, taskFunction, noAsyncCall, shouldStop);
};

module.exports = {
  processQueueWithWorkers,
  buildQueueAndRun,
};
