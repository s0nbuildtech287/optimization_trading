// messages.js - Centralized message constants

module.exports = {
  // ==================== AUTHENTICATION ====================
  AUTH: {
    EMAIL_DOMAIN_ERROR: (domain) => `Only ${domain} emails are allowed`,
    USERNAME_EXISTS: 'Username already exists',
    EMAIL_EXISTS: 'Email already exists',
    USER_NOT_FOUND: 'User not found!',
    INVALID_PASSWORD: 'Invalid Password!',
    OTP_SENT: (email) => `OTP sent to ${email}. Please check your inbox.`,
    SIGNUP_SUCCESS: 'User registered successfully!',
  },

  // ==================== OTP ====================
  OTP: {
    NOT_FOUND: 'No OTP found. Please request a new one.',
    EXPIRED: 'OTP has expired. Please request a new one.',
    TOO_MANY_ATTEMPTS: 'Too many failed attempts. Please request a new OTP.',
    INVALID: (remaining) => `Invalid OTP. ${remaining} attempts remaining.`,
  },

  // ==================== JWT ====================
  JWT: {
    NO_TOKEN: 'No token provided!',
    UNAUTHORIZED: 'Unauthorized!',
    UNAUTHORIZED_CODE: 'UNAUTHORIZED',
    REQUIRE_ADMIN: 'Require Admin Role!',
    REQUIRE_MODERATOR: 'Require Moderator Role!',
  },

  // ==================== OPERATIONS ====================
  OPERATION: {
    MISSING_INPUT: 'Thiếu thông tin đầu vào',
    MISSING_PARAMS: 'Thiếu tham số truy vấn (query parameters)',
    DELETE_SUCCESS: 'Xóa dữ liệu thành công',
    DELETE_ERROR: 'Lỗi khi xóa dữ liệu',
    DROP_TABLE_SUCCESS: 'Đã xóa bảng thành công',
    DROP_TABLE_ERROR: 'Lỗi xóa bảng',
    CLEAR_TABLE_ERROR: 'Lỗi xóa dữ liệu bảng',
    UPDATE_SUCCESS: (column, names) => `Cập nhật dữ liệu thành công cho ${column}: [${names}]`,
    UPDATE_ERROR: 'Lỗi cập nhật dữ liệu',
    NO_VALID_SHEETS: 'Không tìm thấy sheet hợp lệ để cập nhật',
    SYNC_SUCCESS: (table) => `Đồng bộ thành công vào bảng ${table}`,
    SYNC_ERROR: 'Lỗi tổng thể khi đồng bộ',
    FETCH_ERROR: 'Lỗi khi lấy dữ liệu phân trang',
    INVALID_TABLE: 'Tên bảng không hợp lệ',
    DOWNLOAD_SUCCESS: 'Tải log file thành công',
    DOWNLOAD_ERROR: 'Lỗi khi tải log file',
  },

  // ==================== VALIDATION ====================
  VALIDATION: {
    INVALID_JSON_PAYLOAD: 'Invalid JSON payload format',
    SOURCE_NOT_FOUND_OR_INACCESSIBLE: 'Requested data source was not found.',
    DATE_RANGE_REQUIRES_BOTH: 'Both startDate and endDate are required when filtering by date',
    INVALID_DATE_FORMAT: 'startDate and endDate must be valid dates in YYYY-MM-DD format',
    INVALID_DATE_ORDER: 'startDate must be earlier than or equal to endDate',
    UNSUPPORTED_DATE_PARAMS: 'Use startDate and endDate instead of fromDate and toDate',
    SOURCE_NAMES_REQUIRED: 'sourceNames is required. Use all_backtests to explicitly select all accessible data sources',
    INVALID_DATA: 'Dữ liệu không hợp lệ',
    REQUIRED_COLUMNS: 'Danh sách cột là bắt buộc',
    MISSING_PK_COLUMNS: (columns) => `Các cột khóa chính (${columns.join(', ')}) không tồn tại trong danh sách cột`,
    SHEET_NOT_FOUND: (sheetName) => `Không tìm thấy sheet "${sheetName}" trong bất kỳ sheetID nào.`,
    COLUMN_NOT_FOUND: 'Không tìm thấy cột "Tên File" hoặc "Link Sheet2".',
  },

  DRIVE_SUMMARY: {
    MISSING_URL: 'Vui lòng cung cấp Google Drive folder URL',
    INVALID_URL: 'Link Google Drive folder không hợp lệ',
    SCAN_FAILED: 'Không thể kiểm tra cấu trúc Google Drive',
    INVALID_SYNC_MODE: 'SUMMARY chỉ được chạy qua API kiểm tra Drive, không được chạy qua API sync database',
  },

  LOT_THRESHOLD: {
    INVALID_SELECTION_TYPE: 'Invalid lot threshold selection type',
    CANDIDATE_NOT_FOUND: 'Lot threshold candidate not found',
    CANDIDATES_NOT_FOUND: 'Lot threshold candidates not found',
    METRICS_INCOMPLETE: 'Legacy candidate does not contain a complete metric snapshot; run the analysis again before selecting it',
    REQUIRED_IDENTIFIERS: 'analysisRunId, strategyId and sourceTable are required',
    REQUIRED_THRESHOLD: 'lotThreshold is required',
    INVALID_SOURCE_TABLE: 'Invalid source table',
  },

  MT5: {
    SESSION_NOT_FOUND: 'MT5 session not found',
    JOB_NOT_FOUND: 'MT5 job not found',
    RESULT_NOT_FOUND: 'MT5 result not found',
    WORKER_NOT_FOUND: 'MT5 worker not found',
    INVALID_API_KEY: 'Invalid or revoked API key',
    INVALID_JOB_CALLBACK: 'Job callback does not match the active execution',
    INVALID_OPEN_PRICE_RESULT: 'Open Price result payload is invalid',
    OPEN_PRICE_REQUIRES_OPTIMIZED_INPUT: 'Open Price INI must enable at least one TesterInputs parameter with ||Y',
    EMPTY_BACKTEST_RESULT: 'Every Tick result must contain Settings, Results and Deals',
    BACKTEST_RESULTS_NOT_INGESTED: 'Every Tick results were not stored before job completion',
    BACKTEST_CANDIDATE_NOT_FOUND: 'MT5 backtest candidate not found',
    BACKTEST_CANDIDATE_REQUIRED: 'Result must be selected as a backtest candidate',
    BACKTEST_ALREADY_QUEUED: 'An Every Tick job is already active for this result',
    INVALID_SELECTION: 'Invalid MT5 result selection',
    INVALID_AUTO_REVIEW_RANKING: 'Invalid Backtest Candidate auto-review ranking metric',
    AUTO_REVIEW_EMPTY: 'No Backtest Candidates match the active filters',
    CLUSTER_REQUIRES_GROUPED: 'Cluster Radius requires Group by Strategy.',
    INVALID_RESULT_FILTER: 'Optimization filter contains an invalid numeric value',
    INVALID_RESULT_CURSOR: 'Invalid optimization results cursor',
    INVALID_FILTER_PREFERENCE_SCOPE: 'Invalid MT5 filter preference scope',
    INVALID_FILTER_PREFERENCE: 'Invalid MT5 filter preference',
    STALE_RESULT_CURSOR: 'Optimization results changed. Refresh the table before continuing.',
    SESSION_MAINTENANCE_BUSY: 'Another cleanup operation is already running for this session',
    SESSION_HAS_ACTIVE_JOBS: 'Stop or finish all active jobs before cleaning this session',
    SESSION_HAS_UNSYNCED_STAGING: 'Sync all staged strategies before deleting this session',
    SESSION_CONFIRMATION_MISMATCH: 'Session confirmation name does not match',
  },

  // ==================== SYSTEM LOG ====================
  SYSTEM_LOG: {
    FETCH_LATEST_ERROR: 'Failed to fetch latest backtest logs',
    FETCH_HISTORY_ERROR: 'Failed to fetch log history',
    FETCH_ALL_ERROR: 'Failed to fetch logs',
    CLEANUP_ERROR: 'Failed to cleanup logs',
    CLEANUP_SUCCESS: (count) => `Cleaned up ${count} old logs`,
    FETCH_ACTIVITY_ERROR: 'Failed to fetch activity logs',
  },

  // ==================== DATABASE ====================
  DATABASE: {
    INIT_START: '   INITIALIZING DATABASE',
    INIT_COMPLETE: '   DATABASE INITIALIZATION COMPLETED',
    INIT_FAILED: 'Database initialization failed',
    TABLE_EXISTS: 'Bảng đã tồn tại, bỏ qua tạo bảng',
    DATABASE_EXISTS: 'Database đã tồn tại',
    CLEAR_DATA_SKIPPED: 'Không clear data bảng',
    CLEAR_DATA_SUCCESS: 'Đã xoá dữ liệu trong bảng',
    DROP_TABLE_SUCCESS: 'Đã xóa bảng',
  },

  // ==================== GENERAL ====================
  GENERAL: {
    SUCCESS: 'Thành công',
    ERROR: 'Đã xảy ra lỗi',
    INTERNAL_ERROR: 'Internal server error',
  },
};
