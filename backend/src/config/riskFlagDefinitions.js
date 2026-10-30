const formatNumber = (value, digits = 2) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric.toFixed(digits).replace(/\.0+$/, '').replace(/(\.[0-9]*?)0+$/, '$1');
};

const formatSignedNumber = (value, digits = 2) => {
  const formatted = formatNumber(value, digits);
  if (formatted == null) return null;
  return Number(value) > 0 ? `+${formatted}` : formatted;
};

const formatPercent = (value, digits = 1) => {
  const formatted = formatNumber(value, digits);
  return formatted == null ? null : `${formatted}%`;
};

const formatCurrency = (value, digits = 1) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const sign = numeric < 0 ? '-' : '';
  const abs = Math.abs(numeric);
  if (abs >= 1000) {
    const scaled = abs / 1000;
    return `${sign}$${scaled.toFixed(digits).replace(/\.0+$/, '').replace(/(\.[0-9]*?)0+$/, '$1')}k`;
  }
  return `${sign}$${abs.toFixed(digits).replace(/\.0+$/, '').replace(/(\.[0-9]*?)0+$/, '$1')}`;
};

const isMetricBelow = (value, threshold) => {
  if (value === null || value === undefined || value === '') return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric < threshold;
};

const inactiveTest = () => false;

// Canonical business IDs. sourceColumn is the SQL boolean column that
// evaluates the rule; it deliberately removes any dependency on array order.
const HARD_FLAG_DEFS = [
  { id: '1', sourceColumn: 'f1', key: 'expectedPayoffNonPositive', title: 'Expected Payoff <= 0' },
  { id: '2', sourceColumn: 'f2', key: 'profitFactorLow', title: 'Profit Factor < 1.2' },
  { id: '3', sourceColumn: 'f3', key: 'recoveryFactorLow', title: 'Recovery Factor < 1.0' },
  { id: '4', sourceColumn: 'f4', key: 'pdRatioLow', title: 'P/D Ratio < 1.0' },
  { id: '5', sourceColumn: 'f5', key: 'martingaleTripleFlag', title: 'Martingale Triple Flag' },
  { id: '6', sourceColumn: 'f6', key: 'highEotRatio', title: 'End Of Test Ratio > 10%' },
  { id: '7', sourceColumn: 'f8', key: 'largestLossToNetProfitRatioHigh', title: 'Largest Loss / Net Profit >= 70%' },
  { id: '8', sourceColumn: 'f7', key: 'recentDecayNegative', title: 'Recent 12M Profit Negative' }
];

const SOFT_FLAG_DEFS = [
  {
    id: '9', groupId: 'G4', penalty: 5, diagnosticCode: 'LARGE_LOSS', active: true,
    title: 'Largest Loss Trade ≥ $30K',
    description: 'Lệnh thua lớn nhất có giá trị tuyệt đối từ $30K trở lên.',
    info: 'Cảnh báo rủi ro đuôi lớn có thể xóa đáng kể lợi nhuận tích lũy.',
    test: (r) => Math.abs(Number(r.largest_loss_trade || 0)) >= 30000,
    formatViolation: (r) => `Loss ${formatCurrency(Math.abs(Number(r.largest_loss_trade || 0)), 1) ?? 'n/a'}`
  },
  {
    id: '10', groupId: 'G4', penalty: 5, diagnosticCode: 'LOW_SAMPLE', active: true,
    title: 'Low sample (<150 trades) with positive EP',
    description: 'Số lượng giao dịch dưới 150 nên độ tin cậy thống kê còn thấp.',
    info: 'Expected Payoff dương nhưng mẫu giao dịch nhỏ chưa đủ xác nhận edge ổn định.',
    test: (r) => Number(r.total_trades || 0) < 150 && Number(r.expected_payoff || 0) > 0,
    formatViolation: (r) => `Trades ${formatNumber(r.total_trades, 0) ?? 'n/a'} · EP ${formatSignedNumber(r.expected_payoff, 2) ?? 'n/a'}`
  },
  {
    id: '11', groupId: 'G4', penalty: 5, diagnosticCode: 'LOW_LR_CORRELATION', active: true,
    title: 'LR Correlation < 0.8',
    description: 'Đường tăng trưởng vốn có độ tuyến tính thấp.',
    info: 'LR Correlation thấp phản ánh equity curve thiếu ổn định.',
    test: (r) => isMetricBelow(r.lr_correlation, 0.8),
    formatViolation: (r) => `Corr ${formatNumber(r.lr_correlation, 2) ?? 'n/a'}`
  },
  {
    id: '12', groupId: 'G4', penalty: 10, diagnosticCode: 'LOW_SHARPE', active: true,
    title: 'Sharpe Ratio < 0.5',
    description: 'Lợi nhuận điều chỉnh theo rủi ro ở mức thấp.',
    info: 'Sharpe dưới 0.5 cho thấy hiệu quả lợi nhuận so với biến động chưa tốt.',
    test: (r) => isMetricBelow(r.sharpe_ratio, 0.5),
    formatViolation: (r) => `Sharpe ${formatNumber(r.sharpe_ratio, 2) ?? 'n/a'}`
  },
  {
    id: '13', groupId: 'G5', penalty: 0, diagnosticCode: 'SEASONAL_DEPENDENCY', active: false,
    title: 'Seasonal dependency', description: 'Chưa kích hoạt: chưa có dữ liệu tính seasonality.',
    info: 'Flag được giữ ID để tương thích nhưng không đánh giá hoặc trừ điểm.',
    test: inactiveTest, formatViolation: () => 'Not evaluated'
  },
  {
    id: '14', groupId: 'G5', penalty: 0, diagnosticCode: 'PERFORMANCE_DECAY', active: false,
    title: 'Performance decay', description: 'Chưa kích hoạt: chưa có dữ liệu so sánh hai nửa kỳ backtest.',
    info: 'Flag được giữ ID để tương thích nhưng không đánh giá hoặc trừ điểm.',
    test: inactiveTest, formatViolation: () => 'Not evaluated'
  },
  {
    id: '15', groupId: 'G5', penalty: 0, diagnosticCode: 'HIDDEN_DRAWDOWN_DURATION', active: false,
    title: 'Hidden drawdown duration', description: 'Chưa kích hoạt: chưa có dữ liệu drawdown duration.',
    info: 'Flag được giữ ID để tương thích nhưng không đánh giá hoặc trừ điểm.',
    test: inactiveTest, formatViolation: () => 'Not evaluated'
  },
  {
    id: '16', groupId: 'G6', penalty: 10, diagnosticCode: 'PF_DD_TRAP', active: true,
    title: 'PF ≥ 2 with DD ≥ 12%',
    description: 'Profit Factor cao nhưng Drawdown đồng thời ở mức lớn.',
    info: 'Thông số lợi nhuận đẹp có thể che khuất rủi ro sụt giảm vốn.',
    test: (r) => Number(r.profit_factor || 0) >= 2 && Number(r.drawdown_pct || 0) >= 12,
    formatViolation: (r) => `PF ${formatNumber(r.profit_factor, 2) ?? 'n/a'} · DD ${formatPercent(r.drawdown_pct, 1) ?? 'n/a'}`
  },
  {
    id: '17', groupId: 'G6', penalty: 15, diagnosticCode: 'LOSING_STREAK_WARNING', active: true,
    title: 'Long losing streak warning (≥12)',
    description: 'Chuỗi thua liên tiếp từ 12 lệnh trở lên.',
    info: 'Chuỗi thua dài làm tăng rủi ro suy giảm vốn và áp lực vận hành.',
    test: (r) => Number(r.max_consecutive_losses || 0) >= 12,
    formatViolation: (r) => `Loss streak ${formatNumber(r.max_consecutive_losses, 0) ?? 'n/a'}`
  },
  {
    id: '18', groupId: 'G6', penalty: 15, diagnosticCode: 'HIGH_DD_MEDIUM_PF', active: true,
    title: 'DD ≥ 18% with PF 1.2–2.0',
    description: 'Drawdown cao trong khi Profit Factor chỉ ở mức trung bình.',
    info: 'Mức lợi nhuận chưa tương xứng với rủi ro sụt giảm vốn.',
    test: (r) => Number(r.drawdown_pct || 0) >= 18 && Number(r.profit_factor || 0) >= 1.2 && Number(r.profit_factor || 0) < 2,
    formatViolation: (r) => `DD ${formatPercent(r.drawdown_pct, 1) ?? 'n/a'} · PF ${formatNumber(r.profit_factor, 2) ?? 'n/a'}`
  },
  {
    id: '19', groupId: 'G6', penalty: 15, diagnosticCode: 'WINRATE_MASKING_WEAK_PF', active: true,
    title: 'Winrate ≥ 60% masking PF < 1.35',
    description: 'Winrate cao nhưng Profit Factor yếu.',
    info: 'Tỷ lệ thắng cao có thể che giấu tỷ lệ lời/lỗ bất lợi.',
    test: (r) => Number(r.winrate_pct || 0) >= 60 && Number(r.profit_factor || 0) < 1.35,
    formatViolation: (r) => `WR ${formatPercent(r.winrate_pct, 0) ?? 'n/a'} · PF ${formatNumber(r.profit_factor, 2) ?? 'n/a'}`
  },
  {
    id: '20', groupId: 'G7', penalty: 15, diagnosticCode: 'THIN_EXPECTED_PAYOFF', active: true,
    title: 'Expected Payoff between 0 and 100',
    description: 'Expected Payoff dương nhưng quá mỏng.',
    info: 'Biên lợi nhuận trung bình mỗi lệnh có thể không đủ bù chi phí live.',
    test: (r) => Number(r.expected_payoff || 0) > 0 && Number(r.expected_payoff || 0) < 100,
    formatViolation: (r) => `EP ${formatSignedNumber(r.expected_payoff, 2) ?? 'n/a'}`
  },
  {
    id: '21', groupId: 'G7', penalty: 5, diagnosticCode: 'PF_CAUTION', active: true,
    title: 'Profit Factor caution band (1.2–1.35)',
    description: 'Profit Factor nằm trong vùng cảnh báo mỏng.',
    info: 'Profit Factor sát ngưỡng tối thiểu có thể suy giảm khi chạy live.',
    test: (r) => Number(r.profit_factor || 0) >= 1.2 && Number(r.profit_factor || 0) < 1.35,
    formatViolation: (r) => `PF ${formatNumber(r.profit_factor, 2) ?? 'n/a'}`
  },
  {
    id: '22', groupId: 'G7', penalty: 5, diagnosticCode: 'RECOVERY_CAUTION', active: true,
    title: 'Recovery Factor caution band (1.0–1.5)',
    description: 'Recovery Factor nằm trong vùng cảnh báo.',
    info: 'Khả năng phục hồi lợi nhuận so với drawdown còn thấp.',
    test: (r) => Number(r.recovery_factor || 0) >= 1 && Number(r.recovery_factor || 0) < 1.5,
    formatViolation: (r) => `RF ${formatNumber(r.recovery_factor, 2) ?? 'n/a'}`
  },
  {
    id: '23', groupId: 'G8', penalty: 5, diagnosticCode: 'LOW_ACTIVITY', active: true,
    title: 'Low activity (1–129 trades)',
    description: 'Tổng số giao dịch thấp hơn 130.',
    info: 'Tần suất thấp làm giảm độ tin cậy thống kê và hiệu quả sử dụng vốn.',
    test: (r) => Number(r.total_trades || 0) > 0 && Number(r.total_trades || 0) < 130,
    formatViolation: (r) => `Trades ${formatNumber(r.total_trades, 0) ?? 'n/a'}`
  },
  {
    id: '24', groupId: 'G8', penalty: 10, diagnosticCode: 'LOW_WINRATE', active: true,
    title: 'Winrate below 45%',
    description: 'Winrate toàn kỳ thấp hơn 45%.',
    info: 'Tỷ lệ thắng thấp cần được đối chiếu thêm với payoff và Profit Factor.',
    test: (r) => Number(r.winrate_pct || 0) > 0 && Number(r.winrate_pct || 0) < 45,
    formatViolation: (r) => `WR ${formatPercent(r.winrate_pct, 0) ?? 'n/a'}`
  },
  {
    id: '25', groupId: 'G8', penalty: 10, diagnosticCode: 'H4_LOW_ACTIVITY', active: true,
    title: 'H4 strategy with fewer than 160 trades',
    description: 'Chiến lược H4 có mẫu giao dịch dưới 160.',
    info: 'Khung H4 với số lệnh thấp cần thêm dữ liệu để xác nhận độ ổn định.',
    test: (r) => String(r.timeframe || '').toUpperCase() === 'H4' && Number(r.total_trades || 0) < 160,
    formatViolation: (r) => `H4 · Trades ${formatNumber(r.total_trades, 0) ?? 'n/a'}`
  },
  {
    id: '26', groupId: 'G8', penalty: 10, diagnosticCode: 'THIN_EDGE', active: true,
    title: 'Thin Edge (PF < 1.4 & RF < 3.5)',
    description: 'Profit Factor dưới 1.4 đồng thời Recovery Factor dưới 3.5.',
    info: 'Edge mỏng có nguy cơ bị spread và slippage ăn mòn khi chạy live.',
    test: (r) => isMetricBelow(r.profit_factor, 1.4) && isMetricBelow(r.recovery_factor, 3.5),
    formatViolation: (r) => `PF ${formatNumber(r.profit_factor, 2) ?? 'n/a'} · RF ${formatNumber(r.recovery_factor, 2) ?? 'n/a'}`
  },
  {
    id: '27', groupId: 'G8', penalty: 10, diagnosticCode: 'EXTREME_LOSS_STREAK', active: true,
    title: 'Max Consecutive Losses ≥ 20',
    description: 'Chuỗi thua liên tiếp từ 20 lệnh trở lên.',
    info: 'Chuỗi thua cực dài phản ánh rủi ro vận hành nghiêm trọng.',
    test: (r) => Number(r.max_consecutive_losses || 0) >= 20,
    formatViolation: (r) => `Loss streak ${formatNumber(r.max_consecutive_losses, 0) ?? 'n/a'}`
  }
];

const SOFT_FLAG_BY_ID = new Map(SOFT_FLAG_DEFS.map((flag) => [String(flag.id), flag]));

const RISK_FLAG_DEFS = [...HARD_FLAG_DEFS, ...SOFT_FLAG_DEFS];
const canonicalIds = RISK_FLAG_DEFS.map((flag) => Number(flag.id)).sort((a, b) => a - b);
const expectedIds = Array.from({ length: 27 }, (_, index) => index + 1);
if (canonicalIds.length !== expectedIds.length || canonicalIds.some((id, index) => id !== expectedIds[index])) {
  throw new Error(`Risk Flag IDs must be unique and contiguous from 1 to 27; received: ${canonicalIds.join(', ')}`);
}

const getSoftFlagPenalty = (flagId) => SOFT_FLAG_BY_ID.get(String(flagId))?.penalty ?? 10;

module.exports = {
  HARD_FLAG_DEFS,
  SOFT_FLAG_DEFS,
  RISK_FLAG_DEFS,
  getSoftFlagPenalty
};
