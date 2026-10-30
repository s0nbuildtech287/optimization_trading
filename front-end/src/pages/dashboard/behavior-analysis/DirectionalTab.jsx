import React, { useState, useMemo, useCallback, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TablePagination from '@mui/material/TablePagination';
import Pagination from '@mui/material/Pagination';
import PaginationItem from '@mui/material/PaginationItem';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import CustomTablePagination from 'components/CustomTablePagination';

import QuestionCircleOutlined from '@ant-design/icons/QuestionCircleOutlined';
import WarningOutlined from '@ant-design/icons/WarningOutlined';
import SearchOutlined from '@ant-design/icons/SearchOutlined';
import PieChartOutlined from '@ant-design/icons/PieChartOutlined';
import SwapOutlined from '@ant-design/icons/SwapOutlined';
import ClockCircleOutlined from '@ant-design/icons/ClockCircleOutlined';

import MainCard from 'components/MainCard';
import DashboardKpiSummary from 'components/dashboard/DashboardKpiSummary';
import CardLoader, { CardError } from 'components/CardLoader';

// ==========================================
// LOCAL HELPERS
// ==========================================

function ProfitBar({ buyPct, sellPct, height = 8 }) {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  return (
    <Box sx={{
      display: 'flex',
      height,
      borderRadius: height / 2,
      overflow: 'hidden',
      bgcolor: isDarkMode ? 'rgba(255,255,255,0.05)' : '#F2F4F7',
      minWidth: 80,
      border: '1px solid',
      borderColor: isDarkMode ? 'rgba(255,255,255,0.1)' : '#E2E8F0'
    }}>
      <Box sx={{ width: `${buyPct}%`, bgcolor: isDarkMode ? '#64b5f6' : 'var(--chart-title-color, #1F3864)', borderRadius: buyPct === 100 ? 'inherit' : 'none' }} />
      <Box sx={{ width: `${sellPct}%`, bgcolor: isDarkMode ? '#1e3a8a' : '#9DC3E6', borderRadius: sellPct === 100 ? 'inherit' : 'none' }} />
    </Box>
  );
}

function TableToolbar({ search, onSearch, placeholder, filterSlot, countLabel }) {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
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
            bgcolor: isDarkMode ? 'background.paper' : '#FFFFFF',
            '&.Mui-focused fieldset': { borderColor: '#2E75B6' }
          }
        }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchOutlined style={{ fontSize: 14, color: '#2E75B6' }} />
            </InputAdornment>
          )
        }}
      />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        {filterSlot}
        {countLabel && (
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'var(--chart-title-color, #1F3864)' }}>
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
    if (!search || !search.trim()) return data;
    const q = search.trim().toLowerCase();
    return data.filter((row) => searchFn(row, q));
  }, [data, search, searchFn]);

  // Reset page to 0 when search term or data changes
  useEffect(() => {
    setPage(0);
  }, [search, data]);

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

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function DirectionalTab({
  directionalBiasData,
  buySellBreakdown,
  timeframeMismatchData,
  tabKpis,
  coreLoading,
  selectedTable,
  dateRange,
  isDarkMode,
  chartTextColor,
  tablePaperSx,
  stickyTableSx,
  handleOpenRemarks,
  renderHeaderActions,
  triggerHelp
}) {
  const [biasFilter, setBiasFilter] = useState('flagged');
  const [mismatchFilter, setMismatchFilter] = useState('all');

  const searchStrategy = useCallback((row, q) => {
    const query = q.trim().toLowerCase();
    if (!query) return true;
    return (
      String(row.id || '').toLowerCase().includes(query) ||
      String(row.symbol || '').toLowerCase().includes(query) ||
      String(row.status || '').toLowerCase().includes(query) ||
      String(row.backtestTable || '').toLowerCase().includes(query) ||
      String(row.timeframe || row.tf || '').toLowerCase().includes(query) ||
      String(row.bot || '').toLowerCase().includes(query)
    );
  }, []);

  const biasSource = useMemo(() => {
    if (!biasFilter || biasFilter === 'all') return directionalBiasData;
    const filterKey = biasFilter.toLowerCase();
    if (filterKey === 'flagged') return directionalBiasData.filter((r) => r.status === 'DirectionalBias' || r.status === 'One-Way Edge' || r.weakPct < 20);
    if (filterKey === 'balanced') return directionalBiasData.filter((r) => r.status === 'Balanced' || r.weakPct >= 20);
    return directionalBiasData.filter((r) => String(r.status || '').toLowerCase() === filterKey);
  }, [biasFilter, directionalBiasData]);

  const biasTable = useTableState(biasSource, searchStrategy, 50);

  const mismatchSource = useMemo(() => {
    if (!mismatchFilter || mismatchFilter === 'all') return timeframeMismatchData;
    const filterKey = mismatchFilter.toLowerCase();
    return timeframeMismatchData.filter((r) => String(r.status || '').toLowerCase() === filterKey);
  }, [mismatchFilter, timeframeMismatchData]);

  const mismatchTable = useTableState(mismatchSource, searchStrategy, 50);

  return (
    <Box sx={{ width: '100%' }}>
      <DashboardKpiSummary
        title="Behavior Screening Summary"
        loading={coreLoading}
        items={[
          {
            label: 'Strategies Analyzed',
            value: tabKpis.totalStrategies,
            sub: 'Class 4 · 9 queries',
            valueColor: 'text.primary',
            icon: <PieChartOutlined style={{ fontSize: 18, color: '#0288d1' }} />,
            iconBg: '#e3f2fd'
          },
          {
            label: 'DirectionalBias Flags',
            value: tabKpis.flaggedBias,
            sub: 'chiều yếu < 20% profit',
            valueColor: 'error.main',
            icon: <SwapOutlined style={{ fontSize: 18, color: '#d32f2f' }} />,
            iconBg: '#fdeded'
          },
          {
            label: 'Timeframe Mismatch',
            value: tabKpis.mismatch,
            sub: 'H4 > H1 cùng bot+symbol',
            valueColor: 'warning.main',
            icon: <ClockCircleOutlined style={{ fontSize: 18, color: '#e5a800' }} />,
            iconBg: '#fef7e0'
          },
          {
            label: 'Critical Inactivity',
            value: tabKpis.criticalActivity,
            sub: 'gap ≥ 40 ngày hoặc ≥ 6 tháng rỗng',
            valueColor: 'error.main',
            icon: <WarningOutlined style={{ fontSize: 18, color: '#d32f2f' }} />,
            iconBg: '#fdeded'
          }
        ]}
        onDetailedReportClick={() => handleOpenRemarks('Hành vi giao dịch (Behavior Analysis Tab)', 'behavior_tab', 'tab_remarks')}
        aiAnalysis={{
          title: 'AI Analysis — Behavior Patterns',
          subtitle: 'Class 4 · Directional, seasonality, activity & exit',
          badge: 'Behavior Module',
          targetId: 'behavior_tab',
          selectedTable: selectedTable,
          dateRange: dateRange,
          sections: [
            {
              heading: 'Tổng quan',
              body: `${tabKpis.flaggedBias} strategy có DirectionalBias (chiều yếu < 20% profit). ${tabKpis.mismatch} cặp bot+symbol lệch timeframe H4/H1. ${tabKpis.criticalActivity} strategy có khoảng lặng nghiêm trọng.`
            },
            {
              heading: 'Điểm nóng',
              body:
                '• OB/OS lệch một chiều → rủi ro khi đảo xu hướng dài hạn.\n• Heatmap giờ/ thứ: tránh scale vào khung spread giãn (swap, cuối tuần).\n• Exit EoT cao → gồng lỗ; kiểm tra tab Thoát lệnh theo symbol.'
            },
            {
              heading: 'Khuyến nghị',
              body:
                'Ưu tiên strategy stable theo năm (filter Q5). Loại hoặc giảm size với max gap ≥ 40 ngày. Cân bằng Buy/Sell breakdown trước khi đưa vào portfolio construction.'
            }
          ]
        }}
      />

      <MainCard
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Typography variant="subtitle2" fontWeight={800} sx={{ color: 'var(--chart-title-color, #1F3864)' }}>LỆCH CHIỀU GIAO DỊCH</Typography>
            <IconButton size="small" onClick={() => triggerHelp('c1')} sx={{ p: 0.25, color: 'text.secondary' }}>
              <QuestionCircleOutlined style={{ fontSize: '13px' }} />
            </IconButton>
          </Box>
        }
        secondary={renderHeaderActions('Lệch chiều giao dịch', 'Phân tích Lệch chiều giao dịch Buy vs Sell', directionalBiasData)}
        sx={{ mb: 3, width: '100%' }}
      >
        {coreLoading ? (
          <CardLoader height={200} size={28} />
        ) : (
        <>
        <Alert
          severity="warning"
          icon={<WarningOutlined style={{ color: '#FF0000' }} />}
          sx={{
            mb: 2,
            py: 0.75,
            bgcolor: '#FFF5F5',
            color: '#FF0000',
            border: '1px solid',
            borderColor: '#FFE0E0',
            borderRadius: 2,
            fontWeight: 600
          }}
        >
          Flag khi chiều yếu &lt; 20% profit chiều mạnh · {tabKpis.flaggedBias} strategy vi phạm
        </Alert>
        <TableToolbar
          search={biasTable.search}
          onSearch={biasTable.setSearch}
          filterSlot={
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel sx={{ color: 'var(--chart-title-color, #1F3864)', fontWeight: 600 }}>Lọc</InputLabel>
              <Select
                label="Lọc"
                value={biasFilter}
                onChange={(e) => { setBiasFilter(e.target.value); biasTable.setPage(0); }}
                sx={{
                  borderRadius: 2,
                  bgcolor: isDarkMode ? 'background.paper' : '#FFFFFF',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#2E75B6' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: chartTextColor }
                }}
              >
                <MenuItem value="flagged">Chỉ flagged</MenuItem>
                <MenuItem value="all">Tất cả</MenuItem>
                <MenuItem value="balanced">Cân bằng</MenuItem>
              </Select>
            </FormControl>
          }
          countLabel={`${biasTable.filtered.length} dòng`}
        />
        <TableContainer component={Paper} sx={{ ...tablePaperSx, ...stickyTableSx }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'background.default' }}>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Strategy</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Backtest</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Symbol</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>TF</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Bot</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Buy / Sell split</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Buy $</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Sell $</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Weak %</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Flag</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {biasTable.paginated.map((row, idx) => {
                const isBias = row.status === 'DirectionalBias' || row.weakPct < 20;
                return (
                  <TableRow key={`${row.id}_${row.backtestTable || ''}_${idx}`} hover>
                    <TableCell align="center" sx={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.75rem', color: chartTextColor }}>{row.id}</TableCell>
                    <TableCell align="center" sx={{ fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 }}>{row.backtestTable || '-'}</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>{row.symbol}</TableCell>
                    <TableCell align="center">{row.tf}</TableCell>
                    <TableCell align="center">{row.bot}</TableCell>
                    <TableCell align="center" sx={{ minWidth: 160 }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <ProfitBar buyPct={row.buyPct} sellPct={row.sellPct} />
                        <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>{row.buyPct}% / {row.sellPct}%</Typography>
                      </Box>
                    </TableCell>
                    <TableCell align="center" sx={{ color: isDarkMode ? '#81c784' : '#70AD47', fontWeight: 700 }}>${row.buyProfit.toLocaleString()}</TableCell>
                    <TableCell align="center" sx={{ color: isDarkMode ? '#64b5f6' : '#2E75B6', fontWeight: 700 }}>${row.sellProfit.toLocaleString()}</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 800, color: row.weakPct < 20 ? (isDarkMode ? '#e57373' : '#FF0000') : chartTextColor }}>{row.weakPct}%</TableCell>
                    <TableCell align="center">
                      <Chip
                        label={row.status}
                        size="small"
                        sx={{
                          height: 22,
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          color: isBias ? '#FF0000' : '#70AD47',
                          bgcolor: isBias ? '#FFEBEB' : '#F1F9EC',
                          border: '1px solid',
                          borderColor: isBias ? '#FFC7C7' : '#D0E9C0',
                          borderRadius: 1.5
                        }}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        
        
        
        <CustomTablePagination
          count={biasTable.filtered.length}
          page={biasTable.page}
          rowsPerPage={biasTable.rowsPerPage}
          onPageChange={(_, newPage) => biasTable.setPage(newPage)}
          onRowsPerPageChange={(e) => {
            biasTable.setRowsPerPage(parseInt(e.target.value, 10));
            biasTable.setPage(0);
          }}
        />
        </>
        )}
      </MainCard>

      <MainCard
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Typography variant="subtitle2" fontWeight={800} sx={{ color: 'var(--chart-title-color, #1F3864)' }}>HIỆU SUẤT MUA/BÁN THEO CẶP</Typography>
            <IconButton size="small" onClick={() => triggerHelp('c2')} sx={{ p: 0.25, color: 'text.secondary' }}>
              <QuestionCircleOutlined style={{ fontSize: '13px' }} />
            </IconButton>
          </Box>
        }
        secondary={renderHeaderActions('Hiệu suất mua bán theo cặp', 'Phân tích Hiệu suất mua bán theo cặp của các sản phẩm', buySellBreakdown)}
        sx={{ mb: 3, width: '100%' }}
      >
        {coreLoading ? (
          <CardLoader height={200} size={28} />
        ) : (
        <>
        <TableContainer component={Paper} sx={tablePaperSx}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'background.default' }}>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Symbol</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Buy — Count / WR / Avg $</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Sell — Count / WR / Avg $</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Dominant</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Balance bar</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {buySellBreakdown.map((row) => {
                const domBuy = row.buyAvgProf >= row.sellAvgProf;
                const buyShare = Math.round((row.buyCount / (row.buyCount + row.sellCount)) * 100);
                return (
                  <TableRow key={row.symbol} hover>
                    <TableCell align="center" sx={{ fontWeight: 700, color: chartTextColor }}>{row.symbol}</TableCell>
                    <TableCell align="center" sx={{ py: 1.25 }}>
                      <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="center">
                        <Box sx={{ minWidth: 45 }}>
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ fontWeight: 600, fontSize: '0.62rem' }}>Lệnh</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: isDarkMode ? '#81c784' : '#70AD47', fontSize: '0.75rem' }}>{row.buyCount}</Typography>
                        </Box>
                        <Box sx={{ minWidth: 50 }}>
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ fontWeight: 600, fontSize: '0.62rem' }}>Winrate</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: isDarkMode ? '#81c784' : '#70AD47', fontSize: '0.75rem' }}>{row.buyWR}%</Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ fontWeight: 600, fontSize: '0.62rem' }}>Lãi tb</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 800, color: isDarkMode ? '#81c784' : '#70AD47', fontSize: '0.75rem' }}>${row.buyAvgProf.toLocaleString()}</Typography>
                        </Box>
                      </Stack>
                    </TableCell>
                    <TableCell align="center" sx={{ py: 1.25 }}>
                      <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="center">
                        <Box sx={{ minWidth: 45 }}>
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ fontWeight: 600, fontSize: '0.62rem' }}>Lệnh</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: isDarkMode ? '#64b5f6' : '#2E75B6', fontSize: '0.75rem' }}>{row.sellCount}</Typography>
                        </Box>
                        <Box sx={{ minWidth: 50 }}>
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ fontWeight: 600, fontSize: '0.62rem' }}>Winrate</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: isDarkMode ? '#64b5f6' : '#2E75B6', fontSize: '0.75rem' }}>{row.sellWR}%</Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ fontWeight: 600, fontSize: '0.62rem' }}>Lãi tb</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 800, color: isDarkMode ? '#64b5f6' : '#2E75B6', fontSize: '0.75rem' }}>${row.sellAvgProf.toLocaleString()}</Typography>
                        </Box>
                      </Stack>
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={domBuy ? 'Buy' : 'Sell'}
                        size="small"
                        sx={{
                          height: 22,
                          fontWeight: 700,
                          color: domBuy ? (isDarkMode ? '#81c784' : '#70AD47') : (isDarkMode ? '#64b5f6' : '#2E75B6'),
                          bgcolor: domBuy ? (isDarkMode ? 'rgba(76, 175, 80, 0.15)' : '#F1F9EC') : (isDarkMode ? 'rgba(33, 150, 243, 0.15)' : '#E8F1F5'),
                          border: '1px solid',
                          borderColor: domBuy ? (isDarkMode ? 'rgba(76, 175, 80, 0.3)' : '#D0E9C0') : (isDarkMode ? 'rgba(33, 150, 243, 0.3)' : '#BDD7EE'),
                          borderRadius: 1.5
                        }}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                        <ProfitBar buyPct={buyShare} sellPct={100 - buyShare} height={8} />
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        </>
        )}
      </MainCard>

      <MainCard
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Typography variant="subtitle2" fontWeight={800} sx={{ color: 'var(--chart-title-color, #1F3864)' }}>LỆCH KHUNG THỜI GIAN</Typography>
            <IconButton size="small" onClick={() => triggerHelp('c3')} sx={{ p: 0.25, color: 'text.secondary' }}>
              <QuestionCircleOutlined style={{ fontSize: '13px' }} />
            </IconButton>
          </Box>
        }
        secondary={renderHeaderActions('Lệch khung thời gian', 'Phân tích Lệch khung thời gian H1 vs H4', timeframeMismatchData)}
        sx={{ mb: 3, width: '100%' }}
      >
        {coreLoading ? (
          <CardLoader height={200} size={28} />
        ) : (
          <>
        <TableToolbar
          search={mismatchTable.search}
          onSearch={mismatchTable.setSearch}
          filterSlot={
            <FormControl size="small" sx={{ minWidth: 165 }}>
              <InputLabel sx={{ color: 'var(--chart-title-color, #1F3864)', fontWeight: 600 }}>Lọc Status</InputLabel>
              <Select
                label="Lọc Status"
                value={mismatchFilter}
                onChange={(e) => { setMismatchFilter(e.target.value); mismatchTable.setPage(0); }}
                sx={{
                  borderRadius: 2,
                  bgcolor: isDarkMode ? 'background.paper' : '#FFFFFF',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#2E75B6' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: chartTextColor }
                }}
              >
                <MenuItem value="all">Tất cả</MenuItem>
                <MenuItem value="Severe">Severe</MenuItem>
                <MenuItem value="TimeframeMismatch">TimeframeMismatch</MenuItem>
                <MenuItem value="Moderate">Moderate</MenuItem>
                <MenuItem value="Normal">Normal</MenuItem>
              </Select>
            </FormControl>
          }
          countLabel={`${mismatchTable.filtered.length} dòng`}
        />
        <TableContainer component={Paper} sx={{ ...tablePaperSx, ...stickyTableSx }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'background.default' }}>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Strategy</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Backtest</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Symbol</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Bot</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>H1 Deals</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>H4 Deals</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Ratio (H4/H1)</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Mismatch split</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {mismatchTable.paginated.map((row, idx) => {
                const h1Count = Number(row.h1Count) || 0;
                const h4Count = Number(row.h4Count) || 0;
                const total = h1Count + h4Count;
                const h1Share = total > 0 ? Math.round((h1Count / total) * 100) : 0;
                const isBad = row.status === 'Severe' || row.status === 'TimeframeMismatch';
                return (
                  <TableRow key={`${row.id}_${row.backtestTable || ''}_${idx}`} hover>
                    <TableCell align="center" sx={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.75rem', color: chartTextColor }}>{row.id}</TableCell>
                    <TableCell align="center" sx={{ fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 }}>{row.backtestTable || '-'}</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>{row.symbol}</TableCell>
                    <TableCell align="center">{row.bot}</TableCell>
                    <TableCell align="center" sx={{ color: isDarkMode ? '#64b5f6' : '#2E75B6', fontWeight: 600 }}>{h1Count}</TableCell>
                    <TableCell align="center" sx={{ color: isDarkMode ? '#81c784' : '#70AD47', fontWeight: 600 }}>{h4Count}</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700 }}>{row.ratio}x</TableCell>
                    <TableCell align="center" sx={{ minWidth: 160 }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <ProfitBar buyPct={h1Share} sellPct={100 - h1Share} />
                        <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>H1: {h1Share}% / H4: {100 - h1Share}%</Typography>
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={row.status}
                        size="small"
                        sx={{
                          height: 22,
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          color: isBad ? '#FF0000' : row.status === 'Moderate' ? '#e5a800' : '#70AD47',
                          bgcolor: isBad ? '#FFEBEB' : row.status === 'Moderate' ? '#fef7e0' : '#F1F9EC',
                          border: '1px solid',
                          borderColor: isBad ? '#FFC7C7' : row.status === 'Moderate' ? '#fef0c7' : '#D0E9C0',
                          borderRadius: 1.5
                        }}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        
        
        
        <CustomTablePagination
          count={mismatchTable.filtered.length}
          page={mismatchTable.page}
          rowsPerPage={mismatchTable.rowsPerPage}
          onPageChange={(_, newPage) => mismatchTable.setPage(newPage)}
          onRowsPerPageChange={(e) => {
            mismatchTable.setRowsPerPage(parseInt(e.target.value, 10));
            mismatchTable.setPage(0);
          }}
        />
          </>
        )}
      </MainCard>
    </Box>
  );
}
