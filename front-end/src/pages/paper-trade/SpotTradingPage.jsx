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
  InputAdornment
} from '@mui/material';
import {
  ReloadOutlined,
  DeleteOutlined,
  RiseOutlined,
  FallOutlined,
  ThunderboltOutlined,
  DollarCircleOutlined,
  TrophyOutlined,
  SafetyOutlined,
  InboxOutlined,
  SettingOutlined,
  ShoppingOutlined,
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
  sellSpotHolding,
  buySpotHolding,
  resetPaperTradeAccount,
  updatePaperTradeSettings,
  addPaperTradeSymbol,
  removePaperTradeSymbol,
  withdrawPaperTradeProfit
} from 'api/paperTrade';

export default function SpotTradingPage() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [toggling, setToggling] = useState(false);
  const [actionSymbol, setActionSymbol] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const pollTimerRef = useRef(null);

  // Modal cài đặt mức vốn Spot
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [customBalance, setCustomBalance] = useState('100');
  const [customTranche, setCustomTranche] = useState('25');
  const [savingSettings, setSavingSettings] = useState(false);

  // Modal thêm cặp coin theo dõi
  const [addSymbolOpen, setAddSymbolOpen] = useState(false);
  const [inputSymbol, setInputSymbol] = useState('');
  const [addingSymbol, setAddingSymbol] = useState(false);

  // Modal rút tiền lãi về két
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawSuccessMsg, setWithdrawSuccessMsg] = useState('');

  const fetchData = async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      const res = await getPaperTradeDashboard('spot');
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
      await togglePaperTradeBot(nextState, 'spot');
      await fetchData(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setToggling(false);
    }
  };

  const handleSell = async (symbol) => {
    if (!window.confirm(`Anh có chắc muốn bán toàn bộ số coin ${symbol} đang nắm giữ để chốt lời về USDT?`)) return;
    try {
      setActionSymbol(symbol);
      await sellSpotHolding(symbol);
      await fetchData(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setActionSymbol(null);
    }
  };

  const handleBuyTranche = async (symbol) => {
    const tranche = parseFloat(data?.account?.risk_per_trade || 25);
    if (!window.confirm(`Mua gom 1 phần ${symbol} trị giá $${tranche} USDT?`)) return;
    try {
      setActionSymbol(symbol);
      await buySpotHolding(symbol, tranche);
      await fetchData(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setActionSymbol(null);
    }
  };

  const handleAddSymbol = async (symToAdd) => {
    const sym = (symToAdd || inputSymbol).toUpperCase().trim();
    if (!sym) return;
    try {
      setAddingSymbol(true);
      await addPaperTradeSymbol(sym, 'spot');
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
      await removePaperTradeSymbol(symToRemove, 'spot');
      await fetchData(false);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleOpenSettings = () => {
    if (data?.account) {
      const bal = parseFloat(data.account.balance || 100);
      setCustomBalance(String(bal));
      setCustomTranche(String(data.account.risk_per_trade || (bal * 0.25).toFixed(0)));
    }
    setSettingsOpen(true);
  };

  const handleSaveCapital = async () => {
    const balNum = parseFloat(customBalance);
    const trancheNum = parseFloat(customTranche);
    if (isNaN(balNum) || balNum <= 0) {
      alert('Vui lòng nhập mức vốn hợp lệ (> 0)');
      return;
    }

    try {
      setSavingSettings(true);
      await updatePaperTradeSettings({
        balance: balNum,
        riskPerTrade: trancheNum,
        leverage: 1,
        mode: 'spot'
      });
      setSettingsOpen(false);
      await fetchData(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleOpenWithdraw = () => {
    const curEquity = totalEquity;
    const initBal = parseFloat(data?.account?.initial_balance || 100);
    const profitAboveInit = Math.max(0, curEquity - initBal);
    // Số tiền rút tối đa không được vượt quá tiền mặt USDT khả dụng
    const maxCanWithdraw = Math.min(profitAboveInit, usdtBalance);
    setWithdrawAmount(maxCanWithdraw > 0 ? maxCanWithdraw.toFixed(2) : '');
    setWithdrawOpen(true);
  };

  const handleConfirmWithdraw = async () => {
    const amt = parseFloat(withdrawAmount);
    if (isNaN(amt) || amt <= 0) {
      alert('Vui lòng nhập số tiền rút hợp lệ (> 0)');
      return;
    }
    try {
      setWithdrawing(true);
      const res = await withdrawPaperTradeProfit({ amount: amt, mode: 'spot' });
      setWithdrawOpen(false);
      setWithdrawSuccessMsg(`🎉 ${res.message || `Đã rút thành công $${amt.toFixed(2)} USDT về két!`}`);
      setTimeout(() => setWithdrawSuccessMsg(''), 6000);
      await fetchData(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setWithdrawing(false);
    }
  };

  const handleResetWithCapital = async () => {
    const balNum = parseFloat(customBalance);
    const trancheNum = parseFloat(customTranche);
    if (isNaN(balNum) || balNum <= 0) {
      alert('Vui lòng nhập mức vốn hợp lệ (> 0)');
      return;
    }

    if (!window.confirm(`Reset sẽ xóa toàn bộ danh mục coin Spot và lịch sử lệnh, đưa vốn USDT về lại $${balNum.toFixed(2)}. Anh có chắc không?`)) {
      return;
    }

    try {
      setSavingSettings(true);
      await resetPaperTradeAccount(balNum, trancheNum, 1, 'spot');
      setSettingsOpen(false);
      await fetchData(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingSettings(false);
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
  const holdings = data?.holdings || [];
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

  const usdtBalance = parseFloat(account.balance || 100);
  const totalCoinValue = holdings.reduce((sum, h) => sum + parseFloat(h.current_value || 0), 0);
  const totalCost = holdings.reduce((sum, h) => sum + parseFloat(h.total_cost || 0), 0);
  const totalEquity = usdtBalance + totalCoinValue;
  const initialBalance = parseFloat(account.initial_balance || 100);
  const totalPnL = totalEquity - initialBalance;
  const totalPnLPct = initialBalance > 0 ? (totalPnL / initialBalance) * 100 : 0;
  const unrealizedPnL = totalCoinValue - totalCost;
  const totalWithdrawn = parseFloat(account.total_withdrawn_profit || 0);

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
                  bgcolor: isDark ? alpha(theme.palette.success.main, 0.15) : alpha(theme.palette.success.main, 0.1),
                  color: 'success.main'
                }}
              >
                <ShoppingOutlined style={{ fontSize: 24 }} />
              </Box>
              <Box>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography variant="h4" fontWeight={700} color="text.primary">
                    Auto Trade — Spot
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
                    label="Giao ngay (1x) • An toàn 0% cháy"
                    size="small"
                    variant="outlined"
                    color="success"
                    sx={{ fontWeight: 600, height: 24 }}
                  />
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  Vốn: <b>${usdtBalance.toFixed(2)} USDT</b> • Kích thước đợt gom (Tranche): ${parseFloat(account.risk_per_trade || 10).toFixed(0)} • Smart RSI DCA: Gom RSI ≤ 35 (max 3 đợt) • TP ≥ +4.5% • SL -6% (Phanh dừng DCA tại -5%)
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
              variant="contained"
              size="small"
              color="success"
              onClick={handleOpenWithdraw}
              startIcon={<DollarCircleOutlined />}
              sx={{ textTransform: 'none', fontWeight: 700 }}
            >
              💰 Rút lãi {totalWithdrawn > 0 ? `(Đã rút $${totalWithdrawn.toFixed(0)})` : ''}
            </Button>

            <Button
              variant="outlined"
              size="small"
              color="primary"
              onClick={handleOpenSettings}
              startIcon={<SettingOutlined />}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              Chỉnh vốn (${usdtBalance.toFixed(0)})
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

      {withdrawSuccessMsg && (
        <Alert severity="success" onClose={() => setWithdrawSuccessMsg('')} sx={{ fontWeight: 600 }}>
          {withdrawSuccessMsg}
        </Alert>
      )}

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
        {/* KPI 1: Tổng tài sản Spot */}
        <Card sx={kpiCardSx}>
          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  TỔNG TÀI SẢN (PORTFOLIO VALUE)
                </Typography>
                <Typography variant="h3" fontWeight={700} color="text.primary" sx={{ mt: 0.75 }}>
                  ${totalEquity.toFixed(2)}
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
                  bgcolor: isDark ? alpha(theme.palette.success.main, 0.15) : '#f6ffed',
                  color: 'success.main'
                }}
              >
                <DollarCircleOutlined style={{ fontSize: 20 }} />
              </Box>
            </Stack>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
            USDT khả dụng: <b>${usdtBalance.toFixed(2)}</b> • Giá trị Coin: <b>${totalCoinValue.toFixed(2)}</b>
            {totalWithdrawn > 0 && (
              <span style={{ color: '#52c41a', marginLeft: 8, fontWeight: 700 }}>
                • Đã rút két: +${totalWithdrawn.toFixed(2)}
              </span>
            )}
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

        {/* KPI 3: Lãi/Lỗ tạm tính coin đang giữ */}
        <Card sx={kpiCardSx}>
          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  LÃI/LỖ COIN ĐANG GIỮ
                </Typography>
                <Typography
                  variant="h3"
                  fontWeight={700}
                  sx={{
                    mt: 0.75,
                    color: unrealizedPnL >= 0 ? 'success.main' : 'error.main'
                  }}
                >
                  {unrealizedPnL >= 0 ? `+$${unrealizedPnL.toFixed(2)}` : `-$${Math.abs(unrealizedPnL).toFixed(2)}`}
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
            Tổng vốn mua: <b>${totalCost.toFixed(2)}</b> ({holdings.length} loại coin)
          </Typography>
        </Card>

        {/* KPI 4: Thống kê lệnh chốt lời */}
        <Card sx={kpiCardSx}>
          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  LỆNH CHỐT LỜI ĐÃ THÀNH CÔNG
                </Typography>
                <Typography variant="h3" fontWeight={700} color="primary.main" sx={{ mt: 0.75 }}>
                  {account.winning_trades || 0}
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
            Đã chốt: <b>${parseFloat(account.realized_pnl || 0).toFixed(2)}</b> USDT tiền lãi
          </Typography>
        </Card>
      </Box>

      {/* 3. Live Prices & Strategy Technical Status - Dàn đều 100% linh hoạt theo số cặp coin */}
      <MainCard
        border
        title={
          <Typography variant="subtitle1" fontWeight={700} color="text.primary">
            GIÁ THỊ TRƯỜNG REALTIME & VÙNG GOM HÀNG SPOT (M15)
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
            const rsi = inds?.rsi || 50;
            const isOversold = rsi <= 35;
            const isOverbought = rsi >= 65;

            return (
              <Box
                key={sym}
                sx={{
                  p: 2,
                  bgcolor: isDark ? 'background.default' : 'grey.50',
                  border: '1px solid',
                  borderColor: isOversold ? 'success.main' : 'divider',
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
                    {isOversold && (
                      <Chip label="GOM HÀNG" size="small" color="success" sx={{ height: 20, fontSize: 10, fontWeight: 700 }} />
                    )}
                    {isOverbought && (
                      <Chip label="QUÁ MUA" size="small" color="warning" sx={{ height: 20, fontSize: 10, fontWeight: 700 }} />
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

                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography variant="caption" color="text.secondary">RSI (14):</Typography>{' '}
                    <Typography
                      variant="caption"
                      fontWeight={700}
                      sx={{
                        color: isOversold ? 'success.main' : isOverbought ? 'warning.main' : 'text.primary'
                      }}
                    >
                      {rsi}
                    </Typography>
                  </Box>

                  <Stack alignItems="flex-end" spacing={0.5}>
                    <Chip
                      size="small"
                      color={isOversold ? 'success' : 'default'}
                      variant={isOversold ? 'filled' : 'outlined'}
                      label={isOversold ? 'ĐỦ ĐIỀU KIỆN MUA' : 'CHỜ RSI ≤ 35'}
                      sx={{ height: 22, fontSize: 10, fontWeight: 700 }}
                    />
                    <Button
                      size="small"
                      variant="outlined"
                      color="success"
                      onClick={() => handleBuyTranche(sym)}
                      disabled={actionSymbol === sym || usdtBalance < parseFloat(account.risk_per_trade || 10)}
                      sx={{ textTransform: 'none', py: 0.2, px: 1, fontSize: 11 }}
                    >
                      Mua thủ công ${parseFloat(account.risk_per_trade || 10).toFixed(0)}
                    </Button>
                  </Stack>
                </Stack>
              </Box>
            );
          })}
        </Box>
      </MainCard>

      {/* 4. Danh mục Coin đang nắm giữ (Coin Holdings Table) */}
      <MainCard
        border
        title={
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Typography variant="subtitle1" fontWeight={700} color="text.primary">
              DANH MỤC COIN ĐANG NẮM GIỮ ({holdings.length})
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
        {holdings.length === 0 ? (
          <Box sx={{ py: 5, textAlign: 'center' }}>
            <InboxOutlined style={{ fontSize: 40, color: theme.palette.text.secondary }} />
            <Typography variant="body1" fontWeight={600} color="text.primary" sx={{ mt: 1.5 }}>
              Hiện chưa nắm giữ coin nào
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 520, mx: 'auto' }}>
              Bot Spot sẽ tự động trích ${parseFloat(account.risk_per_trade || 10).toFixed(0)} USDT gom hàng khi nến M15 rơi vào vùng RSI quá bán (RSI ≤ 35). Anh cũng có thể bấm "Mua gom ${parseFloat(account.risk_per_trade || 10).toFixed(0)}" ở trên để mua thử ngay!
            </Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead sx={{ bgcolor: isDark ? 'background.default' : 'grey.100' }}>
                <TableRow>
                  <TableCell><b>Coin</b></TableCell>
                  <TableCell align="right"><b>Số lượng nắm giữ</b></TableCell>
                  <TableCell align="right"><b>Giá mua TB</b></TableCell>
                  <TableCell align="right"><b>Giá hiện tại</b></TableCell>
                  <TableCell align="right"><b>Tổng vốn chi</b></TableCell>
                  <TableCell align="right"><b>Giá trị hiện tại</b></TableCell>
                  <TableCell align="right"><b>Lãi/Lỗ tạm tính</b></TableCell>
                  <TableCell align="center"><b>Thao tác</b></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {holdings.map((h) => {
                  const pnl = parseFloat(h.unrealized_pnl || 0);
                  const pnlPct = parseFloat(h.unrealized_pnl_pct || 0);
                  return (
                    <TableRow key={h.symbol} hover>
                      <TableCell>
                        <Typography variant="subtitle2" fontWeight={700} color="text.primary">
                          {h.coin} ({h.symbol})
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <b>{parseFloat(h.quantity) < 0.1 ? parseFloat(h.quantity).toFixed(6) : parseFloat(h.quantity).toFixed(4)}</b> {h.coin}
                      </TableCell>
                      <TableCell align="right">${parseFloat(h.avg_buy_price).toFixed(2)}</TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={700} color="primary.main">
                          ${parseFloat(h.current_price).toFixed(2)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">${parseFloat(h.total_cost).toFixed(2)}</TableCell>
                      <TableCell align="right"><b>${parseFloat(h.current_value).toFixed(2)}</b></TableCell>
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
                        <Button
                          variant="contained"
                          size="small"
                          color="success"
                          onClick={() => handleSell(h.symbol)}
                          disabled={actionSymbol === h.symbol}
                          sx={{ textTransform: 'none', py: 0.25, px: 1.25 }}
                        >
                          {actionSymbol === h.symbol ? 'Đang bán...' : 'Bán chốt ngay'}
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

      {/* 5. Biểu đồ tăng trưởng tài sản Spot (Equity Curve) */}
      <MainCard
        border
        title={
          <Typography variant="subtitle1" fontWeight={700} color="text.primary">
            ĐƯỜNG CONG TĂNG TRƯỞNG TÀI SẢN SPOT (EQUITY CURVE)
          </Typography>
        }
        sx={{ width: '100%' }}
      >
        <Box sx={{ width: '100%', height: 260 }}>
          {snapshots.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={snapshots}>
                <defs>
                  <linearGradient id="spotEquityGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={theme.palette.success.main} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={theme.palette.success.main} stopOpacity={0.0} />
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
                  formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Tài sản Spot (Equity)']}
                  labelFormatter={(label) => `Thời gian: ${label}`}
                />
                <Area
                  type="monotone"
                  dataKey="equity"
                  stroke={theme.palette.success.main}
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#spotEquityGrad)"
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

      {/* 6. Lịch sử giao dịch & Nhật ký hoạt động Bot Spot */}
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
        {/* Lịch sử lệnh Mua / Bán */}
        <MainCard
          border
          title={
            <Typography variant="subtitle1" fontWeight={700} color="text.primary">
              LỊCH SỬ GIAO DỊCH SPOT ({orders.length})
            </Typography>
          }
          contentSX={{ p: 0 }}
          sx={{ width: '100%' }}
        >
          {orders.length === 0 ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">Chưa có giao dịch Spot nào.</Typography>
            </Box>
          ) : (
            <TableContainer sx={{ maxHeight: 340 }}>
              <Table size="small" stickyHeader>
                <TableHead sx={{ bgcolor: isDark ? 'background.default' : 'grey.100' }}>
                  <TableRow>
                    <TableCell><b>Thời gian</b></TableCell>
                    <TableCell><b>Loại</b></TableCell>
                    <TableCell><b>Cặp coin</b></TableCell>
                    <TableCell align="right"><b>Giá khớp</b></TableCell>
                    <TableCell align="right"><b>Khối lượng</b></TableCell>
                    <TableCell align="right"><b>Giá trị</b></TableCell>
                    <TableCell align="center"><b>Lý do</b></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {orders.map((o) => {
                    const isBuy = o.side === 'BUY';
                    const pnl = parseFloat(o.realized_pnl || 0);
                    return (
                      <TableRow key={o.id} hover>
                        <TableCell sx={{ fontSize: 12 }}>
                          {new Date(o.closed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={o.side}
                            size="small"
                            color={isBuy ? 'primary' : 'success'}
                            sx={{ fontWeight: 700, height: 20, fontSize: 10 }}
                          />
                        </TableCell>
                        <TableCell><b>{o.symbol}</b></TableCell>
                        <TableCell align="right" sx={{ fontSize: 12 }}>
                          ${parseFloat(o.exit_price || o.entry_price).toFixed(2)}
                        </TableCell>
                        <TableCell align="right">{parseFloat(o.quantity).toFixed(4)}</TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={600} color="text.primary">
                            ${parseFloat(o.margin).toFixed(2)}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            label={o.exit_reason}
                            size="small"
                            variant="outlined"
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

        {/* Nhật ký hoạt động Bot Spot */}
        <MainCard
          border
          title={
            <Typography variant="subtitle1" fontWeight={700} color="text.primary">
              NHẬT KÝ HOẠT ĐỘNG BOT SPOT
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
                      label={log.symbol || 'SPOT'}
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

      {/* 7. Dialog Cài đặt mức vốn Spot */}
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
          Cài đặt Vốn Spot (USDT)
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
            Tùy chỉnh số vốn USDT khả dụng và quy mô mỗi đợt mua gom (Tranche) cho ví Spot:
          </Typography>

          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
            Mức vốn USDT:
          </Typography>
          <TextField
            fullWidth
            type="number"
            value={customBalance}
            onChange={(e) => {
              const val = e.target.value;
              setCustomBalance(val);
              const num = parseFloat(val);
              if (!isNaN(num) && num > 0) {
                setCustomTranche(String(Math.max(10, Number((num * 0.25).toFixed(0)))));
              }
            }}
            InputProps={{
              startAdornment: <InputAdornment position="start">$</InputAdornment>,
              endAdornment: <InputAdornment position="end">USDT</InputAdornment>
            }}
            sx={{ mb: 1.5 }}
          />

          <Stack direction="row" spacing={1} sx={{ mb: 2.5 }}>
            {['100', '200', '500', '1000'].map((preset) => (
              <Chip
                key={preset}
                label={`$${preset}`}
                clickable
                color={customBalance === preset ? 'success' : 'default'}
                variant={customBalance === preset ? 'filled' : 'outlined'}
                onClick={() => {
                  setCustomBalance(preset);
                  const num = parseFloat(preset);
                  setCustomTranche(String(Math.max(10, Number((num * 0.25).toFixed(0)))));
                }}
                sx={{ fontWeight: 600 }}
              />
            ))}
          </Stack>

          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
            Số tiền mỗi đợt mua gom (Tranche):
          </Typography>
          <TextField
            fullWidth
            type="number"
            value={customTranche}
            onChange={(e) => setCustomTranche(e.target.value)}
            helperText={`Mỗi khi RSI quá bán, bot sẽ trích số tiền này để mua gom coin`}
            InputProps={{
              startAdornment: <InputAdornment position="start">$</InputAdornment>,
              endAdornment: <InputAdornment position="end">USDT</InputAdornment>
            }}
            sx={{ mb: 2.5 }}
          />
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
            Reset ví Spot (${customBalance})
          </Button>

          <Button
            variant="contained"
            color="success"
            onClick={handleSaveCapital}
            disabled={savingSettings}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            {savingSettings ? 'Đang lưu...' : 'Áp dụng'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal thêm cặp Coin theo dõi & Gom hàng */}
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
          Thêm cặp Coin theo dõi Spot
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Nhập mã coin trên sàn Binance để hệ thống tự động kết nối dữ liệu nến M15 realtime, phân tích RSI và tự động gom hàng khi có tín hiệu:
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
            color="success"
            onClick={() => handleAddSymbol()}
            disabled={addingSymbol || !inputSymbol.trim()}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            {addingSymbol ? 'Đang thêm...' : 'Thêm cặp Coin'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal Rút tiền lãi về két an toàn */}
      <Dialog
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
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
        <DialogTitle sx={{ fontWeight: 700, pb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          💰 Rút tiền lời về két an toàn
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Bảo toàn thành quả lợi nhuận: Rút tiền lãi USDT ra khỏi tài khoản giao dịch về két sắt, giữ mốc vốn gốc ổn định để tiếp tục giao dịch an toàn.
          </Typography>

          <Box sx={{ p: 2, mb: 2, bgcolor: isDark ? 'background.default' : 'grey.50', borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}>
            <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography variant="body2" color="text.secondary">Tổng tài sản (Equity):</Typography>
              <Typography variant="body2" fontWeight={700}>${totalEquity.toFixed(2)} USDT</Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography variant="body2" color="text.secondary">USDT khả dụng để rút:</Typography>
              <Typography variant="body2" fontWeight={700} color="primary.main">${usdtBalance.toFixed(2)} USDT</Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography variant="body2" color="text.secondary">Mức vốn gốc chuẩn:</Typography>
              <Typography variant="body2" fontWeight={600}>${initialBalance.toFixed(2)} USDT</Typography>
            </Stack>
            <Divider sx={{ my: 1 }} />
            <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography variant="body2" color="text.secondary">Tiền lãi vượt mức vốn:</Typography>
              <Typography variant="body2" fontWeight={800} color={totalEquity > initialBalance ? 'success.main' : 'text.secondary'}>
                {totalEquity > initialBalance ? `+$${(totalEquity - initialBalance).toFixed(2)} USDT` : '$0.00 USDT'}
              </Typography>
            </Stack>
            {totalWithdrawn > 0 && (
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="caption" color="text.secondary">Tổng lãi đã rút trước đó:</Typography>
                <Typography variant="caption" fontWeight={700} color="success.main">
                  +${totalWithdrawn.toFixed(2)} USDT
                </Typography>
              </Stack>
            )}
          </Box>

          {totalEquity > initialBalance && usdtBalance > 0 && (
            <Button
              variant="outlined"
              color="success"
              size="small"
              fullWidth
              onClick={() => setWithdrawAmount(Math.min(totalEquity - initialBalance, usdtBalance).toFixed(2))}
              sx={{ mb: 2, textTransform: 'none', fontWeight: 600 }}
            >
              Rút toàn bộ lãi khả dụng (+${Math.min(totalEquity - initialBalance, usdtBalance).toFixed(2)} USDT)
            </Button>
          )}

          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
            Số tiền USDT muốn rút:
          </Typography>
          <TextField
            fullWidth
            type="number"
            placeholder="0.00"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            InputProps={{
              startAdornment: <InputAdornment position="start">$</InputAdornment>,
              endAdornment: <InputAdornment position="end">USDT</InputAdornment>
            }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2.5, pt: 0, gap: 1 }}>
          <Button variant="outlined" color="inherit" onClick={() => setWithdrawOpen(false)} disabled={withdrawing}>
            Hủy
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleConfirmWithdraw}
            disabled={withdrawing || !withdrawAmount || parseFloat(withdrawAmount) <= 0 || parseFloat(withdrawAmount) > usdtBalance}
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            {withdrawing ? 'Đang rút...' : 'Xác nhận rút về két'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
