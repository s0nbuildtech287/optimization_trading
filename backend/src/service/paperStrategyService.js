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

module.exports = {
  calculateEMA,
  calculateRSI,
  calculateATR,
  evaluateTrendPullbackStrategy
};

