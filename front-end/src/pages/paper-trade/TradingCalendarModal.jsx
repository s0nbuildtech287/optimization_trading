import React, { useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';

// material-ui
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  Stack,
  IconButton,
  Button,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tooltip,
  CircularProgress,
  Divider,
  useTheme,
  alpha
} from '@mui/material';

// assets
import {
  CloseOutlined,
  LeftOutlined,
  RightOutlined,
  CalendarOutlined,
  TrophyOutlined,
  RiseOutlined,
  FallOutlined,
  ReloadOutlined
} from '@ant-design/icons';

// dayjs
import dayjs from 'dayjs';

// project imports
import { getCalendarPnL } from 'api/paperTrade';

const WEEKDAYS = ['T2 (MON)', 'T3 (TUE)', 'T4 (WED)', 'T5 (THU)', 'T6 (FRI)', 'T7 (SAT)', 'CN (SUN)'];

const FILTER_OPTIONS = [
  { id: 'ALL', label: '🌟 Toàn bộ hệ thống (Spot + Futures)' },
  { id: 'FUTURES_ALL', label: '⚡ Gộp 6 Bot Futures' },
  { id: 'acc_binance_futures', label: 'Bot 1: Trend Pullback (EMA)' },
  { id: 'acc_futures_reversion', label: 'Bot 2: Bollinger Reversion' },
  { id: 'acc_futures_breakout', label: 'Bot 3: Breakout Momentum' },
  { id: 'acc_futures_h4_trend', label: 'Bot 4: H4 Trend Sniper' },
  { id: 'acc_futures_ttm_squeeze', label: 'Bot 5: TTM Squeeze Breakout' },
  { id: 'acc_futures_momentum_leader', label: 'Bot 6: Momentum Leader' },
  { id: 'SPOT', label: '🪙 Binance Spot (DCA)' }
];

export default function TradingCalendarModal({ open, onClose, defaultAccount = 'ALL' }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const [currentMonth, setCurrentMonth] = useState(dayjs().format('YYYY-MM'));
  const [selectedAccount, setSelectedAccount] = useState(defaultAccount);
  const [data, setData] = useState({ dailyStats: [], orders: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Cập nhật selectedAccount khi defaultAccount thay đổi
  useEffect(() => {
    if (defaultAccount) {
      setSelectedAccount(defaultAccount);
    }
  }, [defaultAccount]);

  const fetchData = async () => {
    if (!open) return;
    try {
      setLoading(true);
      setError('');
      const res = await getCalendarPnL({
        accountId: selectedAccount,
        month: currentMonth
      });
      if (res.success && res.data) {
        setData(res.data);
      }
    } catch (err) {
      setError(err.message || 'Lỗi khi tải dữ liệu lịch');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open, currentMonth, selectedAccount]);

  // Điều hướng tháng
  const handlePrevMonth = () => {
    setCurrentMonth(dayjs(currentMonth, 'YYYY-MM').subtract(1, 'month').format('YYYY-MM'));
  };

  const handleNextMonth = () => {
    setCurrentMonth(dayjs(currentMonth, 'YYYY-MM').add(1, 'month').format('YYYY-MM'));
  };

  const handleCurrentMonth = () => {
    setCurrentMonth(dayjs().format('YYYY-MM'));
  };

  // Map ngày -> dữ liệu
  const dailyMap = useMemo(() => {
    const map = {};
    if (Array.isArray(data.dailyStats)) {
      data.dailyStats.forEach((s) => {
        map[s.date] = s;
      });
    }
    return map;
  }, [data.dailyStats]);

  // Map ngày -> danh sách lệnh
  const ordersByDate = useMemo(() => {
    const map = {};
    if (Array.isArray(data.orders)) {
      data.orders.forEach((o) => {
        const d = o.date;
        if (!map[d]) map[d] = [];
        map[d].push(o);
      });
    }
    return map;
  }, [data.orders]);

  // Tổng kết KPI tháng
  const monthSummary = useMemo(() => {
    let totalPnL = 0;
    let winDays = 0;
    let lossDays = 0;
    let evenDays = 0;
    let totalTrades = 0;
    let winningTrades = 0;
    let losingTrades = 0;

    if (Array.isArray(data.dailyStats)) {
      data.dailyStats.forEach((d) => {
        const pnl = parseFloat(d.total_pnl || 0);
        totalPnL += pnl;
        if (pnl > 0) winDays += 1;
        else if (pnl < 0) lossDays += 1;
        else if (parseInt(d.trades_count || 0, 10) > 0) evenDays += 1;

        totalTrades += parseInt(d.trades_count || 0, 10);
        winningTrades += parseInt(d.winning_trades || 0, 10);
        losingTrades += parseInt(d.losing_trades || 0, 10);
      });
    }

    const tradeDays = winDays + lossDays + evenDays;
    const winDayRate = tradeDays > 0 ? (winDays / tradeDays) * 100 : 0;
    const tradeWinRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

    return {
      totalPnL: Number(totalPnL.toFixed(2)),
      winDays,
      lossDays,
      evenDays,
      winDayRate: Number(winDayRate.toFixed(1)),
      totalTrades,
      winningTrades,
      losingTrades,
      tradeWinRate: Number(tradeWinRate.toFixed(1))
    };
  }, [data.dailyStats]);

  // Tính ma trận các ô ngày trong tháng (7 cột: Thứ 2 -> Chủ Nhật)
  const calendarCells = useMemo(() => {
    const monthObj = dayjs(currentMonth, 'YYYY-MM');
    const daysInMonth = monthObj.daysInMonth();
    // get day of week for 1st day (0 = Sun, 1 = Mon ... 6 = Sat)
    const firstDow = monthObj.startOf('month').day();
    // Chuyển sang chuẩn Thứ 2 = 0, Chủ Nhật = 6
    const offset = firstDow === 0 ? 6 : firstDow - 1;

    const cells = [];
    // Các ô trống đầu tháng
    for (let i = 0; i < offset; i++) {
      cells.push({ isBlank: true, key: `blank-start-${i}` });
    }

    // Các ngày trong tháng
    const todayStr = dayjs().format('YYYY-MM-DD');
    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const dateStr = monthObj.date(dayNum).format('YYYY-MM-DD');
      const stat = dailyMap[dateStr];
      const orders = ordersByDate[dateStr] || [];
      const isToday = dateStr === todayStr;

      cells.push({
        isBlank: false,
        key: dateStr,
        dateStr,
        dayNum,
        isToday,
        stat,
        orders
      });
    }

    return cells;
  }, [currentMonth, dailyMap, ordersByDate]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2.5,
          bgcolor: isDark ? '#111827' : '#ffffff',
          backgroundImage: 'none',
          boxShadow: isDark ? '0 20px 60px rgba(0, 0, 0, 0.7)' : '0 10px 40px rgba(0, 0, 0, 0.15)',
          overflow: 'hidden'
        }
      }}
    >
      {/* 1. Header Dialog */}
      <DialogTitle sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Stack direction="row" spacing={1.2} alignItems="center">
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                bgcolor: alpha(theme.palette.primary.main, 0.15),
                color: 'primary.main',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18
              }}
            >
              <CalendarOutlined />
            </Box>
            <Box>
              <Typography variant="h6" fontWeight={800} color="text.primary">
                LỊCH HIỆU SUẤT GIAO DỊCH (PNL CALENDAR)
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Theo dõi nhật ký Lãi/Lỗ ròng từng ngày theo thời gian thực
              </Typography>
            </Box>
          </Stack>

          <IconButton onClick={onClose} size="small" sx={{ color: 'text.secondary' }}>
            <CloseOutlined style={{ fontSize: 16 }} />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent sx={{ p: { xs: 2, sm: 3 } }}>
        {/* 2. Controls Bar: Chọn tháng & Bộ lọc tài khoản/Bot */}
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', sm: 'center' }}
          spacing={2}
          sx={{ mb: 2.5 }}
        >
          {/* Bộ điều hướng tháng */}
          <Stack direction="row" spacing={1} alignItems="center">
            <IconButton onClick={handlePrevMonth} size="small" sx={{ border: '1px solid', borderColor: 'divider' }}>
              <LeftOutlined style={{ fontSize: 12 }} />
            </IconButton>

            <Typography
              variant="subtitle1"
              fontWeight={800}
              sx={{
                minWidth: 150,
                textAlign: 'center',
                textTransform: 'capitalize',
                color: 'primary.main'
              }}
            >
              {dayjs(currentMonth, 'YYYY-MM').format('MMMM, YYYY')}
            </Typography>

            <IconButton onClick={handleNextMonth} size="small" sx={{ border: '1px solid', borderColor: 'divider' }}>
              <RightOutlined style={{ fontSize: 12 }} />
            </IconButton>

            <Button
              size="small"
              variant="outlined"
              onClick={handleCurrentMonth}
              sx={{ ml: 1, height: 30, fontSize: 11, fontWeight: 700, borderRadius: 1.5 }}
            >
              Hôm nay
            </Button>
          </Stack>

          {/* Bộ lọc chọn Bot / Thị trường */}
          <Box sx={{ minWidth: { xs: '100%', sm: 260 } }}>
            <FormControl fullWidth size="small">
              <InputLabel id="pnl-cal-filter-label" sx={{ fontSize: 13, fontWeight: 600 }}>
                Nguồn Dữ Liệu
              </InputLabel>
              <Select
                labelId="pnl-cal-filter-label"
                value={selectedAccount}
                label="Nguồn Dữ Liệu"
                onChange={(e) => setSelectedAccount(e.target.value)}
                sx={{ borderRadius: 1.5, fontSize: 13, fontWeight: 700 }}
              >
                {FILTER_OPTIONS.map((opt) => (
                  <MenuItem key={opt.id} value={opt.id} sx={{ fontSize: 12.5, fontWeight: 600 }}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </Stack>

        {/* 3. Monthly KPI Cards Summary */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' },
            gap: 1.5,
            mb: 2.5
          }}
        >
          {/* Tổng PnL tháng */}
          <Box
            sx={{
              p: 1.5,
              borderRadius: 2,
              bgcolor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#f9fafb',
              border: '1px solid',
              borderColor: 'divider'
            }}
          >
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              Tổng Lãi/Lỗ Tháng
            </Typography>
            <Typography
              variant="h5"
              fontWeight={800}
              sx={{
                mt: 0.5,
                color: monthSummary.totalPnL >= 0 ? '#10b981' : '#ef4444'
              }}
            >
              {monthSummary.totalPnL >= 0 ? '+' : ''}${monthSummary.totalPnL.toFixed(2)}
            </Typography>
          </Box>

          {/* Tỷ lệ ngày xanh */}
          <Box
            sx={{
              p: 1.5,
              borderRadius: 2,
              bgcolor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#f9fafb',
              border: '1px solid',
              borderColor: 'divider'
            }}
          >
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              Ngày Xanh / Ngày Đỏ
            </Typography>
            <Stack direction="row" alignItems="baseline" spacing={0.8} sx={{ mt: 0.5 }}>
              <Typography variant="h5" fontWeight={800} color="text.primary">
                {monthSummary.winDays}W / {monthSummary.lossDays}L
              </Typography>
              <Typography variant="caption" fontWeight={700} sx={{ color: '#10b981' }}>
                ({monthSummary.winDayRate}%)
              </Typography>
            </Stack>
          </Box>

          {/* Tổng số lệnh */}
          <Box
            sx={{
              p: 1.5,
              borderRadius: 2,
              bgcolor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#f9fafb',
              border: '1px solid',
              borderColor: 'divider'
            }}
          >
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              Tổng Số Lệnh Khớp
            </Typography>
            <Typography variant="h5" fontWeight={800} color="text.primary" sx={{ mt: 0.5 }}>
              {monthSummary.totalTrades} lệnh
            </Typography>
          </Box>

          {/* Tỷ lệ thắng lệnh */}
          <Box
            sx={{
              p: 1.5,
              borderRadius: 2,
              bgcolor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#f9fafb',
              border: '1px solid',
              borderColor: 'divider'
            }}
          >
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              Winrate Tổng Thể
            </Typography>
            <Typography variant="h5" fontWeight={800} color="primary.main" sx={{ mt: 0.5 }}>
              {monthSummary.tradeWinRate}%
            </Typography>
          </Box>
        </Box>

        {/* 4. Calendar Heatmap Grid */}
        {loading ? (
          <Box sx={{ py: 10, textAlign: 'center' }}>
            <CircularProgress size={36} />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
              Đang tổng hợp dữ liệu lịch PnL...
            </Typography>
          </Box>
        ) : (
          <Box>
            {/* Hàng tiêu đề 7 ngày trong tuần */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: 1,
                mb: 1,
                textAlign: 'center'
              }}
            >
              {WEEKDAYS.map((wd, idx) => (
                <Typography
                  key={wd}
                  variant="caption"
                  fontWeight={800}
                  sx={{
                    color: idx >= 5 ? 'warning.main' : 'text.secondary',
                    fontSize: { xs: 10, sm: 11.5 },
                    letterSpacing: 0.5
                  }}
                >
                  {wd}
                </Typography>
              ))}
            </Box>

            {/* Lưới các ô ngày trong tháng */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: 1
              }}
            >
              {calendarCells.map((cell) => {
                if (cell.isBlank) {
                  return (
                    <Box
                      key={cell.key}
                      sx={{
                        minHeight: { xs: 65, sm: 88 },
                        borderRadius: 2,
                        bgcolor: isDark ? 'rgba(255, 255, 255, 0.015)' : 'rgba(0, 0, 0, 0.01)',
                        border: '1px dashed',
                        borderColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'
                      }}
                    />
                  );
                }

                const { dayNum, dateStr, isToday, stat, orders } = cell;
                const hasTrades = Boolean(stat && stat.trades_count > 0);
                const pnl = stat ? parseFloat(stat.total_pnl || 0) : 0;
                const isWinDay = pnl > 0;
                const isLossDay = pnl < 0;

                // Màu nền và viền cho từng trạng thái ô
                let cellBg = isDark ? '#1a2234' : '#f9fafb';
                let cellBorder = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
                let pnlColor = 'text.secondary';

                if (hasTrades) {
                  if (isWinDay) {
                    cellBg = isDark
                      ? 'linear-gradient(145deg, #0d3822 0%, #064e3b 100%)'
                      : 'linear-gradient(145deg, #e6f4ea 0%, #c6f6d5 100%)';
                    cellBorder = isDark ? '#059669' : '#34a853';
                    pnlColor = isDark ? '#34d399' : '#0d652d';
                  } else if (isLossDay) {
                    cellBg = isDark
                      ? 'linear-gradient(145deg, #451319 0%, #5c1822 100%)'
                      : 'linear-gradient(145deg, #fde8e8 0%, #fed7d7 100%)';
                    cellBorder = isDark ? '#dc2626' : '#e53e3e';
                    pnlColor = isDark ? '#f87171' : '#c5221f';
                  } else {
                    cellBg = isDark ? '#1f2937' : '#edf2f7';
                    cellBorder = isDark ? '#4b5563' : '#cbd5e1';
                    pnlColor = isDark ? '#e5e7eb' : '#475569';
                  }
                }

                // Nội dung Tooltip chi tiết khi rê chuột vào ô ngày
                const tooltipContent = (
                  <Box sx={{ p: 0.8, maxWidth: 300 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.8 }}>
                      <Typography variant="subtitle2" fontWeight={800} color="primary.light">
                        🗓️ {dateStr}
                      </Typography>
                      {hasTrades && (
                        <Chip
                          label={`${stat.trades_count} lệnh`}
                          size="small"
                          color={isWinDay ? 'success' : isLossDay ? 'error' : 'default'}
                          sx={{ height: 18, fontSize: 9.5, fontWeight: 700 }}
                        />
                      )}
                    </Stack>

                    {hasTrades ? (
                      <>
                        <Typography variant="body2" fontWeight={700} sx={{ mb: 1, color: isWinDay ? '#34d399' : isLossDay ? '#f87171' : '#fff' }}>
                          Lợi nhuận ròng: {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                        </Typography>

                        <Divider sx={{ my: 0.8, borderColor: 'rgba(255, 255, 255, 0.2)' }} />

                        <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                          Chi tiết các lệnh đã đóng ({orders.length}):
                        </Typography>

                        <Box sx={{ maxHeight: 180, overflowY: 'auto' }}>
                          {orders.map((ord) => {
                            const ordPnl = parseFloat(ord.realized_pnl || 0);
                            const ordWin = ordPnl >= 0;
                            return (
                              <Box
                                key={ord.id}
                                sx={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  py: 0.4,
                                  fontSize: 11,
                                  borderBottom: '1px dashed rgba(255, 255, 255, 0.1)'
                                }}
                              >
                                <Typography variant="caption" sx={{ fontSize: 11, fontWeight: 700 }}>
                                  {ord.time} {ord.symbol} ({ord.side})
                                </Typography>
                                <Typography
                                  variant="caption"
                                  fontWeight={700}
                                  sx={{ color: ordWin ? '#34d399' : '#f87171' }}
                                >
                                  {ordWin ? '+' : ''}${ordPnl.toFixed(2)}
                                </Typography>
                              </Box>
                            );
                          })}
                        </Box>
                      </>
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        Không phát sinh lệnh giao dịch trong ngày này.
                      </Typography>
                    )}
                  </Box>
                );

                return (
                  <Tooltip key={cell.key} title={tooltipContent} arrow placement="top" enterDelay={150}>
                    <Box
                      sx={{
                        minHeight: { xs: 65, sm: 88 },
                        p: { xs: 0.8, sm: 1.2 },
                        borderRadius: 2,
                        background: cellBg,
                        border: '1.5px solid',
                        borderColor: isToday ? 'primary.main' : cellBorder,
                        boxShadow: isToday ? `0 0 10px ${alpha(theme.palette.primary.main, 0.4)}` : 'none',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        cursor: hasTrades ? 'pointer' : 'default',
                        transition: 'all 0.2s ease',
                        '&:hover': {
                          transform: hasTrades ? 'translateY(-2px)' : 'none',
                          boxShadow: hasTrades
                            ? (isWinDay
                              ? '0 6px 16px rgba(16, 185, 129, 0.35)'
                              : '0 6px 16px rgba(239, 68, 68, 0.35)')
                            : 'none'
                        }
                      }}
                    >
                      {/* Dòng trên: icon & ngày */}
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography
                          variant="caption"
                          fontWeight={800}
                          sx={{
                            fontSize: { xs: 11, sm: 12 },
                            color: isToday ? 'primary.main' : 'text.primary'
                          }}
                        >
                          🗓️ {dayNum}
                        </Typography>
                        {isToday && (
                          <Chip
                            label="Hôm nay"
                            size="small"
                            color="primary"
                            sx={{ height: 15, fontSize: 8, fontWeight: 700, px: 0.3 }}
                          />
                        )}
                      </Stack>

                      {/* Ở giữa: Lãi/Lỗ ròng lớn nổi bật */}
                      <Box sx={{ my: 'auto', textAlign: 'center' }}>
                        {hasTrades ? (
                          <Typography
                            variant="subtitle1"
                            fontWeight={900}
                            sx={{
                              fontSize: { xs: '0.85rem', sm: '1.05rem' },
                              color: pnlColor,
                              lineHeight: 1.2,
                              letterSpacing: '-0.3px'
                            }}
                          >
                            {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                          </Typography>
                        ) : (
                          <Typography variant="body2" sx={{ color: 'text.secondary', opacity: 0.4 }}>
                            —
                          </Typography>
                        )}
                      </Box>

                      {/* Dòng dưới: Số lệnh khớp */}
                      <Box sx={{ textAlign: 'center' }}>
                        {hasTrades ? (
                          <Typography
                            variant="caption"
                            sx={{
                              fontSize: { xs: 9, sm: 10.5 },
                              fontWeight: 600,
                              color: isDark ? 'rgba(255, 255, 255, 0.65)' : 'text.secondary'
                            }}
                          >
                            {stat.trades_count} {stat.trades_count > 1 ? 'trades' : 'trade'}
                          </Typography>
                        ) : (
                          <Typography variant="caption" sx={{ fontSize: 9, opacity: 0 }}>
                            -
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  </Tooltip>
                );
              })}
            </Box>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}

TradingCalendarModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  defaultAccount: PropTypes.string
};

