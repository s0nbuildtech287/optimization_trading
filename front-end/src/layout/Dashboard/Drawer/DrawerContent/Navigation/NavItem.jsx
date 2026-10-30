import PropTypes from 'prop-types';
import { Link, useLocation, matchPath } from 'react-router-dom';

// material-ui
import useMediaQuery from '@mui/material/useMediaQuery';
import Avatar from '@mui/material/Avatar';
import Chip from '@mui/material/Chip';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';

// project imports
import IconButton from 'components/@extended/IconButton';

import { handlerDrawerOpen, useGetMenuMaster } from 'api/menu';

// ==============================|| NAVIGATION - LIST ITEM ||============================== //

export default function NavItem({ item, level, isParents = false, setSelectedID }) {
  const { menuMaster } = useGetMenuMaster();
  const drawerOpen = menuMaster.isDashboardDrawerOpened;

  const downLG = useMediaQuery((theme) => theme.breakpoints.down('lg'));

  let itemTarget = '_self';
  if (item.target) {
    itemTarget = '_blank';
  }

  const itemHandler = () => {
    if (downLG) handlerDrawerOpen(false);

    if (isParents && setSelectedID) {
      setSelectedID(item.id);
    }
  };

  const Icon = item.icon;
  const itemIcon = item.icon ? (
    <Icon
      style={{
        fontSize: drawerOpen ? '1rem' : '1.25rem',
        ...(isParents && { fontSize: 20, stroke: '1.5' })
      }}
    />
  ) : (
    false
  );

  const { pathname } = useLocation();
  const isSelected = !!matchPath({ path: item?.link ? item.link : item.url, end: false }, pathname);

  const textColor = '#FFFFFF';
  const iconSelectedColor = '#FFFFFF';
  const showTooltip = !drawerOpen && level === 1;
  const tooltipTitle = item.title || '';
  const isSubItem = level > 1;
  const navButton = (
    <ListItemButton
      component={Link}
      to={item.url}
      target={itemTarget}
      disabled={item.disabled}
      selected={isSelected}
      sx={(theme) => ({
        zIndex: 1201,
        pl: drawerOpen ? `${level * 28}px` : 1.5,
        py: !drawerOpen && level === 1 ? 1.25 : 1,
        color: textColor,
        transition: 'all 0.3s ease',
        ...(drawerOpen && {
          '&:hover': {
            bgcolor:
              theme.palette.mode === 'light' && isSubItem
                ? 'rgba(99,179,237,0.22)'
                : theme.palette.mode === 'dark'
                  ? 'rgba(148,210,255,0.08)'
                  : 'rgba(255,255,255,0.1)',
            transform: 'translateX(4px)',
            color: '#FFFFFF'
          },
          '&:active': {
            bgcolor: theme.palette.mode === 'dark' ? 'rgba(148,210,255,0.12)' : 'rgba(255,255,255,0.15)',
            transform: 'translateX(2px)'
          },
          '&.Mui-selected': {
            bgcolor:
              theme.palette.mode === 'light' && isSubItem
                ? 'rgba(99,179,237,0.20)'
                : theme.palette.mode === 'dark'
                  ? 'rgba(148,210,255,0.13)'
                  : 'rgba(255,255,255,0.15)',
            borderRight: '3px solid',
            borderColor: theme.palette.mode === 'light' && isSubItem ? '#63b3ed' : theme.palette.mode === 'dark' ? '#63b3ed' : '#212A37',
            color: iconSelectedColor,
            '&:hover': {
              color: iconSelectedColor,
              bgcolor:
                theme.palette.mode === 'light' && isSubItem
                  ? 'rgba(99,179,237,0.28)'
                  : theme.palette.mode === 'dark'
                    ? 'rgba(148,210,255,0.18)'
                    : 'rgba(255,255,255,0.2)',
              transform: 'translateX(4px)'
            },
            '&:active': {
              bgcolor:
                theme.palette.mode === 'light' && isSubItem
                  ? 'rgba(99,179,237,0.32)'
                  : theme.palette.mode === 'dark'
                    ? 'rgba(148,210,255,0.22)'
                    : 'rgba(255,255,255,0.25)',
              transform: 'translateX(2px)'
            }
          }
        }),
        ...(!drawerOpen && {
          '&:hover': {
            bgcolor:
              theme.palette.mode === 'light' && isSubItem
                ? 'rgba(99,179,237,0.22)'
                : theme.palette.mode === 'dark'
                  ? 'rgba(148,210,255,0.08)'
                  : 'rgba(255,255,255,0.1)',
            color: '#FFFFFF'
          },
          '&:active': {
            bgcolor: theme.palette.mode === 'dark' ? 'rgba(148,210,255,0.12)' : 'rgba(255,255,255,0.15)'
          },
          '&.Mui-selected': {
            '&:hover': {
              bgcolor:
                theme.palette.mode === 'light' && isSubItem
                  ? 'rgba(99,179,237,0.28)'
                  : theme.palette.mode === 'dark'
                    ? 'rgba(148,210,255,0.13)'
                    : 'rgba(255,255,255,0.15)',
              color: '#FFFFFF'
            },
            bgcolor:
              theme.palette.mode === 'light' && isSubItem
                ? 'rgba(99,179,237,0.20)'
                : theme.palette.mode === 'dark'
                  ? 'rgba(148,210,255,0.10)'
                  : 'rgba(255,255,255,0.1)',
            color: '#FFFFFF'
          }
        })
      })}
      onClick={() => itemHandler()}
    >
      {itemIcon && (
        <ListItemIcon
          sx={(theme) => ({
            minWidth: 28,
            color: isSelected ? iconSelectedColor : textColor,
            ...(!drawerOpen && {
              borderRadius: 1.5,
              width: 36,
              height: 36,
              alignItems: 'center',
              justifyContent: 'center',
              '&:hover': {
                bgcolor: theme.palette.mode === 'light' && isSubItem ? 'rgba(99,179,237,0.28)' : 'rgba(255, 255, 255, 0.1)',
                color: '#FFFFFF'
              }
            }),
            ...(!drawerOpen &&
              isSelected && {
                bgcolor: theme.palette.mode === 'light' && isSubItem ? 'rgba(99,179,237,0.24)' : 'rgba(255, 255, 255, 0.15)',
                color: '#FFFFFF',
                '&:hover': {
                  bgcolor: theme.palette.mode === 'light' && isSubItem ? 'rgba(99,179,237,0.34)' : 'rgba(255, 255, 255, 0.2)',
                  color: '#FFFFFF'
                }
              })
          })}
        >
          {itemIcon}
        </ListItemIcon>
      )}
      {(drawerOpen || (!drawerOpen && level !== 1)) && (
        <ListItemText
          primary={
            <Typography variant="h6" sx={{ color: isSelected ? iconSelectedColor : textColor }}>
              {item.title}
            </Typography>
          }
        />
      )}
      {(drawerOpen || (!drawerOpen && level !== 1)) && item.chip && (
        <Chip
          color={item.chip.color}
          variant={item.chip.variant}
          size={item.chip.size}
          label={item.chip.label}
          avatar={item.chip.avatar && <Avatar>{item.chip.avatar}</Avatar>}
        />
      )}
    </ListItemButton>
  );

  return (
    <>
      <Box sx={{ position: 'relative' }}>
        {showTooltip ? (
          <Tooltip title={tooltipTitle} placement="right" arrow>
            {navButton}
          </Tooltip>
        ) : (
          navButton
        )}
        {(drawerOpen || (!drawerOpen && level !== 1)) &&
          item?.actions &&
          item?.actions.map((action, index) => {
            const ActionIcon = action.icon;
            const callAction = action?.function;
            return (
              <IconButton
                key={index}
                {...(action.type === 'function' && {
                  onClick: (event) => {
                    event.stopPropagation();
                    callAction();
                  }
                })}
                {...(action.type === 'link' && {
                  component: Link,
                  to: action.url,
                  target: action.target ? '_blank' : '_self'
                })}
                color="secondary"
                variant="outlined"
                sx={{
                  position: 'absolute',
                  top: 12,
                  right: 20,
                  zIndex: 1202,
                  width: 20,
                  height: 20,
                  mr: -1,
                  ml: 1,
                  color: 'secondary.dark',
                  borderColor: isSelected ? 'primary.light' : 'secondary.light',
                  '&:hover': { borderColor: isSelected ? 'primary.main' : 'secondary.main' }
                }}
              >
                <ActionIcon style={{ fontSize: '0.625rem' }} />
              </IconButton>
            );
          })}
      </Box>
    </>
  );
}

NavItem.propTypes = {
  item: PropTypes.any,
  level: PropTypes.number,
  isParents: PropTypes.bool,
  setSelectedID: PropTypes.oneOfType([PropTypes.any, PropTypes.func])
};
