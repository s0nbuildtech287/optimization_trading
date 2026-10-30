const { getAppPool } = require('../config/db');
const pool = getAppPool();
const { resolveTableSubquery } = require('./queryBuilderHelper');

const SORT_EXPR = {
  pd:      `(results->>'totalNetProfit')::numeric / NULLIF(regexp_replace(split_part(results->>'balanceDrawdownMaximal','(',1),'[^0-9\\.]','','g')::numeric, 0)`,
  winrate: `SUBSTRING(results->>'profitTrades' FROM '\\(([0-9.]+)%\\)')::numeric`,
  sharpe:  `(results->>'sharpeRatio')::numeric`,
  profit:  `(results->>'totalNetProfit')::numeric`,
};

async function getSymbolStrategySummary(symbol, backtestTable = null, sortBy = 'pd') {
  const { validTables } = await resolveTableSubquery(backtestTable);
  const p1 = [symbol, validTables];
  const tf1 = 'AND backtest_table = ANY($2::text[])';

  const { rows } = await pool.query(`
    SELECT symbol,
      COUNT(*) AS total_strategies,
      COUNT(*) FILTER (WHERE settings->'inputs'->>'AcceptBuy' IN ('true','1')
        OR (settings->'inputs'->'AcceptBuy')::text = 'true') AS buy_strategies,
      COUNT(*) FILTER (WHERE settings->'inputs'->>'AcceptSell' IN ('true','1')
        OR (settings->'inputs'->'AcceptSell')::text = 'true') AS sell_strategies,
      COUNT(*) FILTER (WHERE timeframe = 'H1') AS h1_strategies,
      COUNT(*) FILTER (WHERE timeframe = 'H4') AS h4_strategies,
      ROUND(AVG(
        (results->>'totalNetProfit')::numeric /
        NULLIF(regexp_replace(split_part(results->>'balanceDrawdownMaximal','(',1),'[^0-9\\.]','','g')::numeric, 0)
      ), 2) AS avg_pd,
      ROUND(AVG(SUBSTRING(results->>'profitTrades' FROM '\\(([0-9.]+)%\\)')::numeric), 2) AS avg_winrate,
      ROUND(AVG((results->>'sharpeRatio')::numeric), 2) AS avg_sharpe,
      ROUND(AVG((results->>'profitFactor')::numeric), 2) AS avg_pf,
      MAX((results->>'totalNetProfit')::numeric) AS max_profit
    FROM strategy_metadata
    WHERE symbol = $1 ${tf1}
      AND (results->>'totalNetProfit') IS NOT NULL
    GROUP BY symbol
  `, p1);

  if (!rows[0]) return null;
  const r = rows[0];

  // Top 10 — WHERE linh hoạt theo sortBy
  const orderExpr = SORT_EXPR[sortBy] || SORT_EXPR.pd;
  const p2 = [symbol, validTables];
  const tf2 = 'AND backtest_table = ANY($2::text[])';
  const extraWhere = sortBy === 'pd'
    ? `AND regexp_replace(split_part(results->>'balanceDrawdownMaximal','(',1),'[^0-9\\.]','','g') != ''
       AND regexp_replace(split_part(results->>'balanceDrawdownMaximal','(',1),'[^0-9\\.]','','g')::numeric > 0`
    : '';

  const { rows: topRows } = await pool.query(`
    SELECT strategy_id, backtest_table,
      ROUND((results->>'totalNetProfit')::numeric /
        NULLIF(regexp_replace(split_part(results->>'balanceDrawdownMaximal','(',1),'[^0-9\\.]','','g')::numeric,0),2) AS pd,
      ROUND(SUBSTRING(results->>'profitTrades' FROM '\\(([0-9.]+)%\\)')::numeric, 2) AS winrate,
      ROUND((results->>'sharpeRatio')::numeric, 2) AS sharpe,
      ROUND((results->>'totalNetProfit')::numeric, 2) AS profit
    FROM strategy_metadata
    WHERE symbol = $1 ${tf2}
      AND (results->>'totalNetProfit') IS NOT NULL
      ${extraWhere}
    ORDER BY ${orderExpr} DESC NULLS LAST
    LIMIT 10
  `, p2);

  return {
    symbol,
    backtestTable: backtestTable || 'all',
    sortBy,
    totalStrategies: parseInt(r.total_strategies) || 0,
    buyStrategies:   parseInt(r.buy_strategies)   || 0,
    sellStrategies:  parseInt(r.sell_strategies)  || 0,
    h1Strategies:    parseInt(r.h1_strategies)    || 0,
    h4Strategies:    parseInt(r.h4_strategies)    || 0,
    avgPd:      r.avg_pd      ? +parseFloat(r.avg_pd).toFixed(2)      : null,
    avgWinrate: r.avg_winrate ? +parseFloat(r.avg_winrate).toFixed(2) : null,
    avgSharpe:  r.avg_sharpe  ? +parseFloat(r.avg_sharpe).toFixed(2)  : null,
    avgPf:      r.avg_pf      ? +parseFloat(r.avg_pf).toFixed(2)      : null,
    topStrategies: topRows.map(row => ({
      id:      row.strategy_id,
      table:   row.backtest_table,
      pd:      row.pd      != null ? +parseFloat(row.pd).toFixed(2)      : null,
      winrate: row.winrate != null ? +parseFloat(row.winrate).toFixed(2) : null,
      sharpe:  row.sharpe  != null ? +parseFloat(row.sharpe).toFixed(2)  : null,
      profit:  row.profit  != null ? +parseFloat(row.profit).toFixed(2)  : null,
    })),
  };
}

async function getPriceZonePerformance(symbol, currentPrice, sourceInput = null) {
  if (!currentPrice) return null;
  const { fromClause } = await resolveTableSubquery(sourceInput);
  const low  = currentPrice * 0.90;
  const high = currentPrice * 1.10;

  const { rows } = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE LOWER(direction) = 'out') AS total_out,
      COUNT(*) FILTER (WHERE LOWER(direction) = 'out' AND profit > 0) AS winning,
      ROUND(AVG(profit) FILTER (WHERE LOWER(direction) = 'out'), 2) AS avg_profit,
      ROUND(SUM(profit), 2) AS total_profit,
      COUNT(DISTINCT strategy_id) AS strategies_active
    FROM ${fromClause}
    WHERE symbol = $1 AND type != 'balance' AND price BETWEEN $2 AND $3
  `, [symbol, low, high]);

  const r = rows[0];
  const totalOut = parseInt(r.total_out) || 0;
  const winning  = parseInt(r.winning)   || 0;
  if (totalOut === 0) return null;

  return {
    priceRange: { low: +low.toFixed(2), high: +high.toFixed(2) },
    totalDeals: totalOut,
    winrate: +((winning / totalOut) * 100).toFixed(2),
    avgProfit: r.avg_profit ? +parseFloat(r.avg_profit).toFixed(2) : 0,
    totalProfit: r.total_profit ? +parseFloat(r.total_profit).toFixed(2) : 0,
    strategiesActive: parseInt(r.strategies_active) || 0,
  };
}

async function getMonthlyPnl(symbol, sourceInput = null) {
  const { fromClause } = await resolveTableSubquery(sourceInput);
  const { rows } = await pool.query(`
    SELECT TO_CHAR(time, 'YYYY-MM') AS month,
      ROUND(SUM(profit + commission + swap), 2) AS net_profit,
      COUNT(*) FILTER (WHERE LOWER(direction) = 'out' AND profit > 0) AS wins,
      COUNT(*) FILTER (WHERE LOWER(direction) = 'out') AS total_out
    FROM ${fromClause}
    WHERE symbol = $1 AND type != 'balance'
    GROUP BY TO_CHAR(time, 'YYYY-MM')
    ORDER BY month DESC LIMIT 60
  `, [symbol]);

  return rows.reverse().map(r => ({
    month: r.month,
    netProfit: +parseFloat(r.net_profit).toFixed(2),
    winrate: parseInt(r.total_out) > 0
      ? +((parseInt(r.wins) / parseInt(r.total_out)) * 100).toFixed(1) : 0,
  }));
}

module.exports = { getSymbolStrategySummary, getPriceZonePerformance, getMonthlyPnl };
