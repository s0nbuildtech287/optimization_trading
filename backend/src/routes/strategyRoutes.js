// server/routes/strategyRoutes.js

const express = require("express");
const router = express.Router();
const strategyController = require("../controller/strategyController");
const { verifyToken, isAdmin } = require("../middlewares/authJwt");

/**
 * GET /api/strategies
 * Lấy danh sách strategies có phân trang và filter
 */
router.get("/", verifyToken, strategyController.getStrategies);

/**
 * POST /api/strategies/cache/clear
 * ✅ Xóa backend in-memory cache (dùng khi xóa dữ liệu trực tiếp từ DB)
 * MUST be before /:strategyId route
 */
router.post("/cache/clear", [verifyToken, isAdmin], strategyController.clearCache);

/**
 * GET /api/strategies/by-time-range
 * ✅ NEW: Lấy strategies theo khoảng thời gian với tính toán P/D, drawdown
 * MUST be before /:strategyId route
 */
router.get("/by-time-range", verifyToken, strategyController.getStrategies);

/**
 * GET /api/strategies/ids
 * ✅ NEW: Lấy ONLY strategy IDs (optimized for copy) - MUST be before /:strategyId route
 */
router.get("/ids", verifyToken, strategyController.getStrategyIdsOnly);

/**
 * GET /api/strategies/symbols/distinct
 * Lấy danh sách symbols duy nhất
 */
router.get("/symbols/distinct", verifyToken, strategyController.getDistinctSymbols);

/**
 * GET /api/strategies/statistics/summary
 * Lấy thống kê tổng quan
 */
router.get("/statistics/summary", verifyToken, strategyController.getStatistics);

/**
 * GET /api/strategies/sheet/download/:sheetId
 * ✅ Download Google Sheet as xlsx via service account
 * MUST be before /:strategyId route
 */
router.get("/sheet/download/:sheetId", verifyToken, strategyController.downloadSheet);

router.get("/service-accounts", [verifyToken, isAdmin], strategyController.getServiceAccountEmails);

router.post("/get-from-folder", verifyToken, strategyController.getStrategyIdsFromFolder);

/**
 * GET /api/strategies/:strategyId/:backtestTable
 * Lấy thông tin chi tiết 1 strategy (settings & results)
 */
router.get("/:strategyId/:backtestTable", verifyToken, strategyController.getStrategyDetail);

/**
 * DELETE /api/strategies/:strategyId
 * Xóa 1 strategy
 */
router.delete("/:strategyId/:backtestTable", verifyToken, strategyController.deleteStrategy);
router.delete("/:strategyId", verifyToken, strategyController.deleteStrategy);

/**
 * GET /api/strategies/service-accounts
 * Lấy danh sách service account emails
 */
// Defined above dynamic routes.

/**
 * POST /api/strategies/get-from-folder
 * Lấy strategy IDs (sheet names) từ Google Drive folder
 * Note: Không cần authentication để tiện dùng
 */
// Defined above dynamic routes.

/**
 * GET  /api/strategies/preferences  - Lấy filter preferences của user
 * PUT  /api/strategies/preferences  - Lưu filter preferences của user
 */
router.get("/preferences", verifyToken, strategyController.getPreferences);
router.put("/preferences", verifyToken, strategyController.savePreferences);

module.exports = router;
