// material-ui
import Box from '@mui/material/Box';

// assets
import logoIcon from 'assets/images/logo/favicon.png';

// ==============================|| LOGO ICON ||============================== //

export default function LogoIcon() {
  return (
    <Box
      component="img"
      src={logoIcon}
      alt="Logo"
      sx={{
        width: '130%',
        height: '130%',
        objectFit: 'contain'
      }}
    />
  );
}
