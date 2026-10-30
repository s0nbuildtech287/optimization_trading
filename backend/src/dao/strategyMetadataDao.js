// server/dao/strategyMetadataDAO.js
const { getAppPool, safeConnect } = require("../config/db");
const pool = getAppPool();
const { buildFilterClauses, safeOp } = require("./strategyFilterHelper");

/**
 * ✅ Helper function: Kiểm tra table có tồn tại không
 */
async function checkIfTableExists(tableName) {
  const result = await pool.query(
    `
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = $1
    )
  `,
    [tableName],
  );
  return result.rows[0].exists;
}

/**
 * ✅ Khởi tạo bảng strategy_metadata với COMPOSITE PRIMARY KEY
 */
async function initStrategyMetadataTable() {
  const query = `
    CREATE TABLE IF NOT EXISTS strategy_metadata (
      strategy_id VARCHAR(255) NOT NULL,
      backtest_table VARCHAR(50) NOT NULL,
      
      symbol VARCHAR(50),
      expert_name TEXT,
      expert_id VARCHAR(50),
      timeframe VARCHAR(20),
      period_start TIMESTAMP,
      period_end TIMESTAMP,
      
      settings JSONB,
      results JSONB,
      
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      
      PRIMARY KEY (strategy_id, backtest_table)
    );
    
    CREATE INDEX IF NOT EXISTS idx_strategy_metadata_backtest ON strategy_metadata(backtest_table);
    CREATE INDEX IF NOT EXISTS idx_strategy_metadata_strategy ON strategy_metadata(strategy_id);
    CREATE INDEX IF NOT EXISTS idx_strategy_metadata_symbol ON strategy_metadata(symbol);
    CREATE INDEX IF NOT EXISTS idx_strategy_metadata_created ON strategy_metadata(created_at DESC);
  `;

  try {
    await pool.query(query);
    console.log("Table strategy_metadata initialized");
  } catch (err) {
    console.error("❌ Failed to initialize strategy_metadata table:", err.message);
    throw err;
  }
}

/**
 * ✅ Upsert strategy metadata - UPDATE conflict clause
 */
async function upsertStrategyMetadata({
  strategyId,
  backtestTable,
  symbol = null,
  expertName = null,
  expertId = null,
  timeframe = null,
  periodStart = null,
  periodEnd = null,
  settings = {},
  results = {},
}) {
  const query = `
    INSERT INTO strategy_metadata (
      strategy_id, backtest_table, symbol, expert_name, expert_id,
      timeframe, period_start, period_end, settings, results, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
    ON CONFLICT (strategy_id, backtest_table) 
    DO UPDATE SET
      symbol = EXCLUDED.symbol,
      expert_name = EXCLUDED.expert_name,
      expert_id = EXCLUDED.expert_id,
      timeframe = EXCLUDED.timeframe,
      period_start = EXCLUDED.period_start,
      period_end = EXCLUDED.period_end,
      settings = EXCLUDED.settings,
      results = EXCLUDED.results,
      updated_at = NOW()
    RETURNING *;
  `;

  const values = [strategyId, backtestTable, symbol, expertName, expertId, timeframe, periodStart, periodEnd, JSON.stringify(settings), JSON.stringify(results)];

  try {
    const { rows } = await pool.query(query, values);
    return rows[0];
  } catch (err) {
    console.error(`❌ Failed to upsert strategy metadata for ${strategyId}:`, err.message);
    throw err;
  }
}

/**
 * ✅ Lấy metadata của 1 strategy trong 1 backtest cụ thể
 */
async function getStrategyMetadata(strategyId, backtestTable) {
  const query = `
    SELECT * FROM strategy_metadata
    WHERE strategy_id = $1 AND backtest_table = $2;
  `;

  try {
    const { rows } = await pool.query(query, [strategyId, backtestTable]);
    return rows[0] || null;
  } catch (err) {
    console.error(`❌ Failed to get strategy metadata:`, err.message);
    throw err;
  }
}

/**
 * ✅ Lấy TẤT CẢ versions của 1 strategy (từ tất cả backtests)
 */
async function getAllVersionsOfStrategy(strategyId) {
  const query = `
    SELECT * FROM strategy_metadata
    WHERE strategy_id = $1
    ORDER BY backtest_table ASC;
  `;

  try {
    const { rows } = await pool.query(query, [strategyId]);
    return rows;
  } catch (err) {
    console.error(`❌ Failed to get all versions of ${strategyId}:`, err.message);
    throw err;
  }
}

/**
 * Lấy tất cả strategies của 1 backtest table
 */
async function getStrategiesByBacktestTable(backtestTable) {
  const query = `
    SELECT * FROM strategy_metadata
    WHERE backtest_table = $1
    ORDER BY strategy_id ASC;
  `;

  try {
    const { rows } = await pool.query(query, [backtestTable]);
    return rows;
  } catch (err) {
    console.error(`❌ Failed to get strategies for table ${backtestTable}:`, err.message);
    throw err;
  }
}

/**
 * Lấy strategies có phân trang và filter
 * ✅ Bổ sung: Lấy quantity thực tế từ các bảng backtest
 */
const getPagedStrategies = async ({
  backtestTable,
  symbol,
  search,
  type,
  timeframe,
  pd,
  totalNetProfit,
  totalTrades,
  winrate,
  largestProfitTradeRatio,
  riskRewardRatio,
  drawdown,
  largestLossTrade,
  profitFactor,
  sharpeRatio,
  recoveryFactor,
  lrCorrelation,
  page = 1,
  pageSize = 20,
  sortBy = null,
  sortDir = 'desc',
  operators = {},
  ranges = {},
}) => {
  try {
    const fmtField = (key, val) => {
      const op = operators?.[key];
      if (op === 'range') {
        const r = ranges?.[key];
        const mn = r?.min !== undefined && r?.min !== '' ? r.min : '?';
        const mx = r?.max !== undefined && r?.max !== '' ? r.max : '?';
        return `[${mn} : ${mx}]`;
      }
      if (val === undefined || val === null || val === '') return undefined;
      return `${op || '>='} ${val}`;
    };
    console.log("🔍 [DAO] getPagedStrategies filters:", {
      pd: fmtField('pd', pd),
      totalNetProfit: fmtField('totalNetProfit', totalNetProfit),
      totalTrades: fmtField('totalTrades', totalTrades),
      winrate: fmtField('winrate', winrate),
      largestProfitTradeRatio: fmtField('largestProfitTradeRatio', largestProfitTradeRatio),
      riskRewardRatio: fmtField('riskRewardRatio', riskRewardRatio),
      drawdown: fmtField('drawdown', drawdown),
      largestLossTrade: fmtField('largestLossTrade', largestLossTrade),
      profitFactor: fmtField('profitFactor', profitFactor),
      sharpeRatio: fmtField('sharpeRatio', sharpeRatio),
      recoveryFactor: fmtField('recoveryFactor', recoveryFactor),
      lrCorrelation: fmtField('lrCorrelation', lrCorrelation),
    });

    let query = "SELECT * FROM strategy_metadata WHERE 1=1";
    let countQuery = "SELECT COUNT(*) as total FROM strategy_metadata WHERE 1=1";

    const filterResult = buildFilterClauses({
      backtestTable, symbol, search, type, timeframe,
      pd, totalNetProfit, totalTrades, winrate, largestProfitTradeRatio,
      riskRewardRatio, drawdown, largestLossTrade, profitFactor,
      sharpeRatio, recoveryFactor, lrCorrelation,
      operators, ranges,
      paramIndex: 1,
      params: []
    });

    query += filterResult.clause;
    const params = filterResult.params;
    let paramIndex = filterResult.paramIndex;

    const countFilterResult = buildFilterClauses({
      backtestTable, symbol, search, type, timeframe,
      pd, totalNetProfit, totalTrades, winrate, largestProfitTradeRatio,
      riskRewardRatio, drawdown, largestLossTrade, profitFactor,
      sharpeRatio, recoveryFactor, lrCorrelation,
      operators, ranges,
      paramIndex: 1,
      params: []
    });

    countQuery += countFilterResult.clause;
    const countParams = countFilterResult.params;

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    const offset = (page - 1) * pageSize;
    const safeDir = sortDir === 'asc' ? 'ASC' : 'DESC';

    let orderExpr = '';
    if (sortBy === 'quantity' || sortBy === 'total_orders' || sortBy === 'totalTrades') {
      orderExpr = `COALESCE((results->>'totalTrades')::integer, 0) ${safeDir}`;
    } else if (sortBy === 'pd_ratio' || sortBy === 'pd') {
      orderExpr = `((results->>'totalNetProfit')::numeric / NULLIF(regexp_replace(split_part(results->>'balanceDrawdownMaximal', '(', 1), '[^0-9\\.]', '', 'g')::numeric, 0)) ${safeDir} NULLS LAST`;
    } else if (sortBy === 'total_profit' || sortBy === 'profit' || sortBy === 'totalNetProfit') {
      orderExpr = `(results->>'totalNetProfit')::numeric ${safeDir} NULLS LAST`;
    } else if (sortBy === 'winrate') {
      orderExpr = `SUBSTRING(results->>'profitTrades' FROM '\\(([0-9.]+)%\\)')::numeric ${safeDir} NULLS LAST`;
    } else if (sortBy === 'sharpeRatio' || sortBy === 'sharpe') {
      orderExpr = `(results->>'sharpeRatio')::numeric ${safeDir} NULLS LAST`;
    } else if (sortBy === 'recoveryFactor' || sortBy === 'recovery') {
      orderExpr = `(results->>'recoveryFactor')::numeric ${safeDir} NULLS LAST`;
    } else if (sortBy === 'lrCorrelation') {
      orderExpr = `(results->>'lrCorrelation')::numeric ${safeDir} NULLS LAST`;
    } else if (sortBy === 'drawdown') {
      const drawdownUnitForSort = operators?._drawdownUnit || 'percent';
      const drawdownSortExpr = drawdownUnitForSort === 'absolute'
        ? `regexp_replace(split_part(results->>'balanceDrawdownMaximal', '(', 1), '[^0-9\\.]', '', 'g')::numeric`
        : `CASE WHEN (results->>'balanceDrawdownMaximal') IS NOT NULL THEN CAST(SUBSTRING(results->>'balanceDrawdownMaximal' FROM '\\(([0-9.]+)%\\)') AS numeric) ELSE 0 END`;
      orderExpr = `${drawdownSortExpr} ${safeDir} NULLS LAST`;
    }

    if (orderExpr) {
      query += `
        ORDER BY ${orderExpr}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
    } else {
      // ✅ Default sorting by: Symbol Order → Bot ID → Timeframe → Order Type
      query += `
        ORDER BY
          CASE symbol
            WHEN 'BTCUSD' THEN 1
            WHEN 'ETHUSD' THEN 2
            WHEN 'XAUUSD' THEN 3
            WHEN 'XAGUSD' THEN 4
            WHEN 'US500' THEN 5
            WHEN 'DE30' THEN 6
            WHEN 'JP225' THEN 7
            WHEN 'HK50' THEN 8
            WHEN 'USOIL' THEN 9
            ELSE 999
          END ASC,
          SUBSTRING(strategy_id FROM '^(\\d+)')::INTEGER ASC,
          SUBSTRING(strategy_id FROM 'H(\\d+)')::INTEGER ASC,
          CASE 
            WHEN strategy_id ~ 'B$' THEN 1
            WHEN strategy_id ~ 'S$' THEN 2
            ELSE 3
          END ASC,
          strategy_id ASC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
    }
    params.push(pageSize, offset);

    const result = await pool.query(query, params);

    // ✅ DEBUG: Log first result to see actual field names in results JSON
    if (riskRewardRatio && result.rows.length > 0) {
      const sampleResult = result.rows[0].results;

      // Try different possible field names
      const possibleFields = ["Average Profit Trade", "average_profit_trade", "averageProfitTrade", "Average Loss Trade", "average_loss_trade", "averageLossTrade", "avgProfitTrade", "avgLossTrade"];
      possibleFields.forEach((field) => {
        if (sampleResult?.[field] !== undefined) {
          console.log(`✅ Found field: "${field}" = ${sampleResult[field]}`);
        }
      });
    }

    // Gom các strategy_id theo backtest_table để batch query tối ưu (tránh lỗi N+1 queries)
    const tableToIds = {};
    result.rows.forEach((strategy) => {
      const tName = strategy.backtest_table;
      if (!tableToIds[tName]) {
        tableToIds[tName] = [];
      }
      tableToIds[tName].push(strategy.strategy_id);
    });

    const tableCounts = {};
    await Promise.all(
      Object.keys(tableToIds).map(async (tName) => {
        const countsMap = await batchGetStrategyDealsCounts(tableToIds[tName], tName);
        tableCounts[tName] = countsMap;
      })
    );

    const strategiesWithQuantity = result.rows.map((strategy) => {
      const tName = strategy.backtest_table;
      const idNormalized = String(strategy.strategy_id || "").trim();
      const quantity = tableCounts[tName]?.[idNormalized] || 0;
      return {
        ...strategy,
        quantity,
      };
    });

    return {
      data: strategiesWithQuantity,
      pagination: {
        total,
        totalPages: Math.ceil(total / pageSize),
        currentPage: page,
        pageSize,
      },
    };
  } catch (err) {
    console.error("❌ Error in getPagedStrategies:", err);
    throw err;
  }
};

/**
 * ✅ Xóa strategy metadata theo strategy_id VÀ backtest_table
 */
async function deleteStrategyMetadata(strategyId, backtestTable) {
  const query = `
    DELETE FROM strategy_metadata
    WHERE strategy_id = $1 AND backtest_table = $2
    RETURNING strategy_id, backtest_table;
  `;

  try {
    const { rows } = await pool.query(query, [strategyId, backtestTable]);
    return rows[0] || null;
  } catch (err) {
    console.error(`❌ Failed to delete strategy:`, err.message);
    throw err;
  }
}

/**
 * Xóa tất cả strategies của 1 backtest table
 */
async function deleteStrategiesByBacktestTable(backtestTable) {
  const query = `
    DELETE FROM strategy_metadata
    WHERE backtest_table = $1
    RETURNING strategy_id;
  `;

  try {
    const { rows } = await pool.query(query, [backtestTable]);
    return rows.map((r) => r.strategy_id);
  } catch (err) {
    console.error(`❌ Failed to delete strategies for table ${backtestTable}:`, err.message);
    throw err;
  }
}

/**
 * Lấy distinct symbols từ strategy_metadata
 */
async function getDistinctSymbols(backtestTable = null) {
  let query = `
    SELECT DISTINCT symbol
    FROM strategy_metadata
    WHERE symbol IS NOT NULL
  `;

  const values = [];
  if (backtestTable && backtestTable !== "all_backtests") {
    if (typeof backtestTable === 'string' && backtestTable.includes(',')) {
      const tableList = backtestTable.split(',').map(t => t.trim()).filter(Boolean);
      const placeholders = tableList.map((_, i) => `$${i + 1}`).join(', ');
      query += ` AND backtest_table IN (${placeholders})`;
      values.push(...tableList);
    } else {
      query += ` AND backtest_table = $1`;
      values.push(backtestTable);
    }
  }

  query += ` ORDER BY symbol ASC;`;

  try {
    const { rows } = await pool.query(query, values);
    return rows.map((r) => r.symbol);
  } catch (err) {
    console.error("❌ Failed to get distinct symbols:", err.message);
    throw err;
  }
}

/**
 * Lấy statistics của strategies
 */
async function getStrategyStatistics(backtestTable = null) {
  let query = `
    SELECT 
      COUNT(*) as total_strategies,
      COUNT(DISTINCT symbol) as unique_symbols,
      COUNT(DISTINCT expert_name) as unique_experts
    FROM strategy_metadata
  `;

  const values = [];
  if (backtestTable && backtestTable !== "all_backtests") {
    const tableList = String(backtestTable).split(',').map((t) => t.trim()).filter(Boolean);
    const placeholders = tableList.map((_, index) => `$${index + 1}`).join(', ');
    query += ` WHERE backtest_table IN (${placeholders})`;
    values.push(...tableList);
  }

  try {
    const { rows } = await pool.query(query, values);
    return rows[0];
  } catch (err) {
    console.error("❌ Failed to get strategy statistics:", err.message);
    throw err;
  }
}

/**
 * Batch upsert - insert nhiều strategies cùng lúc
 */
async function batchUpsertStrategies(strategies) {
  if (!strategies || strategies.length === 0) {
    return [];
  }

  const client = await safeConnect(pool, 'STRATEGY_META');

  try {
    await client.query("BEGIN");

    const results = [];
    for (const strategy of strategies) {
      const query = `
        INSERT INTO strategy_metadata (
          strategy_id, backtest_table, symbol, expert_name, expert_id,
          timeframe, period_start, period_end, settings, results, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        ON CONFLICT (strategy_id, backtest_table) 
        DO UPDATE SET
          symbol = EXCLUDED.symbol,
          expert_name = EXCLUDED.expert_name,
          expert_id = EXCLUDED.expert_id,
          timeframe = EXCLUDED.timeframe,
          period_start = EXCLUDED.period_start,
          period_end = EXCLUDED.period_end,
          settings = EXCLUDED.settings,
          results = EXCLUDED.results,
          updated_at = NOW()
        RETURNING strategy_id, backtest_table;
      `;

      const values = [
        strategy.strategyId,
        strategy.backtestTable,
        strategy.symbol,
        strategy.expertName,
        strategy.expertId,
        strategy.timeframe,
        strategy.periodStart,
        strategy.periodEnd,
        JSON.stringify(strategy.settings || {}),
        JSON.stringify(strategy.results || {}),
      ];

      const { rows } = await client.query(query, values);
      results.push(rows[0]);
    }

    await client.query("COMMIT");
    console.log(`✅ Batch upserted ${results.length} strategies`);
    return results;
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Failed to batch upsert strategies:", err.message);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * ✅ Đếm số deals (quantity) của 1 strategy trong 1 bảng backtest cụ thể
 * Loại trừ type='balance' để chỉ đếm deals thực tế (buy/sell)
 */
async function getStrategyDealsCount(strategyId, backtestTable) {
  try {
    const tableExists = await checkIfTableExists(backtestTable);
    if (!tableExists) {
      return 0;
    }

    const query = `
      SELECT COUNT(*) as count
      FROM "${backtestTable}"
      WHERE TRIM(strategy_id) = TRIM($1)
        AND type NOT IN ('balance')
    `;

    const result = await pool.query(query, [strategyId]);
    return parseInt(result.rows[0].count) || 0;
  } catch (err) {
    console.error(`❌ Error counting deals for ${strategyId} in ${backtestTable}:`, err.message);
    return 0;
  }
}

/**
 * ✅ Đếm số deals cho nhiều strategies trong 1 bảng backtest (batch)
 * Returns: { strategyId: count, ... }
 */
async function batchGetStrategyDealsCounts(strategyIds, backtestTable) {
  try {
    const tableExists = await checkIfTableExists(backtestTable);
    if (!tableExists) {
      return {};
    }

    // Loại bỏ duplicates và normalize
    const uniqueIds = [...new Set(strategyIds.map((id) => id.trim()))];

    const query = `
      SELECT 
        TRIM(strategy_id) as strategy_id,
        COUNT(*) as count
      FROM "${backtestTable}"
      WHERE TRIM(strategy_id) = ANY($1::text[])
        AND type NOT IN ('balance')
      GROUP BY TRIM(strategy_id)
    `;

    const result = await pool.query(query, [uniqueIds]);

    // Convert to object map
    const countsMap = {};
    result.rows.forEach((row) => {
      countsMap[row.strategy_id] = parseInt(row.count) || 0;
    });

    return countsMap;
  } catch (err) {
    console.error(`❌ Error batch counting deals in ${backtestTable}:`, err.message);
    return {};
  }
}

/**
 * ✅ NEW: Lấy ONLY strategy IDs (không lấy full data, không phân trang)
 * Dùng cho copy IDs - cực kỳ nhanh vì chỉ SELECT strategy_id
 */
async function getStrategyIdsOnly({
  backtestTable,
  symbol,
  search,
  type,
  timeframe,
  pd,
  totalNetProfit,
  totalTrades,
  winrate,
  largestProfitTradeRatio,
  riskRewardRatio,
  drawdown,
  largestLossTrade,
  profitFactor,
  sharpeRatio,
  recoveryFactor,
  lrCorrelation,
  operators = {},
  ranges = {},
}) {
  try {
    let query = "SELECT strategy_id FROM strategy_metadata WHERE 1=1";
    const params = [];
    let paramIndex = 1;

    // ✅ Precompute validated SQL operators for each filterable field
    const ops = {
      pd: safeOp(operators?.pd),
      totalNetProfit: safeOp(operators?.totalNetProfit),
      totalTrades: safeOp(operators?.totalTrades),
      winrate: safeOp(operators?.winrate),
      largestProfitTradeRatio: safeOp(operators?.largestProfitTradeRatio),
      riskRewardRatio: safeOp(operators?.riskRewardRatio),
      drawdown: safeOp(operators?.drawdown),
      largestLossTrade: safeOp(operators?.largestLossTrade),
      profitFactor: safeOp(operators?.profitFactor),
      sharpeRatio: safeOp(operators?.sharpeRatio),
      recoveryFactor: safeOp(operators?.recoveryFactor),
      lrCorrelation: safeOp(operators?.lrCorrelation),
    };

    // Apply same filters as getPagedStrategies
    if (backtestTable && backtestTable !== 'all_backtests') {
      const tableList = String(backtestTable).split(',').map((t) => t.trim()).filter(Boolean);
      const placeholders = tableList.map((_, index) => `$${paramIndex + index}`).join(', ');
      query += ` AND backtest_table IN (${placeholders})`;
      params.push(...tableList);
      paramIndex += tableList.length;
    }

    // ✅ Support multiple symbols (comma-separated)
    if (symbol) {
      if (symbol.includes(',')) {
        // Multiple symbols - use IN clause
        const symbolList = symbol.split(',').map(s => s.trim()).filter(Boolean);
        const placeholders = symbolList.map((_, i) => `$${paramIndex + i}`).join(', ');
        query += ` AND symbol IN (${placeholders})`;
        params.push(...symbolList);
        paramIndex += symbolList.length;
      } else {
        // Single symbol - use equality
        query += ` AND symbol = $${paramIndex}`;
        params.push(symbol);
        paramIndex++;
      }
    }

    if (search) {
      query += ` AND strategy_id ILIKE $${paramIndex}`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (timeframe) {
      query += ` AND timeframe = $${paramIndex}`;
      params.push(timeframe);
      paramIndex++;
    }

    if (type === "buy") {
      query += " AND (settings->'inputs'->>'AcceptBuy' IN ('true', '1') OR (settings->'inputs'->'AcceptBuy')::text::boolean = true)";
    } else if (type === "sell") {
      query += " AND (settings->'inputs'->>'AcceptSell' IN ('true', '1') OR (settings->'inputs'->'AcceptSell')::text::boolean = true)";
    }

    if (pd) {
      query += ` AND (
        (results->>'totalNetProfit')::numeric /
        NULLIF(
          regexp_replace(
            split_part(results->>'balanceDrawdownMaximal', '(', 1),
            '[^0-9\\.]',
            '',
            'g'
          )::numeric,
          0
        )
      ) ${ops.pd} $${paramIndex}`;
      params.push(parseFloat(pd));
      paramIndex++;
    }

    if (totalNetProfit) {
      query += ` AND (results->>'totalNetProfit')::numeric ${ops.totalNetProfit} $${paramIndex}`;
      params.push(parseFloat(totalNetProfit));
      paramIndex++;
    }

    if (totalTrades) {
      query += ` AND (results->>'totalTrades')::integer ${ops.totalTrades} $${paramIndex}`;
      params.push(parseInt(totalTrades));
      paramIndex++;
    }

    if (winrate) {
      query += ` AND (
        SUBSTRING(results->>'profitTrades' FROM '\\(([0-9.]+)%\\)')::numeric
      ) ${ops.winrate} $${paramIndex}`;
      params.push(parseFloat(winrate));
      paramIndex++;
    }

    if (largestProfitTradeRatio) {
      query += ` AND (
        (results->>'largestProfitTrade')::numeric / 
        NULLIF((results->>'totalNetProfit')::numeric, 0) * 100
      ) ${ops.largestProfitTradeRatio} $${paramIndex}`;
      params.push(parseFloat(largestProfitTradeRatio));
      paramIndex++;
    }

    if (riskRewardRatio) {
      query += ` AND (
        CASE 
          WHEN (results->>'averageLossTrade') IS NOT NULL 
            AND (results->>'averageProfitTrade') IS NOT NULL
            AND (results->>'averageLossTrade')::numeric != 0
          THEN (results->>'averageProfitTrade')::numeric / ABS((results->>'averageLossTrade')::numeric)
          ELSE 0
        END
      ) ${ops.riskRewardRatio} $${paramIndex}`;
      params.push(parseFloat(riskRewardRatio));
      paramIndex++;
    }

    if (drawdown) {
      // ✅ Support both % and absolute drawdown
      const drawdownUnitIds = operators?._drawdownUnit || 'percent';
      const drawdownExprIds = drawdownUnitIds === 'absolute'
        ? `regexp_replace(split_part(results->>'balanceDrawdownMaximal', '(', 1), '[^0-9\\.]', '', 'g')::numeric`
        : `CAST(SUBSTRING(results->>'balanceDrawdownMaximal' FROM '\\(([0-9.]+)%\\)') AS numeric)`;

      query += ` AND (
        CASE 
          WHEN (results->>'balanceDrawdownMaximal') IS NOT NULL 
          THEN ${drawdownExprIds}
          ELSE 0
        END
      ) ${ops.drawdown} $${paramIndex}`;
      params.push(parseFloat(drawdown));
      paramIndex++;
    }

    if (largestLossTrade) {
      query += ` AND (results->>'largestLossTrade') IS NOT NULL 
        AND ABS((results->>'largestLossTrade')::numeric) ${ops.largestLossTrade} $${paramIndex}`;
      params.push(parseFloat(largestLossTrade));
      paramIndex++;
    }

    if (profitFactor) {
      query += ` AND (results->>'profitFactor')::numeric ${ops.profitFactor} $${paramIndex}`;
      params.push(parseFloat(profitFactor));
      paramIndex++;
    }

    if (sharpeRatio) {
      query += ` AND (results->>'sharpeRatio')::numeric ${ops.sharpeRatio} $${paramIndex}`;
      params.push(parseFloat(sharpeRatio));
      paramIndex++;
    }

    if (recoveryFactor) {
      query += ` AND (results->>'recoveryFactor')::numeric ${ops.recoveryFactor} $${paramIndex}`;
      params.push(parseFloat(recoveryFactor));
      paramIndex++;
    }

    if (lrCorrelation) {
      query += ` AND (results->>'lrCorrelation')::numeric ${ops.lrCorrelation} $${paramIndex}`;
      params.push(parseFloat(lrCorrelation));
      paramIndex++;
    }

    // ── Range filters (operator === 'range') ─────────────────────────────────
    const addRangeIdsQ = (key, expression, isInt = false) => {
      if (operators?.[key] !== 'range' || !ranges?.[key]) return;
      const r = ranges[key];
      const parse = isInt ? (v) => parseInt(v, 10) : parseFloat;
      if (r.min !== undefined && r.min !== '' && r.min !== null) {
        query += ` AND (${expression}) >= $${paramIndex}`;
        params.push(parse(r.min)); paramIndex++;
      }
      if (r.max !== undefined && r.max !== '' && r.max !== null) {
        query += ` AND (${expression}) <= $${paramIndex}`;
        params.push(parse(r.max)); paramIndex++;
      }
    };
    addRangeIdsQ('pd', `(results->>'totalNetProfit')::numeric / NULLIF(regexp_replace(split_part(results->>'balanceDrawdownMaximal', '(', 1), '[^0-9\\.]', '', 'g')::numeric, 0)`);
    addRangeIdsQ('totalNetProfit', `(results->>'totalNetProfit')::numeric`);
    addRangeIdsQ('totalTrades', `(results->>'totalTrades')::integer`, true);
    addRangeIdsQ('winrate', `SUBSTRING(results->>'profitTrades' FROM '\\(([0-9.]+)%\\)')::numeric`);
    addRangeIdsQ('largestProfitTradeRatio', `(results->>'largestProfitTrade')::numeric / NULLIF((results->>'totalNetProfit')::numeric, 0) * 100`);
    addRangeIdsQ('riskRewardRatio', `CASE WHEN (results->>'averageLossTrade') IS NOT NULL AND (results->>'averageProfitTrade') IS NOT NULL AND (results->>'averageLossTrade')::numeric != 0 THEN (results->>'averageProfitTrade')::numeric / ABS((results->>'averageLossTrade')::numeric) ELSE 0 END`);

    // ✅ Drawdown - support both % and absolute value
    const drawdownUnitIdsRange = operators?._drawdownUnit || 'percent';
    const drawdownExpressionIds = drawdownUnitIdsRange === 'absolute'
      ? `regexp_replace(split_part(results->>'balanceDrawdownMaximal', '(', 1), '[^0-9\\.]', '', 'g')::numeric`
      : `CASE WHEN (results->>'balanceDrawdownMaximal') IS NOT NULL THEN CAST(SUBSTRING(results->>'balanceDrawdownMaximal' FROM '\\(([0-9.]+)%\\)') AS numeric) ELSE 0 END`;
    addRangeIdsQ('drawdown', drawdownExpressionIds);

    addRangeIdsQ('profitFactor', `(results->>'profitFactor')::numeric`);
    addRangeIdsQ('sharpeRatio', `(results->>'sharpeRatio')::numeric`);
    addRangeIdsQ('recoveryFactor', `(results->>'recoveryFactor')::numeric`);
    addRangeIdsQ('lrCorrelation', `(results->>'lrCorrelation')::numeric`);
    if (operators?.largestLossTrade === 'range' && ranges?.largestLossTrade) {
      const r = ranges.largestLossTrade;
      query += ` AND (results->>'largestLossTrade') IS NOT NULL`;
      if (r.min !== undefined && r.min !== '' && r.min !== null) {
        query += ` AND ABS((results->>'largestLossTrade')::numeric) >= $${paramIndex}`;
        params.push(parseFloat(r.min)); paramIndex++;
      }
      if (r.max !== undefined && r.max !== '' && r.max !== null) {
        query += ` AND ABS((results->>'largestLossTrade')::numeric) <= $${paramIndex}`;
        params.push(parseFloat(r.max)); paramIndex++;
      }
    }

    // Same sorting as getPagedStrategies
    query += `
      ORDER BY
        CASE symbol
          WHEN 'BTCUSD' THEN 1
          WHEN 'ETHUSD' THEN 2
          WHEN 'XAUUSD' THEN 3
          WHEN 'XAGUSD' THEN 4
          WHEN 'US500' THEN 5
          WHEN 'DE30' THEN 6
          WHEN 'JP225' THEN 7
          WHEN 'HK50' THEN 8
          WHEN 'USOIL' THEN 9
          ELSE 999
        END ASC,
        SUBSTRING(strategy_id FROM '^(\\d+)')::INTEGER ASC,
        SUBSTRING(strategy_id FROM 'H(\\d+)')::INTEGER ASC,
        CASE 
          WHEN strategy_id ~ 'B$' THEN 1
          WHEN strategy_id ~ 'S$' THEN 2
          ELSE 3
        END ASC,
        strategy_id ASC
    `;

    const result = await pool.query(query, params);

    // Return only array of IDs (strings)
    return result.rows.map((row) => row.strategy_id);
  } catch (err) {
    console.error("❌ Error in getStrategyIdsOnly:", err);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// User preferences (strategy filters per user)
// ─────────────────────────────────────────────────────────────────────────────
async function initUserPreferencesTable() {
  console.log('[DB] User preferences consolidated into users table');
}

async function getUserPreferences(userId) {
  const { rows } = await pool.query(
    `SELECT preferences FROM users WHERE id = $1`,
    [userId]
  );
  const prefs = rows[0]?.preferences || {};
  return prefs.strategy_filters || {};
}

async function saveUserPreferences(userId, strategyFilters) {
  const { rows } = await pool.query(
    `UPDATE users
     SET preferences = jsonb_set(
       COALESCE(preferences, '{}'::jsonb),
       '{strategy_filters}',
       $2::jsonb
     )
     WHERE id = $1
     RETURNING preferences`,
    [userId, JSON.stringify(strategyFilters)]
  );
  return { strategy_filters: rows[0]?.preferences?.strategy_filters || strategyFilters };
}

// Lấy danh sách strategies theo khoảng thời gian
const { getStrategiesByTimeRange } = require("./strategyTimeRangeDao");

module.exports = {
  initStrategyMetadataTable,
  initUserPreferencesTable,
  getUserPreferences,
  saveUserPreferences,
  upsertStrategyMetadata,
  getStrategyMetadata,
  getAllVersionsOfStrategy,
  getStrategiesByBacktestTable,
  getPagedStrategies,
  getStrategyIdsOnly,
  deleteStrategyMetadata,
  deleteStrategiesByBacktestTable,
  getDistinctSymbols,
  getStrategyStatistics,
  batchUpsertStrategies,
  getStrategyDealsCount,
  batchGetStrategyDealsCounts,
  getStrategiesByTimeRange,
  getAggregatedFilteredStats,  // ✅ NEW
};

/**
 * ✅ NEW: Lấy thống kê aggregation của toàn bộ filtered strategies
 * Chạy SQL aggregation trực tiếp thay vì load hàng nghìn rows
 */
async function getAggregatedFilteredStats({
  backtestTable, symbol, search, type, timeframe,
  pd, totalNetProfit, totalTrades, winrate, largestProfitTradeRatio,
  riskRewardRatio, drawdown, largestLossTrade, profitFactor,
  sharpeRatio, recoveryFactor, lrCorrelation,
  operators = {}, ranges = {},
}) {
  try {
    const filterResult = buildFilterClauses({
      backtestTable, symbol, search, type, timeframe,
      pd, totalNetProfit, totalTrades, winrate, largestProfitTradeRatio,
      riskRewardRatio, drawdown, largestLossTrade, profitFactor,
      sharpeRatio, recoveryFactor, lrCorrelation,
      operators, ranges,
      paramIndex: 1,
      params: []
    });

    const whereClause = "WHERE 1=1" + filterResult.clause;
    const params = filterResult.params;

    // Aggregation query
    const query = `
      SELECT 
        COUNT(*) as total,
        -- P/D
        AVG((results->>'totalNetProfit')::numeric / NULLIF(regexp_replace(split_part(results->>'balanceDrawdownMaximal', '(', 1), '[^0-9\\.]', '', 'g')::numeric, 0)) as avg_pd,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (results->>'totalNetProfit')::numeric / NULLIF(regexp_replace(split_part(results->>'balanceDrawdownMaximal', '(', 1), '[^0-9\\.]', '', 'g')::numeric, 0)) as median_pd,
        COUNT(CASE WHEN ((results->>'totalNetProfit')::numeric / NULLIF(regexp_replace(split_part(results->>'balanceDrawdownMaximal', '(', 1), '[^0-9\\.]', '', 'g')::numeric, 0)) >= 5 THEN 1 END) as count_pd_above_5,
        -- Winrate
        AVG(SUBSTRING(results->>'profitTrades' FROM '\\(([0-9.]+)%\\)')::numeric) as avg_winrate,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY SUBSTRING(results->>'profitTrades' FROM '\\(([0-9.]+)%\\)')::numeric) as median_winrate,
        COUNT(CASE WHEN SUBSTRING(results->>'profitTrades' FROM '\\(([0-9.]+)%\\)')::numeric >= 60 THEN 1 END) as count_winrate_above_60,
        COUNT(CASE WHEN SUBSTRING(results->>'profitTrades' FROM '\\(([0-9.]+)%\\)')::numeric <= 40 THEN 1 END) as count_winrate_below_40,
        -- Profit Factor
        AVG((results->>'profitFactor')::numeric) as avg_profit_factor,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (results->>'profitFactor')::numeric) as median_profit_factor,
        COUNT(CASE WHEN (results->>'profitFactor')::numeric >= 2 THEN 1 END) as count_pf_above_2,
        -- Sharpe Ratio
        AVG((results->>'sharpeRatio')::numeric) as avg_sharpe,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (results->>'sharpeRatio')::numeric) as median_sharpe,
        COUNT(CASE WHEN (results->>'sharpeRatio')::numeric >= 2 THEN 1 END) as count_sharpe_above_2,
        -- Recovery Factor
        AVG((results->>'recoveryFactor')::numeric) as avg_recovery,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (results->>'recoveryFactor')::numeric) as median_recovery,
        COUNT(CASE WHEN (results->>'recoveryFactor')::numeric >= 3 THEN 1 END) as count_recovery_above_3,
        -- LR Correlation
        AVG((results->>'lrCorrelation')::numeric) as avg_lr_correlation,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (results->>'lrCorrelation')::numeric) as median_lr_correlation,
        COUNT(CASE WHEN (results->>'lrCorrelation')::numeric >= 0.9 THEN 1 END) as count_lr_above_09,
        -- Drawdown %
        AVG(CAST(SUBSTRING(results->>'balanceDrawdownMaximal' FROM '\\(([0-9.]+)%\\)') AS numeric)) as avg_drawdown_pct,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY CAST(SUBSTRING(results->>'balanceDrawdownMaximal' FROM '\\(([0-9.]+)%\\)') AS numeric)) as median_drawdown_pct,
        -- Largest Profit Trade Ratio
        AVG((results->>'largestProfitTrade')::numeric / NULLIF((results->>'totalNetProfit')::numeric, 0) * 100) as avg_lptr,
        COUNT(CASE WHEN ((results->>'largestProfitTrade')::numeric / NULLIF((results->>'totalNetProfit')::numeric, 0) * 100) >= 30 THEN 1 END) as count_lptr_above_30
      FROM strategy_metadata
      ${whereClause}
    `;

    const result = await pool.query(query, params);
    const row = result.rows[0];

    return {
      total: parseInt(row.total) || 0,
      pd: {
        avg: row.avg_pd ? +parseFloat(row.avg_pd).toFixed(2) : null,
        median: row.median_pd ? +parseFloat(row.median_pd).toFixed(2) : null,
        pct_above_5: row.total > 0 ? +((row.count_pd_above_5 / row.total) * 100).toFixed(1) : null,
      },
      winrate: {
        avg: row.avg_winrate ? +parseFloat(row.avg_winrate).toFixed(1) : null,
        median: row.median_winrate ? +parseFloat(row.median_winrate).toFixed(1) : null,
        pct_above_60: row.total > 0 ? +((row.count_winrate_above_60 / row.total) * 100).toFixed(1) : null,
        pct_below_40: row.total > 0 ? +((row.count_winrate_below_40 / row.total) * 100).toFixed(1) : null,
      },
      profit_factor: {
        avg: row.avg_profit_factor ? +parseFloat(row.avg_profit_factor).toFixed(2) : null,
        median: row.median_profit_factor ? +parseFloat(row.median_profit_factor).toFixed(2) : null,
        pct_above_2: row.total > 0 ? +((row.count_pf_above_2 / row.total) * 100).toFixed(1) : null,
      },
      sharpe_ratio: {
        avg: row.avg_sharpe ? +parseFloat(row.avg_sharpe).toFixed(2) : null,
        median: row.median_sharpe ? +parseFloat(row.median_sharpe).toFixed(2) : null,
        pct_above_2: row.total > 0 ? +((row.count_sharpe_above_2 / row.total) * 100).toFixed(1) : null,
      },
      recovery_factor: {
        avg: row.avg_recovery ? +parseFloat(row.avg_recovery).toFixed(2) : null,
        median: row.median_recovery ? +parseFloat(row.median_recovery).toFixed(2) : null,
        pct_above_3: row.total > 0 ? +((row.count_recovery_above_3 / row.total) * 100).toFixed(1) : null,
      },
      lr_correlation: {
        avg: row.avg_lr_correlation ? +parseFloat(row.avg_lr_correlation).toFixed(3) : null,
        median: row.median_lr_correlation ? +parseFloat(row.median_lr_correlation).toFixed(3) : null,
        pct_above_09: row.total > 0 ? +((row.count_lr_above_09 / row.total) * 100).toFixed(1) : null,
      },
      drawdown_pct: {
        avg: row.avg_drawdown_pct ? +parseFloat(row.avg_drawdown_pct).toFixed(2) : null,
        median: row.median_drawdown_pct ? +parseFloat(row.median_drawdown_pct).toFixed(2) : null,
      },
      largest_profit_trade_ratio: {
        avg: row.avg_lptr ? +parseFloat(row.avg_lptr).toFixed(1) : null,
        pct_above_30: row.total > 0 ? +((row.count_lptr_above_30 / row.total) * 100).toFixed(1) : null,
      },
    };
  } catch (err) {
    console.error("❌ Error in getAggregatedFilteredStats:", err);
    throw err;
  }
}
