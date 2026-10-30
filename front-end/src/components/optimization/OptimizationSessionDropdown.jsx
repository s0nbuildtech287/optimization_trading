import { useState, useEffect, useMemo } from 'react';

// material-ui
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import OutlinedInput from '@mui/material/OutlinedInput';
import Button from '@mui/material/Button';
import ListItemText from '@mui/material/ListItemText';
import ListItemIcon from '@mui/material/ListItemIcon';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Alert from '@mui/material/Alert';
import LinearProgress from '@mui/material/LinearProgress';

// assets - icons
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import ControlOutlined from '@ant-design/icons/ControlOutlined';
import CheckCircleFilled from '@ant-design/icons/CheckCircleFilled';
import ClockCircleFilled from '@ant-design/icons/ClockCircleFilled';
import AppstoreOutlined from '@ant-design/icons/AppstoreOutlined';
import DeleteOutlined from '@ant-design/icons/DeleteOutlined';
import StopOutlined from '@ant-design/icons/StopOutlined';
import { createMt5Session, deleteMt5Session, getMt5SessionDeletePreview, listMt5Sessions } from 'api/mt5Optimization';

// ==============================|| DEFAULT SESSIONS LIST ||============================== //

const mapSession = (session) => ({
  ...session,
  status: session.status === 'ACTIVE' ? 'running' : 'completed',
  strategyCount: session.result_count || 0,
  displayId: session.id,
  createdDate: session.created_at ? new Date(session.created_at).toLocaleString() : '',
  ownerUsername: session.owner_username || session.username || '-'
});

const STORAGE_SESSION_KEY = 'mt5_active_session_id';
const STORAGE_SESSIONS_LIST_KEY = 'mt5_sessions_list';

export default function OptimizationSessionDropdown() {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  // State: Sessions list
  const [sessions, setSessions] = useState([]);

  // State: Selected session ID
  const [selectedSessionId, setSelectedSessionId] = useState(() => {
    return localStorage.getItem(STORAGE_SESSION_KEY) || '';
  });

  // State: Create Session Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [newSessionDesc, setNewSessionDesc] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletePreview, setDeletePreview] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState(0);
  const [deletePhase, setDeletePhase] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [stopDeleteRequested, setStopDeleteRequested] = useState(false);

  useEffect(() => {
    let active = true;
    listMt5Sessions()
      .then((rows) => {
        if (!active) return;
        const mapped = rows.map(mapSession);
        const storedId = localStorage.getItem(STORAGE_SESSION_KEY);
        const nextId = mapped.some((row) => row.id === storedId) ? storedId : mapped[0]?.id || '';
        setSessions(mapped);
        setSelectedSessionId(nextId);
        if (nextId) localStorage.setItem(STORAGE_SESSION_KEY, nextId);
        else localStorage.removeItem(STORAGE_SESSION_KEY);
        window.dispatchEvent(new CustomEvent('mt5:session-change', { detail: { sessionId: nextId, sessionsList: mapped } }));
      })
      .catch(() => setSessions([]));
    return () => { active = false; };
  }, []);

  // Sync state to localStorage & broadcast event
  const handleSelectSession = (newId) => {
    if (newId === '__create_new__') {
      setCreateModalOpen(true);
      return;
    }

    setSelectedSessionId(newId);
    localStorage.setItem(STORAGE_SESSION_KEY, newId);

    const activeObj = sessions.find((s) => s.id === newId) || sessions[0];
    window.dispatchEvent(
      new CustomEvent('mt5:session-change', {
        detail: {
          sessionId: newId,
          session: activeObj
        }
      })
    );
  };

  // Listen to external session changes (e.g. from JobsQueueProcessTab)
  useEffect(() => {
    const handleExternalChange = (e) => {
      if (e?.detail?.sessionId && e.detail.sessionId !== selectedSessionId) {
        setSelectedSessionId(e.detail.sessionId);
      }
      if (e?.detail?.sessionsList) {
        setSessions(e.detail.sessionsList);
      }
    };

    window.addEventListener('mt5:session-change', handleExternalChange);
    return () => window.removeEventListener('mt5:session-change', handleExternalChange);
  }, [selectedSessionId]);

  // Create new session
  const handleCreateSession = async () => {
    if (!newSessionName.trim()) return;
    const newSession = mapSession(await createMt5Session({
      name: newSessionName.trim(),
      description: newSessionDesc.trim() || null
    }));
    const finalSessions = [newSession, ...sessions];
    setSessions(finalSessions);
    setSelectedSessionId(newSession.id);
    localStorage.removeItem(STORAGE_SESSIONS_LIST_KEY);
    localStorage.setItem(STORAGE_SESSION_KEY, newSession.id);
    window.dispatchEvent(new CustomEvent('mt5:session-change', {
      detail: { sessionId: newSession.id, session: newSession, sessionsList: finalSessions }
    }));
    setCreateModalOpen(false);
    setNewSessionName('');
    setNewSessionDesc('');
  };

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId) || sessions[0],
    [sessions, selectedSessionId]
  );

  const handleOpenDeleteSession = async (event, session) => {
    event.preventDefault();
    event.stopPropagation();
    setDeleteTarget(session);
    setDeletePreview(null);
    setDeleteConfirmation('');
    setDeleteProgress(0);
    setDeletePhase('');
    setDeleteError('');
    setStopDeleteRequested(false);
    setDeleteModalOpen(true);
    setDeleteLoading(true);
    try {
      setDeletePreview(await getMt5SessionDeletePreview(session.id));
    } catch (error) {
      setDeleteError(error.message || 'Unable to inspect this session.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteSession = async () => {
    if (!deleteTarget || deleteConfirmation !== deleteTarget.name) return;
    setDeleting(true);
    setDeleteError('');
    setStopDeleteRequested(false);
    let stopRequested = false;
    const stopListener = () => { stopRequested = true; };
    window.addEventListener('mt5:stop-session-delete', stopListener);
    const totalWork = Math.max(
      1,
      Number(deletePreview?.total_results || 0) +
      Number(deletePreview?.job_count || 0) +
      Number(deletePreview?.log_count || 0) + 1
    );
    let completedWork = 0;
    try {
      while (!stopRequested) {
        const result = await deleteMt5Session(deleteTarget.id, {
          confirmation_name: deleteTarget.name,
          chunk_size: 10000
        });
        completedWork += Number(result.deletedCount || 0);
        setDeletePhase(result.phase || 'SESSION');
        setDeleteProgress(result.completed ? 100 : Math.min(99, Math.round((completedWork / totalWork) * 100)));
        if (result.completed) {
          const remaining = sessions.filter((session) => session.id !== deleteTarget.id);
          const nextId = remaining[0]?.id || '';
          setSessions(remaining);
          setSelectedSessionId(nextId);
          if (nextId) localStorage.setItem(STORAGE_SESSION_KEY, nextId);
          else localStorage.removeItem(STORAGE_SESSION_KEY);
          window.dispatchEvent(new CustomEvent('mt5:session-change', {
            detail: { sessionId: nextId, session: remaining[0] || null, sessionsList: remaining }
          }));
          setDeleteModalOpen(false);
          break;
        }
      }
      if (stopRequested) {
        setStopDeleteRequested(true);
        setDeleteError('Deletion paused safely. Select this archived session and continue when ready.');
      }
    } catch (error) {
      setDeleteError(error.message || 'Failed to delete session.');
    } finally {
      window.removeEventListener('mt5:stop-session-delete', stopListener);
      setDeleting(false);
    }
  };

  const requestStopDelete = () => {
    setStopDeleteRequested(true);
    window.dispatchEvent(new Event('mt5:stop-session-delete'));
  };

  return (
    <>
      <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 240, md: 270 }, width: { xs: '100%', sm: 'auto' } }}>
        <InputLabel
          shrink
          id="mt5-session-page-select-label"
          sx={{
            fontSize: '13px',
            '&.MuiInputLabel-root': {
              color: isDarkMode ? '#f8fafc' : 'text.secondary'
            },
            '&.MuiInputLabel-outlined.MuiInputLabel-shrink': {
              background: isDarkMode ? '#111827' : '#fafafb',
              color: isDarkMode ? '#f8fafc' : 'text.secondary'
            },
            '&.MuiFormLabel-root': {
              color: isDarkMode ? '#f8fafc' : 'text.secondary'
            },
            '&.Mui-focused': { color: 'primary.main' }
          }}
        >
          Session
        </InputLabel>

        <Select
          labelId="mt5-session-page-select-label"
          notched
          value={selectedSessionId}
          label="Session"
          onChange={(e) => handleSelectSession(e.target.value)}
          renderValue={() => {
            if (!selectedSession) return <em>Select Session</em>;
            return (
              <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ width: '100%', overflow: 'hidden' }}>
                <Typography
                  variant="body2"
                  noWrap
                  sx={{
                    fontSize: '13px',
                    fontWeight: 600,
                    maxWidth: { xs: 150, sm: 220 }
                  }}
                >
                  {selectedSession.name || selectedSession.displayId}
                </Typography>
                {selectedSession.status === 'running' ? (
                  <Chip
                    label="ACTIVE"
                    size="small"
                    color="success"
                    sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700, borderRadius: 1, flexShrink: 0 }}
                  />
                ) : selectedSession.status === 'completed' ? (
                  <Chip
                    label="COMPLETED"
                    size="small"
                    color="primary"
                    variant="outlined"
                    sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700, borderRadius: 1, flexShrink: 0 }}
                  />
                ) : null}
              </Stack>
            );
          }}
          sx={{
            height: 40,
            fontSize: '13px',
            fontWeight: 600,
            bgcolor: isDarkMode ? 'rgba(255,255,255,0.02)' : '#ffffff',
            color: isDarkMode ? '#f1f5f9' : 'text.primary',
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'
            }
          }}
        >
          {sessions.map((ses) => (
            <MenuItem key={ses.id} value={ses.id} sx={{ py: 1, pr: 0.5, fontSize: '13px' }}>
              <ListItemText
                primary={
                  <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                    <Typography variant="body2" fontWeight={600} sx={{ fontSize: '13px' }}>
                      {ses.name || ses.displayId}
                    </Typography>
                    {ses.status === 'running' ? (
                      <Chip
                        label="ACTIVE"
                        size="small"
                        color="success"
                        sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700, borderRadius: 1 }}
                      />
                    ) : ses.status === 'completed' ? (
                      <Chip
                        label="COMPLETED"
                        size="small"
                        color="primary"
                        variant="outlined"
                        sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700, borderRadius: 1 }}
                      />
                    ) : null}
                  </Stack>
                }
                secondary={
                  ses.createdDate ? (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.35, fontSize: '0.72rem' }}>
                      {ses.id === 'ALL' ? ses.createdDate : `Created: ${ses.createdDate} • User: ${ses.ownerUsername}`}
                    </Typography>
                  ) : null
                }
              />
              <Tooltip title="Delete session">
                <IconButton
                  size="small"
                  color="error"
                  aria-label={`Delete session ${ses.name || ses.id}`}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => handleOpenDeleteSession(event, ses)}
                  sx={{ ml: 1, flexShrink: 0 }}
                >
                  <DeleteOutlined />
                </IconButton>
              </Tooltip>
            </MenuItem>
          ))}

          <Divider sx={{ my: 0.5 }} />

          {/* Quick Action: Create New Session */}
          <MenuItem
            value="__create_new__"
            sx={{
              py: 1,
              color: 'primary.main',
              fontWeight: 600,
              fontSize: '13px'
            }}
          >
            <ListItemIcon sx={{ minWidth: 28 }}>
              <PlusOutlined style={{ color: theme.palette.primary.main }} />
            </ListItemIcon>
            <ListItemText
              primary="Create New Session"
              primaryTypographyProps={{ fontSize: '13px', fontWeight: 700, color: 'primary.main' }}
            />
          </MenuItem>
        </Select>
      </FormControl>

      {/* ── CREATE NEW SESSION DIALOG ── */}
      <Dialog
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <ControlOutlined style={{ color: '#1890ff' }} />
            <Typography variant="h5" fontWeight={700}>
              Create Optimization Session
            </Typography>
          </Stack>
        </DialogTitle>

        <DialogContent sx={{ px: 3, py: 3, '&.MuiDialogContent-root': { pt: 3, pb: 3 } }}>
          <Stack spacing={2.5}>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.75, fontWeight: 600, color: 'text.primary' }}>
                Session Name <span style={{ color: '#d32f2f' }}>*</span>
              </Typography>
              <OutlinedInput
                fullWidth
                size="small"
                placeholder="e.g. SES-20260918-LOTUS-PRO"
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                autoFocus
                sx={{
                  borderRadius: 1.25,
                  '& .MuiOutlinedInput-input': {
                    py: 1,
                    px: 1.5,
                    fontSize: '0.875rem',
                    lineHeight: 'normal',
                    '&::placeholder': {
                      opacity: 0.65,
                      lineHeight: 'normal'
                    }
                  }
                }}
              />
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.75, fontWeight: 600, color: 'text.primary' }}>
                Description (Optional)
              </Typography>
              <OutlinedInput
                fullWidth
                size="small"
                multiline
                rows={2.5}
                placeholder="e.g. Multi-symbol trend optimization"
                value={newSessionDesc}
                onChange={(e) => setNewSessionDesc(e.target.value)}
                sx={{
                  borderRadius: 1.25,
                  '& .MuiOutlinedInput-input': {
                    fontSize: '0.875rem',
                    lineHeight: 1.4,
                    '&::placeholder': {
                      opacity: 0.65
                    }
                  }
                }}
              />
            </Box>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 1.75, borderTop: '1px solid', borderColor: 'divider' }}>
          <Button
            variant="outlined"
            onClick={() => setCreateModalOpen(false)}
            sx={{ textTransform: 'none', borderRadius: 1.25 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            disabled={!newSessionName.trim()}
            onClick={handleCreateSession}
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 1.25 }}
          >
            Create & Select
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={deleteModalOpen}
        onClose={() => { if (!deleting) setDeleteModalOpen(false); }}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <DeleteOutlined style={{ color: theme.palette.error.main }} />
            <Typography variant="h5" fontWeight={700}>Delete Optimization Session</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ px: 3, py: 3, '&.MuiDialogContent-root': { pt: 3 } }}>
          {deleteLoading ? (
            <LinearProgress />
          ) : (
            <Stack spacing={2}>
              <Alert severity="warning">
                Jobs, optimization results, candidates, staging and logs in this session will be deleted. Synced backtest tables are not affected.
              </Alert>
              {deleteError && <Alert severity={stopDeleteRequested ? 'info' : 'error'}>{deleteError}</Alert>}
              {deletePreview && (
                <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                  <Chip label={`${Number(deletePreview.total_results).toLocaleString()} results`} />
                  <Chip label={`${Number(deletePreview.candidate_count).toLocaleString()} candidates`} />
                  <Chip label={`${Number(deletePreview.staging_count).toLocaleString()} staged`} />
                  <Chip label={`${Number(deletePreview.job_count).toLocaleString()} jobs`} />
                </Stack>
              )}
              {Number(deletePreview?.active_job_count || 0) > 0 && (
                <Alert severity="error">Finish or cancel all active jobs before deleting this session.</Alert>
              )}
              {Number(deletePreview?.unsynced_staging_count || 0) > 0 && (
                <Alert severity="error">Sync all staged strategies before deleting this session.</Alert>
              )}
              {deleting && (
                <Box>
                  <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
                    <Typography variant="body2" fontWeight={600}>Deleting {deletePhase || 'session data'}...</Typography>
                    <Typography variant="body2" fontWeight={700}>{deleteProgress}%</Typography>
                  </Stack>
                  <LinearProgress variant="determinate" value={deleteProgress} />
                </Box>
              )}
              <TextField
                size="small"
                label="Type session name to confirm"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                disabled={deleting}
                helperText={deleteTarget?.name || ''}
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.75, borderTop: '1px solid', borderColor: 'divider' }}>
          {deleting ? (
            <Button color="warning" variant="outlined" startIcon={<StopOutlined />} onClick={requestStopDelete} disabled={stopDeleteRequested}>
              Stop after current chunk
            </Button>
          ) : (
            <>
              <Button variant="outlined" onClick={() => setDeleteModalOpen(false)}>Cancel</Button>
              <Button
                variant="contained"
                color="error"
                startIcon={<DeleteOutlined />}
                onClick={handleDeleteSession}
                disabled={
                  deleteLoading || !deletePreview || deleteConfirmation !== deleteTarget?.name ||
                  Number(deletePreview?.active_job_count || 0) > 0 ||
                  Number(deletePreview?.unsynced_staging_count || 0) > 0
                }
              >
                Delete session
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
}
