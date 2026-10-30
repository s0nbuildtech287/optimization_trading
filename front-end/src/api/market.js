import { authFetch } from './authFetch';

export async function getMarketPrices(symbols = [], range = '1d', include52Week = false) {
  const params = new URLSearchParams();
  if (symbols.length) params.set('symbols', symbols.join(','));
  if (range !== '1d') params.set('range', range);
  if (include52Week) params.set('include52Week', 'true');
  const query = params.toString() ? `?${params}` : '';
  const res = await authFetch(`/api/market/prices${query}`);
  if (!res.ok) throw new Error('Failed to fetch market prices');
  return res.json();
}

export async function getSymbolStats(symbol, price = null, backtestTable = null, sortBy = 'pd') {
  const params = new URLSearchParams();
  if (price)         params.set('price', price);
  if (backtestTable) params.set('backtestTable', backtestTable);
  if (sortBy !== 'pd') params.set('sortBy', sortBy);
  const query = params.toString() ? `?${params}` : '';
  const res = await authFetch(`/api/market/symbol-stats/${symbol}${query}`);
  if (!res.ok) throw new Error('Failed to fetch symbol stats');
  return res.json();
}

export async function getSymbolNews(symbol, limit = 8) {
  const res = await authFetch(`/api/market/news/${symbol}?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch news');
  return res.json();
}

export async function getMarketCandles(symbol, range = '1mo') {
  const res = await authFetch(`/api/market/candles/${symbol}?range=${range}`);
  if (!res.ok) throw new Error('Failed to fetch candles');
  return res.json();
}
