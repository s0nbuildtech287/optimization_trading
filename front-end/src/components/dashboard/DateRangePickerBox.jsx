import React from 'react';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';

export default function DateRangePickerBox({
  startDate,
  endDate,
  onChange,
  disabled = false,
  minDate = dayjs('2016-01-01'),
  maxDate = dayjs(),
  sx = {}
}) {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  const startValue = startDate ? (dayjs.isDayjs(startDate) ? startDate : dayjs(startDate)) : null;
  const endValue = endDate ? (dayjs.isDayjs(endDate) ? endDate : dayjs(endDate)) : null;

  const handleStartChange = (newValue) => {
    if (!onChange) return;
    const valid = newValue && newValue.isValid();
    const str = valid ? newValue.format('YYYY-MM-DD') : '';
    onChange({
      startDate: valid ? newValue : null,
      endDate: endValue,
      startDateStr: str,
      endDateStr: endDate ? (dayjs.isDayjs(endDate) ? endDate.format('YYYY-MM-DD') : String(endDate)) : ''
    });
  };

  const handleEndChange = (newValue) => {
    if (!onChange) return;
    const valid = newValue && newValue.isValid();
    const str = valid ? newValue.format('YYYY-MM-DD') : '';
    onChange({
      startDate: startValue,
      endDate: valid ? newValue : null,
      startDateStr: startDate ? (dayjs.isDayjs(startDate) ? startDate.format('YYYY-MM-DD') : String(startDate)) : '',
      endDateStr: str
    });
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box
        sx={{
          borderRadius: 1.25,
          p: 0.5,
          height: { xs: 'auto', sm: '40px' },
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'stretch', sm: 'center' },
          gap: 0.5,
          bgcolor: isDarkMode ? 'rgba(255,255,255,0.02)' : 'transparent',
          opacity: disabled ? 0.85 : 1,
          pointerEvents: disabled ? 'none' : 'auto',
          userSelect: disabled ? 'none' : 'auto',
          width: { xs: '100%', sm: 'auto' },
          ...sx
        }}
      >
        <DatePicker
          label="From"
          readOnly={disabled}
          value={startValue}
          onChange={handleStartChange}
          minDate={minDate}
          maxDate={endValue || maxDate}
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
                    color: isDarkMode ? '#cbd5e1' : 'text.secondary'
                  },
                  '&.MuiInputLabel-outlined.MuiInputLabel-shrink': {
                    background: 'transparent',
                    color: isDarkMode ? '#cbd5e1' : 'text.secondary'
                  },
                  '&.MuiFormLabel-root': {
                    color: isDarkMode ? '#cbd5e1' : 'text.secondary'
                  },
                  '&.Mui-focused': { color: 'primary.main' }
                }
              },
              sx: {
                width: { xs: '100%', sm: '145px' },
                '& .MuiOutlinedInput-notchedOutline': { border: 'none !important' },
                '& .MuiOutlinedInput-root': {
                  '& fieldset': { border: 'none !important' },
                  '&:hover fieldset': { border: 'none !important' },
                  '&.Mui-focused fieldset': { border: 'none !important' },
                  '& .MuiOutlinedInput-notchedOutline': { border: 'none !important' }
                },
                '& .MuiInputBase-input': {
                  fontSize: '13px',
                  padding: '4px 8px',
                  cursor: disabled ? 'default' : 'pointer',
                  color: isDarkMode ? '#ffffff !important' : 'text.primary !important',
                  WebkitTextFillColor: isDarkMode ? '#ffffff !important' : 'text.primary !important'
                },
                '& .MuiSvgIcon-root': {
                  color: isDarkMode ? '#ffffff !important' : 'inherit'
                }
              }
            },
            openPickerButton: {
              size: 'small',
              disabled: disabled,
              sx: {
                p: 0.5,
                color: isDarkMode ? '#ffffff !important' : 'inherit'
              }
            }
          }}
        />

        <Box sx={{ width: { xs: '100%', sm: '1px' }, height: { xs: '1px', sm: '24px' }, bgcolor: 'divider', my: { xs: 0.5, sm: 0 } }} />

        <DatePicker
          label="To"
          readOnly={disabled}
          value={endValue}
          onChange={handleEndChange}
          minDate={startValue || minDate}
          maxDate={maxDate}
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
                    color: isDarkMode ? '#cbd5e1' : 'text.secondary'
                  },
                  '&.MuiInputLabel-outlined.MuiInputLabel-shrink': {
                    background: 'transparent',
                    color: isDarkMode ? '#cbd5e1' : 'text.secondary'
                  },
                  '&.MuiFormLabel-root': {
                    color: isDarkMode ? '#cbd5e1' : 'text.secondary'
                  },
                  '&.Mui-focused': { color: 'primary.main' }
                }
              },
              sx: {
                width: { xs: '100%', sm: '145px' },
                '& .MuiOutlinedInput-notchedOutline': { border: 'none !important' },
                '& .MuiOutlinedInput-root': {
                  '& fieldset': { border: 'none !important' },
                  '&:hover fieldset': { border: 'none !important' },
                  '&.Mui-focused fieldset': { border: 'none !important' },
                  '& .MuiOutlinedInput-notchedOutline': { border: 'none !important' }
                },
                '& .MuiInputBase-input': {
                  fontSize: '13px',
                  padding: '4px 8px',
                  cursor: disabled ? 'default' : 'pointer',
                  color: isDarkMode ? '#ffffff !important' : 'text.primary !important',
                  WebkitTextFillColor: isDarkMode ? '#ffffff !important' : 'text.primary !important'
                },
                '& .MuiSvgIcon-root': {
                  color: isDarkMode ? '#ffffff !important' : 'inherit'
                }
              }
            },
            openPickerButton: {
              size: 'small',
              disabled: disabled,
              sx: {
                p: 0.5,
                color: isDarkMode ? '#ffffff !important' : 'inherit'
              }
            }
          }}
        />
      </Box>
    </LocalizationProvider>
  );
}
