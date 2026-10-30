import React, { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Checkbox from '@mui/material/Checkbox';
import ListItemText from '@mui/material/ListItemText';
import { useTheme } from '@mui/material/styles';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';

import { getBacktestTables } from 'api/order';
import {
  setStoredDashboardTable,
  setStoredDashboardSources,
  getStoredDashboardSources,
  getStoredDashboardDateRange,
  setStoredDashboardDateRange
} from 'utils/dashboardTable';

export default function DashboardFilterBar({ title, subtitle, showSelectedSourcesLabel = false }) {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  const [selectedSources, setSelectedSources] = useState([]);
  const [backtestTables, setBacktestTables] = useState([]);
  const [loadingTables, setLoadingTables] = useState(true);

  // Local state for Pickers (requires dayjs objects)
  const [dateRange, setDateRange] = useState(() => {
    const stored = getStoredDashboardDateRange();
    return {
      startDate: stored.startDate ? dayjs(stored.startDate) : null,
      endDate: stored.endDate ? dayjs(stored.endDate) : null
    };
  });

  // Fetch backtest tables list
  const fetchTablesList = async () => {
    try {
      setLoadingTables(true);
      const response = await getBacktestTables();
      const tables = Array.isArray(response.tables) ? response.tables : [];
      setBacktestTables(tables);

      const storedSources = getStoredDashboardSources([]);
      const validSources = storedSources.filter((source) => tables.includes(source));
      const nextSources = validSources.length > 0
        ? validSources
        : (tables.length > 0 ? [tables[0]] : []);
      setStoredDashboardSources(nextSources);
      setStoredDashboardTable(nextSources.length === 1 ? nextSources[0] : 'all_backtests');

      setSelectedSources(nextSources);
      window.dispatchEvent(new CustomEvent('dashboard:sources-updated', { detail: { sources: nextSources } }));
    } catch (err) {
      console.error('Failed to fetch backtest tables for filter bar:', err);
      setBacktestTables([]);
    } finally {
      setLoadingTables(false);
    }
  };

  useEffect(() => {
    fetchTablesList();

    const handleDataChanged = () => {
      fetchTablesList();
    };
    window.addEventListener('dashboard:data-changed', handleDataChanged);
    return () => window.removeEventListener('dashboard:data-changed', handleDataChanged);
  }, []);

  // Listen to global changes of selectedTable/dateRange from other pages
  useEffect(() => {
    const handleFiltersUpdated = () => {
      const stored = getStoredDashboardDateRange();
      setDateRange({
        startDate: stored.startDate ? dayjs(stored.startDate) : null,
        endDate: stored.endDate ? dayjs(stored.endDate) : null
      });
      setSelectedSources(getStoredDashboardSources([]));
    };
    window.addEventListener('dashboard:filters-updated', handleFiltersUpdated);
    return () => window.removeEventListener('dashboard:filters-updated', handleFiltersUpdated);
  }, []);

  const handleSourcesChange = (event) => {
    const {
      target: { value }
    } = event;

    let updated = [];
    if (value.includes('all_select')) {
      if (selectedSources.length === backtestTables.length) {
        updated = [];
      } else {
        updated = [...backtestTables];
      }
    } else {
      updated = typeof value === 'string' ? value.split(',') : value;
    }

    setSelectedSources(updated);
    setStoredDashboardSources(updated);

    if (updated.length === 1) {
      setStoredDashboardTable(updated[0]);
    } else if (updated.length > 1) {
    setStoredDashboardTable('all_backtests');
    } else {
      setStoredDashboardTable('');
    }

    window.dispatchEvent(new CustomEvent('dashboard:sources-updated', { detail: { sources: updated } }));
    window.dispatchEvent(new Event('dashboard:filters-updated'));
  };

  const handleApplyDateFilter = () => {
    if (dateRange.startDate && dateRange.endDate && !dateRangeError) {
      setStoredDashboardDateRange(
        dayjs(dateRange.startDate).format('YYYY-MM-DD'),
        dayjs(dateRange.endDate).format('YYYY-MM-DD')
      );
      window.dispatchEvent(new Event('dashboard:filters-updated'));
    }
  };

  const handleResetDateFilter = () => {
    setDateRange({
      startDate: null,
      endDate: null
    });
    setStoredDashboardDateRange(null, null);
    const firstTable = backtestTables[0] || '';
    setSelectedSources(firstTable ? [firstTable] : []);
    setStoredDashboardSources(firstTable ? [firstTable] : []);
    setStoredDashboardTable(firstTable);
    window.dispatchEvent(new CustomEvent('dashboard:sources-updated', { detail: { sources: firstTable ? [firstTable] : [] } }));
    window.dispatchEvent(new Event('dashboard:filters-updated'));
  };

  const hasDateFilter = Boolean(dateRange.startDate && dateRange.endDate);
  const dateRangeError = Boolean(
    dateRange.startDate
    && dateRange.endDate
    && dayjs(dateRange.startDate).isAfter(dayjs(dateRange.endDate), 'day')
  );
  const selectedSourceTitle = selectedSources.length > 0
    ? selectedSources.join(' + ')
    : 'No source selected';

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box
        sx={{
          position: { xs: 'static', sm: 'sticky' },
          top: { xs: 'auto', sm: '60px' },
          zIndex: 1100,
          bgcolor: isDarkMode ? 'rgba(17, 24, 39, 0.95)' : 'rgba(250, 250, 251, 0.95)',
          backdropFilter: 'blur(8px)',
          mx: { xs: -2, sm: -5 },
          px: { xs: 2, sm: 5 },
          pt: { xs: 2, sm: 2.5 },
          pb: { xs: 1.5, sm: 2 },
          mb: 2.5,
          borderBottom: '1px solid',
          borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
          transform: 'translate3d(0, 0, 0)'
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, gap: 2, width: '100%' }}>
          <Typography variant="h4" sx={{ fontWeight: 600, color: 'text.primary' }}>
            {title}
            {subtitle && (
              <Typography component="span" variant="subtitle1" sx={{ color: 'text.secondary', fontWeight: 500, ml: 1 }}>
                {subtitle}
              </Typography>
            )}
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, flexWrap: 'wrap', gap: { xs: 1.5, sm: 1 }, width: { xs: '100%', sm: 'auto' }, alignItems: { xs: 'stretch', sm: 'center' } }}>
            {/* MULTI-SELECT DATA SOURCES */}
            {showSelectedSourcesLabel && (
              <Typography
                variant="caption"
                title={selectedSourceTitle}
                sx={{
                  maxWidth: { xs: '100%', sm: 420 },
                  overflow: 'visible',
                  whiteSpace: 'normal',
                  overflowWrap: 'anywhere',
                  lineHeight: 1.35,
                  fontWeight: 700,
                  color: isDarkMode ? '#e2e8f0' : '#334155'
                }}
              >
                {selectedSourceTitle}
              </Typography>
            )}
            <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 220 }, width: { xs: '100%', sm: 'auto' } }}>
              <InputLabel 
                shrink
                id="data-source-select-label"
                sx={{ 
                  fontSize: '13px',
                  '&.MuiInputLabel-root': {
                    color: isDarkMode ? '#f8fafc' : 'text.secondary'
                  },
                  '&.MuiInputLabel-outlined.MuiInputLabel-shrink': {
                    background: isDarkMode ? '#111827' : '#fafafb',
                    color: isDarkMode ? '#f8fafc' : 'text.secondary'
                  },
                  '&.MuiFormLabel-root': {
                    color: isDarkMode ? '#f8fafc' : 'text.secondary'
                  },
                  '&.Mui-focused': { color: 'primary.main' }
                }}
              >
                Data Source
              </InputLabel>
              <Select
                labelId="data-source-select-label"
                notched
                multiple
                value={selectedSources}
                label="Data Source"
                onChange={handleSourcesChange}
                disabled={loadingTables}
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
              >
                <MenuItem value="all_select" sx={{ fontSize: '13px', fontWeight: 600 }}>
                  <Checkbox checked={selectedSources.length === backtestTables.length && backtestTables.length > 0} indeterminate={selectedSources.length > 0 && selectedSources.length < backtestTables.length} size="small" />
                  <ListItemText primary="Select All" primaryTypographyProps={{ fontSize: '13px', fontWeight: 600 }} />
                </MenuItem>
                {backtestTables.map((table) => (
                  <MenuItem key={table} value={table} sx={{ fontSize: '13px', fontWeight: 500 }}>
                    <Checkbox checked={selectedSources.indexOf(table) > -1} size="small" />
                    <ListItemText primary={table} primaryTypographyProps={{ fontSize: '13px' }} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* DATE RANGE PICKER */}
            <Box sx={{ display: 'flex', flexDirection: 'column', width: { xs: '100%', sm: 'auto' } }}>
            <Box
              sx={{
                border: '1px solid',
                borderColor: dateRangeError ? 'error.main' : (isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'),
                borderRadius: 1.25,
                p: 0.5,
                height: { xs: 'auto', sm: '40px' },
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'row' },
                alignItems: { xs: 'stretch', sm: 'center' },
                gap: 0.5,
                bgcolor: isDarkMode ? 'rgba(255,255,255,0.02)' : '#ffffff',
                transition: 'border-color 0.2s',
                '&:hover': {
                  borderColor: 'primary.main'
                },
                width: { xs: '100%', sm: 'auto' }
              }}
            >
              <DatePicker
                label="From"
                value={dateRange.startDate}
                onChange={(newValue) => setDateRange((prev) => ({ ...prev, startDate: newValue }))}
                minDate={dayjs('2016-01-01')}
                maxDate={dayjs()}
                format="DD/MM/YYYY"
                localeText={{
                  fieldDayPlaceholder: () => 'dd',
                  fieldMonthPlaceholder: () => 'MM',
                  fieldYearPlaceholder: () => 'yyyy'
                }}
                slotProps={{
                  textField: {
                    size: 'small',
                    InputLabelProps: {
                      shrink: true,
                      sx: { 
                        fontSize: '11px',
                        '&.MuiInputLabel-root': {
                          color: isDarkMode ? '#f8fafc' : 'text.secondary'
                        },
                        '&.MuiInputLabel-outlined.MuiInputLabel-shrink': {
                          background: isDarkMode ? '#111827' : '#fafafb',
                          color: isDarkMode ? '#f8fafc' : 'text.secondary'
                        },
                        '&.MuiFormLabel-root': {
                          color: isDarkMode ? '#f8fafc' : 'text.secondary'
                        },
                        '&.Mui-focused': { color: 'primary.main' }
                      }
                    },
                    sx: {
                      width: { xs: '100%', sm: '150px' },
                      '& .MuiOutlinedInput-root': {
                        '& fieldset': { border: 'none' },
                        '&:hover fieldset': { border: 'none' },
                        '&.Mui-focused fieldset': { border: 'none' }
                      },
                      '& .MuiInputBase-input': {
                        fontSize: '13px',
                        padding: '4px 8px',
                        cursor: 'pointer',
                        color: isDarkMode ? '#f1f5f9' : 'text.primary'
                      }
                    }
                  },
                  openPickerButton: {
                    size: 'small',
                    sx: { p: 0.5 }
                  }
                }}
              />

              <Box sx={{ width: { xs: '100%', sm: '1px' }, height: { xs: '1px', sm: '24px' }, bgcolor: 'divider', my: { xs: 0.5, sm: 0 } }} />

              <DatePicker
                label="To"
                value={dateRange.endDate}
                onChange={(newValue) => setDateRange((prev) => ({ ...prev, endDate: newValue }))}
                minDate={dateRange.startDate || dayjs('2016-01-01')}
                maxDate={dayjs()}
                format="DD/MM/YYYY"
                localeText={{
                  fieldDayPlaceholder: () => 'dd',
                  fieldMonthPlaceholder: () => 'MM',
                  fieldYearPlaceholder: () => 'yyyy'
                }}
                slotProps={{
                  textField: {
                    size: 'small',
                    InputLabelProps: {
                      shrink: true,
                      sx: { 
                        fontSize: '11px',
                        '&.MuiInputLabel-root': {
                          color: isDarkMode ? '#f8fafc' : 'text.secondary'
                        },
                        '&.MuiInputLabel-outlined.MuiInputLabel-shrink': {
                          background: isDarkMode ? '#111827' : '#fafafb',
                          color: isDarkMode ? '#f8fafc' : 'text.secondary'
                        },
                        '&.MuiFormLabel-root': {
                          color: isDarkMode ? '#f8fafc' : 'text.secondary'
                        },
                        '&.Mui-focused': { color: 'primary.main' }
                      }
                    },
                    sx: {
                      width: { xs: '100%', sm: '150px' },
                      '& .MuiOutlinedInput-root': {
                        '& fieldset': { border: 'none' },
                        '&:hover fieldset': { border: 'none' },
                        '&.Mui-focused fieldset': { border: 'none' }
                      },
                      '& .MuiInputBase-input': {
                        fontSize: '13px',
                        padding: '4px 8px',
                        cursor: 'pointer',
                        color: isDarkMode ? '#f1f5f9' : 'text.primary'
                      }
                    }
                  },
                  openPickerButton: {
                    size: 'small',
                    sx: { p: 0.5 }
                  }
                }}
              />

              <Button
                variant="contained"
                size="small"
                onClick={handleApplyDateFilter}
                disabled={!dateRange.startDate || !dateRange.endDate || dateRangeError}
                sx={{
                  height: '32px',
                  px: 1.5,
                  minWidth: 'auto',
                  fontSize: '12px',
                  fontWeight: 600,
                  textTransform: 'none',
                  borderRadius: 1,
                  boxShadow: 'none',
                  '&:hover': {
                    boxShadow: 'none'
                  }
                }}
              >
                Apply
              </Button>

              {hasDateFilter && (
                <Button
                  variant="outlined"
                  size="small"
                  color="secondary"
                  onClick={handleResetDateFilter}
                  sx={{
                    height: '32px',
                    px: 1.5,
                    minWidth: 'auto',
                    fontSize: '12px',
                    fontWeight: 600,
                    textTransform: 'none',
                    borderRadius: 1,
                    borderColor: isDarkMode ? 'rgba(255,255,255,0.2)' : 'divider',
                    color: isDarkMode ? '#94a3b8' : 'text.secondary',
                    '&:hover': {
                      borderColor: isDarkMode ? 'rgba(255,255,255,0.4)' : 'text.primary',
                      bgcolor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'
                    }
                  }}
                >
                  Reset
                </Button>
              )}
            </Box>
            {dateRangeError && (
              <Typography variant="caption" color="error" sx={{ mt: 0.5, px: 0.5 }}>
                Ngày bắt đầu không được sau ngày kết thúc.
              </Typography>
            )}
            </Box>
          </Box>
        </Box>
      </Box>
    </LocalizationProvider>
  );
}
