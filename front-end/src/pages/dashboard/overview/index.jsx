import { useState, useEffect, useRef } from 'react';
import dayjs from 'dayjs';
import {
  getDashboardOverviewCore,
  getDashboardOverviewMonthlyProfit,
  getDashboardOverviewTopStats,
  getDashboardOverviewYearlyPerformance,
  getDashboardOverviewBehaviorSummary,
  getDashboardOverviewComparative,
  getDashboardOverviewBreakdown
} from 'api/dashboard';
import { getBacktestTables } from 'api/order';
import { getStoredDashboardTable, getStoredDashboardSources, setStoredDashboardTable, setStoredDashboardSources, getStoredDashboardDateRange, setStoredDashboardDateRange } from 'utils/dashboardTable';
import CardLoader, { CardError } from 'components/CardLoader';

// material-ui
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Card from '@mui/material/Card';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TablePagination from '@mui/material/TablePagination';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import MuiTooltip from '@mui/material/Tooltip';
import { useTheme } from '@mui/material/styles';

// IMPORT DATE PICKER
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';

// recharts
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

// project imports
import MainCard from 'components/MainCard';
import AnalyticEcommerce from 'components/cards/statistics/AnalyticEcommerce';
import DashboardAiAnalysisDialog from 'components/dashboard/DashboardAiAnalysisDialog';
import DashboardRemarksDialog from 'components/dashboard/DashboardRemarksDialog';
import { dashboardDetailButtonSx } from 'components/dashboard/DashboardKpiSummary';
import DashboardFilterBar from 'components/dashboard/DashboardFilterBar';
import KpiSummarySection from './KpiSummarySection';

// Ant Design Icons
import {
  RiseOutlined,
  FallOutlined,
  TrophyOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  DollarOutlined,
  AuditOutlined,
  StockOutlined,
  SafetyOutlined,
  InfoCircleOutlined,
  PieChartOutlined,
  QuestionCircleOutlined,
  CloseCircleOutlined,
  FileTextOutlined,
  RobotOutlined,
  CalendarOutlined
} from '@ant-design/icons';

export default function DashboardDefault() {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const chartTextColor = isDarkMode ? '#cbd5e1' : '#1F3864';
  const chartGridColor = isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#CBD5E1';

  const tooltipSlotProps = {
    tooltip: {
      sx: {
        bgcolor: isDarkMode ? '#334155' : theme.palette.grey[700],
        color: '#ffffff',
        boxShadow: isDarkMode
          ? '0 10px 25px -5px rgba(0,0,0,0.6), 0 8px 10px -6px rgba(0,0,0,0.5)'
          : '0 4px 12px rgba(0,0,0,0.15)',
        border: '1px solid',
        borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.1)',
        fontSize: '0.75rem',
        fontWeight: 600,
        padding: '8px 12px',
        borderRadius: '6px',
        lineHeight: 1.4
      }
    },
    arrow: {
      sx: {
        color: isDarkMode ? '#334155' : theme.palette.grey[700]
      }
    }
  };

  const [selectedTable, setSelectedTable] = useState(() => getStoredDashboardTable(''));
  const [selectedSources, setSelectedSources] = useState([]);
  const [dashboardData, setDashboardData] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [aiOverviewOpen, setAiOverviewOpen] = useState(false);
  const [optHelpOpen, setOptHelpOpen] = useState(false);
  const [riskHelpOpen, setRiskHelpOpen] = useState(false);
  const [behaviorHelpOpen, setBehaviorHelpOpen] = useState(false);
  const [profitTrendHelpOpen, setProfitTrendHelpOpen] = useState(false);
  const [qualityDistHelpOpen, setQualityDistHelpOpen] = useState(false);
  const [breakdownHelpOpen, setBreakdownHelpOpen] = useState(false);
  const [strategySummaryOpen, setStrategySummaryOpen] = useState(false);

  const [remarksOpen, setRemarksOpen] = useState(false);
  const [remarksTitle, setRemarksTitle] = useState('');
  const [remarksId, setRemarksId] = useState('');
  const [remarksType, setRemarksType] = useState('chart');

  const handleOpenRemarks = (title, id, type = 'chart') => {
    setRemarksTitle(title);
    setRemarksId(id);
    setRemarksType(type);
    setRemarksOpen(true);
  };

  const [riskPage, setRiskPage] = useState(0);
  const [riskRowsPerPage, setRiskRowsPerPage] = useState(10);


  // ✅ Dynamic backtest tables
  const [backtestTables, setBacktestTables] = useState([]);
  const [loadingTables, setLoadingTables] = useState(true);

  // ✅ STATE CHO DATE RANGE
  const [dateRange, setDateRange] = useState(() => {
    const stored = getStoredDashboardDateRange();
    return {
      startDate: stored.startDate ? dayjs(stored.startDate) : null,
      endDate: stored.endDate ? dayjs(stored.endDate) : null
    };
  });

  const [dashboardCore, setDashboardCore] = useState(null);
  const [monthlyProfit, setMonthlyProfit] = useState([]);
  const [topStats, setTopStats] = useState({ topStrategies: [], topSymbols: [] });
  const [yearlyPerformance, setYearlyPerformance] = useState({ yearlyComparison: [], qualityDistribution: [] });
  const [behaviorSummary, setBehaviorSummary] = useState(null);
  const [comparativeRanking, setComparativeRanking] = useState(null);
  const [breakdownData, setBreakdownData] = useState(null);

  // States loading cục bộ cho từng biểu đồ / card thưa đại ca Xuân Sơn
  const [coreLoading, setCoreLoading] = useState(true);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [topStatsLoading, setTopStatsLoading] = useState(false);
  const [yearlyLoading, setYearlyLoading] = useState(false);
  const [behaviorSummaryLoading, setBehaviorSummaryLoading] = useState(false);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [breakdownLoading, setBreakdownLoading] = useState(false);

  // States error cục bộ để cô lập lỗi thưa đại ca Xuân Sơn
  const [coreError, setCoreError] = useState(null);
  const [monthlyError, setMonthlyError] = useState(null);
  const [topStatsError, setTopStatsError] = useState(null);
  const [yearlyError, setYearlyError] = useState(null);
  const [behaviorSummaryError, setBehaviorSummaryError] = useState(null);
  const [comparisonError, setComparisonError] = useState(null);
  const [breakdownError, setBreakdownError] = useState(null);
  const requestIdRef = useRef(0);
  const pendingTimersRef = useRef([]);

  const [symbolMetric, setSymbolMetric] = useState('pd');
  const [comparisonMetric, setComparisonMetric] = useState('totalNetProfit');

  const loading = coreLoading;
  const error = coreError;
  const behaviorData = behaviorSummary;

  useEffect(() => {
    const handleSourcesUpdated = (event) => {
      const sources = Array.isArray(event.detail?.sources) ? event.detail.sources : [];
      setSelectedSources(sources);
      setStoredDashboardSources(sources);
      const nextTable = sources.length === 1 ? sources[0] : (sources.length > 1 ? 'all_backtests' : '');
      setSelectedTable(nextTable);
      setStoredDashboardTable(nextTable);
    };
    const handleFiltersUpdated = () => {
      const stored = getStoredDashboardDateRange();
      setDateRange({
        startDate: stored.startDate ? dayjs(stored.startDate) : null,
        endDate: stored.endDate ? dayjs(stored.endDate) : null
      });
    };
    window.addEventListener('dashboard:sources-updated', handleSourcesUpdated);
    window.addEventListener('dashboard:filters-updated', handleFiltersUpdated);
    return () => {
      window.removeEventListener('dashboard:sources-updated', handleSourcesUpdated);
      window.removeEventListener('dashboard:filters-updated', handleFiltersUpdated);
    };
  }, []);

  const renderHeaderActions = (chartName, promptMsg, chartData) => {
    const isNoDateRange = chartName === 'File Optimization Check';
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto', mr: -1.25 }}>
        {isNoDateRange ? (
          <MuiTooltip title="Không áp dụng Date Range" arrow slotProps={tooltipSlotProps}>
            <IconButton
              size="small"
              disabled
              sx={{
                color: '#94a3b8',
                p: 0.25,
                mr: 0.25,
                position: 'relative',
                '&.Mui-disabled': { color: '#94a3b8' },
                '&::after': {
                  content: '""',
                  position: 'absolute',
                  top: '15%',
                  left: '48%',
                  width: '2px',
                  height: '70%',
                  bgcolor: '#ef4444',
                  transform: 'translateX(-50%) rotate(45deg)',
                  transformOrigin: 'center'
                }
              }}
            >
              <CalendarOutlined style={{ fontSize: '16px' }} />
            </IconButton>
          </MuiTooltip>
        ) : (
          <MuiTooltip title="Có áp dụng Date Range" arrow slotProps={tooltipSlotProps}>
            <IconButton
              size="small"
              sx={{
                color: 'success.main',
                p: 0.25,
                mr: 0.25,
                cursor: 'default',
                '&:hover': { bgcolor: 'transparent' }
              }}
            >
              <CalendarOutlined style={{ fontSize: '16px' }} />
            </IconButton>
          </MuiTooltip>
        )}
        <MuiTooltip title="Hỏi Chatbot về biểu đồ này" arrow slotProps={tooltipSlotProps}>
          <IconButton
            size="small"
            onClick={() => {
              if (chartData) {
                const contextObj = {
                  page: chartName,
                  chartData: chartData
                };
                if (dateRange.startDate && dateRange.endDate) {
                  contextObj.dateRange = {
                    startDate: dayjs(dateRange.startDate).format('YYYY-MM-DD'),
                    endDate: dayjs(dateRange.endDate).format('YYYY-MM-DD')
                  };
                }
                window.dispatchEvent(new CustomEvent('chatbot:context', {
                  detail: {
                    context: contextObj
                  }
                }));
              }
              window.dispatchEvent(new CustomEvent('chatbot:prompt', { detail: { message: promptMsg } }));
            }}
            sx={{
              color: 'primary.main',
              p: 0.25,
              '&:hover': { bgcolor: 'rgba(24, 144, 255, 0.08)' }
            }}
          >
            <RobotOutlined style={{ fontSize: '16px' }} />
          </IconButton>
        </MuiTooltip>
        <MuiTooltip title="Nhận xét / Đánh giá" arrow slotProps={tooltipSlotProps}>
          <IconButton
            size="small"
            onClick={() => handleOpenRemarks(chartName, chartName)}
            sx={{
              color: 'secondary.main',
              p: 0.25,
              '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.04)' }
            }}
          >
            <FileTextOutlined style={{ fontSize: '16px' }} />
          </IconButton>
        </MuiTooltip>
      </Box>
    );
  };

  // Set page title and check for auto-opening report
  useEffect(() => {
    document.title = 'Dashboard | Backtest';
    const params = new URLSearchParams(window.location.search);
    if (params.get('report') === 'true') {
      setStrategySummaryOpen(true);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [selectedTable]);

  // ✅ Fetch dynamic backtest tables on mount
  useEffect(() => {
    const applyTableList = (tables) => {
      const nextTables = Array.isArray(tables) ? tables : [];
      setBacktestTables(nextTables);
      if (nextTables.length > 0) {
        const storedSources = getStoredDashboardSources([]);
        const validSources = storedSources.filter((source) => nextTables.includes(source));
        const sources = validSources.length > 0 ? validSources : [nextTables[0]];
        const nextTable = sources.length === 1 ? sources[0] : 'all_backtests';
        setSelectedSources(sources);
        setStoredDashboardSources(sources);
        setStoredDashboardTable(nextTable);
        setSelectedTable(nextTable);
        window.dispatchEvent(new CustomEvent('dashboard:sources-updated', { detail: { sources } }));
      } else {
        setSelectedSources([]);
        setSelectedTable('');
        setStoredDashboardTable('');
      }
    };

    const fetchTables = async () => {
      try {
        setLoadingTables(true);
        const response = await getBacktestTables();
        applyTableList(response.tables || []);
      } catch (err) {
        console.error('❌ Failed to fetch backtest tables:', err);
        setBacktestTables([]);
      } finally {
        setLoadingTables(false);
      }
    };
    fetchTables();
  }, []);

  // ✅ Listen for sync/delete events → refresh data + backtest tables dropdown
  useEffect(() => {
    const handleDataChanged = () => {
      loadData();
      getBacktestTables()
        .then((r) => {
          const tables = Array.isArray(r.tables) ? r.tables : [];
          setBacktestTables(tables);
          if (selectedTable && selectedTable !== 'all_backtests' && !tables.includes(selectedTable)) {
            const firstTable = tables[0] || '';
            setSelectedTable(firstTable);
            setStoredDashboardTable(firstTable);
            setSelectedSources(firstTable ? [firstTable] : []);
            window.dispatchEvent(new CustomEvent('dashboard:sources-updated', { detail: { sources: firstTable ? [firstTable] : [] } }));
          }
        })
        .catch(() => { });
    };
    window.addEventListener('dashboard:data-changed', handleDataChanged);
    return () => window.removeEventListener('dashboard:data-changed', handleDataChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTable]);

  // ✅ FORMAT CURRENCY
  const formatCurrency = (value) => {
    const num = Number(value);
    if (value == null || Number.isNaN(num)) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(num);
  };

  // ✅ FORMAT NUMBER
  const formatNumber = (value) => {
    const num = Number(value);
    if (value == null || Number.isNaN(num)) return '0';
    return new Intl.NumberFormat('en-US').format(num);
  };

  // Format large numeric values into short readable labels for cards
  const formatCompactCurrency = (value) => {
    if (value == null || Number.isNaN(Number(value))) return '$0';
    const n = Number(value);
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    const formatter = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
    return `${sign}$${formatter.format(abs)}`;
  };

  const formatCompactNumber = (value, digits = 2) => {
    if (value == null || Number.isNaN(Number(value))) return '0';
    return Number(value).toFixed(digits);
  };

  const triggerSubsequentCalls = (params, requestId) => {
    const isCurrentRequest = () => requestIdRef.current === requestId;
    const schedule = (callback, delay) => {
      const timerId = setTimeout(() => {
        pendingTimersRef.current = pendingTimersRef.current.filter((id) => id !== timerId);
        if (isCurrentRequest()) callback();
      }, delay);
      pendingTimersRef.current.push(timerId);
    };
    // API 2: Behavior Summary thưa đại ca Xuân Sơn
    setBehaviorSummaryLoading(true);
    setBehaviorSummaryError(null);
    getDashboardOverviewBehaviorSummary(params)
      .then(res => {
        if (!isCurrentRequest()) return;
        setBehaviorSummary(res.data);
        setBehaviorSummaryLoading(false);
      })
      .catch(err => {
        if (!isCurrentRequest()) return;
        console.error('Failed to load behavior summary:', err);
        setBehaviorSummaryError(err.message || 'Error loading behavior summary');
        setBehaviorSummaryLoading(false);
      });

    // API 5: Comparative Ranking (Backtest Comparison) thưa đại ca Xuân Sơn
    setComparisonLoading(true);
    setComparisonError(null);
    getDashboardOverviewComparative(params)
      .then(res => {
        if (!isCurrentRequest()) return;
        setComparativeRanking(res.data);
        setComparisonLoading(false);
      })
      .catch(err => {
        if (!isCurrentRequest()) return;
        console.error('Failed to load comparative ranking:', err);
        setComparisonError(err.message || 'Error loading comparison metrics');
        setComparisonLoading(false);
      });

    // API 3: Monthly Profit (trì hoãn 200ms)
    setMonthlyLoading(true);
    setMonthlyError(null);
    schedule(() => {
      getDashboardOverviewMonthlyProfit(params)
        .then(res => {
          if (!isCurrentRequest()) return;
          setMonthlyProfit(res.data || []);
          setMonthlyLoading(false);
        })
        .catch(err => {
          if (!isCurrentRequest()) return;
          console.error('Failed to load monthly profit:', err);
          setMonthlyError(err.message || 'Error loading monthly profit');
          setMonthlyLoading(false);
        });
    }, 200);

    // API 4: Yearly Performance & Quality (trì hoãn 400ms)
    setYearlyLoading(true);
    setYearlyError(null);
    schedule(() => {
      getDashboardOverviewYearlyPerformance(params)
        .then(res => {
          if (!isCurrentRequest()) return;
          setYearlyPerformance(res.data || { yearlyComparison: [], qualityDistribution: [] });
          setYearlyLoading(false);
        })
        .catch(err => {
          if (!isCurrentRequest()) return;
          console.error('Failed to load yearly performance:', err);
          setYearlyError(err.message || 'Error loading yearly performance');
          setYearlyLoading(false);
        });
    }, 400);

    // API 6: Breakdown (trì hoãn 600ms)
    setBreakdownLoading(true);
    setBreakdownError(null);
    schedule(() => {
      getDashboardOverviewBreakdown(params)
        .then(res => {
          if (!isCurrentRequest()) return;
          setBreakdownData(res.data);
          setBreakdownLoading(false);
        })
        .catch(err => {
          if (!isCurrentRequest()) return;
          console.error('Failed to load breakdown data:', err);
          setBreakdownError(err.message || 'Error loading breakdown');
          setBreakdownLoading(false);
        });
    }, 600);

    // API Top Stats (trì hoãn 200ms)
    setTopStatsLoading(true);
    setTopStatsError(null);
    schedule(() => {
      getDashboardOverviewTopStats(params)
        .then(res => {
          if (!isCurrentRequest()) return;
          setTopStats(res.data || { topStrategies: [], topSymbols: [] });
          setTopStatsLoading(false);
        })
        .catch(err => {
          if (!isCurrentRequest()) return;
          console.error('Failed to load top stats:', err);
          setTopStatsError(err.message || 'Error loading top stats');
          setTopStatsLoading(false);
        });
    }, 200);
  };

  // ✅ FETCH DATA - CHỈ FETCH KHI TABLE THAY ĐỔI
  const resetOverviewData = () => {
    setDashboardData(null);
    setDashboardCore(null);
    setMonthlyProfit([]);
    setTopStats({ topStrategies: [], topSymbols: [] });
    setYearlyPerformance({ yearlyComparison: [], qualityDistribution: [] });
    setBehaviorSummary(null);
    setComparativeRanking(null);
    setBreakdownData(null);

    setCoreLoading(false);
    setMonthlyLoading(false);
    setTopStatsLoading(false);
    setYearlyLoading(false);
    setBehaviorSummaryLoading(false);
    setComparisonLoading(false);
    setBreakdownLoading(false);

    setCoreError(null);
    setMonthlyError(null);
    setTopStatsError(null);
    setYearlyError(null);
    setBehaviorSummaryError(null);
    setComparisonError(null);
    setBreakdownError(null);
    setRiskPage(0);
  };

  const loadData = async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    pendingTimersRef.current.forEach(clearTimeout);
    pendingTimersRef.current = [];

    if (loadingTables || !selectedSources || selectedSources.length === 0) {
      resetOverviewData();
      return;
    }

    try {
      setCoreLoading(true);
      setCoreError(null);
      setDashboardCore(null);

      const params = { sourceNames: selectedSources };

      // ✅ Chỉ gửi date range nếu có CẢ startDate và endDate
      if (dateRange.startDate && dateRange.endDate) {
        params.startDate = dayjs(dateRange.startDate).format('YYYY-MM-DD');
        params.endDate = dayjs(dateRange.endDate).format('YYYY-MM-DD');
      }

      const res = await getDashboardOverviewCore(params);
      if (requestIdRef.current !== requestId) return;
      if (res && res.success) {
        setDashboardCore(res.data);
        setCoreLoading(false);
        triggerSubsequentCalls(params, requestId);
      } else {
        throw new Error(res?.error || 'Failed to fetch core overview');
      }
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      console.error('Failed to load dashboard core:', err);
      setCoreError(err);
      setCoreLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTable, selectedSources, dateRange, loadingTables]);

  useEffect(() => () => {
    requestIdRef.current += 1;
    pendingTimersRef.current.forEach(clearTimeout);
    pendingTimersRef.current = [];
  }, []);

  const overview = dashboardCore?.overview;
  const fileOptimizationCheck = dashboardCore?.fileOptimizationCheck;
  const riskFlagsCheck = dashboardCore?.riskFlagsCheck;

  const topStrategies = topStats?.topStrategies || [];
  const topSymbols = topStats?.topSymbols || [];

  const yearlyComparison = yearlyPerformance?.yearlyComparison || [];
  const qualityDistribution = yearlyPerformance?.qualityDistribution || [];

  const comparativeData = comparativeRanking;
  const detailedReport = breakdownData;
  const reportPnl = detailedReport?.pnl;
  const reportRisk = detailedReport?.riskMetrics;

  const totalStrategies = overview?.totalStrategies ?? 0;
  const totalDeals = overview?.totalDeals ?? 0;
  const netProfit = reportPnl?.netProfit ?? overview?.totalProfit ?? 0;
  const grossProfit = reportPnl?.grossProfit ?? 0;
  const grossLoss = reportPnl?.grossLoss ?? 0;
  const avgTrades = totalStrategies > 0 ? Math.round(totalDeals / totalStrategies) : 0;
  const expectedPayoff = overview?.avgProfitPerDeal ?? reportRisk?.avgExpectedPayoff ?? 0;
  const portfolioPF =
    reportPnl?.portfolioProfitFactor != null
      ? String(reportPnl.portfolioProfitFactor)
      : grossLoss > 0
        ? (grossProfit / grossLoss).toFixed(2)
        : '—';
  const avgWinrate = overview?.winRate ?? reportRisk?.avgWinrate ?? 0;
  const profitPercent =
    reportPnl?.profitPercent != null ? String(reportPnl.profitPercent) : '0';
  const lossPercent =
    reportPnl?.lossPercent != null ? String(reportPnl.lossPercent) : '0';
  const hasDateFilter = Boolean(dateRange.startDate && dateRange.endDate);

  // Behavior analysis overview data calculations
  const totalBehaviorStrats = behaviorData?.strategyYears?.length || 0;
  const flaggedBias = behaviorData?.summary?.flaggedBias || 0;
  const mismatch = behaviorData?.summary?.mismatch || 0;
  const criticalActivity = behaviorData?.summary?.criticalActivity || 0;
  const holdingRecoveryData = behaviorData?.holdingRecoveryData || [];

  // Count unique strategy IDs with behavior flags
  const flaggedStrategyIds = new Set([
    ...(behaviorData?.directionalBiasData || []).filter(r => r.weakPct < 20).map(r => r.id),
    ...(behaviorData?.timeframeMismatchData || []).map(r => r.id),
    ...(behaviorData?.activityGapData || []).filter(r => r.maxGap >= 40 || r.zeroMonths >= 6).map(r => r.id)
  ]);
  const uniqueFlaggedCount = flaggedStrategyIds.size;
  const behaviorCleanCount = Math.max(0, totalBehaviorStrats - uniqueFlaggedCount);

  const behaviorCleanRate = totalBehaviorStrats > 0 ? ((behaviorCleanCount / totalBehaviorStrats) * 100).toFixed(1) : '100.0';

  const behaviorPieData = [
    { name: 'Balanced & Stable', value: behaviorCleanCount, color: '#2E7D32' },
    { name: 'Behavior Flags', value: uniqueFlaggedCount, color: '#D32F2F' }
  ];

  const behaviorBarData = [
    { name: 'Bias', count: flaggedBias, fill: flaggedBias > 0 ? '#D32F2F' : '#2E7D32' },
    { name: 'Mismatch', count: mismatch, fill: mismatch > 0 ? '#D32F2F' : '#2E7D32' },
    { name: 'Gaps', count: criticalActivity, fill: criticalActivity > 0 ? '#D32F2F' : '#2E7D32' },
    {
      name: 'Loss Aversion',
      count: holdingRecoveryData.filter((row) => row.status === 'Loss Averse' || row.status === 'Critical Risk').length,
      fill: holdingRecoveryData.some((row) => row.status === 'Loss Averse' || row.status === 'Critical Risk') ? '#e5a800' : '#2E7D32'
    },
    {
      name: 'Martingale',
      count: holdingRecoveryData.filter((row) => row.status === 'Martingale Risk' || row.status === 'Critical Risk').length,
      fill: holdingRecoveryData.some((row) => row.status === 'Martingale Risk' || row.status === 'Critical Risk') ? '#D32F2F' : '#2E7D32'
    }
  ];

  const scopeLabelMap = {
    full: 'Full period',
    range: 'Date range'
  };

  const renderScopeChip = (scope) => {
    if (!scope) return null;
    return (
      <Chip
        label={scopeLabelMap[scope] || scope}
        size="small"
        variant="outlined"
        sx={{ height: 18, fontSize: '0.65rem', borderRadius: 1, ml: 0.75 }}
      />
    );
  };

  const symbolRankList = getSymbolRankData(comparativeData?.averages, symbolMetric);
  const h1vsH4Data = calculateH1vsH4Aggregate(comparativeData?.duels);
  const obVsOsData = calculateOBvsOSAggregate(comparativeData?.obOs);

  const h1vsH4Rows = [
    { name: 'Avg profit', key: 'profit', label: 'Avg profit' },
    { name: 'Sharpe', key: 'sharpe', label: 'Sharpe' },
    { name: 'PF', key: 'pf', label: 'PF' },
    { name: 'DD%', key: 'drawdownPct', label: 'DD%' },
    { name: 'P/D', key: 'pd', label: 'P/D' }
  ];

  const obVsOsRows = [
    { name: 'Avg profit', key: 'profit', label: 'Avg profit' },
    { name: 'Winrate', key: 'winrate', label: 'Winrate' },
    { name: 'Avg trades', key: 'trades', label: 'Avg trades' },
    { name: 'Sharpe', key: 'sharpe', label: 'Sharpe' },
    { name: 'PF', key: 'pf', label: 'PF' }
  ];

  // Helper to compute nice ticks/formatting for axes (supports M and B units)
  const computeNiceStep = (maxScaled) => {
    if (!maxScaled || maxScaled <= 0) return 1;
    const targetTicks = 5;
    const roughStep = maxScaled / targetTicks;
    const exponent = Math.floor(Math.log10(roughStep));
    const pow10 = Math.pow(10, exponent);
    const fraction = roughStep / pow10;
    let niceFraction;
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
    return niceFraction * pow10;
  };

  const computeScaleFor = (arr, key) => {
    const maxVal = Array.isArray(arr) && arr.length ? Math.max(...arr.map((it) => Number(it[key]) || 0)) : 0;
    if (!maxVal) {
      return { unit: 1, ticks: undefined, tickMax: 1, formatter: (v) => formatCurrency(v) };
    }
    let unit = 1;
    if (maxVal >= 1e9)
      unit = 1e9; // B
    else if (maxVal >= 1e6) unit = 1e6; // M

    const scaledMax = Math.ceil(maxVal / unit);
    const step = computeNiceStep(scaledMax);
    const tickMax = Math.ceil(scaledMax / step) * step;
    const ticks = [];
    for (let v = 0; v <= tickMax; v += step) ticks.push(v * unit);

    const formatter = (val) => {
      if (unit === 1e9) {
        const n = val / 1e9;
        return `${Number.isInteger(n) ? n : n.toFixed(1)}B`;
      }
      if (unit === 1e6) {
        const n = val / 1e6;
        return `${Number.isInteger(n) ? n : n.toFixed(1)}M`;
      }
      return formatCurrency(val);
    };

    return { unit, ticks, tickMax: tickMax * unit, formatter };
  };

  const yearScale = computeScaleFor(yearlyComparison, 'totalProfit');
  const monthScale = computeScaleFor(monthlyProfit, 'profit');

  const fileOpt = fileOptimizationCheck || {};
  const fileOptTotal = fileOpt.totalFiles ?? 0;
  const fileOptPassed = fileOpt.passedFiles ?? 0;
  const fileOptFailed = fileOpt.failedFiles ?? 0;
  const fileOptCleanRate = fileOpt.cleanRate ?? (fileOptTotal > 0 ? Number(((fileOptPassed / fileOptTotal) * 100).toFixed(1)) : 100);

  const cleanRateData = (fileOptPassed + fileOptFailed === 0
    ? [{ name: 'Chưa có dữ liệu', value: 1, color: '#9e9e9e' }]
    : [
      { name: 'Đạt tiêu chuẩn (Clean)', value: fileOptPassed, color: 'rgb(46, 139, 87)' },
      { name: 'Phát hiện lỗi (Failed)', value: fileOptFailed, color: '#D32F2F' }
    ].filter((item) => item.value > 0));

  const riskOpt = riskFlagsCheck || {};
  const riskTotalStrats = riskOpt.totalStrategies ?? 0;
  const riskStrats = riskOpt.riskStrategies ?? 0;
  const riskHardCount = riskOpt.hardFlaggedStrategies ?? 0;
  const riskSoftCount = riskOpt.softFlaggedStrategies ?? 0;
  const riskErrorRate = riskOpt.errorRate ?? (riskTotalStrats > 0 ? Number(((riskStrats / riskTotalStrats) * 100).toFixed(1)) : 0);

  const riskWarningCount = riskOpt.warningStrategies ?? 0;
  const riskCleanCount = Math.max(0, riskSoftCount - riskWarningCount);

  const riskFlagsData = (riskHardCount + riskSoftCount === 0
    ? [{ name: 'Không có flags', value: 1, color: '#9e9e9e' }]
    : [
      { name: 'Disqualified (Bị Loại)', value: riskHardCount, color: '#D32F2F' },
      { name: 'Warning (Cảnh Báo Nhẹ)', value: riskWarningCount, color: '#e5a800' },
      { name: 'Passed Clean (Sạch Cờ)', value: riskCleanCount, color: 'rgb(46, 139, 87)' }
    ].filter((item) => item.value > 0));

  const comparisonMetricMeta = BACKTEST_COMPARISON_METRICS.find((item) => item.key === comparisonMetric) || BACKTEST_COMPARISON_METRICS[0];
  const backtestComparisonData = getBacktestComparisonData(comparativeData?.ranking || topStrategies || [], comparisonMetricMeta.key, behaviorData);
  const bestBacktest = backtestComparisonData.find(b => b.rank === 1) || null;
  const secondBacktest = backtestComparisonData.find(b => b.rank === 2) || null;
  const weakestBacktest = backtestComparisonData.find(b => b.rank === backtestComparisonData.length) || null;
  const comparisonGap = bestBacktest && secondBacktest
    ? (comparisonMetricMeta.higherIsBetter
      ? Number((bestBacktest[comparisonMetricMeta.key] - secondBacktest[comparisonMetricMeta.key]).toFixed(2))
      : Number((secondBacktest[comparisonMetricMeta.key] - bestBacktest[comparisonMetricMeta.key]).toFixed(2)))
    : null;
  const comparisonMetricFormatter = (value) => {
    if (comparisonMetricMeta.key === 'totalNetProfit') return formatCurrency(value);
    if (comparisonMetricMeta.key === 'drawdownPct') return `${Number(value || 0).toFixed(1)}%`;
    if (['riskFlagsCount', 'behaviorFlagsCount', 'count'].includes(comparisonMetricMeta.key)) {
      return Number(value || 0).toFixed(0);
    }
    return Number(value || 0).toFixed(2);
  };

  const rankedTopStrategies = (comparativeData?.ranking || topStrategies || [])
    .slice(0, 30)
    .map((strat) => ({
      strategyId: strat.strategyId || strat.id,
      backtestTable: strat.backtestTable || strat.backtest || '',
      totalNetProfit: strat.totalNetProfit ?? strat.profit ?? 0,
      profitFactor: strat.profitFactor ?? strat.pf ?? '—',
      recoveryFactor: strat.recoveryFactor ?? strat.rf ?? '—',
      expectedPayoff: strat.expectedPayoff ?? strat.ep ?? null,
      lrCorrelation: strat.lrCorrelation ?? strat.lr ?? null,
      largestProfitTrade: strat.largestProfitTrade ?? strat.largest_profit_trade ?? null,
      drawdownPct: strat.drawdownPct ?? strat.drawdown_pct ?? null,
      pd: strat.pd ?? '?',
      composite: strat.composite ?? null
    }));

  if (!loadingTables && selectedSources.length === 0) {
    return (
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <DashboardFilterBar title="Trading Dashboard Lotusquant" />
        <Box
          sx={{
            minHeight: 360,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            px: 3,
            textAlign: 'center',
            border: '1px dashed',
            borderColor: 'divider',
            bgcolor: 'background.paper'
          }}
        >
          <InfoCircleOutlined style={{ fontSize: 40, color: theme.palette.primary.main }} />
          <Typography variant="h4" sx={{ mt: 2, mb: 1 }}>
            Chưa chọn Data Source
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 520 }}>
            Vui lòng chọn ít nhất một Data Source để hiển thị dữ liệu Overview.
          </Typography>
        </Box>
      </LocalizationProvider>
    );
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <DashboardFilterBar title="Trading Dashboard Lotusquant" />
      <Grid container rowSpacing={4.5} columnSpacing={2.75}>
        <KpiSummarySection
          overview={overview}
          selectedTable={selectedTable}
          dateRange={dateRange}
          hasDateFilter={hasDateFilter}
          detailedReport={detailedReport}
          fileOptimizationCheck={fileOptimizationCheck}
          formatCurrency={formatCurrency}
          formatNumber={formatNumber}
          renderHeaderActions={renderHeaderActions}
          tooltipSlotProps={tooltipSlotProps}
          isDarkMode={isDarkMode}
          remarksOpen={remarksOpen}
          setRemarksOpen={setRemarksOpen}
          remarksTitle={remarksTitle}
          remarksId={remarksId}
          remarksType={remarksType}
          handleOpenRemarks={handleOpenRemarks}
          reportOpen={reportOpen}
          setReportOpen={setReportOpen}
          aiOverviewOpen={aiOverviewOpen}
          setAiOverviewOpen={setAiOverviewOpen}
          strategySummaryOpen={strategySummaryOpen}
          setStrategySummaryOpen={setStrategySummaryOpen}
          coreLoading={coreLoading}
          coreError={coreError}
        />

        {/* ==================== DIALOGS: HELP MODALS FOR EXTRA CHECKS ==================== */}
        <Dialog
          open={optHelpOpen}
          onClose={() => setOptHelpOpen(false)}
          PaperProps={{ sx: { borderRadius: 3, p: 3, maxWidth: 520, width: '100%' } }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <InfoCircleOutlined style={{ fontSize: 20, color: '#2E75B6' }} />
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'var(--chart-title-color, #1F3864)' }}>
              Kiểm Tra Tối Ưu Hóa File (File Optimization Check)
            </Typography>
          </Box>
          <DialogContent sx={{ p: 0 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.6 }}>
              Quy trình tự động hóa quét và kiểm tra tính toàn vẹn của các file cấu hình tối ưu trước khi nạp vào hệ thống để loại trừ dữ liệu rác hoặc thuật toán lỗi:
            </Typography>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#2E75B6', mb: 0.5 }}>1. Kiểm tra thông tin cơ bản (Group 1 - 3)</Typography>
            <Typography variant="body2" sx={{ color: 'text.primary', mb: 2, pl: 1, fontSize: '0.8rem', lineHeight: 1.6 }}>
              • Symbol, Timeframe, BotId trong file phải khớp tên file.<br />
              • OB: AcceptBuy=true, AcceptSell=false / OS: AcceptSell=true, AcceptBuy=false.<br />
              • Total Net Profit ≥ 0 (điều kiện duyệt file).<br />
              • Total Trades ≥ 100 (điều kiện duyệt file).<br />
              • Nếu file có Total Trades = 0 hoặc rỗng (không phát sinh lệnh) ➔ Báo lỗi: Không phát sinh bất kỳ lệnh deal giao dịch nào (Total Trades = 0).<br />
              • Largest Loss Trade ≥ -20,000 (điều kiện duyệt file).<br />
              • Profit Factor lớn hơn 1.0 (điều kiện duyệt file).<br />
              • Liệt kê các deal mở lệnh có comment không khớp pattern chuẩn {'{id}_{size}_{price}_{tf}_{type}{n}'}.
            </Typography>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#2E75B6', mb: 0.5 }}>2. Kiểm tra logic giao dịch (Group 4)</Typography>
            <Typography variant="body2" sx={{ color: 'text.primary', pl: 1, fontSize: '0.8rem', lineHeight: 1.6 }}>
              • Nếu trong file không tìm thấy mục Deals hoặc danh sách Deals rỗng (không có dòng lệnh buy/sell nào) ➔ Báo lỗi: Không phát sinh bất kỳ lệnh deal giao dịch nào (Danh sách Deals rỗng).<br />
              • Không có deal đóng ngay sau khi mở (cùng timestamp).<br />
              • Không mở lệnh mới khi chưa đóng lệnh cũ.<br />
              • Không có cặp lệnh buy/buy hoặc sell/sell liền nhau.<br />
              • Không có chia lệnh (B2, B3 trong comment).<br />
              • Swap = 0.<br />
              • Volume lớn hơn 0.<br />
              • Không giữ lệnh &lt; 1 phút rồi đóng bằng _CO.
            </Typography>
          </DialogContent>
          <DialogActions sx={{ p: 0, mt: 3 }}>
            <Button
              variant="contained"
              onClick={() => setOptHelpOpen(false)}
              sx={{ bgcolor: '#0f172a', color: '#fff', '&:hover': { bgcolor: '#1e293b' } }}
            >
              Đóng
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={riskHelpOpen}
          onClose={() => setRiskHelpOpen(false)}
          PaperProps={{ sx: { borderRadius: 3, p: 3, maxWidth: 500, width: '100%' } }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <InfoCircleOutlined style={{ fontSize: 20, color: '#D32F2F' }} />
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'var(--chart-title-color, #1F3864)' }}>
              Chỉ Báo Cảnh Báo Rủi Ro (Risk Flags Check)
            </Typography>
          </Box>
          <DialogContent sx={{ p: 0 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.6 }}>
              Hệ thống quét tự động toàn bộ 32 chỉ báo rủi ro (Risk Indicators) trên các chiến lược backtest để phân loại an toàn:
            </Typography>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#D32F2F', mb: 0.5 }}>1. Hard Flags (Nhóm 1–3: Chốt chặn loại trừ)</Typography>
            <Typography variant="body2" sx={{ color: 'text.primary', mb: 2, pl: 1, fontSize: '0.8rem', lineHeight: 1.6 }}>
              • Vi phạm chỉ 1 Hard Flag sẽ bị <strong>Loại ngay lập tức (Disqualified)</strong>.<br />
              • Gồm: Lợi nhuận kỳ vọng âm (Expected Payoff ≤ 0), PF &lt; 1.2, Recovery &lt; 1.0, P/D &lt; 1.0, Martingale Triple Flag, Chuỗi thua ≥ 20 lệnh, thoát lệnh bằng End of Test &gt; 10%, hoặc lợi nhuận 12 tháng gần nhất bị âm.
            </Typography>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#2E7D32', mb: 0.5 }}>2. Soft Flags (Nhóm 4–8: Giám sát & hạ tỷ trọng)</Typography>
            <Typography variant="body2" sx={{ color: 'text.primary', mb: 2, pl: 1, fontSize: '0.8rem', lineHeight: 1.6 }}>
              • Vi phạm &ge; 3 Soft Flags sẽ bị <strong>Hạ mức ưu tiên/tỷ trọng giao dịch</strong>.<br />
              • Gồm: Lợi nhuận may mắn (Outlier &gt; 5σ), chu kỳ theo mùa quá lớn, hiệu năng suy giảm theo thời gian, giữ lệnh quá ngắn (&lt; 5 phút), nhồi lệnh gỡ gạc ẩn, đầu phiên spread rộng, hoặc mất tín hiệu.
            </Typography>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary', mb: 0.5 }}>3. Portfolio Checks (Rủi ro tổng thể danh mục)</Typography>
            <Typography variant="body2" sx={{ color: 'text.primary', pl: 1, fontSize: '0.8rem', lineHeight: 1.6 }}>
              • Theo dõi sự cân bằng của danh mục: Cân bằng Buy/Sell, sự lệ thuộc lợi nhuận vào duy nhất 1 sản phẩm (Concentration), và độ trùng vị thế kép.
            </Typography>
          </DialogContent>
          <DialogActions sx={{ p: 0, mt: 3 }}>
            <Button
              variant="contained"
              onClick={() => setRiskHelpOpen(false)}
              sx={{ bgcolor: '#0f172a', color: '#fff', '&:hover': { bgcolor: '#1e293b' } }}
            >
              Đóng
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={behaviorHelpOpen}
          onClose={() => setBehaviorHelpOpen(false)}
          PaperProps={{ sx: { borderRadius: 3, p: 3, maxWidth: 500, width: '100%' } }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <InfoCircleOutlined style={{ fontSize: 20, color: '#2E7D32' }} />
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'var(--chart-title-color, #1F3864)' }}>
              Kiểm Tra Hành Vi Giao Dịch (Behavior Check)
            </Typography>
          </Box>
          <DialogContent sx={{ p: 0 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.6 }}>
              Hệ thống đánh giá sự nhất quán hành vi giao dịch dựa trên các tiêu chí sau:
            </Typography>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#2E7D32', mb: 0.5 }}>1. Lệch Chiều Giao Dịch (Directional Bias)</Typography>
            <Typography variant="body2" sx={{ color: 'text.primary', mb: 2, pl: 1, fontSize: '0.8rem', lineHeight: 1.6 }}>
              • Kiểm tra tỷ lệ lợi nhuận giữa chiều mua (OB) và chiều bán (OS) của cùng 1 Bot trên cùng timeframe.<br />
              • Cảnh báo nếu chiều yếu chiếm ít hơn 20% tổng profit, cho thấy sự mất cân bằng nghiêm trọng.
            </Typography>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#2E7D32', mb: 0.5 }}>2. Lệch Khung Thời Gian (Timeframe Mismatch)</Typography>
            <Typography variant="body2" sx={{ color: 'text.primary', mb: 2, pl: 1, fontSize: '0.8rem', lineHeight: 1.6 }}>
              • So sánh khối lượng lệnh phát sinh ở H4 so với H1.<br />
              • Cảnh báo nếu số lệnh ở H4 vượt trội (H4 &gt; H1), vi phạm tính nhất quán của khung thời gian đăng ký.
            </Typography>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#2E7D32', mb: 0.5 }}>3. Khoảng Lặng Giao Dịch (Trading Inactivity Gaps)</Typography>
            <Typography variant="body2" sx={{ color: 'text.primary', pl: 1, fontSize: '0.8rem', lineHeight: 1.6 }}>
              • Kiểm tra khoảng thời gian trống lệnh lớn nhất giữa 2 giao dịch.<br />
              • Cảnh báo nếu có khoảng lặng trống lệnh quá dài (&ge; 40 ngày) hoặc có từ 6 tháng liên tiếp không phát sinh lệnh.
            </Typography>
          </DialogContent>
          <DialogActions sx={{ p: 0, mt: 3 }}>
            <Button
              variant="contained"
              onClick={() => setBehaviorHelpOpen(false)}
              sx={{ bgcolor: '#0f172a', color: '#fff', '&:hover': { bgcolor: '#1e293b' } }}
            >
              Đóng
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={profitTrendHelpOpen}
          onClose={() => setProfitTrendHelpOpen(false)}
          PaperProps={{ sx: { borderRadius: 3, p: 3, maxWidth: 500, width: '100%', bgcolor: theme.palette.mode === 'dark' ? '#1e293b' : '#fff', color: theme.palette.mode === 'dark' ? '#f8fafc' : '#0f172a' } }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <InfoCircleOutlined style={{ fontSize: 20, color: theme.palette.mode === 'dark' ? '#38bdf8' : '#16b5dd' }} />
            <Typography variant="h5" sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? '#94d7ff' : '#1F3864' }}>
              Phân Tích Xu Hướng Lợi Nhuận (Profit Trend)
            </Typography>
          </Box>
          <DialogContent sx={{ p: 0 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.6 }}>
              Báo cáo trực quan sự phân bổ lợi nhuận tích lũy của toàn bộ chiến lược theo thời gian:
            </Typography>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? '#38bdf8' : '#0284c7', mb: 0.5 }}>1. Monthly Profit Trend (Xu hướng theo tháng)</Typography>
            <Typography variant="body2" sx={{ color: 'text.primary', mb: 2, pl: 1, fontSize: '0.8rem', lineHeight: 1.6 }}>
              • Tổng hợp lợi nhuận thực tế đạt được qua từng tháng.<br />
              • Giúp xác định tính chu kỳ của thị trường và tính ổn định của dòng tiền.
            </Typography>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? '#38bdf8' : '#0284c7', mb: 0.5 }}>2. Yearly Performance (Hiệu suất theo năm)</Typography>
            <Typography variant="body2" sx={{ color: 'text.primary', pl: 1, fontSize: '0.8rem', lineHeight: 1.6 }}>
              • So sánh tương quan kết quả giao dịch qua các năm tài chính.<br />
              • Đánh giá khả năng thích ứng dài hạn của các chiến lược qua nhiều giai đoạn thị trường khác nhau.
            </Typography>
          </DialogContent>
          <DialogActions sx={{ p: 0, mt: 3 }}>
            <Button
              variant="contained"
              onClick={() => setProfitTrendHelpOpen(false)}
              sx={{
                bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : '#0f172a',
                color: theme.palette.mode === 'dark' ? '#e2e8f0' : '#fff',
                '&:hover': { bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.15)' : '#1e293b' }
              }}
            >
              Đóng
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={qualityDistHelpOpen}
          onClose={() => setQualityDistHelpOpen(false)}
          PaperProps={{ sx: { borderRadius: 3, p: 3, maxWidth: 500, width: '100%', bgcolor: theme.palette.mode === 'dark' ? '#1e293b' : '#fff', color: theme.palette.mode === 'dark' ? '#f8fafc' : '#0f172a' } }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <InfoCircleOutlined style={{ fontSize: 20, color: theme.palette.mode === 'dark' ? '#34d399' : '#0F6E56' }} />
            <Typography variant="h5" sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? '#94d7ff' : '#1F3864' }}>
              Phân Phối Chất Lượng Chiến Lược (Quality Distribution)
            </Typography>
          </Box>
          <DialogContent sx={{ p: 0 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.6 }}>
              Thống kê mật độ phân bổ các chỉ số chất lượng chính để đánh giá sức khỏe của danh mục chiến lược:
            </Typography>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? '#34d399' : '#0F6E56', mb: 0.5 }}>1. Profit Factor (PF - Hệ số lợi nhuận)</Typography>
            <Typography variant="body2" sx={{ color: 'text.primary', mb: 2, pl: 1, fontSize: '0.8rem', lineHeight: 1.6 }}>
              • Tỷ lệ giữa tổng số tiền thắng / tổng số tiền thua. Khuyên dùng PF &ge; 1.5. PF &lt; 1.2 có biên lợi nhuận quá mỏng.
            </Typography>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? '#34d399' : '#0F6E56', mb: 0.5 }}>2. Sharpe Ratio (Chỉ số Sharpe)</Typography>
            <Typography variant="body2" sx={{ color: 'text.primary', mb: 2, pl: 1, fontSize: '0.8rem', lineHeight: 1.6 }}>
              • Đo lường tỷ suất sinh lời trên mỗi đơn vị rủi ro biến động. Sharpe Ratio &ge; 1.0 được đánh giá là hiệu suất ổn định và chất lượng tốt.
            </Typography>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? '#34d399' : '#0F6E56', mb: 0.5 }}>3. Recovery Factor (RF - Hệ số phục hồi)</Typography>
            <Typography variant="body2" sx={{ color: 'text.primary', mb: 2, pl: 1, fontSize: '0.8rem', lineHeight: 1.6 }}>
              • Tỷ số giữa tổng lợi nhuận ròng / mức sụt giảm tài khoản lớn nhất (Max Drawdown). RF &ge; 3.0 thể hiện khả năng gượng dậy nhanh sau thua lỗ.
            </Typography>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? '#34d399' : '#0F6E56', mb: 0.5 }}>4. P/D Ratio (Lợi nhuận / Sụt giảm)</Typography>
            <Typography variant="body2" sx={{ color: 'text.primary', pl: 1, fontSize: '0.8rem', lineHeight: 1.6 }}>
              • Tỷ lệ Profit / Drawdown thực tế trong khoảng thời gian lọc. Tiêu chuẩn khuyên dùng P/D &ge; 2.0.
            </Typography>
          </DialogContent>
          <DialogActions sx={{ p: 0, mt: 3 }}>
            <Button
              variant="contained"
              onClick={() => setQualityDistHelpOpen(false)}
              sx={{
                bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : '#0f172a',
                color: theme.palette.mode === 'dark' ? '#e2e8f0' : '#fff',
                '&:hover': { bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.15)' : '#1e293b' }
              }}
            >
              Đóng
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={breakdownHelpOpen}
          onClose={() => setBreakdownHelpOpen(false)}
          PaperProps={{ sx: { borderRadius: 3, p: 3, maxWidth: 500, width: '100%', bgcolor: theme.palette.mode === 'dark' ? '#1e293b' : '#fff', color: theme.palette.mode === 'dark' ? '#f8fafc' : '#0f172a' } }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <InfoCircleOutlined style={{ fontSize: 20, color: theme.palette.mode === 'dark' ? '#60a5fa' : '#1f3864' }} />
            <Typography variant="h5" sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? '#94d7ff' : '#1F3864' }}>
              Phân Tích Chi Tiết Hiệu Suất (Breakdown Analysis)
            </Typography>
          </Box>
          <DialogContent sx={{ p: 0 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.6 }}>
              So sánh và phân tích sâu các khía cạnh cấu thành hiệu suất danh mục:
            </Typography>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? '#60a5fa' : '#1f3864', mb: 0.5 }}>1. Symbol Ranking (Xếp hạng Symbol)</Typography>
            <Typography variant="body2" sx={{ color: 'text.primary', mb: 2, pl: 1, fontSize: '0.8rem', lineHeight: 1.6 }}>
              • Sắp xếp các sản phẩm giao dịch theo chỉ số chất lượng trung bình (mặc định là P/D).<br />
              • Gán xu hướng Tăng / Giữ / Giảm / Review dựa trên vị trí xếp hạng của Symbol đó.
            </Typography>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? '#60a5fa' : '#1f3864', mb: 0.5 }}>2. H1 vs H4 (Đối đầu Khung thời gian)</Typography>
            <Typography variant="body2" sx={{ color: 'text.primary', mb: 2, pl: 1, fontSize: '0.8rem', lineHeight: 1.6 }}>
              • So sánh đối chiếu trực tiếp hiệu năng bình quân của các chiến lược trên khung thời gian H1 so với H4.<br />
              • Nhìn nhận nhanh khung thời gian nào đang cho hiệu quả tối ưu nhất.
            </Typography>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? '#60a5fa' : '#1f3864', mb: 0.5 }}>3. OB vs OS (Đối đầu chiều lệnh Mua/Bán)</Typography>
            <Typography variant="body2" sx={{ color: 'text.primary', pl: 1, fontSize: '0.8rem', lineHeight: 1.6 }}>
              • So sánh tương quan hiệu suất bình quân giữa chiều mua (OB) và chiều bán (OS) để phát hiện sự lệch pha nghiêm trọng.
            </Typography>
          </DialogContent>
          <DialogActions sx={{ p: 0, mt: 3 }}>
            <Button
              variant="contained"
              onClick={() => setBreakdownHelpOpen(false)}
              sx={{
                bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : '#0f172a',
                color: theme.palette.mode === 'dark' ? '#e2e8f0' : '#fff',
                '&:hover': { bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.15)' : '#1e293b' }
              }}
            >
              Đóng
            </Button>
          </DialogActions>
        </Dialog>

        {/* ==================== HEALTH CHECK ==================== */}
        <Grid size={12}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0, mb: -1.5 }}>
            <Box sx={{ flexGrow: 1, height: '1px', bgcolor: 'divider' }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Health Check
            </Typography>
            <Box sx={{ flexGrow: 1, height: '1px', bgcolor: 'divider' }} />
          </Box>
        </Grid>

        {/* ==================== FILE OPTIMIZATION CHECK ==================== */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MainCard
            title={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'var(--chart-title-color, #1F3864)', textTransform: 'uppercase', letterSpacing: '0.2px' }}>
                  FILE OPTIMIZATION CHECK
                </Typography>
                <IconButton
                  size="small"
                  onClick={() => setOptHelpOpen(true)}
                  sx={{ p: 0.25, color: '#2E75B6' }}
                >
                  <QuestionCircleOutlined style={{ fontSize: '14px' }} />
                </IconButton>
              </Box>
            }
            secondary={renderHeaderActions('File Optimization Check', `Phân tích kiểm tra tối ưu hóa file (File Optimization Check) của bảng backtest ${selectedTable}`, fileOptimizationCheck)}
            sx={{ bgcolor: '#ffffff', height: '100%' }}
          >
            {coreLoading ? (
              <CardLoader height={185} size={30} />
            ) : coreError ? (
              <CardError error={coreError} />
            ) : (
              <Grid container spacing={1} sx={{ alignItems: 'center' }}>
              {/* Left Side: 4 vertical cards */}
              <Grid size={5}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {[
                    { label: 'Total Files', val: fileOptTotal, color: 'var(--chart-title-color, #1F3864)', bg: '#BDD7EE', isNeutral: true },
                    { label: 'Total Backtests', val: fileOpt.totalBacktests ?? 0, color: 'var(--chart-title-color, #1F3864)', bg: 'rgba(157, 195, 230, 0.25)', isNeutral: true },
                    { label: 'Passed Files', val: fileOptPassed, color: 'rgb(46, 139, 87)', bg: 'rgba(46, 139, 87, 0.12)', isNeutral: false },
                    { label: 'Failed Files', val: fileOptFailed, color: '#D32F2F', bg: 'rgba(211, 47, 47, 0.08)', isNeutral: false }
                  ].map((card, idx) => (
                    <Box
                      key={idx}
                      sx={(theme) => ({
                        p: 0.5,
                        px: 1,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        bgcolor: theme.palette.mode === 'dark' ? (card.isNeutral ? 'rgba(255,255,255,0.05)' : card.bg) : card.bg,
                        borderRadius: 1.5,
                        border: '1px solid',
                        borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(31, 56, 100, 0.15)'
                      })}
                    >
                      <Typography variant="caption" sx={(theme) => ({
                        fontWeight: 700,
                        color: theme.palette.mode === 'dark'
                          ? (card.isNeutral ? '#94a3b8' : card.color)
                          : (card.color === 'var(--chart-title-color, #1F3864)' ? 'var(--chart-title-color, #1F3864)' : card.color),
                        fontSize: '0.6rem', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                      })}>
                        {card.label}
                      </Typography>
                      <Typography variant="subtitle1" sx={(theme) => ({
                        fontWeight: 800,
                        color: theme.palette.mode === 'dark'
                          ? (card.isNeutral ? '#e2e8f0' : card.color)
                          : card.color,
                        fontSize: '0.85rem'
                      })}>
                        {card.val}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Grid>

              {/* Right Side: Donut PieChart */}
              <Grid size={7}>
                <Box sx={{ position: 'relative', width: '100%', height: 165, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Box sx={{ width: '100%', height: '100%', zIndex: 2, position: 'relative' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={cleanRateData}
                          cx="50%"
                          cy="50%"
                          startAngle={90}
                          endAngle={-270}
                          innerRadius={48}
                          outerRadius={65}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {cleanRateData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => [`${value} files`, 'Count']} />
                      </PieChart>
                    </ResponsiveContainer>
                  </Box>
                  <Box sx={{ position: 'absolute', textAlign: 'center', zIndex: 1, pointerEvents: 'none' }}>
                    <Typography variant="h5" sx={{ fontWeight: 800, color: 'var(--chart-title-color, #1F3864)', lineHeight: 1, fontSize: '1.15rem' }}>{fileOptCleanRate}%</Typography>
                    <Typography variant="caption" sx={{ color: 'var(--chart-title-color, #1F3864)', fontSize: '8px', fontWeight: 600, textTransform: 'uppercase' }}>Clean Rate</Typography>
                  </Box>
                </Box>
                {/* Inline legends under chart */}
                <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1.5, mt: -0.5, pb: 0.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'rgb(46, 139, 87)' }} />
                    <Typography variant="caption" sx={{ fontSize: '9px', color: 'rgb(46, 139, 87)', fontWeight: 600 }}>Passed</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#D32F2F' }} />
                    <Typography variant="caption" sx={{ fontSize: '9px', color: '#D32F2F', fontWeight: 600 }}>Failed</Typography>
                  </Box>
                </Box>
              </Grid>
            </Grid>
          )}
        </MainCard>
      </Grid>

        {/* ==================== RISK FLAGS CHECK ==================== */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MainCard
            title={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'var(--chart-title-color, #1F3864)', textTransform: 'uppercase', letterSpacing: '0.2px' }}>
                  RISK FLAGS CHECK
                </Typography>
                <IconButton
                  size="small"
                  onClick={() => setRiskHelpOpen(true)}
                  sx={{ p: 0.25, color: 'rgb(46, 139, 87)' }}
                >
                  <QuestionCircleOutlined style={{ fontSize: '14px' }} />
                </IconButton>
              </Box>
            }
            secondary={renderHeaderActions('Risk Flags Check', `Phân tích chỉ báo rủi ro (Risk Flags Check) của bảng backtest ${selectedTable}`, riskFlagsCheck)}
            sx={{ bgcolor: '#ffffff', height: '100%' }}
          >
            {coreLoading ? (
              <CardLoader height={185} size={30} />
            ) : coreError ? (
              <CardError error={coreError} />
            ) : (
              <Grid container spacing={1} sx={{ alignItems: 'center' }}>
              {/* Left Side: 4 vertical cards */}
              <Grid size={5}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {[
                    { label: 'Total Checked', val: riskTotalStrats, color: 'var(--chart-title-color, #1F3864)', bg: '#BDD7EE', isNeutral: true },
                    { label: 'Disqualified', val: riskStrats, color: '#D32F2F', bg: 'rgba(211, 47, 47, 0.06)', isNeutral: false },
                    { label: 'Warning Strats', val: riskWarningCount, color: '#e5a800', bg: 'rgba(229, 168, 0, 0.08)', isNeutral: false },
                    { label: 'Passed Clean', val: riskCleanCount, color: 'rgb(46, 139, 87)', bg: 'rgba(46, 139, 87, 0.12)', isNeutral: false }
                  ].map((card, idx) => (
                    <Box
                      key={idx}
                      sx={(theme) => ({
                        p: 0.5,
                        px: 1,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        bgcolor: theme.palette.mode === 'dark' ? (card.isNeutral ? 'rgba(255,255,255,0.05)' : card.bg) : card.bg,
                        borderRadius: 1.5,
                        border: '1px solid',
                        borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(31, 56, 100, 0.15)'
                      })}
                    >
                      <Typography variant="caption" sx={(theme) => ({
                        fontWeight: 700,
                        color: theme.palette.mode === 'dark'
                          ? (card.isNeutral ? '#94a3b8' : card.color)
                          : (card.color === 'var(--chart-title-color, #1F3864)' ? 'var(--chart-title-color, #1F3864)' : card.color),
                        fontSize: '0.6rem', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                      })}>
                        {card.label}
                      </Typography>
                      <Typography variant="subtitle1" sx={(theme) => ({
                        fontWeight: 800,
                        color: theme.palette.mode === 'dark'
                          ? (card.isNeutral ? '#e2e8f0' : card.color)
                          : card.color,
                        fontSize: '0.85rem'
                      })}>
                        {card.val}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Grid>

              {/* Right Side: Donut PieChart */}
              <Grid size={7}>
                <Box sx={{ position: 'relative', width: '100%', height: 165, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Box sx={{ width: '100%', height: '100%', zIndex: 2, position: 'relative' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={riskFlagsData}
                          cx="50%"
                          cy="50%"
                          startAngle={90}
                          endAngle={-270}
                          innerRadius={48}
                          outerRadius={65}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {riskFlagsData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => [`${value} strategies`, 'Count']} />
                      </PieChart>
                    </ResponsiveContainer>
                  </Box>
                  <Box sx={{ position: 'absolute', textAlign: 'center', zIndex: 1, pointerEvents: 'none' }}>
                    <Typography variant="h5" sx={{ fontWeight: 800, color: '#D32F2F', lineHeight: 1, fontSize: '1.15rem' }}>{riskErrorRate}%</Typography>
                    <Typography variant="caption" sx={{ color: '#D32F2F', fontSize: '8px', fontWeight: 600, textTransform: 'uppercase' }}>Error Rate</Typography>
                  </Box>
                </Box>
                {/* Inline legends under chart */}
                <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: -0.5, pb: 0.5, flexWrap: 'wrap' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'rgb(46, 139, 87)' }} />
                    <Typography variant="caption" sx={{ fontSize: '9px', color: 'rgb(46, 139, 87)', fontWeight: 600 }}>Passed Clean</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#e5a800' }} />
                    <Typography variant="caption" sx={{ fontSize: '9px', color: '#e5a800', fontWeight: 600 }}>Warning</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#D32F2F' }} />
                    <Typography variant="caption" sx={{ fontSize: '9px', color: '#D32F2F', fontWeight: 600 }}>Disqualified</Typography>
                  </Box>
                </Box>
              </Grid>
            </Grid>
          )}
        </MainCard>
      </Grid>

        {/* ==================== BEHAVIOR ANALYSIS CHECK ==================== */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MainCard
            title={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'var(--chart-title-color, #1F3864)', textTransform: 'uppercase', letterSpacing: '0.2px' }}>
                  BEHAVIOR CHECK
                </Typography>
                <IconButton
                  size="small"
                  onClick={() => setBehaviorHelpOpen(true)}
                  sx={{ p: 0.25, color: '#2E7D32' }}
                >
                  <QuestionCircleOutlined style={{ fontSize: '14px' }} />
                </IconButton>
              </Box>
            }
            secondary={renderHeaderActions('Behavior Check', `Phân tích kiểm tra hành vi (Behavior Check) của bảng backtest ${selectedTable}`, behaviorBarData)}
            sx={{ bgcolor: '#ffffff', height: '100%' }}
          >
            {behaviorSummaryLoading ? (
              <CardLoader height={185} size={30} />
            ) : behaviorSummaryError ? (
              <CardError error={behaviorSummaryError} />
            ) : (
              <Box sx={{ width: '100%', height: 185, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={behaviorBarData} margin={{ top: 10, right: 10, left: -22, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="name"
                      interval={0}
                      height={36}
                      tickMargin={8}
                      tick={{ fontSize: 9, fontWeight: 600, fill: 'var(--chart-title-color, #1F3864)' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis tick={{ fontSize: 9, fill: 'var(--chart-title-color, #1F3864)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip formatter={(value) => [`${value} strategies`, 'Count']} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={26}>
                      {behaviorBarData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            )}
          </MainCard>
        </Grid>

        {/* ==================== COMPARATIVE RANKING OVERVIEW ==================== */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MainCard
            title={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'var(--chart-title-color, #1F3864)', textTransform: 'uppercase', letterSpacing: '0.2px' }}>
                  COMPARATIVE RANKING
                </Typography>
              </Box>
            }
            secondary={renderHeaderActions('Comparative Ranking', `Phân tích bảng xếp hạng so sánh (Comparative Ranking) của bảng backtest ${selectedTable}`, comparativeData?.ranking)}
            sx={{ bgcolor: '#ffffff', height: '100%' }}
          >
            {topStatsLoading || comparisonLoading ? (
              <CardLoader height={200} size={30} />
            ) : comparisonError ? (
              <CardError error={comparisonError} />
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, height: 200, overflowY: 'auto', pr: 0.5 }}>
                {rankedTopStrategies.length > 0 ? (
                  rankedTopStrategies.map((strat, idx) => {
                  const tooltipContent = (
                    <Box sx={{ p: 1, minWidth: 240 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75, borderBottom: '1px solid rgba(255,255,255,0.2)', pb: 0.5, fontFamily: 'monospace', color: '#16b5dd' }}>
                        Strategy Diagnostics
                      </Typography>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>ID:</Typography>
                          <Typography variant="caption" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>{strat.strategyId}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>Table:</Typography>
                          <Typography variant="caption" sx={{ fontWeight: 700, fontFamily: 'monospace', color: '#90caf9' }}>{strat.backtestTable}</Typography>
                        </Box>
                        <Box sx={{ height: '1px', bgcolor: 'rgba(255,255,255,0.1)', my: 0.5 }} />
                        <Grid container spacing={1}>
                          <Grid item xs={6}>
                            <Typography variant="caption" display="block" color="rgba(255,255,255,0.6)">P/D Ratio</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: '#4caf50' }}>{strat.pd}</Typography>
                          </Grid>
                          <Grid item xs={6}>
                            <Typography variant="caption" display="block" color="rgba(255,255,255,0.6)">Net Profit</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: strat.totalNetProfit >= 0 ? '#4caf50' : '#f44336' }}>
                              {formatCurrency(strat.totalNetProfit)}
                            </Typography>
                          </Grid>
                          <Grid item xs={6}>
                            <Typography variant="caption" display="block" color="rgba(255,255,255,0.6)">Profit Factor</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>{strat.profitFactor}</Typography>
                          </Grid>
                          <Grid item xs={6}>
                            <Typography variant="caption" display="block" color="rgba(255,255,255,0.6)">Recovery Factor</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>{strat.recoveryFactor}</Typography>
                          </Grid>
                          <Grid item xs={6}>
                            <Typography variant="caption" display="block" color="rgba(255,255,255,0.6)">Largest Profit Trade</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: strat.largestProfitTrade >= 0 ? '#4caf50' : '#f44336' }}>
                              {formatCurrency(strat.largestProfitTrade)}
                            </Typography>
                          </Grid>
                          <Grid item xs={6}>
                            <Typography variant="caption" display="block" color="rgba(255,255,255,0.6)">Balance Drawdown Maximal</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: '#ff9800' }}>
                              {strat.drawdownPct != null ? `${formatCompactNumber(strat.drawdownPct, 2)}%` : '-'}
                            </Typography>
                          </Grid>
                          <Grid item xs={6}>
                            <Typography variant="caption" display="block" color="rgba(255,255,255,0.6)">Exp. Payoff</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>{formatCurrency(strat.expectedPayoff)}</Typography>
                          </Grid>
                          <Grid item xs={6}>
                            <Typography variant="caption" display="block" color="rgba(255,255,255,0.6)">LR Correlation</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>{strat.lrCorrelation}</Typography>
                          </Grid>
                        </Grid>
                      </Box>
                    </Box>
                  );

                  return (
                    <MuiTooltip key={idx} title={tooltipContent} arrow placement="left" enterTouchDelay={0} slotProps={tooltipSlotProps}>
                      <Box
                        sx={(theme) => ({
                          p: 1.25,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 0.5,
                          bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#ffffff',
                          borderRadius: 2,
                          border: '1px solid',
                          borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(31, 56, 100, 0.08)',
                          boxShadow: theme.palette.mode === 'dark' ? 'none' : '0 2px 4px rgba(0,0,0,0.01)',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease-in-out',
                          '&:hover': {
                            borderColor: 'primary.main',
                            boxShadow: theme.palette.mode === 'dark' ? '0 4px 12px rgba(0,0,0,0.3)' : '0 4px 12px rgba(0,0,0,0.05)',
                            transform: 'translateY(-1px)'
                          }
                        })}
                      >
                        {/* Header Row */}
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                            <Box
                              sx={(theme) => ({
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 18,
                                height: 18,
                                borderRadius: '50%',
                                bgcolor: idx === 0 ? '#FFD700' : idx === 1 ? '#C0C0C0' : idx === 2 ? '#CD7F32' : (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(31, 56, 100, 0.08)'),
                                color: idx < 3 ? '#fff' : theme.palette.text.secondary,
                                fontWeight: 800,
                                fontSize: '0.65rem',
                                flexShrink: 0
                              })}
                            >
                              {idx + 1}
                            </Box>
                            <Typography
                              variant="caption"
                              sx={{
                                fontWeight: 700,
                                color: 'var(--chart-title-color, #1F3864)',
                                fontFamily: 'monospace',
                                fontSize: '0.72rem',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}
                            >
                              {strat.strategyId}
                            </Typography>
                          </Box>
                          <Chip
                            label={`P/D: ${formatCompactNumber(strat.pd, 2)}`}
                            size="small"
                            sx={{
                              height: 16,
                              fontSize: '0.625rem',
                              fontWeight: 700,
                              bgcolor: strat.pd >= 2.0 ? '#edf7ed' : '#fff8e1',
                              color: strat.pd >= 2.0 ? '#2e7d32' : '#b78103',
                              border: '1px solid',
                              borderColor: strat.pd >= 2.0 ? 'rgba(46, 125, 50, 0.2)' : 'rgba(183, 129, 3, 0.2)',
                              borderRadius: 1
                            }}
                          />
                        </Box>

                        {/* Metric Grid */}
                        <Box
                          sx={(theme) => ({
                            mt: 0.5,
                            pt: 0.75,
                            borderTop: `1px dashed ${theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(31, 56, 100, 0.06)'}`,
                            display: 'grid',
                            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                            gap: 0.5,
                            alignItems: 'start'
                          })}
                        >
                          <Box sx={{ textAlign: 'left' }}>
                            <Typography variant="caption" sx={{ fontSize: '0.58rem', color: 'text.secondary', display: 'block', lineHeight: 1 }}>
                              PnL
                            </Typography>
                            <Typography variant="caption" sx={{ fontSize: '0.68rem', fontWeight: 700, color: strat.totalNetProfit >= 0 ? '#2e7d32' : '#d32f2f', whiteSpace: 'nowrap' }}>
                              {formatCompactCurrency(strat.totalNetProfit)}
                            </Typography>
                          </Box>
                          <Box sx={{ textAlign: 'center' }}>
                            <Typography variant="caption" sx={{ fontSize: '0.58rem', color: 'text.secondary', display: 'block', lineHeight: 1 }}>
                              PF
                            </Typography>
                            <Typography variant="caption" sx={{ fontSize: '0.68rem', fontWeight: 600, color: 'text.primary', whiteSpace: 'nowrap' }}>
                              {formatCompactNumber(strat.profitFactor, 2)}
                            </Typography>
                          </Box>
                          <Box sx={{ textAlign: 'center' }}>
                            <Typography variant="caption" sx={{ fontSize: '0.58rem', color: 'text.secondary', display: 'block', lineHeight: 1 }}>
                              RF
                            </Typography>
                            <Typography variant="caption" sx={{ fontSize: '0.68rem', fontWeight: 600, color: 'text.primary', whiteSpace: 'nowrap' }}>
                              {formatCompactNumber(strat.recoveryFactor, 2)}
                            </Typography>
                          </Box>
                          <Box sx={{ textAlign: 'center' }}>
                            <Typography variant="caption" sx={{ fontSize: '0.58rem', color: 'text.secondary', display: 'block', lineHeight: 1 }}>
                              Payoff
                            </Typography>
                            <Typography variant="caption" sx={{ fontSize: '0.68rem', fontWeight: 600, color: 'text.primary', whiteSpace: 'nowrap' }}>
                              {strat.expectedPayoff != null ? strat.expectedPayoff.toFixed(0) : '—'}
                            </Typography>
                          </Box>
                          <Box sx={{ textAlign: 'center' }}>
                            <Typography variant="caption" sx={{ fontSize: '0.58rem', color: 'text.secondary', display: 'block', lineHeight: 1 }}>
                              LR
                            </Typography>
                            <Typography variant="caption" sx={{ fontSize: '0.68rem', fontWeight: 600, color: 'text.primary', whiteSpace: 'nowrap' }}>
                              {strat.lrCorrelation != null ? strat.lrCorrelation.toFixed(2) : '—'}
                            </Typography>
                          </Box>
                          <Box sx={{ textAlign: 'center' }}>
                            <Typography variant="caption" sx={{ fontSize: '0.58rem', color: 'text.secondary', display: 'block', lineHeight: 1 }}>
                              LPT
                            </Typography>
                            <Typography variant="caption" sx={{ fontSize: '0.68rem', fontWeight: 600, color: strat.largestProfitTrade >= 0 ? '#2e7d32' : '#d32f2f', whiteSpace: 'nowrap' }}>
                              {formatCompactCurrency(strat.largestProfitTrade)}
                            </Typography>
                          </Box>
                          <Box sx={{ textAlign: 'center' }}>
                            <Typography variant="caption" sx={{ fontSize: '0.58rem', color: 'text.secondary', display: 'block', lineHeight: 1 }}>
                              DD Max
                            </Typography>
                            <Typography variant="caption" sx={{ fontSize: '0.68rem', fontWeight: 600, color: '#ff9800', whiteSpace: 'nowrap' }}>
                              {strat.drawdownPct != null ? `${formatCompactNumber(strat.drawdownPct, 2)}%` : '-'}
                            </Typography>
                          </Box>
                        </Box>
                      </Box>
                    </MuiTooltip>
                  );
                })
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <Typography variant="caption" color="text.secondary">No ranking data</Typography>
                </Box>
              )}
            </Box>
          )}
        </MainCard>
      </Grid>

        {/* ==================== BACKTEST DIVISION ==================== */}
        <Grid size={12}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1.5, mb: -1.5 }}>
            <Box sx={{ flexGrow: 1, height: '1px', bgcolor: 'divider' }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Backtest
            </Typography>
            <Box sx={{ flexGrow: 1, height: '1px', bgcolor: 'divider' }} />
          </Box>
        </Grid>

        {/* ==================== BACKTEST COMPARISON ==================== */}
        <Grid size={12}>
          <MainCard
            title={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: isDarkMode ? 'primary.light' : '#1F3864', textTransform: 'uppercase', letterSpacing: '0.2px' }}>
                  BACKTEST COMPARISON
                </Typography>
                <Chip
                  label={backtestComparisonData.length > 0 ? `${backtestComparisonData.length} tables` : 'No data'}
                  size="small"
                  variant="outlined"
                  sx={{
                    height: 20,
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    borderRadius: 1,
                    borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(31, 56, 100, 0.15)',
                    color: isDarkMode ? 'text.secondary' : 'text.primary'
                  }}
                />
              </Box>
            }
            secondary={renderHeaderActions('Backtest Comparison', 'So sánh các backtest trong database theo metric đang chọn để nhìn ra backtest nào tốt nhất trong scope hiện tại.', backtestComparisonData)}
            sx={{
              bgcolor: isDarkMode ? 'background.paper' : '#ffffff',
              height: '100%',
              borderRadius: 2,
              boxShadow: isDarkMode ? '0 4px 20px rgba(0,0,0,0.3)' : '0 4px 20px rgba(0,0,0,0.02)',
              border: '1px solid',
              borderColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(144, 202, 249, 0.15)'
            }}
          >
            {comparisonLoading ? (
              <CardLoader height={350} size={40} />
            ) : comparisonError ? (
              <CardError error={comparisonError} />
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: { xs: 'flex-start', md: 'center' }, justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
                  <Box>
                  <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                    So sánh theo <strong>{comparisonMetricMeta.label}</strong>. {' '}
                    {comparisonMetricMeta.higherIsBetter ? 'Giá trị cao hơn là tốt hơn.' : 'Giá trị thấp hơn là tốt hơn.'}
                  </Typography>
                </Box>
                <ToggleButtonGroup
                  value={comparisonMetric}
                  exclusive
                  onChange={(_, next) => next && setComparisonMetric(next)}
                  size="small"
                  sx={{
                    flexWrap: 'wrap',
                    gap: 0.75,
                    '& .MuiToggleButton-root': {
                      border: '1px solid',
                      borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.12)' : 'divider',
                      borderRadius: 1.5,
                      px: 1.2,
                      py: 0.55,
                      textTransform: 'none',
                      fontWeight: 700,
                      fontSize: '0.73rem',
                      color: 'text.secondary',
                      bgcolor: isDarkMode ? 'rgba(255, 255, 255, 0.02)' : '#fff',
                      '&:hover': {
                        bgcolor: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : '#f8fafc',
                        borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'grey.400'
                      }
                    },
                    '& .MuiToggleButton-root.Mui-selected': {
                      bgcolor: 'primary.main',
                      color: 'primary.contrastText',
                      borderColor: 'primary.main',
                      '&:hover': {
                        bgcolor: 'primary.dark',
                        borderColor: 'primary.dark'
                      }
                    }
                  }}
                >
                  {BACKTEST_COMPARISON_METRICS.reduce((acc, metric, idx) => {
                    acc.push(
                      <ToggleButton key={metric.key} value={metric.key}>
                        {metric.label}
                      </ToggleButton>
                    );
                    // Render divider only after standard indicators ('pd'), and between flag indicators
                    const keysWithDividers = ['pd', 'riskFlagsCount', 'behaviorFlagsCount'];
                    if (keysWithDividers.includes(metric.key)) {
                      acc.push(
                        <Box key={`sep-${metric.key}`} sx={{ display: 'flex', alignItems: 'center', color: isDarkMode ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.15)', mx: 0.5, userSelect: 'none', pointerEvents: 'none', fontWeight: 300 }}>
                          |
                        </Box>
                      );
                    }
                    return acc;
                  }, [])}
                </ToggleButtonGroup>
              </Box>

              {backtestComparisonData.length === 0 ? (
                <Box sx={{ py: 5, textAlign: 'center', borderRadius: 2, border: '1px dashed', borderColor: 'divider', bgcolor: isDarkMode ? 'rgba(255,255,255,0.01)' : 'rgba(15, 23, 42, 0.01)' }}>
                  <Typography variant="body2" color="text.secondary">
                    Chưa có đủ dữ liệu backtest để so sánh.
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ width: '100%', height: Math.max(140, backtestComparisonData.length * 50 + 35) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={backtestComparisonData}
                      layout="vertical"
                      margin={{ top: 8, right: 42, left: 0, bottom: 4 }}
                      barCategoryGap="24%"
                    >
                      <defs>
                        <linearGradient id="bestGrad" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor={isDarkMode ? '#3b82f6' : '#2563eb'} stopOpacity={0.8} />
                          <stop offset="100%" stopColor={isDarkMode ? '#60a5fa' : '#3b82f6'} stopOpacity={1} />
                        </linearGradient>
                        <linearGradient id="runnerGrad" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor={isDarkMode ? '#10b981' : '#059669'} stopOpacity={0.8} />
                          <stop offset="100%" stopColor={isDarkMode ? '#34d399' : '#10b981'} stopOpacity={1} />
                        </linearGradient>
                        <linearGradient id="normalGrad1" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.75} />
                          <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.95} />
                        </linearGradient>
                        <linearGradient id="normalGrad2" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.75} />
                          <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.95} />
                        </linearGradient>
                        <linearGradient id="normalGrad3" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#ec4899" stopOpacity={0.75} />
                          <stop offset="100%" stopColor="#f472b6" stopOpacity={0.95} />
                        </linearGradient>
                        <linearGradient id="normalGrad4" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.75} />
                          <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.95} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} strokeOpacity={isDarkMode ? 0.15 : 0.35} horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 9, fill: chartTextColor, fontWeight: 600 }}
                        tickLine={false}
                        axisLine={{ stroke: chartGridColor }}
                        tickFormatter={(value) => comparisonMetricMeta.key === 'totalNetProfit'
                          ? formatCompactCurrency(value)
                          : comparisonMetricFormatter(value)}
                        label={{
                          value: comparisonMetricMeta.higherIsBetter ? 'Higher is better' : 'Lower is better',
                          position: 'insideBottomRight',
                          offset: -4,
                          fontSize: 9,
                          fill: isDarkMode ? '#64748b' : '#94a3b8'
                        }}
                      />
                      <YAxis
                        type="category"
                        dataKey="label"
                        width={80}
                        tick={{ fontSize: 10, fill: chartTextColor, fontWeight: 700 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: isDarkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(31, 56, 100, 0.04)' }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const row = payload[0]?.payload || {};
                          const isRiskView = comparisonMetric === 'riskFlagsCount';
                          const isBehaviorView = comparisonMetric === 'behaviorFlagsCount';

                          return (
                            <Box sx={{
                              bgcolor: isDarkMode ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                              backdropFilter: 'blur(8px)',
                              color: isDarkMode ? '#f8fafc' : '#0f172a',
                              p: 1.5,
                              borderRadius: 2,
                              boxShadow: isDarkMode
                                ? '0 10px 25px -5px rgba(0,0,0,0.5), 0 8px 10px -6px rgba(0,0,0,0.4)'
                                : '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.05)',
                              border: '1px solid',
                              borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                              fontSize: '0.75rem',
                              minWidth: 240
                            }}>
                              <Typography variant="caption" sx={{ fontWeight: 700, color: isDarkMode ? '#94a3b8' : '#475569', display: 'block', mb: 0.75, borderBottom: '1px solid', borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', pb: 0.5 }}>
                                {row.backtestTable}
                              </Typography>
                              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 0.75 }}>
                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>Metric</Typography>
                                <Typography variant="caption" sx={{ color: 'text.primary', fontWeight: 700 }}>{comparisonMetricMeta.label}</Typography>
                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>Value</Typography>
                                <Typography variant="caption" sx={{ color: 'text.primary', fontWeight: 700, fontFamily: 'monospace' }}>{comparisonMetricFormatter(row[comparisonMetricMeta.key])}</Typography>
                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>Strategies</Typography>
                                <Typography variant="caption" sx={{ color: 'text.primary', fontWeight: 700 }}>{row.count}</Typography>

                                {isRiskView ? (
                                  <>
                                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>Hard Flags</Typography>
                                    <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 700 }}>{row.hardFlagsCount ?? 0}</Typography>
                                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>Soft Flags</Typography>
                                    <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 700 }}>{row.softFlagsCount ?? 0}</Typography>
                                  </>
                                ) : isBehaviorView ? (
                                  <>
                                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>Directional Bias</Typography>
                                    <Typography variant="caption" sx={{ color: 'text.primary', fontWeight: 700 }}>{row.directionalBiasCount ?? 0}</Typography>
                                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>Timeframe Mismatch</Typography>
                                    <Typography variant="caption" sx={{ color: 'text.primary', fontWeight: 700 }}>{row.timeframeMismatchCount ?? 0}</Typography>
                                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>Activity Gap</Typography>
                                    <Typography variant="caption" sx={{ color: 'text.primary', fontWeight: 700 }}>{row.activityGapCount ?? 0}</Typography>
                                  </>
                                ) : (
                                  <>
                                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>Profit</Typography>
                                    <Typography variant="caption" sx={{ color: 'text.primary', fontWeight: 700 }}>{formatCurrency(row.totalNetProfit)}</Typography>
                                    {comparisonMetric === 'totalNetProfit' && (
                                      <>
                                        <Typography variant="caption" sx={{ color: 'text.secondary', pl: 1.5 }}>↳ Gross Profit</Typography>
                                        <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 700 }}>{formatCurrency(row.grossProfit ?? 0)}</Typography>
                                        <Typography variant="caption" sx={{ color: 'text.secondary', pl: 1.5 }}>↳ Gross Loss</Typography>
                                        <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 700 }}>{formatCurrency(row.grossLoss ?? 0)}</Typography>
                                      </>
                                    )}
                                  </>
                                )}
                              </Box>
                            </Box>
                          );
                        }}
                      />
                      <Bar dataKey={comparisonMetricMeta.key} radius={[0, 4, 4, 0]} barSize={22}>
                        {backtestComparisonData.map((entry, index) => {
                          let fill = 'url(#normalGrad1)';
                          if (entry.rank === 1) fill = 'url(#bestGrad)';
                          else if (entry.rank === 2) fill = 'url(#runnerGrad)';
                          else if (index % 4 === 2) fill = 'url(#normalGrad2)';
                          else if (index % 4 === 3) fill = 'url(#normalGrad3)';
                          else if (index % 4 === 0) fill = 'url(#normalGrad4)';
                          return (
                            <Cell
                              key={entry.backtestTable}
                              fill={fill}
                            />
                          );
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              )}

              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 1 }}>
                {/* Card 1: Best Backtest */}
                <Box sx={(theme) => ({
                  flex: '1 1 220px',
                  p: 1.5,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(37, 99, 235, 0.15)',
                  borderLeft: '4px solid',
                  borderLeftColor: theme.palette.mode === 'dark' ? '#60a5fa' : '#2563eb',
                  bgcolor: theme.palette.mode === 'dark' ? 'rgba(96, 165, 250, 0.04)' : 'rgba(37, 99, 235, 0.02)',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: theme.palette.mode === 'dark' ? '0 4px 12px rgba(0,0,0,0.3)' : '0 4px 12px rgba(37, 99, 235, 0.06)'
                  }
                })}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    🏆 Best Backtest
                  </Typography>
                  <Typography variant="subtitle1" sx={{ fontWeight: 800, color: isDarkMode ? '#60a5fa' : '#1c3d73', mt: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {bestBacktest?.label || 'N/A'}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25 }}>
                    {comparisonMetricMeta.label}: <strong style={{ color: isDarkMode ? '#f8fafc' : '#0f172a' }}>{bestBacktest ? comparisonMetricFormatter(bestBacktest[comparisonMetricMeta.key]) : '—'}</strong>
                  </Typography>
                </Box>

                {/* Card 2: Gap vs Runner-up */}
                <Box sx={(theme) => ({
                  flex: '1 1 220px',
                  p: 1.5,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(16, 185, 129, 0.15)',
                  borderLeft: '4px solid',
                  borderLeftColor: theme.palette.mode === 'dark' ? '#34d399' : '#10b981',
                  bgcolor: theme.palette.mode === 'dark' ? 'rgba(52, 211, 153, 0.04)' : 'rgba(16, 185, 129, 0.02)',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: theme.palette.mode === 'dark' ? '0 4px 12px rgba(0,0,0,0.3)' : '0 4px 12px rgba(16, 185, 129, 0.06)'
                  }
                })}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    ⚡ Gap vs Runner-up
                  </Typography>
                  <Typography variant="subtitle1" sx={{ fontWeight: 800, color: comparisonMetricMeta.higherIsBetter ? 'success.main' : 'warning.main', mt: 0.5 }}>
                    {comparisonGap == null ? '—' : `${comparisonMetricMeta.higherIsBetter ? '+' : '−'}${comparisonMetricMeta.key === 'totalNetProfit' ? formatCompactCurrency(comparisonGap) : comparisonMetricFormatter(Math.abs(comparisonGap))}`}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25 }}>
                    Top 1 so với Top 2 trong scope hiện tại
                  </Typography>
                </Box>

                {/* Card 3: Weakest Backtest */}
                <Box sx={(theme) => ({
                  flex: '1 1 220px',
                  p: 1.5,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(239, 68, 68, 0.15)',
                  borderLeft: '4px solid',
                  borderLeftColor: theme.palette.mode === 'dark' ? '#f87171' : '#ef4444',
                  bgcolor: theme.palette.mode === 'dark' ? 'rgba(248, 113, 113, 0.04)' : 'rgba(239, 68, 68, 0.02)',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: theme.palette.mode === 'dark' ? '0 4px 12px rgba(0,0,0,0.3)' : '0 4px 12px rgba(239, 68, 68, 0.06)'
                  }
                })}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    ⚠️ Weakest Backtest
                  </Typography>
                  <Typography variant="subtitle1" sx={{ fontWeight: 800, color: isDarkMode ? '#f87171' : '#d32f2f', mt: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {weakestBacktest?.label || 'N/A'}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25 }}>
                    {comparisonMetricMeta.label}: <strong style={{ color: isDarkMode ? '#f8fafc' : '#0f172a' }}>{weakestBacktest ? comparisonMetricFormatter(weakestBacktest[comparisonMetricMeta.key]) : '—'}</strong>
                  </Typography>
                </Box>
              </Box>
            </Box>
          )}
        </MainCard>
      </Grid>

        {/* ==================== PROFIT TREND ==================== */}
        <Grid size={12}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0, mb: -1.5 }}>
            <Box sx={{ flexGrow: 1, height: '1px', bgcolor: 'divider' }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Profit Trend
            </Typography>
            <Box sx={{ flexGrow: 1, height: '1px', bgcolor: 'divider' }} />
          </Box>
        </Grid>

        {/* ==================== ROW 2: MONTHLY PROFIT CHART ==================== */}
        <Grid size={{ xs: 12, lg: 8 }}>
          <MainCard
            title={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'var(--chart-title-color, #1F3864)', textTransform: 'uppercase', letterSpacing: '0.2px' }}>
                  Monthly Profit Trend
                </Typography>
                <IconButton
                  size="small"
                  onClick={() => setProfitTrendHelpOpen(true)}
                  sx={{ p: 0.25, color: '#16b5dd' }}
                >
                  <QuestionCircleOutlined style={{ fontSize: '14px' }} />
                </IconButton>
              </Box>
            }
            secondary={renderHeaderActions('Monthly Profit Trend', `Phân tích xu hướng lợi nhuận hàng tháng (Monthly Profit Trend) của bảng backtest ${selectedTable}`, monthlyProfit)}
          >
            {monthlyLoading ? (
              <CardLoader height={400} size={40} />
            ) : monthlyError ? (
              <CardError error={monthlyError} />
            ) : (
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={monthlyProfit}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={monthScale.formatter} domain={[0, monthScale.tickMax]} ticks={monthScale.ticks} />
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Legend />
                  <Line type="monotone" dataKey="profit" stroke="#e64747" strokeWidth={2} name="Monthly Profit" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </MainCard>
        </Grid>

        {/* ==================== YEARLY COMPARISON ==================== */}
        <Grid size={{ xs: 12, lg: 4 }}>
          <MainCard
            title={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'var(--chart-title-color, #1F3864)', textTransform: 'uppercase', letterSpacing: '0.2px' }}>
                  Yearly Performance
                </Typography>
                <IconButton
                  size="small"
                  onClick={() => setProfitTrendHelpOpen(true)}
                  sx={{ p: 0.25, color: '#16b5dd' }}
                >
                  <QuestionCircleOutlined style={{ fontSize: '14px' }} />
                </IconButton>
              </Box>
            }
            secondary={renderHeaderActions('Yearly Performance', `Phân tích hiệu suất hàng năm (Yearly Performance) của bảng backtest ${selectedTable}`, yearlyComparison)}
          >
            {yearlyLoading ? (
              <CardLoader height={400} size={40} />
            ) : yearlyError ? (
              <CardError error={yearlyError} />
            ) : (
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={yearlyComparison}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis tickFormatter={yearScale.formatter} domain={[0, yearScale.tickMax]} ticks={yearScale.ticks} />
                  <Tooltip
                    formatter={(value, name) => {
                      if (name === 'Win Rate') return `${value}%`;
                      // always show full formatted number in tooltip for clarity
                      return formatCurrency(value);
                    }}
                  />
                  <Legend />
                  <Bar dataKey="totalProfit" fill="#16b5dd" name="Total Profit" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </MainCard>
        </Grid>

        {/* ==================== QUALITY DISTRIBUTION ==================== */}
        <Grid size={12}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0, mb: -1.5 }}>
            <Box sx={{ flexGrow: 1, height: '1px', bgcolor: 'divider' }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Quality Distribution
            </Typography>
            <Box sx={{ flexGrow: 1, height: '1px', bgcolor: 'divider' }} />
          </Box>
        </Grid>

        {yearlyLoading ? (
          [1, 2, 3, 4].map((idx) => (
            <Grid key={idx} size={{ xs: 12, sm: 6, md: 3 }}>
              <MainCard sx={{ bgcolor: '#ffffff', height: '100%', minHeight: 220 }}>
                <CardLoader height={180} size={30} />
              </MainCard>
            </Grid>
          ))
        ) : yearlyError ? (
          <Grid size={12}>
            <CardError error={yearlyError} />
          </Grid>
        ) : qualityDistribution && qualityDistribution.length > 0 ? (
          qualityDistribution.map((dist, idx) => (
            <Grid key={idx} size={{ xs: 12, sm: 6, md: 3 }}>
              <MainCard
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'var(--chart-title-color, #1F3864)', textTransform: 'uppercase', letterSpacing: '0.2px' }}>
                      {dist.label}
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={() => setQualityDistHelpOpen(true)}
                      sx={{ p: 0.25, color: '#0F6E56' }}
                    >
                      <QuestionCircleOutlined style={{ fontSize: '14px' }} />
                    </IconButton>
                  </Box>
                }
                secondary={renderHeaderActions(dist.label, `Phân tích phân phối chất lượng ${dist.label} của bảng backtest ${selectedTable}`, dist.tiers)}
                sx={{ bgcolor: '#ffffff', height: '100%' }}
              >
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mb: 1.5 }}>
                  {dist.tiers.map((tier, tIdx) => (
                    <Box key={tIdx} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="caption" sx={{ minWidth: 52, color: 'text.secondary', fontWeight: 500, fontSize: '0.72rem' }}>
                        {tier.l}
                      </Typography>
                      <Box sx={{ flexGrow: 1, height: 6, bgcolor: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                        <Box
                          sx={{
                            width: `${tier.max > 0 ? (tier.v / tier.max) * 100 : 0}%`,
                            height: '100%',
                            bgcolor: tier.c,
                            borderRadius: 3
                          }}
                        />
                      </Box>
                      <Typography
                        variant="caption"
                        sx={{
                          minWidth: 35,
                          textAlign: 'right',
                          fontWeight: 600,
                          fontSize: '0.72rem',
                          color: tier.c === '#E24B4A' ? '#A32D2D' : tier.c === '#EF9F27' ? '#854F0B' : tier.c === '#0F6E56' ? '#0F6E56' : 'text.primary'
                        }}
                      >
                        {formatNumber(tier.v)}
                      </Typography>
                    </Box>
                  ))}
                </Box>

                <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
                      {dist.avgNote}
                    </Typography>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0F6E56', fontSize: '0.85rem' }}>
                      {dist.avg}
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      p: 0.75,
                      borderRadius: 1,
                      bgcolor: dist.noteType === 'nok' ? 'rgba(15, 110, 86, 0.08)' : dist.noteType === 'nbad' ? 'rgba(226, 75, 74, 0.08)' : 'rgba(239, 159, 39, 0.08)',
                      borderLeft: '3px solid',
                      borderColor: dist.noteType === 'nok' ? '#0F6E56' : dist.noteType === 'nbad' ? '#E24B4A' : '#EF9F27'
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 500,
                        color: dist.noteType === 'nok' ? '#0F6E56' : dist.noteType === 'nbad' ? '#A32D2D' : '#854F0B',
                        fontSize: '0.7rem'
                      }}
                    >
                      {dist.note}
                    </Typography>
                  </Box>
                </Box>
              </MainCard>
            </Grid>
          ))
        ) : (
          <Grid size={12}>
            <MainCard>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                No Quality Distribution data available
              </Typography>
            </MainCard>
          </Grid>
        )}

        {/* ==================== BREAKDOWN ==================== */}
        <Grid size={12}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0, mb: -1.5 }}>
            <Box sx={{ flexGrow: 1, height: '1px', bgcolor: 'divider' }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Breakdown
            </Typography>
            <Box sx={{ flexGrow: 1, height: '1px', bgcolor: 'divider' }} />
          </Box>
        </Grid>

        {/* Symbol Ranking Card */}
        <Grid size={{ xs: 12, lg: 5 }}>
          <MainCard
            title={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'var(--chart-title-color, #1F3864)', textTransform: 'uppercase', letterSpacing: '0.2px' }}>
                  Symbol Ranking
                </Typography>
                <IconButton
                  size="small"
                  onClick={() => setBreakdownHelpOpen(true)}
                  sx={{ p: 0.25, color: 'var(--chart-title-color, #1F3864)' }}
                >
                  <QuestionCircleOutlined style={{ fontSize: '14px' }} />
                </IconButton>
              </Box>
            }
            secondary={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  {[
                    { key: 'pd', label: 'P/D' },
                    { key: 'profit', label: 'Profit' },
                    { key: 'sharpe', label: 'Sharpe' }
                  ].map((btn) => (
                    <Button
                      key={btn.key}
                      size="small"
                      variant={symbolMetric === btn.key ? 'contained' : 'outlined'}
                      onClick={() => setSymbolMetric(btn.key)}
                      sx={(theme) => ({
                        minWidth: 40,
                        height: 24,
                        fontSize: '0.65rem',
                        textTransform: 'capitalize',
                        px: 1,
                        py: 0.25,
                        borderRadius: 10,
                        borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.15)' : 'divider',
                        bgcolor: symbolMetric === btn.key
                          ? (theme.palette.mode === 'dark' ? 'rgba(148,210,255,0.15)' : '#f1f5f9')
                          : 'transparent',
                        color: symbolMetric === btn.key
                          ? (theme.palette.mode === 'dark' ? '#e2e8f0' : 'text.primary')
                          : 'text.secondary',
                        fontWeight: symbolMetric === btn.key ? 700 : 500,
                        '&:hover': {
                          bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : '#f1f5f9',
                          borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.25)' : 'divider',
                          color: theme.palette.mode === 'dark' ? '#e2e8f0' : 'text.primary'
                        }
                      })}
                    >
                      {btn.label}
                    </Button>
                  ))}
                </Box>
                {renderHeaderActions('Symbol Ranking', `Phân tích xếp hạng Symbol (Symbol Ranking) theo tiêu chí ${symbolMetric === 'pd' ? 'P/D' : symbolMetric === 'profit' ? 'Profit' : 'Sharpe'} của bảng backtest ${selectedTable}`, comparativeData?.averages)}
              </Box>
            }
            sx={{ bgcolor: '#ffffff', height: '100%' }}
          >
            {breakdownLoading ? (
              <CardLoader height={200} size={30} />
            ) : breakdownError ? (
              <CardError error={breakdownError} />
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {symbolRankList.map((s, idx) => (
                <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography variant="caption" sx={{ width: 18, color: 'text.secondary', fontWeight: 600, fontSize: '0.72rem' }}>
                    {idx + 1}
                  </Typography>
                  <Typography variant="caption" sx={{ width: 52, fontWeight: 600, fontSize: '0.72rem', color: 'text.primary' }}>
                    {s.symbol}
                  </Typography>
                  <Box sx={(theme) => ({ flexGrow: 1, height: 5, bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : '#f1f5f9', borderRadius: 3, overflow: 'hidden' })}>
                    <Box
                      sx={{
                        width: `${s.maxVal > 0 ? (s.value / s.maxVal) * 100 : 0}%`,
                        height: '100%',
                        bgcolor: s.barBg,
                        borderRadius: 3
                      }}
                    />
                  </Box>
                  <Typography variant="caption" sx={{ width: 45, textAlign: 'right', fontWeight: 600, fontSize: '0.72rem', color: 'text.secondary' }}>
                    {formatRankingValue(s.value, symbolMetric)}
                  </Typography>
                  <Chip
                    label={s.trend}
                    size="small"
                    sx={{
                      height: 16,
                      fontSize: '0.625rem',
                      fontWeight: 700,
                      bgcolor: s.tagBg,
                      color: s.tagColor,
                      borderRadius: 1,
                      px: 0.5,
                      '& .MuiChip-label': { px: 0.5 }
                    }}
                  />
                </Box>
              ))}
              {symbolRankList.length === 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', py: 3 }}>
                  <Typography variant="caption" color="text.secondary">No symbol data available</Typography>
                </Box>
              )}
            </Box>
          )}
        </MainCard>
      </Grid>

        {/* H1 vs H4 Comparison Card */}
        <Grid size={{ xs: 12, lg: 3.5 }}>
          <MainCard
            title={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'var(--chart-title-color, #1F3864)', textTransform: 'uppercase', letterSpacing: '0.2px' }}>
                  H1 vs H4
                </Typography>
                <IconButton
                  size="small"
                  onClick={() => setBreakdownHelpOpen(true)}
                  sx={{ p: 0.25, color: 'var(--chart-title-color, #1F3864)' }}
                >
                  <QuestionCircleOutlined style={{ fontSize: '14px' }} />
                </IconButton>
              </Box>
            }
            secondary={renderHeaderActions('H1 vs H4', `Phân tích so sánh H1 vs H4 của bảng backtest ${selectedTable}`, h1vsH4Data)}
            sx={{ bgcolor: '#ffffff', height: '100%' }}
          >
            {breakdownLoading ? (
              <CardLoader height={200} size={30} />
            ) : breakdownError ? (
              <CardError error={breakdownError} />
            ) : (
              <>
                <TableContainer sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ '& td, & th': { py: 0.5, px: 0.75, fontSize: '0.72rem' } }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#1e293b' }}>
                    <TableCell sx={{ fontWeight: 600, color: '#ffffff' }}>Metric</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#ffffff' }}>H1</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#ffffff' }}>H4</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {h1vsH4Rows.map((row) => {
                    const h1Val = h1vsH4Data[row.key]?.h1 ?? 0;
                    const h4Val = h1vsH4Data[row.key]?.h4 ?? 0;
                    const winner = h1vsH4Data[row.key]?.winner ?? 'Draw';

                    return (
                      <TableRow key={row.key} sx={{ '&:hover': { bgcolor: '#f8fafc' } }}>
                        <TableCell sx={{ color: 'text.secondary' }}>{row.label}</TableCell>
                        <TableCell sx={{
                          fontWeight: winner === 'H1' ? 700 : 500,
                          color: winner === 'H1' ? '#3B6D11' : 'text.primary'
                        }}>
                          {formatDuelVal(h1Val, row.key)}
                        </TableCell>
                        <TableCell sx={{
                          fontWeight: winner === 'H4' ? 700 : 500,
                          color: winner === 'H4' ? '#3B6D11' : 'text.primary'
                        }}>
                          {formatDuelVal(h4Val, row.key)}
                        </TableCell>
                        <TableCell align="right">
                          {renderWinnerBadge(winner)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            <Box
              sx={{
                mt: 1.5,
                p: 1,
                borderRadius: 1,
                borderLeft: '3px solid',
                borderColor: h1vsH4Data.h1Wins === h1vsH4Data.h4Wins ? '#EF9F27' : h1vsH4Data.h1Wins > h1vsH4Data.h4Wins ? '#0F6E56' : '#185FA5',
                bgcolor: h1vsH4Data.h1Wins === h1vsH4Data.h4Wins ? 'rgba(239, 159, 39, 0.08)' : h1vsH4Data.h1Wins > h1vsH4Data.h4Wins ? 'rgba(15, 110, 86, 0.08)' : 'rgba(24, 95, 165, 0.08)'
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 600,
                  color: h1vsH4Data.h1Wins === h1vsH4Data.h4Wins ? '#854F0B' : h1vsH4Data.h1Wins > h1vsH4Data.h4Wins ? '#0F6E56' : '#185FA5',
                  fontSize: '0.7rem'
                }}
              >
                {getH1vsH4SummaryNote(h1vsH4Data.h1Wins, h1vsH4Data.h4Wins)}
              </Typography>
            </Box>
          </>
        )}
      </MainCard>
    </Grid>

        {/* OB vs OS Comparison Card */}
        <Grid size={{ xs: 12, lg: 3.5 }}>
          <MainCard
            title={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'var(--chart-title-color, #1F3864)', textTransform: 'uppercase', letterSpacing: '0.2px' }}>
                  OB vs OS
                </Typography>
                <IconButton
                  size="small"
                  onClick={() => setBreakdownHelpOpen(true)}
                  sx={{ p: 0.25, color: 'var(--chart-title-color, #1F3864)' }}
                >
                  <QuestionCircleOutlined style={{ fontSize: '14px' }} />
                </IconButton>
              </Box>
            }
            secondary={renderHeaderActions('OB vs OS', `Phân tích so sánh OB vs OS của bảng backtest ${selectedTable}`, obVsOsData)}
            sx={{ bgcolor: '#ffffff', height: '100%' }}
          >
            {breakdownLoading ? (
              <CardLoader height={200} size={30} />
            ) : breakdownError ? (
              <CardError error={breakdownError} />
            ) : (
              <>
                <TableContainer sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ '& td, & th': { py: 0.5, px: 0.75, fontSize: '0.72rem' } }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#1e293b' }}>
                    <TableCell sx={{ fontWeight: 600, color: '#ffffff' }}>Metric</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#ffffff' }}>OB</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#ffffff' }}>OS</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {obVsOsRows.map((row) => {
                    const obVal = obVsOsData[row.key]?.ob ?? 0;
                    const osVal = obVsOsData[row.key]?.os ?? 0;
                    const winner = obVsOsData[row.key]?.winner ?? 'Draw';

                    return (
                      <TableRow key={row.key} sx={{ '&:hover': { bgcolor: '#f8fafc' } }}>
                        <TableCell sx={{ color: 'text.secondary' }}>{row.label}</TableCell>
                        <TableCell sx={{
                          fontWeight: winner === 'OB' ? 700 : 500,
                          color: winner === 'OB' ? '#3B6D11' : 'text.primary'
                        }}>
                          {formatDuelVal(obVal, row.key)}
                        </TableCell>
                        <TableCell sx={{
                          fontWeight: winner === 'OS' ? 700 : 500,
                          color: winner === 'OS' ? '#3B6D11' : 'text.primary'
                        }}>
                          {formatDuelVal(osVal, row.key)}
                        </TableCell>
                        <TableCell align="right">
                          {renderWinnerBadge(winner)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            <Box
              sx={{
                mt: 1.5,
                p: 1,
                borderRadius: 1,
                borderLeft: '3px solid',
                borderColor: obVsOsData.obWins === obVsOsData.osWins ? '#EF9F27' : obVsOsData.obWins > obVsOsData.osWins ? '#0F6E56' : '#185FA5',
                bgcolor: obVsOsData.obWins === obVsOsData.osWins ? 'rgba(239, 159, 39, 0.08)' : obVsOsData.obWins > obVsOsData.osWins ? 'rgba(15, 110, 86, 0.08)' : 'rgba(24, 95, 165, 0.08)'
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 600,
                  color: obVsOsData.obWins === obVsOsData.osWins ? '#854F0B' : obVsOsData.obWins > obVsOsData.osWins ? '#0F6E56' : '#185FA5',
                  fontSize: '0.7rem'
                }}
              >
                {getOBvsOSSummaryNote(obVsOsData.obWins, obVsOsData.osWins)}
              </Typography>
            </Box>
          </>
        )}
      </MainCard>
    </Grid>

      </Grid>
    </LocalizationProvider >
  );
}

// ==================== HELPER FUNCTIONS FOR BREAKDOWN ====================

const getSymbolRankData = (averages, metricKey) => {
  if (!averages || averages.length === 0) return [];

  const sorted = [...averages].sort((a, b) => {
    const valA = a[metricKey] ?? 0;
    const valB = b[metricKey] ?? 0;
    return valB - valA;
  });

  const maxVal = Math.max(...sorted.map(s => s[metricKey] ?? 0), 1);

  return sorted.map((item, index) => {
    const val = item[metricKey] ?? 0;
    const rank = index + 1;
    const total = sorted.length;

    let trend = 'Giữ';
    let tagBg = 'rgba(100, 116, 139, 0.1)';
    let tagColor = '#64748b';
    let barBg = '#B5D4F4';

    if (rank <= Math.ceil(total * 0.33)) {
      trend = 'Tăng';
      tagBg = '#EAF3DE';
      tagColor = '#3B6D11';
      barBg = rank === 1 ? '#0F6E56' : '#1D9E75';
    } else if (rank <= Math.ceil(total * 0.77)) {
      trend = 'Giữ';
      tagBg = '#f1f5f9';
      tagColor = '#64748b';
      barBg = rank <= Math.ceil(total * 0.55) ? '#9FE1CB' : '#B5D4F4';
    } else if (rank <= total - 1) {
      trend = 'Giảm';
      tagBg = '#FAEEDA';
      tagColor = '#854F0B';
      barBg = '#FAC775';
    } else {
      trend = 'Review';
      tagBg = '#FCEBEB';
      tagColor = '#A32D2D';
      barBg = '#E24B4A';
    }

    return {
      symbol: item.symbol,
      value: val,
      maxVal,
      trend,
      tagBg,
      tagColor,
      barBg,
      rank
    };
  });
};

const calculateH1vsH4Aggregate = (duels) => {
  if (!duels || duels.length === 0) {
    return {
      profit: { h1: 0, h4: 0, winner: 'Draw' },
      sharpe: { h1: 0, h4: 0, winner: 'Draw' },
      pf: { h1: 0, h4: 0, winner: 'Draw' },
      drawdownPct: { h1: 0, h4: 0, winner: 'Draw' },
      pd: { h1: 0, h4: 0, winner: 'Draw' },
      h1Wins: 0,
      h4Wins: 0,
      draws: 0,
      totalMetrics: 5
    };
  }

  const count = duels.length;

  let h1ProfitSum = 0, h4ProfitSum = 0;
  let h1SharpeSum = 0, h4SharpeSum = 0;
  let h1PfSum = 0, h4PfSum = 0;
  let h1DdSum = 0, h4DdSum = 0;
  let h1PdSum = 0, h4PdSum = 0;

  duels.forEach(d => {
    h1ProfitSum += d.h1.profit;
    h4ProfitSum += d.h4.profit;
    h1SharpeSum += d.h1.sharpe;
    h4SharpeSum += d.h4.sharpe;
    h1PfSum += d.h1.pf;
    h4PfSum += d.h4.pf;
    h1DdSum += d.h1.drawdownPct;
    h4DdSum += d.h4.drawdownPct;
    h1PdSum += d.h1.pd;
    h4PdSum += d.h4.pd;
  });

  const avgH1Profit = h1ProfitSum / count;
  const avgH4Profit = h4ProfitSum / count;
  const avgH1Sharpe = h1SharpeSum / count;
  const avgH4Sharpe = h4SharpeSum / count;
  const avgH1Pf = h1PfSum / count;
  const avgH4Pf = h4PfSum / count;
  const avgH1Dd = h1DdSum / count;
  const avgH4Dd = h4DdSum / count;
  const avgH1Pd = h1PdSum / count;
  const avgH4Pd = h4PdSum / count;

  const checkWinner = (v1, v2, smallerIsBetter = false) => {
    const val1 = Math.round(v1 * 1000) / 1000;
    const val2 = Math.round(v2 * 1000) / 1000;
    if (val1 === val2) return 'Draw';
    if (smallerIsBetter) {
      return val1 < val2 ? 'H1' : 'H4';
    }
    return val1 > val2 ? 'H1' : 'H4';
  };

  const winners = {
    profit: checkWinner(avgH1Profit, avgH4Profit),
    sharpe: checkWinner(avgH1Sharpe, avgH4Sharpe),
    pf: checkWinner(avgH1Pf, avgH4Pf),
    drawdownPct: checkWinner(avgH1Dd, avgH4Dd, true),
    pd: checkWinner(avgH1Pd, avgH4Pd)
  };

  let h1Wins = 0;
  let h4Wins = 0;
  let draws = 0;

  Object.values(winners).forEach(w => {
    if (w === 'H1') h1Wins++;
    else if (w === 'H4') h4Wins++;
    else draws++;
  });

  return {
    profit: { h1: avgH1Profit, h4: avgH4Profit, winner: winners.profit },
    sharpe: { h1: avgH1Sharpe, h4: avgH4Sharpe, winner: winners.sharpe },
    pf: { h1: avgH1Pf, h4: avgH4Pf, winner: winners.pf },
    drawdownPct: { h1: avgH1Dd, h4: avgH4Dd, winner: winners.drawdownPct },
    pd: { h1: avgH1Pd, h4: avgH4Pd, winner: winners.pd },
    h1Wins,
    h4Wins,
    draws
  };
};

const calculateOBvsOSAggregate = (obOs) => {
  if (!obOs || obOs.length === 0) {
    return {
      profit: { ob: 0, os: 0, winner: 'Draw' },
      winrate: { ob: 0, os: 0, winner: 'Draw' },
      trades: { ob: 0, os: 0, winner: 'Draw' },
      sharpe: { ob: 0, os: 0, winner: 'Draw' },
      pf: { ob: 0, os: 0, winner: 'Draw' },
      obWins: 0,
      osWins: 0,
      draws: 0,
      totalMetrics: 5
    };
  }

  const count = obOs.length;

  let obProfitSum = 0, osProfitSum = 0;
  let obWinrateSum = 0, osWinrateSum = 0;
  let obTradesSum = 0, osTradesSum = 0;
  let obSharpeSum = 0, osSharpeSum = 0;
  let obPfSum = 0, osPfSum = 0;

  obOs.forEach(o => {
    obProfitSum += o.ob.profit;
    osProfitSum += o.os.profit;
    obWinrateSum += o.ob.winrate;
    osWinrateSum += o.os.winrate;
    obTradesSum += o.ob.trades;
    osTradesSum += o.os.trades;
    obSharpeSum += o.ob.sharpe;
    osSharpeSum += o.os.sharpe;
    obPfSum += o.ob.pf;
    osPfSum += o.os.pf;
  });

  const avgOBProfit = obProfitSum / count;
  const avgOSProfit = osProfitSum / count;
  const avgOBWinrate = obWinrateSum / count;
  const avgOSWinrate = osWinrateSum / count;
  const avgOBTrades = obTradesSum / count;
  const avgOSTrades = osTradesSum / count;
  const avgOBSharpe = obSharpeSum / count;
  const avgOSSharpe = osSharpeSum / count;
  const avgOBPf = obPfSum / count;
  const avgOSPf = osPfSum / count;

  const checkWinner = (v1, v2) => {
    const val1 = Math.round(v1 * 1000) / 1000;
    const val2 = Math.round(v2 * 1000) / 1000;
    if (val1 === val2) return 'Draw';
    return val1 > val2 ? 'OB' : 'OS';
  };

  const winners = {
    profit: checkWinner(avgOBProfit, avgOSProfit),
    winrate: checkWinner(avgOBWinrate, avgOSWinrate),
    trades: checkWinner(avgOBTrades, avgOSTrades),
    sharpe: checkWinner(avgOBSharpe, avgOSSharpe),
    pf: checkWinner(avgOBPf, avgOSPf)
  };

  let obWins = 0;
  let osWins = 0;
  let draws = 0;

  Object.values(winners).forEach(w => {
    if (w === 'OB') obWins++;
    else if (w === 'OS') osWins++;
    else draws++;
  });

  return {
    profit: { ob: avgOBProfit, os: avgOSProfit, winner: winners.profit },
    winrate: { ob: avgOBWinrate, os: avgOSWinrate, winner: winners.winrate },
    trades: { ob: avgOBTrades, os: avgOSTrades, winner: winners.trades },
    sharpe: { ob: avgOBSharpe, os: avgOSSharpe, winner: winners.sharpe },
    pf: { ob: avgOBPf, os: avgOSPf, winner: winners.pf },
    obWins,
    osWins,
    draws
  };
};

const formatRankingValue = (val, metric) => {
  if (metric === 'profit') {
    return `$${Math.round(val / 1000)}k`;
  }
  return val.toFixed(2);
};

const formatDuelVal = (val, metricKey) => {
  if (metricKey === 'profit') {
    return `$${Math.round(val / 1000)}k`;
  }
  if (metricKey === 'drawdownPct' || metricKey === 'winrate') {
    return `${val.toFixed(1)}%`;
  }
  if (metricKey === 'trades') {
    return Math.round(val);
  }
  return val.toFixed(2);
};

const renderWinnerBadge = (winner) => {
  let label = winner;
  let color = 'text.secondary';
  let bgcolor = '#f1f5f9';

  if (winner === 'H1' || winner === 'OB') {
    bgcolor = '#EAF3DE';
    color = '#3B6D11';
  } else if (winner === 'H4' || winner === 'OS') {
    bgcolor = '#E6F1FB';
    color = '#185FA5';
  }

  return (
    <Chip
      label={label}
      size="small"
      sx={{
        height: 18,
        fontSize: '0.65rem',
        fontWeight: 600,
        bgcolor,
        color,
        borderRadius: 1,
        px: 0.5,
        '& .MuiChip-label': { px: 0.5 }
      }}
    />
  );
};

const getH1vsH4SummaryNote = (h1Wins, h4Wins) => {
  if (h1Wins === h4Wins) {
    return `Hòa ${h1Wins}/${h1Wins + h4Wins} — cân bằng khung thời gian`;
  }
  if (h1Wins > h4Wins) {
    return `H1 thắng ${h1Wins}/5 — ưu tiên H1`;
  }
  return `H4 thắng ${h4Wins}/5 — ưu tiên H4`;
};

const getOBvsOSSummaryNote = (obWins, osWins) => {
  if (obWins === osWins) {
    return `Hòa ${obWins}/${obWins + osWins} — chiều giao dịch cân bằng`;
  }
  if (obWins > osWins) {
    return `OB thắng ${obWins}/5 — chiều mua ưu thế`;
  }
  return `OS thắng ${osWins}/5 — chiều bán ưu thế`;
};

const BACKTEST_COMPARISON_METRICS = [
  { key: 'totalNetProfit', label: 'Net Profit', suffix: '$', higherIsBetter: true },
  { key: 'sharpe', label: 'Sharpe', suffix: '', higherIsBetter: true },
  { key: 'profitFactor', label: 'Profit Factor', suffix: '', higherIsBetter: true },
  { key: 'drawdownPct', label: 'Max DD %', suffix: '%', higherIsBetter: false },
  { key: 'pd', label: 'P/D', suffix: '', higherIsBetter: true },
  { key: 'riskFlagsCount', label: 'Risk Flags', suffix: '', higherIsBetter: false },
  { key: 'behaviorFlagsCount', label: 'Behavior Flags', suffix: '', higherIsBetter: false },
  { key: 'count', label: 'Top Strategies', suffix: '', higherIsBetter: true }
];

const prettyBacktestLabel = (value) => {
  if (!value) return 'Unknown backtest';
  return String(value).trim();
};

const getBacktestComparisonData = (ranking = [], metricKey = 'totalNetProfit', behaviorData = null) => {
  if (!Array.isArray(ranking) || ranking.length === 0) return [];

  const buckets = new Map();
  const strategyToBacktest = new Map();

  ranking.forEach((row) => {
    const backtestTable = row.backtestTable || row.backtest || row.backtest_table || 'unknown_backtest';
    const stratId = row.strategyId || row.id;
    if (stratId) {
      strategyToBacktest.set(stratId, backtestTable);
    }

    if (!buckets.has(backtestTable)) {
      buckets.set(backtestTable, {
        backtestTable,
        label: prettyBacktestLabel(backtestTable),
        count: 0,
        totalNetProfit: 0,
        grossProfitSum: 0,
        grossLossSum: 0,
        sharpeSum: 0,
        profitFactorSum: 0,
        drawdownSum: 0,
        pdSum: 0,
        compositeSum: 0,
        riskFlagsCount: 0,
        hardFlagsCount: 0,
        softFlagsCount: 0
      });
    }

    const bucket = buckets.get(backtestTable);
    bucket.count += 1;
    bucket.totalNetProfit += Number(row.totalNetProfit ?? row.profit ?? 0) || 0;
    bucket.grossProfitSum += Number(row.grossProfit ?? 0) || 0;
    bucket.grossLossSum += Number(row.grossLoss ?? 0) || 0;
    bucket.sharpeSum += Number(row.sharpe ?? row.sharpeRatio ?? 0) || 0;
    bucket.profitFactorSum += Number(row.profitFactor ?? row.pf ?? 0) || 0;
    bucket.drawdownSum += Number(row.drawdownPct ?? row.drawdown ?? 0) || 0;
    bucket.pdSum += Number(row.pd ?? row.pdRatio ?? 0) || 0;
    bucket.compositeSum += Number(row.composite ?? 0) || 0;

    // Calculate dynamic risk flags client-side
    let hardFlags = 0;
    let softFlags = 0;
    const ep = Number(row.expectedPayoff ?? row.ep ?? 0);
    const pf = Number(row.profitFactor ?? row.pf ?? 0);
    const rf = Number(row.recoveryFactor ?? row.rf ?? 0);
    const pd = Number(row.pd ?? 0);
    const sharpe = Number(row.sharpe ?? row.sharpeRatio ?? 0);
    const lr = Number(row.lrCorrelation ?? row.lr ?? 0);
    const trades = Number(row.trades ?? row.totalTrades ?? 0);

    if (ep <= 0) hardFlags++;
    if (pf < 1.2) hardFlags++;
    if (rf < 1.0) hardFlags++;
    if (pd < 1.0) hardFlags++;

    if (sharpe > 0 && sharpe < 0.5) softFlags++;
    if (lr > 0 && lr < 0.8) softFlags++;
    if (pf >= 1.2 && pf < 1.35) softFlags++;
    if (rf >= 1.0 && rf < 1.5) softFlags++;
    if (trades >= 100 && trades < 130) softFlags++;

    bucket.hardFlagsCount += hardFlags;
    bucket.softFlagsCount += softFlags;
    bucket.riskFlagsCount += (hardFlags + softFlags);
  });

  // Calculate behavior flags per backtest
  const behaviorDetailsByTable = new Map();
  if (behaviorData) {
    (behaviorData.directionalBiasData || []).forEach((r) => {
      if (r.weakPct < 20) {
        const table = strategyToBacktest.get(r.id);
        if (table) {
          if (!behaviorDetailsByTable.has(table)) {
            behaviorDetailsByTable.set(table, { directionalBias: 0, timeframeMismatch: 0, activityGap: 0 });
          }
          behaviorDetailsByTable.get(table).directionalBias += 1;
        }
      }
    });

    (behaviorData.timeframeMismatchData || []).forEach((r) => {
      const table = strategyToBacktest.get(r.id);
      if (table) {
        if (!behaviorDetailsByTable.has(table)) {
          behaviorDetailsByTable.set(table, { directionalBias: 0, timeframeMismatch: 0, activityGap: 0 });
        }
        behaviorDetailsByTable.get(table).timeframeMismatch += 1;
      }
    });

    (behaviorData.activityGapData || []).forEach((r) => {
      if (r.maxGap >= 40 || r.zeroMonths >= 6) {
        const table = strategyToBacktest.get(r.id);
        if (table) {
          if (!behaviorDetailsByTable.has(table)) {
            behaviorDetailsByTable.set(table, { directionalBias: 0, timeframeMismatch: 0, activityGap: 0 });
          }
          behaviorDetailsByTable.get(table).activityGap += 1;
        }
      }
    });
  }

  const rows = Array.from(buckets.values()).map((bucket) => {
    const bDetails = behaviorDetailsByTable.get(bucket.backtestTable) || { directionalBias: 0, timeframeMismatch: 0, activityGap: 0 };
    const bFlags = bDetails.directionalBias + bDetails.timeframeMismatch + bDetails.activityGap;
    const rFlags = bucket.riskFlagsCount;
    const label = bucket.label;
    return {
      ...bucket,
      label,
      grossProfit: bucket.grossProfitSum,
      grossLoss: bucket.grossLossSum,
      riskFlagsCount: rFlags,
      hardFlagsCount: bucket.hardFlagsCount,
      softFlagsCount: bucket.softFlagsCount,
      behaviorFlagsCount: bFlags,
      directionalBiasCount: bDetails.directionalBias,
      timeframeMismatchCount: bDetails.timeframeMismatch,
      activityGapCount: bDetails.activityGap,
      composite: bucket.count ? bucket.compositeSum / bucket.count : 0,
      sharpe: bucket.count ? bucket.sharpeSum / bucket.count : 0,
      profitFactor: bucket.count ? bucket.profitFactorSum / bucket.count : 0,
      drawdownPct: bucket.count ? bucket.drawdownSum / bucket.count : 0,
      pd: bucket.count ? bucket.pdSum / bucket.count : 0
    };
  });

  const comparisonMetricMeta = BACKTEST_COMPARISON_METRICS.find((item) => item.key === metricKey) || BACKTEST_COMPARISON_METRICS[0];
  const comparator = comparisonMetricMeta.higherIsBetter
    ? (a, b) => b[metricKey] - a[metricKey]
    : (a, b) => a[metricKey] - b[metricKey];

  const rankedRows = rows
    .sort(comparator)
    .map((row, index) => ({
      ...row,
      rank: index + 1
    }));

  return rankedRows.sort((a, b) => a.label.localeCompare(b.label));
};
