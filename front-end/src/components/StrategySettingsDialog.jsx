// src/components/StrategySettingsDialog.jsx

import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Divider, Stack, Typography, Box, Grid, Chip } from '@mui/material';
import SettingOutlined from '@ant-design/icons/SettingOutlined';

const SettingsRow = ({ label, value }) => (
  <Grid container spacing={2} sx={{ py: 0.5 }}>
    <Grid item xs={4}>
      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
        {label}:
      </Typography>
    </Grid>
    <Grid item xs={8}>
      <Typography variant="body2" sx={{ color: 'text.primary' }}>
        {value !== null && value !== undefined ? String(value) : '-'}
      </Typography>
    </Grid>
  </Grid>
);

const SettingsDialog = ({ open, onClose, strategy, loading }) => {
  if (!strategy || !strategy.settings) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <SettingOutlined style={{ fontSize: '20px', color: '#1976d2' }} />
            <Typography variant="h6">Strategy Settings</Typography>
          </Stack>
        </DialogTitle>
        <Divider />
        <DialogContent>
          <Typography variant="body2" color="textSecondary" align="center" sx={{ py: 4 }}>
            {loading ? 'Loading...' : 'No settings data available'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} variant="contained">Close</Button>
        </DialogActions>
      </Dialog>
    );
  }

  const settings = strategy.settings;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <SettingOutlined style={{ fontSize: '20px', color: '#1976d2' }} />
          <Typography variant="h6">Strategy Settings</Typography>
        </Stack>
        <Typography variant="caption" color="textSecondary">
          {strategy.strategy_id}
        </Typography>
      </DialogTitle>
      <Divider />
      <DialogContent>
        <Box sx={{ py: 2 }}>
          {/* Expert Info */}
          {settings.expert && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, color: '#1976d2' }}>
                Expert
              </Typography>
              <SettingsRow label="Expert" value={settings.expert} />
            </Box>
          )}

          {/* Trading Pair & Period */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, color: '#1976d2' }}>
              Symbol & Period
            </Typography>
            <SettingsRow label="Symbol" value={settings.symbol} />
            <SettingsRow label="Period" value={settings.period} />
            <SettingsRow label="Date Range" value={settings.dateRange} />
          </Box>

          {/* Inputs */}
          {settings.inputs && Object.keys(settings.inputs).length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, color: '#1976d2' }}>
                Inputs
              </Typography>
              <Box sx={{ pl: 2 }}>
                {(() => {
                  const entries = Object.entries(settings.inputs);
                  
                  // Define priority order - these fields will appear first
                  const getPriority = (key) => {
                    const keyLower = key.toLowerCase();
                    if (keyLower === 'magicnumber' || keyLower === 'magic_number') return 1;
                    if (keyLower === 'lotthreshold' || keyLower === 'lot_threshold') return 2;
                    if (keyLower === 'acceptbuy' || keyLower === 'accept_buy') return 3;
                    if (keyLower === 'acceptsell' || keyLower === 'accept_sell') return 4;
                    return 999; // Other fields appear after priority fields
                  };
                  
                  // Sort entries based on priority
                  const sortedEntries = entries.sort(([keyA], [keyB]) => {
                    const priorityA = getPriority(keyA);
                    const priorityB = getPriority(keyB);
                    
                    if (priorityA !== priorityB) {
                      return priorityA - priorityB;
                    }
                    
                    // Same priority - keep original order (stable sort)
                    return 0;
                  });

                  return sortedEntries.map(([key, value]) => (
                    <SettingsRow key={key} label={key} value={value} />
                  ));
                })()}
              </Box>
            </Box>
          )}

          {/* Account Info */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, color: '#1976d2' }}>
              Account Information
            </Typography>
            <SettingsRow label="Company" value={settings.company} />
            <SettingsRow label="Currency" value={settings.currency} />
            <SettingsRow label="Initial Deposit" value={settings.initialDeposit} />
            <SettingsRow label="Leverage" value={settings.leverage} />
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

export default SettingsDialog;
