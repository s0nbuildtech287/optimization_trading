import React, { Fragment, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Grid,
  Typography,
  Chip,
  Button,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TablePagination,
  Collapse,
  Stack,
  Divider,
  Tooltip,
  TextField,
  InputAdornment,
  FormControl,
  MenuItem,
  Select,
  CircularProgress
} from '@mui/material';
import CustomTablePagination from 'components/CustomTablePagination';
import {
  AuditOutlined,
  PieChartOutlined,
  TrophyOutlined,
  FallOutlined,
  SearchOutlined,
  DownOutlined,
  QuestionCircleOutlined
} from '@ant-design/icons';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import MainCard from 'components/MainCard';
import DashboardKpiSummary from 'components/dashboard/DashboardKpiSummary';
import { useBalanceChart } from 'hooks/useStrategy';
import CardLoader from 'components/CardLoader';

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
  const gradientId = `sparkGrad-comparative-tab-${row.id}-${row.backtest}`;

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

export default function RankingTab({
  rankingSummary,
  theme,
  formatNumber,
  handleOpenRemarks,
  selectedTable,
  dateRange,
  isDarkMode,
  searchVal,
  setSearchVal,
  selectedSymbol,
  setSelectedSymbol,
  selectedDirection,
  setSelectedDirection,
  selectedTimeframe,
  setSelectedTimeframe,
  selectedStatus,
  setSelectedStatus,
  uniqueSymbols,
  METRIC_OPTIONS,
  currentMetric,
  setCurrentMetric,
  sortedStrategies,
  paginatedStrategies,
  page,
  setPage,
  rowsPerPage,
  setRowsPerPage,
  expandedRowIds,
  toggleRowExpand,
  getFinalScoreValue,
  getStatusChip,
  getPriorityRiskChip,
  getPerformanceBreakdown,
  getPerformanceQuality,
  formatPositiveContribution,
  formatCurrency,
  colors,
  renderHeaderActions,
  openHelpModal,
  coreLoading = false
}) {
  const navigate = useNavigate();

  return (
    <Box>
      <DashboardKpiSummary
        title="RANKING SUMMARY"
        loading={coreLoading}
        items={[
          {
            label: 'Qualified Strategies',
            value: String(rankingSummary.total),
            sub: 'totalTrades >= 100',
            valueColor: 'text.primary',
            icon: (
              <AuditOutlined
                style={{ fontSize: 18, color: theme.palette.mode === 'dark' ? 'primary.main' : 'var(--chart-title-color, #1F3864)' }}
              />
            ),
            iconBg: theme.palette.mode === 'dark' ? 'rgba(64, 169, 255, 0.15)' : '#BDD7EE'
          },
          {
            label: 'Avg Composite',
            value: formatNumber(rankingSummary.averageComposite),
            sub: 'normalized 0-100',
            valueColor: theme.palette.mode === 'dark' ? 'primary.main' : '#2E75B6',
            icon: <PieChartOutlined style={{ fontSize: 18, color: theme.palette.mode === 'dark' ? 'primary.main' : '#2E75B6' }} />,
            iconBg: theme.palette.mode === 'dark' ? 'rgba(64, 169, 255, 0.15)' : '#BDD7EE'
          },
          {
            label: 'Top Strategy',
            value: formatNumber(rankingSummary.best?.composite || 0),
            sub: rankingSummary.best?.id || 'N/A',
            valueColor: theme.palette.mode === 'dark' ? '#73d13d' : '#70AD47',
            icon: <TrophyOutlined style={{ fontSize: 18, color: theme.palette.mode === 'dark' ? '#73d13d' : '#70AD47' }} />,
            iconBg: theme.palette.mode === 'dark' ? 'rgba(115, 209, 61, 0.15)' : 'rgba(112, 173, 71, 0.12)'
          },
          {
            label: 'Lowest Score',
            value: formatNumber(rankingSummary.weakest?.composite || 0),
            sub: rankingSummary.weakest?.id || 'N/A',
            valueColor: theme.palette.mode === 'dark' ? '#ff4d4f' : '#FF0000',
            icon: <FallOutlined style={{ fontSize: 18, color: theme.palette.mode === 'dark' ? '#ff4d4f' : '#FF0000' }} />,
            iconBg: theme.palette.mode === 'dark' ? 'rgba(255, 77, 79, 0.15)' : 'rgba(255, 0, 0, 0.12)'
          }
        ]}
        onDetailedReportClick={() => handleOpenRemarks('Đối sánh & Xếp hạng (Comparative Ranking Tab)', 'ranking_tab', 'tab_remarks')}
        aiAnalysis={{
          title: 'AI Analysis — Strategy Performance Evaluation',
          subtitle: 'Class 4 · Multi-metric ranking, composites & normalization',
          badge: 'Ranking Module',
          targetId: 'ranking_tab',
          selectedTable: selectedTable,
          dateRange: dateRange,
          sections: [
            {
              heading: 'Tổng quan',
              body: `Hệ thống đã phân tích và so sánh ${rankingSummary.total} chiến lược giao dịch đạt tiêu chuẩn (đã thực hiện trên 100 giao dịch). Điểm số Composite trung bình đạt ${formatNumber(rankingSummary.averageComposite)}, cho thấy mức độ đồng đều và chất lượng ổn định cao của danh mục.`
            },
            {
              heading: 'Chiến lược nổi bật',
              body: `• Chiến lược dẫn đầu: ${rankingSummary.best?.id || 'N/A'} với điểm số Composite cao nhất là ${formatNumber(rankingSummary.best?.composite || 0)}.
• Chiến lược yếu nhất: ${rankingSummary.weakest?.id || 'N/A'} với điểm số Composite là ${formatNumber(rankingSummary.weakest?.composite || 0)}. Khoảng cách điểm số giúp nhận diện rõ sự phân hóa hiệu suất trong danh mục.`
            },
            {
              heading: 'Đánh giá & Khuyến nghị',
              body: 'Điểm Composite chuẩn hóa từ 0-100 dựa trên 4 chiều chỉ số cốt lõi (Sharpe, Profit Factor, Recovery Factor, P/D Ratio) mang tính chất đối sánh tương đối. Nên ưu tiên lựa chọn nhóm chiến lược có điểm Composite >= 70 và kết hợp đa dạng các cặp sản phẩm để tối ưu hiệu quả danh mục đầu tư.'
            }
          ]
        }}
      />

      {/* FILTER RANKING BLOCK */}
      <MainCard
        sx={{
          mb: 3.5,
          border: '1px solid',
          borderColor: 'divider',
          boxShadow: 'none',
          bgcolor: isDarkMode ? 'rgba(255, 255, 255, 0.015)' : '#FAFBFD'
        }}
      >
        <Box
          sx={{
            px: 2,
            py: 1.25,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid',
            borderColor: 'divider',
            mb: 2
          }}
        >
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 800,
              color: isDarkMode ? '#ffffff' : 'var(--chart-title-color, #1F3864)',
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              letterSpacing: '0.3px'
            }}
          >
            FILTER RANKING & METRIC SELECTOR
          </Typography>
          {(searchVal ||
            selectedSymbol !== 'all' ||
            selectedDirection !== 'all' ||
            selectedTimeframe !== 'all' ||
            selectedStatus !== 'all') && (
            <Button
              size="small"
              onClick={() => {
                setSearchVal('');
                setSelectedSymbol('all');
                setSelectedDirection('all');
                setSelectedTimeframe('all');
                setSelectedStatus('all');
              }}
              sx={{ textTransform: 'none', fontSize: '0.72rem', fontWeight: 700, py: 0 }}
              variant="text"
            >
              Xóa bộ lọc
            </Button>
          )}
        </Box>

        <Grid container spacing={2} sx={{ px: 2, pb: 2 }}>
          {/* Search ID */}
          <Grid size={{ xs: 12, sm: 12, md: 4 }}>
            <FormControl fullWidth size="small">
              <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary', mb: 0.75, fontSize: '0.82rem' }}>
                Search ID
              </Typography>
              <TextField
                size="small"
                placeholder="Tìm strategy ID..."
                value={searchVal}
                onChange={(e) => setSearchVal(e.target.value)}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchOutlined style={{ fontSize: 13, color: '#94a3b8' }} />
                      </InputAdornment>
                    )
                  }
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 1.5,
                    height: 38,
                    fontSize: '0.8rem',
                    bgcolor: isDarkMode ? 'background.default' : '#ffffff'
                  }
                }}
              />
            </FormControl>
          </Grid>

          {/* Select Symbol */}
          <Grid size={{ xs: 12, sm: 6, md: 2 }}>
            <FormControl fullWidth size="small">
              <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary', mb: 0.75, fontSize: '0.82rem' }}>
                Symbol
              </Typography>
              <Select
                value={selectedSymbol}
                onChange={(e) => setSelectedSymbol(e.target.value)}
                sx={{
                  height: 38,
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  borderRadius: 1.5,
                  bgcolor: isDarkMode ? 'background.default' : '#ffffff'
                }}
              >
                <MenuItem value="all" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                  Tất cả
                </MenuItem>
                {uniqueSymbols.map((sym) => (
                  <MenuItem key={sym} value={sym} sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                    {sym}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Select Timeframe */}
          <Grid size={{ xs: 12, sm: 6, md: 2 }}>
            <FormControl fullWidth size="small">
              <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary', mb: 0.75, fontSize: '0.82rem' }}>
                Timeframe (TF)
              </Typography>
              <Select
                value={selectedTimeframe}
                onChange={(e) => setSelectedTimeframe(e.target.value)}
                sx={{
                  height: 38,
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  borderRadius: 1.5,
                  bgcolor: isDarkMode ? 'background.default' : '#ffffff'
                }}
              >
                <MenuItem value="all" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                  Tất cả
                </MenuItem>
                <MenuItem value="H1" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                  H1
                </MenuItem>
                <MenuItem value="H4" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                  H4
                </MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {/* Select Performance Status */}
          <Grid size={{ xs: 12, sm: 6, md: 2 }}>
            <FormControl fullWidth size="small">
              <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary', mb: 0.75, fontSize: '0.82rem' }}>
                Performance Status
              </Typography>
              <Select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                sx={{
                  height: 38,
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  borderRadius: 1.5,
                  bgcolor: isDarkMode ? 'background.default' : '#ffffff'
                }}
              >
                <MenuItem value="all" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                  Tất cả
                </MenuItem>
                <MenuItem value="deploy" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                  Deploy (Final Score ≥70)
                </MenuItem>
                <MenuItem value="monitor" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                  Monitor (Final Score 50–69)
                </MenuItem>
                <MenuItem value="review" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                  Review (Final Score {'<'}50)
                </MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {/* Select Direction */}
          <Grid size={{ xs: 12, sm: 6, md: 2 }}>
            <FormControl fullWidth size="small">
              <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary', mb: 0.75, fontSize: '0.82rem' }}>
                Direction
              </Typography>
              <Select
                value={selectedDirection}
                onChange={(e) => setSelectedDirection(e.target.value)}
                sx={{
                  height: 38,
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  borderRadius: 1.5,
                  bgcolor: isDarkMode ? 'background.default' : '#ffffff'
                }}
              >
                <MenuItem value="all" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                  Tất cả
                </MenuItem>
                <MenuItem value="OB" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                  OB (Only Buy)
                </MenuItem>
                <MenuItem value="OS" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                  OS (Only Sell)
                </MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {/* Metric Score Ordering */}
          <Grid size={12} sx={{ mt: 1 }}>
            <Typography
              variant="body2"
              sx={{ fontWeight: 700, color: 'text.primary', display: 'block', mb: 1.25, fontSize: '0.85rem' }}
            >
              Sắp xếp theo tiêu chí (Order By Metric):
            </Typography>
            <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap' }}>
              {METRIC_OPTIONS.map((metric) => (
                <Button
                  key={metric.key}
                  size="small"
                  variant={currentMetric === metric.key ? 'contained' : 'outlined'}
                  onClick={() => setCurrentMetric(metric.key)}
                  sx={{
                    textTransform: 'none',
                    borderRadius: 1.5,
                    fontWeight: 600,
                    height: 32,
                    fontSize: '0.78rem',
                    px: 2,
                    boxShadow: 'none',
                    bgcolor:
                      currentMetric === metric.key
                        ? theme.palette.mode === 'dark'
                          ? 'primary.main'
                          : 'var(--chart-title-color, #1F3864)'
                        : theme.palette.mode === 'dark'
                          ? 'rgba(255, 255, 255, 0.03)'
                          : 'transparent',
                    color:
                      currentMetric === metric.key
                        ? '#ffffff'
                        : theme.palette.mode === 'dark'
                          ? 'text.primary'
                          : 'var(--chart-title-color, #1F3864)',
                    borderColor:
                      currentMetric === metric.key
                        ? theme.palette.mode === 'dark'
                          ? 'primary.main'
                          : 'var(--chart-title-color, #1F3864)'
                        : theme.palette.mode === 'dark'
                          ? 'rgba(255, 255, 255, 0.2)'
                          : 'var(--chart-title-color, #1F3864)',
                    '&:hover': {
                      bgcolor:
                        currentMetric === metric.key
                          ? theme.palette.mode === 'dark'
                            ? 'primary.dark'
                            : 'var(--chart-title-color, #1F3864)'
                          : theme.palette.mode === 'dark'
                            ? 'rgba(255, 255, 255, 0.08)'
                            : 'rgba(31, 56, 100, 0.04)',
                      borderColor:
                        currentMetric === metric.key
                          ? theme.palette.mode === 'dark'
                            ? 'primary.dark'
                            : 'var(--chart-title-color, #1F3864)'
                          : theme.palette.mode === 'dark'
                            ? 'text.primary'
                            : 'var(--chart-title-color, #1F3864)',
                      boxShadow: 'none'
                    }
                  }}
                >
                  {metric.label}
                </Button>
              ))}
            </Box>
          </Grid>
        </Grid>
      </MainCard>

      <MainCard
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'var(--chart-title-color, #1F3864)' }}>
              BẢNG XẾP HẠNG CHIẾN LƯỢC
            </Typography>
            <IconButton
              size="small"
              onClick={() =>
                openHelpModal(
                  'BẢNG XẾP HẠNG CHIẾN LƯỢC (STRATEGY RANKING)',
                  'Composite score = tổng điểm cộng của 7 tiêu chí, chuẩn hóa về thang 0-100 theo toàn bộ data đang được filter.\n\nTrọng số hiện tại:\n- Sharpe: 16% - đo hiệu suất sau khi tính rủi ro biến động. Để phản ánh đúng rủi ro trading thực tế (Sharpe quá cao >3.0 thường là Red Flag do bot Scalping/Grid có Sharpe ảo trong MT5), hệ thống áp dụng thang điểm tuyệt đối: Đạt điểm tối đa (100) ở vùng tối ưu 2.0 - 3.0, giảm dần điểm nếu >3.0 (bắt đầu nghi ngờ) và hạ xuống 0 điểm nếu Sharpe >= 10.0 (chắc chắn có vấn đề).\n- Profit Factor: 16% - đo tổng lãi gộp so với tổng lỗ gộp, càng cao càng tốt.\n- Recovery Factor: 16% - đo khả năng phục hồi lợi nhuận so với drawdown.\n- P/D Ratio: 18% - đo lợi nhuận trên drawdown, càng cao càng tốt.\n- Profit Concentration: 18% - đo Net Profit / Largest Win. Team ưu tiên >=3.0x để tránh chiến lược ăn sổi từ một lệnh quá lớn.\n- Exp. Payoff: 8% - lãi kỳ vọng mỗi trade, trọng số thấp hơn vì dễ bị méo bởi outlier.\n- LR Corr: 8% - độ đều của đường tăng trưởng, là tín hiệu phụ về độ mượt.\n\nStatus khuyến nghị:\n- Deploy: >=70 - hiệu suất tốt để cân nhắc triển khai.\n- Monitor: 50-69 - hiệu suất trung bình/khá, cần giám sát thêm.\n- Review: <50 - cần đánh giá lại trước khi dùng.\n\nScore scale /100 cho các chỉ số rank score:\n- <35: yếu.\n- 35-59: trung bình.\n- 60-79: tốt.\n- >=80: excellent.\n\nProfit Concentration scale:\n- <1.0x: rủi ro cao, lợi nhuận phụ thuộc quá mạnh vào largest win.\n- 1.0-1.49x: yếu.\n- 1.5-2.99x: tốt nhưng chưa đạt chuẩn >=3x.\n- >=3.0x: excellent, đạt chuẩn team.'
                )
              }
            >
              <QuestionCircleOutlined style={{ fontSize: '14px' }} />
            </IconButton>
          </Box>
        }
        secondary={renderHeaderActions(
          'Bảng xếp hạng chiến lược',
          'Phân tích Bảng xếp hạng chiến lược và composite score',
          sortedStrategies
        )}
        sx={{ mt: 3 }}
      >
        {coreLoading ? (
          <CardLoader height={320} size={35} message="Đang tải danh sách chiến lược..." />
        ) : (
          <>
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
                  Rank
                </TableCell>
                <TableCell
                  align="center"
                  sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? 'text.primary' : 'text.secondary' }}
                >
                  Strategy
                </TableCell>
                <TableCell
                  align="center"
                  sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? 'text.primary' : 'text.secondary' }}
                >
                  Backtest Table
                </TableCell>
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
                  TF
                </TableCell>
                <TableCell
                  align="center"
                  sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? 'text.primary' : 'text.secondary' }}
                >
                  Dir
                </TableCell>
                <TableCell
                  align="center"
                  sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? 'text.primary' : 'text.secondary' }}
                >
                  Final Score
                </TableCell>
                <TableCell
                  align="center"
                  sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? 'text.primary' : 'text.secondary' }}
                >
                  Performance Status
                </TableCell>
                <TableCell
                  align="center"
                  sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? 'text.primary' : 'text.secondary' }}
                >
                  Priority (Risk)
                </TableCell>
                <TableCell
                  align="center"
                  sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? 'text.primary' : 'text.secondary' }}
                >
                  Chart
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
                  EP
                </TableCell>
                <TableCell
                  align="center"
                  sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? 'text.primary' : 'text.secondary' }}
                >
                  Profit
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedStrategies.map((row, index) => {
                const rowKey = `${row.backtest || 'all'}-${row.id}`;
                const isExpanded = expandedRowIds.has(rowKey);

                return (
                  <Fragment key={rowKey}>
                    <TableRow hover onClick={() => toggleRowExpand(rowKey)} sx={{ cursor: 'pointer' }}>
                      <TableCell align="center" sx={{ fontWeight: 700 }}>
                        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                          <DownOutlined
                            style={{
                              fontSize: 10,
                              transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                              transition: 'transform 160ms ease'
                            }}
                          />
                          {page * rowsPerPage + index + 1}
                        </Box>
                      </TableCell>
                      <TableCell
                        align="center"
                        sx={{
                          fontWeight: 700,
                          fontFamily: 'monospace',
                          cursor: 'pointer',
                          transition: 'color 0.15s ease-in-out',
                          '&:hover': {
                            color: theme.palette.mode === 'dark' ? '#00f5ff' : 'primary.main',
                            textDecoration: 'underline'
                          }
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/strategy-input?search=${row.id}`);
                        }}
                      >
                        {row.id}
                      </TableCell>
                      <TableCell align="center" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        {row.backtest || '-'}
                      </TableCell>
                      <TableCell align="center">{row.symbol}</TableCell>
                      <TableCell align="center">{row.timeframe}</TableCell>
                      <TableCell align="center">{row.direction}</TableCell>
                      <TableCell align="center">
                        <Chip
                          label={formatNumber(getFinalScoreValue(row))}
                          sx={{
                            bgcolor: theme.palette.mode === 'dark' ? 'rgba(0, 245, 255, 0.18)' : '#BDD7EE',
                            color: theme.palette.mode === 'dark' ? '#00f5ff' : 'var(--chart-title-color, #1F3864)',
                            fontWeight: 900,
                            border: theme.palette.mode === 'dark' ? '1px solid rgba(0, 245, 255, 0.5)' : 'none',
                            borderRadius: 1.5,
                            fontSize: '0.8rem'
                          }}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="center">{getStatusChip(row, theme)}</TableCell>
                      <TableCell align="center">{getPriorityRiskChip(row, theme)}</TableCell>
                      <TableCell align="center">
                        <MiniSparkline row={row} />
                      </TableCell>
                      <TableCell align="center">{formatNumber(row.sharpe)}</TableCell>
                      <TableCell align="center">{formatNumber(row.pf)}</TableCell>
                      <TableCell align="center">{formatNumber(row.rf)}</TableCell>
                      <TableCell align="center">{formatNumber(row.pd)}</TableCell>
                      <TableCell align="center">{formatNumber(row.ep)}</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700, color: row.profit >= 0 ? colors.success.text : colors.error.text }}>{formatCurrency(row.profit)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={16} sx={{ p: 0, borderBottom: isExpanded ? '1px solid' : 0, borderColor: 'divider' }}>
                        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                          <Box sx={{ p: 1.5, bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.025)' : '#F8FBFF' }}>
                            <Box
                              sx={{
                                display: 'grid',
                                gridTemplateColumns: { xs: '1fr', lg: 'minmax(280px, 30%) minmax(0, 70%)' },
                                gap: 1.25,
                                alignItems: 'stretch'
                              }}
                            >
                              <Box
                                sx={{
                                  p: 1.25,
                                  minHeight: '100%',
                                  border: '1px solid',
                                  borderColor: 'divider',
                                  borderRadius: 1.5,
                                  bgcolor: theme.palette.mode === 'dark' ? 'background.default' : '#FFFFFF'
                                }}
                              >
                                <Typography
                                  variant="caption"
                                  sx={{
                                    fontWeight: 800,
                                    color: 'text.secondary',
                                    textTransform: 'uppercase',
                                    display: 'block',
                                    mb: 0.6,
                                    fontSize: '0.75rem',
                                    lineHeight: 1.2
                                  }}
                                >
                                  Score formula
                                </Typography>
                                <Stack spacing={0.55}>
                                  {getPerformanceBreakdown(row).map((item) => {
                                    const quality = getPerformanceQuality(item.normalized);
                                    return (
                                      <Box
                                        key={item.key}
                                        sx={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          gap: 1.1,
                                          minHeight: 18
                                        }}
                                      >
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.55, minWidth: 0 }}>
                                          <Box
                                            sx={{
                                              width: 6,
                                              height: 6,
                                              borderRadius: '50%',
                                              bgcolor: quality.color,
                                              boxShadow: '0 0 0 2px ' + quality.color + '22',
                                              flex: '0 0 auto'
                                            }}
                                          />
                                          <Typography
                                            variant="caption"
                                            color="text.secondary"
                                            sx={{
                                              fontWeight: 700,
                                              whiteSpace: 'nowrap',
                                              overflow: 'hidden',
                                              textOverflow: 'ellipsis',
                                              fontSize: '0.72rem',
                                              lineHeight: 1.2
                                            }}
                                          >
                                            {item.label} - W {item.weight}
                                          </Typography>
                                        </Box>
                                        <Typography
                                          variant="caption"
                                          sx={{
                                            fontWeight: 900,
                                            color: theme.palette.success.main,
                                            flex: '0 0 auto',
                                            fontSize: '0.72rem',
                                            lineHeight: 1.2
                                          }}
                                        >
                                          {formatPositiveContribution(item.contribution)}
                                        </Typography>
                                      </Box>
                                    );
                                  })}

                                  <Divider sx={{ my: 0.4 }} />
                                  <Box
                                    sx={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      gap: 2,
                                      minHeight: 20
                                    }}
                                  >
                                    <Typography variant="caption" sx={{ fontWeight: 800, fontSize: '0.75rem', lineHeight: 1.2 }}>
                                      Final score
                                    </Typography>
                                    <Typography
                                      variant="caption"
                                      sx={{ fontWeight: 900, color: theme.palette.primary.main, fontSize: '0.82rem', lineHeight: 1.2 }}
                                    >
                                      {formatNumber(getFinalScoreValue(row))}
                                    </Typography>
                                  </Box>
                                </Stack>
                              </Box>

                              <Box
                                sx={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 1.25
                                }}
                              >
                                <Box
                                  sx={{
                                    display: 'grid',
                                    gridTemplateColumns: {
                                      xs: '1fr',
                                      sm: 'repeat(2, minmax(0, 1fr))',
                                      xl: 'repeat(4, minmax(0, 1fr))'
                                    },
                                    gap: 1.25
                                  }}
                                >
                                  {getPerformanceBreakdown(row).map((item) => {
                                    const quality = getPerformanceQuality(item.normalized);
                                    return (
                                      <Box
                                        key={item.key}
                                        sx={{
                                          p: 1.1,
                                          minHeight: 86,
                                          border: '1px solid',
                                          borderColor: 'divider',
                                          borderRadius: 1.5,
                                          bgcolor: theme.palette.mode === 'dark' ? 'background.default' : '#FFFFFF'
                                        }}
                                      >
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.5 }}>
                                          <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>
                                            {item.label}
                                          </Typography>
                                          <Chip
                                            label="Điểm cộng"
                                            size="small"
                                            color="success"
                                            variant="outlined"
                                            sx={{ height: 18, fontSize: '0.6rem' }}
                                          />
                                        </Box>
                                        <Typography
                                          variant="subtitle1"
                                          sx={{ fontWeight: 900, color: theme.palette.success.main, lineHeight: 1.2 }}
                                        >
                                          {formatPositiveContribution(item.contribution)}
                                        </Typography>
                                        <Stack spacing={0.25} sx={{ mt: 0.5 }}>
                                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                                            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.25 }}>
                                              Giá trị gốc: {item.raw}
                                            </Typography>
                                            <Chip
                                              label={quality.label}
                                              size="small"
                                              variant="outlined"
                                              sx={{
                                                height: 18,
                                                fontSize: '0.58rem',
                                                fontWeight: 800,
                                                color: quality.color,
                                                borderColor: quality.color,
                                                bgcolor: `${quality.color}18`
                                              }}
                                            />
                                          </Box>
                                          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.25 }}>
                                            Điểm quy đổi: {formatNumber(item.normalized)}/100
                                          </Typography>
                                          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.25 }}>
                                            Tỷ trọng trong điểm hiệu suất: {item.weight}
                                          </Typography>
                                        </Stack>
                                      </Box>
                                    );
                                  })}
                                </Box>
                              </Box>
                            </Box>
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>

            <CustomTablePagination
              count={sortedStrategies.length}
              page={page}
              rowsPerPage={rowsPerPage}
              onPageChange={(_, nextPage) => setPage(nextPage)}
              onRowsPerPageChange={(event) => {
                setRowsPerPage(parseInt(event.target.value, 10));
                setPage(0);
              }}
              rowsPerPageOptions={[25, 50, 100]}
            />
          </>
        )}
      </MainCard>
    </Box>
  );
}
