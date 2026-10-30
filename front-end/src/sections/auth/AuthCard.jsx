import PropTypes from 'prop-types';

// material-ui
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';

// project imports
import MainCard from 'components/MainCard';

// ==============================|| AUTHENTICATION - CARD WRAPPER ||============================== //

export default function AuthCard({ children, ...other }) {
  const theme = useTheme();

  return (
    <MainCard
      sx={{
        maxWidth: { xs: 400, sm: 475 },
        margin: { xs: 2, md: 3 },
        '& > *': { flexGrow: 1, flexBasis: '50%' },
        backgroundColor: 'rgba(6, 11, 25, 0.45)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: '1px solid rgba(0, 240, 255, 0.18)',
        borderRadius: 3,
        position: 'relative',
        boxShadow: '0 20px 50px -10px rgba(0, 0, 0, 0.55), 0 0 25px -5px rgba(0, 240, 255, 0.08)',
        maxHeight: { xs: 'calc(100vh - 20px)', sm: 'auto' },
        overflowY: { xs: 'auto', sm: 'visible' },
        scrollPaddingTop: { xs: '20px', sm: '0' },
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: '10%',
          right: '10%',
          height: '2px',
          background: 'linear-gradient(90deg, transparent, #00f0ff 30%, #10b981 70%, transparent)',
          zIndex: 1
        }
      }}
      content={false}
      {...other}
      border={false}
      boxShadow={false}
    >
      <Box sx={{ p: { xs: 2.5, sm: 3.5, md: 4 } }}>{children}</Box>
    </MainCard>
  );
}

AuthCard.propTypes = { children: PropTypes.any, other: PropTypes.any };
