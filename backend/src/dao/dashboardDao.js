const { getAppPool } = require("../config/db");
const { resolveTableSubquery } = require("./queryBuilderHelper");
const pool = getAppPool();

function buildDashboardWhereClause({ startDate, endDate, year, params = [], baseClause = "type != 'balance'" }) {
  let clauses = [baseClause];
  if (startDate && endDate) {
    params.push(startDate, endDate);
    clauses.push(`time::DATE BETWEEN $${params.length - 1}::DATE AND $${params.length}::DATE`);
  } else if (year) {
    params.push(year);
    clauses.push(`EXTRACT(YEAR FROM time) = $${params.length}`);
  }
  return {
    whereClause: clauses.length > 0 ? "WHERE " + clauses.join(" AND ") : "",
    params
  };
}

/**
 * âœ… 1. Tá»”NG QUAN - Tá»•ng sá»‘ deals, profit, win rate
 */
const getDashboardOverview = async (tableName = 'all_backtests', year = null, startDate = null, endDate = null) => {
  const { fromClause, strategyWhere, strategyParams } = await resolveTableSubquery(tableName);
  const { whereClause, params } = buildDashboardWhereClause({ startDate, endDate, year });
  
  const query = `
    SELECT 
      COUNT(*) as total_deals,
      COUNT(DISTINCT symbol) as total_symbols,
      COALESCE(SUM(profit), 0) as total_profit,
      COALESCE(SUM(commission), 0) as total_commission,
      COALESCE(SUM(swap), 0) as total_swap,
      COUNT(*) FILTER (WHERE LOWER(direction) = 'out' AND profit > 0) as winning_deals,
      COUNT(*) FILTER (WHERE LOWER(direction) = 'out') as total_out_deals,
      COALESCE(AVG(profit), 0) as avg_profit_per_deal
    FROM ${fromClause}
    ${whereClause}
  `;

  const strategyCountQuery = `SELECT COUNT(*) as total_strategies FROM strategy_metadata ${strategyWhere}`;
  
  try {
    const [result, strategyCountResult] = await Promise.all([
      pool.query(query, params),
      pool.query(strategyCountQuery, strategyParams)
    ]);
    const row = result.rows[0];
    
    const totalDeals = parseInt(row.total_deals) || 0;
    const totalOutDeals = parseInt(row.total_out_deals) || 0; // Tá»•ng lá»‡nh OUT
    const winningDeals = parseInt(row.winning_deals) || 0; // Lá»‡nh OUT cÃ³ profit > 0
    const winRate = totalOutDeals > 0 ? ((winningDeals / totalOutDeals) * 100).toFixed(2) : 0;
    
    return {
      totalDeals,
      totalStrategies: parseInt(strategyCountResult.rows[0].total_strategies) || 0,
      totalSymbols: parseInt(row.total_symbols) || 0,
      totalProfit: parseFloat(row.total_profit) || 0,
      totalCommission: parseFloat(row.total_commission) || 0,
      totalSwap: parseFloat(row.total_swap) || 0,
      winningDeals,
      losingDeals: totalOutDeals - winningDeals,
      winRate: parseFloat(winRate),
      avgProfitPerDeal: parseFloat(row.avg_profit_per_deal) || 0
    };
  } catch (error) {
    console.error('âŒ getDashboardOverview error:', error);
    throw error;
  }
};

/**
 * âœ… 2. PROFIT THEO THÃNG (Line Chart)
 */
const getMonthlyProfit = async (tableName = 'all_backtests', year = null, startDate = null, endDate = null) => {
  const { fromClause } = await resolveTableSubquery(tableName);
  const { whereClause, params } = buildDashboardWhereClause({ startDate, endDate, year });
  
  const query = `
    SELECT 
      TO_CHAR(time, 'YYYY-MM') as month,
      COALESCE(SUM(profit), 0) as total_profit,
      COUNT(*) FILTER (WHERE profit > 0) as winning_deals,
      COUNT(*) FILTER (WHERE profit < 0) as losing_deals
    FROM ${fromClause}
    ${whereClause}
    GROUP BY TO_CHAR(time, 'YYYY-MM')
    ORDER BY month
  `;
  
  try {
    const result = await pool.query(query, params);
    return result.rows.map(row => ({
      month: row.month,
      profit: parseFloat(row.total_profit) || 0,
      winningDeals: parseInt(row.winning_deals) || 0,
      losingDeals: parseInt(row.losing_deals) || 0
    }));
  } catch (error) {
    console.error('âŒ getMonthlyProfit error:', error);
    throw error;
  }
};

/**
 * âœ… 3. TOP 10 STRATEGIES BY P/D RATIO
 */
const getTopStrategies = async (tableName = 'all_backtests', limit = 10, year = null, startDate = null, endDate = null) => {
  const { strategyWhere, strategyParams } = await resolveTableSubquery(tableName);
  const params = [...strategyParams, limit];

  let baseFilters = `(results->>'totalNetProfit') IS NOT NULL
    AND (results->>'balanceDrawdownMaximal') IS NOT NULL
    AND (results->>'totalTrades') IS NOT NULL
    AND regexp_replace(split_part(results->>'balanceDrawdownMaximal', '(', 1), '[^0-9\\.]', '', 'g') != ''
    AND regexp_replace(split_part(results->>'balanceDrawdownMaximal', '(', 1), '[^0-9\\.]', '', 'g')::numeric > 0`;

  let whereClause = strategyWhere
    ? `${strategyWhere} AND ${baseFilters}`
    : `WHERE ${baseFilters}`;

  const query = `
    SELECT
      strategy_id,
      backtest_table,
      (results->>'totalNetProfit')::numeric AS total_net_profit,
      regexp_replace(
        split_part(results->>'balanceDrawdownMaximal', '(', 1),
        '[^0-9\\.]', '', 'g'
      )::numeric AS drawdown_value,
      (results->>'totalNetProfit')::numeric /
        regexp_replace(
          split_part(results->>'balanceDrawdownMaximal', '(', 1),
          '[^0-9\\.]', '', 'g'
        )::numeric AS pd_ratio,
      (results->>'profitFactor')::numeric AS profit_factor,
      (results->>'recoveryFactor')::numeric AS recovery_factor,
      (results->>'expectedPayoff')::numeric AS expected_payoff,
      (results->>'lrCorrelation')::numeric AS lr_correlation
    FROM strategy_metadata
    ${whereClause}
    ORDER BY pd_ratio DESC NULLS LAST
    LIMIT $${params.length}
  `;

  try {
    const result = await pool.query(query, params);
    return result.rows.map(row => ({
      strategyId: row.strategy_id,
      backtestTable: row.backtest_table,
      totalNetProfit: parseFloat(row.total_net_profit) || 0,
      drawdownValue: parseFloat(row.drawdown_value) || 0,
      pd: parseFloat(parseFloat(row.pd_ratio).toFixed(2)) || 0,
      profitFactor: parseFloat(row.profit_factor) || 0,
      recoveryFactor: parseFloat(row.recovery_factor) || 0,
      expectedPayoff: parseFloat(row.expected_payoff) || 0,
      lrCorrelation: parseFloat(row.lr_correlation) || 0
    }));
  } catch (error) {
    console.error('âŒ getTopStrategies (P/D) error:', error);
    throw error;
  }
};

/**
 * âœ… 4. TOP 10 SYMBOLS (Pie Chart)
 */
const getTopSymbols = async (tableName = 'all_backtests', limit = 10, year = null, startDate = null, endDate = null) => {
  const { fromClause } = await resolveTableSubquery(tableName);
  const { whereClause, params } = buildDashboardWhereClause({ startDate, endDate, year, params: [limit] });
  
  const query = `
    SELECT 
      symbol,
      COUNT(*) as total_deals,
      COALESCE(SUM(profit), 0) as total_profit
    FROM ${fromClause}
    ${whereClause}
    GROUP BY symbol
    ORDER BY total_profit DESC
    LIMIT $1
  `;
  
  try {
    const result = await pool.query(query, params);
    return result.rows.map(row => ({
      symbol: row.symbol,
      totalDeals: parseInt(row.total_deals) || 0,
      totalProfit: parseFloat(row.total_profit) || 0
    }));
  } catch (error) {
    console.error('âŒ getTopSymbols error:', error);
    throw error;
  }
};


/**
 * âœ… 5. PROFIT DISTRIBUTION (Histogram)
 */
const getProfitDistribution = async (tableName = 'all_backtests', year = null, startDate = null, endDate = null) => {
  const { fromClause } = await resolveTableSubquery(tableName);
  const { whereClause, params } = buildDashboardWhereClause({ startDate, endDate, year });
  
  const query = `
    SELECT 
      profit_range,
      deal_count
    FROM (
      SELECT 
        CASE 
          WHEN profit < -1000 THEN '< -1000'
          WHEN profit >= -1000 AND profit < -500 THEN '-1000 to -500'
          WHEN profit >= -500 AND profit < -100 THEN '-500 to -100'
          WHEN profit >= -100 AND profit < 0 THEN '-100 to 0'
          WHEN profit >= 0 AND profit < 100 THEN '0 to 100'
          WHEN profit >= 100 AND profit < 500 THEN '100 to 500'
          WHEN profit >= 500 AND profit < 1000 THEN '500 to 1000'
          ELSE '> 1000'
        END as profit_range,
        COUNT(*) as deal_count
      FROM ${fromClause}
      ${whereClause}
      GROUP BY 
        CASE 
          WHEN profit < -1000 THEN '< -1000'
          WHEN profit >= -1000 AND profit < -500 THEN '-1000 to -500'
          WHEN profit >= -500 AND profit < -100 THEN '-500 to -100'
          WHEN profit >= -100 AND profit < 0 THEN '-100 to 0'
          WHEN profit >= 0 AND profit < 100 THEN '0 to 100'
          WHEN profit >= 100 AND profit < 500 THEN '100 to 500'
          WHEN profit >= 500 AND profit < 1000 THEN '500 to 1000'
          ELSE '> 1000'
        END
    ) as distribution
    ORDER BY 
      CASE profit_range
        WHEN '< -1000' THEN 1
        WHEN '-1000 to -500' THEN 2
        WHEN '-500 to -100' THEN 3
        WHEN '-100 to 0' THEN 4
        WHEN '0 to 100' THEN 5
        WHEN '100 to 500' THEN 6
        WHEN '500 to 1000' THEN 7
        WHEN '> 1000' THEN 8
      END
  `;
  
  try {
    const result = await pool.query(query, params);
    return result.rows.map(row => ({
      range: row.profit_range,
      count: parseInt(row.deal_count) || 0
    }));
  } catch (error) {
    console.error('âŒ getProfitDistribution error:', error);
    throw error;
  }
};

/**
 * âœ… 6. WIN/LOSS STREAK ANALYSIS
 */
const getStreakAnalysis = async (tableName = 'all_backtests') => {
  const { fromClause } = await resolveTableSubquery(tableName);
  const query = `
    WITH streaks AS (
      SELECT 
        strategy_id,
        CASE WHEN profit > 0 THEN 'win' ELSE 'loss' END as result,
        time,
        LAG(CASE WHEN profit > 0 THEN 'win' ELSE 'loss' END) OVER (PARTITION BY strategy_id ORDER BY time) as prev_result
      FROM ${fromClause}
      WHERE type != 'balance'
    )
    SELECT 
      result,
      COUNT(*) as streak_count,
      AVG(CASE WHEN result != prev_result OR prev_result IS NULL THEN 1 ELSE 0 END) as avg_streak_length
    FROM streaks
    GROUP BY result
  `;
  
  const result = await pool.query(query);
  return result.rows;
};

/**
 * âœ… 7. YEARLY COMPARISON
 */
const getYearlyComparison = async (tableName = 'all_backtests', year = null, startDate = null, endDate = null) => {
  const { fromClause } = await resolveTableSubquery(tableName);
  const { whereClause, params } = buildDashboardWhereClause({ startDate, endDate, year });
  
  const query = `
    SELECT 
      EXTRACT(YEAR FROM time) as year,
      COALESCE(SUM(profit), 0) as total_profit,
      COUNT(*) as total_deals,
      COUNT(*) FILTER (WHERE LOWER(direction) = 'out' AND profit > 0) as winning_deals,
      COUNT(*) FILTER (WHERE LOWER(direction) = 'out') as total_out_deals
    FROM ${fromClause}
    ${whereClause}
    GROUP BY EXTRACT(YEAR FROM time)
    ORDER BY year
  `;
  
  try {
    const result = await pool.query(query, params);
    return result.rows.map(row => {
      const totalDeals = parseInt(row.total_deals) || 0;
      const totalOutDeals = parseInt(row.total_out_deals) || 0; // Tá»•ng lá»‡nh OUT
      const winningDeals = parseInt(row.winning_deals) || 0; // Lá»‡nh OUT cÃ³ profit > 0
      return {
        year: parseInt(row.year),
        totalProfit: parseFloat(row.total_profit) || 0,
        totalDeals,
        winningDeals,
        winRate: totalOutDeals > 0 ? ((winningDeals / totalOutDeals) * 100).toFixed(2) : 0
      };
    });
  } catch (error) {
    console.error('âŒ getYearlyComparison error:', error);
    throw error;
  }
};


// exports moved to bottom


/**
 * âœ… 8. DETAILED REPORT â€” P&L + portfolio risk metrics (View Full Detailed Report modal)
 * P&L: tá»« deals khi cÃ³ year/date filter; tá»« strategy_metadata khi full period.
 * Risk metrics: trung bÃ¬nh tá»« strategy_metadata (full backtest per strategy).
 */
const getDetailedReport = async (tableName = 'all_backtests', year = null, startDate = null, endDate = null) => {
  const { fromClause, validTables } = await resolveTableSubquery(tableName);
  const hasDealTimeFilter = Boolean((startDate && endDate) || year);

  const metadataParams = [validTables];
  const metadataFilter = `WHERE backtest_table = ANY($1::text[])`;

  const ddPctExpr = `CAST(SUBSTRING(results->>'balanceDrawdownMaximal' FROM '\\(([0-9.]+)%\\)') AS numeric)`;
  const ddValExpr = `regexp_replace(split_part(results->>'balanceDrawdownMaximal', '(', 1), '[^0-9\\.]', '', 'g')::numeric`;
  const pdRatioExpr = `(results->>'totalNetProfit')::numeric / NULLIF(${ddValExpr}, 0)`;
  const winrateMetaExpr = `SUBSTRING(results->>'profitTrades' FROM '\\(([0-9.]+)%\\)')::numeric`;
  const histQualityExpr = `SUBSTRING(results->>'historyQuality' FROM '^([0-9]+)')::numeric`;

  const rrrExpr = `CASE WHEN (results->>'averageLossTrade') IS NOT NULL AND (results->>'averageProfitTrade') IS NOT NULL AND (results->>'averageLossTrade')::numeric != 0 THEN (results->>'averageProfitTrade')::numeric / ABS((results->>'averageLossTrade')::numeric) ELSE 0 END`;
  const lptrExpr = `(results->>'largestProfitTrade')::numeric / NULLIF((results->>'totalNetProfit')::numeric, 0) * 100`;

  const metricsQuery = `
    SELECT
      COUNT(*)::int AS strategy_count,
      ROUND(AVG(${pdRatioExpr})::numeric, 2) AS avg_pd_ratio,
      ROUND(AVG((results->>'sharpeRatio')::numeric)::numeric, 2) AS avg_sharpe,
      ROUND(AVG(${winrateMetaExpr})::numeric, 2) AS avg_winrate,
      ROUND(AVG((results->>'profitFactor')::numeric)::numeric, 2) AS avg_profit_factor,
      ROUND(AVG((results->>'recoveryFactor')::numeric)::numeric, 2) AS avg_recovery_factor,
      ROUND(AVG(${ddPctExpr})::numeric, 2) AS avg_drawdown_pct,
      ROUND(AVG((results->>'lrCorrelation')::numeric)::numeric, 3) AS avg_lr_correlation,
      ROUND(AVG(${histQualityExpr})::numeric, 1) AS avg_history_quality,
      ROUND(AVG((results->>'expectedPayoff')::numeric)::numeric, 2) AS avg_expected_payoff,
      ROUND(AVG((results->>'totalNetProfit')::numeric)::numeric, 2) AS avg_total_net_profit,
      ROUND(AVG((results->>'totalTrades')::numeric)::numeric, 1) AS avg_total_trades,
      ROUND(AVG((results->>'largestLossTrade')::numeric)::numeric, 2) AS avg_largest_loss_trade,
      ROUND(AVG(${lptrExpr})::numeric, 2) AS avg_largest_profit_trade_ratio,
      ROUND(AVG(${rrrExpr})::numeric, 2) AS avg_risk_reward_ratio,
      ROUND(AVG(${ddValExpr})::numeric, 2) AS avg_drawdown_val
    FROM strategy_metadata
    ${metadataFilter}
  `;

  let pnlQuery;
  let pnlParams = [];

  if (hasDealTimeFilter) {
    const { whereClause: dealWhere, params: updatedParams } = buildDashboardWhereClause({ startDate, endDate, year, params: pnlParams });
    pnlParams = updatedParams;
    pnlQuery = `
      SELECT
        COALESCE(SUM(CAST(profit AS NUMERIC)) FILTER (
          WHERE LOWER(direction) = 'out' AND CAST(profit AS NUMERIC) > 0
        ), 0) AS gross_profit,
        COALESCE(ABS(SUM(CAST(profit AS NUMERIC)) FILTER (
          WHERE LOWER(direction) = 'out' AND CAST(profit AS NUMERIC) < 0
        )), 0) AS gross_loss,
        COALESCE(SUM(CAST(profit AS NUMERIC)) FILTER (WHERE LOWER(direction) = 'out'), 0) AS net_profit
      FROM ${fromClause}
      ${dealWhere}
    `;
  } else {
    pnlQuery = `
      SELECT
        COALESCE(SUM((results->>'grossProfit')::numeric), 0) AS gross_profit,
        COALESCE(SUM(ABS((results->>'grossLoss')::numeric)), 0) AS gross_loss,
        COALESCE(SUM((results->>'totalNetProfit')::numeric), 0) AS net_profit
      FROM strategy_metadata
      ${metadataFilter}
    `;
    pnlParams = [...metadataParams];
  }

  try {
    const [pnlResult, metricsResult] = await Promise.all([
      pool.query(pnlQuery, pnlParams),
      pool.query(metricsQuery, metadataParams)
    ]);

    const pnlRow = pnlResult.rows[0] || {};
    const metricsRow = metricsResult.rows[0] || {};

    const grossProfit = parseFloat(pnlRow.gross_profit) || 0;
    const grossLoss = parseFloat(pnlRow.gross_loss) || 0;
    const netProfit = parseFloat(pnlRow.net_profit) || 0;
    const totalGross = grossProfit + grossLoss;
    const portfolioProfitFactor = grossLoss > 0 ? grossProfit / grossLoss : null;
    const profitPercent = totalGross > 0 ? (grossProfit / totalGross) * 100 : 0;
    const lossPercent = totalGross > 0 ? (grossLoss / totalGross) * 100 : 0;

    return {
      pnl: {
        grossProfit,
        grossLoss,
        netProfit,
        portfolioProfitFactor: portfolioProfitFactor != null ? parseFloat(portfolioProfitFactor.toFixed(2)) : null,
        profitPercent: parseFloat(profitPercent.toFixed(1)),
        lossPercent: parseFloat(lossPercent.toFixed(1))
      },
      riskMetrics: {
        strategyCount: parseInt(metricsRow.strategy_count, 10) || 0,
        avgPdRatio: metricsRow.avg_pd_ratio != null ? parseFloat(metricsRow.avg_pd_ratio) : null,
        avgSharpe: metricsRow.avg_sharpe != null ? parseFloat(metricsRow.avg_sharpe) : null,
        avgWinrate: metricsRow.avg_winrate != null ? parseFloat(metricsRow.avg_winrate) : null,
        avgProfitFactor: metricsRow.avg_profit_factor != null ? parseFloat(metricsRow.avg_profit_factor) : null,
        avgRecoveryFactor: metricsRow.avg_recovery_factor != null ? parseFloat(metricsRow.avg_recovery_factor) : null,
        avgDrawdownPct: metricsRow.avg_drawdown_pct != null ? parseFloat(metricsRow.avg_drawdown_pct) : null,
        avgLrCorrelation: metricsRow.avg_lr_correlation != null ? parseFloat(metricsRow.avg_lr_correlation) : null,
        avgHistoryQuality: metricsRow.avg_history_quality != null ? parseFloat(metricsRow.avg_history_quality) : null,
        avgExpectedPayoff: metricsRow.avg_expected_payoff != null ? parseFloat(metricsRow.avg_expected_payoff) : null,
        avgTotalNetProfit: metricsRow.avg_total_net_profit != null ? parseFloat(metricsRow.avg_total_net_profit) : null,
        avgTotalTrades: metricsRow.avg_total_trades != null ? parseFloat(metricsRow.avg_total_trades) : null,
        avgLargestLossTrade: metricsRow.avg_largest_loss_trade != null ? parseFloat(metricsRow.avg_largest_loss_trade) : null,
        avgLargestProfitTradeRatio: metricsRow.avg_largest_profit_trade_ratio != null ? parseFloat(metricsRow.avg_largest_profit_trade_ratio) : null,
        avgRiskRewardRatio: metricsRow.avg_risk_reward_ratio != null ? parseFloat(metricsRow.avg_risk_reward_ratio) : null,
        avgDrawdownVal: metricsRow.avg_drawdown_val != null ? parseFloat(metricsRow.avg_drawdown_val) : null
      },
      meta: {
        pnlSource: hasDealTimeFilter ? 'deals' : 'strategy_metadata',
        riskMetricsSource: 'strategy_metadata',
        riskMetricsScope: 'full_backtest_per_strategy'
      }
    };
  } catch (error) {
    console.error('âŒ getDetailedReport error:', error);
    throw error;
  }
};

const FILE_OPTIMIZATION_THRESHOLDS = {
  minProfit: 0,
  minTrades: 100,
  maxLoss: -20000,
  minProfitFactor: 1.0
};

/**
 * File Optimization Check summary from synced strategy_metadata.
 * Group 3 criteria mirror checkFileService defaults (results + OB/OS settings).
 */
const getFileOptimizationSummary = async (
  tableName = 'all_backtests',
  thresholds = FILE_OPTIMIZATION_THRESHOLDS
) => {
  const { validTables } = await resolveTableSubquery(tableName);
  const params = [
    thresholds.minProfit,
    thresholds.minTrades,
    thresholds.maxLoss,
    thresholds.minProfitFactor
  ];

  params.push(validTables);
  const tableFilter = `AND backtest_table = ANY($${params.length}::text[])`;

  const query = `
    WITH scoped AS (
      SELECT
        strategy_id,
        backtest_table,
        settings,
        results,
        CASE
          WHEN COALESCE((results->>'totalNetProfit')::numeric, -1) >= $1
            AND COALESCE((results->>'totalTrades')::numeric, 0) >= $2
            AND COALESCE((results->>'largestLossTrade')::numeric, -999999) >= $3
            AND COALESCE((results->>'profitFactor')::numeric, 0) > $4
            AND (
              (
                UPPER(strategy_id) LIKE '%OB'
                AND (
                  settings->'inputs'->>'AcceptBuy' IN ('true', '1', 'True')
                  OR (settings->'inputs'->'AcceptBuy')::text = 'true'
                )
                AND COALESCE(settings->'inputs'->>'AcceptSell', 'false') IN ('false', '0', 'False')
              )
              OR (
                UPPER(strategy_id) LIKE '%OS'
                AND (
                  settings->'inputs'->>'AcceptSell' IN ('true', '1', 'True')
                  OR (settings->'inputs'->'AcceptSell')::text = 'true'
                )
                AND COALESCE(settings->'inputs'->>'AcceptBuy', 'false') IN ('false', '0', 'False')
              )
              OR settings->'inputs' IS NULL
            )
          THEN TRUE
          ELSE FALSE
        END AS passed
      FROM strategy_metadata
      WHERE 1 = 1
      ${tableFilter}
    )
    SELECT
      COUNT(*)::int AS total_files,
      COUNT(DISTINCT backtest_table)::int AS total_backtests,
      COUNT(*) FILTER (WHERE passed)::int AS passed_files,
      COUNT(*) FILTER (WHERE NOT passed)::int AS failed_files
    FROM scoped
  `;

  try {
    const result = await pool.query(query, params);
    const row = result.rows[0] || {};

    const totalFiles = Number(row.total_files) || 0;
    const passedFiles = Number(row.passed_files) || 0;
    const failedFiles = Number(row.failed_files) || 0;
    const cleanRate = totalFiles > 0 ? Number(((passedFiles / totalFiles) * 100).toFixed(1)) : 100;

    return {
      totalFiles,
      totalBacktests: Number(row.total_backtests) || 0,
      passedFiles,
      failedFiles,
      cleanRate,
      pieData: [
        { name: 'Passed (Clean)', value: passedFiles },
        { name: 'Failed', value: failedFiles }
      ]
    };
  } catch (error) {
    console.error('âŒ getFileOptimizationSummary error:', error);
    throw error;
  }
};

/**
 * âœ… 10. QUALITY DISTRIBUTION OVERVIEW (PF / Sharpe / RF / P/D)
 */
const getQualityDistribution = async (tableName = 'all_backtests', startDate = null, endDate = null) => {
  const { fromClause, validTables } = await resolveTableSubquery(tableName);
  const params = [];
  let query = '';

  if (startDate && endDate) {
    params.push(startDate, endDate);

    query = `
      WITH raw_deals AS (
        SELECT 
          b.strategy_id,
          b.source_table AS backtest_table,
          b.time,
          b.deal,
          b.commission,
          b.swap,
          b.profit
        FROM ${fromClause} b
        INNER JOIN strategy_metadata m 
          ON b.strategy_id = m.strategy_id
          AND b.source_table = m.backtest_table
        WHERE b.type NOT IN ('balance')
          AND b.time::DATE BETWEEN $1::DATE AND $2::DATE
      ),
      backtest_cumulative_profit AS (
        SELECT *,
          SUM(profit + commission + swap) OVER (
            PARTITION BY strategy_id, backtest_table
            ORDER BY deal
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS cumulative_profit
        FROM raw_deals
      ),
      backtest_with_drawdown AS (
        SELECT *,
          GREATEST(
            MAX(cumulative_profit) OVER (
              PARTITION BY strategy_id, backtest_table
              ORDER BY deal
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ), 
            0
          ) - cumulative_profit AS drawdown
        FROM backtest_cumulative_profit
      ),
      strategies_metrics AS (
        SELECT 
          strategy_id,
          backtest_table,
          SUM(profit + commission + swap) AS total_profit,
          MAX(drawdown) AS max_drawdown,
          CASE 
            WHEN SUM(CASE WHEN (profit + commission + swap) < 0 THEN ABS(profit + commission + swap) ELSE 0 END) > 0
            THEN ROUND(
              (
                SUM(CASE WHEN (profit + commission + swap) > 0 THEN (profit + commission + swap) ELSE 0 END) / 
                SUM(CASE WHEN (profit + commission + swap) < 0 THEN ABS(profit + commission + swap) ELSE 0 END)
              )::numeric, 
              2
            )
            ELSE NULL
          END AS profit_factor,
          CASE 
            WHEN STDDEV(profit + commission + swap) > 0
            THEN ROUND(
              (
                (AVG(profit + commission + swap) / STDDEV(profit + commission + swap))
                * SQRT(COUNT(1) / GREATEST(EXTRACT(epoch FROM (MAX(time) - MIN(time))) / 31536000.0, 0.1))
              )::numeric, 
              2
            )
            ELSE 0
          END AS sharpe_ratio,
          CASE 
            WHEN MAX(drawdown) > 0 
            THEN ROUND((SUM(profit + commission + swap) / MAX(drawdown))::numeric, 2)
            ELSE NULL
          END AS recovery_factor,
          COUNT(1) AS total_trades
        FROM backtest_with_drawdown
        GROUP BY strategy_id, backtest_table
      ),
      eligible AS (
        SELECT
          f.total_profit,
          f.max_drawdown,
          f.profit_factor,
          f.sharpe_ratio,
          f.recovery_factor,
          f.total_trades
        FROM strategies_metrics f
        INNER JOIN strategy_metadata m 
          ON f.strategy_id = m.strategy_id 
          AND m.backtest_table = f.backtest_table
      )
      SELECT
        -- Profit Factor tiers
        COUNT(*) FILTER (WHERE profit_factor >= 2.0) AS pf_ge_2,
        COUNT(*) FILTER (WHERE profit_factor >= 1.5 AND profit_factor < 2.0) AS pf_15_20,
        COUNT(*) FILTER (WHERE profit_factor >= 1.2 AND profit_factor < 1.5) AS pf_12_15,
        COUNT(*) FILTER (WHERE profit_factor >= 1.0 AND profit_factor < 1.2) AS pf_10_12,
        COUNT(*) FILTER (WHERE profit_factor < 1.0) AS pf_lt_1,
        COALESCE(AVG(profit_factor), 0) AS pf_avg,

        -- Sharpe Ratio tiers
        COUNT(*) FILTER (WHERE sharpe_ratio >= 3.0) AS sharpe_ge_3,
        COUNT(*) FILTER (WHERE sharpe_ratio >= 2.0 AND sharpe_ratio < 3.0) AS sharpe_20_30,
        COUNT(*) FILTER (WHERE sharpe_ratio >= 1.0 AND sharpe_ratio < 2.0) AS sharpe_10_20,
        COUNT(*) FILTER (WHERE sharpe_ratio >= 0.5 AND sharpe_ratio < 1.0) AS sharpe_05_10,
        COUNT(*) FILTER (WHERE sharpe_ratio < 0.5) AS sharpe_lt_05,
        COALESCE(AVG(sharpe_ratio), 0) AS sharpe_avg,

        -- Recovery Factor tiers
        COUNT(*) FILTER (WHERE recovery_factor >= 5.0) AS rf_ge_5,
        COUNT(*) FILTER (WHERE recovery_factor >= 3.0 AND recovery_factor < 5.0) AS rf_30_50,
        COUNT(*) FILTER (WHERE recovery_factor >= 2.0 AND recovery_factor < 3.0) AS rf_20_30,
        COUNT(*) FILTER (WHERE recovery_factor >= 1.0 AND recovery_factor < 2.0) AS rf_10_20,
        COUNT(*) FILTER (WHERE recovery_factor < 1.0) AS rf_lt_1,
        COALESCE(AVG(recovery_factor), 0) AS rf_avg,

        -- P/D Ratio tiers
        COUNT(*) FILTER (WHERE max_drawdown > 0 AND total_profit / max_drawdown >= 10.0) AS pd_ge_10,
        COUNT(*) FILTER (WHERE max_drawdown > 0 AND total_profit / max_drawdown >= 5.0 AND total_profit / max_drawdown < 10.0) AS pd_5_10,
        COUNT(*) FILTER (WHERE max_drawdown > 0 AND total_profit / max_drawdown >= 2.0 AND total_profit / max_drawdown < 5.0) AS pd_2_5,
        COUNT(*) FILTER (WHERE max_drawdown > 0 AND total_profit / max_drawdown >= 1.0 AND total_profit / max_drawdown < 2.0) AS pd_1_2,
        COUNT(*) FILTER (WHERE max_drawdown = 0 OR total_profit / max_drawdown < 1.0) AS pd_lt_1,
        COALESCE(AVG(CASE WHEN max_drawdown > 0 THEN total_profit / max_drawdown END), 0) AS pd_avg,

        COUNT(*) AS total_count
      FROM eligible
    `;
  } else {
    params.push(validTables);
    const tableFilter = `backtest_table = ANY($1::text[])`;

    const ddValExpr = `regexp_replace(split_part(results->>'balanceDrawdownMaximal', '(', 1), '[^0-9\\.]', '', 'g')::numeric`;
    const pdRatioExpr = `(results->>'totalNetProfit')::numeric / NULLIF(${ddValExpr}, 0)`;

    query = `
      SELECT
        -- Profit Factor tiers
        COUNT(*) FILTER (WHERE (results->>'profitFactor')::numeric >= 2.0) AS pf_ge_2,
        COUNT(*) FILTER (WHERE (results->>'profitFactor')::numeric >= 1.5 AND (results->>'profitFactor')::numeric < 2.0) AS pf_15_20,
        COUNT(*) FILTER (WHERE (results->>'profitFactor')::numeric >= 1.2 AND (results->>'profitFactor')::numeric < 1.5) AS pf_12_15,
        COUNT(*) FILTER (WHERE (results->>'profitFactor')::numeric >= 1.0 AND (results->>'profitFactor')::numeric < 1.2) AS pf_10_12,
        COUNT(*) FILTER (WHERE (results->>'profitFactor')::numeric < 1.0) AS pf_lt_1,
        COALESCE(AVG((results->>'profitFactor')::numeric), 0) AS pf_avg,

        -- Sharpe Ratio tiers
        COUNT(*) FILTER (WHERE (results->>'sharpeRatio')::numeric >= 3.0) AS sharpe_ge_3,
        COUNT(*) FILTER (WHERE (results->>'sharpeRatio')::numeric >= 2.0 AND (results->>'sharpeRatio')::numeric < 3.0) AS sharpe_20_30,
        COUNT(*) FILTER (WHERE (results->>'sharpeRatio')::numeric >= 1.0 AND (results->>'sharpeRatio')::numeric < 2.0) AS sharpe_10_20,
        COUNT(*) FILTER (WHERE (results->>'sharpeRatio')::numeric >= 0.5 AND (results->>'sharpeRatio')::numeric < 1.0) AS sharpe_05_10,
        COUNT(*) FILTER (WHERE (results->>'sharpeRatio')::numeric < 0.5) AS sharpe_lt_05,
        COALESCE(AVG((results->>'sharpeRatio')::numeric), 0) AS sharpe_avg,

        -- Recovery Factor tiers
        COUNT(*) FILTER (WHERE (results->>'recoveryFactor')::numeric >= 5.0) AS rf_ge_5,
        COUNT(*) FILTER (WHERE (results->>'recoveryFactor')::numeric >= 3.0 AND (results->>'recoveryFactor')::numeric < 5.0) AS rf_30_50,
        COUNT(*) FILTER (WHERE (results->>'recoveryFactor')::numeric >= 2.0 AND (results->>'recoveryFactor')::numeric < 3.0) AS rf_20_30,
        COUNT(*) FILTER (WHERE (results->>'recoveryFactor')::numeric >= 1.0 AND (results->>'recoveryFactor')::numeric < 2.0) AS rf_10_20,
        COUNT(*) FILTER (WHERE (results->>'recoveryFactor')::numeric < 1.0) AS rf_lt_1,
        COALESCE(AVG((results->>'recoveryFactor')::numeric), 0) AS rf_avg,

        -- P/D Ratio tiers
        COUNT(*) FILTER (WHERE ${pdRatioExpr} >= 10.0) AS pd_ge_10,
        COUNT(*) FILTER (WHERE ${pdRatioExpr} >= 5.0 AND ${pdRatioExpr} < 10.0) AS pd_5_10,
        COUNT(*) FILTER (WHERE ${pdRatioExpr} >= 2.0 AND ${pdRatioExpr} < 5.0) AS pd_2_5,
        COUNT(*) FILTER (WHERE ${pdRatioExpr} >= 1.0 AND ${pdRatioExpr} < 2.0) AS pd_1_2,
        COUNT(*) FILTER (WHERE ${pdRatioExpr} < 1.0) AS pd_lt_1,
        COALESCE(AVG(${pdRatioExpr}), 0) AS pd_avg,

        COUNT(*) AS total_count
      FROM strategy_metadata
      WHERE ${tableFilter}
    `;
  }

  try {
    const result = await pool.query(query, params);
    const row = result.rows[0] || {};
    const total = parseInt(row.total_count) || 0;

    const getMetricMax = (...vals) => Math.max(...vals, 1);

    const pfMax = getMetricMax(
      parseInt(row.pf_ge_2),
      parseInt(row.pf_15_20),
      parseInt(row.pf_12_15),
      parseInt(row.pf_10_12),
      parseInt(row.pf_lt_1)
    );

    const sharpeMax = getMetricMax(
      parseInt(row.sharpe_ge_3),
      parseInt(row.sharpe_20_30),
      parseInt(row.sharpe_10_20),
      parseInt(row.sharpe_05_10),
      parseInt(row.sharpe_lt_05)
    );

    const rfMax = getMetricMax(
      parseInt(row.rf_ge_5),
      parseInt(row.rf_30_50),
      parseInt(row.rf_20_30),
      parseInt(row.rf_10_20),
      parseInt(row.rf_lt_1)
    );

    const pdMax = getMetricMax(
      parseInt(row.pd_ge_10),
      parseInt(row.pd_5_10),
      parseInt(row.pd_2_5),
      parseInt(row.pd_1_2),
      parseInt(row.pd_lt_1)
    );

    const totalSharpeGe1 = (parseInt(row.sharpe_ge_3) || 0) + (parseInt(row.sharpe_20_30) || 0) + (parseInt(row.sharpe_10_20) || 0);
    const sharpeGe1Pct = total > 0 ? Math.round((totalSharpeGe1 / total) * 100) : 0;

    const totalRfGe3 = (parseInt(row.rf_ge_5) || 0) + (parseInt(row.rf_30_50) || 0);
    const rfGe3Pct = total > 0 ? Math.round((totalRfGe3 / total) * 100) : 0;

return [
      {
        label: 'Profit factor',
        avg: parseFloat(row.pf_avg).toFixed(2),
        avgNote: 'Avg',
        tiers: [
          { l: '≥ 2.0', v: parseInt(row.pf_ge_2) || 0, max: pfMax, c: '#0F6E56' },
          { l: '1.5–2.0', v: parseInt(row.pf_15_20) || 0, max: pfMax, c: '#1D9E75' },
          { l: '1.2–1.5', v: parseInt(row.pf_12_15) || 0, max: pfMax, c: '#B5D4F4' },
          { l: '1.0–1.2', v: parseInt(row.pf_10_12) || 0, max: pfMax, c: '#EF9F27' },
          { l: '< 1.0', v: parseInt(row.pf_lt_1) || 0, max: pfMax, c: '#E24B4A' }
        ],
        note: `${parseInt(row.pf_10_12) || 0} biên mỏng`,
        noteType: 'nwarn'
      },
      {
        label: 'Sharpe ratio',
        avg: parseFloat(row.sharpe_avg).toFixed(2),
        avgNote: '↑↑ HF target',
        tiers: [
          { l: '≥ 3.0', v: parseInt(row.sharpe_ge_3) || 0, max: sharpeMax, c: '#0F6E56' },
          { l: '2.0–3.0', v: parseInt(row.sharpe_20_30) || 0, max: sharpeMax, c: '#1D9E75' },
          { l: '1.0–2.0', v: parseInt(row.sharpe_10_20) || 0, max: sharpeMax, c: '#B5D4F4' },
          { l: '0.5–1.0', v: parseInt(row.sharpe_05_10) || 0, max: sharpeMax, c: '#EF9F27' },
          { l: '< 0.5', v: parseInt(row.sharpe_lt_05) || 0, max: sharpeMax, c: '#E24B4A' }
        ],
        note: `${sharpeGe1Pct}% Sharpe ≥ 1.0`,
        noteType: 'nok'
      },
      {
        label: 'Recovery factor',
        avg: parseFloat(row.rf_avg).toFixed(2),
        avgNote: `${rfGe3Pct}% RF ≥ 3`,
        tiers: [
          { l: '≥ 5.0', v: parseInt(row.rf_ge_5) || 0, max: rfMax, c: '#0F6E56' },
          { l: '3.0–5.0', v: parseInt(row.rf_30_50) || 0, max: rfMax, c: '#1D9E75' },
          { l: '2.0–3.0', v: parseInt(row.rf_20_30) || 0, max: rfMax, c: '#B5D4F4' },
          { l: '1.0–2.0', v: parseInt(row.rf_10_20) || 0, max: rfMax, c: '#EF9F27' },
          { l: '< 1.0', v: parseInt(row.rf_lt_1) || 0, max: rfMax, c: '#E24B4A' }
        ],
        note: `${parseInt(row.rf_lt_1) || 0} RF < 1 → loại`,
        noteType: 'nwarn'
      },
      {
        label: 'P/D ratio',
        avg: parseFloat(row.pd_avg).toFixed(2),
        avgNote: 'Median 2.93',
        tiers: [
          { l: '≥ 10', v: parseInt(row.pd_ge_10) || 0, max: pdMax, c: '#0F6E56' },
          { l: '5–10', v: parseInt(row.pd_5_10) || 0, max: pdMax, c: '#1D9E75' },
          { l: '2–5', v: parseInt(row.pd_2_5) || 0, max: pdMax, c: '#B5D4F4' },
          { l: '1–2', v: parseInt(row.pd_1_2) || 0, max: pdMax, c: '#EF9F27' },
          { l: '< 1', v: parseInt(row.pd_lt_1) || 0, max: pdMax, c: '#E24B4A' }
        ],
        note: `${parseInt(row.pd_lt_1) || 0} P/D < 1 → Risk tab`,
        noteType: 'nbad'
      }
    ];
  } catch (error) {
    console.error('❌ getQualityDistribution error:', error);
    throw error;
  }
};

const buildMetadataFilter = (tableName, startDate = null, endDate = null, alias = 'm', fromClause = null) => {
  const selectedTables = Array.isArray(tableName)
    ? tableName.filter(Boolean)
    : (tableName && tableName !== 'all_backtests' ? [tableName] : []);
  const isAllBacktest = selectedTables.length === 0;
  const params = [];
  const clauses = [];

  if (!isAllBacktest) {
    params.push(selectedTables);
    clauses.push(`${alias}.backtest_table = ANY($${params.length}::text[])`);
  }

  if (startDate && endDate) {
    params.push(startDate, endDate);
    const dateStartIdx = params.length - 1;
    const dateEndIdx = params.length;
    const tableMatch = isAllBacktest ? '' : `AND d.source_table = ${alias}.backtest_table`;
    const dealSource = fromClause;
    if (!dealSource) {
      throw new Error('Missing resolved data source for metadata filter');
    }
    clauses.push(`EXISTS (
      SELECT 1 FROM ${dealSource} d
      WHERE d.strategy_id = ${alias}.strategy_id
        ${tableMatch}
        AND d.type != 'balance'
        AND d.time::DATE BETWEEN $${dateStartIdx}::DATE AND $${dateEndIdx}::DATE
    )`);
  }

  return {
    clause: clauses.length > 0 ? `AND ${clauses.join(' AND ')}` : '',
    params
  };
};

/**
 * Comparative ranking â€” raw strategy rows (P/D, composite inputs).
 */
const getComparativeRankingRawData = async (tableName = 'all_backtests', startDate = null, endDate = null) => {
  const { fromClause, validTables } = await resolveTableSubquery(tableName);
  const params = [];
  let query = '';

  if (startDate && endDate) {
    params.push(startDate, endDate);

    query = `
      WITH strategy_bounds AS (
        SELECT
          b.strategy_id,
          b.source_table AS backtest_table,
          MIN(b.time)::DATE AS full_start_date,
          MAX(b.time)::DATE AS full_end_date
        FROM ${fromClause} b
        WHERE b.type NOT IN ('balance')
        GROUP BY b.strategy_id, b.source_table
      ),
      raw_deals AS (
        SELECT 
          b.strategy_id,
          b.source_table AS backtest_table,
          b.time,
          b.deal,
          b.direction,
          b.commission,
          b.swap,
          b.profit
        FROM ${fromClause} b
        INNER JOIN strategy_metadata m 
          ON b.strategy_id = m.strategy_id
          AND b.source_table = m.backtest_table
        WHERE b.type NOT IN ('balance')
          AND b.time::DATE BETWEEN $1::DATE AND $2::DATE
      ),
      backtest_cumulative_profit AS (
        SELECT *,
          SUM(profit + commission + swap) OVER (
            PARTITION BY strategy_id, backtest_table
            ORDER BY deal
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS cumulative_profit
        FROM raw_deals
      ),
      backtest_with_drawdown AS (
        SELECT *,
          GREATEST(
            MAX(cumulative_profit) OVER (
              PARTITION BY strategy_id, backtest_table
              ORDER BY deal
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ), 
            0
          ) - cumulative_profit AS drawdown
        FROM backtest_cumulative_profit
      ),
      strategies_metrics AS (
        SELECT 
          strategy_id,
          backtest_table,
          SUM(profit + commission + swap) AS total_net_profit,
          SUM(CASE WHEN (profit + commission + swap) > 0 THEN (profit + commission + swap) ELSE 0 END) AS gross_profit,
          SUM(CASE WHEN (profit + commission + swap) < 0 THEN ABS(profit + commission + swap) ELSE 0 END) AS gross_loss,
          MAX(drawdown) AS drawdown_value,
          COUNT(1) FILTER (
            WHERE LOWER(COALESCE(direction, '')) IN ('out', 'out by')
          ) AS total_trades,
          CASE 
            WHEN SUM(CASE WHEN (profit + commission + swap) < 0 THEN ABS(profit + commission + swap) ELSE 0 END) > 0
            THEN ROUND(
              (
                SUM(CASE WHEN (profit + commission + swap) > 0 THEN (profit + commission + swap) ELSE 0 END) / 
                SUM(CASE WHEN (profit + commission + swap) < 0 THEN ABS(profit + commission + swap) ELSE 0 END)
              )::numeric, 
              2
            )
            ELSE NULL
          END AS profit_factor,
          CASE 
            WHEN STDDEV(profit + commission + swap) > 0
            THEN ROUND(
              (
                (AVG(profit + commission + swap) / STDDEV(profit + commission + swap))
                * SQRT(COUNT(1) / GREATEST(EXTRACT(epoch FROM (MAX(time) - MIN(time))) / 31536000.0, 0.1))
              )::numeric, 
              2
            )
            ELSE 0
          END AS sharpe_ratio,
          CASE 
            WHEN MAX(drawdown) > 0 
            THEN ROUND((SUM(profit + commission + swap) / MAX(drawdown))::numeric, 2)
            ELSE NULL
          END AS recovery_factor,
          COALESCE(ROUND(corr(cumulative_profit, deal)::numeric, 4), 1.0) AS lr_correlation,
          MAX(profit + commission + swap) AS largest_profit_trade,
          AVG(CASE WHEN (profit + commission + swap) > 0 THEN (profit + commission + swap) END) AS average_profit_trade,
          AVG(CASE WHEN (profit + commission + swap) < 0 THEN ABS(profit + commission + swap) END) AS average_loss_trade
        FROM backtest_with_drawdown
        GROUP BY strategy_id, backtest_table
      ),
      metrics_with_scope AS (
        SELECT
          f.*,
          ($1::DATE <= b.full_start_date AND $2::DATE >= b.full_end_date) AS is_full_period
        FROM strategies_metrics f
        INNER JOIN strategy_bounds b
          ON b.strategy_id = f.strategy_id
         AND b.backtest_table = f.backtest_table
      ),
      eligible AS (
        SELECT
          f.strategy_id,
          f.backtest_table,
          m.symbol,
          m.timeframe,
          CASE WHEN f.is_full_period THEN (m.results->>'totalNetProfit')::numeric ELSE f.total_net_profit END AS total_net_profit,
          CASE WHEN f.is_full_period THEN (m.results->>'grossProfit')::numeric ELSE f.gross_profit END AS gross_profit,
          CASE WHEN f.is_full_period THEN (m.results->>'grossLoss')::numeric ELSE f.gross_loss END AS gross_loss,
          CASE
            WHEN f.is_full_period THEN (m.results->>'expectedPayoff')::numeric
            ELSE COALESCE(f.total_net_profit / NULLIF(f.total_trades, 0), 0)
          END AS expected_payoff,
          CASE WHEN f.is_full_period THEN (m.results->>'sharpeRatio')::numeric ELSE f.sharpe_ratio END AS sharpe_ratio,
          CASE WHEN f.is_full_period THEN (m.results->>'profitFactor')::numeric ELSE f.profit_factor END AS profit_factor,
          CASE WHEN f.is_full_period THEN (m.results->>'recoveryFactor')::numeric ELSE f.recovery_factor END AS recovery_factor,
          CASE WHEN f.is_full_period THEN (m.results->>'lrCorrelation')::numeric ELSE f.lr_correlation END AS lr_correlation,
          CASE WHEN f.is_full_period THEN (m.results->>'largestProfitTrade')::numeric ELSE f.largest_profit_trade END AS largest_profit_trade,
          CASE WHEN f.is_full_period THEN (m.results->>'averageProfitTrade')::numeric ELSE f.average_profit_trade END AS average_profit_trade,
          CASE WHEN f.is_full_period THEN ABS((m.results->>'averageLossTrade')::numeric) ELSE f.average_loss_trade END AS average_loss_trade,
          -- Fallback static values for consecutive metrics
          NULLIF(REGEXP_REPLACE(m.results->>'maxConsecutiveWins', '[^0-9].*$', ''), '')::int AS max_consecutive_wins,
          NULLIF(REGEXP_REPLACE(m.results->>'maxConsecutiveLosses', '[^0-9].*$', ''), '')::int AS max_consecutive_losses,
          CASE
            WHEN f.is_full_period
              THEN CAST(SUBSTRING(m.results->>'balanceDrawdownMaximal' FROM '\\(([0-9.]+)%\\)') AS numeric)
            ELSE COALESCE(f.drawdown_value / NULLIF(COALESCE((m.settings->'inputs'->>'initialDeposit')::numeric, (m.settings->'inputs'->>'InitialDeposit')::numeric, 10000), 0) * 100, 0)
          END AS drawdown_pct,
          CASE
            WHEN f.is_full_period
              THEN regexp_replace(split_part(m.results->>'balanceDrawdownMaximal', '(', 1), '[^0-9\\.]', '', 'g')::numeric
            ELSE f.drawdown_value
          END AS drawdown_value,
          CASE WHEN f.is_full_period THEN (m.results->>'totalTrades')::numeric ELSE f.total_trades END AS total_trades
        FROM metrics_with_scope f
        INNER JOIN strategy_metadata m ON f.strategy_id = m.strategy_id AND m.backtest_table = f.backtest_table
      )
      SELECT
        strategy_id,
        backtest_table,
        symbol,
        timeframe,
        total_net_profit,
        gross_profit,
        gross_loss,
        expected_payoff,
        sharpe_ratio,
        profit_factor,
        recovery_factor,
        lr_correlation,
        largest_profit_trade,
        average_profit_trade,
        average_loss_trade,
        max_consecutive_wins,
        max_consecutive_losses,
        drawdown_pct,
        total_trades,
        CASE
          WHEN drawdown_value > 0 THEN total_net_profit / drawdown_value
          ELSE NULL
        END AS pd_ratio
      FROM eligible
      ORDER BY strategy_id;
    `;
  } else {
    const { clause, params: filterParams } = buildMetadataFilter(tableName, startDate, endDate, 'm', fromClause);
    params.push(...filterParams);

    query = `
      WITH eligible AS (
        SELECT
          m.strategy_id,
          m.backtest_table,
          m.symbol,
          m.timeframe,
          (m.results->>'totalNetProfit')::numeric AS total_net_profit,
          (m.results->>'grossProfit')::numeric AS gross_profit,
          (m.results->>'grossLoss')::numeric AS gross_loss,
          (m.results->>'expectedPayoff')::numeric AS expected_payoff,
          (m.results->>'sharpeRatio')::numeric AS sharpe_ratio,
          (m.results->>'profitFactor')::numeric AS profit_factor,
          (m.results->>'recoveryFactor')::numeric AS recovery_factor,
          (m.results->>'lrCorrelation')::numeric AS lr_correlation,
          (m.results->>'largestProfitTrade')::numeric AS largest_profit_trade,
          (m.results->>'averageProfitTrade')::numeric AS average_profit_trade,
          (m.results->>'averageLossTrade')::numeric AS average_loss_trade,
          NULLIF(REGEXP_REPLACE(m.results->>'maxConsecutiveWins', '[^0-9].*$', ''), '')::int AS max_consecutive_wins,
          NULLIF(REGEXP_REPLACE(m.results->>'maxConsecutiveLosses', '[^0-9].*$', ''), '')::int AS max_consecutive_losses,
          CAST(SUBSTRING(m.results->>'balanceDrawdownMaximal' FROM '\\(([0-9.]+)%\\)') AS numeric) AS drawdown_pct,
          regexp_replace(split_part(m.results->>'balanceDrawdownMaximal', '(', 1), '[^0-9\\.]', '', 'g')::numeric AS drawdown_value,
          (m.results->>'totalTrades')::numeric AS total_trades
        FROM strategy_metadata m
        WHERE 1 = 1
        ${clause}
      )
      SELECT
        strategy_id,
        backtest_table,
        symbol,
        timeframe,
        total_net_profit,
        gross_profit,
        gross_loss,
        expected_payoff,
        sharpe_ratio,
        profit_factor,
        recovery_factor,
        lr_correlation,
        largest_profit_trade,
        average_profit_trade,
        average_loss_trade,
        max_consecutive_wins,
        max_consecutive_losses,
        drawdown_pct,
        total_trades,
        CASE
          WHEN drawdown_value > 0 THEN total_net_profit / drawdown_value
          ELSE NULL
        END AS pd_ratio
      FROM eligible
      ORDER BY strategy_id;
    `;
  }

  try {
    const result = await pool.query(query, params);
    return result.rows || [];
  } catch (error) {
    console.error('âŒ getComparativeRankingRawData error:', error);
    throw error;
  }
};

/**
 * H1 vs H4 duel metrics per symbol (Breakdown card).
 */
const getTimeframeDuelData = async (tableName = 'all_backtests', startDate = null, endDate = null) => {
  const { fromClause, validTables } = await resolveTableSubquery(tableName);
  const params = [];
  let query = '';

  if (startDate && endDate) {
    params.push(startDate, endDate);

    query = `
      WITH raw_deals AS (
        SELECT 
          b.strategy_id,
          b.source_table AS backtest_table,
          b.time,
          b.deal,
          b.commission,
          b.swap,
          b.profit
        FROM ${fromClause} b
        INNER JOIN strategy_metadata m 
          ON b.strategy_id = m.strategy_id
          AND b.source_table = m.backtest_table
        WHERE b.type NOT IN ('balance')
          AND b.time::DATE BETWEEN $1::DATE AND $2::DATE
      ),
      backtest_cumulative_profit AS (
        SELECT *,
          SUM(profit + commission + swap) OVER (
            PARTITION BY strategy_id, backtest_table
            ORDER BY deal
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS cumulative_profit
        FROM raw_deals
      ),
      backtest_with_drawdown AS (
        SELECT *,
          GREATEST(
            MAX(cumulative_profit) OVER (
              PARTITION BY strategy_id, backtest_table
              ORDER BY deal
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ), 
            0
          ) - cumulative_profit AS drawdown
        FROM backtest_cumulative_profit
      ),
      strategies_metrics AS (
        SELECT 
          strategy_id,
          backtest_table,
          SUM(profit + commission + swap) AS total_net_profit,
          MAX(drawdown) AS drawdown_value,
          COUNT(1) AS total_trades,
          CASE 
            WHEN SUM(CASE WHEN (profit + commission + swap) < 0 THEN ABS(profit + commission + swap) ELSE 0 END) > 0
            THEN ROUND(
              (
                SUM(CASE WHEN (profit + commission + swap) > 0 THEN (profit + commission + swap) ELSE 0 END) / 
                SUM(CASE WHEN (profit + commission + swap) < 0 THEN ABS(profit + commission + swap) ELSE 0 END)
              )::numeric, 
              2
            )
            ELSE NULL
          END AS profit_factor,
          CASE 
            WHEN STDDEV(profit + commission + swap) > 0
            THEN ROUND(
              (
                (AVG(profit + commission + swap) / STDDEV(profit + commission + swap))
                * SQRT(COUNT(1) / GREATEST(EXTRACT(epoch FROM (MAX(time) - MIN(time))) / 31536000.0, 0.1))
              )::numeric, 
              2
            )
            ELSE 0
          END AS sharpe_ratio
        FROM backtest_with_drawdown
        GROUP BY strategy_id, backtest_table
      ),
      eligible AS (
        SELECT
          m.symbol,
          m.timeframe,
          f.total_net_profit,
          f.sharpe_ratio,
          f.profit_factor,
          COALESCE(f.drawdown_value / NULLIF(COALESCE((m.settings->'inputs'->>'initialDeposit')::numeric, (m.settings->'inputs'->>'InitialDeposit')::numeric, 10000), 0) * 100, 0) AS drawdown_pct,
          f.drawdown_value
        FROM strategies_metrics f
        INNER JOIN strategy_metadata m ON f.strategy_id = m.strategy_id AND m.backtest_table = f.backtest_table
      )
      SELECT
        symbol,
        AVG(CASE WHEN UPPER(timeframe) = 'H1' THEN total_net_profit END)::numeric AS h1_profit,
        AVG(CASE WHEN UPPER(timeframe) = 'H1' THEN sharpe_ratio END)::numeric AS h1_sharpe,
        AVG(CASE WHEN UPPER(timeframe) = 'H1' THEN profit_factor END)::numeric AS h1_pf,
        AVG(CASE WHEN UPPER(timeframe) = 'H1' THEN drawdown_pct END)::numeric AS h1_dd,
        AVG(
          CASE
            WHEN UPPER(timeframe) = 'H1' AND drawdown_value > 0 THEN total_net_profit / drawdown_value
          END
        )::numeric AS h1_pd,
        AVG(CASE WHEN UPPER(timeframe) = 'H4' THEN total_net_profit END)::numeric AS h4_profit,
        AVG(CASE WHEN UPPER(timeframe) = 'H4' THEN sharpe_ratio END)::numeric AS h4_sharpe,
        AVG(CASE WHEN UPPER(timeframe) = 'H4' THEN profit_factor END)::numeric AS h4_pf,
        AVG(CASE WHEN UPPER(timeframe) = 'H4' THEN drawdown_pct END)::numeric AS h4_dd,
        AVG(
          CASE
            WHEN UPPER(timeframe) = 'H4' AND drawdown_value > 0 THEN total_net_profit / drawdown_value
          END
        )::numeric AS h4_pd
      FROM eligible
      GROUP BY symbol
      HAVING COUNT(*) FILTER (WHERE UPPER(timeframe) = 'H1') > 0
         AND COUNT(*) FILTER (WHERE UPPER(timeframe) = 'H4') > 0
      ORDER BY symbol;
    `;
  } else {
    const { clause, params: filterParams } = buildMetadataFilter(tableName, startDate, endDate, 'm', fromClause);
    params.push(...filterParams);

    query = `
      WITH eligible AS (
        SELECT
          m.symbol,
          m.timeframe,
          (m.results->>'totalNetProfit')::numeric AS total_net_profit,
          (m.results->>'sharpeRatio')::numeric AS sharpe_ratio,
          (m.results->>'profitFactor')::numeric AS profit_factor,
          CAST(SUBSTRING(m.results->>'balanceDrawdownMaximal' FROM '\\(([0-9.]+)%\\)') AS numeric) AS drawdown_pct,
          regexp_replace(split_part(m.results->>'balanceDrawdownMaximal', '(', 1), '[^0-9\\.]', '', 'g')::numeric AS drawdown_value
        FROM strategy_metadata m
        WHERE 1 = 1
        ${clause}
      )
      SELECT
        symbol,
        AVG(CASE WHEN UPPER(timeframe) = 'H1' THEN total_net_profit END)::numeric AS h1_profit,
        AVG(CASE WHEN UPPER(timeframe) = 'H1' THEN sharpe_ratio END)::numeric AS h1_sharpe,
        AVG(CASE WHEN UPPER(timeframe) = 'H1' THEN profit_factor END)::numeric AS h1_pf,
        AVG(CASE WHEN UPPER(timeframe) = 'H1' THEN drawdown_pct END)::numeric AS h1_dd,
        AVG(
          CASE
            WHEN UPPER(timeframe) = 'H1' AND drawdown_value > 0 THEN total_net_profit / drawdown_value
          END
        )::numeric AS h1_pd,
        AVG(CASE WHEN UPPER(timeframe) = 'H4' THEN total_net_profit END)::numeric AS h4_profit,
        AVG(CASE WHEN UPPER(timeframe) = 'H4' THEN sharpe_ratio END)::numeric AS h4_sharpe,
        AVG(CASE WHEN UPPER(timeframe) = 'H4' THEN profit_factor END)::numeric AS h4_pf,
        AVG(CASE WHEN UPPER(timeframe) = 'H4' THEN drawdown_pct END)::numeric AS h4_dd,
        AVG(
          CASE
            WHEN UPPER(timeframe) = 'H4' AND drawdown_value > 0 THEN total_net_profit / drawdown_value
          END
        )::numeric AS h4_pd
      FROM eligible
      GROUP BY symbol
      HAVING COUNT(*) FILTER (WHERE UPPER(timeframe) = 'H1') > 0
         AND COUNT(*) FILTER (WHERE UPPER(timeframe) = 'H4') > 0
      ORDER BY symbol;
    `;
  }

  try {
    const result = await pool.query(query, params);
    return result.rows || [];
  } catch (error) {
    console.error('âŒ getTimeframeDuelData error:', error);
    throw error;
  }
};

/**
 * Symbol-level averages for Symbol Ranking card.
 */
const getSymbolAverageData = async (tableName = 'all_backtests', startDate = null, endDate = null) => {
  const { fromClause } = await resolveTableSubquery(tableName);
  const params = [];
  let query = '';

  if (startDate && endDate) {
    params.push(startDate, endDate);

    query = `
      WITH raw_deals AS (
        SELECT 
          b.strategy_id,
          b.source_table AS backtest_table,
          b.time,
          b.deal,
          b.commission,
          b.swap,
          b.profit
        FROM ${fromClause} b
        INNER JOIN strategy_metadata m 
          ON b.strategy_id = m.strategy_id
          AND b.source_table = m.backtest_table
        WHERE b.type NOT IN ('balance')
          AND b.time::DATE BETWEEN $1::DATE AND $2::DATE
      ),
      backtest_cumulative_profit AS (
        SELECT *,
          SUM(profit + commission + swap) OVER (
            PARTITION BY strategy_id, backtest_table
            ORDER BY deal
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS cumulative_profit
        FROM raw_deals
      ),
      backtest_with_drawdown AS (
        SELECT *,
          GREATEST(
            MAX(cumulative_profit) OVER (
              PARTITION BY strategy_id, backtest_table
              ORDER BY deal
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ), 
            0
          ) - cumulative_profit AS drawdown
        FROM backtest_cumulative_profit
      ),
      strategies_metrics AS (
        SELECT 
          strategy_id,
          backtest_table,
          SUM(profit + commission + swap) AS total_net_profit,
          MAX(drawdown) AS drawdown_value,
          COUNT(1) AS total_trades,
          CASE 
            WHEN SUM(CASE WHEN (profit + commission + swap) < 0 THEN ABS(profit + commission + swap) ELSE 0 END) > 0
            THEN ROUND(
              (
                SUM(CASE WHEN (profit + commission + swap) > 0 THEN (profit + commission + swap) ELSE 0 END) / 
                SUM(CASE WHEN (profit + commission + swap) < 0 THEN ABS(profit + commission + swap) ELSE 0 END)
              )::numeric, 
              2
            )
            ELSE NULL
          END AS profit_factor,
          CASE 
            WHEN STDDEV(profit + commission + swap) > 0
            THEN ROUND(
              (
                (AVG(profit + commission + swap) / STDDEV(profit + commission + swap))
                * SQRT(COUNT(1) / GREATEST(EXTRACT(epoch FROM (MAX(time) - MIN(time))) / 31536000.0, 0.1))
              )::numeric, 
              2
            )
            ELSE 0
          END AS sharpe_ratio,
          CASE 
            WHEN MAX(drawdown) > 0 
            THEN ROUND((SUM(profit + commission + swap) / MAX(drawdown))::numeric, 2)
            ELSE NULL
          END AS recovery_factor
        FROM backtest_with_drawdown
        GROUP BY strategy_id, backtest_table
      ),
      eligible AS (
        SELECT
          m.symbol,
          f.total_net_profit,
          f.sharpe_ratio,
          f.profit_factor,
          f.recovery_factor,
          COALESCE(f.drawdown_value / NULLIF(COALESCE((m.settings->'inputs'->>'initialDeposit')::numeric, (m.settings->'inputs'->>'InitialDeposit')::numeric, 10000), 0) * 100, 0) AS drawdown_pct,
          f.drawdown_value
        FROM strategies_metrics f
        INNER JOIN strategy_metadata m ON f.strategy_id = m.strategy_id AND m.backtest_table = f.backtest_table
      )
      SELECT
        symbol,
        AVG(total_net_profit)::numeric AS avg_profit,
        AVG(sharpe_ratio)::numeric AS avg_sharpe,
        AVG(profit_factor)::numeric AS avg_pf,
        AVG(recovery_factor)::numeric AS avg_rf,
        AVG(CASE WHEN drawdown_value > 0 THEN total_net_profit / drawdown_value END)::numeric AS avg_pd,
        AVG(drawdown_pct)::numeric AS avg_drawdown_pct,
        COUNT(*)::int AS strategy_count
      FROM eligible
      GROUP BY symbol
      ORDER BY avg_profit DESC NULLS LAST, symbol;
    `;
  } else {
    const { clause, params: filterParams } = buildMetadataFilter(tableName, startDate, endDate, 'm', fromClause);
    params.push(...filterParams);

    query = `
      WITH eligible AS (
        SELECT
          m.symbol,
          (m.results->>'totalNetProfit')::numeric AS total_net_profit,
          (m.results->>'sharpeRatio')::numeric AS sharpe_ratio,
          (m.results->>'profitFactor')::numeric AS profit_factor,
          (m.results->>'recoveryFactor')::numeric AS recovery_factor,
          CAST(SUBSTRING(m.results->>'balanceDrawdownMaximal' FROM '\\(([0-9.]+)%\\)') AS numeric) AS drawdown_pct,
          regexp_replace(split_part(m.results->>'balanceDrawdownMaximal', '(', 1), '[^0-9\\.]', '', 'g')::numeric AS drawdown_value
        FROM strategy_metadata m
        WHERE 1 = 1
        ${clause}
      )
      SELECT
        symbol,
        AVG(total_net_profit)::numeric AS avg_profit,
        AVG(sharpe_ratio)::numeric AS avg_sharpe,
        AVG(profit_factor)::numeric AS avg_pf,
        AVG(recovery_factor)::numeric AS avg_rf,
        AVG(CASE WHEN drawdown_value > 0 THEN total_net_profit / drawdown_value END)::numeric AS avg_pd,
        AVG(drawdown_pct)::numeric AS avg_drawdown_pct,
        COUNT(*)::int AS strategy_count
      FROM eligible
      GROUP BY symbol
      ORDER BY avg_profit DESC NULLS LAST, symbol;
    `;
  }

  try {
    const result = await pool.query(query, params);
    return result.rows || [];
  } catch (error) {
    console.error('âŒ getSymbolAverageData error:', error);
    throw error;
  }
};

/**
 * OB vs OS averages per symbol (Breakdown card).
 */
const getObOsAverageData = async (tableName = 'all_backtests', startDate = null, endDate = null) => {
  const { fromClause } = await resolveTableSubquery(tableName);
  const params = [];
  let query = '';

  if (startDate && endDate) {
    params.push(startDate, endDate);

    query = `
      WITH raw_deals AS (
        SELECT 
          b.strategy_id,
          b.source_table AS backtest_table,
          b.time,
          b.deal,
          b.commission,
          b.swap,
          b.profit
        FROM ${fromClause} b
        INNER JOIN strategy_metadata m 
          ON b.strategy_id = m.strategy_id
          AND b.source_table = m.backtest_table
        WHERE b.type NOT IN ('balance')
          AND b.time::DATE BETWEEN $1::DATE AND $2::DATE
      ),
      backtest_cumulative_profit AS (
        SELECT *,
          SUM(profit + commission + swap) OVER (
            PARTITION BY strategy_id, backtest_table
            ORDER BY deal
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS cumulative_profit
        FROM raw_deals
      ),
      backtest_with_drawdown AS (
        SELECT *,
          GREATEST(
            MAX(cumulative_profit) OVER (
              PARTITION BY strategy_id, backtest_table
              ORDER BY deal
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ), 
            0
          ) - cumulative_profit AS drawdown
        FROM backtest_cumulative_profit
      ),
      strategies_metrics AS (
        SELECT 
          strategy_id,
          backtest_table,
          SUM(profit + commission + swap) AS total_net_profit,
          MAX(drawdown) AS drawdown_value,
          COUNT(1) AS total_trades,
          ROUND(
            COUNT(CASE WHEN (profit + commission + swap) > 0 THEN 1 END)::numeric / 
            NULLIF(COUNT(1), 0) * 100, 
            2
          ) AS winrate_pct,
          CASE 
            WHEN SUM(CASE WHEN (profit + commission + swap) < 0 THEN ABS(profit + commission + swap) ELSE 0 END) > 0
            THEN ROUND(
              (
                SUM(CASE WHEN (profit + commission + swap) > 0 THEN (profit + commission + swap) ELSE 0 END) / 
                SUM(CASE WHEN (profit + commission + swap) < 0 THEN ABS(profit + commission + swap) ELSE 0 END)
              )::numeric, 
              2
            )
            ELSE NULL
          END AS profit_factor,
          CASE 
            WHEN STDDEV(profit + commission + swap) > 0
            THEN ROUND(
              (
                (AVG(profit + commission + swap) / STDDEV(profit + commission + swap))
                * SQRT(COUNT(1) / GREATEST(EXTRACT(epoch FROM (MAX(time) - MIN(time))) / 31536000.0, 0.1))
              )::numeric, 
              2
            )
            ELSE 0
          END AS sharpe_ratio
        FROM backtest_with_drawdown
        GROUP BY strategy_id, backtest_table
      ),
      eligible AS (
        SELECT
          m.symbol,
          CASE
            WHEN UPPER(m.strategy_id) LIKE '%OB' THEN 'OB'
            WHEN UPPER(m.strategy_id) LIKE '%OS' THEN 'OS'
            ELSE 'UNKNOWN'
          END AS direction,
          f.total_net_profit,
          f.sharpe_ratio,
          f.profit_factor,
          f.total_trades,
          f.winrate_pct
        FROM strategies_metrics f
        INNER JOIN strategy_metadata m ON f.strategy_id = m.strategy_id AND m.backtest_table = f.backtest_table
      )
      SELECT
        symbol,
        AVG(CASE WHEN direction = 'OB' THEN total_net_profit END)::numeric AS ob_avg_profit,
        AVG(CASE WHEN direction = 'OS' THEN total_net_profit END)::numeric AS os_avg_profit,
        AVG(CASE WHEN direction = 'OB' THEN winrate_pct END)::numeric AS ob_avg_winrate,
        AVG(CASE WHEN direction = 'OS' THEN winrate_pct END)::numeric AS os_avg_winrate,
        AVG(CASE WHEN direction = 'OB' THEN total_trades END)::numeric AS ob_avg_trades,
        AVG(CASE WHEN direction = 'OS' THEN total_trades END)::numeric AS os_avg_trades,
        AVG(CASE WHEN direction = 'OB' THEN sharpe_ratio END)::numeric AS ob_avg_sharpe,
        AVG(CASE WHEN direction = 'OS' THEN sharpe_ratio END)::numeric AS os_avg_sharpe,
        AVG(CASE WHEN direction = 'OB' THEN profit_factor END)::numeric AS ob_avg_pf,
        AVG(CASE WHEN direction = 'OS' THEN profit_factor END)::numeric AS os_avg_pf
      FROM eligible
      WHERE direction IN ('OB', 'OS')
      GROUP BY symbol
      ORDER BY symbol;
    `;
  } else {
    const { clause, params: filterParams } = buildMetadataFilter(tableName, startDate, endDate, 'm', fromClause);
    params.push(...filterParams);

    query = `
      WITH eligible AS (
        SELECT
          m.symbol,
          CASE
            WHEN UPPER(m.strategy_id) LIKE '%OB' THEN 'OB'
            WHEN UPPER(m.strategy_id) LIKE '%OS' THEN 'OS'
            ELSE 'UNKNOWN'
          END AS direction,
          (m.results->>'totalNetProfit')::numeric AS total_net_profit,
          (m.results->>'sharpeRatio')::numeric AS sharpe_ratio,
          (m.results->>'profitFactor')::numeric AS profit_factor,
          (m.results->>'totalTrades')::numeric AS total_trades,
          SUBSTRING(m.results->>'profitTrades' FROM '\\(([0-9.]+)%\\)')::numeric AS winrate_pct
        FROM strategy_metadata m
        WHERE 1 = 1
        ${clause}
      )
      SELECT
        symbol,
        AVG(CASE WHEN direction = 'OB' THEN total_net_profit END)::numeric AS ob_avg_profit,
        AVG(CASE WHEN direction = 'OS' THEN total_net_profit END)::numeric AS os_avg_profit,
        AVG(CASE WHEN direction = 'OB' THEN winrate_pct END)::numeric AS ob_avg_winrate,
        AVG(CASE WHEN direction = 'OS' THEN winrate_pct END)::numeric AS os_avg_winrate,
        AVG(CASE WHEN direction = 'OB' THEN total_trades END)::numeric AS ob_avg_trades,
        AVG(CASE WHEN direction = 'OS' THEN total_trades END)::numeric AS os_avg_trades,
        AVG(CASE WHEN direction = 'OB' THEN sharpe_ratio END)::numeric AS ob_avg_sharpe,
        AVG(CASE WHEN direction = 'OS' THEN sharpe_ratio END)::numeric AS os_avg_sharpe,
        AVG(CASE WHEN direction = 'OB' THEN profit_factor END)::numeric AS ob_avg_pf,
        AVG(CASE WHEN direction = 'OS' THEN profit_factor END)::numeric AS os_avg_pf
      FROM eligible
      WHERE direction IN ('OB', 'OS')
      GROUP BY symbol
      ORDER BY symbol;
    `;
  }

  try {
    const result = await pool.query(query, params);
    return result.rows || [];
  } catch (error) {
    console.error('âŒ getObOsAverageData error:', error);
    throw error;
  }
};

module.exports = {
  getDashboardOverview,
  getMonthlyProfit,
  getTopStrategies,
  getTopSymbols,
  getProfitDistribution,
  getStreakAnalysis,
  getYearlyComparison,
  getDetailedReport,
  getFileOptimizationSummary,
  getQualityDistribution,
  getComparativeRankingRawData,
  getTimeframeDuelData,
  getSymbolAverageData,
  getObOsAverageData,
  FILE_OPTIMIZATION_THRESHOLDS
};
