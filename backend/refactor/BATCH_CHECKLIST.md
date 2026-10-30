# BATCH CHECKLIST — Code Review Toàn Bộ Codebase
Cập nhật lần cuối: 2026-07-02
Tổng: **32 batch** (20 Backend + 12 Frontend)
Kết quả ghi vào: `REVIEW_BACKEND.md` / `REVIEW_FRONTEND.md`

---

## LEGEND
- `[ ]` — Chưa đọc
- `[x]` — Đã đọc & ghi kết quả xong

---

## 🟦 BACKEND (B-01 → B-20)

| # | Batch | File(s) | Tổng dòng | Vai trò | Trạng thái |
|---|---|---|---|---|---|
| B-01 | Entry + Routes lớn | `index.js` · `opRoute.js` · `authRoute.js` | ~585 | Entry point + route chain chính | `[x]` |
| B-02 | Sync core | `opController.js` · `syncService.js` | ~989 | Controller + Service luồng sync | `[x]` |
| B-03 | Sync DB layer | `opDao.js` · `materializedViewDao.js` | ~852 | Raw SQL — table creation, MV refresh | `[x]` |
| B-04 | Strategy CRUD | `strategyController.js` · `strategyService.js` | ~807 | CRUD strategy core | `[x]` |
| B-05 | Strategy metadata DAO | `strategyMetadataDao.js` | ~960 | Query phức tạp nhất backend | `[x]` |
| B-06 | Strategy filter & time range | `strategyFilterHelper.js` · `strategyTimeRangeDao.js` | ~694 | Filter logic + time-range DAO | `[x]` |
| B-07 | Dashboard DAO | `dashboardDao.js` | ~999 | SQL aggregation dashboard | `[x]` |
| B-08 | Dashboard service/controller | `dashboardService.js` · `dashboardController.js` | ~569 | Business logic dashboard | `[x]` |
| B-09 | Behavior analysis DAO | `behaviorAnalysisDao.js` | ~811 | Analytics SQL — behavior | `[x]` |
| B-10 | Risk analysis full stack | `riskAnalysisDao.js` · `riskAnalysisService.js` | ~789 | Risk analysis SQL + service | `[x]` |
| B-11 | Check file service | `checkFileService.js` | ~889 | File validation logic | `[x]` |
| B-12 | OpenAI service | `openaiService.js` | ~887 | AI service — cost sensitive | `[x]` |
| B-13 | AI analysis full stack | `aiAnalysisService.js` · `aiAnalysisController.js` · `aiAnalysisReportDao.js` | ~579 | AI analysis end-to-end | `[x]` |
| B-14 | Parse + progress tracker | `parseSheetMetaData.js` · `parseDeals.js` · `syncProgressTracker.js` | ~739 | Excel parse + sync state | `[x]` |
| B-15 | Auth full stack | `authService.js` · `authJwt.js` · `authController.js` · `otpService.js` | ~329 | JWT, OTP, login flow | `[x]` |
| B-16 | GG Sheet integration | `opService.js` · `ggSheetService.js` · `processQueue.js` | ~536 | Google Sheet fetch + queue | `[x]` |
| B-17 | Lot threshold full stack | `lotThresholdDao.js` · `lotThresholdService.js` · `lotThresholdController.js` | ~991 | Lot threshold feature | `[x]` |
| B-18 | Market + order services | `marketService.js` · `marketWatchDao.js` · `orderService.js` | ~607 | Market price + order list | `[x]` |
| B-19 | Config & constants | `constants.js` · `messages.js` · `db.js` · `googleSheet.js` · `multiServiceAccounts.js` | ~266 | App config, constants, DB pool | `[x]` |
| B-20 | Validation + comparative | `dataValidationService.js` · `comparativeRankingService.js` · `comparativeRankingDao.js` | ~326 | Stats diff + ranking | `[x]` |

---

## 🟩 FRONTEND (F-01 → F-12)

| # | Batch | File(s) | Tổng dòng | Vai trò | Trạng thái |
|---|---|---|---|---|---|
| F-01 | Strategy data layer | `useStrategy.js` · `api/Strategy.js` | ~682 | Hook + API module strategy | `[x]` |
| F-02 | Strategy input page | `strategy-input.jsx` | ~1131 | Page chính nhập/lọc strategy | `[x]` |
| F-03 | Strategy filters + table | `StrategyFilters.jsx` · `StrategyTable.jsx` | ~1,662 | Filter bar + data table | `[x]` |
| F-04 | Order list page | `order-list.jsx` | ~1187 | Trang danh sách deal/order | `[x]` |
| F-05 | Backtest tables | `backtest-tables.jsx` · `api/order.js` | ~1148 | Quản lý backtest tables | `[x]` |
| F-06 | Overview dashboard page | `overview/index.jsx` | ~2544 | Dashboard tổng quan — file lớn nhất FE | `[x]` |
| F-07 | Dashboard KPI + filter | `KpiSummarySection.jsx` · `DashboardFilterBar.jsx` | ~1148 | KPI cards + filter bar | `[x]` |
| F-08 | Check file + chatbot | `useOrderSync.js` · `ChatBotWidget/index.jsx` · `check-file-optimization.jsx` | ~1,531 | File check + AI chatbot widget | `[x]` |
| F-09 | Risk analysis page | `risk-analysis/index.jsx` | ~2249 | Risk analysis container | `[x]` |
| F-10 | Risk analysis sub-tabs | `RiskViewTab.jsx` · `VolumeOptimizationTab.jsx` | ~3547 | Risk tabs chi tiết | `[x]` |
| F-11 | Comparative ranking | `comparative-ranking/index.jsx` · `RankingTab.jsx` | ~2717 | Comparative ranking page | `[x]` |
| F-12 | Behavior analysis | `behavior-analysis/index.jsx` · `HoldingRecoveryTab.jsx` | ~2150 | Behavior analysis page | `[x]` |

---

## TIẾN ĐỘ TỔNG

```
Backend:  [x][x][x][x][x][x][x][x][x][x][x][x][x][x][x][x][x][x][x][x]
          B01 B02 B03 B04 B05 B06 B07 B08 B09 B10 B11 B12 B13 B14 B15 B16 B17 B18 B19 B20

Frontend: [x][x][x][x][x][x][x][x][x][x][x][x]
          F01 F02 F03 F04 F05 F06 F07 F08 F09 F10 F11 F12

Hoàn thành: 32 / 32 batch
```

---

## LOG THỰC THI

| Thời gian | Batch | Kết quả | Vấn đề phát sinh |
|---|---|---|---|

| 2026-07-02 13:52 | B-01 | ✅ Xong. 2P0 (1 Cố ý) + 4P1 + 5 clean + 2 perf | Hardcode password admin (Cố ý), server listen trước DB init, OTP không rate-limit |
| 2026-07-02 13:59 | B-02 | ✅ Xong. 3P0 + 4P1 + 6 clean + 3 perf | N+1 query trong controller, clearData không atomic, sleep 1s cứng/sheet |
| 2026-07-02 14:22 | B-06 | ✅ Xong. 1P0 + 1P1 + 2 clean + 1 perf | SQL Injection qua table interpolation, 2 CTE query lặp song song |
| 2026-07-02 14:33 | B-07 | ✅ Xong. 1P0 + 2P1 + 2 clean + 1 perf | SQL Injection qua tableName interpolation, streak analysis thiếu filter |
| 2026-07-02 14:36 | B-08 | ✅ Xong. 1P0 + 3P1 + 2 clean | SQL injection từ controller truyền trực tiếp, File Optimization + Quality ignore filter, Cache 7 ngày stale |
| 2026-07-02 14:38 | B-09 | ✅ Xong. 0P0 + 3P1 + 1 clean | 14 query Postgres song song quá nặng, Hardcode năm 2019-2026 trong query |
| 2026-07-02 14:42 | B-10 | ✅ Xong. 0P0 + 1P1 + 1 clean | Lỗi lệch index ánh xạ Hard Flag giữa SQL (f1-f9) và JS (f1-f8) khiến 3 flag bị tắt |
| 2026-07-02 14:45 | B-11 | ✅ Xong. 0P0 + 3P1 + 2 clean | Rò rỉ timer setTimeout trong Promise.race, Date parsing không an toàn locale, Thiếu Time col gây skip silent |
| 2026-07-02 14:48 | B-12 | ✅ Xong. 0P0 + 3P1 + 1 clean | Vòng lặp gọi tool AI vô hạn, Rò rỉ bộ nhớ map rateLimitMap, Crash khởi tạo nếu thiếu API Key |
| 2026-07-02 14:52 | B-13 | ✅ Xong. 1P0 + 2P1 + 1 clean | Entrypoint SQL injection tại controller, Mâu thuẫn định nghĩa cờ cứng giữa JS và System prompt AI |
| 2026-07-02 14:55 | B-14 | ✅ Xong. 0P0 + 1P1 + 1 clean | Lỗi tranh chấp ghi đè (Race Condition) trong cập nhật tiến trình Sync |
| 2026-07-02 14:58 | B-15 | ✅ Xong. 1P0 + 1P1 | Không rate limit OTP email spam gầy sập SMTP, Fallback JWT secret key yếu |
| 2026-07-02 15:02 | B-16 | ✅ Xong. 0P0 + 2P1 | Pin cố định 1 service account khi đệ quy thư mục Drive, Thuật toán chia máy bị lỗi dở dang nếu chạy cluster |
| 2026-07-02 15:35 | B-19 | ✅ Xong. 0P0 + 3P1 | Khởi tạo 3 connection pool lãng phí gây nghẽn DB, Crash khi parse DATABASE_URL thiếu |
| 2026-07-02 15:30 | B-20 | ✅ Xong. 1P0 + 1P1 | Entrypoint SQL injection tại controller, Rò rỉ bộ nhớ cache Map do thiếu cleanup |
| 2026-07-02 15:46 | B-17 | ✅ Xong. 0P0 + 2P1 | Lỗi khóa in-memory thất bại khi chạy cluster, N+1 Seq Scan trên materialized view |
| 2026-07-02 15:48 | B-18 | ✅ Xong. 0P0 + 1P1 | Rò rỉ RAM lớn (Memory Leak) do cache Map giữ dữ liệu phân trang cũ vĩnh viễn |
| 2026-07-02 15:48 | F-01 | ✅ Xong. 0P0 + 1P1 | Rò rỉ RAM (Memory Leak) ở client do strategiesCache không có giới hạn size |
| 2026-07-02 15:52 | F-02 | ✅ Xong. 0P0 + 1P1 | Bỏ sót việc xóa timer lưu preferences (prefSaveRef) khi unmount component |
| 2026-07-02 15:55 | F-03 | ✅ Xong. 0P0 + 2P1 | Bắn 50-100 request lấy chart song song làm nghẽn pool HTTP trình duyệt, formatNumberVN làm mất dấu thập phân |
| 2026-07-02 16:00 | F-04 | ✅ Xong. 0P0 + 1P1 | Cấu hình BACKTEST_BOT_CONFIG bị hardcode trực tiếp ở UI làm sai lệch số lượng bot thiếu khi thêm backtest mới |
| 2026-07-02 16:05 | F-05 | ✅ Xong. 0P0 + 1P1 | Sai số chu kỳ auto-refresh logs (8.3 tiếng thay vì 30 giây), thiếu bảo vệ chống xoá nhầm table |
| 2026-07-02 16:10 | F-06 | ✅ Xong. 0P0 + 1P1 | Bị race condition dữ liệu cũ đè dữ liệu mới khi người dùng click chuyển đổi nhanh các backtest table hoặc date range |
| 2026-07-02 16:15 | F-07 | ✅ Xong. 0P0 + 1P1 | Hàm formatMetric dùng Number.isNaN check không chuẩn, có thể lọt chữ 'NaN' hiển thị lên UI KPI |
| 2026-07-02 16:20 | F-08 | ✅ Xong. 0P0 + 1P1 | Việc cancel sync dừng polling nhưng để lại Promise lửng lơ vĩnh viễn (Dangling Promise) gây rò rỉ |
| 2026-07-02 16:25 | F-09 | ✅ Xong. 0P0 + 0P1 | Đã giải quyết race condition bằng cờ active, cần bổ sung AbortController để tối ưu băng thông |
| 2026-07-02 16:30 | F-10 | ✅ Xong. 0P0 + 0P1 | Triển khai phân trang, lọc chỉ số rủi ro, tối ưu hóa lots, logic gộp bot gốc mượt mà |
| 2026-07-02 16:35 | F-11 | ✅ Xong. 0P0 + 1P1 | Phát hiện spam 50 request Sparkline song song khi đổi trang hoặc load danh sách đối sánh gây nghẽn kết nối |
| 2026-07-02 16:40 | F-12 | ✅ Xong. 0P0 + 0P1 | Đã đọc xong phần còn lại của các tab phân tích hành vi, cấu trúc sạch sẽ, an toàn |

---

## SAU KHI HOÀN THÀNH TẤT CẢ BATCH

Tổng hợp vào: `TASK_PLAN.md`

| Phase | Loại | Mô tả |
|---|---|---|
| 🔴 Phase 1 | P0 | Tất cả rủi ro nghiêm trọng cần fix ngay |
| 🔴 Phase 2 | P1 | Rủi ro có điều kiện |
| 🟡 Phase 3 | Clean | Code quality improvements |
| 🟢 Phase 4 | Perf | Tối ưu hiệu năng |
