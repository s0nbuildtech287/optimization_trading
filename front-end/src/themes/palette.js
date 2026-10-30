// material-ui
import { createTheme } from '@mui/material/styles';

// third-party
import { presetPalettes } from '@ant-design/colors';

// project imports
import ThemeOption from './theme';

// ==============================|| DEFAULT THEME - PALETTE ||============================== //

export default function Palette(mode, presetColor) {
  const colors = presetPalettes;

  let greyPrimary = [
    '#ffffff',
    '#fafafa',
    '#f5f5f5',
    '#f0f0f0',
    '#d9d9d9',
    '#bfbfbf',
    '#8c8c8c',
    '#595959',
    '#262626',
    '#141414',
    '#000000'
  ];
  let greyAscent = ['#fafafa', '#bfbfbf', '#434343', '#1f1f1f'];
  let greyConstant = ['#fafafb', '#e6ebf1'];

  colors.grey = [...greyPrimary, ...greyAscent, ...greyConstant];

  const paletteColor = ThemeOption(colors, presetColor, mode);
  const isDark = mode === 'dark';

  // Trong dark mode, override các grey token dùng cho border/card
  if (isDark) {
    paletteColor.grey = {
      ...paletteColor.grey,
      // A800 dùng bởi MainCard borderColor → đổi sang mờ nhạt
      A800: 'rgba(255,255,255,0.06)',
      // A50 dùng cho background.default
      A50: '#111827'
    };
  }

  return createTheme({
    palette: {
      mode,
      common: {
        black: '#000',
        white: '#fff'
      },
      ...paletteColor,
      text: {
        primary: isDark ? '#e2e8f0' : paletteColor.grey[700],
        secondary: isDark ? '#94a3b8' : paletteColor.grey[500],
        disabled: isDark ? '#475569' : paletteColor.grey[400]
      },
      action: {
        disabled: isDark ? paletteColor.grey[700] : paletteColor.grey[300]
      },
      divider: isDark ? 'rgba(255,255,255,0.06)' : paletteColor.grey[200],
      background: {
        // paper: card/modal — sáng hơn rõ rệt so với default để tạo contrast
        paper: isDark ? '#1e293b' : paletteColor.grey[0],
        // default: body background — xám đen trung tính, khác tone với sidebar xanh navy
        default: isDark ? '#111827' : paletteColor.grey.A50
      }
    }
  });
}
