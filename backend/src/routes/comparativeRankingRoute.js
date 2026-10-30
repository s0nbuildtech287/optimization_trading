const express = require("express");
const comparativeRankingController = require("../controller/comparativeRankingController");
const { verifyToken } = require('../middlewares/authJwt');
const {
  validateDashboardDateRange,
  validateDashboardSourceSelection,
  verifyBacktestSourceAccess,
} = require('../middlewares/backtestAccess');

const router = express.Router();

router.use(verifyToken);
router.use(validateDashboardDateRange);

const dashboardDataAccess = [validateDashboardSourceSelection, verifyBacktestSourceAccess];

router.get("/dashboard/comparative-ranking", dashboardDataAccess, comparativeRankingController.getComparativeRanking);
router.get("/dashboard/comparative-ranking/core", dashboardDataAccess, comparativeRankingController.getComparativeRankingCore);
router.get("/dashboard/comparative-ranking/dimensions", dashboardDataAccess, comparativeRankingController.getComparativeRankingDimensions);

module.exports = router;
