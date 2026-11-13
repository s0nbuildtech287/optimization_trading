const WebSocket = require('ws');
const axios = require('axios');
const EventEmitter = require('events');

class BinanceWsService extends EventEmitter {
  constructor() {
    super();
    this.symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
    this.prices = {}; // { 'BTCUSDT': 95000, 'ETHUSDT': 3400 }
    this.candles = {}; // { 'ETHUSDT': [ { open, high, low, close, volume, time } ] }
    this.ws = null;
    this.pingInterval = null;
    this.reconnectTimer = null;
    this.isConnecting = false;
    this.restBaseUrls = [
      'https://api4.binance.com',
      'https://api1.binance.com',
      'https://api.binance.me'
    ];
  }

  async fetchInitialCandles(symbol, interval = '15m', limit = 250) {
    for (const baseUrl of this.restBaseUrls) {
      try {
        const url = `${baseUrl}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        const response = await axios.get(url, { timeout: 6000 });
        if (response.data && Array.isArray(response.data)) {
          this.candles[symbol] = response.data.map((k) => ({
            time: k[0],
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
            isClosed: true
          }));
          const latestClose = this.candles[symbol][this.candles[symbol].length - 1].close;
          this.prices[symbol] = latestClose;
          console.log(`[BinanceWS] Loaded ${this.candles[symbol].length} initial ${interval} candles for ${symbol}. Latest price: ${latestClose}`);
          return;
        }
      } catch (err) {
        console.warn(`[BinanceWS] Failed to fetch candles for ${symbol} from ${baseUrl}: ${err.message}. Trying next fallback...`);
      }
    }
  }

  async start() {
    console.log('[BinanceWS] Initializing Binance Market Data Ingestion...');
    
    // 1. Tải trước 250 nến lịch sử cho các cặp để thuật toán EMA/RSI có đủ dữ liệu tính ngay lập tức
    for (const sym of this.symbols) {
      await this.fetchInitialCandles(sym, '15m', 250);
    }

    // 2. Kết nối WebSocket Binance Public Stream
    this.connectWebSocket();
  }

  connectWebSocket() {
    if (this.isConnecting) return;
    this.isConnecting = true;

    // Stream ticker & klines của BTC, ETH, SOL
    const streamNames = [];
    this.symbols.forEach((s) => {
      const lower = s.toLowerCase();
      streamNames.push(`${lower}@ticker`);
      streamNames.push(`${lower}@kline_15m`);
    });

    const wsUrl = `wss://data-stream.binance.vision/stream?streams=${streamNames.join('/')}`;
    console.log(`[BinanceWS] Connecting to ${wsUrl}...`);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        this.isConnecting = false;
        console.log('[BinanceWS] Connected to Binance Public Stream successfully.');
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        // Ping định kỳ giữ kết nối
        clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.ping();
          }
        }, 30000);
      });

      this.ws.on('message', (data) => {
        try {
          const payload = JSON.parse(data.toString());
          this.handleStreamMessage(payload);
        } catch (e) {
          // Ignore parse errors
        }
      });

      this.ws.on('error', (err) => {
        console.warn('[BinanceWS] Socket error:', err.message);
      });

      this.ws.on('close', (code, reason) => {
        this.isConnecting = false;
        clearInterval(this.pingInterval);
        console.warn(`[BinanceWS] Connection closed (code: ${code}). Reconnecting in 5s...`);
        this.scheduleReconnect();
      });
    } catch (err) {
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectWebSocket();
    }, 5000);
  }

  handleStreamMessage(payload) {
    if (!payload || !payload.data) return;
    const { stream, data } = payload;

    // 1. Ticker Stream (cập nhật giá real-time)
    if (stream.endsWith('@ticker')) {
      const symbol = data.s;
      const currentPrice = parseFloat(data.c);
      if (symbol && !isNaN(currentPrice)) {
        this.prices[symbol] = currentPrice;
        this.emit('priceUpdate', { symbol, price: currentPrice, timestamp: data.E });
      }
    }

    // 2. Kline Stream (cập nhật nến 15m)
    if (stream.includes('@kline_')) {
      const k = data.k;
      const symbol = k.s;
      const candle = {
        time: k.t,
        open: parseFloat(k.o),
        high: parseFloat(k.h),
        low: parseFloat(k.l),
        close: parseFloat(k.c),
        volume: parseFloat(k.v),
        isClosed: k.x
      };

      if (!this.candles[symbol]) this.candles[symbol] = [];
      const history = this.candles[symbol];

      if (candle.isClosed) {
        // Nến vừa đóng hoàn tất -> Thêm vào lịch sử và phát tín hiệu cho Strategy Engine
        history.push(candle);
        if (history.length > 300) history.shift();
        this.prices[symbol] = candle.close;
        this.emit('candleClosed', { symbol, candle, candles: history });
      } else {
        // Nến đang chạy -> Cập nhật nến cuối
        if (history.length > 0 && history[history.length - 1].time === candle.time) {
          history[history.length - 1] = candle;
        }
      }
    }
  }

  getPrice(symbol) {
    return this.prices[symbol] || null;
  }

  async addSymbol(symbol) {
    const sym = symbol.toUpperCase().trim();
    if (!this.symbols.includes(sym)) {
      this.symbols.push(sym);
    }
    // Tải nến lịch sử cho coin mới thêm
    await this.fetchInitialCandles(sym, '15m', 250);

    // Gửi lệnh SUBSCRIBE động lên Binance WebSocket nếu đang mở kết nối
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const lower = sym.toLowerCase();
      const subPayload = {
        method: 'SUBSCRIBE',
        params: [`${lower}@ticker`, `${lower}@kline_15m`],
        id: Date.now()
      };
      this.ws.send(JSON.stringify(subPayload));
      console.log(`[BinanceWS] Dynamically subscribed to ${sym} streams.`);
    } else {
      this.connectWebSocket();
    }
  }

  async removeSymbol(symbol) {
    const sym = symbol.toUpperCase().trim();
    const idx = this.symbols.indexOf(sym);
    if (idx !== -1) {
      this.symbols.splice(idx, 1);
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const lower = sym.toLowerCase();
      const unsubPayload = {
        method: 'UNSUBSCRIBE',
        params: [`${lower}@ticker`, `${lower}@kline_15m`],
        id: Date.now()
      };
      this.ws.send(JSON.stringify(unsubPayload));
      console.log(`[BinanceWS] Unsubscribed from ${sym} streams.`);
    }
  }

  getCandles(symbol) {
    return this.candles[symbol] || [];
  }

  getAllPrices() {
    return { ...this.prices };
  }
}

// Singleton instance
const binanceWsService = new BinanceWsService();
module.exports = binanceWsService;

