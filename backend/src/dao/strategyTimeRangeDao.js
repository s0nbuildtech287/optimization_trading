const { getAppPool } = require("../config/db");
const pool = getAppPool();
const { safeOp } = require("./strategyFilterHelper");
const { resolveTableSubquery } = require("./queryBuilderHelper");

async function getStrategiesByTimeRange({
  backtestTable = null,
  startDate,
  endDate,
  symbol = null,
  search = null,
  type = null,
  timeframe = null,
  // Filter values cho DATE RANGE metrics
  pd = null,
  totalNetProfit = null,
  totalTrades = null,
  winrate = null,
  largestLossTrade = null,
  largestProfitTradeRatio = null,
  riskRewardRatio = null,
  drawdown = null,
  // Filter values cho FULL PERIOD metrics (now fully dynamic too!)
  profitFactor = null,
  sharpeRatio = null,
  recoveryFactor = null,
  lrCorrelation = null,
  operators = {},
  ranges = {},
  sortBy = "pd_ratio",
  sortDir = "desc",
  page = 1,
  pageSize = 20,
  idsOnly = false, // ✅ NEW
}) {
  try {
    const { fromClause, validTables } = await resolveTableSubquery(backtestTable);

    console.log("🔍 [DAO] Received operators:", JSON.stringify(operators));
    console.log("🔍 [DAO] Received ranges:", JSON.stringify(ranges));

    // Validate operators
    const dateRangeOps = {
      pd: safeOp(operators?.pd),
      totalNetProfit: safeOp(operators?.totalNetProfit),
      totalTrades: safeOp(operators?.totalTrades),
      winrate: safeOp(operators?.winrate),
      largestLossTrade: safeOp(operators?.largestLossTrade),
      largestProfitTradeRatio: safeOp(operators?.largestProfitTradeRatio),
      riskRewardRatio: safeOp(operators?.riskRewardRatio),
      drawdown: safeOp(operators?.drawdown),
      profitFactor: safeOp(operators?.profitFactor),       // ✅ NEW
      sharpeRatio: safeOp(operators?.sharpeRatio),         // ✅ NEW
      recoveryFactor: safeOp(operators?.recoveryFactor),   // ✅ NEW
      lrCorrelation: safeOp(operators?.lrCorrelation),     // ✅ NEW
    };

    console.log("🔍 [DAO] Date Range Ops:", JSON.stringify(dateRangeOps));

    // Map sortBy to dynamic columns in CTE
    let sortColumn = sortBy;
    if (sortBy === "quantity") sortColumn = "total_orders";
    else if (sortBy === "profitFactor") sortColumn = "profit_factor";
    else if (sortBy === "sharpeRatio") sortColumn = "sharpe_ratio";
    else if (sortBy === "recoveryFactor") sortColumn = "recovery_factor";
    else if (sortBy === "lrCorrelation") sortColumn = "lr_correlation";

    // Build params
    const params = [validTables]; // $1
    let paramIdx = 2;

    let formattedStartDate = startDate;
    let formattedEndDate = endDate;
    if (typeof startDate === "string" && startDate.length === 10) {
      formattedStartDate = `${startDate} 00:00:00`;
    }
    if (typeof endDate === "string" && endDate.length === 10) {
      formattedEndDate = `${endDate} 23:59:59`;
    }

    params.push(formattedStartDate); // $2
    params.push(formattedEndDate);   // $3
    const startDateIdx = 2;
    const endDateIdx = 3;
    paramIdx = 4;

    // Build WHERE clauses
    let dateRangeFilters = "";

    const addDateRangeFilter = (key, columnName, value, op, isInteger = false) => {
      const parse = isInteger ? parseInt : parseFloat;

      if (op === "range") {
        const r = ranges?.[key];
        if (!r) return;

        if (r.min !== undefined && r.min !== "" && r.min !== null) {
          dateRangeFilters += ` AND ${columnName} >= $${paramIdx}`;
          params.push(parse(r.min));
          paramIdx++;
        }
        if (r.max !== undefined && r.max !== "" && r.max !== null) {
          dateRangeFilters += ` AND ${columnName} <= $${paramIdx}`;
          params.push(parse(r.max));
          paramIdx++;
        }
      } else {
        if (!value && value !== 0) return;

        dateRangeFilters += ` AND ${columnName} ${op} $${paramIdx}`;
        params.push(parse(value));
        paramIdx++;
      }
    };

    addDateRangeFilter("pd", "pd_ratio", pd, dateRangeOps.pd);
    addDateRangeFilter("totalNetProfit", "total_profit", totalNetProfit, dateRangeOps.totalNetProfit);
    addDateRangeFilter("totalTrades", "total_orders", totalTrades, dateRangeOps.totalTrades, true);
    addDateRangeFilter("winrate", "winrate", winrate, dateRangeOps.winrate);
    addDateRangeFilter("largestProfitTradeRatio", "largest_profit_trade_ratio", largestProfitTradeRatio, dateRangeOps.largestProfitTradeRatio);

    if (dateRangeOps.largestLossTrade === "range") {
      const r = ranges?.largestLossTrade;
      if (r) {
        if (r.min !== undefined && r.min !== "" && r.min !== null) {
          dateRangeFilters += ` AND ABS(largest_loss_trade) >= $${paramIdx}`;
          params.push(parseFloat(r.min));
          paramIdx++;
        }
        if (r.max !== undefined && r.max !== "" && r.max !== null) {
          dateRangeFilters += ` AND ABS(largest_loss_trade) <= $${paramIdx}`;
          params.push(parseFloat(r.max));
          paramIdx++;
        }
      }
    } else if (largestLossTrade) {
      dateRangeFilters += ` AND ABS(largest_loss_trade) ${dateRangeOps.largestLossTrade} $${paramIdx}`;
      params.push(parseFloat(largestLossTrade));
      paramIdx++;
    }

    const drawdownUnitTimeRange = operators?._drawdownUnit || "percent";
    const drawdownExprTimeRange = drawdownUnitTimeRange === "absolute"
      ? "max_drawdown"
      : "drawdown_pct";

    addDateRangeFilter("drawdown", drawdownExprTimeRange, drawdown, dateRangeOps.drawdown);
    addDateRangeFilter("riskRewardRatio", "risk_reward_ratio", riskRewardRatio, dateRangeOps.riskRewardRatio);

    // Dynamic metrics for the remaining 4 indicators
    addDateRangeFilter("profitFactor", "profit_factor", profitFactor, dateRangeOps.profitFactor);
    addDateRangeFilter("sharpeRatio", "sharpe_ratio", sharpeRatio, dateRangeOps.sharpeRatio);
    addDateRangeFilter("recoveryFactor", "recovery_factor", recoveryFactor, dateRangeOps.recoveryFactor);
    addDateRangeFilter("lrCorrelation", "lr_correlation", lrCorrelation, dateRangeOps.lrCorrelation);

    // Metadata filters
    let symbolFilter = "";
    let searchIdx = null;
    let timeframeIdx = null;

    if (symbol) {
      if (symbol.includes(",")) {
        const symbolList = symbol.split(",").map((s) => s.trim()).filter(Boolean);
        const placeholders = symbolList.map((_, i) => `$${paramIdx + i}`).join(", ");
        symbolFilter = ` AND symbol IN (${placeholders})`;
        params.push(...symbolList);
        paramIdx += symbolList.length;
      } else {
        symbolFilter = ` AND symbol = $${paramIdx}`;
        params.push(symbol);
        paramIdx++;
      }
    }

    if (search) {
      searchIdx = paramIdx;
      params.push(`%${search}%`);
      paramIdx++;
    }

    if (timeframe) {
      timeframeIdx = paramIdx;
      params.push(timeframe);
      paramIdx++;
    }

    // Limit and Offset
    const limitIdx = paramIdx;
    const offsetIdx = paramIdx + 1;
    if (!idsOnly) {
      params.push(pageSize, (page - 1) * pageSize);
    }

    const cteDefinitions = `
      matching_strategies AS (
        SELECT strategy_id, backtest_table
        FROM strategy_metadata
        WHERE backtest_table = ANY($1::text[])
          ${symbolFilter}
          ${searchIdx ? `AND strategy_id ILIKE $${searchIdx}` : ""}
          ${timeframeIdx ? `AND timeframe = $${timeframeIdx}` : ""}
          ${type === "buy" ? `AND (settings->'inputs'->>'AcceptBuy' IN ('true', '1') OR (settings->'inputs'->'AcceptBuy')::text::boolean = true)` : ""}
          ${type === "sell" ? `AND (settings->'inputs'->>'AcceptSell' IN ('true', '1') OR (settings->'inputs'->'AcceptSell')::text::boolean = true)` : ""}
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
        INNER JOIN matching_strategies m 
          ON b.strategy_id = m.strategy_id 
          AND b.source_table = m.backtest_table
        WHERE b.type NOT IN ('balance')
      ),
      strategy_bounds AS (
        SELECT
          strategy_id,
          backtest_table,
          MIN(time) AS full_start_time,
          MAX(time) AS full_end_time
        FROM raw_deals
        GROUP BY strategy_id, backtest_table
      ),
      backtest_filtered_by_time AS (
        SELECT * FROM raw_deals
        WHERE time >= $${startDateIdx} AND time <= $${endDateIdx}
      ),
      backtest_cumulative_profit AS (
        SELECT *,
          SUM(profit + commission + swap) OVER (
            PARTITION BY strategy_id, backtest_table
            ORDER BY deal
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS cumulative_profit
        FROM backtest_filtered_by_time
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
          ) AS peak_equity,
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
          COALESCE(
            NULLIF(COUNT(1) FILTER (WHERE LOWER(COALESCE(direction, '')) IN ('out', 'out by')), 0),
            FLOOR(COUNT(1) / 2)
          ) AS total_orders,
          SUM(profit + commission + swap) AS total_profit,
          MAX(drawdown) AS max_drawdown,
          COALESCE(
            ROUND(
              ((COUNT(1) FILTER (
                WHERE LOWER(COALESCE(direction, '')) IN ('out', 'out by')
                  AND (profit + commission + swap) > 0
              ))::numeric /
              NULLIF(COUNT(1) FILTER (WHERE LOWER(COALESCE(direction, '')) IN ('out', 'out by')), 0) * 100)::numeric,
              2
            ),
            ROUND(
              (COUNT(1) FILTER (WHERE (profit + commission + swap) > 0)::numeric /
              NULLIF(FLOOR(COUNT(1) / 2), 0) * 100)::numeric,
              2
            )
          ) AS winrate,
          CASE 
            WHEN MAX(drawdown) > 0 
            THEN ROUND((SUM(profit + commission + swap) / MAX(drawdown))::numeric, 2)
            ELSE NULL
          END AS pd_ratio,
          AVG(CASE
            WHEN LOWER(COALESCE(direction, '')) IN ('out', 'out by') AND (profit + commission + swap) > 0
            THEN (profit + commission + swap)
          END) AS avg_profit,
          AVG(CASE
            WHEN LOWER(COALESCE(direction, '')) IN ('out', 'out by') AND (profit + commission + swap) < 0
            THEN (profit + commission + swap)
          END) AS avg_loss,
          CASE 
            WHEN AVG(CASE
              WHEN LOWER(COALESCE(direction, '')) IN ('out', 'out by') AND (profit + commission + swap) < 0
              THEN (profit + commission + swap)
            END) != 0
            THEN ROUND(
              (AVG(CASE
                WHEN LOWER(COALESCE(direction, '')) IN ('out', 'out by') AND (profit + commission + swap) > 0
                THEN (profit + commission + swap)
              END) /
               ABS(AVG(CASE
                 WHEN LOWER(COALESCE(direction, '')) IN ('out', 'out by') AND (profit + commission + swap) < 0
                 THEN (profit + commission + swap)
               END)))::numeric,
              2
            )
            ELSE 0
          END AS risk_reward_ratio,
          ROUND((MIN(profit + commission + swap) FILTER (
            WHERE LOWER(COALESCE(direction, '')) IN ('out', 'out by')
          ))::numeric, 2) AS largest_loss_trade,
          ROUND((MAX(profit + commission + swap) FILTER (
            WHERE LOWER(COALESCE(direction, '')) IN ('out', 'out by')
          ))::numeric, 2) AS largest_profit_trade,
          CASE
            WHEN SUM(profit + commission + swap) > 0
            THEN ROUND((MAX(profit + commission + swap) FILTER (
              WHERE LOWER(COALESCE(direction, '')) IN ('out', 'out by')
            ) / SUM(profit + commission + swap) * 100)::numeric, 2)
            ELSE NULL
          END AS largest_profit_trade_ratio,
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
            WHEN STDDEV(profit + commission + swap) FILTER (
              WHERE LOWER(COALESCE(direction, '')) IN ('out', 'out by')
            ) > 0
            THEN ROUND(
              (
                (AVG(profit + commission + swap) FILTER (
                  WHERE LOWER(COALESCE(direction, '')) IN ('out', 'out by')
                ) / STDDEV(profit + commission + swap) FILTER (
                  WHERE LOWER(COALESCE(direction, '')) IN ('out', 'out by')
                ))
                * SQRT(
                  COUNT(1) FILTER (WHERE LOWER(COALESCE(direction, '')) IN ('out', 'out by')) /
                  GREATEST(EXTRACT(epoch FROM (MAX(time) - MIN(time))) / 31536000.0, 0.1)
                )
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
          COALESCE(ROUND(corr(cumulative_profit, deal)::numeric, 4), 1.0) AS lr_correlation
        FROM backtest_with_drawdown
        GROUP BY strategy_id, backtest_table
      ),
      strategies_resolved AS (
        SELECT
          f.strategy_id,
          f.backtest_table,
          CASE WHEN scope.is_full_period THEN (m.results->>'totalTrades')::numeric ELSE f.total_orders END AS total_orders,
          CASE WHEN scope.is_full_period THEN (m.results->>'totalNetProfit')::numeric ELSE f.total_profit END AS total_profit,
          CASE
            WHEN scope.is_full_period
              THEN regexp_replace(split_part(m.results->>'balanceDrawdownMaximal', '(', 1), '[^0-9\\.]', '', 'g')::numeric
            ELSE f.max_drawdown
          END AS max_drawdown,
          CASE
            WHEN scope.is_full_period
              THEN CAST(SUBSTRING(m.results->>'balanceDrawdownMaximal' FROM '\\(([0-9.]+)%\\)') AS numeric)
            ELSE (f.max_drawdown / NULLIF(COALESCE((m.settings->>'initialDeposit')::numeric, 10000), 0)) * 100
          END AS drawdown_pct,
          CASE
            WHEN scope.is_full_period THEN
              (m.results->>'totalNetProfit')::numeric /
              NULLIF(regexp_replace(split_part(m.results->>'balanceDrawdownMaximal', '(', 1), '[^0-9\\.]', '', 'g')::numeric, 0)
            ELSE f.pd_ratio
          END AS pd_ratio,
          CASE
            WHEN scope.is_full_period
              THEN CAST(SUBSTRING(m.results->>'profitTrades' FROM '\\(([0-9.]+)%\\)') AS numeric)
            ELSE f.winrate
          END AS winrate,
          CASE WHEN scope.is_full_period THEN (m.results->>'largestLossTrade')::numeric ELSE f.largest_loss_trade END AS largest_loss_trade,
          CASE WHEN scope.is_full_period THEN (m.results->>'largestProfitTrade')::numeric ELSE f.largest_profit_trade END AS largest_profit_trade,
          CASE
            WHEN scope.is_full_period AND (m.results->>'totalNetProfit')::numeric > 0
              THEN ROUND(((m.results->>'largestProfitTrade')::numeric / (m.results->>'totalNetProfit')::numeric * 100)::numeric, 2)
            ELSE f.largest_profit_trade_ratio
          END AS largest_profit_trade_ratio,
          CASE
            WHEN scope.is_full_period AND ABS((m.results->>'averageLossTrade')::numeric) > 0
              THEN ROUND(((m.results->>'averageProfitTrade')::numeric / ABS((m.results->>'averageLossTrade')::numeric))::numeric, 2)
            ELSE f.risk_reward_ratio
          END AS risk_reward_ratio,
          CASE WHEN scope.is_full_period THEN (m.results->>'profitFactor')::numeric ELSE f.profit_factor END AS profit_factor,
          CASE WHEN scope.is_full_period THEN (m.results->>'sharpeRatio')::numeric ELSE f.sharpe_ratio END AS sharpe_ratio,
          CASE WHEN scope.is_full_period THEN (m.results->>'recoveryFactor')::numeric ELSE f.recovery_factor END AS recovery_factor,
          CASE WHEN scope.is_full_period THEN (m.results->>'lrCorrelation')::numeric ELSE f.lr_correlation END AS lr_correlation,
          COALESCE((m.settings->>'initialDeposit')::numeric, 10000) AS initial_deposit
        FROM strategies_metrics f
        INNER JOIN strategy_bounds b
          ON f.strategy_id = b.strategy_id
         AND f.backtest_table = b.backtest_table
        INNER JOIN strategy_metadata m 
          ON f.strategy_id = m.strategy_id 
          AND f.backtest_table = m.backtest_table
        CROSS JOIN LATERAL (
          SELECT ($${startDateIdx}::timestamp <= b.full_start_time AND $${endDateIdx}::timestamp >= b.full_end_time) AS is_full_period
        ) scope
      ),
      strategies_filtered AS (
        SELECT *
        FROM strategies_resolved
        WHERE 1=1${dateRangeFilters}
      )
    `;

    if (idsOnly) {
      const query = `
        WITH ${cteDefinitions}
        SELECT m.strategy_id
        FROM strategy_metadata m
        INNER JOIN strategies_filtered f 
          ON m.strategy_id = f.strategy_id 
          AND m.backtest_table = f.backtest_table
      `;
      const dataResult = await pool.query(query, params);
      return dataResult.rows.map((row) => row.strategy_id);
    }

    const query = `
      WITH ${cteDefinitions}
      SELECT 
        m.strategy_id,
        m.backtest_table,
        m.symbol,
        m.expert_name,
        m.expert_id,
        m.timeframe,
        m.period_start,
        m.period_end,
        m.settings,
        m.results,
        m.created_at,
        m.updated_at,
        f.total_orders AS quantity,
        f.total_profit,
        f.max_drawdown,
        f.pd_ratio,
        f.winrate,
        f.largest_loss_trade,
        f.largest_profit_trade,
        f.largest_profit_trade_ratio,
        f.risk_reward_ratio,
        f.profit_factor,
        f.sharpe_ratio,
        f.recovery_factor,
        f.lr_correlation
      FROM strategy_metadata m
      INNER JOIN strategies_filtered f 
        ON m.strategy_id = f.strategy_id 
        AND m.backtest_table = f.backtest_table
      ORDER BY f.${sortColumn || "pd_ratio"} ${sortDir === "asc" ? "ASC" : "DESC"} NULLS LAST
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const countQuery = `
      WITH ${cteDefinitions}
      SELECT COUNT(*) as total
      FROM strategy_metadata m
      INNER JOIN strategies_filtered f 
        ON m.strategy_id = f.strategy_id 
        AND m.backtest_table = f.backtest_table
    `;

    console.log(`🔍 [DAO] getStrategiesByTimeRange: ${startDate} to ${endDate}, backtest: ${backtestTable || "ALL"}`);
    console.log(`🔍 [DAO] Metadata Filters: symbol=${symbol || "ALL"}, timeframe=${timeframe || "ALL"}, type=${type || "ALL"}, search=${search || "NONE"}`);
    console.log(`🔍 [DAO] Date Range Filters: ${dateRangeFilters || "NONE"}`);
    console.log("🔍 [DAO] Params:", params);

    const [dataResult, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, params.slice(0, -2))
    ]);

    const total = parseInt(countResult.rows[0]?.total || 0);
    const totalPages = Math.ceil(total / pageSize);

    return {
      data: dataResult.rows,
      pagination: {
        total,
        totalPages,
        currentPage: page,
        pageSize,
      },
    };
  } catch (err) {
    console.error("❌ [DAO] Error in getStrategiesByTimeRange:", err);
    throw err;
  }
}

module.exports = {
  getStrategiesByTimeRange,
};
