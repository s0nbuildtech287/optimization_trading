// ==============================|| OVERRIDES - TABLE CELL ||============================== //

export default function TableCell(theme) {
  const isDark = theme.palette.mode === 'dark';

  // Light mode: đường kẻ dọc giữa các cột header
  const commonCell = isDark
    ? {} // dark mode: bỏ hẳn đường kẻ dọc — trông gai mắt vì không kéo hết chiều cao
    : {
        '&:not(:last-of-type)': {
          position: 'relative',
          '&.MuiTableCell-stickyHeader': {
            position: 'sticky'
          },
          '&:after': {
            position: 'absolute',
            content: '""',
            backgroundColor: theme.palette.divider,
            width: 1,
            height: 'calc(100% - 30px)',
            right: 0,
            top: 16
          }
        }
      };

  return {
    MuiTableCell: {
      styleOverrides: {
        root: {
          fontSize: '0.875rem',
          padding: 12,
          borderColor: theme.palette.divider,
          color: isDark ? theme.palette.text.primary : 'inherit',
          '&.cell-right': {
            justifyContent: 'flex-end',
            textAlign: 'right',
            '& > *': {
              justifyContent: 'flex-end',
              margin: '0 0 0 auto'
            },
            '& .MuiOutlinedInput-input': {
              textAlign: 'right'
            }
          },
          '&.cell-center': {
            justifyContent: 'center',
            textAlign: 'center',
            '& > *': {
              justifyContent: 'center',
              margin: '0 auto'
            }
          }
        },
        sizeSmall: {
          padding: 8
        },
        head: {
          fontSize: '0.75rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          color: isDark ? '#94a3b8' : theme.palette.text.secondary,
          ...commonCell
        },
        footer: {
          fontSize: '0.75rem',
          textTransform: 'uppercase',
          color: isDark ? '#94a3b8' : theme.palette.text.secondary,
          ...commonCell
        }
      }
    }
  };
}
