// src/routes/marketRoute.js
const express = require('express');
const router = express.Router();
const { getMarketPrice, getMarketCandles, SYMBOL_MAP } = require('../service/marketService');
const { getSymbolStrategySummary, getPriceZonePerformance, getMonthlyPnl } = require('../dao/marketWatchDao');
const { fetchNews } = require('../service/newsService');
const { verifyToken } = require('../middlewares/authJwt');
const { verifyBacktestSourceAccess } = require('../middlewares/backtestAccess');

const ALL_SYMBOLS = Object.keys(SYMBOL_MAP);

// GET /api/market/prices
router.get('/market/prices', async (req, res) => {
  try {
    const symbols = req.query.symbols
      ? req.query.symbols.split(',').map(s => s.trim().toUpperCase())
      : ALL_SYMBOLS;
    const range = req.query.range || '1d';
    const include52Week = req.query.include52Week === 'true';
    const data = await getMarketPrice(symbols, range, { include52Week });
    res.json({ data, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('❌ [MARKET ROUTE]', err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/market/symbol-stats/:symbol?price=3200
router.get('/market/symbol-stats/:symbol', [verifyToken, verifyBacktestSourceAccess], async (req, res) => {
  try {
    const symbol        = req.params.symbol.toUpperCase();
    const currentPrice  = req.query.price        ? parseFloat(req.query.price) : null;
    const backtestTable = req.query.backtestTable || null;
    const sortBy        = req.query.sortBy        || 'pd';

    const [strategySummary, priceZone, monthlyPnl] = await Promise.all([
      getSymbolStrategySummary(symbol, backtestTable, sortBy),
      getPriceZonePerformance(symbol, currentPrice),
      getMonthlyPnl(symbol),
    ]);

    res.json({ symbol, strategySummary, priceZone, monthlyPnl });
  } catch (err) {
    console.error('❌ [SYMBOL STATS]', err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/market/news/:symbol
router.get('/market/news/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const items  = await fetchNews(symbol, 50);
    res.json({ symbol, items, total: items.length });
  } catch (err) {
    console.error('❌ [NEWS ROUTE]', err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/market/candles/:symbol?range=1mo
router.get('/market/candles/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const range  = req.query.range || '1mo';
    const data   = await getMarketCandles(symbol, range);
    res.json(data);
  } catch (err) {
    console.error('❌ [CANDLES ROUTE]', err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
