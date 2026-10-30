import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Grid,
  Box,
  Typography,
  IconButton,
  ToggleButtonGroup,
  ToggleButton,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Paper,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TablePagination,
  Pagination,
  TextField,
  InputAdornment,
  Tooltip
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import CustomTablePagination from 'components/CustomTablePagination';
import { QuestionCircleOutlined, SearchOutlined } from '@ant-design/icons';
import MainCard from 'components/MainCard';
import CardLoader from 'components/CardLoader';

const YEARS = ['2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026'];

const getSemanticColors = (isDarkMode) => {
  if (isDarkMode) {
    return {
      success: { text: '#4ade80', bg: 'rgba(74, 222, 128, 0.15)', border: 'rgba(74, 222, 128, 0.3)' },
      warning: { text: '#fbbf24', bg: 'rgba(251, 191, 36, 0.15)', border: 'rgba(251, 191, 36, 0.3)' },
      error: { text: '#f87171', bg: 'rgba(248, 113, 113, 0.15)', border: 'rgba(248, 113, 113, 0.3)' },
      info: { text: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)', border: 'rgba(56, 189, 248, 0.3)' }
    };
  } else {
    return {
      success: { text: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
      warning: { text: '#b45309', bg: '#fffbeb', border: '#fef3c7' },
      error: { text: '#b91c1c', bg: '#fef2f2', border: '#fee2e2' },
      info: { text: '#0369a1', bg: '#f0f9ff', border: '#e0f2fe' }
    };
  }
};

function TableToolbar({ search, onSearch, placeholder, filterSlot, countLabel }) {
  const theme = useTheme();
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
      <TextField
        size="small"
        placeholder={placeholder || 'Tìm strategy, symbol...'}
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        sx={{
          minWidth: 260,
          flex: { xs: '1 1 100%', sm: '0 1 320px' },
          '& .MuiOutlinedInput-root': {
            borderRadius: 2,
            bgcolor: theme.palette.mode === 'dark' ? 'background.default' : '#FFFFFF',
            '&.Mui-focused fieldset': { borderColor: theme.palette.mode === 'dark' ? 'primary.main' : '#2E75B6' }
          }
        }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchOutlined style={{ fontSize: 14, color: theme.palette.mode === 'dark' ? theme.palette.primary.main : '#2E75B6' }} />
            </InputAdornment>
          )
        }}
      />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        {filterSlot}
        {countLabel && (
          <Typography
            variant="caption"
            sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? 'text.secondary' : 'var(--chart-title-color, #1F3864)' }}
          >
            {countLabel}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

function useTableState(data, searchFn, defaultRows = 50) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(defaultRows);

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((row) => searchFn(row, q));
  }, [data, search, searchFn]);

  const paginated = useMemo(() => {
    const start = page * rowsPerPage;
    return filtered.slice(start, start + rowsPerPage);
  }, [filtered, page, rowsPerPage]);

  const handleSearch = (val) => {
    setSearch(val);
    setPage(0);
  };

  return { search, setSearch: handleSearch, page, setPage, rowsPerPage, setRowsPerPage, filtered, paginated };
}

function HeatmapCell({ label, profit, wr, metric, maxAbsProfit }) {
  const theme = useTheme();
  const isProfitMetric = metric === 'profit';
  const isNegative = isProfitMetric ? profit < 0 : wr < 50;
  const intensity = isProfitMetric ? Math.min(1, Math.abs(profit) / (maxAbsProfit || 1)) : Math.min(1, Math.abs(wr - 50) / 25);
  const bg = isNegative ? `rgba(255, 0, 0, ${0.08 + intensity * 0.55})` : `rgba(112, 173, 71, ${0.08 + intensity * 0.55})`;

  const formatProfit = (val) => {
    const absVal = Math.abs(val);
    const sign = val >= 0 ? '+' : '-';
    if (absVal >= 1000000) {
      return `${sign}$${(absVal / 1000000).toFixed(1)}M`;
    }
    if (absVal >= 1000) {
      return `${sign}$${(absVal / 1000).toFixed(1)}k`;
    }
    return `${sign}$${absVal}`;
  };

  return (
    <Tooltip title={`${label}: ${profit >= 0 ? '+' : ''}$${profit.toLocaleString()} · WR ${wr}%`} arrow placement="top">
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          py: 1.25,
          px: 0.5,
          borderRadius: 1.5,
          bgcolor: bg,
          border: '1px solid',
          borderColor: isNegative ? 'rgba(255,0,0,0.15)' : 'rgba(112,173,71,0.15)',
          textAlign: 'center',
          cursor: 'default',
          transition: 'transform 0.12s, box-shadow 0.12s',
          '&:hover': {
            transform: 'scaleY(1.08) scaleX(1.02)',
            zIndex: 1,
            boxShadow: isNegative ? '0 4px 8px rgba(255,0,0,0.15)' : '0 4px 8px rgba(112,173,71,0.15)'
          }
        }}
      >
        <Typography
          variant="caption"
          sx={{
            fontWeight: 700,
            display: 'block',
            fontSize: '0.65rem',
            color: theme.palette.mode === 'dark' ? 'text.secondary' : 'var(--chart-title-color, #1F3864)'
          }}
        >
          {label}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 800,
            fontSize: '0.65rem',
            color: isNegative
              ? theme.palette.mode === 'dark'
                ? '#ff4d4f'
                : '#FF0000'
              : theme.palette.mode === 'dark'
                ? '#73d13d'
                : '#70AD47',
            whiteSpace: 'nowrap'
          }}
        >
          {isProfitMetric ? formatProfit(profit) : `${wr}%`}
        </Typography>
      </Box>
    </Tooltip>
  );
}

export default function SeasonalityTab({
  HOUR_HEATMAP,
  DAY_HEATMAP,
  MONTH_HEATMAP,
  STRATEGY_YEARS,
  QUARTERLY_SEASONALITY,
  behaviorLoading,
  theme,
  renderHeaderActions,
  openHelpModal
}) {
  const navigate = useNavigate();

  const [seasonalityDim, setSeasonalityDim] = useState('hour');
  const [heatmapMetric, setHeatmapMetric] = useState('profit');
  const [annualFilter, setAnnualFilter] = useState('all');
  const [selectedQuarterYear, setSelectedQuarterYear] = useState('All');



  const maxHourProfit = useMemo(() => {
    if (HOUR_HEATMAP.length === 0) return 1;
    return Math.max(...HOUR_HEATMAP.map((h) => Math.abs(h.profit)));
  }, [HOUR_HEATMAP]);

  const searchStrategy = useCallback((row, q) => {
    return (
      String(row.id || '')
        .toLowerCase()
        .includes(q) ||
      String(row.symbol || '')
        .toLowerCase()
        .includes(q) ||
      String(row.status || '')
        .toLowerCase()
        .includes(q)
    );
  }, []);

  const annualSource = useMemo(() => {
    if (annualFilter === 'stable') return STRATEGY_YEARS.filter((r) => r.stable);
    if (annualFilter === 'unstable') return STRATEGY_YEARS.filter((r) => !r.stable);
    return STRATEGY_YEARS;
  }, [annualFilter, STRATEGY_YEARS]);

  const annualTable = useTableState(annualSource, searchStrategy, 50);

  const formatYear = (v) => {
    if (v === undefined || v === null || isNaN(Number(v))) {
      return (
        <Typography component="span" variant="caption" sx={{ color: 'text.secondary', opacity: 0.45 }}>
          —
        </Typography>
      );
    }
    const colors = getSemanticColors(theme.palette.mode === 'dark');
    return (
      <Typography component="span" variant="caption" sx={{ fontWeight: 700, color: v >= 0 ? colors.success.text : colors.error.text }}>
        {v >= 0 ? '+' : ''}${Number(v).toLocaleString()}
      </Typography>
    );
  };

  const quarterYears = useMemo(() => {
    const years = new Set();
    QUARTERLY_SEASONALITY.forEach((item) => {
      if (item.year) {
        years.add(item.year);
      }
    });
    years.add('All');
    return Array.from(years).sort((a, b) => {
      if (a === 'All') return -1;
      if (b === 'All') return 1;
      return b.localeCompare(a);
    });
  }, [QUARTERLY_SEASONALITY]);

  const filteredQuarterData = useMemo(() => {
    const hasYearField = QUARTERLY_SEASONALITY.some((item) => 'year' in item);
    if (!hasYearField) {
      return QUARTERLY_SEASONALITY;
    }
    return QUARTERLY_SEASONALITY.filter((item) => item.year === selectedQuarterYear);
  }, [QUARTERLY_SEASONALITY, selectedQuarterYear]);

  return (
    <Box sx={{ width: '100%' }}>
        <MainCard
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Typography variant="subtitle2" fontWeight={800} sx={{ color: 'var(--chart-title-color, #1F3864)' }}>
              BẢN ĐỒ NHIỆT HIỆU SUẤT
            </Typography>
            <IconButton
              size="small"
              onClick={() =>
                openHelpModal(
                  'BẢN ĐỒ NHIỆT HIỆU SUẤT (TEMPORAL HEATMAP)',
                  'Trực quan hóa phân bổ lợi nhuận và tỷ lệ thắng theo 3 chiều thời gian (Giờ trong ngày, Thứ trong tuần, Tháng trong năm) để phát hiện các khoảng thời gian giao dịch tối ưu.'
                )
              }
            >
              <QuestionCircleOutlined style={{ fontSize: '13px' }} />
            </IconButton>
          </Box>
        }
        secondary={renderHeaderActions('Bản đồ nhiệt hiệu suất', 'Phân tích Bản đồ nhiệt hiệu suất theo thời gian', {
          hourly: HOUR_HEATMAP,
          daily: DAY_HEATMAP,
          monthly: MONTH_HEATMAP
        })}
        sx={{ mb: 3, width: '100%' }}
      >
        {behaviorLoading ? (
          <CardLoader height={240} size={30} message="Đang tải bản đồ nhiệt hiệu suất..." />
        ) : (
          <>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 2 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center', ml: 'auto' }}>
            <ToggleButtonGroup
              size="small"
              value={seasonalityDim}
              exclusive
              onChange={(_, v) => v && setSeasonalityDim(v)}
              sx={{
                bgcolor: theme.palette.mode === 'dark' ? 'background.default' : '#FFFFFF',
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                '& .MuiToggleButton-root': {
                  color: theme.palette.mode === 'dark' ? 'text.secondary' : 'var(--chart-title-color, #1F3864)',
                  fontWeight: 600,
                  textTransform: 'none',
                  px: 2,
                  '&.Mui-selected': {
                    bgcolor: theme.palette.mode === 'dark' ? 'primary.main' : 'var(--chart-title-color, #1F3864)',
                    color: '#FFFFFF',
                    '&:hover': { bgcolor: theme.palette.mode === 'dark' ? 'primary.dark' : '#2E75B6' }
                  }
                }
              }}
            >
              <ToggleButton value="hour">Giờ</ToggleButton>
              <ToggleButton value="day">Thứ</ToggleButton>
              <ToggleButton value="month">Tháng</ToggleButton>
            </ToggleButtonGroup>
            <ToggleButtonGroup
              size="small"
              value={heatmapMetric}
              exclusive
              onChange={(_, v) => v && setHeatmapMetric(v)}
              sx={{
                bgcolor: theme.palette.mode === 'dark' ? 'background.default' : '#FFFFFF',
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                '& .MuiToggleButton-root': {
                  color: theme.palette.mode === 'dark' ? 'text.secondary' : 'var(--chart-title-color, #1F3864)',
                  fontWeight: 600,
                  textTransform: 'none',
                  px: 2,
                  '&.Mui-selected': {
                    bgcolor: theme.palette.mode === 'dark' ? 'primary.main' : 'var(--chart-title-color, #1F3864)',
                    color: '#FFFFFF',
                    '&:hover': { bgcolor: theme.palette.mode === 'dark' ? 'primary.dark' : '#2E75B6' }
                  }
                }
              }}
            >
              <ToggleButton value="profit">Profit</ToggleButton>
              <ToggleButton value="wr">Winrate</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Box>

        {seasonalityDim === 'hour' && (
          <Box sx={{ width: '100%', overflowX: 'auto', pb: 1 }}>
            <Box sx={{ display: 'flex', gap: 0.5, minWidth: `${24 * 52}px` }}>
              {HOUR_HEATMAP.map((h) => (
                <HeatmapCell
                  key={h.hour}
                  label={h.hour}
                  profit={h.profit}
                  wr={h.wr}
                  metric={heatmapMetric}
                  maxAbsProfit={maxHourProfit}
                />
              ))}
            </Box>
          </Box>
        )}
        {seasonalityDim === 'day' && (
          <Box sx={{ display: 'flex', gap: 1, width: '100%' }}>
            {DAY_HEATMAP.map((d) => (
              <Box key={d.day} sx={{ flex: 1 }}>
                <HeatmapCell label={d.label} profit={d.profit} wr={d.wr} metric={heatmapMetric} maxAbsProfit={12000} />
              </Box>
            ))}
          </Box>
        )}
        {seasonalityDim === 'month' && (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 1, width: '100%' }}>
            {MONTH_HEATMAP.map((m) => (
              <HeatmapCell key={m.month} label={m.month} profit={m.profit} wr={m.wr} metric={heatmapMetric} maxAbsProfit={13000} />
            ))}
          </Box>
        )}

        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? 'primary.main' : '#2E75B6' }}>
            Xanh = tích cực · Đỏ = tiêu cực · Độ đậm = cường độ
          </Typography>
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'var(--chart-title-color, #1F3864)' }}>
            Portfolio aggregate (1 query, 3 chiều)
          </Typography>
            </Box>
          </>
        )}
      </MainCard>

      <Grid container spacing={2} sx={{ width: '100%', mb: 3 }}>
        <Grid size={12}>
          <MainCard
            title={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography variant="subtitle2" fontWeight={800} sx={{ color: 'var(--chart-title-color, #1F3864)' }}>
                  TÍNH ỔN ĐỊNH HÀNG NĂM
                </Typography>
                <IconButton
                  size="small"
                  onClick={() =>
                    openHelpModal(
                      'TÍNH ỔN ĐỊNH HÀNG NĂM (ANNUAL STABILITY)',
                      'Đo lường tính ổn định của từng strategy qua các năm. Phân biệt strategy giữ vững phong độ ổn định lâu dài (Stable) với strategy chỉ tốt trong một giai đoạn ngắn (Volatile).'
                    )
                  }
                >
                  <QuestionCircleOutlined style={{ fontSize: '13px' }} />
                </IconButton>
              </Box>
            }
            secondary={renderHeaderActions(
              'Tính ổn định hàng năm',
              'Phân tích Tính ổn định hàng năm của các chiến lược',
              STRATEGY_YEARS
            )}
            sx={{ width: '100%', height: '100%' }}
          >
            {behaviorLoading ? (
              <CardLoader height={320} size={30} message="Đang tải dữ liệu ổn định..." />
            ) : (
              <>
                <TableToolbar
              search={annualTable.search}
              onSearch={annualTable.setSearch}
              filterSlot={
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <InputLabel
                    sx={{
                      color: theme.palette.mode === 'dark' ? 'text.secondary' : 'var(--chart-title-color, #1F3864)',
                      fontWeight: 600
                    }}
                  >
                    Ổn định
                  </InputLabel>
                  <Select
                    label="Ổn định"
                    value={annualFilter}
                    onChange={(e) => {
                      setAnnualFilter(e.target.value);
                      annualTable.setPage(0);
                    }}
                    sx={{
                      borderRadius: 2,
                      bgcolor: theme.palette.mode === 'dark' ? 'background.default' : '#FFFFFF',
                      '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
                      '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: theme.palette.mode === 'dark' ? 'primary.main' : '#2E75B6'
                      },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: theme.palette.mode === 'dark' ? 'primary.main' : 'var(--chart-title-color, #1F3864)'
                      }
                    }}
                  >
                    <MenuItem value="all">Tất cả</MenuItem>
                    <MenuItem value="stable">Ổn định (≥5 năm dương)</MenuItem>
                    <MenuItem value="unstable">Không ổn định</MenuItem>
                  </Select>
                </FormControl>
              }
              countLabel={`${annualTable.filtered.length} strategies`}
            />
            <TableContainer
              component={Paper}
              sx={{ boxShadow: 'none', border: '1px solid', borderColor: 'divider', borderRadius: 1.5, maxHeight: 420 }}
            >
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.03)' : 'background.default' }}>
                    <TableCell
                      align="center"
                      sx={{ minWidth: 140, fontWeight: 600, color: theme.palette.mode === 'dark' ? 'text.primary' : 'text.secondary' }}
                    >
                      Strategy
                    </TableCell>
                    {YEARS.map((y) => (
                      <TableCell
                        key={y}
                        align="center"
                        sx={{ fontWeight: 600, color: theme.palette.mode === 'dark' ? 'text.primary' : 'text.secondary' }}
                      >
                        {y}
                      </TableCell>
                    ))}
                    <TableCell
                      align="center"
                      sx={{ fontWeight: 600, color: theme.palette.mode === 'dark' ? 'text.primary' : 'text.secondary' }}
                    >
                      Ổn định
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {annualTable.paginated.map((row) => (
                    <TableRow key={row.id} hover>
                      <TableCell
                        align="center"
                        sx={{
                          fontWeight: 700,
                          fontFamily: 'monospace',
                          fontSize: '0.72rem',
                          color: theme.palette.mode === 'dark' ? 'primary.main' : 'var(--chart-title-color, #1F3864)',
                          cursor: 'pointer',
                          transition: 'color 0.15s ease-in-out',
                          '&:hover': {
                            color: theme.palette.mode === 'dark' ? '#00f5ff' : 'primary.dark',
                            textDecoration: 'underline'
                          }
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/strategy-input?search=${row.id}`);
                        }}
                      >
                        {row.id}
                      </TableCell>
                      <TableCell align="center">{formatYear(row.y19)}</TableCell>
                      <TableCell align="center">{formatYear(row.y20)}</TableCell>
                      <TableCell align="center">{formatYear(row.y21)}</TableCell>
                      <TableCell align="center">{formatYear(row.y22)}</TableCell>
                      <TableCell align="center">{formatYear(row.y23)}</TableCell>
                      <TableCell align="center">{formatYear(row.y24)}</TableCell>
                      <TableCell align="center">{formatYear(row.y25)}</TableCell>
                      <TableCell align="center">{formatYear(row.y26)}</TableCell>
                      <TableCell align="center">
                        <Chip
                          label={row.stable ? 'Stable' : 'Volatile'}
                          size="small"
                          sx={{
                            height: 22,
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            color: row.stable
                              ? theme.palette.mode === 'dark'
                                ? '#73d13d'
                                : '#70AD47'
                              : theme.palette.mode === 'dark'
                                ? '#40a9ff'
                                : '#2E75B6',
                            bgcolor: row.stable
                              ? theme.palette.mode === 'dark'
                                ? 'rgba(115, 209, 61, 0.15)'
                                : '#F1F9EC'
                              : theme.palette.mode === 'dark'
                                ? 'rgba(64, 169, 255, 0.15)'
                                : '#E8F1F5',
                            border: '1px solid',
                            borderColor: row.stable
                              ? theme.palette.mode === 'dark'
                                ? 'rgba(115, 209, 61, 0.3)'
                                : '#D0E9C0'
                              : theme.palette.mode === 'dark'
                                ? 'rgba(64, 169, 255, 0.3)'
                                : '#BDD7EE',
                            borderRadius: 1.5
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            
            
            
            <CustomTablePagination
              count={annualTable.filtered.length}
              page={annualTable.page}
              rowsPerPage={annualTable.rowsPerPage}
              onPageChange={(_, newPage) => annualTable.setPage(newPage)}
              onRowsPerPageChange={(e) => {
                annualTable.setRowsPerPage(parseInt(e.target.value, 10));
                annualTable.setPage(0);
              }}
            />
            </>
            )}
          </MainCard>
        </Grid>

        <Grid size={12}>
          <MainCard
            title={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography variant="subtitle2" fontWeight={800} sx={{ color: 'var(--chart-title-color, #1F3864)' }}>
                  TÍNH MÙA VỤ THEO QUÝ
                </Typography>
                <IconButton
                  size="small"
                  onClick={() =>
                    openHelpModal(
                      'TÍNH MÙA VỤ THEO QUÝ (QUARTERLY SEASONALITY)',
                      'Phân tích hiệu suất giao dịch tổng hợp hoặc chi tiết theo từng quý (Q1 đến Q4) để nắm bắt chu kỳ mùa vụ của thị trường.'
                    )
                  }
                >
                  <QuestionCircleOutlined style={{ fontSize: '13px' }} />
                </IconButton>
              </Box>
            }
            secondary={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <Select
                    value={selectedQuarterYear}
                    onChange={(e) => setSelectedQuarterYear(e.target.value)}
                    sx={{
                      height: 30,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: theme.palette.mode === 'dark' ? 'text.primary' : 'var(--chart-title-color, #1F3864)',
                      borderRadius: 1.5,
                      bgcolor: theme.palette.mode === 'dark' ? 'background.default' : '#FFFFFF',
                      '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? 'divider' : '#BDD7EE' },
                      '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: theme.palette.mode === 'dark' ? 'primary.main' : 'var(--chart-title-color, #1F3864)'
                      },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: theme.palette.mode === 'dark' ? 'primary.main' : 'var(--chart-title-color, #1F3864)'
                      }
                    }}
                  >
                    {quarterYears.map((y) => (
                      <MenuItem key={y} value={y} sx={{ fontSize: '0.75rem', fontWeight: 600 }}>
                        {y === 'All' ? 'Tổng các năm' : `Năm ${y}`}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {renderHeaderActions(
                  'Tính mùa vụ theo quý',
                  'Phân tích Tính mùa vụ theo quý của các chiến lược',
                  QUARTERLY_SEASONALITY
                )}
              </Box>
            }
            sx={{ width: '100%', height: '100%' }}
          >
            {behaviorLoading ? (
              <CardLoader height={240} size={30} message="Đang tải dữ liệu mùa vụ..." />
            ) : (
              <TableContainer
                component={Paper}
                sx={{ boxShadow: 'none', border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}
              >
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.03)' : 'background.default' }}>
                    <TableCell
                      align="center"
                      sx={{ fontWeight: 600, color: theme.palette.mode === 'dark' ? 'text.primary' : 'text.secondary' }}
                    >
                      Quý
                    </TableCell>
                    <TableCell
                      align="center"
                      sx={{ fontWeight: 600, color: theme.palette.mode === 'dark' ? 'text.primary' : 'text.secondary' }}
                    >
                      Tổng Lãi (+)
                    </TableCell>
                    <TableCell
                      align="center"
                      sx={{ fontWeight: 600, color: theme.palette.mode === 'dark' ? 'text.primary' : 'text.secondary' }}
                    >
                      Tổng Lỗ (-)
                    </TableCell>
                    <TableCell
                      align="center"
                      sx={{ fontWeight: 600, color: theme.palette.mode === 'dark' ? 'text.primary' : 'text.secondary' }}
                    >
                      Net Profit
                    </TableCell>
                    <TableCell
                      align="center"
                      sx={{ fontWeight: 600, color: theme.palette.mode === 'dark' ? 'text.primary' : 'text.secondary' }}
                    >
                      Winrate
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredQuarterData.map((q) => (
                    <TableRow key={q.q} hover>
                      <TableCell align="center">
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 700,
                            color: theme.palette.mode === 'dark' ? 'text.primary' : 'var(--chart-title-color, #1F3864)'
                          }}
                        >
                          {q.q}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                          {q.label}
                        </Typography>
                      </TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? '#73d13d' : '#70AD47' }}>
                        ${Math.round(q.grossProfit || 0).toLocaleString()}
                      </TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? '#ff4d4f' : '#FF0000' }}>
                        -${Math.round(q.grossLoss || 0).toLocaleString()}
                      </TableCell>
                      <TableCell
                        align="center"
                        sx={{
                          fontWeight: 800,
                          color:
                            q.profit >= 0
                              ? theme.palette.mode === 'dark'
                                ? '#73d13d'
                                : '#70AD47'
                              : theme.palette.mode === 'dark'
                                ? '#ff4d4f'
                                : '#FF0000'
                        }}
                      >
                        {q.profit >= 0 ? '+' : ''}${Math.round(q.profit).toLocaleString()}
                      </TableCell>
                      <TableCell
                        align="center"
                        sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? 'primary.light' : '#2E75B6' }}
                      >
                        {q.wr}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </TableContainer>
            )}
          </MainCard>
        </Grid>
      </Grid>
    </Box>
  );
}
