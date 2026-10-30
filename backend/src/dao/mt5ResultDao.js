const { getAppPool, safeConnect } = require("../config/db");
const { MT5: MESSAGES } = require("../utils/messages");
const { appendClusterLeaders } = require("../utils/optimizationClustering");

const pool = getAppPool();

const OPTIMIZE_SCORE = `COALESCE(r.result_value,0)`;

const OPTIMIZE_COLUMNS = `
  r.id, r.session_id, s.user_id, r.strategy_id, r.strategy_id_r,
  r.summary_op->'pass' AS pass,
  r.summary_op->'metrics' AS metrics,
  r.summary_op->'inputs' AS inputs,
  r.summary_op->>'template_ini' AS template_ini,
  r.picked_watchlist,
  (r.picked_bt AND EXISTS (
    SELECT 1
      FROM mt5_job_queue active_bt
     WHERE active_bt.session_id=r.session_id
       AND active_bt.target_strategy_id_r=r.strategy_id_r
       AND active_bt.job_type='EVERY_TICK'
       AND active_bt.status IN ('PENDING','CLAIMED','RUNNING')
  )) AS picked_bt,
  r.result_value,r.profit,r.expected_payoff,r.trades,r.profit_factor,
  r.recovery_factor,r.equity_dd_percent,r.sharpe_ratio,r.pd_ratio,
  r.is_strategy_best,
  (r.backtest_run_count > 0) AS backtest_completed,
  r.backtest_run_count, r.created_at, r.updated_at
`;

function parseRange(combined, explicitMin, explicitMax) {
  let min = explicitMin !== undefined && explicitMin !== null && explicitMin !== ""
    ? Number(explicitMin) : null;
  let max = explicitMax !== undefined && explicitMax !== null && explicitMax !== ""
    ? Number(explicitMax) : null;
  if (combined !== undefined && combined !== null && combined !== "" && min === null && max === null) {
    const match = String(combined).trim().match(/^\s*(-?\d+(?:\.\d+)?)?\s*-\s*(-?\d+(?:\.\d+)?)?\s*$/);
    if (match) {
      min = match[1] === undefined ? null : Number(match[1]);
      max = match[2] === undefined ? null : Number(match[2]);
    } else {
      const value = Number(combined);
      min = Number.isFinite(value) ? value : null;
    }
  }
  return {
    min: Number.isFinite(min) ? min : null,
    max: Number.isFinite(max) ? max : null,
  };
}

function buildOptimizeWhere(actor, filters) {
  const values = [filters.sessionId];
  const where = ["r.session_id=$1"];
  if (!actor.isAdmin) {
    values.push(actor.userId);
    where.push(`s.user_id=$${values.length}`);
  }
  if (filters.view === "watchlist") where.push("r.picked_watchlist=TRUE");
  if (filters.view === "candidates") where.push("r.picked_bt=TRUE");
  if (filters.strategyId) {
    values.push(filters.strategyId);
    where.push(`r.strategy_id=$${values.length}`);
  }
  if (filters.search) {
    values.push(`%${filters.search}%`);
    where.push(`(r.strategy_id ILIKE $${values.length} OR r.strategy_id_r ILIKE $${values.length})`);
  }
  if (filters.symbol) {
    values.push(`%${filters.symbol}%`);
    where.push(`r.strategy_id ILIKE $${values.length}`);
  }
  if (filters.state === "STORED") where.push("r.backtest_run_count=0");
  if (filters.state === "BACKTESTED") where.push("r.backtest_run_count>0");
  if (filters.backtestRuns === "GT5") {
    where.push("r.backtest_run_count>5");
  } else if (filters.backtestRuns !== undefined && filters.backtestRuns !== null && filters.backtestRuns !== "") {
    const exact = Number.parseInt(filters.backtestRuns, 10);
    if (Number.isInteger(exact) && exact >= 0 && exact <= 5) {
      values.push(exact);
      where.push(`r.backtest_run_count=$${values.length}`);
    }
  }
  const appendRange = (expression, combined, explicitMin, explicitMax, absolute = false) => {
    const noMaximum=explicitMax===undefined||explicitMax===null||explicitMax==='';
    const noExplicitMinimum=explicitMin===undefined||explicitMin===null||explicitMin===''||Number(explicitMin)===0;
    if(noMaximum&&Number(combined)===0&&noExplicitMinimum) return;
    const range = parseRange(combined, explicitMin, explicitMax);
    const value = absolute ? `ABS(${expression})` : expression;
    if (range.min !== null) {
      values.push(range.min);
      where.push(`${value}>=$${values.length}`);
    }
    if (range.max !== null) {
      values.push(range.max);
      where.push(`${value}<=$${values.length}`);
    }
  };
  appendRange("COALESCE(r.profit,0)", filters.minProfit, filters.minProfit, filters.maxProfit);
  appendRange("COALESCE(r.recovery_factor,0)", filters.minRecoveryFactor, filters.minRecoveryFactor, filters.maxRecoveryFactor);
  appendRange("COALESCE(r.trades,0)", filters.trades, filters.minTrades, filters.maxTrades);
  appendRange("COALESCE(r.profit_factor,0)", filters.profitFactor, filters.minProfitFactor, filters.maxProfitFactor);
  appendRange("COALESCE(r.equity_dd_percent,0)", filters.balanceDD, filters.minBalanceDD, filters.maxBalanceDD);
  appendRange("COALESCE(r.pd_ratio,0)", filters.pdRatio, filters.minPdRatio, filters.maxPdRatio);
  appendRange("COALESCE(r.sharpe_ratio,0)", filters.sharpeRatio, filters.minSharpeRatio, filters.maxSharpeRatio);
  appendRange("COALESCE(NULLIF(regexp_replace(COALESCE(r.summary_op->'metrics'->>'Largest Loss Trade',r.summary_op->'metrics'->>'largest_loss_trade','0'),'[^0-9.-]','','g'),'')::numeric,0)", filters.largestLossTrade, filters.minLargestLossTrade, filters.maxLargestLossTrade, true);
  return { values, where };
}

function hasResultLevelFilters(filters) {
  const keys=[
    'view','state','backtestRuns','minProfit','maxProfit','minRecoveryFactor','maxRecoveryFactor',
    'trades','minTrades','maxTrades','profitFactor','minProfitFactor','maxProfitFactor',
    'balanceDD','minBalanceDD','maxBalanceDD','pdRatio','minPdRatio','maxPdRatio',
    'sharpeRatio','minSharpeRatio','maxSharpeRatio','largestLossTrade',
    'minLargestLossTrade','maxLargestLossTrade',
  ];
  return keys.some((key)=>{
    const value=filters[key];
    if(value===undefined||value===null||value==='') return false;
    const normalized=String(value).trim().toUpperCase();
    if(key==='backtestRuns') return normalized!=='ALL';
    return normalized!=='ALL'&&normalized!=='0';
  });
}

const CLUSTER_BATCH_SIZES = Object.freeze([2000, 5000, 10000]);
const CLUSTER_STRATEGY_CONCURRENCY = 3;

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(items[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

async function listMatchingStrategyIds(actor, filters, limit, offset) {
  const { values, where } = buildOptimizeWhere(actor, filters);
  values.push(limit);
  const limitPosition = values.length;
  values.push(offset);
  const offsetPosition = values.length;
  const { rows } = await pool.query(
    `SELECT b.strategy_id
       FROM mt5_optimize_results b
      WHERE b.session_id=$1 AND b.is_strategy_best=TRUE
        AND EXISTS (
          SELECT 1
            FROM mt5_optimize_results r
            JOIN mt5_sessions s ON s.id=r.session_id
           WHERE ${where.join(" AND ")}
             AND r.strategy_id=b.strategy_id
        )
      ORDER BY b.strategy_id ASC
      LIMIT $${limitPosition} OFFSET $${offsetPosition}`,
    values,
  );
  return rows.map((row) => row.strategy_id);
}

async function loadClusterCandidateBatch(actor, filters, strategyId, cursor, limit) {
  const { values, where } = buildOptimizeWhere(actor, filters);
  values.push(strategyId);
  where.push(`r.strategy_id=$${values.length}`);
  if (cursor) {
    values.push(cursor.resultValue);
    const resultPosition = values.length;
    values.push(cursor.id);
    const idPosition = values.length;
    where.push(`(
      ${OPTIMIZE_SCORE}<$${resultPosition}::numeric
      OR (${OPTIMIZE_SCORE}=$${resultPosition}::numeric AND r.id<$${idPosition}::bigint)
    )`);
  }
  values.push(limit);
  const limitPosition = values.length;
  const { rows } = await pool.query(
    `SELECT r.id,r.strategy_id,r.result_value,r.summary_op->'inputs' AS inputs
       FROM mt5_optimize_results r
       JOIN mt5_sessions s ON s.id=r.session_id
      WHERE ${where.join(" AND ")}
      ORDER BY ${OPTIMIZE_SCORE} DESC,r.id DESC
      LIMIT $${limitPosition}`,
    values,
  );
  return rows;
}

async function findClusterLeadersForStrategy(actor, filters, strategyId, radius, topN) {
  const leaders = [];
  let cursor = null;
  let batchIndex = 0;
  let scannedRows = 0;
  let batchCount = 0;

  while (leaders.length < topN) {
    const batchSize = CLUSTER_BATCH_SIZES[Math.min(batchIndex, CLUSTER_BATCH_SIZES.length - 1)];
    const rows = await loadClusterCandidateBatch(actor, filters, strategyId, cursor, batchSize);
    batchCount += 1;
    scannedRows += rows.length;

    appendClusterLeaders(leaders, rows, radius, topN);

    if (leaders.length >= topN || rows.length < batchSize) break;
    const last = rows[rows.length - 1];
    cursor = { resultValue: String(last.result_value ?? 0), id: last.id };
    batchIndex += 1;
  }

  return { strategyId, leaders, scannedRows, batchCount };
}

async function listClusteredGroupedResults(actor, filters, limit, offset, radius, topN) {
  const startedAt = Date.now();
  const heapBeforeMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  const strategyIds = await listMatchingStrategyIds(actor, filters, limit, offset);
  if (!strategyIds.length) return [];

  const clusters = await mapWithConcurrency(
    strategyIds,
    CLUSTER_STRATEGY_CONCURRENCY,
    (strategyId) => findClusterLeadersForStrategy(actor, filters, strategyId, radius, topN),
  );
  const candidates = clusters.flatMap((cluster) =>
    cluster.leaders.map((leader) => ({ ...leader, total_passes: cluster.leaders.length })),
  );
  const hydrated = await hydrateOptimizeRows(candidates);
  const rowsByStrategy = new Map();
  for (const row of hydrated) {
    if (!rowsByStrategy.has(row.strategy_id)) rowsByStrategy.set(row.strategy_id, []);
    rowsByStrategy.get(row.strategy_id).push(row);
  }

  const output = [];
  for (const cluster of clusters) {
    const clusterRowsForStrategy = rowsByStrategy.get(cluster.strategyId) || [];
    if (!clusterRowsForStrategy.length) continue;
    output.push({
      ...clusterRowsForStrategy[0],
      total_passes: clusterRowsForStrategy.length,
      cluster_result_ids: clusterRowsForStrategy.map((row) => row.id),
      cluster_rows: clusterRowsForStrategy,
    });
  }
  console.log(
    `[mt5-results] clustered page session=${filters.sessionId} strategies=${strategyIds.length} `
      + `leaders=${output.reduce((sum, row) => sum + Number(row.total_passes || 0), 0)} `
      + `scanned=${clusters.reduce((sum, cluster) => sum + cluster.scannedRows, 0)} `
      + `batches=${clusters.reduce((sum, cluster) => sum + cluster.batchCount, 0)} `
      + `top_n=${topN} radius_pct=${radius * 100} wall_ms=${Date.now() - startedAt} `
      + `heap_before_mb=${heapBeforeMb} heap_after_mb=${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}`,
  );
  return output;
}

async function listClusteredStrategyResults(actor, filters, limit, offset, radius, topN) {
  const cluster = await findClusterLeadersForStrategy(
    actor,
    filters,
    filters.strategyId,
    radius,
    topN,
  );
  return hydrateOptimizeRows(cluster.leaders.slice(offset, offset + limit));
}

async function hydrateOptimizeRows(candidates) {
  if (!candidates.length) return [];
  const ids = candidates.map((row) => row.id);
  const { rows } = await pool.query(
    `SELECT ${OPTIMIZE_COLUMNS}
       FROM mt5_optimize_results r
       JOIN mt5_sessions s ON s.id=r.session_id
      WHERE r.id=ANY($1::bigint[])`,
    [ids],
  );
  const rowsById = new Map(rows.map((row) => [String(row.id), row]));
  return candidates
    .map((candidate) => {
      const row = rowsById.get(String(candidate.id));
      return row ? { ...row, total_passes: candidate.total_passes ?? row.total_passes } : null;
    })
    .filter(Boolean);
}

async function listOptimizeResults(actor, filters) {
  const { values, where } = buildOptimizeWhere(actor, filters);
  const limit = filters.limit || 25;
  const topN = Number(filters.topN || filters.top_n) || 0;
  const radius = (Number(filters.clusterRadius || filters.cluster_radius) || 0) / 100;
  const grouped = (filters.groupBy || filters.group_by) === "strategy";
  const cursorEnabled=Boolean(filters.cursor)&&topN<=0&&radius<=0;
  if(cursorEnabled) {
    values.push(filters.cursor.strategyId);
    const strategyPosition=values.length;
    if(grouped) {
      where.push(`r.strategy_id>$${strategyPosition}`);
    } else {
      values.push(String(filters.cursor.resultValue??0));
      const resultPosition=values.length;
      values.push(String(filters.cursor.id));
      const idPosition=values.length;
      where.push(`(
        r.strategy_id>$${strategyPosition}
        OR (r.strategy_id=$${strategyPosition} AND ${OPTIMIZE_SCORE}<$${resultPosition}::numeric)
        OR (r.strategy_id=$${strategyPosition} AND ${OPTIMIZE_SCORE}=$${resultPosition}::numeric AND r.id<$${idPosition}::bigint)
      )`);
    }
  }
  const offset = cursorEnabled?0:(filters.offset||0);

  if (radius > 0) {
    if (grouped) return listClusteredGroupedResults(actor, filters, limit, offset, radius, topN);
    if (filters.strategyId) return listClusteredStrategyResults(actor, filters, limit, offset, radius, topN);
    const error = new Error(MESSAGES.CLUSTER_REQUIRES_GROUPED);
    error.status = 400;
    error.code = 'MT5_CLUSTER_REQUIRES_GROUPED';
    throw error;
  }

  const baseValues = [...values];
  values.push(limit);
  const limitPosition = values.length;
  values.push(offset);
  const offsetPosition = values.length;
  if (grouped && radius <= 0) {
    const useStoredBest=!hasResultLevelFilters(filters);
    const representativeSql=useStoredBest
      ? `SELECT ${OPTIMIZE_COLUMNS}
           FROM mt5_optimize_results r
           JOIN mt5_sessions s ON s.id=r.session_id
          WHERE ${where.join(" AND ")} AND r.is_strategy_best=TRUE
          ORDER BY r.strategy_id ASC
          LIMIT $${limitPosition} OFFSET $${offsetPosition}`
      : `WITH strategy_page AS (
           SELECT b.strategy_id
             FROM mt5_optimize_results b
            WHERE b.session_id=$1 AND b.is_strategy_best=TRUE
              AND EXISTS (
                SELECT 1
                  FROM mt5_optimize_results r
                  JOIN mt5_sessions s ON s.id=r.session_id
                 WHERE ${where.join(" AND ")}
                   AND r.strategy_id=b.strategy_id
              )
            ORDER BY b.strategy_id ASC
            LIMIT $${limitPosition} OFFSET $${offsetPosition}
         )
         SELECT representative.*
           FROM strategy_page page
           CROSS JOIN LATERAL (
             SELECT ${OPTIMIZE_COLUMNS}
               FROM mt5_optimize_results r
               JOIN mt5_sessions s ON s.id=r.session_id
              WHERE ${where.join(" AND ")} AND r.strategy_id=page.strategy_id
              ORDER BY ${OPTIMIZE_SCORE} DESC,r.id DESC
              LIMIT 1
           ) representative
          ORDER BY representative.strategy_id ASC`;
    const { rows } = await pool.query(representativeSql,values);
    if (rows.length === 0) return rows;
    const countValues = [...baseValues, rows.map((row) => row.strategy_id)];
    const { rows: counts } = await pool.query(
      `SELECT r.strategy_id, COUNT(*)::int AS total_passes
         FROM mt5_optimize_results r
         JOIN mt5_sessions s ON s.id=r.session_id
        WHERE ${where.join(" AND ")}
          AND r.strategy_id = ANY($${countValues.length}::varchar[])
        GROUP BY r.strategy_id`,
      countValues,
    );
    const countByStrategy = new Map(counts.map((row) => [row.strategy_id, row.total_passes]));
    return rows.map((row) => ({
      ...row,
      total_passes: topN > 0
        ? Math.min(countByStrategy.get(row.strategy_id) || 0, topN)
        : countByStrategy.get(row.strategy_id) || 0,
    }));
  }

  if(topN<=0) {
    const {rows}=await pool.query(
      `SELECT ${OPTIMIZE_COLUMNS}
         FROM mt5_optimize_results r
         JOIN mt5_sessions s ON s.id=r.session_id
        WHERE ${where.join(" AND ")}
        ORDER BY r.strategy_id ASC,${OPTIMIZE_SCORE} DESC,r.id DESC
        LIMIT $${limitPosition} OFFSET $${offsetPosition}`,
      values,
    );
    return rows;
  }

  const { rows } = await pool.query(
    `WITH strategies AS (
       SELECT b.strategy_id
         FROM mt5_optimize_results b
         JOIN mt5_sessions bs ON bs.id=b.session_id
        WHERE b.session_id=$1 AND b.is_strategy_best=TRUE
          ${actor.isAdmin?'':`AND bs.user_id=$2`}
     )
     SELECT candidate.*
       FROM strategies strategy
       CROSS JOIN LATERAL (
         SELECT ${OPTIMIZE_COLUMNS},NULL::int AS strategy_rank,NULL::int AS total_passes
           FROM mt5_optimize_results r
           JOIN mt5_sessions s ON s.id=r.session_id
          WHERE ${where.join(" AND ")} AND r.strategy_id=strategy.strategy_id
          ORDER BY ${OPTIMIZE_SCORE} DESC,r.id DESC
          LIMIT ${topN}
       ) candidate
      ORDER BY candidate.strategy_id ASC,candidate.result_value DESC NULLS LAST,candidate.id DESC
      LIMIT $${limitPosition} OFFSET $${offsetPosition}`,
    values,
  );
  return rows;
}

async function countOptimizeResults(actor, filters) {
  const { values, where } = buildOptimizeWhere(actor, filters);
  const grouped = (filters.groupBy || filters.group_by) === "strategy";
  const topN = Number(filters.topN || filters.top_n) || 0;
  const radius = (Number(filters.clusterRadius || filters.cluster_radius) || 0) / 100;
  if (grouped && radius > 0) {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS total
         FROM mt5_optimize_results b
        WHERE b.session_id=$1 AND b.is_strategy_best=TRUE
          AND EXISTS (
            SELECT 1
              FROM mt5_optimize_results r
              JOIN mt5_sessions s ON s.id=r.session_id
             WHERE ${where.join(" AND ")}
               AND r.strategy_id=b.strategy_id
          )`,
      values,
    );
    return rows[0].total;
  }
  if (grouped) {
    const hasFilters = hasResultLevelFilters(filters);
    const sql = hasFilters
      ? `SELECT COUNT(*)::int AS total
           FROM mt5_optimize_results b
          WHERE b.session_id=$1 AND b.is_strategy_best=TRUE
            AND EXISTS (
              SELECT 1
                FROM mt5_optimize_results r
                JOIN mt5_sessions s ON s.id=r.session_id
               WHERE ${where.join(" AND ")}
                 AND r.strategy_id=b.strategy_id
            )`
      : `SELECT COUNT(*)::int AS total
           FROM mt5_optimize_results r
           JOIN mt5_sessions s ON s.id=r.session_id
          WHERE ${where.join(" AND ")} AND r.is_strategy_best=TRUE`;
    const { rows } = await pool.query(sql, values);
    return rows[0].total;
  }
  if (radius > 0) {
    if (filters.strategyId) {
      const cluster = await findClusterLeadersForStrategy(
        actor,
        filters,
        filters.strategyId,
        radius,
        topN,
      );
      return cluster.leaders.length;
    }
    const error = new Error(MESSAGES.CLUSTER_REQUIRES_GROUPED);
    error.status = 400;
    error.code = 'MT5_CLUSTER_REQUIRES_GROUPED';
    throw error;
  }
  if (topN > 0) {
    const { rows } = await pool.query(
      `WITH strategies AS (
         SELECT b.strategy_id
           FROM mt5_optimize_results b
           JOIN mt5_sessions bs ON bs.id=b.session_id
          WHERE b.session_id=$1 AND b.is_strategy_best=TRUE
            ${actor.isAdmin?'':`AND bs.user_id=$2`}
       )
       SELECT COUNT(*)::int AS total
         FROM strategies strategy
         CROSS JOIN LATERAL (
           SELECT 1
             FROM mt5_optimize_results r
             JOIN mt5_sessions s ON s.id=r.session_id
            WHERE ${where.join(" AND ")} AND r.strategy_id=strategy.strategy_id
            ORDER BY ${OPTIMIZE_SCORE} DESC,r.id DESC
            LIMIT ${topN}
         ) candidate`,
      values,
    );
    return rows[0].total;
  }
  if(!filters.search&&!filters.strategyId&&!filters.symbol&&!hasResultLevelFilters(filters)) {
    const state=await getOptimizeResultState(actor,filters.sessionId);
    return Number(state?.optimize_result_count)||0;
  }
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM mt5_optimize_results r
      JOIN mt5_sessions s ON s.id=r.session_id
      WHERE ${where.join(" AND ")}`,
    values,
  );
  return rows[0].total;
}

async function getOptimizeOverview(actor, sessionId) {
  const values = [sessionId];
  if (!actor.isAdmin) {
    values.push(actor.userId);
  }
  const { rows } = await pool.query(
    `SELECT s.optimize_result_count::bigint AS total,
            s.optimize_strategy_count::int AS strategies,
            s.result_version::bigint AS result_version,
            (SELECT COUNT(*)::bigint FROM mt5_optimize_results q
              WHERE q.session_id=s.id AND q.trades>=100 AND q.profit>=10000) AS qualified,
            (SELECT COUNT(*)::int FROM mt5_optimize_results w
              WHERE w.session_id=s.id AND w.picked_watchlist=TRUE) AS watchlist,
            (SELECT COUNT(*)::int FROM mt5_optimize_results b
              WHERE b.session_id=s.id AND b.picked_bt=TRUE) AS backtest_candidates,
            (
              SELECT COUNT(*)::int FROM mt5_job_queue j
               WHERE j.session_id=s.id AND j.job_type='EVERY_TICK'
                 AND j.status IN ('PENDING','CLAIMED','RUNNING')
            ) AS running_backtests,
            COALESCE((SELECT ARRAY_AGG(b.strategy_id ORDER BY b.strategy_id)
                        FROM mt5_optimize_results b
                       WHERE b.session_id=s.id AND b.is_strategy_best=TRUE),
                     ARRAY[]::varchar[]) AS strategy_ids
       FROM mt5_sessions s
      WHERE s.id=$1 ${actor.isAdmin?'':`AND s.user_id=$2`}`,
    values,
  );
  if(!rows[0]) return {total:0,strategies:0,symbols:0,symbolOptions:[],watchlist:0,backtestCandidates:0,runningBacktests:0,qualified:0,resultVersion:0};
  const symbols = new Set();
  for (const strategyId of rows[0].strategy_ids) {
    const match = String(strategyId).match(/^\d+(.+?)(?:M\d+|H\d+|D1|W1|MN1)[A-Z]*$/i);
    if (match?.[1]) symbols.add(match[1].toUpperCase());
  }
  return {
    total:Number(rows[0].total)||0,
    strategies:Number(rows[0].strategies)||0,
    symbols: symbols.size,
    symbolOptions: [...symbols].sort(),
    watchlist:Number(rows[0].watchlist)||0,
    backtestCandidates:Number(rows[0].backtest_candidates)||0,
    runningBacktests:Number(rows[0].running_backtests)||0,
    qualified:Number(rows[0].qualified)||0,
    resultVersion:Number(rows[0].result_version)||0,
  };
}

async function getOptimizeResultState(actor, sessionId) {
  const values=[sessionId];
  let owner='';
  if(!actor.isAdmin) {
    values.push(actor.userId);
    owner=` AND s.user_id=$${values.length}`;
  }
  const {rows}=await pool.query(
    `SELECT s.id AS session_id,s.result_version,s.optimize_result_count,
            s.optimize_strategy_count,s.updated_at AS last_result_at,
            (SELECT COUNT(*)::int FROM mt5_job_queue j
              WHERE j.session_id=s.id
                AND j.status IN ('PENDING','CLAIMED','RUNNING')) AS active_job_count
       FROM mt5_sessions s
      WHERE s.id=$1 ${owner}`,
    values,
  );
  return rows[0]||null;
}

async function getOptimizeResult(resultId, actor, client = pool) {
  const values = [resultId];
  const where = ["r.id=$1"];
  if (!actor.isAdmin) {
    values.push(actor.userId);
    where.push(`s.user_id=$${values.length}`);
  }
  const { rows } = await client.query(
    `SELECT r.id,r.session_id,s.user_id,r.strategy_id,r.strategy_id_r,r.summary_op,
            r.picked_watchlist,r.picked_bt,r.backtest_run_count,r.created_at,r.updated_at
       FROM mt5_optimize_results r JOIN mt5_sessions s ON s.id=r.session_id
      WHERE ${where.join(" AND ")}`,
    values,
  );
  return rows[0] || null;
}

async function setOptimizeFlag(resultId, actor, column, value) {
  if (!["picked_watchlist", "picked_bt"].includes(column)) throw new Error("Invalid result flag");
  const values = [resultId, value];
  let owner = "";
  if (!actor.isAdmin) {
    values.push(actor.userId);
    owner = ` AND EXISTS (
      SELECT 1 FROM mt5_sessions s
       WHERE s.id=mt5_optimize_results.session_id AND s.user_id=$${values.length}
    )`;
  }
  const { rows } = await pool.query(
    `WITH changed AS (
       UPDATE mt5_optimize_results SET ${column}=$2,updated_at=NOW()
        WHERE id=$1 ${owner}
        RETURNING id,session_id,strategy_id,strategy_id_r,picked_watchlist,picked_bt,
                  backtest_run_count,updated_at
     ), bumped AS (
       UPDATE mt5_sessions
          SET result_version=result_version+1,updated_at=NOW()
        WHERE id=(SELECT session_id FROM changed LIMIT 1)
        RETURNING id
     )
     SELECT changed.* FROM changed LEFT JOIN bumped ON TRUE`,
    values,
  );
  return rows[0] || null;
}

async function clearBacktestPick(sessionId, strategyIdR, client = pool) {
  if (!sessionId || !strategyIdR) return null;
  const { rows } = await client.query(
    `WITH changed AS (
       UPDATE mt5_optimize_results
          SET picked_bt=FALSE,updated_at=NOW()
        WHERE session_id=$1 AND strategy_id_r=$2 AND picked_bt=TRUE
        RETURNING id,session_id,strategy_id,strategy_id_r,picked_bt,backtest_run_count,updated_at
     ), bumped AS (
       UPDATE mt5_sessions
          SET result_version=result_version+1,updated_at=NOW()
        WHERE id=$1 AND EXISTS (SELECT 1 FROM changed)
        RETURNING id
     )
     SELECT changed.* FROM changed LEFT JOIN bumped ON TRUE`,
    [sessionId, strategyIdR],
  );
  return rows[0] || null;
}

async function setBacktestPickByTarget(sessionId, strategyIdR, value, client = pool) {
  if (!sessionId || !strategyIdR) return null;
  const { rows } = await client.query(
    `WITH changed AS (
       UPDATE mt5_optimize_results
          SET picked_bt=$3,updated_at=NOW()
        WHERE session_id=$1 AND strategy_id_r=$2
        RETURNING id,session_id,strategy_id,strategy_id_r,picked_bt,backtest_run_count,updated_at
     ), bumped AS (
       UPDATE mt5_sessions
          SET result_version=result_version+1,updated_at=NOW()
        WHERE id=$1 AND EXISTS (SELECT 1 FROM changed)
        RETURNING id
     )
     SELECT changed.* FROM changed LEFT JOIN bumped ON TRUE`,
    [sessionId, strategyIdR, Boolean(value)],
  );
  return rows[0] || null;
}

function candidateSettingsDate(alias, keys, periodPattern) {
  const explicit = `COALESCE(${keys.map((key) => `NULLIF(${alias}.summary_bt->'settings'->>'${key}', '')`).join(", ")})`;
  const period = `COALESCE(${alias}.summary_bt->'settings'->>'Period', ${alias}.summary_bt->'settings'->>'period', '')`;
  const text = `COALESCE(substring(${explicit} FROM '[0-9]{4}[.-][0-9]{2}[.-][0-9]{2}'), substring(${period} FROM '${periodPattern}'))`;
  return `to_date(replace(${text}, '.', '-'), 'YYYY-MM-DD')`;
}

function buildCandidateWhere(actor, filters) {
  const values = [filters.sessionId];
  const where = ["c.session_id=$1"];
  if (!actor.isAdmin) {
    values.push(actor.userId);
    where.push(`s.user_id=$${values.length}`);
  }
  if (filters.view === "staging") where.push("st.id IS NOT NULL");
  if (filters.strategyId) {
    values.push(filters.strategyId);
    where.push(`c.strategy_id=$${values.length}`);
  }
  if (filters.search) {
    values.push(`%${filters.search}%`);
    where.push(`(c.strategy_id ILIKE $${values.length} OR c.strategy_id_r ILIKE $${values.length})`);
  }
  if (filters.symbol) {
    values.push(`%${filters.symbol}%`);
    where.push(`c.strategy_id ILIKE $${values.length}`);
  }
  const appendRange = (column, combined, explicitMin, explicitMax, absolute = false) => {
    const range = parseRange(combined, explicitMin, explicitMax);
    const expression = absolute ? `ABS(COALESCE(c.${column},0))` : `COALESCE(c.${column},0)`;
    if (range.min !== null) {
      values.push(range.min);
      where.push(`${expression}>=$${values.length}`);
    }
    if (range.max !== null) {
      values.push(range.max);
      where.push(`${expression}<=$${values.length}`);
    }
  };
  appendRange("net_profit", filters.minProfit, filters.minProfit, filters.maxProfit);
  appendRange("recovery_factor", filters.minRecoveryFactor, filters.minRecoveryFactor, filters.maxRecoveryFactor);
  appendRange("total_trades", filters.trades, filters.minTrades, filters.maxTrades);
  appendRange("profit_factor", filters.profitFactor, filters.minProfitFactor, filters.maxProfitFactor);
  appendRange("balance_drawdown_percent", filters.balanceDD, filters.minBalanceDD, filters.maxBalanceDD);
  appendRange("pd_ratio", filters.pdRatio, filters.minPdRatio, filters.maxPdRatio);
  appendRange("sharpe_ratio", filters.sharpeRatio, filters.minSharpeRatio, filters.maxSharpeRatio);
  appendRange("largest_loss_trade", filters.largestLossTrade, filters.minLargestLossTrade, filters.maxLargestLossTrade, true);
  if (filters.startDate) {
    values.push(filters.startDate);
    where.push(`${candidateSettingsDate("c", ["To", "period_end", "to"], "-\\s*([0-9]{4}[.-][0-9]{2}[.-][0-9]{2})")} >= $${values.length}::date`);
  }
  if (filters.endDate) {
    values.push(filters.endDate);
    where.push(`${candidateSettingsDate("c", ["From", "period_start", "from"], "([0-9]{4}[.-][0-9]{2}[.-][0-9]{2})\\s*-")} <= $${values.length}::date`);
  }
  return { values, where };
}

const CANDIDATE_COLUMNS = `
  c.id, c.optimize_result_id, c.session_id, s.user_id, c.strategy_id, c.strategy_id_r,
  c.backtest_run_no, r.summary_op->'pass' AS pass,
  r.summary_op->'metrics' AS metrics, r.summary_op->'inputs' AS inputs,
  c.summary_bt->'results' AS backtest_results,
  c.summary_bt->'settings' AS backtest_settings,
  r.picked_watchlist, r.picked_bt,
  (st.id IS NOT NULL) AS picked_bt_staging,
  TRUE AS backtest_completed,
  c.backtest_completed_at, r.backtest_run_count,
  st.target_table AS staging_target_table,
  st.source_table, COALESCE(st.sync_status,'NOT_SYNCED') AS sync_status,
  st.synced_at, c.created_at, c.updated_at
`;

const CANDIDATE_SCORE = `COALESCE(NULLIF(regexp_replace(
  COALESCE(r.summary_op->'metrics'->>'Result', r.summary_op->'metrics'->>'result', '0'),
  '[^0-9.-]', '', 'g'
), '')::numeric, 0)`;

async function listBacktestCandidates(actor, filters) {
  const { values, where } = buildCandidateWhere(actor, filters);
  const grouped = (filters.groupBy || filters.group_by) === "strategy";
  values.push(filters.limit || 25);
  const limitPosition = values.length;
  values.push(filters.offset || 0);
  const offsetPosition = values.length;
  const selectSql = grouped
    ? `WITH ranked AS (
         SELECT ${CANDIDATE_COLUMNS},
                ROW_NUMBER() OVER (
                  PARTITION BY c.strategy_id
                  ORDER BY ${CANDIDATE_SCORE} DESC, c.created_at DESC, c.id DESC
                ) AS strategy_rank,
                COUNT(*) OVER (PARTITION BY c.strategy_id)::int AS total_passes
           FROM mt5_backtest_candidates c
           JOIN mt5_sessions s ON s.id=c.session_id
           JOIN mt5_optimize_results r ON r.id=c.optimize_result_id
           LEFT JOIN mt5_backtest_staging st ON st.candidate_id=c.id
          WHERE ${where.join(" AND ")}
       )
       SELECT * FROM ranked
        WHERE strategy_rank=1
        ORDER BY strategy_id ASC,
        COALESCE(NULLIF(regexp_replace(
          COALESCE(metrics->>'Result', metrics->>'result', '0'),
          '[^0-9.-]', '', 'g'
        ), '')::numeric, 0) DESC, id DESC
        LIMIT $${limitPosition} OFFSET $${offsetPosition}`
    : `SELECT ${CANDIDATE_COLUMNS}
         FROM mt5_backtest_candidates c
         JOIN mt5_sessions s ON s.id=c.session_id
         JOIN mt5_optimize_results r ON r.id=c.optimize_result_id
         LEFT JOIN mt5_backtest_staging st ON st.candidate_id=c.id
        WHERE ${where.join(" AND ")}
        ORDER BY c.strategy_id ASC, ${CANDIDATE_SCORE} DESC, c.created_at DESC, c.id DESC
        LIMIT $${limitPosition} OFFSET $${offsetPosition}`;
  const { rows } = await pool.query(selectSql, values);
  return rows;
}

async function countBacktestCandidates(actor, filters) {
  const { values, where } = buildCandidateWhere(actor, filters);
  const grouped = (filters.groupBy || filters.group_by) === "strategy";
  const { rows } = await pool.query(
    `SELECT ${grouped ? "COUNT(DISTINCT c.strategy_id)" : "COUNT(*)"}::int AS total
       FROM mt5_backtest_candidates c
       JOIN mt5_sessions s ON s.id=c.session_id
       JOIN mt5_optimize_results r ON r.id=c.optimize_result_id
       LEFT JOIN mt5_backtest_staging st ON st.candidate_id=c.id
      WHERE ${where.join(" AND ")}`,
    values,
  );
  return rows[0].total;
}

async function getCandidateOverview(actor, sessionId) {
  const values = [sessionId];
  const where = ["c.session_id=$1"];
  if (!actor.isAdmin) {
    values.push(actor.userId);
    where.push(`s.user_id=$${values.length}`);
  }
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(DISTINCT c.strategy_id)::int AS strategies,
            COUNT(st.id)::int AS staged,
            COUNT(st.id) FILTER (WHERE st.sync_status='SYNCED')::int AS synced,
            COUNT(*) FILTER (
              WHERE COALESCE(c.total_trades,0)>=100
                AND COALESCE(c.net_profit,0)>=10000
            )::int AS qualified,
            COALESCE(ARRAY_AGG(DISTINCT c.strategy_id), ARRAY[]::varchar[]) AS strategy_ids
       FROM mt5_backtest_candidates c
       JOIN mt5_sessions s ON s.id=c.session_id
       LEFT JOIN mt5_backtest_staging st ON st.candidate_id=c.id
      WHERE ${where.join(" AND ")}`,
    values,
  );
  const symbols = new Set();
  for (const strategyId of rows[0].strategy_ids) {
    const match = String(strategyId).match(/^\d+(.+?)(?:M\d+|H\d+|D1|W1|MN1)[A-Z]*$/i);
    if (match?.[1]) symbols.add(match[1].toUpperCase());
  }
  return {
    total: rows[0].total,
    strategies: rows[0].strategies,
    symbols: symbols.size,
    qualified: rows[0].qualified,
    staged: rows[0].staged,
    synced: rows[0].synced,
  };
}

async function listDateRangeCandidateSources(actor, filters) {
  const { values, where } = buildCandidateWhere(actor, {
    ...filters,
    minProfit: null, maxProfit: null,
    minRecoveryFactor: null, maxRecoveryFactor: null,
    trades: null, minTrades: null, maxTrades: null,
    profitFactor: null, minProfitFactor: null, maxProfitFactor: null,
    balanceDD: null, minBalanceDD: null, maxBalanceDD: null,
    pdRatio: null, minPdRatio: null, maxPdRatio: null,
    sharpeRatio: null, minSharpeRatio: null, maxSharpeRatio: null,
    largestLossTrade: null, minLargestLossTrade: null, maxLargestLossTrade: null,
  });
  const { rows } = await pool.query(
    `SELECT ${CANDIDATE_COLUMNS}, c.deals
       FROM mt5_backtest_candidates c
       JOIN mt5_sessions s ON s.id=c.session_id
       JOIN mt5_optimize_results r ON r.id=c.optimize_result_id
       LEFT JOIN mt5_backtest_staging st ON st.candidate_id=c.id
      WHERE ${where.join(" AND ")}
      ORDER BY c.strategy_id ASC,c.created_at DESC,c.id DESC`,
    values,
  );
  return rows;
}

async function getCandidatesCommonDateRange(actor, filters) {
  const { values, where } = buildCandidateWhere(actor, {
    ...filters,
    startDate: null,
    endDate: null,
  });
  const { rows } = await pool.query(
    `WITH ranges AS (
       SELECT c.id,
              MIN(to_timestamp(replace(COALESCE(d->>'time',d->>'Time'),'.','-'),'YYYY-MM-DD HH24:MI:SS'))
                FILTER (WHERE LOWER(COALESCE(d->>'direction',d->>'Direction',''))='in') AS first_trade,
              MAX(to_timestamp(replace(COALESCE(d->>'time',d->>'Time'),'.','-'),'YYYY-MM-DD HH24:MI:SS'))
                FILTER (WHERE LOWER(COALESCE(d->>'direction',d->>'Direction',''))='out') AS last_trade
         FROM mt5_backtest_candidates c
         JOIN mt5_sessions s ON s.id=c.session_id
         JOIN mt5_optimize_results r ON r.id=c.optimize_result_id
         LEFT JOIN mt5_backtest_staging st ON st.candidate_id=c.id
         CROSS JOIN LATERAL jsonb_array_elements(c.deals) d
        WHERE ${where.join(" AND ")}
          AND LOWER(COALESCE(d->>'type',d->>'Type','')) NOT IN ('balance','credit','deposit','withdrawal')
          AND COALESCE(d->>'time',d->>'Time','') ~ '^[0-9]{4}[.-][0-9]{2}[.-][0-9]{2}'
        GROUP BY c.id
     )
     SELECT TO_CHAR(MAX(first_trade),'YYYY-MM-DD') AS common_from,
            TO_CHAR(MIN(last_trade),'YYYY-MM-DD') AS common_to,
            COUNT(*)::int AS candidate_count
       FROM ranges`,
    values,
  );
  const row = rows[0];
  const valid = row.common_from && row.common_to && row.common_from <= row.common_to;
  return {
    from: valid ? row.common_from : null,
    to: valid ? row.common_to : null,
    candidateCount: row.candidate_count,
  };
}

async function getBacktestCandidate(candidateId, actor, { includeDeals = false, client = pool } = {}) {
  const values = [candidateId];
  const where = ["c.id=$1"];
  if (!actor.isAdmin) {
    values.push(actor.userId);
    where.push(`s.user_id=$${values.length}`);
  }
  const { rows } = await client.query(
    `SELECT c.id,c.session_id,s.user_id,c.optimize_result_id,c.strategy_id,c.strategy_id_r,
            c.backtest_run_no,c.source_run_id,c.summary_bt,c.net_profit,c.total_trades,
            c.balance_drawdown_percent,c.balance_drawdown_value,c.profit_factor,
            c.recovery_factor,c.sharpe_ratio,c.pd_ratio,c.largest_loss_trade,
            c.expected_payoff,c.backtest_completed_at,c.created_at,c.updated_at,
            r.summary_op, r.picked_watchlist, r.picked_bt, r.backtest_run_count,
            (st.id IS NOT NULL) AS picked_bt_staging,
            st.target_table AS staging_target_table, st.source_table,
            COALESCE(st.sync_status,'NOT_SYNCED') AS sync_status, st.synced_at,
            ${includeDeals ? "c.deals" : "NULL::jsonb AS deals"}
       FROM mt5_backtest_candidates c
       JOIN mt5_sessions s ON s.id=c.session_id
       JOIN mt5_optimize_results r ON r.id=c.optimize_result_id
       LEFT JOIN mt5_backtest_staging st ON st.candidate_id=c.id
      WHERE ${where.join(" AND ")}`,
    values,
  );
  return rows[0] || null;
}

async function getCandidateSparklineSource(candidateId, actor) {
  const candidate = await getBacktestCandidate(candidateId, actor, { includeDeals: true });
  if (!candidate) return null;
  return { id: candidate.id, settings: candidate.summary_bt.settings, deals: candidate.deals };
}

async function deleteBacktestCandidate(candidateId, actor) {
  const values = [candidateId];
  const ownerWhere = [];
  if (!actor.isAdmin) {
    values.push(actor.userId);
    ownerWhere.push(`s.user_id=$${values.length}`);
  }
  const { rows } = await pool.query(
    `DELETE FROM mt5_backtest_candidates c
      USING mt5_sessions s
      WHERE c.id=$1
        AND s.id=c.session_id
        ${ownerWhere.length ? `AND ${ownerWhere.join(" AND ")}` : ""}
      RETURNING c.id,c.session_id,c.strategy_id,c.strategy_id_r,c.backtest_run_no`,
    values,
  );
  return rows[0] || null;
}

async function selectStagingCandidate(candidateId, actor, targetTable = null, value = true, overwriteExisting = true) {
  const client = await safeConnect(pool, "MT5_STAGING");
  try {
    await client.query("BEGIN");
    const candidate = await getBacktestCandidate(candidateId, actor, { client });
    if (!candidate) {
      await client.query("ROLLBACK");
      return null;
    }
    if (!value) {
      await client.query(
        `DELETE FROM mt5_backtest_staging
          WHERE candidate_id=$1 AND session_id=$2 AND strategy_id=$3`,
        [candidate.id, candidate.session_id, candidate.strategy_id],
      );
      await client.query("COMMIT");
      return { ...candidate, picked_bt_staging: false };
    }
    if (!overwriteExisting) {
      const { rows: existingRows } = await client.query(
        `SELECT candidate_id FROM mt5_backtest_staging
          WHERE session_id=$1 AND strategy_id=$2`,
        [candidate.session_id, candidate.strategy_id],
      );
      const existingCandidateId = existingRows[0]?.candidate_id;
      if (existingCandidateId && Number(existingCandidateId) !== Number(candidate.id)) {
        await client.query("COMMIT");
        return {
          ...candidate,
          picked_bt_staging: false,
          conflict: true,
          existing_candidate_id: existingCandidateId,
        };
      }
      if (existingCandidateId && Number(existingCandidateId) === Number(candidate.id)) {
        await client.query("COMMIT");
        return { ...candidate, picked_bt_staging: true, conflict: false };
      }
    }
    const { rows } = await client.query(
      `INSERT INTO mt5_backtest_staging
         (session_id,strategy_id,candidate_id,target_table)
       VALUES($1,$2,$3,$4)
       ON CONFLICT (session_id,strategy_id) DO UPDATE SET
         candidate_id=EXCLUDED.candidate_id,
         target_table=EXCLUDED.target_table,
         source_table=NULL,
         sync_status='NOT_SYNCED',
         synced_at=NULL,
         selected_at=NOW()
       RETURNING *`,
      [candidate.session_id, candidate.strategy_id, candidate.id, targetTable],
    );
    await client.query("COMMIT");
    return { ...candidate, ...rows[0], picked_bt_staging: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function listAutoReviewCandidates(actor, filters, includeDeals = false) {
  const { values, where } = buildCandidateWhere(actor, { ...filters, view: "all" });
  const { rows } = await pool.query(
    `SELECT ${CANDIDATE_COLUMNS}${includeDeals ? ", c.deals" : ""}
       FROM mt5_backtest_candidates c
       JOIN mt5_sessions s ON s.id=c.session_id
       JOIN mt5_optimize_results r ON r.id=c.optimize_result_id
       LEFT JOIN mt5_backtest_staging st ON st.candidate_id=c.id
      WHERE ${where.join(" AND ")}
      ORDER BY c.strategy_id ASC,c.created_at DESC,c.id DESC`,
    values,
  );
  return rows;
}

async function getStagingSelections(actor, sessionId) {
  const values = [sessionId];
  const where = ["st.session_id=$1"];
  if (!actor.isAdmin) {
    values.push(actor.userId);
    where.push(`s.user_id=$${values.length}`);
  }
  const { rows } = await pool.query(
    `SELECT st.strategy_id,st.candidate_id
       FROM mt5_backtest_staging st
       JOIN mt5_sessions s ON s.id=st.session_id
      WHERE ${where.join(" AND ")}`,
    values,
  );
  return rows;
}

async function applyAutoReviewStaging(actor, sessionId, candidateIds) {
  if (!candidateIds.length) return [];
  const client = await safeConnect(pool, "MT5_AUTO_REVIEW_STAGING");
  try {
    await client.query("BEGIN");
    const values = [candidateIds, sessionId];
    const ownerWhere = [];
    if (!actor.isAdmin) {
      values.push(actor.userId);
      ownerWhere.push(`s.user_id=$${values.length}`);
    }
    const { rows: candidates } = await client.query(
      `SELECT c.id,c.session_id,c.strategy_id
         FROM mt5_backtest_candidates c
         JOIN mt5_sessions s ON s.id=c.session_id
        WHERE c.id=ANY($1::bigint[])
          AND c.session_id=$2
          ${ownerWhere.length ? `AND ${ownerWhere.join(" AND ")}` : ""}
        FOR UPDATE OF c`,
      values,
    );
    if (candidates.length !== candidateIds.length) {
      throw new Error("Auto review candidates changed before staging confirmation");
    }
    const { rows } = await client.query(
      `INSERT INTO mt5_backtest_staging(session_id,strategy_id,candidate_id,target_table)
       SELECT c.session_id,c.strategy_id,c.id,NULL
         FROM mt5_backtest_candidates c
        WHERE c.id=ANY($1::bigint[]) AND c.session_id=$2
       ON CONFLICT (session_id,strategy_id) DO UPDATE SET
         candidate_id=EXCLUDED.candidate_id,
         target_table=NULL,
         source_table=NULL,
         sync_status='NOT_SYNCED',
         synced_at=NULL,
         selected_at=NOW()
       WHERE mt5_backtest_staging.candidate_id IS DISTINCT FROM EXCLUDED.candidate_id
       RETURNING session_id,strategy_id,candidate_id,selected_at`,
      [candidateIds, sessionId],
    );
    await client.query("COMMIT");
    return rows;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function saveBacktestCandidate(jobId, runId, workerId, summaryBt, deals, metrics) {
  const client = await safeConnect(pool, "MT5_BT_RESULT");
  try {
    await client.query("BEGIN");
    const { rows: jobRows } = await client.query(
      `SELECT * FROM mt5_job_queue
        WHERE job_id=$1 AND run_id=$2 AND claimed_by_worker_id=$3
          AND status IN ('CLAIMED','RUNNING') FOR UPDATE`,
      [jobId, runId, workerId],
    );
    const job = jobRows[0];
    if (!job) {
      await client.query("ROLLBACK");
      return null;
    }
    const existing = await client.query(
      `SELECT c.* FROM mt5_backtest_candidates c WHERE c.source_run_id=$1::uuid`,
      [runId],
    );
    if (existing.rows[0]) {
      await client.query("COMMIT");
      return { ...existing.rows[0], idempotent: true };
    }
    const { rows: resultRows } = await client.query(
      `SELECT * FROM mt5_optimize_results
        WHERE session_id=$1 AND strategy_id_r=$2 FOR UPDATE`,
      [job.session_id, job.target_strategy_id_r],
    );
    const result = resultRows[0];
    if (!result) {
      await client.query("ROLLBACK");
      return null;
    }
    const runNo = result.backtest_run_count + 1;
    const { rows } = await client.query(
      `INSERT INTO mt5_backtest_candidates (
         session_id,optimize_result_id,strategy_id,strategy_id_r,
         backtest_run_no,source_run_id,summary_bt,deals,
         net_profit,total_trades,balance_drawdown_percent,balance_drawdown_value,
         profit_factor,recovery_factor,sharpe_ratio,pd_ratio,largest_loss_trade,
         expected_payoff,backtest_completed_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6::uuid,$7,$8,
         $9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW()
       ) RETURNING *`,
      [
        result.session_id, result.id, result.strategy_id, result.strategy_id_r,
        runNo, runId, JSON.stringify(summaryBt), JSON.stringify(deals),
        metrics.netProfit, metrics.totalTrades, metrics.balanceDrawdownPercent,
        metrics.balanceDrawdownValue, metrics.profitFactor, metrics.recoveryFactor,
        metrics.sharpeRatio, metrics.pdRatio, metrics.largestLossTrade,
        metrics.expectedPayoff,
      ],
    );
    await client.query(
      `UPDATE mt5_optimize_results
          SET backtest_run_count=$2,picked_bt=FALSE
        WHERE id=$1`,
      [result.id, runNo],
    );
    await client.query(
      `UPDATE mt5_sessions
          SET result_version=result_version+1,updated_at=NOW()
        WHERE id=$1`,
      [result.session_id],
    );
    await client.query(
      `UPDATE mt5_job_queue
          SET job_payload=COALESCE(job_payload,'{}'::jsonb)||$2::jsonb
        WHERE job_id=$1`,
      [jobId, JSON.stringify({ backtest_ingested_run_id: runId, backtest_candidate_id: rows[0].id })],
    );
    await client.query("COMMIT");
    return rows[0];
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function markStagingSynced(client, candidateId, targetTable) {
  const { rows } = await client.query(
    `UPDATE mt5_backtest_staging
        SET target_table=$2,source_table=$2,sync_status='SYNCED',synced_at=NOW()
      WHERE candidate_id=$1
      RETURNING *`,
    [candidateId, targetTable],
  );
  return rows[0] || null;
}

module.exports = {
  pool,
  listOptimizeResults,
  countOptimizeResults,
  getOptimizeOverview,
  getOptimizeResultState,
  getOptimizeResult,
  setOptimizeFlag,
  clearBacktestPick,
  setBacktestPickByTarget,
  listBacktestCandidates,
  countBacktestCandidates,
  getCandidateOverview,
  listDateRangeCandidateSources,
  getCandidatesCommonDateRange,
  getBacktestCandidate,
  deleteBacktestCandidate,
  getCandidateSparklineSource,
  selectStagingCandidate,
  listAutoReviewCandidates,
  getStagingSelections,
  applyAutoReviewStaging,
  saveBacktestCandidate,
  markStagingSynced,
};
