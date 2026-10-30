import React from 'react';
import {
  Grid,
  Box,
  Typography,
  IconButton,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Paper,
  Chip
} from '@mui/material';
import { QuestionCircleOutlined } from '@ant-design/icons';
import MainCard from 'components/MainCard';
import CardLoader from 'components/CardLoader';

export default function DimensionTab({
  duelData,
  obOsData,
  averageData,
  theme,
  formatCurrency,
  formatNumber,
  safeNumber,
  safeCurrency,
  renderHeaderActions,
  openHelpModal,
  dimensionsLoading
}) {
  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 6 }}>
        <MainCard
          title={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'var(--chart-title-color, #1F3864)' }}>
                HIỆU SUẤT THEO KHUNG THỜI GIAN
              </Typography>
              <IconButton
                size="small"
                onClick={() =>
                  openHelpModal(
                    'ĐỐI SÁNH KHUNG THỜI GIAN H1 VS H4 (TIMEFRAME DUEL: H1 VS H4)',
                    'Nhìn cùng một portfolio theo 3 chiều khác nhau — timeframe, symbol, và direction. Giúp so sánh trực quan hiệu suất Sharpe, Profit/Drawdown và Lợi nhuận giữa khung thời gian H1 và H4 trên từng cặp tài sản cụ thể để lựa chọn khung tối ưu.'
                  )
                }
              >
                <QuestionCircleOutlined style={{ fontSize: '13px' }} />
              </IconButton>
            </Box>
          }
          secondary={renderHeaderActions('Hiệu suất theo khung thời gian', 'Phân tích đối sánh khung thời gian H1 vs H4', duelData)}
          sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}
          contentSX={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
        >
          {dimensionsLoading ? (
            <CardLoader height={280} size={30} message="Đang tải hiệu suất khung thời gian..." />
          ) : (
            <TableContainer
              component={Paper}
              sx={{ boxShadow: 'none', border: '1px solid', borderColor: 'divider', borderRadius: 2, flexGrow: 1, overflowX: 'auto' }}
            >
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.03)' : 'background.default' }}>
                  <TableCell
                    align="center"
                    sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? 'text.primary' : 'text.secondary' }}
                  >
                    Symbol
                  </TableCell>
                  <TableCell
                    align="center"
                    sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? 'text.primary' : 'text.secondary' }}
                  >
                    H1 Profit
                  </TableCell>
                  <TableCell
                    align="center"
                    sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? 'text.primary' : 'text.secondary' }}
                  >
                    H1 Sharpe
                  </TableCell>
                  <TableCell
                    align="center"
                    sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? 'text.primary' : 'text.secondary' }}
                  >
                    H1 P/D
                  </TableCell>
                  <TableCell
                    align="center"
                    sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? 'text.primary' : 'text.secondary' }}
                  >
                    H4 Profit
                  </TableCell>
                  <TableCell
                    align="center"
                    sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? 'text.primary' : 'text.secondary' }}
                  >
                    H4 Sharpe
                  </TableCell>
                  <TableCell
                    align="center"
                    sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? 'text.primary' : 'text.secondary' }}
                  >
                    H4 P/D
                  </TableCell>
                  <TableCell
                    align="center"
                    sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? 'text.primary' : 'text.secondary' }}
                  >
                    Winner
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {duelData.map((row) => (
                  <TableRow key={row.symbol} hover>
                    <TableCell align="center" sx={{ fontWeight: 700 }}>
                      {row.symbol}
                    </TableCell>
                    <TableCell align="center">{formatCurrency(row.h1.profit)}</TableCell>
                    <TableCell align="center">{formatNumber(row.h1.sharpe)}</TableCell>
                    <TableCell align="center">{formatNumber(row.h1.pd)}</TableCell>
                    <TableCell align="center">{formatCurrency(row.h4.profit)}</TableCell>
                    <TableCell align="center">{formatNumber(row.h4.sharpe)}</TableCell>
                    <TableCell align="center">{formatNumber(row.h4.pd)}</TableCell>
                    <TableCell align="center">
                      <Chip
                        label={row.winner}
                        sx={{
                          bgcolor:
                            row.winner === 'H1'
                              ? theme.palette.mode === 'dark'
                                ? 'rgba(115, 209, 61, 0.15)'
                                : 'rgba(112, 173, 71, 0.15)'
                              : theme.palette.mode === 'dark'
                                ? 'rgba(64, 169, 255, 0.15)'
                                : 'rgba(31, 56, 100, 0.15)',
                          color:
                            row.winner === 'H1'
                              ? theme.palette.mode === 'dark'
                                ? '#73d13d'
                                : '#70AD47'
                              : theme.palette.mode === 'dark'
                                ? '#40a9ff'
                                : 'var(--chart-title-color, #1F3864)',
                          fontWeight: 700,
                          border: '1px solid',
                          borderColor:
                            row.winner === 'H1'
                              ? theme.palette.mode === 'dark'
                                ? 'rgba(115, 209, 61, 0.3)'
                                : 'rgba(112, 173, 71, 0.3)'
                              : theme.palette.mode === 'dark'
                                ? 'rgba(64, 169, 255, 0.3)'
                                : 'rgba(31, 56, 100, 0.3)'
                        }}
                        size="small"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </TableContainer>
          )}
        </MainCard>
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <MainCard
          title={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'var(--chart-title-color, #1F3864)' }}>
                HIỆU SUẤT THEO CHIỀU MUA/BÁN
              </Typography>
              <IconButton
                size="small"
                onClick={() =>
                  openHelpModal(
                    'HIỆU SUẤT MUA/BÁN THEO CẶP TÀI SẢN (OB VS OS AVERAGE PROFIT)',
                    'So sánh lợi nhuận tích lũy trung bình từ các vị thế Mua (OB - Only Buy) vs Bán (OS - Only Sell) trên từng symbol, giúp định hướng thiên hướng thị trường có tính chu kỳ.'
                  )
                }
              >
                <QuestionCircleOutlined style={{ fontSize: '13px' }} />
              </IconButton>
            </Box>
          }
          secondary={renderHeaderActions('Hiệu suất theo chiều mua bán', 'Phân tích Hiệu suất mua bán OB vs OS', obOsData)}
          sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}
          contentSX={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
        >
          {dimensionsLoading ? (
            <CardLoader height={280} size={30} message="Đang tải hiệu suất chiều mua/bán..." />
          ) : (
            <TableContainer
              component={Paper}
              sx={{ boxShadow: 'none', border: '1px solid', borderColor: 'divider', borderRadius: 2, flexGrow: 1, overflowX: 'auto' }}
            >
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.03)' : 'background.default' }}>
                  <TableCell
                    align="center"
                    sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? 'text.primary' : 'text.secondary' }}
                  >
                    Symbol
                  </TableCell>
                  <TableCell
                    align="center"
                    sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? 'text.primary' : 'text.secondary' }}
                  >
                    OB Avg Profit
                  </TableCell>
                  <TableCell
                    align="center"
                    sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? 'text.primary' : 'text.secondary' }}
                  >
                    OS Avg Profit
                  </TableCell>
                  <TableCell
                    align="center"
                    sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? 'text.primary' : 'text.secondary', width: '150px' }}
                  >
                    OB / OS Bias
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {obOsData.map((row) => {
                  const ob = safeNumber(row.obValue ?? row.ob?.profit ?? row.ob);
                  const os = safeNumber(row.osValue ?? row.os?.profit ?? row.os);
                  const obValue = ob ?? 0;
                  const osValue = os ?? 0;
                  const total = Math.abs(obValue) + Math.abs(osValue);
                  const obPct = total > 0 ? Math.round((Math.abs(obValue) / total) * 100) : 0;
                  const osPct = total > 0 ? 100 - obPct : 0;
                  const hasData = ob != null || os != null;
                  return (
                    <TableRow key={row.symbol} hover>
                      <TableCell align="center" sx={{ fontWeight: 700 }}>
                        {row.symbol}
                      </TableCell>
                      <TableCell
                        align="center"
                        sx={{
                          color:
                            obValue >= 0
                              ? theme.palette.mode === 'dark'
                                ? '#73d13d'
                                : '#70AD47'
                              : theme.palette.mode === 'dark'
                                ? '#ff4d4f'
                                : '#FF0000',
                          fontWeight: 600
                        }}
                      >
                        {safeCurrency(ob)}
                      </TableCell>
                      <TableCell
                        align="center"
                        sx={{
                          color:
                            osValue >= 0
                              ? theme.palette.mode === 'dark'
                                ? '#73d13d'
                                : '#70AD47'
                              : theme.palette.mode === 'dark'
                                ? '#ff4d4f'
                                : '#FF0000',
                          fontWeight: 600
                        }}
                      >
                        {safeCurrency(os)}
                      </TableCell>
                      <TableCell align="center">
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                          <Typography
                            variant="caption"
                            sx={{
                              color: theme.palette.mode === 'dark' ? 'primary.light' : '#2E75B6',
                              fontWeight: 700,
                              fontSize: '10px',
                              minWidth: 28,
                              textAlign: 'left'
                            }}
                          >
                            {hasData ? `${obPct}%` : '—'}
                          </Typography>
                          <Box
                            sx={{
                              flex: 1,
                              display: 'flex',
                              height: 6,
                              borderRadius: 3,
                              overflow: 'hidden',
                              bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : '#e2e8f0'
                            }}
                          >
                            <Box
                              sx={{
                                width: `${obPct}%`,
                                bgcolor: theme.palette.mode === 'dark' ? 'primary.main' : '#2E75B6',
                                height: '100%'
                              }}
                            />
                            <Box
                              sx={{
                                width: `${osPct}%`,
                                bgcolor: theme.palette.mode === 'dark' ? 'primary.light' : '#9DC3E6',
                                height: '100%'
                              }}
                            />
                          </Box>
                          <Typography
                            variant="caption"
                            sx={{
                              color: theme.palette.mode === 'dark' ? 'primary.light' : '#9DC3E6',
                              fontWeight: 700,
                              fontSize: '10px',
                              minWidth: 28,
                              textAlign: 'right'
                            }}
                          >
                            {hasData ? `${osPct}%` : '—'}
                          </Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </TableContainer>
          )}
        </MainCard>
      </Grid>

      <Grid size={12}>
        <MainCard
          title={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'var(--chart-title-color, #1F3864)' }}>
                HIỆU SUẤT TỔNG HỢP THEO CẶP TÀI SẢN
              </Typography>
              <IconButton
                size="small"
                onClick={() =>
                  openHelpModal(
                    'HIỆU SUẤT TỔNG HỢP THEO CẶP TÀI SẢN (ASSET PERFORMANCE AVERAGES)',
                    'Bảng thống kê chi tiết toàn diện của tất cả chỉ số Sharpe, Profit Factor (PF), Recovery Factor (RF), Profit/Drawdown (P/D) và tỷ lệ sụt giảm tối đa (Max DD) trung bình trên từng symbol tài sản.'
                  )
                }
              >
                <QuestionCircleOutlined style={{ fontSize: '13px' }} />
              </IconButton>
            </Box>
          }
          secondary={renderHeaderActions(
            'Hiệu suất tổng hợp theo cặp tài sản',
            'Phân tích Hiệu suất tổng hợp trung bình theo từng symbol',
            averageData
          )}
        >
          {dimensionsLoading ? (
            <CardLoader height={240} size={30} message="Đang tải hiệu suất tổng hợp theo cặp..." />
          ) : (
            <TableContainer
              component={Paper}
              sx={{ boxShadow: 'none', border: '1px solid', borderColor: 'divider', borderRadius: 2, overflowX: 'auto' }}
            >
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.03)' : 'background.default' }}>
                  <TableCell
                    align="center"
                    sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? 'text.primary' : 'text.secondary' }}
                  >
                    Symbol
                  </TableCell>
                  <TableCell
                    align="center"
                    sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? 'text.primary' : 'text.secondary' }}
                  >
                    Avg Profit
                  </TableCell>
                  <TableCell
                    align="center"
                    sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? 'text.primary' : 'text.secondary' }}
                  >
                    Sharpe
                  </TableCell>
                  <TableCell
                    align="center"
                    sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? 'text.primary' : 'text.secondary' }}
                  >
                    PF
                  </TableCell>
                  <TableCell
                    align="center"
                    sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? 'text.primary' : 'text.secondary' }}
                  >
                    RF
                  </TableCell>
                  <TableCell
                    align="center"
                    sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? 'text.primary' : 'text.secondary' }}
                  >
                    P/D
                  </TableCell>
                  <TableCell
                    align="center"
                    sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? 'text.primary' : 'text.secondary' }}
                  >
                    Max DD
                  </TableCell>
                  <TableCell
                    align="center"
                    sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? 'text.primary' : 'text.secondary' }}
                  >
                    N
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {averageData.map((row) => (
                  <TableRow key={row.symbol} hover>
                    <TableCell align="center" sx={{ fontWeight: 700 }}>
                      {row.symbol}
                    </TableCell>
                    <TableCell align="center">{formatCurrency(row.avgProfit)}</TableCell>
                    <TableCell align="center">{formatNumber(row.sharpe)}</TableCell>
                    <TableCell align="center">{formatNumber(row.pf)}</TableCell>
                    <TableCell align="center">{formatNumber(row.rf)}</TableCell>
                    <TableCell
                      align="center"
                      sx={{
                        fontWeight: 700,
                        color:
                          Number(row.pd) >= 2.0
                            ? theme.palette.mode === 'dark'
                              ? '#73d13d'
                              : '#70AD47'
                            : Number(row.pd) < 1.0
                              ? theme.palette.mode === 'dark'
                                ? '#ff4d4f'
                                : '#FF0000'
                              : 'text.primary'
                      }}
                    >
                      {formatNumber(row.pd)}
                    </TableCell>
                    <TableCell align="center" sx={{ color: theme.palette.mode === 'dark' ? '#ff4d4f' : '#FF0000', fontWeight: 600 }}>
                      {formatNumber(row.maxDrawdownPct)}%
                    </TableCell>
                    <TableCell align="center">{row.strategies}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </TableContainer>
          )}
        </MainCard>
      </Grid>
    </Grid>
  );
}
