import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Box, Typography, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, Button, Divider, Stack, Chip, IconButton } from '@mui/material';
import LineChartOutlined from '@ant-design/icons/LineChartOutlined';
import FullscreenOutlined from '@ant-design/icons/FullscreenOutlined';
import FullscreenExitOutlined from '@ant-design/icons/FullscreenExitOutlined';
import dayjs from 'dayjs';
import { useBalanceChart } from 'hooks/useStrategy';

/**
 * Balance Chart Component
 * Hiển thị biểu đồ balance + drawdown theo thời gian từ deals data
 *
 * Props:
 *  - strategy: object
 *  - initialDeposit: number
 *  - dateRange: { startDate: dayjs | null, endDate: dayjs | null }
 *    Nếu có dateRange thì chart chỉ hiển thị dữ liệu trong khoảng đó.
 *    Có nút "Full Period" để xem toàn bộ.
 */
function BalanceChart({ strategy, initialDeposit = 1000000, dateRange }) {
  const [allChartData, setAllChartData] = useState([]);
  const { fetchBalanceChart, loading } = useBalanceChart();

  // Whether the user has chosen to expand to full period (override dateRange)
  const [expanded, setExpanded] = useState(false);
  const isAnalysisRun = strategy?.metrics_mode === 'ANALYSIS_RUN_THRESHOLD';
  const hasManualDateRange = Boolean(dateRange?.startDate && dateRange?.endDate);
  const hasFilteredView = isAnalysisRun || hasManualDateRange;

  // Reset expanded whenever strategy changes
  useEffect(() => {
    setExpanded(false);
  }, [strategy?.strategy_id, strategy?.backtest_table]);

  useEffect(() => {
    if (strategy?.strategy_id && strategy?.backtest_table) {
      loadBalanceData();
    } else {
      console.warn('⚠️ Strategy missing required properties:', strategy);
    }
  }, [
    strategy?.strategy_id,
    strategy?.backtest_table,
    strategy?.metrics_mode,
    strategy?.time_begin,
    strategy?.time_end,
    strategy?.threshold_applied,
    initialDeposit,
    dateRange?.startDate,
    dateRange?.endDate,
    expanded,
    fetchBalanceChart
  ]);

  const loadBalanceData = async () => {
    try {
      const filters = expanded
        ? {}
        : isAnalysisRun
          ? {
              startDate: strategy.time_begin,
              endDate: strategy.time_end,
              maxVolume: strategy.threshold_applied
            }
          : {
              startDate: dateRange?.startDate?.startOf('day')?.toISOString(),
              endDate: dateRange?.endDate?.endOf('day')?.toISOString()
            };
      const data = await fetchBalanceChart(
        strategy.backtest_table,
        strategy.strategy_id,
        initialDeposit,
        filters
      );

      // Backend trả về: [{ time, balance, drawdown, type, profit, commission, swap }, ...]
      const formatted = data.map(item => ({
        time: dayjs(item.time).format('YYYY-MM-DD HH:mm'),
        balance: parseFloat(item.balance),
        drawdown: parseFloat(item.drawdown || 0),
        profit: parseFloat(item.profit || 0),
        commission: parseFloat(item.commission || 0),
        swap: parseFloat(item.swap || 0),
        type: item.type,
        timestamp: new Date(item.time).getTime()
      }));

      setAllChartData(formatted);
    } catch (error) {
      console.error('❌ Failed to load balance data:', error);
      setAllChartData([]);
    }
  };

  const chartData = allChartData;
  const filteredRangeLabel = isAnalysisRun
    ? `${dayjs(strategy.time_begin).format('YYYY-MM-DD')} → ${dayjs(strategy.time_end).format('YYYY-MM-DD')} · Lot ≤ ${strategy.threshold_applied}`
    : `${dateRange?.startDate?.format('YYYY-MM-DD')} → ${dateRange?.endDate?.format('YYYY-MM-DD')}`;

  // Custom Tooltip
  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;

    const data = payload[0].payload;

    return (
      <Box
        sx={{
          bgcolor: 'background.paper',
          p: 1.5,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          boxShadow: 2
        }}
      >
        <Typography variant="caption" display="block">
          {data.time}
        </Typography>
        <Typography variant="body2" fontWeight="600" color="primary">
          Cumulative Profit: ${data.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </Typography>
        <Typography
          variant="caption"
          display="block"
          color={data.drawdown > 0 ? 'error.main' : 'text.secondary'}
          fontWeight="600"
        >
          Drawdown: {data.drawdown > 0 ? '' : ''}{data.drawdown.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </Typography>
        {data.profit !== undefined && (
          <Typography
            variant="caption"
            display="block"
            color={data.profit >= 0 ? 'success.main' : 'error.main'}
          >
            Profit: {data.profit >= 0 ? '+' : ''}{data.profit.toFixed(2)}
          </Typography>
        )}
        {data.commission !== undefined && (
          <Typography
            variant="caption"
            display="block"
            color="error.main"
          >
            Commission: {data.commission.toFixed(2)}
          </Typography>
        )}
        {data.swap !== undefined && (
          <Typography
            variant="caption"
            display="block"
            color={data.swap >= 0 ? 'success.main' : 'error.main'}
          >
            Swap: {data.swap >= 0 ? '+' : ''}{data.swap.toFixed(2)}
          </Typography>
        )}
      </Box>
    );
  };

  // Format Y-axis (balance)
  const formatYAxis = (value) => {
    if (Math.abs(value) >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    }
    if (Math.abs(value) >= 1000) {
      return `${(value / 1000).toFixed(0)}K`;
    }
    return value.toFixed(0);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (allChartData.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No balance data available
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%' }}>
      {/* Date range indicator + Expand / Collapse button */}
      {hasFilteredView && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 1,
            px: 0.5
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            {expanded ? (
              <Chip
                label="Full Period"
                size="small"
                color="default"
                variant="outlined"
              />
            ) : (
              <Chip
                label={`Filtered in ${filteredRangeLabel} (${chartData.length} points)`}
                size="small"
                color="primary"
                variant="outlined"
              />
            )}
          </Stack>

          <Button
            size="small"
            variant={expanded ? 'contained' : 'outlined'}
            color={expanded ? 'primary' : 'secondary'}
            startIcon={expanded ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
            onClick={() => setExpanded(prev => !prev)}
            sx={{ textTransform: 'none', fontSize: 12 }}
          >
            {expanded ? (isAnalysisRun ? 'Back to Analysis Run' : 'Back to Date Range') : 'Full Period'}
          </Button>
        </Box>
      )}

      <Box sx={{ width: '100%', height: 400 }}>
        <ResponsiveContainer>
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10 }}
              angle={-45}
              textAnchor="end"
              height={80}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={formatYAxis}
              tick={{ fontSize: 12 }}
              domain={['auto', 'auto']}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="balance"
              stroke="#2196f3"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
}

// ✅ Strategy Chart Dialog Component
const StrategyChartDialog = ({ open, onClose, strategy, loading, dateRange }) => {
  if (!strategy) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <LineChartOutlined style={{ fontSize: '20px', color: '#1976d2' }} />
            <Typography variant="h6">Strategy Chart</Typography>
          </Stack>
        </DialogTitle>
        <Divider />
        <DialogContent>
          <Typography variant="body2" color="textSecondary" align="center" sx={{ py: 4 }}>
            No strategy data available
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} variant="contained">Close</Button>
        </DialogActions>
      </Dialog>
    );
  }

  const initialDeposit = strategy.settings?.initialDeposit || 1000000;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <LineChartOutlined style={{ fontSize: '20px', color: '#1976d2' }} />
          <Typography variant="h6">
            Cumulative Profit Chart - {strategy.strategy_id}
          </Typography>
        </Stack>
      </DialogTitle>
      <Divider />
      <DialogContent>
        <BalanceChart strategy={strategy} initialDeposit={initialDeposit} dateRange={dateRange} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained">Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export { BalanceChart };
export default StrategyChartDialog;
