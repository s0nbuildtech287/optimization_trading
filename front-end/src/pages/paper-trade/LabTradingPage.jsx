import React, { useState } from 'react';
import {
  Box,
  Card,
  Typography,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  Tooltip,
  Divider,
  Stack,
  useTheme,
  alpha,
  TextField,
  InputAdornment,
  MenuItem,
  Paper
} from '@mui/material';
import {
  ExperimentOutlined,
  ThunderboltOutlined,
  RiseOutlined,
  FallOutlined,
  TrophyOutlined,
  SafetyOutlined,
  DollarCircleOutlined,
  LineChartOutlined,
  HistoryOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
  ClockCircleOutlined,
  SafetyCertificateOutlined
} from '@ant-design/icons';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as ChartTooltip,
  CartesianGrid
} from 'recharts';

import MainCard from 'components/MainCard';
import { runPaperTradeBacktest } from 'api/paperTrade';

const STRATEGIES = [
  {
    key: 'TREND_PULLBACK',
    bot: 'Bot 1',
    name: 'Trend Pullback (EMA)',
    badge: 'EMA 200 + 21 & RSI',
    market: 'Trending Market (Có xu hướng)',
    desc: 'Thuận theo xu hướng dài hạn EMA 200, bắt nhịp hồi về EMA 21 và RSI xác nhận đảo chiều.',
    color: '#1677ff',
    icon: <RiseOutlined style={{ fontSize: 22 }} />
  },
  {
    key: 'BOLLINGER_REVERSION',
    bot: 'Bot 2',
    name: 'Bollinger Reversion',
    badge: 'BB (20, 2) + RSI',
    market: 'Sideway Market (Đi ngang)',
    desc: 'Bắt đỉnh/đáy khi nến chạm dải trên/dưới Bollinger Bands kết hợp RSI quá mua (>70) hoặc quá bán (<30).',
    color: '#722ed1',
    icon: <SafetyCertificateOutlined style={{ fontSize: 22 }} />
  },
  {
    key: 'BREAKOUT_MOMENTUM',
    bot: 'Bot 3',
    name: 'Breakout Momentum',
    badge: 'Donchian 20 + Vol Spike',
    market: 'Volatility Breakout (Bùng nổ)',
    desc: 'Bắt điểm phá vỡ đỉnh/đáy 20 nến Donchian Channel kèm khối lượng giao dịch đột biến (> 1.5x MA20).',
    color: '#fa8c16',
    icon: <ThunderboltOutlined style={{ fontSize: 22 }} />
  }
];

const POPULAR_SYMBOLS = [
  { symbol: 'BTCUSDT', label: 'BTC' },
  { symbol: 'ETHUSDT', label: 'ETH' },
  { symbol: 'SOLUSDT', label: 'SOL' },
  { symbol: 'BNBUSDT', label: 'BNB' },
  { symbol: 'PAXGUSDT', label: 'PAXG' },
  { symbol: 'DOGEUSDT', label: 'DOGE' },
  { symbol: 'NEARUSDT', label: 'NEAR' },
  { symbol: 'AVAXUSDT', label: 'AVAX' }
];

const DURATION_OPTIONS = [
  { days: 7, label: '7 Ngày (~670 nến)' },
  { days: 14, label: '14 Ngày (~1.340 nến)' },
  { days: 30, label: '30 Ngày (~2.880 nến - Khuyên dùng)' },
  { days: 60, label: '60 Ngày (~5.760 nến)' },
  { days: 90, label: '90 Ngày (~8.640 nến)' }
];

export default function LabTradingPage() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  // Form states
  const [strategyKey, setStrategyKey] = useState('TREND_PULLBACK');
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [days, setDays] = useState(30);
  const [initialBalance, setInitialBalance] = useState('100');
  const [marginPerTrade, setMarginPerTrade] = useState('15');
  const [leverage, setLeverage] = useState(3);

  // Execution states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const selectedStrategy = STRATEGIES.find((s) => s.key === strategyKey) || STRATEGIES[0];

  const handleRunBacktest = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await runPaperTradeBacktest({
        strategyKey,
        symbol,
        days: Number(days),
        initialBalance: Number(initialBalance) || 100,
        marginPerTrade: Number(marginPerTrade) || 15,
        leverage: Number(leverage) || 3
      });
      const backtestResult = data?.data || data;
      setResult(backtestResult);
    } catch (err) {
      setError(err.message || 'Lỗi khi chạy backtest');
    } finally {
      setLoading(false);
    }
  };

  const summary = result?.summary || {};
  const isProfitable = summary?.netProfit >= 0;
  const chartStroke = isProfitable ? '#52c41a' : '#ff4d4f';
  const chartFill = isProfitable ? '#52c41a' : '#ff4d4f';

  const kpiCardSx = {
    p: 2.25,
    height: '100%',
    width: '100%',
    bgcolor: 'background.paper',
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: 2,
    transition: 'all 0.2s ease-in-out',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    '&:hover': {
      boxShadow: theme.customShadows?.z1 || 1,
      transform: 'translateY(-2px)',
      borderColor: 'primary.main'
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, width: '100%', pb: 4 }}>
      {/* 1. Header Banner */}
      <MainCard
        border
        sx={{
          bgcolor: isDark ? 'background.paper' : '#f8fafc',
          borderColor: 'divider',
          width: '100%'
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', md: 'center' }}
          spacing={2}
          sx={{ width: '100%' }}
        >
          <Box>
            <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap">
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 44,
                  height: 44,
                  borderRadius: 2,
                  bgcolor: isDark ? alpha(theme.palette.primary.main, 0.15) : alpha(theme.palette.primary.main, 0.1),
                  color: 'primary.main'
                }}
              >
                <ExperimentOutlined style={{ fontSize: 24 }} />
              </Box>
              <Box>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography variant="h4" fontWeight={800} color="text.primary">
                    Chiến Lược Trading Lab (Backtest)
                  </Typography>
                  <Chip
                    icon={
                      <Box
                        component="span"
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          bgcolor: 'success.main',
                          boxShadow: '0 0 8px rgba(34, 197, 94, 0.8)'
                        }}
                      />
                    }
                    label="Binance 15m Engine"
                    size="small"
                    variant="outlined"
                    color="success"
                    sx={{ fontWeight: 600, height: 24 }}
                  />
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  Kiểm thử thuật toán tự động trên nến M15 Binance thật. Mô phỏng đầy đủ SL, TP 2R, Dời hòa vốn (Breakeven) và Phí sàn 0.04%/chiều.
                </Typography>
              </Box>
            </Stack>
          </Box>
        </Stack>
      </MainCard>

      {/* 2. Cấu Hình Tham Số Kiểm Thử */}
      <MainCard
        border
        sx={{
          bgcolor: isDark ? 'background.paper' : '#ffffff',
          borderColor: 'divider',
          width: '100%'
        }}
      >
        <Stack spacing={3}>
          {/* 2.1 Chọn Chiến Lược (3 Cards dạng Lưới) */}
          <Box>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
              <Typography variant="subtitle1" fontWeight={700} color="text.primary">
                1. Chọn Chiến Lược Thuật Toán:
              </Typography>
              <Typography variant="caption" color="text.secondary">
                (Nhấp để chọn bot muốn kiểm nghiệm)
              </Typography>
            </Stack>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
                gap: 2
              }}
            >
              {STRATEGIES.map((s) => {
                const isSelected = strategyKey === s.key;
                return (
                  <Box
                    key={s.key}
                    onClick={() => !loading && setStrategyKey(s.key)}
                    sx={{
                      p: 2.25,
                      borderRadius: 2,
                      cursor: loading ? 'not-allowed' : 'pointer',
                      border: '2px solid',
                      borderColor: isSelected ? s.color : 'divider',
                      bgcolor: isSelected
                        ? (isDark ? alpha(s.color, 0.15) : alpha(s.color, 0.05))
                        : (isDark ? 'background.default' : '#fcfcfc'),
                      boxShadow: isSelected ? `0 4px 16px ${alpha(s.color, 0.2)}` : 'none',
                      transition: 'all 0.2s ease-in-out',
                      '&:hover': {
                        borderColor: s.color,
                        transform: loading ? 'none' : 'translateY(-2px)'
                      }
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                      <Stack direction="row" spacing={1.2} alignItems="center">
                        <Box sx={{ color: s.color, display: 'flex', alignItems: 'center' }}>
                          {s.icon}
                        </Box>
                        <Box>
                          <Typography variant="subtitle2" fontWeight={800} color={isSelected ? s.color : 'text.primary'}>
                            {s.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" fontWeight={600}>
                            {s.bot}
                          </Typography>
                        </Box>
                      </Stack>
                      {isSelected ? (
                        <Chip
                          label="ĐANG CHỌN"
                          size="small"
                          sx={{
                            bgcolor: s.color,
                            color: '#fff',
                            fontWeight: 700,
                            height: 22,
                            fontSize: 10
                          }}
                        />
                      ) : (
                        <Chip
                          label={s.badge}
                          size="small"
                          variant="outlined"
                          sx={{ height: 22, fontSize: 10, fontWeight: 600 }}
                        />
                      )}
                    </Stack>

                    <Divider sx={{ my: 1, borderColor: 'divider' }} />

                    <Typography variant="body2" color="text.secondary" sx={{ minHeight: 40, fontSize: 12.5, lineHeight: 1.45 }}>
                      {s.desc}
                    </Typography>

                    <Box sx={{ mt: 1.2 }}>
                      <Chip
                        label={s.market}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: 10,
                          fontWeight: 600,
                          bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                          color: 'text.secondary'
                        }}
                      />
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>

          <Divider sx={{ borderColor: 'divider' }} />

          {/* 2.2 Cặp Tiền & Thời Gian */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', lg: '1.4fr 1fr' },
              gap: 3
            }}
          >
            {/* Cặp tiền */}
            <Box>
              <Typography variant="subtitle1" fontWeight={700} color="text.primary" sx={{ mb: 1.2 }}>
                2. Cặp Tiền Giao Dịch (Symbol):
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {POPULAR_SYMBOLS.map((s) => {
                  const isSelected = symbol === s.symbol;
                  return (
                    <Chip
                      key={s.symbol}
                      label={s.label}
                      clickable
                      disabled={loading}
                      color={isSelected ? 'primary' : 'default'}
                      variant={isSelected ? 'filled' : 'outlined'}
                      onClick={() => setSymbol(s.symbol)}
                      sx={{
                        fontWeight: isSelected ? 800 : 500,
                        px: 1.2,
                        py: 2,
                        fontSize: '0.875rem',
                        borderRadius: 1.5,
                        borderColor: isSelected ? 'primary.main' : 'divider'
                      }}
                    />
                  );
                })}
              </Stack>
            </Box>

            {/* Khoảng thời gian */}
            <Box>
              <Typography variant="subtitle1" fontWeight={700} color="text.primary" sx={{ mb: 1.2 }}>
                3. Khoảng Thời Gian Backtest:
              </Typography>
              <TextField
                select
                fullWidth
                size="small"
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                disabled={loading}
                sx={{ bgcolor: isDark ? 'background.default' : '#fcfcfc' }}
              >
                {DURATION_OPTIONS.map((d) => (
                  <MenuItem key={d.days} value={d.days}>
                    {d.label}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
          </Box>

          <Divider sx={{ borderColor: 'divider' }} />

          {/* 2.3 Quản Lý Vốn & Nút Thực Thi */}
          <Box>
            <Typography variant="subtitle1" fontWeight={700} color="text.primary" sx={{ mb: 1.5 }}>
              4. Quản Lý Vốn & Thực Thi:
            </Typography>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: 'repeat(2, 1fr)',
                  md: 'repeat(3, 1fr) 1.2fr'
                },
                gap: 2,
                alignItems: 'center'
              }}
            >
              {/* Vốn khởi điểm */}
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: 'block', mb: 0.5 }}>
                  VỐN KHỞI ĐIỂM (USDT)
                </Typography>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  value={initialBalance}
                  onChange={(e) => setInitialBalance(e.target.value)}
                  disabled={loading}
                  InputProps={{
                    startAdornment: <InputAdornment position="start">$</InputAdornment>
                  }}
                  sx={{ bgcolor: isDark ? 'background.default' : '#fcfcfc' }}
                />
              </Box>

              {/* Ký quỹ mỗi lệnh */}
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: 'block', mb: 0.5 }}>
                  KÝ QUỸ / LỆNH (MARGIN)
                </Typography>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  value={marginPerTrade}
                  onChange={(e) => setMarginPerTrade(e.target.value)}
                  disabled={loading}
                  InputProps={{
                    startAdornment: <InputAdornment position="start">$</InputAdornment>
                  }}
                  sx={{ bgcolor: isDark ? 'background.default' : '#fcfcfc' }}
                />
              </Box>

              {/* Đòn bẩy */}
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: 'block', mb: 0.5 }}>
                  ĐÒN BẨY (LEVERAGE)
                </Typography>
                <TextField
                  select
                  fullWidth
                  size="small"
                  value={leverage}
                  onChange={(e) => setLeverage(Number(e.target.value))}
                  disabled={loading}
                  sx={{ bgcolor: isDark ? 'background.default' : '#fcfcfc' }}
                >
                  <MenuItem value={1}>1x (Không đòn bẩy)</MenuItem>
                  <MenuItem value={2}>2x</MenuItem>
                  <MenuItem value={3}>3x (Khuyên dùng Bot)</MenuItem>
                  <MenuItem value={5}>5x</MenuItem>
                </TextField>
              </Box>

              {/* Nút Run Backtest */}
              <Box sx={{ pt: { xs: 1, md: 2.2 } }}>
                <Button
                  fullWidth
                  variant="contained"
                  size="large"
                  startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <ThunderboltOutlined style={{ fontSize: 18 }} />}
                  onClick={handleRunBacktest}
                  disabled={loading}
                  sx={{
                    height: 40,
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    borderRadius: 1.5,
                    boxShadow: '0 4px 14px rgba(22, 119, 255, 0.35)',
                    '&:hover': {
                      boxShadow: '0 6px 20px rgba(22, 119, 255, 0.45)'
                    }
                  }}
                >
                  {loading ? 'Đang Chạy Mô Phỏng...' : 'Bắt Đầu Thử Nghiệm'}
                </Button>
              </Box>
            </Box>
          </Box>
        </Stack>
      </MainCard>

      {/* Error notification */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* 3. Kết Quả Kiểm Thử (Hiển Thị Khi Đã Chạy Xong) */}
      {result && result.summary && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, width: '100%' }}>
          {/* 3.1. 4 Thẻ KPI - Chuẩn CSS Grid như Tab Futures */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, 1fr)',
                md: 'repeat(4, 1fr)'
              },
              gap: 2,
              width: '100%'
            }}
          >
            {/* KPI 1: Lợi nhuận ròng */}
            <Card sx={kpiCardSx}>
              <Box>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                  <Box>
                    <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      LỢI NHUẬN RÒNG (TOTAL PNL)
                    </Typography>
                    <Typography
                      variant="h3"
                      fontWeight={700}
                      sx={{
                        mt: 0.75,
                        color: isProfitable ? 'success.main' : 'error.main'
                      }}
                    >
                      {summary.netProfit >= 0 ? `+$${summary.netProfit}` : `-$${Math.abs(summary.netProfit)}`}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      bgcolor: isProfitable 
                        ? (isDark ? alpha(theme.palette.success.main, 0.15) : '#f6ffed') 
                        : (isDark ? alpha(theme.palette.error.main, 0.15) : '#fff1f0'),
                      color: isProfitable ? 'success.main' : 'error.main'
                    }}
                  >
                    {isProfitable ? <RiseOutlined style={{ fontSize: 20 }} /> : <FallOutlined style={{ fontSize: 20 }} />}
                  </Box>
                </Stack>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
                Vốn cuối: <b>${summary.finalEquity || summary.finalBalance}</b> • Khởi điểm: <b>${summary.initialBalance}</b> (
                <span style={{ color: isProfitable ? '#52c41a' : '#ff4d4f', fontWeight: 700 }}>
                  {summary.netProfitPct >= 0 ? `+${summary.netProfitPct}%` : `${summary.netProfitPct}%`}
                </span>)
              </Typography>
            </Card>

            {/* KPI 2: Tỉ lệ thắng */}
            <Card sx={kpiCardSx}>
              <Box>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                  <Box>
                    <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      TỶ LỆ THẮNG (WIN RATE)
                    </Typography>
                    <Typography variant="h3" fontWeight={700} color="primary.main" sx={{ mt: 0.75 }}>
                      {summary.winRate}%
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      bgcolor: isDark ? alpha(theme.palette.primary.main, 0.15) : '#e6f7ff',
                      color: 'primary.main'
                    }}
                  >
                    <TrophyOutlined style={{ fontSize: 20 }} />
                  </Box>
                </Stack>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
                Tổng: <b>{summary.totalTrades}</b> lệnh (Thắng: <b style={{ color: '#52c41a' }}>{summary.winningTrades}</b> • Thua: <b style={{ color: '#ff4d4f' }}>{summary.losingTrades}</b> • Hòa: <b>{summary.breakevenTrades || 0}</b>)
              </Typography>
            </Card>

            {/* KPI 3: Profit Factor */}
            <Card sx={kpiCardSx}>
              <Box>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                  <Box>
                    <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      PROFIT FACTOR (LÃI/LỖ)
                    </Typography>
                    <Typography variant="h3" fontWeight={700} color="#722ed1" sx={{ mt: 0.75 }}>
                      {summary.profitFactor}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      bgcolor: isDark ? alpha('#722ed1', 0.15) : '#f9f0ff',
                      color: '#722ed1'
                    }}
                  >
                    <SafetyOutlined style={{ fontSize: 20 }} />
                  </Box>
                </Stack>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
                Lệnh max: <b style={{ color: '#52c41a' }}>+${summary.bestTrade}</b> • Lệnh min: <b style={{ color: '#ff4d4f' }}>${summary.worstTrade}</b>
              </Typography>
            </Card>

            {/* KPI 4: Max Drawdown */}
            <Card sx={kpiCardSx}>
              <Box>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                  <Box>
                    <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      SỤT GIẢM TỐI ĐA (MAX DD)
                    </Typography>
                    <Typography
                      variant="h3"
                      fontWeight={700}
                      sx={{
                        mt: 0.75,
                        color: summary.maxDrawdownPct > 10 ? 'error.main' : 'warning.main'
                      }}
                    >
                      {summary.maxDrawdownPct}%
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      bgcolor: isDark ? alpha(theme.palette.warning.main, 0.15) : '#fffbe6',
                      color: 'warning.main'
                    }}
                  >
                    <FallOutlined style={{ fontSize: 20 }} />
                  </Box>
                </Stack>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
                Sụt giảm: <b>-${summary.maxDrawdownUsd}</b> • Dữ liệu: <b>{summary.totalCandles || result.totalCandles}</b> nến M15 ({summary.days || result.days} ngày)
              </Typography>
            </Card>
          </Box>

          {/* 3.2. Biểu Đồ Tăng Trưởng Vốn (Equity Curve) */}
          <MainCard
            border
            title={
              <Stack direction="row" spacing={1} alignItems="center">
                <LineChartOutlined style={{ color: '#1677ff', fontSize: 18 }} />
                <Typography variant="subtitle1" fontWeight={700} color="text.primary">
                  Biểu Đồ Tăng Trưởng Vốn (Equity Curve) — {summary.symbol || result.symbol} ({summary.days || result.days} Ngày)
                </Typography>
              </Stack>
            }
          >
            <Box sx={{ width: '100%', height: 340, mt: 1 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={result.equityCurve || []} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="labEquityGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartFill} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={chartFill} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                    minTickGap={45}
                  />
                  <YAxis
                    domain={['auto', 'auto']}
                    tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                    tickFormatter={(val) => `$${val}`}
                  />
                  <ChartTooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const pt = payload[0].payload;
                        return (
                          <Paper sx={{ p: 1.5, boxShadow: 3, borderRadius: 1.5, bgcolor: isDark ? 'background.paper' : '#ffffff' }}>
                            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 0.5 }}>
                              {pt.time}
                            </Typography>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: chartStroke }}>
                              Tài Sản (Equity): ${pt.equity}
                            </Typography>
                            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                              Số dư: ${pt.balance} • Sụt giảm: {pt.drawdownPct}%
                            </Typography>
                          </Paper>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="equity"
                    stroke={chartStroke}
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#labEquityGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
          </MainCard>

          {/* 3.3. Bảng Lịch Sử Lệnh Chi Tiết */}
          <MainCard
            border
            title={
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Stack direction="row" spacing={1} alignItems="center">
                  <HistoryOutlined style={{ color: '#1677ff', fontSize: 18 }} />
                  <Typography variant="subtitle1" fontWeight={700} color="text.primary">
                    Chi Tiết Lệnh Đã Thực Hiện ({result.trades ? result.trades.length : 0} Lệnh)
                  </Typography>
                </Stack>
                <Chip
                  label={`${summary.strategyName || result.strategyName}`}
                  size="small"
                  sx={{ bgcolor: alpha('#1677ff', 0.12), color: '#1677ff', fontWeight: 700 }}
                />
              </Stack>
            }
          >
            {result.trades && result.trades.length > 0 ? (
              <TableContainer sx={{ maxHeight: 440 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>#</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Cặp Tiền</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Vị Thế</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Giá Vào</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Giá Thoát</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700 }}>Ký Quỹ</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>PnL Ròng</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700 }}>Lý Do Thoát</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700 }}>Số Nến Giữ</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Thời Gian Thoát</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {result.trades.map((tr) => {
                      const isWin = tr.netPnl > 0;
                      const isLoss = tr.netPnl < 0;

                      let reasonColor = 'default';
                      let reasonLabel = tr.exitReason;
                      if (tr.exitReason === 'TAKE_PROFIT') {
                        reasonColor = 'success';
                        reasonLabel = '🎯 Chốt Lời (TP)';
                      } else if (tr.exitReason === 'STOP_LOSS') {
                        reasonColor = 'error';
                        reasonLabel = '🛑 Cắt Lỗ (SL)';
                      } else if (tr.exitReason === 'BREAKEVEN') {
                        reasonColor = 'info';
                        reasonLabel = '⚖️ Hòa Vốn (BE)';
                      } else if (tr.exitReason === 'END_OF_DATA') {
                        reasonColor = 'warning';
                        reasonLabel = '⏱️ Hết Dữ Liệu';
                      }

                      return (
                        <TableRow key={tr.id} hover>
                          <TableCell sx={{ color: 'text.secondary' }}>{tr.id}</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>{tr.symbol}</TableCell>
                          <TableCell>
                            <Chip
                              label={tr.side}
                              size="small"
                              sx={{
                                fontWeight: 800,
                                bgcolor: tr.side === 'LONG' ? 'rgba(82, 196, 26, 0.15)' : 'rgba(255, 77, 79, 0.15)',
                                color: tr.side === 'LONG' ? '#52c41a' : '#ff4d4f'
                              }}
                            />
                          </TableCell>
                          <TableCell align="right">${tr.entryPrice.toLocaleString()}</TableCell>
                          <TableCell align="right">${tr.exitPrice.toLocaleString()}</TableCell>
                          <TableCell align="center">${tr.margin} (x{tr.leverage})</TableCell>
                          <TableCell
                            align="right"
                            sx={{
                              fontWeight: 700,
                              color: isWin ? 'success.main' : isLoss ? 'error.main' : 'text.primary'
                            }}
                          >
                            {tr.netPnl >= 0 ? `+$${tr.netPnl}` : `-$${Math.abs(tr.netPnl)}`}
                            <Typography variant="caption" sx={{ display: 'block', opacity: 0.8 }}>
                              ({tr.pnlPct >= 0 ? `+${tr.pnlPct}%` : `${tr.pnlPct}%`})
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Chip label={reasonLabel} color={reasonColor} size="small" variant="outlined" />
                          </TableCell>
                          <TableCell align="center">
                            {tr.holdCandles} nến ({(tr.holdCandles * 15 / 60).toFixed(1)}h)
                          </TableCell>
                          <TableCell align="right" sx={{ color: 'text.secondary', fontSize: 11 }}>
                            {new Date(tr.exitTime).toLocaleString([], {
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
                <InfoCircleOutlined style={{ fontSize: 32, marginBottom: 8 }} />
                <Typography variant="body1">
                  Không có lệnh nào được kích hoạt trong khoảng thời gian {summary.days || result.days} ngày này với điều kiện vào lệnh của chiến lược.
                </Typography>
              </Box>
            )}
          </MainCard>
        </Box>
      )}
    </Box>
  );
}
