// ==============================|| OVERRIDES - CSS BASELINE (Dark Mode Global) ||============================== //

export default function CssBaseline(theme) {
  const isDark = theme.palette.mode === 'dark';

  if (!isDark) return {};

  return {
    MuiCssBaseline: {
      styleOverrides: {
        // ── Body background ──
        body: {
          backgroundColor: theme.palette.background.default,
          color: theme.palette.text.primary
        },

        // ── Recharts: SVG text — override hardcoded fill="#1F3864" ──
        // Recharts renders fill directly on <tspan> → CSS fill !important wins
        '.recharts-cartesian-axis-tick text, .recharts-cartesian-axis-tick-value, .recharts-text': {
          fill: '#94a3b8 !important'
        },
        '.recharts-label': {
          fill: '#94a3b8 !important'
        },
        '.recharts-reference-line-label': {
          fill: '#94a3b8 !important'
        },
        // ── Recharts: grid lines ──
        '.recharts-cartesian-grid line': {
          stroke: 'rgba(255,255,255,0.07) !important'
        },
        '.recharts-cartesian-axis-line, .recharts-cartesian-axis line': {
          stroke: 'rgba(255,255,255,0.10) !important'
        },
        // ── Recharts: Legend text (wrapperStyle color="#1F3864") ──
        '.recharts-legend-item-text': {
          color: '#94a3b8 !important',
          fill: '#94a3b8 !important'
        },
        // recharts wrapperStyle uses inline style on the wrapper div
        // → we can't override inline color, but we can target the span inside
        '.recharts-legend-wrapper span': {
          color: '#94a3b8 !important'
        },
        '.recharts-legend-wrapper': {
          color: '#94a3b8 !important'
        },
        // ── Recharts: Default tooltip ──
        '.recharts-default-tooltip': {
          backgroundColor: '#1e293b !important',
          border: '1px solid rgba(255,255,255,0.1) !important',
          color: '#e2e8f0 !important'
        },
        '.recharts-default-tooltip .recharts-tooltip-label': {
          color: '#94a3b8 !important'
        },
        '.recharts-default-tooltip .recharts-tooltip-item': {
          color: '#e2e8f0 !important'
        },
        '.recharts-tooltip-wrapper': {
          outline: 'none'
        },

        // ── MUI Typography / Box với hardcoded color="#1F3864" ──
        // Inline style color="..." không thể override bằng CSS class
        // Nhưng các sx={{ color: '#1F3864' }} của MUI render thành CSS class → override được
        '[class*="MuiTypography-root"][style*="color: rgb(31, 56, 100)"]': {
          color: '#e2e8f0 !important'
        },
        // MUI sx system renders color via CSS custom var — target cả hai cách
        '.MuiTypography-root': {
          '&[style*="--mui"]': {}
        },

        // ── MUI Paper / Card: remove white background ──
        '.MuiCard-root, .MuiPaper-root': {
          backgroundImage: 'none !important'
        },

        // ── MUI TableHead ──
        '.MuiTableHead-root': {
          backgroundColor: `${theme.palette.background.paper} !important`
        },
        '.MuiTableRow-root': {
          backgroundColor: 'transparent'
        },
        // Table row hover dark
        '.MuiTableBody-root .MuiTableRow-root:hover': {
          backgroundColor: 'rgba(255,255,255,0.03) !important'
        },

        // ── MUI Dialog ──
        '.MuiDialog-paper': {
          backgroundImage: 'none !important'
        },

        // ── Input background ──
        '.MuiOutlinedInput-root': {
          backgroundColor: 'transparent !important'
        },

        // ── Chip outlined dark mode ──
        '.MuiChip-outlined': {
          borderColor: 'rgba(255,255,255,0.12)'
        },

        // ── Border toàn cục: giảm độ tương phản border trắng ──
        // MUI Outlined input border
        '.MuiOutlinedInput-notchedOutline': {
          borderColor: 'rgba(255,255,255,0.12) !important'
        },
        // MUI Card border (borderColor: 'divider' + borderColor: grey.A800 đã fix qua palette)
        // Fallback cho các border hardcode màu trắng/nhạt quá
        '.MuiCard-root': {
          borderColor: 'rgba(255,255,255,0.06) !important'
        },
        // Table border
        '.MuiTableCell-root': {
          borderBottomColor: 'rgba(255,255,255,0.06) !important'
        },
        '.MuiTableHead-root': {
          borderTopColor: 'rgba(255,255,255,0.06) !important',
          borderBottomColor: 'rgba(255,255,255,0.10) !important'
        },
        // Dialog border
        '.MuiDialog-paper': {
          borderColor: 'rgba(255,255,255,0.06) !important'
        },
        // Divider component
        '.MuiDivider-root': {
          borderColor: 'rgba(255,255,255,0.06) !important'
        }
      }
    }
  };
}
