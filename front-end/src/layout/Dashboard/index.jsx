import PropTypes from 'prop-types';
import { useEffect } from 'react';
import { Link, Outlet } from 'react-router-dom';

import useMediaQuery from '@mui/material/useMediaQuery';
import Toolbar from '@mui/material/Toolbar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

// project imports
import Drawer from './Drawer';
import Header from './Header';
import Footer from './Footer';
import Loader from 'components/Loader';
import Breadcrumbs from 'components/@extended/Breadcrumbs';
import ChatBotWidget from 'components/ChatBotWidget';

import { handlerDrawerOpen, useGetMenuMaster } from 'api/menu';
import { useThemeModeContext } from 'contexts/ThemeModeContext';
import { DarkDashboardGlobalStyles, LightDashboardGlobalStyles } from 'themes';

// ==============================|| MAIN LAYOUT ||============================== //

export default function DashboardLayout({ demoMode = false }) {
  const { menuMasterLoading } = useGetMenuMaster();
  const downXL = useMediaQuery((theme) => theme.breakpoints.down('xl'));
  const { mode } = useThemeModeContext();

  // set media wise responsive drawer
  useEffect(() => {
    handlerDrawerOpen(!downXL);
  }, [downXL]);

  if (menuMasterLoading) return <Loader />;

  return (
    <Box sx={{ display: 'flex', width: '100%' }}>
      {/* Inject GlobalStyles chỉ trong dashboard — không ảnh hưởng Auth pages */}
      {mode === 'dark' ? DarkDashboardGlobalStyles : LightDashboardGlobalStyles}

      <Header />
      <Drawer />

      <Box component="main" sx={{ width: 'calc(100% - 260px)', flexGrow: 1, p: { xs: 2, sm: 3 } }}>
        <Toolbar sx={{ mt: 'inherit' }} />
        <Box
          sx={{
            ...{ px: { xs: 0, sm: 2 } },
            position: 'relative',
            minHeight: 'calc(100vh - 110px)',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <Breadcrumbs />
          {demoMode && (
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1.5}
              alignItems={{ sm: 'center' }}
              justifyContent="space-between"
              sx={{ mb: 2.5, px: 2, py: 1.4, borderRadius: 2, bgcolor: 'rgba(8,145,178,.1)', border: '1px solid rgba(34,211,238,.2)' }}
            >
              <Box>
                <Typography sx={{ color: '#67e8f9', fontWeight: 800, fontSize: 13 }}>DEMO MODE | SAMPLE DATA</Typography>
                <Typography sx={{ color: 'text.secondary', fontSize: 12 }}>
                  This is the real dashboard interface with read-only mock data. Production actions are disabled.
                </Typography>
              </Box>
              <Button component={Link} to="/login" variant="contained" size="small" sx={{ textTransform: 'none', flexShrink: 0 }}>
                Sign in for live workspace
              </Button>
            </Stack>
          )}
          <Outlet />
          <Footer />
        </Box>
        {!demoMode && <ChatBotWidget />}
      </Box>
    </Box>
  );
}

DashboardLayout.propTypes = { demoMode: PropTypes.bool };
