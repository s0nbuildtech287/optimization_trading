import { useState, useEffect } from 'react';

// material-ui
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';

// assets
import ClockCircleOutlined from '@ant-design/icons/ClockCircleOutlined';
import CalendarOutlined from '@ant-design/icons/CalendarOutlined';

// dayjs
import dayjs from 'dayjs';

export default function WelcomeHeader() {
  const theme = useTheme();
  const downMD = useMediaQuery(theme.breakpoints.down('md'));
  const downSM = useMediaQuery(theme.breakpoints.down('sm'));

  const [time, setTime] = useState(dayjs());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(dayjs());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (downSM) return null;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: { xs: 1.2, md: 1.5 },
        ml: { xs: 0.8, sm: 1.2 },
      }}
    >
      {/* Welcome message with refined compact font */}
      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        <Typography
          variant="subtitle2"
          sx={{
            fontWeight: 700,
            lineHeight: 1.2,
            fontSize: { xs: '0.78rem', sm: '0.88rem', md: '0.92rem' },
            background:
              theme.palette.mode === 'dark'
                ? 'linear-gradient(90deg, #36cfc9 0%, #4096ff 40%, #b37feb 100%)'
                : 'linear-gradient(90deg, #0958d9 0%, #1677ff 40%, #722ed1 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '0.4px',
            textTransform: 'uppercase',
            userSelect: 'none',
          }}
        >
          WELCOME BACK, MY BOSS ! ✨
        </Typography>
      </Box>

      {/* Compact Real-time Clock & Date Pill */}
      {!downMD && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.8,
            px: 1.2,
            py: 0.35,
            borderRadius: '16px',
            bgcolor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
            border: '1px solid',
            borderColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
            backdropFilter: 'blur(6px)',
            transition: 'all 0.3s ease',
            userSelect: 'none',
            '&:hover': {
              borderColor: theme.palette.primary.main,
              boxShadow:
                theme.palette.mode === 'dark'
                  ? '0 0 8px rgba(64, 150, 255, 0.35)'
                  : '0 0 8px rgba(22, 119, 255, 0.2)',
            },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'primary.main' }}>
            <ClockCircleOutlined style={{ fontSize: '0.85rem' }} />
            <Typography
              variant="caption"
              sx={{
                fontFamily: 'monospace',
                fontWeight: 700,
                fontSize: '0.8rem',
                color: 'text.primary',
                letterSpacing: '0.4px',
              }}
            >
              {time.format('HH:mm:ss')}
            </Typography>
          </Box>

          <Typography variant="caption" sx={{ color: 'text.secondary', opacity: 0.5, fontWeight: 300 }}>
            |
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <CalendarOutlined style={{ fontSize: '0.8rem', color: theme.palette.text.secondary }} />
            <Typography
              variant="caption"
              sx={{ fontWeight: 500, color: 'text.secondary', fontSize: '0.75rem' }}
            >
              {time.format('ddd, DD/MM/YYYY')}
            </Typography>
          </Box>
        </Box>
      )}
    </Box>
  );
}
