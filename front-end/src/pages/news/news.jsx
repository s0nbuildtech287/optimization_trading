// src/pages/news/news.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { useTheme } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Skeleton from '@mui/material/Skeleton';
import Divider from '@mui/material/Divider';
import Collapse from '@mui/material/Collapse';
import Button from '@mui/material/Button';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Link from '@mui/material/Link';
import Pagination from '@mui/material/Pagination';
import ReloadOutlined from '@ant-design/icons/ReloadOutlined';
import DownOutlined from '@ant-design/icons/DownOutlined';
import UpOutlined from '@ant-design/icons/UpOutlined';
import RightOutlined from '@ant-design/icons/RightOutlined';
import RobotOutlined from '@ant-design/icons/RobotOutlined';
import CloseOutlined from '@ant-design/icons/CloseOutlined';
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import CheckOutlined from '@ant-design/icons/CheckOutlined';
import SearchOutlined from '@ant-design/icons/SearchOutlined';
import StarFilled from '@ant-design/icons/StarFilled';
import StarOutlined from '@ant-design/icons/StarOutlined';
import FileTextOutlined from '@ant-design/icons/FileTextOutlined';
import BarChartOutlined from '@ant-design/icons/BarChartOutlined';
import FundOutlined from '@ant-design/icons/FundOutlined';
import LinearProgress from '@mui/material/LinearProgress';
import OutlinedInput from '@mui/material/OutlinedInput';
import InputAdornment from '@mui/material/InputAdornment';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import MainCard from 'components/MainCard';
import { getMarketPrices, getSymbolStats, getSymbolNews, getMarketCandles } from 'api/market';
import { getBacktestTables } from 'api/order';
import { AreaChart, Area, ResponsiveContainer, Tooltip as ReTooltip, YAxis, BarChart, Bar, Cell, XAxis } from 'recharts';
import { createChart, CandlestickSeries, LineSeries, CrosshairMode } from 'lightweight-charts';


const INITIAL_SYMBOLS = ['BTCUSD','ETHUSD','XAUUSD','XAGUSD','US500','DE30','JP225','HK50','USOIL'];

const MARKET_CATEGORIES = [
  { value: 'All', label: 'All' },
  { value: 'Crypto', label: 'Crypto' },
  { value: 'US Stocks', label: 'US Stocks' },
  { value: 'Indices', label: 'Indices' },
  { value: 'Commodities & Forex', label: 'Commodities & Forex' },
  { value: 'Watchlist', label: 'Watchlist' }
];

const REFERENCE_ASSETS = [
  // Crypto
  { symbol: 'BTCUSD', name: 'Bitcoin', category: 'Crypto', ticker: 'BTC-USD', vol: '18.25 B', cap: 'N/A' },
  { symbol: 'ETHUSD', name: 'Ethereum', category: 'Crypto', ticker: 'ETH-USD', vol: '7.66 B', cap: 'N/A' },
  { symbol: 'SOLUSD', name: 'Solana', category: 'Crypto', ticker: 'SOL-USD', vol: '1.45 B', cap: 'N/A' },
  { symbol: 'BNBUSD', name: 'BNB', category: 'Crypto', ticker: 'BNB-USD', vol: '914.20 M', cap: 'N/A' },
  { symbol: 'XRPUSD', name: 'Ripple', category: 'Crypto', ticker: 'XRP-USD', vol: '1.41 B', cap: 'N/A' },
  { symbol: 'ADAUSD', name: 'Cardano', category: 'Crypto', ticker: 'ADA-USD', vol: '809.43 M', cap: 'N/A' },
  { symbol: 'AVAXUSD', name: 'Avalanche', category: 'Crypto', ticker: 'AVAX-USD', vol: '267.16 M', cap: 'N/A' },
  { symbol: 'DOGEUSD', name: 'Dogecoin', category: 'Crypto', ticker: 'DOGE-USD', vol: '404.65 M', cap: 'N/A' },
  { symbol: 'DOTUSD', name: 'Polkadot', category: 'Crypto', ticker: 'DOT-USD', vol: '66.96 M', cap: 'N/A' },
  { symbol: 'LINKUSD', name: 'Chainlink', category: 'Crypto', ticker: 'LINK-USD', vol: '198.01 M', cap: 'N/A' },
  
  // US Stocks
  { symbol: 'AAPL', name: 'Apple Inc.', category: 'US Stocks', ticker: 'AAPL', vol: '52.4 M', cap: '3.15 T' },
  { symbol: 'TSLA', name: 'Tesla Inc.', category: 'US Stocks', ticker: 'TSLA', vol: '88.1 M', cap: '782.4 B' },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', category: 'US Stocks', ticker: 'NVDA', vol: '112.5 M', cap: '2.95 T' },
  { symbol: 'MSFT', name: 'Microsoft Corp.', category: 'US Stocks', ticker: 'MSFT', vol: '22.8 M', cap: '3.21 T' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', category: 'US Stocks', ticker: 'AMZN', vol: '38.6 M', cap: '1.85 T' },
  { symbol: 'GOOG', name: 'Alphabet Inc.', category: 'US Stocks', ticker: 'GOOG', vol: '25.1 M', cap: '2.12 T' },
  
  // Indices
  { symbol: 'US500', name: 'S&P 500', category: 'Indices', ticker: 'US500', vol: 'N/A', cap: 'N/A' },
  { symbol: 'DE30', name: 'DAX 30', category: 'Indices', ticker: 'DE30', vol: 'N/A', cap: 'N/A' },
  { symbol: 'JP225', name: 'Nikkei 225', category: 'Indices', ticker: 'JP225', vol: 'N/A', cap: 'N/A' },
  { symbol: 'HK50', name: 'Hang Seng', category: 'Indices', ticker: 'HK50', vol: 'N/A', cap: 'N/A' },

  // Commodities & Forex
  { symbol: 'XAUUSD', name: 'Gold', category: 'Commodities & Forex', ticker: 'GC=F', vol: '185 K', cap: 'N/A' },
  { symbol: 'XAGUSD', name: 'Silver', category: 'Commodities & Forex', ticker: 'SI=F', vol: '62 K', cap: 'N/A' },
  { symbol: 'USOIL', name: 'WTI Crude', category: 'Commodities & Forex', ticker: 'CL=F', vol: '320 K', cap: 'N/A' },
  { symbol: 'EURUSD=X', name: 'EUR / USD', category: 'Commodities & Forex', ticker: 'EURUSD=X', vol: 'N/A', cap: 'N/A' },
  { symbol: 'GBPUSD=X', name: 'GBP / USD', category: 'Commodities & Forex', ticker: 'GBPUSD=X', vol: 'N/A', cap: 'N/A' },
  { symbol: 'USDJPY=X', name: 'USD / JPY', category: 'Commodities & Forex', ticker: 'USDJPY=X', vol: 'N/A', cap: 'N/A' }
];

const SYMBOL_META = {
  BTCUSD: { name: 'Bitcoin',    abbr: 'BTC', unit: 'USD'     },
  ETHUSD: { name: 'Ethereum',   abbr: 'ETH', unit: 'USD'     },
  XAUUSD: { name: 'Gold',       abbr: 'XAU', unit: 'USD/oz'  },
  XAGUSD: { name: 'Silver',     abbr: 'XAG', unit: 'USD/oz'  },
  US500:  { name: 'S&P 500',    abbr: 'SPX', unit: 'pts'     },
  DE30:   { name: 'DAX 30',     abbr: 'DAX', unit: 'pts'     },
  JP225:  { name: 'Nikkei 225', abbr: 'NKY', unit: 'pts'     },
  HK50:   { name: 'Hang Seng',  abbr: 'HSI', unit: 'pts'     },
  USOIL:  { name: 'WTI Crude',  abbr: 'OIL', unit: 'USD/bbl' },
};

const fmt = (p, symbolOrCurrency = 'USD', dec = 2) => {
  if (!p && p !== 0) return '—';
  if (typeof symbolOrCurrency === 'number') {
    const d = symbolOrCurrency;
    if (p >= 10000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
    return p.toLocaleString('en-US', { maximumFractionDigits: d });
  }
  const formattedVal = p >= 10000 
    ? p.toLocaleString('en-US', { maximumFractionDigits: 0 }) 
    : p.toLocaleString('en-US', { maximumFractionDigits: dec });
    
  const isForex = symbolOrCurrency?.endsWith('=X');
  if (isForex) return formattedVal;
  
  const isIndex = ['US500', 'DE30', 'JP225', 'HK50'].includes(symbolOrCurrency) || symbolOrCurrency?.startsWith('^');
  if (isIndex) return `${formattedVal} pts`;
  
  const cur = symbolOrCurrency === 'EUR' ? 'EUR' : 'USD';
  if (cur === 'EUR') return `€${formattedVal}`;
  return `$${formattedVal}`;
};

const fmtK = (v) => {
  if (!v && v !== 0) return '—';
  if (Math.abs(v) >= 1000000) return `$${(v/1000000).toFixed(1)}M`;
  if (Math.abs(v) >= 1000)    return `$${(v/1000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
};

// ─── Monthly PnL mini bar chart ───────────────────────────────────────────────
function MonthlyBars({ data }) {
  if (!data?.length) return null;
  const last12 = data.slice(-60); // last 60 months = 5 years
  return (
    <Box sx={{ height: 48, mt: 1 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={last12} margin={{ top: 2, right: 0, left: 0, bottom: 0 }} barSize={6}>
          <XAxis dataKey="month" hide />
          <ReTooltip
            content={({ active, payload }) =>
              active && payload?.length ? (
                <Box sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider',
                  px: 1, py: 0.4, borderRadius: 1, boxShadow: 2, fontSize: '0.68rem' }}>
                  <div>{payload[0].payload.month}</div>
                  <div style={{ fontWeight: 700, color: payload[0].value >= 0 ? '#26a69a' : '#ef5350' }}>
                    {fmtK(payload[0].value)}
                  </div>
                  <div style={{ color: '#888' }}>WR: {payload[0].payload.winrate}%</div>
                </Box>
              ) : null
            }
          />
          <Bar dataKey="netProfit" radius={[2,2,0,0]}>
            {last12.map((entry, i) => (
              <Cell key={i} fill={entry.netProfit >= 0 ? '#26a69a' : '#ef5350'} fillOpacity={0.8} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}

// ─── Technical Indicator Calculators ──────────────────────────────────────────
function calcMA(data, period) {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    const slice = data.slice(i - period + 1, i + 1);
    return slice.reduce((s, v) => s + v, 0) / period;
  });
}

function calcBollingerBands(data, period = 20, mult = 2) {
  const ma = calcMA(data, period);
  return data.map((_, i) => {
    if (i < period - 1) return { upper: null, lower: null, mid: null };
    const slice = data.slice(i - period + 1, i + 1);
    const avg = ma[i];
    const std = Math.sqrt(slice.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / period);
    return { upper: +(avg + mult * std).toFixed(4), lower: +(avg - mult * std).toFixed(4), mid: +avg.toFixed(4) };
  });
}

function calcRSI(data, period = 14) {
  if (data.length < period + 1) return data.map(() => null);
  const rsi = new Array(data.length).fill(null);
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = data[i] - data[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi.map(v => v != null ? +v.toFixed(2) : null);
}

function calcEMA(data, period) {
  const k = 2 / (period + 1);
  const ema = new Array(data.length).fill(null);
  let start = data.findIndex(v => v != null);
  if (start === -1) return ema;
  ema[start] = data[start];
  for (let i = start + 1; i < data.length; i++) {
    if (data[i] == null) { ema[i] = ema[i - 1]; continue; }
    ema[i] = +(data[i] * k + ema[i - 1] * (1 - k)).toFixed(4);
  }
  return ema;
}

function calcMACD(data) {
  const ema12 = calcEMA(data, 12);
  const ema26 = calcEMA(data, 26);
  const macdLine = data.map((_, i) => ema12[i] != null && ema26[i] != null ? +(ema12[i] - ema26[i]).toFixed(4) : null);
  const signalLine = calcEMA(macdLine, 9);
  const histogram = macdLine.map((v, i) => v != null && signalLine[i] != null ? +(v - signalLine[i]).toFixed(4) : null);
  return { macdLine, signalLine, histogram };
}

// ─── CandlestickPanel ──────────────────────────────────────────────────────────
const CANDLE_RANGES = [
  { value: '1d',  label: '1D' },
  { value: '5d',  label: '5D' },
  { value: '1mo', label: '1M' },
  { value: '3mo', label: '3M' },
  { value: '6mo', label: '6M' },
  { value: '1y',  label: '1Y' },
  { value: '2y',  label: '2Y' },
  { value: '5y',  label: '5Y' },
  { value: 'max', label: 'MAX' },
];

function CandlestickPanel({ symbol, isDarkMode, fmtFn }) {
  const theme = useTheme();
  const chartContainerRef = useRef(null);
  const chartRef          = useRef(null);
  const candleSeriesRef   = useRef(null);
  const ma20SeriesRef     = useRef(null);
  const ma50SeriesRef     = useRef(null);
  const bbUpperRef        = useRef(null);
  const bbLowerRef        = useRef(null);
  const bbMidRef          = useRef(null);

  const [candleRange, setCandleRange] = useState('6mo');
  const [candles, setCandles]         = useState([]);
  const [loadingCandle, setLoadingCandle] = useState(false);
  const [candleError, setCandleError] = useState('');

  // Indicator toggles
  const [showMA20, setShowMA20] = useState(false);
  const [showMA50, setShowMA50] = useState(false);
  const [showBB,   setShowBB]   = useState(false);
  const [showVol,  setShowVol]  = useState(true);
  const [showRSI,  setShowRSI]  = useState(false);
  const [showMACD, setShowMACD] = useState(false);

  // Hover crosshair data
  const [crosshair, setCrosshair] = useState(null);

  const getStrategySignal = () => {
    if (candles.length === 0) return [];
    
    const lastIdx = candles.length - 1;
    const lastClose = candles[lastIdx].close;
    const activeSignals = [];
    
    // MA20 & MA50 Cross
    if (showMA20 && showMA50) {
      const m20Arr = calcMA(closes, 20);
      const m50Arr = calcMA(closes, 50);
      const m20Val = m20Arr[lastIdx];
      const m50Val = m50Arr[lastIdx];
      if (m20Val != null && m50Val != null) {
        const trend = m20Val > m50Val ? "XU HƯỚNG TĂNG" : "XU HƯỚNG GIẢM";
        const signal = m20Val > m50Val ? "MUA (BUY)" : "BÁN (SELL)";
        const color = m20Val > m50Val ? "#26a69a" : "#ef5350";
        activeSignals.push({
          title: "Đường trung bình (MA Cross)",
          value: `${trend} (MA20 > MA50)`,
          action: `Tín hiệu: ${signal}`,
          color
        });
      }
    }
    
    // Bollinger Bands + RSI
    if (showBB && showRSI) {
      const bbVals = calcBollingerBands(closes, 20, 2)[lastIdx];
      const rsiVal = calcRSI(closes)[lastIdx];
      if (bbVals?.upper != null && rsiVal != null) {
        let state = "Trung lập (Neutral)";
        let action = "Chờ tín hiệu";
        let color = "#64748b";
        if (lastClose >= bbVals.upper && rsiVal >= 70) {
          state = "Quá mua cực đại (Overbought)";
          action = "Canh BÁN (SELL)";
          color = "#ef5350";
        } else if (lastClose <= bbVals.lower && rsiVal <= 30) {
          state = "Quá bán cực đại (Oversold)";
          action = "Canh MUA (BUY)";
          color = "#26a69a";
        } else if (lastClose >= bbVals.upper) {
          state = "Vượt biên trên Bollinger Bands";
          action = "Cảnh giác / Canh bán";
          color = "#ffc107";
        } else if (lastClose <= bbVals.lower) {
          state = "Vượt biên dưới Bollinger Bands";
          action = "Cảnh giác / Canh mua";
          color = "#ffc107";
        }
        activeSignals.push({
          title: "Dải Bollinger & RSI",
          value: `${state} (RSI: ${rsiVal})`,
          action: `Khuyên dùng: ${action}`,
          color
        });
      }
    }
    
    // MACD
    if (showMACD) {
      const { macdLine, signalLine } = calcMACD(closes);
      const macdVal = macdLine[lastIdx];
      const sigVal = signalLine[lastIdx];
      if (macdVal != null && sigVal != null) {
        const diff = macdVal - sigVal;
        const trend = diff > 0 ? "Momentum Lên (Bullish)" : "Momentum Xuống (Bearish)";
        const action = diff > 0 ? "Ưu tiên MUA" : "Ưu tiên BÁN";
        const color = diff > 0 ? "#26a69a" : "#ef5350";
        activeSignals.push({
          title: "MACD Momentum",
          value: `${trend} (MACD > Signal)`,
          action: `Tín hiệu: ${action}`,
          color
        });
      }
    }
    
    // Volume Confirmation
    if (showVol && candles.length > 5) {
      const lastVol = candles[lastIdx].volume;
      const prevVols = candles.slice(Math.max(0, lastIdx - 5), lastIdx).map(c => c.volume);
      const avgVol = prevVols.reduce((s, v) => s + v, 0) / Math.max(1, prevVols.length);
      if (lastVol > avgVol * 1.5) {
        const trendDirection = candles[lastIdx].close >= candles[lastIdx].open ? "TĂNG GIÁ" : "GIẢM GIÁ";
        activeSignals.push({
          title: "Xác nhận Khối lượng (Volume)",
          value: `Volume đột biến: ${(lastVol / Math.max(1, avgVol)).toFixed(1)}x trung bình`,
          action: `Xu hướng ${trendDirection} đang được củng cố mạnh`,
          color: "#29b6f6"
        });
      }
    }
    
    return activeSignals;
  };

  const fetchCandles = useCallback(async (sym, rng) => {
    setLoadingCandle(true);
    setCandleError('');
    try {
      const data = await getMarketCandles(sym, rng);
      setCandles(data.candles || []);
    } catch (e) {
      setCandleError(e.message || 'Failed to load chart');
    } finally {
      setLoadingCandle(false);
    }
  }, []);

  // Destroy old chart when range/symbol changes so it rebuilds fresh
  useEffect(() => {
    if (chartRef.current) {
      if (chartRef.current._ro) chartRef.current._ro.disconnect();
      chartRef.current.remove();
      chartRef.current        = null;
      candleSeriesRef.current = null;
      ma20SeriesRef.current   = null;
      ma50SeriesRef.current   = null;
      bbUpperRef.current      = null;
      bbLowerRef.current      = null;
      bbMidRef.current        = null;
    }
    fetchCandles(symbol, candleRange);
  }, [symbol, candleRange, fetchCandles]);

  // Build/update lightweight-charts — using static import (no async race condition)
  useEffect(() => {
    if (!chartContainerRef.current || candles.length === 0) return;

    const bgColor   = isDarkMode ? '#0d1117' : '#ffffff';
    const textColor = isDarkMode ? '#c9d1d9' : '#374151';
    const gridColor = isDarkMode ? '#21262d' : '#e5e7eb';
    const upColor   = '#26a69a';
    const downColor = '#ef5350';

    if (!chartRef.current) {
      // ── Create chart synchronously (static import) ──
      const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: 300,
        layout: { background: { color: bgColor }, textColor },
        grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: gridColor },
        timeScale: { borderColor: gridColor, timeVisible: true, secondsVisible: false },
        handleScroll: { mouseWheel: true, pressedMouseMove: true },
        handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      });

      // v5 API: chart.addSeries(SeriesClass, options)
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor, downColor,
        borderUpColor: upColor, borderDownColor: downColor,
        wickUpColor: upColor, wickDownColor: downColor,
      });

      // Set refs immediately before setData
      chartRef.current        = chart;
      candleSeriesRef.current = candleSeries;

      const ma20Series = chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false });
      const ma50Series = chart.addSeries(LineSeries, { color: '#8b5cf6', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false });
      const bbUpper    = chart.addSeries(LineSeries, { color: '#60a5fa', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
      const bbLower    = chart.addSeries(LineSeries, { color: '#60a5fa', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
      const bbMid      = chart.addSeries(LineSeries, { color: '#60a5fa44', lineWidth: 1, lineStyle: 0, priceLineVisible: false, lastValueVisible: false });
      ma20SeriesRef.current = ma20Series;
      ma50SeriesRef.current = ma50Series;
      bbUpperRef.current    = bbUpper;
      bbLowerRef.current    = bbLower;
      bbMidRef.current      = bbMid;

      // Load data
      candleSeries.setData(candles);
      updateIndicators(candles, { showMA20, showMA50, showBB }, { ma20Series, ma50Series, bbUpper, bbLower, bbMid });
      chart.timeScale().fitContent();

      // Crosshair tooltip
      chart.subscribeCrosshairMove(param => {
        if (!param.time || !param.seriesData?.size) { setCrosshair(null); return; }
        const ohlcv = param.seriesData.get(candleSeries);
        if (ohlcv) {
          const ts = param.time;
          const date = typeof ts === 'number'
            ? new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : String(ts);
          setCrosshair({ date, open: ohlcv.open, high: ohlcv.high, low: ohlcv.low, close: ohlcv.close });
        }
      });

      // Auto-resize
      const ro = new ResizeObserver(entries => {
        if (entries[0] && chartRef.current) chartRef.current.applyOptions({ width: entries[0].contentRect.width });
      });
      ro.observe(chartContainerRef.current);
      chartRef.current._ro = ro;


    } else {
      // ── Update existing chart (range/theme change) ──
      chartRef.current.applyOptions({
        layout: { background: { color: bgColor }, textColor },
        grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
      });
      candleSeriesRef.current?.setData(candles);
      updateIndicators(candles, { showMA20, showMA50, showBB }, {
        ma20Series: ma20SeriesRef.current,
        ma50Series: ma50SeriesRef.current,
        bbUpper:    bbUpperRef.current,
        bbLower:    bbLowerRef.current,
        bbMid:      bbMidRef.current,
      });
      chartRef.current.timeScale().fitContent();
    }

    return () => {};
  }, [candles, isDarkMode]);

  // Update indicators when toggles change
  useEffect(() => {
    if (!chartRef.current || candles.length === 0) return;
    updateIndicators(candles, { showMA20, showMA50, showBB }, {
      ma20Series: ma20SeriesRef.current,
      ma50Series: ma50SeriesRef.current,
      bbUpper: bbUpperRef.current,
      bbLower: bbLowerRef.current,
      bbMid: bbMidRef.current,
    });
  }, [showMA20, showMA50, showBB, candles]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (chartRef.current) {
        if (chartRef.current._ro) chartRef.current._ro.disconnect();
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, []);

  function updateIndicators(candleData, flags, refs) {
    const closes = candleData.map(c => c.close);
    const times  = candleData.map(c => c.time);

    // MA20
    if (refs.ma20Series) {
      const ma20 = calcMA(closes, 20);
      const d20 = times.map((t, i) => ma20[i] != null ? { time: t, value: ma20[i] } : null).filter(Boolean);
      refs.ma20Series.setData(flags.showMA20 ? d20 : []);
    }

    // MA50
    if (refs.ma50Series) {
      const ma50 = calcMA(closes, 50);
      const d50 = times.map((t, i) => ma50[i] != null ? { time: t, value: ma50[i] } : null).filter(Boolean);
      refs.ma50Series.setData(flags.showMA50 ? d50 : []);
    }

    // BB
    if (refs.bbUpper && refs.bbLower && refs.bbMid) {
      const bb = calcBollingerBands(closes, 20, 2);
      const dU = times.map((t, i) => bb[i].upper != null ? { time: t, value: bb[i].upper } : null).filter(Boolean);
      const dL = times.map((t, i) => bb[i].lower != null ? { time: t, value: bb[i].lower } : null).filter(Boolean);
      const dM = times.map((t, i) => bb[i].mid   != null ? { time: t, value: bb[i].mid   } : null).filter(Boolean);
      refs.bbUpper.setData(flags.showBB ? dU : []);
      refs.bbLower.setData(flags.showBB ? dL : []);
      refs.bbMid.setData(flags.showBB ? dM : []);
    }
  }

  // Compute RSI / MACD for sub-charts (Recharts)
  const closes = candles.map(c => c.close);
  const times  = candles.map(c => c.time);
  const rsiData = showRSI ? calcRSI(closes).map((v, i) => ({ time: times[i], value: v })).filter(d => d.value != null) : [];
  const { macdLine, signalLine, histogram } = showMACD
    ? calcMACD(closes)
    : { macdLine: [], signalLine: [], histogram: [] };
  const macdData = showMACD
    ? times.map((t, i) => ({
        time: t,
        macd: macdLine[i],
        signal: signalLine[i],
        hist: histogram[i],
      })).filter(d => d.macd != null)
    : [];

  const volData = candles.map(c => ({
    time: c.time,
    v: c.volume,
    color: c.close >= c.open ? '#26a69a' : '#ef5350',
  }));

  const indicatorBtnSx = (active, activeColor) => ({
    px: 1, py: 0.3, borderRadius: 1, cursor: 'pointer', fontSize: '0.62rem', fontWeight: 600,
    border: '1px solid', transition: 'all 0.15s',
    bgcolor: active ? activeColor : 'transparent',
    borderColor: active ? activeColor : 'divider',
    color: active ? '#fff' : 'text.secondary',
    '&:hover': { borderColor: activeColor, color: active ? '#fff' : activeColor },
    userSelect: 'none',
  });

  return (
    <Box sx={{
      bgcolor: isDarkMode ? '#0d1117' : '#f8fafc',
      border: '1px solid', borderColor: isDarkMode ? '#21262d' : '#e2e8f0',
      borderTop: 'none', px: 2, py: 2,
    }}>
      {/* Controls row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
        {/* Range buttons */}
        <Box sx={{ display: 'flex', gap: 0.5, mr: 1 }}>
          {CANDLE_RANGES.map(r => (
            <Box key={r.value} onClick={() => setCandleRange(r.value)}
              sx={{
                px: 1, py: 0.3, borderRadius: 1, cursor: 'pointer', fontSize: '0.65rem', fontWeight: 700,
                transition: 'all 0.15s',
                bgcolor: candleRange === r.value ? (isDarkMode ? '#2E3D52' : '#1e293b') : 'transparent',
                color: candleRange === r.value ? '#fff' : 'text.secondary',
                border: '1px solid', borderColor: candleRange === r.value ? (isDarkMode ? '#2E3D52' : '#1e293b') : 'divider',
                '&:hover': { borderColor: isDarkMode ? '#4a5568' : '#94a3b8' },
              }}>
              {r.label}
            </Box>
          ))}
        </Box>

        {/* Divider */}
        <Box sx={{ width: '1px', height: 18, bgcolor: 'divider', mx: 0.5 }} />

        {/* Indicator toggles */}
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          <Box onClick={() => setShowMA20(v => !v)} sx={indicatorBtnSx(showMA20, '#f59e0b')}>MA20</Box>
          <Box onClick={() => setShowMA50(v => !v)} sx={indicatorBtnSx(showMA50, '#8b5cf6')}>MA50</Box>
          <Box onClick={() => setShowBB(v => !v)}   sx={indicatorBtnSx(showBB, '#60a5fa')}>BB</Box>
          <Box onClick={() => setShowVol(v => !v)}  sx={indicatorBtnSx(showVol, '#64748b')}>VOL</Box>
          <Box onClick={() => setShowRSI(v => !v)}  sx={indicatorBtnSx(showRSI, '#10b981')}>RSI</Box>
          <Box onClick={() => setShowMACD(v => !v)} sx={indicatorBtnSx(showMACD, '#f97316')}>MACD</Box>
        </Box>

        {/* Reload */}
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
          {crosshair && (
            <Box sx={{ display: 'flex', gap: 1.5, fontSize: '0.65rem', color: 'text.secondary', fontFamily: 'monospace' }}>
              <span style={{ color: '#94a3b8' }}>{crosshair.date}</span>
              <span>O: <strong style={{ color: '#c9d1d9' }}>{fmtFn(crosshair.open, symbol)}</strong></span>
              <span>H: <strong style={{ color: '#26a69a' }}>{fmtFn(crosshair.high, symbol)}</strong></span>
              <span>L: <strong style={{ color: '#ef5350' }}>{fmtFn(crosshair.low, symbol)}</strong></span>
              <span>C: <strong style={{ color: '#c9d1d9' }}>{fmtFn(crosshair.close, symbol)}</strong></span>
            </Box>
          )}
          <Tooltip title="Reload candles">
            <IconButton size="small" onClick={() => fetchCandles(symbol, candleRange)} disabled={loadingCandle}
              sx={{ border: '1px solid', borderColor: 'divider', color: 'text.secondary', p: '3px' }}>
              <ReloadOutlined style={{ fontSize: 12 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Dynamic Trading Signal Panel */}
      {(() => {
        const signals = getStrategySignal();
        if (signals.length === 0) return null;
        return (
          <Box sx={{
            mb: 1.5, p: 1.2, px: 2,
            borderRadius: 1.5,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: isDarkMode ? '#111827' : '#f8fafc',
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fit, minmax(200px, 1fr))' },
            gap: 2
          }}>
            {signals.map((sig, idx) => (
              <Box key={idx} sx={{ borderLeft: `3px solid ${sig.color}`, pl: 1.5 }}>
                <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}>
                  {sig.title}
                </Typography>
                <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: 'text.primary', mt: 0.2 }}>
                  {sig.value}
                </Typography>
                <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: sig.color, mt: 0.1 }}>
                  {sig.action}
                </Typography>
              </Box>
            ))}
          </Box>
        );
      })()}

      {/* Loading bar */}
      {loadingCandle && <LinearProgress sx={{ mb: 1, borderRadius: 1, height: 2 }} />}

      {/* Error */}
      {candleError && (
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <Typography variant="caption" color="error.main">{candleError}</Typography>
        </Box>
      )}

      {/* Main candlestick chart */}
      {!candleError && (
        <Box>
          {candles.length === 0 && !loadingCandle ? (
            <Box sx={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography variant="caption" color="text.disabled">No candle data available</Typography>
            </Box>
          ) : (
            <Box ref={chartContainerRef} sx={{ width: '100%', height: 300, position: 'relative' }} />
          )}

          {/* Volume sub-chart */}
          {showVol && volData.length > 0 && (
            <Box sx={{ mt: 0.5 }}>
              <Typography sx={{ fontSize: '0.58rem', color: 'text.disabled', mb: 0.3, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>Volume</Typography>
              <Box sx={{ height: 56 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={volData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }} barSize={Math.max(1, Math.floor(800 / volData.length) - 1)}>
                    <XAxis dataKey="time" hide />
                    <YAxis hide />
                    <ReTooltip
                      cursor={false}
                      content={({ active, payload }) =>
                        active && payload?.length ? (
                          <Box sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', px: 1, py: 0.4, borderRadius: 1, fontSize: '0.65rem' }}>
                            Vol: <strong>{payload[0].value?.toLocaleString()}</strong>
                          </Box>
                        ) : null
                      }
                    />
                    <Bar dataKey="v" radius={[1, 1, 0, 0]}>
                      {volData.map((d, i) => <Cell key={i} fill={d.color} fillOpacity={0.7} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </Box>
          )}

          {/* RSI sub-chart */}
          {showRSI && rsiData.length > 0 && (
            <Box sx={{ mt: 0.5 }}>
              <Typography sx={{ fontSize: '0.58rem', color: 'text.disabled', mb: 0.3, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>RSI (14)</Typography>
              <Box sx={{ height: 60 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={rsiData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <XAxis dataKey="time" hide />
                    <YAxis domain={[0, 100]} hide />
                    <ReTooltip
                      content={({ active, payload }) =>
                        active && payload?.length ? (
                          <Box sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', px: 1, py: 0.4, borderRadius: 1, fontSize: '0.65rem' }}>
                            RSI: <strong style={{ color: payload[0].value > 70 ? '#ef5350' : payload[0].value < 30 ? '#26a69a' : '#c9d1d9' }}>{payload[0].value?.toFixed(1)}</strong>
                          </Box>
                        ) : null
                      }
                    />
                    {/* Overbought/oversold reference lines */}
                    <defs>
                      <linearGradient id={`rsi-grad-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={1.5}
                      fill={`url(#rsi-grad-${symbol})`} dot={false} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.55rem', color: 'text.disabled', mt: -0.5 }}>
                <span style={{ color: '#26a69a' }}>30 (Oversold)</span>
                <span style={{ color: '#ef5350' }}>70 (Overbought)</span>
              </Box>
            </Box>
          )}

          {/* MACD sub-chart */}
          {showMACD && macdData.length > 0 && (
            <Box sx={{ mt: 0.5 }}>
              <Typography sx={{ fontSize: '0.58rem', color: 'text.disabled', mb: 0.3, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>MACD (12,26,9)</Typography>
              <Box sx={{ height: 64 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={macdData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <XAxis dataKey="time" hide />
                    <YAxis hide />
                    <ReTooltip
                      content={({ active, payload }) =>
                        active && payload?.length ? (
                          <Box sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', px: 1, py: 0.4, borderRadius: 1, fontSize: '0.65rem' }}>
                            {payload.map(p => (
                              <div key={p.dataKey} style={{ color: p.color }}>
                                {p.dataKey === 'hist' ? 'Hist' : p.dataKey === 'macd' ? 'MACD' : 'Signal'}: {(+p.value).toFixed(4)}
                              </div>
                            ))}
                          </Box>
                        ) : null
                      }
                    />
                    <Bar dataKey="hist" radius={[1, 1, 0, 0]}>
                      {macdData.map((d, i) => <Cell key={i} fill={d.hist >= 0 ? '#26a69a' : '#ef5350'} fillOpacity={0.8} />)}
                    </Bar>
                    {/* MACD line & Signal overlay via recharts line — use separate chart */}
                  </BarChart>
                </ResponsiveContainer>
              </Box>
              {/* MACD & Signal lines */}
              <Box sx={{ height: 40, mt: '-2px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={macdData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <XAxis dataKey="time" hide />
                    <YAxis hide />
                    <Area type="monotone" dataKey="macd"   stroke="#f97316" fill="none" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    <Area type="monotone" dataKey="signal" stroke="#a78bfa" fill="none" strokeWidth={1}   dot={false} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </Box>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

// ─── PriceCard ────────────────────────────────────────────────────────────────
function PriceCard({ item, loading, tables = [], onUnfollow }) {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const [expanded, setExpanded]   = useState(false);
  const [stats, setStats]         = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [backtestTable, setBacktestTable] = useState('');
  const [sortBy, setSortBy]       = useState('pd');
  const navigate = useNavigate();

  const loadStats = useCallback(async (bt = backtestTable, sb = sortBy) => {
    if (!item?.symbol || item?.error) return;
    setStatsLoading(true);
    try {
      const res = await getSymbolStats(item.symbol, item.price, bt || null, sb);
      setStats(res);
    } catch (e) {
      console.error('stats error', e);
    } finally {
      setStatsLoading(false);
    }
  }, [item?.symbol, item?.price, backtestTable, sortBy]);

  const handleExpand = () => {
    if (!expanded && !stats) loadStats();
    setExpanded(v => !v);
  };

  if (loading || !item) {
    return (
      <Card variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <CardContent sx={{ pb: '12px !important' }}>
          <Skeleton width="50%" height={16} /><Skeleton width="70%" height={32} sx={{ mt: 0.5 }} />
          <Skeleton width="40%" height={14} /><Skeleton width="100%" height={60} sx={{ mt: 1 }} />
        </CardContent>
      </Card>
    );
  }

  const meta    = SYMBOL_META[item.symbol] || {};
  const isUp    = (item.changePct ?? 0) > 0;
  const isDown  = (item.changePct ?? 0) < 0;
  const color   = isUp ? '#26a69a' : isDown ? '#ef5350' : '#a0aec0';
  const bgColor = isUp ? 'rgba(38,166,154,0.08)' : isDown ? 'rgba(239,83,80,0.08)' : 'rgba(160,174,192,0.08)';
  const gradId  = `grad-${item.symbol}`;
  const spark   = item.sparkline?.length > 1 ? item.sparkline : null;

  const ss = stats?.strategySummary;
  const pz = stats?.priceZone;
  const mp = stats?.monthlyPnl;

  return (
    <Card variant="outlined" sx={{
      borderRadius: 2, overflow: 'hidden', borderColor: item.error ? 'error.light' : 'divider',
      transition: 'box-shadow 0.2s, border-color 0.2s',
      '&:hover': { boxShadow: 4, borderColor: color }
    }}>
      <Box sx={{ height: 3, bgcolor: color, opacity: 0.8 }} />

      <CardContent sx={{ pb: '8px !important', pt: 1.5 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 38, height: 38, borderRadius: 1.5, bgcolor: bgColor,
              border: '1px solid', borderColor: color + '40',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Typography sx={{ fontSize: '0.62rem', fontWeight: 800, color, letterSpacing: 0.8 }}>
                {meta.abbr || item.symbol.slice(0,3)}
              </Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, lineHeight: 1.2 }}>
                {meta.name || item.symbol}
              </Typography>
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.62rem' }}>
                {item.symbol} · {meta.unit}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Chip label={item.marketState === 'REGULAR' ? '● Live' : item.marketState || 'Closed'} size="small"
              sx={{ height: 18, fontSize: '0.58rem', fontWeight: 600, border: 'none',
                bgcolor: item.marketState === 'REGULAR' ? 'rgba(38,166,154,0.12)' : (isDarkMode ? 'action.hover' : 'grey.100'),
                color:   item.marketState === 'REGULAR' ? '#26a69a' : 'text.disabled' }} />
            {onUnfollow && (
              <Tooltip title="Bỏ theo dõi">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnfollow(item.symbol);
                  }}
                  sx={{
                    p: '2px',
                    color: 'text.disabled',
                    '&:hover': { color: 'error.main', bgcolor: isDarkMode ? 'rgba(239, 83, 80, 0.15)' : 'rgba(239, 83, 80, 0.08)' }
                  }}
                >
                  <CloseOutlined style={{ fontSize: 11 }} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>

        {item.error ? (
          <Typography variant="body2" color="error.main" sx={{ fontSize: '0.75rem', mt: 1.5 }}>{item.error}</Typography>
        ) : (
          <>
            {/* Price */}
            <Box sx={{ mt: 1.5, mb: 0.5 }}>
              <Typography sx={{ fontSize: '1.45rem', fontWeight: 700, lineHeight: 1, letterSpacing: '-0.5px' }}>
                {fmt(item.price, item.symbol)}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mt: 0.4 }}>
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.3, px: 0.8, py: 0.2, borderRadius: 1, bgcolor: bgColor }}>
                  <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color }}>
                    {isUp ? '▲' : isDown ? '▼' : '—'}
                    {item.changePct != null ? ` ${item.changePct > 0 ? '+' : ''}${item.changePct}%` : ''}
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.68rem' }}>
                  {item.change != null ? `${item.change > 0 ? '+' : ''}${fmt(item.change, item.symbol)}` : ''}
                </Typography>
              </Box>
            </Box>

            {/* Sparkline */}
            {spark ? (
              <Box sx={{ mt: 1, mx: -0.5, height: 52 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={spark} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <YAxis domain={['auto','auto']} hide />
                    <ReTooltip content={({ active, payload }) =>
                      active && payload?.length ? (
                        <Box sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider',
                          px: 1, py: 0.4, borderRadius: 1, boxShadow: 2 }}>
                          <Typography sx={{ fontSize: '0.7rem', fontWeight: 600 }}>{fmt(payload[0].value, item.symbol)}</Typography>
                        </Box>
                      ) : null} />
                    <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5}
                      fill={`url(#${gradId})`} dot={false} activeDot={{ r: 3, fill: color }} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </Box>
            ) : (
              <Box sx={{ mt: 1, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: isDarkMode ? 'background.default' : 'grey.50', borderRadius: 1 }}>
                <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>No chart data</Typography>
              </Box>
            )}

            <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5, fontSize: '0.6rem' }}>
              {item.sparkFrom && item.sparkTo
                ? `Biểu đồ: ${item.sparkFrom} – ${item.sparkTo} · Cập nhật: ${item.updatedAt}`
                : `Cập nhật: ${item.updatedAt}`}
            </Typography>

            {/* Expand button */}
            <Box sx={{ mt: 1, display: 'flex', justifyContent: 'center' }}>
              <Button size="small" onClick={handleExpand}
                endIcon={expanded ? <UpOutlined style={{ fontSize: 10 }} /> : <DownOutlined style={{ fontSize: 10 }} />}
                sx={{ fontSize: '0.65rem', color: 'text.secondary', textTransform: 'none', py: 0.3,
                  '&:hover': { color: color } }}>
                {expanded ? 'Thu gọn' : 'Xem strategy stats'}
              </Button>
            </Box>

            {/* Expanded stats */}
            <Collapse in={expanded} unmountOnExit>
              <Divider sx={{ my: 1 }} />

              {statsLoading ? (
                <Box>
                  <Skeleton height={14} width="80%" /><Skeleton height={14} width="60%" sx={{ mt: 0.5 }} />
                  <Skeleton height={48} sx={{ mt: 1 }} />
                </Box>
              ) : ss ? (
                <>
                  {/* Feature 1: Strategy Summary */}
                  <Box sx={{ mb: 1 }}>
                    {/* Controls: filter backtest + sort */}
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.8 }}>
                      <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Strategy Overview in Database
                      </Typography>
                    </Box>
                    {/* Sort buttons */}
                    <Box sx={{ display: 'flex', gap: 0.4, mb: 0.8, flexWrap: 'wrap', alignItems: 'center' }}>
                      {[['pd','P/D'],['winrate','WR'],['sharpe','Sharpe'],['profit','Profit']].map(([val, label]) => (
                        <Box key={val} onClick={() => { setSortBy(val); loadStats(backtestTable, val); }}
                          sx={{ px: 0.8, py: 0.2, borderRadius: 1, cursor: 'pointer', fontSize: '0.6rem', fontWeight: 600,
                            bgcolor: sortBy === val ? color : (isDarkMode ? 'action.hover' : 'grey.100'),
                            color: sortBy === val ? '#fff' : 'text.secondary',
                            '&:hover': { bgcolor: sortBy === val ? color : (isDarkMode ? 'divider' : 'grey.200') } }}>
                          {label}
                        </Box>
                      ))}
                      {/* Backtest table filter */}
                      {tables.length > 0 && (
                        <Box component="select"
                          value={backtestTable}
                          onChange={e => { setBacktestTable(e.target.value); loadStats(e.target.value, sortBy); }}
                          sx={{ ml: 'auto', fontSize: '0.6rem', border: '1px solid', borderColor: 'divider',
                            borderRadius: 1, px: 0.6, py: 0.2, bgcolor: 'background.paper', cursor: 'pointer',
                            color: 'text.secondary', outline: 'none' }}>
                          <option value="">All tables</option>
                          {tables.map(t => <option key={t} value={t}>{t}</option>)}
                        </Box>
                      )}
                    </Box>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
                      {[
                        ['Strategies', ss.totalStrategies],
                        ['Avg P/D', ss.avgPd ?? '—'],
                        ['Avg Winrate', ss.avgWinrate ? `${ss.avgWinrate}%` : '—'],
                        ['Avg Sharpe', ss.avgSharpe ?? '—'],
                        ['Buy / Sell', `${ss.buyStrategies} / ${ss.sellStrategies}`],
                        ['H1 / H4', `${ss.h1Strategies} / ${ss.h4Strategies}`],
                      ].map(([label, val]) => (
                        <Box key={label} sx={{ bgcolor: isDarkMode ? 'background.default' : 'grey.50', borderRadius: 1, px: 1, py: 0.5 }}>
                          <Typography sx={{ fontSize: '0.58rem', color: 'text.disabled' }}>{label}</Typography>
                          <Typography sx={{ fontSize: '0.72rem', fontWeight: 600 }}>{val}</Typography>
                        </Box>
                      ))}
                    </Box>

                    {ss.topStrategies?.length > 0 && (
                      <Box sx={{ mt: 0.8 }}>
                        <Typography sx={{ fontSize: '0.58rem', color: 'text.disabled', mb: 0.5 }}>
                          Top 10 by {sortBy === 'pd' ? 'P/D' : sortBy === 'winrate' ? 'Winrate' : sortBy === 'sharpe' ? 'Sharpe' : 'Profit'}
                        </Typography>
                        <Box sx={{ maxHeight: 160, overflowY: 'auto',
                          '&::-webkit-scrollbar': { width: 3 },
                          '&::-webkit-scrollbar-thumb': { bgcolor: 'grey.300', borderRadius: 2 } }}>
                          {ss.topStrategies.map((s, i) => {
                            const val = sortBy === 'pd' ? s.pd : sortBy === 'winrate' ? s.winrate : sortBy === 'sharpe' ? s.sharpe : s.profit;
                            const isOutlier = sortBy === 'pd' && s.pd > 100;
                            const rowColor = isOutlier ? '#ff9800' : i === 0 ? color : null;
                            return (
                              <Box key={s.id} onClick={() => navigate(`/strategy-input?search=${s.id}`)}
                                sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                  px: 0.8, py: 0.4, borderRadius: 1, cursor: 'pointer', mb: 0.3,
                                  bgcolor: (i === 0 || isOutlier) ? (isOutlier ? 'rgba(255,152,0,0.08)' : bgColor) : 'transparent',
                                  border: '1px solid', borderColor: (i === 0 || isOutlier) ? (isOutlier ? '#ff980040' : color + '30') : 'transparent',
                                  '&:hover': { bgcolor: bgColor, borderColor: color + '30' } }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                                  <Typography sx={{ fontSize: '0.58rem', color: 'text.disabled', minWidth: 14 }}>{i + 1}.</Typography>
                                  <Typography sx={{ fontSize: '0.68rem', fontWeight: (i === 0 || isOutlier) ? 700 : 400, color: rowColor || 'text.primary' }}>
                                    {s.id}
                                  </Typography>
                                  {isOutlier && <Typography sx={{ fontSize: '0.55rem', color: '#ff9800', fontWeight: 700 }}>⚠</Typography>}
                                </Box>
                                <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: rowColor || color }}>
                                  {val ?? '—'}
                                  {sortBy === 'winrate' && val ? '%' : ''}
                                </Typography>
                              </Box>
                            );
                          })}
                        </Box>
                      </Box>
                    )}
                  </Box>

                  {/* Feature 2: Price Zone */}
                  {pz && (
                    <>
                      <Divider sx={{ my: 0.8 }} />
                      <Box sx={{ mb: 1 }}>
                        <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'text.secondary', mb: 0.8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          Vùng giá hiện tại ±10%
                        </Typography>
                        <Typography sx={{ fontSize: '0.6rem', color: 'text.disabled', mb: 0.5 }}>
                          {fmt(pz.priceRange.low, item.symbol)} – {fmt(pz.priceRange.high, item.symbol)}
                        </Typography>
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0.5 }}>
                          {[
                            ['Deals', pz.totalDeals],
                            ['Winrate', `${pz.winrate}%`],
                            ['Total P&L', fmtK(pz.totalProfit)],
                          ].map(([label, val]) => (
                            <Box key={label} sx={{ bgcolor: isDarkMode ? 'background.default' : 'grey.50', borderRadius: 1, px: 1, py: 0.5, textAlign: 'center' }}>
                              <Typography sx={{ fontSize: '0.58rem', color: 'text.disabled' }}>{label}</Typography>
                              <Typography sx={{ fontSize: '0.72rem', fontWeight: 600,
                                color: label === 'Total P&L' ? (pz.totalProfit >= 0 ? '#26a69a' : '#ef5350') : 'text.primary' }}>
                                {val}
                              </Typography>
                            </Box>
                          ))}
                        </Box>
                      </Box>
                    </>
                  )}

                  {/* Feature 3: Monthly P&L bars */}
                  {mp?.length > 0 && (
                    <>
                      <Divider sx={{ my: 0.8 }} />
                      <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        P&L theo tháng (5 năm gần nhất)
                      </Typography>
                      <MonthlyBars data={mp} />
                    </>
                  )}
                </>
              ) : (
                <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>
                  Chưa có data strategy cho {item.symbol}
                </Typography>
              )}
            </Collapse>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function NewsPage() {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const [prices, setPrices]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [range, setRange]         = useState('1d');
  const [tables, setTables]       = useState([]);
  const [activeTab, setActiveTab] = useState(0); // 0=Market Prices, 1=News, 2=Market Place
  const [newsSymbol, setNewsSymbol] = useState('XAUUSD');
  const [newsItems, setNewsItems]   = useState([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsPage, setNewsPage]     = useState(1);
  const NEWS_PER_PAGE = 8;

  // Watch list state (localStorage backed)
  const [watchedSymbols, setWatchedSymbols] = useState(() => {
    const saved = localStorage.getItem('watchedAssets');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        console.error('Error parsing watched assets:', e);
      }
    }
    localStorage.setItem('watchedAssets', JSON.stringify(INITIAL_SYMBOLS));
    return INITIAL_SYMBOLS;
  });

  // Snackbar states
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMsg, setSnackbarMsg] = useState('');

  // Search states for Tab 2
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');

  // Market Place general prices list
  const [marketPlacePrices, setMarketPlacePrices] = useState([]);
  const [marketPlaceLoading, setMarketPlaceLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Inline candlestick chart state
  const [expandedCandle, setExpandedCandle] = useState(null); // symbol string or null
  const [spotlightSymbol, setSpotlightSymbol] = useState(null); // custom selected spotlight symbol

  const handleToggleCandle = (symbol) => {
    setExpandedCandle(prev => prev === symbol ? null : symbol);
  };

  const getTopGainer = () => {
    const list = prices.length > 0 ? prices : marketPlacePrices;
    if (!list || list.length === 0) return null;
    const sorted = [...list]
      .filter(p => p && p.changePct != null)
      .sort((a, b) => b.changePct - a.changePct);
    return sorted[0] || null;
  };


  useEffect(() => {
    getBacktestTables().then(r => setTables(r.tables || [])).catch(() => {});
  }, []);

  const loadNews = useCallback(async (sym) => {
    if (!sym) return;
    setNewsLoading(true);
    setNewsPage(1);
    try {
      const res = await getSymbolNews(sym);
      setNewsItems(res.items || []);
    } catch (e) {
      console.error(e);
    } finally {
      setNewsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 1) loadNews(newsSymbol);
  }, [activeTab, newsSymbol, loadNews]);

  // Sync news tab symbol if current is deleted
  useEffect(() => {
    if (watchedSymbols.length > 0 && !watchedSymbols.includes(newsSymbol)) {
      setNewsSymbol(watchedSymbols[0]);
    }
  }, [watchedSymbols, newsSymbol]);

  const RANGES = [
    { value: '1d',  label: '1D' },
    { value: '5d',  label: '5D' },
    { value: '1mo', label: '1M' },
    { value: '3mo', label: '3M' },
    { value: '1y',  label: '1Y' },
  ];

  const fetchPrices = useCallback(async (isRefresh = false, r = null) => {
    if (watchedSymbols.length === 0) {
      setPrices([]);
      setLoading(false);
      return;
    }
    if (!isRefresh) setLoading(true);
    try {
      const res = await getMarketPrices(watchedSymbols, r || range);
      setPrices(res.data || []);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('❌ Market prices:', err);
    } finally {
      setLoading(false);
    }
  }, [range, watchedSymbols]);

  const handleRangeChange = (newRange) => {
    setRange(newRange);
    setPrices([]); // clear to show skeleton
    if (watchedSymbols.length === 0) return;
    setLoading(true);
    getMarketPrices(watchedSymbols, newRange).then(res => {
      setPrices(res.data || []);
      setLastRefresh(new Date());
    }).catch(console.error).finally(() => setLoading(false));
  };

  const handleFollowSymbol = (sym) => {
    const upperSym = sym.toUpperCase();
    if (watchedSymbols.includes(upperSym)) return;
    if (watchedSymbols.length >= 50) {
      setSnackbarMsg('You can only follow up to 50 assets.');
      setSnackbarOpen(true);
      return;
    }
    const updated = [...watchedSymbols, upperSym];
    setWatchedSymbols(updated);
    localStorage.setItem('watchedAssets', JSON.stringify(updated));
    setSnackbarMsg(`Added ${upperSym} to watchlist`);
    setSnackbarOpen(true);
  };

  const handleUnfollowSymbol = (sym) => {
    const upperSym = sym.toUpperCase();
    const updated = watchedSymbols.filter(s => s !== upperSym);
    setWatchedSymbols(updated);
    localStorage.setItem('watchedAssets', JSON.stringify(updated));
    setSnackbarMsg(`Removed ${upperSym} from watchlist`);
    setSnackbarOpen(true);
  };

  const handleRestoreDefaults = () => {
    setWatchedSymbols(INITIAL_SYMBOLS);
    localStorage.setItem('watchedAssets', JSON.stringify(INITIAL_SYMBOLS));
    setSnackbarMsg('Watchlist defaults restored');
    setSnackbarOpen(true);
  };

  const loadMarketPlacePrices = useCallback(async () => {
    const allSyms = REFERENCE_ASSETS.map(a => a.symbol);
    setMarketPlaceLoading(true);
    try {
      const res = await getMarketPrices(allSyms, '1d', true);
      setMarketPlacePrices(res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setMarketPlaceLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 2) {
      loadMarketPlacePrices();
    }
  }, [activeTab, loadMarketPlacePrices]);

  const handleSearch = async () => {
    const query = searchQuery.trim().toUpperCase();
    if (!query) return;
    setSearchLoading(true);
    setSearchError('');
    setSearchResult(null);
    try {
      const res = await getMarketPrices([query], '1d', true);
      const item = res.data?.[0];
      if (!item || item.error) {
        setSearchError(item?.error || `Asset "${searchQuery}" not found`);
      } else {
        setSearchResult(item);
      }
    } catch (e) {
      setSearchError('Connection error searching asset');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResult(null);
    setSearchError('');
  };

  useEffect(() => {
    document.title = 'Market Watch | OpLotus';
    if (activeTab === 0) {
      fetchPrices();
    } else if (activeTab === 2) {
      loadMarketPlacePrices();
    }
    const interval = setInterval(() => {
      if (activeTab === 0) {
        fetchPrices(true);
      } else if (activeTab === 2) {
        loadMarketPlacePrices();
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [activeTab, fetchPrices, loadMarketPlacePrices]);

  return (
    <Grid container rowSpacing={4.5} columnSpacing={2.75}>
      <Grid size={12}>
        <MainCard
          title="Giá thị trường realtime"
          secondary={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              {/* Range selector */}
              {activeTab === 0 && (
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  {RANGES.map(r => (
                    <Button key={r.value} size="small" onClick={() => handleRangeChange(r.value)}
                      variant={range === r.value ? 'contained' : 'outlined'}
                      sx={{ minWidth: 36, px: 1, py: 0.3, fontSize: '0.7rem', fontWeight: 600,
                        borderRadius: 1.5, textTransform: 'none',
                        ...(range === r.value
                          ? { bgcolor: '#2E3D52', color: '#fff', '&:hover': { bgcolor: '#1E2D40' } }
                          : { borderColor: 'divider', color: 'text.secondary', '&:hover': { borderColor: '#2E3D52' } })
                      }}>
                      {r.label}
                    </Button>
                  ))}
                </Box>
              )}
              {activeTab === 0 && lastRefresh && (
                <Typography variant="caption" color="text.secondary">
                  {lastRefresh.toLocaleTimeString('vi-VN')}
                </Typography>
              )}
              {activeTab === 0 && (
                <Tooltip title="Refresh">
                  <IconButton size="small" onClick={() => fetchPrices(false)} disabled={loading}>
                    <ReloadOutlined spin={loading} />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          }
        >
          {/* Tabs header */}
          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
            <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ minHeight: 36,
              '& .MuiTab-root': { minHeight: 36, fontSize: '0.78rem', textTransform: 'none', py: 0.5 } }}>
              <Tab label="Assets" />
              <Tab label="News" />
              <Tab label="Market Place" />
            </Tabs>
          </Box>

          {/* Tab 0: Market Prices */}
          {activeTab === 0 && (
            watchedSymbols.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 8 }}>
                <Typography variant="body1" color="text.secondary" sx={{ mb: 1 }}>
                  Không có tài sản nào đang được theo dõi
                </Typography>
                <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 2 }}>
                  Vui lòng chuyển sang tab Market Place để theo dõi tài sản mới.
                </Typography>
                <Button size="small" variant="contained" onClick={() => setActiveTab(2)} sx={{ textTransform: 'none' }}>
                  Đi tới Market Place
                </Button>
              </Box>
            ) : (
              <Box>
                {/* ── Top Growth Spotlight Chart ── */}
                {(() => {
                  const topGainer = getTopGainer();
                  const currentSymbol = spotlightSymbol || topGainer?.symbol || watchedSymbols[0];
                  if (!currentSymbol) return null;
                  
                  const priceItem = prices.find(p => p.symbol === currentSymbol) || marketPlacePrices.find(p => p.symbol === currentSymbol);
                  const changeVal = priceItem?.changePct;
                  const isUp = changeVal > 0;
                  const isDown = changeVal < 0;
                  const chipColor = isUp ? 'success' : isDown ? 'error' : 'default';
                  const assetName = REFERENCE_ASSETS.find(a => a.symbol === currentSymbol)?.name || SYMBOL_META[currentSymbol]?.name || currentSymbol;
                  const isSpotlightTopGainer = !spotlightSymbol && topGainer && topGainer.symbol === currentSymbol;
                  
                  return (
                    <Box sx={{ mb: 4.5 }}>
                      {/* Watchlist switcher buttons */}
                      <Box sx={{ display: 'flex', gap: 0.8, flexWrap: 'wrap', mb: 2, alignItems: 'center' }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', color: 'text.secondary', mr: 0.5 }}>
                          Quick View Chart:
                        </Typography>
                        {watchedSymbols.map(s => {
                          const isSelected = currentSymbol === s;
                          const nameLabel = SYMBOL_META[s]?.abbr || s;
                          return (
                            <Box key={s} onClick={() => setSpotlightSymbol(s)}
                              sx={{
                                px: 1.2, py: 0.4, borderRadius: 1.5, cursor: 'pointer', fontSize: '0.68rem', fontWeight: 700,
                                bgcolor: isSelected ? '#2E3D52' : (isDarkMode ? 'action.hover' : 'grey.100'),
                                color: isSelected ? '#fff' : 'text.secondary',
                                border: '1px solid',
                                borderColor: isSelected ? '#2E3D52' : 'divider',
                                transition: 'all 0.15s',
                                '&:hover': { borderColor: '#2E3D52', color: isSelected ? '#fff' : 'primary.main' }
                              }}>
                              {nameLabel}
                            </Box>
                          );
                        })}
                        {spotlightSymbol && (
                          <Button size="small" variant="text" onClick={() => setSpotlightSymbol(null)}
                            sx={{ fontSize: '0.62rem', textTransform: 'none', color: 'text.secondary', ml: 'auto', p: 0 }}>
                            Reset to Top Gainer
                          </Button>
                        )}
                      </Box>

                      {/* Header with info */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 1.5 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.primary', display: 'flex', alignItems: 'center', gap: 0.8 }}>
                          {isSpotlightTopGainer ? '🔥 Top Growth Today:' : '📊 Chart:'} {assetName} ({currentSymbol})
                        </Typography>
                        {changeVal != null && (
                          <Chip
                            label={`${changeVal > 0 ? '+' : ''}${changeVal}%`}
                            color={chipColor}
                            size="small"
                            sx={{ fontWeight: 700, fontSize: '0.72rem', height: 20 }}
                          />
                        )}
                      </Box>
                      
                      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
                        <CandlestickPanel
                          symbol={currentSymbol}
                          isDarkMode={isDarkMode}
                          fmtFn={fmt}
                        />
                      </Box>
                    </Box>
                  );
                })()}

                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
                  {loading && prices.length === 0
                    ? watchedSymbols.map(s => <PriceCard key={s} loading />)
                    : watchedSymbols.map(s => {
                        const item = prices.find(p => p.symbol === s) || { symbol: s, error: 'No data' };
                        return <PriceCard key={s} item={item} tables={tables} onUnfollow={handleUnfollowSymbol} />;
                      })
                  }
                </Box>
              </Box>
            )
          )}

          {/* Tab 1: News */}
          {activeTab === 1 && (
            <Box>
              {watchedSymbols.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 8 }}>
                  <Typography variant="body1" color="text.secondary">
                    Vui lòng theo dõi ít nhất một tài sản để xem tin tức liên quan.
                  </Typography>
                </Box>
              ) : (
                <>
                  {/* Symbol selector */}
                  <Box sx={{ display: 'flex', gap: 0.8, flexWrap: 'wrap', mb: 2.5, alignItems: 'center' }}>
                    {watchedSymbols.map(s => (
                      <Box key={s} onClick={() => { setNewsSymbol(s); }}
                        sx={{ px: 1.4, py: 0.5, borderRadius: 2, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700,
                          letterSpacing: 0.5,
                          bgcolor: newsSymbol === s ? '#2E3D52' : (isDarkMode ? 'action.hover' : 'grey.100'),
                          color:   newsSymbol === s ? '#fff' : 'text.secondary',
                          boxShadow: newsSymbol === s ? '0 2px 8px rgba(46,61,82,0.3)' : 'none',
                          transition: 'all 0.15s',
                          '&:hover': { bgcolor: newsSymbol === s ? '#1E2D40' : (isDarkMode ? 'divider' : 'grey.200') } }}>
                        {SYMBOL_META[s]?.abbr || s}
                      </Box>
                    ))}
                    <IconButton size="small" onClick={() => loadNews(newsSymbol)} disabled={newsLoading}
                      sx={{ border: '1px solid', borderColor: 'divider' }}>
                      <ReloadOutlined spin={newsLoading} style={{ fontSize: 14 }} />
                    </IconButton>
                    <Tooltip title={`Phân tích tin tức ${SYMBOL_META[newsSymbol]?.name || newsSymbol} với AI`}>
                      <Button
                        size="small"
                        startIcon={<RobotOutlined style={{ fontSize: 13 }} />}
                        disabled={newsLoading || newsItems.length === 0}
                        onClick={() => {
                          const msg = `Hãy tóm tắt và phân tích các tin tức mới nhất về ${newsSymbol} (${SYMBOL_META[newsSymbol]?.name || newsSymbol}). Đưa ra nhận xét về xu hướng thị trường và tác động tiềm năng đến giá.`;
                          window.dispatchEvent(new CustomEvent('chatbot:prompt', { detail: { message: msg } }));
                        }}
                        sx={{
                          ml: 'auto', fontSize: '0.7rem', textTransform: 'none', fontWeight: 600,
                          px: 1.4, py: 0.5, borderRadius: 2,
                          bgcolor: '#2E3D52', color: '#fff',
                          '&:hover': { bgcolor: '#1E2D40' },
                          '&.Mui-disabled': { bgcolor: isDarkMode ? 'action.disabledBackground' : 'grey.200', color: isDarkMode ? 'action.disabled' : 'grey.400' },
                        }}
                      >
                        Phân tích với AI
                      </Button>
                    </Tooltip>
                  </Box>

                  {newsLoading ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      {[...Array(5)].map((_, i) => (
                        <Box key={i} sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                          <Skeleton width="80%" height={18} />
                          <Skeleton width="40%" height={14} sx={{ mt: 0.8 }} />
                        </Box>
                      ))}
                    </Box>
                  ) : newsItems.length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 6 }}>
                      <Typography variant="body2" color="text.secondary">Không có tin tức cho {newsSymbol}</Typography>
                    </Box>
                  ) : (() => {
                    const totalPages = Math.ceil(newsItems.length / NEWS_PER_PAGE);
                    const paged = newsItems.slice((newsPage - 1) * NEWS_PER_PAGE, newsPage * NEWS_PER_PAGE);
                    return (
                      <>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                          {paged.map((item, i) => {
                            const globalIdx = (newsPage - 1) * NEWS_PER_PAGE + i;
                            const isHot = globalIdx < 5;
                            return (
                            <Box key={i} sx={{
                              p: 1.5, borderRadius: 2,
                              border: '1px solid', borderColor: 'divider',
                              transition: 'all 0.15s',
                              '&:hover': { bgcolor: isDarkMode ? 'action.hover' : 'grey.50', borderColor: isDarkMode ? 'primary.main' : '#2E3D52', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }
                            }}>
                              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                                <Link href={item.url} target="_blank" rel="noopener noreferrer" underline="none"
                                  sx={{ flex: 1, fontSize: '0.83rem', fontWeight: 600, color: 'text.primary', display: 'block', mb: 0.5,
                                    lineHeight: 1.4, '&:hover': { color: isDarkMode ? 'primary.main' : '#2E3D52' } }}>
                                  {item.title}
                                </Link>
                                <Tooltip title="Phân tích bài này với AI">
                                  <IconButton size="small" onClick={() => {
                                    const msg = `Phân tích bài báo này và đưa ra nhận xét về tác động đến thị trường:\n\nTiêu đề: "${item.title}"\nNguồn: ${item.source}\nURL: ${item.url}`;
                                    window.dispatchEvent(new CustomEvent('chatbot:prompt', { detail: { message: msg } }));
                                  }} sx={{
                                    flexShrink: 0, mt: -0.3,
                                    color: isDarkMode ? 'primary.main' : '#2E3D52', border: '1.5px solid', borderColor: isDarkMode ? 'primary.main' : '#2E3D52',
                                    bgcolor: isDarkMode ? 'rgba(24, 144, 255, 0.08)' : 'rgba(46,61,82,0.08)',
                                    width: 28, height: 28, borderRadius: 1,
                                    '&:hover': { bgcolor: isDarkMode ? 'primary.main' : '#2E3D52', color: '#fff' }
                                  }}>
                                    <RobotOutlined style={{ fontSize: 13 }} />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                                <Chip label={item.source} size="small"
                                  sx={{ height: 18, fontSize: '0.6rem', bgcolor: isDarkMode ? 'action.hover' : 'grey.100', color: 'text.secondary',
                                    '& .MuiChip-label': { px: 0.8 } }} />
                                <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.62rem' }}>
                                  {item.ago}
                                </Typography>
                                {item.dateStr && (
                                  <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.62rem' }}>
                                    · {item.dateStr}
                                  </Typography>
                                )}
                                {isHot && (
                                  <Box sx={{
                                    ml: 'auto', flexShrink: 0,
                                    fontSize: '0.6rem', fontWeight: 800, color: '#ff4444',
                                    animation: 'hotPulse 1.5s ease-in-out infinite',
                                    '@keyframes hotPulse': {
                                      '0%, 100%': { opacity: 1 },
                                      '50%': { opacity: 0.3 },
                                    },
                                  }}>
                                    🔥 HOT
                                  </Box>
                                )}
                              </Box>
                            </Box>
                            );
                          })}
                        </Box>

                        {totalPages > 1 && (
                          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2.5 }}>
                            <Pagination
                              count={totalPages} page={newsPage}
                              onChange={(_, v) => setNewsPage(v)}
                              size="small" color="primary"
                              sx={{ '& .MuiPaginationItem-root': { fontSize: '0.72rem' } }}
                            />
                          </Box>
                        )}

                        <Typography variant="caption" color="text.disabled"
                          sx={{ display: 'block', textAlign: 'right', mt: 1, fontSize: '0.62rem' }}>
                          {newsItems.length} tin · trang {newsPage}/{totalPages} · cache 15 phút
                        </Typography>
                      </>
                    );
                  })()}
                </>
              )}
            </Box>
          )}

          {/* Tab 2: Market Place */}
          {activeTab === 2 && (() => {
            const filteredAssets = REFERENCE_ASSETS.filter(a => {
              if (selectedCategory === 'All') return true;
              if (selectedCategory === 'Watchlist') return watchedSymbols.includes(a.symbol);
              return a.category === selectedCategory;
            });

            const sortedAssets = [...filteredAssets].sort((a, b) => {
              const aWatched = watchedSymbols.includes(a.symbol);
              const bWatched = watchedSymbols.includes(b.symbol);
              if (aWatched && !bWatched) return -1;
              if (!aWatched && bWatched) return 1;
              return 0;
            });

            const displayAssets = [...sortedAssets];
            if (searchResult && !displayAssets.some(a => a.symbol === searchResult.symbol)) {
              displayAssets.unshift({
                symbol: searchResult.symbol,
                name: SYMBOL_META[searchResult.symbol]?.name || searchResult.symbol,
                category: 'Search Result',
                ticker: searchResult.ticker,
                vol: 'N/A',
                cap: 'N/A',
                isSearchResult: true
              });
            }

            return (
              <Box>
                {/* Title */}
                <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.9rem', mb: 2 }}>
                  REFERENCE ASSETS ({displayAssets.length} assets)
                </Typography>

                {/* Toolbar Row */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
                  {/* Left: Universal Search Bar */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: { xs: '100%', md: '480px' } }}>
                    <OutlinedInput
                      fullWidth
                      size="small"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      placeholder="Yahoo Ticker to follow... (e.g. AAPL, TSLA)"
                      sx={{
                        bgcolor: isDarkMode ? 'background.default' : 'background.paper',
                        fontSize: '0.78rem',
                        borderRadius: 1.5,
                        height: 36,
                        '& .MuiOutlinedInput-input': {
                          py: '8px'
                        }
                      }}
                    />
                    <Button
                      variant="contained"
                      onClick={handleSearch}
                      disabled={searchLoading}
                      startIcon={searchLoading ? <ReloadOutlined spin /> : <SearchOutlined />}
                      sx={{
                        textTransform: 'none',
                        px: 2.5,
                        height: 36,
                        borderRadius: 1.5,
                        whiteSpace: 'nowrap',
                        bgcolor: '#2E3D52',
                        color: '#fff',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        boxShadow: 'none',
                        '&:hover': { bgcolor: '#1E2D40' }
                      }}
                    >
                      Search & Add
                    </Button>
                    {searchResult && (
                      <Button
                        variant="outlined"
                        color="secondary"
                        onClick={handleClearSearch}
                        sx={{ textTransform: 'none', height: 36, borderRadius: 1.5, whiteSpace: 'nowrap', fontSize: '0.72rem', px: 1.5 }}
                      >
                        Clear
                      </Button>
                    )}
                  </Box>

                  {/* Right: Category Filters */}
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                    {MARKET_CATEGORIES.map((cat) => (
                      <Button
                        key={cat.value}
                        size="small"
                        variant={selectedCategory === cat.value ? 'contained' : 'outlined'}
                        onClick={() => setSelectedCategory(cat.value)}
                        sx={{
                          fontSize: '0.68rem',
                          textTransform: 'none',
                          height: 32,
                          px: 1.2,
                          borderRadius: 1.5,
                          fontWeight: selectedCategory === cat.value ? 700 : 500,
                          ...(selectedCategory === cat.value
                            ? { bgcolor: '#2E3D52', color: '#fff', '&:hover': { bgcolor: '#1E2D40' } }
                            : { borderColor: 'divider', color: 'text.secondary', '&:hover': { borderColor: '#2E3D52' } })
                        }}
                      >
                        {cat.value === 'Watchlist' ? `${cat.label} (${watchedSymbols.length})` : cat.label}
                      </Button>
                    ))}
                  </Box>
                </Box>
                
                {searchError && (
                  <Typography variant="caption" color="error.main" sx={{ display: 'block', mt: -2.5, mb: 2, fontWeight: 500 }}>
                    {searchError}
                  </Typography>
                )}

                {/* Part 2: Main Asset Reference Table */}
                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', border: '1px solid', borderColor: 'divider', bgcolor: 'transparent' }}>
                  <Table sx={{ minWidth: 800 }}>
                    <TableHead>
                      <TableRow sx={{ backgroundColor: isDarkMode ? '#1a2230' : '#fafafa' }}>
                        <TableCell align="center" sx={{ width: 50, fontWeight: 700, fontSize: '0.72rem', py: 1.2, color: 'text.secondary' }}>#</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', py: 1.2, color: 'text.secondary' }}>Asset Name</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', py: 1.2, color: 'text.secondary' }}>Yahoo Ticker</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', py: 1.2, color: 'text.secondary' }}>Category</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', py: 1.2, color: 'text.secondary' }}>Last Price</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', py: 1.2, color: 'text.secondary' }}>Chg (24h)</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', py: 1.2, color: 'text.secondary' }}>52W Range</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', py: 1.2, color: 'text.secondary' }}>Vol (24h)</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', py: 1.2, color: 'text.secondary', width: 90 }}>Trend</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.72rem', py: 1.2, color: 'text.secondary', width: 110 }}>Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {displayAssets.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} align="center" sx={{ py: 6 }}>
                            <Typography variant="body2" color="text.secondary">
                              No assets found in this category
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ) : (
                        displayAssets.map((asset, index) => {
                          const priceItem = asset.isSearchResult ? searchResult : marketPlacePrices.find(p => p.symbol === asset.symbol);
                          const isFollowed = watchedSymbols.includes(asset.symbol);
                          const isUp = (priceItem?.changePct ?? 0) > 0;
                          const isDown = (priceItem?.changePct ?? 0) < 0;
                          const color = isUp ? '#26a69a' : isDown ? '#ef5350' : '#a0aec0';
                          const spark = priceItem?.sparkline?.length > 1 ? priceItem.sparkline : null;

                          return (
                            <>
                            <TableRow key={asset.symbol} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                              <TableCell align="center" sx={{ py: 1.2, fontSize: '0.72rem', color: 'text.secondary' }}>{index + 1}</TableCell>
                              <TableCell sx={{ py: 1.2, fontSize: '0.75rem', fontWeight: 700, color: 'text.primary' }}>
                                {asset.name}
                                {asset.isSearchResult && (
                                  <Chip label="Result" size="small" color="primary" variant="outlined" sx={{ ml: 1, height: 16, fontSize: '0.55rem', fontWeight: 600 }} />
                                )}
                              </TableCell>
                              <TableCell sx={{ py: 1.2, fontSize: '0.72rem', fontFamily: 'monospace', color: 'text.secondary' }}>{asset.ticker}</TableCell>
                              <TableCell sx={{ py: 1.2 }}>
                                <Chip label={asset.category} size="small" sx={{ fontSize: '0.6rem', height: 18, fontWeight: 500 }} />
                              </TableCell>
                              <TableCell sx={{ py: 1.2, fontSize: '0.75rem', fontWeight: 700, color: 'text.primary' }}>
                                {priceItem ? fmt(priceItem.price, asset.symbol) : <Skeleton width={50} />}
                              </TableCell>
                              <TableCell sx={{ py: 1.2, fontSize: '0.75rem', fontWeight: 700, color }}>
                                {priceItem ? (
                                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.3 }}>
                                    {isUp ? '▲' : isDown ? '▼' : ''}
                                    {priceItem.changePct != null ? `${priceItem.changePct > 0 ? '+' : ''}${priceItem.changePct}%` : '—'}
                                  </Box>
                                ) : (
                                  <Skeleton width={40} />
                                )}
                              </TableCell>
                              <TableCell sx={{ py: 1.2, fontSize: '0.68rem', lineHeight: 1.2 }}>
                                {priceItem?.high52 != null && priceItem?.low52 != null ? (
                                  <Box>
                                    <Box sx={{ color: '#26a69a', display: 'flex', alignItems: 'center', gap: 0.3 }}>▲ {fmt(priceItem.high52, asset.symbol)}</Box>
                                    <Box sx={{ color: '#ef5350', display: 'flex', alignItems: 'center', gap: 0.3 }}>▼ {fmt(priceItem.low52, asset.symbol)}</Box>
                                  </Box>
                                ) : (
                                  '—'
                                )}
                              </TableCell>
                              <TableCell sx={{ py: 1.2, fontSize: '0.72rem', color: 'text.primary' }}>{asset.vol}</TableCell>
                              <TableCell sx={{ py: 1.2 }}>
                                {spark ? (
                                  (() => {
                                    const gradId = `table-grad-${asset.symbol}`;
                                    return (
                                      <Box sx={{ width: 100, height: 32 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                          <AreaChart data={spark} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
                                            <defs>
                                              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={color} stopOpacity={0.2} />
                                                <stop offset="95%" stopColor={color} stopOpacity={0} />
                                              </linearGradient>
                                            </defs>
                                            <YAxis domain={['auto', 'auto']} hide />
                                            <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#${gradId})`} dot={false} isAnimationActive={false} />
                                          </AreaChart>
                                        </ResponsiveContainer>
                                      </Box>
                                    );
                                  })()
                                ) : (
                                  <Typography variant="caption" color="text.disabled">—</Typography>
                                )}
                              </TableCell>
                              <TableCell align="center" sx={{ py: 1.2 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                                  <Tooltip title={isFollowed ? 'Unfollow' : 'Follow'}>
                                    <IconButton
                                      size="small"
                                      onClick={() => isFollowed ? handleUnfollowSymbol(asset.symbol) : handleFollowSymbol(asset.symbol)}
                                      sx={{ color: isFollowed ? '#ffc107' : 'text.disabled', p: '4px' }}
                                    >
                                      {isFollowed ? <StarFilled style={{ fontSize: 14 }} /> : <StarOutlined style={{ fontSize: 14 }} />}
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="View News">
                                    <IconButton
                                      size="small"
                                      onClick={() => {
                                        setNewsSymbol(asset.symbol);
                                        setActiveTab(1); // Switch to News tab
                                      }}
                                      sx={{ color: 'primary.main', p: '4px' }}
                                    >
                                      <FileTextOutlined style={{ fontSize: 14 }} />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title={expandedCandle === asset.symbol ? 'Close Chart' : 'Candlestick Chart'}>
                                    <IconButton
                                      size="small"
                                      onClick={() => handleToggleCandle(asset.symbol)}
                                      sx={{
                                        p: '6px',
                                        bgcolor: 'transparent',
                                        borderRadius: 1.5,
                                        transition: 'all 0.15s',
                                        '&:hover': {
                                          bgcolor: isDarkMode ? 'rgba(38,166,154,0.12)' : 'rgba(38,166,154,0.06)',
                                        }
                                      }}
                                    >
                                      {/* Simple Green Caret Arrow (Triangle) */}
                                      {expandedCandle === asset.symbol ? (
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="#26a69a" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
                                          <path d="M12 7L20 15H4L12 7Z" />
                                        </svg>
                                      ) : (
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="#26a69a" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
                                          <path d="M12 17L4 9H20L12 17Z" />
                                        </svg>
                                      )}
                                    </IconButton>
                                  </Tooltip>
                                </Box>
                              </TableCell>
                            </TableRow>
                            {/* Inline candlestick chart row */}
                            <TableRow key={`${asset.symbol}-candle`}>
                              <TableCell colSpan={10} sx={{ p: 0, border: expandedCandle === asset.symbol ? undefined : 'none' }}>
                                <Collapse in={expandedCandle === asset.symbol} unmountOnExit timeout={200}>
                                  <CandlestickPanel
                                    symbol={asset.symbol}
                                    isDarkMode={isDarkMode}
                                    fmtFn={fmt}
                                  />
                                </Collapse>
                              </TableCell>
                            </TableRow>
                            </>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            );
          })()}

          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 3, textAlign: 'right' }}>
            Nguồn: Yahoo Finance · Google News · Tự động refresh mỗi 60 giây
          </Typography>
        </MainCard>
      </Grid>

      {/* Global Snackbar for updates */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setSnackbarOpen(false)} severity="success" sx={{ width: '100%' }}>
          {snackbarMsg}
        </Alert>
      </Snackbar>
    </Grid>
  );
}
