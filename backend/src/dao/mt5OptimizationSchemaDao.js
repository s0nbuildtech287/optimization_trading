const { getAppPool } = require("../config/db");

const pool = getAppPool();

const MT5_SCHEMA_SQL = `
  CREATE SEQUENCE IF NOT EXISTS mt5_session_id_seq;
  CREATE SEQUENCE IF NOT EXISTS mt5_job_id_seq;

  CREATE OR REPLACE FUNCTION set_mt5_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
  $$;

  CREATE TABLE IF NOT EXISTS mt5_sessions (
    id VARCHAR(40) PRIMARY KEY
      DEFAULT ('session-' || nextval('mt5_session_id_seq')),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(160) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
      CHECK (status IN ('ACTIVE', 'ARCHIVED')),
    result_version BIGINT NOT NULL DEFAULT 0,
    optimize_result_count BIGINT NOT NULL DEFAULT 0,
    optimize_strategy_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ,
    CONSTRAINT ck_mt5_sessions_archive_time CHECK (
      (status = 'ACTIVE' AND archived_at IS NULL)
      OR (status = 'ARCHIVED' AND archived_at IS NOT NULL)
    )
  );

  CREATE INDEX IF NOT EXISTS idx_mt5_sessions_user_updated
    ON mt5_sessions(user_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS api_keys (
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

  CREATE INDEX IF NOT EXISTS idx_api_keys_user_status
    ON api_keys(user_id, status);

  CREATE TABLE IF NOT EXISTS mt5_workers (
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

  CREATE INDEX IF NOT EXISTS idx_mt5_workers_dispatch
    ON mt5_workers(status, run_access, is_public, last_seen_at DESC);

  CREATE INDEX IF NOT EXISTS idx_mt5_workers_api_key
    ON mt5_workers(api_key_id)
    WHERE api_key_id IS NOT NULL;

  CREATE TABLE IF NOT EXISTS mt5_job_queue (
    job_id VARCHAR(40) PRIMARY KEY
      DEFAULT ('job-' || nextval('mt5_job_id_seq')),
    session_id VARCHAR(40) NOT NULL
      REFERENCES mt5_sessions(id) ON DELETE CASCADE,
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
    CONSTRAINT ck_mt5_queue_payload_object
      CHECK (jsonb_typeof(job_payload) = 'object'),
    CONSTRAINT ck_mt5_queue_every_tick_target CHECK (
      (job_type = 'OPEN_PRICE' AND target_strategy_id_r IS NULL)
      OR (job_type = 'EVERY_TICK' AND target_strategy_id_r IS NOT NULL)
    )
  );

  CREATE INDEX IF NOT EXISTS idx_mt5_queue_claim
    ON mt5_job_queue(status, job_type, priority DESC, created_at)
    WHERE status = 'PENDING';

  CREATE INDEX IF NOT EXISTS idx_mt5_queue_session_created
    ON mt5_job_queue(session_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_mt5_queue_worker_active
    ON mt5_job_queue(claimed_by_worker_id, status)
    WHERE status IN ('CLAIMED', 'RUNNING');

  CREATE UNIQUE INDEX IF NOT EXISTS uq_mt5_queue_active_run
    ON mt5_job_queue(run_id)
    WHERE run_id IS NOT NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_mt5_queue_active_every_tick_target
    ON mt5_job_queue(session_id, target_strategy_id_r)
    WHERE job_type = 'EVERY_TICK'
      AND status IN ('PENDING', 'CLAIMED', 'RUNNING');

  CREATE TABLE IF NOT EXISTS mt5_optimize_results (
    id BIGSERIAL PRIMARY KEY,
    session_id VARCHAR(40) NOT NULL
      REFERENCES mt5_sessions(id) ON DELETE CASCADE,
    strategy_id VARCHAR(160) NOT NULL,
    strategy_id_r VARCHAR(220)
      GENERATED ALWAYS AS (strategy_id || '_' || id::TEXT) STORED,
    summary_op JSONB NOT NULL,
    result_value NUMERIC,
    profit NUMERIC,
    expected_payoff NUMERIC,
    trades INTEGER,
    profit_factor NUMERIC,
    recovery_factor NUMERIC,
    equity_dd_percent NUMERIC,
    sharpe_ratio NUMERIC,
    pd_ratio NUMERIC,
    is_strategy_best BOOLEAN NOT NULL DEFAULT FALSE,
    picked_watchlist BOOLEAN NOT NULL DEFAULT FALSE,
    picked_bt BOOLEAN NOT NULL DEFAULT FALSE,
    backtest_run_count INTEGER NOT NULL DEFAULT 0
      CHECK (backtest_run_count >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_mt5_result_strategy_r UNIQUE (strategy_id_r),
    CONSTRAINT uq_mt5_result_candidate_parent
      UNIQUE (id, session_id, strategy_id, strategy_id_r),
    CONSTRAINT ck_mt5_result_summary_op_object
      CHECK (jsonb_typeof(summary_op) = 'object'),
    CONSTRAINT ck_mt5_result_summary_op_shape CHECK (
      summary_op ? 'pass'
      AND summary_op ? 'inputs'
      AND summary_op ? 'metrics'
      AND jsonb_typeof(summary_op -> 'inputs') = 'object'
      AND jsonb_typeof(summary_op -> 'metrics') = 'object'
    )
  );

  CREATE INDEX IF NOT EXISTS idx_mt5_results_session_strategy
    ON mt5_optimize_results(session_id, strategy_id, id);

  CREATE INDEX IF NOT EXISTS idx_mt5_results_session_strategy_score
    ON mt5_optimize_results(session_id, strategy_id, result_value DESC, id DESC);

  CREATE INDEX IF NOT EXISTS idx_mt5_results_session_score
    ON mt5_optimize_results(session_id, result_value DESC, id DESC);

  CREATE INDEX IF NOT EXISTS idx_mt5_results_session_best
    ON mt5_optimize_results(session_id, strategy_id, id)
    WHERE is_strategy_best = TRUE;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_mt5_results_one_best_per_strategy
    ON mt5_optimize_results(session_id, strategy_id)
    WHERE is_strategy_best = TRUE;

  CREATE INDEX IF NOT EXISTS idx_mt5_results_session_qualified
    ON mt5_optimize_results(session_id)
    WHERE trades>=100 AND profit>=10000;

  CREATE INDEX IF NOT EXISTS idx_mt5_results_watchlist
    ON mt5_optimize_results(session_id, updated_at DESC)
    WHERE picked_watchlist = TRUE;

  CREATE INDEX IF NOT EXISTS idx_mt5_results_bt_candidates
    ON mt5_optimize_results(session_id, updated_at DESC)
    WHERE picked_bt = TRUE;

  CREATE INDEX IF NOT EXISTS idx_mt5_results_session_watchlist_score
    ON mt5_optimize_results(session_id,strategy_id,result_value DESC,id DESC)
    WHERE picked_watchlist=TRUE;

  CREATE INDEX IF NOT EXISTS idx_mt5_results_session_backtest_pick_score
    ON mt5_optimize_results(session_id,strategy_id,result_value DESC,id DESC)
    WHERE picked_bt=TRUE;

  CREATE TABLE IF NOT EXISTS mt5_backtest_candidates (
    id BIGSERIAL PRIMARY KEY,
    session_id VARCHAR(40) NOT NULL,
    optimize_result_id BIGINT NOT NULL,
    strategy_id VARCHAR(160) NOT NULL,
    strategy_id_r VARCHAR(220) NOT NULL,
    backtest_run_no INTEGER NOT NULL CHECK (backtest_run_no > 0),
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
    CONSTRAINT fk_mt5_candidate_optimize_result
      FOREIGN KEY (
        optimize_result_id, session_id, strategy_id, strategy_id_r
      ) REFERENCES mt5_optimize_results(
        id, session_id, strategy_id, strategy_id_r
      ) ON DELETE CASCADE,
    CONSTRAINT uq_mt5_candidate_source_run UNIQUE (source_run_id),
    CONSTRAINT uq_mt5_candidate_result_run
      UNIQUE (optimize_result_id, backtest_run_no),
    CONSTRAINT uq_mt5_candidate_staging_owner
      UNIQUE (id, session_id, strategy_id),
    CONSTRAINT ck_mt5_candidate_summary_shape CHECK (
      jsonb_typeof(summary_bt) = 'object'
      AND summary_bt ? 'settings'
      AND summary_bt ? 'results'
      AND jsonb_typeof(summary_bt -> 'settings') = 'object'
      AND jsonb_typeof(summary_bt -> 'results') = 'object'
      AND summary_bt -> 'settings' <> '{}'::JSONB
      AND summary_bt -> 'results' <> '{}'::JSONB
    ),
    CONSTRAINT ck_mt5_candidate_deals CHECK (
      jsonb_typeof(deals) = 'array'
      AND jsonb_array_length(deals) > 0
    )
  );

  CREATE INDEX IF NOT EXISTS idx_mt5_bt_candidates_session_created
    ON mt5_backtest_candidates(session_id, created_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_mt5_bt_candidates_strategy
    ON mt5_backtest_candidates(session_id, strategy_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_mt5_bt_candidates_result_run
    ON mt5_backtest_candidates(optimize_result_id, backtest_run_no DESC);
  CREATE INDEX IF NOT EXISTS idx_mt5_bt_candidates_profit
    ON mt5_backtest_candidates(session_id, net_profit DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_mt5_bt_candidates_trades
    ON mt5_backtest_candidates(session_id, total_trades DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_mt5_bt_candidates_drawdown
    ON mt5_backtest_candidates(session_id, balance_drawdown_percent, id DESC);
  CREATE INDEX IF NOT EXISTS idx_mt5_bt_candidates_pf
    ON mt5_backtest_candidates(session_id, profit_factor DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_mt5_bt_candidates_recovery
    ON mt5_backtest_candidates(session_id, recovery_factor DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_mt5_bt_candidates_sharpe
    ON mt5_backtest_candidates(session_id, sharpe_ratio DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_mt5_bt_candidates_pd
    ON mt5_backtest_candidates(session_id, pd_ratio DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_mt5_bt_candidates_largest_loss
    ON mt5_backtest_candidates(session_id, largest_loss_trade, id DESC);

  CREATE TABLE IF NOT EXISTS mt5_backtest_staging (
    id BIGSERIAL PRIMARY KEY,
    session_id VARCHAR(40) NOT NULL,
    strategy_id VARCHAR(160) NOT NULL,
    candidate_id BIGINT NOT NULL,
    target_table VARCHAR(255),
    source_table VARCHAR(255),
    sync_status VARCHAR(20) NOT NULL DEFAULT 'NOT_SYNCED'
      CHECK (sync_status IN (
        'NOT_SYNCED', 'SYNCING', 'SYNCED', 'SYNC_FAILED'
      )),
    selected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_mt5_staging_candidate
      FOREIGN KEY (candidate_id, session_id, strategy_id)
      REFERENCES mt5_backtest_candidates(id, session_id, strategy_id)
      ON DELETE CASCADE,
    CONSTRAINT uq_mt5_staging_session_strategy
      UNIQUE (session_id, strategy_id),
    CONSTRAINT ck_mt5_staging_target_table CHECK (
      target_table IS NULL
      OR target_table ~ '^backtest[a-zA-Z0-9_]*$'
    ),
    CONSTRAINT ck_mt5_staging_source_table CHECK (
      source_table IS NULL
      OR source_table ~ '^backtest[a-zA-Z0-9_]*$'
    ),
    CONSTRAINT ck_mt5_staging_sync_fields CHECK (
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

  CREATE INDEX IF NOT EXISTS idx_mt5_staging_session_updated
    ON mt5_backtest_staging(session_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_mt5_staging_sync_status
    ON mt5_backtest_staging(session_id, sync_status, updated_at DESC);

  CREATE TABLE IF NOT EXISTS mt5_logs (
    id BIGSERIAL PRIMARY KEY,
    session_id VARCHAR(40) REFERENCES mt5_sessions(id) ON DELETE CASCADE,
    actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
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

  CREATE INDEX IF NOT EXISTS idx_mt5_logs_session_created
    ON mt5_logs(session_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_mt5_logs_job_created
    ON mt5_logs(job_id, created_at DESC)
    WHERE job_id IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_mt5_logs_errors
    ON mt5_logs(created_at DESC)
    WHERE level = 'ERROR';

  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_mt5_sessions_updated_at'
        AND tgrelid = 'mt5_sessions'::regclass
        AND NOT tgisinternal
    ) THEN
      CREATE TRIGGER trg_mt5_sessions_updated_at
      BEFORE UPDATE ON mt5_sessions
      FOR EACH ROW EXECUTE FUNCTION set_mt5_updated_at();
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_mt5_workers_updated_at'
        AND tgrelid = 'mt5_workers'::regclass
        AND NOT tgisinternal
    ) THEN
      CREATE TRIGGER trg_mt5_workers_updated_at
      BEFORE UPDATE ON mt5_workers
      FOR EACH ROW EXECUTE FUNCTION set_mt5_updated_at();
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_mt5_job_queue_updated_at'
        AND tgrelid = 'mt5_job_queue'::regclass
        AND NOT tgisinternal
    ) THEN
      CREATE TRIGGER trg_mt5_job_queue_updated_at
      BEFORE UPDATE ON mt5_job_queue
      FOR EACH ROW EXECUTE FUNCTION set_mt5_updated_at();
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_mt5_optimize_results_updated_at'
        AND tgrelid = 'mt5_optimize_results'::regclass
        AND NOT tgisinternal
    ) THEN
      CREATE TRIGGER trg_mt5_optimize_results_updated_at
      BEFORE UPDATE ON mt5_optimize_results
      FOR EACH ROW EXECUTE FUNCTION set_mt5_updated_at();
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_mt5_backtest_candidates_updated_at'
        AND tgrelid = 'mt5_backtest_candidates'::regclass
        AND NOT tgisinternal
    ) THEN
      CREATE TRIGGER trg_mt5_backtest_candidates_updated_at
      BEFORE UPDATE ON mt5_backtest_candidates
      FOR EACH ROW EXECUTE FUNCTION set_mt5_updated_at();
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_mt5_backtest_staging_updated_at'
        AND tgrelid = 'mt5_backtest_staging'::regclass
        AND NOT tgisinternal
    ) THEN
      CREATE TRIGGER trg_mt5_backtest_staging_updated_at
      BEFORE UPDATE ON mt5_backtest_staging
      FOR EACH ROW EXECUTE FUNCTION set_mt5_updated_at();
    END IF;
  END;
  $$;
`;

async function initMt5OptimizationSchema() {
  try {
    await pool.query(MT5_SCHEMA_SQL);
    const tables = [
      "mt5_sessions",
      "api_keys",
      "mt5_workers",
      "mt5_job_queue",
      "mt5_optimize_results",
      "mt5_backtest_candidates",
      "mt5_backtest_staging",
      "mt5_logs",
    ];
    tables.forEach((tableName) => {
      console.log(`[DB] Table ${tableName} checked/created successfully`);
    });
    console.log("[DB] MT5 Optimization schema initialized: 8 tables");
  } catch (error) {
    console.error("[DB] Failed to initialize MT5 Optimization schema:", error.message);
    throw error;
  }
}

module.exports = {
  initMt5OptimizationSchema,
};
