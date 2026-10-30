import { Fragment, useEffect, useState, useMemo } from 'react';
import dayjs from 'dayjs';

// material-ui
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
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
import MenuItem from '@mui/material/MenuItem';
import Menu from '@mui/material/Menu';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Alert from '@mui/material/Alert';
import Paper from '@mui/material/Paper';
import Checkbox from '@mui/material/Checkbox';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import ToggleButton from '@mui/material/ToggleButton';
import CircularProgress from '@mui/material/CircularProgress';
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';

// project imports
import MainCard from 'components/MainCard';
import {
  autoReviewMt5BacktestCandidates,
  getMt5BacktestCandidate,
  getMt5BacktestCandidateSparkline,
  deleteMt5BacktestCandidate,
  deleteMt5FilterPreference,
  getMt5FilterPreferences,
  isMt5SessionNotFoundError,
  listMt5BacktestCandidates,
  saveMt5FilterPreference,
  selectMt5Staging
} from 'api/mt5Optimization';
import { mapMt5BacktestResult } from 'utils/mt5Optimization';
import { compareStrategyCodes } from 'utils/strategyNaming';
import DateRangePickerBox from 'components/dashboard/DateRangePickerBox';

// assets - icons
import SearchOutlined from '@ant-design/icons/SearchOutlined';
import ReloadOutlined from '@ant-design/icons/ReloadOutlined';
import CheckCircleOutlined from '@ant-design/icons/CheckCircleOutlined';
import SlidersOutlined from '@ant-design/icons/SlidersOutlined';
import EyeOutlined from '@ant-design/icons/EyeOutlined';
import AimOutlined from '@ant-design/icons/AimOutlined';
import ThunderboltOutlined from '@ant-design/icons/ThunderboltOutlined';
import CloudServerOutlined from '@ant-design/icons/CloudServerOutlined';
import BarChartOutlined from '@ant-design/icons/BarChartOutlined';
import CopyOutlined from '@ant-design/icons/CopyOutlined';
import CheckOutlined from '@ant-design/icons/CheckOutlined';
import DeleteOutlined from '@ant-design/icons/DeleteOutlined';
import CalendarOutlined from '@ant-design/icons/CalendarOutlined';
import FilterOutlined from '@ant-design/icons/FilterOutlined';
import AppstoreOutlined from '@ant-design/icons/AppstoreOutlined';
import UnorderedListOutlined from '@ant-design/icons/UnorderedListOutlined';
import DownOutlined from '@ant-design/icons/DownOutlined';
import RightOutlined from '@ant-design/icons/RightOutlined';
import CheckSquareOutlined from '@ant-design/icons/CheckSquareOutlined';
import StarOutlined from '@ant-design/icons/StarOutlined';
import { ArrowDown, ArrowRightToLine, ArrowUp, ListOrdered } from 'lucide-react';

const DEFAULT_FILTER_RULES = {
  minProfit: '',
  minRecoveryFactor: '',
  trades: '',
  profitFactor: '',
  balanceDD: '',
  pdRatio: '',
  sharpeRatio: '',
  largestLossTrade: ''
};

const DEFAULT_TABLE_FILTERS = {
  search: '',
  symbol: 'ALL',
  strategy: 'ALL',
  status: 'ALL'
};

const FILTER_PREFERENCE_SCOPE = 'backtest_candidates';

const FILTER_RULE_FIELDS = [
  { key: 'minProfit', label: 'Profit ($) Min - Max' },
  { key: 'minRecoveryFactor', label: 'Recovery Factor Min - Max' },
  { key: 'trades', label: 'Trades (Min - Max)', nonNegative: true },
  { key: 'profitFactor', label: 'Profit Factor (Min - Max)', nonNegative: true },
  { key: 'balanceDD', label: 'Balance DD % (Min - Max)', nonNegative: true, percent: true },
  { key: 'pdRatio', label: 'P/D Ratio (Min - Max)' },
  { key: 'sharpeRatio', label: 'Sharpe Ratio (Min - Max)' },
  { key: 'largestLossTrade', label: 'Largest Loss Trade ($) Min - Max', nonNegative: true }
];

const FILTER_NUMBER_PATTERN = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)';
const FILTER_RANGE_PATTERN = new RegExp(`^(${FILTER_NUMBER_PATTERN})(?:\\s*-\\s*(${FILTER_NUMBER_PATTERN}))?$`);

const validateFilterRule = (field, rawValue) => {
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') return '';
  let value = String(rawValue).trim();
  if (field.percent && value.endsWith('%')) value = value.slice(0, -1).trim();
  const match = value.match(FILTER_RANGE_PATTERN);
  if (!match) return 'Use a number or min-max range.';
  const min = Number(match[1]);
  const max = match[2] === undefined ? null : Number(match[2]);
  if (field.nonNegative && (min < 0 || (max !== null && max < 0))) return 'Value cannot be negative.';
  if (max !== null && min > max) return 'Minimum cannot exceed maximum.';
  return '';
};

const normalizeFilterRules = (rules) => Object.fromEntries(
  FILTER_RULE_FIELDS.map((field) => {
    const value = String(rules[field.key] ?? '').trim();
    return [field.key, field.percent && value.endsWith('%') ? value.slice(0, -1).trim() : value];
  })
);

const AUTO_PICK_PRIORITY_OPTIONS = [
  { value: 'pd_ratio', label: 'Highest P/D Ratio' },
  { value: 'balance_drawdown_percent', label: 'Lowest Balance DD %' },
  { value: 'net_profit', label: 'Highest Net Profit' },
  { value: 'recovery_factor', label: 'Highest Recovery Factor' },
  { value: 'profit_factor', label: 'Highest Profit Factor' },
  { value: 'sharpe_ratio', label: 'Highest Sharpe Ratio' },
  { value: 'total_trades', label: 'Highest Trades' },
  { value: 'largest_loss_trade', label: 'Smallest Largest Loss' },
  { value: 'op_result', label: 'Highest Open Price Result' }
];

const DEFAULT_AUTO_PICK_PRIORITY = AUTO_PICK_PRIORITY_OPTIONS.map((option) => option.value);

const parseMt5Date = (value) => {
  const normalized = String(value || '').trim().replace(/^(\d{4})\.(\d{2})\.(\d{2})/, '$1-$2-$3');
  const timestamp = new Date(normalized.replace(' ', 'T')).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

const formatDetailValue = (value) => {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value.toLocaleString('en-US', { maximumFractionDigits: 8 });
  return String(value);
};

const formatDetailLabel = (value) =>
  String(value || '')
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();

const toMt5Number = (value) => {
  const parsed = Number(String(value ?? '').replace(/\s/g, '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildBalanceSeries = (deals = [], settings = {}) => {
  if (!Array.isArray(deals) || deals.length === 0) return [];
  const sortedDeals = [...deals]
    .map((deal) => ({ ...deal, timestamp: parseMt5Date(deal.time ?? deal.Time) }))
    .filter((deal) => deal.timestamp !== null)
    .sort((a, b) => a.timestamp - b.timestamp);
  const depositDeal = sortedDeals.find((deal) => ['balance', 'credit', 'deposit'].includes(String(deal.type ?? deal.Type ?? '').toLowerCase()));
  const initialDeposit =
    toMt5Number(settings['Initial Deposit'] ?? settings.initialDeposit ?? settings.initial_deposit) ||
    toMt5Number(depositDeal?.profit ?? depositDeal?.Profit ?? depositDeal?.balance ?? depositDeal?.Balance);
  let balance = initialDeposit;
  let peakBalance = initialDeposit;

  return sortedDeals
    .filter((deal) => !['balance', 'credit', 'deposit', 'withdrawal'].includes(String(deal.type ?? deal.Type ?? '').toLowerCase()))
    .map((deal) => {
      const profit = toMt5Number(deal.profit ?? deal.Profit);
      const commission = toMt5Number(deal.commission ?? deal.Commission);
      const swap = toMt5Number(deal.swap ?? deal.Swap);
      balance += profit + commission + swap;
      peakBalance = Math.max(peakBalance, balance);
    return {
      timestamp: deal.timestamp,
      time: dayjs(deal.timestamp).format('YYYY-MM-DD HH:mm'),
      balance,
      drawdown: peakBalance - balance,
      profit,
      commission,
      swap,
      type: deal.type ?? deal.Type,
      direction: deal.direction ?? deal.Direction,
      volume: deal.volume ?? deal.Volume,
      deal: deal.deal ?? deal.Deal
    };
    });
};

const formatChartYAxis = (value) => {
  if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(0)}K`;
  return Number(value).toFixed(0);
};

const BalanceTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <Box sx={{ bgcolor: 'background.paper', p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1, boxShadow: 2 }}>
      <Typography variant="caption" display="block">{data.time}</Typography>
      <Typography variant="body2" fontWeight={600} color="primary.main">
        Cumulative Profit: ${data.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </Typography>
      <Typography variant="caption" display="block" color={data.drawdown > 0 ? 'error.main' : 'text.secondary'} fontWeight={600}>
        Drawdown: ${data.drawdown.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </Typography>
      <Typography variant="caption" display="block" color={data.profit >= 0 ? 'success.main' : 'error.main'}>
        Profit: {data.profit >= 0 ? '+' : ''}{data.profit.toFixed(2)}
      </Typography>
      <Typography variant="caption" display="block" color="error.main">Commission: {data.commission.toFixed(2)}</Typography>
      <Typography variant="caption" display="block" color={data.swap >= 0 ? 'success.main' : 'error.main'}>
        Swap: {data.swap >= 0 ? '+' : ''}{data.swap.toFixed(2)}
      </Typography>
      <Typography variant="caption" display="block" color="text.secondary">
        Deal: {data.deal ?? '-'} | {data.type || '-'} {data.direction ? `(${data.direction})` : ''} | Volume: {data.volume ?? '-'}
      </Typography>
    </Box>
  );
};

const MetricDelta = ({ current, baseline, inverse = false }) => {
  const currentValue = Number(current);
  const baselineValue = Number(baseline);
  if (!Number.isFinite(currentValue) || !Number.isFinite(baselineValue) || Math.abs(baselineValue) < 1e-9) return null;
  const delta = ((currentValue - baselineValue) / Math.abs(baselineValue)) * 100;
  const improved = inverse ? delta < 0 : delta > 0;
  const unchanged = Math.abs(delta) < 0.005;
  return (
    <Tooltip title={`Open Price: ${baselineValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}`} arrow>
      <Typography
        component="span"
        variant="caption"
        color={unchanged ? 'text.secondary' : improved ? 'success.main' : 'error.main'}
        sx={{ display: 'block', mt: 0.25, fontSize: '0.68rem', lineHeight: 1.2, whiteSpace: 'nowrap' }}
      >
        {delta > 0 ? '+' : ''}{delta.toFixed(2)}%
      </Typography>
    </Tooltip>
  );
};

const CandidateSparkline = ({ row, dateRange }) => {
  const [values, setValues] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setValues([]);
    getMt5BacktestCandidateSparkline(row.id, {
      start_date: dateRange?.mode !== 'full' ? dateRange?.from : null,
      end_date: dateRange?.mode !== 'full' ? dateRange?.to : null
    })
      .then((payload) => {
        if (active) setValues(Array.isArray(payload?.points) ? payload.points.map(Number).filter(Number.isFinite) : []);
      })
      .catch(() => {
        if (active) setValues([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [row.id, dateRange?.mode, dateRange?.from, dateRange?.to]);

  if (loading) {
    return (
      <Box sx={{ width: 160, height: 68, mx: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress size={14} />
      </Box>
    );
  }
  if (!values.length) {
    return (
      <Box sx={{ width: 160, height: 68, mx: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="caption" color="text.disabled">-</Typography>
      </Box>
    );
  }
  const baseline = values[0];
  const chartData = values.map((balance) => ({ balance: balance - baseline }));
  const isPositive = chartData[chartData.length - 1].balance >= 0;
  const lineColor = isPositive ? '#52c41a' : '#f5222d';
  const gradientId = `candidate-spark-${row.id}`;
  return (
    <Box sx={{ width: 160, height: 68, mx: 'auto' }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 8, right: 6, bottom: 8, left: 6 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity={0.35} />
              <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="balance"
            stroke={lineColor}
            strokeWidth={1.8}
            fill={`url(#${gradientId})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Box>
  );
};

const DetailList = ({ title, subtitle, values }) => {
  const entries = Object.entries(values || {});
  return (
    <Paper variant="outlined" sx={{ height: '100%', overflow: 'hidden', borderColor: 'divider' }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={700} lineHeight={1.2}>{title}</Typography>
          <Typography variant="caption" color="text.secondary">{subtitle}</Typography>
        </Box>
        <Typography variant="caption" color="text.secondary">{entries.length} fields</Typography>
      </Stack>
      <Box sx={{ height: 430, overflowY: 'auto', px: 2 }}>
        {entries.length === 0 ? (
          <Stack alignItems="center" justifyContent="center" sx={{ height: '100%' }}>
            <Typography variant="body2" color="text.secondary">No data available</Typography>
          </Stack>
        ) : (
          entries.map(([key, value]) => (
            <Box
              key={key}
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(160px, 0.9fr) minmax(0, 1.1fr)' },
                gap: { xs: 0.35, sm: 2 },
                alignItems: 'start',
                py: 1.15,
                borderBottom: '1px solid',
                borderColor: 'divider'
              }}
            >
              <Typography variant="body2" color="text.secondary" fontWeight={600} sx={{ overflowWrap: 'anywhere' }}>
                {formatDetailLabel(key)}
              </Typography>
              <Typography
                variant="body2"
                fontWeight={600}
                color="text.primary"
                sx={{ overflowWrap: 'anywhere', textAlign: { xs: 'left', sm: 'right' } }}
              >
                {formatDetailValue(value)}
              </Typography>
            </Box>
          ))
        )}
      </Box>
    </Paper>
  );
};

export default function BacktestCandidatesTab() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  // State
  const [candidates, setCandidates] = useState([]);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const showCheckboxes = selectionMode || selectedCandidateIds.length > 0;

  const handleToggleSelectCandidate = (id) => {
    setSelectedCandidateIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };
  const handleSelectAllCandidates = (visibleIds) => {
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedCandidateIds.includes(id));
    if (allSelected) {
      setSelectedCandidateIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedCandidateIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };
  const handleBulkStageCandidates = async () => {
    if (!selectedCandidateIds.length) return;
    try {
      await Promise.all(selectedCandidateIds.map((id) => selectMt5Staging(id, null, true)));
      setNotification({ type: 'success', message: `Staged ${selectedCandidateIds.length} candidate(s) for Backtest Staging.` });
      setSelectedCandidateIds([]);
      await loadCandidates();
    } catch (err) {
      setNotification({ type: 'error', message: err.message });
    }
  };
  const handleBulkDeleteCandidates = async () => {
    if (!selectedCandidateIds.length) return;
    try {
      await Promise.all(selectedCandidateIds.map((id) => deleteMt5BacktestCandidate(id)));
      setNotification({ type: 'success', message: `Deleted ${selectedCandidateIds.length} candidate(s).` });
      setSelectedCandidateIds([]);
      await loadCandidates();
    } catch (err) {
      setNotification({ type: 'error', message: err.message });
    }
  };
  const [filterRules, setFilterRules] = useState(DEFAULT_FILTER_RULES);
  const [appliedFilterRules, setAppliedFilterRules] = useState(DEFAULT_FILTER_RULES);
  const [filterRuleErrors, setFilterRuleErrors] = useState({});
  const [viewMode, setViewMode] = useState('grouped');
  const [expandedStrategies, setExpandedStrategies] = useState({});
  const [strategySubRows, setStrategySubRows] = useState({});
  const [loadingSubRows, setLoadingSubRows] = useState({});

  const [sessionId, setSessionId] = useState(() => localStorage.getItem('mt5_active_session_id') || '');

  // Date range filters the tested period stored by the Every Tick result.
  const [dateRangeMode, setDateRangeMode] = useState('full');
  const [dateRangeFrom, setDateRangeFrom] = useState('');
  const [dateRangeTo, setDateRangeTo] = useState('');
  const [appliedDateRange, setAppliedDateRange] = useState({ mode: 'full', from: null, to: null });
  const [commonDateRange, setCommonDateRange] = useState({ from: null, to: null, candidateCount: 0 });

  // Table Filters State
  const [inputFilters, setInputFilters] = useState(DEFAULT_TABLE_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(DEFAULT_TABLE_FILTERS);

  // Pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [serverTotalCandidates, setServerTotalCandidates] = useState(0);
  const [candidateSummary, setCandidateSummary] = useState(null);

  const loadCandidates = async (id = sessionId) => {
    if (!id) {
      setCandidates([]);
      setServerTotalCandidates(0);
      setCandidateSummary(null);
      return;
    }
    const metricParams = {};
    const ranges = {
      minProfit: 'profit',
      minRecoveryFactor: 'recovery_factor',
      trades: 'trades',
      profitFactor: 'profit_factor',
      balanceDD: 'balance_dd',
      pdRatio: 'pd_ratio',
      sharpeRatio: 'sharpe_ratio',
      largestLossTrade: 'largest_loss_trade'
    };
    Object.entries(ranges).forEach(([field, param]) => {
      const range = parseMinMax(appliedFilterRules[field]);
      if (range.min !== null) metricParams[`min_${param}`] = range.min;
      if (range.max !== null) metricParams[`max_${param}`] = range.max;
    });
    const payload = await listMt5BacktestCandidates({
      session_id: id,
      view: 'all',
      page: page + 1,
      page_size: rowsPerPage,
      search: appliedFilters.search,
      symbol: appliedFilters.symbol,
      strategy_id: appliedFilters.strategy === 'ALL' ? null : appliedFilters.strategy,
      state: 'BACKTESTED',
      group_by: viewMode === 'grouped' ? 'strategy' : null,
      include_common_range: 1,
      start_date: appliedDateRange.mode !== 'full' ? appliedDateRange.from : null,
      end_date: appliedDateRange.mode !== 'full' ? appliedDateRange.to : null,
      ...metricParams
    });
    setCandidates(payload.items.map(mapMt5BacktestResult));
    setServerTotalCandidates(payload.total);
    setCandidateSummary({
      total: Number(payload.summaryTotal) || 0,
      symbols: Number(payload.symbolCount) || 0,
      strategies: Number(payload.strategyCount) || 0,
      staged: Number(payload.stagedCount) || 0,
      synced: Number(payload.syncedCount) || 0
    });
    setCommonDateRange(payload.commonDateRange || { from: null, to: null, candidateCount: 0 });
  };
  useEffect(() => {
    const onSession = (event) => {
      setPage(0);
      setSessionId(event.detail?.sessionId || '');
    };
    window.addEventListener('mt5:session-change', onSession);
    loadCandidates().catch((error) => {
      if (isMt5SessionNotFoundError(error)) {
        localStorage.removeItem('mt5_active_session_id');
        setSessionId('');
        setNotification(null);
        return;
      }
      setNotification({ type: 'error', message: error.message });
    });
    return () => window.removeEventListener('mt5:session-change', onSession);
  }, [sessionId, page, rowsPerPage, appliedFilters, appliedFilterRules, appliedDateRange, viewMode]);

  // Dialogs
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [candidateDetail, setCandidateDetail] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [notification, setNotification] = useState(null);
  const [defaultFilterAnchorEl, setDefaultFilterAnchorEl] = useState(null);
  const [defaultFilterBusy, setDefaultFilterBusy] = useState(false);
  const [candidateToDelete, setCandidateToDelete] = useState(null);
  const [deletingCandidate, setDeletingCandidate] = useState(false);
  const [autoPickPriority, setAutoPickPriority] = useState(DEFAULT_AUTO_PICK_PRIORITY);
  const [priorityDialogOpen, setPriorityDialogOpen] = useState(false);
  const [autoReviewPreview, setAutoReviewPreview] = useState(null);
  const [autoReviewRequest, setAutoReviewRequest] = useState(null);
  const [autoReviewOpen, setAutoReviewOpen] = useState(false);
  const [autoReviewLoading, setAutoReviewLoading] = useState(false);
  const [autoReviewApplying, setAutoReviewApplying] = useState(false);
  const [stageConflictCandidate, setStageConflictCandidate] = useState(null);
  const [stageConflictApplying, setStageConflictApplying] = useState(false);


  // Helper to parse min-max string (e.g. "100-1200", "100000", "0-0")
  const parseMinMax = (str) => {
    if (str === undefined || str === null || str === '') return { min: null, max: null };
    const match = String(str).trim().match(FILTER_RANGE_PATTERN);
    if (!match) return { min: null, max: null };
    return { min: Number(match[1]), max: match[2] === undefined ? null : Number(match[2]) };
  };

  const buildCandidateMetricParams = () => {
    const params = {};
    const ranges = {
      minProfit: 'profit',
      minRecoveryFactor: 'recovery_factor',
      trades: 'trades',
      profitFactor: 'profit_factor',
      balanceDD: 'balance_dd',
      pdRatio: 'pd_ratio',
      sharpeRatio: 'sharpe_ratio',
      largestLossTrade: 'largest_loss_trade'
    };
    Object.entries(ranges).forEach(([field, param]) => {
      const range = parseMinMax(appliedFilterRules[field]);
      if (range.min !== null) params[`min_${param}`] = range.min;
      if (range.max !== null) params[`max_${param}`] = range.max;
    });
    return params;
  };

  const buildAutoReviewRequest = () => ({
    session_id: sessionId,
    search: appliedFilters.search,
    symbol: appliedFilters.symbol === 'ALL' ? null : appliedFilters.symbol,
    strategy_id: appliedFilters.strategy === 'ALL' ? null : appliedFilters.strategy,
    start_date: appliedDateRange.mode !== 'full' ? appliedDateRange.from : null,
    end_date: appliedDateRange.mode !== 'full' ? appliedDateRange.to : null,
    ranking_order: autoPickPriority,
    ...buildCandidateMetricParams()
  });

  const handleAutoPick = async () => {
    if (!sessionId) {
      setNotification({ type: 'warning', message: 'Select an Optimization Session before Auto Pick.' });
      return;
    }
    const request = buildAutoReviewRequest();
    try {
      setAutoReviewLoading(true);
      const preview = await autoReviewMt5BacktestCandidates(request);
      if (!preview.strategyCount) {
        setNotification({ type: 'warning', message: 'No Backtest Candidates match the active filters.' });
        return;
      }
      if (preview.replacedCount > 0 || preview.unchangedCount > 0) {
        setAutoReviewRequest(request);
        setAutoReviewPreview(preview);
        setAutoReviewOpen(true);
        return;
      }
      const result = await autoReviewMt5BacktestCandidates({
        ...request,
        apply: true,
        replace_existing: false
      });
      await loadCandidates();
      setNotification({
        type: 'success',
        message: `Auto Pick staged ${result.stagedCount} new candidate(s); existing selections were kept.`
      });
    } catch (error) {
      setNotification({ type: 'error', message: error.message });
    } finally {
      setAutoReviewLoading(false);
    }
  };

  const moveAutoPickPriority = (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= autoPickPriority.length) return;
    setAutoPickPriority((current) => {
      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  };

  const handleConfirmAutoReview = async (replaceExisting) => {
    if (!autoReviewRequest) return;
    try {
      setAutoReviewApplying(true);
      const result = await autoReviewMt5BacktestCandidates({
        ...autoReviewRequest,
        apply: true,
        replace_existing: replaceExisting
      });
      setAutoReviewOpen(false);
      setAutoReviewPreview(null);
      setAutoReviewRequest(null);
      await loadCandidates();
      setNotification({
        type: 'success',
        message: replaceExisting
          ? `Staged ${result.stagedCount} final candidate(s), including replacements.`
          : `Staged ${result.stagedCount} new candidate(s); kept ${result.skippedExistingCount} existing selection(s).`
      });
    } catch (error) {
      setNotification({ type: 'error', message: error.message });
    } finally {
      setAutoReviewApplying(false);
    }
  };

  const handleSwitchViewMode = (mode) => {
    if (mode === viewMode) return;
    setCandidates([]);
    setViewMode(mode);
    setPage(0);
    setExpandedStrategies({});
    setStrategySubRows({});
  };

  const handleToggleExpandStrategy = async (strategyId) => {
    const isExpanded = !!expandedStrategies[strategyId];
    setExpandedStrategies((prev) => ({ ...prev, [strategyId]: !isExpanded }));
    if (isExpanded || strategySubRows[strategyId]) return;

    try {
      setLoadingSubRows((prev) => ({ ...prev, [strategyId]: true }));
      const payload = await listMt5BacktestCandidates({
        session_id: sessionId,
        view: 'all',
        page: 1,
        page_size: 50,
        strategy_id: strategyId,
        state: 'BACKTESTED',
        start_date: appliedDateRange.mode !== 'full' ? appliedDateRange.from : null,
        end_date: appliedDateRange.mode !== 'full' ? appliedDateRange.to : null,
        ...buildCandidateMetricParams()
      });
      setStrategySubRows((prev) => ({
        ...prev,
        [strategyId]: (payload.items || []).map(mapMt5BacktestResult)
      }));
    } catch (error) {
      setNotification({ type: 'error', message: `Failed to load candidates for ${strategyId}: ${error.message}` });
    } finally {
      setLoadingSubRows((prev) => ({ ...prev, [strategyId]: false }));
    }
  };

  // Evaluate candidate against filter rules + date range
  const evaluateCandidateRules = (row, rules, dateRange = appliedDateRange) => {
    let isDisqualified = false;
    let reason = null;

    // 1. Min Profit ($)
    const { min: pMin, max: pMax } = parseMinMax(rules.minProfit);
    if (pMin !== null && row.profit < pMin) {
      isDisqualified = true;
      reason = `Profit ($${row.profit}) < Min ($${pMin})`;
    } else if (pMax !== null && row.profit > pMax) {
      isDisqualified = true;
      reason = `Profit ($${row.profit}) > Max ($${pMax})`;
    }

    // 2. Min Recovery Factor
    const { min: rfMin, max: rfMax } = parseMinMax(rules.minRecoveryFactor);
    if (!isDisqualified && rfMin !== null && row.recoveryFactor < rfMin) {
      isDisqualified = true;
      reason = `Recovery Factor (${row.recoveryFactor}) < Min (${rfMin})`;
    } else if (!isDisqualified && rfMax !== null && row.recoveryFactor > rfMax) {
      isDisqualified = true;
      reason = `Recovery Factor (${row.recoveryFactor}) > Max (${rfMax})`;
    }

    // 3. Trades (Min - Max)
    const { min: tMin, max: tMax } = parseMinMax(rules.trades);
    if (!isDisqualified && tMin !== null && row.trades < tMin) {
      isDisqualified = true;
      reason = `Trades (${row.trades}) < Min (${tMin})`;
    } else if (!isDisqualified && tMax !== null && row.trades > tMax) {
      isDisqualified = true;
      reason = `Trades (${row.trades}) > Max (${tMax})`;
    }

    // 4. Profit Factor (Min - Max)
    const { min: pfMin, max: pfMax } = parseMinMax(rules.profitFactor);
    if (!isDisqualified && pfMin !== null && row.profitFactor < pfMin) {
      isDisqualified = true;
      reason = `PF (${row.profitFactor}) < Min (${pfMin})`;
    } else if (!isDisqualified && pfMax !== null && row.profitFactor > pfMax) {
      isDisqualified = true;
      reason = `PF (${row.profitFactor}) > Max (${pfMax})`;
    }

    // 5. Balance DD % (Min - Max)
    const { min: ddMin, max: ddMax } = parseMinMax(rules.balanceDD);
    if (!isDisqualified && ddMin !== null && row.drawdownPct < ddMin) {
      isDisqualified = true;
      reason = `Balance DD (${row.drawdownPct}%) < Min (${ddMin}%)`;
    } else if (!isDisqualified && ddMax !== null && row.drawdownPct > ddMax) {
      isDisqualified = true;
      reason = `Balance DD (${row.drawdownPct}%) > Max (${ddMax}%)`;
    }

    // 6. P/D Ratio (Min - Max)
    const { min: pdMin, max: pdMax } = parseMinMax(rules.pdRatio);
    const rowPdRatio = row.pdRatio !== undefined ? Number(row.pdRatio) : row.profit / (row.drawdownDollar || 1);
    if (!isDisqualified && pdMin !== null && rowPdRatio < pdMin) {
      isDisqualified = true;
      reason = `P/D Ratio (${rowPdRatio.toFixed(2)}) < Min (${pdMin})`;
    } else if (!isDisqualified && pdMax !== null && rowPdRatio > pdMax) {
      isDisqualified = true;
      reason = `P/D Ratio (${rowPdRatio.toFixed(2)}) > Max (${pdMax})`;
    }

    // 7. Sharpe Ratio (Min - Max)
    const { min: srMin, max: srMax } = parseMinMax(rules.sharpeRatio);
    if (!isDisqualified && !(srMin === 0 && srMax === 0)) {
      if (srMin !== null && row.sharpeRatio < srMin) {
        isDisqualified = true;
        reason = `Sharpe (${row.sharpeRatio}) < Min (${srMin})`;
      } else if (srMax !== null && row.sharpeRatio > srMax) {
        isDisqualified = true;
        reason = `Sharpe (${row.sharpeRatio}) > Max (${srMax})`;
      }
    }

    // 8. Largest Loss Trade ($)
    const { min: lMin, max: lMax } = parseMinMax(rules.largestLossTrade);
    if (!isDisqualified && row.largestLossTrade !== undefined) {
      const lossMagnitude = Math.abs(Number(row.largestLossTrade) || 0);
      if (lMin !== null && lossMagnitude < lMin) {
        isDisqualified = true;
        reason = `Largest Loss ($${lossMagnitude}) < Min ($${lMin})`;
      } else if (lMax !== null && lossMagnitude > lMax) {
        isDisqualified = true;
        reason = `Largest Loss ($${lossMagnitude}) > Max limit ($${lMax})`;
      }
    }

    // 9. Backtest Date Range check (if not Full Period)
    if (!isDisqualified && dateRange && dateRange.mode !== 'full' && dateRange.from && dateRange.to) {
      if (row.startDate && row.startDate > dateRange.to) {
        isDisqualified = true;
        reason = `Start date (${row.startDate}) is after target range (${dateRange.to})`;
      } else if (row.endDate && row.endDate < dateRange.from) {
        isDisqualified = true;
        reason = `End date (${row.endDate}) is before target range (${dateRange.from})`;
      }
    }

    return { isDisqualified, reason };
  };

  // 4 Top KPI Metrics
  const metrics = useMemo(() => {
    const totalCandidates = candidateSummary?.total ?? serverTotalCandidates;
    const totalSymbols = candidateSummary?.symbols ?? 0;
    const totalStrategies = candidateSummary?.strategies ?? 0;
    const stagedCount = candidateSummary?.staged ?? 0;
    const syncedCount = candidateSummary?.synced ?? 0;

    return {
      totalCandidates,
      totalSymbols,
      totalStrategies,
      stagedCount,
      syncedCount
    };
  }, [candidateSummary, serverTotalCandidates]);

  // Filtered Candidates
  const filteredCandidates = useMemo(() => {
    return candidates
      .filter((row) => {
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

        const matchMetrics = !evaluateCandidateRules(row, appliedFilterRules, { mode: 'full', from: null, to: null }).isDisqualified;
        return matchSearch && matchSymbol && matchStrategy && matchStatus && matchMetrics;
      })
      .sort((a, b) =>
        compareStrategyCodes(a.strategy, b.strategy)
        || (Number(b.result) || 0) - (Number(a.result) || 0)
        || (Number(a.passNumber) || 0) - (Number(b.passNumber) || 0));
  }, [candidates, appliedFilters, appliedFilterRules]);

  const pagedCandidates = filteredCandidates;

  const handleLoadDefaultFilter = async () => {
    setDefaultFilterAnchorEl(null);
    setDefaultFilterBusy(true);
    try {
      const preferences = await getMt5FilterPreferences();
      const saved = preferences?.[FILTER_PREFERENCE_SCOPE];
      if (!saved) {
        setNotification({ type: 'info', message: 'No saved default filter for Backtest Performance Filters.' });
        return;
      }
      const savedMode = ['full', 'custom', 'auto_common'].includes(saved.dateRange?.mode) ? saved.dateRange.mode : 'full';
      setFilterRules({ ...DEFAULT_FILTER_RULES, ...(saved.filterRules || {}) });
      setInputFilters({ ...DEFAULT_TABLE_FILTERS, ...(saved.inputFilters || {}) });
      setDateRangeMode(savedMode);
      setDateRangeFrom(saved.dateRange?.from || '');
      setDateRangeTo(saved.dateRange?.to || '');
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
      await saveMt5FilterPreference(FILTER_PREFERENCE_SCOPE, {
        filterRules,
        inputFilters,
        dateRange: { mode: dateRangeMode, from: dateRangeFrom, to: dateRangeTo }
      });
      setNotification({ type: 'success', message: 'Current Backtest Performance Filters saved as your default.' });
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
      setNotification({ type: 'success', message: 'Saved Backtest Performance Filters default cleared.' });
    } catch (err) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setDefaultFilterBusy(false);
    }
  };

  // Apply Filter Rules
  const handleApplyFilterRules = () => {
    const validationErrors = Object.fromEntries(
      FILTER_RULE_FIELDS
        .map((field) => [field.key, validateFilterRule(field, filterRules[field.key])])
        .filter(([, error]) => error)
    );
    if (Object.keys(validationErrors).length > 0) {
      setFilterRuleErrors(validationErrors);
      setNotification({ type: 'error', message: 'Please correct the invalid Backtest Performance Filters before applying.' });
      return;
    }
    if (dateRangeMode === 'custom') {
      if (!dateRangeFrom || !dateRangeTo) {
        setNotification({ type: 'warning', message: 'Select both From and To dates before applying the custom period.' });
        return;
      }
      if (dayjs(dateRangeFrom).isAfter(dayjs(dateRangeTo))) {
        setNotification({ type: 'warning', message: 'From date must be earlier than or equal to To date.' });
        return;
      }
    }
    if (dateRangeMode === 'auto_common' && (!commonDateRange.from || !commonDateRange.to)) {
      setNotification({ type: 'warning', message: 'No common date range exists for the current candidates.' });
      return;
    }
    const currentRange = dateRangeMode === 'custom'
      ? { mode: 'custom', from: dateRangeFrom, to: dateRangeTo }
      : dateRangeMode === 'auto_common'
        ? { mode: 'auto_common', from: commonDateRange.from, to: commonDateRange.to }
        : { mode: 'full', from: null, to: null };
    setPage(0);
    setFilterRuleErrors({});
    setExpandedStrategies({});
    setStrategySubRows({});
    setAppliedFilters({ ...inputFilters });
    setAppliedFilterRules(normalizeFilterRules(filterRules));
    setAppliedDateRange(currentRange);

    const rangeLabel =
      currentRange.mode === 'full'
        ? 'Full Period'
        : `${currentRange.mode === 'auto_common' ? 'Common Range' : 'Custom Range'} (${currentRange.from} → ${currentRange.to})`;

    setNotification({
      type: 'success',
      message: `✓ Post-Backtest Filter Rules evaluated across all candidates! [Period: ${rangeLabel}]`
    });
  };

  const handleResetFilterRules = () => {
    setFilterRuleErrors({});
    setFilterRules(DEFAULT_FILTER_RULES);
    setAppliedFilterRules(DEFAULT_FILTER_RULES);
    setDateRangeMode('full');
    setAppliedDateRange({ mode: 'full', from: null, to: null });
    setDateRangeFrom('');
    setDateRangeTo('');
    setPage(0);
    setExpandedStrategies({});
    setStrategySubRows({});

    setNotification({
      type: 'info',
      message: 'Filter rules & date range reset to recommended defaults (Full Period).'
    });
  };

  const handleToggleStageCandidate = async (row) => {
    try {
      const nextValue = !row.isStaging;
      const result = await selectMt5Staging(row.id, null, nextValue, false);
      if (result.conflict) {
        setStageConflictCandidate({ ...row, existingCandidateId: result.existing_candidate_id });
        return;
      }
      setStrategySubRows((prev) => ({
        ...prev,
        [row.strategy]: (prev[row.strategy] || []).map((candidate) => ({
          ...candidate,
          isStaging: candidate.id === row.id ? nextValue : false
        }))
      }));
      await loadCandidates();
      setNotification({
        type: row.isStaging ? 'info' : 'success',
        message: row.isStaging
          ? 'Removed ' + row.strategy + ' Pass #' + row.passNumber + ' from Backtest Staging.'
          : 'Picked ' + row.strategy + ' Pass #' + row.passNumber + ' for Backtest Staging.'
      });
    } catch (error) {
      setNotification({ type: 'error', message: error.message });
    }
  };

  const handleConfirmStageReplacement = async () => {
    if (!stageConflictCandidate) return;
    try {
      setStageConflictApplying(true);
      await selectMt5Staging(stageConflictCandidate.id, null, true, true);
      setStageConflictCandidate(null);
      await loadCandidates();
      setNotification({
        type: 'success',
        message: `Replaced the staged candidate for ${stageConflictCandidate.strategy} with Pass #${stageConflictCandidate.passNumber}.`
      });
    } catch (error) {
      setNotification({ type: 'error', message: error.message });
    } finally {
      setStageConflictApplying(false);
    }
  };

  const handleDeleteCandidate = async () => {
    if (!candidateToDelete) return;
    try {
      setDeletingCandidate(true);
      await deleteMt5BacktestCandidate(candidateToDelete.id);
      setStrategySubRows((prev) => ({
        ...prev,
        [candidateToDelete.strategy]: (prev[candidateToDelete.strategy] || []).filter(
          (candidate) => candidate.id !== candidateToDelete.id
        )
      }));
      setCandidateToDelete(null);
      if (pagedCandidates.length === 1 && page > 0) setPage((current) => current - 1);
      else await loadCandidates();
      setNotification({
        type: 'success',
        message: `Deleted ${candidateToDelete.strategy} Pass #${candidateToDelete.passNumber} from All Backtest Candidates.`
      });
    } catch (error) {
      setNotification({ type: 'error', message: error.message });
    } finally {
      setDeletingCandidate(false);
    }
  };

  // Copy SET Parameter config
  const handleCopyId = (id) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenDetails = async (row) => {
    setSelectedCandidate(row);
    setCandidateDetail(null);
    setDetailsError('');
    setDetailsLoading(true);
    setDetailsOpen(true);
    try {
      setCandidateDetail(await getMt5BacktestCandidate(row.id, true));
    } catch (error) {
      setDetailsError(error.message || 'Unable to load backtest details.');
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleCloseDetails = () => {
    setDetailsOpen(false);
    setCandidateDetail(null);
    setDetailsError('');
  };

  const detailSettings = candidateDetail?.summary_bt?.settings || {};
  const detailResults = candidateDetail?.summary_bt?.results || {};
  const balanceSeries = useMemo(
    () => buildBalanceSeries(candidateDetail?.deals, detailSettings),
    [candidateDetail?.deals, detailSettings]
  );

  // Top 4 Summary Cards
  const summaryCards = [
    {
      label: 'TOTAL CANDIDATES',
      value: `${metrics.totalCandidates} Sets`,
      sub: `${metrics.totalCandidates} Completed backtests`,
      valueColor: theme.palette.primary.main,
      icon: <AimOutlined style={{ fontSize: '18px', color: '#1890ff' }} />,
      iconBg: isDark ? 'rgba(24, 144, 255, 0.18)' : '#e6f7ff'
    },
    {
      label: 'TOTAL SYMBOLS TESTED',
      value: `${metrics.totalSymbols} Symbols`,
      sub: 'Tick-by-tick market history',
      valueColor: isDark ? '#e6f7ff' : theme.palette.text.primary,
      icon: <CloudServerOutlined style={{ fontSize: '18px', color: '#13c2c2' }} />,
      iconBg: isDark ? 'rgba(19, 194, 194, 0.18)' : '#e6fffb'
    },
    {
      label: 'TOTAL STRATEGIES',
      value: `${metrics.totalStrategies} Strategies`,
      sub: 'Selected Expert Advisors',
      valueColor: '#722ed1',
      icon: <ThunderboltOutlined style={{ fontSize: '18px', color: '#722ed1' }} />,
      iconBg: isDark ? 'rgba(114, 46, 209, 0.18)' : '#f9f0ff'
    },
    {
      label: 'STAGED & SYNCED',
      value: `${metrics.stagedCount} Staged • ${metrics.syncedCount} Synced`,
      sub: 'Final candidate workflow status',
      valueColor: theme.palette.success.main,
      icon: <CheckCircleOutlined style={{ fontSize: '18px', color: '#52c41a' }} />,
      iconBg: isDark ? 'rgba(82, 196, 26, 0.18)' : '#f6ffed'
    }
  ];

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

      {/* ── 3. BLOCK: BACKTEST CANDIDATES RESULTS TABLE ── */}
      <Paper
        variant="outlined"
        sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 1.5, bgcolor: isDark ? 'background.paper' : '#ffffff', borderColor: 'divider' }}
      >
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} alignItems="center">
            <SlidersOutlined style={{ color: theme.palette.primary.main }} />
            <Typography variant="subtitle1" fontWeight={700}>Backtest Performance Filters</Typography>
          </Stack>

          <Grid container spacing={1.5} alignItems="center" sx={{ width: '100%' }}>
            <Grid size={{ xs: 12, md: 4, lg: 3.5 }}>
              <OutlinedInput
                fullWidth
                size="small"
                value={inputFilters.search}
                onChange={(e) => setInputFilters((p) => ({ ...p, search: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleApplyFilterRules();
                }}
                placeholder="Search Candidate #, Strategy, Symbol..."
                startAdornment={
                  <InputAdornment position="start">
                    <SearchOutlined style={{ color: theme.palette.text.secondary }} />
                  </InputAdornment>
                }
                sx={{ borderRadius: 1.25, height: 40 }}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 8, lg: 8.5 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: { xs: 'stretch', sm: 'center' },
                  flexDirection: { xs: 'column', sm: 'row' },
                  flexWrap: 'wrap',
                  gap: 1.25,
                  p: 0.5,
                  px: 1,
                  minHeight: 40,
                  border: '1px solid',
                  borderColor: appliedDateRange.mode !== 'full' ? 'primary.main' : 'divider',
                  borderRadius: 1.25,
                  bgcolor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'grey.50'
                }}
              >
                <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 'fit-content', pl: 0.5 }}>
                  <CalendarOutlined style={{ color: theme.palette.primary.main }} />
                  <Typography variant="body2" fontWeight={600} color="text.secondary">Backtest Period</Typography>
                </Stack>
                <ToggleButtonGroup
                  size="small"
                  value={dateRangeMode}
                  exclusive
                  onChange={(_, value) => {
                    if (!value) return;
                    setDateRangeMode(value);
                    if (value === 'auto_common') {
                      setDateRangeFrom(commonDateRange.from || '');
                      setDateRangeTo(commonDateRange.to || '');
                    }
                  }}
                  sx={{ '& .MuiToggleButton-root': { px: 1.25, py: 0.35, textTransform: 'none', fontWeight: 600, fontSize: '0.8rem' } }}
                >
                  <ToggleButton value="full">Full Period</ToggleButton>
                  <ToggleButton value="custom">Custom Range</ToggleButton>
                  <ToggleButton value="auto_common">Auto Common Range</ToggleButton>
                </ToggleButtonGroup>
                {(dateRangeMode === 'custom' || dateRangeMode === 'auto_common') && (
                  <DateRangePickerBox
                    startDate={dateRangeFrom}
                    endDate={dateRangeTo}
                    disabled={dateRangeMode === 'auto_common'}
                    onChange={({ startDateStr, endDateStr }) => {
                      setDateRangeFrom(startDateStr);
                      setDateRangeTo(endDateStr);
                    }}
                  />
                )}
              </Box>
            </Grid>
          </Grid>

          <Grid container spacing={1.5} sx={{ width: '100%' }}>
            {FILTER_RULE_FIELDS.map((field) => (
              <Grid key={field.key} size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  fullWidth
                  size="small"
                  label={field.label}
                  value={filterRules[field.key]}
                  error={Boolean(filterRuleErrors[field.key])}
                  helperText={filterRuleErrors[field.key] || undefined}
                  onChange={(event) => {
                    const value = event.target.value;
                    const allowedPattern = field.percent ? /^[0-9+\-.%\s]*$/ : /^[0-9+\-.\s]*$/;
                    if (!allowedPattern.test(value)) {
                      setFilterRuleErrors((current) => ({ ...current, [field.key]: 'Only numeric values are allowed.' }));
                      return;
                    }
                    setFilterRules((current) => ({ ...current, [field.key]: value }));
                    setFilterRuleErrors((current) => ({ ...current, [field.key]: validateFilterRule(field, value) }));
                  }}
                  InputLabelProps={{
                    shrink: true,
                    sx: {
                      fontSize: '0.8rem',
                      color: isDark ? 'grey.400' : 'text.secondary',
                      '&.Mui-focused': { color: 'primary.main' }
                    }
                  }}
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

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="flex-start" alignItems={{ xs: 'stretch', sm: 'center' }}>
            <Button size="small" variant="outlined" startIcon={<ReloadOutlined />} onClick={handleResetFilterRules} sx={{ textTransform: 'none', fontWeight: 600, height: 36, px: 2 }}>
              Reset
            </Button>
            <Button size="small" variant="contained" startIcon={<FilterOutlined />} onClick={handleApplyFilterRules} sx={{ textTransform: 'none', fontWeight: 600, height: 36, px: 2 }}>
              Apply Filters
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
            <Button
              size="small"
              variant="outlined"
              startIcon={<ListOrdered size={16} />}
              onClick={() => setPriorityDialogOpen(true)}
              sx={{ textTransform: 'none', fontWeight: 600, height: 36, px: 2 }}
            >
              Pick Priority
            </Button>
            <Button
              size="small"
              variant="contained"
              color="primary"
              startIcon={autoReviewLoading ? <CircularProgress size={14} color="inherit" /> : <AimOutlined />}
              disabled={autoReviewLoading || !sessionId}
              onClick={handleAutoPick}
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                height: 36,
                px: 2,
                color: 'common.white',
                boxShadow: isDark ? `0 0 0 1px ${theme.palette.primary.light}` : 1,
                '&:hover': { bgcolor: 'primary.dark', boxShadow: 2 }
              }}
            >
              Auto Pick
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <MainCard contentSX={{ p: 2 }}>
        <Stack spacing={2}>
          {/* Notification Banner */}
          {notification && (
            <Alert
              severity={notification.type}
              onClose={() => setNotification(null)}
              sx={{ borderRadius: 1.25 }}
            >
              {notification.message}
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
                {viewMode === 'grouped' ? 'Backtest Strategy Candidates' : 'All Backtest Candidates'} ({serverTotalCandidates})
              </Typography>
              <Chip
                label={viewMode === 'grouped' ? `${serverTotalCandidates} Strategies` : `${serverTotalCandidates} Candidates`}
                size="small"
                color={viewMode === 'grouped' ? 'primary' : 'success'}
                variant="outlined"
                sx={{ fontWeight: 600 }}
              />

              {/* View Mode Toggle & Batch Select together on same line */}
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
                      height: 28,
                      px: 1.25,
                      fontSize: '0.78rem',
                      fontWeight: viewMode === 'flat' ? 700 : 500,
                      textTransform: 'none',
                      borderRadius: 1.25,
                      bgcolor: viewMode === 'flat' ? (isDark ? 'primary.main' : '#ffffff') : 'transparent',
                      color: viewMode === 'flat' ? (isDark ? '#ffffff' : 'primary.main') : 'text.secondary',
                      boxShadow: viewMode === 'flat' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                    }}
                  >
                    All Passes
                  </Button>
                  <Button
                    size="small"
                    startIcon={<AppstoreOutlined />}
                    onClick={() => handleSwitchViewMode('grouped')}
                    sx={{
                      height: 28,
                      px: 1.25,
                      fontSize: '0.78rem',
                      fontWeight: viewMode === 'grouped' ? 700 : 500,
                      textTransform: 'none',
                      borderRadius: 1.25,
                      bgcolor: viewMode === 'grouped' ? (isDark ? 'primary.main' : '#ffffff') : 'transparent',
                      color: viewMode === 'grouped' ? (isDark ? '#ffffff' : 'primary.main') : 'text.secondary',
                      boxShadow: viewMode === 'grouped' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                    }}
                  >
                    Group by Strategy
                  </Button>
                </Box>

                {/* Batch Select Checkboxes Toggle */}
                <Tooltip title={showCheckboxes ? 'Hide Selection' : 'Batch Select'}>
                  <IconButton
                    size="small"
                    onClick={() => {
                      if (showCheckboxes) {
                        setSelectedCandidateIds([]);
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
          </Stack>

          {/* Bulk Selection Bar */}
          {selectedCandidateIds.length > 0 && (
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
                {selectedCandidateIds.length} candidate(s) selected
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant="contained"
                  color="primary"
                  startIcon={<ArrowRightToLine size={14} />}
                  onClick={handleBulkStageCandidates}
                  sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 1 }}
                >
                  Stage Selected ({selectedCandidateIds.length})
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteOutlined />}
                  onClick={handleBulkDeleteCandidates}
                  sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 1 }}
                >
                  Delete Selected
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setSelectedCandidateIds([])}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    borderRadius: 1.25,
                    color: isDark ? '#ffffff' : 'text.primary',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.45)' : 'grey.400',
                    bgcolor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'grey.100'
                  }}
                >
                  Clear Selection
                </Button>
              </Stack>
            </Paper>
          )}

          {/* ── Candidates Table ── */}
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
                          pagedCandidates.length > 0 &&
                          pagedCandidates.every((row) => selectedCandidateIds.includes(row.id))
                        }
                        indeterminate={
                          selectedCandidateIds.length > 0 &&
                          pagedCandidates.some((row) => selectedCandidateIds.includes(row.id)) &&
                          !pagedCandidates.every((row) => selectedCandidateIds.includes(row.id))
                        }
                        onChange={() => handleSelectAllCandidates(pagedCandidates.map((r) => r.id))}
                      />
                    </TableCell>
                  )}
                  <TableCell sx={{ fontWeight: 700, minWidth: 140 }}>Strategy</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 110 }} align="right">Net Profit</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 85 }} align="right">Profit Factor</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 85 }} align="right">Recovery F.</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 75 }} align="right">Sharpe</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 100 }} align="right">Max Drawdown</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 85 }} align="right">P/D</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 95 }} align="right">Largest Loss</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 80 }} align="right">Trades</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 180 }} align="center">Chart</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 110 }} align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pagedCandidates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={showCheckboxes ? 12 : 11} align="center" sx={{ py: 5 }}>
                      <Typography variant="body1" color="text.secondary" fontWeight={600}>
                        No backtest candidates match your active filter criteria.
                      </Typography>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => {
                          setInputFilters({ search: '', symbol: 'ALL', strategy: 'ALL', status: 'ALL' });
                          setAppliedFilters({ search: '', symbol: 'ALL', strategy: 'ALL', status: 'ALL' });
                        }}
                        sx={{ mt: 1.5, textTransform: 'none', fontWeight: 600, borderRadius: 1.25 }}
                      >
                        Reset All Filters
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  pagedCandidates.map((row) => {
                    const isExpanded = !!expandedStrategies[row.strategy];
                    const subRows = strategySubRows[row.strategy] || [];
                    const isLoadingSubRows = !!loadingSubRows[row.strategy];
                    return (
                      <Fragment key={viewMode === 'grouped' ? row.strategy : row.id}>
                      <TableRow
                        hover
                        selected={selectedCandidateIds.includes(row.id)}
                        onClick={() => viewMode === 'grouped' && handleToggleExpandStrategy(row.strategy)}
                        sx={{
                          transition: 'background-color 0.15s',
                          cursor: viewMode === 'grouped' ? 'pointer' : 'default',
                          bgcolor: isExpanded ? (isDark ? 'rgba(24, 144, 255, 0.08)' : 'rgba(24, 144, 255, 0.04)') : 'inherit',
                          '&:hover': {
                            bgcolor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'grey.50'
                          }
                        }}
                      >
                        {/* Checkbox */}
                        {showCheckboxes && (
                          <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              size="small"
                              checked={selectedCandidateIds.includes(row.id)}
                              onChange={() => handleToggleSelectCandidate(row.id)}
                            />
                          </TableCell>
                        )}
                        {/* Strategy */}
                        <TableCell>
                          <Stack direction="row" spacing={0.75} alignItems="center">
                            {viewMode === 'grouped' && (
                              <IconButton
                                size="small"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleToggleExpandStrategy(row.strategy);
                                }}
                                sx={{ p: 0.25, color: isExpanded ? 'primary.main' : 'text.secondary' }}
                              >
                                {isExpanded ? <DownOutlined style={{ fontSize: 13 }} /> : <RightOutlined style={{ fontSize: 13 }} />}
                              </IconButton>
                            )}
                            <Box>
                              <Stack direction="row" spacing={0.75} alignItems="center">
                                <Typography variant="subtitle2" fontWeight={600}>{row.strategy}</Typography>
                                {viewMode === 'grouped' && (
                                  <Chip
                                    label={`${row.totalPasses || 1} passes`}
                                    size="small"
                                    color="primary"
                                    variant="outlined"
                                    sx={{ height: 20, fontSize: '0.68rem', fontWeight: 600 }}
                                  />
                                )}
                              </Stack>
                              {viewMode === 'grouped' && (
                                <Typography variant="caption" color="text.secondary">Best Pass #{row.passNumber}</Typography>
                              )}
                              {viewMode === 'flat' && (
                                <Typography variant="caption" color="text.secondary">Pass #{row.passNumber ?? row.pass ?? row.id}</Typography>
                              )}
                            </Box>
                          </Stack>
                        </TableCell>

                        {/* Net Profit */}
                        <TableCell align="right">
                          <Typography variant="subtitle2" fontWeight={700} color={row.profit >= 0 ? 'success.main' : 'error.main'}>
                            {row.profit >= 0 ? '+' : ''}${row.profit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </Typography>
                          <MetricDelta current={row.profit} baseline={row.openPriceMetrics?.profit} />
                        </TableCell>

                        {/* Profit Factor */}
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={700} color={row.profitFactor >= 2.0 ? 'success.main' : 'text.primary'}>
                            {row.profitFactor.toFixed(2)}
                          </Typography>
                          <MetricDelta current={row.profitFactor} baseline={row.openPriceMetrics?.profitFactor} />
                        </TableCell>

                        {/* Recovery Factor */}
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={700} color={row.recoveryFactor >= 3.0 ? 'primary.main' : 'text.primary'}>
                            {row.recoveryFactor.toFixed(2)}
                          </Typography>
                          <MetricDelta current={row.recoveryFactor} baseline={row.openPriceMetrics?.recoveryFactor} />
                        </TableCell>

                        {/* Sharpe */}
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={700}>
                            {row.sharpeRatio.toFixed(2)}
                          </Typography>
                          <MetricDelta current={row.sharpeRatio} baseline={row.openPriceMetrics?.sharpeRatio} />
                        </TableCell>

                        {/* Max Drawdown */}
                        <TableCell align="right">
                          <Typography
                            variant="subtitle2"
                            fontWeight={700}
                            color={row.drawdownPct <= 10 ? 'success.main' : row.drawdownPct <= 15 ? 'warning.main' : 'error.main'}
                          >
                            {row.drawdownPct.toFixed(2)}%
                          </Typography>
                        </TableCell>

                        {/* P/D Ratio */}
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={700}>
                            {Number(row.pdRatio || row.recoveryFactor || 0).toFixed(2)}
                          </Typography>
                        </TableCell>

                        {/* Largest Loss Trade */}
                        <TableCell align="right">
                          <Typography variant="subtitle2" fontWeight={700} color="error.main">
                            {`${row.largestLossTrade < 0 ? '-' : ''}$${Math.abs(row.largestLossTrade).toLocaleString()}`}
                          </Typography>
                        </TableCell>

                        {/* Trades */}
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={600}>
                            {row.trades}
                          </Typography>
                          <MetricDelta current={row.trades} baseline={row.openPriceMetrics?.trades} />
                        </TableCell>

                        {/* Balance chart */}
                        <TableCell align="center" sx={{ py: 0.5 }}>
                          <CandidateSparkline row={row} dateRange={appliedDateRange} />
                        </TableCell>

                        {/* Actions */}
                        <TableCell align="center" onClick={(event) => event.stopPropagation()}>
                          <Stack direction="row" spacing={0.5} justifyContent="center" alignItems="center">
                            {/* Pick as Candidate for Backtest Staging */}
                            <Tooltip title={row.isStaging ? 'Selected for Backtest Staging (Click to unpick)' : 'Pick for Backtest Staging'}>
                              <IconButton
                                size="small"
                                onClick={() => handleToggleStageCandidate(row)}
                                sx={{
                                  color: row.isStaging ? '#ffffff' : isDark ? '#5cdbd3' : '#08979c',
                                  bgcolor: row.isStaging ? '#08979c' : isDark ? 'rgba(19, 194, 194, 0.12)' : '#e6fffb',
                                  border: '1px solid',
                                  borderColor: row.isStaging ? '#08979c' : isDark ? 'rgba(92, 219, 211, 0.45)' : '#87e8de',
                                  transition: 'all 0.15s ease-in-out',
                                  '&:hover': {
                                    bgcolor: row.isStaging ? '#006d75' : isDark ? 'rgba(19, 194, 194, 0.24)' : '#b5f5ec',
                                    borderColor: '#08979c',
                                    transform: 'scale(1.06)'
                                  }
                                }}
                              >
                                <ArrowRightToLine size={15} />
                              </IconButton>
                            </Tooltip>

                            {/* View Candidate Details */}
                            <Tooltip title="View Candidate Backtest Metrics & Parameters">
                              <IconButton
                                size="small"
                                onClick={() => handleOpenDetails(row)}
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
                            <Tooltip title="Delete Backtest Candidate">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => setCandidateToDelete(row)}
                                sx={{ bgcolor: isDark ? 'rgba(255, 77, 79, 0.1)' : '#fff1f0' }}
                              >
                                <DeleteOutlined style={{ fontSize: 14 }} />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        </TableCell>
                      </TableRow>
                      {viewMode === 'grouped' && isExpanded && (
                        <TableRow sx={{ bgcolor: isDark ? 'rgba(0, 0, 0, 0.25)' : 'grey.50' }}>
                          <TableCell colSpan={showCheckboxes ? 12 : 11} sx={{ py: 1.5, px: { xs: 1, sm: 3 } }}>
                            {isLoadingSubRows ? (
                              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 2, px: 2 }}>
                                <CircularProgress size={16} />
                                <Typography variant="body2" color="primary.main" fontWeight={600}>
                                  Loading backtest candidates for {row.strategy}...
                                </Typography>
                              </Stack>
                            ) : subRows.length === 0 ? (
                              <Typography variant="body2" color="text.secondary" sx={{ py: 1.5, px: 2 }}>
                                No candidates match the active filters for this strategy.
                              </Typography>
                            ) : (
                              <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflowX: 'auto', bgcolor: 'background.paper' }}>
                                <Table size="small">
                                  <TableHead sx={{ bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'grey.100' }}>
                                    <TableRow>
                                      {showCheckboxes && <TableCell padding="checkbox" sx={{ width: 40 }} />}
                                      <TableCell sx={{ fontWeight: 600 }}>Pass #</TableCell>
                                      <TableCell align="right" sx={{ fontWeight: 600 }}>Net Profit</TableCell>
                                      <TableCell align="right" sx={{ fontWeight: 600 }}>PF</TableCell>
                                      <TableCell align="right" sx={{ fontWeight: 600 }}>Recovery</TableCell>
                                      <TableCell align="right" sx={{ fontWeight: 600 }}>Sharpe</TableCell>
                                      <TableCell align="right" sx={{ fontWeight: 600 }}>Max DD</TableCell>
                                      <TableCell align="right" sx={{ fontWeight: 600 }}>P/D</TableCell>
                                      <TableCell align="right" sx={{ fontWeight: 600 }}>Largest Loss</TableCell>
                                      <TableCell align="right" sx={{ fontWeight: 600 }}>Trades</TableCell>
                                      <TableCell align="center" sx={{ fontWeight: 600, minWidth: 180 }}>Chart</TableCell>
                                      <TableCell align="center" sx={{ fontWeight: 600 }}>Actions</TableCell>
                                    </TableRow>
                                  </TableHead>
                                  <TableBody>
                                    {subRows.map((candidate) => (
                                      <TableRow key={candidate.id} hover selected={selectedCandidateIds.includes(candidate.id)}>
                                        {showCheckboxes && (
                                          <TableCell padding="checkbox">
                                            <Checkbox
                                              size="small"
                                              checked={selectedCandidateIds.includes(candidate.id)}
                                              onChange={() => handleToggleSelectCandidate(candidate.id)}
                                            />
                                          </TableCell>
                                        )}
                                        <TableCell>#{candidate.passNumber}</TableCell>
                                        <TableCell align="right">
                                          <Typography variant="body2" color={candidate.profit >= 0 ? 'success.main' : 'error.main'} fontWeight={600}>
                                            {candidate.profit >= 0 ? '+' : ''}${candidate.profit.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                                          </Typography>
                                          <MetricDelta current={candidate.profit} baseline={candidate.openPriceMetrics?.profit} />
                                        </TableCell>
                                        <TableCell align="right">
                                          <Typography variant="body2">{candidate.profitFactor.toFixed(2)}</Typography>
                                          <MetricDelta current={candidate.profitFactor} baseline={candidate.openPriceMetrics?.profitFactor} />
                                        </TableCell>
                                        <TableCell align="right">
                                          <Typography variant="body2">{candidate.recoveryFactor.toFixed(2)}</Typography>
                                          <MetricDelta current={candidate.recoveryFactor} baseline={candidate.openPriceMetrics?.recoveryFactor} />
                                        </TableCell>
                                        <TableCell align="right">
                                          <Typography variant="body2">{candidate.sharpeRatio.toFixed(2)}</Typography>
                                          <MetricDelta current={candidate.sharpeRatio} baseline={candidate.openPriceMetrics?.sharpeRatio} />
                                        </TableCell>
                                        <TableCell align="right">
                                          <Typography variant="body2">{candidate.drawdownPct.toFixed(2)}%</Typography>
                                        </TableCell>
                                        <TableCell align="right">{Number(candidate.pdRatio || 0).toFixed(2)}</TableCell>
                                        <TableCell align="right" sx={{ color: 'error.main' }}>
                                          {`${candidate.largestLossTrade < 0 ? '-' : ''}$${Math.abs(candidate.largestLossTrade).toLocaleString()}`}
                                        </TableCell>
                                        <TableCell align="right">
                                          <Typography variant="body2">{candidate.trades}</Typography>
                                          <MetricDelta current={candidate.trades} baseline={candidate.openPriceMetrics?.trades} />
                                        </TableCell>
                                        <TableCell align="center" sx={{ py: 0.5 }}>
                                          <CandidateSparkline row={candidate} dateRange={appliedDateRange} />
                                        </TableCell>
                                        <TableCell align="center">
                                          <Stack direction="row" spacing={0.5} justifyContent="center">
                                            <Tooltip title={candidate.isStaging ? 'Selected for Backtest Staging' : 'Pick for Backtest Staging'}>
                                              <IconButton size="small" color={candidate.isStaging ? 'success' : 'secondary'} onClick={() => handleToggleStageCandidate(candidate)}>
                                                <ArrowRightToLine size={14} />
                                              </IconButton>
                                            </Tooltip>
                                            <Tooltip title="View Candidate Details">
                                              <IconButton size="small" color="primary" onClick={() => handleOpenDetails(candidate)}>
                                                <EyeOutlined style={{ fontSize: 14 }} />
                                              </IconButton>
                                            </Tooltip>
                                            <Tooltip title={copiedId === candidate.id ? 'Copied!' : 'Copy Parameter Config'}>
                                              <IconButton size="small" onClick={() => handleCopyId(candidate.id)}>
                                                {copiedId === candidate.id ? <CheckOutlined /> : <CopyOutlined />}
                                              </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Delete Backtest Candidate">
                                              <IconButton size="small" color="error" onClick={() => setCandidateToDelete(candidate)}>
                                                <DeleteOutlined style={{ fontSize: 14 }} />
                                              </IconButton>
                                            </Tooltip>
                                          </Stack>
                                        </TableCell>
                                      </TableRow>
                                    ))}
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
            count={serverTotalCandidates}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
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

      <Dialog
        open={priorityDialogOpen}
        onClose={() => setPriorityDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 1.5 } }}
      >
        <DialogTitle>Auto Pick Priority</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.25}>
            <Alert severity="info">
              Candidates are compared from priority 1 downward. The next metric is used when the previous metric is equal.
            </Alert>
            {autoPickPriority.map((value, index) => {
              const option = AUTO_PICK_PRIORITY_OPTIONS.find((item) => item.value === value);
              return (
                <Paper key={value} variant="outlined" sx={{ px: 1.5, py: 1, borderRadius: 1 }}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Chip size="small" color="primary" label={index + 1} sx={{ minWidth: 30 }} />
                    <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>
                      {option?.label || value}
                    </Typography>
                    <Tooltip title="Move up">
                      <span>
                        <IconButton size="small" disabled={index === 0} onClick={() => moveAutoPickPriority(index, -1)}>
                          <ArrowUp size={15} />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Move down">
                      <span>
                        <IconButton
                          size="small"
                          disabled={index === autoPickPriority.length - 1}
                          onClick={() => moveAutoPickPriority(index, 1)}
                        >
                          <ArrowDown size={15} />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAutoPickPriority(DEFAULT_AUTO_PICK_PRIORITY)}>Reset Default</Button>
          <Button variant="contained" onClick={() => setPriorityDialogOpen(false)}>Done</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={autoReviewOpen}
        onClose={autoReviewApplying ? undefined : () => setAutoReviewOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 1.5 } }}
      >
        <DialogTitle>Confirm Backtest Staging Replacement</DialogTitle>
        <DialogContent dividers>
          {autoReviewPreview && (
            <Stack spacing={1.5}>
              <Alert severity="warning">
                Backtest Staging already contains selections for {autoReviewPreview.replacedCount + autoReviewPreview.unchangedCount} strategy candidate(s).
                Auto Pick would replace {autoReviewPreview.replacedCount} and keep {autoReviewPreview.unchangedCount} unchanged.
              </Alert>
              <Typography variant="body2" color="text.secondary">
                {Math.max(0, autoReviewPreview.strategyCount - autoReviewPreview.replacedCount - autoReviewPreview.unchangedCount)} new strategy candidate(s) can be staged without replacement.
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={autoReviewApplying} onClick={() => setAutoReviewOpen(false)}>Cancel</Button>
          <Button
            variant="outlined"
            color="primary"
            disabled={
              autoReviewApplying ||
              !autoReviewPreview?.strategyCount ||
              autoReviewPreview.strategyCount - autoReviewPreview.replacedCount - autoReviewPreview.unchangedCount <= 0
            }
            startIcon={autoReviewApplying ? <CircularProgress size={14} color="inherit" /> : <CheckOutlined />}
            onClick={() => handleConfirmAutoReview(false)}
            sx={{
              borderColor: 'primary.main',
              color: 'primary.main',
              fontWeight: 700,
              '&:hover': {
                borderColor: 'primary.dark',
                bgcolor: 'primary.main',
                color: 'primary.contrastText'
              }
            }}
          >
            Keep Existing & Add New ({Math.max(
              0,
              (autoReviewPreview?.strategyCount || 0) -
                (autoReviewPreview?.replacedCount || 0) -
                (autoReviewPreview?.unchangedCount || 0)
            )})
          </Button>
          <Button
            variant="contained"
            disabled={autoReviewApplying || !autoReviewPreview?.strategyCount}
            startIcon={autoReviewApplying ? <CircularProgress size={14} color="inherit" /> : <CheckOutlined />}
            onClick={() => handleConfirmAutoReview(true)}
          >
            Replace Existing & Stage All ({autoReviewPreview?.strategyCount || 0})
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(stageConflictCandidate)}
        onClose={() => !stageConflictApplying && setStageConflictCandidate(null)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 1.5 } }}
      >
        <DialogTitle>Replace Backtest Staging Candidate?</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.25}>
            <Typography variant="body2">
              <strong>{stageConflictCandidate?.strategy}</strong> already has a candidate in Backtest Staging.
              Replace it with Pass #{stageConflictCandidate?.passNumber}?
            </Typography>
            <Alert severity="warning">
              This only changes the selected staging candidate. Existing backtest results are not deleted.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={stageConflictApplying} onClick={() => setStageConflictCandidate(null)}>
            Keep Existing
          </Button>
          <Button
            variant="contained"
            color="warning"
            disabled={stageConflictApplying}
            startIcon={stageConflictApplying ? <CircularProgress size={14} color="inherit" /> : <CheckOutlined />}
            onClick={handleConfirmStageReplacement}
          >
            Replace Candidate
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(candidateToDelete)}
        onClose={() => !deletingCandidate && setCandidateToDelete(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 1.5 } }}
      >
        <DialogTitle>Delete Backtest Candidate</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.25}>
            <Typography variant="body2">
              Delete <strong>{candidateToDelete?.strategy}</strong> Pass #{candidateToDelete?.passNumber} from All Backtest Candidates?
            </Typography>
            <Alert severity="warning">
              Its Backtest Staging selection will also be removed. Optimization results and data already synced to a backtest table are not deleted.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={deletingCandidate} onClick={() => setCandidateToDelete(null)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            disabled={deletingCandidate}
            startIcon={deletingCandidate ? <CircularProgress size={14} color="inherit" /> : <DeleteOutlined />}
            onClick={handleDeleteCandidate}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={detailsOpen}
        onClose={handleCloseDetails}
        maxWidth="xl"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 1.5,
            bgcolor: isDark ? '#1e2632' : '#ffffff',
            backgroundImage: 'none',
            border: '1px solid',
            borderColor: 'divider',
            width: { xs: '96vw', lg: '1180px' },
            maxHeight: '92vh'
          }
        }}
      >
        {selectedCandidate && (
          <>
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1.5, px: 2.5 }}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <BarChartOutlined style={{ fontSize: 22, color: theme.palette.primary.main }} />
                <Box>
                  <Typography variant="h4" fontWeight={700}>
                    {selectedCandidate.strategy} - Pass #{selectedCandidate.passNumber}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {selectedCandidate.symbol} ({selectedCandidate.timeframe}) | Session: {selectedCandidate.session} | Full Every Tick result
                  </Typography>
                </Box>
              </Stack>
              <Chip
                label={selectedCandidate.status}
                color={selectedCandidate.status === 'BACKTESTED' ? 'success' : 'info'}
                sx={{ fontWeight: 700 }}
              />
            </DialogTitle>

            <DialogContent dividers sx={{ borderColor: 'divider', p: { xs: 1.5, sm: 2.5 } }}>
              {detailsLoading ? (
                <Stack alignItems="center" justifyContent="center" spacing={1.5} sx={{ minHeight: 430 }}>
                  <CircularProgress size={32} />
                  <Typography variant="body2" color="text.secondary">Loading backtest details...</Typography>
                </Stack>
              ) : detailsError ? (
                <Alert severity="error">{detailsError}</Alert>
              ) : (
                <Stack spacing={2.5}>
                  <Paper variant="outlined" sx={{ p: 2, overflow: 'hidden' }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
                      <Typography variant="subtitle1" fontWeight={700}>Balance Chart</Typography>
                      <Typography variant="caption" color="text.secondary">{balanceSeries.length} deal points</Typography>
                    </Stack>
                    <Box sx={{ height: { xs: 320, md: 400 }, minWidth: 0 }}>
                      {balanceSeries.length ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={balanceSeries} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                            <XAxis
                              dataKey="time"
                              tick={{ fontSize: 10, fill: theme.palette.text.secondary }}
                              angle={-45}
                              textAnchor="end"
                              height={80}
                              interval="preserveStartEnd"
                            />
                            <YAxis
                              tickFormatter={formatChartYAxis}
                              tick={{ fontSize: 12, fill: theme.palette.text.secondary }}
                              domain={['auto', 'auto']}
                            />
                            <ChartTooltip content={<BalanceTooltip />} />
                            <Line
                              type="monotone"
                              dataKey="balance"
                              stroke="#2196f3"
                              strokeWidth={2}
                              dot={false}
                              activeDot={{ r: 4 }}
                              isAnimationActive={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <Stack alignItems="center" justifyContent="center" sx={{ height: '100%' }}>
                          <Typography variant="body2" color="text.secondary">No balance data available</Typography>
                        </Stack>
                      )}
                    </Box>
                  </Paper>

                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <DetailList
                        title="Settings"
                        subtitle="Expert configuration and input parameters"
                        values={detailSettings}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <DetailList
                        title="Results"
                        subtitle="Every Tick performance and risk metrics"
                        values={detailResults}
                      />
                    </Grid>
                  </Grid>
                </Stack>
              )}
            </DialogContent>

            <DialogActions sx={{ px: 3, py: 1.5, justifyContent: 'space-between' }}>
              <Button
                variant="outlined"
                startIcon={<CopyOutlined />}
                onClick={() => handleCopyId(selectedCandidate.id)}
                size="small"
                sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 1.25 }}
              >
                {copiedId === selectedCandidate.id ? 'Copied Config!' : 'Copy Parameter Config'}
              </Button>
              <Button
                variant="contained"
                size="small"
                onClick={handleCloseDetails}
                sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 1.25, px: 2.5 }}
              >
                Close
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* ── 5. MODAL: MY STAGED CANDIDATES (BACKTEST STAGING) ── */}
      
    </Stack>
  );
}

BacktestCandidatesTab.propTypes = {};
