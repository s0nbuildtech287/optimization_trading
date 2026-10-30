const { randomUUID } = require('crypto');
const { getAppPool, safeConnect } = require('../config/db');
const { MT5 } = require('../utils/constants');

const pool = getAppPool();

const scopeSql = (actor, alias = '') => actor?.isAdmin ? { sql: '', values: [] } : {
  sql: ` AND ${alias}user_id = $1`, values: [Number(actor.userId)]
};

async function createSession(userId, { name, description = null }) {
  const { rows } = await pool.query(
    `INSERT INTO mt5_sessions (user_id, name, description)
     VALUES ($1, $2, $3) RETURNING *`,
    [userId, name, description],
  );
  const session = rows[0];
  const owner = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
  return { ...session, owner_username: owner.rows[0]?.username || null };
}

async function listSessions(actor) {
  const scoped = scopeSql(actor, 's.');
  const { rows } = await pool.query(
    `SELECT s.*,
            u.username AS owner_username,
            (SELECT COUNT(*)::int
               FROM mt5_job_queue j
              WHERE j.session_id = s.id) AS job_count,
            s.optimize_result_count AS result_count
       FROM mt5_sessions s
       LEFT JOIN users u ON u.id = s.user_id
      WHERE 1=1 ${scoped.sql}
      ORDER BY s.updated_at DESC`, scoped.values,
  );
  return rows;
}

async function getSession(sessionId, actor, client = pool) {
  const scoped = scopeSql(actor, 's.');
  const values = [sessionId, ...scoped.values];
  const shifted = scoped.sql.replace('$1', '$2');
  const { rows } = await client.query(
    `SELECT s.* FROM mt5_sessions s WHERE s.id = $1 ${shifted}`, values,
  );
  return rows[0] || null;
}

async function updateSession(sessionId, actor, changes) {
  const scoped = scopeSql(actor);
  const { rows } = await pool.query(
    `UPDATE mt5_sessions
        SET name = COALESCE($2, name), description = COALESCE($3, description),
            status = COALESCE($4, status),
            archived_at = CASE WHEN $4 = 'ARCHIVED' THEN NOW()
                               WHEN $4 = 'ACTIVE' THEN NULL ELSE archived_at END
      WHERE id = $1 ${scoped.sql.replace('$1', '$5')}
      RETURNING *`,
    [sessionId, changes.name || null, changes.description ?? null, changes.status || null, ...scoped.values],
  );
  return rows[0] || null;
}

async function getSessionCleanupPreview(sessionId, actor) {
  const scoped = scopeSql(actor, 's.');
  const values = [sessionId, ...scoped.values];
  const shifted = scoped.sql.replace('$1', '$2');
  const { rows } = await pool.query(
    `WITH owned_session AS (
       SELECT s.id,s.user_id,s.name,s.status,u.username AS owner_username,
              s.optimize_result_count,s.optimize_strategy_count
         FROM mt5_sessions s
         LEFT JOIN users u ON u.id=s.user_id
        WHERE s.id=$1 ${shifted}
     ), result_stats AS (
       SELECT COUNT(*)::bigint AS total_results,
              COUNT(*) FILTER (WHERE r.picked_watchlist=TRUE)::bigint AS watchlist_results,
              COUNT(*) FILTER (
                WHERE EXISTS (
                  SELECT 1 FROM mt5_backtest_candidates c
                   WHERE c.optimize_result_id=r.id
                )
              )::bigint AS candidate_linked_results,
              COUNT(*) FILTER (
                WHERE r.picked_watchlist=FALSE
                  AND NOT EXISTS (
                    SELECT 1 FROM mt5_backtest_candidates c
                     WHERE c.optimize_result_id=r.id
                  )
              )::bigint AS purgeable_results
         FROM mt5_optimize_results r
         JOIN owned_session os ON os.id=r.session_id
     ), child_stats AS (
       SELECT
         (SELECT COUNT(*)::bigint FROM mt5_backtest_candidates c JOIN owned_session os ON os.id=c.session_id) AS candidate_count,
         (SELECT COUNT(*)::bigint FROM mt5_backtest_staging st JOIN owned_session os ON os.id=st.session_id) AS staging_count,
         (SELECT COUNT(*)::bigint FROM mt5_backtest_staging st JOIN owned_session os ON os.id=st.session_id WHERE st.sync_status='SYNCED') AS synced_staging_count,
         (SELECT COUNT(*)::bigint FROM mt5_backtest_staging st JOIN owned_session os ON os.id=st.session_id WHERE st.sync_status<>'SYNCED') AS unsynced_staging_count,
         (SELECT COUNT(*)::bigint FROM mt5_job_queue j JOIN owned_session os ON os.id=j.session_id) AS job_count,
         (SELECT COUNT(*)::bigint FROM mt5_job_queue j JOIN owned_session os ON os.id=j.session_id WHERE j.status IN ('PENDING','CLAIMED','RUNNING')) AS active_job_count,
         (SELECT COUNT(*)::bigint FROM mt5_logs l JOIN owned_session os ON os.id=l.session_id) AS log_count
     )
     SELECT os.*,rs.*,cs.*,
            GREATEST(rs.total_results-rs.purgeable_results,0)::bigint AS retained_results
       FROM owned_session os
       CROSS JOIN result_stats rs
       CROSS JOIN child_stats cs`,
    values,
  );
  return rows[0] || null;
}

async function purgeUnusedOptimizeResults(sessionId, actor, chunkSize) {
  const client = await safeConnect(pool, 'MT5_PURGE_UNUSED_RESULTS');
  try {
    await client.query('BEGIN');
    const session = await getSession(sessionId, actor, client);
    if (!session) {
      await client.query('ROLLBACK');
      return null;
    }
    const lock = await client.query(
      `SELECT pg_try_advisory_xact_lock(hashtext('mt5-session-maintenance'),hashtext($1)) AS locked`,
      [sessionId],
    );
    if (!lock.rows[0]?.locked) {
      await client.query('ROLLBACK');
      return { busy: true };
    }
    const active = await client.query(
      `SELECT COUNT(*)::int AS count FROM mt5_job_queue
        WHERE session_id=$1 AND status IN ('PENDING','CLAIMED','RUNNING')`,
      [sessionId],
    );
    if (active.rows[0].count > 0) {
      await client.query('ROLLBACK');
      return { activeJobs: active.rows[0].count };
    }
    const deleted = await client.query(
      `WITH victims AS (
         SELECT r.id
           FROM mt5_optimize_results r
          WHERE r.session_id=$1
            AND r.picked_watchlist=FALSE
            AND NOT EXISTS (
              SELECT 1 FROM mt5_backtest_candidates c
               WHERE c.optimize_result_id=r.id
            )
          LIMIT $2
          FOR UPDATE SKIP LOCKED
       )
       DELETE FROM mt5_optimize_results r
       USING victims v
       WHERE r.id=v.id
       RETURNING r.id`,
      [sessionId, chunkSize],
    );
    const completed = deleted.rowCount < chunkSize;
    if (completed) {
      await client.query(
        `UPDATE mt5_optimize_results SET is_strategy_best=FALSE
          WHERE session_id=$1 AND is_strategy_best=TRUE`,
        [sessionId],
      );
      await client.query(
        `WITH best AS (
           SELECT DISTINCT ON(strategy_id) id
             FROM mt5_optimize_results
            WHERE session_id=$1
            ORDER BY strategy_id,result_value DESC NULLS LAST,id DESC
         )
         UPDATE mt5_optimize_results r SET is_strategy_best=TRUE
         FROM best b WHERE r.id=b.id`,
        [sessionId],
      );
      await client.query(
        `UPDATE mt5_sessions s
            SET optimize_result_count=stats.result_count,
                optimize_strategy_count=stats.strategy_count,
                result_version=result_version+1
           FROM (
             SELECT COUNT(*)::bigint AS result_count,
                    COUNT(DISTINCT strategy_id)::int AS strategy_count
               FROM mt5_optimize_results WHERE session_id=$1
           ) stats
          WHERE s.id=$1`,
        [sessionId],
      );
    } else {
      await client.query(
        `UPDATE mt5_sessions
            SET optimize_result_count=GREATEST(optimize_result_count-$2,0),
                result_version=result_version+1
          WHERE id=$1`,
        [sessionId, deleted.rowCount],
      );
    }
    await client.query(
      `INSERT INTO mt5_logs(session_id,actor_user_id,level,event_type,message,context)
       VALUES($1,$2,'INFO','OPTIMIZE_RESULTS_PURGE_CHUNK','Purged unused optimization results',$3::jsonb)`,
      [sessionId, actor.userId, JSON.stringify({ deleted_count: deleted.rowCount, completed })],
    );
    await client.query('COMMIT');
    return { deletedCount: deleted.rowCount, completed };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function deleteSessionChunk(sessionId, actor, confirmationName, chunkSize) {
  const client = await safeConnect(pool, 'MT5_DELETE_SESSION');
  try {
    await client.query('BEGIN');
    const session = await getSession(sessionId, actor, client);
    if (!session) {
      await client.query('ROLLBACK');
      return null;
    }
    if (session.name !== confirmationName) {
      await client.query('ROLLBACK');
      return { confirmationMismatch: true };
    }
    const lock = await client.query(
      `SELECT pg_try_advisory_xact_lock(hashtext('mt5-session-maintenance'),hashtext($1)) AS locked`,
      [sessionId],
    );
    if (!lock.rows[0]?.locked) {
      await client.query('ROLLBACK');
      return { busy: true };
    }
    const active = await client.query(
      `SELECT COUNT(*)::int AS count FROM mt5_job_queue
        WHERE session_id=$1 AND status IN ('PENDING','CLAIMED','RUNNING')`,
      [sessionId],
    );
    if (active.rows[0].count > 0) {
      await client.query('ROLLBACK');
      return { activeJobs: active.rows[0].count };
    }
    const unsynced = await client.query(
      `SELECT COUNT(*)::int AS count FROM mt5_backtest_staging
        WHERE session_id=$1 AND sync_status<>'SYNCED'`,
      [sessionId],
    );
    if (unsynced.rows[0].count > 0) {
      await client.query('ROLLBACK');
      return { unsyncedStaging: unsynced.rows[0].count };
    }
    if (session.status !== 'ARCHIVED') {
      await client.query(
        `UPDATE mt5_sessions SET status='ARCHIVED',archived_at=NOW() WHERE id=$1`,
        [sessionId],
      );
    }
    const results = await client.query(
      `WITH victims AS (
         SELECT id FROM mt5_optimize_results
          WHERE session_id=$1 LIMIT $2 FOR UPDATE SKIP LOCKED
       )
       DELETE FROM mt5_optimize_results r USING victims v
        WHERE r.id=v.id RETURNING r.id`,
      [sessionId, chunkSize],
    );
    if (results.rowCount > 0) {
      await client.query(
        `UPDATE mt5_sessions SET optimize_result_count=GREATEST(optimize_result_count-$2,0),result_version=result_version+1 WHERE id=$1`,
        [sessionId, results.rowCount],
      );
      await client.query('COMMIT');
      return { phase: 'RESULTS', deletedCount: results.rowCount, completed: false, runtimeJobIds: [] };
    }
    const logs = await client.query(
      `WITH victims AS (
         SELECT id FROM mt5_logs WHERE session_id=$1 LIMIT $2 FOR UPDATE SKIP LOCKED
       )
       DELETE FROM mt5_logs l USING victims v WHERE l.id=v.id RETURNING l.id`,
      [sessionId, chunkSize],
    );
    if (logs.rowCount > 0) {
      await client.query('COMMIT');
      return { phase: 'LOGS', deletedCount: logs.rowCount, completed: false, runtimeJobIds: [] };
    }
    const jobs = await client.query(
      `WITH victims AS (
         SELECT job_id FROM mt5_job_queue WHERE session_id=$1 LIMIT $2 FOR UPDATE SKIP LOCKED
       )
       DELETE FROM mt5_job_queue j USING victims v WHERE j.job_id=v.job_id RETURNING j.job_id`,
      [sessionId, chunkSize],
    );
    if (jobs.rowCount > 0) {
      await client.query('COMMIT');
      return { phase: 'JOBS', deletedCount: jobs.rowCount, completed: false, runtimeJobIds: jobs.rows.map((row) => row.job_id) };
    }
    await client.query(`DELETE FROM mt5_sessions WHERE id=$1`, [sessionId]);
    await client.query('COMMIT');
    return { phase: 'SESSION', deletedCount: 1, completed: true, runtimeJobIds: [] };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function createApiKey(userId, name, apiKey, scopes) {
  const { rows } = await pool.query(
    `INSERT INTO api_keys (user_id, name, api_key, scopes)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [userId, name, apiKey, scopes],
  );
  return rows[0];
}

async function listApiKeys(actor) {
  const scoped = scopeSql(actor, 'k.');
  const { rows } = await pool.query(
    `SELECT k.*, u.username FROM api_keys k JOIN users u ON u.id = k.user_id
      WHERE 1=1 ${scoped.sql} ORDER BY k.created_at DESC`, scoped.values,
  );
  return rows;
}

async function revokeApiKey(id, actor) {
  const scoped = scopeSql(actor);
  const { rows } = await pool.query(
    `UPDATE api_keys SET status='REVOKED', revoked_at=NOW()
      WHERE id=$1 ${scoped.sql.replace('$1', '$2')} RETURNING *`, [id, ...scoped.values],
  );
  return rows[0] || null;
}

async function deleteApiKey(id, actor) {
  const scoped = scopeSql(actor);
  const { rows } = await pool.query(
    `DELETE FROM api_keys
      WHERE id=$1 ${scoped.sql.replace('$1', '$2')} RETURNING *`, [id, ...scoped.values],
  );
  return rows[0] || null;
}

async function findActiveApiKey(apiKey, client = pool) {
  const { rows } = await client.query(
    `UPDATE api_keys SET last_used_at=NOW()
      WHERE api_key=$1 AND status='ACTIVE'
        AND (expires_at IS NULL OR expires_at > NOW())
      RETURNING *`, [apiKey],
  );
  return rows[0] || null;
}

async function upsertWorkerRecord(client, {
  ownerUserId, apiKeyId, workerName, workerInstanceId = null, status, capabilities = {},
}) {
  const capabilityJson = JSON.stringify(capabilities);
  if (!workerInstanceId) {
    const { rows } = await client.query(
      `INSERT INTO mt5_workers
         (owner_user_id, owner_username, api_key_id, worker_name, status, run_access, capabilities, last_seen_at)
       SELECT $1, u.username, $2, $3, $4, FALSE, $5, NOW()
         FROM users u WHERE u.id=$1
       ON CONFLICT (owner_user_id, worker_name) DO UPDATE SET
         owner_username=EXCLUDED.owner_username,
         api_key_id=EXCLUDED.api_key_id,
         status=CASE WHEN EXCLUDED.status='OFFLINE' THEN 'OFFLINE'
                     WHEN mt5_workers.status IN ('DRAINING','BLOCKED')
                     THEN mt5_workers.status ELSE EXCLUDED.status END,
         capabilities=mt5_workers.capabilities || EXCLUDED.capabilities,
         last_seen_at=NOW()
       RETURNING *`,
      [ownerUserId, apiKeyId, workerName, status, capabilityJson],
    );
    return rows[0];
  }

  await client.query(
    `SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))`,
    [String(ownerUserId), workerInstanceId],
  );
  let { rows: workers } = await client.query(
    `SELECT * FROM mt5_workers
      WHERE owner_user_id=$1 AND worker_instance_id=$2
      FOR UPDATE`,
    [ownerUserId, workerInstanceId],
  );
  let worker = workers[0] || null;
  if (!worker) {
    const adopted = await client.query(
      `UPDATE mt5_workers
          SET worker_instance_id=$3
        WHERE id=(
          SELECT id FROM mt5_workers
           WHERE owner_user_id=$1 AND worker_name=$2 AND worker_instance_id IS NULL
           FOR UPDATE LIMIT 1
        )
        RETURNING *`,
      [ownerUserId, workerName, workerInstanceId],
    );
    worker = adopted.rows[0] || null;
  }

  if (worker) {
    const collision = await client.query(
      `SELECT id,worker_instance_id FROM mt5_workers
        WHERE owner_user_id=$1 AND worker_name=$2 AND id<>$3
        FOR UPDATE`,
      [ownerUserId, workerName, worker.id],
    );
    const duplicate = collision.rows[0];
    if (duplicate) {
      if (duplicate.worker_instance_id) {
        const error = new Error('Worker name is already used by another worker instance');
        error.code = 'MT5_WORKER_NAME_CONFLICT';
        throw error;
      }
      await client.query(
        `UPDATE mt5_job_queue SET claimed_by_worker_id=$1 WHERE claimed_by_worker_id=$2`,
        [worker.id, duplicate.id],
      );
      await client.query(
        `UPDATE mt5_logs SET worker_id=$1 WHERE worker_id=$2`,
        [worker.id, duplicate.id],
      );
      await client.query(`DELETE FROM mt5_workers WHERE id=$1`, [duplicate.id]);
    }
    const { rows } = await client.query(
      `UPDATE mt5_workers w SET
         owner_username=u.username,
         api_key_id=$2,
         worker_name=$3,
         status=CASE WHEN $4='OFFLINE' THEN 'OFFLINE'
                     WHEN w.status IN ('DRAINING','BLOCKED') THEN w.status ELSE $4 END,
         capabilities=w.capabilities || $5::jsonb,
         last_seen_at=NOW()
        FROM users u
       WHERE w.id=$1 AND u.id=w.owner_user_id
       RETURNING w.*`,
      [worker.id, apiKeyId, workerName, status, capabilityJson],
    );
    return rows[0];
  }

  const { rows } = await client.query(
    `INSERT INTO mt5_workers
       (owner_user_id,owner_username,api_key_id,worker_instance_id,worker_name,status,run_access,capabilities,last_seen_at)
     SELECT $1,u.username,$2,$3,$4,$5,FALSE,$6,NOW()
       FROM users u WHERE u.id=$1
     RETURNING *`,
    [ownerUserId, apiKeyId, workerInstanceId, workerName, status, capabilityJson],
  );
  return rows[0];
}

async function upsertWorker(args) {
  const client = await safeConnect(pool, 'MT5_WORKER_UPSERT');
  try {
    await client.query('BEGIN');
    const worker = await upsertWorkerRecord(client, args);
    await client.query('COMMIT');
    return worker;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function getWorkerByName(ownerUserId, workerName) {
  const { rows } = await pool.query(
    `SELECT * FROM mt5_workers WHERE owner_user_id=$1 AND worker_name=$2`,
    [ownerUserId, workerName],
  );
  return rows[0] || null;
}

async function listWorkers(actor) {
  const values = [MT5.WORKER_OFFLINE_AFTER_SECONDS];
  let ownerSql = '';
  if (!actor?.isAdmin) {
    values.push(actor.userId);
    ownerSql = `WHERE w.owner_user_id=$${values.length}`;
  }
  const { rows } = await pool.query(
    `SELECT w.*,
            CASE WHEN w.status IN ('ONLINE','BUSY')
                       AND w.last_seen_at < NOW()-($1 || ' seconds')::interval
                 THEN 'OFFLINE' ELSE w.status END AS status,
            w.owner_username AS username, k.api_key,
            active.job_id AS current_job_id,
            COALESCE(stats.jobs_claimed, 0)::int AS jobs_claimed
       FROM mt5_workers w
       JOIN users u ON u.id=w.owner_user_id
       LEFT JOIN api_keys k ON k.id=w.api_key_id
       LEFT JOIN LATERAL (
         SELECT job_id FROM mt5_job_queue
          WHERE claimed_by_worker_id=w.id AND status IN ('CLAIMED','RUNNING')
          ORDER BY updated_at DESC LIMIT 1
       ) active ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS jobs_claimed FROM mt5_job_queue WHERE claimed_by_worker_id=w.id
       ) stats ON TRUE
       ${ownerSql}
      ORDER BY w.last_seen_at DESC NULLS LAST`, values,
  );
  return rows;
}

async function updateWorker(id, actor, changes) {
  const values = [id, changes.runAccess, changes.isPublic, changes.allowedJobTypes];
  let ownerSql = '';
  if (!actor.isAdmin) { values.push(actor.userId); ownerSql = ` AND owner_user_id=$${values.length}`; }
  const { rows } = await pool.query(
    `UPDATE mt5_workers SET
       run_access=COALESCE($2,run_access), is_public=COALESCE($3,is_public),
       allowed_job_types=COALESCE($4,allowed_job_types)
     WHERE id=$1 ${ownerSql} RETURNING *`, values,
  );
  return rows[0] || null;
}

async function deleteWorker(id, actor) {
  const values = [id];
  let ownerSql = '';
  if (!actor.isAdmin) {
    values.push(actor.userId);
    ownerSql = ` AND owner_user_id=$${values.length}`;
  }
  const { rows } = await pool.query(
    `DELETE FROM mt5_workers w
      WHERE w.id=$1 ${ownerSql}
        AND NOT EXISTS (
          SELECT 1 FROM mt5_job_queue j
           WHERE j.claimed_by_worker_id=w.id AND j.status IN ('CLAIMED','RUNNING')
        )
      RETURNING w.id`,
    values,
  );
  return rows[0] || null;
}

async function createJobs(client, jobs) {
  const payload = jobs.map((job) => ({
    session_id:job.sessionId,job_type:job.jobType,
    priority:job.priority,strategy_id:job.strategyId,target_strategy_id_r:job.targetStrategyIdR,
    ini_content:job.iniContent,job_payload:job.jobPayload,max_attempts:job.maxAttempts,
  }));
  const { rows } = await client.query(
    `INSERT INTO mt5_job_queue
       (session_id,job_type,priority,strategy_id,target_strategy_id_r,
        ini_content,job_payload,max_attempts)
     SELECT x.session_id,x.job_type,x.priority,x.strategy_id,
            x.target_strategy_id_r,x.ini_content,x.job_payload,x.max_attempts
       FROM jsonb_to_recordset($1::jsonb) AS x(
         session_id text,job_type text,priority integer,
         strategy_id text,target_strategy_id_r text,ini_content text,job_payload jsonb,max_attempts integer
       )
     RETURNING job_id,session_id,job_type,status,priority,strategy_id,
               target_strategy_id_r,progress,attempt_count,max_attempts,created_at`,
    [JSON.stringify(payload)],
  );
  return rows;
}

async function findActiveEveryTickTargets(sessionId, targetStrategyIds, client = pool) {
  if (!targetStrategyIds.length) return [];
  const { rows } = await client.query(
    `SELECT DISTINCT target_strategy_id_r
       FROM mt5_job_queue
      WHERE session_id=$1
        AND job_type='EVERY_TICK'
        AND status IN ('PENDING','CLAIMED','RUNNING')
        AND target_strategy_id_r=ANY($2::text[])`,
    [sessionId, targetStrategyIds],
  );
  return rows.map((row) => row.target_strategy_id_r);
}

async function countRunningEveryTickJobs(sessionId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total
       FROM mt5_job_queue
      WHERE session_id=$1 AND job_type='EVERY_TICK'
        AND status IN ('PENDING','CLAIMED','RUNNING')`,
    [sessionId],
  );
  return rows[0].total;
}

function buildJobWhere(actor, { sessionId, status, jobType, worker, owner, search, symbol }) {
  const values = [sessionId];
  const where = ['j.session_id=$1'];
  if (!actor.isAdmin) { values.push(actor.userId); where.push(`s.user_id=$${values.length}`); }
  if (status) { values.push(status); where.push(`j.status=$${values.length}`); }
  if (jobType) { values.push(jobType); where.push(`j.job_type=$${values.length}`); }
  if (search) {
    values.push(`%${String(search).trim().toLowerCase()}%`);
    where.push(`(
      LOWER(j.job_id) LIKE $${values.length}
      OR LOWER(COALESCE(j.strategy_id,'')) LIKE $${values.length}
      OR LOWER(COALESCE(j.job_payload->>'job_name','')) LIKE $${values.length}
      OR EXISTS (
        SELECT 1 FROM mt5_workers search_worker
         WHERE search_worker.id=j.claimed_by_worker_id
           AND LOWER(search_worker.worker_name) LIKE $${values.length}
      )
      OR EXISTS (
        SELECT 1 FROM users search_owner
         WHERE search_owner.id=s.user_id
           AND LOWER(search_owner.username) LIKE $${values.length}
      )
    )`);
  }
  if (symbol) {
    values.push(String(symbol).trim().toUpperCase());
    where.push(`(
      UPPER(COALESCE(NULLIF(j.job_payload->>'symbol','-'),''))=$${values.length}
      OR UPPER(COALESCE(j.strategy_id,'')) LIKE '%' || $${values.length} || '%'
    )`);
  }
  if (worker === 'Unassigned') {
    where.push('j.claimed_by_worker_id IS NULL');
  } else if (worker) {
    values.push(worker);
    where.push(`EXISTS (
      SELECT 1 FROM mt5_workers filter_worker
       WHERE filter_worker.id=j.claimed_by_worker_id
         AND filter_worker.worker_name=$${values.length}
    )`);
  }
  if (owner) {
    values.push(owner);
    where.push(`EXISTS (
      SELECT 1 FROM users filter_owner
       WHERE filter_owner.id=s.user_id
         AND filter_owner.username=$${values.length}
    )`);
  }
  return { values, where };
}

async function getJobFilterOptions(actor, sessionId) {
  const values = [sessionId];
  let ownerScope = '';
  if (!actor.isAdmin) {
    values.push(actor.userId);
    ownerScope = ` AND s.user_id=$${values.length}`;
  }
  const { rows } = await pool.query(
    `SELECT ARRAY_REMOVE(ARRAY_AGG(DISTINCT w.worker_name), NULL) AS workers,
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT u.username), NULL) AS owners,
            BOOL_OR(j.claimed_by_worker_id IS NULL) AS has_unassigned
       FROM mt5_job_queue j
       JOIN mt5_sessions s ON s.id=j.session_id
       JOIN users u ON u.id=s.user_id
       LEFT JOIN mt5_workers w ON w.id=j.claimed_by_worker_id
      WHERE j.session_id=$1 ${ownerScope}`,
    values,
  );
  return {
    workers: rows[0]?.workers || [],
    owners: rows[0]?.owners || [],
    hasUnassigned: Boolean(rows[0]?.has_unassigned),
  };
}

async function listJobs(actor, { sessionId, status, jobType, worker, search, symbol, beforeId, limit, offset = 0 }) {
  const { values, where } = buildJobWhere(actor, { sessionId, status, jobType, worker, search, symbol });
  if (beforeId) {
    values.push(beforeId);
    where.push(`(j.created_at,j.job_id) < (
      SELECT created_at,job_id FROM mt5_job_queue WHERE job_id=$${values.length}
    )`);
  }
  values.push(limit);
  const limitPosition = values.length;
  values.push(offset);
  const offsetPosition = values.length;
  const { rows } = await pool.query(
    `WITH paged_jobs AS MATERIALIZED (
       SELECT j.job_id,j.session_id,s.user_id,j.job_type,j.status,j.priority,j.strategy_id,
              j.target_strategy_id_r,j.job_payload,j.claimed_by_worker_id,j.run_id,
              j.attempt_count,j.max_attempts,j.progress,j.lease_expires_at,j.heartbeat_at,
              j.error_code,j.error_message,j.created_at,j.started_at,j.finished_at,j.updated_at,
              w.worker_name,u.username,
              CASE
                WHEN j.status IN ('RUNNING', 'CLAIMED') THEN 1
                WHEN j.status = 'DONE' THEN 2
                WHEN j.status = 'PENDING' THEN 3
                WHEN j.status = 'FAILED' THEN 4
                WHEN j.status = 'CANCELLED' THEN 5
                ELSE 6
              END AS status_order,
              COALESCE(j.started_at,j.finished_at,j.created_at) AS activity_at
         FROM mt5_job_queue j
         JOIN mt5_sessions s ON s.id=j.session_id
         LEFT JOIN mt5_workers w ON w.id=j.claimed_by_worker_id
         LEFT JOIN users u ON u.id=s.user_id
        WHERE ${where.join(' AND ')}
        ORDER BY status_order,j.strategy_id ASC NULLS LAST,activity_at DESC,j.job_id DESC
        LIMIT $${limitPosition} OFFSET $${offsetPosition}
     )
     SELECT p.job_id,p.session_id,p.user_id,p.job_type,p.status,p.priority,p.strategy_id,
            p.target_strategy_id_r,p.job_payload,p.claimed_by_worker_id,p.run_id,
            p.attempt_count,p.max_attempts,p.progress,p.lease_expires_at,p.heartbeat_at,
            p.error_code,p.error_message,p.created_at,p.started_at,p.finished_at,p.updated_at,
            result.target_pass,p.worker_name,p.username
       FROM paged_jobs p
       LEFT JOIN LATERAL (
         SELECT r.summary_op->>'pass' AS target_pass
           FROM mt5_optimize_results r
          WHERE r.strategy_id_r=p.target_strategy_id_r
          LIMIT 1
       ) result ON p.target_strategy_id_r IS NOT NULL
      ORDER BY p.status_order,p.strategy_id ASC NULLS LAST,p.activity_at DESC,p.job_id DESC`, values,
  );
  return rows;
}

async function countJobs(actor, filters) {
  const { values, where } = buildJobWhere(actor, filters);
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total
       FROM mt5_job_queue j JOIN mt5_sessions s ON s.id=j.session_id
      WHERE ${where.join(' AND ')}`,
    values,
  );
  return rows[0].total;
}

async function listJobSelection(actor, filters) {
  const { values, where } = buildJobWhere(actor, filters);
  const { rows } = await pool.query(
    `SELECT j.job_id,j.job_type,j.status
       FROM mt5_job_queue j
       JOIN mt5_sessions s ON s.id=j.session_id
      WHERE ${where.join(' AND ')}
      ORDER BY j.job_id`,
    values,
  );
  return rows;
}

async function getJobOverview(actor, sessionId) {
  const values = [sessionId];
  const where = ['j.session_id=$1'];
  if (!actor.isAdmin) {
    values.push(actor.userId);
    where.push(`s.user_id=$${values.length}`);
  }
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE j.status='PENDING')::int AS pending,
            COUNT(*) FILTER (WHERE j.status IN ('CLAIMED','RUNNING'))::int AS running,
            COUNT(*) FILTER (WHERE j.status='DONE')::int AS completed,
            COUNT(*) FILTER (WHERE j.status='FAILED')::int AS failed,
            COUNT(*) FILTER (WHERE j.job_type='OPEN_PRICE')::int AS optimize,
            COUNT(*) FILTER (WHERE j.job_type='EVERY_TICK')::int AS backtest,
            COALESCE(SUM(
              CASE WHEN COALESCE(j.job_payload->>'optimize_stored_count','') ~ '^[0-9]+$'
                   THEN (j.job_payload->>'optimize_stored_count')::bigint
                   ELSE 0 END
            ),0)::bigint AS stored_results
       FROM mt5_job_queue j
       JOIN mt5_sessions s ON s.id=j.session_id
      WHERE ${where.join(' AND ')}`,
    values,
  );
  return rows[0];
}

async function getJob(jobId, client = pool) {
  const { rows } = await client.query(
    `SELECT j.*,s.user_id,r.summary_op->>'pass' AS target_pass,w.worker_name,u.username
       FROM mt5_job_queue j
       JOIN mt5_sessions s ON s.id=j.session_id
       LEFT JOIN mt5_workers w ON w.id=j.claimed_by_worker_id
       LEFT JOIN users u ON u.id=s.user_id
       LEFT JOIN mt5_optimize_results r
         ON r.session_id=j.session_id AND r.strategy_id_r=j.target_strategy_id_r
      WHERE j.job_id=$1`,
    [jobId]
  );
  return rows[0] || null;
}

async function claimJob({ apiKey, workerName, workerInstanceId = null }) {
  const client = await safeConnect(pool, 'MT5_CLAIM');
  try {
    await client.query('BEGIN');
    const key = await findActiveApiKey(apiKey, client);
    if (!key) { await client.query('ROLLBACK'); return { invalidKey: true }; }
    const worker = await upsertWorkerRecord(client, {
      ownerUserId:key.user_id,
      apiKeyId:key.id,
      workerName,
      workerInstanceId,
      status:MT5.WORKER_STATUS.ONLINE,
    });
    await client.query(`SELECT id FROM mt5_workers WHERE id=$1 FOR UPDATE`, [worker.id]);
    const activeJob = await client.query(
      `SELECT job_id FROM mt5_job_queue
        WHERE claimed_by_worker_id=$1 AND status IN ('CLAIMED','RUNNING') LIMIT 1`, [worker.id],
    );
    if (activeJob.rowCount) {
      await client.query('COMMIT'); return { worker, job: null };
    }
    if (!worker.run_access || worker.status === MT5.WORKER_STATUS.BLOCKED || worker.status === MT5.WORKER_STATUS.DRAINING) {
      await client.query('COMMIT'); return { worker, job: null };
    }
    const runId = randomUUID();
    const jobResult = await client.query(
      `WITH candidate AS (
         SELECT j.job_id FROM mt5_job_queue j
         JOIN mt5_sessions s ON s.id=j.session_id
          WHERE j.status='PENDING'
            AND j.job_type = ANY($1::text[])
            AND (s.user_id=$2 OR $3::boolean=TRUE)
          ORDER BY j.priority DESC,j.created_at,j.job_id
          FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE mt5_job_queue j SET status='CLAIMED',claimed_by_worker_id=$4,
         run_id=$5,attempt_count=attempt_count+1,started_at=NOW(),
         heartbeat_at=NOW(),lease_expires_at=NOW()+($6 || ' seconds')::interval,
         progress=0,error_code=NULL,error_message=NULL
       FROM candidate c WHERE j.job_id=c.job_id RETURNING j.*`,
      [worker.allowed_job_types,key.user_id,worker.is_public,worker.id,runId,MT5.LEASE_SECONDS],
    );
    if (jobResult.rows[0]) {
      await client.query(`UPDATE mt5_workers SET status='BUSY' WHERE id=$1`, [worker.id]);
    }
    await client.query('COMMIT');
    return { worker, job: jobResult.rows[0] || null };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

async function updateActiveJob(jobId, runId, workerId, fields) {
  const keys = Object.keys(fields);
  const values = [jobId, runId, workerId];
  const set = keys.map((key) => { values.push(fields[key]); return `${key}=$${values.length}`; });
  const { rows } = await pool.query(
    `WITH updated_job AS (
       UPDATE mt5_job_queue SET ${set.join(',')}
        WHERE job_id=$1 AND run_id=$2 AND claimed_by_worker_id=$3
          AND status IN ('CLAIMED','RUNNING')
        RETURNING *
     ), updated_worker AS (
       UPDATE mt5_workers
          SET last_seen_at=NOW(),
              status=CASE
                WHEN status IN ('DRAINING','BLOCKED') THEN status
                ELSE 'BUSY'
              END
        WHERE id=$3 AND EXISTS (SELECT 1 FROM updated_job)
        RETURNING id
     )
     SELECT updated_job.*
       FROM updated_job
       LEFT JOIN updated_worker ON TRUE`, values,
  );
  return rows[0] || null;
}

async function finishJob(jobId, runId, workerId, status, errorMessage = null, client = pool) {
  const { rows } = await client.query(
    `UPDATE mt5_job_queue SET status=$4::varchar,progress=CASE WHEN $4::varchar='DONE' THEN 100 ELSE progress END,
       finished_at=NOW(),lease_expires_at=NULL,error_message=$5,
       job_payload=CASE WHEN job_payload ? 'rerun_remaining' THEN
         job_payload || jsonb_build_object(
           'rerun_remaining',GREATEST(COALESCE((job_payload->>'rerun_remaining')::integer,1)-1,0),
           'rerun_index',COALESCE((job_payload->>'rerun_index')::integer,0)+1
         ) ELSE job_payload END
     WHERE job_id=$1 AND run_id=$2 AND claimed_by_worker_id=$3
       AND status IN ('CLAIMED','RUNNING') RETURNING *`,
    [jobId,runId,workerId,status,errorMessage],
  );
  if (rows[0]) await client.query(`UPDATE mt5_workers SET status='ONLINE' WHERE id=$1`, [workerId]);
  return rows[0] || null;
}

async function rerunJob(jobId, actor, count, client = pool) {
  const values=[jobId,count];
  let owner='';
  if(!actor.isAdmin) {
    values.push(actor.userId);
    owner=` AND EXISTS (
      SELECT 1 FROM mt5_sessions s
       WHERE s.id=mt5_job_queue.session_id AND s.user_id=$${values.length}
    )`;
  }
  const {rows}=await client.query(
    `UPDATE mt5_job_queue SET
       status='PENDING',run_id=NULL,claimed_by_worker_id=NULL,attempt_count=0,
       lease_expires_at=NULL,heartbeat_at=NULL,started_at=NULL,finished_at=NULL,
       error_code=NULL,error_message=NULL,progress=0,
       job_payload=(job_payload
         - 'optimize_ingested_run_id' - 'backtest_ingested_run_id'
         - 'backtest_candidate_id' - 'duration_ms' - 'elapsed_ms'
         - 'rerun_source_job_id' - 'rerun_total' - 'rerun_remaining' - 'rerun_index') ||
         CASE WHEN job_type='OPEN_PRICE'
           THEN jsonb_build_object('optimize_runs',$2::integer)
           ELSE jsonb_build_object(
             'optimize_runs',1,'rerun_total',$2::integer,
             'rerun_remaining',$2::integer,'rerun_index',0
           )
         END
     WHERE job_id=$1 ${owner}
       AND status IN ('DONE','FAILED','CANCELLED')
     RETURNING *`,
    values,
  );
  return rows[0]||null;
}

async function continueRerunJob(jobId, client = pool) {
  const {rows}=await client.query(
    `UPDATE mt5_job_queue SET
       status='PENDING',run_id=NULL,claimed_by_worker_id=NULL,attempt_count=0,
       lease_expires_at=NULL,heartbeat_at=NULL,started_at=NULL,finished_at=NULL,
       error_code=NULL,error_message=NULL,progress=0,
       job_payload=job_payload
         - 'optimize_ingested_run_id' - 'backtest_ingested_run_id'
         - 'backtest_candidate_id' - 'duration_ms' - 'elapsed_ms'
     WHERE job_id=$1
       AND status IN ('DONE','FAILED')
       AND COALESCE((job_payload->>'rerun_remaining')::integer,0)>0
     RETURNING *`,
    [jobId],
  );
  return rows[0]||null;
}

async function mutateJob(jobId, actor, action) {
  const values = [jobId];
  let owner = '';
  if (!actor.isAdmin) {
    values.push(actor.userId);
    owner=` AND EXISTS (SELECT 1 FROM mt5_sessions s WHERE s.id=mt5_job_queue.session_id AND s.user_id=$2)`;
  }
  const statements = {
    cancel: `status='CANCELLED',finished_at=NOW(),lease_expires_at=NULL`,
    retry: `status='PENDING',run_id=NULL,claimed_by_worker_id=NULL,lease_expires_at=NULL,heartbeat_at=NULL,started_at=NULL,finished_at=NULL,error_message=NULL,progress=0`,
  };
  const assignment = statements[action];
  if (!assignment) return null;
  const { rows } = await pool.query(
    `UPDATE mt5_job_queue SET ${assignment} WHERE job_id=$1 ${owner} RETURNING *`, values,
  );
  return rows[0] || null;
}

async function deleteJob(jobId, actor) {
  const values=[jobId]; let owner='';
  if (!actor.isAdmin) {
    values.push(actor.userId);
    owner=' AND EXISTS (SELECT 1 FROM mt5_sessions s WHERE s.id=mt5_job_queue.session_id AND s.user_id=$2)';
  }
  const { rows } = await pool.query(
    `DELETE FROM mt5_job_queue WHERE job_id=$1 ${owner}
      AND status IN ('PENDING','DONE','FAILED','CANCELLED') RETURNING *`, values,
  );
  return rows[0] || null;
}

async function getJobRuntimeStates(jobIds) {
  if (!jobIds.length) return [];
  const { rows } = await pool.query(
    `SELECT job_id,status,updated_at
       FROM mt5_job_queue
      WHERE job_id=ANY($1::varchar[])`,
    [jobIds],
  );
  return rows;
}

async function insertOptimizeResults(client, job, summaries) {
  let storedCount=0;
  for (let offset=0;offset<summaries.length;offset+=1000) {
    const chunk=summaries.slice(offset,offset+1000);
    const { rows } = await client.query(
      `WITH inserted AS (
         INSERT INTO mt5_optimize_results (
           session_id,strategy_id,summary_op,result_value,profit,expected_payoff,
           trades,profit_factor,recovery_factor,equity_dd_percent,sharpe_ratio,pd_ratio
         )
         SELECT $1,$2,x.summary_op,x.result_value,x.profit,x.expected_payoff,
                x.trades,x.profit_factor,x.recovery_factor,x.equity_dd_percent,
                x.sharpe_ratio,x.pd_ratio
           FROM jsonb_to_recordset($3::jsonb) AS x(
             summary_op jsonb,result_value numeric,profit numeric,expected_payoff numeric,
             trades integer,profit_factor numeric,recovery_factor numeric,
             equity_dd_percent numeric,sharpe_ratio numeric,pd_ratio numeric
           )
         RETURNING profit,trades
       )
       SELECT COUNT(*)::int AS stored_count
         FROM inserted`,
      [job.session_id,job.strategy_id,JSON.stringify(chunk)],
    );
    storedCount+=Number(rows[0]?.stored_count)||0;
  }
  return {storedCount};
}

async function lockOptimizeStrategy(client, sessionId, strategyId) {
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))`,
    [sessionId,strategyId],
  );
  const { rows } = await client.query(
    `SELECT EXISTS(
       SELECT 1 FROM mt5_optimize_results
        WHERE session_id=$1 AND strategy_id=$2
     ) AS existed`,
    [sessionId,strategyId],
  );
  return Boolean(rows[0]?.existed);
}

async function finalizeOptimizeIngest(client, job, { storedCount, strategyExisted }) {
  if (storedCount > 0) {
    await client.query(
      `UPDATE mt5_optimize_results
          SET is_strategy_best=FALSE
        WHERE session_id=$1 AND strategy_id=$2 AND is_strategy_best=TRUE`,
      [job.session_id,job.strategy_id],
    );
    await client.query(
      `UPDATE mt5_optimize_results
          SET is_strategy_best=TRUE
        WHERE id=(
          SELECT id FROM mt5_optimize_results
           WHERE session_id=$1 AND strategy_id=$2
           ORDER BY result_value DESC NULLS LAST,id DESC
           LIMIT 1
        )`,
      [job.session_id,job.strategy_id],
    );
  }
  const { rows } = await client.query(
    `UPDATE mt5_sessions
        SET result_version=result_version+1,
            optimize_result_count=optimize_result_count+$2,
            optimize_strategy_count=optimize_strategy_count+$3
      WHERE id=$1
      RETURNING result_version,optimize_result_count,optimize_strategy_count,updated_at`,
    [job.session_id,storedCount,storedCount>0&&!strategyExisted?1:0],
  );
  return rows[0];
}

async function insertLog({ sessionId=null,userId=null,jobId=null,workerId=null,level='INFO',eventType,message,context={} }) {
  await pool.query(
    `INSERT INTO mt5_logs(session_id,actor_user_id,job_id,worker_id,level,event_type,message,context)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
    [sessionId,userId,jobId,workerId,level,eventType,message,JSON.stringify(context)],
  );
}

async function listLogs(actor,{sessionId,beforeId,limit}) {
  const values=[sessionId]; const where=['l.session_id=$1'];
  if(!actor.isAdmin){values.push(actor.userId);where.push(`s.user_id=$${values.length}`);}
  if(beforeId){values.push(beforeId);where.push(`l.id<$${values.length}`);}
  values.push(limit);
  const {rows}=await pool.query(
    `SELECT l.*,l.actor_user_id AS user_id,w.worker_name
       FROM mt5_logs l
       JOIN mt5_sessions s ON s.id=l.session_id
       LEFT JOIN mt5_workers w ON w.id=l.worker_id
      WHERE ${where.join(' AND ')} ORDER BY l.id DESC LIMIT $${values.length}`,values,
  ); return rows;
}

async function getFilterPreferences(userId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(preferences -> $2::text, '{}'::jsonb) AS filter_preferences
       FROM users
      WHERE id=$1`,
    [userId, MT5.FILTER_PREFERENCE_ROOT],
  );
  return rows[0]?.filter_preferences || {};
}

async function saveFilterPreference(userId, scope, preference) {
  const { rows } = await pool.query(
    `UPDATE users
        SET preferences=COALESCE(preferences, '{}'::jsonb) || jsonb_build_object(
          $2::text,
          COALESCE(preferences -> $2::text, '{}'::jsonb) || jsonb_build_object($3::text, $4::jsonb)
        )
      WHERE id=$1
      RETURNING preferences -> $2::text -> $3::text AS preference`,
    [userId, MT5.FILTER_PREFERENCE_ROOT, scope, JSON.stringify(preference)],
  );
  return rows[0]?.preference || null;
}

async function deleteFilterPreference(userId, scope) {
  const { rows } = await pool.query(
    `UPDATE users
        SET preferences=COALESCE(preferences, '{}'::jsonb) || jsonb_build_object(
          $2::text,
          COALESCE(preferences -> $2::text, '{}'::jsonb) - $3::text
        )
      WHERE id=$1
      RETURNING preferences -> $2::text AS filter_preferences`,
    [userId, MT5.FILTER_PREFERENCE_ROOT, scope],
  );
  return rows[0]?.filter_preferences || {};
}

async function recoverExpiredJobs() {
  const { rows }=await pool.query(
    `UPDATE mt5_job_queue SET
       status=CASE WHEN job_payload ? 'optimize_ingested_run_id'
                         OR job_payload ? 'backtest_ingested_run_id' THEN 'DONE'
                   WHEN attempt_count<max_attempts THEN 'PENDING' ELSE 'FAILED' END,
       claimed_by_worker_id=NULL,run_id=NULL,lease_expires_at=NULL,heartbeat_at=NULL,
       error_code='LEASE_EXPIRED',error_message='Worker lease expired',
       finished_at=CASE WHEN job_payload ? 'optimize_ingested_run_id'
                              OR job_payload ? 'backtest_ingested_run_id'
                              OR attempt_count>=max_attempts THEN NOW() ELSE NULL END,
       progress=CASE WHEN job_payload ? 'optimize_ingested_run_id'
                           OR job_payload ? 'backtest_ingested_run_id' THEN 100 ELSE progress END
     WHERE status IN ('CLAIMED','RUNNING') AND lease_expires_at<NOW()
     RETURNING job_id,status,session_id,job_type,target_strategy_id_r,
               priority,strategy_id,ini_content,job_payload,max_attempts`,
  ); return rows;
}

module.exports={
  pool,createSession,listSessions,getSession,updateSession,getSessionCleanupPreview,purgeUnusedOptimizeResults,deleteSessionChunk,createApiKey,listApiKeys,revokeApiKey,deleteApiKey,
  findActiveApiKey,upsertWorker,getWorkerByName,listWorkers,updateWorker,deleteWorker,createJobs,findActiveEveryTickTargets,countRunningEveryTickJobs,listJobs,countJobs,listJobSelection,getJob,
  getJobOverview,
  getJobFilterOptions,
  claimJob,updateActiveJob,finishJob,rerunJob,continueRerunJob,mutateJob,deleteJob,getJobRuntimeStates,insertOptimizeResults,
  lockOptimizeStrategy,finalizeOptimizeIngest,
  insertLog,listLogs,getFilterPreferences,saveFilterPreference,deleteFilterPreference,recoverExpiredJobs,
};
