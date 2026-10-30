# AGENTS.md — Front-end

## Stack

Vite 7 · React 19 · JavaScript (JSX) · MUI 7 · SWR · Formik + Yup · Recharts · Framer Motion · Ant Design Icons · Day.js

> Template gốc: **Mantis Material Free React** (CodedThemes)

## Phạm vi làm việc

- Chỉ tập trung đúng màn hình, component hoặc hook được nhắc trong task.
- Không lan sang luồng khác nếu không có yêu cầu rõ ràng.
- Giữ nguyên hành vi cũ, chỉ chỉnh đúng phần cần chỉnh.

---

## Tra nhanh

| Cần làm             | File                                                                            |
| ------------------- | ------------------------------------------------------------------------------- |
| Thêm/sửa filter     | `MoreOptionsModal.jsx` (danh sách) + `useStrategy.js` (fetch)                   |
| Tạo UI component    | Kiểm tra `src/components/` trước, đặc biệt `@extended/`, `cards/`, `dashboard/` |
| Gọi API             | `src/api/*.js` — mỗi domain 1 file                                              |
| Thêm API endpoint   | Khai báo URL trong `src/config.js` → `API_ENDPOINTS`                            |
| Thêm global state   | Dùng **hook + localStorage + SWR** (không có Redux/Zustand)                     |
| Format ngày/tiền/số | `src/utils/order-format.js`                                                     |
| Màu theo theme      | `src/utils/getColors.js`                                                        |
| Thêm route          | `src/routes/MainRoutes.jsx` (có auth) hoặc `LoginRoutes.jsx` (public)           |
| Thêm menu item      | `src/menu-items/*.jsx`                                                          |
| Sửa theme/màu/font  | `src/themes/`                                                                   |
| Sửa layout          | `src/layout/Dashboard/`                                                         |

---

## Quy tắc bắt buộc

- **KHÔNG tự chọn màu mới** → chỉ dùng `theme.palette.*`
- **KHÔNG inline style** → dùng MUI `sx` prop
- **KHÔNG fetch API trong component** → tạo trong `src/api/*.js`, gọi qua hook
- **KHÔNG hard-code API URL** → khai báo trong `src/config.js`
- **KHÔNG import MUI icons** → dùng `@ant-design/icons`
- **KHÔNG tạo component nếu đã có** trong `src/components/`
- **KHÔNG tạo filter mới** → thêm vào `MoreOptionsModal.jsx` → `FILTER_OPTIONS`
- **Luôn dùng `Loadable()`** khi lazy import page trong routes
- **Auth token**: `localStorage.getItem('authToken')` → header `Authorization: Bearer <token>`

---

## Nguyên tắc bảo toàn code cũ

> Thêm tính năng mới → PHẢI đảm bảo tất cả chức năng cũ vẫn hoạt động.

1. Đọc toàn bộ file (hoặc function liên quan) trước khi sửa
2. Không đổi tên hàm, thứ tự tham số, kiểu return của hàm có sẵn
3. Giữ nguyên `inputFilters → appliedFilters` pattern trong `strategy-input.jsx`
4. Giữ nguyên hook contracts: `{ fetchXxx, loading, error }`
5. Giữ nguyên localStorage keys: `authToken`, `strategyInputFilters`, `strategyActiveFilters`, `strategyFilterOperators`, `strategyFilterRanges`, `strategyDrawdownUnit`
6. Giữ nguyên event: `window.dispatchEvent(new CustomEvent('chatbot:context', ...))`

**Sau khi sửa, tự kiểm tra:**
Login/Logout · Strategy list (filter + pagination) · Date range filter · Dialog (Settings/Results/Chart) · Sync (sync + async polling) · Balance chart · Cache sau sync/delete · Dashboard · System logs

---

## Hooks có sẵn (`src/hooks/`)

| Hook                       | Return                                                                                                  | Tác dụng                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `useStrategies`            | `{ fetchStrategies, loading, error }`                                                                   | Fetch strategies, phân trang, filter, cache 7 ngày |
| `useStrategiesByTimeRange` | `{ fetchStrategiesByTimeRange, loading, error }`                                                        | Fetch theo date range, không cache                 |
| `useStrategyDetail`        | `{ fetchStrategyDetail, loading, error }`                                                               | Chi tiết 1 strategy + backtest table               |
| `useDistinctSymbols`       | `{ fetchSymbols, loading, error }`                                                                      | Danh sách symbols duy nhất                         |
| `useBalanceChart`          | `{ fetchBalanceChart, loading, error }`                                                                 | Balance chart, cache vĩnh viễn                     |
| `useStrategyStatistics`    | `{ fetchStatistics, loading, error }`                                                                   | Thống kê strategies                                |
| `useDeleteStrategy`        | `{ deleteStrategy, loading, error }`                                                                    | Xóa strategy                                       |
| `clearStrategiesCache`     | `void`                                                                                                  | Xóa in-memory cache (gọi sau sync)                 |
| `useOrderSync`             | `{ sync, syncAsync, cancelSync, syncing, progress, currentFile, stats, error, result }`                 | Sync Google Drive, hỗ trợ polling                  |
| `useOrderList`             | `{ fetchOrderList, loading, error }`                                                                    | Fetch danh sách order/deal                         |
| `useDashboard`             | `{ fetchDashboard, loading, error }`                                                                    | Fetch dữ liệu dashboard                            |
| `useDownloadLog`           | `{ downloadLog, loading, error }`                                                                       | Tải file log                                       |
| `useSystemLogs`            | `{ logs, loading, error, fetchLatestBacktestLogs, fetchTableHistory, fetchAllLogs, handleCleanupLogs }` | Quản lý system logs                                |
| `useActivityLogs`          | `{ logs, loading, error, refetch }`                                                                     | Activity logs của 1 backtest table                 |

---

## Utils có sẵn (`src/utils/`)

| Hàm                            | Tác dụng                            |
| ------------------------------ | ----------------------------------- |
| `formatDate(dateString)`       | "Jan 1, 2025, 02:30 PM"             |
| `formatCurrency(amount)`       | "$1,234.56"                         |
| `formatNumber(value)`          | "1,234.56"                          |
| `getTypeColor(type)`           | MUI color cho buy/sell              |
| `getDirectionColor(direction)` | MUI color cho in/out                |
| `getColors(theme, color)`      | Palette color object                |
| `getShadow(theme, shadow)`     | Custom shadow string                |
| `strengthColor(count)`         | Label + color cho password strength |
| `strengthIndicator(password)`  | Điểm strength 0-5                   |

---

## API modules (`src/api/`)

| File           | Hàm chính                                                                                                                                                                                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Strategy.js`  | `getStrategies`, `getStrategyDetail`, `getDistinctSymbols`, `getStrategyStatistics`, `deleteStrategy`, `getBalanceChart`, `getStrategiesByTimeRange`, `getAllStrategyIds`, `clearServerCache`, `downloadStrategySheet`, `getServiceAccountEmails`, `getStrategyIdsFromFolder`, `getPreferences`, `savePreferences` |
| `order.js`     | `syncOrder`, `syncOrderAsync`, `getSyncStatus`, `getOrderList`, `getOrderTotals`, `downloadLogFile`, `getFilterOptions`, `getBacktestTables`, `createBacktestTable`, `deleteBacktestTable`                                                                                                                         |
| `auth.js`      | `requestOTP`, `register`, `login`                                                                                                                                                                                                                                                                                  |
| `dashboard.js` | `getDashboardData`                                                                                                                                                                                                                                                                                                 |
| `systemLog.js` | `getLatestBacktestLogs`, `getTableLogHistory`, `getAllLogs`, `cleanupOldLogs`, `deleteLogsByTable`, `getActivityLogs`                                                                                                                                                                                              |
| `CheckFile.js` | `checkFilesLocal`, `checkFilesDrive`, `getCheckProgress`                                                                                                                                                                                                                                                           |
| `chat.js`      | `getChatModels`, `sendChatMessage`                                                                                                                                                                                                                                                                                 |
| `market.js`    | `getMarketPrices`, `getSymbolStats`, `getSymbolNews`                                                                                                                                                                                                                                                               |
| `users.js`     | `getUsers`, `createUser`, `updateUser`, `deleteUser`                                                                                                                                                                                                                                                               |

---

## Components có sẵn (`src/components/`)

| Component                | Props chính                                                                               | Ghi chú                    |
| ------------------------ | ----------------------------------------------------------------------------------------- | -------------------------- |
| `MainCard`               | `title, children, border, boxShadow, content, contentSX, divider, secondary, modal, sx`   | Card wrapper chính         |
| `AnimateButton`          | `type, direction, offset, scale, children`                                                | Animation wrapper cho nút  |
| `Avatar`                 | `color, type, size, children, sx`                                                         | Extended MUI Avatar        |
| `Breadcrumbs`            | `navigation, title`                                                                       | Auto-generate từ route     |
| `Dot`                    | `color, size, variant, sx`                                                                | Chấm status                |
| `IconButton`             | `color, variant, shape, children`                                                         | Extended MUI IconButton    |
| `Transitions`            | `type, position, children`                                                                | Animation transitions      |
| `StrategyChartDialog`    | `open, onClose, strategy, loading, dateRange`                                             | Dialog balance chart       |
| `StrategyResultsDialog`  | `open, onClose, strategy, loading, dateRange`                                             | Dialog backtest results    |
| `StrategySettingsDialog` | `open, onClose, strategy, loading`                                                        | Dialog strategy settings   |
| `MoreOptionsModal`       | `open, onClose, onAddFilters, activeFilters, filterOperators, filterRanges, drawdownUnit` | Modal filter nâng cao      |
| `ActivityHistory`        | `logs, loading`                                                                           | Timeline activity logs     |
| `ChatBotWidget`          | (standalone)                                                                              | AI chatbot floating widget |
| `Loadable`               | HOC                                                                                       | Lazy loading với Suspense  |
| `Loader`                 | —                                                                                         | Full-page spinner          |
| `AnalyticEcommerce`      | `title, count, percentage, extra, color`                                                  | KPI card                   |

---

## Design tokens

### Màu (chỉ dùng `theme.palette.*`)

| Token            | Giá trị   | Dùng khi       |
| ---------------- | --------- | -------------- |
| `primary.main`   | blue[5]   | Màu chủ đạo    |
| `error.main`     | red[4]    | Lỗi, nguy hiểm |
| `success.main`   | green[5]  | Thành công     |
| `warning.main`   | gold[5]   | Cảnh báo       |
| `info.main`      | cyan[5]   | Thông tin      |
| `secondary.main` | grey[500] | Phụ            |
| `text.primary`   | grey[700] | Chữ chính      |
| `text.secondary` | grey[500] | Chữ phụ        |

### Typography

- Font: `'Public Sans', sans-serif`
- h1–h6: weight 600 (h6: 400), từ 38px xuống 14px
- body1: 14px · body2: 12px · Button: `textTransform: 'capitalize'`

### Layout

- Drawer: 260px · Mini drawer: 60px · Toolbar: 60px
- Page size mặc định: 10 · Tùy chọn: [5, 10, 25, 50]

---

## Patterns chuẩn

### Gọi API

```js
// src/api/Strategy.js
import { API_BASE_URL, API_ENDPOINTS } from 'config';

export async function getStrategies({ page, pageSize, filters, signal }) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (filters.symbol) params.append('symbol', filters.symbol);
  const res = await fetch(`${API_BASE_URL}${API_ENDPOINTS.STRATEGIES}?${params}`, { signal });
  if (!res.ok) throw new Error('Failed to fetch strategies');
  return res.json();
}
```

### Custom Hook

```js
// src/hooks/useStrategy.js
export function useStrategies() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchStrategies = useCallback(async (params) => {
    try {
      setLoading(true);
      setError(null);
      return await getStrategies(params);
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { fetchStrategies, loading, error };
}
```

### State management (inputFilters → appliedFilters)

```js
const [inputFilters, setInputFilters] = useState(loadFiltersFromStorage());
const [appliedFilters, setAppliedFilters] = useState(loadFiltersFromStorage());

const handleFilterChange = (field, value) => setInputFilters((prev) => ({ ...prev, [field]: value }));

const handleSearch = () => {
  setAppliedFilters({ ...inputFilters });
  setPage(1);
};

useEffect(() => {
  loadData();
}, [page, pageSize, appliedFilters]);
```

### Auth header

```js
const _getAuthHeader = () => {
  const token = localStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
};
```

### Mở Dialog

```jsx
const handleOpenDialog = async (type, strategy) => {
  setDialogType(type);
  setOpenDialog(true);
  const full = await fetchStrategyDetail(strategy.strategy_id, strategy.backtest_table);
  setSelectedStrategy(full);
};
```

---

## Cấu trúc thư mục

```
src/
├── api/
│   ├── Strategy.js
│   ├── CheckFile.js
│   ├── auth.js
│   ├── chat.js
│   ├── comparative.js
│   ├── dashboard.js
│   ├── market.js
│   ├── menu.js
│   ├── order.js
│   ├── systemLog.js
│   └── users.js
├── assets/
│   ├── images/background/
│   ├── images/logo/
│   ├── images/users/
│   ├── style.css
│   └── third-party/
├── components/
│   ├── @extended/
│   │   ├── AnimateButton.jsx
│   │   ├── Avatar.jsx
│   │   ├── Breadcrumbs.jsx
│   │   ├── Dot.jsx
│   │   ├── IconButton.jsx
│   │   └── Transitions.jsx
│   ├── cards/
│   │   ├── AuthFooter.jsx
│   │   └── statistics/
│   │       └── AnalyticEcommerce.jsx
│   ├── dashboard/
│   │   ├── DashboardAiAnalysisDialog.jsx
│   │   ├── DashboardKpiSummary.jsx
│   │   └── DashboardRemarksDialog.jsx
│   ├── logo/
│   │   ├── index.jsx
│   │   ├── LogoIcon.jsx
│   │   └── LogoMain.jsx
│   ├── third-party/
│   │   └── SimpleBar.jsx
│   ├── ActivityHistory.jsx
│   ├── ChartWrapper.jsx
│   ├── ChatBotWidget.jsx
│   ├── Loadable.jsx
│   ├── Loader.jsx
│   ├── MainCard.jsx
│   ├── MoreOptionsModal.jsx
│   ├── ScrollTop.jsx
│   ├── StrategyChartDialog.jsx
│   ├── StrategyResultsDialog.jsx
│   └── StrategySettingsDialog.jsx
├── contexts/
│   ├── README.md
│   ├── ThemeModeContext.js
│   └── ...
├── hooks/
│   ├── README.md
│   ├── useActivityLogs.js
│   ├── useBehaviorAnalysis.js
│   ├── useComparativeRanking.js
│   ├── useDashboard.js
│   ├── useDownloadLog.js
│   ├── useOrderList.js
│   ├── useOrderSync.js
│   ├── useStrategy.js
│   ├── useSystemLogs.js
│   └── useThemeMode.js
├── layout/
│   ├── Auth/
│   │   └── index.jsx
│   └── Dashboard/
│       ├── Drawer/
│       │   ├── DrawerContent/
│       │   │   ├── Navigation/
│       │   │   │   ├── NavGroup.jsx
│       │   │   │   ├── NavItem.jsx
│       │   │   │   └── index.jsx
│       │   │   ├── NavCard.jsx
│       │   │   └── index.jsx
│       │   ├── DrawerHeader/
│       │   │   ├── DrawerHeaderStyled.js
│       │   │   └── index.jsx
│       │   ├── MiniDrawerStyled.js
│       │   └── index.jsx
│       ├── Header/
│       │   ├── AppBarStyled.jsx
│       │   ├── HeaderContent/
│       │   │   ├── index.jsx
│       │   │   ├── MobileSection.jsx
│       │   │   ├── Notification.jsx
│       │   │   ├── Search.jsx
│       │   │   └── Profile/
│       │   │       ├── index.jsx
│       │   │       ├── ProfileTab.jsx
│       │   │       └── SettingTab.jsx
│       │   └── index.jsx
│       ├── Footer.jsx
│       └── index.jsx
├── menu-items/
│   ├── dashboard.jsx
│   ├── index.jsx
│   ├── page.jsx
│   ├── support.jsx
│   └── utilities.jsx
├── pages/
│   ├── account-provisioning/
│   │   └── index.jsx
│   ├── auth/
│   │   ├── Login.jsx
│   │   └── Register.jsx
│   ├── backtest-pages/
│   │   └── backtest-tables.jsx
│   ├── component-overview/
│   │   ├── color.jsx
│   │   ├── shadows.jsx
│   │   └── typography.jsx
│   ├── dashboard/
│   │   ├── behavior-analysis.jsx
│   │   ├── comparative-ranking.jsx
│   │   ├── index.jsx
│   │   ├── overview.jsx
│   │   └── risk-analysis.jsx
│   ├── get-strategy-id/
│   │   ├── check-file-optimization.jsx
│   │   └── get-strategy.jsx
│   ├── news/
│   │   └── news.jsx
│   ├── order-pages/
│   │   └── order-list.jsx
│   ├── profile/
│   │   └── index.jsx
│   └── strategy-input/
│       └── strategy-input.jsx
├── routes/
│   ├── index.jsx
│   ├── LoginRoutes.jsx
│   ├── MainRoutes.jsx
│   └── ProtectedRoute.jsx
├── sections/
│   ├── auth/
│   │   ├── AuthBackground.jsx
│   │   ├── AuthCard.jsx
│   │   ├── AuthLogin.jsx
│   │   ├── AuthRegister.jsx
│   │   └── AuthWrapper.jsx
│   ├── dashboard/
│   │   ├── SalesChart.jsx
│   │   └── default/
│   │       ├── IncomeAreaChart.jsx
│   │       ├── MonthlyBarChart.jsx
│   │       ├── OrdersTable.jsx
│   │       ├── ReportAreaChart.jsx
│   │       ├── SaleReportCard.jsx
│   │       └── UniqueVisitorCard.jsx
├── themes/
│   ├── index.jsx
│   ├── palette.js
│   ├── shadows.jsx
│   ├── theme/
│   │   └── index.js
│   ├── typography.js
│   └── overrides/
│       ├── Badge.js
│       ├── Button.js
│       ├── ButtonBase.js
│       ├── Card.js
│       ├── CardContent.js
│       ├── Checkbox.jsx
│       ├── Chip.js
│       ├── CssBaseline.js
│       ├── Drawer.js
│       ├── FormHelperText.js
│       ├── IconButton.js
│       ├── InputLabel.js
│       ├── LinearProgress.js
│       ├── Link.js
│       ├── ListItemButton.jsx
│       ├── ListItemIcon.jsx
│       ├── OutlinedInput.js
│       ├── Tab.js
│       ├── TableBody.js
│       ├── TableCell.js
│       ├── TableHead.js
│       ├── TableRow.js
│       ├── Tabs.js
│       ├── Tooltip.js
│       ├── Typography.js
│       └── index.js
├── utils/
│   ├── dashboardTable.js
│   ├── getColors.js
│   ├── getShadow.js
│   ├── order-format.js
│   ├── password-strength.js
│   └── password-validation.js
├── App.jsx
├── config.js
├── index.jsx
├── reportWebVitals.js
└── vite-env.d.js
```
# NOTE
Hãy tự khảo sát toàn bộ codebase liên quan,
đọc tất cả file cần thiết,
tìm backend và frontend liên quan,
sau đó implement hoàn chỉnh.
Không cần hỏi lại.

# Cách xưng hô 
Gọi tao là đại ca Xuân Sơn
khi tao bắt đầu gửi request có thưa gửi rõ ràng tên tao
sau khi mày hoàn thành xong cũng thưa gửi rõ ràng tên tao
nếu không có chứng tỏ mày k đọc file này
1. Trước khi bắt đầu

Đọc file AGENTS.md và README trước khi làm bất cứ thứ gì.
Hiểu rõ scope của task. Nếu mơ hồ, hỏi ngay — không được tự đoán.

2. Chỉnh sửa code

Đọc trước khi sửa: Luôn đọc file đích trước. Không được giả định nội dung.
Sửa một lần duy nhất: Thực hiện tất cả thay đổi trong một lượt. Không thử lại cùng một cách quá một lần.
Không giải thích dài dòng: Không cần nói sắp làm gì. Làm luôn.
An toàn với encoding: Với file có tiếng Việt, dùng Node.js (fs.readFileSync/writeFileSync với 'utf8') thay vì các công cụ shell (sed, patch, PowerShell string ops).
Báo lỗi ngay: Nếu không tìm thấy đoạn cần thay thế, throw error ngay với tên label. Không được tự đoán hoặc âm thầm bỏ qua.
Không lặp lại lỗi: Nếu cách làm thất bại, nêu nguyên nhân một lần duy nhất và đề xuất một phương án thay thế. Không giải thích lại vấn đề cũ.

3. Phạm vi thay đổi

Chỉ sửa đúng những gì được yêu cầu. Không tự ý đụng vào code ngoài scope.
Không tạo file mới nếu task là sửa file có sẵn.
Không xóa hoặc rename file trừ khi được yêu cầu rõ ràng.

4. Dependencies

Ưu tiên dùng thư viện đã có trong project. Không npm install thêm nếu không cần thiết.
Nếu bắt buộc phải thêm dependency, hỏi trước.
Giữ đúng version đang dùng trong package.json.

5. Verify sau khi sửa

Sau khi sửa code, chạy lại để kiểm tra không có lỗi.
Nếu có test, chạy test liên quan đến phần vừa sửa.
Không báo "xong" nếu chưa tự verify.

6. Giao tiếp

Không giải thích vòng vo. Nếu xong thì báo xong, nếu lỗi thì nêu nguyên nhân ngắn gọn.
Không xin lỗi lặp đi lặp lại. Nêu vấn đề một lần rồi đề xuất hướng giải quyết.
Không hỏi lại những thứ đã được nói rõ trong task.

7. Cấm động vào file mynewtask.md

8. Tất cả code mà bạn làm thì tôi chưa hề đẩy lên git cho nên khi tôi bảo quay trở lại code cũ, hay chỉnh sửa mang tính là cách cũ đẹp hơn thì chỉnh đơn giản thôi chứ k cần dùng các lệnh git diff , bởi vì tôi đã đăng lên git đâu