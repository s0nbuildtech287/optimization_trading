import { useState, useEffect, useCallback, useRef } from 'react';

// material-ui
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';

// framer-motion
import { motion, AnimatePresence } from 'framer-motion';

// assets
import RiseOutlined from '@ant-design/icons/RiseOutlined';
import FallOutlined from '@ant-design/icons/FallOutlined';
import LineChartOutlined from '@ant-design/icons/LineChartOutlined';

// api
import { getMarketPrices } from 'api/market';

// dayjs
import dayjs from 'dayjs';

const TARGET_SYMBOLS = [
  'BTCUSD',
  'ETHUSD',
  'XAUUSD',
  'XAGUSD',
  'US500',
  'DE30',
  'JP225',
  'HK50',
  'USOIL',
];

const ASSET_NAMES = {
  BTCUSD: 'Bitcoin (BTCUSD)',
  ETHUSD: 'Ethereum (ETHUSD)',
  XAUUSD: 'Vàng (XAUUSD)',
  XAGUSD: 'Bạc (XAGUSD)',
  US500: 'S&P 500 (US500)',
  DE30: 'DAX 30 (DE30)',
  JP225: 'Nikkei 225 (JP225)',
  HK50: 'Hang Seng (HK50)',
  USOIL: 'Dầu thô (USOIL)',
};

function formatPrice(val, symbol) {
  if (val == null || isNaN(val)) return '--';
  if (symbol === 'BTCUSD' || symbol === 'ETHUSD' || symbol === 'XAUUSD') {
    return `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (symbol === 'USOIL' || symbol === 'XAGUSD') {
    return `$${Number(val).toFixed(2)}`;
  }
  return Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildTickerSentence(item, index) {
  const dateStr = dayjs().format('DD/MM/YYYY');
  const name = ASSET_NAMES[item.symbol] || item.symbol;
  const priceStr = formatPrice(item.price, item.symbol);
  const change = item.change ?? 0;
  const changePct = item.changePct ?? 0;
  const isUp = change >= 0;
  const absPct = Math.abs(changePct).toFixed(2);
  const absChange = Math.abs(change).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const templates = [
    (n, p, d, pct, chg, up) =>
      `Hôm nay ${d}: ${n} đang giao dịch ở mức ${p}, ${up ? 'tăng mạnh' : 'giảm'} ${up ? '+' : '-'}${pct}% (${up ? '+' : '-'}$${chg})`,
    (n, p, d, pct, chg, up) =>
      `Cập nhật ngày ${d}: Giá ${n} hiện đạt ${p}, biến động ${up ? 'tăng' : 'giảm'} ${up ? '+' : '-'}${pct}% (${up ? '+' : '-'}$${chg})`,
    (n, p, d, pct, chg, up) =>
      `Thị trường ngày ${d}: ${n} ghi nhận mức giá ${p}, ${up ? 'tăng' : 'giảm'} ${up ? '+' : '-'}${pct}%`,
  ];

  const templateFn = templates[index % templates.length];
  return {
    sentence: templateFn(name, priceStr, dateStr, absPct, absChange, isUp),
    isUp,
    priceStr,
    changePct,
    symbol: item.symbol,
  };
}

export default function MarketTickerHeader() {
  const theme = useTheme();
  const downSM = useMediaQuery(theme.breakpoints.down('sm'));

  // Tuyet doi KHONG HARDCODE: Mac dinh khoi tao mang rong
  const [marketData, setMarketData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const timerRef = useRef(null);

  const fetchPrices = useCallback(async () => {
    try {
      // Goi API backend 100% REAL DATA
      const res = await getMarketPrices(TARGET_SYMBOLS, '1d');
      // Res tu backend co dang { data: [...], updatedAt: "..." }
      const list = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
      const valid = list.filter((item) => item && !item.error && item.price != null);
      if (valid.length) {
        setMarketData(valid);
      }
    } catch (err) {
      console.error('❌ [MARKET TICKER HEADER] Lỗi lấy giá real-time:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrices();
    // Tu dong poll cap nhat gia real-time tu Yahoo Finance / Database moi 60s
    const pollInterval = setInterval(fetchPrices, 60000);
    return () => clearInterval(pollInterval);
  }, [fetchPrices]);

  useEffect(() => {
    if (!marketData.length || isHovered) return;

    timerRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % marketData.length);
    }, 5000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [marketData.length, isHovered]);

  if (downSM) return null;

  if (loading && !marketData.length) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, height: 34 }}>
        <CircularProgress size={14} color="inherit" sx={{ opacity: 0.6 }} />
        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.78rem', fontStyle: 'italic' }}>
          Đang kết nối lấy dữ liệu giá thực tế...
        </Typography>
      </Box>
    );
  }

  if (!marketData.length) return null;

  const currentItem = marketData[currentIndex % marketData.length];
  const info = buildTickerSentence(currentItem, currentIndex);

  const isUp = info.isUp;
  const statusColor = isUp ? theme.palette.success.main : theme.palette.error.main;
  const statusBg = isUp
    ? theme.palette.mode === 'dark'
      ? 'rgba(82, 196, 26, 0.15)'
      : 'rgba(82, 196, 26, 0.1)'
    : theme.palette.mode === 'dark'
      ? 'rgba(255, 77, 79, 0.15)'
      : 'rgba(255, 77, 79, 0.1)';

  return (
    <Box
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{
        width: '100%',
        height: 34,
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
        cursor: 'pointer',
        userSelect: 'none',
        position: 'relative',
        contain: 'paint',
        maskImage: 'linear-gradient(to right, transparent 0%, black 2%, black 98%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 2%, black 98%, transparent 100%)',
      }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={currentIndex}
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '-100%', opacity: 0 }}
          transition={{ duration: 0.7, ease: [0.4, 0.0, 0.2, 1] }}
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            position: 'absolute',
            top: 0,
            left: 0,
            willChange: 'transform, opacity',
            transform: 'translateZ(0)',
          }}
        >
          {/* Badge phan tram tang/giam */}
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.6,
              px: 1,
              py: 0.2,
              borderRadius: '12px',
              bgcolor: statusBg,
              color: statusColor,
              mr: 1.5,
              flexShrink: 0,
            }}
          >
            {isUp ? <RiseOutlined style={{ fontSize: '0.85rem' }} /> : <FallOutlined style={{ fontSize: '0.85rem' }} />}
            <Typography variant="caption" sx={{ fontWeight: 800, fontSize: '0.76rem', color: statusColor }}>
              {isUp ? `+${info.changePct}%` : `${info.changePct}%`}
            </Typography>
          </Box>

          {/* Cau chi no dung tin gia real-time */}
          <Typography
            variant="caption"
            sx={{
              fontSize: '0.82rem',
              fontWeight: 600,
              color: 'text.primary',
              letterSpacing: '0.3px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.6,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            <LineChartOutlined style={{ fontSize: '0.85rem', color: statusColor, flexShrink: 0 }} />
            <Box component="span" sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {info.sentence}
            </Box>
          </Typography>
        </motion.div>
      </AnimatePresence>
    </Box>
  );
}
