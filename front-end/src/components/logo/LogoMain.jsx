import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import tradingLogo from 'assets/images/logo/favicon.png';

// ==============================|| LOGO ||============================== //

export default function LogoMain() {
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1.2}
      sx={{ width: 250, minHeight: 58, py: 0.5 }}
    >
      <img
        src={tradingLogo}
        alt="Trading Quant System Backtest logo"
        style={{ height: 50, width: 50, objectFit: 'contain', flexShrink: 0 }}
      />

      <Box
        aria-hidden="true"
        sx={{
          width: 2,
          height: 38,
          flexShrink: 0,
          borderRadius: 1,
          background: 'linear-gradient(180deg, #e2e8f0 0%, #38bdf8 100%)',
          opacity: 0.75
        }}
      />

      <Stack spacing={0.3} sx={{ minWidth: 0 }}>
        <Typography
          component="div"
          sx={{
            color: '#f1f5f9',
            fontSize: 18,
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: 0.2,
            whiteSpace: 'nowrap'
          }}
        >
          Trading Quant
        </Typography>
        <Typography
          component="div"
          sx={{
            color: '#7dd3fc',
            fontSize: 15.5,
            fontWeight: 650,
            lineHeight: 1.1,
            letterSpacing: 0.65,
            whiteSpace: 'nowrap'
          }}
        >
          System Backtest
        </Typography>
      </Stack>
    </Stack>
  );
}