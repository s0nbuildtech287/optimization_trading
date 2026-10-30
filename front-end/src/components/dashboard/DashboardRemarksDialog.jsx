import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import CloseOutlined from '@ant-design/icons/CloseOutlined';
import SaveOutlined from '@ant-design/icons/SaveOutlined';
import DeleteOutlined from '@ant-design/icons/DeleteOutlined';
import IconButton from '@mui/material/IconButton';
import dayjs from 'dayjs';
import Alert from '@mui/material/Alert';
import { API_BASE_URL } from 'config';

const _getAuthHeader = () => {
  const token = localStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function DashboardRemarksDialog({
  open,
  onClose,
  title,
  remarksId,
  remarksType = 'chart',
  selectedTable = 'all_backtests',
  dateRange
}) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Load saved remarks when dialog opens
  useEffect(() => {
    const loadRemarks = async () => {
      if (!open || !remarksId) return;
      setLoading(true);
      setError('');
      try {
        const formattedStart = dateRange?.startDate ? dayjs(dateRange.startDate).format('YYYY-MM-DD') : null;
        const formattedEnd = dateRange?.endDate ? dayjs(dateRange.endDate).format('YYYY-MM-DD') : null;

        const params = new URLSearchParams({
          targetType: remarksType,
          targetId: remarksId,
          tableName: selectedTable || 'all_backtests'
        });

        if (formattedStart) params.append('startDate', formattedStart);
        if (formattedEnd) params.append('endDate', formattedEnd);

        const res = await fetch(`${API_BASE_URL}/api/dashboard/remarks?${params.toString()}`, {
          headers: { ..._getAuthHeader() }
        });

        if (res.ok) {
          const json = await res.json();
          setText(json.data?.analysis_content || '');
        }
      } catch (err) {
        console.error('❌ Failed to load remarks from DB:', err);
      } finally {
        setLoading(false);
      }
    };

    loadRemarks();
  }, [open, remarksId, remarksType, selectedTable, dateRange]);

  const handleSave = async () => {
    if (!remarksId) return;
    setSaving(true);
    setError('');
    try {
      const formattedStart = dateRange?.startDate ? dayjs(dateRange.startDate).format('YYYY-MM-DD') : null;
      const formattedEnd = dateRange?.endDate ? dayjs(dateRange.endDate).format('YYYY-MM-DD') : null;

      const res = await fetch(`${API_BASE_URL}/api/dashboard/remarks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ..._getAuthHeader()
        },
        body: JSON.stringify({
          targetType: remarksType,
          targetId: remarksId,
          tableName: selectedTable || 'all_backtests',
          startDate: formattedStart,
          endDate: formattedEnd,
          content: text
        })
      });

      if (!res.ok) throw new Error('Failed to save remarks');
      onClose();
    } catch (err) {
      console.error('❌ Failed to save remarks to DB:', err);
      setError('Không thể lưu nhận xét vào database. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = () => {
    setText('');
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="lg"
      PaperProps={{
        sx: {
          borderRadius: 3,
          boxShadow: '0 12px 48px rgba(0,0,0,0.15)'
        }
      }}
    >
      <DialogTitle sx={{ m: 0, p: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Nhận xét & Đánh giá (Database permanent)
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            {title}
          </Typography>
        </Box>
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{
            color: 'text.secondary',
            '&:hover': { color: 'text.primary' }
          }}
        >
          <CloseOutlined style={{ fontSize: 16 }} />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 3, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'background.default' : '#f8fafc' }}>
        {loading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8, gap: 2 }}>
            <CircularProgress size={36} sx={{ color: '#16b5dd' }} />
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
              Đang tải nhận xét từ database...
            </Typography>
          </Box>
        ) : (
          <Box sx={{ mt: 1, mb: 1 }}>
            {error && (
              <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                {error}
              </Alert>
            )}
            <Typography variant="body2" color="text.primary" sx={{ mb: 1.5, fontWeight: 500 }}>
              Đại ca có thể copy-paste câu trả lời của chatbot hoặc tự nhập các nhận xét của mình vào đây để lưu trữ lại cho biểu đồ/tab này.
            </Typography>
            <TextField
              multiline
              rows={12}
              fullWidth
              placeholder="Dán hoặc nhập nhận xét đánh giá ở đây..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              variant="outlined"
              disabled={saving}
              sx={(theme) => ({
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                  bgcolor: theme.palette.mode === 'dark' ? theme.palette.background.paper : '#ffffff',
                  border: '1px solid',
                  borderColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'divider',
                  '& textarea': {
                    color: theme.palette.text.primary
                  },
                  '& fieldset': { border: 'none' },
                  '&:hover': {
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                  },
                  '&.Mui-focused': {
                    boxShadow: '0 2px 12px rgba(24, 144, 255, 0.08)',
                    border: '1px solid',
                    borderColor: 'primary.main'
                  }
                }
              })}
            />
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'background.default' : '#f8fafc', borderTop: '1px solid', borderColor: 'divider', justifyContent: 'space-between' }}>
        <Button
          variant="outlined"
          color="error"
          size="small"
          onClick={handleClear}
          disabled={!text || loading || saving}
          startIcon={<DeleteOutlined />}
          sx={{ borderRadius: 1.5, textTransform: 'none', fontWeight: 600 }}
        >
          Xóa hết
        </Button>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button
            variant="outlined"
            onClick={onClose}
            disabled={saving}
            sx={{
              borderRadius: 1.5,
              textTransform: 'none',
              fontWeight: 600,
              color: 'text.secondary',
              borderColor: 'divider',
              '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.04)' }
            }}
          >
            Hủy
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={loading || saving}
            startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveOutlined />}
            sx={{
              bgcolor: '#0f172a',
              color: '#fff',
              fontWeight: 600,
              borderRadius: 1.5,
              textTransform: 'none',
              '&:hover': { bgcolor: '#1e293b' }
            }}
          >
            {saving ? 'Đang lưu...' : 'Lưu lại'}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}

DashboardRemarksDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.string.isRequired,
  remarksId: PropTypes.string,
  remarksType: PropTypes.string,
  selectedTable: PropTypes.string,
  dateRange: PropTypes.shape({
    startDate: PropTypes.any,
    endDate: PropTypes.any
  })
};
