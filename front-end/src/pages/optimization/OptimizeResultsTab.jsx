import { useEffect, useState, useMemo, useId, useRef, Fragment } from 'react';
import PropTypes from 'prop-types';

// material-ui
import { useTheme, alpha } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Menu from '@mui/material/Menu';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TablePagination from '@mui/material/TablePagination';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import OutlinedInput from '@mui/material/OutlinedInput';
import TextField from '@mui/material/TextField';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import Skeleton from '@mui/material/Skeleton';
import Paper from '@mui/material/Paper';
import Avatar from '@mui/material/Avatar';
import Checkbox from '@mui/material/Checkbox';
import Slider from '@mui/material/Slider';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Badge from '@mui/material/Badge';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';

// project imports
import MainCard from 'components/MainCard';
import { deleteMt5FilterPreference, getMt5FilterPreferences, getMt5ResultsState, getMt5ResultsSummary, getMt5SessionCleanupPreview, getRunningMt5BacktestCount, isMt5SessionNotFoundError, listMt5Results, purgeUnusedMt5Results, saveMt5FilterPreference, setMt5Watchlist, startMt5Backtest } from 'api/mt5Optimization';
import { mapMt5Result } from 'utils/mt5Optimization';
import { compareStrategyCodes } from 'utils/strategyNaming';

// assets - icons
import SearchOutlined from '@ant-design/icons/SearchOutlined';
import FilterOutlined from '@ant-design/icons/FilterOutlined';
import ClearOutlined from '@ant-design/icons/ClearOutlined';
import ReloadOutlined from '@ant-design/icons/ReloadOutlined';
import CheckCircleOutlined from '@ant-design/icons/CheckCircleOutlined';
import CloseCircleOutlined from '@ant-design/icons/CloseCircleOutlined';
import StarOutlined from '@ant-design/icons/StarOutlined';
import StarFilled from '@ant-design/icons/StarFilled';
import RocketOutlined from '@ant-design/icons/RocketOutlined';
import SlidersOutlined from '@ant-design/icons/SlidersOutlined';
import EyeOutlined from '@ant-design/icons/EyeOutlined';
import DownloadOutlined from '@ant-design/icons/DownloadOutlined';
import SettingOutlined from '@ant-design/icons/SettingOutlined';
import AimOutlined from '@ant-design/icons/AimOutlined';
import ThunderboltOutlined from '@ant-design/icons/ThunderboltOutlined';
import CloudServerOutlined from '@ant-design/icons/CloudServerOutlined';
import BarChartOutlined from '@ant-design/icons/BarChartOutlined';
import DownOutlined from '@ant-design/icons/DownOutlined';
import FolderOpenOutlined from '@ant-design/icons/FolderOpenOutlined';
import CopyOutlined from '@ant-design/icons/CopyOutlined';
import CheckOutlined from '@ant-design/icons/CheckOutlined';
import ExperimentOutlined from '@ant-design/icons/ExperimentOutlined';
import TrophyOutlined from '@ant-design/icons/TrophyOutlined';
import RightOutlined from '@ant-design/icons/RightOutlined';
import CheckSquareOutlined from '@ant-design/icons/CheckSquareOutlined';
import AppstoreOutlined from '@ant-design/icons/AppstoreOutlined';
import UnorderedListOutlined from '@ant-design/icons/UnorderedListOutlined';
import { Pointer } from 'lucide-react';

const DEFAULT_FILTER_RULES = {
  minProfit: '',
  minRecoveryFactor: '',
  trades: '',
  profitFactor: '',
  balanceDD: '',
  sharpeRatio: '',
  topN: '',
  clusterRadius: ''
};

const DEFAULT_TABLE_FILTERS = {
  search: '',
  symbol: 'ALL',
  strategy: 'ALL',
  status: 'ALL',
  backtestRuns: 'ALL'
};

const FILTER_PREFERENCE_SCOPE = 'optimization';

const RESULTS_ROWS_PER_PAGE_KEY = 'mt5_optimize_results_rows_per_page';
const RESULTS_PAGE_KEY_PREFIX = 'mt5_optimize_results_page:';
const ALLOWED_ROWS_PER_PAGE = [5, 10, 25, 50];

const getStoredResultsPage = () => {
  const activeSessionId = localStorage.getItem('mt5_active_session_id') || '';
  const storedPage = Number(sessionStorage.getItem(`${RESULTS_PAGE_KEY_PREFIX}${activeSessionId}`));
  return Number.isInteger(storedPage) && storedPage >= 0 ? storedPage : 0;
};

const getStoredResultsRowsPerPage = () => {
  const storedRows = Number(localStorage.getItem(RESULTS_ROWS_PER_PAGE_KEY));
  return ALLOWED_ROWS_PER_PAGE.includes(storedRows) ? storedRows : 10;
};

const FILTER_RULE_FIELDS = [
  { key: 'minProfit', label: 'Min Profit ($)', range: true },
  { key: 'minRecoveryFactor', label: 'Min Recovery Factor', range: true },
  { key: 'trades', label: 'Trades (Min - Max)', range: true, nonNegative: true },
  { key: 'profitFactor', label: 'Profit Factor (Min - Max)', range: true, nonNegative: true },
  { key: 'balanceDD', label: 'Equity DD % (Min - Max)', range: true, nonNegative: true, percent: true },
  { key: 'sharpeRatio', label: 'Sharpe Ratio (Min - Max)', range: true },
  { key: 'topN', label: 'Top N Results', integer: true, nonNegative: true, max: 50 },
  { key: 'clusterRadius', label: 'Cluster Radius (%)', nonNegative: true, percent: true, max: 50 }
];

const FILTER_NUMBER_PATTERN = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)';

const validateFilterRule = (field, rawValue) => {
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') return '';
  let value = String(rawValue).trim();
  if (field.percent && value.endsWith('%')) value = value.slice(0, -1).trim();
  const pattern = field.range
    ? new RegExp(`^(${FILTER_NUMBER_PATTERN})(?:\\s*-\\s*(${FILTER_NUMBER_PATTERN}))?$`)
    : new RegExp(`^(${field.integer ? '[+]?(?:\\d+)' : FILTER_NUMBER_PATTERN})$`);
  const match = value.match(pattern);
  if (!match) return field.range ? 'Use a number or min-max range.' : 'Enter a valid number.';
  const first = Number(match[1]);
  const second = match[2] === undefined ? null : Number(match[2]);
  if (field.nonNegative && (first < 0 || (second !== null && second < 0))) return 'Value cannot be negative.';
  if (field.max !== undefined && (first > field.max || (second !== null && second > field.max))) {
    return `Value cannot exceed ${field.max}.`;
  }
  if (second !== null && first > second) return 'Minimum cannot exceed maximum.';
  return '';
};

const normalizeFilterRules = (rules) => Object.fromEntries(
  FILTER_RULE_FIELDS.map((field) => {
    const value = String(rules[field.key] ?? '').trim();
    return [field.key, field.percent && value.endsWith('%') ? value.slice(0, -1).trim() : value];
  })
);

export default function OptimizeResultsTab() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  // State
  const [results, setResults] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const showCheckboxes = selectionMode || selectedIds.length > 0;
  const [candidateIds, setCandidateIds] = useState([]);
  const [filterRules, setFilterRules] = useState(DEFAULT_FILTER_RULES);
  const [appliedFilterRules, setAppliedFilterRules] = useState(DEFAULT_FILTER_RULES);
  const [filterRuleErrors, setFilterRuleErrors] = useState({});
  const [filterRulesOpen, setFilterRulesOpen] = useState(true);
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [applyingFilters, setApplyingFilters] = useState(false);
  const [startingCandidateIds, setStartingCandidateIds] = useState([]);
  const [viewMode, setViewMode] = useState('grouped'); // 'flat' | 'grouped'
  const [expandedStrategies, setExpandedStrategies] = useState({});
  const [strategySubRows, setStrategySubRows] = useState({});
  const [loadingSubRows, setLoadingSubRows] = useState({});
  const [loadingResults, setLoadingResults] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);

  // Table Filters State
  const [inputFilters, setInputFilters] = useState(DEFAULT_TABLE_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(DEFAULT_TABLE_FILTERS);

  // Pagination
  const [page, setPage] = useState(getStoredResultsPage);
  const [rowsPerPage, setRowsPerPage] = useState(getStoredResultsRowsPerPage);
  const [totalResults, setTotalResults] = useState(0);
  const [qualifiedCount, setQualifiedCount] = useState(0);
  const [summaryStats, setSummaryStats] = useState({
    total: null, qualified: null, strategies: null, symbols: null,
    symbolOptions: [], watchlist: null, runningBacktests: 0
  });

  // Dialogs
  const [reRunDialogOpen, setReRunDialogOpen] = useState(false);
  const [selectedResult, setSelectedResult] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [notification, setNotification] = useState(null);
  const [defaultFilterAnchorEl, setDefaultFilterAnchorEl] = useState(null);
  const [defaultFilterBusy, setDefaultFilterBusy] = useState(false);
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false);
  const [cleanupPreview, setCleanupPreview] = useState(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [purging, setPurging] = useState(false);
  const [cleanupDeleted, setCleanupDeleted] = useState(0);
  const [cleanupProgress, setCleanupProgress] = useState(0);
  const [cleanupError, setCleanupError] = useState('');
  const [bulkBacktestDialogOpen, setBulkBacktestDialogOpen] = useState(false);
  const [bulkBacktestIds, setBulkBacktestIds] = useState([]);
  const [bulkBacktestSubmitting, setBulkBacktestSubmitting] = useState(false);
  const cleanupStopRef = useRef(false);
  const [newResultVersion, setNewResultVersion] = useState(0);
  const resultsRequestIdRef = useRef(0);
  const loadedResultVersionRef = useRef(0);
  const loadedResultsOnceRef = useRef(false);
  const resultCursorsRef = useRef({ 0: null });
  const resultsAbortControllerRef = useRef(null);
  const autoRefreshInFlightRef = useRef(false);
  const paginationLockedRef = useRef(false);
  const skipNextResultsEffectRef = useRef(false);

  const [sessionId, setSessionId] = useState(() => localStorage.getItem('mt5_active_session_id') || '');

  useEffect(() => {
    if (!notification || applyingFilters) return undefined;
    const timer = window.setTimeout(() => {
      setNotification((current) => (current === notification ? null : current));
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [notification, applyingFilters]);

  const handleOpenCleanup = async () => {
    if (!sessionId) return;
    cleanupStopRef.current = false;
    setCleanupDialogOpen(true);
    setCleanupPreview(null);
    setCleanupDeleted(0);
    setCleanupProgress(0);
    setCleanupError('');
    setCleanupLoading(true);
    try {
      setCleanupPreview(await getMt5SessionCleanupPreview(sessionId));
    } catch (error) {
      setCleanupError(error.message || 'Unable to inspect optimization data.');
    } finally {
      setCleanupLoading(false);
    }
  };

  const handlePurgeUnusedResults = async () => {
    const total = Number(cleanupPreview?.purgeable_results || 0);
    if (!sessionId || total <= 0) return;
    cleanupStopRef.current = false;
    setPurging(true);
    setCleanupError('');
    let deleted = 0;
    try {
      while (!cleanupStopRef.current) {
        const result = await purgeUnusedMt5Results(sessionId, { chunk_size: 10000 });
        deleted += Number(result.deletedCount || 0);
        setCleanupDeleted(deleted);
        setCleanupProgress(result.completed ? 100 : Math.min(99, Math.round((deleted / total) * 100)));
        if (result.completed) {
          setNotification({ type: 'success', message: `Cleaned ${deleted.toLocaleString()} unused optimization result(s).` });
          await loadResults(sessionId, appliedFilterRules, 0, viewMode);
          setCleanupPreview(await getMt5SessionCleanupPreview(sessionId));
          setPage(0);
          window.dispatchEvent(new Event('mt5:results-updated'));
          break;
        }
      }
      if (cleanupStopRef.current) {
        setCleanupError('Cleanup paused safely. You can continue later.');
      }
    } catch (error) {
      setCleanupError(error.message || 'Failed to clean optimization results.');
    } finally {
      setPurging(false);
    }
  };

  const commitResultsListSnapshot = ({ rows, payload, targetPage, cursorSupported }) => {
    setResults(rows);
    setCandidateIds(rows.filter((row) => row.isCandidate).map((row) => row.id));
    const clusteredRows = Object.fromEntries(
      rows
        .filter((row) => Array.isArray(row.clusterRows) && row.clusterRows.length > 0)
        .map((row) => [row.strategy, row.clusterRows.map(mapMt5Result)])
    );
    setStrategySubRows(clusteredRows);
    setExpandedStrategies({});
    loadedResultVersionRef.current = Number(payload.sessionVersion) || 0;
    loadedResultsOnceRef.current = true;
    setNewResultVersion(0);
    if (targetPage === 0) resultCursorsRef.current = { 0: null };
    if (cursorSupported) {
      resultCursorsRef.current[targetPage + 1] = payload.nextCursor || null;
    }
  };

  const commitResultsSummarySnapshot = (summary) => {
    if (!summary) return;
    setTotalResults(summary.total ?? 0);
    setQualifiedCount(summary.qualifiedCount ?? 0);
    setSummaryStats({
      total: summary.summaryTotal ?? summary.total ?? 0,
      qualified: summary.summaryQualifiedCount ?? summary.qualifiedCount ?? 0,
      strategies: summary.strategyCount ?? null,
      symbols: summary.symbolCount ?? null,
      symbolOptions: Array.isArray(summary.symbolOptions) ? summary.symbolOptions : [],
      watchlist: summary.watchlistCount ?? null,
      runningBacktests: summary.runningBacktestCount ?? 0
    });
  };

  const commitResultsSnapshot = (snapshot) => {
    if (!snapshot) return;
    commitResultsListSnapshot(snapshot.list);
    commitResultsSummarySnapshot(snapshot.summary);
  };

  const loadResults = async (
    id = sessionId,
    activeRules = appliedFilterRules,
    targetPage = page,
    targetViewMode = viewMode,
    tableFilters = appliedFilters,
    options = {}
  ) => {
    const silent = options.silent === true;
    const skipSummary = options.skipSummary === true;
    const forceOffset = options.forceOffset === true;
    const deferCommit = options.deferCommit === true;
    const requestId = ++resultsRequestIdRef.current;
    if (!id) {
      resultsAbortControllerRef.current?.abort();
      resultCursorsRef.current = { 0: null };
      paginationLockedRef.current = false;
      loadedResultsOnceRef.current = false;
      loadedResultVersionRef.current = 0;
      setNewResultVersion(0);
      setResults([]);
      setTotalResults(0);
      setQualifiedCount(0);
      setLoadingResults(false);
      setLoadingSummary(false);
      setSummaryStats({
        total: null, qualified: null, strategies: null, symbols: null,
        symbolOptions: [], watchlist: null, runningBacktests: 0
      });
      return null;
    }

    const params = {
      session_id: id,
      page: targetPage + 1,
      page_size: rowsPerPage,
      search: tableFilters.search,
      symbol: tableFilters.symbol,
      strategy_id: tableFilters.strategy === 'ALL' ? null : tableFilters.strategy,
      state: tableFilters.status,
      backtest_runs: tableFilters.backtestRuns,
      view: watchlistOnly ? 'watchlist' : 'all',
      group_by: targetViewMode === 'grouped' ? 'strategy' : null,
      min_profit: activeRules.minProfit,
      min_recovery_factor: activeRules.minRecoveryFactor,
      trades: activeRules.trades,
      profit_factor: activeRules.profitFactor,
      balance_dd: activeRules.balanceDD,
      sharpe_ratio: activeRules.sharpeRatio,
      top_n: watchlistOnly ? null : activeRules.topN,
      cluster_radius: watchlistOnly ? null : activeRules.clusterRadius
    };
    const cursorSupported = watchlistOnly || (
      !(Number(activeRules.topN) > 0) && !(Number(activeRules.clusterRadius) > 0)
    );
    if (targetPage === 0 && !deferCommit) resultCursorsRef.current = { 0: null };
    const cursor = targetPage === 0
      ? null
      : cursorSupported && !forceOffset ? resultCursorsRef.current[targetPage] : null;

    resultsAbortControllerRef.current?.abort();
    const requestController = new AbortController();
    resultsAbortControllerRef.current = requestController;

    if (!silent) {
      setLoadingResults(true);
      if (targetPage === 0) setLoadingSummary(true);
    }

    try {
      const payload = await listMt5Results(
        { ...params, include_meta: false, cursor },
        { signal: requestController.signal }
      );
      if (requestId !== resultsRequestIdRef.current) return null;
      const rows = payload.items.map(mapMt5Result);
      const listSnapshot = { rows, payload, targetPage, cursorSupported };
      if (!deferCommit) commitResultsListSnapshot(listSnapshot);
      if (!silent && !deferCommit) setLoadingResults(false);

      if (targetPage !== 0 || skipSummary) {
        return { ...payload, uiSnapshot: { list: listSnapshot, summary: null } };
      }
      const summary = await getMt5ResultsSummary(params, { signal: requestController.signal });
      if (requestId !== resultsRequestIdRef.current) return null;
      if (!deferCommit) commitResultsSummarySnapshot(summary);
      return { ...payload, ...summary, uiSnapshot: { list: listSnapshot, summary } };
    } catch (error) {
      if (error?.name === 'AbortError') return null;
      if (error?.code === 'MT5_STALE_RESULT_CURSOR' && !forceOffset) {
        resultCursorsRef.current = { 0: null };
        return loadResults(id, activeRules, targetPage, targetViewMode, tableFilters, {
          ...options,
          forceOffset: true
        });
      }
      throw error;
    } finally {
      if (requestId === resultsRequestIdRef.current) {
        paginationLockedRef.current = false;
        if (!silent) {
          setLoadingResults(false);
          setLoadingSummary(false);
        }
      }
      if (resultsAbortControllerRef.current === requestController) resultsAbortControllerRef.current = null;
    }
  };

  useEffect(() => {
    const onSession = (event) => {
      const nextSessionId = event.detail?.sessionId || '';
      if (nextSessionId === sessionId) return;
      setPage(0);
      loadedResultVersionRef.current = 0;
      loadedResultsOnceRef.current = false;
      resultCursorsRef.current = { 0: null };
      setNewResultVersion(0);
      setSessionId(nextSessionId);
    };
    window.addEventListener('mt5:session-change', onSession);
    if (skipNextResultsEffectRef.current) {
      skipNextResultsEffectRef.current = false;
    } else {
      loadResults(sessionId, appliedFilterRules, page, viewMode).catch((error) => {
        if (isMt5SessionNotFoundError(error)) {
          localStorage.removeItem('mt5_active_session_id');
          setSessionId('');
          setNotification(null);
          return;
        }
        setNotification({ type: 'error', message: error.message });
      });
    }
    return () => window.removeEventListener('mt5:session-change', onSession);
  }, [sessionId, page, rowsPerPage, appliedFilters, watchlistOnly, appliedFilterRules, viewMode]);

  useEffect(() => {
    localStorage.setItem(RESULTS_ROWS_PER_PAGE_KEY, String(rowsPerPage));
  }, [rowsPerPage]);

  useEffect(() => {
    if (!sessionId) return;
    sessionStorage.setItem(`${RESULTS_PAGE_KEY_PREFIX}${sessionId}`, String(page));
  }, [sessionId, page]);

  useEffect(() => () => resultsAbortControllerRef.current?.abort(), []);

  useEffect(() => {
    if (!sessionId) return undefined;
    let active = true;
    const refreshRunningCount = async () => {
      try {
        const payload = await getRunningMt5BacktestCount(sessionId);
        if (active) {
          setSummaryStats((prev) => ({ ...prev, runningBacktests: payload.count ?? 0 }));
        }
      } catch {
        // The main result request already reports session/access errors.
      }
    };
    refreshRunningCount();
    const timer = window.setInterval(refreshRunningCount, 10000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return undefined;
    let active = true;
    const checkResultVersion = async () => {
      try {
        const state = await getMt5ResultsState(sessionId);
        const version = Number(state.resultVersion) || 0;
        if (active && loadedResultsOnceRef.current && version > loadedResultVersionRef.current) {
          setNewResultVersion(version);
          if (viewMode === 'grouped' && !autoRefreshInFlightRef.current && !resultsAbortControllerRef.current) {
            autoRefreshInFlightRef.current = true;
            loadResults(sessionId, appliedFilterRules, page, viewMode, appliedFilters, {
              silent: true,
              skipSummary: true
            })
              .catch((error) => {
                if (error?.name !== 'AbortError') {
                  setNotification({ type: 'error', message: error.message });
                }
              })
              .finally(() => {
                autoRefreshInFlightRef.current = false;
              });
          }
        }
      } catch {
        // The main table request owns session/access error reporting.
      }
    };
    checkResultVersion();
    const timer = window.setInterval(checkResultVersion, 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [sessionId, page, viewMode, appliedFilterRules, appliedFilters, rowsPerPage, watchlistOnly]);

  // Re-run Dialog Form State
  const [reRunCycles, setReRunCycles] = useState(3);
  const [reRunSessionName, setReRunSessionName] = useState(`SES-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-REOPT`);

  // Dropdown list options
  const symbolOptions = useMemo(() => {
    const symbols = Array.from(new Set(summaryStats.symbolOptions || [])).filter((symbol) => symbol && symbol !== '-').sort();
    return ['ALL', ...symbols];
  }, [summaryStats.symbolOptions]);

  // Helper to parse min-max string (e.g. "100-1200", "100000", "0-0")
  const parseMinMax = (str) => {
    if (str === undefined || str === null || str === '') return { min: null, max: null };
    const s = String(str).trim();
    if (s.includes('-')) {
      const parts = s.split('-').map((p) => p.trim());
      const min = parts[0] !== '' && !isNaN(Number(parts[0])) ? Number(parts[0]) : null;
      const max = parts[1] !== '' && !isNaN(Number(parts[1])) ? Number(parts[1]) : null;
      return { min, max };
    }
    const val = !isNaN(Number(s)) ? Number(s) : null;
    return { min: val, max: null };
  };

  // Evaluate a single row against active Min-Max rules; empty fields add no restriction.
  const evaluateRowRules = (row, rules) => {
    let isDisqualified = false;
    let reason = null;

    // 1. Min Profit ($)
    const { min: pMin, max: pMax } = parseMinMax(rules.minProfit);
    if (pMin !== null && pMin > 0 && row.profit < pMin) {
      isDisqualified = true;
      reason = `Profit (${row.profit}) < Min (${pMin})`;
    } else if (pMax !== null && pMax > 0 && row.profit > pMax) {
      isDisqualified = true;
      reason = `Profit (${row.profit}) > Max (${pMax})`;
    }

    // 2. Min Recovery Factor
    const { min: rfMin, max: rfMax } = parseMinMax(rules.minRecoveryFactor);
    if (!isDisqualified && rfMin !== null && rfMin > 0 && row.recoveryFactor < rfMin) {
      isDisqualified = true;
      reason = `Recovery Factor (${row.recoveryFactor}) < Min (${rfMin})`;
    } else if (!isDisqualified && rfMax !== null && rfMax > 0 && row.recoveryFactor > rfMax) {
      isDisqualified = true;
      reason = `Recovery Factor (${row.recoveryFactor}) > Max (${rfMax})`;
    }

    // 3. Trades (Min - Max)
    const { min: tMin, max: tMax } = parseMinMax(rules.trades);
    if (!isDisqualified && tMin !== null && tMin > 0 && row.trades < tMin) {
      isDisqualified = true;
      reason = `Trades (${row.trades}) < Min (${tMin})`;
    } else if (!isDisqualified && tMax !== null && tMax > 0 && row.trades > tMax) {
      isDisqualified = true;
      reason = `Trades (${row.trades}) > Max (${tMax})`;
    }

    // 4. Profit Factor (Min - Max)
    const { min: pfMin, max: pfMax } = parseMinMax(rules.profitFactor);
    if (!isDisqualified && pfMin !== null && pfMin > 0 && row.profitFactor < pfMin) {
      isDisqualified = true;
      reason = `PF (${row.profitFactor}) < Min (${pfMin})`;
    } else if (!isDisqualified && pfMax !== null && pfMax > 0 && row.profitFactor > pfMax) {
      isDisqualified = true;
      reason = `PF (${row.profitFactor}) > Max (${pfMax})`;
    }

    // 5. Equity DD % (Min - Max)
    const { min: ddMin, max: ddMax } = parseMinMax(rules.balanceDD);
    if (!isDisqualified && ddMin !== null && ddMin > 0 && row.drawdownPct < ddMin) {
      isDisqualified = true;
      reason = `Equity DD (${row.drawdownPct}%) < Min (${ddMin}%)`;
    } else if (!isDisqualified && ddMax !== null && ddMax > 0 && row.drawdownPct > ddMax) {
      isDisqualified = true;
      reason = `Equity DD (${row.drawdownPct}%) > Max (${ddMax}%)`;
    }

    // 6. Sharpe Ratio (Min - Max)
    const { min: srMin, max: srMax } = parseMinMax(rules.sharpeRatio);
    if (!isDisqualified && ((srMin !== null && srMin > 0) || (srMax !== null && srMax > 0))) {
      if (srMin !== null && srMin > 0 && row.sharpeRatio < srMin) {
        isDisqualified = true;
        reason = `Sharpe (${row.sharpeRatio}) < Min (${srMin})`;
      } else if (srMax !== null && srMax > 0 && row.sharpeRatio > srMax) {
        isDisqualified = true;
        reason = `Sharpe (${row.sharpeRatio}) > Max (${srMax})`;
      }
    }

    // 7. Cluster Radius (%)
    const { min: crMin, max: crMax } = parseMinMax(rules.clusterRadius);
    if (!isDisqualified && ((crMin !== null && crMin > 0) || (crMax !== null && crMax > 0))) {
      const rowCluster = row.clusterRadius !== undefined ? Number(row.clusterRadius) : 5.0;
      if (crMin !== null && crMin > 0 && rowCluster < crMin) {
        isDisqualified = true;
        reason = `Cluster Radius (${rowCluster}%) < Min (${crMin}%)`;
      } else if (crMax !== null && crMax > 0 && rowCluster > crMax) {
        isDisqualified = true;
        reason = `Cluster Radius (${rowCluster}%) > Max (${crMax}%)`;
      }
    }

    return { isDisqualified, reason };
  };

  // 4 KPI Summary Metrics Calculation
  const metrics = useMemo(() => {
    const totalSymbols = summaryStats.symbols ?? Array.from(new Set(results.map((r) => r.symbol))).length;
    const totalParamSets = summaryStats.total ?? totalResults;
    const totalStrategies = summaryStats.strategies ?? Array.from(new Set(results.map((r) => r.strategy))).length;
    const watchlistCount = summaryStats.watchlist ?? results.filter((r) => r.isWatchlist).length;
    const runningBacktestCount = summaryStats.runningBacktests ?? 0;

    const qualifiedParamSets =
      summaryStats.qualified ?? qualifiedCount ?? results.filter((r) => r.trades >= 100 && r.profit >= 10000).length;
    const qualifiedPct = totalParamSets > 0 ? ((qualifiedParamSets / totalParamSets) * 100).toFixed(1) : '0.0';

    return {
      totalSymbols,
      totalParamSets,
      totalStrategies,
      watchlistCount,
      runningBacktestCount,
      qualifiedParamSets,
      qualifiedPct
    };
  }, [results, totalResults, qualifiedCount, summaryStats]);

  // Filtered Results
  const filteredResults = useMemo(() => {
    const list = results.filter((row) => {
      // Search
      const matchSearch =
        !appliedFilters.search ||
        row.id.toLowerCase().includes(appliedFilters.search.toLowerCase()) ||
        row.strategy.toLowerCase().includes(appliedFilters.search.toLowerCase()) ||
        row.symbol.toLowerCase().includes(appliedFilters.search.toLowerCase()) ||
        row.session.toLowerCase().includes(appliedFilters.search.toLowerCase());

      // Symbol
      const matchSymbol = appliedFilters.symbol === 'ALL' || row.symbol === appliedFilters.symbol;

      // Strategy
      const matchStrategy = appliedFilters.strategy === 'ALL' || row.strategy === appliedFilters.strategy;

      // Status
      const matchStatus = appliedFilters.status === 'ALL' || row.status === appliedFilters.status;

      // Number of completed Every Tick backtests
      const matchBacktestRuns =
        appliedFilters.backtestRuns === 'ALL' ||
        (appliedFilters.backtestRuns === 'GT5'
          ? row.backtestRunCount > 5
          : row.backtestRunCount === Number(appliedFilters.backtestRuns));

      // Watchlist toggle
      const matchWatchlist = !watchlistOnly || row.isWatchlist;
      return matchSearch && matchSymbol && matchStrategy && matchStatus && matchBacktestRuns && matchWatchlist;
    });

    return [...list].sort((a, b) =>
      compareStrategyCodes(a.strategy, b.strategy)
      || (Number(b.result) || 0) - (Number(a.result) || 0)
      || (Number(a.passNumber) || 0) - (Number(b.passNumber) || 0));
  }, [results, appliedFilters, watchlistOnly]);

  const pagedResults = useMemo(() => {
    if (viewMode !== 'grouped') return filteredResults;

    const groupedByStrategy = new Map();
    for (const row of filteredResults) {
      const strategyKey = row.strategy || row.strategyId || row.id;
      const current = groupedByStrategy.get(strategyKey);
      const rowPasses = Number(row.totalPasses) || 0;
      const currentPasses = Number(current?.totalPasses) || 0;
      if (!current || rowPasses > currentPasses || (rowPasses === currentPasses && row.result > current.result)) {
        groupedByStrategy.set(strategyKey, row);
      }
    }
    return Array.from(groupedByStrategy.values());
  }, [filteredResults, viewMode]);

  const visibleSelectionIds = useMemo(() => {
    const ids = pagedResults.flatMap((row) => {
      if (viewMode !== 'grouped' || !expandedStrategies[row.strategy]) return [row.id];
      return [row.id, ...(strategySubRows[row.strategy] || []).map((subRow) => subRow.id)];
    });
    return Array.from(new Set(ids));
  }, [pagedResults, viewMode, expandedStrategies, strategySubRows]);

  const handleLoadDefaultFilter = async () => {
    setDefaultFilterAnchorEl(null);
    setDefaultFilterBusy(true);
    try {
      const preferences = await getMt5FilterPreferences();
      const saved = preferences?.[FILTER_PREFERENCE_SCOPE];
      if (!saved) {
        setNotification({ type: 'info', message: 'No saved default filter for Optimization Filters.' });
        return;
      }
      setFilterRules({ ...DEFAULT_FILTER_RULES, ...(saved.filterRules || {}) });
      setInputFilters({ ...DEFAULT_TABLE_FILTERS, ...(saved.inputFilters || {}) });
      setFilterRuleErrors({});
      setNotification({ type: 'success', message: 'Default filter loaded. Press Apply Filters to use it.' });
    } catch (err) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setDefaultFilterBusy(false);
    }
  };

  const handleSaveDefaultFilter = async () => {
    setDefaultFilterAnchorEl(null);
    setDefaultFilterBusy(true);
    try {
      await saveMt5FilterPreference(FILTER_PREFERENCE_SCOPE, { filterRules, inputFilters });
      setNotification({ type: 'success', message: 'Current Optimization Filters saved as your default.' });
    } catch (err) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setDefaultFilterBusy(false);
    }
  };

  const handleClearDefaultFilter = async () => {
    setDefaultFilterAnchorEl(null);
    setDefaultFilterBusy(true);
    try {
      await deleteMt5FilterPreference(FILTER_PREFERENCE_SCOPE);
      setNotification({ type: 'success', message: 'Saved Optimization Filters default cleared.' });
    } catch (err) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setDefaultFilterBusy(false);
    }
  };

  // Handle Apply Filter Rules (Backend SQL Evaluation with Top N per strategy and Clustering)
  const handleApplyPostFilterRules = async () => {
    const validationErrors = Object.fromEntries(
      FILTER_RULE_FIELDS
        .map((field) => [field.key, validateFilterRule(field, filterRules[field.key])])
        .filter(([, error]) => error)
    );
    if (Number(filterRules.clusterRadius) > 0 && !(Number(filterRules.topN) > 0)) {
      validationErrors.topN = 'Top N Results is required when Cluster Radius is enabled.';
    }
    if (Object.keys(validationErrors).length > 0) {
      setFilterRuleErrors(validationErrors);
      setNotification({ type: 'error', message: 'Please correct the invalid Optimization Filters before applying.' });
      return;
    }
    try {
      setApplyingFilters(true);
      setFilterRuleErrors({});
      const normalizedRules = normalizeFilterRules(filterRules);
      const useRankingFilters = !watchlistOnly;
      const clusterR = useRankingFilters ? parseFloat(normalizedRules.clusterRadius) : 0;
      const isClustering = useRankingFilters && !isNaN(clusterR) && clusterR > 0;
      const targetViewMode = isClustering ? 'grouped' : viewMode;
      const viewModeChanged = targetViewMode !== viewMode;
      setNotification({
        type: 'info',
        message: isClustering
          ? `Calculating & clustering parameter sets (${clusterR}% radius), please wait...`
          : 'Calculating & evaluating filter rules across parameter sets, please wait...'
      });
      const tableFiltersChanged = JSON.stringify(inputFilters) !== JSON.stringify(appliedFilters);
      const rulesChanged = JSON.stringify(normalizedRules) !== JSON.stringify(appliedFilterRules);
      const payload = await loadResults(sessionId, normalizedRules, 0, targetViewMode, inputFilters, {
        deferCommit: true,
        skipSummary: true
      });
      if (!payload?.uiSnapshot) return;
      if (tableFiltersChanged || rulesChanged || viewModeChanged || page !== 0) skipNextResultsEffectRef.current = true;
      commitResultsSnapshot(payload.uiSnapshot);
      if (tableFiltersChanged) setAppliedFilters({ ...inputFilters });
      if (rulesChanged) setAppliedFilterRules(normalizedRules);
      if (viewModeChanged) setViewMode(targetViewMode);
      setPage(0);
      const topN = useRankingFilters ? parseInt(normalizedRules.topN, 10) : 0;
      const clusterNote = isClustering ? ` (Clustered at ${clusterR}%)` : '';
      const topNNote = topN > 0 ? ` (Top ${topN} per strategy)` : '';
      setNotification({
        type: 'success',
        message: `✓ Optimization Filter applied${topNNote}${clusterNote}. Summary is updating in the background.`
      });
      loadResults(sessionId, normalizedRules, 0, targetViewMode, inputFilters, { silent: true })
        .catch((error) => {
          if (error?.name !== 'AbortError') {
            setNotification({
              type: 'warning',
              message: `Filter results are ready, but the summary could not be refreshed. ${error.message}`
            });
          }
        });
    } catch (err) {
      setNotification({
        type: 'error',
        message: `New Optimization Filters were not applied. ${err.message}`
      });
    } finally {
      setApplyingFilters(false);
    }
  };

  const handleResetFilterRules = async () => {
    try {
      setApplyingFilters(true);
      setNotification({
        type: 'info',
        message: 'Resetting filter rules to defaults, please wait...'
      });
      const resetTableFilters = { ...DEFAULT_TABLE_FILTERS };
      const payload = await loadResults(sessionId, DEFAULT_FILTER_RULES, 0, viewMode, resetTableFilters, {
        deferCommit: true,
        skipSummary: true
      });
      if (!payload?.uiSnapshot) return;
      skipNextResultsEffectRef.current = true;
      commitResultsSnapshot(payload.uiSnapshot);
      setFilterRuleErrors({});
      setFilterRules(DEFAULT_FILTER_RULES);
      setAppliedFilterRules(DEFAULT_FILTER_RULES);
      setInputFilters(resetTableFilters);
      setAppliedFilters(resetTableFilters);
      setPage(0);
      setNotification({
        type: 'info',
        message: 'Filter rules cleared. Summary is updating in the background.'
      });
      loadResults(sessionId, DEFAULT_FILTER_RULES, 0, viewMode, resetTableFilters, { silent: true })
        .catch((error) => {
          if (error?.name !== 'AbortError') {
            setNotification({
              type: 'warning',
              message: `Results were reset, but the summary could not be refreshed. ${error.message}`
            });
          }
        });
    } catch (err) {
      setNotification({
        type: 'error',
        message: `Filters were not reset. ${err.message}`
      });
    } finally {
      setApplyingFilters(false);
    }
  };

  const handleSwitchViewMode = (mode) => {
    if (mode === viewMode) return;
    if (mode === 'grouped' && appliedFilters.strategy !== 'ALL') {
      setInputFilters((current) => ({ ...current, strategy: 'ALL' }));
      setAppliedFilters((current) => ({ ...current, strategy: 'ALL' }));
    }
    setResults([]);
    setViewMode(mode);
    setPage(0);
    setExpandedStrategies({});
    setStrategySubRows({});
  };

  const handleToggleExpandStrategy = async (strategyId) => {
    if (applyingFilters) return;
    const isCurrentlyExpanded = !!expandedStrategies[strategyId];
    setExpandedStrategies((prev) => ({ ...prev, [strategyId]: !isCurrentlyExpanded }));

    if (!isCurrentlyExpanded && !strategySubRows[strategyId]) {
      try {
        setLoadingSubRows((prev) => ({ ...prev, [strategyId]: true }));
        const subPayload = await listMt5Results({
          session_id: sessionId,
          strategy_id: strategyId,
          page: 1,
          page_size: 50,
          view: watchlistOnly ? 'watchlist' : 'all',
          state: appliedFilters.status,
          backtest_runs: appliedFilters.backtestRuns,
          min_profit: appliedFilterRules.minProfit,
          min_recovery_factor: appliedFilterRules.minRecoveryFactor,
          trades: appliedFilterRules.trades,
          profit_factor: appliedFilterRules.profitFactor,
          balance_dd: appliedFilterRules.balanceDD,
          sharpe_ratio: appliedFilterRules.sharpeRatio,
          top_n: watchlistOnly ? null : appliedFilterRules.topN,
          cluster_radius: watchlistOnly ? null : appliedFilterRules.clusterRadius
        });
        const subResultVersion = Number(subPayload.sessionVersion) || 0;
        if (loadedResultVersionRef.current && subResultVersion !== loadedResultVersionRef.current) {
          throw new Error('Optimization results changed while loading passes. Refresh the grouped results and try again.');
        }
        const mapped = (subPayload.items || []).map(mapMt5Result);
        setStrategySubRows((prev) => ({ ...prev, [strategyId]: mapped }));
      } catch (err) {
        setNotification({ type: 'error', message: `Failed to load passes for ${strategyId}: ${err.message}` });
      } finally {
        setLoadingSubRows((prev) => ({ ...prev, [strategyId]: false }));
      }
    }
  };

  const handleRefilterSelected = () => {
    const targetIds = selectedIds.length > 0 ? selectedIds : results.map((r) => r.id);
    setResults((prev) =>
      prev.map((row) => {
        if (!targetIds.includes(row.id)) return row;
        const { isDisqualified, reason } = evaluateRowRules(row, filterRules);
        return {
          ...row,
          status: isDisqualified ? 'DISQUALIFIED' : 'PASSED',
          disqualifyReason: reason
        };
      })
    );

    setNotification({
      type: 'success',
      message: `✓ Re-filtered ${targetIds.length} candidate result(s) based on current filter rules.`
    });
  };

  const handleAddSelectedToWatchlist = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    try {
      for (let offset = 0; offset < ids.length; offset += 5) {
        await Promise.all(ids.slice(offset, offset + 5).map((id) => setMt5Watchlist(id, true)));
      }
      setResults((prev) => prev.map((row) => (ids.includes(row.id) ? { ...row, isWatchlist: true } : row)));
      setStrategySubRows((prev) => {
        const next = { ...prev };
        for (const strategyId in next) {
          next[strategyId] = next[strategyId]?.map((row) =>
            ids.includes(row.id) ? { ...row, isWatchlist: true } : row
          );
        }
        return next;
      });
      setSelectedIds([]);
      await loadResults(sessionId, appliedFilterRules, page, viewMode);
      setNotification({
        type: 'success',
        message: `Added ${ids.length} candidate(s) to My OTM Watchlist.`
      });
    } catch (error) {
      setNotification({ type: 'error', message: error.message });
    }
  };

  // Toggle Watchlist
  const handleToggleWatchlist = async (id) => {
    let row = results.find((item) => item.id === id);
    if (!row) {
      for (const sId in strategySubRows) {
        const found = strategySubRows[sId]?.find((item) => item.id === id);
        if (found) { row = found; break; }
      }
    }
    if (!row) return;
    try {
      await setMt5Watchlist(id, !row.isWatchlist);
      setStrategySubRows((prev) => {
        const next = { ...prev };
        for (const sId in next) {
          next[sId] = next[sId]?.map((r) => (r.id === id ? { ...r, isWatchlist: !row.isWatchlist } : r));
        }
        return next;
      });
      await loadResults(sessionId, appliedFilterRules, page, viewMode);
    } catch (error) {
      setNotification({ type: 'error', message: error.message });
    }
  };

  // Pick one Open Price result and dispatch its Every Tick job immediately.
  const handleStartCandidate = async (id) => {
    if (selectedIds.length > 1) {
      setBulkBacktestIds([...selectedIds]);
      setBulkBacktestDialogOpen(true);
      return;
    }
    let row = results.find((item) => item.id === id);
    if (!row) {
      for (const sId in strategySubRows) {
        const found = strategySubRows[sId]?.find((item) => item.id === id);
        if (found) { row = found; break; }
      }
    }
    if (!row || startingCandidateIds.includes(id)) return;
    if (candidateIds.includes(id)) {
      setNotification({ type: 'info', message: 'Every Tick backtest is already queued or running for this parameter set.' });
      return;
    }
    try {
      setStartingCandidateIds((prev) => [...prev, id]);
      await startMt5Backtest(id);
      setCandidateIds((prev) => Array.from(new Set([...prev, id])));
      setResults((prev) => prev.map((item) => (item.id === id ? { ...item, isCandidate: true } : item)));
      setStrategySubRows((prev) => {
        const next = { ...prev };
        for (const sId in next) {
          next[sId] = next[sId]?.map((item) => (item.id === id ? { ...item, isCandidate: true } : item));
        }
        return next;
      });
      setSummaryStats((prev) => ({
        ...prev,
        runningBacktests: Number(prev.runningBacktests || 0) + 1
      }));
      setNotification({ type: 'success', message: 'Every Tick backtest job started for the selected parameter set.' });
    } catch (error) {
      setNotification({ type: 'error', message: error.message });
    } finally {
      setStartingCandidateIds((prev) => prev.filter((item) => item !== id));
    }
  };

  const handleConfirmBulkBacktest = async () => {
    if (!bulkBacktestIds.length || bulkBacktestSubmitting) return;

    const eligibleIds = bulkBacktestIds.filter(
      (id) => !candidateIds.includes(id) && !startingCandidateIds.includes(id)
    );
    if (!eligibleIds.length) {
      setBulkBacktestDialogOpen(false);
      setNotification({ type: 'info', message: 'All selected parameter sets are already queued or running.' });
      return;
    }

    setBulkBacktestSubmitting(true);
    setStartingCandidateIds((prev) => Array.from(new Set([...prev, ...eligibleIds])));
    const succeededIds = [];
    const failed = [];

    try {
      for (let offset = 0; offset < eligibleIds.length; offset += 5) {
        const batch = eligibleIds.slice(offset, offset + 5);
        const outcomes = await Promise.allSettled(batch.map((id) => startMt5Backtest(id)));
        outcomes.forEach((outcome, index) => {
          const id = batch[index];
          if (outcome.status === 'fulfilled') succeededIds.push(id);
          else failed.push({ id, message: outcome.reason?.message || 'Unable to start Every Tick backtest.' });
        });
      }

      if (succeededIds.length) {
        const succeededSet = new Set(succeededIds);
        setCandidateIds((prev) => Array.from(new Set([...prev, ...succeededIds])));
        setResults((prev) => prev.map((item) => (succeededSet.has(item.id) ? { ...item, isCandidate: true } : item)));
        setStrategySubRows((prev) => {
          const next = { ...prev };
          for (const strategyId in next) {
            next[strategyId] = next[strategyId]?.map((item) =>
              succeededSet.has(item.id) ? { ...item, isCandidate: true } : item
            );
          }
          return next;
        });
        setSummaryStats((prev) => ({
          ...prev,
          runningBacktests: Number(prev.runningBacktests || 0) + succeededIds.length
        }));
        setSelectedIds((prev) => prev.filter((id) => !succeededSet.has(id)));
      }

      if (failed.length) {
        setNotification({
          type: succeededIds.length ? 'warning' : 'error',
          message: `Started ${succeededIds.length}/${eligibleIds.length} Every Tick backtests. ${failed.length} failed: ${failed[0].message}`
        });
      } else {
        setNotification({
          type: 'success',
          message: `Started Every Tick backtest for ${succeededIds.length} selected parameter set(s).`
        });
      }
      setBulkBacktestDialogOpen(false);
    } finally {
      setBulkBacktestSubmitting(false);
      setStartingCandidateIds((prev) => prev.filter((id) => !eligibleIds.includes(id)));
    }
  };

  // Multi-select
  const handleToggleSelect = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleSelectAll = (visibleIds) => {
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const handleSelectStrategyResults = (row, subRows = []) => {
    const strategyIds = Array.from(new Set([row.id, ...subRows.map((subRow) => subRow.id)]));
    handleSelectAll(strategyIds);
  };

  const handleOpenDetails = (row) => {
    setSelectedResult(row);
    setDetailsOpen(true);
  };

  const handleDownloadIni = (result) => {
    if (!result) return;
    const strategyName = result.strategy || result.strategyName || 'Strategy';
    const passNum = result.passNumber ?? result.pass ?? 0;
    const symbol = result.symbol && result.symbol !== '-' ? result.symbol : 'EURUSD';
    const timeframe = result.timeframe && result.timeframe !== '-' ? result.timeframe : 'H1';
    const reportFilename = `${strategyName}_Pass${passNum}.xml`;

    let iniContent = '';

    if (result.templateIni) {
      // Use exact original uploaded INI template from DB, replacing pass inputs and setting single test mode
      const values = result.parameters && typeof result.parameters === 'object' ? result.parameters : {};
      const lines = result.templateIni.split(/\r?\n/).map((line) => {
        if (/^Optimization=/i.test(line)) return 'Optimization=0';
        if (/^Model=/i.test(line)) return 'Model=1';
        if (/^Report=/i.test(line)) return `Report=${reportFilename}`;
        const match = line.match(/^([^=;#]+)=(.*)$/);
        if (!match) return line;
        const key = match[1].trim();
        if (!Object.prototype.hasOwnProperty.call(values, key)) return line;
        const oldParts = String(match[2]).split('||');
        const value = String(values[key]);
        return `${match[1]}=${oldParts.length > 1 ? `${value}||${value}||0||${value}||N` : value}`;
      });
      iniContent = lines.join('\r\n');
    } else {
      // Fallback if template is not available
      const startDate = (result.startDate || '2021-02-21').replace(/-/g, '.');
      const endDate = (result.endDate || '2026-03-01').replace(/-/g, '.');
      const paramEntries = Object.entries(result.parameters || {});
      const inputsSection = paramEntries.map(([k, v]) => `${k}=${v}`).join('\n');

      iniContent = `[Tester]
Expert=Experts\\Lotusquant\\${strategyName}.ex5
Symbol=${symbol}
Period=${timeframe}
Optimization=0
Model=1
FromDate=${startDate}
ToDate=${endDate}
ForwardMode=0
Deposit=10000
Currency=USD
Leverage=100
ExecutionMode=0
OptimizationCriterion=6
Visual=0
ShutdownTerminal=1
Report=${reportFilename}
ReplaceReport=1

[TesterInputs]
${inputsSection}
`;
    }

    const blob = new Blob([iniContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${strategyName}_Pass${passNum}.ini`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
  };

  // Copy ID
  const handleCopyId = (id) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Execute Re-run Optimization
  const handleExecuteReRun = () => {
    setReRunDialogOpen(false);
    setNotification({
      type: 'success',
      message: `🚀 Dispatched Optimization Re-Run in session "${reRunSessionName}" with ${reRunCycles} cycles and tightened bounds!`
    });
  };

  // 4 Top KPI Cards
  const summaryCards = [
    {
      label: 'TOTAL SYMBOLS',
      value: loadingSummary ? <Skeleton width={92} /> : `${metrics.totalSymbols} Symbols`,
      sub: 'Multi-asset genetic testing',
      valueColor: isDark ? '#e6f7ff' : theme.palette.text.primary,
      icon: <CloudServerOutlined style={{ fontSize: '18px', color: '#1890ff' }} />,
      iconBg: isDark ? 'rgba(24, 144, 255, 0.18)' : '#e6f7ff'
    },
    {
      label: 'TOTAL PARAM SETS',
      value: loadingSummary ? <Skeleton width={110} /> : `${metrics.totalParamSets.toLocaleString()} Sets`,
      sub: 'Combinations evaluated in cluster',
      valueColor: theme.palette.primary.main,
      icon: <ThunderboltOutlined style={{ fontSize: '18px', color: '#13c2c2' }} />,
      iconBg: isDark ? 'rgba(19, 194, 194, 0.18)' : '#e6fffb'
    },
    {
      label: 'TOTAL STRATEGIES',
      value: loadingSummary ? <Skeleton width={105} /> : `${metrics.totalStrategies} Strategies`,
      sub: 'Expert Advisors in optimization pool',
      valueColor: '#722ed1',
      icon: <AimOutlined style={{ fontSize: '18px', color: '#722ed1' }} />,
      iconBg: isDark ? 'rgba(114, 46, 209, 0.18)' : '#f9f0ff'
    },
    {
      label: 'QUALIFIED SETS (>100T & >$10K)',
      value: loadingSummary ? <Skeleton width={72} /> : `${metrics.qualifiedPct}%`,
      sub: loadingSummary ? 'Loading summary...' : `${metrics.qualifiedParamSets.toLocaleString()} of ${metrics.totalParamSets.toLocaleString()} sets met criteria`,
      valueColor: Number(metrics.qualifiedPct) >= 20 ? theme.palette.success.main : Number(metrics.qualifiedPct) >= 5 ? 'primary.main' : 'warning.main',
      icon: <CheckCircleOutlined style={{ fontSize: '18px', color: '#52c41a' }} />,
      iconBg: isDark ? 'rgba(82, 196, 26, 0.18)' : '#f6ffed'
    }
  ];

  const inputLabelSx = {
    color: isDark ? 'grey.300' : 'text.secondary',
    '&.Mui-focused': { color: 'primary.main' }
  };

  const cursorPaginationEnabled = watchlistOnly || (
    !(Number(appliedFilterRules.topN) > 0) && !(Number(appliedFilterRules.clusterRadius) > 0)
  );

  return (
    <Stack spacing={{ xs: 2, sm: 2.5 }} sx={{ width: '100%' }}>
      {/* ── 1. TOP 4 KPI SUMMARY CARDS ── */}
      <Box sx={{ width: '100%' }}>
        <Grid container spacing={{ xs: 1.5, sm: 2.5 }} sx={{ width: '100%' }}>
          {summaryCards.map((item) => (
            <Grid key={item.label} size={{ xs: 12, sm: 6, md: 3 }}>
              <Card
                variant="outlined"
                sx={{
                  p: { xs: 1.75, sm: 2.25 },
                  borderRadius: { xs: 2, sm: 2.5 },
                  bgcolor: isDark ? 'background.paper' : '#ffffff',
                  borderColor: isDark ? 'divider' : '#e2e8f0',
                  boxShadow: isDark ? 'none' : '0 4px 10px rgba(0, 0, 0, 0.01)',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.25s ease-in-out',
                  '&:hover': {
                    borderColor: 'primary.main',
                    boxShadow: isDark ? '0 8px 18px rgba(0, 0, 0, 0.3)' : '0 8px 18px rgba(0, 0, 0, 0.04)',
                    transform: 'translateY(-2px)'
                  }
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        fontSize: { xs: '0.68rem', sm: '0.75rem' }
                      }}
                    >
                      {item.label}
                    </Typography>
                    {typeof item.value === 'string' ? (
                      <Typography
                        variant="h4"
                        sx={{
                          fontWeight: 700,
                          color: item.valueColor,
                          mt: 0.5,
                          fontSize: { xs: '1.1rem', sm: '1.25rem', md: '1.35rem' },
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {item.value}
                      </Typography>
                    ) : (
                      <Box
                        sx={{
                          mt: 0.5,
                          fontSize: { xs: '1.1rem', sm: '1.25rem', md: '1.35rem' },
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {item.value}
                      </Box>
                    )}
                  </Box>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: { xs: 34, sm: 38 },
                      height: { xs: 34, sm: 38 },
                      borderRadius: '50%',
                      bgcolor: item.iconBg,
                      flexShrink: 0,
                      ml: 1
                    }}
                  >
                    {item.icon}
                  </Box>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.7rem', sm: '0.75rem' }, fontWeight: 500 }}>
                  {item.sub}
                </Typography>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>

      {/* ── 2. BLOCK: POST-OPTIMIZATION FILTER RULES ── */}
      <Card
        variant="outlined"
        sx={{
          p: { xs: 2, sm: 2.5 },
          borderRadius: 2,
          bgcolor: isDark ? 'background.paper' : '#ffffff',
          borderColor: isDark ? 'divider' : '#e2e8f0',
          boxShadow: isDark ? 'none' : '0 2px 8px rgba(0, 0, 0, 0.02)'
        }}
      >
        <Stack spacing={2}>
          {/* Header */}
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            sx={{ flexWrap: 'wrap', gap: 1 }}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <SlidersOutlined style={{ color: theme.palette.primary.main, fontSize: 16 }} />
              <Typography variant="subtitle1" fontWeight={700}>
                Optimization Filters
              </Typography>
            </Stack>

            {applyingFilters && (
              <Stack direction="row" spacing={1} alignItems="center">
                <CircularProgress size={16} color="primary" />
                <Typography variant="body2" color="primary.main" fontWeight={600}>
                  Calculating, please wait...
                </Typography>
              </Stack>
            )}
          </Stack>

          <Grid container spacing={1.75} alignItems="center" sx={{ width: '100%' }}>
            <Grid size={{ xs: 12, sm: 6, md: 6 }}>
              <OutlinedInput
                fullWidth
                size="small"
                value={inputFilters.search}
                onChange={(e) => setInputFilters((p) => ({ ...p, search: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleApplyPostFilterRules();
                }}
                placeholder="Search Pass #, Strategy, Symbol..."
                startAdornment={
                  <InputAdornment position="start">
                    <SearchOutlined style={{ color: theme.palette.text.secondary }} />
                  </InputAdornment>
                }
                sx={{ borderRadius: 1.25, height: 40 }}
              />
            </Grid>

            <Grid size={{ xs: 6, sm: 3, md: 3 }}>
              <FormControl fullWidth size="small">
                <InputLabel id="res-symbol-label" sx={inputLabelSx}>Symbol</InputLabel>
                <Select
                  labelId="res-symbol-label"
                  value={inputFilters.symbol}
                  label="Symbol"
                  onChange={(e) => {
                    const val = e.target.value;
                    setInputFilters((p) => ({ ...p, symbol: val }));
                  }}
                  sx={{ borderRadius: 1.25, height: 40 }}
                >
                  {symbolOptions.map((sym) => (
                    <MenuItem key={sym} value={sym}>{sym === 'ALL' ? 'All Symbols' : sym}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid size={{ xs: 6, sm: 3, md: 3 }}>
              <FormControl fullWidth size="small">
                <InputLabel id="res-backtest-runs-label" sx={inputLabelSx}>Backtest Runs</InputLabel>
                <Select
                  labelId="res-backtest-runs-label"
                  value={inputFilters.backtestRuns}
                  label="Backtest Runs"
                  onChange={(e) => {
                    const val = e.target.value;
                    setInputFilters((prev) => ({ ...prev, backtestRuns: val }));
                  }}
                  sx={{ borderRadius: 1.25, height: 40 }}
                >
                  <MenuItem value="ALL">All Runs</MenuItem>
                  <MenuItem value="0">Never</MenuItem>
                  <MenuItem value="1">1 time</MenuItem>
                  <MenuItem value="2">2 times</MenuItem>
                  <MenuItem value="3">3 times</MenuItem>
                  <MenuItem value="4">4 times</MenuItem>
                  <MenuItem value="5">5 times</MenuItem>
                  <MenuItem value="GT5">&gt; 5 times</MenuItem>
                </Select>
              </FormControl>
            </Grid>

          </Grid>

          {/* 3x3 Grid of 9 Filter Fields matching screenshot */}
          <Grid container spacing={2}>
            {FILTER_RULE_FIELDS.map((field) => (
              <Grid key={field.key} size={{ xs: 12, sm: 6, md: 4 }}>
                <TextField
                  fullWidth
                  size="small"
                  label={field.label}
                  value={filterRules[field.key] ?? ''}
                  disabled={watchlistOnly && ['topN', 'clusterRadius'].includes(field.key)}
                  error={Boolean(filterRuleErrors[field.key])}
                  helperText={filterRuleErrors[field.key] || undefined}
                  onChange={(e) => {
                    const value = e.target.value;
                    const allowedPattern = field.percent ? /^[0-9+\-.%\s]*$/ : /^[0-9+\-.\s]*$/;
                    if (!allowedPattern.test(value)) {
                      setFilterRuleErrors((prev) => ({ ...prev, [field.key]: 'Only numeric values are allowed.' }));
                      return;
                    }
                    setFilterRules((prev) => ({ ...prev, [field.key]: value }));
                    const error = validateFilterRule(field, value);
                    setFilterRuleErrors((prev) => ({ ...prev, [field.key]: error }));
                  }}
                  InputLabelProps={{ shrink: true, sx: inputLabelSx }}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      height: 40,
                      borderRadius: 1.25,
                      bgcolor: isDark ? 'background.paper' : '#ffffff'
                    }
                  }}
                />
              </Grid>
            ))}
          </Grid>

          {/* Action Buttons: Reset & Apply Filters on the bottom left */}
          <Stack direction="row" spacing={1} justifyContent="flex-start" alignItems="center" sx={{ flexWrap: 'wrap', gap: 1 }}>
            <Button
              size="small"
              variant="outlined"
              disabled={applyingFilters}
              startIcon={<ReloadOutlined />}
              onClick={handleResetFilterRules}
              sx={{ textTransform: 'none', fontWeight: 600, height: 36, px: 2 }}
            >
              Reset
            </Button>
            <Button
              size="small"
              variant="contained"
              disabled={applyingFilters}
              startIcon={applyingFilters ? <CircularProgress size={14} color="inherit" /> : <FilterOutlined />}
              onClick={handleApplyPostFilterRules}
              sx={{ textTransform: 'none', fontWeight: 600, height: 36, px: 2 }}
            >
              {applyingFilters ? 'Calculating...' : 'Apply Filters'}
            </Button>
            <Button
              size="small"
              variant="outlined"
              disabled={defaultFilterBusy}
              startIcon={defaultFilterBusy ? <CircularProgress size={14} /> : <StarOutlined />}
              onClick={(event) => setDefaultFilterAnchorEl(event.currentTarget)}
              sx={{ textTransform: 'none', fontWeight: 600, height: 36, px: 2 }}
            >
              My Default Filter
            </Button>
            <Menu anchorEl={defaultFilterAnchorEl} open={Boolean(defaultFilterAnchorEl)} onClose={() => setDefaultFilterAnchorEl(null)}>
              <MenuItem onClick={handleLoadDefaultFilter}>Load saved filter</MenuItem>
              <MenuItem onClick={handleSaveDefaultFilter}>Save current as default</MenuItem>
              <MenuItem onClick={handleClearDefaultFilter}>Clear saved filter</MenuItem>
            </Menu>
          </Stack>
        </Stack>
      </Card>

      {/* ── 3. BLOCK: OPTIMIZATION RESULTS TABLE & ACTION TOOLBAR ── */}
      <MainCard contentSX={{ p: 2 }}>
        <Stack spacing={2}>
          {/* Notification Banner */}
          {notification && (
            <Alert
              severity={notification.type}
              icon={applyingFilters ? <CircularProgress size={18} color="inherit" /> : undefined}
              onClose={applyingFilters ? undefined : () => setNotification(null)}
              sx={{ borderRadius: 1.25 }}
            >
              {notification.message}
            </Alert>
          )}
          {newResultVersion > loadedResultVersionRef.current && (
            <Alert
              severity="info"
              action={
                <Button
                  color="inherit"
                  size="small"
                  startIcon={<ReloadOutlined />}
                  onClick={() => loadResults(sessionId, appliedFilterRules, page, viewMode)}
                  disabled={loadingResults}
                  sx={{ textTransform: 'none', fontWeight: 700 }}
                >
                  Refresh results
                </Button>
              }
              sx={{ borderRadius: 1.25 }}
            >
              New optimization results are available. The current table remains unchanged until refreshed.
            </Alert>
          )}

          {/* Action Toolbar Header */}
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', md: 'center' }}
            spacing={1.5}
            sx={{ pb: 1, borderBottom: '1px solid', borderColor: 'divider' }}
          >
            {/* Left side: Results Count, View Mode Toggle & Batch Select */}
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: 'wrap', gap: 1 }}>
              <Typography variant="h5" fontWeight={700}>
                {viewMode === 'grouped' ? 'Strategies Overview' : 'Optimization Results'} ({totalResults})
              </Typography>
              <Chip
                label={viewMode === 'grouped' ? `${totalResults} Strategies` : `${totalResults} Stored Results`}
                size="small"
                color={viewMode === 'grouped' ? 'primary' : 'success'}
                variant="outlined"
                sx={{ fontWeight: 600 }}
              />

              {/* View Mode Toggle & Batch Select on same line */}
              <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'nowrap' }}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    bgcolor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'grey.100',
                    p: 0.35,
                    borderRadius: 1.5,
                    border: '1px solid',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'grey.300'
                  }}
                >
                  <Button
                    size="small"
                    startIcon={<UnorderedListOutlined />}
                    onClick={() => handleSwitchViewMode('flat')}
                    sx={{
                      height: { xs: 26, sm: 28 },
                      px: { xs: 0.75, sm: 1.25 },
                      fontSize: { xs: '0.7rem', sm: '0.78rem' },
                      fontWeight: viewMode === 'flat' ? 700 : 500,
                      textTransform: 'none',
                      borderRadius: 1.25,
                      whiteSpace: 'nowrap',
                      minWidth: 0,
                      bgcolor: viewMode === 'flat' ? (isDark ? 'primary.main' : '#ffffff') : 'transparent',
                      color: viewMode === 'flat' ? (isDark ? '#ffffff' : 'primary.main') : 'text.secondary',
                      boxShadow: viewMode === 'flat' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      '&:hover': {
                        bgcolor: viewMode === 'flat' ? (isDark ? 'primary.dark' : '#ffffff') : 'rgba(0,0,0,0.04)'
                      }
                    }}
                  >
                    All Passes
                  </Button>
                  <Button
                    size="small"
                    startIcon={<AppstoreOutlined />}
                    onClick={() => handleSwitchViewMode('grouped')}
                    sx={{
                      height: { xs: 26, sm: 28 },
                      px: { xs: 0.75, sm: 1.25 },
                      fontSize: { xs: '0.7rem', sm: '0.78rem' },
                      fontWeight: viewMode === 'grouped' ? 700 : 500,
                      textTransform: 'none',
                      borderRadius: 1.25,
                      whiteSpace: 'nowrap',
                      minWidth: 0,
                      bgcolor: viewMode === 'grouped' ? (isDark ? 'primary.main' : '#ffffff') : 'transparent',
                      color: viewMode === 'grouped' ? (isDark ? '#ffffff' : 'primary.main') : 'text.secondary',
                      boxShadow: viewMode === 'grouped' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      '&:hover': {
                        bgcolor: viewMode === 'grouped' ? (isDark ? 'primary.dark' : '#ffffff') : 'rgba(0,0,0,0.04)'
                      }
                    }}
                  >
                    <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Group by Strategy</Box>
                    <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>Grouped</Box>
                  </Button>
                </Box>

                {/* Batch Select Checkboxes Toggle (Grouped with View Mode on 1 line) */}
                <Tooltip title={showCheckboxes ? 'Hide Selection' : 'Batch Select'}>
                  <IconButton
                    size="small"
                    onClick={() => {
                      if (showCheckboxes) {
                        setSelectedIds([]);
                        setSelectionMode(false);
                      } else {
                        setSelectionMode(true);
                      }
                    }}
                    sx={{
                      width: 38,
                      height: 38,
                      borderRadius: 1.25,
                      border: '1px solid',
                      borderColor: showCheckboxes
                        ? 'primary.main'
                        : isDark
                        ? 'rgba(255, 255, 255, 0.2)'
                        : 'grey.300',
                      bgcolor: showCheckboxes
                        ? isDark
                          ? 'rgba(24, 144, 255, 0.25)'
                          : 'rgba(24, 144, 255, 0.1)'
                        : isDark
                        ? 'rgba(255, 255, 255, 0.04)'
                        : '#ffffff',
                      color: showCheckboxes ? 'primary.main' : isDark ? 'grey.300' : 'text.secondary',
                      '&:hover': {
                        borderColor: 'primary.main',
                        color: 'primary.main',
                        bgcolor: isDark ? 'rgba(24, 144, 255, 0.2)' : 'rgba(24, 144, 255, 0.08)'
                      }
                    }}
                  >
                    <CheckSquareOutlined style={{ fontSize: 17 }} />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Stack>

            {/* Right side: My OTM Watchlist & Every Tick Running together on 1 line */}
            <Stack
              direction="row"
              spacing={{ xs: 0.75, sm: 1.25 }}
              alignItems="center"
              sx={{ flexWrap: 'wrap', gap: { xs: 0.75, sm: 0 }, width: { xs: '100%', md: 'auto' } }}
            >
              {/* My OTM Watchlist Button */}
              <Button
                variant={watchlistOnly ? 'contained' : 'outlined'}
                color="warning"
                size="small"
                startIcon={watchlistOnly ? <StarFilled /> : <StarOutlined />}
                onClick={() => {
                  setWatchlistOnly((prev) => {
                    const next = !prev;
                    return next;
                  });
                  setPage(0);
                }}
                sx={{
                  textTransform: 'none',
                  fontWeight: 600,
                  borderRadius: 1.25,
                  height: { xs: 32, sm: 38 },
                  px: { xs: 1.25, sm: 1.75 },
                  fontSize: { xs: '0.72rem', sm: '0.8125rem' },
                  whiteSpace: 'nowrap'
                }}
              >
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>My OTM Watchlist ({metrics.watchlistCount})</Box>
                <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>Watchlist ({metrics.watchlistCount})</Box>
              </Button>

              <Button
                variant="outlined"
                color="error"
                size="small"
                startIcon={<ClearOutlined />}
                onClick={handleOpenCleanup}
                disabled={!sessionId}
                sx={{
                  textTransform: 'none',
                  fontWeight: 600,
                  borderRadius: 1.25,
                  height: { xs: 32, sm: 38 },
                  px: { xs: 1.25, sm: 1.75 },
                  fontSize: { xs: '0.72rem', sm: '0.8125rem' },
                  whiteSpace: 'nowrap'
                }}
              >
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Clean Optimize Data</Box>
                <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>Clean Data</Box>
              </Button>

              <Chip
                icon={<RocketOutlined />}
                label={`Every Tick Running (${metrics.runningBacktestCount})`}
                variant="outlined"
                sx={{
                  fontWeight: 600,
                  borderRadius: 1.25,
                  height: { xs: 32, sm: 38 },
                  px: { xs: 0.5, sm: 1.75 },
                  fontSize: { xs: '0.72rem', sm: '0.8125rem' },
                  whiteSpace: 'nowrap',
                  color: isDark ? '#91caff' : '#0958d9',
                  borderColor: isDark ? 'rgba(22, 119, 255, 0.5)' : '#91caff',
                  bgcolor: isDark ? 'rgba(22, 119, 255, 0.12)' : '#e6f4ff',
                  '& .MuiChip-icon': { color: 'inherit' }
                }}
              />
            </Stack>
          </Stack>

          {/* Bulk Selection Bar */}
          {selectedIds.length > 0 && (
            <Paper
              variant="outlined"
              sx={{
                p: 1.25,
                px: 2,
                bgcolor: isDark ? 'rgba(24, 144, 255, 0.1)' : '#e6f7ff',
                borderColor: 'primary.main',
                borderRadius: 1.25,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 1
              }}
            >
              <Typography variant="body2" fontWeight={600} color="primary.main">
                {selectedIds.length} candidate result(s) selected
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<Pointer size={14} />}
                  onClick={() => {
                    if (selectedIds.length > 1) {
                      setBulkBacktestIds([...selectedIds]);
                      setBulkBacktestDialogOpen(true);
                    } else {
                      handleStartCandidate(selectedIds[0]);
                    }
                  }}
                  sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 1 }}
                >
                  Start Every Tick ({selectedIds.length})
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="warning"
                  startIcon={<StarFilled />}
                  onClick={handleAddSelectedToWatchlist}
                  sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 1 }}
                >
                  Add to Watchlist
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setSelectedIds([])}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    borderRadius: 1.25,
                    color: isDark ? '#ffffff' : 'text.primary',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.45)' : 'grey.400',
                    bgcolor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'grey.100',
                    transition: 'all 0.2s',
                    '&:hover': {
                      borderColor: isDark ? '#ffffff' : 'text.primary',
                      bgcolor: isDark ? 'rgba(255, 255, 255, 0.22)' : 'grey.200',
                      color: isDark ? '#ffffff' : 'text.primary'
                    }
                  }}
                >
                  Clear Selection
                </Button>
              </Stack>
            </Paper>
          )}

          {/* ── Results Table ── */}
          <TableContainer
            sx={{
              borderRadius: 1.5,
              border: '1px solid',
              borderColor: 'divider',
              overflowX: 'auto'
            }}
          >
            <Table size="small">
              <TableHead sx={{ bgcolor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'grey.100' }}>
                <TableRow>
                  {showCheckboxes && (
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={
                          visibleSelectionIds.length > 0 &&
                          visibleSelectionIds.every((id) => selectedIds.includes(id))
                        }
                        indeterminate={
                          visibleSelectionIds.some((id) => selectedIds.includes(id)) &&
                          !visibleSelectionIds.every((id) => selectedIds.includes(id))
                        }
                        onChange={() => handleSelectAll(visibleSelectionIds)}
                      />
                    </TableCell>
                  )}
                  <TableCell sx={{ fontWeight: 700, minWidth: 160 }}>
                    {viewMode === 'grouped' ? 'Strategy (Best Pass)' : 'Strategy'}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 90 }} align="center">Result</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 120 }} align="center">Profit</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 95 }} align="center">Profit Factor</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 110 }} align="center">Recovery Factor</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 100 }} align="center">Sharpe Ratio</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 110 }} align="center">Equity DD %</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 85 }} align="center">Trades</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 105 }} align="center">Backtest Runs</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 120 }} align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loadingResults ? (
                  Array.from({ length: Math.min(rowsPerPage, 10) }, (_, index) => (
                    <TableRow key={`optimization-loading-${index}`} sx={{ '& td': { py: 1.25 } }}>
                      {showCheckboxes && <TableCell padding="checkbox"><Skeleton animation="wave" variant="rounded" width={18} height={18} /></TableCell>}
                      {Array.from({ length: 10 }, (__, cellIndex) => (
                        <TableCell key={cellIndex} align={cellIndex === 0 ? 'left' : 'center'}>
                          <Skeleton
                            animation="wave"
                            variant="text"
                            width={cellIndex === 0 ? 130 : 68}
                            sx={{ mx: cellIndex === 0 ? 0 : 'auto' }}
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : pagedResults.length === 0 ? (

                  <TableRow>
                    <TableCell colSpan={showCheckboxes ? 11 : 10} align="center" sx={{ py: 5 }}>
                      <Typography variant="body1" color="text.secondary" fontWeight={600}>
                        No optimization results match your active filter criteria.
                      </Typography>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => {
                          setInputFilters({ search: '', symbol: 'ALL', strategy: 'ALL', status: 'ALL', backtestRuns: 'ALL' });
                          setAppliedFilters({ search: '', symbol: 'ALL', strategy: 'ALL', status: 'ALL', backtestRuns: 'ALL' });
                          setWatchlistOnly(false);
                        }}
                        sx={{ mt: 1.5, textTransform: 'none', fontWeight: 600, borderRadius: 1.25 }}
                      >
                        Reset All Filters
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  pagedResults.map((row) => {
                    const isExpanded = !!expandedStrategies[row.strategy];
                    const subRows = strategySubRows[row.strategy] || [];
                    const isLoadingSub = !!loadingSubRows[row.strategy];
                    const strategySelectionIds = Array.from(new Set([row.id, ...subRows.map((subRow) => subRow.id)]));
                    const selectedStrategyCount = strategySelectionIds.filter((id) => selectedIds.includes(id)).length;
                    const isSelected = selectedStrategyCount === strategySelectionIds.length;
                    const isPartiallySelected = selectedStrategyCount > 0 && !isSelected;

                    return (
                      <Fragment key={viewMode === 'grouped' ? (row.strategy || row.id) : row.id}>
                        <TableRow
                          hover
                          selected={isSelected}
                          sx={{
                            transition: 'background-color 0.15s',
                            cursor: viewMode === 'grouped' ? 'pointer' : 'default',
                            bgcolor: isExpanded
                              ? (isDark ? 'rgba(24, 144, 255, 0.08)' : 'rgba(24, 144, 255, 0.04)')
                              : 'inherit',
                            '&:hover': {
                              bgcolor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'grey.100'
                            }
                          }}
                        >
                          {/* Checkbox */}
                          {showCheckboxes && (
                            <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                size="small"
                                checked={isSelected}
                                indeterminate={isPartiallySelected}
                                onChange={() => handleSelectStrategyResults(row, subRows)}
                              />
                            </TableCell>
                          )}

                          {/* Strategy */}
                          <TableCell onClick={() => viewMode === 'grouped' && handleToggleExpandStrategy(row.strategy)}>
                            <Stack direction="row" spacing={0.75} alignItems="center">
                              {viewMode === 'grouped' && (
                                <IconButton
                                  size="small"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleExpandStrategy(row.strategy);
                                  }}
                                  sx={{ p: 0.25, color: isExpanded ? 'primary.main' : 'text.secondary' }}
                                >
                                  {isExpanded ? <DownOutlined style={{ fontSize: 13 }} /> : <RightOutlined style={{ fontSize: 13 }} />}
                                </IconButton>
                              )}
                              <Tooltip title={row.isWatchlist ? 'Remove from Watchlist' : 'Add to Watchlist'}>
                                <IconButton
                                  size="small"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleWatchlist(row.id);
                                  }}
                                  sx={{ color: row.isWatchlist ? '#faad14' : 'text.disabled', p: 0.25 }}
                                >
                                  {row.isWatchlist ? <StarFilled style={{ fontSize: 16 }} /> : <StarOutlined style={{ fontSize: 16 }} />}
                                </IconButton>
                              </Tooltip>
                              <Box>
                                <Stack direction="row" spacing={0.75} alignItems="center">
                                  <Typography variant="subtitle2" fontWeight={700}>
                                    {row.strategy}
                                  </Typography>
                                  {viewMode === 'grouped' && (
                                    <Chip
                                      label={`${row.totalPasses ? row.totalPasses.toLocaleString() : 1} passes`}
                                      size="small"
                                      color="primary"
                                      variant="outlined"
                                      sx={{ height: 20, fontSize: '0.68rem', fontWeight: 600 }}
                                    />
                                  )}
                                </Stack>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem', display: 'block' }}>
                                  {viewMode === 'grouped' ? `Best Pass #${row.passNumber}` : `#${row.passNumber}`}
                                </Typography>
                              </Box>
                            </Stack>
                          </TableCell>

                          {/* Result */}
                          <TableCell align="center">
                            <Typography variant="subtitle2" fontWeight={700} color="primary.main">
                              {row.result !== undefined && row.result !== null ? Number(row.result).toFixed(2) : '-'}
                            </Typography>
                          </TableCell>

                          {/* Profit */}
                          <TableCell align="center">
                            <Typography variant="subtitle2" fontWeight={700} color={row.profit >= 0 ? 'success.main' : 'error.main'}>
                              {row.profit >= 0 ? '+' : ''}${row.profit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Payoff: ${row.expectedPayoff.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </Typography>
                          </TableCell>

                          {/* Profit Factor */}
                          <TableCell align="center">
                            <Typography variant="body2" fontWeight={700} color={row.profitFactor >= 2.0 ? 'success.main' : 'text.primary'}>
                              {row.profitFactor.toFixed(2)}
                            </Typography>
                          </TableCell>

                          {/* Recovery Factor */}
                          <TableCell align="center">
                            <Typography variant="body2" fontWeight={700} color={row.recoveryFactor >= 3.0 ? 'primary.main' : 'text.primary'}>
                              {row.recoveryFactor.toFixed(2)}
                            </Typography>
                          </TableCell>

                          {/* Sharpe Ratio */}
                          <TableCell align="center">
                            <Typography variant="body2" fontWeight={700}>
                              {row.sharpeRatio.toFixed(2)}
                            </Typography>
                          </TableCell>

                          {/* Equity DD % */}
                          <TableCell align="center">
                            <Typography
                              variant="subtitle2"
                              fontWeight={700}
                              color={row.drawdownPct <= 10 ? 'success.main' : row.drawdownPct <= 15 ? 'warning.main' : 'error.main'}
                            >
                              {row.drawdownPct.toFixed(2)}%
                            </Typography>
                            {row.drawdownDollar > 0 && (
                              <Typography variant="caption" color="text.secondary">
                                ${row.drawdownDollar.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </Typography>
                            )}
                          </TableCell>

                          {/* Trades */}
                          <TableCell align="center">
                            <Typography variant="body2" fontWeight={600}>
                              {row.trades}
                            </Typography>
                            {row.winRate > 0 && (
                              <Typography variant="caption" color="text.secondary">
                                Win: {(row.winRate * 100).toFixed(1)}%
                              </Typography>
                            )}
                          </TableCell>

                          {/* Backtest Runs */}
                          <TableCell align="center">
                            <Chip
                              label={row.backtestRunCount > 0 ? row.backtestRunCount : '-'}
                              size="small"
                              color={row.backtestRunCount > 0 ? 'success' : 'default'}
                              variant={row.backtestRunCount > 0 ? 'filled' : 'outlined'}
                              sx={{ minWidth: 32, height: 22, fontWeight: 700 }}
                            />
                          </TableCell>

                          {/* Actions */}
                          <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                            <Stack direction="row" spacing={0.5} justifyContent="center" alignItems="center">
                              {/* Pick and immediately dispatch Every Tick */}
                              <Tooltip title={candidateIds.includes(row.id) ? 'Every Tick is queued or running' : selectedIds.length > 1 ? `Start Every Tick for ${selectedIds.length} selected parameter sets` : 'Start Every Tick backtest'}>
                                <IconButton
                                  size="small"
                                  disabled={candidateIds.includes(row.id) || startingCandidateIds.includes(row.id)}
                                  onClick={() => handleStartCandidate(row.id)}
                                  sx={{
                                    color: candidateIds.includes(row.id) ? '#ffffff' : isDark ? '#d3adf7' : '#722ed1',
                                    bgcolor: candidateIds.includes(row.id) ? '#722ed1' : isDark ? 'rgba(114, 46, 209, 0.12)' : '#f9f0ff',
                                    border: '1px solid',
                                    borderColor: candidateIds.includes(row.id) ? '#722ed1' : isDark ? 'rgba(114, 46, 209, 0.35)' : '#d3adf7',
                                    transition: 'all 0.15s ease-in-out',
                                    '&:hover': {
                                      bgcolor: candidateIds.includes(row.id) ? '#531dab' : isDark ? 'rgba(114, 46, 209, 0.25)' : '#efdbff',
                                      borderColor: '#722ed1',
                                      transform: 'scale(1.06)'
                                    },
                                    '&.Mui-disabled': {
                                      color: '#ffffff',
                                      bgcolor: isDark ? '#722ed1' : '#722ed1',
                                      borderColor: isDark ? '#b37feb' : '#722ed1',
                                      opacity: 0.82
                                    }
                                  }}
                                >
                                  {startingCandidateIds.includes(row.id) ? <CircularProgress size={14} color="inherit" /> : <Pointer size={14} />}
                                </IconButton>
                              </Tooltip>

                              {/* View Candidate Details */}
                              <Tooltip title="View Candidate Parameters & Equity">
                                <IconButton
                                  size="small"
                                  onClick={() => {
                                    setSelectedResult(row);
                                    setDetailsOpen(true);
                                  }}
                                  sx={{
                                    color: 'primary.main',
                                    bgcolor: isDark ? 'rgba(24, 144, 255, 0.1)' : '#e6f7ff',
                                    '&:hover': { bgcolor: 'primary.main', color: '#fff' }
                                  }}
                                >
                                  <EyeOutlined style={{ fontSize: 14 }} />
                                </IconButton>
                              </Tooltip>

                              {/* Copy SET Config */}
                              <Tooltip title={copiedId === row.id ? 'Copied SET Parameters!' : 'Copy Parameter Config'}>
                                <IconButton
                                  size="small"
                                  onClick={() => handleCopyId(row.id)}
                                  sx={{
                                    color: copiedId === row.id ? 'success.main' : 'text.secondary',
                                    bgcolor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'grey.100',
                                    '&:hover': { color: 'primary.main' }
                                  }}
                                >
                                  {copiedId === row.id ? <CheckOutlined style={{ fontSize: 14 }} /> : <CopyOutlined style={{ fontSize: 14 }} />}
                                </IconButton>
                              </Tooltip>
                            </Stack>
                          </TableCell>
                        </TableRow>

                        {/* Collapsible Sub-Row for Grouped Mode */}
                        {viewMode === 'grouped' && isExpanded && (
                          <TableRow sx={{ bgcolor: isDark ? 'rgba(0, 0, 0, 0.25)' : 'grey.50' }}>
                            <TableCell colSpan={showCheckboxes ? 11 : 10} sx={{ py: 1.5, px: { xs: 1, sm: 3 } }}>
                              {isLoadingSub ? (
                                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 2, px: 2 }}>
                                  <CircularProgress size={16} color="primary" />
                                  <Typography variant="body2" color="primary.main" fontWeight={600}>
                                    Loading parameter sets for {row.strategy}...
                                  </Typography>
                                </Stack>
                              ) : subRows.length === 0 ? (
                                <Typography variant="body2" color="text.secondary" sx={{ py: 1.5, px: 2 }}>
                                  No additional parameter sets match the active filter criteria for this strategy.
                                </Typography>
                              ) : (
                                <Box
                                  sx={{
                                    border: '1px solid',
                                    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'grey.300',
                                    borderRadius: 1.5,
                                    overflow: 'hidden',
                                    bgcolor: isDark ? 'background.paper' : '#ffffff'
                                  }}
                                >
                                  <Box
                                    sx={{
                                      px: 2,
                                      py: 1,
                                      bgcolor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'grey.100',
                                      borderBottom: '1px solid',
                                      borderColor: 'divider',
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center'
                                    }}
                                  >
                                    <Typography variant="subtitle2" fontWeight={700} color="primary.main">
                                      Parameter Sets for {row.strategy} ({subRows.length} sets shown)
                                    </Typography>
                                    <Button
                                      size="small"
                                      variant="text"
                                      onClick={() => {
                                        setInputFilters((p) => ({ ...p, strategy: row.strategy }));
                                        setAppliedFilters((p) => ({ ...p, strategy: row.strategy }));
                                        handleSwitchViewMode('flat');
                                      }}
                                      sx={{ textTransform: 'none', fontSize: '0.75rem', fontWeight: 600 }}
                                    >
                                      View All in Flat Mode →
                                    </Button>
                                  </Box>
                                  <Table size="small">
                                    <TableHead sx={{ bgcolor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'grey.50' }}>
                                      <TableRow>
                                        {showCheckboxes && (
                                          <TableCell padding="checkbox" sx={{ width: 40 }}>
                                            <Checkbox
                                              size="small"
                                              checked={subRows.length > 0 && subRows.every((subRow) => selectedIds.includes(subRow.id))}
                                              indeterminate={
                                                subRows.some((subRow) => selectedIds.includes(subRow.id))
                                                && !subRows.every((subRow) => selectedIds.includes(subRow.id))
                                              }
                                              onChange={() => handleSelectAll(subRows.map((subRow) => subRow.id))}
                                            />
                                          </TableCell>
                                        )}
                                        <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Pass #</TableCell>
                                        <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }} align="center">Result</TableCell>
                                        <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }} align="center">Profit</TableCell>
                                        <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }} align="center">Profit Factor</TableCell>
                                        <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }} align="center">Recovery Factor</TableCell>
                                        <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }} align="center">Sharpe Ratio</TableCell>
                                        <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }} align="center">Equity DD %</TableCell>
                                        <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }} align="center">Trades</TableCell>
                                        <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }} align="center">Backtest Runs</TableCell>
                                        <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }} align="center">Actions</TableCell>
                                      </TableRow>
                                    </TableHead>
                                    <TableBody>
                                      {subRows.map((sub) => {
                                        const isSubSelected = selectedIds.includes(sub.id);
                                        return (
                                          <TableRow key={sub.id} hover selected={isSubSelected}>
                                            {showCheckboxes && (
                                              <TableCell padding="checkbox">
                                                <Checkbox
                                                  size="small"
                                                  checked={isSubSelected}
                                                  onChange={() => handleToggleSelect(sub.id)}
                                                />
                                              </TableCell>
                                            )}
                                            <TableCell>
                                              <Stack direction="row" spacing={0.5} alignItems="center">
                                                <Tooltip title={sub.isWatchlist ? 'Remove from Watchlist' : 'Add to Watchlist'}>
                                                  <IconButton
                                                    size="small"
                                                    onClick={() => handleToggleWatchlist(sub.id)}
                                                    sx={{ color: sub.isWatchlist ? '#faad14' : 'text.disabled', p: 0.2 }}
                                                  >
                                                    {sub.isWatchlist ? <StarFilled style={{ fontSize: 14 }} /> : <StarOutlined style={{ fontSize: 14 }} />}
                                                  </IconButton>
                                                </Tooltip>
                                                <Typography variant="body2" fontWeight={600}>
                                                  #{sub.passNumber}
                                                </Typography>
                                              </Stack>
                                            </TableCell>
                                            <TableCell align="center">
                                              <Typography variant="body2" fontWeight={600} color="primary.main">
                                                {sub.result !== undefined && sub.result !== null ? Number(sub.result).toFixed(2) : '-'}
                                              </Typography>
                                            </TableCell>
                                            <TableCell align="center">
                                              <Typography variant="body2" fontWeight={600} color={sub.profit >= 0 ? 'success.main' : 'error.main'}>
                                                {sub.profit >= 0 ? '+' : ''}${sub.profit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                              </Typography>
                                            </TableCell>
                                            <TableCell align="center">
                                              <Typography variant="body2">
                                                {sub.profitFactor.toFixed(2)}
                                              </Typography>
                                            </TableCell>
                                            <TableCell align="center">
                                              <Typography variant="body2">
                                                {sub.recoveryFactor.toFixed(2)}
                                              </Typography>
                                            </TableCell>
                                            <TableCell align="center">
                                              <Typography variant="body2">
                                                {sub.sharpeRatio.toFixed(2)}
                                              </Typography>
                                            </TableCell>
                                            <TableCell align="center">
                                              <Typography variant="body2" color={sub.drawdownPct <= 10 ? 'success.main' : sub.drawdownPct <= 15 ? 'warning.main' : 'error.main'} fontWeight={600}>
                                                {sub.drawdownPct.toFixed(2)}%
                                              </Typography>
                                            </TableCell>
                                            <TableCell align="center">
                                              <Typography variant="body2">
                                                {sub.trades.toLocaleString()}
                                              </Typography>
                                            </TableCell>
                                            <TableCell align="center">
                                              <Chip
                                                label={sub.backtestRunCount > 0 ? sub.backtestRunCount : '-'}
                                                size="small"
                                                color={sub.backtestRunCount > 0 ? 'success' : 'default'}
                                                variant={sub.backtestRunCount > 0 ? 'filled' : 'outlined'}
                                                sx={{ minWidth: 30, height: 20, fontWeight: 700, fontSize: '0.7rem' }}
                                              />
                                            </TableCell>
                                            <TableCell align="center">
                                              <Stack direction="row" spacing={0.5} justifyContent="center" alignItems="center">
                                                <Tooltip title="View Optimization Inputs / Settings">
                                                  <IconButton size="small" color="primary" onClick={() => handleOpenDetails(sub)}>
                                                    <EyeOutlined style={{ fontSize: 14 }} />
                                                  </IconButton>
                                                </Tooltip>
                                                <Tooltip title={candidateIds.includes(sub.id) ? 'Every Tick is queued or running' : selectedIds.length > 1 ? `Start Every Tick for ${selectedIds.length} selected parameter sets` : 'Start Every Tick backtest'}>
                                                  <IconButton
                                                    size="small"
                                                    disabled={candidateIds.includes(sub.id) || startingCandidateIds.includes(sub.id)}
                                                    onClick={() => handleStartCandidate(sub.id)}
                                                    sx={{
                                                      color: candidateIds.includes(sub.id) ? '#ffffff' : isDark ? '#d3adf7' : '#722ed1',
                                                      bgcolor: candidateIds.includes(sub.id) ? '#722ed1' : isDark ? 'rgba(114, 46, 209, 0.12)' : '#f9f0ff',
                                                      border: '1px solid',
                                                      borderColor: candidateIds.includes(sub.id) ? '#722ed1' : isDark ? 'rgba(114, 46, 209, 0.35)' : '#d3adf7',
                                                      p: 0.25,
                                                      '&.Mui-disabled': {
                                                        color: '#ffffff',
                                                        bgcolor: '#722ed1',
                                                        borderColor: isDark ? '#b37feb' : '#722ed1',
                                                        opacity: 0.82
                                                      }
                                                    }}
                                                  >
                                                    {startingCandidateIds.includes(sub.id) ? <CircularProgress size={14} color="inherit" /> : <Pointer size={14} />}
                                                  </IconButton>
                                                </Tooltip>
                                              </Stack>
                                            </TableCell>
                                          </TableRow>
                                        );
                                      })}
                                    </TableBody>
                                  </Table>
                                </Box>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Table Pagination */}
          <TablePagination
            component="div"
            count={totalResults}
            page={page}
            disabled={loadingResults}
            onPageChange={(_, newPage) => {
              if (loadingResults || paginationLockedRef.current) return;
              if (cursorPaginationEnabled && newPage > page && !resultCursorsRef.current[newPage]) return;
              paginationLockedRef.current = true;
              setLoadingResults(true);
              setPage(newPage);
            }}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              resultsAbortControllerRef.current?.abort();
              resultCursorsRef.current = { 0: null };
              paginationLockedRef.current = true;
              setLoadingResults(true);
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[5, 10, 25, 50]}
            sx={{
              borderTop: '1px solid',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'divider',
              bgcolor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'grey.50',
              color: isDark ? 'grey.300' : 'text.primary',
              '& .MuiTablePagination-toolbar': {
                minHeight: 48,
                px: { xs: 1.5, sm: 2 }
              },
              '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': {
                color: isDark ? 'grey.300' : 'text.secondary',
                fontSize: '0.8125rem',
                fontWeight: 600
              },
              '& .MuiTablePagination-select': {
                color: isDark ? '#e6f7ff' : 'text.primary',
                fontWeight: 700,
                fontSize: '0.8125rem',
                bgcolor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
                borderRadius: 1,
                py: 0.5,
                px: 1
              },
              '& .MuiTablePagination-selectIcon': {
                color: isDark ? 'primary.main' : 'inherit'
              },
              '& .MuiTablePagination-actions': {
                ml: 1.5,
                '& .MuiIconButton-root': {
                  color: isDark ? '#ffffff' : 'text.primary',
                  border: '1px solid',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.25)' : 'grey.300',
                  bgcolor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#ffffff',
                  borderRadius: 1,
                  p: '6px',
                  mx: '3px',
                  transition: 'all 0.2s',
                  '&:hover:not(.Mui-disabled)': {
                    borderColor: 'primary.main',
                    color: 'primary.main',
                    bgcolor: isDark ? 'rgba(24, 144, 255, 0.25)' : 'rgba(24, 144, 255, 0.12)'
                  },
                  '&.Mui-disabled': {
                    color: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.26)',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
                    bgcolor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'transparent'
                  }
                }
              }
            }}
          />
        </Stack>
      </MainCard>

      {/* ── DIALOG: RUN OPTIMIZATION AGAIN WITH NEW FILTER ── */}
      <Dialog
        open={bulkBacktestDialogOpen}
        onClose={() => {
          if (!bulkBacktestSubmitting) setBulkBacktestDialogOpen(false);
        }}
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
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.25, pb: 1 }}>
          <Pointer size={20} color={theme.palette.primary.main} />
          <Typography variant="h5" fontWeight={700}>Confirm Every Tick Backtest</Typography>
        </DialogTitle>
        <DialogContent dividers sx={{ borderColor: 'divider', py: 2.5 }}>
          <Typography variant="body1">
            Start Every Tick backtest for <strong>{bulkBacktestIds.length}</strong> selected parameter set(s)?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Each parameter set will be added to the backtest queue as a separate job.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.5 }}>
          <Button
            variant="outlined"
            disabled={bulkBacktestSubmitting}
            onClick={() => setBulkBacktestDialogOpen(false)}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={bulkBacktestSubmitting}
            startIcon={bulkBacktestSubmitting ? <CircularProgress size={14} color="inherit" /> : <Pointer size={14} />}
            onClick={handleConfirmBulkBacktest}
          >
            Start {bulkBacktestIds.length} Backtests
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={reRunDialogOpen}
        onClose={() => setReRunDialogOpen(false)}
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
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
          <RocketOutlined style={{ fontSize: 20, color: theme.palette.primary.main }} />
          <Typography variant="h5" fontWeight={700}>
            Run Optimization Again with New Filter
          </Typography>
        </DialogTitle>

        <DialogContent dividers sx={{ borderColor: 'divider' }}>
          <Stack spacing={2.5} sx={{ mt: 0.5 }}>
            <Alert severity="info" sx={{ borderRadius: 1.25 }}>
              This action will dispatch a new genetic optimization cycle focused around the parameter boundaries of top-performing candidates.
            </Alert>

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.75, fontWeight: 600 }}>
                Target Session Name <span style={{ color: 'red' }}>*</span>
              </Typography>
              <OutlinedInput
                fullWidth
                size="small"
                value={reRunSessionName}
                onChange={(e) => setReRunSessionName(e.target.value)}
                sx={{ borderRadius: 1.25 }}
              />
            </Box>

            <Grid container spacing={2}>
              <Grid size={{ xs: 6 }}>
                <Typography variant="subtitle2" sx={{ mb: 0.75, fontWeight: 600 }}>
                  OptimiRun Cycles
                </Typography>
                <OutlinedInput
                  fullWidth
                  type="number"
                  size="small"
                  value={reRunCycles}
                  onChange={(e) => setReRunCycles(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  endAdornment={<InputAdornment position="end">cycles</InputAdornment>}
                  sx={{ borderRadius: 1.25 }}
                />
              </Grid>

              <Grid size={{ xs: 6 }}>
                <Typography variant="subtitle2" sx={{ mb: 0.75, fontWeight: 600 }}>
                  Focus Filter Criteria
                </Typography>
                <FormControl fullWidth size="small">
                  <Select defaultValue="top_candidates" sx={{ borderRadius: 1.25 }}>
                    <MenuItem value="top_candidates">Top 10% Passed Candidates</MenuItem>
                    <MenuItem value="watchlist_only">My Watchlist Candidates</MenuItem>
                    <MenuItem value="all_qualified">All Filter-Compliant Sets</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 1.5 }}>
          <Button
            variant="outlined"
            size="small"
            onClick={() => setReRunDialogOpen(false)}
            sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 1.25 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            size="small"
            onClick={handleExecuteReRun}
            startIcon={<RocketOutlined />}
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 1.25, px: 2 }}
          >
            Launch Re-Optimization
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── DIALOG: CANDIDATE PARAMETERS & DETAILS ── */}
      <Dialog
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2.5,
            bgcolor: isDark ? '#1e2632' : '#ffffff',
            backgroundImage: 'none',
            border: '1px solid',
            borderColor: 'divider',
            p: { xs: 1, sm: 1.5 },
            width: { xs: '96vw', md: '80vw', lg: '1000px' }
          }
        }}
      >
        {selectedResult && (
          <>
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <BarChartOutlined style={{ fontSize: 20, color: theme.palette.primary.main }} />
                <Box>
                  <Typography variant="h5" fontWeight={700}>
                    Pass #{selectedResult.passNumber} — {selectedResult.strategy}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {selectedResult.symbol} ({selectedResult.timeframe}) • {selectedResult.session}
                  </Typography>
                </Box>
              </Stack>
            </DialogTitle>

            <DialogContent dividers sx={{ borderColor: 'divider' }}>
              <Grid container spacing={2} sx={{ mb: 2.5, width: '100%' }}>
                <Grid size={{ xs: 6, sm: 2 }}>
                  <Typography variant="caption" color="text.secondary">Result</Typography>
                  <Typography variant="body1" fontWeight={700} color="primary.main">
                    {selectedResult.result !== undefined && selectedResult.result !== null ? Number(selectedResult.result).toFixed(2) : '-'}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 2 }}>
                  <Typography variant="caption" color="text.secondary">Profit</Typography>
                  <Typography variant="body1" fontWeight={700} color="success.main">
                    +${selectedResult.profit.toLocaleString()}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 2 }}>
                  <Typography variant="caption" color="text.secondary">PF / Recovery F.</Typography>
                  <Typography variant="body1" fontWeight={700}>
                    {selectedResult.profitFactor.toFixed(2)} / {selectedResult.recoveryFactor.toFixed(2)}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 2 }}>
                  <Typography variant="caption" color="text.secondary">Sharpe Ratio</Typography>
                  <Typography variant="body1" fontWeight={700}>
                    {selectedResult.sharpeRatio.toFixed(2)}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 2 }}>
                  <Typography variant="caption" color="text.secondary">Equity DD %</Typography>
                  <Typography variant="body1" fontWeight={700} color={selectedResult.drawdownPct <= 10 ? 'success.main' : 'warning.main'}>
                    {selectedResult.drawdownPct}%
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 2 }}>
                  <Typography variant="caption" color="text.secondary">Trades</Typography>
                  <Typography variant="body1" fontWeight={700}>
                    {selectedResult.trades} {selectedResult.winRate > 0 ? `(${selectedResult.winRate}%)` : ''}
                  </Typography>
                </Grid>
              </Grid>

              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                Optimal Input Parameters:
              </Typography>
              <Paper
                variant="outlined"
                sx={{
                  bgcolor: isDark ? '#0d1117' : 'grey.50',
                  p: 2,
                  borderRadius: 1.5
                }}
              >
                <Grid container spacing={1.5}>
                  {Object.entries(selectedResult.parameters).map(([key, val]) => (
                    <Grid key={key} size={{ xs: 12, sm: 6, md: 4 }}>
                      <Stack direction="row" justifyContent="space-between" sx={{ py: 0.5, borderBottom: '1px dashed', borderColor: 'divider' }}>
                        <Typography variant="caption" color="text.secondary" fontWeight={600}>
                          {key}:
                        </Typography>
                        <Typography variant="caption" fontWeight={700} color="primary.main">
                          {String(val)}
                        </Typography>
                      </Stack>
                    </Grid>
                  ))}
                </Grid>
              </Paper>
            </DialogContent>

            <DialogActions sx={{ px: 3, py: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Button
                variant="contained"
                color="primary"
                size="small"
                startIcon={<DownloadOutlined />}
                onClick={() => handleDownloadIni(selectedResult)}
                sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 1.25 }}
              >
                Download INI Config
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={() => setDetailsOpen(false)}
                sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 1.25 }}
              >
                Close
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      <Dialog
        open={cleanupDialogOpen}
        onClose={() => { if (!purging) setCleanupDialogOpen(false); }}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2, bgcolor: isDark ? '#1e2632' : '#ffffff', backgroundImage: 'none' } }}
      >
        <DialogTitle sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <ClearOutlined style={{ color: theme.palette.error.main }} />
            <Typography variant="h5" fontWeight={700}>Clean Unused Optimize Results</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ px: 3, py: 3, '&.MuiDialogContent-root': { pt: 3 } }}>
          {cleanupLoading ? (
            <LinearProgress />
          ) : (
            <Stack spacing={2}>
              <Alert severity="info">
                Watchlist results and all results linked to Backtest Candidates or Staging will be preserved.
              </Alert>
              {cleanupError && <Alert severity={cleanupStopRef.current ? 'info' : 'error'}>{cleanupError}</Alert>}
              {cleanupPreview && (
                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 6 }}><Chip label={`${Number(cleanupPreview.purgeable_results).toLocaleString()} removable`} color="error" variant="outlined" /></Grid>
                  <Grid size={{ xs: 6 }}><Chip label={`${Number(cleanupPreview.retained_results).toLocaleString()} retained`} color="success" variant="outlined" /></Grid>
                  <Grid size={{ xs: 6 }}><Typography variant="body2">Watchlist: <strong>{Number(cleanupPreview.watchlist_results).toLocaleString()}</strong></Typography></Grid>
                  <Grid size={{ xs: 6 }}><Typography variant="body2">With candidates: <strong>{Number(cleanupPreview.candidate_linked_results).toLocaleString()}</strong></Typography></Grid>
                </Grid>
              )}
              {Number(cleanupPreview?.active_job_count || 0) > 0 && (
                <Alert severity="warning">Finish or cancel all active jobs before cleaning this session.</Alert>
              )}
              {purging && (
                <Box>
                  <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
                    <Typography variant="body2" fontWeight={600}>
                      Deleted {cleanupDeleted.toLocaleString()} / {Number(cleanupPreview?.purgeable_results || 0).toLocaleString()}
                    </Typography>
                    <Typography variant="body2" fontWeight={700}>{cleanupProgress}%</Typography>
                  </Stack>
                  <LinearProgress variant="determinate" value={cleanupProgress} />
                </Box>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
          {purging ? (
            <Button variant="outlined" color="warning" onClick={() => { cleanupStopRef.current = true; }}>
              Stop after current chunk
            </Button>
          ) : (
            <>
              <Button variant="outlined" onClick={() => setCleanupDialogOpen(false)}>Cancel</Button>
              <Button
                variant="contained"
                color="error"
                startIcon={<ClearOutlined />}
                onClick={handlePurgeUnusedResults}
                disabled={
                  cleanupLoading || !cleanupPreview || Number(cleanupPreview.purgeable_results || 0) === 0 ||
                  Number(cleanupPreview.active_job_count || 0) > 0
                }
              >
                Clean unused results
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
