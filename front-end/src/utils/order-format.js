export const getTypeColor = (type) => {
  switch (type) {
    case 'buy':
      return 'success';
    case 'sell':
      return 'error';
    default:
      return 'default';
  }
};

export const getDirectionColor = (direction) => {
  switch (direction) {
    case 'in':
      return 'primary';
    case 'out':
      return 'secondary';
    default:
      return 'default';
  }
};

export const formatCurrency = (amount) => {
  if (amount === null || amount === undefined || amount === '') return '$0.00';

  const num = Number(amount);
  if (Number.isNaN(num)) return '$0.00';

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
};

export const formatNumber = (value) => {
  if (value === null || value === undefined || value === '') return '0';

  const num = Number(value);
  if (Number.isNaN(num)) return '0';

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(num);
};

export const formatDate = (dateString) => {
  if (!dateString) return '-';

  // Hiển thị chuẩn theo giờ gốc MT5 / máy chủ sàn (UTC / broker time),
  // tránh bị trình duyệt tự cộng lệch múi giờ local (như GMT+7 VN khiến đơn cuối ngày nhảy sang 12:00 AM ngày hôm sau).
  let s = String(dateString).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s)) {
    s = s.replace(' ', 'T') + 'Z';
  }

  const date = new Date(s);
  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

