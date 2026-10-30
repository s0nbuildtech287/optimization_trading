import React, { useState, useMemo, useRef } from 'react';
import { Box, Typography, Popper, Paper, IconButton } from '@mui/material';
import { SlidersOutlined } from '@ant-design/icons';

// List of non-parameter keys to exclude from parameter display
const EXCLUDED_PARAM_KEYS = new Set([
  'custom', 'pass', 'result', 'profit', 'total_trades', 'trades',
  'expected_payoff', 'drawdown_pct', 'equity_dd', 'drawdown',
  'profit_factor', 'recovery_factor', 'pd_ratio', 'sharpe_ratio',
  'rank_no', 'rank', 'id', 'job_id', 'created_at', 'updated_at',
  'status', 'strategy_code', 'source_job_id', 'job_name', 'name',
  'target_backtest_table', 'fail_reason', 'attempts_json',
  'comparison_json', 'filters_json', 'job', 'attempts', 'comparison',
  'synced', 'is_synced'
]);

/**
 * Extracts key-value parameter pairs from a row or parameter object
 */
export function extractRowParameters(row) {
  if (!row) return {};

  let rawObj = null;

  if (row.params_json && typeof row.params_json === 'object') {
    rawObj = row.params_json;
  } else if (row.params && typeof row.params === 'object') {
    rawObj = row.params;
  } else if (typeof row.params === 'string') {
    try {
      rawObj = JSON.parse(row.params);
    } catch (e) {
      rawObj = null;
    }
  } else if (row.raw_row_json && typeof row.raw_row_json === 'object') {
    rawObj = row.raw_row_json;
  } else if (typeof row.raw_row_json === 'string') {
    try {
      rawObj = JSON.parse(row.raw_row_json);
    } catch (e) {
      rawObj = null;
    }
  } else if (typeof row === 'object') {
    rawObj = row;
  }

  if (!rawObj || typeof rawObj !== 'object') return {};

  const cleanParams = {};
  Object.keys(rawObj).forEach((key) => {
    const lowerKey = key.trim().toLowerCase();
    if (!EXCLUDED_PARAM_KEYS.has(lowerKey)) {
      const val = rawObj[key];
      if (val !== undefined && val !== null && val !== '') {
        cleanParams[key] = val;
      }
    }
  });

  return cleanParams;
}

export default function ParametersPopover({ row, paramsData }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const enterTimerRef = useRef(null);
  const leaveTimerRef = useRef(null);

  React.useEffect(() => {
    return () => {
      if (enterTimerRef.current) clearTimeout(enterTimerRef.current);
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    };
  }, []);

  const parsedParams = useMemo(() => {
    if (paramsData && typeof paramsData === 'object') {
      return extractRowParameters({ params_json: paramsData });
    }
    return extractRowParameters(row);
  }, [row, paramsData]);

  const paramKeys = useMemo(() => Object.keys(parsedParams), [parsedParams]);
  const hasParams = paramKeys.length > 0;

  const handleClick = (event) => {
    event.stopPropagation();
    if (enterTimerRef.current) clearTimeout(enterTimerRef.current);
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    if (anchorEl) {
      setAnchorEl(null);
    } else {
      setAnchorEl(event.currentTarget);
    }
  };

  const handleMouseEnter = (event) => {
    const target = event.currentTarget;
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    if (enterTimerRef.current) clearTimeout(enterTimerRef.current);

    // Wait 450ms hover delay before opening to prevent popup spam on fast sweeps
    enterTimerRef.current = setTimeout(() => {
      setAnchorEl(target);
    }, 450);
  };

  const handleMouseLeave = () => {
    if (enterTimerRef.current) clearTimeout(enterTimerRef.current);
    leaveTimerRef.current = setTimeout(() => {
      setAnchorEl(null);
    }, 200);
  };

  const handlePopoverMouseEnter = () => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
  };

  const handlePopoverMouseLeave = () => {
    leaveTimerRef.current = setTimeout(() => {
      setAnchorEl(null);
    }, 200);
  };

  const open = Boolean(anchorEl);
  const id = open ? 'parameters-popper' : undefined;

  if (!hasParams) {
    return (
      <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 500 }}>
        -
      </Typography>
    );
  }

  return (
    <>
      <IconButton
        size="small"
        aria-describedby={id}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        sx={{
          p: 0.5,
          color: 'primary.main',
          bgcolor: (theme) =>
            theme.palette.mode === 'dark'
              ? 'rgba(24, 144, 255, 0.15)'
              : 'rgba(24, 144, 255, 0.08)',
          border: '1px solid',
          borderColor: (theme) =>
            theme.palette.mode === 'dark'
              ? 'rgba(24, 144, 255, 0.3)'
              : 'rgba(24, 144, 255, 0.2)',
          borderRadius: 1.5,
          '&:hover': {
            bgcolor: (theme) =>
              theme.palette.mode === 'dark'
                ? 'rgba(24, 144, 255, 0.3)'
                : 'rgba(24, 144, 255, 0.18)',
          },
        }}
      >
        <SlidersOutlined style={{ fontSize: 13 }} />
      </IconButton>

      <Popper
        id={id}
        open={open}
        anchorEl={anchorEl}
        placement="bottom"
        modifiers={[
          {
            name: 'offset',
            options: {
              offset: [0, 6],
            },
          },
        ]}
        style={{ zIndex: 1300 }}
      >
        <Paper
          onMouseEnter={handlePopoverMouseEnter}
          onMouseLeave={handlePopoverMouseLeave}
          elevation={6}
          sx={{
            p: 1.5,
            width: 'auto',
            minWidth: 220,
            maxWidth: 380,
            maxHeight: 320,
            overflowY: 'auto',
            borderRadius: 2,
            boxShadow: (theme) =>
              theme.palette.mode === 'dark'
                ? '0 6px 20px rgba(0,0,0,0.6)'
                : '0 6px 20px rgba(0,0,0,0.12)',
            border: '1px solid',
            borderColor: 'divider',
            '&::-webkit-scrollbar': { width: 5 },
            '&::-webkit-scrollbar-track': { background: 'transparent' },
            '&::-webkit-scrollbar-thumb': {
              background: (theme) =>
                theme.palette.mode === 'dark'
                  ? 'rgba(255,255,255,0.2)'
                  : 'rgba(0,0,0,0.2)',
              borderRadius: 3,
            },
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {paramKeys.map((key) => (
              <Box
                key={key}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 1.5,
                  py: 0.25,
                  borderBottom: '1px dashed',
                  borderColor: (theme) =>
                    theme.palette.mode === 'dark'
                      ? 'rgba(255,255,255,0.06)'
                      : 'rgba(0,0,0,0.05)',
                  '&:last-child': { borderBottom: 'none' },
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 600,
                    color: 'text.secondary',
                    fontFamily: 'monospace',
                    fontSize: '0.74rem',
                  }}
                >
                  {key}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    color: 'text.primary',
                    fontFamily: 'monospace',
                    fontSize: '0.74rem',
                  }}
                >
                  {String(parsedParams[key])}
                </Typography>
              </Box>
            ))}
          </Box>
        </Paper>
      </Popper>
    </>
  );
}
