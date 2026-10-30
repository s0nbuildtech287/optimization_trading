import React, { useState, useEffect, Fragment } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Stack from '@mui/material/Stack';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import { useTheme } from '@mui/material/styles';
import CustomTablePagination from 'components/CustomTablePagination';

// Icons
import SettingOutlined from '@ant-design/icons/SettingOutlined';
import BarChartOutlined from '@ant-design/icons/BarChartOutlined';
import EyeOutlined from '@ant-design/icons/EyeOutlined';
import DownloadOutlined from '@ant-design/icons/DownloadOutlined';
import CopyOutlined from '@ant-design/icons/CopyOutlined';
import CheckOutlined from '@ant-design/icons/CheckOutlined';
import CaretUpOutlined from '@ant-design/icons/CaretUpOutlined';
import CaretDownOutlined from '@ant-design/icons/CaretDownOutlined';
import CalendarOutlined from '@ant-design/icons/CalendarOutlined';
import RightOutlined from '@ant-design/icons/RightOutlined';
import DownOutlined from '@ant-design/icons/DownOutlined';
import DeleteOutlined from '@ant-design/icons/DeleteOutlined';

// Project
import MainCard from 'components/MainCard';
import { useBalanceChart } from 'hooks/useStrategy';
import { downloadStrategySheet } from 'api/Strategy';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

const getBacktestDisplayName = (value) => {
  if (!value || value === 'all_backtests') return 'All Backtest';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'All Backtest';
    return value.map(v => v.charAt(0).toUpperCase() + v.slice(1)).join(' + ');
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const getPdValue = (row) => {
  if (row.pd_ratio !== undefined && row.pd_ratio !== null) {
    return parseFloat(row.pd_ratio).toFixed(2);
  }
  if (row.results?.totalNetProfit && row.results?.balanceDrawdownMaximal) {
    const profit = parseFloat(row.results.totalNetProfit);
    const ddAbsolute = parseFloat(row.results.balanceDrawdownMaximal.split('(')[0].replace(/[^0-9.]/g, ''));
    if (ddAbsolute > 0) {
      return (profit / ddAbsolute).toFixed(2);
    }
  }
  return '-';
};

// ─── MINI SPARKLINE ──────────────────────────────────────────────────────────
function MiniSparkline({ row, dateRange }) {
  const [chartData, setChartData] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const { fetchBalanceChart, loading } = useBalanceChart();

  useEffect(() => {
    if (!row?.strategy_id || !row?.backtest_table) return;
    const isAnalysisRun = row.metrics_mode === 'ANALYSIS_RUN_THRESHOLD';
    const filters = isAnalysisRun
      ? {
          startDate: row.time_begin,
          endDate: row.time_end,
          maxVolume: row.threshold_applied
        }
      : {
          startDate: dateRange?.startDate?.startOf('day')?.toISOString(),
          endDate: dateRange?.endDate?.endOf('day')?.toISOString()
        };

    setLoaded(false);
    fetchBalanceChart(row.backtest_table, row.strategy_id, 1000000, filters)
      .then((data) => {
        const raw = (data || []).map((item) => parseFloat(item.balance));
        const baseline = raw.length > 0 ? raw[0] : 0;
        const formatted = raw.map((b) => ({ balance: b - baseline }));
        setChartData(formatted);
        setLoaded(true);
      })
      .catch(() => {
        setChartData([]);
        setLoaded(true);
      });
  }, [
    row?.strategy_id,
    row?.backtest_table,
    row?.metrics_mode,
    row?.time_begin,
    row?.time_end,
    row?.threshold_applied,
    dateRange?.startDate,
    dateRange?.endDate,
    fetchBalanceChart
  ]);

  if (loading && !loaded) {
    return (
      <Box sx={{ width: 160, height: 68, mx: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress size={14} />
      </Box>
    );
  }

  if (!chartData.length) {
    return (
      <Box sx={{ width: 160, height: 68, mx: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="caption" color="text.disabled">
          —
        </Typography>
      </Box>
    );
  }

  const values = chartData.map((d) => d.balance);
  const last = values[values.length - 1];
  const isPositive = last >= 0;
  const lineColor = isPositive ? '#52c41a' : '#f5222d';
  const gradientId = `sparkGrad-${row.strategy_id}-${row.backtest_table}`;

  return (
    <Box sx={{ width: 160, height: 68, mx: 'auto', display: 'block' }}>
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
}

// ─── GET METRICS LIST ────────────────────────────────────────────────────────
const getMetricsList = (row, hasDateRange, drawdownUnit, isDarkMode) => {
  const results = row.results || {};
  const deposit = parseFloat(row.settings?.inputs?.initialDeposit || row.settings?.inputs?.InitialDeposit || row.settings?.initialDeposit || row.settings?.InitialDeposit || 10000);

  const fmtCurrency = (val) => {
    if (val === null || val === undefined || val === '-') return '-';
    const num = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
    if (isNaN(num)) return String(val);
    return (num >= 0 ? '$' : '-$') + Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const fmtPercent = (val) => {
    if (val === null || val === undefined || val === '-') return '-';
    const num = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
    if (isNaN(num)) return String(val);
    return num.toFixed(2) + '%';
  };

  const fmtRatio = (val) => {
    if (val === null || val === undefined || val === '-') return '-';
    const num = parseFloat(val);
    if (isNaN(num)) return String(val);
    return num.toFixed(2);
  };

  const getDynamicDrawdown = () => {
    if (!hasDateRange || row.max_drawdown === undefined || row.max_drawdown === null) return '-';
    return fmtCurrency(row.max_drawdown);
  };

  const getStaticDrawdown = () => {
    if (!results.balanceDrawdownMaximal) return '-';
    const str = String(results.balanceDrawdownMaximal);
    if (drawdownUnit === 'percent') {
      const match = str.match(/\(([^)]+)\)/);
      return match ? match[1] : str;
    } else {
      return fmtCurrency(str.split('(')[0].trim());
    }
  };

  const getStaticWinrate = () => {
    if (!results.profitTrades) return '-';
    const match = String(results.profitTrades).match(/\(([^)]+)\)/);
    return match ? match[1] : results.profitTrades;
  };

  const getStaticLargestProfitRatio = () => {
    if (!results.largestProfitTrade || !results.totalNetProfit) return '-';
    const p = parseFloat(String(results.largestProfitTrade).replace(/[^0-9.-]/g, ''));
    const np = parseFloat(String(results.totalNetProfit).replace(/[^0-9.-]/g, ''));
    if (isNaN(p) || isNaN(np) || np === 0) return '-';
    return fmtPercent((p / np) * 100);
  };

  const getStaticRiskReward = () => {
    if (!results.averageProfitTrade || !results.averageLossTrade) return '-';
    const p = parseFloat(String(results.averageProfitTrade).replace(/[^0-9.-]/g, ''));
    const l = Math.abs(parseFloat(String(results.averageLossTrade).replace(/[^0-9.-]/g, '')));
    if (isNaN(p) || isNaN(l) || l === 0) return '-';
    return fmtRatio(p / l);
  };

  return [
    {
      name: 'Net Profit',
      drValue: hasDateRange ? fmtCurrency(row.total_profit) : '-',
      fpValue: fmtCurrency(results.totalNetProfit),
      color: isDarkMode ? '#4fcc5d' : '#2e7d32'
    },
    {
      name: 'Max Drawdown',
      drValue: getDynamicDrawdown(),
      fpValue: getStaticDrawdown(),
      color: isDarkMode ? '#ff4d4f' : '#d32f2f'
    },
    {
      name: 'P/D Ratio',
      drValue: hasDateRange ? fmtRatio(row.pd_ratio) : '-',
      fpValue: getPdValue(row),
      color: isDarkMode ? '#fff' : '#000'
    },
    {
      name: 'Win Rate',
      drValue: hasDateRange ? fmtPercent(row.winrate) : '-',
      fpValue: getStaticWinrate(),
      color: isDarkMode ? '#fff' : '#000'
    },
    {
      name: 'Total Trades',
      drValue: hasDateRange ? row.quantity : '-',
      fpValue: results.totalTrades || '-',
      color: isDarkMode ? '#fff' : '#000'
    },
    {
      name: 'Profit Factor',
      drValue: hasDateRange ? fmtRatio(row.profit_factor) : '-',
      fpValue: results.profitFactor || '-',
      color: isDarkMode ? '#fff' : '#000'
    },
    {
      name: 'Sharpe Ratio',
      drValue: hasDateRange ? fmtRatio(row.sharpe_ratio) : '-',
      fpValue: results.sharpeRatio || '-',
      color: isDarkMode ? '#fff' : '#000'
    },
    {
      name: 'Recovery Factor',
      drValue: hasDateRange ? fmtRatio(row.recovery_factor) : '-',
      fpValue: results.recoveryFactor || '-',
      color: isDarkMode ? '#fff' : '#000'
    },
    {
      name: 'LR Correlation',
      drValue: hasDateRange ? (row.lr_correlation !== undefined && row.lr_correlation !== null ? parseFloat(row.lr_correlation).toFixed(4) : '-') : '-',
      fpValue: results.lrCorrelation || '-',
      color: isDarkMode ? '#fff' : '#000'
    },
    {
      name: 'Largest Loss Trade',
      drValue: hasDateRange ? fmtCurrency(row.largest_loss_trade) : '-',
      fpValue: fmtCurrency(results.largestLossTrade),
      color: isDarkMode ? '#ff4d4f' : '#d32f2f'
    },
    {
      name: 'LPT Ratio',
      drValue: hasDateRange ? fmtPercent(row.largest_profit_trade_ratio) : '-',
      fpValue: getStaticLargestProfitRatio(),
      color: isDarkMode ? '#fff' : '#000'
    },
    {
      name: 'Risk-Reward Ratio',
      drValue: hasDateRange ? fmtRatio(row.risk_reward_ratio) : '-',
      fpValue: getStaticRiskReward(),
      color: isDarkMode ? '#fff' : '#000'
    }
  ];
};

export default function StrategyTable({
  getTableTitle,
  copying,
  copySuccess,
  copiedCount,
  handleCopyAllIds,
  pagination,
  loading,
  data,
  expandedRows,
  toggleRow,
  appliedDateRange,
  analysisRunActive = false,
  appliedDrawdownUnit,
  sortOrder,
  setSortOrder,
  handleOpenDialog,
  setSnackbar,
  page,
  setPage,
  pageSize,
  setPageSize,
  handlePageChange,
  onDeleteStrategy
}) {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  return (
    <Grid size={12}>
      <MainCard
        title={getTableTitle()}
        secondary={
          <Button
            variant="outlined"
            size="small"
            startIcon={copying ? <CircularProgress size={14} color="inherit" /> : copySuccess ? <CheckOutlined /> : <CopyOutlined />}
            onClick={handleCopyAllIds}
            disabled={pagination.total === 0 || copying}
            sx={{
              minWidth: '140px',
              fontSize: '0.75rem',
              fontWeight: 600,
              textTransform: 'none',
              borderColor: copySuccess ? 'success.main' : (isDarkMode ? 'rgba(255, 255, 255, 0.3)' : 'grey.400'),
              color: copySuccess ? 'success.main' : (isDarkMode ? 'rgba(255, 255, 255, 0.85)' : 'text.primary'),
              backgroundColor: copySuccess ? (isDarkMode ? 'rgba(40, 167, 69, 0.1)' : 'rgba(40, 167, 69, 0.05)') : 'transparent',
              '&:hover': {
                borderColor: copySuccess ? 'success.dark' : (isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'grey.600'),
                backgroundColor: copySuccess ? (isDarkMode ? 'rgba(40, 167, 69, 0.15)' : 'rgba(40, 167, 69, 0.1)') : (isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)')
              },
              '&.Mui-disabled': {
                borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)',
                color: isDarkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.26)',
                backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.04)' : 'transparent'
              }
            }}
          >
            {copying ? 'Copying...' : copySuccess ? `Copied ${copiedCount}!` : `Copy All Strategy ID (${pagination.total})`}
          </Button>
        }
      >
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <TableContainer component={Paper} sx={{ boxShadow: 'none' }}>
              <Table sx={{ minWidth: 750 }}>
                <TableHead>
                  <TableRow sx={{ backgroundColor: isDarkMode ? '#1f1f1f' : '#fafafa' }}>
                    <TableCell sx={{ width: 40 }} />
                    <TableCell sx={{ fontWeight: 600 }}>Strategy ID</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Backtest</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Symbol</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>
                      Timeframe
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>
                      P/D
                    </TableCell>
                    {analysisRunActive && (
                      <TableCell align="center" sx={{ fontWeight: 600 }}>
                        Threshold
                      </TableCell>
                    )}
                    <TableCell align="center" sx={{ fontWeight: 600 }}>
                      <Box
                        component="span"
                        onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                        sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          cursor: 'pointer',
                          userSelect: 'none',
                          '&:hover': { color: 'primary.main' }
                        }}
                      >
                        Total Trades
                        {sortOrder === 'asc' ? (
                          <CaretUpOutlined style={{ fontSize: 11 }} />
                        ) : (
                          <CaretDownOutlined style={{ fontSize: 11, opacity: sortOrder === 'desc' ? 1 : 0.3 }} />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>
                      Accept Buy
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>
                      Accept Sell
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>
                      Settings
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>
                      Results
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>
                      Chart
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={analysisRunActive ? 14 : 13} align="center" sx={{ py: 8 }}>
                        <Typography variant="body1" color="textSecondary">
                          No strategies found
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.map((row) => {
                      const acceptBuy = row.settings?.inputs?.AcceptBuy;
                      const acceptSell = row.settings?.inputs?.AcceptSell;
                      const isExpanded = !!expandedRows[`${row.strategy_id}-${row.backtest_table}`];
                      const hasDateRange = analysisRunActive || !!(appliedDateRange.startDate && appliedDateRange.endDate);
                      const metrics = getMetricsList(row, hasDateRange, appliedDrawdownUnit, isDarkMode);

                      return (
                        <Fragment key={`${row.strategy_id}-${row.backtest_table}`}>
                          <TableRow hover>
                            <TableCell align="center">
                              <IconButton
                                size="small"
                                onClick={() => toggleRow(row.strategy_id, row.backtest_table)}
                                sx={{ transition: 'transform 0.2s' }}
                              >
                                {isExpanded ? <DownOutlined /> : <RightOutlined />}
                              </IconButton>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {row.strategy_id}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Chip label={getBacktestDisplayName(row.backtest_table)} size="small" variant="outlined" color="primary" />
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2">{row.symbol || '-'}</Typography>
                            </TableCell>
                            <TableCell align="center">
                              <Typography variant="body2">{row.timeframe || '-'}</Typography>
                            </TableCell>
                            <TableCell align="center">
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {getPdValue(row)}
                              </Typography>
                            </TableCell>
                            {analysisRunActive && (
                              <TableCell align="center">
                                <Chip
                                  label={row.threshold_applied != null ? `${row.threshold_applied} lots` : '-'}
                                  size="small"
                                  color="warning"
                                  variant="outlined"
                                />
                              </TableCell>
                            )}
                            <TableCell align="center">
                              <Typography variant="body2">
                                {(hasDateRange
                                  ? row.quantity
                                  : row.results?.totalTrades) ?? '-'}
                              </Typography>
                            </TableCell>
                            <TableCell align="center">
                              <Chip
                                label={acceptBuy ? 'Yes' : 'No'}
                                size="small"
                                color={acceptBuy ? 'success' : 'default'}
                                variant="outlined"
                              />
                            </TableCell>
                            <TableCell align="center">
                              <Chip
                                label={acceptSell ? 'Yes' : 'No'}
                                size="small"
                                color={acceptSell ? 'success' : 'default'}
                                variant="outlined"
                              />
                            </TableCell>
                            <TableCell align="center">
                              <Tooltip title="View Settings">
                                <IconButton size="medium" color="primary" onClick={() => handleOpenDialog('settings', row)}>
                                  <SettingOutlined />
                                </IconButton>
                              </Tooltip>
                            </TableCell>
                            <TableCell align="center">
                              <Tooltip title="View Results">
                                <IconButton size="medium" color="info" onClick={() => handleOpenDialog('results', row)}>
                                  <BarChartOutlined />
                                </IconButton>
                              </Tooltip>
                            </TableCell>
                            <TableCell align="center" sx={{ verticalAlign: 'middle', py: 1.5 }}>
                              <MiniSparkline row={row} dateRange={appliedDateRange} />
                            </TableCell>
                            <TableCell align="center">
                              <Stack direction="row" spacing={0.5} justifyContent="center">
                                <Tooltip title="View Google Sheet">
                                  <IconButton
                                    size="medium"
                                    color="primary"
                                    onClick={() => {
                                      const sheetId = row.settings?.sheet_id;
                                      if (!sheetId) {
                                        setSnackbar({
                                          open: true,
                                          message: 'Strategy này chưa có link sheet. Vui lòng sync lại để cập nhật.',
                                          severity: 'warning'
                                        });
                                        return;
                                      }
                                      window.open(`https://docs.google.com/spreadsheets/d/${sheetId}`, '_blank', 'noopener,noreferrer');
                                      setSnackbar({
                                        open: true,
                                        message:
                                          'Đã mở sheet trong tab mới. Nếu gặp lỗi "Permission denied", vui lòng liên hệ admin để được cấp quyền truy cập.',
                                        severity: 'info'
                                      });
                                    }}
                                  >
                                    <EyeOutlined />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Download as Excel">
                                  <IconButton
                                    size="medium"
                                    color="success"
                                    onClick={() => {
                                      const sheetId = row.settings?.sheet_id;
                                      if (!sheetId) {
                                        setSnackbar({
                                          open: true,
                                          message: 'Strategy này chưa có link sheet. Vui lòng sync lại để cập nhật.',
                                          severity: 'warning'
                                        });
                                        return;
                                      }
                                      downloadStrategySheet(sheetId, row.strategy_id);
                                    }}
                                  >
                                    <DownloadOutlined />
                                  </IconButton>
                                </Tooltip>
                                {onDeleteStrategy && (
                                  <Tooltip title="Xoá Strategy">
                                    <IconButton
                                      size="medium"
                                      color="error"
                                      onClick={() => onDeleteStrategy(row.strategy_id, row.backtest_table)}
                                    >
                                      <DeleteOutlined />
                                    </IconButton>
                                  </Tooltip>
                                )}
                              </Stack>
                            </TableCell>
                          </TableRow>
                          
                          {/* Expanded indicators Row */}
                          <TableRow sx={{ '& > *': { borderBottom: 'unset' } }}>
                            <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={analysisRunActive ? 14 : 13}>
                              <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                <Box
                                  sx={{
                                    margin: '4px 24px 20px 24px',
                                    border: '1.5px solid',
                                    borderColor: isDarkMode ? 'rgba(64, 169, 255, 0.2)' : 'rgba(24, 144, 255, 0.2)',
                                    borderRadius: '6px',
                                    p: 2,
                                    bgcolor: 'transparent'
                                  }}
                                >
                                  {/* Legend */}
                                  <Stack direction="row" spacing={2.5} alignItems="center" sx={{ mb: 2 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                      <Box
                                        sx={{
                                          width: 8,
                                          height: 8,
                                          borderRadius: '50%',
                                          bgcolor: hasDateRange ? '#52c41a' : (isDarkMode ? '#595959' : '#bfbfbf'),
                                          boxShadow: hasDateRange ? '0 0 8px #52c41a' : 'none',
                                          transition: 'all 0.3s ease'
                                        }}
                                      />
                                      <Typography
                                        variant="caption"
                                        sx={{
                                          fontWeight: 600,
                                          color: hasDateRange ? (isDarkMode ? '#40a9ff' : '#096dd9') : 'text.secondary',
                                          opacity: hasDateRange ? 1 : 0.6,
                                          transition: 'all 0.3s ease'
                                        }}
                                      >
                                        Date Range (Động)
                                      </Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                      <Box
                                        sx={{
                                          width: 8,
                                          height: 8,
                                          borderRadius: '50%',
                                          bgcolor: !hasDateRange ? '#52c41a' : (isDarkMode ? '#595959' : '#bfbfbf'),
                                          boxShadow: !hasDateRange ? '0 0 8px #52c41a' : 'none',
                                          transition: 'all 0.3s ease'
                                        }}
                                      />
                                      <Typography
                                        variant="caption"
                                        sx={{
                                          fontWeight: 600,
                                          color: !hasDateRange ? (isDarkMode ? '#40a9ff' : '#096dd9') : 'text.secondary',
                                          opacity: !hasDateRange ? 1 : 0.6,
                                          transition: 'all 0.3s ease'
                                        }}
                                      >
                                        Full Period (Tĩnh)
                                      </Typography>
                                    </Box>
                                  </Stack>

                                  {/* Date range header — chỉ hiển thị khi user đang lọc theo date range */}
                                  {hasDateRange && (
                                    <Box
                                      sx={{
                                        mb: 1.5,
                                        px: 1.5,
                                        py: 0.75,
                                        borderRadius: '6px',
                                        bgcolor: isDarkMode ? 'rgba(64, 169, 255, 0.08)' : 'rgba(24, 144, 255, 0.06)',
                                        border: '1px solid',
                                        borderColor: isDarkMode ? 'rgba(64, 169, 255, 0.25)' : 'rgba(24, 144, 255, 0.2)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 1
                                      }}
                                    >
                                      <CalendarOutlined style={{ fontSize: 13, color: isDarkMode ? '#40a9ff' : '#096dd9' }} />
                                      <Typography
                                        variant="caption"
                                        sx={{
                                          fontWeight: 700,
                                          fontSize: '0.75rem',
                                          color: isDarkMode ? '#40a9ff' : '#096dd9'
                                        }}
                                      >
                                        Date Range:&nbsp;
                                      </Typography>
                                      <Typography
                                        variant="caption"
                                        sx={{
                                          fontWeight: 600,
                                          fontSize: '0.75rem',
                                          color: isDarkMode ? '#e2e8f0' : '#1e3a5f',
                                          fontFamily: 'monospace'
                                        }}
                                      >
                                        {appliedDateRange.startDate?.format('DD/MM/YYYY')} → {appliedDateRange.endDate?.format('DD/MM/YYYY')}
                                      </Typography>
                                    </Box>
                                  )}

                                  {/* Grid of 6 Columns x 2 stacked rows of Metrics */}
                                  <Grid container spacing={2} sx={{ width: '100%', m: 0 }}>
                                    {[
                                      [metrics[0], metrics[1]],
                                      [metrics[2], metrics[3]],
                                      [metrics[4], metrics[5]],
                                      [metrics[6], metrics[7]],
                                      [metrics[8], metrics[9]],
                                      [metrics[10], metrics[11]]
                                    ].map((pair, colIdx) => (
                                      <Grid key={colIdx} size={{ xs: 12, sm: 6, md: 2 }}>
                                        <Stack spacing={1.5}>
                                          {pair.map((metric, metricIdx) => (
                                            <Box
                                              key={metricIdx}
                                              sx={{
                                                p: 1.25,
                                                bgcolor: isDarkMode ? 'background.paper' : '#fff',
                                                border: '1px solid',
                                                borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                                                borderRadius: '6px',
                                                boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                                height: '100%',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: 1
                                              }}
                                            >
                                              {/* Metric name + label inline */}
                                              <Box
                                                sx={{
                                                  display: 'flex',
                                                  alignItems: 'center',
                                                  gap: 0.75,
                                                  borderBottom: '1px solid',
                                                  borderColor: isDarkMode ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
                                                  pb: 0.75
                                                }}
                                              >
                                                <Typography
                                                  variant="caption"
                                                  sx={{
                                                    color: 'text.primary',
                                                    fontWeight: 700,
                                                    fontSize: '0.78rem',
                                                    lineHeight: 1.2,
                                                    flex: 1
                                                  }}
                                                >
                                                  {metric.name}
                                                </Typography>
                                                <Box
                                                  sx={{
                                                    px: 0.6,
                                                    py: 0.15,
                                                    borderRadius: '4px',
                                                    bgcolor: (metric.drValue !== '-' && hasDateRange)
                                                      ? (isDarkMode ? 'rgba(64,169,255,0.15)' : 'rgba(24,144,255,0.1)')
                                                      : (isDarkMode ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)'),
                                                    border: '1px solid',
                                                    borderColor: (metric.drValue !== '-' && hasDateRange)
                                                      ? (isDarkMode ? 'rgba(64,169,255,0.35)' : 'rgba(24,144,255,0.3)')
                                                      : (isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'),
                                                    flexShrink: 0
                                                  }}
                                                >
                                                  <Typography
                                                    sx={{
                                                      fontSize: '0.6rem',
                                                      fontWeight: 700,
                                                      lineHeight: 1,
                                                      color: (metric.drValue !== '-' && hasDateRange)
                                                        ? (isDarkMode ? '#40a9ff' : '#096dd9')
                                                        : 'text.secondary',
                                                      textTransform: 'uppercase',
                                                      letterSpacing: '0.03em',
                                                      whiteSpace: 'nowrap'
                                                    }}
                                                  >
                                                    {metric.drValue !== '-' && hasDateRange ? 'Date Range' : 'Full Period'}
                                                  </Typography>
                                                </Box>
                                              </Box>

                                              {/* Value */}
                                              <Typography
                                                variant="body2"
                                                sx={{
                                                  fontWeight: 700,
                                                  fontSize: '0.85rem',
                                                  color: metric.color,
                                                  lineHeight: 1.2
                                                }}
                                              >
                                                {metric.drValue !== '-' && hasDateRange ? metric.drValue : metric.fpValue}
                                              </Typography>
                                            </Box>
                                          ))}
                                        </Stack>
                                      </Grid>
                                    ))}
                                  </Grid>
                                </Box>
                              </Collapse>
                            </TableCell>
                          </TableRow>
                        </Fragment>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Pagination with Rows Per Page */}
            
            
            <CustomTablePagination
              count={pagination.total}
              page={page - 1}
              rowsPerPage={pagination.pageSize}
              onPageChange={(event, newPage) => setPage(newPage + 1)}
              onRowsPerPageChange={(event) => {
                const newPageSize = parseInt(event.target.value, 10);
                setPageSize(newPageSize);
                setPage(1);
              }}
            />
          </>
        )}
      </MainCard>
    </Grid>
  );
}
