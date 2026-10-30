import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Box, Stack, Avatar, Typography, Fade } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import RobotOutlined from '@ant-design/icons/RobotOutlined';

const NAV_COLOR = '#2E3D52';

const MessageBubble = memo(({ msg }) => {
  const isBot = msg.role === 'bot';
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  return (
    <Fade in timeout={300}>
      <Stack
        direction="row" spacing={1.5} alignItems="flex-end"
        justifyContent={isBot ? 'flex-start' : 'flex-end'}
        sx={{ mb: 2 }}
      >
        {isBot && (
          <Avatar sx={{ width: 32, height: 32, bgcolor: NAV_COLOR, flexShrink: 0, boxShadow: '0 2px 8px rgba(33,42,55,0.4)' }}>
            <RobotOutlined style={{ fontSize: 16 }} />
          </Avatar>
        )}

        <Box sx={{ maxWidth: '72%' }}>
          {/* Image preview */}
          {msg.image && (
            <Box
              component="img"
              src={msg.image}
              alt="uploaded"
              sx={{ display: 'block', maxWidth: 220, maxHeight: 160, borderRadius: 2, mb: 0.5, objectFit: 'cover', border: '1px solid', borderColor: 'divider' }}
            />
          )}
          {msg.text && (
            <Box
              sx={{
                px: 2, py: 1.5,
                borderRadius: isBot ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
                bgcolor: isBot ? 'background.paper' : NAV_COLOR,
                color: isBot ? 'text.primary' : '#fff',
                boxShadow: isBot ? '0 2px 12px rgba(0,0,0,0.07)' : '0 2px 12px rgba(33,42,55,0.3)',
                border: isBot ? '1px solid' : 'none',
                borderColor: 'divider',
              }}
            >
              {isBot ? (
                <ReactMarkdown
                  components={{
                    p: ({ children }) => (
                      <Typography variant="body2" sx={{ lineHeight: 1.7, wordBreak: 'break-word', mb: 0.5, '&:last-child': { mb: 0 } }}>
                        {children}
                      </Typography>
                    ),
                    code: ({ node, className, children, ...props }) => {
                      const language = /language-(\w+)/.exec(className || '')?.[1] || 'text';
                      const isInline = !String(children).includes('\n') && !className;
                      return isInline ? (
                        <Box component="code" sx={{ bgcolor: isDark ? 'rgba(255,255,255,0.1)' : 'grey.100', color: isDark ? '#e2e8f0' : 'inherit', px: 0.6, py: 0.2, borderRadius: 1, fontSize: '0.8rem', fontFamily: 'monospace' }}>
                          {children}
                        </Box>
                      ) : (
                        <Box sx={{ my: 1, borderRadius: 2, overflow: 'hidden', fontSize: '0.78rem' }}>
                          <SyntaxHighlighter language={language} style={oneDark} customStyle={{ margin: 0, borderRadius: 8 }}>
                            {String(children).replace(/\n$/, '')}
                          </SyntaxHighlighter>
                        </Box>
                      );
                    },
                  }}
                >
                  {msg.text}
                </ReactMarkdown>
              ) : (
                <Typography variant="body2" sx={{ lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {msg.text}
                </Typography>
              )}
            </Box>
          )}
          <Typography variant="caption" sx={{ display: 'block', mt: 0.4, opacity: 0.45, fontSize: '0.65rem', textAlign: isBot ? 'left' : 'right', px: 0.5 }}>
            {msg.time.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
          </Typography>
        </Box>

        {!isBot && (
          <Avatar sx={{ width: 32, height: 32, bgcolor: 'grey.300', flexShrink: 0, color: 'text.primary', fontWeight: 700, fontSize: 13 }}>
            U
          </Avatar>
        )}
      </Stack>
    </Fade>
  );
});

export default MessageBubble;
