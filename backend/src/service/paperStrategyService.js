/**
 * Module tính toán chỉ báo kỹ thuật và đánh giá tín hiệu chiến lược (Strategy Evaluator)
 * Dành riêng cho tài khoản quy mô vốn nhỏ ($100 - $200 USDT).
 */

// Hàm tính Exponential Moving Average (EMA)
function calculateEMA(values, period) {
  if (!values || values.length < period) return null;
  const k = 2 / (period + 1);
  // Khởi tạo SMA ban đầu
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += values[i];
  }
  let ema = sum / period;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

// Hàm tính Relative Strength Index (RSI)
function calculateRSI(values, period = 14) {
  if (!values || values.length <= period) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(diff)) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// Hàm tính Average True Range (ATR)
function calculateATR(candles, period = 14) {
  if (!candles || candles.length <= period) return 0;

  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const prev = candles[i - 1];
    const hl = current.high - current.low;
    const hpc = Math.abs(current.high - prev.close);
    const lpc = Math.abs(current.low - prev.close);
    trs.push(Math.max(hl, hpc, lpc));
  }

  if (trs.length < period) return trs[trs.length - 1] || 0;

  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  return atr;
}

/**
 * Đánh giá chiến lược Trend Following + Pullback (M15 / H1)
 * @param {Array} candles Danh sách nến [ { open, high, low, close, volume } ]
 * @returns {Object|null} Tín hiệu giao dịch { action, entryPrice, stopLoss, takeProfit, reason, indicators }
 */
function evaluateTrendPullbackStrategy(symbol, candles) {
  if (!candles || candles.length < 210) return null;

  const closes = candles.map((c) => c.close);
  const currentCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];

  const currentClose = currentCandle.close;
  const ema200 = calculateEMA(closes, 200);
  const ema50 = calculateEMA(closes, 50);
  const ema21 = calculateEMA(closes, 21);
  const rsi = calculateRSI(closes, 14);
  const atr = calculateATR(candles, 14);

  if (!ema200 || !ema50 || !ema21 || !atr || atr <= 0) return null;

  const indicators = {
    symbol,
    currentClose,
    ema200: Number(ema200.toFixed(2)),
    ema50: Number(ema50.toFixed(2)),
    ema21: Number(ema21.toFixed(2)),
    rsi: Number(rsi.toFixed(2)),
    atr: Number(atr.toFixed(2))
  };

  // 1. KỊCH BẢN LONG (BUY)
  // - Xu hướng chính tăng: Giá > EMA200 và EMA50 > EMA200
  // - Giá hồi về (pullback) gần đường EMA 21 (trong phạm vi 0.4% quanh EMA21)
  // - RSI ở vùng lành mạnh (từ 40 đến 65), chưa bị quá mua (>70)
  const isUpTrend = currentClose > ema200 && ema50 > ema200;
  const isLongPullback = currentCandle.low <= ema21 * 1.004 && currentClose >= ema21 * 0.996;
  const isRsiHealthyLong = rsi >= 40 && rsi <= 65;

  if (isUpTrend && isLongPullback && isRsiHealthyLong) {
    // Đặt SL dưới đáy nến trước hoặc 1.5 * ATR
    const slDistance = Math.max(1.5 * atr, currentClose * 0.008);
    const stopLoss = Number((currentClose - slDistance).toFixed(4));
    const takeProfit = Number((currentClose + slDistance * 1.8).toFixed(4)); // Tỷ lệ R:R = 1:1.8

    return {
      action: 'LONG',
      symbol,
      entryPrice: currentClose,
      stopLoss,
      takeProfit,
      riskDistance: slDistance,
      rrRatio: 1.8,
      reason: `EMA200 UpTrend (EMA50 > EMA200), Pullback EMA21, RSI=${rsi.toFixed(1)}`,
      indicators
    };
  }

  // 2. KỊCH BẢN SHORT (SELL)
  // - Xu hướng chính giảm: Giá < EMA200 và EMA50 < EMA200
  // - Giá hồi lên gần đường EMA 21
  // - RSI ở vùng lành mạnh (từ 35 đến 60), chưa bị quá bán (<30)
  const isDownTrend = currentClose < ema200 && ema50 < ema200;
  const isShortPullback = currentCandle.high >= ema21 * 0.996 && currentClose <= ema21 * 1.004;
  const isRsiHealthyShort = rsi <= 60 && rsi >= 35;

  if (isDownTrend && isShortPullback && isRsiHealthyShort) {
    const slDistance = Math.max(1.5 * atr, currentClose * 0.008);
    const stopLoss = Number((currentClose + slDistance).toFixed(4));
    const takeProfit = Number((currentClose - slDistance * 1.8).toFixed(4)); // Tỷ lệ R:R = 1:1.8

    return {
      action: 'SHORT',
      symbol,
      entryPrice: currentClose,
      stopLoss,
      takeProfit,
      riskDistance: slDistance,
      rrRatio: 1.8,
      reason: `EMA200 DownTrend (EMA50 < EMA200), Pullback EMA21, RSI=${rsi.toFixed(1)}`,
      indicators
    };
  }

  return { action: 'HOLD', symbol, indicators };
}

// Hàm tính Simple Moving Average (SMA)
function calculateSMA(values, period) {
  if (!values || values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

// Hàm tính Bollinger Bands (Chu kỳ 20, độ lệch chuẩn 2.0)
function calculateBollingerBands(closes, period = 20, multiplier = 2) {
  if (!closes || closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  return {
    middle: mean,
    upper: mean + multiplier * stdDev,
    lower: mean - multiplier * stdDev,
    stdDev,
    bandwidth: (2 * multiplier * stdDev) / (mean || 1)
  };
}

/**
 * CHIẾN LƯỢC 2: Bollinger Bands & RSI Mean-Reversion (Đánh đảo chiều Sideway)
 * - Thích hợp thị trường đi ngang, biên độ dao động trong dải Bollinger
 * - Tín hiệu LONG: Chạm dải dưới + RSI <= 38 (Quá bán) -> Bật hồi về dải giữa
 * - Tín hiệu SHORT: Chạm dải trên + RSI >= 62 (Quá mua) -> Bị từ chối rơi về dải giữa
 */
function evaluateBollingerMeanReversionStrategy(symbol, candles) {
  if (!candles || candles.length < 50) return null;

  const closes = candles.map((c) => c.close);
  const bb = calculateBollingerBands(closes, 20, 2);
  const rsi = calculateRSI(closes, 14);
  const atr = calculateATR(candles, 14);

  if (!bb || !atr) return null;

  const currentCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];
  const currentClose = currentCandle.close;

  const indicators = {
    bbUpper: Number(bb.upper.toFixed(2)),
    bbMiddle: Number(bb.middle.toFixed(2)),
    bbLower: Number(bb.lower.toFixed(2)),
    rsi: Number(rsi.toFixed(1)),
    atr: Number(atr.toFixed(2))
  };

  // 1. KỊCH BẢN LONG (Bắt bật hồi từ dải dưới)
  const isLowerTouch = prevCandle.low <= bb.lower || currentCandle.low <= bb.lower;
  const isBouncingUp = currentClose > bb.lower;
  const isOversold = rsi <= 38;

  if (isLowerTouch && isBouncingUp && isOversold) {
    const slDistance = Math.max(1.2 * atr, currentClose * 0.007);
    const stopLoss = Number((currentClose - slDistance).toFixed(4));
    // Mục tiêu TP là trục giữa Bollinger Bands hoặc tối thiểu 1.6R
    const targetTp = Math.min(bb.middle, currentClose + slDistance * 1.6);
    const takeProfit = Number(Math.max(targetTp, currentClose + slDistance * 1.2).toFixed(4));

    return {
      action: 'LONG',
      symbol,
      entryPrice: currentClose,
      stopLoss,
      takeProfit,
      riskDistance: slDistance,
      rrRatio: 1.5,
      reason: `Bollinger Lower Bounce, RSI=${rsi.toFixed(1)} <= 38 (Oversold)`,
      indicators
    };
  }

  // 2. KỊCH BẢN SHORT (Bắt đảo chiều từ dải trên)
  const isUpperTouch = prevCandle.high >= bb.upper || currentCandle.high >= bb.upper;
  const isRejectionDown = currentClose < bb.upper;
  const isOverbought = rsi >= 62;

  if (isUpperTouch && isRejectionDown && isOverbought) {
    const slDistance = Math.max(1.2 * atr, currentClose * 0.007);
    const stopLoss = Number((currentClose + slDistance).toFixed(4));
    // Mục tiêu TP là trục giữa Bollinger Bands hoặc tối thiểu 1.6R
    const targetTp = Math.max(bb.middle, currentClose - slDistance * 1.6);
    const takeProfit = Number(Math.min(targetTp, currentClose - slDistance * 1.2).toFixed(4));

    return {
      action: 'SHORT',
      symbol,
      entryPrice: currentClose,
      stopLoss,
      takeProfit,
      riskDistance: slDistance,
      rrRatio: 1.5,
      reason: `Bollinger Upper Rejection, RSI=${rsi.toFixed(1)} >= 62 (Overbought)`,
      indicators
    };
  }

  return { action: 'HOLD', symbol, indicators };
}

/**
 * CHIẾN LƯỢC 3: Donchian Breakout + Volume Spike (Đột phá xung lượng)
 * - Phá vỡ đỉnh 20 nến (Highest High) hoặc đáy 20 nến (Lowest Low)
 * - Khối lượng nến hiện tại vượt 1.5 lần trung bình khối lượng 20 nến (Cá mập đẩy giá)
 */
function evaluateBreakoutMomentumStrategy(symbol, candles) {
  if (!candles || candles.length < 35) return null;

  const past20 = candles.slice(-21, -1);
  const highestHigh = Math.max(...past20.map((c) => c.high));
  const lowestLow = Math.min(...past20.map((c) => c.low));
  const volumeSMA20 = past20.reduce((s, c) => s + (parseFloat(c.volume) || 0), 0) / 20;

  const currentCandle = candles[candles.length - 1];
  const currentClose = currentCandle.close;
  const currentVolume = parseFloat(currentCandle.volume) || 0;
  const isVolumeSpike = volumeSMA20 > 0 && currentVolume >= 1.5 * volumeSMA20;

  const atr = calculateATR(candles, 14);
  if (!atr) return null;

  const indicators = {
    highestHigh20: Number(highestHigh.toFixed(2)),
    lowestLow20: Number(lowestLow.toFixed(2)),
    volumeRatio: Number((volumeSMA20 > 0 ? currentVolume / volumeSMA20 : 1).toFixed(2)),
    atr: Number(atr.toFixed(2))
  };

  // 1. KỊCH BẢN LONG (Breakout phá đỉnh + Volume lớn)
  if (currentClose > highestHigh && isVolumeSpike) {
    const slDistance = Math.max(1.4 * atr, currentClose * 0.008);
    const stopLoss = Number((currentClose - slDistance).toFixed(4));
    const takeProfit = Number((currentClose + slDistance * 1.8).toFixed(4));

    return {
      action: 'LONG',
      symbol,
      entryPrice: currentClose,
      stopLoss,
      takeProfit,
      riskDistance: slDistance,
      rrRatio: 1.8,
      reason: `Donchian Breakout High (${highestHigh}), Volume Spike x${(currentVolume / volumeSMA20).toFixed(1)}`,
      indicators
    };
  }

  // 2. KỊCH BẢN SHORT (Breakdown phá đáy + Volume lớn)
  if (currentClose < lowestLow && isVolumeSpike) {
    const slDistance = Math.max(1.4 * atr, currentClose * 0.008);
    const stopLoss = Number((currentClose + slDistance).toFixed(4));
    const takeProfit = Number((currentClose - slDistance * 1.8).toFixed(4));

    return {
      action: 'SHORT',
      symbol,
      entryPrice: currentClose,
      stopLoss,
      takeProfit,
      riskDistance: slDistance,
      rrRatio: 1.8,
      reason: `Donchian Breakdown Low (${lowestLow}), Volume Spike x${(currentVolume / volumeSMA20).toFixed(1)}`,
      indicators
    };
  }

  return { action: 'HOLD', symbol, indicators };
}

module.exports = {
  calculateEMA,
  calculateRSI,
  calculateATR,
  calculateSMA,
  calculateBollingerBands,
  evaluateTrendPullbackStrategy,
  evaluateBollingerMeanReversionStrategy,
  evaluateBreakoutMomentumStrategy
};

