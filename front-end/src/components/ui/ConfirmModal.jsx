import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  CircularProgress,
} from '@mui/material';
import { AlertTriangle } from 'lucide-react';

/**
 * Custom Confirmation Modal to replace native window.confirm / alert dialogs.
 */
function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  content = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmColor = 'error',
  secondaryText = null,
  onSecondaryAction = null,
  loading = false,
  maxWidth = 'sm',
}) {
  return (
    <Dialog
      open={open}
      onClose={loading ? undefined : onClose}
      maxWidth={maxWidth}
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '12px',
          p: 1,
          boxShadow: (theme) => theme.palette.mode === 'dark' ? 24 : '0 10px 30px rgba(0,0,0,0.15)',
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 38,
            height: 38,
            borderRadius: '50%',
            bgcolor: confirmColor === 'error'
              ? (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 77, 79, 0.15)' : 'rgba(255, 77, 79, 0.1)'
              : (theme) => theme.palette.mode === 'dark' ? 'rgba(250, 173, 20, 0.15)' : 'rgba(250, 173, 20, 0.1)',
            color: confirmColor === 'error' ? 'error.main' : 'warning.main',
            flexShrink: 0,
          }}
        >
          <AlertTriangle size={20} />
        </Box>
        <Typography variant="h6" fontWeight="700" sx={{ fontSize: '1.05rem' }}>
          {title}
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ py: 1 }}>
        {typeof content === 'string' ? (
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
            {content}
          </Typography>
        ) : (
          content
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2, pt: 1.5, gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <Button
          variant="outlined"
          color="secondary"
          size="small"
          disabled={loading}
          onClick={onClose}
          sx={{
            borderRadius: 1.5,
            textTransform: 'none',
            px: 1.75,
            fontWeight: 600,
            color: (t) => (t.palette.mode === 'dark' ? '#cbd5e1' : 'text.primary'),
            borderColor: (t) => (t.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.23)'),
            '&:hover': {
              bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)'),
              borderColor: (t) => (t.palette.mode === 'dark' ? '#f1f5f9' : '#1e293b'),
              color: (t) => (t.palette.mode === 'dark' ? '#ffffff' : '#0f172a'),
            }
          }}
        >
          {cancelText}
        </Button>
        {secondaryText && onSecondaryAction && (
          <Button
            variant="outlined"
            color="warning"
            size="small"
            disabled={loading}
            onClick={onSecondaryAction}
            sx={{ borderRadius: 1.5, textTransform: 'none', px: 1.75, fontWeight: 600 }}
          >
            {secondaryText}
          </Button>
        )}
        <Button
          variant="contained"
          color={confirmColor}
          size="small"
          disabled={loading}
          onClick={onConfirm}
          startIcon={loading ? <CircularProgress size={14} color="inherit" /> : undefined}
          sx={{ borderRadius: 1.5, textTransform: 'none', px: 1.75, fontWeight: 600 }}
        >
          {confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default ConfirmModal;
