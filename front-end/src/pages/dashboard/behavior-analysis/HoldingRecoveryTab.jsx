import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import { useTheme } from '@mui/material/styles';
import CustomTablePagination from 'components/CustomTablePagination';

import {
  ResponsiveContainer,
  ScatterChart,
  CartesianGrid,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip as RechartsTooltip,
  Scatter,
  BarChart,
  Bar,
  Cell
} from 'recharts';

import WarningOutlined from '@ant-design/icons/WarningOutlined';
import QuestionCircleOutlined from '@ant-design/icons/QuestionCircleOutlined';
import SearchOutlined from '@ant-design/icons/SearchOutlined';

import MainCard from 'components/MainCard';
import CardLoader, { CardError } from 'components/CardLoader';
import { useBehaviorAnalysis } from 'hooks/useBehaviorAnalysis';

// ==========================================
// MOCK DATA GENERATORS (FALLBACK)
// ==========================================

const generateScatterData = (strategyId) => {
  const isToxic = ['001EURUSDH1OB', '002GBPUSDH4OB', '003XAUUSDH1OB', '008USDCADH1OB', '009NZDUSDH4OB'].includes(strategyId) || strategyId.startsWith('1');
  const data = [];
  let seed = 0;
  for (let j = 0; j < strategyId.length; j++) {
    seed += strategyId.charCodeAt(j);
  }
  const pseudoRandom = () => {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  };

  for (let i = 0; i < 60; i++) {
    const holdTime = isToxic 
      ? Math.round(5 + pseudoRandom() * 40)
      : Math.round(30 + pseudoRandom() * 480);
    const profit = isToxic
      ? Math.round(20 + pseudoRandom() * 150)
      : Math.round(100 + pseudoRandom() * 1200);
    data.push({ holdTime, profit, type: 'win' });
  }
  for (let i = 0; i < 50; i++) {
    const holdTime = isToxic
      ? Math.round(60 + pseudoRandom() * 900)
      : Math.round(5 + pseudoRandom() * 90);
    const profit = isToxic
      ? Math.round(-30 - pseudoRandom() * 1000)
      : Math.round(-20 - pseudoRandom() * 300);
    data.push({ holdTime, profit, type: 'loss' });
  }
  return data;
};

const generateVolumeEscalationData = (strategyId) => {
  const isMartingale = ['002GBPUSDH4OB', '003XAUUSDH1OB', '009NZDUSDH4OB'].includes(strategyId) || strategyId.startsWith('15') || strategyId.startsWith('18');
  if (isMartingale) {
    return [
      { name: 'Base Lot', multiplier: 1.0 },
      { name: '1 Loss', multiplier: 1.0 },
      { name: '2 Losses', multiplier: 1.5 },
      { name: '3 Losses', multiplier: 2.2 },
      { name: '4 Losses', multiplier: 3.8 },
      { name: '5+ Losses', multiplier: 5.5 }
    ];
  } else {
    return [
      { name: 'Base Lot', multiplier: 1.0 },
      { name: '1 Loss', multiplier: 1.0 },
      { name: '2 Losses', multiplier: 1.0 },
      { name: '3 Losses', multiplier: 1.0 },
      { name: '4 Losses', multiplier: 0.9 },
      { name: '5+ Losses', multiplier: 0.8 }
    ];
  }
};

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

export default function HoldingRecoveryTab({
  holdingStrategies,
  htrData,
  veiData,
  holdingLoading,
  holdingError,
  useFallback,
  tablePaperSx,
  stickyTableSx,
  renderHeaderActions,
  triggerHelp
}) {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const chartGridColor = isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#CBD5E1';
  const chartTextColor = isDarkMode ? '#cbd5e1' : '#1e293b';

  const { fetchBehaviorStrategyDetail } = useBehaviorAnalysis();

  const [holdingFilter, setHoldingFilter] = useState('all');
  const [selectedStrategyKey, setSelectedStrategyKey] = useState(null);
  const [strategyDetail, setStrategyDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const searchStrategy = useCallback((row, q) => {
    const query = q.trim().toLowerCase();
    if (!query) return true;
    return (
      String(row.id || '').toLowerCase().includes(query) ||
      String(row.symbol || '').toLowerCase().includes(query) ||
      String(row.status || '').toLowerCase().includes(query) ||
      String(row.backtestTable || '').toLowerCase().includes(query) ||
      String(row.timeframe || '').toLowerCase().includes(query)
    );
  }, []);

  const filteredHoldingStrategies = useMemo(() => {
    if (!holdingFilter || holdingFilter === 'all') return holdingStrategies;
    const filterKey = holdingFilter.toLowerCase();
    return holdingStrategies.filter((s) => {
      const status = String(s.status || '').toLowerCase();
      if (filterKey === 'excellent') return status === 'excellent';
      if (filterKey === 'toxic') return status !== 'excellent';
      if (filterKey === 'loss averse' || filterKey === 'lossaverse') {
        return status.includes('loss') || status.includes('critical');
      }
      if (filterKey === 'martingale risk' || filterKey === 'martingale') {
        return status.includes('martingale') || status.includes('critical');
      }
      return status === filterKey;
    });
  }, [holdingStrategies, holdingFilter]);

  const holdingTable = useTableState(filteredHoldingStrategies, searchStrategy, 50);

  // Auto-select first strategy in the filtered list if selectedStrategyKey is invalid or not in filteredHoldingStrategies
  useEffect(() => {
    if (filteredHoldingStrategies.length > 0) {
      const exists = filteredHoldingStrategies.some(
        (s) => `${s.id}__${s.backtestTable || ''}` === selectedStrategyKey
      );
      if (!exists) {
        setSelectedStrategyKey(`${filteredHoldingStrategies[0].id}__${filteredHoldingStrategies[0].backtestTable || ''}`);
      }
    }
  }, [filteredHoldingStrategies, selectedStrategyKey]);

  const selectedStrat = useMemo(() => {
    if (selectedStrategyKey) {
      const found = holdingStrategies.find((s) => `${s.id}__${s.backtestTable || ''}` === selectedStrategyKey);
      if (found) return found;
    }
    return holdingStrategies[0] || null;
  }, [selectedStrategyKey, holdingStrategies]);

  // Fetch Strategy detail on selected strategy change
  useEffect(() => {
    if (useFallback) return;
    if (!selectedStrat?.id) return;

    let active = true;
    const loadDetail = async () => {
      try {
        setLoadingDetail(true);
        const res = await fetchBehaviorStrategyDetail({ 
          strategyId: selectedStrat.id, 
          tableName: selectedStrat.backtestTable 
        });
        if (active && res?.success) {
          setStrategyDetail(res.data);
        }
      } catch (err) {
        console.error('Failed to load strategy details:', err);
      } finally {
        if (active) setLoadingDetail(false);
      }
    };

    loadDetail();
    return () => {
      active = false;
    };
  }, [selectedStrat?.id, selectedStrat?.backtestTable, fetchBehaviorStrategyDetail, useFallback]);

  const scatterData = useMemo(() => {
    if (useFallback || !strategyDetail) {
      return generateScatterData(selectedStrat?.id || '003XAUUSDH1OB');
    }
    return strategyDetail.scatterData;
  }, [selectedStrat?.id, strategyDetail, useFallback]);

  const volumeEscalationData = useMemo(() => {
    if (useFallback || !strategyDetail) {
      return generateVolumeEscalationData(selectedStrat?.id || '003XAUUSDH1OB');
    }
    return strategyDetail.volumeEscalationData;
  }, [selectedStrat?.id, strategyDetail, useFallback]);

  if (!holdingLoading && !selectedStrat) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">Không có dữ liệu holding strategies</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%' }}>
      <Alert
        severity="warning"
        icon={<WarningOutlined style={{ color: '#FF0000' }} />}
        sx={{
          mb: 2.5,
          py: 0.75,
          bgcolor: '#FFF5F5',
          color: '#FF0000',
          border: '1px solid',
          borderColor: '#FFE0E0',
          borderRadius: 2,
          fontWeight: 600
        }}
      >
        Phân tích tỷ lệ nắm giữ (HTR) và hệ số nhân Lot (VEI) để phát hiện hành vi gồng lỗ & nhồi lệnh ẩn.
      </Alert>

      {/* KPI Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          {
            label: 'Holding Time Ratio (HTR)',
            value: selectedStrat ? `${selectedStrat.htr.toFixed(2)}x` : '—',
            sub: !selectedStrat ? 'Đang tải...' : selectedStrat.htr > 2.0 ? 'Gồng lỗ nghiêm trọng (Loss Averse)' : selectedStrat.htr > 1.5 ? 'Lệch nắm giữ trung bình' : 'Nắm giữ cân bằng (An toàn)',
            color: !selectedStrat ? '#888888' : selectedStrat.htr > 2.0 ? '#D32F2F' : selectedStrat.htr > 1.5 ? '#e5a800' : '#2E7D32',
            bg: !selectedStrat ? 'rgba(0, 0, 0, 0.04)' : selectedStrat.htr > 2.0 ? 'rgba(211, 47, 47, 0.08)' : selectedStrat.htr > 1.5 ? '#fef7e0' : 'rgba(46, 125, 50, 0.08)'
          },
          {
            label: 'Volume Escalation Index (VEI)',
            value: selectedStrat ? `${selectedStrat.vei.toFixed(2)}x` : '—',
            sub: !selectedStrat ? 'Đang tải...' : selectedStrat.vei > 1.2 ? 'Nguy cơ Martingale cao (Rủi ro cháy)' : selectedStrat.vei > 1.0 ? 'Gia tăng khối lượng nhẹ' : 'Quản lý vốn an toàn (Lành mạnh)',
            color: !selectedStrat ? '#888888' : selectedStrat.vei > 1.2 ? '#D32F2F' : selectedStrat.vei > 1.0 ? '#e5a800' : '#2E7D32',
            bg: !selectedStrat ? 'rgba(0, 0, 0, 0.04)' : selectedStrat.vei > 1.2 ? 'rgba(211, 47, 47, 0.08)' : selectedStrat.vei > 1.0 ? '#fef7e0' : 'rgba(46, 125, 50, 0.08)'
          },
          {
            label: 'Behavior Assessment',
            value: selectedStrat ? selectedStrat.status : '—',
            sub: !selectedStrat ? 'Đang tải...' : `ID: ${selectedStrat.id} · ${selectedStrat.totalTrades} deals`,
            color: !selectedStrat ? '#888888' : (selectedStrat.status?.includes('Risk') || selectedStrat.status?.includes('Averse') ? '#D32F2F' : '#2E7D32'),
            bg: !selectedStrat ? 'rgba(0, 0, 0, 0.04)' : (selectedStrat.status?.includes('Risk') || selectedStrat.status?.includes('Averse') ? 'rgba(211, 47, 47, 0.08)' : 'rgba(46, 125, 50, 0.08)')
          }
        ].map((kpi, idx) => (
          <Grid key={idx} size={{ xs: 12, sm: 4 }}>
            <Box
              sx={{
                p: 2,
                bgcolor: kpi.bg,
                border: '1px solid',
                borderColor: kpi.color,
                borderRadius: 2.5,
                height: '100%',
                position: 'relative'
              }}
            >
              {holdingLoading && (
                <Box sx={{ position: 'absolute', top: 12, right: 12 }}>
                  <CircularProgress size={14} thickness={5} sx={{ color: '#888888' }} />
                </Box>
              )}
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                {kpi.label}
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 800, color: kpi.color, mb: 0.5 }}>
                {kpi.value}
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 600, color: kpi.color === '#2E7D32' ? '#2E7D32' : kpi.color === '#e5a800' ? '#b28200' : kpi.color === '#888888' ? '#888888' : '#D32F2F' }}>
                {kpi.sub}
              </Typography>
            </Box>
          </Grid>
        ))}
      </Grid>

      {/* Charts Grid */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <MainCard
            title={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography variant="subtitle2" fontWeight={800} sx={{ color: 'var(--chart-title-color, #1F3864)' }}>THỜI GIAN GIỮ LỆNH VÀ LỢI NHUẬN</Typography>
                <IconButton size="small" onClick={() => triggerHelp('c11')} sx={{ p: 0.25, color: 'text.secondary' }}>
                  <QuestionCircleOutlined style={{ fontSize: '13px' }} />
                </IconButton>
              </Box>
            }
            secondary={renderHeaderActions('Holding time vs profitability', 'Phân tích phân phối thời gian giữ lệnh thắng/thua', scatterData)}
            sx={{ height: '100%' }}
          >
            {holdingLoading ? (
              <CardLoader height={340} message="Đang tải dữ liệu..." />
            ) : holdingError ? (
              <CardError error={holdingError} />
            ) : (
            <>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              Thời gian giữ lệnh (phút) vs. Lợi nhuận ($). Mỗi dấu chấm đại diện cho một lệnh. 
              <span style={{ color: isDarkMode ? '#81c784' : '#2E7D32', fontWeight: 700, marginLeft: '6px', marginRight: '4px' }}>●</span>Lệnh Thắng
              <span style={{ color: isDarkMode ? '#e57373' : '#D32F2F', fontWeight: 700, marginLeft: '12px', marginRight: '4px' }}>●</span>Lệnh Thua
            </Typography>
            <Box sx={{ position: 'relative', width: '100%', height: 300 }}>
              {loadingDetail && (
                <Box sx={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  display: 'flex', justifyContent: 'center', alignItems: 'center',
                  bgcolor: isDarkMode ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.6)', zIndex: 2
                }}>
                  <CircularProgress size={30} thickness={4} sx={{ color: chartTextColor }} />
                </Box>
              )}
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 30, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} strokeOpacity={0.3} />
                  <XAxis 
                    type="number" 
                    dataKey="holdTime" 
                    name="Holding Time" 
                    unit="m" 
                    tick={{ fontSize: 9, fill: chartTextColor, fontWeight: 600 }}
                    axisLine={{ stroke: chartGridColor }}
                  />
                  <YAxis 
                    type="number" 
                    dataKey="profit" 
                    name="Profit" 
                    unit="$" 
                    tick={{ fontSize: 9, fill: chartTextColor, fontWeight: 600 }}
                    axisLine={{ stroke: chartGridColor }}
                  />
                  <ZAxis type="number" range={[40, 40]} />
                  <RechartsTooltip 
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <Box sx={{
                          bgcolor: 'rgba(15, 23, 42, 0.95)',
                          backdropFilter: 'blur(8px)',
                          color: '#f8fafc',
                          p: 1.25,
                          borderRadius: 2,
                          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.4)',
                          fontSize: '0.75rem',
                          border: '1px solid rgba(255,255,255,0.08)'
                        }}>
                          <Typography variant="caption" sx={{ fontWeight: 700, color: d.type === 'win' ? '#81c784' : '#e57373', display: 'block', mb: 0.5 }}>
                            Lệnh {d.type === 'win' ? 'Thắng' : 'Thua'}
                          </Typography>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                            <span style={{ color: '#cbd5e1' }}>Giữ lệnh:</span>
                            <strong style={{ fontFamily: 'monospace' }}>{d.holdTime} phút</strong>
                          </Box>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mt: 0.5 }}>
                            <span style={{ color: '#cbd5e1' }}>Lợi nhuận:</span>
                            <strong style={{ fontFamily: 'monospace', color: d.profit >= 0 ? '#81c784' : '#e57373' }}>
                              {d.profit >= 0 ? '+' : ''}${d.profit}
                            </strong>
                          </Box>
                        </Box>
                      );
                    }}
                  />
                  <Scatter name="Wins" data={scatterData.filter(d => d.type === 'win')} fill={isDarkMode ? '#81c784' : '#2E7D32'} />
                  <Scatter name="Losses" data={scatterData.filter(d => d.type === 'loss')} fill={isDarkMode ? '#e57373' : '#D32F2F'} />
                </ScatterChart>
              </ResponsiveContainer>
            </Box>
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: chartTextColor, bgcolor: isDarkMode ? 'rgba(255,255,255,0.05)' : '#F5F7FA', py: 0.5, px: 1.5, borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}>
                Đang hiển thị: <strong style={{ color: '#2E75B6', fontFamily: 'monospace' }}>{selectedStrat?.id || '—'}</strong> — <strong style={{ color: '#70AD47', fontFamily: 'monospace' }}>{selectedStrat?.backtestTable || '—'}</strong>
              </Typography>
            </Box>
            </>
            )}
          </MainCard>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <MainCard
            title={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography variant="subtitle2" fontWeight={800} sx={{ color: 'var(--chart-title-color, #1F3864)' }}>CHỈ SỐ PHÁT HIỆN MARTINGALE</Typography>
                <IconButton size="small" onClick={() => triggerHelp('c12')} sx={{ p: 0.25, color: 'text.secondary' }}>
                  <QuestionCircleOutlined style={{ fontSize: '13px' }} />
                </IconButton>
              </Box>
            }
            secondary={renderHeaderActions('Volume escalation index', 'Phân tích hệ số nhồi lệnh sau chuỗi thua', volumeEscalationData)}
            sx={{ height: '100%' }}
          >
            {holdingLoading ? (
              <CardLoader height={340} message="Đang tải dữ liệu..." />
            ) : holdingError ? (
              <CardError error={holdingError} />
            ) : (
            <>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              Hệ số nhân Lot (Volume Multiplier) so với Base Lot sau chuỗi lệnh thua liên tiếp. 
              Màu <span style={{ color: isDarkMode ? '#e57373' : '#D32F2F', fontWeight: 700 }}>Đỏ</span> cảnh báo nhồi lệnh Martingale.
            </Typography>
            <Box sx={{ position: 'relative', width: '100%', height: 300 }}>
              {loadingDetail && (
                <Box sx={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  display: 'flex', justifyContent: 'center', alignItems: 'center',
                  bgcolor: isDarkMode ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.6)', zIndex: 2
                }}>
                  <CircularProgress size={30} thickness={4} sx={{ color: chartTextColor }} />
                </Box>
              )}
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={volumeEscalationData} margin={{ top: 10, right: 30, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} strokeOpacity={0.3} vertical={false} />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 9, fill: chartTextColor, fontWeight: 600 }}
                    tickLine={false}
                    axisLine={{ stroke: chartGridColor }}
                  />
                  <YAxis 
                    tick={{ fontSize: 9, fill: chartTextColor, fontWeight: 600 }}
                    axisLine={{ stroke: chartGridColor }}
                    tickFormatter={(v) => `${v}x`}
                  />
                  <RechartsTooltip 
                    cursor={{ fill: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <Box sx={{
                          bgcolor: 'rgba(15, 23, 42, 0.95)',
                          backdropFilter: 'blur(8px)',
                          color: '#f8fafc',
                          p: 1.25,
                          borderRadius: 2,
                          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.4)',
                          fontSize: '0.75rem',
                          border: '1px solid rgba(255,255,255,0.08)'
                        }}>
                          <Typography variant="caption" sx={{ fontWeight: 700, color: '#94a3b8', display: 'block', mb: 0.5 }}>
                            {d.name}
                          </Typography>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                            <span style={{ color: '#cbd5e1' }}>Hệ số nhân:</span>
                            <strong style={{ fontFamily: 'monospace', color: d.multiplier > 1.2 ? (isDarkMode ? '#e57373' : '#FF0000') : (isDarkMode ? '#81c784' : '#70AD47') }}>
                              {d.multiplier.toFixed(2)}x
                            </strong>
                          </Box>
                        </Box>
                      );
                    }}
                  />
                  <Bar dataKey="multiplier" radius={[4, 4, 0, 0]} barSize={36}>
                    {volumeEscalationData.map((entry, idx) => {
                      const color = entry.multiplier > 1.2 ? (isDarkMode ? '#e57373' : '#D32F2F') : entry.multiplier > 1.0 ? (isDarkMode ? '#facc15' : '#e5a800') : (isDarkMode ? '#81c784' : '#2E7D32');
                      return <Cell key={idx} fill={color} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Box>
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: chartTextColor, bgcolor: isDarkMode ? 'rgba(255,255,255,0.05)' : '#F5F7FA', py: 0.5, px: 1.5, borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}>
                Đang hiển thị: <strong style={{ color: '#2E75B6', fontFamily: 'monospace' }}>{selectedStrat?.id || '—'}</strong> — <strong style={{ color: '#70AD47', fontFamily: 'monospace' }}>{selectedStrat?.backtestTable || '—'}</strong>
              </Typography>
            </Box>
            </>
            )}
          </MainCard>
        </Grid>
      </Grid>

      {/* Table */}
      <MainCard
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Typography variant="subtitle2" fontWeight={800} sx={{ color: 'var(--chart-title-color, #1F3864)' }}>DANH SÁCH CHI TIẾT HÀNH VI ĐỘNG LỰC HỌC</Typography>
          </Box>
        }
        sx={{ width: '100%' }}
      >
        {holdingLoading ? (
          <CardLoader height={300} message="Đang tải dữ liệu..." />
        ) : holdingError ? (
          <CardError error={holdingError} />
        ) : (
        <>
        <TableToolbar
          search={holdingTable.search}
          onSearch={holdingTable.setSearch}
          filterSlot={
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel sx={{ color: 'var(--chart-title-color, #1F3864)', fontWeight: 600 }}>Lọc Hành Vi</InputLabel>
              <Select
                label="Lọc Hành Vi"
                value={holdingFilter}
                onChange={(e) => { setHoldingFilter(e.target.value); holdingTable.setPage(0); }}
                sx={{
                  borderRadius: 2,
                  bgcolor: isDarkMode ? 'background.paper' : '#FFFFFF',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#2E75B6' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: chartTextColor }
                }}
              >
                <MenuItem value="all">Tất cả</MenuItem>
                <MenuItem value="Excellent">Excellent (An toàn)</MenuItem>
                <MenuItem value="Toxic">Toxic/Risk (Cảnh báo)</MenuItem>
                <MenuItem value="Loss Averse">Loss Averse (Gồng lỗ)</MenuItem>
                <MenuItem value="Martingale Risk">Martingale (Nhồi lot)</MenuItem>
              </Select>
            </FormControl>
          }
          countLabel={`${holdingTable.filtered.length} strategies`}
        />
        <TableContainer component={Paper} sx={{ ...tablePaperSx, ...stickyTableSx }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'background.default' }}>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Strategy</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Backtest</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Total Trades</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Avg Win Hold</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Avg Loss Hold</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>HTR Ratio</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>VEI Multiplier</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {holdingTable.paginated.map((row, idx) => {
                const rowKey = `${row.id}__${row.backtestTable || ''}`;
                const isSelected = selectedStrat && row.id === selectedStrat.id && row.backtestTable === selectedStrat.backtestTable;
                const htrColor = row.htr > 2.0 ? '#D32F2F' : row.htr > 1.5 ? '#e5a800' : '#2E7D32';
                const veiColor = row.vei > 1.2 ? '#D32F2F' : row.vei > 1.0 ? '#e5a800' : '#2E7D32';
                const getStatusColors = (status) => {
                  if (status === 'Critical Risk') return { color: '#D32F2F', bg: 'rgba(211, 47, 47, 0.08)', border: '#FFC7C7' };
                  if (status === 'Loss Averse') return { color: '#e5a800', bg: '#fef7e0', border: '#fef1c2' };
                  if (status === 'Martingale Risk') return { color: '#D32F2F', bg: 'rgba(211, 47, 47, 0.08)', border: '#FFC7C7' };
                  return { color: '#2E7D32', bg: 'rgba(46, 125, 50, 0.08)', border: '#D0E9C0' };
                };
                const sColors = getStatusColors(row.status);
                
                return (
                  <TableRow 
                    key={`${row.id}_${row.backtestTable || ''}_${idx}`} 
                    hover 
                    selected={isSelected}
                    onClick={() => setSelectedStrategyKey(rowKey)}
                    sx={{ 
                      cursor: 'pointer',
                      bgcolor: isSelected ? 'rgba(30, 41, 59, 0.04) !important' : 'inherit'
                    }}
                  >
                    <TableCell align="center" sx={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--chart-title-color, #1F3864)' }}>{row.id}</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.75rem', color: 'text.secondary' }}>{row.backtestTable || '—'}</TableCell>
                    <TableCell align="center">{row.totalTrades}</TableCell>
                    <TableCell align="center">{row.avgWinTime}m</TableCell>
                    <TableCell align="center" sx={{ color: row.htr > 2.0 ? '#D32F2F' : 'inherit' }}>{row.avgLossTime}m</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 800, color: htrColor }}>{row.htr.toFixed(2)}x</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 800, color: veiColor }}>{row.vei.toFixed(2)}x</TableCell>
                    <TableCell align="center">
                      <Chip
                        label={row.status}
                        size="small"
                        sx={{
                          height: 22,
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          color: sColors.color,
                          bgcolor: sColors.bg,
                          border: '1px solid',
                          borderColor: sColors.border,
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
          count={holdingTable.filtered.length}
          page={holdingTable.page}
          rowsPerPage={holdingTable.rowsPerPage}
          onPageChange={(_, newPage) => holdingTable.setPage(newPage)}
          onRowsPerPageChange={(e) => {
            holdingTable.setRowsPerPage(parseInt(e.target.value, 10));
            holdingTable.setPage(0);
          }}
        />
        </>
        )}
      </MainCard>
    </Box>
  );
}
