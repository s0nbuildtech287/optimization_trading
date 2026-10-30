import { Fragment, useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Dialog from '@mui/material/Dialog';
import CircularProgress from '@mui/material/CircularProgress';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import TablePagination from '@mui/material/TablePagination';
import Alert from '@mui/material/Alert';
import Collapse from '@mui/material/Collapse';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import MainCard from 'components/MainCard';
import DashboardKpiSummary from 'components/dashboard/DashboardKpiSummary';
import DashboardRemarksDialog from 'components/dashboard/DashboardRemarksDialog';
import { useTheme } from '@mui/material/styles';
import TrophyOutlined from '@ant-design/icons/TrophyOutlined';
import PieChartOutlined from '@ant-design/icons/PieChartOutlined';
import AuditOutlined from '@ant-design/icons/AuditOutlined';
import InfoCircleOutlined from '@ant-design/icons/InfoCircleOutlined';
import FallOutlined from '@ant-design/icons/FallOutlined';
import QuestionCircleOutlined from '@ant-design/icons/QuestionCircleOutlined';
import RobotOutlined from '@ant-design/icons/RobotOutlined';
import FileTextOutlined from '@ant-design/icons/FileTextOutlined';
import CalendarOutlined from '@ant-design/icons/CalendarOutlined';
import { useComparativeRanking } from 'hooks/useComparativeRanking';
import DashboardFilterBar from 'components/dashboard/DashboardFilterBar';
import { useBehaviorAnalysis } from 'hooks/useBehaviorAnalysis';
import CardLoader from 'components/CardLoader';
import { useBalanceChart } from 'hooks/useStrategy';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { getStoredDashboardTable, getStoredDashboardSources, getStoredDashboardDateRange } from 'utils/dashboardTable';
import RankingTab from './RankingTab';
import BotComparisonTab from './BotComparisonTab';
import DimensionTab from './DimensionTab';
import SeasonalityTab from './SeasonalityTab';

import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Pagination from '@mui/material/Pagination';

import SearchOutlined from '@ant-design/icons/SearchOutlined';
import DownOutlined from '@ant-design/icons/DownOutlined';
import UpOutlined from '@ant-design/icons/UpOutlined';

const VIEW_TABS = [
  { id: 'ranking', label: 'Ranking Strategy' },
  { id: 'ranking-bot', label: 'Strategy Bot' },
  { id: 'dimension', label: 'Dimensional view' },
  { id: 'seasonality', label: 'Temporal & Seasonality' }
];

const SYMBOLS_BEHAVIOR = ['EURUSD', 'XAUUSD', 'GBPUSD', 'GBPJPY', 'USDCAD', 'AUDUSD', 'USDJPY', 'BTCUSD'];
const TFS_BEHAVIOR = ['H1', 'H4'];
const DIRS_BEHAVIOR = ['OB', 'OS'];
const YEARS = ['2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026'];

const genStrategyIdBehavior = (i) => {
  const sym = SYMBOLS_BEHAVIOR[i % SYMBOLS_BEHAVIOR.length];
  const tf = TFS_BEHAVIOR[i % 2];
  const dir = DIRS_BEHAVIOR[i % 2];
  return `${String((i % 99) + 1).padStart(3, '0')}${sym}${tf}${dir}`;
};



const METRIC_OPTIONS = [
  { key: 'composite', label: 'Final Score' },
  { key: 'id', label: 'Strategy ID' },
  { key: 'sharpe', label: 'Sharpe' },
  { key: 'pf', label: 'Profit Factor' },
  { key: 'rf', label: 'Recovery Factor' },
  { key: 'pd', label: 'P/D Ratio' },
  { key: 'ep', label: 'Exp. Payoff' },
  { key: 'lr', label: 'LR Corr' },
  { key: 'concentrationScore', label: 'Profit Concentration' }
];

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
      success: { text: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' }, // Xanh lá sẫm
      warning: { text: '#b45309', bg: '#fffbeb', border: '#fef3c7' }, // Cam hổ phách sẫm
      error: { text: '#b91c1c', bg: '#fef2f2', border: '#fee2e2' }, // Đỏ mận sẫm
      info: { text: '#0369a1', bg: '#f0f9ff', border: '#e0f2fe' }  // Xanh dương sẫm
    };
  }
};

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(Number(value || 0));

const formatNumber = (value, digits = 2) => Number(value || 0).toFixed(digits);
const formatPositiveContribution = (value) => {
  const score = Number(value || 0);
  return Math.abs(score) < 0.005 ? '0.00' : `+${formatNumber(score)}`;
};
const getPerformanceQuality = (score) => {
  const value = Number(score || 0);
  if (value >= 80) return { label: 'Excellent', color: '#722ED1' };
  if (value >= 60) return { label: 'Good', color: '#52c41a' };
  if (value >= 35) return { label: 'Average', color: '#faad14' };
  return { label: 'Weak', color: '#ff4d4f' };
};
const safeNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const safeCurrency = (value) => {
  const n = safeNumber(value);
  return n == null ? '-' : formatCurrency(n);
};

const SCORE_LEVELS = [
  { label: '<35', color: '#ff4d4f' },
  { label: '35-59', color: '#faad14' },
  { label: '60-79', color: '#52c41a' },
  { label: '>=80', color: '#722ED1' }
];
const SHARPE_LEVELS = [
  { label: '<0.5 Kém', color: '#ff4d4f' },
  { label: '0.5-1 TB', color: '#faad14' },
  { label: '1-2 Tốt', color: '#52c41a' },
  { label: '2-3 R.Tốt', color: '#722ED1' },
  { label: '3-10 Phạt', color: '#fa8c16' },
  { label: '>=10 Flag', color: '#cf1322' }
];
const CONCENTRATION_LEVELS = [
  { label: '<1.0x', color: '#ff4d4f' },
  { label: '1.0-1.49x', color: '#faad14' },
  { label: '1.5-2.99x', color: '#52c41a' },
  { label: '>=3.0x', color: '#722ED1' }
];
const SCORE_GUIDE_ITEMS = [
  {
    label: 'Sharpe',
    note: 'Absolute score: optimal at 2.0-3.0 (100 pts), penalized if >3.0, and 0 pts if >=10.0 (Red Flag)',
    levels: SHARPE_LEVELS
  },
  { label: 'Profit Factor', note: 'Rank score, higher is better', levels: SCORE_LEVELS },
  { label: 'Recovery Factor', note: 'Rank score, higher is better', levels: SCORE_LEVELS },
  { label: 'P/D Ratio', note: 'Rank score, higher is better', levels: SCORE_LEVELS },
  { label: 'Exp. Payoff', note: 'Rank score, lower weight 8%', levels: SCORE_LEVELS },
  { label: 'LR Corr', note: 'Rank score, lower weight 8%', levels: SCORE_LEVELS },
  { label: 'Profit Concentration', note: 'Net profit / largest win', levels: CONCENTRATION_LEVELS }
];
const getFinalScoreValue = (row) => Number((row?.finalScore ?? row?.composite) || 0);

const getProfitConcentrationDetail = (row) => {
  const profit = Math.abs(Number(row?.profit || 0));
  const largestProfitTrade = Math.abs(Number(row?.largestProfitTrade || row?.largest_profit_trade || 0));
  const coverage = Number(row?.penalty?.concentrationCoverage || (profit > 0 && largestProfitTrade > 0 ? profit / largestProfitTrade : 0));
  if (!profit || !largestProfitTrade) return 'No positive net profit / largest win data';
  return `Net/Largest: ${formatNumber(coverage)}x | Net profit ${formatCurrency(profit)} / largest win ${formatCurrency(largestProfitTrade)} | Target >= 3.00x`;
};

const getProfitConcentrationScore = (row) => {
  const explicitScore = safeNumber(row?.normalized?.concentration ?? row?.concentrationScore);
  if (explicitScore != null) return explicitScore;
  const profit = Math.abs(Number(row?.profit || 0));
  const largestProfitTrade = Math.abs(Number(row?.largestProfitTrade || row?.largest_profit_trade || 0));
  const coverage = Number(row?.penalty?.concentrationCoverage || (profit > 0 && largestProfitTrade > 0 ? profit / largestProfitTrade : 0));
  if (!Number.isFinite(coverage) || coverage <= 0) return 0;
  if (coverage >= 3) return 100;
  if (coverage >= 2) return 60 + ((coverage - 2) / 1) * 19;
  if (coverage >= 1.5) return 35 + ((coverage - 1.5) / 0.5) * 24;
  if (coverage >= 1) return 10 + ((coverage - 1) / 0.5) * 24;
  return Math.min(100, Math.max(0, coverage * 10));
};

const getPerformanceBreakdown = (row) => [
  {
    key: 'sharpe',
    label: 'Sharpe',
    contribution: Number(row?.normalized?.sharpe || 0) * 0.16,
    raw: formatNumber(row?.sharpe),
    normalized: Number(row?.normalized?.sharpe || 0),
    weight: '16%',
    detail: 'Risk-adjusted return quality'
  },
  {
    key: 'pf',
    label: 'Profit Factor',
    contribution: Number(row?.normalized?.pf || 0) * 0.16,
    raw: formatNumber(row?.pf),
    normalized: Number(row?.normalized?.pf || 0),
    weight: '16%',
    detail: 'Gross profit versus gross loss'
  },
  {
    key: 'rf',
    label: 'Recovery Factor',
    contribution: Number(row?.normalized?.rf || 0) * 0.16,
    raw: formatNumber(row?.rf),
    normalized: Number(row?.normalized?.rf || 0),
    weight: '16%',
    detail: 'Profit recovery strength after drawdown'
  },
  {
    key: 'pd',
    label: 'P/D Ratio',
    contribution: Number(row?.normalized?.pd || 0) * 0.18,
    raw: formatNumber(row?.pd),
    normalized: Number(row?.normalized?.pd || 0),
    weight: '18%',
    detail: 'Higher profit per drawdown is better'
  },
  {
    key: 'concentration',
    label: 'Profit Concentration',
    contribution: getProfitConcentrationScore(row) * 0.18,
    raw: formatNumber(row?.penalty?.concentrationCoverage || 0) + 'x',
    normalized: getProfitConcentrationScore(row),
    weight: '18%',
    detail: getProfitConcentrationDetail(row)
  },
  {
    key: 'ep',
    label: 'Exp. Payoff',
    contribution: Number(row?.normalized?.ep || 0) * 0.08,
    raw: formatNumber(row?.ep),
    normalized: Number(row?.normalized?.ep || 0),
    weight: '8%',
    detail: 'Lower weight because payoff can be distorted by large one-off trades'
  },
  {
    key: 'lr',
    label: 'LR Corr',
    contribution: Number(row?.normalized?.lr || 0) * 0.08,
    raw: formatNumber(row?.lr),
    normalized: Number(row?.normalized?.lr || 0),
    weight: '8%',
    detail: 'Lower weight; used as supporting smoothness signal'
  }
];

const getStatusChip = (row, theme) => {
  const compositeVal = getFinalScoreValue(row);
  const isDarkMode = theme.palette.mode === 'dark';
  const colors = getSemanticColors(isDarkMode);

  if (compositeVal >= 70) {
    return (
      <Chip
        label="Deploy"
        size="small"
        sx={{
          bgcolor: colors.success.bg,
          color: colors.success.text,
          fontWeight: 800,
          border: `1px solid ${colors.success.border}`,
          borderRadius: 1.5
        }}
      />
    );
  }

  if (compositeVal >= 50) {
    return (
      <Chip
        label="Monitor"
        size="small"
        sx={{
          bgcolor: colors.info.bg,
          color: colors.info.text,
          fontWeight: 800,
          border: `1px solid ${colors.info.border}`,
          borderRadius: 1.5
        }}
      />
    );
  }

  return (
    <Chip
      label="Review"
      size="small"
      sx={{
        bgcolor: colors.error.bg,
        color: colors.error.text,
        fontWeight: 800,
        border: `1px solid ${colors.error.border}`,
        borderRadius: 1.5
      }}
    />
  );
};
const HARD_FLAG_DETAILS = {
  '1': { title: 'Expected Payoff <= 0', getVal: (s) => `EP: ${s.ep != null ? s.ep.toFixed(2) : 'n/a'}` },
  '2': { title: 'Profit Factor < 1.2', getVal: (s) => `PF: ${s.pf != null ? s.pf.toFixed(2) : 'n/a'}` },
  '3': { title: 'Recovery Factor < 1.0', getVal: (s) => `RF: ${s.rf != null ? s.rf.toFixed(2) : 'n/a'}` },
  '4': { title: 'P/D Ratio < 1.0', getVal: (s) => `P/D: ${s.pd != null ? s.pd.toFixed(2) : 'n/a'}` },
  '5': { title: 'Martingale Triple Flag', getVal: (s) => `DD: ${s.drawdownPct != null ? s.drawdownPct.toFixed(1) : 'n/a'}%` },
  '7': { title: 'End Of Test Ratio > 10%', getVal: () => 'EOT > 10%' },
  '8': { title: 'Recent 12M Profit Negative', getVal: () => '12M profit < 0' },
  '33': { title: 'Largest Loss / Net Profit >= 70%', getVal: () => 'Loss/Profit ratio >= 70%' }
};

const SOFT_FLAG_DETAILS = {
  '27': { title: 'Max Consecutive Losses >= 20', getVal: (s) => `Loss streak: ${s.maxConsecutiveLosses ?? 'n/a'}` },
  '6': { title: 'Max Consecutive Losses >= 20', getVal: (s) => `Loss streak: ${s.maxConsecutiveLosses ?? 'n/a'}` },
  '9': { title: 'Outlier profit > 5σ', getVal: () => 'Outlier loss/profit detected' },
  '10': { title: 'Low sample + high EP', getVal: (s) => `Trades: ${s.trades ?? 'n/a'}` },
  '11': { title: 'LR Correlation < 0.8', getVal: (s) => `Corr: ${s.lr != null ? s.lr.toFixed(2) : 'n/a'}` },
  '12': { title: 'Seasonal dependency', getVal: () => 'Seasonality > 70%' },
  '13': { title: 'Performance decay', getVal: () => 'Decay > 50%' },
  '14': { title: 'Sharpe < 0.5', getVal: (s) => `Sharpe: ${s.sharpe != null ? s.sharpe.toFixed(2) : 'n/a'}` },
  '15': { title: 'Hidden DD duration', getVal: () => 'Hidden DD duration' },
  '16': { title: 'PF >= 2 with DD >= 12%', getVal: (s) => `PF: ${s.pf != null ? s.pf.toFixed(2) : 'n/a'} · DD: ${s.drawdownPct != null ? s.drawdownPct.toFixed(1) : 'n/a'}%` },
  '17': { title: 'Long losing streak warning', getVal: (s) => `Loss streak: ${s.maxConsecutiveLosses ?? 'n/a'}` },
  '18': { title: 'High DD with medium PF', getVal: (s) => `DD: ${s.drawdownPct != null ? s.drawdownPct.toFixed(1) : 'n/a'}% · PF: ${s.pf != null ? s.pf.toFixed(2) : 'n/a'}` },
  '19': { title: 'Winrate masking weak PF', getVal: (s) => `PF: ${s.pf != null ? s.pf.toFixed(2) : 'n/a'}` },
  '20': { title: 'Expected payoff too thin', getVal: (s) => `EP: ${s.ep != null ? s.ep.toFixed(2) : 'n/a'}` },
  '21': { title: 'PF caution band', getVal: (s) => `PF: ${s.pf != null ? s.pf.toFixed(2) : 'n/a'}` },
  '22': { title: 'Recovery caution band', getVal: (s) => `RF: ${s.rf != null ? s.rf.toFixed(2) : 'n/a'}` },
  '23': { title: 'Low activity warning', getVal: (s) => `Trades: ${s.trades ?? 'n/a'}` },
  '24': { title: 'Winrate below 45%', getVal: (s) => `WR full: ${s.winratePct != null ? Number(s.winratePct).toFixed(1) : 'n/a'}%` },
  '25': { title: 'Edge dormancy proxy', getVal: (s) => `H4 · Trades: ${s.trades ?? 'n/a'}` },
  '34': { title: 'Thin Edge (PF < 1.4 & RF < 3.5)', getVal: (s) => `PF: ${s.pf != null ? s.pf.toFixed(2) : 'n/a'} · RF: ${s.rf != null ? s.rf.toFixed(2) : 'n/a'}` }
};

const getTooltipSlotProps = (theme) => {
  const isDarkMode = theme.palette.mode === 'dark';
  return {
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
};

const getHardFlagsTooltipText = (s) => {
  const flags = s.hardFlags || [];
  if (flags.length === 0) {
    return (
      <Typography variant="caption" sx={{ color: '#4ade80', fontWeight: 700, display: 'block', py: 0.5 }}>
        Không vi phạm cờ Hard
      </Typography>
    );
  }
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, py: 0.5 }}>
      <Typography variant="caption" sx={{ fontWeight: 800, color: '#ff4d4f', display: 'block', mb: 0.5 }}>
        Vi phạm cờ Hard:
      </Typography>
      {flags.map((id, idx) => {
        const def = HARD_FLAG_DETAILS[id];
        const text = def ? `${def.title} (${def.getVal(s)})` : `Cờ Hard #${id}`;
        return (
          <Typography key={idx} variant="caption" sx={{ color: '#ff7875', display: 'block', pl: 1, fontFamily: 'monospace' }}>
            • {text}
          </Typography>
        );
      })}
    </Box>
  );
};

const getSoftFlagsTooltipText = (s) => {
  const flags = s.softFlags || [];
  if (flags.length === 0) {
    return (
      <Typography variant="caption" sx={{ color: '#4ade80', fontWeight: 700, display: 'block', py: 0.5 }}>
        Không vi phạm cờ Soft
      </Typography>
    );
  }
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, py: 0.5 }}>
      <Typography variant="caption" sx={{ fontWeight: 800, color: '#ffc069', display: 'block', mb: 0.5 }}>
        Vi phạm cờ Soft:
      </Typography>
      {flags.map((id, idx) => {
        const def = SOFT_FLAG_DETAILS[id];
        const text = def ? `${def.title} (${def.getVal(s)})` : `Cờ Soft #${id}`;
        return (
          <Typography key={idx} variant="caption" sx={{ color: '#ffe7ba', display: 'block', pl: 1, fontFamily: 'monospace' }}>
            • {text}
          </Typography>
        );
      })}
    </Box>
  );
};
const getPriorityRiskChip = (row, theme) => {
  const priorityScore = row?.priorityScore ?? 100;
  const hardCount = Number(row?.hardCount || 0);
  const softCount = Number(row?.softCount || 0);
  const hardFlags = row?.hardFlags || [];
  const softFlags = row?.softFlags || [];
  const isDarkMode = theme.palette.mode === 'dark';
  const colors = getSemanticColors(isDarkMode);

  let label = '';
  let color = '';
  let bgcolor = '';
  let border = '';
  let tooltip = null;

  if (hardCount > 0) {
    label = `Disqualified`;
    color = colors.error.text;
    bgcolor = colors.error.bg;
    border = `1px solid ${colors.error.border}`;
    
    const hardDetails = hardFlags.map(id => {
      const def = HARD_FLAG_DETAILS[id];
      return def ? `${def.title} (${def.getVal(row)})` : `Cờ Hard #${id}`;
    });
    
    tooltip = (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, py: 0.5 }}>
        <Typography variant="caption" sx={{ fontWeight: 800, color: '#ff4d4f', display: 'block', mb: 0.5 }}>
          Bị LOẠI (0đ) do vi phạm {hardCount} cờ Hard:
        </Typography>
        {hardDetails.map((text, idx) => (
          <Typography key={idx} variant="caption" sx={{ color: '#ff7875', display: 'block', pl: 1, fontFamily: 'monospace' }}>
            • {text}
          </Typography>
        ))}
      </Box>
    );
  } else {
    label = `${priorityScore}đ`;
    const softDetails = softFlags.map(id => {
      const def = SOFT_FLAG_DETAILS[id];
      return def ? `${def.title} (${def.getVal(row)})` : `Cờ Soft #${id}`;
    });

    if (priorityScore >= 80) {
      color = colors.success.text;
      bgcolor = colors.success.bg;
      border = `1px solid ${colors.success.border}`;
      tooltip = softCount > 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, py: 0.5 }}>
          <Typography variant="caption" sx={{ fontWeight: 800, color: '#4ade80', display: 'block', mb: 0.5 }}>
            Độ ưu tiên: {priorityScore}/100 — Đạt chuẩn cao.
          </Typography>
          <Typography variant="caption" sx={{ fontWeight: 700, color: '#ffc069', display: 'block', mb: 0.5 }}>
            Vi phạm {softCount} cờ Soft:
          </Typography>
          {softDetails.map((text, idx) => (
            <Typography key={idx} variant="caption" sx={{ color: '#ffe7ba', display: 'block', pl: 1, fontFamily: 'monospace' }}>
              • {text}
            </Typography>
          ))}
        </Box>
      ) : (
        <Typography variant="caption" sx={{ color: '#4ade80', fontWeight: 700, display: 'block', py: 0.5 }}>
          Độ ưu tiên: {priorityScore}/100 — Hoàn hảo, không dính cờ rủi ro.
        </Typography>
      );
    } else if (priorityScore >= 50) {
      color = colors.warning.text;
      bgcolor = colors.warning.bg;
      border = `1px solid ${colors.warning.border}`;
      tooltip = (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, py: 0.5 }}>
          <Typography variant="caption" sx={{ fontWeight: 800, color: '#ffc069', display: 'block', mb: 0.5 }}>
            Độ ưu tiên: {priorityScore}/100 — Trung bình.
          </Typography>
          <Typography variant="caption" sx={{ fontWeight: 700, color: '#ffc069', display: 'block', mb: 0.5 }}>
            Vi phạm {softCount} cờ Soft:
          </Typography>
          {softDetails.map((text, idx) => (
            <Typography key={idx} variant="caption" sx={{ color: '#ffe7ba', display: 'block', pl: 1, fontFamily: 'monospace' }}>
              • {text}
            </Typography>
          ))}
        </Box>
      );
    } else {
      color = colors.error.text;
      bgcolor = colors.error.bg;
      border = `1px solid ${colors.error.border}`;
      tooltip = (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, py: 0.5 }}>
          <Typography variant="caption" sx={{ fontWeight: 800, color: '#ff4d4f', display: 'block', mb: 0.5 }}>
            Độ ưu tiên: {priorityScore}/100 — Rủi ro cao!
          </Typography>
          <Typography variant="caption" sx={{ fontWeight: 700, color: '#ffc069', display: 'block', mb: 0.5 }}>
            Vi phạm {softCount} cờ Soft:
          </Typography>
          {softDetails.map((text, idx) => (
            <Typography key={idx} variant="caption" sx={{ color: '#ffe7ba', display: 'block', pl: 1, fontFamily: 'monospace' }}>
              • {text}
            </Typography>
          ))}
        </Box>
      );
    }
  }

  return (
    <Tooltip title={tooltip} arrow placement="top" slotProps={getTooltipSlotProps(theme)}>
      <Chip
        label={label}
        size="small"
        sx={{
          bgcolor,
          color,
          fontWeight: 800,
          border,
          borderRadius: 1.5,
          cursor: 'help'
        }}
      />
    </Tooltip>
  );
};

function MiniSparkline({ row }) {
  const [chartData, setChartData] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const { fetchBalanceChart, loading } = useBalanceChart();

  useEffect(() => {
    if (!row?.id || !row?.backtest) return;
    fetchBalanceChart(row.backtest, row.id, 1000000)
      .then((data) => {
        const raw = (data || []).map((item) => parseFloat(item.balance));
        const baseline = raw.length > 0 ? raw[0] : 0;
        // Normalize starting from 0
        const formatted = raw.map((b) => ({ balance: b - baseline }));
        setChartData(formatted);
        setLoaded(true);
      })
      .catch(() => {
        setChartData([]);
        setLoaded(true);
      });
  }, [row?.id, row?.backtest, fetchBalanceChart]);

  if (loading && !loaded) {
    return (
      <Box sx={{ width: 140, height: 48, mx: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress size={14} />
      </Box>
    );
  }

  if (!chartData.length) {
    return (
      <Box sx={{ width: 140, height: 48, mx: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="caption" color="text.disabled">
          —
        </Typography>
      </Box>
    );
  }

  const values = chartData.map((d) => d.balance);
  const last = values[values.length - 1];
  const isPositive = last >= 0;

  // Use the premium corporate colors: Blue for positive, Red for negative
  const lineColor = isPositive ? '#2E75B6' : '#FF0000';
  const gradientId = `sparkGrad-comparative-${row.id}-${row.backtest}`;

  return (
    <Box sx={{ width: 140, height: 48, mx: 'auto', display: 'block' }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity={0.3} />
              <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="balance"
            stroke={lineColor}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Box>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

export default function ComparativeRanking() {
  const theme = useTheme();
  const navigate = useNavigate();
  const isDarkMode = theme.palette.mode === 'dark';
  const colors = getSemanticColors(isDarkMode);

  const tooltipSlotProps = getTooltipSlotProps(theme);

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
            '&:hover': { bgcolor: isDarkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)' }
          }}
        >
          <FileTextOutlined style={{ fontSize: '16px' }} />
        </IconButton>
      </Tooltip>
    </Box>
  );

  const {
    fetchComparativeRankingCore,
    fetchComparativeRankingDimensions,
    coreLoading: loading,
    coreError: error,
    dimensionsLoading,
    dimensionsError
  } = useComparativeRanking();
  const { fetchBehaviorAnalysis, loading: behaviorLoading } = useBehaviorAnalysis();

  const [apiData, setApiData] = useState(null);
  const [dimensionsData, setDimensionsData] = useState(null);
  const [behaviorData, setBehaviorData] = useState(null);
  const [selectedTable, setSelectedTable] = useState(() => getStoredDashboardTable('all_backtests'));
  const [dateRange, setDateRange] = useState(() => getStoredDashboardDateRange());

  const [dimensionsLoadedKey, setDimensionsLoadedKey] = useState('');
  const [behaviorLoadedKey, setBehaviorLoadedKey] = useState('');

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

  const [currentView, setCurrentView] = useState('ranking');
  const [currentMetric, setCurrentMetric] = useState('composite');


  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [expandedRowIds, setExpandedRowIds] = useState(new Set());

  const toggleRowExpand = useCallback((rowKey) => {
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) {
        next.delete(rowKey);
      } else {
        next.add(rowKey);
      }
      return next;
    });
  }, []);

  const [expandedBotRows, setExpandedBotRows] = useState({});
  const handleToggleBotRow = (botId) => {
    setExpandedBotRows((prev) => ({ ...prev, [botId]: !prev[botId] }));
  };

  const handleInspectChildStrategy = (stratId, backtest) => {
    setSearchVal(stratId);
    setCurrentView('ranking');
    const key = `${backtest || 'all'}-${stratId}`;
    setExpandedRowIds(new Set([key]));
  };
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpTitle, setHelpTitle] = useState('');
  const [helpContent, setHelpContent] = useState('');

  const [searchVal, setSearchVal] = useState('');
  const [selectedSymbol, setSelectedSymbol] = useState('all');
  const [selectedDirection, setSelectedDirection] = useState('all');
  const [selectedTimeframe, setSelectedTimeframe] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedOverallStatus, setSelectedOverallStatus] = useState('all');

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const handleDataChanged = () => {
      setRefreshKey((k) => k + 1);
    };
    window.addEventListener('dashboard:data-changed', handleDataChanged);
    return () => window.removeEventListener('dashboard:data-changed', handleDataChanged);
  }, []);

  useEffect(() => {
    const handleFiltersUpdated = () => {
      setSelectedTable(getStoredDashboardTable('all_backtests'));
      setDateRange(getStoredDashboardDateRange());
      setSearchVal('');
      setSelectedSymbol('all');
      setSelectedDirection('all');
      setSelectedTimeframe('all');
      setSelectedStatus('all');
      setSelectedOverallStatus('all');
    };
    window.addEventListener('dashboard:filters-updated', handleFiltersUpdated);
    return () => window.removeEventListener('dashboard:filters-updated', handleFiltersUpdated);
  }, []);

  useEffect(() => {
    if (currentView === 'ranking-bot') {
      setSearchVal('');
    }
  }, [currentView]);

  useEffect(() => {
    let active = true;

    const loadCore = async () => {
      try {
        const selectedSources = getStoredDashboardSources([]);
        if (!selectedSources || selectedSources.length === 0) {
          setApiData(null);
          return;
        }
        const params = { sourceNames: selectedSources };
        if (dateRange.startDate && dateRange.endDate) {
          params.startDate = dateRange.startDate;
          params.endDate = dateRange.endDate;
        }
        const res = await fetchComparativeRankingCore(params);
        if (active && res?.success) {
          setApiData(res.data);
        }
      } catch (loadError) {
        console.error('Failed to load comparative ranking core data:', loadError);
      }
    };

    loadCore();
    return () => {
      active = false;
    };
  }, [fetchComparativeRankingCore, selectedTable, dateRange, refreshKey]);

  useEffect(() => {
    if (currentView !== 'ranking-bot' && currentView !== 'dimension') return;

    const currentKey = `${selectedTable}-${dateRange.startDate || 'any'}-${dateRange.endDate || 'any'}-${refreshKey}`;
    if (dimensionsLoadedKey === currentKey && dimensionsData) return;

    let active = true;
    const loadDimensions = async () => {
      try {
        const selectedSources = getStoredDashboardSources([]);
        if (!selectedSources || selectedSources.length === 0) return;
        const params = { sourceNames: selectedSources };
        if (dateRange.startDate && dateRange.endDate) {
          params.startDate = dateRange.startDate;
          params.endDate = dateRange.endDate;
        }
        const res = await fetchComparativeRankingDimensions(params);
        if (active && res?.success) {
          setDimensionsData(res.data);
          setDimensionsLoadedKey(currentKey);
        }
      } catch (err) {
        console.error('Failed to load comparative ranking dimensions data:', err);
      }
    };
    loadDimensions();
    return () => {
      active = false;
    };
  }, [fetchComparativeRankingDimensions, selectedTable, dateRange, refreshKey, currentView, dimensionsLoadedKey, dimensionsData]);

  useEffect(() => {
    setPage(0);
  }, [selectedTable, searchVal, selectedSymbol, selectedDirection, selectedTimeframe, selectedStatus, selectedOverallStatus, currentMetric]);

  useEffect(() => {
    if (currentView !== 'seasonality') return;

    const currentKey = `${selectedTable}-${dateRange.startDate || 'any'}-${dateRange.endDate || 'any'}-${refreshKey}`;
    if (behaviorLoadedKey === currentKey && behaviorData) return;

    let active = true;
    const loadBehavior = async () => {
      try {
        const selectedSources = getStoredDashboardSources([]);
        if (!selectedSources || selectedSources.length === 0) return;
        const params = { sourceNames: selectedSources };
        if (dateRange.startDate && dateRange.endDate) {
          params.startDate = dateRange.startDate;
          params.endDate = dateRange.endDate;
        }
        const res = await fetchBehaviorAnalysis(params);
        if (active && res?.success) {
          setBehaviorData(res.data);
          setBehaviorLoadedKey(currentKey);
        }
      } catch (err) {
        console.error('Failed to load behavior analysis data in ranking page:', err);
      }
    };
    loadBehavior();
    return () => {
      active = false;
    };
  }, [fetchBehaviorAnalysis, selectedTable, dateRange, refreshKey, currentView, behaviorLoadedKey, behaviorData]);

  const rankingData = useMemo(() => apiData?.ranking || [], [apiData?.ranking]);
  const duelData = useMemo(() => dimensionsData?.duels || [], [dimensionsData?.duels]);
  const averageData = useMemo(() => dimensionsData?.averages || [], [dimensionsData?.averages]);
  const obOsData = useMemo(() => dimensionsData?.obOs || [], [dimensionsData?.obOs]);

  const uniqueSymbols = useMemo(() => {
    const syms = new Set();
    rankingData.forEach((s) => {
      if (s.symbol) syms.add(s.symbol.toUpperCase());
    });
    return Array.from(syms).sort();
  }, [rankingData]);

  const sortedStrategies = useMemo(() => {
    let filtered = [...rankingData];

    if (searchVal.trim()) {
      const q = searchVal.toLowerCase();
      filtered = filtered.filter((s) =>
        String(s.id || '')
          .toLowerCase()
          .includes(q)
      );
    }

    if (selectedSymbol && selectedSymbol !== 'all') {
      filtered = filtered.filter((s) => String(s.symbol || '').toUpperCase() === selectedSymbol.toUpperCase());
    }

    if (selectedDirection && selectedDirection !== 'all') {
      filtered = filtered.filter((s) => String(s.direction || '').toUpperCase() === selectedDirection.toUpperCase());
    }

    if (selectedTimeframe && selectedTimeframe !== 'all') {
      filtered = filtered.filter((s) => String(s.timeframe || '').toUpperCase() === selectedTimeframe.toUpperCase());
    }

    if (selectedStatus && selectedStatus !== 'all') {
      filtered = filtered.filter((s) => {
        const compositeVal = getFinalScoreValue(s);
        if (selectedStatus === 'deploy') return compositeVal >= 70;
        if (selectedStatus === 'monitor') return compositeVal >= 50 && compositeVal < 70;
        if (selectedStatus === 'review') return compositeVal < 50;
        return true;
      });
    }

    return filtered.sort((a, b) => {
      if (currentMetric === 'id') {
        return a.id.localeCompare(b.id);
      }
      let aValue, bValue;
      if (currentMetric === 'sharpe') {
        aValue = Number(a.normalized?.sharpe || 0);
        bValue = Number(b.normalized?.sharpe || 0);
      } else {
        aValue = Number(a[currentMetric] || 0);
        bValue = Number(b[currentMetric] || 0);
      }
      if (bValue !== aValue) return bValue - aValue;
      return a.id.localeCompare(b.id);
    });
  }, [currentMetric, rankingData, searchVal, selectedSymbol, selectedDirection, selectedTimeframe, selectedStatus]);

  const botViewData = useMemo(() => {
    if (!sortedStrategies || sortedStrategies.length === 0) return [];

    const groups = {};
    sortedStrategies.forEach((s) => {
      const botId = s.id.substring(0, 3); // Lấy 3 chữ số đầu làm mã bot gốc
      if (!groups[botId]) {
        groups[botId] = [];
      }
      groups[botId].push(s);
    });

    const mapped = Object.entries(groups)
      .map(([botId, strats]) => {
        const totalConfigs = strats.length;
        let passedCount = 0;
        let warningCount = 0;
        let disqualifiedCount = 0;
        let sumPriority = 0;
        let sumFinalScore = 0;
        let totalProfit = 0;
        let sumPf = 0;
        let sumRf = 0;
        let sumPd = 0;
        let sumDrawdown = 0;
        let totalTrades = 0;

        strats.forEach((s) => {
          const priorityScore = s.priorityScore ?? 100;
          const finalScore = getFinalScoreValue(s);
          sumPriority += priorityScore;
          sumFinalScore += finalScore;
          totalProfit += s.profit || 0;
          sumPf += s.pf || 0;
          sumRf += s.rf || 0;
          sumPd += s.pd || 0;
          const sDrawdown = s.drawdownPct ?? (s.pd > 0 ? s.profit / s.pd : 0);
          sumDrawdown += sDrawdown || 0;
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
        const avgRf = totalConfigs > 0 ? Number((sumRf / totalConfigs).toFixed(2)) : 0;
        const avgPd = totalConfigs > 0 ? Number((sumPd / totalConfigs).toFixed(2)) : 0;
        const avgDrawdown = totalConfigs > 0 ? Number((sumDrawdown / totalConfigs).toFixed(2)) : 0;

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
          avgRf,
          avgPd,
          avgDrawdown,
          totalTrades,
          overallStatus,
          statusColor,
          strats: [...strats].sort((a, b) => {
            const idA = a.id || '';
            const idB = b.id || '';

            // 1. So sánh prefix bot (ví dụ: 001 < 002)
            const prefixA = idA.substring(0, 3);
            const prefixB = idB.substring(0, 3);
            if (prefixA !== prefixB) return prefixA.localeCompare(prefixB);

            // 2. So sánh Symbol
            const symA = idA.length > 7 ? idA.substring(3, idA.length - 4) : '';
            const symB = idB.length > 7 ? idB.substring(3, idB.length - 4) : '';
            if (symA !== symB) return symA.localeCompare(symB);

            // 3. So sánh Timeframe (H1 trước H4)
            const tfA = idA.length > 4 ? idA.slice(-4, -2) : '';
            const tfB = idB.length > 4 ? idB.slice(-4, -2) : '';
            if (tfA !== tfB) return tfA.localeCompare(tfB);

            // 4. So sánh Direction (OB trước OS)
            const dirA = idA.slice(-2);
            const dirB = idB.slice(-2);
            return dirA.localeCompare(dirB);
          })
        };
      });

    let filtered = mapped;
    if (selectedOverallStatus && selectedOverallStatus !== 'all') {
      filtered = filtered.filter((bot) => bot.overallStatus === selectedOverallStatus);
    }

    return filtered.sort((a, b) => a.botId.localeCompare(b.botId));
  }, [sortedStrategies, selectedOverallStatus]);

  const paginatedStrategies = useMemo(() => {
    const start = page * rowsPerPage;
    return sortedStrategies.slice(start, start + rowsPerPage);
  }, [page, rowsPerPage, sortedStrategies]);

  const rankingSummary = useMemo(() => {
    if (!rankingData.length) {
      return {
        total: 0,
        averageComposite: 0,
        best: null,
        weakest: null
      };
    }

    const composites = rankingData.map((item) => Number(item.composite || 0));
    const totalComposite = composites.reduce((sum, value) => sum + value, 0);
    return {
      total: rankingData.length,
      averageComposite: totalComposite / rankingData.length,
      best: rankingData[0],
      weakest: [...rankingData].sort((a, b) => Number(a.composite || 0) - Number(b.composite || 0))[0]
    };
  }, [rankingData]);

  const HOUR_HEATMAP = useMemo(
    () => behaviorData?.hourHeatmap || [],
    [behaviorData]
  );
  const DAY_HEATMAP = useMemo(
    () => behaviorData?.dayHeatmap || [],
    [behaviorData]
  );
  const MONTH_HEATMAP = useMemo(
    () => behaviorData?.monthHeatmap || [],
    [behaviorData]
  );
  const STRATEGY_YEARS = useMemo(
    () => behaviorData?.strategyYears || [],
    [behaviorData]
  );
  const QUARTERLY_SEASONALITY = useMemo(
    () => behaviorData?.quarterlySeasonality || [],
    [behaviorData]
  );



  const openHelpModal = (title, content) => {
    setHelpTitle(title);
    setHelpContent(content);
    setHelpOpen(true);
  };

  const isStrategyRankingHelp = helpTitle.includes('STRATEGY RANKING');
  const isStrategyBotHelp = helpTitle.includes('STRATEGY BOT ANALYSIS');

  const hasSelectedDataSources = getStoredDashboardSources([]).length > 0;

  if (!hasSelectedDataSources) {
    return (
      <Box sx={{ width: '100%', py: 1 }}>
        <DashboardFilterBar
          title="Comparative Ranking"
          subtitle="— Strategy Evaluation & Multi-Dimensional Selection"
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
            Vui lòng chọn ít nhất một Data Source để hiển thị dữ liệu Comparative Ranking.
          </Typography>
        </Box>
      </Box>
    );
  }

  if (!loading && apiData && apiData.ranking?.length === 0) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 2 }}>
        <Typography variant="h6" color="text.secondary">
          Chưa có dữ liệu
        </Typography>
        <Typography variant="body2" color="text.disabled" sx={{ textAlign: 'center', px: 2 }}>
          Datasource đã chọn chưa có strategy có dữ liệu hợp lệ cho Comparative Analysis.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', py: 1 }}>
      <DashboardFilterBar title="Comparative Ranking" subtitle="— Strategy Evaluation & Multi-Dimensional Selection" />

      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
          {error.message || 'Failed to load comparative ranking data.'}
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
          mb: 3,
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
          {VIEW_TABS.map((tab) => (
            <Button
              key={tab.id}
              onClick={() => setCurrentView(tab.id)}
              sx={{
                px: 1.5,
                py: 0.5,
                fontWeight: 600,
                fontSize: '0.75rem',
                color: currentView === tab.id ? '#ffffff' : 'text.secondary',
                bgcolor:
                  currentView === tab.id ? (theme.palette.mode === 'dark' ? 'primary.main' : 'var(--tab-active-bg, #1F3864)') : 'transparent',
                borderRadius: 1.5,
                textTransform: 'none',
                transition: 'all 0.15s',
                flexGrow: { xs: 1, sm: 0 },
                '&:hover': {
                  bgcolor:
                    currentView === tab.id
                      ? theme.palette.mode === 'dark'
                        ? 'primary.dark'
                        : 'var(--tab-active-hover-bg, #1F3864)'
                      : theme.palette.mode === 'light'
                        ? 'rgba(31, 56, 100, 0.10)'
                        : 'rgba(255, 255, 255, 0.08)',
                  color: currentView === tab.id ? '#ffffff' : theme.palette.mode === 'light' ? '#1F3864' : '#e2e8f0'
                }
              }}
            >
              {tab.label}
            </Button>
          ))}
        </Box>
      </Box>

      {currentView === 'ranking' && (
        <RankingTab
          rankingSummary={rankingSummary}
          theme={theme}
          formatNumber={formatNumber}
          handleOpenRemarks={handleOpenRemarks}
          selectedTable={selectedTable}
          dateRange={dateRange}
          isDarkMode={isDarkMode}
          searchVal={searchVal}
          setSearchVal={setSearchVal}
          selectedSymbol={selectedSymbol}
          setSelectedSymbol={setSelectedSymbol}
          selectedDirection={selectedDirection}
          setSelectedDirection={setSelectedDirection}
          selectedTimeframe={selectedTimeframe}
          setSelectedTimeframe={setSelectedTimeframe}
          selectedStatus={selectedStatus}
          setSelectedStatus={setSelectedStatus}
          uniqueSymbols={uniqueSymbols}
          METRIC_OPTIONS={METRIC_OPTIONS}
          currentMetric={currentMetric}
          setCurrentMetric={setCurrentMetric}
          sortedStrategies={sortedStrategies}
          paginatedStrategies={paginatedStrategies}
          page={page}
          setPage={setPage}
          rowsPerPage={rowsPerPage}
          setRowsPerPage={setRowsPerPage}
          expandedRowIds={expandedRowIds}
          toggleRowExpand={toggleRowExpand}
          getFinalScoreValue={getFinalScoreValue}
          getStatusChip={getStatusChip}
          getPriorityRiskChip={getPriorityRiskChip}
          getPerformanceBreakdown={getPerformanceBreakdown}
          getPerformanceQuality={getPerformanceQuality}
          formatPositiveContribution={formatPositiveContribution}
          formatCurrency={formatCurrency}
          colors={colors}
          renderHeaderActions={renderHeaderActions}
          openHelpModal={openHelpModal}
          coreLoading={loading}
        />
      )}

      {/* ==========================================
          TAB: RANKING BOT (HIERARCHICAL BOT GROUPS)
          ========================================== */}
      {currentView === 'ranking-bot' && (
        <BotComparisonTab
          botViewData={botViewData}
          expandedBotRows={expandedBotRows}
          handleToggleBotRow={handleToggleBotRow}
          isDarkMode={isDarkMode}
          searchVal={searchVal}
          setSearchVal={setSearchVal}
          selectedSymbol={selectedSymbol}
          setSelectedSymbol={setSelectedSymbol}
          selectedDirection={selectedDirection}
          setSelectedDirection={setSelectedDirection}
          selectedTimeframe={selectedTimeframe}
          setSelectedTimeframe={setSelectedTimeframe}
          selectedStatus={selectedStatus}
          setSelectedStatus={setSelectedStatus}
          selectedOverallStatus={selectedOverallStatus}
          setSelectedOverallStatus={setSelectedOverallStatus}
          colors={colors}
          tooltipSlotProps={tooltipSlotProps}
          theme={theme}
          getHardFlagsTooltipText={getHardFlagsTooltipText}
          getSoftFlagsTooltipText={getSoftFlagsTooltipText}
          getPriorityRiskChip={getPriorityRiskChip}
          getFinalScoreValue={getFinalScoreValue}
          handleInspectChildStrategy={handleInspectChildStrategy}
          openHelpModal={openHelpModal}
          dimensionsLoading={dimensionsLoading}
        />
      )}

      {currentView === 'dimension' && (
        <DimensionTab
          duelData={duelData}
          obOsData={obOsData}
          averageData={averageData}
          theme={theme}
          formatCurrency={formatCurrency}
          formatNumber={formatNumber}
          safeNumber={safeNumber}
          safeCurrency={safeCurrency}
          renderHeaderActions={renderHeaderActions}
          openHelpModal={openHelpModal}
          dimensionsLoading={dimensionsLoading}
        />
      )}
      {currentView === 'seasonality' && (
        <SeasonalityTab
          HOUR_HEATMAP={HOUR_HEATMAP}
          DAY_HEATMAP={DAY_HEATMAP}
          MONTH_HEATMAP={MONTH_HEATMAP}
          STRATEGY_YEARS={STRATEGY_YEARS}
          QUARTERLY_SEASONALITY={QUARTERLY_SEASONALITY}
          behaviorLoading={behaviorLoading}
          theme={theme}
          renderHeaderActions={renderHeaderActions}
          openHelpModal={openHelpModal}
        />
      )}

      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} PaperProps={{ sx: { borderRadius: 3, p: 3.5, maxWidth: 720 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 2 }}>
          <InfoCircleOutlined style={{ fontSize: '22px', color: theme.palette.primary.main }} />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {helpTitle}
          </Typography>
        </Box>
        {isStrategyRankingHelp ? (
          <Stack spacing={2.25}>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65, fontSize: '0.85rem', whiteSpace: 'pre-line' }}>
              {helpContent.split('\n\nScore scale /100')[0]}
            </Typography>

            <Divider />

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1.25, color: isDarkMode ? 'primary.light' : '#1F3864' }}>
                Score scale /100
              </Typography>
              <Grid container spacing={1.25}>
                {SCORE_GUIDE_ITEMS.map((item) => (
                  <Grid key={item.label} size={{ xs: 12, sm: 6 }}>
                    <Box
                      sx={{
                        p: 1.25,
                        borderRadius: 2,
                        bgcolor: isDarkMode ? 'rgba(15, 23, 42, 0.72)' : '#F8FBFF',
                        border: '1px solid',
                        borderColor: isDarkMode ? 'rgba(148, 163, 184, 0.18)' : '#D9EAF7'
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{ display: 'block', fontWeight: 800, color: isDarkMode ? 'text.primary' : '#1F3864', mb: 0.35 }}
                      >
                        {item.label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 600, mb: 1 }}>
                        {item.note}
                      </Typography>
                      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(75px, 1fr))', gap: 0.75 }}>
                        {item.levels.map((level) => (
                          <Box
                            key={level.label}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.45,
                              px: 0.7,
                              py: 0.55,
                              borderRadius: 1.25,
                              bgcolor: isDarkMode ? 'rgba(255,255,255,0.035)' : '#FFFFFF',
                              border: '1px solid',
                              borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E5EEF7'
                            }}
                          >
                            <Box
                              sx={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                bgcolor: level.color,
                                flex: '0 0 auto',
                                boxShadow: '0 0 0 3px ' + level.color + '22'
                              }}
                            />
                            <Typography
                              variant="caption"
                              sx={{ fontWeight: 800, fontSize: '0.66rem', color: isDarkMode ? 'text.primary' : '#1F3864' }}
                            >
                              {level.label}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </Box>
          </Stack>
        ) : isStrategyBotHelp ? (
          <Stack spacing={2.25}>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
              Giao diện gom nhóm toàn bộ các cấu hình con (child configurations) theo mã Bot gốc (3 chữ số đầu tiên của Strategy ID) đang
              hiển thị dưới các bộ lọc hiện tại.
            </Typography>

            <Divider />

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1.25, color: isDarkMode ? 'primary.light' : '#1F3864' }}>
                Ý nghĩa các chỉ số & cột dữ liệu
              </Typography>
              <Grid container spacing={1.5}>
                {[
                  { label: 'Dòng Bot', desc: 'Mã định danh 3 chữ số đầu của Bot cha (ví dụ: 001, 002...)' },
                  { label: 'Số cấu hình', desc: 'Tổng số cấu hình con đang hoạt động tương ứng với bộ lọc' },
                  { label: 'Avg Final Score', desc: 'Điểm số hiệu suất chuẩn hóa trung bình (0-100) của các cấu hình con' },
                  { label: 'Avg Priority', desc: 'Điểm ưu tiên rủi ro trung bình (0-100) của các cấu hình con' },
                  { label: 'Total Profit', desc: 'Tổng lợi nhuận ròng lũy kế của toàn bộ cấu hình con cộng lại' },
                  { label: 'Avg PF', desc: 'Chỉ số Profit Factor trung bình của nhóm cấu hình' },
                  { label: 'Max Drawdown', desc: 'Mức sụt giảm tài sản tạm thời lớn nhất (worst-case drawdown) trong dòng bot' }
                ].map((col) => (
                  <Grid key={col.label} size={{ xs: 12, sm: 6 }}>
                    <Box
                      sx={{
                        p: 1.25,
                        height: '100%',
                        borderRadius: 2,
                        bgcolor: isDarkMode ? 'rgba(15, 23, 42, 0.72)' : '#F8FBFF',
                        border: '1px solid',
                        borderColor: isDarkMode ? 'rgba(148, 163, 184, 0.18)' : '#D9EAF7'
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{ display: 'block', fontWeight: 800, color: isDarkMode ? 'text.primary' : '#1F3864', mb: 0.5 }}
                      >
                        {col.label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 600, lineHeight: 1.35 }}>
                        {col.desc}
                      </Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </Box>

            <Divider />

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1.25, color: isDarkMode ? 'primary.light' : '#1F3864' }}>
                Phân bổ chất lượng cấu hình (Quality Distribution)
              </Typography>
              <Stack spacing={1}>
                {[
                  {
                    status: 'Passed',
                    color: 'success.main',
                    bg: isDarkMode ? 'rgba(82, 196, 26, 0.08)' : 'rgba(82, 196, 26, 0.05)',
                    border: 'rgba(82, 196, 26, 0.25)',
                    desc: 'Đạt chuẩn an toàn cao. Điểm Priority Score >= 80, không vi phạm cờ rủi ro Hard/Soft.'
                  },
                  {
                    status: 'Warning',
                    color: 'warning.main',
                    bg: isDarkMode ? 'rgba(250, 173, 20, 0.08)' : 'rgba(250, 173, 20, 0.05)',
                    border: 'rgba(250, 173, 20, 0.25)',
                    desc: 'Cần theo dõi thêm. Điểm Priority Score từ 50 đến 79.'
                  },
                  {
                    status: 'Disqualified',
                    color: 'error.main',
                    bg: isDarkMode ? 'rgba(255, 77, 79, 0.08)' : 'rgba(255, 77, 79, 0.05)',
                    border: 'rgba(255, 77, 79, 0.25)',
                    desc: 'Rủi ro cao hoặc Bị Loại. Điểm Priority Score < 50 hoặc vi phạm cờ Hard.'
                  }
                ].map((item) => (
                  <Box
                    key={item.status}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      p: 1.25,
                      borderRadius: 1.5,
                      bgcolor: item.bg,
                      border: '1px solid',
                      borderColor: item.border
                    }}
                  >
                    <Chip
                      label={item.status}
                      size="small"
                      sx={{
                        bgcolor: item.color,
                        color: '#ffffff',
                        fontWeight: 800,
                        fontSize: '0.675rem',
                        height: 20,
                        minWidth: 90
                      }}
                    />
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.primary', lineHeight: 1.35 }}>
                      {item.desc}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Box>

            <Divider />

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1.25, color: isDarkMode ? 'primary.light' : '#1F3864' }}>
                Quy tắc đánh giá chung (Overall Status)
              </Typography>
              <Grid container spacing={1}>
                {[
                  { status: 'EXCELLENT', color: 'success', desc: 'Có >= 70% số cấu hình con đạt trạng thái Passed.' },
                  { status: 'GOOD', color: 'info', desc: 'Có >= 40% số cấu hình con đạt trạng thái Passed.' },
                  { status: 'MONITOR', color: 'warning', desc: 'Hiệu suất trung bình, cần tiếp tục giám sát (mặc định).' },
                  { status: 'DISQUALIFIED', color: 'error', desc: 'Có >= 50% số cấu hình con bị cắm cờ hoặc bị loại.' }
                ].map((rule) => (
                  <Grid key={rule.status} size={{ xs: 12, sm: 6 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        p: 1,
                        borderRadius: 1.5,
                        border: '1px solid',
                        borderColor: 'divider',
                        bgcolor: isDarkMode ? 'rgba(255,255,255,0.01)' : '#ffffff',
                        height: '100%'
                      }}
                    >
                      <Chip
                        label={rule.status}
                        size="small"
                        color={rule.color}
                        sx={{ fontWeight: 800, fontSize: '0.65rem', height: 20, minWidth: 100 }}
                      />
                      <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', lineHeight: 1.3 }}>
                        {rule.desc}
                      </Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </Box>
          </Stack>
        ) : helpTitle.includes('HIỆU SUẤT THEO CHIỀU MUA/BÁN') || helpTitle.includes('HIỆU SUẤT TỔNG HỢP THEO CẶP TÀI SẢN') || helpTitle.includes('OB VS OS') || helpTitle.includes('ASSET PERFORMANCE') ? (
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
        ) : helpTitle.includes('ĐỐI SÁNH KHUNG THỜI GIAN') || helpTitle.includes('TIMEFRAME DUEL') ? (
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
        ) : helpTitle.includes('BẢN ĐỒ NHIỆT') || helpTitle.includes('Temporal Heatmap') || helpTitle.includes('HEATMAP') ? (
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
        ) : helpTitle.includes('TÍNH ỔN ĐỊNH HÀNG NĂM') || helpTitle.includes('Annual Stability') || helpTitle.includes('STABILITY') ? (
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
        ) : helpTitle.includes('TÍNH MÙA VỤ THEO QUÝ') || helpTitle.includes('Quarterly Seasonality') || helpTitle.includes('QUARTERLY') ? (
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
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65, fontSize: '0.85rem', whiteSpace: 'pre-line' }}>
            {helpContent}
          </Typography>
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
            Close
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
