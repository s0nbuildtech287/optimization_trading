import { lazy } from 'react';
import Loadable from 'components/Loadable';
import DashboardLayout from 'layout/Dashboard';

const DashboardPage = Loadable(lazy(() => import('pages/dashboard')));
const OrderList = Loadable(lazy(() => import('pages/order-pages/order-list')));
const BacktestTables = Loadable(lazy(() => import('pages/backtest-pages/backtest-tables')));
const StrategyInput = Loadable(lazy(() => import('pages/strategy-input/strategy-input')));
const Mt5Optimization = Loadable(lazy(() => import('pages/optimization')));

const DemoRoutes = {
  path: '/demo',
  element: <DashboardLayout demoMode />,
  children: [
    { index: true, element: <DashboardPage /> },
    { path: 'overview', element: <DashboardPage /> },
    { path: 'risk-analysis', element: <DashboardPage /> },
    { path: 'behavior-analysis', element: <DashboardPage /> },
    { path: 'comparative-ranking', element: <DashboardPage /> },
    { path: 'order-list', element: <OrderList /> },
    { path: 'backtest-tables', element: <BacktestTables /> },
    { path: 'strategy-input', element: <StrategyInput /> },
    { path: 'optimization', element: <Mt5Optimization /> },
    { path: 'optimization/setup-workers', element: <Mt5Optimization /> },
    { path: 'optimization/ini-config', element: <Mt5Optimization /> },
    { path: 'optimization/optimize', element: <Mt5Optimization /> },
    { path: 'optimization/tpl-generator', element: <Mt5Optimization /> }
  ]
};

export default DemoRoutes;
