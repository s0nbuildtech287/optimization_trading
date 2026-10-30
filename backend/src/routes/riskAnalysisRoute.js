const express = require('express');
const router = express.Router();
const riskAnalysisController = require('../controller/riskAnalysisController');
const { verifyToken } = require('../middlewares/authJwt');
const {
  validateDashboardDateRange,
  validateDashboardSourceSelection,
  verifyBacktestSourceAccess,
} = require('../middlewares/backtestAccess');

router.use(verifyToken);
router.use(validateDashboardDateRange);

const dashboardDataAccess = [validateDashboardSourceSelection, verifyBacktestSourceAccess];

router.get('/dashboard/risk-analysis', dashboardDataAccess, riskAnalysisController.getRiskAnalysis);
router.get('/dashboard/risk-analysis/core', dashboardDataAccess, riskAnalysisController.getRiskCore);
router.get('/dashboard/risk-analysis/margin-exposure', dashboardDataAccess, riskAnalysisController.getRiskMarginExposure);
router.get('/dashboard/risk-analysis/double-exposure', dashboardDataAccess, riskAnalysisController.getRiskDoubleExposure);
router.get('/dashboard/risk-analysis/light-charts', dashboardDataAccess, riskAnalysisController.getRiskLightCharts);

module.exports = router;
