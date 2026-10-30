// src/pages/backtest-pages/backtest-tables.jsx - UPDATED

import { useEffect, useState } from 'react';
import { useTheme } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import useSystemLogs from 'hooks/useSystemLogs';
import { useActivityLogs } from 'hooks/useActivityLogs';
import useOrderSync from 'hooks/useOrderSync';
import useDownloadLog from 'hooks/useDownloadLog';
import { getBacktestTables, createBacktestTable, deleteBacktestTable, assignBacktestTableOwner } from 'api/order';
import { getUsers } from 'api/users';
import { clearServerCache } from 'api/Strategy';
import { clearStrategiesCache } from 'hooks/useStrategy';
import { deleteLogsByTable } from 'api/systemLog';
import { removeStoredDashboardSource } from 'utils/dashboardTable';

// MUI
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import LinearProgress from '@mui/material/LinearProgress';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Snackbar from '@mui/material/Snackbar';

// Icons
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import ReloadOutlined from '@ant-design/icons/ReloadOutlined';
import HistoryOutlined from '@ant-design/icons/HistoryOutlined';
import ClearOutlined from '@ant-design/icons/ClearOutlined';
import CheckCircleOutlined from '@ant-design/icons/CheckCircleOutlined';
import WarningOutlined from '@ant-design/icons/WarningOutlined';
import CloseCircleOutlined from '@ant-design/icons/CloseCircleOutlined';
import CloseOutlined from '@ant-design/icons/CloseOutlined';
import DownloadOutlined from '@ant-design/icons/DownloadOutlined';
import DeleteOutlined from '@ant-design/icons/DeleteOutlined';
import UserSwitchOutlined from '@ant-design/icons/UserSwitchOutlined';

// Project
import MainCard from 'components/MainCard';
import Loader from 'components/Loader';
import ActivityHistory from 'components/ActivityHistory';

const getBacktestDisplayName = (key) => {
  // Capitalize first letter and format dynamically
  return key.charAt(0).toUpperCase() + key.slice(1);
};

const getStatusIcon = (status) => {
  switch (status) {
    case 'SUCCESS':
      return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
    case 'WARNING':
      return <WarningOutlined style={{ color: '#faad14' }} />;
    case 'FAILED':
      return <CloseCircleOutlined style={{ color: '#f5222d' }} />;
    default:
      return null;
  }
};

const getStatusColor = (status) => {
  switch (status) {
    case 'SUCCESS':
      return 'success';
    case 'WARNING':
      return 'warning';
    case 'FAILED':
      return 'error';
    default:
      return 'default';
  }
};

const hasDriveSummaryIssues = (summary) => Boolean(
  summary?.invalidFormatCount || summary?.duplicateNameCount || summary?.unexpectedItemCount
);

const DriveSummaryReport = ({ summary }) => {
  const detailGroups = [
    ['Files with invalid names or formats', summary.invalidFiles || []],
    ['Duplicate file names', summary.duplicateGroups || []],
    ['Unexpected files or folders', summary.unexpectedItems || []]
  ];

  return (
    <Box>
      <Grid container spacing={2} sx={{ mt: 1 }}>
        {[
          ['Total Files', summary.totalFiles],
          ['Assets', summary.assetCount],
          ['Asset Folders', summary.folderCount],
          ['Invalid Format', summary.invalidFormatCount],
          ['Duplicate Files', summary.duplicateNameCount],
          ['Unexpected Items', summary.unexpectedItemCount]
        ].map(([label, value]) => (
          <Grid key={label} size={{ xs: 12, sm: 6, md: 3 }}>
            <Typography variant="caption" color="text.secondary">
              {label}
            </Typography>
            <Typography
              variant="h6"
              color={label === 'Invalid Format' || label === 'Duplicate Files' || label === 'Unexpected Items'
                ? Number(value || 0) > 0 ? 'warning.main' : 'success.main'
                : 'text.primary'}
            >
              {Number(value || 0).toLocaleString()}
            </Typography>
          </Grid>
        ))}
      </Grid>

      {(summary.assets || []).length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
            Files by Asset
          </Typography>
          <Grid container spacing={2}>
            {(summary.assets || []).map((asset) => (
              <Grid key={asset.folderName} size={{ xs: 6, sm: 4, md: 3 }}>
                <Typography variant="caption" color="text.secondary">
                  {asset.symbol || asset.folderName || 'Unknown'}
                </Typography>
                <Typography variant="h6">{Number(asset.totalFiles || 0).toLocaleString()}</Typography>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {detailGroups.map(([title, items]) =>
        items.length > 0 ? (
          <Box key={title} sx={{ mt: 2 }}>
            <Typography variant="subtitle2" color="warning.main" gutterBottom>
              {title} ({items.length})
            </Typography>
            {items.slice(0, 30).map((item, index) => (
              <Typography key={`${title}-${item.id || item.name}-${index}`} variant="body2" color="text.secondary">
                {index + 1}. {item.name} - {item.reason || item.paths?.join(', ')}
              </Typography>
            ))}
            {items.length > 30 && (
              <Typography variant="caption" color="text.secondary">
                And {items.length - 30} more items.
              </Typography>
            )}
          </Box>
        ) : null
      )}
    </Box>
  );
};

export default function BacktestOverviewPage() {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const navigate = useNavigate();
  const { logs, loading, fetchLatestBacktestLogs } = useSystemLogs();
  const [autoRefresh] = useState(true);
  const [selectedTable, setSelectedTable] = useState(''); // Will be set after tables load

  // ─── DYNAMIC TABLE MANAGEMENT ──────────────────────────────────────────────────
  const [backtestTables, setBacktestTables] = useState([]);
  const [backtestSources, setBacktestSources] = useState([]);
  const [loadingTables, setLoadingTables] = useState(true);
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [createTableError, setCreateTableError] = useState('');
  const [creatingTable, setCreatingTable] = useState(false);
  const [, setDeletingTable] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [tableToDelete, setTableToDelete] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [deleteLogConfirmOpen, setDeleteLogConfirmOpen] = useState(false);
  const [logTableToDelete, setLogTableToDelete] = useState('');
  const [ownerDialogOpen, setOwnerDialogOpen] = useState(false);
  const [ownerTable, setOwnerTable] = useState('');
  const [ownerUserId, setOwnerUserId] = useState('');
  const [ownerUsers, setOwnerUsers] = useState([]);
  const [loadingOwnerUsers, setLoadingOwnerUsers] = useState(false);
  const [savingOwner, setSavingOwner] = useState(false);
  const [ownerError, setOwnerError] = useState('');
  const [isAdmin] = useState(() => {
    try {
      const stored = localStorage.getItem('user');
      const parsed = stored ? JSON.parse(stored) : null;
      const role = String(parsed?.role || '').toLowerCase();
      const roles = Array.isArray(parsed?.roles) ? parsed.roles.map((item) => String(item).toLowerCase()) : [];
      return role === 'admin' || roles.some((item) => item.includes('admin'));
    } catch {
      return false;
    }
  });

  // Fetch activity logs for selected table
  const { logs: activityLogs, loading: activityLoading, refetch: refetchActivityLogs } = useActivityLogs(selectedTable);

  // ─── SYNC STATE ────────────────────────────────────────────────────────────
  const [syncMode, setSyncMode] = useState('NEW_RUN');
  const [driveLink, setDriveLink] = useState('');
  const [targetTable, setTargetTable] = useState('all_backtests');
  const [sheetName, setSheetName] = useState('');
  const [syncReport, setSyncReport] = useState(null);
  const [showSyncReport, setShowSyncReport] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncMessage, setSyncMessage] = useState('');

  const { syncAsync, cancelSync, syncing, stopping, canCancel, progress, currentFile, stats } = useOrderSync();
  const { downloadLog } = useDownloadLog();

  const handleDownloadLog = async (type, syncId = syncReport?.syncId) => {
    try {
      await downloadLog(type, syncId);
    } catch (err) {
      setSnackbar({ open: true, message: `Không thể tải file ${type}.txt: ${err.message}`, severity: 'error' });
    }
  };

  const SYNC_REPORT_KEY = `syncReport_${targetTable}`;

  // ✅ KHÔI PHỤC SYNC REPORT TỪ SESSIONSTORAGE KHI COMPONENT MOUNT
  useEffect(() => {
    const savedReport = sessionStorage.getItem(SYNC_REPORT_KEY);
    if (savedReport) {
      try {
        const report = JSON.parse(savedReport);
        const reportTime = new Date(report.timestamp).getTime();
        const now = Date.now();
        const TEN_MINUTES = 10 * 60 * 1000;
        if (now - reportTime < TEN_MINUTES) {
          setSyncReport(report);
          setShowSyncReport(true);
        } else {
          sessionStorage.removeItem(SYNC_REPORT_KEY);
        }
      } catch (err) {
        console.error('Failed to parse sync report:', err);
        sessionStorage.removeItem(SYNC_REPORT_KEY);
      }
    }
  }, [SYNC_REPORT_KEY]);

  // ✅ LOAD BACKTEST TABLES FROM API
  useEffect(() => {
    const loadTables = async () => {
      try {
        setLoadingTables(true);
        const response = await getBacktestTables();
        const tables = response.tables || [];
        setBacktestTables(tables);
        setBacktestSources(response.sources || []);
        // Set first table as default selected table
        if (tables.length > 0 && !selectedTable) {
          setSelectedTable(tables[0]);
        }
      } catch (error) {
        console.error('Failed to load backtest tables:', error);
        // Fallback to empty array if API fails
        setBacktestTables([]);
      } finally {
        setLoadingTables(false);
      }
    };

    loadTables();
  }, []);

  useEffect(() => {
    if (syncing) {
      setSyncProgress(progress || 0);
      if (currentFile) {
        setSyncMessage(`📄 Đang xử lý: ${currentFile}${stats ? ` (${stats.processed}/${stats.total})` : ''}`);
      } else if (!progress || progress < 10) {
        setSyncMessage('🔍 Đang khởi tạo...');
      } else if (progress < 100) {
        setSyncMessage(`💾 Đang đồng bộ... ${progress}%`);
      }
    } else if (!syncing) {
      setSyncProgress(0);
      setSyncMessage('');
    }
  }, [syncing, progress, currentFile, stats]);

  // ─── TABLE MANAGEMENT HANDLERS ─────────────────────────────────────────────────
  const handleTargetTableChange = (event) => {
    const value = event.target.value;

    if (value === '__CREATE_NEW__') {
      setOpenCreateDialog(true);
      setNewTableName('');
      setCreateTableError('');
    } else {
      setTargetTable(value);
    }
  };

  const handleCloseCreateDialog = () => {
    setOpenCreateDialog(false);
    setNewTableName('');
    setCreateTableError('');
  };

  const handleDeleteTable = (tableName, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setTableToDelete(tableName);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    const target = tableToDelete;
    setDeleteConfirmOpen(false);
    if (!target) {
      console.error('❌ Table name to delete is empty!');
      return;
    }

    try {
      setDeletingTable(target);
      let res;
      try {
        res = await deleteBacktestTable(target);
      } catch (apiErr) {
        console.error('❌ deleteBacktestTable API threw error:', apiErr.message || apiErr);
        throw apiErr;
      }

      await clearServerCache();
      clearStrategiesCache();
      removeStoredDashboardSource(target);
      window.dispatchEvent(new CustomEvent('dashboard:data-changed'));

      const tablesResponse = await getBacktestTables();
      const tables = tablesResponse.tables || [];
      setBacktestTables(tables);
      setBacktestSources(tablesResponse.sources || []);
      if (targetTable === target) {
        setTargetTable('all_backtests');
        localStorage.removeItem('lotusquant.dashboard.selectedTable');
      }
      setSnackbar({ open: true, message: `Đã xóa thành công bảng "${target}"!`, severity: 'success' });
    } catch (error) {
      console.error('❌ Error deleting table:', error);
      setSnackbar({ open: true, message: error.message || 'Failed to delete table', severity: 'error' });
    } finally {
      setDeletingTable('');
      setTableToDelete('');
    }
  };

  const handleDeleteLog = (tableName, e) => {
    e.stopPropagation();
    setLogTableToDelete(tableName);
    setDeleteLogConfirmOpen(true);
  };

  const handleConfirmDeleteLog = async () => {
    setDeleteLogConfirmOpen(false);
    try {
      await deleteLogsByTable(logTableToDelete);
      setSnackbar({ open: true, message: `Đã xóa logs của "${logTableToDelete}"`, severity: 'success' });
      await fetchLatestBacktestLogs();
    } catch (error) {
      setSnackbar({ open: true, message: error.message || 'Failed to delete logs', severity: 'error' });
    } finally {
      setLogTableToDelete('');
    }
  };

  const handleCreateNewTable = async () => {
    try {
      setCreateTableError('');

      // Validate table name
      if (!newTableName) {
        setCreateTableError('Please enter a table name');
        return;
      }

      // Validate format: must start with "backtest" followed by alphanumeric/underscore
      if (!/^backtest[a-z0-9_]*$/i.test(newTableName)) {
        setCreateTableError("Table name must start with 'backtest' followed by letters, numbers, or underscores");
        return;
      }

      setCreatingTable(true);

      const response = await createBacktestTable(newTableName);

      if (response.success) {
        // Reload tables list
        const tablesResponse = await getBacktestTables();
        setBacktestTables(tablesResponse.tables || []);
        setBacktestSources(tablesResponse.sources || []);

        // Set the new table as selected
        setTargetTable(newTableName);
        setOpenCreateDialog(false);
        setNewTableName('');
        setSnackbar({ open: true, message: `Tạo bảng "${newTableName}" thành công!`, severity: 'success' });
      }
    } catch (error) {
      console.error('Failed to create table:', error);
      setCreateTableError(error.message || 'Failed to create table');
    } finally {
      setCreatingTable(false);
    }
  };

  const handleSyncAction = async () => {
    if (!driveLink) {
      setSnackbar({ open: true, message: 'Vui lòng nhập Google Drive link', severity: 'warning' });
      return;
    }
    if (syncMode === 'UPDATE' && !sheetName) {
      setSnackbar({ open: true, message: 'Vui lòng nhập Sheet Name cho UPDATE mode', severity: 'warning' });
      return;
    }
    try {
      let strategyArray = [];
      if (syncMode === 'UPDATE' && sheetName) {
        strategyArray = sheetName
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
      }
      const payload = {
        tableName: targetTable,
        runType: syncMode,
        driveFolderUrl: driveLink,
        strategyArr: strategyArray
      };
      const res = await syncAsync(payload);
      if (syncMode === 'SUMMARY') {
        const reportWithTimestamp = { ...res, timestamp: new Date().toISOString() };
        sessionStorage.setItem(SYNC_REPORT_KEY, JSON.stringify(reportWithTimestamp));
        setSyncReport(reportWithTimestamp);
        setShowSyncReport(true);
        return;
      }
      if (res.notFoundStrategies && res.notFoundStrategies.length > 0) {
        const reportWithWarning = {
          ...res,
          timestamp: new Date().toISOString(),
          hasWarning: true,
          warningMessage: res.warning || 'Some strategies were not found in the Drive folder.'
        };
        sessionStorage.setItem(SYNC_REPORT_KEY, JSON.stringify(reportWithWarning));
        setSyncReport(reportWithWarning);
        setShowSyncReport(true);
      } else {
        const reportWithTimestamp = { ...res, timestamp: new Date().toISOString() };
        sessionStorage.setItem(SYNC_REPORT_KEY, JSON.stringify(reportWithTimestamp));
        setSyncReport(reportWithTimestamp);
        setShowSyncReport(true);
      }
      // Refresh bảng logs sau khi sync xong
      fetchLatestBacktestLogs();
    } catch (err) {
      const stopped = err.message === 'Sync stopped by user';
      const errorReport = { error: err.message, stopped, mode: syncMode, timestamp: new Date().toISOString() };
      sessionStorage.setItem(SYNC_REPORT_KEY, JSON.stringify(errorReport));
      setSyncReport(errorReport);
      setShowSyncReport(true);
    }
  };

  const closeSyncReport = () => {
    setShowSyncReport(false);
    setSyncReport(null);
    sessionStorage.removeItem(SYNC_REPORT_KEY);
  };

  const handleStopSync = async () => {
    try {
      await cancelSync();
      setSnackbar({ open: true, message: 'Stop request sent. Stopping active workers...', severity: 'warning' });
    } catch (error) {
      setSnackbar({ open: true, message: error.message || 'Failed to stop sync', severity: 'error' });
    }
  };
  // ───────────────────────────────────────────────────────────────────────────

  // Set page title
  useEffect(() => {
    document.title = 'Backtest Tables | Backtest';
  }, []);

  useEffect(() => {
    fetchLatestBacktestLogs();
  }, [fetchLatestBacktestLogs]);

  // Auto-refresh mỗi
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchLatestBacktestLogs();
    }, 30000000);

    return () => clearInterval(interval);
  }, [autoRefresh, fetchLatestBacktestLogs]);

  const handleRefresh = () => {
    fetchLatestBacktestLogs();
    refetchActivityLogs(); // Also refresh activity logs
  };

  const handleBacktestClick = (backtestName) => {
    // Navigate to order-list with targetTable parameter
    navigate(`/order-list?table=${backtestName}`);
  };

  const handleOpenOwnerDialog = async (tableName) => {
    if (!isAdmin) return;
    const source = backtestSources.find(
      (item) => String(item.source_name || '').toLowerCase() === String(tableName || '').toLowerCase()
    );
    setOwnerTable(tableName);
    setOwnerUserId(source?.owner_user_id == null ? '' : String(source.owner_user_id));
    setOwnerError('');
    setOwnerDialogOpen(true);

    if (ownerUsers.length) return;
    try {
      setLoadingOwnerUsers(true);
      const response = await getUsers();
      setOwnerUsers(Array.isArray(response?.data) ? response.data : []);
    } catch (error) {
      setOwnerError(error.message || 'Không thể tải danh sách tài khoản');
    } finally {
      setLoadingOwnerUsers(false);
    }
  };

  const handleCloseOwnerDialog = () => {
    if (savingOwner) return;
    setOwnerDialogOpen(false);
    setOwnerTable('');
    setOwnerUserId('');
    setOwnerError('');
  };

  const handleAssignOwner = async () => {
    if (!ownerTable || !ownerUserId) {
      setOwnerError('Vui lòng chọn tài khoản nhận bảng');
      return;
    }
    try {
      setSavingOwner(true);
      setOwnerError('');
      const response = await assignBacktestTableOwner(ownerTable, ownerUserId);
      const updatedSource = response.source;
      if (updatedSource) {
        setBacktestSources((current) =>
          current.map((item) =>
            String(item.source_name).toLowerCase() === String(updatedSource.source_name).toLowerCase() ? updatedSource : item
          )
        );
      }
      const selectedUser = ownerUsers.find((user) => String(user.id) === String(ownerUserId));
      setSnackbar({
        open: true,
        message: `Đã chuyển bảng "${ownerTable}" cho ${selectedUser?.username || selectedUser?.email || `User ${ownerUserId}`}`,
        severity: 'success'
      });
      setOwnerDialogOpen(false);
      setOwnerTable('');
      setOwnerUserId('');
    } catch (error) {
      setOwnerError(error.message || 'Không thể chuyển owner');
    } finally {
      setSavingOwner(false);
    }
  };

  return (
    <Grid container spacing={3}>
      {/* DATA SYNCHRONIZATION CENTER */}
      <Grid size={12}>
        <MainCard title="Data Synchronization Center">
          <Grid container spacing={3} alignItems="flex-end">
            <Grid size={{ xs: 12, sm: 6, md: 2 }}>
              <FormControl fullWidth variant="outlined">
                <InputLabel
                  shrink
                  sx={{
                    color: isDarkMode ? 'rgba(255, 255, 255, 0.75)' : 'text.secondary',
                    '&.Mui-focused': { color: 'primary.main' }
                  }}
                >
                  Target Database Table
                </InputLabel>
                <Select
                  fullWidth
                  value={targetTable}
                  onChange={handleTargetTableChange}
                  notched
                  disabled={loadingTables || syncMode === 'SUMMARY'}
                  renderValue={(value) => (value === 'all_backtests' ? 'All Backtest' : value)}
                  sx={{
                    color: isDarkMode ? '#ffffff' : 'text.primary',
                    '.MuiOutlinedInput-notchedOutline': {
                      borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.23)' : 'rgba(0, 0, 0, 0.23)'
                    }
                  }}
                >
                  <MenuItem value="all_backtests">All Backtest</MenuItem>
                  {backtestTables.map((table) => (
                    <MenuItem key={table} value={table}>
                      {table}
                    </MenuItem>
                  ))}
                  <MenuItem
                    value="__CREATE_NEW__"
                    sx={{
                      fontWeight: 'bold',
                      '&:hover': { backgroundColor: 'action.hover' }
                    }}
                  >
                    <PlusOutlined style={{ marginRight: 8, fontSize: 18, color: '#1890ff' }} />
                    <span style={{ color: isDarkMode ? '#fff' : '#000' }}>Create New Backtest</span>
                  </MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <TextField
                fullWidth
                label="Google Drive / Sheet Folder URL"
                value={driveLink}
                onChange={(e) => setDriveLink(e.target.value)}
                placeholder="Paste your Drive link here..."
                InputLabelProps={{ shrink: true }}
                disabled={targetTable === 'all_backtests' && syncMode !== 'SUMMARY'}
                sx={{
                  '&& .MuiInputLabel-root': {
                    color: isDarkMode ? 'rgba(255, 255, 255, 0.75)' : undefined
                  },
                  '&& .MuiInputLabel-root.Mui-disabled': {
                    color: isDarkMode ? 'rgba(255, 255, 255, 0.45)' : undefined
                  },
                  '&& .MuiFormLabel-root': {
                    color: isDarkMode ? 'rgba(255, 255, 255, 0.75)' : undefined
                  },
                  '&& .MuiFormLabel-root.Mui-disabled': {
                    color: isDarkMode ? 'rgba(255, 255, 255, 0.45)' : undefined
                  },
                  '&& .MuiInputBase-input': {
                    color: isDarkMode ? '#ffffff' : undefined,
                    WebkitTextFillColor: isDarkMode ? '#ffffff' : undefined
                  },
                  '&& .MuiInputBase-input.Mui-disabled': {
                    color: isDarkMode ? 'rgba(255, 255, 255, 0.45)' : undefined,
                    WebkitTextFillColor: isDarkMode ? 'rgba(255, 255, 255, 0.45)' : undefined
                  },
                  '&& .MuiOutlinedInput-notchedOutline': {
                    borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.23)' : undefined
                  },
                  '&& .MuiOutlinedInput-root.Mui-disabled .MuiOutlinedInput-notchedOutline': {
                    borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.15)' : undefined
                  }
                }}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Grid container spacing={1}>
                <Grid size={4}>
                  <FormControl
                    fullWidth
                    sx={{
                      '& .MuiInputLabel-root': {
                        color: isDarkMode ? 'rgba(255, 255, 255, 0.75) !important' : 'text.secondary'
                      },
                      '& .MuiInputLabel-root.Mui-disabled': {
                        color: isDarkMode ? 'rgba(255, 255, 255, 0.45) !important' : 'rgba(0, 0, 0, 0.38)'
                      }
                    }}
                  >
                    <InputLabel shrink>
                      Mode
                    </InputLabel>
                    <Select
                      value={syncMode}
                      onChange={(e) => setSyncMode(e.target.value)}
                      notched
                      sx={{
                        color: isDarkMode ? '#ffffff' : 'text.primary',
                        '.MuiOutlinedInput-notchedOutline': {
                          borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.23)' : 'rgba(0, 0, 0, 0.23)'
                        },
                        '&.Mui-disabled': {
                          color: isDarkMode ? 'rgba(255, 255, 255, 0.45) !important' : 'rgba(0, 0, 0, 0.38)',
                          WebkitTextFillColor: isDarkMode ? 'rgba(255, 255, 255, 0.45) !important' : 'rgba(0, 0, 0, 0.38)'
                        }
                      }}
                    >
                      <MenuItem value="NEW_RUN">NEW RUN</MenuItem>
                      <MenuItem value="UPDATE">UPDATE</MenuItem>
                      <MenuItem value="SUMMARY">SUMMARY</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={8}>
                  <TextField
                    fullWidth
                    label="Sheet Name"
                    value={sheetName}
                    onChange={(e) => setSheetName(e.target.value)}
                    disabled={syncMode !== 'UPDATE' || targetTable === 'all_backtests'}
                    placeholder={syncMode === 'UPDATE' ? 'Enter...' : '---'}
                    InputLabelProps={{ shrink: true }}
                    sx={{
                      '&& .MuiInputLabel-root': {
                        color: isDarkMode ? 'rgba(255, 255, 255, 0.75)' : undefined
                      },
                      '&& .MuiInputLabel-root.Mui-disabled': {
                        color: isDarkMode ? 'rgba(255, 255, 255, 0.45)' : undefined
                      },
                      '&& .MuiFormLabel-root': {
                        color: isDarkMode ? 'rgba(255, 255, 255, 0.75)' : undefined
                      },
                      '&& .MuiFormLabel-root.Mui-disabled': {
                        color: isDarkMode ? 'rgba(255, 255, 255, 0.45)' : undefined
                      },
                      '&& .MuiInputBase-input': {
                        color: isDarkMode ? '#ffffff' : undefined,
                        WebkitTextFillColor: isDarkMode ? '#ffffff' : undefined
                      },
                      '&& .MuiInputBase-input.Mui-disabled': {
                        color: isDarkMode ? 'rgba(255, 255, 255, 0.45)' : undefined,
                        WebkitTextFillColor: isDarkMode ? 'rgba(255, 255, 255, 0.45)' : undefined
                      },
                      '&& .MuiOutlinedInput-notchedOutline': {
                        borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.23)' : undefined
                      },
                      '&& .MuiOutlinedInput-root.Mui-disabled .MuiOutlinedInput-notchedOutline': {
                        borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.15)' : undefined
                      }
                    }}
                  />
                </Grid>
              </Grid>
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Stack direction="row" spacing={1}>
                <Button
                  fullWidth
                  variant="contained"
                  size="medium"
                  color="primary"
                  startIcon={<ReloadOutlined />}
                  onClick={handleSyncAction}
                  disabled={syncing || (targetTable === 'all_backtests' && syncMode !== 'SUMMARY')}
                >
                  {syncing ? (syncMode === 'SUMMARY' ? 'Checking...' : 'Syncing...') : syncMode === 'SUMMARY' ? 'Check Summary' : 'Start Sync'}
                </Button>
                {syncing && syncMode !== 'SUMMARY' && (
                  <Button
                    variant="contained"
                    color="error"
                    size="medium"
                    startIcon={<CloseOutlined />}
                    onClick={handleStopSync}
                    disabled={stopping || !canCancel}
                    sx={{ whiteSpace: 'nowrap', minWidth: 128 }}
                  >
                    {stopping ? 'Stopping...' : 'Stop Now'}
                  </Button>
                )}
              </Stack>
            </Grid>
          </Grid>

          {/* ⚠️ NOTE nhỏ gọn - chỉ hiện khi đang sync */}
          <Grid size={12}>
            <Collapse in={syncing}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                  px: 1.5,
                  py: 0.75,
                  mb: 1,
                  backgroundColor: isDarkMode ? 'rgba(255, 254, 240, 0.05)' : '#fffef0',
                  borderLeft: '3px solid',
                  borderColor: isDarkMode ? 'warning.main' : '#ffd666',
                  borderRadius: 0.5
                }}
              >
                <WarningOutlined style={{ color: '#faad14', fontSize: '14px' }} />
                <Typography variant="caption" sx={{ color: isDarkMode ? 'warning.main' : '#ad8b00', fontWeight: 400 }}>
                  {syncMode === 'SUMMARY'
                    ? 'Đang kiểm tra cấu trúc ngoài của Google Drive. Không có dữ liệu nào được ghi vào database.'
                    : 'Vui lòng không chuyển sang mục khác trong lúc đồng bộ để đảm bảo dữ liệu được xử lý chính xác.'}
                </Typography>
              </Box>
            </Collapse>
          </Grid>

          {/* LOADING PROGRESS BAR */}
          <Grid size={12}>
            <Collapse in={syncing}>
              <Box sx={{ mt: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <Box sx={{ minWidth: 45 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                      {syncProgress > 0 ? `${Math.round(syncProgress)}%` : '...'}
                    </Typography>
                  </Box>
                  <Box sx={{ width: '100%', ml: 2 }}>
                    <LinearProgress
                      variant={syncProgress > 0 ? 'determinate' : 'indeterminate'}
                      value={syncProgress}
                      sx={{
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
                        '& .MuiLinearProgress-bar': {
                          borderRadius: 5,
                          backgroundColor: 'primary.main'
                        },
                        '& .MuiLinearProgress-bar1Indeterminate': {
                          backgroundColor: 'primary.main'
                        },
                        '& .MuiLinearProgress-bar2Indeterminate': {
                          backgroundColor: 'primary.light'
                        }
                      }}
                    />
                  </Box>
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {syncMessage}
                </Typography>
              </Box>
            </Collapse>
          </Grid>
        </MainCard>
      </Grid>

      {/* SYNC REPORT PANEL */}
      <Grid size={12}>
        <Collapse in={showSyncReport}>
          {syncReport && (
            <Alert
              severity={
                syncReport.stopped
                  ? 'warning'
                  : syncReport.error
                  ? 'error'
                  : syncReport.mode === 'SUMMARY' && hasDriveSummaryIssues(syncReport.summary)
                    ? 'warning'
                    : syncReport.notFoundStrategies?.length > 0
                      ? 'warning'
                      : 'success'
              }
              icon={
                syncReport.stopped ? (
                  <WarningOutlined />
                ) : syncReport.error ? (
                  <CloseCircleOutlined />
                ) : syncReport.mode === 'SUMMARY' && hasDriveSummaryIssues(syncReport.summary) ? (
                  <WarningOutlined />
                ) : syncReport.notFoundStrategies?.length > 0 ? (
                  <WarningOutlined />
                ) : (
                  <CheckCircleOutlined />
                )
              }
              action={
                <IconButton aria-label="close" color="inherit" size="small" onClick={closeSyncReport}>
                  <CloseOutlined />
                </IconButton>
              }
              sx={{ mb: 2 }}
            >
              <AlertTitle>
                {syncReport.stopped
                  ? 'Synchronization Stopped'
                  : syncReport.error
                  ? syncReport.mode === 'SUMMARY' ? 'Drive Summary Failed' : 'Synchronization Failed'
                  : syncReport.mode === 'SUMMARY'
                    ? 'Drive Summary Completed'
                    : 'Synchronization Completed'}
              </AlertTitle>

              {syncReport.error ? (
                <Typography variant="body2">{syncReport.error}</Typography>
              ) : syncReport.mode === 'SUMMARY' ? (
                <DriveSummaryReport summary={syncReport.summary || {}} />
              ) : (
                <Box>
                  {(!syncReport.notFoundStrategies || syncReport.stats?.success > 0) && (
                    <>
                      {syncReport.statsBefore && (
                        <Box sx={{ mb: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                            📊 Before Sync:
                          </Typography>
                          <Grid container spacing={1}>
                            <Grid size={6}>
                              <Typography variant="body2">
                                Total Rows: <strong>{syncReport.statsBefore.totalRows.toLocaleString()}</strong>
                              </Typography>
                            </Grid>
                            <Grid size={6}>
                              <Typography variant="body2">
                                Strategies: <strong>{syncReport.statsBefore.strategyIds}</strong>
                              </Typography>
                            </Grid>
                          </Grid>
                        </Box>
                      )}

                      <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                          <Typography variant="caption" color="text.secondary">
                            Total Files
                          </Typography>
                          <Typography variant="h6">{syncReport.stats?.total || 0}</Typography>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                          <Typography variant="caption" color="text.secondary">
                            Unique Names
                          </Typography>
                          <Typography variant="h6">{syncReport.stats?.unique || 0}</Typography>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                          <Typography variant="caption" color="text.secondary">
                            Success
                          </Typography>
                          <Typography variant="h6" color="success.main">
                            {syncReport.stats?.success || 0}
                          </Typography>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                          <Typography variant="caption" color="text.secondary">
                            Failed
                          </Typography>
                          <Typography variant="h6" color="error.main">
                            {syncReport.stats?.failed || 0}
                          </Typography>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                          <Typography variant="caption" color="text.secondary">
                            Total Rows in DB
                          </Typography>
                          <Typography variant="h6">{syncReport.stats?.totalRows?.toLocaleString() || 0}</Typography>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                          <Typography variant="caption" color="text.secondary">
                            Strategy IDs
                          </Typography>
                          <Typography variant="h6">{syncReport.stats?.strategyIds || 0}</Typography>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                          <Typography variant="caption" color="text.secondary">
                            Duration
                          </Typography>
                          <Typography variant="h6">
                            {syncReport.durationMs ? `${(syncReport.durationMs / 1000).toFixed(1)}s` : '-'}
                          </Typography>
                        </Grid>
                      </Grid>

                      {(syncReport.stats?.duplicates > 0 || syncReport.stats?.errors > 0 || syncReport.logFiles?.hasNotFound) && (
                        <Box sx={{ mt: 2 }}>
                          <Divider sx={{ my: 1 }} />
                          <Stack spacing={1}>
                            {syncReport.stats?.duplicates > 0 && (
                              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <WarningOutlined style={{ color: '#ff9800' }} />
                                  <Typography variant="body2">
                                    <strong>{syncReport.stats.duplicates}</strong> duplicate files found
                                  </Typography>
                                </Box>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  color="warning"
                                  startIcon={<DownloadOutlined />}
                                  onClick={() => handleDownloadLog('duplicate')}
                                >
                                  Download duplicate.txt
                                </Button>
                              </Box>
                            )}
                            {syncReport.stats?.errors > 0 && (
                              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <CloseCircleOutlined style={{ color: '#f44336' }} />
                                  <Typography variant="body2">
                                    <strong>{syncReport.stats.errors}</strong> files failed
                                  </Typography>
                                </Box>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  color="error"
                                  startIcon={<DownloadOutlined />}
                                  onClick={() => handleDownloadLog('error')}
                                >
                                  Download error.txt
                                </Button>
                              </Box>
                            )}
                            {syncReport.logFiles?.hasNotFound && syncReport.notFoundStrategies?.length > 0 && (
                              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <WarningOutlined style={{ color: '#9c27b0' }} />
                                  <Typography variant="body2">
                                    <strong>{syncReport.notFoundStrategies?.length || 0}</strong> strategies not found in Drive
                                  </Typography>
                                </Box>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  color="secondary"
                                  startIcon={<DownloadOutlined />}
                                  onClick={() => handleDownloadLog('notfound')}
                                >
                                  Download notfound.txt
                                </Button>
                              </Box>
                            )}
                          </Stack>
                        </Box>
                      )}
                    </>
                  )}
                </Box>
              )}
            </Alert>
          )}
        </Collapse>
      </Grid>

      {/* TITLE & ACTIONS */}
      <Grid size={12}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="h4" fontWeight={600}>
              Backtest Information
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Current database totals and latest sync status
            </Typography>
          </Box>

          <Button variant="outlined" startIcon={<ReloadOutlined />} onClick={handleRefresh} disabled={loading}>
            Refresh
          </Button>
        </Box>
      </Grid>

      {/* TABLE */}
      <Grid size={12}>
        <MainCard sx={{ width: '100%' }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <Loader />
            </Box>
          ) : (
            <TableContainer component={Paper} sx={{ boxShadow: 'none' }}>
              <Table sx={{ minWidth: 1500 }}>
                <TableHead>
                  <TableRow sx={{ backgroundColor: isDarkMode ? '#1f1f1f' : '#fafafa' }}>
                    <TableCell>Backtest</TableCell>
                    <TableCell>Owner</TableCell>
                    <TableCell align="center">Last Status</TableCell>
                    <TableCell align="center">Total Files</TableCell>
                    <TableCell align="center">Unique Names</TableCell>
                    <TableCell align="center">Last Success</TableCell>
                    <TableCell align="center">Last Failed</TableCell>
                    <TableCell align="center">Warning</TableCell>
                    <TableCell align="center">Total Rows In DB</TableCell>
                    <TableCell align="center">Total Strategies</TableCell>
                    <TableCell align="center">Last Duration</TableCell>
                    <TableCell align="center">Last Upload</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {(() => {
                    const logsByTable = new Map(
                      (logs || []).map((row) => [String(row.backtest || '').toLowerCase(), row])
                    );
                    const visibleRows = backtestTables.length
                      ? backtestTables.map((table) => logsByTable.get(String(table).toLowerCase()) || {
                          backtest: table,
                          status: 'NO DATA',
                          totalFiles: '-',
                          uniqueNames: '-',
                          success: '-',
                          failed: '-',
                          warning: '-'
                        })
                      : (logs || []);
                    if (!visibleRows.length) {
                      return (
                        <TableRow>
                          <TableCell colSpan={13} align="center">
                            <Typography variant="body1" color="text.secondary">
                              No sync data available
                            </Typography>
                          </TableCell>
                        </TableRow>
                      );
                    }
                    return visibleRows.map((row) => (
                      <TableRow key={row.backtest} hover>
                        <TableCell>
                          <Typography
                            fontWeight={600}
                            sx={{
                              cursor: 'pointer',
                              color: 'primary.main',
                              textDecoration: 'underline',
                              '&:hover': {
                                color: 'primary.dark'
                              }
                            }}
                            onClick={() => handleBacktestClick(row.backtest)}
                          >
                            {getBacktestDisplayName(row.backtest)}
                          </Typography>
                        </TableCell>

                        <TableCell>
                          <Typography variant="body2" fontWeight={500}>
                            {row.ownerUsername || row.ownerEmail || 'Unassigned'}
                          </Typography>
                          {row.ownerUsername && row.ownerEmail && (
                            <Typography variant="caption" color="text.secondary" display="block">
                              {row.ownerEmail}
                            </Typography>
                          )}
                        </TableCell>

                        <TableCell align="center">
                          <Chip
                            icon={getStatusIcon(row.status)}
                            label={row.status}
                            color={getStatusColor(row.status)}
                            size="small"
                            variant="outlined"
                          />
                        </TableCell>

                        <TableCell align="center">{row.totalFiles}</TableCell>
                        <TableCell align="center">{row.uniqueNames}</TableCell>

                        <TableCell align="center" sx={{ color: 'success.main', fontWeight: 600 }}>
                          {row.success}
                        </TableCell>

                        <TableCell align="center" sx={{ color: 'error.main', fontWeight: 600 }}>
                          {row.failed}
                        </TableCell>

                        <TableCell align="center" sx={{ color: 'warning.main', fontWeight: 600 }}>
                          {row.warning}
                        </TableCell>

                        <TableCell align="center" sx={{ color: 'info.main', fontWeight: 600 }}>
                          {row.totalRowsInDB ? row.totalRowsInDB.toLocaleString() : '-'}
                        </TableCell>

                        <TableCell align="center">
                          <Typography variant="body2" sx={{ color: '#1890ff', fontWeight: 600 }}>
                            {row.strategyIds ? row.strategyIds.toLocaleString() : '-'}
                          </Typography>
                        </TableCell>

                        <TableCell align="center">
                          <Typography variant="body2">{row.duration ? `${(row.duration / 1000).toFixed(1)}s` : '-'}</Typography>
                        </TableCell>

                        <TableCell align="center">
                          <Typography variant="body2">{row.lastUpload ? new Date(row.lastUpload).toLocaleString('vi-VN') : '-'}</Typography>
                        </TableCell>

                        <TableCell align="center">
                          {isAdmin && (
                            <Tooltip title="Chuyển owner">
                              <IconButton size="small" color="primary" onClick={() => handleOpenOwnerDialog(row.backtest)}>
                                <UserSwitchOutlined />
                              </IconButton>
                            </Tooltip>
                          )}
                          <Tooltip title="Xem Activity Logs">
                            <IconButton
                              size="small"
                              color={selectedTable === row.backtest ? 'primary' : 'default'}
                              onClick={() => setSelectedTable(row.backtest)}
                            >
                              <HistoryOutlined />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Xóa logs lịch sử">
                            <IconButton size="small" color="warning" onClick={(e) => handleDeleteLog(row.backtest, e)}>
                              <ClearOutlined style={{ color: '#faad14' }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Xóa vĩnh viễn Bảng & Dữ liệu trong Database">
                            <IconButton size="small" color="error" onClick={(e) => handleDeleteTable(row.backtest, e)}>
                              <DeleteOutlined style={{ color: '#f5222d' }} />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ));
                  })()}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </MainCard>
      </Grid>

      {/* ACTIVITY HISTORY */}
      <Grid size={12}>
        <ActivityHistory logs={activityLogs} loading={activityLoading} onDownloadIssue={handleDownloadLog} />
      </Grid>

      {/* CREATE NEW TABLE DIALOG */}
      <Dialog open={openCreateDialog} onClose={handleCloseCreateDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PlusOutlined style={{ color: '#1a69c4', fontSize: 24 }} />
            <Typography variant="h4">Create New Backtest Table</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <TextField
              fullWidth
              autoFocus
              label="Table Name"
              value={newTableName}
              onChange={(e) => setNewTableName(e.target.value.toLowerCase())}
              placeholder="e.g., backtestusd, backtest_oil, backtest2024"
              error={!!createTableError}
              helperText={createTableError || "Must start with 'backtest' followed by letters, numbers, or underscores"}
              disabled={creatingTable}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && newTableName && !creatingTable) {
                  handleCreateNewTable();
                }
              }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleCloseCreateDialog} disabled={creatingTable} color="inherit">
            Cancel
          </Button>
          <Button
            onClick={handleCreateNewTable}
            variant="contained"
            color="primary"
            disabled={creatingTable || !newTableName}
            startIcon={creatingTable ? null : <PlusOutlined />}
          >
            {creatingTable ? 'Creating...' : 'Create Table'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ASSIGN OWNER DIALOG */}
      <Dialog open={ownerDialogOpen} onClose={handleCloseOwnerDialog} maxWidth="xs" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <UserSwitchOutlined style={{ color: '#1890ff', fontSize: 22 }} />
            <Typography variant="h4">Chuyển owner</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Bảng: <strong>{ownerTable}</strong>
            </Typography>
            <FormControl fullWidth error={Boolean(ownerError)} disabled={loadingOwnerUsers || savingOwner}>
              <InputLabel id="backtest-owner-label">Tài khoản sở hữu</InputLabel>
              <Select
                labelId="backtest-owner-label"
                value={ownerUserId}
                label="Tài khoản sở hữu"
                onChange={(event) => {
                  setOwnerUserId(event.target.value);
                  setOwnerError('');
                }}
              >
                {ownerUsers.map((user) => (
                  <MenuItem key={user.id} value={String(user.id)}>
                    {user.username || user.email || `User ${user.id}`}
                    {user.email && user.username ? ` (${user.email})` : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {loadingOwnerUsers && <LinearProgress />}
            {ownerError && <Alert severity="error">{ownerError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleCloseOwnerDialog} color="inherit" disabled={savingOwner}>
            Hủy
          </Button>
          <Button onClick={handleAssignOwner} variant="contained" disabled={savingOwner || loadingOwnerUsers || !ownerUserId}>
            {savingOwner ? 'Đang chuyển...' : 'Xác nhận'}
          </Button>
        </DialogActions>
      </Dialog>
      {/* SNACKBAR NOTIFICATIONS */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setSnackbar((s) => ({ ...s, open: false }))} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>

      {/* DELETE LOG CONFIRM DIALOG */}
      <Dialog open={deleteLogConfirmOpen} onClose={() => setDeleteLogConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <DeleteOutlined style={{ color: '#f5222d', fontSize: 22 }} />
            <Typography variant="h4">Xác nhận xóa logs</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ pt: 1 }}>
            Xóa toàn bộ logs của bảng <strong>"{logTableToDelete}"</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Hành động này không thể hoàn tác.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteLogConfirmOpen(false)} color="inherit">Huỷ</Button>
          <Button onClick={handleConfirmDeleteLog} variant="contained" color="error" startIcon={<DeleteOutlined />}>
            Xóa
          </Button>
        </DialogActions>
      </Dialog>

      {/* DELETE CONFIRM DIALOG */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <DeleteOutlined style={{ color: '#f5222d', fontSize: 22 }} />
            <Typography variant="h4">Xác nhận xoá bảng</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ pt: 1 }}>
            Bạn chắc chắn muốn xoá bảng <strong>"{tableToDelete}"</strong>?
          </Typography>
          <Typography variant="body2" color="error" sx={{ mt: 1 }}>
            Toàn bộ dữ liệu và strategies liên quan sẽ bị xoá vĩnh viễn, không thể khôi phục.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteConfirmOpen(false)} color="inherit">
            Huỷ
          </Button>
          <Button onClick={handleConfirmDelete} variant="contained" color="error" startIcon={<DeleteOutlined />}>
            Xoá
          </Button>
        </DialogActions>
      </Dialog>

    </Grid>
  );
}
