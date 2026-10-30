/**
 * Re-export comparative queries from dashboardDao (single source of truth).
 */
const dashboardDao = require('./dashboardDao');

module.exports = {
  getComparativeRankingRawData: dashboardDao.getComparativeRankingRawData,
  getTimeframeDuelData: dashboardDao.getTimeframeDuelData,
  getSymbolAverageData: dashboardDao.getSymbolAverageData,
  getObOsAverageData: dashboardDao.getObOsAverageData
};
