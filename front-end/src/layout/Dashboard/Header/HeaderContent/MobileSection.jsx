import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

// material-ui
import CardContent from '@mui/material/CardContent';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Popper from '@mui/material/Popper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

// project imports
import Avatar from 'components/@extended/Avatar';
import IconButton from 'components/@extended/IconButton';
import Transitions from 'components/@extended/Transitions';

// assets
import MoreOutlined from '@ant-design/icons/MoreOutlined';
import LogoutOutlined from '@ant-design/icons/LogoutOutlined';
import UserOutlined from '@ant-design/icons/UserOutlined';
import KeyOutlined from '@ant-design/icons/KeyOutlined';
import userAvatar from 'assets/images/users/meo.png';

// ==============================|| HEADER CONTENT - MOBILE ||============================== //

export default function MobileSection() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState('User');
  const anchorRef = useRef(null);

  useEffect(() => {
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        setUsername(user.username || user.email || 'User');
      }
    } catch (error) {
      console.error('Error parsing user data:', error);
    }
  }, []);

  const handleToggle = () => {
    setOpen((prevOpen) => !prevOpen);
  };

  const handleClose = (event) => {
    if (anchorRef.current && anchorRef.current.contains(event.target)) {
      return;
    }

    setOpen(false);
  };

  const handleViewProfile = () => {
    setOpen(false);
    navigate('/profile');
  };

  const handleApiKeys = () => {
    setOpen(false);
    navigate('/api-keys');
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    setOpen(false);
    navigate('/login');
  };

  const prevOpen = useRef(open);
  useEffect(() => {
    if (prevOpen.current === true && open === false) {
      anchorRef.current.focus();
    }

    prevOpen.current = open;
  }, [open]);

  return (
    <>
      <Box sx={{ flexShrink: 0, ml: 0.75 }}>
        <IconButton
          sx={(theme) => ({
            color: 'text.primary',
            bgcolor: open ? 'grey.300' : 'grey.100',
            ...theme.applyStyles('dark', { bgcolor: open ? 'grey.200' : 'background.default' })
          })}
          aria-label="open more menu"
          ref={anchorRef}
          aria-controls={open ? 'menu-list-grow' : undefined}
          aria-haspopup="true"
          onClick={handleToggle}
          color="secondary"
          variant="light"
        >
          <MoreOutlined />
        </IconButton>
      </Box>
      <Popper
        placement="bottom-end"
        open={open}
        anchorEl={anchorRef.current}
        role={undefined}
        transition
        disablePortal
        sx={{ zIndex: 1200 }}
        popperOptions={{
          modifiers: [
            {
              name: 'offset',
              options: {
                offset: [0, 9]
              }
            }
          ]
        }}
      >
        {({ TransitionProps }) => (
          <Transitions type="fade" in={open} {...TransitionProps}>
            <Paper sx={(theme) => ({ boxShadow: theme.customShadows.z1, width: 280, maxWidth: 'calc(100vw - 24px)' })}>
              <ClickAwayListener onClickAway={handleClose}>
                <Box sx={{ width: '100%' }}>
                  <CardContent sx={{ px: 2, py: 1.5 }}>
                    <Stack direction="row" sx={{ gap: 1.25, alignItems: 'center' }}>
                      <Avatar alt="profile user" src={userAvatar} sx={{ width: 40, height: 40 }} />
                      <Stack sx={{ minWidth: 0 }}>
                        <Typography variant="h6" noWrap>
                          {username}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Trader
                        </Typography>
                      </Stack>
                    </Stack>
                  </CardContent>
                  <Divider />
                  <List component="nav" sx={{ py: 0, '& .MuiListItemIcon-root': { minWidth: 32 } }}>
                    <ListItemButton onClick={handleViewProfile}>
                      <ListItemIcon>
                        <UserOutlined />
                      </ListItemIcon>
                      <ListItemText primary="View Profile" />
                    </ListItemButton>
                    <ListItemButton onClick={handleApiKeys}>
                      <ListItemIcon>
                        <KeyOutlined />
                      </ListItemIcon>
                      <ListItemText primary="API Keys" />
                    </ListItemButton>
                    <ListItemButton onClick={handleLogout}>
                      <ListItemIcon>
                        <LogoutOutlined />
                      </ListItemIcon>
                      <ListItemText primary="Logout" />
                    </ListItemButton>
                  </List>
                </Box>
              </ClickAwayListener>
            </Paper>
          </Transitions>
        )}
      </Popper>
    </>
  );
}
