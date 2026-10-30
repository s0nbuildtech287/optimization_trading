/**
 * src/dao/notificationDAO.js
 * DAO quản lý bảng user_notifications cho hệ thống thông báo persistent
 */

const { getAppPool } = require("../config/db");
const pool = getAppPool();

/**
 * Khởi tạo bảng user_notifications và các index liên quan
 */
async function initNotificationTable() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS user_notifications (
      id BIGSERIAL PRIMARY KEY,
      recipient_user_id INTEGER NULL REFERENCES users(id) ON DELETE CASCADE,
      actor_user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
      event_type VARCHAR(80) NOT NULL,
      severity VARCHAR(20) NOT NULL DEFAULT 'info',
      title VARCHAR(200) NOT NULL,
      message TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'unread',
      entity_type VARCHAR(60),
      entity_id VARCHAR(255),
      target_url TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      dedupe_key VARCHAR(255) UNIQUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      read_at TIMESTAMP NULL
    );
  `;

  try {
    await pool.query(createTableQuery);

    const indexQueries = [
      `CREATE INDEX IF NOT EXISTS idx_user_notif_recipient ON user_notifications(recipient_user_id, status, created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_user_notif_created ON user_notifications(created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_user_notif_entity ON user_notifications(event_type, entity_type, entity_id);`
    ];

    for (const q of indexQueries) {
      try {
        await pool.query(q);
      } catch (idxErr) {
        if (!idxErr.message.includes("must be owner")) {
          console.warn("[DB] Warning creating index for user_notifications:", idxErr.message);
        }
      }
    }

    console.log("[DB] user_notifications table initialized");
  } catch (err) {
    if (err.message.includes("must be owner")) {
      console.log("[DB] ⚠️ user_notifications table already exists (owned by another DB user). Initialization skipped cleanly.");
    } else {
      console.error("❌ Failed to initialize user_notifications table:", err.message);
      throw err;
    }
  }
}

/**
 * Tạo thông báo mới (Best-effort / idempotent qua dedupe_key)
 */
async function createNotification({
  recipient_user_id = null,
  actor_user_id = null,
  event_type,
  severity = "info",
  title,
  message,
  entity_type = null,
  entity_id = null,
  target_url = null,
  metadata = {},
  dedupe_key = null,
}) {
  const query = `
    INSERT INTO user_notifications (
      recipient_user_id,
      actor_user_id,
      event_type,
      severity,
      title,
      message,
      entity_type,
      entity_id,
      target_url,
      metadata,
      dedupe_key
    )
    SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
    WHERE $1::integer IS NULL
       OR COALESCE(
         (
           SELECT (preferences ->> 'notifications_enabled')::boolean
           FROM users
           WHERE id = $1::integer
         ),
         FALSE
       )
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING *;
  `;

  const values = [
    recipient_user_id ? Number(recipient_user_id) : null,
    actor_user_id ? Number(actor_user_id) : null,
    event_type,
    severity,
    title,
    message,
    entity_type,
    entity_id ? String(entity_id) : null,
    target_url,
    JSON.stringify(metadata || {}),
    dedupe_key || null,
  ];

  try {
    const res = await pool.query(query, values);
    if (res.rows[0]) {
      await pruneNotificationsIfNeeded();
    }
    return res.rows[0] || null;
  } catch (err) {
    // 23503: PostgreSQL foreign_key_violation code
    if (err.code === "23503") {
      console.warn(`[NOTIFICATION WARNING] User ID (${recipient_user_id}) is not in users table. Creating system notification instead.`);
      const fallbackValues = [...values];
      fallbackValues[0] = null; // recipient_user_id
      fallbackValues[1] = null; // actor_user_id
      const fbRes = await pool.query(query, fallbackValues);
      return fbRes.rows[0] || null;
    }
    throw err;
  }
}

/** Lấy trạng thái bật/tắt notification của một user. Mặc định bật để giữ hành vi cũ. */
async function getNotificationPreference(userId) {
  const result = await pool.query(
    `SELECT COALESCE((preferences ->> 'notifications_enabled')::boolean, FALSE) AS enabled
     FROM users
     WHERE id = $1;`,
    [Number(userId)]
  );

  return result.rows[0]?.enabled === true;
}

/** Lưu trạng thái notification vào JSONB preferences hiện có của user. */
async function setNotificationPreference(userId, enabled) {
  const result = await pool.query(
    `UPDATE users
     SET preferences = jsonb_set(
       COALESCE(preferences, '{}'::jsonb),
       '{notifications_enabled}',
       to_jsonb($2::boolean),
       TRUE
     )
     WHERE id = $1
     RETURNING COALESCE((preferences ->> 'notifications_enabled')::boolean, FALSE) AS enabled;`,
    [Number(userId), enabled]
  );

  return result.rows[0] || null;
}

/**
 * Giữ inbox không vượt quá 9.999 bản ghi.
 * Khi vượt ngưỡng, xóa một nửa bản ghi cũ nhất và giữ lại các bản ghi mới hơn.
 */
async function pruneNotificationsIfNeeded() {
  const countResult = await pool.query("SELECT COUNT(*)::int AS count FROM user_notifications;");
  const count = Number(countResult.rows[0]?.count || 0);
  if (count <= 9999) return 0;

  const deleteCount = Math.ceil(count / 2);
  const result = await pool.query(
    `DELETE FROM user_notifications
     WHERE id IN (
       SELECT id FROM user_notifications
       ORDER BY created_at ASC, id ASC
       LIMIT $1
     );`,
    [deleteCount]
  );
  console.log(`[NOTIFICATION] Pruned ${result.rowCount} oldest notifications after reaching ${count} records.`);
  return result.rowCount;
}

/**
 * Lấy danh sách thông báo theo phân quyền
 * Admin: Lấy tất cả thông báo (có thể xem cá nhân + hệ thống)
 * User: Chỉ lấy thông báo có recipient_user_id = userId
 */
async function listNotifications({ userId, isAdmin = false, limit = 30, offset = 0, unreadOnly = false }) {
  const params = [];
  let whereConditions = [];

  if (!isAdmin) {
    params.push(Number(userId));
    whereConditions.push(`recipient_user_id = $${params.length}`);
  }

  if (unreadOnly) {
    whereConditions.push(`LOWER(TRIM(status)) = 'unread'`);
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

  params.push(Number(limit));
  const limitIdx = params.length;
  params.push(Number(offset));
  const offsetIdx = params.length;

  const query = `
    SELECT 
      id,
      recipient_user_id AS "recipientUserId",
      actor_user_id AS "actorUserId",
      event_type AS "eventType",
      severity,
      title,
      message,
      status,
      entity_type AS "entityType",
      entity_id AS "entityId",
      target_url AS "targetUrl",
      metadata,
      dedupe_key AS "dedupeKey",
      created_at AT TIME ZONE current_setting('TIMEZONE') AS "createdAt",
      read_at AT TIME ZONE current_setting('TIMEZONE') AS "readAt"
    FROM user_notifications
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx};
  `;

  const res = await pool.query(query, params);
  return res.rows;
}

/**
 * Đếm số lượng thông báo chưa đọc (unread count)
 */
async function getUnreadCount({ userId, isAdmin = false }) {
  const params = [];
  let whereConditions = [`LOWER(TRIM(status)) = 'unread'`];

  if (!isAdmin) {
    params.push(Number(userId));
    whereConditions.push(`recipient_user_id = $${params.length}`);
  }

  const whereClause = `WHERE ${whereConditions.join(" AND ")}`;
  const query = `SELECT COUNT(*)::int AS count FROM user_notifications ${whereClause};`;

  const res = await pool.query(query, params);
  return res.rows[0]?.count || 0;
}

/**
 * Đánh dấu 1 thông báo là đã đọc
 */
async function markAsRead({ id, userId, isAdmin = false }) {
  const params = [Number(id)];
  let whereConditions = [`id = $1`];

  if (!isAdmin) {
    params.push(Number(userId));
    whereConditions.push(`recipient_user_id = $${params.length}`);
  }

  const query = `
    UPDATE user_notifications
    SET status = 'read', read_at = NOW()
    WHERE ${whereConditions.join(" AND ")}
    RETURNING id, status, read_at;
  `;

  const res = await pool.query(query, params);
  return res.rows[0] || null;
}

/**
 * Đánh dấu tất cả thông báo là đã đọc
 */
async function markAllAsRead({ userId, isAdmin = false }) {
  const params = [];
  let whereConditions = [`LOWER(TRIM(status)) = 'unread'`];

  if (!isAdmin) {
    params.push(Number(userId));
    whereConditions.push(`recipient_user_id = $${params.length}`);
  }

  const query = `
    UPDATE user_notifications
    SET status = 'read', read_at = NOW()
    WHERE ${whereConditions.join(" AND ")}
    RETURNING id;
  `;

  const res = await pool.query(query, params);
  return res.rowCount;
}

/** Xóa một notification theo quyền của user/admin. */
async function deleteNotification({ id, userId, isAdmin = false }) {
  const params = [Number(id)];
  const whereConditions = ["id = $1"];

  if (!isAdmin) {
    params.push(Number(userId));
    whereConditions.push(`recipient_user_id = $${params.length}`);
  }

  const result = await pool.query(
    `DELETE FROM user_notifications
     WHERE ${whereConditions.join(" AND ")}
     RETURNING id;`,
    params
  );
  return result.rows[0] || null;
}

/** Xóa toàn bộ notification trong phạm vi quyền của user/admin. */
async function deleteAllNotifications({ userId, isAdmin = false }) {
  const params = [];
  let whereClause = "";

  if (!isAdmin) {
    params.push(Number(userId));
    whereClause = `WHERE recipient_user_id = $1`;
  }

  const result = await pool.query(
    `DELETE FROM user_notifications ${whereClause};`,
    params
  );
  return result.rowCount;
}

/**
 * Tự động xóa thông báo cũ hơn N ngày (Default: 90 ngày)
 */
async function cleanupOldNotifications(days = 90) {
  const query = `DELETE FROM user_notifications WHERE created_at < NOW() - INTERVAL '${Number(days)} days';`;
  const res = await pool.query(query);
  return res.rowCount;
}

module.exports = {
  initNotificationTable,
  createNotification,
  getNotificationPreference,
  setNotificationPreference,
  listNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
  pruneNotificationsIfNeeded,
  cleanupOldNotifications,
};
