const ASSET_SYMBOLS = [
  // Crypto
  'BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'ADAUSD', 'DOGEUSD', 'DOTUSD', 'LINKUSD', 'LTCUSD', 'BCHUSD', 'BNBUSD', 'AVAXUSD',
  // Metals & Energy
  'XAUUSD', 'XAGUSD', 'USOIL', 'UKOIL', 'WTI', 'BRENT', 'NGAS', 'XPTUSD', 'XPDUSD',
  // Indices
  'US500', 'US30', 'USTECH', 'NAS100', 'DE30', 'DE40', 'GER30', 'GER40', 'JP225', 'HK50', 'HKG33', 'STOXX50', 'UK100', 'FRA40', 'AUS200', 'SPX500', 'NDX100', 'DJI30',
  // Major & Minor Forex Pairs
  'EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY',
  'EURJPY', 'GBPJPY', 'EURGBP', 'EURAUD', 'EURNZD', 'EURCAD', 'EURCHF',
  'GBPAUD', 'GBPNZD', 'GBPCAD', 'GBPCHF', 'AUDJPY', 'NZDJPY', 'CADJPY',
  'CHFJPY', 'AUDNZD', 'AUDCAD', 'AUDCHF', 'NZDCAD', 'NZDCHF', 'CADCHF',
  'USDMXN', 'USDZAR', 'USDTRY', 'USDCNH', 'USDHKD', 'USDSGD'
].sort((a, b) => b.length - a.length);

const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'H12', 'D1', 'W1', 'MN'];

function extractCanonicalAssetSymbol(value) {
  const stem = String(value || '')
    .replace(/\.[^.]+$/, '')
    .toUpperCase();
  const timeframePattern = TIMEFRAMES.join('|');

  for (const asset of ASSET_SYMBOLS) {
    const pattern = new RegExp(`${asset}(?=${timeframePattern})(?:_|$|[A-Z])`);
    if (pattern.test(stem)) return asset;
  }
  return '';
}

function parseStrategyName(value, rankNo = null) {
  const clean = String(value || '').replace(/\.(ini|xlsx?|csv)$/i, '').trim();
  const botId = clean.match(/^(\d{3})/)?.[1] || '';
  const timeframePattern = TIMEFRAMES.join('|');
  const timeframeMatch = clean.match(new RegExp(`(${timeframePattern})(?=_|$|\s|[A-Z])`, 'i'));
  const timeframe = timeframeMatch?.[1]?.toUpperCase() || '';
  const asset = extractCanonicalAssetSymbol(clean);

  let direction = '';
  if (/_Buy(?:_|$|\s)/i.test(clean) || /OB(?:_|$)/i.test(clean)) direction = 'OB';
  else if (/_Sell(?:_|$|\s)/i.test(clean) || /OS(?:_|$)/i.test(clean)) direction = 'OS';

  const rank = rankNo !== undefined && rankNo !== null && rankNo !== ''
    ? `_R${rankNo}`
    : '';

  return { botId, asset, timeframe, direction, rank };
}

function formatStrategyFilename(value, rankNo = null, extension = '.xlsx') {
  const parsed = parseStrategyName(value, rankNo);
  if (!parsed.botId || !parsed.asset || !parsed.timeframe) return '';
  return `${parsed.botId}${parsed.asset}${parsed.timeframe}${parsed.direction}${parsed.rank}${extension}`;
}

function formatJobNameWithUnderscore(value) {
  if (!value) return value;
  let str = String(value);
  const timeframePattern = TIMEFRAMES.join('|');

  for (const asset of ASSET_SYMBOLS) {
    if (str.toUpperCase().includes(asset)) {
      const regex = new RegExp('([a-zA-Z])(' + asset + ')(?=' + timeframePattern + '|_|$|[A-Z0-9])', 'i');
      if (regex.test(str)) {
        return str.replace(regex, (m, p1, p2) => p1 + '_' + p2);
      }
      return str;
    }
  }
  return str;
}

function getStrategyAssetFolder(value) {
  return extractCanonicalAssetSymbol(value) || 'UNKNOWN';
}

module.exports = {
  ASSET_SYMBOLS,
  TIMEFRAMES,
  extractCanonicalAssetSymbol,
  parseStrategyName,
  formatStrategyFilename,
  formatJobNameWithUnderscore,
  getStrategyAssetFolder,
};
