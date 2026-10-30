const behaviorAnalysisService = require('../service/behaviorAnalysisService');
const { GENERAL } = require('../utils/messages');

const getSourceInput = (req) => req.query.sourceNames || req.query.tableName || 'all_backtests';

const createRequestAbortContext = (res) => {
  const controller = new AbortController();
  let responseFinished = false;
  const onFinish = () => { responseFinished = true; };
  const onClose = () => {
    if (!responseFinished && !res.writableEnded) controller.abort();
  };

  res.once('finish', onFinish);
  res.once('close', onClose);
  return {
    signal: controller.signal,
    cleanup: () => {
      res.removeListener('finish', onFinish);
      res.removeListener('close', onClose);
    }
  };
};

const isRequestAbort = (error) => error?.name === 'AbortError' || error?.code === 'ABORT_ERR' || error?.code === '57014';

const getBehaviorAnalysis = async (req, res) => {
  const { startDate, endDate } = req.query;
  const requestAbort = createRequestAbortContext(res);
  try {
    const data = await behaviorAnalysisService.getBehaviorAnalysisData(getSourceInput(req), startDate, endDate, { signal: requestAbort.signal });
    res.json({ success: true, data });
  } catch (error) {
    if (isRequestAbort(error)) return;
    res.status(500).json({ success: false, error: error.message || GENERAL.INTERNAL_ERROR });
  } finally {
    requestAbort.cleanup();
  }
};

const getBehaviorStrategyDetail = async (req, res) => {
  const requestAbort = createRequestAbortContext(res);
  try {
    const { strategyId } = req.query;
    if (!strategyId) return res.status(400).json({ success: false, error: 'strategyId is required' });
    const data = await behaviorAnalysisService.getBehaviorStrategyDetail(strategyId, getSourceInput(req), { signal: requestAbort.signal });
    res.json({ success: true, data });
  } catch (error) {
    if (isRequestAbort(error)) return;
    res.status(500).json({ success: false, error: error.message || GENERAL.INTERNAL_ERROR });
  } finally {
    requestAbort.cleanup();
  }
};

const getBehaviorCore = async (req, res) => {
  const { startDate, endDate } = req.query;
  const requestAbort = createRequestAbortContext(res);
  try {
    const data = await behaviorAnalysisService.getBehaviorCoreData(getSourceInput(req), startDate, endDate, { signal: requestAbort.signal });
    res.json({ success: true, data });
  } catch (error) {
    if (isRequestAbort(error)) return;
    res.status(500).json({ success: false, error: error.message || GENERAL.INTERNAL_ERROR });
  } finally {
    requestAbort.cleanup();
  }
};

const getBehaviorActivity = async (req, res) => {
  const { startDate, endDate } = req.query;
  const requestAbort = createRequestAbortContext(res);
  try {
    const data = await behaviorAnalysisService.getBehaviorActivityData(getSourceInput(req), startDate, endDate, { signal: requestAbort.signal });
    res.json({ success: true, data });
  } catch (error) {
    if (isRequestAbort(error)) return;
    res.status(500).json({ success: false, error: error.message || GENERAL.INTERNAL_ERROR });
  } finally {
    requestAbort.cleanup();
  }
};

const getBehaviorHoldingRecovery = async (req, res) => {
  const { startDate, endDate } = req.query;
  const requestAbort = createRequestAbortContext(res);
  try {
    const data = await behaviorAnalysisService.getBehaviorHoldingRecoveryData(getSourceInput(req), startDate, endDate, { signal: requestAbort.signal });
    res.json({ success: true, data });
  } catch (error) {
    if (isRequestAbort(error)) return;
    res.status(500).json({ success: false, error: error.message || GENERAL.INTERNAL_ERROR });
  } finally {
    requestAbort.cleanup();
  }
};

const getBehaviorExit = async (req, res) => {
  const { startDate, endDate } = req.query;
  const requestAbort = createRequestAbortContext(res);
  try {
    const data = await behaviorAnalysisService.getBehaviorExitData(getSourceInput(req), startDate, endDate, { signal: requestAbort.signal });
    res.json({ success: true, data });
  } catch (error) {
    if (isRequestAbort(error)) return;
    res.status(500).json({ success: false, error: error.message || GENERAL.INTERNAL_ERROR });
  } finally {
    requestAbort.cleanup();
  }
};

module.exports = {
  getBehaviorAnalysis,
  getBehaviorStrategyDetail,
  getBehaviorCore,
  getBehaviorActivity,
  getBehaviorHoldingRecovery,
  getBehaviorExit
};
