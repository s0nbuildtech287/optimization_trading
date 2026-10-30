import JSZip from 'jszip';
import { MT5_ENUMS, ENUM_MAPPING } from './enumDefinitions';

export const hasEnabledOptimizationInput = (iniContent) => {
  let inTesterInputs = false;
  return String(iniContent || '').split(/\r?\n/).some((line) => {
    const value = line.trim();
    if (/^\[TesterInputs\]$/i.test(value)) {
      inTesterInputs = true;
      return false;
    }
    if (/^\[.+\]$/.test(value)) {
      inTesterInputs = false;
      return false;
    }
    return inTesterInputs && !/^[;#]/.test(value) && /\|\|(?:Y|true)\s*$/i.test(value);
  });
};

export const parseIniDocument = (content) => {
  const sections = {};
  let currentSection = '';

  String(content || '').split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      if (!sections[currentSection]) sections[currentSection] = [];
      return;
    }
    if (!currentSection || !trimmed || /^[;#]/.test(trimmed)) return;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex < 1) return;
    sections[currentSection].push({
      key: line.slice(0, separatorIndex).trim(),
      value: line.slice(separatorIndex + 1).trim()
    });
  });

  const findSection = (name) =>
    Object.entries(sections).find(([sectionName]) => sectionName.toLowerCase() === name.toLowerCase())?.[1] || [];

  return {
    sections,
    tester: findSection('Tester'),
    testerInputs: findSection('TesterInputs')
  };
};

export const updateIniValue = (content, sectionName, key, nextValue) => {
  const source = String(content || '');
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.split(/\r?\n/);
  let sectionStart = -1;
  let sectionEnd = lines.length;

  for (let index = 0; index < lines.length; index += 1) {
    const sectionMatch = lines[index].trim().match(/^\[([^\]]+)\]$/);
    if (!sectionMatch) continue;
    if (sectionStart >= 0) {
      sectionEnd = index;
      break;
    }
    if (sectionMatch[1].toLowerCase() === sectionName.toLowerCase()) sectionStart = index;
  }

  if (sectionStart < 0) {
    const prefix = source && !source.endsWith('\n') ? eol : '';
    return `${source}${prefix}[${sectionName}]${eol}${key}=${nextValue}${eol}`;
  }

  for (let index = sectionStart + 1; index < sectionEnd; index += 1) {
    const separatorIndex = lines[index].indexOf('=');
    if (separatorIndex < 1) continue;
    const currentKey = lines[index].slice(0, separatorIndex).trim();
    if (currentKey.toLowerCase() === String(key).toLowerCase()) {
      lines[index] = `${lines[index].slice(0, separatorIndex + 1)}${nextValue}`;
      return lines.join(eol);
    }
  }

  lines.splice(sectionEnd, 0, `${key}=${nextValue}`);
  return lines.join(eol);
};

export const parseTesterInputValue = (rawValue) => {
  const parts = String(rawValue ?? '').split('||');
  const value = parts[0] ?? '';
  return {
    value,
    start: parts.length > 1 ? parts[1] : value,
    step: parts.length > 2 ? parts[2] : '0',
    stop: parts.length > 3 ? parts[3] : value,
    optimize: /^(Y|true)$/i.test(parts[4] || 'N')
  };
};

export const buildTesterInputValue = ({ value, start, step, stop, optimize }) =>
  `${value}||${start}||${step}||${stop}||${optimize ? 'Y' : 'N'}`;

// Parse enum types and their options so custom MQL5 enums can use selects.
export const parseCustomEnumDefinitionsFromMq5 = (content) => {
  if (!content) return {};
  const enumPattern = /enum\s+([a-zA-Z0-9_]+)\s*\{([^}]+)\}/g;
  const definitions = {};
  let match;

  while ((match = enumPattern.exec(content)) !== null) {
    const options = [];
    let currentValue = 0;

    for (const rawItem of match[2].split(',')) {
      const cleanItem = rawItem.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
      if (!cleanItem) continue;

      const parts = cleanItem.split('=');
      const name = parts[0].trim();
      const explicitValue = parts.length > 1 ? Number.parseInt(parts[1].trim(), 0) : currentValue;
      if (!name || !Number.isFinite(explicitValue)) continue;

      options.push({ value: name, numericValue: explicitValue, label: `${explicitValue} - ${name}` });
      currentValue = explicitValue + 1;
    }

    if (options.length) definitions[match[1]] = options;
  }

  return definitions;
};

// Parse custom enums from MQ5 file content
export const parseCustomEnumsFromMq5 = (content) => {
  if (!content) return {};
  const enumPattern = /enum\s+([a-zA-Z0-9_]+)\s*\{([^}]+)\}/g;
  const mapping = {};
  let match;
  while ((match = enumPattern.exec(content)) !== null) {
    const enumBody = match[2];
    const items = enumBody.split(',');
    let currentIndex = 0;
    
    for (const item of items) {
      // Xóa comments (cả // và /* */) và khoảng trắng
      let cleanItem = item.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
      if (!cleanItem) continue;
      
      if (cleanItem.includes('=')) {
        const parts = cleanItem.split('=');
        const name = parts[0].trim();
        const value = parseInt(parts[1].trim(), 10);
        if (name) {
          mapping[name] = value;
          currentIndex = value + 1;
        }
      } else {
        if (cleanItem) {
          mapping[cleanItem] = currentIndex;
          currentIndex++;
        }
      }
    }
  }
  return mapping;
};

// Extract input parameters from MQ5 file content
export const extractInputsFromMq5 = (content) => {
  const customEnumDefinitions = parseCustomEnumDefinitionsFromMq5(content);
  const customEnumMapping = parseCustomEnumsFromMq5(content);
  const inputPattern = /input\s+([a-zA-Z0-9_]+)\s+([a-zA-Z0-9_]+)\s*=\s*([^;/\s]+)/g;
  const inputs = [];
  let match;
  while ((match = inputPattern.exec(content)) !== null) {
    const type = match[1].trim();
    const enumOptions = customEnumDefinitions[type] || null;
    inputs.push({
      type,
      name: match[2].trim(),
      value: match[3].trim(),
      customEnumMapping,
      enumMapping: enumOptions
        ? Object.fromEntries(enumOptions.map((option) => [option.value, option.numericValue]))
        : null,
      enumOptions
    });
  }
  inputs.customEnumMapping = customEnumMapping;
  return inputs;
};

// Build a single input line for INI file
export const buildInputLine = (inp, userConfig, timeframe, mode, forceFallback = false) => {
  const name = inp.name;
  const value = inp.value;
  const nameL = name.toLowerCase();
  const isFloatingType = /double|float|decimal|real/i.test(String(inp.type || ""));
  const isNumericValue = Number.isFinite(Number.parseFloat(value));
  const defaultStep = isFloatingType ? "0.1" : "1";
  const numericValue = Number.parseFloat(value);
  const defaultMax = Number.isFinite(numericValue) ? String(numericValue * 10) : value;

  const customEnumMapping = inp.enumMapping || inp.customEnumMapping;
  const mapValue = (val) => {
    if (val === undefined || val === null) return val;
    const strVal = String(val).trim().split('::').pop();
    if (customEnumMapping && customEnumMapping[strVal] !== undefined) {
      return String(customEnumMapping[strVal]);
    }
    if (ENUM_MAPPING[strVal] !== undefined) {
      return String(ENUM_MAPPING[strVal]);
    }
    return val;
  };

  if (nameL === 'lotthreshold') return `${name}=0||0||0||0||N\n`;
  if (nameL === 'magicnumber') return `${name}=${mapValue(value)}||${mapValue(value)}||0||${mapValue(value)}||N\n`;
  if (nameL === 'riskmoney') return `${name}=10000||10000||0||10000||N\n`;
  if (nameL === 'acceptbuy' || nameL === 'enablebuyorders') {
    const acceptVal = (mode === 'Buy') ? 'true' : 'false';
    return `${name}=${acceptVal}||false||0||true||N\n`;
  }
  if (nameL === 'acceptsell' || nameL === 'enablesellorders') {
    const acceptVal = (mode === 'Sell') ? 'true' : 'false';
    return `${name}=${acceptVal}||false||0||true||N\n`;
  }

  // Special handling for selectedtimeframe
  if (nameL === 'selectedtimeframe') {
    const timeframeMapping = {
      'M1': 1, 'M5': 5, 'M15': 15, 'M30': 30,
      'H1': 16385, 'H4': 16388, 'D1': 16408,
      'W1': 32769, 'MN1': 49153
    };
    const tfValue = timeframeMapping[timeframe] || 16385; // default to H1 if not found
    return `${name}=${tfValue}||${tfValue}||0||${tfValue}||N\n`;
  }

  if (userConfig && userConfig[name]) {
    const cfg = userConfig[name];
    const enumOpts = cfg.enumOptions || MT5_ENUMS[cfg.type];
    const isEnum = cfg.isEnum && enumOpts?.length;
    const hasValue = (input) => input !== undefined && input !== null && String(input).trim() !== '';
    let currentValue = hasValue(cfg.value) ? cfg.value : value;
    let min = hasValue(cfg.min) ? cfg.min : (isEnum ? value : currentValue);
    let step = hasValue(cfg.step) ? cfg.step : (isEnum ? '1' : defaultStep);
    let max = hasValue(cfg.max) ? cfg.max : (isEnum ? value : defaultMax);
    let optimize = cfg.optimize !== undefined ? cfg.optimize : (isEnum || Number.isFinite(Number.parseFloat(currentValue)));

    if (optimize && !hasValue(cfg.value)) currentValue = min;
    if (!optimize) {
      min = hasValue(cfg.min) ? cfg.min : currentValue;
      step = hasValue(cfg.step) ? cfg.step : '0';
      max = hasValue(cfg.max) ? cfg.max : currentValue;
    }

    if (forceFallback && String(min).trim() === String(max).trim()) {
      optimize = false;
    }

    if (isEnum) {
      // Convert enum value to numeric
      let enumVal = hasValue(cfg.value) ? cfg.value : optimize ? min : value;
      enumVal = mapValue(enumVal);

      // Convert min/max indices to actual enum numeric values
      let minVal = min;
      let maxVal = max;

      if (enumOpts && typeof min === 'string' && !isNaN(min)) {
        const minIdx = parseInt(min);
        if (enumOpts[minIdx]) {
          minVal = mapValue(enumOpts[minIdx].value);
        }
      } else {
        minVal = mapValue(minVal);
      }

      if (enumOpts && typeof max === 'string' && !isNaN(max)) {
        const maxIdx = parseInt(max);
        if (enumOpts[maxIdx]) {
          maxVal = mapValue(enumOpts[maxIdx].value);
        }
      } else {
        maxVal = mapValue(maxVal);
      }

      if (!hasValue(cfg.value)) enumVal = minVal;

      if (forceFallback && String(minVal).trim() === String(maxVal).trim()) {
        optimize = false;
      }

      return `${name}=${enumVal}||${minVal}||${step}||${maxVal}||${optimize ? 'Y' : 'N'}\n`;
    }
    return `${name}=${mapValue(currentValue)}||${mapValue(min)}||${step}||${mapValue(max)}||${optimize ? 'Y' : 'N'}\n`;
  }

  let outputVal = value;
  outputVal = mapValue(outputVal);
  const finalMax = mapValue(defaultMax);
  const autoOptimize = forceFallback ? (isNumericValue && (outputVal !== finalMax)) : isNumericValue;
  return `${name}=${outputVal}||${outputVal}||${defaultStep}||${finalMax}||${autoOptimize ? 'Y' : 'N'}\n`;
};

// Generate all INI configuration files
export const generateAllConfigs = async (
  savedBotsConfig,
  symbolsData,
  endDate,
  forceFallback = false,
  symbolTimeframeStartDates = {}
) => {
  if (Object.keys(savedBotsConfig).length === 0) {
    throw new Error('Chưa cấu hình bot nào');
  }

  const zip = new JSZip();
  let fileCount = 0;

  for (const [botName, botData] of Object.entries(savedBotsConfig)) {
    const { expertPath, allInputs, userConfig, userConfigsByTimeframe, selections } = botData;
    
    // Use bot-specific selections or defaults
    const selectedSymbols = selections?.symbols || Object.keys(symbolsData);
    const selectedTimeframes = selections?.timeframes || ['H1', 'H4'];
    const selectedModes = selections?.modes || ['Buy', 'Sell'];

    for (const symbol of selectedSymbols) {
      if (!symbolsData[symbol]) continue;

      for (const tf of selectedTimeframes) {
        const startDate = symbolTimeframeStartDates[symbol]?.[tf] || symbolsData[symbol];
        const timeframeUserConfig = userConfigsByTimeframe?.[tf] || userConfig;
        for (const mode of selectedModes) {
          const configFilename = `${botName}${symbol}${tf}_${mode}.ini`;
          const reportFilename = `${botName}${symbol}${tf}_${mode}.xml`;
          let inputsSection = '';

          for (const inp of allInputs) {
            inputsSection += buildInputLine(inp, timeframeUserConfig, tf, mode, forceFallback);
          }

          const iniContent = `[Tester]
Expert=${expertPath}
Symbol=${symbol}
Period=${tf}
Optimization=2
Model=2
FromDate=${startDate}
ToDate=${endDate}
ForwardMode=0
Deposit=1000000
Currency=USD
Leverage=2000
ExecutionMode=0
OptimizationCriterion=4
Visual=0
ShutdownTerminal=1
Report=${reportFilename}
ReplaceReport=1             
[TesterInputs]
${inputsSection}`;

          if (!hasEnabledOptimizationInput(iniContent)) {
            throw new Error(`${configFilename}: enable at least one input for optimization before creating configs`);
          }

          zip.file(configFilename, iniContent);
          fileCount++;
        }
      }
    }
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `MT5_Configs_${Date.now()}.zip`;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  a.remove();

  return fileCount;
};
