# Kế hoạch gộp `system_logs` vào `sync_jobs`

## 1. Quyết định thiết kế

- `sync_jobs` là nguồn dữ liệu duy nhất cho trạng thái đang chạy, polling và lịch sử sync.
- Không tạo thêm bản ghi `system_logs` khi một lần sync hoàn thành hoặc thất bại.
- Migrate lịch sử sync còn giá trị từ `system_logs` sang `sync_jobs`.
- Sau khi backend và frontend đã đọc hoàn toàn từ `sync_jobs`, xóa bảng `system_logs`.
- Giữ nguyên các status phục vụ polling: `PROCESSING`, `COMPLETED`, `FAILED`.
- Không thay đổi HTTP method, URL, request body hoặc response hiện tại của frontend.

## 2. Vấn đề hiện tại

Một lần sync đang có hai bản ghi nghiệp vụ:

1. `sync_jobs` lưu trạng thái và tiến độ để frontend polling.
2. `system_logs` lưu bản tổng kết sau cùng của chính lần sync đó.

Hai bảng không liên kết bằng khóa ngoại hoặc `sync_id`, trong khi thông tin trùng nhau:

| `sync_jobs` | `system_logs` |
| --- | --- |
| `table_name` | `target_table` |
| `status` | `status` |
| `total_files` | `total_files` |
| `success_files` | `success_count` |
| `failed_files` | `failed_count` |
| `duration` | `duration_ms` |
| `username` | `triggered_by` |
| `result` | `metadata` |
| `created_at` | `created_at` |

`system_logs` mang tên log hệ thống nhưng schema chủ yếu dành riêng cho sync. Khi dùng cho error hoặc security event, phần lớn cột trở thành dư thừa.

## 3. Schema đích của `sync_jobs`

Giữ toàn bộ cột hiện tại và chỉ bổ sung:

```sql
ALTER TABLE sync_jobs
  ADD COLUMN IF NOT EXISTS operation_type VARCHAR(50) NOT NULL DEFAULT 'BACKTEST_SYNC',
  ADD COLUMN IF NOT EXISTS action VARCHAR(100) NOT NULL DEFAULT 'BACKTEST_SYNC',
  ADD COLUMN IF NOT EXISTS unique_names INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS warning_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS has_warnings BOOLEAN NOT NULL DEFAULT FALSE;
```

Ý nghĩa:

- `operation_type`: phân biệt `BACKTEST_SYNC`, `CHECK_FILES`, `LOT_THRESHOLD_ANALYSIS`.
- `action`: loại thao tác cụ thể của sync, nhận `NEW_RUN` hoặc `UPDATE`; dữ liệu legacy chưa xác định được giữ `BACKTEST_SYNC`.
- `metadata`: drive URL, sync mode, strategy filter, danh sách file lỗi/cảnh báo và dữ liệu mở rộng.
- `has_warnings`: cho phép job vẫn `COMPLETED` nhưng giao diện lịch sử hiển thị `WARNING`.

Không thêm `total_rows_in_db` hoặc `strategy_ids_count` vào `sync_jobs`. Đây là trạng thái hiện tại của bảng dữ liệu, không phải kết quả riêng của một lần sync.

Không đổi tên các cột cũ để tránh làm hỏng polling và code đang chạy.

## 4. Trạng thái nghiệp vụ

### Trạng thái nội bộ trong `sync_jobs`

- `PROCESSING`: tác vụ đang chạy.
- `COMPLETED`: tác vụ đã kết thúc thành công, có thể kèm cảnh báo.
- `FAILED`: tác vụ thất bại.

### Mapping cho API lịch sử cũ

- `COMPLETED` và `has_warnings = false` → `SUCCESS`.
- `COMPLETED` và `has_warnings = true` → `WARNING`.
- `FAILED` → `FAILED`.
- `PROCESSING` → `PROCESSING` nếu endpoint cần hiển thị tác vụ đang chạy.

Nhờ mapping ở controller/DAO, frontend hiện tại không cần đổi format.

## 5. Thay đổi luồng ghi dữ liệu

### Khi tạo tác vụ

`createSyncJob()` tạo đúng một dòng trong `sync_jobs`, gồm:

- `sync_id`
- `operation_type`
- `action`
- `table_name`
- `username`, `user_id`
- `status = PROCESSING`
- tổng file ban đầu và thời gian bắt đầu

### Khi cập nhật tiến độ

`updateSyncProgress()` tiếp tục cập nhật cùng dòng:

- file hiện tại
- processed/success/failed
- progress
- metadata trung gian nếu cần

### Khi hoàn thành

`completeSyncJob()` cập nhật cùng dòng bằng kết quả cuối:

- `status = COMPLETED`
- `end_time`, `duration`, `progress = 100`
- `unique_names`, `warning_count`
- `has_warnings`
- `result` và `metadata`

Chỉ lưu thống kê của chính batch, ví dụ `inserted_rows`, `updated_rows`, `skipped_rows`, `processed_files`, `success_files`, `failed_files`. Không chạy count toàn bảng chỉ để ghi snapshot vào lịch sử.

Không gọi `systemLogDAO.createLog()` lần thứ hai.

### Khi thất bại

`failSyncJob()` cập nhật cùng dòng:

- `status = FAILED`
- `end_time`, `duration`
- `error`
- metadata lỗi cần thiết

Không insert thêm log thất bại vào bảng khác.

## 5.1. Lưu chi tiết file lỗi, trùng và không tìm thấy

Mỗi lần sync phải lưu đầy đủ issue theo đúng `sync_id`, không chỉ lưu số lượng. Dữ liệu được đặt trong `sync_jobs.metadata.issues`:

```json
{
  "issues": {
    "duplicate_files": [
      {
        "strategy_name": "065DE30H1OB",
        "occurrences": 2,
        "files": [
          { "sheet_id": "sheet-a", "file_name": "065DE30H1OB" },
          { "sheet_id": "sheet-b", "file_name": "065DE30H1OB" }
        ]
      }
    ],
    "failed_files": [
      {
        "sheet_id": "sheet-c",
        "file_name": "001BTCUSDH1OB",
        "error_code": "EMPTY_RESULTS",
        "message": "Results section is empty"
      }
    ],
    "not_found_strategies": ["002XAUUSDH1OS"],
    "warning_files": []
  }
}
```

Quy tắc:

- File trùng phải lưu cả tên strategy, số lần xuất hiện và từng Sheet ID/file nguồn.
- File lỗi phải lưu tên file, mã lỗi ổn định và nội dung lỗi dành cho user.
- Không dùng `Map` chỉ khóa bằng `sheetName` để biểu diễn từng file lỗi vì các file trùng tên sẽ ghi đè nhau.
- `warning_count`, `failed_files` và các count tổng hợp phải được tính từ cùng danh sách issue đã lưu, tránh count và detail lệch nhau.
- Không lưu stack trace hoặc secret Google API vào metadata trả cho frontend.
- Nếu issue quá nhiều, vẫn lưu đầy đủ để tải TXT nhưng API danh sách Activity chỉ trả count và một số tên preview.

## 5.2. Giữ trải nghiệm tải file TXT

Giữ nguyên ba loại file user đang quen dùng:

- `duplicate.txt`
- `error.txt`
- `notfound.txt`

Thay đổi nguồn dữ liệu:

- Không coi các file dùng chung trong thư mục `logs` là nguồn dữ liệu chính.
- Khi user bấm tải, backend đọc `sync_jobs.metadata.issues` của đúng `sync_id` và tạo TXT trong response.
- Không cần tạo hoặc giữ file TXT vật lý lâu dài trên server.
- Hai lần sync chạy đồng thời không được ghi đè nội dung của nhau.

Thêm endpoint theo từng lần sync:

```text
GET /api/sync-jobs/:syncId/issues/:issueType/download
```

Trong đó `issueType` chỉ nhận:

- `duplicate`
- `error`
- `notfound`

Endpoint phải:

- kiểm tra quyền sở hữu hoặc quyền truy cập backtest của user
- trả `404` nếu `sync_id` không tồn tại
- trả file TXT UTF-8 với tên tải tương thích giao diện cũ
- trả nội dung đúng lần sync, không lấy file gần nhất toàn hệ thống

Endpoint tải log cũ được giữ tạm trong giai đoạn chuyển đổi. Sau khi frontend đã truyền `syncId` và kiểm chứng xong mới loại bỏ.

## 5.3. Hiển thị issue trong Activity Logs

Mỗi Activity Log hiển thị:

- tổng file thành công, thất bại, cảnh báo và trùng
- tối đa một số tên strategy/file làm preview
- nút mở rộng để tải chi tiết khi cần
- nút tải `duplicate.txt`, `error.txt`, `notfound.txt` nếu loại tương ứng có dữ liệu

Không tải toàn bộ danh sách issue ngay khi mở Activity Logs. Chỉ gọi chi tiết hoặc tải TXT khi user thao tác để lịch sử có hàng nghìn file vẫn tải nhanh.

## 6. Chuyển các API lịch sử sang `sync_jobs`

Giữ nguyên các endpoint:

- `GET /api/latest-backtest`
- `GET /api/history/:tableName`
- `GET /api/all`
- `GET /api/activity/:tableName`
- `DELETE /api/cleanup`
- `DELETE /api/table/:tableName`

Thay nguồn truy vấn:

- Latest Backtest: lấy lần `BACKTEST_SYNC` mới nhất theo `table_name`.
- History: lấy lịch sử theo `table_name`.
- All: lọc theo `operation_type` và quyền truy cập data source.
- Activity: đọc `action`; giữ fallback sang `metadata.sync_mode` cho dữ liệu legacy, đồng thời đọc `metadata.strategy_filter`.
- Cleanup: chỉ thực hiện thủ công khi admin chủ động gọi API; không có lịch tự xóa.
- Delete by table: xóa lịch sử sync của bảng tương ứng, không xóa job `PROCESSING`.

Controller vẫn format response giống hiện tại:

- `backtest`
- `totalFiles`
- `uniqueNames`
- `success`, `failed`, `warning`
- `totalRowsInDB`
- `strategyIds`
- `lastUpload`
- `duration`
- `status`
- `metadata`

### Phân biệt dữ liệu hiện tại và dữ liệu lần sync gần nhất

Bảng **Backtest Information** đang ghép hai nhóm dữ liệu khác bản chất:

1. Thông tin hiện tại của database.
2. Thông tin của lần sync gần nhất.

Nguồn dữ liệu phải được chốt như sau:

| Cột giao diện | Nguồn chuẩn |
| --- | --- |
| Backtest | Danh sách bảng backtest user được quyền truy cập |
| Total Rows In DB | `COUNT(*)` trực tiếp trên bảng backtest hiện tại, loại `type = 'balance'` |
| Total Strategies | `COUNT(DISTINCT strategy_id)` trực tiếp trên bảng backtest hiện tại, loại `type = 'balance'` |
| Total Files | `sync_jobs` của lần `BACKTEST_SYNC` gần nhất |
| Unique Names | `sync_jobs` của lần `BACKTEST_SYNC` gần nhất |
| Last Success | `sync_jobs` của lần gần nhất |
| Last Failed | `sync_jobs` của lần gần nhất |
| Warning | `sync_jobs` của lần gần nhất |
| Last Status | `sync_jobs` của lần gần nhất |
| Last Duration | `sync_jobs` của lần gần nhất |
| Last Upload | `sync_jobs` của lần gần nhất |

Không được lấy `Total Rows In DB` và `Total Strategies` từ snapshot lịch sử trong `sync_jobs`, vì sau lần sync gần nhất user có thể:

- xóa strategy
- sync thêm dữ liệu
- ghi đè strategy
- xóa lịch sử sync
- thay đổi dữ liệu bằng luồng khác

Hai giá trị này phải phản ánh dữ liệu hiện tại tại thời điểm request. Xóa lịch sử sync chỉ làm các cột `Last ...` trở thành `NO DATA` hoặc `-`; tổng row và tổng strategy vẫn phải hiển thị bình thường.

Hai thống kê phải dùng cùng một nguồn và cùng điều kiện loại balance để tránh `backtest` và bảng tạm/staging cho kết quả khác nhau. Query định hướng:

```sql
SELECT
  COUNT(*) FILTER (WHERE LOWER(type) <> 'balance')::bigint AS total_rows,
  COUNT(DISTINCT strategy_id)
    FILTER (WHERE LOWER(type) <> 'balance')::bigint AS total_strategies
FROM "<validated_backtest_table>";
```

`strategy_metadata` vẫn được cập nhật và có thể dùng để đối soát, nhưng không phải nguồn count hiển thị trong Backtest Information. Nếu metadata lệch bảng deals thì ghi warning vào `sync_jobs.metadata` để sửa dữ liệu, không đổi nguồn count sang metadata.

Để tránh N+1 query không kiểm soát khi có nhiều bảng:

- Lấy danh sách bảng đã qua kiểm tra quyền từ `getAllBacktestTables(actor)`.
- Gộp `Total Rows In DB` và `Total Strategies` vào một query trên mỗi bảng để chỉ quét dữ liệu một lần.
- Chỉ chạy count chính thức sau khi sync hoàn tất hoặc khi user bấm Refresh; không count lại sau từng file.
- Chạy thống kê các bảng theo concurrency giới hạn.
- Quote table identifier bằng helper chuẩn, không nối trực tiếp tên bảng từ request.
- Một bảng lỗi thống kê không làm hỏng toàn bộ response; riêng bảng đó trả trạng thái thống kê lỗi rõ ràng.
- Không dùng số ước lượng từ `pg_class` vì ưu tiên tính đúng đắn nghiệp vụ.

### Tên cột trên giao diện

Do mỗi hàng Backtest Information hiển thị lần sync gần nhất, đổi nhãn:

- `Status` → `Last Status` hoặc rõ hơn là `Last Sync Status`.
- `Duration` → `Last Duration` hoặc rõ hơn là `Last Sync Duration`.

Không đổi tên cột `status`, `duration` trong database. Mỗi dòng `sync_jobs` là một lần chạy cụ thể nên tên hiện tại vẫn đúng; chữ `Last` chỉ thuộc ngữ cảnh truy vấn tổng hợp và giao diện.

## 7. Lưu giữ lịch sử

Hiện tại `createSyncJob()` tự xóa tất cả bản ghi quá 24 giờ. Cơ chế này phải bỏ vì `sync_jobs` sẽ kiêm lịch sử.

Chính sách mới:

- Không tự động xóa job `PROCESSING`, `COMPLETED` hoặc `FAILED`.
- Không dùng scheduler cleanup và không cần biến môi trường `SYNC_JOB_RETENTION_DAYS`.
- Lịch sử trong `sync_jobs` được giữ lâu dài vì tần suất sync thấp.
- Endpoint cleanup hiện có vẫn được giữ để admin chủ động dọn khi thực sự cần; endpoint này không được gọi tự động.
- Bỏ index retention cũ, chỉ giữ index phục vụ truy vấn lịch sử:

```sql
CREATE INDEX IF NOT EXISTS idx_sync_jobs_operation_table_created
  ON sync_jobs(operation_type, table_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_jobs_user_created
  ON sync_jobs(user_id, created_at DESC);
```

## 8. Migration dữ liệu cũ

### Bước 1 - Mở rộng `sync_jobs`

Chạy `ALTER TABLE` và tạo index trước khi deploy code mới. Tất cả thay đổi chỉ thêm cột nên code cũ vẫn chạy được.

### Bước 2 - Chuyển lịch sử sync

Chỉ migrate các dòng:

```text
log_type = 'SYNC'
action = 'BACKTEST_SYNC'
```

Mỗi bản ghi legacy nhận `sync_id` ổn định:

```text
legacy_system_log_<system_logs.id>
```

Mapping:

- `target_table` → `table_name`
- `SUCCESS` → `COMPLETED`, `has_warnings = false`
- `WARNING` → `COMPLETED`, `has_warnings = true`
- `FAILED` → `FAILED`
- `success_count` → `success_files`
- `failed_count` → `failed_files`
- `duration_ms` → `duration`
- `triggered_by` → `username`
- `metadata` → `metadata`

`start_time` được tính từ `created_at - duration_ms`; `end_time` lấy từ `created_at`.

Migration phải idempotent bằng `ON CONFLICT (sync_id) DO NOTHING`.

### Bước 3 - Chống trùng lịch sử

Do schema cũ không lưu `sync_id` trong `system_logs`, không thể join tuyệt đối với `sync_jobs`.

Trước khi insert legacy, bỏ qua dòng có bản ghi `sync_jobs` tương ứng theo:

- cùng `table_name`
- cùng `username`
- thời điểm kết thúc nằm trong sai số nhỏ
- duration và tổng file khớp

Nếu không chắc chắn, ưu tiên giữ một bản legacy có `metadata.legacy_import = true`, sau đó API history loại trùng khi hiển thị. Không xóa dữ liệu lịch sử trước khi kiểm chứng.

### Bước 4 - Xóa bảng trong cùng lượt migration

Sau khi câu lệnh migrate và audit hoàn tất, chạy ngay trong cùng file:

```sql
DROP TABLE system_logs;
```

Code runtime hiện tại đã chuyển API latest/history/activity sang `sync_jobs` và không còn ghi `system_logs`. Lệnh `DROP` không dùng `CASCADE`; nếu còn dependency ngoài dự kiến, PostgreSQL phải báo lỗi thay vì xóa dây chuyền.

## 9. Xử lý dữ liệu không phải sync

### Error ứng dụng

Không chuyển error ứng dụng vào `sync_jobs`.

- Dùng structured `console.error` để nền tảng deploy thu thập stdout/stderr.
- Bổ sung các field: request path, function, user, entity, error code và stack.
- `errorLogService` và wrapper legacy không được tiếp tục gọi `systemLogDAO`.

Hiện tại `errorLogService` gọi `insertSystemLog()` nhưng DAO không export hàm này; khi refactor phải loại bỏ luôn đường gọi lỗi này.

### Chuyển quyền Data Source

`BACKTEST_OWNER_TRANSFER` không phải sync.

- Không ghi vào `sync_jobs`.
- Ghi structured application log gồm source, owner cũ, owner mới và người thao tác.
- Nếu sau này có yêu cầu audit bắt buộc trong DB, thiết kế bảng audit riêng theo nghiệp vụ bảo mật; không khôi phục `system_logs` dạng hiện tại.

## 10. File dự kiến thay đổi khi triển khai

### Backend

- `src/utils/syncProgressTracker.js`
- `src/service/syncService.js`
- `src/dao/systemLogDAO.js` hoặc thay bằng DAO đọc lịch sử từ `sync_jobs`
- `src/controller/systemLogController.js`
- `src/scheduler/dailyJob.js`
- `src/service/errorLogService.js`
- `src/dao/errorLogDAO.js`
- `src/dao/dataSourceDao.js`
- `src/dao/opDao.js`
- `src/service/openaiService.js`
- `index.js`
- `migration.js`
- `markdown/migration.md`

### Frontend

Không cần đổi nếu backend giữ nguyên contract. Chỉ sửa frontend nếu kiểm thử phát hiện đang phụ thuộc trực tiếp tên status hoặc field DB cũ.

## 11. Trình tự deploy an toàn

1. Backup database production.
2. Chạy migration chỉ thêm cột/index cho `sync_jobs`.
3. Deploy backend phiên bản ghi kết quả duy nhất vào `sync_jobs`.
4. Migrate lịch sử sync từ `system_logs`.
5. Chuyển toàn bộ API lịch sử sang đọc `sync_jobs`.
6. Theo dõi một chu kỳ sync mới và polling thực tế.
7. Xác nhận không còn truy vấn runtime tới `system_logs`.
8. Drop `system_logs` trong migration cuối.
9. Không cần deploy frontend nếu contract API không đổi.

Không nên vừa deploy code mới vừa drop `system_logs` trong cùng bước đầu tiên vì sẽ khó rollback nếu còn caller bị bỏ sót.

## 12. Verification Plan

### Polling và lifecycle

- Tạo sync async và polling `/sync-status/:syncId`.
- Progress cập nhật đúng từ 0 đến 100.
- Restart backend giữa sync không làm mất trạng thái.
- Sync thành công cập nhật đúng một dòng.
- Sync cảnh báo vẫn có status nội bộ `COMPLETED`.
- Sync thất bại cập nhật đúng error và duration.

### Các loại tác vụ dùng `sync_jobs`

- Sync Google Drive/Sheet.
- Check files.
- Volume Optimization (`LOT_THRESHOLD_ANALYSIS`).
- Không để API latest backtest lấy nhầm check-files hoặc Volume Optimization.

### Lịch sử giao diện

- Latest Backtest hiển thị đúng từng bảng.
- History và Activity đúng sync mode, strategy filter và username.
- User thường chỉ xem bảng thuộc quyền mình.
- Admin xem được toàn bộ.
- Xóa backtest dọn đúng lịch sử của bảng đó.
- Activity Log hiển thị đúng count và preview file lỗi/trùng/not-found của từng `sync_id`.
- Tải TXT từ một Activity Log trả đúng dữ liệu của lần sync đó sau khi reload hoặc đăng nhập lại.
- Hai lần sync đồng thời không tải nhầm file TXT của nhau.
- `Total Rows In DB` luôn khớp `COUNT(*)` của bảng backtest hiện tại.
- `Total Strategies` luôn khớp `COUNT(DISTINCT strategy_id)` sau khi loại `type = 'balance'` trong bảng hiện tại.
- `Total Rows In DB` và `Total Strategies` sử dụng cùng điều kiện loại balance.
- Sau sync có thể đối soát `strategy_metadata` với bảng deals và cảnh báo nếu lệch.
- Xóa lịch sử sync không làm mất hai thống kê database hiện tại.
- Sau khi xóa hoặc thêm strategy mà chưa sync lại, hai thống kê hiện tại vẫn cập nhật đúng.
- Giao diện dùng nhãn `Last Status` và `Last Duration`, trong khi API polling vẫn giữ `status` và `duration`.

### Migration

- So sánh tổng số log sync trước/sau theo từng bảng và status.
- Chạy migration hai lần không sinh bản ghi trùng.
- Kiểm tra ngẫu nhiên metadata, duration và thống kê file.
- `rg "system_logs|systemLogDAO"` không còn caller runtime trước khi drop bảng.

### Hồi quy bắt buộc

- Sync async và sync status polling.
- Strategy list, dashboard cache và Backtest CRUD.
- Thông báo sync started/completed/failed.
- Volume Optimization progress.
- Auth và phân quyền data source.

## 13. Tiêu chí hoàn thành

- Một lần sync chỉ tồn tại một bản ghi nghiệp vụ trong `sync_jobs`.
- Không còn bảng `system_logs` trên schema production.
- Không mất lịch sử sync cũ cần giữ lại.
- Polling và notification hoạt động như trước.
- API frontend không đổi contract.
- Error/security event không bị nhét vào schema sync.
- Retention không xóa tác vụ đang `PROCESSING`.
