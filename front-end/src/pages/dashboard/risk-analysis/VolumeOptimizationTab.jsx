import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  useMediaQuery,
  LinearProgress,
  CircularProgress,
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Paper,
  Tooltip,
  TablePagination,
  Dialog,
  DialogContent,
  DialogActions,
  IconButton,
  Chip,
  Alert
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  QuestionCircleOutlined,
  SearchOutlined,
  WarningOutlined,
  CalendarOutlined,
  RobotOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
  SettingOutlined,
  ReloadOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import CustomTablePagination from 'components/CustomTablePagination';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip
} from 'recharts';
import MainCard from 'components/MainCard';

const formatAnalysisRunTime = (value) => {
  if (!value) return '';
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? ''
      : value.toISOString().slice(0, 19).replace('T', ' ');
  }
  const rawValue = String(value).trim();
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(rawValue);
  const utcValue = hasTimezone ? rawValue : `${rawValue.replace(' ', 'T')}Z`;
  const date = new Date(utcValue);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toISOString().slice(0, 19).replace('T', ' ');
};

export default function VolumeOptimizationTab({
  lotSyncing,
  lotCurrentFile,
  lotProgress,
  configSettings,
  setConfigSettings,
  isDarkMode,
  handleRunLotAnalysis,
  selectedLotStrategy,
  setSelectedLotStrategy,
  loadingCurve,
  lotCurveData,
  onSelectLotCandidate,
  onResetLotCandidate,
  analysisTimeRange,
  analysisRuns,
  selectedAnalysisRunId,
  setSelectedAnalysisRunId,
  onRequestDeleteAnalysisRun,
  lotDeleting = false,
  distinctSymbols,
  lotOptimalData,
  lotLoading,
  lotTotalCount,
  lotPage,
  setLotPage,
  lotPageSize,
  setLotPageSize,
  lotSearchInput,
  setLotSearchInput,
  lotSymbol,
  setLotSymbol,
  lotWarningFilter,
  setLotWarningFilter,
  handleOpenRemarks,
  openHelpModal,
  theme
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tempConfigs, setTempConfigs] = useState(() => JSON.parse(JSON.stringify(configSettings.configs)));
  const [lotHelpOpen, setLotHelpOpen] = useState(false);
  const [candidateDialog, setCandidateDialog] = useState(null);
  const [selectionSaving, setSelectionSaving] = useState(false);
  const [selectionError, setSelectionError] = useState('');
  const hoveredCandidateRef = useRef(null);

  const isMobile = useMediaQuery('(max-width:600px)');

  const tooltipSlotProps = useMemo(() => ({
    tooltip: {
      sx: {
        bgcolor: isDarkMode ? '#1e293b' : '#0f172a',
        color: '#ffffff',
        boxShadow: isDarkMode
          ? '0 10px 25px -5px rgba(0,0,0,0.5), 0 8px 10px -6px rgba(0,0,0,0.5)'
          : '0 10px 25px -5px rgba(0,0,0,0.15), 0 8px 10px -6px rgba(0,0,0,0.15)',
        border: '1px solid',
        borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.1)',
        fontSize: '0.75rem',
        fontWeight: 500,
        borderRadius: 2,
        p: 1,
      }
    }
  }), [isDarkMode]);

  const PD_CURVE_HELP = useMemo(
    () => (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem', lineHeight: 1.5 }}>
          Biểu đồ đường cong P/D mô phỏng sự thay đổi về hiệu suất và rủi ro của chiến thuật giao dịch khi giới hạn khối lượng lệnh tối đa ở các mốc Volume khác nhau.
        </Typography>

        <Typography variant="subtitle2" fontWeight={700} sx={{ color: 'text.primary', mb: -0.5 }}>
          Ý nghĩa các trục tọa độ:
        </Typography>
        <Box sx={{ pl: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
            🔹 <strong>Trục hoành X (Volume Threshold):</strong> Ngưỡng giới hạn Volume tối đa cho phép giao dịch (tính bằng Lots). Điểm đầu tiên là mức volume nhỏ nhất và tăng dần sang phải.
          </Typography>
          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
            🔹 <strong>Trục tung Y bên trái (P/D Ratio - nét liền xanh):</strong> Tỷ lệ giữa Lợi nhuận ròng chia cho Sụt giảm tài sản lớn nhất (Net Profit / Max Drawdown). Mức P/D càng cao chứng tỏ bot hoạt động càng hiệu quả với rủi ro thấp.
          </Typography>
          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
            🔹 <strong>Trục tung Y bên phải (Max Drawdown - nét đứt đỏ):</strong> Giá trị sụt giảm tài sản lớn nhất (tính bằng USD) tương ứng với từng mốc giới hạn volume.
          </Typography>
        </Box>

        <Typography variant="subtitle2" fontWeight={700} sx={{ color: 'text.primary', mb: -0.5 }}>
          Điểm tối ưu (Ngôi sao vàng):
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem', lineHeight: 1.5 }}>
          Vị trí ngôi sao vàng trên đồ thị biểu thị mốc volume được chọn làm tối ưu nhất (Best P/D). Mốc này được chọn dựa trên thuật toán lọc điểm có tỷ lệ P/D cao nhất trong các mốc thỏa mãn điều kiện an toàn tối thiểu (Trades &ge; 100 và Drawdown &ge; $100,000).
        </Typography>
      </Box>
    ),
    [isDarkMode]
  );

  const renderVolumeHeaderActions = (chartName, promptMsg, chartData) => {
    const sampleRow = lotOptimalData && lotOptimalData[0];
    // Giữ nguyên UTC timestamp từ kết quả backend để tooltip khớp chính xác
    // với khoảng thời gian được in trong log LOT THRESHOLD ANALYSIS.
    const formatAnalysisTime = (value) => {
      if (!value) return '';
      const rawValue = String(value).trim();
      // PostgreSQL TIMESTAMP WITHOUT TIME ZONE có thể được serialize mà
      // không có hậu tố Z. Phải coi giá trị đó là UTC, nếu không browser
      // sẽ hiểu là giờ địa phương UTC+7 rồi cộng thêm 7 tiếng.
      const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(rawValue);
      const utcValue = hasTimezone
        ? rawValue
        : `${rawValue.replace(' ', 'T')}Z`;
      const date = new Date(utcValue);
      if (Number.isNaN(date.getTime())) return '';
      return `${date.toISOString().replace('T', ' ').replace('Z', '')}`;
    };
    const overlapBegin = formatAnalysisTime(
      analysisTimeRange?.time_begin || sampleRow?.time_begin
    );
    const overlapEnd = formatAnalysisTime(
      analysisTimeRange?.time_end || sampleRow?.time_end
    );
    const overlapText = overlapBegin && overlapEnd ? `từ ${overlapBegin} đến ${overlapEnd}` : 'khoảng thời gian giao nhau đặc quánh nhất';

    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: { xs: 0, sm: 'auto' }, mr: -1.25, flexShrink: 0 }}>
        <Tooltip title={`Khung thời gian đặc quánh theo dữ liệu MT5: ${overlapText}`} arrow slotProps={tooltipSlotProps}>
          <IconButton
            size="small"
            sx={{
              p: 0.25,
              mr: 0.25,
              cursor: 'default',
              '&:hover': { bgcolor: 'transparent' }
            }}
          >
            <Box sx={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <CalendarOutlined style={{ fontSize: '16px', color: '#94a3b8' }} />
              <Box
                sx={{
                  position: 'absolute',
                  width: '18px',
                  height: '1.5px',
                  bgcolor: '#ef4444',
                  transform: 'rotate(-45deg)',
                  transformOrigin: 'center',
                  pointerEvents: 'none'
                }}
              />
            </Box>
          </IconButton>
        </Tooltip>
        <Tooltip title="Hỏi Chatbot về dữ liệu này" arrow slotProps={tooltipSlotProps}>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(
                new CustomEvent('chatbot:context', {
                  detail: {
                    context: {
                      page: chartName,
                      chartData: chartData
                    }
                  }
                })
              );
              window.dispatchEvent(new CustomEvent('chatbot:prompt', { detail: { message: promptMsg } }));
            }}
            sx={{
              color: 'primary.main',
              p: 0.25,
              '&:hover': { bgcolor: 'rgba(24, 144, 255, 0.08)' }
            }}
          >
            <RobotOutlined style={{ fontSize: '16px' }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Nhận xét / Đánh giá" arrow slotProps={tooltipSlotProps}>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenRemarks(chartName, 'volume_optimization', 'chart');
            }}
            sx={{
              color: 'secondary.main',
              p: 0.25,
              '&:hover': { bgcolor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)' }
            }}
          >
            <FileTextOutlined style={{ fontSize: '16px' }} />
          </IconButton>
        </Tooltip>
      </Box>
    );
  };

  const openCandidateSelection = useCallback((payload) => {
    if (!payload || Number(payload.lot_threshold) <= 0 || selectionSaving || payload.the_chosen_one === true) return;
    setSelectionError('');
    setCandidateDialog(payload);
  }, [selectionSaving]);

  const resolveChartCandidate = useCallback((chartState) => {
    const activePayload = chartState?.activePayload || [];
    const payloadCandidate = activePayload.find((item) => item.dataKey === 'pd_ratio')?.payload
      || activePayload[0]?.payload;
    if (payloadCandidate) return payloadCandidate;

    const activeIndex = Number(chartState?.activeTooltipIndex);
    if (Number.isInteger(activeIndex) && activeIndex >= 0 && activeIndex < lotCurveData.length) {
      return lotCurveData[activeIndex];
    }

    const activeLabel = chartState?.activeLabel;
    if (activeLabel !== undefined && activeLabel !== null) {
      return lotCurveData.find((candidate) => Number(candidate.volume_threshold) === Number(activeLabel)) || null;
    }
    return null;
  }, [lotCurveData]);

  const handleChartMouseMove = useCallback((chartState) => {
    const candidate = resolveChartCandidate(chartState);
    if (candidate) hoveredCandidateRef.current = candidate;
  }, [resolveChartCandidate]);

  const handleChartClick = useCallback((chartState) => {
    const candidate = resolveChartCandidate(chartState) || hoveredCandidateRef.current;
    openCandidateSelection(candidate);
  }, [openCandidateSelection, resolveChartCandidate]);

  const renderCustomDot = useCallback((props) => {
    const { cx, cy, payload } = props;
    if (cx === undefined || cy === undefined || !payload) return null;
    
    const isOptimal = payload.the_chosen_one === true
      || (selectedLotStrategy && Number(payload.lot_threshold) === Number(selectedLotStrategy.optimal_lot_threshold));

    if (isOptimal) {
      return (
        <svg
          key={`dot-star-${payload.lot_threshold}`}
          x={cx - 7}
          y={cy - 7}
          width={14}
          height={14}
          viewBox="0 0 24 24"
          style={{ cursor: 'default' }}
        >
          <path
            d="M12 .587l3.668 7.431 8.2 1.19-5.934 5.787 1.4 8.168L12 18.896l-7.334 3.857 1.4-8.168L.132 9.208l8.2-1.19z"
            fill="#f59e0b"
            stroke="#d97706"
            strokeWidth={1}
          />
        </svg>
      );
    }

    return (
      <g key={`dot-group-${payload.lot_threshold}`}>
        <circle
          cx={cx}
          cy={cy}
          r={12}
          fill="transparent"
          stroke="transparent"
          style={{ cursor: Number(payload.lot_threshold) > 0 ? 'pointer' : 'default' }}
          pointerEvents="all"
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            openCandidateSelection(payload);
          }}
        />
        <circle cx={cx} cy={cy} r={3} fill={theme.palette.primary.main} stroke="none" pointerEvents="none" />
      </g>
    );
  }, [openCandidateSelection, selectedLotStrategy, theme]);

  const resetCandidateSelection = async () => {
    if (selectionSaving) return;
    try {
      setSelectionSaving(true);
      setSelectionError('');
      await onResetLotCandidate();
    } catch (error) {
      setSelectionError(error.message || 'Không thể khôi phục lựa chọn tự động.');
    } finally {
      setSelectionSaving(false);
    }
  };

  const confirmCandidateSelection = async () => {
    if (!candidateDialog || selectionSaving) return;
    try {
      setSelectionSaving(true);
      setSelectionError('');
      await onSelectLotCandidate(candidateDialog);
      setCandidateDialog(null);
    } catch (error) {
      setSelectionError(error.message || 'Không thể cập nhật ngưỡng volume đã chọn.');
    } finally {
      setSelectionSaving(false);
    }
  };

  const xDomainMax = useMemo(() => {
    const maxPct = Math.max(...lotCurveData.map((d) => Number(d.pct || 0)), 15);
    return Math.ceil(maxPct * 1.25);
  }, [lotCurveData]);

  return (
    <Box sx={{ mt: 2 }}>
      {/* Header Actions / Sync Progress */}
      <MainCard sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'var(--chart-title-color, #1F3864)' }}>
              Tối ưu hóa Khối lượng (Volume Optimization)
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Quét dải Volume thích ứng để tìm ngưỡng lot size tối ưu giúp tối đa hóa tỷ lệ P/D và hạn chế sụt giảm tài khoản.
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            {lotSyncing ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 260 }}>
                <Box sx={{ width: '100%' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    Đang phân tích: <strong>{lotCurrentFile || 'EA'}</strong> ({lotProgress}%)
                  </Typography>
                  <LinearProgress variant="determinate" value={lotProgress} sx={{ height: 6, borderRadius: 3 }} />
                </Box>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                <FormControl size="small" sx={{ minWidth: 260, maxWidth: 480 }}>
                  <InputLabel
                    id="lot-analysis-run-label"
                    shrink
                    sx={{
                      color: isDarkMode ? '#cbd5e1' : '#475569',
                      '&.Mui-focused': { color: isDarkMode ? '#60a5fa' : 'primary.main' }
                    }}
                  >
                    Analysis Run
                  </InputLabel>
                  <Select
                    labelId="lot-analysis-run-label"
                    value={selectedAnalysisRunId || ''}
                    label="Analysis Run"
                    notched
                    onChange={(event) => {
                      setSelectedAnalysisRunId(event.target.value);
                      setSelectedLotStrategy(null);
                    }}
                    renderValue={(selectedId) => {
                      const run = (analysisRuns || []).find((item) => item.analysis_run_id === selectedId);
                      return run ? run.name : selectedId;
                    }}
                    sx={{
                      height: 32,
                      fontSize: '0.75rem',
                      color: isDarkMode ? '#f8fafc' : 'text.primary',
                      '.MuiOutlinedInput-notchedOutline': {
                        borderColor: isDarkMode ? 'rgba(148, 163, 184, 0.45)' : 'rgba(71, 85, 105, 0.35)'
                      },
                      '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: isDarkMode ? '#94a3b8' : '#64748b'
                      },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: isDarkMode ? '#60a5fa' : 'primary.main'
                      }
                    }}
                    MenuProps={{
                      PaperProps: {
                        sx: {
                          bgcolor: isDarkMode ? '#1e293b' : '#ffffff',
                          color: isDarkMode ? '#f8fafc' : 'text.primary',
                          maxWidth: 550
                        }
                      }
                    }}
                  >
                    {(analysisRuns || []).map((run) => (
                      <MenuItem key={run.analysis_run_id} value={run.analysis_run_id} sx={{ fontSize: '0.75rem' }}>
                        {run.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  variant="outlined"
                  color="error"
                  size="small"
                  onClick={onRequestDeleteAnalysisRun}
                  disabled={!selectedAnalysisRunId || lotDeleting}
                  sx={{
                    minWidth: 70,
                    height: 32,
                    px: 1.25,
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    borderRadius: 1.5,
                    textTransform: 'none'
                  }}
                >
                  Xóa run
                </Button>
                <Box sx={{ display: 'flex', gap: 1.5, width: { xs: '100%', sm: 'auto' } }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => {
                      setTempConfigs(JSON.parse(JSON.stringify(configSettings.configs)));
                      setSettingsOpen(true);
                    }}
                    sx={{
                      flex: { xs: 1, sm: 'none' },
                      borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.23)' : '#cbd5e1',
                      color: isDarkMode ? '#fff' : '#0f172a',
                      height: 32,
                      px: 2,
                      fontWeight: 600,
                      borderRadius: 1.5,
                      textTransform: 'none',
                      '&:hover': {
                        borderColor: isDarkMode ? '#fff' : '#0f172a',
                        bgcolor: 'transparent'
                      }
                    }}
                  >
                    Cấu hình dải quét
                  </Button>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={handleRunLotAnalysis}
                    sx={{
                      flex: { xs: 1, sm: 'none' },
                      bgcolor: isDarkMode ? 'primary.main' : '#0f172a',
                      color: '#fff',
                      px: 2.5,
                      height: 32,
                      fontWeight: 600,
                      borderRadius: 1.5,
                      textTransform: 'none',
                      '&:hover': { bgcolor: isDarkMode ? 'primary.dark' : '#1e293b' }
                    }}
                  >
                    Khởi chạy tối ưu hóa
                  </Button>
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      </MainCard>

      <Grid container spacing={3}>
        {/* Top Column: P/D Curve Line Chart */}
        <Grid size={{ xs: 12 }}>
          <MainCard
            title={
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Typography variant="subtitle1" fontWeight={700} sx={{ color: 'var(--chart-title-color, #1F3864)' }}>
                    Biểu đồ Đường cong P/D (P/D Curve Chart)
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => openHelpModal('Biểu đồ Đường cong P/D (P/D Curve Chart)', PD_CURVE_HELP)}
                    sx={{ p: 0.25, color: 'text.secondary' }}
                  >
                    <QuestionCircleOutlined style={{ fontSize: '14px' }} />
                  </IconButton>
                </Box>
                <Typography variant="caption" color="text.secondary">
                  Chiến lược: <strong>{selectedLotStrategy?.strategy_id || 'Chưa chọn'}</strong>
                </Typography>
              </Box>
            }
            secondary={renderVolumeHeaderActions(
              'Biểu đồ Đường cong P/D',
              selectedLotStrategy
                ? `Hãy phân tích đường cong P/D và Max Drawdown của chiến lược ${selectedLotStrategy.strategy_id} trên tài sản ${selectedLotStrategy.symbol} để đề xuất mốc volume tối ưu.`
                : 'Hãy phân tích dải volume quét tối ưu hóa.',
              lotCurveData
            )}
          >
            {loadingCurve ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 12 }}>
                <CircularProgress size={40} />
              </Box>
            ) : lotCurveData.length === 0 ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 12 }}>
                <Typography variant="caption" color="text.secondary">Chọn một strategy ở bảng dưới để xem biểu đồ tối ưu</Typography>
              </Box>
            ) : (
              <>
                <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ width: 10, height: 2, bgcolor: 'primary.main' }} />
                    <Typography sx={{ fontSize: '10px', color: 'text.secondary', fontWeight: 700 }}>P/D Ratio (Trục trái)</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ width: 10, height: 2, borderBottom: '2px dashed #ef4444' }} />
                    <Typography sx={{ fontSize: '10px', color: 'text.secondary', fontWeight: 700 }}>Max Drawdown (Trục phải)</Typography>
                  </Box>
                </Box>

                <ResponsiveContainer width="100%" height={350}>
                  <LineChart
                    data={lotCurveData}
                    margin={{ top: 10, right: isMobile ? 4 : 10, left: isMobile ? -20 : -10, bottom: 0 }}
                    onMouseMove={handleChartMouseMove}
                    onClick={handleChartClick}
                    style={{ cursor: 'pointer' }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#CBD5E1" strokeOpacity={0.3} pointerEvents="none" />
                    <XAxis
                      dataKey="volume_threshold"
                      padding={{ left: 0, right: 0 }}
                      tick={{ fontSize: 9, fill: 'var(--chart-title-color, #1F3864)', fontWeight: 600 }}
                      label={{ value: 'Volume Threshold (Lots)', fontSize: 9, position: 'insideBottom', offset: -5, fontWeight: 700 }}
                      height={30}
                    />
                    <YAxis
                      yAxisId="left"
                      width={isMobile ? 38 : undefined}
                      tick={{ fontSize: 9, fill: 'var(--chart-title-color, #1F3864)', fontWeight: 600 }}
                      domain={[0, 'auto']}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      width={isMobile ? 40 : undefined}
                      tick={{ fontSize: 9, fill: '#ef4444', fontWeight: 600 }}
                      domain={[0, 'auto']}
                    />
                    <RechartsTooltip
                      cursor={{ stroke: '#ffffff', strokeWidth: 1.5, pointerEvents: 'none' }}
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          return (
                            <Box
                              sx={{
                                bgcolor: 'rgba(15, 23, 42, 0.95)',
                                backdropFilter: 'blur(8px)',
                                color: '#f8fafc',
                                p: 1.5,
                                borderRadius: 2,
                                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                fontSize: '0.75rem',
                                zIndex: 1000
                              }}
                            >
                              <Typography variant="caption" sx={{ fontWeight: 700, color: '#94a3b8', display: 'block', mb: 0.5 }}>
                                Ngưỡng: {label} lots
                              </Typography>
                              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                                  <Typography variant="caption" color="#60a5fa">P/D Ratio:</Typography>
                                  <Typography variant="caption" sx={{ fontWeight: 700 }}>
                                    {payload[0]?.value != null ? Number(payload[0].value).toFixed(2) : '-'}
                                  </Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                                  <Typography variant="caption" color="#f87171">Max DD:</Typography>
                                  <Typography variant="caption" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
                                    ${payload[1]?.value != null ? Number(payload[1].value).toLocaleString() : '-'}
                                  </Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                                  <Typography variant="caption" color="#34d399">Net Profit:</Typography>
                                  <Typography variant="caption" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
                                    ${payload[0]?.payload?.total_profit != null ? Number(payload[0].payload.total_profit).toLocaleString() : '-'}
                                  </Typography>
                                </Box>
                              </Box>
                            </Box>
                          );
                        }
                        return null;
                      }}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="pd_ratio"
                      stroke={theme.palette.primary.main}
                      strokeWidth={2.5}
                      dot={renderCustomDot}
                      activeDot={{ r: 5 }}
                      onClick={(event) => openCandidateSelection(event?.payload || event)}
                      connectNulls={true}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="max_drawdown"
                      stroke="#ef4444"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      dot={{ r: 1 }}
                      connectNulls={true}
                    />
                  </LineChart>
                </ResponsiveContainer>

                {selectedLotStrategy && (
                  <Box
                    sx={{
                      mt: 2,
                      p: 2,
                      borderRadius: 2,
                      bgcolor: isDarkMode ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.06)',
                      border: '1px solid',
                      borderColor: isDarkMode ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        Khối lượng khuyến nghị tối ưu (Optimal Lot Size)
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'success.main' }}>
                          {selectedLotStrategy.optimal_lot_threshold} Lots
                        </Typography>
                        <Chip
                          size="small"
                          label={selectedLotStrategy.selection_type || (selectedLotStrategy.is_fallback ? 'FALLBACK' : 'AUTO')}
                          color={selectedLotStrategy.selection_type === 'MANUAL' ? 'warning' : selectedLotStrategy.is_fallback ? 'error' : 'success'}
                          variant="outlined"
                          sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }}
                        />
                        {selectedLotStrategy.selection_type === 'MANUAL' && (
                          <Button size="small" onClick={resetCandidateSelection} disabled={selectionSaving} sx={{ minWidth: 0, fontSize: '0.68rem' }}>
                            Reset to Auto
                          </Button>
                        )}
                      </Box>
                    </Box>
                    <Box align="right">
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        Tỷ lệ P/D tối ưu tương ứng
                      </Typography>
                      <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'success.main', mt: 0.25 }}>
                        {selectedLotStrategy.best_pd != null ? Number(selectedLotStrategy.best_pd).toFixed(2) : '-'}
                      </Typography>
                    </Box>
                  </Box>
                )}
                {selectionError && <Alert severity="error" sx={{ mt: 1.5 }}>{selectionError}</Alert>}
              </>
            )}
          </MainCard>
        </Grid>

        {/* Bottom Column: Optimal Table */}
        <Grid size={{ xs: 12 }}>
          <MainCard
            title={
              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'flex-start', sm: 'center' }, gap: 0.75 }}>
                <Typography variant="subtitle1" fontWeight={700} sx={{ color: 'var(--chart-title-color, #1F3864)' }}>
                  Danh sách Ngưỡng Volume Tối ưu (Best P/D)
                </Typography>
                {analysisTimeRange?.time_begin && analysisTimeRange?.time_end && (
                  <Typography
                    variant="caption"
                    sx={{
                      whiteSpace: 'normal',
                      color: isDarkMode ? '#e2e8f0' : '#475569',
                      fontWeight: 700,
                      fontSize: '0.74rem',
                      bgcolor: isDarkMode ? 'rgba(96, 165, 250, 0.12)' : 'rgba(37, 99, 235, 0.08)',
                      borderRadius: 1,
                      px: 0.75,
                      py: 0.25,
                    }}
                  >
                    Đặc quánh (giờ dữ liệu MT5): {formatAnalysisRunTime(analysisTimeRange.time_begin)} → {formatAnalysisRunTime(analysisTimeRange.time_end)}
                  </Typography>
                )}
                <IconButton
                  size="small"
                  onClick={() => setLotHelpOpen(true)}
                  sx={{ color: 'text.secondary', p: 0.25, '&:hover': { color: 'primary.main', bgcolor: 'rgba(24, 144, 255, 0.08)' } }}
                >
                  <QuestionCircleOutlined style={{ fontSize: '15px' }} />
                </IconButton>
              </Box>
            }
            secondary={renderVolumeHeaderActions(
              'Danh sách Ngưỡng Volume Tối ưu',
              'Hãy phân tích tổng quan bảng tối ưu hóa volume để đưa ra nhận xét chung về tính hiệu quả.',
              lotOptimalData
            )}
          >
            {/* Filter bar — bên trong content, trên table */}
            <Box sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              gap: 1,
              mb: 2,
              alignItems: { xs: 'stretch', sm: 'center' }
            }}>
              {/* Dòng 1 mobile / inline desktop: Search */}
              <TextField
                placeholder="Search Strategy ID..."
                size="small"
                value={lotSearchInput}
                onChange={(e) => setLotSearchInput(e.target.value)}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchOutlined style={{ fontSize: '14px', color: isDarkMode ? '#94a3b8' : '#64748b' }} />
                      </InputAdornment>
                    )
                  }
                }}
                sx={{
                  width: { xs: '100%', sm: 180 },
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 1.5,
                    height: 36,
                    fontSize: '0.75rem',
                    color: isDarkMode ? '#ffffff' : 'text.primary',
                    '& fieldset': {
                      borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.23)' : 'rgba(0, 0, 0, 0.23)'
                    }
                  }
                }}
              />
              {/* Dòng 2 mobile: Symbol + Status 50/50; desktop: inline */}
              <Box sx={{ display: 'flex', gap: 1, flex: { xs: 'none', sm: 1 } }}>
                <FormControl size="small" sx={{ flex: 1, minWidth: { xs: 0, sm: 130 } }}>
                  <InputLabel
                    id="lot-symbol-select-label"
                    sx={{
                      fontSize: '0.75rem',
                      color: isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'text.secondary',
                      '&.Mui-focused': { color: 'primary.main' }
                    }}
                  >
                    Symbol
                  </InputLabel>
                  <Select
                    labelId="lot-symbol-select-label"
                    id="lot-symbol-select"
                    label="Symbol"
                    value={lotSymbol}
                    onChange={(e) => {
                      setLotSymbol(e.target.value);
                      setLotPage(0);
                    }}
                    sx={{
                      borderRadius: 1.5,
                      height: 36,
                      fontSize: '0.75rem',
                      color: isDarkMode ? '#ffffff' : 'text.primary',
                      '.MuiOutlinedInput-notchedOutline': {
                        borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.23)' : 'rgba(0, 0, 0, 0.23)'
                      },
                      '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: isDarkMode ? '#ffffff' : 'rgba(0, 0, 0, 0.87)'
                      }
                    }}
                  >
                    <MenuItem value="all" sx={{ fontSize: '0.75rem' }}>All Symbols</MenuItem>
                    {distinctSymbols.map((sym) => (
                      <MenuItem key={sym} value={sym} sx={{ fontSize: '0.75rem' }}>{sym}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl size="small" sx={{ flex: 1, minWidth: { xs: 0, sm: 155 } }}>
                  <InputLabel
                    id="lot-status-select-label"
                    sx={{
                      fontSize: '0.75rem',
                      color: isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'text.secondary',
                      '&.Mui-focused': { color: 'primary.main' }
                    }}
                  >
                    Status
                  </InputLabel>
                  <Select
                    labelId="lot-status-select-label"
                    id="lot-status-select"
                    label="Status"
                    value={lotWarningFilter}
                    onChange={(e) => {
                      setLotWarningFilter(e.target.value);
                      setLotPage(0);
                    }}
                    sx={{
                      borderRadius: 1.5,
                      height: 36,
                      fontSize: '0.75rem',
                      color: isDarkMode ? '#ffffff' : 'text.primary',
                      '.MuiOutlinedInput-notchedOutline': {
                        borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.23)' : 'rgba(0, 0, 0, 0.23)'
                      },
                      '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: isDarkMode ? '#ffffff' : 'rgba(0, 0, 0, 0.87)'
                      }
                    }}
                  >
                    <MenuItem value="all" sx={{ fontSize: '0.75rem' }}>All Status</MenuItem>
                    <MenuItem value="warning" sx={{ fontSize: '0.75rem' }}>Warning (Fallback)</MenuItem>
                    <MenuItem value="normal" sx={{ fontSize: '0.75rem' }}>Optimal (Normal)</MenuItem>
                  </Select>
                </FormControl>
              </Box>
            </Box>
            {lotLoading && lotOptimalData.length === 0 ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                <CircularProgress size={40} />
              </Box>
            ) : lotOptimalData.length === 0 ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                <Typography variant="caption" color="text.secondary">
                  {selectedAnalysisRunId && lotOptimalData.length === 0
                    ? 'Không có dữ liệu trong Analysis Run hiện tại cho Data Source đã chọn.'
                    : 'Không tìm thấy dữ liệu tối ưu'}
                </Typography>
              </Box>
            ) : (
              <>
                <TableContainer component={Paper} sx={{ boxShadow: 'none', border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'background.default' }}>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Strategy ID</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }} align="center">Symbol</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }} align="center">Backtest Table</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }} align="center">Lot Tối ưu</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }} align="center">Best P/D</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }} align="right">Profit</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }} align="right">Max DD</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }} align="center">Trades</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }} align="center">Winrate</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {lotOptimalData.map((row) => {
                        const isSelected = selectedLotStrategy?.strategy_id === row.strategy_id && selectedLotStrategy?.source_table === row.source_table;
                        return (
                          <TableRow
                            hover
                            key={`${row.strategy_id}-${row.source_table}`}
                            onClick={() => setSelectedLotStrategy(row)}
                            sx={{
                              cursor: 'pointer',
                              bgcolor: isSelected
                                ? (isDarkMode ? 'rgba(2, 132, 199, 0.15)' : 'rgba(2, 132, 199, 0.08)')
                                : row.is_fallback
                                ? (isDarkMode ? 'rgba(239, 68, 68, 0.18)' : 'rgba(239, 68, 68, 0.08)')
                                : 'inherit',
                              '&:hover': {
                                bgcolor: isSelected
                                  ? (isDarkMode ? 'rgba(2, 132, 199, 0.2)' : 'rgba(2, 132, 199, 0.12)')
                                  : row.is_fallback
                                  ? (isDarkMode ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.15)')
                                  : undefined
                              }
                            }}
                          >
                            <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', fontFamily: 'monospace' }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                {row.strategy_id}
                                <Chip
                                  size="small"
                                  label={row.selection_type || (row.is_fallback ? 'FALLBACK' : 'AUTO')}
                                  color={row.selection_type === 'MANUAL' ? 'warning' : row.is_fallback ? 'error' : 'success'}
                                  variant="outlined"
                                  sx={{ height: 18, fontSize: '0.58rem', fontWeight: 700 }}
                                />
                                {row.is_fallback && (
                                  <Tooltip title="Kết quả tạm thời (Không thỏa mãn điều kiện tối thiểu Trades >= 100 & Drawdown >= 100k, dùng số liệu fallback)" arrow slotProps={tooltipSlotProps}>
                                    <WarningOutlined style={{ color: '#f59e0b', fontSize: '0.85rem', cursor: 'help' }} />
                                  </Tooltip>
                                )}
                              </Box>
                            </TableCell>
                            <TableCell align="center" sx={{ fontSize: '0.75rem', fontWeight: 600 }}>
                              {row.symbol}
                            </TableCell>
                            <TableCell align="center" sx={{ fontSize: '0.75rem', color: 'text.secondary', fontFamily: 'monospace' }}>
                              {row.source_table}
                            </TableCell>
                            <TableCell align="center" sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'primary.main' }}>
                              {row.optimal_lot_threshold} lots
                            </TableCell>
                            <TableCell align="center" sx={{ fontSize: '0.75rem', fontWeight: 700, color: row.best_pd != null && Number(row.best_pd) < 3 ? 'warning.main' : 'success.main' }}>
                              {row.best_pd != null ? Number(row.best_pd).toFixed(2) : '-'}
                            </TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
                              {row.total_profit != null ? `$${Number(row.total_profit).toLocaleString()}` : '-'}
                            </TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'error.main' }}>
                              {row.max_drawdown != null ? `$${Number(row.max_drawdown).toLocaleString()}` : '-'}
                            </TableCell>
                            <TableCell align="center" sx={{ fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: row.total_trades != null && Number(row.total_trades) < 20 ? 700 : 'inherit', color: row.total_trades != null && Number(row.total_trades) < 20 ? 'warning.main' : 'inherit' }}>
                              {row.total_trades != null ? Number(row.total_trades).toLocaleString() : '-'}
                            </TableCell>
                            <TableCell align="center" sx={{ fontSize: '0.75rem' }}>
                              {row.winrate != null ? `${Number(row.winrate).toFixed(1)}%` : '-'}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>

                <CustomTablePagination
                  count={lotTotalCount}
                  rowsPerPage={lotPageSize}
                  page={lotPage}
                  onPageChange={(_, newPage) => setLotPage(newPage)}
                  onRowsPerPageChange={(e) => {
                    setLotPageSize(parseInt(e.target.value, 10));
                    setLotPage(0);
                  }}
                  rowsPerPageOptions={[25, 50, 100]}
                />
              </>
            )}
          </MainCard>
        </Grid>
      </Grid>

      <Dialog open={Boolean(candidateDialog)} onClose={() => !selectionSaving && setCandidateDialog(null)} maxWidth="xs" fullWidth>
        <DialogContent>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>Chọn ngưỡng volume</Typography>
          <Typography variant="body2" color="text.secondary">
            Strategy <strong>{selectedLotStrategy?.strategy_id}</strong> sẽ đổi từ{' '}
            <strong>{selectedLotStrategy?.optimal_lot_threshold} lots</strong> sang{' '}
            <strong>{candidateDialog?.lot_threshold} lots</strong>.
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: 2 }}>
            <Typography variant="caption">P/D: <strong>{candidateDialog?.pd_ratio != null ? Number(candidateDialog.pd_ratio).toFixed(2) : '-'}</strong></Typography>
            <Typography variant="caption">Trades: <strong>{candidateDialog?.total_trades ?? '-'}</strong></Typography>
            <Typography variant="caption">Profit: <strong>{candidateDialog?.total_profit != null ? Number(candidateDialog.total_profit).toLocaleString() : '-'}</strong></Typography>
            <Typography variant="caption">Drawdown: <strong>{candidateDialog?.max_drawdown != null ? Number(candidateDialog.max_drawdown).toLocaleString() : '-'}</strong></Typography>
          </Box>
          {candidateDialog && !candidateDialog.metrics_complete && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Candidate cũ chưa có đủ snapshot metrics. Hãy chạy lại Analysis Run trước khi chọn.
            </Alert>
          )}
          {selectionError && <Alert severity="error" sx={{ mt: 2 }}>{selectionError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCandidateDialog(null)} disabled={selectionSaving}>Hủy</Button>
          <Button variant="contained" onClick={confirmCandidateSelection} disabled={selectionSaving || !candidateDialog?.metrics_complete}>
            {selectionSaving ? 'Đang lưu...' : 'Xác nhận'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* LOT SWEEP CONFIGURATION DIALOG MODAL */}
      <Dialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            p: 3,
          }
        }}
      >
        <Box sx={{ mb: 2 }}>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 1, color: 'var(--chart-title-color, #1F3864)' }}>
            Cấu hình quét tối ưu hóa
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            Thiết lập dải quét cho từng sản phẩm giao dịch (để Max Volume là 0 để tự động lấy giới hạn tối đa từ DB).
          </Typography>
        </Box>

        <DialogContent dividers sx={{ px: 2, py: 2 }}>
          <Box sx={{ minWidth: 450 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Sản phẩm</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }} align="center">Min Volume</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }} align="center">Max Volume (Cap)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {Object.keys(tempConfigs).map((sym) => {
                  const isDefault = sym === 'DEFAULT';
                  return (
                    <TableRow key={sym}>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', color: isDefault ? 'primary.main' : 'text.primary' }}>
                        {isDefault ? 'Mặc định (DEFAULT)' : sym}
                      </TableCell>
                      <TableCell align="center">
                        <TextField
                          type="number"
                          size="small"
                          value={tempConfigs[sym].minVol}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            setTempConfigs(prev => ({
                              ...prev,
                              [sym]: { ...prev[sym], minVol: val }
                            }));
                          }}
                          inputProps={{ min: 0 }}
                          sx={{ width: 80, '& .MuiOutlinedInput-root': { borderRadius: 1.5, height: 28, fontSize: '0.75rem' } }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <TextField
                          type="number"
                          size="small"
                          value={tempConfigs[sym].maxVol}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            setTempConfigs(prev => ({
                              ...prev,
                              [sym]: { ...prev[sym], maxVol: val }
                            }));
                          }}
                          inputProps={{ min: 0 }}
                          sx={{ width: 80, '& .MuiOutlinedInput-root': { borderRadius: 1.5, height: 28, fontSize: '0.75rem' } }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        </DialogContent>

        <DialogActions sx={{ px: 0, pt: 2.5, pb: 0, gap: 1.5 }}>
          <Button
            variant="outlined"
            onClick={() => setSettingsOpen(false)}
            sx={{
              borderColor: '#cbd5e1',
              color: 'text.primary',
              borderRadius: 1.5,
              textTransform: 'none',
              '&:hover': { borderColor: 'text.primary' }
            }}
          >
            Hủy
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              const saved = {
                configs: tempConfigs
              };
              setConfigSettings(saved);
              localStorage.setItem('lotThresholdSettings', JSON.stringify(saved));
              setSettingsOpen(false);
            }}
            sx={{
              bgcolor: isDarkMode ? 'primary.main' : '#0f172a',
              color: '#fff',
              fontWeight: 600,
              borderRadius: 1.5,
              textTransform: 'none',
              '&:hover': { bgcolor: isDarkMode ? 'primary.dark' : '#1e293b' }
            }}
          >
            Lưu cấu hình
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* LOT SWEEP EXPLANATION DIALOG MODAL */}
      <Dialog
        open={lotHelpOpen}
        onClose={() => setLotHelpOpen(false)}
        PaperProps={{
          sx: {
            borderRadius: 3,
            p: 3.5,
            maxWidth: 540,
            width: '100%'
          }
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 2 }}>
          <InfoCircleOutlined style={{ fontSize: '22px', color: theme.palette.primary.main }} />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Tối ưu hóa ngưỡng Khối lượng (Lot Threshold)
          </Typography>
        </Box>
        <DialogContent sx={{ p: 0 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
              Tính năng này giúp tìm kiếm <strong>ngưỡng giới hạn khối lượng lệnh tối ưu nhất</strong> cho từng chiến thuật nhằm tối đa hóa tỷ số giữa <strong>Lợi nhuận ròng và Mức sụt giảm tài sản tối đa (Profit/Drawdown - P/D)</strong>.
            </Typography>

            <Typography variant="subtitle2" fontWeight={700} sx={{ color: 'text.primary', mb: -0.5 }}>
              Cách thức hoạt động:
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem', lineHeight: 1.6, pl: 1.5, borderLeft: '2px solid', borderColor: theme.palette.primary.main }}>
              • <strong>Thu thập các mốc khối lượng:</strong> Hệ thống trích xuất toàn bộ các mức khối lượng giao dịch thực tế phát sinh của chiến thuật (làm tròn lên số nguyên gần nhất) làm các mốc thử nghiệm.
              <br />
              • <strong>Mô phỏng giới hạn lệnh:</strong> Tại mỗi mốc thử nghiệm, hệ thống giả định <i>chỉ giữ lại các lệnh giao dịch có khối lượng nhỏ hơn hoặc bằng mốc đó</i>, loại bỏ các lệnh có khối lượng lớn hơn.
              <br />
              • <strong>Tính toán lại hiệu năng:</strong> Hệ thống tự động đo lường lại Lợi nhuận ròng, Mức sụt giảm tài sản tối đa, Tỷ lệ thắng và Tổng số giao dịch tương ứng với tập lệnh đã giới hạn.
            </Typography>

            <Typography variant="subtitle2" fontWeight={700} sx={{ color: 'text.primary', mb: -0.5 }}>
              Nguyên lý tìm kiếm mốc Tối ưu:
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem', lineHeight: 1.6, pl: 1.5, borderLeft: '2px solid', borderColor: theme.palette.success.main }}>
              • <strong>Ưu tiên tính ổn định (Trades &gt; 200):</strong> Hệ thống ưu tiên chọn các ngưỡng khối lượng duy trì được <strong>hơn 200 giao dịch</strong> và đạt tỷ số P/D cao nhất để đảm bảo kết quả mang tính thống kê dài hạn.
              <br />
              • <strong>Tự động điều chỉnh khi mẫu nhỏ:</strong> Nếu chiến thuật có quá ít giao dịch và không mốc nào đạt trên 200 lệnh, hệ thống sẽ chọn ngưỡng có tỷ số P/D tốt nhất trên toàn bộ dải quét.
              <br />
              • <strong>Ưu tiên Lợi nhuận ròng:</strong> Nếu các mốc thử nghiệm cho ra tỷ số P/D bằng nhau, ngưỡng nào đem lại Lợi nhuận ròng lớn nhất sẽ được chọn làm mốc tối ưu.
            </Typography>
            
            <Typography variant="subtitle2" fontWeight={700} sx={{ color: 'text.primary', mb: -0.5 }}>
              Hướng dẫn thiết lập cấu hình:
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
              • Đại ca có thể nhấn nút <strong>Cấu hình dải quét</strong> để tùy chỉnh giới hạn volume riêng cho từng Symbol.
              <br />
              • Điền giá trị Max Volume là <code>0</code> nếu muốn hệ thống tự động nhận diện và sử dụng mức khối lượng lớn nhất thực tế có trong cơ sở dữ liệu.
            </Typography>
          </Box>
        </DialogContent>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3.5 }}>
          <Button
            variant="contained"
            onClick={() => setLotHelpOpen(false)}
            sx={{
              bgcolor: isDarkMode ? 'primary.main' : '#0f172a',
              color: '#fff',
              px: 3,
              fontWeight: 600,
              borderRadius: 1.5,
              '&:hover': { bgcolor: isDarkMode ? 'primary.dark' : '#1e293b' }
            }}
          >
            Đã hiểu
          </Button>
        </Box>
      </Dialog>
    </Box>
  );
}
