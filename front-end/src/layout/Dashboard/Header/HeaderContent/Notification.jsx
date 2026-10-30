import { useEffect, useRef, useState, useCallback } from 'react';

// material-ui
import useMediaQuery from '@mui/material/useMediaQuery';
import Avatar from '@mui/material/Avatar';
import Badge from '@mui/material/Badge';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Popper from '@mui/material/Popper';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Switch from '@mui/material/Switch';

// project imports
import MainCard from 'components/MainCard';
import IconButton from 'components/@extended/IconButton';
import Transitions from 'components/@extended/Transitions';

// api
import {
  getNotifications,
  getUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  deleteAllNotifications,
  getNotificationPreference,
  updateNotificationPreference,
} from 'api/notification';

// assets
import BellOutlined from '@ant-design/icons/BellOutlined';
import CheckCircleOutlined from '@ant-design/icons/CheckCircleOutlined';
import SyncOutlined from '@ant-design/icons/SyncOutlined';
import DatabaseOutlined from '@ant-design/icons/DatabaseOutlined';
import InfoCircleOutlined from '@ant-design/icons/InfoCircleOutlined';
import WarningOutlined from '@ant-design/icons/WarningOutlined';
import CloseCircleOutlined from '@ant-design/icons/CloseCircleOutlined';
import DeleteOutlined from '@ant-design/icons/DeleteOutlined';

// dayjs
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

// sx styles
const avatarSX = {
  width: 36,
  height: 36,
  fontSize: '1rem',
};

const actionSX = {
  mt: '6px',
  ml: 1,
  top: 'auto',
  right: 'auto',
  alignSelf: 'flex-start',
  transform: 'none',
};

function formatTimeAgo(dateString) {
  if (!dateString) return '';
  return dayjs(dateString).fromNow();
}

function getNotificationIcon(severity, eventType) {
  if (severity === 'success') {
    return {
      icon: <CheckCircleOutlined />,
      color: 'success.main',
      bgcolor: 'success.lighter',
    };
  }
  if (severity === 'error') {
    return {
      icon: <CloseCircleOutlined />,
      color: 'error.main',
      bgcolor: 'error.lighter',
    };
  }
  if (severity === 'warning') {
    return {
      icon: <WarningOutlined />,
      color: 'warning.main',
      bgcolor: 'warning.lighter',
    };
  }

  if (eventType?.includes('SYNC')) {
    return {
      icon: <SyncOutlined />,
      color: 'primary.main',
      bgcolor: 'primary.lighter',
    };
  }

  if (eventType?.includes('TABLE') || eventType?.includes('STRATEGY')) {
    return {
      icon: <DatabaseOutlined />,
      color: 'info.main',
      bgcolor: 'info.lighter',
    };
  }

  return {
    icon: <InfoCircleOutlined />,
    color: 'info.main',
    bgcolor: 'info.lighter',
  };
}

// ==============================|| HEADER CONTENT - NOTIFICATION ||============================== //

export default function Notification() {
  const downMD = useMediaQuery((theme) => theme.breakpoints.down('md'));

  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [preferenceLoading, setPreferenceLoading] = useState(true);

  const fetchNotificationData = useCallback(async () => {
    try {
      const [notifRes, countRes] = await Promise.all([
        getNotifications({ limit: 30, unreadOnly: false }),
        getUnreadCount(),
      ]);

      if (notifRes?.notifications) {
        setNotifications(notifRes.notifications);
      }
      if (countRes?.unread_count !== undefined) {
        setUnreadCount(countRes.unread_count);
      }
    } catch (err) {
      console.warn('[NOTIFICATION HEADER] Failed to load notifications:', err.message);
    }
  }, []);

  useEffect(() => {
    let active = true;
    getNotificationPreference()
      .then((result) => {
        if (active) setNotificationsEnabled(result?.enabled === true);
      })
      .catch((err) => console.warn('[NOTIFICATION HEADER] Failed to load preference:', err.message))
      .finally(() => {
        if (active) setPreferenceLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (preferenceLoading) return undefined;
    if (!notificationsEnabled) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return undefined;
    }

    fetchNotificationData();

    const interval = setInterval(() => {
      fetchNotificationData();
    }, 30000);

    const handleFocus = () => {
      fetchNotificationData();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchNotificationData, notificationsEnabled, preferenceLoading]);

  const handleToggle = () => {
    setOpen((prevOpen) => {
      const nextOpen = !prevOpen;
      if (nextOpen && notificationsEnabled) {
        setLoading(true);
        fetchNotificationData().finally(() => setLoading(false));
      }
      return nextOpen;
    });
  };

  const handlePreferenceChange = async (event) => {
    event.stopPropagation();
    const enabled = event.target.checked;
    setNotificationsEnabled(enabled);

    if (!enabled) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
    }

    try {
      await updateNotificationPreference(enabled);
      if (enabled) {
        setLoading(true);
        await fetchNotificationData();
        setLoading(false);
      }
    } catch (err) {
      setNotificationsEnabled(!enabled);
      console.error('[NOTIFICATION] Failed to update preference:', err);
      if (!enabled) await fetchNotificationData();
    }
  };

  const handleClose = (event) => {
    if (anchorRef.current && anchorRef.current.contains(event.target)) {
      return;
    }
    setOpen(false);
  };

  const handleItemClick = async (item) => {
    const isUnread = String(item.status || '').toLowerCase() === 'unread';
    if (isUnread) {
      try {
        const result = await markNotificationAsRead(item.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, status: 'read', readAt: new Date().toISOString() } : n))
        );
        setUnreadCount(Number.isFinite(Number(result?.unread_count)) ? Number(result.unread_count) : (prev) => Math.max(0, prev - 1));
        await fetchNotificationData();
      } catch (err) {
        console.error('[NOTIFICATION] Failed to mark read:', err);
      }
    }

    // Notification inbox only marks the item as read.
    // It intentionally does not navigate to another screen.
    setOpen(false);
  };

  const handleMarkAllRead = async () => {
    try {
      const result = await markAllNotificationsAsRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, status: 'read', readAt: new Date().toISOString() }))
      );
      setUnreadCount(Number.isFinite(Number(result?.unread_count)) ? Number(result.unread_count) : 0);
      await fetchNotificationData();
    } catch (err) {
      console.error('[NOTIFICATION] Failed to mark all read:', err);
    }
  };

  const handleDelete = async (event, item) => {
    event.stopPropagation();
    try {
      await deleteNotification(item.id);
      setNotifications((prev) => prev.filter((notification) => notification.id !== item.id));
      if (String(item.status || '').toLowerCase() === 'unread') {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('[NOTIFICATION] Failed to delete notification:', err);
    }
  };

  const handleDeleteAll = async () => {
    try {
      await deleteAllNotifications();
      setNotifications([]);
      setUnreadCount(0);
    } catch (err) {
      console.error('[NOTIFICATION] Failed to delete all notifications:', err);
    }
  };

  return (
    <Box sx={{ flexShrink: 0, ml: 0.75 }}>
      <IconButton
        color="secondary"
        variant="light"
        sx={(theme) => ({
          color: 'text.primary',
          bgcolor: open ? 'grey.100' : 'transparent',
          ...theme.applyStyles('dark', { bgcolor: open ? 'background.default' : 'transparent' }),
        })}
        aria-label="open notifications"
        ref={anchorRef}
        aria-controls={open ? 'notification-grow' : undefined}
        aria-haspopup="true"
        onClick={handleToggle}
      >
        <Badge
          badgeContent={notificationsEnabled && unreadCount > 99 ? '99+' : notificationsEnabled ? unreadCount : 0}
          color="primary"
        >
          <BellOutlined style={{ opacity: notificationsEnabled ? 1 : 0.45 }} />
        </Badge>
      </IconButton>
      <Popper
        placement={downMD ? 'bottom' : 'bottom-end'}
        open={open}
        anchorEl={anchorRef.current}
        role={undefined}
        transition
        disablePortal
        popperOptions={{ modifiers: [{ name: 'offset', options: { offset: [downMD ? -5 : 0, 9] } }] }}
      >
        {({ TransitionProps }) => (
          <Transitions type="grow" position={downMD ? 'top' : 'top-right'} in={open} {...TransitionProps}>
            <Paper
              sx={(theme) => ({
                boxShadow: theme.customShadows.z1,
                width: '100%',
                minWidth: 285,
                maxWidth: { xs: 320, md: 420 },
                bgcolor: 'background.paper',
                ...theme.applyStyles('dark', { bgcolor: 'background.paper' }),
              })}
            >
              <ClickAwayListener onClickAway={handleClose}>
                <MainCard
                  title="Thông báo"
                  elevation={0}
                  border={false}
                  content={false}
                  secondary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      {notificationsEnabled && unreadCount > 0 && (
                        <Tooltip title="Đánh dấu tất cả là đã đọc">
                          <IconButton color="success" size="small" onClick={handleMarkAllRead}>
                            <CheckCircleOutlined style={{ fontSize: '1.15rem' }} />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title={notificationsEnabled ? 'Tắt thông báo' : 'Bật thông báo'}>
                        <Switch
                          size="small"
                          checked={notificationsEnabled}
                          disabled={preferenceLoading}
                          onChange={handlePreferenceChange}
                          inputProps={{ 'aria-label': 'Bật tắt thông báo' }}
                        />
                      </Tooltip>
                    </Box>
                  }
                >
                  {!notificationsEnabled ? (
                    <Box sx={{ p: 3, textAlign: 'center' }}>
                      <BellOutlined style={{ fontSize: '1.5rem', opacity: 0.45 }} />
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Thông báo đang tắt
                      </Typography>
                    </Box>
                  ) : loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                      <CircularProgress size={24} />
                    </Box>
                  ) : notifications.length === 0 ? (
                    <Box sx={{ p: 3, textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary">
                        Không có thông báo nào
                      </Typography>
                    </Box>
                  ) : (
                    <List
                      component="nav"
                      sx={(theme) => ({
                        p: 0,
                        maxHeight: 400,
                        overflowY: 'auto',
                        '& .MuiListItemButton-root': {
                          py: 1,
                          px: 2,
                          '&.Mui-selected': {
                            bgcolor: 'action.selected',
                            color: 'text.primary',
                            ...theme.applyStyles('dark', { bgcolor: 'background.default' }),
                          },
                          '&.Mui-selected:hover': {
                            bgcolor: 'action.hover',
                            ...theme.applyStyles('dark', { bgcolor: 'divider' }),
                          },
                        '& .MuiAvatar-root': avatarSX,
                          '& .MuiListItem-root': { pr: '16px !important' },
                          '& .MuiListItemSecondaryAction-root': { ...actionSX, position: 'absolute', right: 8 },
                        },
                      })}
                    >
                      {notifications.map((item) => {
                        const iconConfig = getNotificationIcon(item.severity, item.eventType);
                        const isUnread = item.status === 'unread';

                        return (
                          <ListItem
                            key={item.id}
                            component={ListItemButton}
                            divider
                            selected={isUnread}
                            onClick={() => handleItemClick(item)}
                            secondaryAction={
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 1 }}>
                                <Typography variant="caption" color="text.secondary" noWrap>
                                  {formatTimeAgo(item.createdAt)}
                                </Typography>
                                <Tooltip title="Xóa thông báo">
                                  <IconButton
                                    size="small"
                                    color="error"
                                    aria-label="Xóa thông báo"
                                    onClick={(event) => handleDelete(event, item)}
                                  >
                                    <DeleteOutlined style={{ fontSize: '0.95rem' }} />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            }
                          >
                            <ListItemAvatar>
                              <Avatar sx={{ color: iconConfig.color, bgcolor: iconConfig.bgcolor }}>
                                {iconConfig.icon}
                              </Avatar>
                            </ListItemAvatar>
                            <ListItemText
                              sx={{ minWidth: 0, mr: 1 }}
                              primary={
                                <Typography
                                  variant="subtitle2"
                                  sx={{ fontWeight: isUnread ? 600 : 400, color: 'text.primary' }}
                                >
                                  {item.title}
                                </Typography>
                              }
                              secondary={
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  sx={{
                                    display: 'block',
                                    whiteSpace: 'normal',
                                    overflowWrap: 'anywhere',
                                    wordBreak: 'break-word',
                                    mt: 0.25,
                                  }}
                                >
                                  {item.message}
                                </Typography>
                              }
                            />
                          </ListItem>
                        );
                      })}
                      <Divider />
                      <Box sx={{
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'stretch',
                        gap: 1,
                        p: 1,
                        '& > .MuiListItemButton-root': { flex: 1, justifyContent: 'center' },
                      }}>
                      <ListItemButton
                        onClick={handleDeleteAll}
                        sx={{ textAlign: 'center', py: `${6}px !important`, color: 'error.main' }}
                      >
                        <ListItemText
                          primary={
                            <Typography variant="body2" color="error.main">
                              Xóa tất cả thông báo
                            </Typography>
                          }
                        />
                      </ListItemButton>
                      <ListItemButton
                        onClick={() => {
                          setOpen(false);
                        }}
                        sx={{ textAlign: 'center', py: `${10}px !important` }}
                      >
                        <ListItemText
                          primary={
                            <Typography variant="h6" color="primary">
                              Đóng thông báo
                            </Typography>
                          }
                        />
                      </ListItemButton>
                      </Box>
                    </List>
                  )}
                </MainCard>
              </ClickAwayListener>
            </Paper>
          </Transitions>
        )}
      </Popper>
    </Box>
  );
}
