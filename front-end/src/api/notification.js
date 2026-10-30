import { API_ENDPOINTS } from 'config';
import { authFetch } from './authFetch';

/**
 * Lấy danh sách thông báo
 */
export async function getNotifications({ limit = 30, offset = 0, unreadOnly = false } = {}) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    unread_only: String(unreadOnly),
  });

  const res = await authFetch(`${API_ENDPOINTS.NOTIFICATIONS}?${params.toString()}`);
  if (!res.ok) {
    throw new Error('Failed to fetch notifications');
  }
  return res.json();
}

/**
 * Lấy số lượng thông báo chưa đọc
 */
export async function getUnreadCount() {
  const res = await authFetch(API_ENDPOINTS.NOTIFICATIONS_UNREAD_COUNT);
  if (!res.ok) {
    throw new Error('Failed to fetch unread count');
  }
  return res.json();
}

export async function getNotificationPreference() {
  const res = await authFetch(API_ENDPOINTS.NOTIFICATIONS_PREFERENCES);
  if (!res.ok) throw new Error('Failed to fetch notification preference');
  return res.json();
}

export async function updateNotificationPreference(enabled) {
  const res = await authFetch(API_ENDPOINTS.NOTIFICATIONS_PREFERENCES, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new Error('Failed to update notification preference');
  return res.json();
}

/**
 * Đánh dấu 1 thông báo là đã đọc
 */
export async function markNotificationAsRead(id) {
  const res = await authFetch(`${API_ENDPOINTS.NOTIFICATIONS}/${id}/read`, {
    method: 'POST',
  });
  if (!res.ok) {
    throw new Error('Failed to mark notification as read');
  }
  return res.json();
}

/**
 * Đánh dấu tất cả thông báo là đã đọc
 */
export async function markAllNotificationsAsRead() {
  const res = await authFetch(API_ENDPOINTS.NOTIFICATIONS_READ_ALL, {
    method: 'POST',
  });
  if (!res.ok) {
    throw new Error('Failed to mark all notifications as read');
  }
  return res.json();
}

/** Xóa một thông báo trong inbox của user hiện tại. */
export async function deleteNotification(id) {
  const res = await authFetch(`${API_ENDPOINTS.NOTIFICATIONS}/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error('Failed to delete notification');
  }
  return res.json();
}

/** Xóa toàn bộ notification trong phạm vi quyền của user hiện tại. */
export async function deleteAllNotifications() {
  const res = await authFetch(`${API_ENDPOINTS.NOTIFICATIONS}/all`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error('Failed to delete all notifications');
  }
  return res.json();
}
