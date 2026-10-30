export const ASSET_SYMBOLS = [
  'BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'ADAUSD', 'DOGEUSD', 'DOTUSD', 'LINKUSD', 'LTCUSD', 'BCHUSD', 'BNBUSD', 'AVAXUSD',
  'XAUUSD', 'XAGUSD', 'USOIL', 'UKOIL', 'WTI', 'BRENT', 'NGAS', 'XPTUSD', 'XPDUSD',
  'US500', 'US30', 'USTEC', 'USTECH', 'NAS100', 'DE30', 'DE40', 'GER30', 'GER40', 'JP225', 'HK50', 'HKG33', 'STOXX50', 'UK100', 'FRA40', 'AUS200', 'SPX500', 'NDX100', 'DJI30',
  'EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY',
  'EURJPY', 'GBPJPY', 'EURGBP', 'EURAUD', 'EURNZD', 'EURCAD', 'EURCHF',
  'GBPAUD', 'GBPNZD', 'GBPCAD', 'GBPCHF', 'AUDJPY', 'NZDJPY', 'CADJPY',
  'CHFJPY', 'AUDNZD', 'AUDCAD', 'AUDCHF', 'NZDCAD', 'NZDCHF', 'CADCHF',
  'USDMXN', 'USDZAR', 'USDTRY', 'USDCNH', 'USDHKD', 'USDSGD'
].sort((a, b) => b.length - a.length);

export const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'H12', 'D1', 'W1', 'MN'];

export function extractCanonicalAssetSymbol(value) {
  const stem = String(value || '').replace(/\.[^.]+$/, '').toUpperCase();
  const timeframePattern = TIMEFRAMES.join('|');
  return ASSET_SYMBOLS.find((asset) => new RegExp(`${asset}(?=${timeframePattern})(?:_|$|[A-Z])`).test(stem)) || '';
}

export function formatStrategyFilename(value, rankNo = null, extension = '.xlsx') {
  const clean = String(value || '').replace(/\.(ini|xlsx?|csv)$/i, '').trim();
  const botId = clean.match(/^(\d{3})/)?.[1] || '';
  const asset = extractCanonicalAssetSymbol(clean);
  const timeframePattern = TIMEFRAMES.join('|');
  const timeframe = clean.match(new RegExp(`(${timeframePattern})(?=_|$|\\s|[A-Z])`, 'i'))?.[1]?.toUpperCase() || '';
  const direction = /_Buy(?:_|$|\s)/i.test(clean) || /OB(?:_|$)/i.test(clean)
    ? 'OB'
    : /_Sell(?:_|$|\s)/i.test(clean) || /OS(?:_|$)/i.test(clean) ? 'OS' : '';
  const rank = rankNo !== null && rankNo !== undefined && rankNo !== '' ? `_R${rankNo}` : '';
  if (!botId || !asset || !timeframe) return '';
  return `${botId}${asset}${timeframe}${direction}${rank}${extension}`;
}

export function formatStrategyCode(value, rankNo = null) {
  const raw = typeof value === 'object' && value !== null
    ? (value.job_name || value.name || value.external_job_id || value.strategy_code || '')
    : String(value || '');
  const formatted = formatStrategyFilename(raw, rankNo, '');
  if (formatted) return formatted;
  return raw.replace(/\.(ini|xlsx?|csv)$/i, '').trim() || '-';
}

export function compareStrategyCodes(left, right) {
  const leftCode = formatStrategyCode(left).toUpperCase();
  const rightCode = formatStrategyCode(right).toUpperCase();
  return leftCode.localeCompare(rightCode, undefined, { numeric: true, sensitivity: 'base' });
}

export function parseSymbolAndTimeframe(value) {
  if (!value) return { symbol: '-', timeframe: '-' };
  const raw = typeof value === 'object' && value !== null
    ? (value.symbol || value.job_name || value.name || value.strategy_id || value.strategyId || value.external_job_id || '')
    : String(value || '');
  const clean = raw.replace(/\.(ini|xlsx?|csv)$/i, '').trim();

  let symbol = extractCanonicalAssetSymbol(clean);
  if (!symbol) {
    const uppercase = clean.toUpperCase();
    symbol = ASSET_SYMBOLS.find((asset) => uppercase.includes(asset)) || '';
  }

  const timeframePattern = TIMEFRAMES.join('|');
  const tfMatch = clean.match(new RegExp(`(?:^|[^a-zA-Z0-9])(${timeframePattern})(?=[^a-zA-Z0-9]|$)`, 'i'))
    || clean.match(new RegExp(`(${timeframePattern})(?=_|$|\\s|[A-Z])`, 'i'))
    || clean.match(new RegExp(`(${timeframePattern})`, 'i'));
  const timeframe = tfMatch ? tfMatch[1].toUpperCase() : '';

  return {
    symbol: symbol || '-',
    timeframe: timeframe || '-'
  };
}

