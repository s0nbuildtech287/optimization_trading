// constants.js

exports.RUN_TYPE = Object.freeze({
  NEW_RUN: 'NEW_RUN',
  UPDATE: 'UPDATE',
  SUMMARY: 'SUMMARY'
});

exports.DRIVE_SUMMARY_RULES = Object.freeze({
  VALID_SYMBOLS: Object.freeze([
    'BTCUSD', 'ETHUSD', 'XAUUSD', 'XAGUSD', 'US500', 'DE30', 'JP225', 'HK50',
    'USOIL', 'STOXX50', 'UK100', 'US30', 'USTECH', 'NAS100', 'UKOIL', 'DE40',
    'EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY'
  ]),
  VALID_TIMEFRAMES: Object.freeze(['H1', 'H4']),
  VALID_ORDER_TYPES: Object.freeze(['OB', 'OS'])
});

exports.LOAD_TYPE = Object.freeze({
  DRIVE: 'DRIVE',
  SHEET: 'SHEET'
});

exports.ERROR_TYPE = Object.freeze({
  RUN_TIME: 'RUN_TIME',
  CHECK_LIST: 'CHECK_LIST'
});

exports.BACKTEST_ACCESS_ERROR_CODE = Object.freeze({
  SOURCE_NOT_FOUND_OR_INACCESSIBLE: 'SOURCE_NOT_FOUND_OR_INACCESSIBLE',
  ACCESS_ERROR: 'BACKTEST_ACCESS_ERROR'
});


// 1. Phân loại Log (Dùng cho cột log_type)
exports.LOG_TYPE = Object.freeze({
  SYNC: 'SYNC',
  SYSTEM: 'SYSTEM',
  AUTH: 'AUTH',
  ERROR: 'ERROR'
});

// 2. Hành động cụ thể (Dùng cho cột action)
exports.ACTION_TYPE = Object.freeze({
  BACKTEST_SYNC: 'BACKTEST_SYNC',
  DELETE_DATA: 'DELETE_DATA',
  DROP_TABLE: 'DROP_TABLE',
  CLEAR_DATA: 'CLEAR_DATA'
});

// 3. Trạng thái (Dùng cho cột status) - RẤT QUAN TRỌNG ĐỂ FRONTEND MAP MÀU
exports.LOG_STATUS = Object.freeze({
  SUCCESS: 'SUCCESS',
  WARNING: 'WARNING',
  FAILED: 'FAILED'
});

// 4. Trigger (Ai là người chạy)
exports.TRIGGER_BY = Object.freeze({
  SYSTEM: 'SYSTEM',
  USER: 'USER', // Nếu sau này có req.user
  ADMIN: 'ADMIN'
});

// 5. Volume Lot Threshold Analysis config
exports.VOLUME_THRESHOLD = Object.freeze({
  MIN: 10,
  MAX: 100,
});

exports.LOT_SELECTION_TYPE = Object.freeze({
  AUTO: 'AUTO',
  FALLBACK: 'FALLBACK',
  MANUAL: 'MANUAL',
});

// 6. Broker Volume limits per symbol (Broker Caps)
// Khi quét dải tối ưu, hệ thống tự động lấy max(volume thực tế từ deals) làm trần (Broker Cap).
// Dưới đây chỉ là cấu hình Broker Caps tĩnh dự phòng hoặc thiết lập riêng cho từng symbol khi cần thiết.
// Khi cần giới hạn riêng từng symbol, dùng nút "Cấu hình dải quét" trên trang Risk Analysis.
exports.SYMBOL_VOLUME_CAPS = Object.freeze({
  DEFAULT: 500
});

exports.MT5 = Object.freeze({
  SESSION_STATUS: Object.freeze({ ACTIVE: 'ACTIVE', ARCHIVED: 'ARCHIVED' }),
  KEY_STATUS: Object.freeze({ ACTIVE: 'ACTIVE', REVOKED: 'REVOKED' }),
  WORKER_STATUS: Object.freeze({
    OFFLINE: 'OFFLINE', ONLINE: 'ONLINE', BUSY: 'BUSY', DRAINING: 'DRAINING', BLOCKED: 'BLOCKED'
  }),
  JOB_TYPE: Object.freeze({ OPEN_PRICE: 'OPEN_PRICE', EVERY_TICK: 'EVERY_TICK' }),
  JOB_STATUS: Object.freeze({
    PENDING: 'PENDING', CLAIMED: 'CLAIMED', RUNNING: 'RUNNING', DONE: 'DONE',
    FAILED: 'FAILED', CANCELLED: 'CANCELLED'
  }),
  SYNC_STATUS: Object.freeze({
    NOT_SYNCED: 'NOT_SYNCED', SYNCING: 'SYNCING', SYNCED: 'SYNCED', SYNC_FAILED: 'SYNC_FAILED'
  }),
  LEASE_SECONDS: 90,
  WORKER_OFFLINE_AFTER_SECONDS: 60,
  MAX_PAGE_SIZE: 200,
  UPLOAD_CHUNK_LIMIT: 5000,
  CLEANUP_CHUNK_DEFAULT: 10000,
  CLEANUP_CHUNK_MIN: 1000,
  CLEANUP_CHUNK_MAX: 20000,
  MAX_RERUN_COUNT: 20,
  FILTER_PREFERENCE_ROOT: 'mt5_filter_defaults',
  FILTER_PREFERENCE_MAX_BYTES: 20000,
  FILTER_PREFERENCE_SCOPES: Object.freeze({
    OPTIMIZATION: 'optimization',
    BACKTEST_CANDIDATES: 'backtest_candidates',
    BACKTEST_STAGING: 'backtest_staging'
  }),
  RUNTIME_SWEEP_INTERVAL_MS: 5 * 60 * 1000,
  RUNTIME_ORPHAN_GRACE_MS: 15 * 60 * 1000,
});
