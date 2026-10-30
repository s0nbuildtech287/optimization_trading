const riskAnalysisService = require('../service/riskAnalysisService');
const { GENERAL } = require('../utils/messages');

const getSourceInput = (req) => req.query.sourceNames || req.query.tableName || 'all_backtests';

const createRequestAbortContext = (res) => {
  const controller = new AbortController();
  let responseFinished = false;

  const onFinish = () => {
    responseFinished = true;
  };
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

const getRiskAnalysis = async (req, res) => {
  const { startDate, endDate } = req.query;
  const requestAbort = createRequestAbortContext(res);
  try {
    const data = await riskAnalysisService.getRiskAnalysisData(getSourceInput(req), startDate, endDate, { signal: requestAbort.signal });
    res.json({ success: true, data });
  } catch (error) {
    if (isRequestAbort(error)) return;
    res.status(500).json({ success: false, error: error.message || GENERAL.INTERNAL_ERROR });
  } finally {
    requestAbort.cleanup();
  }
};

const getRiskCore = async (req, res) => {
  const { startDate, endDate } = req.query;
  const requestAbort = createRequestAbortContext(res);
  try {
    const data = await riskAnalysisService.getRiskCoreData(getSourceInput(req), startDate, endDate, { signal: requestAbort.signal });
    res.json({ success: true, data });
  } catch (error) {
    if (isRequestAbort(error)) return;
    res.status(500).json({ success: false, error: error.message || GENERAL.INTERNAL_ERROR });
  } finally {
    requestAbort.cleanup();
  }
};

const getRiskMarginExposure = async (req, res) => {
  const { startDate, endDate } = req.query;
  const requestAbort = createRequestAbortContext(res);
  try {
    const data = await riskAnalysisService.getRiskMarginExposureData(getSourceInput(req), startDate, endDate, { signal: requestAbort.signal });
    res.json({ success: true, data });
  } catch (error) {
    if (isRequestAbort(error)) return;
    res.status(500).json({ success: false, error: error.message || GENERAL.INTERNAL_ERROR });
  } finally {
    requestAbort.cleanup();
  }
};

const getRiskDoubleExposure = async (req, res) => {
  const { startDate, endDate } = req.query;
  const requestAbort = createRequestAbortContext(res);
  try {
    const data = await riskAnalysisService.getRiskDoubleExposureData(getSourceInput(req), startDate, endDate, { signal: requestAbort.signal });
    res.json({ success: true, data });
  } catch (error) {
    if (isRequestAbort(error)) return;
    res.status(500).json({ success: false, error: error.message || GENERAL.INTERNAL_ERROR });
  } finally {
    requestAbort.cleanup();
  }
};

const getRiskLightCharts = async (req, res) => {
  const { startDate, endDate } = req.query;
  const requestAbort = createRequestAbortContext(res);
  try {
    const data = await riskAnalysisService.getRiskLightChartsData(getSourceInput(req), startDate, endDate, { signal: requestAbort.signal });
    res.json({ success: true, data });
  } catch (error) {
    if (isRequestAbort(error)) return;
    res.status(500).json({ success: false, error: error.message || GENERAL.INTERNAL_ERROR });
  } finally {
    requestAbort.cleanup();
  }
};

module.exports = {
  getRiskAnalysis,
  getRiskCore,
  getRiskMarginExposure,
  getRiskDoubleExposure,
  getRiskLightCharts
};
