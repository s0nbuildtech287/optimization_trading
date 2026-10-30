# Kế hoạch dọn dữ liệu MT5 Optimize và xóa Session an toàn

## 1. Mục tiêu

Giải quyết trường hợp một session có hàng chục triệu dòng `mt5_optimize_results`, chiếm hàng chục GB, nhưng vẫn bảo toàn:

- các bộ đang nằm trong Watchlist;
- các bộ đã chạy Every Tick và có Backtest Candidate;
- candidate đang được chọn tại Backtest Staging;
- dữ liệu đã sync vào các bảng `backtest_*`;
- phân quyền session theo user và quyền xem toàn hệ thống của admin.

Kế hoạch gồm hai chức năng độc lập:

1. Purge Unused Optimize Results: dọn các bộ Optimize không còn giá trị sử dụng nhưng giữ session hoạt động.
2. Delete Completed Session: xóa toàn bộ workspace MT5 sau khi dữ liệu cuối cùng đã sync an toàn.

## 2. Hiện trạng

- `mt5_sessions` đang cascade xuống `mt5_job_queue`, `mt5_optimize_results` và `mt5_logs`.
- `mt5_optimize_results` cascade xuống `mt5_backtest_candidates`.
- `mt5_backtest_candidates` cascade xuống `mt5_backtest_staging`.
- Đã có API xóa riêng Backtest Candidate.
- Chưa có API purge Optimize Result theo session.
- Chưa có API xóa session.
- Runtime `uploads/mt5_runtime/<job_id>` đã được dọn sau khi job kết thúc và có sweeper xử lý thư mục mồ côi.
- Dữ liệu đã sync vào bảng động `backtest_*` không có foreign key ngược về session, nên không bị xóa khi session bị xóa.

## 3. Nguyên tắc an toàn

1. User chỉ được purge hoặc xóa session do chính mình sở hữu; admin được thao tác mọi session.
2. Không purge hoặc xóa khi session còn job `PENDING`, `CLAIMED` hoặc `RUNNING`.
3. Không thực hiện một lệnh `DELETE` khổng lồ trên hàng chục triệu dòng.
4. Mọi thao tác lớn phải chia chunk, có thể dừng và chạy tiếp mà không làm sai dữ liệu.
5. Không xóa Candidate hoặc Staging khi chỉ sử dụng chức năng Purge Unused.
6. Không xóa bảng `backtest_*`, `strategy_metadata`, API key hoặc Worker khi xóa session.
7. Phải preview số dòng bị ảnh hưởng trước khi xác nhận.

## 4. Chức năng Purge Unused Optimize Results

### 4.1. Dòng được giữ lại

Một dòng `mt5_optimize_results` được giữ nếu thỏa ít nhất một điều kiện:

- `picked_watchlist = TRUE`;
- đang có ít nhất một dòng con trong `mt5_backtest_candidates`.

Candidate đang ở Staging luôn được giữ gián tiếp vì Staging bắt buộc tham chiếu Candidate và Candidate tham chiếu Optimize Result.

`is_strategy_best` chỉ là cờ phục vụ hiển thị đại diện, không phải lý do giữ dữ liệu. `picked_bt` là trạng thái thực thi tạm và cũng không phải lý do giữ sau khi session không còn job active.

### 4.2. Dòng được phép xóa

```sql
r.session_id = :session_id
AND r.picked_watchlist = FALSE
AND NOT EXISTS (
  SELECT 1
  FROM mt5_backtest_candidates c
  WHERE c.optimize_result_id = r.id
)
```

Không suy luận bằng `strategy_id_r`, không parse JSON và không quét sang bảng Staging trong điều kiện xóa.

### 4.3. Preview

Trước khi purge, backend trả về:

- tổng Optimize Results của session;
- số dòng sẽ giữ do Watchlist;
- số dòng đang có Candidate;
- số Candidate đang được chọn tại Staging;
- số dòng đủ điều kiện xóa;
- dung lượng ước tính của dữ liệu được xóa;
- trạng thái job đang hoạt động.

Không cộng trực tiếp các nhóm giữ nếu một dòng đồng thời thuộc nhiều nhóm. Phải có thêm `retained_unique_count` bằng điều kiện OR duy nhất.

### 4.4. Xóa theo chunk

Mỗi request chỉ xóa khoảng 5.000 đến 20.000 dòng:

```sql
WITH victims AS (
  SELECT r.id
  FROM mt5_optimize_results r
  WHERE ...điều kiện purge...
  ORDER BY r.id
  LIMIT :chunk_size
  FOR UPDATE SKIP LOCKED
)
DELETE FROM mt5_optimize_results r
USING victims v
WHERE r.id = v.id
RETURNING r.id;
```

Frontend gọi tiếp từng chunk cho đến khi `remaining_count = 0`. Nếu đóng trình duyệt hoặc mất mạng, dữ liệu đã xóa vẫn hợp lệ và user có thể bấm tiếp để hoàn thành.

Mỗi session sử dụng PostgreSQL advisory lock để ngăn hai request purge chạy đồng thời.

### 4.5. Sau mỗi chunk

- tăng `mt5_sessions.result_version` để vô hiệu cache;
- cập nhật `optimize_result_count` và `optimize_strategy_count` từ dữ liệu còn lại;
- tính lại `is_strategy_best` trên chính tập kết quả còn lại; strategy không còn Watchlist hoặc Candidate sẽ không còn kết quả đại diện;
- ghi `mt5_logs` gồm số dòng đã xóa, thời gian và user thực hiện;
- trả về `deleted_count`, `remaining_count`, `retained_count` và phần trăm tiến độ.

## 5. Chức năng xóa Session

### 5.1. Điều kiện được phép xóa

Session được phép xóa khi:

- không còn job `PENDING`, `CLAIMED` hoặc `RUNNING`;
- nếu có Staging thì tất cả dòng Staging phải có `sync_status = 'SYNCED'`;
- các bảng `source_table` đã sync vẫn tồn tại và có strategy tương ứng;
- user nhập đúng tên session trong modal xác nhận.

Session chưa tạo Staging vẫn có thể xóa nếu user muốn bỏ toàn bộ phiên làm việc.

Không yêu cầu tất cả Optimize Results phải được đưa sang Staging. Chỉ các strategy mà user quyết định giữ mới cần Staging và sync.

### 5.2. Preview xóa Session

Modal phải hiển thị ngắn gọn:

- tên session và owner;
- tổng jobs;
- tổng Optimize Results;
- tổng Backtest Candidates;
- tổng Staging;
- số Staging đã sync/chưa sync;
- danh sách bảng `backtest_*` đã nhận dữ liệu;
- dung lượng ước tính sẽ được giải phóng.

Nếu còn Staging chưa sync, nút Delete bị khóa và hiển thị đúng danh sách strategy chưa hoàn thành.

### 5.3. Quy trình xóa

Với session nhỏ:

1. Khóa session và kiểm tra lại điều kiện trong transaction.
2. Lấy danh sách `job_id` để cleanup runtime.
3. `DELETE FROM mt5_sessions WHERE id = $1`.
4. Foreign key cascade xóa queue, results, candidates, staging và logs.
5. Cleanup các runtime directory còn sót theo danh sách job.

Với session rất lớn:

1. Chuyển session sang `ARCHIVED` để không nhận job mới.
2. Yêu cầu chạy Purge Unused trước.
3. Xóa phần Optimize Results còn lại theo chunk; lúc này Candidate và Staging đã sync sẽ cascade theo.
4. Xóa jobs và logs theo chunk nếu số lượng lớn.
5. Xóa dòng `mt5_sessions` cuối cùng.
6. Sweeper dọn runtime directory mồ côi nếu cleanup trực tiếp thất bại.

Quy trình phải idempotent: bị dừng giữa chừng vẫn có thể tiếp tục xóa session đã `ARCHIVED`.

## 6. API dự kiến

```text
GET    /api/mt5/sessions/:id/cleanup-preview
POST   /api/mt5/sessions/:id/purge-unused-results
GET    /api/mt5/sessions/:id/delete-preview
DELETE /api/mt5/sessions/:id
```

`purge-unused-results` nhận `chunk_size`, nhưng backend giới hạn min/max để user không tạo transaction quá lớn.

Response purge:

```json
{
  "deleted_count": 10000,
  "remaining_count": 1240000,
  "retained_count": 1532,
  "completed": false
}
```

## 7. Giao diện

### 7.1. Session Manager

Thêm menu Actions cho từng session:

- Dọn kết quả không sử dụng;
- Xóa session.

Không đặt icon trash trực tiếp ở từng dòng All Optimize Results trong giai đoạn này để tránh user vô tình làm mất toàn bộ Candidate và Staging liên quan.

### 7.2. Modal Purge

- hiển thị preview giữ/xóa;
- giải thích Watchlist, Backtest Candidate và Candidate đang ở Staging vẫn được giữ;
- progress theo từng chunk;
- cho phép Stop sau chunk hiện tại;
- refresh các card và bảng Optimize Results sau khi hoàn thành.

### 7.3. Modal Delete Session

- cảnh báo toàn bộ dữ liệu MT5 trung gian sẽ bị xóa;
- xác nhận dữ liệu trong bảng `backtest_*` không bị ảnh hưởng;
- chặn khi còn job active hoặc Staging chưa sync;
- yêu cầu nhập đúng tên session.

## 8. Dung lượng PostgreSQL

`DELETE` không trả dung lượng về hệ điều hành ngay:

- `VACUUM (ANALYZE)` giúp PostgreSQL tái sử dụng vùng trống cho dữ liệu mới;
- `VACUUM FULL` mới thu nhỏ file vật lý nhưng khóa bảng và chỉ chạy trong cửa sổ bảo trì;
- không gọi `VACUUM FULL` từ request web;
- purge lớn tạo WAL, vì vậy phải đảm bảo ổ đĩa còn khoảng trống trước khi bắt đầu.

Sau purge, backend chỉ ghi log đề xuất bảo trì. DBA/admin quyết định thời điểm chạy `VACUUM (ANALYZE)` hoặc `VACUUM FULL`.

## 9. File dự kiến chỉnh khi thực thi

Backend:

- `src/routes/mt5OptimizationRoute.js`
- `src/controller/mt5OptimizationController.js`
- `src/service/mt5OptimizationService.js`
- `src/dao/mt5ResultDao.js`
- `src/dao/mt5OptimizationDao.js`
- `src/utils/constants.js`
- `src/utils/messages.js`

Frontend:

- khu vực quản lý Optimization Session;
- API client MT5 Optimization;
- modal preview/progress purge;
- modal xác nhận xóa session.

Không cần thay đổi schema cho chức năng purge cơ bản. Nếu cần lưu lịch sử tiến độ qua restart thì mới cân nhắc bổ sung maintenance job riêng; giai đoạn đầu dùng chunk idempotent nên không bắt buộc thêm bảng.

## 10. Kiểm thử bắt buộc

1. User A không purge/xóa được session của user B.
2. Admin xem preview và thao tác được mọi session.
3. Session có job active bị chặn.
4. Purge không xóa Watchlist hoặc Optimize Result đang có Backtest Candidate.
5. Candidate và Staging không thay đổi sau Purge Unused.
6. Purge dừng giữa chừng và chạy tiếp không xóa nhầm hoặc đếm trùng.
7. Session có Staging chưa sync bị chặn xóa.
8. Xóa session đã sync không xóa bảng `backtest_*` và `strategy_metadata`.
9. Cascade xóa đúng jobs, results, candidates, staging và logs.
10. Runtime folder còn sót được cleanup trực tiếp hoặc bởi sweeper.
11. Cache/card/counter cập nhật đúng sau mỗi chunk.
12. Purge session hàng chục triệu dòng không gây HTTP 524 hoặc transaction giữ khóa quá lâu.

## 11. Thứ tự thực hiện

1. Viết DAO preview và truy vấn xác định chính xác tập retained/purgeable.
2. Viết API purge một chunk và advisory lock theo session.
3. Nối modal Purge, progress và Stop.
4. Viết delete preview và các điều kiện bảo vệ.
5. Viết quy trình archive, chunk cleanup và hard-delete session.
6. Nối modal Delete Session.
7. Kiểm thử phân quyền, cascade, runtime cleanup và dung lượng.
8. Cập nhật tài liệu tester và hướng dẫn VACUUM cho admin.

## 12. Kết luận

Triển khai Purge Unused trước để giảm mạnh dung lượng mà không làm mất dữ liệu đang dùng. Delete Session chỉ là bước cuối khi phiên làm việc đã hoàn thành hoặc user chủ động bỏ session. Với session rất lớn, luôn purge theo chunk trước khi hard-delete để tránh khóa dài, WAL tăng đột biến và lỗi timeout.
