-- ====================================================================
-- SCRIPT SQL NÂNG CẤP DATABASE BACKTEST
-- DOT 1: Cap nhat nen, gop va backfill du lieu
-- DOT 2: Cleanup cac bang/cot cu sau khi da kiem tra
-- migration.js luon chay toan bo file theo thu tu tu tren xuong
-- ====================================================================
BEGIN;

-- --------------------------------------------------------------------
-- DOT 1
-- PHẦN 1: NÂNG CẤP BẢNG USERS & BACKFILL DỮ LIỆU CÓ ƯU TIÊN ADMIN
-- --------------------------------------------------------------------
-- 1.1. Bổ sung role_id và preferences vào bảng users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role_id INTEGER REFERENCES roles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 1.2. Backfill dữ liệu role từ user_role (Ưu tiên gán Admin nếu user có nhiều role)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_role') THEN
    UPDATE users u
    SET role_id = (
      SELECT ur."roleId"
      FROM user_role ur
      JOIN roles r ON r.id = ur."roleId"
      WHERE ur."userId" = u.id
      ORDER BY (CASE WHEN r.name = 'admin' THEN 1 ELSE 2 END) ASC
      LIMIT 1
    )
    WHERE u.role_id IS NULL;
  END IF;

  UPDATE users
  SET role_id = (SELECT id FROM roles WHERE name = 'user' LIMIT 1)
  WHERE role_id IS NULL;
END $$;

-- 1.3. Backfill dữ liệu bộ lọc từ user_preferences sang users.preferences (JSONB)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_preferences') THEN
    UPDATE users u
    SET preferences = jsonb_build_object('strategy_filters', up.strategy_filters)
    FROM user_preferences up
    WHERE u.id = up.user_id;
  END IF;
END $$;


-- --------------------------------------------------------------------
-- DOT 1
-- PHẦN 1.4: BOOTSTRAP CÁC BẢNG NỀN CỦA BACKEND MỚI
-- Cho phép chạy toàn bộ migration một lượt trên database chỉ mới được
-- khởi tạo bằng source master, trước khi restart backend premaster.
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_jobs (
  sync_id VARCHAR(255) PRIMARY KEY,
  table_name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL,
  start_time BIGINT NOT NULL,
  end_time BIGINT,
  duration BIGINT,
  total_files INTEGER DEFAULT 0,
  processed_files INTEGER DEFAULT 0,
  success_files INTEGER DEFAULT 0,
  failed_files INTEGER DEFAULT 0,
  current_file VARCHAR(255),
  progress INTEGER DEFAULT 0,
  result JSONB,
  error TEXT,
  username VARCHAR(100),
  user_id INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS data_source (
  id SERIAL PRIMARY KEY,
  source_name VARCHAR(255) NOT NULL UNIQUE,
  display_name VARCHAR(255),
  source_type VARCHAR(50) NOT NULL DEFAULT 'TABLE',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE SEQUENCE IF NOT EXISTS lot_threshold_analysis_run_seq;

CREATE TABLE IF NOT EXISTS lot_threshold_analysis_runs (
  id BIGSERIAL PRIMARY KEY,
  analysis_run_id VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  source_tables JSONB NOT NULL DEFAULT '[]'::jsonb,
  configs_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  time_begin TIMESTAMP,
  time_end TIMESTAMP,
  status VARCHAR(32) NOT NULL DEFAULT 'RUNNING',
  total_strategies INTEGER NOT NULL DEFAULT 0,
  succeeded_strategies INTEGER NOT NULL DEFAULT 0,
  failed_strategies INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  created_by INTEGER,
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_notifications (
  id BIGSERIAL PRIMARY KEY,
  recipient_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
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
  read_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sync_jobs_status ON sync_jobs(status);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_created ON sync_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_data_source_enabled ON data_source(enabled, source_type);
CREATE INDEX IF NOT EXISTS idx_lot_analysis_runs_status ON lot_threshold_analysis_runs(status);
CREATE INDEX IF NOT EXISTS idx_lot_analysis_runs_started_at ON lot_threshold_analysis_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notif_recipient
  ON user_notifications(recipient_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notif_created
  ON user_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notif_entity
  ON user_notifications(event_type, entity_type, entity_id);

-- PHẦN 10: CHUẨN BỊ RUN ID CHO VOLUME OPTIMIZATION
-- --------------------------------------------------------------------
-- Lưu ý:
-- - Phần CREATE TABLE/SEQUENCE của lot_threshold_analysis_runs và sequence
--   lot_threshold_analysis_run_seq được backend tự khởi tạo trong DAO.
-- - Chạy phần này trước khi khởi động backend phiên bản mới.
-- - Không xóa dữ liệu kết quả cũ; các dòng cũ được gắn run-lot-01.

BEGIN;

-- 10.1. Thêm run ID vào bảng lưu toàn bộ các mức volume
ALTER TABLE lot_threshold_analysis
  ADD COLUMN IF NOT EXISTS analysis_run_id VARCHAR(64);

UPDATE lot_threshold_analysis
SET analysis_run_id = 'run-lot-01'
WHERE analysis_run_id IS NULL;

ALTER TABLE lot_threshold_analysis
  ALTER COLUMN analysis_run_id SET NOT NULL;

-- 10.2. Đổi khóa chính để các lần chạy khác nhau không đè lên nhau
ALTER TABLE lot_threshold_analysis
  DROP CONSTRAINT IF EXISTS lot_threshold_analysis_pkey;

ALTER TABLE lot_threshold_analysis
  ADD CONSTRAINT lot_threshold_analysis_pkey
  PRIMARY KEY (analysis_run_id, strategy_id, source_table, lot_threshold);

CREATE INDEX IF NOT EXISTS idx_lot_threshold_analysis_run
  ON lot_threshold_analysis(analysis_run_id);


-- 10.3. Thêm run ID vào bảng kết quả tối ưu cuối cùng
ALTER TABLE lot_threshold_final
  ADD COLUMN IF NOT EXISTS analysis_run_id VARCHAR(64);

UPDATE lot_threshold_final
SET analysis_run_id = 'run-lot-01'
WHERE analysis_run_id IS NULL;

ALTER TABLE lot_threshold_final
  ALTER COLUMN analysis_run_id SET NOT NULL;

-- 10.4. Đổi khóa chính để mỗi run có một kết quả riêng
ALTER TABLE lot_threshold_final
  DROP CONSTRAINT IF EXISTS lot_threshold_final_pkey;

ALTER TABLE lot_threshold_final
  ADD CONSTRAINT lot_threshold_final_pkey
  PRIMARY KEY (analysis_run_id, strategy_id, source_table);

CREATE INDEX IF NOT EXISTS idx_lot_threshold_final_run
  ON lot_threshold_final(analysis_run_id);

COMMIT;

-- --------------------------------------------------------------------
-- PHẦN 13: BỔ SUNG METRICS CHO VOLUME OPTIMIZATION SNAPSHOT
-- --------------------------------------------------------------------
-- Chạy một lần trên DB cũ. DB mới đã có các cột này trong CREATE TABLE.
BEGIN;

ALTER TABLE lot_threshold_final
  ADD COLUMN IF NOT EXISTS profit_factor NUMERIC,
  ADD COLUMN IF NOT EXISTS recovery_factor NUMERIC,
  ADD COLUMN IF NOT EXISTS sharpe_ratio NUMERIC,
  ADD COLUMN IF NOT EXISTS largest_loss_trade NUMERIC,
  ADD COLUMN IF NOT EXISTS largest_profit_trade NUMERIC,
  ADD COLUMN IF NOT EXISTS largest_profit_trade_ratio NUMERIC,
  ADD COLUMN IF NOT EXISTS risk_reward_ratio NUMERIC,
  ADD COLUMN IF NOT EXISTS lr_correlation NUMERIC,
  ADD COLUMN IF NOT EXISTS avg_profit NUMERIC,
  ADD COLUMN IF NOT EXISTS avg_loss NUMERIC;

COMMIT;

-- --------------------------------------------------------------------
-- PHẦN 15: PHÂN QUYỀN BACKTEST TABLE THEO OWNER
-- --------------------------------------------------------------------
-- Chạy phần này trước khi khởi động backend có Backtest Ownership.
-- owner_user_id NULL có nghĩa là bảng chưa xác định owner và chỉ Admin được xem.

BEGIN;

ALTER TABLE data_source
  ADD COLUMN IF NOT EXISTS owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_data_source_owner_enabled
  ON data_source(owner_user_id, enabled, source_type);

-- Ensure every real physical backtest table has a registry row before owner backfill.
INSERT INTO data_source
  (source_name, display_name, source_type, enabled, owner_user_id, created_at, updated_at)
SELECT t.table_name, t.table_name, 'TABLE', true, NULL, NOW(), NOW()
FROM information_schema.tables t
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
  AND t.table_name LIKE 'backtest%'
  AND (
    SELECT COUNT(DISTINCT LOWER(c.column_name))
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = t.table_name
      AND LOWER(c.column_name) = ANY(ARRAY[
        'time','deal','symbol','type','direction','volume','price',
        'order','commission','swap','profit','comment','strategy_id'
      ])
  ) = 13
ON CONFLICT (source_name) DO NOTHING;

-- Auxiliary tables with a backtest-like name are not user data sources.
UPDATE data_source d
SET enabled = false,
    updated_at = NOW()
WHERE d.source_type = 'TABLE'
  AND d.source_name LIKE 'backtest%'
  AND (
    SELECT COUNT(DISTINCT LOWER(c.column_name))
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = d.source_name
      AND LOWER(c.column_name) = ANY(ARRAY[
        'time','deal','symbol','type','direction','volume','price',
        'order','commission','swap','profit','comment','strategy_id'
      ])
  ) <> 13;

-- Backfill khi một table chỉ có đúng một user trong lịch sử sync.
WITH unique_sync_owner AS (
  SELECT LOWER(s.table_name) AS source_name, MIN(s.user_id) AS owner_user_id
  FROM sync_jobs s
  JOIN users u ON u.id = s.user_id
  WHERE s.user_id IS NOT NULL
  GROUP BY LOWER(s.table_name)
  HAVING COUNT(DISTINCT s.user_id) = 1
)
UPDATE data_source d
SET owner_user_id = s.owner_user_id,
    updated_at = NOW()
FROM unique_sync_owner s
WHERE d.source_name = s.source_name
  AND d.owner_user_id IS NULL;

-- Backfill Volume Optimization runs only when every selected source table
-- belongs to the same known owner.
WITH run_owner AS (
  SELECT r.analysis_run_id,
         MIN(d.owner_user_id) AS owner_user_id
  FROM lot_threshold_analysis_runs r
  CROSS JOIN LATERAL jsonb_array_elements_text(r.source_tables) AS source(source_name)
  JOIN data_source d ON d.source_name = LOWER(source.source_name)
  WHERE r.created_by IS NULL
  GROUP BY r.analysis_run_id, r.source_tables
  HAVING COUNT(*) = jsonb_array_length(r.source_tables)
     AND COUNT(DISTINCT d.owner_user_id) = 1
     AND COUNT(d.owner_user_id) = COUNT(*)
)
UPDATE lot_threshold_analysis_runs r
SET created_by = o.owner_user_id,
    updated_at = NOW()
FROM run_owner o
WHERE r.analysis_run_id = o.analysis_run_id
  AND r.created_by IS NULL;

COMMIT;

-- Audit sau migration: các bảng dưới đây chỉ Admin nhìn thấy cho đến khi gán owner.
SELECT source_name, display_name, owner_user_id, enabled
FROM data_source
WHERE owner_user_id IS NULL
ORDER BY source_name;

-- Audit conflict lịch sử: phải xác nhận thủ công, không tự gán owner.
SELECT LOWER(table_name) AS source_name,
       ARRAY_AGG(DISTINCT user_id ORDER BY user_id) AS user_ids
FROM sync_jobs
WHERE user_id IS NOT NULL
GROUP BY LOWER(table_name)
HAVING COUNT(DISTINCT user_id) > 1
ORDER BY source_name;

-- Ví dụ gán owner thủ công sau khi đã xác nhận:
-- UPDATE data_source
-- SET owner_user_id = 2, updated_at = NOW()
-- WHERE source_name = 'backtest_example';

-- --------------------------------------------------------------------
-- PHẦN 16: CHUẨN HÓA KIỂU LOT THRESHOLD THEO DAO HIỆN TẠI
-- Thuật toán chỉ sinh threshold nguyên. Migration dừng nếu phát hiện dữ
-- liệu thập phân để không tự làm tròn và thay đổi kết quả lịch sử.
-- --------------------------------------------------------------------
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM lot_threshold_analysis
    WHERE lot_threshold <> TRUNC(lot_threshold)
  ) THEN
    RAISE EXCEPTION
      'lot_threshold_analysis contains fractional lot_threshold values; migration stopped';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM lot_threshold_final
    WHERE lot_threshold <> TRUNC(lot_threshold)
  ) THEN
    RAISE EXCEPTION
      'lot_threshold_final contains fractional lot_threshold values; migration stopped';
  END IF;
END $$;

ALTER TABLE lot_threshold_analysis
  ALTER COLUMN lot_threshold TYPE INTEGER
  USING lot_threshold::INTEGER;

ALTER TABLE lot_threshold_final
  ALTER COLUMN lot_threshold TYPE INTEGER
  USING lot_threshold::INTEGER;

COMMIT;

-- --------------------------------------------------------------------
-- PHẦN 17: GỘP LỊCH SỬ SYNC TỪ system_logs VÀO sync_jobs
-- --------------------------------------------------------------------
-- Phần 17A có thể chạy trước khi deploy code mới: chỉ thêm cột/index.
-- Không lưu snapshot count toàn bảng vào sync_jobs. Total Rows In DB và
-- Total Strategies phải được count trực tiếp từ bảng backtest sau sync.

BEGIN;

ALTER TABLE sync_jobs
  ADD COLUMN IF NOT EXISTS operation_type VARCHAR(50) NOT NULL DEFAULT 'BACKTEST_SYNC',
  ADD COLUMN IF NOT EXISTS action VARCHAR(100) NOT NULL DEFAULT 'BACKTEST_SYNC',
  ADD COLUMN IF NOT EXISTS unique_names INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS warning_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS has_warnings BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE sync_jobs
SET operation_type = 'CHECK_FILES', action = 'CHECK_FILES'
WHERE LOWER(table_name) = 'check-files';

UPDATE sync_jobs
SET operation_type = 'LOT_THRESHOLD_ANALYSIS', action = 'LOT_THRESHOLD_ANALYSIS'
WHERE LOWER(table_name) = 'lot_threshold_analysis';

UPDATE sync_jobs
SET action = UPPER(metadata->>'sync_mode')
WHERE operation_type = 'BACKTEST_SYNC'
  AND UPPER(metadata->>'sync_mode') IN ('NEW_RUN', 'UPDATE')
  AND action IS DISTINCT FROM UPPER(metadata->>'sync_mode');

CREATE INDEX IF NOT EXISTS idx_sync_jobs_operation_table_created
  ON sync_jobs(operation_type, table_name, created_at DESC);

DROP INDEX IF EXISTS idx_sync_jobs_finished_retention;

CREATE INDEX IF NOT EXISTS idx_sync_jobs_user_created
  ON sync_jobs(user_id, created_at DESC);

COMMIT;

-- --------------------------------------------------------------------
-- PHẦN 17B: MIGRATE LỊCH SỬ BACKTEST SYNC CŨ
-- --------------------------------------------------------------------
-- Chỉ chuyển log SYNC/BACKTEST_SYNC. Các log ERROR, SECURITY hoặc SYSTEM
-- không thuộc domain sync và không được đưa vào sync_jobs.
-- sync_id legacy ổn định giúp chạy lại migration mà không tạo bản ghi trùng.

DO $$
BEGIN
  IF to_regclass('public.system_logs') IS NOT NULL THEN
    INSERT INTO sync_jobs (
      sync_id,
      table_name,
      status,
      start_time,
      end_time,
      duration,
      total_files,
      processed_files,
      success_files,
      failed_files,
      current_file,
      progress,
      result,
      error,
      username,
      user_id,
      operation_type,
      action,
      unique_names,
      warning_count,
      metadata,
      has_warnings,
      created_at,
      updated_at
    )
    SELECT
      'legacy_system_log_' || sl.id::text,
      LOWER(sl.target_table),
      CASE
        WHEN UPPER(sl.status) = 'FAILED' THEN 'FAILED'
        ELSE 'COMPLETED'
      END,
      GREATEST(
        0,
        FLOOR(EXTRACT(EPOCH FROM sl.created_at) * 1000)::bigint
          - COALESCE(sl.duration_ms, 0)::bigint
      ),
      FLOOR(EXTRACT(EPOCH FROM sl.created_at) * 1000)::bigint,
      sl.duration_ms,
      COALESCE(sl.total_files, 0),
      COALESCE(sl.success_count, 0) + COALESCE(sl.failed_count, 0),
      COALESCE(sl.success_count, 0),
      COALESCE(sl.failed_count, 0),
      NULL,
      100,
      jsonb_build_object(
        'legacy_batch_stats', jsonb_build_object(
          'total_files', COALESCE(sl.total_files, 0),
          'success_files', COALESCE(sl.success_count, 0),
          'failed_files', COALESCE(sl.failed_count, 0),
          'warning_count', COALESCE(sl.warning_count, 0)
        )
      ),
      CASE
        WHEN UPPER(sl.status) = 'FAILED' THEN COALESCE(sl.metadata->>'error', 'Legacy sync failed')
        ELSE NULL
      END,
      COALESCE(sl.triggered_by, 'SYSTEM'),
      u.id,
      'BACKTEST_SYNC',
      CASE
        WHEN UPPER(COALESCE(sl.metadata->>'sync_mode', sl.metadata->>'runType')) IN ('NEW_RUN', 'UPDATE')
          THEN UPPER(COALESCE(sl.metadata->>'sync_mode', sl.metadata->>'runType'))
        ELSE 'BACKTEST_SYNC'
      END,
      COALESCE(sl.unique_names, 0),
      COALESCE(sl.warning_count, 0),
      COALESCE(sl.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'legacy_import', true,
          'legacy_system_log_id', sl.id
        ),
      UPPER(sl.status) = 'WARNING' OR COALESCE(sl.warning_count, 0) > 0,
      sl.created_at,
      COALESCE(sl.updated_at, sl.created_at)
    FROM system_logs sl
    LEFT JOIN users u
      ON LOWER(u.username) = LOWER(sl.triggered_by)
    WHERE sl.log_type = 'SYNC'
      AND sl.action = 'BACKTEST_SYNC'
      AND sl.target_table IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM sync_jobs existing
        WHERE LOWER(existing.table_name) = LOWER(sl.target_table)
          AND LOWER(COALESCE(existing.username, 'SYSTEM')) = LOWER(COALESCE(sl.triggered_by, 'SYSTEM'))
          AND existing.end_time IS NOT NULL
          AND ABS(
            existing.end_time
              - FLOOR(EXTRACT(EPOCH FROM sl.created_at) * 1000)::bigint
          ) <= 5000
          AND COALESCE(existing.duration, -1) = COALESCE(sl.duration_ms, -1)::bigint
          AND COALESCE(existing.total_files, 0) = COALESCE(sl.total_files, 0)
      )
    ON CONFLICT (sync_id) DO NOTHING;
  END IF;
END $$;

-- Audit sau migrate: so sánh lịch sử sync cũ với số dòng legacy đã nhập.
SELECT
  (SELECT COUNT(*)
   FROM sync_jobs
   WHERE operation_type = 'BACKTEST_SYNC') AS sync_jobs_backtest_history,
  (SELECT COUNT(*)
   FROM sync_jobs
   WHERE metadata->>'legacy_import' = 'true') AS imported_legacy_history;

-- --------------------------------------------------------------------
-- PHẦN 17C: DROP system_logs SAU KHI ĐÃ MIGRATE LỊCH SỬ
-- --------------------------------------------------------------------
-- Backend hiện tại đã ngừng read/write bảng system_logs. Lệnh DROP dùng
-- RESTRICT mặc định: nếu còn dependency, PostgreSQL sẽ báo lỗi và không
-- xóa dây chuyền các object khác.
DROP TABLE IF EXISTS system_logs;

-- ====================================================================
-- PHAN 18: MANUAL SELECTION CHO VOLUME OPTIMIZATION
-- ====================================================================
-- An toan khi chay lai. Khong thay doi thuat toan auto hien tai.

ALTER TABLE lot_threshold_analysis ADD COLUMN IF NOT EXISTS profit_factor NUMERIC;
ALTER TABLE lot_threshold_analysis ADD COLUMN IF NOT EXISTS recovery_factor NUMERIC;
ALTER TABLE lot_threshold_analysis ADD COLUMN IF NOT EXISTS sharpe_ratio NUMERIC;
ALTER TABLE lot_threshold_analysis ADD COLUMN IF NOT EXISTS largest_loss_trade NUMERIC;
ALTER TABLE lot_threshold_analysis ADD COLUMN IF NOT EXISTS largest_profit_trade NUMERIC;
ALTER TABLE lot_threshold_analysis ADD COLUMN IF NOT EXISTS largest_profit_trade_ratio NUMERIC;
ALTER TABLE lot_threshold_analysis ADD COLUMN IF NOT EXISTS risk_reward_ratio NUMERIC;
ALTER TABLE lot_threshold_analysis ADD COLUMN IF NOT EXISTS lr_correlation NUMERIC;
ALTER TABLE lot_threshold_analysis ADD COLUMN IF NOT EXISTS avg_profit NUMERIC;
ALTER TABLE lot_threshold_analysis ADD COLUMN IF NOT EXISTS avg_loss NUMERIC;
ALTER TABLE lot_threshold_analysis ADD COLUMN IF NOT EXISTS metrics_complete BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE lot_threshold_analysis ADD COLUMN IF NOT EXISTS the_chosen_one BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE lot_threshold_final ADD COLUMN IF NOT EXISTS selection_type VARCHAR(16) NOT NULL DEFAULT 'AUTO';
ALTER TABLE lot_threshold_final ADD COLUMN IF NOT EXISTS selected_by INTEGER;
ALTER TABLE lot_threshold_final ADD COLUMN IF NOT EXISTS selected_at TIMESTAMP;
ALTER TABLE lot_threshold_final ADD COLUMN IF NOT EXISTS auto_lot_threshold INTEGER;

UPDATE lot_threshold_final
SET selection_type = CASE WHEN is_fallback THEN 'FALLBACK' ELSE 'AUTO' END,
    selected_at = COALESCE(selected_at, computed_at),
    auto_lot_threshold = COALESCE(auto_lot_threshold, lot_threshold);

UPDATE lot_threshold_analysis a
SET profit_factor = f.profit_factor,
    recovery_factor = f.recovery_factor,
    sharpe_ratio = f.sharpe_ratio,
    largest_loss_trade = f.largest_loss_trade,
    largest_profit_trade = f.largest_profit_trade,
    largest_profit_trade_ratio = f.largest_profit_trade_ratio,
    risk_reward_ratio = f.risk_reward_ratio,
    lr_correlation = f.lr_correlation,
    avg_profit = f.avg_profit,
    avg_loss = f.avg_loss,
    metrics_complete = TRUE,
    the_chosen_one = TRUE
FROM lot_threshold_final f
WHERE a.analysis_run_id = f.analysis_run_id
  AND a.strategy_id = f.strategy_id
  AND a.source_table = f.source_table
  AND a.lot_threshold = f.lot_threshold;

CREATE UNIQUE INDEX IF NOT EXISTS uq_chosen_one_per_strategy
  ON lot_threshold_analysis (analysis_run_id, strategy_id, source_table)
  WHERE the_chosen_one = TRUE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_lot_final_selection_type'
  ) THEN
    ALTER TABLE lot_threshold_final
      ADD CONSTRAINT chk_lot_final_selection_type
      CHECK (selection_type IN ('AUTO', 'FALLBACK', 'MANUAL'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_lot_final_selected_candidate'
  ) AND NOT EXISTS (
    SELECT 1
    FROM lot_threshold_final f
    LEFT JOIN lot_threshold_analysis a
      ON a.analysis_run_id = f.analysis_run_id
     AND a.strategy_id = f.strategy_id
     AND a.source_table = f.source_table
     AND a.lot_threshold = f.lot_threshold
    WHERE a.analysis_run_id IS NULL
  ) THEN
    ALTER TABLE lot_threshold_final
      ADD CONSTRAINT fk_lot_final_selected_candidate
      FOREIGN KEY (analysis_run_id, strategy_id, source_table, lot_threshold)
      REFERENCES lot_threshold_analysis (analysis_run_id, strategy_id, source_table, lot_threshold);
  END IF;
END $$;

-- Audit: moi final row phai co dung mot candidate duoc chon.
SELECT f.analysis_run_id, f.strategy_id, f.source_table,
       COUNT(a.*) FILTER (WHERE a.the_chosen_one) AS chosen_count
FROM lot_threshold_final f
LEFT JOIN lot_threshold_analysis a
  ON a.analysis_run_id = f.analysis_run_id
 AND a.strategy_id = f.strategy_id
 AND a.source_table = f.source_table
GROUP BY f.analysis_run_id, f.strategy_id, f.source_table
HAVING COUNT(a.*) FILTER (WHERE a.the_chosen_one) <> 1;

-- --------------------------------------------------------------------
-- PHAN 19: GO BO TOAN BO SCHEMA MT5 OPTIMIZATION CU
-- Chay lai an toan: cac lenh deu kiem tra ton tai truoc khi xoa.
-- Khong anh huong Volume Optimization hoac cac bang backtest dong.
-- --------------------------------------------------------------------

-- Xoa notification MT5 truoc khi bo cac bang nghiep vu.
DELETE FROM user_notifications
WHERE event_type LIKE 'mt5\_%' ESCAPE '\'
   OR entity_type LIKE 'mt5\_%' ESCAPE '\'
   OR event_type IN (
     'open_price_completed',
     'open_price_failed',
     'every_tick_completed',
     'every_tick_failed',
     'auto_every_tick_completed',
     'auto_every_tick_failed'
   );

-- Xoa moi table co tien to mt5_, ke ca cac table MT5 bo sung ve sau.
DO $$
DECLARE
  target_table RECORD;
BEGIN
  FOR target_table IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename LIKE 'mt5\_%' ESCAPE '\'
  LOOP
    EXECUTE format(
      'DROP TABLE IF EXISTS %I.%I CASCADE',
      target_table.schemaname,
      target_table.tablename
    );
  END LOOP;
END $$;

-- Xoa sequence MT5 con sot lai sau khi drop table.
DO $$
DECLARE
  target_sequence RECORD;
BEGIN
  FOR target_sequence IN
    SELECT sequence_schema, sequence_name
    FROM information_schema.sequences
    WHERE sequence_schema = 'public'
      AND (
        sequence_name LIKE 'mt5\_%' ESCAPE '\'
        OR sequence_name = 'seq_otm_request_id'
      )
  LOOP
    EXECUTE format(
      'DROP SEQUENCE IF EXISTS %I.%I CASCADE',
      target_sequence.sequence_schema,
      target_sequence.sequence_name
    );
  END LOOP;
END $$;

-- Xoa lien ket MT5 tung duoc gan vao strategy_metadata.
DROP INDEX IF EXISTS idx_strategy_metadata_active_job;
ALTER TABLE IF EXISTS strategy_metadata
  DROP COLUMN IF EXISTS active_every_tick_job_id;

-- ====================================================================
-- PHAN 20: TAO LAI MT5 OPTIMIZATION THEO SESSION - PHA DU LIEU MT5 CU
-- ====================================================================
-- CANH BAO:
-- - Phan nay chi chay khi nang cap database dang dung schema MT5 cu.
-- - Toan bo bang mt5_* va bang api_keys se bi xoa roi tao lai.
-- - Khong anh huong users, data_source, backtest*, Volume Optimization.
-- - Database moi khong can chay tay: backend se CREATE IF NOT EXISTS khi restart.

BEGIN;

DO $$
DECLARE
  target_table RECORD;
BEGIN
  FOR target_table IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename LIKE 'mt5\_%' ESCAPE '\'
  LOOP
    EXECUTE format(
      'DROP TABLE IF EXISTS %I.%I CASCADE',
      target_table.schemaname,
      target_table.tablename
    );
  END LOOP;
END
$$;

DROP TABLE IF EXISTS api_keys CASCADE;
DROP FUNCTION IF EXISTS set_mt5_updated_at() CASCADE;

CREATE OR REPLACE FUNCTION set_mt5_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE SEQUENCE mt5_session_id_seq;
CREATE SEQUENCE mt5_job_id_seq;

CREATE TABLE mt5_sessions (
  id VARCHAR(40) PRIMARY KEY
    DEFAULT ('session-' || nextval('mt5_session_id_seq')),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT uq_mt5_sessions_id_user UNIQUE (id, user_id),
  CONSTRAINT ck_mt5_sessions_archive_time CHECK (
    (status = 'ACTIVE' AND archived_at IS NULL)
    OR (status = 'ARCHIVED' AND archived_at IS NOT NULL)
  )
);

CREATE INDEX idx_mt5_sessions_user_updated
  ON mt5_sessions(user_id, updated_at DESC);

CREATE TRIGGER trg_mt5_sessions_updated_at
BEFORE UPDATE ON mt5_sessions
FOR EACH ROW EXECUTE FUNCTION set_mt5_updated_at();

CREATE TABLE api_keys (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  api_key VARCHAR(255) NOT NULL UNIQUE,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['mt5:worker']::TEXT[],
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'REVOKED')),
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  CONSTRAINT uq_api_keys_user_name UNIQUE (user_id, name),
  CONSTRAINT ck_api_keys_scope_not_empty CHECK (cardinality(scopes) > 0),
  CONSTRAINT ck_api_keys_revoke_time CHECK (
    (status = 'ACTIVE' AND revoked_at IS NULL)
    OR (status = 'REVOKED' AND revoked_at IS NOT NULL)
  )
);

CREATE INDEX idx_api_keys_user_status
  ON api_keys(user_id, status);

CREATE TABLE mt5_workers (
  id BIGSERIAL PRIMARY KEY,
  owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_username VARCHAR(255) NOT NULL,
  api_key_id BIGINT REFERENCES api_keys(id) ON DELETE SET NULL,
  worker_instance_id UUID,
  worker_name VARCHAR(160) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OFFLINE'
    CHECK (status IN ('OFFLINE', 'ONLINE', 'BUSY', 'DRAINING', 'BLOCKED')),
  run_access BOOLEAN NOT NULL DEFAULT FALSE,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  allowed_job_types TEXT[] NOT NULL
    DEFAULT ARRAY['OPEN_PRICE', 'EVERY_TICK']::TEXT[],
  capabilities JSONB NOT NULL DEFAULT '{}'::JSONB,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_mt5_workers_owner_name UNIQUE (owner_user_id, worker_name),
  CONSTRAINT uq_mt5_workers_owner_instance UNIQUE (owner_user_id, worker_instance_id),
  CONSTRAINT ck_mt5_workers_job_types_not_empty
    CHECK (cardinality(allowed_job_types) > 0),
  CONSTRAINT ck_mt5_workers_job_types_valid
    CHECK (allowed_job_types <@ ARRAY['OPEN_PRICE', 'EVERY_TICK']::TEXT[]),
  CONSTRAINT ck_mt5_workers_capabilities_object
    CHECK (jsonb_typeof(capabilities) = 'object')
);

CREATE INDEX idx_mt5_workers_dispatch
  ON mt5_workers(status, run_access, is_public, last_seen_at DESC);

CREATE INDEX idx_mt5_workers_api_key
  ON mt5_workers(api_key_id)
  WHERE api_key_id IS NOT NULL;

CREATE TRIGGER trg_mt5_workers_updated_at
BEFORE UPDATE ON mt5_workers
FOR EACH ROW EXECUTE FUNCTION set_mt5_updated_at();

CREATE TABLE mt5_job_queue (
  job_id VARCHAR(40) PRIMARY KEY
    DEFAULT ('job-' || nextval('mt5_job_id_seq')),
  session_id VARCHAR(40) NOT NULL,
  user_id INTEGER NOT NULL,
  job_type VARCHAR(24) NOT NULL
    CHECK (job_type IN ('OPEN_PRICE', 'EVERY_TICK')),
  status VARCHAR(24) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN (
      'PENDING', 'CLAIMED', 'RUNNING', 'DONE', 'FAILED', 'CANCELLED'
    )),
  priority INTEGER NOT NULL DEFAULT 0,
  strategy_id VARCHAR(160),
  target_strategy_id_r VARCHAR(220),
  ini_content TEXT NOT NULL,
  job_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  input_artifact_path TEXT,
  claimed_by_worker_id BIGINT REFERENCES mt5_workers(id) ON DELETE SET NULL,
  run_id UUID,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  progress SMALLINT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  lease_expires_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ,
  error_code VARCHAR(80),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_mt5_queue_session_owner
    FOREIGN KEY (session_id, user_id)
    REFERENCES mt5_sessions(id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT ck_mt5_queue_payload_object
    CHECK (jsonb_typeof(job_payload) = 'object'),
  CONSTRAINT ck_mt5_queue_every_tick_target CHECK (
    (job_type = 'OPEN_PRICE' AND target_strategy_id_r IS NULL)
    OR (job_type = 'EVERY_TICK' AND target_strategy_id_r IS NOT NULL)
  )
);

CREATE INDEX idx_mt5_queue_claim
  ON mt5_job_queue(status, job_type, priority DESC, created_at)
  WHERE status = 'PENDING';

CREATE INDEX idx_mt5_queue_session_created
  ON mt5_job_queue(session_id, created_at DESC);

CREATE INDEX idx_mt5_queue_user_created
  ON mt5_job_queue(user_id, created_at DESC);

CREATE INDEX idx_mt5_queue_worker_active
  ON mt5_job_queue(claimed_by_worker_id, status)
  WHERE status IN ('CLAIMED', 'RUNNING');

CREATE UNIQUE INDEX uq_mt5_queue_active_run
  ON mt5_job_queue(run_id)
  WHERE run_id IS NOT NULL;

CREATE TRIGGER trg_mt5_job_queue_updated_at
BEFORE UPDATE ON mt5_job_queue
FOR EACH ROW EXECUTE FUNCTION set_mt5_updated_at();

CREATE TABLE mt5_optimize_results (
  id BIGSERIAL PRIMARY KEY,
  session_id VARCHAR(40) NOT NULL,
  user_id INTEGER NOT NULL,
  strategy_id VARCHAR(160) NOT NULL,
  strategy_id_r VARCHAR(220)
    GENERATED ALWAYS AS (strategy_id || '_' || id::TEXT) STORED,
  summary_op JSONB NOT NULL,
  picked_watchlist BOOLEAN NOT NULL DEFAULT FALSE,
  picked_bt BOOLEAN NOT NULL DEFAULT FALSE,
  picked_bt_staging BOOLEAN NOT NULL DEFAULT FALSE,
  summary_bt JSONB,
  deals JSONB,
  backtest_completed_at TIMESTAMPTZ,
  backtest_run_count INTEGER NOT NULL DEFAULT 0
    CHECK (backtest_run_count >= 0),
  staging_target_table VARCHAR(255),
  source_table VARCHAR(255),
  sync_status VARCHAR(20) NOT NULL DEFAULT 'NOT_SYNCED'
    CHECK (sync_status IN (
      'NOT_SYNCED', 'SYNCING', 'SYNCED', 'SYNC_FAILED'
    )),
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_mt5_result_session_owner
    FOREIGN KEY (session_id, user_id)
    REFERENCES mt5_sessions(id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT uq_mt5_result_strategy_r UNIQUE (strategy_id_r),
  CONSTRAINT ck_mt5_result_summary_op_object
    CHECK (jsonb_typeof(summary_op) = 'object'),
  CONSTRAINT ck_mt5_result_summary_op_shape CHECK (
    summary_op ? 'pass'
    AND summary_op ? 'inputs'
    AND summary_op ? 'metrics'
    AND jsonb_typeof(summary_op -> 'inputs') = 'object'
    AND jsonb_typeof(summary_op -> 'metrics') = 'object'
  ),
  CONSTRAINT ck_mt5_result_backtest_payload CHECK (
    (
      summary_bt IS NULL
      AND deals IS NULL
      AND backtest_completed_at IS NULL
    )
    OR
    (
      summary_bt IS NOT NULL
      AND jsonb_typeof(summary_bt) = 'object'
      AND summary_bt ? 'settings'
      AND summary_bt ? 'results'
      AND jsonb_typeof(summary_bt -> 'settings') = 'object'
      AND jsonb_typeof(summary_bt -> 'results') = 'object'
      AND summary_bt -> 'settings' <> '{}'::JSONB
      AND summary_bt -> 'results' <> '{}'::JSONB
      AND deals IS NOT NULL
      AND jsonb_typeof(deals) = 'array'
      AND jsonb_array_length(deals) > 0
      AND backtest_completed_at IS NOT NULL
    )
  ),
  CONSTRAINT ck_mt5_result_staging_requires_backtest
    CHECK (NOT picked_bt_staging OR summary_bt IS NOT NULL),

  CONSTRAINT ck_mt5_result_staging_table_name CHECK (
    staging_target_table IS NULL
    OR staging_target_table ~ '^backtest[a-zA-Z0-9_]*$'
  ),
  CONSTRAINT ck_mt5_result_source_table_name CHECK (
    source_table IS NULL
    OR source_table ~ '^backtest[a-zA-Z0-9_]*$'
  ),
  CONSTRAINT ck_mt5_result_sync_fields CHECK (
    (
      sync_status = 'SYNCED'
      AND source_table IS NOT NULL
      AND synced_at IS NOT NULL
    )
    OR
    (
      sync_status <> 'SYNCED'
      AND source_table IS NULL
      AND synced_at IS NULL
    )
  )
);

CREATE INDEX idx_mt5_results_session_strategy
  ON mt5_optimize_results(session_id, strategy_id, id);

CREATE INDEX idx_mt5_results_watchlist
  ON mt5_optimize_results(session_id, updated_at DESC)
  WHERE picked_watchlist = TRUE;

CREATE INDEX idx_mt5_results_bt_candidates
  ON mt5_optimize_results(session_id, updated_at DESC)
  WHERE picked_bt = TRUE;

CREATE INDEX idx_mt5_results_staging
  ON mt5_optimize_results(session_id, updated_at DESC)
  WHERE picked_bt_staging = TRUE;

CREATE INDEX idx_mt5_results_source_table
  ON mt5_optimize_results(session_id, source_table)
  WHERE source_table IS NOT NULL;

CREATE UNIQUE INDEX uq_mt5_one_staging_result_per_strategy
  ON mt5_optimize_results(session_id, strategy_id)
  WHERE picked_bt_staging = TRUE;

CREATE TRIGGER trg_mt5_optimize_results_updated_at
BEFORE UPDATE ON mt5_optimize_results
FOR EACH ROW EXECUTE FUNCTION set_mt5_updated_at();

CREATE TABLE mt5_logs (
  id BIGSERIAL PRIMARY KEY,
  session_id VARCHAR(40) REFERENCES mt5_sessions(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  job_id VARCHAR(40) REFERENCES mt5_job_queue(job_id) ON DELETE SET NULL,
  worker_id BIGINT REFERENCES mt5_workers(id) ON DELETE SET NULL,
  level VARCHAR(16) NOT NULL
    CHECK (level IN ('INFO', 'WARN', 'ERROR')),
  event_type VARCHAR(80) NOT NULL,
  message TEXT NOT NULL,
  context JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_mt5_logs_context_object
    CHECK (jsonb_typeof(context) = 'object')
);

CREATE INDEX idx_mt5_logs_session_created
  ON mt5_logs(session_id, created_at DESC);

CREATE INDEX idx_mt5_logs_job_created
  ON mt5_logs(job_id, created_at DESC)
  WHERE job_id IS NOT NULL;

CREATE INDEX idx_mt5_logs_errors
  ON mt5_logs(created_at DESC)
  WHERE level = 'ERROR';

COMMIT;

-- Audit sau migrate: phai tra ve dung 6 bang.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'mt5_sessions',
    'api_keys',
    'mt5_workers',
    'mt5_job_queue',
    'mt5_optimize_results',
    'mt5_logs'
  )
ORDER BY table_name;

-- MT5 worker moi phai duoc user cap quyen truoc khi nhan job.
-- Lenh nay an toan voi database da co schema moi va khong thu hoi quyen
-- cua cac worker da duoc user Allow truoc do.
ALTER TABLE IF EXISTS mt5_workers
  ALTER COLUMN run_access SET DEFAULT FALSE;

-- ============================================================================
-- PHAN 21: NANG CAP MT5 WORKER UUID -> BIGINT VA LUU OWNER USERNAME
-- Chay backend/worker o trang thai dung de tranh claim job trong luc migrate.
-- Phan nay giu nguyen worker, job, log va lien ket hien co.
-- ============================================================================
BEGIN;

DO $$
DECLARE
  current_id_type TEXT;
  dependency RECORD;
  primary_key_name TEXT;
BEGIN
  IF to_regclass('public.mt5_workers') IS NULL THEN
    RAISE NOTICE 'mt5_workers chua ton tai; bo qua PHAN 21';
    RETURN;
  END IF;

  ALTER TABLE mt5_workers
    ADD COLUMN IF NOT EXISTS owner_username VARCHAR(255);

  UPDATE mt5_workers w
     SET owner_username = COALESCE(u.username, 'user_' || w.owner_user_id::TEXT)
    FROM users u
   WHERE u.id = w.owner_user_id
     AND w.owner_username IS DISTINCT FROM u.username;

  IF EXISTS (SELECT 1 FROM mt5_workers WHERE owner_username IS NULL) THEN
    RAISE EXCEPTION 'Khong the dien owner_username cho mot so mt5_workers';
  END IF;

  ALTER TABLE mt5_workers
    ALTER COLUMN owner_username SET NOT NULL;

  SELECT data_type
    INTO current_id_type
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'mt5_workers'
     AND column_name = 'id';

  IF current_id_type = 'uuid' THEN
    ALTER TABLE mt5_workers ADD COLUMN id_new BIGSERIAL;

    ALTER TABLE mt5_job_queue
      ADD COLUMN claimed_by_worker_id_new BIGINT;
    UPDATE mt5_job_queue q
       SET claimed_by_worker_id_new = w.id_new
      FROM mt5_workers w
     WHERE q.claimed_by_worker_id = w.id;

    ALTER TABLE mt5_logs
      ADD COLUMN worker_id_new BIGINT;
    UPDATE mt5_logs l
       SET worker_id_new = w.id_new
      FROM mt5_workers w
     WHERE l.worker_id = w.id;

    FOR dependency IN
      SELECT conrelid::regclass AS relation_name, conname
        FROM pg_constraint
       WHERE contype = 'f'
         AND confrelid = 'public.mt5_workers'::regclass
    LOOP
      EXECUTE format(
        'ALTER TABLE %s DROP CONSTRAINT %I',
        dependency.relation_name,
        dependency.conname
      );
    END LOOP;

    SELECT conname
      INTO primary_key_name
      FROM pg_constraint
     WHERE contype = 'p'
       AND conrelid = 'public.mt5_workers'::regclass;

    IF primary_key_name IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE mt5_workers DROP CONSTRAINT %I',
        primary_key_name
      );
    END IF;

    ALTER TABLE mt5_job_queue DROP COLUMN claimed_by_worker_id;
    ALTER TABLE mt5_job_queue
      RENAME COLUMN claimed_by_worker_id_new TO claimed_by_worker_id;

    ALTER TABLE mt5_logs DROP COLUMN worker_id;
    ALTER TABLE mt5_logs RENAME COLUMN worker_id_new TO worker_id;

    ALTER TABLE mt5_workers DROP COLUMN id;
    ALTER TABLE mt5_workers RENAME COLUMN id_new TO id;
    ALTER TABLE mt5_workers ADD PRIMARY KEY (id);

    ALTER TABLE mt5_job_queue
      ADD CONSTRAINT mt5_job_queue_claimed_by_worker_id_fkey
      FOREIGN KEY (claimed_by_worker_id)
      REFERENCES mt5_workers(id)
      ON DELETE SET NULL;

    ALTER TABLE mt5_logs
      ADD CONSTRAINT mt5_logs_worker_id_fkey
      FOREIGN KEY (worker_id)
      REFERENCES mt5_workers(id)
      ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_mt5_queue_worker_active
      ON mt5_job_queue(claimed_by_worker_id, status)
      WHERE status IN ('CLAIMED', 'RUNNING');
  ELSIF current_id_type <> 'bigint' THEN
    RAISE EXCEPTION 'Kieu mt5_workers.id khong duoc ho tro: %', current_id_type;
  END IF;
END
$$;

COMMIT;

-- Kiem tra sau migrate: id worker va hai FK phai la bigint.
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'mt5_workers' AND column_name IN ('id', 'owner_username'))
    OR (table_name = 'mt5_job_queue' AND column_name = 'claimed_by_worker_id')
    OR (table_name = 'mt5_logs' AND column_name = 'worker_id')
  )
ORDER BY table_name, column_name;

-- ============================================================================
-- PHAN 22: DEM SO LAN EVERY TICK VA RESET BACKTEST PICK SAU KHI HOAN TAT
-- ============================================================================
BEGIN;

ALTER TABLE mt5_optimize_results
  ADD COLUMN IF NOT EXISTS backtest_run_count INTEGER NOT NULL DEFAULT 0;

UPDATE mt5_optimize_results
   SET backtest_run_count = 1
 WHERE summary_bt IS NOT NULL
   AND backtest_run_count = 0;

ALTER TABLE mt5_optimize_results
  DROP CONSTRAINT IF EXISTS ck_mt5_result_staging_requires_candidate;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'ck_mt5_result_backtest_run_count'
       AND conrelid = 'mt5_optimize_results'::regclass
  ) THEN
    ALTER TABLE mt5_optimize_results
      ADD CONSTRAINT ck_mt5_result_backtest_run_count
      CHECK (backtest_run_count >= 0);
  END IF;
END
$$;

COMMENT ON COLUMN mt5_optimize_results.backtest_run_count IS
  'Tong so lan bo tham so da hoan tat Every Tick; tang 1 sau moi callback thanh cong.';

COMMIT;

SELECT id, strategy_id_r, backtest_run_count, picked_bt, backtest_completed_at
FROM mt5_optimize_results
WHERE backtest_run_count > 0
ORDER BY backtest_completed_at DESC;

-- ============================================================================
-- PHAN 23: DOI KHOA MT5 SESSION/JOB SANG MA NGAN THAT
-- ============================================================================
BEGIN;

TRUNCATE TABLE
  mt5_logs,
  mt5_optimize_results,
  mt5_job_queue,
  mt5_workers,
  api_keys,
  mt5_sessions
RESTART IDENTITY CASCADE;

CREATE SEQUENCE IF NOT EXISTS mt5_session_id_seq;
CREATE SEQUENCE IF NOT EXISTS mt5_job_id_seq;

ALTER TABLE mt5_job_queue DROP CONSTRAINT IF EXISTS fk_mt5_queue_session_owner;
ALTER TABLE mt5_optimize_results DROP CONSTRAINT IF EXISTS fk_mt5_result_session_owner;
ALTER TABLE mt5_logs DROP CONSTRAINT IF EXISTS mt5_logs_session_id_fkey;
ALTER TABLE mt5_logs DROP CONSTRAINT IF EXISTS mt5_logs_job_id_fkey;

ALTER TABLE mt5_sessions ALTER COLUMN id TYPE VARCHAR(40) USING id::TEXT;
ALTER TABLE mt5_job_queue ALTER COLUMN job_id TYPE VARCHAR(40) USING job_id::TEXT;
ALTER TABLE mt5_job_queue ALTER COLUMN session_id TYPE VARCHAR(40) USING session_id::TEXT;
ALTER TABLE mt5_optimize_results ALTER COLUMN session_id TYPE VARCHAR(40) USING session_id::TEXT;
ALTER TABLE mt5_logs ALTER COLUMN session_id TYPE VARCHAR(40) USING session_id::TEXT;
ALTER TABLE mt5_logs ALTER COLUMN job_id TYPE VARCHAR(40) USING job_id::TEXT;

ALTER TABLE mt5_sessions DROP COLUMN IF EXISTS session_no;
ALTER TABLE mt5_job_queue DROP COLUMN IF EXISTS job_no;

ALTER TABLE mt5_sessions
  ALTER COLUMN id SET DEFAULT ('session-' || nextval('mt5_session_id_seq'));
ALTER TABLE mt5_job_queue
  ALTER COLUMN job_id SET DEFAULT ('job-' || nextval('mt5_job_id_seq'));

ALTER SEQUENCE mt5_session_id_seq RESTART WITH 1;
ALTER SEQUENCE mt5_job_id_seq RESTART WITH 1;

ALTER TABLE mt5_job_queue
  ADD CONSTRAINT fk_mt5_queue_session_owner
  FOREIGN KEY (session_id,user_id) REFERENCES mt5_sessions(id,user_id) ON DELETE CASCADE;
ALTER TABLE mt5_optimize_results
  ADD CONSTRAINT fk_mt5_result_session_owner
  FOREIGN KEY (session_id,user_id) REFERENCES mt5_sessions(id,user_id) ON DELETE CASCADE;
ALTER TABLE mt5_logs
  ADD CONSTRAINT mt5_logs_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES mt5_sessions(id) ON DELETE CASCADE;
ALTER TABLE mt5_logs
  ADD CONSTRAINT mt5_logs_job_id_fkey
  FOREIGN KEY (job_id) REFERENCES mt5_job_queue(job_id) ON DELETE SET NULL;

COMMIT;

SELECT id, name FROM mt5_sessions ORDER BY created_at;
SELECT job_id, job_type, status FROM mt5_job_queue ORDER BY created_at DESC;

-- ============================================================================
-- PHAN 24: TACH EVERY TICK CANDIDATE VA BACKTEST STAGING (SCHEMA 8 BANG)
-- ============================================================================
-- Cach chay:
-- 1. Database da remake 6 bang: dung backend/worker va chay rieng PHAN 24.
-- 2. Database MT5 legacy: chay tu PHAN 19 den het PHAN 24.
-- 3. Database moi: co the dung migration1.sql hoac restart backend moi.
--
-- PHAN 24 bao toan Open Price va payload Every Tick gan nhat dang co.
-- Schema cu ghi de payload khi rerun nen khong the phuc hoi payload lich su da mat.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.mt5_sessions') IS NULL
     OR to_regclass('public.mt5_optimize_results') IS NULL
     OR to_regclass('public.mt5_job_queue') IS NULL THEN
    RAISE EXCEPTION 'PHAN 24 aborted: schema remake 6 bang chua ton tai; database legacy phai chay tu PHAN 19';
  END IF;

  IF EXISTS (
    SELECT 1 FROM mt5_job_queue WHERE status IN ('CLAIMED','RUNNING')
  ) THEN
    RAISE EXCEPTION 'PHAN 24 aborted: van con MT5 job CLAIMED/RUNNING';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname='uq_mt5_result_candidate_owner'
       AND conrelid='mt5_optimize_results'::regclass
  ) THEN
    ALTER TABLE mt5_optimize_results
      ADD CONSTRAINT uq_mt5_result_candidate_owner
      UNIQUE (id,session_id,user_id,strategy_id,strategy_id_r);
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.mt5_backtest_candidates') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='mt5_backtest_candidates'
          AND column_name='ingest_key'
     )
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='mt5_backtest_candidates'
          AND column_name='source_run_id'
     ) THEN
    ALTER TABLE mt5_backtest_candidates RENAME COLUMN ingest_key TO source_run_id;
  END IF;

  IF to_regclass('public.mt5_backtest_candidates') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM pg_constraint
        WHERE conrelid=to_regclass('public.mt5_backtest_candidates')
          AND conname='uq_mt5_candidate_ingest'
     )
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
        WHERE conrelid=to_regclass('public.mt5_backtest_candidates')
          AND conname='uq_mt5_candidate_source_run'
     ) THEN
    ALTER TABLE mt5_backtest_candidates
      RENAME CONSTRAINT uq_mt5_candidate_ingest TO uq_mt5_candidate_source_run;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS mt5_backtest_candidates (
  id BIGSERIAL PRIMARY KEY,
  session_id VARCHAR(40) NOT NULL,
  user_id INTEGER NOT NULL,
  optimize_result_id BIGINT NOT NULL,
  strategy_id VARCHAR(160) NOT NULL,
  strategy_id_r VARCHAR(220) NOT NULL,
  backtest_run_no INTEGER NOT NULL CHECK (backtest_run_no>0),
  source_run_id UUID NOT NULL,
  summary_bt JSONB NOT NULL,
  deals JSONB NOT NULL,
  net_profit NUMERIC,
  total_trades INTEGER,
  balance_drawdown_percent NUMERIC,
  balance_drawdown_value NUMERIC,
  profit_factor NUMERIC,
  recovery_factor NUMERIC,
  sharpe_ratio NUMERIC,
  pd_ratio NUMERIC,
  largest_loss_trade NUMERIC,
  expected_payoff NUMERIC,
  backtest_completed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_mt5_candidate_session_owner
    FOREIGN KEY(session_id,user_id) REFERENCES mt5_sessions(id,user_id) ON DELETE CASCADE,
  CONSTRAINT fk_mt5_candidate_optimize_result
    FOREIGN KEY(optimize_result_id,session_id,user_id,strategy_id,strategy_id_r)
    REFERENCES mt5_optimize_results(id,session_id,user_id,strategy_id,strategy_id_r) ON DELETE CASCADE,
  CONSTRAINT uq_mt5_candidate_source_run UNIQUE(source_run_id),
  CONSTRAINT uq_mt5_candidate_result_run UNIQUE(optimize_result_id,backtest_run_no),
  CONSTRAINT uq_mt5_candidate_staging_owner UNIQUE(id,session_id,user_id,strategy_id),
  CONSTRAINT ck_mt5_candidate_summary_shape CHECK(
    jsonb_typeof(summary_bt)='object' AND summary_bt?'settings' AND summary_bt?'results'
    AND jsonb_typeof(summary_bt->'settings')='object'
    AND jsonb_typeof(summary_bt->'results')='object'
    AND summary_bt->'settings'<>'{}'::jsonb AND summary_bt->'results'<>'{}'::jsonb
  ),
  CONSTRAINT ck_mt5_candidate_deals CHECK(
    jsonb_typeof(deals)='array' AND jsonb_array_length(deals)>0
  )
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='mt5_optimize_results'
       AND column_name='summary_bt'
  ) THEN
    INSERT INTO mt5_backtest_candidates(
      session_id,user_id,optimize_result_id,strategy_id,strategy_id_r,
      backtest_run_no,source_run_id,summary_bt,deals,
      net_profit,total_trades,balance_drawdown_percent,balance_drawdown_value,
      profit_factor,recovery_factor,sharpe_ratio,pd_ratio,largest_loss_trade,
      expected_payoff,backtest_completed_at,created_at,updated_at
    )
    SELECT
      r.session_id,r.user_id,r.id,r.strategy_id,r.strategy_id_r,
      GREATEST(r.backtest_run_count,1),
      (SUBSTR(MD5('mt5-candidate-'||r.id::text),1,8)||'-'||
       SUBSTR(MD5('mt5-candidate-'||r.id::text),9,4)||'-'||
       SUBSTR(MD5('mt5-candidate-'||r.id::text),13,4)||'-'||
       SUBSTR(MD5('mt5-candidate-'||r.id::text),17,4)||'-'||
       SUBSTR(MD5('mt5-candidate-'||r.id::text),21,12))::uuid,
      r.summary_bt,r.deals,
      COALESCE(NULLIF(regexp_replace(COALESCE(
        r.summary_bt->'results'->>'Profit',r.summary_bt->'results'->>'Total Net Profit','0'
      ),'[^0-9.-]','','g'),'')::numeric,0),
      COALESCE(NULLIF(regexp_replace(COALESCE(
        r.summary_bt->'results'->>'Trades',r.summary_bt->'results'->>'Total Trades','0'
      ),'[^0-9.-]','','g'),'')::numeric,0)::integer,
      COALESCE(NULLIF(replace(substring(COALESCE(
        r.summary_bt->'results'->>'Balance Drawdown Maximal',r.summary_bt->'results'->>'Balance DD',''
      ) FROM '\\((-?[0-9.,]+)%\\)'),',','.'),'')::numeric,0),
      ABS(COALESCE(NULLIF(regexp_replace(split_part(COALESCE(
        r.summary_bt->'results'->>'Balance Drawdown Maximal',r.summary_bt->'results'->>'Balance DD','0'
      ),'(',1),'[^0-9.-]','','g'),'')::numeric,0)),
      COALESCE(NULLIF(regexp_replace(COALESCE(r.summary_bt->'results'->>'Profit Factor','0'),'[^0-9.-]','','g'),'')::numeric,0),
      COALESCE(NULLIF(regexp_replace(COALESCE(r.summary_bt->'results'->>'Recovery Factor','0'),'[^0-9.-]','','g'),'')::numeric,0),
      COALESCE(NULLIF(regexp_replace(COALESCE(r.summary_bt->'results'->>'Sharpe Ratio','0'),'[^0-9.-]','','g'),'')::numeric,0),
      CASE WHEN ABS(COALESCE(NULLIF(regexp_replace(split_part(COALESCE(
        r.summary_bt->'results'->>'Balance Drawdown Maximal',r.summary_bt->'results'->>'Balance DD','0'
      ),'(',1),'[^0-9.-]','','g'),'')::numeric,0))>0
      THEN COALESCE(NULLIF(regexp_replace(COALESCE(
        r.summary_bt->'results'->>'Profit',r.summary_bt->'results'->>'Total Net Profit','0'
      ),'[^0-9.-]','','g'),'')::numeric,0)
      / ABS(COALESCE(NULLIF(regexp_replace(split_part(COALESCE(
        r.summary_bt->'results'->>'Balance Drawdown Maximal',r.summary_bt->'results'->>'Balance DD','0'
      ),'(',1),'[^0-9.-]','','g'),'')::numeric,0)) ELSE 0 END,
      COALESCE(NULLIF(regexp_replace(COALESCE(r.summary_bt->'results'->>'Largest Loss Trade','0'),'[^0-9.-]','','g'),'')::numeric,0),
      COALESCE(NULLIF(regexp_replace(COALESCE(r.summary_bt->'results'->>'Expected Payoff','0'),'[^0-9.-]','','g'),'')::numeric,0),
      r.backtest_completed_at,r.created_at,r.updated_at
    FROM mt5_optimize_results r
    WHERE r.summary_bt IS NOT NULL
      AND r.deals IS NOT NULL
      AND jsonb_typeof(r.deals)='array'
      AND jsonb_array_length(r.deals)>0
    ON CONFLICT(optimize_result_id,backtest_run_no) DO NOTHING;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS mt5_backtest_staging(
  id BIGSERIAL PRIMARY KEY,
  session_id VARCHAR(40) NOT NULL,
  user_id INTEGER NOT NULL,
  strategy_id VARCHAR(160) NOT NULL,
  candidate_id BIGINT NOT NULL,
  target_table VARCHAR(255),
  source_table VARCHAR(255),
  sync_status VARCHAR(20) NOT NULL DEFAULT 'NOT_SYNCED'
    CHECK(sync_status IN('NOT_SYNCED','SYNCING','SYNCED','SYNC_FAILED')),
  selected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_mt5_staging_session_owner
    FOREIGN KEY(session_id,user_id) REFERENCES mt5_sessions(id,user_id) ON DELETE CASCADE,
  CONSTRAINT fk_mt5_staging_candidate
    FOREIGN KEY(candidate_id,session_id,user_id,strategy_id)
    REFERENCES mt5_backtest_candidates(id,session_id,user_id,strategy_id) ON DELETE CASCADE,
  CONSTRAINT uq_mt5_staging_session_strategy UNIQUE(session_id,strategy_id),
  CONSTRAINT ck_mt5_staging_target_table CHECK(target_table IS NULL OR target_table~'^backtest[a-zA-Z0-9_]*$'),
  CONSTRAINT ck_mt5_staging_source_table CHECK(source_table IS NULL OR source_table~'^backtest[a-zA-Z0-9_]*$'),
  CONSTRAINT ck_mt5_staging_sync_fields CHECK(
    (sync_status='SYNCED' AND source_table IS NOT NULL AND synced_at IS NOT NULL)
    OR(sync_status<>'SYNCED' AND source_table IS NULL AND synced_at IS NULL)
  )
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='mt5_optimize_results'
       AND column_name='picked_bt_staging'
  ) THEN
    INSERT INTO mt5_backtest_staging(
      session_id,user_id,strategy_id,candidate_id,target_table,source_table,
      sync_status,selected_at,synced_at,created_at,updated_at
    )
    SELECT r.session_id,r.user_id,r.strategy_id,c.id,r.staging_target_table,
           r.source_table,r.sync_status,COALESCE(r.updated_at,NOW()),r.synced_at,
           r.created_at,r.updated_at
      FROM mt5_optimize_results r
      JOIN mt5_backtest_candidates c
        ON c.optimize_result_id=r.id
       AND c.backtest_run_no=GREATEST(r.backtest_run_count,1)
     WHERE r.picked_bt_staging=TRUE
    ON CONFLICT(session_id,strategy_id) DO UPDATE SET
      candidate_id=EXCLUDED.candidate_id,
      target_table=EXCLUDED.target_table,
      source_table=EXCLUDED.source_table,
      sync_status=EXCLUDED.sync_status,
      selected_at=EXCLUDED.selected_at,
      synced_at=EXCLUDED.synced_at;
  END IF;
END
$$;

DROP INDEX IF EXISTS idx_mt5_results_staging;
DROP INDEX IF EXISTS idx_mt5_results_source_table;
DROP INDEX IF EXISTS uq_mt5_one_staging_result_per_strategy;

ALTER TABLE mt5_optimize_results
  DROP CONSTRAINT IF EXISTS ck_mt5_result_backtest_payload,
  DROP CONSTRAINT IF EXISTS ck_mt5_result_staging_requires_backtest,
  DROP CONSTRAINT IF EXISTS ck_mt5_result_staging_requires_candidate,
  DROP CONSTRAINT IF EXISTS ck_mt5_result_staging_table_name,
  DROP CONSTRAINT IF EXISTS ck_mt5_result_source_table_name,
  DROP CONSTRAINT IF EXISTS ck_mt5_result_sync_fields,
  DROP COLUMN IF EXISTS picked_bt_staging,
  DROP COLUMN IF EXISTS summary_bt,
  DROP COLUMN IF EXISTS deals,
  DROP COLUMN IF EXISTS backtest_completed_at,
  DROP COLUMN IF EXISTS staging_target_table,
  DROP COLUMN IF EXISTS source_table,
  DROP COLUMN IF EXISTS sync_status,
  DROP COLUMN IF EXISTS synced_at;

CREATE INDEX IF NOT EXISTS idx_mt5_bt_candidates_session_created ON mt5_backtest_candidates(session_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_mt5_bt_candidates_strategy ON mt5_backtest_candidates(session_id,strategy_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mt5_bt_candidates_result_run ON mt5_backtest_candidates(optimize_result_id,backtest_run_no DESC);
CREATE INDEX IF NOT EXISTS idx_mt5_bt_candidates_profit ON mt5_backtest_candidates(session_id,net_profit DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_mt5_bt_candidates_trades ON mt5_backtest_candidates(session_id,total_trades DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_mt5_bt_candidates_drawdown ON mt5_backtest_candidates(session_id,balance_drawdown_percent,id DESC);
CREATE INDEX IF NOT EXISTS idx_mt5_bt_candidates_pf ON mt5_backtest_candidates(session_id,profit_factor DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_mt5_bt_candidates_recovery ON mt5_backtest_candidates(session_id,recovery_factor DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_mt5_bt_candidates_sharpe ON mt5_backtest_candidates(session_id,sharpe_ratio DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_mt5_bt_candidates_pd ON mt5_backtest_candidates(session_id,pd_ratio DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_mt5_bt_candidates_largest_loss ON mt5_backtest_candidates(session_id,largest_loss_trade,id DESC);
CREATE INDEX IF NOT EXISTS idx_mt5_staging_session_updated ON mt5_backtest_staging(session_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_mt5_staging_sync_status ON mt5_backtest_staging(session_id,sync_status,updated_at DESC);

DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='trg_mt5_backtest_candidates_updated_at') THEN
    CREATE TRIGGER trg_mt5_backtest_candidates_updated_at
    BEFORE UPDATE ON mt5_backtest_candidates
    FOR EACH ROW EXECUTE FUNCTION set_mt5_updated_at();
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='trg_mt5_backtest_staging_updated_at') THEN
    CREATE TRIGGER trg_mt5_backtest_staging_updated_at
    BEFORE UPDATE ON mt5_backtest_staging
    FOR EACH ROW EXECUTE FUNCTION set_mt5_updated_at();
  END IF;
END
$$;

COMMIT;

-- Audit: phai tra ve 8 bang va mt5_optimize_results khong con payload Every Tick.
SELECT table_name
FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN(
    'mt5_sessions','api_keys','mt5_workers','mt5_job_queue',
    'mt5_optimize_results','mt5_backtest_candidates','mt5_backtest_staging','mt5_logs'
  )
ORDER BY table_name;

SELECT column_name
FROM information_schema.columns
WHERE table_schema='public' AND table_name='mt5_optimize_results'
ORDER BY ordinal_position;

-- ============================================================================
-- PHAN 25: CHUAN HOA OWNER MT5 THEO SESSION
-- ============================================================================
-- mt5_sessions.user_id la nguon owner duy nhat.
-- Queue, Open Price result, Every Tick candidate va Staging khong lap user_id.
-- mt5_logs.user_id duoc doi thanh actor_user_id vi day la nguoi tao event,
-- khong phai owner duoc sao chep tu session.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM mt5_job_queue WHERE status IN ('CLAIMED','RUNNING')
  ) THEN
    RAISE EXCEPTION 'PHAN 25 aborted: van con MT5 job CLAIMED/RUNNING';
  END IF;
END
$$;

ALTER TABLE mt5_backtest_staging
  DROP CONSTRAINT IF EXISTS fk_mt5_staging_candidate,
  DROP CONSTRAINT IF EXISTS fk_mt5_staging_session_owner;

ALTER TABLE mt5_backtest_candidates
  DROP CONSTRAINT IF EXISTS fk_mt5_candidate_optimize_result,
  DROP CONSTRAINT IF EXISTS fk_mt5_candidate_session_owner,
  DROP CONSTRAINT IF EXISTS uq_mt5_candidate_staging_owner;

ALTER TABLE mt5_optimize_results
  DROP CONSTRAINT IF EXISTS fk_mt5_result_session_owner,
  DROP CONSTRAINT IF EXISTS fk_mt5_result_session,
  DROP CONSTRAINT IF EXISTS uq_mt5_result_candidate_owner,
  DROP CONSTRAINT IF EXISTS uq_mt5_result_candidate_parent;

ALTER TABLE mt5_job_queue
  DROP CONSTRAINT IF EXISTS fk_mt5_queue_session_owner,
  DROP CONSTRAINT IF EXISTS fk_mt5_queue_session;

ALTER TABLE mt5_sessions
  DROP CONSTRAINT IF EXISTS uq_mt5_sessions_id_user;

DROP INDEX IF EXISTS idx_mt5_queue_user_created;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='mt5_logs' AND column_name='user_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='mt5_logs' AND column_name='actor_user_id'
  ) THEN
    ALTER TABLE mt5_logs RENAME COLUMN user_id TO actor_user_id;
  END IF;
END
$$;

ALTER TABLE mt5_backtest_staging DROP COLUMN IF EXISTS user_id;
ALTER TABLE mt5_backtest_candidates DROP COLUMN IF EXISTS user_id;
ALTER TABLE mt5_optimize_results DROP COLUMN IF EXISTS user_id;
ALTER TABLE mt5_job_queue DROP COLUMN IF EXISTS user_id;

ALTER TABLE mt5_job_queue
  ADD CONSTRAINT fk_mt5_queue_session
  FOREIGN KEY(session_id) REFERENCES mt5_sessions(id) ON DELETE CASCADE;

ALTER TABLE mt5_optimize_results
  ADD CONSTRAINT fk_mt5_result_session
  FOREIGN KEY(session_id) REFERENCES mt5_sessions(id) ON DELETE CASCADE,
  ADD CONSTRAINT uq_mt5_result_candidate_parent
  UNIQUE(id,session_id,strategy_id,strategy_id_r);

ALTER TABLE mt5_backtest_candidates
  ADD CONSTRAINT fk_mt5_candidate_optimize_result
  FOREIGN KEY(optimize_result_id,session_id,strategy_id,strategy_id_r)
  REFERENCES mt5_optimize_results(id,session_id,strategy_id,strategy_id_r)
  ON DELETE CASCADE,
  ADD CONSTRAINT uq_mt5_candidate_staging_owner
  UNIQUE(id,session_id,strategy_id);

ALTER TABLE mt5_backtest_staging
  ADD CONSTRAINT fk_mt5_staging_candidate
  FOREIGN KEY(candidate_id,session_id,strategy_id)
  REFERENCES mt5_backtest_candidates(id,session_id,strategy_id)
  ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mt5_queue_active_every_tick_target
  ON mt5_job_queue(session_id,target_strategy_id_r)
  WHERE job_type='EVERY_TICK'
    AND status IN ('PENDING','CLAIMED','RUNNING');

COMMIT;

-- Audit: bon bang nghiep vu ben duoi phai khong con user_id.
SELECT table_name,column_name
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN(
    'mt5_job_queue','mt5_optimize_results',
    'mt5_backtest_candidates','mt5_backtest_staging'
  )
  AND column_name='user_id';

-- ============================================================================
-- PHAN 26: INDEX TOI UU GROUP BY STRATEGY CUA MT5 OPTIMIZE RESULTS
-- Chay duoc lap lai an toan tren database da co du lieu.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_mt5_results_session_strategy_result
  ON mt5_optimize_results(
    session_id,
    strategy_id,
    (COALESCE(NULLIF(regexp_replace(COALESCE(summary_op->'metrics'->>'Result', summary_op->'metrics'->>'result', '0'), '[^0-9.-]', '', 'g'), '')::numeric, 0)) DESC,
    id DESC
  );

-- ============================================================================
-- PHAN 27: TYPED METRICS, BEST ROW VA COUNTER CHO ALL OPTIMIZE RESULTS
-- Chay PHAN 27 truoc khi deploy backend su dung read path moi.
-- Database lon: CALL se commit tung 20.000 rows, khong gom toan bo backfill
-- vao mot transaction. Khong boc PHAN 27 trong BEGIN/COMMIT.
-- ============================================================================

ALTER TABLE mt5_sessions
  ADD COLUMN IF NOT EXISTS result_version BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS optimize_result_count BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS optimize_strategy_count INTEGER NOT NULL DEFAULT 0,
  DROP COLUMN IF EXISTS optimize_qualified_count,
  DROP COLUMN IF EXISTS last_result_at;

ALTER TABLE mt5_optimize_results
  ADD COLUMN IF NOT EXISTS result_value NUMERIC,
  ADD COLUMN IF NOT EXISTS profit NUMERIC,
  ADD COLUMN IF NOT EXISTS expected_payoff NUMERIC,
  ADD COLUMN IF NOT EXISTS trades INTEGER,
  ADD COLUMN IF NOT EXISTS profit_factor NUMERIC,
  ADD COLUMN IF NOT EXISTS recovery_factor NUMERIC,
  ADD COLUMN IF NOT EXISTS equity_dd_percent NUMERIC,
  ADD COLUMN IF NOT EXISTS sharpe_ratio NUMERIC,
  ADD COLUMN IF NOT EXISTS pd_ratio NUMERIC,
  ADD COLUMN IF NOT EXISTS is_strategy_best BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE PROCEDURE backfill_mt5_optimize_typed(p_batch_size INTEGER DEFAULT 20000)
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  LOOP
    WITH batch AS (
      SELECT id
        FROM mt5_optimize_results
       WHERE result_value IS NULL
       ORDER BY id
       LIMIT p_batch_size
       FOR UPDATE SKIP LOCKED
    )
    UPDATE mt5_optimize_results r
       SET result_value=COALESCE(NULLIF(regexp_replace(COALESCE(r.summary_op->'metrics'->>'Result',r.summary_op->'metrics'->>'result','0'),'[^0-9.-]','','g'),'')::numeric,0),
           profit=COALESCE(NULLIF(regexp_replace(COALESCE(r.summary_op->'metrics'->>'Profit',r.summary_op->'metrics'->>'profit',r.summary_op->'metrics'->>'Net Profit','0'),'[^0-9.-]','','g'),'')::numeric,0),
           expected_payoff=COALESCE(NULLIF(regexp_replace(COALESCE(r.summary_op->'metrics'->>'Expected Payoff',r.summary_op->'metrics'->>'expected_payoff','0'),'[^0-9.-]','','g'),'')::numeric,0),
           trades=TRUNC(COALESCE(NULLIF(regexp_replace(COALESCE(r.summary_op->'metrics'->>'Trades',r.summary_op->'metrics'->>'trades',r.summary_op->'metrics'->>'Total Trades','0'),'[^0-9.-]','','g'),'')::numeric,0))::integer,
           profit_factor=COALESCE(NULLIF(regexp_replace(COALESCE(r.summary_op->'metrics'->>'Profit Factor',r.summary_op->'metrics'->>'profit_factor','0'),'[^0-9.-]','','g'),'')::numeric,0),
           recovery_factor=COALESCE(NULLIF(regexp_replace(COALESCE(r.summary_op->'metrics'->>'Recovery Factor',r.summary_op->'metrics'->>'recovery_factor','0'),'[^0-9.-]','','g'),'')::numeric,0),
           equity_dd_percent=COALESCE(NULLIF(regexp_replace(COALESCE(r.summary_op->'metrics'->>'Equity DD %',r.summary_op->'metrics'->>'Balance DD %',r.summary_op->'metrics'->>'Drawdown %','0'),'[^0-9.-]','','g'),'')::numeric,0),
           sharpe_ratio=COALESCE(NULLIF(regexp_replace(COALESCE(r.summary_op->'metrics'->>'Sharpe Ratio',r.summary_op->'metrics'->>'sharpe_ratio','0'),'[^0-9.-]','','g'),'')::numeric,0),
           pd_ratio=COALESCE(NULLIF(regexp_replace(COALESCE(r.summary_op->'metrics'->>'P/D',r.summary_op->'metrics'->>'pd_ratio',r.summary_op->'metrics'->>'Recovery Factor','0'),'[^0-9.-]','','g'),'')::numeric,0)
      FROM batch
     WHERE r.id=batch.id;
    GET DIAGNOSTICS v_updated=ROW_COUNT;
    COMMIT;
    EXIT WHEN v_updated=0;
  END LOOP;
END
$$;

-- BAT BUOC CHAY RIENG CAU LENH CALL BEN DUOI TRONG PGADMIN:
-- 1. Neu Query Tool dang bao transaction aborted, chay ROLLBACK truoc.
-- 2. Bat Auto-commit.
-- 3. Chi boi den DUY NHAT dong CALL va Execute. Khong chay chung voi cac lenh khac.
-- Procedure co COMMIT tung batch 20.000 rows de tranh transaction/WAL qua lon.
CALL backfill_mt5_optimize_typed(20000);

-- CHI SAU KHI CALL HOAN TAT MOI CHAY TU DONG DROP PROCEDURE TRO XUONG.
DROP PROCEDURE IF EXISTS backfill_mt5_optimize_typed(INTEGER);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mt5_results_session_strategy_score
  ON mt5_optimize_results(session_id,strategy_id,result_value DESC,id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mt5_results_session_score
  ON mt5_optimize_results(session_id,result_value DESC,id DESC);

UPDATE mt5_optimize_results
   SET is_strategy_best=FALSE
 WHERE is_strategy_best=TRUE;

WITH winners AS (
  SELECT DISTINCT ON(session_id,strategy_id) id
    FROM mt5_optimize_results
   ORDER BY session_id,strategy_id,result_value DESC NULLS LAST,id DESC
)
UPDATE mt5_optimize_results r
   SET is_strategy_best=TRUE
  FROM winners w
 WHERE r.id=w.id AND r.is_strategy_best=FALSE;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mt5_results_session_best
  ON mt5_optimize_results(session_id,strategy_id,id)
  WHERE is_strategy_best=TRUE;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_mt5_results_one_best_per_strategy
  ON mt5_optimize_results(session_id,strategy_id)
  WHERE is_strategy_best=TRUE;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mt5_results_session_qualified
  ON mt5_optimize_results(session_id)
  WHERE trades>=100 AND profit>=10000;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mt5_results_session_watchlist_score
  ON mt5_optimize_results(session_id,strategy_id,result_value DESC,id DESC)
  WHERE picked_watchlist=TRUE;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mt5_results_session_backtest_pick_score
  ON mt5_optimize_results(session_id,strategy_id,result_value DESC,id DESC)
  WHERE picked_bt=TRUE;

DROP INDEX CONCURRENTLY IF EXISTS idx_mt5_results_session_result;
DROP INDEX CONCURRENTLY IF EXISTS idx_mt5_results_session_strategy_result;

WITH stats AS (
  SELECT session_id,
         COUNT(*)::bigint AS result_count,
         COUNT(DISTINCT strategy_id)::integer AS strategy_count,
         MAX(created_at) AS latest_result_at
    FROM mt5_optimize_results
   GROUP BY session_id
)
UPDATE mt5_sessions s
   SET optimize_result_count=stats.result_count,
       optimize_strategy_count=stats.strategy_count,
       result_version=CASE WHEN stats.result_count>0 THEN GREATEST(s.result_version,1) ELSE s.result_version END,
       updated_at=GREATEST(s.updated_at,stats.latest_result_at)
  FROM stats
 WHERE s.id=stats.session_id;

ANALYZE mt5_optimize_results;
ANALYZE mt5_sessions;

SELECT s.id,s.result_version,s.optimize_result_count,s.optimize_strategy_count,
       s.updated_at AS last_result_at
FROM mt5_sessions s
ORDER BY s.id;

-- -----------------------------------------------------------------------------
-- PHAN 28: DINH DANH CO DINH CHO MT5 WORKER
-- Ten worker chi la ten hien thi; doi ten khong tao them worker moi.
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS mt5_workers
  ADD COLUMN IF NOT EXISTS worker_instance_id UUID;

DO $$
BEGIN
  IF to_regclass('public.mt5_workers') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
        WHERE conrelid='mt5_workers'::regclass
          AND conname='uq_mt5_workers_owner_instance'
     ) THEN
    ALTER TABLE mt5_workers
      ADD CONSTRAINT uq_mt5_workers_owner_instance
      UNIQUE (owner_user_id,worker_instance_id);
  END IF;
END
$$;

COMMENT ON COLUMN mt5_workers.worker_instance_id IS
  'ID co dinh do MT5 Worker App sinh mot lan; worker_name co the doi ma khong tao worker moi.';
