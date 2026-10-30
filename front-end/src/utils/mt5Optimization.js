import { parseSymbolAndTimeframe } from './strategyNaming';

const value = (source, keys, fallback = 0) => {
  for (const key of keys) {
    if (source?.[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
  }
  return fallback;
};

const parseMt5Number = (rawValue) => {
  if (typeof rawValue === 'number') return Number.isFinite(rawValue) ? rawValue : 0;
  const match = String(rawValue ?? '')
    .replace(/\s/g, '')
    .replace(/,/g, '')
    .match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
};

const parseMt5Drawdown = (rawValue) => {
  const text = String(rawValue ?? '');
  const percentageMatch = text.match(/\((-?\d+(?:[.,]\d+)?)%\)/) || text.match(/(-?\d+(?:[.,]\d+)?)%/);
  return {
    amount: Math.abs(parseMt5Number(text)),
    percentage: percentageMatch ? Number(percentageMatch[1].replace(',', '.')) : 0
  };
};

const inferStrategyParts = (strategyId = '') => {
  const parsed = parseSymbolAndTimeframe(strategyId);
  if (parsed.symbol && parsed.symbol !== '-') return parsed;
  const clean = String(strategyId || '').replace(/^\d+/, '');
  const m = clean.match(/([A-Z0-9]+?)(M\d+|H\d+|D1|W1|MN\d*)[A-Z]*$/i);
  return { symbol: m?.[1] || clean || '-', timeframe: m?.[2]?.toUpperCase() || '-' };
};

const mapResult = (row, useBacktestMetrics) => {
  const optimizationMetrics = row.metrics || row.summary_op?.metrics || {};
  const backtestMetrics = row.backtest_results || row.summary_bt?.results || null;
  const metrics = useBacktestMetrics ? backtestMetrics || {} : optimizationMetrics;
  const settings = row.backtest_settings || row.summary_bt?.settings || {};
  const hasBacktestResults = useBacktestMetrics && Boolean(backtestMetrics);
  const inputs = row.inputs || row.summary_op?.inputs || {};
  const parts = inferStrategyParts(row.strategy_id);
  const periodText = String(value(settings, ['Period', 'period'], ''));
  const periodDates = periodText.match(/(\d{4}[.-]\d{2}[.-]\d{2})\s*-\s*(\d{4}[.-]\d{2}[.-]\d{2})/);
  const normalizeDate = (date) => String(date || '').replace(/\./g, '-');
  const profit = parseMt5Number(value(metrics, ['Profit', 'profit', 'Total Net Profit', 'totalNetProfit', 'total_net_profit']));
  const recoveryFactor = parseMt5Number(value(metrics, ['Recovery Factor', 'recoveryFactor', 'recovery_factor']));
  const balanceDrawdown = parseMt5Drawdown(
    value(metrics, ['Balance Drawdown Maximal', 'balanceDrawdownMaximal', 'Balance DD', 'balance_drawdown'], '')
  );
  let drawdownDollar = hasBacktestResults
    ? balanceDrawdown.amount
    : Math.abs(parseMt5Number(value(metrics, ['Equity DD', 'Balance DD', 'drawdown', 'Drawdown'])));
  if (!hasBacktestResults && !drawdownDollar && recoveryFactor > 0 && profit > 0) {
    drawdownDollar = profit / recoveryFactor;
  }
  const drawdownPct = hasBacktestResults
    ? balanceDrawdown.percentage
    : parseMt5Number(value(metrics, ['Equity DD %', 'Balance DD %', 'Drawdown %', 'drawdown_pct']));
  const result = Number(value(metrics, ['Result', 'result', 'Custom', 'custom'], 0));
  const pdRatioVal = Number(value(metrics, ['P/D', 'pd_ratio', 'pdRatio', 'PD Ratio']));
  const pdRatio = hasBacktestResults
    ? (drawdownDollar > 0 ? profit / drawdownDollar : 0)
    : (pdRatioVal > 0 ? pdRatioVal : (drawdownDollar > 0 ? profit / drawdownDollar : (recoveryFactor || 0)));
  const openPriceRecovery = parseMt5Number(value(optimizationMetrics, ['Recovery Factor', 'recoveryFactor', 'recovery_factor']));
  const openPriceDrawdownAmount = Math.abs(
    parseMt5Number(value(optimizationMetrics, ['Equity DD', 'Balance DD', 'drawdown', 'Drawdown']))
  );
  const openPriceProfit = parseMt5Number(
    value(optimizationMetrics, ['Profit', 'profit', 'Total Net Profit', 'totalNetProfit', 'total_net_profit'])
  );
  return {
    id: row.id,
    candidateId: row.strategy_id_r,
    passNumber: Number(row.pass ?? row.summary_op?.pass ?? row.id),
    totalPasses: Number(row.total_passes || 0),
    strategy: row.strategy_id,
    strategyId: row.strategy_id,
    strategyName: row.strategy_id,
    symbol: parts.symbol,
    timeframe: parts.timeframe,
    session: row.session_id,
    result,
    profit,
    profitFactor: Number(value(metrics, ['Profit Factor', 'profit_factor'])),
    recoveryFactor,
    sharpeRatio: Number(value(metrics, ['Sharpe Ratio', 'sharpe_ratio'])),
    drawdownDollar,
    drawdownPct,
    pdRatio,
    largestLossTrade: parseMt5Number(value(metrics, ['Largest Loss Trade', 'largestLossTrade', 'largest_loss_trade'])),
    trades: parseMt5Number(value(metrics, ['Trades', 'Total Trades', 'totalTrades', 'total_trades'])),
    winRate: Number(value(metrics, ['Win Rate', 'win_rate'])),
    expectedPayoff: Number(value(metrics, ['Expected Payoff', 'expected_payoff'])),
    openPriceMetrics: {
      profit: openPriceProfit,
      profitFactor: parseMt5Number(value(optimizationMetrics, ['Profit Factor', 'profit_factor'])),
      recoveryFactor: openPriceRecovery,
      sharpeRatio: parseMt5Number(value(optimizationMetrics, ['Sharpe Ratio', 'sharpe_ratio'])),
      drawdownDollar: openPriceDrawdownAmount || (openPriceRecovery > 0 && openPriceProfit > 0 ? openPriceProfit / openPriceRecovery : 0),
      drawdownPct: parseMt5Number(value(optimizationMetrics, ['Equity DD %', 'Balance DD %', 'Drawdown %', 'drawdown_pct'])),
      trades: parseMt5Number(value(optimizationMetrics, ['Trades', 'Total Trades', 'totalTrades', 'total_trades']))
    },
    parameters: inputs,
    clusterResultIds: Array.isArray(row.cluster_result_ids) ? row.cluster_result_ids : [],
    clusterRows: Array.isArray(row.cluster_rows) ? row.cluster_rows : [],
    templateIni: row.template_ini || row.summary_op?.template_ini || null,
    isWatchlist: Boolean(row.picked_watchlist),
    isCandidate: Boolean(row.picked_bt),
    isStaging: Boolean(row.picked_bt_staging),
    backtestCompleted: Boolean(row.backtest_completed || row.summary_bt),
    backtestRunCount: Number(row.backtest_run_count || 0),
    status: row.backtest_completed ? 'BACKTESTED' : 'STORED',
    syncStatus: row.sync_status,
    sourceTable: row.source_table,
    startDate: normalizeDate(value(settings, ['From', 'period_start', 'from'], periodDates?.[1] || '')),
    endDate: normalizeDate(value(settings, ['To', 'period_end', 'to'], periodDates?.[2] || '')),
    passedAt: row.created_at ? new Date(row.created_at).toLocaleString() : '',
    createdAt: row.created_at
  };
};

export const mapMt5Result = (row) => mapResult(row, false);
export const mapMt5BacktestResult = (row) => mapResult(row, true);
