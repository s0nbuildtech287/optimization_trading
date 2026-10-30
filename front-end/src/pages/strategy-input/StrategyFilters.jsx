import React from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Stack from '@mui/material/Stack';
import CircularProgress from '@mui/material/CircularProgress';
import Checkbox from '@mui/material/Checkbox';
import ListItemText from '@mui/material/ListItemText';
import OutlinedInput from '@mui/material/OutlinedInput';
import { useTheme } from '@mui/material/styles';

// Icons
import SearchOutlined from '@ant-design/icons/SearchOutlined';
import ReloadOutlined from '@ant-design/icons/ReloadOutlined';
import SettingOutlined from '@ant-design/icons/SettingOutlined';
import CloseOutlined from '@ant-design/icons/CloseOutlined';
import RobotOutlined from '@ant-design/icons/RobotOutlined';
import InfoCircleOutlined from '@ant-design/icons/InfoCircleOutlined';

// Project
import MainCard from 'components/MainCard';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';

const getBacktestDisplayName = (value) => {
  if (!value || value === 'all_backtests') return 'All Backtest';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'No source selected';
    return value.map(v => v.charAt(0).toUpperCase() + v.slice(1)).join(' + ');
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const formatNumberVN = (value) => {
  if (!value) return '';
  const num = String(value).replace(/[^\d]/g, '');
  return num.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

const parseNumberVN = (value) => {
  if (!value) return '';
  return String(value).replace(/\./g, '');
};

const OP_SYMBOLS = { '>=': '≥', '>': '>', '<': '<', '<=': '≤' };

export default function StrategyFilters({
  inputFilters,
  handleBacktestChange,
  backtestTables,
  loadingTables,
  analysisRunId,
  handleAnalysisRunChange,
  handleAnalysisRunOpen,
  analysisRuns = [],
  loadingRuns = false,
  symbols,
  dateRange,
  handleDateRangeChange,
  activeFilters,
  filterOperators,
  filterRanges,
  drawdownUnit,
  handleFilterChange,
  handleKeyDown,
  handleRemoveFilter,
  handleReset,
  handleMoreOptionsClick,
  loading,
  applyButtonDisabled,
  handleSearch,
  pagination,
  data,
  appliedFilters,
  appliedDateRange,
  setInfoDialogOpen
}) {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const [searchDraft, setSearchDraft] = React.useState(inputFilters.search || '');
  const searchSyncTimeoutRef = React.useRef(null);
  const selectedBacktestTables = inputFilters.backtest === 'all_backtests'
    ? backtestTables
    : (Array.isArray(inputFilters.backtest) ? inputFilters.backtest : [inputFilters.backtest].filter(Boolean));

  React.useEffect(() => {
    setSearchDraft(inputFilters.search || '');
  }, [inputFilters.search]);

  React.useEffect(() => () => {
    if (searchSyncTimeoutRef.current) clearTimeout(searchSyncTimeoutRef.current);
  }, []);

  const handleSearchDraftChange = (event) => {
    const value = event.target.value;
    setSearchDraft(value);
    if (searchSyncTimeoutRef.current) clearTimeout(searchSyncTimeoutRef.current);
    searchSyncTimeoutRef.current = setTimeout(() => {
      handleFilterChange('search', value);
    }, 250);
  };

  const flushSearchDraft = () => {
    if (searchSyncTimeoutRef.current) clearTimeout(searchSyncTimeoutRef.current);
    searchSyncTimeoutRef.current = null;
    handleFilterChange('search', searchDraft);
  };
  const opLabel = (text, key) => {
    if (filterOperators[key] === 'range') return `${text} [Range]`;
    const sym = OP_SYMBOLS[filterOperators[key] || '>='];
    return `${text} (${sym})`;
  };

  const isRange = (key) => filterOperators[key] === 'range';

  const rangeDisplay = (key) => {
    const r = filterRanges[key];
    if (!r) return '';
    const mn = r.min !== undefined && r.min !== '' ? r.min : '';
    const mx = r.max !== undefined && r.max !== '' ? r.max : '';
    return `[${mn} : ${mx}]`;
  };

  const filterGridSx = {
    display: 'grid',
    gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(5, minmax(0, 1fr))' },
    gap: 2,
    mb: 2,
    '& > *': { minWidth: 0 }
  };

  const optionalFilterGridSx = {
    display: 'grid',
    gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(5, minmax(0, 1fr))' },
    gap: 2,
    mb: 2,
    '& > *': { minWidth: 0 }
  };

  const dateTextFieldSx = {
    '& .MuiOutlinedInput-root': {
      minHeight: 32,
      '& fieldset': { border: 'none' },
      '&:hover fieldset': { border: 'none' },
      '&.Mui-focused fieldset': { border: 'none' }
    },
    '& .MuiInputBase-input': {
      fontSize: '13px',
      padding: '4px 8px',
      cursor: 'pointer',
      minWidth: 0,
      color: isDarkMode ? '#f1f5f9' : 'text.primary'
    }
  };

  const actionButtonHalfSx = {
    minWidth: { xs: 0, sm: 120 },
    px: { xs: 1.5, sm: 3 },
    flex: { xs: '1 1 calc(50% - 8px)', sm: '0 0 auto' }
  };

  const actionButtonThirdSx = {
    minWidth: { xs: 0, sm: 120 },
    px: { xs: 1, sm: 3 },
    flex: { xs: '1 1 calc(33.333% - 11px)', sm: '0 0 auto' }
  };

    const removeFilterBtnSx = {
    position: 'absolute',
    right: -6,
    top: -6,
    padding: '2px',
    minWidth: 'auto',
    width: '18px',
    height: '18px',
    opacity: 0,
    transition: 'opacity 0.2s, background-color 0.2s, color 0.2s, border-color 0.2s',
    backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
    border: '1px solid',
    borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.15)',
    boxShadow: '0 2px 5px rgba(0,0,0,0.15)',
    zIndex: 10,
    borderRadius: '50%',
    color: isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'text.secondary',
    '&:hover': {
      backgroundColor: 'error.main',
      color: '#ffffff',
      borderColor: 'error.main'
    }
  };

  const inputOverridesSx = {
    // Input label (floating/normal label)
    '& .MuiInputLabel-root': {
      color: isDarkMode ? 'rgba(255, 255, 255, 0.6)' : 'text.secondary',
    },
    '& .MuiInputLabel-root.Mui-focused': {
      color: 'primary.main',
    },
    // Floating label shrink background
    '& .MuiInputLabel-outlined.MuiInputLabel-shrink': {
      background: isDarkMode ? 'background.paper' : '#fafafb',
      color: isDarkMode ? 'rgba(255, 255, 255, 0.85)' : 'text.secondary',
    },
    // Input value text
    '& .MuiInputBase-input': {
      color: isDarkMode ? '#f8fafc' : 'text.primary',
    },
    // Input placeholder text
    '& .MuiInputBase-input::placeholder': {
      color: isDarkMode ? 'rgba(255, 255, 255, 0.55)' : 'text.disabled',
      opacity: 1,
    },
    // Select dropdown arrow icon
    '& .MuiSelect-icon': {
      color: isDarkMode ? 'rgba(255, 255, 255, 0.6)' : 'text.secondary',
    },
    // Outlined input borders
    '& .MuiOutlinedInput-notchedOutline': {
      borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)',
    },
    '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': {
      borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.4)' : 'primary.main',
    }
  };

  return (
    <Grid size={12}>
      <MainCard
        title={`Filters - ${getBacktestDisplayName(inputFilters.backtest)}`}
        sx={inputOverridesSx}
      >
        {/* Row 1: Backtest, Analysis Run, Search, Symbol, DateRange - exactly 5 columns */}
        <Box sx={filterGridSx}>
          <Box sx={{ minWidth: 0 }}>
            <FormControl fullWidth size="small">
              <InputLabel shrink sx={{
                '&.MuiInputLabel-root': {
                  color: isDarkMode ? '#f8fafc' : 'text.secondary'
                },
                '&.MuiInputLabel-outlined.MuiInputLabel-shrink': {
                  background: isDarkMode ? 'background.paper' : '#fafafb',
                  color: isDarkMode ? '#f8fafc' : 'text.secondary'
                },
                '&.MuiFormLabel-root': {
                  color: isDarkMode ? '#f8fafc' : 'text.secondary'
                },
                '&.Mui-focused': {
                  color: 'primary.main'
                }
              }}>Backtest Table</InputLabel>
              <Select
                multiple
                value={selectedBacktestTables}
                onChange={handleBacktestChange}
                label="Backtest Table"
                disabled={loadingTables}
                notched
                input={<OutlinedInput label="Backtest Table" />}
                renderValue={(selected) => {
                  if (!selected || selected.length === 0) return <em>No source selected</em>;
                  if (selected.length === backtestTables.length) return `All backtests - ${selected.length} tables`;
                  return `${selected.length}/${backtestTables.length} tables selected`;
                }}
                sx={{
                  height: 40,
                  fontSize: '13px',
                  fontWeight: 600,
                  bgcolor: isDarkMode ? 'rgba(255,255,255,0.02)' : '#ffffff',
                  color: isDarkMode ? '#f1f5f9' : 'text.primary',
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'
                  }
                }}
                MenuProps={{
                  PaperProps: {
                    sx: {
                      bgcolor: isDarkMode ? '#1e293b' : '#ffffff',
                      color: isDarkMode ? '#f8fafc' : 'text.primary'
                    }
                  }
                }}
              >
                <MenuItem value="all_select" sx={{ fontSize: '13px', fontWeight: 600 }}>
                  <Checkbox
                    checked={selectedBacktestTables.length === backtestTables.length && backtestTables.length > 0}
                    indeterminate={selectedBacktestTables.length > 0 && selectedBacktestTables.length < backtestTables.length}
                    size="small"
                  />
                  <ListItemText primary="Select All" primaryTypographyProps={{ fontSize: '13px', fontWeight: 600 }} />
                </MenuItem>
                {backtestTables.map((table) => (
                  <MenuItem key={table} value={table} sx={{ fontSize: '13px', fontWeight: 500 }}>
                    <Checkbox checked={selectedBacktestTables.includes(table)} size="small" />
                    <ListItemText primary={table} primaryTypographyProps={{ fontSize: '13px' }} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Box sx={{ minWidth: 0 }}>
            <FormControl fullWidth>
              <InputLabel shrink sx={{
                '&.MuiInputLabel-root': {
                  color: isDarkMode ? '#f8fafc' : 'text.secondary'
                },
                '&.MuiInputLabel-outlined.MuiInputLabel-shrink': {
                  background: isDarkMode ? 'background.paper' : '#fafafb',
                  color: isDarkMode ? '#f8fafc' : 'text.secondary'
                },
                '&.MuiFormLabel-root': {
                  color: isDarkMode ? '#f8fafc' : 'text.secondary'
                },
                '&.Mui-focused': {
                  color: 'primary.main'
                }
              }}>Analysis Run (Lot OP)</InputLabel>
              <Select
                value={analysisRunId || ''}
                onChange={handleAnalysisRunChange}
                onOpen={handleAnalysisRunOpen}
                label="Analysis Run (Lot OP)"
                displayEmpty
                input={<OutlinedInput label="Analysis Run (Lot OP)" />}
                renderValue={(selected) => {
                  if (!selected) return 'Full Period (Không chọn Run)';
                  const found = (analysisRuns || []).find(r => r.analysis_run_id === selected);
                  return found ? (found.name || found.analysis_run_id) : selected;
                }}
              >
                <MenuItem value="">
                  <em>Full Period (Không chọn Run)</em>
                </MenuItem>
                {loadingRuns && (
                  <MenuItem disabled>
                    <CircularProgress size={14} sx={{ mr: 1 }} /> Loading runs...
                  </MenuItem>
                )}
                {(analysisRuns || []).map((run) => (
                  <MenuItem key={run.analysis_run_id} value={run.analysis_run_id}>
                    <ListItemText
                      primary={run.name || run.analysis_run_id}
                      secondary={`${run.analysis_run_id} | ${run.total_strategies || 0} strats`}
                    />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Box sx={{ minWidth: 0 }}>
            <TextField
              fullWidth
              label="Search Strategy ID"
              value={searchDraft}
              onChange={handleSearchDraftChange}
              onBlur={flushSearchDraft}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  if (searchSyncTimeoutRef.current) clearTimeout(searchSyncTimeoutRef.current);
                  searchSyncTimeoutRef.current = null;
                  handleSearch(searchDraft);
                }
              }}
              placeholder="Enter strategy ID..."
              InputProps={{ endAdornment: <SearchOutlined /> }}
            />
          </Box>

          <Box sx={{ minWidth: 0 }}>
            <FormControl fullWidth>
              <InputLabel>Symbol</InputLabel>
              <Select
                multiple
                value={inputFilters.symbols}
                onChange={(e) => handleFilterChange('symbols', e.target.value)}
                input={<OutlinedInput label="Symbol" />}
                renderValue={(selected) => {
                  if (selected.length === 0) return 'All Symbols';
                  if (symbols.length > 0 && selected.length === symbols.length) return 'All Symbols';
                  return selected.join(', ');
                }}
                MenuProps={{
                  PaperProps: {
                    style: {
                      maxHeight: 300
                    }
                  }
                }}
              >
                {symbols.map((s) => (
                  <MenuItem key={s} value={s}>
                    <Checkbox checked={inputFilters.symbols.indexOf(s) > -1} />
                    <ListItemText primary={s} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          {/* DATE RANGE - Row 1, column 5 */}
          <Box
            sx={{
              border: '1px solid',
              borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
              borderRadius: 1,
              p: 0.5,
              height: { xs: 'auto', sm: 40 },
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              alignItems: { xs: 'stretch', sm: 'center' },
              gap: 0.5,
              minWidth: 0,
              bgcolor: isDarkMode ? 'rgba(255,255,255,0.02)' : '#ffffff',
              transition: 'border-color 0.2s',
              '&:hover': {
                borderColor: 'primary.main'
              }
            }}
          >
            <DatePicker
              label="From"
              value={dateRange.startDate}
              onChange={(newValue) => handleDateRangeChange('startDate', newValue)}
              minDate={null}
              maxDate={null}
              format="DD/MM/YYYY"
              localeText={{
                fieldDayPlaceholder: () => 'dd',
                fieldMonthPlaceholder: () => 'MM',
                fieldYearPlaceholder: () => 'yyyy'
              }}
              slotProps={{
                textField: {
                  size: 'small',
                  fullWidth: true,
                  InputLabelProps: {
                    shrink: true,
                    sx: { 
                      fontSize: '11px',
                      '&.MuiInputLabel-root': {
                        color: isDarkMode ? '#f8fafc' : 'text.secondary'
                      },
                      '&.MuiInputLabel-outlined.MuiInputLabel-shrink': {
                        background: isDarkMode ? 'background.paper' : '#fafafb',
                        color: isDarkMode ? '#f8fafc' : 'text.secondary'
                      },
                      '&.MuiFormLabel-root': {
                        color: isDarkMode ? '#f8fafc' : 'text.secondary'
                      },
                      '&.Mui-focused': { color: 'primary.main' }
                    }
                  },
                  sx: dateTextFieldSx
                },
                openPickerButton: { size: 'small', sx: { p: 0.5 } }
              }}
            />
            <Box sx={{ width: { xs: '100%', sm: '1px' }, height: { xs: '1px', sm: 24 }, bgcolor: 'divider', flexShrink: 0, my: { xs: 0.5, sm: 0 } }} />
            <DatePicker
              label="To"
              value={dateRange.endDate}
              onChange={(newValue) => handleDateRangeChange('endDate', newValue)}
              minDate={dateRange.startDate || null}
              maxDate={null}
              format="DD/MM/YYYY"
              localeText={{
                fieldDayPlaceholder: () => 'dd',
                fieldMonthPlaceholder: () => 'MM',
                fieldYearPlaceholder: () => 'yyyy'
              }}
              slotProps={{
                textField: {
                  size: 'small',
                  fullWidth: true,
                  InputLabelProps: {
                    shrink: true,
                    sx: { 
                      fontSize: '11px',
                      '&.MuiInputLabel-root': {
                        color: isDarkMode ? '#f8fafc' : 'text.secondary'
                      },
                      '&.MuiInputLabel-outlined.MuiInputLabel-shrink': {
                        background: isDarkMode ? 'background.paper' : '#fafafb',
                        color: isDarkMode ? '#f8fafc' : 'text.secondary'
                      },
                      '&.MuiFormLabel-root': {
                        color: isDarkMode ? '#f8fafc' : 'text.secondary'
                      },
                      '&.Mui-focused': { color: 'primary.main' }
                    }
                  },
                  sx: dateTextFieldSx
                },
                openPickerButton: { size: 'small', sx: { p: 0.5 } }
              }}
            />
          </Box>
        </Box>

        {/* Row 2+: Timeframe, Type + dynamic filters, max 5 per row */}
        <Box sx={optionalFilterGridSx}>
          <Box>
            <FormControl fullWidth>
              <InputLabel>Timeframe</InputLabel>
              <Select
                value={inputFilters.timeframe}
                onChange={(e) => handleFilterChange('timeframe', e.target.value)}
                label="Timeframe"
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="H1">H1</MenuItem>
                <MenuItem value="H4">H4</MenuItem>
              </Select>
            </FormControl>
          </Box>

          <Box>
            <FormControl fullWidth>
              <InputLabel>Type</InputLabel>
              <Select value={inputFilters.type} onChange={(e) => handleFilterChange('type', e.target.value)} label="Type">
                <MenuItem value="">All</MenuItem>
                <MenuItem value="buy">Buy</MenuItem>
                <MenuItem value="sell">Sell</MenuItem>
              </Select>
            </FormControl>
          </Box>
          {activeFilters.includes('pd') && (
            <Box
              sx={{
                position: 'relative',
                '&:hover .remove-filter-btn': { opacity: 1 }
              }}
            >
              <TextField
                fullWidth
                label={opLabel('P/D', 'pd')}
                type={isRange('pd') ? 'text' : 'number'}
                placeholder={isRange('pd') ? '' : '0.00'}
                value={isRange('pd') ? rangeDisplay('pd') : inputFilters.pd}
                onChange={isRange('pd') ? undefined : (e) => handleFilterChange('pd', e.target.value)}
                onKeyDown={isRange('pd') ? undefined : handleKeyDown}
                inputProps={{ step: '0.01', readOnly: isRange('pd') }}
              />
              <IconButton
                className="remove-filter-btn"
                size="small"
                onClick={() => handleRemoveFilter('pd')}
                sx={removeFilterBtnSx}
              >
                <CloseOutlined style={{ fontSize: '10px' }} />
              </IconButton>
            </Box>
          )}

          {activeFilters.includes('totalNetProfit') && (
            <Box
              sx={{
                position: 'relative',
                '&:hover .remove-filter-btn': { opacity: 1 }
              }}
            >
              <TextField
                fullWidth
                label={opLabel('Total Net Profit', 'totalNetProfit')}
                type="text"
                placeholder={isRange('totalNetProfit') ? '' : '0.00'}
                value={isRange('totalNetProfit') ? rangeDisplay('totalNetProfit') : formatNumberVN(inputFilters.totalNetProfit)}
                onChange={
                  isRange('totalNetProfit') ? undefined : (e) => handleFilterChange('totalNetProfit', parseNumberVN(e.target.value))
                }
                onKeyDown={isRange('totalNetProfit') ? undefined : handleKeyDown}
                inputProps={{ step: '0.01', readOnly: isRange('totalNetProfit') }}
              />
              <IconButton
                className="remove-filter-btn"
                size="small"
                onClick={() => handleRemoveFilter('totalNetProfit')}
                sx={removeFilterBtnSx}
              >
                <CloseOutlined style={{ fontSize: '10px' }} />
              </IconButton>
            </Box>
          )}

          {activeFilters.includes('totalTrades') && (
            <Box
              sx={{
                position: 'relative',
                '&:hover .remove-filter-btn': { opacity: 1 }
              }}
            >
              <TextField
                fullWidth
                label={opLabel('Total Trades', 'totalTrades')}
                type={isRange('totalTrades') ? 'text' : 'number'}
                placeholder={isRange('totalTrades') ? '' : '0'}
                value={isRange('totalTrades') ? rangeDisplay('totalTrades') : inputFilters.totalTrades}
                onChange={isRange('totalTrades') ? undefined : (e) => handleFilterChange('totalTrades', e.target.value)}
                onKeyDown={isRange('totalTrades') ? undefined : handleKeyDown}
                inputProps={{ step: '1', readOnly: isRange('totalTrades') }}
              />
              <IconButton
                className="remove-filter-btn"
                size="small"
                onClick={() => handleRemoveFilter('totalTrades')}
                sx={removeFilterBtnSx}
              >
                <CloseOutlined style={{ fontSize: '10px' }} />
              </IconButton>
            </Box>
          )}

          {activeFilters.includes('winrate') && (
            <Box
              sx={{
                position: 'relative',
                '&:hover .remove-filter-btn': { opacity: 1 }
              }}
            >
              <TextField
                fullWidth
                label={opLabel('Winrate %', 'winrate')}
                type={isRange('winrate') ? 'text' : 'number'}
                placeholder={isRange('winrate') ? '' : '0.00'}
                value={isRange('winrate') ? rangeDisplay('winrate') : inputFilters.winrate}
                onChange={isRange('winrate') ? undefined : (e) => handleFilterChange('winrate', e.target.value)}
                onKeyDown={isRange('winrate') ? undefined : handleKeyDown}
                inputProps={{ step: '0.1', min: '0', max: '100', readOnly: isRange('winrate') }}
              />
              <IconButton
                className="remove-filter-btn"
                size="small"
                onClick={() => handleRemoveFilter('winrate')}
                sx={removeFilterBtnSx}
              >
                <CloseOutlined style={{ fontSize: '10px' }} />
              </IconButton>
            </Box>
          )}

          {activeFilters.includes('largestProfitTradeRatio') && (
            <Box
              sx={{
                position: 'relative',
                '&:hover .remove-filter-btn': { opacity: 1 }
              }}
            >
              <TextField
                fullWidth
                label={opLabel('Largest Profit Trade Ratio', 'largestProfitTradeRatio')}
                type={isRange('largestProfitTradeRatio') ? 'text' : 'number'}
                placeholder={isRange('largestProfitTradeRatio') ? '' : '0.00'}
                value={
                  isRange('largestProfitTradeRatio') ? rangeDisplay('largestProfitTradeRatio') : inputFilters.largestProfitTradeRatio
                }
                onChange={
                  isRange('largestProfitTradeRatio') ? undefined : (e) => handleFilterChange('largestProfitTradeRatio', e.target.value)
                }
                onKeyDown={isRange('largestProfitTradeRatio') ? undefined : handleKeyDown}
                inputProps={{ step: '0.01', readOnly: isRange('largestProfitTradeRatio') }}
              />
              <IconButton
                className="remove-filter-btn"
                size="small"
                onClick={() => handleRemoveFilter('largestProfitTradeRatio')}
                sx={removeFilterBtnSx}
              >
                <CloseOutlined style={{ fontSize: '10px' }} />
              </IconButton>
            </Box>
          )}

          {activeFilters.includes('riskRewardRatio') && (
            <Box
              sx={{
                position: 'relative',
                '&:hover .remove-filter-btn': { opacity: 1 }
              }}
            >
              <TextField
                fullWidth
                label={opLabel('Risk-Reward Ratio', 'riskRewardRatio')}
                type={isRange('riskRewardRatio') ? 'text' : 'number'}
                placeholder={isRange('riskRewardRatio') ? '' : '0.00'}
                value={isRange('riskRewardRatio') ? rangeDisplay('riskRewardRatio') : inputFilters.riskRewardRatio}
                onChange={isRange('riskRewardRatio') ? undefined : (e) => handleFilterChange('riskRewardRatio', e.target.value)}
                onKeyDown={isRange('riskRewardRatio') ? undefined : handleKeyDown}
                inputProps={{ step: '0.01', readOnly: isRange('riskRewardRatio') }}
              />
              <IconButton
                className="remove-filter-btn"
                size="small"
                onClick={() => handleRemoveFilter('riskRewardRatio')}
                sx={removeFilterBtnSx}
              >
                <CloseOutlined style={{ fontSize: '10px' }} />
              </IconButton>
            </Box>
          )}

          {activeFilters.includes('drawdown') && (
            <Box
              sx={{
                position: 'relative',
                '&:hover .remove-filter-btn': { opacity: 1 }
              }}
            >
              <TextField
                fullWidth
                label={opLabel(drawdownUnit === 'absolute' ? 'Drawdown (Value)' : 'Drawdown %', 'drawdown')}
                type={isRange('drawdown') ? 'text' : 'number'}
                placeholder={isRange('drawdown') ? '' : '0.00'}
                value={isRange('drawdown') ? rangeDisplay('drawdown') : inputFilters.drawdown}
                onChange={isRange('drawdown') ? undefined : (e) => handleFilterChange('drawdown', e.target.value)}
                onKeyDown={isRange('drawdown') ? undefined : handleKeyDown}
                inputProps={{ step: '0.1', min: '0', max: '100', readOnly: isRange('drawdown') }}
              />
              <IconButton
                className="remove-filter-btn"
                size="small"
                onClick={() => handleRemoveFilter('drawdown')}
                sx={removeFilterBtnSx}
              >
                <CloseOutlined style={{ fontSize: '10px' }} />
              </IconButton>
            </Box>
          )}

          {activeFilters.includes('largestLossTrade') && (
            <Box
              sx={{
                position: 'relative',
                '&:hover .remove-filter-btn': { opacity: 1 }
              }}
            >
              <TextField
                fullWidth
                label={opLabel('Largest Loss Trade', 'largestLossTrade')}
                type={isRange('largestLossTrade') ? 'text' : 'number'}
                placeholder={isRange('largestLossTrade') ? '' : '0.00'}
                value={isRange('largestLossTrade') ? rangeDisplay('largestLossTrade') : inputFilters.largestLossTrade}
                onChange={isRange('largestLossTrade') ? undefined : (e) => handleFilterChange('largestLossTrade', e.target.value)}
                onKeyDown={isRange('largestLossTrade') ? undefined : handleKeyDown}
                inputProps={{ step: '0.01', readOnly: isRange('largestLossTrade') }}
              />
              <IconButton
                className="remove-filter-btn"
                size="small"
                onClick={() => handleRemoveFilter('largestLossTrade')}
                sx={removeFilterBtnSx}
              >
                <CloseOutlined style={{ fontSize: '10px' }} />
              </IconButton>
            </Box>
          )}

          {activeFilters.includes('profitFactor') && (
            <Box
              sx={{
                position: 'relative',
                '&:hover .remove-filter-btn': { opacity: 1 }
              }}
            >
              <TextField
                fullWidth
                label={opLabel('Profit Factor', 'profitFactor')}
                type={isRange('profitFactor') ? 'text' : 'number'}
                placeholder={isRange('profitFactor') ? '' : '0.00'}
                value={isRange('profitFactor') ? rangeDisplay('profitFactor') : inputFilters.profitFactor}
                onChange={isRange('profitFactor') ? undefined : (e) => handleFilterChange('profitFactor', e.target.value)}
                onKeyDown={isRange('profitFactor') ? undefined : handleKeyDown}
                inputProps={{ step: '0.01', readOnly: isRange('profitFactor') }}
              />
              <IconButton
                className="remove-filter-btn"
                size="small"
                onClick={() => handleRemoveFilter('profitFactor')}
                sx={removeFilterBtnSx}
              >
                <CloseOutlined style={{ fontSize: '10px' }} />
              </IconButton>
            </Box>
          )}

          {activeFilters.includes('sharpeRatio') && (
            <Box
              sx={{
                position: 'relative',
                '&:hover .remove-filter-btn': { opacity: 1 }
              }}
            >
              <TextField
                fullWidth
                label={opLabel('Sharpe Ratio', 'sharpeRatio')}
                type={isRange('sharpeRatio') ? 'text' : 'number'}
                placeholder={isRange('sharpeRatio') ? '' : '0.00'}
                value={isRange('sharpeRatio') ? rangeDisplay('sharpeRatio') : inputFilters.sharpeRatio}
                onChange={isRange('sharpeRatio') ? undefined : (e) => handleFilterChange('sharpeRatio', e.target.value)}
                onKeyDown={isRange('sharpeRatio') ? undefined : handleKeyDown}
                inputProps={{ step: '0.01', readOnly: isRange('sharpeRatio') }}
              />
              <IconButton
                className="remove-filter-btn"
                size="small"
                onClick={() => handleRemoveFilter('sharpeRatio')}
                sx={removeFilterBtnSx}
              >
                <CloseOutlined style={{ fontSize: '10px' }} />
              </IconButton>
            </Box>
          )}

          {activeFilters.includes('recoveryFactor') && (
            <Box
              sx={{
                position: 'relative',
                '&:hover .remove-filter-btn': { opacity: 1 }
              }}
            >
              <TextField
                fullWidth
                label={opLabel('Recovery Factor', 'recoveryFactor')}
                type={isRange('recoveryFactor') ? 'text' : 'number'}
                placeholder={isRange('recoveryFactor') ? '' : '0.00'}
                value={isRange('recoveryFactor') ? rangeDisplay('recoveryFactor') : inputFilters.recoveryFactor}
                onChange={isRange('recoveryFactor') ? undefined : (e) => handleFilterChange('recoveryFactor', e.target.value)}
                onKeyDown={isRange('recoveryFactor') ? undefined : handleKeyDown}
                inputProps={{ step: '0.01', readOnly: isRange('recoveryFactor') }}
              />
              <IconButton
                className="remove-filter-btn"
                size="small"
                onClick={() => handleRemoveFilter('recoveryFactor')}
                sx={removeFilterBtnSx}
              >
                <CloseOutlined style={{ fontSize: '10px' }} />
              </IconButton>
            </Box>
          )}

          {activeFilters.includes('lrCorrelation') && (
            <Box
              sx={{
                position: 'relative',
                '&:hover .remove-filter-btn': { opacity: 1 }
              }}
            >
              <TextField
                fullWidth
                label={opLabel('LR Correlation', 'lrCorrelation')}
                type={isRange('lrCorrelation') ? 'text' : 'number'}
                placeholder={isRange('lrCorrelation') ? '' : '0.00'}
                value={isRange('lrCorrelation') ? rangeDisplay('lrCorrelation') : inputFilters.lrCorrelation}
                onChange={isRange('lrCorrelation') ? undefined : (e) => handleFilterChange('lrCorrelation', e.target.value)}
                onKeyDown={isRange('lrCorrelation') ? undefined : handleKeyDown}
                inputProps={{ step: '0.01', min: '-1', max: '1', readOnly: isRange('lrCorrelation') }}
              />
              <IconButton
                className="remove-filter-btn"
                size="small"
                onClick={() => handleRemoveFilter('lrCorrelation')}
                sx={removeFilterBtnSx}
              >
                <CloseOutlined style={{ fontSize: '10px' }} />
              </IconButton>
            </Box>
          )}
        </Box>

        {/* Action Buttons */}
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            startIcon={<ReloadOutlined />}
            onClick={handleReset}
            disabled={loading}
            sx={actionButtonHalfSx}
          >
            Reset
          </Button>
          <Button variant="outlined" startIcon={<SettingOutlined />} onClick={handleMoreOptionsClick} sx={actionButtonHalfSx}>
            More Options
          </Button>
          <Button
            variant="contained"
            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <SearchOutlined />}
            onClick={() => handleSearch(searchDraft)}
            disabled={loading || applyButtonDisabled}
            sx={actionButtonThirdSx}
          >
            {loading ? 'Loading...' : applyButtonDisabled ? 'Wait...' : 'Apply'}
          </Button>
          <Button
            variant="outlined"
            startIcon={<RobotOutlined />}
            onClick={() => {
              const total = pagination.total || data.length;
              
              // Build filter summary
              const filterSummary = Object.entries(appliedFilters)
                .filter(([k, v]) => v && v !== '' && v !== 'all_backtests' && !(Array.isArray(v) && v.length === 0))
                .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(',') : v}`)
                .join(', ');
              
              // Build date range info
              let dateRangeInfo = '';
              if (appliedDateRange.startDate && appliedDateRange.endDate) {
                const startStr = appliedDateRange.startDate.format('DD/MM/YYYY');
                const endStr = appliedDateRange.endDate.format('DD/MM/YYYY');
                dateRangeInfo = ` trong khoảng thời gian ${startStr} - ${endStr}`;
              }
              
              const msg = `Tôi đang xem ${total} strategies trên trang Strategy Input${dateRangeInfo}${filterSummary ? ` với filters: ${filterSummary}` : ''}. Hãy phân tích và đánh giá chất lượng dữ liệu này cho tôi.`;
              window.dispatchEvent(new CustomEvent('chatbot:prompt', { detail: { message: msg } }));
            }}
            disabled={loading || data.length === 0}
            sx={{
              ...actionButtonThirdSx,
              borderColor: 'primary.main',
              color: 'primary.main',
              '&:hover': { bgcolor: 'primary.lighter', borderColor: 'primary.main' }
            }}
          >
            Hỏi AI
          </Button>
          <Tooltip title="Lưu ý quan trọng">
            <IconButton
              color="info"
              onClick={() => setInfoDialogOpen(true)}
              sx={{
                ...actionButtonThirdSx,
                border: '1px solid',
                borderColor: 'info.main',
                borderRadius: 1,
                height: 40,
                '&:hover': {
                  bgcolor: 'info.lighter'
                }
              }}
            >
              <InfoCircleOutlined />
            </IconButton>
          </Tooltip>
        </Box>
      </MainCard>
    </Grid>
  );
}
