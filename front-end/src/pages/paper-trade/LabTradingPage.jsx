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
  Grid,
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
  WarningOutlined
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
    name: 'Trend Pullback (EMA 200 + EMA 21 & RSI)',
    desc: 'Đánh theo xu hướng chính EMA 200, bắt nhịp hồi về EMA 21 và RSI đảo chiều. Phù hợp thị trường có sóng dài.',
    color: '#1677ff'
  },
  {
    key: 'BOLLINGER_REVERSION',
    bot: 'Bot 2',
    name: 'Bollinger Mean-Reversion (BB 20, 2 + RSI)',
    desc: 'Bắt đỉnh/đáy khi giá vượt dải Bollinger Bands kết hợp RSI quá mua (>70) hoặc quá bán (<30). Tối ưu thị trường đi ngang (Sideway).',
    color: '#722ed1'
  },
  {
    key: 'BREAKOUT_MOMENTUM',
    bot: 'Bot 3',
    name: 'Breakout Momentum (Donchian 20 + Vol Spike)',
    desc: 'Bắt điểm phá vỡ đỉnh/đáy 20 nến kèm khối lượng giao dịch đột biến (Vol > 1.5x MA20). Bắt sóng bùng nổ mạnh mẽ.',
    color: '#fa8c16'
  }
];

const POPULAR_SYMBOLS = [
  { symbol: 'BTCUSDT', name: 'Bitcoin' },
  { symbol: 'ETHUSDT', name: 'Ethereum' },
  { symbol: 'SOLUSDT', name: 'Solana' },
  { symbol: 'BNBUSDT', name: 'Binance Coin' },
  { symbol: 'PAXGUSDT', name: 'Gold (PAXG)' },
  { symbol: 'DOGEUSDT', name: 'Dogecoin' },
  { symbol: 'NEARUSDT', name: 'NEAR Protocol' },
  { symbol: 'AVAXUSDT', name: 'Avalanche' }
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

  // Form states
  const [strategyKey, setStrategyKey] = useState('TREND_PULLBACK');
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [days, setDays] = useState(30);
  const [initialBalance, setInitialBalance] = useState(100);
  const [marginPerTrade, setMarginPerTrade] = useState(15);
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
        initialBalance: Number(initialBalance),
        marginPerTrade: Number(marginPerTrade),
        leverage: Number(leverage)
      });
      setResult(data);
    } catch (err) {
      setError(err.message || 'Lỗi khi chạy backtest');
    } finally {
      setLoading(false);
    }
  };

  const isProfitable = result && result.summary && result.summary.netProfit >= 0;
  const chartStroke = isProfitable ? '#52c41a' : '#ff4d4f';
  const chartFill = isProfitable ? '#52c41a' : '#ff4d4f';

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 } }}>
      {/* Header Banner */}
      <Box
        sx={{
          mb: 3,
          p: 3,
          borderRadius: 2.5,
          background: 'linear-gradient(135deg, #091a2e 0%, #172a45 100%)',
          color: '#fff',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', md: 'center' },
          gap: 2
        }}
      >
        <Box>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
            <Box
              sx={{
                width: 42,
                height: 42,
                borderRadius: 2,
                bgcolor: 'rgba(22, 119, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#1677ff'
              }}
            >
              <ExperimentOutlined style={{ fontSize: 24 }} />
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 700, color: '#fff', m: 0 }}>
              Trading Strategy Lab
            </Typography>
            <Chip
              label="Binance 15m Engine"
              size="small"
              sx={{ bgcolor: 'rgba(82, 196, 26, 0.2)', color: '#52c41a', fontWeight: 600 }}
            />
          </Stack>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', maxWidth: 820 }}>
            Phòng thí nghiệm kiểm định hiệu quả chiến lược trên dữ liệu nến 15 phút thực tế từ Binance.
            Mô phỏng đầy đủ quy tắc Quản lý vốn, Cắt lỗ (SL), Chốt lời (TP 2R), Dời hòa vốn (Breakeven) và Phí giao dịch sàn.
          </Typography>
        </Box>
      </Box>

      {/* Control Card */}
      <MainCard title="Cấu Hình Tham Số Kiểm Thử" sx={{ mb: 3 }}>
        <Grid container spacing={2.5}>
          {/* Strategy selection */}
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              1. Chọn Chiến Lược Giao Dịch:
            </Typography>
            <TextField
              select
              fullWidth
              size="small"
              value={strategyKey}
              onChange={(e) => setStrategyKey(e.target.value)}
              disabled={loading}
            >
              {STRATEGIES.map((s) => (
                <MenuItem key={s.key} value={s.key}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip
                      label={s.bot}
                      size="small"
                      sx={{ bgcolor: alpha(s.color, 0.15), color: s.color, fontWeight: 700, height: 22 }}
                    />
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {s.name}
                    </Typography>
                  </Stack>
                </MenuItem>
              ))}
            </TextField>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.8 }}>
              {selectedStrategy.desc}
            </Typography>
          </Grid>

          {/* Symbol selection */}
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              2. Cặp Tiền Giao Dịch (Symbol):
            </Typography>
            <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
              {POPULAR_SYMBOLS.map((s) => (
                <Chip
                  key={s.symbol}
                  label={s.symbol.replace('USDT', '')}
                  clickable
                  disabled={loading}
                  color={symbol === s.symbol ? 'primary' : 'default'}
                  variant={symbol === s.symbol ? 'filled' : 'outlined'}
                  onClick={() => setSymbol(s.symbol)}
                  sx={{ fontWeight: symbol === s.symbol ? 700 : 500 }}
                />
              ))}
            </Stack>
          </Grid>

          <Grid item xs={12}>
            <Divider />
          </Grid>

          {/* Duration selection */}
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              3. Khoảng Thời Gian Backtest:
            </Typography>
            <TextField
              select
              fullWidth
              size="small"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              disabled={loading}
            >
              {DURATION_OPTIONS.map((d) => (
                <MenuItem key={d.days} value={d.days}>
                  {d.label}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          {/* Initial Balance */}
          <Grid item xs={12} sm={4} md={2.5}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              4. Vốn Khởi Điểm:
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
            />
          </Grid>

          {/* Margin Per Trade */}
          <Grid item xs={12} sm={4} md={2.5}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              5. Ký Quỹ Mỗi Lệnh:
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
            />
          </Grid>

          {/* Leverage */}
          <Grid item xs={12} sm={4} md={3}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              6. Đòn Bẩy (Leverage):
            </Typography>
            <TextField
              select
              fullWidth
              size="small"
              value={leverage}
              onChange={(e) => setLeverage(Number(e.target.value))}
              disabled={loading}
            >
              <MenuItem value={1}>1x (Không đòn bẩy)</MenuItem>
              <MenuItem value={2}>2x</MenuItem>
              <MenuItem value={3}>3x (Mặc định Bot)</MenuItem>
              <MenuItem value={5}>5x</MenuItem>
            </TextField>
          </Grid>

          {/* Action button */}
          <Grid item xs={12}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Button
                variant="contained"
                size="large"
                startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <ThunderboltOutlined />}
                onClick={handleRunBacktest}
                disabled={loading}
                sx={{
                  px: 4,
                  py: 1.2,
                  fontWeight: 700,
                  boxShadow: '0 4px 14px rgba(22, 119, 255, 0.35)'
                }}
              >
                {loading ? 'Đang Tải Nến & Chạy Mô Phỏng...' : 'Bắt Đầu Thử Nghiệm'}
              </Button>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Hệ thống sẽ tải toàn bộ nến M15 từ Binance, tính toán chỉ báo và mô phỏng từng nhịp khớp lệnh.
              </Typography>
            </Stack>
          </Grid>
        </Grid>
      </MainCard>

      {/* Error notification */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Results Section */}
      {result && result.summary && (
        <Box sx={{ animation: 'fadeIn 0.5s ease-in-out' }}>
          {/* 4 Main KPI Cards */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {/* KPI 1: Net Profit */}
            <Grid item xs={12} sm={6} md={3}>
              <Card
                sx={{
                  p: 2.5,
                  borderRadius: 2,
                  boxShadow: theme.shadows[1],
                  borderTop: `4px solid ${isProfitable ? '#52c41a' : '#ff4d4f'}`
                }}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                    Lợi Nhuận Ròng (PnL)
                  </Typography>
                  <DollarCircleOutlined style={{ fontSize: 20, color: isProfitable ? '#52c41a' : '#ff4d4f' }} />
                </Stack>
                <Typography
                  variant="h4"
                  sx={{
                    fontWeight: 700,
                    my: 1,
                    color: isProfitable ? '#52c41a' : '#ff4d4f'
                  }}
                >
                  {result.summary.netProfit >= 0 ? `+$${result.summary.netProfit}` : `-$${Math.abs(result.summary.netProfit)}`}
                  <Typography component="span" variant="body1" sx={{ ml: 1, fontWeight: 600 }}>
                    ({result.summary.netProfitPct >= 0 ? `+${result.summary.netProfitPct}%` : `${result.summary.netProfitPct}%`})
                  </Typography>
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Vốn cuối: <strong>${result.summary.finalBalance}</strong> (Khởi điểm: ${result.summary.initialBalance})
                </Typography>
              </Card>
            </Grid>

            {/* KPI 2: Win Rate */}
            <Grid item xs={12} sm={6} md={3}>
              <Card
                sx={{
                  p: 2.5,
                  borderRadius: 2,
                  boxShadow: theme.shadows[1],
                  borderTop: '4px solid #1677ff'
                }}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                    Tỉ Lệ Thắng (Winrate)
                  </Typography>
                  <TrophyOutlined style={{ fontSize: 20, color: '#1677ff' }} />
                </Stack>
                <Typography variant="h4" sx={{ fontWeight: 700, my: 1, color: '#1677ff' }}>
                  {result.summary.winRate}%
                  <Typography component="span" variant="body2" sx={{ ml: 1, color: 'text.secondary', fontWeight: 500 }}>
                    ({result.summary.totalTrades} lệnh)
                  </Typography>
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Thắng: <strong>{result.summary.winningTrades}</strong> • Thua: <strong>{result.summary.losingTrades}</strong> • Hòa: <strong>{result.summary.breakevenTrades}</strong>
                </Typography>
              </Card>
            </Grid>

            {/* KPI 3: Profit Factor */}
            <Grid item xs={12} sm={6} md={3}>
              <Card
                sx={{
                  p: 2.5,
                  borderRadius: 2,
                  boxShadow: theme.shadows[1],
                  borderTop: '4px solid #722ed1'
                }}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                    Profit Factor (Lãi/Lỗ)
                  </Typography>
                  <SafetyOutlined style={{ fontSize: 20, color: '#722ed1' }} />
                </Stack>
                <Typography variant="h4" sx={{ fontWeight: 700, my: 1, color: '#722ed1' }}>
                  {result.summary.profitFactor}
                  <Typography component="span" variant="body2" sx={{ ml: 1, color: 'text.secondary' }}>
                    {result.summary.profitFactor >= 1.5 ? '🔥 Ổn định' : result.summary.profitFactor >= 1 ? '⚠️ Cân bằng' : '❌ Kém'}
                  </Typography>
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Lệnh tốt nhất: <strong>+${result.summary.bestTrade}</strong> | Tệ nhất: <strong>${result.summary.worstTrade}</strong>
                </Typography>
              </Card>
            </Grid>

            {/* KPI 4: Max Drawdown */}
            <Grid item xs={12} sm={6} md={3}>
              <Card
                sx={{
                  p: 2.5,
                  borderRadius: 2,
                  boxShadow: theme.shadows[1],
                  borderTop: '4px solid #fa8c16'
                }}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                    Max Drawdown (Sụt Giảm Max)
                  </Typography>
                  <FallOutlined style={{ fontSize: 20, color: '#fa8c16' }} />
                </Stack>
                <Typography variant="h4" sx={{ fontWeight: 700, my: 1, color: '#fa8c16' }}>
                  {result.summary.maxDrawdownPct}%
                  <Typography component="span" variant="body2" sx={{ ml: 1, color: 'text.secondary' }}>
                    (-${result.summary.maxDrawdownUsd})
                  </Typography>
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Dữ liệu: <strong>{result.summary.totalCandles}</strong> nến M15 ({result.summary.days} ngày)
                </Typography>
              </Card>
            </Grid>
          </Grid>

          {/* Equity Curve Chart */}
          <MainCard
            title={
              <Stack direction="row" spacing={1} alignItems="center">
                <LineChartOutlined style={{ color: '#1677ff' }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Biểu Đồ Tăng Trưởng Vốn (Equity Curve) — {result.summary.symbol} ({result.summary.days} Ngày)
                </Typography>
              </Stack>
            }
            sx={{ mb: 3 }}
          >
            <Box sx={{ width: '100%', height: 320, mt: 1 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={result.equityCurve || []} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="labEquityGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartFill} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={chartFill} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 11 }}
                    minTickGap={45}
                  />
                  <YAxis
                    domain={['auto', 'auto']}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(val) => `$${val}`}
                  />
                  <ChartTooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const pt = payload[0].payload;
                        return (
                          <Paper sx={{ p: 1.5, boxShadow: 3, borderRadius: 1.5 }}>
                            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 0.5 }}>
                              {pt.time}
                            </Typography>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: chartStroke }}>
                              Tài Sản (Equity): ${pt.equity}
                            </Typography>
                            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                              Số dư: ${pt.balance} | Sụt giảm: {pt.drawdownPct}%
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

          {/* Trade Execution History Table */}
          <MainCard
            title={
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Stack direction="row" spacing={1} alignItems="center">
                  <HistoryOutlined style={{ color: '#1677ff' }} />
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    Chi Tiết Lệnh Đã Thực Hiện ({result.trades ? result.trades.length : 0} Lệnh)
                  </Typography>
                </Stack>
                <Chip
                  label={`${result.summary.strategyName}`}
                  size="small"
                  sx={{ bgcolor: 'rgba(22, 119, 255, 0.1)', color: '#1677ff', fontWeight: 600 }}
                />
              </Stack>
            }
          >
            {result.trades && result.trades.length > 0 ? (
              <TableContainer sx={{ maxHeight: 420 }}>
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
                        reasonLabel = '⏱️ Kết Thúc Dữ Liệu';
                      }

                      return (
                        <TableRow key={tr.id} hover>
                          <TableCell sx={{ color: 'text.secondary' }}>{tr.id}</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>{tr.symbol}</TableCell>
                          <TableCell>
                            <Chip
                              label={tr.side}
                              size="small"
                              sx={{
                                fontWeight: 700,
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
                              color: isWin ? '#52c41a' : isLoss ? '#ff4d4f' : 'text.primary'
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
                  Không có lệnh nào được kích hoạt trong khoảng thời gian {result.summary.days} ngày này với điều kiện vào lệnh của chiến lược.
                </Typography>
              </Box>
            )}
          </MainCard>
        </Box>
      )}
    </Box>
  );
}

