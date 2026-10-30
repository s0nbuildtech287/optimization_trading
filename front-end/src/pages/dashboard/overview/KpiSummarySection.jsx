import React from 'react';
import {
  Grid,
  Box,
  Typography,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogActions,
  Chip,
  Stack,
  Tooltip as MuiTooltip
} from '@mui/material';
import { CardLoader, CardError } from 'components/CardLoader';
import {
  RiseOutlined,
  FallOutlined,
  TrophyOutlined,
  PieChartOutlined,
  StockOutlined,
  CalendarOutlined,
  RobotOutlined,
  FileTextOutlined,
  AuditOutlined,
  DollarOutlined,
  SafetyOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import MainCard from 'components/MainCard';
import DashboardAiAnalysisDialog from 'components/dashboard/DashboardAiAnalysisDialog';
import DashboardRemarksDialog from 'components/dashboard/DashboardRemarksDialog';
import { dashboardDetailButtonSx } from 'components/dashboard/DashboardKpiSummary';

export default function KpiSummarySection({
  overview,
  selectedTable,
  dateRange,
  hasDateFilter,
  detailedReport,
  fileOptimizationCheck,
  formatCurrency,
  formatNumber,
  renderHeaderActions,
  tooltipSlotProps,
  isDarkMode,
  remarksOpen,
  setRemarksOpen,
  remarksTitle,
  remarksId,
  remarksType,
  handleOpenRemarks,
  reportOpen,
  setReportOpen,
  aiOverviewOpen,
  setAiOverviewOpen,
  strategySummaryOpen,
  setStrategySummaryOpen,
  coreLoading,
  coreError
}) {
  const reportPnl = detailedReport?.pnl;
  const reportRisk = detailedReport?.riskMetrics;

  const totalStrategies = overview?.totalStrategies ?? 0;
  const totalDeals = overview?.totalDeals ?? 0;
  const netProfit = reportPnl?.netProfit ?? overview?.totalProfit ?? 0;
  const grossProfit = reportPnl?.grossProfit ?? 0;
  const grossLoss = reportPnl?.grossLoss ?? 0;
  const avgTrades = totalStrategies > 0 ? Math.round(totalDeals / totalStrategies) : 0;
  const expectedPayoff = overview?.avgProfitPerDeal ?? reportRisk?.avgExpectedPayoff ?? 0;
  const portfolioPF =
    reportPnl?.portfolioProfitFactor != null
      ? String(reportPnl.portfolioProfitFactor)
      : grossLoss > 0
        ? (grossProfit / grossLoss).toFixed(2)
        : '—';
  const profitPercent =
    reportPnl?.profitPercent != null ? String(reportPnl.profitPercent) : '0';
  const lossPercent =
    reportPnl?.lossPercent != null ? String(reportPnl.lossPercent) : '0';

  const formatMetric = (val, suffix = '') => {
    if (val == null || Number.isNaN(Number(val))) return `0${suffix}`;
    return `${val}${suffix}`;
  };

  const riskMetricCards = [
    { label: 'Avg P/D Ratio', val: formatMetric(reportRisk?.avgPdRatio), desc: 'Profit/Drawdown ratio', scope: 'full' },
    { label: 'Avg Net Profit', val: reportRisk?.avgTotalNetProfit != null ? formatCurrency(reportRisk.avgTotalNetProfit) : '$0.00', desc: 'Overall profit amount', scope: 'full' },
    { label: 'Avg Trades', val: formatMetric(reportRisk?.avgTotalTrades), desc: 'Number of trades per strategy', scope: 'full' },
    { label: 'Avg Winrate', val: reportRisk?.avgWinrate != null && !Number.isNaN(Number(reportRisk.avgWinrate)) ? `${reportRisk.avgWinrate}%` : '0%', desc: 'Win percentage', scope: 'full' },
    { label: 'Avg Profit Factor', val: formatMetric(reportRisk?.avgProfitFactor), desc: 'Gross profit / Gross loss ratio', scope: 'full' },
    { label: 'Avg Sharpe Ratio', val: formatMetric(reportRisk?.avgSharpe), desc: 'Risk-adjusted return metric', scope: 'full' },
    { label: 'Avg Recovery Factor', val: formatMetric(reportRisk?.avgRecoveryFactor), desc: 'Net profit / Max drawdown', scope: 'full' },
    { label: 'Avg LR Correlation', val: formatMetric(reportRisk?.avgLrCorrelation), desc: 'Linear regression correlation', scope: 'full' },
    { label: 'Avg Max Drawdown %', val: reportRisk?.avgDrawdownPct != null && !Number.isNaN(Number(reportRisk.avgDrawdownPct)) ? `${reportRisk.avgDrawdownPct}%` : '0%', desc: 'Maximum drawdown percentage', scope: 'full' },
    { label: 'Avg Drawdown Val', val: reportRisk?.avgDrawdownVal != null ? formatCurrency(reportRisk.avgDrawdownVal) : '$0.00', desc: 'Maximum drawdown absolute value', scope: 'full' },
    { label: 'Avg Expected Payoff', val: reportRisk?.avgExpectedPayoff != null ? formatCurrency(reportRisk.avgExpectedPayoff) : '$0.00', desc: 'Expected payoff amount', scope: 'full' },
    { label: 'Avg Risk-Reward Ratio', val: formatMetric(reportRisk?.avgRiskRewardRatio), desc: 'Risk to reward ratio', scope: 'full' },
    { label: 'Avg Lrg Loss Trade', val: reportRisk?.avgLargestLossTrade != null ? formatCurrency(reportRisk.avgLargestLossTrade) : '$0.00', desc: 'Largest losing trade amount', scope: 'full' },
    { label: 'Avg Lrg Profit Ratio', val: reportRisk?.avgLargestProfitTradeRatio != null && !Number.isNaN(Number(reportRisk.avgLargestProfitTradeRatio)) ? `${reportRisk.avgLargestProfitTradeRatio}%` : '0%', desc: 'Ratio of largest winning trade', scope: 'full' }
  ];

  const scopeLabelMap = {
    full: 'Full period',
    range: 'Date range'
  };

  const renderScopeChip = (scope) => {
    if (!scope) return null;
    return (
      <Chip
        label={scopeLabelMap[scope] || scope}
        size="small"
        variant="outlined"
        sx={{ height: 18, fontSize: '0.65rem', borderRadius: 1, ml: 0.75 }}
      />
    );
  };

  const overviewActionBarSx = {
    display: 'grid',
    gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, max-content)' },
    gap: 1,
    width: { xs: '100%', sm: 'auto' },
    alignItems: 'center'
  };

  const overviewActionButtonSx = {
    ...dashboardDetailButtonSx,
    minWidth: { xs: 0, sm: 112 },
    width: { xs: '100%', sm: 'auto' },
    justifyContent: 'center',
    px: { xs: 1.25, sm: 2 },
    whiteSpace: 'nowrap'
  };

  const overviewDateButtonSx = {
    ...overviewActionButtonSx,
    bgcolor: hasDateFilter ? 'success.lighter' : 'grey.100',
    color: hasDateFilter ? 'success.dark' : 'text.secondary',
    border: '1px solid',
    borderColor: hasDateFilter ? 'success.light' : 'divider',
    boxShadow: 'none',
    cursor: 'default',
    '&:hover': {
      bgcolor: hasDateFilter ? 'success.lighter' : 'grey.100',
      boxShadow: 'none'
    }
  };

  const strategySummaryItems = [
    {
      label: 'Total Net Profit',
      value: formatCurrency(overview?.totalProfit ?? 0),
      sub: 'overall portfolio profit',
      valueColor: (overview?.totalProfit || 0) >= 0 ? 'success.main' : 'error.main',
      icon: <RiseOutlined style={{ fontSize: '18px', color: (overview?.totalProfit || 0) >= 0 ? '#2e7d32' : '#d32f2f' }} />,
      iconBg: (overview?.totalProfit || 0) >= 0 ? '#edf7ed' : '#fdeded',
      scope: hasDateFilter ? 'range' : null
    },
    {
      label: 'Portfolio Winrate',
      value: `${overview?.winRate ?? 0}%`,
      sub: 'across all trade deals',
      valueColor: 'text.primary',
      icon: <TrophyOutlined style={{ fontSize: '18px', color: '#e5a800' }} />,
      iconBg: '#fef7e0',
      scope: hasDateFilter ? 'range' : null
    },
    {
      label: 'Total Strategies',
      value: formatNumber(overview?.totalStrategies ?? 0),
      sub: `deployed on ${formatNumber(overview?.totalSymbols ?? 0)} symbols`,
      valueColor: 'text.primary',
      icon: <PieChartOutlined style={{ fontSize: '18px', color: '#0288d1' }} />,
      iconBg: '#e3f2fd',
      scope: 'full'
    },
    {
      label: 'Average Profit / Deal',
      value: formatCurrency(overview?.avgProfitPerDeal ?? 0),
      sub: `Commission: ${formatCurrency(overview?.totalCommission ?? 0)}`,
      valueColor: (overview?.avgProfitPerDeal || 0) >= 0 ? 'success.main' : 'error.main',
      icon: <StockOutlined style={{ fontSize: '18px', color: '#673ab7' }} />,
      iconBg: '#f3e5f5',
      scope: hasDateFilter ? 'range' : null
    }
  ];

  return (
    <Grid size={12}>
      <MainCard
        title={
          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'var(--chart-title-color, #1F3864)', textTransform: 'uppercase', letterSpacing: '0.2px' }}>
            Strategy Summary Overview
          </Typography>
        }
        secondary={
          <Box sx={overviewActionBarSx}>
            <MuiTooltip title="Có áp dụng Date Range" arrow slotProps={tooltipSlotProps}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<CalendarOutlined style={{ fontSize: '16px' }} />}
                sx={overviewDateButtonSx}
              >
                Date Range
              </Button>
            </MuiTooltip>
            <Button size="small" variant="contained" onClick={() => setAiOverviewOpen(true)} startIcon={<RobotOutlined />} sx={overviewActionButtonSx}>
              AI Analysis
            </Button>
            <Button size="small" variant="contained" onClick={() => setStrategySummaryOpen(true)} startIcon={<FileTextOutlined />} sx={overviewActionButtonSx}>
              View Report
            </Button>
            <Button size="small" variant="contained" onClick={() => handleOpenRemarks('Tổng quan (Overview Tab)', 'overview_tab', 'tab_remarks')} startIcon={<AuditOutlined />} sx={overviewActionButtonSx}>
              Remarks
            </Button>
          </Box>
        }
      >
        <Grid container spacing={2.5}>
          {coreLoading ? (
            <Grid size={12}>
              <CardLoader height={120} size={28} message="Loading KPI summary..." />
            </Grid>
          ) : coreError ? (
            <Grid size={12}>
              <CardError error={coreError} />
            </Grid>
          ) : (
          strategySummaryItems.map((item) => (
            <Grid key={item.label} size={{ xs: 12, sm: 6, md: 3 }}>
              <Card
                variant="outlined"
                sx={{
                  p: 2.5,
                  borderRadius: 3,
                  bgcolor: '#ffffff',
                  borderColor: '#e2e8f0',
                  boxShadow: '0 4px 10px rgba(0, 0, 0, 0.01)',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.25s ease-in-out',
                  '&:hover': {
                    borderColor: 'primary.main',
                    boxShadow: '0 8px 18px rgba(0, 0, 0, 0.04)',
                    transform: 'translateY(-2px)'
                  }
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {item.label}
                      </Typography>
                      {renderScopeChip(item.scope)}
                    </Box>
                    <Typography variant="h5" sx={{ fontWeight: 700, color: item.valueColor || 'text.primary', mt: 0.5 }}>
                      {item.value}
                    </Typography>
                  </Box>
                  <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    bgcolor: item.iconBg
                  }}>
                    {item.icon}
                  </Box>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                  {item.sub}
                </Typography>
              </Card>
            </Grid>
          ))
          )}
        </Grid>
      </MainCard>

      <DashboardAiAnalysisDialog
        open={aiOverviewOpen}
        onClose={() => setAiOverviewOpen(false)}
        title="AI Analysis — Portfolio Overview"
        subtitle="Class 2 · Performance summary & strategy health"
        badge={selectedTable === 'all_backtests' ? 'All Backtests' : selectedTable}
        targetId="overview_tab"
        selectedTable={selectedTable}
        dateRange={dateRange}
        sections={[
          {
            heading: 'Tổng quan',
            body: `Portfolio gồm ${formatNumber(overview?.totalStrategies || 0)} strategies trên ${formatNumber(overview?.totalSymbols || 0)} symbols. Net profit ${formatCurrency(overview?.totalProfit || 0)}, winrate ${overview?.winRate || 0}% — dùng làm baseline trước khi drill-down Risk / Behavior / Ranking.`
          },
          {
            heading: 'Điểm nóng',
            body:
              '• So sánh Gross Profit vs Gross Loss để đánh giá PF thực tế.\n• Avg profit/deal và commission ảnh hưởng trực tiếp kỳ vọng live.\n• Monthly / yearly trend cho thấy strategy có decay hay không.'
          },
          {
            heading: 'Khuyến nghị',
            body:
              'Mở View Full Detailed Report để xem breakdown P&L và risk metrics. Tiếp theo: Risk Analysis (lọc flags) → Behavior (patterns) → Comparative Ranking (chọn Top N).'
          }
        ]}
      />

      <DashboardRemarksDialog
        open={remarksOpen}
        onClose={() => setRemarksOpen(false)}
        title={remarksTitle}
        remarksId={remarksId}
        remarksType={remarksType}
        selectedTable={selectedTable}
        dateRange={dateRange}
      />

      {/* ==================== STRATEGY DETAILED REPORT DIALOG ==================== */}
      <Dialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        fullWidth
        maxWidth="md"
        PaperProps={{
          sx: {
            borderRadius: 3,
            boxShadow: '0 24px 48px rgba(0, 0, 0, 0.15)',
            overflow: 'hidden',
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider'
          }
        }}
      >
        <Box sx={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          color: '#fff',
          px: 3,
          py: 2.5,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <Box sx={{
            position: 'absolute',
            width: '150px',
            height: '150px',
            background: 'rgba(22, 181, 221, 0.15)',
            borderRadius: '50%',
            right: '-30px',
            top: '-30px',
            filter: 'blur(20px)'
          }} />
          <Box sx={{
            position: 'absolute',
            width: '100px',
            height: '100px',
            background: 'rgba(116, 168, 140, 0.15)',
            borderRadius: '50%',
            left: '40%',
            bottom: '-50px',
            filter: 'blur(15px)'
          }} />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, zIndex: 1 }}>
            <AuditOutlined style={{ fontSize: '24px', color: '#16b5dd' }} />
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#fff', letterSpacing: '0.2px' }}>
                Strategy Analysis Report
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.6)', display: 'block', mt: 0.25 }}>
                Full Detail Performance & Risk Diagnostics
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, zIndex: 1 }}>
            <Chip
              label={selectedTable === 'all_backtests' ? 'All Backtests' : selectedTable}
              size="small"
              sx={{
                bgcolor: 'rgba(255, 255, 255, 0.1)',
                color: '#16b5dd',
                fontWeight: 600,
                border: '1px solid rgba(22, 181, 221, 0.3)',
                height: 24,
                fontSize: '0.75rem'
              }}
            />
            <Button
              onClick={() => setReportOpen(false)}
              sx={{
                color: 'rgba(255, 255, 255, 0.6)',
                minWidth: 'auto',
                p: 0.5,
                borderRadius: '50%',
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)', color: '#fff' }
              }}
            >
              ✕
            </Button>
          </Box>
        </Box>

        <DialogContent sx={(theme) => ({ p: 3, bgcolor: theme.palette.mode === 'dark' ? theme.palette.background.paper : '#f8fafc' })}>
          <Grid container spacing={3}>
            {/* SECTION 1: OVERALL EFFICIENCY */}
            <Grid size={12}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.secondary', mb: 1.5, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <PieChartOutlined style={{ color: '#16b5dd' }} /> Portfolio Efficiency & Health
              </Typography>

              <Grid container spacing={2.5}>
                <Grid size={{ xs: 12, md: 7 }}>
                  <Card sx={(theme) => ({
                    p: 2.5,
                    borderRadius: 3,
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.02)',
                    border: '1px solid',
                    borderColor: 'divider',
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100%',
                    justifyContent: 'space-between',
                    position: 'relative',
                    overflow: 'hidden',
                    bgcolor: theme.palette.mode === 'dark' ? theme.palette.background.paper : '#ffffff'
                  })}>
                    <Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.primary', display: 'flex', alignItems: 'center', gap: 1 }}>
                          Gross P&L breakdown
                        </Typography>
                        <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                          PF: {portfolioPF} · Net: {formatCurrency(netProfit)}
                        </Typography>
                      </Box>

                      <Box sx={{ mb: 2.5 }}>
                        <Box sx={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', bgcolor: '#e2e8f0', mb: 1.5, gap: '1px' }}>
                          <Box sx={{ width: `${profitPercent}%`, bgcolor: '#1D9E75', transition: 'width 1s ease-in-out' }} />
                          <Box sx={{ width: `${lossPercent}%`, bgcolor: '#E24B4A', transition: 'width 1s ease-in-out' }} />
                        </Box>

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: '#1D9E75' }} />
                            <Typography variant="caption" sx={{ fontWeight: 500, color: 'text.secondary' }}>
                              Profit: {formatCurrency(grossProfit)} ({profitPercent}%)
                            </Typography>
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: '#E24B4A' }} />
                            <Typography variant="caption" sx={{ fontWeight: 500, color: 'text.secondary' }}>
                              Loss: {formatCurrency(grossLoss)} ({lossPercent}%)
                            </Typography>
                          </Box>
                        </Box>
                      </Box>
                    </Box>

                    <Box sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderTop: '1px solid',
                      borderColor: 'divider',
                      pt: 1.5,
                      fontSize: '11px',
                      color: 'text.secondary'
                    }}>
                      <Typography variant="caption" sx={{ fontSize: '11px', color: 'text.secondary' }}>
                        Mỗi $1 thua lỗ → thu về {portfolioPF}
                      </Typography>
                      <Typography variant="caption" sx={{ fontSize: '11px', color: 'text.secondary' }}>
                        {formatNumber(totalDeals)} deals · avg {formatCurrency(expectedPayoff)}/trade
                      </Typography>
                    </Box>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, md: 5 }}>
                  <Card sx={{
                    p: 2.5,
                    borderRadius: 3,
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.02)',
                    border: '1px solid',
                    borderColor: 'divider',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    gap: 2
                  }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid', borderColor: 'divider', pb: 1 }}>
                      <Typography variant="body2" color="text.secondary">Total Strategies</Typography>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{formatNumber(totalStrategies)} strategies</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid', borderColor: 'divider', pb: 1 }}>
                      <Typography variant="body2" color="text.secondary">Total Executed Deals</Typography>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{formatNumber(totalDeals)} deals</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">Avg Deals / Strategy</Typography>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{formatNumber(avgTrades)} deals</Typography>
                    </Box>
                  </Card>
                </Grid>
              </Grid>
            </Grid>

            {/* SECTION 2: PROFIT & CAPITAL EFFICIENCY */}
            <Grid size={12}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.secondary', mb: 1.5, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <DollarOutlined style={{ color: '#2e7d32' }} /> Capital & Financial Performance
              </Typography>

              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <Card sx={{
                    p: 2,
                    borderRadius: 3,
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.02)',
                    border: '1px solid',
                    borderColor: 'divider',
                    background: (theme) => netProfit >= 0 ? (theme.palette.mode === 'dark' ? 'linear-gradient(180deg, rgba(46,125,50,0.15) 0%, transparent 100%)' : 'linear-gradient(180deg, #edf7ed 0%, #ffffff 100%)') : (theme.palette.mode === 'dark' ? 'linear-gradient(180deg, rgba(211,47,47,0.15) 0%, transparent 100%)' : 'linear-gradient(180deg, #fdeded 0%, #ffffff 100%)'),
                    transition: 'transform 0.2s',
                    '&:hover': { transform: 'translateY(-4px)' }
                  }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Net Portfolio Profit</Typography>
                      {netProfit >= 0 ? <RiseOutlined style={{ color: '#2e7d32' }} /> : <FallOutlined style={{ color: '#d32f2f' }} />}
                    </Box>
                    <Typography variant="h5" sx={{ fontWeight: 700, color: netProfit >= 0 ? '#2e7d32' : '#d32f2f' }}>
                      {formatCurrency(netProfit)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '10px' }}>
                      Total net profits after fees
                    </Typography>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, sm: 4 }}>
                  <Card sx={{
                    p: 2,
                    borderRadius: 3,
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.02)',
                    border: '1px solid',
                    borderColor: 'divider',
                    background: (theme) => theme.palette.mode === 'dark' ? 'linear-gradient(180deg, rgba(2,136,209,0.15) 0%, transparent 100%)' : 'linear-gradient(180deg, #e3f2fd 0%, #ffffff 100%)',
                    transition: 'transform 0.2s',
                    '&:hover': { transform: 'translateY(-4px)' }
                  }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Gross Profit</Typography>
                      <StockOutlined style={{ color: '#0288d1' }} />
                    </Box>
                    <Typography variant="h5" sx={{ fontWeight: 700, color: '#0288d1' }}>
                      {formatCurrency(grossProfit)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '10px' }}>
                      Cumulative winning deals profit
                    </Typography>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, sm: 4 }}>
                  <Card sx={{
                    p: 2,
                    borderRadius: 3,
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.02)',
                    border: '1px solid',
                    borderColor: 'divider',
                    background: (theme) => theme.palette.mode === 'dark' ? 'linear-gradient(180deg, rgba(211,47,47,0.15) 0%, transparent 100%)' : 'linear-gradient(180deg, #fbe9e7 0%, #ffffff 100%)',
                    transition: 'transform 0.2s',
                    '&:hover': { transform: 'translateY(-4px)' }
                  }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Gross Loss</Typography>
                      <FallOutlined style={{ color: '#d32f2f' }} />
                    </Box>
                    <Typography variant="h5" sx={{ fontWeight: 700, color: '#d32f2f' }}>
                      {formatCurrency(grossLoss)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '10px' }}>
                      Cumulative losing deals loss
                    </Typography>
                  </Card>
                </Grid>

                <Grid size={12}>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Box sx={(theme) => ({ p: 1.5, borderRadius: 2, bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#ffffff', border: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}>
                        <Box>
                          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>Expected Payoff</Typography>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: expectedPayoff >= 0 ? 'success.main' : 'error.main' }}>
                            {formatCurrency(expectedPayoff)}
                          </Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: '10px' }}>
                          Gain per trade
                        </Typography>
                      </Box>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Box sx={(theme) => ({ p: 1.5, borderRadius: 2, bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#ffffff', border: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}>
                        <Box>
                          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>Portfolio Profit Factor (PF)</Typography>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: parseFloat(portfolioPF) >= 1.2 ? 'success.main' : 'warning.main' }}>
                            {portfolioPF}
                          </Typography>
                        </Box>
                      </Box>
                    </Grid>
                  </Grid>
                </Grid>
              </Grid>
            </Grid>

            {/* SECTION 3: RISK & ADVANCED QUALITY METRICS */}
            <Grid size={12}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.secondary', mb: 1.5, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <SafetyOutlined style={{ color: '#0f172a' }} /> Risk & Algorithmic Quality Profile
              </Typography>

              <Grid container spacing={2}>
                {riskMetricCards.map((card, i) => (
                  <Grid key={i} size={{ xs: 12, sm: 6, md: 3 }}>
                    <Card sx={(theme) => ({
                      p: 1.75, borderRadius: 2,
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.01)',
                      border: '1px solid', borderColor: 'divider',
                      bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : '#ffffff',
                      display: 'flex', flexDirection: 'column',
                      justifyContent: 'space-between', height: '100%',
                      transition: 'box-shadow 0.2s, transform 0.2s',
                      '&:hover': { boxShadow: '0 6px 14px rgba(0, 0, 0, 0.05)', transform: 'translateY(-2px)' }
                    })}>
                      <Box sx={{ mb: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block' }}>
                            {card.label}
                          </Typography>
                          {renderScopeChip(card.scope)}
                        </Box>
                        <Typography variant="body2" color="text.disabled" sx={{ fontSize: '10px', lineHeight: '1.2' }}>
                          {card.desc}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mt: 0.5 }}>
                        <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary' }}>
                          {card.val}
                        </Typography>
                      </Box>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Grid>
          </Grid>
        </DialogContent>

        <DialogActions sx={(theme) => ({ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider', bgcolor: theme.palette.mode === 'dark' ? theme.palette.background.paper : '#ffffff' })}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
              <InfoCircleOutlined style={{ fontSize: '13px', color: '#64748b' }} />
              <Typography variant="caption" color="text.secondary">
                P&L từ {detailedReport?.meta?.pnlSource === 'deals' ? 'deals' : 'strategy metadata'}
                {hasDateFilter ? ' (theo khoảng ngày đã chọn)' : ''}.
                Risk metrics: trung bình {formatNumber(reportRisk?.strategyCount ?? 0)} strategies (full backtest).
              </Typography>
            </Box>
            <Button
              variant="contained"
              onClick={() => setReportOpen(false)}
              sx={{
                bgcolor: '#0f172a',
                color: '#fff',
                px: 3,
                fontWeight: 600,
                borderRadius: 1.5,
                '&:hover': { bgcolor: '#1e293b' }
              }}
            >
              Close Report
            </Button>
          </Box>
        </DialogActions>
      </Dialog>

      {/* ==================== STRATEGY SUMMARY MODAL (PDF/REPORT VIEW) ==================== */}
      <Dialog
        open={strategySummaryOpen}
        onClose={() => setStrategySummaryOpen(false)}
        fullWidth
        maxWidth="md"
        PaperProps={{
          sx: {
            borderRadius: 3,
            boxShadow: '0 24px 48px rgba(0, 0, 0, 0.15)',
            overflow: 'hidden',
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider'
          }
        }}
      >
        <Box sx={{
          background: 'linear-gradient(135deg, #1e3a5f 0%, #0d1b2a 100%)',
          color: '#fff',
          px: 3,
          py: 2.5,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <Box sx={{ position: 'absolute', width: '120px', height: '120px', background: 'rgba(46,125,50,0.15)', borderRadius: '50%', right: '-20px', top: '-20px', filter: 'blur(18px)' }} />
          <Box sx={{ position: 'absolute', width: '80px', height: '80px', background: 'rgba(2,136,209,0.12)', borderRadius: '50%', left: '30%', bottom: '-40px', filter: 'blur(12px)' }} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, zIndex: 1 }}>
            <AuditOutlined style={{ fontSize: '22px', color: '#4fc3f7' }} />
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#fff', letterSpacing: '0.2px' }}>
                Strategy Summary Report
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.6)', display: 'block', mt: 0.25 }}>
                Portfolio Overview · Pass/Fail · Risk Metrics
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, zIndex: 1 }}>
            <Chip
              label={selectedTable === 'all_backtests' ? 'All Backtests' : selectedTable}
              size="small"
              sx={{ bgcolor: 'rgba(255,255,255,0.1)', color: '#4fc3f7', fontWeight: 600, border: '1px solid rgba(79,195,247,0.3)', height: 24, fontSize: '0.75rem' }}
            />
            <Button onClick={() => setStrategySummaryOpen(false)} sx={{ color: 'rgba(255,255,255,0.6)', minWidth: 'auto', p: 0.5, borderRadius: '50%', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)', color: '#fff' } }}>
              ✕
            </Button>
          </Box>
        </Box>

        <DialogContent sx={(theme) => ({ p: 3, bgcolor: theme.palette.mode === 'dark' ? theme.palette.background.paper : '#f8fafc' })}>
          {fileOptimizationCheck && (
            <Box sx={{ p: 2, mb: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: isDarkMode ? 'rgba(255,255,255,0.02)' : '#fff' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.5px' }}>
                  File Optimization Progress (Pass Rate)
                </Typography>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, color: (fileOptimizationCheck.cleanRate || 0) >= 80 ? 'success.main' : 'warning.main' }}>
                  {(fileOptimizationCheck.cleanRate || 0).toFixed(1)}% Pass
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', bgcolor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#e2e8f0', mb: 1.5, gap: '2px' }}>
                <Box sx={{ width: `${fileOptimizationCheck.cleanRate || 0}%`, bgcolor: '#2e7d32', transition: 'width 0.8s ease-in-out' }} />
                <Box sx={{ width: `${100 - (fileOptimizationCheck.cleanRate || 0)}%`, bgcolor: '#c62828', transition: 'width 0.8s ease-in-out' }} />
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#2e7d32' }} />
                  <Typography variant="caption" color="text.secondary">
                    Passed Files: <strong>{formatNumber(fileOptimizationCheck.passedFiles || 0)}</strong>
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#c62828' }} />
                  <Typography variant="caption" color="text.secondary">
                    Failed Files: <strong>{formatNumber(fileOptimizationCheck.failedFiles || 0)}</strong>
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary">
                  Total Optimization Files: <strong>{formatNumber(fileOptimizationCheck.totalFiles || 0)}</strong>
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Total Backtest Rows: <strong>{formatNumber(fileOptimizationCheck.totalBacktests || 0)}</strong>
                </Typography>
              </Box>
            </Box>
          )}

          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.secondary', mb: 1.5, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <PieChartOutlined style={{ color: '#0288d1' }} /> Overall
          </Typography>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {[
              { label: 'Total Strategies', value: formatNumber(overview?.totalStrategies || 0) },
              { label: 'Total Symbols', value: formatNumber(overview?.totalSymbols || 0) },
              { label: 'Total Deals', value: formatNumber(overview?.totalDeals || 0) },
              { label: 'Avg Deals/Strategy', value: formatNumber(avgTrades) },
              { label: 'Portfolio Winrate', value: `${overview?.winRate || 0}%` },
              { label: 'Expected Payoff', value: formatCurrency(expectedPayoff) }
            ].map((row) => (
              <Grid key={row.label} size={{ xs: 12, sm: 6, md: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1.25, borderRadius: 1.5, border: '1px solid', borderColor: 'divider', bgcolor: isDarkMode ? 'rgba(255,255,255,0.03)' : '#fff' }}>
                  <Typography variant="body2" color="text.secondary">{row.label}</Typography>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{row.value}</Typography>
                </Box>
              </Grid>
            ))}
          </Grid>

          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.secondary', mb: 1.5, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <DollarOutlined style={{ color: '#2e7d32' }} /> Profit
          </Typography>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {[
              { label: 'Net Profit', value: formatCurrency(netProfit), color: netProfit >= 0 ? '#2e7d32' : '#d32f2f' },
              { label: 'Gross Profit', value: formatCurrency(grossProfit), color: '#2e7d32' },
              { label: 'Gross Loss', value: formatCurrency(grossLoss), color: '#d32f2f' },
              { label: 'Portfolio PF', value: portfolioPF, color: parseFloat(portfolioPF) >= 1.2 ? '#2e7d32' : '#e65100' },
              { label: 'Commission', value: formatCurrency(overview?.totalCommission || 0), color: 'text.secondary' },
              { label: 'Swap', value: formatCurrency(overview?.totalSwap || 0), color: 'text.secondary' }
            ].map((row) => (
              <Grid key={row.label} size={{ xs: 12, sm: 6, md: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1.25, borderRadius: 1.5, border: '1px solid', borderColor: 'divider', bgcolor: isDarkMode ? 'rgba(255,255,255,0.03)' : '#fff' }}>
                  <Typography variant="body2" color="text.secondary">{row.label}</Typography>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: row.color }}>{row.value}</Typography>
                </Box>
              </Grid>
            ))}
          </Grid>

          <Box sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', bgcolor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#e2e8f0', mb: 1, gap: '1px' }}>
              <Box sx={{ width: `${profitPercent}%`, bgcolor: '#1D9E75', transition: 'width 0.8s ease-in-out' }} />
              <Box sx={{ width: `${lossPercent}%`, bgcolor: '#E24B4A', transition: 'width 0.8s ease-in-out' }} />
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="caption" color="text.secondary">Profit: {profitPercent}%</Typography>
              <Typography variant="caption" color="text.secondary">Loss: {lossPercent}%</Typography>
            </Box>
          </Box>

          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.secondary', mb: 1.5, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <SafetyOutlined style={{ color: '#d32f2f' }} /> Risk Metrics & Averages
          </Typography>
          <Grid container spacing={2}>
            {riskMetricCards.map((card, i) => (
              <Grid key={i} size={{ xs: 12, sm: 6, md: 3 }}>
                <Card sx={(theme) => ({
                  p: 1.5, borderRadius: 2,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                  border: '1px solid', borderColor: 'divider',
                  bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : '#ffffff',
                  height: '100%',
                  transition: 'transform 0.2s',
                  '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }
                })}>
                  <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                      {card.label}
                    </Typography>
                    {renderScopeChip(card.scope)}
                  </Box>
                  <Typography variant="body2" color="text.disabled" sx={{ fontSize: '10px', lineHeight: 1.2, mb: 0.75 }}>
                    {card.desc}
                  </Typography>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.primary' }}>
                    {card.val}
                  </Typography>
                </Card>
              </Grid>
            ))}
          </Grid>
        </DialogContent>

        <DialogActions sx={(theme) => ({ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider', bgcolor: theme.palette.mode === 'dark' ? theme.palette.background.paper : '#ffffff' })}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <InfoCircleOutlined style={{ fontSize: '13px', color: '#64748b' }} />
              <Typography variant="caption" color="text.secondary">
                P&L từ {detailedReport?.meta?.pnlSource === 'deals' ? 'deals' : 'strategy metadata'}
                {hasDateFilter ? ' (theo khoảng ngày đã chọn)' : ''}.
                Risk & optimization metrics: tính trung bình trên {formatNumber(reportRisk?.strategyCount ?? 0)} strategies (full backtest).
              </Typography>
            </Box>
            <Button
              variant="contained"
              onClick={() => setStrategySummaryOpen(false)}
              sx={{ bgcolor: '#0f172a', color: '#fff', px: 3, fontWeight: 600, borderRadius: 1.5, '&:hover': { bgcolor: '#1e293b' } }}
            >
              Close
            </Button>
          </Box>
        </DialogActions>
      </Dialog>
    </Grid>
  );
}
