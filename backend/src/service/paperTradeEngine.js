const binanceWsService = require('./binanceWsService');
const paperStrategyService = require('./paperStrategyService');
const paperTradeDao = require('../dao/paperTradeDao');
const { SPOT_RISK, FUTURES_RISK } = require('../utils/constants');

// Danh sách các Bot Futures độc lập (Multi-Bot Tournament)
const FUTURES_BOTS = [
  {
    id: 'acc_binance_futures',
    name: 'Bot 1: Trend Pullback (EMA)',
    desc: 'Thuận xu hướng EMA200 + Pullback EMA21 & RSI',
    strategyKey: 'TREND_PULLBACK',
    interval: '15m',
    evaluator: paperStrategyService.evaluateTrendPullbackStrategy
  },
  {
    id: 'acc_futures_reversion',
    name: 'Bot 2: Bollinger Reversion',
    desc: 'Đảo chiều Sideway dải Bollinger Bands + RSI Quá mua/Quá bán',
    strategyKey: 'BOLLINGER_REVERSION',
    interval: '15m',
    evaluator: paperStrategyService.evaluateBollingerMeanReversionStrategy
  },
  {
    id: 'acc_futures_breakout',
    name: 'Bot 3: Breakout Momentum',
    desc: 'Phá vỡ đỉnh/đáy 20 nến Donchian + Bùng nổ Volume',
    strategyKey: 'BREAKOUT_MOMENTUM',
    interval: '15m',
    evaluator: paperStrategyService.evaluateBreakoutMomentumStrategy
  },
  {
    id: 'acc_futures_h4_trend',
    name: 'Bot 4: H4 Trend Sniper',
    desc: 'Kênh Donchian 55 + EMA 50/200 khung H4 (Turtle Trend)',
    strategyKey: 'H4_TREND_SNIPER',
    interval: '4h',
    evaluator: paperStrategyService.evaluateH4TrendSniperStrategy
  }
];

class PaperTradeEngine {
  constructor() {
    this.futuresAccountId = 'acc_binance_futures';
    this.spotAccountId = 'acc_binance_spot';
    this.futuresBots = FUTURES_BOTS;
    this.isProcessingTick = false;
    this.snapshotTimer = null;
    this.lastEvaluations = {};
  }

  async init() {
    console.log('[PaperEngine] Initializing Paper Trading Execution Engine (Futures & Spot)...');

    // 1. Khởi tạo bảng dữ liệu
    await paperTradeDao.initPaperTradeTables();

    // Nạp danh sách symbol theo dõi từ DB cho tất cả các Bot Futures & Spot
    try {
      const allAccounts = await paperTradeDao.getAllAccounts();
      const allSymbols = new Set(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'PAXGUSDT']);
      for (const acc of allAccounts) {
        if (Array.isArray(acc.tracked_symbols)) {
          acc.tracked_symbols.forEach((s) => allSymbols.add(s));
        }
      }
      binanceWsService.symbols = Array.from(allSymbols);
      console.log(`[PaperEngine] Loaded ${binanceWsService.symbols.length} tracked symbols:`, binanceWsService.symbols.join(', '));
    } catch (e) {
      console.warn('[PaperEngine] Error loading tracked symbols:', e.message);
    }

    // 2. Lắng nghe cập nhật giá real-time từ Binance WebSocket
    binanceWsService.on('priceUpdate', async ({ symbol, price }) => {
      await this.handlePriceUpdate(symbol, price);
    });

    // 3. Lắng nghe nến 15m đóng để đánh giá tín hiệu chiến lược Futures & Spot
    binanceWsService.on('candleClosed', async ({ symbol, candle, candles }) => {
      await this.handleCandleClosed(symbol, candles);
    });

    // 3b. Lắng nghe nến 4h đóng để đánh giá tín hiệu cho Bot 4 (H4 Trend Sniper)
    binanceWsService.on('candleClosedH4', async ({ symbol, candle, candles }) => {
      await this.handleCandleClosedH4(symbol, candles);
    });

    // 4. Khởi động Binance Data Stream
    await binanceWsService.start();

    // 4.1. Khởi tạo tính toán chỉ báo kỹ thuật ngay lập tức từ 250 nến lịch sử vừa nạp
    for (const sym of binanceWsService.symbols) {
      const candles = binanceWsService.getCandles(sym);
      if (candles && candles.length >= 30) {
        try {
          const signal = paperStrategyService.evaluateTrendPullbackStrategy(sym, candles);
          if (signal && signal.indicators) {
            this.lastEvaluations[sym] = signal;
          }
        } catch (e) {
          // ignore
        }
      }
    }

    // 4.2. Khớp lệnh Futures ngay nếu bot đang bật và có tín hiệu thỏa mãn
    try {
      const futAccount = await paperTradeDao.getAccount(this.futuresAccountId);
      if (futAccount && futAccount.is_bot_active) {
        for (const sym of binanceWsService.symbols) {
          if (this.lastEvaluations[sym] && this.lastEvaluations[sym].action !== 'HOLD') {
            await this.evaluateFuturesCandle(sym, this.lastEvaluations[sym]);
          }
        }
      }
    } catch (err) {
      console.warn('[PaperEngine] Error checking startup signals:', err.message);
    }

    // 5. Khởi tạo timer chụp snapshot số dư mỗi 15 phút
    clearInterval(this.snapshotTimer);
    this.snapshotTimer = setInterval(async () => {
      await this.recordEquitySnapshot();
    }, 15 * 60 * 1000);

    // Chụp snapshot khởi đầu nếu chưa có
    await this.recordEquitySnapshot();

    console.log('[PaperEngine] Paper Trading Engine (Futures & Spot) is running and ready.');
  }

  /**
   * Xử lý cập nhật giá theo thời gian thực (Mark Price / Ticker)
   */
  async handlePriceUpdate(symbol, currentPrice) {
    if (this.isProcessingTick) return;
    this.isProcessingTick = true;

    try {
      // 1. CẬP NHẬT FUTURES CHO TẤT CẢ CÁC BOT
      for (const bot of this.futuresBots) {
        const openPositions = await paperTradeDao.getOpenPositions(bot.id);
        const symbolPositions = openPositions.filter((p) => p.symbol === symbol);

        for (const pos of symbolPositions) {
          const entryPrice = parseFloat(pos.entry_price);
          const stopLoss = parseFloat(pos.stop_loss);
          const takeProfit = parseFloat(pos.take_profit);
          const quantity = parseFloat(pos.quantity);
          const margin = parseFloat(pos.margin);
          const isBreakeven = pos.is_breakeven_triggered;

          let pnl = 0;
          if (pos.side === 'LONG') {
            pnl = (currentPrice - entryPrice) * quantity;
          } else {
            pnl = (entryPrice - currentPrice) * quantity;
          }
          const pnlPct = margin > 0 ? (pnl / margin) * 100 : 0;

          // Dời SL về Breakeven khi lãi >= 1.4R ($2.80)
          // Khóa thêm 0.05% để bảo toàn phí giao dịch sàn
          const beThreshold = 2.80; // 1.4R
          if (!isBreakeven && pnl >= beThreshold) {
            const lockedSl = pos.side === 'LONG' ? entryPrice * 1.0005 : entryPrice * 0.9995;
            await paperTradeDao.updatePosition(pos.id, {
              stop_loss: lockedSl,
              is_breakeven_triggered: true,
              current_price: currentPrice,
              unrealized_pnl: pnl,
              unrealized_pnl_pct: pnlPct
            });
            await paperTradeDao.createLog(
              bot.id,
              symbol,
              'INFO',
              `🛡️ Dời Stop Loss về hòa vốn an toàn (Breakeven @ ${lockedSl.toFixed(4)}) cho vị thế ${pos.side} [${bot.name}] khi đạt lãi +$${pnl.toFixed(2)} (>= 1.4R)`
            );
            continue;
          }

          // Kiểm tra đóng lệnh Futures
          let exitReason = null;
          if (pos.side === 'LONG') {
            if (currentPrice <= stopLoss) exitReason = 'STOP_LOSS';
            else if (currentPrice >= takeProfit) exitReason = 'TAKE_PROFIT';
          } else {
            if (currentPrice >= stopLoss) exitReason = 'STOP_LOSS';
            else if (currentPrice <= takeProfit) exitReason = 'TAKE_PROFIT';
          }

          if (exitReason) {
            await this.closeFuturesPosition(pos, currentPrice, exitReason);
          } else {
            await paperTradeDao.updatePosition(pos.id, {
              current_price: currentPrice,
              unrealized_pnl: pnl,
              unrealized_pnl_pct: pnlPct
            });
          }
        }

        await this.recalculateAccountEquity(bot.id);
      }

      // 2. CẬP NHẬT SPOT HOLDINGS & RECHECK SPOT TAKE PROFIT
      await this.checkSpotHoldingsUpdate(symbol, currentPrice);
    } catch (err) {
      console.error('[PaperEngine] Error in handlePriceUpdate:', err.message);
    } finally {
      this.isProcessingTick = false;
    }
  }

  /**
   * Cập nhật giá trị tài sản Spot và tự động chốt lời nếu đạt mục tiêu
   */
  async checkSpotHoldingsUpdate(symbol, currentPrice) {
    try {
      const spotAccount = await paperTradeDao.getAccount(this.spotAccountId);
      if (!spotAccount) return;

      const holdings = await paperTradeDao.getSpotHoldings(this.spotAccountId);
      const symbolHolding = holdings.find((h) => h.symbol === symbol);

      // Kiểm tra chốt lời Spot nếu có holding và bot đang bật
      if (symbolHolding && spotAccount.is_bot_active) {
        const avgPrice = parseFloat(symbolHolding.avg_buy_price);
        const gainPct = ((currentPrice - avgPrice) / avgPrice) * 100;

        // Chốt lời khi lãi >= 4.5%
        if (gainPct <= SPOT_RISK.STOP_LOSS_PCT) {
          await this.sellSpotHolding(symbol, currentPrice, `STOP_LOSS_${Math.abs(SPOT_RISK.STOP_LOSS_PCT)}%`);
          return;
        }

        if (gainPct >= SPOT_RISK.TAKE_PROFIT_PCT) {
          await this.sellSpotHolding(symbol, currentPrice, 'TAKE_PROFIT_4.5%');
          return;
        }
      }

      // Cập nhật lại tổng tài sản Spot (USDT Cash + Giá trị Coin)
      let totalCoinValue = 0;
      let totalCost = 0;
      for (const h of holdings) {
        const curP = binanceWsService.getPrice(h.symbol) || parseFloat(h.avg_buy_price);
        const val = parseFloat(h.quantity) * curP;
        totalCoinValue += val;
        totalCost += parseFloat(h.total_cost);
      }

      const usdtBalance = parseFloat(spotAccount.balance);
      const spotEquity = usdtBalance + totalCoinValue;
      const unrealizedPnl = totalCoinValue - totalCost;
      const peakEquity = Math.max(parseFloat(spotAccount.peak_equity || spotEquity), spotEquity);
      const currentDd = peakEquity > 0 ? ((peakEquity - spotEquity) / peakEquity) * 100 : 0;
      const maxDd = Math.max(parseFloat(spotAccount.max_drawdown_pct || 0), currentDd);

      await paperTradeDao.updateAccount(this.spotAccountId, {
        equity: Number(spotEquity.toFixed(2)),
        unrealized_pnl: Number(unrealizedPnl.toFixed(2)),
        peak_equity: Number(peakEquity.toFixed(2)),
        max_drawdown_pct: Number(maxDd.toFixed(2))
      });
    } catch (err) {
      // Ignore
    }
  }

  /**
   * Đóng một vị thế Futures
   */
  async closeFuturesPosition(pos, exitPrice, exitReason) {
    const targetAccId = pos.account_id || this.futuresAccountId;
    const entryPrice = parseFloat(pos.entry_price);
    const quantity = parseFloat(pos.quantity);
    const margin = parseFloat(pos.margin);
    const leverage = parseInt(pos.leverage, 10);

    let grossPnl = 0;
    if (pos.side === 'LONG') {
      grossPnl = (exitPrice - entryPrice) * quantity;
    } else {
      grossPnl = (entryPrice - exitPrice) * quantity;
    }

    const notionalEntry = entryPrice * quantity;
    const notionalExit = exitPrice * quantity;
    const fee = (notionalEntry + notionalExit) * 0.0005;
    const netPnl = grossPnl - fee;
    const pnlPct = margin > 0 ? (netPnl / margin) * 100 : 0;

    await paperTradeDao.createOrder({
      accountId: targetAccId,
      symbol: pos.symbol,
      side: pos.side,
      entryPrice,
      exitPrice,
      quantity,
      leverage,
      margin,
      realizedPnl: Number(netPnl.toFixed(4)),
      realizedPnlPct: Number(pnlPct.toFixed(2)),
      fee: Number(fee.toFixed(4)),
      exitReason,
      openedAt: pos.opened_at
    });

    await paperTradeDao.deletePosition(pos.id);

    const account = await paperTradeDao.getAccount(targetAccId);
    if (account) {
      const newBalance = parseFloat(account.balance) + netPnl;
      const totalTrades = account.total_trades + 1;
      const winningTrades = netPnl > 0 ? account.winning_trades + 1 : account.winning_trades;
      const losingTrades = netPnl <= 0 ? account.losing_trades + 1 : account.losing_trades;
      const realizedPnl = parseFloat(account.realized_pnl) + netPnl;

      await paperTradeDao.updateAccount(targetAccId, {
        balance: Number(newBalance.toFixed(2)),
        realized_pnl: Number(realizedPnl.toFixed(2)),
        total_trades: totalTrades,
        winning_trades: winningTrades,
        losing_trades: losingTrades
      });
    }

    const icon = netPnl > 0 ? '🟢' : '🔴';
    await paperTradeDao.createLog(
      targetAccId,
      pos.symbol,
      netPnl > 0 ? 'SUCCESS' : 'WARN',
      `${icon} Đóng vị thế Futures ${pos.side} [${exitReason}] @ ${exitPrice}. Lãi/Lỗ ròng: ${netPnl >= 0 ? '+' : ''}$${netPnl.toFixed(2)} (${pnlPct.toFixed(1)}%)`
    );

    await this.recordEquitySnapshot(targetAccId);
  }

  /**
   * Đánh giá chiến lược khi nến 15m đóng cửa
   */
  async handleCandleClosed(symbol, candles) {
    try {
      // 1. Tính toán chỉ báo kỹ thuật Bot 1 (Trend Pullback) làm tham chiếu UI
      const signalTrend = paperStrategyService.evaluateTrendPullbackStrategy(symbol, candles);
      if (signalTrend && signalTrend.indicators) {
        this.lastEvaluations[symbol] = signalTrend;
      }

      // 2. THỰC THI CHIẾN LƯỢC CHO TỪNG BOT FUTURES M15 ĐỘC LẬP
      const m15Bots = this.futuresBots.filter((b) => b.interval !== '4h');
      for (const bot of m15Bots) {
        try {
          const botSignal = bot.evaluator(symbol, candles);
          await this.evaluateFuturesCandleForBot(bot, symbol, botSignal);
        } catch (botErr) {
          console.error(`[PaperEngine-${bot.id}] Lỗi thực thi bot:`, botErr.message);
        }
      }

      // 3. THỰC THI CHIẾN LƯỢC SPOT (Smart RSI DCA)
      if (signalTrend && signalTrend.indicators) {
        await this.evaluateSpotCandle(symbol, signalTrend.indicators);
      }
    } catch (err) {
      console.error('[PaperEngine] Error in handleCandleClosed:', err.message);
    }
  }

  /**
   * Đánh giá chiến lược khi nến 4h đóng cửa (Dành riêng cho Bot 4: H4 Trend Sniper)
   */
  async handleCandleClosedH4(symbol, candles) {
    try {
      const h4Bots = this.futuresBots.filter((b) => b.interval === '4h');
      for (const bot of h4Bots) {
        try {
          const botSignal = bot.evaluator(symbol, candles);
          await this.evaluateFuturesCandleForBot(bot, symbol, botSignal);
        } catch (botErr) {
          console.error(`[PaperEngine-${bot.id}] Lỗi thực thi bot H4:`, botErr.message);
        }
      }
    } catch (err) {
      console.error('[PaperEngine] Error in handleCandleClosedH4:', err.message);
    }
  }
      console.error('[PaperEngine] Error in handleCandleClosed:', err.message);
}
  }

  /**
   * Logic mở lệnh Futures cho từng Bot độc lập
   */
  async evaluateFuturesCandleForBot(bot, symbol, signal) {
  const account = await paperTradeDao.getAccount(bot.id);
  if (!account || !account.is_bot_active) return;
  if (!signal || signal.action === 'HOLD') return;

  // Chỉ thực thi lệnh nếu cặp tiền nằm trong danh sách theo dõi của Bot này
  const tracked = account.tracked_symbols || ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
  if (!tracked.includes(symbol)) return;

  const openPositions = await paperTradeDao.getOpenPositions(bot.id);
  const existingPos = openPositions.find((p) => p.symbol === symbol);
  if (existingPos || openPositions.length >= FUTURES_RISK.MAX_OPEN_POSITIONS) return;

  // 1. CIRCUIT BREAKER: Kiểm tra ngưỡng sụt giảm tối đa 15%
  if (parseFloat(account.max_drawdown_pct || 0) >= 15.0) {
    console.warn(`[PaperEngine-${bot.id}] TẠM DỪNG MỞ LỆNH: Sụt giảm tài khoản đã chạm ngưỡng an toàn 15% (Max DD: ${account.max_drawdown_pct}%).`);
    return;
  }

  // 2. GIỚI HẠN TƯƠNG QUAN (CORRELATION): Nhóm coin lớn (BTC, ETH, SOL, BNB)
  // Tối đa không quá 2 vị thế cùng chiều trên nhóm này để tránh rủi ro hệ thống
  const HIGH_CORRELATION_GROUP = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];
  if (HIGH_CORRELATION_GROUP.includes(symbol)) {
    const sameDirectionCount = openPositions.filter(
      (p) => HIGH_CORRELATION_GROUP.includes(p.symbol) && p.side === signal.action
    ).length;
    if (sameDirectionCount >= 2) {
      console.warn(`[PaperEngine-${bot.id}] Bỏ qua lệnh ${signal.action} ${symbol}: Đã có ${sameDirectionCount} vị thế ${signal.action} trong nhóm coin tương quan cao.`);
      return;
    }
  }

  const currentBalance = parseFloat(account.balance);
  const riskPerTrade = parseFloat(account.risk_per_trade) || 2.0;
  const leverage = parseInt(account.leverage, 10) || 3;
  const entryPrice = signal.entryPrice;
  const stopLoss = signal.stopLoss;
  const takeProfit = signal.takeProfit;

  const slDistance = Math.abs(entryPrice - stopLoss);
  if (slDistance <= 0) return;

  let quantity = riskPerTrade / slDistance;
  let notional = quantity * entryPrice;

  if (notional < 6.0) {
    notional = 6.0;
    quantity = notional / entryPrice;
  }

  let margin = notional / leverage;

  // Tính toán Free Margin khả dụng của Bot này
  let usedMargin = 0;
  for (const p of openPositions) {
    usedMargin += parseFloat(p.margin || 0);
  }
  const freeMargin = Math.max(0, currentBalance - usedMargin);

  // Giới hạn ký quỹ mỗi lệnh trong khoảng $10 - $15 để chia đều vốn cho nhiều lệnh
  const TARGET_MIN_MARGIN = FUTURES_RISK.TARGET_MIN_MARGIN || 10.0;
  const TARGET_MAX_MARGIN = FUTURES_RISK.TARGET_MAX_MARGIN || 15.0;

  // Giới hạn trần mỗi lệnh là $15, nhưng không vượt quá Free Margin - $3 tiền đệm
  const maxMarginAllowed = Math.min(TARGET_MAX_MARGIN, Math.max(TARGET_MIN_MARGIN, freeMargin - 3.0));
  if (margin > maxMarginAllowed) {
    margin = maxMarginAllowed;
    notional = margin * leverage;
    quantity = notional / entryPrice;
  }

  // Nếu margin nhỏ hơn $10 mà Free Margin vẫn còn đủ, nâng lên $10 để đạt kích thước chuẩn
  if (margin < TARGET_MIN_MARGIN && freeMargin >= TARGET_MIN_MARGIN + 3.0) {
    margin = TARGET_MIN_MARGIN;
    notional = margin * leverage;
    quantity = notional / entryPrice;
  }

  if (margin > freeMargin || notional < 6.0 || margin < 3.0) {
    console.warn(`[PaperEngine-${bot.id}] Bỏ qua vào lệnh ${symbol}: Ký quỹ $${margin.toFixed(2)} vượt Free Margin $${freeMargin.toFixed(2)}.`);
    return;
  }

  await paperTradeDao.createPosition({
    accountId: bot.id,
    symbol,
    side: signal.action,
    entryPrice,
    currentPrice: entryPrice,
    quantity: Number(quantity.toFixed(6)),
    leverage,
    margin: Number(margin.toFixed(4)),
    stopLoss,
    takeProfit,
    unrealizedPnl: 0,
    unrealizedPnlPct: 0,
    liquidationPrice: signal.action === 'LONG'
      ? Number((entryPrice * (1 - 1 / leverage * 0.9)).toFixed(4))
      : Number((entryPrice * (1 + 1 / leverage * 0.9)).toFixed(4))
  });

  await paperTradeDao.createLog(
    bot.id,
    symbol,
    'INFO',
    `🚀 [${bot.name}] Mở vị thế Futures [${signal.action}] ${symbol} @ ${entryPrice}. SL: ${stopLoss} | TP: ${takeProfit} | Ký quỹ: $${margin.toFixed(2)} (${leverage}x). Lý do: ${signal.reason}`
  );

  await this.recordEquitySnapshot(bot.id);
}

  // Tương thích ngược với hàm cũ
  async evaluateFuturesCandle(symbol, signal) {
  const defaultBot = this.futuresBots[0];
  if (defaultBot) {
    await this.evaluateFuturesCandleForBot(defaultBot, symbol, signal);
  }
}

  /**
   * Logic gom hàng Spot theo RSI Quá Bán (Smart RSI DCA)
   */
  async evaluateSpotCandle(symbol, indicators) {
  const spotAccount = await paperTradeDao.getAccount(this.spotAccountId);
  if (!spotAccount || !spotAccount.is_bot_active) return;

  const rsi = indicators.rsi;
  const currentPrice = indicators.currentClose;

  // Điều kiện gom hàng Spot: RSI < 35 (Vùng điều chỉnh quá bán)
  if (rsi <= 35) {
    const holdings = await paperTradeDao.getSpotHoldings(this.spotAccountId);
    const symbolHolding = holdings.find((h) => h.symbol === symbol);

    // Kích thước 1 phần gom (Tranche): mặc định 10 USDT
    const tranche = parseFloat(spotAccount.risk_per_trade) || 10.0;
    const usdtBalance = parseFloat(spotAccount.balance);

    // Nếu đã gom coin này rồi
    if (symbolHolding) {
      const avgPrice = parseFloat(symbolHolding.avg_buy_price);
      const gainPct = ((currentPrice - avgPrice) / avgPrice) * 100;

      // 1. Phanh dừng DCA: Không mua thêm nếu đang âm sâu >= 5% (gần chạm ngưỡng SL -6%)
      if (gainPct <= SPOT_RISK.DCA_STOP_PCT) return;

      // 2. Giới hạn số lần gom tối đa cho mỗi coin (tối đa 3 đợt gom)
      const totalCost = parseFloat(symbolHolding.total_cost || 0);
      const maxCost = tranche * (SPOT_RISK.MAX_TRANCHES_PER_SYMBOL || 3);
      if (totalCost >= maxCost) return;

      // 3. Phải giảm sâu ít nhất 3% so với giá mua TB mới gom thêm đợt tiếp
      if (currentPrice > avgPrice * 0.97) return; // Chưa giảm đủ sâu để mua tranche tiếp
    }

    if (usdtBalance < tranche) {
      console.warn(`[PaperEngine-Spot] Số dư USDT không đủ để mua tranche ($${tranche}). Hiện có: $${usdtBalance.toFixed(2)}`);
      return;
    }

    // Mua coin giao ngay
    await this.buySpotHolding(symbol, currentPrice, tranche, `RSI Oversold (${rsi})`);
  }
}

  /**
   * Thực hiện mua gom Coin trên Spot
   */
  async buySpotHolding(symbol, price, spendUsdt, reason = 'MANUAL_BUY') {
  const coin = symbol.replace('USDT', '');
  const fee = spendUsdt * 0.001; // Phí Spot 0.1%
  const netUsdt = spendUsdt - fee;
  const boughtQty = netUsdt / price;

  const holdings = await paperTradeDao.getSpotHoldings(this.spotAccountId);
  const existing = holdings.find((h) => h.symbol === symbol);

  let newQty = boughtQty;
  let newCost = spendUsdt;
  let newAvgPrice = price;

  if (existing) {
    newQty = parseFloat(existing.quantity) + boughtQty;
    newCost = parseFloat(existing.total_cost) + spendUsdt;
    newAvgPrice = newCost / newQty;
  }

  await paperTradeDao.upsertSpotHolding(this.spotAccountId, symbol, coin, newQty, newAvgPrice, newCost);

  // Trừ USDT
  const spotAccount = await paperTradeDao.getAccount(this.spotAccountId);
  const newBal = parseFloat(spotAccount.balance) - spendUsdt;
  await paperTradeDao.updateAccount(this.spotAccountId, {
    balance: Number(newBal.toFixed(2))
  });

  // Lưu vào orders
  await paperTradeDao.createOrder({
    accountId: this.spotAccountId,
    symbol,
    side: 'BUY',
    entryPrice: price,
    exitPrice: price,
    quantity: Number(boughtQty.toFixed(6)),
    leverage: 1,
    margin: spendUsdt,
    realizedPnl: 0,
    realizedPnlPct: 0,
    fee: Number(fee.toFixed(4)),
    exitReason: reason,
    openedAt: new Date()
  });

  await paperTradeDao.createLog(
    this.spotAccountId,
    symbol,
    'INFO',
    `🛒 Mua Spot ${boughtQty.toFixed(4)} ${coin} @ $${price}. Chi $${spendUsdt.toFixed(2)} USDT (Giá TB mới: $${newAvgPrice.toFixed(2)}). Lý do: ${reason}`
  );

  await this.checkSpotHoldingsUpdate(symbol, price);
}

  /**
   * Bán chốt lời / Thoát coin trên Spot
   */
  async sellSpotHolding(symbol, price, reason = 'TAKE_PROFIT') {
  const holdings = await paperTradeDao.getSpotHoldings(this.spotAccountId);
  const holding = holdings.find((h) => h.symbol === symbol);
  if (!holding) throw new Error('Không có số dư coin này để bán');

  const coin = holding.coin;
  const quantity = parseFloat(holding.quantity);
  const totalCost = parseFloat(holding.total_cost);
  const avgPrice = parseFloat(holding.avg_buy_price);

  const grossProceeds = quantity * price;
  const fee = grossProceeds * 0.001; // Phí Spot 0.1%
  const netProceeds = grossProceeds - fee;
  const netPnl = netProceeds - totalCost;
  const pnlPct = totalCost > 0 ? (netPnl / totalCost) * 100 : 0;

  // Xóa holding
  await paperTradeDao.deleteSpotHolding(this.spotAccountId, symbol);

  // Cộng USDT và cập nhật thống kê
  const spotAccount = await paperTradeDao.getAccount(this.spotAccountId);
  const newBal = parseFloat(spotAccount.balance) + netProceeds;
  const totalTrades = spotAccount.total_trades + 1;
  const winningTrades = netPnl > 0 ? spotAccount.winning_trades + 1 : spotAccount.winning_trades;
  const losingTrades = netPnl <= 0 ? spotAccount.losing_trades + 1 : spotAccount.losing_trades;
  const realizedPnl = parseFloat(spotAccount.realized_pnl) + netPnl;

  await paperTradeDao.updateAccount(this.spotAccountId, {
    balance: Number(newBal.toFixed(2)),
    realized_pnl: Number(realizedPnl.toFixed(2)),
    total_trades: totalTrades,
    winning_trades: winningTrades,
    losing_trades: losingTrades
  });

  await paperTradeDao.createOrder({
    accountId: this.spotAccountId,
    symbol,
    side: 'SELL',
    entryPrice: avgPrice,
    exitPrice: price,
    quantity: Number(quantity.toFixed(6)),
    leverage: 1,
    margin: totalCost,
    realizedPnl: Number(netPnl.toFixed(4)),
    realizedPnlPct: Number(pnlPct.toFixed(2)),
    fee: Number(fee.toFixed(4)),
    exitReason: reason,
    openedAt: holding.created_at
  });

  const icon = netPnl > 0 ? '🟢' : '🔴';
  await paperTradeDao.createLog(
    this.spotAccountId,
    symbol,
    netPnl > 0 ? 'SUCCESS' : 'WARN',
    `${icon} Bán Spot ${quantity.toFixed(4)} ${coin} @ $${price} [${reason}]. Thu về $${netProceeds.toFixed(2)} USDT (Lãi ròng: ${netPnl >= 0 ? '+' : ''}$${netPnl.toFixed(2)} / ${pnlPct.toFixed(1)}%)`
  );

  await this.checkSpotHoldingsUpdate(symbol, price);
  await this.recordEquitySnapshot(this.spotAccountId);
}

  async recalculateAccountEquity(accountId) {
  const account = await paperTradeDao.getAccount(accountId);
  if (!account) return;

  const openPositions = await paperTradeDao.getOpenPositions(accountId);
  let totalUnrealized = 0;
  for (const p of openPositions) {
    totalUnrealized += parseFloat(p.unrealized_pnl || 0);
  }

  const balance = parseFloat(account.balance);
  const equity = balance + totalUnrealized;
  const peakEquity = Math.max(parseFloat(account.peak_equity || balance), equity);
  const currentDd = peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0;
  const maxDd = Math.max(parseFloat(account.max_drawdown_pct || 0), currentDd);

  await paperTradeDao.updateAccount(accountId, {
    equity: Number(equity.toFixed(2)),
    unrealized_pnl: Number(totalUnrealized.toFixed(2)),
    peak_equity: Number(peakEquity.toFixed(2)),
    max_drawdown_pct: Number(maxDd.toFixed(2))
  });
}

  async recordEquitySnapshot(accountId = null) {
  const accIds = accountId
    ? [accountId]
    : [...this.futuresBots.map((b) => b.id), this.spotAccountId];
  for (const accId of accIds) {
    try {
      const account = await paperTradeDao.getAccount(accId);
      if (!account) continue;
      const balance = parseFloat(account.balance);
      const equity = parseFloat(account.equity);
      const dd = parseFloat(account.max_drawdown_pct);
      await paperTradeDao.createEquitySnapshot(accId, balance, equity, dd);
    } catch (err) {
      // Ignore
    }
  }
}

// --- API CONTROL METHODS (SUPPORT BOTH FUTURES & SPOT) ---

resolveAccountId(mode, botId = null) {
  if (mode === 'spot') return this.spotAccountId;
  if (botId && this.futuresBots.some((b) => b.id === botId)) return botId;
  return this.futuresAccountId;
}

  async toggleBot(mode = 'futures', isActive, botId = null) {
  const accId = this.resolveAccountId(mode, botId);
  const account = await paperTradeDao.updateAccount(accId, {
    is_bot_active: isActive
  });
  const botName = this.futuresBots.find((b) => b.id === accId)?.name || mode.toUpperCase();
  await paperTradeDao.createLog(
    accId,
    'SYSTEM',
    'INFO',
    `Tài khoản [${botName}] đã ${isActive ? 'BẬT' : 'TẮT'} chế độ tự động.`
  );

  // Nếu vừa BẬT bot Futures, lập tức quét tín hiệu đang sẵn sàng để vào lệnh
  if (isActive && mode === 'futures') {
    const symbols = account?.tracked_symbols || ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
    const botObj = this.futuresBots.find((b) => b.id === accId) || this.futuresBots[0];
    const isH4 = botObj.interval === '4h';
    const minCandles = isH4 ? 60 : 30;
    for (const sym of symbols) {
      const candles = isH4 ? binanceWsService.getCandlesH4(sym) : binanceWsService.getCandles(sym);
      if (candles && candles.length >= minCandles) {
        try {
          const sig = botObj.evaluator(sym, candles);
          if (sig && sig.action !== 'HOLD') {
            await this.evaluateFuturesCandleForBot(botObj, sym, sig);
          }
        } catch (e) {
          // ignore
        }
      }
    }
  }

  return account;
}

  async resetAccount(mode = 'futures', initialBalance = 100.0, riskPerTrade = null, leverage = null, botId = null) {
  const accId = this.resolveAccountId(mode, botId);
  const defaultLev = mode === 'spot' ? 1 : 3;
  const defaultRisk = mode === 'spot' ? initialBalance * 0.25 : initialBalance * 0.02;

  const account = await paperTradeDao.resetAccount(
    accId,
    initialBalance,
    riskPerTrade || defaultRisk,
    leverage || defaultLev
  );
  const botName = this.futuresBots.find((b) => b.id === accId)?.name || mode.toUpperCase();
  await paperTradeDao.createLog(
    accId,
    'SYSTEM',
    'INFO',
    `Tài khoản [${botName}] đã được reset về mức vốn ban đầu: $${parseFloat(account.balance).toFixed(2)} USDT.`
  );
  return account;
}

  async updateSettings(mode = 'futures', { balance, riskPerTrade, leverage }, botId = null) {
  const accId = this.resolveAccountId(mode, botId);
  const updates = {};
  if (balance !== undefined && !isNaN(parseFloat(balance))) {
    const newBal = parseFloat(balance);
    updates.balance = newBal;
    updates.equity = newBal;
    updates.initial_balance = newBal;
    updates.peak_equity = newBal;
  }
  if (riskPerTrade !== undefined && !isNaN(parseFloat(riskPerTrade))) {
    updates.risk_per_trade = parseFloat(riskPerTrade);
  }
  if (leverage !== undefined && !isNaN(parseInt(leverage, 10))) {
    updates.leverage = mode === 'spot' ? 1 : parseInt(leverage, 10);
  }

  const account = await paperTradeDao.updateAccount(accId, updates);
  const botName = this.futuresBots.find((b) => b.id === accId)?.name || mode.toUpperCase();
  await paperTradeDao.createLog(
    accId,
    'SYSTEM',
    'INFO',
    `Cập nhật cài đặt [${botName}]: Vốn $${parseFloat(account.balance).toFixed(2)} | Tranche/Rủi ro: $${parseFloat(account.risk_per_trade).toFixed(2)}.`
  );
  return account;
}

  async withdrawProfit(mode = 'futures', amountToWithdraw, botId = null) {
  const accId = this.resolveAccountId(mode, botId);
  const account = await paperTradeDao.getAccount(accId);
  if (!account) throw new Error('Không tìm thấy tài khoản');

  const amount = parseFloat(amountToWithdraw);
  if (isNaN(amount) || amount <= 0) {
    throw new Error('Số tiền rút không hợp lệ (phải > 0)');
  }

  const currentBalance = parseFloat(account.balance);
  const currentEquity = parseFloat(account.equity);

  // Kiểm tra số dư khả dụng (Free Margin) nếu là Futures
  if (mode === 'futures') {
    const openPositions = await paperTradeDao.getOpenPositions(accId);
    let usedMargin = 0;
    for (const p of openPositions) {
      usedMargin += parseFloat(p.margin || 0);
    }
    const freeMargin = Math.max(0, currentBalance - usedMargin);
    if (amount > freeMargin) {
      throw new Error(`Số dư khả dụng (Free Margin) không đủ. Tối đa có thể rút: $${freeMargin.toFixed(2)} USDT (Đang có $${usedMargin.toFixed(2)} ký quỹ trong các vị thế mở).`);
    }
  } else {
    if (amount > currentBalance) {
      throw new Error(`Số dư USDT khả dụng không đủ. Tối đa có thể rút: $${currentBalance.toFixed(2)} USDT.`);
    }
  }

  const newBalance = Math.max(0, currentBalance - amount);
  const newEquity = Math.max(0, currentEquity - amount);
  const currentWithdrawn = parseFloat(account.total_withdrawn_profit || 0);
  const newWithdrawn = currentWithdrawn + amount;

  const updatedAccount = await paperTradeDao.updateAccount(accId, {
    balance: Number(newBalance.toFixed(2)),
    equity: Number(newEquity.toFixed(2)),
    total_withdrawn_profit: Number(newWithdrawn.toFixed(2))
  });

  await paperTradeDao.createLog(
    accId,
    'SYSTEM',
    'SUCCESS',
    `💰 [RÚT LÃI VỀ KÉT] Đã rút thành công $${amount.toFixed(2)} USDT về két an toàn. Số dư ví còn lại: $${newBalance.toFixed(2)} USDT (Lũy kế đã rút két: $${newWithdrawn.toFixed(2)} USDT).`
  );

  await this.recordEquitySnapshot(accId);

  return {
    account: updatedAccount,
    withdrawnAmount: amount,
    totalWithdrawn: newWithdrawn,
    remainingBalance: newBalance
  };
}

  async closeFuturesPositionManually(positionId) {
  const allOpen = await paperTradeDao.getOpenPositions('ALL');
  const pos = allOpen.find((p) => String(p.id) === String(positionId));
  if (!pos) throw new Error('Không tìm thấy vị thế mở');
  const currentPrice = binanceWsService.getPrice(pos.symbol) || parseFloat(pos.current_price);
  await this.closeFuturesPosition(pos, currentPrice, 'MANUAL_CLOSE');
  return { success: true };
}

  async sellSpotHoldingManually(symbol) {
  const currentPrice = binanceWsService.getPrice(symbol);
  if (!currentPrice) throw new Error('Chưa có giá thị trường realtime cho ' + symbol);
  await this.sellSpotHolding(symbol, currentPrice, 'MANUAL_SELL');
  return { success: true };
}

  async buySpotHoldingManually(symbol, amountUsdt) {
  const currentPrice = binanceWsService.getPrice(symbol);
  if (!currentPrice) throw new Error('Chưa có giá thị trường realtime cho ' + symbol);
  await this.buySpotHolding(symbol, currentPrice, parseFloat(amountUsdt), 'MANUAL_BUY');
  return { success: true };
}

  async addTrackedSymbol(mode = 'futures', symbol, botId = null) {
  if (!symbol) throw new Error('Vui lòng nhập mã coin');
  let sym = symbol.toUpperCase().trim();
  if (sym === 'XAU' || sym === 'XAUUSD' || sym === 'GOLD' || sym === 'PAXG') sym = 'PAXGUSDT';
  if (sym === 'SOIL') sym = 'SOLUSDT';
  if (!sym.endsWith('USDT')) sym = `${sym}USDT`;

  const accId = this.resolveAccountId(mode, botId);
  const updatedAccount = await paperTradeDao.addTrackedSymbol(accId, sym);
  await binanceWsService.addSymbol(sym);

  await paperTradeDao.createLog(
    accId,
    sym,
    'INFO',
    `Đã thêm cặp coin ${sym} vào danh sách theo dõi & tự động giao dịch.`
  );
  return updatedAccount;
}

  async removeTrackedSymbol(mode = 'futures', symbol, botId = null) {
  if (!symbol) throw new Error('Vui lòng chọn mã coin cần xóa');
  const sym = symbol.toUpperCase().trim();
  const accId = this.resolveAccountId(mode, botId);

  const updatedAccount = await paperTradeDao.removeTrackedSymbol(accId, sym);
  await paperTradeDao.createLog(
    accId,
    sym,
    'INFO',
    `Đã xóa cặp coin ${sym} khỏi danh sách theo dõi.`
  );
  return updatedAccount;
}

  async getDashboardData(mode = 'futures', botId = null) {
  const accId = this.resolveAccountId(mode, botId);

  const [account, orders, snapshots, logs] = await Promise.all([
    paperTradeDao.getAccount(accId),
    paperTradeDao.getOrderHistory(accId, 100),
    paperTradeDao.getEquityHistory(accId, 3000),
    paperTradeDao.getLogs(accId, 40)
  ]);

  const livePrices = binanceWsService.getAllPrices();

  // Tính toán Tỷ lệ thắng (Win Rate) dựa trên toàn bộ lệnh thực tế của tài khoản
  const totalTrades = parseInt(account?.total_trades || 0, 10);
  const winningTrades = parseInt(account?.winning_trades || 0, 10);
  const losingTrades = parseInt(account?.losing_trades || 0, 10);
  const winrate = totalTrades > 0 ? Number(((winningTrades / totalTrades) * 100).toFixed(1)) : 0;

  // Danh sách các Bot Futures cho UI hiển thị Bot Arena / Selector
  let botList = [];
  if (mode === 'futures') {
    botList = await Promise.all(
      this.futuresBots.map(async (b) => {
        const acc = await paperTradeDao.getAccount(b.id);
        const botTotalTrades = parseInt(acc?.total_trades || 0, 10);
        const botWinningTrades = parseInt(acc?.winning_trades || 0, 10);
        const botLosingTrades = parseInt(acc?.losing_trades || 0, 10);
        const wr = botTotalTrades > 0 ? Number(((botWinningTrades / botTotalTrades) * 100).toFixed(1)) : 0;
        const bal = acc ? parseFloat(acc.balance) : 100;
        const eq = acc ? parseFloat(acc.equity) : 100;
        const initBal = acc ? parseFloat(acc.initial_balance) : 100;
        const pnl = eq - initBal;
        const pnlPct = initBal > 0 ? (pnl / initBal) * 100 : 0;
        return {
          id: b.id,
          name: b.name,
          desc: b.desc,
          strategyKey: b.strategyKey,
          balance: bal,
          equity: eq,
          initial_balance: initBal,
          pnl: Number(pnl.toFixed(2)),
          pnlPct: Number(pnlPct.toFixed(2)),
          total_trades: botTotalTrades,
          winning_trades: botWinningTrades,
          losing_trades: botLosingTrades,
          winrate: wr,
          is_bot_active: acc ? acc.is_bot_active : true
        };
      })
    );
  }

  // Đảm bảo các chỉ báo kỹ thuật luôn có dữ liệu tức thì từ nến lịch sử
  const trackedList = account?.tracked_symbols || ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
  for (const sym of trackedList) {
    if (!this.lastEvaluations[sym]) {
      const candles = binanceWsService.getCandles(sym);
      if (candles && candles.length >= 30) {
        try {
          const signal = paperStrategyService.evaluateTrendPullbackStrategy(sym, candles);
          if (signal && signal.indicators) {
            this.lastEvaluations[sym] = signal;
          }
        } catch (e) {
          // ignore
        }
      }
    }
  }

  if (mode === 'spot') {
    const rawHoldings = await paperTradeDao.getSpotHoldings(accId);
    let totalCoinValue = 0;
    let totalCost = 0;
    const holdings = rawHoldings.map((h) => {
      const curPrice = livePrices[h.symbol] || parseFloat(h.avg_buy_price);
      const qty = parseFloat(h.quantity);
      const cost = parseFloat(h.total_cost);
      const curVal = qty * curPrice;
      const pnl = curVal - cost;
      const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
      totalCoinValue += curVal;
      totalCost += cost;
      return {
        ...h,
        current_price: curPrice,
        current_value: Number(curVal.toFixed(2)),
        unrealized_pnl: Number(pnl.toFixed(2)),
        unrealized_pnl_pct: Number(pnlPct.toFixed(2))
      };
    });

    const usdtBalance = parseFloat(account.balance || 0);
    const currentEquity = usdtBalance + totalCoinValue;
    const unrealizedPnl = totalCoinValue - totalCost;

    const finalSnapshots = [...snapshots];
    finalSnapshots.push({
      account_id: accId,
      balance: account.balance,
      equity: Number(currentEquity.toFixed(2)),
      drawdown_pct: account.max_drawdown_pct,
      timestamp: new Date().toISOString()
    });

    return {
      account: {
        ...account,
        equity: Number(currentEquity.toFixed(2)),
        unrealized_pnl: Number(unrealizedPnl.toFixed(2)),
        winrate,
        total_trades: totalTrades,
        winning_trades: winningTrades,
        losing_trades: losingTrades
      },
      trackedSymbols: account.tracked_symbols || ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
      holdings,
      orders,
      equitySnapshots: finalSnapshots,
      logs,
      livePrices,
      lastEvaluations: this.lastEvaluations
    };
  }

  // Default: Futures
  const positions = await paperTradeDao.getOpenPositions(accId);
  let totalUnrealized = 0;
  for (const p of positions) {
    const curPrice = livePrices[p.symbol] || parseFloat(p.current_price || p.entry_price);
    const entryPrice = parseFloat(p.entry_price);
    const qty = parseFloat(p.quantity);
    const pnl = p.side === 'LONG' ? (curPrice - entryPrice) * qty : (entryPrice - curPrice) * qty;
    totalUnrealized += pnl;
  }
  const balance = parseFloat(account.balance || 0);
  const currentEquity = balance + totalUnrealized;

  const finalSnapshots = [...snapshots];
  finalSnapshots.push({
    account_id: accId,
    balance: account.balance,
    equity: Number(currentEquity.toFixed(2)),
    drawdown_pct: account.max_drawdown_pct,
    timestamp: new Date().toISOString()
  });

  return {
    mode: 'futures',
    botList,
    currentBotId: accId,
    account: {
      ...account,
      equity: Number(currentEquity.toFixed(2)),
      unrealized_pnl: Number(totalUnrealized.toFixed(2)),
      winrate,
      total_trades: totalTrades,
      winning_trades: winningTrades,
      losing_trades: losingTrades
    },
    trackedSymbols: account.tracked_symbols || ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
    positions,
    orders,
    equitySnapshots: finalSnapshots,
    logs,
    livePrices,
    lastEvaluations: this.lastEvaluations
  };
}
}

const paperTradeEngine = new PaperTradeEngine();
module.exports = paperTradeEngine;
