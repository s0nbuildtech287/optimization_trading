// ==============================|| OVERRIDES - TABLE HEAD ||============================== //

export default function TableHead(theme) {
  const isDark = theme.palette.mode === 'dark';
  return {
    MuiTableHead: {
      styleOverrides: {
        root: {
          backgroundColor: isDark ? theme.palette.background.paper : theme.palette.grey[50],
          borderTop: '1px solid',
          borderTopColor: theme.palette.divider,
          borderBottom: '2px solid',
          borderBottomColor: theme.palette.divider
        }
      }
    }
  };
}
