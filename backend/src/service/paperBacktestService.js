// backend/src/service/paperBacktestService.js
const axios = require('axios');
const paperStrategyService = require('./paperStrategyService');

// In-memory cache cho klines để tránh spam Binance API khi người dùng test liên tục
const klineCache = new Map();

/**
 * Tải dữ liệu nến M15 từ Binance công khai với phân trang
 * @param {string} symbol Cặp coin (BTCUSDT, ETHUSDT...)
 * @param {string} interval Chu kỳ nến ('15m')
 * @param {number} days Số ngày quá khứ cần tải
 */
async function fetchBinanceKlines(symbol = 'BTCUSDT', interval = '15m', days = 30) {
  const cacheKey = `${symbol}_${interval}_${days}d`;
  const cached = klineCache.get(cacheKey);
  const now = Date.now();

  // Cache 10 phút
  if (cached && (now - cached.timestamp < 10 * 60 * 1000)) {
    return cached.candles;
  }

  const msPerCandle = 15 * 60 * 1000; // 15 phút
  const totalCandles = Math.ceil((days * 24 * 60 * 60 * 1000) / msPerCandle);
  const startTime = now - (days * 24 * 60 * 60 * 1000);

  let allKlines = [];
  let currentStart = startTime;

  // Mỗi request Binance tối đa 1000 nến
  while (currentStart < now) {
    try {
      const resp = await axios.get('https://api.binance.com/api/v3/klines', {
        params: {
          symbol,
          interval,
          startTime: currentStart,
          limit: 1000
        },
        timeout: 15000
      });

      const batch = resp.data;
      if (!batch || batch.length === 0) break;

      allKlines.push(...batch);

      // Cập nhật mốc bắt đầu của đợt tiếp theo
      const lastCandleCloseTime = batch[batch.length - 1][6];
      if (lastCandleCloseTime <= currentStart) break;
      currentStart = lastCandleCloseTime + 1;

      if (batch.length < 1000) break;
    } catch (err) {
      console.warn(`[BacktestService] Lỗi tải nến Binance ${symbol}:`, err.message);
      break;
    }
  }

  // Chuyển đổi định dạng nến chuẩn
  const candles = allKlines.map((k) => ({
    openTime: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    closeTime: k[6]
  }));

  if (candles.length > 0) {
    klineCache.set(cacheKey, { timestamp: now, candles });
  }

  return candles;
}

/**
 * Chạy mô phỏng chiến lược (Backtest) trên tập nến
 */
async function runBacktest({
  strategyKey = 'TREND_PULLBACK',
  symbol = 'BTCUSDT',
  days = 30,
  initialBalance = 100.0,
  leverage = 3,
  marginPerTrade = 15.0
}) {
  const candles = await fetchBinanceKlines(symbol, '15m', days);
  if (!candles || candles.length < 210) {
    throw new Error(`Không đủ dữ liệu nến (${candles ? candles.length : 0} nến). Cần tối thiểu 210 nến.`);
  }

  // Lựa chọn hàm đánh giá chiến lược
  let evaluator = null;
  let strategyName = 'Trend Pullback (EMA)';
  if (strategyKey === 'BOLLINGER_REVERSION') {
    evaluator = paperStrategyService.evaluateBollingerMeanReversionStrategy;
    strategyName = 'Bollinger Mean-Reversion';
  } else if (strategyKey === 'BREAKOUT_MOMENTUM') {
    evaluator = paperStrategyService.evaluateBreakoutMomentumStrategy;
    strategyName = 'Breakout Momentum (Donchian)';
  } else {
    evaluator = paperStrategyService.evaluateTrendPullbackStrategy;
    strategyName = 'Trend Pullback (EMA 200 + EMA 21)';
  }

  let balance = parseFloat(initialBalance);
  let currentPos = null;
  const trades = [];
  const equityCurve = [];
  let peakEquity = balance;
  let maxDrawdownUsd = 0;
  let maxDrawdownPct = 0;
  let grossProfit = 0;
  let grossLoss = 0;

  // Ghi nhận snapshot đầu tiên
  equityCurve.push({
    time: new Date(candles[210].openTime).toLocaleDateString() + ' ' + new Date(candles[210].openTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    rawTime: candles[210].openTime,
    equity: Number(balance.toFixed(2)),
    balance: Number(balance.toFixed(2)),
    drawdownPct: 0
  });

  // Vòng lặp duyệt từng nến 15m (từ nến 210 trở đi để đủ dữ liệu chỉ báo)
  for (let i = 210; i < candles.length; i++) {
    const candle = candles[i];
    const prevClose = candles[i - 1].close;

    // 1. NẾU ĐANG CÓ LỆNH MỞ: KIỂM TRA SL, TP, BREAKEVEN THEO CÂY NẾN HIỆN TẠI
    if (currentPos) {
      const isLong = currentPos.side === 'LONG';
      const entryPrice = currentPos.entryPrice;
      const quantity = currentPos.quantity;
      const stopLoss = currentPos.stopLoss;
      const takeProfit = currentPos.takeProfit;
      const margin = currentPos.margin;

      // 1.1 Kiểm tra Dời Stop Loss về Hòa Vốn (Breakeven) khi nến có lúc lãi >= $2 (1R)
      if (!currentPos.isBreakeven) {
        const bestPnl = isLong ? (candle.high - entryPrice) * quantity : (entryPrice - candle.low) * quantity;
        if (bestPnl >= 2.0) {
          currentPos.stopLoss = entryPrice;
          currentPos.isBreakeven = true;
        }
      }

      // 1.2 Kiểm tra Khớp TP / SL
      let exitPrice = null;
      let exitReason = null;

      if (isLong) {
        if (candle.low <= stopLoss) {
          exitPrice = stopLoss;
          exitReason = currentPos.isBreakeven ? 'BREAKEVEN' : 'STOP_LOSS';
        } else if (candle.high >= takeProfit) {
          exitPrice = takeProfit;
          exitReason = 'TAKE_PROFIT';
        }
      } else {
        if (candle.high >= stopLoss) {
          exitPrice = stopLoss;
          exitReason = currentPos.isBreakeven ? 'BREAKEVEN' : 'STOP_LOSS';
        } else if (candle.low <= takeProfit) {
          exitPrice = takeProfit;
          exitReason = 'TAKE_PROFIT';
        }
      }

      // Nếu lệnh bị đóng ở cây nến này
      if (exitReason && exitPrice) {
        const rawPnl = isLong ? (exitPrice - entryPrice) * quantity : (entryPrice - exitPrice) * quantity;
        const fee = (margin * leverage * 0.0004) * 2; // Phí 0.04% mỗi chiều (mở + đóng)
        const netPnl = rawPnl - fee;
        const pnlPct = margin > 0 ? (netPnl / margin) * 100 : 0;

        balance += netPnl;
        if (netPnl > 0) grossProfit += netPnl;
        else grossLoss += Math.abs(netPnl);

        const currentEquity = balance;
        if (currentEquity > peakEquity) peakEquity = currentEquity;
        const dd = peakEquity > 0 ? ((peakEquity - currentEquity) / peakEquity) * 100 : 0;
        if (dd > maxDrawdownPct) {
          maxDrawdownPct = dd;
          maxDrawdownUsd = peakEquity - currentEquity;
        }

        trades.push({
          id: trades.length + 1,
          symbol,
          side: currentPos.side,
          entryPrice: Number(entryPrice.toFixed(4)),
          exitPrice: Number(exitPrice.toFixed(4)),
          quantity: Number(quantity.toFixed(6)),
          margin: Number(margin.toFixed(2)),
          leverage,
          netPnl: Number(netPnl.toFixed(2)),
          pnlPct: Number(pnlPct.toFixed(1)),
          exitReason,
          entryTime: new Date(currentPos.openTime).toISOString(),
          exitTime: new Date(candle.closeTime).toISOString(),
          holdCandles: i - currentPos.openIndex
        });

        currentPos = null;

        // Lưu snapshot sau khi đóng lệnh
        equityCurve.push({
          time: new Date(candle.closeTime).toLocaleDateString() + ' ' + new Date(candle.closeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          rawTime: candle.closeTime,
          equity: Number(balance.toFixed(2)),
          balance: Number(balance.toFixed(2)),
          drawdownPct: Number(dd.toFixed(1))
        });
      }
    }

    // 2. NẾU CHƯA CÓ LỆNH: QUÉT TÍN HIỆU TỪ NẾN ĐÓNG CỬA
    if (!currentPos) {
      const slice = candles.slice(0, i + 1);
      try {
        const signal = evaluator(symbol, slice);
        if (signal && signal.action && signal.action !== 'HOLD') {
          const entryPrice = candle.close;
          const slDistance = Math.abs(entryPrice - signal.stopLoss);

          if (slDistance > 0 && balance >= marginPerTrade) {
            let margin = Math.min(marginPerTrade, balance);
            let notional = margin * leverage;
            let quantity = notional / entryPrice;

            currentPos = {
              side: signal.action,
              entryPrice,
              stopLoss: signal.stopLoss,
              takeProfit: signal.takeProfit,
              margin,
              quantity,
              openTime: candle.closeTime,
              openIndex: i,
              isBreakeven: false
            };
          }
        }
      } catch (err) {
        // bỏ qua nến lỗi
      }
    }

    // Ghi nhận snapshot định kỳ mỗi 16 nến (4 tiếng) nếu không có đóng lệnh
    if (i % 16 === 0) {
      let unrealized = 0;
      if (currentPos) {
        unrealized = currentPos.side === 'LONG'
          ? (candle.close - currentPos.entryPrice) * currentPos.quantity
          : (currentPos.entryPrice - candle.close) * currentPos.quantity;
      }
      const curEq = balance + unrealized;
      if (curEq > peakEquity) peakEquity = curEq;
      const dd = peakEquity > 0 ? ((peakEquity - curEq) / peakEquity) * 100 : 0;
      if (dd > maxDrawdownPct) maxDrawdownPct = dd;

      equityCurve.push({
        time: new Date(candle.closeTime).toLocaleDateString() + ' ' + new Date(candle.closeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        rawTime: candle.closeTime,
        equity: Number(curEq.toFixed(2)),
        balance: Number(balance.toFixed(2)),
        drawdownPct: Number(dd.toFixed(1))
      });
    }
  }

  // Đóng lệnh cuối cùng nếu còn mở đến nến cuối
  if (currentPos) {
    const lastCandle = candles[candles.length - 1];
    const isLong = currentPos.side === 'LONG';
    const rawPnl = isLong
      ? (lastCandle.close - currentPos.entryPrice) * currentPos.quantity
      : (currentPos.entryPrice - lastCandle.close) * currentPos.quantity;
    const fee = (currentPos.margin * leverage * 0.0004) * 2;
    const netPnl = rawPnl - fee;
    const pnlPct = currentPos.margin > 0 ? (netPnl / currentPos.margin) * 100 : 0;

    balance += netPnl;
    if (netPnl > 0) grossProfit += netPnl;
    else grossLoss += Math.abs(netPnl);

    trades.push({
      id: trades.length + 1,
      symbol,
      side: currentPos.side,
      entryPrice: Number(currentPos.entryPrice.toFixed(4)),
      exitPrice: Number(lastCandle.close.toFixed(4)),
      quantity: Number(currentPos.quantity.toFixed(6)),
      margin: Number(currentPos.margin.toFixed(2)),
      leverage,
      netPnl: Number(netPnl.toFixed(2)),
      pnlPct: Number(pnlPct.toFixed(1)),
      exitReason: 'END_OF_DATA',
      entryTime: new Date(currentPos.openTime).toISOString(),
      exitTime: new Date(lastCandle.closeTime).toISOString(),
      holdCandles: candles.length - 1 - currentPos.openIndex
    });
  }

  const totalTrades = trades.length;
  const winningTrades = trades.filter((t) => t.netPnl > 0).length;
  const losingTrades = trades.filter((t) => t.netPnl < 0).length;
  const breakevenTrades = trades.filter((t) => t.netPnl === 0).length;
  const winRate = totalTrades > 0 ? Number(((winningTrades / totalTrades) * 100).toFixed(1)) : 0;
  const netProfit = Number((balance - initialBalance).toFixed(2));
  const netProfitPct = initialBalance > 0 ? Number(((netProfit / initialBalance) * 100).toFixed(2)) : 0;
  const profitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : (grossProfit > 0 ? 99.9 : 0);

  const bestTrade = trades.length > 0 ? Math.max(...trades.map((t) => t.netPnl)) : 0;
  const worstTrade = trades.length > 0 ? Math.min(...trades.map((t) => t.netPnl)) : 0;
  const avgPnl = totalTrades > 0 ? Number((netProfit / totalTrades).toFixed(2)) : 0;

  return {
    strategyKey,
    strategyName,
    symbol,
    days,
    totalCandles: candles.length,
    summary: {
      initialBalance: parseFloat(initialBalance),
      finalEquity: Number(balance.toFixed(2)),
      netProfit,
      netProfitPct,
      totalTrades,
      winningTrades,
      losingTrades,
      breakevenTrades,
      winRate,
      profitFactor,
      maxDrawdownPct: Number(maxDrawdownPct.toFixed(1)),
      maxDrawdownUsd: Number(maxDrawdownUsd.toFixed(2)),
      bestTrade: Number(bestTrade.toFixed(2)),
      worstTrade: Number(worstTrade.toFixed(2)),
      avgTradePnl: avgPnl,
      leverage,
      marginPerTrade
    },
    equityCurve,
    trades: trades.reverse() // Mới nhất lên đầu
  };
}

module.exports = {
  fetchBinanceKlines,
  runBacktest
};

