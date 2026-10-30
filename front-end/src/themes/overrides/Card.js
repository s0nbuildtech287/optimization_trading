// ==============================|| OVERRIDES - CARD ||============================== //

export default function Card(theme) {
  const isDark = theme.palette.mode === 'dark';

  if (!isDark) return {};

  return {
    MuiCard: {
      styleOverrides: {
        root: {
          // Các card hardcode bgcolor="#ffffff" sẽ bị theme.palette.background.paper override
          // khi dark mode thông qua backgroundImage none + background
          backgroundImage: 'none'
        }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none'
        }
      }
    }
  };
}
