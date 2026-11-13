import { authFetch } from './authFetch';

export async function getPaperTradeDashboard(mode = 'futures') {
  const res = await authFetch(`/api/paper-trade/dashboard?mode=${mode}`);
  if (!res.ok) throw new Error('Không thể tải dữ liệu Paper Trading');
  return res.json();
}

export async function togglePaperTradeBot(isActive, mode = 'futures') {
  const res = await authFetch('/api/paper-trade/toggle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isActive, mode })
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

export async function resetPaperTradeAccount(initialBalance = 100.0, riskPerTrade = null, leverage = null, mode = 'futures') {
  const res = await authFetch('/api/paper-trade/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initialBalance, riskPerTrade, leverage, mode })
  });
  if (!res.ok) throw new Error('Không thể reset tài khoản');
  return res.json();
}

export async function updatePaperTradeSettings({ balance, riskPerTrade, leverage, mode = 'futures' }) {
  const res = await authFetch('/api/paper-trade/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ balance, riskPerTrade, leverage, mode })
  });
  if (!res.ok) throw new Error('Không thể cập nhật cài đặt');
  return res.json();
}

export async function addPaperTradeSymbol(symbol, mode = 'futures') {
  const res = await authFetch('/api/paper-trade/symbols/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, mode })
  });
  if (!res.ok) throw new Error('Không thể thêm cặp coin');
  return res.json();
}

export async function removePaperTradeSymbol(symbol, mode = 'futures') {
  const res = await authFetch('/api/paper-trade/symbols/remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, mode })
  });
  if (!res.ok) throw new Error('Không thể xóa cặp coin');
  return res.json();
}
