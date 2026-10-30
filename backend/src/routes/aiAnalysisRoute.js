const express = require("express");
const aiAnalysisController = require("../controller/aiAnalysisController");
const { verifyToken } = require("../middlewares/authJwt");
const { verifyBacktestSourceAccess, validateDashboardDateRange } = require("../middlewares/backtestAccess");

const router = express.Router();

router.get("/dashboard/ai-analysis", [verifyToken, validateDashboardDateRange, verifyBacktestSourceAccess], aiAnalysisController.getAiReport);
router.post("/dashboard/ai-analysis/refresh", [verifyToken, validateDashboardDateRange, verifyBacktestSourceAccess], aiAnalysisController.refreshAiReport);

router.get("/dashboard/remarks", [verifyToken, validateDashboardDateRange, verifyBacktestSourceAccess], aiAnalysisController.getUserRemarks);
router.post("/dashboard/remarks", [verifyToken, validateDashboardDateRange, verifyBacktestSourceAccess], aiAnalysisController.saveUserRemarks);

module.exports = router;
