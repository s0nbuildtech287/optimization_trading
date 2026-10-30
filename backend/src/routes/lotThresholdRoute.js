// ============================================
// FILE: routes/lotThresholdRoute.js
// Lot Threshold Analysis - Routes
// ============================================
const express = require("express");
const router = express.Router();
const lotThresholdController = require("../controller/lotThresholdController");
const { verifyToken } = require("../middlewares/authJwt");

// POST /api/lot-threshold/run — Trigger analysis (async)
router.post("/run", verifyToken, lotThresholdController.runAnalysis);

// GET /api/lot-threshold/status/:syncId — Polling progress
router.get("/status/:syncId", verifyToken, lotThresholdController.getStatus);

// GET /api/lot-threshold/results — Lấy kết quả (phân trang + filter)
router.get("/results", verifyToken, lotThresholdController.getResults);

// GET /api/lot-threshold/optimal — Lấy optimal lot threshold per strategy
router.get("/optimal", verifyToken, lotThresholdController.getOptimalResults);

// GET /api/lot-threshold/time-range — Lấy khoảng thời gian đặc quánh
router.get("/time-range", verifyToken, lotThresholdController.getTimeRange);

// GET /api/lot-threshold/runs — Danh sách các lần chạy Volume Optimization
router.get("/runs", verifyToken, lotThresholdController.getRuns);

router.put("/selection", verifyToken, lotThresholdController.selectCandidate);
router.post("/selection/reset", verifyToken, lotThresholdController.resetCandidate);

// DELETE /api/lot-threshold/runs/:analysisRunId — Xóa một lần phân tích và kết quả của nó
router.delete("/runs/:analysisRunId", verifyToken, lotThresholdController.deleteRun);

module.exports = router;
