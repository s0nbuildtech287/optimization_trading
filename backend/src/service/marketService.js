// src/service/marketService.js — Lấy giá thị trường từ Yahoo Finance (free, no key)
const axios = require('axios');

// Map symbol OpLotus → Yahoo Finance ticker (đúng thứ tự 9 tài sản)
const SYMBOL_MAP = {
  BTCUSD: 'BTC-USD',
  ETHUSD: 'ETH-USD',
  XAUUSD: 'GC=F',
  XAGUSD: 'SI=F',
  US500:  'ES=F',
  DE30:   'DAX',
  JP225:  'NKD=F',
  HK50:   '^HSI',
  USOIL:  'CL=F',
  SOLUSD: 'SOL-USD',
  BNBUSD: 'BNB-USD',
  XRPUSD: 'XRP-USD',
  ADAUSD: 'ADA-USD',
  AVAXUSD: 'AVAX-USD',
  DOGEUSD: 'DOGE-USD',
  DOTUSD: 'DOT-USD',
  LINKUSD: 'LINK-USD',
  EURUSD: 'EURUSD=X',
  GBPUSD: 'GBPUSD=X',
  USDJPY: 'JPY=X',
  AUDUSD: 'AUDUSD=X',
  NVDA:   'NVDA',
  AAPL:   'AAPL',
  TSLA:   'TSLA',
};

const ALIASES = {
  'GOLD': 'GC=F',    'SILVER': 'SI=F',   'OIL': 'CL=F',    'CRUDE': 'CL=F',
  'SP500': 'ES=F',   'S&P500': 'ES=F',   'SPX': 'ES=F',
  'BTC': 'BTC-USD',  'ETH': 'ETH-USD',   'BITCOIN': 'BTC-USD',
  'NIKKEI': 'NKD=F', 'HANGSENG': '^HSI', 'DAX': 'DAX',
  // VN stocks
  'VIC': 'VIC.VN', 'VNM': 'VNM.VN', 'VHM': 'VHM.VN', 'HPG': 'HPG.VN',
  'VCB': 'VCB.VN', 'BID': 'BID.VN', 'CTG': 'CTG.VN', 'TCB': 'TCB.VN',
  'VN30': '^VNINDEX', 'VNINDEX': '^VNINDEX',
};

function resolveTickerAndName(sym) {
  const upper = sym.toUpperCase();
  if (SYMBOL_MAP[upper]) return { ticker: SYMBOL_MAP[upper], displaySymbol: upper };
  if (ALIASES[upper])    return { ticker: ALIASES[upper],    displaySymbol: upper };
  // Fallback: dùng thẳng sym làm ticker Yahoo (AAPL, TSLA, NVDA...)
  return { ticker: sym, displaySymbol: upper };
}

const cache = new Map();
const CACHE_TTL = 60 * 1000;
const range52Cache = new Map();
const RANGE_52W_CACHE_TTL = 60 * 60 * 1000;

const RANGE_CONFIG = {
  '1d':  { interval: '5m',  label: '1D' },
  '5d':  { interval: '1h',  label: '5D' },
  '1mo': { interval: '1d',  label: '1M' },
  '3mo': { interval: '1d',  label: '3M' },
  '1y':  { interval: '1wk', label: '1Y' },
};

async function get52WeekRange(ticker, preferredRange = null) {
  if (Number.isFinite(preferredRange?.high52) && Number.isFinite(preferredRange?.low52)) {
    const entry = { ...preferredRange, ts: Date.now() };
    range52Cache.set(ticker, entry);
    return entry;
  }

  const cached = range52Cache.get(ticker);
  if (cached && Date.now() - cached.ts < RANGE_52W_CACHE_TTL) {
    return cached;
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1y`;
  const res = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
  const result = res.data?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const highs = (quote?.high || []).map(Number).filter(Number.isFinite);
  const lows = (quote?.low || []).map(Number).filter(Number.isFinite);

  if (!highs.length || !lows.length) {
    throw new Error('No 52-week OHLC data');
  }

  const entry = {
    high52: Math.max(...highs),
    low52: Math.min(...lows),
    ts: Date.now()
  };
  range52Cache.set(ticker, entry);
  return entry;
}

async function attach52WeekRange(entry, ticker, preferredRange = null) {
  try {
    const range52 = await get52WeekRange(ticker, preferredRange);
    const currentPrice = Number(entry.price);
    const high52 = Number.isFinite(currentPrice)
      ? Math.max(range52.high52, currentPrice)
      : range52.high52;
    const low52 = Number.isFinite(currentPrice)
      ? Math.min(range52.low52, currentPrice)
      : range52.low52;

    return {
      ...entry,
      high52: +high52.toFixed(4),
      low52: +low52.toFixed(4)
    };
  } catch (err) {
    return { ...entry, high52: null, low52: null };
  }
}

async function getMarketPrice(symbols, range = '1d', { include52Week = false } = {}) {
  const cfg  = RANGE_CONFIG[range] || RANGE_CONFIG['1d'];
  const list = Array.isArray(symbols) ? symbols : [symbols];

  const results = await Promise.all(list.map(async (sym) => {
    const { ticker, displaySymbol } = resolveTickerAndName(sym);

    const cacheKey = `${ticker}_${range}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL && cached.sparkline) {
      const entry = { symbol: displaySymbol, ...cached };
      return include52Week ? attach52WeekRange(entry, ticker) : entry;
    }

    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${cfg.interval}&range=${range}`;
      const res = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });

      const result = res.data?.chart?.result?.[0];
      const meta   = result?.meta;
      if (!meta) throw new Error('No data');

      const price       = meta.regularMarketPrice;
      const prevClose   = meta.previousClose || meta.chartPreviousClose;
      const change      = prevClose ? +(price - prevClose).toFixed(4) : null;
      const changePct   = prevClose ? +((change / prevClose) * 100).toFixed(2) : null;
      const currency    = meta.currency || 'USD';
      const marketState = meta.marketState || 'CLOSED';
      const updatedAt   = meta.regularMarketTime
        ? new Date(meta.regularMarketTime * 1000).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
        : new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

      const closes     = result?.indicators?.quote?.[0]?.close || [];
      const timestamps = result?.timestamp || [];
      const sparkline  = closes
        .map((c, i) => ({ t: timestamps[i], v: c }))
        .filter(p => p.v != null)
        .slice(-30)
        .map(p => ({ v: +p.v.toFixed(4) }));

      // Thời gian bắt đầu và kết thúc của sparkline
      const validTs = closes
        .map((c, i) => c != null ? timestamps[i] : null)
        .filter(Boolean);

      const fmtTs = (ts) => {
        const d = new Date(ts * 1000);
        if (range === '1d') {
          return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
        }
        return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: range === '1y' ? 'numeric' : undefined, timeZone: 'Asia/Ho_Chi_Minh' });
      };

      const sparkFrom = validTs.length ? fmtTs(validTs[0]) : null;
      const sparkTo   = validTs.length ? fmtTs(validTs[validTs.length - 1]) : null;

      const entry = { symbol: displaySymbol, ticker, price, change, changePct, currency, marketState, updatedAt, sparkline, sparkFrom, sparkTo, range, ts: Date.now() };
      cache.set(cacheKey, entry);
      return include52Week
        ? attach52WeekRange(entry, ticker, {
            high52: Number(meta.fiftyTwoWeekHigh),
            low52: Number(meta.fiftyTwoWeekLow)
          })
        : entry;
    } catch (err) {
      if (cached && cached.sparkline) {
        const entry = { symbol: displaySymbol, ...cached };
        return include52Week ? attach52WeekRange(entry, ticker) : entry;
      }
      return { symbol: displaySymbol, error: `Không lấy được giá ${sym} (ticker: ${ticker}): ${err.message}`, _errSummary: err.message };
    }
  }));

  const failed = results.filter(r => r.error);
  if (failed.length > 0) {
    const symList = failed.map(r => r.symbol).join(', ');
    const sampleErr = failed[0]._errSummary || 'Network error';
    console.warn(`⚠️ [MARKET] Tạm thời không lấy được giá Yahoo Finance (${failed.length} tài sản: ${symList}): ${sampleErr}`);
    failed.forEach(r => delete r._errSummary);
  }

  return results;
}

// ─── Get Historical Data ──────────────────────────────────────────────────────
async function getMarketHistory(symbols, days = 7) {
  const list = Array.isArray(symbols) ? symbols : [symbols];
  
  // Map days to Yahoo Finance range
  let range, interval;
  if (days <= 1) {
    range = '1d';
    interval = '5m';
  } else if (days <= 5) {
    range = '5d';
    interval = '1h';
  } else if (days <= 30) {
    range = '1mo';
    interval = '1d';
  } else if (days <= 90) {
    range = '3mo';
    interval = '1d';
  } else {
    range = '1y';
    interval = '1wk';
  }

  const results = await Promise.all(list.map(async (sym) => {
    const { ticker, displaySymbol } = resolveTickerAndName(sym);

    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}`;
      const res = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });

      const result = res.data?.chart?.result?.[0];
      const meta   = result?.meta;
      if (!meta) throw new Error('No data');

      const closes     = result?.indicators?.quote?.[0]?.close || [];
      const opens      = result?.indicators?.quote?.[0]?.open || [];
      const highs      = result?.indicators?.quote?.[0]?.high || [];
      const lows       = result?.indicators?.quote?.[0]?.low || [];
      const volumes    = result?.indicators?.quote?.[0]?.volume || [];
      const timestamps = result?.timestamp || [];

      // Build history array
      const history = timestamps
        .map((ts, i) => ({
          date: new Date(ts * 1000).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }),
          time: new Date(ts * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }),
          open: opens[i] != null ? +opens[i].toFixed(4) : null,
          high: highs[i] != null ? +highs[i].toFixed(4) : null,
          low: lows[i] != null ? +lows[i].toFixed(4) : null,
          close: closes[i] != null ? +closes[i].toFixed(4) : null,
          volume: volumes[i] || null,
        }))
        .filter(p => p.close != null);

      if (!history.length) throw new Error('No historical data available');

      // Calculate statistics
      const prices = history.map(h => h.close);
      const firstPrice = prices[0];
      const lastPrice = prices[prices.length - 1];
      const change = +(lastPrice - firstPrice).toFixed(4);
      const changePct = +((change / firstPrice) * 100).toFixed(2);
      const highest = Math.max(...prices);
      const lowest = Math.min(...prices);
      const average = +(prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(4);

      return {
        symbol: displaySymbol,
        ticker,
        currency: meta.currency || 'USD',
        period: `${days} ngày`,
        dataPoints: history.length,
        firstDate: history[0].date,
        lastDate: history[history.length - 1].date,
        firstPrice,
        lastPrice,
        change,
        changePct,
        highest,
        lowest,
        average,
        history: history.slice(-Math.min(days * 10, 100)), // Limit to avoid too much data
      };
    } catch (err) {
      console.error(`❌ [HISTORY] ${sym}:`, err.message);
      return { symbol: displaySymbol, error: `Không lấy được lịch sử ${sym}: ${err.message}` };
    }
  }));

  return results;
}

// ─── Get Candles (OHLCV) for Candlestick Chart ───────────────────────────────
const CANDLE_RANGE_CONFIG = {
  '1d':  { interval: '5m',  label: '1D'   },
  '5d':  { interval: '60m', label: '5D'   },
  '1mo': { interval: '1d',  label: '1M'   },
  '3mo': { interval: '1d',  label: '3M'   },
  '6mo': { interval: '1d',  label: '6M'   },
  '1y':  { interval: '1d',  label: '1Y'   }, // Dùng nến 1D để có ~260-365 nến (MA50 hiện đầy đủ)
  '2y':  { interval: '1d',  label: '2Y'   }, // Dùng nến 1D để có ~520-730 nến
  '5y':  { interval: '1wk', label: '5Y'   }, // Dùng nến 1W để có ~260 nến
  'max': { interval: '1mo', label: 'MAX'  },
};

const candleCache = new Map();
const CANDLE_CACHE_TTL_MS = {
  '1d':  2  * 60 * 1000,   // 2 min
  '5d':  5  * 60 * 1000,   // 5 min
  '1mo': 10 * 60 * 1000,   // 10 min
  '3mo': 10 * 60 * 1000,   // 10 min
  '6mo': 15 * 60 * 1000,   // 15 min
  '1y':  30 * 60 * 1000,   // 30 min
  '2y':  30 * 60 * 1000,   // 30 min
  '5y':  60 * 60 * 1000,   // 1 hour
  'max': 60 * 60 * 1000,   // 1 hour
};

async function getMarketCandles(symbol, range = '1mo') {
  const { ticker, displaySymbol } = resolveTickerAndName(symbol);
  const cfg = CANDLE_RANGE_CONFIG[range] || CANDLE_RANGE_CONFIG['1mo'];
  const cacheKey = `candle_${ticker}_${range}`;

  const cached = candleCache.get(cacheKey);
  const ttl = CANDLE_CACHE_TTL_MS[range] || 10 * 60 * 1000;
  if (cached && Date.now() - cached.ts < ttl) {
    return cached.data;
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${cfg.interval}&range=${range}`;
    const res = await axios.get(url, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });

    const result = res.data?.chart?.result?.[0];
    const meta   = result?.meta;
    if (!meta) throw new Error('No data from Yahoo Finance');

    const timestamps = result?.timestamp || [];
    const quote      = result?.indicators?.quote?.[0] || {};
    const opens   = quote.open   || [];
    const highs   = quote.high   || [];
    const lows    = quote.low    || [];
    const closes  = quote.close  || [];
    const volumes = quote.volume || [];

    const candles = timestamps
      .map((ts, i) => ({
        time:   ts,               // Unix timestamp (seconds) — format lightweight-charts requires
        open:   opens[i]   != null ? +opens[i].toFixed(4)   : null,
        high:   highs[i]   != null ? +highs[i].toFixed(4)   : null,
        low:    lows[i]    != null ? +lows[i].toFixed(4)    : null,
        close:  closes[i]  != null ? +closes[i].toFixed(4)  : null,
        volume: volumes[i] != null ? Math.round(volumes[i]) : 0,
      }))
      .filter(c => c.open != null && c.close != null && c.high != null && c.low != null);

    const data = {
      symbol: displaySymbol,
      ticker,
      currency: meta.currency || 'USD',
      range,
      interval: cfg.interval,
      candles,
    };

    candleCache.set(cacheKey, { data, ts: Date.now() });
    return data;
  } catch (err) {
    console.error(`❌ [CANDLES] ${symbol}:`, err.message);
    throw new Error(`Cannot fetch candles for ${symbol}: ${err.message}`);
  }
}

module.exports = { getMarketPrice, getMarketHistory, getMarketCandles, SYMBOL_MAP };
