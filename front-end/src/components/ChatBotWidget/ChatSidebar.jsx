import { useState, memo } from 'react';
import { Box, Stack, Avatar, Chip, Tooltip, IconButton, List, InputBase, Button, Typography } from '@mui/material';
import HistoryOutlined from '@ant-design/icons/HistoryOutlined';
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import MessageOutlined from '@ant-design/icons/MessageOutlined';
import EditOutlined from '@ant-design/icons/EditOutlined';
import DeleteOutlined from '@ant-design/icons/DeleteOutlined';

const NAV_COLOR = '#2E3D52';

const ChatSidebar = memo(({ open, sessions, activeId, onSelect, onNew, onDelete, onRename }) => {
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');

  const startEdit = (e, s) => {
    e.stopPropagation();
    setEditingId(s.id);
    setEditValue(s.title);
  };

  const commitEdit = (id) => {
    if (editValue.trim()) onRename(id, editValue.trim());
    setEditingId(null);
  };

  return (
    <Box sx={{
      width: open ? 260 : 0,
      flexShrink: 0,
      overflow: 'hidden',
      transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)',
      bgcolor: NAV_COLOR,
      display: 'flex', flexDirection: 'column',
      borderRight: open ? '1px solid rgba(255,255,255,0.08)' : 'none',
    }}>
      {/* inner — fixed width so content doesn't squish during animation */}
      <Box sx={{ width: 260, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <Box sx={{ px: 2, py: 1.8, borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <HistoryOutlined style={{ fontSize: 15, color: 'rgba(255,255,255,0.7)' }} />
            <Typography sx={{ color: 'rgba(255,255,255,0.85)', fontWeight: 700, fontSize: '0.82rem', letterSpacing: 0.3 }}>
              Lịch sử
            </Typography>
            <Chip label={sessions.length} size="small"
              sx={{ height: 16, fontSize: '0.6rem', bgcolor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)', '& .MuiChip-label': { px: 0.8 } }} />
          </Stack>
          <Tooltip title="Cuộc trò chuyện mới">
            <IconButton size="small" onClick={onNew}
              sx={{ color: 'rgba(255,255,255,0.65)', bgcolor: 'rgba(255,255,255,0.08)', width: 24, height: 24, borderRadius: 1.5,
                '&:hover': { bgcolor: 'rgba(255,255,255,0.16)' } }}>
              <PlusOutlined style={{ fontSize: 12 }} />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Session list */}
        <List dense disablePadding sx={{ flex: 1, overflowY: 'auto', py: 1, px: 1,
          '&::-webkit-scrollbar': { width: 3 },
          '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.15)', borderRadius: 2 }
        }}>
          {sessions.map((s) => (
            <Box key={s.id} sx={{
              mb: 0.5, borderRadius: 1.5,
              bgcolor: s.id === activeId ? 'rgba(255,255,255,0.13)' : 'transparent',
              border: '1px solid', borderColor: s.id === activeId ? 'rgba(255,255,255,0.15)' : 'transparent',
              transition: 'all 0.15s',
              '&:hover': { bgcolor: s.id === activeId ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.07)' },
              '& .action-btns': { opacity: 0 },
              '&:hover .action-btns': { opacity: 1 },
            }}>
              <Stack direction="row" alignItems="center" sx={{ px: 1.2, py: 0.9 }}>
                <Avatar sx={{ width: 26, height: 26, bgcolor: 'rgba(255,255,255,0.1)', flexShrink: 0, mr: 1.2 }}>
                  <MessageOutlined style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }} />
                </Avatar>

                {/* Title / inline edit */}
                <Box sx={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => onSelect(s.id)}>
                  {editingId === s.id ? (
                    <InputBase autoFocus value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => commitEdit(s.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(s.id); if (e.key === 'Escape') setEditingId(null); }}
                      onClick={(e) => e.stopPropagation()}
                      sx={{ color: '#fff', fontSize: '0.76rem', fontWeight: 600, width: '100%',
                        '& input': { p: 0, borderBottom: '1px solid rgba(255,255,255,0.45)' } }}
                    />
                  ) : (
                    <>
                      <Typography noWrap sx={{ color: '#fff', fontSize: '0.76rem', fontWeight: s.id === activeId ? 600 : 400, lineHeight: 1.3 }}>
                        {s.title}
                      </Typography>
                      <Typography noWrap sx={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.62rem', mt: 0.1 }}>
                        {s.time.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                        {' · '}{s.messages.length} tin
                      </Typography>
                    </>
                  )}
                </Box>

                {/* Actions */}
                {editingId !== s.id && (
                  <Stack className="action-btns" direction="row" spacing={0.2} sx={{ flexShrink: 0 }}>
                    <Tooltip title="Đổi tên">
                      <IconButton size="small" onClick={(e) => startEdit(e, s)}
                        sx={{ color: 'rgba(255,255,255,0.4)', p: 0.35, borderRadius: 1,
                          '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.1)' } }}>
                        <EditOutlined style={{ fontSize: 12 }} />
                      </IconButton>
                    </Tooltip>
                    {sessions.length > 1 && (
                      <Tooltip title="Xóa">
                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                          sx={{ color: 'rgba(255,255,255,0.4)', p: 0.35, borderRadius: 1,
                            '&:hover': { color: '#ff6b6b', bgcolor: 'rgba(255,80,80,0.1)' } }}>
                          <DeleteOutlined style={{ fontSize: 12 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Stack>
                )}
              </Stack>
            </Box>
          ))}
        </List>

        {/* Footer */}
        <Box sx={{ px: 1.5, py: 1.5, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <Button fullWidth size="small" startIcon={<PlusOutlined style={{ fontSize: 12 }} />} onClick={onNew}
            sx={{ color: 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.15)', border: '1px solid', borderRadius: 1.5,
              textTransform: 'none', fontSize: '0.72rem', py: 0.6,
              '&:hover': { borderColor: 'rgba(255,255,255,0.4)', bgcolor: 'rgba(255,255,255,0.07)' } }}>
            Cuộc trò chuyện mới
          </Button>
        </Box>
      </Box>
    </Box>
  );
});

export default ChatSidebar;
