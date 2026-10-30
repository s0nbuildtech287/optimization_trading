---
## Batch B-01 — index.js (dòng 1-155) · opRoute.js (dòng 1-334) · authRoute.js (dòng 1-136)
Đọc lúc: 2026-07-02 13:50

### 🔴 Rủi ro

#### [P0] index.js:79 — Hardcode default admin password
- [x] **CỐ Ý / KHÔNG SỬA** (Theo chỉ thị của đại ca Xuân Sơn: do đây là hệ thống web nội bộ, việc để password mặc định là chủ đích cấu hình).
- Mức độ: **security breach** (Chấp nhận cho môi trường nội bộ)
- Code:
```
password: "Lotusquant@123"
```
- Fix: Không sửa đổi.

#### [P0] authRoute.js:134 — `/auth/request-otp` không có rate limit
- [ ] Tình huống gây fail: Bất kỳ ai cũng POST thoải mái, gửi OTP spam liên tục đến bất kỳ email nào → tốn quota email service, có thể bị ban domain gửi mail.
- Mức độ: **downtime** (email quota exhausted) + **abuse**
- Code:
```
router.post('/auth/request-otp', requestOTP);
```
- Fix: Thêm rate-limit middleware (ví dụ `express-rate-limit` hoặc throttle theo IP + email).

#### [P0] index.js:148 — Server listen TRƯỚC khi database init xong
- [ ] Tình huống gây fail: `app.listen()` ở dòng 144, `initializeDatabase()` ở dòng 148. Nếu request đến trong khoảng vài giây đầu (trước khi tables tồn tại), query sẽ fail với "relation does not exist".
- Mức độ: **downtime** / **sai kết quả** — đặc biệt nguy hiểm khi restart server dưới load
- Code:
```js
app.listen(PORT, "0.0.0.0", () => { ... }); // dòng 144
initializeDatabase();                         // dòng 148 — không await
```
- Fix: `await initializeDatabase()` trước, rồi mới `app.listen()`. Hoặc wrap trong async IIFE:
```js
(async () => {
  await initializeDatabase();
  app.listen(PORT, "0.0.0.0", ...);
})();
```

#### [P1] index.js:37 — CORS wildcard `origin: "*"`
- [ ] Tình huống gây fail: Mọi domain đều được phép gọi API → nếu token bị lộ, bất kỳ trang web độc hại nào cũng CORS-request được.
- Mức độ: **security** — giảm thiểu bề mặt tấn công CSRF-style attacks
- Fix: Giới hạn origin theo danh sách whitelist từ env: `origin: process.env.ALLOWED_ORIGINS?.split(",") || "http://localhost:3000"`

#### [P1] opRoute.js:76 — `sync-sheet-async` chỉ cần `verifyToken`, không cần `isAdmin`
- [ ] Tình huống gây fail: User thường có thể trigger sync toàn bộ Google Drive, gây tốn tài nguyên CPU/DB và quota Google API.
- Mức độ: **resource abuse** / **cost**
- Code:
```js
router.post("/sync-sheet-async", verifyToken, syncSheetAsync);
```
- Fix: Thêm `isAdmin` hoặc `isUser` với quota check.

#### [P1] opRoute.js:79 — `/sync-status/:syncId` không có auth
- [ ] Tình huống gây fail: Ai cũng có thể poll sync status nếu biết hoặc đoán được syncId (nếu là UUID thì khó, nhưng nếu sequential thì trivial).
- Mức độ: **information disclosure**
- Fix: Thêm `verifyToken`. Kiểm tra syncId có thuộc về user đang login không.

#### [P1] index.js:151-154 — Catch-all SPA fallback đặt sai vị trí
- [ ] Tình huống gây fail: Static + SPA fallback đặt SAU routes nhưng cũng SAU error-handling global middleware. Express match theo thứ tự — route `/api/xyz-không-tồn-tại` sẽ hit catch-all, trả về `index.html` thay vì 404 JSON.
- Mức độ: **sai kết quả** — frontend nhận HTML thay vì JSON error, khó debug
- Code:
```js
app.use(express.static(...));
app.use((req, res) => { res.sendFile(...index.html); }); // nuốt tất cả 404
```
- Fix: Giới hạn SPA fallback chỉ cho non-API routes:
```js
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});
```

#### [P1] opRoute.js:328 — Multer `upload.array("files")` không giới hạn số file
- [ ] Tình huống gây fail: Upload 1000 file → memory spike, OOM crash (memoryStorage lưu hết vào RAM).
- Mức độ: **downtime** — OOM kill process
- Code:
```js
router.post("/check-files", verifyToken, upload.array("files"), checkFiles);
```
- Fix: `upload.array("files", 50)` — đặt max count.

### 🟡 Clean/đẹp hơn

#### authRoute.js:5 — Import `isModerator` không dùng
- [ ] Xóa `isModerator` khỏi destructure, chỉ import những gì dùng.
- Hiện tại: `const { verifyToken, isAdmin, isModerator } = require(...)` → Đề xuất: `const { verifyToken, isAdmin } = require(...)`

#### authRoute.js:81-133 — ~50 dòng code commented-out
- [ ] Xóa toàn bộ comment-out test routes (`/test/user`, `/test/moderator`, `/test/admin`) — đây là leftover từ template, không còn giá trị tài liệu.

#### authRoute.js:73 + opRoute.js:68 — Swagger khai báo `password` type sai
- [ ] `type: boolean` cho password field là sai → sửa thành `type: string, format: password`

#### index.js:103-112 — Log check table existence nhưng không dùng kết quả đúng cách
- [ ] `usersExists` check TRƯỚC khi `db.sequelize.sync()` nhưng message log được dùng để nói table "đã tồn tại" hay "mới tạo" — thực ra là không chính xác vì `sync()` mới là thứ tạo table. Bỏ check trước sync, chỉ log sau sync.

#### index.js:126-133 — Inline comment magic `// Clear all order cache`
- [ ] Comment thừa, tên hàm đã tự giải thích. Xóa comment inline dư.

### 🟢 Hiệu năng

#### index.js:104-108 — `showAllTables()` query chạy ngay khi startup — **thấp**
- [ ] `queryInterface.showAllTables()` gọi DB thêm 1 lần chỉ để log. Không cần thiết, bỏ đi để giảm startup time.

#### opRoute.js:4-7 — Multer 500MB limit không có streaming — **cao**
- [ ] Toàn bộ file upload lên memory (`memoryStorage`). File 500MB = tốn 500MB RAM/request. Nếu 3 request đồng thời = 1.5GB RAM.
- Đề xuất: Giảm limit xuống mức thực tế cần (50MB?), hoặc stream sang disk với `diskStorage` nếu file lớn.

### ✅ Đã tốt (không cần sửa)
- `db.sequelize.sync({ alter: false })` — đúng, không tự-alter schema production
- Các route destructive (`dropTable`, `deleteBacktestTable`, `clearData`) đều có `[verifyToken, isAdmin]` — đúng
- Route ordering: `/data/totals` khai báo trước `/data` — đúng, tránh conflict
- `express.json({ limit: "50mb" })` — có limit request body
- `initErrorLogTable`, `initSystemLogTable`... được gọi đúng thứ tự dependency

---

---
## Batch B-02 — opController.js (dòng 1-603) · syncService.js (dòng 1-558)
Đọc lúc: 2026-07-02 13:55

### 🔴 Rủi ro

#### [P0] syncService.js:58-60 — Validate tableName bằng regex nhưng KHÔNG validate tên thật
- [ ] Tình huống gây fail: Regex `^backtest[a-z0-9_]*$/i` đúng nhưng `TABLE_NAME` lấy từ `req.body.tableName` không được sanitize thêm. Nếu bypass được regex (hoặc regex sai), tên table bị inject vào raw SQL bên dưới (opDao dùng template string `"${tableName}"`) → SQL injection.
- Mức độ: **security breach / data loss** — nếu tableName chứa `"; DROP TABLE --` hoặc tương tự
- Code:
```js
if (!TABLE_NAME || !/^backtest[a-z0-9_]*$/i.test(TABLE_NAME)) {
  throw new Error("Invalid table name...");
}
```
- Fix: Regex đang đúng nhưng cần double-check tất cả DAO dùng `"${tableName}"` trong SQL cũng validate lại. Chuyển sang whitelist từ `getAllBacktestTables()` + so sánh trực tiếp thay vì regex.

#### [P0] opController.js:512-513 — `require('../config/db')` bên trong controller function
- [ ] Tình huống gây fail: `getStrategyFileCheck` là hàm controller nhưng tự trực tiếp gọi `pool.query()` — vi phạm kiến trúc 3 lớp. Nếu DB pool chưa init (race condition từ B-01), function crash ngay.
- Mức độ: **downtime** + vi phạm kiến trúc
- Code:
```js
const getStrategyFileCheck = async (req, res) => {
  const { getAppPool } = require('../config/db');
  const pool = getAppPool();
  ...
  const tablesRes = await pool.query(`SELECT backtest_table...`);
```
- Fix: Chuyển logic vào DAO layer. Controller chỉ gọi service.

#### [P0] opController.js:528-540 — N+1 query trong vòng lặp
- [ ] Tình huống gây fail: Với mỗi `backtest_table`, gọi thêm 1 `pool.query()` riêng (botRes). Nếu có 20 bảng = 21 query tuần tự. Dưới load tăng → latency tăng tuyến tính, timeout.
- Mức độ: **hiệu năng cao + downtime khi scale**
- Code:
```js
for (const { backtest_table, total } of tablesRes.rows) {
  const botRes = await pool.query(`SELECT ... FROM strategy_metadata WHERE backtest_table = $1`, [backtest_table]);
```
- Fix: JOIN hoặc GROUP BY backtest_table trong 1 query duy nhất.

#### [P1] opController.js:59 — Magic number `estimatedFiles = 3500`
- [ ] Tình huống gây fail: Progress bar luôn bắt đầu với tổng ước tính 3500 file, bất kể thực tế. Nếu chỉ sync 10 file → progress bar show sai (0.3% → 100% nhảy đột ngột).
- Mức độ: **sai kết quả** — UX misleading
- Code: `const estimatedFiles = 3500;`
- Fix: Lấy từ config/env hoặc từ kết quả `getAllFilesFromDriveFolderUrl` trước khi trả 202.

#### [P1] syncService.js:144 — `clearData()` chạy TRƯỚC khi `buildQueueAndRun` — không atomic
- [ ] Tình huống gây fail: L144 `await opService.clearData(TABLE_NAME, runType)` xóa data cũ, rồi mới insert mới. Nếu insert lỗi ở giữa (network timeout, Google API fail) → table trống, data mất.
- Mức độ: **data loss** — không có transaction bao quanh clear + insert
- Fix: Dùng transaction PostgreSQL: `BEGIN → TRUNCATE → INSERT → COMMIT`, nếu lỗi `ROLLBACK`.

#### [P1] syncService.js:356 — `await sleep(1000)` cứng trong mỗi sheet
- [ ] Tình huống gây fail: Mỗi sheet bị delay 1 giây cố định trước khi đọc. Với 3500 sheet × 1s = tối thiểu 58 phút chỉ để sleep. Không có lý do kỹ thuật nào cần sleep 1s cứng.
- Mức độ: **hiệu năng cao**
- Fix: Bỏ sleep cứng. Chỉ sleep trong retry (đã có exponential backoff ở L407).

#### [P1] syncService.js:521-525 — Retry NotFound/Permission error — logic sai
- [ ] Tình huống gây fail: File không tồn tại hoặc không có quyền → retry thêm 5 lần × 2s = 10 giây trì hoãn vô nghĩa. NOT_FOUND/PERMISSION là lỗi deterministic, không tự hết khi retry.
- Mức độ: **lãng phí resource + làm chậm sync**
- Fix: Với NOT_FOUND và PERMISSION, fail ngay, không retry.

#### [P1] opController.js:214-215 — `deleteTimeout` 30s trong for loop của UPDATE mode
- [ ] Tình huống gây fail: Nếu DB chậm, `Promise.race` timeout sau 30s và throw "Delete timeout". Tuy nhiên DB vẫn đang chạy DELETE ở background → có thể delete xảy ra sau khi insert đã bắt đầu → data corrupt.
- Mức độ: **data corruption** trong UPDATE mode
- Fix: Dùng DB transaction thay vì race-with-timeout. Timeout nên cancel transaction, không bỏ floating.

### 🟡 Clean/đẹp hơn

#### opController.js:214,250 — `require()` bên trong function body
- [ ] `require("../service/orderService")` được gọi mỗi lần request đến `getOrderTotals` và `getPagedData` (dòng 214, 250). Node.js cache module, nhưng pattern này gây nhầm lẫn khi đọc code.
- Đề xuất: Chuyển lên top của file cùng các import khác.

#### syncService.js:5 — Import `{ db }` không dùng đúng cách
- [ ] `const { db } = require("../config/db")` lấy `db.backtest.TABLE_NAME` và `db.backtest.ALLOWED_COLUMNS`. Cần confirm `db` object có structure này (không thấy export trong config/db).
- Kiểm tra lại: nếu `db` không có `.backtest`, `TABLE_NAME` sẽ là `undefined` và query sẽ fail silent.

#### opController.js:46 — Console.log emoji trong production code
- [ ] Hơn 20 `console.log` với emoji (🚀, ✅, ❌) scattered khắp file — không có structured logging, không có log level.
- Đề xuất: Dùng logger library (winston/pino) với log levels để có thể tắt debug log trong production.

#### syncService.js:23-44 — `processSheetGroups` function không được dùng ở đâu trong codebase
- [ ] Function cũ, bị thay bởi `asyncProcessSheetGroups`. Kiểm tra xem có export dùng ở đâu không — nếu không, xóa.

#### opController.js:438 — `enableGroup4 = true` hardcode
- [ ] `const enableGroup4 = true;` là magic constant inline — nên là param trong config.

#### syncService.js:359 — `type == constants.LOAD_TYPE.DRIVE` dùng `==` thay `===`
- [ ] Loose equality, nên dùng strict `===`.

### 🟢 Hiệu năng

#### syncService.js:178-200 — Tính `success/failed` bằng `Array.from(results.values()).filter()` mỗi file — **cao**
- [ ] Với 3500 sheet, mỗi lần update progress phải iterate toàn bộ Map (`O(n)`). Gọi 2 lần per sheet = 7000 × 3500 = ~24.5M phép so sánh.
- Đề xuất: Dùng counter riêng `let successCount = 0; let failedCount = 0;` tăng/giảm trực tiếp.

#### opController.js:528 — N+1 query đã nêu ở P0 — **cao**

#### syncService.js:264-283 — `recreateMaterializedViewIfNeeded()` chạy sau MỖI sync — **trung**
- [ ] MV được check recreate + refresh sau mỗi sync kể cả sync nhỏ (1 file). Với data lớn, REFRESH MATERIALIZED VIEW tốn vài giây.
- Đề xuất: Chỉ REFRESH, không cần check recreate mỗi lần nếu schema không đổi.

### ✅ Đã tốt (không cần sửa)
- Regex validate tableName `^backtest[a-z0-9_]*$/i` — có, đúng hướng
- Exponential backoff retry cho rate limit / server error / timeout — logic tốt
- `Promise.race([exportPromise, timeoutPromise])` với 60s timeout — phù hợp
- `syncProgressTracker.completeSyncJob / failSyncJob` được gọi đúng trong cả happy path lẫn error path
- `fs.createReadStream(filePath).pipe(res)` cho download log — đúng, không load file vào memory
- Background IIFE `(async () => { ... })()` pattern cho async job — đúng

---

---
## Batch B-03 — opDao.js (dòng 1-681) · materializedViewDao.js (dòng 1-287)
Đọc lúc: 2026-07-02 14:01

### 🔴 Rủi ro

#### [P0] opDao.js:85,237,130 — SQL injection trong UNION ALL của materialized view
- [ ] Tình huống gây fail: `createNewMaterializedView` build UNION ALL bằng string interpolation: `` `SELECT *, '${table}' as source_table FROM ${table}` ``. Dù `table` đã qua `assertBacktestIdentifier`, nếu có bug trong whitelist logic, table name inject thẳng vào DDL query.
- Mức độ: **security breach** — DDL injection có thể DROP VIEW, DROP TABLE
- Code:
```js
const unionQueries = tables.map((table) =>
  `SELECT *, '${table}' as source_table FROM ${table}`
).join(...)
await pool.query(`CREATE MATERIALIZED VIEW ${viewName} AS ${unionQueries}`)
```
- Fix: Dùng `pg-format` cho identifier quoting: `` pg_format(`%I`, table) `` thay vì string interpolation.

#### [P0] materializedViewDao.js:207-217 — Transaction DDL bị broken trên PostgreSQL
- [ ] Tình huống gây fail: PostgreSQL **không hỗ trợ DDL trong transaction** cho `DROP MATERIALIZED VIEW` và `ALTER MATERIALIZED VIEW RENAME` trong cùng BEGIN/COMMIT block theo cách này. Nếu `DROP` xong nhưng `ALTER RENAME` fail → view bị mất hoàn toàn, toàn bộ query sẽ fail với "relation does not exist".
- Mức độ: **data loss / downtime** — tất cả API dùng `mv_all_backtest` đều sập
- Code:
```js
await pool.query("BEGIN");
await pool.query(`DROP MATERIALIZED VIEW IF EXISTS mv_all_backtest CASCADE`);
await pool.query(`ALTER MATERIALIZED VIEW mv_all_backtest_new RENAME TO mv_all_backtest`);
await pool.query("COMMIT");
```
- Fix: PostgreSQL cho phép DDL trong transaction, nhưng nếu `ALTER RENAME` fail sau `DROP`, `ROLLBACK` không thể phục hồi view đã DROP. Thứ tự an toàn: tạo `mv_all_backtest_new` → swap bằng `ALTER` (không DROP trước) → chỉ DROP old sau khi swap thành công. Hoặc dùng `REFRESH MATERIALIZED VIEW CONCURRENTLY` thay vì DROP+RECREATE.

#### [P0] opDao.js:679 — `deleteBacktestTable` bị export 2 lần
- [ ] Dòng 654 và 679 cùng export `deleteBacktestTable`. Node.js sẽ lấy cái sau cùng, nhưng đây là dấu hiệu của copy-paste error, dễ gây confusion.
- Mức độ: **code bug** nhẹ, nhưng tiềm ẩn override export không mong muốn
- Fix: Xóa dòng 679 trùng lặp.

#### [P1] opDao.js:169-175 — `sourceTables` không dùng parameterized query
- [ ] `source_table IN (${safeTables})` build literal string, chỉ dùng `.replace(/[^a-zA-Z0-9_]/g, '')` để sanitize. Đây là whitelist tương đối an toàn nhưng không phải parameterized — nếu sanitize logic có lỗ hổng, vẫn có SQL injection surface.
- Mức độ: **security** — P1 vì sanitize hiện tại khá chắc
- Fix: Dùng `pg-format` với `%I` identifier quoting hoặc parameterized `= ANY($1::text[])`.

#### [P1] opDao.js:383-394 — `countRows` / `sumStrategyProfit` không validate tableName
- [ ] Hai hàm này dùng `` `"${tableName}"` `` string interpolation mà **không gọi** `assertBacktestIdentifier`. Nếu ai gọi trực tiếp với tableName lạ → SQL injection.
- Mức độ: **security** — P1 vì hàm này nội bộ nhưng vẫn là lỗ hổng
- Fix: Thêm `assertBacktestIdentifier(tableName)` ở đầu mỗi hàm.

#### [P1] materializedViewDao.js:5 — `isRebuildingMaterializedView` là in-memory flag (không thread-safe theo cluster)
- [ ] Tình huống gây fail: Nếu Node.js chạy nhiều worker (cluster mode hoặc PM2 cluster), mỗi process có `isRebuildingMaterializedView` riêng → 2 process đồng thời rebuild MV → conflict DDL → crash.
- Mức độ: **downtime** khi scale horizontally
- Fix: Dùng DB advisory lock (`pg_try_advisory_lock`) thay vì in-memory flag.

#### [P1] materializedViewDao.js:73-78 — N+1 query trong `createAllBacktestMaterializedView`
- [ ] Với mỗi table, gọi `checkIfTableExists` và `hasStandardBacktestStructure` riêng = 2N query. Với 10 bảng = 20 query sequential chỉ để build MV.
- Mức độ: **hiệu năng** — slow startup
- Fix: Dùng 1 query JOIN `information_schema` để lấy cả danh sách bảng + cột trong 1 lần.

### 🟡 Clean/đẹp hơn

#### opDao.js:1+3 — Import `adminPool` và `getAppPool` từ cùng 1 file, 2 dòng riêng
- [ ] `const { adminPool } = require("../config/db")` (dòng 1) và `const { getAppPool } = require("../config/db")` (dòng 3) — merge thành 1 destructure.
- Hiện tại: 2 require → Đề xuất: `const { adminPool, getAppPool } = require("../config/db")`

#### opDao.js:104-116 — Comment block dead code
- [ ] Dòng 104-105: comment `/** ✅ Tạo VIEW cho All Backtest... */` nhưng bên dưới ngay lập tức là comment khác. Đây là leftover từ lần refactor cũ. Xóa comment thừa.

#### opDao.js:122-137 — `resolveTableName` có magic string `"allbacktest"` hardcode
- [ ] `"allbacktest"` là alias hardcode, không có constant. Nếu FE đổi giá trị này, phải tìm thủ công.
- Đề xuất: Export constant `const ALL_BACKTEST_ALIAS = "allbacktest"` từ constants.js.

#### materializedViewDao.js:59-103 vs 108-152 — `createAllBacktestMaterializedView` và `ensureMaterializedViewExists` trùng ~80% logic
- [ ] Cả 2 hàm đều: getAllBacktestTables → filter → check structure → create MV + indexes. Code lặp hoàn toàn.
- Đề xuất: Extract thành private `_buildAndCreateMV(tables, viewName)` dùng chung.

#### opDao.js:273-309 — CASE expression symbol priority hardcode 9 symbols
- [ ] Danh sách `BTCUSD, ETHUSD, XAUUSD...` hardcode trong SQL. Nếu thêm symbol mới phải sửa DAO.
- Đề xuất: Đưa vào `constants.js` array, build dynamically.

### 🟢 Hiệu năng

#### opDao.js:533-558 — `getAllBacktestTables` dùng subquery N+1 pattern trong SQL — **trung**
- [ ] SQL dùng correlated subquery: với mỗi table trong `pg_tables`, chạy thêm COUNT từ `information_schema.columns`. Với nhiều bảng sẽ slow.
- Đề xuất: Dùng JOIN thay correlated subquery:
```sql
SELECT t.tablename
FROM pg_tables t
JOIN information_schema.columns c ON c.table_name = t.tablename AND c.table_schema = 'public'
WHERE t.schemaname = 'public' AND t.tablename LIKE 'backtest%'
  AND LOWER(c.column_name) = ANY($1)
GROUP BY t.tablename
HAVING COUNT(DISTINCT LOWER(c.column_name)) = $2
```

#### materializedViewDao.js:259 — `REFRESH MATERIALIZED VIEW CONCURRENTLY` — **tốt, nhưng chú ý**
- [ ] CONCURRENTLY là đúng (không lock reads), nhưng yêu cầu unique index. Nếu unique index bị drop (do DDL lỗi), CONCURRENTLY fail và fallback code cũng không handle đúng.
- Đề xuất: Verify unique index tồn tại TRƯỚC khi refresh, không phải sau khi fail.

#### opDao.js:459-525 — `getBalanceChartData` chạy 2 query (check + actual) — **thấp**
- [ ] Query `checkQuery` (dòng 470) chạy riêng rồi query chính (dòng 489). Kết quả `checkResult` không được dùng gì ngoài logging (implicit). Bỏ query check, chỉ chạy query chính là đủ.

### ✅ Đã tốt (không cần sửa)
- `assertBacktestIdentifier` và `assertSafeIdentifier` được gọi nhất quán ở hầu hết hàm CRUD
- `buildWhereClause` dùng parameterized query `$N` cho tất cả user input — đúng, chống SQL injection
- `ON CONFLICT DO NOTHING` trong `insertRows` — đúng, idempotent insert
- `resolveTableName` + `resolveSourceTableFilter` tách biệt clean, dễ test
- Index đầy đủ cho `time`, `strategy_id`, `symbol`, `year` — đúng
- `isRebuildingMaterializedView` mutex cho single-process — đúng với single-instance deployment
- `REFRESH MATERIALIZED VIEW CONCURRENTLY` không lock reads — đúng production pattern

---

---
## Batch B-04 — strategyController.js (dòng 1-486) · strategyService.js (dòng 1-413)
Đọc lúc: 2026-07-02 14:04

### 🔴 Rủi ro

#### [P1] strategyController.js:244 — `backtestTable` lấy từ quá nhiều nguồn không nhất quán
- [ ] Tình huống gây fail: `deleteStrategy` lấy `backtestTable` từ `req.params.backtestTable || req.query.backtest_table || req.query.backtestTable || req.body?.backtest_table || req.body?.backtestTable` — 5 nguồn khác nhau. Nếu nhiều nguồn đồng thời có giá trị khác nhau, logic fallback sẽ dùng cái đầu tiên mà không báo lỗi. Dễ bị attacker inject giá trị ngầm qua body.
- Mức độ: **sai kết quả** — xóa nhầm table
- Fix: Chỉ chấp nhận 1 nguồn cố định (ví dụ chỉ `req.params` hoặc chỉ `req.query`), throw 400 nếu không có.

#### [P1] strategyController.js:407-433 — `downloadSheet` không validate `sheetId` format
- [ ] Tình huống gây fail: `sheetId` chỉ check `if (!sheetId)` — nhưng không validate format. Attacker có thể truyền `sheetId = "../../../etc/passwd"` hoặc arbitrary Google Drive file ID để download file ngoài scope (nếu service account có quyền).
- Mức độ: **security** — unauthorized file access via Google Drive
- Fix: Validate `sheetId` match pattern `/^[a-zA-Z0-9_-]{25,60}$/` (Google Drive file ID format).

#### [P1] strategyController.js:409 — `filename` query param không sanitize, dùng trực tiếp trong Content-Disposition
- [ ] Tình huống gây fail: `filename` từ query được `encodeURIComponent` nhưng nếu value quá dài hoặc chứa ký tự đặc biệt, có thể gây HTTP header injection.
- Mức độ: **security** — HTTP response splitting tiềm năng
- Fix: Strip tất cả ký tự ngoài `[a-zA-Z0-9_-]`, giới hạn length.

#### [P1] strategyService.js:8 — Cache TTL 7 ngày quá dài cho production data
- [ ] Tình huống gây fail: Cache strategy list trong 7 ngày. Nếu sync mới được thực hiện và `clearStrategyCache` không được gọi đúng context (ví dụ sync từ worker khác), user thấy data cũ suốt 7 ngày.
- Mức độ: **sai kết quả** — stale data hiển thị như data thật
- Fix: Giảm TTL xuống 30-60 phút, hoặc implement cache invalidation event-based khi sync complete.

#### [P1] strategyService.js:13-21 — Cache key generation dùng `JSON.stringify(filterOperators)` nhưng object key order không đảm bảo
- [ ] Tình huống gây fail: `{a:1, b:2}` và `{b:2, a:1}` → `JSON.stringify` cho kết quả khác nhau → 2 cache key khác nhau cho cùng 1 query → cache miss mãi mãi, cache phình to vô tận.
- Mức độ: **memory leak** + **hiệu năng**
- Code:
```js
filterOperators: JSON.stringify(filterOperators || {}),
```
- Fix: Sort keys trước khi stringify: `JSON.stringify(Object.keys(obj).sort().reduce(...))` hoặc dùng stable-stringify library.

### 🟡 Clean/đẹp hơn

#### strategyController.js:77-95 — `console.log` filter params mỗi request
- [ ] Log toàn bộ filter params mỗi GET request → spam logs trong production (user filter liên tục). Xóa hoặc để ở level DEBUG.

#### strategyController.js:307-325 — `console.log` IDs Only - lặp lại pattern của getStrategies
- [ ] Cùng pattern log filter params 2 lần (dòng 77 và 307). Extract thành helper `logFilterParams(label, params)`.

#### strategyController.js:365-386 — `require()` bên trong function body (2 lần)
- [ ] `require("../service/ggSheetService")` trong `getServiceAccountEmails` (L367) và `getStrategyIdsFromFolder` (L450) — nên chuyển lên top file.

#### strategyService.js:1-3 — Comment header không cần thiết
- [ ] `// FILE: service/strategyService.js - OPTIMIZED WITH CACHE` — redundant, tên file đã nói lên điều này.

#### strategyService.js:247-263 — `clearStrategyCache` iterate toàn bộ Map để tìm key theo substring
- [ ] Với cache lớn (nhiều filter combination), iterate O(n) Map mỗi lần clear theo table. Thiết kế lại key structure để có thể clear theo prefix nhanh hơn.

#### strategyController.js:241-277 — `deleteStrategy` thiếu validation `strategyId`
- [ ] `strategyId` lấy từ `req.params` nhưng không check null/empty/format trước khi truyền xuống DAO.

### 🟢 Hiệu năng

#### strategyService.js:59-83 — Cache key quá dài với 20+ params — **trung**
- [ ] Cache key build từ ~20 params → key string rất dài. Với nhiều filter combination → Map size tăng nhanh, không có giới hạn kích thước cache.
- Đề xuất: Giới hạn `strategyCache.size <= 500`. Dùng LRU eviction hoặc khi cache đầy thì clear entry cũ nhất.

#### strategyService.js:386-401 — `getStrategiesByTimeRange` không cache — **trung**
- [ ] Comment nói "KHÔNG cache vì kết quả thay đổi theo date range động" — nhưng cùng date range + filter gọi lại vẫn query DB mới. Có thể cache ngắn hạn (5 phút) với key bao gồm date range.

#### strategyController.js:98-129 — Routing logic trong controller — **thấp**
- [ ] `if (start_date && end_date)` routing sang `getStrategiesByTimeRange` là business logic, nên nằm trong service layer, không phải controller.

### ✅ Đã tốt (không cần sửa)
- `parseJsonQuery` helper tách riêng, có try-catch và custom error với status 400 — đúng
- `clearStrategyCache(backtestTable)` hỗ trợ cả clear theo table lẫn clear all — đúng
- `getCacheStats()` để monitoring — tốt
- `isCacheValid` check đơn giản, nhất quán — đúng
- `getPreferences` / `savePreferences` đều validate payload trước khi gọi DAO — đúng
- `getStrategyIdsOnly` không cache theo page/pageSize (IDs không phụ thuộc pagination) — đúng thiết kế

---

---
## Batch B-05 — strategyMetadataDao.js (dòng 1-1050)
Đọc lúc: 2026-07-02 14:15

### 🔴 Rủi ro

#### [P0] strategyMetadataDao.js:933 — `getAggregatedFilteredStats` được export TRƯỚC khi định nghĩa (L940)
- [ ] Tình huống gây fail: `module.exports` ở dòng 914-934 reference `getAggregatedFilteredStats` — nhưng hàm này định nghĩa ở dòng 940, **sau** `module.exports`. Trong CommonJS, điều này hoạt động vì JavaScript hoisting function declaration — nhưng đây là `async function` (function declaration không phải arrow), nên HOISTING CÓ XẢY RA và không lỗi runtime. Tuy nhiên đây là anti-pattern nguy hiểm: nếu ai refactor thành arrow function (`const getAggregatedFilteredStats = async (...) => {}`), code sẽ crash với `getAggregatedFilteredStats is not a function`.
- Mức độ: **latent bug** — refactor dễ gây production crash
- Fix: Di chuyển `module.exports` xuống cuối file, sau tất cả function definitions.

#### [P0] strategyMetadataDao.js:681-684 — JSONB filter `type` dùng string concatenation không parameterized
- [ ] Tình huống gây fail: Filter `type = "buy"/"sell"` append string SQL trực tiếp:
```js
query += " AND (settings->'inputs'->>'AcceptBuy' IN ('true', '1') OR ...)"
```
- Nhưng `type` value từ user input chỉ được check `=== "buy"/"sell"` ở controller/service — nếu có bug ở tầng trên (hoặc call trực tiếp), string append có thể inject SQL.
- Mức độ: **security** — P0 vì đây là JSONB raw SQL append
- Fix: Giữ whitelist check `type === "buy" || type === "sell"` trong DAO trước khi append, không chỉ tin vào tầng trên.

#### [P1] strategyMetadataDao.js:220-250 — `getPagedStrategies` chạy `buildFilterClauses` 2 lần riêng biệt
- [ ] Tình huống gây fail: Filter clauses được build 2 lần hoàn toàn độc lập — 1 cho `query` và 1 cho `countQuery`. Nếu logic trong `buildFilterClauses` có side-effect hoặc kết quả không deterministic (ví dụ order của params thay đổi), 2 kết quả có thể khác nhau → count sai, pagination sai.
- Mức độ: **sai kết quả** — count và data không match
- Fix: Dùng chung 1 filter result: `const filterResult = buildFilterClauses(...)` rồi dùng cho cả query lẫn countQuery.

#### [P1] strategyMetadataDao.js:316-326 — Debug code `console.log` field scan trong production
- [ ] Tình huống gây fail: Dòng 316-326 có code debug: khi filter `riskRewardRatio` được set, log toàn bộ possible field names của row đầu tiên ra console mỗi request. Trong production với nhiều request = spam logs, lộ cấu trúc data nội bộ.
- Mức độ: **info leak** + **log spam**
- Fix: Xóa toàn bộ debug block này.

#### [P1] strategyMetadataDao.js:473-532 — `batchUpsertStrategies` dùng transaction nhưng chạy N INSERT riêng lẻ
- [ ] Tình huống gây fail: Trong transaction, gọi `client.query()` N lần trong vòng for loop. Với 3500 strategies = 3500 round-trip DB trong 1 transaction. Đây là sequential (mỗi INSERT đợi cái trước), không parallel và không batch.
- Mức độ: **hiệu năng cao** — thay thế bằng bulk INSERT
- Fix: Dùng `pg-format` để build 1 query `INSERT ... VALUES ($1,$2,...), ($3,$4,...), ...` với tất cả rows.

#### [P1] strategyMetadataDao.js:256-309 — Sort ORDER BY expression dùng string interpolation với `safeDir`
- [ ] `safeDir = sortDir === 'asc' ? 'ASC' : 'DESC'` rồi dùng `${safeDir}` trong query — đây là whitelist bảo vệ đủ, nhưng toàn bộ ORDER BY expression (ví dụ `(results->>'sharpeRatio')::numeric ${safeDir}`) được build bằng string interpolation, không parameterized.
- Mức độ: **P1 security** — ORDER BY không thể parameterized trong PostgreSQL, cách hiện tại là đúng nhưng cần documented rõ để tránh "mở rộng nhầm".

### 🟡 Clean/đẹp hơn

#### strategyMetadataDao.js:288-309 + 841-864 — Symbol CASE priority hardcode 2 nơi
- [ ] Cùng CASE expression symbol priority xuất hiện ở dòng 288-309 (`getPagedStrategies`) và dòng 841-864 (`getStrategyIdsOnly`) — duplicate hoàn toàn. Extract thành const SQL snippet dùng chung.

#### strategyMetadataDao.js:596 — `batchGetStrategyDealsCounts` catch error trả về `{}` thay vì throw
- [ ] Khi query fail (không phải bảng không tồn tại), hàm catch lỗi và trả về `{}` (object rỗng) — caller nhận `quantity = 0` cho tất cả strategies mà không biết có lỗi. Silent failure.
- Đề xuất: Log warning + trả về `{}` (đủ để không crash), nhưng đồng thời expose error metric.

#### strategyMetadataDao.js:912 — `require` ở giữa file
- [ ] `const { getStrategiesByTimeRange } = require("./strategyTimeRangeDao")` ở dòng 912, giữa các function và module.exports. Nên chuyển lên top file cùng các imports.

#### strategyMetadataDao.js:628-793 — `getStrategyIdsOnly` duplicate toàn bộ filter logic với `getPagedStrategies`
- [ ] Hai hàm share cùng filter logic (backtestTable, symbol, search, timeframe, type, pd, totalNetProfit, ...) nhưng build SQL hoàn toàn riêng lẻ. Nếu thêm filter mới phải sửa 2 chỗ.
- Đề xuất: Extract filter logic vào `buildFilterClauses` helper đã tồn tại, cả 2 hàm dùng chung (hiện tại `getPagedStrategies` đã dùng `buildFilterClauses` từ `strategyFilterHelper`, nhưng `getStrategyIdsOnly` thì không — chỉ dùng `safeOp`).

### 🟢 Hiệu năng

#### strategyMetadataDao.js:338-354 — Batch deal counts đã tối ưu — **tốt, nhưng vẫn cần verify**
- [ ] `batchGetStrategyDealsCounts` group strategies theo table và dùng `ANY($1::text[])` — đây là đúng, tránh N+1. Nhưng mỗi request vẫn chạy 1 query per distinct backtest_table trong page. Với page 20 rows từ 3 bảng = 3 queries — chấp nhận được.

#### strategyMetadataDao.js:961-998 — `getAggregatedFilteredStats` có query rất nặng — **trung**
- [ ] Query này tính AVG, PERCENTILE_CONT, COUNT(CASE WHEN...) cho 8+ metrics trên toàn bộ filtered strategy_metadata. Với 300k+ rows không có filter, có thể mất vài giây. Cần index trên `results` JSONB fields nếu query này được gọi thường xuyên.
- Đề xuất: Add GIN index hoặc expression index cho các field hay dùng: `(results->>'totalNetProfit')::numeric`, `(results->>'profitFactor')::numeric`.

#### strategyMetadataDao.js:538-557 — `getStrategyDealsCount` (single) cần checkIfTableExists trước mỗi call — **thấp**
- [ ] `checkIfTableExists` gọi thêm 1 query trước mỗi count query. Nếu gọi nhiều lần liên tiếp, overhead tăng. Cache table existence result trong TTL ngắn (1-5 phút).

### ✅ Đã tốt (không cần sửa)
- `batchUpsertStrategies` dùng `BEGIN/COMMIT/ROLLBACK` + `client.release()` trong finally — đúng
- `upsertStrategyMetadata` với `ON CONFLICT DO UPDATE` — đúng, idempotent
- `getDistinctSymbols` hỗ trợ comma-separated multi-select bằng `IN (...)` parameterized — đúng
- `buildFilterClauses` + `safeOp` được import từ helper riêng — đúng, tách separation of concern
- `initStrategyMetadataTable` dùng `CREATE TABLE IF NOT EXISTS` + indexes — đúng
- `saveUserPreferences` dùng upsert `ON CONFLICT DO UPDATE` — đúng

---

---
## Batch B-06 — opService.js (dòng 1-354)
Đọc lúc: 2026-07-02 14:22

### 🔴 Rủi ro

#### [P0] opService.js:222 — ReferenceError: authClients is not defined
- [ ] Tình huống gây fail: Trong hàm `updateRowsByColumn` (dòng 222), có sử dụng biến `authClients`: `const auth = authClients[index % authClients.length]`. Tuy nhiên, `authClients` không hề được import hay định nghĩa trong file `opService.js` (nó chỉ được import ở `syncService.js`). Khi API `updateRow` được gọi, hệ thống sẽ crash ngay lập tức.
- Mức độ: **downtime / crash API**
- Code:
```javascript
const auth = authClients[index % authClients.length];
```
- Fix: Thêm import `const authClients = require("../config/multiServiceAccounts");` lên đầu file.

#### [P1] opService.js:231-247 — Hàm `getDataBySheetName` lấy column sai lệch dựa trên thứ tự query key
- [ ] Tình huống gây fail: Hàm lấy `const column = queryKeys[0];` để làm tên cột. Nếu request query truyền dạng `?tableName=backtest_test&strategy_id=bot1`, key đầu tiên là `tableName` chứ không phải cột cần filter. Logic sẽ chạy sai hoàn toàn, coi `tableName` là tên cột và giá trị là `backtest_test`.
- Mức độ: **sai logic nghiêm trọng / data corruption**
- Code:
```javascript
const queryKeys = Object.keys(query);
const column = queryKeys[0];
const rawValue = query[column];
```
- Fix: Định nghĩa tham số rõ ràng trong query (ví dụ: `?column=strategy_id&values=bot1,bot2`) thay vì phán đoán theo thứ tự key của object query.

#### [P1] opService.js:153 — Double-escape ký tự single quote gây sai lệch data
- [ ] Tình huống gây fail: Dòng 153 xử lý chuỗi: `return String(value).replace(/'/g, "''")`. Tuy nhiên, DAO `insertRows` lại tiếp tục dùng `pg-format` với placeholder `%L` (tự động escape single quote lần nữa). Hậu quả là chuỗi như `Lotus's` sẽ được lưu vào DB dưới dạng `Lotus''s` (bị double escape).
- Mức độ: **sai lệch dữ liệu hiển thị**
- Code:
```javascript
return String(value).replace(/'/g, "''");
```
- Fix: Không tự ý escape bằng tay ở service layer nếu bên dưới DAO đã dùng thư viện format an toàn như `pg-format`.

### 🟡 Clean/đẹp hơn

#### opService.js:168 + 229 — `require("./syncService")` bị lặp lại ở hai vị trí khác nhau
- [ ] File `syncService` được require ở dòng 168 và dòng 229. Nên gộp chung lại và để ở vị trí hợp lý (ví dụ: ngay đầu hàm cần dùng hoặc gom chung lại ở giữa file nếu muốn tránh circular dependency lúc start).

#### opService.js:133-158 — Logic parse từng hàng (Volume, type cast) nên tách riêng
- [ ] Vòng lặp `for (const row of data)` chứa nhiều logic parsing phức tạp cho từng kiểu dữ liệu. Tách logic này thành một function helper riêng biệt (ví dụ: `parseRowValues(row, headers)`) để code dễ đọc và dễ test unit.

### 🟢 Hiệu năng

#### opService.js:254-259 — `Promise.all` song song 4 truy vấn nặng — **tốt**
- [ ] Việc dùng `Promise.all` để chạy đồng thời `getDataPage`, `getTotalCount`, `getTotalCountDisplayed`, `getTotals` giúp tối ưu hóa latency cực tốt thay vì chạy tuần tự (`await` từng cái).

### ✅ Đã tốt (không cần sửa)
- `clearAllCaches` dọn dẹp cache một cách triệt để trên nhiều service khác nhau bằng dynamic require nhằm tránh circular dependency — đúng thiết kế.
- `validateBacktestTableName` được gọi nhất quán trước các hành động drop table, clear data, delete rows — bảo vệ tốt.
- `filterCache` có cơ chế kiểm tra TTL 5 phút chuẩn xác — đúng.

---

---
## Batch B-06 Alt — strategyFilterHelper.js (dòng 1-255) · strategyTimeRangeDao.js (dòng 1-499)
Đọc lúc: 2026-07-02 14:28

### 🔴 Rủi ro

#### [P0] strategyTimeRangeDao.js:236 — SQL Injection nguy hiểm qua double quote interpolation
- [ ] Tình huống gây fail: Biến `backtestTable` được truyền từ FE và nội suy trực tiếp vào query DDL/DML CTE:
  `FROM ${useAllBacktest ? "mv_all_backtest b" : `"${backtestTable}" b`}`
  Nếu FE hoặc kẻ tấn công gửi lên giá trị chứa dấu ngoặc kép dạng `backtest"; DROP TABLE strategy_metadata; --`, SQL query sẽ bị ngắt và thực thi câu lệnh DROP TABLE nguy hiểm.
- Mức độ: **hủy hoại database / SQL Injection**
- Fix: Cần chạy hàm `assertBacktestIdentifier(backtestTable)` để validate tên bảng trước khi ghép vào chuỗi SQL hoặc dùng `pg-format` `%I` để quote identifier một cách an toàn.

#### [P1] strategyTimeRangeDao.js:474 — Chạy 2 query CTE cực nặng song song (data và count)
- [ ] Tình huống gây fail: `countQuery` lập lại 100% logic tính toán của `query` (gồm 3 tầng CTE, 2 hàm window functions để tính cumulative profit và drawdown) chỉ để lấy `COUNT(*)`. Điều này làm nhân đôi tải trọng DB cho mỗi request phân trang. Với dữ liệu hàng triệu deal, DB sẽ bị nghẽn (CPU 100%).
- Mức độ: **hiệu năng cực thấp / nghẽn DB**
- Fix: Cache count kết quả hoặc đơn giản hóa `countQuery` bằng cách không dùng các CTE window function (`backtest_cumulative_profit`, `backtest_with_drawdown`), chỉ đếm số strategy duy nhất khớp với filter cơ bản là đủ.

### 🟡 Clean/đẹp hơn

#### strategyFilterHelper.js:217-233 — Trùng lặp biểu thức tính Drawdown / PD giữa helper và range filter
- [ ] Logic tính toán `pd` và `drawdown` bằng regexp/split_part lặp đi lặp lại nhiều lần.
- Đề xuất: Gom các biểu thức SQL này thành constants ở đầu file helper để tái sử dụng.

#### strategyTimeRangeDao.js:63 — Tự động chuyển đổi `sortBy === "quantity"` sang `"total_orders"`
- [ ] Việc ngầm định đổi tên cột sort này dễ gây nhầm lẫn nếu FE không đồng bộ. Nên quy hoạch chung một tên field duy nhất cho cả FE và BE.

### 🟢 Hiệu năng

#### strategyTimeRangeDao.js:248-272 — Sử dụng Window Functions liên tiếp trên tập dữ liệu lớn — **trung**
- [ ] Hai hàm window functions `SUM() OVER(...)` và `MAX() OVER(...)` chạy trên partition `strategy_id` sắp xếp theo `deal` sẽ tốn rất nhiều RAM/CPU của PostgreSQL khi lọc khoảng thời gian dài.
- Đề xuất: Nếu có thể, hãy lưu trữ drawdown lũy kế theo ngày hoặc theo mốc thời gian cố định thay vì tính toán động từ deal thô trên mỗi request.

### ✅ Đã tốt (không cần sửa)
- `safeOp` kiểm tra whitelist chặt chẽ các toán tử so sánh (`>=`, `<=`, `=`, v.v.) bảo vệ chống SQL Injection qua operator.
- Hỗ trợ multi-symbol bằng cách tự động split comma và sinh query dynamic sử dụng placeholder `$paramIdx` an toàn.

---
## Batch B-07 — dashboardDao.js (dòng 1-999)
Đọc lúc: 2026-07-02 14:33

### 🔴 Rủi ro

#### [P0] dashboardDao.js:35,90,184,228,278,306,396 — SQL Injection nghiêm trọng qua tableName interpolation
- [ ] Tình huống gây fail: Hầu hết các hàm truy vấn dashboard (`getDashboardOverview`, `getMonthlyProfit`, `getTopSymbols`, `getProfitDistribution`, `getStreakAnalysis`, `getYearlyComparison`, `getDetailedReport`) đều truyền `tableName` từ user input và nội suy trực tiếp vào câu lệnh SQL: `FROM "${tableName}"`.
- Mức độ: **hủy hoại database / SQL Injection**
- Fix: Bắt buộc gọi `assertBacktestIdentifier(tableName)` trước khi đưa vào câu lệnh SQL để validate hoặc so sánh whitelist với danh sách bảng thực tế có trong database.

#### [P1] dashboardDao.js:270-291 — Hàm `getStreakAnalysis` hoàn toàn bỏ qua bộ lọc thời gian
- [ ] Tình huống gây fail: Hàm `getStreakAnalysis` chỉ nhận `tableName` mà không nhận `year`, `startDate`, `endDate`. Khi user lọc khoảng thời gian trên UI Dashboard, biểu đồ thắng/thua liên tiếp vẫn sẽ hiển thị kết quả của toàn bộ lịch sử backtest, gây bất nhất dữ liệu hiển thị.
- Mức độ: **sai lệch logic hiển thị**
- Fix: Sửa hàm để nhận `year`, `startDate`, `endDate`, build where clause và truyền params tương tự như các hàm khác.

#### [P1] dashboardDao.js:271-290 — Hàm `getStreakAnalysis` chạy Window Function cực nặng trên toàn bộ deal
- [ ] Tình huống gây fail: Query sử dụng `LAG() OVER (PARTITION BY strategy_id ORDER BY time)` trên toàn bộ bảng deal (hoặc view `mv_all_backtest` chứa hàng triệu row) mà không hề có phân trang hay giới hạn số dòng. Mỗi lần mở dashboard, DB sẽ phải quét và sắp xếp cực lớn gây nghẽn CPU.
- Mức độ: **hiệu năng cực thấp / nghẽn DB**
- Fix: Giới hạn tính toán streak chỉ trên top X strategies hoặc áp dụng khoảng thời gian mặc định ngắn hơn nếu không chọn filter.

### 🟡 Clean/đẹp hơn

#### dashboardDao.js:333 — Comment dư thừa `// exports moved to bottom`
- [ ] Đoạn comment rác ở dòng 333, không có giá trị tài liệu, nên xóa bỏ để code gọn gàng hơn.

#### dashboardDao.js:350-357 — Trùng lặp biểu thức trích xuất JSONB (drawdown, profit ratio)
- [ ] Các biểu thức như `CAST(SUBSTRING(results->>'balanceDrawdownMaximal' ...))` lặp lại nhiều lần ở dòng 350-357 và dòng 788-790. Nên gom thành helper function/constant SQL snippet để dễ quản lý.

### 🟢 Hiệu năng

#### dashboardDao.js:412-415 — Chạy song song 2 query `pnlQuery` và `metricsQuery` bằng `Promise.all` — **tốt**
- [ ] Tối ưu hóa được latency cho Detailed Report bằng cách chạy đồng thời 2 query tính toán độc lập.

### ✅ Đã tốt (không cần sửa)
- Hàm `buildDashboardWhereClause` chuẩn hóa các tham số lọc thời gian (`startDate`, `endDate`, `year`) sử dụng parameterized query một cách an toàn và nhất quán.
- `getTopStrategies` lọc danh sách có điều kiện `>= 100 trades` để loại bỏ các strategy ảo/outliers — đúng nghiệp vụ.
- Biểu đồ phân phối lợi nhuận (`getProfitDistribution`) sắp xếp cứng các khoảng (range) bằng `CASE profit_range WHEN ...` giúp dữ liệu trả về frontend luôn theo thứ tự tăng dần chuẩn xác.

---
## Batch B-08 — dashboardService.js (dòng 1-490) · dashboardController.js (dòng 1-79)
Đọc lúc: 2026-07-02 14:36

### 🔴 Rủi ro

#### [P0] dashboardController.js:9 — tableName nhận trực tiếp từ user query mà không validate
- [ ] Tình huống gây fail: Biến `tableName` được lấy trực tiếp từ `req.query` và chuyển thẳng vào `dashboardService.getDashboardData` -> gọi xuống `dashboardDao` mà không qua bất kỳ hàm kiểm tra định dạng hay validate tên bảng nào. Khi kết hợp với lỗi SQL Injection ở `dashboardDao` (B-07), kẻ tấn công có thể dễ dàng khai thác.
- Mức độ: **hủy hoại database / SQL Injection**
- Fix: Thêm hàm validate: `validateBacktestTableName(tableName)` (hoặc check `assertBacktestIdentifier`) ngay tại controller trước khi chuyển tiếp xử lý.

#### [P1] dashboardService.js:401,403 — Hai hàm thống kê bỏ qua filter thời gian (year / startDate / endDate)
- [ ] Tình huống gây fail: Trong `Promise.all` của `getDashboardData`, `getFileOptimizationSummary` và `getQualityDistribution` chỉ được truyền tham số `tableName` mà bỏ qua `year`, `startDate`, `endDate`. Dẫn tới kết quả của 2 card này luôn tĩnh (dựa trên toàn bộ lịch sử) kể cả khi user áp dụng bộ lọc thời gian.
- Mức độ: **sai lệch logic hiển thị**
- Code:
```javascript
dashboardDao.getFileOptimizationSummary(tableName),
...
dashboardDao.getQualityDistribution(tableName),
```
- Fix: Chuyển các filter thời gian vào hai hàm này để đồng bộ dữ liệu.

#### [P1] strategyController.js & dashboardService.js — Lỗi stale cache khi xóa strategy
- [ ] Tình huống gây fail: Khi admin thực hiện xóa một strategy (qua `deleteStrategy` ở controller), hệ thống chỉ xóa cache của `strategyService` mà quên không dọn dẹp cache của `dashboardService`. Kết quả là biểu đồ, số liệu tổng quan trên Dashboard vẫn chứa dữ liệu của strategy đã bị xóa trong vòng 7 ngày (TTL của cache dashboard là 7 ngày).
- Mức độ: **sai lệch dữ liệu nghiêm trọng do cache stale**
- Fix: Thêm lệnh gọi `dashboardService.clearDashboardCache(backtestTable)` vào API `deleteStrategy` sau khi xóa thành công.
#### [P1] dashboardService.js:19-20 — Giữ nguyên Cache TTL 7 ngày (Cố ý) & Chủ động xóa cache khi thay đổi dữ liệu
- [x] **CỐ Ý / KHÔNG GIẢM TTL** (Theo chỉ thị của đại ca Xuân Sơn: vì dữ liệu web nội bộ là dữ liệu backtest tĩnh, ít thay đổi, việc giữ nguyên 7 ngày cache giúp tối ưu hiệu năng tối đa).
- Mức độ: **hiệu năng / không đồng bộ dữ liệu** (Sẽ xử lý bằng cách xóa cache ngay khi sync hoặc xóa dữ liệu)
- Fix: Giữ nguyên TTL 7 ngày, chỉ sửa logic gọi hàm xóa cache cục bộ (`clearDashboardCache()`, `clearStrategyCache()`,...) khi có thao tác Sync hoặc Delete thành công để đảm bảo dữ liệu luôn mới nhất mà không cần giảm TTL.

### 🟡 Clean/đẹp hơn

#### dashboardService.js:22-40 — Redefine các hàm toán học cơ bản (toNumber, round, safeDivide, clamp)
- [ ] Các hàm utility toán học này lặp lại ở nhiều file.
- Đề xuất: Gom vào một file `mathUtils.js` hoặc `utils.js` dùng chung cho toàn bộ backend để tái sử dụng và dễ viết unit test.

#### dashboardService.js:379-381 — Log debug vẫn được giữ ở môi trường production
- [ ] `console.log` dạng cache miss và params in ra console ở mỗi request không cần thiết cho production, nên thay bằng logger có chia cấp độ (debug/info/error).

### 🟢 Hiệu năng

#### dashboardService.js:383-405 — Sử dụng `Promise.all` gom 10 luồng xử lý song song — **tốt**
- [ ] Tận dụng tối đa khả năng I/O non-blocking của Node.js để chạy đồng thời toàn bộ thống kê dashboard giúp giảm tổng thời gian phản hồi (response time) xuống mức thấp nhất.

### ✅ Đã tốt (không cần sửa)
- Các hàm tính toán điểm chất lượng (Sharpe score, Concentration score, Final performance score) được chuẩn hóa và cài đặt giới hạn chặn trên/chặn dưới rõ ràng bằng logic toán học chặt chẽ.
- Có cơ chế bắt lỗi bảng không tồn tại (`code === '42P01'`) để trả về state rỗng thay vì làm sập toàn bộ API — tốt.

---
## Batch B-09 — behaviorAnalysisDao.js (dòng 1-811)
Đọc lúc: 2026-07-02 14:38

### 🔴 Rủi ro

#### [P1] behaviorAnalysisDao.js:607-637 — Chạy song song 14 query phân tích cực kỳ nặng qua `Promise.all`
- [ ] Tình huống gây fail: Hàm `getBehaviorAnalysis` kích hoạt 14 query SQL đồng thời trên `mv_all_backtest` (chứa toàn bộ lịch sử deal). Nhiều query trong số này chứa window function (`LAG`, `SUM OVER`, `ROW_NUMBER`), regexp match, group by lớn. Việc chạy song song 14 query này dễ làm cạn kiệt connection pool của PostgreSQL, đẩy CPU DB lên 100% và gây timeout cho các API nghiệp vụ khác.
- Mức độ: **hiệu năng cực thấp / nghẽn DB nghiêm trọng**
- Fix: Gom nhóm và chia nhỏ các query để chạy tuần tự hoặc cache kết quả phân tích theo ngày/giờ (vì hành vi giao dịch không thay đổi liên tục).

#### [P1] behaviorAnalysisDao.js:371-386 — Hardcode năm 2020-2023 trong query Volatility Regime
- [ ] Tình huống gây fail: Volatility Regime chia nhóm năm `High-Vol (2020, 2022)` và `Low-Vol (2021, 2023)` cứng trong SQL. Nếu dữ liệu của user là các năm 2024, 2025, 2026 thì biểu đồ này sẽ trả về dữ liệu trống hoặc sai lệch.
- Mức độ: **sai logic nghiệp vụ khi scale thời gian**
- Fix: Không hardcode năm trong SQL. Nên tính toán độ biến động (volatility) của từng năm một cách động dựa trên độ lệch chuẩn (Standard Deviation) của lợi nhuận hoặc cho phép truyền cấu hình từ file config.

#### [P1] behaviorAnalysisDao.js:282-305 — Hardcode danh sách năm 2019-2026 trong Annual Stability
- [ ] Tình huống gây fail: Kiểm tra tính ổn định năm của robot bằng cách sum profit cứng của từng năm từ 2019 đến 2026: `y19, y20, y21...`. Nếu backtest mở rộng sang năm 2027, 2028, logic này sẽ bỏ qua và không chấm điểm robot chuẩn xác.
- Mức độ: **thiếu khả năng bảo trì / mở rộng**
- Fix: Sử dụng câu lệnh dynamic pivot hoặc chuyển đổi dữ liệu dạng hàng dọc (vertical list) lên frontend để tự pivot động.

### 🟡 Clean/đẹp hơn

#### behaviorAnalysisDao.js:525 — Trích xuất EPOCH thủ công
- [ ] `EXTRACT(EPOCH FROM (exit_time - entry_time)) / 60.0` để đổi ra phút.
- Đề xuất: Đảm bảo kiểm tra chênh lệch múi giờ nếu entry/exit time được import từ nguồn không đồng nhất.

### ✅ Đã tốt (không cần sửa)
- **Thiết kế an toàn chống SQL Injection**: Khác với `dashboardDao`, file này query trực tiếp từ `mv_all_backtest` và lọc theo `source_table = $1` qua parameterized query, hoàn toàn không ghép chuỗi tên bảng (`FROM "${tableName}"`) -> Rất tốt và an toàn.
- Logic gộp HTR (Holding Time Ratio) và VEI (Volume Escalation Index) ở service/DAO để xếp loại rủi ro (Martingale Risk, Loss Averse, Critical Risk) rất mạch lạc.

---
## Batch B-10 — riskAnalysisDao.js (dòng 1-657) · riskAnalysisService.js (dòng 1-132)
Đọc lúc: 2026-07-02 14:42

### 🔴 Rủi ro

#### [P1] riskAnalysisDao.js:245-253 vs 299-307 — Lỗi lệch index ánh xạ Hard Flags khiến 3 flag bị tắt hoàn toàn
- [ ] Tình huống gây fail: 
  - Trong SQL (dòng 245-253), các cột cờ cứng được gán là `f1, f2, f3, f4, f5, f6 (FALSE), f7 (FALSE), f8 (FALSE), f9 (Largest Loss Ratio)`.
  - Trong JS (dòng 299-307), `HARD_FLAG_DEFS` chỉ có **8 phần tử** và được gán tự động `col = f${idx+1}` (tương đương `f1` tới `f8`).
  - Hậu quả:
    1. Cột `f9` (thực tế chứa logic Largest Loss Ratio) **không bao giờ được JS đọc** (vì JS chỉ lặp tới `f8`).
    2. Cờ ID 7 (EOT Ratio), ID 8 (Recent Decay Negative) và ID 33 (Largest Loss Ratio) bị map nhầm vào `f6, f7, f8` (vốn đang hardcode là `FALSE` trong SQL). 
    3. Kết quả là 3 cờ quan trọng này **luôn luôn trả về FALSE** (không bao giờ cảnh báo robot lỗi).
- Mức độ: **sai lệch logic nghiệp vụ nghiêm trọng (sót lỗi cảnh báo rủi ro robot)**
- Fix: Sắp xếp lại thứ tự khai báo trong `HARD_FLAG_DEFS` khớp 1-1 với thứ tự `f1-f9` trong SQL, và sửa vòng lặp trong JS để hỗ trợ đầy đủ các cờ.

### 🟡 Clean/đẹp hơn

#### riskAnalysisDao.js:296-307 — Định nghĩa cờ cứng (Hard flags) phân tán giữa SQL và JS
- [ ] Logic tính toán của hard flag nằm ở câu lệnh SELECT trong SQL, trong khi định nghĩa title/id nằm ở JS. Điều này gây khó khăn khi cần sửa đổi hoặc thêm cờ mới (phải sửa song song cả 2 nơi và dễ gây ra lỗi lệch index như P1 nêu trên).
- Đề xuất: Gom toàn bộ định nghĩa cờ cứng vào một nơi, build query SQL động tương tự như soft flags hoặc ngược lại.

### 🟢 Hiệu năng

#### riskAnalysisDao.js:609-622 — Cơ chế `skipCharts: true` tối ưu hóa thông minh — **tốt**
- [ ] Khi chỉ cần lấy thông tin overview cho widget dashboard, service set `skipCharts: true` giúp bỏ qua 4 query phân tích biểu đồ cực nặng, giảm thiểu tối đa tải cho DB khi load trang chủ.

### ✅ Đã tốt (không cần sửa)
- DAO query an toàn chống SQL Injection bằng cách dùng parameterized `source_table = $1` trên view `mv_all_backtest` tương tự như `behaviorAnalysisDao.js`.
- Cài đặt cơ chế kiểm soát bất đồng bộ `inflightRequests` (dòng 21-23 trong service) giúp chặn đứng tình trạng "Cache Stampede" (nhiều request đồng thời yêu cầu tính toán khi cache hết hạn) bằng cách dùng chung 1 Promise duy nhất — thiết kế cực tốt.

---
## Batch B-11 — checkFileService.js (dòng 1-889)
Đọc lúc: 2026-07-02 14:45

### 🔴 Rủi ro

#### [P1] checkFileService.js:169-172 — Rò rỉ tài nguyên (timer leak) trong `Promise.race`
- [ ] Tình huống gây fail: Khi export file từ Drive, code dùng `Promise.race` giữa lệnh export thực tế và một `timeoutPromise` sử dụng `setTimeout` 3 phút. Nếu lệnh export thành công nhanh (vd mất 2s), `setTimeout` vẫn tiếp tục chạy trong nền và chiếm dụng event loop cho tới hết 3 phút. Khi xử lý hàng nghìn file đồng thời, điều này sẽ tạo ra hàng nghìn timer trôi nổi, gây rò rỉ bộ nhớ (memory leak) tạm thời.
- Mức độ: **memory leak / suy giảm hiệu năng event loop**
- Code:
```javascript
const timeoutPromise = new Promise((_, reject) => {
  setTimeout(() => reject(new Error(...)), DRIVE_EXPORT_TIMEOUT_MS);
});
```
- Fix: Cần lưu lại `timerId` của `setTimeout` và thực hiện `clearTimeout(timerId)` trong block `.then()` hoặc `.finally()` của `Promise.race`.

#### [P1] checkFileService.js:672-676 — Hàm `parseTime` không an toàn theo múi giờ hệ thống (locale-dependent)
- [ ] Tình huống gây fail: Lệnh `new Date(normalized).getTime()` sử dụng chuỗi không có múi giờ (ví dụ `2026-07-02T14:37:21`). Trên các server chạy Node.js có timezone khác nhau hoặc OS locale khác nhau, hàm có thể trả về `NaN` hoặc lệch giờ. Nếu trả về `NaN`, hiệu `holdMs` sẽ là `NaN`, làm điều kiện kiểm tra giữ lệnh `< 1 phút` bị bypass hoàn toàn một cách im lặng.
- Mức độ: **sai lệch logic kiểm tra điều kiện**
- Fix: Sử dụng một hàm parse ngày thủ công (split regex) hoặc thư viện như `dayjs` / `moment` để parse format cố định của MT5.

#### [P1] checkFileService.js:517-538 — Thiếu cột quan trọng dẫn tới bỏ qua file kiểm tra trong im lặng (silent skip)
- [ ] Tình huống gây fail: Nếu file Excel bị thiếu cột `time` hoặc cột bị rename, `colIndex("time")` sẽ trả về `-1`. Khi đó lệnh `row[timeCol]` tương đương `row[-1]` (trả về `undefined`). Lệnh `if (!row[timeCol]) continue;` ở dòng 538 sẽ luôn kích hoạt, khiến toàn bộ danh sách deal của file đó bị bỏ qua mà không hề báo lỗi "thiếu cột".
- Mức độ: **bỏ sót lỗi kiểm tra dữ liệu**
- Code:
```javascript
const timeCol = colIndex("time");
...
if (!row[timeCol]) continue;
```
- Fix: Kiểm tra nếu `timeCol === -1` (hoặc các cột bắt buộc khác bằng -1) thì push ngay một lỗi Group 3: "Không tìm thấy cột Time trong file" và dừng parse file đó.

### 🟡 Clean/đẹp hơn

#### checkFileService.js:46 — Biến `VALID_SYMBOLS` hardcode danh sách cặp tiền
- [ ] Danh sách `VALID_SYMBOLS` chứa các giá trị tĩnh. Nếu hệ thống cho phép thêm symbol mới trong DB, file này vẫn phải sửa đổi bằng tay.
- Đề xuất: Lấy danh sách symbol từ config hoặc query từ DB.

#### checkFileService.js:770 — Concurrency được cấu hình riêng lẻ cho local/drive qua env
- [ ] Việc đọc env trực tiếp tại dòng 770 làm phân tán cấu hình.
- Đề xuất: Chuyển cấu hình này vào file `config.js` chung của hệ thống.

### ✅ Đã tốt (không cần sửa)
- Giải phóng bộ nhớ tích cực bằng cách set `buffer = null` (dòng 844) trong vòng lặp worker, giúp bộ gom rác (garbage collector) hoạt động hiệu quả khi parse lượng lớn file nhị phân.
- Code phân cấp nhóm lỗi (Group 1, 2, 3, 4) rất rõ ràng, bám sát tài liệu đặc tả của dự án.
- Tự động fallback từ `drive.files.export` sang `drive.files.get(alt: 'media')` khi phát hiện file không export được từ Google Drive — thiết kế chống chịu lỗi tốt.

---
## Batch B-12 — openaiService.js (dòng 1-887)
Đọc lúc: 2026-07-02 14:48

### 🔴 Rủi ro

#### [P1] openaiService.js:786-807 — Vòng lặp gọi tool (Agentic loop) có rủi ro chạy vô hạn và đội chi phí API
- [ ] Tình huống gây fail: Khi model OpenAI gọi tool liên tục (ví dụ: model gọi `queryStrategies` nhưng bị lỗi hoặc model lặp đi lặp lại việc gọi tool do ảo tưởng), vòng lặp `while (choice.finish_reason === 'tool_calls')` sẽ chạy vô tận. Điều này không những gây nghẽn tiến trình của server mà còn có thể làm tiêu hao toàn bộ tài khoản OpenAI chỉ trong vài phút.
- Mức độ: **tốn chi phí lớn / treo tiến trình**
- Code:
```javascript
while (choice.finish_reason === 'tool_calls') {
```
- Fix: Giới hạn số lượt gọi tool tối đa trong 1 session chat (ví dụ `maxIterations = 5`). Nếu vượt quá thì throw error hoặc trả về câu trả lời fallback.

#### [P1] openaiService.js:90 — Rò rỉ bộ nhớ (Memory leak) trong `rateLimitMap`
- [ ] Tình huống gây fail: Bản đồ `rateLimitMap` lưu trữ thông tin số lần gọi API của từng `userId` để giới hạn tần suất (Rate limit). Tuy nhiên, Map này không hề có cơ chế dọn dẹp (cleanup/expire) các key cũ. Nếu hệ thống có hàng ngàn user hoạt động trong thời gian dài, Map sẽ phình to vô hạn gây rò rỉ bộ nhớ RAM.
- Mức độ: **memory leak**
- Code:
```javascript
const rateLimitMap = new Map();
```
- Fix: Sử dụng một thư viện cache hỗ trợ TTL tự động (ví dụ `lru-cache`) hoặc định kỳ chạy `setInterval` để dọn dẹp các key có `resetTime < Date.now()`.

#### [P1] openaiService.js:5 — Có khả năng làm sập server khi start (startup crash) nếu thiếu `OPENAI_API_KEY`
- [ ] Tình huống gây fail: Lệnh khởi tạo `new OpenAI({ apiKey: process.env.OPENAI_API_KEY })` được thực thi ngay khi import module. Trên một số phiên bản SDK của OpenAI, nếu `apiKey` bị `undefined` hoặc rỗng, constructor sẽ throw error ngay lúc import. Điều này khiến toàn bộ ứng dụng bị crash lúc startup nếu file `.env` chưa cấu hình key.
- Mức độ: **crash startup**
- Fix: Tránh khởi tạo client ngay lập tức, chuyển sang cơ chế khởi tạo lười (lazy initialization) khi có request gọi hàm chat lần đầu, hoặc bọc trong try-catch và báo lỗi log an toàn.

### 🟡 Clean/đẹp hơn

#### openaiService.js:10-16 — Hardcode model `gpt-5.4` không có thật trong pricing
- [ ] Model `gpt-5.4` được khai báo trong metadata nhưng thực tế không tồn tại, và trong bảng `PRICING` cũng thiếu model này nên nó sẽ fallback tính tiền theo giá đắt của `gpt-4o`.
- Đề xuất: Loại bỏ các model không có thật hoặc cập nhật bảng giá chính xác cho các model mới.

### ✅ Đã tốt (không cần sửa)
- Xử lý thông minh khi model không hỗ trợ custom `temperature` bằng cách bắt lỗi `err.status === 400` và tự động retry lại request không chứa temperature — tăng độ ổn định.
- Hỗ trợ blacklist động các model không hỗ trợ chat completions (`CHAT_COMPLETIONS_BLACKLIST.add(model)`) giúp tránh việc gọi lại các model lỗi.

---
## Batch B-13 — aiAnalysisService.js (dòng 1-351) · aiAnalysisController.js (dòng 1-122) · aiAnalysisReportDao.js (dòng 1-106)
Đọc lúc: 2026-07-02 14:52

### 🔴 Rủi ro

#### [P0] aiAnalysisController.js:7,36 — tableName query/body param nhận trực tiếp từ user mà không validate
- [ ] Tình huống gây fail: Biến `tableName` từ query param (API GET) và request body (API POST) được truyền trực tiếp xuống `aiAnalysisService.getAiAnalysis` -> gọi các hàm dashboard/risk/behavior service -> tiếp tục gọi trực tiếp DDL SQL `FROM "${tableName}"` ở DAO. Đây là entrypoint trực tiếp cho SQL Injection.
- Mức độ: **hủy hoại database / SQL Injection**
- Fix: Thêm hàm validate: `validateBacktestTableName(tableName)` (hoặc check `assertBacktestIdentifier`) ngay tại controller trước khi chuyển tiếp xử lý.

#### [P1] aiAnalysisService.js:140-141 — Mâu thuẫn định nghĩa cờ rủi ro giữa prompt AI và code logic thực tế
- [ ] Tình huống gây fail:
  - Hệ thống prompt gửi cho AI mô tả: `Flag 6 (Loss Streak>=20)` là Hard Flag. Nhưng thực tế trong `riskAnalysisDao.js`, `Flag 6` được khai báo là Soft Flag (`SOFT_FLAG_DEFS`).
  - Hơn nữa, cờ cứng thực tế thứ 9 trong SQL/DAO là `Flag 33 (Largest Loss / Net Profit >= 70%)` hoàn toàn bị bỏ sót không được mô tả cho AI.
  - Hậu quả: AI sẽ phân tích sai lệch chất lượng của robot giao dịch, nhầm lẫn cờ cứng thành cờ mềm hoặc bỏ qua vi phạm nghiêm trọng của bot.
- Mức độ: **sai lệch logic phân tích trí tuệ nhân tạo (AI hallucination / inaccuracy)**
- Fix: Cập nhật prompt hệ thống khớp 100% với danh sách định nghĩa cờ cứng/cờ mềm trong `riskAnalysisDao.js`.

#### [P1] aiAnalysisService.js:37-39 — Error Handling quá nghèo nàn làm sập cả cụm phân tích khi 1 service lỗi
- [ ] Tình huống gây fail: Khi dashboard, risk, hoặc behavior data trả về trống hoặc lỗi (ví dụ một table bị thiếu hoặc timeout), service lập tức throw Error chung chung. Người dùng sẽ thấy lỗi 500 thay vì hiển thị báo cáo AI kèm cảnh báo "thiếu dữ liệu".
- Mức độ: **trải nghiệm người dùng kém (poor resilience)**
- Code:
```javascript
if (!dashboardData) throw new Error("No dashboard data found for analysis");
```
- Fix: Xử lý fallback mềm dẻo, nếu thiếu dữ liệu một phần thì vẫn gửi các phần dữ liệu còn lại cho AI kèm chú thích "dữ liệu bị thiếu".

### ✅ Đã tốt (không cần sửa)
- Bảng `ai_analysis_reports` được tối ưu hóa cấu trúc index unique trên composite keys sử dụng `COALESCE` cho các giá trị nullable (`start_date`, `end_date`), ngăn chặn duplicate report hoàn hảo trong Postgres.
- AI prompt được thiết kế vô cùng chi tiết, chặt chẽ, bắt buộc AI sử dụng chính xác mã bot thật (`Strategy ID`) trong dữ liệu đầu vào và cấm tuyệt đối sử dụng các mã placeholder giả lập — chống ảo tưởng tốt.

---
## Batch B-14 — parseSheetMetaData.js (dòng 1-305) · parseDeals.js (dòng 1-40) · syncProgressTracker.js (dòng 1-294)
Đọc lúc: 2026-07-02 14:55

### 🔴 Rủi ro

#### [P1] syncProgressTracker.js:81-122 — Tranh chấp ghi dữ liệu (Race Condition) khi cập nhật tiến trình Sync
- [ ] Tình huống gây fail: Hàm `updateSyncProgress` thực hiện theo luồng: Đọc trạng thái từ DB (`getSyncJob`), gán đè thuộc tính trong bộ nhớ (`Object.assign`), và chạy câu lệnh `UPDATE` ghi ngược lại DB. Do các file được xử lý song song bởi nhiều worker thread, việc đọc-ghi không nguyên tử (non-atomic) này dẫn đến tranh chấp. Worker 2 ghi đè đè tiến trình cũ hơn lên tiến trình mới hơn của Worker 1, gây ra hiện tượng nhảy giật tiến độ (progress bar jitter) hoặc hiển thị sai lệch số lượng file đã xử lý.
- Mức độ: **lỗi hiển thị / sai lệch tiến trình sync**
- Code:
```javascript
const job = await getSyncJob(syncId);
...
await pool.query(query, [ ... ]);
```
- Fix: Thay thế bằng câu lệnh cập nhật trực tiếp nguyên tử trong SQL: `UPDATE sync_jobs SET processed_files = processed_files + 1, success_files = success_files + $1 WHERE sync_id = $2`.

### 🟡 Clean/đẹp hơn

#### parseSheetMetaData.js:25 — In log debug độ dài text ra console mỗi lần parse
- [ ] Dòng `console.log("Settings text length: ...")` sẽ spam console log hàng nghìn lần khi chạy sync 3600+ files. Nên chuyển thành debug log hoặc tắt hẳn.

### ✅ Đã tốt (không cần sửa)
- Thuật toán trích xuất chỉ số kết quả (`parseResults`) sử dụng phương pháp tìm kiếm định vị theo lưới ô Excel (`columnGroups`) rất thông minh, xử lý tốt tình huống bảng bị gộp ô (merged cells) của báo cáo MT5.
- Hàm `parseVolume` xử lý hoàn hảo các hậu tố rút gọn của MetaTrader 5 như `K` (nghìn), `M` (triệu), `B` (tỷ) rất gọn gàng và có kiểm soát lỗi `NaN` tốt.
- `syncProgressTracker` tự động dọn dẹp (background cleanup) các job sync cũ hơn 24 giờ mỗi khi tạo job mới — tốt cho việc duy trì dung lượng DB.

---
## Batch B-15 — authService.js (dòng 1-121) · authJwt.js (dòng 1-87) · authController.js (dòng 1-37) · otpService.js (dòng 1-84)
Đọc lúc: 2026-07-02 14:58

### 🔴 Rủi ro

#### [P0] authService.js:11-38 — API Request OTP hoàn toàn không có rate limit (Mail spam & memory crash)
- [ ] Tình huống gây fail: Khi người dùng gửi yêu cầu nhận mã OTP (`requestOTP`), hệ thống lập tức sinh mã OTP, đưa vào Map trong bộ nhớ và gửi email qua SMTP của công ty mà không hề kiểm tra xem email này vừa gửi OTP cách đây bao lâu. Kẻ tấn công có thể spam hàng triệu request liên tục, dẫn tới:
  1. Tài khoản SMTP gửi thư bị block/flag spam.
  2. Server bị nghẽn RAM do bản đồ `otpStore` trong bộ nhớ phình to quá nhanh trước khi vòng cleanup 5 phút kích hoạt.
- Mức độ: **hủy hoại dịch vụ gửi mail / gây OOM crash server**
- Fix: Bắt buộc cấu hình rate limit giới hạn 1 email chỉ được gửi tối đa 1 OTP mỗi 60 giây.

#### [P1] authJwt.js:9-13 — Fallback khóa bảo mật JWT yếu ('YOUR_SECRET_KEY') nếu cấu hình sai biến môi trường
- [ ] Tình huống gây fail: Nếu deploy ứng dụng ở môi trường non-production (ví dụ: testing, staging hoặc production bị quên set `NODE_ENV` thành 'production'), hàm `getJwtSecret` sẽ âm thầm trả về chuỗi mặc định `'YOUR_SECRET_KEY'`. Kẻ tấn công có thể lợi dụng chuỗi key yếu này để giả mạo token admin và chiếm quyền hệ thống.
- Mức độ: **lỗ hổng bảo mật nghiêm trọng (privilege escalation)**
- Code:
```javascript
if (process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET is required in production');
}
return 'YOUR_SECRET_KEY';
```
- Fix: Không bao giờ dùng fallback key cố định, hãy sinh ngẫu nhiên một chuỗi ngẫu nhiên khi khởi động server nếu biến môi trường bị thiếu, hoặc throw error chặn khởi động trên mọi môi trường.

### ✅ Đã tốt (không cần sửa)
- Quy trình đăng ký và đăng nhập được kiểm soát chặt chẽ với OTP verification giới hạn tối đa 3 lần nhập sai (`attempts >= 3` sẽ tự động hủy OTP).
- Cơ chế dọn dẹp expired OTPs định kỳ (`cleanExpiredOTPs`) chạy ngầm mỗi 5 phút tự động thu hồi RAM tốt.
- Bọc bắt lỗi UniqueConstraintError của Sequelize để phản hồi về client danh sách trường bị trùng trực quan.

---
---
---
## Batch B-16 — opService.js · ggSheetService.js · processQueue.js
Đọc lúc: 2026-07-02 15:02

### 🔴 Rủi ro

#### [P1] ggSheetService.js:136 — Pin cố định 1 Service Account khi quét đệ quy thư mục Google Drive gây nghẽn Quota
- [ ] Tình huống gây fail: Khi hàm `getAllFilesInDriveFolder` thực hiện quét đệ quy các thư mục con, nó chuyển tiếp instance `drive` hiện tại xuống các tầng đệ quy dưới: `await getAllFilesInDriveFolder(file.id, drive)`. Việc này vô hiệu hóa cơ chế tự động xoay vòng (rotate) Service Accounts của hệ thống. Nếu thư mục có cấu trúc nhiều tầng và chứa lượng file lớn, toàn bộ các request đệ quy sẽ bị ép chạy trên một service account duy nhất, dễ dẫn tới lỗi vượt quá giới hạn API Quota (HTTP 403 Rate Limit Exceeded).
- Mức độ: **nghẽn API / lỗi tải dữ liệu**
- Code:
```javascript
const subFiles = await getAllFilesInDriveFolder(file.id, drive);
```
- Fix: Không truyền tham số `drive` vào lệnh gọi đệ quy, hãy để hàm tự động lấy client mới bằng `googleSheet.getNextDriveClient()` ở mỗi thư mục.

#### [P1] processQueue.js:30-32 — Thuật toán chia tải đa máy (multi-machine clustering) bị lỗi dở dang khi chạy trên hệ thống Cluster
- [ ] Tình huống gây fail: Code thực hiện chia tải xử lý file bằng cách chia modulo theo `MACHINE_ID` và `TOTAL_MACHINES`: `idx % totalWorkers === workerIndex`. Tuy nhiên, lệnh Sync sheet được trigger qua API Express trực tiếp. Khi deploy dạng cluster (nhiều container chạy song song sau Load Balancer), một request API chỉ chạm tới 1 container duy nhất. Container đó sẽ chỉ sync 50% số file được chia tải, 50% số file còn lại bị bỏ sót do các container khác không hề nhận được tín hiệu chạy sync.
- Mức độ: **mất mát dữ liệu nghiêm trọng khi chạy cluster**
- Code:
```javascript
const filteredSheets = sheetGroups.filter(filterFn).filter((_, idx) => idx % totalWorkers === workerIndex);
```
- Fix: Loại bỏ thuật toán chia tải thô sơ qua env này nếu ứng dụng chỉ chạy đơn nút, hoặc chuyển sang dùng giải pháp hàng đợi tập trung (ví dụ BullMQ + Redis) để phân phối job chuyên nghiệp giữa các máy.

### ✅ Đã tốt (không cần sửa)
- Thuật toán xoay vòng Service Accounts lấy cấu hình động từ thư mục `src/config/serviceAccounts` rất linh hoạt, giúp mở rộng API quota của Google dễ dàng bằng cách thêm file credentials.
- Sử dụng `pageSize: 1000` (giới hạn tối đa của Google Drive API) giúp tối ưu hóa số lượng network requests để liệt kê danh sách file.

---
## Batch B-17 — lotThresholdDao.js · lotThresholdService.js · lotThresholdController.js
Đọc lúc: 2026-07-02 15:46

### 🔴 Rủi ro

#### [P1] lotThresholdController.js:8,17-25 — Khóa trạng thái chạy phân tích `isLotThresholdAnalysisRunning` dạng in-memory bị thất bại khi chạy Cluster
- [ ] Tình huống gây fail: Biến kiểm soát trạng thái chạy phân tích `isLotThresholdAnalysisRunning` được đặt dưới dạng biến in-memory cục bộ trên server. Nếu deploy hệ thống dạng cluster nhiều node, request trigger phân tích có thể gửi đến các node khác nhau. Kết quả là hai node cùng lúc nhảy vào chạy phân tích song song, đều gọi `clearResults` để xóa bảng dữ liệu và `batchInsertResults` để ghi chèn dữ liệu đồng thời, dẫn tới tranh chấp, hỏng dữ liệu phân tích.
- Mức độ: **lỗi nghiệp vụ / sai lệch dữ liệu phân tích**
- Fix: Sử dụng một cơ chế khóa ở tầng database (nhập cờ lock vào DB hoặc dùng PostgreSQL Advisory Locks: `pg_advisory_lock`) để khóa phân tích trên toàn bộ cụm cluster.

#### [P1] lotThresholdDao.js:148-173 — Quét N+1 Seq Scan cực kỳ nặng trên Materialized View `mv_all_backtest`
- [ ] Tình huống gây fail: Khi chạy phân tích, luồng worker lặp qua từng strategy để query các deal trong khoảng thời gian thông qua hàm `getDealsForStrategy`. Do query trực tiếp trên view `mv_all_backtest` (chứa hàng triệu dòng) lọc theo `strategy_id` và `source_table`, nếu view này không có index hỗ trợ, Postgres bắt buộc phải chạy Seq Scan cho TỪNG strategy. Với 1,000+ strategies chạy song song, DB sẽ lập tức bị treo cứng CPU 100% và timeout toàn bộ API.
- Mức độ: **treo DB / lỗi nghẽn hiệu năng nghiêm trọng**
- Fix: Tạo index tường minh trên materialized view cho các cột `(strategy_id, source_table)` khi build view.

### ✅ Đã tốt (không cần sửa)
- Các mốc volume được tính toán hoàn toàn in-memory trên JS side (`computeMetrics`), giúp tránh các vòng lặp SQL đệ quy nặng nề ở DB — thiết kế thông minh.
- Phép batchInsert kết quả analysis sử dụng Transaction (`BEGIN/COMMIT/ROLLBACK`) và chunk 100 dòng giúp tối ưu hóa latency và đảm bảo tính toàn vẹn dữ liệu tốt.

---
## Batch B-18 — marketService.js · marketWatchDao.js · orderService.js
Đọc lúc: 2026-07-02 15:48

### 🔴 Rủi ro

#### [P1] orderService.js:7,85 — Rò rỉ RAM cực lớn (Memory Leak) do lưu cache dữ liệu phân trang vô hạn trong `orderCache`
- [ ] Tình huống gây fail: Hàm `getPagedOrders` và `getOrderTotals` lưu cache kết quả phân trang bằng đối tượng `new Map()`. Mặc dù có cấu hình `CACHE_TTL` 7 ngày, nhưng do Map này không có bất kỳ cơ chế tự động quét dọn key quá hạn (background clean up) nào, mọi thao tác phân trang, filter khác nhau của người dùng sẽ sinh ra vô số key cache mới và nằm lại vĩnh viễn trong RAM cho tới khi server sập vì tràn bộ nhớ (Out-Of-Memory).
- Mức độ: **OOM sập server**
- Code:
```javascript
const orderCache = new Map();
```
- Fix: Thay thế bằng các thư viện cache chuyên dụng hỗ trợ giải phóng RAM tự động (ví dụ `lru-cache`) hoặc thiết lập `setInterval` dọn dẹp các key hết hạn định kỳ.

#### [P1] marketWatchDao.js:90-139 — Quét tuần tự toàn bảng (Sequential Scan) cực nặng trên Materialized View `mv_all_backtest` do thiếu index
- [ ] Tình huống gây fail: Các hàm thống kê vùng giá (`getPriceZonePerformance`) và PnL hàng tháng (`getMonthlyPnl`) thực hiện các truy vấn aggregate (`COUNT`, `SUM`, `GROUP BY`) trực tiếp trên Materialized View `mv_all_backtest` lọc theo `symbol` và `type`. Do Materialized View trong PostgreSQL không tự động thừa hưởng index từ các bảng con, nếu hệ thống chưa tạo index tường minh cho `mv_all_backtest(symbol, type)`, PostgreSQL bắt buộc phải quét tuần tự (Seq Scan) qua hàng triệu dòng deal giao dịch để lọc dữ liệu, gây nghẽn I/O DB và làm chậm API nghiêm trọng.
- Mức độ: **hiệu năng cực thấp / treo DB khi dữ liệu lớn**
- Fix: Cần bổ sung câu lệnh tạo index cho materialized view:
  `CREATE INDEX IF NOT EXISTS idx_mv_all_backtest_symbol_type ON mv_all_backtest(symbol, type);`

### ✅ Đã tốt (không cần sửa)
- Khác với các DAO khác, các câu lệnh SQL trong `marketWatchDao.js` được viết cực kỳ an toàn, sử dụng hoàn toàn parameterized query cho các biến đầu vào (`symbol`, `currentPrice`, `backtestTable`), chống SQL Injection triệt để.
- whitelist hóa tham số sort (`sortBy === 'pd' ...`) thông qua ánh xạ cấu trúc `SORT_EXPR` ở đầu file rất an toàn và chuyên nghiệp.
- Tích hợp cache in-memory 60 giây (`cacheKey = `${ticker}_${range}`) cho API Yahoo Finance giúp giảm thiểu số lượng request ra ngoài Internet, tăng tốc độ load trang và hạn chế bị block IP bởi Yahoo Finance.
- Tách biệt thông minh giữa truy vấn lấy dữ liệu phân trang (`getPagedOrders`) và truy vấn tính toán tổng hợp nặng (`getOrderTotals`), giúp giảm tải tối đa độ trễ phản hồi (latency) của API chính khi load table.

---
## Batch B-19 — constants.js · messages.js · db.js · googleSheet.js · multiServiceAccounts.js
Đọc lúc: 2026-07-02 15:35 / 15:37 / 15:40

### 🔴 Rủi ro

#### [P1] db.js:4-23 — Khởi tạo đồng thời 3 Connection Pools lãng phí và nguy cơ gây sập kết nối Database dưới tải
- [ ] Tình huống gây fail: File `db.js` khởi tạo 3 Pool kết nối Postgres riêng biệt: `pool` (dòng 4), `adminPool` (dòng 8) và một Pool đơn lẻ `appPoolSingleton` thông qua hàm `getAppPool` (dòng 17). Mỗi pool được set cấu hình tối đa `max: 80` connections. Khi ứng dụng hoạt động dưới tải, tổng số connection mà Node.js cố gắng mở có thể lên tới 240, vượt xa giới hạn kết nối mặc định của PostgreSQL (thường là 100), dẫn đến lỗi từ chối kết nối "too many clients already".
- Mức độ: **sập kết nối database / nghẽn tài nguyên**
- Code:
```javascript
const pool = new Pool(...);
const adminPool = new Pool(...);
// getAppPool lại tiếp tục new Pool(...)
```
- Fix: Gom toàn bộ về sử dụng duy nhất một Singleton Pool chung cho toàn hệ thống.

#### [P1] config.json:1-25 — Cấu hình Sequelize CLI bị hỏng do không tự động parse các placeholder biến môi trường
- [ ] Tình huống gây fail: File `config.json` định nghĩa các giá trị kết nối dạng text tĩnh `"${DB_USERNAME}"`, `"${DB_PASSWORD}"`... Mặc dù file `models/index.js` có logic chạy vòng lặp để replace bằng tay các biến môi trường khi chạy app, nhưng khi nhà phát triển chạy trực tiếp các lệnh CLI của Sequelize (như `npx sequelize-cli db:migrate` để chạy migration), CLI sẽ đọc trực tiếp file JSON này và lỗi kết nối ngay lập tức do không parse được biến.
- Mức độ: **hỏng công cụ phát triển (broken migrations)**
- Fix: Thêm cấu hình `.sequelizerc` ở thư mục gốc để hướng Sequelize CLI đọc trực tiếp cấu hình động từ file `config.js` thay vì đọc `config.json`.

#### [P1] db.js:25 — Gây sập server lúc startup (Crash startup) nếu thiếu biến `DATABASE_URL`
- [ ] Tình huống gây fail: Lệnh `new URL(process.env.DATABASE_URL)` được thực thi đồng bộ ngay khi load module. Nếu biến `DATABASE_URL` bị thiếu hoặc rỗng trong `.env`, constructor của URL sẽ throw TypeError trực tiếp làm sập tiến trình node ngay khi start.
- Mức độ: **startup crash**
- Code:
```javascript
const dbUrl = new URL(process.env.DATABASE_URL);
```
- Fix: Thêm check kiểm tra `if (!process.env.DATABASE_URL) throw new Error(...)` tường minh và thân thiện trước khi thực hiện `new URL()`.

#### [P1] googleSheet.js:20, console:63-71 — Nguy cơ sập server đồng bộ lúc startup (ENOENT Crash) nếu thiếu thư mục `serviceAccounts`
- [ ] Tình huống gây fail: Lệnh `fs.readdirSync(saDir)` được thực thi đồng bộ ngay khi nạp module ở môi trường toàn cục. Nếu khi deploy code lên production, folder `src/config/serviceAccounts` bị bỏ trống, bị thiếu (hoặc do chưa phân quyền đọc folder), server Node.js sẽ lập tức throw error `ENOENT` và sập tiến trình ngay khi start.
- Mức độ: **startup crash**
- Code:
```javascript
const CREDENTIAL_FILES = fs.readdirSync(saDir)...
```
- Fix: Bọc lệnh đọc file trong try-catch, kiểm tra sự tồn tại của thư mục trước bằng `fs.existsSync(saDir)`. Nếu thiếu thì in cảnh báo lên console và gán `CREDENTIAL_FILES = []` để tránh sập app.

#### [P1] googleSheet.js:34,49 — Lỗi `NaN` chỉ số và gây crash nếu danh sách credentials rỗng (Division by Zero)
- [ ] Tình huống gây fail: Nếu trong thư mục `serviceAccounts` không có file `.json` nào, `CREDENTIAL_FILES.length` bằng 0. Khi gọi hàm `getNextSheetsClient`, biểu thức `currentClientIndex = (currentClientIndex + 1) % 0` sẽ trả về `NaN`. Lần gọi tiếp theo, `CREDENTIAL_FILES[NaN]` trả về `undefined`, dẫn đến việc khởi tạo Google JWT client thất bại.
- Mức độ: **lỗi runtime làm treo tính năng sync**
- Fix: Kiểm tra nếu `CREDENTIAL_FILES.length === 0` thì báo lỗi tường minh hoặc ném lỗi có mô tả rõ ràng thay vì để xảy ra phép chia lấy dư với 0.

### 🟡 Clean/đẹp hơn

#### messages.js & authJwt.js — Trùng lặp chuỗi thông báo (Hardcoded Strings)
- [ ] Mặc dù file `messages.js` đã gom nhóm tập trung các thông báo lỗi cho xác thực JWT (như `JWT.NO_TOKEN: 'No token provided!'`), tuy nhiên trong file middleware `authJwt.js` (dòng 20) vẫn ghi cứng chuỗi `'No token provided!'` bằng tay thay vì import và sử dụng từ `messages.js`.
- Đề xuất: Thực hiện import và sử dụng triệt để từ `messages.js` để tránh trùng lặp và tuân thủ nguyên tắc Clean Code.

### ✅ Đã tốt (không cần sửa)
- Các đối tượng enum và constants trong `constants.js` được đóng băng hoàn toàn bằng `Object.freeze` giúp ngăn chặn việc ghi đè vô ý tại các lớp nghiệp vụ.
- Cả hai file `googleSheet.js` và `multiServiceAccounts.js` hoạt động ăn khớp để xoay vòng Service Accounts tốt.

---
## Batch B-20 — dataValidationService.js · comparativeRankingService.js · comparativeRankingDao.js
Đọc lúc: 2026-07-02 15:10 / 15:30

### 🔴 Rủi ro

#### [P0] comparativeRankingController.js:6 — tableName query param nhận trực tiếp từ user mà không validate
- [ ] Tình huống gây fail: Biến `tableName` từ query params được chuyển tiếp trực tiếp xuống `comparativeRankingService.getComparativeRankingData` -> `dashboardService.getComparativeData` -> cuối cùng gọi các hàm SQL nội suy trong `dashboardDao.js` (B-07) dạng `FROM "${tableName}"`. Kẻ tấn công có thể chèn chuỗi SQL độc hại thông qua query param này.
- Mức độ: **hủy hoại database / SQL Injection**
- Fix: Thêm hàm validate `validateBacktestTableName(tableName)` (hoặc check `assertBacktestIdentifier`) ngay tại controller trước khi chuyển tiếp xử lý.

#### [P1] comparativeRankingService.js:3 — Rò rỉ bộ nhớ (Memory leak) trong `comparativeCache` do thiếu cơ chế tự động dọn dẹp key cũ
- [ ] Tình huống gây fail: Bản đồ `comparativeCache` lưu trữ kết quả xếp hạng. Mặc dù có TTL 7 ngày (`CACHE_TTL`), cache này không có cơ chế cleanup tự động chạy ngầm. Khi người dùng liên tục thay đổi các bộ lọc ngày (`startDate`, `endDate`) tùy chỉnh trên UI, hệ thống sẽ tạo ra vô số key cache mới. Các key cũ đã hết hạn sẽ nằm lỳ trong RAM vô thời hạn, gây rò rỉ bộ nhớ RAM.
- Mức độ: **memory leak**
- Code:
```javascript
const comparativeCache = new Map();
```
- Fix: Thay thế bằng thư viện cache có sẵn cơ chế tự động giải phóng (như `lru-cache`) hoặc thiết lập `setInterval` quét dọn các key hết hạn định kỳ.

### ✅ Đã tốt (không cần sửa)
- DAO `comparativeRankingDao.js` hoạt động như một Single Source of Truth (SSOT), re-export các hàm truy vấn trực tiếp từ `dashboardDao` giúp tránh việc duplicate logic truy vấn phức tạp.
- Sử dụng cơ chế chống trùng lặp request đang xử lý (`inflightRequests` check) rất tốt để ngăn chặn Cache Stampede.
- `dataValidationService.js` tự động thống kê và ghi các file log báo lỗi (`error.txt`), trùng tên (`duplicate.txt`) và thiếu file (`notfound.txt`) rất khoa học sau mỗi lượt sync.

---
## 📦 PHỤ LỤC — Các Module Bổ Sung (Không nằm trong 20 Batches Core)
Đọc lúc: 2026-07-02 14:58 / 15:13 / 15:17 / 15:21 / 15:30 / 15:33 / 15:43

### 🔴 Rủi ro

#### [P0] emailConfig.js:3 — Lộ lọt thông tin cấu hình mật khẩu ứng dụng Gmail (Gmail App Password) ở dạng Plain Text
- [ ] Tình huống gây fail: Mật khẩu ứng dụng Gmail `'biku nteu eogd zrjt'` của tài khoản `sonbx@lotusquant.com` được ghi cứng dạng Plain Text trực tiếp trong mã nguồn.
- Mức độ: **rò rỉ thông tin đăng nhập nghiêm trọng (critical credentials leak)**
- Fix: Bắt buộc chuyển sang đọc từ biến môi trường: `EMAIL_APP_PASSWORD: process.env.EMAIL_APP_PASSWORD`.

#### [P1] errorLogDAO.js:9,10 — Giới hạn cứng `VARCHAR(255)` của cột `strategy_id` làm mất log lỗi âm thầm khi chuỗi quá dài
- [ ] Tình huống gây fail: Cột `strategy_id` trong bảng `error_logs` được khai báo giới hạn `VARCHAR(255)`. Khi hệ thống chạy tác vụ sync và bắt gặp file Excel có tên chiến lược cực dài vượt quá 255 ký tự, câu lệnh INSERT log lỗi sẽ bị PostgreSQL từ chối. Lỗi này bị bọc nuốt trong block catch của `logError`, làm việc lưu log thất bại trong im lặng.
- Mức độ: **mất mát log lỗi âm thầm (silent fail)**
- Fix: Thay thế kiểu dữ liệu của cột `strategy_id` thành `TEXT`.

#### [P1] errorLogDAO.js:5-23 — Thiếu index trên cột `strategy_id` gây chậm truy vấn tìm kiếm duy nhất
- [ ] Tình huống gây fail: Hàm `getDistinctStrategies` thực hiện quét `SELECT DISTINCT strategy_id FROM error_logs`. Không có index sẽ gây Seq Scan trên toàn bảng khi log phình to.
- Fix: Bổ sung index trong hàm khởi tạo bảng.

#### [P1] userService.js:83-86,95-96 — Admin tự xóa hoặc tự hạ cấp chính mình gây khóa hệ thống (System Lockout)
- [ ] Tình huống gây fail: API xóa user và cập nhật user cho phép tài khoản Admin thực hiện thao tác xóa hoặc hạ cấp vai trò của chính mình.
- Mức độ: **lỗi nghiệp vụ nghiêm trọng (lockout)**
- Fix: Bổ sung logic kiểm tra chặn không cho Admin tự xóa/hạ cấp chính mình.

#### [P1] user.js & userService.js:25 — Hoàn toàn không có kiểm tra độ dài và độ mạnh mật khẩu (Weak Password Policy)
- [ ] Tình huống gây fail: Hệ thống không yêu cầu độ phức tạp ký tự hoặc độ dài tối thiểu cho mật khẩu.
- Fix: Thêm validate kiểm tra mật khẩu tối thiểu 8 ký tự.

#### [P1] swagger.js:27 — Đường dẫn quét tài liệu APIs bị sai dẫn tới tài liệu API Swagger trống trơn
- [ ] Tình huống gây fail: Tùy chọn cấu hình đường dẫn apis trong Swagger bị sai đường dẫn `apis: ["./server/routes/*.js"]`.
- Fix: Sửa thành `apis: ["./src/routes/*.js"]`.

#### [P1] strategyController.js & risk/behaviorAnalysisController.js — Bỏ sót việc dọn dẹp các cache phân tích khi xóa Strategy
- [ ] Tình huống gây fail: Khi admin thực hiện gọi API xóa robot (`deleteStrategy`), hệ thống quên dọn dẹp cache của `riskAnalysisService` và `behaviorAnalysisService`.
- Fix: Bổ sung lệnh gọi dọn dẹp cache của risk và behavior service khi xóa strategy.

#### [P1] chatController.js:47-51 — Nguy cơ tràn Token (Token Blowout) và tăng vọt chi phí do gửi thô toàn bộ JSONB của 20 strategies
- [ ] Tình huống gây fail: Chatbot tự động đính kèm 20 strategies thô chứa rất nhiều thông số vào prompt AI, làm vượt ngưỡng giới hạn token của API.
- Fix: Viết hàm helper rút gọn đối tượng strategy trước khi gửi cho AI.

### ✅ Đã tốt (không cần sửa)
- Các cấu hình định kỳ cron dọn dẹp logs cũ hơn 90 ngày (`cleanupOldLogs`) chạy tự động, ổn định.
- Cơ chế quản lý vai trò và phân quyền user được kiểm soát thông qua Sequelize ORM an toàn.

---