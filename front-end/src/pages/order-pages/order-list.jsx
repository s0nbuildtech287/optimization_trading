import { useState, useEffect } from 'react';
import { useTheme } from '@mui/material/styles';
import { useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
// Sync-sheet
import useOrderList from 'hooks/useOrderList';
import { getFilterOptions, getBacktestTables, getOrderTotals, getStrategyFileCheck } from 'api/order';
// format order
import { formatDate, formatCurrency, formatNumber, getTypeColor, getDirectionColor } from 'utils/order-format';

// material-ui
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
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
import PaginationItem from '@mui/material/PaginationItem';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import Checkbox from '@mui/material/Checkbox';
import ListItemText from '@mui/material/ListItemText';
import OutlinedInput from '@mui/material/OutlinedInput';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
// project imports
import MainCard from 'components/MainCard';
import Loader from 'components/Loader';
import LinearProgress from '@mui/material/LinearProgress';
import CircularProgress from '@mui/material/CircularProgress';

// IMPORT DATE PICKER
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';

// config
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, API_BASE_URL, API_ENDPOINTS } from 'config';

// assets
import SearchOutlined from '@ant-design/icons/SearchOutlined';
import FilterOutlined from '@ant-design/icons/FilterOutlined';
import ReloadOutlined from '@ant-design/icons/ReloadOutlined';
import EyeOutlined from '@ant-design/icons/EyeOutlined';
import CloseOutlined from '@ant-design/icons/CloseOutlined';
import CheckCircleOutlined from '@ant-design/icons/CheckCircleOutlined';
import WarningOutlined from '@ant-design/icons/WarningOutlined';
import CloseCircleOutlined from '@ant-design/icons/CloseCircleOutlined';
import CalendarOutlined from '@ant-design/icons/CalendarOutlined';
import DownloadOutlined from '@ant-design/icons/DownloadOutlined';
import CaretUpOutlined from '@ant-design/icons/CaretUpOutlined';
import CaretDownOutlined from '@ant-design/icons/CaretDownOutlined';
import AuditOutlined from '@ant-design/icons/AuditOutlined';

const ORDER_LIST_SOURCES_KEY = 'lotusquant.orderlist.selectedSources';

export const getStoredOrderListSources = () => {
  if (typeof window === 'undefined') return [];
  try {
    const stored = window.localStorage.getItem(ORDER_LIST_SOURCES_KEY);
    if (stored !== null) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return [];
};

// ✅ HELPER: Convert backtest1 → "Backtest 1" or format title
const getBacktestDisplayName = (value, totalCount = 0) => {
  if (!value || value === 'all_backtests') return 'All Backtest';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'No table selected';
    if (totalCount > 0 && value.length === totalCount) return `All backtests - ${value.length} tables`;
    if (totalCount > 0) return `${value.length}/${totalCount} tables selected`;
    return value.map((v) => v.charAt(0).toUpperCase() + v.slice(1)).join(' + ');
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
};

// ✅ Convert targetTable → API param
const resolveBacktestParam = (value) => {
  if (!value || value === 'all_backtests') return 'all_backtests';
  if (Array.isArray(value)) {
    if (value.length === 0) return '';
    return value.join(',');
  }
  return value;
};

// ─── StatBadge helper for header metrics ───────────────────────────────────────
const StatBadge = ({ label, value, loading, valueColor, action }) => {
  return (
    <Box sx={{
      display: 'inline-flex',
      alignItems: 'center',
      bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'grey.50',
      border: '1px solid',
      borderColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'grey.200',
      borderRadius: 1.5,
      px: 1.5,
      py: 0.75,
      gap: 0.75,
      boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
      flexGrow: { xs: 1, sm: 0 },
      justifyContent: 'flex-start',
      minWidth: { xs: 'calc(50% - 6px)', sm: 'auto' }
    }}>
      <Stack direction="column" spacing={0.25} sx={{ width: '100%' }}>
        <Typography variant="caption" color="text.secondary" fontWeight="600" sx={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
          {label}
        </Typography>
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minHeight: 20 }}>
          {loading ? (
            <CircularProgress size={12} thickness={5} sx={{ color: 'text.secondary' }} />
          ) : (
            <Typography variant="body2" fontWeight="700" color={valueColor || 'text.primary'} sx={{ fontSize: '0.875rem' }}>
              {value}
            </Typography>
          )}
          {action}
        </Stack>
      </Stack>
    </Box>
  );
};

export default function OrderList() {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const [searchParams] = useSearchParams();

  // ✅ Dynamic backtest tables
  const [backtestTables, setBacktestTables] = useState([]);
  const [loadingTables, setLoadingTables] = useState(true);

  const getInitialTargetTable = () => {
    const tableFromUrl = searchParams.get('table');
    if (tableFromUrl) {
      return tableFromUrl === 'all_backtests' ? [] : tableFromUrl.split(',').filter(Boolean);
    }
    const stored = getStoredOrderListSources();
    if (stored !== null) return stored;
    return [];
  };

  const [data, setData] = useState([]);
  const [sortTimeDir, setSortTimeDir] = useState('desc'); // null | 'asc' | 'desc'
  const [sortDealDir, setSortDealDir] = useState(null); // null | 'asc' | 'desc'
  const [sortSymbolDir, setSortSymbolDir] = useState(null); // null | 'asc' | 'desc'
  const [sortCommissionDir, setSortCommissionDir] = useState(null); // null | 'asc' | 'desc'
  const [sortSwapDir, setSortSwapDir] = useState(null); // null | 'asc' | 'desc'
  const [sortProfitDir, setSortProfitDir] = useState(null); // null | 'asc' | 'desc'
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(DEFAULT_PAGE_SIZE);
  const [pagination, setPagination] = useState({
    total: 0,
    totalPages: 0,
    currentPage: 1,
    pageSize: DEFAULT_PAGE_SIZE
  });
  const [goToPage, setGoToPage] = useState('');

  // ─────────────────────────────────────────────────────────────────────────────
  // REQUIRED STRATEGIES CONFIG (hardcoded)
  //
  // Công thức: bots × 4 files × 9 assets
  //   4 files  = H1OB, H1OS, H4OB, H4OS  (2 timeframes × 2 directions)
  //   9 assets = tập tài sản chuẩn của team
  //
  // Để thay đổi: cập nhật BACKTEST_BOT_CONFIG bên dưới.
  //   key  = tên table trong DB (phải khớp với backtestTables từ API)
  //   bots = số lượng bot của backtest đó
  //
  // Kiểm tra bots thực tế: node check_strategies.js (backend/)
  // Ví dụ thêm backtest mới: backtest_new: { bots: 120 }
  // ─────────────────────────────────────────────────────────────────────────────
  const BACKTEST_BOT_CONFIG = {
    backtest_qnhu: { bots: 108 }, // 108 bots × 36 = 3,888
    backtest_tu:   { bots: 101 }, // 101 bots × 36 = 3,636
    // Tổng: 209 bots × 36 = 7,524
  };
  const FILES_PER_BOT_SYMBOL = 4; // H1OB, H1OS, H4OB, H4OS
  const ASSETS_COUNT = 9;         // 9 tài sản chuẩn

  // Tính required strategies dựa theo targetTable đang chọn
  const computeRequiredStrategies = (table) => {
    if (Array.isArray(table) && table.length === 0) return 0;
    const allTables = Object.keys(BACKTEST_BOT_CONFIG);
    let tables = [];
    if (!table || table === 'all_backtests') {
      tables = allTables;
    } else if (Array.isArray(table)) {
      tables = table;
    } else {
      tables = [table];
    }
    return tables.reduce((sum, t) => {
      const cfg = BACKTEST_BOT_CONFIG[t];
      return sum + (cfg ? cfg.bots * FILES_PER_BOT_SYMBOL * ASSETS_COUNT : 0);
    }, 0);
  };

  // requiredStrategies được tính tự động từ targetTable qua computeRequiredStrategies()
  // Không cần state riêng — xem BACKTEST_BOT_CONFIG ở trên để chỉnh số bot

  // ─── Strategy File Check modal ───────────────────────────────────────────────
  const [fileCheckOpen, setFileCheckOpen] = useState(false);
  const [fileCheckData, setFileCheckData] = useState(null);
  const [fileCheckLoading, setFileCheckLoading] = useState(false);

  const handleOpenFileCheck = async () => {
    setFileCheckOpen(true);
    if (fileCheckData) return; // đã có data, dùng cache
    try {
      setFileCheckLoading(true);
      const res = await getStrategyFileCheck();
      if (res?.success) setFileCheckData(res.data);
    } catch (err) {
      console.error('Failed to load strategy file check:', err);
    } finally {
      setFileCheckLoading(false);
    }
  };

  // ✅ State cho totals từ API
  const [totals, setTotals] = useState({
    commission: 0,
    swap: 0,
    profit: 0,
    orders: 0,
    profitableOrders: 0,
    totalOutOrders: 0,
    winrate: 0,
    strategies: 0
  });
  const [totalsLoading, setTotalsLoading] = useState(false);

  // ✅ THÊM STATE CHO DATE RANGE
  const [dateRange, setDateRange] = useState({
    startDate: null,
    endDate: null
  });

  // Filter states
  const [filters, setFilters] = useState({
    search: '',
    symbols: [],
    years: [],
    strategy: 'all'
  });
  const { fetchOrderList, loading: listLoading, error: listError } = useOrderList();

  // Set page title
  useEffect(() => {
    document.title = 'Order List | Backtest';
  }, []);

  // ✅ Fetch dynamic backtest tables on mount
  useEffect(() => {
    const fetchTables = async () => {
      try {
        setLoadingTables(true);
        const response = await getBacktestTables();
        const tables = response.tables || [];
        setBacktestTables(tables);

        const tableFromUrl = searchParams.get('table');
        if (tableFromUrl) {
      const parsedUrl = tableFromUrl === 'all_backtests' ? tables : tableFromUrl.split(',').filter((t) => tables.includes(t));
          const toSet = parsedUrl.length > 0 ? parsedUrl : tables;
          setTargetTable(toSet);
          try {
            window.localStorage.setItem(ORDER_LIST_SOURCES_KEY, JSON.stringify(toSet));
          } catch {}
          return;
        }

        const stored = getStoredOrderListSources();
        const valid = (Array.isArray(stored) ? stored : []).filter((t) => tables.includes(t));
        if (valid.length > 0) {
          setTargetTable(valid);
        } else if (tables.length > 0) {
          setTargetTable(tables);
          try {
            window.localStorage.setItem(ORDER_LIST_SOURCES_KEY, JSON.stringify(tables));
          } catch {}
        }
      } catch (err) {
        console.error('❌ Failed to fetch backtest tables:', err);
        setBacktestTables([]);
      } finally {
        setLoadingTables(false);
      }
    };
    fetchTables();
  }, [searchParams]);

  const [targetTable, setTargetTable] = useState(getInitialTargetTable);

  const handleSourcesChange = (event) => {
    const {
      target: { value }
    } = event;

    let updated = [];
    const currentSelected = Array.isArray(targetTable)
      ? targetTable
      : (targetTable === 'all_backtests' ? backtestTables : [targetTable]);

    if (value.includes('all_select')) {
      if (currentSelected.length === backtestTables.length) {
        updated = [];
      } else {
        updated = [...backtestTables];
      }
    } else {
      updated = typeof value === 'string' ? value.split(',') : value;
    }

    setTargetTable(updated);
    try {
      window.localStorage.setItem(ORDER_LIST_SOURCES_KEY, JSON.stringify(updated));
    } catch {}
  };

  const [filterOptions, setFilterOptions] = useState({ year: [], symbol: [], strategyIds: [] });
  const [filterLoading, setFilterLoading] = useState(false);
  const [filterLoaded, setFilterLoaded] = useState(false);

  // ✅ LAZY LOAD FILTER OPTIONS - Chỉ gọi khi user click vào dropdown
  const loadFilterOptions = async () => {
    if (Array.isArray(targetTable) && targetTable.length === 0) {
      setFilterOptions({ year: [], symbol: [], strategyIds: [] });
      return;
    }
    // Nếu đã load rồi hoặc đang load thì skip
    if (filterLoaded || filterLoading) return;

    try {
      setFilterLoading(true);
      const tableName = resolveBacktestParam(targetTable);
      if (!tableName) {
        setFilterOptions({ year: [], symbol: [], strategyIds: [] });
        return;
      }

      const options = await getFilterOptions(tableName);

      setFilterOptions(options);
      setFilterLoaded(true);
    } catch (err) {
      console.error('❌ Failed to load filter options:', err);
    } finally {
      setFilterLoading(false);
    }
  };

  // ✅ Reset filter loaded khi đổi table
  useEffect(() => {
    setFilterLoaded(false);
    setFilterOptions({ year: [], symbol: [], strategyIds: [] });
  }, [targetTable]);

  const buildFilterParams = () => {
    let searchValue = undefined;
    if (filters.search && filters.search.trim()) {
      const searchTerms = filters.search
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0);
      searchValue = searchTerms.length > 0 ? searchTerms.join(',') : undefined;
    }

    let symbolValue = undefined;
    if (filters.symbols && filters.symbols.length > 0) {
      symbolValue = filters.symbols.join(',');
    }

    let yearValue = undefined;
    if (filters.years && filters.years.length > 0) {
      yearValue = filters.years.join(',');
    }

    let startDateValue = undefined;
    let endDateValue = undefined;
    if (dateRange.startDate) startDateValue = dayjs(dateRange.startDate).format('YYYY-MM-DD');
    if (dateRange.endDate) endDateValue = dayjs(dateRange.endDate).format('YYYY-MM-DD');

    return {
      tableName: resolveBacktestParam(targetTable),
      'filter[strategy_id]': filters.strategy !== 'all' ? filters.strategy : undefined,
      'filter[symbol]': symbolValue,
      'filter[year]': yearValue,
      'filter[search]': searchValue,
      'filter[start_date]': startDateValue,
      'filter[end_date]': endDateValue
    };
  };

  // ✅ fetchData: chỉ lấy data + pagination (đã bỏ totals => nhanh hơn)
  const fetchData = async () => {
    if (Array.isArray(targetTable) && targetTable.length === 0) {
      setData([]);
      setPagination({
        total: 0,
        totalPages: 0,
        currentPage: 1,
        pageSize: rowsPerPage
      });
      return;
    }

    try {
      const filterParams = buildFilterParams();
      const params = {
        page: page + 1,
        pageSize: rowsPerPage,
        ...filterParams,
        ...(sortTimeDir ? { sort_time_dir: sortTimeDir } : {}),
        ...(sortDealDir ? { sort_deal_dir: sortDealDir } : {}),
        ...(sortSymbolDir ? { sort_symbol_dir: sortSymbolDir } : {}),
        ...(sortCommissionDir ? { sort_commission_dir: sortCommissionDir } : {}),
        ...(sortSwapDir ? { sort_swap_dir: sortSwapDir } : {}),
        ...(sortProfitDir ? { sort_profit_dir: sortProfitDir } : {})
      };

      const result = await fetchOrderList(params);
      setData(result.data || []);
      setPagination(result.pagination);
    } catch (err) {
      console.error(' Fetch order list failed:', err);
      setData([]);
    }
  };

  // ✅ fetchTotals: lấy stats riêng (nặng hơn, chạy song song nhưng độc lập)
  const fetchTotals = async () => {
    if (Array.isArray(targetTable) && targetTable.length === 0) {
      setTotals({
        commission: 0,
        swap: 0,
        profit: 0,
        orders: 0,
        profitableOrders: 0,
        totalOutOrders: 0,
        winrate: 0,
        strategies: 0
      });
      setTotalsLoading(false);
      return;
    }

    try {
      setTotalsLoading(true);
      const filterParams = buildFilterParams();
      const result = await getOrderTotals(filterParams);
      if (result.totals) {
        setTotals({
          commission: result.totals.commission || 0,
          swap: result.totals.swap || 0,
          profit: result.totals.profit || 0,
          orders: result.totals.orders || 0,
          profitableOrders: result.totals.profitableOrders || 0,
          totalOutOrders: result.totals.totalOutOrders || 0,
          winrate: result.totals.winrate || 0,
          strategies: result.totals.strategies || 0
        });
      }
    } catch (err) {
      console.error(' Fetch order totals failed:', err);
    } finally {
      setTotalsLoading(false);
    }
  };

  // ✅ Khi page / sort / filter thay đổi: fetchData
  useEffect(() => {
    fetchData();
  }, [page, rowsPerPage, targetTable, sortTimeDir, sortDealDir, sortSymbolDir, sortCommissionDir, sortSwapDir, sortProfitDir, filters, dateRange]);

  // ✅ Fetch totals khi targetTable hoặc filters thay đổi
  useEffect(() => {
    fetchTotals();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetTable, filters, dateRange]);

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handlePaginationChange = (event, value) => {
    setPage(value - 1);
  };

  const handleGoToPage = () => {
    const pageNumber = parseInt(goToPage, 10);
    if (pageNumber >= 1 && pageNumber <= pagination.totalPages) {
      setPage(pageNumber - 1);
      setGoToPage('');
    }
  };

  const handleChangeRowsPerPage = (event) => {
    const newPageSize = parseInt(event.target.value, 10);
    setRowsPerPage(newPageSize);
    setPage(0);
  };

  const EmptyActions = () => null;

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSearch = () => {
    setPage(0);
    // Fetch data + totals song song
    fetchData();
    fetchTotals();
  };

  const handleReset = () => {
    setFilters({
      search: '',
      symbols: [],
      years: [],
      strategy: 'all'
    });
    setDateRange({
      startDate: null,
      endDate: null
    });
    setSortTimeDir('desc');
    setSortDealDir(null);
    setSortSymbolDir(null);
    setSortCommissionDir(null);
    setSortSwapDir(null);
    setSortProfitDir(null);
    setPage(0);
    // Không cần gọi fetchData/fetchTotals thủ công
    // useEffect [targetTable] và [page, ...] sẽ tự trigger
  };

  const inputOverridesSx = {
    '& .MuiInputLabel-root': {
      color: isDarkMode ? '#f8fafc' : 'text.secondary'
    },
    '& .MuiInputLabel-root.Mui-focused': {
      color: 'primary.main'
    },
    '& .MuiInputLabel-outlined.MuiInputLabel-shrink': {
      background: isDarkMode ? 'background.paper' : '#fafafb',
      color: isDarkMode ? '#f8fafc' : 'text.secondary'
    },
    '& .MuiInputBase-input': {
      color: isDarkMode ? '#f8fafc' : 'text.primary'
    },
    '& .MuiInputBase-input::placeholder': {
      color: isDarkMode ? 'rgba(255, 255, 255, 0.55)' : 'text.disabled',
      opacity: 1
    },
    '& .MuiSelect-icon': {
      color: isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'text.secondary'
    },
    '& .MuiOutlinedInput-notchedOutline': {
      borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)'
    },
    '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': {
      borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.4)' : 'primary.main'
    },
    '& .MuiFormHelperText-root': {
      color: isDarkMode ? 'rgba(255, 255, 255, 0.65)' : 'text.secondary'
    }
  };

  return (
    <>
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Grid container rowSpacing={4.5} columnSpacing={2.75}>
        {/* Header */}
        <Grid sx={{ mb: -2.25 }} size={12}>
          <Typography variant="h5">Order List</Typography>
        </Grid>

        {/*Filters với tên backtest động */}
        <Grid size={12}>
          <MainCard title={`Filters - ${getBacktestDisplayName(targetTable, backtestTables.length)}`} sx={inputOverridesSx}>
            <Grid container spacing={3}>
              {/* TARGET DATABASE TABLE */}
              <Grid size={{ xs: 12, sm: 6, md: 2 }}>
                <FormControl fullWidth variant="outlined">
                  <InputLabel
                    shrink
                    id="target-table-select-label"
                    sx={{
                      fontSize: '13px',
                      '&.MuiInputLabel-root': {
                        color: isDarkMode ? '#f8fafc' : 'text.secondary'
                      },
                      '&.MuiInputLabel-outlined.MuiInputLabel-shrink': {
                        background: isDarkMode ? 'background.paper' : '#fafafb',
                        color: isDarkMode ? '#f8fafc' : 'text.secondary'
                      },
                      '&.MuiFormLabel-root': {
                        color: isDarkMode ? '#f8fafc' : 'text.secondary'
                      },
                      '&.Mui-focused': { color: 'primary.main' }
                    }}
                  >
                    Target Database Table
                  </InputLabel>
                  <Select
                    labelId="target-table-select-label"
                    multiple
                    value={Array.isArray(targetTable) ? targetTable : (targetTable === 'all_backtests' ? backtestTables : [targetTable])}
                    onChange={handleSourcesChange}
                    notched
                    disabled={loadingTables}
                    input={<OutlinedInput notched label="Target Database Table" />}
                    renderValue={(selected) => {
                      if (!selected || selected.length === 0) return <em>No source selected</em>;
                      if (backtestTables.length > 0 && selected.length === backtestTables.length) {
                        return `All backtests - ${selected.length} tables`;
                      }
                      return `${selected.length}/${backtestTables.length} tables selected`;
                    }}
                    sx={{
                      height: 40,
                      fontSize: '13px',
                      fontWeight: 600,
                      bgcolor: isDarkMode ? 'rgba(255,255,255,0.02)' : '#ffffff',
                      color: isDarkMode ? '#f1f5f9' : 'text.primary',
                      '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'
                      }
                    }}
                  >
                    <MenuItem value="all_select" sx={{ fontSize: '13px', fontWeight: 600 }}>
                      <Checkbox
                        checked={
                          (Array.isArray(targetTable) ? targetTable.length : (targetTable === 'all_backtests' ? backtestTables.length : 1)) === backtestTables.length &&
                          backtestTables.length > 0
                        }
                        indeterminate={
                          (Array.isArray(targetTable) ? targetTable.length : (targetTable === 'all_backtests' ? backtestTables.length : 1)) > 0 &&
                          (Array.isArray(targetTable) ? targetTable.length : (targetTable === 'all_backtests' ? backtestTables.length : 1)) < backtestTables.length
                        }
                        size="small"
                      />
                      <ListItemText primary="Select All" primaryTypographyProps={{ fontSize: '13px', fontWeight: 600 }} />
                    </MenuItem>
                    {backtestTables.map((table) => {
                      const isChecked = (Array.isArray(targetTable) ? targetTable : [targetTable]).includes(table);
                      return (
                        <MenuItem key={table} value={table} sx={{ fontSize: '13px', fontWeight: 500 }}>
                          <Checkbox checked={isChecked} size="small" />
                          <ListItemText primary={table} primaryTypographyProps={{ fontSize: '13px' }} />
                        </MenuItem>
                      );
                    })}
                  </Select>
                </FormControl>
              </Grid>
              {/* SYMBOL */}
              <Grid size={{ xs: 12, sm: 6, md: 2 }}>
                <FormControl fullWidth>
                  <InputLabel
                    sx={{
                      '&.MuiInputLabel-root': {
                        color: isDarkMode ? '#f8fafc' : 'text.secondary'
                      },
                      '&.MuiInputLabel-outlined.MuiInputLabel-shrink': {
                        background: isDarkMode ? 'background.paper' : '#fafafb',
                        color: isDarkMode ? '#f8fafc' : 'text.secondary'
                      },
                      '&.MuiFormLabel-root': {
                        color: isDarkMode ? '#f8fafc' : 'text.secondary'
                      },
                      '&.Mui-focused': { color: 'primary.main' }
                    }}
                  >
                    Symbol
                  </InputLabel>
                  <Select
                    multiple
                    value={filters.symbols}
                    onChange={(e) => handleFilterChange('symbols', e.target.value)}
                    onOpen={loadFilterOptions}
                    input={<OutlinedInput label="Symbol" />}
                    renderValue={(selected) => {
                      if (selected.length === 0) return 'All Symbols';
                      if (filterOptions?.symbol && selected.length === filterOptions.symbol.filter((s) => s !== null).length)
                        return 'All Symbols';
                      return selected.join(', ');
                    }}
                    MenuProps={{
                      PaperProps: {
                        style: {
                          maxHeight: 300
                        }
                      }
                    }}
                  >
                    {filterLoading ? (
                      <MenuItem disabled>
                        <Typography variant="body2" color="text.secondary">
                          Loading symbols...
                        </Typography>
                      </MenuItem>
                    ) : (
                      (filterOptions?.symbol || [])
                        .filter((s) => s !== null)
                        .map((s) => (
                          <MenuItem key={s} value={s}>
                            <Checkbox checked={filters.symbols.indexOf(s) > -1} />
                            <ListItemText primary={s} />
                          </MenuItem>
                        ))
                    )}
                  </Select>
                </FormControl>
              </Grid>
              {/* YEAR */}
              {/* DATE RANGE với border trên container - 2 date cùng dòng */}
              <Grid size={{ xs: 12, sm: 6, md: 4 }} sx={{ display: 'flex', alignItems: 'flex-start' }}>
                <Box
                  sx={{
                    border: '1px solid',
                    borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
                    borderRadius: 1,
                    p: 0.5,
                    width: '100%',
                    height: { xs: 'auto', sm: 40 },
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    alignItems: { xs: 'stretch', sm: 'center' },
                    gap: 0.5,
                    bgcolor: isDarkMode ? 'rgba(255,255,255,0.02)' : '#ffffff',
                    transition: 'border-color 0.2s',
                    '&:hover': {
                      borderColor: 'primary.main'
                    }
                  }}
                >
                  <DatePicker
                    label="From"
                    value={dateRange.startDate}
                    onChange={(newValue) => setDateRange((prev) => ({ ...prev, startDate: newValue }))}
                    minDate={dayjs('2016-01-01')}
                    maxDate={dayjs()}
                    format="DD/MM/YYYY"
                    localeText={{
                      fieldDayPlaceholder: () => 'dd',
                      fieldMonthPlaceholder: () => 'MM',
                      fieldYearPlaceholder: () => 'yyyy'
                    }}
                    slotProps={{
                      textField: {
                        size: 'small',
                        fullWidth: true,
                        InputLabelProps: {
                          shrink: true,
                          sx: { 
                            fontSize: '11px',
                            '&.MuiInputLabel-root': {
                              color: isDarkMode ? '#f8fafc' : 'text.secondary'
                            },
                            '&.MuiInputLabel-outlined.MuiInputLabel-shrink': {
                              background: isDarkMode ? 'background.paper' : '#fafafb',
                              color: isDarkMode ? '#f8fafc' : 'text.secondary'
                            },
                            '&.MuiFormLabel-root': {
                              color: isDarkMode ? '#f8fafc' : 'text.secondary'
                            },
                            '&.Mui-focused': { color: 'primary.main' }
                          }
                        },
                        sx: {
                          '& .MuiOutlinedInput-root': {
                            '& fieldset': {
                              border: 'none'
                            },
                            '&:hover fieldset': {
                              border: 'none'
                            },
                            '&.Mui-focused fieldset': {
                              border: 'none'
                            }
                          },
                          '& .MuiInputBase-input': {
                            fontSize: '13px',
                            padding: '4px 8px',
                            cursor: 'pointer',
                            color: isDarkMode ? '#f1f5f9' : 'text.primary'
                          }
                        }
                      },
                      openPickerButton: {
                        size: 'small',
                        sx: { p: 0.5 }
                      }
                    }}
                  />

                  {/* Divider dọc giữa 2 date picker */}
                  <Box
                    sx={{
                      width: { xs: '100%', sm: '1px' },
                      height: { xs: '1px', sm: '24px' },
                      my: { xs: 0.5, sm: 0 },
                      bgcolor: 'divider'
                    }}
                  />

                  <DatePicker
                    label="To"
                    value={dateRange.endDate}
                    onChange={(newValue) => setDateRange((prev) => ({ ...prev, endDate: newValue }))}
                    minDate={dateRange.startDate || dayjs('2016-01-01')}
                    maxDate={dayjs()}
                    format="DD/MM/YYYY"
                    localeText={{
                      fieldDayPlaceholder: () => 'dd',
                      fieldMonthPlaceholder: () => 'MM',
                      fieldYearPlaceholder: () => 'yyyy'
                    }}
                    slotProps={{
                      textField: {
                        size: 'small',
                        fullWidth: true,
                        InputLabelProps: {
                          shrink: true,
                          sx: { 
                            fontSize: '11px',
                            '&.MuiInputLabel-root': {
                              color: isDarkMode ? '#f8fafc' : 'text.secondary'
                            },
                            '&.MuiInputLabel-outlined.MuiInputLabel-shrink': {
                              background: isDarkMode ? 'background.paper' : '#fafafb',
                              color: isDarkMode ? '#f8fafc' : 'text.secondary'
                            },
                            '&.MuiFormLabel-root': {
                              color: isDarkMode ? '#f8fafc' : 'text.secondary'
                            },
                            '&.Mui-focused': { color: 'primary.main' }
                          }
                        },
                        sx: {
                          '& .MuiOutlinedInput-root': {
                            '& fieldset': {
                              border: 'none'
                            },
                            '&:hover fieldset': {
                              border: 'none'
                            },
                            '&.Mui-focused fieldset': {
                              border: 'none'
                            }
                          },
                          '& .MuiInputBase-input': {
                            fontSize: '13px',
                            padding: '4px 8px',
                            cursor: 'pointer',
                            color: isDarkMode ? '#f1f5f9' : 'text.primary'
                          }
                        }
                      },
                      openPickerButton: {
                        size: 'small',
                        sx: { p: 0.5 }
                      }
                    }}
                  />
                </Box>
              </Grid>

              {/* SEARCH */}
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <TextField
                  fullWidth
                  label="Search"
                  value={filters.search}
                  onChange={(e) => handleFilterChange('search', e.target.value)}
                  placeholder="btcusd, de30, xauusd..."
                  helperText="Phân tách nhiều ký hiệu bằng dấu phẩy."
                  InputLabelProps={{
                    sx: {
                      '&.MuiInputLabel-root': {
                        color: isDarkMode ? '#f8fafc' : 'text.secondary'
                      },
                      '&.MuiInputLabel-outlined.MuiInputLabel-shrink': {
                        background: isDarkMode ? 'background.paper' : '#fafafb',
                        color: isDarkMode ? '#f8fafc' : 'text.secondary'
                      },
                      '&.MuiFormLabel-root': {
                        color: isDarkMode ? '#f8fafc' : 'text.secondary'
                      },
                      '&.Mui-focused': { color: 'primary.main' }
                    }
                  }}
                  InputProps={{
                    endAdornment: <SearchOutlined style={{ color: isDarkMode ? 'rgba(255, 255, 255, 0.7)' : undefined }} />
                  }}
                />
              </Grid>
              {/* BUTTONS */}
              <Grid size={12}>
                <Stack direction="row" spacing={2} justifyContent="flex-end" useFlexGap flexWrap="wrap">
                  <Button
                    variant="outlined"
                    startIcon={<ReloadOutlined />}
                    onClick={handleReset}
                    sx={{
                      minWidth: { xs: 0, sm: 120 },
                      flex: { xs: '1 1 calc(50% - 8px)', sm: '0 0 auto' },
                      px: { xs: 1.5, sm: 3 }
                    }}
                  >
                    Reset
                  </Button>
                  <Button
                    variant="contained"
                    startIcon={<FilterOutlined />}
                    onClick={handleSearch}
                    sx={{
                      minWidth: { xs: 0, sm: 140 },
                      flex: { xs: '1 1 calc(50% - 8px)', sm: '0 0 auto' },
                      px: { xs: 1.5, sm: 3 },
                      backgroundColor: 'primary.main',
                      '&:hover': {
                        backgroundColor: 'primary.dark'
                      },
                      '&:active': {
                        backgroundColor: 'primary.dark'
                      }
                    }}
                  >
                    Apply Filters
                  </Button>
                </Stack>
              </Grid>
            </Grid>
          </MainCard>
        </Grid>

        {/* Data Table */}
        <Grid size={12}>
          <MainCard
            title={
              <Box>
                <Typography variant="h5" sx={{ mb: 1 }}>
                  Order Results ({pagination.total.toLocaleString()} total records)
                </Typography>
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mt: 1.5 }}>
                  <StatBadge
                    label="Existing Strategies"
                    loading={totalsLoading}
                    value={totals.strategies.toLocaleString()}
                  />
                  <StatBadge
                    label="Total Orders"
                    loading={totalsLoading}
                    value={totals.orders.toLocaleString()}
                  />
                  <StatBadge
                    label="Total Net Profit"
                    loading={totalsLoading}
                    valueColor={totals.profit > 0 ? 'success.main' : totals.profit < 0 ? 'error.main' : 'text.secondary'}
                    value={formatCurrency(totals.profit)}
                  />
                  <StatBadge
                    label="Total Commission"
                    loading={totalsLoading}
                    valueColor={totals.commission < 0 ? 'error.main' : totals.commission > 0 ? 'success.main' : 'text.secondary'}
                    value={formatCurrency(totals.commission)}
                  />
                  <StatBadge
                    label="Total Swap"
                    loading={totalsLoading}
                    valueColor={totals.swap < 0 ? 'error.main' : 'success.main'}
                    value={formatCurrency(totals.swap)}
                  />
                  <StatBadge
                    label="Winrate"
                    loading={totalsLoading}
                    value={totals.winrate + '%'}
                  />
                </Box>
              </Box>
            }
          >
            {listLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                <Loader />
              </Box>
            ) : (
              <>
                <TableContainer component={Paper} sx={{ boxShadow: 'none' }}>
                  <Table sx={{ minWidth: 650 }} aria-label="order table">
                    <TableHead>
                      <TableRow sx={{ backgroundColor: isDarkMode ? '#1f1f1f' : '#fafafa' }}>
                        {/* các tên cột */}
                        <TableCell>
                          <Box
                            component="span"
                            onClick={() => {
                              setSortTimeDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
                              setSortDealDir(null);
                            }}
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              cursor: 'pointer',
                              userSelect: 'none',
                              fontWeight: 'inherit',
                              '&:hover': { color: 'primary.main' }
                            }}
                          >
                            Time
                            {sortTimeDir === 'asc' ? (
                              <CaretUpOutlined style={{ fontSize: 11 }} />
                            ) : (
                              <CaretDownOutlined style={{ fontSize: 11, opacity: sortTimeDir === 'desc' ? 1 : 0.3 }} />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box
                            component="span"
                            onClick={() => {
                              setSortDealDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
                              setSortTimeDir(null);
                            }}
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              cursor: 'pointer',
                              userSelect: 'none',
                              fontWeight: 'inherit',
                              '&:hover': { color: 'primary.main' }
                            }}
                          >
                            Deal
                            {sortDealDir === 'asc' ? (
                              <CaretUpOutlined style={{ fontSize: 11 }} />
                            ) : (
                              <CaretDownOutlined style={{ fontSize: 11, opacity: sortDealDir === 'desc' ? 1 : 0.3 }} />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box
                            component="span"
                            onClick={() => {
                              setSortSymbolDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                              setSortTimeDir(null);
                              setSortDealDir(null);
                            }}
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              cursor: 'pointer',
                              userSelect: 'none',
                              fontWeight: 'inherit',
                              '&:hover': { color: 'primary.main' }
                            }}
                          >
                            Symbol
                            {sortSymbolDir === 'desc' ? (
                              <CaretDownOutlined style={{ fontSize: 11 }} />
                            ) : (
                              <CaretUpOutlined style={{ fontSize: 11, opacity: sortSymbolDir === 'asc' ? 1 : 0.3 }} />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell>Direction</TableCell>
                        <TableCell align="right">Volume</TableCell>
                        <TableCell align="right">Price</TableCell>
                        <TableCell align="right">
                          <Box
                            component="span"
                            onClick={() => {
                              setSortCommissionDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
                              setSortTimeDir(null);
                              setSortDealDir(null);
                              setSortSymbolDir(null);
                              setSortSwapDir(null);
                              setSortProfitDir(null);
                            }}
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              cursor: 'pointer',
                              userSelect: 'none',
                              fontWeight: 'inherit',
                              '&:hover': { color: 'primary.main' }
                            }}
                          >
                            Commission
                            {sortCommissionDir === 'asc' ? (
                              <CaretUpOutlined style={{ fontSize: 11 }} />
                            ) : (
                              <CaretDownOutlined style={{ fontSize: 11, opacity: sortCommissionDir === 'desc' ? 1 : 0.3 }} />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Box
                            component="span"
                            onClick={() => {
                              setSortSwapDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
                              setSortTimeDir(null);
                              setSortDealDir(null);
                              setSortSymbolDir(null);
                              setSortCommissionDir(null);
                              setSortProfitDir(null);
                            }}
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              cursor: 'pointer',
                              userSelect: 'none',
                              fontWeight: 'inherit',
                              '&:hover': { color: 'primary.main' }
                            }}
                          >
                            Swap
                            {sortSwapDir === 'asc' ? (
                              <CaretUpOutlined style={{ fontSize: 11 }} />
                            ) : (
                              <CaretDownOutlined style={{ fontSize: 11, opacity: sortSwapDir === 'desc' ? 1 : 0.3 }} />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Box
                            component="span"
                            onClick={() => {
                              setSortProfitDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
                              setSortTimeDir(null);
                              setSortDealDir(null);
                              setSortSymbolDir(null);
                              setSortCommissionDir(null);
                              setSortSwapDir(null);
                            }}
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              cursor: 'pointer',
                              userSelect: 'none',
                              fontWeight: 'inherit',
                              '&:hover': { color: 'primary.main' }
                            }}
                          >
                            Profit
                            {sortProfitDir === 'asc' ? (
                              <CaretUpOutlined style={{ fontSize: 11 }} />
                            ) : (
                              <CaretDownOutlined style={{ fontSize: 11, opacity: sortProfitDir === 'desc' ? 1 : 0.3 }} />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>Comment</TableCell>
                        <TableCell>Strategy ID</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data && data.length > 0 ? (
                        data.map((row, index) => (
                          <TableRow key={`${row.deal}-${index}`} hover>
                            <TableCell>
                              <Typography variant="body2">{formatDate(row.time)}</Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" fontWeight="medium">
                                {row.deal}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" fontWeight="medium">
                                {row.symbol || '-'}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Chip label={row.type || '-'} color={getTypeColor(row.type)} size="small" variant="outlined" />
                            </TableCell>
                            <TableCell>
                              <Chip label={row.direction || '-'} color={getDirectionColor(row.direction)} size="small" variant="outlined" />
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="body2">{row.volume ? formatNumber(row.volume) : '-'}</Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="body2" fontWeight="medium">
                                {row.price ? formatCurrency(row.price) : '-'}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="body2" color={parseFloat(row.commission) < 0 ? 'error.main' : 'success.main'}>
                                {formatCurrency(row.commission)}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="body2" color={parseFloat(row.swap) < 0 ? 'error.main' : 'success.main'}>
                                {formatCurrency(row.swap)}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Typography
                                variant="body2"
                                fontWeight="medium"
                                color={
                                  parseFloat(row.profit) > 0 ? 'success.main' : parseFloat(row.profit) < 0 ? 'error.main' : 'text.secondary'
                                }
                              >
                                {formatCurrency(row.profit)}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {row.comment || '-'}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                                {row.strategy_id || '-'}
                              </Typography>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={11} align="center">
                            <Typography variant="body1" color="text.secondary">
                              No data available
                            </Typography>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>

                
                <Box sx={{
                  display: 'flex',
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'nowrap',
                  gap: 1,
                  p: 1.5,
                  mt: 0.5
                }}>
                  <Box sx={{ display: 'flex', justifyContent: 'flex-start', width: 'auto' }}>
                    <TablePagination
                      rowsPerPageOptions={PAGE_SIZE_OPTIONS}
                      component="div"
                      count={pagination.total}
                      rowsPerPage={pagination.pageSize}
                      page={page}
                      onPageChange={handleChangePage}
                      onRowsPerPageChange={handleChangeRowsPerPage}
                      labelDisplayedRows={() => ''}
                      ActionsComponent={EmptyActions}
                      labelRowsPerPage="Page"
                      sx={{
                        '& .MuiToolbar-root': {
                          minHeight: 32,
                          p: 0
                        },
                        '& .MuiTablePagination-selectLabel': {
                          m: 0,
                          fontSize: '0.75rem'
                        },
                        '& .MuiTablePagination-select': {
                          py: 0.5,
                          fontSize: '0.75rem'
                        },
                        '& .MuiTablePagination-spacer': {
                          display: 'none'
                        }
                      }}
                    />
                  </Box>

                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', width: 'auto' }}>
                    <Pagination
                      count={Math.min(pagination.totalPages)}
                      page={pagination.currentPage}
                      onChange={handlePaginationChange}
                      size="small"
                      showFirstButton
                      showLastButton
                      siblingCount={0}
                      boundaryCount={1}
                      renderItem={(item) => {
                        const isPage = item.type === 'page';
                        const isSelected = item.selected;
                        
                        let displayStyle = {};
                        if (isPage && !isSelected) {
                          displayStyle = { display: { xs: 'none', sm: 'inline-flex' } };
                        } else if (item.type === 'start-ellipsis' || item.type === 'end-ellipsis') {
                          displayStyle = { display: { xs: 'none', sm: 'inline-flex' } };
                        }

                        if (isPage) {
                          return (
                            <PaginationItem
                              {...item}
                              sx={{
                                mx: 0.5,
                                minWidth: { xs: 32, sm: 40 },
                                height: { xs: 32, sm: 40 },
                                borderRadius: 2,
                                '&.Mui-selected': {
                                  backgroundColor: 'primary.main',
                                  color: 'white',
                                  '&:hover': { backgroundColor: 'primary.dark' }
                                },
                                '&:hover': { backgroundColor: 'action.hover' },
                                ...displayStyle
                              }}
                            />
                          );
                        }
                        return (
                          <PaginationItem
                            {...item}
                            sx={{
                              minWidth: { xs: 32, sm: 40 },
                              height: { xs: 32, sm: 40 },
                              ...displayStyle
                            }}
                          />
                        );
                      }}
                    />
                  </Box>
                </Box>
	              </>
	            )}
	          </MainCard>
	        </Grid>
	      </Grid>
	    </LocalizationProvider>

      {/* ─── Strategy File Check Modal ─────────────────────────────────── */}      <Dialog
        open={fileCheckOpen}
        onClose={() => setFileCheckOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ pb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AuditOutlined style={{ fontSize: 18, color: '#1890ff' }} />
            <Typography variant="h6" fontWeight={700}>Strategy File Check</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
              Formula: bots × 36 (= 4 files × 9 assets)
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => setFileCheckOpen(false)} sx={{ color: 'text.secondary' }}>
            <CloseOutlined style={{ fontSize: 16 }} />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers sx={{ p: 0 }}>
          {fileCheckLoading ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <CircularProgress size={36} />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>Đang tải dữ liệu...</Typography>
            </Box>
          ) : !fileCheckData ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">Không có dữ liệu</Typography>
            </Box>
          ) : (
            <Box>
              {/* Grand Total Summary */}
              <Box sx={{ px: 3, py: 2, bgcolor: 'action.hover', borderBottom: '1px solid', borderColor: 'divider', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>GRAND TOTAL THỰC TẾ</Typography>
                  <Typography variant="h5" fontWeight={700} color="primary.main">{fileCheckData.grandTotal.toLocaleString()}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>EXPECTED (ĐỦ FILE)</Typography>
                  <Typography variant="h5" fontWeight={700} color="text.primary">{fileCheckData.grandExpected.toLocaleString()}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>THIẾU</Typography>
                  <Typography variant="h5" fontWeight={700} color={fileCheckData.grandMissing > 0 ? 'error.main' : 'success.main'}>
                    {fileCheckData.grandMissing > 0 ? `-${fileCheckData.grandMissing.toLocaleString()}` : '0'}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>TỔNG BOTS</Typography>
                  <Typography variant="h5" fontWeight={700} color="text.primary">{fileCheckData.grandBots.toLocaleString()}</Typography>
                </Box>
              </Box>

              {/* Per-table breakdown */}
              {fileCheckData.tables.map((t) => (
                <Box key={t.tableName} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
                  {/* Table header */}
                  <Box sx={{ px: 3, py: 1.5, bgcolor: t.missingBotsCount > 0 ? 'rgba(255,77,79,0.04)' : 'rgba(82,196,26,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {t.missingBotsCount > 0
                        ? <WarningOutlined style={{ fontSize: 15, color: '#ff4d4f' }} />
                        : <CheckCircleOutlined style={{ fontSize: 15, color: '#52c41a' }} />
                      }
                      <Typography variant="subtitle2" fontWeight={700}>{t.tableName}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                      {[
                        { label: 'Thực tế', value: t.actualTotal.toLocaleString(), color: 'primary.main' },
                        { label: 'Expected', value: t.expectedTotal.toLocaleString(), color: 'text.primary' },
                        { label: 'Bots', value: `${t.fullBots}/${t.totalBots} đủ file`, color: 'text.secondary' },
                        { label: 'Chênh', value: t.diff >= 0 ? `+${t.diff}` : String(t.diff), color: t.diff < 0 ? 'error.main' : 'success.main' },
                      ].map(({ label, value, color }) => (
                        <Box key={label} sx={{ textAlign: 'center' }}>
                          <Typography variant="caption" color="text.disabled" display="block">{label}</Typography>
                          <Typography variant="body2" fontWeight={600} color={color}>{value}</Typography>
                        </Box>
                      ))}
                    </Box>
                  </Box>

                  {/* Missing bots list */}
                  {t.missingBots.length > 0 && (
                    <Box sx={{ px: 3, py: 1.5 }}>
                      <Typography variant="caption" color="error.main" fontWeight={600} sx={{ display: 'block', mb: 1 }}>
                        ⚠️ Tổng files thiếu: {t.totalMissingFiles} ({t.missingBotsCount} bots)
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                        {t.missingBots.map((bot) => (
                          <Tooltip
                            key={bot.botId}
                            title={`${bot.fileCount}/36 files — thiếu ${bot.missing}`}
                            arrow
                            placement="top"
                          >
                            <Chip
                              label={`bot ${bot.botId}  ${bot.fileCount}/36`}
                              size="small"
                              variant="outlined"
                              color={bot.missing >= 5 ? 'error' : 'warning'}
                              sx={{ fontSize: '0.7rem', height: 22, cursor: 'default' }}
                            />
                          </Tooltip>
                        ))}
                      </Box>
                    </Box>
                  )}
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
	      </Dialog>
	    </>
	  );
	}
