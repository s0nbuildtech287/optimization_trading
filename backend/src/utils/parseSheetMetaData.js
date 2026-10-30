// src/utils/parseSheetMetadata.js

/**
 * ✅ Parse Settings section từ Excel
 */
const parseSettings = (rows) => {
  const settingsIndex = rows.findIndex(row => 
    row[0]?.toString().toLowerCase().includes('settings')
  );
  
  if (settingsIndex === -1) return null;

  let endIndex = rows.findIndex((row, idx) => 
    idx > settingsIndex && (
      row[0]?.toString().toLowerCase().includes('results') ||
      row[0]?.toString().toLowerCase().includes('deals')
    )
  );
  
  if (endIndex === -1) endIndex = rows.length;

  const settingsRows = rows.slice(settingsIndex, endIndex);
  const settingsText = settingsRows.map(row => row.join(' ')).join(' ').replace(/\s+/g, ' ').trim();

  console.log(`    🔍 Settings text length: ${settingsText.length} chars`);

  const settings = {};
  
  // Parse Expert (e.g., "Expert: 001-Strategy Supertrend Heikinashi_Scalelot")
  const expertMatch = settingsText.match(/Expert:\s*(.+?)(?=\s+Symbol:|\s+Period:|$)/i);
  if (expertMatch) {
    settings.expert = expertMatch[1].trim();
  }

  const symbolMatch = settingsText.match(/Symbol:\s*([A-Z0-9]+)/i);
  if (symbolMatch) settings.symbol = symbolMatch[1];

  const periodMatch = settingsText.match(/Period:\s*([A-Z0-9]+)/i);
  if (periodMatch) settings.period = periodMatch[1];

  const dateRangeMatch = settingsText.match(/\(([0-9. -]+)\)/);
  if (dateRangeMatch) {
    settings.dateRange = dateRangeMatch[1].trim();
  }

  // Parse inputs - extract input section (after Period/DateRange, before Company/Currency)
  const inputs = {};
  
  // Find the inputs section - it's between the date range and Company/Currency fields
  // Extract this specific section to avoid parsing other fields as inputs
  let inputsText = settingsText;
  
  // Remove everything before Period (includes Expert, Symbol)
  const periodPos = inputsText.search(/Period:\s*[A-Z0-9]+/i);
  if (periodPos !== -1) {
    inputsText = inputsText.substring(periodPos);
  }
  
  // Remove everything from Company onwards
  const companyPos = inputsText.search(/\s+Company:/i);
  if (companyPos !== -1) {
    inputsText = inputsText.substring(0, companyPos);
  }
  
  // Also remove from Currency onwards if Company not found
  const currencyPos = inputsText.search(/\s+Currency:/i);
  if (currencyPos !== -1 && companyPos === -1) {
    inputsText = inputsText.substring(0, currencyPos);
  }
  
  console.log(`    🔍 Inputs section length: ${inputsText.length} chars`);
  
  // Match all key=value patterns in this section
  const inputMatches = inputsText.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)=([^\s;]+)/g);
  
  for (const match of inputMatches) {
    const key = match[1];
    let value = match[2];
    
    // Clean trailing punctuation
    value = value.replace(/[,;:]+$/, '');
    
    // Convert to appropriate type
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (!isNaN(value) && value !== '') value = parseFloat(value);
    
    inputs[key] = value;
  }
  
  
  settings.inputs = inputs;

  // Parse Company (before Currency field)
  const companyMatch = settingsText.match(/Company:\s*(.+?)(?=\s+Currency:|\s+Initial\s+Deposit:|$)/i);
  if (companyMatch) settings.company = companyMatch[1].trim();

  const currencyMatch = settingsText.match(/Currency:\s*([A-Z]+)/i);
  if (currencyMatch) settings.currency = currencyMatch[1];

  const depositMatch = settingsText.match(/Initial\s+Deposit:\s*([\d\s.,]+)/i);
  if (depositMatch) settings.initialDeposit = parseFloat(depositMatch[1].replace(/[\s,]/g, ''));

  const leverageMatch = settingsText.match(/Leverage:\s*([\d:]+)/i);
  if (leverageMatch) settings.leverage = leverageMatch[1];

  return settings;
};

/**
 * ✅ REVOLUTIONARY APPROACH: Parse trực tiếp từ cells theo cấu trúc Excel
 * 
 * Dựa vào ảnh: data được sắp xếp theo cột A, C, E, G, I, K, M
 * Mỗi cột có format: Label (col A), Value (col B)
 */
const parseResults = (rows) => {
  const resultsIndex = rows.findIndex(row => 
    row[0]?.toString().toLowerCase().includes('results')
  );
  
  if (resultsIndex === -1) {
    console.warn('    ⚠️  Results section not found');
    return null;
  }

  // Tìm dòng header của bảng Deals (thường bắt đầu bằng "#")
  let endIndex = rows.findIndex((row, idx) => {
    if (idx <= resultsIndex) return false;
    
    const firstCell = row[0]?.toString().trim();
    
    // Dừng khi gặp dòng "#" hoặc "Ticket" (header của bảng Deals)
    return firstCell === '#' || firstCell === 'Ticket' || 
           (firstCell && firstCell.toLowerCase() === 'orders' && !firstCell.includes(':'));
  });
  
  if (endIndex === -1) endIndex = rows.length;

  const resultsRows = rows.slice(resultsIndex + 1, endIndex); // Skip header "Results"
  
  console.log(`    🔍 Results: ${resultsRows.length} rows`);

  /**
   * ✅ Parse từ cells: Layout với merged cells
   * - Label merged A-C → Value ở D (index 3)
   * - Label merged E-G → Value ở H (index 7)
   * - Label merged I-K → Value merged L-N (index 11, 12, 13)
   * 
   * Value có thể nằm ở 1 trong các cột trong range
   */
  const findValue = (labelPattern) => {
    for (let rowIdx = 0; rowIdx < resultsRows.length; rowIdx++) {
      const row = resultsRows[rowIdx];
      
      // Define groups: labelCol và valueCols (có thể nhiều cột cho value)
      const columnGroups = [
        { labelCol: 0, valueCols: [3] },         // A → D
        { labelCol: 4, valueCols: [7] },         // E → H
        { labelCol: 8, valueCols: [11, 12, 13] }, // I → L-N
        { labelCol: 12, valueCols: [15] }        // M → P (nếu có)
      ];
      
      for (const group of columnGroups) {
        const label = row[group.labelCol]?.toString().trim();
        if (!label || label === '') continue;
        
        // Check if label matches pattern (case-insensitive, flexible spacing)
        const normalizedLabel = label.toLowerCase().replace(/\s+/g, ' ').replace(/:/g, '').trim();
        const normalizedPattern = labelPattern.toLowerCase().replace(/\s+/g, ' ').replace(/:/g, '').trim();
        
        if (normalizedLabel.includes(normalizedPattern)) {
          // Try all possible value columns
          for (const valueCol of group.valueCols) {
            const value = row[valueCol];
            
            if (value !== null && value !== undefined && value !== '') {
              return value.toString().trim();
            }
          }
        }
      }
    }
    return null;
  };

  /**
   * ✅ Parse number with space handling
   */
  const num = (str) => {
    if (!str) return null;
    
    let clean = str.replace(/\s+/g, '');
    clean = clean.replace(/%$/, '');
    clean = clean.split('(')[0].trim();
    
    const m = clean.match(/-?[\d.,]+/);
    if (!m) return null;
    
    let numStr = m[0];
    const lastDot = numStr.lastIndexOf('.');
    const lastComma = numStr.lastIndexOf(',');
    
    if (lastDot > -1 || lastComma > -1) {
      const decimalPos = Math.max(lastDot, lastComma);
      const beforeDecimal = numStr.substring(0, decimalPos).replace(/[.,]/g, '');
      const afterDecimal = numStr.substring(decimalPos + 1);
      numStr = beforeDecimal + '.' + afterDecimal;
    }
    
    const n = parseFloat(numStr);
    return isNaN(n) ? null : n;
  };

  const results = {};

  // ===== PARSE ALL FIELDS =====
  
  results.historyQuality = findValue('history quality');
  results.bars = num(findValue('bars'));
  results.ticks = num(findValue('ticks'));
  results.symbols = num(findValue('symbols'));
  
  results.totalNetProfit = num(findValue('total net profit'));
  results.grossProfit = num(findValue('gross profit'));
  results.grossLoss = num(findValue('gross loss'));
  
  results.balanceDrawdownAbsolute = num(findValue('balance drawdown absolute'));
  results.equityDrawdownAbsolute = num(findValue('equity drawdown absolute'));
  results.balanceDrawdownMaximal = findValue('balance drawdown maximal');
  results.equityDrawdownMaximal = findValue('equity drawdown maximal');
  results.balanceDrawdownRelative = findValue('balance drawdown relative');
  results.equityDrawdownRelative = findValue('equity drawdown relative');
  
  results.profitFactor = num(findValue('profit factor'));
  results.expectedPayoff = num(findValue('expected payoff'));
  results.marginLevel = findValue('margin level');
  results.recoveryFactor = num(findValue('recovery factor'));
  results.sharpeRatio = num(findValue('sharpe ratio'));
  results.zScore = findValue('z-score');
  results.onTesterResult = num(findValue('ontester result'));
  
  results.ahpr = findValue('ahpr');
  results.ghpr = findValue('ghpr');
  results.lrCorrelation = num(findValue('lr correlation'));
  results.lrStandardError = num(findValue('lr standard error'));
  results.correlationProfitsMFE = num(findValue('correlation (profits,mfe)'));
  results.correlationProfitsMAE = num(findValue('correlation (profits,mae)'));
  results.correlationMFEMAE = num(findValue('correlation (mfe,mae)'));
  
  results.minPositionHoldingTime = findValue('minimal position holding time');
  results.maxPositionHoldingTime = findValue('maximal position holding time');
  results.avgPositionHoldingTime = findValue('average position holding time');
  
  results.totalTrades = num(findValue('total trades'));
  results.totalDeals = num(findValue('total deals'));
  
  results.shortTrades = findValue('short trades');
  results.longTrades = findValue('long trades');
  
  results.profitTrades = findValue('profit trades');
  results.lossTrades = findValue('loss trades');
  
  results.largestProfitTrade = num(findValue('largest profit trade'));
  results.largestLossTrade = num(findValue('largest loss trade'));
  results.averageProfitTrade = num(findValue('average profit trade'));
  results.averageLossTrade = num(findValue('average loss trade'));
  
  results.maxConsecutiveWins = findValue('maximum consecutive wins');
  results.maxConsecutiveLosses = findValue('maximum consecutive losses');
  results.maximalConsecutiveProfitCount = findValue('maximal consecutive profit');
  results.maximalConsecutiveLossCount = findValue('maximal consecutive loss');
  results.avgConsecutiveWins = num(findValue('average consecutive wins'));
  results.avgConsecutiveLosses = num(findValue('average consecutive losses'));

  // Debug log
  const nullCount = Object.values(results).filter(v => v === null).length;
  if (nullCount > 0) {
    console.warn(`    ⚠️  ${nullCount}/${Object.keys(results).length} fields NULL`);
    
    const nullFields = Object.entries(results)
      .filter(([k, v]) => v === null)
      .map(([k]) => k);
    console.log(`    🔍 NULL fields:`, nullFields.join(', '));
    
    // Debug: show ALL rows structure if there are NULL fields
    console.log(`    📊 ALL ${resultsRows.length} rows structure:`);
    for (let i = 0; i < resultsRows.length; i++) {
      const row = resultsRows[i];
      const cells = row.slice(0, 14).map((c, idx) => {
        const val = c === null || c === undefined || c === '' ? '∅' : c;
        return `[${idx}]=${val}`;
      }).join(' | ');
      console.log(`      Row ${i}: ${cells}`);
    }
  } else {
    console.log(`    ✅ All ${Object.keys(results).length} fields parsed`);
  }

  return results;
};

module.exports = {
  parseSettings,
  parseResults
};