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
  ButtonGroup,
  Snackbar
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
  CloseOutlined,
  InfoCircleOutlined
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
  removePaperTradeSymbol,
  withdrawPaperTradeProfit
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

  // Modal rút tiền lãi về két
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawSuccessMsg, setWithdrawSuccessMsg] = useState('');

  // Dialog xác nhận thao tác (thay thế window.confirm)
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: '',
    content: '',
    confirmText: 'Xác nhận',
    confirmColor: 'primary',
    onConfirm: null
  });

  // Thông báo Snackbar (thay thế window.alert)
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'info'
  });

  // Khoảng thời gian hiển thị biểu đồ Equity Curve ('24h', '3d', '7d', 'all')
  const [chartTimeframe, setChartTimeframe] = useState('all');

  // Bot đang được chọn để theo dõi chi tiết (Multi-Bot Tournament)
  const [selectedBotId, setSelectedBotId] = useState('acc_binance_futures');

  const fetchData = async (isInitial = false, botId = selectedBotId) => {
    try {
      if (isInitial) setLoading(true);
      const res = await getPaperTradeDashboard('futures', botId);
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
    fetchData(true, selectedBotId);
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = setInterval(() => {
      fetchData(false, selectedBotId);
    }, 2500);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [selectedBotId]);

  const handleToggleBot = async () => {
    if (!data?.account) return;
    try {
      setToggling(true);
      const nextState = !data.account.is_bot_active;
      await togglePaperTradeBot(nextState, 'futures', selectedBotId);
      setSnackbar({
        open: true,
        message: nextState ? 'Đã BẬT bot tự động quét tín hiệu!' : 'Đã TẮT bot tự động.',
        severity: nextState ? 'success' : 'info'
      });
      await fetchData(false, selectedBotId);
    } catch (err) {
      setSnackbar({ open: true, message: err.message, severity: 'error' });
    } finally {
      setToggling(false);
    }
  };

  const handleClosePosition = (pos) => {
    setConfirmDialog({
      open: true,
      title: `Đóng vị thế ${pos.symbol} (${pos.side})?`,
      content: `Anh có chắc muốn đóng vị thế này bằng tay không? Lệnh sẽ được tất toán ngay lập tức theo giá thị trường hiện tại ($${parseFloat(pos.current_price).toFixed(2)}).`,
      confirmText: 'Đóng vị thế ngay',
      confirmColor: 'error',
      onConfirm: async () => {
        try {
          setClosingId(pos.id);
          await closePaperTradePosition(pos.id);
          setSnackbar({ open: true, message: `Đã đóng vị thế ${pos.symbol} thành công!`, severity: 'success' });
          await fetchData(false);
        } catch (err) {
          setSnackbar({ open: true, message: err.message, severity: 'error' });
        } finally {
          setClosingId(null);
        }
      }
    });
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
      setSnackbar({ open: true, message: 'Vui lòng nhập mức vốn hợp lệ (> 0)', severity: 'warning' });
      return;
    }

    try {
      setSavingSettings(true);
      await updatePaperTradeSettings({
        balance: balNum,
        riskPerTrade: riskNum,
        leverage: levNum,
        mode: 'futures',
        botId: selectedBotId
      });
      setSettingsOpen(false);
      setSnackbar({ open: true, message: 'Cập nhật cấu hình vốn thành công!', severity: 'success' });
      await fetchData(false, selectedBotId);
    } catch (err) {
      setSnackbar({ open: true, message: err.message, severity: 'error' });
    } finally {
      setSavingSettings(false);
    }
  };

  // Rút tiền lãi về két an toàn
  const handleOpenWithdraw = () => {
    const curBal = parseFloat(data?.account?.balance || 100);
    const initBal = parseFloat(data?.account?.initial_balance || 100);
    const profitAboveInit = Math.max(0, curBal - initBal);
    setWithdrawAmount(profitAboveInit > 0 ? profitAbove100Formatted(profitAboveInit) : '');
    setWithdrawOpen(true);
  };

  const profitAbove100Formatted = (val) => Number(val).toFixed(2);

  const handleConfirmWithdraw = async () => {
    const amt = parseFloat(withdrawAmount);
    if (isNaN(amt) || amt <= 0) {
      setSnackbar({ open: true, message: 'Vui lòng nhập số tiền rút hợp lệ (> 0)', severity: 'warning' });
      return;
    }
    try {
      setWithdrawing(true);
      const res = await withdrawPaperTradeProfit({ amount: amt, mode: 'futures', botId: selectedBotId });
      setWithdrawOpen(false);
      setSnackbar({ open: true, message: `🎉 ${res.message || `Đã rút thành công $${amt.toFixed(2)} USDT về két!`}`, severity: 'success' });
      await fetchData(false, selectedBotId);
    } catch (err) {
      setSnackbar({ open: true, message: err.message, severity: 'error' });
    } finally {
      setWithdrawing(false);
    }
  };

  // Reset tài khoản với số vốn mới
  const handleResetWithCapital = () => {
    const balNum = parseFloat(customBalance);
    const riskNum = parseFloat(customRisk);
    const levNum = parseInt(customLeverage, 10);
    if (isNaN(balNum) || balNum <= 0) {
      setSnackbar({ open: true, message: 'Vui lòng nhập mức vốn hợp lệ (> 0)', severity: 'warning' });
      return;
    }

    setConfirmDialog({
      open: true,
      title: '⚠️ Xác nhận Reset tài khoản Bot',
      content: `Thao tác này sẽ xóa toàn bộ vị thế đang mở và lịch sử lệnh của Bot này, đưa vốn về lại mốc $${balNum.toFixed(2)} USDT. Hành động này không thể hoàn tác!`,
      confirmText: 'Xác nhận Reset',
      confirmColor: 'error',
      onConfirm: async () => {
        try {
          setSavingSettings(true);
          await resetPaperTradeAccount(balNum, riskNum, levNum, 'futures', selectedBotId);
          setSettingsOpen(false);
          setSnackbar({ open: true, message: `Đã reset tài khoản về mức vốn $${balNum.toFixed(2)} USDT!`, severity: 'success' });
          await fetchData(false, selectedBotId);
        } catch (err) {
          setSnackbar({ open: true, message: err.message, severity: 'error' });
        } finally {
          setSavingSettings(false);
        }
      }
    });
  };

  const handleAddSymbol = async (symToAdd) => {
    const sym = (symToAdd || inputSymbol).toUpperCase().trim();
    if (!sym) return;
    try {
      setAddingSymbol(true);
      await addPaperTradeSymbol(sym, 'futures', selectedBotId);
      setInputSymbol('');
      setAddSymbolOpen(false);
      setSnackbar({ open: true, message: `Đã thêm cặp coin ${sym} theo dõi thành công!`, severity: 'success' });
      await fetchData(false, selectedBotId);
    } catch (err) {
      setSnackbar({ open: true, message: err.message, severity: 'error' });
    } finally {
      setAddingSymbol(false);
    }
  };

  const handleRemoveSymbol = (symToRemove) => {
    setConfirmDialog({
      open: true,
      title: `Bỏ theo dõi ${symToRemove}?`,
      content: `Hệ thống sẽ ngừng quét tín hiệu M15 và loại bỏ cặp ${symToRemove} khỏi danh sách theo dõi realtime.`,
      confirmText: 'Bỏ theo dõi',
      confirmColor: 'warning',
      onConfirm: async () => {
        try {
          await removePaperTradeSymbol(symToRemove, 'futures', selectedBotId);
          setSnackbar({ open: true, message: `Đã bỏ theo dõi cặp ${symToRemove}`, severity: 'info' });
          await fetchData(false, selectedBotId);
        } catch (err) {
          setSnackbar({ open: true, message: err.message, severity: 'error' });
        }
      }
    });
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
  const rawSnapshots = data?.equitySnapshots || [];
  let cutoff = 0;
  const now = Date.now();
  if (chartTimeframe === '24h') cutoff = now - 24 * 60 * 60 * 1000;
  else if (chartTimeframe === '3d') cutoff = now - 3 * 24 * 60 * 60 * 1000;
  else if (chartTimeframe === '7d') cutoff = now - 7 * 24 * 60 * 60 * 1000;

  const filtered = cutoff > 0 ? rawSnapshots.filter((s) => new Date(s.timestamp).getTime() >= cutoff) : rawSnapshots;
  const listToMap = filtered.length > 0 ? filtered : rawSnapshots;

  const snapshots = listToMap.map((s) => {
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
  const usedMargin = positions.reduce((sum, p) => sum + parseFloat(p.margin || 0), 0);
  const freeMargin = Math.max(0, balance - usedMargin);
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
                  bgcolor: isDark ? alpha(theme.palette.primary.main, 0.15) : alpha(theme.palette.primary.main, 0.1),
                  color: 'primary.main'
                }}
              >
                <ThunderboltOutlined style={{ fontSize: 24 }} />
              </Box>
              <Box>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography variant="h4" fontWeight={700} color="text.primary">
                    {account.name || 'Futures Auto Trade'}
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
                  Vốn gốc: <b>${initialBalance.toFixed(2)} USDT</b> • Số dư ví: <b>${balance.toFixed(2)} USDT</b> • Đòn bẩy {account.leverage || 3}x • Rủi ro ${parseFloat(account.risk_per_trade || 2).toFixed(2)}/lệnh (Lệnh $10-$15)
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

      {/* 1.1. Đấu trường Chiến lược Đa Bot (Multi-Bot Tournament - $100/Bot) */}
      <MainCard
        border
        sx={{
          bgcolor: isDark ? 'background.paper' : 'grey.50',
          borderColor: 'divider',
          width: '100%',
          p: 0.5
        }}
      >
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} sx={{ mb: 1.5, px: 1 }} spacing={1}>
          <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
            <TrophyOutlined style={{ fontSize: 20, color: '#f59e0b' }} />
            <Typography variant="subtitle1" fontWeight={800} color="text.primary">
              ĐẤU TRƯỜNG CHIẾN LƯỢC ĐA BOT ($100 / BOT)
            </Typography>
            <Chip
              label={`${data?.botList ? data.botList.filter((b) => b.is_bot_active).length : 4} BOTS LIVE`}
              size="small"
              color="primary"
              sx={{ height: 22, fontSize: 10, fontWeight: 700 }}
            />
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Bấm chọn từng Bot để xem riêng biểu đồ Equity Curve, vị thế và lịch sử lệnh
          </Typography>
        </Stack>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', xl: 'repeat(6, 1fr)' },
            gap: 1.5
          }}
        >
          {(data?.botList || [
            { id: 'acc_binance_futures', name: 'Bot 1: Trend Pullback (EMA)', desc: 'Thuận xu hướng EMA200 + Pullback EMA21 & RSI', equity: 100, balance: 100, pnl: 0, pnlPct: 0, winrate: 0, total_trades: 0, is_bot_active: true },
            { id: 'acc_futures_reversion', name: 'Bot 2: Bollinger Reversion', desc: 'Đảo chiều Sideway dải Bollinger Bands + RSI Quá mua/bán', equity: 100, balance: 100, pnl: 0, pnlPct: 0, winrate: 0, total_trades: 0, is_bot_active: true },
            { id: 'acc_futures_breakout', name: 'Bot 3: Breakout Momentum', desc: 'Phá vỡ đỉnh/đáy 20 nến Donchian + Bùng nổ Volume', equity: 100, balance: 100, pnl: 0, pnlPct: 0, winrate: 0, total_trades: 0, is_bot_active: true },
            { id: 'acc_futures_h4_trend', name: 'Bot 4: H4 Trend Sniper', desc: 'Kênh Donchian 55 + EMA 50/200 khung H4 (Turtle Trend)', equity: 100, balance: 100, pnl: 0, pnlPct: 0, winrate: 0, total_trades: 0, is_bot_active: true },
            { id: 'acc_futures_ttm_squeeze', name: 'Bot 5: TTM Squeeze Breakout', desc: 'Nén biến động Bollinger Bands + Keltner Channel (Lò xo bung)', equity: 100, balance: 100, pnl: 0, pnlPct: 0, winrate: 0, total_trades: 0, is_bot_active: true },
            { id: 'acc_futures_momentum_leader', name: 'Bot 6: Momentum Leader', desc: 'Xoay trục dòng tiền (24h/6h ROC + Volume) đón đầu coin dẫn dắt', equity: 100, balance: 100, pnl: 0, pnlPct: 0, winrate: 0, total_trades: 0, is_bot_active: true }
          ]).map((bot, bIdx) => {
            const isSelected = selectedBotId === bot.id;
            const isPnlPositive = (bot.pnl || 0) >= 0;

            return (
              <Box
                key={bot.id}
                onClick={() => setSelectedBotId(bot.id)}
                sx={{
                  p: 1.75,
                  borderRadius: 2,
                  cursor: 'pointer',
                  border: '2px solid',
                  borderColor: isSelected ? 'primary.main' : 'divider',
                  bgcolor: isSelected 
                    ? (isDark ? alpha(theme.palette.primary.main, 0.12) : alpha(theme.palette.primary.main, 0.05))
                    : (isDark ? 'background.default' : '#ffffff'),
                  boxShadow: isSelected ? theme.customShadows?.z2 : 'none',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    borderColor: isSelected ? 'primary.main' : theme.palette.text.secondary,
                    transform: 'translateY(-2px)'
                  }
                }}
              >
                {/* Dòng 1: Huy hiệu trạng thái & badge tách biệt lên hàng trên */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.75, minHeight: 20 }}>
                  {isSelected ? (
                    <Chip
                      label="ĐANG XEM"
                      size="small"
                      color="primary"
                      sx={{ height: 18, fontSize: 9.5, fontWeight: 700, px: 0.5 }}
                    />
                  ) : (
                    <Typography variant="caption" sx={{ fontSize: 10, fontWeight: 700, color: 'text.secondary', letterSpacing: 0.5 }}>
                      BOT #{bIdx + 1}
                    </Typography>
                  )}
                  <Chip
                    label={bot.is_bot_active ? 'BẬT' : 'TẮT'}
                    size="small"
                    color={bot.is_bot_active ? 'success' : 'default'}
                    variant={bot.is_bot_active ? 'filled' : 'outlined'}
                    sx={{ height: 18, fontSize: 9.5, fontWeight: 700, px: 0.5 }}
                  />
                </Stack>

                {/* Dòng 2: Tiêu đề Bot chiếm toàn bộ chiều ngang, có Tooltip khi hover */}
                <Tooltip
                  title={
                    <Box sx={{ p: 0.5, maxWidth: 280 }}>
                      <Typography variant="subtitle2" fontWeight={800} sx={{ display: 'block', color: 'primary.light', mb: 0.3 }}>
                        {bot.name}
                      </Typography>
                      <Typography variant="caption" sx={{ display: 'block', lineHeight: 1.45 }}>
                        {bot.desc}
                      </Typography>
                    </Box>
                  }
                  arrow
                  placement="top"
                  enterDelay={100}
                >
                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={0.5}
                    sx={{
                      cursor: 'pointer',
                      mb: 1,
                      minHeight: 22,
                      width: '100%'
                    }}
                  >
                    <Typography
                      variant="subtitle2"
                      fontWeight={800}
                      color={isSelected ? 'primary.main' : 'text.primary'}
                      noWrap
                      sx={{
                        textDecoration: 'underline dotted 1px',
                        textUnderlineOffset: '3px',
                        fontSize: '0.84rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1,
                        transition: 'color 0.2s',
                        '&:hover': {
                          color: 'primary.main'
                        }
                      }}
                    >
                      {bot.name}
                    </Typography>
                    <InfoCircleOutlined
                      style={{
                        fontSize: 12,
                        color: isSelected ? theme.palette.primary.main : theme.palette.text.secondary,
                        opacity: 0.75,
                        flexShrink: 0
                      }}
                    />
                  </Stack>
                </Tooltip>

                <Divider sx={{ my: 1, borderColor: 'divider' }} />

                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography variant="caption" color="text.secondary">Tài sản (Equity):</Typography>
                    <Typography variant="h5" fontWeight={800} color="text.primary">
                      ${Number(bot.equity || 100).toFixed(2)}
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="caption" color="text.secondary">Lãi/Lỗ:</Typography>
                    <Typography
                      variant="body2"
                      fontWeight={700}
                      color={isPnlPositive ? 'success.main' : 'error.main'}
                    >
                      {isPnlPositive ? '+' : ''}${Number(bot.pnl || 0).toFixed(2)} ({isPnlPositive ? '+' : ''}{Number(bot.pnlPct || 0).toFixed(1)}%)
                    </Typography>
                  </Box>
                </Stack>

                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Thắng/Tổng: <b>{bot.winning_trades || 0}/{bot.total_trades || 0} lệnh</b>
                  </Typography>
                  <Typography variant="caption" fontWeight={700} color="primary.main">
                    Winrate: {Number(bot.winrate || 0).toFixed(1)}%
                  </Typography>
                </Stack>
              </Box>
            );
          })}
        </Box>
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
            Ví: <b>${balance.toFixed(2)}</b> • Ký quỹ: <b>${usedMargin.toFixed(2)}</b> • Khả dụng: <b>${freeMargin.toFixed(2)}</b>
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
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={600} color="text.primary">
                          {parseFloat(pos.quantity).toFixed(4)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          ~${(parseFloat(pos.quantity) * parseFloat(pos.entry_price)).toFixed(2)} USDT
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={700} color="primary.main">
                          ${parseFloat(pos.margin).toFixed(2)} ({pos.leverage}x)
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          Vốn ví: ${parseFloat(pos.margin).toFixed(2)}
                        </Typography>
                      </TableCell>
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
                          onClick={() => handleClosePosition(pos)}
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
        secondary={
          <Stack direction="row" spacing={0.5} alignItems="center">
            {[
              { key: '24h', label: '24H' },
              { key: '3d', label: '3 Ngày' },
              { key: '7d', label: '7 Ngày' },
              { key: 'all', label: 'Tất cả' }
            ].map((tf) => (
              <Button
                key={tf.key}
                size="small"
                variant={chartTimeframe === tf.key ? 'contained' : 'outlined'}
                color={chartTimeframe === tf.key ? 'primary' : 'inherit'}
                onClick={() => setChartTimeframe(tf.key)}
                sx={{
                  minWidth: { xs: 36, sm: 46 },
                  px: { xs: 0.8, sm: 1.2 },
                  py: 0.25,
                  fontSize: { xs: '0.7rem', sm: '0.75rem' },
                  fontWeight: chartTimeframe === tf.key ? 700 : 500,
                  textTransform: 'none'
                }}
              >
                {tf.label}
              </Button>
            ))}
          </Stack>
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
            Bảo toàn thành quả lợi nhuận: Rút tiền lãi ra khỏi tài khoản giao dịch về két sắt, giữ mốc vốn gốc ổn định để tiếp tục giao dịch an toàn.
          </Typography>

          <Box sx={{ p: 2, mb: 2, bgcolor: isDark ? 'background.default' : 'grey.50', borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}>
            <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography variant="body2" color="text.secondary">Số dư ví hiện tại:</Typography>
              <Typography variant="body2" fontWeight={700}>${balance.toFixed(2)} USDT</Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography variant="body2" color="text.secondary">Mức vốn gốc chuẩn:</Typography>
              <Typography variant="body2" fontWeight={600}>${initialBalance.toFixed(2)} USDT</Typography>
            </Stack>
            <Divider sx={{ my: 1 }} />
            <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography variant="body2" color="text.secondary">Tiền lãi vượt mức vốn:</Typography>
              <Typography variant="body2" fontWeight={800} color={balance > initialBalance ? 'success.main' : 'text.secondary'}>
                {balance > initialBalance ? `+$${(balance - initialBalance).toFixed(2)} USDT` : '$0.00 USDT'}
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

          {balance > initialBalance && (
            <Button
              variant="outlined"
              color="success"
              size="small"
              fullWidth
              onClick={() => setWithdrawAmount((balance - initialBalance).toFixed(2))}
              sx={{ mb: 2, textTransform: 'none', fontWeight: 600 }}
            >
              Rút toàn bộ lãi vượt mốc (+${(balance - initialBalance).toFixed(2)} USDT)
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
            disabled={withdrawing || !withdrawAmount || parseFloat(withdrawAmount) <= 0}
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            {withdrawing ? 'Đang rút...' : 'Xác nhận rút về két'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal xác nhận thao tác chuẩn giao diện (thay thế window.confirm) */}
      <Dialog
        open={confirmDialog.open}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: 'background.paper',
            backgroundImage: 'none',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2.5,
            p: 0.5
          }
        }}
      >
        <DialogTitle sx={{ fontWeight: 800, fontSize: '1.1rem', pb: 1 }}>
          {confirmDialog.title}
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
            {confirmDialog.content}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 1, gap: 1 }}>
          <Button
            variant="outlined"
            color="inherit"
            onClick={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Hủy
          </Button>
          <Button
            variant="contained"
            color={confirmDialog.confirmColor || 'primary'}
            onClick={() => {
              const action = confirmDialog.onConfirm;
              setConfirmDialog((prev) => ({ ...prev, open: false }));
              if (action) action();
            }}
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            {confirmDialog.confirmText || 'Xác nhận'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar thông báo hệ thống (thay thế window.alert) */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          severity={snackbar.severity || 'info'}
          variant="filled"
          sx={{ width: '100%', fontWeight: 600, boxShadow: theme.customShadows?.z1 }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
