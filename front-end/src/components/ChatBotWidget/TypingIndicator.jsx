import { memo } from 'react';
import { Box, Stack, Avatar } from '@mui/material';
import RobotOutlined from '@ant-design/icons/RobotOutlined';

const NAV_COLOR = '#2E3D52';

const TypingIndicator = memo(() => (
  <Stack direction="row" spacing={1.5} alignItems="flex-end" sx={{ mb: 2 }}>
    <Avatar sx={{ width: 32, height: 32, bgcolor: NAV_COLOR }}>
      <RobotOutlined style={{ fontSize: 16 }} />
    </Avatar>
    <Box sx={{ px: 2, py: 1.5, borderRadius: '4px 16px 16px 16px', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 0.6 }}>
      {[0, 1, 2].map((i) => (
        <Box key={i} sx={{
          width: 6, height: 6, borderRadius: '50%', bgcolor: NAV_COLOR, opacity: 0.7,
          animation: 'bounce 1.2s infinite', animationDelay: `${i * 0.2}s`,
          '@keyframes bounce': { '0%,80%,100%': { transform: 'translateY(0)' }, '40%': { transform: 'translateY(-5px)' } }
        }} />
      ))}
    </Box>
  </Stack>
));

export default TypingIndicator;
