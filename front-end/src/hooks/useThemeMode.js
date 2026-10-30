import { useState, useCallback } from 'react';

// ==============================|| HOOK - THEME MODE ||============================== //

const STORAGE_KEY = 'themeMode';

export function useThemeMode() {
  const [mode, setMode] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'dark' || saved === 'light' ? saved : 'dark';
  });

  const toggleMode = useCallback(() => {
    setMode((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return { mode, toggleMode };
}
