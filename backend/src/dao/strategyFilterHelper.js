const safeOp = (op) => {
  const allowed = [">=", "<=", "=", ">", "<", "!="];
  return allowed.includes(op) ? op : ">=";
};

const buildFilterClauses = ({
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
  paramIndex = 1,
  params = []
}) => {
  let clause = "";
  
  const ops = {
    pd:                      safeOp(operators?.pd),
    totalNetProfit:          safeOp(operators?.totalNetProfit),
    totalTrades:             safeOp(operators?.totalTrades),
    winrate:                 safeOp(operators?.winrate),
    largestProfitTradeRatio: safeOp(operators?.largestProfitTradeRatio),
    riskRewardRatio:         safeOp(operators?.riskRewardRatio),
    drawdown:                safeOp(operators?.drawdown),
    largestLossTrade:        safeOp(operators?.largestLossTrade),
    profitFactor:            safeOp(operators?.profitFactor),
    sharpeRatio:             safeOp(operators?.sharpeRatio),
    recoveryFactor:          safeOp(operators?.recoveryFactor),
    lrCorrelation:           safeOp(operators?.lrCorrelation),
  };

  // `all_backtests` is a request sentinel, not a physical table name.
  if (backtestTable && backtestTable !== 'all_backtests') {
    if (typeof backtestTable === 'string' && backtestTable.includes(',')) {
      const tableList = backtestTable.split(',').map(t => t.trim()).filter(Boolean);
      const placeholders = tableList.map((_, i) => `$${paramIndex + i}`).join(', ');
      clause += ` AND backtest_table IN (${placeholders})`;
      params.push(...tableList);
      paramIndex += tableList.length;
    } else {
      clause += ` AND backtest_table = $${paramIndex}`;
      params.push(backtestTable);
      paramIndex++;
    }
  }

  if (symbol) {
    if (symbol.includes(',')) {
      const symbolList = symbol.split(',').map(s => s.trim()).filter(Boolean);
      const placeholders = symbolList.map((_, i) => `$${paramIndex + i}`).join(', ');
      clause += ` AND symbol IN (${placeholders})`;
      params.push(...symbolList);
      paramIndex += symbolList.length;
    } else {
      clause += ` AND symbol = $${paramIndex}`;
      params.push(symbol);
      paramIndex++;
    }
  }

  if (search) {
    clause += ` AND strategy_id ILIKE $${paramIndex}`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  if (timeframe) {
    clause += ` AND timeframe = $${paramIndex}`;
    params.push(timeframe);
    paramIndex++;
  }

  if (type === "buy") {
    clause += " AND (settings->'inputs'->>'AcceptBuy' IN ('true', '1') OR (settings->'inputs'->'AcceptBuy')::text::boolean = true)";
  } else if (type === "sell") {
    clause += " AND (settings->'inputs'->>'AcceptSell' IN ('true', '1') OR (settings->'inputs'->'AcceptSell')::text::boolean = true)";
  }

  if (pd) {
    clause += ` AND (
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
    clause += ` AND (results->>'totalNetProfit')::numeric ${ops.totalNetProfit} $${paramIndex}`;
    params.push(parseFloat(totalNetProfit));
    paramIndex++;
  }

  if (totalTrades) {
    clause += ` AND (results->>'totalTrades')::integer ${ops.totalTrades} $${paramIndex}`;
    params.push(parseInt(totalTrades));
    paramIndex++;
  }

  if (winrate) {
    clause += ` AND (
      SUBSTRING(results->>'profitTrades' FROM '\\(([0-9.]+)%\\)')::numeric
    ) ${ops.winrate} $${paramIndex}`;
    params.push(parseFloat(winrate));
    paramIndex++;
  }

  if (largestProfitTradeRatio) {
    clause += ` AND (
      (results->>'largestProfitTrade')::numeric / 
      NULLIF((results->>'totalNetProfit')::numeric, 0) * 100
    ) ${ops.largestProfitTradeRatio} $${paramIndex}`;
    params.push(parseFloat(largestProfitTradeRatio));
    paramIndex++;
  }

  if (riskRewardRatio) {
    clause += ` AND (
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

  const drawdownUnit = operators?._drawdownUnit || 'percent';
  if (drawdown) {
    let drawdownExpression;
    if (drawdownUnit === 'absolute') {
      drawdownExpression = `regexp_replace(split_part(results->>'balanceDrawdownMaximal', '(', 1), '[^0-9\\.]', '', 'g')::numeric`;
    } else {
      drawdownExpression = `CAST(SUBSTRING(results->>'balanceDrawdownMaximal' FROM '\\(([0-9.]+)%\\)') AS numeric)`;
    }
    clause += ` AND (
      CASE 
        WHEN (results->>'balanceDrawdownMaximal') IS NOT NULL 
        THEN ${drawdownExpression}
        ELSE 0
      END
    ) ${ops.drawdown} $${paramIndex}`;
    params.push(parseFloat(drawdown));
    paramIndex++;
  }

  if (largestLossTrade) {
    clause += ` AND (results->>'largestLossTrade') IS NOT NULL 
      AND ABS((results->>'largestLossTrade')::numeric) ${ops.largestLossTrade} $${paramIndex}`;
    params.push(parseFloat(largestLossTrade));
    paramIndex++;
  }

  if (profitFactor) {
    clause += ` AND (results->>'profitFactor')::numeric ${ops.profitFactor} $${paramIndex}`;
    params.push(parseFloat(profitFactor));
    paramIndex++;
  }

  if (sharpeRatio) {
    clause += ` AND (results->>'sharpeRatio')::numeric ${ops.sharpeRatio} $${paramIndex}`;
    params.push(parseFloat(sharpeRatio));
    paramIndex++;
  }

  if (recoveryFactor) {
    clause += ` AND (results->>'recoveryFactor')::numeric ${ops.recoveryFactor} $${paramIndex}`;
    params.push(parseFloat(recoveryFactor));
    paramIndex++;
  }

  if (lrCorrelation) {
    clause += ` AND (results->>'lrCorrelation')::numeric ${ops.lrCorrelation} $${paramIndex}`;
    params.push(parseFloat(lrCorrelation));
    paramIndex++;
  }

  // Range filters
  const addRangeQ = (key, expression, isInt = false) => {
    if (operators?.[key] !== 'range' || !ranges?.[key]) return;
    const r = ranges[key];
    const parse = isInt ? (v) => parseInt(v, 10) : parseFloat;
    if (r.min !== undefined && r.min !== '' && r.min !== null) {
      clause += ` AND (${expression}) >= $${paramIndex}`;
      params.push(parse(r.min)); paramIndex++;
    }
    if (r.max !== undefined && r.max !== '' && r.max !== null) {
      clause += ` AND (${expression}) <= $${paramIndex}`;
      params.push(parse(r.max)); paramIndex++;
    }
  };

  addRangeQ('pd', `(results->>'totalNetProfit')::numeric / NULLIF(regexp_replace(split_part(results->>'balanceDrawdownMaximal', '(', 1), '[^0-9\\.]', '', 'g')::numeric, 0)`);
  addRangeQ('totalNetProfit', `(results->>'totalNetProfit')::numeric`);
  addRangeQ('totalTrades', `(results->>'totalTrades')::integer`, true);
  addRangeQ('winrate', `SUBSTRING(results->>'profitTrades' FROM '\\(([0-9.]+)%\\)')::numeric`);
  addRangeQ('largestProfitTradeRatio', `(results->>'largestProfitTrade')::numeric / NULLIF((results->>'totalNetProfit')::numeric, 0) * 100`);
  addRangeQ('riskRewardRatio', `CASE WHEN (results->>'averageLossTrade') IS NOT NULL AND (results->>'averageProfitTrade') IS NOT NULL AND (results->>'averageLossTrade')::numeric != 0 THEN (results->>'averageProfitTrade')::numeric / ABS((results->>'averageLossTrade')::numeric) ELSE 0 END`);
  
  const drawdownUnitForRange = operators?._drawdownUnit || 'percent';
  const drawdownExpressionRange = drawdownUnitForRange === 'absolute'
    ? `regexp_replace(split_part(results->>'balanceDrawdownMaximal', '(', 1), '[^0-9\\.]', '', 'g')::numeric`
    : `CASE WHEN (results->>'balanceDrawdownMaximal') IS NOT NULL THEN CAST(SUBSTRING(results->>'balanceDrawdownMaximal' FROM '\\(([0-9.]+)%\\)') AS numeric) ELSE 0 END`;
  addRangeQ('drawdown', drawdownExpressionRange);
  
  addRangeQ('profitFactor', `(results->>'profitFactor')::numeric`);
  addRangeQ('sharpeRatio', `(results->>'sharpeRatio')::numeric`);
  addRangeQ('recoveryFactor', `(results->>'recoveryFactor')::numeric`);
  addRangeQ('lrCorrelation', `(results->>'lrCorrelation')::numeric`);

  if (operators?.largestLossTrade === 'range' && ranges?.largestLossTrade) {
    const r = ranges.largestLossTrade;
    clause += ` AND (results->>'largestLossTrade') IS NOT NULL`;
    if (r.min !== undefined && r.min !== '' && r.min !== null) {
      clause += ` AND ABS((results->>'largestLossTrade')::numeric) >= $${paramIndex}`;
      params.push(parseFloat(r.min)); paramIndex++;
    }
    if (r.max !== undefined && r.max !== '' && r.max !== null) {
      clause += ` AND ABS((results->>'largestLossTrade')::numeric) <= $${paramIndex}`;
      params.push(parseFloat(r.max)); paramIndex++;
    }
  }

  return { clause, params, paramIndex };
};

module.exports = {
  buildFilterClauses,
  safeOp
};
