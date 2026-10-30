// material-ui


// ==============================|| LOGO SVG ||============================== //

import lotusLogo from 'assets/images/logo/logo.png';

export default function LogoMain() {
  return (
    <img
      src={lotusLogo}
      alt="LotusQuant Logo"
      style={{ height: 120, width: 250, objectFit: 'contain', marginLeft: -50, marginTop: 7 }}
    />
  );
}
