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
import { useTheme } from '@mui/material/styles';
import CustomTablePagination from 'components/CustomTablePagination';

import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Bar,
  Cell,
  Line
} from 'recharts';

import QuestionCircleOutlined from '@ant-design/icons/QuestionCircleOutlined';
import SearchOutlined from '@ant-design/icons/SearchOutlined';

import MainCard from 'components/MainCard';
import CardLoader, { CardError } from 'components/CardLoader';

// ==========================================
// LOCAL HELPERS
// ==========================================

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

export default function ActivityTab({
  commissionPerLotData,
  activityGapData,
  hourlyDistribution,
  dayOfWeekDistribution,
  monthlyDistribution,
  activityLoading,
  activityError,
  tablePaperSx,
  renderHeaderActions,
  triggerHelp
}) {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const chartGridColor = isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#CBD5E1';
  const chartTextColor = isDarkMode ? '#cbd5e1' : '#1e293b';

  const [activityFilter, setActivityFilter] = useState('all');

  const searchStrategy = useCallback((row, q) => {
    return (
      String(row.id || '').toLowerCase().includes(q) ||
      String(row.symbol || '').toLowerCase().includes(q) ||
      String(row.status || '').toLowerCase().includes(q) ||
      String(row.backtestTable || '').toLowerCase().includes(q) ||
      String(row.timeframe || '').toLowerCase().includes(q)
    );
  }, []);

  const activitySource = useMemo(() => {
    if (activityFilter === 'critical') return activityGapData.filter((r) => r.status === 'Critical' || r.status === 'Dormant' || r.maxGap >= 40 || r.zeroMonths >= 6);
    if (activityFilter === 'gap40') return activityGapData.filter((r) => r.maxGap >= 40);
    if (activityFilter === 'stable') return activityGapData.filter((r) => r.status === 'Stable' || r.status === 'Excellent' || (r.maxGap < 15 && r.zeroMonths === 0));
    if (activityFilter === 'seasonal') return activityGapData.filter((r) => r.status === 'Seasonal' || (r.zeroMonths >= 1 && r.zeroMonths < 6) || (r.maxGap >= 25 && r.maxGap < 40));
    if (activityFilter === 'volatile') return activityGapData.filter((r) => r.status === 'Volatile' || (r.maxGap >= 15 && r.maxGap < 25));
    if (activityFilter === 'dormant') return activityGapData.filter((r) => r.status === 'Dormant' || r.zeroMonths >= 6 || r.maxGap >= 60);
    return activityGapData;
  }, [activityFilter, activityGapData]);

  const activityTable = useTableState(activitySource, searchStrategy, 50);

  return (
    <>
      {/* Commission per Lot by Symbol */}
      <MainCard
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Typography variant="subtitle2" fontWeight={800} sx={{ color: 'var(--chart-title-color, #1F3864)' }}>PHÍ HOA HỒNG THEO LOT / SYMBOL</Typography>
            <IconButton size="small" onClick={() => triggerHelp('c10')} sx={{ p: 0.25, color: 'text.secondary' }}>
              <QuestionCircleOutlined style={{ fontSize: '13px' }} />
            </IconButton>
          </Box>
        }
        secondary={renderHeaderActions('Phí hoa hồng theo lot', 'Phân tích Phí hoa hồng theo lot của từng symbol', commissionPerLotData)}
        sx={{ width: '100%', mb: 2 }}
      >
        {activityLoading ? (
          <CardLoader height={240} size={30} />
        ) : activityError ? (
          <CardError error={activityError} />
        ) : (
          <>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Fee avg / min / max per lot theo symbol — khoảng <strong style={{ color: '#FF0000' }}>Max</strong> rộng = có deal lots nhỏ bị trừ phí cao bất thường
            </Typography>
            {commissionPerLotData.length === 0 ? (
              <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">Không có dữ liệu commission</Typography>
          </Box>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(220, commissionPerLotData.length * 36)}>
            <ComposedChart
              layout="vertical"
              data={commissionPerLotData}
              margin={{ top: 8, right: 40, left: 0, bottom: 4 }}
              barCategoryGap="20%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} strokeOpacity={0.3} horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 9, fill: chartTextColor, fontWeight: 600 }}
                tickLine={false}
                axisLine={{ stroke: chartGridColor }}
                tickFormatter={(v) => `$${v}`}
                label={{ value: 'USD / lot', position: 'insideBottomRight', offset: -4, fontSize: 9, fill: '#94a3b8' }}
              />
              <YAxis
                type="category"
                dataKey="symbol"
                tick={{ fontSize: 9, fill: chartTextColor, fontWeight: 700 }}
                width={62}
                tickLine={false}
                axisLine={false}
              />
              <RechartsTooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload || {};
                  return (
                    <Box sx={{
                      bgcolor: 'rgba(15, 23, 42, 0.95)',
                      backdropFilter: 'blur(8px)',
                      color: '#f8fafc',
                      p: 1.5,
                      borderRadius: 2,
                      boxShadow: '0 10px 25px -5px rgba(0,0,0,0.4)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      fontSize: '0.75rem',
                      minWidth: 180
                    }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: '#94a3b8', display: 'block', mb: 0.75, borderBottom: '1px solid rgba(255,255,255,0.08)', pb: 0.5 }}>
                        {label}
                      </Typography>
                      {[
                        { label: 'Avg fee/lot', val: d.avgFeePerLot, color: isDarkMode ? '#60a5fa' : '#2563eb' },
                        { label: 'Min fee/lot', val: d.minFeePerLot, color: isDarkMode ? '#4ade80' : '#10b981' },
                        { label: 'Max fee/lot', val: d.maxFeePerLot, color: isDarkMode ? '#f87171' : '#ef4444' },
                        { label: 'Deal count', val: d.dealCount, color: '#94a3b8', suffix: ' deals' }
                      ].map(({ label: l, val, color, suffix }) => (
                        <Box key={l} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mt: 0.5 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: color }} />
                            <Typography variant="caption" sx={{ color: '#cbd5e1', fontWeight: 500 }}>{l}</Typography>
                          </Box>
                          <Typography variant="caption" sx={{ fontWeight: 700, color: '#ffffff', fontFamily: 'monospace' }}>
                            {suffix ? `${val}${suffix}` : `$${Number(val || 0).toFixed(2)}`}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  );
                }}
              />
              {/* Min-Max range bar (transparent background bar) */}
              <Bar dataKey="maxFeePerLot" fill={isDarkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.08)'} stroke={isDarkMode ? '#f87171' : '#ef4444'} strokeWidth={1.5} radius={[0, 3, 3, 0]} barSize={20} name="Max fee/lot">
                {commissionPerLotData.map((entry, idx) => (
                  <Cell key={idx} fill={isDarkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.08)'} stroke={isDarkMode ? '#f87171' : '#ef4444'} strokeWidth={1.5} />
                ))}
              </Bar>
              {/* Min bar */}
              <Bar dataKey="minFeePerLot" fill={isDarkMode ? '#4ade80' : '#10b981'} radius={[0, 2, 2, 0]} barSize={10} name="Min fee/lot">
                {commissionPerLotData.map((entry, idx) => (
                  <Cell key={idx} fill={isDarkMode ? '#4ade80' : '#10b981'} />
                ))}
              </Bar>
              {/* Avg line */}
              <Line
                type="monotone"
                dataKey="avgFeePerLot"
                stroke={isDarkMode ? '#60a5fa' : '#2563eb'}
                strokeWidth={2}
                dot={{ fill: isDarkMode ? '#60a5fa' : '#2563eb', r: 4, strokeWidth: 1.5, stroke: isDarkMode ? '#1e293b' : '#ffffff' }}
                name="Avg fee/lot"
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
        {/* Legend */}
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2.5, mt: 1, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 12, height: 3, bgcolor: isDarkMode ? '#60a5fa' : '#2563eb', borderRadius: 1 }} />
            <Typography variant="caption" sx={{ fontSize: '10px', fontWeight: 700, color: isDarkMode ? '#60a5fa' : '#2563eb' }}>Avg</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: 1, bgcolor: isDarkMode ? '#4ade80' : '#10b981' }} />
            <Typography variant="caption" sx={{ fontSize: '10px', fontWeight: 700, color: isDarkMode ? '#4ade80' : '#10b981' }}>Min</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: 1, bgcolor: isDarkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.08)', border: '1px solid', borderColor: isDarkMode ? '#f87171' : '#ef4444' }} />
            <Typography variant="caption" sx={{ fontSize: '10px', fontWeight: 700, color: isDarkMode ? '#f87171' : '#ef4444' }}>Max</Typography>
          </Box>
        </Box>
          </>
        )}
      </MainCard>

      <MainCard
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Typography variant="subtitle2" fontWeight={800} sx={{ color: 'var(--chart-title-color, #1F3864)' }}>KHOẢNG LẶNG GIAO DỊCH</Typography>
            <IconButton size="small" onClick={() => triggerHelp('c8')} sx={{ p: 0.25, color: 'text.secondary' }}>
              <QuestionCircleOutlined style={{ fontSize: '13px' }} />
            </IconButton>
          </Box>
        }
        secondary={renderHeaderActions('Khoảng lặng giao dịch', 'Phân tích Khoảng lặng giao dịch trống lệnh', activityGapData)}
        sx={{ width: '100%' }}
      >
        {activityLoading ? (
          <CardLoader height={240} size={30} />
        ) : activityError ? (
          <CardError error={activityError} />
        ) : (
          <>
            <TableToolbar
          search={activityTable.search}
          onSearch={activityTable.setSearch}
          filterSlot={
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel sx={{ color: 'var(--chart-title-color, #1F3864)', fontWeight: 600 }}>Lọc</InputLabel>
              <Select
                label="Lọc"
                value={activityFilter}
                onChange={(e) => { setActivityFilter(e.target.value); activityTable.setPage(0); }}
                sx={{
                  borderRadius: 2,
                  bgcolor: isDarkMode ? 'background.paper' : '#FFFFFF',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#2E75B6' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: chartTextColor }
                }}
              >
                <MenuItem value="all">Tất cả</MenuItem>
                <MenuItem value="critical">Critical only</MenuItem>
                <MenuItem value="gap40">Gap ≥ 40 ngày</MenuItem>
                <MenuItem value="stable">Stable</MenuItem>
                <MenuItem value="seasonal">Seasonal</MenuItem>
                <MenuItem value="volatile">Volatile</MenuItem>
                <MenuItem value="dormant">Dormant</MenuItem>
              </Select>
            </FormControl>
          }
          countLabel={`${activityTable.filtered.length} strategies`}
        />
        <TableContainer component={Paper} sx={{ ...tablePaperSx, maxHeight: 560 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'background.default' }}>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Strategy</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Backtest</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Total trades</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Max gap (ngày)</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Tháng 0 lệnh</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, minWidth: 120 }}>Gap severity</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {activityTable.paginated.map((row, idx) => {
                const getStatusColors = (status) => {
                  const s = String(status || '').toLowerCase();
                  if (s === 'critical') {
                    return {
                      color: isDarkMode ? '#e57373' : '#FF0000',
                      bg: isDarkMode ? 'rgba(244, 67, 54, 0.15)' : '#FFEBEB',
                      border: isDarkMode ? 'rgba(244, 67, 54, 0.3)' : '#FFC7C7'
                    };
                  }
                  if (s === 'dormant') {
                    return {
                      color: isDarkMode ? '#f06292' : '#C2185B',
                      bg: isDarkMode ? 'rgba(233, 30, 99, 0.15)' : '#FCE4EC',
                      border: isDarkMode ? 'rgba(233, 30, 99, 0.3)' : '#F8BBD0'
                    };
                  }
                  if (s === 'stable' || s === 'excellent') {
                    return {
                      color: isDarkMode ? '#81c784' : '#70AD47',
                      bg: isDarkMode ? 'rgba(76, 175, 80, 0.15)' : '#F1F9EC',
                      border: isDarkMode ? 'rgba(76, 175, 80, 0.3)' : '#D0E9C0'
                    };
                  }
                  if (s === 'seasonal') {
                    return {
                      color: isDarkMode ? '#64b5f6' : '#2E75B6',
                      bg: isDarkMode ? 'rgba(33, 150, 243, 0.15)' : '#E8F1F5',
                      border: isDarkMode ? 'rgba(33, 150, 243, 0.3)' : '#BDD7EE'
                    };
                  }
                  if (s === 'volatile') {
                    return {
                      color: isDarkMode ? '#ffb74d' : '#E5A800',
                      bg: isDarkMode ? 'rgba(255, 183, 77, 0.15)' : '#FEF7E0',
                      border: isDarkMode ? 'rgba(255, 183, 77, 0.3)' : '#FEF0C7'
                    };
                  }
                  return {
                    color: isDarkMode ? '#cbd5e1' : 'var(--chart-title-color, #1F3864)',
                    bg: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : '#F2F4F7',
                    border: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : '#E2E8F0'
                  };
                };
                const sColor = getStatusColors(row.status);
                return (
                  <TableRow key={`${row.id}_${row.backtestTable || ''}_${idx}`} hover>
                    <TableCell align="center" sx={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.75rem', color: chartTextColor }}>{row.id}</TableCell>
                    <TableCell align="center" sx={{ fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 }}>{row.backtestTable || '-'}</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>{row.trades}</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, color: row.maxGap >= 40 ? (isDarkMode ? '#e57373' : '#FF0000') : chartTextColor }}>{row.maxGap}</TableCell>
                    <TableCell align="center">
                      <Chip
                        label={row.zeroMonths}
                        size="small"
                        sx={{
                          height: 22,
                          fontWeight: 700,
                          color: row.zeroMonths >= 6 ? (isDarkMode ? '#e57373' : '#FF0000') : chartTextColor,
                          bgcolor: row.zeroMonths >= 6 ? (isDarkMode ? 'rgba(244, 67, 54, 0.15)' : '#FFEBEB') : (isDarkMode ? 'rgba(255, 255, 255, 0.05)' : '#F2F4F7'),
                          border: '1px solid',
                          borderColor: row.zeroMonths >= 6 ? (isDarkMode ? 'rgba(244, 67, 54, 0.3)' : '#FFC7C7') : (isDarkMode ? 'rgba(255, 255, 255, 0.1)' : '#E2E8F0'),
                          borderRadius: 1.5
                        }}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'center' }}>
                        <Box sx={{ flex: 1, maxWidth: 100, height: 8, borderRadius: 4, bgcolor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : '#F2F4F7', overflow: 'hidden', border: '1px solid', borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : '#E2E8F0' }}>
                          <Box sx={{ width: `${Math.min(100, (row.maxGap / 60) * 100)}%`, height: '100%', bgcolor: row.maxGap >= 40 ? (isDarkMode ? '#e57373' : '#FF0000') : row.maxGap >= 25 ? (isDarkMode ? '#64b5f6' : '#2E75B6') : (isDarkMode ? '#81c784' : '#70AD47') }} />
                        </Box>
                        <Typography variant="caption" sx={{ fontWeight: 700, minWidth: 32, color: chartTextColor }}>{row.maxGap}d</Typography>
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
                          color: sColor.color,
                          bgcolor: sColor.bg,
                          border: '1px solid',
                          borderColor: sColor.border,
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
          count={activityTable.filtered.length}
          page={activityTable.page}
          rowsPerPage={activityTable.rowsPerPage}
          onPageChange={(_, newPage) => activityTable.setPage(newPage)}
          onRowsPerPageChange={(e) => {
            activityTable.setRowsPerPage(parseInt(e.target.value, 10));
            activityTable.setPage(0);
          }}
        />
          </>
        )}
      </MainCard>
    </>
  );
}
