# Kế hoạch phân quyền Backtest Table theo người sở hữu

## 1. Mục tiêu nghiệp vụ

Mỗi backtest table chỉ thuộc về một user:

```text
User A -> chỉ xem và thao tác dữ liệu thuộc các backtest table của User A
User B -> chỉ xem và thao tác dữ liệu thuộc các backtest table của User B
Admin  -> xem và thao tác toàn bộ backtest table
```

Quy tắc này áp dụng xuyên suốt hệ thống, không chỉ ở dropdown giao diện:

- danh sách backtest table;
- Strategies;
- Dashboard;
- Risk Analysis;
- Behavior Analysis;
- Comparative Ranking;
- Volume Optimization và Analysis Run;
- AI Analysis;
- System Logs liên quan đến backtest table;
- đồng bộ dữ liệu;
- tạo, xoá, clear và cập nhật backtest table;
- MT5 Every Tick sync vào target backtest table;
- lựa chọn `all_backtests`.

`all_backtests` không còn mang nghĩa toàn bộ bảng trong database đối với user thường:

```text
User thường: all_backtests = tất cả backtest table thuộc chính user đó
Admin:       all_backtests = tất cả backtest table trong hệ thống
```

## 2. Nguyên tắc thiết kế

### 2.1. Ownership ở cấp bảng, không ở cấp deal

Không thêm `owner_user_id` vào từng dòng trong các bảng `backtest_*`, vì mỗi bảng có thể chứa hàng triệu deal và toàn bộ bảng chỉ thuộc một user.

Ownership được lưu tại registry `data_source`:

```text
data_source.source_name    -> tên physical backtest table
data_source.owner_user_id  -> user sở hữu bảng
```

Ưu điểm:

- không làm phình các bảng deal;
- không phải update hàng triệu dòng;
- lọc danh sách bảng rất nhanh;
- `all_backtests` chỉ UNION các bảng được phép;
- quản lý quyền tập trung tại một nơi.

### 2.2. Backend là lớp bảo vệ bắt buộc

Frontend chỉ hiển thị danh sách đã lọc để cải thiện trải nghiệm. Mọi API backend vẫn phải kiểm tra quyền lại.

User không được vượt quyền bằng cách tự sửa request:

```text
GET /api/...?...backtestTable=backtest_cua_user_khac
POST /api/... { source_tables: ["backtest_cua_user_khac"] }
DELETE /api/backtest-tables/backtest_cua_user_khac
```

Các request này phải bị từ chối trước khi SQL động được tạo hoặc thực thi.

### 2.3. Fail closed

- Không tìm thấy ownership: user thường không được truy cập.
- `owner_user_id IS NULL`: chỉ admin nhìn thấy và xử lý.
- Thiếu access context trong request web: không được mặc định trả toàn bộ bảng.
- Background job phải truyền owner rõ ràng; không dùng quyền hệ thống ngầm nếu không cần thiết.

## 3. Thay đổi database

### 3.1. Bảng `data_source`

Bổ sung:

```text
owner_user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL
```

Giữ nullable để:

- migration dữ liệu cũ theo từng bước;
- bảng chưa xác định owner chỉ admin thấy;
- khi user bị xoá, bảng không bị xoá vật lý ngoài ý muốn và chuyển về trạng thái admin quản lý.

Index cần có:

```text
idx_data_source_owner_enabled
  (owner_user_id, enabled, source_type)
```

Unique hiện tại trên `source_name` tiếp tục được giữ. Tên physical table vẫn duy nhất toàn database.

### 3.2. Database mới và database hiện tại

Database mới:

- cập nhật `CREATE TABLE IF NOT EXISTS data_source` trong `dataSourceDao.js` để có `owner_user_id` ngay từ đầu;
- chỉ dùng `CREATE TABLE/CREATE INDEX` trong init DAO.

Database hiện tại:

- câu lệnh `ALTER TABLE`, backfill và constraint được ghi vào `backend/migration.md` ở một phần riêng;
- chạy migration trước khi bật enforcement;
- không nhúng `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` vào startup DAO.

## 4. Backfill ownership cho bảng hiện tại

Hiện tại `data_source` không lưu owner. Không được gán bừa toàn bộ bảng cho user đang đăng nhập hoặc process khởi động backend.

### 4.1. Thứ tự suy luận đề xuất

Với từng `source_name`, tìm owner theo thứ tự:

1. Mapping thủ công đã được admin xác nhận.
2. `sync_jobs.user_id` của lần tạo/sync đầu tiên đáng tin cậy cho `table_name`.
3. `mt5_auto_backtest_runs.owner_user_id` của lần sync tạo target table.
4. Các log tạo bảng có user ID rõ ràng, nếu tồn tại.
5. Không đủ bằng chứng: để `owner_user_id = NULL` và chỉ admin thấy.

### 4.2. Xử lý xung đột lịch sử

Nếu một table từng được nhiều user ghi dữ liệu:

- không tự chọn owner theo bản ghi mới nhất;
- xuất báo cáo conflict gồm `source_name` và danh sách user liên quan;
- admin quyết định owner hoặc tách dữ liệu sang các bảng mới;
- trong thời gian chưa xử lý, bảng là admin-only.

### 4.3. Báo cáo migration

Script audit/backfill phải trả được:

```text
total_tables
assigned_tables
unassigned_tables
conflicted_tables
owner -> table count
```

Không xoá hoặc đổi tên physical backtest table trong phase này.

## 5. Access context dùng chung

`verifyToken` hiện chỉ gắn `req.userId`. Cần có helper/middleware dùng chung để resolve:

```text
actor.userId
actor.role
actor.isAdmin
```

Đề xuất:

```text
resolveRequestActor(req)
```

Actor được resolve một lần cho request, tránh mỗi DAO tự query role nhiều lần.

Không tin `owner_user_id`, `isAdmin` hoặc role do frontend gửi lên.

## 6. Backtest access service tập trung

Tạo module dùng chung, ví dụ:

```text
src/service/backtestAccessService.js
```

Các hàm chính:

```text
getAccessibleDataSources(actor, options)
getAccessibleTableNames(actor, options)
getDataSourceByName(tableName)
canAccessBacktestTable(actor, tableName)
assertCanReadBacktestTable(actor, tableName)
assertCanWriteBacktestTable(actor, tableName)
assertCanManageBacktestTable(actor, tableName)
validateAccessibleSourceNames(actor, sourceInput)
```

Quy tắc:

```text
actor.isAdmin = true
  -> được truy cập mọi data_source enabled hợp lệ

actor.isAdmin = false
  -> chỉ owner_user_id = actor.userId
```

Phân biệt rõ:

- table không tồn tại/không đăng ký;
- table tồn tại nhưng không có quyền;
- table bị disable;
- table chưa có owner.

Response cho user thường nên dùng `403 Forbidden` hoặc `404 Not Found` thống nhất để tránh lộ tên bảng. Đề xuất dùng `403` cho API quản trị và `404` cho API đọc trực tiếp nếu cần hạn chế enumeration; quyết định một lần và áp dụng đồng nhất.

## 7. Refactor `dataSourceDao.js`

### 7.1. Ghi registry

Đổi chữ ký:

```text
upsertDataSource(sourceName, displayName, ownerUserId, options)
```

Quy tắc upsert:

- tạo bảng registry mới: bắt buộc có owner đối với luồng user;
- update display/enabled: không tự thay owner;
- chỉ admin hoặc luồng transfer riêng mới được đổi owner;
- startup sync phát hiện physical table chưa có registry: insert owner `NULL`, không gán cho một user bất kỳ;
- nếu registry đã có owner thì startup sync phải giữ nguyên owner.

### 7.2. Đọc registry

Đổi:

```text
getEnabledDataSources(actor)
validateAndFilterSourceNames(sourceInput, actor)
```

Không còn hàm web-facing nào gọi danh sách global khi thiếu actor.

Các tác vụ bảo trì nội bộ cần toàn bộ bảng phải gọi API tên rõ ràng, ví dụ:

```text
getAllEnabledDataSourcesForSystemMaintenance()
```

Không dùng chung một hàm có hành vi “thiếu actor = admin”.

## 8. `all_backtests` và query builder

### 8.1. `resolveTableSubquery`

Đổi chữ ký:

```text
resolveTableSubquery(sourceInput, actor)
```

Khi `sourceInput = all_backtests`:

- user thường lấy danh sách table thuộc owner đó;
- admin lấy toàn bộ table;
- không có table được phép: trả trạng thái no-data rõ ràng, không fallback sang global.

Khi chọn một hoặc nhiều table:

- toàn bộ table phải thuộc scope được phép;
- không âm thầm bỏ table trái quyền rồi chạy phần còn lại, vì user có thể hiểu sai kết quả;
- nếu có bất kỳ table trái quyền thì reject request.

### 8.2. SQL động

Chỉ tạo `UNION ALL` từ danh sách đã được access service xác nhận.

Không nội suy trực tiếp `tableName` lấy từ request trước khi:

1. validate identifier;
2. xác nhận physical table tồn tại;
3. xác nhận registry enabled;
4. xác nhận actor có quyền.

## 9. Luồng tạo backtest table

### 9.1. Tạo thủ công trên giao diện

```text
POST /backtest-tables
  -> verifyToken
  -> resolve actor
  -> create physical table
  -> data_source.owner_user_id = actor.userId
```

Admin tạo bảng:

- mặc định admin là owner;
- nếu UI/API cho phép tạo hộ thì chỉ admin được gửi `owner_user_id`;
- owner gửi từ user thường bị bỏ qua hoặc reject.

Physical table và registry nên được tạo trong cùng transaction nếu kiến trúc PostgreSQL hiện tại cho phép, tránh có table nhưng thiếu registry hoặc ngược lại.

### 9.2. Sync dữ liệu web/Google Drive/file

Mọi luồng tạo table từ sync phải truyền `req.userId` xuyên qua:

```text
controller -> service -> DAO -> upsertDataSource
```

Nếu table đã tồn tại:

- owner hoặc admin mới được sync thêm;
- user khác không được ghi vào table;
- background callback phải giữ owner từ lúc request được tạo, không phụ thuộc request object sau khi response đã trả.

### 9.3. Auto Every Tick sync

Khi sync vào target backtest table:

- bảng đã tồn tại: batch owner hoặc admin phải có quyền ghi;
- bảng mới: owner là `mt5_auto_backtest_runs.owner_user_id`/actor tạo batch;
- Worker không tự quyết định owner;
- không cho một batch của User A sync vào table của User B;
- admin có thể override theo quyền admin nhưng phải có audit log.

## 10. Luồng sửa, xoá và quản trị table

Các thao tác sau phải gọi `assertCanManageBacktestTable`:

- delete table;
- clear data;
- disable/enable data source;
- rename nếu sau này có;
- cập nhật display name;
- xoá strategy metadata theo table;
- xoá logs/report liên quan table.

User thường chỉ quản lý table của mình. Admin quản lý tất cả.

Xoá user không tự drop table. `owner_user_id` chuyển `NULL`, table thành admin-only để tránh mất dữ liệu.

## 11. Các module đọc dữ liệu cần cập nhật

### 11.1. Backtest/Data Sources

- `opController.js`
- `opService.js`
- `opDao.js`
- `dataSourceDao.js`
- `queryBuilderHelper.js`

### 11.2. Strategies

- `strategyController.js`
- `strategyService.js`
- `strategyMetadataDao.js`
- `strategyFilterHelper.js`
- `strategyTimeRangeDao.js`

Strategy không cần thêm owner riêng nếu ownership được suy ra chắc chắn từ `backtest_table`. Mọi query strategy phải đi qua quyền của table trước.

Nếu API nhận `strategy_id` nhưng không nhận table, phải xác định các bản ghi strategy chỉ trong những table actor được phép; không được tìm strategy trùng ID trong table của user khác.

### 11.3. Dashboard và phân tích

- `dashboardController/Service/Dao`
- `riskAnalysisController/Service/Dao`
- `behaviorAnalysisController/Service/Dao`
- `comparativeRankingController/Service/Dao`
- `marketWatchDao`

Tất cả `all_backtests` phải dùng accessible table list của actor.

### 11.4. Volume Optimization

- `lotThresholdController.js`
- `lotThresholdService.js`
- `lotThresholdDao.js`

Quy tắc:

- user chỉ tạo Analysis Run từ các table của mình;
- `created_by` phải lấy từ token;
- user chỉ liệt kê/xem/xoá run do mình tạo và có source tables thuộc quyền;
- admin xem tất cả;
- run cũ chứa table không còn quyền phải bị ẩn/reject;
- không được dùng source table trái quyền để tính threshold.

### 11.5. AI Analysis và report

- `aiAnalysisController/Service`
- `aiAnalysisReportDao`
- `openaiService.js`

AI chỉ nhận dữ liệu từ table actor được phép. Cache/report AI cũng phải mang scope owner để không trả báo cáo của user khác.

### 11.6. System Logs

- User thường chỉ thấy log có `target_table` thuộc table của mình.
- Log không gắn table tiếp tục theo chính sách log hiện tại.
- Admin xem toàn bộ.

## 12. Cache isolation bắt buộc

Hiện nhiều cache key chỉ phụ thuộc `sourceInput`, ví dụ `src_all`. Sau phân quyền, hai user cùng gọi `all_backtests` nhưng tập table khác nhau.

Cache key phải bao gồm access scope:

```text
owner:<userId>:src_all
admin:src_all
owner:<userId>:src_backtest_a_backtest_b
```

Hoặc tốt hơn dùng fingerprint từ danh sách table đã authorize:

```text
scope:<role>:<userId>:tables:<sorted-table-hash>
```

Áp dụng cho:

- Dashboard cache;
- Risk cache;
- Behavior cache;
- Comparative Ranking cache;
- Strategies/filter cache;
- AI analysis cache;
- Volume Optimization list/cache;
- bất kỳ memoization/inflight request nào dựa trên `all_backtests`.

Không dùng cache global `src_all` cho user thường.

Khi table được sync, xoá hoặc chuyển owner:

- invalidate cache của owner cũ;
- invalidate cache của owner mới;
- invalidate cache admin;
- invalidate cache có chứa table đó.

## 13. Frontend

Frontend tiếp tục gọi endpoint danh sách table, nhưng backend chỉ trả table được phép.

Các khu vực cần xác nhận:

- Backtest Tables;
- Dashboard filter bar;
- Strategies Backtest Table dropdown;
- Risk/Behavior/Comparative dropdown;
- Volume Optimization Data Source;
- MT5 target table selector;
- Auto Every Tick sync dialog;
- System Logs;
- News/market pages có dùng backtest table.

Quy tắc UI:

- user thường không thấy owner selector;
- admin có thể thấy chip/cột owner để phân biệt table;
- khi table đang chọn không còn trong accessible list, reset về `all_backtests` của chính user;
- không giữ table trái quyền trong localStorage/session cache;
- khi API trả 403/404, hiển thị thông báo rõ và refresh danh sách table;
- `all_backtests` có label phù hợp nhưng không cần lộ chi tiết quyền trong URL.

Frontend không gửi `owner_user_id` để tự xác nhận quyền.

## 14. Hiệu năng

Phân quyền này đồng thời giảm tải vì user thường chỉ query dữ liệu của mình:

- giảm số table trong `UNION ALL`;
- giảm số deal cần scan;
- giảm sort/hash/temp file PostgreSQL;
- giảm thời gian giữ connection;
- giảm kích thước response;
- giảm cache và inflight computation dùng chung.

Index quan trọng:

```text
data_source(owner_user_id, enabled, source_type)
```

Admin vẫn query toàn hệ thống nên cần giữ các tối ưu hiện tại cho admin. Phân quyền không thay thế pagination, index và giới hạn concurrency.

## 15. Bảo mật và các trường hợp biên

### User A thử truy cập User B

- Không thấy table trong dropdown.
- Gọi trực tiếp API bị reject.
- Không nhận dữ liệu qua `all_backtests`.
- Không nhận cache đã tạo bởi User B.

### Strategy ID trùng nhau

Strategy được phân biệt bằng `(backtest_table, strategy_id)`. User chỉ tìm kiếm trong accessible tables nên strategy ID trùng giữa hai user không bị lẫn.

### Table không owner

- Chỉ admin thấy.
- Không nằm trong `all_backtests` của user thường.
- Admin phải assign owner trước khi user sử dụng.

### Chuyển ownership

Chỉ admin thực hiện:

```text
old owner mất quyền ngay
new owner có quyền sau khi transaction hoàn tất
cache hai phía được invalidate
ghi system log
```

### User bị xoá

- Không drop physical table.
- `owner_user_id` thành `NULL`.
- Table chuyển sang admin-only.

## 16. API quản trị owner đề xuất

Chỉ admin:

```text
PATCH /api/data-sources/:sourceName/owner
body: { owner_user_id }
```

Response:

```text
source_name
previous_owner_user_id
owner_user_id
updated_at
```

Ghi system log gồm admin thực hiện, owner cũ, owner mới và table.

Không cần API chia sẻ nhiều owner trong yêu cầu hiện tại. Một table có đúng một owner.

## 17. Kế hoạch triển khai theo phase

### Phase 0 — Audit trước khi sửa

1. Liệt kê toàn bộ backtest physical table.
2. Đối chiếu với `data_source`.
3. Tìm owner khả dụng từ sync jobs và MT5 auto runs.
4. Xuất danh sách unassigned/conflict.
5. Liệt kê toàn bộ API và cache dùng table/source input.

### Phase 1 — Schema và backfill

1. Bổ sung `owner_user_id` vào schema tạo mới.
2. Viết SQL migration vào `migration.md`.
3. Tạo index ownership.
4. Chạy script audit/backfill.
5. Admin xử lý conflict/unassigned cần thiết.

Chưa bật enforcement trước khi backfill được kiểm tra.

### Phase 2 — Access context và central guard

1. Resolve actor từ JWT/user role.
2. Tạo `backtestAccessService`.
3. Refactor `dataSourceDao` nhận actor/owner.
4. Viết unit tests cho user/admin/unassigned.

### Phase 3 — Danh sách và CRUD table

1. Lọc `/backtest-tables` và `/data-sources`.
2. Gán owner khi tạo table.
3. Chặn create/sync/delete/clear trái quyền.
4. Thêm admin owner assignment.

### Phase 4 — Read paths và `all_backtests`

1. Refactor `resolveTableSubquery` nhận actor.
2. Truyền actor xuyên controller -> service -> DAO.
3. Cập nhật Strategies.
4. Cập nhật Dashboard/Risk/Behavior/Comparative.
5. Cập nhật AI/System Logs/Market.

### Phase 5 — MT5 và background jobs

1. Gán owner cho target table tạo từ Every Tick sync.
2. Chặn batch sync vào table trái quyền.
3. Giữ owner trong background context sau khi HTTP response kết thúc.
4. Test admin override và audit.

### Phase 6 — Volume Optimization

1. Lọc run theo creator và accessible source tables.
2. Chặn chạy analysis với table trái quyền.
3. Chặn xem/xoá run của user khác.
4. Kiểm tra Strategies áp dụng Lot OP không đọc run trái quyền.

### Phase 7 — Cache isolation

1. Thêm owner/scope fingerprint vào mọi cache key.
2. Tách inflight request theo scope.
3. Invalidate khi sync/delete/transfer.
4. Test hai user gọi `all_backtests` đồng thời.

### Phase 8 — Frontend

1. Dùng danh sách table đã lọc từ backend.
2. Reset selection trái quyền.
3. Admin hiển thị owner nếu cần.
4. Xử lý 403/404 rõ ràng.
5. Xoá cache/local state có thể lưu table cũ.

### Phase 9 — E2E và rollout

1. Test User A, User B và Admin trên cùng database.
2. Test direct forged requests.
3. Test `all_backtests` và cache isolation.
4. Test create/sync/delete/Auto Every Tick/Volume Optimization.
5. Đo query time và số table được UNION trước/sau.
6. Bật enforcement sau khi dữ liệu owner đã được nghiệm thu.

## 18. Test matrix bắt buộc

| Tình huống | User A | User B | Admin |
|---|---:|---:|---:|
| List table của A | Cho phép | Không thấy | Cho phép |
| Đọc table của A | Cho phép | Từ chối | Cho phép |
| `all_backtests` | Chỉ table A | Chỉ table B | Toàn bộ |
| Sync vào table A | Cho phép | Từ chối | Cho phép |
| Xoá table A | Cho phép | Từ chối | Cho phép |
| Xem strategy table A | Cho phép | Không thấy | Cho phép |
| Chạy Lot OP với table A | Cho phép | Từ chối | Cho phép |
| Xem Analysis Run của A | Cho phép | Không thấy | Cho phép |
| Dùng cache `src_all` của A | Scope A | Không được nhận | Scope admin |
| Table owner NULL | Không thấy | Không thấy | Cho phép |

Test thêm:

- multi-select gồm một table hợp lệ và một table trái quyền phải reject toàn bộ;
- cùng `strategy_id` ở table A và B không lẫn dữ liệu;
- user sửa request bằng DevTools không vượt quyền;
- background sync không mất owner;
- transfer owner làm cache cũ mất hiệu lực;
- xoá user không xoá physical table;
- admin vẫn truy vấn được toàn bộ.

## 19. Rollback và an toàn triển khai

- Migration chỉ thêm cột/index, không drop dữ liệu.
- Không đổi cấu trúc các bảng `backtest_*`.
- Không update hàng triệu deal.
- Backfill chạy trên registry nhỏ.
- Có thể deploy schema trước, code enforcement sau.
- Nếu phát hiện bảng chưa gán owner, để admin-only thay vì mở global.
- Không rollback bằng cách xoá cột ownership khi dữ liệu đã chạy; chỉ tắt enforcement tạm thời trong môi trường test nếu cần điều tra.

## 20. Tiêu chí nghiệm thu

1. User thường chỉ thấy bảng và strategy của mình ở mọi tab.
2. `all_backtests` của user không chứa dữ liệu user khác.
3. Admin vẫn xem được toàn bộ.
4. Direct API request không vượt quyền.
5. Cache không rò dữ liệu giữa user.
6. Tạo/sync/Auto Every Tick gán đúng owner.
7. User không thể ghi hoặc xoá table của người khác.
8. Volume Optimization và Analysis Run tuân thủ ownership.
9. Table legacy chưa xác định owner chỉ admin thấy.
10. Query của user thường giảm số table UNION và giảm tải tương ứng.

