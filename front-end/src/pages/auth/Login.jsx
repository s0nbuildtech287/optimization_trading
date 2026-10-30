import { Link } from 'react-router-dom';
import { useEffect } from 'react';

// material-ui
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

// project imports
import AuthWrapper from 'sections/auth/AuthWrapper';
import AuthLogin from 'sections/auth/AuthLogin';

// ================================|| JWT - LOGIN ||================================ //

export default function Login() {
  // Set page title
  useEffect(() => {
    document.title = 'Sign In | Trading Quant System Backtest';
  }, []);

  return (
    <AuthWrapper>
      <Box sx={{ width: '100%', maxWidth: 520, mx: 'auto', px: 2 }}>
      <Grid container spacing={2.5}>
        <Grid size={12}>
          <Stack direction="column" sx={{ alignItems: 'center', mb: 2 }}>

            <Typography
              variant="h2"
              sx={{
                fontWeight: 800,
                color: '#ffffff',
                textAlign: 'center',
                mb: 0.75,
                letterSpacing: '-0.02em',
                background: 'linear-gradient(180deg, #ffffff 30%, #94a3b8 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}
            >
              Welcome to Trading Quant System Backtest
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: '#94a3b8',
                textAlign: 'center',
                fontSize: '0.875rem'
              }}
            >
              Trade data synchronization & distributed optimization
            </Typography>
          </Stack>
        </Grid>
        <Grid size={12}>
          <Stack direction="row" sx={{ alignItems: 'baseline', justifyContent: 'space-between', mb: { xs: 0, sm: 0.5 } }}>
            <Typography variant="h4" sx={{ color: '#f8fafc', fontWeight: 600 }}>
              Sign In
            </Typography>
            <Typography
              component={Link}
              to={'/register'}
              variant="body2"
              sx={{
                textDecoration: 'none',
                color: '#38bdf8',
                fontSize: '0.85rem',
                fontWeight: 500,
                transition: 'all 0.2s ease',
                '&:hover': { color: '#00f0ff', textDecoration: 'underline' }
              }}
            >
              Don&apos;t have an account?
            </Typography>
          </Stack>
        </Grid>
        <Grid size={12}>
          <AuthLogin />
        </Grid>
      </Grid>
      </Box>
    </AuthWrapper>
  );
}

