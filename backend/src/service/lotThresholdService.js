// ============================================
// FILE: service/lotThresholdService.js
// Lot Threshold Analysis - Service Layer
// Parallel workers + JS-side P/D calculation
// ============================================
const lotThresholdDao = require("../dao/lotThresholdDao");
const { VOLUME_THRESHOLD, SYMBOL_VOLUME_CAPS, LOT_SELECTION_TYPE } = require("../utils/constants");
const { LOT_THRESHOLD: LOT_THRESHOLD_MESSAGES } = require('../utils/messages');
const syncProgressTracker = require("../utils/syncProgressTracker");

let isRunningAnalysis = false;

// Store UTC wall-clock values explicitly because the schema uses TIMESTAMP
// WITHOUT TIME ZONE. Passing a JavaScript Date directly would make pg serialize
// it in the machine's local timezone and shift the displayed range.
function toDbUtcTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().replace('T', ' ').replace('Z', '');
}

function selectAutomaticResult(volumeResults) {
  const filteredResults = volumeResults.filter((result) => result.total_trades >= 100 && result.max_drawdown >= 100000);
  if (filteredResults.length === 0) {
    return { bestResult: volumeResults[0] || null, isFallback: true };
  }

  let bestResult = null;
  for (const result of filteredResults) {
    if (!bestResult) {
      bestResult = result;
      continue;
    }
    const currentPD = result.pd_ratio !== null ? Number(result.pd_ratio) : -Infinity;
    const bestPD = bestResult.pd_ratio !== null ? Number(bestResult.pd_ratio) : -Infinity;
    if (currentPD > bestPD || (currentPD === bestPD && Number(result.total_profit) > Number(bestResult.total_profit))) {
      bestResult = result;
    }
  }
  return { bestResult, isFallback: false };
}

/**
 * Calculate P/D and metrics for a set of deals already filtered by volume.
 */
function computeMetrics(deals, timeBegin = null, timeEnd = null) {
  if (!deals || deals.length === 0) {
    return {
      pd_ratio: null,
      total_profit: 0,
      max_drawdown: 0,
      total_trades: 0,
      winrate: 0,
      profit_factor: null,
      recovery_factor: null,
      sharpe_ratio: 0,
      largest_loss_trade: 0,
      largest_profit_trade: 0,
      largest_profit_trade_ratio: null,
      risk_reward_ratio: 0,
      lr_correlation: 1.0,
      avg_profit: 0,
      avg_loss: 0,
    };
  }

  let cumulativeProfit = 0;
  let peakEquity = 0;
  let maxDrawdown = 0;
  let totalProfit = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let profitableDeals = 0;
  let lossDeals = 0;
  let closingTrades = 0;
  let winningClosingTrades = 0;
  let sumProfit = 0;
  let sumLoss = 0;
  let largestProfitTrade = -Infinity;
  let largestLossTrade = Infinity;

  const cumulativeHistory = [];
  const pnlHistory = [];
  const dealTimes = [];

  for (let i = 0; i < deals.length; i++) {
    const deal = deals[i];
    const profit = Number(deal.profit) || 0;
    const commission = Number(deal.commission) || 0;
    const swap = Number(deal.swap) || 0;
    const pnl = profit + commission + swap;
    const direction = String(deal.direction || '').trim().toLowerCase();

    // A trade result is realized on its closing deal. This matches the
    // Strategies Date Range definition and prevents IN + OUT from doubling
    // the winrate denominator.
    if (direction === 'out' || direction === 'out by') {
      closingTrades++;
      if (pnl > 0) winningClosingTrades++;
    }

    cumulativeProfit += pnl;
    totalProfit += pnl;

    if (pnl > largestProfitTrade) largestProfitTrade = pnl;
    if (pnl < largestLossTrade) largestLossTrade = pnl;

    if (pnl > 0) {
      profitableDeals++;
      grossProfit += pnl;
      sumProfit += pnl;
    } else if (pnl < 0) {
      lossDeals++;
      grossLoss += Math.abs(pnl);
      sumLoss += pnl;
    }

    if (cumulativeProfit > peakEquity) {
      peakEquity = cumulativeProfit;
    }

    const drawdown = Math.max(peakEquity, 0) - cumulativeProfit;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }

    cumulativeHistory.push({ index: i + 1, cumulativeProfit });
    pnlHistory.push(pnl);
    const dealTime = new Date(deal.time || deal.time_msc || deal.date);
    if (!Number.isNaN(dealTime.getTime())) dealTimes.push(dealTime.getTime());
  }

  if (largestProfitTrade === -Infinity) largestProfitTrade = 0;
  if (largestLossTrade === Infinity) largestLossTrade = 0;

  const totalTrades = Math.floor(deals.length / 2);
  // Older imported data may not have direction. Keep the same fallback used
  // by Strategies Date Range: positive deals divided by deals/2.
  const winrateTrades = closingTrades > 0 ? closingTrades : totalTrades;
  const winningTrades = closingTrades > 0 ? winningClosingTrades : profitableDeals;
  const winrate = winrateTrades > 0 ? Math.round((winningTrades / winrateTrades) * 10000) / 100 : 0;
  const pdRatio = maxDrawdown > 0 ? Math.round((totalProfit / maxDrawdown) * 100) / 100 : null;
  const recoveryFactor = maxDrawdown > 0 ? Math.round((totalProfit / maxDrawdown) * 100) / 100 : null;
  const profitFactor = grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : null;

  const avgProfit = profitableDeals > 0 ? Math.round((sumProfit / profitableDeals) * 100) / 100 : 0;
  const avgLoss = lossDeals > 0 ? Math.round((sumLoss / lossDeals) * 100) / 100 : 0;
  const riskRewardRatio = Math.abs(avgLoss) > 0 ? Math.round((avgProfit / Math.abs(avgLoss)) * 100) / 100 : 0;
  const largestProfitTradeRatio = totalProfit > 0 ? Math.round((largestProfitTrade / totalProfit) * 10000) / 100 : null;

  const meanPnl = totalProfit / deals.length;
  let varSum = 0;
  for (const deal of deals) {
    const pnl = (Number(deal.profit) || 0) + (Number(deal.commission) || 0) + (Number(deal.swap) || 0);
    varSum += (pnl - meanPnl) ** 2;
  }
  const stdDev = deals.length > 1 ? Math.sqrt(varSum / deals.length) : 0;

  const rangeStart = dealTimes.length ? Math.min(...dealTimes) : new Date(timeBegin || 0).getTime();
  const rangeEnd = dealTimes.length ? Math.max(...dealTimes) : new Date(timeEnd || 0).getTime();
  const timeSpanYears = rangeEnd > rangeStart
    ? Math.max((rangeEnd - rangeStart) / 31536000000.0, 0.1)
    : 0.1;
  const sharpeRatio = stdDev > 0 ? Math.round(((meanPnl / stdDev) * Math.sqrt(deals.length / timeSpanYears)) * 100) / 100 : 0;

  let lrCorrelation = 1.0;
  const n = cumulativeHistory.length;
  if (n > 1) {
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for (let i = 0; i < n; i++) {
      const x = pnlHistory[i];
      const y = cumulativeHistory[i].cumulativeProfit;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
      sumY2 += y * y;
    }
    const denom = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    if (denom > 0) {
      lrCorrelation = Math.round(((n * sumXY - sumX * sumY) / denom) * 10000) / 10000;
    }
  }

  return {
    pd_ratio: pdRatio,
    total_profit: Math.round(totalProfit * 100) / 100,
    max_drawdown: Math.round(maxDrawdown * 100) / 100,
    total_trades: totalTrades,
    winrate,
    profit_factor: profitFactor,
    recovery_factor: recoveryFactor,
    sharpe_ratio: sharpeRatio,
    largest_loss_trade: Math.round(largestLossTrade * 100) / 100,
    largest_profit_trade: Math.round(largestProfitTrade * 100) / 100,
    largest_profit_trade_ratio: largestProfitTradeRatio,
    risk_reward_ratio: riskRewardRatio,
    lr_correlation: lrCorrelation,
    avg_profit: avgProfit,
    avg_loss: avgLoss,
  };
}

/**
 * Compute metrics for every volume threshold from minVol to maxVol.
 */
function computeAllVolumeLevels(deals, volumeLevels, timeBegin = null, timeEnd = null) {
  const results = [];
  let currentFilteredDeals = deals; // Bắt đầu từ danh sách đầy đủ
  for (const vol of volumeLevels) {
    // Lọc lũy tiến trên danh sách đã rút gọn từ bước trước
    currentFilteredDeals = currentFilteredDeals.filter((d) => d.volume <= vol);
    const metrics = computeMetrics(currentFilteredDeals, timeBegin, timeEnd);
    results.push({
      lot_threshold: vol,
      ...metrics,
    });
  }
  return results;
}

/**
 * Build threshold levels:
 * - Lấy các mốc volume thực tế duy nhất từ danh sách deal, làm tròn lên số nguyên.
 * - Lọc trong dải [safeMin, cap] và sắp xếp giảm dần để tối ưu lọc lũy tiến.
 */
function buildVolumeLevels(deals, minVol, maxVol, extraLevels = Infinity, symbol = null, customSymbolCaps = null) {
  // Tính cap từ volume lớn nhất thực tế hoặc maxVol được truyền vào
  const actualMaxVolume = Math.ceil(Math.max(0, ...deals.map((d) => Number(d.volume) || 0)));
  const cap =
    maxVol ||
    (symbol && customSymbolCaps && customSymbolCaps[symbol.toUpperCase()]) ||
    (symbol && SYMBOL_VOLUME_CAPS && SYMBOL_VOLUME_CAPS[symbol.toUpperCase()]) ||
    actualMaxVolume ||
    500;

  // Nếu Broker Cap nhỏ hơn minVol, điều chỉnh minVol bắt đầu quét từ 0 để quét toàn bộ dải hợp lệ
  let safeMin = Math.max(0, Math.floor(minVol));
  if (safeMin > cap) {
    safeMin = 0;
  }

  // Lấy toàn bộ volume thực tế từ deals, lọc các mốc >= safeMin và <= cap, làm tròn lên số nguyên
  const actualVolumes = deals
    .map((deal) => Number(deal.volume) || 0)
    .filter((vol) => vol >= safeMin && vol <= cap)
    .map((vol) => Math.ceil(vol));

  // Loại bỏ trùng lặp và sắp xếp giảm dần (Chỉ sort duy nhất 1 lần)
  const uniqueVolumes = Array.from(new Set(actualVolumes)).sort((a, b) => b - a);

  const levels = [];

  if (uniqueVolumes.length > 0) {
    if (uniqueVolumes.length <= extraLevels) {
      // Lấy toàn bộ mốc volume thực tế
      levels.push(...uniqueVolumes);
    } else {
      // Phân đoạn mẫu nếu vượt quá giới hạn an toàn extraLevels (thường là deals.length)
      const stepInterval = uniqueVolumes.length / extraLevels;
      for (let i = 0; i < extraLevels; i++) {
        const idx = Math.min(Math.floor(i * stepInterval), uniqueVolumes.length - 1);
        levels.push(uniqueVolumes[idx]);
      }
      // Đảm bảo lấy mốc nhỏ nhất
      levels.push(uniqueVolumes[uniqueVolumes.length - 1]);
    }
  }

  // Đảm bảo luôn có mốc baseline là safeMin ở cuối
  if (levels.length === 0 || levels[levels.length - 1] > safeMin) {
    levels.push(safeMin);
  }

  return Array.from(new Set(levels));
}

/**
 * Main analysis flow.
 * 1. Load strategies
 * 2. Load global overlap time range
 * 3. Clear old results
 * 4. Run workers and save all volume levels
 */
async function runAnalysis({ minVol, maxVol, configs, syncId = null, analysisRunId = null, sourceInput = null } = {}) {
  if (isRunningAnalysis) {
    throw new Error("Phân tích Lot Threshold đang chạy, vui lòng thử lại sau.");
  }
  isRunningAnalysis = true;

  try {
    let resolvedConfigs = configs;
    if (!resolvedConfigs && (minVol !== undefined || maxVol !== undefined)) {
      resolvedConfigs = {
        DEFAULT: {
          minVol: minVol !== undefined ? minVol : VOLUME_THRESHOLD.MIN,
          maxVol: maxVol !== undefined ? maxVol : VOLUME_THRESHOLD.MAX,
        }
      };
    }

    const startTime = Date.now();
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  LOT THRESHOLD ANALYSIS");
    console.log(`   Running with custom configurations`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    console.log("📋 Bước 1: Lấy danh sách strategies...");
    const strategies = await lotThresholdDao.getStrategyList(sourceInput);
    console.log(`   ✅ Tổng strategies: ${strategies.length}`);

    if (strategies.length === 0) {
      throw new Error("Không có strategy nào trong database");
    }

    console.log("\n📅 Bước 2: Lấy khoảng thời gian giao nhau đặc quánh nhất...");
    const overlapTimeRange = await lotThresholdDao.getOverlapTimeRange(sourceInput);
    console.log(`   ✅ Khoảng thời gian đặc quánh: [${overlapTimeRange.time_begin.toISOString()} → ${overlapTimeRange.time_end.toISOString()}]`);

    if (overlapTimeRange.time_begin > overlapTimeRange.time_end) {
      console.warn("⚠️  Cảnh báo: Khoảng thời gian giao nhau rỗng (time_begin > time_end).");
    }

    console.log("\n📈 Bước 2.5: Lấy ngưỡng volume tối đa của từng symbol từ DB...");
    const symbolMaxVolumesList = await lotThresholdDao.getSymbolMaxVolumes(sourceInput);
    const symbolMaxVolumesMap = {};
    for (const row of symbolMaxVolumesList) {
      if (row.symbol) {
        const val = Math.ceil(Number(row.optimal_volume));
        if (isNaN(val) || val <= 0) {
          throw new Error(`Lỗi cấu hình: Symbol ${row.symbol} có optimal_volume không hợp lệ (${row.optimal_volume})`);
        }
        symbolMaxVolumesMap[row.symbol.toUpperCase()] = val;
      }
    }
    console.log(`   ✅ Đã tải ngưỡng volume cho ${Object.keys(symbolMaxVolumesMap).length} symbols.`);

    if (analysisRunId) {
      await lotThresholdDao.updateAnalysisRun(analysisRunId, {
        time_begin: toDbUtcTimestamp(overlapTimeRange.time_begin),
        time_end: toDbUtcTimestamp(overlapTimeRange.time_end),
        total_strategies: strategies.length,
      });
    }

    const workerPoolSize = Math.min(Math.max(Math.floor(strategies.length * 0.1), 4), 60);
    console.log(`\n🚀 Bước 4: Chạy analysis song song (${workerPoolSize} workers)...`);

    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    const totalStrategies = strategies.length;

    if (syncId) {
      await syncProgressTracker.updateSyncProgress(syncId, {
        totalFiles: totalStrategies,
      });
    }

    // Không dùng customSymbolCaps để hàm buildVolumeLevels tự động tìm kiếm ngưỡng volume từ DB hoặc constants
    const customSymbolCaps = null;

    let cursor = 0;

    const worker = async (workerId) => {
      while (true) {
        const currentIndex = cursor++;
        if (currentIndex >= strategies.length) break;

        const strategy = strategies[currentIndex];
        const { strategy_id, source_table, symbol } = strategy;

        try {
          const deals = await lotThresholdDao.getDealsForStrategy(
            strategy_id,
            source_table,
            overlapTimeRange.time_begin,
            overlapTimeRange.time_end,
          );

          if (deals.length === 0) {
            failed++;
            processed++;
            console.warn(`   ⚠️  Skip ${strategy_id}/${source_table}: không có deals trong khoảng thời gian đặc quánh`);
            continue;
          }

          const symUpper = symbol ? symbol.toUpperCase() : "DEFAULT";

          // Lấy cấu hình riêng của symbol, hoặc cấu hình DEFAULT
          const symConfig = (resolvedConfigs && resolvedConfigs[symUpper])
            || (resolvedConfigs && resolvedConfigs.DEFAULT)
            || {};

          // min: ưu tiên cấu hình truyền vào, mặc định là 0
          const min = (symConfig.minVol !== undefined && symConfig.minVol !== null) ? symConfig.minVol : 0;

          // max: ưu tiên cấu hình truyền vào (khác 0), tiếp đến là lấy động từ DB, fallback về constants hoặc 100
          let max = (symConfig.maxVol !== undefined && symConfig.maxVol !== null && symConfig.maxVol !== 0) ? symConfig.maxVol : null;
          if (max === null) {
            max = symbolMaxVolumesMap[symUpper] || (SYMBOL_VOLUME_CAPS && SYMBOL_VOLUME_CAPS[symUpper]) || 100;
          }

          // Truyền deals.length làm extraLevels → luôn lấy TẤT CẢ unique breakpoints,
          // không bao giờ sample. Tính toán hoàn toàn in-memory, không tốn DB query.
          const volumeLevels = buildVolumeLevels(deals, min, max, deals.length, symbol, customSymbolCaps);

          // console.log(`   [Worker ${workerId}] [Strategy: ${strategy_id}] Bắt đầu phân tích. Số lượng deal: ${deals.length}.`);
          // console.log(`   [Worker ${workerId}] [Strategy: ${strategy_id}] Quét ${volumeLevels.length} mốc volume thresholds: [ ${volumeLevels.join(", ")} ]`);

          const volumeResults = computeAllVolumeLevels(
            deals,
            volumeLevels,
            overlapTimeRange.time_begin,
            overlapTimeRange.time_end
          );

          const rows = volumeResults.map((vr) => ({
            analysis_run_id: analysisRunId,
            strategy_id,
            source_table,
            symbol,
            lot_threshold: vr.lot_threshold,
            pd_ratio: vr.pd_ratio,
            total_profit: vr.total_profit,
            max_drawdown: vr.max_drawdown,
            total_trades: vr.total_trades,
            winrate: vr.winrate,
            profit_factor: vr.profit_factor,
            recovery_factor: vr.recovery_factor,
            sharpe_ratio: vr.sharpe_ratio,
            largest_loss_trade: vr.largest_loss_trade,
            largest_profit_trade: vr.largest_profit_trade,
            largest_profit_trade_ratio: vr.largest_profit_trade_ratio,
            risk_reward_ratio: vr.risk_reward_ratio,
            lr_correlation: vr.lr_correlation,
            avg_profit: vr.avg_profit,
            avg_loss: vr.avg_loss,
            time_begin: toDbUtcTimestamp(overlapTimeRange.time_begin),
            time_end: toDbUtcTimestamp(overlapTimeRange.time_end),
          }));

          await lotThresholdDao.batchInsertResults(rows);

          const { bestResult, isFallback } = selectAutomaticResult(volumeResults);

          if (bestResult) {
            const optimalRow = {
              analysis_run_id: analysisRunId,
              strategy_id,
              source_table,
              symbol,
              lot_threshold: bestResult.lot_threshold,
              pd_ratio: bestResult.pd_ratio,
              total_profit: bestResult.total_profit,
              max_drawdown: bestResult.max_drawdown,
              total_trades: bestResult.total_trades,
              winrate: bestResult.winrate,
              profit_factor: bestResult.profit_factor,
              recovery_factor: bestResult.recovery_factor,
              sharpe_ratio: bestResult.sharpe_ratio,
              largest_loss_trade: bestResult.largest_loss_trade,
              largest_profit_trade: bestResult.largest_profit_trade,
              largest_profit_trade_ratio: bestResult.largest_profit_trade_ratio,
              risk_reward_ratio: bestResult.risk_reward_ratio,
              lr_correlation: bestResult.lr_correlation,
              avg_profit: bestResult.avg_profit,
              avg_loss: bestResult.avg_loss,
              time_begin: toDbUtcTimestamp(overlapTimeRange.time_begin),
              time_end: toDbUtcTimestamp(overlapTimeRange.time_end),
              is_fallback: isFallback,
            };

            await lotThresholdDao.insertOptimalResult(optimalRow);
          }
          // console.log(`   [Worker ${workerId}] [Strategy: ${strategy_id}] Đã lưu mốc optimal duy nhất (Threshold: ${bestResult.lot_threshold} lots, P/D: ${bestResult.pd_ratio !== null ? bestResult.pd_ratio : "N/A"}) vào database.`);

          succeeded++;
          processed++;

          if (processed % 50 === 0 || processed === totalStrategies) {
            const pct = Math.round((processed / totalStrategies) * 100);
            console.log(`   [${pct}%] ${processed}/${totalStrategies} strategies processed (${succeeded} ok, ${failed} failed)`);
          }

          if (syncId) {
            await syncProgressTracker.updateSyncProgress(syncId, {
              processedFiles: processed,
              successFiles: succeeded,
              failedFiles: failed,
              currentFile: strategy_id,
            });
          }
        } catch (err) {
          failed++;
          processed++;
          console.error(`   ❌ Worker ${workerId}: ${strategy_id}/${source_table} failed: ${err.message}`);
        }
      }
    };

    const numWorkers = Math.min(workerPoolSize, strategies.length);
    const workers = Array.from({ length: numWorkers }, (_, i) => worker(i + 1));
    await Promise.all(workers);

    const duration = Date.now() - startTime;
    const summary = {
      analysisRunId,
      totalStrategies,
      succeeded,
      failed,
      volumeLevels: "Dynamic (based on unique actual volumes <= cap)",
      time_begin: overlapTimeRange.time_begin,
      time_end: overlapTimeRange.time_end,
      durationMs: duration,
      durationFormatted: `${Math.round(duration / 1000)}s`,
    };

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  ✅ LOT THRESHOLD ANALYSIS COMPLETED");
    console.log(`   Strategies: ${succeeded}/${totalStrategies} succeeded`);
    console.log(`   Time Range: [${overlapTimeRange.time_begin.toISOString()} → ${overlapTimeRange.time_end.toISOString()}]`);
    console.log(`   Volume levels: ${summary.volumeLevels}`);
    console.log(`   Duration: ${summary.durationFormatted}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    if (analysisRunId) {
      await lotThresholdDao.updateAnalysisRun(analysisRunId, {
        status: 'COMPLETED',
        total_strategies: totalStrategies,
        succeeded_strategies: succeeded,
        failed_strategies: failed,
        completed_at: new Date(),
      });
    }

    return summary;
  } finally {
    isRunningAnalysis = false;
  }
}

function requireSelectionIdentifiers(input = {}) {
  const analysisRunId = String(input.analysisRunId || '').trim();
  const strategyId = String(input.strategyId || '').trim();
  const sourceTable = String(input.sourceTable || '').trim().toLowerCase();
  if (!analysisRunId || !strategyId || !sourceTable) {
    const error = new Error(LOT_THRESHOLD_MESSAGES.REQUIRED_IDENTIFIERS);
    error.status = 400;
    throw error;
  }
  if (!sourceTable.startsWith('backtest')) {
    const error = new Error(LOT_THRESHOLD_MESSAGES.INVALID_SOURCE_TABLE);
    error.status = 400;
    throw error;
  }
  return { analysisRunId, strategyId, sourceTable };
}

function requireSelectionInput(input = {}) {
  const identifiers = requireSelectionIdentifiers(input);
  const lotThreshold = Number(input.lotThreshold);
  if (!Number.isFinite(lotThreshold)) {
    const error = new Error(LOT_THRESHOLD_MESSAGES.REQUIRED_THRESHOLD);
    error.status = 400;
    throw error;
  }
  return { ...identifiers, lotThreshold };
}

async function selectManualCandidate(input, actor) {
  const selection = requireSelectionInput(input);
  await lotThresholdDao.validateAnalysisRun(selection.analysisRunId, null, actor);
  const result = await lotThresholdDao.selectCandidate({
    ...selection,
    selectionType: LOT_SELECTION_TYPE.MANUAL,
    selectedBy: actor?.userId || null,
  });
  require('./strategyService').clearStrategyCache(selection.sourceTable);
  console.log(`[LOT THRESHOLD] Manual selection ${selection.analysisRunId}/${selection.strategyId}/${selection.sourceTable}: ${result.previousLotThreshold} -> ${selection.lotThreshold} by user=${actor?.userId || 'unknown'}`);
  return result.selection;
}

async function resetAutomaticCandidate(input, actor) {
  const identifiers = requireSelectionIdentifiers(input);
  await lotThresholdDao.validateAnalysisRun(identifiers.analysisRunId, null, actor);
  const candidates = await lotThresholdDao.getCandidateGroup(
    identifiers.analysisRunId,
    identifiers.strategyId,
    identifiers.sourceTable
  );
  if (candidates.length === 0) {
    const error = new Error(LOT_THRESHOLD_MESSAGES.CANDIDATES_NOT_FOUND);
    error.status = 404;
    throw error;
  }
  const { bestResult, isFallback } = selectAutomaticResult(candidates);
  const result = await lotThresholdDao.selectCandidate({
    analysisRunId: identifiers.analysisRunId,
    strategyId: identifiers.strategyId,
    sourceTable: identifiers.sourceTable,
    lotThreshold: bestResult.lot_threshold,
    selectionType: isFallback ? LOT_SELECTION_TYPE.FALLBACK : LOT_SELECTION_TYPE.AUTO,
    selectedBy: null,
  });
  require('./strategyService').clearStrategyCache(identifiers.sourceTable);
  console.log(`[LOT THRESHOLD] Reset to ${isFallback ? 'FALLBACK' : 'AUTO'} ${identifiers.analysisRunId}/${identifiers.strategyId}/${identifiers.sourceTable}: ${result.previousLotThreshold} -> ${bestResult.lot_threshold}`);
  return result.selection;
}

module.exports = {
  runAnalysis,
  computeMetrics,
  computeAllVolumeLevels,
  selectAutomaticResult,
  selectManualCandidate,
  resetAutomaticCandidate,
};
