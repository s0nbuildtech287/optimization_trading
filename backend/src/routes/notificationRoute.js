/**
 * src/routes/notificationRoute.js
 * Định nghĩa route API cho Hệ thống Thông báo (Notification Inbox)
 */

const express = require("express");
const router = express.Router();
const notificationController = require("../controller/notificationController");
const { verifyToken } = require("../middlewares/authJwt");

router.get("/notifications", [verifyToken], notificationController.getNotifications);
router.get("/notifications/unread-count", [verifyToken], notificationController.getUnreadCount);
router.get("/notifications/preferences", [verifyToken], notificationController.getPreference);
router.patch("/notifications/preferences", [verifyToken], notificationController.updatePreference);
router.patch("/notifications/read-all", [verifyToken], notificationController.markAllAsRead);
router.post("/notifications/read-all", [verifyToken], notificationController.markAllAsRead);
router.delete("/notifications/all", [verifyToken], notificationController.deleteAllNotifications);
router.patch("/notifications/:id/read", [verifyToken], notificationController.markAsRead);
router.post("/notifications/:id/read", [verifyToken], notificationController.markAsRead);
router.delete("/notifications/:id", [verifyToken], notificationController.deleteNotification);

module.exports = router;
