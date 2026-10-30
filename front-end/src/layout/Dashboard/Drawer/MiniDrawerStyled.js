// material-ui
import { styled } from '@mui/material/styles';
import Drawer from '@mui/material/Drawer';

// project imports
import { DRAWER_WIDTH } from 'config';

const openedMixin = (theme) => ({
  width: DRAWER_WIDTH,
  borderRight: '1px solid',
  borderRightColor: theme.palette.mode === 'dark' ? 'rgba(99,179,237,0.12)' : theme.palette.divider,
  backgroundColor: '#212A37',

  transition: theme.transitions.create('width', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.enteringScreen
  }),

  overflowX: 'hidden',
  boxShadow: 'none',
  ...theme.applyStyles('dark', {
    backgroundColor: '#0d1f35',
    boxShadow: '4px 0 16px rgba(0,0,0,0.4)'
  })
});

const closedMixin = (theme) => ({
  transition: theme.transitions.create('width', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen
  }),

  overflowX: 'hidden',
  width: theme.spacing(7.5),
  borderRight: '1px solid',
  borderRightColor: theme.palette.mode === 'dark' ? 'rgba(99,179,237,0.10)' : 'transparent',
  boxShadow: theme.customShadows.z1,
  backgroundColor: '#212A37',
  ...theme.applyStyles('dark', {
    backgroundColor: '#0d1f35',
    boxShadow: '4px 0 16px rgba(0,0,0,0.4)'
  })
});

// ==============================|| DRAWER - MINI STYLED ||============================== //

const MiniDrawerStyled = styled(Drawer, { shouldForwardProp: (prop) => prop !== 'open' })(({ theme }) => ({
  width: DRAWER_WIDTH,
  flexShrink: 0,
  whiteSpace: 'nowrap',
  boxSizing: 'border-box',
  variants: [
    {
      props: ({ open }) => open,
      style: { ...openedMixin(theme), '& .MuiDrawer-paper': openedMixin(theme) }
    },
    {
      props: ({ open }) => !open,
      style: { ...closedMixin(theme), '& .MuiDrawer-paper': closedMixin(theme) }
    }
  ]
}));

export default MiniDrawerStyled;
