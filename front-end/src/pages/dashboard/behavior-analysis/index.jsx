import { useState, useMemo, useCallback, useEffect } from 'react';
import { useBehaviorAnalysis } from 'hooks/useBehaviorAnalysis';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import { useTheme } from '@mui/material/styles';

import InfoCircleOutlined from '@ant-design/icons/InfoCircleOutlined';
import SearchOutlined from '@ant-design/icons/SearchOutlined';
import RobotOutlined from '@ant-design/icons/RobotOutlined';
import FileTextOutlined from '@ant-design/icons/FileTextOutlined';
import CalendarOutlined from '@ant-design/icons/CalendarOutlined';
import MainCard from 'components/MainCard';
import DashboardKpiSummary from 'components/dashboard/DashboardKpiSummary';
import DashboardRemarksDialog from 'components/dashboard/DashboardRemarksDialog';
import DashboardFilterBar from 'components/dashboard/DashboardFilterBar';
import DirectionalTab from './DirectionalTab';
import ActivityTab from './ActivityTab';
import ExitBehaviorTab from './ExitBehaviorTab';
import HoldingRecoveryTab from './HoldingRecoveryTab';
import CircularProgress from '@mui/material/CircularProgress';
import { getStoredDashboardTable, getStoredDashboardSources, getStoredDashboardDateRange } from 'utils/dashboardTable';
import {
  getBehaviorAnalysisCore,
  getBehaviorAnalysisActivity,
  getBehaviorAnalysisHoldingRecovery,
  getBehaviorAnalysisExit
} from 'api/dashboard';

// ==========================================
// CLASS 4 — BEHAVIOR ANALYSIS (mock + generators)
// ==========================================

const SYMBOLS = ['EURUSD', 'XAUUSD', 'GBPUSD', 'GBPJPY', 'USDCAD', 'AUDUSD', 'USDJPY', 'BTCUSD'];
const TFS = ['H1', 'H4'];
const DIRS = ['OB', 'OS'];
const YEARS = ['2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026'];

const genStrategyId = (i) => {
  const sym = SYMBOLS[i % SYMBOLS.length];
  const tf = TFS[i % 2];
  const dir = DIRS[i % 2];
  return `${String((i % 99) + 1).padStart(3, '0')}${sym}${tf}${dir}`;
};

const MOCK_DIRECTIONAL_BIAS_DATA = [
  { id: '001EURUSDH1OB', symbol: 'EURUSD', tf: 'H1', bot: '007', buyProfit: 12400, sellProfit: 1200, buyPct: 91, sellPct: 9, weakPct: 9, status: 'DirectionalBias' },
  { id: '003XAUUSDH4OB', symbol: 'XAUUSD', tf: 'H4', bot: '003', buyProfit: 850, sellProfit: 14200, buyPct: 6, sellPct: 94, weakPct: 6, status: 'DirectionalBias' },
  { id: '005GBPJPYH1OB', symbol: 'GBPJPY', tf: 'H1', bot: '005', buyProfit: 19500, sellProfit: 950, buyPct: 95, sellPct: 5, weakPct: 5, status: 'DirectionalBias' },
  { id: '002AUDUSDH4OB', symbol: 'AUDUSD', tf: 'H4', bot: '002', buyProfit: -3500, sellProfit: 7800, buyPct: 0, sellPct: 100, weakPct: 0, status: 'One-Way Edge' },
  ...Array.from({ length: 28 }, (_, i) => {
    const buyPct = 15 + (i * 7) % 70;
    const sellPct = 100 - buyPct;
    const total = 8000 + i * 420;
    return {
      id: genStrategyId(i + 10),
      symbol: SYMBOLS[i % SYMBOLS.length],
      tf: TFS[i % 2],
      bot: String((i % 12) + 1).padStart(3, '0'),
      buyProfit: Math.round((total * buyPct) / 100),
      sellProfit: Math.round((total * sellPct) / 100),
      buyPct,
      sellPct,
      weakPct: Math.min(buyPct, sellPct),
      status: Math.min(buyPct, sellPct) < 20 ? 'DirectionalBias' : 'Balanced'
    };
  })
];

const MOCK_BUY_SELL_BREAKDOWN = SYMBOLS.map((symbol, i) => ({
  symbol,
  buyCount: 120 + i * 18,
  buyWR: 48 + (i % 12),
  buyAvgProf: 40 + i * 12,
  sellCount: 110 + i * 14,
  sellWR: 46 + (i % 10),
  sellAvgProf: 35 + i * 8
}));

const MOCK_TIMEFRAME_MISMATCH_DATA = [
  { id: '002GBPUSDH1OB', symbol: 'GBPUSD', bot: '002', h1Count: 98, h4Count: 312, ratio: 3.18, status: 'TimeframeMismatch' },
  { id: '004XAUUSDH1OB', symbol: 'XAUUSD', bot: '004', h1Count: 45, h4Count: 245, ratio: 5.44, status: 'Severe' },
  { id: '001AUDUSDH1OB', symbol: 'AUDUSD', bot: '001', h1Count: 120, h4Count: 190, ratio: 1.58, status: 'Moderate' },
  ...Array.from({ length: 22 }, (_, i) => ({
    id: genStrategyId(i + 50),
    symbol: SYMBOLS[i % SYMBOLS.length],
    bot: String((i % 8) + 1).padStart(3, '0'),
    h1Count: 50 + i * 3,
    h4Count: 90 + i * 8,
    ratio: parseFloat(((90 + i * 8) / (50 + i * 3)).toFixed(2)),
    status: i % 3 === 0 ? 'Severe' : 'TimeframeMismatch'
  }))
];

const MOCK_ACTIVITY_GAP_DATA = [
  { id: '003EURUSDH4OB', trades: 142, maxGap: 58, zeroMonths: 9, status: 'Critical' },
  { id: '001USDJPYH1OB', trades: 312, maxGap: 42, zeroMonths: 6, status: 'Seasonal' },
  { id: '002GBPJPYH4OB', trades: 185, maxGap: 35, zeroMonths: 4, status: 'Stable' },
  { id: '005AUDUSDH1OB', trades: 215, maxGap: 18, zeroMonths: 1, status: 'Excellent' },
  { id: '004GBPUSDH4OB', trades: 98, maxGap: 49, zeroMonths: 8, status: 'Critical' },
  ...Array.from({ length: 35 }, (_, i) => ({
    id: genStrategyId(i + 120),
    trades: 80 + i * 5,
    maxGap: 12 + (i % 15) * 3,
    zeroMonths: i % 6,
    status: i % 5 === 0 ? 'Critical' : i % 3 === 0 ? 'Seasonal' : 'Stable'
  }))
];

const EXIT_REASONS_RAW = [
  { symbol: 'EURUSD', tp: 48, sl: 32, co: 12, eot: 8 },
  { symbol: 'XAUUSD', tp: 35, sl: 45, co: 5, eot: 15 },
  { symbol: 'GBPUSD', tp: 52, sl: 28, co: 15, eot: 5 },
  { symbol: 'GBPJPY', tp: 42, sl: 38, co: 10, eot: 10 },
  { symbol: 'USDCAD', tp: 30, sl: 50, co: 12, eot: 8 }
];
const MOCK_EXIT_REASONS_DATA = [
  ...EXIT_REASONS_RAW,
  ...SYMBOLS.filter((s) => !EXIT_REASONS_RAW.some((r) => r.symbol === s)).map((symbol, i) => ({
    symbol,
    tp: 40 + (i * 3) % 15,
    sl: 35 + (i * 2) % 12,
    co: 10 + i % 8,
    eot: 8 + (i * 2) % 6
  }))
];

const COMMISSION_PER_LOT_RAW = [
  { symbol: 'EURUSD', avgFeePerLot: 6.5, minFeePerLot: 4.2, maxFeePerLot: 12.8, dealCount: 4520 },
  { symbol: 'XAUUSD', avgFeePerLot: 18.3, minFeePerLot: 12.1, maxFeePerLot: 35.6, dealCount: 3240 },
  { symbol: 'GBPUSD', avgFeePerLot: 7.2, minFeePerLot: 4.8, maxFeePerLot: 14.5, dealCount: 2890 },
  { symbol: 'USDJPY', avgFeePerLot: 5.8, minFeePerLot: 3.9, maxFeePerLot: 11.2, dealCount: 2150 },
  { symbol: 'BTCUSD', avgFeePerLot: 45.2, minFeePerLot: 28.5, maxFeePerLot: 88.9, dealCount: 1240 }
];
const MOCK_COMMISSION_PER_LOT_DATA = [
  ...COMMISSION_PER_LOT_RAW,
  ...SYMBOLS.filter((s) => !COMMISSION_PER_LOT_RAW.some((r) => r.symbol === s)).map((symbol, i) => ({
    symbol,
    avgFeePerLot: 5 + (i * 1.5) % 10,
    minFeePerLot: 2 + i % 5,
    maxFeePerLot: 8 + (i * 2) % 15,
    dealCount: 800 + i * 120
  }))
];

const MOCK_HOLDING_RECOVERY_STRATEGIES = [
  { id: '003XAUUSDH1OB', symbol: 'XAUUSD', totalTrades: 450, avgWinTime: 30, avgLossTime: 150, htr: 5.0, vei: 3.2, status: 'Critical Risk', backtestTable: 'backtest_gold_h1' },
  { id: '002GBPUSDH4OB', symbol: 'GBPUSD', totalTrades: 198, avgWinTime: 120, avgLossTime: 110, htr: 0.92, vei: 2.8, status: 'Martingale Risk', backtestTable: 'backtest_gbpusd_h4' },
  { id: '001EURUSDH1OB', symbol: 'EURUSD', totalTrades: 342, avgWinTime: 45, avgLossTime: 180, htr: 4.0, vei: 1.0, status: 'Loss Averse', backtestTable: 'backtest_eurusd_h1' },
  { id: '005GBPJPYH1OB', symbol: 'GBPJPY', totalTrades: 215, avgWinTime: 95, avgLossTime: 90, htr: 0.95, vei: 1.0, status: 'Excellent', backtestTable: 'backtest_gbpjpy_h1' },
  { id: '007AUDUSDH4OB', symbol: 'AUDUSD', totalTrades: 180, avgWinTime: 60, avgLossTime: 72, htr: 1.2, vei: 1.0, status: 'Excellent', backtestTable: 'backtest_audusd_h4' },
  { id: '008USDCADH1OB', symbol: 'USDCAD', totalTrades: 120, avgWinTime: 50, avgLossTime: 250, htr: 5.0, vei: 1.0, status: 'Loss Averse', backtestTable: 'backtest_usdcad_h1' },
  { id: '009NZDUSDH4OB', symbol: 'NZDUSD', totalTrades: 160, avgWinTime: 80, avgLossTime: 96, htr: 1.2, vei: 1.8, status: 'Martingale Risk', backtestTable: 'backtest_nzdusd_h4' },
  { id: '010EURJPYH1OB', symbol: 'EURJPY', totalTrades: 280, avgWinTime: 75, avgLossTime: 82, htr: 1.09, vei: 1.0, status: 'Excellent', backtestTable: 'backtest_eurjpy_h1' },
  ...Array.from({ length: 32 }, (_, i) => {
    const isToxic = i % 3 === 0;
    const isMartingale = i % 4 === 0;
    const avgWinTime = 40 + (i * 12) % 100;
    const htr = isToxic ? parseFloat((3.0 + (i % 3) * 0.8).toFixed(2)) : parseFloat((0.8 + (i % 4) * 0.15).toFixed(2));
    const avgLossTime = Math.round(avgWinTime * htr);
    const vei = isMartingale ? parseFloat((1.8 + (i % 3) * 0.5).toFixed(2)) : 1.0;
    
    let status = 'Excellent';
    if (htr > 2.0 && vei > 1.2) status = 'Critical Risk';
    else if (htr > 2.0) status = 'Loss Averse';
    else if (vei > 1.2) status = 'Martingale Risk';
    
    return {
      id: genStrategyId(i + 150),
      symbol: SYMBOLS[i % SYMBOLS.length],
      totalTrades: 100 + i * 15,
      avgWinTime,
      avgLossTime,
      htr,
      vei,
      status,
      backtestTable: `backtest_${SYMBOLS[i % SYMBOLS.length].toLowerCase()}_h${i % 2 === 0 ? '1' : '4'}`
    };
  })
];

const BEHAVIOR_EXPLAINERS = {
  c1: { title: 'Lệch chiều giao dịch', engTitle: 'Directional Bias', formula: 'Chiều yếu < 20% profit chiều mạnh', desc: 'Phát hiện cặp OB/OS cùng bot+symbol+timeframe lệch nặng một chiều Buy/Sell. Hệ thống sẽ gắn Flag cảnh báo khi chiều yếu chiếm dưới 20% tổng profit.' },
  c2: { title: 'Hiệu suất Mua/Bán theo Cặp', engTitle: 'Buy vs Sell Breakdown', formula: 'Avg profit, winrate, số lệnh theo chiều', desc: 'Phân tích chi tiết theo symbol — đánh giá tính trung lập thị trường (market-neutral behavior) của các giao dịch Mua và Bán.' },
  c3: { title: 'Lệch khung thời gian', engTitle: 'Timeframe Mismatch', formula: 'Số deal bị lệch / Số deal chuẩn', desc: 'Kiểm tra chéo tính nhất quán của khung thời gian. Đối với strategy đăng ký H1, mọi deal có comment timeframe bắt buộc phải chứa _H1_. Ngược lại, strategy H4 chỉ chứa deal _H4_. Bất kỳ deal nào mang timeframe ngược lại sẽ bị tính là lệch.\n• NORMAL: Tỷ lệ lệch = 0x (Hoàn toàn chuẩn khung).\n• MODERATE: Tỷ lệ lệch < 1.5x.\n• TIMEFRAME MISMATCH: Tỷ lệ lệch >= 1.5x.\n• SEVERE: Tỷ lệ lệch >= 3.0x.' },
  c4: { title: 'Bản đồ nhiệt hiệu suất', engTitle: 'Temporal Heatmap', formula: 'Profit & Winrate × Giờ / Thứ / Tháng', desc: 'Trực quan hóa phân bổ lợi nhuận và tỷ lệ thắng theo 3 chiều thời gian (Giờ trong ngày, Thứ trong tuần, Tháng trong năm) để phát hiện các khoảng thời gian giao dịch tối ưu.' },
  c5: { title: 'Tính ổn định hàng năm', engTitle: 'Annual Stability', formula: 'Profit từng năm / strategy', desc: 'Đo lường tính ổn định của từng strategy qua các năm. Phân biệt strategy giữ vững phong độ ổn định lâu dài (Stable) với strategy chỉ tốt trong một giai đoạn ngắn (Volatile).' },
  c6: { title: 'Tính mùa vụ theo quý', engTitle: 'Quarterly Seasonality', formula: 'Performance Q1–Q4', desc: 'Phân tích hiệu suất giao dịch tổng hợp hoặc chi tiết theo từng quý (Q1 đến Q4) để nắm bắt chu kỳ mùa vụ của thị trường.' },
  c8: { title: 'Khoảng lặng giao dịch', engTitle: 'Inactivity & Dormancy', formula: 'Max gap giữa 2 deal + tháng 0 lệnh', desc: 'Theo dõi nhịp độ giao dịch để phát hiện các strategy bị đứng lệnh quá lâu hoặc có nhiều tháng liền không phát sinh lệnh (Critical gap ≥ 40 ngày hoặc Dormant ≥ 6 tháng không lệnh).' },
  c9: { title: 'Hành vi thoát lệnh', engTitle: 'Exit Reasons', formula: 'SL / TP / CO / EoT theo symbol', desc: 'Phân tích cấu trúc lý do đóng lệnh thực tế của hệ thống (Chốt lời cứng TP, Cắt lỗ cứng SL, Đóng lệnh chủ động bằng thuật toán CO, Hết hạn backtest EoT) theo từng cặp sản phẩm.' },
  c10: { title: 'Phí hoa hồng theo lot', engTitle: 'Commission per Lot by Symbol', formula: 'AVG / MIN / MAX (commission / volume) theo symbol', desc: 'Kiểm tra chi phí giao dịch thực tế trên từng symbol. Khoảng MAX rộng so với AVG là dấu hiệu có deal lots nhỏ đang bị trừ phí hoa hồng cao bất thường — cần kiểm tra lại cấu hình commission trên broker.' },
  c11: { title: 'Gồng lỗ cắt non', engTitle: 'Asymmetric Loss Aversion', formula: 'HTR = Avg Loss Time / Avg Win Time', desc: 'Đo lường thời gian giữ lệnh thua so với lệnh thắng của chiến lược:\n• AN TOÀN: HTR ≤ 1.5 (Thời gian giữ lệnh lỗ tương đương hoặc ngắn hơn lệnh lời, cắt lỗ dứt khoát).\n• CẢNH BÁO: 1.5 < HTR ≤ 2.0 (Bắt đầu có dấu hiệu giữ lệnh lỗ lâu hơn để chờ phục hồi).\n• NGUY HIỂM: HTR > 2.0 (Gồng lỗ cắt non nghiêm trọng, không nên đưa vào portfolio).' },
  c12: { title: 'Hành vi nhồi lệnh', engTitle: 'Volume Escalation Index', formula: 'VEI = Avg Lot sau 3 chuỗi thua / Base Lot', desc: 'Đo lường sự gia tăng khối lượng giao dịch sau chuỗi lệnh thua liên tiếp để gỡ gạc:\n• AN TOÀN: VEI ≤ 1.0 (Khối lượng giữ nguyên hoặc giảm đi sau chuỗi thua để bảo vệ tài khoản).\n• CẢNH BÁO: 1.0 < VEI ≤ 1.2 (Tăng nhẹ khối lượng giao dịch, cần giám sát chặt).\n• NGUY HIỂM: VEI > 1.2 (Hành vi nhồi lệnh gấp thếp Martingale hoặc Grid ẩn, nguy cơ cháy tài khoản cực cao khi gặp sóng một chiều).' }
};

const TAB_CONFIG = [
  { id: 'directional', label: 'Directional Bias' },
  { id: 'activity', label: 'Trading Activity' },
  { id: 'exit', label: 'Exit Behavior' },
  { id: 'holding', label: 'Holding & Recovery' }
];

// ==========================================
// SHARED UI
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
  const isDarkMode = theme.palette.mode === 'dark';
  const isProfitMetric = metric === 'profit';
  const value = isProfitMetric ? profit : wr;
  const isNegative = isProfitMetric ? profit < 0 : wr < 50;
  const intensity = isProfitMetric
    ? Math.min(1, Math.abs(profit) / (maxAbsProfit || 1))
    : Math.min(1, Math.abs(wr - 50) / 25);
  const bg = isNegative
    ? `rgba(255, 0, 0, ${0.08 + intensity * 0.55})`
    : `rgba(112, 173, 71, ${0.08 + intensity * 0.55})`;

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
    <Tooltip
      title={`${label}: ${profit >= 0 ? '+' : ''}$${profit.toLocaleString()} · WR ${wr}%`}
      arrow
      placement="top"
    >
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
        <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', fontSize: '0.65rem', color: 'var(--chart-title-color, #1F3864)' }}>
          {label}
        </Typography>
        <Typography variant="caption" sx={{ fontWeight: 800, fontSize: '0.65rem', color: isNegative ? (isDarkMode ? '#e57373' : '#FF0000') : (isDarkMode ? '#81c784' : '#70AD47'), whiteSpace: 'nowrap' }}>
          {isProfitMetric ? formatProfit(profit) : `${wr}%`}
        </Typography>
      </Box>
    </Tooltip>
  );
}

const tablePaperSx = { boxShadow: 'none', border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflowX: 'auto' };
const stickyTableSx = { maxHeight: 480 };

// ==========================================
// MAIN PAGE
// ==========================================

export default function BehaviorAnalysis() {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const chartTextColor = isDarkMode ? '#cbd5e1' : '#1F3864';
  const chartGridColor = isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#CBD5E1';

  const tooltipSlotProps = {
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
        padding: '8px 12px',
        borderRadius: '6px',
        lineHeight: 1.4
      }
    },
    arrow: {
      sx: {
        color: isDarkMode ? '#1e293b' : '#0f172a'
      }
    }
  };

  const renderHeaderActions = (chartName, promptMsg, chartData) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto', mr: -1.25 }}>
      <Tooltip title="Có áp dụng Date Range" arrow slotProps={tooltipSlotProps}>
        <IconButton
          size="small"
          sx={{
            color: 'success.main',
            p: 0.25,
            mr: 0.25,
            cursor: 'default',
            '&:hover': { bgcolor: 'transparent' }
          }}
        >
          <CalendarOutlined style={{ fontSize: '16px' }} />
        </IconButton>
      </Tooltip>
      <Tooltip title="Hỏi Chatbot về biểu đồ này" arrow slotProps={tooltipSlotProps}>
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            if (chartData) {
              window.dispatchEvent(new CustomEvent('chatbot:context', {
                detail: {
                  context: {
                    page: chartName,
                    chartData: chartData
                  }
                }
              }));
            }
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
            handleOpenRemarks(chartName, chartName);
          }}
          sx={{
            color: 'secondary.main',
            p: 0.25,
            '&:hover': { bgcolor: isDarkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)' }
          }}
        >
          <FileTextOutlined style={{ fontSize: '16px' }} />
        </IconButton>
      </Tooltip>
    </Box>
  );

  // Live Backend API Hooks and State
  const { fetchBehaviorAnalysis, loading: apiLoading, error: apiError } = useBehaviorAnalysis();
  const [apiData, setApiData] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [useFallback, setUseFallback] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState(() => getStoredDashboardTable('all_backtests'));
  const [dateRange, setDateRange] = useState(() => getStoredDashboardDateRange());
  const selectedTableLabel = selectedTable === 'all_backtests' ? 'All Backtests' : selectedTable;
  const dateRangeLabel = dateRange.startDate && dateRange.endDate ? `${dateRange.startDate} → ${dateRange.endDate}` : 'Full period';

  const [remarksOpen, setRemarksOpen] = useState(false);
  const [remarksTitle, setRemarksTitle] = useState('');
  const [remarksId, setRemarksId] = useState('');
  const [remarksType, setRemarksType] = useState('chart');

  const handleOpenRemarks = (title, id, type = 'chart') => {
    setRemarksTitle(title);
    setRemarksId(id);
    setRemarksType(type);
    setRemarksOpen(true);
  };



  useEffect(() => {
    const handleFiltersUpdated = () => {
      setSelectedTable(getStoredDashboardTable('all_backtests'));
      setDateRange(getStoredDashboardDateRange());
      setRefreshKey((key) => key + 1);
    };
    window.addEventListener('dashboard:filters-updated', handleFiltersUpdated);
    return () => window.removeEventListener('dashboard:filters-updated', handleFiltersUpdated);
  }, []);

  const [currentTab, setCurrentTab] = useState('directional');

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const handleDataChanged = () => setRefreshKey((k) => k + 1);
    window.addEventListener('dashboard:data-changed', handleDataChanged);
    return () => window.removeEventListener('dashboard:data-changed', handleDataChanged);
  }, []);

  const [activityData, setActivityData] = useState(null);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState(null);

  const [holdingData, setHoldingData] = useState(null);
  const [holdingLoading, setHoldingLoading] = useState(true);
  const [holdingError, setHoldingError] = useState(null);

  const [exitData, setExitData] = useState(null);
  const [exitLoading, setExitLoading] = useState(true);
  const [exitError, setExitError] = useState(null);

  useEffect(() => {
    let active = true;
    const selectedSources = getStoredDashboardSources([]);
    if (!selectedSources || selectedSources.length === 0) {
      setApiData(null);
      setActivityData(null);
      setHoldingData(null);
      setExitData(null);
      setUseFallback(false);
      setLoading(false);
      setActivityLoading(false);
      setHoldingLoading(false);
      setExitLoading(false);
      setActivityError(null);
      setHoldingError(null);
      setExitError(null);
      return;
    }
    const params = { sourceNames: selectedSources };
    if (dateRange.startDate && dateRange.endDate) {
      params.startDate = dateRange.startDate;
      params.endDate = dateRange.endDate;
    }

    // 1. Core Data (Directional Bias + Mismatch)
    const loadCore = async () => {
      try {
        setLoading(true);
        const res = await getBehaviorAnalysisCore(params);
        if (active) {
          if (res?.success) {
            setApiData(res.data);
            setUseFallback(false);
          } else {
            setUseFallback(true);
          }
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to load behavior analysis core data:', err);
        if (active) {
          setUseFallback(true);
          setLoading(false);
        }
      }
    };

    // 2. Activity Data
    const loadActivity = async () => {
      try {
        setActivityLoading(true);
        setActivityError(null);
        const res = await getBehaviorAnalysisActivity(params);
        if (active) {
          if (res?.success) setActivityData(res.data);
          setActivityLoading(false);
        }
      } catch (err) {
        console.error('Failed to load behavior activity data:', err);
        if (active) {
          setActivityError(err);
          setActivityLoading(false);
        }
      }
    };

    // 3. Holding Recovery Data
    const loadHolding = async () => {
      try {
        setHoldingLoading(true);
        setHoldingError(null);
        const res = await getBehaviorAnalysisHoldingRecovery(params);
        if (active) {
          if (res?.success) setHoldingData(res.data);
          setHoldingLoading(false);
        }
      } catch (err) {
        console.error('Failed to load behavior holding recovery data:', err);
        if (active) {
          setHoldingError(err);
          setHoldingLoading(false);
        }
      }
    };

    // 4. Exit Behavior Data
    const loadExit = async () => {
      try {
        setExitLoading(true);
        setExitError(null);
        const res = await getBehaviorAnalysisExit(params);
        if (active) {
          if (res?.success) setExitData(res.data);
          setExitLoading(false);
        }
      } catch (err) {
        console.error('Failed to load behavior exit data:', err);
        if (active) {
          setExitError(err);
          setExitLoading(false);
        }
      }
    };

    loadCore();
    loadActivity();
    loadHolding();
    loadExit();

    return () => {
      active = false;
    };
  }, [selectedTable, dateRange, refreshKey]);



  // Shadowed Reactive Constants
  const DIRECTIONAL_BIAS_DATA = useMemo(() => apiData?.directionalBiasData || (useFallback ? MOCK_DIRECTIONAL_BIAS_DATA : []), [apiData, useFallback]);
  const BUY_SELL_BREAKDOWN = useMemo(() => apiData?.buySellBreakdown || (useFallback ? MOCK_BUY_SELL_BREAKDOWN : []), [apiData, useFallback]);
  const TIMEFRAME_MISMATCH_DATA = useMemo(() => apiData?.timeframeMismatchData || (useFallback ? MOCK_TIMEFRAME_MISMATCH_DATA : []), [apiData, useFallback]);
  const ACTIVITY_GAP_DATA = useMemo(() => activityData?.activityGapData || apiData?.activityGapData || (useFallback ? MOCK_ACTIVITY_GAP_DATA : []), [activityData, apiData, useFallback]);
  const EXIT_REASONS_DATA = useMemo(() => exitData?.exitReasonsData || apiData?.exitReasonsData || (useFallback ? MOCK_EXIT_REASONS_DATA : []), [exitData, apiData, useFallback]);
  const COMMISSION_PER_LOT_DATA = useMemo(() => {
    const raw = exitData?.commissionPerLotData || apiData?.commissionPerLotData || (useFallback ? MOCK_COMMISSION_PER_LOT_DATA : []);
    // Sort ascending so highest avgFeePerLot renders at the bottom of the vertical chart
    return [...raw].sort((a, b) => (a.avgFeePerLot ?? 0) - (b.avgFeePerLot ?? 0));
  }, [exitData, apiData, useFallback]);

  const [helpOpen, setHelpOpen] = useState(false);
  const [helpTitle, setHelpTitle] = useState('');
  const [helpSub, setHelpSub] = useState('');
  const [helpContent, setHelpContent] = useState('');

  const triggerHelp = useCallback((key) => {
    const d = BEHAVIOR_EXPLAINERS[key];
    if (d) {
      setHelpTitle(`${d.title} (${d.engTitle})`);
      setHelpSub(d.formula);
      setHelpContent(d.desc);
      setHelpOpen(true);
    }
  }, []);

  const holdingStrategies = useMemo(() => {
    return holdingData?.holdingRecoveryData || apiData?.holdingRecoveryData || (useFallback ? MOCK_HOLDING_RECOVERY_STRATEGIES : []);
  }, [holdingData, apiData, useFallback]);

  const tabKpis = useMemo(() => {
    if (apiData?.summary) {
      return {
        flaggedBias: apiData.summary.flaggedBias,
        mismatch: apiData.summary.mismatch,
        criticalActivity: apiData.summary.criticalActivity,
        highEot: apiData.summary.highEot,
        totalStrategies: apiData.summary.totalStrategies
      };
    }
    const flaggedBias = DIRECTIONAL_BIAS_DATA.filter((r) => r.weakPct < 20).length;
    const mismatch = TIMEFRAME_MISMATCH_DATA.filter((r) => r.h4Count > r.h1Count).length;
    const criticalActivity = ACTIVITY_GAP_DATA.filter((r) => r.maxGap >= 40 || r.zeroMonths >= 6).length;
    const highEot = EXIT_REASONS_DATA.filter((r) => r.eot > 10).length;
    return { flaggedBias, mismatch, criticalActivity, highEot, totalStrategies: useFallback ? 247 : 0 };
  }, [apiData, useFallback, DIRECTIONAL_BIAS_DATA, TIMEFRAME_MISMATCH_DATA, ACTIVITY_GAP_DATA, EXIT_REASONS_DATA]);



  const hasSelectedDataSources = getStoredDashboardSources([]).length > 0;

  if (!hasSelectedDataSources) {
    return (
      <Box sx={{ width: '100%', py: 1 }}>
        <DashboardFilterBar
          title="Behavior Analysis"
          subtitle="— Trading Style & Consistency Diagnostics"
        />
        <Box
          sx={{
            minHeight: 360,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            px: 3,
            textAlign: 'center',
            border: '1px dashed',
            borderColor: 'divider',
            bgcolor: 'background.paper'
          }}
        >
          <InfoCircleOutlined style={{ fontSize: 40, color: theme.palette.primary.main }} />
          <Typography variant="h4" sx={{ mt: 2, mb: 1 }}>
            Chưa chọn Data Source
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 560 }}>
            Vui lòng chọn ít nhất một Data Source để hiển thị dữ liệu Behavior Analysis.
          </Typography>
        </Box>
      </Box>
    );
  }

  if (!loading && apiData && apiData.summary?.totalStrategies === 0 && !useFallback) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 2 }}>
        <Typography variant="h6" color="text.secondary">Chưa có dữ liệu</Typography>
        <Typography variant="body2" color="text.disabled" sx={{ textAlign: 'center', px: 2 }}>
          Datasource đã chọn chưa có strategy có dữ liệu hợp lệ cho Behavior Analysis.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', maxWidth: '100%', py: 1, px: { xs: 0, sm: 0 } }}>
      <DashboardFilterBar title="Behavior Analysis" subtitle="— Trading Style & Consistency Diagnostics" />

      {useFallback && (
        <Alert severity="warning" sx={{ mb: 2.5, borderRadius: 2 }}>
          <strong>Cảnh báo:</strong> Đang hiển thị dữ liệu hành vi giả định (Mock Behavior Data) do không kết nối được API hoặc không có dữ liệu thực tế.
        </Alert>
      )}

      <Box
        sx={{
          position: { xs: 'static', sm: 'sticky' },
          top: { xs: 'auto', sm: '180px', md: '136px' },
          zIndex: 1090,
          bgcolor: isDarkMode ? 'rgba(17, 24, 39, 0.95)' : 'rgba(250, 250, 251, 0.95)',
          backdropFilter: 'blur(8px)',
          mx: { xs: -2, sm: -5 },
          px: { xs: 2, sm: 5 },
          pt: 1.5,
          pb: 1.5,
          mb: 2.5,
          borderBottom: '1px solid',
          borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
          transform: 'translate3d(0, 0, 0)'
        }}
      >
        <Box
          sx={(theme) => ({
            display: 'inline-flex',
            flexWrap: 'wrap',
            gap: 0,
            bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#f1f5f9',
            p: 0.5,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            width: { xs: '100%', sm: 'fit-content' }
          })}
        >
          {TAB_CONFIG.map((tab) => (
            <Button
              key={tab.id}
              onClick={() => setCurrentTab(tab.id)}
              sx={(theme) => ({
                px: 1.5,
                py: 0.5,
                fontWeight: 600,
                fontSize: '0.75rem',
                color: currentTab === tab.id ? '#ffffff' : theme.palette.text.primary,
                bgcolor: currentTab === tab.id ? 'var(--tab-active-bg, #212A37)' : 'transparent',
                borderRadius: 1.5,
                textTransform: 'none',
                boxShadow: currentTab === tab.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s',
                flexGrow: { xs: 1, sm: 0 },
                '&:hover': {
                  bgcolor: currentTab === tab.id
                    ? 'var(--tab-active-hover-bg, #1F3864)'
                    : theme.palette.mode === 'light'
                      ? 'rgba(31, 56, 100, 0.10)'
                      : 'var(--tab-inactive-hover-bg, rgba(0,0,0,0.06))',
                  color: currentTab === tab.id
                    ? '#ffffff'
                    : theme.palette.mode === 'light'
                      ? '#1F3864'
                      : '#e2e8f0'
                }
              })}
            >
              {tab.label}
            </Button>
          ))}
        </Box>
      </Box>

      {/* ========== TAB: DIRECTIONAL ========== */}
      {currentTab === 'directional' && (
        <DirectionalTab
          directionalBiasData={DIRECTIONAL_BIAS_DATA}
          buySellBreakdown={BUY_SELL_BREAKDOWN}
          timeframeMismatchData={TIMEFRAME_MISMATCH_DATA}
          tabKpis={tabKpis}
          coreLoading={loading}
          selectedTable={selectedTable}
          dateRange={dateRange}
          isDarkMode={isDarkMode}
          chartTextColor={chartTextColor}
          tablePaperSx={tablePaperSx}
          stickyTableSx={stickyTableSx}
          handleOpenRemarks={handleOpenRemarks}
          renderHeaderActions={renderHeaderActions}
          triggerHelp={triggerHelp}
        />
      )}

      {/* ========== TAB: ACTIVITY ========== */}
      {currentTab === 'activity' && (
        <ActivityTab
          commissionPerLotData={COMMISSION_PER_LOT_DATA}
          activityGapData={ACTIVITY_GAP_DATA}
          hourlyDistribution={activityData?.hourlyDistribution || []}
          dayOfWeekDistribution={activityData?.dayOfWeekDistribution || []}
          monthlyDistribution={activityData?.monthlyDistribution || []}
          activityLoading={activityLoading}
          activityError={activityError}
          tablePaperSx={tablePaperSx}
          renderHeaderActions={renderHeaderActions}
          triggerHelp={triggerHelp}
        />
      )}

      {/* ========== TAB: EXIT ========== */}
      {currentTab === 'exit' && (
        <ExitBehaviorTab
          exitReasonsData={EXIT_REASONS_DATA}
          exitLoading={exitLoading}
          exitError={exitError}
          tablePaperSx={tablePaperSx}
          renderHeaderActions={renderHeaderActions}
          triggerHelp={triggerHelp}
        />
      )}

      {/* ========== TAB: HOLDING & RECOVERY ========== */}
      {currentTab === 'holding' && (
        <HoldingRecoveryTab
          holdingStrategies={holdingStrategies}
          htrData={holdingData?.htrData || []}
          veiData={holdingData?.veiData || []}
          holdingLoading={holdingLoading}
          holdingError={holdingError}
          useFallback={useFallback}
          tablePaperSx={tablePaperSx}
          stickyTableSx={stickyTableSx}
          renderHeaderActions={renderHeaderActions}
          triggerHelp={triggerHelp}
        />
      )}

      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} PaperProps={{ sx: { borderRadius: 3, p: 3, maxWidth: 550, width: '100%', bgcolor: isDarkMode ? 'background.paper' : '#FFFFFF', border: '1px solid', borderColor: isDarkMode ? 'divider' : '#BDD7EE' } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <InfoCircleOutlined style={{ fontSize: 22, color: '#2E75B6' }} />
          <Typography variant="h5" fontWeight={700} sx={{ color: isDarkMode ? 'text.primary' : 'var(--chart-title-color, #1F3864)' }}>{helpTitle}</Typography>
        </Box>
        {helpSub && (
          <Typography variant="caption" sx={{ display: 'block', mb: 2.5, px: 2, py: 0.75, fontWeight: 700, color: isDarkMode ? '#90caf9' : 'var(--chart-title-color, #1F3864)', bgcolor: isDarkMode ? 'rgba(46, 117, 182, 0.2)' : '#BDD7EE', borderRadius: 1.5, width: 'fit-content' }}>
            {helpSub}
          </Typography>
        )}
        
        {(() => {
          if (helpTitle.includes('Lệch chiều giao dịch') || helpTitle.includes('Directional Bias')) {
            return (
              <Box sx={{ mt: 1 }}>
                <Stack spacing={2} sx={{ mb: 3 }}>
                  <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: isDarkMode ? 'rgba(33, 150, 243, 0.08)' : '#F0F8FF', border: '1px solid', borderColor: isDarkMode ? 'rgba(33, 150, 243, 0.25)' : '#BDD7EE' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: isDarkMode ? '#90caf9' : '#1F3864', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                      🎯 Ý NGHĨA BIỂU ĐỒ & CHỈ SỐ
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6, fontWeight: 500 }}>
                      Đo lường mức độ mất cân bằng giữa chiều **Buy (Mua)** và **Sell (Bán)** của một Robot. Nếu một Robot chỉ sinh lời ở một chiều và thua lỗ ở chiều ngược lại, chiến lược đó có nguy cơ sụt giảm tài khoản nghiêm trọng khi thị trường đảo xu hướng dài hạn.
                    </Typography>
                  </Box>

                  <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: isDarkMode ? 'rgba(255,255,255,0.02)' : '#F8FAFC', border: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'text.primary', mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                      🚦 PHÂN LOẠI MỨC ĐỘ & STATUS
                    </Typography>
                    <Stack spacing={1.5}>
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1, borderRadius: 1.5, bgcolor: isDarkMode ? 'rgba(76, 175, 80, 0.08)' : '#F1F9EC' }}>
                        <Chip label="Balanced" size="small" sx={{ mt: 0.25, fontWeight: 800, color: isDarkMode ? '#81c784' : '#2E7D32', bgcolor: isDarkMode ? 'rgba(76, 175, 80, 0.15)' : 'rgba(46, 125, 50, 0.15)', border: '1px solid', borderColor: isDarkMode ? 'rgba(76, 175, 80, 0.3)' : 'rgba(46, 125, 50, 0.3)' }} />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>Cân bằng (An toàn)</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>Cả hai chiều hoạt động đồng đều, tỷ lệ đóng góp của chiều yếu <strong>&ge; 20%</strong> tổng lợi nhuận.</Typography>
                        </Box>
                      </Box>

                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1, borderRadius: 1.5, bgcolor: isDarkMode ? 'rgba(238, 168, 0, 0.08)' : '#FFF7E6' }}>
                        <Chip label="DirectionalBias" size="small" sx={{ mt: 0.25, fontWeight: 800, color: isDarkMode ? '#facc15' : '#D48800', bgcolor: isDarkMode ? 'rgba(238, 168, 0, 0.15)' : 'rgba(212, 136, 0, 0.15)', border: '1px solid', borderColor: isDarkMode ? 'rgba(238, 168, 0, 0.3)' : 'rgba(212, 136, 0, 0.3)' }} />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>Lệch một chiều (Cảnh báo)</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>Cả hai chiều có lãi nhưng chiều yếu đóng góp <strong>&lt; 20%</strong> tổng lợi nhuận. Cần theo dõi thêm.</Typography>
                        </Box>
                      </Box>

                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1, borderRadius: 1.5, bgcolor: isDarkMode ? 'rgba(244, 67, 54, 0.08)' : '#FFEBEB' }}>
                        <Chip label="One-Way Edge" size="small" sx={{ mt: 0.25, fontWeight: 800, color: isDarkMode ? '#f87171' : '#D32F2F', bgcolor: isDarkMode ? 'rgba(244, 67, 54, 0.15)' : 'rgba(211, 47, 47, 0.15)', border: '1px solid', borderColor: isDarkMode ? 'rgba(244, 67, 54, 0.3)' : 'rgba(211, 47, 47, 0.3)' }} />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>Lệch cực đoan (Rủi ro cao)</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>Chỉ một chiều duy nhất mang lại lợi nhuận, chiều còn lại bị lỗ âm (Ví dụ: Buy lãi nhưng Sell lỗ).</Typography>
                        </Box>
                      </Box>
                    </Stack>
                  </Box>

                  <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: isDarkMode ? 'rgba(244, 67, 54, 0.05)' : '#FFF5F5', border: '1px solid', borderColor: isDarkMode ? 'rgba(244, 67, 54, 0.2)' : '#FFE0E0' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: isDarkMode ? '#f87171' : '#D32F2F', mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      ⚠️ HÀNH ĐỘNG KHUYẾN NGHỊ
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6, fontWeight: 500 }}>
                      Hạn chế đưa các strategy có Flag **One-Way Edge** vào danh mục đầu tư chính thức. Nếu bắt buộc phải sử dụng, cần giảm 50% quy mô vốn (position sizing) hoặc chỉ kích hoạt trong các giai đoạn thị trường có xu hướng mạnh mẽ (trending market).
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            );
          } else if (helpTitle.includes('Hiệu suất Mua/Bán theo Cặp') || helpTitle.includes('Buy vs Sell') || helpTitle.includes('HIỆU SUẤT THEO CHIỀU MUA/BÁN') || helpTitle.includes('HIỆU SUẤT TỔNG HỢP THEO CẶP TÀI SẢN')) {
            return (
              <Box sx={{ mt: 1 }}>
                <Stack spacing={2} sx={{ mb: 3 }}>
                  <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: isDarkMode ? 'rgba(33, 150, 243, 0.08)' : '#F0F8FF', border: '1px solid', borderColor: isDarkMode ? 'rgba(33, 150, 243, 0.25)' : '#BDD7EE' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: isDarkMode ? '#90caf9' : '#1F3864', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                      🎯 Ý NGHĨA BIỂU ĐỒ & BẢNG SỐ LIỆU
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6, fontWeight: 500 }}>
                      Phân tích và đối sánh chi tiết hiệu quả giao dịch của từng cặp sản phẩm (Symbol) theo từng chiều **Buy** và **Sell**. Biểu đồ so sánh trực quan các yếu tố:
                      <br />• **Số lượng lệnh (Deal Count):** Đánh giá tần suất vào lệnh của thuật toán.
                      <br />• **Tỷ lệ thắng (Winrate):** Đánh giá xác suất thắng của từng chiều.
                      <br />• **Lợi nhận trung bình (Avg Profit/Deal):** Đánh giá kỳ vọng toán học (Payoff) của từng giao dịch.
                    </Typography>
                  </Box>

                  <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: isDarkMode ? 'rgba(255,255,255,0.02)' : '#F8FAFC', border: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: isDarkMode ? '#81c784' : '#2E7D32', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                      💡 TIÊU CHUẨN ĐÁNH GIÁ (MARKET NEUTRAL)
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6, fontWeight: 500 }}>
                      Một Robot lý tưởng nên có các thông số **Winrate** và **Lợi nhuận trung bình** giữa chiều Buy và Sell tiệm cận nhau. Điều này chứng minh Robot hoạt động có tính chất trung lập với xu hướng chung của thị trường, hoạt động ổn định trong cả hai môi trường tăng giá và giảm giá.
                    </Typography>
                  </Box>

                  <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: isDarkMode ? 'rgba(238, 168, 0, 0.05)' : '#FFFBE6', border: '1px solid', borderColor: isDarkMode ? 'rgba(238, 168, 0, 0.25)' : '#FFE58F' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: isDarkMode ? '#ffe082' : '#D48800', mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      ⚠️ LƯU Ý KHI LỆCH HIỆU SUẤT
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6, fontWeight: 500 }}>
                      Nếu Winrate của một chiều vượt trội (&gt; 65%) nhưng chiều kia quá thấp (&lt; 35%), hoặc lợi nhuận trung bình lệch nhau trên 3 lần, EA có thể đang bị tối ưu hóa quá mức (Overfitting) theo một hướng thị trường trong quá khứ.
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            );
          } else if (helpTitle.includes('Lệch khung thời gian') || helpTitle.includes('Timeframe Mismatch') || helpTitle.includes('ĐỐI SÁNH KHUNG THỜI GIAN')) {
            return (
              <Box sx={{ mt: 1 }}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2.5 }}>
                  <Chip 
                    label="Công thức: Số deal lệch khung / Số deal chuẩn khung" 
                    size="small" 
                    sx={{ 
                      fontWeight: 700, 
                      bgcolor: isDarkMode ? 'rgba(238, 168, 0, 0.15)' : '#FFF7E6', 
                      color: isDarkMode ? '#facc15' : '#D48800', 
                      border: '1px solid',
                      borderColor: isDarkMode ? 'rgba(238, 168, 0, 0.3)' : '#FFE7BA',
                      borderRadius: 1
                    }} 
                  />
                  <Chip 
                    label="Chỉ quét các deal có comment _H1_ hoặc _H4_" 
                    size="small" 
                    sx={{ 
                      fontWeight: 700, 
                      bgcolor: isDarkMode ? 'rgba(46, 125, 50, 0.15)' : '#F6FFED', 
                      color: isDarkMode ? '#81c784' : '#389E0D', 
                      border: '1px solid',
                      borderColor: isDarkMode ? 'rgba(46, 125, 50, 0.3)' : '#D9F7BE',
                      borderRadius: 1
                    }} 
                  />
                </Box>

                <Stack spacing={2} sx={{ mb: 3 }}>
                  <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: isDarkMode ? 'rgba(33, 150, 243, 0.08)' : '#F0F8FF', border: '1px solid', borderColor: isDarkMode ? 'rgba(33, 150, 243, 0.25)' : '#BDD7EE' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: isDarkMode ? '#90caf9' : '#1F3864', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                      🎯 NGUYÊN TẮC QUÉT & PHÁT HIỆN
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6, fontWeight: 500 }}>
                      Mỗi chiến lược (strategy) được thiết kế chạy trên một khung thời gian cố định. Hệ thống tự động phân tích cột **Comment** của từng lệnh giao dịch để đối chiếu. Ví dụ: Chiến lược H1 thì comment của deal phải chứa **_H1_**, nếu chứa **_H4_** thì được tính là lệch khung thời gian.
                    </Typography>
                  </Box>

                  <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: isDarkMode ? 'rgba(255,255,255,0.02)' : '#F8FAFC', border: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'text.primary', mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                      🚦 PHÂN LOẠI MỨC ĐỘ & STATUS
                    </Typography>
                    <Stack spacing={1.25}>
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1, borderRadius: 1.5, bgcolor: isDarkMode ? 'rgba(76, 175, 80, 0.08)' : '#F1F9EC' }}>
                        <Chip label="Normal" size="small" sx={{ mt: 0.25, fontWeight: 800, color: isDarkMode ? '#81c784' : '#2E7D32', bgcolor: isDarkMode ? 'rgba(76, 175, 80, 0.15)' : 'rgba(46, 125, 50, 0.15)', border: '1px solid', borderColor: isDarkMode ? 'rgba(76, 175, 80, 0.3)' : 'rgba(46, 125, 50, 0.3)' }} />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>Hoàn toàn chuẩn khung (0x)</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>Không phát hiện bất kỳ deal nào chạy sai lệch khung thời gian của chiến lược.</Typography>
                        </Box>
                      </Box>

                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1, borderRadius: 1.5, bgcolor: isDarkMode ? 'rgba(37, 99, 235, 0.08)' : '#E6F0FA' }}>
                        <Chip label="Moderate" size="small" sx={{ mt: 0.25, fontWeight: 800, color: isDarkMode ? '#60a5fa' : '#2563eb', bgcolor: isDarkMode ? 'rgba(37, 99, 235, 0.15)' : '#E6F0FA', border: '1px solid', borderColor: isDarkMode ? 'rgba(37, 99, 235, 0.3)' : '#ADCBEA' }} />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>Lệch nhẹ (&lt; 1.5x)</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>Tần suất lệch nhỏ, có thể do một vài lệnh khớp chậm hoặc đóng/mở thủ công.</Typography>
                        </Box>
                      </Box>

                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1, borderRadius: 1.5, bgcolor: isDarkMode ? 'rgba(238, 168, 0, 0.08)' : '#FFF7E6' }}>
                        <Chip label="TimeframeMismatch" size="small" sx={{ mt: 0.25, fontWeight: 800, color: isDarkMode ? '#facc15' : '#D48800', bgcolor: isDarkMode ? 'rgba(238, 168, 0, 0.15)' : '#FFF7E6', border: '1px solid', borderColor: isDarkMode ? 'rgba(238, 168, 0, 0.3)' : '#FFE7BA' }} />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>Lệch vừa (1.5x đến 3.0x)</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>Số lượng lệnh sai khung gấp 1.5 đến 3 lần số lượng chuẩn. Cần kiểm tra VPS.</Typography>
                        </Box>
                      </Box>

                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1, borderRadius: 1.5, bgcolor: isDarkMode ? 'rgba(244, 67, 54, 0.08)' : '#FFEBEB' }}>
                        <Chip label="Severe" size="small" sx={{ mt: 0.25, fontWeight: 800, color: isDarkMode ? '#f87171' : '#D32F2F', bgcolor: isDarkMode ? 'rgba(244, 67, 54, 0.15)' : '#FFEBEB', border: '1px solid', borderColor: isDarkMode ? 'rgba(244, 67, 54, 0.3)' : '#FFC7C7' }} />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>Lệch nghiêm trọng (&ge; 3.0x)</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>Số lượng deal sai lệch gấp từ 3 lần trở lên so với số deal chuẩn. Khả năng cao treo nhầm chart VPS.</Typography>
                        </Box>
                      </Box>
                    </Stack>
                  </Box>

                  <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: isDarkMode ? 'rgba(244, 67, 54, 0.05)' : '#FFF5F5', border: '1px solid', borderColor: isDarkMode ? 'rgba(244, 67, 54, 0.2)' : '#FFE0E0' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: isDarkMode ? '#e57373' : '#D32F2F', mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      ⚠️ RỦI RO & KHUYẾN NGHỊ
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6, fontWeight: 500 }}>
                      Việc chạy sai khung thời gian (ví dụ: treo EA H1 vào chart H4) làm sai lệch hoàn toàn logic tính toán chỉ báo (Indicator), dẫn đến robot vào lệnh sai thời điểm hoặc gồng lệnh không đúng kỹ thuật. Hãy rà soát lại cấu hình VPS Terminal ngay lập tức nếu trạng thái là **TimeframeMismatch** hoặc **Severe**.
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            );
          } else if (helpTitle.includes('Bản đồ nhiệt') || helpTitle.includes('Temporal Heatmap') || helpTitle.includes('BẢN ĐỒ NHIỆT')) {
            return (
              <Box sx={{ mt: 1 }}>
                <Stack spacing={2} sx={{ mb: 3 }}>
                  <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: isDarkMode ? 'rgba(33, 150, 243, 0.08)' : '#F0F8FF', border: '1px solid', borderColor: isDarkMode ? 'rgba(33, 150, 243, 0.25)' : '#BDD7EE' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: isDarkMode ? '#90caf9' : '#1F3864', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                      🎯 Ý NGHĨA BIỂU ĐỒ NHIỆT (TEMPORAL HEATMAP)
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6, fontWeight: 500 }}>
                      Phân tích hiệu suất giao dịch (Lợi nhuận và Winrate) theo 3 chiều thời gian: **Giờ trong ngày (Hour)**, **Thứ trong tuần (Day)** và **Tháng trong năm (Month)**. Giúp định vị chính xác "khoảng thời gian vàng" và các "vùng nguy hiểm" của hệ thống giao dịch.
                    </Typography>
                  </Box>

                  <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: isDarkMode ? 'rgba(255,255,255,0.02)' : '#F8FAFC', border: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: isDarkMode ? '#ffb74d' : '#E67E22', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                      💡 QUY TẮC PHỐI MÀU CẢNH BÁO
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6, fontWeight: 500 }}>
                      • **Màu Xanh lá (Green):** Thể hiện lợi nhuận dương / Winrate cao. Màu càng đậm biểu thị hiệu quả càng vượt trội.
                      <br />• **Màu Đỏ (Red):** Thể hiện thua lỗ / Winrate thấp. Màu càng đậm cảnh báo vùng rủi ro tổn thất lớn.
                    </Typography>
                  </Box>

                  <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: isDarkMode ? 'rgba(76, 175, 80, 0.05)' : '#F6FFED', border: '1px solid', borderColor: isDarkMode ? 'rgba(76, 175, 80, 0.25)' : '#B7EB8F' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: isDarkMode ? '#81c784' : '#389E0D', mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      🛠️ KHUYẾN NGHỊ VẬN HÀNH LIVE
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6, fontWeight: 500 }}>
                      1. Cân nhắc cấu hình tắt EA vào các khoảng thời gian có màu đỏ đậm trong lịch sử (ví dụ: Cuối ngày Thứ 6 khi spread giãn rộng, hoặc các tháng chuyển giao chính sách kinh tế).
                      <br />2. Tận dụng các giờ có màu xanh đậm để gia tăng quy mô giao dịch một cách an toàn.
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            );
          } else if (helpTitle.includes('Tính ổn định hàng năm') || helpTitle.includes('Annual Stability') || helpTitle.includes('TÍNH ỔN ĐỊNH HÀNG NĂM')) {
            return (
              <Box sx={{ mt: 1 }}>
                <Stack spacing={2} sx={{ mb: 3 }}>
                  <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: isDarkMode ? 'rgba(33, 150, 243, 0.08)' : '#F0F8FF', border: '1px solid', borderColor: isDarkMode ? 'rgba(33, 150, 243, 0.25)' : '#BDD7EE' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: isDarkMode ? '#90caf9' : '#1F3864', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                      🎯 Ý NGHĨA CHỈ SỐ
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6, fontWeight: 500 }}>
                      Đo lường tính bền bỉ của chiến lược qua nhiều chu kỳ thị trường hàng năm (từ 2019 đến nay). Điều này giúp lọc bỏ các Robot "ăn may" (chỉ kiếm được nhiều tiền ở một năm xu hướng mạnh nhưng các năm sau đó thua lỗ kéo dài).
                    </Typography>
                  </Box>

                  <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: isDarkMode ? 'rgba(255,255,255,0.02)' : '#F8FAFC', border: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'text.primary', mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                      🚦 PHÂN LOẠI MỨC ĐỘ & STATUS
                    </Typography>
                    <Stack spacing={1.5}>
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1, borderRadius: 1.5, bgcolor: isDarkMode ? 'rgba(76, 175, 80, 0.08)' : '#F1F9EC' }}>
                        <Chip label="Stable" size="small" sx={{ mt: 0.25, fontWeight: 800, color: isDarkMode ? '#81c784' : '#2E7D32', bgcolor: isDarkMode ? 'rgba(76, 175, 80, 0.15)' : 'rgba(46, 125, 50, 0.15)', border: '1px solid', borderColor: isDarkMode ? 'rgba(76, 175, 80, 0.3)' : 'rgba(46, 125, 50, 0.3)' }} />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>Ổn định bền vững (Stable)</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>Chiến lược có lợi nhuận dương ròng trong <strong>&ge; 5 năm</strong>. Có khả năng thích nghi cao với sự thay đổi của cấu trúc thị trường.</Typography>
                        </Box>
                      </Box>

                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1, borderRadius: 1.5, bgcolor: isDarkMode ? 'rgba(244, 67, 54, 0.08)' : '#FFEBEB' }}>
                        <Chip label="Volatile" size="small" sx={{ mt: 0.25, fontWeight: 800, color: isDarkMode ? '#f87171' : '#D32F2F', bgcolor: isDarkMode ? 'rgba(244, 67, 54, 0.15)' : 'rgba(211, 47, 47, 0.15)', border: '1px solid', borderColor: isDarkMode ? 'rgba(244, 67, 54, 0.3)' : 'rgba(211, 47, 47, 0.3)' }} />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>Biến động / Rủi ro (Volatile)</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>Lợi nhuận dương dưới 5 năm. Chiến lược có kết quả trồi sụt thất thường, tiềm ẩn nguy cơ lỗi thời (decay).</Typography>
                        </Box>
                      </Box>
                    </Stack>
                  </Box>
                </Stack>
              </Box>
            );
          } else if (helpTitle.includes('Tính mùa vụ theo quý') || helpTitle.includes('Quarterly Seasonality')) {
            return (
              <Box sx={{ mt: 1 }}>
                <Stack spacing={2} sx={{ mb: 3 }}>
                  <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: isDarkMode ? 'rgba(33, 150, 243, 0.08)' : '#F0F8FF', border: '1px solid', borderColor: isDarkMode ? 'rgba(33, 150, 243, 0.25)' : '#BDD7EE' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: isDarkMode ? '#90caf9' : '#1F3864', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                      🎯 Ý NGHĨA BIỂU ĐỒ & BẢNG SỐ LIỆU
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6, fontWeight: 500 }}>
                      Phân tích hiệu suất theo từng quý trong năm (Q1: T1-T3, Q2: T4-T6, Q3: T7-T9, Q4: T10-T12). Thống kê tổng quan hoặc lọc chi tiết theo từng năm nhằm xác định chu kỳ mùa vụ, giúp người vận hành biết được Robot thường giao dịch hiệu quả nhất và kém nhất vào quý nào.
                    </Typography>
                  </Box>

                  <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: isDarkMode ? 'rgba(255,255,255,0.02)' : '#F8FAFC', border: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: isDarkMode ? '#81c784' : '#2E7D32', mb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                      💡 ỨNG DỤNG THỰC TẾ
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6, fontWeight: 500 }}>
                      Nhiều Robot có xu hướng hoạt động kém vào Q4 do thị trường thường biến động bất thường, thanh khoản mỏng dịp cuối năm. Sử dụng bảng này để tạm thời dừng hoặc giảm quy mô vốn của Robot trong các quý nhạy cảm.
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            );
          } else if (helpTitle.includes('Khoảng lặng giao dịch') || helpTitle.includes('Inactivity & Dormancy') || helpTitle.includes('Inactivity') || helpTitle.includes('KHOẢNG LẶNG GIAO DỊCH')) {
            return (
              <Box sx={{ mt: 1 }}>
                <Stack spacing={2} sx={{ mb: 3 }}>
                  <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: isDarkMode ? 'rgba(33, 150, 243, 0.08)' : '#F0F8FF', border: '1px solid', borderColor: isDarkMode ? 'rgba(33, 150, 243, 0.25)' : '#BDD7EE' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: isDarkMode ? '#90caf9' : '#1F3864', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                      🎯 Ý NGHĨA BIỂU ĐỒ & BẢNG SỐ LIỆU
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6, fontWeight: 500 }}>
                      Đo lường khoảng thời gian không phát sinh giao dịch của Robot và số tháng hoàn toàn không có lệnh. Khoảng lặng quá lớn (Max Gap) hoặc có nhiều tháng liên tục không có lệnh (Dormancy) là dấu hiệu Robot bị đứng lệnh, kén tín hiệu thị trường, hoặc lỗi cấu hình dẫn đến tình trạng đọng vốn và bỏ lỡ cơ hội.
                    </Typography>
                  </Box>

                  <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: isDarkMode ? 'rgba(255,255,255,0.02)' : '#F8FAFC', border: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'text.primary', mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                      🚦 PHÂN LOẠI TRẠNG THÁI & STATUS
                    </Typography>
                    <Stack spacing={1.25}>
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1, borderRadius: 1.5, bgcolor: isDarkMode ? 'rgba(76, 175, 80, 0.08)' : '#F1F9EC' }}>
                        <Chip label="Stable" size="small" sx={{ mt: 0.25, fontWeight: 800, color: isDarkMode ? '#81c784' : '#2E7D32', bgcolor: isDarkMode ? 'rgba(76, 175, 80, 0.15)' : 'rgba(46, 125, 50, 0.15)', border: '1px solid', borderColor: isDarkMode ? 'rgba(76, 175, 80, 0.3)' : 'rgba(46, 125, 50, 0.3)' }} />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>Ổn định (Stable)</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>Khoảng lặng lớn nhất <strong>&lt; 15 ngày</strong> và <strong>0 tháng rỗng</strong>. Giao dịch rất đều đặn, vốn luân chuyển liên tục và tối ưu.</Typography>
                        </Box>
                      </Box>

                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1, borderRadius: 1.5, bgcolor: isDarkMode ? 'rgba(255, 183, 77, 0.08)' : '#FEF7E0' }}>
                        <Chip label="Volatile" size="small" sx={{ mt: 0.25, fontWeight: 800, color: isDarkMode ? '#ffb74d' : '#E5A800', bgcolor: isDarkMode ? 'rgba(255, 183, 77, 0.15)' : '#FEF7E0', border: '1px solid', borderColor: isDarkMode ? 'rgba(255, 183, 77, 0.3)' : '#FEF0C7' }} />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>Biến động khoảng lặng (Volatile)</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>Khoảng lặng lớn nhất từ <strong>15 đến dưới 25 ngày</strong>. Nhịp độ giao dịch trồi sụt theo từng đợt sóng ngắn.</Typography>
                        </Box>
                      </Box>

                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1, borderRadius: 1.5, bgcolor: isDarkMode ? 'rgba(33, 150, 243, 0.08)' : '#E8F1F5' }}>
                        <Chip label="Seasonal" size="small" sx={{ mt: 0.25, fontWeight: 800, color: isDarkMode ? '#64b5f6' : '#2E75B6', bgcolor: isDarkMode ? 'rgba(33, 150, 243, 0.15)' : '#E8F1F5', border: '1px solid', borderColor: isDarkMode ? 'rgba(33, 150, 243, 0.3)' : '#BDD7EE' }} />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>Theo mùa vụ (Seasonal)</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>Khoảng lặng lớn nhất từ <strong>25 đến dưới 40 ngày</strong> hoặc có <strong>1 – 5 tháng rỗng</strong>. Robot chỉ giao dịch theo mùa vụ / chu kỳ thị trường riêng biệt.</Typography>
                        </Box>
                      </Box>

                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1, borderRadius: 1.5, bgcolor: isDarkMode ? 'rgba(244, 67, 54, 0.08)' : '#FFEBEB' }}>
                        <Chip label="Critical" size="small" sx={{ mt: 0.25, fontWeight: 800, color: isDarkMode ? '#f87171' : '#D32F2F', bgcolor: isDarkMode ? 'rgba(244, 67, 54, 0.15)' : '#FFEBEB', border: '1px solid', borderColor: isDarkMode ? 'rgba(244, 67, 54, 0.3)' : '#FFC7C7' }} />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>Cực kỳ nghiêm trọng (Critical)</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>Khoảng lặng lớn nhất <strong>&ge; 40 ngày</strong>. Khoảng cách giữa các lệnh quá dài, tiềm ẩn nguy cơ EA ngừng bắt tín hiệu hoặc đứng lệnh trên VPS.</Typography>
                        </Box>
                      </Box>

                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1, borderRadius: 1.5, bgcolor: isDarkMode ? 'rgba(233, 30, 99, 0.08)' : '#FCE4EC' }}>
                        <Chip label="Dormant" size="small" sx={{ mt: 0.25, fontWeight: 800, color: isDarkMode ? '#f06292' : '#C2185B', bgcolor: isDarkMode ? 'rgba(233, 30, 99, 0.15)' : '#FCE4EC', border: '1px solid', borderColor: isDarkMode ? 'rgba(233, 30, 99, 0.3)' : '#F8BBD0' }} />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>Ngủ đông (Dormant)</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>Có <strong>&ge; 6 tháng</strong> hoàn toàn không có lệnh hoặc gap <strong>&ge; 60 ngày</strong>. Nguy cơ chiến lược đã bị lỗi thời (strategy decay) hoặc bị vô hiệu hóa hoàn toàn.</Typography>
                        </Box>
                      </Box>
                    </Stack>
                  </Box>

                  <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: isDarkMode ? 'rgba(255,255,255,0.02)' : '#F8FAFC', border: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'text.primary', mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                      🔍 HƯỚNG DẪN BỘ LỌC (FILTER GUIDE)
                    </Typography>
                    <Stack spacing={1.25}>
                      <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: isDarkMode ? 'rgba(244, 67, 54, 0.08)' : '#FFEBEB', border: '1px solid', borderColor: isDarkMode ? 'rgba(244, 67, 54, 0.2)' : '#FFD2D2' }}>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: isDarkMode ? '#f87171' : '#D32F2F', mb: 0.25 }}>
                          • Critical only (Lọc nguy hiểm tổng hợp):
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.5 }}>
                          Gom toàn bộ các chiến lược ở mức cảnh báo rủi ro cao nhất: Có <strong>Max Gap từ 40 ngày trở lên</strong>, <strong>HOẶC tổng số tháng 0 có lệnh từ 6 tháng trở lên (Dormant)</strong>, hoặc có Status là Critical/Dormant.
                        </Typography>
                      </Box>

                      <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: isDarkMode ? 'rgba(255, 183, 77, 0.08)' : '#FFFBE6', border: '1px solid', borderColor: isDarkMode ? 'rgba(255, 183, 77, 0.2)' : '#FFE58F' }}>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: isDarkMode ? '#ffb74d' : '#D48800', mb: 0.25 }}>
                          • Gap &ge; 40 ngày (Chỉ lọc theo độ trễ lệnh):
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.5 }}>
                          Chỉ lọc duy nhất các chiến lược có khoảng cách giữa 2 lần vào lệnh từ <strong>40 ngày trở lên</strong> (không quan tâm số tháng 0 có lệnh có đủ 6 tháng hay không).
                        </Typography>
                      </Box>

                      <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: isDarkMode ? 'rgba(33, 150, 243, 0.05)' : '#F0F8FF', border: '1px solid', borderColor: isDarkMode ? 'rgba(33, 150, 243, 0.2)' : '#D0E2FF' }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.5 }}>
                          • <strong>Dormant:</strong> Chỉ lọc các chiến lược ngủ đông dài hạn (&ge; 6 tháng không lệnh hoặc gap &ge; 60 ngày).<br />
                          • <strong>Stable / Seasonal / Volatile:</strong> Lọc theo từng nhóm trạng thái hoạt động tương ứng.
                        </Typography>
                      </Box>
                    </Stack>
                  </Box>

                  <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: isDarkMode ? 'rgba(76, 175, 80, 0.05)' : '#F6FFED', border: '1px solid', borderColor: isDarkMode ? 'rgba(76, 175, 80, 0.25)' : '#B7EB8F' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: isDarkMode ? '#81c784' : '#389E0D', mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      🛠️ HÀNH ĐỘNG KHUYẾN NGHỊ
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6, fontWeight: 500 }}>
                      1. <strong>Ưu tiên danh mục lõi (Core Portfolio):</strong> Lựa chọn các Robot có trạng thái <strong>Stable</strong> làm hạt nhân danh mục nhờ tần suất giao dịch đều đặn, tối ưu vòng quay vốn.
                      <br />2. <strong>Quản lý vốn theo mùa vụ:</strong> Với các Robot <strong>Seasonal</strong>, chỉ nên kích hoạt hoặc phân bổ vốn vào đúng các chu kỳ/quý thị trường thuận lợi theo kiểm chứng.
                      <br />3. <strong>Rà soát &amp; Tái tối ưu:</strong> Kiểm tra lại ngay kết nối VPS và cấu hình của các Robot <strong>Critical</strong>; loại bỏ hoặc re-optimize đối với các Robot <strong>Dormant</strong> khỏi danh mục Live.
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            );
          } else if (helpTitle.includes('Hành vi thoát lệnh') || helpTitle.includes('Exit Reasons') || helpTitle.includes('HÀNH VI THOÁT LỆNH')) {
            return (
              <Box sx={{ mt: 1 }}>
                <Stack spacing={2} sx={{ mb: 3 }}>
                  <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: isDarkMode ? 'rgba(33, 150, 243, 0.08)' : '#F0F8FF', border: '1px solid', borderColor: isDarkMode ? 'rgba(33, 150, 243, 0.25)' : '#BDD7EE' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: isDarkMode ? '#90caf9' : '#1F3864', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                      🎯 Ý NGHĨA CHỈ SỐ & PHÂN TÍCH THOÁT LỆNH
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6, fontWeight: 500 }}>
                      Phân tích các lý do đóng lệnh thực tế của Robot để xác định hành vi quản lý rủi ro:
                      <br />• **TP (Take Profit):** Tỷ lệ chạm chốt lời cứng theo thiết kế ban đầu.
                      <br />• **SL (Stop Loss):** Tỷ lệ chạm cắt lỗ cứng theo thiết kế ban đầu.
                      <br />• **CO (Close Out):** Thuật toán EA chủ động đóng lệnh sớm khi phát hiện tín hiệu đảo chiều sớm.
                      <br />• **EoT (End of Test):** Lệnh bị cưỡng bức đóng khi kết thúc quá trình backtest.
                    </Typography>
                  </Box>

                  <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: isDarkMode ? 'rgba(244, 67, 54, 0.05)' : '#FFF5F5', border: '1px solid', borderColor: isDarkMode ? 'rgba(244, 67, 54, 0.2)' : '#FFE0E0' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: isDarkMode ? '#f87171' : '#D32F2F', mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      ⚠️ CẢNH BÁO LỆNH EoT (GỒNG LỖ KÉO DÀI)
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6, fontWeight: 500 }}>
                      If tỷ lệ **EoT &gt; 10%**, Robot đang biểu hiện hành vi gồng lệnh kéo dài và không tự đóng lệnh bằng SL/TP hay thuật toán, buộc phải đóng khi hết dữ liệu lịch sử. Đây là dấu hiệu của chiến lược rủi ro cao (chạy theo kiểu grid/martingale thả trôi).
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            );
          } else if (helpTitle.includes('Phí hoa hồng theo lot') || helpTitle.includes('Commission per Lot') || helpTitle.includes('PHÍ HOA HỒNG THEO LOT')) {
            return (
              <Box sx={{ mt: 1 }}>
                <Stack spacing={2} sx={{ mb: 3 }}>
                  <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: isDarkMode ? 'rgba(33, 150, 243, 0.08)' : '#F0F8FF', border: '1px solid', borderColor: isDarkMode ? 'rgba(33, 150, 243, 0.25)' : '#BDD7EE' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: isDarkMode ? '#90caf9' : '#1F3864', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                      🎯 Ý NGHĨA BIỂU ĐỒ & CHỈ SỐ
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6, fontWeight: 500 }}>
                      Kiểm soát chi phí giao dịch (Commission) thực tế trên mỗi 1 lot giao dịch tiêu chuẩn đối với từng Symbol tài sản. Giúp so sánh chi phí giữa các broker khác nhau.
                    </Typography>
                  </Box>

                  <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: isDarkMode ? 'rgba(238, 168, 0, 0.05)' : '#FFFBE6', border: '1px solid', borderColor: isDarkMode ? 'rgba(238, 168, 0, 0.25)' : '#FFE58F' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: isDarkMode ? '#ffe082' : '#D48800', mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      ⚠️ PHÁT HIỆN BẤT THƯỜNG (MAX VS AVG FEE)
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6, fontWeight: 500 }}>
                      Nếu khoảng cách giữa **Max Fee** và **Avg Fee** quá lớn, đây là dấu hiệu tài khoản đang chạy các deal có khối lượng (Volume) cực nhỏ nhưng sàn vẫn thu phí hoa hồng tối thiểu (Min fee) cố định, khiến chi phí thực tế trên mỗi lot bị đẩy lên rất cao. Cần kiểm tra lại cấu hình tài khoản.
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            );
          } else if (helpTitle.includes('Gồng lỗ cắt non') || helpTitle.includes('Asymmetric Loss Aversion') || helpTitle.includes('HTR')) {
            return (
              <Box sx={{ mt: 1 }}>
                <Stack spacing={2} sx={{ mb: 3 }}>
                  <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: isDarkMode ? 'rgba(33, 150, 243, 0.08)' : '#F0F8FF', border: '1px solid', borderColor: isDarkMode ? 'rgba(33, 150, 243, 0.25)' : '#BDD7EE' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: isDarkMode ? '#90caf9' : '#1F3864', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                      🎯 Ý NGHĨA CHỈ SỐ (HTR - HOLDING TIME RATIO)
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6, fontWeight: 500 }}>
                      Đo lường tâm lý gồng lỗ cắt non bằng tỷ số thời gian giữ lệnh thua trung bình chia cho lệnh thắng trung bình. HTR lớn chỉ ra thói quen giữ lệnh lỗ rất lâu để hy vọng hòa vốn nhưng lại chốt lời cực nhanh (cắt non) khi vừa có lãi.
                    </Typography>
                  </Box>

                  <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: isDarkMode ? 'rgba(255,255,255,0.02)' : '#F8FAFC', border: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'text.primary', mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                      🚦 PHÂN LOẠI RỦI RO & STATUS
                    </Typography>
                    <Stack spacing={1.25}>
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1, borderRadius: 1.5, bgcolor: isDarkMode ? 'rgba(76, 175, 80, 0.08)' : '#F1F9EC' }}>
                        <Chip label="Excellent" size="small" sx={{ mt: 0.25, fontWeight: 800, color: isDarkMode ? '#81c784' : '#2E7D32', bgcolor: isDarkMode ? 'rgba(76, 175, 80, 0.15)' : 'rgba(46, 125, 50, 0.15)', border: '1px solid', borderColor: isDarkMode ? 'rgba(76, 175, 80, 0.3)' : 'rgba(46, 125, 50, 0.3)' }} />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>Kỷ luật tốt (Excellent)</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}><strong>HTR &le; 1.5</strong>. Thời gian giữ lệnh lỗ ngắn hoặc bằng lệnh lời. Cắt lỗ kỷ luật và dứt khoát.</Typography>
                        </Box>
                      </Box>

                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1, borderRadius: 1.5, bgcolor: isDarkMode ? 'rgba(238, 168, 0, 0.08)' : '#FFF7E6' }}>
                        <Chip label="Loss Averse" size="small" sx={{ mt: 0.25, fontWeight: 800, color: isDarkMode ? '#facc15' : '#D48800', bgcolor: isDarkMode ? 'rgba(238, 168, 0, 0.15)' : 'rgba(212, 136, 0, 0.15)', border: '1px solid', borderColor: isDarkMode ? 'rgba(238, 168, 0, 0.3)' : 'rgba(212, 136, 0, 0.3)' }} />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>Tâm lý gồng lỗ (Loss Averse)</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}><strong>HTR &gt; 2.0</strong> nhưng không nhồi lệnh. Giữ lệnh lỗ lâu gấp đôi lệnh lời, tâm lý gồng lỗ cắt non rõ rệt.</Typography>
                        </Box>
                      </Box>

                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1, borderRadius: 1.5, bgcolor: isDarkMode ? 'rgba(244, 67, 54, 0.08)' : '#FFEBEB' }}>
                        <Chip label="Critical Risk" size="small" sx={{ mt: 0.25, fontWeight: 800, color: isDarkMode ? '#f87171' : '#D32F2F', bgcolor: isDarkMode ? 'rgba(244, 67, 54, 0.15)' : 'rgba(211, 47, 47, 0.15)', border: '1px solid', borderColor: isDarkMode ? 'rgba(244, 67, 54, 0.3)' : 'rgba(211, 47, 47, 0.3)' }} />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>Cực kỳ nguy hiểm (Critical Risk)</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}><strong>HTR &gt; 2.0</strong> kết hợp với nhồi lệnh. Giao dịch cực kỳ rủi ro, gồng lỗ nghiêm trọng và nhồi gấp thếp.</Typography>
                        </Box>
                      </Box>
                    </Stack>
                  </Box>
                </Stack>
              </Box>
            );
          } else if (helpTitle.includes('Hành vi nhồi lệnh') || helpTitle.includes('Volume Escalation') || helpTitle.includes('VEI')) {
            return (
              <Box sx={{ mt: 1 }}>
                <Stack spacing={2} sx={{ mb: 3 }}>
                  <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: isDarkMode ? 'rgba(33, 150, 243, 0.08)' : '#F0F8FF', border: '1px solid', borderColor: isDarkMode ? 'rgba(33, 150, 243, 0.25)' : '#BDD7EE' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: isDarkMode ? '#90caf9' : '#1F3864', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                      🎯 Ý NGHĨA CHỈ SỐ (VEI - VOLUME ESCALATION INDEX)
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6, fontWeight: 500 }}>
                      Đo lường mức độ gia tăng khối lượng lệnh (nhân số Lot) sau chuỗi các lệnh thua liên tiếp. VEI lớn cho thấy robot đang áp dụng thuật toán nhồi lệnh gấp thếp (Martingale/Grid) để nhanh chóng gỡ lỗ.
                    </Typography>
                  </Box>

                  <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: isDarkMode ? 'rgba(255,255,255,0.02)' : '#F8FAFC', border: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'text.primary', mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                      🚦 PHÂN LOẠI RỦI RO & STATUS
                    </Typography>
                    <Stack spacing={1.5}>
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1, borderRadius: 1.5, bgcolor: isDarkMode ? 'rgba(76, 175, 80, 0.08)' : '#F1F9EC' }}>
                        <Chip label="Excellent" size="small" sx={{ mt: 0.25, fontWeight: 800, color: isDarkMode ? '#81c784' : '#2E7D32', bgcolor: isDarkMode ? 'rgba(76, 175, 80, 0.15)' : 'rgba(46, 125, 50, 0.15)', border: '1px solid', borderColor: isDarkMode ? 'rgba(76, 175, 80, 0.3)' : 'rgba(46, 125, 50, 0.3)' }} />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>Quản lý vốn an toàn (Excellent)</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}><strong>VEI &le; 1.0</strong>. Robot giữ nguyên hoặc giảm khối lượng sau khi thua để bảo vệ dòng vốn.</Typography>
                        </Box>
                      </Box>

                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1, borderRadius: 1.5, bgcolor: isDarkMode ? 'rgba(244, 67, 54, 0.08)' : '#FFEBEB' }}>
                        <Chip label="Martingale Risk" size="small" sx={{ mt: 0.25, fontWeight: 800, color: isDarkMode ? '#f87171' : '#D32F2F', bgcolor: isDarkMode ? 'rgba(244, 67, 54, 0.15)' : 'rgba(211, 47, 47, 0.15)', border: '1px solid', borderColor: isDarkMode ? 'rgba(244, 67, 54, 0.3)' : 'rgba(211, 47, 47, 0.3)' }} />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>Nguy cơ cháy tài khoản (Martingale Risk)</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}><strong>VEI &gt; 1.2</strong>. Robot tăng khối lượng rõ rệt khi gặp chuỗi thua. Rủi ro cháy tài khoản cực cao khi gặp sóng một chiều dài.</Typography>
                        </Box>
                      </Box>
                    </Stack>
                  </Box>
                </Stack>
              </Box>
            );
          } else if (helpTitle.includes('DANH SÁCH CHI TIẾT HÀNH VI ĐỘNG LỰC HỌC') || helpTitle.includes('HÀNH VI ĐỘNG LỰC HỌC')) {
            return (
              <Box sx={{ mt: 1 }}>
                <Stack spacing={2} sx={{ mb: 3 }}>
                  <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: isDarkMode ? 'rgba(33, 150, 243, 0.08)' : '#F0F8FF', border: '1px solid', borderColor: isDarkMode ? 'rgba(33, 150, 243, 0.25)' : '#BDD7EE' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: isDarkMode ? '#90caf9' : '#1F3864', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                      🎯 TỔNG QUAN BẢNG DỮ LIỆU
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6, fontWeight: 500 }}>
                      Bảng này cung cấp cái nhìn chi tiết về hành vi động lực học của từng chiến lược qua hai chỉ số chính:
                      <br />• **Holding Time Ratio (HTR):** Tỷ lệ thời gian giữ lệnh lỗ / thắng. HTR cao biểu hiện tâm lý gồng lỗ cắt non.
                      <br />• **Volume Escalation Index (VEI):** Chỉ số nhồi lệnh. VEI cao biểu hiện EA đang chạy thuật toán gấp thếp nguy hiểm.
                    </Typography>
                  </Box>

                  <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: isDarkMode ? 'rgba(255,255,255,0.02)' : '#F8FAFC', border: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: isDarkMode ? '#81c784' : '#2E7D32', mb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                      📊 TIÊU CHÍ LỰA CHỌN EA
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6, fontWeight: 500 }}>
                      Hãy lọc cột **Status** chọn các EA **Excellent** để đưa vào Portfolio. Tránh xa các EA có status **Critical Risk**, **Loss Averse** hoặc **Martingale Risk** vì chúng chứa đựng các quả bom hẹn giờ tâm lý học hành vi.
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            );
          } else {
            return (
              <Typography variant="body2" sx={{ lineHeight: 1.65, mb: 3.5, color: isDarkMode ? 'text.secondary' : 'var(--chart-title-color, #1F3864)', fontWeight: 500, whiteSpace: 'pre-line' }}>{helpContent}</Typography>
            );
          }
        })()}

        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            onClick={() => setHelpOpen(false)}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 700,
              boxShadow: 'none',
              bgcolor: isDarkMode ? 'primary.main' : 'var(--chart-title-color, #1F3864)',
              color: '#FFFFFF',
              '&:hover': { bgcolor: isDarkMode ? 'primary.dark' : '#2E75B6', boxShadow: 'none' }
            }}
          >
            Đã hiểu
          </Button>
        </Box>
      </Dialog>
      <DashboardRemarksDialog
        open={remarksOpen}
        onClose={() => setRemarksOpen(false)}
        title={remarksTitle}
        remarksId={remarksId}
        remarksType={remarksType}
        selectedTable={selectedTable}
        dateRange={dateRange}
      />
    </Box>
  );
}
