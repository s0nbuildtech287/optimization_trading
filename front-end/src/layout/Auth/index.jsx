import { Outlet } from 'react-router-dom';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import { lazy, Suspense, useMemo } from 'react';
import { createTheme, StyledEngineProvider, ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

// project imports
import Palette from 'themes/palette';
import Typography from 'themes/typography';
import CustomShadows from 'themes/shadows';
import componentsOverride from 'themes/overrides';

const Quant3DBackground = lazy(() => import('sections/auth/Quant3DBackground'));

// ==============================|| LAYOUT - AUTH ||============================== //

function AuthThemeProvider({ children }) {
  const theme = Palette('dark', 'default');
  const themeTypography = Typography(`'Public Sans', sans-serif`);
  const themeCustomShadows = useMemo(() => CustomShadows(theme), [theme]);

  const themeOptions = useMemo(() => ({
    breakpoints: { values: { xs: 0, sm: 768, md: 1024, lg: 1266, xl: 1440 } },
    direction: 'ltr',
    mixins: { toolbar: { minHeight: 60, paddingTop: 8, paddingBottom: 8 } },
    palette: theme.palette,
    customShadows: themeCustomShadows,
    typography: themeTypography
  }), [theme, themeTypography, themeCustomShadows]);

  const themes = createTheme(themeOptions);
  themes.components = componentsOverride(themes);

  return (
    <StyledEngineProvider injectFirst>
      <ThemeProvider theme={themes}>
        <CssBaseline enableColorScheme />
        {children}
      </ThemeProvider>
    </StyledEngineProvider>
  );
}

export default function AuthLayout() {
  return (
    <AuthThemeProvider>
      <Box
        sx={{
          height: '100vh',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          backgroundColor: '#060913',
          overflow: 'hidden'
        }}
      >
        {/* Dynamic 3D Quant Finance Background */}
        <Suspense fallback={null}>
          <Quant3DBackground />
        </Suspense>

        <Container maxWidth="sm" sx={{ position: 'relative', zIndex: 1 }}>
          <Outlet />
        </Container>
      </Box>
    </AuthThemeProvider>
  );
}
