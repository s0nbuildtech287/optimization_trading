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

// assets - icons
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import ControlOutlined from '@ant-design/icons/ControlOutlined';
import CheckCircleFilled from '@ant-design/icons/CheckCircleFilled';
import ClockCircleFilled from '@ant-design/icons/ClockCircleFilled';
import AppstoreOutlined from '@ant-design/icons/AppstoreOutlined';

// ==============================|| DEFAULT SESSIONS LIST ||============================== //

const DEFAULT_SESSIONS = [
  {
    id: 'ALL',
    name: 'All Sessions (Tất cả)',
    status: 'all',
    strategyCount: 14,
    createdDate: '2026-09-17'
  },
  {
    id: 'SES-20260917-01',
    name: 'SES-20260917-LOTUS-PRO',
    status: 'running',
    strategyCount: 5,
    description: 'Lotus Trend Pro EA on Multi-symbols (M15)',
    createdDate: '2026-09-17'
  },
  {
    id: 'SES-20260917-02',
    name: 'SES-20260917-GOLD-M15',
    status: 'running',
    strategyCount: 4,
    description: 'Gold Scalp Master & Grid Strategy (M5/M15)',
    createdDate: '2026-09-17'
  },
  {
    id: 'SES-20260916-01',
    name: 'SES-20260916-CRYPTO-H4',
    status: 'completed',
    strategyCount: 3,
    description: 'Crypto Momentum Grid (BTC/ETH H4)',
    createdDate: '2026-09-16'
  },
  {
    id: 'SES-20260915-01',
    name: 'SES-20260915-INDICES-PRO',
    status: 'completed',
    strategyCount: 2,
    description: 'DE30 & US500 Volatility Sniper (M30)',
    createdDate: '2026-09-15'
  }
];

const STORAGE_SESSION_KEY = 'mt5_active_session_id';
const STORAGE_SESSIONS_LIST_KEY = 'mt5_sessions_list';

export default function OptimizationSessionHeader() {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  // State: Sessions list
  const [sessions, setSessions] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_SESSIONS_LIST_KEY);
      return stored ? JSON.parse(stored) : DEFAULT_SESSIONS;
    } catch {
      return DEFAULT_SESSIONS;
    }
  });

  // State: Selected session ID
  const [selectedSessionId, setSelectedSessionId] = useState(() => {
    return localStorage.getItem(STORAGE_SESSION_KEY) || 'SES-20260917-01';
  });

  // State: Create Session Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [newSessionDesc, setNewSessionDesc] = useState('');

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
  const handleCreateSession = () => {
    if (!newSessionName.trim()) return;

    const newId = `SES-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(sessions.length + 1).padStart(2, '0')}`;
    const newSession = {
      id: newId,
      name: newSessionName.trim(),
      description: newSessionDesc.trim() || 'Custom optimization session',
      status: 'running',
      strategyCount: 0,
      createdDate: new Date().toISOString().slice(0, 10)
    };

    const updated = [newSession, ...sessions.filter((s) => s.id !== 'ALL')];
    const finalSessions = [sessions.find((s) => s.id === 'ALL') || DEFAULT_SESSIONS[0], ...updated];

    setSessions(finalSessions);
    setSelectedSessionId(newId);
    localStorage.setItem(STORAGE_SESSIONS_LIST_KEY, JSON.stringify(finalSessions));
    localStorage.setItem(STORAGE_SESSION_KEY, newId);

    window.dispatchEvent(
      new CustomEvent('mt5:session-change', {
        detail: {
          sessionId: newId,
          session: newSession,
          sessionsList: finalSessions
        }
      })
    );

    setCreateModalOpen(false);
    setNewSessionName('');
    setNewSessionDesc('');
  };

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId) || sessions[1] || sessions[0],
    [sessions, selectedSessionId]
  );

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', mr: { xs: 1, sm: 1.5 } }}>
        <FormControl size="small" sx={{ minWidth: { xs: 170, sm: 230, md: 260 } }}>
          <InputLabel
            shrink
            id="mt5-session-header-select-label"
            sx={{
              fontSize: '13px',
              '&.MuiInputLabel-root': {
                color: isDarkMode ? '#f8fafc' : 'text.secondary'
              },
              '&.MuiInputLabel-outlined.MuiInputLabel-shrink': {
                background: isDarkMode ? '#111827' : '#ffffff',
                px: 0.5,
                color: isDarkMode ? '#f8fafc' : 'text.secondary'
              },
              '&.MuiFormLabel-root': {
                color: isDarkMode ? '#f8fafc' : 'text.secondary'
              },
              '&.Mui-focused': { color: 'primary.main' }
            }}
          >
            Optimization Session
          </InputLabel>

          <Select
            labelId="mt5-session-header-select-label"
            notched
            value={selectedSessionId}
            label="Optimization Session"
            onChange={(e) => handleSelectSession(e.target.value)}
            renderValue={() => {
              if (!selectedSession) return <em>Select Session</em>;
              return (
                <Stack direction="row" spacing={0.75} alignItems="center" sx={{ overflow: 'hidden' }}>
                  {selectedSession.id === 'ALL' ? (
                    <AppstoreOutlined style={{ fontSize: 13, color: '#1890ff' }} />
                  ) : selectedSession.status === 'running' ? (
                    <Box
                      sx={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        bgcolor: '#52c41a',
                        boxShadow: '0 0 6px #52c41a'
                      }}
                    />
                  ) : (
                    <Box
                      sx={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        bgcolor: '#1890ff'
                      }}
                    />
                  )}
                  <Typography
                    variant="body2"
                    noWrap
                    sx={{
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      maxWidth: { xs: 120, sm: 170, md: 190 }
                    }}
                  >
                    {selectedSession.name}
                  </Typography>
                </Stack>
              );
            }}
            sx={{
              height: 38,
              fontSize: '13px',
              fontWeight: 600,
              bgcolor: isDarkMode ? 'rgba(255,255,255,0.02)' : '#ffffff',
              color: isDarkMode ? '#f1f5f9' : 'text.primary',
              borderRadius: 1.5,
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: isDarkMode ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)'
              },
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: 'primary.main'
              }
            }}
          >
            {sessions.map((ses) => (
              <MenuItem key={ses.id} value={ses.id} sx={{ py: 1 }}>
                <ListItemIcon sx={{ minWidth: 26 }}>
                  {ses.id === 'ALL' ? (
                    <AppstoreOutlined style={{ fontSize: 14, color: '#1890ff' }} />
                  ) : ses.status === 'running' ? (
                    <ClockCircleFilled style={{ fontSize: 14, color: '#52c41a' }} />
                  ) : (
                    <CheckCircleFilled style={{ fontSize: 14, color: '#1890ff' }} />
                  )}
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.8125rem' }}>
                        {ses.name}
                      </Typography>
                      {ses.status === 'running' && (
                        <Chip
                          label="ACTIVE"
                          size="small"
                          color="success"
                          sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }}
                        />
                      )}
                    </Stack>
                  }
                  secondary={
                    ses.description ? (
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', maxWidth: 220 }}>
                        {ses.description}
                      </Typography>
                    ) : null
                  }
                />
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
                fontSize: '0.8125rem'
              }}
            >
              <ListItemIcon sx={{ minWidth: 26 }}>
                <PlusOutlined style={{ color: theme.palette.primary.main }} />
              </ListItemIcon>
              <ListItemText
                primary="Create New Session"
                primaryTypographyProps={{ fontSize: '0.8125rem', fontWeight: 700, color: 'primary.main' }}
              />
            </MenuItem>
          </Select>
        </FormControl>
      </Box>

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
    </>
  );
}
