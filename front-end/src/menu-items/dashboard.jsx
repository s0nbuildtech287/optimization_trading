// assets
import { BarChartOutlined, DashboardOutlined, TableOutlined, FormOutlined, ExperimentOutlined, LineChartOutlined, TrophyOutlined, AppstoreOutlined, SettingOutlined, FileTextOutlined, ControlOutlined, ToolOutlined, KeyOutlined } from '@ant-design/icons';

// icons
const icons = {
  DashboardOutlined,
  BarChartOutlined,
  TableOutlined,
  FormOutlined,
  ExperimentOutlined,
  LineChartOutlined,
  TrophyOutlined,
  AppstoreOutlined,
  SettingOutlined,
  FileTextOutlined,
  ControlOutlined,
  ToolOutlined,
  KeyOutlined
};

// ==============================|| MENU ITEMS - DASHBOARD ||============================== //

const dashboard = {
  id: 'group-dashboard',
  title: 'Navigation',
  type: 'group',
  children: [
    {
      id: 'dashboard',
      title: 'Dashboard',
      type: 'collapse',
      icon: icons.AppstoreOutlined,
      breadcrumbs: false,
      children: [
        {
          id: 'dashboard-overview',
          title: 'Overview',
          type: 'item',
          url: '/dashboard/overview',
          icon: icons.DashboardOutlined,
          breadcrumbs: false
        },
        {
          id: 'dashboard-risk-analysis',
          title: 'Risk Analysis',
          type: 'item',
          url: '/dashboard/risk-analysis',
          icon: icons.ExperimentOutlined,
          breadcrumbs: false
        },
        {
          id: 'dashboard-behavior-analysis',
          title: 'Behavior Analysis',
          type: 'item',
          url: '/dashboard/behavior-analysis',
          icon: icons.LineChartOutlined,
          breadcrumbs: false
        },
        {
          id: 'dashboard-comparative-ranking',
          title: 'Comparative Ranking',
          type: 'item',
          url: '/dashboard/comparative-ranking',
          icon: icons.TrophyOutlined,
          breadcrumbs: false
        }
      ]
    },
    {
      id: 'order-list',
      title: 'Order List',
      type: 'item',
      url: '/order-list',
      icon: icons.BarChartOutlined,
      breadcrumbs: false
    },
    {
      id: 'backtest-tables',     // ← Thêm mục mới
      title: 'Backtest Tables',
      type: 'item',
      url: '/backtest-tables',
      icon: icons.TableOutlined,
      breadcrumbs: false
    },
    {
      id: 'strategy-input',
      title: 'Strategies',
      type: 'item',
      url: '/strategy-input',
      icon: icons.FormOutlined,
      breadcrumbs: false
    },
    {
      id: 'mt5-optimization',
      title: 'MT5 Optimization',
      type: 'collapse',
      icon: icons.SettingOutlined,
      breadcrumbs: false,
      children: [
        {
          id: 'mt5-setup-workers',
          title: 'Setup Workers',
          type: 'item',
          url: '/optimization/setup-workers',
          icon: icons.SettingOutlined,
          breadcrumbs: false
        },
        {
          id: 'mt5-ini-config',
          title: 'INI Config',
          type: 'item',
          url: '/optimization/ini-config',
          icon: icons.FileTextOutlined,
          breadcrumbs: false
        },
        {
          id: 'mt5-optimize',
          title: 'Optimize',
          type: 'item',
          url: '/optimization/optimize',
          icon: icons.ControlOutlined,
          breadcrumbs: false
        },
        {
          id: 'mt5-tpl-generator',
          title: 'TPL Generator',
          type: 'item',
          url: '/optimization/tpl-generator',
          icon: icons.ToolOutlined,
          breadcrumbs: false
        }
      ]
    }
  ]
};

export default dashboard;
