import { lazy } from 'react';

// project imports
import Loadable from 'components/Loadable';
import DashboardLayout from 'layout/Dashboard';
import ProtectedRoute from './ProtectedRoute';

// render - Dashboard (layout with tabs)
const DashboardDefault = Loadable(lazy(() => import('pages/dashboard')));

// render - profile page
const ProfilePage = Loadable(lazy(() => import('pages/profile')));

// render - color
const Color = Loadable(lazy(() => import('pages/component-overview/color')));
const Typography = Loadable(lazy(() => import('pages/component-overview/typography')));
const Shadow = Loadable(lazy(() => import('pages/component-overview/shadows')));

// render - order list page
const OrderList = Loadable(lazy(() => import('pages/order-pages/order-list')));

// render - backtest tables page
const BacktestTablesPage = Loadable(lazy(() => import('pages/backtest-pages/backtest-tables')));

// render - strategy input page
const StrategyInput = Loadable(lazy(() => import('pages/strategy-input/strategy-input')));

// render - get strategy id page
const GetStrategyId = Loadable(lazy(() => import('pages/get-strategy-id/get-strategy')));

// render - news / market watch page
const NewsPage = Loadable(lazy(() => import('pages/news/news')));

// render - account provisioning page
const AccountProvisioning = Loadable(lazy(() => import('pages/account-provisioning')));

// render - API Keys page
const ApiKeysPage = Loadable(lazy(() => import('pages/api-keys')));

// render - MT5 Optimization shell
const Mt5Optimization = Loadable(lazy(() => import('pages/optimization')));

// ==============================|| MAIN ROUTING ||============================== //

const MainRoutes = {
  path: '/',
  element: (
    <ProtectedRoute>
      <DashboardLayout />
    </ProtectedRoute>
  ),
  children: [
    {
      path: '/',
      element: <DashboardDefault />
    },
    {
      path: 'dashboard',
      children: [
        {
          index: true,
          element: <DashboardDefault />
        },
        {
          path: 'default',
          element: <DashboardDefault />
        },
        {
          path: 'overview',
          element: <DashboardDefault />
        },
        {
          path: 'risk-analysis',
          element: <DashboardDefault />
        },
        {
          path: 'behavior-analysis',
          element: <DashboardDefault />
        },
        {
          path: 'comparative-ranking',
          element: <DashboardDefault />
        }
      ]
    },
    {
      path: 'typography',
      element: <Typography />
    },
    {
      path: 'color',
      element: <Color />
    },
    {
      path: 'shadow',
      element: <Shadow />
    },
    {
      path: 'order-list',
      element: <OrderList />
    },
    {
      path: 'backtest-tables',
      element: <BacktestTablesPage />
    },
    {
      path: 'strategy-input',
      element: <StrategyInput />
    },
    {
      path: 'get-strategy-id',
      element: <GetStrategyId />
    },
    {
      path: 'news',
      element: <NewsPage />
    },
    {
      path: 'profile',
      element: <ProfilePage />
    },
    {
      path: 'account-provisioning',
      element: <AccountProvisioning />
    },
    {
      path: 'api-keys',
      element: <ApiKeysPage />
    },
    {
      path: 'optimization',
      element: <Mt5Optimization />
    },
    {
      path: 'optimization/api-keys',
      element: <ApiKeysPage />
    },
    {
      path: 'optimization/setup-workers',
      element: <Mt5Optimization />
    },
    {
      path: 'optimization/ini-config',
      element: <Mt5Optimization />
    },
    {
      path: 'optimization/optimize',
      element: <Mt5Optimization />
    },
    {
      path: 'optimization/tpl-generator',
      element: <Mt5Optimization />
    }
  ]
};

export default MainRoutes;
