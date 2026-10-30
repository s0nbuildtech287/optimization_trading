// server/routes/systemLogRoute.js

const express = require("express");
const router = express.Router();
const systemLogController = require("../controller/systemLogController");
const { verifyToken, isAdmin } = require("../middlewares/authJwt");

// GET: Lấy log sync cuối cùng của từng backtest
router.get("/latest-backtest", verifyToken, systemLogController.getLatestBacktestLogs);

// GET: Lấy lịch sử log của 1 bảng
router.get("/history/:tableName", verifyToken, systemLogController.getTableLogHistory);

// GET: Lấy tất cả logs (có filter)
router.get("/all", verifyToken, systemLogController.getAllLogs);

// DELETE: Cleanup logs cũ (admin)
router.delete("/cleanup", [verifyToken, isAdmin], systemLogController.cleanupOldLogs);

// GET: Lấy activity logs trong 3 tháng
router.get("/activity/:tableName", verifyToken, systemLogController.getActivityLogs);

// GET: Tải issue TXT theo đúng lần sync
router.get("/sync-jobs/:syncId/issues/:issueType/download", verifyToken, systemLogController.downloadSyncJobIssues);

// DELETE: Xóa logs của 1 bảng backtest
router.delete("/table/:tableName", [verifyToken, isAdmin], systemLogController.deleteLogsByTable);

module.exports = router;
