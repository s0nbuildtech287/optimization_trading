import { createContext, useContext } from 'react';

// ==============================|| CONTEXT - THEME MODE ||============================== //

export const ThemeModeContext = createContext({
  mode: 'dark',
  toggleMode: () => {}
});

export const useThemeModeContext = () => useContext(ThemeModeContext);
