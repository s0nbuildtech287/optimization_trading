import React, { useState, useRef, useCallback } from 'react';
import { useTheme, alpha } from '@mui/material/styles';
import {
  Box,
  Typography,
  Button,
  ToggleButton,
  ToggleButtonGroup,
  TextField,
  MenuItem,
  Alert,
  LinearProgress,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Paper,
  Chip,
  Divider,
  Grid,
  Tooltip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import {
  FolderOpenOutlined,
  CloudDownloadOutlined,
  PlayCircleOutlined,
  DownloadOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import { checkFilesLocal, checkFilesDrive, getCheckProgress } from 'api/CheckFile';
import * as XLSX from 'xlsx';

// ─── Export Helpers ───────────────────────────────────────────────────────────
function getErrorSortKey(r) {
  const desc = r.description || '';
  if (r.group === 1) return `1_${desc}_${r.fileName}`;
  if (r.group === 2) return `2_${desc}_${r.fileName}`;
  if (desc.includes('Swap ≠ 0') || desc.includes('Swap')) return `4.1_Swap_${r.fileName}`;
  if (desc.includes('Comment sai format') || desc.includes('Comment trống')) return `4.2_Comment_${r.fileName}`;
  if (desc.includes('Volume')) return `4.3_Volume_${r.fileName}`;
  if (desc.includes('cùng timestamp') || desc.includes('đóng ngay')) return `4.4_Timestamp_${r.fileName}`;
  if (desc.includes('chưa đóng lệnh cũ')) return `4.5_OpenOrder_${r.fileName}`;
  if (desc.includes('liền nhau')) return `4.6_Consecutive_${r.fileName}`;
  if (r.group === 3) return `3_${desc}_${r.fileName}`;
  if (r.group === 4) return `4.9_${desc}_${r.fileName}`;
  return `5_${desc}_${r.fileName}`;
}

function getStableErrorCode(row) {
  if (row.error_code) return row.error_code;
  const desc = String(row.description || '').toLowerCase();
  if (desc.includes('swap')) return 'DEAL_SWAP_NON_ZERO';
  if (desc.includes('volume')) return 'DEAL_VOLUME_NON_POSITIVE';
  if (desc.includes('comment') && desc.includes('trống')) return 'DEAL_COMMENT_EMPTY';
  if (desc.includes('comment')) return desc.includes('mở') ? 'DEAL_COMMENT_OPEN_INVALID' : 'DEAL_COMMENT_CLOSE_INVALID';
  if (desc.includes('cùng timestamp')) return 'DEAL_CLOSE_SAME_TIMESTAMP';
  if (desc.includes('chưa đóng')) return 'DEAL_OPEN_BEFORE_CLOSE';
  if (desc.includes('liền nhau')) return 'DEAL_CONSECUTIVE_SAME_TYPE';
  if (desc.includes('chia lệnh') || desc.includes('trùng số')) return 'DEAL_SPLIT_ORDER_FORBIDDEN';
  return `GROUP_${row.group ?? 'UNKNOWN'}_${desc}`;
}

function compactErrorRows(rows) {
  const grouped = new Map();
  rows.filter((row) => row.status === 'Lỗi').forEach((row) => {
    const errorCode = getStableErrorCode(row);
    const key = `${row.fileName}::${errorCode}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...row, error_code: errorCode, detailDeals: Array.isArray(row.detailDeals) ? [...row.detailDeals] : [] });
      return;
    }
    existing.detailDeals.push(...(Array.isArray(row.detailDeals) ? row.detailDeals : []));
    if (!existing.description.includes('(gộp')) {
      existing.description = `${existing.description} (gộp ${existing.detailDeals.length || 2} bản ghi cùng loại)`;
    }
  });
  return [...grouped.values()];
}

function exportErrorCSV(rows) {
  const errorRows = compactErrorRows(rows);
  const sortedRows = [...errorRows].sort((a, b) => getErrorSortKey(a).localeCompare(getErrorSortKey(b)));

  const header = ['Tên File', 'Mã Lỗi', 'Nhóm Lỗi', 'Mô Tả Lỗi', 'Trạng Thái'];
  const lines = [header.join(',')];
  for (const r of sortedRows) {
    const group = r.group === 0 ? 'N/A' : `Nhóm ${r.group}`;
    lines.push([`"${r.fileName}"`, `"${getStableErrorCode(r)}"`, `"${group}"`, `"${r.description}"`, `"${r.status}"`].join(','));
  }
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `check_files_errors_summary_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportErrorExcel(rows) {
  const errorRows = compactErrorRows(rows);
  const sortedRows = [...errorRows].sort((a, b) => getErrorSortKey(a).localeCompare(getErrorSortKey(b)));
  const detailRows = rows.filter((r) => r.status === 'Lỗi').sort((a, b) => getErrorSortKey(a).localeCompare(getErrorSortKey(b)));

  const summarySheetData = sortedRows.map((r) => ({
    'Tên File': r.fileName,
    'Mã Lỗi': getStableErrorCode(r),
    'Nhóm Lỗi': r.group === 0 ? 'N/A' : `Nhóm ${r.group}`,
    'Mô Tả Lỗi': r.description,
    'Trạng Thái': r.status
  }));

  const detailSheetData = [];
  detailRows.forEach((r) => {
    if (Array.isArray(r.detailDeals) && r.detailDeals.length > 0) {
      r.detailDeals.forEach((d) => {
        detailSheetData.push({
          'Tên File': r.fileName,
          'Mã Lỗi': getStableErrorCode(r),
          'Nhóm Lỗi': `Nhóm ${r.group}`,
          'Mã Deal': d.deal != null ? `#${d.deal}` : 'N/A',
          'Thời Gian': d.time || 'N/A',
          'Giá Trị / Comment': d.val !== undefined ? String(d.val) : (d.comment || 'N/A')
        });
      });
    }
  });

  const wb = XLSX.utils.book_new();

  const wsSummary = XLSX.utils.json_to_sheet(
    summarySheetData.length > 0
      ? summarySheetData
      : [{ 'Tên File': 'Không có lỗi', 'Nhóm Lỗi': 'N/A', 'Mô Tả Lỗi': 'Tất cả file đều đạt chuẩn', 'Trạng Thái': 'OK' }]
  );
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Tổng hợp lỗi (Gọn)');

  if (detailSheetData.length > 0) {
    const wsDetail = XLSX.utils.json_to_sheet(detailSheetData);
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Chi tiết Deal lỗi');
  }

  XLSX.writeFile(wb, `check_files_errors_report_${Date.now()}.xlsx`);
}

// ─── Constants ───────────────────────────────────────────────────────────────
const VALID_SYMBOLS = ['BTCUSD', 'ETHUSD', 'XAUUSD', 'XAGUSD', 'US500', 'DE30', 'JP225', 'HK50', 'USOIL'];
const VALID_TIMEFRAMES = ['H1', 'H4'];
const VALID_ORDER_TYPES = ['OB', 'OS'];
const DRIVE_URL_REGEX = /^https:\/\/drive\.google\.com\/drive\/folders\/[a-zA-Z0-9_-]+/;

const DEFAULT_CONFIG = {
  minProfit: 0,
  minTrades: 100,
  maxLoss: -20000
};

const STATUS_COLOR = {
  Lỗi: 'error',
  'Cảnh báo': 'warning',
  OK: 'success'
};

const STATUS_ICON = {
  Lỗi: <CloseCircleOutlined style={{ color: '#f5222d' }} />,
  'Cảnh báo': <WarningOutlined style={{ color: '#faad14' }} />,
  OK: <CheckCircleOutlined style={{ color: '#52c41a' }} />
};

// ─── Client-side validators ───────────────────────────────────────────────────
function parseFileName(name) {
  // Remove extension
  const base = name.replace(/\.[^/.]+$/, '');

  const errors = [];

  // 1. Must be ALL CAPS
  if (base !== base.toUpperCase()) {
    errors.push({ group: 1, description: 'Tên file phải viết hoa toàn bộ' });
    return { base, valid: false, errors };
  }

  // 2. Must start with exactly 3 digits
  const botIdMatch = base.match(/^(\d{3})/);
  if (!botIdMatch) {
    errors.push({ group: 1, description: 'Thiếu hoặc sai định dạng BotId (phải là 3 chữ số)' });
    return { base, valid: false, errors };
  }
  const botId = botIdMatch[1];
  const rest = base.slice(3);

  // 3. Parse symbol
  let symbol = null;
  let afterSymbol = rest;
  for (const sym of VALID_SYMBOLS) {
    if (rest.startsWith(sym)) {
      symbol = sym;
      afterSymbol = rest.slice(sym.length);
      break;
    }
  }
  if (!symbol) {
    // Try to guess what was typed
    const guessed = rest.replace(/H1|H4|OB|OS/g, '').replace(/^(.{0,8}).*/, '$1');
    errors.push({ group: 1, description: `Symbol không hợp lệ: ${guessed || rest}` });
    return { base, valid: false, errors, botId };
  }

  // 4. Parse timeframe
  let timeframe = null;
  let afterTf = afterSymbol;
  for (const tf of VALID_TIMEFRAMES) {
    if (afterSymbol.startsWith(tf)) {
      timeframe = tf;
      afterTf = afterSymbol.slice(tf.length);
      break;
    }
  }
  if (!timeframe) {
    errors.push({ group: 1, description: `Timeframe không hợp lệ: ${afterSymbol.slice(0, 2) || afterSymbol}` });
    return { base, valid: false, errors, botId, symbol };
  }

  // 5. Parse order type
  let orderType = null;
  for (const ot of VALID_ORDER_TYPES) {
    if (afterTf === ot) {
      orderType = ot;
      break;
    }
  }
  if (!orderType) {
    errors.push({ group: 1, description: `Thiếu hoặc sai OrderType (phải là OB hoặc OS): ${afterTf}` });
    return { base, valid: false, errors, botId, symbol, timeframe };
  }

  return { base, valid: true, errors: [], botId, symbol, timeframe, orderType };
}

function validateGroup1And2(fileNames) {
  const results = [];
  const validFiles = {};
  const seenCombos = new Map();

  for (const name of fileNames) {
    const parsed = parseFileName(name);
    if (!parsed.valid) {
      for (const e of parsed.errors) {
        results.push({ fileName: name, group: e.group, description: e.description, status: 'Lỗi' });
      }
    } else {
      const key = `${parsed.botId}${parsed.symbol}`;
      if (!validFiles[key]) validFiles[key] = [];
      validFiles[key].push({ name, timeframe: parsed.timeframe, orderType: parsed.orderType });

      const comboKey = `${parsed.botId}${parsed.symbol}${parsed.timeframe}${parsed.orderType}`;
      if (!seenCombos.has(comboKey)) seenCombos.set(comboKey, []);
      seenCombos.get(comboKey).push(name);
    }
  }

  for (const [comboKey, names] of seenCombos.entries()) {
    if (names.length > 1) {
      results.push({
        fileName: `[Trùng] ${comboKey}`,
        group: 2,
        description: `Trùng file: ${names.join(', ')}`,
        status: 'Lỗi'
      });
    }
  }

  // Group 2 — check completeness of sets of 4
  for (const [key, files] of Object.entries(validFiles)) {
    const required = ['H1OB', 'H1OS', 'H4OB', 'H4OS'];
    const present = files.map((f) => `${f.timeframe}${f.orderType}`);
    const missing = required.filter((r) => !present.includes(r));
    if (missing.length > 0) {
      const rep = files[0].name;
      results.push({
        fileName: `[Bộ ${key}]`,
        group: 2,
        description: `Thiếu file: ${missing.join(', ')}`,
        status: 'Lỗi'
      });
    } else {
      // All 4 ok — mark each as OK for Group 1+2
      for (const f of files) {
        results.push({ fileName: f.name, group: 0, description: 'Tên file & bộ 4 hợp lệ', status: 'OK' });
      }
    }
  }

  return results;
}

function exportDetailJSON(jobInfo, rows) {
  const payload = {
    exportedAt: new Date().toISOString(),
    summary: {
      status: jobInfo?.status || 'UNKNOWN',
      totalFiles: jobInfo?.totalFiles ?? 0,
      processedFiles: jobInfo?.processedFiles ?? 0,
      successFiles: jobInfo?.successFiles ?? 0,
      failedFiles: jobInfo?.failedFiles ?? 0,
      progress: jobInfo?.progress ?? 0,
      durationMs: jobInfo?.duration ?? null,
      startTime: jobInfo?.startTime || null,
      endTime: jobInfo?.endTime || null
    },
    results: rows
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `check_files_detail_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main Component ───────────────────────────────────────────────────────────
const CheckFileOptimization = () => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const [mode, setMode] = useState('local'); // 'local' | 'drive'
  const [driveUrl, setDriveUrl] = useState('');
  const [driveUrlError, setDriveUrlError] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]); // File objects (local)
  const [fileNames, setFileNames] = useState([]); // for local: names only
  const [config, setConfig] = useState({ ...DEFAULT_CONFIG });
  const [configErrors, setConfigErrors] = useState({});
  const [results, setResults] = useState([]); // all result rows
  const [group3Running, setGroup3Running] = useState(false);
  const [progress, setProgress] = useState(null); // { percent, currentFile, processedFiles, totalFiles, successFiles, failedFiles, status }
  const [error, setError] = useState('');
  const [completedJob, setCompletedJob] = useState(null);
  const [groupFilter, setGroupFilter] = useState('all'); // 'all' | '1' | '2' | '3' | '4'
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);
  const folderInputRef = useRef(null);
  const pollRef = useRef(null);

  // ── Source mode handlers ─────────────────────────────────────
  const handleModeChange = (_, newMode) => {
    if (!newMode) return;
    setMode(newMode);
    setSelectedFiles([]);
    setFileNames([]);
    setDriveUrl('');
    setDriveUrlError('');
    setResults([]);
    setProgress(null);
    setError('');
    setCompletedJob(null);
  };

  const handleFolderSelect = (e) => {
    const files = Array.from(e.target.files || []).filter((f) => f.name.endsWith('.xlsx') || f.name.endsWith('.xls'));
    setSelectedFiles(files);
    const names = files.map((f) => f.name);
    setFileNames(names);
    // Run Group 1+2 immediately
    const g12 = validateGroup1And2(names);
    setResults(g12);
    setProgress(null);
    setError('');
    setCompletedJob(null);
  };

  const handleDriveUrlChange = (e) => {
    const val = e.target.value;
    setDriveUrl(val);
    if (val && !DRIVE_URL_REGEX.test(val)) {
      setDriveUrlError('URL Google Drive không hợp lệ');
    } else {
      setDriveUrlError('');
      if (val) {
        // No Group 1+2 for Drive (need to list files from server first)
        setResults([]);
        setCompletedJob(null);
      }
    }
  };

  // ── Config handlers ──────────────────────────────────────────
  const handleConfigChange = (field) => (e) => {
    const raw = e.target.value;
    const num = parseFloat(raw);
    if (raw !== '' && isNaN(num)) {
      setConfigErrors((prev) => ({ ...prev, [field]: 'Phải là số' }));
    } else {
      setConfigErrors((prev) => {
        const n = { ...prev };
        delete n[field];
        return n;
      });
      setConfig((prev) => ({ ...prev, [field]: raw === '' ? DEFAULT_CONFIG[field] : num }));
    }
  };

  // ── Run Group 3 ──────────────────────────────────────────────
  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = (syncId, totalFiles) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await getCheckProgress(syncId);
        const d = res.data || res;
        const pct = d.totalFiles > 0 ? Math.round((d.processedFiles / d.totalFiles) * 100) : 0;
        setProgress({
          percent: pct,
          currentFile: d.currentFile || '',
          processedFiles: d.processedFiles || 0,
          totalFiles: d.totalFiles || 0,
          successFiles: d.successFiles || 0,
          failedFiles: d.failedFiles || 0,
          status: d.status || 'PROCESSING'
        });

        if (d.status === 'COMPLETED' || d.status === 'FAILED') {
          stopPolling();
          setGroup3Running(false);
          setProgress((prev) => ({
            ...prev,
            percent: 100,
            currentFile: '',
            status: d.status || prev?.status || 'COMPLETED'
          }));
          setCompletedJob(d);

          // Set check results directly from the current job run (includes Groups 1-4)
          const checkResults = d.results || d.result?.results;
          if (Array.isArray(checkResults)) {
            setResults(checkResults);
          } else {
            setError('Đã hoàn tất nhưng chưa nhận được dữ liệu kết quả từ server, vui lòng thử lại.');
          }

          if (d.status === 'FAILED') setError(d.error || 'Kiểm tra thất bại');
        }
      } catch {
        // ignore poll errors silently
      }
    }, 1500);
  };

  const handleRunGroup3 = async () => {
    if (Object.keys(configErrors).length > 0) {
      setError('Vui lòng sửa lỗi cấu hình trước khi chạy');
      return;
    }

    setGroup3Running(true);
    setError('');
    setResults([]);
    setProgress({
      percent: 0,
      currentFile: '',
      processedFiles: 0,
      totalFiles: mode === 'local' ? selectedFiles.length : 0,
      successFiles: 0,
      failedFiles: 0,
      status: 'PROCESSING'
    });
    setCompletedJob(null);

    try {
      let res;
      if (mode === 'local') {
        if (selectedFiles.length === 0) {
          setError('Vui lòng chọn folder trước');
          setGroup3Running(false);
          return;
        }
        res = await checkFilesLocal(selectedFiles, { ...config, enableGroup4: true });
      } else {
        if (!driveUrl || driveUrlError) {
          setError('Vui lòng nhập URL Drive hợp lệ');
          setGroup3Running(false);
          return;
        }
        res = await checkFilesDrive(driveUrl, { ...config, enableGroup4: true });
      }

      const { syncId } = res.data || res;
      startPolling(syncId, selectedFiles.length);
    } catch (err) {
      setError(err.message || 'Có lỗi khi khởi động kiểm tra');
      setGroup3Running(false);
      setProgress(null);
    }
  };

  const handleReset = () => {
    stopPolling();
    setSelectedFiles([]);
    setFileNames([]);
    setDriveUrl('');
    setDriveUrlError('');
    setResults([]);
    setProgress(null);
    setError('');
    setGroup3Running(false);
    setCompletedJob(null);
    if (folderInputRef.current) folderInputRef.current.value = '';
  };

  // ── Derived display data ─────────────────────────────────────
  const violationResults = results.filter((r) => r.status !== 'OK');

  const filteredResults =
    groupFilter === 'all' ? violationResults : violationResults.filter((r) => String(r.group) === groupFilter);

  const groupCounts = {
    all: violationResults.length,
    1: violationResults.filter((r) => r.group === 1).length,
    2: violationResults.filter((r) => r.group === 2).length,
    3: violationResults.filter((r) => r.group === 3).length,
    4: violationResults.filter((r) => r.group === 4).length
  };

  const summary = {
    affectedFiles: new Set(violationResults.map((r) => r.fileName).filter((f) => !f.startsWith('['))).size,
    violations: violationResults.length
  };

  const hasResults = results.length > 0;
  const hasViolationResults = violationResults.length > 0;
  const allOk = hasResults && !hasViolationResults;

  return (
    <Box>
      {/* ── Source Selector ── */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Typography variant="subtitle1" fontWeight="600" sx={{ color: (theme) => theme.palette.mode === 'dark' ? '#ffffff' : 'text.primary' }}>
            Nguồn dữ liệu
          </Typography>
          <Tooltip title="Xem chi tiết các điều kiện kiểm tra file (Groups 1 - 4)">
            <IconButton
              size="small"
              onClick={() => setInfoDialogOpen(true)}
              sx={{
                color: (theme) => theme.palette.mode === 'dark' ? '#38bdf8' : '#0284c7',
                p: 0.25,
                '&:hover': { bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(56,189,248,0.15)' : 'rgba(2,132,199,0.08)' }
              }}
            >
              <InfoCircleOutlined style={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>
        <ToggleButtonGroup value={mode} exclusive onChange={handleModeChange} size="small" sx={{ mb: 2 }}>
          <ToggleButton value="local" sx={{ px: 3 }}>
            <FolderOpenOutlined style={{ marginRight: 6 }} /> Mode Local
          </ToggleButton>
          <ToggleButton value="drive" sx={{ px: 3 }}>
            <CloudDownloadOutlined style={{ marginRight: 6 }} /> Mode Drive
          </ToggleButton>
        </ToggleButtonGroup>

        {mode === 'local' ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <input
              ref={folderInputRef}
              type="file"
              webkitdirectory=""
              multiple
              accept=".xlsx,.xls"
              style={{ display: 'none' }}
              onChange={handleFolderSelect}
              id="folder-input"
            />
            <label htmlFor="folder-input">
              <Button variant="outlined" component="span" startIcon={<FolderOpenOutlined />}>
                Chọn Folder
              </Button>
            </label>
            {fileNames.length > 0 && (
              <Typography variant="body2" color="text.secondary">
                Đã chọn <strong>{fileNames.length}</strong> file xlsx
              </Typography>
            )}
          </Box>
        ) : (
          <Box sx={{ mt: 2 }}>
            <TextField
              fullWidth
              size="small"
              label="Google Drive Folder URL"
              placeholder="https://drive.google.com/drive/folders/..."
              value={driveUrl}
              onChange={handleDriveUrlChange}
              error={Boolean(driveUrlError)}
              helperText={driveUrlError}
              InputLabelProps={{
                shrink: true,
                sx: {
                  color: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.85)' : 'text.secondary',
                  '&.Mui-focused': {
                    color: 'primary.main'
                  }
                }
              }}
              InputProps={{
                sx: {
                  color: (theme) => theme.palette.mode === 'dark' ? '#ffffff' : 'text.primary',
                  '& .MuiOutlinedInput-input': {
                    color: (theme) => theme.palette.mode === 'dark' ? '#ffffff' : 'inherit'
                  },
                  '& .MuiOutlinedInput-input::placeholder': {
                    opacity: 0.6,
                    color: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.6)' : 'inherit'
                  },
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.25)' : 'inherit'
                  },
                  '&:hover .MuiOutlinedInput-notchedOutline': {
                    borderColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.5)' : 'inherit'
                  }
                }
              }}
              sx={{ maxWidth: 560 }}
            />
          </Box>
        )}
      </Box>

      <Divider sx={{ mb: 3 }} />

      {/* ── CheckConfig Thresholds ── */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle1" fontWeight="600" gutterBottom sx={{ color: (theme) => theme.palette.mode === 'dark' ? '#ffffff' : 'text.primary' }}>
          Ngưỡng kiểm tra
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              size="small"
              label="Min Net Profit"
              type="number"
              defaultValue={DEFAULT_CONFIG.minProfit}
              onChange={handleConfigChange('minProfit')}
              error={Boolean(configErrors.minProfit)}
              helperText={configErrors.minProfit}
              InputLabelProps={{
                shrink: true,
                sx: {
                  color: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.85)' : 'text.secondary',
                  '&.Mui-focused': {
                    color: 'primary.main'
                  }
                }
              }}
              InputProps={{
                sx: {
                  color: (theme) => theme.palette.mode === 'dark' ? '#ffffff' : 'text.primary',
                  '& .MuiOutlinedInput-input': {
                    color: (theme) => theme.palette.mode === 'dark' ? '#ffffff' : 'inherit'
                  },
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.25)' : 'inherit'
                  },
                  '&:hover .MuiOutlinedInput-notchedOutline': {
                    borderColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.5)' : 'inherit'
                  }
                }
              }}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              size="small"
              label="Min Total Trades"
              type="number"
              defaultValue={DEFAULT_CONFIG.minTrades}
              onChange={handleConfigChange('minTrades')}
              error={Boolean(configErrors.minTrades)}
              helperText={configErrors.minTrades}
              InputLabelProps={{
                shrink: true,
                sx: {
                  color: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.85)' : 'text.secondary',
                  '&.Mui-focused': {
                    color: 'primary.main'
                  }
                }
              }}
              InputProps={{
                sx: {
                  color: (theme) => theme.palette.mode === 'dark' ? '#ffffff' : 'text.primary',
                  '& .MuiOutlinedInput-input': {
                    color: (theme) => theme.palette.mode === 'dark' ? '#ffffff' : 'inherit'
                  },
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.25)' : 'inherit'
                  },
                  '&:hover .MuiOutlinedInput-notchedOutline': {
                    borderColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.5)' : 'inherit'
                  }
                }
              }}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              size="small"
              label="Max Loss Trade"
              type="number"
              defaultValue={DEFAULT_CONFIG.maxLoss}
              onChange={handleConfigChange('maxLoss')}
              error={Boolean(configErrors.maxLoss)}
              helperText={configErrors.maxLoss}
              InputLabelProps={{
                shrink: true,
                sx: {
                  color: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.85)' : 'text.secondary',
                  '&.Mui-focused': {
                    color: 'primary.main'
                  }
                }
              }}
              InputProps={{
                sx: {
                  color: (theme) => theme.palette.mode === 'dark' ? '#ffffff' : 'text.primary',
                  '& .MuiOutlinedInput-input': {
                    color: (theme) => theme.palette.mode === 'dark' ? '#ffffff' : 'inherit'
                  },
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.25)' : 'inherit'
                  },
                  '&:hover .MuiOutlinedInput-notchedOutline': {
                    borderColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.5)' : 'inherit'
                  }
                }
              }}
            />
          </Grid>
        </Grid>
      </Box>

      {/* ── Run Button ── */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          color="primary"
          startIcon={<PlayCircleOutlined />}
          onClick={handleRunGroup3}
          disabled={
            group3Running || (mode === 'local' && fileNames.length === 0) || (mode === 'drive' && (!driveUrl || Boolean(driveUrlError)))
          }
        >
          {group3Running ? 'Đang kiểm tra...' : 'Kiểm tra'}
        </Button>
        {hasResults && (
          <Button variant="outlined" color="error" startIcon={<ReloadOutlined />} onClick={handleReset}>
            Reset
          </Button>
        )}
        {hasResults && (
          <>
            <Button
              variant="contained"
              color="success"
              startIcon={<DownloadOutlined />}
              onClick={() => exportErrorExcel(results)}
            >
              Export Excel 2 Sheet (.xlsx)
            </Button>
            <Button
              variant="outlined"
              color="primary"
              startIcon={<DownloadOutlined />}
              onClick={() => exportErrorCSV(results)}
            >
              Export CSV Gọn (.csv)
            </Button>
          </>
        )}
        <Tooltip title="Điều kiện kiểm tra">
          <IconButton
            color="info"
            onClick={() => setInfoDialogOpen(true)}
            sx={{
              border: '1px solid',
              borderColor: 'info.main',
              '&:hover': {
                bgcolor: isDarkMode ? alpha(theme.palette.info.main, 0.15) : 'info.lighter'
              }
            }}
          >
            <InfoCircleOutlined />
          </IconButton>
        </Tooltip>
      </Box>

      {/* ── Progress Panel ── */}
      {progress !== null && (
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1, gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="subtitle2" fontWeight={600}>
              {progress.status === 'FAILED'
                ? 'Trạng thái: Thất bại'
                : progress.status === 'COMPLETED'
                  ? 'Trạng thái: Hoàn tất'
                  : 'Trạng thái: Đang quét'}
            </Typography>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              {progress.percent}%
            </Typography>
          </Box>

          <LinearProgress
            variant="determinate"
            value={progress.percent}
            color={progress.status === 'FAILED' ? 'error' : progress.status === 'COMPLETED' ? 'success' : 'primary'}
            sx={{ borderRadius: 1, height: 10, mb: 1.25 }}
          />

          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', mb: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {progress.currentFile ? `Đang xử lý: ${progress.currentFile}` : 'Đang chờ dữ liệu tiến độ...'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {progress.processedFiles || 0}/{progress.totalFiles || 0} file
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Chip size="small" variant="outlined" label={`Processed: ${progress.processedFiles || 0}`} />
            <Chip size="small" variant="outlined" color="success" label={`Success: ${progress.successFiles || 0}`} />
            <Chip size="small" variant="outlined" color="error" label={`Failed: ${progress.failedFiles || 0}`} />
          </Box>
        </Paper>
      )}

      {/* ── Error ── */}
      {error && (
        <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* ── Completion Panel ── */}
      {completedJob && !group3Running && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2, borderColor: completedJob.status === 'FAILED' ? 'error.main' : 'success.main' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="subtitle1" fontWeight={600}>
                {completedJob.status === 'FAILED' ? 'Kiểm tra hoàn tất với lỗi' : 'Kiểm tra hoàn tất'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {completedJob.totalFiles ?? 0} file • {completedJob.processedFiles ?? 0} đã xử lý • {completedJob.successFiles ?? 0} thành
                công • {completedJob.failedFiles ?? 0} thất bại
                {typeof completedJob.duration === 'number' ? ` • ${(completedJob.duration / 1000).toFixed(1)}s` : ''}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                size="small"
                onClick={() => exportErrorCSV(filteredResults)}
                disabled={!filteredResults.some((r) => r.status === 'Lỗi')}
              >
                Tải chi tiết lỗi (CSV)
              </Button>
              <Button variant="contained" size="small" onClick={() => exportDetailJSON(completedJob, filteredResults)}>
                Tải chi tiết đầy đủ (JSON)
              </Button>
            </Box>
          </Box>
        </Paper>
      )}

      {/* ── Result Area ── */}
      {hasResults && (
        <Box>
          {/* Summary */}
          <Box sx={{ display: 'flex', mb: 2, alignItems: 'center', flexWrap: 'wrap', gap: 2, justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <Chip label={`File dính vi phạm: ${summary.affectedFiles}`} variant="outlined" />
              <Chip label={`Tổng vi phạm: ${summary.violations}`} color="error" variant="outlined" />
            </Box>

            <Box sx={{ minWidth: 280, ml: 'auto' }}>
              <TextField
                select
                size="small"
                fullWidth
                label="Lọc theo loại"
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
              >
                <MenuItem value="all">Tất cả ({groupCounts.all})</MenuItem>
                <MenuItem value="1">📁 Cấu trúc file 1 - Tên file ({groupCounts[1]})</MenuItem>
                <MenuItem value="2">📁 Cấu trúc file 2 - Bộ file ({groupCounts[2]})</MenuItem>
                <MenuItem value="3">📊 Dữ liệu file 1 - Thông tin cơ bản ({groupCounts[3]})</MenuItem>
                <MenuItem value="4">📊 Dữ liệu file 2 - Logic giao dịch ({groupCounts[4]})</MenuItem>
              </TextField>
            </Box>
          </Box>

          {allOk ? (
            <Alert severity="success" icon={<CheckCircleOutlined />}>
              Tất cả file hợp lệ — không phát hiện lỗi nào.
            </Alert>
          ) : (
            <Box>
              {filteredResults.length > 1000 && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  Phát hiện quá nhiều lỗi (tổng cộng <strong>{filteredResults.length.toLocaleString()}</strong> vi phạm). 
                  Chỉ hiển thị 1,000 lỗi đầu tiên trên giao diện để tránh đơ trình duyệt. 
                  Vui lòng bấm nút <strong>"Export lỗi CSV"</strong> hoặc <strong>"Tải chi tiết lỗi (CSV)"</strong> để tải toàn bộ danh sách.
                </Alert>
              )}
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 440 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: isDarkMode ? '#1f1f1f' : '#fafafa' }}>
                      <TableCell sx={{ fontWeight: 'bold', width: '30%' }}>Tên File</TableCell>
                      <TableCell sx={{ fontWeight: 'bold', width: '15%' }}>Loại</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Mô Tả Lỗi</TableCell>
                      <TableCell sx={{ fontWeight: 'bold', width: '10%' }}>Trạng thái</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredResults.slice(0, 1000).map((row, idx) => (
                      <TableRow key={idx} hover>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.78rem', wordBreak: 'break-all' }}>{row.fileName}</TableCell>
                        <TableCell>
                          {row.group === 0 ? (
                            <Chip label="N/A" size="small" variant="outlined" />
                          ) : row.group === 1 ? (
                            <Chip label="📁 Cấu trúc 1" size="small" color="warning" variant="outlined" />
                          ) : row.group === 2 ? (
                            <Chip label="📁 Cấu trúc 2" size="small" color="info" variant="outlined" />
                          ) : row.group === 3 ? (
                            <Chip label="📊 Dữ liệu 1" size="small" color="secondary" variant="outlined" />
                          ) : (
                            <Chip label="📊 Dữ liệu 2" size="small" color="default" variant="outlined" />
                          )}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.82rem' }}>{row.description}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            {STATUS_ICON[row.status]}
                            <Typography variant="caption" color={`${STATUS_COLOR[row.status]}.main`} fontWeight="medium">
                              {row.status}
                            </Typography>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </Box>
      )}

      {!hasResults && (
        <Box sx={{ textAlign: 'center', py: 6, color: 'text.secondary' }}>
          <InfoCircleOutlined style={{ fontSize: 40, opacity: 0.3, marginBottom: 12 }} />
          <Typography variant="body2">
            {mode === 'local'
              ? 'Nhấn "Chạy kiểm tra" để kiểm tra nội dung file.'
              : 'Nhập Google Drive URL và nhấn "Chạy kiểm tra".'}
          </Typography>
        </Box>
      )}

      {/* Info Dialog */}
      <Dialog open={infoDialogOpen} onClose={() => setInfoDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{
          bgcolor: isDarkMode ? 'info.dark' : 'info.lighter',
          color: isDarkMode ? 'info.lighter' : 'info.darker',
          display: 'flex',
          alignItems: 'center',
          gap: 1
        }}>
          <InfoCircleOutlined style={{ fontSize: '20px' }} />
          Điều kiện kiểm tra file optimization
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Typography variant="h6" gutterBottom sx={{ color: 'primary.main', fontWeight: 600 }}>
            📋 Điều kiện kiểm tra
          </Typography>

          {/* Cấu trúc file optimization */}
          <Box sx={{
            mb: 3,
            p: 2,
            bgcolor: isDarkMode ? alpha(theme.palette.warning.main, 0.08) : 'warning.lighter',
            borderRadius: 1,
            border: '1px solid',
            borderColor: isDarkMode ? 'warning.main' : 'warning.light'
          }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{
              mb: 2,
              color: isDarkMode ? 'warning.main' : 'warning.dark',
              display: 'flex',
              alignItems: 'center',
              gap: 1
            }}>
              📁 Cấu trúc file optimization
            </Typography>

            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1, color: 'text.primary' }}>
              1. Check tên file & định dạng
            </Typography>
            <Box sx={{ pl: 2, mb: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                • Tên file phải viết HOA toàn bộ
              </Typography>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                • Format chuẩn: <strong>{'{BotId}{Symbol}{Timeframe}{OrderType}'}</strong>
              </Typography>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                • BotId đúng 3 chữ số
              </Typography>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                • Symbol thuộc danh sách hợp lệ
              </Typography>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                • Timeframe là H1 hoặc H4
              </Typography>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                • OrderType là OB hoặc OS
              </Typography>
            </Box>

            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1, color: 'text.primary' }}>
              2. Check danh mục bộ file trên Drive
            </Typography>
            <Box sx={{ pl: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                • Mỗi cặp BotId+Symbol phải có đủ H1OB, H1OS, H4OB, H4OS
              </Typography>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                • Không có 2 file trùng tên trong cùng folder
              </Typography>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                • Phát hiện file nào tên lạ ko đúng theo format tên
              </Typography>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                • Tối thiểu 3600 file cho toàn bộ folder drive
              </Typography>
            </Box>
          </Box>

          {/* Dữ liệu trong file */}
          <Box sx={{
            mb: 2,
            p: 2,
            bgcolor: isDarkMode ? alpha(theme.palette.info.main, 0.08) : 'info.lighter',
            borderRadius: 1,
            border: '1px solid',
            borderColor: isDarkMode ? 'info.main' : 'info.light'
          }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{
              mb: 2,
              color: isDarkMode ? 'info.main' : 'info.dark',
              display: 'flex',
              alignItems: 'center',
              gap: 1
            }}>
              📊 Dữ liệu trong file
            </Typography>

            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1, color: 'text.primary' }}>
              1. Kiểm tra thông tin cơ bản (Group 3)
            </Typography>
            <Box sx={{ pl: 2, mb: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                • Symbol, Timeframe, BotId trong file phải khớp tên file
              </Typography>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                • OB: AcceptBuy=true, AcceptSell=false / OS: AcceptSell=true, AcceptBuy=false
              </Typography>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                • Total Net Profit ≥ 0 (điều kiện duyệt file)
              </Typography>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                • Total Trades ≥ 100 (điều kiện duyệt file)
              </Typography>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                • Nếu file có Total Trades = 0 hoặc rỗng (không phát sinh lệnh) ➔ Báo lỗi: Không phát sinh bất kỳ lệnh deal giao dịch nào (Total Trades = 0)
              </Typography>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                • Largest Loss Trade ≥ -20,000 (điều kiện duyệt file)
              </Typography>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                • Profit Factor {'>'} 1.0 (điều kiện duyệt file)
              </Typography>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                • Liệt kê các deal mở lệnh có comment không khớp pattern chuẩn {'{id}_{size}_{price}_{tf}_{type}{n}'}
              </Typography>
            </Box>

            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1, color: 'text.primary' }}>
              2. Kiểm tra logic giao dịch (Group 4)
            </Typography>
            <Box sx={{ pl: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                • Nếu trong file không tìm thấy mục Deals hoặc danh sách Deals rỗng (không có dòng lệnh buy/sell nào) ➔ Báo lỗi: Không phát sinh bất kỳ lệnh deal giao dịch nào (Danh sách Deals rỗng)
              </Typography>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                • Không có deal đóng ngay sau khi mở (cùng timestamp)
              </Typography>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                • Không mở lệnh mới khi chưa đóng lệnh cũ
              </Typography>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                • Không có cặp lệnh buy/buy hoặc sell/sell liền nhau
              </Typography>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                • Không có chia lệnh (B2, B3 trong comment)
              </Typography>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                • Swap = 0
              </Typography>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                • Volume {'>'} 0
              </Typography>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                • Không giữ lệnh {'<'} 1 phút rồi đóng bằng _CO
              </Typography>
            </Box>
          </Box>

          <Box sx={{
            mt: 2,
            p: 1.5,
            bgcolor: isDarkMode ? 'background.default' : 'grey.100',
            borderRadius: 1,
            borderLeft: '4px solid',
            borderColor: 'primary.main'
          }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
              💡 <strong>Lưu ý:</strong> Các điều kiện trên được kiểm tra tự động. File không đạt sẽ được đánh dấu lỗi trong bảng kết quả.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInfoDialogOpen(false)} variant="contained">
            Đã hiểu
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CheckFileOptimization;
