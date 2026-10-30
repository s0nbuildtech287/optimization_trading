/**
 * src/controller/notificationController.js
 * Controller xử lý các request API thông báo cho frontend Header Inbox
 */

const notificationService = require("../service/notificationService");
const db = require("../models");
const User = db.User;
const Role = db.Role;

/**
 * Helper kiểm tra người dùng có quyền Admin hay không
 */
async function checkIsAdmin(userId) {
  if (!userId) return false;
  try {
    const user = await User.findByPk(userId, {
      include: [{ model: Role }],
    });
    if (!user || !user.Role) return false;
    return user.Role.name === "admin";
  } catch (err) {
    console.error("[NOTIFICATION CONTROLLER] Error checking admin role:", err.message);
    return false;
  }
}

/**
 * GET /api/notifications
 * Lấy danh sách thông báo của user (Admin lấy tất cả)
 */
async function getNotifications(req, res) {
  try {
    const userId = req.userId;
    const isAdmin = await checkIsAdmin(userId);
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const offset = parseInt(req.query.offset) || 0;
    const unreadOnly = req.query.unread_only === "true" || req.query.unreadOnly === "true";

    const notifications = await notificationService.getUserNotifications({
      userId,
      isAdmin,
      limit,
      offset,
      unreadOnly,
    });

    const unreadCount = await notificationService.getUnreadCount({ userId, isAdmin });

    return res.status(200).json({
      success: true,
      notifications,
      unread_count: unreadCount,
    });
  } catch (err) {
    console.error("[NOTIFICATION CONTROLLER] Error getNotifications:", err.message);
    return res.status(500).json({
      success: false,
      error: "Không thể lấy danh sách thông báo.",
    });
  }
}

/**
 * GET /api/notifications/unread-count
 * Lấy số lượng thông báo chưa đọc
 */
async function getUnreadCount(req, res) {
  try {
    const userId = req.userId;
    const isAdmin = await checkIsAdmin(userId);

    const unreadCount = await notificationService.getUnreadCount({ userId, isAdmin });

    return res.status(200).json({
      success: true,
      unread_count: unreadCount,
    });
  } catch (err) {
    console.error("[NOTIFICATION CONTROLLER] Error getUnreadCount:", err.message);
    return res.status(500).json({
      success: false,
      error: "Không thể đếm thông báo chưa đọc.",
    });
  }
}

async function getPreference(req, res) {
  try {
    const enabled = await notificationService.getNotificationPreference({ userId: req.userId });
    return res.status(200).json({ success: true, enabled });
  } catch (err) {
    console.error("[NOTIFICATION CONTROLLER] Error getPreference:", err.message);
    return res.status(500).json({ success: false, error: "Cannot load notification preference." });
  }
}

async function updatePreference(req, res) {
  try {
    if (typeof req.body?.enabled !== "boolean") {
      return res.status(400).json({ success: false, error: "enabled must be a boolean." });
    }

    const preference = await notificationService.setNotificationPreference({
      userId: req.userId,
      enabled: req.body.enabled,
    });

    if (!preference) {
      return res.status(404).json({ success: false, error: "User not found." });
    }

    return res.status(200).json({ success: true, enabled: preference.enabled !== false });
  } catch (err) {
    console.error("[NOTIFICATION CONTROLLER] Error updatePreference:", err.message);
    return res.status(500).json({ success: false, error: "Cannot update notification preference." });
  }
}

/**
 * PATCH /api/notifications/:id/read
 * Đánh dấu 1 thông báo là đã đọc
 */
async function markAsRead(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const isAdmin = await checkIsAdmin(userId);

    const updated = await notificationService.markNotificationAsRead({
      id,
      userId,
      isAdmin,
    });

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: "Thông báo không tồn tại hoặc bạn không có quyền truy cập.",
      });
    }

    const unreadCount = await notificationService.getUnreadCount({ userId, isAdmin });

    return res.status(200).json({
      success: true,
      notification: updated,
      unread_count: unreadCount,
    });
  } catch (err) {
    console.error("[NOTIFICATION CONTROLLER] Error markAsRead:", err.message);
    return res.status(500).json({
      success: false,
      error: "Không thể cập nhật trạng thái thông báo.",
    });
  }
}

/**
 * PATCH /api/notifications/read-all
 * Đánh dấu tất cả thông báo là đã đọc
 */
async function markAllAsRead(req, res) {
  try {
    const userId = req.userId;
    const isAdmin = await checkIsAdmin(userId);

    const affected = await notificationService.markAllNotificationsAsRead({
      userId,
      isAdmin,
    });

    return res.status(200).json({
      success: true,
      affected,
      unread_count: 0,
    });
  } catch (err) {
    console.error("[NOTIFICATION CONTROLLER] Error markAllAsRead:", err.message);
    return res.status(500).json({
      success: false,
      error: "Không thể đánh dấu tất cả đã đọc.",
    });
  }
}

/**
 * DELETE /api/notifications/:id
 * Xóa một notification trong phạm vi quyền của user hiện tại.
 */
async function deleteNotification(req, res) {
  try {
    const userId = req.userId;
    const isAdmin = await checkIsAdmin(userId);
    const deleted = await notificationService.deleteNotification({
      id: req.params.id,
      userId,
      isAdmin,
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: "Thông báo không tồn tại hoặc bạn không có quyền xóa.",
      });
    }

    const unreadCount = await notificationService.getUnreadCount({ userId, isAdmin });
    return res.status(200).json({ success: true, id: deleted.id, unread_count: unreadCount });
  } catch (err) {
    console.error("[NOTIFICATION CONTROLLER] Error deleteNotification:", err.message);
    return res.status(500).json({ success: false, error: "Không thể xóa thông báo." });
  }
}

/**
 * DELETE /api/notifications/all
 * Xóa toàn bộ notification trong phạm vi quyền của user hiện tại.
 */
async function deleteAllNotifications(req, res) {
  try {
    const userId = req.userId;
    const isAdmin = await checkIsAdmin(userId);
    const deletedCount = await notificationService.deleteAllNotifications({ userId, isAdmin });
    return res.status(200).json({ success: true, deleted_count: deletedCount, unread_count: 0 });
  } catch (err) {
    console.error("[NOTIFICATION CONTROLLER] Error deleteAllNotifications:", err.message);
    return res.status(500).json({ success: false, error: "Không thể xóa tất cả thông báo." });
  }
}

module.exports = {
  getNotifications,
  getUnreadCount,
  getPreference,
  updatePreference,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
};
