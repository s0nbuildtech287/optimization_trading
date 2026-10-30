// material-ui
import { alpha } from '@mui/material/styles';

// ==============================|| OVERRIDES - TAB ||============================== //

export default function Tab(theme) {
  const isDark = theme.palette.mode === 'dark';
  return {
    MuiTab: {
      styleOverrides: {
        root: {
          minHeight: 46,
          color: theme.palette.text.primary,
          borderRadius: 4,
          '&:hover': {
            backgroundColor: isDark
              ? 'rgba(255,255,255,0.08)'
              : alpha(theme.palette.primary.lighter, 0.6),
            color: isDark ? '#e2e8f0' : theme.palette.primary.main
          },
          '&:focus-visible': {
            borderRadius: 4,
            outline: `2px solid ${theme.palette.secondary.dark}`,
            outlineOffset: -3
          }
        }
      }
    }
  };
}
