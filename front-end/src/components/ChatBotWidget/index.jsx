import { useState, useRef, useEffect, useCallback } from 'react';
import { sendChatMessage, getChatModels } from '../../api/chat';
import {
  Box, Dialog, DialogContent, IconButton, Typography, TextField,
  Stack, Avatar, Chip, Tooltip, Badge, Paper, Divider
} from '@mui/material';
import RobotOutlined from '@ant-design/icons/RobotOutlined';
import CloseOutlined from '@ant-design/icons/CloseOutlined';
import SendOutlined from '@ant-design/icons/SendOutlined';
import MessageOutlined from '@ant-design/icons/MessageOutlined';
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import ReloadOutlined from '@ant-design/icons/ReloadOutlined';
import ThunderboltOutlined from '@ant-design/icons/ThunderboltOutlined';
import PictureOutlined from '@ant-design/icons/PictureOutlined';
import HistoryOutlined from '@ant-design/icons/HistoryOutlined';

import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';
import ChatSidebar from './ChatSidebar';
import ModelSelector, { FALLBACK_MODELS } from './ModelSelector';

// ─── Constants ────────────────────────────────────────────────────────────────
const NAV_COLOR = '#2E3D52';
const NAV_DARK  = '#1E2D40';
const NAV_LIGHT = '#3A4F68';

const makeWelcome = () => ({
  id: Date.now(),
  role: 'bot',
  text: 'Xin chào! Tôi là trợ lý AI của OpLotus 👋\nTôi có thể giúp bạn phân tích chiến lược, giải thích kết quả backtest, hoặc trả lời bất kỳ câu hỏi nào về hệ thống.\n\n⚠️ Lưu ý: Nếu đây là lần đầu vào trang Strategy Input, hãy bấm Reset một lần trước khi lọc để đảm bảo không có filter cũ còn lưu từ phiên trước.',
  time: new Date(),
  image: null,
});

const makeSession = (title) => ({
  id: Date.now(),
  title: title || 'Cuộc trò chuyện mới',
  preview: 'Xin chào! Tôi là trợ lý AI...',
  time: new Date(),
  messages: [makeWelcome()],
});

// ─── Main Widget ──────────────────────────────────────────────────────────────
export default function ChatBotWidget() {
  const [open, setOpen]         = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessions, setSessions] = useState([makeSession('Cuộc trò chuyện 1')]);
  const [activeId, setActiveId] = useState(() => sessions[0]?.id);
  const [input, setInput]       = useState('');
  const [typing, setTyping]     = useState(false);
  const [model, setModel]       = useState('gpt-4o');
  const [availableModels, setAvailableModels] = useState(FALLBACK_MODELS);
  const [imagePreview, setImagePreview] = useState(null);
  const [pageContext, setPageContext]   = useState(null);
  const bottomRef  = useRef(null);
  const fileRef    = useRef(null);

  const activeSession = sessions.find((s) => s.id === activeId);
  const messages = activeSession?.messages || [];

  useEffect(() => {
    if (open) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
  }, [messages, typing, open, activeId]);

  useEffect(() => {
    const loadModels = async () => {
      try {
        const response = await getChatModels();
        const models = response.models?.length ? response.models : FALLBACK_MODELS;
        const nextDefault = response.defaultModel || models[0]?.id || 'gpt-4o';

        setAvailableModels(models);
        setModel((prevModel) => {
          const validIds = models.map((m) => m.id);
          return validIds.includes(prevModel) ? prevModel : nextDefault;
        });
      } catch (error) {
        console.error('❌ Failed to load models:', error);
      }
    };

    loadModels();
  }, []);

  // ── nhận initialMessage từ window event ──
  useEffect(() => {
    const handler = (e) => {
      const msg = e.detail?.message;
      if (!msg) return;
      setOpen(true);
      setTimeout(() => setInput(msg), 100);
    };
    window.addEventListener('chatbot:prompt', handler);
    return () => window.removeEventListener('chatbot:prompt', handler);
  }, []);

  // ── nhận pageContext từ các trang ──
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.context) setPageContext(e.detail.context);
    };
    window.addEventListener('chatbot:context', handler);
    return () => window.removeEventListener('chatbot:context', handler);
  }, []);

  const updateSession = (id, updater) =>
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...updater(s) } : s)));

  const handleNewSession = () => {
    const s = makeSession(`Cuộc trò chuyện ${sessions.length + 1}`);
    setSessions((prev) => [s, ...prev]);
    setActiveId(s.id);
    setInput('');
    setTyping(false);
    setImagePreview(null);
  };

  const handleDeleteSession = (id) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (id === activeId && next.length) setActiveId(next[0].id);
      return next;
    });
  };

  const handleRenameSession = (id, newTitle) =>
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title: newTitle } : s)));

  const sendMessage = useCallback(async () => {
    const text   = input.trim();
    const hasImg = !!imagePreview;
    if (!text && !hasImg) return;

    const userMsg = { id: Date.now(), role: 'user', text, time: new Date(), image: imagePreview };
    updateSession(activeId, (s) => ({
      messages: [...s.messages, userMsg],
      title: s.messages.length === 1 ? (text.slice(0, 30) || 'Ảnh đính kèm') : s.title,
      preview: text || 'Ảnh đính kèm',
    }));
    setInput('');
    setImagePreview(null);
    setTyping(true);

    try {
      const history = activeSession.messages
        .filter((m) => m.role !== 'bot' || m.id !== messages[0]?.id)
        .slice(-20)
        .map((m) => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.text || '' }));

      const response = await sendChatMessage(text, history, model || availableModels[0]?.id || 'gpt-4o', pageContext);

      setTyping(false);

      const botMsg = {
        id: Date.now() + 1,
        role: 'bot',
        text: response.message.content,
        time: new Date(),
        image: null,
      };

      updateSession(activeId, (s) => ({
        messages: [...s.messages, botMsg]
      }));


    } catch (error) {
      setTyping(false);

      const errorMsg = {
        id: Date.now() + 1,
        role: 'bot',
        text: `❌ Lỗi: ${error.message}\n\n${error.message.includes('Rate limit') ? 'Bạn đã gửi quá nhiều tin nhắn. Vui lòng chờ 1 phút.' : 'Vui lòng thử lại sau.'}`,
        time: new Date(),
        image: null,
      };

      updateSession(activeId, (s) => ({
        messages: [...s.messages, errorMsg]
      }));

      console.error('❌ Chat error:', error);
    }
  }, [input, imagePreview, activeId, activeSession, model, availableModels, pageContext, messages]);

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleReset = () => {
    updateSession(activeId, () => ({ messages: [makeWelcome()], title: 'Cuộc trò chuyện mới', preview: 'Xin chào!' }));
    setInput('');
    setTyping(false);
    setImagePreview(null);
  };

  return (
    <>
      {/* ── Floating Side-Docked Bubble ── */}
      <Tooltip title="Chat với AI" placement="left">
        <Box
          onClick={() => setOpen(true)}
          sx={{
            position: 'fixed',
            bottom: { xs: 90, sm: 100 },
            right: 0,
            zIndex: 1300,
            width: 58,
            height: 58,
            borderRadius: '29px 0 0 29px',
            background: 'linear-gradient(135deg, #3A5068 0%, #1E2D40 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            pl: 1.5,
            cursor: 'pointer',
            boxShadow: '-4px 4px 20px rgba(33,42,55,0.7), -1px 1px 4px rgba(0,0,0,0.3)',
            border: '2px solid rgba(255,255,255,0.18)',
            borderRight: 'none',
            transform: 'translateX(24px)',
            transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
            '&:hover': {
              transform: 'translateX(0)',
              boxShadow: '-6px 6px 28px rgba(33,42,55,0.85)',
              borderLeftColor: 'rgba(255,255,255,0.35)',
              pl: 1.8
            },
            '&:active': { transform: 'scale(0.96)' }
          }}
        >
          <Badge
            badgeContent={sessions.length}
            color="error"
            max={9}
            sx={{
              '& .MuiBadge-badge': {
                fontSize: '0.65rem',
                minWidth: 16,
                height: 16,
                top: -2,
                left: 14
              }
            }}
          >
            <MessageOutlined style={{ fontSize: 26, color: '#fff', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))' }} />
          </Badge>
        </Box>
      </Tooltip>

      {/* ── Modal ── */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xl" fullWidth
        slotProps={{ paper: { sx: { height: '88vh', maxHeight: '88vh', borderRadius: 3, overflow: 'hidden', display: 'flex', flexDirection: 'column' } } }}>

        {/* Header */}
        <Box sx={{
          px: 3, py: 1.8,
          background: `linear-gradient(135deg, ${NAV_DARK} 0%, ${NAV_COLOR} 60%, ${NAV_LIGHT} 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0
        }}>
          <Stack direction="row" alignItems="center" spacing={2}>
            <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.12)', width: 42, height: 42, border: '2px solid rgba(255,255,255,0.25)' }}>
              <RobotOutlined style={{ fontSize: 22, color: '#fff' }} />
            </Avatar>
            <Box>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700, lineHeight: 1.2, fontSize: '1rem' }}>
                  OpLotus AI Assistant
                </Typography>
                <Chip icon={<ThunderboltOutlined style={{ fontSize: 10 }} />} label="Online" size="small"
                  sx={{ bgcolor: 'rgba(76,175,80,0.85)', color: '#fff', fontSize: '0.65rem', height: 18, '& .MuiChip-icon': { color: '#fff' } }} />
              </Stack>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.72rem' }}>
                Trợ lý phân tích chiến lược giao dịch
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={0.5}>
            <Tooltip title="Lịch sử trò chuyện">
              <IconButton size="small" onClick={() => setHistoryOpen(true)} sx={{ color: 'rgba(255,255,255,0.75)', '&:hover': { bgcolor: 'rgba(255,255,255,0.12)' } }}>
                <HistoryOutlined style={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Làm mới">
              <IconButton size="small" onClick={handleReset} sx={{ color: 'rgba(255,255,255,0.75)', '&:hover': { bgcolor: 'rgba(255,255,255,0.12)' } }}>
                <ReloadOutlined style={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Đóng">
              <IconButton size="small" onClick={() => setOpen(false)} sx={{ color: 'rgba(255,255,255,0.75)', '&:hover': { bgcolor: 'rgba(255,255,255,0.12)' } }}>
                <CloseOutlined style={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>

        {/* Body: sidebar + chat */}
        <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Sidebar */}
          <ChatSidebar
            open={historyOpen}
            sessions={sessions}
            activeId={activeId}
            onSelect={(id) => { setActiveId(id); setInput(''); setImagePreview(null); setTyping(false); }}
            onNew={handleNewSession}
            onDelete={handleDeleteSession}
            onRename={handleRenameSession}
          />

          {/* Chat panel */}
          <Box sx={(theme) => ({ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: theme.palette.mode === 'dark' ? theme.palette.background.default : 'grey.50' })}>

            {/* Messages */}
            <DialogContent sx={{
              flex: 1, overflowY: 'auto', px: 3, py: 2.5,
              '&::-webkit-scrollbar': { width: 5 },
              '&::-webkit-scrollbar-thumb': { bgcolor: 'grey.300', borderRadius: 3 }
            }}>
              {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
              {typing && <TypingIndicator />}
              <div ref={bottomRef} />
            </DialogContent>

            {/* Input area */}
            <Paper elevation={0} sx={{ px: 3, pt: 1.5, pb: 2, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', flexShrink: 0 }}>

              {/* Image preview strip */}
              {imagePreview && (
                <Box sx={{ mb: 1.2, position: 'relative', display: 'inline-block' }}>
                  <Box component="img" src={imagePreview} alt="preview"
                    sx={{ height: 72, borderRadius: 1.5, border: '1px solid', borderColor: 'divider', objectFit: 'cover' }} />
                  <IconButton size="small" onClick={() => setImagePreview(null)}
                    sx={{ position: 'absolute', top: -8, right: -8, bgcolor: 'grey.700', color: '#fff', width: 18, height: 18,
                      '&:hover': { bgcolor: 'grey.900' } }}>
                    <CloseOutlined style={{ fontSize: 10 }} />
                  </IconButton>
                </Box>
              )}

              {/* Textarea */}
              <TextField fullWidth multiline maxRows={5}
                placeholder="Nhập câu hỏi của bạn... (Enter gửi, Shift+Enter xuống dòng)"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                variant="outlined" size="small"
                sx={(theme) => ({
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2.5,
                    bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'grey.50',
                    '& input, & textarea': { color: theme.palette.text.primary },
                    '&:hover fieldset': { borderColor: NAV_COLOR },
                    '&.Mui-focused fieldset': { borderColor: NAV_COLOR }
                  }
                })}
              />

              {/* Toolbar row */}
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 1.2 }}>
                {/* Left: model + image */}
                <Stack direction="row" alignItems="center" spacing={1}>
                  <ModelSelector model={model} models={availableModels} onChange={setModel} />
                  <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
                  <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleImageChange} />
                  <Tooltip title="Đính kèm ảnh">
                    <IconButton size="small" onClick={() => fileRef.current?.click()}
                      sx={{ color: imagePreview ? NAV_COLOR : 'text.secondary', bgcolor: imagePreview ? 'rgba(33,42,55,0.08)' : 'transparent',
                        border: '1px solid', borderColor: imagePreview ? NAV_COLOR : 'divider', borderRadius: 1.5, p: 0.6,
                        '&:hover': { bgcolor: 'rgba(33,42,55,0.08)', borderColor: NAV_COLOR } }}>
                      <PictureOutlined style={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                  {pageContext && (
                    <Tooltip title={`Đang có context từ trang ${pageContext.page}${pageContext.totalStrategies != null ? ` (${pageContext.totalStrategies} strategies)` : ''}`}>
                      <Chip
                        label={`📊 ${pageContext.page}`}
                        size="small"
                        onDelete={() => setPageContext(null)}
                        sx={(theme) => ({ height: 22, fontSize: '0.65rem', bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(33,42,55,0.08)', border: '1px solid', borderColor: NAV_COLOR, color: theme.palette.mode === 'dark' ? '#e2e8f0' : NAV_COLOR })}
                      />
                    </Tooltip>
                  )}
                </Stack>

                {/* Right: send */}
                <Tooltip title="Gửi (Enter)">
                  <span>
                    <IconButton onClick={() => sendMessage()} disabled={(!input.trim() && !imagePreview) || typing}
                      sx={(theme) => ({
                        bgcolor: NAV_COLOR, color: '#fff', width: 38, height: 38, borderRadius: 2,
                        '&:hover': { bgcolor: NAV_DARK },
                        '&.Mui-disabled': { bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'grey.200', color: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.3)' : 'grey.400' },
                        transition: 'all 0.2s'
                      })}>
                      <SendOutlined style={{ fontSize: 16 }} />
                    </IconButton>
                  </span>
                </Tooltip>
              </Stack>
            </Paper>
          </Box>
        </Box>
      </Dialog>
    </>
  );
}
