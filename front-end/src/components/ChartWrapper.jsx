import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';

/**
 * ChartWrapper — bọc Recharts để tự động adapt dark/light mode.
 *
 * Dùng thay cho <Box> trực tiếp bao quanh <ResponsiveContainer>:
 *   <ChartWrapper height={300}>
 *     <ResponsiveContainer width="100%" height="100%">
 *       ...
 *     </ResponsiveContainer>
 *   </ChartWrapper>
 *
 * Export thêm các helpers dùng trong chart props:
 *   useChartColors() → { gridColor, textColor, tooltipBg, axisColor }
 */

export function useChartColors() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return {
    // CartesianGrid stroke
    gridColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)',
    // XAxis / YAxis tick + label
    textColor: isDark ? '#94a3b8' : theme.palette.text.secondary,
    // Axis line
    axisColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
    // Recharts built-in Tooltip (background / border / text)
    tooltipBg: isDark ? '#1e293b' : '#fff',
    tooltipBorder: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
    tooltipText: isDark ? '#e2e8f0' : theme.palette.text.primary,
    // Legend text
    legendColor: isDark ? '#94a3b8' : theme.palette.text.secondary,
    // isDark flag for conditional logic in charts
    isDark
  };
}

export default function ChartWrapper({ children, height, sx }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      sx={{
        width: '100%',
        height: height || '100%',
        // Override Recharts SVG text colour globally inside this wrapper
        '& .recharts-text, & .recharts-cartesian-axis-tick-value, & .recharts-legend-item-text': {
          fill: isDark ? '#94a3b8' : theme.palette.text.secondary,
          color: isDark ? '#94a3b8' : theme.palette.text.secondary
        },
        '& .recharts-cartesian-grid line': {
          stroke: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)'
        },
        '& .recharts-cartesian-axis line, & .recharts-cartesian-axis-line': {
          stroke: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'
        },
        // Recharts default tooltip
        '& .recharts-tooltip-wrapper .recharts-default-tooltip': {
          backgroundColor: `${isDark ? '#1e293b' : '#fff'} !important`,
          borderColor: `${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'} !important`,
          color: `${isDark ? '#e2e8f0' : theme.palette.text.primary} !important`
        },
        '& .recharts-default-tooltip .recharts-tooltip-label': {
          color: `${isDark ? '#94a3b8' : theme.palette.text.secondary} !important`
        },
        '& .recharts-default-tooltip .recharts-tooltip-item': {
          color: `${isDark ? '#e2e8f0' : theme.palette.text.primary} !important`
        },
        ...sx
      }}
    >
      {children}
    </Box>
  );
}
