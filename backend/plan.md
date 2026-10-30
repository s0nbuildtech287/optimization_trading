# Kế hoạch tối ưu All Optimize Results

## 1. Mục tiêu

- Hiển thị trang dữ liệu đầu tiên nhanh khi một session có từ 10 đến 20 triệu bộ tham số.
- Không quét, sort hoặc đưa toàn bộ kết quả vào Node.js chỉ để trả một trang nhỏ.
- Group by Strategy, All Passed, filter, Top N và Cluster Radius phải hoạt động ổn định.
- Không làm thay đổi luồng Pick Backtest, Every Tick, All Backtest Candidates và Backtest Staging.
- Một truy vấn lỗi không được phép làm đầy ổ đĩa PostgreSQL hoặc gây lỗi 524 cho toàn hệ thống.

## 2. Hiện trạng và nguyên nhân

`mt5_optimize_results` hiện lưu các metric trong `summary_op` JSONB. Khi hiển thị dữ liệu, SQL phải đọc chuỗi trong JSON, chạy `regexp_replace`, ép kiểu numeric rồi mới sort hoặc filter.

Các điểm nghẽn hiện tại:

- Group by Strategy dùng `DISTINCT ON` và sort theo Result trên toàn bộ dữ liệu của session.
- All Passed dùng `ROW_NUMBER()` và `COUNT() OVER`, sau đó mới áp dụng `LIMIT`.
- Top N tiếp tục phụ thuộc vào window function trên toàn bộ tập kết quả phù hợp.
- Cluster Radius lấy toàn bộ rows phù hợp về Node.js rồi mới gom cụm.
- Summary cards phải count và parse metric trên hàng triệu rows mỗi lần gọi.
- Phân trang chỉ giảm dữ liệu trả về trình duyệt, chưa giảm lượng dữ liệu PostgreSQL phải xử lý.
- Các phép sort/hash lớn có thể tràn khỏi `work_mem` và tạo file trong `base/pgsql_tmp`.

## 3. Thiết kế dữ liệu đích

Giữ `summary_op` làm dữ liệu gốc đầy đủ, đồng thời bổ sung các cột typed phục vụ truy vấn:

```sql
result_value          NUMERIC
profit                NUMERIC
expected_payoff       NUMERIC
trades                 INTEGER
profit_factor          NUMERIC
recovery_factor        NUMERIC
equity_dd_percent      NUMERIC
sharpe_ratio           NUMERIC
pd_ratio               NUMERIC
is_strategy_best       BOOLEAN NOT NULL DEFAULT FALSE
```

Nguyên tắc:

- Dữ liệu gốc vẫn nằm trong `summary_op`, không mất metric hoặc input hiện có.
- Các cột typed được chuẩn hóa một lần khi ingest, không parse JSON lại khi user mở bảng.
- Mỗi cặp `session_id + strategy_id` chỉ có một row `is_strategy_best = TRUE`.
- Việc đổi best row phải chạy trong transaction: hạ row cũ về FALSE rồi nâng row mới lên TRUE.
- `picked_watchlist`, `picked_bt`, `backtest_run_count` và các khóa liên kết hiện tại được giữ nguyên.

## 4. Index cần thiết

```sql
CREATE INDEX CONCURRENTLY idx_mt5_results_session_strategy_score
ON mt5_optimize_results(session_id, strategy_id, result_value DESC, id DESC);

CREATE INDEX CONCURRENTLY idx_mt5_results_session_score
ON mt5_optimize_results(session_id, result_value DESC, id DESC);

CREATE INDEX CONCURRENTLY idx_mt5_results_session_best
ON mt5_optimize_results(session_id, strategy_id, id)
WHERE is_strategy_best = TRUE;

CREATE UNIQUE INDEX CONCURRENTLY uq_mt5_results_one_best_per_strategy
ON mt5_optimize_results(session_id, strategy_id)
WHERE is_strategy_best = TRUE;

CREATE INDEX CONCURRENTLY idx_mt5_results_session_watchlist
ON mt5_optimize_results(session_id, strategy_id, result_value DESC, id DESC)
WHERE picked_watchlist = TRUE;

CREATE INDEX CONCURRENTLY idx_mt5_results_session_backtest_pick
ON mt5_optimize_results(session_id, strategy_id, result_value DESC, id DESC)
WHERE picked_bt = TRUE;
```

Chỉ bổ sung thêm index metric riêng sau khi đo bằng `EXPLAIN (ANALYZE, BUFFERS)`. Không tạo index cho mọi tổ hợp filter vì sẽ làm insert chậm và tăng dung lượng DB quá mức.

## 5. Tối ưu luồng ingest

Khi worker upload Optimize Results:

1. Parse và chuẩn hóa metric tại service.
2. Insert đồng thời `summary_op` và các cột typed.
3. Sau khi ingest xong một strategy, chọn row có `result_value` tốt nhất.
4. Cập nhật `is_strategy_best` trong cùng transaction.
5. Vô hiệu cache summary của đúng session vừa thay đổi.
6. Không tính ranking hoặc summary cho các session khác.

Callback trùng `run_id` vẫn phải idempotent, không insert trùng và không làm sai best row.

## 6. Tối ưu API bảng

### Group by Strategy

- Khi không có filter metric, chỉ query `WHERE session_id = ? AND is_strategy_best = TRUE`.
- Sort theo strategy và phân trang trực tiếp trên tập best rows nhỏ.
- Khi có filter, không thay đổi `is_strategy_best` trong DB. API dùng danh sách strategy nhỏ từ best rows, sau đó dùng `LATERAL` và index để lấy row có Result cao nhất trong tập đạt filter của từng strategy.
- Nếu best toàn kỳ không đạt filter nhưng candidate khác đạt, candidate đó là đại diện tạm thời trên giao diện.
- Nếu strategy không có candidate nào đạt filter, strategy đó không xuất hiện.
- Không dùng `DISTINCT ON` trên toàn bộ bảng.
- Tổng pass của các strategy đang hiển thị được count theo danh sách strategy của trang hiện tại và index `session_id + strategy_id`.

### All Passed

- Không dùng `ROW_NUMBER()` cho chế độ xem thông thường.
- Query theo index và trả đúng `LIMIT` của trang.
- Chuyển từ `OFFSET` sang keyset/cursor gồm `strategy_id`, `result_value`, `id` cho trang sâu.
- API vẫn có thể trả `page` tương thích trong giai đoạn chuyển đổi, frontend dùng cursor nội bộ.

### Summary cards

- Giữ endpoint summary tách riêng khỏi endpoint rows.
- Bảng rows phải hiện trước; card nào xong thì cập nhật card đó.
- Cache summary theo `session_id` và cấu hình filter.
- Invalidate cache khi session ingest thêm results, pick watchlist hoặc pick backtest thay đổi.
- Các tổng cố định như tổng results có thể duy trì counter transaction trong `mt5_sessions`; metric theo filter vẫn tính từ cột typed.

### Top N

- Không window toàn bộ session mỗi lần mở trang.
- Dùng index lấy N row đầu cho từng strategy được yêu cầu.
- Chỉ xử lý các strategy thuộc trang hiện tại hoặc tập strategy đã được lọc.
- Benchmark riêng trường hợp hàng nghìn strategy trước khi bật mặc định.

### Cluster Radius

- Xóa cách tải toàn bộ rows vào Node.js.
- Chuyển clustering thành background task có progress.
- Cache kết quả theo `session_id + filter_hash + radius + top_n`.
- Khi session có dữ liệu mới, chỉ vô hiệu cache clustering của session đó.
- API bảng đọc danh sách ID đã cluster và phân trang, không tính lại mỗi lần chuyển trang.

### Hiển thị trong khi session vẫn đang chạy

- Results được công khai theo từng job/strategy sau khi toàn bộ chunk của job đã insert và transaction commit thành công.
- Strategy đã hoàn thành phải xuất hiện trong Group by Strategy mà không cần chờ tất cả job của session hoàn thành.
- Strategy đang ingest chưa xuất hiện để tránh hiển thị dữ liệu dở dang.
- Job PENDING/RUNNING chỉ hiển thị tiến độ ở Jobs Queue, chưa được tính là Optimize Result hoàn chỉnh.
- Sau mỗi job commit thành công, tăng `session_version` và cập nhật bộ đếm job/results nhẹ.
- Frontend polling endpoint trạng thái nhẹ, không polling lại bảng hàng triệu rows.
- Khi `session_version` tăng, giao diện hiện `Có kết quả mới` và nút Refresh.
- Không tự chèn hoặc đảo row trong lúc user đang chọn/filter để tránh nhảy thứ tự và sai phân trang.
- Mỗi lần tải bảng chốt `session_version` và `snapshot_max_result_id`; các trang tiếp theo đọc cùng snapshot.
- Khi user Refresh, frontend nhận snapshot mới, strategy mới và best row mới.

## 7. Giới hạn bảo vệ PostgreSQL

- Đặt `statement_timeout` riêng cho các API đọc MT5.
- Đặt `temp_file_limit` hợp lý cho role/backend connection, không để `-1` vô hạn.
- Bật `log_temp_files` để phát hiện truy vấn tạo file tạm lớn.
- Theo dõi dung lượng volume DB và cảnh báo tại 70%, 80%, 90%.
- Không tăng `work_mem` toàn server để che truy vấn xấu; chỉ cân nhắc `SET LOCAL` cho truy vấn đã được kiểm soát.
- Khi request frontend bị hủy hoặc bị thay thế bởi filter mới, backend phải hủy query tương ứng nếu còn chạy.

## 8. Kế hoạch migration dữ liệu hiện có

### Giai đoạn 1: Chuẩn bị

- Ghi nhận dung lượng bảng, index, số rows theo session và thời gian query hiện tại.
- Backup database hoặc snapshot volume trước migration production.
- Thêm các cột mới ở trạng thái nullable, chưa ép `NOT NULL` trừ `is_strategy_best` có default an toàn.
- Deploy code dual-write: kết quả mới ghi cả JSON và cột typed.

### Giai đoạn 2: Backfill

- Backfill theo dải `id` nhỏ, commit từng batch.
- Mỗi batch chỉ parse các row chưa có `result_value`.
- Có checkpoint để dừng và chạy tiếp, không chạy lại từ đầu.
- Theo dõi WAL, replication lag, CPU, I/O và dung lượng ổ trong lúc backfill.
- Không chạy `VACUUM FULL` trong giờ hệ thống hoạt động.

### Giai đoạn 3: Xác định best row

- Xử lý lần lượt theo `session_id + strategy_id`.
- Chọn row tốt nhất theo `result_value DESC, id DESC`.
- Chỉ sau khi không còn duplicate best mới tạo unique partial index.

### Giai đoạn 4: Tạo index

- Dùng `CREATE INDEX CONCURRENTLY` trên production.
- Chạy từng index một và kiểm tra dung lượng trước khi tạo index tiếp theo.
- Lưu ý `CREATE INDEX CONCURRENTLY` không chạy bên trong transaction block.

### Giai đoạn 5: Chuyển read path

- Chuyển Group by Strategy sang `is_strategy_best` trước.
- Chuyển All Passed sang typed columns và keyset pagination.
- Chuyển filter metric sang typed columns.
- Cuối cùng mới thay Top N và Cluster Radius.
- Giữ khả năng rollback về read JSON trong một phiên bản deploy.

## 9. Tương thích luồng downstream

- Pick Backtest vẫn cập nhật đúng `mt5_optimize_results.id`.
- `mt5_backtest_candidates.optimize_result_id` không thay đổi.
- Every Tick vẫn lấy input và template INI từ `summary_op`.
- Backtest Staging vẫn tham chiếu candidate như hiện tại.
- Không xóa hoặc đổi khóa của optimize result trong migration.
- Không thay đổi format response hiện tại trước khi frontend hỗ trợ cursor.

## 9.1. Phân quyền bắt buộc

- JWT chỉ cung cấp user ID; backend phải đọc role hiện tại từ bảng `users/roles` ở mỗi request và tạo `actor` tin cậy.
- User thường chỉ được liệt kê session có `mt5_sessions.user_id = actor.userId`.
- Mọi API job, optimize results, summary, candidates, staging và logs phải xác thực session trước khi query.
- Các query dữ liệu con phải join về `mt5_sessions` và áp dụng owner scope cho user thường.
- Không lưu lặp `user_id` trong results/candidates/staging; quyền sở hữu luôn suy ra từ `session_id` để hỗ trợ chuyển chủ session tại một nơi.
- Admin được bỏ owner scope và có quyền xem/quản trị toàn bộ session, job, results, candidates, staging, workers và logs.
- Cache phải có khóa gồm actor scope và session ID; tuyệt đối không dùng chung cache user thường với admin hoặc user khác.
- Public worker chỉ được thực thi job đã claim. Job và kết quả vẫn thuộc user sở hữu session.
- API key của worker không cấp quyền đọc session trên giao diện.
- Endpoint tải input, upload, status và tải artifact phải kiểm tra API key sở hữu đúng worker đã claim job đó.
- Không được dựa vào `session_id`, `result_id`, `candidate_id` hoặc `job_id` do client gửi mà bỏ qua owner check.

## 10. Tiêu chí kiểm thử

- Group by Strategy trả trang đầu dưới 1 giây khi session có 10 triệu results trong điều kiện DB bình thường.
- All Passed trả trang đầu dưới 1 giây và trang sâu không suy giảm tuyến tính theo page number.
- Strategy hoàn thành xuất hiện sau lần Refresh tiếp theo dù toàn session vẫn còn job PENDING/RUNNING.
- Dữ liệu chưa commit của strategy đang ingest không xuất hiện trong Results.
- Phân trang trên cùng snapshot không trùng, thiếu hoặc đổi row khi job mới hoàn thành.
- Summary cards không chặn bảng và không tạo temp file lớn.
- Không có query đưa toàn bộ result rows về Node.js.
- Top N và Cluster Radius cho kết quả tương đương logic hiện tại trên bộ dữ liệu đối chứng.
- Pick Watchlist, Pick Backtest, chạy Every Tick, Candidates và Staging hoạt động như trước.
- User A không thể list, đọc, sửa, tải artifact hoặc thao tác job/result/candidate thuộc session của user B.
- Admin xem được đầy đủ session và dữ liệu con của mọi user.
- Public worker chạy được job user khác khi được cho phép nhưng không có quyền xem session hoặc dữ liệu ngoài job đã claim.
- Ingest đồng thời không tạo hai best rows cho cùng `session + strategy`.
- Request bị hủy không để query chạy ngầm kéo dài.
- PostgreSQL không phát sinh lỗi 524 hoặc `No space left on device` trong load test.

## 11. Thứ tự thực hiện đề xuất

1. Deploy bản sửa truy vấn danh sách session và runtime cleanup đã hoàn thành.
2. Thêm typed columns và code dual-write.
3. Backfill dữ liệu theo batch.
4. Tạo index concurrently.
5. Chuyển Group by Strategy sang best row.
6. Chuyển All Passed sang keyset pagination.
7. Tách và cache Summary cards.
8. Viết lại Top N.
9. Chuyển Cluster Radius sang background task.
10. Load test 10 đến 20 triệu rows trước khi deploy production.

## 12. Phạm vi không thực hiện trong đợt tối ưu này

- Không thay đổi nghiệp vụ chọn candidate hoặc staging.
- Không xóa `summary_op`.
- Không thay đổi schema backtest table.
- Không tăng tài nguyên server để thay thế việc sửa query.
- Không chạy migration nặng trực tiếp trên production khi chưa đo trên database test.
