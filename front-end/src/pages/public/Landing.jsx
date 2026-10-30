import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Code2,
  LockKeyhole,
  Play,
  Rocket,
  ShieldCheck,
  Sparkles,
  Trophy,
  X
} from 'lucide-react';

import Logo from 'components/logo';
import AuthLogin from 'sections/auth/AuthLogin';

const steps = [
  [Code2, 'Build Strategy Logic', 'Turn trading ideas into clear, testable rules and parameter sets.', '#38bdf8'],
  [Play, 'Run Backtests', 'Distribute optimization jobs and validate strategies across market data.', '#22d3ee'],
  [BarChart3, 'Analyze Performance', 'Inspect profitability, drawdown, stability and behavioral risk.', '#2dd4bf'],
  [Trophy, 'Select Robust Strategies', 'Compare candidates and promote only strategies that meet your rules.', '#a3e635'],
  [Rocket, 'Deploy & Monitor', 'Move selected systems into operation and monitor performance.', '#fbbf24']
];

const stepDetails = [
  {
    label: 'IDEA TO SPECIFICATION',
    summary: 'Define entry, exit, position sizing and risk rules as a repeatable system before testing any hypothesis.',
    bullets: [
      'Translate market assumptions into deterministic rules',
      'Declare parameter ranges and optimization steps',
      'Version strategy logic and test configuration'
    ],
    preview: [
      ['Signal rules', '6 defined'],
      ['Parameters', '12 ranges'],
      ['Risk model', 'Fixed & ATR']
    ],
    chart: [18, 28, 24, 41, 52, 61, 74, 86]
  },
  {
    label: 'DISTRIBUTED VALIDATION',
    summary: 'Split optimization workloads, execute MT5 tests and collect every candidate into one controlled pipeline.',
    bullets: [
      'Queue and distribute jobs across available workers',
      'Track heartbeat, progress, retries and artifacts',
      'Normalize Open Price and Every Tick test results'
    ],
    preview: [
      ['Workers online', '4 / 4'],
      ['Jobs completed', '128 / 160'],
      ['Queue progress', '80%']
    ],
    chart: [12, 24, 36, 49, 58, 66, 73, 80]
  },
  {
    label: 'PERFORMANCE & RISK',
    summary: 'Read profitability together with risk, stability and behavior instead of choosing a strategy from profit alone.',
    bullets: [
      'Compare profit factor, drawdown, recovery and Sharpe',
      'Review yearly, monthly and symbol-level consistency',
      'Detect behavioral flags and fragile parameter zones'
    ],
    preview: [
      ['Profit factor', '2.41'],
      ['Max drawdown', '7.82%'],
      ['Stable score', '88 / 100']
    ],
    chart: [42, 49, 57, 53, 68, 72, 81, 88]
  },
  {
    label: 'CANDIDATE GOVERNANCE',
    summary: 'Rank candidates with explicit gates, compare alternatives and preserve the exact parameter set selected for deployment.',
    bullets: [
      'Apply hard gates and quality scoring consistently',
      'Compare Open Price against Every Tick validation',
      'Promote, review or reject with an auditable decision'
    ],
    preview: [
      ['Candidates', '24'],
      ['Passed gates', '18'],
      ['Selected', '6']
    ],
    chart: [24, 22, 18, 15, 12, 9, 7, 6]
  },
  {
    label: 'OPERATE & OBSERVE',
    summary: 'Deploy only approved systems, then monitor live behavior against the assumptions proven during research.',
    bullets: [
      'Export validated configuration for operation',
      'Monitor portfolio exposure and strategy health',
      'Review drift and rerun research when conditions change'
    ],
    preview: [
      ['Active systems', '6'],
      ['Health status', 'Stable'],
      ['Risk alerts', '0 critical']
    ],
    chart: [63, 66, 64, 71, 74, 73, 79, 82]
  }
];

const metrics = [
  ['Net Profit', '$284,920', '+18.6%'],
  ['Profit Factor', '2.41', '+0.22'],
  ['Max Drawdown', '7.82%', '-1.14%'],
  ['Active Strategies', '24', '+4']
];

const glass = {
  background: 'linear-gradient(145deg, rgba(15,23,42,.86), rgba(8,15,30,.76))',
  border: '1px solid rgba(148,163,184,.14)',
  boxShadow: '0 24px 80px rgba(0,0,0,.3)',
  backdropFilter: 'blur(18px)'
};

function WorkflowMiniChart({ values, color }) {
  const width = 320;
  const height = 82;
  const padding = 5;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const points = values.map((value, index) => {
    const x = padding + (index / (values.length - 1)) * (width - padding * 2);
    const y = height - padding - ((value - min) / range) * (height - padding * 2);
    return [x, y];
  });
  const linePath = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
  const areaPath = `${linePath} L ${width - padding} ${height - padding} L ${padding} ${height - padding} Z`;
  const gradientId = `workflow-chart-${color.replace('#', '')}`;

  return (
    <Box sx={{ mt: 2, p: 1.4, borderRadius: 2, bgcolor: 'rgba(3,10,24,.72)', border: '1px solid rgba(148,163,184,.08)' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.6 }}>
        <Typography sx={{ color: '#64748b', fontSize: 10.5, fontWeight: 750, letterSpacing: '.08em' }}>PIPELINE TREND</Typography>
        <Stack direction="row" spacing={0.7} alignItems="center">
          <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: color, boxShadow: `0 0 12px ${color}` }} />
          <Typography sx={{ color, fontSize: 10.5, fontWeight: 750 }}>LIVE MODEL</Typography>
        </Stack>
      </Stack>
      <Box
        component="svg"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        sx={{ display: 'block', width: '100%', height: 82 }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity=".3" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[22, 42, 62].map((y) => (
          <line key={y} x1="0" y1={y} x2={width} y2={y} stroke="rgba(148,163,184,.08)" strokeDasharray="3 5" />
        ))}
        {values.map((value, index) => {
          const barWidth = 18;
          const barHeight = 8 + ((value - min) / range) * 34;
          const x = padding + (index / (values.length - 1)) * (width - padding * 2) - barWidth / 2;
          return (
            <rect key={index} x={x} y={height - padding - barHeight} width={barWidth} height={barHeight} rx="3" fill={color} opacity=".1" />
          );
        })}
        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map(([x, y], index) => (
          <circle
            key={index}
            cx={x}
            cy={y}
            r={index === points.length - 1 ? 4 : 2.2}
            fill={index === points.length - 1 ? '#f8fafc' : color}
            stroke={color}
            strokeWidth={index === points.length - 1 ? 2 : 0}
          />
        ))}
      </Box>
    </Box>
  );
}

function LoginDialog({ open, onClose }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { ...glass, borderRadius: 3, color: '#f8fafc', overflow: 'visible' } }}
      slotProps={{ backdrop: { sx: { bgcolor: 'rgba(2,6,23,.84)', backdropFilter: 'blur(8px)' } } }}
    >
      <IconButton onClick={onClose} aria-label="Close sign in" sx={{ position: 'absolute', right: 12, top: 12, color: '#94a3b8' }}>
        <X size={19} />
      </IconButton>
      <DialogContent sx={{ p: { xs: 3, sm: 4 } }}>
        <Typography variant="h3" sx={{ color: '#f8fafc', fontWeight: 800 }}>
          Welcome back
        </Typography>
        <Typography sx={{ color: '#94a3b8', mt: 0.7, mb: 3 }}>Sign in to access live data and production tools.</Typography>
        <AuthLogin />
      </DialogContent>
    </Dialog>
  );
}

export default function Landing() {
  const [loginOpen, setLoginOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [ActiveStepIcon, activeStepTitle, , activeStepColor] = steps[activeStep];
  const activeDetail = stepDetails[activeStep];
  useEffect(() => {
    document.title = 'Trading Quant System Backtest';
  }, []);

  return (
    <Box
      sx={{
        minHeight: '100vh',
        color: '#e2e8f0',
        background:
          'radial-gradient(circle at 72% 10%,rgba(14,116,144,.2),transparent 34%),radial-gradient(circle at 7% 38%,rgba(37,99,235,.12),transparent 28%)'
      }}
    >
      <Box
        component="header"
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          borderBottom: '1px solid rgba(148,163,184,.09)',
          bgcolor: 'rgba(6,9,19,.76)',
          backdropFilter: 'blur(18px)'
        }}
      >
        <Container maxWidth="xl">
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ minHeight: 76 }}>
            <Logo to="/" sx={{ transform: { xs: 'scale(.78)', sm: 'scale(.9)' }, transformOrigin: 'left center' }} />
            <Stack direction="row" spacing={1}>
              <Button
                component={RouterLink}
                to="/demo"
                sx={{ color: '#cbd5e1', textTransform: 'none', display: { xs: 'none', sm: 'inline-flex' } }}
              >
                Explore Demo
              </Button>
              <Button
                onClick={() => setLoginOpen(true)}
                variant="outlined"
                startIcon={<LockKeyhole size={16} />}
                sx={{ color: '#7dd3fc', borderColor: 'rgba(56,189,248,.4)', textTransform: 'none', borderRadius: 2 }}
              >
                Sign In
              </Button>
            </Stack>
          </Stack>
        </Container>
      </Box>

      <Container component="main" maxWidth="xl" sx={{ pt: { xs: 7, md: 11 }, pb: 10 }}>
        <Grid container spacing={6} alignItems="center">
          <Grid size={{ xs: 12, lg: 5.3 }}>
            <Chip
              icon={<Sparkles size={15} />}
              label="Research. Validate. Deploy."
              sx={{ mb: 3, color: '#67e8f9', bgcolor: 'rgba(8,145,178,.12)', border: '1px solid rgba(34,211,238,.22)' }}
            />
            <Typography
              component="h1"
              sx={{ fontSize: { xs: 43, sm: 58, lg: 68 }, lineHeight: 1.03, fontWeight: 850, letterSpacing: '-.045em', color: '#f8fafc' }}
            >
              Build trading ideas into{' '}
              <Box
                component="span"
                sx={{ background: 'linear-gradient(90deg,#38bdf8,#2dd4bf)', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
              >
                validated systems.
              </Box>
            </Typography>
            <Typography sx={{ mt: 3, maxWidth: 650, color: '#94a3b8', fontSize: { xs: 17, sm: 19 }, lineHeight: 1.75 }}>
              A quantitative research workspace for strategy logic, distributed backtesting, performance analysis, candidate selection and
              ongoing monitoring.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 4 }}>
              <Button
                component={RouterLink}
                to="/demo"
                variant="contained"
                endIcon={<ArrowRight size={18} />}
                sx={{
                  px: 3,
                  py: 1.35,
                  textTransform: 'none',
                  fontWeight: 750,
                  borderRadius: 2,
                  color: '#021018',
                  background: 'linear-gradient(90deg,#38bdf8,#2dd4bf)'
                }}
              >
                Explore Interactive Demo
              </Button>
              <Button onClick={() => setLoginOpen(true)} sx={{ px: 3, color: '#e2e8f0', textTransform: 'none' }}>
                Access Live Workspace
              </Button>
            </Stack>
            <Stack direction="row" spacing={2.5} flexWrap="wrap" useFlexGap sx={{ mt: 4.5 }}>
              {['Mock demo available', 'Live data protected', 'MT5 workflow ready'].map((item) => (
                <Stack key={item} direction="row" alignItems="center" spacing={0.7}>
                  <CheckCircle2 size={15} color="#2dd4bf" />
                  <Typography sx={{ color: '#94a3b8', fontSize: 13 }}>{item}</Typography>
                </Stack>
              ))}
            </Stack>
          </Grid>

          <Grid size={{ xs: 12, lg: 6.7 }}>
            <Paper sx={{ ...glass, p: { xs: 2, sm: 2.5 }, borderRadius: 4, overflow: 'hidden' }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2.5 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Activity size={18} color="#38bdf8" />
                  <Typography sx={{ fontWeight: 700 }}>Portfolio Research Overview</Typography>
                </Stack>
                <Chip
                  size="small"
                  label="DEMO DATA"
                  sx={{ color: '#67e8f9', bgcolor: 'rgba(8,145,178,.12)', fontSize: 10, fontWeight: 800 }}
                />
              </Stack>
              <Grid container spacing={1.5}>
                {metrics.map(([label, value, change]) => (
                  <Grid size={{ xs: 6, md: 3 }} key={label}>
                    <Box sx={{ p: 1.5, bgcolor: 'rgba(15,23,42,.7)', border: '1px solid rgba(148,163,184,.1)', borderRadius: 2 }}>
                      <Typography sx={{ color: '#64748b', fontSize: 11 }}>{label}</Typography>
                      <Typography sx={{ color: '#f8fafc', fontWeight: 800, fontSize: { xs: 17, sm: 20 }, mt: 0.6 }}>{value}</Typography>
                      <Typography sx={{ color: '#2dd4bf', fontSize: 11 }}>{change}</Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
              <Box
                sx={{ mt: 2, p: 2, height: 250, bgcolor: 'rgba(2,6,23,.45)', borderRadius: 2.5, border: '1px solid rgba(148,163,184,.08)' }}
              >
                <Stack direction="row" justifyContent="space-between">
                  <Typography sx={{ color: '#cbd5e1', fontWeight: 650 }}>Equity progression</Typography>
                  <Typography sx={{ color: '#2dd4bf', fontWeight: 700 }}>+28.49%</Typography>
                </Stack>
                <Box component="svg" viewBox="0 0 700 185" preserveAspectRatio="none" sx={{ width: '100%', height: 185, mt: 1 }}>
                  <defs>
                    <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#22d3ee" stopOpacity=".32" />
                      <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {[35, 75, 115, 155].map((y) => (
                    <line key={y} x1="0" y1={y} x2="700" y2={y} stroke="rgba(148,163,184,.09)" />
                  ))}
                  <path
                    d="M0 160 C45 148 52 152 90 132 S142 138 175 112 S235 126 272 92 S332 103 370 74 S430 92 468 62 S525 70 560 42 S630 58 700 18 L700 185 L0 185Z"
                    fill="url(#equityFill)"
                  />
                  <path
                    d="M0 160 C45 148 52 152 90 132 S142 138 175 112 S235 126 272 92 S332 103 370 74 S430 92 468 62 S525 70 560 42 S630 58 700 18"
                    fill="none"
                    stroke="#22d3ee"
                    strokeWidth="3"
                  />
                </Box>
              </Box>
            </Paper>
          </Grid>
        </Grid>
      </Container>

      <Box sx={{ borderBlock: '1px solid rgba(148,163,184,.08)', bgcolor: 'rgba(15,23,42,.28)' }}>
        <Container maxWidth="xl" sx={{ py: { xs: 8, md: 10 } }}>
          <Stack alignItems="center" sx={{ mb: 6 }}>
            <Typography sx={{ color: '#38bdf8', fontWeight: 750, letterSpacing: '.14em', fontSize: 12 }}>THE RESEARCH PIPELINE</Typography>
            <Typography variant="h2" textAlign="center" sx={{ color: '#f8fafc', fontWeight: 800, mt: 1.5 }}>
              From logic to monitored strategy
            </Typography>
            <Typography textAlign="center" sx={{ color: '#94a3b8', maxWidth: 680, mt: 1.5 }}>
              Every stage stays measurable and reviewable before a strategy reaches live operation.
            </Typography>
          </Stack>
          <Grid container spacing={2}>
            {steps.map(([Icon, title, text, color], i) => {
              const selected = activeStep === i;
              return (
                <Grid size={{ xs: 12, sm: 6, lg: 2.4 }} key={title}>
                  <Paper
                    component="button"
                    type="button"
                    onClick={() => setActiveStep(i)}
                    aria-pressed={selected}
                    sx={{
                      ...glass,
                      p: 2.5,
                      width: '100%',
                      height: '100%',
                      borderRadius: 2.5,
                      textAlign: 'left',
                      color: 'inherit',
                      cursor: 'pointer',
                      transition: '.25s',
                      borderColor: selected ? color + '88' : 'rgba(148,163,184,.14)',
                      transform: selected ? 'translateY(-6px)' : 'none',
                      boxShadow: selected ? '0 18px 55px ' + color + '18' : glass.boxShadow,
                      '&:hover': { transform: 'translateY(-5px)', borderColor: color + '66' }
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between">
                      <Box
                        sx={{ width: 43, height: 43, display: 'grid', placeItems: 'center', borderRadius: 2, bgcolor: color + '14', color }}
                      >
                        <Icon size={21} />
                      </Box>
                      <Typography sx={{ color: selected ? color : '#334155', fontWeight: 850, fontSize: 24 }}>0{i + 1}</Typography>
                    </Stack>
                    <Typography sx={{ color: '#e2e8f0', fontWeight: 750, mt: 2.3 }}>{title}</Typography>
                    <Typography sx={{ color: '#8290a4', fontSize: 13.5, lineHeight: 1.7, mt: 1 }}>{text}</Typography>
                  </Paper>
                </Grid>
              );
            })}
          </Grid>

          <Paper sx={{ ...glass, mt: 3, p: { xs: 2.5, md: 4 }, borderRadius: 3, borderColor: activeStepColor + '45' }}>
            <Grid container spacing={4} alignItems="stretch">
              <Grid size={{ xs: 12, md: 7 }}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Box
                    sx={{
                      width: 50,
                      height: 50,
                      display: 'grid',
                      placeItems: 'center',
                      borderRadius: 2,
                      bgcolor: activeStepColor + '16',
                      color: activeStepColor
                    }}
                  >
                    <ActiveStepIcon size={25} />
                  </Box>
                  <Box>
                    <Typography sx={{ color: activeStepColor, fontWeight: 800, fontSize: 11, letterSpacing: '.12em' }}>
                      STEP {activeStep + 1} | {activeDetail.label}
                    </Typography>
                    <Typography variant="h3" sx={{ color: '#f8fafc', fontWeight: 800, mt: 0.35 }}>
                      {activeStepTitle}
                    </Typography>
                  </Box>
                </Stack>
                <Typography sx={{ color: '#94a3b8', lineHeight: 1.75, mt: 2.5, maxWidth: 760 }}>{activeDetail.summary}</Typography>
                <Stack spacing={1.2} sx={{ mt: 2.5 }}>
                  {activeDetail.bullets.map((item) => (
                    <Stack key={item} direction="row" spacing={1.1} alignItems="center">
                      <CheckCircle2 size={16} color={activeStepColor} />
                      <Typography sx={{ color: '#cbd5e1', fontSize: 14 }}>{item}</Typography>
                    </Stack>
                  ))}
                </Stack>
                <Stack direction="row" spacing={1.2} sx={{ mt: 3.5 }}>
                  <Button
                    disabled={activeStep === 0}
                    onClick={() => setActiveStep((v) => Math.max(0, v - 1))}
                    startIcon={<ArrowLeft size={16} />}
                    sx={{ textTransform: 'none', color: '#cbd5e1' }}
                  >
                    Previous
                  </Button>
                  {activeStep < steps.length - 1 ? (
                    <Button
                      variant="contained"
                      onClick={() => setActiveStep((v) => Math.min(steps.length - 1, v + 1))}
                      endIcon={<ArrowRight size={16} />}
                      sx={{ textTransform: 'none', bgcolor: activeStepColor, color: '#031018' }}
                    >
                      Next step
                    </Button>
                  ) : (
                    <Button
                      component={RouterLink}
                      to="/demo"
                      variant="contained"
                      endIcon={<ArrowRight size={16} />}
                      sx={{ textTransform: 'none', bgcolor: activeStepColor, color: '#031018' }}
                    >
                      Explore dashboard
                    </Button>
                  )}
                </Stack>
              </Grid>
              <Grid size={{ xs: 12, md: 5 }}>
                <Box
                  sx={{
                    height: '100%',
                    minHeight: 345,
                    p: 2.5,
                    borderRadius: 2.5,
                    bgcolor: 'rgba(2,6,23,.6)',
                    border: '1px solid rgba(148,163,184,.1)'
                  }}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2.5 }}>
                    <Typography sx={{ color: '#94a3b8', fontSize: 12, fontWeight: 700 }}>WORKFLOW SNAPSHOT</Typography>
                    <Chip
                      size="small"
                      label={'0' + (activeStep + 1) + ' / 05'}
                      sx={{ color: activeStepColor, bgcolor: activeStepColor + '12', fontWeight: 800 }}
                    />
                  </Stack>
                  <Stack spacing={1.3}>
                    {activeDetail.preview.map(([label, value], i) => (
                      <Stack
                        key={label}
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                        sx={{
                          p: 1.4,
                          borderRadius: 1.5,
                          bgcolor: i === 0 ? activeStepColor + '0d' : 'rgba(15,23,42,.65)',
                          border: '1px solid rgba(148,163,184,.08)'
                        }}
                      >
                        <Typography sx={{ color: '#8290a4', fontSize: 13 }}>{label}</Typography>
                        <Typography sx={{ color: i === 0 ? activeStepColor : '#e2e8f0', fontWeight: 750, fontSize: 13 }}>
                          {value}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                  <WorkflowMiniChart values={activeDetail.chart} color={activeStepColor} />
                  <Box sx={{ mt: 2.2, height: 5, borderRadius: 8, bgcolor: 'rgba(148,163,184,.1)', overflow: 'hidden' }}>
                    <Box
                      sx={{
                        width: ((activeStep + 1) / steps.length) * 100 + '%',
                        height: '100%',
                        bgcolor: activeStepColor,
                        transition: 'width .35s ease'
                      }}
                    />
                  </Box>
                </Box>
              </Grid>
            </Grid>
          </Paper>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: { xs: 9, md: 12 } }}>
        <Paper sx={{ ...glass, p: { xs: 3, md: 6 }, borderRadius: 4, textAlign: 'center' }}>
          <ShieldCheck size={34} color="#2dd4bf" />
          <Typography variant="h2" sx={{ color: '#f8fafc', fontWeight: 800, mt: 2 }}>
            See the workflow before signing in
          </Typography>
          <Typography sx={{ color: '#94a3b8', maxWidth: 680, mx: 'auto', mt: 1.5 }}>
            Explore a safe workspace powered entirely by mock data. Live jobs, uploads and production actions remain protected.
          </Typography>
          <Button
            component={RouterLink}
            to="/demo"
            variant="contained"
            endIcon={<ArrowRight size={17} />}
            sx={{ mt: 3.5, px: 3, py: 1.2, textTransform: 'none', bgcolor: '#0891b2' }}
          >
            Open Demo Workspace
          </Button>
        </Paper>
      </Container>
      <Box component="footer" sx={{ borderTop: '1px solid rgba(148,163,184,.08)', py: 3 }}>
        <Container maxWidth="xl">
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between">
            <Typography sx={{ color: '#64748b', fontSize: 13 }}>© Trading Quant System Backtest</Typography>
            <Typography sx={{ color: '#475569', fontSize: 12 }}>Past performance does not guarantee future results.</Typography>
          </Stack>
        </Container>
      </Box>
      <LoginDialog open={loginOpen} onClose={() => setLoginOpen(false)} />
    </Box>
  );
}
