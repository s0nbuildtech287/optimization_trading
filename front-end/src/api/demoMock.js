const monthlyProfit = [
  ['Jan', 12840],
  ['Feb', 16420],
  ['Mar', 14310],
  ['Apr', 21780],
  ['May', 18950],
  ['Jun', 24620],
  ['Jul', 22840],
  ['Aug', 27930],
  ['Sep', 25410],
  ['Oct', 31260],
  ['Nov', 28640],
  ['Dec', 34780]
].map(([month, profit]) => ({ month, profit }));

const ranking = [
  {
    strategyId: 'DEMO-DE30-H1-01',
    backtestTable: 'demo_quant_portfolio',
    totalNetProfit: 84260,
    profitFactor: 2.48,
    recoveryFactor: 7.91,
    expectedPayoff: 328.4,
    lrCorrelation: 0.94,
    largestProfitTrade: 4850,
    drawdownPct: 6.72,
    pd: 12.54,
    sharpe: 3.84,
    totalTrades: 256,
    composite: 92.4
  },
  {
    strategyId: 'DEMO-XAU-H4-02',
    backtestTable: 'demo_quant_portfolio',
    totalNetProfit: 71940,
    profitFactor: 2.21,
    recoveryFactor: 6.84,
    expectedPayoff: 291.7,
    lrCorrelation: 0.91,
    largestProfitTrade: 4240,
    drawdownPct: 7.18,
    pd: 10.02,
    sharpe: 3.46,
    totalTrades: 247,
    composite: 88.7
  },
  {
    strategyId: 'DEMO-OIL-H1-03',
    backtestTable: 'demo_quant_portfolio',
    totalNetProfit: 53810,
    profitFactor: 1.96,
    recoveryFactor: 5.73,
    expectedPayoff: 234.2,
    lrCorrelation: 0.88,
    largestProfitTrade: 3680,
    drawdownPct: 8.42,
    pd: 6.39,
    sharpe: 2.91,
    totalTrades: 230,
    composite: 82.1
  },
  {
    strategyId: 'DEMO-EUR-H1-04',
    backtestTable: 'demo_quant_portfolio',
    totalNetProfit: 42670,
    profitFactor: 1.82,
    recoveryFactor: 5.18,
    expectedPayoff: 198.6,
    lrCorrelation: 0.86,
    largestProfitTrade: 2940,
    drawdownPct: 5.96,
    pd: 7.16,
    sharpe: 2.76,
    totalTrades: 215,
    composite: 78.9
  }
];

const behavior = {
  summary: { flaggedBias: 2, mismatch: 1, criticalActivity: 1 },
  strategyYears: ranking.map((row) => ({ id: row.strategyId, years: 5 })),
  directionalBiasData: [
    { id: 'DEMO-DE30-H1-01', weakPct: 46 },
    { id: 'DEMO-XAU-H4-02', weakPct: 41 },
    { id: 'DEMO-OIL-H1-03', weakPct: 18 },
    { id: 'DEMO-EUR-H1-04', weakPct: 17 }
  ],
  timeframeMismatchData: [{ id: 'DEMO-OIL-H1-03' }],
  activityGapData: [{ id: 'DEMO-EUR-H1-04', maxGap: 44, zeroMonths: 2 }],
  holdingRecoveryData: [
    { id: 'DEMO-DE30-H1-01', status: 'Stable' },
    { id: 'DEMO-XAU-H4-02', status: 'Stable' },
    { id: 'DEMO-OIL-H1-03', status: 'Review' },
    { id: 'DEMO-EUR-H1-04', status: 'Loss Averse' }
  ]
};

const overviewCore = {
  overview: {
    totalStrategies: 24,
    totalSymbols: 8,
    totalDeals: 5248,
    totalProfit: 252680,
    avgProfitPerDeal: 48.15,
    winRate: 62.8,
    totalCommission: -12840,
    totalSwap: -3940
  },
  fileOptimizationCheck: { totalFiles: 24, passedFiles: 21, failedFiles: 3, totalBacktests: 5248, cleanRate: 87.5 },
  riskFlagsCheck: {
    totalStrategies: 24,
    riskStrategies: 5,
    hardFlaggedStrategies: 2,
    softFlaggedStrategies: 3,
    warningStrategies: 2,
    errorRate: 20.8
  }
};

const comparative = {
  ranking,
  averages: [
    { symbol: 'DE30', pd: 12.54, profit: 84260, sharpe: 3.84 },
    { symbol: 'XAUUSD', pd: 10.02, profit: 71940, sharpe: 3.46 },
    { symbol: 'USOIL', pd: 6.39, profit: 53810, sharpe: 2.91 },
    { symbol: 'EURUSD', pd: 7.16, profit: 42670, sharpe: 2.76 }
  ],
  duels: [
    {
      h1: { profit: 68540, sharpe: 3.28, pf: 2.18, drawdownPct: 6.8, pd: 10.1 },
      h4: { profit: 61220, sharpe: 3.05, pf: 2.07, drawdownPct: 7.3, pd: 8.4 }
    }
  ],
  obOs: [
    {
      ob: { profit: 66120, winrate: 64, trades: 238, sharpe: 3.31, pf: 2.2 },
      os: { profit: 59840, winrate: 61, trades: 226, sharpe: 3.02, pf: 2.05 }
    }
  ]
};

const yearly = {
  yearlyComparison: [
    { year: '2022', totalProfit: 43280, winRate: 59.2 },
    { year: '2023', totalProfit: 57840, winRate: 61.4 },
    { year: '2024', totalProfit: 68430, winRate: 63.1 },
    { year: '2025', totalProfit: 83130, winRate: 66.8 }
  ],
  qualityDistribution: [
    {
      label: 'Profit Factor',
      tiers: [
        { l: 'Strong', v: 16, max: 24, c: '#2e7d32' },
        { l: 'Good', v: 6, max: 24, c: '#16b5dd' },
        { l: 'Review', v: 2, max: 24, c: '#e5a800' }
      ]
    },
    {
      label: 'Drawdown',
      tiers: [
        { l: 'Low', v: 14, max: 24, c: '#2e7d32' },
        { l: 'Medium', v: 8, max: 24, c: '#16b5dd' },
        { l: 'High', v: 2, max: 24, c: '#d32f2f' }
      ]
    },
    {
      label: 'Sharpe Ratio',
      tiers: [
        { l: 'Strong', v: 15, max: 24, c: '#2e7d32' },
        { l: 'Good', v: 7, max: 24, c: '#16b5dd' },
        { l: 'Review', v: 2, max: 24, c: '#e5a800' }
      ]
    },
    {
      label: 'P/D Ratio',
      tiers: [
        { l: 'Strong', v: 17, max: 24, c: '#2e7d32' },
        { l: 'Good', v: 5, max: 24, c: '#16b5dd' },
        { l: 'Review', v: 2, max: 24, c: '#e5a800' }
      ]
    }
  ]
};

const breakdown = {
  meta: { source: 'Demo portfolio', scope: 'full' },
  pnl: { netProfit: 252680, grossProfit: 418920, grossLoss: 166240, portfolioProfitFactor: 2.52, profitPercent: 71.4, lossPercent: 28.6 },
  riskMetrics: { avgExpectedPayoff: 48.15, avgWinrate: 62.8, avgDrawdown: 7.34, avgSharpe: 3.24 }
};

const marketData = [
  ['BTCUSD', 72140, 860, 1.21],
  ['ETHUSD', 3862, 42, 1.1],
  ['XAUUSD', 2748, 18, 0.66],
  ['DE30', 19642, 94, 0.48],
  ['US500', 5840, 21, 0.36],
  ['USOIL', 74.82, -0.63, -0.84]
].map(([symbol, price, change, changePct]) => ({ symbol, price, change, changePct }));

const demoOrders = Array.from({ length: 18 }, (_, index) => {
  const symbols = ['DE30', 'XAUUSD', 'USOIL', 'EURUSD'];
  const symbol = symbols[index % symbols.length];
  const isBuy = index % 2 === 0;
  const profit = Math.round((isBuy ? 1 : -0.45) * (680 + index * 93) * 100) / 100;
  return {
    time: `2026-10-${String(28 - Math.floor(index / 6)).padStart(2, '0')} ${String(9 + (index % 8)).padStart(2, '0')}:${String((index * 7) % 60).padStart(2, '0')}:00`,
    deal: 910000 + index,
    symbol,
    type: isBuy ? 'buy' : 'sell',
    direction: isBuy ? 'in' : 'out',
    volume: Number((0.2 + (index % 4) * 0.1).toFixed(2)),
    price: Number((symbol === 'DE30' ? 19620 : symbol === 'XAUUSD' ? 2740 : symbol === 'USOIL' ? 74 : 1.08) + index * 0.13),
    commission: -3.5 - (index % 3),
    swap: 0,
    profit,
    comment: `DEMO-${String((index % 4) + 1).padStart(3, '0')}*QTS`,
    strategy_id: ['DEMO-DE30-H1-01', 'DEMO-XAU-H4-02', 'DEMO-OIL-H1-03', 'DEMO-EUR-H1-04'][index % 4]
  };
});

const demoStrategies = ranking.map((item, index) => {
  const symbols = ['DE30', 'XAUUSD', 'USOIL', 'EURUSD'];
  const timeframes = ['H1', 'H4', 'H1', 'H1'];
  const symbol = symbols[index];
  return {
    strategy_id: item.strategyId,
    backtest_table: 'demo_quant_portfolio',
    symbol,
    timeframe: timeframes[index],
    threshold_applied: index < 3,
    quantity: item.totalTrades,
    total_profit: item.totalNetProfit,
    winrate: 58.4 + index * 1.7,
    pd_ratio: item.pd,
    profit_factor: item.profitFactor,
    recovery_factor: item.recoveryFactor,
    sharpe_ratio: item.sharpe,
    max_drawdown: item.drawdownPct,
    largest_loss_trade: -(5400 + index * 650),
    largest_profit_trade_ratio: 1.8 + index * 0.16,
    risk_reward_ratio: 2.1 + index * 0.18,
    lr_correlation: item.lrCorrelation,
    metrics_mode: 'portfolio',
    time_begin: '2022-01-01',
    time_end: '2026-10-30',
    settings: { inputs: { AcceptBuy: index % 2 === 0, AcceptSell: index % 2 !== 0, AtrPeriod: 14 + index * 3, Factor: 2.1 + index * 0.2 } },
    results: {
      totalNetProfit: item.totalNetProfit,
      totalTrades: item.totalTrades,
      balanceDrawdownMaximal: item.drawdownPct,
      profitFactor: item.profitFactor,
      sharpeRatio: item.sharpe,
      recoveryFactor: item.recoveryFactor,
      lrCorrelation: item.lrCorrelation,
      largestLossTrade: -(5400 + index * 650)
    }
  };
});

const comparativeCore = {
  ranking: ranking.map((item, index) => ({
    id: item.strategyId,
    backtest: 'demo_quant_portfolio',
    symbol: ['DE30', 'XAUUSD', 'USOIL', 'EURUSD'][index],
    direction: index % 2 === 0 ? 'OB' : 'OS',
    timeframe: ['H1', 'H4', 'H1', 'H1'][index],
    profit: item.totalNetProfit,
    trades: item.totalTrades,
    pf: item.profitFactor,
    rf: item.recoveryFactor,
    sharpe: item.sharpe,
    pd: item.pd,
    drawdown: item.drawdownPct,
    composite: item.composite,
    finalScore: item.composite,
    normalized: {
      profit: 92 - index * 6,
      pf: 90 - index * 5,
      recovery: 91 - index * 6,
      sharpe: 94 - index * 5,
      pd: 93 - index * 6,
      drawdown: 88 - index * 4
    }
  }))
};

const riskCore = {
  summary: { totalStrategies: 24, passedStrategies: 19, passedCleanStrategies: 17, hardFlaggedStrategies: 2, warningStrategies: 3 },
  strategies: demoStrategies.map((row, index) => ({
    id: row.strategy_id,
    backtest: row.backtest_table,
    ep: row.total_profit / row.quantity,
    pf: row.profit_factor,
    rf: row.recovery_factor,
    pd: row.pd_ratio,
    trades: row.quantity,
    netProfit: row.total_profit,
    largestLossTrade: row.largest_loss_trade,
    winratePct: row.winrate,
    drawdownPct: row.max_drawdown,
    sharpeRatio: row.sharpe_ratio,
    lrCorrelation: row.lr_correlation,
    hardCount: index === 2 ? 1 : 0,
    softCount: index === 3 ? 1 : 0,
    hardFlags: index === 2 ? ['4'] : [],
    softFlags: index === 3 ? ['11'] : [],
    status: index === 2 ? 'Hard flag' : index === 3 ? 'Warning' : 'Passed'
  })),
  hardFlags: {
    pd: { id: '4', count: 1, strats: [{ id: 'DEMO-OIL-H1-03', backtest: 'demo_quant_portfolio', val: 'P/D 6.39' }] }
  },
  softFlags: [
    {
      id: '11',
      diagnosticCode: 'CONCENTRATION',
      description: 'Portfolio concentration needs review',
      count: 1,
      strats: [{ id: 'DEMO-EUR-H1-04', backtest: 'demo_quant_portfolio', val: '18.4%' }]
    }
  ],
  charts: {
    marginExposure: [
      { date: '2026-10-21', count: 7, margin: 28 },
      { date: '2026-10-22', count: 9, margin: 34 },
      { date: '2026-10-23', count: 6, margin: 24 }
    ],
    correlatedDrawdown: monthlyProfit
      .slice(0, 8)
      .map((row, index) => ({ month: row.month, days: 2 + (index % 4), value: 1.8 + index * 0.35 })),
    symbolDivergence: [
      { symbol: 'DE30', value: 14 },
      { symbol: 'XAUUSD', value: 11 },
      { symbol: 'USOIL', value: 8 },
      { symbol: 'EURUSD', value: 6 }
    ],
    marketNeutral: [
      { name: 'Directional', value: 42 },
      { name: 'Market neutral', value: 58 }
    ],
    doubleExposure: [
      { pair: 'DE30 H1/H4', pct: 26 },
      { pair: 'XAUUSD H1/H4', pct: 18 }
    ],
    assetConcentration: [
      { symbol: 'DE30', value: 32 },
      { symbol: 'XAUUSD', value: 27 },
      { symbol: 'USOIL', value: 22 },
      { symbol: 'EURUSD', value: 19 }
    ],
    strategyDominance: demoStrategies.map((row, index) => ({ id: row.strategy_id, pct: 19 - index * 3 }))
  }
};

const behaviorCore = {
  summary: behavior.summary,
  directionalBiasData: [
    { id: 'DEMO-DE30-H1-01', buy: 64, sell: 36, weakPct: 46 },
    { id: 'DEMO-XAU-H4-02', buy: 42, sell: 58, weakPct: 41 },
    { id: 'DEMO-OIL-H1-03', buy: 52, sell: 48, weakPct: 18 },
    { id: 'DEMO-EUR-H1-04', buy: 49, sell: 51, weakPct: 17 }
  ],
  buySellBreakdown: [
    { name: 'Buy', value: 54 },
    { name: 'Sell', value: 46 }
  ],
  timeframeMismatchData: behavior.timeframeMismatchData
};

const behaviorActivity = {
  activityGapData: behavior.activityGapData,
  hourlyDistribution: Array.from({ length: 12 }, (_, i) => ({ hour: `${i * 2}:00`, trades: 18 + ((i * 13) % 42) })),
  dayOfWeekDistribution: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day, i) => ({ day, trades: 110 + i * 17 })),
  monthlyDistribution: monthlyProfit.map((row, i) => ({ month: row.month, trades: 70 + ((i * 19) % 80) }))
};

const mt5Sessions = [
  {
    id: 'demo-session-2026',
    name: 'Demo Portfolio ? October 2026',
    description: 'Read-only MT5 optimization workspace',
    status: 'ACTIVE',
    result_count: 128,
    owner_username: 'demo',
    created_at: '2026-10-25T08:00:00Z'
  }
];
const mt5Workers = [
  {
    id: 1,
    worker_name: 'Quant-Worker-01',
    owner_user_id: 1,
    username: 'demo',
    api_key: 'demo-key',
    status: 'ACTIVE',
    run_access: true,
    is_public: false,
    allowed_job_types: ['OPEN_PRICE', 'EVERY_TICK'],
    jobs_claimed: 84,
    last_seen_at: new Date().toISOString()
  },
  {
    id: 2,
    worker_name: 'Quant-Worker-02',
    owner_user_id: 1,
    username: 'demo',
    api_key: 'demo-key',
    status: 'BUSY',
    run_access: true,
    is_public: false,
    allowed_job_types: ['OPEN_PRICE'],
    current_job_id: 'DEMO-OPT-004',
    jobs_claimed: 61,
    last_seen_at: new Date().toISOString()
  }
];
const mt5Jobs = demoStrategies.flatMap((strategy, index) => [
  {
    job_id: `DEMO-OPT-00${index + 1}`,
    session_id: 'demo-session-2026',
    strategy_id: strategy.strategy_id,
    job_type: 'OPEN_PRICE',
    status: 'DONE',
    progress: 100,
    worker_name: 'Quant-Worker-01',
    duration_ms: 64000 + index * 9000,
    created_at: '2026-10-29T08:00:00Z',
    started_at: '2026-10-29T08:01:00Z',
    finished_at: '2026-10-29T08:02:30Z',
    job_payload: {
      job_name: strategy.strategy_id,
      symbol: strategy.symbol,
      timeframe: strategy.timeframe,
      optimize_runs: 3,
      optimize_stored_count: 32 + index * 8
    }
  },
  {
    job_id: `DEMO-ET-00${index + 1}`,
    session_id: 'demo-session-2026',
    strategy_id: strategy.strategy_id,
    job_type: 'EVERY_TICK',
    status: index < 3 ? 'DONE' : 'RUNNING',
    progress: index < 3 ? 100 : 68,
    worker_name: index < 3 ? 'Quant-Worker-01' : 'Quant-Worker-02',
    duration_ms: index < 3 ? 78000 + index * 6000 : null,
    created_at: '2026-10-30T08:00:00Z',
    started_at: '2026-10-30T08:01:00Z',
    finished_at: index < 3 ? '2026-10-30T08:03:00Z' : null,
    target_pass: index + 1,
    job_payload: { job_name: strategy.strategy_id, symbol: strategy.symbol, timeframe: strategy.timeframe, pass: index + 1 }
  }
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export function isDemoRequest() {
  return typeof window !== 'undefined' && window.location.pathname.startsWith('/demo');
}

export function getDemoResponse(url, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  if (method !== 'GET') return json({ success: false, message: 'Demo Mode is read-only.' }, 403);

  const path = String(url).replace(/^https?:\/\/[^/]+/, '');
  if (path.includes('/api/backtest-tables'))
    return json({
      success: true,
      tables: ['demo_quant_portfolio'],
      sources: [{ source_name: 'demo_quant_portfolio', display_name: 'Demo Quant Portfolio', owner_username: 'demo', enabled: true }]
    });

  if (path.includes('/api/balance-chart/')) {
    const strategyId = decodeURIComponent(path.split('/').pop().split('?')[0] || '');
    const strategyIndex = Math.max(
      0,
      demoStrategies.findIndex((row) => row.strategy_id === strategyId)
    );
    const startingBalance = 1000000;
    const shape = [
      0, 6800, 12400, 9700, 18800, 25700, 23100, 34600, 42800, 39700, 51200, 60400, 57800, 71300, 82600, 79400, 94600, 108200, 103900,
      121500
    ];
    const multiplier = 1 - strategyIndex * 0.09;
    return json({
      success: true,
      data: shape.map((profit, index) => ({
        time: `2026-${String((index % 10) + 1).padStart(2, '0')}-${String((index % 26) + 1).padStart(2, '0')}`,
        balance: Number((startingBalance + profit * multiplier + Math.sin(index + strategyIndex) * 2400).toFixed(2))
      }))
    });
  }

  if (path.includes('/api/data/totals'))
    return json({
      totals: {
        commission: -84.5,
        swap: 0,
        profit: 18420.65,
        orders: 18,
        profitableOrders: 12,
        totalOutOrders: 18,
        winrate: 66.67,
        strategies: 4
      }
    });
  if (path === '/api/data' || path.startsWith('/api/data?'))
    return json({ data: demoOrders, pagination: { total: demoOrders.length, totalPages: 1, currentPage: 1, pageSize: 50 } });
  if (path.includes('/api/filter-options'))
    return json({
      year: ['2026', '2025'],
      symbol: ['DE30', 'XAUUSD', 'USOIL', 'EURUSD'],
      strategyIds: demoStrategies.map((row) => row.strategy_id)
    });
  if (path.includes('/api/strategy-file-check')) return json({ success: true, data: { total: 24, valid: 22, invalid: 2, missing: 0 } });

  if (path.includes('/api/strategies/ids')) return json({ success: true, data: demoStrategies.map((row) => row.strategy_id) });
  if (path.includes('/api/strategies/distinct-symbols')) return json({ success: true, data: ['DE30', 'XAUUSD', 'USOIL', 'EURUSD'] });
  if (path.includes('/api/strategies/statistics'))
    return json({ success: true, data: { totalStrategies: 24, activeStrategies: 19, averageProfitFactor: 2.12, averageDrawdown: 7.34 } });
  if (path.includes('/api/strategies/preferences')) return json({ success: true, data: {} });
  if (path === '/api/strategies' || path.startsWith('/api/strategies?'))
    return json({
      success: true,
      data: demoStrategies,
      pagination: { total: demoStrategies.length, totalPages: 1, currentPage: 1, pageSize: 50 }
    });

  if (path.includes('/api/users')) return json({ success: true, data: [{ id: 1, username: 'demo', role: 'viewer' }] });
  if (path.includes('/system-logs') || path.includes('/activity-logs')) return json({ success: true, data: [] });

  if (path.includes('/dashboard/risk-analysis/core')) return json({ success: true, data: riskCore });
  if (path.includes('/dashboard/risk-analysis/margin-exposure')) return json({ success: true, data: riskCore.charts.marginExposure });
  if (path.includes('/dashboard/risk-analysis/double-exposure')) return json({ success: true, data: riskCore.charts.doubleExposure });
  if (path.includes('/dashboard/risk-analysis/light-charts'))
    return json({
      success: true,
      data: { correlatedDrawdown: riskCore.charts.correlatedDrawdown, symbolDivergence: riskCore.charts.symbolDivergence }
    });

  if (path.includes('/dashboard/behavior-analysis/core')) return json({ success: false, data: null });
  if (path.includes('/dashboard/behavior-analysis/activity')) return json({ success: false, data: null });
  if (path.includes('/dashboard/behavior-analysis/holding-recovery')) return json({ success: false, data: null });
  if (path.includes('/dashboard/behavior-analysis/exit'))
    return json({
      success: true,
      data: {
        exitReasonsData: [
          { reason: 'Take Profit', value: 46 },
          { reason: 'Trailing Stop', value: 31 },
          { reason: 'Stop Loss', value: 23 }
        ],
        commissionPerLotData: demoStrategies.map((row, index) => ({ id: row.strategy_id, avgFeePerLot: 5.4 + index * 0.3 }))
      }
    });
  if (path.includes('/dashboard/behavior-analysis'))
    return json({
      success: true,
      data: {
        ...behaviorCore,
        ...behaviorActivity,
        strategyYears: behavior.strategyYears,
        hourHeatmap: [],
        dayHeatmap: [],
        monthHeatmap: [],
        quarterlySeasonality: []
      }
    });

  if (path.includes('/dashboard/comparative-ranking/core')) return json({ success: true, data: comparativeCore });
  if (path.includes('/dashboard/comparative-ranking/dimensions')) return json({ success: true, data: comparative });
  if (path.includes('/dashboard/comparative-ranking')) return json({ success: true, data: { ...comparativeCore, ...comparative } });

  if (path.includes('/api/mt5-optimization/sessions')) return json({ success: true, data: mt5Sessions });
  if (path.includes('/api/mt5-optimization/workers')) return json({ success: true, data: mt5Workers });
  if (path.includes('/api/mt5-optimization/jobs/selection')) return json({ success: true, data: { items: mt5Jobs } });
  if (path.includes('/api/mt5-optimization/jobs')) {
    const isOpenPrice = path.includes('job_type=OPEN_PRICE');
    const isEveryTick = path.includes('job_type=EVERY_TICK');
    const items = mt5Jobs.filter((job) => (!isOpenPrice && !isEveryTick) || job.job_type === (isOpenPrice ? 'OPEN_PRICE' : 'EVERY_TICK'));
    return json({
      success: true,
      data: {
        items,
        total: items.length,
        summary: { total: mt5Jobs.length, pending: 0, running: 1, done: 7, failed: 0 },
        filterOptions: { workers: mt5Workers.map((worker) => worker.worker_name), hasUnassigned: false }
      }
    });
  }
  if (path.includes('/api/mt5-optimization/results-summary'))
    return json({ success: true, data: { total: 128, passed: 93, fallback: 35, symbols: 4 } });
  if (path.includes('/api/mt5-optimization/results')) return json({ success: true, data: { items: [], total: 0 } });
  if (path.includes('/api/mt5-optimization/backtest-candidates')) return json({ success: true, data: { items: [], total: 0 } });
  if (path.includes('/api/mt5-optimization/filter-preferences')) return json({ success: true, data: {} });
  if (path.includes('/api/mt5-optimization/')) return json({ success: true, data: [] });
  if (path.includes('/api/market/prices')) return json({ data: marketData, updatedAt: new Date().toISOString() });
  if (path.includes('/notifications/preferences')) return json({ enabled: false });
  if (path.includes('/notifications/unread')) return json({ unread_count: 0 });
  if (path.includes('/notifications')) return json({ notifications: [] });

  if (path.includes('/dashboard/overview/core')) return json({ success: true, data: overviewCore });
  if (path.includes('/dashboard/overview/monthly-profit')) return json({ success: true, data: monthlyProfit });
  if (path.includes('/dashboard/overview/top-stats'))
    return json({ success: true, data: { topStrategies: ranking, topSymbols: comparative.averages } });
  if (path.includes('/dashboard/overview/yearly-performance')) return json({ success: true, data: yearly });
  if (path.includes('/dashboard/overview/behavior-summary')) return json({ success: true, data: behavior });
  if (path.includes('/dashboard/overview/comparative')) return json({ success: true, data: comparative });
  if (path.includes('/dashboard/overview/breakdown')) return json({ success: true, data: breakdown });

  if (path.includes('/api/dashboard/')) return json({ success: true, data: {} });
  return json({ success: true, data: [] });
}
