const aiAnalysisReportDao = require("../dao/aiAnalysisReportDao");
const dashboardService = require("./dashboardService");
const behaviorAnalysisService = require("./behaviorAnalysisService");
const riskAnalysisService = require("./riskAnalysisService");
const openaiService = require("./openaiService");
const { buildSourceCacheKey } = require("../dao/queryBuilderHelper");

async function getAiAnalysis({ targetType, targetId, sourceInput, backtestTable, cacheKey, startDate, endDate, forceRefresh = false, userId = "anonymous" }) {
  const tableInput = sourceInput || backtestTable || "all_backtests";
  const cacheKeyVal = cacheKey || buildSourceCacheKey(tableInput);

  if (!forceRefresh) {
    const existing = await aiAnalysisReportDao.getAiReport({
      targetType,
      targetId,
      backtestTable: cacheKeyVal,
      startDate,
      endDate
    });
    if (existing) {
      console.log(`✅ [AI REPORT CACHE HIT] type=${targetType}, id=${targetId}, table=${cacheKeyVal}`);
      return {
        success: true,
        data: existing,
        source: "database_cache"
      };
    }
  }

  console.log(`🔄 [AI REPORT CACHE MISS/REFRESH] Generating report for type=${targetType}, id=${targetId}, table=${cacheKeyVal}...`);

  // 1. Gather all basic diagnostic data in parallel to build a rich global context for all tabs
  const [dashboardData, riskData, behaviorData] = await Promise.all([
    dashboardService.getDashboardData(tableInput, null, startDate, endDate),
    riskAnalysisService.getRiskAnalysisData(tableInput, startDate, endDate),
    behaviorAnalysisService.getBehaviorAnalysisData(tableInput, startDate, endDate)
  ]);

  if (!dashboardData) throw new Error("No dashboard data found for analysis");
  if (!riskData) throw new Error("No risk analysis data found for analysis");
  if (!behaviorData) throw new Error("No behavior analysis data found for analysis");

  const strategies = riskData.strategies || [];
  const disqualifiedIds = strategies.filter(s => s.hardCount > 0).map(s => s.id);
  const monitorIds = strategies.filter(s => s.hardCount === 0 && s.softCount >= 3).map(s => s.id);
  const safeCount = strategies.filter(s => s.hardCount === 0 && s.softCount < 3).length;

  const globalPortfolioContext = `
[GLOBAL PORTFOLIO OVERVIEW STATISTICS]
- Total Strategies: ${dashboardData.overview?.totalStrategies ?? 0}
- Total Executed Deals: ${dashboardData.overview?.totalDeals ?? 0}
- Net Portfolio Profit: $${(dashboardData.overview?.totalProfit ?? 0).toLocaleString()}
- Portfolio Winrate: ${dashboardData.overview?.winRate ?? 0}%
- Avg Profit per Deal: $${(dashboardData.overview?.avgProfitPerDeal ?? 0).toLocaleString()}
- Total Commission Fee: $${(dashboardData.overview?.totalCommission ?? 0).toLocaleString()}
- Total Swap Fee: $${(dashboardData.overview?.totalSwap ?? 0).toLocaleString()}
- Profit Factor: ${dashboardData.detailedReport?.pnl?.portfolioProfitFactor ?? "—"}
- Avg Sharpe: ${dashboardData.detailedReport?.riskMetrics?.avgSharpe ?? 0}
- Avg Max Drawdown: ${dashboardData.detailedReport?.riskMetrics?.avgDrawdownPct ?? 0}%

[GLOBAL PORTFOLIO RISK HEALTH SUMMARY]
- Safe Strategies (No Hard Flags & Soft Flags < 3): ${safeCount}
- Monitor Strategies (Soft Flags >= 3): ${riskData.summary?.softFlaggedStrategies ?? 0} (Mã bot tiêu biểu: ${JSON.stringify(monitorIds.slice(0, 10))})
- Disqualified Strategies (Hard Flags >= 1): ${riskData.summary?.hardFlaggedStrategies ?? 0} (Mã bot tiêu biểu bị loại: ${JSON.stringify(disqualifiedIds.slice(0, 10))})

[GLOBAL BEHAVIORAL EXPOSURE SUMMARY]
- Directional Bias (OB/OS Mismatch): ${behaviorData.summary?.flaggedBias ?? 0} strategies
- Timeframe Mismatch (H4 > H1): ${behaviorData.summary?.mismatch ?? 0} strategies
- exit Reasons Distribution: ${JSON.stringify(behaviorData.summary?.highEot ? "Có nhiều bot đóng lệnh cuối kỳ EoT" : "Đóng lệnh bình thường")}
`;

  let contextSummary = "";
  let defaultPrompt = "";

  if (targetId === "overview_tab") {
    contextSummary = `
${globalPortfolioContext}

[QUALITY DISTRIBUTION OVERVIEW (PF / Sharpe / RF / P/D)]
${JSON.stringify(dashboardData.qualityDistribution || [], null, 2)}

[TOP 10 STRATEGIES BY P/D RATIO]
${JSON.stringify((dashboardData.topStrategies || []).slice(0, 10), null, 2)}
`;
    defaultPrompt = `Hãy đóng vai trò là Trợ lý phân tích định lượng (Quant Analyst) cao cấp của OpLotus.
Phân tích toàn diện hiệu suất hệ thống dựa trên dữ liệu báo cáo danh mục (Overview Portfolio Statistics), biểu đồ phân bổ chất lượng (Quality Distribution) và danh sách Top 10 chiến lược ở trên.

Yêu cầu chi tiết:
1. Đọc và phân tích kỹ các chỉ số: Tỷ lệ thắng (Winrate), lợi nhuận ròng (Net Profit), tỷ lệ Sharpe, Profit Factor, Recovery Factor, và P/D trung bình. Đánh giá tác động của chi phí giao dịch (Commission/Swap) so với lợi nhuận.
2. Trích dẫn cụ thể tên các Strategy ID hàng đầu (ví dụ: các bot xuất sắc trong danh sách Top 10) để minh họa cho phân tích.
3. Cung cấp một mục rõ ràng có tiêu đề: "## KẾT LUẬN & ĐÁNH GIÁ SỨC KHỎE DANH MỤC" để đánh giá tổng quan xem hệ thống này đã đủ độ tin cậy để deploy thực tế chưa, chấm điểm chất lượng danh mục (A, B, C...) kèm lý do.
4. Cung cấp một mục rõ ràng có tiêu đề: "## HƯỚNG DẪN DEPLOY & PHÂN BỔ VỐN" đề xuất cụ thể:
   - Tài sản nào (Symbols/Cặp tiền) và khung thời gian nào (H1/H4) có hiệu suất tốt nhất cần ưu tiên deploy. Bắt buộc phải GIẢI THÍCH LÝ DO chọn (nêu rõ con số cụ thể tại sao lại ưu tiên deploy tài sản này so với phần còn lại dựa trên dữ liệu lợi nhuận ròng, Sharpe hay drawdown).
   - Chỉ ra cụ thể mã Strategy ID nào nên được cấp vốn deploy ngay, mã nào cần tiếp tục theo dõi, và mã nào có chỉ số kém cần loại bỏ. Phải đi kèm GIẢI THÍCH LÝ DO lựa chọn từng bot.
   - Gợi ý tỷ lệ phân bổ vốn hoặc đòn bẩy phù hợp cho các bot.

Hãy viết phân tích cực kỳ chi tiết, mạch lạc, sử dụng các ký tự Markdown (như ##, ###, **, bảng hoặc danh sách) để định dạng báo cáo trông thật chuyên nghiệp và trực quan.`;

  } else if (targetId === "risk_tab") {
    // Extract disqualified strategies
    const disqualified = strategies.filter(s => s.hardCount > 0).map(s => ({
      id: s.id,
      symbol: s.symbol,
      timeframe: s.timeframe,
      hardCount: s.hardCount,
      hardFlags: s.hardFlags,
      netProfit: s.netProfit,
      drawdown: s.drawdownPct
    })).slice(0, 10);

    // Extract monitor strategies (softCount >= 3)
    const monitor = strategies.filter(s => s.hardCount === 0 && s.softCount >= 3).map(s => ({
      id: s.id,
      symbol: s.symbol,
      timeframe: s.timeframe,
      softCount: s.softCount,
      softFlags: s.softFlags,
      netProfit: s.netProfit,
      drawdown: s.drawdownPct
    })).slice(0, 10);

    // Extract top safe strategies
    const safeTop = strategies.filter(s => s.hardCount === 0 && s.softCount < 3)
      .sort((a, b) => b.netProfit - a.netProfit)
      .slice(0, 10)
      .map(s => ({
        id: s.id,
        symbol: s.symbol,
        timeframe: s.timeframe,
        netProfit: s.netProfit,
        drawdown: s.drawdownPct,
        pf: s.pf,
        rf: s.rf,
        pd: s.pd,
        sharpe: s.sharpeRatio
      }));

    contextSummary = `
${globalPortfolioContext}

[HARD & SOFT FLAGS STATS BY DEFINITION]
- Hard Flags definition: Flag 1 (EP<=0), Flag 2 (PF<1.2), Flag 3 (RF<1.0), Flag 4 (P/D<1.0), Flag 5 (Martingale), Flag 6 (Loss Streak>=20), Flag 7 (EoT>10%), Flag 8 (12M Profit Negative).
- Soft Flags definition: Flag 9 (Outlier profit), Flag 10 (Low sample), Flag 11 (Correlation < 0.8), Flag 14 (Sharpe < 0.5), Flag 16 (PF>=2 & DD>=12%), Flag 17 (Loss streak >=12), Flag 18 (DD>=18% & PF<2), Flag 19 (Winrate masking weak PF), Flag 20 (EP too thin), Flag 21 (PF caution), Flag 22 (RF caution), Flag 23 (Low activity), Flag 24 (Full-period winrate below 45%), Flag 25 (H4 low trades).

[DISQUALIFIED STRATEGIES EXAMPLES (TOP 10)]
${JSON.stringify(disqualified, null, 2)}

[MONITOR STRATEGIES EXAMPLES (TOP 10)]
${JSON.stringify(monitor, null, 2)}

[TOP 10 SAFEST STRATEGIES]
${JSON.stringify(safeTop, null, 2)}
`;
    defaultPrompt = `Hãy đóng vai trò là Giám đốc Quản trị Rủi ro (Chief Risk Officer - CRO) cao cấp.
Phân tích chỉ báo rủi ro (Risk Flags Check) và các chỉ số sụt giảm (Drawdown/Portfolio Metrics) của danh mục ở trên.

Yêu cầu chi tiết:
1. Đánh giá mức độ an toàn của danh mục dựa trên số lượng bot bị Loại (Disqualified), Giám sát (Monitor) và An toàn (Safe).
2. Chỉ ra cụ thể các "hố đen rủi ro" - những lỗi vi phạm Hard Flags hoặc Soft Flags nghiêm trọng nhất trong tập dữ liệu. Trích dẫn cụ thể mã các Strategy ID bị loại hoặc bị giám sát kèm theo lý do vi phạm (ví dụ: sụt giảm drawdown cao, EP âm, tỷ lệ thắng thấp...).
3. Đối chiếu với danh sách các bot an toàn nhất để xem xét tiềm năng đầu tư.
4. Cung cấp một mục rõ ràng có tiêu đề: "## KẾT LUẬN & ĐÁNH GIÁ SỨC KHỎE DANH MỤC" đánh giá tỷ lệ rủi ro của toàn bộ danh mục (ví dụ: Cao, Trung bình, Thấp) và kết luận xem danh mục có đủ điều kiện vận hành tài khoản thật hay không.
5. Cung cấp một mục rõ ràng có tiêu đề: "## HƯỚNG DẪN DEPLOY & PHÂN BỔ VỐN" chỉ định cực kỳ rõ ràng:
   - Cặp tài sản nào và khung thời gian nào an toàn nhất để deploy (kèm GIẢI THÍCH LÝ DO cụ thể tại sao chọn dựa trên độ sụt giảm drawdown và tỷ lệ flags thấp).
   - Liệt kê cụ thể mã Strategy ID nào CẤM DEPLOY (phải dừng ngay lập tức do dính hard flags), giải thích lý do cụ thể bot đó dính lỗi gì (ví dụ: EP âm, drawdown cao).
   - Liệt kê cụ thể mã Strategy ID nào được DEPLOY NGAY (nằm trong danh sách an toàn, có chỉ số Sharpe/Drawdown xuất sắc), nêu rõ lý do chọn từng bot.
   - Biện pháp giảm thiểu rủi ro (cắt lỗ tối đa cho từng bot, quản lý đòn bẩy).

Hãy viết báo cáo cực kỳ chi tiết, khoa học, có cấu trúc Markdown rõ ràng (sử dụng ##, ###, **, bảng hoặc danh sách) để người đọc dễ dàng thực thi quyết định.`;

  } else if (targetId === "behavior_tab") {
    // Extract directional bias strategies (status !== 'Balanced')
    const biasSummary = (behaviorData.directionalBiasData || []).map(b => ({
      strategyId: b.id,
      symbol: b.symbol,
      timeframe: b.tf,
      buyProfit: b.buyProfit,
      sellProfit: b.sellProfit,
      buyPct: b.buyPct,
      sellPct: b.sellPct,
      weakPct: b.weakPct,
      status: b.status
    })).slice(0, 15);

    // Extract timeframe mismatches
    const tfSummary = (behaviorData.timeframeMismatchData || []).map(t => ({
      strategyId: t.id,
      symbol: t.symbol,
      bot: t.bot,
      h1Trades: t.h1Count,
      h4Trades: t.h4Count,
      ratio: t.ratio,
      status: t.status
    })).slice(0, 15);

    // Extract holding recovery risks
    const holdingRisk = (behaviorData.holdingRecoveryData || []).filter(h => h.status !== 'Excellent').map(h => ({
      strategyId: h.id,
      symbol: h.symbol,
      totalTrades: h.totalTrades,
      htr: h.htr,
      vei: h.vei,
      status: h.status
    })).slice(0, 15);

    contextSummary = `
${globalPortfolioContext}

[DIRECTIONAL BIAS (BUY VS SELL BIAS) - EXAMPLES]
${JSON.stringify(biasSummary, null, 2)}

[TIMEFRAME MISMATCH (H4 TRADES EXCEEDING H1 COUSIN) - EXAMPLES]
${JSON.stringify(tfSummary, null, 2)}

[HOLDING RISK & MARTINGALE EXPOSURE - EXAMPLES]
- HTR (Holding Time Ratio = avgLossTime / avgWinTime): Ratio > 2.0 indicates loss-aversion (holding losers too long).
- VEI (Volume Escalation Index): Index > 1.2 indicates Martingale behavior (escalating lots after losses).
${JSON.stringify(holdingRisk, null, 2)}

[EXIT TYPES DISTRIBUTION DETAILS]
${JSON.stringify(behaviorData.exitReasonsData || {}, null, 2)}
`;
    defaultPrompt = `Hãy đóng vai trò là Trợ lý phân tích hành vi giao dịch (Trading Behavior Analyst).
Phân tích chi tiết hành vi giao dịch của danh mục ở trên bao gồm: Lệch chiều giao dịch (Directional Bias), Lệch khung thời gian (Timeframe Mismatch), rủi ro gồng lỗ/Martingale (HTR/VEI) và hành vi thoát lệnh.

Yêu cầu chi tiết:
1. Đánh giá xem hệ thống giao dịch có đang trung lập thị trường (market-neutral) hay bị lệch hẳn về một phía (chỉ thắng khi Buy hoặc chỉ thắng khi Sell). Nêu rõ tên các Strategy ID bị lệch nặng (One-Way Edge hoặc DirectionalBias).
2. Phân tích các vi phạm khung thời gian (Timeframe Mismatch) khi bot H1 nhưng lại thực hiện giao dịch ở H4 quá nhiều (tỷ lệ h4/h1 cao). Chỉ ra các mã bot vi phạm nghiêm trọng (Severe).
3. Đánh giá rủi ro gồng lỗ (HTR > 2) và Martingale nhồi lệnh (VEI > 1.2). Chỉ ra cụ thể những mã bot nào đang có hành vi nguy hiểm này.
4. Cung cấp một mục rõ ràng có tiêu đề: "## KẾT LUẬN & ĐÁNH GIÁ SỨC KHỎE DANH MỤC" nhận xét xem thuật toán giao dịch của nhóm bot này có ổn định hay đang ẩn chứa rủi ro hệ thống (gồng lỗ cháy tài khoản).
5. Cung cấp một mục rõ ràng có tiêu đề: "## HƯỚNG DẪN DEPLOY & PHÂN BỔ VỐN" ghi rõ:
   - Những cặp tài sản và khung thời gian nào có hành vi giao dịch chuẩn mực, lành mạnh (đạt tỷ lệ TP/SL hợp lý, không dính Martingale/HTR cao) nên được ưu tiên deploy. Giải thích lý do vì sao chọn chúng dựa trên phân bổ lệnh thoát và tỷ số Winrate của Buy vs Sell.
   - Chỉ ra chính xác mã Strategy ID nào CẦN STOP/DỪNG hoặc KHÔNG DEPLOY do có hành vi Martingale nguy hiểm hoặc lệch pha khung thời gian nghiêm trọng, nêu rõ lý do (ví dụ: nhồi lệnh VEI > 1.2, hoặc gồng lỗ dài).
   - Chỉ ra mã Strategy ID nào được DEPLOY do có hành vi giao dịch cân bằng (Balanced, HTR và VEI tốt), giải thích lý do cụ thể.

Viết báo cáo cực kỳ trực quan, khoa học bằng Markdown (##, ###, **, danh sách hoặc bảng biểu).`;

  } else if (targetId === "ranking_tab") {
    const comparative = dashboardData.comparativeData || {};
    const topRanked = (comparative.ranking || []).slice(0, 10).map(r => ({
      id: r.id,
      symbol: r.symbol,
      tf: r.timeframe,
      composite: r.composite,
      sharpe: r.sharpe,
      pd: r.pd,
      profit: r.profit
    }));

    const bottomRanked = (comparative.ranking || []).slice(-10).map(r => ({
      id: r.id,
      symbol: r.symbol,
      tf: r.timeframe,
      composite: r.composite,
      sharpe: r.sharpe,
      pd: r.pd,
      profit: r.profit
    }));

    contextSummary = `
${globalPortfolioContext}

[STRATEGY COMPARATIVE RANKING DETAILS]
- Top 10 Ranked Strategies by Composite Score:
${JSON.stringify(topRanked, null, 2)}

- Bottom 10 Ranked Strategies by Composite Score:
${JSON.stringify(bottomRanked, null, 2)}

[SYMBOL LEVEL PERFORMANCE AVERAGES]
${JSON.stringify((comparative.averages || []).slice(0, 10), null, 2)}

[OB VS OS PERFORMANCE AVERAGES PER SYMBOL]
${JSON.stringify((comparative.obOs || []).slice(0, 10), null, 2)}
`;
    defaultPrompt = `Hãy đóng vai trò là Chuyên gia Xây dựng Danh mục Đầu tư (Portfolio Constructor).
Phân tích bảng xếp hạng chiến lược (Comparative Ranking), hiệu suất trung bình theo sản phẩm và đối sánh OB vs OS ở trên.

Yêu cầu chi tiết:
1. Đánh giá chất lượng của nhóm chiến lược dẫn đầu (Top 10) dựa trên điểm số Composite, Sharpe, P/D và lợi nhuận ròng.
2. Nhận định xem cặp tài sản nào (Symbol) đang mang lại hiệu suất trung bình tốt nhất và hướng giao dịch nào (OB hay OS) vượt trội.
3. So sánh với nhóm 10 bot đứng cuối bảng xếp hạng (Bottom 10) để chỉ ra lý do tại sao chúng hoạt động kém hiệu quả.
4. Cung cấp một mục rõ ràng có tiêu đề: "## KẾT LUẬN & ĐÁNH GIÁ SỨC KHỎE DANH MỤC" để chấm điểm chất lượng danh mục xếp hạng này và đưa ra đánh giá danh mục có đạt trạng thái tối ưu đa dạng hóa tài sản hay chưa.
5. Cung cấp một mục rõ ràng có tiêu đề: "## HƯỚNG DẪN DEPLOY & PHÂN BỔ VỐN" ghi rõ chi tiết:
   - Các cặp tiền và khung giờ cụ thể cần tập trung deploy (ví dụ: Symbol nào ở H1 hay H4), đi kèm giải thích rõ lý do vì sao chọn chúng dựa trên hiệu suất trung bình vượt trội.
   - Chỉ danh cụ thể các Strategy ID thuộc Top đầu nên DEPLOY NGAY (ví dụ: trích dẫn mã cụ thể và điểm Composite), giải thích lý do lựa chọn từng mã.
   - Chỉ danh cụ thể các Strategy ID thuộc Bottom cần LOẠI BỎ/STOP NGAY, giải thích lý do chỉ số của chúng bị kém.
   - Gợi ý phân bổ vốn (capital allocation) theo tỷ lệ phần trăm cụ thể cho từng cặp tài sản để giảm tương quan đồng thời giữa các bot.

Hãy định dạng báo cáo cực kỳ chi tiết, mạch lạc, trực quan bằng các ký hiệu Markdown (##, ###, **, danh sách hoặc bảng biểu).`;

  } else {
    throw new Error(`Unsupported targetId: ${targetId}`);
  }

  // 2. Build AI prompt messages
  const systemPrompt = `Bạn là Trợ lý phân tích danh mục EA tự động thông minh của OpLotus.
Dữ liệu dưới đây là thống kê tổng hợp (aggregated metrics) của bảng backtest ${cacheKeyVal} ${startDate && endDate ? `trong khoảng thời gian từ ${startDate} đến ${endDate}` : "(Toàn bộ thời gian)"}.

NHIỆM VỤ CỦA BẠN:
1. Thực hiện phân tích dữ liệu một cách kỹ lưỡng, sắc bén, chuyên nghiệp của một chuyên gia tài chính định lượng (Quant / CRO / Portfolio Manager).
2. Tuyệt đối KHÔNG viết chung chung, sáo rỗng hay lý thuyết suông. Phải trích dẫn trực tiếp các số liệu thống kê thực tế, các mã Strategy ID, Symbol, Timeframe cụ thể từ dữ liệu đầu vào để làm minh chứng.
3. TUYỆT ĐỐI KHÔNG tự bịa ra hay sử dụng các mã chiến lược giả lập/placeholder (ví dụ: "EA123", "EA456", "ST001", "ST002", "ST003", "EA789"). Bạn BẮT BUỘC phải trích dẫn và sử dụng chính xác mã Strategy ID thật sự có trong DỮ LIỆU ĐẦU VÀO (ví dụ: "073BTCUSDH4OB", "070DE30H1OB", "089JP225H1OB"...). Việc tự tạo ra các mã không tồn tại trong dữ liệu là một lỗi cực kỳ nghiêm trọng.
4. Báo cáo của bạn bắt buộc phải có hai phần quan trọng được trình bày rõ ràng bằng các tiêu đề Markdown:
   - "## KẾT LUẬN & ĐÁNH GIÁ SỨC KHỎE DANH MỤC": Đưa ra kết luận rõ ràng về tình trạng tổng thể, mức độ sẵn sàng deploy và chấm điểm cho danh mục.
   - "## HƯỚNG DẪN DEPLOY & PHÂN BỔ VỐN": Liệt kê cụ thể tài sản nào (Symbols), khung giờ nào (Timeframes H1/H4), và danh sách mã Strategy ID cụ thể cần deploy ngay, cần theo dõi thêm, hoặc cần dừng/loại bỏ.
5. Trả lời bằng tiếng Việt. Sử dụng định dạng Markdown phong phú (như ##, ###, **, danh sách, bảng biểu) để báo cáo nhìn thật đẹp, chuyên nghiệp và có chiều sâu cấu trúc.`;

  const availableModels = await openaiService.getAvailableModels();
  const preferredModel = process.env.OPENAI_DEFAULT_MODEL || openaiService.getDefaultModel();
  const analysisMaxTokens = parseInt(process.env.OPENAI_ANALYSIS_MAX_TOKENS || 8000);
  const model = availableModels.some(m => m.id === preferredModel)
    ? preferredModel
    : (availableModels.some(m => m.id === "gpt-4o") ? "gpt-4o" : "gpt-4o-mini");

  const fullUserPrompt = `${contextSummary}\n\n${defaultPrompt}\n\nLƯU Ý: Hãy viết bài phân tích chuyên sâu, súc tích, đầy đủ các mục trong khoảng 1500 - 3000 từ. Phân tích trực tiếp từ dữ liệu trên mà không cần gọi thêm công cụ bên ngoài.`;

  try {
    const result = await openaiService.createChatCompletion(
      [
        { role: "user", content: fullUserPrompt }
      ],
      model,
      userId,
      {
        systemPrompt,
        useTools: false,
        maxTokens: analysisMaxTokens
      }
    );

    const generatedContent = (result.message?.content || "").trim();

    if (!generatedContent) {
      throw new Error("AI analysis returned an empty response. Please try again.");
    }

    // Save/persist to database
    const saved = await aiAnalysisReportDao.upsertAiReport({
      targetType,
      targetId,
      backtestTable: cacheKeyVal,
      startDate,
      endDate,
      content: generatedContent
    });

    return {
      success: true,
      data: saved,
      source: "openai_api"
    };

  } catch (error) {
    console.error("❌ Failed to generate AI analysis report:", error.message);
    throw error;
  }
}

module.exports = {
  getAiAnalysis
};
