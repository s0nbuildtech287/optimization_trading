import { useState, memo } from 'react';
import { Box, Stack, Tooltip, IconButton, Menu, MenuItem, Badge, Typography } from '@mui/material';
import ThunderboltOutlined from '@ant-design/icons/ThunderboltOutlined';
import DownOutlined from '@ant-design/icons/DownOutlined';
import CheckOutlined from '@ant-design/icons/CheckOutlined';

const FALLBACK_MODELS = [
  { id: 'gpt-4o',        label: 'GPT-4o',         badge: 'Smart' },
  { id: 'gpt-4o-mini',   label: 'GPT-4o Mini',    badge: 'Fast'  },
];

const ModelSelector = memo(({ model, models, onChange }) => {
  const [anchor, setAnchor] = useState(null);
  const safeModels = models?.length ? models : FALLBACK_MODELS;
  const current = safeModels.find((m) => m.id === model) || safeModels[0];
  return (
    <Box>
      <Tooltip title="Chọn mô hình AI">
        <Stack
          direction="row" alignItems="center" spacing={0.6}
          onClick={(e) => setAnchor(e.currentTarget)}
          sx={{
            cursor: 'pointer',
            px: 1.5, py: 0.8,
            borderRadius: 1.5,
            border: '1px solid',
            borderColor: 'divider',
            transition: 'all 0.2s',
            bgcolor: anchor ? 'rgba(0,0,0,0.03)' : 'transparent',
            '&:hover': { bgcolor: 'rgba(0,0,0,0.03)', borderColor: 'text.secondary' }
          }}
        >
          <ThunderboltOutlined style={{ fontSize: 13, color: '#fadb14' }} />
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', fontSize: '0.72rem' }}>
            {current?.label || model}
          </Typography>
          <DownOutlined style={{ fontSize: 9, opacity: 0.6 }} />
        </Stack>
      </Tooltip>

      <Menu
        anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { mt: 0.5, borderRadius: 2, boxShadow: '0 4px 16px rgba(0,0,0,0.1)' } } }}
      >
        {safeModels.map((m) => (
          <MenuItem
            key={m.id} selected={m.id === model}
            onClick={() => { onChange(m.id); setAnchor(null); }}
            sx={{ px: 2, py: 1.2, gap: 1.5, minWidth: 160 }}
          >
            <Stack direction="row" alignItems="center" spacing={1} sx={{ flex: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: m.id === model ? 600 : 400 }}>
                {m.label}
              </Typography>
              {m.badge && (
                <Badge
                  badgeContent={m.badge}
                  color={m.badge === 'Smart' ? 'primary' : 'secondary'}
                  sx={{ '& .MuiBadge-badge': { fontSize: '0.6rem', height: 16, px: 0.6, position: 'static', transform: 'none' } }}
                />
              )}
            </Stack>
            {m.id === model && <CheckOutlined style={{ fontSize: 11, color: 'green' }} />}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
});

export default ModelSelector;
export { FALLBACK_MODELS };
