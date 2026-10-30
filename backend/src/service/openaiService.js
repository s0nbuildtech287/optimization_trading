// src/service/openaiService.js
const OpenAI = require('openai');
const { recordChatCost } = require('./openaiCostLogger');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Model config ─────────────────────────────────────────────────────────────
const DEFAULT_MODEL = process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o-mini';

const MODEL_METADATA = {
  'gpt-4o-mini':   { label: 'GPT-4o Mini',   badge: 'Default' },
  'gpt-4o':        { label: 'GPT-4o',        badge: 'Smart'   },
  'gpt-5.4':       { label: 'GPT-5.4',       badge: 'Default' },
  'gpt-4-turbo':   { label: 'GPT-4 Turbo',   badge: null      },
  'gpt-3.5-turbo': { label: 'GPT-3.5 Turbo', badge: 'Lite'    },
};
const MODELS_LIMIT     = parseInt(process.env.CHAT_MODELS_LIMIT    || 5);
const MODELS_CACHE_TTL = parseInt(process.env.CHAT_MODELS_CACHE_TTL || 300000);
const modelsCache = { data: null, timestamp: 0 };

function formatModelLabel(id) {
  return id.replace(/^gpt-/, 'GPT-').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Models confirmed to NOT support chat completions (v1/chat/completions)
const CHAT_COMPLETIONS_BLACKLIST = new Set();

function isLikelyChatModel(id) {
  const lower = id.toLowerCase();
  if (CHAT_COMPLETIONS_BLACKLIST.has(id)) return false;
  const excluded = ['embedding','moderation','audio','transcribe','realtime','tts','whisper','dall','image','omni-moderation'];
  if (excluded.some(k => lower.includes(k))) return false;
  return lower.startsWith('gpt-') || /^o\d/.test(lower) || lower.startsWith('chatgpt');
}

async function getAvailableModels({ forceRefresh = false } = {}) {
  const valid = Date.now() - modelsCache.timestamp < MODELS_CACHE_TTL;
  if (!forceRefresh && valid && modelsCache.data?.length) return modelsCache.data;
  try {
    const list = await openai.models.list();
    const models = (list?.data || [])
      .filter(m => isLikelyChatModel(m.id))
      .sort((a, b) => (b.created || 0) - (a.created || 0))
      .slice(0, MODELS_LIMIT)
      .map((m, i) => ({
        id:    m.id,
        label: MODEL_METADATA[m.id]?.label || formatModelLabel(m.id),
        badge: MODEL_METADATA[m.id]?.badge || (i === 0 ? 'Newest' : null),
      }));

    // Nếu tất cả model mới bị blacklist → fallback về danh sách cứng
    const usable = models.length ? models : Object.entries(MODEL_METADATA).map(([id, m]) => ({ id, ...m }));

    // Đảm bảo DEFAULT_MODEL luôn có trong list
    if (!usable.some(m => m.id === DEFAULT_MODEL)) {
      usable.push({
        id:    DEFAULT_MODEL,
        label: MODEL_METADATA[DEFAULT_MODEL]?.label || formatModelLabel(DEFAULT_MODEL),
        badge: MODEL_METADATA[DEFAULT_MODEL]?.badge || 'Default',
      });
    }

    modelsCache.data = usable;
    modelsCache.timestamp = Date.now();
    return usable;
  } catch (err) {
    console.error('⚠️ [MODELS] fallback:', err.message);
    const fallback = Object.entries(MODEL_METADATA).map(([id, m]) => ({ id, ...m }));
    if (!fallback.some(m => m.id === DEFAULT_MODEL)) {
      fallback.unshift({
        id: DEFAULT_MODEL,
        label: MODEL_METADATA[DEFAULT_MODEL]?.label || formatModelLabel(DEFAULT_MODEL),
        badge: MODEL_METADATA[DEFAULT_MODEL]?.badge || 'Default',
      });
    }
    modelsCache.data = fallback;
    modelsCache.timestamp = Date.now();
    return fallback;
  }
}

function isValidModel(model, models = []) { return models.some(m => m.id === model); }
function getDefaultModel() { 
  // Ưu tiên: DEFAULT_MODEL nếu có trong cache, không thì lấy đầu list, fallback cứng
  if (modelsCache.data?.some(m => m.id === DEFAULT_MODEL)) return DEFAULT_MODEL;
  return modelsCache.data?.[0]?.id || DEFAULT_MODEL;
}

// ─── Rate limit ───────────────────────────────────────────────────────────────
const rateLimitMap = new Map();
const MAX_RPM = parseInt(process.env.CHAT_RATE_LIMIT || 10);

function checkRateLimit(userId) {
  const key = `rl_${userId}`;
  const now = Date.now();
  const d = rateLimitMap.get(key);
  if (!d || now > d.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + 60000 });
    return { allowed: true, remaining: MAX_RPM - 1 };
  }
  if (d.count >= MAX_RPM) {
    return { allowed: false, retryAfter: Math.ceil((d.resetTime - now) / 1000),
      message: `Rate limit exceeded. Try again in ${Math.ceil((d.resetTime - now) / 1000)}s` };
  }
  d.count++;
  return { allowed: true, remaining: MAX_RPM - d.count };
}

// ─── System prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Bạn là trợ lý AI của OpLotus — nền tảng quản lý và phân tích backtest chiến lược giao dịch tự động (Expert Advisor / EA trên MetaTrader).

=== CẤU TRÚC DATABASE ===

Bảng backtest (dynamic, ví dụ: backtest1, backtest2, backtestoil...):
- time (TIMESTAMP), deal (BIGINT), symbol (TEXT), type (TEXT)
- direction (TEXT): "in" = mở lệnh, "out" = đóng lệnh
- volume (NUMERIC), price (NUMERIC), order (BIGINT)
- commission (NUMERIC), swap (NUMERIC), profit (NUMERIC)
- comment (TEXT), strategy_id (TEXT)
- Primary Key: (deal, strategy_id)
- all_backtests: UNION ALL động tất cả bảng backtest, thêm cột source_table
- LƯU Ý: "all_backtests" là sentinel chọn toàn bộ nguồn, KHÔNG PHẢI tên table thật.

Bảng strategy_metadata:
- strategy_id, backtest_table (PK composite)
- symbol, expert_name, expert_id, timeframe
- period_start, period_end (TIMESTAMP)
- settings (JSONB), results (JSONB)
- created_at, updated_at

Cấu trúc JSONB settings:
{ expert, symbol, period, dateRange, inputs: { AcceptBuy, AcceptSell, StopLoss, TakeProfit, ... }, company, currency, initialDeposit, leverage }

Cấu trúc JSONB results:
{ totalNetProfit, grossProfit, grossLoss, balanceDrawdownMaximal (dạng "5000 (0.5%)"), profitFactor, sharpeRatio, recoveryFactor, lrCorrelation, totalTrades, profitTrades (dạng "75 (75%)"), lossTrades, largestProfitTrade, largestLossTrade, averageProfitTrade, averageLossTrade, expectedPayoff, ... }

Bảng users: id, username, email, password (bcrypt), roles (user/admin)
Bảng sync_jobs: sync_id, table_name, operation_type, action, status (PROCESSING/COMPLETED/FAILED), metadata, thời gian và tiến độ sync

=== CÔNG THỨC 12 CHỈ SỐ FILTER ===

⚠️ QUAN TRỌNG: Có 2 cách tính metrics tùy theo có date range hay không:

**KHI KHÔNG CÓ DATE RANGE** (full period):
- Tất cả 12 chỉ số đều lấy từ cột 'results' (JSONB) - đã được tính sẵn cho toàn bộ backtest period

**KHI CÓ DATE RANGE** (startDate + endDate):
- 8 chỉ số DATE RANGE: tính toán động trong kỳ từ deals giao dịch thô
  + P/D ratio, Total Net Profit, Total Trades, Winrate, Largest Loss Trade, Largest Profit Trade Ratio, Drawdown, Risk-Reward Ratio
- 4 chỉ số FULL PERIOD: vẫn lấy tĩnh từ cột 'results' (toàn bộ backtest period)
  + Profit Factor, Sharpe Ratio, Recovery Factor, LR Correlation

1. P/D ratio = totalNetProfit / |balanceDrawdownMaximal|
   - balanceDrawdownMaximal lưu dạng "5000 (0.5%)" → lấy 5000 (phần trước dấu ngoặc)
   - Chỉ số quan trọng nhất, càng cao càng tốt. Thường filter >= 2
   - DATE RANGE: tính từ deals trong khoảng thời gian

2. Total Net Profit = results.totalNetProfit (USD)
   - Tổng lợi nhuận ròng toàn bộ backtest
   - DATE RANGE: tính từ deals trong khoảng thời gian

3. Total Trades = results.totalTrades
   - Tổng số lệnh đã giao dịch
   - DATE RANGE: tính từ deals trong khoảng thời gian

4. Winrate = số lệnh OUT có profit > 0 / tổng lệnh OUT * 100
   - Lệnh OUT: direction = 'out' (lệnh đóng vị thế)
   - Lấy nhanh từ profitTrades dạng "75 (75%)" → extract % trong ngoặc
   - Filter theo % (ví dụ >= 60)
   - DATE RANGE: tính từ deals trong khoảng thời gian

5. Largest Profit Trade Ratio = largestProfitTrade / totalNetProfit * 100
   - Nên < 30% để tránh phụ thuộc vào 1 lệnh thắng lớn
   - DATE RANGE: tính từ deals trong khoảng thời gian

6. Largest Loss Trade = |results.largestLossTrade|
   - Lệnh thua lỗ lớn nhất (giá trị âm trong DB), filter theo giá trị tuyệt đối
   - DATE RANGE: tính từ deals trong khoảng thời gian

7. Risk-Reward Ratio = averageProfitTrade / |averageLossTrade|
   - Nên > 1.5
   - DATE RANGE: tính toán động trong kỳ từ deals giao dịch thô

8. Drawdown = balanceDrawdownMaximal
   - Lưu dạng "107874.95 (0.01%)"
   - Filter theo % (mặc định) hoặc giá trị tuyệt đối ($)
   - Lấy % → extract trong ngoặc hoặc tính toán động; lấy absolute → extract hoặc tính động
   - DATE RANGE: tính toán động trong kỳ từ deals giao dịch thô

9. Profit Factor = grossProfit / |grossLoss|
   - Nên > 1.5, tốt > 2.0
   - FULL PERIOD: luôn lấy từ results (không phụ thuộc date range)

10. Sharpe Ratio = lợi nhuận trung bình / độ lệch chuẩn
    - Nên > 1.0
    - FULL PERIOD: luôn lấy từ results (không phụ thuộc date range)

11. Recovery Factor = totalNetProfit / |balanceDrawdownMaximal|
    - Công thức giống P/D trong hệ thống này. Nên > 3.0
    - FULL PERIOD: luôn lấy từ results (không phụ thuộc date range)

12. LR Correlation = độ tuyến tính của equity curve
    - Gần 1.0 = equity tăng đều, ổn định. Nên > 0.9
    - FULL PERIOD: luôn lấy từ results (không phụ thuộc date range)

=== FILTER LOGIC (trang strategy-input) ===

Các filter hỗ trợ: >=, >, <, <=, hoặc range (min-max). Có thể kết hợp nhiều filter cùng lúc.
- symbol: 1 hoặc nhiều trong BTCUSD, ETHUSD, XAUUSD, XAGUSD, US500, DE30, JP225, HK50, USOIL
- type: buy (AcceptBuy=true) hoặc sell (AcceptSell=true) từ settings.inputs
- timeframe: H1, H4, D1...
- search: tìm theo strategy_id (ILIKE, không phân biệt hoa thường)
- drawdown: có 2 chế độ percent (%) hoặc absolute ($)
- Sắp xếp mặc định: symbol priority (BTC→ETH→XAU→XAG→US500→DE30→JP225→HK50→OIL), rồi bot ID, timeframe, order type

=== QUY TRÌNH SYNC DATA ===

1. Upload Google Sheet URL hoặc Drive folder URL
2. Đọc file Excel từ Google Drive qua Google Sheets API
3. Parse phần Settings (Expert, Symbol, Period, Inputs key=value...)
4. Parse phần Results (40+ chỉ số hiệu suất)
5. Lưu deals vào bảng backtest (ON CONFLICT DO NOTHING)
6. Upsert metadata vào strategy_metadata
7. Làm mới cache dữ liệu all_backtests
8. Clear toàn bộ cache

=== HƯỚNG DẪN SỬ DỤNG ===

- Trang strategy-input: filter và xem danh sách strategies theo các chỉ số
- Trang dashboard: tổng quan profit, winrate, top strategies theo P/D
- Balance chart: xem equity curve của từng strategy

=== TOOLS TRUY VẤN DATABASE (BẮT BUỘC DÙNG) ===

Bạn có các tools sau để truy vấn trực tiếp database. PHẢI gọi tool thay vì tự đoán hoặc nói "chưa truy vấn được":

1. queryStrategies — lọc strategies từ DB theo bất kỳ chỉ số nào
   - Dùng khi: user hỏi "có bao nhiêu strategy P/D > X", "top strategies theo winrate", "lọc XAUUSD H4", "phân tích data", "tổng quan", v.v.
   - Tham số pd nhận giá trị số dạng string, ví dụ pd="5" nghĩa là P/D >= 5
   - Mặc định operator là >= cho tất cả chỉ số (trừ drawdown là <=)
   - pageSize tối đa 50, mặc định 20
   - backtestTable: dùng "all_backtests" để lấy TẤT CẢ backtest tables
   - Các backtest table thật: backtest1, backtest2, backtest3, backtestoil, v.v.
   
   RESPONSE STRUCTURE:
   - total: TỔNG SỐ strategies trong DB khớp với filter (ví dụ: 14665, 8576...)
   - returned: số strategies trả về trong response này (tối đa 50)
   - strategies: mảng strategies mẫu (tối đa 50 rows)
   - full_statistics: THỐNG KÊ TÍNH TỪ TOÀN BỘ "total" STRATEGIES (không phải từ 50 rows mẫu)
     + Bao gồm: avg/median P/D, winrate, profit factor, sharpe, recovery, lr_correlation, drawdown
     + Các phần trăm: pct_above_5 (% strategies có P/D >= 5), pct_above_60 (winrate >= 60%), v.v.
   
   QUY TẮC SỬ DỤNG:
   - Khi user hỏi TỔNG QUAN (ví dụ: "phân tích data", "có bao nhiêu strategies", "tổng quan toàn bộ"):
     + Gọi queryStrategies với pageSize=10 (chỉ cần vài mẫu để minh họa)
     + KHÔNG truyền backtestTable (để lấy tất cả)
     + Backend sẽ TỰ ĐỘNG tính full_statistics từ TOÀN BỘ strategies trong DB (ví dụ 14665 strategies)
   - Khi user hỏi về GIAI ĐOẠN CỤ THỂ (ví dụ: "2024-2025", "năm 2024"):
     + Truyền startDate và/hoặc endDate (format: YYYY-MM-DD)
     + Ví dụ: startDate="2024-01-01", endDate="2025-12-31"
     + Nếu nhận được [Context từ trang Strategy Input] với filters.dateRange → dùng dateRange đó
   - Khi báo cáo số lượng: dùng "total" (ví dụ: "Có 14,665 strategies trong DB")
   - Khi phân tích chất lượng: dùng full_statistics (ví dụ: "Winrate trung bình: 52.3%", "23.5% strategies có P/D >= 5")
   - KHÔNG BAO GIỜ đoán hoặc tính toán từ 10-50 strategies mẫu — luôn dùng full_statistics

2. getStrategyStats — thống kê tổng quan toàn bộ DB
   - Dùng khi: user hỏi tổng quan, phân bố, số lượng theo symbol/timeframe

3. analyzeStrategyList — tính score và xếp hạng danh sách strategies
   - Dùng SAU khi đã có kết quả từ queryStrategies
   - Truyền mảng strategies từ kết quả queryStrategies vào

QUY TẮC BẮT BUỘC:
- Khi user hỏi bất kỳ câu nào liên quan đến số liệu, thống kê, lọc strategies → PHẢI gọi queryStrategies hoặc getStrategyStats NGAY, không được trả lời chung chung
- Không bao giờ nói "mình chưa truy vấn được" hay "cần thêm thông tin" khi có thể gọi tool
- Nếu query trả về 0 kết quả → thử nới lỏng điều kiện và query lại
- Sau khi có danh sách strategies → gọi tiếp analyzeStrategyList để đánh giá chất lượng

Trả lời bằng tiếng Việt khi người dùng hỏi tiếng Việt.
Không dùng **bold** và không dùng ##header. Được phép dùng danh sách (- hoặc số thứ tự) khi liệt kê nhiều ý. Viết tự nhiên, dễ đọc.
Khi có code hoặc SQL, dùng code block markdown với đúng ngôn ngữ. Giữ nguyên format xuống dòng trong code.
Khi phân tích bài báo: nếu không đọc được nội dung đầy đủ, hãy phân tích dựa trên tiêu đề một cách tự nhiên, không đề cập đến việc không đọc được hay các vấn đề kỹ thuật.`;

// ─── Chat completion ──────────────────────────────────────────────────────────
const { getMarketPrice, getMarketHistory, SYMBOL_MAP } = require('./marketService');
const { fetchNews } = require('./newsService');
const { fetchArticleContent } = require('./articleService');
const strategyService = require('./strategyService');
const strategyMetadataDAO = require('../dao/strategyMetadataDao');

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'getMarketPrice',
      description: 'Lấy giá thị trường realtime của bất kỳ mã nào: cổ phiếu (AAPL, TSLA, VIC, VNM...), crypto (BTC, ETH...), hàng hóa (vàng, dầu...), chỉ số (SP500, VNINDEX...). Dùng khi người dùng hỏi giá hiện tại của bất kỳ tài sản nào.',
      parameters: {
        type: 'object',
        properties: {
          symbols: {
            type: 'array',
            items: { type: 'string' },
            description: 'Danh sách mã cần lấy giá. Ví dụ: ["XAUUSD"], ["VIC"], ["AAPL","TSLA"], ["BTC"]. Với cổ phiếu VN thêm .VN nếu cần (VIC.VN).',
          },
        },
        required: ['symbols'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getMarketHistory',
      description: 'Lấy dữ liệu lịch sử giá của tài sản trong N ngày gần nhất. Dùng khi người dùng hỏi về lịch sử giá, xu hướng, biến động trong khoảng thời gian cụ thể (ví dụ: 7 ngày qua, 1 tháng qua, giá tuần trước...).',
      parameters: {
        type: 'object',
        properties: {
          symbols: {
            type: 'array',
            items: { type: 'string' },
            description: 'Danh sách mã cần lấy lịch sử. Ví dụ: ["USOIL"], ["XAUUSD"], ["BTC"].',
          },
          days: {
            type: 'number',
            description: 'Số ngày lịch sử cần lấy. Ví dụ: 7 (1 tuần), 30 (1 tháng), 90 (3 tháng). Mặc định 7.',
          },
        },
        required: ['symbols'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getSymbolNews',
      description: 'Lấy danh sách tin tức mới nhất liên quan đến một tài sản (vàng, dầu, BTC, cổ phiếu...). Dùng khi người dùng hỏi về tin tức, sự kiện, phân tích thị trường gần đây của một tài sản cụ thể.',
      parameters: {
        type: 'object',
        properties: {
          symbol: {
            type: 'string',
            description: 'Mã tài sản cần lấy tin. Ví dụ: "XAUUSD", "USOIL", "BTCUSD", "US500".',
          },
          limit: {
            type: 'number',
            description: 'Số lượng tin cần lấy. Mặc định và khuyến nghị là 50 để phân tích đầy đủ.',
          },
        },
        required: ['symbol'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetchArticleContent',
      description: 'Crawl và đọc nội dung đầy đủ của một bài báo từ URL. Dùng khi người dùng muốn phân tích chi tiết một bài báo cụ thể. Lưu ý: một số trang có thể chặn truy cập, khi đó sẽ fallback về phân tích từ tiêu đề.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'URL đầy đủ của bài báo cần đọc.',
          },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'queryStrategies',
      description: 'Truy vấn danh sách strategies từ database với các bộ lọc. Dùng khi người dùng muốn xem, lọc, hoặc phân tích danh sách strategies theo các chỉ số như P/D ratio, winrate, profit factor, drawdown, v.v. Trả về tối đa 50 strategies kèm đầy đủ chỉ số.',
      parameters: {
        type: 'object',
        properties: {
          backtestTable: { type: 'string', description: 'Tên bảng backtest (ví dụ: backtest1, backtest2). Bỏ trống để lấy tất cả.' },
          symbol: { type: 'string', description: 'Lọc theo symbol: BTCUSD, ETHUSD, XAUUSD, XAGUSD, US500, DE30, JP225, HK50, USOIL. Có thể nhiều symbol cách nhau bằng dấu phẩy.' },
          timeframe: { type: 'string', description: 'Lọc theo timeframe: H1, H4, D1' },
          type: { type: 'string', enum: ['buy', 'sell'], description: 'Lọc theo loại lệnh: buy hoặc sell' },
          startDate: { type: 'string', description: 'Lọc strategies có period_end >= startDate (format: YYYY-MM-DD). Dùng khi user hỏi về giai đoạn cụ thể (ví dụ: "2024-2025")' },
          endDate: { type: 'string', description: 'Lọc strategies có period_end <= endDate (format: YYYY-MM-DD)' },
          pd: { type: 'string', description: 'Filter P/D ratio. Ví dụ: "2" (mặc định >=2), hoặc "1.5,5" cho range 1.5-5' },
          totalNetProfit: { type: 'string', description: 'Filter tổng lợi nhuận (USD). Ví dụ: "10000"' },
          totalTrades: { type: 'string', description: 'Filter số lệnh. Ví dụ: "100"' },
          winrate: { type: 'string', description: 'Filter winrate %. Ví dụ: "60" (>=60%)' },
          profitFactor: { type: 'string', description: 'Filter profit factor. Ví dụ: "1.5"' },
          sharpeRatio: { type: 'string', description: 'Filter Sharpe ratio. Ví dụ: "1.0"' },
          recoveryFactor: { type: 'string', description: 'Filter recovery factor. Ví dụ: "3"' },
          lrCorrelation: { type: 'string', description: 'Filter LR correlation. Ví dụ: "0.9"' },
          drawdown: { type: 'string', description: 'Filter drawdown %. Ví dụ: "20" (<=20%)' },
          sortBy: { type: 'string', enum: ['pd', 'profit', 'winrate', 'trades', 'sharpe', 'recovery'], description: 'Sắp xếp theo chỉ số nào' },
          sortDir: { type: 'string', enum: ['asc', 'desc'], description: 'Chiều sắp xếp' },
          pageSize: { type: 'number', description: 'Số lượng kết quả trả về (tối đa 50, mặc định 20)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getStrategyStats',
      description: 'Lấy thống kê tổng quan của toàn bộ database strategies: tổng số strategies, phân bố theo symbol, timeframe, thống kê P/D, winrate trung bình, v.v. Dùng khi người dùng hỏi tổng quan về dữ liệu.',
      parameters: {
        type: 'object',
        properties: {
          backtestTable: { type: 'string', description: 'Tên bảng backtest cụ thể. Bỏ trống để lấy tất cả.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyzeStrategyList',
      description: 'Phân tích và đánh giá chất lượng một danh sách strategies đã được lọc. Tính toán thống kê tổng hợp, xếp hạng, nhận xét điểm mạnh/yếu. Dùng sau khi đã có danh sách strategies từ queryStrategies.',
      parameters: {
        type: 'object',
        properties: {
          strategies: {
            type: 'array',
            description: 'Danh sách strategies cần phân tích (lấy từ kết quả queryStrategies)',
            items: { type: 'object' },
          },
          focusMetric: {
            type: 'string',
            description: 'Chỉ số muốn tập trung phân tích: pd, winrate, profitFactor, sharpe, drawdown',
          },
        },
        required: ['strategies'],
      },
    },
  },
];

// ─── Strategy analysis helpers ────────────────────────────────────────────────
function parseDrawdownPct(raw) {
  if (!raw) return null;
  const m = String(raw).match(/\(([^)]+)%\)/);
  if (!m) return null;
  const clean = m[1].replace(/[^0-9.]/g, '');
  return clean ? parseFloat(clean) : null;
}
function parseDrawdownAbs(raw) {
  if (!raw) return null;
  const parts = String(raw).split('(');
  const absPart = parts[0].replace(/[^0-9.]/g, '');
  return absPart ? parseFloat(absPart) : null;
}
function parseWinratePct(raw) {
  if (!raw) return null;
  const m = String(raw).match(/\(([^)]+)%\)/);
  if (!m) return null;
  const clean = m[1].replace(/[^0-9.]/g, '');
  return clean ? parseFloat(clean) : null;
}
function computeStrategyMetrics(r) {
  if (!r) return {};
  const profit  = parseFloat(r.totalNetProfit) || 0;
  const ddAbs   = parseDrawdownAbs(r.balanceDrawdownMaximal) || 0;
  const pd      = ddAbs > 0 ? profit / ddAbs : null;
  const winrate = parseWinratePct(r.profitTrades);
  const avgProfit = parseFloat(r.averageProfitTrade) || 0;
  const avgLoss   = Math.abs(parseFloat(r.averageLossTrade) || 0);
  const rrr = avgLoss > 0 ? avgProfit / avgLoss : null;
  const largestProfit = parseFloat(r.largestProfitTrade) || 0;
  const lptr = profit > 0 ? (largestProfit / profit) * 100 : null;
  return {
    pd: pd != null ? +pd.toFixed(2) : null,
    totalNetProfit: profit,
    totalTrades: parseInt(r.totalTrades) || 0,
    winrate,
    profitFactor: parseFloat(r.profitFactor) || null,
    sharpeRatio: parseFloat(r.sharpeRatio) || null,
    recoveryFactor: parseFloat(r.recoveryFactor) || null,
    lrCorrelation: parseFloat(r.lrCorrelation) || null,
    drawdownPct: parseDrawdownPct(r.balanceDrawdownMaximal),
    drawdownAbs: ddAbs,
    largestLossTrade: Math.abs(parseFloat(r.largestLossTrade) || 0),
    riskRewardRatio: rrr != null ? +rrr.toFixed(2) : null,
    largestProfitTradeRatio: lptr != null ? +lptr.toFixed(1) : null,
  };
}

async function executeQueryStrategies(args) {
  const pageSize = Math.min(args.pageSize || 20, 50);
  const sortMap  = { pd: 'pd_ratio', profit: 'total_profit', winrate: 'winrate', trades: 'total_orders', sharpe: 'sharpeRatio', recovery: 'recoveryFactor' };
  const sortBy   = sortMap[args.sortBy] || null;
  const filterOperators = {};
  if (args.drawdown) filterOperators.drawdown = '<=';

  // ✅ Check if date range is provided
  const hasDateRange = args.startDate && args.endDate;

  let result;
  
  if (hasDateRange) {
    // ✅ Use TIME RANGE API - tính 8 metrics động từ deals trong khoảng thời gian
    result = await strategyService.getStrategiesByTimeRange({
      backtestTable: args.backtestTable || null,
      startDate: args.startDate,
      endDate: args.endDate,
      symbol: args.symbol || null,
      timeframe: args.timeframe || null,
      type: args.type || null,
      // DATE RANGE metrics (8 chỉ số tính toán động từ deals)
      pd: args.pd || null,
      totalNetProfit: args.totalNetProfit || null,
      totalTrades: args.totalTrades || null,
      winrate: args.winrate || null,
      largestLossTrade: args.largestLossTrade || null,
      largestProfitTradeRatio: args.largestProfitTradeRatio || null,
      riskRewardRatio: args.riskRewardRatio || null,
      drawdown: args.drawdown || null,
      // FULL PERIOD metrics (4 chỉ số tĩnh từ results column)
      profitFactor: args.profitFactor || null,
      sharpeRatio: args.sharpeRatio || null,
      recoveryFactor: args.recoveryFactor || null,
      lrCorrelation: args.lrCorrelation || null,
      operators: filterOperators,
      ranges: {},
      page: 1,
      pageSize,
      sortBy,
      sortDir: args.sortDir || 'desc',
    });
  } else {
    // ✅ Use NORMAL API - tất cả metrics từ results column
    result = await strategyService.getStrategies({
      backtestTable: args.backtestTable || null,
      symbol: args.symbol || null,
      timeframe: args.timeframe || null,
      type: args.type || null,
      pd: args.pd || null,
      totalNetProfit: args.totalNetProfit || null,
      totalTrades: args.totalTrades || null,
      winrate: args.winrate || null,
      largestProfitTradeRatio: args.largestProfitTradeRatio || null,
      riskRewardRatio: args.riskRewardRatio || null,
      largestLossTrade: args.largestLossTrade || null,
      profitFactor: args.profitFactor || null,
      sharpeRatio: args.sharpeRatio || null,
      recoveryFactor: args.recoveryFactor || null,
      lrCorrelation: args.lrCorrelation || null,
      drawdown: args.drawdown || null,
      filterOperators,
      filterRanges: {},
      page: 1,
      pageSize,
      sortBy: sortMap[args.sortBy] || null,
      sortDir: args.sortDir || 'desc',
    });
  }

  const mapStrategy = (s) => {
    // ✅ Time range API returns different field names
    if (hasDateRange) {
      return {
        strategy_id: s.strategy_id,
        backtest_table: s.backtest_table,
        symbol: s.symbol,
        timeframe: s.timeframe,
        expert_name: s.expert_name,
        period_start: s.period_start,
        period_end: s.period_end,
        // DATE RANGE metrics (from deals calculation)
        pd_ratio: s.pd_ratio,
        total_profit: s.total_profit,
        total_orders: s.quantity,
        winrate: s.winrate,
        max_drawdown: s.max_drawdown,
        largest_loss_trade: s.largest_loss_trade,
        largest_profit_trade: s.largest_profit_trade,
        largest_profit_trade_ratio: s.largest_profit_trade_ratio,
        // FULL PERIOD metrics (from results column)
        profitFactor: s.results?.profitFactor,
        sharpeRatio: s.results?.sharpeRatio,
        recoveryFactor: s.results?.recoveryFactor,
        lrCorrelation: s.results?.lrCorrelation,
        riskRewardRatio: s.results?.averageProfitTrade && s.results?.averageLossTrade 
          ? (parseFloat(s.results.averageProfitTrade) / Math.abs(parseFloat(s.results.averageLossTrade))).toFixed(2)
          : null,
        balanceDrawdownMaximal: s.results?.balanceDrawdownMaximal,
      };
    } else {
      // Normal API - compute metrics from results
      const m = computeStrategyMetrics(s.results || {});
      return {
        strategy_id: s.strategy_id,
        backtest_table: s.backtest_table,
        symbol: s.symbol,
        timeframe: s.timeframe,
        expert_name: s.expert_name,
        period_start: s.period_start,
        period_end: s.period_end,
        ...m,
      };
    }
  };

  const strategies = (result.data || []).map(mapStrategy);

  // Tự động lấy thống kê aggregation THỰC TẾ từ toàn bộ filtered rows (không phải sample)
  // ⚠️ Chỉ available khi KHÔNG dùng date range (vì time range API tính metrics khác)
  let fullStats = null;
  if (!hasDateRange && result.pagination?.total > 0) {
    try {
      fullStats = await strategyMetadataDAO.getAggregatedFilteredStats({
        backtestTable: args.backtestTable || null,
        symbol: args.symbol || null,
        timeframe: args.timeframe || null,
        type: args.type || null,
        search: null, // không filter search cho stats
        pd: args.pd || null,
        totalNetProfit: args.totalNetProfit || null,
        totalTrades: args.totalTrades || null,
        winrate: args.winrate || null,
        largestProfitTradeRatio: args.largestProfitTradeRatio || null,
        riskRewardRatio: args.riskRewardRatio || null,
        largestLossTrade: args.largestLossTrade || null,
        profitFactor: args.profitFactor || null,
        sharpeRatio: args.sharpeRatio || null,
        recoveryFactor: args.recoveryFactor || null,
        lrCorrelation: args.lrCorrelation || null,
        drawdown: args.drawdown || null,
        operators: filterOperators,
        ranges: {},
      });
    } catch (err) {
      console.error('⚠️ Failed to get aggregated stats:', err.message);
    }
  }

  // Nếu trả về 0 và có filter pd → lấy thêm top 5 theo pd để AI biết max pd thực tế
  let topByPd = null;
  if (strategies.length === 0 && args.pd) {
    const fallback = await strategyService.getStrategies({
      backtestTable: args.backtestTable || null,
      symbol: args.symbol || null,
      timeframe: args.timeframe || null,
      filterOperators: {},
      filterRanges: {},
      page: 1,
      pageSize: 5,
      sortBy: 'pd',
      sortDir: 'desc',
    });
    topByPd = (fallback.data || []).map(mapStrategy);
  }

  return {
    total: result.pagination?.total || strategies.length,
    returned: strategies.length,
    filters_applied: args,
    date_range: hasDateRange ? { start: args.startDate, end: args.endDate } : null,
    full_statistics: fullStats,  // ✅ Chỉ có khi KHÔNG dùng date range
    strategies,
    ...(topByPd ? { note: `Không có strategy nào thỏa P/D ${args.pd}. Top 5 P/D cao nhất trong DB:`, top5_by_pd: topByPd } : {}),
    ...(hasDateRange ? { 
      note_date_range: 'Khi dùng date range, 8 metrics (P/D, profit, trades, winrate, largest loss, largest profit ratio, risk-reward, drawdown) được tính từ deals trong khoảng thời gian. 4 metrics còn lại (profit factor, sharpe, recovery, lr correlation) lấy từ full period.' 
    } : {}),
  };
}

async function executeGetStrategyStats(args) {
  return strategyService.getStrategyStatistics(args.backtestTable || null);
}

function executeAnalyzeStrategyList(args) {
  const list = args.strategies || [];
  if (!list.length) return { error: 'Danh sách trống' };

  const nums = (key) => list.map(s => s[key]).filter(v => v != null && !isNaN(v));
  const avg  = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const max  = (arr) => arr.length ? Math.max(...arr) : null;
  const min  = (arr) => arr.length ? Math.min(...arr) : null;

  const pdArr   = nums('pd');
  const wrArr   = nums('winrate');
  const pfArr   = nums('profitFactor');
  const shArr   = nums('sharpeRatio');
  const lrArr   = nums('lrCorrelation');
  const ddArr   = nums('drawdownPct');
  const profArr = nums('totalNetProfit');

  const scored = list.map(s => {
    let score = 0;
    if (s.pd != null)            score += Math.min(s.pd / 5, 1) * 25;
    if (s.winrate != null)       score += Math.min(s.winrate / 80, 1) * 20;
    if (s.profitFactor != null)  score += Math.min(s.profitFactor / 3, 1) * 20;
    if (s.sharpeRatio != null)   score += Math.min(s.sharpeRatio / 2, 1) * 15;
    if (s.lrCorrelation != null) score += s.lrCorrelation * 10;
    if (s.drawdownPct != null)   score += Math.max(0, (1 - s.drawdownPct / 30)) * 10;
    return { ...s, score: +score.toFixed(1) };
  }).sort((a, b) => b.score - a.score);

  const good = scored.filter(s => s.score >= 60).length;
  const avgScore = avg(scored.map(s => s.score));

  return {
    total_analyzed: list.length,
    summary: {
      avg_pd: avg(pdArr) != null ? +avg(pdArr).toFixed(2) : null,
      avg_winrate: avg(wrArr) != null ? +avg(wrArr).toFixed(1) : null,
      avg_profit_factor: avg(pfArr) != null ? +avg(pfArr).toFixed(2) : null,
      avg_sharpe: avg(shArr) != null ? +avg(shArr).toFixed(2) : null,
      avg_lr_correlation: avg(lrArr) != null ? +avg(lrArr).toFixed(3) : null,
      avg_drawdown_pct: avg(ddArr) != null ? +avg(ddArr).toFixed(2) : null,
      total_profit_sum: profArr.reduce((a, b) => a + b, 0),
      max_pd: max(pdArr), min_pd: min(pdArr),
      max_winrate: max(wrArr), min_winrate: min(wrArr),
    },
    quality: {
      avg_score: avgScore != null ? +avgScore.toFixed(1) : null,
      good_strategies: good,
      good_pct: list.length ? +((good / list.length) * 100).toFixed(1) : 0,
    },
    top5_by_score: scored.slice(0, 5).map(s => ({
      strategy_id: s.strategy_id, symbol: s.symbol, timeframe: s.timeframe,
      score: s.score, pd: s.pd, winrate: s.winrate, profitFactor: s.profitFactor,
      sharpeRatio: s.sharpeRatio, drawdownPct: s.drawdownPct, totalNetProfit: s.totalNetProfit,
    })),
  };
}

async function executeTool(name, args) {
  console.log(`🔧 [TOOL] ${name}`, args);
  if (name === 'getMarketPrice')      return getMarketPrice(args.symbols);
  if (name === 'getMarketHistory')    return getMarketHistory(args.symbols, args.days || 7);
  if (name === 'getSymbolNews') {
    const limit = 50;
    const items = await fetchNews(args.symbol, limit);
    const seen = new Set();
    const unique = items.filter(({ title }) => {
      const key = title.toLowerCase().replace(/\s+/g, ' ').slice(0, 60);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return {
      symbol: args.symbol,
      count: unique.length,
      items: unique.map(({ title, source, ago, dateStr, url }) => ({ title, source, ago, dateStr, url })),
    };
  }
  if (name === 'fetchArticleContent') return fetchArticleContent(args.url);
  if (name === 'queryStrategies')     return executeQueryStrategies(args);
  if (name === 'getStrategyStats')    return executeGetStrategyStats(args);
  if (name === 'analyzeStrategyList') return executeAnalyzeStrategyList(args);
  throw new Error(`Unknown tool: ${name}`);
}

// Models that don't support custom temperature (only default=1 allowed)
const NO_TEMPERATURE_MODELS = new Set();

function buildRequestParams(model, messages, maxTokens, temperature, useTools = true) {
  const params = { model, messages, max_completion_tokens: maxTokens };
  if (useTools) {
    params.tools = TOOLS;
    params.tool_choice = 'auto';
  }
  // Chỉ thêm temperature nếu model support
  if (!NO_TEMPERATURE_MODELS.has(model)) params.temperature = temperature;
  return params;
}

async function createChatCompletion(userMessages, model = DEFAULT_MODEL, userId, options = {}) {
  const rateCheck = checkRateLimit(userId);
  if (!rateCheck.allowed) throw new Error(rateCheck.message);

  const maxTokens   = parseInt(options.maxTokens || process.env.OPENAI_MAX_TOKENS || 4000);
  const temperature = parseFloat(process.env.OPENAI_TEMPERATURE || 0.7);
  const useTools    = options.useTools !== false;

  const systemPrompt = options.systemPrompt !== undefined ? options.systemPrompt : SYSTEM_PROMPT;
  const messages = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...userMessages]
    : [...userMessages];

  try {
    let response = await openai.chat.completions.create(
      buildRequestParams(model, messages, maxTokens, temperature, useTools)
    );

    let choice = response.choices[0];

    // Agentic loop — xử lý tool calls
    while (choice.finish_reason === 'tool_calls') {
      messages.push(choice.message);

      const toolResults = await Promise.all(
        choice.message.tool_calls.map(async (tc) => {
          try {
            const result = await executeTool(tc.function.name, JSON.parse(tc.function.arguments));
            return { tool_call_id: tc.id, role: 'tool', content: JSON.stringify(result) };
          } catch (err) {
            console.error(`❌ Tool ${tc.function.name}:`, err.message);
            return { tool_call_id: tc.id, role: 'tool', content: JSON.stringify({ error: err.message }) };
          }
        })
      );

      messages.push(...toolResults);

      response = await openai.chat.completions.create(
        buildRequestParams(model, messages, maxTokens, temperature)
      );
      choice = response.choices[0];
    }

    const usage = response.usage || {};
    const cost  = trackAndLogCost(model, usage.prompt_tokens || 0, usage.completion_tokens || 0);
    try {
      recordChatCost({
        model,
        userId,
        inputTokens: usage.prompt_tokens || 0,
        outputTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0,
        costUsd: cost,
        finishReason: choice.finish_reason,
      });
    } catch (err) {
      console.error('⚠️ [OPENAI COST] Failed to write cost log:', err.message);
    }

    return {
      message:      choice.message,
      tokensUsed:   usage.total_tokens || 0,
      cost,
      finishReason: choice.finish_reason,
    };
  } catch (err) {
    console.error('❌ [OPENAI]', err.message);
    if (err.status === 429) throw new Error('OpenAI rate limit exceeded. Please try again later.');
    if (err.status === 401) throw new Error('Invalid OpenAI API key.');
    if (err.status === 404 && err.message?.includes('not a chat model')) {
      console.warn(`⚠️ [OPENAI] Model "${model}" không phải chat model, đã blacklist.`);
      CHAT_COMPLETIONS_BLACKLIST.add(model);
      modelsCache.data = modelsCache.data?.filter(m => m.id !== model) || null;
      // Nếu cache trống sau khi blacklist, reset về fallback (MODEL_METADATA) thay vì để trống
      if (!modelsCache.data?.length) {
        modelsCache.data = null;
        modelsCache.timestamp = 0;
      }
      throw new Error(`Model "${model}" không hỗ trợ chat. Vui lòng chọn model khác.`);
    }
    if (err.status === 400 && err.message?.includes('temperature')) {
      // Model không support custom temperature — retry không có temperature
      console.warn(`⚠️ [OPENAI] Model "${model}" không support temperature, retry không có temperature.`);
      NO_TEMPERATURE_MODELS.add(model);
      return createChatCompletion(userMessages, model, userId, options);
    }
    if (err.status === 400) throw new Error(`Invalid request: ${err.message}`);
    throw new Error(`OpenAI error: ${err.message}`);
  }
}

// ─── Cost tracking ────────────────────────────────────────────────────────────
const USD_TO_VND = 25400;
const dailyCost = { date: '', totalUsd: 0 };

function trackAndLogCost(model, inputTokens, outputTokens) {
  const usd = calculateCost(model, inputTokens, outputTokens);
  const vnd = usd * USD_TO_VND;

  const today = new Date().toLocaleDateString('vi-VN');
  if (dailyCost.date !== today) { dailyCost.date = today; dailyCost.totalUsd = 0; }
  dailyCost.totalUsd += usd;

  const totalVnd = dailyCost.totalUsd * USD_TO_VND;
  console.log(`💰 [COST] Model: ${model} | Lan nay: $${usd.toFixed(6)} (~${Math.round(vnd).toLocaleString('vi-VN')}d) | Hom nay tong: $${dailyCost.totalUsd.toFixed(6)} (~${Math.round(totalVnd).toLocaleString('vi-VN')}d)`);

  return usd;
}

const PRICING = {
  'gpt-4o':        { input: 0.0025 / 1000, output: 0.01   / 1000 },
  'gpt-4o-mini':   { input: 0.00015/ 1000, output: 0.0006 / 1000 },
  'gpt-4-turbo':   { input: 0.01   / 1000, output: 0.03   / 1000 },
  'gpt-3.5-turbo': { input: 0.0005 / 1000, output: 0.0015 / 1000 },
};
function calculateCost(model, inp, out) {
  const p = PRICING[model] || PRICING['gpt-4o'];
  return inp * p.input + out * p.output;
}

module.exports = { createChatCompletion, getAvailableModels, isValidModel, getDefaultModel, checkRateLimit, calculateCost };
