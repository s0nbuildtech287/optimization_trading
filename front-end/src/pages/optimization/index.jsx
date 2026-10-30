import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import Button from '@mui/material/Button';

import AppstoreOutlined from '@ant-design/icons/AppstoreOutlined';
import BarChartOutlined from '@ant-design/icons/BarChartOutlined';
import AimOutlined from '@ant-design/icons/AimOutlined';
import RocketOutlined from '@ant-design/icons/RocketOutlined';
import HourglassOutlined from '@ant-design/icons/HourglassOutlined';

import SetupWorkersTab from './SetupWorkersTab';
import IniConfigGeneratorTab from './IniConfigGeneratorTab';
import JobsQueueProcessTab from './JobsQueueProcessTab';
import OptimizeResultsTab from './OptimizeResultsTab';
import BacktestCandidatesTab from './BacktestCandidatesTab';
import BacktestStagingTab from './BacktestStagingTab';
import TPLGeneratorTab from './TPLGeneratorTab';
import OptimizationSessionDropdown from 'components/optimization/OptimizationSessionDropdown';

const PAGES = [
  { path: '/optimization/setup-workers', label: 'Setup Workers' },
  { path: '/optimization/ini-config', label: 'INI Config' },
  { path: '/optimization/optimize', label: 'Optimize', optimize: true },
  { path: '/optimization/tpl-generator', label: 'TPL Generator' }
];

const OPTIMIZE_TABS = [
  { id: 'queue', label: 'Jobs Queue Process', icon: <AppstoreOutlined style={{ fontSize: 15 }} /> },
  { id: 'results', label: 'All Optimize Results', icon: <BarChartOutlined style={{ fontSize: 15 }} /> },
  { id: 'candidates', label: 'All Backtest Candidates', icon: <AimOutlined style={{ fontSize: 15 }} /> },
  { id: 'staging', label: 'Backtest Staging', icon: <RocketOutlined style={{ fontSize: 15 }} /> }
];

function DevelopmentState({ title }) {
  return (
    <Box
      sx={{
        minHeight: 360,
        display: 'grid',
        placeItems: 'center',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        bgcolor: 'background.paper'
      }}
    >
      <Stack spacing={1.25} alignItems="center">
        <HourglassOutlined style={{ fontSize: 30 }} />
        <Typography variant="h5">{title}</Typography>
        <Typography color="text.secondary">Feature under development</Typography>
      </Stack>
    </Box>
  );
}

export default function Mt5OptimizationPage() {
  const theme = useTheme();
  const { pathname } = useLocation();
  const [optimizeTab, setOptimizeTab] = useState('queue');
  const activePage = PAGES.find((page) => pathname.startsWith(page.path)) || PAGES[0];
  const activeOptimizeTab = OPTIMIZE_TABS.find((tab) => tab.id === optimizeTab);
  const contentTitle = activePage.optimize ? activeOptimizeTab?.label : activePage.label;

  useEffect(() => {
    document.title = `${contentTitle} | MT5 Optimization`;
  }, [contentTitle]);

  return (
    <Stack spacing={2.5}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', sm: 'center' },
          gap: 2,
          width: '100%'
        }}
      >
        <Box>
          <Typography variant="h3">{activePage.label}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            MT5 Optimization
          </Typography>
        </Box>

        {/* Optimization Session Dropdown (Ngang hàng với title trang giống Data Source Dashboard) */}
        <OptimizationSessionDropdown />
      </Box>

      {activePage.optimize && (
        <Box
          sx={{
            display: 'inline-flex',
            flexWrap: 'wrap',
            gap: 0.5,
            bgcolor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : '#f1f5f9',
            p: 0.5,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            width: { xs: '100%', sm: 'fit-content' }
          }}
        >
          {OPTIMIZE_TABS.map((tab) => {
            const isActive = optimizeTab === tab.id;
            return (
              <Button
                key={tab.id}
                onClick={() => setOptimizeTab(tab.id)}
                startIcon={tab.icon}
                sx={{
                  px: 1.75,
                  py: 0.75,
                  fontWeight: 600,
                  fontSize: '0.8125rem',
                  color: isActive ? '#ffffff' : theme.palette.text.primary,
                  bgcolor: isActive
                    ? theme.palette.mode === 'dark'
                      ? 'primary.main'
                      : '#212A37'
                    : 'transparent',
                  borderRadius: 1.5,
                  textTransform: 'none',
                  boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                  transition: 'all 0.15s ease-in-out',
                  flexGrow: { xs: 1, sm: 0 },
                  '&:hover': {
                    bgcolor: isActive
                      ? theme.palette.mode === 'dark'
                        ? 'primary.dark'
                        : '#1565C0'
                      : theme.palette.mode === 'light'
                        ? 'rgba(31, 56, 100, 0.08)'
                        : 'rgba(255, 255, 255, 0.08)',
                    color: isActive ? '#ffffff' : theme.palette.mode === 'light' ? '#1F3864' : '#e2e8f0'
                  }
                }}
              >
                {tab.label}
              </Button>
            );
          })}
        </Box>
      )}

      {activePage.path === '/optimization/setup-workers' && <SetupWorkersTab />}
      {activePage.path === '/optimization/ini-config' && <IniConfigGeneratorTab />}
      {activePage.path === '/optimization/tpl-generator' && <TPLGeneratorTab />}
      {activePage.path === '/optimization/optimize' && optimizeTab === 'queue' && <JobsQueueProcessTab />}
      {activePage.path === '/optimization/optimize' && optimizeTab === 'results' && <OptimizeResultsTab />}
      {activePage.path === '/optimization/optimize' && optimizeTab === 'candidates' && <BacktestCandidatesTab />}
      {activePage.path === '/optimization/optimize' && optimizeTab === 'staging' && <BacktestStagingTab />}
      {activePage.path === '/optimization/optimize' &&
        optimizeTab !== 'queue' &&
        optimizeTab !== 'results' &&
        optimizeTab !== 'candidates' &&
        optimizeTab !== 'staging' && <DevelopmentState title={contentTitle} />}
      {activePage.path !== '/optimization/setup-workers' &&
        activePage.path !== '/optimization/ini-config' &&
        activePage.path !== '/optimization/tpl-generator' &&
        activePage.path !== '/optimization/optimize' && (
          <DevelopmentState title={contentTitle} />
        )}
    </Stack>
  );
}
