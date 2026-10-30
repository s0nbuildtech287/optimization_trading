import { lazy } from 'react';
import { useLocation } from 'react-router-dom';
import Loadable from 'components/Loadable';

// tab pages
const Overview = Loadable(lazy(() => import('./overview')));
const RiskAnalysis = Loadable(lazy(() => import('./risk-analysis')));
const BehaviorAnalysis = Loadable(lazy(() => import('./behavior-analysis')));
const ComparativeRanking = Loadable(lazy(() => import('./comparative-ranking')));

const ROUTES = [
  { path: '/dashboard/risk-analysis', component: <RiskAnalysis /> },
  { path: '/dashboard/behavior-analysis', component: <BehaviorAnalysis /> },
  { path: '/dashboard/comparative-ranking', component: <ComparativeRanking /> }
];

export default function DashboardPage() {
  const { pathname } = useLocation();
  const normalizedPath = pathname.startsWith('/demo') ? pathname.replace(/^\/demo/, '/dashboard') : pathname;
  const match = ROUTES.find((r) => normalizedPath.startsWith(r.path));
  return match ? match.component : <Overview />;
}
