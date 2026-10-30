const pg = require('pg');
const { getAppPool, safeConnect } = require('../config/db');
const { HARD_FLAG_DEFS, SOFT_FLAG_DEFS } = require('../config/riskFlagDefinitions');
const { resolveTableSubquery } = require('./queryBuilderHelper');

const pool = getAppPool();

const RISK_QUERY_TIMEOUT_MS = 300000;
const RISK_CORE_TIMEOUT_MS = 300000;

const createAbortError = () => {
  const error = new Error('Risk analysis request was aborted');
  error.name = 'AbortError';
  error.code = 'ABORT_ERR';
  return error;
};

/**
 * Execute an analysis query on a dedicated client so statement_timeout and
 * request cancellation cannot affect unrelated sync or CRUD queries.
 */
const runRiskQuery = async (text, values = [], { timeoutMs = RISK_QUERY_TIMEOUT_MS, signal } = {}) => {
  if (signal?.aborted) throw createAbortError();

  const client = await safeConnect(pool, 'RISK');
  const query = new pg.Query({ text, values });
  let cancelRequested = false;
  let abortHandler;

  try {
    await client.query(`SET statement_timeout = ${Math.max(1, Math.floor(timeoutMs))}`);

    abortHandler = () => {
      if (cancelRequested || client.activeQuery !== query) return;
      cancelRequested = true;
      console.warn('[RISK] Request aborted, cancelling PostgreSQL query');
      client.cancel(client, query);
    };
    signal?.addEventListener('abort', abortHandler, { once: true });

    const result = await new Promise((resolve, reject) => {
      query.callback = (error, queryResult) => {
        if (error) reject(error);
        else resolve(queryResult);
      };
      client.query(query);
    });
    return result;
  } finally {
    if (abortHandler) signal?.removeEventListener('abort', abortHandler);
    await client.query('SET statement_timeout = 0').catch(() => { });
    client.release();
  }
};

const formatNumber = (value, digits = 2) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric.toFixed(digits).replace(/\.0+$/, '').replace(/(\.[0-9]*?)0+$/, '$1');
};

const formatSignedNumber = (value, digits = 2) => {
  const formatted = formatNumber(value, digits);
  if (formatted == null) return null;
  return Number(value) > 0 ? `+${formatted}` : formatted;
};

const formatPercent = (value, digits = 1) => {
  const formatted = formatNumber(value, digits);
  return formatted == null ? null : `${formatted}%`;
};

const formatCurrency = (value, digits = 1) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const sign = numeric < 0 ? '-' : '';
  const abs = Math.abs(numeric);
  if (abs >= 1000) {
    const scaled = abs / 1000;
    return `${sign}$${scaled.toFixed(digits).replace(/\.0+$/, '').replace(/(\.[0-9]*?)0+$/, '$1')}k`;
  }
  return `${sign}$${abs.toFixed(digits).replace(/\.0+$/, '').replace(/(\.[0-9]*?)0+$/, '$1')}`;
};

const buildViolationValue = (row, flagId) => {
  switch (String(flagId)) {
    case '1':
      return `EP ${formatSignedNumber(row.expected_payoff, 2) ?? 'n/a'}`;
    case '2':
      return `PF ${formatNumber(row.profit_factor, 2) ?? 'n/a'}`;
    case '3':
      return `RF ${formatNumber(row.recovery_factor, 2) ?? 'n/a'}`;
    case '4':
      return `P/D ${formatNumber(row.pd_ratio, 2) ?? 'n/a'}`;
    case '5':
      return [
        `WR ${formatPercent(row.winrate_pct, 0) ?? 'n/a'}`,
        `Loss ${formatCurrency(Math.abs(Number(row.largest_loss_trade || 0)), 1) ?? 'n/a'}`,
        `DD ${formatPercent(row.drawdown_pct, 1) ?? 'n/a'}`
      ].join(' · ');

    case '6':
      return 'EOT > 10%';
    case '7':
      const absLoss = Math.abs(Number(row.largest_loss_trade || 0));
      const netProf = Number(row.total_net_profit || 0);
      const ratioPct = netProf > 0 ? Math.round(absLoss / netProf * 100) : 0;
      return `Loss ${formatCurrency(absLoss, 1) ?? 'n/a'} / Net Profit ${formatCurrency(netProf, 1) ?? 'n/a'} (${ratioPct}%)`;
    case '8':
      return `12M profit ${formatCurrency(row.recent_12m_profit, 2) ?? '0'}`;
    default:
      return 'FLAG';
  }
};

const mapMarginExposureRows = (queryRows = []) =>
  queryRows.map((r) => ({
    date: r.date,
    count: Number(r.count || 0)
  }));

const mapCorrelatedDrawdownRows = (queryRows = []) =>
  queryRows.map((r) => ({
    month: r.month,
    days: Number(r.days || 0)
  }));

const mapSymbolDivergenceRows = (queryRows = []) =>
  queryRows.map((r) => ({
    symbol: r.symbol,
    ob: Number(r.ob || 0),
    os: Number(r.os || 0)
  }));

const mapDoubleExposureRows = (queryRows = []) =>
  queryRows.map((r) => ({
    pair: r.pair,
    days: Number(r.days || 0),
    total_days: Number(r.total_days || 0),
    single_days: Number(r.single_days || 0),
    pct: Number(r.pct || 0)
  }));

const queryWithFallback = async (query, params, mapper, label, options = {}) => {
  try {
    const result = await runRiskQuery(query, params, options);
    return mapper(result.rows || []);
  } catch (err) {
    console.error(`Failed to query ${label}, falling back:`, err.code || err.message);
    return [];
  }
};

const getRiskAnalysis = async (tableName = 'all_backtests', startDate = null, endDate = null, { skipCharts = false, signal } = {}) => {
  const { fromClause, strategyWhere, strategyParams } = await resolveTableSubquery(tableName);
  const params = [...strategyParams];
  const metadataFilter = strategyWhere ? `AND ${strategyWhere.replace('WHERE ', '')}` : '';

  let activeInRangeFilter = '';
  if (startDate && endDate) {
    params.push(startDate, endDate);
    const dateStartIdx = params.length - 1;
    const dateEndIdx = params.length;
    activeInRangeFilter = `
      AND EXISTS (
        SELECT 1 FROM ${fromClause} d
        WHERE d.strategy_id = m.strategy_id
          AND d.type != 'balance'
          AND d.time::DATE BETWEEN $${dateStartIdx}::DATE AND $${dateEndIdx}::DATE
      )`;
  }

  const coreQuery = `
    WITH eot_stats AS (
      SELECT
        strategy_id,
        source_table,
        (COUNT(*) FILTER (WHERE comment ILIKE '%end of test%')::numeric / NULLIF(COUNT(*), 0) * 100) AS eot_pct
      FROM ${fromClause}
      WHERE type IN ('buy','sell') AND LOWER(direction) = 'out'
      GROUP BY strategy_id, source_table
    ),
    recent_12m_cutoffs AS (
      SELECT
        source_table,
        MAX(time) AS max_time
      FROM ${fromClause}
      WHERE type != 'balance'
      GROUP BY source_table
    ),
    recent_12m_stats AS (
      SELECT
        d.strategy_id,
        d.source_table,
        SUM(d.profit + d.commission + d.swap) AS recent_12m_profit
      FROM ${fromClause} d
      INNER JOIN recent_12m_cutoffs c
        ON c.source_table = d.source_table
      WHERE d.type != 'balance'
        AND d.time >= c.max_time - INTERVAL '12 months'
      GROUP BY d.strategy_id, d.source_table
    ),
    eligible AS (
      SELECT
        m.strategy_id,
        m.backtest_table,
        m.symbol,
        m.timeframe,
        (m.results->>'expectedPayoff')::numeric AS expected_payoff,
        (m.results->>'profitFactor')::numeric AS profit_factor,
        (m.results->>'recoveryFactor')::numeric AS recovery_factor,
        (m.results->>'totalNetProfit')::numeric AS total_net_profit,
        (m.results->>'largestLossTrade')::numeric AS largest_loss_trade,
        SUBSTRING(m.results->>'profitTrades' FROM '\\(([0-9.]+)%\\)')::numeric AS winrate_pct,
        CAST(SUBSTRING(m.results->>'balanceDrawdownMaximal' FROM '\\(([0-9.]+)%\\)') AS numeric) AS drawdown_pct,
        NULLIF(REGEXP_REPLACE(m.results->>'maxConsecutiveLosses', '[^0-9].*$', ''), '')::int AS max_consecutive_losses,
        (m.results->>'sharpeRatio')::numeric AS sharpe_ratio,
        (m.results->>'lrCorrelation')::numeric AS lr_correlation,
        regexp_replace(split_part(m.results->>'balanceDrawdownMaximal', '(', 1), '[^0-9\\.]', '', 'g')::numeric AS dd_value,
        (m.results->>'totalTrades')::numeric AS total_trades,
        COALESCE(eo.eot_pct > 10, FALSE) AS eot_flag,
        COALESCE(r12.recent_12m_profit < 0, FALSE) AS recent_12m_flag,
        COALESCE(r12.recent_12m_profit, 0) AS recent_12m_profit
      FROM strategy_metadata m
      LEFT JOIN eot_stats eo
        ON eo.strategy_id = m.strategy_id
       AND eo.source_table = m.backtest_table
      LEFT JOIN recent_12m_stats r12
        ON r12.strategy_id = m.strategy_id
       AND r12.source_table = m.backtest_table
      WHERE 1 = 1
      ${metadataFilter}
      ${activeInRangeFilter}
    ),
    calc AS (
      SELECT
        e.strategy_id,
        e.backtest_table,
        e.symbol,
        e.timeframe,
        e.expected_payoff,
        e.profit_factor,
        e.recovery_factor,
        e.total_net_profit,
        e.total_trades,
        e.winrate_pct,
        e.drawdown_pct,
        e.max_consecutive_losses,
        e.sharpe_ratio,
        e.lr_correlation,
        e.largest_loss_trade,
        e.recent_12m_profit,
        CASE WHEN e.dd_value > 0 THEN (e.total_net_profit / e.dd_value) ELSE NULL END AS pd_ratio,
        (e.expected_payoff <= 0) AS f1,
        (e.profit_factor < 1.2) AS f2,
        (e.recovery_factor < 1.0) AS f3,
        (e.dd_value > 0 AND (e.total_net_profit / e.dd_value) < 1.0) AS f4,
        (e.winrate_pct >= 50 AND ABS(e.largest_loss_trade) >= 15000 AND e.drawdown_pct >= 20) AS f5,
        e.eot_flag AS f6,
        e.recent_12m_flag AS f7,
        (e.total_net_profit > 0 AND ABS(e.largest_loss_trade) >= 0.7 * e.total_net_profit) AS f8
      FROM eligible e
    )
    SELECT
      strategy_id,
      backtest_table,
      symbol,
      timeframe,
      expected_payoff,
      profit_factor,
      recovery_factor,
      total_net_profit,
      total_trades,
      winrate_pct,
      drawdown_pct,
      max_consecutive_losses,
      sharpe_ratio,
      lr_correlation,
      largest_loss_trade,
      pd_ratio,
      recent_12m_profit,
      f1, f2, f3, f4, f5, f6, f7, f8,
      (
        COALESCE(f1::int, 0) + 
        COALESCE(f2::int, 0) + 
        COALESCE(f3::int, 0) + 
        COALESCE(f4::int, 0) + 
        COALESCE(f5::int, 0) + 
        COALESCE(f6::int, 0) + 
        COALESCE(f7::int, 0) + 
        COALESCE(f8::int, 0)
      ) AS hard_flag_count
    FROM calc
    ORDER BY hard_flag_count DESC, strategy_id
  `;

  const coreResult = await runRiskQuery(coreQuery, params, {
    timeoutMs: RISK_CORE_TIMEOUT_MS,
    signal
  });
  const rows = coreResult.rows || [];

  const softFlagHits = {};
  const softCountByStrategy = {};
  const hardFlags = {};

  SOFT_FLAG_DEFS.forEach((f) => {
    softFlagHits[f.id] = [];
  });
  HARD_FLAG_DEFS.forEach((def) => {
    hardFlags[def.key] = {
      id: def.id,
      title: def.title,
      count: 0,
      strats: [],
      col: def.sourceColumn
    };
  });

  const makeStrategyKey = (backtestTable, strategyId) => `${backtestTable || ''}:${strategyId}`;

  rows.forEach((r) => {
    const sKey = makeStrategyKey(r.backtest_table, r.strategy_id);

    HARD_FLAG_DEFS.forEach((def) => {
      const hit = hardFlags[def.key];
      if (!r[hit.col]) return;
      hit.count += 1;
      if (hit.strats.length < 500) {
        hit.strats.push({
          id: r.strategy_id,
          backtest: r.backtest_table,
          val: buildViolationValue(r, def.id)
        });
      }
    });

    SOFT_FLAG_DEFS.forEach((f) => {
      if (!f.test(r)) return;
      softFlagHits[f.id].push(r);
      softCountByStrategy[sKey] = (softCountByStrategy[sKey] || 0) + 1;
    });
  });

  const softFlags = SOFT_FLAG_DEFS.map((f) => {
    const hit = softFlagHits[f.id] || [];
    return {
      id: f.id,
      title: f.title,
      description: f.description,
      info: f.info,
      diagnosticCode: f.diagnosticCode,
      groupId: f.groupId,
      penalty: f.penalty,
      active: f.active,
      count: hit.length,
      strats: hit.slice(0, 500).map((r) => ({
        id: r.strategy_id,
        backtest: r.backtest_table,
        val: f.formatViolation(r)
      }))
    };
  });

  const strategies = rows.map((r) => {
    const sKey = makeStrategyKey(r.backtest_table, r.strategy_id);
    const softCount = Number(softCountByStrategy[sKey] || 0);
    const hardCount = Number(r.hard_flag_count || 0);
    const triggeredSoftFlags = SOFT_FLAG_DEFS.filter((f) => f.test(r));

    return {
      id: r.strategy_id,
      backtest: r.backtest_table,
      symbol: r.symbol,
      timeframe: r.timeframe,
      trades: Number(r.total_trades || 0),
      ep: r.expected_payoff != null ? Number(r.expected_payoff) : null,
      pf: r.profit_factor != null ? Number(r.profit_factor) : null,
      rf: r.recovery_factor != null ? Number(r.recovery_factor) : null,
      pd: r.pd_ratio != null ? Number(r.pd_ratio) : null,
      netProfit: r.total_net_profit != null ? Number(r.total_net_profit) : 0,
      recent12mProfit: r.recent_12m_profit != null ? Number(r.recent_12m_profit) : 0,
      hardCount,
      softCount,
      status: hardCount > 0 ? 'Disqualified' : (softCount > 0 ? 'Warning' : 'Passed'),
      hardFlags: HARD_FLAG_DEFS.filter((d) => r[d.sourceColumn]).map((d) => d.id),
      softFlags: triggeredSoftFlags.map((f) => f.id),
      softFlagDetails: triggeredSoftFlags.map((f) => ({ id: f.id, val: f.formatViolation(r), penalty: f.penalty })),
      largestLossTrade: r.largest_loss_trade != null ? Number(r.largest_loss_trade) : 0,
      winratePct: r.winrate_pct != null ? Number(r.winrate_pct) : 0,
      drawdownPct: r.drawdown_pct != null ? Number(r.drawdown_pct) : 0,
      maxConsecutiveLosses: r.max_consecutive_losses != null ? Number(r.max_consecutive_losses) : 0,
      sharpeRatio: r.sharpe_ratio != null ? Number(r.sharpe_ratio) : 0,
      lrCorrelation: r.lr_correlation != null ? Number(r.lr_correlation) : 0
    };
  });

  HARD_FLAG_DEFS.forEach((def) => {
    delete hardFlags[def.key].col;
  });

  const bySymbol = {};
  strategies.forEach((s) => {
    bySymbol[s.symbol || 'UNKNOWN'] = (bySymbol[s.symbol || 'UNKNOWN'] || 0) + 1;
  });
  const symbolDistribution = Object.entries(bySymbol)
    .map(([symbol, count]) => ({ symbol, count }))
    .sort((a, b) => b.count - a.count);

  const buy = strategies.filter((s) => String(s.id || '').toUpperCase().endsWith('OB')).length;
  const sell = strategies.filter((s) => String(s.id || '').toUpperCase().endsWith('OS')).length;
  const totalDir = buy + sell;

  const assetAgg = strategies.reduce((acc, s) => {
    const symbol = s.symbol || 'UNKNOWN';
    const profit = Math.max(0, Number(s.netProfit || 0));
    acc[symbol] = (acc[symbol] || 0) + profit;
    return acc;
  }, {});
  const totalAssetProfit = Object.values(assetAgg).reduce((sum, v) => sum + Number(v || 0), 0);
  const assetConcentration = Object.entries(assetAgg)
    .map(([symbol, totalProfit]) => ({
      symbol,
      value: totalAssetProfit > 0 ? Number(((Number(totalProfit || 0) / totalAssetProfit) * 100).toFixed(2)) : 0
    }))
    .sort((a, b) => b.value - a.value);

  const topStrategies = [...strategies]
    .sort((a, b) => Number(b.netProfit || 0) - Number(a.netProfit || 0))
    .slice(0, 20);
  const totalDomProfit = topStrategies.reduce((sum, s) => sum + Math.max(0, Number(s.netProfit || 0)), 0);
  const strategyDominance = topStrategies.map((s) => ({
    id: `${s.id}${s.backtest ? `|${s.backtest}` : ''}`,
    pct: totalDomProfit > 0 ? Number(((Math.max(0, Number(s.netProfit || 0)) / totalDomProfit) * 100).toFixed(2)) : 0
  }));

  const marginExposureParams = [];
  const marginExposureFilters = [
    `LOWER(COALESCE(type, '')) IN ('buy', 'sell')`
  ];
  if (startDate && endDate) {
    marginExposureParams.push(startDate, endDate);
    marginExposureFilters.push(`time::DATE BETWEEN $1::DATE AND $2::DATE`);
  }
  const marginExposureWhere = marginExposureFilters.length > 0
    ? `WHERE ${marginExposureFilters.join(' AND ')}`
    : '';

  const marginExposureQuery = `
    WITH peak_days AS (
      SELECT 
        DATE(time) AS trade_date,
        TO_CHAR(time, 'DD/MM/YY') AS date,
        COUNT(DISTINCT strategy_id)::int AS count
      FROM ${fromClause}
      ${marginExposureWhere}
      GROUP BY DATE(time), TO_CHAR(time, 'DD/MM/YY')
      ORDER BY count DESC
      LIMIT 50
    )
    SELECT date, count
    FROM peak_days
    ORDER BY trade_date ASC;
  `;

  const correlatedDrawdownParams = [];
  const correlatedDrawdownFilters = [];
  if (startDate && endDate) {
    correlatedDrawdownParams.push(startDate, endDate);
    correlatedDrawdownFilters.push(`time::DATE BETWEEN $1::DATE AND $2::DATE`);
  }
  const correlatedDrawdownWhere = correlatedDrawdownFilters.length > 0
    ? `WHERE ${correlatedDrawdownFilters.join(' AND ')}`
    : '';

  const correlatedDrawdownQuery = `
    WITH daily_strategy_profit AS (
      SELECT 
        DATE(time) AS trade_date,
        strategy_id,
        SUM(profit + commission + swap) AS net_daily_profit
      FROM ${fromClause}
      ${correlatedDrawdownWhere}
      GROUP BY DATE(time), strategy_id
    ),
    daily_summary AS (
      SELECT 
        trade_date,
        COUNT(DISTINCT strategy_id) AS total_active_strats,
        COUNT(DISTINCT CASE WHEN net_daily_profit < 0 THEN strategy_id END) AS losing_strats
      FROM daily_strategy_profit
      GROUP BY trade_date
    ),
    peak_months AS (
      SELECT 
        DATE_TRUNC('month', trade_date) AS month_start,
        TO_CHAR(trade_date, 'MM/YY') AS month,
        COUNT(*)::int AS days
      FROM daily_summary
      WHERE total_active_strats >= 4
        AND (losing_strats::numeric / NULLIF(total_active_strats, 0)) >= 
          CASE 
            WHEN total_active_strats >= 100 THEN 0.85
            WHEN total_active_strats >= 20 THEN 0.70
            ELSE 0.55
          END
      GROUP BY TO_CHAR(trade_date, 'MM/YY'), DATE_TRUNC('month', trade_date)
      ORDER BY month_start DESC
      LIMIT 36
    )
    SELECT month, days
    FROM peak_months
    ORDER BY month_start ASC;
  `;

  const divergenceParams = [...strategyParams];
  const divergenceFilters = [];
  if (strategyWhere) {
    divergenceFilters.push(strategyWhere.replace('WHERE ', ''));
  }
  if (startDate && endDate) {
    divergenceParams.push(startDate, endDate);
    const dateStartIdx = divergenceParams.length - 1;
    const dateEndIdx = divergenceParams.length;
    divergenceFilters.push(`EXISTS (
      SELECT 1 FROM ${fromClause} d
      WHERE d.strategy_id = m.strategy_id
        AND d.type != 'balance'
        AND d.time::DATE BETWEEN $${dateStartIdx}::DATE AND $${dateEndIdx}::DATE
    )`);
  }
  const divergenceWhere = divergenceFilters.length > 0
    ? `WHERE ${divergenceFilters.join(' AND ')}`
    : '';

  const divergenceQuery = `
    SELECT 
      m.symbol,
      SUM(CASE WHEN UPPER(m.strategy_id) LIKE '%OB' THEN (m.results->>'totalNetProfit')::numeric ELSE 0 END) AS ob,
      SUM(CASE WHEN UPPER(m.strategy_id) LIKE '%OS' THEN (m.results->>'totalNetProfit')::numeric ELSE 0 END) AS os
    FROM strategy_metadata m
    ${divergenceWhere}
    GROUP BY m.symbol
    ORDER BY ABS(
      SUM(CASE WHEN UPPER(m.strategy_id) LIKE '%OB' THEN (m.results->>'totalNetProfit')::numeric ELSE 0 END) -
      SUM(CASE WHEN UPPER(m.strategy_id) LIKE '%OS' THEN (m.results->>'totalNetProfit')::numeric ELSE 0 END)
    ) DESC, m.symbol
    LIMIT 10;
  `;

  const doubleExposureParams = [];
  const doubleExposureFilters = [];
  if (startDate && endDate) {
    doubleExposureParams.push(startDate, endDate);
    doubleExposureFilters.push(`a.time::DATE BETWEEN $1::DATE AND $2::DATE`);
  }
  const doubleExposureWhere = doubleExposureFilters.length > 0
    ? `WHERE ${doubleExposureFilters.join(' AND ')}`
    : '';

  const doubleExposureQuery = `
    WITH prepared_deals AS (
      SELECT 
        DATE(a.time) AS trade_date,
        a.symbol,
        a.type,
        m.timeframe,
        REGEXP_REPLACE(a.strategy_id, 'H[14](OB|OS)?$', '') AS base_strategy
      FROM ${fromClause} a
      INNER JOIN strategy_metadata m ON a.strategy_id = m.strategy_id
      WHERE a.type IN ('buy', 'sell')
        AND LOWER(a.direction) = 'in'
        ${doubleExposureWhere ? doubleExposureWhere.replace('WHERE', 'AND') : ''}
    ),
    daily_deals AS (
      SELECT 
        trade_date,
        symbol,
        type,
        timeframe,
        base_strategy
      FROM prepared_deals
      GROUP BY trade_date, symbol, type, timeframe, base_strategy
    ),
    daily_family AS (
      SELECT
        trade_date,
        symbol,
        type,
        base_strategy,
        BOOL_OR(timeframe = 'H1') AS has_h1,
        BOOL_OR(timeframe = 'H4') AS has_h4
      FROM daily_deals
      GROUP BY trade_date, symbol, type, base_strategy
    ),
    family_stats AS (
      SELECT
        base_strategy,
        symbol,
        COUNT(DISTINCT trade_date) AS total_days
      FROM daily_family
      GROUP BY base_strategy, symbol
    ),
    family_overlap AS (
      SELECT 
        base_strategy,
        symbol,
        COUNT(DISTINCT trade_date)::numeric AS overlap_count
      FROM daily_family
      WHERE has_h1 AND has_h4
      GROUP BY base_strategy, symbol
    ),
    family_rates AS (
      SELECT 
        f.symbol,
        f.base_strategy,
        COALESCE(o.overlap_count, 0) AS overlap_days,
        f.total_days
      FROM family_stats f
      LEFT JOIN family_overlap o ON f.base_strategy = o.base_strategy AND f.symbol = o.symbol
    )
    SELECT 
      symbol AS pair,
      ROUND(AVG(overlap_days))::int AS days,
      ROUND(AVG(total_days))::int AS total_days,
      (ROUND(AVG(total_days)) - ROUND(AVG(overlap_days)))::int AS single_days,
      ROUND((SUM(overlap_days)::numeric / NULLIF(SUM(total_days), 0) * 100), 2)::numeric AS pct
    FROM family_rates
    GROUP BY symbol
    ORDER BY pct DESC
    LIMIT 10;
  `;

  // ✅ Skip heavy chart queries when only summary is needed (e.g., dashboard overview widget)
  let marginExposure = [];
  let correlatedDrawdown = [];
  let symbolDivergence = [];
  let doubleExposure = [];

  if (!skipCharts) {
    [marginExposure, correlatedDrawdown, symbolDivergence, doubleExposure] = await Promise.all([
      queryWithFallback(marginExposureQuery, marginExposureParams, mapMarginExposureRows, 'marginExposure', { signal }),
      queryWithFallback(correlatedDrawdownQuery, correlatedDrawdownParams, mapCorrelatedDrawdownRows, 'correlatedDrawdown', { signal }),
      queryWithFallback(divergenceQuery, divergenceParams, mapSymbolDivergenceRows, 'symbolDivergence', { signal }),
      queryWithFallback(doubleExposureQuery, doubleExposureParams, mapDoubleExposureRows, 'doubleExposure', { signal })
    ]);
  }

  const disqualifiedCount = strategies.filter((s) => s.hardCount > 0).length;
  const warningCount = strategies.filter((s) => s.hardCount === 0 && s.softCount > 0).length;
  const passedCount = strategies.length - disqualifiedCount;
  const passedCleanCount = Math.max(0, passedCount - warningCount);

  return {
    summary: {
      totalStrategies: strategies.length,
      hardFlaggedStrategies: disqualifiedCount,
      passedStrategies: passedCount,
      warningStrategies: warningCount,
      passedCleanStrategies: passedCleanCount
    },
    hardFlags,
    softFlags,
    strategies,
    charts: {
      symbolDistribution,
      marketNeutral: [
        { name: 'Buy (OB)', value: totalDir > 0 ? Number(((buy / totalDir) * 100).toFixed(2)) : 0 },
        { name: 'Sell (OS)', value: totalDir > 0 ? Number(((sell / totalDir) * 100).toFixed(2)) : 0 }
      ],
      assetConcentration,
      strategyDominance,
      marginExposure,
      correlatedDrawdown,
      symbolDivergence,
      doubleExposure
    }
  };
};

const getMarginExposureOnly = async (sourceInput = null, startDate = null, endDate = null, { signal } = {}) => {
  const { fromClause } = await resolveTableSubquery(sourceInput);
  const marginExposureParams = [];
  const marginExposureFilters = [
    `LOWER(COALESCE(type, '')) IN ('buy', 'sell')`
  ];
  if (startDate && endDate) {
    marginExposureParams.push(startDate, endDate);
    marginExposureFilters.push(`time::DATE BETWEEN $${marginExposureParams.length - 1}::DATE AND $${marginExposureParams.length}::DATE`);
  }
  const marginExposureWhere = marginExposureFilters.length > 0
    ? `WHERE ${marginExposureFilters.join(' AND ')}`
    : '';

  const marginExposureQuery = `
    WITH peak_days AS (
      SELECT 
        DATE(time) AS trade_date,
        TO_CHAR(time, 'DD/MM/YY') AS date,
        COUNT(DISTINCT strategy_id)::int AS count
      FROM ${fromClause}
      ${marginExposureWhere}
      GROUP BY DATE(time), TO_CHAR(time, 'DD/MM/YY')
      ORDER BY count DESC
      LIMIT 50
    )
    SELECT date, count
    FROM peak_days
    ORDER BY trade_date ASC;
  `;

  return queryWithFallback(marginExposureQuery, marginExposureParams, mapMarginExposureRows, 'marginExposure', { signal });
};

const getDoubleExposureOnly = async (sourceInput = null, startDate = null, endDate = null, { signal } = {}) => {
  const { fromClause } = await resolveTableSubquery(sourceInput);
  const doubleExposureParams = [];
  const doubleExposureFilters = [];
  if (startDate && endDate) {
    doubleExposureParams.push(startDate, endDate);
    doubleExposureFilters.push(`a.time::DATE BETWEEN $${doubleExposureParams.length - 1}::DATE AND $${doubleExposureParams.length}::DATE`);
  }
  const doubleExposureWhere = doubleExposureFilters.length > 0
    ? `WHERE ${doubleExposureFilters.join(' AND ')}`
    : '';

  const doubleExposureQuery = `
    WITH prepared_deals AS (
      SELECT 
        DATE(a.time) AS trade_date,
        a.symbol,
        a.type,
        m.timeframe,
        REGEXP_REPLACE(a.strategy_id, 'H[14](OB|OS)?$', '') AS base_strategy
      FROM ${fromClause} a
      INNER JOIN strategy_metadata m ON a.strategy_id = m.strategy_id
        AND a.source_table = m.backtest_table
      WHERE a.type IN ('buy', 'sell')
        AND LOWER(a.direction) = 'in'
        ${doubleExposureWhere ? doubleExposureWhere.replace('WHERE', 'AND') : ''}
    ),
    daily_deals AS (
      SELECT 
        trade_date,
        symbol,
        type,
        timeframe,
        base_strategy
      FROM prepared_deals
      GROUP BY trade_date, symbol, type, timeframe, base_strategy
    ),
    daily_family AS (
      SELECT
        trade_date,
        symbol,
        type,
        base_strategy,
        BOOL_OR(timeframe = 'H1') AS has_h1,
        BOOL_OR(timeframe = 'H4') AS has_h4
      FROM daily_deals
      GROUP BY trade_date, symbol, type, base_strategy
    ),
    family_stats AS (
      SELECT
        base_strategy,
        symbol,
        COUNT(DISTINCT trade_date) AS total_days
      FROM daily_family
      GROUP BY base_strategy, symbol
    ),
    family_overlap AS (
      SELECT 
        base_strategy,
        symbol,
        COUNT(DISTINCT trade_date)::numeric AS overlap_count
      FROM daily_family
      WHERE has_h1 AND has_h4
      GROUP BY base_strategy, symbol
    ),
    family_rates AS (
      SELECT 
        f.symbol,
        f.base_strategy,
        COALESCE(o.overlap_count, 0) AS overlap_days,
        f.total_days
      FROM family_stats f
      LEFT JOIN family_overlap o ON f.base_strategy = o.base_strategy AND f.symbol = o.symbol
    )
    SELECT 
      symbol AS pair,
      ROUND(AVG(overlap_days))::int AS days,
      ROUND(AVG(total_days))::int AS total_days,
      (ROUND(AVG(total_days)) - ROUND(AVG(overlap_days)))::int AS single_days,
      ROUND((SUM(overlap_days)::numeric / NULLIF(SUM(total_days), 0) * 100), 2)::numeric AS pct
    FROM family_rates
    GROUP BY symbol
    ORDER BY pct DESC
    LIMIT 10;
  `;

  return queryWithFallback(doubleExposureQuery, doubleExposureParams, mapDoubleExposureRows, 'doubleExposure', { signal });
};

const getLightChartsOnly = async (sourceInput = null, startDate = null, endDate = null, { signal } = {}) => {
  const { fromClause, strategyWhere, strategyParams } = await resolveTableSubquery(sourceInput);
  const correlatedDrawdownParams = [];
  const correlatedDrawdownFilters = [];
  if (startDate && endDate) {
    correlatedDrawdownParams.push(startDate, endDate);
    correlatedDrawdownFilters.push(`time::DATE BETWEEN $${correlatedDrawdownParams.length - 1}::DATE AND $${correlatedDrawdownParams.length}::DATE`);
  }
  const correlatedDrawdownWhere = correlatedDrawdownFilters.length > 0
    ? `WHERE ${correlatedDrawdownFilters.join(' AND ')}`
    : '';

  const correlatedDrawdownQuery = `
    WITH daily_strategy_profit AS (
      SELECT 
        DATE(time) AS trade_date,
        strategy_id,
        SUM(profit + commission + swap) AS net_daily_profit
      FROM ${fromClause}
      ${correlatedDrawdownWhere}
      GROUP BY DATE(time), strategy_id
    ),
    daily_summary AS (
      SELECT 
        trade_date,
        COUNT(DISTINCT strategy_id) AS total_active_strats,
        COUNT(DISTINCT CASE WHEN net_daily_profit < 0 THEN strategy_id END) AS losing_strats
      FROM daily_strategy_profit
      GROUP BY trade_date
    ),
    peak_months AS (
      SELECT 
        DATE_TRUNC('month', trade_date) AS month_start,
        TO_CHAR(trade_date, 'MM/YY') AS month,
        COUNT(*)::int AS days
      FROM daily_summary
      WHERE total_active_strats >= 4
        AND (losing_strats::numeric / NULLIF(total_active_strats, 0)) >= 
          CASE 
            WHEN total_active_strats >= 100 THEN 0.85
            WHEN total_active_strats >= 20 THEN 0.70
            ELSE 0.55
          END
      GROUP BY TO_CHAR(trade_date, 'MM/YY'), DATE_TRUNC('month', trade_date)
      ORDER BY month_start DESC
      LIMIT 36
    )
    SELECT month, days
    FROM peak_months
    ORDER BY month_start ASC;
  `;

  const divergenceParams = [...strategyParams];
  const divergenceFilters = [];
  if (strategyWhere) {
    divergenceFilters.push(strategyWhere.replace('WHERE ', ''));
  }
  if (startDate && endDate) {
    divergenceParams.push(startDate, endDate);
    const dateStartIdx = divergenceParams.length - 1;
    const dateEndIdx = divergenceParams.length;
    divergenceFilters.push(`EXISTS (
      SELECT 1 FROM ${fromClause} d
      WHERE d.strategy_id = m.strategy_id
        AND d.source_table = m.backtest_table
        AND d.type != 'balance'
        AND d.time::DATE BETWEEN $${dateStartIdx}::DATE AND $${dateEndIdx}::DATE
    )`);
  }
  const divergenceWhere = divergenceFilters.length > 0
    ? `WHERE ${divergenceFilters.join(' AND ')}`
    : '';

  const divergenceQuery = `
    SELECT 
      m.symbol,
      SUM(CASE WHEN UPPER(m.strategy_id) LIKE '%OB' THEN (m.results->>'totalNetProfit')::numeric ELSE 0 END) AS ob,
      SUM(CASE WHEN UPPER(m.strategy_id) LIKE '%OS' THEN (m.results->>'totalNetProfit')::numeric ELSE 0 END) AS os
    FROM strategy_metadata m
    ${divergenceWhere}
    GROUP BY m.symbol
    ORDER BY ABS(
      SUM(CASE WHEN UPPER(m.strategy_id) LIKE '%OB' THEN (m.results->>'totalNetProfit')::numeric ELSE 0 END) -
      SUM(CASE WHEN UPPER(m.strategy_id) LIKE '%OS' THEN (m.results->>'totalNetProfit')::numeric ELSE 0 END)
    ) DESC, m.symbol
    LIMIT 10;
  `;

  const [correlatedDrawdown, symbolDivergence] = await Promise.all([
    queryWithFallback(correlatedDrawdownQuery, correlatedDrawdownParams, mapCorrelatedDrawdownRows, 'correlatedDrawdown', { signal }),
    queryWithFallback(divergenceQuery, divergenceParams, mapSymbolDivergenceRows, 'symbolDivergence', { signal })
  ]);

  return { correlatedDrawdown, symbolDivergence };
};

module.exports = {
  getRiskAnalysis,
  getMarginExposureOnly,
  getDoubleExposureOnly,
  getLightChartsOnly
};
