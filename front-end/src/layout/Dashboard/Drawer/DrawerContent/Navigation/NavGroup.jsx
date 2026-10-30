import PropTypes from 'prop-types';
import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
// material-ui
import List from '@mui/material/List';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import ExpandLess from '@ant-design/icons/UpOutlined';
import ExpandMore from '@ant-design/icons/DownOutlined';

// project import
import NavItem from './NavItem';
import { useGetMenuMaster } from 'api/menu';

// ==============================|| NAVIGATION - LIST GROUP ||============================== //

export default function NavGroup({ item }) {
  const { menuMaster } = useGetMenuMaster();
  const drawerOpen = menuMaster.isDashboardDrawerOpened;
  const { pathname } = useLocation();
  const [openById, setOpenById] = useState({});

  const isCollapseActive = (menuItem) =>
    !!menuItem.children?.some((child) => child.url && pathname.startsWith(child.url));

  const getCollapseOpen = (menuItem) => {
    if (Object.prototype.hasOwnProperty.call(openById, menuItem.id)) {
      return openById[menuItem.id];
    }
    // Dashboard luôn mở rộng mặc định
    if (menuItem.id === 'group-dashboard' || menuItem.id === 'dashboard') {
      return true;
    }
    return isCollapseActive(menuItem);
  };

  const parentTextColor = '#FFFFFF';
  const tooltipSlotProps = {
    popper: {
      sx: {
        '& .MuiTooltip-tooltip': {
          bgcolor: '#132238',
          color: '#fff',
          fontSize: '0.75rem',
          fontWeight: 600,
          borderRadius: 1,
          px: 1
        }
      }
    }
  };

  const isAdmin = useMemo(() => {
    try {
      const stored = localStorage.getItem('user');
      const parsed = stored ? JSON.parse(stored) : null;
      const role = String(parsed?.role || '').toLowerCase();
      const roles = Array.isArray(parsed?.roles) ? parsed.roles.map((item) => String(item).toLowerCase()) : [];
      return role === 'admin' || roles.some((item) => item.includes('admin'));
    } catch {
      return false;
    }
  }, []);

  const filteredChildren = useMemo(() => {
    return (item.children || []).filter((menuItem) => {
      const isItemAdminOnly =
        menuItem.adminOnly ||
        menuItem.url === '/account-provisioning' ||
        menuItem.id === 'register1' ||
        String(menuItem.title).toLowerCase() === 'admin';
      if (isItemAdminOnly && !isAdmin) return false;
      return true;
    });
  }, [item.children, isAdmin]);

  const navCollapse = useMemo(
    () =>
      filteredChildren.map((menuItem) => {
        switch (menuItem.type) {
          case 'collapse': {
            const Icon = menuItem.icon;
            const isOpen = getCollapseOpen(menuItem);
            const isActive = isCollapseActive(menuItem);
            const isSubGroup = true;
            const subChildren = (menuItem.children || []).filter((child) => {
              const isChildAdminOnly =
                child.adminOnly ||
                child.url === '/account-provisioning' ||
                child.id === 'register1' ||
                String(child.title).toLowerCase() === 'admin';
              if (isChildAdminOnly && !isAdmin) return false;
              return true;
            });

            const collapseButton = (
              <ListItemButton
                onClick={() => setOpenById((prev) => ({ ...prev, [menuItem.id]: !prev[menuItem.id] }))}
                sx={{
                  pl: drawerOpen ? '28px' : 1.5,
                  py: !drawerOpen ? 1.25 : 1,
                  color: parentTextColor,
                  '&:hover': {
                    bgcolor: (theme) =>
                      theme.palette.mode === 'light' && isSubGroup
                        ? 'rgba(99,179,237,0.22)'
                        : theme.palette.mode === 'dark'
                          ? 'rgba(148,210,255,0.08)'
                          : 'rgba(255,255,255,0.1)'
                  },
                  ...(isActive && {
                    bgcolor: (theme) =>
                      theme.palette.mode === 'light' && isSubGroup
                        ? 'rgba(99,179,237,0.20)'
                        : theme.palette.mode === 'dark'
                          ? 'rgba(148,210,255,0.13)'
                          : 'rgba(255,255,255,0.15)',
                    borderRight: '3px solid',
                    borderColor: (theme) => (theme.palette.mode === 'light' && isSubGroup ? '#63b3ed' : theme.palette.mode === 'dark' ? '#63b3ed' : '#212A37')
                  })
                }}
              >
                {Icon && (
                  <ListItemIcon sx={{ minWidth: 28, color: parentTextColor }}>
                    <Icon style={{ fontSize: drawerOpen ? '1rem' : '1.25rem' }} />
                  </ListItemIcon>
                )}
                {drawerOpen && <ListItemText primary={<Typography variant="h6">{menuItem.title}</Typography>} />}
                {drawerOpen && (isOpen ? <ExpandLess style={{ fontSize: 12 }} /> : <ExpandMore style={{ fontSize: 12 }} />)}
              </ListItemButton>
            );

            return (
              <Box key={menuItem.id}>
                {drawerOpen ? (
                  collapseButton
                ) : (
                  <Tooltip title={menuItem.title || ''} placement="right" arrow slotProps={tooltipSlotProps}>
                    {collapseButton}
                  </Tooltip>
                )}
                <Collapse in={drawerOpen && isOpen} timeout="auto" unmountOnExit>
                  <List disablePadding>
                    {subChildren.map((child) => (
                      <NavItem key={child.id} item={{ ...child, level: child.level || 2 }} level={child.level || 2} />
                    ))}
                  </List>
                </Collapse>
              </Box>
            );
          }
          case 'item':
            return <NavItem key={menuItem.id} item={menuItem} level={menuItem.level || 1} />;
          default:
            return <div key={menuItem.id}></div>;
        }
      }),
    [filteredChildren, openById, drawerOpen, pathname, isAdmin]
  );

  if (filteredChildren.length === 0) {
    return null;
  }

  return (
    <List
      subheader={
        item.title &&
        drawerOpen && (
          <Box sx={{ pl: 3, mb: 1.5 }}>
            <Typography variant="subtitle2" color="textSecondary">
              {item.title}
            </Typography>
            {/* only available in paid version */}
          </Box>
        )
      }
      sx={{ mb: drawerOpen ? 1.5 : 0, py: 0, zIndex: 0 }}
    >
      {navCollapse}
    </List>
  );
}

NavGroup.propTypes = { item: PropTypes.object };
