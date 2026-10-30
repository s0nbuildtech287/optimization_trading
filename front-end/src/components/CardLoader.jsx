import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';

/**
 * Component loader cục bộ dùng chung cho các Card/Chart trong Dashboard
 * thưa đại ca Xuân Sơn
 */
export function CardLoader({ height = 200, size = 30, message }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height,
        gap: 1.5,
        width: '100%'
      }}
    >
      <CircularProgress size={size} />
      {message && (
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
          {message}
        </Typography>
      )}
    </Box>
  );
}

/**
 * Component hiển thị thông báo lỗi cục bộ cho các Card/Chart trong Dashboard
 * thưa đại ca Xuân Sơn
 */
export function CardError({ error, sx }) {
  const errorMessage = typeof error === 'string' ? error : error?.message || 'Có lỗi xảy ra khi tải dữ liệu';

  return (
    <Alert severity="error" sx={{ m: 1, fontSize: '0.8rem', ...sx }}>
      {errorMessage}
    </Alert>
  );
}

export default CardLoader;
