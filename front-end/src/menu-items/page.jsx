// assets
import { ProfileOutlined, NumberOutlined, LineChartOutlined } from '@ant-design/icons';

// icons
const icons = {
  ProfileOutlined,
  NumberOutlined,
  LineChartOutlined
};

// ==============================|| MENU ITEMS - EXTRA PAGES ||============================== //

const pages = {
  id: 'authentication',
  title: 'Menu Items',
  type: 'group',
  children: [
    {
      id: 'news',
      title: 'Market Watch',
      type: 'item',
      url: '/news',
      icon: icons.LineChartOutlined
    },
    {
      id: 'get-strategy-id',
      title: 'Check Strategies',
      type: 'item',
      url: '/get-strategy-id',
      icon: icons.NumberOutlined
    },
    {
      id: 'register1',
      title: 'Admin',
      type: 'item',
      url: '/account-provisioning',
      icon: icons.ProfileOutlined,
      adminOnly: true
    }
  ]
};

export default pages;
