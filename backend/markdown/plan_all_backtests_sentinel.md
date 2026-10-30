# Plan: Chuẩn hóa sentinel `mv_all_backtest` thành `all_backtests`

## 1. Mục tiêu

Đổi mã quy ước đại diện cho toàn bộ các bảng backtest:

```text
mv_all_backtest  ->  all_backtests
```

`all_backtests` chỉ là sentinel dùng trong request, state frontend và logic phân nhánh. Nó không phải tên bảng và không được truy vấn trực tiếp trong PostgreSQL.

Mục tiêu là tránh gây hiểu nhầm cho developer kế thừa rằng hệ thống còn sử dụng Materialized View.

## 2. Phạm vi không thay đổi

- Không tạo hoặc xóa bảng/view trong database.
- Không thay đổi dữ liệu các bảng `backtest_*`.
- Không thay đổi công thức tính toán dashboard, risk analysis, comparative, behavior hoặc volume optimization.
- Không thay đổi cấu trúc `data_source`.
- Không đổi tên bảng backtest thực tế.
- Không thay đổi logic dynamic `UNION ALL` hiện tại.

## 3. Quy tắc chuẩn hóa strict

### Giá trị chuẩn mới

Code mới chỉ sinh và lưu sentinel:

```text
all_backtests
```

Không giữ lại sentinel `mv_all_backtest` trong source code, frontend state, localStorage, default parameter, comment hoặc log.

Các giá trị `allbacktest` và `all` cũng được thay thế về một sentinel duy nhất `all_backtests` trong code mới. Không duy trì nhánh tương thích cũ vì mục tiêu của đợt refactor là dọn sạch hoàn toàn tên Materialized View cũ.

## 4. Backend cần chỉnh sửa

### 4.1. Tạo helper normalize tập trung

Tạo helper dùng chung, ví dụ:

```js
const ALL_BACKTESTS_SENTINEL = 'all_backtests';
const LEGACY_ALL_BACKTEST_SENTINELS = new Set([
  'all',
  'allbacktest',
  'mv_all_backtest',
  'all_backtests'
]);

function isAllBacktests(value) { ... }
function normalizeBacktestSource(value) { ... }
```

Helper phải hỗ trợ cả string và array, đồng thời loại bỏ duplicate trong array.

### 4.2. Query builder

Cập nhật `queryBuilderHelper.js`:

- Chỉ nhận `all_backtests` là sentinel chuẩn.
- Khi gặp sentinel, lấy danh sách từ `data_source` đang enabled.
- Không dựng SQL từ chuỗi `mv_all_backtest`.
- Cập nhật `buildSourceCacheKey()` để mọi sentinel “all” trả về cùng cache key `src_all`.

### 4.3. Controller/service/DAO

Rà soát và đổi default parameter:

- `dashboardController.js`
- `comparativeRankingController.js`
- `behaviorAnalysisController.js`
- `riskAnalysisController.js`
- `aiAnalysisController.js`
- `dashboardService.js`
- `comparativeRankingService.js`
- `behaviorAnalysisService.js`
- `riskAnalysisService.js`
- `dashboardDao.js`
- `riskAnalysisDao.js`
- `opDao.js`
- `lotThresholdDao.js`

Các default mới dùng `all_backtests`. Các điều kiện legacy không được xóa cho tới khi frontend và API clients đã chuyển xong.

### 4.4. Dọn tên Materialized View gây hiểu nhầm

Chỉnh các comment/log/documentation như:

- “refresh Materialized View `mv_all_backtest`”
- “query `mv_all_backtest`”
- “source table `mv_all_backtest`”

Thành:

```text
all backtest sources
dynamic all-backtests query
```

Không đổi tên các hàm public cũ nếu frontend hoặc module khác còn import; chỉ đổi comment/log trước. Việc rename hàm là phase riêng nếu cần.

## 5. Frontend cần chỉnh sửa

### 5.1. Storage sentinel

Cập nhật `utils/dashboardTable.js`:

- Default mới: `all_backtests`.
- Khi lưu nhiều source: lưu `all_backtests` làm selected table.
- Khi đọc giá trị cũ `mv_all_backtest`, normalize ngay sang `all_backtests`.
- Có thể migrate localStorage một lần khi app khởi động.

### 5.2. DashboardFilterBar

- Dùng `all_backtests` khi chọn nhiều bảng hoặc Select All.
- Không hiển thị sentinel cho user; vẫn hiển thị tên các bảng được chọn.
- Giữ nguyên event `dashboard:filters-updated` và `dashboard:sources-updated`.

### 5.3. Các trang dashboard

Rà soát các file đang kiểm tra `mv_all_backtest`:

- Risk Analysis
- Overview
- Comparative Ranking
- Behavior Analysis
- Order pages
- Dashboard remarks/dialogs

Đổi điều kiện nội bộ sang helper `isAllBacktests()` hoặc sentinel `all_backtests`.

## 6. API compatibility

API mới chỉ sử dụng `all_backtests` khi biểu diễn toàn bộ nguồn dữ liệu.

Không đổi URL API.

## 7. Database

Không cần migration database vì:

- `mv_all_backtest` không phải khóa ngoại hay giá trị nghiệp vụ bắt buộc trong bảng dữ liệu.
- `data_source.source_name` chỉ lưu tên các bảng `backtest_*` thật.
- Không có bảng thật tên `all_backtests`.

Không chạy `ALTER`, `DROP` hoặc `UPDATE` dữ liệu backtest.

## 8. Kiểm thử bắt buộc

### Backend

- Request không truyền source → lấy toàn bộ bảng enabled.
- `source=all_backtests` → lấy toàn bộ bảng enabled.
- Array có `all_backtests` → lấy toàn bộ bảng enabled.
- Array có bảng cụ thể → chỉ lấy đúng các bảng đó.
- Cache key của mọi sentinel all giống nhau.
- Không có SQL query trực tiếp đến tên `mv_all_backtest`.

### Frontend

- Chọn một bảng.
- Chọn hai hoặc nhiều bảng.
- Chọn Select All.
- Reload trình duyệt sau khi đang lưu localStorage cũ.
- Mở từng tab dashboard và kiểm tra dữ liệu không đổi.
- Kiểm tra Analysis Run/Volume Optimization vẫn phân biệt đúng danh sách source.

### Regression

- Dashboard Overview.
- Risk Analysis.
- Comparative Ranking.
- Behavior Analysis.
- OTM/Optimization Results.
- Date Range.
- Volume Optimization Analysis Run.

## 9. Thứ tự triển khai

1. Tạo helper normalize dùng chung.
2. Cập nhật query builder và cache key.
3. Cập nhật backend defaults/conditions.
4. Cập nhật frontend storage/filter state.
5. Cập nhật các trang dashboard.
6. Dọn comment/log Materialized View cũ.
7. Chạy syntax check backend.
8. Chạy frontend lint/build khi được yêu cầu.
9. Kiểm thử tương thích với request cũ.

## 10. Tiêu chí hoàn thành

- Code mới chỉ sử dụng `all_backtests`.
- Không còn chuỗi `mv_all_backtest` trong backend/frontend sau refactor.
- Không có query nào truy vấn bảng/view tên `mv_all_backtest`.
- Không tạo migration hoặc thay đổi schema DB.
- Các tab dashboard vẫn trả kết quả giống trước.
- Frontend localStorage cũ được normalize an toàn.
- Không còn comment/log mới gọi hệ thống là Materialized View.
