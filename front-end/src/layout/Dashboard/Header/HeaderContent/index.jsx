// material-ui
import { useState } from 'react';
import useMediaQuery from '@mui/material/useMediaQuery';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Button from '@mui/material/Button';

import { useLocation } from 'react-router-dom';

// project imports
import Profile from './Profile';
import Notification from './Notification';
import MobileSection from './MobileSection';
import WelcomeHeader from './WelcomeHeader';
import MarketTickerHeader from './MarketTickerHeader';
import IconButton from 'components/@extended/IconButton';
import { useThemeModeContext } from 'contexts/ThemeModeContext';
import TradingCalendarModal from 'pages/paper-trade/TradingCalendarModal';

// assets
import { BulbOutlined, BulbFilled, CalendarOutlined } from '@ant-design/icons';

// ==============================|| HEADER - CONTENT ||============================== //

export default function HeaderContent() {
  const downLG = useMediaQuery((theme) => theme.breakpoints.down('lg'));
  const { mode, toggleMode } = useThemeModeContext();
  const location = useLocation();
  const isMarketWatch = location.pathname.startsWith('/news');
  const isAutoTrade = location.pathname.startsWith('/auto-trade');

  const [calendarOpen, setCalendarOpen] = useState(false);

  return (
    <>
      <WelcomeHeader />

      {/* Nút Lịch PnL chỉ hiện khi ở trong các tab /auto-trade (Futures, Spot, Lab) */}
      {isAutoTrade && (
        <Box sx={{ ml: { xs: 1, sm: 1.5 }, display: 'flex', alignItems: 'center' }}>
          <Button
            variant="contained"
            size="small"
            onClick={() => setCalendarOpen(true)}
            startIcon={<CalendarOutlined style={{ fontSize: '0.95rem' }} />}
            sx={{
              height: { xs: 28, sm: 32 },
              px: { xs: 1.2, sm: 1.8 },
              fontSize: { xs: '0.72rem', sm: '0.78rem' },
              fontWeight: 800,
              letterSpacing: '0.5px',
              borderRadius: '16px',
              textTransform: 'uppercase',
              color: '#ffffff',
              background:
                mode === 'dark'
                  ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
                  : 'linear-gradient(135deg, #047857 0%, #059669 100%)',
              boxShadow:
                mode === 'dark'
                  ? '0 0 12px rgba(16, 185, 129, 0.4)'
                  : '0 2px 8px rgba(5, 150, 105, 0.3)',
              border: '1px solid',
              borderColor: mode === 'dark' ? '#34d399' : '#10b981',
              whiteSpace: 'nowrap',
              transition: 'all 0.25s ease',
              '&:hover': {
                background:
                  mode === 'dark'
                    ? 'linear-gradient(135deg, #10b981 0%, #34d399 100%)'
                    : 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                boxShadow: '0 0 16px rgba(16, 185, 129, 0.6)',
                transform: 'translateY(-1px)'
              }
            }}
          >
            LỊCH PNL
          </Button>
        </Box>
      )}

      {isMarketWatch ? (
        <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', mx: { xs: 1, sm: 2 }, minWidth: 0, overflow: 'hidden' }}>
          <MarketTickerHeader />
        </Box>
      ) : (
        <Box sx={{ flexGrow: 1 }} />
      )}
      {downLG && <Box sx={{ width: '100%', ml: 1 }} />}

      <Tooltip title={mode === 'dark' ? 'Chuyển sang sáng' : 'Chuyển sang tối'}>
        <span>
          <IconButton
            onClick={toggleMode}
            color="secondary"
            variant="light"
            sx={{ color: 'text.primary' }}
            aria-label="toggle dark mode"
          >
            {mode === 'dark' ? <BulbFilled style={{ color: '#fadb14' }} /> : <BulbOutlined />}
          </IconButton>
        </span>
      </Tooltip>

      <Notification />
      {!downLG && <Profile />}
      {downLG && <MobileSection />}

      {/* Modal Lịch Lợi Nhuận Giao Dịch PnL Calendar */}
      {isAutoTrade && (
        <TradingCalendarModal
          open={calendarOpen}
          onClose={() => setCalendarOpen(false)}
          defaultAccount={
            location.pathname.includes('/spot')
              ? 'SPOT'
              : location.pathname.includes('/futures')
              ? 'FUTURES_ALL'
              : 'ALL'
          }
        />
      )}
    </>
  );
}
