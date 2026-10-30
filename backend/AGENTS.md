# AGENTS.md — Back-end

## Stack

Express 5.1 · Node.js · JavaScript (CommonJS) · PostgreSQL (pg + Sequelize 6) · Google APIs · Multer · JWT · Swagger · node-cron

## Phạm vi làm việc

- Chỉ tập trung đúng phần được yêu cầu trong task hiện tại.
- Không mở rộng sang module khác nếu không có yêu cầu rõ ràng.
- Nếu cần đổi nhiều file, vẫn phải giữ nguyên hành vi cũ.

---

## Tra nhanh

| Cần làm                | File                                                               |
| ---------------------- | ------------------------------------------------------------------ |
| Thêm API endpoint      | `src/routes/*.js` (khai báo) + `src/controller/*.js` (xử lý)       |
| Thêm business logic    | `src/service/*.js`                                                 |
| Truy vấn DB            | `src/dao/*.js` — dùng `pool.query()`                               |
| Thêm Sequelize model   | `src/models/*.js` (chỉ User/Role)                                  |
| Sửa cấu hình DB        | `src/config/db.js` + `src/config/config.json`                      |
| Thêm middleware        | `src/middlewares/authJwt.js`                                       |
| Thêm constants/enums   | `src/utils/constants.js`                                           |
| Thêm message           | `src/utils/messages.js`                                            |
| Google Sheet/Drive     | `src/config/googleSheet.js` + `src/config/multiServiceAccounts.js` |
| Parse Excel            | `src/utils/parseSheetMetaData.js` + `src/utils/parseDeals.js`      |
| Theo dõi sync progress | `src/utils/syncProgressTracker.js`                                 |
| Parallel workers       | `src/utils/processQueue.js` → `buildQueueAndRun()`                 |

---

## Kiến trúc 3 lớp

```
Route → Controller → Service → DAO → PostgreSQL
```

- **Route**: HTTP method + path + middleware
- **Controller**: Parse req, gọi service, format res
- **Service**: Business logic
- **DAO**: Raw SQL (pg Pool)

> Ngoại lệ: User/Role dùng Sequelize ORM. Mọi thứ khác dùng raw SQL.

---

## Quy tắc bắt buộc

- **KHÔNG dùng Sequelize cho backtest data** → chỉ raw `pg` Pool
- **KHÔNG hard-code table name** → dùng `getAllBacktestTables()` từ opDao
- **KHÔNG fetch trong controller** → gọi qua service → dao
- **KHÔNG tạo constants/messages inline** → thêm vào `constants.js` / `messages.js`
- **KHÔNG quên clear cache** sau sync/delete → gọi `clearXxxCache()`
- **KHÔNG tạo blocking endpoint** cho tác vụ nặng → dùng async + `syncProgressTracker`
- **Table name phải bắt đầu bằng "backtest"**
- **Multer chỉ dùng `memoryStorage()`**
- **Google API** → không gọi trực tiếp, dùng `processQueue.buildQueueAndRun()`

---

## Nguyên tắc bảo toàn code cũ

> Thêm tính năng mới → PHẢI đảm bảo tất cả chức năng cũ vẫn hoạt động.

1. Đọc toàn bộ file (hoặc function liên quan) trước khi sửa
2. Không đổi HTTP method, path, request body, response format của endpoint đã có 
3. Không đổi tên hàm, thứ tự tham số trong service/DAO
4. Không rename/xóa cột trong backtest tables, `strategy_metadata`, `system_logs` — chỉ thêm mới
5. Không đổi cột/cấu trúc UNION của materialized view `mv_all_backtest`
6. Giữ nguyên status sync: `PROCESSING`, `COMPLETED`, `FAILED` (frontend polling dùng chính xác các giá trị này)
NẾU CẦN TỐI ƯU LẠI THÌ BẢO TÔI

**Sau khi sửa, tự kiểm tra:**
Sync (sync + async) · Polling `/sync-status/:syncId` · Strategy list (filter + pagination) · Balance chart · Backtest CRUD · Dashboard · Auth · System logs

---

## Services

| File                       | Mô tả                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| `opService.js`             | **Core**: sync Google Sheet → DB, parse xlsx, balance chart, backtest CRUD, filter options |
| `strategyService.js`       | Strategy CRUD + in-memory cache                                                            |
| `orderService.js`          | Order list + in-memory cache                                                               |
| `checkFileService.js`      | Validate optimization files (Groups 1-4)                                                   |
| `dashboardService.js`      | Dashboard aggregation + cache                                                              |
| `authService.js`           | Login/Register với JWT + bcrypt + OTP                                                      |
| `openaiService.js`         | OpenAI GPT cho chatbot + dashboard analysis                                                |
| `marketService.js`         | Market prices + symbol stats                                                               |
| `ggSheetService.js`        | Google Sheet read/write                                                                    |
| `emailService.js`          | Gửi OTP qua Nodemailer                                                                     |
| `otpService.js`            | Generate/verify OTP                                                                        |
| `userService.js`           | User CRUD                                                                                  |
| `dataValidationService.js` | So sánh stats trước/sau sync                                                               |

---

## DAOs

| File                     | Mô tả                                                                    |
| ------------------------ | ------------------------------------------------------------------------ |
| `opDao.js`               | **Core**: backtest table CRUD, insert deals, indexes, materialized views |
| `strategyMetadataDao.js` | Strategy metadata, filter queries phức tạp, preferences, time-range      |
| `dashboardDao.js`        | Dashboard SQL aggregation                                                |
| `systemLogDAO.js`        | System log: init, insert, query, cleanup                                 |
| `errorLogDAO.js`         | Error log: init, insert                                                  |

---

## Routes

| File                | Mount             | Endpoints chính                                                                                                                                            |
| ------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `opRoute.js`        | `/api`            | `POST /sync-sheet`, `POST /sync-sheet-async`, `GET /sync-status/:syncId`, `GET /data`, `GET /balance-chart/:table/:id`, `GET/POST/DELETE /backtest-tables` |
| `strategyRoutes.js` | `/api/strategies` | `GET /`, `GET /ids`, `GET /by-time-range`, `GET /:id/:table`, `DELETE /:id`, `GET /symbols/distinct`, `GET /statistics/summary`, `GET/PUT /preferences`    |
| `authRoute.js`      | `/`               | `POST /auth/request-otp`, `POST /auth/register`, `POST /auth/login`                                                                                        |
| `dashboardRoute.js` | `/api`            | `GET /dashboard`                                                                                                                                           |
| `systemLogRoute.js` | `/api`            | `GET /latest-backtest`, `GET /history/:tableName`, `GET /all`, `DELETE /cleanup`                                                                           |
| `userRoute.js`      | `/api`            | `GET/POST /users`, `PUT/DELETE /users/:id`                                                                                                                 |
| `chatRoute.js`      | `/api`            | `GET /chat/models`, `POST /chat/send`                                                                                                                      |
| `marketRoute.js`    | `/api`            | `GET /market/prices`, `GET /market/symbol-stats/:symbol`, `GET /market/news/:symbol`                                                                       |

---

## Utilities

| Hàm                                                                                   | Tác dụng                                             |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `createSyncJob(tableName, totalFiles, username)`                                      | Tạo job sync, auto-cleanup sau 1h                    |
| `updateSyncProgress(syncId, updates)`                                                 | Cập nhật progress 0-100%                             |
| `completeSyncJob(syncId, result)`                                                     | Đánh dấu hoàn thành                                  |
| `failSyncJob(syncId, error)`                                                          | Đánh dấu thất bại                                    |
| `getSyncJob(syncId)`                                                                  | Lấy thông tin job                                    |
| `buildQueueAndRun({ sheetGroups, filterFn, taskFunction, noAsyncCall, extraFields })` | Chạy parallel workers (round-robin service accounts) |
| `parseSettings(rows)`                                                                 | Parse section Settings từ Excel                      |
| `parseResults(rows)`                                                                  | Parse section Results từ Excel (40+ fields)          |
| `parseVolume(value)`                                                                  | Parse volume MT5 (hỗ trợ K/M/B)                      |
| `RUN_TYPE`                                                                            | `{ NEW_RUN, UPDATE }`                                |
| `LOG_TYPE`                                                                            | `{ SYNC, SYSTEM, AUTH, ERROR }`                      |
| `LOG_STATUS`                                                                          | `{ SUCCESS, WARNING, FAILED }`                       |

---

## Middleware

| Hàm           | Tác dụng                                      |
| ------------- | --------------------------------------------- |
| `verifyToken` | Verify JWT từ `Authorization: Bearer <token>` |
| `isAdmin`     | Check role 'admin'                            |
| `isUser`      | Check role 'user'                             |

---

## Database Schema (Dynamic)

### Backtest tables (tạo động, tên bắt đầu bằng "backtest")

```sql
Time TIMESTAMP, Deal BIGINT, Symbol TEXT, Type TEXT, Direction TEXT,
Volume NUMERIC, Price NUMERIC, "Order" BIGINT, Commission NUMERIC,
Swap NUMERIC, Profit NUMERIC, Comment TEXT, Strategy_id TEXT
PRIMARY KEY: (Deal, Strategy_id)
```

### Materialized view

- `mv_all_backtest` — UNION ALL tất cả backtest tables, có cột `backtest_table`

### Tables tự động tạo khi khởi động

`strategy_metadata` · `user_preferences` · `system_logs` · `error_logs` · `users` · `roles` · `user_role`

---

## Patterns chuẩn

### Controller

```js
const syncSheet = async (req, res) => {
  try {
    const result = await opService.asyncProcessSheetGroups(req, constants.LOAD_TYPE.DRIVE);
    res.status(200).json({ message: OPERATION.SYNC_SUCCESS(TABLE_NAME), stats: result.stats });
  } catch (err) {
    res.status(500).json({ error: err.message || OPERATION.SYNC_ERROR });
  }
};
```

### Async background job

```js
const syncId = syncProgressTracker.createSyncJob(TABLE_NAME, estimatedFiles, username);
res.status(202).json({ syncId, pollUrl: `/api/sync-status/${syncId}` });

(async () => {
  try {
    const result = await heavyOperation(syncId);
    syncProgressTracker.completeSyncJob(syncId, result);
  } catch (err) {
    syncProgressTracker.failSyncJob(syncId, err.message);
  }
})();
```

### DAO raw SQL

```js
const { pool } = require("../config/db");

const getPagedData = async (tableName, page, pageSize, filters) => {
  const values = [];
  let where = "WHERE 1=1";
  if (filters.symbol) {
    values.push(filters.symbol);
    where += ` AND "Symbol" = $${values.length}`;
  }
  const result = await pool.query(`SELECT * FROM "${tableName}" ${where} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, pageSize, (page - 1) * pageSize]);
  return result.rows;
};
```

### In-memory cache

```js
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

const getCached = (key) => {
  const entry = cache.get(key);
  if (!entry || Date.now() - entry.timestamp > CACHE_TTL) return null;
  return entry.data;
};
const clearCache = () => cache.clear();
```

---

## Cấu trúc thư mục

```
backend/
├── index.js
├── package.json
├── .env
├── src/
│   ├── config/
│   │   ├── config.js
│   │   ├── config.json
│   │   ├── db.js
│   │   ├── emailConfig.js
│   │   ├── googleSheet.js
│   │   ├── multiServiceAccounts.js
│   │   └── swagger.js
│   ├── controller/
│   │   ├── aiAnalysisController.js
│   │   ├── authController.js
│   │   ├── behaviorAnalysisController.js
│   │   ├── chatController.js
│   │   ├── comparativeRankingController.js
│   │   ├── dashboardController.js
│   │   ├── opController.js
│   │   ├── riskAnalysisController.js
│   │   ├── strategyController.js
│   │   ├── systemLogController.js
│   │   └── userController.js
│   ├── dao/
│   │   ├── aiAnalysisReportDao.js
│   │   ├── behaviorAnalysisDao.js
│   │   ├── comparativeRankingDao.js
│   │   ├── dashboardDao.js
│   │   ├── errorLogDAO.js
│   │   ├── marketWatchDao.js
│   │   ├── opDao.js
│   │   ├── riskAnalysisDao.js
│   │   ├── strategyMetadataDao.js
│   │   └── systemLogDAO.js
│   ├── middlewares/
│   │   └── authJwt.js
│   ├── migrations/
│   │   ├── 20250908040542-create-user.js
│   │   ├── 20250908040555-create-role.js
│   │   └── 20250908041018-create-user-roles.js
│   ├── models/
│   │   ├── index.js
│   │   ├── role.js
│   │   └── user.js
│   ├── routes/
│   │   ├── aiAnalysisRoute.js
│   │   ├── authRoute.js
│   │   ├── behaviorAnalysisRoute.js
│   │   ├── chatRoute.js
│   │   ├── comparativeRankingRoute.js
│   │   ├── dashboardRoute.js
│   │   ├── marketRoute.js
│   │   ├── opRoute.js
│   │   ├── riskAnalysisRoute.js
│   │   ├── strategyRoutes.js
│   │   ├── systemLogRoute.js
│   │   └── userRoute.js
│   ├── scheduler/
│   │   └── dailyJob.js
│   ├── service/
│   │   ├── aiAnalysisService.js
│   │   ├── articleService.js
│   │   ├── authService.js
│   │   ├── behaviorAnalysisService.js
│   │   ├── checkFileService.js
│   │   ├── comparativeRankingService.js
│   │   ├── dashboardService.js
│   │   ├── dataValidationService.js
│   │   ├── emailService.js
│   │   ├── errorLogService.js
│   │   ├── ggSheetService.js
│   │   ├── marketService.js
│   │   ├── newsService.js
│   │   ├── openaiService.js
│   │   ├── opService.js
│   │   ├── orderService.js
│   │   ├── otpService.js
│   │   ├── riskAnalysisService.js
│   │   ├── strategyService.js
│   │   └── userService.js
│   └── utils/
│       ├── constants.js
│       ├── messages.js
│       ├── parseDeals.js
│       ├── parseSheetMetaData.js
│       ├── processQueue.js
│       └── syncProgressTracker.js
└── src/config/serviceAccounts/
    ├── acc1.json
    ├── acc2.json
    ├── acc3.json
    ├── acc4.json
    ├── acc5.json
    ├── acc6.json
    ├── acc7.json
    └── acc8.json
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