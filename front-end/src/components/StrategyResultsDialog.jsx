// src/components/StrategyResultsDialog.jsx

import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Divider, Stack, Typography, Box, Grid } from '@mui/material';
import BarChartOutlined from '@ant-design/icons/BarChartOutlined';
import { BalanceChart } from './StrategyChartDialog';

const ResultRow = ({ label, value, highlight = false }) => (
  <Grid container spacing={2} sx={{ py: 0.5 }}>
    <Grid item xs={6}>
      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
        {label}:
      </Typography>
    </Grid>
    <Grid item xs={6}>
      <Typography 
        variant="body2" 
        sx={{ 
          color: highlight ? (parseFloat(value) >= 0 ? 'success.main' : 'error.main') : 'text.primary',
          fontWeight: highlight ? 600 : 400
        }}
      >
        {value !== null && value !== undefined ? String(value) : '-'}
      </Typography>
    </Grid>
  </Grid>
);

const ResultsDialog = ({ open, onClose, strategy, loading, dateRange }) => {
  if (!strategy || !strategy.results) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <BarChartOutlined style={{ fontSize: '20px', color: '#2e7d32' }} />
            <Typography variant="h6">Backtest Results</Typography>
          </Stack>
        </DialogTitle>
        <Divider />
        <DialogContent>
          <Typography variant="body2" color="textSecondary" align="center" sx={{ py: 4 }}>
            {loading ? 'Loading...' : 'No results data available'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} variant="contained">Close</Button>
        </DialogActions>
      </Dialog>
    );
  }

  const results = strategy.results;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <BarChartOutlined style={{ fontSize: '20px', color: '#2e7d32' }} />
          <Typography variant="h6">Backtest Results</Typography>
        </Stack>
        <Typography variant="caption" color="textSecondary">
          {strategy.strategy_id}
        </Typography>
      </DialogTitle>
      <Divider />
      <DialogContent>
        <Box sx={{ py: 2 }}>
          {/* Balance Chart */}
          <Box sx={{ mb: 4, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.default' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2, color: '#1976d2' }}>
              Cumulative Profit Chart
            </Typography>
            <BalanceChart strategy={strategy} initialDeposit={strategy.settings?.initialDeposit || 1000000} dateRange={dateRange} />
          </Box>

          {/* Quality & Stats */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, color: '#2e7d32' }}>
              History Quality
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={4}><ResultRow label="Quality" value={results.historyQuality} /></Grid>
              <Grid item xs={4}><ResultRow label="Bars" value={results.bars} /></Grid>
              <Grid item xs={4}><ResultRow label="Symbols" value={results.symbols} /></Grid>
            </Grid>
          </Box>

          {/* Profit Metrics */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, color: '#2e7d32' }}>
              Profit Metrics
            </Typography>
            <ResultRow label="Total Net Profit" value={results.totalNetProfit} highlight />
            <ResultRow label="Gross Profit" value={results.grossProfit} />
            <ResultRow label="Gross Loss" value={results.grossLoss} />
            <ResultRow label="Profit Factor" value={results.profitFactor} />
            <ResultRow label="Expected Payoff" value={results.expectedPayoff} />
          </Box>

          {/* Drawdown */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, color: '#2e7d32' }}>
              Drawdown
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>Balance</Typography>
                <ResultRow label="Absolute" value={results.balanceDrawdownAbsolute} />
                <ResultRow label="Maximal" value={results.balanceDrawdownMaximal} />
                <ResultRow label="Relative" value={results.balanceDrawdownRelative} />
              </Grid>
              <Grid item xs={6}>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>Equity</Typography>
                <ResultRow label="Absolute" value={results.equityDrawdownAbsolute} />
                <ResultRow label="Maximal" value={results.equityDrawdownMaximal} />
                <ResultRow label="Relative" value={results.equityDrawdownRelative} />
              </Grid>
            </Grid>
          </Box>

          {/* Risk Metrics */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, color: '#2e7d32' }}>
              Risk Metrics
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <ResultRow label="Recovery Factor" value={results.recoveryFactor} />
                <ResultRow label="Sharpe Ratio" value={results.sharpeRatio} />
                <ResultRow label="Z-Score" value={results.zScore} />
              </Grid>
              <Grid item xs={6}>
                <ResultRow label="Margin Level" value={results.marginLevel} />
                <ResultRow label="AHPR" value={results.ahpr} />
                <ResultRow label="GHPR" value={results.ghpr} />
              </Grid>
            </Grid>
          </Box>

          {/* Trade Statistics */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, color: '#2e7d32' }}>
              Trade Statistics
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <ResultRow label="Total Trades" value={results.totalTrades} />
                <ResultRow label="Total Deals" value={results.totalDeals} />
                <ResultRow label="Long Trades" value={results.longTrades} />
                <ResultRow label="Short Trades" value={results.shortTrades} />
              </Grid>
              <Grid item xs={6}>
                <ResultRow label="Profit Trades" value={results.profitTrades} />
                <ResultRow label="Loss Trades" value={results.lossTrades} />
                <ResultRow label="Avg Consecutive Wins" value={results.avgConsecutiveWins} />
                <ResultRow label="Avg Consecutive Losses" value={results.avgConsecutiveLosses} />
              </Grid>
            </Grid>
          </Box>

          {/* Trade Sizes */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, color: '#2e7d32' }}>
              Trade Sizes
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <ResultRow label="Largest Profit Trade" value={results.largestProfitTrade} highlight />
                <ResultRow label="Average Profit Trade" value={results.averageProfitTrade} />
                <ResultRow label="Max Consecutive Wins" value={results.maxConsecutiveWins} />
                <ResultRow label="Max Consecutive Profit" value={results.maximalConsecutiveProfitCount} />
              </Grid>
              <Grid item xs={6}>
                <ResultRow label="Largest Loss Trade" value={results.largestLossTrade} highlight />
                <ResultRow label="Average Loss Trade" value={results.averageLossTrade} />
                <ResultRow label="Max Consecutive Losses" value={results.maxConsecutiveLosses} />
                <ResultRow label="Max Consecutive Loss" value={results.maximalConsecutiveLossCount} />
              </Grid>
            </Grid>
          </Box>
          {/* Position Holding Time */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, color: '#2e7d32' }}>
              Position Holding Time
            </Typography>
            <ResultRow label="Minimal" value={results.minPositionHoldingTime} />
            <ResultRow label="Maximal" value={results.maxPositionHoldingTime} />
            <ResultRow label="Average" value={results.avgPositionHoldingTime} />
          </Box>

          {/* Correlation */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, color: '#2e7d32' }}>
              Correlation & Statistics
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <ResultRow label="LR Correlation" value={results.lrCorrelation} />
                <ResultRow label="LR Standard Error" value={results.lrStandardError} />
              </Grid>
              <Grid item xs={6}>
                <ResultRow label="Correlation (Profits, MFE)" value={results.correlationProfitsMFE} />
                <ResultRow label="Correlation (Profits, MAE)" value={results.correlationProfitsMAE} />
                <ResultRow label="Correlation (MFE, MAE)" value={results.correlationMFEMAE} />
              </Grid>
            </Grid>
          </Box>
        </Box>
      </DialogContent>
      <Divider />
      <DialogActions>
        <Button onClick={onClose} variant="contained">Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ResultsDialog;
