const pg = require('pg');
const { getAppPool, safeConnect } = require('../config/db');
const { resolveTableSubquery } = require('./queryBuilderHelper');

const dbPool = getAppPool();
const BEHAVIOR_QUERY_TIMEOUT_MS = 300000;

const createAbortError = () => {
  const error = new Error('Behavior analysis request was aborted');
  error.name = 'AbortError';
  error.code = 'ABORT_ERR';
  return error;
};

const runBehaviorQuery = async (text, values = [], { timeoutMs = BEHAVIOR_QUERY_TIMEOUT_MS, signal } = {}) => {
  if (signal?.aborted) throw createAbortError();

  const client = await safeConnect(dbPool, 'BEHAVIOR');
  const query = new pg.Query({ text, values });
  let cancelRequested = false;
  let abortHandler;

  try {
    await client.query(`SET statement_timeout = ${Math.max(1, Math.floor(timeoutMs))}`);
    abortHandler = () => {
      if (cancelRequested || client.activeQuery !== query) return;
      cancelRequested = true;
      console.warn('[BEHAVIOR] Request aborted, cancelling PostgreSQL query');
      client.cancel(client, query);
    };
    signal?.addEventListener('abort', abortHandler, { once: true });

    return await new Promise((resolve, reject) => {
      query.callback = (error, queryResult) => {
        if (error) reject(error);
        else resolve(queryResult);
      };
      client.query(query);
    });
  } finally {
    if (abortHandler) signal?.removeEventListener('abort', abortHandler);
    await client.query('SET statement_timeout = 0').catch(() => { });
    client.release();
  }
};

const pool = {
  query: (text, values, options) => runBehaviorQuery(text, values, options)
};

const getBehaviorAnalysis = async (sourceInput = null, startDate = null, endDate = null, { skipCharts = false, signal } = {}) => {
  const { fromClause, validTables } = await resolveTableSubquery(sourceInput);

  const metadataParams = [validTables];
  const metadataFilter = `AND m.backtest_table = ANY($1::text[])`;
  const smMetadataFilter = `AND sm.backtest_table = ANY($1::text[])`;

  let dealOnlyFilter = '';
  let metadataDealFilter = '';
  let mActiveInRangeFilter = '';
  let smActiveInRangeFilter = '';
  let dealParams = [];

  if (startDate && endDate) {
    metadataParams.push(startDate, endDate);
    dealParams = [startDate, endDate];

    dealOnlyFilter = ` AND time::DATE BETWEEN $1::DATE AND $2::DATE`;
    metadataDealFilter = ` AND time::DATE BETWEEN $2::DATE AND $3::DATE`;

    mActiveInRangeFilter = `
      AND EXISTS (
        SELECT 1 FROM ${fromClause} d
        WHERE d.strategy_id = m.strategy_id
          AND d.source_table = m.backtest_table
          AND d.type != 'balance'
          AND d.time::DATE BETWEEN $2::DATE AND $3::DATE
      )`;
    smActiveInRangeFilter = `
      AND EXISTS (
        SELECT 1 FROM ${fromClause} d
        WHERE d.strategy_id = sm.strategy_id
          AND d.source_table = sm.backtest_table
          AND d.type != 'balance'
          AND d.time::DATE BETWEEN $2::DATE AND $3::DATE
      )`;
  }

  const profitExpr = startDate && endDate
    ? `(
        SELECT COALESCE(SUM(d.profit::numeric), 0)
        FROM ${fromClause} d
        WHERE d.strategy_id = m.strategy_id
          AND d.source_table = m.backtest_table
          AND d.type IN ('buy','sell') AND LOWER(d.direction) = 'out'
          AND d.time::DATE BETWEEN $2::DATE AND $3::DATE
      )`
    : `(m.results->>'totalNetProfit')::numeric`;

  const tradesExpr = startDate && endDate
    ? `(
        SELECT COALESCE(COUNT(*)::numeric, 0)
        FROM ${fromClause} d
        WHERE d.strategy_id = m.strategy_id
          AND d.source_table = m.backtest_table
          AND d.type IN ('buy','sell')
          AND d.time::DATE BETWEEN $2::DATE AND $3::DATE
      )`
    : `(m.results->>'totalTrades')::numeric`;

  // 1. Directional Bias OB/OS pairs
  const directionalBiasQuery = `
    WITH ob_os AS (
        SELECT 
          strategy_id,
          REGEXP_REPLACE(strategy_id,'(OB|OS)$','') AS base_key,
          SUBSTRING(strategy_id FROM '(OB|OS)$') AS ot,
          backtest_table,
          symbol,
          timeframe,
          ${profitExpr} AS profit
        FROM strategy_metadata m
        WHERE strategy_id ~ '(OB|OS)$'
          ${metadataFilter}
          ${mActiveInRangeFilter}
    ), pairs AS (
        SELECT 
          ob.strategy_id AS id,
          ob.symbol,
          ob.timeframe AS tf,
          SUBSTRING(ob.strategy_id, 1, 3) AS bot,
          ob.profit AS buy_profit,
          os.profit AS sell_profit,
          ob.backtest_table
        FROM ob_os ob
        JOIN ob_os os ON ob.base_key = os.base_key
                     AND ob.backtest_table = os.backtest_table
                     AND ob.ot = 'OB' AND os.ot = 'OS'
    ), positive_pairs AS (
        SELECT
          pairs.*,
          GREATEST(COALESCE(buy_profit, 0), 0) AS buy_positive_profit,
          GREATEST(COALESCE(sell_profit, 0), 0) AS sell_positive_profit
        FROM pairs
    )
    SELECT 
      id,
      symbol,
      tf,
      bot,
      backtest_table AS "backtestTable",
      COALESCE(buy_profit, 0)::float AS "buyProfit",
      COALESCE(sell_profit, 0)::float AS "sellProfit",
      CASE 
        WHEN (buy_positive_profit + sell_positive_profit) = 0 THEN 0
        ELSE ROUND(buy_positive_profit / (buy_positive_profit + sell_positive_profit) * 100)
      END::int AS "buyPct",
      CASE 
        WHEN (buy_positive_profit + sell_positive_profit) = 0 THEN 0
        ELSE 100 - ROUND(buy_positive_profit / (buy_positive_profit + sell_positive_profit) * 100)
      END::int AS "sellPct",
      ROUND(
        COALESCE(
          LEAST(buy_positive_profit, sell_positive_profit) /
          NULLIF(GREATEST(buy_positive_profit, sell_positive_profit), 0) * 100,
          0
        ), 
        1
      )::float AS "weakPct",
      CASE 
        WHEN (buy_profit <= 0 AND sell_profit > 0) OR (sell_profit <= 0 AND buy_profit > 0) THEN 'One-Way Edge'
        WHEN COALESCE(
          LEAST(buy_positive_profit, sell_positive_profit) /
          NULLIF(GREATEST(buy_positive_profit, sell_positive_profit), 0) * 100,
          0
        ) < 20 THEN 'DirectionalBias'
        ELSE 'Balanced'
      END AS status
    FROM positive_pairs
    ORDER BY "weakPct" ASC;
  `;

  // 2. Buy vs Sell Breakdown
  const buySellQuery = `
    SELECT 
      symbol,
      COALESCE(COUNT(*) FILTER (WHERE type = 'sell' AND LOWER(direction) = 'out'), 0)::int AS "buyCount",
      ROUND(COALESCE(COUNT(*) FILTER (WHERE type = 'sell' AND LOWER(direction) = 'out' AND profit::numeric > 0)::numeric /
            NULLIF(COUNT(*) FILTER (WHERE type = 'sell' AND LOWER(direction) = 'out'), 0) * 100, 0), 1)::float AS "buyWR",
      ROUND(COALESCE(AVG(profit::numeric) FILTER (WHERE type = 'sell' AND LOWER(direction) = 'out'), 0), 2)::float AS "buyAvgProf",
      COALESCE(COUNT(*) FILTER (WHERE type = 'buy' AND LOWER(direction) = 'out'), 0)::int AS "sellCount",
      ROUND(COALESCE(COUNT(*) FILTER (WHERE type = 'buy' AND LOWER(direction) = 'out' AND profit::numeric > 0)::numeric /
            NULLIF(COUNT(*) FILTER (WHERE type = 'buy' AND LOWER(direction) = 'out'), 0) * 100, 0), 1)::float AS "sellWR",
      ROUND(COALESCE(AVG(profit::numeric) FILTER (WHERE type = 'buy' AND LOWER(direction) = 'out'), 0), 2)::float AS "sellAvgProf"
    FROM ${fromClause}
    WHERE type IN ('buy','sell')
      ${dealOnlyFilter}
    GROUP BY symbol
    ORDER BY symbol;
  `;

  // 3. Timeframe Mismatch H4 > H1
  const timeframeMismatchQuery = `
    WITH deal_counts AS (
        SELECT 
          strategy_id,
          source_table,
          COUNT(*) FILTER (WHERE type IN ('buy','sell')) AS total_deals,
          COUNT(*) FILTER (WHERE comment LIKE '%_H1_%') AS h1_count,
          COUNT(*) FILTER (WHERE comment LIKE '%_H4_%') AS h4_count
        FROM ${fromClause}
        WHERE type IN ('buy','sell')
          ${metadataDealFilter}
        GROUP BY strategy_id, source_table
    ),
    strategy_tfs AS (
        SELECT 
          m.strategy_id,
          m.symbol,
          m.backtest_table,
          SUBSTRING(m.strategy_id FROM '(H1|H4)') AS tf_reg,
          COALESCE(d.total_deals, 0) AS total_deals,
          COALESCE(d.h1_count, 0) AS h1_count,
          COALESCE(d.h4_count, 0) AS h4_count
        FROM strategy_metadata m
        JOIN deal_counts d ON m.strategy_id = d.strategy_id AND m.backtest_table = d.source_table
        WHERE m.strategy_id ~ '(H1|H4)(OB|OS)$'
          ${metadataFilter}
          ${mActiveInRangeFilter}
    ),
    calculated AS (
        SELECT 
          strategy_id AS id,
          symbol,
          SUBSTRING(strategy_id, 1, 3) AS bot,
          tf_reg AS timeframe,
          backtest_table AS "backtestTable",
          total_deals AS "totalDeals",
          (CASE
            WHEN tf_reg = 'H1' THEN total_deals - h4_count
            ELSE h1_count
          END)::int AS "h1Count",
          (CASE
            WHEN tf_reg = 'H4' THEN total_deals - h1_count
            ELSE h4_count
          END)::int AS "h4Count",
          CASE 
            WHEN tf_reg = 'H1' THEN ROUND(h4_count::numeric / NULLIF(total_deals - h4_count, 0), 2)::float
            WHEN tf_reg = 'H4' THEN ROUND(h1_count::numeric / NULLIF(total_deals - h1_count, 0), 2)::float
            ELSE 0.0
          END AS ratio,
          CASE 
            WHEN tf_reg = 'H1' THEN h4_count
            WHEN tf_reg = 'H4' THEN h1_count
            ELSE 0
          END AS mismatch_count
        FROM strategy_tfs
    )
    SELECT 
      id,
      symbol,
      bot,
      timeframe,
      "backtestTable",
      "h1Count",
      "h4Count",
      ratio,
      CASE 
        WHEN mismatch_count = 0 THEN 'Normal'
        WHEN ratio >= 3.0 THEN 'Severe'
        WHEN ratio >= 1.5 THEN 'TimeframeMismatch'
        ELSE 'Moderate'
      END AS status
    FROM calculated
    ORDER BY ratio DESC, id ASC;
  `;

  // 4. Temporal Heatmaps
  const hourHeatmapQuery = `
    SELECT 
      LPAD(EXTRACT(HOUR FROM time)::text, 2, '0') || 'h' AS hour,
      COALESCE(SUM(profit::numeric) FILTER (WHERE LOWER(direction) = 'out'), 0)::float AS profit,
      ROUND(COALESCE(COUNT(*) FILTER (WHERE LOWER(direction) = 'out' AND profit::numeric > 0)::numeric /
            NULLIF(COUNT(*) FILTER (WHERE LOWER(direction) = 'out'), 0) * 100, 0), 1)::float AS wr
    FROM ${fromClause}
    WHERE type IN ('buy','sell')
      ${dealOnlyFilter}
    GROUP BY EXTRACT(HOUR FROM time) 
    ORDER BY EXTRACT(HOUR FROM time);
  `;

  const dayHeatmapQuery = `
    SELECT 
      CASE EXTRACT(DOW FROM time)::int
        WHEN 1 THEN 'T2'
        WHEN 2 THEN 'T3'
        WHEN 3 THEN 'T4'
        WHEN 4 THEN 'T5'
        WHEN 5 THEN 'T6'
        ELSE 'Other'
      END AS day,
      CASE EXTRACT(DOW FROM time)::int
        WHEN 1 THEN 'Thứ 2'
        WHEN 2 THEN 'Thứ 3'
        WHEN 3 THEN 'Thứ 4'
        WHEN 4 THEN 'Thứ 5'
        WHEN 5 THEN 'Thứ 6'
        ELSE 'Khác'
      END AS label,
      COALESCE(SUM(profit::numeric) FILTER (WHERE LOWER(direction) = 'out'), 0)::float AS profit,
      ROUND(COALESCE(COUNT(*) FILTER (WHERE LOWER(direction) = 'out' AND profit::numeric > 0)::numeric /
            NULLIF(COUNT(*) FILTER (WHERE LOWER(direction) = 'out'), 0) * 100, 0), 1)::float AS wr
    FROM ${fromClause}
    WHERE type IN ('buy','sell') AND EXTRACT(DOW FROM time)::int BETWEEN 1 AND 5
      ${dealOnlyFilter}
    GROUP BY EXTRACT(DOW FROM time) 
    ORDER BY EXTRACT(DOW FROM time);
  `;

  const monthHeatmapQuery = `
    SELECT 
      'T' || EXTRACT(MONTH FROM time)::int AS month,
      COALESCE(SUM(profit::numeric) FILTER (WHERE LOWER(direction) = 'out'), 0)::float AS profit,
      ROUND(COALESCE(COUNT(*) FILTER (WHERE LOWER(direction) = 'out' AND profit::numeric > 0)::numeric /
            NULLIF(COUNT(*) FILTER (WHERE LOWER(direction) = 'out'), 0) * 100, 0), 1)::float AS wr
    FROM ${fromClause}
    WHERE type IN ('buy','sell')
      ${dealOnlyFilter}
    GROUP BY EXTRACT(MONTH FROM time) 
    ORDER BY EXTRACT(MONTH FROM time);
  `;

  // 5. Annual Stability
  const annualStabilityQuery = `
    WITH yearly AS (
        SELECT 
          strategy_id AS id,
          COALESCE(SUM(profit::numeric) FILTER (WHERE EXTRACT(YEAR FROM time) = 2019 AND LOWER(direction) = 'out'), 0)::float AS y19,
          COALESCE(SUM(profit::numeric) FILTER (WHERE EXTRACT(YEAR FROM time) = 2020 AND LOWER(direction) = 'out'), 0)::float AS y20,
          COALESCE(SUM(profit::numeric) FILTER (WHERE EXTRACT(YEAR FROM time) = 2021 AND LOWER(direction) = 'out'), 0)::float AS y21,
          COALESCE(SUM(profit::numeric) FILTER (WHERE EXTRACT(YEAR FROM time) = 2022 AND LOWER(direction) = 'out'), 0)::float AS y22,
          COALESCE(SUM(profit::numeric) FILTER (WHERE EXTRACT(YEAR FROM time) = 2023 AND LOWER(direction) = 'out'), 0)::float AS y23,
          COALESCE(SUM(profit::numeric) FILTER (WHERE EXTRACT(YEAR FROM time) = 2024 AND LOWER(direction) = 'out'), 0)::float AS y24,
          COALESCE(SUM(profit::numeric) FILTER (WHERE EXTRACT(YEAR FROM time) = 2025 AND LOWER(direction) = 'out'), 0)::float AS y25,
          COALESCE(SUM(profit::numeric) FILTER (WHERE EXTRACT(YEAR FROM time) = 2026 AND LOWER(direction) = 'out'), 0)::float AS y26
        FROM ${fromClause}
        WHERE type IN ('buy','sell')
          ${dealOnlyFilter}
        GROUP BY strategy_id
    )
    SELECT 
      id,
      y19, y20, y21, y22, y23, y24, y25, y26,
      ((CASE WHEN y19 > 0 THEN 1 ELSE 0 END) +
       (CASE WHEN y20 > 0 THEN 1 ELSE 0 END) +
       (CASE WHEN y21 > 0 THEN 1 ELSE 0 END) +
       (CASE WHEN y22 > 0 THEN 1 ELSE 0 END) +
       (CASE WHEN y23 > 0 THEN 1 ELSE 0 END) +
       (CASE WHEN y24 > 0 THEN 1 ELSE 0 END) +
       (CASE WHEN y25 > 0 THEN 1 ELSE 0 END) +
       (CASE WHEN y26 > 0 THEN 1 ELSE 0 END)) >= 5 AS stable
    FROM yearly
    ORDER BY id;
  `;

  // 6. Quarterly Seasonality
  const quarterlySeasonalityQuery = `
    SELECT 
      EXTRACT(YEAR FROM time)::text AS year,
      'Q' || EXTRACT(QUARTER FROM time)::int AS q,
      CASE EXTRACT(QUARTER FROM time)::int
        WHEN 1 THEN 'Tháng 1–3'
        WHEN 2 THEN 'Tháng 4–6'
        WHEN 3 THEN 'Tháng 7–9'
        WHEN 4 THEN 'Tháng 10–12'
      END AS label,
      COALESCE(SUM(profit::numeric) FILTER (WHERE LOWER(direction) = 'out' AND profit::numeric > 0), 0)::float AS "grossProfit",
      COALESCE(SUM(ABS(profit::numeric)) FILTER (WHERE LOWER(direction) = 'out' AND profit::numeric < 0), 0)::float AS "grossLoss",
      COALESCE(SUM(profit::numeric) FILTER (WHERE LOWER(direction) = 'out'), 0)::float AS profit,
      ROUND(COALESCE(COUNT(*) FILTER (WHERE LOWER(direction) = 'out' AND profit::numeric > 0)::numeric /
            NULLIF(COUNT(*) FILTER (WHERE LOWER(direction) = 'out'), 0) * 100, 0), 1)::float AS wr
    FROM ${fromClause}
    WHERE type IN ('buy','sell')
      ${dealOnlyFilter}
    GROUP BY EXTRACT(YEAR FROM time), EXTRACT(QUARTER FROM time)
    
    UNION ALL
    
    SELECT 
      'All' AS year,
      'Q' || EXTRACT(QUARTER FROM time)::int AS q,
      CASE EXTRACT(QUARTER FROM time)::int
        WHEN 1 THEN 'Tháng 1–3'
        WHEN 2 THEN 'Tháng 4–6'
        WHEN 3 THEN 'Tháng 7–9'
        WHEN 4 THEN 'Tháng 10–12'
      END AS label,
      COALESCE(SUM(profit::numeric) FILTER (WHERE LOWER(direction) = 'out' AND profit::numeric > 0), 0)::float AS "grossProfit",
      COALESCE(SUM(ABS(profit::numeric)) FILTER (WHERE LOWER(direction) = 'out' AND profit::numeric < 0), 0)::float AS "grossLoss",
      COALESCE(SUM(profit::numeric) FILTER (WHERE LOWER(direction) = 'out'), 0)::float AS profit,
      ROUND(COALESCE(COUNT(*) FILTER (WHERE LOWER(direction) = 'out' AND profit::numeric > 0)::numeric /
            NULLIF(COUNT(*) FILTER (WHERE LOWER(direction) = 'out'), 0) * 100, 0), 1)::float AS wr
    FROM ${fromClause}
    WHERE type IN ('buy','sell')
      ${dealOnlyFilter}
    GROUP BY EXTRACT(QUARTER FROM time)
    
    ORDER BY year DESC, q ASC;
  `;

  // 7. Volatility Regime
  const volatilityRegimeQuery = `
    WITH stats_by_year AS (
      SELECT 
        EXTRACT(YEAR FROM time)::int AS year,
        SUM(profit::numeric) FILTER (WHERE LOWER(direction) = 'out') AS total_profit,
        COUNT(*) FILTER (WHERE LOWER(direction) = 'out') AS total_trades,
        COUNT(*) FILTER (WHERE LOWER(direction) = 'out' AND profit::numeric > 0) AS win_trades,
        COUNT(DISTINCT strategy_id) AS strat_count
      FROM ${fromClause}
      WHERE type IN ('buy','sell')
        ${metadataDealFilter}
      GROUP BY EXTRACT(YEAR FROM time)
    ),
    regimes AS (
      SELECT 
        'High-Vol' AS regime,
        '2020, 2022' AS years,
        COALESCE(SUM(total_profit) FILTER (WHERE year IN (2020, 2022)), 0) AS total_profit,
        COALESCE(SUM(total_trades) FILTER (WHERE year IN (2020, 2022)), 0) AS total_trades,
        COALESCE(SUM(win_trades) FILTER (WHERE year IN (2020, 2022)), 0) AS win_trades,
        COALESCE(SUM(strat_count) FILTER (WHERE year IN (2020, 2022)), 0) AS strat_count
      FROM stats_by_year
      UNION ALL
      SELECT 
        'Low-Vol' AS regime,
        '2021, 2023' AS years,
        COALESCE(SUM(total_profit) FILTER (WHERE year IN (2021, 2023)), 0) AS total_profit,
        COALESCE(SUM(total_trades) FILTER (WHERE year IN (2021, 2023)), 0) AS total_trades,
        COALESCE(SUM(win_trades) FILTER (WHERE year IN (2021, 2023)), 0) AS win_trades,
        COALESCE(SUM(strat_count) FILTER (WHERE year IN (2021, 2023)), 0) AS strat_count
      FROM stats_by_year
    ),
    meta_drawdown AS (
      SELECT 
        COALESCE(AVG(CAST(SUBSTRING(results->>'balanceDrawdownMaximal' FROM '\\(([0-9.]+)%\\)') AS numeric)), 12.5)::float AS avg_dd
      FROM strategy_metadata m
      WHERE results->>'balanceDrawdownMaximal' IS NOT NULL
        ${metadataFilter}
    )
    SELECT 
      r.regime,
      r.years,
      ROUND(r.total_profit::numeric / NULLIF(r.strat_count, 0), 0)::float AS "avgProfit",
      ROUND(r.win_trades::numeric / NULLIF(r.total_trades, 0) * 100, 1)::float AS wr,
      COALESCE((SELECT avg_dd FROM meta_drawdown), 12.5)::float AS drawdown
    FROM regimes r;
  `;

  // 8. Inactivity Gap & Dormancy zero months
  const activityGapQuery = `
    WITH deal_gaps AS (
        SELECT 
          strategy_id,
          source_table,
          time,
          LAG(time) OVER (PARTITION BY strategy_id, source_table ORDER BY time) AS prev_time
        FROM ${fromClause}
        WHERE type IN ('buy','sell') AND LOWER(direction) = 'out'
          ${metadataDealFilter}
    ), max_gaps AS (
        SELECT 
          strategy_id,
          source_table,
          COALESCE(MAX(EXTRACT(DAY FROM time - prev_time)), 0)::int AS max_gap
        FROM deal_gaps
        GROUP BY strategy_id, source_table
    ), strategy_ranges AS (
        SELECT 
          strategy_id,
          source_table,
          MIN(time) AS min_time,
          MAX(time) AS max_time,
          COUNT(DISTINCT TO_CHAR(time, 'YYYY-MM')) AS active_months
        FROM ${fromClause}
        WHERE type IN ('buy','sell') AND LOWER(direction) = 'out'
          ${metadataDealFilter}
        GROUP BY strategy_id, source_table
    ), months_count AS (
        SELECT 
          strategy_id,
          source_table,
          GREATEST(
            (EXTRACT(YEAR FROM AGE(max_time, min_time)) * 12 + EXTRACT(MONTH FROM AGE(max_time, min_time)) + 1)::int 
            - active_months::int, 
            0
          ) AS zero_months
        FROM strategy_ranges
    )
    SELECT 
      sm.strategy_id AS id,
      sm.backtest_table AS "backtestTable",
      (sm.results->>'totalTrades')::numeric::int AS trades,
      COALESCE(mg.max_gap, 0) AS "maxGap",
      COALESCE(mc.zero_months, 0) AS "zeroMonths",
      CASE 
        WHEN COALESCE(mc.zero_months, 0) >= 6 THEN 'Dormant'
        WHEN COALESCE(mg.max_gap, 0) >= 40 THEN 'Critical'
        WHEN COALESCE(mg.max_gap, 0) >= 25 THEN 'Seasonal'
        WHEN COALESCE(mg.max_gap, 0) >= 15 THEN 'Volatile'
        ELSE 'Stable'
      END AS status
    FROM strategy_metadata sm
    LEFT JOIN max_gaps mg ON sm.strategy_id = mg.strategy_id AND sm.backtest_table = mg.source_table
    LEFT JOIN months_count mc ON sm.strategy_id = mc.strategy_id AND sm.backtest_table = mc.source_table
    WHERE 1 = 1
      ${smMetadataFilter}
      ${smActiveInRangeFilter}
    ORDER BY "maxGap" DESC;
  `;

  // 10. Commission per Lot by Symbol (avg / min / max)
  const commissionPerLotQuery = `
    SELECT
      symbol,
      ROUND(AVG(ABS(commission::numeric) / NULLIF(volume::numeric, 0)), 4)::float AS "avgFeePerLot",
      ROUND(MIN(ABS(commission::numeric) / NULLIF(volume::numeric, 0)), 4)::float AS "minFeePerLot",
      ROUND(MAX(ABS(commission::numeric) / NULLIF(volume::numeric, 0)), 4)::float AS "maxFeePerLot",
      COUNT(*)::int AS "dealCount"
    FROM ${fromClause}
    WHERE type IN ('buy','sell')
      AND commission IS NOT NULL
      AND commission::numeric != 0
      AND volume IS NOT NULL
      AND volume::numeric > 0
      ${dealOnlyFilter}
    GROUP BY symbol
    ORDER BY "avgFeePerLot" ASC;
  `;

  // 9. Exit Reasons TP/SL/CO/EoT
  const exitReasonsQuery = `
    WITH exit_deals AS (
        SELECT 
          symbol,
          CASE 
            WHEN comment ILIKE 'sl %'       THEN 'sl'
            WHEN comment ILIKE 'tp %'       THEN 'tp'
            WHEN comment ~ '_CO$'           THEN 'co'
            WHEN comment ILIKE 'end of test' THEN 'eot'
            ELSE 'other' 
          END AS exit_type
        FROM ${fromClause}
        WHERE type IN ('buy','sell') AND LOWER(direction) = 'out'
          ${dealOnlyFilter}
    )
    SELECT 
      symbol,
      ROUND(COALESCE(COUNT(*) FILTER (WHERE exit_type = 'tp')::numeric / NULLIF(COUNT(*), 0) * 100, 0), 1)::float AS tp,
      ROUND(COALESCE(COUNT(*) FILTER (WHERE exit_type = 'sl')::numeric / NULLIF(COUNT(*), 0) * 100, 0), 1)::float AS sl,
      ROUND(COALESCE(COUNT(*) FILTER (WHERE exit_type = 'co')::numeric / NULLIF(COUNT(*), 0) * 100, 0), 1)::float AS co,
      ROUND(COALESCE(COUNT(*) FILTER (WHERE exit_type = 'eot')::numeric / NULLIF(COUNT(*), 0) * 100, 0), 1)::float AS eot
    FROM exit_deals
    GROUP BY symbol
    ORDER BY symbol;
  `;

  // 11. Holding Time Ratio (HTR)
  const htrQuery = `
    WITH position_durations AS (
        SELECT 
          strategy_id,
          symbol,
          time AS exit_time,
          LAG(time) OVER (PARTITION BY strategy_id ORDER BY time) AS entry_time,
          (profit::numeric + commission::numeric + swap::numeric) AS net_profit,
          direction,
          source_table
        FROM ${fromClause}
        WHERE type IN ('buy', 'sell')
          ${dealOnlyFilter}
    ), 
    matched_positions AS (
        SELECT 
          strategy_id,
          symbol,
          EXTRACT(EPOCH FROM (exit_time - entry_time)) / 60.0 AS duration_minutes,
          net_profit,
          source_table
        FROM position_durations
        WHERE LOWER(direction) = 'out' AND entry_time IS NOT NULL
    ),
    strategy_stats AS (
        SELECT 
          strategy_id,
          symbol,
          AVG(duration_minutes) FILTER (WHERE net_profit > 0) AS avg_win_time,
          AVG(duration_minutes) FILTER (WHERE net_profit <= 0) AS avg_loss_time,
          COUNT(*) AS total_trades,
          MAX(source_table) AS backtest_table
        FROM matched_positions
        GROUP BY strategy_id, symbol
    )
    SELECT 
      strategy_id AS id,
      symbol,
      total_trades AS "totalTrades",
      ROUND(COALESCE(avg_win_time, 0)::numeric, 1)::float AS "avgWinTime",
      ROUND(COALESCE(avg_loss_time, 0)::numeric, 1)::float AS "avgLossTime",
      ROUND(
        (COALESCE(avg_loss_time, 0) / NULLIF(COALESCE(avg_win_time, 0), 0))::numeric, 
        2
      )::float AS htr,
      backtest_table AS "backtestTable"
    FROM strategy_stats
    ORDER BY id;
  `;

  // 12. Volume Escalation Index (VEI)
  const veiQuery = `
    WITH position_outcomes AS (
        SELECT 
          strategy_id,
          time,
          volume::numeric AS volume,
          CASE WHEN (profit::numeric + commission::numeric + swap::numeric) <= 0 THEN 1 ELSE 0 END AS is_loss
        FROM ${fromClause}
        WHERE type IN ('buy', 'sell') AND LOWER(direction) = 'out'
          ${dealOnlyFilter}
    ),
    streaks AS (
        SELECT 
          strategy_id,
          time,
          volume,
          is_loss,
          SUM(CASE WHEN is_loss = 0 THEN 1 ELSE 0 END) OVER (PARTITION BY strategy_id ORDER BY time) AS win_group
        FROM position_outcomes
    ),
    loss_positions AS (
        SELECT 
          strategy_id,
          time,
          volume,
          is_loss,
          (ROW_NUMBER() OVER (PARTITION BY strategy_id, win_group ORDER BY time) - 1) AS loss_streak_before_trade
        FROM streaks
    ),
    streak_averages AS (
        SELECT 
          strategy_id,
          AVG(volume) FILTER (WHERE loss_streak_before_trade = 0) AS avg_vol_base,
          AVG(volume) FILTER (WHERE loss_streak_before_trade = 3) AS avg_vol_3_losses
        FROM loss_positions
        GROUP BY strategy_id
    )
    SELECT 
      strategy_id AS id,
      ROUND(COALESCE(avg_vol_base, 0)::numeric, 2)::float AS "baseVolume",
      ROUND(COALESCE(avg_vol_3_losses, 0)::numeric, 2)::float AS "volAfter3Losses",
      ROUND(
        (COALESCE(avg_vol_3_losses, 0) / NULLIF(COALESCE(avg_vol_base, 0), 0))::numeric, 
        2
      )::float AS vei
    FROM streak_averages;
  `;

  // Run all queries concurrently
  // 13. Total Strategy Count from Metadata
  const totalCountQuery = `
    SELECT COUNT(*)::int AS total 
    FROM strategy_metadata m
    WHERE 1=1 ${metadataFilter} ${mActiveInRangeFilter}
  `;

  let dbBias = { rows: [] };
  let dbBuySell = { rows: [] };
  let dbMismatch = { rows: [] };
  let dbHour = { rows: [] };
  let dbDay = { rows: [] };
  let dbMonth = { rows: [] };
  let dbAnnual = { rows: [] };
  let dbQuarter = { rows: [] };
  let dbVolatility = { rows: [] };
  let dbActivity = { rows: [] };
  let dbExit = { rows: [] };
  let dbCommissionPerLot = { rows: [] };
  let dbHtr = { rows: [] };
  let dbVei = { rows: [] };
  let dbTotalCount = { rows: [] };

  if (skipCharts) {
    [
      dbBias,
      dbMismatch,
      dbActivity,
      dbHtr,
      dbVei,
      dbTotalCount
    ] = await Promise.all([
      pool.query(directionalBiasQuery, metadataParams, { signal }),
      pool.query(timeframeMismatchQuery, metadataParams, { signal }),
      pool.query(activityGapQuery, metadataParams, { signal }),
      pool.query(htrQuery, dealParams, { signal }),
      pool.query(veiQuery, dealParams, { signal }),
      pool.query(totalCountQuery, metadataParams, { signal })
    ]);
  } else {
    [
      dbBias,
      dbBuySell,
      dbMismatch,
      dbHour,
      dbDay,
      dbMonth,
      dbAnnual,
      dbQuarter,
      dbVolatility,
      dbActivity,
      dbExit,
      dbCommissionPerLot,
      dbHtr,
      dbVei,
      dbTotalCount
    ] = await Promise.all([
      pool.query(directionalBiasQuery, metadataParams, { signal }),
      pool.query(buySellQuery, dealParams, { signal }),
      pool.query(timeframeMismatchQuery, metadataParams, { signal }),
      pool.query(hourHeatmapQuery, dealParams, { signal }),
      pool.query(dayHeatmapQuery, dealParams, { signal }),
      pool.query(monthHeatmapQuery, dealParams, { signal }),
      pool.query(annualStabilityQuery, dealParams, { signal }),
      pool.query(quarterlySeasonalityQuery, dealParams, { signal }),
      pool.query(volatilityRegimeQuery, metadataParams, { signal }),
      pool.query(activityGapQuery, metadataParams, { signal }),
      pool.query(exitReasonsQuery, dealParams, { signal }),
      pool.query(commissionPerLotQuery, dealParams, { signal }),
      pool.query(htrQuery, dealParams, { signal }),
      pool.query(veiQuery, dealParams, { signal }),
      pool.query(totalCountQuery, metadataParams, { signal })
    ]);
  }

  const directionalBiasData = dbBias.rows || [];
  const buySellBreakdown = dbBuySell.rows || [];
  const timeframeMismatchData = dbMismatch.rows || [];
  const hourHeatmap = dbHour.rows || [];
  const dayHeatmap = dbDay.rows || [];
  const monthHeatmap = dbMonth.rows || [];
  const strategyYears = dbAnnual.rows || [];
  const quarterlySeasonality = dbQuarter.rows || [];
  const volatilityRegimeData = dbVolatility.rows || [];
  const activityGapData = dbActivity.rows || [];
  const exitReasonsData = dbExit.rows || [];
  const commissionPerLotData = dbCommissionPerLot.rows || [];
  const htrData = dbHtr.rows || [];
  const veiData = dbVei.rows || [];

  // Combine HTR and VEI by strategy_id
  const holdingRecoveryData = htrData.map(h => {
    const v = veiData.find(v => v.id === h.id);
    const vei = v ? v.vei : 1.0;

    let status = 'Excellent';
    if (h.htr > 2.0 && vei > 1.2) status = 'Critical Risk';
    else if (h.htr > 2.0) status = 'Loss Averse';
    else if (vei > 1.2) status = 'Martingale Risk';

    return {
      id: h.id,
      symbol: h.symbol,
      totalTrades: h.totalTrades,
      avgWinTime: h.avgWinTime,
      avgLossTime: h.avgLossTime,
      htr: h.htr,
      vei: vei,
      status: status,
      backtestTable: h.backtestTable
    };
  });

  // Calculate summary metrics
  const totalStrategies = Number(dbTotalCount.rows[0]?.total || strategyYears.length);
  const flaggedBias = directionalBiasData.filter(r => r.weakPct < 20).length;
  const mismatch = timeframeMismatchData.filter(r => r.status !== 'Normal').length;
  const criticalActivity = activityGapData.filter(r => r.maxGap >= 40 || r.zeroMonths >= 6).length;
  const highEot = exitReasonsData.filter(r => r.eot > 10).length;

  return {
    summary: {
      totalStrategies,
      flaggedBias,
      mismatch,
      criticalActivity,
      highEot
    },
    directionalBiasData,
    buySellBreakdown,
    timeframeMismatchData,
    hourHeatmap,
    dayHeatmap,
    monthHeatmap,
    strategyYears,
    quarterlySeasonality,
    volatilityRegimeData,
    activityGapData,
    exitReasonsData,
    commissionPerLotData,
    holdingRecoveryData
  };
};

const getBehaviorStrategyDetail = async (strategyId, sourceInput = null, { signal } = {}) => {
  const { fromClause } = await resolveTableSubquery(sourceInput);

  const params = [strategyId];
  const tableFilter = 'AND source_table = (SELECT source_table FROM (' + fromClause + ') _t WHERE strategy_id = $1 LIMIT 1)';

  // Strategy detail: filter theo strategy_id và source_table
  const scatterQuery = `
    WITH position_durations AS (
        SELECT 
          strategy_id,
          symbol,
          time AS exit_time,
          LAG(time) OVER (PARTITION BY strategy_id ORDER BY time) AS entry_time,
          (profit::numeric + commission::numeric + swap::numeric) AS net_profit,
          direction
        FROM ${fromClause}
        WHERE type IN ('buy', 'sell')
          AND strategy_id = $1
    ), 
    matched_positions AS (
        SELECT 
          strategy_id,
          symbol,
          EXTRACT(EPOCH FROM (exit_time - entry_time)) / 60.0 AS duration_minutes,
          net_profit
        FROM position_durations
        WHERE LOWER(direction) = 'out' AND entry_time IS NOT NULL
    )
    SELECT 
      ROUND(duration_minutes::numeric, 1)::float AS "holdTime",
      net_profit::float AS profit,
      CASE WHEN net_profit > 0 THEN 'win' ELSE 'loss' END AS type
    FROM matched_positions
    ORDER BY duration_minutes ASC;
  `;

  const volumeEscalationQuery = `
    WITH position_outcomes AS (
        SELECT 
          strategy_id,
          time,
          volume::numeric AS volume,
          CASE WHEN (profit::numeric + commission::numeric + swap::numeric) <= 0 THEN 1 ELSE 0 END AS is_loss
        FROM ${fromClause}
        WHERE type IN ('buy', 'sell') AND LOWER(direction) = 'out'
          AND strategy_id = $1
    ),
    streaks AS (
        SELECT 
          strategy_id,
          time,
          volume,
          is_loss,
          SUM(CASE WHEN is_loss = 0 THEN 1 ELSE 0 END) OVER (PARTITION BY strategy_id ORDER BY time) AS win_group
        FROM position_outcomes
    ),
    loss_positions AS (
        SELECT 
          strategy_id,
          time,
          volume,
          is_loss,
          (ROW_NUMBER() OVER (PARTITION BY strategy_id, win_group ORDER BY time) - 1) AS loss_streak_before_trade
        FROM streaks
    )
    SELECT 
      CASE 
        WHEN loss_streak_before_trade >= 5 THEN 5
        ELSE loss_streak_before_trade
      END AS streak,
      AVG(volume)::float AS avg_volume,
      COUNT(*)::int AS count
    FROM loss_positions
    GROUP BY 
      CASE 
        WHEN loss_streak_before_trade >= 5 THEN 5
        ELSE loss_streak_before_trade
      END
    ORDER BY streak ASC;
  `;

  const [dbScatter, dbVol] = await Promise.all([
    pool.query(scatterQuery, params, { signal }),
    pool.query(volumeEscalationQuery, params, { signal })
  ]);

  return {
    scatterData: dbScatter.rows || [],
    volumeEscalationRaw: dbVol.rows || []
  };
};

const getBehaviorCoreOnly = async (sourceInput = null, startDate = null, endDate = null, { signal } = {}) => {
  // Gọi getBehaviorAnalysis với skipCharts=true để lấy directionalBias, timeframeMismatch, activityGap, htr, vei
  // Nhưng skipCharts bỏ qua buySellQuery → cần query riêng để có buySellBreakdown
  const { fromClause } = await resolveTableSubquery(sourceInput);
  const params = [];

  let buySellDateFilter = '';
  if (startDate && endDate) {
    params.push(startDate, endDate);
    const ds = params.length - 1;
    const de = params.length;
    buySellDateFilter = ` AND time::DATE BETWEEN $${ds}::DATE AND $${de}::DATE`;
  }
  const combinedFilter = buySellDateFilter;

  const buySellQuery = `
    SELECT 
      symbol,
      COALESCE(COUNT(*) FILTER (WHERE type = 'sell' AND LOWER(direction) = 'out'), 0)::int AS "buyCount",
      ROUND(COALESCE(COUNT(*) FILTER (WHERE type = 'sell' AND LOWER(direction) = 'out' AND profit::numeric > 0)::numeric /
            NULLIF(COUNT(*) FILTER (WHERE type = 'sell' AND LOWER(direction) = 'out'), 0) * 100, 0), 1)::float AS "buyWR",
      ROUND(COALESCE(AVG(profit::numeric) FILTER (WHERE type = 'sell' AND LOWER(direction) = 'out'), 0), 2)::float AS "buyAvgProf",
      COALESCE(COUNT(*) FILTER (WHERE type = 'buy' AND LOWER(direction) = 'out'), 0)::int AS "sellCount",
      ROUND(COALESCE(COUNT(*) FILTER (WHERE type = 'buy' AND LOWER(direction) = 'out' AND profit::numeric > 0)::numeric /
            NULLIF(COUNT(*) FILTER (WHERE type = 'buy' AND LOWER(direction) = 'out'), 0) * 100, 0), 1)::float AS "sellWR",
      ROUND(COALESCE(AVG(profit::numeric) FILTER (WHERE type = 'buy' AND LOWER(direction) = 'out'), 0), 2)::float AS "sellAvgProf"
    FROM ${fromClause}
    WHERE type IN ('buy','sell')
      ${combinedFilter}
    GROUP BY symbol
    ORDER BY symbol;
  `;

  const [coreResult, dbBuySell] = await Promise.all([
    getBehaviorAnalysis(sourceInput, startDate, endDate, { skipCharts: true, signal }),
    pool.query(buySellQuery, params, { signal })
  ]);

  return {
    ...coreResult,
    buySellBreakdown: dbBuySell.rows || []
  };
};

const getBehaviorActivityOnly = async (sourceInput = null, startDate = null, endDate = null, { signal } = {}) => {
  const { fromClause } = await resolveTableSubquery(sourceInput);
  const params = [];

  let dealDateFilter = '';
  if (startDate && endDate) {
    params.push(startDate, endDate);
    const dateStartIdx = params.length - 1;
    const dateEndIdx = params.length;
    dealDateFilter = ` AND time::DATE BETWEEN $${dateStartIdx}::DATE AND $${dateEndIdx}::DATE`;
  }
  const combinedDealFilter = dealDateFilter;

  const hourlyDistributionQuery = `
    SELECT 
      EXTRACT(HOUR FROM time)::int AS hour,
      COUNT(*)::int AS count
    FROM ${fromClause}
    WHERE type IN ('buy', 'sell') AND LOWER(direction) = 'in'
      ${combinedDealFilter}
    GROUP BY EXTRACT(HOUR FROM time)
    ORDER BY hour;
  `;

  const dayOfWeekDistributionQuery = `
    SELECT 
      EXTRACT(ISODOW FROM time)::int AS dow,
      COUNT(*)::int AS count
    FROM ${fromClause}
    WHERE type IN ('buy', 'sell') AND LOWER(direction) = 'in'
      ${combinedDealFilter}
    GROUP BY EXTRACT(ISODOW FROM time)
    ORDER BY dow;
  `;

  const monthlyProfitQuery = `
    SELECT 
      TO_CHAR(time, 'YYYY-MM') AS month,
      SUM(profit::numeric + commission::numeric + swap::numeric) AS profit
    FROM ${fromClause}
    WHERE type IN ('buy', 'sell') AND LOWER(direction) = 'out'
      ${combinedDealFilter}
    GROUP BY TO_CHAR(time, 'YYYY-MM')
    ORDER BY month;
  `;

  const [dbHour, dbDay, dbMonth] = await Promise.all([
    pool.query(hourlyDistributionQuery, params, { signal }),
    pool.query(dayOfWeekDistributionQuery, params, { signal }),
    pool.query(monthlyProfitQuery, params, { signal })
  ]);

  return {
    hourlyDistribution: dbHour.rows || [],
    dayOfWeekDistribution: dbDay.rows || [],
    monthlyDistribution: dbMonth.rows || []
  };
};

const getBehaviorHoldingRecoveryOnly = async (sourceInput = null, startDate = null, endDate = null, { signal } = {}) => {
  const { fromClause } = await resolveTableSubquery(sourceInput);

  // Build separate param arrays for each query to avoid index collision
  const buildParams = () => {
    const p = [];
    let dateFilter = '';
    if (startDate && endDate) {
      p.push(startDate, endDate);
      dateFilter = ` AND time::DATE BETWEEN $${p.length - 1}::DATE AND $${p.length}::DATE`;
    }
    return { p, combinedFilter: dateFilter };
  };

  const { p: htrParams, combinedFilter: htrFilter } = buildParams();
  const { p: veiParams, combinedFilter: veiFilter } = buildParams();

  const htrQuery = `
    WITH position_durations AS (
        SELECT 
          strategy_id,
          source_table,
          time AS exit_time,
          LAG(time) OVER (PARTITION BY strategy_id, source_table ORDER BY time) AS entry_time,
          (profit::numeric + commission::numeric + swap::numeric) AS net_profit,
          direction
        FROM ${fromClause}
        WHERE LOWER(type) IN ('buy', 'sell')
          ${htrFilter}
    ), 
    matched_positions AS (
        SELECT 
          strategy_id,
          source_table,
          EXTRACT(EPOCH FROM (exit_time - entry_time)) / 60.0 AS duration_minutes,
          net_profit
        FROM position_durations
        WHERE LOWER(direction) = 'out' AND entry_time IS NOT NULL
    ),
    strategy_stats AS (
        SELECT 
          strategy_id,
          source_table,
          ROUND(AVG(duration_minutes) FILTER (WHERE net_profit <= 0)::numeric, 1) AS avg_loss_minutes,
          ROUND(AVG(duration_minutes) FILTER (WHERE net_profit > 0)::numeric, 1) AS avg_win_minutes,
          COUNT(*) AS total_trades
        FROM matched_positions
        GROUP BY strategy_id, source_table
    )
    SELECT 
      strategy_id AS id,
      source_table AS "backtestTable",
      COALESCE(avg_loss_minutes, 0)::float AS "avgLossTime",
      COALESCE(avg_win_minutes, 0)::float AS "avgWinTime",
      ROUND(
        (COALESCE(avg_loss_minutes, 0) / NULLIF(COALESCE(avg_win_minutes, 0), 0))::numeric, 
        2
      )::float AS htr,
      total_trades AS "totalTrades"
    FROM strategy_stats
    ORDER BY htr DESC NULLS LAST;
  `;

  const veiQuery = `
    WITH position_outcomes AS (
        SELECT 
          strategy_id,
          source_table,
          time,
          volume::numeric AS volume,
          CASE WHEN (profit::numeric + commission::numeric + swap::numeric) <= 0 THEN 1 ELSE 0 END AS is_loss
        FROM ${fromClause}
        WHERE LOWER(type) IN ('buy', 'sell') AND LOWER(direction) = 'out'
          ${veiFilter}
    ),
    streaks AS (
        SELECT 
          strategy_id,
          source_table,
          time,
          volume,
          is_loss,
          SUM(CASE WHEN is_loss = 0 THEN 1 ELSE 0 END) OVER (PARTITION BY strategy_id, source_table ORDER BY time) AS win_group
        FROM position_outcomes
    ),
    loss_positions AS (
        SELECT 
          strategy_id,
          source_table,
          volume,
          (ROW_NUMBER() OVER (PARTITION BY strategy_id, source_table, win_group ORDER BY time) - 1) AS loss_streak_before_trade
        FROM streaks
    ),
    streak_averages AS (
        SELECT 
          strategy_id,
          source_table,
          AVG(volume) FILTER (WHERE loss_streak_before_trade = 0) AS avg_vol_base,
          AVG(volume) FILTER (WHERE loss_streak_before_trade = 3) AS avg_vol_3_losses
        FROM loss_positions
        GROUP BY strategy_id, source_table
    )
    SELECT 
      strategy_id AS id,
      source_table AS "backtestTable",
      ROUND(COALESCE(avg_vol_base, 0)::numeric, 4)::float AS "baseVolume",
      ROUND(COALESCE(avg_vol_3_losses, 0)::numeric, 4)::float AS "volAfter3Losses",
      ROUND(
        (COALESCE(avg_vol_3_losses, 0) / NULLIF(COALESCE(avg_vol_base, 0), 0))::numeric, 
        2
      )::float AS vei
    FROM streak_averages;
  `;

  const [dbHtr, dbVei] = await Promise.all([
    pool.query(htrQuery, htrParams, { signal }),
    pool.query(veiQuery, veiParams, { signal })
  ]);

  return {
    htrData: dbHtr.rows || [],
    veiData: dbVei.rows || []
  };
};

const getBehaviorExitOnly = async (sourceInput = null, startDate = null, endDate = null, { signal } = {}) => {
  const { fromClause } = await resolveTableSubquery(sourceInput);
  const params = [];

  let dealDateFilter = '';
  if (startDate && endDate) {
    params.push(startDate, endDate);
    const dateStartIdx = params.length - 1;
    const dateEndIdx = params.length;
    dealDateFilter = ` AND time::DATE BETWEEN $${dateStartIdx}::DATE AND $${dateEndIdx}::DATE`;
  }
  const combinedDealFilter = dealDateFilter;

  // Giữ đúng format gốc { symbol, tp, sl, co, eot } như exitReasonsQuery gốc
  const exitReasonsQuery = `
    WITH exit_deals AS (
        SELECT 
          symbol,
          CASE 
            WHEN comment ILIKE 'sl %'       THEN 'sl'
            WHEN comment ILIKE 'tp %'       THEN 'tp'
            WHEN comment ~ '_CO$'           THEN 'co'
            WHEN comment ILIKE 'end of test' THEN 'eot'
            ELSE 'other' 
          END AS exit_type
        FROM ${fromClause}
        WHERE type IN ('buy','sell') AND LOWER(direction) = 'out'
          ${combinedDealFilter}
    )
    SELECT 
      symbol,
      ROUND(COALESCE(COUNT(*) FILTER (WHERE exit_type = 'tp')::numeric / NULLIF(COUNT(*), 0) * 100, 0), 1)::float AS tp,
      ROUND(COALESCE(COUNT(*) FILTER (WHERE exit_type = 'sl')::numeric / NULLIF(COUNT(*), 0) * 100, 0), 1)::float AS sl,
      ROUND(COALESCE(COUNT(*) FILTER (WHERE exit_type = 'co')::numeric / NULLIF(COUNT(*), 0) * 100, 0), 1)::float AS co,
      ROUND(COALESCE(COUNT(*) FILTER (WHERE exit_type = 'eot')::numeric / NULLIF(COUNT(*), 0) * 100, 0), 1)::float AS eot
    FROM exit_deals
    GROUP BY symbol
    ORDER BY symbol;
  `;

  // Giữ đúng format gốc { symbol, avgFeePerLot, minFeePerLot, maxFeePerLot, dealCount } như commissionPerLotQuery gốc
  const commissionPerLotQuery = `
    SELECT
      symbol,
      ROUND(AVG(ABS(commission::numeric) / NULLIF(volume::numeric, 0)), 4)::float AS "avgFeePerLot",
      ROUND(MIN(ABS(commission::numeric) / NULLIF(volume::numeric, 0)), 4)::float AS "minFeePerLot",
      ROUND(MAX(ABS(commission::numeric) / NULLIF(volume::numeric, 0)), 4)::float AS "maxFeePerLot",
      COUNT(*)::int AS "dealCount"
    FROM ${fromClause}
    WHERE type IN ('buy','sell')
      AND commission IS NOT NULL
      AND commission::numeric != 0
      AND volume IS NOT NULL
      AND volume::numeric > 0
      ${combinedDealFilter}
    GROUP BY symbol
    ORDER BY "avgFeePerLot" ASC;
  `;

  const [dbExit, dbComm] = await Promise.all([
    pool.query(exitReasonsQuery, params, { signal }),
    pool.query(commissionPerLotQuery, params, { signal })
  ]);

  return {
    exitReasonsData: dbExit.rows || [],
    commissionPerLotData: dbComm.rows || []
  };
};

module.exports = {
  getBehaviorAnalysis,
  getBehaviorStrategyDetail,
  getBehaviorCoreOnly,
  getBehaviorActivityOnly,
  getBehaviorHoldingRecoveryOnly,
  getBehaviorExitOnly
};

