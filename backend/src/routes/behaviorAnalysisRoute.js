const express = require('express');
const router = express.Router();
const behaviorAnalysisController = require('../controller/behaviorAnalysisController');
const { verifyToken } = require('../middlewares/authJwt');
const {
  validateDashboardDateRange,
  validateDashboardSourceSelection,
  verifyBacktestSourceAccess,
} = require('../middlewares/backtestAccess');

router.use(verifyToken);
router.use(validateDashboardDateRange);

const dashboardDataAccess = [validateDashboardSourceSelection, verifyBacktestSourceAccess];

router.get('/dashboard/behavior-analysis', dashboardDataAccess, behaviorAnalysisController.getBehaviorAnalysis);
router.get('/dashboard/behavior-analysis/strategy-detail', dashboardDataAccess, behaviorAnalysisController.getBehaviorStrategyDetail);
router.get('/dashboard/behavior-analysis/core', dashboardDataAccess, behaviorAnalysisController.getBehaviorCore);
router.get('/dashboard/behavior-analysis/activity', dashboardDataAccess, behaviorAnalysisController.getBehaviorActivity);
router.get('/dashboard/behavior-analysis/holding-recovery', dashboardDataAccess, behaviorAnalysisController.getBehaviorHoldingRecovery);
router.get('/dashboard/behavior-analysis/exit', dashboardDataAccess, behaviorAnalysisController.getBehaviorExit);

module.exports = router;
