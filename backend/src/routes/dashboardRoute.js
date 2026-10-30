const express = require('express');
const router = express.Router();
const dashboardController = require('../controller/dashboardController');
const { verifyToken, isAdmin } = require('../middlewares/authJwt');
const {
  validateDashboardDateRange,
  validateDashboardSourceSelection,
  verifyBacktestSourceAccess,
} = require('../middlewares/backtestAccess');

router.use(verifyToken);
router.use(validateDashboardDateRange);

const dashboardDataAccess = [validateDashboardSourceSelection, verifyBacktestSourceAccess];

router.get('/dashboard', dashboardDataAccess, dashboardController.getDashboard);
router.get('/dashboard/overview/core', dashboardDataAccess, dashboardController.getDashboardCore);
router.get('/dashboard/overview/monthly-profit', dashboardDataAccess, dashboardController.getDashboardMonthlyProfit);
router.get('/dashboard/overview/top-stats', dashboardDataAccess, dashboardController.getDashboardTopStats);
router.get('/dashboard/overview/yearly-performance', dashboardDataAccess, dashboardController.getDashboardYearlyPerformance);
router.get('/dashboard/overview/behavior-summary', dashboardDataAccess, dashboardController.getDashboardBehaviorSummary);
router.get('/dashboard/overview/comparative', dashboardDataAccess, dashboardController.getDashboardComparative);
router.get('/dashboard/overview/breakdown', dashboardDataAccess, dashboardController.getDashboardBreakdown);
router.post('/dashboard/clear-cache', isAdmin, dashboardController.clearCache);
router.get('/dashboard/cache-stats', isAdmin, dashboardController.getCacheStats);

module.exports = router;
