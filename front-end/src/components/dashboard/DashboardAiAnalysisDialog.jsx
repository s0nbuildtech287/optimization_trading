import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import RobotOutlined from '@ant-design/icons/RobotOutlined';
import SyncOutlined from '@ant-design/icons/SyncOutlined';
import ReactMarkdown from 'react-markdown';
import dayjs from 'dayjs';
import { getAiReport, refreshAiReport } from 'api/aiAnalysis';

export default function DashboardAiAnalysisDialog({
  open,
  onClose,
  title,
  subtitle,
  badge,
  sections = [],
  targetId,
  selectedTable,
  dateRange
}) {
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [content, setContent] = useState('');
  const [error, setError] = useState(null);
  const [source, setSource] = useState(null);

  const fetchReport = useCallback(async () => {
    if (!targetId) return;
    setLoading(true);
    setError(null);
    try {
      const formattedStart = dateRange?.startDate ? dayjs(dateRange.startDate).format('YYYY-MM-DD') : null;
      const formattedEnd = dateRange?.endDate ? dayjs(dateRange.endDate).format('YYYY-MM-DD') : null;

      const response = await getAiReport({
        targetType: 'tab',
        targetId,
        tableName: selectedTable,
        startDate: formattedStart,
        endDate: formattedEnd
      });

      if (response.success && response.data) {
        setContent(response.data.analysis_content);
        setSource(response.source);
      } else {
        throw new Error('Không nhận được dữ liệu báo cáo');
      }
    } catch (err) {
      console.error('❌ Failed to fetch AI report:', err);
      setError(err.message || 'Có lỗi xảy ra khi tải báo cáo phân tích.');
    } finally {
      setLoading(false);
    }
  }, [targetId, selectedTable, dateRange]);

  useEffect(() => {
    if (open && targetId) {
      fetchReport();
    }
  }, [open, targetId, fetchReport]);

  const handleRefresh = async () => {
    if (!targetId) return;
    setRefreshing(true);
    setError(null);
    try {
      const formattedStart = dateRange?.startDate ? dayjs(dateRange.startDate).format('YYYY-MM-DD') : null;
      const formattedEnd = dateRange?.endDate ? dayjs(dateRange.endDate).format('YYYY-MM-DD') : null;

      const response = await refreshAiReport({
        targetType: 'tab',
        targetId,
        tableName: selectedTable,
        startDate: formattedStart,
        endDate: formattedEnd
      });

      if (response.success && response.data) {
        setContent(response.data.analysis_content);
        setSource(response.source);
      } else {
        throw new Error('Không nhận được dữ liệu báo cáo mới');
      }
    } catch (err) {
      console.error('❌ Failed to refresh AI report:', err);
      setError(err.message || 'Có lỗi xảy ra khi tạo lại báo cáo phân tích.');
    } finally {
      setRefreshing(false);
    }
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
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.15)',
          overflow: 'hidden',
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider'
        }
      }}
    >
      <Box
        sx={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          color: '#fff',
          px: 3,
          py: 2.5,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            width: 150,
            height: 150,
            background: 'rgba(22, 181, 221, 0.15)',
            borderRadius: '50%',
            right: -30,
            top: -30,
            filter: 'blur(20px)'
          }}
        />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, zIndex: 1 }}>
          <RobotOutlined style={{ fontSize: 24, color: '#16b5dd' }} />
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#fff', letterSpacing: '0.2px' }}>
              {title}
            </Typography>
            {subtitle && (
              <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.6)', display: 'block', mt: 0.25 }}>
                {subtitle}
              </Typography>
            )}
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, zIndex: 1 }}>
          {source && targetId && (
            <Chip
              label={source === 'database_cache' ? '⚡ Cached' : '✨ OpenAI'}
              size="small"
              sx={{
                bgcolor: source === 'database_cache' ? 'rgba(76, 175, 80, 0.12)' : 'rgba(22, 181, 221, 0.12)',
                color: source === 'database_cache' ? '#4caf50' : '#16b5dd',
                fontWeight: 600,
                border: source === 'database_cache' ? '1px solid rgba(76, 175, 80, 0.3)' : '1px solid rgba(22, 181, 221, 0.3)',
                height: 24,
                fontSize: '0.75rem'
              }}
            />
          )}
          {badge && (
            <Chip
              label={badge}
              size="small"
              sx={{
                bgcolor: 'rgba(255, 255, 255, 0.1)',
                color: '#16b5dd',
                fontWeight: 600,
                border: '1px solid rgba(22, 181, 221, 0.3)',
                height: 24,
                fontSize: '0.75rem'
              }}
            />
          )}
          <Button
            onClick={onClose}
            sx={{
              color: 'rgba(255, 255, 255, 0.6)',
              minWidth: 'auto',
              p: 0.5,
              borderRadius: '50%',
              '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)', color: '#fff' }
            }}
          >
            ✕
          </Button>
        </Box>
      </Box>

      <DialogContent sx={{ p: 3, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'background.default' : '#f8fafc' }}>
        {targetId ? (
          loading ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8, gap: 2 }}>
              <CircularProgress size={36} sx={{ color: '#16b5dd' }} />
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                AI đang tổng hợp dữ liệu và viết phân tích...
              </Typography>
            </Box>
          ) : error ? (
            <Box sx={{ py: 3 }}>
              <Alert
                severity="error"
                action={
                  <Button color="inherit" size="small" onClick={fetchReport}>
                    Thử lại
                  </Button>
                }
              >
                {error}
              </Alert>
            </Box>
          ) : (
            <Box sx={{ minHeight: '150px' }}>
              <ReactMarkdown
                components={{
                  p: ({ children }) => (
                    <Typography variant="body1" sx={{ lineHeight: 1.7, mb: 1.5, color: 'text.primary', fontSize: '0.875rem' }}>
                      {children}
                    </Typography>
                  ),
                  h1: ({ children }) => <Typography variant="h5" sx={{ fontWeight: 700, mt: 2, mb: 1 }}>{children}</Typography>,
                  h2: ({ children }) => <Typography variant="h6" sx={{ fontWeight: 700, mt: 2, mb: 1 }}>{children}</Typography>,
                  h3: ({ children }) => <Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 1.5, mb: 0.75 }}>{children}</Typography>,
                  li: ({ children }) => (
                    <Box component="li" sx={{ mb: 0.5, color: 'text.primary' }}>
                      <Typography variant="body2" component="span" sx={{ lineHeight: 1.7, fontSize: '0.875rem' }}>
                        {children}
                      </Typography>
                    </Box>
                  ),
                  ul: ({ children }) => <Box component="ul" sx={{ pl: 2.5, mb: 1.5 }}>{children}</Box>,
                  ol: ({ children }) => <Box component="ol" sx={{ pl: 2.5, mb: 1.5 }}>{children}</Box>
                }}
              >
                {content}
              </ReactMarkdown>
            </Box>
          )
        ) : (
          sections.map((section) => (
            <Box key={section.heading} sx={{ mb: section === sections[sections.length - 1] ? 0 : 2.5 }}>
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 700,
                  color: 'text.secondary',
                  mb: 1,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}
              >
                {section.heading}
              </Typography>
              <Typography variant="body2" color="text.primary" sx={{ lineHeight: 1.7, whiteSpace: 'pre-line' }}>
                {section.body}
              </Typography>
            </Box>
          ))
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'background.default' : '#f8fafc', borderTop: '1px solid', borderColor: 'divider', justifyContent: 'space-between' }}>
        <Box>
          {targetId && !loading && !error && (
            <Button
              variant="outlined"
              size="small"
              onClick={handleRefresh}
              disabled={refreshing}
              startIcon={refreshing ? <CircularProgress size={14} color="inherit" /> : <SyncOutlined />}
              sx={{
                borderColor: 'divider',
                color: 'text.secondary',
                textTransform: 'none',
                fontWeight: 600,
                borderRadius: 1.5,
                '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.04)', borderColor: 'text.primary' }
              }}
            >
              {refreshing ? 'Đang tạo lại...' : 'Tạo lại báo cáo'}
            </Button>
          )}
        </Box>
        <Button
          variant="contained"
          onClick={onClose}
          sx={{
            bgcolor: '#0f172a',
            fontWeight: 600,
            borderRadius: 1.5,
            textTransform: 'none',
            boxShadow: 'none',
            '&:hover': { bgcolor: '#1e293b', boxShadow: 'none' }
          }}
        >
          Đóng
        </Button>
      </DialogActions>
    </Dialog>
  );
}

DashboardAiAnalysisDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  badge: PropTypes.string,
  sections: PropTypes.arrayOf(
    PropTypes.shape({
      heading: PropTypes.string.isRequired,
      body: PropTypes.string.isRequired
    })
  ),
  targetId: PropTypes.string,
  selectedTable: PropTypes.string,
  dateRange: PropTypes.shape({
    startDate: PropTypes.any,
    endDate: PropTypes.any
  })
};
