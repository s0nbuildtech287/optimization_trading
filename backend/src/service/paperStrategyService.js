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

// Hàm tính Average Directional Index (ADX) - Đo lường độ mạnh xu hướng
function calculateADX(candles, period = 14) {
  if (!candles || candles.length < period * 2) return 20; // Giá trị trung tính mặc định

  const plusDM = [];
  const minusDM = [];
  const trs = [];

  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i];
    const prev = candles[i - 1];

    const upMove = curr.high - prev.high;
    const downMove = prev.low - curr.low;

    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);

    const hl = curr.high - curr.low;
    const hpc = Math.abs(curr.high - prev.close);
    const lpc = Math.abs(curr.low - prev.close);
    trs.push(Math.max(hl, hpc, lpc));
  }

  if (trs.length < period) return 20;

  // Wilder's smoothing ban đầu
  let smoothedTR = trs.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);

  const dxList = [];

  for (let i = period; i < trs.length; i++) {
    smoothedTR = smoothedTR - smoothedTR / period + trs[i];
    smoothedPlusDM = smoothedPlusDM - smoothedPlusDM / period + plusDM[i];
    smoothedMinusDM = smoothedMinusDM - smoothedMinusDM / period + minusDM[i];

    const plusDI = smoothedTR > 0 ? (smoothedPlusDM / smoothedTR) * 100 : 0;
    const minusDI = smoothedTR > 0 ? (smoothedMinusDM / smoothedTR) * 100 : 0;
    const diSum = plusDI + minusDI;
    const dx = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;
    dxList.push(dx);
  }

  if (dxList.length < period) return dxList[dxList.length - 1] || 20;

  // Tính ADX bằng Wilder's smoothing trên mảng DX
  let adx = dxList.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dxList.length; i++) {
    adx = (adx * (period - 1) + dxList[i]) / period;
  }

  return Number(adx.toFixed(1));
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
  // - Độ dốc EMA200 hướng lên (Higher Timeframe alignment)
  // - Giá hồi về (pullback) gần đường EMA 21 (trong phạm vi 0.4% quanh EMA21)
  // - RSI ở vùng lành mạnh (từ 40 đến 65), chưa bị quá mua (>70)
  const prevEma200 = calculateEMA(closes.slice(0, -4), 200) || ema200;
  const isEma200Up = ema200 >= prevEma200 * 0.9998;
  const isUpTrend = currentClose > ema200 && ema50 > ema200 && isEma200Up;
  const isLongPullback = currentCandle.low <= ema21 * 1.004 && currentClose >= ema21 * 0.996;
  const isRsiHealthyLong = rsi >= 40 && rsi <= 65;

  const isPaxg = symbol && symbol.includes('PAXG');
  const minSlPct = isPaxg ? 0.0035 : 0.008;

  if (isUpTrend && isLongPullback && isRsiHealthyLong) {
    // Đặt SL động theo ATR (1.5 * ATR, với PAXG SL hẹp theo độ biến động thực tế)
    const slDistance = Math.max(1.5 * atr, currentClose * minSlPct);
    const stopLoss = Number((currentClose - slDistance).toFixed(4));
    const takeProfit = Number((currentClose + slDistance * 2.0).toFixed(4)); // Tỷ lệ R:R = 1:2.0

    return {
      action: 'LONG',
      symbol,
      entryPrice: currentClose,
      stopLoss,
      takeProfit,
      riskDistance: slDistance,
      rrRatio: 2.0,
      reason: `EMA200 UpTrend (EMA50 > EMA200 & Slope Up), Pullback EMA21, RSI=${rsi.toFixed(1)}`,
      indicators
    };
  }

  // 2. KỊCH BẢN SHORT (SELL)
  // - Xu hướng chính giảm: Giá < EMA200 và EMA50 < EMA200
  // - Độ dốc EMA200 hướng xuống
  // - Giá hồi lên gần đường EMA 21
  // - RSI ở vùng lành mạnh (từ 35 đến 60), chưa bị quá bán (<30)
  const isEma200Down = ema200 <= prevEma200 * 1.0002;
  const isDownTrend = currentClose < ema200 && ema50 < ema200 && isEma200Down;
  const isShortPullback = currentCandle.high >= ema21 * 0.996 && currentClose <= ema21 * 1.004;
  const isRsiHealthyShort = rsi <= 60 && rsi >= 35;

  if (isDownTrend && isShortPullback && isRsiHealthyShort) {
    const slDistance = Math.max(1.5 * atr, currentClose * minSlPct);
    const stopLoss = Number((currentClose + slDistance).toFixed(4));
    const takeProfit = Number((currentClose - slDistance * 2.0).toFixed(4)); // Tỷ lệ R:R = 1:2.0

    return {
      action: 'SHORT',
      symbol,
      entryPrice: currentClose,
      stopLoss,
      takeProfit,
      riskDistance: slDistance,
      rrRatio: 2.0,
      reason: `EMA200 DownTrend (EMA50 < EMA200 & Slope Down), Pullback EMA21, RSI=${rsi.toFixed(1)}`,
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
  const adx = calculateADX(candles, 14);

  if (!bb || !atr) return null;

  const currentCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];
  const currentClose = currentCandle.close;

  const indicators = {
    bbUpper: Number(bb.upper.toFixed(2)),
    bbMiddle: Number(bb.middle.toFixed(2)),
    bbLower: Number(bb.lower.toFixed(2)),
    rsi: Number(rsi.toFixed(1)),
    atr: Number(atr.toFixed(2)),
    adx
  };

  // BỘ LỌC BẮT BUỘC: Nếu ADX >= 23, thị trường đang có Trend mạnh (Downtrend/Uptrend dốc) -> KHÔNG bắt đảo chiều
  if (adx >= 23) {
    return {
      action: 'HOLD',
      symbol,
      reason: `Bỏ qua: ADX=${adx} >= 23 (Thị trường có xu hướng mạnh, tránh bắt dao rơi)`,
      indicators
    };
  }

  const isPaxg = symbol && symbol.includes('PAXG');
  const minSlPct = isPaxg ? 0.003 : 0.007;

  // 1. KỊCH BẢN LONG (Bắt bật hồi từ dải dưới khi Sideway)
  const isLowerTouch = prevCandle.low <= bb.lower || currentCandle.low <= bb.lower;
  const isBouncingUp = currentClose > bb.lower;
  const isOversold = rsi <= 38;

  if (isLowerTouch && isBouncingUp && isOversold) {
    const slDistance = Math.max(1.2 * atr, currentClose * minSlPct);
    const stopLoss = Number((currentClose - slDistance).toFixed(4));
    // Mục tiêu TP là trục giữa SMA 20 (Mean-Reversion) hoặc tối thiểu 1.4R
    const targetTp = Math.max(bb.middle, currentClose + slDistance * 1.4);
    const takeProfit = Number(targetTp.toFixed(4));

    return {
      action: 'LONG',
      symbol,
      entryPrice: currentClose,
      stopLoss,
      takeProfit,
      riskDistance: slDistance,
      rrRatio: 1.5,
      reason: `Bollinger Lower Bounce (Sideway ADX=${adx}), RSI=${rsi.toFixed(1)} <= 38`,
      indicators
    };
  }

  // 2. KỊCH BẢN SHORT (Bắt đảo chiều từ dải trên khi Sideway)
  const isUpperTouch = prevCandle.high >= bb.upper || currentCandle.high >= bb.upper;
  const isRejectionDown = currentClose < bb.upper;
  const isOverbought = rsi >= 62;

  if (isUpperTouch && isRejectionDown && isOverbought) {
    const slDistance = Math.max(1.2 * atr, currentClose * minSlPct);
    const stopLoss = Number((currentClose + slDistance).toFixed(4));
    // Mục tiêu TP là trục giữa SMA 20 hoặc tối thiểu 1.4R
    const targetTp = Math.min(bb.middle, currentClose - slDistance * 1.4);
    const takeProfit = Number(targetTp.toFixed(4));

    return {
      action: 'SHORT',
      symbol,
      entryPrice: currentClose,
      stopLoss,
      takeProfit,
      riskDistance: slDistance,
      rrRatio: 1.5,
      reason: `Bollinger Upper Rejection (Sideway ADX=${adx}), RSI=${rsi.toFixed(1)} >= 62`,
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
  // Siết điều kiện Volume Spike: Khối lượng phải bùng nổ gấp 2.0 lần trung bình 20 nến
  const isVolumeSpike = volumeSMA20 > 0 && currentVolume >= 2.0 * volumeSMA20;

  const atr = calculateATR(candles, 14);
  if (!atr) return null;

  const indicators = {
    highestHigh20: Number(highestHigh.toFixed(2)),
    lowestLow20: Number(lowestLow.toFixed(2)),
    volumeRatio: Number((volumeSMA20 > 0 ? currentVolume / volumeSMA20 : 1).toFixed(2)),
    atr: Number(atr.toFixed(2))
  };

  const isPaxg = symbol && symbol.includes('PAXG');
  const minSlPct = isPaxg ? 0.0035 : 0.008;

  // Lọc False Breakout: Nến phá đỉnh phải là nến đặc (thân nến >= 60% tổng chiều dài cây nến)
  // và giá đóng cửa phải nằm sát đỉnh (>= 65% phạm vi nến)
  const candleRange = currentCandle.high - currentCandle.low;
  const candleBody = Math.abs(currentClose - currentCandle.open);
  const isSolidBody = candleRange > 0 && (candleBody / candleRange) >= 0.60;
  const isDecisiveBullish = isSolidBody && currentClose > currentCandle.open && ((currentClose - currentCandle.low) / candleRange) >= 0.65;

  // 1. KỊCH BẢN LONG (Breakout phá đỉnh + Volume lớn x2.0 + Nến đặc dứt khoát)
  if (currentClose > highestHigh && isVolumeSpike && isDecisiveBullish) {
    const slDistance = Math.max(1.4 * atr, currentClose * minSlPct);
    const stopLoss = Number((currentClose - slDistance).toFixed(4));
    const takeProfit = Number((currentClose + slDistance * 2.0).toFixed(4));

    return {
      action: 'LONG',
      symbol,
      entryPrice: currentClose,
      stopLoss,
      takeProfit,
      riskDistance: slDistance,
      rrRatio: 2.0,
      reason: `Donchian Breakout High (${highestHigh}), Vol Spike x${(currentVolume / volumeSMA20).toFixed(1)} >= 2.0x, Solid Bullish`,
      indicators
    };
  }

  // Lọc False Breakdown: Nến phá đáy phải là nến đỏ đặc và đóng sát đáy (>= 65% phạm vi nến)
  const isDecisiveBearish = isSolidBody && currentClose < currentCandle.open && ((currentCandle.high - currentClose) / candleRange) >= 0.65;

  // 2. KỊCH BẢN SHORT (Breakdown phá đáy + Volume lớn x2.0 + Nến đặc dứt khoát)
  if (currentClose < lowestLow && isVolumeSpike && isDecisiveBearish) {
    const slDistance = Math.max(1.4 * atr, currentClose * minSlPct);
    const stopLoss = Number((currentClose + slDistance).toFixed(4));
    const takeProfit = Number((currentClose - slDistance * 2.0).toFixed(4));

    return {
      action: 'SHORT',
      symbol,
      entryPrice: currentClose,
      stopLoss,
      takeProfit,
      riskDistance: slDistance,
      rrRatio: 2.0,
      reason: `Donchian Breakdown Low (${lowestLow}), Vol Spike x${(currentVolume / volumeSMA20).toFixed(1)} >= 2.0x, Solid Bearish`,
      indicators
    };
  }

  return { action: 'HOLD', symbol, indicators };
}

/**
 * CHIẾN LƯỢC 4: H4 Trend Sniper (Donchian 55 + EMA 50/200 - Rùa Biển Turtle Trading)
 * - Khung nến H4: Bắt các con sóng vĩ mô kéo dài nhiều ngày/tuần
 * - Tín hiệu LONG: Giá phá vỡ đỉnh 55 nến H4 kèm xác nhận EMA 50 >= EMA 200
 * - Tín hiệu SHORT: Giá phá vỡ đáy 55 nến H4 kèm xác nhận EMA 50 <= EMA 200
 * - Quản trị rủi ro: SL theo 1.8 * ATR(14) khung H4, TP theo 2.5R (R:R = 1:2.5)
 */
function evaluateH4TrendSniperStrategy(symbol, candles) {
  if (!candles || candles.length < 60) return null;

  const closes = candles.map((c) => c.close);
  const currentCandle = candles[candles.length - 1];
  const currentClose = currentCandle.close;

  // Donchian 55 trên nến H4 (loại trừ nến hiện tại đang chạy)
  const past55 = candles.slice(-56, -1);
  const highestHigh55 = Math.max(...past55.map((c) => c.high));
  const lowestLow55 = Math.min(...past55.map((c) => c.low));

  const ema50 = calculateEMA(closes, 50);
  const ema200 = calculateEMA(closes, 200) || calculateEMA(closes, 100);
  const atr = calculateATR(candles, 14);

  if (!ema50 || !atr || atr <= 0) return null;

  const isPaxg = symbol && symbol.includes('PAXG');
  const minSlPct = isPaxg ? 0.006 : 0.015;
  const slDistance = Math.max(1.8 * atr, currentClose * minSlPct);

  const indicators = {
    highestHigh55: Number(highestHigh55.toFixed(2)),
    lowestLow55: Number(lowestLow55.toFixed(2)),
    ema50: Number(ema50.toFixed(2)),
    ema200: ema200 ? Number(ema200.toFixed(2)) : null,
    atr: Number(atr.toFixed(2))
  };

  // 1. KỊCH BẢN LONG: Phá vỡ đỉnh 55 nến H4 + Xu hướng tăng
  const isUpTrend = ema200 ? (ema50 >= ema200 * 0.998 && currentClose > ema50) : (currentClose > ema50);
  const isBreakoutHigh = currentClose > highestHigh55 && currentClose > currentCandle.open;

  if (isUpTrend && isBreakoutHigh) {
    const stopLoss = Number((currentClose - slDistance).toFixed(4));
    // Turtle Trend: Không dùng TP cố định hẹp, đặt trần bảo vệ 8.0R (Thoát chính qua Trailing Donchian 20)
    const takeProfit = Number((currentClose + slDistance * 8.0).toFixed(4));

    return {
      action: 'LONG',
      symbol,
      entryPrice: currentClose,
      stopLoss,
      takeProfit,
      riskDistance: slDistance,
      rrRatio: 8.0,
      reason: `H4 Donchian 55 Breakout (${highestHigh55}), EMA50 > EMA200 Macro Trend (Turtle Trailing)`,
      indicators
    };
  }

  // 2. KỊCH BẢN SHORT: Phá vỡ đáy 55 nến H4 + Xu hướng giảm
  const isDownTrend = ema200 ? (ema50 <= ema200 * 1.002 && currentClose < ema50) : (currentClose < ema50);
  const isBreakdownLow = currentClose < lowestLow55 && currentClose < currentCandle.open;

  if (isDownTrend && isBreakdownLow) {
    const stopLoss = Number((currentClose + slDistance).toFixed(4));
    // Turtle Trend: Không dùng TP cố định hẹp, đặt trần bảo vệ 8.0R (Thoát chính qua Trailing Donchian 20)
    const takeProfit = Number((currentClose - slDistance * 8.0).toFixed(4));

    return {
      action: 'SHORT',
      symbol,
      entryPrice: currentClose,
      stopLoss,
      takeProfit,
      riskDistance: slDistance,
      rrRatio: 8.0,
      reason: `H4 Donchian 55 Breakdown (${lowestLow55}), EMA50 < EMA200 Macro Trend (Turtle Trailing)`,
      indicators
    };
  }

  return { action: 'HOLD', symbol, indicators };
}

/**
 * CHIẾN LƯỢC 5: TTM Squeeze Breakout (Bollinger Bands + Keltner Channel)
 * - Phát hiện giai đoạn thị trường nén năng lượng (Squeeze ON: BB nằm lọt trong Keltner Channel)
 * - Tín hiệu LONG: Squeeze vừa bung ra (Fire) + Momentum > 0 + Nến đóng vượt Keltner Upper
 * - Tín hiệu SHORT: Squeeze vừa bung ra (Fire) + Momentum < 0 + Nến đóng thủng Keltner Lower
 * - R:R: Cắt lỗ chặt 1.5 * ATR, Chốt lời 2.5R (R:R 1:2.5)
 */
function evaluateTTMSqueezeStrategy(symbol, candles) {
  if (!candles || candles.length < 50) return null;

  const period = 20;
  const closes = candles.map((c) => c.close);
  const currentCandle = candles[candles.length - 1];
  const currentClose = currentCandle.close;

  const bb = calculateBollingerBands(closes, period, 2.0);
  const atr = calculateATR(candles, period);
  const ema20 = calculateEMA(closes, period);

  if (!bb || !atr || !ema20) return null;

  const kcUpper = ema20 + 1.5 * atr;
  const kcLower = ema20 - 1.5 * atr;

  // Kiểm tra trạng thái nén Squeeze hiện tại
  const isCurrentSqueezed = bb.lower > kcLower && bb.upper < kcUpper;

  // Kiểm tra tối thiểu 6 nến nén Squeeze liên tục trước khi bung
  let consecutiveSqueezeBars = 0;
  for (let offset = 2; offset <= 10; offset++) {
    if (candles.length < offset + period) break;
    const subCandles = candles.slice(0, candles.length - offset + 1);
    const subCloses = subCandles.map((c) => c.close);
    const subBB = calculateBollingerBands(subCloses, period, 2.0);
    const subAtr = calculateATR(subCandles, period);
    const subEma20 = calculateEMA(subCloses, period);
    if (subBB && subAtr && subEma20) {
      const subKcUpper = subEma20 + 1.5 * subAtr;
      const subKcLower = subEma20 - 1.5 * subAtr;
      if (subBB.lower > subKcLower && subBB.upper < subKcUpper) {
        consecutiveSqueezeBars++;
      } else {
        break;
      }
    }
  }

  // Squeeze bung nén (Release / Fire) sau ít nhất 6 nến nén chặt liên tiếp
  const isSqueezeFired = consecutiveSqueezeBars >= 6 && !isCurrentSqueezed;
  const adx = calculateADX(candles, 14);

  // John Carter Momentum: Close so với trung bình (Donchian Mid + SMA20)
  const slice20 = candles.slice(-period);
  const high20 = Math.max(...slice20.map((c) => c.high));
  const low20 = Math.min(...slice20.map((c) => c.low));
  const sma20 = closes.slice(-period).reduce((a, b) => a + b, 0) / period;
  const pivot = ((high20 + low20) / 2 + sma20) / 2;
  const momentum = Number((currentClose - pivot).toFixed(2));

  const indicators = {
    bbUpper: Number(bb.upper.toFixed(2)),
    bbLower: Number(bb.lower.toFixed(2)),
    kcUpper: Number(kcUpper.toFixed(2)),
    kcLower: Number(kcLower.toFixed(2)),
    isSqueeze: isCurrentSqueezed,
    isSqueezeFired,
    consecutiveSqueezeBars,
    adx,
    momentum,
    atr: Number(atr.toFixed(2))
  };

  // BỘ LỌC CHẶT: Phải nén ít nhất 6 nến và ADX <= 22 (thị trường thực sự nén kiệt quệ trước khi bùng nổ)
  if (!isSqueezeFired || adx > 22) {
    return { action: 'HOLD', symbol, indicators };
  }

  const isPaxg = symbol && symbol.includes('PAXG');
  const minSlPct = isPaxg ? 0.003 : 0.008;
  const slDistance = Math.max(1.5 * atr, currentClose * minSlPct);

  // Kịch bản LONG: Nổ bung lên trên + Momentum dương
  if (currentClose > kcUpper && momentum > 0 && currentClose > currentCandle.open) {
    const stopLoss = Number((currentClose - slDistance).toFixed(4));
    const takeProfit = Number((currentClose + slDistance * 2.5).toFixed(4));

    return {
      action: 'LONG',
      symbol,
      entryPrice: currentClose,
      stopLoss,
      takeProfit,
      riskDistance: slDistance,
      rrRatio: 2.5,
      reason: `TTM Squeeze Bullish Fire (BB broke KC upper, Mom=+${momentum})`,
      indicators
    };
  }

  // Kịch bản SHORT: Nổ bung xuống dưới + Momentum âm
  if (currentClose < kcLower && momentum < 0 && currentClose < currentCandle.open) {
    const stopLoss = Number((currentClose + slDistance).toFixed(4));
    const takeProfit = Number((currentClose - slDistance * 2.5).toFixed(4));

    return {
      action: 'SHORT',
      symbol,
      entryPrice: currentClose,
      stopLoss,
      takeProfit,
      riskDistance: slDistance,
      rrRatio: 2.5,
      reason: `TTM Squeeze Bearish Fire (BB broke KC lower, Mom=${momentum})`,
      indicators
    };
  }

  return { action: 'HOLD', symbol, indicators };
}

/**
 * CHIẾN LƯỢC 6: Momentum Leader Scanner (Xoay trục dòng tiền & Đón đầu Coin dẫn dắt)
 * - Tốc độ thay đổi giá 24h & 6h (ROC - Rate of Change)
 * - Xác nhận gia tốc giá kèm bùng nổ khối lượng (Volume MA10 > 1.05x MA50)
 * - Đường xu hướng EMA 20 & EMA 50
 * - Quản trị rủi ro: SL 1.6 * ATR, TP 2.5R (R:R 1:2.5), Breakeven 1.4R
 */
function evaluateMomentumLeaderStrategy(symbol, candles) {
  if (!candles || candles.length < 96) return null; // 96 nến 15m = 24 giờ

  const closes = candles.map((c) => c.close);
  const currentCandle = candles[candles.length - 1];
  const currentClose = currentCandle.close;

  // 1. Tốc độ thay đổi giá (Rate of Change - 24h ROC)
  const close24hAgo = candles[candles.length - 96].close;
  const roc24h = ((currentClose - close24hAgo) / close24hAgo) * 100;

  // 2. Tốc độ thay đổi giá ngắn hạn (6h ROC - 24 nến)
  const close6hAgo = candles[candles.length - 24].close;
  const roc6h = ((currentClose - close6hAgo) / close6hAgo) * 100;

  // 3. Khối lượng giao dịch bùng nổ (Volume Ratio: MA10 vs MA50)
  const volumes = candles.map((c) => c.volume);
  const vol10 = volumes.slice(-10).reduce((a, b) => a + b, 0) / 10;
  const vol50 = volumes.slice(-50).reduce((a, b) => a + b, 0) / 50;
  const volumeRatio = vol50 > 0 ? vol10 / vol50 : 1;

  // 4. Đường trung bình xu hướng EMA 20 & EMA 50
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const atr = calculateATR(candles, 14);

  if (!ema20 || !ema50 || !atr || atr <= 0) return null;

  const isPaxg = symbol && symbol.includes('PAXG');
  const minSlPct = isPaxg ? 0.003 : 0.008;
  const slDistance = Math.max(1.6 * atr, currentClose * minSlPct);

  const indicators = {
    roc24h: Number(roc24h.toFixed(2)),
    roc6h: Number(roc6h.toFixed(2)),
    volumeRatio: Number(volumeRatio.toFixed(2)),
    ema20: Number(ema20.toFixed(2)),
    ema50: Number(ema50.toFixed(2)),
    atr: Number(atr.toFixed(2))
  };

  // KỊCH BẢN LONG: Momentum dẫn đầu thực sự (ROC 24h >= 2.5%, ROC 6h >= 1.0%, Vol bùng nổ >= 1.5x, giá trên EMA20 > EMA50)
  const isStrongUptrend = currentClose > ema20 && ema20 > ema50;
  const isMomentumLeaderLong = roc24h >= 2.5 && roc6h >= 1.0 && volumeRatio >= 1.5 && currentClose > currentCandle.open;

  if (isStrongUptrend && isMomentumLeaderLong) {
    const stopLoss = Number((currentClose - slDistance).toFixed(4));
    const takeProfit = Number((currentClose + slDistance * 2.5).toFixed(4));

    return {
      action: 'LONG',
      symbol,
      entryPrice: currentClose,
      stopLoss,
      takeProfit,
      riskDistance: slDistance,
      rrRatio: 2.5,
      reason: `Momentum Leader Long (ROC24h=+${roc24h.toFixed(1)}% >= 2.5%, Vol=${volumeRatio.toFixed(1)}x >= 1.5x, EMA20>50)`,
      indicators
    };
  }

  // KỊCH BẢN SHORT: Momentum suy yếu xả mạnh thực sự (ROC 24h <= -2.5%, ROC 6h <= -1.0%, Vol bùng nổ >= 1.5x, giá dưới EMA20 < EMA50)
  const isStrongDowntrend = currentClose < ema20 && ema20 < ema50;
  const isMomentumLeaderShort = roc24h <= -2.5 && roc6h <= -1.0 && volumeRatio >= 1.5 && currentClose < currentCandle.open;

  if (isStrongDowntrend && isMomentumLeaderShort) {
    const stopLoss = Number((currentClose + slDistance).toFixed(4));
    const takeProfit = Number((currentClose - slDistance * 2.5).toFixed(4));

    return {
      action: 'SHORT',
      symbol,
      entryPrice: currentClose,
      stopLoss,
      takeProfit,
      riskDistance: slDistance,
      rrRatio: 2.5,
      reason: `Momentum Leader Short (ROC24h=${roc24h.toFixed(1)}% <= -2.5%, Vol=${volumeRatio.toFixed(1)}x >= 1.5x, EMA20<50)`,
      indicators
    };
  }

  return { action: 'HOLD', symbol, indicators };
}

module.exports = {
  calculateEMA,
  calculateRSI,
  calculateATR,
  calculateADX,
  calculateSMA,
  calculateBollingerBands,
  evaluateTrendPullbackStrategy,
  evaluateBollingerMeanReversionStrategy,
  evaluateBreakoutMomentumStrategy,
  evaluateH4TrendSniperStrategy,
  evaluateTTMSqueezeStrategy,
  evaluateMomentumLeaderStrategy
};

