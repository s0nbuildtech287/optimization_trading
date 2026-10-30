import { useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';

// material-ui
import { useTheme, alpha } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import OutlinedInput from '@mui/material/OutlinedInput';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Paper from '@mui/material/Paper';
import Divider from '@mui/material/Divider';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Avatar from '@mui/material/Avatar';

// project imports
import MainCard from 'components/MainCard';
import CustomTablePagination from 'components/CustomTablePagination';
import { createMt5ApiKey, listMt5ApiKeys, revokeMt5ApiKey, deleteMt5ApiKey } from 'api/mt5Optimization';

// assets - icons
import KeyOutlined from '@ant-design/icons/KeyOutlined';
import DeleteOutlined from '@ant-design/icons/DeleteOutlined';
import CheckCircleOutlined from '@ant-design/icons/CheckCircleOutlined';
import StopOutlined from '@ant-design/icons/StopOutlined';
import UserOutlined from '@ant-design/icons/UserOutlined';
import SearchOutlined from '@ant-design/icons/SearchOutlined';
import CopyOutlined from '@ant-design/icons/CopyOutlined';
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import ReloadOutlined from '@ant-design/icons/ReloadOutlined';
import EyeOutlined from '@ant-design/icons/EyeOutlined';
import EyeInvisibleOutlined from '@ant-design/icons/EyeInvisibleOutlined';
import SafetyCertificateOutlined from '@ant-design/icons/SafetyCertificateOutlined';
import CodeOutlined from '@ant-design/icons/CodeOutlined';
import AppstoreOutlined from '@ant-design/icons/AppstoreOutlined';
import UnorderedListOutlined from '@ant-design/icons/UnorderedListOutlined';
import ThunderboltOutlined from '@ant-design/icons/ThunderboltOutlined';
import CheckOutlined from '@ant-design/icons/CheckOutlined';
import ClockCircleOutlined from '@ant-design/icons/ClockCircleOutlined';
import LockOutlined from '@ant-design/icons/LockOutlined';

const formatTimestamp = (value) => (value ? new Date(value).toLocaleString() : 'Never');

const mapApiKey = (key) => ({
  id: String(key.id),
  label: key.name || 'Unnamed Key',
  workerNameRestriction: Array.isArray(key.scopes) ? key.scopes.join(', ') : '',
  keyPlaintext: key.api_key,
  keyMasked: key.api_key ? key.api_key.slice(0, 7) + '••••••••••••' + key.api_key.slice(-4) : '••••••••••••••••',
  userId: String(key.user_id || ''),
  username: key.username || String(key.user_id || 'User'),
  status: String(key.status || '').toLowerCase() === 'active' ? 'active' : 'revoked',
  createdAt: formatTimestamp(key.created_at),
  lastUsedAt: formatTimestamp(key.last_used_at)
});

export default function ApiKeysPage() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const currentUser = useMemo(() => {
    try {
      const stored = localStorage.getItem('user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }, []);

  const isAdmin = useMemo(() => {
    const role = String(currentUser?.role || '').toLowerCase();
    const roles = Array.isArray(currentUser?.roles) ? currentUser.roles.map((r) => String(r).toLowerCase()) : [];
    return role === 'admin' || roles.some((r) => r.includes('admin'));
  }, [currentUser]);

  const currentUserId = useMemo(() => {
    return String(currentUser?.id || currentUser?.userId || '');
  }, [currentUser]);

  useEffect(() => {
    document.title = 'API Keys Hub | LotusQuant';
  }, []);

  // ── Data & Loading State ──
  const [apiKeys, setApiKeys] = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'
  const [revealedKeys, setRevealedKeys] = useState({});
  const [copiedKeyId, setCopiedKeyId] = useState(null);
  const [copyFeedback, setCopyFeedback] = useState('');
  const [showCodeSnippet, setShowCodeSnippet] = useState(false);

  // ── Filter States ──
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'revoked'
  const [userFilter, setUserFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(9);

  // ── Modal State for Generating New Key ──
  const [openCreateModal, setOpenCreateModal] = useState(false);
  const [createLabel, setCreateLabel] = useState('');
  const [createWorkerRestriction, setCreateWorkerRestriction] = useState('');
  const [createdKeyResult, setCreatedKeyResult] = useState(null);
  const [creating, setCreating] = useState(false);

  // ── Confirmation Modal for Revoke ──
  const [confirmModal, setConfirmModal] = useState({
    open: false,
    title: '',
    content: '',
    confirmText: 'Confirm',
    confirmColor: 'error',
    onConfirm: null
  });

  // Load API Keys from backend
  const loadApiKeys = async () => {
    try {
      setLoading(true);
      const data = await listMt5ApiKeys();
      setApiKeys((data || []).map(mapApiKey));
    } catch (error) {
      setCopyFeedback(error.message || 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApiKeys();
  }, []);

  // Metrics calculation
  const metrics = useMemo(() => {
    const total = apiKeys.length;
    const active = apiKeys.filter((k) => k.status === 'active').length;
    const revoked = apiKeys.filter((k) => k.status === 'revoked').length;
    const uniqueUsers = new Set(apiKeys.map((k) => k.username)).size;
    return { total, active, revoked, uniqueUsers };
  }, [apiKeys]);

  const usernames = useMemo(() => [...new Set(apiKeys.map((k) => k.username))], [apiKeys]);

  // Filtered List
  const filteredKeys = useMemo(() => {
    return apiKeys.filter((key) => {
      const matchStatus = statusFilter === 'all' || key.status === statusFilter;
      const matchUser = userFilter === 'all' || key.username === userFilter;
      const matchSearch =
        !searchTerm.trim() ||
        key.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        key.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        key.userId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (key.keyPlaintext && key.keyPlaintext.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (key.workerNameRestriction && key.workerNameRestriction.toLowerCase().includes(searchTerm.toLowerCase()));

      return matchStatus && matchUser && matchSearch;
    });
  }, [apiKeys, statusFilter, userFilter, searchTerm]);

  // Paginated List
  const paginatedKeys = useMemo(() => {
    const start = page * rowsPerPage;
    return filteredKeys.slice(start, start + rowsPerPage);
  }, [filteredKeys, page, rowsPerPage]);

  // Copy Key Handler
  const handleCopyKey = async (keyText, keyId, label) => {
    try {
      await navigator.clipboard.writeText(keyText);
      setCopiedKeyId(keyId);
      setCopyFeedback(`Copied API Key for "${label}" to clipboard!`);
      setTimeout(() => setCopiedKeyId(null), 2500);
      setTimeout(() => setCopyFeedback(''), 4000);
    } catch (err) {
      console.error('Failed to copy key:', err);
    }
  };

  // Toggle Reveal Mask
  const handleToggleReveal = (keyId) => {
    setRevealedKeys((prev) => ({
      ...prev,
      [keyId]: !prev[keyId]
    }));
  };

  // Revoke Key Handler
  const handleToggleRevoke = (keyItem) => {
    if (keyItem.status !== 'active') return;
    setConfirmModal({
      open: true,
      title: 'Revoke Secret API Key',
      content: `Are you sure you want to revoke "${keyItem.label}"? All workers and automated jobs currently authenticating with this key will immediately be denied access.`,
      confirmText: 'Revoke Key Now',
      confirmColor: 'error',
      onConfirm: async () => {
        try {
          await revokeMt5ApiKey(keyItem.id);
          await loadApiKeys();
          setConfirmModal((prev) => ({ ...prev, open: false }));
          setCopyFeedback(`Successfully revoked API Key "${keyItem.label}".`);
        } catch (error) {
          setCopyFeedback(error.message || 'Failed to revoke API key');
        }
      }
    });
  };

  // Delete Key Handler
  const handleDeleteKey = (keyItem) => {
    setConfirmModal({
      open: true,
      title: 'Delete API Key Permanently',
      content: `Are you sure you want to permanently delete "${keyItem.label}" (ID: #${keyItem.id})? This action cannot be undone.`,
      confirmText: 'Delete Key Now',
      confirmColor: 'error',
      onConfirm: async () => {
        try {
          await deleteMt5ApiKey(keyItem.id);
          setConfirmModal((prev) => ({ ...prev, open: false }));
          setCopyFeedback(`Successfully deleted API Key "${keyItem.label}".`);
          await loadApiKeys();
        } catch (error) {
          setCopyFeedback(error.message || 'Failed to delete API key');
        }
      }
    });
  };

  // Create Key Handler
  const handleCreateNewKey = async () => {
    if (!createLabel.trim()) return;
    try {
      setCreating(true);
      const scopes = createWorkerRestriction.split(',').map((scope) => scope.trim()).filter(Boolean);
      const rawCreated = await createMt5ApiKey({ name: createLabel.trim(), scopes });
      const created = mapApiKey(rawCreated);
      setApiKeys((prev) => [created, ...prev]);
      setCreatedKeyResult(created);
    } catch (error) {
      setCopyFeedback(error.message || 'Failed to create API key');
    } finally {
      setCreating(false);
    }
  };

  const handleCloseCreateModal = () => {
    setOpenCreateModal(false);
    setCreateLabel('');
    setCreateWorkerRestriction('');
    setCreatedKeyResult(null);
  };

  return (
    <Stack spacing={2.5} sx={{ width: '100%' }}>
      {/* ── 1. MODERN HERO BANNER: API KEYS MANAGEMENT HUB ── */}
      <Card
        sx={{
          p: { xs: 2.5, sm: 3 },
          borderRadius: 2.5,
          position: 'relative',
          overflow: 'hidden',
          background: isDark
            ? 'linear-gradient(135deg, rgba(22, 119, 255, 0.12) 0%, rgba(17, 24, 39, 0.95) 100%)'
            : 'linear-gradient(135deg, #e6f4ff 0%, #ffffff 100%)',
          border: '1px solid',
          borderColor: isDark ? 'rgba(22, 119, 255, 0.25)' : 'rgba(22, 119, 255, 0.18)',
          boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.35)' : '0 6px 20px rgba(22, 119, 255, 0.06)'
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2.5}
          alignItems={{ xs: 'flex-start', md: 'center' }}
          justifyContent="space-between"
        >
          {/* Left Hero Content */}
          <Box sx={{ maxWidth: { xs: '100%', md: 680 } }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  borderRadius: 1.5,
                  bgcolor: 'primary.main',
                  color: '#fff'
                }}
              >
                <KeyOutlined style={{ fontSize: 16 }} />
              </Box>
              <Typography variant="h4" fontWeight={800}>
                Developer API Credentials
              </Typography>
              <Chip
                icon={<SafetyCertificateOutlined style={{ fontSize: 12 }} />}
                label="Bearer Token Auth"
                size="small"
                color="primary"
                variant="outlined"
                sx={{ height: 22, fontSize: '0.7rem', fontWeight: 700 }}
              />
            </Stack>

            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5 }}>
              Manage access keys for automated MT5 worker clusters, optimizer daemons, and programmatic endpoints.
              Keep your keys confidential to prevent unauthorized access.
            </Typography>

            {/* Quick Status Pill Bar */}
            <Stack direction="row" spacing={1.25} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 1.75 }}>
              <Chip
                label={`Total: ${metrics.total} Keys`}
                size="small"
                sx={{
                  bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                  fontWeight: 700,
                  fontSize: '0.75rem'
                }}
              />
              <Chip
                icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                label={`${metrics.active} Active`}
                size="small"
                sx={{
                  bgcolor: isDark ? 'rgba(82, 196, 26, 0.15)' : '#edf7ed',
                  color: isDark ? '#52c41a' : '#2e7d32',
                  fontWeight: 700,
                  fontSize: '0.75rem'
                }}
              />
              <Chip
                icon={<StopOutlined style={{ color: '#ff4d4f' }} />}
                label={`${metrics.revoked} Revoked`}
                size="small"
                sx={{
                  bgcolor: isDark ? 'rgba(255, 77, 79, 0.15)' : '#fff1f0',
                  color: isDark ? '#ff4d4f' : '#cf1322',
                  fontWeight: 700,
                  fontSize: '0.75rem'
                }}
              />
              <Chip
                icon={<UserOutlined style={{ color: '#722ed1' }} />}
                label={`${metrics.uniqueUsers} Users`}
                size="small"
                sx={{
                  bgcolor: isDark ? 'rgba(114, 46, 209, 0.15)' : '#f9f0ff',
                  color: isDark ? '#d3adf7' : '#722ed1',
                  fontWeight: 700,
                  fontSize: '0.75rem'
                }}
              />
            </Stack>
          </Box>

          {/* Right Hero Action Buttons */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ width: { xs: '100%', sm: 'auto' } }}>
            <Button
              variant="outlined"
              startIcon={<CodeOutlined style={{ color: isDark ? '#ffffff' : 'inherit' }} />}
              onClick={() => setShowCodeSnippet((prev) => !prev)}
              sx={{
                borderRadius: 1.5,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.8125rem',
                color: isDark ? '#ffffff' : 'text.primary',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.35)' : 'grey.300',
                bgcolor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#ffffff',
                transition: 'all 0.2s',
                '&:hover': {
                  color: isDark ? '#ffffff' : 'text.primary',
                  borderColor: isDark ? '#ffffff' : 'text.primary',
                  bgcolor: isDark ? 'rgba(255, 255, 255, 0.18)' : 'grey.100'
                }
              }}
            >
              {showCodeSnippet ? 'Hide Quick Start' : 'Integration Code'}
            </Button>

            <Button
              variant="contained"
              color="primary"
              startIcon={<PlusOutlined />}
              onClick={() => {
                setCreatedKeyResult(null);
                setCreateLabel('');
                setCreateWorkerRestriction('');
                setOpenCreateModal(true);
              }}
              sx={{
                borderRadius: 1.5,
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.8125rem',
                px: 2.5,
                py: 1,
                boxShadow: '0 4px 14px rgba(22, 119, 255, 0.3)'
              }}
            >
              Generate New API Key
            </Button>
          </Stack>
        </Stack>

        {/* Integration Code Snippet Accordion */}
        {showCodeSnippet && (
          <Box
            sx={{
              mt: 2.5,
              p: 2,
              borderRadius: 2,
              bgcolor: isDark ? '#0d1117' : '#f6f8fa',
              border: '1px solid',
              borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#d0d7de'
            }}
          >
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="caption" fontWeight={700} sx={{ color: isDark ? '#58a6ff' : '#0969da' }}>
                HTTP Request Header Example:
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Pass in all worker optimization requests
              </Typography>
            </Stack>
            <Box
              component="pre"
              sx={{
                m: 0,
                p: 1.5,
                borderRadius: 1.25,
                bgcolor: isDark ? 'rgba(0,0,0,0.4)' : '#ffffff',
                border: '1px solid',
                borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#e1e4e8',
                fontSize: '0.78rem',
                fontFamily: 'monospace',
                overflowX: 'auto',
                color: isDark ? '#e6edf3' : '#24292f'
              }}
            >
              {`curl -X POST "http://localhost:5000/api/mt5/jobs/dispatch" \\
  -H "Authorization: Bearer <YOUR_API_KEY>" \\
  -H "Content-Type: application/json"`}
            </Box>
          </Box>
        )}
      </Card>

      {/* ── Notification Feedback ── */}
      {copyFeedback && (
        <Alert
          severity="success"
          onClose={() => setCopyFeedback('')}
          sx={{ borderRadius: 1.5, fontWeight: 600, fontSize: '0.8125rem' }}
        >
          {copyFeedback}
        </Alert>
      )}

      {/* ── 2. UNIFIED SEARCH & FILTER CONTROL BAR ── */}
      <MainCard contentSX={{ p: { xs: 1.5, sm: 2 } }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={1.5}
          alignItems={{ xs: 'stretch', md: 'center' }}
          justifyContent="space-between"
        >
          {/* Left Filter & Search Inputs */}
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            alignItems="center"
            flexWrap="wrap"
            useFlexGap
            sx={{ flexGrow: 1 }}
          >
            {/* Search Box */}
            <OutlinedInput
              size="small"
              placeholder="Search by Key Name, Worker Scope, Owner..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(0);
              }}
              startAdornment={
                <InputAdornment position="start">
                  <SearchOutlined style={{ color: theme.palette.text.secondary }} />
                </InputAdornment>
              }
              sx={{
                width: { xs: '100%', sm: 280 },
                borderRadius: 1.5,
                bgcolor: isDark ? 'rgba(255,255,255,0.03)' : '#ffffff'
              }}
            />

            {/* Quick Status Filter Tabs */}
            <ToggleButtonGroup
              size="small"
              value={statusFilter}
              exclusive
              onChange={(e, newStatus) => {
                if (newStatus !== null) {
                  setStatusFilter(newStatus);
                  setPage(0);
                }
              }}
              sx={{
                bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'grey.100',
                p: 0.25,
                borderRadius: 1.5,
                '& .MuiToggleButton-root': {
                  px: 1.5,
                  py: 0.5,
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  borderRadius: 1.25,
                  border: 0,
                  '&.Mui-selected': {
                    bgcolor: isDark ? 'primary.main' : '#ffffff',
                    color: isDark ? '#ffffff' : 'primary.main',
                    boxShadow: isDark ? 'none' : '0 1px 4px rgba(0,0,0,0.08)'
                  }
                }
              }}
            >
              <ToggleButton value="all">All ({metrics.total})</ToggleButton>
              <ToggleButton value="active">Active ({metrics.active})</ToggleButton>
              <ToggleButton value="revoked">Revoked ({metrics.revoked})</ToggleButton>
            </ToggleButtonGroup>

            {/* User Dropdown */}
            {usernames.length > 1 && (
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel id="api-key-user-select-label">Owner</InputLabel>
                <Select
                  labelId="api-key-user-select-label"
                  value={userFilter}
                  label="Owner"
                  onChange={(e) => {
                    setUserFilter(e.target.value);
                    setPage(0);
                  }}
                  sx={{ borderRadius: 1.5 }}
                >
                  <MenuItem value="all">All Owners</MenuItem>
                  {usernames.map((u) => (
                    <MenuItem key={u} value={u}>
                      {u}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            {/* Refresh Button */}
            <Tooltip title="Refresh API Keys">
              <IconButton
                size="small"
                onClick={loadApiKeys}
                disabled={loading}
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1.25,
                  p: 0.85
                }}
              >
                <ReloadOutlined spin={loading} style={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          </Stack>

          {/* Right View Mode Toggle: Cards View vs Table View */}
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              Showing {filteredKeys.length} keys
            </Typography>

            <ToggleButtonGroup
              size="small"
              value={viewMode}
              exclusive
              onChange={(e, nextMode) => nextMode && setViewMode(nextMode)}
              sx={{
                bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'grey.100',
                p: 0.25,
                borderRadius: 1.25,
                '& .MuiToggleButton-root': {
                  px: 1,
                  py: 0.5,
                  borderRadius: 1,
                  border: 0,
                  '&.Mui-selected': {
                    bgcolor: isDark ? 'primary.main' : '#ffffff',
                    color: isDark ? '#ffffff' : 'primary.main',
                    boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.08)'
                  }
                }
              }}
            >
              <Tooltip title="Grid Cards View">
                <ToggleButton value="grid" aria-label="grid view">
                  <AppstoreOutlined style={{ fontSize: 14 }} />
                </ToggleButton>
              </Tooltip>
              <Tooltip title="Compact Table View">
                <ToggleButton value="table" aria-label="table view">
                  <UnorderedListOutlined style={{ fontSize: 14 }} />
                </ToggleButton>
              </Tooltip>
            </ToggleButtonGroup>
          </Stack>
        </Stack>
      </MainCard>

      {/* ── 3. MAIN CONTENT: CARDS VIEW (DEFAULT) OR COMPACT TABLE VIEW ── */}
      {filteredKeys.length === 0 ? (
        <Paper
          variant="outlined"
          sx={{
            py: 8,
            px: 3,
            textAlign: 'center',
            borderRadius: 2,
            bgcolor: isDark ? 'background.paper' : '#fafafa'
          }}
        >
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 56,
              height: 56,
              borderRadius: '50%',
              bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'grey.200',
              color: 'text.secondary',
              mb: 1.5
            }}
          >
            <KeyOutlined style={{ fontSize: 26 }} />
          </Box>
          <Typography variant="h5" fontWeight={700}>
            No API Keys Found
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
            {searchTerm || statusFilter !== 'all' || userFilter !== 'all'
              ? 'No credentials matched your current filter criteria.'
              : 'You have not generated any API keys yet.'}
          </Typography>
          <Button
            variant="contained"
            color="primary"
            startIcon={<PlusOutlined />}
            onClick={() => setOpenCreateModal(true)}
            sx={{ textTransform: 'none', borderRadius: 1.25, fontWeight: 600 }}
          >
            Create Your First API Key
          </Button>
        </Paper>
      ) : viewMode === 'grid' ? (
        /* ── GRID CARDS VIEW ── */
        <Box sx={{ width: '100%' }}>
          <Grid container spacing={2}>
            {paginatedKeys.map((keyItem) => {
              const isActive = keyItem.status === 'active';
              const canDelete = isAdmin || (currentUserId && String(keyItem.userId) === currentUserId);
              const isRevealed = Boolean(revealedKeys[keyItem.id]);
              const displayToken = isRevealed && keyItem.keyPlaintext ? keyItem.keyPlaintext : keyItem.keyMasked;
              const isCopied = copiedKeyId === keyItem.id;

              return (
                <Grid key={keyItem.id} size={{ xs: 12, sm: 6, lg: 4 }}>
                  <Card
                    variant="outlined"
                    sx={{
                      p: 2.25,
                      borderRadius: 2,
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      bgcolor: isDark ? 'background.paper' : '#ffffff',
                      borderColor: isActive
                        ? isDark
                          ? 'rgba(255,255,255,0.1)'
                          : 'grey.200'
                        : isDark
                        ? 'rgba(255, 77, 79, 0.2)'
                        : 'rgba(255, 77, 79, 0.25)',
                      opacity: isActive ? 1 : 0.75,
                      transition: 'all 0.2s ease-in-out',
                      '&:hover': {
                        borderColor: isActive ? 'primary.main' : 'error.main',
                        boxShadow: isDark ? '0 6px 18px rgba(0,0,0,0.3)' : '0 6px 16px rgba(0,0,0,0.05)',
                        transform: 'translateY(-2px)'
                      }
                    }}
                  >
                    {/* Card Top: Name & Status */}
                    <Box>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1.5 }}>
                        <Stack direction="row" spacing={1.25} alignItems="center">
                          <Avatar
                            sx={{
                              width: 36,
                              height: 36,
                              borderRadius: 1.5,
                              bgcolor: isActive
                                ? isDark
                                  ? 'rgba(22, 119, 255, 0.15)'
                                  : '#e6f4ff'
                                : isDark
                                ? 'rgba(255, 77, 79, 0.15)'
                                : '#fff1f0',
                              color: isActive ? 'primary.main' : 'error.main'
                            }}
                          >
                            <KeyOutlined style={{ fontSize: 18 }} />
                          </Avatar>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="subtitle1" fontWeight={700} noWrap title={keyItem.label}>
                              {keyItem.label}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              ID: #{keyItem.id}
                            </Typography>
                          </Box>
                        </Stack>

                        <Chip
                          label={isActive ? 'Active' : 'Revoked'}
                          size="small"
                          color={isActive ? 'success' : 'error'}
                          variant={isDark ? 'outlined' : 'filled'}
                          sx={{ height: 22, fontSize: '0.68rem', fontWeight: 700, borderRadius: 1 }}
                        />
                      </Stack>

                      {/* Secret Key Token Box */}
                      <Box
                        sx={{
                          p: 1.25,
                          borderRadius: 1.5,
                          bgcolor: isDark ? 'rgba(0,0,0,0.35)' : 'grey.50',
                          border: '1px solid',
                          borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'grey.200',
                          mb: 1.75
                        }}
                      >
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Typography
                            variant="body2"
                            sx={{
                              fontFamily: 'monospace',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              color: isDark ? '#e6edf3' : '#1e293b',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              pr: 1
                            }}
                          >
                            {displayToken}
                          </Typography>

                          <Stack direction="row" spacing={0.5} alignItems="center">
                            {keyItem.keyPlaintext && (
                              <Tooltip title={isRevealed ? 'Hide Secret Key' : 'Reveal Secret Key'}>
                                <IconButton
                                  size="small"
                                  onClick={() => handleToggleReveal(keyItem.id)}
                                  sx={{ color: 'text.secondary' }}
                                >
                                  {isRevealed ? (
                                    <EyeInvisibleOutlined style={{ fontSize: 13 }} />
                                  ) : (
                                    <EyeOutlined style={{ fontSize: 13 }} />
                                  )}
                                </IconButton>
                              </Tooltip>
                            )}

                            <Tooltip title={isCopied ? 'Copied!' : 'Copy Key'}>
                              <IconButton
                                size="small"
                                color={isCopied ? 'success' : 'primary'}
                                onClick={() =>
                                  handleCopyKey(keyItem.keyPlaintext || keyItem.keyMasked, keyItem.id, keyItem.label)
                                }
                                sx={{
                                  bgcolor: isCopied ? (isDark ? 'rgba(82,196,26,0.2)' : '#e6f7ff') : 'transparent'
                                }}
                              >
                                {isCopied ? (
                                  <CheckOutlined style={{ fontSize: 13 }} />
                                ) : (
                                  <CopyOutlined style={{ fontSize: 13 }} />
                                )}
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        </Stack>
                      </Box>

                      {/* Scopes & Worker Restrictions */}
                      <Box sx={{ mb: 1.5 }}>
                        <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: 'block', mb: 0.5 }}>
                          Worker Scope / Restrictions:
                        </Typography>
                        {keyItem.workerNameRestriction ? (
                          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                            {keyItem.workerNameRestriction.split(',').map((scope, idx) => (
                              <Chip
                                key={idx}
                                label={scope.trim()}
                                size="small"
                                color="info"
                                variant="outlined"
                                sx={{ height: 20, fontSize: '0.68rem', fontWeight: 600, borderRadius: 0.75 }}
                              />
                            ))}
                          </Stack>
                        ) : (
                          <Chip
                            label="Full Cluster Access (*)"
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: '0.68rem',
                              fontWeight: 600,
                              borderRadius: 0.75,
                              bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'grey.100',
                              color: 'text.secondary'
                            }}
                          />
                        )}
                      </Box>
                    </Box>

                    {/* Card Bottom: Metadata & Revoke Action */}
                    <Box sx={{ pt: 1.5, borderTop: '1px dashed', borderColor: 'divider' }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.25 }}>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <UserOutlined style={{ fontSize: 11, color: theme.palette.text.secondary }} />
                          <Typography variant="caption" color="text.secondary">
                            Owner: <strong>{keyItem.username}</strong>
                          </Typography>
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          Last used: <strong>{keyItem.lastUsedAt}</strong>
                        </Typography>
                      </Stack>

                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                          Created: {keyItem.createdAt}
                        </Typography>

                        {isActive ? (
                          <Button
                            variant="text"
                            color="error"
                            size="small"
                            startIcon={<StopOutlined />}
                            onClick={() => handleToggleRevoke(keyItem)}
                            sx={{
                              textTransform: 'none',
                              fontWeight: 600,
                              fontSize: '0.75rem',
                              py: 0.25,
                              px: 1,
                              borderRadius: 1
                            }}
                          >
                            Revoke Key
                          </Button>
                        ) : (
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="caption" color="error.main" fontWeight={600}>
                              Revoked
                            </Typography>
                            {canDelete && (
                              <Tooltip title="Delete Key Permanently">
                                <Button
                                  variant="contained"
                                  color="error"
                                  size="small"
                                  startIcon={<DeleteOutlined />}
                                  onClick={() => handleDeleteKey(keyItem)}
                                  sx={{
                                    textTransform: 'none',
                                    fontWeight: 600,
                                    fontSize: '0.72rem',
                                    py: 0.25,
                                    px: 1,
                                    borderRadius: 1,
                                    boxShadow: 'none'
                                  }}
                                >
                                  Delete Key
                                </Button>
                              </Tooltip>
                            )}
                          </Stack>
                        )}
                      </Stack>
                    </Box>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </Box>
      ) : (
        /* ── COMPACT TABLE VIEW ── */
        <MainCard content={false} border>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'grey.50' }}>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', py: 1.25 }}>Key Label & ID</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', py: 1.25 }}>Token Secret</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', py: 1.25 }}>Worker Scopes</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', py: 1.25 }}>Owner</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', py: 1.25 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', py: 1.25 }}>Created / Last Used</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.75rem', py: 1.25 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedKeys.map((keyItem) => {
                  const isActive = keyItem.status === 'active';
                  const canDelete = isAdmin || (currentUserId && String(keyItem.userId) === currentUserId);
                  const isCopied = copiedKeyId === keyItem.id;

                  return (
                    <TableRow key={keyItem.id} hover sx={{ opacity: isActive ? 1 : 0.7 }}>
                      {/* Name & ID */}
                      <TableCell sx={{ py: 1.25 }}>
                        <Typography variant="subtitle2" fontWeight={700}>
                          {keyItem.label}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          #{keyItem.id}
                        </Typography>
                      </TableCell>

                      {/* Token Secret */}
                      <TableCell sx={{ py: 1.25 }}>
                        <Stack direction="row" spacing={0.75} alignItems="center">
                          <Typography
                            variant="body2"
                            sx={{ fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 600 }}
                          >
                            {keyItem.keyMasked}
                          </Typography>
                          <Tooltip title={isCopied ? 'Copied!' : 'Copy Key'}>
                            <IconButton
                              size="small"
                              onClick={() =>
                                handleCopyKey(keyItem.keyPlaintext || keyItem.keyMasked, keyItem.id, keyItem.label)
                              }
                            >
                              {isCopied ? (
                                <CheckOutlined style={{ fontSize: 13, color: '#52c41a' }} />
                              ) : (
                                <CopyOutlined style={{ fontSize: 13 }} />
                              )}
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>

                      {/* Worker Scopes */}
                      <TableCell sx={{ py: 1.25 }}>
                        {keyItem.workerNameRestriction ? (
                          <Chip
                            label={keyItem.workerNameRestriction}
                            size="small"
                            variant="outlined"
                            color="info"
                            sx={{ height: 20, fontSize: '0.68rem', fontWeight: 600 }}
                          />
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            All Clusters (*)
                          </Typography>
                        )}
                      </TableCell>

                      {/* Owner */}
                      <TableCell sx={{ py: 1.25 }}>
                        <Typography variant="body2" fontWeight={600}>
                          {keyItem.username}
                        </Typography>
                      </TableCell>

                      {/* Status */}
                      <TableCell sx={{ py: 1.25 }}>
                        <Chip
                          label={isActive ? 'Active' : 'Revoked'}
                          size="small"
                          color={isActive ? 'success' : 'error'}
                          variant={isDark ? 'outlined' : 'filled'}
                          sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700 }}
                        />
                      </TableCell>

                      {/* Timestamps */}
                      <TableCell sx={{ py: 1.25 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          Created: {keyItem.createdAt}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          Used: {keyItem.lastUsedAt}
                        </Typography>
                      </TableCell>

                      {/* Actions */}
                      <TableCell align="center" sx={{ py: 1.25 }}>
                        {isActive ? (
                          <Button
                            variant="outlined"
                            color="error"
                            size="small"
                            startIcon={<StopOutlined />}
                            onClick={() => handleToggleRevoke(keyItem)}
                            sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.72rem', py: 0.25, px: 1 }}
                          >
                            Revoke
                          </Button>
                        ) : canDelete ? (
                          <Tooltip title="Delete Key Permanently">
                            <Button
                              variant="contained"
                              color="error"
                              size="small"
                              startIcon={<DeleteOutlined />}
                              onClick={() => handleDeleteKey(keyItem)}
                              sx={{
                                textTransform: 'none',
                                fontWeight: 600,
                                fontSize: '0.72rem',
                                py: 0.25,
                                px: 1,
                                borderRadius: 1,
                                boxShadow: 'none'
                              }}
                            >
                              Delete
                            </Button>
                          </Tooltip>
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            —
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </MainCard>
      )}

      {/* ── Pagination ── */}
      {filteredKeys.length > 0 && (
        <CustomTablePagination
          count={filteredKeys.length}
          page={page}
          rowsPerPage={rowsPerPage}
          onPageChange={(_, newPage) => setPage(newPage)}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[6, 9, 18, 36]}
        />
      )}

      {/* ── 4. MODAL: GENERATE NEW API KEY ── */}
      <Dialog
        open={openCreateModal}
        onClose={handleCloseCreateModal}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Stack direction="row" spacing={1.25} alignItems="center">
            <KeyOutlined style={{ color: '#1677ff', fontSize: 18 }} />
            <Box>
              <Typography variant="h5" fontWeight={700}>
                {createdKeyResult ? 'API Key Generated' : 'Create New API Key'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {createdKeyResult
                  ? 'Please store this credential securely'
                  : 'Configure credentials for MT5 workers and optimization jobs'}
              </Typography>
            </Box>
          </Stack>
        </DialogTitle>

        <DialogContent sx={{ p: 3 }}>
          {createdKeyResult ? (
            <Stack spacing={2.5} sx={{ mt: 1 }}>
              <Alert severity="warning" icon={<LockOutlined />} sx={{ borderRadius: 1.5 }}>
                <strong>Save this key immediately!</strong> For security reasons, you will not be able to view this
                secret plaintext key again after closing this dialog.
              </Alert>

              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={700}>
                  KEY NAME
                </Typography>
                <Typography variant="body1" fontWeight={700} sx={{ mt: 0.25 }}>
                  {createdKeyResult.label}
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ mb: 0.75, display: 'block' }}>
                  SECRET TOKEN VALUE
                </Typography>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 1.5,
                    borderRadius: 1.5,
                    bgcolor: isDark ? '#0d1117' : 'grey.50',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 1
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      color: isDark ? '#58a6ff' : 'primary.main',
                      wordBreak: 'break-all'
                    }}
                  >
                    {createdKeyResult.keyPlaintext || createdKeyResult.keyMasked}
                  </Typography>

                  <Button
                    variant="contained"
                    color="primary"
                    size="small"
                    startIcon={copiedKeyId === createdKeyResult.id ? <CheckOutlined /> : <CopyOutlined />}
                    onClick={() =>
                      handleCopyKey(
                        createdKeyResult.keyPlaintext || createdKeyResult.keyMasked,
                        createdKeyResult.id,
                        createdKeyResult.label
                      )
                    }
                    sx={{ textTransform: 'none', fontWeight: 600, flexShrink: 0, borderRadius: 1 }}
                  >
                    {copiedKeyId === createdKeyResult.id ? 'Copied!' : 'Copy'}
                  </Button>
                </Paper>
              </Box>
            </Stack>
          ) : (
            <Stack spacing={2.5} sx={{ mt: 1, pt: 0.5 }}>
              <TextField
                fullWidth
                label="Key Name / Identifier"
                placeholder="e.g. Worker-GPU-Node-01, Backtest-Scheduler-Daemon"
                value={createLabel}
                onChange={(e) => setCreateLabel(e.target.value)}
                autoFocus
                size="small"
                InputLabelProps={{
                  shrink: true,
                  sx: {
                    color: isDark ? 'grey.300' : 'text.secondary',
                    '&.Mui-focused': { color: 'primary.main' }
                  }
                }}
                helperText="A descriptive human-readable label to identify who or what uses this key."
              />

              <TextField
                fullWidth
                label="Worker Scope Restrictions (Optional)"
                placeholder="e.g. worker-01, gpu-cluster, opt-node-*"
                value={createWorkerRestriction}
                onChange={(e) => setCreateWorkerRestriction(e.target.value)}
                size="small"
                InputLabelProps={{
                  shrink: true,
                  sx: {
                    color: isDark ? 'grey.300' : 'text.secondary',
                    '&.Mui-focused': { color: 'primary.main' }
                  }
                }}
                helperText="Comma-separated scopes or worker names. Leave empty for unrestricted access."
              />
            </Stack>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 1.75, borderTop: '1px solid', borderColor: 'divider' }}>
          {createdKeyResult ? (
            <Button
              variant="contained"
              color="primary"
              onClick={handleCloseCreateModal}
              sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 1.25, px: 3 }}
            >
              Done & Close
            </Button>
          ) : (
            <>
              <Button
                variant="outlined"
                onClick={handleCloseCreateModal}
                disabled={creating}
                sx={{
                  textTransform: 'none',
                  borderRadius: 1.25,
                  fontWeight: 600,
                  color: isDark ? '#ffffff' : 'text.primary',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.35)' : 'grey.300',
                  bgcolor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#ffffff',
                  '&:hover': {
                    color: isDark ? '#ffffff' : 'text.primary',
                    borderColor: isDark ? '#ffffff' : 'text.primary',
                    bgcolor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'grey.100'
                  }
                }}
              >
                Cancel
              </Button>
              <Button
                variant="contained"
                color="primary"
                disabled={!createLabel.trim() || creating}
                onClick={handleCreateNewKey}
                sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 1.25, px: 2.5 }}
              >
                {creating ? 'Generating...' : 'Create Secret Key'}
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      {/* ── 5. CONFIRMATION MODAL: REVOKE KEY ── */}
      <Dialog
        open={confirmModal.open}
        onClose={() => setConfirmModal((prev) => ({ ...prev, open: false }))}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ px: 3, py: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <StopOutlined style={{ color: '#ff4d4f' }} />
            <Typography variant="h5" fontWeight={700}>
              {confirmModal.title}
            </Typography>
          </Stack>
        </DialogTitle>

        <DialogContent sx={{ px: 3, py: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {confirmModal.content}
          </Typography>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 1.75 }}>
          <Button
            variant="outlined"
            onClick={() => setConfirmModal((prev) => ({ ...prev, open: false }))}
            sx={{ textTransform: 'none', borderRadius: 1.25 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color={confirmModal.confirmColor || 'error'}
            onClick={confirmModal.onConfirm}
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 1.25 }}
          >
            {confirmModal.confirmText}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
