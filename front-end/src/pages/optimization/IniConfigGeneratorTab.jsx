import { useState, useRef, useEffect, useMemo } from 'react';
import JSZip from 'jszip';

// material-ui
import { useTheme, alpha } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableBody from '@mui/material/TableBody';
import TableContainer from '@mui/material/TableContainer';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import MuiSelect from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';

// project imports
import MainCard from 'components/MainCard';
import CustomTablePagination from 'components/CustomTablePagination';

// assets - ant design icons
import FolderOpenOutlined from '@ant-design/icons/FolderOpenOutlined';
import FileTextOutlined from '@ant-design/icons/FileTextOutlined';
import CheckCircleOutlined from '@ant-design/icons/CheckCircleOutlined';
import ClearOutlined from '@ant-design/icons/ClearOutlined';
import CloseOutlined from '@ant-design/icons/CloseOutlined';
import SettingOutlined from '@ant-design/icons/SettingOutlined';
import SaveOutlined from '@ant-design/icons/SaveOutlined';
import BuildOutlined from '@ant-design/icons/BuildOutlined';
import ExclamationCircleOutlined from '@ant-design/icons/ExclamationCircleOutlined';
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import DownloadOutlined from '@ant-design/icons/DownloadOutlined';
import UploadOutlined from '@ant-design/icons/UploadOutlined';
import QuestionCircleOutlined from '@ant-design/icons/QuestionCircleOutlined';

import { MT5_ENUMS, ENUM_MAPPING } from 'utils/enumDefinitions';
import { compareStrategyCodes, formatStrategyCode, parseSymbolAndTimeframe } from 'utils/strategyNaming';
import {
  buildTesterInputValue,
  extractInputsFromMq5,
  generateAllConfigs,
  parseIniDocument,
  parseTesterInputValue,
  updateIniValue
} from 'utils/iniConfigService';

const STORAGE_KEYS = {
  BOTS: 'ini_gen_bots',
  SAVED_CONFIG: 'ini_gen_saved_config',
  INCLUDED_BOTS: 'ini_gen_included_bots',
  CONFIG_ERRORS: 'ini_gen_config_errors',
  BOT_SELECTIONS: 'ini_gen_bot_selections',
  SELECTED_BOT: 'ini_gen_selected_bot',
  ACTIVE_PROFILE: 'ini_gen_active_profile',
  INPUT_CONFIGS: 'ini_gen_input_configs',
  RETAINED_INPUTS: 'ini_gen_retained_inputs',
  CHANGED_INPUTS: 'ini_gen_changed_inputs',
  AUTO_FIXED_INPUTS: 'ini_gen_auto_fixed_inputs',
  SYMBOLS_DATA: 'ini_gen_symbols_data',
  SYMBOL_TIMEFRAME_START_DATES: 'ini_gen_symbol_timeframe_start_dates',
  END_DATE: 'ini_gen_end_date'
};

const SYMBOLS_DATA = {
  BTCUSD: '2021.05.07',
  ETHUSD: '2021.05.07',
  XAUUSD: '2021.03.02',
  XAGUSD: '2021.03.02',
  USOIL: '2021.03.02',
  US500: '2021.02.23',
  US30: '2021.02.24',
  USTEC: '2021.02.24',
  DE30: '2021.02.21',
  HK50: '2021.02.01',
  JP225: '2019.07.16',
  STOXX50: '2021.02.21',
  UK100: '2021.02.21'
};

const DEFAULT_END_DATE = '2026.10.01';
const INI_TIMEFRAMES = ['H1', 'H4', 'D1', 'W1'];
const MT5_TIMEFRAME_VALUES = { H1: '16385', H4: '16388', D1: '16408', W1: '32769' };
const MIN_END_DATE_INPUT = '2016-01-01';
const currentLocalDate = new Date();
const MAX_END_DATE_INPUT = [
  currentLocalDate.getFullYear(),
  String(currentLocalDate.getMonth() + 1).padStart(2, '0'),
  String(currentLocalDate.getDate()).padStart(2, '0')
].join('-');

const DEFAULT_BOT_SELECTIONS = {
  symbols: Object.keys(SYMBOLS_DATA),
  timeframes: ['H1', 'H4'],
  modes: ['Buy', 'Sell']
};

const cloneSelections = (selections = null, defaultSymbols = Object.keys(SYMBOLS_DATA)) => ({
  symbols: [...(selections?.symbols || defaultSymbols)],
  timeframes: [...(selections?.timeframes || DEFAULT_BOT_SELECTIONS.timeframes)],
  modes: [...(selections?.modes || DEFAULT_BOT_SELECTIONS.modes)]
});

const toMt5Date = (value) => String(value || '').replace(/-/g, '.');
const toInputDate = (value) => String(value || '').replace(/\./g, '-');

const getEndDateValidationError = (value) => {
  const inputDate = toInputDate(value);
  const match = inputDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return 'Enter a valid End Date in YYYY-MM-DD format.';

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return 'Enter a valid End Date.';
  }
  if (inputDate < MIN_END_DATE_INPUT) return `End Date must be on or after ${MIN_END_DATE_INPUT}.`;
  if (inputDate > MAX_END_DATE_INPUT) return `End Date cannot be later than today (${MAX_END_DATE_INPUT}).`;
  return '';
};

const REQUIRED_TESTER_SETTINGS = new Set([
  'expert',
  'symbol',
  'period',
  'model',
  'fromdate',
  'todate',
  'deposit',
  'currency',
  'leverage',
  'optimization'
]);

const TESTER_NUMERIC_RULES = {
  optimization: { integer: true, min: 0 },
  model: { integer: true, min: 0 },
  forwardmode: { integer: true, min: 0 },
  deposit: { minExclusive: 0 },
  leverage: { integer: true, minExclusive: 0 },
  executionmode: { integer: true, min: 0 },
  optimizationcriterion: { integer: true, min: 0 },
  visual: { integer: true, allowed: [0, 1] },
  shutdownterminal: { integer: true, allowed: [0, 1] },
  replacereport: { integer: true, allowed: [0, 1] }
};

const getTesterDateError = (rawValue, label) => {
  const value = toInputDate(rawValue);
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return `${label} must use YYYY-MM-DD format.`;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    return `Enter a valid ${label}.`;
  }
  if (value > MAX_END_DATE_INPUT) return `${label} cannot be later than today (${MAX_END_DATE_INPUT}).`;
  return '';
};

const validateTesterSettings = (entries = []) => {
  const errors = {};
  const values = Object.fromEntries(entries.map((entry) => [entry.key.toLowerCase(), String(entry.value ?? '').trim()]));

  entries.forEach((entry) => {
    const key = entry.key.toLowerCase();
    const value = values[key];
    if (!value) {
      if (REQUIRED_TESTER_SETTINGS.has(key)) errors[key] = `${entry.key} is required.`;
      return;
    }

    if (key === 'period' && !INI_TIMEFRAMES.includes(value.toUpperCase())) {
      errors[key] = 'Select H1, H4, D1 or W1.';
      return;
    }

    if (key === 'fromdate' || key === 'todate') {
      const dateError = getTesterDateError(value, key === 'fromdate' ? 'From Date' : 'To Date');
      if (dateError) errors[key] = dateError;
      return;
    }

    const numericRule = TESTER_NUMERIC_RULES[key];
    if (!numericRule) return;
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      errors[key] = `${entry.key} must be a valid number.`;
    } else if (numericRule.integer && !Number.isInteger(numericValue)) {
      errors[key] = `${entry.key} must be an integer.`;
    } else if (numericRule.allowed && !numericRule.allowed.includes(numericValue)) {
      errors[key] = `${entry.key} must be ${numericRule.allowed.join(' or ')}.`;
    } else if (numericRule.min !== undefined && numericValue < numericRule.min) {
      errors[key] = `${entry.key} cannot be less than ${numericRule.min}.`;
    } else if (numericRule.minExclusive !== undefined && numericValue <= numericRule.minExclusive) {
      errors[key] = `${entry.key} must be greater than ${numericRule.minExclusive}.`;
    }
  });

  const fromDate = toInputDate(values.fromdate);
  const toDate = toInputDate(values.todate);
  if (!errors.fromdate && !errors.todate && fromDate && toDate && fromDate > toDate) {
    errors.fromdate = 'From Date must not be later than To Date.';
    errors.todate = 'To Date must not be earlier than From Date.';
  }

  return errors;
};

const resolveEnumValue = (rawValue, enumOptions = []) => {
  const token = String(rawValue ?? '').trim().split('::').pop();
  if (!token) return '';
  const directMatch = enumOptions.find((option) => String(option.value) === token);
  if (directMatch) return directMatch.value;
  const numericValue = Number(token);
  if (!Number.isFinite(numericValue)) return '';
  const numericMatch = enumOptions.find((option) => {
    const optionValue = option.numericValue ?? ENUM_MAPPING[option.value];
    return Number(optionValue) === numericValue;
  });
  return numericMatch?.value || '';
};

const resolveSafeEnumValue = (rawValue, enumOptions = [], type = '') => {
  const resolved = resolveEnumValue(rawValue, enumOptions);
  if (resolved) return resolved;
  if (String(type).toLowerCase() !== 'bool') return '';
  const token = String(rawValue ?? '').trim().toLowerCase();
  if (token === '0' || token === 'false') return 'false';
  if (token === '1' || token === 'true') return 'true';
  return '';
};

const isValidEnumConfigValue = (config) => {
  if (!config?.isEnum) return true;
  const enumOptions = config.enumOptions || MT5_ENUMS[config.type] || [];
  return enumOptions.some((option) => String(option.value) === String(config.value));
};

const getIniEditorEnumType = (inputName) => {
  const name = String(inputName || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (name.includes('mamethod')) return 'ENUM_MA_METHOD';
  if (name.includes('appliedprice')) return 'ENUM_APPLIED_PRICE';
  if (name.includes('appliedvolume')) return 'ENUM_APPLIED_VOLUME';
  if (name.includes('stoprice') || name.includes('stochasticprice')) return 'ENUM_STO_PRICE';
  if (name.includes('selectedtimeframe')) return 'ENUM_TIMEFRAME';
  if (name.includes('orderentryoption')) return 'OrderEntryMode';
  return '';
};

const getIniEditorEnumOptions = (inputName, config) => {
  const values = [config.value, config.start, config.stop].map((value) => String(value ?? '').trim().toLowerCase());
  if (values.every((value) => value === 'true' || value === 'false')) {
    return MT5_ENUMS.bool.map((option) => ({ value: option.value, label: option.label, symbol: option.value }));
  }

  const enumType = getIniEditorEnumType(inputName);
  if (enumType) {
    let definition = MT5_ENUMS[enumType] || [];
    if (enumType === 'ENUM_TIMEFRAME') {
      definition = definition.filter((option) => ['PERIOD_H1', 'PERIOD_H4', 'PERIOD_D1', 'PERIOD_W1'].includes(option.value));
    }
    return definition.map((option) => ({
      value: String(ENUM_MAPPING[option.value] ?? option.value),
      label: option.label,
      symbol: option.value
    }));
  }

  const optionLikeName = /(option|choice|method|mode|type)$/i.test(String(inputName || '').replace(/[^a-z0-9]/gi, ''));
  const start = Number(config.start);
  const step = Number(config.step);
  const stop = Number(config.stop);
  if (!optionLikeName || !Number.isInteger(start) || !Number.isInteger(step) || !Number.isInteger(stop) || step <= 0 || stop < start) {
    return null;
  }
  const optionCount = Math.floor((stop - start) / step) + 1;
  if (optionCount < 2 || optionCount > 50) return null;
  return Array.from({ length: optionCount }, (_, index) => {
    const value = String(start + index * step);
    return { value, label: value, symbol: value };
  });
};

const normalizeIniEditorEnumValue = (rawValue, options) => {
  const raw = String(rawValue ?? '').trim();
  const token = raw.split('::').pop();
  const match = options.find((option) => option.value === raw || option.symbol === token);
  return match?.value ?? raw;
};

const isStrictNumericValue = (value) =>
  /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(String(value ?? '').trim());

const inferTesterInputKind = (entry) => {
  const config = parseTesterInputValue(entry.value);
  if (getIniEditorEnumOptions(entry.key, config)) return 'enum';
  const numericCount = [config.value, config.start, config.step, config.stop]
    .filter((value) => String(value ?? '').trim())
    .filter(isStrictNumericValue).length;
  return numericCount >= 3 ? 'number' : 'string';
};

const validateTesterInput = (entry, inputKind = inferTesterInputKind(entry)) => {
  const config = parseTesterInputValue(entry.value);
  const enumOptions = getIniEditorEnumOptions(entry.key, config);
  const errors = {};
  const requiredFields = config.optimize ? ['start', 'step', 'stop'] : ['value'];

  ['value', 'start', 'step', 'stop'].forEach((field) => {
    const value = String(config[field] ?? '').trim();
    if (!value) {
      if (requiredFields.includes(field)) errors[field] = `${field.toUpperCase()} is required.`;
      return;
    }
    if (enumOptions && field !== 'step' && !enumOptions.some((option) => option.value === value)) {
      errors[field] = 'Select a valid option.';
      return;
    }
    if ((inputKind === 'number' || field === 'step') && !isStrictNumericValue(value)) {
      errors[field] = `${field.toUpperCase()} must be a valid number.`;
    }
  });

  if (config.optimize && inputKind === 'number') {
    const start = Number(config.start);
    const step = Number(config.step);
    const stop = Number(config.stop);
    if (!errors.start && !errors.stop && start > stop) {
      errors.start = 'START must not exceed STOP.';
      errors.stop = 'STOP must not be lower than START.';
    }
    if (!errors.step && step <= 0) errors.step = 'STEP must be greater than 0 for numeric optimization.';
  }

  return errors;
};

const getImportedEnumIndex = (rawValue, enumOptions) => {
  const token = String(rawValue ?? '').trim().split('::').pop();
  const index = enumOptions.findIndex((option) => {
    const numericValue = option.numericValue ?? ENUM_MAPPING[option.value];
    return String(option.value) === token || String(numericValue) === token;
  });
  return index >= 0 ? String(index) : '';
};

const getBotIdFromFileName = (value) => {
  const fileName = String(value || '').split(/[\\/]/).pop() || '';
  return fileName.match(/^(\d{3})(?=\D|$)/)?.[1] || '';
};

const normalizeIniEditorContent = (content) => {
  let normalized = content;
  const document = parseIniDocument(content);
  document.testerInputs.forEach((entry) => {
    const config = parseTesterInputValue(entry.value);
    const options = getIniEditorEnumOptions(entry.key, config);
    if (!options) return;
    const nextConfig = {
      ...config,
      value: normalizeIniEditorEnumValue(config.value, options),
      start: normalizeIniEditorEnumValue(config.start, options),
      stop: normalizeIniEditorEnumValue(config.stop, options)
    };
    normalized = updateIniValue(normalized, 'TesterInputs', entry.key, buildTesterInputValue(nextConfig));
  });
  return normalized;
};

const escapeRegExp = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const syncIniReportIdentity = (previousContent, nextContent) => {
  const previousTester = parseIniDocument(previousContent).tester;
  const nextTester = parseIniDocument(nextContent).tester;
  const previousSymbol = getIniEntryValue(previousTester, 'Symbol');
  const nextSymbol = getIniEntryValue(nextTester, 'Symbol');
  const previousPeriod = getIniEntryValue(previousTester, 'Period');
  const nextPeriod = getIniEntryValue(nextTester, 'Period');
  let report = getIniEntryValue(nextTester, 'Report');
  if (!report) return nextContent;
  const reportIdentity = parseSymbolAndTimeframe(report);
  const reportSymbol = reportIdentity.symbol === '-' ? '' : reportIdentity.symbol;
  const reportPeriod = reportIdentity.timeframe === '-' ? '' : reportIdentity.timeframe;
  const symbolToReplace = previousSymbol && report.toUpperCase().includes(previousSymbol.toUpperCase()) ? previousSymbol : reportSymbol;
  const periodToReplace = previousPeriod && report.toUpperCase().includes(previousPeriod.toUpperCase()) ? previousPeriod : reportPeriod;

  if (symbolToReplace && nextSymbol && symbolToReplace !== nextSymbol) {
    report = report.replace(new RegExp(escapeRegExp(symbolToReplace), 'gi'), nextSymbol);
  }
  if (periodToReplace && nextPeriod && periodToReplace !== nextPeriod) {
    report = report.replace(new RegExp(escapeRegExp(periodToReplace), 'gi'), nextPeriod);
  }
  return updateIniValue(nextContent, 'Tester', 'Report', report);
};

const syncIniSelectedTimeframe = (content, timeframe) => {
  const timeframeValue = MT5_TIMEFRAME_VALUES[timeframe];
  if (!timeframeValue) return content;
  const selectedTimeframe = parseIniDocument(content).testerInputs.find(
    (entry) => entry.key.toLowerCase() === 'selectedtimeframe'
  );
  if (!selectedTimeframe) return content;
  const currentConfig = parseTesterInputValue(selectedTimeframe.value);
  return updateIniValue(
    content,
    'TesterInputs',
    selectedTimeframe.key,
    buildTesterInputValue({
      ...currentConfig,
      value: timeframeValue,
      start: timeframeValue,
      step: '0',
      stop: timeframeValue,
      optimize: false
    })
  );
};

const HIDDEN_INPUTS = [
  'lotthreshold',
  'magicnumber',
  'riskmoney',
  'acceptbuy',
  'acceptsell',
  'enablebuyorders',
  'enablesellorders',
  'selectedtimeframe',
  'orderentryoption'
];

const decodeIniBytes = (bytes) => {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.slice(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.slice(2));
  return new TextDecoder('utf-8').decode(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.slice(3) : bytes);
};

const getIniEntryValue = (entries, key) =>
  entries.find((entry) => entry.key.toLowerCase() === key.toLowerCase())?.value || '';

const INI_EDITOR_DB_NAME = 'lotusquant_ini_editor';
const INI_EDITOR_STORE = 'workspace';
const INI_EDITOR_FILES_STORE = 'files';
const INI_EDITOR_STATE_KEY = 'current';
const INI_EDITOR_MODE_KEY = 'ini_editor_workspace_mode';
const INI_READ_BATCH_SIZE = 75;

const openIniEditorDatabase = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(INI_EDITOR_DB_NAME, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(INI_EDITOR_STORE)) {
        request.result.createObjectStore(INI_EDITOR_STORE);
      }
      if (!request.result.objectStoreNames.contains(INI_EDITOR_FILES_STORE)) {
        request.result.createObjectStore(INI_EDITOR_FILES_STORE, { keyPath: 'path' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const loadIniEditorWorkspace = async () => {
  const database = await openIniEditorDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([INI_EDITOR_STORE, INI_EDITOR_FILES_STORE], 'readonly');
    const workspaceRequest = transaction.objectStore(INI_EDITOR_STORE).get(INI_EDITOR_STATE_KEY);
    const filesRequest = transaction.objectStore(INI_EDITOR_FILES_STORE).getAll();
    transaction.oncomplete = () => {
      const workspace = workspaceRequest.result || null;
      const storedFiles = filesRequest.result || [];
      const legacyFiles = Array.isArray(workspace?.iniFiles) ? workspace.iniFiles : [];
      database.close();
      resolve(workspace ? { ...workspace, iniFiles: storedFiles.length ? storedFiles : legacyFiles, needsFileMigration: !storedFiles.length && legacyFiles.length > 0 } : null);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
};

const saveIniEditorWorkspace = async (workspace, replaceFiles = false) => {
  const database = await openIniEditorDatabase();
  return new Promise((resolve, reject) => {
    const stores = replaceFiles ? [INI_EDITOR_STORE, INI_EDITOR_FILES_STORE] : [INI_EDITOR_STORE];
    const transaction = database.transaction(stores, 'readwrite');
    const { iniFiles = [] } = workspace;
    const workspaceMetadata = { ...workspace };
    delete workspaceMetadata.iniFiles;
    delete workspaceMetadata.needsFileMigration;
    transaction.objectStore(INI_EDITOR_STORE).put(workspaceMetadata, INI_EDITOR_STATE_KEY);
    if (replaceFiles) {
      const filesStore = transaction.objectStore(INI_EDITOR_FILES_STORE);
      filesStore.clear();
      iniFiles.forEach((file) => filesStore.put(file));
    }
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
};

const saveIniEditorFiles = async (files, removedPaths = []) => {
  if (!files.length && !removedPaths.length) return;
  const database = await openIniEditorDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(INI_EDITOR_FILES_STORE, 'readwrite');
    const store = transaction.objectStore(INI_EDITOR_FILES_STORE);
    removedPaths.forEach((path) => store.delete(path));
    files.forEach((file) => store.put(file));
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
};

const yieldToBrowser = () => new Promise((resolve) => setTimeout(resolve, 0));

const getIniDisplayName = (path) => {
  const filename = String(path || '').split(/[\\/]/).pop() || '';
  return formatStrategyCode(filename);
};

const getIniFileMetadata = (file) => {
  if (file.metadata) return { file, ...file.metadata };
  const document = parseIniDocument(file.content);
  const code = getIniDisplayName(file.path).toUpperCase();
  const direction = code.endsWith('OB') ? 'Buy' : code.endsWith('OS') ? 'Sell' : '';
  return {
    file,
    code,
    symbol: getIniEntryValue(document.tester, 'Symbol').toUpperCase(),
    timeframe: getIniEntryValue(document.tester, 'Period').toUpperCase(),
    expert: getIniEntryValue(document.tester, 'Expert').toUpperCase(),
    fromDate: getIniEntryValue(document.tester, 'FromDate'),
    toDate: getIniEntryValue(document.tester, 'ToDate'),
    direction
  };
};

const prepareIniFile = (file) => {
  const content = normalizeIniEditorContent(file.content);
  const prepared = { ...file, content };
  const metadata = { ...getIniFileMetadata(prepared) };
  const testerInputKinds = file.testerInputKinds || Object.fromEntries(
    parseIniDocument(content).testerInputs.map((entry) => [entry.key.toLowerCase(), inferTesterInputKind(entry)])
  );
  delete metadata.file;
  return { ...prepared, metadata, testerInputKinds };
};

const prepareIniFilesInBatches = async (files, onProgress) => {
  const preparedFiles = [];
  for (let start = 0; start < files.length; start += INI_READ_BATCH_SIZE) {
    const batch = files.slice(start, start + INI_READ_BATCH_SIZE).map((file) =>
      file.metadata && file.testerInputKinds ? file : prepareIniFile(file)
    );
    preparedFiles.push(...batch);
    onProgress?.(Math.min(start + batch.length, files.length), files.length);
    await yieldToBrowser();
  }
  return preparedFiles;
};

const findDuplicateIniConfiguration = (files) => {
  const identities = new Map();
  for (const file of files) {
    const metadata = getIniFileMetadata(file);
    const directionKey = metadata.direction || metadata.code || file.path.toUpperCase();
    const identity = [metadata.expert, metadata.symbol, metadata.timeframe, directionKey].join('|');
    if (identities.has(identity)) return [identities.get(identity), file.path];
    identities.set(identity, file.path);
  }
  return null;
};

const buildUpdatedIniPath = (path, content) => {
  const metadata = getIniFileMetadata({ path, content });
  const botId = metadata.code.match(/^(\d{3})/)?.[1];
  const direction = metadata.direction === 'Buy' ? 'OB' : metadata.direction === 'Sell' ? 'OS' : '';
  if (!botId || !metadata.symbol || !INI_TIMEFRAMES.includes(metadata.timeframe) || !direction) return path;
  const directory = String(path).match(/^(.*[\\/])/)?.[1] || '';
  return `${directory}${botId}${metadata.symbol}${metadata.timeframe}${direction}.ini`;
};

function SymbolStartDateManager({ symbolsData, endDate, startDates, setStartDates }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [open, setOpen] = useState(false);
  const getStartDate = (symbol, timeframe) => startDates[symbol]?.[timeframe] || symbolsData[symbol] || '';

  const updateStartDate = (symbol, timeframe, value) => {
    setStartDates((previous) => ({
      ...previous,
      [symbol]: { ...(previous[symbol] || {}), [timeframe]: toMt5Date(value) }
    }));
  };

  const resetStartDates = (symbol) => {
    setStartDates((previous) => {
      const next = { ...previous };
      delete next[symbol];
      return next;
    });
  };

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        startIcon={<SettingOutlined />}
        onClick={() => setOpen(true)}
        sx={{ minWidth: 0, px: 1, textTransform: 'none', fontWeight: 600 }}
      >
        Start Dates
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 1.5,
            bgcolor: isDark ? '#1e2632' : '#ffffff',
            backgroundImage: 'none',
            border: '1px solid',
            borderColor: 'divider'
          }
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 700 }}>
          <SettingOutlined /> Symbol Start Dates
        </DialogTitle>
        <DialogContent dividers sx={{ borderColor: 'divider', p: 0 }}>
          <TableContainer sx={{ maxHeight: '65vh' }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ minWidth: 110, fontWeight: 700 }}>Symbol</TableCell>
                  {INI_TIMEFRAMES.map((timeframe) => (
                    <TableCell key={timeframe} sx={{ minWidth: 170, fontWeight: 700 }}>{timeframe}</TableCell>
                  ))}
                  <TableCell align="right" sx={{ width: 100, fontWeight: 700 }}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {Object.keys(symbolsData).map((symbol) => (
                  <TableRow key={symbol} hover>
                    <TableCell sx={{ fontWeight: 700 }}>{symbol}</TableCell>
                    {INI_TIMEFRAMES.map((timeframe) => {
                      const startDate = getStartDate(symbol, timeframe);
                      const hasError = !startDate || toInputDate(startDate) > toInputDate(endDate);
                      return (
                        <TableCell key={timeframe}>
                          <Box
                            component="input"
                            type="date"
                            value={toInputDate(startDate)}
                            onChange={(event) => updateStartDate(symbol, timeframe, event.target.value)}
                            min={MIN_END_DATE_INPUT}
                            max={toInputDate(endDate)}
                            sx={{
                              width: '100%',
                              height: 36,
                              px: 1,
                              boxSizing: 'border-box',
                              border: '1px solid',
                              borderColor: hasError ? 'error.main' : 'divider',
                              borderRadius: 1,
                              bgcolor: 'transparent',
                              color: 'text.primary',
                              colorScheme: isDark ? 'dark' : 'light',
                              outline: 'none',
                              '&:focus': {
                                borderColor: hasError ? 'error.main' : 'primary.main',
                                boxShadow: (currentTheme) => `0 0 0 1px ${hasError ? currentTheme.palette.error.main : currentTheme.palette.primary.main}`
                              }
                            }}
                          />
                        </TableCell>
                      );
                    })}
                    <TableCell align="right">
                      {startDates[symbol] ? (
                        <Button
                          size="small"
                          variant="outlined"
                          color="warning"
                          onClick={() => resetStartDates(symbol)}
                          sx={{ minWidth: 68, textTransform: 'none', fontWeight: 700 }}
                        >
                          Reset
                        </Button>
                      ) : (
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                          Default
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.5 }}>
          <Button variant="contained" onClick={() => setOpen(false)}>Done</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function IniArchiveEditor({ symbolsData }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const folderInputRef = useRef(null);
  const [iniFiles, setIniFiles] = useState([]);
  const [selectedPath, setSelectedPath] = useState('');
  const [notice, setNotice] = useState(null);
  const [bulkValues, setBulkValues] = useState({ symbol: '', period: '', fromDate: '', toDate: '' });
  const [inputPage, setInputPage] = useState(0);
  const [inputRowsPerPage, setInputRowsPerPage] = useState(10);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState(() => new Set());
  const [fileFilters, setFileFilters] = useState({ search: '', symbol: '', timeframe: '', direction: '' });
  const [deferredSearch, setDeferredSearch] = useState('');
  const [fileListPage, setFileListPage] = useState(0);
  const [fileListRowsPerPage, setFileListRowsPerPage] = useState(100);
  const [operationProgress, setOperationProgress] = useState(null);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const workspaceRef = useRef(null);
  const saveTimerRef = useRef(null);
  const fileSaveTimerRef = useRef(null);
  const dirtyFilesRef = useRef(new Map());
  const workspaceReadyRef = useRef(false);

  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute('webkitdirectory', 'true');
      folderInputRef.current.setAttribute('directory', 'true');
    }
  }, []);

  useEffect(() => {
    let active = true;
    setOperationProgress({ label: 'Restoring INI workspace', current: 0, total: 0 });
    loadIniEditorWorkspace()
      .then(async (workspace) => {
        if (!active || !workspace) return;
        const sourceFiles = Array.isArray(workspace.iniFiles) ? workspace.iniFiles : [];
        const restoredFiles = await prepareIniFilesInBatches(sourceFiles, (current, total) => {
          if (active) setOperationProgress({ label: 'Restoring INI workspace', current, total });
        });
        if (!active) return;
        setIniFiles(restoredFiles);
        setSelectedPath(workspace.selectedPath || workspace.iniFiles?.[0]?.path || '');
        setBulkValues(workspace.bulkValues || { symbol: '', period: '', fromDate: '', toDate: '' });
        setInputRowsPerPage(workspace.inputRowsPerPage || 10);
        setFileListRowsPerPage(workspace.fileListRowsPerPage || 100);
        if (workspace.needsFileMigration) {
          await saveIniEditorWorkspace({ ...workspace, iniFiles: restoredFiles }, true);
        }
      })
      .catch(() => {
        if (active) setNotice({ type: 'warning', text: 'Temporary INI workspace could not be restored.' });
      })
      .finally(() => {
        if (active) {
          setOperationProgress(null);
          workspaceReadyRef.current = true;
          setWorkspaceReady(true);
        }
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    workspaceRef.current = { iniFiles, selectedPath, bulkValues, inputRowsPerPage, fileListRowsPerPage };
    if (!workspaceReady) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveIniEditorWorkspace(workspaceRef.current).catch(() => {});
    }, 300);
  }, [iniFiles, selectedPath, bulkValues, inputRowsPerPage, fileListRowsPerPage, workspaceReady]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDeferredSearch(fileFilters.search);
      setFileListPage(0);
    }, 200);
    return () => clearTimeout(timer);
  }, [fileFilters.search]);

  useEffect(() => {
    setFileListPage(0);
  }, [fileFilters.symbol, fileFilters.timeframe, fileFilters.direction]);

  useEffect(
    () => () => {
      clearTimeout(saveTimerRef.current);
      clearTimeout(fileSaveTimerRef.current);
      if (dirtyFilesRef.current.size) saveIniEditorFiles([...dirtyFilesRef.current.values()]).catch(() => {});
      if (workspaceReadyRef.current && workspaceRef.current) {
        saveIniEditorWorkspace(workspaceRef.current).catch(() => {});
      }
    },
    []
  );

  const queueIniFileSave = (file) => {
    dirtyFilesRef.current.set(file.path, file);
    clearTimeout(fileSaveTimerRef.current);
    fileSaveTimerRef.current = setTimeout(() => {
      const files = [...dirtyFilesRef.current.values()];
      dirtyFilesRef.current.clear();
      saveIniEditorFiles(files).catch(() => {});
    }, 300);
  };

  const initializeFiles = async (files) => {
    const sortedFiles = [...files].sort(
      (a, b) => compareStrategyCodes(a.path, b.path) || a.path.localeCompare(b.path, undefined, { numeric: true })
    );
    if (!sortedFiles.length) throw new Error('No INI files found.');

    const commonValue = (key) => {
      const metadataKey = { Symbol: 'symbol', Period: 'timeframe', FromDate: 'fromDate', ToDate: 'toDate' }[key];
      const values = sortedFiles.map((file) => file.metadata?.[metadataKey] || '');
      return values.length && values.every((value) => value === values[0]) ? values[0] : '';
    };

    setIniFiles(sortedFiles);
    setSelectedPath(sortedFiles[0].path);
    setSelectedPaths(new Set());
    setFileFilters({ search: '', symbol: '', timeframe: '', direction: '' });
    setDeferredSearch('');
    setFileListPage(0);
    setInputPage(0);
    setBulkValues({
      symbol: commonValue('Symbol'),
      period: commonValue('Period'),
      fromDate: toInputDate(commonValue('FromDate')),
      toDate: toInputDate(commonValue('ToDate'))
    });
    const workspace = {
      iniFiles: sortedFiles,
      selectedPath: sortedFiles[0].path,
      bulkValues: {
        symbol: commonValue('Symbol'),
        period: commonValue('Period'),
        fromDate: toInputDate(commonValue('FromDate')),
        toDate: toInputDate(commonValue('ToDate'))
      },
      inputRowsPerPage,
      fileListRowsPerPage
    };
    workspaceRef.current = workspace;
    await saveIniEditorWorkspace(workspace, true);
    setNotice({ type: 'success', text: `Loaded ${sortedFiles.length} INI file(s).` });
  };

  const handleZipUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      setNotice(null);
      setOperationProgress({ label: 'Opening INI ZIP', current: 0, total: 0 });
      const archive = await JSZip.loadAsync(file);
      const entries = Object.values(archive.files).filter((entry) => !entry.dir && entry.name.toLowerCase().endsWith('.ini'));
      const files = [];
      for (let start = 0; start < entries.length; start += INI_READ_BATCH_SIZE) {
        const batchEntries = entries.slice(start, start + INI_READ_BATCH_SIZE);
        const batch = await Promise.all(
          batchEntries.map(async (entry) => prepareIniFile({ path: entry.name, content: decodeIniBytes(await entry.async('uint8array')) }))
        );
        files.push(...batch);
        setOperationProgress({ label: 'Reading INI files', current: files.length, total: entries.length });
        await yieldToBrowser();
      }
      setOperationProgress({ label: 'Saving INI workspace', current: files.length, total: files.length });
      await initializeFiles(files);
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Unable to read this ZIP file.' });
    } finally {
      setOperationProgress(null);
    }
  };

  const handleFolderUpload = async (event) => {
    const selectedFiles = Array.from(event.target.files || []).filter((file) => file.name.toLowerCase().endsWith('.ini'));
    event.target.value = '';
    try {
      setNotice(null);
      const files = [];
      for (let start = 0; start < selectedFiles.length; start += INI_READ_BATCH_SIZE) {
        const batchFiles = selectedFiles.slice(start, start + INI_READ_BATCH_SIZE);
        const batch = await Promise.all(
          batchFiles.map(async (file) => prepareIniFile({
            path: file.webkitRelativePath || file.name,
            content: decodeIniBytes(new Uint8Array(await file.arrayBuffer()))
          }))
        );
        files.push(...batch);
        setOperationProgress({ label: 'Reading INI files', current: files.length, total: selectedFiles.length });
        await yieldToBrowser();
      }
      setOperationProgress({ label: 'Saving INI workspace', current: files.length, total: files.length });
      await initializeFiles(files);
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Unable to read this INI folder.' });
    } finally {
      setOperationProgress(null);
    }
  };

  const selectedFile = iniFiles.find((file) => file.path === selectedPath) || null;
  const selectedDocument = selectedFile ? parseIniDocument(selectedFile.content) : { tester: [], testerInputs: [] };
  const selectedInputKinds = selectedFile?.testerInputKinds || {};
  const iniFileMetadata = useMemo(() => iniFiles.map(getIniFileMetadata), [iniFiles]);
  const fileSymbols = useMemo(
    () => [...new Set(iniFileMetadata.map((item) => item.symbol).filter(Boolean))].sort(),
    [iniFileMetadata]
  );
  const filteredIniFiles = useMemo(() => {
    const search = deferredSearch.trim().toUpperCase();
    return iniFileMetadata
      .filter((item) => !search || item.code.includes(search) || item.file.path.toUpperCase().includes(search))
      .filter((item) => !fileFilters.symbol || item.symbol === fileFilters.symbol)
      .filter((item) => !fileFilters.timeframe || item.timeframe === fileFilters.timeframe)
      .filter((item) => !fileFilters.direction || item.direction === fileFilters.direction)
      .map((item) => item.file);
  }, [iniFileMetadata, deferredSearch, fileFilters.symbol, fileFilters.timeframe, fileFilters.direction]);
  const paginatedIniFiles = filteredIniFiles.slice(
    fileListPage * fileListRowsPerPage,
    fileListPage * fileListRowsPerPage + fileListRowsPerPage
  );
  const selectedFilteredCount = filteredIniFiles.filter((file) => selectedPaths.has(file.path)).length;
  const allFilteredSelected = filteredIniFiles.length > 0 && selectedFilteredCount === filteredIniFiles.length;
  const paginatedInputs = selectedDocument.testerInputs.slice(
    inputPage * inputRowsPerPage,
    inputPage * inputRowsPerPage + inputRowsPerPage
  );
  const selectedTesterErrors = validateTesterSettings(selectedDocument.tester);

  const updateFileContent = (path, updater) => {
    setIniFiles((current) => {
      const index = current.findIndex((file) => file.path === path);
      if (index < 0) return current;
      const updatedFile = prepareIniFile({ ...current[index], metadata: null, content: updater(current[index].content) });
      const next = [...current];
      next[index] = updatedFile;
      queueIniFileSave(updatedFile);
      return next;
    });
  };

  const updateSelectedValue = (section, key, value) => {
    if (!selectedFile) return;
    updateFileContent(selectedFile.path, (content) => updateIniValue(content, section, key, value));
  };

  const updateSelectedInput = (entry, field, nextValue) => {
    const currentValue = parseTesterInputValue(entry.value);
    const nextConfig = { ...currentValue, [field]: nextValue };
    updateSelectedValue('TesterInputs', entry.key, buildTesterInputValue(nextConfig));
  };

  const handleBulkSymbolChange = (symbol) => {
    setBulkValues((current) => ({
      ...current,
      symbol,
      fromDate: symbolsData[symbol] ? toInputDate(symbolsData[symbol]) : current.fromDate
    }));
  };

  const updateSelectedSymbol = (symbol) => {
    if (!selectedFile) return;
    updateFileContent(selectedFile.path, (content) => {
      let updated = updateIniValue(content, 'Tester', 'Symbol', symbol);
      if (symbolsData[symbol]) updated = updateIniValue(updated, 'Tester', 'FromDate', symbolsData[symbol]);
      return syncIniReportIdentity(content, updated);
    });
  };

  const updateSelectedTimeframe = (timeframe) => {
    if (!selectedFile) return;
    updateFileContent(selectedFile.path, (content) => {
      let updated = updateIniValue(content, 'Tester', 'Period', timeframe);
      updated = syncIniSelectedTimeframe(updated, timeframe);
      return syncIniReportIdentity(content, updated);
    });
  };

  const getBulkUpdates = () => [
    ['Symbol', bulkValues.symbol],
    ['Period', bulkValues.period],
    ['FromDate', bulkValues.fromDate ? toMt5Date(bulkValues.fromDate) : ''],
    ['ToDate', bulkValues.toDate ? toMt5Date(bulkValues.toDate) : '']
  ].filter(([, value]) => String(value || '').trim());

  const requestBulkApply = () => {
    const updates = getBulkUpdates();
    if (!selectedPaths.size) {
      setNotice({ type: 'warning', text: 'Select at least one INI file before applying common settings.' });
      return;
    }
    if (!updates.length) {
      setNotice({ type: 'warning', text: 'Enter at least one common value to apply.' });
      return;
    }
    if (bulkValues.fromDate && bulkValues.toDate && bulkValues.fromDate > bulkValues.toDate) {
      setNotice({ type: 'error', text: 'From Date must not be later than To Date.' });
      return;
    }
    setBulkConfirmOpen(true);
  };

  const applyBulkValues = async () => {
    const updates = getBulkUpdates();
    const shouldRename = updates.some(([key]) => key === 'Symbol' || key === 'Period');
    const pathChanges = new Map();
    const updatedFiles = [];
    const changedFiles = [];
    let processed = 0;
    setOperationProgress({ label: 'Applying common settings', current: 0, total: selectedPaths.size });

    try {
      clearTimeout(fileSaveTimerRef.current);
      const pendingFiles = [...dirtyFilesRef.current.values()];
      dirtyFilesRef.current.clear();
      if (pendingFiles.length) await saveIniEditorFiles(pendingFiles);
      for (let start = 0; start < iniFiles.length; start += INI_READ_BATCH_SIZE) {
        const batch = iniFiles.slice(start, start + INI_READ_BATCH_SIZE).map((file) => {
          if (!selectedPaths.has(file.path)) return file;
          let updatedContent = updates.reduce((current, [key, value]) => updateIniValue(current, 'Tester', key, value), file.content);
          const selectedTimeframe = updates.find(([key]) => key === 'Period')?.[1];
          if (selectedTimeframe) updatedContent = syncIniSelectedTimeframe(updatedContent, selectedTimeframe);
          const content = syncIniReportIdentity(file.content, updatedContent);
          const path = shouldRename ? buildUpdatedIniPath(file.path, content) : file.path;
          pathChanges.set(file.path, path);
          const updatedFile = prepareIniFile({ ...file, path, content, metadata: null });
          changedFiles.push(updatedFile);
          processed += 1;
          return updatedFile;
        });
        updatedFiles.push(...batch);
        setOperationProgress({ label: 'Applying common settings', current: processed, total: selectedPaths.size });
        await yieldToBrowser();
      }

      const seenPaths = new Set();
      const duplicatePath = updatedFiles.find((file) => {
        const key = file.path.toUpperCase();
        if (seenPaths.has(key)) return true;
        seenPaths.add(key);
        return false;
      });
      if (duplicatePath) {
        setBulkConfirmOpen(false);
        setNotice({ type: 'error', text: `Duplicate INI filename detected: ${duplicatePath.path}. No files were changed.` });
        return;
      }
      const duplicate = findDuplicateIniConfiguration(updatedFiles);
      if (duplicate) {
        setBulkConfirmOpen(false);
        setNotice({ type: 'error', text: `Duplicate configuration detected between ${duplicate[0]} and ${duplicate[1]}. No files were changed.` });
        return;
      }
      const sortedUpdatedFiles = updatedFiles.sort(
        (a, b) => compareStrategyCodes(a.path, b.path) || a.path.localeCompare(b.path, undefined, { numeric: true })
      );
      const nextSelectedPath = pathChanges.get(selectedPath) || selectedPath;
      const nextSelectedPaths = new Set([...selectedPaths].map((path) => pathChanges.get(path) || path));
      const nextWorkspace = {
        iniFiles: sortedUpdatedFiles,
        selectedPath: nextSelectedPath,
        bulkValues,
        inputRowsPerPage,
        fileListRowsPerPage
      };
      workspaceRef.current = nextWorkspace;
      setIniFiles(sortedUpdatedFiles);
      setSelectedPath(nextSelectedPath);
      setSelectedPaths(nextSelectedPaths);
      const renamedPaths = [...pathChanges.entries()].filter(([oldPath, newPath]) => oldPath !== newPath).map(([oldPath]) => oldPath);
      await saveIniEditorFiles(changedFiles, renamedPaths);
      await saveIniEditorWorkspace(nextWorkspace);
      setBulkConfirmOpen(false);
      setNotice({ type: 'success', text: `Applied common settings to ${selectedPaths.size} selected INI file(s).` });
    } catch (error) {
      setBulkConfirmOpen(false);
      setNotice({ type: 'error', text: error.message || 'Unable to apply common settings.' });
    } finally {
      setOperationProgress(null);
    }
  };

  const toggleFileSelection = (path) => {
    setSelectedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleAllFilteredFiles = () => {
    setSelectedPaths(allFilteredSelected ? new Set() : new Set(filteredIniFiles.map((file) => file.path)));
  };

  const findFirstInvalidInput = async (files = iniFiles) => {
    for (let start = 0; start < files.length; start += INI_READ_BATCH_SIZE) {
      const batch = files.slice(start, start + INI_READ_BATCH_SIZE);
      for (const file of batch) {
        const document = parseIniDocument(file.content);
        const testerErrors = validateTesterSettings(document.tester);
        const invalidTesterEntry = document.tester.find((entry) => testerErrors[entry.key.toLowerCase()]);
        if (invalidTesterEntry) {
          return {
            path: file.path,
            inputName: invalidTesterEntry.key,
            inputIndex: 0,
            message: testerErrors[invalidTesterEntry.key.toLowerCase()]
          };
        }
        for (let index = 0; index < document.testerInputs.length; index += 1) {
          const input = document.testerInputs[index];
          const inputErrors = validateTesterInput(
            input,
            file.testerInputKinds?.[input.key.toLowerCase()] || inferTesterInputKind(input)
          );
          const invalidField = ['value', 'start', 'step', 'stop'].find((field) => inputErrors[field]);
          if (invalidField) {
            return {
              path: file.path,
              inputName: input.key,
              inputIndex: index,
              message: `${input.key} ${inputErrors[invalidField]}`
            };
          }
        }
      }
      setOperationProgress({ label: 'Validating INI files', current: Math.min(start + batch.length, files.length), total: files.length });
      await yieldToBrowser();
    }
    return null;
  };

  const downloadEditedZip = async (selectedOnly = false) => {
    const allFiles = workspaceRef.current?.iniFiles || iniFiles;
    const sourceFiles = selectedOnly ? allFiles.filter((file) => selectedPaths.has(file.path)) : allFiles;
    if (!sourceFiles.length) {
      setNotice({ type: 'warning', text: 'Select at least one INI file before downloading.' });
      return;
    }
    setOperationProgress({ label: 'Validating INI files', current: 0, total: sourceFiles.length });
    try {
      const invalidInput = await findFirstInvalidInput(sourceFiles);
      if (invalidInput) {
        setSelectedPath(invalidInput.path);
        setInputPage(Math.floor(invalidInput.inputIndex / inputRowsPerPage));
        setNotice({
          type: 'error',
          text: `${invalidInput.path}: ${invalidInput.message || `${invalidInput.inputName} contains an invalid or empty value.`}`
        });
        return;
      }

      const archive = new JSZip();
      for (let start = 0; start < sourceFiles.length; start += INI_READ_BATCH_SIZE) {
        const batch = sourceFiles.slice(start, start + INI_READ_BATCH_SIZE);
        batch.forEach((file) => archive.file(file.path, syncIniReportIdentity(file.content, file.content)));
        setOperationProgress({ label: 'Preparing ZIP', current: Math.min(start + batch.length, sourceFiles.length), total: sourceFiles.length });
        await yieldToBrowser();
      }
      const blob = await archive.generateAsync({ type: 'blob' }, (metadata) => {
        setOperationProgress({ label: 'Creating ZIP', current: Math.round(metadata.percent), total: 100 });
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `MT5_INI_${selectedOnly ? 'Selected' : 'Edited'}_${Date.now()}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setNotice({ type: 'success', text: `Downloaded ${sourceFiles.length} ${selectedOnly ? 'selected' : 'edited'} INI file(s).` });
    } finally {
      setOperationProgress(null);
    }
  };

  const saveSelectedStrategy = async () => {
    if (!selectedFile) return;
    const testerErrors = validateTesterSettings(selectedDocument.tester);
    const invalidEntry = selectedDocument.tester.find((entry) => testerErrors[entry.key.toLowerCase()]);
    if (invalidEntry) {
      setNotice({
        type: 'error',
        text: `${getIniDisplayName(selectedFile.path) || selectedFile.path}: ${testerErrors[invalidEntry.key.toLowerCase()]}`
      });
      return;
    }
    for (let index = 0; index < selectedDocument.testerInputs.length; index += 1) {
      const entry = selectedDocument.testerInputs[index];
      const inputErrors = validateTesterInput(
        entry,
        selectedInputKinds[entry.key.toLowerCase()] || inferTesterInputKind(entry)
      );
      const invalidField = ['value', 'start', 'step', 'stop'].find((field) => inputErrors[field]);
      if (invalidField) {
        setInputPage(Math.floor(index / inputRowsPerPage));
        setNotice({
          type: 'error',
          text: `${getIniDisplayName(selectedFile.path) || selectedFile.path}: ${entry.key} ${inputErrors[invalidField]}`
        });
        return;
      }
    }
    const workspace = { iniFiles, selectedPath, bulkValues, inputRowsPerPage, fileListRowsPerPage };
    workspaceRef.current = workspace;
    try {
      dirtyFilesRef.current.delete(selectedFile.path);
      await saveIniEditorFiles([selectedFile]);
      await saveIniEditorWorkspace(workspace);
      setNotice({ type: 'success', text: `Saved ${getIniDisplayName(selectedFile.path) || selectedFile.path}.` });
    } catch {
      setNotice({ type: 'error', text: 'Unable to save this strategy to the temporary workspace.' });
    }
  };

  const clearWorkspace = async () => {
    const emptyWorkspace = {
      iniFiles: [],
      selectedPath: '',
      bulkValues: { symbol: '', period: '', fromDate: '', toDate: '' },
      inputRowsPerPage: 10,
      fileListRowsPerPage: 100
    };
    clearTimeout(saveTimerRef.current);
    clearTimeout(fileSaveTimerRef.current);
    dirtyFilesRef.current.clear();
    workspaceRef.current = emptyWorkspace;
    setIniFiles([]);
    setSelectedPath('');
    setBulkValues(emptyWorkspace.bulkValues);
    setInputPage(0);
    setInputRowsPerPage(10);
    setFileListPage(0);
    setFileListRowsPerPage(100);
    setSelectedPaths(new Set());
    setFileFilters({ search: '', symbol: '', timeframe: '', direction: '' });
    setDeferredSearch('');
    setClearConfirmOpen(false);
    try {
      await saveIniEditorWorkspace(emptyWorkspace, true);
      setNotice({ type: 'success', text: 'INI workspace cleared. Upload another ZIP or folder to continue.' });
    } catch {
      setNotice({ type: 'error', text: 'Unable to clear the temporary INI workspace.' });
    }
  };

  const isBusy = Boolean(operationProgress);
  const operationPercent = operationProgress?.total
    ? Math.round((operationProgress.current / operationProgress.total) * 100)
    : 0;

  return (
    <Stack spacing={2}>
      <MainCard
        title="Edit Existing INI"
        subheader="Upload an INI ZIP or folder, edit individual files, then download a new ZIP"
        sx={{
          '& .MuiCardHeader-root': { flexWrap: 'wrap', columnGap: 2, rowGap: 1.25 },
          '& .MuiCardHeader-content': { flex: '1 1 360px', minWidth: 0 },
          '& .MuiCardHeader-root .MuiCardHeader-action': {
            flex: '1 1 760px',
            minWidth: 0,
            maxWidth: '100%',
            margin: '0 !important'
          }
        }}
        secondary={
          <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="flex-end" sx={{ width: '100%' }}>
            <Button component="label" variant="outlined" size="small" startIcon={<FolderOpenOutlined />} disabled={isBusy}>
              {isBusy ? 'Processing...' : 'Upload ZIP'}
              <input hidden type="file" accept=".zip,application/zip" onChange={handleZipUpload} />
            </Button>
            <Button component="label" variant="outlined" size="small" startIcon={<FolderOpenOutlined />} disabled={isBusy}>
              {isBusy ? 'Processing...' : 'Upload INI Folder'}
              <input ref={folderInputRef} hidden type="file" multiple onChange={handleFolderUpload} />
            </Button>
            {iniFiles.length > 0 && (
              <>
                <Button color="error" variant="outlined" size="small" startIcon={<ClearOutlined />} disabled={isBusy} onClick={() => setClearConfirmOpen(true)}>
                  Clear Workspace
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<DownloadOutlined />}
                  disabled={isBusy || selectedPaths.size === 0}
                  onClick={() => downloadEditedZip(true)}
                >
                  Download Selected ({selectedPaths.size})
                </Button>
                <Button variant="contained" size="small" startIcon={<DownloadOutlined />} disabled={isBusy} onClick={() => downloadEditedZip(false)}>
                  Download ZIP ({iniFiles.length})
                </Button>
              </>
            )}
          </Stack>
        }
      >
        {notice && <Alert severity={notice.type} onClose={() => setNotice(null)}>{notice.text}</Alert>}
        {operationProgress && (
          <Box sx={{ mt: notice ? 1.5 : 0, mb: 1.5 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.75 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{operationProgress.label}</Typography>
              <Typography variant="caption" color="text.secondary">
                {operationProgress.total ? `${operationProgress.current.toLocaleString()} / ${operationProgress.total.toLocaleString()} (${operationPercent}%)` : 'Please wait...'}
              </Typography>
            </Stack>
            <LinearProgress variant={operationProgress.total ? 'determinate' : 'indeterminate'} value={operationPercent} />
          </Box>
        )}
        {iniFiles.length === 0 ? (
          <Box sx={{ mt: notice ? 2 : 0, py: 5, textAlign: 'center', border: '1px dashed', borderColor: 'divider' }}>
            <Typography variant="body2" color="text.secondary">Upload a ZIP or folder containing .ini files to begin.</Typography>
          </Box>
        ) : (
          <Box sx={{ mt: notice ? 2 : 0 }}>
            <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 700 }}>Apply Common Tester Settings</Typography>
            <Grid container spacing={1.5} alignItems="center">
              <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
                <TextField
                  select
                  fullWidth
                  size="small"
                  label="Symbol"
                  value={bulkValues.symbol}
                  onChange={(e) => handleBulkSymbolChange(e.target.value)}
                  SelectProps={{ displayEmpty: true }}
                  InputLabelProps={{ shrink: true }}
                >
                  <MenuItem value="">Keep each file's Symbol</MenuItem>
                  {Object.keys(symbolsData).map((symbol) => <MenuItem key={symbol} value={symbol}>{symbol}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
                <TextField
                  select
                  fullWidth
                  size="small"
                  label="Timeframe"
                  value={bulkValues.period}
                  onChange={(e) => setBulkValues((v) => ({ ...v, period: e.target.value }))}
                  SelectProps={{ displayEmpty: true }}
                  InputLabelProps={{ shrink: true }}
                >
                  <MenuItem value="">Keep each file's Timeframe</MenuItem>
                  {INI_TIMEFRAMES.map((timeframe) => <MenuItem key={timeframe} value={timeframe}>{timeframe}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
                <TextField fullWidth size="small" type="date" label="From Date" value={bulkValues.fromDate} onChange={(e) => setBulkValues((v) => ({ ...v, fromDate: e.target.value }))} InputLabelProps={{ shrink: true }} slotProps={{ inputLabel: { shrink: true } }} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
                <TextField fullWidth size="small" type="date" label="To Date" value={bulkValues.toDate} onChange={(e) => setBulkValues((v) => ({ ...v, toDate: e.target.value }))} InputLabelProps={{ shrink: true }} slotProps={{ inputLabel: { shrink: true } }} />
              </Grid>
              <Grid size={{ xs: 12, md: 2.4 }}>
                <Button fullWidth variant="contained" disabled={!selectedPaths.size || isBusy} onClick={requestBulkApply}>
                  Apply to Selected ({selectedPaths.size})
                </Button>
              </Grid>
            </Grid>
          </Box>
        )}
      </MainCard>

      {iniFiles.length > 0 && (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 3 }}>
            <Paper
              variant="outlined"
              sx={{ height: { xs: 620, md: 760 }, overflow: 'hidden', p: 1, display: 'flex', flexDirection: 'column' }}
            >
              <Typography variant="subtitle2" sx={{ px: 1, py: 0.75, fontWeight: 700 }}>
                INI Files ({filteredIniFiles.length}/{iniFiles.length})
              </Typography>
              <Stack spacing={1} sx={{ px: 0.5, pb: 1 }}>
                <TextField
                  fullWidth
                  size="small"
                  label="Search Strategy"
                  placeholder="Filter by strategy..."
                  value={fileFilters.search}
                  onChange={(event) => setFileFilters((current) => ({ ...current, search: event.target.value }))}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  select
                  fullWidth
                  size="small"
                  label="Symbol"
                  value={fileFilters.symbol}
                  onChange={(event) => setFileFilters((current) => ({ ...current, symbol: event.target.value }))}
                  SelectProps={{ displayEmpty: true }}
                  InputLabelProps={{ shrink: true }}
                >
                  <MenuItem value="">All Symbols</MenuItem>
                  {fileSymbols.map((symbol) => <MenuItem key={symbol} value={symbol}>{symbol}</MenuItem>)}
                </TextField>
                <Stack direction="row" spacing={1}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label="Timeframe"
                    value={fileFilters.timeframe}
                    onChange={(event) => setFileFilters((current) => ({ ...current, timeframe: event.target.value }))}
                    SelectProps={{ displayEmpty: true }}
                    InputLabelProps={{ shrink: true }}
                  >
                    <MenuItem value="">All Timeframes</MenuItem>
                    {INI_TIMEFRAMES.map((timeframe) => <MenuItem key={timeframe} value={timeframe}>{timeframe}</MenuItem>)}
                  </TextField>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label="Mode"
                    value={fileFilters.direction}
                    onChange={(event) => setFileFilters((current) => ({ ...current, direction: event.target.value }))}
                    SelectProps={{ displayEmpty: true }}
                    InputLabelProps={{ shrink: true }}
                  >
                    <MenuItem value="">All Modes</MenuItem>
                    <MenuItem value="Buy">Buy</MenuItem>
                    <MenuItem value="Sell">Sell</MenuItem>
                  </TextField>
                </Stack>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <FormControlLabel
                    sx={{ m: 0 }}
                    control={
                      <Checkbox
                        size="small"
                        checked={allFilteredSelected}
                        indeterminate={selectedFilteredCount > 0 && !allFilteredSelected}
                        onChange={toggleAllFilteredFiles}
                      />
                    }
                    label={<Typography variant="caption">Select filtered ({filteredIniFiles.length})</Typography>}
                  />
                  {selectedPaths.size > 0 && (
                    <Button size="small" color="error" onClick={() => setSelectedPaths(new Set())}>Clear ({selectedPaths.size})</Button>
                  )}
                </Stack>
              </Stack>
              <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pr: 0.5 }}>
                {paginatedIniFiles.map((file) => (
                  <Box
                    key={file.path}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      mb: 0.5,
                      borderRadius: 1,
                      overflow: 'hidden',
                      border: '1px solid',
                      borderColor: file.path === selectedPath ? 'primary.main' : 'transparent',
                      bgcolor: file.path === selectedPath
                        ? isDark ? 'rgba(22, 119, 255, 0.22)' : '#e6f4ff'
                        : 'transparent',
                      transition: 'background-color 0.15s ease, border-color 0.15s ease',
                      '&:hover': {
                        bgcolor: file.path === selectedPath
                          ? isDark ? 'rgba(22, 119, 255, 0.3)' : '#d0ebff'
                          : isDark ? 'rgba(255, 255, 255, 0.08)' : '#f0f5ff',
                        borderColor: file.path === selectedPath
                          ? 'primary.main'
                          : isDark ? 'rgba(255, 255, 255, 0.15)' : 'grey.300',
                        '& .strategy-title': {
                          color: isDark ? '#ffffff' : 'primary.main'
                        },
                        '& .strategy-path': {
                          color: isDark ? 'rgba(255, 255, 255, 0.75)' : 'text.primary'
                        }
                      }
                    }}
                  >
                    <Checkbox
                      size="small"
                      checked={selectedPaths.has(file.path)}
                      onChange={() => toggleFileSelection(file.path)}
                      inputProps={{ 'aria-label': `Select ${getIniDisplayName(file.path)}` }}
                    />
                    <Button
                      fullWidth
                      variant="text"
                      onClick={() => { setSelectedPath(file.path); setInputPage(0); }}
                      sx={{
                        justifyContent: 'flex-start',
                        textTransform: 'none',
                        textAlign: 'left',
                        px: 0.5,
                        minWidth: 0,
                        color: 'text.primary',
                        bgcolor: 'transparent',
                        '&:hover': {
                          bgcolor: 'transparent'
                        }
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          noWrap
                          variant="body2"
                          className="strategy-title"
                          sx={{
                            fontWeight: 700,
                            color: 'text.primary',
                            transition: 'color 0.15s ease'
                          }}
                          title={file.path}
                        >
                          {getIniDisplayName(file.path)}
                        </Typography>
                        <Typography
                          noWrap
                          variant="caption"
                          className="strategy-path"
                          sx={{
                            color: 'text.secondary',
                            display: 'block',
                            transition: 'color 0.15s ease'
                          }}
                        >
                          {file.path}
                        </Typography>
                      </Box>
                    </Button>
                  </Box>
                ))}
                {!filteredIniFiles.length && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 1, py: 2, textAlign: 'center' }}>
                    No INI files match the filters.
                  </Typography>
                )}
              </Box>
              {filteredIniFiles.length > 0 && (
                <CustomTablePagination
                  count={filteredIniFiles.length}
                  page={fileListPage}
                  onPageChange={(_, nextPage) => setFileListPage(nextPage)}
                  rowsPerPage={fileListRowsPerPage}
                  onRowsPerPageChange={(event) => {
                    setFileListRowsPerPage(Number(event.target.value));
                    setFileListPage(0);
                  }}
                  rowsPerPageOptions={[50, 100, 250]}
                />
              )}
            </Paper>
          </Grid>

          <Grid size={{ xs: 12, md: 9 }}>
            <MainCard
              title={getIniDisplayName(selectedFile?.path) || 'INI File'}
              subheader={selectedFile?.path || ''}
              secondary={
                <Button variant="contained" size="small" startIcon={<SaveOutlined />} disabled={isBusy} onClick={saveSelectedStrategy}>
                  Save Strategy
                </Button>
              }
            >
              <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 700 }}>Tester Settings</Typography>
              <Grid container spacing={1.25} sx={{ mb: 2.5 }}>
                {selectedDocument.tester.map((entry) => {
                  const key = entry.key.toLowerCase();
                  const isSymbol = key === 'symbol';
                  const isTimeframe = key === 'period';
                  const isDate = key === 'fromdate' || key === 'todate';
                  const numericRule = TESTER_NUMERIC_RULES[key];
                  const testerError = selectedTesterErrors[key] || '';
                  return (
                    <Grid key={entry.key} size={{ xs: 12, sm: 6, lg: 4 }}>
                      <TextField
                        select={isSymbol || isTimeframe}
                        fullWidth
                        size="small"
                        type={isDate ? 'date' : numericRule ? 'number' : 'text'}
                        label={isTimeframe ? 'Timeframe' : entry.key.replace(/([a-z])([A-Z])/g, '$1 $2')}
                        value={isDate ? toInputDate(entry.value) : isTimeframe && !INI_TIMEFRAMES.includes(entry.value) ? '' : entry.value}
                        error={Boolean(testerError)}
                        helperText={testerError || undefined}
                        onChange={(event) => {
                          if (isSymbol) updateSelectedSymbol(event.target.value);
                          else if (isTimeframe) updateSelectedTimeframe(event.target.value);
                          else updateSelectedValue('Tester', entry.key, isDate ? toMt5Date(event.target.value) : event.target.value);
                        }}
                        InputLabelProps={{ shrink: true }}
                        inputProps={
                          numericRule
                            ? {
                                min: numericRule.min ?? numericRule.minExclusive,
                                step: numericRule.integer ? 1 : 'any'
                              }
                            : isDate
                            ? { max: MAX_END_DATE_INPUT }
                            : undefined
                        }
                        onKeyDown={
                          numericRule
                            ? (event) => {
                                if (['e', 'E', '+', '-'].includes(event.key)) event.preventDefault();
                              }
                            : undefined
                        }
                        SelectProps={isSymbol || isTimeframe ? { displayEmpty: true } : undefined}
                      >
                        {isSymbol && !Object.keys(symbolsData).includes(entry.value) && <MenuItem value={entry.value}>{entry.value}</MenuItem>}
                        {isSymbol && Object.keys(symbolsData).map((symbol) => <MenuItem key={symbol} value={symbol}>{symbol}</MenuItem>)}
                        {isTimeframe && <MenuItem value="" disabled>Select H1, H4, D1 or W1</MenuItem>}
                        {isTimeframe && INI_TIMEFRAMES.map((timeframe) => <MenuItem key={timeframe} value={timeframe}>{timeframe}</MenuItem>)}
                      </TextField>
                    </Grid>
                  );
                })}
              </Grid>

              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>Tester Inputs ({selectedDocument.testerInputs.length})</Typography>
              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table size="small" sx={{ minWidth: 760 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell align="center">OPT</TableCell>
                      <TableCell>INPUT</TableCell>
                      <TableCell>VALUE</TableCell>
                      <TableCell>START</TableCell>
                      <TableCell>STEP</TableCell>
                      <TableCell>STOP</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginatedInputs.map((entry) => {
                      const config = parseTesterInputValue(entry.value);
                      const enumOptions = getIniEditorEnumOptions(entry.key, config);
                      const inputKind = selectedInputKinds[entry.key.toLowerCase()] || inferTesterInputKind(entry);
                      const inputErrors = validateTesterInput(entry, inputKind);
                      return (
                        <TableRow key={entry.key} hover>
                          <TableCell align="center">
                            <Checkbox checked={config.optimize} onChange={(event) => updateSelectedInput(entry, 'optimize', event.target.checked)} />
                          </TableCell>
                          <TableCell><Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{entry.key}</Typography></TableCell>
                          {['value', 'start', 'step', 'stop'].map((field) => {
                            const useDropdown = Boolean(enumOptions) && field !== 'step';
                            const currentValue = String(config[field] ?? '');
                            const validOption = !useDropdown || enumOptions.some((option) => option.value === currentValue);
                            const fieldError = inputErrors[field] || '';
                            const isNumericField = inputKind === 'number' || field === 'step';
                            return (
                              <TableCell key={field}>
                                <TextField
                                  select={useDropdown}
                                  size="small"
                                  type={!useDropdown && isNumericField ? 'number' : 'text'}
                                  value={validOption ? currentValue : ''}
                                  error={Boolean(fieldError)}
                                  helperText={fieldError || undefined}
                                  onChange={(event) => updateSelectedInput(entry, field, event.target.value)}
                                  sx={{ minWidth: 105, '& .MuiInputBase-input': { fontFamily: 'monospace', fontSize: '0.78rem' } }}
                                >
                                  {useDropdown && <MenuItem value="" disabled>Select</MenuItem>}
                                  {useDropdown && enumOptions.map((option) => (
                                    <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                                  ))}
                                </TextField>
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
              <CustomTablePagination
                count={selectedDocument.testerInputs.length}
                page={inputPage}
                onPageChange={(_, nextPage) => setInputPage(nextPage)}
                rowsPerPage={inputRowsPerPage}
                onRowsPerPageChange={(event) => { setInputRowsPerPage(Number(event.target.value)); setInputPage(0); }}
                rowsPerPageOptions={[5, 10, 25, 50]}
              />
            </MainCard>
          </Grid>
        </Grid>
      )}

      <Dialog open={clearConfirmOpen} onClose={() => setClearConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Clear INI workspace?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            All uploaded INI files and unsaved edits in this temporary workspace will be removed.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearConfirmOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={clearWorkspace}>Clear Workspace</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={bulkConfirmOpen} onClose={() => setBulkConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Apply common settings?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Apply the selected Symbol, Timeframe and date values to {selectedPaths.size} selected INI file(s)?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkConfirmOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={applyBulkValues}>Apply to {selectedPaths.size} Files</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

export default function IniConfigGeneratorTab() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [workspaceMode, setWorkspaceMode] = useState(() => localStorage.getItem(INI_EDITOR_MODE_KEY) || 'generate');

  const [bots, setBots] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.BOTS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [selectedBot, setSelectedBot] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SELECTED_BOT);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [inputConfigs, setInputConfigs] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.INPUT_CONFIGS);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [activeInputProfile, setActiveInputProfile] = useState(
    () => localStorage.getItem(STORAGE_KEYS.ACTIVE_PROFILE) || ''
  );

  const [retainedInputsByBot, setRetainedInputsByBot] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.RETAINED_INPUTS);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [changedInputsByBot, setChangedInputsByBot] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CHANGED_INPUTS);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [autoFixedInputsByBot, setAutoFixedInputsByBot] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.AUTO_FIXED_INPUTS);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [savedBotsConfig, setSavedBotsConfig] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SAVED_CONFIG);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [includedBotNames, setIncludedBotNames] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.INCLUDED_BOTS);
      if (saved !== null) return JSON.parse(saved);
      return Object.keys(JSON.parse(localStorage.getItem(STORAGE_KEYS.SAVED_CONFIG) || '{}'));
    } catch {
      return [];
    }
  });

  const [botSelections, setBotSelections] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.BOT_SELECTIONS);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [symbolsData, setSymbolsData] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.SYMBOLS_DATA) || '{}');
      return { ...SYMBOLS_DATA, ...(saved && typeof saved === 'object' ? saved : {}) };
    } catch {
      return { ...SYMBOLS_DATA };
    }
  });
  const [endDate, setEndDate] = useState(() => localStorage.getItem(STORAGE_KEYS.END_DATE) || DEFAULT_END_DATE);
  const [addSymbolOpen, setAddSymbolOpen] = useState(false);
  const [symbolTimeframeStartDates, setSymbolTimeframeStartDates] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.SYMBOL_TIMEFRAME_START_DATES) || '{}');
      return saved && typeof saved === 'object' ? saved : {};
    } catch {
      return {};
    }
  });
  const [newSymbol, setNewSymbol] = useState('');
  const [newSymbolStartDate, setNewSymbolStartDate] = useState('');
  const [newSymbolError, setNewSymbolError] = useState('');

  const [message, setMessage] = useState(null);
  const folderInputRef = useRef(null);
  const botIniInputRef = useRef(null);
  const botIniFolderInputRef = useRef(null);
  const [iniImporting, setIniImporting] = useState(false);
  const [iniImportChoice, setIniImportChoice] = useState(null);
  const [selectedIniVariant, setSelectedIniVariant] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [autoFixHelpOpen, setAutoFixHelpOpen] = useState(false);
  const [configErrors, setConfigErrors] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.CONFIG_ERRORS) || '[]');
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(INI_EDITOR_MODE_KEY, workspaceMode);
  }, [workspaceMode]);

  // Sync states to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.BOTS, JSON.stringify(bots));
    } catch (e) {
      console.warn('Failed to save bots to localStorage', e);
    }
  }, [bots]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SAVED_CONFIG, JSON.stringify(savedBotsConfig));
    } catch (e) {
      console.warn('Failed to save savedBotsConfig to localStorage', e);
    }
  }, [savedBotsConfig]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.INCLUDED_BOTS, JSON.stringify(includedBotNames));
  }, [includedBotNames]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CONFIG_ERRORS, JSON.stringify(configErrors));
  }, [configErrors]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.BOT_SELECTIONS, JSON.stringify(botSelections));
    } catch (e) {
      console.warn('Failed to save botSelections to localStorage', e);
    }
  }, [botSelections]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SELECTED_BOT, JSON.stringify(selectedBot));
    } catch (e) {
      console.warn('Failed to save selectedBot to localStorage', e);
    }
  }, [selectedBot]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.INPUT_CONFIGS, JSON.stringify(inputConfigs));
    } catch (e) {
      console.warn('Failed to save inputConfigs to localStorage', e);
    }
  }, [inputConfigs]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_PROFILE, activeInputProfile);
  }, [activeInputProfile]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.RETAINED_INPUTS, JSON.stringify(retainedInputsByBot));
    } catch (e) {
      console.warn('Failed to save retained INI inputs to localStorage', e);
    }
  }, [retainedInputsByBot]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.CHANGED_INPUTS, JSON.stringify(changedInputsByBot));
    } catch (e) {
      console.warn('Failed to save changed INI inputs to localStorage', e);
    }
  }, [changedInputsByBot]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.AUTO_FIXED_INPUTS, JSON.stringify(autoFixedInputsByBot));
    } catch (e) {
      console.warn('Failed to save auto-fixed INI inputs to localStorage', e);
    }
  }, [autoFixedInputsByBot]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SYMBOLS_DATA, JSON.stringify(symbolsData));
  }, [symbolsData]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SYMBOL_TIMEFRAME_START_DATES, JSON.stringify(symbolTimeframeStartDates));
  }, [symbolTimeframeStartDates]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.END_DATE, endDate);
  }, [endDate]);

  const cloneCurrentSelections = (selections) => cloneSelections(selections, Object.keys(symbolsData));
  const getSymbolStartDate = (symbol, timeframe) =>
    symbolTimeframeStartDates[symbol]?.[timeframe] || symbolsData[symbol] || '';

  // Set up folder input attributes
  useEffect(() => {
    if (workspaceMode !== 'generate') return;
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute('webkitdirectory', 'true');
      folderInputRef.current.setAttribute('directory', 'true');
      folderInputRef.current.setAttribute('mozdirectory', 'true');
    }
    if (botIniFolderInputRef.current) {
      botIniFolderInputRef.current.setAttribute('webkitdirectory', 'true');
      botIniFolderInputRef.current.setAttribute('directory', 'true');
      botIniFolderInputRef.current.setAttribute('mozdirectory', 'true');
    }
  }, [workspaceMode, selectedBot]);

  const isNumeric = (val) => {
    if (val === undefined || val === null || val === '') return true;
    const str = String(val).trim();
    if (str === '') return true;
    return !isNaN(str) && !isNaN(parseFloat(str));
  };

  const uploadBots = async (e) => {
    const fileInput = e.target;
    if (!fileInput.files || !fileInput.files.length) {
      return;
    }

    const files = Array.from(fileInput.files);
    const mq5Files = files.filter((f) => f.name.toLowerCase().endsWith('.mq5'));

    if (mq5Files.length === 0) {
      showMessage('No .mq5 files found in selection', 'error');
      fileInput.value = '';
      return;
    }

    const newBots = [];
    for (const file of mq5Files) {
      try {
        const content = await file.text();
        const allInputs = extractInputsFromMq5(content);
        const botName = file.name.replace(/\.mq5$/i, '');
        const relativePath = file.webkitRelativePath || file.name;
        const folder = relativePath.includes('/') ? relativePath.substring(0, relativePath.lastIndexOf('/') + 1) : '';

        newBots.push({
          name: botName,
          path: relativePath,
          folder: folder,
          allInputs: allInputs
        });
      } catch (err) {
        console.error(`Error parsing ${file.name}:`, err);
      }
    }

    if (newBots.length === 0) {
      showMessage('Failed to parse selected .mq5 files', 'error');
      fileInput.value = '';
      return;
    }

    const uploadedBotsByName = new Map(newBots.map((bot) => [bot.name, bot]));
    const uniqueUploadedBots = Array.from(uploadedBotsByName.values());
    const existingBotNames = new Set(bots.map((bot) => bot.name));
    const newUniqueBots = uniqueUploadedBots.filter((bot) => !existingBotNames.has(bot.name));
    const duplicateBotNames = new Set(
      uniqueUploadedBots.filter((bot) => existingBotNames.has(bot.name)).map((bot) => bot.name)
    );
    const uploadedNameCounts = newBots.reduce((counts, bot) => {
      counts.set(bot.name, (counts.get(bot.name) || 0) + 1);
      return counts;
    }, new Map());
    uploadedNameCounts.forEach((count, botName) => {
      if (count > 1) duplicateBotNames.add(botName);
    });
    const duplicateCount = newBots.length - newUniqueBots.length;
    const totalCount = bots.length + newUniqueBots.length;

    setBots((prevBots) => {
      const map = new Map();
      prevBots.forEach((b) => map.set(b.name, b));
      newUniqueBots.forEach((b) => map.set(b.name, b));
      return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    });
    const uploadedBotNames = new Set(newUniqueBots.map((bot) => bot.name));
    setConfigErrors((previousErrors) =>
      previousErrors.filter((error) => !uploadedBotNames.has(getErrorTarget(error).botName))
    );
    setAutoFixedInputsByBot((previous) =>
      Object.fromEntries(Object.entries(previous).filter(([botName]) => !uploadedBotNames.has(botName)))
    );

    if (duplicateCount > 0) {
      const duplicateNames = Array.from(duplicateBotNames);
      const visibleNames = duplicateNames.slice(0, 3).join(', ');
      const remainingCount = Math.max(duplicateNames.length - 3, 0);
      const duplicateSummary = remainingCount > 0 ? `${visibleNames} and ${remainingCount} more` : visibleNames;
      showMessage(
        `Added ${newUniqueBots.length} new bot(s). Skipped ${duplicateCount} duplicate bot(s): ${duplicateSummary}. Total: ${totalCount}`,
        'warning'
      );
    } else {
      showMessage(`Added ${newUniqueBots.length} new bot(s). Total: ${totalCount}`, 'success');
    }
    fileInput.value = '';
  };

  const buildInputConfigsForBot = (bot, savedConfig = null, timeframe = '') => {
    const newInputConfigs = {};
    const savedUserConfig = savedConfig?.userConfigsByTimeframe?.[timeframe] || savedConfig?.userConfig || null;
    bot.allInputs
      .filter((inp) => !HIDDEN_INPUTS.includes(inp.name.toLowerCase()))
      .forEach((inp) => {
        const prevCfg = savedUserConfig?.[inp.name] || null;

        let enumType = inp.type;
        let enumOpts = inp.enumOptions || MT5_ENUMS[inp.type] || null;
        let isEnum = Boolean(enumOpts?.length);

        if (inp.name.toLowerCase().includes('selectedtimeframe')) {
          enumType = 'ENUM_TIMEFRAME';
          enumOpts = MT5_ENUMS[enumType];
          isEnum = true;
        }

        const enumMax = isEnum ? String(enumOpts.length - 1) : inp.value;
        const defStep = isEnum
          ? '1'
          : inp.type.toLowerCase() === 'double' || inp.type.toLowerCase() === 'float'
          ? '0.1'
          : '1';

        let defMin = '0';
        const sourceValue = prevCfg ? prevCfg.value : inp.value;
        const displayValue = isEnum ? resolveEnumValue(sourceValue, enumOpts) : sourceValue;

        let defMaxValue = inp.value;
        let defMinValue = defMin;

        if (!isEnum && prevCfg === null) {
          const numValue = parseFloat(displayValue);
          if (!isNaN(numValue)) {
            if (numValue < 0) {
              defMinValue = (numValue * 10).toString();
              defMaxValue = displayValue;
            } else {
              defMinValue = displayValue;
              defMaxValue = (numValue * 10).toString();
            }
          } else {
            defMinValue = displayValue;
          }
        }

        newInputConfigs[inp.name] = {
          type: enumType,
          enumOptions: isEnum ? enumOpts : null,
          value: displayValue,
          isEnum: isEnum,
          min: prevCfg ? prevCfg.min : defMinValue,
          step: prevCfg ? prevCfg.step : defStep,
          max: prevCfg ? prevCfg.max : isEnum ? enumMax : defMaxValue,
          optimize: prevCfg ? prevCfg.optimize : !Number.isNaN(parseFloat(displayValue))
        };
      });

    return newInputConfigs;
  };

  const getExpertPath = (bot) => {
    const fullRelPath = bot.path ? bot.path.replace(/\//g, '\\') : bot.name;
    const cleanRelPath = fullRelPath.replace(/\.mq5$/i, '.ex5');
    return cleanRelPath.startsWith('AllBot\\') ? cleanRelPath : 'AllBot\\' + cleanRelPath;
  };

  const createSavedConfig = (bot, userConfig, selections, userConfigsByTimeframe = null) => ({
    expertPath: getExpertPath(bot),
    allInputs: bot.allInputs,
    userConfig,
    selections: cloneCurrentSelections(selections),
    ...(userConfigsByTimeframe && Object.keys(userConfigsByTimeframe).length ? { userConfigsByTimeframe } : {})
  });

  const readUploadedIniRecords = async (uploadedFiles) => {
    const records = [];
    let processedCount = 0;
    const addRecord = (name, bytes) => {
      const content = decodeIniBytes(bytes);
      const document = parseIniDocument(content);
      if (document.testerInputs.length) records.push({ name, document });
    };

    for (const file of uploadedFiles) {
      if (file.name.toLowerCase().endsWith('.zip')) {
        const zip = await JSZip.loadAsync(file);
        const entries = Object.values(zip.files).filter((entry) => !entry.dir && entry.name.toLowerCase().endsWith('.ini'));
        for (const entry of entries) {
          addRecord(entry.name, await entry.async('uint8array'));
          processedCount += 1;
          if (processedCount % 100 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
        }
      } else if (file.name.toLowerCase().endsWith('.ini')) {
        addRecord(file.webkitRelativePath || file.name, new Uint8Array(await file.arrayBuffer()));
        processedCount += 1;
        if (processedCount % 100 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    return records;
  };

  const getIniVariantsForBot = (records, bot) => {
    const botId = getBotIdFromFileName(bot.name);
    if (!botId) return { botId: '', matchingRecords: [], variants: [] };
    const matchingRecords = records.filter(({ name, document }) => {
      const fileBotId = getBotIdFromFileName(name);
      if (fileBotId !== botId) return false;
      const expertBotId = getBotIdFromFileName(getIniEntryValue(document.tester, 'Expert'));
      return !expertBotId || expertBotId === botId;
    });
    const allowedInputNames = new Set(
      bot.allInputs.map((input) => input.name.toLowerCase()).filter((name) => !HIDDEN_INPUTS.includes(name))
    );
    const variantsBySignature = new Map();
    matchingRecords.forEach((record) => {
      const matchingValues = record.document.testerInputs
        .filter((entry) => allowedInputNames.has(entry.key.toLowerCase()))
        .map((entry) => [entry.key.toLowerCase(), entry.value.trim()])
        .sort(([left], [right]) => left.localeCompare(right));
      const signature = JSON.stringify(matchingValues);
      const current = variantsBySignature.get(signature);
      const timeframe = getIniEntryValue(record.document.tester, 'Period').toUpperCase();
      if (current) {
        current.count += 1;
        if (timeframe) current.timeframes.add(timeframe);
      } else {
        variantsBySignature.set(signature, {
          fileName: record.name,
          document: record.document,
          count: 1,
          timeframes: new Set(timeframe ? [timeframe] : [])
        });
      }
    });
    const variants = Array.from(variantsBySignature.values()).map((variant) => ({
      ...variant,
      timeframes: Array.from(variant.timeframes)
    }));
    return { botId, matchingRecords, variants };
  };

  const getTimeframeProfileVariants = (variants) => {
    if (variants.length < 2) return null;
    const profiles = {};
    for (const variant of variants) {
      if (variant.timeframes.length !== 1) return null;
      const timeframe = variant.timeframes[0];
      if (!INI_TIMEFRAMES.includes(timeframe) || profiles[timeframe]) return null;
      profiles[timeframe] = variant;
    }
    return profiles;
  };

  const mergeIniDocumentIntoBot = (bot, baseConfigs, document) => {
      const nextAllInputs = bot.allInputs.map((input) => ({ ...input }));
      const inputByName = new Map(nextAllInputs.map((input) => [input.name.toLowerCase(), input]));
      const importedInputNames = new Set(document.testerInputs.map((entry) => entry.key.toLowerCase()));
      const retainedInputNames = nextAllInputs
        .filter((input) => !HIDDEN_INPUTS.includes(input.name.toLowerCase()) && !importedInputNames.has(input.name.toLowerCase()))
        .map((input) => input.name);
      const nextConfigs = { ...baseConfigs };
      let overriddenCount = 0;
      let ignoredCount = 0;
      let managedCount = 0;
      const changedInputNames = [];

      document.testerInputs.forEach((entry) => {
        const lowerName = entry.key.toLowerCase();
        const importedConfig = parseTesterInputValue(entry.value);
        const existingInput = inputByName.get(lowerName);

        if (HIDDEN_INPUTS.includes(lowerName)) {
          managedCount += 1;
          return;
        }

        if (!existingInput) {
          ignoredCount += 1;
          return;
        }

        const targetInput = existingInput;
        overriddenCount += 1;

        const previousConfig = nextConfigs[targetInput.name] || {};
        const enumOptions = targetInput.enumOptions || MT5_ENUMS[targetInput.type] || null;
        const isEnum = Boolean(enumOptions?.length);
        const nextConfig = {
          ...previousConfig,
          type: targetInput.type,
          enumOptions: isEnum ? enumOptions : null,
          isEnum,
          value: isEnum ? resolveEnumValue(importedConfig.value, enumOptions) : importedConfig.value,
          min: isEnum ? getImportedEnumIndex(importedConfig.start, enumOptions) : importedConfig.start,
          step: importedConfig.step,
          max: isEnum ? getImportedEnumIndex(importedConfig.stop, enumOptions) : importedConfig.stop,
          optimize: importedConfig.optimize
        };
        const configChanged = ['value', 'min', 'step', 'max', 'optimize'].some(
          (field) => String(previousConfig[field] ?? '') !== String(nextConfig[field] ?? '')
        );
        if (configChanged) changedInputNames.push(targetInput.name);
        nextConfigs[targetInput.name] = nextConfig;
      });

      return {
        bot: { ...bot, allInputs: nextAllInputs },
        inputConfigs: nextConfigs,
        overriddenCount,
        ignoredCount,
        managedCount,
        retainedInputNames,
        changedInputNames
      };
  };

  const applyImportedIni = (document, fileName, representedFileCount = 1) => {
    if (!selectedBot) return;
    try {
      const merged = mergeIniDocumentIntoBot(selectedBot, inputConfigs, document);

      const updatedBot = merged.bot;
      setBots((previousBots) => previousBots.map((bot) => (bot.name === selectedBot.name ? updatedBot : bot)));
      setSelectedBot(updatedBot);
      setInputConfigs(merged.inputConfigs);
      setRetainedInputsByBot((previous) => ({ ...previous, [selectedBot.name]: merged.retainedInputNames }));
      setChangedInputsByBot((previous) => ({ ...previous, [selectedBot.name]: merged.changedInputNames }));
      setAutoFixedInputsByBot((previous) => {
        const next = { ...previous };
        delete next[selectedBot.name];
        return next;
      });
      const ignoredNote = merged.ignoredCount ? ` Ignored ${merged.ignoredCount} INI-only input(s).` : '';
      const managedNote = merged.managedCount ? ` ${merged.managedCount} system-managed input(s) were kept unchanged.` : '';
      const representedNote = representedFileCount > 1 ? ` Representative for ${representedFileCount} matching files.` : '';
      showMessage(
        `Merged ${fileName}: updated ${merged.overriddenCount} matching input(s).${ignoredNote}${managedNote}${representedNote} Save Configuration to keep the changes.`,
        'success'
      );
    } catch (error) {
      console.error('Failed to import bot INI:', error);
      showMessage(`Could not import INI: ${error.message}`, 'error');
    }
  };

  const importIniForSelectedBot = async (event) => {
    const fileInput = event.target;
    const uploadedFiles = Array.from(fileInput.files || []);
    fileInput.value = '';
    if (!uploadedFiles.length || !selectedBot) return;

    const selectedBotId = getBotIdFromFileName(selectedBot.name);
    if (!selectedBotId) {
      showMessage(`Could not determine the 3-digit Bot ID from "${selectedBot.name}".`, 'error');
      return;
    }

    setIniImporting(true);
    try {
      const records = await readUploadedIniRecords(uploadedFiles);
      const { matchingRecords, variants } = getIniVariantsForBot(records, selectedBot);

      if (!matchingRecords.length) {
        showMessage(`No valid INI files for Bot ID ${selectedBotId} were found.`, 'error');
        return;
      }
      if (variants.length === 1) {
        applyImportedIni(variants[0].document, variants[0].fileName, matchingRecords.length);
        return;
      }

      setSelectedIniVariant(0);
      setIniImportChoice({ botId: selectedBotId, botName: selectedBot.name, totalFiles: matchingRecords.length, variants });
    } catch (error) {
      console.error('Failed to read imported INI files:', error);
      showMessage(`Could not read uploaded INI files: ${error.message}`, 'error');
    } finally {
      setIniImporting(false);
    }
  };

  const applySelectedIniVariant = () => {
    if (!iniImportChoice || iniImportChoice.botName !== selectedBot?.name) {
      setIniImportChoice(null);
      showMessage('The selected bot changed. Import the INI files again.', 'error');
      return;
    }
    const variant = iniImportChoice.variants[selectedIniVariant];
    if (!variant) return;
    applyImportedIni(variant.document, variant.fileName, variant.count);
    setIniImportChoice(null);
  };

  const importIniForMultipleBots = async (event) => {
    const fileInput = event.target;
    const uploadedFiles = Array.from(fileInput.files || []);
    fileInput.value = '';
    if (!uploadedFiles.length || !bots.length) return;

    setIniImporting(true);
    try {
      const records = await readUploadedIniRecords(uploadedFiles);
      const botUpdates = new Map();
      const configUpdates = new Map();
      const timeframeConfigUpdates = new Map();
      const retainedInputUpdates = new Map();
      const changedInputUpdates = new Map();
      const conflictingBotIds = [];

      bots.forEach((bot) => {
        const { botId, matchingRecords, variants } = getIniVariantsForBot(records, bot);
        if (!matchingRecords.length) return;
        const timeframeVariants = getTimeframeProfileVariants(variants);
        if (variants.length !== 1 && !timeframeVariants) {
          conflictingBotIds.push(botId);
          return;
        }

        if (timeframeVariants) {
          const profileConfigs = {};
          const retainedNames = new Set();
          const changedNames = new Set();
          let updatedBot = bot;

          Object.entries(timeframeVariants).forEach(([timeframe, variant]) => {
            const baseConfigs = buildInputConfigsForBot(bot, savedBotsConfig[bot.name] || null, timeframe);
            const merged = mergeIniDocumentIntoBot(bot, baseConfigs, variant.document);
            profileConfigs[timeframe] = merged.inputConfigs;
            updatedBot = merged.bot;
            merged.retainedInputNames.forEach((name) => retainedNames.add(name));
            merged.changedInputNames.forEach((name) => changedNames.add(name));
          });

          const defaultTimeframe = profileConfigs.H1 ? 'H1' : Object.keys(profileConfigs)[0];
          botUpdates.set(bot.name, updatedBot);
          configUpdates.set(bot.name, profileConfigs[defaultTimeframe]);
          timeframeConfigUpdates.set(bot.name, profileConfigs);
          retainedInputUpdates.set(bot.name, Array.from(retainedNames));
          changedInputUpdates.set(bot.name, Array.from(changedNames));
          return;
        }

        const baseConfigs = bot.name === selectedBot?.name && !activeInputProfile
          ? inputConfigs
          : buildInputConfigsForBot(bot, savedBotsConfig[bot.name] || null);
        const merged = mergeIniDocumentIntoBot(bot, baseConfigs, variants[0].document);
        botUpdates.set(bot.name, merged.bot);
        configUpdates.set(bot.name, merged.inputConfigs);
        retainedInputUpdates.set(bot.name, merged.retainedInputNames);
        changedInputUpdates.set(bot.name, merged.changedInputNames);
      });

      if (!botUpdates.size) {
        const conflictNote = conflictingBotIds.length ? ` Conflicting Bot IDs: ${conflictingBotIds.join(', ')}.` : '';
        showMessage(`No unambiguous INI configuration matched the uploaded bots.${conflictNote}`, 'error');
        return;
      }

      setBots((previousBots) => previousBots.map((bot) => botUpdates.get(bot.name) || bot));
      setRetainedInputsByBot((previous) => {
        const next = { ...previous };
        retainedInputUpdates.forEach((inputNames, botName) => {
          next[botName] = inputNames;
        });
        return next;
      });
      setChangedInputsByBot((previous) => {
        const next = { ...previous };
        changedInputUpdates.forEach((inputNames, botName) => {
          next[botName] = inputNames;
        });
        return next;
      });
      setAutoFixedInputsByBot((previous) =>
        Object.fromEntries(Object.entries(previous).filter(([botName]) => !botUpdates.has(botName)))
      );
      setBotSelections((previousSelections) => {
        const next = { ...previousSelections };
        botUpdates.forEach((_, botName) => {
          if (!next[botName]) next[botName] = cloneCurrentSelections();
        });
        return next;
      });
      const nextSavedBotsConfig = { ...savedBotsConfig };
      botUpdates.forEach((updatedBot, botName) => {
        const selections = botSelections[botName] || cloneCurrentSelections();
        nextSavedBotsConfig[botName] = createSavedConfig(
          updatedBot,
          configUpdates.get(botName),
          selections,
          timeframeConfigUpdates.get(botName) || null
        );
      });
      setSavedBotsConfig(nextSavedBotsConfig);
      setIncludedBotNames((previousNames) => Array.from(new Set([...previousNames, ...botUpdates.keys()])));
      const importValidationErrors = checkAllSavedConfigsForErrors(nextSavedBotsConfig);
      setConfigErrors(importValidationErrors);

      const selectedUpdate = selectedBot ? botUpdates.get(selectedBot.name) : null;
      if (selectedUpdate) {
        const profiles = timeframeConfigUpdates.get(selectedBot.name);
        const profile = profiles?.H1 ? 'H1' : profiles ? Object.keys(profiles)[0] : '';
        setSelectedBot(selectedUpdate);
        setActiveInputProfile(profile);
        setInputConfigs(profile ? profiles[profile] : configUpdates.get(selectedBot.name));
      }

      const conflictNote = conflictingBotIds.length
        ? ` Skipped ${conflictingBotIds.length} bot(s) with conflicting configurations: ${conflictingBotIds.join(', ')}.`
        : '';
      const invalidImportedBotCount = new Set(
        importValidationErrors
          .map((error) => getErrorTarget(error).botName)
          .filter((botName) => botUpdates.has(botName))
      ).size;
      const validationNote = invalidImportedBotCount
        ? ` ${invalidImportedBotCount} imported bot(s) require configuration fixes and are marked in red.`
        : '';
      showMessage(
        `Imported and saved INI configurations for ${botUpdates.size} bot(s).${validationNote}${conflictNote}`,
        invalidImportedBotCount ? 'warning' : 'success'
      );
    } catch (error) {
      console.error('Failed to import INI folders:', error);
      showMessage(`Could not import INI folders: ${error.message}`, 'error');
    } finally {
      setIniImporting(false);
    }
  };

  const selectBot = (idx, preferredProfile = '') => {
    const bot = bots[idx];
    const savedConfig = savedBotsConfig[bot.name] || null;
    const profiles = Object.keys(savedConfig?.userConfigsByTimeframe || {});
    const profile = profiles.includes(preferredProfile) ? preferredProfile : profiles.includes('H1') ? 'H1' : profiles[0] || '';
    setSelectedBot(bot);
    setActiveInputProfile(profile);

    if (!botSelections[bot.name]) {
      setBotSelections((prev) => ({
        ...prev,
        [bot.name]: cloneCurrentSelections()
      }));
    }

    setInputConfigs(buildInputConfigsForBot(bot, savedConfig, profile));
  };

  const selectInputProfile = (timeframe) => {
    if (!selectedBot || timeframe === activeInputProfile) return;
    setActiveInputProfile(timeframe);
    setInputConfigs(buildInputConfigsForBot(selectedBot, savedBotsConfig[selectedBot.name] || null, timeframe));
  };

  const openBotImportAudit = (event, botIndex, inputNames) => {
    event.stopPropagation();
    const bot = bots[botIndex];
    if (!bot || !inputNames?.length) return;
    if (selectedBot?.name !== bot.name) selectBot(botIndex);
    setTimeout(() => {
      document.getElementById('ini-input-configuration')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  const toggleBotIncluded = (bot) => {
    const isIncluded = includedBotNames.includes(bot.name);
    if (isIncluded) {
      setIncludedBotNames((previousNames) => previousNames.filter((name) => name !== bot.name));
      return;
    }

    setIncludedBotNames((previousNames) => Array.from(new Set([...previousNames, bot.name])));
    if (savedBotsConfig[bot.name]) return;
    const selections = botSelections[bot.name] || cloneCurrentSelections();
    const defaultConfig = buildInputConfigsForBot(bot);
    setBotSelections((prev) => ({ ...prev, [bot.name]: cloneCurrentSelections(selections) }));
    setSavedBotsConfig((prev) => ({
      ...prev,
      [bot.name]: createSavedConfig(bot, defaultConfig, selections)
    }));
  };

  const toggleAllBots = () => {
    const allIncluded = bots.length > 0 && bots.every((bot) => includedBotNames.includes(bot.name));
    if (allIncluded) {
      setIncludedBotNames([]);
      showMessage(`Removed all ${bots.length} bots from config generation`, 'info');
      return;
    }

    setIncludedBotNames(bots.map((bot) => bot.name));

    setBotSelections((prev) => {
      const next = { ...prev };
      bots.forEach((bot) => {
        if (!next[bot.name]) next[bot.name] = cloneCurrentSelections();
      });
      return next;
    });
    setSavedBotsConfig((prev) => {
      const next = { ...prev };
      bots.forEach((bot) => {
        if (!next[bot.name]) {
          const selections = botSelections[bot.name] || cloneCurrentSelections();
          next[bot.name] = createSavedConfig(bot, buildInputConfigsForBot(bot), selections);
        }
      });
      return next;
    });
    showMessage(`Selected all ${bots.length} bots with their current/default configurations`, 'success');
  };

  const applyCurrentSelectionsToAllBots = () => {
    if (!selectedBot) {
      showMessage('Select a bot first', 'error');
      return;
    }

    const currentSelections = botSelections[selectedBot.name] || cloneCurrentSelections();
    if (!currentSelections.symbols.length || !currentSelections.timeframes.length || !currentSelections.modes.length) {
      showMessage('Select at least one Symbol, Timeframe and Mode before applying to all bots', 'error');
      return;
    }

    setBotSelections((prev) => {
      const next = { ...prev };
      bots.forEach((bot) => {
        next[bot.name] = cloneCurrentSelections(currentSelections);
      });
      return next;
    });
    setSavedBotsConfig((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([botName, config]) => [
          botName,
          { ...config, selections: cloneCurrentSelections(currentSelections) }
        ])
      )
    );
    showMessage(`Applied Symbol, Timeframe and Mode selections to all ${bots.length} bots`, 'success');
  };

  const MAX_CHAR_LENGTH = 9;
  const NUMBER_FIELDS = ['value', 'min', 'step', 'max'];

  const limitCharLength = (val) => {
    if (val === '' || val === '-') return val;
    const isNegative = val.startsWith('-');
    const numericPart = isNegative ? val.slice(1) : val;
    const totalLength = isNegative ? numericPart.length + 1 : numericPart.length;

    if (totalLength > MAX_CHAR_LENGTH) {
      return isNegative ? '-' + numericPart.slice(0, MAX_CHAR_LENGTH - 1) : numericPart.slice(0, MAX_CHAR_LENGTH);
    }
    return val;
  };

  const updateConfig = (name, field, value) => {
    const cfg = inputConfigs[name];
    const isNumberField = NUMBER_FIELDS.includes(field) && cfg && !cfg.isEnum;
    const finalValue = isNumberField ? limitCharLength(value) : value;
    setInputConfigs((prev) => ({
      ...prev,
      [name]: { ...prev[name], [field]: finalValue }
    }));
    if (selectedBot) {
      const profileKey = activeInputProfile || 'default';
      setAutoFixedInputsByBot((previous) => {
        const currentProfile = previous[selectedBot.name]?.[profileKey];
        if (!currentProfile?.[name]) return previous;
        const nextProfile = { ...currentProfile };
        delete nextProfile[name];
        return {
          ...previous,
          [selectedBot.name]: {
            ...previous[selectedBot.name],
            [profileKey]: nextProfile
          }
        };
      });
    }
  };

  const setAllOptimize = (value) => {
    setInputConfigs((prev) =>
      Object.keys(prev).reduce((acc, name) => {
        acc[name] = { ...prev[name], optimize: value };
        return acc;
      }, {})
    );
  };

  const getErrorTarget = (errorMessage) => {
    const matches = [...String(errorMessage || '').matchAll(/\[([^\]]+)\]/g)];
    const timeframe = INI_TIMEFRAMES.includes(matches[1]?.[1]) ? matches[1][1] : '';
    return {
      botName: matches[0]?.[1] || null,
      timeframe,
      inputName: matches[timeframe ? 2 : 1]?.[1] || null
    };
  };

  const openBotFromError = (errorMessage) => {
    const { botName, timeframe } = getErrorTarget(errorMessage);
    const botIndex = bots.findIndex((bot) => bot.name === botName);
    if (botIndex < 0) return;

    selectBot(botIndex, timeframe);
    setConfirmOpen(false);
    setTimeout(() => {
      document.getElementById('ini-input-configuration')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  const getInputValidationError = (config) => {
    const isEmpty = (value) => value === undefined || value === null || String(value).trim() === '';
    if (!config.optimize) {
      if (isEmpty(config.value)) return 'Value is required when OPT is disabled';
      if (!isValidEnumConfigValue(config)) return 'Select a valid Value';
      return '';
    }

    const emptyRangeFields = [
      ['Start', config.min],
      ['Step', config.step],
      ['Stop', config.max]
    ].filter(([, value]) => isEmpty(value));
    if (emptyRangeFields.length) {
      return `${emptyRangeFields.map(([label]) => label).join(', ')} required when OPT is enabled`;
    }
    if (String(config.min).trim() === String(config.max).trim()) return 'Start and Stop must be different when OPT is enabled';

    const minValue = Number(config.min);
    const maxValue = Number(config.max);
    const stepValue = Number(config.step);
    if (!config.isEnum && Number.isFinite(stepValue) && stepValue === 0) {
      return 'Step must not be 0 when OPT is enabled';
    }
    if (Number.isFinite(minValue) && Number.isFinite(maxValue) && Number.isFinite(stepValue)) {
      if (minValue > maxValue && stepValue > 0) return 'Start is greater than Stop while Step is positive';
      if (minValue < maxValue && stepValue < 0) return 'Start is less than Stop while Step is negative';
    }
    return '';
  };

  const autoFixInputConfig = (config, sourceInput) => {
    const nextConfig = { ...config };
    const changedFields = [];
    const isEmpty = (value) => value === undefined || value === null || String(value).trim() === '';
    const setField = (field, value) => {
      if (String(nextConfig[field] ?? '') === String(value ?? '')) return;
      nextConfig[field] = value;
      changedFields.push(field);
    };
    const enumOptions = nextConfig.enumOptions || MT5_ENUMS[nextConfig.type] || [];
    const isEnum = nextConfig.isEnum && enumOptions.length > 0;

    if (!nextConfig.optimize) {
      if (isEmpty(nextConfig.value) || !isValidEnumConfigValue(nextConfig)) {
        if (isEnum) {
          const safeValue = resolveSafeEnumValue(sourceInput?.value, enumOptions, nextConfig.type);
          if (safeValue) setField('value', safeValue);
        } else if (!isEmpty(sourceInput?.value)) {
          setField('value', sourceInput.value);
        }
      }
      return {
        config: nextConfig,
        changedFields,
        reason: changedFields.length ? 'Auto-fixed Value from the MQ5 default' : ''
      };
    }

    if (isEnum && enumOptions.length > 1) {
      const lastIndex = enumOptions.length - 1;
      const startIndex = Number(nextConfig.min);
      const stopIndex = Number(nextConfig.max);
      const validStart = !isEmpty(nextConfig.min) && Number.isInteger(startIndex) && startIndex >= 0 && startIndex <= lastIndex;
      const validStop = !isEmpty(nextConfig.max) && Number.isInteger(stopIndex) && stopIndex >= 0 && stopIndex <= lastIndex;
      if (!validStart || !validStop || startIndex >= stopIndex) {
        setField('min', '0');
        setField('max', String(lastIndex));
      }
      if (isEmpty(nextConfig.step)) setField('step', '1');
      return {
        config: nextConfig,
        changedFields,
        reason: changedFields.length ? 'Auto-fixed range from the MQ5 enum definition' : ''
      };
    }

    if (!isEnum && isEmpty(nextConfig.step)) {
      const type = String(sourceInput?.type || nextConfig.type || '').toLowerCase();
      setField('step', type === 'double' || type === 'float' ? '0.1' : '1');
    }
    return {
      config: nextConfig,
      changedFields,
      reason: changedFields.length ? 'Auto-fixed Step from the MQ5 input type' : ''
    };
  };

  const autoFixSavedConfigs = () => {
    if (!Object.keys(savedBotsConfig).length) {
      showMessage('No saved bot configurations to fix.', 'info');
      return;
    }

    const nextSavedBotsConfig = { ...savedBotsConfig };
    const nextAutoFixedInputs = { ...autoFixedInputsByBot };
    let fixedInputCount = 0;
    const fixedBotNames = new Set();

    Object.entries(savedBotsConfig).forEach(([botName, botData]) => {
      const sourceInputs = new Map((botData.allInputs || []).map((input) => [input.name, input]));
      const profiles = botData.userConfigsByTimeframe;
      const configsToFix = profiles
        ? Object.entries(profiles)
        : [['default', botData.userConfig || {}]];
      let nextBotData = { ...botData };
      let nextProfiles = profiles ? { ...profiles } : null;

      configsToFix.forEach(([profileKey, userConfig]) => {
        const nextUserConfig = { ...userConfig };
        const profileFixes = { ...(nextAutoFixedInputs[botName]?.[profileKey] || {}) };

        Object.entries(userConfig || {}).forEach(([inputName, config]) => {
          if (!getInputValidationError(config)) return;
          const fixed = autoFixInputConfig(config, sourceInputs.get(inputName));
          if (!fixed.changedFields.length || getInputValidationError(fixed.config)) return;
          nextUserConfig[inputName] = fixed.config;
          profileFixes[inputName] = fixed.reason;
          fixedInputCount += 1;
          fixedBotNames.add(botName);
        });

        nextAutoFixedInputs[botName] = {
          ...nextAutoFixedInputs[botName],
          [profileKey]: profileFixes
        };
        if (nextProfiles) nextProfiles[profileKey] = nextUserConfig;
        else nextBotData.userConfig = nextUserConfig;
      });

      if (nextProfiles) {
        nextBotData.userConfigsByTimeframe = nextProfiles;
        if (nextProfiles.H1) nextBotData.userConfig = nextProfiles.H1;
      }
      nextSavedBotsConfig[botName] = nextBotData;
    });

    const remainingErrors = checkAllSavedConfigsForErrors(nextSavedBotsConfig);
    setSavedBotsConfig(nextSavedBotsConfig);
    setAutoFixedInputsByBot(nextAutoFixedInputs);
    setConfigErrors(remainingErrors);

    if (selectedBot && nextSavedBotsConfig[selectedBot.name]) {
      const selectedData = nextSavedBotsConfig[selectedBot.name];
      const selectedConfig = activeInputProfile
        ? selectedData.userConfigsByTimeframe?.[activeInputProfile] || selectedData.userConfig
        : selectedData.userConfig;
      setInputConfigs({ ...(selectedConfig || {}) });
    }

    if (!fixedInputCount) {
      showMessage('No safely auto-fixable configuration errors were found.', remainingErrors.length ? 'warning' : 'info');
      return;
    }
    showMessage(
      `Auto Fix repaired ${fixedInputCount} input(s) across ${fixedBotNames.size} bot(s). ${remainingErrors.length} issue(s) still require review.`,
      remainingErrors.length ? 'warning' : 'success'
    );
  };

  const saveAndNextBot = () => {
    if (!selectedBot) {
      showMessage('Please select a Bot', 'error');
      return;
    }

    const endDateValidationError = getEndDateValidationError(endDate);
    if (endDateValidationError) {
      showMessage(endDateValidationError, 'error');
      return;
    }

    const botSelection = botSelections[selectedBot.name] || cloneCurrentSelections();

    if (!botSelection.symbols || botSelection.symbols.length === 0) {
      showMessage('Please select at least one Symbol', 'error');
      return;
    }

    if (!botSelection.timeframes || botSelection.timeframes.length === 0) {
      showMessage('Please select at least one Timeframe', 'error');
      return;
    }

    if (!botSelection.modes || botSelection.modes.length === 0) {
      showMessage('Please select at least one Mode', 'error');
      return;
    }

    for (const [inputName, config] of Object.entries(inputConfigs)) {
      const validationError = getInputValidationError(config);
      if (validationError) {
        showMessage(`Input "${inputName}" - ${validationError}`, 'error');
        return;
      }
    }

    const previousConfig = savedBotsConfig[selectedBot.name] || null;
    const timeframeConfigs = activeInputProfile
      ? {
          ...(previousConfig?.userConfigsByTimeframe || {}),
          [activeInputProfile]: { ...inputConfigs }
        }
      : previousConfig?.userConfigsByTimeframe || null;
    const defaultConfig = activeInputProfile
      ? timeframeConfigs.H1 || timeframeConfigs[activeInputProfile] || previousConfig?.userConfig || { ...inputConfigs }
      : { ...inputConfigs };
    const nextSavedBotsConfig = {
      ...savedBotsConfig,
      [selectedBot.name]: createSavedConfig(selectedBot, defaultConfig, botSelection, timeframeConfigs)
    };
    setSavedBotsConfig(nextSavedBotsConfig);
    setConfigErrors(checkAllSavedConfigsForErrors(nextSavedBotsConfig));

    showMessage(`✓ Saved configuration for ${selectedBot.name}`, 'success');
  };

  const checkAllSavedConfigsForErrors = (configs = savedBotsConfig) => {
    const errorList = [];
    for (const [botName, botData] of Object.entries(configs)) {
      if (!botData.selections?.symbols?.length) errorList.push(`Bot [${botName}] - Select at least one Symbol`);
      if (!botData.selections?.timeframes?.length) errorList.push(`Bot [${botName}] - Select at least one Timeframe`);
      if (!botData.selections?.modes?.length) errorList.push(`Bot [${botName}] - Select at least one Mode`);
      const timeframeConfigs = botData.userConfigsByTimeframe || null;
      const configsToValidate = timeframeConfigs
        ? (botData.selections?.timeframes || []).map((timeframe) => [timeframe, timeframeConfigs[timeframe] || botData.userConfig])
        : [['', botData.userConfig || {}]];
      for (const [timeframe, userConfig] of configsToValidate) {
        const profileLabel = timeframe ? ` [${timeframe}]` : '';
        if (!Object.values(userConfig || {}).some((config) => config?.optimize === true)) {
          errorList.push(`Bot [${botName}]${profileLabel} - Enable at least one input for optimization (OPT)`);
        }
        for (const [name, cfg] of Object.entries(userConfig || {})) {
          const validationError = getInputValidationError(cfg);
          if (validationError) errorList.push(`Bot [${botName}]${profileLabel} - Input [${name}] ${validationError}`);
        }
      }
    }
    return errorList;
  };

  const checkInputErrors = () => {
    const errors = {};
    for (const [name, cfg] of Object.entries(inputConfigs)) {
      const validationError = getInputValidationError(cfg);
      if (validationError) errors[name] = validationError;
    }
    return errors;
  };

  const generateAllConfigsHandler = async () => {
    const endDateValidationError = getEndDateValidationError(endDate);
    if (endDateValidationError) {
      showMessage(endDateValidationError, 'error');
      return;
    }
    const includedConfigs = Object.fromEntries(
      includedBotNames
        .filter((botName) => savedBotsConfig[botName])
        .map((botName) => [botName, savedBotsConfig[botName]])
    );
    if (!Object.keys(includedConfigs).length) {
      showMessage('Select at least one configured bot before creating configs.', 'error');
      return;
    }
    let invalidDateSelection = null;
    for (const config of Object.values(includedConfigs)) {
      for (const symbol of config.selections?.symbols || []) {
        for (const timeframe of config.selections?.timeframes || []) {
          const startDate = getSymbolStartDate(symbol, timeframe);
          if (!startDate || toInputDate(startDate) > toInputDate(endDate)) {
            invalidDateSelection = { symbol, timeframe };
            break;
          }
        }
        if (invalidDateSelection) break;
      }
      if (invalidDateSelection) break;
    }
    if (invalidDateSelection) {
      showMessage(
        `Invalid Start Date for ${invalidDateSelection.symbol} ${invalidDateSelection.timeframe}. It must not exceed End Date.`,
        'error'
      );
      return;
    }
    const errors = checkAllSavedConfigsForErrors(includedConfigs);
    setConfigErrors(checkAllSavedConfigsForErrors(savedBotsConfig));
    if (errors.length > 0) {
      setConfirmOpen(true);
    } else {
      await executeGenerateConfigs(false, includedConfigs);
    }
  };

  const executeGenerateConfigs = async (forceFallback, configs = savedBotsConfig) => {
    try {
      const fileCount = await generateAllConfigs(
        configs,
        symbolsData,
        endDate,
        forceFallback,
        symbolTimeframeStartDates
      );
      showMessage(`✓ Successfully created ${fileCount} configuration files!`, 'success');
      setConfirmOpen(false);
    } catch (err) {
      console.error(err);
      showMessage('Error: ' + err.message, 'error');
    }
  };

  const showMessage = (msg, type) => {
    setMessage({ text: msg, type });
  };

  const handleAddSymbol = () => {
    const symbol = newSymbol.trim().toUpperCase();
    const startDate = toMt5Date(newSymbolStartDate);
    if (!/^[A-Z0-9._-]{2,32}$/.test(symbol)) {
      setNewSymbolError('Use 2-32 letters, numbers, dots, underscores or hyphens.');
      return;
    }
    if (symbolsData[symbol]) {
      setNewSymbolError(`${symbol} already exists.`);
      return;
    }
    if (!newSymbolStartDate) {
      setNewSymbolError('Start Date is required.');
      return;
    }
    if (!endDate || newSymbolStartDate > toInputDate(endDate)) {
      setNewSymbolError('Start Date must not exceed End Date.');
      return;
    }

    setSymbolsData((prev) => ({ ...prev, [symbol]: startDate }));
    if (selectedBot) {
      setBotSelections((prev) => {
        const current = prev[selectedBot.name] || cloneCurrentSelections();
        return {
          ...prev,
          [selectedBot.name]: {
            ...current,
            symbols: Array.from(new Set([...(current.symbols || []), symbol]))
          }
        };
      });
    }
    setNewSymbol('');
    setNewSymbolStartDate('');
    setNewSymbolError('');
    setAddSymbolOpen(false);
    showMessage(`Added symbol ${symbol} with Start Date ${toInputDate(startDate)}.`, 'success');
  };

  const variableList = Object.entries(inputConfigs);
  const currentEndDateError = getEndDateValidationError(endDate);
  const currentTimeframeProfiles = Object.keys(savedBotsConfig[selectedBot?.name]?.userConfigsByTimeframe || {}).sort(
    (left, right) => INI_TIMEFRAMES.indexOf(left) - INI_TIMEFRAMES.indexOf(right)
  );
  const currentInputErrors = checkInputErrors();
  const retainedInputNames = new Set(retainedInputsByBot[selectedBot?.name] || []);
  const changedImportedInputNames = new Set(changedInputsByBot[selectedBot?.name] || []);
  const selectedBotErrors = configErrors.filter(
    (error) => getErrorTarget(error).botName === selectedBot?.name
  );

  const headCellSx = {
    py: 1.25,
    px: 1.5,
    fontSize: '0.72rem',
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
    color: isDark ? 'text.primary' : 'text.secondary',
    bgcolor: isDark ? '#1e293b' : '#f4f6f8',
    borderBottom: '1px solid',
    borderColor: isDark ? 'divider' : 'grey.200',
    zIndex: 10
  };

  const includedBotNameSet = new Set(includedBotNames);
  const includedConfiguredCount = includedBotNames.filter((botName) => Boolean(savedBotsConfig[botName])).length;
  const allBotsIncluded = bots.length > 0 && bots.every((bot) => includedBotNameSet.has(bot.name));
  const includedConfigErrors = configErrors.filter((error) => includedBotNameSet.has(getErrorTarget(error).botName));
  const botErrorCounts = configErrors.reduce((counts, error) => {
    const { botName } = getErrorTarget(error);
    if (botName) counts[botName] = (counts[botName] || 0) + 1;
    return counts;
  }, {});

  return (
    <Stack spacing={2.5} sx={{ width: '100%' }}>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button
          variant={workspaceMode === 'generate' ? 'contained' : 'outlined'}
          startIcon={<BuildOutlined />}
          onClick={() => setWorkspaceMode('generate')}
          sx={{ textTransform: 'none', fontWeight: 700 }}
        >
          Generate from Bot Folder
        </Button>
        <Button
          variant={workspaceMode === 'edit' ? 'contained' : 'outlined'}
          startIcon={<SettingOutlined />}
          onClick={() => setWorkspaceMode('edit')}
          sx={{ textTransform: 'none', fontWeight: 700 }}
        >
          Edit Existing INI
        </Button>
      </Box>

      <Box sx={{ display: workspaceMode === 'edit' ? 'block' : 'none' }}>
        <IniArchiveEditor symbolsData={symbolsData} />
      </Box>
      {workspaceMode === 'generate' && (
      <>
      {/* ── Top Side: Bot Manager Dashboard ── */}
      <MainCard
        title={
          <Stack direction="row" spacing={1} alignItems="center">
            <FolderOpenOutlined style={{ color: theme.palette.primary.main, fontSize: 18 }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Bot Configuration Manager
            </Typography>
            <Tooltip title="Auto Fix rules">
              <IconButton
                size="small"
                aria-label="Show Auto Fix rules"
                onClick={() => setAutoFixHelpOpen(true)}
                sx={{ color: 'text.secondary', p: 0.25, '&:hover': { color: 'primary.main' } }}
              >
                <QuestionCircleOutlined />
              </IconButton>
            </Tooltip>
          </Stack>
        }
        subheader={`Uploaded Bots: ${bots.length} | Configured Bots: ${Object.keys(savedBotsConfig).length}`}
        secondary={
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
            <Button
              variant="outlined"
              color="primary"
              component="label"
              size="small"
              startIcon={<FolderOpenOutlined />}
              sx={{ height: 32, textTransform: 'none', fontSize: '0.8rem', fontWeight: 600, borderRadius: 1.25 }}
            >
              Upload Bot Folder
              <input ref={folderInputRef} type="file" multiple hidden onChange={uploadBots} />
            </Button>

            {bots.length > 0 && (
              <Button
                variant={allBotsIncluded ? 'outlined' : 'contained'}
                color={allBotsIncluded ? 'error' : 'success'}
                size="small"
                startIcon={allBotsIncluded ? <CloseOutlined /> : <CheckCircleOutlined />}
                onClick={toggleAllBots}
                sx={{ height: 32, textTransform: 'none', fontSize: '0.8rem', fontWeight: 600, borderRadius: 1.25 }}
              >
                {allBotsIncluded ? 'Deselect All Bots' : 'Select All Bots'}
              </Button>
            )}

            {bots.length > 0 && (
              <Button
                variant="outlined"
                color="error"
                size="small"
                startIcon={<ClearOutlined />}
                onClick={() => {
                  setBots([]);
                  setSelectedBot(null);
                  setActiveInputProfile('');
                  setInputConfigs({});
                  setSavedBotsConfig({});
                  setIncludedBotNames([]);
                  setBotSelections({});
                  setRetainedInputsByBot({});
                  setChangedInputsByBot({});
                  setAutoFixedInputsByBot({});
                  setConfigErrors([]);
                  setConfirmOpen(false);
                  Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
                  showMessage('Cleared all uploaded bots', 'info');
                }}
                sx={{ height: 32, textTransform: 'none', fontSize: '0.8rem', fontWeight: 600, borderRadius: 1.25 }}
              >
                Clear All
              </Button>
            )}

            {Object.keys(savedBotsConfig).length > 0 && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<SettingOutlined />}
                onClick={autoFixSavedConfigs}
                sx={{
                  height: 32,
                  textTransform: 'none',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  borderRadius: 1.25,
                  color: isDark ? '#d3adf7' : '#722ed1',
                  borderColor: isDark ? '#b37feb' : '#722ed1',
                  bgcolor: 'transparent',
                  '&:hover': {
                    borderColor: isDark ? '#d3adf7' : '#531dab',
                    bgcolor: isDark ? 'rgba(114, 46, 209, 0.16)' : '#f9f0ff'
                  }
                }}
              >
                Auto Fix
              </Button>
            )}

            {includedConfiguredCount > 0 && (
              <Button
                variant="contained"
                color="primary"
                size="small"
                startIcon={<BuildOutlined />}
                onClick={generateAllConfigsHandler}
                sx={{ height: 32, textTransform: 'none', fontSize: '0.8rem', fontWeight: 600, borderRadius: 1.25 }}
              >
                Create All Configs ({includedConfiguredCount})
              </Button>
            )}
          </Stack>
        }
      >
        {bots.length === 0 ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px dashed',
              borderColor: 'divider',
              borderRadius: 1.5,
              py: 5,
              bgcolor: isDark ? alpha(theme.palette.common.white, 0.02) : 'grey.50'
            }}
          >
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
              No bots uploaded yet. Click "Upload Bot Folder" to select your .mq5 expert advisors.
            </Typography>
          </Box>
        ) : (
          <Stack>
            <Grid container spacing={1.5}>
              {bots.map((bot, idx) => {
              const isActive = selectedBot?.name === bot.name;
              const isIncluded = includedBotNameSet.has(bot.name);
              const errorCount = botErrorCounts[bot.name] || 0;
              const hasConfigError = errorCount > 0;
              const firstErrorProfile = getErrorTarget(
                configErrors.find((error) => getErrorTarget(error).botName === bot.name) || ''
              ).timeframe;
              const changedInputNames = changedInputsByBot[bot.name] || [];
              const retainedInputNamesForBot = retainedInputsByBot[bot.name] || [];
              const autoFixedCount = Object.values(autoFixedInputsByBot[bot.name] || {}).reduce(
                (total, profileInputs) => total + Object.keys(profileInputs || {}).length,
                0
              );
              const hasAutoFix = autoFixedCount > 0;
              return (
                <Grid key={idx} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                  <Box
                    onClick={() => selectBot(idx, firstErrorProfile)}
                    sx={{
                      p: 1.5,
                      borderRadius: 1.25,
                      cursor: 'pointer',
                      bgcolor: hasConfigError
                        ? isDark
                          ? 'rgba(255, 77, 79, 0.14)'
                          : '#fff1f0'
                        : hasAutoFix
                        ? isDark
                          ? 'rgba(114, 46, 209, 0.2)'
                          : '#f9f0ff'
                        : isActive
                        ? isDark
                          ? 'rgba(22, 119, 255, 0.18)'
                          : '#e6f4ff'
                        : isIncluded
                        ? isDark
                          ? 'rgba(82, 196, 26, 0.18)'
                          : '#f6ffed'
                        : isDark
                        ? 'background.paper'
                        : '#ffffff',
                      border: '1px solid',
                      borderColor: hasConfigError
                        ? 'error.main'
                        : hasAutoFix
                        ? isDark
                          ? '#b37feb'
                          : '#722ed1'
                        : isActive
                        ? 'primary.main'
                        : isIncluded
                        ? 'success.main'
                        : isDark
                        ? 'divider'
                        : '#e2e8f0',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      transition: 'all 0.2s ease',
                      '&:hover': {
                        borderColor: hasConfigError
                          ? 'error.main'
                          : hasAutoFix
                          ? isDark
                            ? '#d3adf7'
                            : '#531dab'
                          : isActive
                          ? 'primary.main'
                          : isIncluded
                          ? 'success.main'
                          : 'primary.light',
                        transform: 'translateY(-1px)'
                      }
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: 1 }}>
                      <FileTextOutlined
                        style={{
                          fontSize: 16,
                          color: hasConfigError
                            ? theme.palette.error.main
                            : hasAutoFix
                            ? isDark
                              ? '#d3adf7'
                              : '#722ed1'
                            : isActive
                            ? theme.palette.primary.main
                            : isIncluded
                            ? theme.palette.success.main
                            : theme.palette.text.secondary,
                          flexShrink: 0
                        }}
                      />
                      <Typography
                        variant="body2"
                        sx={{
                          fontFamily: 'monospace',
                          fontSize: '0.8rem',
                          fontWeight: isActive ? 700 : 500,
                          color: hasConfigError
                            ? theme.palette.error.main
                            : hasAutoFix
                            ? isDark
                              ? '#d3adf7'
                              : '#722ed1'
                            : isActive
                            ? theme.palette.primary.main
                            : isIncluded
                            ? theme.palette.success.main
                            : 'text.primary',
                          textOverflow: 'ellipsis',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap'
                        }}
                        title={bot.name}
                      >
                        {bot.name}
                      </Typography>
                      {hasConfigError && (
                        <Box
                          component="span"
                          title={`${errorCount} configuration error${errorCount > 1 ? 's' : ''}`}
                          sx={{
                            px: 0.65,
                            py: 0.15,
                            borderRadius: 0.75,
                            bgcolor: 'error.main',
                            color: 'error.contrastText',
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            lineHeight: 1.4,
                            flexShrink: 0
                          }}
                        >
                          {errorCount} ERROR{errorCount > 1 ? 'S' : ''}
                        </Box>
                      )}
                      {hasAutoFix && !hasConfigError && (
                        <Box
                          component="span"
                          title={`${autoFixedCount} input${autoFixedCount > 1 ? 's' : ''} repaired by Auto Fix`}
                          sx={{
                            px: 0.65,
                            py: 0.15,
                            borderRadius: 0.75,
                            bgcolor: isDark ? '#b37feb' : '#722ed1',
                            color: 'common.white',
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            lineHeight: 1.4,
                            flexShrink: 0
                          }}
                        >
                          {autoFixedCount} AUTO FIX
                        </Box>
                      )}
                      {changedInputNames.length > 0 && (
                        <Tooltip title={`${changedInputNames.length} input value/range change(s) - click to inspect`}>
                          <Button
                            size="small"
                            aria-label={`Inspect ${changedInputNames.length} changed inputs for ${bot.name}`}
                            onClick={(event) => openBotImportAudit(event, idx, changedInputNames)}
                            sx={{ minWidth: 26, width: 26, height: 26, p: 0, color: 'primary.main', flexShrink: 0 }}
                          >
                            <BuildOutlined />
                          </Button>
                        </Tooltip>
                      )}
                      {retainedInputNamesForBot.length > 0 && (
                        <Tooltip title={`${retainedInputNamesForBot.length} MQ5 input(s) kept because they were absent from INI - click to inspect`}>
                          <Button
                            size="small"
                            aria-label={`Inspect ${retainedInputNamesForBot.length} retained inputs for ${bot.name}`}
                            onClick={(event) => openBotImportAudit(event, idx, retainedInputNamesForBot)}
                            sx={{ minWidth: 26, width: 26, height: 26, p: 0, color: 'warning.main', flexShrink: 0 }}
                          >
                            <ExclamationCircleOutlined />
                          </Button>
                        </Tooltip>
                      )}
                    </Box>

                    <Tooltip title={isIncluded ? 'Exclude this bot from generated configs' : 'Include this bot with saved/default configuration'}>
                      <Checkbox
                        size="small"
                        color="success"
                        checked={isIncluded}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => toggleBotIncluded(bot)}
                        inputProps={{ 'aria-label': `${isIncluded ? 'Exclude' : 'Include'} ${bot.name}` }}
                        sx={{ ml: 0.75, p: 0.25, flexShrink: 0 }}
                      />
                    </Tooltip>
                  </Box>
                </Grid>
              );
              })}
            </Grid>
          </Stack>
        )}
      </MainCard>

      <Snackbar
        open={Boolean(message)}
        autoHideDuration={5000}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        onClose={(_, reason) => {
          if (reason !== 'clickaway') setMessage(null);
        }}
        sx={{ mt: { xs: 7, sm: 8 }, maxWidth: { xs: 'calc(100vw - 24px)', sm: 520 } }}
      >
        <Alert
          severity={message?.type || 'info'}
          variant="filled"
          onClose={() => setMessage(null)}
          sx={{ width: '100%', borderRadius: 1.5, boxShadow: 6 }}
        >
          {message?.text}
        </Alert>
      </Snackbar>

      {/* ── Bottom Side: Configuration Detail ── */}
      {selectedBot ? (
        <Box id="ini-input-configuration" sx={{ scrollMarginTop: 16 }}>
        <MainCard
          title={
            <Stack direction="row" spacing={1} alignItems="center">
              <SettingOutlined style={{ color: theme.palette.primary.main, fontSize: 18 }} />
              <Typography variant="h5" sx={{ fontWeight: 600 }}>
                Input Configuration - {selectedBot.name}
              </Typography>
            </Stack>
          }
          secondary={
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
              <input ref={botIniInputRef} type="file" accept=".ini,.zip" multiple hidden onChange={importIniForSelectedBot} />
              <input ref={botIniFolderInputRef} type="file" accept=".ini" multiple hidden onChange={importIniForMultipleBots} />
              <Tooltip title="Merge INI values only into the bot currently shown below">
                <Button
                  variant="contained"
                  color="primary"
                  size="small"
                  startIcon={<UploadOutlined />}
                  onClick={() => botIniInputRef.current?.click()}
                  disabled={iniImporting}
                  sx={{ textTransform: 'none', fontWeight: 600, whiteSpace: 'nowrap' }}
                >
                  {iniImporting ? 'Reading INI...' : 'Import for This Bot'}
                </Button>
              </Tooltip>
              <Tooltip title="Read multiple bot folders, group INI files by Bot ID and save each matching bot configuration">
                <Button
                  variant="contained"
                  color="primary"
                  size="small"
                  startIcon={<FolderOpenOutlined />}
                  onClick={() => botIniFolderInputRef.current?.click()}
                  disabled={iniImporting}
                  sx={{ textTransform: 'none', fontWeight: 600, whiteSpace: 'nowrap' }}
                >
                  Import for Multiple Bots
                </Button>
              </Tooltip>
              <Tooltip title="Copy the current bot's Symbol, Timeframe and Mode selections to every uploaded bot">
                <Button
                  variant="contained"
                  color="primary"
                  size="small"
                  onClick={applyCurrentSelectionsToAllBots}
                  sx={{ textTransform: 'none', fontWeight: 600, whiteSpace: 'nowrap' }}
                >
                  Apply Selections to All {bots.length} Bots
                </Button>
              </Tooltip>
            </Stack>
          }
        >
          {/* Bot Selections: Symbol, Timeframe, Mode */}
          {selectedBotErrors.length > 0 && (
            <Alert severity="error" sx={{ mb: 2 }}>
              <Stack spacing={0.25}>
                {selectedBotErrors.map((error) => (
                  <Typography key={error} variant="caption" component="div">
                    {error}
                  </Typography>
                ))}
              </Stack>
            </Alert>
          )}
          {currentTimeframeProfiles.length > 1 && (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600 }}>
                Input Profile
              </Typography>
              {currentTimeframeProfiles.map((timeframe) => (
                <Button
                  key={timeframe}
                  size="small"
                  variant={activeInputProfile === timeframe ? 'contained' : 'outlined'}
                  onClick={() => selectInputProfile(timeframe)}
                  sx={{ minWidth: 54, fontWeight: 700 }}
                >
                  {timeframe}
                </Button>
              ))}
              <Typography variant="caption" color="text.secondary">
                Each timeframe uses its own imported optimization inputs.
              </Typography>
            </Stack>
          )}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Box
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1.5,
                  p: 1.75,
                  height: '100%',
                  bgcolor: isDark ? alpha(theme.palette.common.white, 0.02) : 'grey.50'
                }}
              >
                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 1 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                    Select Symbols
                  </Typography>
                  <Stack direction="row" spacing={0.75}>
                    <Button
                      size="small"
                      color="error"
                      startIcon={<ClearOutlined />}
                      disabled={!botSelections[selectedBot.name]?.symbols?.length}
                      onClick={() => {
                        setBotSelections((prev) => ({
                          ...prev,
                          [selectedBot.name]: {
                            ...prev[selectedBot.name],
                            symbols: []
                          }
                        }));
                      }}
                      sx={{ minWidth: 0, px: 1, textTransform: 'none', fontWeight: 600 }}
                    >
                      Clear
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<PlusOutlined />}
                      onClick={() => {
                        setNewSymbolError('');
                        setAddSymbolOpen(true);
                      }}
                      sx={{ minWidth: 0, px: 1, textTransform: 'none', fontWeight: 600 }}
                    >
                      Add Symbol
                    </Button>
                    <SymbolStartDateManager
                      symbolsData={symbolsData}
                      endDate={endDate}
                      startDates={symbolTimeframeStartDates}
                      setStartDates={setSymbolTimeframeStartDates}
                    />
                  </Stack>
                </Stack>
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  label="End Date"
                  value={toInputDate(endDate)}
                  onChange={(event) => setEndDate(toMt5Date(event.target.value))}
                  error={Boolean(currentEndDateError)}
                  helperText={currentEndDateError || `Maximum: ${MAX_END_DATE_INPUT}`}
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ min: MIN_END_DATE_INPUT, max: MAX_END_DATE_INPUT }}
                  sx={{ mb: 1.25 }}
                />
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {Object.keys(symbolsData).map((symbol) => {
                    const isChecked =
                      botSelections[selectedBot.name]?.symbols?.includes(symbol) ?? Object.keys(symbolsData).includes(symbol);
                    return (
                      <Tooltip
                        key={symbol}
                        title={INI_TIMEFRAMES.map(
                          (timeframe) => `${timeframe}: ${toInputDate(getSymbolStartDate(symbol, timeframe))}`
                        ).join(' | ')}
                      >
                        <FormControlLabel
                          control={
                            <Checkbox
                              size="small"
                              checked={isChecked}
                              onChange={(e) => {
                                setBotSelections((prev) => ({
                                  ...prev,
                                  [selectedBot.name]: {
                                    ...prev[selectedBot.name],
                                    symbols: e.target.checked
                                      ? Array.from(new Set([...(prev[selectedBot.name]?.symbols || Object.keys(symbolsData)), symbol]))
                                      : (prev[selectedBot.name]?.symbols || Object.keys(symbolsData)).filter((s) => s !== symbol)
                                  }
                                }));
                              }}
                            />
                          }
                          label={<Typography variant="caption" sx={{ fontWeight: 600 }}>{symbol}</Typography>}
                          sx={{ m: 0 }}
                        />
                      </Tooltip>
                    );
                  })}
                </Box>
              </Box>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <Box
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1.5,
                  p: 1.75,
                  height: '100%',
                  bgcolor: isDark ? alpha(theme.palette.common.white, 0.02) : 'grey.50'
                }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary', mb: 1 }}>
                  Select Timeframes
                </Typography>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  {INI_TIMEFRAMES.map((tf) => {
                    const isChecked =
                      botSelections[selectedBot.name]?.timeframes.includes(tf) ?? ['H1', 'H4'].includes(tf);
                    return (
                      <FormControlLabel
                        key={tf}
                        control={
                          <Checkbox
                            size="small"
                            checked={isChecked}
                            onChange={(e) => {
                              setBotSelections((prev) => ({
                                ...prev,
                                [selectedBot.name]: {
                                  ...prev[selectedBot.name],
                                  timeframes: e.target.checked
                                    ? [...(prev[selectedBot.name]?.timeframes || ['H1', 'H4']), tf]
                                    : (prev[selectedBot.name]?.timeframes || ['H1', 'H4']).filter((t) => t !== tf)
                                }
                              }));
                            }}
                          />
                        }
                        label={<Typography variant="body2" sx={{ fontWeight: 600 }}>{tf}</Typography>}
                        sx={{ m: 0 }}
                      />
                    );
                  })}
                </Box>
              </Box>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <Box
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1.5,
                  p: 1.75,
                  height: '100%',
                  bgcolor: isDark ? alpha(theme.palette.common.white, 0.02) : 'grey.50'
                }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary', mb: 1 }}>
                  Select Modes
                </Typography>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  {['Buy', 'Sell'].map((mode) => {
                    const isChecked =
                      botSelections[selectedBot.name]?.modes.includes(mode) ?? ['Buy', 'Sell'].includes(mode);
                    return (
                      <FormControlLabel
                        key={mode}
                        control={
                          <Checkbox
                            size="small"
                            checked={isChecked}
                            onChange={(e) => {
                              setBotSelections((prev) => ({
                                ...prev,
                                [selectedBot.name]: {
                                  ...prev[selectedBot.name],
                                  modes: e.target.checked
                                    ? [...(prev[selectedBot.name]?.modes || ['Buy', 'Sell']), mode]
                                    : (prev[selectedBot.name]?.modes || ['Buy', 'Sell']).filter((m) => m !== mode)
                                }
                              }));
                            }}
                          />
                        }
                        label={<Typography variant="body2" sx={{ fontWeight: 600 }}>{mode}</Typography>}
                        sx={{ m: 0 }}
                      />
                    );
                  })}
                </Box>
              </Box>
            </Grid>
          </Grid>

          {/* Variable Configuration Table */}
          <TableContainer
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1.5,
              mb: 2,
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              maxHeight: '55vh'
            }}
          >
            <Table size="small" stickyHeader sx={{ minWidth: 650 }}>
              <TableHead>
                <TableRow>
                  <TableCell align="center" width="60" sx={headCellSx}>
                    OPT
                  </TableCell>
                  <TableCell sx={headCellSx}>VARIABLE</TableCell>
                  <TableCell sx={headCellSx} width="140">
                    VALUE
                  </TableCell>
                  <TableCell sx={headCellSx} width="130">
                    START
                  </TableCell>
                  <TableCell sx={headCellSx} width="110">
                    STEP
                  </TableCell>
                  <TableCell sx={headCellSx} width="130">
                    STOP
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {variableList.map(([name, cfg]) => {
                  const enumOpts = cfg.enumOptions || MT5_ENUMS[cfg.type] || null;
                  const isEnum = cfg.isEnum && Boolean(enumOpts?.length);
                  const retainedFromMq5 = retainedInputNames.has(name);
                  const changedFromIni = changedImportedInputNames.has(name);
                  const autoFixedReason = autoFixedInputsByBot[selectedBot?.name]?.[activeInputProfile || 'default']?.[name] || '';

                  const inputErrorMsg = currentInputErrors[name];
                  const hasError = !!inputErrorMsg;
                  const valueIsEmpty =
                    !cfg.optimize &&
                    (cfg.value === undefined || cfg.value === null || String(cfg.value).trim() === '' || !isValidEnumConfigValue(cfg));
                  const startIsEmpty = cfg.optimize && (cfg.min === undefined || cfg.min === null || String(cfg.min).trim() === '');
                  const stepIsEmpty = cfg.optimize && (cfg.step === undefined || cfg.step === null || String(cfg.step).trim() === '');
                  const stopIsEmpty = cfg.optimize && (cfg.max === undefined || cfg.max === null || String(cfg.max).trim() === '');
                  const hasRangeError = cfg.optimize && hasError && !startIsEmpty && !stepIsEmpty && !stopIsEmpty;

                  const isValNumber = isNumeric(cfg.value);
                  const valueCell = isEnum && enumOpts ? (
                    <FormControl size="small" fullWidth error={valueIsEmpty}>
                      <MuiSelect
                        value={cfg.value ?? ''}
                        onChange={(e) => updateConfig(name, 'value', e.target.value)}
                        sx={{ '& .MuiSelect-select': { py: 0.75, px: 1, fontSize: '0.8rem' } }}
                      >
                        <MenuItem value="" sx={{ fontSize: '0.8rem' }}>
                          -- Select --
                        </MenuItem>
                        {enumOpts.map((o) => (
                          <MenuItem key={o.value} value={o.value} sx={{ fontSize: '0.8rem' }}>
                            {o.label}
                          </MenuItem>
                        ))}
                      </MuiSelect>
                    </FormControl>
                  ) : (
                    <TextField
                      type={isValNumber ? 'number' : 'text'}
                      size="small"
                      value={cfg.value || ''}
                      onChange={(e) => updateConfig(name, 'value', e.target.value)}
                      onKeyDown={
                        isValNumber
                          ? (e) => {
                              if (['e', 'E'].includes(e.key)) e.preventDefault();
                            }
                          : undefined
                      }
                      error={valueIsEmpty}
                      sx={{ '& .MuiInputBase-input': { py: 0.75, px: 1, fontSize: '0.8rem', fontFamily: 'monospace' } }}
                    />
                  );

                  const isMinNumber = isNumeric(cfg.min);
                  const startCell = isEnum && enumOpts ? (
                    <FormControl size="small" fullWidth error={startIsEmpty || hasRangeError}>
                      <MuiSelect
                        value={String(cfg.min)}
                        onChange={(e) => updateConfig(name, 'min', e.target.value)}
                        error={startIsEmpty || hasRangeError}
                        sx={{ '& .MuiSelect-select': { py: 0.75, px: 1, fontSize: '0.8rem' } }}
                      >
                        {enumOpts.map((o, i) => (
                          <MenuItem key={i} value={String(i)} sx={{ fontSize: '0.8rem' }}>
                            {o.label}
                          </MenuItem>
                        ))}
                      </MuiSelect>
                    </FormControl>
                  ) : (
                    <TextField
                      type={isMinNumber ? 'number' : 'text'}
                      size="small"
                      value={cfg.min}
                      onChange={(e) => updateConfig(name, 'min', e.target.value)}
                      onKeyDown={
                        isMinNumber
                          ? (e) => {
                              if (['e', 'E'].includes(e.key)) e.preventDefault();
                            }
                          : undefined
                      }
                      error={startIsEmpty || hasRangeError}
                      sx={{ '& .MuiInputBase-input': { py: 0.75, px: 1, fontSize: '0.8rem', fontFamily: 'monospace' } }}
                    />
                  );

                  const isMaxNumber = isNumeric(cfg.max);
                  const stopCell = isEnum && enumOpts ? (
                    <FormControl size="small" fullWidth error={stopIsEmpty || hasRangeError}>
                      <MuiSelect
                        value={String(cfg.max)}
                        onChange={(e) => updateConfig(name, 'max', e.target.value)}
                        error={stopIsEmpty || hasRangeError}
                        sx={{ '& .MuiSelect-select': { py: 0.75, px: 1, fontSize: '0.8rem' } }}
                      >
                        {enumOpts.map((o, i) => (
                          <MenuItem key={i} value={String(i)} sx={{ fontSize: '0.8rem' }}>
                            {o.label}
                          </MenuItem>
                        ))}
                      </MuiSelect>
                    </FormControl>
                  ) : (
                    <TextField
                      type={isMaxNumber ? 'number' : 'text'}
                      size="small"
                      value={cfg.max}
                      onChange={(e) => updateConfig(name, 'max', e.target.value)}
                      onKeyDown={
                        isMaxNumber
                          ? (e) => {
                              if (['e', 'E'].includes(e.key)) e.preventDefault();
                            }
                          : undefined
                      }
                      error={stopIsEmpty || hasRangeError}
                      sx={{ '& .MuiInputBase-input': { py: 0.75, px: 1, fontSize: '0.8rem', fontFamily: 'monospace' } }}
                    />
                  );

                  return (
                    <TableRow
                      key={name}
                      hover
                      sx={
                        autoFixedReason && !hasError
                          ? {
                              bgcolor: isDark ? 'rgba(114, 46, 209, 0.2)' : '#f9f0ff',
                              outline: `1px solid ${isDark ? '#b37feb' : '#722ed1'}`,
                              outlineOffset: '-1px',
                              '&:hover': { bgcolor: isDark ? 'rgba(114, 46, 209, 0.28)' : '#efdbff' }
                            }
                          : retainedFromMq5
                          ? {
                              bgcolor: alpha(theme.palette.warning.main, isDark ? 0.16 : 0.1),
                              outline: `1px solid ${theme.palette.warning.main}`,
                              outlineOffset: '-1px',
                              '&:hover': { bgcolor: alpha(theme.palette.warning.main, isDark ? 0.22 : 0.16) }
                            }
                          : changedFromIni
                          ? {
                              bgcolor: alpha(theme.palette.primary.main, isDark ? 0.13 : 0.07),
                              outline: `1px solid ${theme.palette.primary.main}`,
                              outlineOffset: '-1px',
                              '&:hover': { bgcolor: alpha(theme.palette.primary.main, isDark ? 0.2 : 0.12) }
                            }
                          : undefined
                      }
                    >
                      <TableCell align="center" sx={{ py: 0.5 }}>
                        <Checkbox
                          size="small"
                          checked={cfg.optimize}
                          onChange={(e) => updateConfig(name, 'optimize', e.target.checked)}
                        />
                      </TableCell>
                      <TableCell sx={{ py: 1 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: hasError
                              ? 'error.main'
                              : autoFixedReason
                              ? isDark
                                ? '#d3adf7'
                                : '#722ed1'
                              : retainedFromMq5
                              ? 'warning.main'
                              : changedFromIni
                              ? isDark
                                ? 'common.white'
                                : 'primary.main'
                              : 'text.primary',
                            fontFamily: 'monospace'
                          }}
                        >
                          {name}
                        </Typography>
                        {hasError && (
                          <Typography
                            variant="caption"
                            sx={{ display: 'block', color: 'error.main', fontSize: '0.68rem', lineHeight: 1.2, mt: 0.25 }}
                          >
                            {inputErrorMsg}
                          </Typography>
                        )}
                        {autoFixedReason && !hasError && (
                          <Typography
                            variant="caption"
                            sx={{ display: 'block', color: isDark ? '#d3adf7' : '#722ed1', fontSize: '0.68rem', lineHeight: 1.2, mt: 0.25 }}
                          >
                            {autoFixedReason}
                          </Typography>
                        )}
                        {retainedFromMq5 && !hasError && !autoFixedReason && (
                          <Typography
                            variant="caption"
                            sx={{ display: 'block', color: 'warning.main', fontSize: '0.68rem', lineHeight: 1.2, mt: 0.25 }}
                          >
                            Kept from MQ5 - not found in imported INI
                          </Typography>
                        )}
                        {changedFromIni && !hasError && !autoFixedReason && (
                          <Typography
                            variant="caption"
                            sx={{
                              display: 'block',
                              color: isDark ? 'common.white' : 'primary.main',
                              fontSize: '0.68rem',
                              lineHeight: 1.2,
                              mt: 0.25
                            }}
                          >
                            Overridden by imported INI
                          </Typography>
                        )}
                        <Typography
                          variant="caption"
                          sx={{
                            display: 'block',
                            color: isEnum ? theme.palette.success.main : 'text.secondary',
                            fontSize: '0.7rem'
                          }}
                        >
                          {cfg.type}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ py: 0.5 }}>{valueCell}</TableCell>
                      <TableCell sx={{ py: 0.5 }}>{startCell}</TableCell>
                      <TableCell sx={{ py: 0.5 }}>
                        <TextField
                          type="number"
                          size="small"
                          value={cfg.step}
                          onChange={(e) => updateConfig(name, 'step', e.target.value)}
                          onKeyDown={(e) => {
                            if (['e', 'E'].includes(e.key)) e.preventDefault();
                          }}
                          disabled={isEnum}
                          error={stepIsEmpty || hasRangeError}
                          sx={{
                            '& .MuiInputBase-input': { py: 0.75, px: 1, fontSize: '0.8rem', fontFamily: 'monospace' },
                            opacity: isEnum ? 0.5 : 1
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ py: 0.5 }}>{stopCell}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Controls */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="center" justifyContent="space-between">
            <Stack direction="row" spacing={1}>
              <Button
                variant="outlined"
                onClick={() => setAllOptimize(true)}
                startIcon={<CheckCircleOutlined />}
                size="small"
                sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 1.25 }}
              >
                Optimize All
              </Button>
              <Button
                variant="outlined"
                onClick={() => setAllOptimize(false)}
                startIcon={<CloseOutlined />}
                size="small"
                sx={{
                  textTransform: 'none',
                  fontWeight: 600,
                  borderRadius: 1.25,
                  bgcolor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'grey.100',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.35)' : 'grey.300',
                  color: isDark ? '#ffffff' : 'text.primary',
                  '&:hover': {
                    borderColor: isDark ? '#ffffff' : 'text.primary',
                    bgcolor: isDark ? 'rgba(255, 255, 255, 0.16)' : 'grey.200',
                    color: isDark ? '#ffffff' : 'text.primary'
                  }
                }}
              >
                Don't Optimize All
              </Button>
            </Stack>

            <Button
              variant="contained"
              color="success"
              onClick={saveAndNextBot}
              startIcon={<SaveOutlined />}
              size="small"
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                borderRadius: 1.25,
                bgcolor: '#52c41a',
                '&:hover': { bgcolor: '#389e0d' }
              }}
            >
              Save Configuration
            </Button>
          </Stack>
        </MainCard>
        </Box>
      ) : (
        <Paper
          variant="outlined"
          sx={{
            p: 5,
            textAlign: 'center',
            color: 'text.secondary',
            bgcolor: isDark ? alpha(theme.palette.common.white, 0.02) : 'grey.50',
            border: '1px dashed',
            borderColor: 'divider',
            borderRadius: 1.5
          }}
        >
          <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
            Select a bot from the panel above to configure parameters and optimization ranges.
          </Typography>
        </Paper>
      )}

      <Dialog open={autoFixHelpOpen} onClose={() => setAutoFixHelpOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 700 }}>
          <QuestionCircleOutlined /> Auto Fix Configuration Rules
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75, color: isDark ? '#d3adf7' : '#722ed1' }}>
                Auto Fix can repair
              </Typography>
              <Stack spacing={0.65}>
                <Typography variant="body2">• Missing or invalid Value when OPT is disabled, using the MQ5 default.</Typography>
                <Typography variant="body2">• Boolean values represented as 0/1, normalized to false/true.</Typography>
                <Typography variant="body2">• Missing or invalid enum Start/Stop, using the enum range declared in MQ5.</Typography>
                <Typography variant="body2">• Missing Step, using the enum or numeric input type.</Typography>
              </Stack>
            </Box>
            <Alert severity="warning" variant="outlined">
              Numeric Start/Stop ranges, missing OPT selections and strategy-specific values are not guessed. They remain red and require manual review.
            </Alert>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
                Result indicators
              </Typography>
              <Stack spacing={0.65}>
                <Typography variant="body2" sx={{ color: isDark ? '#d3adf7' : '#722ed1' }}>
                  • Purple: repaired safely by Auto Fix.
                </Typography>
                <Typography variant="body2" color="error.main">• Red: still invalid and requires manual correction.</Typography>
                <Typography variant="body2" color="warning.main">• Yellow: kept from MQ5 because the imported INI did not contain it.</Typography>
              </Stack>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setAutoFixHelpOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(iniImportChoice)} onClose={() => setIniImportChoice(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Select Representative INI Configuration</DialogTitle>
        <DialogContent dividers>
          <DialogContentText sx={{ mb: 2 }}>
            Bot ID {iniImportChoice?.botId} has {iniImportChoice?.totalFiles || 0} matching files with{' '}
            {iniImportChoice?.variants?.length || 0} different input configurations. Select the configuration to merge.
          </DialogContentText>
          <FormControl fullWidth size="small">
            <MuiSelect value={selectedIniVariant} onChange={(event) => setSelectedIniVariant(Number(event.target.value))}>
              {(iniImportChoice?.variants || []).map((variant, index) => (
                <MenuItem key={`${variant.fileName}-${index}`} value={index}>
                  {variant.fileName} ({variant.count} file{variant.count === 1 ? '' : 's'})
                </MenuItem>
              ))}
            </MuiSelect>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIniImportChoice(null)}>Cancel</Button>
          <Button variant="contained" onClick={applySelectedIniVariant}>Merge Selected Configuration</Button>
        </DialogActions>
      </Dialog>

      {/* ── Confirm Dialog for Parameter Errors ── */}
      <Dialog
        open={addSymbolOpen}
        onClose={() => setAddSymbolOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 1.5,
            bgcolor: isDark ? '#1e2632' : '#ffffff',
            backgroundImage: 'none',
            border: '1px solid',
            borderColor: 'divider'
          }
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 700 }}>
          <PlusOutlined /> Add Symbol
        </DialogTitle>
        <DialogContent dividers sx={{ borderColor: 'divider' }}>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <TextField
              autoFocus
              fullWidth
              size="small"
              label="Symbol"
              placeholder="Example: US30 or XAUUSD.a"
              value={newSymbol}
              error={Boolean(newSymbolError)}
              onChange={(event) => {
                setNewSymbol(event.target.value.toUpperCase());
                setNewSymbolError('');
              }}
              InputLabelProps={{ shrink: true }}
              inputProps={{
                style: { lineHeight: 'normal' }
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  alignItems: 'center'
                },
                '& .MuiOutlinedInput-input': {
                  lineHeight: 'normal',
                  '&::placeholder': {
                    opacity: 0.65,
                    lineHeight: 'normal',
                    verticalAlign: 'middle'
                  }
                }
              }}
            />
            <TextField
              fullWidth
              size="small"
              type="date"
              label="Start Date"
              value={newSymbolStartDate}
              error={Boolean(newSymbolError)}
              helperText={newSymbolError || `Current End Date: ${toInputDate(endDate)}`}
              onChange={(event) => {
                setNewSymbolStartDate(event.target.value);
                setNewSymbolError('');
              }}
              InputLabelProps={{ shrink: true }}
              inputProps={{ max: toInputDate(endDate) }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleAddSymbol();
              }}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.5 }}>
          <Button variant="outlined" onClick={() => setAddSymbolOpen(false)}>Cancel</Button>
          <Button variant="contained" startIcon={<PlusOutlined />} onClick={handleAddSymbol}>Add Symbol</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2,
            bgcolor: isDark ? '#1e2632' : '#ffffff',
            backgroundImage: 'none',
            border: '1px solid',
            borderColor: 'divider',
            p: 1
          }
        }}
      >
        <DialogTitle sx={{ color: 'error.main', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          <ExclamationCircleOutlined /> Cảnh báo cấu hình tham số không hợp lệ
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Hệ thống phát hiện cấu hình tham số không hợp lệ. Vui lòng sửa toàn bộ lỗi bên dưới trước khi tạo file INI.
          </DialogContentText>
          <Box
            sx={{
              bgcolor: isDark ? 'rgba(255, 77, 79, 0.1)' : 'rgba(255, 77, 79, 0.05)',
              p: 2,
              borderRadius: 1.5,
              border: '1px solid',
              borderColor: isDark ? 'rgba(255, 77, 79, 0.3)' : 'rgba(255, 77, 79, 0.2)',
              maxHeight: 200,
              overflowY: 'auto'
            }}
          >
            {includedConfigErrors.map((err, i) => (
              <Button
                key={i}
                color="error"
                fullWidth
                onClick={() => openBotFromError(err)}
                sx={{
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  textTransform: 'none',
                  mb: i === includedConfigErrors.length - 1 ? 0 : 0.5,
                  px: 0.75,
                  py: 0.5,
                  fontFamily: 'monospace',
                  fontSize: '0.72rem',
                  lineHeight: 1.35
                }}
              >
                • {err}
              </Button>
            ))}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setConfirmOpen(false)}
            variant="outlined"
            size="small"
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 1.25,
              bgcolor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'grey.100',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.35)' : 'grey.300',
              color: isDark ? '#ffffff' : 'text.primary',
              '&:hover': {
                borderColor: isDark ? '#ffffff' : 'text.primary',
                bgcolor: isDark ? 'rgba(255, 255, 255, 0.16)' : 'grey.200',
                color: isDark ? '#ffffff' : 'text.primary'
              }
            }}
          >
            Quay lại sửa cấu hình
          </Button>
        </DialogActions>
      </Dialog>
      </>
      )}
    </Stack>
  );
}
