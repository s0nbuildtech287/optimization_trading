# REVIEW_FRONTEND.md — Báo Cáo Code Review Front-end
Dự án: **Lotusquant Optimize Dashboard**
Người thực hiện: Antigravity AI Coding Agent
Cập nhật lúc: 2026-07-02

---

## 📋 GIỚI THIỆU
Tài liệu này ghi nhận chi tiết các rủi ro, lỗi logic, rò rỉ bộ nhớ, và các điểm cần tối ưu hóa của lớp mã nguồn Frontend của Lotusquant.
Tất cả các rủi ro được phân loại thành:
- **P0**: Lỗi nghiêm trọng, hỏng UI, mất kết nối API hoặc vi phạm bảo mật cần sửa ngay.
- **P1**: Rò rỉ tài nguyên, lỗi logic có điều kiện hoặc trải nghiệm người dùng kém.
- **Clean/Perf**: Đề xuất viết code sạch và tối ưu hóa hiệu năng render/tải trang.

---
## Batch F-01 — useStrategy.js (dòng 1-421) · api/Strategy.js (dòng 1-373)
Đọc lúc: 2026-07-02 15:48

### 🔴 Rủi ro

#### [P1] useStrategy.js:9 — Rò rỉ bộ nhớ (Memory Leak) phía client do bộ nhớ đệm `strategiesCache` phình to vô hạn
- [ ] Tình huống gây fail: Ứng dụng Lotusquant là Single Page Application (SPA). Người dùng có thể treo tab dashboard cả ngày và liên tục click phân trang hoặc thay đổi các bộ lọc filter khác nhau. Bộ nhớ đệm `strategiesCache` lưu trữ kết quả của các trang chiến lược dưới dạng một Map vô hạn không giới hạn kích thước (chỉ hết hạn theo TTL 7 ngày). Nếu người dùng đổi filter liên tục, Map này sẽ giữ hàng ngàn mảng dữ liệu lớn trong RAM của trình duyệt, gây giật lag và làm crash tab Chrome (Out Of Memory).
- Mức độ: **rò rỉ bộ nhớ client (client-side memory leak)**
- Code:
```javascript
const strategiesCache = new Map();
```
- Fix: Thiết lập giới hạn kích thước (ví dụ tối đa 100 cache entries) cho `strategiesCache` và áp dụng thuật toán trục xuất LRU tương tự như cách đã làm rất tốt với `balanceChartCache`.

### ✅ Đã tốt (không cần sửa)
- Triển khai cơ chế hủy request đang bay (`AbortController`) khi người dùng click phân trang nhanh hoặc gõ tìm kiếm liên tục, giúp tránh lỗi race condition dữ liệu cũ đè lên dữ liệu mới trên UI.
- Tận dụng thông minh cấu trúc `balanceChartCache` dạng LRU tự chế (`getChartCached` / `setChartCached` với limit 100) để lưu trữ cache dữ liệu chart mà không lo tràn RAM.
- Các API request đều thông qua wrapper `authFetch.js` hỗ trợ tiêm JWT tự động và có timeout 60 giây an toàn, tự động logout khi hết hạn token (401/403).

---

---
## Batch F-02 — strategy-input.jsx (dòng 1-1131)
Đọc lúc: 2026-07-02 15:52

### 🔴 Rủi ro

#### [P1] strategy-input.jsx:674-683 — Bỏ sót việc xóa hẹn giờ `prefSaveRef` khi unmount component gây rò rỉ và request API thừa
- [ ] Tình huống gây fail: Khi người dùng tương tác thay đổi filter, hệ thống sẽ kích hoạt một bộ đệm hẹn giờ 1.5 giây để tự động lưu tùy chọn lên server DB (`savePreferences`). Tuy nhiên, trong cleanup function của `useEffect` unmount component, hệ thống chỉ dọn dẹp `debounceTimeoutRef` và `applyButtonTimeoutRef` mà quên dọn dẹp `prefSaveRef`. Nếu người dùng đổi filter và lập tức click chuyển trang (khiến component unmount), timer này vẫn sẽ kích hoạt sau đó và bắn request API `savePreferences` vô nghĩa lên server.
- Mức độ: **rò rỉ tài nguyên nhẹ / request API thừa**
- Code:
```javascript
useEffect(() => {
  return () => {
    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    if (applyButtonTimeoutRef.current) clearTimeout(applyButtonTimeoutRef.current);
    // Thiếu prefSaveRef.current
  };
}, []);
```
- Fix: Bổ sung dòng `if (prefSaveRef.current) clearTimeout(prefSaveRef.current);` vào block cleanup trên.

### ✅ Đã tốt (không cần sửa)
- Áp dụng triệt để mô hình tách biệt giữa state nhập liệu (`inputFilters`) và state áp dụng truy vấn (`appliedFilters`). Dữ liệu chỉ được nạp lại khi người dùng bấm nút "Apply", tránh hiện tượng lag giật và spam API liên tục khi người dùng gõ phím.
- Thiết kế dialog hướng dẫn sử dụng Date Range chi tiết, phân định rõ ràng 8 chỉ số tính toán động theo thời gian thực và các chỉ số tĩnh giúp người dùng không bị nhầm lẫn.
- Tự động đồng bộ hóa và lưu trữ bộ lọc ưu thích của người dùng song song xuống cả `localStorage` (tải nhanh tức thì) và Database preferences (lưu trữ vĩnh viễn trên tài khoản).

---
---
## Batch F-03 — StrategyFilters.jsx (dòng 1-867) · StrategyTable.jsx (dòng 1-795)
Đọc lúc: 2026-07-02 15:55

### 🔴 Rủi ro

#### [P1] StrategyTable.jsx:66,478 — Bắn đồng thời 50-100 request HTTP song song vẽ Sparkline gây nghẽn và treo hàng đợi (Network Pool Choking) của trình duyệt
- [ ] Tình huống gây fail: Mỗi dòng chiến lược hiển thị một ô `MiniSparkline`. Khi bảng dữ liệu tải trang (mặc định hiển thị 50 hoặc 100 dòng), 50 hoặc 100 component `MiniSparkline` sẽ đồng thời kích hoạt `useEffect` gọi API `fetchBalanceChart`. Trình duyệt Chrome/Firefox giới hạn tối đa chỉ cho phép 6 connection song song trên mỗi domain. Kết quả là các request lấy chart xếp hàng dài (connection queue choking), làm treo toàn bộ các tương tác mạng khác của người dùng (như click phân trang, gọi API khác) và gây quá tải tức thời cho máy chủ Backend.
- Mức độ: **nghẽn hiệu năng mạng / treo giao diện (UI freeze)**
- Code:
```javascript
<TableCell align="center" sx={{ verticalAlign: 'middle', py: 1.5 }}>
  <MiniSparkline row={row} />
</TableCell>
```
- Fix: Chỉ thực hiện tải dữ liệu vẽ Sparkline khi dòng đó được mở rộng (`isExpanded = true`), hoặc trì hoãn việc tải (Lazy Load) khi ô Sparkline lăn vào vùng nhìn thấy của màn hình (Viewport) bằng `IntersectionObserver`.

#### [P1] StrategyFilters.jsx:42-50 — Định dạng số của Việt Nam `formatNumberVN` làm mất hoàn toàn phần thập phân của bộ lọc
- [ ] Tình huống gây fail: Khi người dùng gõ lọc số thập phân ở bộ lọc (ví dụ Net Profit là `1234.56` hoặc `1234,56`), hàm `formatNumberVN` sử dụng biểu thức regex `.replace(/[^\d]/g, '')` sẽ loại bỏ toàn bộ dấu chấm và dấu phẩy, chuyển giá trị thành số nguyên `123456`. Điều này khiến tính năng lọc theo số thập phân hoàn toàn không hoạt động chính xác.
- Mức độ: **lỗi logic bộ lọc dữ liệu (broken filter inputs)**
- Code:
```javascript
const formatNumberVN = (value) => {
  if (!value) return '';
  const num = String(value).replace(/[^\d]/g, ''); // Xóa mất ký tự chấm/phẩy thập phân
  return num.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};
```
- Fix: Chỉnh sửa regex để cho phép giữ lại duy nhất 1 dấu chấm hoặc dấu phẩy phân tách thập phân hợp lệ trước khi format.

### ✅ Đã tốt (không cần sửa)
- UI phần Expanded Row thiết kế cực kỳ hiện đại, sử dụng hệ thống grid phân bố trực quan 12 metrics song song (Date Range động và Full Period tĩnh) kèm legend màu sắc thông minh.
- Mini sparkline sử dụng `Recharts` vẽ gọn gàng, màu sắc chuyển biến xanh/đỏ tương ứng với trạng thái lời/lỗ rất trực quan.

---
---
## Batch F-04 — order-list.jsx (dòng 1-1187)
Đọc lúc: 2026-07-02 16:00

### 🔴 Rủi ro

#### [P1] order-list.jsx:136-140 — Cấu hình số lượng Bot (`BACKTEST_BOT_CONFIG`) bị hardcode thô ở UI gây sai lệch tính toán chiến lược thiếu khi thêm backtest mới
- [ ] Tình huống gây fail: Hệ thống kiểm tra số lượng file thiếu (Missing Strategies) bằng cách lấy tổng số bot mong đợi trừ đi số lượng bot hiện có. Tuy nhiên, số lượng bot cho mỗi bảng lại bị hardcode cứng trong mã nguồn React (`backtest_qnhu` và `backtest_tu`). Khi admin tạo thêm một bảng backtest mới (ví dụ: `backtest_son_son`), UI sẽ không nhận biết được số lượng bot tương ứng của bảng này (trả về 0), dẫn đến việc tính toán số lượng chiến lược thiếu (`Missing Strategies`) bị sai lệch hoàn toàn.
- Mức độ: **lỗi logic hiển thị / cấu trúc cứng nhắc (hardcoded UI config)**
- Code:
```javascript
const BACKTEST_BOT_CONFIG = {
  backtest_qnhu: { bots: 108 },
  backtest_tu:   { bots: 101 },
};
```
- Fix: Chuyển cấu hình số lượng bot này sang phía database hoặc trả về động từ API backend cùng với danh sách tables, tránh việc phải sửa mã nguồn FE mỗi khi có bảng backtest mới.

### ✅ Đã tốt (không cần sửa)
- Triển khai cơ chế Lazy Load thông minh cho danh sách bộ lọc symbol (`loadFilterOptions`): Chỉ thực hiện fetch dữ liệu dropdown khi người dùng bấm mở nó ra lần đầu, giúp trang web load rất nhanh khi mới truy cập.
- Tách biệt hai tác vụ fetch dữ liệu bảng phân trang (`fetchData`) và fetch tổng hợp dữ liệu thống kê (`fetchTotals`) chạy song song độc lập. Giúp bảng hiển thị ngay lập tức mà không phải chờ các phép toán Sum/Count nặng nề của DB hoàn thành.

---
---
## Batch F-05 — backtest-tables.jsx (dòng 1-981) · api/order.js (dòng 1-167)
Đọc lúc: 2026-07-02 16:05

### 🔴 Rủi ro

#### [P1] backtest-tables.jsx:375-383 — Sai sót cấu hình chu kỳ tự động làm mới `setInterval` (8.3 giờ thay vì 30 giây) khiến tính năng Auto Refresh vô hại
- [ ] Tình huống gây fail: Để cập nhật trạng thái đồng bộ thời gian thực của các bảng, hệ thống sử dụng một hiệu ứng `useEffect` với chu kỳ tự động tải lại. Tuy nhiên, giá trị interval đang bị cấu hình nhầm là `30000000` mili-giây (tương ứng với 30.000 giây = 8.3 tiếng). Việc này khiến giao diện bảng logs hoàn toàn không tự động làm mới trong suốt phiên làm việc của người dùng trừ khi họ bấm nút "Refresh" bằng tay.
- Mức độ: **lỗi logic trải nghiệm người dùng (broken auto-refresh)**
- Code:
```javascript
useEffect(() => {
  if (!autoRefresh) return;
  const interval = setInterval(() => {
    fetchLatestBacktestLogs();
  }, 30000000); // Typo: 30000000 ms = 8.3 tiếng
  return () => clearInterval(interval);
}, [autoRefresh, fetchLatestBacktestLogs]);
```
- Fix: Sửa lại giá trị thành `30000` mili-giây (30 giây) hoặc `60000` (1 phút) để phản ánh đúng tính năng Auto-refresh.

### ✅ Đã tốt (không cần sửa)
- Triển khai lưu trữ báo cáo đồng bộ (`syncReport`) vào `sessionStorage` với giới hạn thời gian tồn tại 10 phút. Giúp người dùng chuyển đổi qua lại giữa các tab/menu mà không lo bị mất báo cáo tiến trình sync đang chạy dở.
- Áp dụng popup hội thoại tạo bảng mới trực tiếp thông qua select option `__CREATE_NEW__` gọn gàng, tăng diện tích sử dụng cho dashboard mà không cần thêm nút nhấn rườm rà.

---
---
## Batch F-06 — overview/index.jsx (dòng 1-2544)
Đọc lúc: 2026-07-02 16:10

### 🔴 Rủi ro

#### [P1] overview/index.jsx:345-369 — Race Condition gây hiển thị sai lệch dữ liệu biểu đồ khi chuyển nhanh bộ lọc hoặc bảng Backtest
- [ ] Tình huống gây fail: Khi người dùng đổi bảng Backtest đang chọn hoặc thay đổi Date Range, hàm `loadData` sẽ đồng thời kích hoạt 2 request `fetchDashboard` và `fetchBehaviorAnalysis`. Do các request này chạy bất đồng bộ hoàn toàn và không có cơ chế hủy request đang bay (`AbortController`), nếu request của bảng cũ phản hồi chậm hơn phản hồi của bảng mới, dữ liệu phản hồi cũ sẽ đè lên dữ liệu mới, gây hiển thị sai lệch các chỉ số và biểu đồ trên dashboard (data mismatch).
- Mức độ: **bất đồng bộ sai lệch dữ liệu (race condition / state mismatch)**
- Code:
```javascript
const loadData = async () => {
  try {
    const params = { tableName: selectedTable };
    // Gọi song song mà không lưu giữ ref hay check huỷ abort
    const [result, behaviorResult] = await Promise.allSettled([
      fetchDashboard(params),
      fetchBehaviorAnalysis(params)
    ]);
    if (result.status === 'fulfilled' && result.value?.success) setDashboardData(result.value.data);
    if (behaviorResult.status === 'fulfilled' && behaviorResult.value?.success) setBehaviorData(behaviorResult.value.data);
  } catch (err) { ... }
};
```
- Fix: Sử dụng `AbortController` tương tự các hook chiến lược, hoặc lưu vết token hủy request hiện tại để chỉ cập nhật kết quả của lượt click sau cùng.

### ✅ Đã tốt (không cần sửa)
- Triển khai thuật toán định dạng và chia tỷ lệ trục Y tự động (`computeScaleFor`) rất linh hoạt, chuyển dịch các số lớn thành ký tự viết tắt `M` (triệu), `B` (tỷ) gọn gàng trên biểu đồ.
- Widget "Comparative Ranking" tích hợp tooltip thông tin chẩn đoán cực kỳ trực quan, hiển thị đầy đủ 8 chỉ số của chiến lược khi rê chuột qua mỗi mục xếp hạng.
- Lắng nghe sự kiện toàn cục `dashboard:data-changed` để tự động reload lại toàn bộ dữ liệu khi người dùng vừa thực hiện sync hoặc xóa một bảng backtest bất kỳ.

---
---
## Batch F-07 — KpiSummarySection.jsx (dòng 1-862) · DashboardFilterBar.jsx (dòng 1-286)
Đọc lúc: 2026-07-02 16:15

### 🔴 Rủi ro

#### [P1] KpiSummarySection.jsx:81-84 — Hàm định dạng `formatMetric` kiểm tra giá trị NaN không chính xác dẫn đến khả năng hiển thị chữ "NaN" lỗi trên thẻ KPI
- [ ] Tình huống gây fail: Khi tham số `val` truyền vào là một chuỗi không hợp lệ đại diện cho số (ví dụ: chuỗi `'NaN'` nhận từ API do lỗi chia cho 0 sụt giảm tài khoản ở backend), hàm `Number.isNaN(val)` sẽ trả về `false` vì nó kiểm tra kiểu dữ liệu nghiêm ngặt (chỉ trả về `true` nếu truyền vào giá trị `NaN` thực thụ có kiểu `number`). Kết quả là chữ "NaN" bị lọt qua và render trực tiếp lên các thẻ KPI của Dashboard, gây lỗi hiển thị giao diện.
- Mức độ: **lỗi logic hiển thị (incorrect NaN formatting)**
- Code:
```javascript
const formatMetric = (val, suffix = '') => {
  if (val == null || Number.isNaN(val)) return '—'; // Number.isNaN('NaN') === false
  return `${val}${suffix}`;
};
```
- Fix: Thay thế bằng `isNaN(Number(val))` để ép kiểu kiểm tra an toàn cho cả các chuỗi số lỗi.

### ✅ Đã tốt (không cần sửa)
- Thanh bộ lọc `DashboardFilterBar` thiết kế dạng sticky mờ đục rất đẹp mắt và hiện đại, giúp cố định phía trên khi cuộn trang, giúp người dùng lọc nhanh bất cứ lúc nào.
- Sử dụng mô hình gửi nhận sự kiện DOM toàn cục (`dashboard:filters-updated`) cực kỳ xuất sắc để đồng bộ hóa trạng thái lựa chọn bảng và DateRange giữa Filter Bar và các component con khác mà không cần thông qua Redux/Zustand phức tạp.

---
---
## Batch F-08 — useOrderSync.js (dòng 1-166) · ChatBotWidget/index.jsx (dòng 1-389) · check-file-optimization.jsx (dòng 1-972)
Đọc lúc: 2026-07-02 16:20

### 🔴 Rủi ro

#### [P1] useOrderSync.js:58-104,149-152 — Tính năng Huỷ Sync (`cancelSync`) dừng vòng lặp polling nhưng để lại một Promise treo lửng lơ (Dangling Promise) gây rò rỉ bộ nhớ
- [ ] Tình huống gây fail: Khi người dùng bấm nút Huỷ đồng bộ, hàm `cancelSync` sẽ gọi `clearPolling` để xoá setInterval. Tuy nhiên, Promise khởi tạo bởi `syncAsync` để trả về cho luồng cha vẫn ở trạng thái pending (chưa được resolve hay reject). Điều này khiến các biến nằm trong closure của Promise này không được bộ dọn rác (Garbage Collector) thu hồi, gây rò rỉ bộ nhớ nhỏ phía trình duyệt.
- Mức độ: **rò rỉ tài nguyên trình duyệt (dangling promise closure leak)**
- Code:
```javascript
// syncAsync trả về Promise
return new Promise((resolve, reject) => {
  pollingIntervalRef.current = setInterval(async () => { ... })
})
// cancelSync chỉ clear polling, không reject hay resolve Promise trên
const cancelSync = () => {
  clearPolling();
  setSyncing(false);
};
```
- Fix: Lưu tham chiếu `reject` của Promise vào một React Ref và gọi `reject(new Error('Sync cancelled by user'))` khi bấm nút Cancel.

### ✅ Đã tốt (không cần sửa)
- Triển khai chức năng kiểm tra tên file tối ưu hoá phía client (Group 1 và Group 2) bằng regex vô cùng nhanh chóng và thông tin phản hồi ngay tức khắc, giảm tải xử lý file không hợp lệ lên server backend.
- Floating Chatbot AI hỗ trợ thu nhận ngữ cảnh trang hiện tại (`chatbot:context`) để tự động hiểu người dùng đang xem biểu đồ hay bảng dữ liệu nào, hỗ trợ tư vấn thông minh, cá nhân hoá cho nhà giao dịch.

---
---
## Batch F-09 — risk-analysis/index.jsx (dòng 1-2249)
Đọc lúc: 2026-07-02 16:25

### 🔴 Rủi ro
- **Không phát hiện rủi ro nghiêm trọng P0/P1.**
- Khả năng tối ưu hóa băng thông: Mặc dù component đã giải quyết tốt lỗi Race condition bằng cờ kiểm soát vòng đời `active` (bỏ qua cập nhật state khi component unmount hoặc thay đổi bộ lọc), việc không truyền tín hiệu hủy `AbortController` xuống hàm gọi API `getRiskAnalysisData(params)` khiến các kết nối HTTP cũ vẫn tiếp tục tải dữ liệu ngầm cho tới khi hoàn tất, tiêu thụ băng thông mạng không cần thiết của khách hàng.

### ✅ Đã tốt (không cần sửa)
- Triển khai logic tính toán điểm xếp hạng ưu tiên (`Priority`) tích hợp công thức chia trọng số rủi ro cực kỳ logic, giúp người quản lý danh mục định lượng chính xác chất lượng vận hành của từng bot.
- Tích hợp TradingView/Bloomberg style tooltip rất thời thượng và hiện đại trên biểu đồ, hiển thị rõ ràng thông số sụt giảm trùng lặp của các cặp tài sản.

---
---
## Batch F-10 — RiskViewTab.jsx (dòng 1-1030) · VolumeOptimizationTab.jsx (dòng 1-877) · StrategyViewTab.jsx (dòng 1-904) · PortfolioChecksTab.jsx (dòng 1-747)
Đọc lúc: 2026-07-02 16:30

### 🔴 Rủi ro
- **Không phát hiện rủi ro nghiêm trọng P0/P1.**

### ✅ Đã tốt (không cần sửa)
- Triển khai phân trang mượt mà cho bảng danh sách strategy khổng lồ, lọc các cờ rủi ro chi tiết theo từng chỉ số hoặc nhóm rủi ro (Statistical, Martingale, Live Replicability,...) tăng tốc độ tìm kiếm lỗi của người dùng.
- Tận dụng `useMemo` cực tốt để xử lý tính toán gộp các config strategy về bot gốc (3 chữ số đầu) giúp hiển thị biểu đồ phân kỳ hiệu suất và tối ưu khối lượng (`VolumeOptimization`) sắc nét, không bị trễ khung hình khi tương tác.
- Luồng tương tác nhảy qua nhảy lại (drill-down hai chiều) giữa Risk View và Strategy View cực kỳ ấn tượng, có hiệu ứng highlight màu nền chớp tắt trong 3 giây để người dùng dễ định vị dòng vi phạm.

---
---
## Batch F-11 — comparative-ranking/index.jsx (dòng 1-1773) · RankingTab.jsx (dòng 1-944)
Đọc lúc: 2026-07-02 16:35

### 🔴 Rủi ro

#### [P1] RankingTab.jsx:43-81 — Spam 50 request lấy dữ liệu vẽ Sparkline song song gây nghẽn kết nối trình duyệt (Connection Choking)
- [ ] Tình huống gây fail: Tương tự lỗi trong `StrategyTable.jsx` (Batch F-03), component con `MiniSparkline` được mount đồng loạt cho toàn bộ các hàng dữ liệu hiển thị (mặc định 50 hàng/trang). Khi trang Đối sánh & Xếp hạng tải lên, 50 request `fetchBalanceChart(...)` sẽ đồng thời được bắn ra. Trình duyệt Chrome giới hạn tối đa 6 kết nối HTTP song song trên cùng một domain, dẫn đến 44 kết nối còn lại bị kẹt trong hàng đợi (connection queue). Việc này làm tê liệt hoàn toàn các chức năng tương tác khác cần gọi API (như đổi tab, tìm kiếm, lưu remarks) cho đến khi toàn bộ biểu đồ Sparkline được tải xong.
- Mức độ: **nghẽn mạng trình duyệt / nghẽn connection queue (connection choking)**
- Code:
```javascript
function MiniSparkline({ row }) {
  // useEffect tự động gọi fetch ngay khi mount hàng loạt
  useEffect(() => {
    if (!row?.id || !row?.backtest) return;
    fetchBalanceChart(row.backtest, row.id, 1000000)
  }, [row?.id, row?.backtest]);
}
```
- Fix: Áp dụng cơ chế trì hoãn (lazy load) chỉ gọi API vẽ biểu đồ khi người dùng hover qua dòng đó hoặc sử dụng Intersection Observer để chỉ tải khi hàng đó hiển thị trên màn hình.

### ✅ Đã tốt (không cần sửa)
- Triển khai logic tính điểm đối sánh Composite đa chiều rất khoa học (Sharpe 16%, PF 16%, RF 16%, P/D 18%, Concentration 18%, EP 8%, LR 8%) giúp xếp hạng chất lượng bot toàn diện.
- Tự động gom nhóm bot cha (3 chữ số đầu) trong tab `BotComparisonTab` kèm theo thanh phân bổ chất lượng config con (Passed, Warning, Disqualified) trực quan sinh động.

---
---
## Batch F-12 — behavior-analysis/index.jsx (dòng 1-1248) · HoldingRecoveryTab.jsx (dòng 1-684) · ExitBehaviorTab.jsx (dòng 1-162)
Đọc lúc: 2026-07-02 16:40

### 🔴 Rủi ro
- **Không phát hiện rủi ro nghiêm trọng P0/P1.**

### ✅ Đã tốt (không cần sửa)
- Thành phần trực quan hóa lý do đóng lệnh `ExitStackBar` (TP, SL, CO, EoT) thiết kế dưới dạng thanh ngang chia đoạn tỉ lệ (stacked progress bar) tích hợp tooltip cực kỳ gọn gàng, tiết kiệm không gian màn hình và mang lại trải nghiệm phân tích cao cấp.
- Giải quyết triệt để lỗi race condition nạp dữ liệu bằng cờ `active = false` khi cleanup useEffect, đảm bảo trạng thái các biểu đồ phân tích hành vi luôn khớp với bộ lọc người dùng chọn.

---