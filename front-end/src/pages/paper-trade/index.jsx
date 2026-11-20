import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Card,
  Typography,
  Button,
  Chip,
  Switch,
  FormControlLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  Divider,
  Stack,
  useTheme,
  alpha,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  InputAdornment,
  ButtonGroup
} from '@mui/material';
import {
  ReloadOutlined,
  DeleteOutlined,
  RiseOutlined,
  FallOutlined,
  ThunderboltOutlined,
  SafetyCertificateOutlined,
  DollarCircleOutlined,
  TrophyOutlined,
  SafetyOutlined,
  InboxOutlined,
  SettingOutlined,
  CheckCircleOutlined,
  PlusOutlined,
  CloseOutlined
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
import {
  getPaperTradeDashboard,
  togglePaperTradeBot,
  closePaperTradePosition,
  resetPaperTradeAccount,
  updatePaperTradeSettings,
  addPaperTradeSymbol,
  removePaperTradeSymbol
} from 'api/paperTrade';

export default function PaperTradingPage() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [toggling, setToggling] = useState(false);
  const [closingId, setClosingId] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const pollTimerRef = useRef(null);

  // Modal cài đặt mức vốn
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [customBalance, setCustomBalance] = useState('100');
  const [customRisk, setCustomRisk] = useState('2');
  const [customLeverage, setCustomLeverage] = useState('3');
  const [savingSettings, setSavingSettings] = useState(false);

  // Modal thêm cặp coin theo dõi
  const [addSymbolOpen, setAddSymbolOpen] = useState(false);
  const [inputSymbol, setInputSymbol] = useState('');
  const [addingSymbol, setAddingSymbol] = useState(false);

  const fetchData = async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      const res = await getPaperTradeDashboard();
      if (res.success && res.data) {
        setData(res.data);
        setErrorMsg('');
      }
    } catch (err) {
      if (isInitial) setErrorMsg(err.message);
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(true);
    pollTimerRef.current = setInterval(() => {
      fetchData(false);
    }, 2500);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  const handleToggleBot = async () => {
    if (!data?.account) return;
    try {
      setToggling(true);
      const nextState = !data.account.is_bot_active;
      await togglePaperTradeBot(nextState);
      await fetchData(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setToggling(false);
    }
  };

  const handleClosePosition = async (positionId) => {
    if (!window.confirm('Anh có chắc muốn đóng vị thế này bằng tay không?')) return;
    try {
      setClosingId(positionId);
      await closePaperTradePosition(positionId);
      await fetchData(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setClosingId(null);
    }
  };

  // Mở modal cài đặt vốn
  const handleOpenSettings = () => {
    if (data?.account) {
      const bal = parseFloat(data.account.balance || 100);
      setCustomBalance(String(bal));
      setCustomRisk(String(data.account.risk_per_trade || (bal * 0.02).toFixed(1)));
      setCustomLeverage(String(data.account.leverage || 3));
    }
    setSettingsOpen(true);
  };

  // Cập nhật vốn không reset lịch sử lệnh
  const handleSaveCapital = async () => {
    const balNum = parseFloat(customBalance);
    const riskNum = parseFloat(customRisk);
    const levNum = parseInt(customLeverage, 10);
    if (isNaN(balNum) || balNum <= 0) {
      alert('Vui lòng nhập mức vốn hợp lệ (> 0)');
      return;
    }

    try {
      setSavingSettings(true);
      await updatePaperTradeSettings({
        balance: balNum,
        riskPerTrade: riskNum,
        leverage: levNum
      });
      setSettingsOpen(false);
      await fetchData(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  // Reset tài khoản với số vốn mới
  const handleResetWithCapital = async () => {
    const balNum = parseFloat(customBalance);
    const riskNum = parseFloat(customRisk);
    const levNum = parseInt(customLeverage, 10);
    if (isNaN(balNum) || balNum <= 0) {
      alert('Vui lòng nhập mức vốn hợp lệ (> 0)');
      return;
    }

    if (!window.confirm(`Reset sẽ xóa toàn bộ vị thế và lịch sử lệnh, đưa vốn về lại $${balNum.toFixed(2)} USDT. Anh có chắc không?`)) {
      return;
    }

    try {
      setSavingSettings(true);
      await resetPaperTradeAccount(balNum, riskNum, levNum);
      setSettingsOpen(false);
      await fetchData(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleAddSymbol = async (symToAdd) => {
    const sym = (symToAdd || inputSymbol).toUpperCase().trim();
    if (!sym) return;
    try {
      setAddingSymbol(true);
      await addPaperTradeSymbol(sym, 'futures');
      setInputSymbol('');
      setAddSymbolOpen(false);
      await fetchData(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setAddingSymbol(false);
    }
  };

  const handleRemoveSymbol = async (symToRemove) => {
    if (!window.confirm(`Anh có muốn bỏ theo dõi cặp ${symToRemove} không?`)) return;
    try {
      await removePaperTradeSymbol(symToRemove, 'futures');
      await fetchData(false);
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading && !data) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  const account = data?.account || {};
  const positions = data?.positions || [];
  const orders = data?.orders || [];
  const snapshots = (data?.equitySnapshots || []).map((s) => {
    const d = new Date(s.timestamp);
    const dateStr = `${d.getDate()}/${d.getMonth() + 1}`;
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return {
      time: `${dateStr} ${timeStr}`,
      rawTime: s.timestamp,
      equity: parseFloat(s.equity),
      balance: parseFloat(s.balance)
    };
  });
  const livePrices = data?.livePrices || {};
  const logs = data?.logs || [];
  const lastEvaluations = data?.lastEvaluations || {};

  const balance = parseFloat(account.balance || 100);
  const equity = parseFloat(account.equity || balance);
  const initialBalance = parseFloat(account.initial_balance || 100);
  const totalPnL = equity - initialBalance;
  const totalPnLPct = initialBalance > 0 ? (totalPnL / initialBalance) * 100 : 0;
  const unrealizedPnL = parseFloat(account.unrealized_pnl || 0);

  const kpiCardSx = {
    p: 2.25,
    height: '100%',
    width: '100%',
    bgcolor: 'background.paper',
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: 1.5,
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, width: '100%' }}>
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
                  width: 42,
                  height: 42,
                  borderRadius: 1.5,
                  bgcolor: isDark ? alpha(theme.palette.primary.main, 0.15) : alpha(theme.palette.primary.main, 0.1),
                  color: 'primary.main'
                }}
              >
                <ThunderboltOutlined style={{ fontSize: 24 }} />
              </Box>
              <Box>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography variant="h4" fontWeight={700} color="text.primary">
                    Auto Trade
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
                    label="Binance Feed Live"
                    size="small"
                    variant="outlined"
                    color="success"
                    sx={{ fontWeight: 600, height: 24 }}
                  />
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  Vốn: <b>${balance.toFixed(2)} USDT</b> • Đòn bẩy {account.leverage || 3}x • Rủi ro ${parseFloat(account.risk_per_trade || 2).toFixed(2)}/lệnh • Chiến lược Trend Following EMA + RSI + ATR
                </Typography>
              </Box>
            </Stack>
          </Box>

          <Stack direction="row" spacing={1.5} alignItems="center">
            <FormControlLabel
              control={
                <Switch
                  checked={Boolean(account.is_bot_active)}
                  onChange={handleToggleBot}
                  disabled={toggling}
                  color="success"
                />
              }
              label={
                <Typography
                  variant="subtitle2"
                  sx={{
                    color: account.is_bot_active ? 'success.main' : 'error.main',
                    fontWeight: 700
                  }}
                >
                  {account.is_bot_active ? 'BOT: ĐANG BẬT' : 'BOT: ĐANG TẮT'}
                </Typography>
              }
            />

            <Button
              variant="outlined"
              size="small"
              color="primary"
              onClick={handleOpenSettings}
              startIcon={<SettingOutlined />}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              Chỉnh vốn (${balance.toFixed(0)})
            </Button>

            <Tooltip title="Làm mới dữ liệu">
              <IconButton
                onClick={() => fetchData(false)}
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1.5,
                  color: 'text.secondary'
                }}
              >
                <ReloadOutlined />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>
      </MainCard>

      {errorMsg && (
        <Alert severity="error" onClose={() => setErrorMsg('')}>
          {errorMsg}
        </Alert>
      )}

      {/* 2. Top Metric KPI Cards - Dàn đều 100% bằng CSS Grid */}
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
        {/* KPI 1: Tài sản & Vốn */}
        <Card sx={kpiCardSx}>
          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  TÀI SẢN (EQUITY)
                </Typography>
                <Typography variant="h3" fontWeight={700} color="text.primary" sx={{ mt: 0.75 }}>
                  ${equity.toFixed(2)}
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
                <DollarCircleOutlined style={{ fontSize: 20 }} />
              </Box>
            </Stack>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
            Số dư ví: <b>${balance.toFixed(2)}</b> • Khởi tạo: <b>${initialBalance.toFixed(2)}</b>
          </Typography>
        </Card>

        {/* KPI 2: Lợi nhuận ròng tổng */}
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
                    color: totalPnL >= 0 ? 'success.main' : 'error.main'
                  }}
                >
                  {totalPnL >= 0 ? `+$${totalPnL.toFixed(2)}` : `-$${Math.abs(totalPnL).toFixed(2)}`}
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
                  bgcolor: totalPnL >= 0 
                    ? (isDark ? alpha(theme.palette.success.main, 0.15) : '#f6ffed') 
                    : (isDark ? alpha(theme.palette.error.main, 0.15) : '#fff1f0'),
                  color: totalPnL >= 0 ? 'success.main' : 'error.main'
                }}
              >
                {totalPnL >= 0 ? <RiseOutlined style={{ fontSize: 20 }} /> : <FallOutlined style={{ fontSize: 20 }} />}
              </Box>
            </Stack>
          </Box>
          <Typography
            variant="caption"
            fontWeight={600}
            sx={{
              mt: 1.5,
              display: 'block',
              color: totalPnL >= 0 ? 'success.main' : 'error.main'
            }}
          >
            {totalPnLPct >= 0 ? `+${totalPnLPct.toFixed(1)}%` : `${totalPnLPct.toFixed(1)}%`} so với vốn ban đầu
          </Typography>
        </Card>

        {/* KPI 3: Tỷ lệ thắng */}
        <Card sx={kpiCardSx}>
          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  TỶ LỆ THẮNG (WIN RATE)
                </Typography>
                <Typography variant="h3" fontWeight={700} color="primary.main" sx={{ mt: 0.75 }}>
                  {account.winrate || 0}%
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
                <TrophyOutlined style={{ fontSize: 20 }} />
              </Box>
            </Stack>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
            Tổng: <b>{account.total_trades || 0}</b> lệnh ({account.winning_trades || 0} Thắng - {account.losing_trades || 0} Thua)
          </Typography>
        </Card>

        {/* KPI 4: Sụt giảm tối đa */}
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
                    color: parseFloat(account.max_drawdown_pct || 0) > 10 ? 'error.main' : 'warning.main'
                  }}
                >
                  {parseFloat(account.max_drawdown_pct || 0).toFixed(1)}%
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
                  bgcolor: isDark ? alpha(theme.palette.warning.main, 0.15) : '#fff7e6',
                  color: 'warning.main'
                }}
              >
                <SafetyOutlined style={{ fontSize: 20 }} />
              </Box>
            </Stack>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
            Rủi ro mỗi lệnh: <b>${parseFloat(account.risk_per_trade || 2).toFixed(2)}</b> ({initialBalance > 0 ? ((parseFloat(account.risk_per_trade || 2) / initialBalance) * 100).toFixed(0) : 2}% vốn)
          </Typography>
        </Card>
      </Box>

      {/* 3. Live Prices & Strategy Technical Status - Dàn đều 100% linh hoạt theo số cặp coin */}
      <MainCard
        border
        title={
          <Typography variant="subtitle1" fontWeight={700} color="text.primary">
            GIÁ THỊ TRƯỜNG REALTIME & CHỈ BÁO KỸ THUẬT (M15)
          </Typography>
        }
        secondary={
          <Button
            variant="outlined"
            size="small"
            color="primary"
            startIcon={<PlusOutlined />}
            onClick={() => setAddSymbolOpen(true)}
            sx={{ textTransform: 'none', fontWeight: 600, fontSize: 12, borderRadius: 1.5 }}
          >
            + Thêm cặp Coin
          </Button>
        }
        sx={{ width: '100%' }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              md: 'repeat(3, 1fr)',
              xl: 'repeat(4, 1fr)'
            },
            gap: 2,
            width: '100%'
          }}
        >
          {(data?.trackedSymbols || ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']).map((sym) => {
            const price = livePrices[sym];
            const evalState = lastEvaluations[sym];
            const inds = evalState?.indicators;
            const signalAction = evalState?.action || 'HOLD';

            return (
              <Box
                key={sym}
                sx={{
                  p: 2,
                  bgcolor: isDark ? 'background.default' : 'grey.50',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1.5,
                  width: '100%',
                  position: 'relative'
                }}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                    <Typography variant="subtitle1" fontWeight={700} color="text.primary">
                      {sym}
                    </Typography>
                    {signalAction === 'LONG' && (
                      <Chip label="LONG SIGNAL" size="small" color="success" sx={{ height: 20, fontSize: 10, fontWeight: 700 }} />
                    )}
                    {signalAction === 'SHORT' && (
                      <Chip label="SHORT SIGNAL" size="small" color="error" sx={{ height: 20, fontSize: 10, fontWeight: 700 }} />
                    )}
                  </Stack>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <Typography variant="h5" fontWeight={700} color="primary.main">
                      ${price ? Number(price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---'}
                    </Typography>
                    <Tooltip title={`Bỏ theo dõi ${sym}`}>
                      <IconButton
                        size="small"
                        onClick={() => handleRemoveSymbol(sym)}
                        sx={{
                          p: 0.5,
                          ml: 0.5,
                          color: 'text.secondary',
                          '&:hover': { color: 'error.main', bgcolor: alpha(theme.palette.error.main, 0.1) }
                        }}
                      >
                        <CloseOutlined style={{ fontSize: 12 }} />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Stack>

                <Divider sx={{ my: 1.5, borderColor: 'divider' }} />

                {inds ? (
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">EMA 200:</Typography>{' '}
                      <Typography variant="caption" fontWeight={600} color="text.primary">${inds.ema200.toLocaleString()}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">EMA 21:</Typography>{' '}
                      <Typography variant="caption" fontWeight={600} color="text.primary">${inds.ema21.toLocaleString()}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">RSI (14):</Typography>{' '}
                      <Typography
                        variant="caption"
                        fontWeight={700}
                        sx={{
                          color: inds.rsi > 70 ? 'error.main' : inds.rsi < 30 ? 'success.main' : 'text.primary'
                        }}
                      >
                        {inds.rsi}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">ATR (14):</Typography>{' '}
                      <Typography variant="caption" fontWeight={600} color="text.primary">${inds.atr}</Typography>
                    </Box>
                  </Box>
                ) : (
                  <Typography variant="caption" color="text.secondary">
                    Đang đồng bộ nến kỹ thuật...
                  </Typography>
                )}
              </Box>
            );
          })}
        </Box>
      </MainCard>

      {/* 4. Vị thế đang mở (Open Positions) */}
      <MainCard
        border
        title={
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Typography variant="subtitle1" fontWeight={700} color="text.primary">
              VỊ THẾ ĐANG MỞ ({positions.length})
            </Typography>
            {unrealizedPnL !== 0 && (
              <Chip
                size="small"
                label={`Lãi/Lỗ tạm tính: ${unrealizedPnL >= 0 ? '+' : ''}$${unrealizedPnL.toFixed(2)}`}
                color={unrealizedPnL >= 0 ? 'success' : 'error'}
                sx={{ fontWeight: 700, height: 22 }}
              />
            )}
          </Stack>
        }
        sx={{ width: '100%' }}
      >
        {positions.length === 0 ? (
          <Box sx={{ py: 5, textAlign: 'center' }}>
            <InboxOutlined style={{ fontSize: 40, color: theme.palette.text.secondary }} />
            <Typography variant="body1" fontWeight={600} color="text.primary" sx={{ mt: 1.5 }}>
              Hiện không có vị thế mở
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 500, mx: 'auto' }}>
              Bot đang theo dõi nến M15. Khi xuất hiện nhịp hồi (pullback) chạm EMA 21 đúng chiều xu hướng chính, bot sẽ tự động khớp lệnh.
            </Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead sx={{ bgcolor: isDark ? 'background.default' : 'grey.100' }}>
                <TableRow>
                  <TableCell><b>Cặp coin</b></TableCell>
                  <TableCell><b>Chiều</b></TableCell>
                  <TableCell align="right"><b>Giá vào (Entry)</b></TableCell>
                  <TableCell align="right"><b>Giá hiện tại</b></TableCell>
                  <TableCell align="right"><b>Khối lượng</b></TableCell>
                  <TableCell align="right"><b>Ký quỹ (Margin)</b></TableCell>
                  <TableCell align="right"><b>Cắt lỗ (SL)</b></TableCell>
                  <TableCell align="right"><b>Chốt lời (TP)</b></TableCell>
                  <TableCell align="right"><b>Lãi/Lỗ chưa chốt</b></TableCell>
                  <TableCell align="center"><b>Bảo toàn vốn</b></TableCell>
                  <TableCell align="center"><b>Thao tác</b></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {positions.map((pos) => {
                  const pnl = parseFloat(pos.unrealized_pnl || 0);
                  const pnlPct = parseFloat(pos.unrealized_pnl_pct || 0);
                  const isLong = pos.side === 'LONG';
                  return (
                    <TableRow key={pos.id} hover>
                      <TableCell>
                        <Typography variant="subtitle2" fontWeight={700} color="text.primary">
                          {pos.symbol}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={pos.side}
                          size="small"
                          color={isLong ? 'success' : 'error'}
                          sx={{ fontWeight: 700, height: 22 }}
                        />
                      </TableCell>
                      <TableCell align="right">${parseFloat(pos.entry_price).toFixed(2)}</TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={700} color="primary.main">
                          ${parseFloat(pos.current_price).toFixed(2)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">{parseFloat(pos.quantity).toFixed(4)}</TableCell>
                      <TableCell align="right">${parseFloat(pos.margin).toFixed(2)} ({pos.leverage}x)</TableCell>
                      <TableCell align="right" sx={{ color: 'error.main', fontWeight: 600 }}>
                        ${parseFloat(pos.stop_loss).toFixed(2)}
                      </TableCell>
                      <TableCell align="right" sx={{ color: 'success.main', fontWeight: 600 }}>
                        ${parseFloat(pos.take_profit).toFixed(2)}
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          fontWeight={700}
                          sx={{ color: pnl >= 0 ? 'success.main' : 'error.main' }}
                        >
                          {pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        {pos.is_breakeven_triggered ? (
                          <Chip
                            icon={<SafetyCertificateOutlined />}
                            label="SL @ Entry (0 Risk)"
                            size="small"
                            color="success"
                            variant="outlined"
                            sx={{ height: 22 }}
                          />
                        ) : (
                          <Typography variant="caption" color="text.secondary">Chờ +1R</Typography>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <Button
                          variant="contained"
                          size="small"
                          color="error"
                          onClick={() => handleClosePosition(pos.id)}
                          disabled={closingId === pos.id}
                          sx={{ textTransform: 'none', py: 0.25, px: 1.25 }}
                        >
                          {closingId === pos.id ? 'Đang đóng...' : 'Đóng ngay'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </MainCard>

      {/* 5. Biểu đồ tăng trưởng tài khoản (Equity Curve) */}
      <MainCard
        border
        title={
          <Typography variant="subtitle1" fontWeight={700} color="text.primary">
            ĐƯỜNG CONG TĂNG TRƯỞNG VỐN (EQUITY CURVE)
          </Typography>
        }
        sx={{ width: '100%' }}
      >
        <Box sx={{ width: '100%', height: 260 }}>
          {snapshots.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={snapshots}>
                <defs>
                  <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={theme.palette.primary.main} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={theme.palette.primary.main} stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke={isDark ? 'rgba(255, 255, 255, 0.08)' : theme.palette.divider}
                />
                <XAxis
                  dataKey="time"
                  stroke={theme.palette.text.secondary}
                  fontSize={11}
                  tickLine={false}
                  minTickGap={40}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  stroke={theme.palette.text.secondary}
                  fontSize={12}
                  tickLine={false}
                  tickFormatter={(v) => `$${v}`}
                />
                <ChartTooltip
                  contentStyle={{
                    backgroundColor: theme.palette.background.paper,
                    borderColor: theme.palette.divider,
                    borderRadius: 8,
                    color: theme.palette.text.primary,
                    boxShadow: theme.customShadows?.z1
                  }}
                  formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Tài sản (Equity)']}
                  labelFormatter={(label) => `Thời gian: ${label}`}
                />
                <Area
                  type="monotone"
                  dataKey="equity"
                  stroke={theme.palette.primary.main}
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#equityGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <Typography variant="body2" color="text.secondary">
                Đang ghi nhận dữ liệu biểu đồ...
              </Typography>
            </Box>
          )}
        </Box>
      </MainCard>

      {/* 6. Lịch sử giao dịch & Nhật ký hoạt động Bot - Dàn đều 2 cột */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            md: '7fr 5fr'
          },
          gap: 2.5,
          width: '100%'
        }}
      >
        {/* Lịch sử lệnh đã chốt */}
        <MainCard
          border
          title={
            <Typography variant="subtitle1" fontWeight={700} color="text.primary">
              LỊCH SỬ LỆNH ĐÃ CHỐT ({orders.length})
            </Typography>
          }
          contentSX={{ p: 0 }}
          sx={{ width: '100%' }}
        >
          {orders.length === 0 ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">Chưa có lệnh nào được chốt.</Typography>
            </Box>
          ) : (
            <TableContainer sx={{ maxHeight: 340 }}>
              <Table size="small" stickyHeader>
                <TableHead sx={{ bgcolor: isDark ? 'background.default' : 'grey.100' }}>
                  <TableRow>
                    <TableCell><b>Thời gian</b></TableCell>
                    <TableCell><b>Cặp coin</b></TableCell>
                    <TableCell><b>Chiều</b></TableCell>
                    <TableCell align="right"><b>Giá vào/ra</b></TableCell>
                    <TableCell align="right"><b>Lãi/Lỗ ròng</b></TableCell>
                    <TableCell align="center"><b>Lý do thoát</b></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {orders.map((o) => {
                    const pnl = parseFloat(o.realized_pnl);
                    const isWin = pnl >= 0;
                    return (
                      <TableRow key={o.id} hover>
                        <TableCell sx={{ fontSize: 12 }}>
                          {new Date(o.closed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </TableCell>
                        <TableCell><b>{o.symbol}</b></TableCell>
                        <TableCell>
                          <Chip
                            label={o.side}
                            size="small"
                            color={o.side === 'LONG' ? 'success' : 'error'}
                            sx={{ fontWeight: 700, height: 20, fontSize: 10 }}
                          />
                        </TableCell>
                        <TableCell align="right" sx={{ fontSize: 12 }}>
                          ${parseFloat(o.entry_price).toFixed(2)} → ${parseFloat(o.exit_price).toFixed(2)}
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="body2"
                            fontWeight={700}
                            sx={{ color: isWin ? 'success.main' : 'error.main' }}
                          >
                            {isWin ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            label={o.exit_reason}
                            size="small"
                            variant="outlined"
                            color={isWin ? 'success' : 'error'}
                            sx={{ fontSize: 10, height: 20 }}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </MainCard>

        {/* Nhật ký hoạt động Bot (Logs) */}
        <MainCard
          border
          title={
            <Typography variant="subtitle1" fontWeight={700} color="text.primary">
              NHẬT KÝ HOẠT ĐỘNG BOT (LOGS)
            </Typography>
          }
          sx={{ width: '100%' }}
        >
          <Box sx={{ maxHeight: 340, overflowY: 'auto' }}>
            {logs.length === 0 ? (
              <Typography variant="body2" color="text.secondary">Chưa có nhật ký hoạt động.</Typography>
            ) : (
              logs.map((log) => (
                <Box
                  key={log.id}
                  sx={{
                    mb: 1.25,
                    pb: 1,
                    borderBottom: '1px dashed',
                    borderColor: 'divider'
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="caption" color="text.secondary" sx={{ minWidth: 60, fontSize: 11 }}>
                      {new Date(log.created_at).toLocaleTimeString()}
                    </Typography>
                    <Chip
                      label={log.symbol || 'SYS'}
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: 10,
                        fontWeight: 600,
                        bgcolor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'grey.200'
                      }}
                    />
                    <Typography
                      variant="body2"
                      sx={{
                        fontSize: 12,
                        color: log.level === 'SUCCESS' 
                          ? 'success.main' 
                          : log.level === 'WARN' 
                          ? 'warning.main' 
                          : 'text.primary'
                      }}
                    >
                      {log.message}
                    </Typography>
                  </Stack>
                </Box>
              ))
            )}
          </Box>
        </MainCard>
      </Box>

      {/* 7. Dialog Cài đặt mức vốn & Quản lý rủi ro */}
      <Dialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: 'background.paper',
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider'
          }
        }}
      >
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
          Cài đặt Vốn & Quản lý Rủi ro
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
            Tùy chỉnh số vốn ban đầu và các thông số rủi ro cho tài khoản Auto Trade của anh:
          </Typography>

          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
            Mức vốn tài khoản (USDT):
          </Typography>
          <TextField
            fullWidth
            type="number"
            value={customBalance}
            onChange={(e) => {
              const val = e.target.value;
              setCustomBalance(val);
              // Tự động gợi ý mức rủi ro 2% vốn
              const num = parseFloat(val);
              if (!isNaN(num) && num > 0) {
                setCustomRisk(String(Math.max(1, Number((num * 0.02).toFixed(1)))));
              }
            }}
            InputProps={{
              startAdornment: <InputAdornment position="start">$</InputAdornment>,
              endAdornment: <InputAdornment position="end">USDT</InputAdornment>
            }}
            sx={{ mb: 1.5 }}
          />

          {/* Quick preset buttons */}
          <Stack direction="row" spacing={1} sx={{ mb: 2.5 }}>
            {['100', '200', '500', '1000'].map((preset) => (
              <Chip
                key={preset}
                label={`$${preset}`}
                clickable
                color={customBalance === preset ? 'primary' : 'default'}
                variant={customBalance === preset ? 'filled' : 'outlined'}
                onClick={() => {
                  setCustomBalance(preset);
                  const num = parseFloat(preset);
                  setCustomRisk(String(Math.max(1, Number((num * 0.02).toFixed(1)))));
                }}
                sx={{ fontWeight: 600 }}
              />
            ))}
          </Stack>

          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
            Rủi ro mỗi lệnh (Risk per Trade):
          </Typography>
          <TextField
            fullWidth
            type="number"
            value={customRisk}
            onChange={(e) => setCustomRisk(e.target.value)}
            helperText={`Khoảng ${customBalance > 0 ? ((parseFloat(customRisk || 0) / parseFloat(customBalance)) * 100).toFixed(1) : 2}% số vốn cho mỗi lệnh cắt lỗ`}
            InputProps={{
              startAdornment: <InputAdornment position="start">$</InputAdornment>,
              endAdornment: <InputAdornment position="end">USDT</InputAdornment>
            }}
            sx={{ mb: 2.5 }}
          />

          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
            Đòn bẩy (Leverage):
          </Typography>
          <Stack direction="row" spacing={1}>
            {['2', '3', '5', '10'].map((lev) => (
              <Chip
                key={lev}
                label={`${lev}x`}
                clickable
                color={customLeverage === lev ? 'primary' : 'default'}
                variant={customLeverage === lev ? 'filled' : 'outlined'}
                onClick={() => setCustomLeverage(lev)}
                sx={{ fontWeight: 600, minWidth: 50 }}
              />
            ))}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, pt: 1, gap: 1 }}>
          <Button
            variant="outlined"
            color="inherit"
            onClick={() => setSettingsOpen(false)}
            disabled={savingSettings}
            sx={{ textTransform: 'none' }}
          >
            Hủy
          </Button>

          <Button
            variant="outlined"
            color="error"
            onClick={handleResetWithCapital}
            disabled={savingSettings}
            startIcon={<DeleteOutlined />}
            sx={{ textTransform: 'none' }}
          >
            Reset tài khoản (${customBalance})
          </Button>

          <Button
            variant="contained"
            color="primary"
            onClick={handleSaveCapital}
            disabled={savingSettings}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            {savingSettings ? 'Đang lưu...' : 'Áp dụng'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal thêm cặp Coin theo dõi Futures */}
      <Dialog
        open={addSymbolOpen}
        onClose={() => setAddSymbolOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: 'background.paper',
            backgroundImage: 'none',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2
          }
        }}
      >
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
          Thêm cặp Coin theo dõi Futures
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Nhập mã coin trên sàn Binance để hệ thống tự động kết nối dữ liệu nến M15 realtime, phân tích EMA + RSI + ATR và tự động quét tín hiệu Long/Short:
          </Typography>

          <TextField
            fullWidth
            autoFocus
            placeholder="Ví dụ: DOGE hoặc DOGEUSDT"
            value={inputSymbol}
            onChange={(e) => setInputSymbol(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddSymbol();
              }
            }}
            InputProps={{
              endAdornment: <InputAdornment position="end">USDT</InputAdornment>
            }}
            sx={{ mb: 2 }}
          />

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontWeight: 600 }}>
            Gợi ý các cặp coin phổ biến:
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
            {['BNB', 'DOGE', 'XRP', 'ADA', 'AVAX', 'NEAR', 'SUI', 'LINK', 'PEPE'].map((coin) => {
              const fullSym = `${coin}USDT`;
              const isTracked = (data?.trackedSymbols || ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']).includes(fullSym);
              return (
                <Chip
                  key={coin}
                  label={coin}
                  clickable={!isTracked}
                  disabled={isTracked}
                  color={isTracked ? 'default' : 'primary'}
                  variant={isTracked ? 'outlined' : 'filled'}
                  onClick={() => handleAddSymbol(fullSym)}
                  sx={{ fontWeight: 600, fontSize: 12 }}
                />
              );
            })}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button variant="outlined" color="inherit" onClick={() => setAddSymbolOpen(false)}>
            Hủy
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={() => handleAddSymbol()}
            disabled={addingSymbol || !inputSymbol.trim()}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            {addingSymbol ? 'Đang thêm...' : 'Thêm cặp Coin'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
