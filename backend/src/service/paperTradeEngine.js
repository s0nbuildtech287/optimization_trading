const binanceWsService = require('./binanceWsService');
const paperStrategyService = require('./paperStrategyService');
const paperTradeDao = require('../dao/paperTradeDao');
const { SPOT_RISK } = require('../utils/constants');

class PaperTradeEngine {
  constructor() {
    this.futuresAccountId = 'acc_binance_futures';
    this.spotAccountId = 'acc_binance_spot';
    this.isProcessingTick = false;
    this.snapshotTimer = null;
    this.lastEvaluations = {};
  }

  async init() {
    console.log('[PaperEngine] Initializing Paper Trading Execution Engine (Futures & Spot)...');
    
    // 1. Khởi tạo bảng dữ liệu
    await paperTradeDao.initPaperTradeTables();

    // Nạp danh sách symbol theo dõi từ DB cho cả 2 ví Futures & Spot
    try {
      const [futAcc, spotAcc] = await Promise.all([
        paperTradeDao.getAccount(this.futuresAccountId),
        paperTradeDao.getAccount(this.spotAccountId)
      ]);
      const allSymbols = new Set([
        ...(futAcc?.tracked_symbols || ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']),
        ...(spotAcc?.tracked_symbols || ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'])
      ]);
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
      // 1. CẬP NHẬT FUTURES
      const openPositions = await paperTradeDao.getOpenPositions(this.futuresAccountId);
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

        // Dời SL về Breakeven khi lãi >= $2 (1R)
        if (!isBreakeven && pnl >= 2.00) {
          await paperTradeDao.updatePosition(pos.id, {
            stop_loss: entryPrice,
            is_breakeven_triggered: true,
            current_price: currentPrice,
            unrealized_pnl: pnl,
            unrealized_pnl_pct: pnlPct
          });
          await paperTradeDao.createLog(
            this.futuresAccountId,
            symbol,
            'INFO',
            `🛡️ Dời Stop Loss về hòa vốn (Breakeven @ ${entryPrice}) cho vị thế ${pos.side} khi đạt lãi +$${pnl.toFixed(2)}`
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

      await this.recalculateAccountEquity(this.futuresAccountId);

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
      accountId: this.futuresAccountId,
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

    const account = await paperTradeDao.getAccount(this.futuresAccountId);
    if (account) {
      const newBalance = parseFloat(account.balance) + netPnl;
      const totalTrades = account.total_trades + 1;
      const winningTrades = netPnl > 0 ? account.winning_trades + 1 : account.winning_trades;
      const losingTrades = netPnl <= 0 ? account.losing_trades + 1 : account.losing_trades;
      const realizedPnl = parseFloat(account.realized_pnl) + netPnl;

      await paperTradeDao.updateAccount(this.futuresAccountId, {
        balance: Number(newBalance.toFixed(2)),
        realized_pnl: Number(realizedPnl.toFixed(2)),
        total_trades: totalTrades,
        winning_trades: winningTrades,
        losing_trades: losingTrades
      });
    }

    const icon = netPnl > 0 ? '🟢' : '🔴';
    await paperTradeDao.createLog(
      this.futuresAccountId,
      pos.symbol,
      netPnl > 0 ? 'SUCCESS' : 'WARN',
      `${icon} Đóng vị thế Futures ${pos.side} [${exitReason}] @ ${exitPrice}. Lãi/Lỗ ròng: ${netPnl >= 0 ? '+' : ''}$${netPnl.toFixed(2)} (${pnlPct.toFixed(1)}%)`
    );

    await this.recordEquitySnapshot(this.futuresAccountId);
  }

  /**
   * Đánh giá chiến lược khi nến 15m đóng cửa
   */
  async handleCandleClosed(symbol, candles) {
    try {
      // 1. Tính toán chỉ báo kỹ thuật
      const signal = paperStrategyService.evaluateTrendPullbackStrategy(symbol, candles);
      if (signal && signal.indicators) {
        this.lastEvaluations[symbol] = signal;
      }

      // 2. THỰC THI CHIẾN LƯỢC FUTURES
      await this.evaluateFuturesCandle(symbol, signal);

      // 3. THỰC THI CHIẾN LƯỢC SPOT (Smart RSI DCA)
      if (signal && signal.indicators) {
        await this.evaluateSpotCandle(symbol, signal.indicators);
      }
    } catch (err) {
      console.error('[PaperEngine] Error in handleCandleClosed:', err.message);
    }
  }

  /**
   * Logic mở lệnh Futures khi có tín hiệu nến
   */
  async evaluateFuturesCandle(symbol, signal) {
    const account = await paperTradeDao.getAccount(this.futuresAccountId);
    if (!account || !account.is_bot_active) return;
    if (!signal || signal.action === 'HOLD') return;

    const openPositions = await paperTradeDao.getOpenPositions(this.futuresAccountId);
    const existingPos = openPositions.find((p) => p.symbol === symbol);
    if (existingPos || openPositions.length >= 2) return;

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
    
    // Tự động co quy mô lệnh để vừa với ngân sách ký quỹ an toàn (tối đa 35% vốn khả dụng, ~$35)
    const maxMarginAllowed = Math.min(currentBalance * 0.35, currentBalance - 5);
    if (margin > maxMarginAllowed) {
      margin = maxMarginAllowed;
      notional = margin * leverage;
      quantity = notional / entryPrice;
    }

    if (margin <= 0 || margin > currentBalance) {
      console.warn(`[PaperEngine-Futures] Số dư ký quỹ không đủ ($${margin} > $${currentBalance})`);
      return;
    }

    await paperTradeDao.createPosition({
      accountId: this.futuresAccountId,
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
      this.futuresAccountId,
      symbol,
      'INFO',
      `🚀 Mở vị thế Futures [${signal.action}] ${symbol} @ ${entryPrice}. SL: ${stopLoss} | TP: ${takeProfit} | Ký quỹ: $${margin.toFixed(2)} (${leverage}x).`
    );
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
    const accIds = accountId ? [accountId] : [this.futuresAccountId, this.spotAccountId];
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

  resolveAccountId(mode) {
    return mode === 'spot' ? this.spotAccountId : this.futuresAccountId;
  }

  async toggleBot(mode = 'futures', isActive) {
    const accId = this.resolveAccountId(mode);
    const account = await paperTradeDao.updateAccount(accId, {
      is_bot_active: isActive
    });
    await paperTradeDao.createLog(
      accId,
      'SYSTEM',
      'INFO',
      `Tài khoản [${mode.toUpperCase()}] đã ${isActive ? 'BẬT' : 'TẮT'} chế độ tự động.`
    );

    // Nếu vừa BẬT bot Futures, lập tức quét tín hiệu đang sẵn sàng để vào lệnh
    if (isActive && mode === 'futures') {
      const symbols = account.tracked_symbols || ['PAXGUSDT', 'BTCUSDT', 'SOLUSDT', 'ETHUSDT', 'BNBUSDT'];
      for (const sym of symbols) {
        if (this.lastEvaluations[sym] && this.lastEvaluations[sym].action !== 'HOLD') {
          await this.evaluateFuturesCandle(sym, this.lastEvaluations[sym]);
        }
      }
    }

    return account;
  }

  async resetAccount(mode = 'futures', initialBalance = 100.0, riskPerTrade = null, leverage = null) {
    const accId = this.resolveAccountId(mode);
    const defaultLev = mode === 'spot' ? 1 : 3;
    const defaultRisk = mode === 'spot' ? initialBalance * 0.25 : initialBalance * 0.02;

    const account = await paperTradeDao.resetAccount(
      accId,
      initialBalance,
      riskPerTrade || defaultRisk,
      leverage || defaultLev
    );
    await paperTradeDao.createLog(
      accId,
      'SYSTEM',
      'INFO',
      `Tài khoản [${mode.toUpperCase()}] đã được reset về mức vốn ban đầu: $${parseFloat(account.balance).toFixed(2)} USDT.`
    );
    return account;
  }

  async updateSettings(mode = 'futures', { balance, riskPerTrade, leverage }) {
    const accId = this.resolveAccountId(mode);
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
    await paperTradeDao.createLog(
      accId,
      'SYSTEM',
      'INFO',
      `Cập nhật cài đặt [${mode.toUpperCase()}]: Vốn $${parseFloat(account.balance).toFixed(2)} | Tranche/Rủi ro: $${parseFloat(account.risk_per_trade).toFixed(2)}.`
    );
    return account;
  }

  async closeFuturesPositionManually(positionId) {
    const openPositions = await paperTradeDao.getOpenPositions(this.futuresAccountId);
    const pos = openPositions.find((p) => String(p.id) === String(positionId));
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

  async addTrackedSymbol(mode = 'futures', symbol) {
    if (!symbol) throw new Error('Vui lòng nhập mã coin');
    let sym = symbol.toUpperCase().trim();
    if (sym === 'XAU' || sym === 'XAUUSD' || sym === 'GOLD' || sym === 'PAXG') sym = 'PAXGUSDT';
    if (sym === 'SOIL') sym = 'SOLUSDT';
    if (!sym.endsWith('USDT')) sym = `${sym}USDT`;

    const accId = this.resolveAccountId(mode);
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

  async removeTrackedSymbol(mode = 'futures', symbol) {
    if (!symbol) throw new Error('Vui lòng chọn mã coin cần xóa');
    const sym = symbol.toUpperCase().trim();
    const accId = this.resolveAccountId(mode);

    const updatedAccount = await paperTradeDao.removeTrackedSymbol(accId, sym);
    await paperTradeDao.createLog(
      accId,
      sym,
      'INFO',
      `Đã xóa cặp coin ${sym} khỏi danh sách theo dõi.`
    );
    return updatedAccount;
  }

  async getDashboardData(mode = 'futures') {
    const accId = this.resolveAccountId(mode);

    const [account, orders, snapshots, logs] = await Promise.all([
      paperTradeDao.getAccount(accId),
      paperTradeDao.getOrderHistory(accId, 50),
      paperTradeDao.getEquityHistory(accId, 100),
      paperTradeDao.getLogs(accId, 40)
    ]);

    const livePrices = binanceWsService.getAllPrices();
    const winrate = account && account.total_trades > 0 
      ? Number(((account.winning_trades / account.total_trades) * 100).toFixed(1)) 
      : 0;

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
      const holdings = rawHoldings.map((h) => {
        const curPrice = livePrices[h.symbol] || parseFloat(h.avg_buy_price);
        const qty = parseFloat(h.quantity);
        const cost = parseFloat(h.total_cost);
        const curVal = qty * curPrice;
        const pnl = curVal - cost;
        const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
        return {
          ...h,
          current_price: curPrice,
          current_value: Number(curVal.toFixed(2)),
          unrealized_pnl: Number(pnl.toFixed(2)),
          unrealized_pnl_pct: Number(pnlPct.toFixed(2))
        };
      });

      return {
        account: {
          ...account,
          winrate
        },
        trackedSymbols: account.tracked_symbols || ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
        holdings,
        orders,
        equitySnapshots: snapshots,
        logs,
        livePrices,
        lastEvaluations: this.lastEvaluations
      };
    }

    // Default: Futures
    const positions = await paperTradeDao.getOpenPositions(accId);
    return {
      account: {
        ...account,
        winrate
      },
      trackedSymbols: account.tracked_symbols || ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
      positions,
      orders,
      equitySnapshots: snapshots,
      logs,
      livePrices,
      lastEvaluations: this.lastEvaluations
    };
  }
}

const paperTradeEngine = new PaperTradeEngine();
module.exports = paperTradeEngine;
