import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';

// material-ui
import { useTheme, alpha } from '@mui/material/styles';
import Box from '@mui/material/Box';
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
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import OutlinedInput from '@mui/material/OutlinedInput';
import Switch from '@mui/material/Switch';

import Card from '@mui/material/Card';

// project imports
import MainCard from 'components/MainCard';
import { deleteMt5Worker, listMt5Workers, updateMt5Worker } from 'api/mt5Optimization';

// assets - icons
import ReloadOutlined from '@ant-design/icons/ReloadOutlined';
import SearchOutlined from '@ant-design/icons/SearchOutlined';
import ClearOutlined from '@ant-design/icons/ClearOutlined';
import CheckCircleOutlined from '@ant-design/icons/CheckCircleOutlined';
import CloudServerOutlined from '@ant-design/icons/CloudServerOutlined';
import SafetyCertificateOutlined from '@ant-design/icons/SafetyCertificateOutlined';
import ThunderboltOutlined from '@ant-design/icons/ThunderboltOutlined';
import FilterOutlined from '@ant-design/icons/FilterOutlined';

// ==============================|| MOCK WORKERS DATA ||============================== //

const mapWorker = (worker) => {
  const types = worker.allowed_job_types || [];
  return {
    id: worker.id, workerName: worker.worker_name, userId: String(worker.owner_user_id), username: worker.username || String(worker.owner_user_id),
    apiKey: worker.api_key || '-', workerStatus: worker.status.charAt(0) + worker.status.slice(1).toLowerCase(),
    dispatchEnabled: worker.run_access, isPublic: worker.is_public,
    jobType: types.length > 1 ? 'ALL' : types[0] === 'EVERY_TICK' ? 'BACKTEST' : 'OPTIMIZE',
    activity: worker.status === 'BUSY' ? 'Busy' : 'Idle', currentJob: worker.current_job_id || '?',
    jobsClaimed: worker.jobs_claimed || 0, lastSeen: worker.last_seen_at ? new Date(worker.last_seen_at).toLocaleString() : '-'
  };
};

// ==============================|| STATUS CHIP COMPONENT ||============================== //

function StatusChip({ label, type }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  let style = {
    bgcolor: isDark ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.12)',
    color: isDark ? '#94a3b8' : '#475569',
    border: isDark ? '1px solid rgba(148, 163, 184, 0.3)' : '1px solid rgba(148, 163, 184, 0.2)'
  };

  const normalized = String(type || '').toLowerCase();

  if (normalized === 'success' || normalized === 'online' || normalized === 'allowed' || normalized === 'idle') {
    style = {
      bgcolor: isDark ? 'rgba(82, 196, 26, 0.15)' : 'rgba(82, 196, 26, 0.12)',
      color: isDark ? '#52c41a' : '#2e7d32',
      border: isDark ? '1px solid rgba(82, 196, 26, 0.35)' : '1px solid rgba(82, 196, 26, 0.25)'
    };
  } else if (normalized === 'warning' || normalized === 'draining' || normalized === 'busy') {
    style = {
      bgcolor: isDark ? 'rgba(250, 173, 20, 0.15)' : 'rgba(250, 173, 20, 0.12)',
      color: isDark ? '#faad14' : '#d48806',
      border: isDark ? '1px solid rgba(250, 173, 20, 0.35)' : '1px solid rgba(250, 173, 20, 0.25)'
    };
  } else if (normalized === 'error' || normalized === 'blocked' || normalized === 'offline') {
    style = {
      bgcolor: isDark ? 'rgba(255, 77, 79, 0.15)' : 'rgba(255, 77, 79, 0.12)',
      color: isDark ? '#ff4d4f' : '#cf1322',
      border: isDark ? '1px solid rgba(255, 77, 79, 0.35)' : '1px solid rgba(255, 77, 79, 0.25)'
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
  label: PropTypes.string.isRequired,
  type: PropTypes.string.isRequired
};

// ==============================|| JOB TYPE SELECTOR COMPONENT ||============================== //

function JobTypeSelector({ value, onChange }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const getColorConfig = (type) => {
    switch (type) {
      case 'OPTIMIZE':
        return {
          color: isDark ? '#13c2c2' : '#08979c',
          bg: isDark ? 'rgba(19, 194, 194, 0.16)' : 'rgba(19, 194, 194, 0.1)',
          border: isDark ? 'rgba(19, 194, 194, 0.45)' : 'rgba(19, 194, 194, 0.3)'
        };
      case 'BACKTEST':
        return {
          color: isDark ? '#69b1ff' : '#0958d9',
          bg: isDark ? 'rgba(24, 144, 255, 0.16)' : 'rgba(24, 144, 255, 0.1)',
          border: isDark ? 'rgba(24, 144, 255, 0.45)' : 'rgba(24, 144, 255, 0.3)'
        };
      case 'ALL':
      default:
        return {
          color: isDark ? '#d3adf7' : '#722ed1',
          bg: isDark ? 'rgba(114, 46, 209, 0.18)' : 'rgba(114, 46, 209, 0.1)',
          border: isDark ? 'rgba(179, 127, 235, 0.45)' : 'rgba(114, 46, 209, 0.3)'
        };
    }
  };

  const current = getColorConfig(value);

  return (
    <Select
      size="small"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      sx={{
        height: 26,
        minWidth: 104,
        fontSize: '0.7rem',
        fontWeight: 700,
        color: current.color,
        bgcolor: current.bg,
        borderRadius: 1,
        '& .MuiOutlinedInput-notchedOutline': {
          borderColor: current.border
        },
        '&:hover .MuiOutlinedInput-notchedOutline': {
          borderColor: current.color
        },
        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
          borderColor: current.color
        },
        '& .MuiSelect-select': {
          py: '2px !important',
          px: '8px !important',
          pr: '22px !important',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: '22px'
        },
        '& .MuiSvgIcon-root': {
          color: current.color,
          fontSize: '0.95rem',
          right: 3
        }
      }}
      MenuProps={{
        PaperProps: {
          sx: {
            bgcolor: isDark ? '#1e2632' : '#ffffff',
            backgroundImage: 'none',
            border: '1px solid',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'divider',
            borderRadius: 1.5,
            boxShadow: isDark ? '0 10px 25px rgba(0,0,0,0.5)' : theme.customShadows?.z1,
            py: 0.5
          }
        }
      }}
    >
      <MenuItem
        value="ALL"
        sx={{
          fontSize: '0.725rem',
          fontWeight: 700,
          color: isDark ? '#d3adf7' : '#722ed1',
          py: 0.75,
          px: 1.5,
          '&:hover': {
            bgcolor: isDark ? 'rgba(114, 46, 209, 0.22)' : 'rgba(114, 46, 209, 0.08)'
          },
          '&.Mui-selected': {
            bgcolor: isDark ? 'rgba(114, 46, 209, 0.32) !important' : 'rgba(114, 46, 209, 0.15) !important'
          }
        }}
      >
        ALL
      </MenuItem>
      <MenuItem
        value="OPTIMIZE"
        sx={{
          fontSize: '0.725rem',
          fontWeight: 700,
          color: isDark ? '#13c2c2' : '#08979c',
          py: 0.75,
          px: 1.5,
          '&:hover': {
            bgcolor: isDark ? 'rgba(19, 194, 194, 0.22)' : 'rgba(19, 194, 194, 0.08)'
          },
          '&.Mui-selected': {
            bgcolor: isDark ? 'rgba(19, 194, 194, 0.32) !important' : 'rgba(19, 194, 194, 0.15) !important'
          }
        }}
      >
        OPTIMIZE
      </MenuItem>
      <MenuItem
        value="BACKTEST"
        sx={{
          fontSize: '0.725rem',
          fontWeight: 700,
          color: isDark ? '#69b1ff' : '#0958d9',
          py: 0.75,
          px: 1.5,
          '&:hover': {
            bgcolor: isDark ? 'rgba(24, 144, 255, 0.22)' : 'rgba(24, 144, 255, 0.08)'
          },
          '&.Mui-selected': {
            bgcolor: isDark ? 'rgba(24, 144, 255, 0.32) !important' : 'rgba(24, 144, 255, 0.15) !important'
          }
        }}
      >
        BACKTEST
      </MenuItem>
    </Select>
  );
}

JobTypeSelector.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired
};

// ==============================|| SETUP WORKERS TAB ||============================== //

export default function SetupWorkersTab() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const currentUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      return {};
    }
  }, []);
  const isAdmin = useMemo(() => {
    const role = String(currentUser?.role || '').toLowerCase();
    const roles = Array.isArray(currentUser?.roles) ? currentUser.roles.map((item) => String(item).toLowerCase()) : [];
    return role === 'admin' || roles.some((item) => item.includes('admin'));
  }, [currentUser]);

  const [workers, setWorkers] = useState([]);
  const loadWorkers = async () => setWorkers((await listMt5Workers()).map(mapWorker));

  useEffect(() => {
    let active = true;
    let loading = false;
    const refreshWorkers = async () => {
      if (loading) return;
      loading = true;
      try {
        const rows = (await listMt5Workers()).map(mapWorker);
        if (active) setWorkers(rows);
      } finally {
        loading = false;
      }
    };
    refreshWorkers().catch(() => {
      if (active) setWorkers([]);
    });
    const timer = window.setInterval(() => refreshWorkers().catch(() => {}), 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  // Input Filters State
  const [inputUsername, setInputUsername] = useState('all');
  const [inputWorkerStatus, setInputWorkerStatus] = useState('all');
  const [inputJobType, setInputJobType] = useState('all');
  const [inputSearchTerm, setInputSearchTerm] = useState('');

  // Applied Filters State
  const [appliedFilters, setAppliedFilters] = useState({
    username: 'all',
    workerStatus: 'all',
    jobType: 'all',
    searchTerm: ''
  });

  const [bulkAllowUser, setBulkAllowUser] = useState(() => String(currentUser?.id || ''));

  // Statistics Metrics for Top 4 KPI Cards
  const metrics = useMemo(() => {
    const total = workers.length;
    const online = workers.filter((w) => w.workerStatus.toLowerCase() === 'online').length;
    const offline = workers.filter((w) => w.workerStatus.toLowerCase() === 'offline').length;
    const allowed = workers.filter((w) => Boolean(w.dispatchEnabled)).length;
    const blocked = workers.filter((w) => !Boolean(w.dispatchEnabled)).length;
    const busy = workers.filter((w) => w.activity.toLowerCase() === 'busy').length;
    const idle = workers.filter((w) => w.activity.toLowerCase() === 'idle').length;

    return { total, online, offline, allowed, blocked, busy, idle };
  }, [workers]);

  // Dropdown options
  const usernames = useMemo(() => [...new Set(workers.map((worker) => worker.username))], [workers]);
  const workerOwners = useMemo(() => {
    const owners = new Map();
    workers.forEach((worker) => {
      if (!owners.has(worker.userId)) owners.set(worker.userId, worker.username);
    });
    return [...owners.entries()]
      .map(([userId, username]) => ({ userId, username }))
      .sort((a, b) => a.username.localeCompare(b.username));
  }, [workers]);
  const statusOptions = ['Online', 'Offline'];
  const jobTypeOptions = [
    { value: 'ALL', label: 'ALL', color: isDark ? '#d3adf7' : '#722ed1' },
    { value: 'OPTIMIZE', label: 'OPTIMIZE', color: isDark ? '#13c2c2' : '#08979c' },
    { value: 'BACKTEST', label: 'BACKTEST', color: isDark ? '#69b1ff' : '#0958d9' }
  ];

  // Handlers for Worker Actions
  const patchWorker = async (workerName, changes) => {
    const worker = workers.find((item) => item.workerName === workerName);
    if (!worker) return;
    await updateMt5Worker(worker.id, changes);
    await loadWorkers();
  };

  const handleToggleDispatch = (workerName) => {
    const worker = workers.find((item) => item.workerName === workerName);
    if (worker) patchWorker(workerName, { runAccess: !worker.dispatchEnabled });
  };

  const handleDeleteWorker = async (workerName) => {
    const worker = workers.find((item) => item.workerName === workerName);
    if (!worker) return;
    await deleteMt5Worker(worker.id);
    await loadWorkers();
  };
  const handleTogglePublic = (workerName, checked) => patchWorker(workerName, { isPublic: checked });
  const handleChangeJobType = (workerName, newType) => {
    const allowedJobTypes = newType === 'ALL' ? ['OPEN_PRICE', 'EVERY_TICK'] : newType === 'BACKTEST' ? ['EVERY_TICK'] : ['OPEN_PRICE'];
    patchWorker(workerName, { allowedJobTypes });
  };
  const handleAllowAllForUser = async () => {
    const targetWorkers = bulkAllowUser === 'ALL'
      ? workers
      : workers.filter((worker) => worker.userId === bulkAllowUser);
    await Promise.all(targetWorkers.map((worker) => updateMt5Worker(worker.id, { runAccess: true })));
    await loadWorkers();
  };

  useEffect(() => {
    if (isAdmin && bulkAllowUser === 'ALL') return;
    if (workerOwners.some((owner) => owner.userId === bulkAllowUser)) return;
    setBulkAllowUser(isAdmin ? 'ALL' : workerOwners[0]?.userId || String(currentUser?.id || ''));
  }, [bulkAllowUser, currentUser?.id, isAdmin, workerOwners]);

  // Filter Actions: Apply & Reset
  const handleApplyFilters = () => {
    setAppliedFilters({
      username: inputUsername,
      workerStatus: inputWorkerStatus,
      jobType: inputJobType,
      searchTerm: inputSearchTerm
    });
  };

  const handleResetFilters = () => {
    setInputUsername('all');
    setInputWorkerStatus('all');
    setInputJobType('all');
    setInputSearchTerm('');
    setAppliedFilters({
      username: 'all',
      workerStatus: 'all',
      jobType: 'all',
      searchTerm: ''
    });
  };

  // Filtered Workers
  const filteredWorkers = useMemo(() => {
    return workers.filter((worker) => {
      const matchUsername = appliedFilters.username === 'all' || worker.username === appliedFilters.username;
      const matchStatus = appliedFilters.workerStatus === 'all' || worker.workerStatus === appliedFilters.workerStatus;
      const matchJobType = appliedFilters.jobType === 'all' || worker.jobType === appliedFilters.jobType;
      const matchSearch =
        !appliedFilters.searchTerm.trim() ||
        worker.workerName.toLowerCase().includes(appliedFilters.searchTerm.toLowerCase()) ||
        worker.userId.toLowerCase().includes(appliedFilters.searchTerm.toLowerCase()) ||
        worker.currentJob.toLowerCase().includes(appliedFilters.searchTerm.toLowerCase());

      return matchUsername && matchStatus && matchJobType && matchSearch;
    });
  }, [workers, appliedFilters]);

  const isFiltered =
    appliedFilters.username !== 'all' ||
    appliedFilters.workerStatus !== 'all' ||
    appliedFilters.jobType !== 'all' ||
    appliedFilters.searchTerm !== '';

  const isDirty =
    inputUsername !== appliedFilters.username ||
    inputWorkerStatus !== appliedFilters.workerStatus ||
    inputJobType !== appliedFilters.jobType ||
    inputSearchTerm !== appliedFilters.searchTerm;

  // Common Table Styles
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
    zIndex: 10,
    borderBottom: '1px solid',
    borderColor: isDark ? 'divider' : 'grey.200'
  };

  const bodyCellSx = {
    py: 1,
    px: 1.5,
    fontSize: '0.78rem',
    whiteSpace: 'nowrap',
    borderColor: theme.palette.divider
  };

  // Form Control / Input Styles for Dark Mode
  const inputLabelSx = {
    color: isDark ? 'grey.300' : 'text.secondary',
    fontSize: '0.825rem',
    fontWeight: 500,
    '&.Mui-focused': {
      color: 'primary.main',
      fontWeight: 600
    },
    '&.MuiInputLabel-shrink': {
      color: isDark ? 'grey.200' : 'text.secondary',
      bgcolor: isDark ? '#1e1e1e' : 'background.paper',
      px: 0.6,
      borderRadius: 0.5
    }
  };

  const selectSx = {
    color: isDark ? 'grey.100' : 'text.primary',
    bgcolor: isDark ? alpha(theme.palette.common.white, 0.04) : 'grey.50',
    '& .MuiOutlinedInput-notchedOutline': {
      borderColor: isDark ? alpha(theme.palette.common.white, 0.2) : 'grey.300'
    },
    '&:hover .MuiOutlinedInput-notchedOutline': {
      borderColor: isDark ? alpha(theme.palette.common.white, 0.35) : 'grey.400'
    },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
      borderColor: 'primary.main'
    },
    '& .MuiSvgIcon-root': {
      color: isDark ? 'grey.300' : 'text.secondary'
    }
  };

  // KPI Summary Items matching Overview style
  const workerSummaryCards = [
    {
      label: 'TOTAL WORKERS',
      value: `${metrics.total}`,
      sub: 'Connected in system',
      valueColor: isDark ? 'grey.100' : 'text.primary',
      icon: <CloudServerOutlined style={{ fontSize: '18px', color: '#1677ff' }} />,
      iconBg: isDark ? 'rgba(22, 119, 255, 0.18)' : '#e6f4ff'
    },
    {
      label: 'WORKER STATUS',
      value: `${metrics.online} Online`,
      sub: `${metrics.online} Online • ${metrics.offline} Offline`,
      valueColor: theme.palette.success.main,
      icon: <CheckCircleOutlined style={{ fontSize: '18px', color: '#52c41a' }} />,
      iconBg: isDark ? 'rgba(82, 196, 26, 0.18)' : '#edf7ed'
    },
    {
      label: 'RUN ACCESS',
      value: `${metrics.allowed} Allowed`,
      sub: `${metrics.allowed} Allowed • ${metrics.blocked} Blocked`,
      valueColor: isDark ? 'grey.100' : 'text.primary',
      icon: <SafetyCertificateOutlined style={{ fontSize: '18px', color: '#722ed1' }} />,
      iconBg: isDark ? 'rgba(114, 46, 209, 0.18)' : '#f9f0ff'
    },
    {
      label: 'ACTIVITY STATUS',
      value: `${metrics.busy} Busy`,
      sub: `${metrics.busy} Busy • ${metrics.idle} Idle`,
      valueColor: theme.palette.warning.main,
      icon: <ThunderboltOutlined style={{ fontSize: '18px', color: '#fa8c16' }} />,
      iconBg: isDark ? 'rgba(250, 140, 22, 0.18)' : '#fff7e6'
    }
  ];

  return (
    <Stack spacing={{ xs: 2, sm: 2.5 }} sx={{ width: '100%' }}>
      {/* ── 4 KPI Summary Cards (Overview Style) ── */}
      <Box sx={{ width: '100%' }}>
        <Grid container spacing={{ xs: 1.5, sm: 2.5 }} sx={{ width: '100%' }}>
          {workerSummaryCards.map((item) => (
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
                      sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: { xs: '0.68rem', sm: '0.75rem' } }}
                    >
                      {item.label}
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 700, color: item.valueColor, mt: 0.5, fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
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

      {/* ── Filter Block ── */}
      <MainCard
        content={false}
        border
        sx={{
          p: { xs: 1.5, sm: 2 },
          bgcolor: isDark ? 'background.paper' : 'common.white',
          borderColor: 'divider',
          borderRadius: 1.5
        }}
      >
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 1.5, md: 2 }} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ flexGrow: 1, width: { xs: '100%', md: 'auto' } }}>
            {/* Search Input */}
            <OutlinedInput
              size="small"
              placeholder="Search worker, ID, job..."
              value={inputSearchTerm}
              onChange={(e) => setInputSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleApplyFilters();
              }}
              startAdornment={
                <InputAdornment position="start">
                  <SearchOutlined style={{ color: isDark ? theme.palette.grey[300] : theme.palette.text.secondary }} />
                </InputAdornment>
              }
              sx={{
                width: { xs: '100%', sm: 220 },
                color: isDark ? 'grey.100' : 'text.primary',
                bgcolor: isDark ? alpha(theme.palette.common.white, 0.04) : 'grey.50',
                '& input::placeholder': {
                  color: isDark ? 'grey.400' : 'text.secondary',
                  opacity: 1
                },
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: isDark ? alpha(theme.palette.common.white, 0.2) : 'grey.300'
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: isDark ? alpha(theme.palette.common.white, 0.35) : 'grey.400'
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'primary.main'
                }
              }}
            />

            {/* Dropdown: Username */}
            <FormControl size="small" sx={{ width: { xs: '100%', sm: 150 } }}>
              <InputLabel id="worker-username-filter-label" sx={inputLabelSx}>
                Username
              </InputLabel>
              <Select
                labelId="worker-username-filter-label"
                value={inputUsername}
                label="Username"
                onChange={(e) => setInputUsername(e.target.value)}
                sx={selectSx}
              >
                <MenuItem value="all">
                  <em>All Usernames</em>
                </MenuItem>
                {usernames.map((u) => (
                  <MenuItem key={u} value={u}>
                    {u}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Dropdown: Worker Status */}
            <FormControl size="small" sx={{ width: { xs: '100%', sm: 150 } }}>
              <InputLabel id="worker-status-filter-label" sx={inputLabelSx}>
                Worker Status
              </InputLabel>
              <Select
                labelId="worker-status-filter-label"
                value={inputWorkerStatus}
                label="Worker Status"
                onChange={(e) => setInputWorkerStatus(e.target.value)}
                sx={selectSx}
              >
                <MenuItem value="all">
                  <em>All Statuses</em>
                </MenuItem>
                {statusOptions.map((status) => (
                  <MenuItem key={status} value={status}>
                    {status}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Dropdown: Job Type */}
            <FormControl size="small" sx={{ width: { xs: '100%', sm: 150 } }}>
              <InputLabel id="worker-jobtype-filter-label" sx={inputLabelSx}>
                Job Type
              </InputLabel>
              <Select
                labelId="worker-jobtype-filter-label"
                value={inputJobType}
                label="Job Type"
                onChange={(e) => setInputJobType(e.target.value)}
                sx={selectSx}
              >
                <MenuItem value="all">
                  <em>All Job Types</em>
                </MenuItem>
                {jobTypeOptions.map((item) => (
                  <MenuItem key={item.value} value={item.value} sx={{ fontWeight: 600, color: item.color }}>
                    {item.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Action Buttons in Mobile Row */}
            <Stack direction="row" spacing={1} sx={{ width: { xs: '100%', sm: 'auto' } }}>
              {/* Apply Button */}
              <Button
                variant="contained"
                color="primary"
                size="small"
                startIcon={<FilterOutlined style={{ fontSize: '13px' }} />}
                onClick={handleApplyFilters}
                sx={{
                  height: 34,
                  px: 1.5,
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  borderRadius: 1.25,
                  textTransform: 'none',
                  whiteSpace: 'nowrap',
                  flex: { xs: 1, sm: 'none' },
                  boxShadow: isDark ? 'none' : theme.customShadows?.primary
                }}
              >
                Apply
              </Button>

              {/* Reset Button */}
              <Button
                variant="outlined"
                size="small"
                startIcon={<ClearOutlined style={{ fontSize: '13px' }} />}
                onClick={handleResetFilters}
                disabled={!isFiltered && !isDirty && inputUsername === 'all' && inputWorkerStatus === 'all' && inputJobType === 'all' && !inputSearchTerm}
                sx={{
                  height: 34,
                  px: 1.5,
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  borderRadius: 1.25,
                  textTransform: 'none',
                  whiteSpace: 'nowrap',
                  flex: { xs: 1, sm: 'none' },
                  bgcolor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'grey.100',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.35)' : 'grey.300',
                  color: isDark ? '#ffffff' : 'text.primary',
                  '&:hover': {
                    borderColor: isDark ? '#ffffff' : 'primary.main',
                    bgcolor: isDark ? 'rgba(255, 255, 255, 0.16)' : 'grey.200',
                    color: isDark ? '#ffffff' : 'primary.main'
                  },
                  '&.Mui-disabled': {
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'grey.200',
                    color: isDark ? 'rgba(255, 255, 255, 0.35)' : 'grey.400',
                    bgcolor: 'transparent'
                  }
                }}
              >
                Reset
              </Button>
            </Stack>
          </Stack>

          {/* Counter Tag */}
          <Chip
            label={`${filteredWorkers.length} / ${workers.length} Workers`}
            size="small"
            color="primary"
            variant={isDark ? 'outlined' : 'filled'}
            sx={{
              fontWeight: 700,
              borderRadius: 1,
              alignSelf: { xs: 'flex-start', md: 'center' },
              mt: { xs: 0.5, md: 0 }
            }}
          />
        </Stack>
      </MainCard>

      {/* ── Bulk Allow Toolbar ── */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'stretch', sm: 'center' },
          gap: 1.5,
          flexWrap: 'wrap',
          p: { xs: 1.5, sm: 0 },
          borderRadius: { xs: 1.5, sm: 0 },
          bgcolor: { xs: isDark ? 'rgba(255,255,255,0.02)' : 'grey.50', sm: 'transparent' },
          border: { xs: '1px dashed', sm: 'none' },
          borderColor: 'divider'
        }}
      >
        <Typography variant="body2" fontWeight="500" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
          Allow all workers for:
        </Typography>

        <FormControl size="small" sx={{ width: { xs: '100%', sm: 170 } }}>
          <Select
            value={bulkAllowUser}
            onChange={(e) => setBulkAllowUser(e.target.value)}
            sx={selectSx}
          >
            {isAdmin && <MenuItem value="ALL">All Users</MenuItem>}
            {workerOwners.map((owner) => (
              <MenuItem key={owner.userId} value={owner.userId}>
                {owner.username} (ID: {owner.userId})
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Button
          size="small"
          variant="contained"
          color="primary"
          onClick={handleAllowAllForUser}
          disabled={!bulkAllowUser || (bulkAllowUser === 'ALL' ? workers.length === 0 : !workers.some((worker) => worker.userId === bulkAllowUser))}
          startIcon={<CheckCircleOutlined />}
          sx={{
            height: 34,
            fontWeight: 600,
            fontSize: '0.75rem',
            borderRadius: 1.25,
            textTransform: 'none',
            px: 2,
            width: { xs: '100%', sm: 'auto' }
          }}
        >
          Allow All Workers
        </Button>
      </Box>

      {/* ── Worker Nodes Table ── */}
      <MainCard
        content={false}
        title="Worker Nodes"
        subheader="Active worker nodes configured and synced across the cluster"
        secondary={
          <Tooltip title="Reload worker list">
            <IconButton size="small" color="secondary" onClick={() => loadWorkers()} sx={{ color: isDark ? 'grey.300' : 'inherit' }}>
              <ReloadOutlined />
            </IconButton>
          </Tooltip>
        }
        sx={{
          borderRadius: 1.5,
          overflow: 'hidden',
          borderColor: 'divider',
          boxShadow: isDark ? 'none' : theme.customShadows?.z1
        }}
      >
        <TableContainer sx={{ maxWidth: '100%', maxHeight: 600 }}>
          <Table stickyHeader size="small" sx={{ minWidth: 1750, tableLayout: 'fixed' }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ ...headCellSx, width: 170 }}>WORKER NAME</TableCell>
                <TableCell sx={{ ...headCellSx, width: 100 }}>USER ID</TableCell>
                <TableCell sx={{ ...headCellSx, width: 130 }}>USERNAME</TableCell>
                <TableCell sx={{ ...headCellSx, width: 170 }}>API KEY</TableCell>
                <TableCell align="center" sx={{ ...headCellSx, width: 130 }}>WORKER STATUS</TableCell>
                <TableCell align="center" sx={{ ...headCellSx, width: 120 }}>RUN ACCESS</TableCell>
                <TableCell align="center" sx={{ ...headCellSx, width: 120 }}>SHARING</TableCell>
                <TableCell align="center" sx={{ ...headCellSx, width: 130 }}>JOB TYPE</TableCell>
                <TableCell align="center" sx={{ ...headCellSx, width: 120 }}>ACTIVITY</TableCell>
                <TableCell sx={{ ...headCellSx, width: 170 }}>CURRENT JOB</TableCell>
                <TableCell align="center" sx={{ ...headCellSx, width: 130 }}>JOBS CLAIMED</TableCell>
                <TableCell sx={{ ...headCellSx, width: 170 }}>LAST SEEN</TableCell>
                <TableCell align="center" sx={{ ...headCellSx, width: 170 }}>ACTIONS</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredWorkers.map((worker) => {
                const isOffline = worker.workerStatus.toLowerCase() === 'offline';

                return (
                  <TableRow
                    key={worker.workerName}
                    hover
                    sx={{
                      transition: 'background-color 0.2s ease',
                      '&:hover': {
                        bgcolor: isDark ? alpha(theme.palette.common.white, 0.03) : 'grey.50'
                      }
                    }}
                  >
                    {/* WORKER NAME */}
                    <TableCell sx={{ ...bodyCellSx, fontFamily: 'monospace', fontWeight: 600, color: isDark ? 'grey.100' : 'text.primary' }}>
                      {worker.workerName}
                    </TableCell>

                    {/* USER ID */}
                    <TableCell sx={bodyCellSx}>
                      {worker.userId}
                    </TableCell>

                    {/* USERNAME */}
                    <TableCell sx={{ ...bodyCellSx, fontWeight: 600, color: isDark ? 'grey.100' : 'text.primary' }}>
                      {worker.username}
                    </TableCell>

                    {/* API KEY */}
                    <TableCell
                      sx={{
                        ...bodyCellSx,
                        fontSize: '0.75rem',
                        color: isDark ? 'grey.300' : 'text.secondary',
                        maxWidth: 170,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                      title={worker.apiKey}
                    >
                      {worker.apiKey && worker.apiKey.length > 10 ? `${worker.apiKey.slice(0, 8)}...` : worker.apiKey}
                    </TableCell>

                    {/* WORKER STATUS */}
                    <TableCell align="center" sx={bodyCellSx}>
                      <StatusChip label={worker.workerStatus} type={worker.workerStatus} />
                    </TableCell>

                    {/* RUN ACCESS */}
                    <TableCell align="center" sx={bodyCellSx}>
                      <StatusChip
                        label={worker.dispatchEnabled ? 'Allowed' : 'Blocked'}
                        type={worker.dispatchEnabled ? 'allowed' : 'blocked'}
                      />
                    </TableCell>

                    {/* SHARING (Switch Toggle) */}
                    <TableCell align="center" sx={{ ...bodyCellSx, py: 0.5 }}>
                      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                        <Switch
                          size="small"
                          checked={worker.isPublic}
                          onChange={(e) => handleTogglePublic(worker.workerName, e.target.checked)}
                          inputProps={{ 'aria-label': `Set ${worker.workerName} sharing mode` }}
                        />
                        <Typography
                          variant="caption"
                          sx={{
                            minWidth: 42,
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            color: worker.isPublic ? 'primary.main' : 'text.secondary'
                          }}
                        >
                          {worker.isPublic ? 'Public' : 'Private'}
                        </Typography>
                      </Box>
                    </TableCell>

                    {/* JOB TYPE (Dropdown Select with distinct color theme) */}
                    <TableCell align="center" sx={bodyCellSx}>
                      <JobTypeSelector
                        value={worker.jobType}
                        onChange={(newType) => handleChangeJobType(worker.workerName, newType)}
                      />
                    </TableCell>

                    {/* ACTIVITY */}
                    <TableCell align="center" sx={bodyCellSx}>
                      <StatusChip label={worker.activity} type={worker.activity} />
                    </TableCell>

                    {/* CURRENT JOB */}
                    <TableCell sx={bodyCellSx}>
                      {worker.currentJob !== '—' ? (
                        <Box
                          component="span"
                          sx={{
                            fontFamily: 'monospace',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            px: 0.8,
                            py: 0.25,
                            borderRadius: 0.75,
                            bgcolor: isDark ? alpha(theme.palette.primary.main, 0.15) : alpha(theme.palette.primary.main, 0.08),
                            color: isDark ? theme.palette.primary.light : theme.palette.primary.main
                          }}
                        >
                          {worker.currentJob}
                        </Box>
                      ) : (
                        <Typography variant="body2" sx={{ color: isDark ? 'grey.400' : 'text.secondary' }}>
                          —
                        </Typography>
                      )}
                    </TableCell>

                    {/* JOBS CLAIMED */}
                    <TableCell align="center" sx={{ ...bodyCellSx, fontWeight: 700, color: isDark ? 'grey.100' : 'text.primary' }}>
                      {worker.jobsClaimed}
                    </TableCell>

                    {/* LAST SEEN */}
                    <TableCell sx={{ ...bodyCellSx, color: isDark ? 'grey.300' : 'text.secondary', fontSize: '0.75rem' }}>
                      {worker.lastSeen}
                    </TableCell>

                    {/* ACTIONS (Block/Allow, Delete) */}
                    <TableCell align="center" sx={{ ...bodyCellSx, py: 0.75 }}>
                      <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'center', alignItems: 'center' }}>
                        {isOffline ? (
                          <>
                            <Typography variant="caption" color="text.secondary" sx={{ py: 0.5 }}>
                              Offline
                            </Typography>
                            <Button
                              size="small"
                              variant="outlined"
                              color="error"
                              onClick={() => handleDeleteWorker(worker.workerName)}
                              sx={{
                                fontSize: '0.68rem',
                                py: 0.25,
                                px: 0.75,
                                height: '22px',
                                minWidth: 'auto',
                                textTransform: 'none',
                                fontWeight: 600,
                                borderRadius: 1.5
                              }}
                            >
                              Delete
                            </Button>
                          </>
                        ) : (
                          <>
                            {/* Block / Allow Button */}
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => handleToggleDispatch(worker.workerName)}
                              sx={{
                                fontSize: '0.68rem',
                                py: 0.25,
                                px: 0.75,
                                height: '22px',
                                minWidth: 'auto',
                                whiteSpace: 'nowrap',
                                textTransform: 'none',
                                fontWeight: 600,
                                borderRadius: 1.5,
                                color: worker.dispatchEnabled
                                  ? isDark
                                    ? '#faad14'
                                    : '#d48806'
                                  : isDark
                                  ? '#52c41a'
                                  : '#2e7d32',
                                borderColor: worker.dispatchEnabled
                                  ? 'rgba(250, 173, 20, 0.4)'
                                  : 'rgba(82, 196, 26, 0.4)',
                                bgcolor: worker.dispatchEnabled
                                  ? 'rgba(250, 173, 20, 0.08)'
                                  : 'rgba(82, 196, 26, 0.08)',
                                '&:hover': {
                                  bgcolor: worker.dispatchEnabled
                                    ? 'rgba(250, 173, 20, 0.15)'
                                    : 'rgba(82, 196, 26, 0.15)'
                                }
                              }}
                            >
                              {worker.dispatchEnabled ? 'Block' : 'Allow'}
                            </Button>

                            {/* Delete Button */}
                            <Button
                              size="small"
                              variant="outlined"
                              color="error"
                              onClick={() => handleDeleteWorker(worker.workerName)}
                              sx={{
                                fontSize: '0.68rem',
                                py: 0.25,
                                px: 0.75,
                                height: '22px',
                                minWidth: 'auto',
                                whiteSpace: 'nowrap',
                                textTransform: 'none',
                                fontWeight: 600,
                                borderRadius: 1.5
                              }}
                            >
                              Delete
                            </Button>
                          </>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}

              {filteredWorkers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={13} align="center" sx={{ py: 6 }}>
                    <Stack spacing={1} alignItems="center" justifyContent="center">
                      <Typography variant="subtitle1" sx={{ color: isDark ? 'grey.300' : 'text.secondary' }}>
                        No worker nodes match the selected filters
                      </Typography>
                      <Button size="small" variant="text" color="primary" onClick={handleResetFilters}>
                        Reset all filters
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </MainCard>
    </Stack>
  );
}
