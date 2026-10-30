import { useState, useMemo, useEffect } from 'react';
import PropTypes from 'prop-types';
import dayjs from 'dayjs';

// material-ui
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
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
import Paper from '@mui/material/Paper';
import Checkbox from '@mui/material/Checkbox';
import LinearProgress from '@mui/material/LinearProgress';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import ToggleButton from '@mui/material/ToggleButton';
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';

// project imports
import MainCard from 'components/MainCard';
import {
  deleteMt5FilterPreference,
  getMt5FilterPreferences,
  getMt5BacktestCandidate,
  getMt5BacktestCandidateSparkline,
  isMt5SessionNotFoundError,
  listMt5BacktestCandidates,
  saveMt5FilterPreference,
  selectMt5Staging,
  syncMt5Result
} from 'api/mt5Optimization';
import { mapMt5BacktestResult } from 'utils/mt5Optimization';
import { getBacktestTables, createBacktestTable } from 'api/order';
import DateRangePickerBox from 'components/dashboard/DateRangePickerBox';

// assets - icons
import CalendarOutlined from '@ant-design/icons/CalendarOutlined';
import FilterOutlined from '@ant-design/icons/FilterOutlined';
import SearchOutlined from '@ant-design/icons/SearchOutlined';
import ReloadOutlined from '@ant-design/icons/ReloadOutlined';
import CheckCircleOutlined from '@ant-design/icons/CheckCircleOutlined';
import CloseCircleOutlined from '@ant-design/icons/CloseCircleOutlined';
import SlidersOutlined from '@ant-design/icons/SlidersOutlined';
import EyeOutlined from '@ant-design/icons/EyeOutlined';
import AimOutlined from '@ant-design/icons/AimOutlined';
import ThunderboltOutlined from '@ant-design/icons/ThunderboltOutlined';
import CloudServerOutlined from '@ant-design/icons/CloudServerOutlined';
import BarChartOutlined from '@ant-design/icons/BarChartOutlined';
import CopyOutlined from '@ant-design/icons/CopyOutlined';
import CheckOutlined from '@ant-design/icons/CheckOutlined';
import RocketOutlined from '@ant-design/icons/RocketOutlined';
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import DatabaseOutlined from '@ant-design/icons/DatabaseOutlined';
import SyncOutlined from '@ant-design/icons/SyncOutlined';
import DeleteOutlined from '@ant-design/icons/DeleteOutlined';
import SwapOutlined from '@ant-design/icons/SwapOutlined';
import WarningOutlined from '@ant-design/icons/WarningOutlined';
import InfoCircleOutlined from '@ant-design/icons/InfoCircleOutlined';
import CheckSquareOutlined from '@ant-design/icons/CheckSquareOutlined';
import StarOutlined from '@ant-design/icons/StarOutlined';
import { Pointer } from 'lucide-react';

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

const DEFAULT_TABLE_FILTERS = { search: '' };
const FILTER_PREFERENCE_SCOPE = 'backtest_staging';

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

const parseMinMax = (str) => {
  if (str === undefined || str === null || str === '') return { min: null, max: null };
  const match = String(str).trim().match(FILTER_RANGE_PATTERN);
  if (!match) return { min: null, max: null };
  return { min: Number(match[1]), max: match[2] === undefined ? null : Number(match[2]) };
};

const evaluateCandidateRules = (row, rules, dateRange) => {
  let isDisqualified = false;
  let reason = null;

  // 1. Min Profit ($)
  const { min: pMin, max: pMax } = parseMinMax(rules.minProfit);
  if (pMin !== null && row.profit < pMin) {
    isDisqualified = true;
    reason = `Profit (${row.profit}) < Min (${pMin})`;
  } else if (pMax !== null && row.profit > pMax) {
    isDisqualified = true;
    reason = `Profit (${row.profit}) > Max (${pMax})`;
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
      reason = `Largest Loss (${lossMagnitude}) < Min (${lMin})`;
    } else if (lMax !== null && lossMagnitude > lMax) {
      isDisqualified = true;
      reason = `Largest Loss (${lossMagnitude}) > Max limit (${lMax})`;
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

const CandidateSparkline = ({ row, dateRange }) => {
  const theme = useTheme();
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
  const lineColor = chartData[chartData.length - 1].balance >= 0 ? theme.palette.success.main : theme.palette.error.main;
  const gradientId = `staging-spark-${row.id}`;
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
          entries.map(([key, itemValue]) => (
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
                {formatDetailValue(itemValue)}
              </Typography>
            </Box>
          ))
        )}
      </Box>
    </Paper>
  );
};

// ==============================|| MOCK STAGED CANDIDATE DATA ||============================== //

export default function BacktestStagingTab() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  // ── State: Staged Strategies (Mỗi strategy 1 bộ duy nhất) ──
  const [stagedStrategies, setStagedStrategies] = useState([]);
  const [selectedStrategyIds, setSelectedStrategyIds] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const showCheckboxes = selectionMode || selectedStrategyIds.length > 0;
  const strategiesForSync = useMemo(
    () => selectedStrategyIds.length
      ? stagedStrategies.filter((row) => selectedStrategyIds.includes(row.strategyId))
      : stagedStrategies,
    [selectedStrategyIds, stagedStrategies]
  );

  // ── State: Backtest Tables from DB ──
  const [backtestTables, setBacktestTables] = useState([]);
  const [targetTable, setTargetTable] = useState('');
  const [tablesLoading, setTablesLoading] = useState(false);

  // ── State: Sync Mode: 'overwrite' | 'append_only' ──
  const [syncMode, setSyncMode] = useState('overwrite');

  // ── State: Modals & Dialogs ──
  const [createTableModalOpen, setCreateTableModalOpen] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [newTableError, setNewTableError] = useState('');
  const [syncConfirmModalOpen, setSyncConfirmModalOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncPreviewPage, setSyncPreviewPage] = useState(0);
  const [syncPreviewRowsPerPage, setSyncPreviewRowsPerPage] = useState(50);
  const syncPreviewStrategies = useMemo(
    () => strategiesForSync.slice(
      syncPreviewPage * syncPreviewRowsPerPage,
      syncPreviewPage * syncPreviewRowsPerPage + syncPreviewRowsPerPage
    ),
    [strategiesForSync, syncPreviewPage, syncPreviewRowsPerPage]
  );

  // ── State: View Detail / Copy ──
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [candidateDetail, setCandidateDetail] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [notification, setNotification] = useState(null);
  const [defaultFilterAnchorEl, setDefaultFilterAnchorEl] = useState(null);
  const [defaultFilterBusy, setDefaultFilterBusy] = useState(false);

  // ── State: Filter Rules & Date Range ──
  const [filterRules, setFilterRules] = useState(DEFAULT_FILTER_RULES);
  const [appliedFilterRules, setAppliedFilterRules] = useState(DEFAULT_FILTER_RULES);
  const [filterRuleErrors, setFilterRuleErrors] = useState({});

  const [dateRangeMode, setDateRangeMode] = useState('full');
  const [dateRangeFrom, setDateRangeFrom] = useState('');
  const [dateRangeTo, setDateRangeTo] = useState('');
  const [appliedDateRange, setAppliedDateRange] = useState({ mode: 'full', from: null, to: null });
  const [commonDateRange, setCommonDateRange] = useState({ from: null, to: null, candidateCount: 0 });

  // ── Search & Filter State ──
  const [inputFilters, setInputFilters] = useState(DEFAULT_TABLE_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(DEFAULT_TABLE_FILTERS);
  const [symbolFilter, setSymbolFilter] = useState('ALL');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalStaged, setTotalStaged] = useState(0);

  const [sessionId, setSessionId] = useState(() => localStorage.getItem('mt5_active_session_id') || '');
  const loadStagedStrategies = async (id = sessionId) => {
    if (!id) {
      setStagedStrategies([]);
      setTotalStaged(0);
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
      view: 'staging',
      page: page + 1,
      page_size: rowsPerPage,
      search: appliedFilters.search,
      symbol: symbolFilter === 'ALL' ? null : symbolFilter,
      include_common_range: 1,
      start_date: appliedDateRange.mode !== 'full' ? appliedDateRange.from : null,
      end_date: appliedDateRange.mode !== 'full' ? appliedDateRange.to : null,
      ...metricParams
    });
    setStagedStrategies(payload.items.map(mapMt5BacktestResult).map((row) => ({ ...row, candidateId: row.id })));
    setTotalStaged(payload.total);
    setCommonDateRange(payload.commonDateRange || { from: null, to: null, candidateCount: 0 });
  };

  useEffect(() => {
    const onSession = (event) => {
      setPage(0);
      setSessionId(event.detail?.sessionId || '');
    };
    window.addEventListener('mt5:session-change', onSession);
    loadStagedStrategies().catch((error) => {
      if (isMt5SessionNotFoundError(error)) {
        localStorage.removeItem('mt5_active_session_id');
        setSessionId('');
        setNotification(null);
        return;
      }
      setNotification({ type: 'error', message: error.message });
    });
    return () => window.removeEventListener('mt5:session-change', onSession);
  }, [sessionId, page, rowsPerPage, appliedFilters, symbolFilter, appliedFilterRules, appliedDateRange]);

  // Fetch Backtest Tables from Database
  const fetchTables = async () => {
    try {
      setTablesLoading(true);
      const res = await getBacktestTables();
      const tables = Array.isArray(res) ? res : res?.tables || res?.data || [];
      const validTables = tables
        .map((t) => (typeof t === 'string' ? t : t.table_name || t.name))
        .filter((t) => t && t.startsWith('backtest'));

      if (validTables.length > 0) {
        setBacktestTables(validTables);
        if (!validTables.includes(targetTable)) {
          setTargetTable(validTables[0]);
        }
      }
    } catch {
      // Use fallback initial backtest tables
    } finally {
      setTablesLoading(false);
    }
  };

  useEffect(() => {
    fetchTables();
  }, []);

  // Symbol options for filter
  const symbolOptions = useMemo(
    () => ['ALL', ...Array.from(new Set(stagedStrategies.map((s) => s.symbol)))],
    [stagedStrategies]
  );

  // Remove a strategy from staging
  const handleRemoveStrategy = async (row) => {
    try {
      await selectMt5Staging(row.id, null, false);
      setSelectedStrategyIds((prev) => prev.filter((id) => id !== row.strategyId));
      await loadStagedStrategies();
      setNotification({ type: 'info', message: 'Removed candidate from Backtest Staging.' });
    } catch (error) {
      setNotification({ type: 'error', message: error.message });
    }
  };

  // Clear all staged
  const handleClearAll = async () => {
    try {
      await Promise.all(stagedStrategies.map((row) => selectMt5Staging(row.id, null, false)));
      setSelectedStrategyIds([]);
      await loadStagedStrategies();
      setNotification({ type: 'info', message: 'Cleared all strategies from Backtest Staging.' });
    } catch (error) {
      setNotification({ type: 'error', message: error.message });
    }
  };

  // Create new Backtest Table
  const handleCreateNewTable = async () => {
    let formattedName = newTableName.trim().toLowerCase();
    if (!formattedName) {
      setNewTableError('Table name is required.');
      return;
    }
    if (!formattedName.startsWith('backtest')) {
      formattedName = `backtest_${formattedName.replace(/^_+/, '')}`;
    }
    formattedName = formattedName.replace(/[^a-z0-9_]/g, '_');

    try {
      await createBacktestTable(formattedName);
    } catch {
      // Local fallback in case backend is offline
    }

    setBacktestTables((prev) => (prev.includes(formattedName) ? prev : [...prev, formattedName]));
    setTargetTable(formattedName);
    setCreateTableModalOpen(false);
    setNewTableName('');
    setNewTableError('');
    setNotification({
      type: 'success',
      message: `✓ Created new backtest table "${formattedName}" and set as active target!`
    });
  };

  // Execute Sync
  const handleExecuteSync = async () => {
    const selected=selectedStrategyIds.length?stagedStrategies.filter((row)=>selectedStrategyIds.includes(row.strategyId)):stagedStrategies;
    if(!targetTable||!selected.length)return; setSyncing(true); setSyncProgress(10);
    try { let completed=0,conflicts=0; for(const row of selected){await selectMt5Staging(row.id,targetTable);const result=await syncMt5Result(row.id,targetTable,syncMode==='overwrite');if(result.conflict)conflicts+=1;completed+=1;setSyncProgress(Math.round(completed/selected.length*100));} setSyncConfirmModalOpen(false);setNotification({type:conflicts?'warning':'success',message:'Synced '+(completed-conflicts)+' strategy(s) to "'+targetTable+'"'+(conflicts?' ? '+conflicts+' duplicate(s) skipped.':'')});await loadStagedStrategies(); } catch(error){setNotification({type:'error',message:error.message});} finally{setSyncing(false);}
  };

  // Multi-select strategies  // Multi-select strategies
  const handleToggleSelect = (id) => {
    setSelectedStrategyIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleSelectAll = (visibleIds) => {
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedStrategyIds.includes(id));
    if (allSelected) {
      setSelectedStrategyIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedStrategyIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  // Copy ID
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

  // Filtered Staged Strategies
  const filteredStrategies = useMemo(() => {
    return stagedStrategies.filter((item) => {
      const matchSearch =
        !appliedFilters.search ||
        item.strategyName.toLowerCase().includes(appliedFilters.search.toLowerCase()) ||
        item.strategyId.toLowerCase().includes(appliedFilters.search.toLowerCase()) ||
        item.symbol.toLowerCase().includes(appliedFilters.search.toLowerCase()) ||
        item.candidateId.toLowerCase().includes(appliedFilters.search.toLowerCase());

      const matchSymbol = symbolFilter === 'ALL' || item.symbol === symbolFilter;

      const matchMetrics = !evaluateCandidateRules(item, appliedFilterRules, appliedDateRange).isDisqualified;

      return matchSearch && matchSymbol && matchMetrics;
    });
  }, [stagedStrategies, appliedFilters.search, symbolFilter, appliedFilterRules, appliedDateRange]);

  const handleLoadDefaultFilter = async () => {
    setDefaultFilterAnchorEl(null);
    setDefaultFilterBusy(true);
    try {
      const preferences = await getMt5FilterPreferences();
      const saved = preferences?.[FILTER_PREFERENCE_SCOPE];
      if (!saved) {
        setNotification({ type: 'info', message: 'No saved default filter for Backtest Staging Filters.' });
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
      setNotification({ type: 'success', message: 'Current Backtest Staging Filters saved as your default.' });
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
      setNotification({ type: 'success', message: 'Saved Backtest Staging Filters default cleared.' });
    } catch (err) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setDefaultFilterBusy(false);
    }
  };

  // Handle Apply and Reset Filter Rules
  const handleApplyFilterRules = () => {
    const validationErrors = Object.fromEntries(
      FILTER_RULE_FIELDS
        .map((field) => [field.key, validateFilterRule(field, filterRules[field.key])])
        .filter(([, error]) => error)
    );
    if (Object.keys(validationErrors).length > 0) {
      setFilterRuleErrors(validationErrors);
      setNotification({ type: 'error', message: 'Please correct the invalid Backtest Staging Filters before applying.' });
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
    const currentRange =
      dateRangeMode === 'custom'
        ? { mode: 'custom', from: dateRangeFrom, to: dateRangeTo }
        : dateRangeMode === 'auto_common'
          ? { mode: 'auto_common', from: commonDateRange.from, to: commonDateRange.to }
          : { mode: 'full', from: null, to: null };
    setPage(0);
    setFilterRuleErrors({});
    setAppliedFilters({ ...inputFilters });
    setAppliedFilterRules(normalizeFilterRules(filterRules));
    setAppliedDateRange(currentRange);

    const rangeLabel =
      currentRange.mode === 'full'
        ? 'Full Period'
        : `${currentRange.mode === 'auto_common' ? 'Common Range' : 'Custom Range'} (${currentRange.from} → ${currentRange.to})`;

    setNotification({
      type: 'success',
      message: `✓ Post-Backtest Filter Rules evaluated across staged strategies! [Period: ${rangeLabel}]`
    });
  };

  const handleResetFilterRules = () => {
    setFilterRuleErrors({});
    setFilterRules(DEFAULT_FILTER_RULES);
    setAppliedFilterRules(DEFAULT_FILTER_RULES);
    setDateRangeMode('full');
    setDateRangeFrom('');
    setDateRangeTo('');
    setAppliedDateRange({ mode: 'full', from: null, to: null });
    setInputFilters({ search: '' });
    setAppliedFilters({ search: '' });
    setSymbolFilter('ALL');
    setPage(0);
    setNotification({ type: 'info', message: 'Filter rules reset to default.' });
  };

  // Page slice
  const pagedStrategies = filteredStrategies;

  // Top 4 Aggregate Metrics
  const metrics = useMemo(() => {
    const totalStrategies = stagedStrategies.length;
    const totalSymbols = Array.from(new Set(stagedStrategies.map((s) => s.symbol))).length;

    let aggregateProfit = 0;
    let sumPF = 0;
    let sumWinRate = 0;

    stagedStrategies.forEach((strat) => {
      aggregateProfit += strat.profit || 0;
      sumPF += strat.profitFactor || 0;
      sumWinRate += strat.winRate || 0;
    });

    const avgPF = (sumPF / (totalStrategies || 1)).toFixed(2);
    const avgWinRate = (sumWinRate / (totalStrategies || 1)).toFixed(1);

    return {
      totalStrategies,
      totalSymbols,
      aggregateProfit,
      avgPF,
      avgWinRate
    };
  }, [stagedStrategies]);

  return (
    <Stack spacing={{ xs: 2, sm: 2.5 }} sx={{ width: '100%' }}>
      {/* ── 1. BLOCK: BACKTEST STAGING FILTERS ── */}
      <Paper
        variant="outlined"
        sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 1.5, bgcolor: isDark ? 'background.paper' : '#ffffff', borderColor: 'divider' }}
      >
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} alignItems="center">
            <SlidersOutlined style={{ color: theme.palette.primary.main }} />
            <Typography variant="subtitle1" fontWeight={700}>Backtest Staging Filters</Typography>
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
          </Stack>
        </Stack>
      </Paper>

      {/* ── 2. BLOCK: TARGET BACKTEST TABLE & SYNC CONFLICT CONFIG ── */}
      <Paper
        variant="outlined"
        sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 1.5, bgcolor: isDark ? 'background.paper' : '#ffffff', borderColor: 'divider' }}
      >
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} alignItems="center">
            <DatabaseOutlined style={{ color: theme.palette.primary.main }} />
            <Typography variant="subtitle1" fontWeight={700}>Target Table & Sync Configuration</Typography>
          </Stack>

          <Stack
            direction="row"
            spacing={{ xs: 1, sm: 1.5 }}
            alignItems="center"
            justifyContent="flex-start"
            sx={{ width: '100%', flexWrap: 'wrap', gap: 1.25 }}
          >
            {/* Target Table Dropdown */}
            <FormControl size="small" sx={{ width: { xs: '100%', sm: 260, md: 280 } }}>
              <InputLabel
                shrink
                id="target-table-label"
                sx={{
                  fontWeight: 600,
                  bgcolor: isDark ? 'background.paper' : '#ffffff',
                  px: 0.5,
                  color: isDark ? 'grey.300' : 'text.secondary',
                  '&.Mui-focused': { color: 'primary.main' }
                }}
              >
                Target Backtest Table
              </InputLabel>
              <Select
                labelId="target-table-label"
                id="target-table-select"
                value={targetTable}
                label="Target Backtest Table"
                notched
                onChange={(e) => setTargetTable(e.target.value)}
                sx={{
                  borderRadius: 1.25,
                  fontWeight: 700,
                  bgcolor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'background.paper',
                  height: 38
                }}
              >
                {backtestTables.map((tbl) => (
                  <MenuItem key={tbl} value={tbl} sx={{ fontWeight: 600 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <DatabaseOutlined style={{ color: '#1890ff', fontSize: 14 }} />
                      <Typography variant="body2" fontWeight={600}>
                        {tbl}
                      </Typography>
                    </Stack>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* New Table Button */}
            <Button
              variant="outlined"
              color="primary"
              size="small"
              startIcon={<PlusOutlined />}
              onClick={() => setCreateTableModalOpen(true)}
              sx={{
                height: 38,
                textTransform: 'none',
                fontWeight: 600,
                borderRadius: 1.25,
                whiteSpace: 'nowrap',
                px: 1.75
              }}
            >
              New Table
            </Button>

            {/* Refresh DB Button */}
            <Tooltip title={tablesLoading ? 'Refreshing tables...' : 'Refresh DB Table List'}>
              <span>
                <IconButton
                  size="small"
                  onClick={fetchTables}
                  disabled={tablesLoading}
                  sx={{
                    height: 38,
                    width: 38,
                    borderRadius: 1.25,
                    border: '1px solid',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'grey.300',
                    bgcolor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#ffffff',
                    color: isDark ? '#ffffff' : 'text.primary',
                    '&:hover': {
                      borderColor: 'primary.main',
                      color: 'primary.main'
                    }
                  }}
                >
                  <ReloadOutlined spin={tablesLoading} style={{ fontSize: 15 }} />
                </IconButton>
              </span>
            </Tooltip>

            {/* Sync Conflicts Policy Capsule (Sát cạnh, dồn sang trái) */}
            <Stack
              direction="row"
              spacing={1.25}
              alignItems="center"
              sx={{
                p: 0.5,
                px: 1.5,
                height: 38,
                borderRadius: 1.25,
                bgcolor: isDark ? 'rgba(24, 144, 255, 0.06)' : 'rgba(24, 144, 255, 0.03)',
                border: '1px solid',
                borderColor: isDark ? 'rgba(24, 144, 255, 0.2)' : 'rgba(24, 144, 255, 0.12)',
                boxSizing: 'border-box'
              }}
            >
              <Typography
                variant="caption"
                fontWeight={700}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                  color: isDark ? 'grey.300' : 'text.secondary',
                  whiteSpace: 'nowrap'
                }}
              >
                <SyncOutlined style={{ color: theme.palette.primary.main, fontSize: 13 }} /> Conflict Policy:
              </Typography>

              <RadioGroup
                row
                value={syncMode}
                onChange={(e) => setSyncMode(e.target.value)}
                sx={{ gap: 1.25 }}
              >
                <Tooltip title="Ghi đè và cập nhật bộ tham số mới nếu chiến lược đã tồn tại trong bảng đích">
                  <FormControlLabel
                    value="overwrite"
                    control={<Radio size="small" color="primary" sx={{ p: 0.5 }} />}
                    label={
                      <Typography
                        variant="body2"
                        fontWeight={syncMode === 'overwrite' ? 700 : 500}
                        color={syncMode === 'overwrite' ? 'primary.main' : 'text.primary'}
                        sx={{ fontSize: '0.8125rem' }}
                      >
                        Overwrite
                      </Typography>
                    }
                    sx={{ m: 0 }}
                  />
                </Tooltip>

                <Tooltip title="Chỉ thêm các chiến lược chưa có, bỏ qua nếu đã tồn tại trong bảng đích">
                  <FormControlLabel
                    value="append_only"
                    control={<Radio size="small" color="primary" sx={{ p: 0.5 }} />}
                    label={
                      <Typography
                        variant="body2"
                        fontWeight={syncMode === 'append_only' ? 700 : 500}
                        color={syncMode === 'append_only' ? 'primary.main' : 'text.primary'}
                        sx={{ fontSize: '0.8125rem' }}
                      >
                        Append Only
                      </Typography>
                    }
                    sx={{ m: 0 }}
                  />
                </Tooltip>
              </RadioGroup>
            </Stack>

            {/* Sync Button (Đặt sát ngay bên cạnh Conflict Policy) */}
            <Button
              variant="contained"
              color="primary"
              size="small"
              startIcon={<RocketOutlined />}
              disabled={stagedStrategies.length === 0}
              onClick={() => {
                setSyncPreviewPage(0);
                setSyncConfirmModalOpen(true);
              }}
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                borderRadius: 1.25,
                height: 38,
                px: 2.5,
                whiteSpace: 'nowrap',
                boxShadow: '0 4px 12px rgba(24, 144, 255, 0.25)'
              }}
            >
              Sync to Backtest Table ({selectedStrategyIds.length > 0 ? selectedStrategyIds.length : stagedStrategies.length})
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {/* ── 3. BLOCK: MASTER STAGED BACKTEST CANDIDATES TABLE ── */}
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
            alignItems={{ xs: 'stretch', md: 'center' }}
            spacing={1.5}
            sx={{ pb: 1, borderBottom: '1px solid', borderColor: 'divider' }}
          >
            {/* Left side: Strategy count & Table status */}
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: 'wrap' }}>
              <Typography variant="h5" fontWeight={700}>
                Final Staged Candidates ({filteredStrategies.length} Strategies)
              </Typography>
              <Chip
                label="1 Candidate / Strategy"
                size="small"
                color="primary"
                variant="outlined"
                sx={{ fontWeight: 700 }}
              />
              <Chip
                label={`Target: ${targetTable}`}
                size="small"
                color="info"
                sx={{ fontWeight: 600 }}
              />
            </Stack>

            {/* Right side Actions: Batch select toggle & Clear All */}
            <Stack direction="row" spacing={1.25} alignItems="center" sx={{ flexWrap: 'wrap' }}>
              <Tooltip title={showCheckboxes ? 'Hide Selection' : 'Batch Select'}>
                <IconButton
                  size="small"
                  onClick={() => {
                    if (showCheckboxes) {
                      setSelectedStrategyIds([]);
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

              <Button
                variant="outlined"
                color="error"
                size="small"
                disabled={stagedStrategies.length === 0}
                onClick={handleClearAll}
                sx={{
                  textTransform: 'none',
                  fontWeight: 600,
                  borderRadius: 1.25,
                  height: 38,
                  px: 1.75
                }}
              >
                Clear Staging
              </Button>
            </Stack>
          </Stack>

          {/* Staged Candidates Table */}
          <TableContainer
            sx={{
              borderRadius: 1.5,
              border: '1px solid',
              borderColor: 'divider',
              maxHeight: 600
            }}
          >
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow
                  sx={{
                    bgcolor: isDark ? '#1e293b' : '#f8fafc',
                    '& th': {
                      fontWeight: 700,
                      py: 1.25,
                      fontSize: '0.78rem',
                      color: isDark ? '#ffffff' : 'text.primary',
                      whiteSpace: 'nowrap'
                    }
                  }}
                >
                  {showCheckboxes && (
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={
                          pagedStrategies.length > 0 &&
                          pagedStrategies.every((r) => selectedStrategyIds.includes(r.strategyId))
                        }
                        indeterminate={
                          selectedStrategyIds.length > 0 &&
                          pagedStrategies.some((r) => selectedStrategyIds.includes(r.strategyId)) &&
                          !pagedStrategies.every((r) => selectedStrategyIds.includes(r.strategyId))
                        }
                        onChange={() => handleSelectAll(pagedStrategies.map((r) => r.strategyId))}
                      />
                    </TableCell>
                  )}
                  <TableCell>Strategy Final</TableCell>
                  <TableCell align="center">Net Profit</TableCell>
                  <TableCell align="center">Profit Factor</TableCell>
                  <TableCell align="center">Recovery Factor</TableCell>
                  <TableCell align="center">Sharpe</TableCell>
                  <TableCell align="center">Max Drawdown</TableCell>
                  <TableCell align="center">P/D</TableCell>
                  <TableCell align="center">Largest Loss</TableCell>
                  <TableCell align="center">Trades</TableCell>
                  <TableCell align="center" sx={{ minWidth: 180 }}>Chart</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pagedStrategies.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={showCheckboxes ? 12 : 11} align="center" sx={{ py: 6 }}>
                      <RocketOutlined style={{ fontSize: 32, color: theme.palette.text.disabled, marginBottom: 8 }} />
                      <Typography variant="body1" color="text.secondary">
                        No final candidates staged.
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Pick candidates from &quot;All Backtest Candidates&quot; or &quot;Optimize Results&quot; to stage them here.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  pagedStrategies.map((strat) => {
                    const isSelected = selectedStrategyIds.includes(strat.strategyId);

                    return (
                      <TableRow
                        key={strat.strategyId}
                        hover
                        selected={isSelected}
                        sx={{
                          '&:last-child td, &:last-child th': { border: 0 },
                          transition: 'background-color 0.15s'
                        }}
                      >
                        {/* Checkbox */}
                        {showCheckboxes && (
                          <TableCell padding="checkbox">
                            <Checkbox
                              size="small"
                              checked={isSelected}
                              onChange={() => handleToggleSelect(strat.strategyId)}
                            />
                          </TableCell>
                        )}

                        {/* Strategy Final */}
                        <TableCell>
                          <Typography variant="subtitle2" fontWeight={700}>
                            {strat.strategyName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Pass #{strat.passNumber}
                          </Typography>
                        </TableCell>

                        {/* Net Profit */}
                        <TableCell align="center">
                          <Typography variant="subtitle2" fontWeight={700} color={strat.profit >= 0 ? 'success.main' : 'error.main'}>
                            {strat.profit >= 0 ? '+' : ''}${strat.profit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </Typography>
                        </TableCell>

                        {/* Profit Factor */}
                        <TableCell align="center">
                          <Typography variant="body2" fontWeight={700} color={strat.profitFactor >= 2.0 ? 'success.main' : 'text.primary'}>
                            {strat.profitFactor.toFixed(2)}
                          </Typography>
                        </TableCell>

                        {/* Recovery Factor */}
                        <TableCell align="center">
                          <Typography variant="body2" fontWeight={700} color={strat.recoveryFactor >= 3.0 ? 'primary.main' : 'text.primary'}>
                            {strat.recoveryFactor.toFixed(2)}
                          </Typography>
                        </TableCell>

                        {/* Sharpe */}
                        <TableCell align="center">
                          <Typography variant="body2" fontWeight={700}>
                            {strat.sharpeRatio.toFixed(2)}
                          </Typography>
                        </TableCell>

                        {/* Max Drawdown */}
                        <TableCell align="center">
                          <Typography
                            variant="subtitle2"
                            fontWeight={700}
                            color={strat.drawdownPct <= 10 ? 'success.main' : strat.drawdownPct <= 15 ? 'warning.main' : 'error.main'}
                          >
                            {strat.drawdownPct.toFixed(2)}%
                          </Typography>
                        </TableCell>

                        {/* P/D Ratio */}
                        <TableCell align="center">
                          <Typography variant="body2" fontWeight={700}>
                            {Number(strat.pdRatio || strat.recoveryFactor || 0).toFixed(2)}
                          </Typography>
                        </TableCell>

                        {/* Largest Loss */}
                        <TableCell align="center">
                          <Typography variant="subtitle2" fontWeight={700} color="error.main">
                            {`${strat.largestLossTrade < 0 ? '-' : ''}${Math.abs(strat.largestLossTrade).toLocaleString()}`}
                          </Typography>
                        </TableCell>

                        {/* Trades */}
                        <TableCell align="center">
                          <Typography variant="body2" fontWeight={600}>
                            {strat.trades}
                          </Typography>
                        </TableCell>

                        {/* Balance chart */}
                        <TableCell align="center" sx={{ py: 0.5 }}>
                          <CandidateSparkline row={strat} dateRange={appliedDateRange} />
                        </TableCell>

                        {/* Actions */}
                        <TableCell align="center">
                          <Stack direction="row" spacing={0.5} justifyContent="center" alignItems="center">
                            {/* View Full Candidate Details */}
                            <Tooltip title="View Candidate Backtest Metrics & Parameters">
                              <IconButton
                                size="small"
                                onClick={() => handleOpenDetails(strat)}
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
                            <Tooltip title={copiedId === strat.candidateId ? 'Copied SET Parameters!' : 'Copy Parameter Config'}>
                              <IconButton
                                size="small"
                                onClick={() => handleCopyId(strat.candidateId)}
                                sx={{
                                  color: copiedId === strat.candidateId ? 'success.main' : 'text.secondary',
                                  bgcolor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'grey.100',
                                  '&:hover': { color: 'primary.main' }
                                }}
                              >
                                {copiedId === strat.candidateId ? <CheckOutlined style={{ fontSize: 14 }} /> : <CopyOutlined style={{ fontSize: 14 }} />}
                              </IconButton>
                            </Tooltip>

                            {/* Remove from staging */}
                            <Tooltip title="Remove Strategy from Staging">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleRemoveStrategy(strat)}
                              >
                                <DeleteOutlined style={{ fontSize: 14 }} />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Pagination */}
          <TablePagination
            component="div"
            count={totalStaged}
            page={page}
            onPageChange={(e, newPage) => setPage(newPage)}
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

      {/* ── 4. DIALOG: CREATE NEW BACKTEST TABLE ── */}
      <Dialog
        open={createTableModalOpen}
        onClose={() => setCreateTableModalOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ px: 3, py: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <PlusOutlined style={{ color: '#1890ff' }} />
            <Typography variant="h5" fontWeight={700}>
              Create New Backtest Database Table
            </Typography>
          </Stack>
        </DialogTitle>

        <DialogContent dividers sx={{ p: 3 }}>
          <Stack spacing={2}>
            <Alert severity="info" sx={{ borderRadius: 1.25 }}>
              Database tables for backtest results must have the prefix <strong>backtest_</strong>.
            </Alert>
            <TextField
              fullWidth
              label="New Table Name"
              placeholder="e.g. backtest_ea_production_2026"
              value={newTableName}
              onChange={(e) => {
                setNewTableName(e.target.value);
                setNewTableError('');
              }}
              error={Boolean(newTableError)}
              helperText={newTableError || 'Format: lowercase letters, numbers, and underscores.'}
              InputLabelProps={{ shrink: true }}
            />
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 1.5 }}>
          <Button
            variant="outlined"
            onClick={() => setCreateTableModalOpen(false)}
            sx={{ textTransform: 'none', borderRadius: 1.25 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleCreateNewTable}
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 1.25 }}
          >
            Create Table
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── 5. DIALOG: SYNC CONFIRMATION & CONFLICT CHECK ── */}
      <Dialog
        open={syncConfirmModalOpen}
        onClose={() => !syncing && setSyncConfirmModalOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Stack direction="row" spacing={1.25} alignItems="center">
            <RocketOutlined style={{ fontSize: 20, color: theme.palette.primary.main }} />
            <Box>
              <Typography variant="h5" fontWeight={700}>
                Confirm Sync to Database Table
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Review the target table and selected strategies.
              </Typography>
            </Box>
          </Stack>
        </DialogTitle>

        <DialogContent dividers sx={{ p: 3 }}>
          <Stack spacing={2}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 1.5, bgcolor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'grey.50' }}>
              <Typography variant="caption" color="text.secondary">Target Database Table</Typography>
              <Typography variant="h6" fontWeight={700} color="primary.main">
                {targetTable}
              </Typography>
            </Paper>

            <Box>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                Strategies ({strategiesForSync.length})
              </Typography>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {syncPreviewStrategies.map((strat) => (
                  <Chip key={strat.strategyId} label={strat.strategyName} size="small" variant="outlined" />
                ))}
              </Stack>
              {strategiesForSync.length > 25 && (
                <TablePagination
                  component="div"
                  count={strategiesForSync.length}
                  page={syncPreviewPage}
                  onPageChange={(_, nextPage) => setSyncPreviewPage(nextPage)}
                  rowsPerPage={syncPreviewRowsPerPage}
                  onRowsPerPageChange={(event) => {
                    setSyncPreviewRowsPerPage(Number(event.target.value));
                    setSyncPreviewPage(0);
                  }}
                  rowsPerPageOptions={[25, 50, 100]}
                  sx={{
                    mt: 1,
                    borderTop: '1px solid',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'divider',
                    color: isDark ? 'grey.300' : 'text.primary',
                    '& .MuiTablePagination-actions .MuiIconButton-root': {
                      color: isDark ? '#ffffff' : 'text.primary',
                      border: '1px solid',
                      borderColor: isDark ? 'rgba(255, 255, 255, 0.25)' : 'grey.300',
                      bgcolor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#ffffff',
                      borderRadius: 1,
                      p: '4px',
                      mx: '2px',
                      '&:hover:not(.Mui-disabled)': {
                        borderColor: 'primary.main',
                        color: 'primary.main',
                        bgcolor: isDark ? 'rgba(24, 144, 255, 0.25)' : 'rgba(24, 144, 255, 0.12)'
                      }
                    }
                  }}
                />
              )}
            </Box>

            {/* Sync Progress if active */}
            {syncing && (
              <Box sx={{ width: '100%', mt: 1 }}>
                <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                  Syncing candidate data into &quot;{targetTable}&quot;... {syncProgress}%
                </Typography>
                <LinearProgress variant="determinate" value={syncProgress} sx={{ height: 8, borderRadius: 1 }} />
              </Box>
            )}
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 1.75, justifyContent: 'space-between' }}>
          <Button
            variant="outlined"
            disabled={syncing}
            onClick={() => setSyncConfirmModalOpen(false)}
            sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 1.25 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            disabled={syncing}
            startIcon={syncing ? <SyncOutlined spin /> : <RocketOutlined />}
            onClick={handleExecuteSync}
            sx={{
              textTransform: 'none',
              fontWeight: 700,
              borderRadius: 1.25,
              px: 3,
              boxShadow: '0 4px 12px rgba(24, 144, 255, 0.25)'
            }}
          >
            {syncing ? 'Executing Sync...' : `Confirm & Sync ${strategiesForSync.length} Strategies`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── 6. DIALOG: CANDIDATE DETAIL METRICS & PARAMETERS ── */}
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
                    {selectedCandidate.symbol} ({selectedCandidate.timeframe}) | Session: {selectedCandidate.session} | Final staged Every Tick result
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
    </Stack>
  );
}

BacktestStagingTab.propTypes = {};
