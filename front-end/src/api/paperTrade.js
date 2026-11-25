import { authFetch } from './authFetch';

export async function getPaperTradeDashboard(mode = 'futures', botId = null) {
  let url = `/api/paper-trade/dashboard?mode=${mode}`;
  if (botId) url += `&botId=${botId}`;
  const res = await authFetch(url);
  if (!res.ok) throw new Error('Không thể tải dữ liệu Paper Trading');
  return res.json();
}

export async function togglePaperTradeBot(isActive, mode = 'futures', botId = null) {
  const res = await authFetch('/api/paper-trade/toggle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isActive, mode, botId })
  });
  if (!res.ok) throw new Error('Không thể thay đổi trạng thái Bot');
  return res.json();
}

export async function closePaperTradePosition(positionId) {
  const res = await authFetch(`/api/paper-trade/positions/${positionId}/close`, {
    method: 'POST'
  });
  if (!res.ok) throw new Error('Không thể đóng vị thế');
  return res.json();
}

export async function sellSpotHolding(symbol) {
  const res = await authFetch('/api/paper-trade/spot/sell', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol })
  });
  if (!res.ok) throw new Error('Không thể bán chốt Spot');
  return res.json();
}

export async function buySpotHolding(symbol, amountUsdt = 25) {
  const res = await authFetch('/api/paper-trade/spot/buy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, amountUsdt })
  });
  if (!res.ok) throw new Error('Không thể mua gom Spot');
  return res.json();
}

export async function resetPaperTradeAccount(initialBalance = 100.0, riskPerTrade = null, leverage = null, mode = 'futures', botId = null) {
  const res = await authFetch('/api/paper-trade/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initialBalance, riskPerTrade, leverage, mode, botId })
  });
  if (!res.ok) throw new Error('Không thể reset tài khoản');
  return res.json();
}

export async function updatePaperTradeSettings({ balance, riskPerTrade, leverage, mode = 'futures', botId = null }) {
  const res = await authFetch('/api/paper-trade/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ balance, riskPerTrade, leverage, mode, botId })
  });
  if (!res.ok) throw new Error('Không thể cập nhật cài đặt');
  return res.json();
}

export async function withdrawPaperTradeProfit({ amount, mode = 'futures', botId = null }) {
  const res = await authFetch('/api/paper-trade/withdraw', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, mode, botId })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Không thể rút tiền lãi');
  return data;
}

export async function addPaperTradeSymbol(symbol, mode = 'futures', botId = null) {
  const res = await authFetch('/api/paper-trade/symbols/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, mode, botId })
  });
  if (!res.ok) throw new Error('Không thể thêm cặp coin');
  return res.json();
}

export async function removePaperTradeSymbol(symbol, mode = 'futures', botId = null) {
  const res = await authFetch('/api/paper-trade/symbols/remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, mode, botId })
  });
  if (!res.ok) throw new Error('Không thể xóa cặp coin');
  return res.json();
}

export async function runPaperTradeBacktest(params) {
  const res = await authFetch('/api/paper-trade/lab/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Không thể chạy kiểm thử chiến lược');
  return data.data || data;
}

export async function runPaperPortfolioBacktest(params) {
  const res = await authFetch('/api/paper-trade/lab/portfolio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Không thể chạy portfolio backtest');
  return data.data || data;
}

export async function getCalendarPnL({ accountId = 'ALL', month = null } = {}) {
  let url = `/api/paper-trade/calendar-pnl?accountId=${encodeURIComponent(accountId)}`;
  if (month) url += `&month=${encodeURIComponent(month)}`;
  const res = await authFetch(url);
  if (!res.ok) throw new Error('Không thể tải dữ liệu Lịch PnL');
  return res.json();
}
