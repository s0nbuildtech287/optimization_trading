// ==============================|| OVERRIDES - TOOLTIP ||============================== //

export default function Tooltip(theme) {
  const isDark = theme.palette.mode === 'dark';
  return {
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: isDark ? '#1e293b' : theme.palette.grey[700],
          color: '#ffffff',
          fontSize: '0.75rem',
          fontWeight: 600,
          boxShadow: isDark
            ? '0 10px 25px -5px rgba(0,0,0,0.6), 0 8px 10px -6px rgba(0,0,0,0.5)'
            : '0 4px 12px rgba(0,0,0,0.15)',
          border: '1px solid',
          borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.1)',
          padding: '8px 12px',
          borderRadius: '6px',
          lineHeight: 1.4
        },
        arrow: {
          color: isDark ? '#1e293b' : theme.palette.grey[700]
        }
      }
    }
  };
}
