// src/service/newsService.js — Fetch news từ Google News RSS
const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
const cache  = new Map(); // keyword → { items, ts }
const CACHE_TTL = 15 * 60 * 1000; // 15 phút

const SYMBOL_KEYWORDS = {
  BTCUSD: 'bitcoin BTC crypto',
  ETHUSD: 'ethereum ETH crypto',
  XAUUSD: 'gold price XAUUSD',
  XAGUSD: 'silver price XAGUSD',
  US500:  'S&P 500 SPX stock market',
  DE30:   'DAX Germany stocks',
  JP225:  'Nikkei Japan stocks',
  HK50:   'Hang Seng Hong Kong stocks',
  USOIL:  'crude oil WTI price',
};

async function fetchNews(symbol, limit = 8) {
  const keyword = SYMBOL_KEYWORDS[symbol.toUpperCase()];
  if (!keyword) return [];

  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.items.slice(0, limit);

  try {
    const q   = encodeURIComponent(keyword);
    const url = `https://news.google.com/rss/search?q=${q}&hl=en&gl=US&ceid=US:en`;
    const res = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });

    const parsed = parser.parse(res.data);
    const rawItems = parsed?.rss?.channel?.item || [];
    const items = (Array.isArray(rawItems) ? rawItems : [rawItems])
      .slice(0, 50)
      .map(item => ({
        title:       cleanTitle(item.title || ''),
        url:         item.link || '',
        source:      item.source?.['#text'] || item.source || '',
        publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : null,
        ago:         item.pubDate ? timeAgo(new Date(item.pubDate)) : '',
        dateStr:     item.pubDate ? new Date(item.pubDate).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '',
        ts:          item.pubDate ? new Date(item.pubDate).getTime() : 0,
      }))
      .filter(i => i.title && i.url)
      .sort((a, b) => b.ts - a.ts); // mới nhất lên đầu

    cache.set(symbol, { items, ts: Date.now() });
    return items.slice(0, limit);
  } catch (err) {
    console.error(`❌ [NEWS] ${symbol}:`, err.message);
    return [];
  }
}

// Google News title thường có dạng "Title - Source"
function cleanTitle(title) {
  return title.replace(/ - [^-]+$/, '').trim();
}

function timeAgo(date) {
  const diff = Date.now() - date.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

module.exports = { fetchNews };
