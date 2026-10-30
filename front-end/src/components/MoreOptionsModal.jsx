import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  FormControlLabel,
  Checkbox,
  Box,
  Divider,
  Collapse,
  ToggleButton,
  ToggleButtonGroup,
  TextField,
  Select,
  MenuItem,
  FormControl,
  useMediaQuery
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { FilterOutlined } from '@ant-design/icons';

// Available optional filter options
const FILTER_OPTIONS = [
  { key: 'pd', label: 'P/D', description: 'Profit/Drawdown ratio' },
  { key: 'totalNetProfit', label: 'Total Net Profit', description: 'Overall profit amount' },
  { key: 'totalTrades', label: 'Total Trades', description: 'Number of trades' },
  { key: 'winrate', label: 'Winrate %', description: 'Win percentage' },
  { key: 'largestProfitTradeRatio', label: 'Largest Profit Trade Ratio', description: 'Ratio of largest winning trade' },
  { key: 'riskRewardRatio', label: 'Risk-Reward Ratio', description: 'Risk to reward ratio' },

  { key: 'drawdown', label: 'Drawdown', description: 'Maximum drawdown (% or absolute value)' },
  { key: 'largestLossTrade', label: 'Largest Loss Trade', description: 'Max acceptable largest losing trade' },
  { key: 'profitFactor', label: 'Profit Factor', description: 'Gross profit / Gross loss ratio' },
  { key: 'sharpeRatio', label: 'Sharpe Ratio', description: 'Risk-adjusted return metric' },
  { key: 'recoveryFactor', label: 'Recovery Factor', description: 'Net profit / Max drawdown' },
  { key: 'lrCorrelation', label: 'LR Correlation', description: 'Linear regression correlation' }
];

const OPERATORS = [
  { value: '>=', label: '≥' },
  { value: '>', label: '>' },
  { value: '<', label: '<' },
  { value: '<=', label: '≤' },
  { value: 'range', label: 'Range' }
];

const MoreOptionsModal = ({ open, onClose, onAddFilters, activeFilters = [], filterOperators = {}, filterRanges = {}, drawdownUnit = 'percent' }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [selectedFilters, setSelectedFilters] = useState([]);
  const [operators, setOperators] = useState({});
  const [rangeValues, setRangeValues] = useState({});
  const [drawdownUnitState, setDrawdownUnitState] = useState('percent'); // 'percent' or 'absolute'

  // Sync from parent when modal opens
  useEffect(() => {
    if (open) {
      setSelectedFilters(activeFilters);
      setOperators({ ...filterOperators });
      setRangeValues({ ...filterRanges });
      setDrawdownUnitState(drawdownUnit || 'percent');
    }
  }, [open, activeFilters, filterOperators, filterRanges, drawdownUnit]);

  const handleToggleFilter = (filterKey) => {
    if (selectedFilters.includes(filterKey)) {
      setSelectedFilters((prev) => prev.filter((key) => key !== filterKey));
      setOperators((prev) => { const { [filterKey]: _r, ...rest } = prev; return rest; });
      setRangeValues((prev) => { const { [filterKey]: _r, ...rest } = prev; return rest; });
    } else {
      setSelectedFilters((prev) => [...prev, filterKey]);
      setOperators((prev) => ({ ...prev, [filterKey]: '>=' }));
    }
  };

  const handleRangeValueChange = (filterKey, field, value) => {
    setRangeValues((prev) => ({
      ...prev,
      [filterKey]: {
        ...(prev[filterKey] || { min: '', max: '' }),
        [field]: value
      }
    }));
  };

  const handleApply = () => {
    onAddFilters(selectedFilters, operators, rangeValues, drawdownUnitState);
    onClose();
  };

  const handleCancel = () => {
    setSelectedFilters(activeFilters);
    setOperators({ ...filterOperators });
    setRangeValues({ ...filterRanges });
    setDrawdownUnitState(drawdownUnit || 'percent');
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      maxWidth="md"
      fullWidth
      fullScreen={fullScreen}
      PaperProps={{
        sx: {
          borderRadius: { xs: 0, sm: 2 },
          m: { xs: 0, sm: 2 }
        }
      }}
    >
      <DialogTitle sx={{ pb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        <FilterOutlined />
        More Filter Options
      </DialogTitle>
      <DialogContent sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Select additional filters to display in the filter block:
        </Typography>
        <Divider sx={{ mb: 2 }} />
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
            gap: 1.5,
            alignItems: 'start',
            '& > *': { minWidth: 0 }
          }}
        >
          {FILTER_OPTIONS.map((option) => (
            <Box
              key={option.key}
              sx={{
                borderRadius: 1,
                border: '1px solid',
                borderColor: selectedFilters.includes(option.key) ? 'primary.main' : 'divider',
                transition: 'border-color 0.2s',
                overflow: 'hidden',
                cursor: 'pointer',
                minHeight: 90,
                minWidth: 0,
                '&:hover': { borderColor: 'primary.main' }
              }}
              onClick={() => handleToggleFilter(option.key)}
            >
              <Box sx={{ p: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, minWidth: 0 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={selectedFilters.includes(option.key)}
                        onChange={() => handleToggleFilter(option.key)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body1" fontWeight={500}>
                          {option.label}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {option.description}
                        </Typography>
                      </Box>
                    }
                    sx={{
                      flex: 1,
                      m: 0,
                      alignItems: 'flex-start',
                      minWidth: 0,
                      '& .MuiFormControlLabel-label': { minWidth: 0 }
                    }}
                  />
                  {/* ✅ Dropdown for Drawdown unit selection */}
                  {option.key === 'drawdown' && selectedFilters.includes(option.key) && (
                    <FormControl size="small" sx={{ minWidth: 80 }} onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={drawdownUnitState}
                        onChange={(e) => setDrawdownUnitState(e.target.value)}
                        size="small"
                        sx={{ fontSize: '12px', height: '28px' }}
                      >
                        <MenuItem value="percent">%</MenuItem>
                        <MenuItem value="absolute">Value</MenuItem>
                      </Select>
                    </FormControl>
                  )}
                </Box>
              </Box>
              <Collapse in={selectedFilters.includes(option.key)} unmountOnExit>
                <Box sx={{ px: 1.5, pb: 1.5 }} onClick={(e) => e.stopPropagation()}>
                  <ToggleButtonGroup
                    value={operators[option.key] || '>='}
                    exclusive
                    onChange={(_, val) => { if (val) setOperators((prev) => ({ ...prev, [option.key]: val })); }}
                    size="small"
                    fullWidth
                  >
                    {OPERATORS.map((op) => (
                      <ToggleButton
                        key={op.value}
                        value={op.value}
                        sx={{
                          flex: 1,
                          fontSize: { xs: '12px', sm: '13px' },
                          fontWeight: 600,
                          py: 0.4,
                          px: { xs: 0.5, sm: 1 },
                          '&.Mui-selected': {
                            bgcolor: 'primary.main',
                            color: 'white',
                            '&:hover': { bgcolor: 'primary.dark' }
                          }
                        }}
                      >
                        {op.label}
                      </ToggleButton>
                    ))}
                  </ToggleButtonGroup>
                  <Collapse in={operators[option.key] === 'range'} unmountOnExit>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1, mt: 1 }}>
                      <TextField
                        size="small"
                        placeholder="Min"
                        type="number"
                        value={rangeValues[option.key]?.min || ''}
                        onChange={(e) => handleRangeValueChange(option.key, 'min', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        fullWidth
                        inputProps={{ step: 'any' }}
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            height: 32,
                            alignItems: 'center'
                          },
                          '& .MuiOutlinedInput-input': {
                            py: 0.5,
                            px: 1,
                            fontSize: '0.8125rem',
                            height: 'auto',
                            '&::placeholder': {
                              opacity: 0.7
                            }
                          }
                        }}
                      />
                      <TextField
                        size="small"
                        placeholder="Max"
                        type="number"
                        value={rangeValues[option.key]?.max || ''}
                        onChange={(e) => handleRangeValueChange(option.key, 'max', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        fullWidth
                        inputProps={{ step: 'any' }}
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            height: 32,
                            alignItems: 'center'
                          },
                          '& .MuiOutlinedInput-input': {
                            py: 0.5,
                            px: 1,
                            fontSize: '0.8125rem',
                            height: 'auto',
                            '&::placeholder': {
                              opacity: 0.7
                            }
                          }
                        }}
                      />
                    </Box>
                  </Collapse>
                </Box>
              </Collapse>
            </Box>
          ))}
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2, justifyContent: 'space-between', flexDirection: { xs: 'column-reverse', sm: 'row' }, gap: 1 }}>
        <Button onClick={handleCancel} variant="outlined" sx={{ width: { xs: '100%', sm: 'auto' } }}>
          Cancel
        </Button>
        <Button onClick={handleApply} variant="contained" sx={{ width: { xs: '100%', sm: 'auto' } }}>
          Apply Filters ({selectedFilters.length})
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default MoreOptionsModal;
