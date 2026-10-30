import { useMemo, useState, useRef, useEffect } from 'react';
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
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Alert from '@mui/material/Alert';
import Paper from '@mui/material/Paper';
import Avatar from '@mui/material/Avatar';
import Checkbox from '@mui/material/Checkbox';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

// project imports
import MainCard from 'components/MainCard';
import JSZip from 'jszip';
import { hasEnabledOptimizationInput } from 'utils/iniConfigService';
import { cancelMt5Job, createMt5Jobs, createMt5Session, deleteMt5Job, isMt5SessionNotFoundError, listMt5Jobs, listMt5JobSelection, listMt5Results, listMt5Sessions, retryMt5Job } from 'api/mt5Optimization';
import { formatStrategyCode, parseSymbolAndTimeframe } from 'utils/strategyNaming';

// assets - icons
import SearchOutlined from '@ant-design/icons/SearchOutlined';
import ClearOutlined from '@ant-design/icons/ClearOutlined';
import CheckCircleOutlined from '@ant-design/icons/CheckCircleOutlined';
import CloudUploadOutlined from '@ant-design/icons/CloudUploadOutlined';
import RocketOutlined from '@ant-design/icons/RocketOutlined';
import FileZipOutlined from '@ant-design/icons/FileZipOutlined';
import EyeOutlined from '@ant-design/icons/EyeOutlined';
import DeleteOutlined from '@ant-design/icons/DeleteOutlined';
import RedoOutlined from '@ant-design/icons/RedoOutlined';
import StopOutlined from '@ant-design/icons/StopOutlined';
import ExclamationCircleOutlined from '@ant-design/icons/ExclamationCircleOutlined';
import FilterOutlined from '@ant-design/icons/FilterOutlined';
import CloudServerOutlined from '@ant-design/icons/CloudServerOutlined';
import ThunderboltOutlined from '@ant-design/icons/ThunderboltOutlined';
import CodeOutlined from '@ant-design/icons/CodeOutlined';
import TableOutlined from '@ant-design/icons/TableOutlined';
import AppstoreOutlined from '@ant-design/icons/AppstoreOutlined';
import CheckSquareOutlined from '@ant-design/icons/CheckSquareOutlined';
import AimOutlined from '@ant-design/icons/AimOutlined';
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import FolderOpenOutlined from '@ant-design/icons/FolderOpenOutlined';

const formatDurationMs = (ms) => {
  if (!ms || ms <= 0) return '0s';
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

const formatJobDuration = (job) => {
  const payload = job.job_payload || {};
  const durationMs = job.duration_ms || payload.duration_ms || payload.elapsed_ms;
  if (durationMs && typeof durationMs === 'number' && durationMs > 0) {
    return formatDurationMs(durationMs);
  }

  const started = job.started_at ? new Date(job.started_at).getTime() : null;
  const finished = job.finished_at ? new Date(job.finished_at).getTime() : null;

  if (started && finished && finished >= started) {
    return formatDurationMs(finished - started);
  }

  if (job.status === 'RUNNING' && started) {
    const elapsed = Date.now() - started;
    return `${formatDurationMs(elapsed)}`;
  }

  return '—';
};

const mapSession = (session) => ({
  ...session,
  status: session.status === 'running' ? 'ACTIVE' : session.status === 'completed' ? 'ARCHIVED' : session.status,
  displayId: session.id,
  createdAt: session.created_at ? new Date(session.created_at).toLocaleString() : session.createdAt || '',
  ownerUsername: session.owner_username || session.username || '-'
});

const generateJobLogs = (job, { symbol, timeframe, strategy }) => {
  const payload = job.job_payload || {};
  const logs = [];
  const createdAt = job.created_at ? new Date(job.created_at).toLocaleString() : 'N/A';

  logs.push(`[${createdAt}] [QUEUE] Job queued for processing. Target: ${strategy || '-'}`);
  if (symbol && symbol !== '-') {
    logs.push(`[${createdAt}] [CONFIG] Asset Symbol: ${symbol} | Timeframe: ${timeframe || 'Default'} | Mode: ${job.job_type || 'OPEN_PRICE'}`);
  }

  if (job.worker_name && job.worker_name !== 'Unassigned') {
    const startedAt = job.started_at ? new Date(job.started_at).toLocaleString() : createdAt;
    logs.push(`[${startedAt}] [DISPATCH] Worker assigned: ${job.worker_name}${job.worker_ip ? ` (${job.worker_ip})` : ''}`);
  } else {
    logs.push(`[${createdAt}] [STATUS] Waiting for available worker in cluster...`);
  }

  if (job.status === 'RUNNING') {
    const startedAt = job.started_at ? new Date(job.started_at).toLocaleString() : 'Active';
    logs.push(`[${startedAt}] [RUNNING] MT5 Terminal executing passes... Progress: ${Number(job.progress) || 0}%`);
    if (job.heartbeat_at) {
      logs.push(`[${new Date(job.heartbeat_at).toLocaleString()}] [HEARTBEAT] Worker pulse confirmed.`);
    }
  } else if (job.status === 'DONE' || job.status === 'COMPLETED') {
    const finishedAt = job.finished_at ? new Date(job.finished_at).toLocaleString() : 'Finished';
    logs.push(`[${finishedAt}] [COMPLETED] Optimization execution successfully completed in ${formatJobDuration(job)}.`);
    logs.push(`[${finishedAt}] [INGESTION] Results compiled and verified.`);
  } else if (job.status === 'FAILED') {
    const finishedAt = job.finished_at ? new Date(job.finished_at).toLocaleString() : 'Terminated';
    logs.push(`[${finishedAt}] [FAILED] Execution halted with error.`);
  } else if (job.status === 'CANCELLED') {
    logs.push(`[${createdAt}] [CANCELLED] Job execution cancelled by user.`);
  }

  if (Array.isArray(payload.logs) && payload.logs.length > 0) {
    payload.logs.forEach((line) => logs.push(String(line)));
  }

  if (job.error_message) {
    logs.push(`[ERROR] ${job.error_message}`);
  }

  return logs;
};

// Jobs from API
const mapJob = (job) => {
  const payload = job.job_payload || {};
  const strategy = formatStrategyCode(job.strategy_id || payload.job_name);
  const status = job.status === 'DONE' ? 'COMPLETED' : job.status;
  const userId = job.user_id || payload.user_id || 1;
  let username = job.username || payload.username;
  if (!username) {
    try {
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      if (Number(stored?.id) === Number(userId) && stored?.username) {
        username = stored.username;
      }
    } catch {}
  }
  if (!username) {
    username = Number(userId) === 1 ? 'admin' : `user_${userId}`;
  }

  const parsed = parseSymbolAndTimeframe(job.strategy_id || payload.job_name || job.job_name || payload.symbol);
  const symbol = (payload.symbol && payload.symbol !== '-') ? payload.symbol : parsed.symbol;
  const timeframe = (payload.timeframe && payload.timeframe !== '-') ? payload.timeframe : parsed.timeframe;
  const passNumber = job.target_pass ?? payload.pass;
  const jobName = job.job_type === 'EVERY_TICK'
    ? strategy + ' - Pass #' + (passNumber ?? '?')
    : payload.job_name || strategy;

  let activity = 'Queued';
  if (status === 'RUNNING') {
    activity = 'Executing passes';
  } else if (status === 'COMPLETED') {
    activity = 'Results saved';
  } else if (status === 'FAILED') {
    activity = job.error_message ? job.error_message.slice(0, 50) : 'Execution failed';
  } else if (status === 'CANCELLED') {
    activity = 'Cancelled';
  } else if (status === 'PENDING') {
    activity = 'Queued';
  }

  return {
    id: job.job_id,
    displayId: job.job_id,
    sessionId: job.session_id,
    sessionName: '',
    jobName,
    strategy,
    symbol,
    timeframe,
    mode: job.job_type === 'EVERY_TICK' ? 'Every tick' : 'Open prices only',
    owner: username,
    ownerAvatar: String(userId),
    status,
    activity,
    worker: job.worker_name || 'Unassigned',
    workerIp: job.worker_ip || payload.worker_ip || '',
    progress: Number(job.progress) || 0,
    totalPasses: 100,
    currentPass: Number(job.progress) || 0,
    duration: formatJobDuration(job),
    passed: 0,
    lastHeartbeat: job.heartbeat_at ? new Date(job.heartbeat_at).toLocaleString() : '-',
    error: job.error_message || null,
    jobType: job.job_type,
    optimiRun: payload.optimize_runs || 1,
    storedSets: payload.optimize_stored_count ?? payload.stored_count ?? null,
    createdAt: job.created_at ? new Date(job.created_at).toLocaleString() : '-',
    logs: generateJobLogs(job, { symbol, timeframe, strategy })
  };
};

const decodeIni = (bytes) => {
  const sample = bytes.slice(0, Math.min(bytes.length, 100));
  const isUtf16 = (bytes[0] === 0xff && bytes[1] === 0xfe) || sample.filter((value) => value === 0).length > 20;
  return new TextDecoder(isUtf16 ? 'utf-16le' : 'utf-8').decode(bytes).replace(/^\uFEFF/, '');
};

const SYMBOL_OPTIONS = [
  'ALL',
  'BTCUSD',
  'ETHUSD',
  'XAUUSD',
  'XAGUSD',
  'USOIL',
  'US500',
  'US30',
  'USTEC',
  'DE30',
  'HK50',
  'JP225',
  'STOXX50',
  'UK100'
];

const STATUS_OPTIONS = ['ALL', 'PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'];
const MODE_OPTIONS = ['ALL', 'Open prices only', 'Every tick'];
const JOB_TYPES = [
  { value: 'ALL', label: 'All Types' },
  { value: 'OPEN_PRICE', label: 'Optimize' },
  { value: 'EVERY_TICK', label: 'Backtest' }
];

// ==============================|| STATUS CHIP COMPONENT ||============================== //

function StatusChip({ label, type }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const normalized = (type || '').toLowerCase();

  let style = {
    bgcolor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'grey.100',
    color: isDark ? 'grey.300' : 'text.secondary',
    border: isDark ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid rgba(0, 0, 0, 0.1)'
  };

  if (normalized === 'success' || normalized === 'completed' || normalized === 'online' || normalized === 'idle') {
    style = {
      bgcolor: isDark ? 'rgba(82, 196, 26, 0.15)' : 'rgba(82, 196, 26, 0.12)',
      color: isDark ? '#52c41a' : '#389e0d',
      border: isDark ? '1px solid rgba(82, 196, 26, 0.35)' : '1px solid rgba(82, 196, 26, 0.25)'
    };
  } else if (normalized === 'running' || normalized === 'active' || normalized === 'processing') {
    style = {
      bgcolor: isDark ? 'rgba(24, 144, 255, 0.15)' : 'rgba(24, 144, 255, 0.12)',
      color: isDark ? '#1890ff' : '#096dd9',
      border: isDark ? '1px solid rgba(24, 144, 255, 0.35)' : '1px solid rgba(24, 144, 255, 0.25)'
    };
  } else if (normalized === 'pending' || normalized === 'waiting' || normalized === 'queued') {
    // PENDING => Màu vàng (Gold/Yellow)
    style = {
      bgcolor: isDark ? 'rgba(250, 173, 20, 0.18)' : 'rgba(250, 173, 20, 0.12)',
      color: isDark ? '#ffc53d' : '#d48806',
      border: isDark ? '1px solid rgba(250, 173, 20, 0.45)' : '1px solid rgba(250, 173, 20, 0.3)'
    };
  } else if (normalized === 'paused' || normalized === 'draining' || normalized === 'stopped' || normalized === 'cancelled') {
    // PAUSED => Màu xám đen (Dark grey/Charcoal)
    style = {
      bgcolor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
      color: isDark ? '#d9d9d9' : '#434343',
      border: isDark ? '1px solid rgba(255, 255, 255, 0.22)' : '1px solid rgba(0, 0, 0, 0.22)'
    };
  } else if (normalized === 'error' || normalized === 'failed' || normalized === 'offline' || normalized === 'blocked') {
    style = {
      bgcolor: isDark ? 'rgba(255, 77, 79, 0.15)' : 'rgba(255, 77, 79, 0.12)',
      color: isDark ? '#ff4d4f' : '#cf1322',
      border: isDark ? '1px solid rgba(255, 77, 79, 0.35)' : '1px solid rgba(255, 77, 79, 0.25)'
    };
  } else if (normalized.includes('open price') || normalized === 'open prices only') {
    // Mode: Open prices only => Cyan / Teal
    style = {
      bgcolor: isDark ? 'rgba(19, 194, 194, 0.15)' : 'rgba(19, 194, 194, 0.12)',
      color: isDark ? '#13c2c2' : '#08979c',
      border: isDark ? '1px solid rgba(19, 194, 194, 0.35)' : '1px solid rgba(19, 194, 194, 0.25)'
    };
  } else if (normalized.includes('every tick')) {
    // Mode: Every tick => Purple / Violet
    style = {
      bgcolor: isDark ? 'rgba(114, 46, 209, 0.15)' : 'rgba(114, 46, 209, 0.12)',
      color: isDark ? '#b37feb' : '#722ed1',
      border: isDark ? '1px solid rgba(114, 46, 209, 0.35)' : '1px solid rgba(114, 46, 209, 0.25)'
    };
  }

  return (
    <Chip
      label={label}
      size="small"
      sx={{
        height: '22px',
        fontSize: '0.68rem',
        fontWeight: 700,
        borderRadius: '4px',
        '& .MuiChip-label': { px: 1 },
        ...style
      }}
    />
  );
}

StatusChip.propTypes = {
  label: PropTypes.oneOfType([PropTypes.string, PropTypes.node]).isRequired,
  type: PropTypes.string.isRequired
};

// ==============================|| REUSABLE JOBS DATA TABLE ||============================== //

function JobDataTable({
  title,
  subtitle,
  icon,
  badgeText,
  jobs,
  selectedJobIds,
  onToggleSelect,
  onSelectAll,
  onSelectAllPages,
  onBulkDelete,  onBulkCancel,
  onBulkRerun,
  onClearSelection,
  onViewDetails,  onRerun,
  onCancel,
  onDelete,
  onCopyId,
  copiedId,
  isDark,
  totalCount,
  controlledPage,
  controlledRowsPerPage,
  onServerPageChange,
  onServerRowsPerPageChange
}) {
  const [localPage, setLocalPage] = useState(0);
  const [localRowsPerPage, setLocalRowsPerPage] = useState(50);
  const isServerPaged = Number.isInteger(controlledPage);
  const page = isServerPaged ? controlledPage : localPage;
  const rowsPerPage = isServerPaged ? controlledRowsPerPage : localRowsPerPage;

  const pagedJobs = useMemo(() => isServerPaged ? jobs : jobs.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage), [isServerPaged, jobs, page, rowsPerPage]);

  const visibleJobIds = useMemo(() => pagedJobs.map((j) => j.id), [pagedJobs]);
  const isAllVisibleSelected = visibleJobIds.length > 0 && visibleJobIds.every((id) => selectedJobIds.includes(id));
  const isSomeVisibleSelected = visibleJobIds.some((id) => selectedJobIds.includes(id)) && !isAllVisibleSelected;

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectingAllPages, setSelectingAllPages] = useState(false);
  const selectedCountInThisTable = selectedJobIds.length;
  const isAllPagesSelected = totalCount > 0 && selectedCountInThisTable >= totalCount;
  const showCheckboxes = selectionMode || selectedCountInThisTable > 0;

  const handleSelectAllPages = async () => {
    if (selectingAllPages) return;
    if (isAllPagesSelected) {
      onClearSelection(selectedJobIds);
      return;
    }
    setSelectingAllPages(true);
    try {
      await onSelectAllPages();
    } finally {
      setSelectingAllPages(false);
    }
  };

  return (
    <MainCard
      content={false}
      title={
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
          <Stack direction="row" alignItems="center" spacing={1}>
            {icon}
            <Typography variant="h5">{title}</Typography>
            {badgeText && (
              <Chip
                size="small"
                label={badgeText}
                sx={{
                  height: 20,
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  bgcolor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'grey.200'
                }}
              />
            )}
          </Stack>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            {subtitle && (
              <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }}>
                {subtitle}
              </Typography>
            )}
            <Tooltip title={showCheckboxes ? 'Hide Selection' : 'Batch Select'}>
              <IconButton
                size="small"
                onClick={() => {
                  if (showCheckboxes) {
                    onClearSelection(selectedJobIds);
                    setSelectionMode(false);
                  } else {
                    setSelectionMode(true);
                  }
                }}
                sx={{
                  width: 30,
                  height: 30,
                  borderRadius: 1,
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
                <CheckSquareOutlined style={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>
      }
    >
      {/* Selection scope and bulk actions */}
      {showCheckboxes && (
        <Box
          sx={{
            p: 1.5,
            px: 2,
            bgcolor: isDark ? 'rgba(24, 144, 255, 0.12)' : '#e6f7ff',
            borderBottom: '1px solid',
            borderColor: isDark ? 'rgba(24, 144, 255, 0.3)' : '#91d5ff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 1.5
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <CheckSquareOutlined style={{ fontSize: 16, color: '#1890ff' }} />
            <Typography variant="subtitle2" fontWeight={700} sx={{ color: isDark ? '#40a9ff' : '#096dd9' }}>
              {selectedCountInThisTable} job(s) selected
            </Typography>
            <Button
              size="small"
              variant={isAllVisibleSelected ? 'contained' : 'outlined'}
              onClick={() => onSelectAll(pagedJobs)}
              sx={{ textTransform: 'none', py: 0.25 }}
            >
              {isAllVisibleSelected ? 'Deselect Current Page' : `Select Current Page (${visibleJobIds.length})`}
            </Button>
            <Button
              size="small"
              variant={isAllPagesSelected ? 'contained' : 'outlined'}
              onClick={handleSelectAllPages}
              disabled={selectingAllPages || totalCount === 0}
              sx={{ textTransform: 'none', py: 0.25 }}
            >
              {selectingAllPages
                ? 'Selecting...'
                : isAllPagesSelected
                  ? `Deselect All Pages (${totalCount})`
                  : `Select All Pages (${totalCount})`}
            </Button>
            {selectedCountInThisTable > 0 && (
              <Button size="small" variant="text" onClick={() => onClearSelection(selectedJobIds)} sx={{ textTransform: 'none', py: 0 }}>
                Clear Selection
              </Button>
            )}
          </Stack>

          {selectedCountInThisTable > 0 && <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            {/* Bulk Rerun */}
            <Button
              size="small"
              variant="contained"
              color="primary"
              startIcon={<RedoOutlined />}
              onClick={() => onBulkRerun(selectedJobIds)}
              sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 1 }}
            >
              Rerun Selected ({selectedCountInThisTable})
            </Button>

            {/* Bulk Cancel */}
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={<StopOutlined />}
              onClick={() => onBulkCancel(selectedJobIds)}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 1 }}
            >
              Cancel Jobs ({selectedCountInThisTable})
            </Button>

            {/* Bulk Delete */}
            <Button
              size="small"
              variant="contained"
              color="error"
              startIcon={<DeleteOutlined />}
              onClick={() => onBulkDelete(selectedJobIds)}
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                borderRadius: 1,
                boxShadow: '0 2px 8px rgba(255, 77, 79, 0.3)'
              }}
            >
              Delete Selected ({selectedCountInThisTable})
            </Button>
          </Stack>}
        </Box>
      )}

      <TableContainer sx={{ maxHeight: 600 }}>
        <Table stickyHeader size="small" aria-label="jobs queue table">
          <TableHead>
            <TableRow>
              {/* Checkbox select all */}
              {showCheckboxes && (
                <TableCell padding="checkbox" sx={{ width: 44, pl: 2 }}>
                  <Checkbox
                    size="small"
                    indeterminate={isSomeVisibleSelected}
                    checked={isAllVisibleSelected}
                    onChange={() => onSelectAll(pagedJobs)}
                    inputProps={{ 'aria-label': 'select all visible jobs' }}
                  />
                </TableCell>
              )}
              <TableCell sx={{ fontWeight: 700, minWidth: 160 }}>JOB NAME</TableCell>
              <TableCell sx={{ fontWeight: 700, minWidth: 140 }}>STRATEGY</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700, minWidth: 130 }}>MODE</TableCell>
              <TableCell sx={{ fontWeight: 700, minWidth: 90 }}>OWNER</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700, minWidth: 110 }}>STATUS</TableCell>
              <TableCell sx={{ fontWeight: 700, minWidth: 170 }}>ACTIVITY</TableCell>
              <TableCell sx={{ fontWeight: 700, minWidth: 130 }}>WORKER</TableCell>
              <TableCell sx={{ fontWeight: 700, minWidth: 105 }}>DURATION</TableCell>
              <TableCell sx={{ fontWeight: 700, minWidth: 120 }}>LAST HEARTBEAT</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700, minWidth: 110 }}>ERROR</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700, minWidth: 160 }}>ACTIONS</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pagedJobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={showCheckboxes ? 12 : 11} align="center" sx={{ py: 6 }}>
                  <Stack spacing={1} alignItems="center">
                    <ExclamationCircleOutlined style={{ fontSize: 32, color: 'text.secondary' }} />
                    <Typography variant="subtitle1" color="text.secondary">
                      No optimization jobs in this queue
                    </Typography>
                  </Stack>
                </TableCell>
              </TableRow>
            ) : (
              pagedJobs.map((job) => {
                const isSelected = selectedJobIds.includes(job.id);
                return (
                  <TableRow
                    key={job.id}
                    hover
                    selected={isSelected}
                    sx={{
                      '&:last-child td, &:last-child th': { border: 0 },
                      bgcolor: isSelected
                        ? isDark
                          ? 'rgba(24, 144, 255, 0.12) !important'
                          : 'rgba(24, 144, 255, 0.08) !important'
                        : job.status === 'RUNNING'
                        ? isDark
                          ? 'rgba(24, 144, 255, 0.04)'
                          : 'rgba(24, 144, 255, 0.02)'
                        : 'inherit'
                    }}
                  >
                    {/* Row Checkbox */}
                    {showCheckboxes && (
                      <TableCell padding="checkbox" sx={{ pl: 2 }}>
                        <Checkbox
                          size="small"
                          checked={isSelected}
                          onChange={() => onToggleSelect(job.id, job.jobType, job.status)}
                          inputProps={{ 'aria-label': `select job ${job.id}` }}
                        />
                      </TableCell>
                    )}

                    {/* 1. JOB NAME */}
                    <TableCell>
                      <Typography variant="subtitle2" fontWeight={700} sx={{ color: 'primary.main' }}>
                        {job.jobName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {job.displayId}
                      </Typography>
                    </TableCell>

                    {/* 2. STRATEGY */}
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {job.strategy}
                      </Typography>
                    </TableCell>

                    {/* 3. MODE */}
                    <TableCell align="center">
                      <StatusChip label={job.mode} type={job.mode} />
                    </TableCell>

                    {/* 4. OWNER */}
                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Avatar
                          sx={{
                            width: 24,
                            height: 24,
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            bgcolor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'grey.300',
                            color: isDark ? '#fff' : 'text.primary'
                          }}
                        >
                          {job.ownerAvatar}
                        </Avatar>
                        <Typography variant="body2" fontWeight={500}>
                          {job.owner}
                        </Typography>
                      </Stack>
                    </TableCell>

                    {/* 5. STATUS */}
                    <TableCell align="center">
                      <StatusChip label={job.status} type={job.status} />
                    </TableCell>

                    {/* 6. ACTIVITY */}
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{
                          fontSize: '0.8rem',
                          color:
                            job.status === 'RUNNING'
                              ? 'primary.main'
                              : job.status === 'COMPLETED'
                              ? 'success.main'
                              : job.status === 'FAILED'
                              ? 'error.main'
                              : 'text.secondary',
                          fontWeight: job.status === 'RUNNING' || job.status === 'COMPLETED' ? 600 : 500,
                          maxWidth: 190,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {job.activity}
                      </Typography>
                    </TableCell>

                    {/* 7. WORKER */}
                    <TableCell>
                      <Stack direction="row" spacing={0.75} alignItems="center">
                        <Box
                          sx={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            bgcolor:
                              job.worker === 'Unassigned'
                                ? 'grey.400'
                                : job.status === 'RUNNING'
                                ? '#52c41a'
                                : 'primary.main'
                          }}
                        />
                        <Typography variant="body2" fontWeight={600}>
                          {job.worker}
                        </Typography>
                      </Stack>
                    </TableCell>

                    {/* 9. DURATION */}
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{
                          fontSize: '0.78rem',
                          fontFamily: 'monospace',
                          fontWeight: 600,
                          color: isDark ? 'grey.300' : 'text.primary'
                        }}
                      >
                        {job.duration}
                      </Typography>
                    </TableCell>

                    {/* 10. LAST HEARTBEAT */}
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {job.lastHeartbeat}
                      </Typography>
                    </TableCell>

                    {/* 11. ERROR */}
                    <TableCell align="center">
                      {job.error ? (
                        <Tooltip title={job.error} arrow>
                          <span>
                            <StatusChip label="Error Log" type="error" />
                          </span>
                        </Tooltip>
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          —
                        </Typography>
                      )}
                    </TableCell>

                    {/* 12. ACTIONS */}
                    <TableCell align="center">
                      <Stack direction="row" spacing={0.75} justifyContent="center" alignItems="center">
                        {/* View details / logs */}
                        <Tooltip title="View Details & Logs">
                          <IconButton
                            size="small"
                            onClick={() => onViewDetails(job)}
                            sx={{
                              width: 28,
                              height: 28,
                              borderRadius: 1,
                              border: '1px solid',
                              borderColor: isDark ? 'rgba(24, 144, 255, 0.45)' : 'rgba(24, 144, 255, 0.35)',
                              bgcolor: isDark ? 'rgba(24, 144, 255, 0.15)' : 'rgba(24, 144, 255, 0.08)',
                              color: isDark ? '#40a9ff' : '#1890ff',
                              '&:hover': {
                                bgcolor: isDark ? 'rgba(24, 144, 255, 0.3)' : 'rgba(24, 144, 255, 0.2)',
                                borderColor: '#1890ff'
                              }
                            }}
                          >
                            <EyeOutlined style={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>

                        {/* Re-run */}
                        {(job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'CANCELLED') && (
                          <Tooltip title="Rerun Job">
                            <IconButton
                              size="small"
                              onClick={() => onRerun(job)}
                              sx={{
                                width: 28,
                                height: 28,
                                borderRadius: 1,
                                border: '1px solid',
                                borderColor: isDark ? 'rgba(19, 194, 194, 0.5)' : 'rgba(19, 194, 194, 0.4)',
                                bgcolor: isDark ? 'rgba(19, 194, 194, 0.18)' : 'rgba(19, 194, 194, 0.1)',
                                color: isDark ? '#36cfc9' : '#08979c',
                                '&:hover': {
                                  bgcolor: isDark ? 'rgba(19, 194, 194, 0.32)' : 'rgba(19, 194, 194, 0.22)',
                                  borderColor: '#13c2c2'
                                }
                              }}
                            >
                              <RedoOutlined style={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                        )}

                        {/* Cancel */}
                        {(job.status === 'RUNNING' || job.status === 'PENDING') && (
                          <Tooltip title="Cancel Job">
                            <IconButton
                              size="small"
                              onClick={() => onCancel(job.id)}
                              sx={{
                                width: 28,
                                height: 28,
                                borderRadius: 1,
                                border: '1px solid',
                                borderColor: isDark ? 'rgba(255, 77, 79, 0.5)' : 'rgba(255, 77, 79, 0.4)',
                                bgcolor: isDark ? 'rgba(255, 77, 79, 0.18)' : 'rgba(255, 77, 79, 0.1)',
                                color: isDark ? '#ff7875' : '#cf1322',
                                '&:hover': {
                                  bgcolor: isDark ? 'rgba(255, 77, 79, 0.32)' : 'rgba(255, 77, 79, 0.22)',
                                  borderColor: '#ff4d4f'
                                }
                              }}
                            >
                              <StopOutlined style={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                        )}

                        {/* Delete */}
                        <Tooltip title="Delete Job">
                          <IconButton
                            size="small"
                            onClick={() => onDelete(job.id)}
                            sx={{
                              width: 28,
                              height: 28,
                              borderRadius: 1,
                              border: '1px solid',
                              borderColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)',
                              bgcolor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                              color: isDark ? 'grey.400' : 'text.secondary',
                              '&:hover': {
                                borderColor: isDark ? '#ff4d4f' : '#cf1322',
                                color: isDark ? '#ff4d4f' : '#cf1322',
                                bgcolor: isDark ? 'rgba(255, 77, 79, 0.18)' : 'rgba(255, 77, 79, 0.1)'
                              }
                            }}
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

      <TablePagination
        rowsPerPageOptions={[5, 10, 25, 50]}
        component="div"
        count={isServerPaged ? totalCount : jobs.length}
        rowsPerPage={rowsPerPage}
        page={page}
        showFirstButton
        showLastButton
        onPageChange={(_, newPage) => isServerPaged ? onServerPageChange(newPage) : setLocalPage(newPage)}
        onRowsPerPageChange={(e) => {
          const size = parseInt(e.target.value, 10);
          if (isServerPaged) onServerRowsPerPageChange(size);
          else { setLocalRowsPerPage(size); setLocalPage(0); }
        }}
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
    </MainCard>
  );
}

JobDataTable.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  icon: PropTypes.node,
  badgeText: PropTypes.string,
  jobs: PropTypes.array.isRequired,
  selectedJobIds: PropTypes.array.isRequired,
  onToggleSelect: PropTypes.func.isRequired,
  onSelectAll: PropTypes.func.isRequired,
  onSelectAllPages: PropTypes.func.isRequired,
  onBulkDelete: PropTypes.func.isRequired,
  onBulkCancel: PropTypes.func.isRequired,
  onBulkRerun: PropTypes.func.isRequired,
  onClearSelection: PropTypes.func.isRequired,
  onViewDetails: PropTypes.func.isRequired,
  onRerun: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onCopyId: PropTypes.func.isRequired,
  copiedId: PropTypes.string,
  isDark: PropTypes.bool,
  totalCount: PropTypes.number,
  controlledPage: PropTypes.number,
  controlledRowsPerPage: PropTypes.number,
  onServerPageChange: PropTypes.func,
  onServerRowsPerPageChange: PropTypes.func
};

// ==============================|| MAIN COMPONENT ||============================== //

export default function JobsQueueProcessTab() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const fileInputRef = useRef(null);
  const jobsPollingRef = useRef(false);

  // States
  const [jobs, setJobs] = useState([]);
  const [selectedJobIds, setSelectedJobIds] = useState([]);
  const [selectedJobTypes, setSelectedJobTypes] = useState({});
  const [selectedJobStatuses, setSelectedJobStatuses] = useState({});
  const [bulkAction, setBulkAction] = useState(null);
  const [bulkActionBusy, setBulkActionBusy] = useState(false);
  const [rerunJob, setRerunJob] = useState(null);
  const [rerunCount, setRerunCount] = useState(1);
  const [rerunBusy, setRerunBusy] = useState(false);
  const [viewMode, setViewMode] = useState('split'); // 'combined' | 'split'
  const [jobPage, setJobPage] = useState(0);
  const [jobRowsPerPage, setJobRowsPerPage] = useState(50);
  const [jobTotal, setJobTotal] = useState(0);
  const [optimizationJobsPage, setOptimizationJobsPage] = useState(0);
  const [optimizationJobsTotal, setOptimizationJobsTotal] = useState(0);
  const [optimizationJobRows, setOptimizationJobRows] = useState([]);
  const [backtestJobsPage, setBacktestJobsPage] = useState(0);
  const [backtestJobsTotal, setBacktestJobsTotal] = useState(0);
  const [backtestJobRows, setBacktestJobRows] = useState([]);
  const [jobSummary, setJobSummary] = useState(null);
  const [jobsRefreshKey, setJobsRefreshKey] = useState(0);
  const [jobFilterOptions, setJobFilterOptions] = useState({ workers: [], hasUnassigned: false });

  // Sessions state
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(() => {
    return localStorage.getItem('mt5_active_session_id') || '';
  });
  const [createSessionOpen, setCreateSessionOpen] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [newSessionDesc, setNewSessionDesc] = useState('');

  // Synchronize with Header Session Dropdown
  useEffect(() => {
    let active = true;
    listMt5Sessions()
      .then((rows) => {
        if (!active) return;
        const mapped = rows.map(mapSession);
        setSessions(mapped);
        setSelectedSessionId((currentId) => {
          const storedId = localStorage.getItem('mt5_active_session_id') || '';
          const nextId = mapped.some((session) => session.id === currentId)
            ? currentId
            : mapped.some((session) => session.id === storedId)
              ? storedId
              : mapped[0]?.id || '';
          if (nextId) localStorage.setItem('mt5_active_session_id', nextId);
          else localStorage.removeItem('mt5_active_session_id');
          return nextId;
        });
      })
      .catch((error) => {
        if (!active) return;
        setSessions([]);
        setUploadMessage({ type: 'error', text: error.message || 'Unable to load optimization sessions.' });
      });

    const handleSessionEvent = (e) => {
      const detail = e?.detail;
      if (!detail) return;
      if (detail.sessionId) {
        setSelectedSessionId(detail.sessionId);
        setJobPage(0);
        setOptimizationJobsPage(0);
        setBacktestJobsPage(0);
        setJobsRefreshKey((current) => current + 1);
      }
      if (Array.isArray(detail.sessionsList)) {
        setSessions(detail.sessionsList.map(mapSession));
      } else if (detail.session) {
        const incoming = mapSession(detail.session);
        setSessions((current) => [incoming, ...current.filter((session) => session.id !== incoming.id)]);
      }
    };
    window.addEventListener('mt5:session-change', handleSessionEvent);
    return () => {
      active = false;
      window.removeEventListener('mt5:session-change', handleSessionEvent);
    };
  }, []);


  // Filter input states
  const [inputFilters, setInputFilters] = useState({
    search: '',
    status: 'ALL',
    mode: 'ALL',
    symbol: 'ALL',
    jobType: 'ALL',
    worker: 'ALL'
  });

  // Applied filter state
  const [appliedFilters, setAppliedFilters] = useState({
    search: '',
    status: 'ALL',
    mode: 'ALL',
    symbol: 'ALL',
    jobType: 'ALL',
    worker: 'ALL'
  });

  const [optimiRunCount, setOptimiRunCount] = useState(3);

  const loadJobs = async (sessionId = selectedSessionId) => {
    if (!sessionId) {
      setJobs([]);
      setJobTotal(0);
      setOptimizationJobRows([]);
      setOptimizationJobsTotal(0);
      setBacktestJobRows([]);
      setBacktestJobsTotal(0);
      setJobSummary(null);
      return;
    }
    const status =
      appliedFilters.status === 'COMPLETED' ? 'DONE' : appliedFilters.status === 'ALL' ? null : appliedFilters.status;
    const jobType = appliedFilters.jobType === 'ALL' ? null : appliedFilters.jobType;
    const modeJobType = appliedFilters.mode === 'Open prices only'
      ? 'OPEN_PRICE'
      : appliedFilters.mode === 'Every tick'
        ? 'EVERY_TICK'
        : null;
    const hasConflictingTypeFilters = Boolean(jobType && modeJobType && jobType !== modeJobType);
    const commonParams = {
      session_id: sessionId,
      page_size: jobRowsPerPage,
      status,
      worker: appliedFilters.worker === 'ALL' ? null : appliedFilters.worker,
      search: appliedFilters.search.trim() || null,
      symbol: appliedFilters.symbol === 'ALL' ? null : appliedFilters.symbol
    };

    if (viewMode === 'split') {
      const loadMode = (type, page) => {
        if (hasConflictingTypeFilters || (jobType && jobType !== type) || (modeJobType && modeJobType !== type)) {
          return Promise.resolve(null);
        }
        return listMt5Jobs({ ...commonParams, page: page + 1, job_type: type });
      };
      const [optimizationPayload, backtestPayload] = await Promise.all([
        loadMode('OPEN_PRICE', optimizationJobsPage),
        loadMode('EVERY_TICK', backtestJobsPage)
      ]);
      const optimizationRows = optimizationPayload?.items?.map(mapJob) || [];
      const backtestRows = backtestPayload?.items?.map(mapJob) || [];
      const metadata = optimizationPayload || backtestPayload;
      setOptimizationJobRows(optimizationRows);
      setOptimizationJobsTotal(optimizationPayload?.total || 0);
      setBacktestJobRows(backtestRows);
      setBacktestJobsTotal(backtestPayload?.total || 0);
      setJobs([...optimizationRows, ...backtestRows]);
      setJobTotal(metadata?.summary?.total || 0);
      setJobSummary(metadata?.summary || null);
      setJobFilterOptions(metadata?.filterOptions || { workers: [], hasUnassigned: false });
      return;
    }

    if (hasConflictingTypeFilters) {
      setJobs([]);
      setJobTotal(0);
      return;
    }
    const payload = await listMt5Jobs({ ...commonParams, page: jobPage + 1, job_type: jobType || modeJobType });
    setJobs(payload.items.map(mapJob));
    setJobTotal(payload.total);
    setJobSummary(payload.summary || null);
    setJobFilterOptions(payload.filterOptions || { workers: [], hasUnassigned: false });
  };
  useEffect(() => {
    const showLoadError = (error) => {
      setJobs([]);
      setJobTotal(0);
      setJobSummary(null);
      if (isMt5SessionNotFoundError(error)) {
        localStorage.removeItem('mt5_active_session_id');
        setSelectedSessionId('');
        setUploadMessage(null);
        return;
      }
      setUploadMessage({ type: 'error', text: error.message || 'Unable to load optimization jobs.' });
    };
    const pollJobs = async (showError = false) => {
      if (jobsPollingRef.current) return;
      jobsPollingRef.current = true;
      try {
        await loadJobs();
      } catch (error) {
        if (showError) showLoadError(error);
      } finally {
        jobsPollingRef.current = false;
      }
    };
    pollJobs(true);
    if (!selectedSessionId) return undefined;
    const timer = setInterval(() => pollJobs(false), 5000);
    return () => clearInterval(timer);
  }, [selectedSessionId, viewMode, jobPage, optimizationJobsPage, backtestJobsPage, jobRowsPerPage, appliedFilters.search, appliedFilters.status, appliedFilters.mode, appliedFilters.symbol, appliedFilters.jobType, appliedFilters.worker, jobsRefreshKey]);

  // Upload state
  const [uploadedZip, setUploadedZip] = useState(null);
  const [uploadMessage, setUploadMessage] = useState(null);

  // Detail dialog
  const [selectedJob, setSelectedJob] = useState(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const handleOpenJobDetails = async (job) => {
    const currentSession = sessions.find((s) => s.id === job.sessionId);
    const isCompleted = job.status === 'COMPLETED' || job.status === 'DONE';
    setSelectedJob({
      ...job,
      sessionName: currentSession?.name || job.sessionName || '',
      storedSets: isCompleted ? (job.storedSets != null ? job.storedSets : '...') : null
    });
    setLogsOpen(true);

    // Only query fallback when job has actually COMPLETED and doesn't already have stored count in payload
    if (isCompleted && job.jobType !== 'EVERY_TICK' && job.storedSets == null && job.sessionId && job.strategy) {
      try {
        const payload = await listMt5Results({
          session_id: job.sessionId,
          strategy_id: job.strategy,
          page: 1,
          page_size: 1
        });
        if (payload && typeof payload.total === 'number') {
          setSelectedJob((prev) => (prev && prev.id === job.id ? { ...prev, storedSets: payload.total } : prev));
        }
      } catch (err) {
        console.warn('Unable to query stored parameter sets count:', err);
      }
    }
  };

  // Session create handler
  const handleCreateSession = async () => { if(!newSessionName.trim())return; try { const created=mapSession(await createMt5Session({name:newSessionName.trim(),description:newSessionDesc.trim()||null})); setSessions((p)=>[created,...p]); setSelectedSessionId(created.id); localStorage.setItem('mt5_active_session_id',created.id); window.dispatchEvent(new CustomEvent('mt5:session-change',{detail:{sessionId:created.id,session:created,sessionsList:[created,...sessions]}})); setCreateSessionOpen(false); setNewSessionName(''); setNewSessionDesc(''); setUploadMessage({type:'success',text:'Created Session "'+created.name+'".'}); } catch(error){setUploadMessage({type:'error',text:error.message});} };

  // 4 KPI Summary Metrics Calculation  // 4 KPI Summary Metrics Calculation
  const metrics = useMemo(() => {
    const total = Number(jobSummary?.total ?? jobTotal);
    const running = Number(jobSummary?.running ?? 0);
    const completed = Number(jobSummary?.completed ?? 0);
    const failed = Number(jobSummary?.failed ?? 0);
    const pending = Number(jobSummary?.pending ?? 0);
    const totalPassedCandidates = Number(jobSummary?.stored_results ?? 0);
    const optimizationCount = Number(jobSummary?.optimize ?? 0);
    const backtestCount = Number(jobSummary?.backtest ?? 0);

    return {
      total,
      running,
      completed,
      failed,
      pending,
      totalPassedCandidates,
      optimizationCount,
      backtestCount
    };
  }, [jobSummary, jobTotal]);

  // Filter handlers
  const handleInputChange = (field, value) => {
    setInputFilters((prev) => {
      if (field === 'mode') return { ...prev, mode: value, jobType: 'ALL' };
      if (field === 'jobType') return { ...prev, jobType: value, mode: 'ALL' };
      return { ...prev, [field]: value };
    });
  };

  const handleApplyFilters = () => {
    setAppliedFilters({ ...inputFilters });
    handleClearSelection();
    setJobPage(0);
    setOptimizationJobsPage(0);
    setBacktestJobsPage(0);
  };

  const handleResetFilters = () => {
    const defaultFilters = {
      search: '',
      status: 'ALL',
      mode: 'ALL',
      symbol: 'ALL',
      jobType: 'ALL',
      worker: 'ALL'
    };
    setInputFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
    handleClearSelection();
    setJobPage(0);
    setOptimizationJobsPage(0);
    setBacktestJobsPage(0);
  };

  // Filtered jobs based on appliedFilters
  const filteredJobs = jobs;

  // Split datasets for split view
  const optimizationJobs = optimizationJobRows;
  const backtestJobs = backtestJobRows;

  // Selection handlers
  const handleToggleSelect = (jobId, jobType, jobStatus) => {
    setSelectedJobIds((prev) => {
      if (prev.includes(jobId)) {
        setSelectedJobTypes((types) => {
          const next = { ...types };
          delete next[jobId];
          return next;
        });
        setSelectedJobStatuses((statuses) => {
          const next = { ...statuses };
          delete next[jobId];
          return next;
        });
        return prev.filter((id) => id !== jobId);
      }
      setSelectedJobTypes((types) => ({ ...types, [jobId]: jobType }));
      setSelectedJobStatuses((statuses) => ({ ...statuses, [jobId]: jobStatus }));
      return [...prev, jobId];
    });
  };

  const handleSelectAll = (visibleJobs) => {
    const visibleIds = visibleJobs.map((job) => job.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedJobIds.includes(id));
    if (allSelected) {
      setSelectedJobIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
      setSelectedJobTypes((types) => {
        const next = { ...types };
        visibleIds.forEach((id) => delete next[id]);
        return next;
      });
      setSelectedJobStatuses((statuses) => {
        const next = { ...statuses };
        visibleIds.forEach((id) => delete next[id]);
        return next;
      });
    } else {
      setSelectedJobIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
      setSelectedJobTypes((types) => {
        const next = { ...types };
        visibleJobs.forEach((job) => { next[job.id] = job.jobType; });
        return next;
      });
      setSelectedJobStatuses((statuses) => {
        const next = { ...statuses };
        visibleJobs.forEach((job) => { next[job.id] = job.status; });
        return next;
      });
    }
  };

  const handleClearSelection = (ids = null) => {
    if (!ids?.length) {
      setSelectedJobIds([]);
      setSelectedJobTypes({});
      setSelectedJobStatuses({});
      return;
    }
    const removeIds = new Set(ids);
    setSelectedJobIds((prev) => prev.filter((id) => !removeIds.has(id)));
    setSelectedJobTypes((types) => {
      const next = { ...types };
      removeIds.forEach((id) => delete next[id]);
      return next;
    });
    setSelectedJobStatuses((statuses) => {
      const next = { ...statuses };
      removeIds.forEach((id) => delete next[id]);
      return next;
    });
  };

  const handleSelectAllPages = async (forcedJobType = null) => {
    if (!selectedSessionId) return;
    const status =
      appliedFilters.status === 'COMPLETED' ? 'DONE' : appliedFilters.status === 'ALL' ? null : appliedFilters.status;
    const selectedJobType = appliedFilters.jobType === 'ALL' ? null : appliedFilters.jobType;
    const modeJobType = appliedFilters.mode === 'Open prices only'
      ? 'OPEN_PRICE'
      : appliedFilters.mode === 'Every tick'
        ? 'EVERY_TICK'
        : null;
    const conflicting = Boolean(selectedJobType && modeJobType && selectedJobType !== modeJobType);
    const effectiveJobType = forcedJobType || selectedJobType || modeJobType;
    if (
      conflicting ||
      (forcedJobType && selectedJobType && forcedJobType !== selectedJobType) ||
      (forcedJobType && modeJobType && forcedJobType !== modeJobType)
    ) return;

    try {
      const payload = await listMt5JobSelection({
        session_id: selectedSessionId,
        status,
        job_type: effectiveJobType,
        worker: appliedFilters.worker === 'ALL' ? null : appliedFilters.worker,
        search: appliedFilters.search.trim() || null,
        symbol: appliedFilters.symbol === 'ALL' ? null : appliedFilters.symbol
      });
      const items = payload?.items || [];
      setSelectedJobIds((prev) => Array.from(new Set([...prev, ...items.map((item) => item.id)])));
      setSelectedJobTypes((types) => {
        const next = { ...types };
        items.forEach((item) => { next[item.id] = item.jobType; });
        return next;
      });
      setSelectedJobStatuses((statuses) => {
        const next = { ...statuses };
        items.forEach((item) => { next[item.id] = item.status; });
        return next;
      });
    } catch (error) {
      setUploadMessage({ type: 'error', text: error.message || 'Unable to select jobs from all pages.' });
    }
  };

  const optimizationSelectedJobIds = selectedJobIds.filter((id) => selectedJobTypes[id] === 'OPEN_PRICE');
  const backtestSelectedJobIds = selectedJobIds.filter((id) => selectedJobTypes[id] === 'EVERY_TICK');

  // Queue actions
  const chosenIds=(ids)=>(ids?.length?ids:selectedJobIds);
  const handleBulkDelete=(ids)=>{const jobIds=chosenIds(ids);if(jobIds.length)setBulkAction({type:'delete',jobIds});};
  const handleBulkCancel=(ids)=>{const jobIds=chosenIds(ids);if(jobIds.length)setBulkAction({type:'cancel',jobIds});};
  const handleConfirmBulkAction=async()=>{
    if(!bulkAction||bulkActionBusy)return;
    setBulkActionBusy(true);
    try {
      const action=bulkAction.type==='delete'?deleteMt5Job:cancelMt5Job;
      for (let offset = 0; offset < bulkAction.jobIds.length; offset += 10) {
        await Promise.all(bulkAction.jobIds.slice(offset, offset + 10).map(action));
      }
      setSelectedJobIds([]);
      setSelectedJobTypes({});
      setSelectedJobStatuses({});
      setUploadMessage({type:'success',text:bulkAction.type==='delete'?`Deleted ${bulkAction.jobIds.length} job(s).`:`Cancelled ${bulkAction.jobIds.length} job(s).`});
      setBulkAction(null);
      await loadJobs();
    } catch(error) {
      setUploadMessage({type:'error',text:error.message});
    } finally {
      setBulkActionBusy(false);
    }
  };
  const handleOpenRerun = (job) => {
    setRerunJob(job);
    setRerunCount(1);
  };
  const handleOpenBulkRerun = (ids) => {
    const selectedIds = chosenIds(ids);
    const rerunnableStatuses = new Set(['COMPLETED', 'DONE', 'FAILED', 'CANCELLED']);
    const eligibleIds = selectedIds.filter((id) => rerunnableStatuses.has(selectedJobStatuses[id]));
    if (!eligibleIds.length) {
      setUploadMessage({ type: 'error', text: 'Only completed, failed, or cancelled jobs can be rerun.' });
      return;
    }
    setRerunJob({
      isBulk: true,
      jobIds: eligibleIds,
      selectedCount: selectedIds.length,
      jobType: eligibleIds.every((id) => selectedJobTypes[id] === 'EVERY_TICK') ? 'EVERY_TICK' : 'MIXED'
    });
    setRerunCount(1);
  };
  const handleConfirmRerun = async () => {
    const count = Number(rerunCount);
    if (!rerunJob || rerunBusy || !Number.isInteger(count) || count < 1 || count > 20) return;
    const jobIds = rerunJob.isBulk ? rerunJob.jobIds : [rerunJob.id];
    setRerunBusy(true);
    try {
      const succeeded = [];
      const failed = [];
      for (let offset = 0; offset < jobIds.length; offset += 10) {
        const batch = jobIds.slice(offset, offset + 10);
        const results = await Promise.allSettled(batch.map((id) => retryMt5Job(id, count)));
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') succeeded.push(batch[index]);
          else failed.push({ id: batch[index], error: result.reason?.message || 'Rerun failed' });
        });
      }
      if (!succeeded.length) throw new Error(failed[0]?.error || 'Unable to rerun selected jobs.');
      setUploadMessage({
        type: failed.length ? 'error' : 'success',
        text: failed.length
          ? `Scheduled ${count} run(s) for ${succeeded.length} job(s); ${failed.length} job(s) could not be rerun.`
          : `Scheduled ${count} run(s) for ${succeeded.length} job(s) (${succeeded.length * count} total executions).`
      });
      handleClearSelection(succeeded);
      setRerunJob(null);
      await loadJobs();
    } catch (error) {
      setUploadMessage({ type: 'error', text: error.message });
    } finally {
      setRerunBusy(false);
    }
  };
  const handleCancelJob=async(id)=>{await cancelMt5Job(id);await loadJobs();}; const handleDeleteJob=async(id)=>{await deleteMt5Job(id);handleClearSelection([id]);await loadJobs();};

  const handleCopyId = (id) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Handle Zip upload
  const handleZipUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.zip')) {
      setUploadMessage({ type: 'error', text: 'Please select a valid .ZIP archive containing INI configuration files' });
      return;
    }

    setUploadedZip({
      name: file.name,
      size: (file.size / 1024).toFixed(1) + ' KB',
      file: file
    });
    setUploadMessage({
      type: 'success',
      text: `Ready to upload ${file.name} (${(file.size / 1024).toFixed(1)} KB). Select OptimiRun cycles and click Launch.`
    });
  };

  // Launch optimization from ZIP
  const handleLaunchOptimization = async () => {
    if (!uploadedZip || !selectedSessionId) {
      setUploadMessage({ type: 'warning', text: 'Select a Session and upload an INI ZIP first.' });
      return;
    }
    try {
      const archive = await JSZip.loadAsync(uploadedZip.file);
      const entries = Object.values(archive.files).filter((entry) => !entry.dir && entry.name.toLowerCase().endsWith('.ini'));
      if (!entries.length) throw new Error('ZIP does not contain any INI files.');
      const jobs = [];
      for (const entry of entries) {
        const iniContent = decodeIni(await entry.async('uint8array'));
        const filename = entry.name.split('/').pop();
        if (!hasEnabledOptimizationInput(iniContent)) {
          throw new Error(`${filename}: enable at least one TesterInputs parameter for optimization before launch`);
        }
        const rawStrategyName = filename.replace(/\.ini$/i, '').slice(0, 160);
        jobs.push({
          strategyId: formatStrategyCode(rawStrategyName),
          jobName: rawStrategyName,
          jobType: 'OPEN_PRICE',
          iniContent,
          jobPayload: { job_name: rawStrategyName, optimize_runs: Math.max(1, Number(optimiRunCount) || 1) }
        });
      }
      for (let offset = 0; offset < jobs.length; offset += 500) {
        await createMt5Jobs({ sessionId: selectedSessionId, jobs: jobs.slice(offset, offset + 500) });
      }
      setUploadMessage({ type: 'success', text: `Created ${jobs.length} Open Price job(s).` });
      setUploadedZip(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadJobs();
    } catch (error) {
      setUploadMessage({ type: 'error', text: error.message });
    }
  };

  // 4 KPI Summary Cards Configuration  // 4 KPI Summary Cards Configuration (Overview Style matching Setup Workers)
  const summaryCards = [
    {
      label: 'TOTAL QUEUED JOBS',
      value: `${metrics.total} Jobs`,
      sub: `${metrics.pending} Pending • ${metrics.running} Active`,
      valueColor: isDark ? '#e6f7ff' : theme.palette.text.primary,
      icon: <CloudServerOutlined style={{ fontSize: '18px', color: '#1890ff' }} />,
      iconBg: isDark ? 'rgba(24, 144, 255, 0.18)' : '#e6f7ff'
    },
    {
      label: 'ACTIVE OPTIMIZATIONS',
      value: `${metrics.running} Active`,
      sub: `${metrics.running} Worker nodes executing`,
      valueColor: theme.palette.primary.main,
      icon: <ThunderboltOutlined style={{ fontSize: '18px', color: '#13c2c2' }} />,
      iconBg: isDark ? 'rgba(19, 194, 194, 0.18)' : '#e6fffb'
    },
    {
      label: 'COMPLETED & FAILED',
      value: (
        <Stack direction="row" spacing={0.75} alignItems="baseline">
          <Typography component="span" sx={{ fontWeight: 700, color: theme.palette.success.main, fontSize: 'inherit' }}>
            {metrics.completed} Done
          </Typography>
          <Typography component="span" sx={{ color: 'text.secondary', fontSize: '0.9rem', fontWeight: 500 }}>
            •
          </Typography>
          <Typography component="span" sx={{ fontWeight: 700, color: theme.palette.error.main, fontSize: 'inherit' }}>
            {metrics.failed} Failed
          </Typography>
        </Stack>
      ),
      sub: `${metrics.totalPassedCandidates} Candidates found • ${metrics.failed} Require inspection`,
      valueColor: theme.palette.success.main,
      icon: <CheckCircleOutlined style={{ fontSize: '18px', color: '#52c41a' }} />,
      iconBg: isDark ? 'rgba(82, 196, 26, 0.18)' : '#f6ffed'
    },
    {
      label: 'OPTIMIZE & BACKTEST',
      value: (
        <Stack direction="row" spacing={0.75} alignItems="baseline">
          <Typography component="span" sx={{ fontWeight: 700, color: '#1890ff', fontSize: 'inherit' }}>
            {metrics.optimizationCount} Optimization
          </Typography>
          <Typography component="span" sx={{ color: 'text.secondary', fontSize: '0.9rem', fontWeight: 500 }}>
            •
          </Typography>
          <Typography component="span" sx={{ fontWeight: 700, color: isDark ? '#d3adf7' : '#722ed1', fontSize: 'inherit' }}>
            {metrics.backtestCount} Backtest
          </Typography>
        </Stack>
      ),
      sub: `${metrics.optimizationCount} Open prices • ${metrics.backtestCount} Every tick`,
      valueColor: isDark ? '#d3adf7' : '#722ed1',
      icon: <AimOutlined style={{ fontSize: '18px', color: '#722ed1' }} />,
      iconBg: isDark ? 'rgba(114, 46, 209, 0.18)' : '#f9f0ff'
    }
  ];

  return (
    <Stack spacing={{ xs: 2, sm: 2.5 }} sx={{ width: '100%' }}>
      {/* ── 1. TOP 4 KPI SUMMARY CARDS (OVERVIEW STYLE) ── */}
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

      {/* ── 2. BLOCK UPLOAD ZIP INI & LAUNCH OPTIMIZATION ── */}
      <MainCard
        title={
          <Stack direction="row" alignItems="center" spacing={1}>
            <CloudUploadOutlined style={{ fontSize: 18, color: theme.palette.primary.main }} />
            <Typography variant="h5">Launch & Dispatch Optimization Jobs</Typography>
          </Stack>
        }
      >
        <Grid container spacing={2.5} alignItems="center" sx={{ width: '100%' }}>
          {/* File ZIP Upload drop area */}
          <Grid size={{ xs: 12, md: 6 }}>
            <input
              type="file"
              accept=".zip"
              ref={fileInputRef}
              onChange={handleZipUpload}
              style={{ display: 'none' }}
            />
            <Paper
              variant="outlined"
              onClick={() => fileInputRef.current?.click()}
              sx={{
                p: 2.5,
                border: '1.5px dashed',
                borderColor: uploadedZip ? 'primary.main' : 'divider',
                bgcolor: uploadedZip
                  ? isDark
                    ? 'rgba(24, 144, 255, 0.08)'
                    : '#e6f7ff'
                  : isDark
                  ? alpha(theme.palette.common.white, 0.02)
                  : 'grey.50',
                borderRadius: 1.5,
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                  borderColor: 'primary.main',
                  bgcolor: isDark ? 'rgba(24, 144, 255, 0.12)' : '#f0f5ff'
                }
              }}
            >
              <Stack direction="row" spacing={2} alignItems="center" justifyContent="center">
                <Avatar
                  sx={{
                    bgcolor: uploadedZip ? 'primary.main' : isDark ? 'rgba(255, 255, 255, 0.1)' : 'grey.200',
                    color: uploadedZip ? '#fff' : 'text.primary',
                    width: 44,
                    height: 44
                  }}
                >
                  <FileZipOutlined style={{ fontSize: 22 }} />
                </Avatar>
                <Box sx={{ textAlign: 'left' }}>
                  <Typography variant="subtitle1" fontWeight={700}>
                    {uploadedZip ? uploadedZip.name : 'Click or drop INI configuration ZIP file'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {uploadedZip
                      ? `Size: ${uploadedZip.size} • Ready for queue dispatch`
                      : 'Supports .zip files generated from INI Config Generator tab'}
                  </Typography>
                </Box>
              </Stack>
            </Paper>
          </Grid>

          {/* Session Selector, OptimiRun input & Launch Button */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Stack spacing={1.5}>
              {/* Row 1: Session Selector & + New Session */}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} alignItems={{ xs: 'stretch', sm: 'center' }}>
                <FormControl size="small" fullWidth sx={{ flex: 1 }}>
                  <InputLabel
                    shrink
                    id="session-select-label"
                    sx={{
                      color: isDark ? 'grey.300' : 'text.secondary',
                      '&.Mui-focused': { color: 'primary.main' },
                      bgcolor: isDark ? 'background.paper' : '#ffffff',
                      px: 0.5
                    }}
                  >
                    Optimization Session
                  </InputLabel>
                  <Select
                    labelId="session-select-label"
                    id="session-select"
                    value={selectedSessionId}
                    label="Optimization Session"
                    notched
                    onChange={(e) => {
                      const sessionId = e.target.value;
                      const session = sessions.find((item) => item.id === sessionId);
                      setSelectedSessionId(sessionId);
                      setJobPage(0);
                      setOptimizationJobsPage(0);
                      setBacktestJobsPage(0);
                      localStorage.setItem('mt5_active_session_id', sessionId);
                      window.dispatchEvent(new CustomEvent('mt5:session-change', { detail: { sessionId, session } }));
                    }}
                    renderValue={(selected) => {
                      const session = sessions.find((item) => item.id === selected);
                      if (!session) {
                        return (
                          <Typography variant="body2" color="text.secondary">
                            Select an optimization session...
                          </Typography>
                        );
                      }
                      return (
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, overflow: 'hidden' }}>
                          <FolderOpenOutlined style={{ color: theme.palette.primary.main, fontSize: 15, flexShrink: 0 }} />
                          <Typography variant="body2" fontWeight={600} noWrap sx={{ flex: 1 }}>
                            {session.name || session.displayId}
                          </Typography>
                          <Chip
                            label={session.status}
                            size="small"
                            variant="outlined"
                            color={session.status === 'ACTIVE' ? 'success' : 'default'}
                            sx={{ height: 18, fontSize: '0.62rem', fontWeight: 700, ml: 'auto', flexShrink: 0 }}
                          />
                        </Stack>
                      );
                    }}
                    sx={{ borderRadius: 1.25 }}
                  >
                    {sessions.map((ses) => (
                      <MenuItem key={ses.id} value={ses.id}>
                        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ width: '100%' }}>
                          <Stack direction="row" spacing={1} alignItems="flex-start">
                            <FolderOpenOutlined style={{ color: theme.palette.primary.main, fontSize: 16 }} />
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="body2" fontWeight={600}>
                                {ses.name || ses.displayId}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                                Created: {ses.createdAt || '-'} • User: {ses.ownerUsername}
                              </Typography>
                            </Box>
                          </Stack>
                          <Chip
                            label={ses.status}
                            size="small"
                            variant="outlined"
                            color={ses.status === 'ACTIVE' ? 'success' : 'default'}
                            sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }}
                          />
                        </Stack>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Button
                  variant="outlined"
                  color="primary"
                  size="small"
                  startIcon={<PlusOutlined />}
                  onClick={() => setCreateSessionOpen(true)}
                  sx={{
                    height: 40,
                    textTransform: 'none',
                    fontWeight: 600,
                    borderRadius: 1.25,
                    whiteSpace: 'nowrap',
                    px: 1.75
                  }}
                >
                  New Session
                </Button>
              </Stack>

              {/* Row 2: OptimiRun cycles & Launch Button */}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} alignItems={{ xs: 'stretch', sm: 'center' }}>
                <FormControl size="small" sx={{ minWidth: 150, width: { xs: '100%', sm: 160 } }}>
                  <InputLabel shrink htmlFor="optimi-run-input" sx={{ color: isDark ? 'grey.300' : 'text.secondary', '&.Mui-focused': { color: 'primary.main' } }}>
                    OptimiRun Cycles
                  </InputLabel>
                  <OutlinedInput
                    id="optimi-run-input"
                    type="number"
                    size="small"
                    notched
                    label="OptimiRun Cycles"
                    value={optimiRunCount}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '') {
                        setOptimiRunCount('');
                      } else {
                        const num = parseInt(val, 10);
                        setOptimiRunCount(isNaN(num) ? 1 : Math.max(1, num));
                      }
                    }}
                    onBlur={() => {
                      if (!optimiRunCount || Number(optimiRunCount) < 1) {
                        setOptimiRunCount(1);
                      }
                    }}
                    inputProps={{ min: 1, max: 999, step: 1 }}
                    endAdornment={
                      <InputAdornment position="end">
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                          cycles
                        </Typography>
                      </InputAdornment>
                    }
                    sx={{ borderRadius: 1.25 }}
                  />
                </FormControl>

                <Button
                  variant="contained"
                  color="primary"
                  size="medium"
                  disabled={!uploadedZip}
                  startIcon={<RocketOutlined />}
                  onClick={handleLaunchOptimization}
                  sx={{
                    flex: 1,
                    height: 40,
                    textTransform: 'none',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    borderRadius: 1.25,
                    boxShadow: '0 4px 12px rgba(24, 144, 255, 0.25)'
                  }}
                >
                  Launch Optimization ({optimiRunCount || 1}x Runs)
                </Button>
              </Stack>
            </Stack>
          </Grid>
        </Grid>

        {uploadMessage && (
          <Box sx={{ mt: 2 }}>
            <Alert
              severity={uploadMessage.type}
              onClose={() => setUploadMessage(null)}
              sx={{ borderRadius: 1.25 }}
            >
              {uploadMessage.text}
            </Alert>
          </Box>
        )}
      </MainCard>

      {/* ── 3. BLOCK FILTER WITH APPLY BUTTON, MODE SELECTOR & VIEW MODE TOGGLE ── */}
      <MainCard contentSX={{ p: 2 }}>
        <Stack spacing={2}>
          <Grid container spacing={1.75} alignItems="center" sx={{ width: '100%' }}>
            {/* Search */}
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <OutlinedInput
                fullWidth
                size="small"
                value={inputFilters.search}
                onChange={(e) => handleInputChange('search', e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleApplyFilters();
                }}
                placeholder="Search Job name, Strategy, Worker..."
                startAdornment={
                  <InputAdornment position="start">
                    <SearchOutlined style={{ color: theme.palette.text.secondary }} />
                  </InputAdornment>
                }
                sx={{ borderRadius: 1.25 }}
              />
            </Grid>

            {/* Status Filter */}
            <Grid size={{ xs: 6, sm: 3, md: 1.5 }}>
              <FormControl fullWidth size="small">
                <InputLabel id="status-filter-label" sx={{ color: isDark ? 'grey.300' : 'text.secondary', '&.Mui-focused': { color: 'primary.main' } }}>
                  Status
                </InputLabel>
                <Select
                  labelId="status-filter-label"
                  value={inputFilters.status}
                  label="Status"
                  onChange={(e) => handleInputChange('status', e.target.value)}
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <MenuItem key={opt} value={opt}>
                      {opt === 'ALL' ? 'All Statuses' : opt}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Mode Filter (Open prices only / Every tick) */}
            <Grid size={{ xs: 6, sm: 3, md: 1.75 }}>
              <FormControl fullWidth size="small">
                <InputLabel id="mode-filter-label" sx={{ color: isDark ? 'grey.300' : 'text.secondary', '&.Mui-focused': { color: 'primary.main' } }}>
                  Mode
                </InputLabel>
                <Select
                  labelId="mode-filter-label"
                  value={inputFilters.mode}
                  label="Mode"
                  onChange={(e) => handleInputChange('mode', e.target.value)}
                >
                  {MODE_OPTIONS.map((opt) => (
                    <MenuItem key={opt} value={opt}>
                      {opt === 'ALL' ? 'All Modes' : opt}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Symbol Filter */}
            <Grid size={{ xs: 6, sm: 3, md: 1.5 }}>
              <FormControl fullWidth size="small">
                <InputLabel id="symbol-filter-label" sx={{ color: isDark ? 'grey.300' : 'text.secondary', '&.Mui-focused': { color: 'primary.main' } }}>
                  Symbol
                </InputLabel>
                <Select
                  labelId="symbol-filter-label"
                  value={inputFilters.symbol}
                  label="Symbol"
                  onChange={(e) => handleInputChange('symbol', e.target.value)}
                >
                  {SYMBOL_OPTIONS.map((sym) => (
                    <MenuItem key={sym} value={sym}>
                      {sym === 'ALL' ? 'All Symbols' : sym}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Job Type Filter */}
            <Grid size={{ xs: 6, sm: 3, md: 1.5 }}>
              <FormControl fullWidth size="small">
                <InputLabel id="jobtype-filter-label" sx={{ color: isDark ? 'grey.300' : 'text.secondary', '&.Mui-focused': { color: 'primary.main' } }}>
                  Job Type
                </InputLabel>
                <Select
                  labelId="jobtype-filter-label"
                  value={inputFilters.jobType}
                  label="Job Type"
                  onChange={(e) => handleInputChange('jobType', e.target.value)}
                >
                  {JOB_TYPES.map((type) => (
                    <MenuItem key={type.value} value={type.value}>
                      {type.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Worker Filter */}
            <Grid size={{ xs: 6, sm: 3, md: 1.5 }}>
              <FormControl fullWidth size="small">
                <InputLabel id="worker-filter-label" sx={{ color: isDark ? 'grey.300' : 'text.secondary', '&.Mui-focused': { color: 'primary.main' } }}>
                  Workers
                </InputLabel>
                <Select
                  labelId="worker-filter-label"
                  value={inputFilters.worker}
                  label="Workers"
                  onChange={(e) => handleInputChange('worker', e.target.value)}
                >
                  <MenuItem value="ALL">All Workers</MenuItem>
                  {jobFilterOptions.workers.map((worker) => (
                    <MenuItem key={worker} value={worker}>{worker}</MenuItem>
                  ))}
                  {jobFilterOptions.hasUnassigned && <MenuItem value="Unassigned">Unassigned</MenuItem>}
                </Select>
              </FormControl>
            </Grid>

          </Grid>

          {/* Action Row: Apply & Reset Buttons + View Mode Switcher */}
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'stretch', sm: 'center' }}
            spacing={1.5}
            sx={{ pt: 0.5, borderTop: '1px solid', borderColor: 'divider' }}
          >
            {/* Filter Apply & Reset */}
            <Stack direction="row" spacing={1} alignItems="center">
              <Button
                variant="contained"
                color="primary"
                size="small"
                startIcon={<FilterOutlined />}
                onClick={handleApplyFilters}
                sx={{
                  textTransform: 'none',
                  fontWeight: 700,
                  px: 2,
                  borderRadius: 1.25
                }}
              >
                Apply Filters
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<ClearOutlined />}
                onClick={handleResetFilters}
                sx={{
                  textTransform: 'none',
                  fontWeight: 600,
                  px: 1.75,
                  borderRadius: 1.25,
                  bgcolor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'grey.100',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.35)' : 'grey.300',
                  color: isDark ? '#ffffff' : 'text.primary',
                  '&:hover': {
                    borderColor: isDark ? '#ffffff' : 'primary.main',
                    bgcolor: isDark ? 'rgba(255, 255, 255, 0.16)' : 'grey.200',
                    color: isDark ? '#ffffff' : 'primary.main'
                  }
                }}
              >
                Reset
              </Button>
            </Stack>

            {/* Layout View Mode Toggle (Combined Single Table vs Split 2-Table View) */}
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={{ xs: 0.5, sm: 1 }}
              alignItems={{ xs: 'stretch', sm: 'center' }}
              justifyContent={{ xs: 'flex-start', sm: 'flex-end' }}
              sx={{ width: { xs: '100%', sm: 'auto' } }}
            >
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                View Layout:
              </Typography>
              <ToggleButtonGroup
                size="small"
                value={viewMode}
                exclusive
                onChange={(_, nextView) => {
                  if (nextView !== null) {
                    setViewMode(nextView);
                    setJobPage(0);
                    setOptimizationJobsPage(0);
                    setBacktestJobsPage(0);
                  }
                }}
                aria-label="queue view mode"
                sx={{
                  width: { xs: '100%', sm: 'auto' },
                  minHeight: 32,
                  '& .MuiToggleButton-root': {
                    flex: { xs: 1, sm: '0 0 auto' },
                    minWidth: 0,
                    px: { xs: 1, sm: 1.5 },
                    py: 0.5,
                    fontSize: { xs: '0.7rem', sm: '0.75rem' },
                    lineHeight: 1.25,
                    whiteSpace: 'nowrap',
                    textTransform: 'none',
                    fontWeight: 600,
                    borderRadius: 1
                  }
                }}
              >
                <ToggleButton value="combined" aria-label="combined single table">
                  <TableOutlined style={{ marginRight: 6 }} /> Single Table
                </ToggleButton>
                <ToggleButton value="split" aria-label="split 2 tables">
                  <AppstoreOutlined style={{ marginRight: 6 }} /> Split by Mode
                  <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>&nbsp;(2 Tables)</Box>
                </ToggleButton>
              </ToggleButtonGroup>
            </Stack>
          </Stack>
        </Stack>
      </MainCard>

      {/* ── 4. TABLES: SINGLE COMBINED VIEW OR SPLIT 2-TABLE VIEW ── */}
      {viewMode === 'combined' ? (
        <JobDataTable
          title={`Jobs Queue Process (${jobTotal})`}
          subtitle="Real-time tracking of active optimizations and queued tasks across cluster workers"
          icon={<FilterOutlined style={{ color: theme.palette.primary.main }} />}
          jobs={filteredJobs}
          selectedJobIds={selectedJobIds}
          onToggleSelect={handleToggleSelect}
          onSelectAll={handleSelectAll}
          onSelectAllPages={() => handleSelectAllPages()}
          onBulkDelete={handleBulkDelete}
          onBulkCancel={handleBulkCancel}
          onBulkRerun={handleOpenBulkRerun}
          onClearSelection={handleClearSelection}
          onViewDetails={handleOpenJobDetails}
          onRerun={handleOpenRerun}
          onCancel={handleCancelJob}
          onDelete={handleDeleteJob}
          onCopyId={handleCopyId}
          copiedId={copiedId}
          isDark={isDark}
          totalCount={jobTotal}
          controlledPage={jobPage}
          controlledRowsPerPage={jobRowsPerPage}
          onServerPageChange={setJobPage}
          onServerRowsPerPageChange={(size) => { setJobRowsPerPage(size); setJobPage(0); }}
        />
      ) : (
        <Stack spacing={2.5}>
          {/* Table 1: Open prices only (Optimization Jobs) */}
          <JobDataTable
            title="Optimization Queues"
            badgeText={`${optimizationJobsTotal} Jobs`}
            subtitle="Fast parameter search and genetic algorithm runs"
            icon={<ThunderboltOutlined style={{ color: '#13c2c2', fontSize: 18 }} />}
            jobs={optimizationJobs}
            selectedJobIds={optimizationSelectedJobIds}
            onToggleSelect={handleToggleSelect}
            onSelectAll={handleSelectAll}
            onSelectAllPages={() => handleSelectAllPages('OPEN_PRICE')}
            onBulkDelete={handleBulkDelete}
            onBulkCancel={handleBulkCancel}
            onBulkRerun={handleOpenBulkRerun}
            onClearSelection={handleClearSelection}
            onViewDetails={handleOpenJobDetails}
            onRerun={handleOpenRerun}
            onCancel={handleCancelJob}
            onDelete={handleDeleteJob}
            onCopyId={handleCopyId}
            copiedId={copiedId}
            isDark={isDark}
            totalCount={optimizationJobsTotal}
            controlledPage={optimizationJobsPage}
            controlledRowsPerPage={jobRowsPerPage}
            onServerPageChange={setOptimizationJobsPage}
            onServerRowsPerPageChange={(size) => { setJobRowsPerPage(size); setOptimizationJobsPage(0); setBacktestJobsPage(0); }}
          />

          {/* Table 2: Every tick (Backtest & Verification Jobs) */}
          <JobDataTable
            title="Backtest Queues"
            badgeText={`${backtestJobsTotal} Jobs`}
            subtitle="High-precision tick-by-tick simulation and forward validation"
            icon={<AimOutlined style={{ color: '#722ed1', fontSize: 18 }} />}
            jobs={backtestJobs}
            selectedJobIds={backtestSelectedJobIds}
            onToggleSelect={handleToggleSelect}
            onSelectAll={handleSelectAll}
            onSelectAllPages={() => handleSelectAllPages('EVERY_TICK')}
            onBulkDelete={handleBulkDelete}
            onBulkCancel={handleBulkCancel}
            onBulkRerun={handleOpenBulkRerun}
            onClearSelection={handleClearSelection}
            onViewDetails={handleOpenJobDetails}
            onRerun={handleOpenRerun}
            onCancel={handleCancelJob}
            onDelete={handleDeleteJob}
            onCopyId={handleCopyId}
            copiedId={copiedId}
            isDark={isDark}
            totalCount={backtestJobsTotal}
            controlledPage={backtestJobsPage}
            controlledRowsPerPage={jobRowsPerPage}
            onServerPageChange={setBacktestJobsPage}
            onServerRowsPerPageChange={(size) => { setJobRowsPerPage(size); setOptimizationJobsPage(0); setBacktestJobsPage(0); }}
          />
        </Stack>
      )}

      <Dialog
        open={Boolean(rerunJob)}
        onClose={() => { if (!rerunBusy) setRerunJob(null); }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{rerunJob?.isBulk ? 'Rerun Selected Jobs' : 'Rerun Job'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            {rerunJob?.isBulk && (
              <Alert severity={rerunJob.selectedCount > rerunJob.jobIds.length ? 'warning' : 'info'}>
                Applying to {rerunJob.jobIds.length} of {rerunJob.selectedCount} selected job(s).
                {rerunJob.selectedCount > rerunJob.jobIds.length
                  ? ' Active or pending jobs are excluded because they cannot be rerun.'
                  : ''}
              </Alert>
            )}
            <Typography variant="body2" color="text.secondary">
              {rerunJob?.isBulk
                ? 'Each eligible job will return to the queue with the selected number of runs.'
                : rerunJob?.jobType === 'EVERY_TICK'
                ? 'This Every Tick job returns to the queue after each run until all requested runs finish.'
                : 'The worker runs this same optimization job for all requested cycles in one execution.'}
            </Typography>
            <FormControl fullWidth>
              <InputLabel htmlFor="rerun-count">Number of runs</InputLabel>
              <OutlinedInput
                id="rerun-count"
                type="number"
                label="Number of runs"
                value={rerunCount}
                inputProps={{ min: 1, max: 20, step: 1 }}
                onFocus={(event) => event.target.select()}
                onChange={(event) => setRerunCount(event.target.value)}
                error={Number(rerunCount) < 1 || Number(rerunCount) > 20 || !Number.isInteger(Number(rerunCount))}
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75 }}>
                Allowed range: 1–20 runs
              </Typography>
            </FormControl>
            {rerunJob?.isBulk && (
              <Typography variant="body2" fontWeight={700} color="primary.main">
                Total executions: {rerunJob.jobIds.length * (Number(rerunCount) || 0)}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRerunJob(null)} disabled={rerunBusy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleConfirmRerun}
            disabled={rerunBusy || Number(rerunCount) < 1 || Number(rerunCount) > 20 || !Number.isInteger(Number(rerunCount))}
          >
            {rerunJob?.isBulk
              ? `Rerun ${rerunJob.jobIds.length} Job(s) x ${Number(rerunCount) || 0}`
              : `Rerun ${Number(rerunCount) || 0}x`}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(bulkAction)}
        onClose={() => { if (!bulkActionBusy) setBulkAction(null); }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          {bulkAction?.type === 'delete' ? 'Delete selected jobs?' : 'Cancel selected jobs?'}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {bulkAction?.type === 'delete'
              ? `Permanently delete ${bulkAction?.jobIds.length || 0} selected job(s)? Running jobs cannot be deleted.`
              : `Move ${bulkAction?.jobIds.length || 0} selected job(s) to CANCELLED? The jobs will remain in history.`}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkAction(null)} disabled={bulkActionBusy}>
            Keep Jobs
          </Button>
          <Button variant="contained" color="error" onClick={handleConfirmBulkAction} disabled={bulkActionBusy}>
            {bulkAction?.type === 'delete' ? 'Delete Jobs' : 'Cancel Jobs'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── 5. CREATE NEW SESSION DIALOG ── */}
      <Dialog
        open={createSessionOpen}
        onClose={() => setCreateSessionOpen(false)}
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
          <FolderOpenOutlined style={{ fontSize: 20, color: theme.palette.primary.main }} />
          <Typography variant="h5" fontWeight={700}>
            Create Optimization Session
          </Typography>
        </DialogTitle>

        <DialogContent dividers sx={{ borderColor: 'divider', px: 3, py: 3, '&.MuiDialogContent-root': { pt: 3, pb: 3 } }}>
          <Stack spacing={2.5}>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.75, fontWeight: 600 }}>
                Session Name <span style={{ color: 'red' }}>*</span>
              </Typography>
              <OutlinedInput
                fullWidth
                size="small"
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                placeholder="e.g. SES-20260917-LOTUS-M15"
                sx={{
                  borderRadius: 1.25,
                  '& .MuiOutlinedInput-input': {
                    py: 1,
                    px: 1.5,
                    fontSize: '0.875rem',
                    lineHeight: 'normal',
                    '&::placeholder': {
                      opacity: 0.65,
                      lineHeight: 'normal'
                    }
                  }
                }}
                autoFocus
              />
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.75, fontWeight: 600 }}>
                Description / Notes
              </Typography>
              <OutlinedInput
                fullWidth
                size="small"
                multiline
                rows={3}
                value={newSessionDesc}
                onChange={(e) => setNewSessionDesc(e.target.value)}
                placeholder="Optimization purpose, parameter ranges, or target EA settings..."
                sx={{
                  borderRadius: 1.25,
                  '& .MuiOutlinedInput-input': {
                    fontSize: '0.875rem',
                    lineHeight: 1.4,
                    '&::placeholder': {
                      opacity: 0.65
                    }
                  }
                }}
              />
            </Box>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 1.5 }}>
          <Button
            variant="outlined"
            size="small"
            onClick={() => {
              setCreateSessionOpen(false);
              setNewSessionName('');
              setNewSessionDesc('');
            }}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 1.25
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            size="small"
            disabled={!newSessionName.trim()}
            onClick={handleCreateSession}
            startIcon={<PlusOutlined />}
            sx={{
              textTransform: 'none',
              fontWeight: 700,
              borderRadius: 1.25,
              px: 2
            }}
          >
            Create Session
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── 6. JOB DETAILS & LOGS DIALOG ── */}
      <Dialog
        open={logsOpen}
        onClose={() => setLogsOpen(false)}
        maxWidth="md"
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
        {selectedJob && (
          <>
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <CodeOutlined style={{ fontSize: 20, color: theme.palette.primary.main }} />
                <Box>
                  <Typography variant="h5" fontWeight={700}>
                    {selectedJob.jobName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {selectedJob.displayId} • Created at {selectedJob.createdAt}
                  </Typography>
                </Box>
              </Stack>
              <StatusChip label={selectedJob.status} type={selectedJob.status} />
            </DialogTitle>

            <DialogContent dividers sx={{ borderColor: 'divider' }}>
              <Grid container spacing={2} sx={{ mb: 2.5, width: '100%' }}>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <Typography variant="caption" color="text.secondary">Session</Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {(() => {
                      const session = sessions.find((item) => item.id === selectedJob.sessionId);
                      return session ? session.name || session.displayId : selectedJob.sessionName || 'Default';
                    })()}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <Typography variant="caption" color="text.secondary">Strategy / EA</Typography>
                  <Typography variant="body2" fontWeight={600}>{selectedJob.strategy}</Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <Typography variant="caption" color="text.secondary">Symbol & TF</Typography>
                  <Typography variant="body2" fontWeight={600}>{selectedJob.symbol} ({selectedJob.timeframe})</Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <Typography variant="caption" color="text.secondary">Mode / Type</Typography>
                  <Typography variant="body2" fontWeight={600}>{selectedJob.mode}</Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <Typography variant="caption" color="text.secondary">Assigned Worker</Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {selectedJob.worker}{selectedJob.workerIp && selectedJob.workerIp !== '-' ? ` (${selectedJob.workerIp})` : ''}
                  </Typography>
                </Grid>
                {selectedJob.jobType !== 'EVERY_TICK' && (
                <Grid size={{ xs: 6, sm: 4 }}>
                  <Typography variant="caption" color="text.secondary">Total Parameter Sets</Typography>
                  <Typography
                    variant="body2"
                    fontWeight={600}
                    sx={{
                      color:
                        selectedJob.status === 'COMPLETED' && selectedJob.storedSets > 0
                          ? 'success.main'
                          : selectedJob.status === 'RUNNING'
                          ? 'primary.main'
                          : 'text.secondary'
                    }}
                  >
                    {selectedJob.status === 'COMPLETED'
                      ? selectedJob.storedSets != null
                        ? typeof selectedJob.storedSets === 'number'
                          ? selectedJob.storedSets.toLocaleString()
                          : selectedJob.storedSets
                        : '0'
                      : selectedJob.status === 'RUNNING'
                      ? 'Executing...'
                      : '—'}
                  </Typography>
                </Grid>
                )}
              </Grid>

              {selectedJob.error && (
                <Alert severity="error" sx={{ mb: 2, borderRadius: 1.25 }}>
                  <Typography variant="subtitle2" fontWeight={700}>Tester Execution Error:</Typography>
                  <Typography variant="body2">{selectedJob.error}</Typography>
                </Alert>
              )}

              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                Live Execution Logs & Terminal Output:
              </Typography>
              <Paper
                variant="outlined"
                sx={{
                  bgcolor: isDark ? '#0d1117' : '#1e1e1e',
                  color: '#58a6ff',
                  fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                  p: 2,
                  borderRadius: 1.5,
                  maxHeight: 280,
                  overflowY: 'auto'
                }}
              >
                {selectedJob.logs && selectedJob.logs.length > 0 ? (
                  selectedJob.logs.map((line, idx) => (
                    <Typography
                      key={idx}
                      variant="caption"
                      sx={{
                        display: 'block',
                        fontFamily: 'inherit',
                        color: line.includes('[ERROR]') ? '#ff7b72' : '#c9d1d9',
                        mb: 0.5
                      }}
                    >
                      {line}
                    </Typography>
                  ))
                ) : (
                  <Typography variant="caption" sx={{ color: '#8b949e', fontStyle: 'italic' }}>
                    No log entries recorded for this job.
                  </Typography>
                )}
              </Paper>
            </DialogContent>

            <DialogActions sx={{ px: 3, py: 1.5 }}>
              <Button
                variant="outlined"
                size="small"
                onClick={() => setLogsOpen(false)}
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
                Close
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Stack>
  );
}
