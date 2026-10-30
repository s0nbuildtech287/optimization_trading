// material-ui
import useMediaQuery from '@mui/material/useMediaQuery';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';

import { useLocation } from 'react-router-dom';

// project imports
import Profile from './Profile';
import Notification from './Notification';
import MobileSection from './MobileSection';
import WelcomeHeader from './WelcomeHeader';
import MarketTickerHeader from './MarketTickerHeader';
import IconButton from 'components/@extended/IconButton';
import { useThemeModeContext } from 'contexts/ThemeModeContext';

// assets
import { BulbOutlined, BulbFilled } from '@ant-design/icons';

// ==============================|| HEADER - CONTENT ||============================== //

export default function HeaderContent() {
  const downLG = useMediaQuery((theme) => theme.breakpoints.down('lg'));
  const { mode, toggleMode } = useThemeModeContext();
  const location = useLocation();
  const isMarketWatch = location.pathname.startsWith('/news');

  return (
    <>
      <WelcomeHeader />
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
    </>
  );
}
