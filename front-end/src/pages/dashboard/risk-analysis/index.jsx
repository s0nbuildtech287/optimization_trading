import React, { useState, useMemo, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import IconButton from '@mui/material/IconButton';
import Collapse from '@mui/material/Collapse';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import LinearProgress from '@mui/material/LinearProgress';
import CircularProgress from '@mui/material/CircularProgress';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Alert from '@mui/material/Alert';
import Tooltip from '@mui/material/Tooltip';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import TablePagination from '@mui/material/TablePagination';
import Pagination from '@mui/material/Pagination';
import { useTheme } from '@mui/material/styles';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
  ReferenceLine,
  AreaChart,
  Area,
  LineChart,
  Line,
  ComposedChart,
  Scatter
} from 'recharts';
import {
  getStoredDashboardTable,
  getStoredDashboardSources,
  getStoredDashboardDateRange
} from 'utils/dashboardTable';

// Icons
import StopOutlined from '@ant-design/icons/StopOutlined';
import WarningOutlined from '@ant-design/icons/WarningOutlined';
import InfoCircleOutlined from '@ant-design/icons/InfoCircleOutlined';
import CheckCircleOutlined from '@ant-design/icons/CheckCircleOutlined';
import QuestionCircleOutlined from '@ant-design/icons/QuestionCircleOutlined';
import SearchOutlined from '@ant-design/icons/SearchOutlined';
import CloseOutlined from '@ant-design/icons/CloseOutlined';
import ShieldOutlined from '@ant-design/icons/SafetyOutlined';
import PieChartOutlined from '@ant-design/icons/PieChartOutlined';
import RobotOutlined from '@ant-design/icons/RobotOutlined';
import FileTextOutlined from '@ant-design/icons/FileTextOutlined';
import CalendarOutlined from '@ant-design/icons/CalendarOutlined';
import DownOutlined from '@ant-design/icons/DownOutlined';
import UpOutlined from '@ant-design/icons/UpOutlined';

// Project imports
import MainCard from 'components/MainCard';
import DashboardKpiSummary from 'components/dashboard/DashboardKpiSummary';
import DashboardRemarksDialog from 'components/dashboard/DashboardRemarksDialog';
import DashboardFilterBar from 'components/dashboard/DashboardFilterBar';
import CardLoader from 'components/CardLoader';
import {
  getRiskAnalysisData,
  getRiskAnalysisCore,
  getRiskAnalysisMarginExposure,
  getRiskAnalysisDoubleExposure,
  getRiskAnalysisLightCharts
} from 'api/dashboard';
import { getBacktestTables } from 'api/order';
import Loader from 'components/Loader';
import { useLotThreshold } from 'hooks/useLotThreshold';
import RiskViewTab from './RiskViewTab';
import StrategyViewTab from './StrategyViewTab';
import PortfolioChecksTab from './PortfolioChecksTab';
import VolumeOptimizationTab from './VolumeOptimizationTab';

const DEFAULT_LOT_SETTINGS = {
  configs: {
    DEFAULT: { minVol: 0, maxVol: 0 },
    BTCUSD: { minVol: 0, maxVol: 0 },
    DE30: { minVol: 0, maxVol: 0 },
    ETHUSD: { minVol: 0, maxVol: 0 },
    HK50: { minVol: 0, maxVol: 0 },
    JP225: { minVol: 0, maxVol: 0 },
    US500: { minVol: 0, maxVol: 0 },
    USOIL: { minVol: 0, maxVol: 0 },
    XAGUSD: { minVol: 0, maxVol: 0 },
    XAUUSD: { minVol: 0, maxVol: 0 }
  }
};

const buildDefaultLotRunName = (sourceTables = []) => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const sourceLabel = sourceTables.length > 0 ? sourceTables.join(' + ') : 'All Backtests';
  return `Volume OP ${timestamp} "${sourceLabel}"`;
};

const normalizeSourceTables = (sourceTables = []) => Array.from(new Set(
  (Array.isArray(sourceTables) ? sourceTables : [])
    .filter(Boolean)
    .map((table) => String(table).trim().toLowerCase())
)).sort();

const hasExactSourceTables = (left = [], right = []) => {
  const normalizedLeft = normalizeSourceTables(left);
  const normalizedRight = normalizeSourceTables(right);
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((table, index) => table === normalizedRight[index]);
};

// Custom high-end tooltip looking like TradingView / Bloomberg Terminal
const CustomTooltip = ({ active, payload, label, prefix = '', suffix = '' }) => {
  if (active && payload && payload.length) {
    return (
      <Box
        sx={{
          bgcolor: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(8px)',
          color: '#f8fafc',
          p: 1.5,
          borderRadius: 2,
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.4)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          fontSize: '0.75rem',
          minWidth: 140,
          zIndex: 1000
        }}
      >
        <Typography
          variant="caption"
          sx={{ fontWeight: 700, color: '#94a3b8', display: 'block', mb: 0.75, borderBottom: '1px solid rgba(255,255,255,0.08)', pb: 0.5 }}
        >
          {label}
        </Typography>
        {payload.map((p, idx) => {
          let val = p.value;
          if (typeof val === 'number') {
            if (suffix === ' USD' || prefix === '$') {
              val = `${prefix}${val.toLocaleString()}${suffix}`;
            } else {
              val = `${prefix}${val}${suffix}`;
            }
          }
          return (
            <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mt: 0.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: p.fill || p.color || '#3b82f6' }} />
                <Typography variant="caption" sx={{ color: '#cbd5e1', fontWeight: 500 }}>
                  {p.name === 'ob' ? 'Buy (OB)' : p.name === 'os' ? 'Sell (OS)' : p.name}
                </Typography>
              </Box>
              <Typography variant="caption" sx={{ fontWeight: 700, color: '#ffffff', fontFamily: 'monospace' }}>
                {val}
              </Typography>
            </Box>
          );
        })}
      </Box>
    );
  }
  return null;
};

const DoubleExposureTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const overlapPercent = Number(data.pct || 0);
    const overlapDays = Number(data.days || 0);
    const totalDays = Number(data.total_days || 0);
    const singlePercent = 100 - overlapPercent;
    const singleDays = Number(data.single_days ?? Math.max(0, totalDays - overlapDays));

    return (
      <Box
        sx={{
          bgcolor: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(8px)',
          color: '#f8fafc',
          p: 1.5,
          borderRadius: 2,
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.4)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          fontSize: '0.75rem',
          minWidth: 180,
          zIndex: 1000
        }}
      >
        <Typography
          variant="caption"
          sx={{ fontWeight: 700, color: '#94a3b8', display: 'block', mb: 0.75, borderBottom: '1px solid rgba(255,255,255,0.08)', pb: 0.5 }}
        >
          Cặp: {label}
        </Typography>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mt: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#E24B4A' }} />
            <Typography variant="caption" sx={{ color: '#cbd5e1', fontWeight: 500 }}>
              Overlap
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ fontWeight: 700, color: '#ffffff', fontFamily: 'monospace' }}>
            {overlapPercent.toFixed(1)}% ({overlapDays.toLocaleString()} ngày)
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mt: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#B5D4F4' }} />
            <Typography variant="caption" sx={{ color: '#cbd5e1', fontWeight: 500 }}>
              Chỉ 1 khung
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ fontWeight: 700, color: '#ffffff', fontFamily: 'monospace' }}>
            {singlePercent.toFixed(1)}% ({singleDays.toLocaleString()} ngày)
          </Typography>
        </Box>

        {totalDays > 0 && (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 2,
              mt: 0.75,
              pt: 0.75,
              borderTop: '1px solid rgba(255,255,255,0.08)'
            }}
          >
            <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 500 }}>
              Tổng ngày backtest
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 700, color: '#ffffff', fontFamily: 'monospace' }}>
              {totalDays.toLocaleString()} ngày
            </Typography>
          </Box>
        )}
      </Box>
    );
  }
  return null;
};

// ==========================================
// 32 RISK INDICATORS DATABASE
// GROUP A: HARD FLAGS (#1-#8) — Dính 1 → Loại ngay
// GROUP B: SOFT FLAGS (#9-#25) — Dính ≥3 → Hạ priority
// GROUP C: PORTFOLIO CHECKS (#26-#32) — Rủi ro portfolio-level
// ==========================================

export const HARD_FLAG_GROUPS = [
  {
    id: 'G1',
    label: 'Nhóm 1: Hiệu suất cơ bản',
    desc: 'Kỳ vọng toán học âm hoặc biên lợi nhuận quá mỏng để sinh lời thực tế.',
    ids: ['1', '2', '3', '4']
  },
  {
    id: 'G2',
    label: 'Nhóm 2: Rủi ro ẩn / Hành vi nguy hiểm',
    desc: 'Hành vi giao dịch cực kỳ nguy hiểm, có rủi ro cháy tài khoản đột ngột.',
    ids: ['5', '6', '7']
  },
  {
    id: 'G3',
    label: 'Nhóm 3: Mất lợi thế / Lỗi thời',
    desc: 'Chiến lược từng hoạt động tốt nhưng đã lỗi thời với thị trường hiện tại.',
    ids: ['8']
  }
];

// Group headers cho Soft Flags
export const SOFT_FLAG_GROUPS = [
  {
    id: 'G4',
    label: 'Nhóm 4: Độ tin cậy thống kê',
    desc: 'Kết quả backtest bị bóp méo bởi sample size nhỏ, outlier hoặc equity không ổn định.',
    ids: ['9', '10', '11', '12']
  },
  {
    id: 'G5',
    label: 'Nhóm 5: Tối ưu quá mức / Suy giảm hiệu năng',
    desc: 'Chiến lược bị tối ưu hóa quá mức vào quá khứ, suy giảm nhanh theo thời gian.',
    ids: ['13', '14', '15']
  },
  {
    id: 'G6',
    label: 'Nhóm 6: Cấu trúc rủi ro giao dịch',
    desc: 'Các cảnh báo về drawdown, chuỗi thua và tương quan giữa winrate với Profit Factor.',
    ids: ['16', '17', '18', '19']
  },
  {
    id: 'G7',
    label: 'Nhóm 7: Biên hiệu suất cảnh báo',
    desc: 'Expected Payoff, Profit Factor và Recovery Factor nằm gần ngưỡng tối thiểu.',
    ids: ['20', '21', '22']
  },
  {
    id: 'G8',
    label: 'Nhóm 8: Hoạt động và độ ổn định',
    desc: 'Cảnh báo mẫu giao dịch thấp, winrate yếu, thin edge hoặc chuỗi thua cực dài.',
    ids: ['23', '24', '25', '26', '27']
  }
];

// Danh sách các tab lọc nhanh theo nhóm rủi ro
export const FILTER_GROUPS = [
  { id: 'all', label: 'TẤT CẢ CHỈ BÁO' },
  { id: 'G1', label: 'Nhóm 1: Hiệu suất cơ bản' },
  { id: 'G2', label: 'Nhóm 2: Rủi ro ẩn' },
  { id: 'G3', label: 'Nhóm 3: Mất lợi thế / Lỗi thời' },
  { id: 'G4', label: 'Nhóm 4: Độ tin cậy thống kê' },
  { id: 'G5', label: 'Nhóm 5: Tối ưu quá mức' },
  { id: 'G6', label: 'Nhóm 6: Cấu trúc rủi ro' },
  { id: 'G7', label: 'Nhóm 7: Biên hiệu suất' },
  { id: 'G8', label: 'Nhóm 8: Hoạt động & ổn định' }
];

// Rules for Priority scoring are defined inside the component as a JSX layout.

// GROUP A: HARD FLAGS (#1-#8)
const HARD_FLAGS = [
  {
    id: '1',
    title: 'Expected Payoff ≤ 0',
    disease: 'DEAD EDGE',
    count: 0,
    desc: 'Kỳ vọng toán học âm, thua tiền trung bình mỗi lệnh.',
    info: 'Expected Payoff phải > 0 để chứng minh hệ thống sở hữu lợi thế thống kê thực tế. Điểm số âm chỉ ra rằng chiến lược trung bình sẽ đốt cháy tài sản trên mỗi lệnh giao dịch.',
    strats: []
  },
  {
    id: '2',
    title: 'Profit Factor < 1.2 (≥100 lệnh)',
    disease: 'SLENDER EDGE',
    count: 0,
    desc: 'Tổng tiền thắng không đủ bù thua cho các chiến lược dài hạn.',
    info: 'Profit Factor < 1.2 cho thấy biên lợi nhuận quá mỏng để sống sót trước trượt giá và chi phí giao dịch thực tế trên sàn live.',
    strats: []
  },
  {
    id: '3',
    title: 'Recovery Factor < 1.0',
    disease: 'STAGNANT RECOVERY',
    count: 0,
    desc: 'Tổng profit ròng chưa bù được max drawdown lịch sử gánh chịu.',
    info: 'Recovery Factor < 1.0 đồng nghĩa với việc chiến lược mất nhiều thời gian chịu đựng sụt giảm hơn là tạo ra giá trị thặng dư ròng.',
    strats: []
  },
  {
    id: '4',
    title: 'P/D Ratio < 1.0 (≥100 lệnh)',
    disease: 'UNWORTHY DRAWDOWN',
    count: 0,
    desc: 'Lợi nhuận ròng thấp hơn mức sụt giảm tài sản tạm thời lớn nhất.',
    info: 'Tỷ số P/D < 1.0 chỉ ra rằng mức độ chịu lỗ tạm thời của chiến lược không xứng đáng với thành quả ròng cuối cùng mang lại.',
    strats: []
  },
  {
    id: '5',
    title: 'Martingale Triple Flag',
    disease: 'MARTINGALE BOMB',
    count: 0,
    desc: 'Đồng thời: Winrate ≥50% + Lệnh thua lớn nhất ≥$15K + Drawdown ≥20%.',
    info: 'Đây là tín hiệu cảnh báo Martingale ẩn. Chiến lược cố gắng duy trì winrate cao bằng cách nhồi lệnh ngược xu hướng, dẫn đến rủi ro cháy tài khoản đột ngột.',
    strats: []
  },
  {
    id: '6',
    title: 'Đóng lệnh bằng End of Test > 10%',
    disease: 'END-OF-TEST CHEAT',
    count: 0,
    desc: 'Chiến lược giữ lệnh vô hạn, không có điểm cắt xác định trong điều kiện thường.',
    info: 'Chiếm tỷ lệ đóng lệnh lớn bằng thời gian dừng thử nghiệm (End of Test) phản ánh chiến lược đang "gồng lỗ" vô hạn và lệ thuộc vào việc kết thúc backtest để thoát lệnh giả.',
    strats: []
  },
  {
    id: '7',
    title: 'Largest Loss / Net Profit ≥ 70%',
    disease: 'FATAL LOSS RATIO',
    count: 0,
    desc: 'Lệnh thua lớn nhất chiếm tỷ trọng quá lớn (≥70%) so với tổng lợi nhuận ròng.',
    info: 'Lệnh thua lớn nhất (Largest Loss Trade) quá sát hoặc vượt quá tổng lợi nhuận ròng cho thấy chiến lược có rủi ro đuôi cực lớn. Chỉ cần một giao dịch thất bại nghiêm trọng có thể xóa sạch thành quả tích lũy của toàn bộ quá trình giao dịch.',
    strats: []
  },
  {
    id: '8',
    title: 'Profit 12 tháng gần nhất âm',
    disease: 'EXPIRED EDGE',
    count: 0,
    desc: 'Chiến lược đã mất Edge (lợi thế giao dịch) trong cấu trúc thị trường mới.',
    info: 'Toàn kỳ backtest dương nhưng 12 tháng gần nhất âm chứng tỏ động lực thị trường đã thay đổi và hệ thống đã bước vào chu kỳ lỗi thời.',
    strats: []
  }
];

const normalizeMetric = (items, key) => {
  const values = items.map((s) => Number(s[key] ?? 0)).filter(Number.isFinite);
  if (values.length === 0) return {};
  const min = Math.min(...values);
  const max = Math.max(...values);
  const res = {};
  items.forEach((s) => {
    const val = Number(s[key] ?? 0);
    const sKey = `${s.backtest || ''}:${s.id}`;
    if (!Number.isFinite(val)) {
      res[sKey] = 0;
    } else if (max === min) {
      res[sKey] = 100;
    } else {
      res[sKey] = Number((((val - min) / (max - min)) * 100).toFixed(2));
    }
  });
  return res;
};

const getSharpeScore = (sharpeVal) => {
  const s = Number(sharpeVal);
  if (!Number.isFinite(s) || s <= 0) return 0;
  if (s < 0.5) return Number(((s / 0.5) * 20).toFixed(2));
  if (s >= 0.5 && s < 1.0) return Number((20 + ((s - 0.5) / 0.5) * 40).toFixed(2));
  if (s >= 1.0 && s < 2.0) return Number((60 + (s - 1.0) * 30).toFixed(2));
  if (s >= 2.0 && s <= 3.0) return Number((90 + (s - 2.0) * 10).toFixed(2));
  if (s > 3.0 && s <= 5.0) return Number((100 - ((s - 3.0) / 2.0) * 60).toFixed(2));
  if (s > 5.0 && s <= 10.0) return Number((40 - ((s - 5.0) / 5.0) * 30).toFixed(2));
  return 0;
};

const getConcentrationScore = (coverageRatio) => {
  const ratio = Number(coverageRatio);
  if (!Number.isFinite(ratio) || ratio <= 0) return 0;
  if (ratio >= 3) return 100;
  if (ratio >= 2) return Number((60 + (ratio - 2) * 19).toFixed(2));
  if (ratio >= 1.5) return Number((35 + ((ratio - 1.5) / 0.5) * 24).toFixed(2));
  if (ratio >= 1) return Number((10 + ((ratio - 1) / 0.5) * 24).toFixed(2));
  return Math.min(100, Math.max(0, Number((ratio * 10).toFixed(2))));
};

export default function RiskAnalysis() {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  const PRIORITY_RULES_HELP = useMemo(
    () => (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
        {/* 1. Giới thiệu */}
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem', lineHeight: 1.5 }}>
          Thang điểm Priority (0 - 100đ) đánh giá độ tin cậy và mức độ sẵn sàng vận hành của từng bot trong hệ thống giao dịch thực tế của{' '}
          <strong>Lotusquant</strong>.
        </Typography>

        {/* 2. Điểm xuất phát */}
        <Box
          sx={{
            p: 1.5,
            borderRadius: 2,
            bgcolor: isDarkMode ? 'rgba(2, 132, 199, 0.12)' : 'rgba(2, 132, 199, 0.06)',
            border: '1px solid',
            borderColor: isDarkMode ? 'rgba(2, 132, 199, 0.3)' : 'rgba(2, 132, 199, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <Typography variant="body2" fontWeight={700} color={isDarkMode ? '#38bdf8' : 'primary.main'}>
            Điểm xuất phát tối đa:
          </Typography>
          <Chip label="100 Điểm" color="primary" size="small" sx={{ fontWeight: 800, borderRadius: 1 }} />
        </Box>

        {/* 3. Bảng cơ chế trừ điểm */}
        <Typography variant="subtitle2" fontWeight={700} sx={{ color: 'text.primary', mb: -0.5 }}>
          Cơ chế tính điểm & khấu trừ:
        </Typography>

        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 1.5, overflow: 'hidden', bgcolor: 'background.paper' }}>
          <Table size="small">
            <TableHead sx={{ bgcolor: isDarkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', py: 1, color: 'text.primary' }}>Nhóm rủi ro</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', py: 1, color: 'text.primary' }} align="center">
                  Mã cờ chỉ báo
                </TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', py: 1, color: 'text.primary' }} align="center">
                  Khấu trừ
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow hover>
                <TableCell sx={{ fontSize: '0.75rem', py: 0.75, fontWeight: 600, color: 'error.main' }}>Hard Flags (Tier 1)</TableCell>
                <TableCell sx={{ fontSize: '0.75rem', py: 0.75 }} align="center">
                  #1 → #8
                </TableCell>
                <TableCell sx={{ fontSize: '0.75rem', py: 0.75 }} align="center">
                  <Chip
                    label="LOẠI (Về 0đ)"
                    size="small"
                    color="error"
                    sx={{ fontWeight: 800, height: 18, fontSize: '9px', borderRadius: 1 }}
                  />
                </TableCell>
              </TableRow>
              <TableRow hover>
                <TableCell sx={{ fontSize: '0.75rem', py: 0.75, color: 'text.primary' }}>Nhóm 4 & Nhóm 7 (Soft)</TableCell>
                <TableCell sx={{ fontSize: '0.75rem', py: 0.75, color: 'text.secondary' }} align="center">
                  #9, #10, #11, #21, #22, #23
                </TableCell>
                <TableCell sx={{ fontSize: '0.75rem', py: 0.75, fontWeight: 700, color: 'warning.main' }} align="center">
                  -5đ / cờ
                </TableCell>
              </TableRow>
              <TableRow hover>
                <TableCell sx={{ fontSize: '0.75rem', py: 0.75, color: 'text.primary' }}>Nhóm 5 & Nhóm 8 (Soft)</TableCell>
                <TableCell sx={{ fontSize: '0.75rem', py: 0.75, color: 'text.secondary' }} align="center">
                  #12, #16, #24, #25, #26, #27
                </TableCell>
                <TableCell sx={{ fontSize: '0.75rem', py: 0.75, fontWeight: 700, color: 'warning.main' }} align="center">
                  -10đ / cờ
                </TableCell>
              </TableRow>
              <TableRow hover>
                <TableCell sx={{ fontSize: '0.75rem', py: 0.75, color: 'text.primary' }}>Nhóm 6 (Nhồi lệnh ẩn)</TableCell>
                <TableCell sx={{ fontSize: '0.75rem', py: 0.75, color: 'text.secondary' }} align="center">
                  #17 → #20
                </TableCell>
                <TableCell sx={{ fontSize: '0.75rem', py: 0.75, fontWeight: 700, color: 'error.main' }} align="center">
                  -15đ / cờ
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>

        {/* 4. Phân loại xếp hạng */}
        <Typography variant="subtitle2" fontWeight={700} sx={{ color: 'text.primary', mb: -0.5 }}>
          Phân lớp xếp hạng ưu tiên:
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
          {[
            { range: '80 – 100đ', label: 'Mức CAO', color: '#10b981', bg: isDarkMode ? 'rgba(16,185,129,0.12)' : 'rgba(16,185,129,0.06)' },
            { range: '50 – 79đ', label: 'TRUNG BÌNH', color: '#d97706', bg: isDarkMode ? 'rgba(180,83,9,0.12)' : 'rgba(180,83,9,0.06)' },
            { range: '1 – 49đ', label: 'Mức THẤP', color: '#f43f5e', bg: isDarkMode ? 'rgba(225,29,72,0.12)' : 'rgba(225,29,72,0.06)' },
            { range: 'Điểm = 0đ', label: 'BỊ LOẠI', color: '#ef4444', bg: isDarkMode ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.06)' }
          ].map((lvl, index) => (
            <Box
              key={index}
              sx={{
                p: 1,
                borderRadius: 1.5,
                bgcolor: lvl.bg,
                border: '1px solid',
                borderColor: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center'
              }}
            >
              <Typography variant="caption" fontWeight={800} sx={{ color: lvl.color }}>
                {lvl.label}
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary', mt: 0.25 }}>
                {lvl.range}
              </Typography>
            </Box>
          ))}
        </Box>

        {/* 5. Cảnh báo quan trọng */}
        <Alert
          severity="warning"
          variant="outlined"
          sx={{ borderRadius: 1.5, py: 0.5, '& .MuiAlert-icon': { mr: 0.75, fontSize: '18px' } }}
        >
          <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, lineHeight: 1.4 }}>
            <strong>Quy tắc loại trừ phụ:</strong> Mọi chiến lược vi phạm từ 3 Soft Flags trở lên sẽ tự động bị hạ priority deploy xuống
            thấp hoặc loại bỏ hoàn toàn.
          </Typography>
        </Alert>
      </Box>
    ),
    [isDarkMode]
  );

  const CORRELATED_DD_HELP = useMemo(
    () => (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem', lineHeight: 1.5 }}>
          Đo lường số ngày trong năm mà danh mục chịu tổn thất đồng thời. Thống kê theo tháng trong vòng 36 tháng gần nhất (hoặc theo Date
          Range được chọn).
        </Typography>

        <Typography variant="subtitle2" fontWeight={700} sx={{ color: 'text.primary', mb: -0.5 }}>
          Cơ chế tính toán (Ngưỡng động):
        </Typography>

        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 1.5, overflow: 'hidden', bgcolor: 'background.paper' }}>
          <Table size="small">
            <TableHead sx={{ bgcolor: isDarkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', py: 1, color: 'text.primary' }}>Số bot hoạt động/ngày</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', py: 1, color: 'text.primary' }} align="center">
                  Yêu cầu tỷ lệ cùng lỗ
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow hover>
                <TableCell sx={{ fontSize: '0.75rem', py: 0.75, color: 'text.primary' }}>≥ 100 bot hoạt động</TableCell>
                <TableCell sx={{ fontSize: '0.75rem', py: 0.75, fontWeight: 700, color: 'error.main' }} align="center">
                  ≥ 85% số bot
                </TableCell>
              </TableRow>
              <TableRow hover>
                <TableCell sx={{ fontSize: '0.75rem', py: 0.75, color: 'text.primary' }}>20 đến 99 bot hoạt động</TableCell>
                <TableCell sx={{ fontSize: '0.75rem', py: 0.75, fontWeight: 700, color: 'warning.main' }} align="center">
                  ≥ 70% số bot
                </TableCell>
              </TableRow>
              <TableRow hover>
                <TableCell sx={{ fontSize: '0.75rem', py: 0.75, color: 'text.primary' }}>4 đến 19 bot hoạt động</TableCell>
                <TableCell sx={{ fontSize: '0.75rem', py: 0.75, fontWeight: 700, color: 'info.main' }} align="center">
                  ≥ 55% số bot
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>

        <Box
          sx={{
            p: 1.5,
            borderRadius: 2,
            bgcolor: isDarkMode ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.06)',
            border: '1px solid',
            borderColor: isDarkMode ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <Typography variant="body2" fontWeight={700} color={isDarkMode ? '#10b981' : 'success.main'}>
            Ngưỡng an toàn khuyến nghị:
          </Typography>
          <Chip label="≤ 10 ngày / năm" color="success" size="small" sx={{ fontWeight: 800, borderRadius: 1 }} />
        </Box>

        <Alert severity="info" variant="outlined" sx={{ borderRadius: 1.5, py: 0.5, '& .MuiAlert-icon': { mr: 0.75, fontSize: '18px' } }}>
          <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, lineHeight: 1.4 }}>
            <strong>Lưu ý loại bỏ nhiễu:</strong> Chỉ ghi nhận ngày sụt giảm đồng thuận khi có ít nhất 4 bot hoạt động giao dịch đồng thời
            trong ngày đó.
          </Typography>
        </Alert>
      </Box>
    ),
    [isDarkMode]
  );

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

  const DOUBLE_EXPOSURE_HELP = useMemo(
    () => (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem', lineHeight: 1.5 }}>
          Đo lường mức độ nhân đôi rủi ro không cần thiết trong danh mục khi hai khung thời gian của cùng một thuật toán gốc vào lệnh cùng
          chiều trên cùng một tài sản.
        </Typography>

        <Typography variant="subtitle2" fontWeight={700} sx={{ color: 'text.primary', mb: -0.5 }}>
          5 Điều kiện ghi nhận trùng lặp:
        </Typography>

        <Box
          sx={{
            p: 1.5,
            borderRadius: 2,
            bgcolor: isDarkMode ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.04)',
            border: '1px solid',
            borderColor: isDarkMode ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.12)',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 1
          }}
        >
          {[
            '1. Cùng ngày giao dịch',
            '2. Cùng cặp tài sản',
            '3. Cùng chiều (Buy/Sell)',
            '4. Cùng lệnh MỞ (in)',
            '5. Cùng dòng gốc (e.g. 001)'
          ].map((item, idx) => (
            <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: 'error.main' }} />
              <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.primary' }}>
                {item}
              </Typography>
            </Box>
          ))}
        </Box>

        <Typography variant="subtitle2" fontWeight={700} sx={{ color: 'text.primary', mb: -0.5 }}>
          Ví dụ & Đối ứng Hedging:
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box
            sx={{
              p: 1,
              borderRadius: 1.5,
              bgcolor: isDarkMode ? 'rgba(255,255,255,0.03)' : '#f8fafc',
              border: '1px solid',
              borderColor: 'divider'
            }}
          >
            <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, color: 'error.main' }}>
              ⚠️ BỊ TÍNH TRÙNG LẶP:
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Bot H1 (001EURUSDH1OB) và bot H4 (001EURUSDH4OB) cùng dòng gốc, cùng vào lệnh Mua (Buy) vào cùng ngày.
            </Typography>
          </Box>

          <Box
            sx={{
              p: 1,
              borderRadius: 1.5,
              bgcolor: isDarkMode ? 'rgba(255,255,255,0.03)' : '#f8fafc',
              border: '1px solid',
              borderColor: 'divider'
            }}
          >
            <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, color: 'success.main' }}>
              ✅ ĐỐI ỨNG (HEDGING) - KHÔNG TÍNH:
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Nếu khung H1 Buy và khung H4 Sell trong cùng một ngày, hệ thống coi đây là đối ứng giảm thiểu rủi ro, do đó không tính trùng.
            </Typography>
          </Box>
        </Box>

        <Box
          sx={{
            p: 1.5,
            borderRadius: 2,
            bgcolor: isDarkMode ? 'rgba(245, 158, 11, 0.12)' : 'rgba(245, 158, 11, 0.06)',
            border: '1px solid',
            borderColor: isDarkMode ? 'rgba(245, 158, 11, 0.3)' : 'rgba(245, 158, 11, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <Typography variant="body2" fontWeight={700} color={isDarkMode ? '#f59e0b' : 'warning.dark'}>
            Tỷ lệ trùng lặp an toàn:
          </Typography>
          <Chip label="≤ 5% số ngày giao dịch" color="warning" size="small" sx={{ fontWeight: 800, borderRadius: 1 }} />
        </Box>
      </Box>
    ),
    [isDarkMode]
  );

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
        lineHeight: 1.4,
        whiteSpace: 'pre-line'
      }
    },
    arrow: {
      sx: {
        color: isDarkMode ? '#1e293b' : '#0f172a'
      }
    }
  };

  const [selectedTable, setSelectedTable] = useState(() => getStoredDashboardTable('all_backtests'));
  const [dashboardSourcesRevision, setDashboardSourcesRevision] = useState(0);
  const [dateRange, setDateRange] = useState(() => getStoredDashboardDateRange());
  const selectedTableLabel = selectedTable === 'all_backtests' ? 'All Backtests' : selectedTable;
  const dateRangeLabel = dateRange.startDate && dateRange.endDate ? `${dateRange.startDate} → ${dateRange.endDate}` : 'Full period';
  const [backtestTables, setBacktestTables] = useState([]);
  const [loadingTables, setLoadingTables] = useState(true);

  useEffect(() => {
    const fetchTables = async () => {
      try {
        setLoadingTables(true);
        const response = await getBacktestTables();
        setBacktestTables(response.tables || []);
      } catch (err) {
        console.error('Failed to fetch backtest tables for risk analysis:', err);
        setBacktestTables([]);
      } finally {
        setLoadingTables(false);
      }
    };
    fetchTables();
  }, []);

  useEffect(() => {
    const handleFiltersUpdated = () => {
      setSelectedTable(getStoredDashboardTable('all_backtests'));
      setDateRange(getStoredDashboardDateRange());
      setDashboardSourcesRevision((revision) => revision + 1);
    };
    window.addEventListener('dashboard:filters-updated', handleFiltersUpdated);
    return () => window.removeEventListener('dashboard:filters-updated', handleFiltersUpdated);
  }, []);
  const [riskApiData, setRiskApiData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');

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
            '&:hover': { bgcolor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)' }
          }}
        >
          <FileTextOutlined style={{ fontSize: '16px' }} />
        </IconButton>
      </Tooltip>
    </Box>
  );



  const [marginExposureData, setMarginExposureData] = useState([]);
  const [marginLoading, setMarginLoading] = useState(true);
  const [marginError, setMarginError] = useState(null);

  const [doubleExposureData, setDoubleExposureData] = useState([]);
  const [doubleLoading, setDoubleLoading] = useState(true);
  const [doubleError, setDoubleError] = useState(null);

  const [lightChartsData, setLightChartsData] = useState(null);
  const [lightChartsLoading, setLightChartsLoading] = useState(true);
  const [lightChartsError, setLightChartsError] = useState(null);

  const [refreshKey, setRefreshKey] = React.useState(0);

  useEffect(() => {
    const handleDataChanged = () => setRefreshKey((k) => k + 1);
    window.addEventListener('dashboard:data-changed', handleDataChanged);
    return () => window.removeEventListener('dashboard:data-changed', handleDataChanged);
  }, []);

  useEffect(() => {
    let active = true;
    const selectedSources = getStoredDashboardSources([]);
    if (!selectedSources || selectedSources.length === 0) {
      setLoading(false);
      setRiskApiData(null);
      setMarginLoading(false);
      setDoubleLoading(false);
      setLightChartsLoading(false);
      return;
    }
    const params = { sourceNames: selectedSources };
    if (dateRange.startDate && dateRange.endDate) {
      params.startDate = dateRange.startDate;
      params.endDate = dateRange.endDate;
    }

    // 1. Fetch Core Risk Data (super fast)
    const loadCore = async () => {
      try {
        setError(null);
        setLoading(true);
        const res = await getRiskAnalysisCore(params);
        if (active) {
          setRiskApiData(res?.data || null);
          setLoading(false);
          setError(null);
        }
      } catch (e) {
        console.error('Failed to load risk-analysis core data:', e);
        if (active) {
          setError(e);
          setLoading(false);
        }
      }
    };

    // 2. Fetch Margin Exposure (Peak Active Days)
    const loadMargin = async () => {
      try {
        setMarginLoading(true);
        setMarginError(null);
        const res = await getRiskAnalysisMarginExposure(params);
        if (active) {
          setMarginExposureData(res?.data || []);
          setMarginLoading(false);
        }
      } catch (e) {
        console.error('Failed to load margin exposure data:', e);
        if (active) {
          setMarginError(e);
          setMarginLoading(false);
        }
      }
    };

    // 3. Fetch Double Exposure (H1 vs H4 Overlap)
    const loadDouble = async () => {
      try {
        setDoubleLoading(true);
        setDoubleError(null);
        const res = await getRiskAnalysisDoubleExposure(params);
        if (active) {
          setDoubleExposureData(res?.data || []);
          setDoubleLoading(false);
        }
      } catch (e) {
        console.error('Failed to load double exposure data:', e);
        if (active) {
          setDoubleError(e);
          setDoubleLoading(false);
        }
      }
    };

    // 4. Fetch Light Charts (Correlated Drawdown & Divergence)
    const loadLightCharts = async () => {
      try {
        setLightChartsLoading(true);
        setLightChartsError(null);
        const res = await getRiskAnalysisLightCharts(params);
        if (active) {
          setLightChartsData(res?.data || null);
          setLightChartsLoading(false);
        }
      } catch (e) {
        console.error('Failed to load light charts data:', e);
        if (active) {
          setLightChartsError(e);
          setLightChartsLoading(false);
        }
      }
    };

    loadCore();
    loadMargin();
    loadDouble();
    loadLightCharts();

    return () => {
      active = false;
    };
  }, [selectedTable, dateRange, refreshKey]);

  const hardFlagsLive = useMemo(() => {
    if (!riskApiData?.hardFlags) {
      return HARD_FLAGS.map((f) => ({ ...f, count: 0, strats: [] }));
    }
    const byId = Object.values(riskApiData.hardFlags).reduce((acc, item) => {
      if (item?.id) acc[item.id] = item;
      return acc;
    }, {});
    const buildVal = (s, flagId) => {
      switch (String(flagId)) {
        case '1':
          return `EP ${s.ep != null ? (s.ep >= 0 ? '+' : '') + Number(s.ep).toFixed(2) : 'n/a'}`;
        case '2':
          return `PF ${s.pf != null ? Number(s.pf).toFixed(2) : 'n/a'}`;
        case '3':
          return `RF ${s.rf != null ? Number(s.rf).toFixed(2) : 'n/a'}`;
        case '4':
          return `P/D ${s.pd != null ? Number(s.pd).toFixed(2) : 'n/a'}`;
        case '7':
          const lossVal = s.largestLossTrade != null ? Math.abs(Number(s.largestLossTrade)) : 0;
          const netProf = s.netProfit != null ? Number(s.netProfit) : 0;
          const pct = netProf > 0 ? Math.round((lossVal / netProf) * 100) : 0;
          const formatCurrencyLocal = (v) => {
            if (v >= 1000) return `$${(v / 1000).toFixed(1).replace(/\.0+$/, '')}k`;
            return `$${v.toFixed(1).replace(/\.0+$/, '')}`;
          };
          return `Loss -${formatCurrencyLocal(lossVal)} / Net Profit ${formatCurrencyLocal(netProf)} (${pct}%)`;
        case '8':
          const r12m = s.recent12mProfit != null ? Number(s.recent12mProfit) : 0;
          const formatCurrencyLocalR12m = (v) => {
            const sign = v < 0 ? '-' : '';
            const abs = Math.abs(v);
            if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1).replace(/\.0+$/, '')}k`;
            return `${sign}$${abs.toFixed(1).replace(/\.0+$/, '')}`;
          };
          return `12M profit ${formatCurrencyLocalR12m(r12m)}`;
        default:
          return '';
      }
    };
    const apiStrategies = riskApiData?.strategies || [];
    return HARD_FLAGS.map((f) => {
      const api = byId[f.id];
      if (!api) return { ...f, count: 0, strats: [] };
      const apiStrats = Array.isArray(api.strats) ? api.strats : [];
      // Find strategies that have this flag but are missing from the truncated strats list
      const existingIds = new Set(apiStrats.map((s) => `${s.backtest || ''}:${s.id}`));
      const missingStrats = apiStrategies
        .filter((s) => Array.isArray(s.hardFlags) && s.hardFlags.includes(f.id) && !existingIds.has(`${s.backtest || ''}:${s.id}`))
        .map((s) => ({ id: s.id, val: buildVal(s, f.id) }));
      return {
        ...f,
        count: Number(api.count || 0),
        strats: [...apiStrats, ...missingStrats]
      };
    });
  }, [riskApiData]);

  const softFlagsLive = useMemo(() => {
    if (!riskApiData?.softFlags || riskApiData.softFlags.length === 0) {
      return [];
    }

    const groupOrder = SOFT_FLAG_GROUPS.flatMap((g) => g.ids);
    const orderMap = groupOrder.reduce((acc, id, idx) => {
      acc[String(id)] = idx;
      return acc;
    }, {});

    const apiStrategies = riskApiData?.strategies || [];

    return riskApiData.softFlags.map((api) => {
      const flagId = String(api.id);
      const apiStrats = Array.isArray(api.strats) ? api.strats : [];
      // Find strategies that have this flag but are missing from the truncated strats list
      const existingIds = new Set(apiStrats.map((s) => `${s.backtest || ''}:${s.id}`));
      const missingStrats = apiStrategies
        .filter((s) => Array.isArray(s.softFlags) && s.softFlags.includes(flagId) && !existingIds.has(`${s.backtest || ''}:${s.id}`))
        .map((s) => {
          const detail = Array.isArray(s.softFlagDetails)
            ? s.softFlagDetails.find((item) => String(item.id) === flagId)
            : null;
          return { id: s.id, backtest: s.backtest, val: detail?.val || 'n/a' };
        });

      return {
        ...api,
        id: flagId,
        disease: api.diagnosticCode,
        desc: api.description,
        count: Number(api.count || 0),
        strats: [...apiStrats, ...missingStrats]
      };
    }).sort((a, b) => {
      const oa = orderMap[a.id] ?? Number.MAX_SAFE_INTEGER;
      const ob = orderMap[b.id] ?? Number.MAX_SAFE_INTEGER;
      if (oa !== ob) return oa - ob;
      return Number(a.id) - Number(b.id);
    });
  }, [riskApiData]);

  const allStrategiesLive = useMemo(() => {
    if (!riskApiData?.strategies) {
      return [];
    }
    return riskApiData.strategies.map((s) => ({
      ...s,
      id: s.id,
      ep: s.ep ?? 0,
      pf: s.pf ?? 0,
      rf: s.rf ?? 0,
      pd: s.pd ?? 0,
      hardCount: s.hardCount ?? 0,
      softCount: s.softCount ?? 0,
      status: s.status || 'Passed',
      trades: s.trades ?? 0,
      backtest: s.backtest || '',
      hardFlags: Array.isArray(s.hardFlags) ? s.hardFlags : [],
      softFlags: Array.isArray(s.softFlags) ? s.softFlags : [],
      largestLossTrade: s.largestLossTrade ?? 0,
      winratePct: s.winratePct ?? 0,
      drawdownPct: s.drawdownPct ?? 0,
      maxConsecutiveLosses: s.maxConsecutiveLosses ?? 0,
      sharpeRatio: s.sharpeRatio ?? 0,
      lrCorrelation: s.lrCorrelation ?? 0,
      netProfit: s.netProfit ?? 0
    }));
  }, [riskApiData]);

  const marginExposureDataLive = marginExposureData.length > 0 ? marginExposureData : (riskApiData?.charts?.marginExposure || []);
  const correlatedDdDataLive = lightChartsData?.correlatedDrawdown || (riskApiData?.charts?.correlatedDrawdown || []);
  const symbolDivergenceDataLive = lightChartsData?.symbolDivergence || (riskApiData?.charts?.symbolDivergence || []);
  const marketNeutralLive = riskApiData?.charts?.marketNeutral || [];
  const doubleExposureDataLive = doubleExposureData.length > 0 ? doubleExposureData : (riskApiData?.charts?.doubleExposure || []);
  const assetConcentrationLive = riskApiData?.charts?.assetConcentration || [];
  const strategyDominanceLive = riskApiData?.charts?.strategyDominance || [];

  const doubleExposureDataLiveFormatted = useMemo(() => {
    return doubleExposureDataLive.map((item) => {
      const pct = Number(item.pct || 0);
      return {
        ...item,
        pct,
        singlePct: Math.max(0, 100 - pct)
      };
    });
  }, [doubleExposureDataLive]);

  const strategyDominanceLiveFormatted = useMemo(() => {
    return strategyDominanceLive.map((item) => {
      const formattedId = item.id ? item.id.replace(/\|backtest_(.+)$/, ' ($1)').replace('|', ' ') : 'N/A';
      return {
        ...item,
        formattedId,
        id: formattedId // Override id to use the formatted version
      };
    });
  }, [strategyDominanceLive]);

  const xDomainMax = useMemo(() => {
    const maxPct = Math.max(...strategyDominanceLive.map((d) => Number(d.pct || 0)), 15);
    return Math.ceil(maxPct * 1.25);
  }, [strategyDominanceLive]);

  const totalStrategiesChecked = useMemo(() => {
    return riskApiData?.summary?.totalStrategies ?? allStrategiesLive.length;
  }, [riskApiData, allStrategiesLive]);

  const hardStratsCount = useMemo(() => {
    return allStrategiesLive.filter((s) => s.hardCount > 0).length;
  }, [allStrategiesLive]);

  const softStratsCount = useMemo(() => {
    return allStrategiesLive.filter((s) => s.softCount > 0).length;
  }, [allStrategiesLive]);

  const portfolioSnapshot = useMemo(() => {
    const peakMarginExposure = marginExposureDataLive.reduce((best, entry) => {
      if (!best || Number(entry.count || 0) > Number(best.count || 0)) return entry;
      return best;
    }, null);

    const totalMonths = correlatedDdDataLive.length;
    const years = totalMonths > 0 ? totalMonths / 12 : 1;
    const rawTotalDays = correlatedDdDataLive.reduce((sum, entry) => sum + Number(entry.days || 0), 0);
    const correlatedLossDays = Math.round(rawTotalDays / years);
    const doubleExposureHotspots = doubleExposureDataLive.filter((entry) => Number(entry.pct || 0) > 5).length;

    // Calculate highest and lowest overlap percentage
    const sortedOverlap = [...doubleExposureDataLive].filter((d) => d.pct != null).sort((a, b) => Number(b.pct || 0) - Number(a.pct || 0));
    const highestOverlap = sortedOverlap[0] || null;
    const lowestOverlap = sortedOverlap[sortedOverlap.length - 1] || null;

    const topAsset = assetConcentrationLive[0] || { symbol: 'N/A', value: 0 };
    const marketNeutralBuy = Number(marketNeutralLive[0]?.value || 0);
    const marketNeutralSell = Number(marketNeutralLive[1]?.value || 0);
    const topDominance = strategyDominanceLiveFormatted[0] || { id: 'N/A', pct: 0 };

    const marginLimit = Math.max(10, Math.round(totalStrategiesChecked * 0.15));
    const maxExposure = Math.max(...marginExposureDataLive.map((d) => Number(d.count || 0)), marginLimit * 1.25);

    return {
      peakMarginExposure,
      correlatedLossDays,
      doubleExposureHotspots,
      highestOverlapSymbol: highestOverlap ? highestOverlap.pair : 'N/A',
      highestOverlapPct: highestOverlap ? Number(highestOverlap.pct || 0).toFixed(0) : 0,
      lowestOverlapSymbol: lowestOverlap ? lowestOverlap.pair : 'N/A',
      lowestOverlapPct: lowestOverlap ? Number(lowestOverlap.pct || 0).toFixed(0) : 0,
      topAsset,
      marketNeutralBuy,
      marketNeutralSell,
      marketNeutralRatio: `${Math.round(marketNeutralBuy)}:${Math.round(marketNeutralSell)}`,
      marketNeutralRating: marketNeutralBuy >= 45 && marketNeutralBuy <= 55 ? 'Perfect' : 'Warning',
      topDominance,
      marginLimit,
      maxExposure
    };
  }, [
    assetConcentrationLive,
    correlatedDdDataLive,
    doubleExposureDataLive,
    marginExposureDataLive,
    marketNeutralLive,
    strategyDominanceLive,
    totalStrategiesChecked
  ]);

  // Tab views: 'single-flags' | 'strategy-view' | 'portfolio-checks' | 'volume-optimization'
  const [currentView, setCurrentView] = useState('single-flags');

  // Volume Optimization States
  const {
    loading: lotLoading,
    error: lotError,
    fetchOptimal,
    fetchResults,
    fetchTimeRange,
    fetchRuns,
    removeRun,
    triggerAnalysis,
    checkStatus,
    selectCandidate: selectLotCandidate,
    resetCandidate: resetLotCandidate
  } = useLotThreshold();

  const [lotPage, setLotPage] = useState(0); // 0-indexed for MUI TablePagination
  const [lotPageSize, setLotPageSize] = useState(50);
  const [lotOptimalData, setLotOptimalData] = useState([]);
  const [lotAnalysisTimeRange, setLotAnalysisTimeRange] = useState(null);
  const [lotAnalysisRuns, setLotAnalysisRuns] = useState([]);
  const [selectedLotAnalysisRunId, setSelectedLotAnalysisRunId] = useState('');
  const [lotTotalCount, setLotTotalCount] = useState(0);
  const [lotSearch, setLotSearch] = useState('');
  const [lotSearchInput, setLotSearchInput] = useState('');
  const [lotSymbol, setLotSymbol] = useState('all');
  const [lotWarningFilter, setLotWarningFilter] = useState('all');
  const [configSettings, setConfigSettings] = useState(() => {
    try {
      const stored = localStorage.getItem('lotThresholdSettings');
      if (stored) {
        const parsed = JSON.parse(stored);
        const hasOldConfig = parsed.configs && Object.values(parsed.configs).some(c => c.minVol === 10 && c.maxVol === 100);
        if (hasOldConfig) {
          localStorage.setItem('lotThresholdSettings', JSON.stringify(DEFAULT_LOT_SETTINGS));
          return DEFAULT_LOT_SETTINGS;
        }
        return parsed;
      }
      return DEFAULT_LOT_SETTINGS;
    } catch {
      return DEFAULT_LOT_SETTINGS;
    }
  });

  const [selectedLotStrategy, setSelectedLotStrategy] = useState(null); // { strategy_id, source_table, symbol }
  const [lotCurveData, setLotCurveData] = useState([]);
  const [loadingCurve, setLoadingCurve] = useState(false);

  const applyLotSelectionResult = useCallback((row) => {
    setLotOptimalData((current) => current.map((item) => (
      item.strategy_id === row.strategy_id && item.source_table === row.source_table
        ? { ...item, ...row }
        : item
    )));
    setSelectedLotStrategy((current) => current ? { ...current, ...row } : row);
    setLotCurveData((current) => current.map((candidate) => ({
      ...candidate,
      the_chosen_one: Number(candidate.lot_threshold) === Number(row.lot_threshold)
    })));
  }, []);

  const handleSelectLotCandidate = useCallback(async (candidate) => {
    const response = await selectLotCandidate({
      analysisRunId: selectedLotAnalysisRunId,
      strategyId: selectedLotStrategy.strategy_id,
      sourceTable: selectedLotStrategy.source_table,
      lotThreshold: candidate.lot_threshold
    });
    applyLotSelectionResult(response.data);
    return response.data;
  }, [applyLotSelectionResult, selectLotCandidate, selectedLotAnalysisRunId, selectedLotStrategy]);

  const handleResetLotCandidate = useCallback(async () => {
    const response = await resetLotCandidate({
      analysisRunId: selectedLotAnalysisRunId,
      strategyId: selectedLotStrategy.strategy_id,
      sourceTable: selectedLotStrategy.source_table
    });
    applyLotSelectionResult(response.data);
    return response.data;
  }, [applyLotSelectionResult, resetLotCandidate, selectedLotAnalysisRunId, selectedLotStrategy]);

  // Polling states
  const [lotSyncing, setLotSyncing] = useState(false);
  const [lotProgress, setLotProgress] = useState(0);
  const [lotCurrentFile, setLotCurrentFile] = useState(null);
  const [lotStats, setLotStats] = useState(null);
  const [lotRunNameDialogOpen, setLotRunNameDialogOpen] = useState(false);
  const [lotRunNameInput, setLotRunNameInput] = useState('');
  const [lotDeleteRunDialogOpen, setLotDeleteRunDialogOpen] = useState(false);
  const [lotDeleteRunTarget, setLotDeleteRunTarget] = useState(null);
  const [lotDeletingRunId, setLotDeletingRunId] = useState(null);
  const lotPollingRef = React.useRef(null);
  const lotDataRequestRef = React.useRef(0);

  const selectedLotSourceTables = useMemo(() => {
    const storedSources = getStoredDashboardSources([]);
    if (storedSources.length > 0) return storedSources;
    return selectedTable && selectedTable !== 'all_backtests' ? [selectedTable] : [];
  }, [selectedTable, dashboardSourcesRevision]);

  // Load distinct symbols list for dropdown
  const distinctSymbols = useMemo(() => {
    if (!allStrategiesLive) return [];
    const syms = allStrategiesLive.map((s) => s.symbol).filter(Boolean);
    return Array.from(new Set(syms)).sort();
  }, [allStrategiesLive]);

  // Load optimal data
  const loadOptimalData = useCallback(async ({ analysisRunId: runIdOverride } = {}) => {
    const requestId = ++lotDataRequestRef.current;
    const isCurrentRequest = () => requestId === lotDataRequestRef.current;
    try {
      const activeRunId = runIdOverride || selectedLotAnalysisRunId || '';
      const activeRun = lotAnalysisRuns.find((run) => run.analysis_run_id === activeRunId);
      const runSourceTables = Array.isArray(activeRun?.source_tables) ? activeRun.source_tables : [];
      const hasMatchingRun = Boolean(activeRunId && activeRun)
        && hasExactSourceTables(selectedLotSourceTables, runSourceTables);

      if (!hasMatchingRun) {
        if (!isCurrentRequest()) return;
        setLotOptimalData([]);
        setLotTotalCount(0);
        setSelectedLotStrategy(null);
        return;
      }

      const params = {
        page: lotPage + 1, // backend is 1-indexed
        pageSize: lotPageSize,
        analysisRunId: activeRunId || undefined,
      };
      if (lotSymbol !== 'all') params.symbol = lotSymbol;
      if (lotSearch) params.strategyId = lotSearch;
      if (lotWarningFilter === 'warning') params.isFallback = true;
      if (lotWarningFilter === 'normal') params.isFallback = false;
      if (selectedTable && selectedTable !== 'all_backtests') {
        params.sourceTable = selectedTable;
      }

      const res = await fetchOptimal(params);
      if (!isCurrentRequest()) return;
      setLotOptimalData(res.data || []);
      setLotTotalCount(res.pagination?.total || 0);

      if (res.data && res.data.length > 0) {
        const selectedStillVisible = selectedLotStrategy && res.data.some(
          (row) => row.strategy_id === selectedLotStrategy.strategy_id
            && row.source_table === selectedLotStrategy.source_table
        );
        if (!selectedStillVisible) setSelectedLotStrategy(res.data[0]);
      }
    } catch (err) {
      console.error('Failed to load optimal lot threshold data:', err);
    }
  }, [lotPage, lotPageSize, lotSymbol, lotSearch, lotWarningFilter, selectedLotStrategy, selectedLotAnalysisRunId, selectedLotSourceTables, lotAnalysisRuns, fetchOptimal, selectedTable]);

  useEffect(() => {
    if (currentView === 'volume-optimization') {
      loadOptimalData();
    }
  }, [currentView, lotPage, lotPageSize, lotSymbol, lotSearch, lotWarningFilter, selectedTable, selectedLotAnalysisRunId, selectedLotSourceTables, lotAnalysisRuns]);

  useEffect(() => {
    if (currentView !== 'volume-optimization') return;

    fetchRuns()
      .then((response) => {
        const runs = response.data || [];
        setLotAnalysisRuns(runs);
        const matchingRuns = runs.filter((run) => hasExactSourceTables(selectedLotSourceTables, run.source_tables));
        if (!matchingRuns.some((run) => run.analysis_run_id === selectedLotAnalysisRunId)) {
          setSelectedLotAnalysisRunId(matchingRuns[0]?.analysis_run_id || '');
          setSelectedLotStrategy(null);
        }
      })
      .catch(() => setLotAnalysisRuns([]));
  }, [currentView, selectedTable, dashboardSourcesRevision, selectedLotSourceTables, fetchRuns]);

  const handleSelectLotAnalysisRun = useCallback((analysisRunId) => {
    setSelectedLotAnalysisRunId(analysisRunId);
    setSelectedLotStrategy(null);
  }, []);

  const matchingLotAnalysisRuns = useMemo(
    () => lotAnalysisRuns.filter((run) => hasExactSourceTables(selectedLotSourceTables, run.source_tables)),
    [lotAnalysisRuns, selectedLotSourceTables]
  );

  useEffect(() => {
    if (currentView !== 'volume-optimization') return;

    fetchTimeRange()
      .then(setLotAnalysisTimeRange)
      .catch(() => setLotAnalysisTimeRange(null));
  }, [currentView, fetchTimeRange]);

  // Khi đổi bảng hoặc quay về All Backtests, không giữ strategy/đường cong
  // của bảng trước đó. Biểu đồ chỉ được phép hiển thị sau khi chọn bảng cụ thể.
  useEffect(() => {
    setSelectedLotStrategy(null);
    setLotCurveData([]);
  }, [selectedTable]);

  // Debounce strategy search input
  useEffect(() => {
    const t = setTimeout(() => {
      setLotSearch(lotSearchInput);
      setLotPage(0); // reset page
    }, 300);
    return () => clearTimeout(t);
  }, [lotSearchInput]);

  // Load P/D curve for selected strategy
  useEffect(() => {
    if (currentView !== 'volume-optimization' || !selectedLotStrategy) return;

    let active = true;
    const loadCurve = async () => {
      try {
        setLoadingCurve(true);
        const res = await fetchResults({
          analysisRunId: selectedLotAnalysisRunId || undefined,
          strategyId: selectedLotStrategy.strategy_id,
          sourceTable: selectedLotStrategy.source_table,
          pageSize: 1000, // retrieve all thresholds
          sortBy: 'volume_threshold',
          sortDir: 'asc'
        });
        if (active) {
          const rawData = res.data || [];
          const hasZero = rawData.some(d => Number(d.volume_threshold) === 0);
          
          let processedData = [];
          if (hasZero) {
            processedData = rawData.map(d => {
              if (Number(d.volume_threshold) === 0) {
                return {
                  ...d,
                  pd_ratio: 0,
                  max_drawdown: 0
                };
              }
              return {
                ...d,
                pd_ratio: d.pd_ratio !== null && d.pd_ratio !== undefined ? Number(d.pd_ratio) : null,
                max_drawdown: d.max_drawdown !== null && d.max_drawdown !== undefined ? Number(d.max_drawdown) : null
              };
            });
          } else {
            const startPoint = {
              volume_threshold: 0,
              lot_threshold: 0,
              pd_ratio: 0,
              max_drawdown: 0,
              total_profit: 0,
              total_trades: 0,
              winrate: 0
            };
            processedData = [
              startPoint,
              ...rawData.map(d => ({
                ...d,
                pd_ratio: d.pd_ratio !== null && d.pd_ratio !== undefined ? Number(d.pd_ratio) : null,
                max_drawdown: d.max_drawdown !== null && d.max_drawdown !== undefined ? Number(d.max_drawdown) : null
              }))
            ];
          }
          setLotCurveData(processedData);
        }
      } catch (err) {
        console.error('Failed to load curve data:', err);
      } finally {
        if (active) setLoadingCurve(false);
      }
    };
    loadCurve();
    return () => {
      active = false;
    };
  }, [currentView, selectedLotStrategy, selectedLotAnalysisRunId, fetchResults]);



  const handleRunLotAnalysis = () => {
    if (lotSyncing) return;
    const defaultRunName = buildDefaultLotRunName(selectedLotSourceTables);
    setLotRunNameInput(defaultRunName);
    setLotRunNameDialogOpen(true);
  };

  const confirmRunLotAnalysis = async () => {
    if (lotSyncing) return;
    setLotRunNameDialogOpen(false);
    setLotSyncing(true);
    setLotProgress(0);
    setLotCurrentFile(null);
    setLotStats(null);

    try {
      const defaultRunName = buildDefaultLotRunName(selectedLotSourceTables);
      const runName = lotRunNameInput.trim() || defaultRunName;
      const userStr = localStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;
      const username = user?.username || 'UNKNOWN';
      const sourceTables = selectedLotSourceTables.length > 0 ? selectedLotSourceTables : null;

      const { syncId, analysisRunId, run } = await triggerAnalysis({
        username,
        name: runName.trim() || defaultRunName,
        sourceTables,
        configs: configSettings.configs
      });
      if (analysisRunId) {
        setSelectedLotAnalysisRunId(analysisRunId);
        setSelectedLotStrategy(null);
        if (run) setLotAnalysisRuns((prev) => [run, ...prev.filter((item) => item.analysis_run_id !== analysisRunId)]);
      }

      lotPollingRef.current = setInterval(async () => {
        try {
          const status = await checkStatus(syncId);
          setLotProgress(status.progress || 0);
          setLotCurrentFile(status.currentFile);
          setLotStats({
            total: status.totalFiles,
            processed: status.processedFiles,
            success: status.successFiles,
            failed: status.failedFiles
          });

          if (status.status === 'COMPLETED') {
            clearInterval(lotPollingRef.current);
            setLotSyncing(false);
            await loadOptimalData({ analysisRunId });
            const runsResponse = await fetchRuns();
            setLotAnalysisRuns(runsResponse.data || []);
          } else if (status.status === 'FAILED') {
            clearInterval(lotPollingRef.current);
            setLotSyncing(false);
            setAlertMessage(`Lỗi chạy phân tích: ${status.error || 'Unknown error'}`);
            setAlertOpen(true);
          }
        } catch (err) {
          console.error('Polling error:', err);
          if (err.message.includes('not found')) {
            clearInterval(lotPollingRef.current);
            setLotSyncing(false);
          }
        }
      }, 1500);
    } catch (err) {
      setLotSyncing(false);
      setAlertMessage(`Lỗi: ${err.message}`);
      setAlertOpen(true);
    }
  };

  const requestDeleteLotAnalysisRun = () => {
    const run = lotAnalysisRuns.find((item) => item.analysis_run_id === selectedLotAnalysisRunId);
    if (!run || run.status === 'RUNNING' || lotDeletingRunId) return;
    setLotDeleteRunTarget(run);
    setLotDeleteRunDialogOpen(true);
  };

  const confirmDeleteLotAnalysisRun = async () => {
    if (!lotDeleteRunTarget || lotDeletingRunId) return;
    const deleteTarget = lotDeleteRunTarget;
    const deleteTargetId = deleteTarget.analysis_run_id;
    setLotDeletingRunId(deleteTargetId);
    // Invalidate any result request that was started before the delete.
    lotDataRequestRef.current += 1;
    setLotOptimalData([]);
    setLotTotalCount(0);
    setLotCurveData([]);
    setLotAnalysisTimeRange(null);
    setSelectedLotStrategy(null);

    try {
      await removeRun(deleteTargetId);
      const remainingRuns = lotAnalysisRuns.filter((item) => item.analysis_run_id !== deleteTargetId);
      setLotAnalysisRuns(remainingRuns);
      if (selectedLotAnalysisRunId === deleteTargetId) {
        const nextRun = remainingRuns.find((run) => hasExactSourceTables(selectedLotSourceTables, run.source_tables));
        setSelectedLotAnalysisRunId(nextRun?.analysis_run_id || '');
      }
      setAlertMessage('Đã xóa lần phân tích và toàn bộ kết quả Lot Threshold thành công.');
      setAlertOpen(true);
    } catch (err) {
      // Restore the selected run's data when the delete request fails.
      setSelectedLotAnalysisRunId(deleteTargetId);
      await loadOptimalData({ analysisRunId: deleteTargetId }).catch(() => {});
      setAlertMessage(`Lỗi xóa lần phân tích: ${err.message}`);
      setAlertOpen(true);
    } finally {
      setLotDeletingRunId(null);
      setLotDeleteRunDialogOpen(false);
      setLotDeleteRunTarget(null);
    }
  };

  // Clean interval on unmount
  useEffect(() => {
    return () => {
      if (lotPollingRef.current) {
        clearInterval(lotPollingRef.current);
      }
    };
  }, []);

  // Expanded state for Bot View rows
  const [expandedBotRows, setExpandedBotRows] = useState({});
  const handleToggleBotRow = (botId) => {
    setExpandedBotRows((prev) => ({ ...prev, [botId]: !prev[botId] }));
  };

  // Tier collapse state (thay đổi 2: nhóm tier có thể collapse)
  const [tierCollapsed, setTierCollapsed] = useState({ hard: false, soft: false });
  const toggleTier = (tier) => setTierCollapsed((prev) => ({ ...prev, [tier]: !prev[tier] }));

  // Expandable row state for Hard Flags & Soft Flags
  const [expandedHardRow, setExpandedHardRow] = useState(null);
  const [expandedSoftRow, setExpandedSoftRow] = useState(null);

  // Strategy View filters state (raised to index.jsx for drill-down support)
  const [stratSearchInput, setStratSearchInput] = useState('');
  const [stratSearch, setStratSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [specificRiskFilter, setSpecificRiskFilter] = useState([]);

  // Strategy View: highlight risk từ drill-down ngược
  const [highlightedRiskId, setHighlightedRiskId] = useState(null);

  // Sleek search state for expanded details in Risk View
  const [detailsSearch, setDetailsSearch] = useState('');

  // Page state map for expanded details tables inside Risk View
  const [detailsPages, setDetailsPages] = useState({});

  const handleDetailsPageChange = (indicatorId, newPage) => {
    setDetailsPages((prev) => ({ ...prev, [indicatorId]: newPage }));
  };

  // Explanation Dialog popup states
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpTitle, setHelpTitle] = useState('');
  const [helpContent, setHelpContent] = useState('');

  // Trigger Dialog Explainer
  const openHelpModal = (title, content) => {
    setHelpTitle(title);
    setHelpContent(content);
    setHelpOpen(true);
  };

  const handleToggleHardRow = (rowId) => {
    setDetailsSearch('');
    setDetailsPages((prev) => ({ ...prev, [rowId]: 1 }));
    setExpandedHardRow(expandedHardRow === rowId ? null : rowId);
  };

  const handleToggleSoftRow = (rowId) => {
    setDetailsSearch('');
    setDetailsPages((prev) => ({ ...prev, [rowId]: 1 }));
    setExpandedSoftRow(expandedSoftRow === rowId ? null : rowId);
  };

  // Click-through drill-down: Risk View → Strategy View
  const handleSelectStrategy = (stratId) => {
    setStratSearchInput(stratId);
    setStratSearch(stratId);
    setPriorityFilter('all');
    setSpecificRiskFilter([]);
    setCurrentView('strategy-view');
  };

  // Drill-down ngược: Strategy View → Risk View (highlight risk cụ thể)
  const handleGoToRisk = (riskId, tier) => {
    setHighlightedRiskId(riskId);
    setCurrentView('single-flags');
    if (tier === 'hard') {
      setExpandedHardRow(riskId);
      setTierCollapsed((prev) => ({ ...prev, hard: false }));
    } else {
      setExpandedSoftRow(riskId);
      setTierCollapsed((prev) => ({ ...prev, soft: false }));
    }
    // Auto-clear highlight sau 3s
    setTimeout(() => setHighlightedRiskId(null), 3000);
  };

  const makeStrategyKey = (backtest, id) => `${backtest || ''}:${id}`;

  // Build risk map: strategyId → { hard: [{riskId, title, val}], soft: [...] }
  const strategyRiskMap = useMemo(() => {
    const map = {};
    // Build a lookup for hard flag metadata (id → title)
    const hardFlagMeta = {};
    hardFlagsLive.forEach((flag) => {
      hardFlagMeta[flag.id] = flag;
    });

    allStrategiesLive.forEach((s) => {
      const key = makeStrategyKey(s.backtest, s.id);
      map[key] = { hard: [], soft: [] };
    });
    // 1. Populate from hardFlags strats lists (has val details)
    hardFlagsLive.forEach((flag) => {
      flag.strats.forEach((s) => {
        const key = makeStrategyKey(s.backtest, s.id);
        if (map[key]) map[key].hard.push({ riskId: flag.id, title: flag.title, val: s.val });
      });
    });
    // 2. Fill in any missing hard flags from per-strategy hardFlags array
    //    (handles strategies beyond the 500-item truncation in flag strats)
    allStrategiesLive.forEach((s) => {
      const key = makeStrategyKey(s.backtest, s.id);
      if (!s.hardFlags || s.hardFlags.length === 0 || !map[key]) return;
      const existing = new Set(map[key].hard.map((r) => r.riskId));
      s.hardFlags.forEach((flagId) => {
        if (!existing.has(String(flagId))) {
          const meta = hardFlagMeta[String(flagId)];
          map[key].hard.push({
            riskId: String(flagId),
            title: meta?.title || `Hard Flag #${flagId}`,
            val: ''
          });
        }
      });
    });
    softFlagsLive.forEach((flag) => {
      flag.strats.forEach((s) => {
        const key = makeStrategyKey(s.backtest, s.id);
        if (map[key]) {
          map[key].soft.push({
            riskId: flag.id,
            title: flag.title,
            val: s.val,
            penalty: Number(flag.penalty ?? 10)
          });
        }
      });
    });
    return map;
  }, [allStrategiesLive, hardFlagsLive, softFlagsLive]);

  // Pre-compute priority score for every strategy (reused in filter + render)
  const strategyPriorityMap = useMemo(() => {
    const map = {};
    allStrategiesLive.forEach((s) => {
      const key = makeStrategyKey(s.backtest, s.id);
      const risks = strategyRiskMap[key] || { hard: [], soft: [] };
      const hasHardFlags = risks.hard.length > 0 || (s.hardCount ?? 0) > 0;
      if (hasHardFlags) {
        map[key] = 0;
      } else {
        const penalty = risks.soft.reduce((acc, r) => acc + Number(r.penalty ?? 10), 0);
        const scoreAfterPenalty = Math.max(0, 100 - penalty);
        const softCount = Math.max(risks.soft.length, Number(s.softCount || 0));
        map[key] = softCount >= 3 ? Math.min(49, scoreAfterPenalty) : scoreAfterPenalty;
      }
    });
    return map;
  }, [allStrategiesLive, strategyRiskMap]);

  const strategyFinalScoreMap = useMemo(() => {
    if (!allStrategiesLive || allStrategiesLive.length === 0) return {};

    // 1. Chuẩn hóa các chỉ số trên toàn bộ allStrategiesLive
    const pfNorm = normalizeMetric(allStrategiesLive, 'pf');
    const rfNorm = normalizeMetric(allStrategiesLive, 'rf');
    const pdNorm = normalizeMetric(allStrategiesLive, 'pd');
    const epNorm = normalizeMetric(allStrategiesLive, 'ep');
    const lrNorm = normalizeMetric(allStrategiesLive, 'lrCorrelation');

    const sharpeNorm = {};
    const concentrationNorm = {};

    allStrategiesLive.forEach((s) => {
      const key = makeStrategyKey(s.backtest, s.id);
      sharpeNorm[key] = getSharpeScore(s.sharpeRatio || 0);
      const profit = s.netProfit || 0;
      const largestLoss = Math.abs(s.largestLossTrade || 0);
      const coverage = largestLoss > 0 ? Math.abs(profit) / largestLoss : 0;
      concentrationNorm[key] = getConcentrationScore(coverage);
    });

    const scoreMap = {};
    allStrategiesLive.forEach((s) => {
      const key = makeStrategyKey(s.backtest, s.id);
      const performanceScore = Number(
        (
          (sharpeNorm[key] || 0) * 0.16 +
          (pfNorm[key] || 0) * 0.16 +
          (rfNorm[key] || 0) * 0.16 +
          (pdNorm[key] || 0) * 0.18 +
          (concentrationNorm[key] || 0) * 0.18 +
          (epNorm[key] || 0) * 0.08 +
          (lrNorm[key] || 0) * 0.08
        ).toFixed(2)
      );

      scoreMap[key] = Math.max(0, performanceScore);
    });

    return scoreMap;
  }, [allStrategiesLive]);

  const botViewData = useMemo(() => {
    if (!allStrategiesLive || allStrategiesLive.length === 0) return [];

    const groups = {};
    allStrategiesLive.forEach((s) => {
      const botId = s.id.substring(0, 3); // Lấy 3 chữ số đầu làm mã bot gốc
      if (!groups[botId]) {
        groups[botId] = [];
      }
      groups[botId].push(s);
    });

    return Object.entries(groups)
      .map(([botId, strats]) => {
        const totalConfigs = strats.length;
        let passedCount = 0;
        let warningCount = 0;
        let disqualifiedCount = 0;
        let sumPriority = 0;
        let sumFinalScore = 0;
        let totalProfit = 0;
        let sumPf = 0;
        let maxDrawdown = 0;
        let totalTrades = 0;

        strats.forEach((s) => {
          const key = makeStrategyKey(s.backtest, s.id);
          const priorityScore = strategyPriorityMap[key] ?? 0;
          const finalScore = strategyFinalScoreMap[key] ?? 0;
          sumPriority += priorityScore;
          sumFinalScore += finalScore;
          totalProfit += s.netProfit || 0;
          sumPf += s.pf || 0;
          maxDrawdown = Math.max(maxDrawdown, s.drawdownPct || 0);
          totalTrades += s.trades || 0;

          if (priorityScore >= 80) {
            passedCount++;
          } else if (priorityScore >= 50) {
            warningCount++;
          } else {
            disqualifiedCount++;
          }
        });

        const avgPriority = totalConfigs > 0 ? Math.round(sumPriority / totalConfigs) : 0;
        const avgFinalScore = totalConfigs > 0 ? Number((sumFinalScore / totalConfigs).toFixed(2)) : 0;
        const avgPf = totalConfigs > 0 ? Number((sumPf / totalConfigs).toFixed(2)) : 0;

        // Đánh giá chung cho dòng bot
        let overallStatus = 'MONITOR';
        let statusColor = 'warning';
        const passedRate = (passedCount / totalConfigs) * 100;
        const disqualifiedRate = (disqualifiedCount / totalConfigs) * 100;

        if (passedRate >= 70) {
          overallStatus = 'EXCELLENT';
          statusColor = 'success';
        } else if (passedRate >= 40) {
          overallStatus = 'GOOD';
          statusColor = 'info';
        } else if (disqualifiedRate >= 50) {
          overallStatus = 'DISQUALIFIED';
          statusColor = 'error';
        }

        return {
          botId,
          totalConfigs,
          passedCount,
          warningCount,
          disqualifiedCount,
          avgPriority,
          avgFinalScore,
          totalProfit,
          avgPf,
          maxDrawdown,
          totalTrades,
          overallStatus,
          statusColor,
          strats: strats.sort((a, b) => {
            const keyB = makeStrategyKey(b.backtest, b.id);
            const keyA = makeStrategyKey(a.backtest, a.id);
            return (strategyPriorityMap[keyB] ?? 0) - (strategyPriorityMap[keyA] ?? 0);
          })
        };
      })
      .sort((a, b) => b.avgPriority - a.avgPriority);
  }, [allStrategiesLive, strategyPriorityMap, strategyFinalScoreMap]);



  const passedStrategiesCount =
    riskApiData?.summary?.passedStrategies ?? allStrategiesLive.filter((s) => s.hardCount === 0).length;
  const disqualifiedStrategiesCount =
    riskApiData?.summary?.hardFlaggedStrategies ?? allStrategiesLive.filter((s) => s.hardCount > 0).length;
  const disqualificationRate =
    totalStrategiesChecked > 0 ? ((disqualifiedStrategiesCount / totalStrategiesChecked) * 100).toFixed(1) : '0.0';

  const warningStrategiesCount =
    riskApiData?.summary?.warningStrategies ??
    allStrategiesLive.filter((s) => s.hardCount === 0 && s.softCount > 0).length;
  const passedCleanStrategiesCount =
    riskApiData?.summary?.passedCleanStrategies ?? Math.max(0, passedStrategiesCount - warningStrategiesCount);



  const hasSelectedDataSources = getStoredDashboardSources([]).length > 0;

  if (!hasSelectedDataSources) {
    return (
      <Box sx={{ width: '100%', py: 1 }}>
        <DashboardFilterBar
          title="Risk Analysis"
          subtitle="— Portfolio & Strategy Diagnostics"
        showSelectedSourcesLabel={currentView === 'volume-optimization'}
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
            Vui lòng chọn ít nhất một Data Source để hiển thị dữ liệu Risk Analysis.
          </Typography>
        </Box>
      </Box>
    );
  }

  const allRiskRequestsFinished = !loading && !marginLoading && !doubleLoading && !lightChartsLoading;
  if (allRiskRequestsFinished && riskApiData && riskApiData.strategies?.length === 0 && !error) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 2 }}>
        <Typography variant="h6" color="text.secondary">
          Chưa có dữ liệu
        </Typography>
        <Typography variant="body2" color="text.disabled" sx={{ textAlign: 'center', px: 2 }}>
          Datasource đã chọn chưa có strategy có dữ liệu hợp lệ cho Risk Analysis.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', py: 1 }}>
      <DashboardFilterBar
        title="Risk Analysis"
        subtitle="— Portfolio & Strategy Diagnostics"
        showSelectedSourcesLabel={currentView === 'volume-optimization'}
      />

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
            bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#f1f5f9',
            p: 0.5,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            width: { xs: '100%', sm: 'fit-content' }
          })}
        >
          {[
            { id: 'single-flags', label: 'Risk View (Hard & Soft Flags)' },
            { id: 'strategy-view', label: 'Strategy View' },
            { id: 'portfolio-checks', label: 'Portfolio Checks' },
            { id: 'volume-optimization', label: 'Volume Optimization' }
          ].map((tab) => (
            <Button
              key={tab.id}
              onClick={() => setCurrentView(tab.id)}
              sx={(theme) => ({
                px: 1.5,
                py: 0.5,
                fontWeight: 600,
                fontSize: '0.75rem',
                color: currentView === tab.id ? '#ffffff' : theme.palette.text.primary,
                bgcolor: currentView === tab.id ? 'var(--tab-active-bg, #212A37)' : 'transparent',
                borderRadius: 1.5,
                textTransform: 'none',
                boxShadow: currentView === tab.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s',
                flexGrow: { xs: 1, sm: 0 },
                '&:hover': {
                  bgcolor:
                    currentView === tab.id
                      ? 'var(--tab-active-hover-bg, #1565C0)'
                      : theme.palette.mode === 'light'
                        ? 'rgba(31, 56, 100, 0.10)'
                        : 'var(--tab-inactive-hover-bg, rgba(255,255,255,0.08))',
                  color: currentView === tab.id ? '#ffffff' : theme.palette.mode === 'light' ? '#1F3864' : '#e2e8f0'
                }
              })}
            >
              {tab.label}
            </Button>
          ))}
        </Box>
      </Box>

      {currentView === 'single-flags' && (
        <RiskViewTab
          totalStrategiesChecked={totalStrategiesChecked}
          passedCleanStrategiesCount={passedCleanStrategiesCount}
          warningStrategiesCount={warningStrategiesCount}
          disqualifiedStrategiesCount={disqualifiedStrategiesCount}
          disqualificationRate={disqualificationRate}
          handleOpenRemarks={handleOpenRemarks}
          selectedTable={selectedTable}
          dateRange={dateRange}
          passedStrategiesCount={passedStrategiesCount}
          toggleTier={toggleTier}
          hardFlagsLive={hardFlagsLive}
          hardStratsCount={hardStratsCount}
          openHelpModal={openHelpModal}
          tierCollapsed={tierCollapsed}
          renderHeaderActions={renderHeaderActions}
          expandedHardRow={expandedHardRow}
          highlightedRiskId={highlightedRiskId}
          HARD_FLAG_GROUPS={HARD_FLAG_GROUPS}
          handleToggleHardRow={handleToggleHardRow}
          detailsSearch={detailsSearch}
          setDetailsSearch={setDetailsSearch}
          detailsPages={detailsPages}
          handleDetailsPageChange={handleDetailsPageChange}
          allStrategiesLive={allStrategiesLive}
          handleSelectStrategy={handleSelectStrategy}
          softFlagsLive={softFlagsLive}
          softStratsCount={softStratsCount}
          expandedSoftRow={expandedSoftRow}
          SOFT_FLAG_GROUPS={SOFT_FLAG_GROUPS}
          handleToggleSoftRow={handleToggleSoftRow}
          loading={loading}
        />
      )}

      {currentView === 'strategy-view' && (
        <StrategyViewTab
          allStrategiesLive={allStrategiesLive}
          strategyRiskMap={strategyRiskMap}
          strategyPriorityMap={strategyPriorityMap}
          hardFlagsLive={hardFlagsLive}
          softFlagsLive={softFlagsLive}
          passedCleanStrategiesCount={passedCleanStrategiesCount}
          handleGoToRisk={handleGoToRisk}
          isDarkMode={isDarkMode}
          theme={theme}
          openHelpModal={openHelpModal}
          PRIORITY_RULES_HELP={PRIORITY_RULES_HELP}
          HARD_FLAG_GROUPS={HARD_FLAG_GROUPS}
          SOFT_FLAG_GROUPS={SOFT_FLAG_GROUPS}
          FILTER_GROUPS={FILTER_GROUPS}
          loading={loading}
          stratSearchInput={stratSearchInput}
          setStratSearchInput={setStratSearchInput}
          stratSearch={stratSearch}
          setStratSearch={setStratSearch}
          priorityFilter={priorityFilter}
          setPriorityFilter={setPriorityFilter}
          specificRiskFilter={specificRiskFilter}
          setSpecificRiskFilter={setSpecificRiskFilter}
        />
      )}

      {/* ==========================================
          TAB 3: PORTFOLIO-LEVEL CHECKS
          ========================================== */}
      {currentView === 'portfolio-checks' && (
        <PortfolioChecksTab
          portfolioSnapshot={portfolioSnapshot}
          marginExposureDataLive={marginExposureDataLive}
          marginLoading={marginLoading}
          marginError={marginError}
          correlatedDdDataLive={correlatedDdDataLive}
          symbolDivergenceDataLive={symbolDivergenceDataLive}
          lightChartsLoading={lightChartsLoading}
          lightChartsError={lightChartsError}
          marketNeutralLive={marketNeutralLive}
          doubleExposureDataLiveFormatted={doubleExposureDataLiveFormatted}
          doubleLoading={doubleLoading}
          doubleError={doubleError}
          assetConcentrationLive={assetConcentrationLive}
          strategyDominanceLiveFormatted={strategyDominanceLiveFormatted}
          xDomainMax={xDomainMax}
          renderHeaderActions={renderHeaderActions}
          openHelpModal={openHelpModal}
          CORRELATED_DD_HELP={CORRELATED_DD_HELP}
          DOUBLE_EXPOSURE_HELP={DOUBLE_EXPOSURE_HELP}
        />
      )}

      {currentView === 'volume-optimization' && (
        <VolumeOptimizationTab
          lotSyncing={lotSyncing}
          lotCurrentFile={lotCurrentFile}
          lotProgress={lotProgress}
          configSettings={configSettings}
          setConfigSettings={setConfigSettings}
          isDarkMode={isDarkMode}
          handleRunLotAnalysis={handleRunLotAnalysis}
          selectedLotStrategy={selectedLotStrategy}
          setSelectedLotStrategy={setSelectedLotStrategy}
          loadingCurve={loadingCurve}
          lotCurveData={lotCurveData}
          onSelectLotCandidate={handleSelectLotCandidate}
          onResetLotCandidate={handleResetLotCandidate}
          analysisTimeRange={lotAnalysisRuns.find((run) => run.analysis_run_id === selectedLotAnalysisRunId) || lotAnalysisTimeRange}
          analysisRuns={matchingLotAnalysisRuns}
          selectedAnalysisRunId={selectedLotAnalysisRunId}
          setSelectedAnalysisRunId={handleSelectLotAnalysisRun}
          onRequestDeleteAnalysisRun={requestDeleteLotAnalysisRun}
          lotDeleting={Boolean(lotDeletingRunId)}
          distinctSymbols={distinctSymbols}
          lotOptimalData={lotOptimalData}
          lotLoading={lotLoading}
          lotTotalCount={lotTotalCount}
          lotPage={lotPage}
          setLotPage={setLotPage}
          lotPageSize={lotPageSize}
          setLotPageSize={setLotPageSize}
          lotSearchInput={lotSearchInput}
          setLotSearchInput={setLotSearchInput}
          lotSymbol={lotSymbol}
          setLotSymbol={setLotSymbol}
          lotWarningFilter={lotWarningFilter}
          setLotWarningFilter={setLotWarningFilter}
          handleOpenRemarks={handleOpenRemarks}
          openHelpModal={openHelpModal}
          theme={theme}
        />
      )}

      <Dialog
        open={lotDeleteRunDialogOpen}
        onClose={() => {
          if (!lotDeletingRunId) setLotDeleteRunDialogOpen(false);
        }}
        disableEscapeKeyDown={Boolean(lotDeletingRunId)}
        fullWidth
        maxWidth="xs"
        PaperProps={{ sx: { borderRadius: 3, p: 1, bgcolor: isDarkMode ? '#1e293b' : '#fff' } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Xóa lần phân tích?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Xóa <strong>{lotDeleteRunTarget?.name || lotDeleteRunTarget?.analysis_run_id}</strong> sẽ xóa toàn bộ kết quả Lot Threshold của lần chạy này.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
              <Button
                onClick={() => {
                  if (!lotDeletingRunId) setLotDeleteRunDialogOpen(false);
                }}
                color="inherit"
                disabled={Boolean(lotDeletingRunId)}
              >
                Hủy
              </Button>
          <Button
            onClick={confirmDeleteLotAnalysisRun}
            variant="contained"
            color="error"
            disabled={Boolean(lotDeletingRunId)}
            startIcon={lotDeletingRunId ? <CircularProgress size={15} color="inherit" /> : null}
          >
            {lotDeletingRunId ? 'Đang xóa...' : 'Xóa'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={lotRunNameDialogOpen}
        onClose={() => setLotRunNameDialogOpen(false)}
        fullWidth
        maxWidth="sm"
        PaperProps={{
          sx: {
            borderRadius: 3,
            p: 1,
            bgcolor: isDarkMode ? '#1e293b' : '#fff'
          }
        }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Tên lần chạy Volume Optimization</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Các bảng dữ liệu được chọn:
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
            {selectedLotSourceTables.length > 0 ? selectedLotSourceTables.map((tableName) => (
              <Chip
                key={tableName}
                label={tableName}
                size="small"
                variant="outlined"
                sx={isDarkMode ? { color: '#e2e8f0', borderColor: 'rgba(203, 213, 225, 0.5)' } : undefined}
              />
            )) : (
              <Chip label="Tất cả bảng backtest" size="small" color="primary" />
            )}
          </Box>
          <TextField
            autoFocus
            fullWidth
            value={lotRunNameInput}
            onChange={(event) => setLotRunNameInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                confirmRunLotAnalysis();
              }
            }}
            placeholder="Nhập tên lần chạy"
            inputProps={{ maxLength: 120 }}
            sx={{
              mt: 1,
              '& .MuiInputBase-input': {
                color: isDarkMode ? '#f8fafc' : 'inherit'
              },
              '& .MuiInputBase-input::placeholder': {
                color: isDarkMode ? '#94a3b8' : undefined,
                opacity: 1
              },
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: isDarkMode ? 'rgba(203, 213, 225, 0.5)' : undefined
              },
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: isDarkMode ? '#cbd5e1' : undefined
              },
              '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderColor: isDarkMode ? '#60a5fa' : undefined
              }
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={() => setLotRunNameDialogOpen(false)} color="inherit">
            Hủy
          </Button>
          <Button onClick={confirmRunLotAnalysis} variant="contained" disabled={!lotRunNameInput.trim()}>
            Khởi chạy
          </Button>
        </DialogActions>
      </Dialog>

      {/* GLOBAL EXPLANATION DIALOG MODAL */}
      <Dialog
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        PaperProps={{
          sx: {
            borderRadius: 3,
            p: 3.5,
            maxWidth: typeof helpContent === 'string' ? 460 : 540,
            width: '100%'
          }
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 2 }}>
          <InfoCircleOutlined style={{ fontSize: '22px', color: theme.palette.primary.main }} />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {helpTitle}
          </Typography>
        </Box>
        {typeof helpContent === 'string' ? (
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6, fontSize: '0.85rem', whiteSpace: 'pre-line' }}>
            {helpContent}
          </Typography>
        ) : (
          helpContent
        )}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3.5 }}>
          <Button
            variant="contained"
            onClick={() => setHelpOpen(false)}
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
      


      <DashboardRemarksDialog
        open={remarksOpen}
        onClose={() => setRemarksOpen(false)}
        title={remarksTitle}
        remarksId={remarksId}
        remarksType={remarksType}
        selectedTable={selectedTable}
        dateRange={dateRange}
      />

      <Dialog
        open={alertOpen}
        onClose={() => setAlertOpen(false)}
        PaperProps={{ sx: { borderRadius: 3, p: 1, minWidth: 320 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>Thông báo</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
            {alertMessage}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={() => setAlertOpen(false)} variant="contained" size="small" sx={{ borderRadius: 1.5, px: 3 }}>
            Đóng
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
