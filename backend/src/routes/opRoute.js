const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB per file
});
const {
  syncSheet,
  syncSheetAsync,
  getSyncStatus,
  cancelSync,
  dropTable,
  clearData,
  updateRow,
  getPagedData,
  getOrderTotals,
  downloadLog,
  getFilterOptions,
  getBalanceChart,
  getBacktestTables,
  getDataSources,
  createBacktestTable,
  deleteBacktestTable,
  assignBacktestTableOwner,
  checkFiles,
  getDriveSummary,
  getStrategyFileCheck,
} = require("../controller/opController");
const { verifyToken, isAdmin, isUser } = require("../middlewares/authJwt");

/**
 * @swagger
 * /sync-sheet:
 *   post:
 *     summary: Đồng bộ nhiều Google Sheet vào DB
 *     tags: [Sheet]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               SheetURLs:
 *                 type: array
 *                 description: Danh sách URL Google Sheet
 *                 items:
 *                   type: string
 *                   example: "https://docs.google.com/spreadsheets/d/11yBNGnuNQvKakqh_4U6gWoY1OuLbYEKq87NEWNZCBuQ/edit#gid=0"
 *               TableName:
 *                 type: string
 *                 description: Tên bảng trong database
 *                 example: "backtest1"
 *               IsClearData:
 *                 type: boolean
 *                 description: Có xoá dữ liệu cũ trước khi insert không
 *                 example: true
 *               RunType:
 *                 type: string
 *                 enum: [NEW_RUN, UPDATE]
 *                 description: Kiểu chạy đồng bộ
 *                 example: "NEW_RUN"
 *               StrategyArr:
 *                 type: array
 *                 nullable: true
 *                 description: Danh sách strategy (hoặc null)
 *                 items:
 *                   oneOf:
 *                     - type: string
 *                     - type: integer
 *                 example: ["strategy1", "strategy3"]
 *     responses:
 *       200:
 *         description: Sync thành công
 */
router.post("/sync-sheet", verifyToken, syncSheet);

// Endpoint đồng bộ dữ liệu bất đồng bộ
router.post("/sync-sheet-async", verifyToken, syncSheetAsync);

// Endpoint kiểm tra tiến độ đồng bộ (polling)
router.get("/sync-status/:syncId", verifyToken, getSyncStatus);
router.post("/sync-status/:syncId/cancel", verifyToken, cancelSync);

/**
 * @swagger
 * /clear-table:
 *   delete:
 *     summary: Xoá hẳn table
 *     tags: [Sheet]
 *     responses:
 *       200:
 *         description: Table đã được xoá
 */
router.delete("/clear-table", [verifyToken, isAdmin], dropTable);

/**
 * @swagger
 * /clear-data:
 *   delete:
 *     summary: Xoá dữ liệu trong table (giữ table)
 *     tags: [Sheet]
 *     responses:
 *       200:
 *         description: Dữ liệu đã được xoá
 */
router.delete("/clear-data", [verifyToken, isAdmin], clearData);

/**
 * @swagger
 * /update-row:
 *   post:
 *     summary: Update một dòng trong table
 *     tags: [Sheet]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             example:
 *               id: 1
 *               value: "new value"
 *     responses:
 *       200:
 *         description: Dòng đã được cập nhật
 */
router.post("/update-row", verifyToken, updateRow);

/**
 * @swagger
 * /api/data:
 *   get:
 *     summary: Lấy dữ liệu bảng backtest phân trang
 *     tags: [Sheet]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *         description: Trang hiện tại
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           example: 50
 *         description: Số dòng mỗi trang
 *       - in: query
 *         name: filter
 *         style: deepObject
 *         explode: true
 *         schema:
 *           type: object
 *           properties:
 *             strategy_id:
 *               type: string
 *               example: "string"
 *             symbol:
 *               type: string
 *               example: "string"
 *             year:
 *               type: integer
 *               example: 2023
 *             search:
 *               type: string
 *               example: "string"
 *         description: Bộ lọc dữ liệu
 *     responses:
 *       200:
 *         description: Trả về dữ liệu backtest theo phân trang
 */
// Lấy tổng số lượng (chạy song song để tối ưu tốc độ tải frontend)
// Phải khai báo trước /data để tránh xung đột route
router.get("/data/totals", verifyToken, getOrderTotals);

router.get("/data", verifyToken, getPagedData);

/**
 * @swagger
 * /download-log:
 *   get:
 *     summary: Tải file log (duplicate.txt, error.txt, hoặc notfound.txt)
 *     tags: [Sheet]
 *     parameters:
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [duplicate, error, notfound]
 *           example: "duplicate"
 *         description: Loại file log muốn tải
 *     responses:
 *       200:
 *         description: File log
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       404:
 *         description: File không tồn tại
 */
router.get("/download-log", verifyToken, downloadLog);

/**
 * @swagger
 * /api/filter-options:
 *   get:
 *     summary: Get filter options for backtest data
 *     tags: [Sheet]
 *     parameters:
 *       - in: query
 *         name: tableName
 *         schema:
 *           type: string
 *           example: "all_backtests"
 *         description: Tên bảng cần lấy filter options
 *     responses:
 *       200:
 *         description: Filter options
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 year:
 *                   type: array
 *                   items:
 *                     type: integer
 *                 symbol:
 *                   type: array
 *                   items:
 *                     type: string
 *                 strategyIds:
 *                   type: array
 *                   items:
 *                     type: string
 */
router.get("/filter-options", verifyToken, getFilterOptions);

/**
 * @swagger
 * /balance-chart/{tableName}/{strategyId}:
 *   get:
 *     summary: Lấy dữ liệu biểu đồ balance cho strategy
 *     tags: [Chart]
 *     parameters:
 *       - in: path
 *         name: tableName
 *         required: true
 *         schema:
 *           type: string
 *         description: Tên bảng backtest
 *       - in: path
 *         name: strategyId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của strategy
 *       - in: query
 *         name: initialDeposit
 *         schema:
 *           type: number
 *           default: 1000000
 *         description: Số tiền deposit ban đầu
 *     responses:
 *       200:
 *         description: Dữ liệu biểu đồ balance
 */
router.get("/balance-chart/:tableName/:strategyId", verifyToken, getBalanceChart);

// ─── BACKTEST TABLE MANAGEMENT ─────────────────────────────────────────────────
/**
 * @swagger
 * /backtest-tables:
 *   get:
 *     summary: Get all backtest tables
 *     tags: [Backtest]
 *     responses:
 *       200:
 *         description: List of backtest tables
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 tables:
 *                   type: array
 *                   items:
 *                     type: string
 *                 count:
 *                   type: number
 */
router.get("/backtest-tables", verifyToken, getBacktestTables);
router.get("/data-sources", verifyToken, getDataSources);

/**
 * @swagger
 * /backtest-tables:
 *   post:
 *     summary: Create new backtest table
 *     tags: [Backtest]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tableName:
 *                 type: string
 *                 description: Name of the table to create (must start with "backtest")
 *                 example: "backtestusd"
 *     responses:
 *       200:
 *         description: Table created successfully
 *       400:
 *         description: Invalid table name
 *       500:
 *         description: Error creating table
 */
router.post("/backtest-tables", verifyToken, createBacktestTable);
router.delete("/backtest-tables/:tableName", verifyToken, deleteBacktestTable);
router.patch("/data-sources/:sourceName/owner", [verifyToken, isAdmin], assignBacktestTableOwner);

// ─── CHECK FILES ──────────────────────────────────────────────────
// Mode Local: gửi files qua multipart/form-data
// Mode Drive: gửi JSON { driveUrl, config }
router.post("/check-files", verifyToken, upload.array("files"), checkFiles);
router.post("/drive-summary-async", verifyToken, getDriveSummary);

// ─── STRATEGY FILE CHECK ──────────────────────────────────────────
router.get("/strategy-file-check", verifyToken, getStrategyFileCheck);

module.exports = router;
