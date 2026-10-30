// src/components/ActivityHistory.jsx

import { useState } from 'react';
import { Box, Typography, Chip, Stack, Pagination, Button } from '@mui/material';
import { format } from 'date-fns';
import DownloadOutlined from '@ant-design/icons/DownloadOutlined';
import MainCard from 'components/MainCard';

/**
 * Component hiển thị lịch sử activity của user
 * Hiển thị NEW RUN và UPDATE commands trong 3 tháng
 * Phân trang: 10 logs/page
 */
export default function ActivityHistory({ logs, loading, onDownloadIssue }) {
  const [page, setPage] = useState(1);
  const logsPerPage = 10;

  if (loading) {
    return (
      <MainCard sx={{ mt: 2 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          📋 History Activity User
        </Typography>
        <Typography color="text.secondary">Loading...</Typography>
      </MainCard>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <MainCard sx={{ mt: 2 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          📋 History Activity User
        </Typography>
        <Typography color="text.secondary" variant="body2">
          No activity logs found
        </Typography>
      </MainCard>
    );
  }

  // Helper: Format datetime
  const formatDateTime = (dateString) => {
    try {
      return format(new Date(dateString), 'dd/MM/yyyy - HH:mm:ss');
    } catch {
      return dateString;
    }
  };

  // Helper: Get status color
  const getStatusColor = (status) => {
    switch (status?.toUpperCase()) {
      case 'SUCCESS':
        return 'success';
      case 'FAILED':
        return 'error';
      case 'WARNING':
        return 'warning';
      default:
        return 'default';
    }
  };

  // Helper: Format sheet names
  const formatSheetNames = (sheetNames) => {
    if (!sheetNames || sheetNames.length === 0) return null;
    if (sheetNames.length <= 3) {
      return sheetNames.join(', ');
    }
    return `${sheetNames.slice(0, 3).join(', ')} and ${sheetNames.length - 3} more`;
  };

  // Pagination logic
  const totalPages = Math.ceil(logs.length / logsPerPage);
  const startIndex = (page - 1) * logsPerPage;
  const endIndex = startIndex + logsPerPage;
  const displayedLogs = logs.slice(startIndex, endIndex);

  const handlePageChange = (event, value) => {
    setPage(value);
  };

  return (
    <MainCard sx={{ mt: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">📋 History Activity User</Typography>
        <Typography variant="body2" color="text.secondary">
          Total: {logs.length} logs
        </Typography>
      </Box>

      <Stack spacing={1}>
        {displayedLogs.map((log) => {
          const sheetInfo = formatSheetNames(log.sheetNames);
          const issueEntries = [
            ['duplicate', log.issueSummary?.duplicate, 'duplicate.txt'],
            ['error', log.issueSummary?.error, 'error.txt'],
            ['notfound', log.issueSummary?.notfound, 'notfound.txt']
          ].filter(([, summary]) => summary?.count > 0);

          return (
            <Box
              key={log.id}
              sx={{
                p: 1.5,
                borderRadius: 1,
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                '&:hover': {
                  bgcolor: 'action.hover'
                }
              }}
            >
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Typography variant="body2" fontWeight={600}>
                  {log.username}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  just used
                </Typography>
                <Chip label={log.command} size="small" color={log.command === 'NEW RUN' ? 'primary' : 'warning'} sx={{ fontWeight: 600 }} />
                <Typography variant="body2" color="text.secondary">
                  to sync
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  {log.tableName}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  - successfully synced
                </Typography>
                <Typography variant="body2" fontWeight={600} color="success.main">
                  {log.successFiles} {log.successFiles === 1 ? 'file' : 'files'}
                </Typography>
                {sheetInfo && (
                  <>
                    <Typography variant="body2" color="text.secondary">
                      including files:
                    </Typography>
                    <Typography variant="body2" fontStyle="italic">
                      {sheetInfo}
                    </Typography>
                  </>
                )}
                <Typography variant="body2" color="text.secondary">
                  -
                </Typography>
                <Typography variant="body2" fontSize="0.85rem" color="text.secondary">
                  {formatDateTime(log.createdAt)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  -
                </Typography>
                <Chip label={log.status} size="small" color={getStatusColor(log.status)} variant="outlined" />
              </Stack>
              {issueEntries.length > 0 && (
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mt: 1 }}>
                  {issueEntries.map(([type, summary, fileName]) => (
                    <Stack key={type} direction="row" spacing={0.75} alignItems="center">
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<DownloadOutlined />}
                        onClick={() => onDownloadIssue?.(type, log.id)}
                      >
                        {fileName} ({summary.count})
                      </Button>
                      {summary.preview?.length > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          {summary.preview.join(', ')}
                        </Typography>
                      )}
                    </Stack>
                  ))}
                </Stack>
              )}
            </Box>
          );
        })}
      </Stack>

      {/* Pagination */}
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <Pagination count={totalPages} page={page} onChange={handlePageChange} color="primary" showFirstButton showLastButton />
        </Box>
      )}
    </MainCard>
  );
}
