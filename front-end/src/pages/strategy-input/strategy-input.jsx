// src/pages/strategy-input/strategy-input.jsx

import { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import { useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { useTheme } from '@mui/material/styles';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TablePagination from '@mui/material/TablePagination';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Pagination from '@mui/material/Pagination';
import Stack from '@mui/material/Stack';
import CircularProgress from '@mui/material/CircularProgress';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Collapse from '@mui/material/Collapse';
import ConfirmModal from 'components/ui/ConfirmModal';

// Icons
import SettingOutlined from '@ant-design/icons/SettingOutlined';
import BarChartOutlined from '@ant-design/icons/BarChartOutlined';
import EyeOutlined from '@ant-design/icons/EyeOutlined';
import DownloadOutlined from '@ant-design/icons/DownloadOutlined';
import CopyOutlined from '@ant-design/icons/CopyOutlined';
import CheckOutlined from '@ant-design/icons/CheckOutlined';
import CaretUpOutlined from '@ant-design/icons/CaretUpOutlined';
import CaretDownOutlined from '@ant-design/icons/CaretDownOutlined';
import InfoCircleOutlined from '@ant-design/icons/InfoCircleOutlined';
import CalendarOutlined from '@ant-design/icons/CalendarOutlined';
import RightOutlined from '@ant-design/icons/RightOutlined';
import DownOutlined from '@ant-design/icons/DownOutlined';

// IMPORT DATE PICKER
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';

// Project
import MainCard from 'components/MainCard';
import StrategySettingsDialog from 'components/StrategySettingsDialog';
import StrategyResultsDialog from 'components/StrategyResultsDialog';
import MoreOptionsModal from 'components/MoreOptionsModal';
import StrategyFilters from './StrategyFilters';
import StrategyTable from './StrategyTable';
import {
  useStrategies,
  useStrategiesByTimeRange,
  useStrategyDetail,
  useDistinctSymbols,
  useBalanceChart,
  clearStrategiesCache,
  useDeleteStrategy,
  useAnalysisRuns
} from 'hooks/useStrategy';
import { getAllStrategyIds, clearServerCache, downloadStrategySheet, getPreferences, savePreferences } from 'api/Strategy';
import { getBacktestTables } from 'api/order';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

const getBacktestDisplayName = (value) => {
  if (!value || value === 'all_backtests') return 'All Backtest';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'No source selected';
    return value.map(v => v.charAt(0).toUpperCase() + v.slice(1)).join(' + ');
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
};





export default function StrategyInput() {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  
  // ✅ STATE THEO DÕI DÒNG MỞ RỘNG (EXPANDED ROWS)
  const [expandedRows, setExpandedRows] = useState({});
  const toggleRow = (strategyId, backtestTable) => {
    const key = `${strategyId}-${backtestTable}`;
    setExpandedRows((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const [data, setData] = useState([]);
  const [sortOrder, setSortOrder] = useState(null); // null | 'asc' | 'desc'
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [pagination, setPagination] = useState({
    total: 0,
    totalPages: 0,
    currentPage: 1,
    pageSize: 10
  });

  // ✅ THÊM STATE CHO DATE RANGE
  const [dateRange, setDateRange] = useState({
    startDate: null,
    endDate: null
  });

  // ✅ Applied date range - chỉ update khi click Apply
  const [appliedDateRange, setAppliedDateRange] = useState({
    startDate: null,
    endDate: null
  });

  // ✅ Load filters from localStorage
  const loadFiltersFromStorage = () => {
    try {
      const savedFilters = localStorage.getItem('strategyInputFilters');
      const savedActiveFilters = localStorage.getItem('strategyActiveFilters');

      if (savedFilters) {
        const parsed = JSON.parse(savedFilters);
        // Migrate old 'symbol' (string) to 'symbols' (array)
        if (parsed.symbol !== undefined && parsed.symbols === undefined) {
          parsed.symbols = parsed.symbol ? [parsed.symbol] : [];
          delete parsed.symbol;
        }
        return parsed;
      }
    } catch (error) {
      console.error('Error loading filters from localStorage:', error);
    }

    return {
      search: '',
      symbols: [],
      timeframe: '',
      backtest: 'all_backtests',
      type: '',
      pd: '',
      totalNetProfit: '',
      totalTrades: '',
      winrate: '',
      largestProfitTradeRatio: '',
      riskRewardRatio: '',
      drawdown: '',
      largestLossTrade: '',
      profitFactor: '',
      sharpeRatio: '',
      recoveryFactor: '',
      lrCorrelation: ''
    };
  };

  const loadActiveFiltersFromStorage = () => {
    try {
      const savedActiveFilters = localStorage.getItem('strategyActiveFilters');
      if (savedActiveFilters) {
        return JSON.parse(savedActiveFilters);
      }
    } catch (error) {
      console.error('Error loading active filters from localStorage:', error);
    }
    return [];
  };

  // ✅ Tách filters thành inputFilters (hiển thị) và appliedFilters (dùng để query)
  const [inputFilters, setInputFilters] = useState(() => {
    const base = loadFiltersFromStorage();
    // Nếu có search param trong URL, override ngay từ đầu
    const urlSearch = new URLSearchParams(window.location.search).get('search');
    if (urlSearch) return { ...base, search: urlSearch };
    return base;
  });

  const [appliedFilters, setAppliedFilters] = useState(() => {
    const base = loadFiltersFromStorage();
    const urlSearch = new URLSearchParams(window.location.search).get('search');
    if (urlSearch) return { ...base, search: urlSearch };
    return base;
  });

  const [symbols, setSymbols] = useState([]);
  const [selectedStrategy, setSelectedStrategy] = useState(null);
  const [dialogType, setDialogType] = useState('');
  const [openDialog, setOpenDialog] = useState(false);

  // ✅ Snackbar for copy notifications
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [copying, setCopying] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [copiedCount, setCopiedCount] = useState(0);

  // ✅ More Options Modal
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);

  // ✅ Active filters - track which optional filters are currently displayed
  const [activeFilters, setActiveFilters] = useState(loadActiveFiltersFromStorage);

  // ✅ Load filter operators from localStorage
  const loadFilterOperatorsFromStorage = () => {
    try {
      const saved = localStorage.getItem('strategyFilterOperators');
      if (saved) return JSON.parse(saved);
    } catch (err) {
      console.error('Error loading filter operators from localStorage:', err);
    }
    return {};
  };
  const [filterOperators, setFilterOperators] = useState(loadFilterOperatorsFromStorage);

  const loadFilterRangesFromStorage = () => {
    try {
      const saved = localStorage.getItem('strategyFilterRanges');
      if (saved) return JSON.parse(saved);
    } catch (err) {}
    return {};
  };
  const [filterRanges, setFilterRanges] = useState(loadFilterRangesFromStorage);

  // ✅ Drawdown unit - 'percent' or 'absolute'
  const loadDrawdownUnitFromStorage = () => {
    try {
      const saved = localStorage.getItem('strategyDrawdownUnit');
      if (saved) return JSON.parse(saved);
    } catch (err) {}
    return 'percent';
  };
  const [drawdownUnit, setDrawdownUnit] = useState(loadDrawdownUnitFromStorage);

  // ✅ Applied versions - only updated when clicking Apply (prevent stale data from re-render)
  const [appliedFilterOperators, setAppliedFilterOperators] = useState(loadFilterOperatorsFromStorage);
  const [appliedFilterRanges, setAppliedFilterRanges] = useState(loadFilterRangesFromStorage);
  const [appliedDrawdownUnit, setAppliedDrawdownUnit] = useState(loadDrawdownUnitFromStorage);

  // ✅ State & Hook cho Analysis Run (Volume Optimization Lot Threshold)
  const [analysisRunId, setAnalysisRunId] = useState('');
  const [appliedAnalysisRunId, setAppliedAnalysisRunId] = useState('');
  const {
    runs: analysisRuns,
    loading: analysisRunsLoading,
    fetchRuns: fetchAnalysisRuns,
    clearRuns: clearAnalysisRuns
  } = useAnalysisRuns();

  useEffect(() => {
    if (analysisRunId && !analysisRuns.some((run) => run.analysis_run_id === analysisRunId)) {
      setAnalysisRunId('');
      setAppliedAnalysisRunId('');
    }
  }, [analysisRuns, analysisRunId]);

  const handleAnalysisRunChange = (event) => {
    const nextRunId = event.target.value;
    setAnalysisRunId(nextRunId);
    if (nextRunId) {
      setDateRange({ startDate: null, endDate: null });
    }
  };

  const handleAnalysisRunOpen = () => {
    fetchAnalysisRuns(inputFilters.backtest).catch((err) => {
      console.error('Failed to load analysis runs:', err);
    });
  };

  const handleDateRangeChange = (field, value) => {
    setDateRange((prev) => ({ ...prev, [field]: value }));
    setAnalysisRunId('');
  };

  // ✅ Dynamic backtest tables
  const [backtestTables, setBacktestTables] = useState([]);
  const [loadingTables, setLoadingTables] = useState(true);

  // ✅ Refs for debouncing and request control
  const debounceTimeoutRef = useRef(null);
  const isLoadingRef = useRef(false);
  const loadRequestIdRef = useRef(0);
  const prefSaveRef = useRef(null); // debounce timer for saving prefs to DB
  const prefLoadedRef = useRef(false); // true after DB prefs have been loaded
  const applyButtonTimeoutRef = useRef(null); // timeout for apply button cooldown
  const applyClickedRef = useRef(false); // track if Apply button was clicked
  const prevLoadingRef = useRef(false); // track previous loading state

  // ✅ Apply button cooldown state
  const [applyButtonDisabled, setApplyButtonDisabled] = useState(false);

  // ✅ Info dialog state
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);

  // ✅ Confirm delete state
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, strategyId: '', backtestTable: '' });

  // Hooks
  const { fetchStrategies, loading: loadingNormal } = useStrategies();
  const { fetchStrategiesByTimeRange, loading: loadingByTimeRange } = useStrategiesByTimeRange();
  const { fetchStrategyDetail, loading: detailLoading } = useStrategyDetail();
  const { fetchSymbols } = useDistinctSymbols();
  const { deleteStrategy } = useDeleteStrategy();

  const handleDeleteStrategy = (strategyId, backtestTable) => {
    setDeleteConfirm({ open: true, strategyId, backtestTable });
  };

  const handleConfirmDelete = async () => {
    const { strategyId, backtestTable } = deleteConfirm;
    setDeleteConfirm({ open: false, strategyId: '', backtestTable: '' });
    if (!strategyId || !backtestTable) return;

    try {
      await deleteStrategy(strategyId, backtestTable);
      setSnackbar({
        open: true,
        message: 'Đã xóa chiến thuật và toàn bộ dữ liệu liên quan thành công!',
        severity: 'success'
      });
      clearStrategiesCache();
      loadData();
    } catch (e) {
      setSnackbar({
        open: true,
        message: `Xóa thất bại: ${e.message}`,
        severity: 'error'
      });
    }
  };

  // ✅ Combine loading states from both hooks
  const loading = loadingNormal || loadingByTimeRange;

  // ✅ Đọc search param từ URL (ví dụ từ Market Watch navigate)
  const [searchParams, setSearchParams] = useSearchParams();
  const searchFromUrl = searchParams.get('search');

  useEffect(() => {
    if (!searchFromUrl) return;
    // Xóa param khỏi URL ngay
    setSearchParams({}, { replace: true });
  }, []);

  // ✅ Load preferences từ DB khi component mount (override localStorage nếu có)
  useEffect(() => {
    const loadFromDB = async () => {
      try {
        const prefs = await getPreferences();
        const sf = prefs?.strategyFilters;
        if (sf && Object.keys(sf).length > 0) {
          if (Array.isArray(sf.activeFilters)) setActiveFilters(sf.activeFilters);
          if (sf.filterOperators) setFilterOperators(sf.filterOperators);
          if (sf.filterRanges) setFilterRanges(sf.filterRanges);
          if (sf.drawdownUnit) setDrawdownUnit(sf.drawdownUnit);
          if (sf.inputFilters) {
            setInputFilters((prev) => ({
              ...prev,
              ...sf.inputFilters,
              // URL param luôn thắng preferences
              ...(searchFromUrl ? { search: searchFromUrl } : {}),
            }));
          }
        }
        // Nếu có URL param, apply filter ngay sau khi load prefs xong
        if (searchFromUrl) {
          setAppliedFilters((prev) => ({ ...prev, search: searchFromUrl }));
        }
      } catch {
        // Không có token / offline → giữ nguyên localStorage
        if (searchFromUrl) {
          setAppliedFilters((prev) => ({ ...prev, search: searchFromUrl }));
        }
      } finally {
        // ✅ Tránh race-condition ghi đè ngược DB: Chỉ bắt đầu auto-save sau khi state update đã flush hoàn toàn
        setTimeout(() => {
          prefLoadedRef.current = true;
        }, 500);
      }
    };
    loadFromDB();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ Auto-save preferences lên localStorage và DB (debounce 1.5s) mỗi khi filter thay đổi
  useEffect(() => {
    if (!prefLoadedRef.current) return; // chờ load xong mới bắt đầu save
    
    // Save immediately to localStorage
    try {
      localStorage.setItem('strategyInputFilters', JSON.stringify(inputFilters));
      localStorage.setItem('strategyActiveFilters', JSON.stringify(activeFilters));
      localStorage.setItem('strategyFilterOperators', JSON.stringify(filterOperators));
      localStorage.setItem('strategyFilterRanges', JSON.stringify(filterRanges));
      localStorage.setItem('strategyDrawdownUnit', drawdownUnit);
    } catch (e) {
      console.error('Failed to save preferences to localStorage:', e);
    }

    if (prefSaveRef.current) clearTimeout(prefSaveRef.current);
    prefSaveRef.current = setTimeout(() => {
      savePreferences({ activeFilters, filterOperators, filterRanges, drawdownUnit, inputFilters }).catch(() => {});
    }, 1500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilters, filterOperators, filterRanges, drawdownUnit, inputFilters]);

  // ✅ Load symbols dựa trên appliedFilters.backtest (chỉ load khi Apply)
  useEffect(() => {
    loadSymbols();
  }, [appliedFilters.backtest]);

  // ✅ Load backtest tables cho dropdown + validate saved backtest filter
  useEffect(() => {
    const loadTables = async () => {
      try {
        setLoadingTables(true);
        const response = await getBacktestTables();
        const tables = response.tables || [];
        setBacktestTables(tables);

        // ✅ Validate: nếu backtest filter đang lưu không còn tồn tại → reset về all_backtests
        const validateBacktest = (val) => {
          if (!val || val === 'all_backtests') return true;
          if (Array.isArray(val)) return val.every(t => tables.includes(t));
          return tables.includes(val);
        };

        if (!validateBacktest(inputFilters.backtest)) {
          setInputFilters(prev => ({ ...prev, backtest: 'all_backtests' }));
          setAppliedFilters(prev => ({ ...prev, backtest: 'all_backtests' }));
        }
      } catch (err) {
        console.error('Failed to load backtest tables:', err);
        setBacktestTables([]);
      } finally {
        setLoadingTables(false);
      }
    };
    loadTables();
  }, []);

  // ✅ Load data chỉ khi appliedFilters hoặc appliedDateRange hoặc appliedAnalysisRunId thay đổi (khi click Apply)
  // Chờ loadingTables = false để đảm bảo backtest filter đã được validate trước
  useEffect(() => {
    if (loadingTables) return;
    loadData();
  }, [page, pageSize, appliedFilters, sortOrder, appliedDateRange, appliedFilterOperators, appliedFilterRanges, appliedAnalysisRunId, loadingTables]);

  const loadSymbols = async () => {
    try {
      if (Array.isArray(appliedFilters.backtest) && appliedFilters.backtest.length === 0) {
        setSymbols([]);
        return;
      }
      const symbolList = await fetchSymbols(resolveBacktestParam(appliedFilters.backtest));
      setSymbols(symbolList);
    } catch (err) {
      console.error('Failed to load symbols:', err);
    }
  };

  const loadData = async () => {
    const requestId = (loadRequestIdRef.current += 1);
    try {
      isLoadingRef.current = true;

      if (Array.isArray(appliedFilters.backtest) && appliedFilters.backtest.length === 0) {
        setData([]);
        setPagination({
          total: 0,
          totalPages: 0,
          currentPage: 1,
          pageSize
        });
        return;
      }

      // ✅ Check if date range is set (use APPLIED date range)
      const hasDateRange = appliedDateRange.startDate && appliedDateRange.endDate;

      let result;

      if (hasDateRange) {
        // ✅ Use DATE RANGE API - tính 5 metrics từ date range
        result = await fetchStrategiesByTimeRange({
          page,
          pageSize,
          backtestTable: resolveBacktestParam(appliedFilters.backtest),
          analysisRunId: appliedAnalysisRunId || null,
          startDate: appliedDateRange.startDate.format('YYYY-MM-DD'),
          endDate: appliedDateRange.endDate.format('YYYY-MM-DD'),
          symbol: appliedFilters.symbols && appliedFilters.symbols.length > 0 ? appliedFilters.symbols : null,
          search: appliedFilters.search || null,
          type: appliedFilters.type || null,
          timeframe: appliedFilters.timeframe || null,
          // ✅ DATE RANGE filters (8 metrics) - pass filter values
          pd: appliedFilters.pd || null,
          totalNetProfit: appliedFilters.totalNetProfit || null,
          totalTrades: appliedFilters.totalTrades || null,
          winrate: appliedFilters.winrate || null,
          largestLossTrade: appliedFilters.largestLossTrade || null,
          largestProfitTradeRatio: appliedFilters.largestProfitTradeRatio || null,
          riskRewardRatio: appliedFilters.riskRewardRatio || null,
          drawdown: appliedFilters.drawdown || null,
          // ✅ FULL PERIOD filters (4 metrics từ results column) - pass filter values
          profitFactor: appliedFilters.profitFactor || null,
          sharpeRatio: appliedFilters.sharpeRatio || null,
          recoveryFactor: appliedFilters.recoveryFactor || null,
          lrCorrelation: appliedFilters.lrCorrelation || null,
          // ✅ Pass operators và ranges để support >=, >, <, <=, range
          filterOperators: { ...appliedFilterOperators, _drawdownUnit: appliedDrawdownUnit },
          filterRanges: appliedFilterRanges || {},
          sortBy: sortOrder ? 'quantity' : null,
          sortDir: sortOrder || null
        });
      } else {
        // ✅ Use NORMAL API - không có date range
        result = await fetchStrategies({
          page,
          pageSize,
          backtestTable: resolveBacktestParam(appliedFilters.backtest),
          analysisRunId: appliedAnalysisRunId || null,
          symbol: appliedFilters.symbols && appliedFilters.symbols.length > 0 ? appliedFilters.symbols : null,
          search: appliedFilters.search || null,
          type: appliedFilters.type || null,
          timeframe: appliedFilters.timeframe || null,
          pd: appliedFilters.pd || null,
          totalNetProfit: appliedFilters.totalNetProfit || null,
          totalTrades: appliedFilters.totalTrades || null,
          winrate: appliedFilters.winrate || null,
          largestProfitTradeRatio: appliedFilters.largestProfitTradeRatio || null,
          riskRewardRatio: appliedFilters.riskRewardRatio || null,
          drawdown: appliedFilters.drawdown || null,
          largestLossTrade: appliedFilters.largestLossTrade || null,
          profitFactor: appliedFilters.profitFactor || null,
          sharpeRatio: appliedFilters.sharpeRatio || null,
          recoveryFactor: appliedFilters.recoveryFactor || null,
          lrCorrelation: appliedFilters.lrCorrelation || null,
          filterOperators: { ...appliedFilterOperators, _drawdownUnit: appliedDrawdownUnit },
          filterRanges: appliedFilterRanges || {},
          sortBy: sortOrder ? 'quantity' : null,
          sortDir: sortOrder || null
        });
      }

      // ✅ Only update if request wasn't cancelled
      if (result && requestId === loadRequestIdRef.current) {
        const rawData = result.data || [];
        setData(rawData);

        setPagination(
          result.pagination || {
            total: 0,
            totalPages: 0,
            currentPage: 1,
            pageSize: 20
          }
        );

        // ✅ Dispatch context to chatbot so AI knows what data is on screen
        window.dispatchEvent(new CustomEvent('chatbot:context', {
          detail: {
            context: {
              page: 'Strategy Input',
              filters: {
                ...appliedFilters,
                dateRange: appliedDateRange.startDate ? {
                  start: appliedDateRange.startDate.format('YYYY-MM-DD'),
                  end: appliedDateRange.endDate?.format('YYYY-MM-DD'),
                } : null,
              },
              totalStrategies: result.pagination?.total || rawData.length,
              currentData: rawData.slice(0, 20).map(s => ({
                strategy_id: s.strategy_id,
                backtest_table: s.backtest_table,
                symbol: s.symbol,
                timeframe: s.timeframe,
                expert_name: s.expert_name,
                totalNetProfit: s.results?.totalNetProfit,
                totalTrades: s.results?.totalTrades,
                profitTrades: s.results?.profitTrades,
                balanceDrawdownMaximal: s.results?.balanceDrawdownMaximal,
                profitFactor: s.results?.profitFactor,
                sharpeRatio: s.results?.sharpeRatio,
                recoveryFactor: s.results?.recoveryFactor,
                lrCorrelation: s.results?.lrCorrelation,
                // time-range fields if present (dynamic metrics computed in date range)
                ...(s.pd_ratio != null ? { pd_ratio: s.pd_ratio } : {}),
                ...(s.winrate != null ? { winrate: s.winrate } : {}),
                ...(s.quantity != null ? { quantity: s.quantity } : {}),
                ...(s.total_profit != null ? { total_profit: s.total_profit } : {}),
                ...(s.max_drawdown != null ? { max_drawdown: s.max_drawdown } : {}),
                ...(s.risk_reward_ratio != null ? { risk_reward_ratio: s.risk_reward_ratio } : {}),
                ...(s.largest_loss_trade != null ? { largest_loss_trade: s.largest_loss_trade } : {}),
                ...(s.largest_profit_trade_ratio != null ? { largest_profit_trade_ratio: s.largest_profit_trade_ratio } : {}),
                ...(s.profit_factor != null ? { profit_factor: s.profit_factor } : {}),
                ...(s.sharpe_ratio != null ? { sharpe_ratio: s.sharpe_ratio } : {}),
                ...(s.recovery_factor != null ? { recovery_factor: s.recovery_factor } : {}),
                ...(s.lr_correlation != null ? { lr_correlation: s.lr_correlation } : {}),
              })),
            }
          }
        }));
      }
    } catch (err) {
      // ✅ Better error handling
      if (err.name !== 'AbortError' && requestId === loadRequestIdRef.current) {
        console.error('Failed to load strategies:', err);
        setData([]);
        setPagination({
          total: 0,
          totalPages: 0,
          currentPage: 1,
          pageSize: 20
        });
      }
    } finally {
      if (requestId === loadRequestIdRef.current) {
        isLoadingRef.current = false;
      }
    }
  };

  // ✅ Xử lý thay đổi filter - chỉ cập nhật inputFilters (không apply)
  const handleFilterChange = (field, value) => {
    setInputFilters((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  // ✅ Apply filter khi click nút Apply
  const handleSearch = useCallback((searchOverride = null) => {
    // ✅ Clear any pending debounce
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Apply tất cả inputFilters, dateRange, operators, ranges, và analysisRunId
    const nextFilters = typeof searchOverride === 'string'
      ? { ...inputFilters, search: searchOverride }
      : { ...inputFilters };
    if (typeof searchOverride === 'string' && searchOverride !== inputFilters.search) {
      setInputFilters(nextFilters);
    }
    setAppliedFilters(nextFilters);
    setAppliedDateRange({ ...dateRange });
    setAppliedFilterOperators({ ...filterOperators });
    setAppliedFilterRanges({ ...filterRanges });
    setAppliedDrawdownUnit(drawdownUnit);
    setAppliedAnalysisRunId(analysisRunId);
    setPage(1);

    // ✅ Mark that Apply button was clicked (will start cooldown after loading)
    applyClickedRef.current = true;
  }, [inputFilters, dateRange, filterOperators, filterRanges, drawdownUnit, analysisRunId]);

  // ✅ Reset filters - chỉ xóa giá trị, không ẩn các trường
  const handleReset = () => {
    // ✅ Clear any pending debounce
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // ✅ Clear both frontend and backend in-memory cache
    // so fresh data is always fetched from DB after manual deletions
    clearStrategiesCache();
    clearServerCache();

    const resetFilters = {
      search: '',
      symbols: [],
      backtest: 'all_backtests',
      type: '',
      timeframe: '',
      pd: '',
      totalNetProfit: '',
      totalTrades: '',
      winrate: '',
      largestProfitTradeRatio: '',
      riskRewardRatio: '',
      drawdown: '',
      largestLossTrade: '',
      profitFactor: '',
      sharpeRatio: '',
      recoveryFactor: '',
      lrCorrelation: ''
    };

    setInputFilters(resetFilters);
    setAppliedFilters(resetFilters);
    setSortOrder(null);
    setFilterOperators({});
    setFilterRanges({});
    setAppliedFilterOperators({});
    setAppliedFilterRanges({});
    setDateRange({
      startDate: null,
      endDate: null
    });
    setAppliedDateRange({
      startDate: null,
      endDate: null
    });
    setAnalysisRunId('');
    setAppliedAnalysisRunId('');
    // Không xóa activeFilters - các trường vẫn hiển thị
    setPage(1);
    
    // ✅ Xóa preferences trên DB và localStorage
    try {
      localStorage.removeItem('strategyInputFilters');
      localStorage.removeItem('strategyActiveFilters');
      localStorage.removeItem('strategyFilterOperators');
      localStorage.removeItem('strategyFilterRanges');
      localStorage.removeItem('strategyDrawdownUnit');
    } catch (e) {
      console.error('Failed to clear localStorage on reset:', e);
    }
    
    savePreferences({}).catch(() => {});
  };

  // Handle Backtest dropdown change - multi-select, cần ấn Apply để lọc
  const handleBacktestChange = (event) => {
    const value = event.target.value;
    setAnalysisRunId('');
    clearAnalysisRuns();
    // value là array từ multi-select
    // Nếu chọn 'all_backtests' → reset về all_backtests
    if (value.includes('all_select')) {
      const currentlyAll = inputFilters.backtest === 'all_backtests'
        || (Array.isArray(inputFilters.backtest) && inputFilters.backtest.length === backtestTables.length);
      setInputFilters((prev) => ({ ...prev, backtest: currentlyAll ? [] : 'all_backtests' }));
    } else {
      const selected = typeof value === 'string' ? value.split(',') : value;
      const nextValue = selected.length === backtestTables.length ? 'all_backtests' : selected;
      setInputFilters((prev) => ({ ...prev, backtest: nextValue }));
    }
  };

  // ✅ Convert backtest filter value → API param (all_backtests, string = single, comma-sep = multi)
  const resolveBacktestParam = (backtest) => {
    if (!backtest || backtest === 'all_backtests') return 'all_backtests';
    if (Array.isArray(backtest)) return backtest.length === 0 ? null : backtest.join(',');
    return backtest;
  };

  // ✅ Debounced Enter key handler to prevent rapid requests
  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Enter') {
        // ✅ Prevent if already loading
        if (loading || isLoadingRef.current) {
          return;
        }

        // ✅ Clear existing timeout
        if (debounceTimeoutRef.current) {
          clearTimeout(debounceTimeoutRef.current);
        }

        // ✅ Debounce for 300ms to prevent rapid Enter presses
        debounceTimeoutRef.current = setTimeout(() => {
          handleSearch();
        }, 300);
      }
    },
    [handleSearch, loading]
  );

  // ✅ Cleanup debounce and apply button timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      if (applyButtonTimeoutRef.current) {
        clearTimeout(applyButtonTimeoutRef.current);
      }
    };
  }, []);

  const handlePageChange = (event, value) => {
    setPage(value);
  };

  const handleOpenDialog = async (type, strategy) => {
    setDialogType(type);
    setOpenDialog(true);

    try {
      // Fetch full details từ API
      const fullStrategy = await fetchStrategyDetail(strategy.strategy_id, strategy.backtest_table);
      setSelectedStrategy({
        ...strategy,
        ...fullStrategy,
        metrics_mode: strategy.metrics_mode,
        analysis_run_id: strategy.analysis_run_id,
        time_begin: strategy.time_begin,
        time_end: strategy.time_end,
        threshold_applied: strategy.threshold_applied
      });
    } catch (err) {
      console.error('Failed to load strategy detail:', err);
      setSelectedStrategy(strategy); // Fallback to basic data
    }
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setDialogType('');
    setSelectedStrategy(null);
  };

  // ✅ More Options handlers
  const handleMoreOptionsClick = () => {
    setMoreOptionsOpen(true);
  };

  const handleAddFilters = (selectedFilterKeys, operators = {}, rangeValues = {}, newDrawdownUnit = 'percent') => {
    setActiveFilters(selectedFilterKeys);
    setFilterOperators(operators);
    setFilterRanges(rangeValues);
    setDrawdownUnit(newDrawdownUnit);

    // Clear values for filters that are no longer active
    setInputFilters((prev) => {
      const updated = { ...prev };
      const allOptionalFilters = [
        'pd',
        'totalNetProfit',
        'totalTrades',
        'winrate',
        'largestProfitTradeRatio',
        'riskRewardRatio',
        'drawdown',
        'largestLossTrade',
        'profitFactor',
        'sharpeRatio',
        'recoveryFactor',
        'lrCorrelation'
      ];
      allOptionalFilters.forEach((key) => {
        if (!selectedFilterKeys.includes(key)) {
          updated[key] = '';
        }
      });
      return updated;
    });
  };

  // ✅ Remove a specific filter - chỉ ẩn UI, không auto-reload
  const handleRemoveFilter = (filterKey) => {
    // Remove from activeFilters
    setActiveFilters((prev) => prev.filter((key) => key !== filterKey));
    setFilterOperators((prev) => {
      const { [filterKey]: _r, ...rest } = prev;
      return rest;
    });
    setFilterRanges((prev) => {
      const { [filterKey]: _r, ...rest } = prev;
      return rest;
    });

    // Clear the filter value from inputFilters (UI only)
    setInputFilters((prev) => ({
      ...prev,
      [filterKey]: ''
    }));

    // ✅ KHÔNG clear appliedFilters → không trigger reload
    // User phải ấn Apply để reload với filter mới
  };

  // ✅ Operator display helper
  const OP_SYMBOLS = { '>=': '≥', '>': '>', '<': '<', '<=': '≤' };
  const opLabel = (text, key) => {
    if (filterOperators[key] === 'range') return `${text} [Range]`;
    const sym = OP_SYMBOLS[filterOperators[key] || '>='];
    return `${text} (${sym})`;
  };

  const isRange = (key) => filterOperators[key] === 'range';
  const rangeDisplay = (key) => {
    const r = filterRanges[key];
    if (!r) return '';
    const mn = r.min !== undefined && r.min !== '' ? r.min : '';
    const mx = r.max !== undefined && r.max !== '' ? r.max : '';
    return `[${mn} : ${mx}]`;
  };

  // ✅ Generate dynamic table title
  const getTableTitle = () => {
    const backtestName = getBacktestDisplayName(appliedFilters.backtest);
    const baseTitle = `${backtestName} Strategies (${pagination.total})`;
    const selectedRun = analysisRuns.find((run) => run.analysis_run_id === appliedAnalysisRunId);
    const rangeSource = selectedRun || (appliedAnalysisRunId ? data[0] : null);
    if (!rangeSource?.time_begin || !rangeSource?.time_end) return baseTitle;

    const from = dayjs(rangeSource.time_begin);
    const to = dayjs(rangeSource.time_end);
    if (!from.isValid() || !to.isValid()) return baseTitle;

    return `${baseTitle} · Range: ${from.format('DD/MM/YYYY HH:mm')} → ${to.format('DD/MM/YYYY HH:mm')}`;
  };

  // ✅ Helper: Copy to clipboard - Always successful method
  const copyToClipboard = async (text) => {
    // Try modern Clipboard API first (no focus needed)
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch (clipboardErr) {
        console.warn('Clipboard API failed, using fallback:', clipboardErr);
      }
    }

    // Fallback: Ensure window focus and use textarea method
    return new Promise((resolve, reject) => {
      // Force window focus
      window.focus();
      document.body.focus();

      // Wait for focus to stabilize
      setTimeout(() => {
        const textarea = document.createElement('textarea');
        textarea.value = text;

        // Make textarea visible but off-screen for better compatibility
        textarea.style.position = 'fixed';
        textarea.style.left = '0';
        textarea.style.top = '0';
        textarea.style.width = '1px';
        textarea.style.height = '1px';
        textarea.style.padding = '0';
        textarea.style.border = 'none';
        textarea.style.outline = 'none';
        textarea.style.boxShadow = 'none';
        textarea.style.background = 'transparent';

        document.body.appendChild(textarea);

        // Focus, select, and copy
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);

        let successful = false;
        try {
          successful = document.execCommand('copy');
        } catch (err) {
          console.error('Copy execCommand error:', err);
        }

        document.body.removeChild(textarea);

        if (successful) {
          resolve();
        } else {
          reject(new Error('Copy failed'));
        }
      }, 100); // 100ms delay for window to stabilize
    });
  };

  // ✅ Copy ALL strategy IDs (all pages) to clipboard
  const handleCopyAllIds = async () => {
    if (pagination.total === 0) {
      setSnackbar({ open: true, message: 'No strategies to copy', severity: 'warning' });
      return;
    }

    let allIds = [];

    try {
      setCopying(true);
      setCopySuccess(false); // Reset success state
      setCopiedCount(0); // Reset count
      setSnackbar({ open: true, message: 'Fetching strategy IDs...', severity: 'info' });

      // Fetch all IDs
      allIds = await getAllStrategyIds({
        backtestTable: resolveBacktestParam(appliedFilters.backtest),
        startDate: appliedDateRange.startDate ? appliedDateRange.startDate.format('YYYY-MM-DD') : null,
        endDate: appliedDateRange.endDate ? appliedDateRange.endDate.format('YYYY-MM-DD') : null,
        symbol: appliedFilters.symbols && appliedFilters.symbols.length > 0 ? appliedFilters.symbols : null,
        search: appliedFilters.search || null,
        type: appliedFilters.type || null,
        timeframe: appliedFilters.timeframe || null,
        pd: appliedFilters.pd || null,
        totalNetProfit: appliedFilters.totalNetProfit || null,
        totalTrades: appliedFilters.totalTrades || null,
        winrate: appliedFilters.winrate || null,
        largestProfitTradeRatio: appliedFilters.largestProfitTradeRatio || null,
        riskRewardRatio: appliedFilters.riskRewardRatio || null,
        drawdown: appliedFilters.drawdown || null,
        largestLossTrade: appliedFilters.largestLossTrade || null,
        profitFactor: appliedFilters.profitFactor || null,
        sharpeRatio: appliedFilters.sharpeRatio || null,
        recoveryFactor: appliedFilters.recoveryFactor || null,
        lrCorrelation: appliedFilters.lrCorrelation || null,
        filterOperators: appliedFilterOperators || {},
        filterRanges: appliedFilterRanges || {},
        // Progress callback
        onProgress: (currentPage, totalPages, collectedCount) => {
          setSnackbar({
            open: true,
            message: `Fetching page ${currentPage}/${totalPages} (${collectedCount} IDs collected)...`,
            severity: 'info'
          });
        }
      });

      if (allIds.length === 0) {
        setSnackbar({ open: true, message: 'No strategy IDs found', severity: 'warning' });
        return;
      }

      // Show preparing message
      setSnackbar({
        open: true,
        message: `Copying ${allIds.length} strategy IDs to clipboard...`,
        severity: 'info'
      });

      const idsText = allIds.join('\n');

      // ✅ Copy to clipboard (with auto-retry built-in)
      await copyToClipboard(idsText);

      setSnackbar({
        open: true,
        message: `✅ Copied ${allIds.length} strategy IDs to clipboard!`,
        severity: 'success'
      });

      // ✅ Set success state and auto-reset after 3 seconds
      setCopySuccess(true);
      setCopiedCount(allIds.length);
      setTimeout(() => {
        setCopySuccess(false);
        setCopiedCount(0);
      }, 3000);
    } catch (err) {
      console.error('Failed to copy all IDs:', err);

      // More helpful error message
      let errorMessage = err.message || 'Failed to copy strategy IDs';
      if (errorMessage.includes('Copy command failed')) {
        errorMessage = 'Copy failed. Please click the button again or ensure the window has focus.';
      }

      setSnackbar({
        open: true,
        message: `Error: ${errorMessage}`,
        severity: 'error',
        autoHideDuration: 6000 // Show error longer
      });
    } finally {
      setCopying(false);
    }
  };

  // ✅ Close snackbar
  const handleCloseSnackbar = () => {
    setSnackbar((prev) => ({ ...prev, open: false }));
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Grid container rowSpacing={4.5} columnSpacing={2.75}>
        {/* Header */}
        <Grid size={12} sx={{ mb: -2.25 }}>
          <Typography variant="h5">Strategies</Typography>
        </Grid>

        {/* Filters */}
        <StrategyFilters
          inputFilters={inputFilters}
          handleBacktestChange={handleBacktestChange}
          backtestTables={backtestTables}
          loadingTables={loadingTables}
          symbols={symbols}
          dateRange={dateRange}
          handleDateRangeChange={handleDateRangeChange}
          analysisRunId={analysisRunId}
          handleAnalysisRunChange={handleAnalysisRunChange}
          handleAnalysisRunOpen={handleAnalysisRunOpen}
          analysisRuns={analysisRuns}
          loadingRuns={analysisRunsLoading}
          activeFilters={activeFilters}
          filterOperators={filterOperators}
          filterRanges={filterRanges}
          drawdownUnit={drawdownUnit}
          handleFilterChange={handleFilterChange}
          handleKeyDown={handleKeyDown}
          handleRemoveFilter={handleRemoveFilter}
          handleReset={handleReset}
          handleMoreOptionsClick={handleMoreOptionsClick}
          loading={loading}
          applyButtonDisabled={applyButtonDisabled}
          handleSearch={handleSearch}
          pagination={pagination}
          data={data}
          appliedFilters={appliedFilters}
          appliedDateRange={appliedDateRange}
          setInfoDialogOpen={setInfoDialogOpen}
        />

        {/* Table - ✅ Dynamic Title with Copy Buttons */}
        <StrategyTable
          getTableTitle={getTableTitle}
          copying={copying}
          copySuccess={copySuccess}
          copiedCount={copiedCount}
          handleCopyAllIds={handleCopyAllIds}
          pagination={pagination}
          loading={loading}
          data={data}
          expandedRows={expandedRows}
          toggleRow={toggleRow}
          appliedDateRange={appliedDateRange}
          analysisRunActive={Boolean(appliedAnalysisRunId)}
          appliedDrawdownUnit={appliedDrawdownUnit}
          sortOrder={sortOrder}
          setSortOrder={setSortOrder}
          handleOpenDialog={handleOpenDialog}
          setSnackbar={setSnackbar}
          page={page}
          setPage={setPage}
          pageSize={pageSize}
          setPageSize={setPageSize}
          handlePageChange={handlePageChange}
          onDeleteStrategy={handleDeleteStrategy}
        />

        {/* DIALOGS */}
        <StrategySettingsDialog
          open={openDialog && dialogType === 'settings'}
          onClose={handleCloseDialog}
          strategy={selectedStrategy}
          loading={detailLoading}
        />

        <StrategyResultsDialog
          open={openDialog && dialogType === 'results'}
          onClose={handleCloseDialog}
          strategy={selectedStrategy}
          loading={detailLoading}
          dateRange={appliedDateRange}
        />

        <MoreOptionsModal
          open={moreOptionsOpen}
          onClose={() => setMoreOptionsOpen(false)}
          onAddFilters={handleAddFilters}
          activeFilters={activeFilters}
          filterOperators={filterOperators}
          filterRanges={filterRanges}
          drawdownUnit={drawdownUnit}
        />

        {/* ✅ Snackbar for notifications */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={
            snackbar.autoHideDuration !== undefined ? snackbar.autoHideDuration : snackbar.severity === 'info' ? null : 4000
          }
          onClose={handleCloseSnackbar}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }} variant="filled">
            {snackbar.message}
          </Alert>
        </Snackbar>

        {/* Info Dialog */}
        <Dialog open={infoDialogOpen} onClose={() => setInfoDialogOpen(false)} maxWidth="md" fullWidth>
          <DialogTitle sx={{ bgcolor: 'info.lighter', color: 'info.darker', display: 'flex', alignItems: 'center', gap: 1 }}>
            <InfoCircleOutlined style={{ fontSize: '20px' }} />
            Lưu ý quan trọng khi sử dụng trang Strategy Input
          </DialogTitle>
          <DialogContent sx={{ mt: 2 }}>
            <Typography variant="h6" gutterBottom sx={{ color: 'warning.main', fontWeight: 600 }}>
              ⚠️ Lần đầu vào trang
            </Typography>
            <Typography variant="body1" paragraph sx={{ pl: 2 }}>
              • Nên bấm nút <strong>Reset</strong> để xóa các filter cũ đã lưu trong localStorage và database preferences
            </Typography>
            <Typography variant="body1" paragraph sx={{ pl: 2 }}>
              • Điều này đảm bảo bạn xem toàn bộ strategies mà không bị filter cũ ảnh hưởng
            </Typography>

            <Typography variant="h6" gutterBottom sx={{ color: 'primary.main', fontWeight: 600, mt: 3 }}>
              📅 Lọc động 12 chỉ số theo Date Range
            </Typography>
            <Typography variant="body1" paragraph sx={{ pl: 2 }}>
              Khi chọn khoảng thời gian (From - To), toàn bộ <strong>12 chỉ số</strong> sẽ được tính toán động trực tiếp từ deals trong khoảng thời gian đó để đảm bảo độ chính xác tuyệt đối.
            </Typography>

            <Accordion sx={{ mt: 2, mb: 3, boxShadow: 'none', border: '1px solid', borderColor: 'divider' }}>
              <AccordionSummary expandIcon={<DownOutlined />} sx={{ bgcolor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'grey.50', '& .MuiTypography-root': { color: isDarkMode ? 'text.primary' : 'inherit' } }}>
                <Typography sx={{ fontWeight: 600 }}>Chi tiết công thức & hệ quy chiếu của 12 chỉ số động</Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 0 }}>
                <TableContainer component={Paper} sx={{ boxShadow: 'none', borderRadius: 0 }}>
                  <Table size="small">
                    <TableHead sx={{ bgcolor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'grey.100' }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600, width: '25%' }}>Chỉ số</TableCell>
                        <TableCell sx={{ fontWeight: 600, width: '40%' }}>Công thức tính động trong kỳ</TableCell>
                        <TableCell sx={{ fontWeight: 600, width: '35%' }}>Hệ quy chiếu & Giải thích</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      <TableRow hover>
                        <TableCell><strong>1. P/D Ratio</strong></TableCell>
                        <TableCell><code>Net Profit / Max Drawdown</code></TableCell>
                        <TableCell>Hệ số lợi nhuận trên sụt giảm tài sản tối đa.</TableCell>
                      </TableRow>
                      <TableRow hover>
                        <TableCell><strong>2. Total Net Profit</strong></TableCell>
                        <TableCell><code>SUM(profit + commission + swap)</code></TableCell>
                        <TableCell>Tổng lợi nhuận ròng thu về trong kỳ được lọc.</TableCell>
                      </TableRow>
                      <TableRow hover>
                        <TableCell><strong>3. Total Trades</strong></TableCell>
                        <TableCell><code>FLOOR(COUNT(deals) / 2)</code></TableCell>
                        <TableCell>Tổng số lệnh giao dịch đóng/mở.</TableCell>
                      </TableRow>
                      <TableRow hover>
                        <TableCell><strong>4. Winrate %</strong></TableCell>
                        <TableCell><code>(Lệnh thắng / Tổng lệnh) * 100</code></TableCell>
                        <TableCell>Tỷ lệ số lệnh có lợi nhuận dương trong kỳ.</TableCell>
                      </TableRow>
                      <TableRow hover>
                        <TableCell><strong>5. Largest Loss Trade</strong></TableCell>
                        <TableCell><code>MIN(profit + commission + swap)</code></TableCell>
                        <TableCell>Lệnh thua lỗ lớn nhất phát sinh trong kỳ.</TableCell>
                      </TableRow>
                      <TableRow hover>
                        <TableCell><strong>6. LPT Ratio</strong></TableCell>
                        <TableCell><code>(Lệnh thắng max / Net Profit) * 100</code></TableCell>
                        <TableCell>Tỷ trọng lệnh thắng lớn nhất trên tổng lợi nhuận.</TableCell>
                      </TableRow>
                      <TableRow hover>
                        <TableCell><strong>7. Max Drawdown</strong></TableCell>
                        <TableCell><code>MAX(Peak Equity - Current Equity)</code></TableCell>
                        <TableCell>Sụt giảm tài khoản lớn nhất tính động theo Equity Curve.</TableCell>
                      </TableRow>
                      <TableRow hover>
                        <TableCell><strong>8. Risk-Reward Ratio</strong></TableCell>
                        <TableCell><code>Avg Profit / Abs(Avg Loss)</code></TableCell>
                        <TableCell>Tỷ lệ Lợi nhuận trung bình / Thua lỗ trung bình.</TableCell>
                      </TableRow>
                      <TableRow hover>
                        <TableCell><strong>9. Profit Factor</strong></TableCell>
                        <TableCell><code>Gross Profit / Gross Loss</code></TableCell>
                        <TableCell>Tỷ lệ tổng lợi nhuận thu được / tổng thua lỗ.</TableCell>
                      </TableRow>
                      <TableRow hover sx={{ bgcolor: isDarkMode ? 'rgba(30, 144, 255, 0.15)' : 'rgba(30, 144, 255, 0.05)' }}>
                        <TableCell><strong>10. Sharpe Ratio</strong></TableCell>
                        <TableCell>
                          <code>(Avg / StdDev) * SQRT(Trades Per Year)</code>
                        </TableCell>
                        <TableCell>
                          <strong>Chuẩn hóa theo năm (Annualized):</strong> Giúp đưa Sharpe Ratio động về đúng hệ quy chiếu thực tế (từ <code>0.5</code> đến <code>3.0</code>) tương đương MT5.
                        </TableCell>
                      </TableRow>
                      <TableRow hover>
                        <TableCell><strong>11. Recovery Factor</strong></TableCell>
                        <TableCell><code>Net Profit / Max Drawdown</code></TableCell>
                        <TableCell>Đo lường tốc độ phục hồi tài khoản của chiến lược.</TableCell>
                      </TableRow>
                      <TableRow hover>
                        <TableCell><strong>12. LR Correlation</strong></TableCell>
                        <TableCell><code>Pearson Correlation (Equity, Order)</code></TableCell>
                        <TableCell>Độ tuyến tính (mượt) của đường cong tài sản (0.0 đến 1.0).</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
              </AccordionDetails>
            </Accordion>

            <Typography variant="body1" paragraph sx={{ pl: 2, color: 'text.secondary', fontStyle: 'italic' }}>
              * Tất cả 12 chỉ số đều được tính toán động dựa theo khoảng thời gian được chọn và đồng bộ hoá khi sao chép danh sách Bot IDs.
            </Typography>

            <Typography variant="h6" gutterBottom sx={{ color: 'success.main', fontWeight: 600, mt: 3 }}>
              💡 Tips
            </Typography>
            <Typography variant="body1" paragraph sx={{ pl: 2 }}>
              • Sử dụng <strong>More Options</strong> để chọn operator (≥, {'>'}, {'<'}, ≤) hoặc range cho mỗi filter
            </Typography>
            <Typography variant="body1" paragraph sx={{ pl: 2 }}>
              • Bấm <strong>Apply</strong> sau khi thay đổi filter để load dữ liệu mới
            </Typography>
            <Typography variant="body1" paragraph sx={{ pl: 2 }}>
              • Sử dụng <strong>Hỏi AI</strong> để phân tích và đánh giá chất lượng strategies đang hiển thị
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setInfoDialogOpen(false)} variant="contained">
              Đã hiểu
            </Button>
          </DialogActions>
        </Dialog>

        {/* Reusable Confirm Modal for deleting strategy */}
        <ConfirmModal
          open={deleteConfirm.open}
          onClose={() => setDeleteConfirm({ open: false, strategyId: '', backtestTable: '' })}
          onConfirm={handleConfirmDelete}
          title="Xác nhận xóa chiến thuật"
          content={`Bạn có chắc chắn muốn xóa chiến thuật ${deleteConfirm.strategyId} trong bảng ${deleteConfirm.backtestTable}? Hành động này sẽ xóa sạch cả cấu hình, kết quả và tất cả deal liên quan trong database.`}
          confirmText="Xóa chiến thuật"
          cancelText="Hủy"
          confirmColor="error"
        />
      </Grid>
    </LocalizationProvider>
  );
}
