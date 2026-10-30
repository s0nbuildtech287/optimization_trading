# TASK_PLAN.md — Kế Hoạch Sửa Lỗi & Refactor Toàn Bộ Hệ Thống

Tài liệu này tổng hợp **toàn bộ** các vấn đề rủi ro được phát hiện trong quá trình audit 32 Batch (Backend & Frontend) của hệ thống **Lotusquant Optimize**.

---

## 🔴 PHASE 1 — KHẮC PHỤC RỦI RO NGHIÊM TRỌNG (P0)
*Mục tiêu: Sửa ngay các lỗi bảo mật, SQL Injection, rò rỉ thông tin nhạy cảm và lỗi sập ứng dụng.*

> [!NOTE]
> Mật khẩu tài khoản admin mặc định (`admin` / `Lotusquant@123` hoặc `Lotusquant123@k`) được giữ nguyên theo cấu hình cố ý của **đại ca Xuân Sơn**, không sửa đổi.

### 1. SQL Injection & tableName Parameter Validation
- [ ] **validateTableName Helper**: Tạo hàm helper trung tâm kiểm tra đối khớp tên bảng nhận từ client so với danh sách bảng động lấy từ DB (`getAllBacktestTables()`).
- [ ] **opController.js & opDao.js**: Chặn SQL Injection qua parameter `tableName` lấy từ req.body.
- [ ] **strategyMetadataDao.js**: Xử lý việc nội suy trực tiếp chuỗi tên bảng `"${tableName}"` trong raw SQL. Bổ sung validate tên bảng trước khi query.
- [ ] **dashboardDao.js**: Sửa toàn bộ các hàm truy vấn aggregate (`getDashboardOverview`, `getMonthlyProfit`, `getTopSymbols`, `getProfitDistribution`, `getStreakAnalysis`, `getYearlyComparison`, `getDetailedReport`) để sanitize tham số `tableName` trước khi đưa vào query.
- [ ] **riskAnalysisDao.js**: Sanitize/Validate tên bảng trong các câu truy vấn Hard/Soft flags.
- [ ] **dashboardController.js**: Validate `tableName` lấy từ `req.query` trước khi chuyển vào service.
- [ ] **aiAnalysisController.js**: Validate `tableName` nhận từ client trước khi gọi `aiAnalysisService`.
- [ ] **comparativeRankingController.js**: Validate `tableName` lấy từ `req.query` trước khi chuyển vào `comparativeRankingService` để chặn SQL Injection gián tiếp qua `dashboardDao`.
- [ ] **strategyTimeRangeDao.js:236**: Khắc phục SQL Injection nguy hiểm qua double quote interpolation (`"${backtestTable}" b`) bằng cách quote identifier hoặc validate whitelist.
- [ ] **opDao.js:85,237,130**: Sửa lỗi SQL injection tiềm ẩn trong UNION ALL của `createNewMaterializedView` bằng cách sử dụng `pg-format` `%I` thay vì nội suy chuỗi thô.
- [ ] **strategyMetadataDao.js:681-684**: Sửa lỗi SQL injection tiềm ẩn khi append thô điều kiện `type` (buy/sell) trong truy vấn JSONB bằng cách thực hiện Whitelist validation giá trị trực tiếp tại DAO.
- [ ] **strategyMetadataDao.js:256-309**: Rà soát và whitelist chặt chẽ biểu thức `ORDER BY`/`safeDir` để tránh mọi bề mặt nội suy SQL không mong muốn.

### 2. Security & API Crash Fixes
- [ ] **authRoute.js & authService.js**: Bổ sung rate-limiting (giới hạn tần suất gửi mail OTP) cho endpoint `/auth/request-otp` để chống spam sập SMTP và tràn bộ nhớ `otpStore`.
- [ ] **emailConfig.js**: Chuyển mật khẩu ứng dụng Gmail `'biku nteu eogd zrjt'` ra biến môi trường `.env`.
- [ ] **index.js**: Tránh gọi `app.listen()` trước khi database init hoàn tất. Đảm bảo chạy xong `await initializeDatabase()` mới lắng nghe kết nối.
- [ ] **opService.js (authClients ReferenceError)**: Sửa lỗi ReferenceError tại hàm `updateRowsByColumn` do dùng biến `authClients` chưa được định nghĩa trong file.
- [ ] **opController.js (require inside function)**: Chuyển lệnh require database pool (`getAppPool`) ra khỏi body của hàm controller `getStrategyFileCheck` để tránh lỗi khởi tạo không tuần tự.
- [ ] **opController.js (N+1 query)**: Refactor vòng lặp query strategy_metadata trong `getStrategyFileCheck` thành một câu SQL JOIN duy nhất để tránh tạo hàng chục query đồng thời gây nghẽn DB.
- [ ] **opController.js (estimatedFiles magic number)**: Thay `estimatedFiles = 3500` bằng giá trị lấy từ cấu hình hoặc số lượng file thực tế để progress sync không hiển thị sai.
- [ ] **materializedViewDao.js:207-217 (Broken Transaction DDL)**: Thay đổi quy trình cập nhật materialized view: Tránh DROP trước ALTER RENAME khiến view bị mất hoàn toàn nếu câu lệnh sau lỗi. Chuyển sang Swap view an toàn hoặc sử dụng `REFRESH MATERIALIZED VIEW CONCURRENTLY`.
- [ ] **opDao.js:679 (Double Export)**: Xóa bỏ dòng export trùng lặp của hàm `deleteBacktestTable`.
- [ ] **strategyMetadataDao.js:933 (CommonJS Hoisting Anti-pattern)**: Di chuyển `module.exports` xuống cuối file sau định nghĩa của `getAggregatedFilteredStats` để tránh crash nếu sau này hàm được đổi thành arrow function.

---

## 🟠 PHASE 2 — KHẮC PHỤC LỖI LOGIC & RÒ RỈ TÀI NGUYÊN (P1)
*Mục tiêu: Giải quyết rò rỉ RAM (Memory Leak), nghẽn kết nối trình duyệt, cache stale và lỗi tranh chấp đồng bộ (Race Condition).*

> [!NOTE]
> Thời gian cache 7 ngày của dữ liệu Dashboard được giữ nguyên để tối ưu hiệu năng đối với dữ liệu backtest tĩnh. Hệ thống sẽ được bổ sung cơ chế chủ động xóa cache khi xảy ra các thao tác ghi (Sync/Delete).

### 1. RAM Memory Leaks (Client & Server)
- [ ] **orderService.js & strategyService.js**: Thay thế Map in-memory cache thông thường bằng bộ nhớ đệm có giới hạn kích thước (LRU Cache) hoặc cơ chế tự cleanup các key hết hạn.
- [ ] **comparativeRankingService.js**: Bổ sung giới hạn kích thước hoặc cơ chế cleanup cho `comparativeCache` để tránh rò rỉ RAM khi người dùng đổi filter liên tục.
- [ ] **openaiService.js**: Xoá key cũ trong `rateLimitMap` để giải phóng bộ nhớ RAM.
- [ ] **useStrategy.js (Frontend)**: Giới hạn kích thước `strategiesCache` để chống tràn RAM khi người dùng treo tab lâu.
- [ ] **useOrderSync.js (Frontend)**: Reject Promise khi người dùng huỷ sync (`cancelSync`) để giải phóng dangling closures của timer.
- [ ] **strategy-input.jsx (Frontend)**: Clear timeout `prefSaveRef` khi unmount component để tránh rò rỉ timer.
- [ ] **strategyService.js:13-21 (Stable Stringify Cache Key)**: Sắp xếp lại thứ tự key của object `filterOperators` trước khi `JSON.stringify` để tránh sinh ra nhiều key cache khác nhau cho cùng một truy vấn, làm tràn bộ nhớ.
- [ ] **checkFileService.js:169-172 (Promise.race Timer Leak)**: Lưu `timerId` của `setTimeout` trong `timeoutPromise` và gọi `clearTimeout` trong block finally để giải phóng các timer trôi nổi khi export file.

### 2. Performance Bottlenecks & Network Choking
- [ ] **db.js (Backend)**: Hợp nhất 3 pools kết nối Postgres rời rạc (`pool`, `adminPool`, `appPool`) thành 1 pool dùng chung, quản lý giới hạn `max: 80` connections.
- [ ] **StrategyTable.jsx & RankingTab.jsx (Frontend)**: Lazy load Sparklines biểu đồ số dư bằng cách chỉ fetch API khi hàng di chuyển vào khung nhìn (Intersection Observer) hoặc khi hover.
- [ ] **lotThresholdDao.js & marketWatchDao.js (Backend)**: Bổ sung index cho Materialized View `mv_all_backtest` trên các cột hay tìm kiếm (`strategy_id`, `symbol`, `type`) để tránh full Seq Scan.
- [ ] **strategyTimeRangeDao.js**: Tối ưu hóa `countQuery` bằng cách loại bỏ các CTE window function tính toán trùng lặp, chỉ đếm số lượng strategy duy nhất.
- [ ] **behaviorAnalysisDao.js**: Chia nhỏ hoặc chạy tuần tự 14 query nặng qua `Promise.all` để tránh cạn kiệt connection pool của DB.
- [ ] **materializedViewDao.js:73-78 (N+1 query)**: Gộp các câu lệnh kiểm tra sự tồn tại và cấu trúc bảng con trong `createAllBacktestMaterializedView` thành 1 query JOIN bảng `information_schema`.
- [ ] **strategyMetadataDao.js:473-532 (N INSERT statements in transaction)**: Refactor hàm `batchUpsertStrategies` sử dụng `pg-format` bulk insert để gửi 1 câu SQL duy nhất thay vì lặp vòng INSERT làm nghẽn DB.
- [ ] **dashboardDao.js:271-290**: Tối ưu `getStreakAnalysis` để tránh Window Function nặng chạy trên toàn bộ deal khi có filter thời gian hoặc dữ liệu lớn.

### 3. Race Conditions, Cache Stale & Logic Errors
- [ ] **syncProgressTracker.js**: Chuyển logic ghi đè progress sang câu lệnh SQL tăng tiến độ nguyên tử (Atomic Update) để giải quyết tranh chấp ghi giữa các workers.
- [ ] **overview/index.jsx & risk-analysis/index.jsx (Frontend)**: Sử dụng `AbortController` khi loadData để huỷ bỏ request cũ bị trễ của bảng backtest trước.
- [ ] **opService.js & strategyController.js**: Bổ sung cơ chế chủ động xóa cache dashboard/strategy/risk/behavior khi Sync mới hoặc Xóa chiến lược thành công (giải quyết triệt để Stale Cache).
- [ ] **opService.js (Double escape)**: Loại bỏ logic thay thế `'` bằng `''` thủ công ở service layer do bên dưới DAO đã dùng `pg-format` `%L` tự động escape.
- [ ] **opService.js (getDataBySheetName)**: Sửa logic lấy tên cột filter từ `queryKeys[0]` không chính xác khi url query thay đổi thứ tự.
- [ ] **db.js (DATABASE_URL guard)**: Kiểm tra biến môi trường `DATABASE_URL` trước khi gọi `new URL()` để lỗi cấu hình được báo rõ ràng thay vì crash khó hiểu lúc startup.
- [ ] **googleSheet.js (serviceAccounts guard)**: Bọc đọc thư mục `src/config/serviceAccounts` bằng kiểm tra tồn tại/try-catch và báo lỗi rõ ràng khi không có credential `.json`.
- [ ] **googleSheet.js (empty credentials guard)**: Chặn trường hợp danh sách credentials rỗng gây phép chia `% 0`, sinh `NaN` và crash khi lấy Google client.
- [ ] **config.json / Sequelize CLI**: Bổ sung `.sequelizerc` hoặc cấu hình tương đương để Sequelize CLI đọc config động từ `config.js`, không đọc placeholder tĩnh trong `config.json`.
- [ ] **dashboardDao.js**: Sửa hàm `getStreakAnalysis` để nhận và lọc theo thời gian (`year`, `startDate`, `endDate`) tương tự các hàm khác.
- [ ] **dashboardService.js**: Chuyển tham số filter thời gian vào `getFileOptimizationSummary` và `getQualityDistribution` để dữ liệu đồng bộ với bộ lọc trên UI.
- [ ] **behaviorAnalysisDao.js (Hardcoded Years)**: Loại bỏ hardcode năm 2020-2023 và 2019-2026 trong query Volatility Regime và Annual Stability để hệ thống chạy ổn định khi mở rộng thời gian.
- [ ] **aiAnalysisService.js**: Khớp định nghĩa cờ rủi ro (Hard/Soft) giữa prompt AI và logic DAO thực tế.
- [ ] **aiAnalysisService.js (Resilience)**: Bổ sung cơ chế bọc lỗi từng phần để tránh làm sập toàn bộ báo cáo AI khi một trong các chỉ số phân tích bị lỗi/trống.
- [ ] **authJwt.js**: Loại bỏ fallback key mặc định `'YOUR_SECRET_KEY'` để tránh nguy cơ giả mạo token trong môi trường non-production.
- [ ] **ggSheetService.js**: Tránh truyền biến `drive` cố định xuống đệ quy hàm `getAllFilesInDriveFolder` để cơ chế xoay vòng SA hoạt động bình thường.
- [ ] **syncService.js (clearData)**: Chuyển luồng clearData và insert dữ liệu vào Transaction để đảm bảo tính toàn vẹn (Atomic Sync).
- [ ] **syncService.js (sleep delay)**: Bỏ sleep 1s cứng ở mỗi sheet để tăng tốc độ đồng bộ.
- [ ] **syncService.js (Retry logic)**: Không retry đối với các lỗi không thể tự phục hồi (NOT_FOUND, PERMISSION).
- [ ] **opController.js (deleteTimeout)**: Chuyển logic delete timeout sang DB transaction để tránh hỏng dữ liệu khi lệnh DELETE bị trễ.
- [ ] **index.js & opRoute.js (CORS & Route Guards)**: Giới hạn CORS origin thay vì wildcard `*`. Bổ sung kiểm tra `isAdmin` cho route `/sync-sheet-async`, kiểm tra auth cho route `/sync-status/:syncId`.
- [ ] **opRoute.js (Multer limit)**: Đặt giới hạn tối đa số lượng file upload cho array `files` của Multer để tránh OOM.
- [ ] **index.js (SPA fallback)**: Chuyển SPA fallback ra sau api route guards để trả về 404 JSON chính xác cho API.
- [ ] **errorLogDAO.js (VARCHAR limit)**: Đổi kiểu dữ liệu cột `strategy_id` trong `error_logs` từ `VARCHAR(255)` sang `TEXT` để tránh mất log lỗi âm thầm khi tên strategy quá dài.
- [ ] **errorLogDAO.js (strategy_id index)**: Bổ sung index cho `strategy_id` để truy vấn `SELECT DISTINCT strategy_id FROM error_logs` không phải quét toàn bảng khi log phình to.
- [ ] **userService.js**: Chặn Admin tự xóa hoặc hạ cấp vai trò của chính mình để tránh System Lockout.
- [ ] **user.js & userService.js**: Bổ sung validation kiểm tra độ mạnh của mật khẩu (tối thiểu 8 ký tự).
- [ ] **openaiService.js (Startup crash)**: Chuyển sang khởi tạo lười (lazy initialization) đối với client OpenAI để tránh sập app lúc start nếu thiếu api key.
- [ ] **StrategyTable.jsx (Frontend)**: Sửa lỗi hàm `formatNumberVN` làm mất dấu thập phân của số.
- [ ] **KpiSummarySection.jsx (Frontend)**: Sửa `formatMetric` để ép kiểu số trước khi kiểm tra `NaN`, tránh render chữ `"NaN"` trên KPI.
- [ ] **order-list.jsx (Frontend)**: Đồng bộ cấu hình `BACKTEST_BOT_CONFIG` tự động lấy từ danh sách bot động/API thay vì hardcode ở UI.
- [ ] **backtest-tables.jsx (Frontend)**: Sửa chu kỳ auto-refresh logs về đúng 30 giây hoặc 1 phút thay vì 8.3 tiếng.
- [ ] **backtest-tables.jsx (Frontend)**: Thêm hội thoại xác nhận lần 2 trước khi xóa bảng dữ liệu để tránh xóa nhầm.
- [ ] **riskAnalysisDao.js:245-253 (Hard Flags Index Mismatch)**: Sắp xếp lại `HARD_FLAG_DEFS` trong JS khớp 1-1 với thứ tự cột `f1-f9` trong SQL và sửa vòng lặp JS để sửa triệt để lỗi 3 cờ (EOT, Recent Decay, Largest Loss) luôn trả về FALSE.
- [ ] **checkFileService.js:672-676 (Locale-dependent parseTime)**: Sử dụng parse ngày thủ công hoặc thư viện `dayjs` để parse format cố định của MT5, tránh việc parse ra `NaN` trên các server khác múi giờ làm bypass điều kiện kiểm tra.
- [ ] **checkFileService.js:517-538 (Missing timeCol Silent Skip)**: Kiểm tra nếu `timeCol === -1` (hoặc các cột bắt buộc khác) thì báo lỗi Group 3 và dừng parse file ngay lập tức thay vì bỏ qua file âm thầm.
- [ ] **openaiService.js:786-807 (Agentic Loop Max Iterations)**: Giới hạn số lượt gọi tool tối đa trong 1 session chat (ví dụ `maxIterations = 5`) để chặn vòng lặp gọi tool vô tận gây tốn chi phí.
- [ ] **opDao.js:169-175 (sourceTables Parameterization)**: Chuyển đổi query filter `source_table IN` sang parameterized query sử dụng `= ANY($1::text[])` hoặc `pg-format` `%I` thay vì inner check thay thế regex.
- [ ] **opDao.js:383-394 (countRows / sumStrategyProfit validation)**: Bổ sung `assertBacktestIdentifier(tableName)` ở đầu hai hàm này để đảm bảo an toàn.
- [ ] **materializedViewDao.js:5 (isRebuildingMaterializedView cluster issue)**: Thay thế cờ in-memory bằng PostgreSQL Advisory Locks (`pg_try_advisory_lock`) để khóa đồng bộ đa tiến trình an toàn khi chạy cụm cluster.
- [ ] **strategyController.js:244 (backtestTable source validation)**: Ràng buộc tham số `backtestTable` lấy từ một nguồn tin cậy duy nhất (req.params hoặc req.query), tránh lấy hỗn hợp từ 5 nguồn khác nhau có nguy cơ bị inject ngầm từ body.
- [ ] **strategyController.js:407-433 (sheetId format validation)**: Bổ sung regex match `sheetId` theo chuẩn Google Drive file ID để chặn tấn công duyệt file ngoài phạm vi.
- [ ] **strategyController.js:409 (filename header injection)**: Sanitize ký tự đặc biệt trong filename query trước khi set vào `Content-Disposition`.
- [ ] **strategyMetadataDao.js:220-250 (buildFilterClauses duplication)**: Dùng chung một kết quả filter thay vì gọi hàm `buildFilterClauses` 2 lần độc lập cho query dữ liệu và count.
- [ ] **swagger.js:27 (Swagger path fix)**: Sửa đường dẫn quét APIs từ `apis: ["./server/routes/*.js"]` thành `apis: ["./src/routes/*.js"]` để hiển thị tài liệu Swagger.
- [ ] **chatController.js:47-51 (GPT Token Blowout)**: Rút gọn dữ liệu đối tượng strategy trước khi gửi chatbot AI để tránh tràn token.

---

## 🟡 PHASE 3 — CODE QUALITY & CLEAN CODE
- [ ] Dọn dẹp mã nguồn rác (code commented-out, các import không dùng như `isModerator` trong authRoute.js).
- [ ] Bổ sung cơ chế structured logging bằng thư viện chuyên dụng thay vì console.log thô sơ.

---

## 🟢 PHASE 4 — PERFORMANCE & SCALE (CLUSTER DEPLOYMENT)
- [ ] **processQueue.js**: Triển khai giải pháp hàng đợi tập trung (BullMQ + Redis) thay vì chia tải modulo theo `MACHINE_ID` dở dang khi chạy Cluster.
- [ ] **lotThresholdController.js**: Cấu hình cơ chế lưu lock phân tích lots ở tầng Database (PostgreSQL Advisory Locks) thay vì biến in-memory Express.
