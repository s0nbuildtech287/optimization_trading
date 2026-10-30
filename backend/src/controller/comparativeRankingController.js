const comparativeRankingService = require("../service/comparativeRankingService");
const { GENERAL } = require("../utils/messages");

const getSourceInput = (req) => req.query.sourceNames || req.query.tableName || "all_backtests";

const getComparativeRanking = async (req, res) => {
  const { startDate, endDate } = req.query;
  try {
    const data = await comparativeRankingService.getComparativeRankingData(getSourceInput(req), startDate, endDate);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || GENERAL.INTERNAL_ERROR });
  }
};

const getComparativeRankingCore = async (req, res) => {
  const { startDate, endDate } = req.query;
  try {
    const data = await comparativeRankingService.getComparativeRankingCoreData(getSourceInput(req), startDate, endDate);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || GENERAL.INTERNAL_ERROR });
  }
};

const getComparativeRankingDimensions = async (req, res) => {
  const { startDate, endDate } = req.query;
  try {
    const data = await comparativeRankingService.getComparativeRankingDimensionsData(getSourceInput(req), startDate, endDate);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || GENERAL.INTERNAL_ERROR });
  }
};

module.exports = {
  getComparativeRanking,
  getComparativeRankingCore,
  getComparativeRankingDimensions
};
