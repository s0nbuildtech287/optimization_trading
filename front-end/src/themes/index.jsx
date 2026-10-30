import PropTypes from 'prop-types';
import { useMemo } from 'react';

// material-ui
import { createTheme, StyledEngineProvider, ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import GlobalStyles from '@mui/material/GlobalStyles';

// project imports
import Palette from './palette';
import Typography from './typography';
import CustomShadows from './shadows';
import componentsOverride from './overrides';
import { useThemeMode } from 'hooks/useThemeMode';
import { ThemeModeContext } from 'contexts/ThemeModeContext';

// ==============================|| GLOBAL STYLES — chỉ inject trong DashboardLayout ||============================== //

// Light mode: reset CSS variables về gốc
export const LightDashboardGlobalStyles = (
  <GlobalStyles
    styles={{
      ':root, body': {
        '--chart-title-color': '#1F3864',
        '--tab-active-bg': '#212A37',
        '--tab-active-hover-bg': '#1565C0',
        '--tab-inactive-hover-bg': 'rgba(0,0,0,0.06)'
      }
    }}
  />
);

// Dark mode: override toàn bộ hardcode màu trong dashboard pages
export const DarkDashboardGlobalStyles = (
  <GlobalStyles
    styles={{
      // ── CSS variables ──
      ':root, body': {
        '--chart-title-color': '#e2e8f0',
        '--tab-active-bg': '#334155',
        '--tab-active-hover-bg': '#475569',
        '--tab-inactive-hover-bg': 'rgba(255,255,255,0.10)'
      },

      // ── Recharts axis ticks ──
      '.recharts-cartesian-axis-tick text, .recharts-cartesian-axis-tick-value tspan': {
        fill: '#94a3b8 !important'
      },
      '.recharts-cartesian-axis-tick-value': {
        fill: '#94a3b8 !important'
      },
      '.recharts-cartesian-grid line': {
        stroke: 'rgba(255,255,255,0.07) !important'
      },
      '.recharts-legend-item-text': {
        color: '#94a3b8 !important'
      },
      '.recharts-legend-wrapper': {
        color: '#94a3b8 !important'
      },

      // ── Typography hardcode color ──
      '*[style*="color: rgb(31, 56, 100)"]': {
        color: '#e2e8f0 !important'
      },

      // ── Drawer children transparent ──
      '.MuiDrawer-paper > *, .MuiDrawer-paper *:not(.MuiCard-root):not(.MuiPaper-root):not(.MuiTableContainer-root)': {
        backgroundColor: 'transparent'
      },

      // ── Card/Paper ──
      '.MuiCard-root': {
        backgroundColor: '#1e293b !important',
        backgroundImage: 'none !important'
      },
      '.MuiDrawer-paper .MuiCard-root, .MuiDrawer-paper .MuiPaper-root': {
        backgroundColor: 'transparent !important'
      },
      '.MuiPaper-root': {
        backgroundImage: 'none !important'
      },
      '.MuiTableContainer-root': {
        backgroundColor: '#1e293b !important'
      },
      '.MuiDrawer-paper .MuiTableContainer-root': {
        backgroundColor: 'transparent !important'
      },
      '.MuiOutlinedInput-root': {
        backgroundColor: 'transparent !important'
      },

      // ── Recharts tooltip ──
      '.recharts-default-tooltip': {
        backgroundColor: '#1e293b !important',
        border: '1px solid rgba(255,255,255,0.1) !important',
        color: '#e2e8f0 !important'
      }
    }}
  />
);

// ==============================|| DEFAULT THEME - MAIN ||============================== //

export default function ThemeCustomization({ children }) {
  const { mode, toggleMode } = useThemeMode();

  const theme = Palette(mode, 'default');
  const themeTypography = Typography(`'Public Sans', sans-serif`);
  const themeCustomShadows = useMemo(() => CustomShadows(theme), [theme]);

  const themeOptions = useMemo(
    () => ({
      breakpoints: {
        values: { xs: 0, sm: 768, md: 1024, lg: 1266, xl: 1440 }
      },
      direction: 'ltr',
      mixins: {
        toolbar: { minHeight: 60, paddingTop: 8, paddingBottom: 8 }
      },
      palette: theme.palette,
      customShadows: themeCustomShadows,
      typography: themeTypography
    }),
    [theme, themeTypography, themeCustomShadows]
  );

  const themes = createTheme(themeOptions);
  themes.components = componentsOverride(themes);

  return (
    <ThemeModeContext.Provider value={{ mode, toggleMode }}>
      <StyledEngineProvider injectFirst>
        <ThemeProvider theme={themes}>
          <CssBaseline enableColorScheme />
          {/* GlobalStyles KHÔNG inject ở đây — inject trong DashboardLayout để tránh ảnh hưởng Auth pages */}
          {children}
        </ThemeProvider>
      </StyledEngineProvider>
    </ThemeModeContext.Provider>
  );
}

ThemeCustomization.propTypes = { children: PropTypes.node };
