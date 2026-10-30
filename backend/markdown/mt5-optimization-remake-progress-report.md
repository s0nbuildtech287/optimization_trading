# Báo cáo tiến độ xây dựng lại MT5 Optimization

Ngày báo cáo: 28/09/2026

## 1. Tóm tắt điều hành

Module MT5 Optimization cũ đã được gỡ bỏ và xây dựng lại theo mô hình Session. Mục tiêu chính của lần làm lại là đơn giản hóa database, tách rõ trách nhiệm giữa hàng đợi job và dữ liệu kết quả, giảm phụ thuộc vào artifact vật lý, đồng thời giữ được luồng xử lý dài hạn khi worker chạy phân tán.

Tiến độ hiện tại:

- Luồng nghiệp vụ lõi từ tạo Session, chạy Open Price, chọn candidate, chạy Every Tick, chọn Staging và sync sang bảng backtest đã hoạt động xuyên suốt.
- Tám bảng database mới, khóa ngoại, constraint, index, trigger và startup initialization đã hoàn thành.
- Giao diện mới cho Setup Workers, INI Config, Jobs Queue Process, All Optimize Results, All Backtest Candidates, Backtest Staging và TPL Generator đã được dựng và kết nối API thật.
- Cơ chế worker claim job, heartbeat, lease, retry, recovery, public worker và phân quyền owner đã được xây lại.
- Phần còn lại chủ yếu là kiểm thử tải lớn, tối ưu Date Range trên tập dữ liệu rất lớn, batch sync phía backend và kiểm thử triển khai production.

Đánh giá tổng thể: khoảng 80% cho toàn module; phần nghiệp vụ lõi đã hoàn thành, phần production hardening và kiểm thử tải lớn chưa chốt hoàn toàn.

## 2. Lý do đập đi xây lại

Thiết kế cũ sử dụng khoảng 10 bảng MT5 riêng biệt, gồm queue, job logs, optimize configs, OTM requests, candidate selections, backtest results và auto backtest runs. Nhiều bảng liên kết chặt với job ID, có dữ liệu giao nhau và khiến luồng rerun, Every Tick, staging, cleanup khó theo dõi.

Thiết kế mới áp dụng các nguyên tắc:

- Job ID chỉ đại diện cho một lần thực thi trong hàng đợi.
- Kết quả nghiệp vụ không phụ thuộc vòng đời của job queue.
- Open Price, Every Tick candidate và Staging được tách thành ba tầng dữ liệu rõ ràng.
- Session là phạm vi làm việc và phân quyền chính.
- Không còn campaign/batch bắt buộc trong luồng chính.
- Watchlist và lựa chọn chạy Every Tick là cờ trên Open Price result; Every Tick candidate và Staging có bảng riêng.
- Không giữ lại core gate, fallback và OTM pipeline phức tạp của phiên bản cũ.

## 3. Schema database mới

Thiết kế mới gồm đúng 8 bảng.

### 3.1. `mt5_sessions`

Đại diện cho một phiên làm việc MT5 Optimization của user.

- Quan hệ: một user có nhiều session.
- ID ngắn dạng `session-1`, `session-2`.
- Trạng thái: `ACTIVE`, `ARCHIVED`.
- Session sở hữu toàn bộ queue và result phát sinh bên trong nó.
- `user_id` chỉ lưu tại session; queue/result/candidate/staging suy ra owner qua `session_id`, nên chuyển owner chỉ cần cập nhật một dòng session.

### 3.2. `api_keys`

Lưu API key plaintext theo yêu cầu của hệ thống nội bộ.

- Một user có thể có nhiều key.
- Có scope để mở rộng ngoài MT5 worker trong tương lai.
- Có trạng thái `ACTIVE`, `REVOKED`, thời gian hết hạn và lần sử dụng gần nhất.
- User có thể xem và copy lại key trên giao diện.

### 3.3. `mt5_workers`

Đại diện cho MT5 App Worker đã xác thực bằng API key.

- Worker thuộc user tạo API key.
- Lưu owner ID và owner username.
- Có trạng thái `OFFLINE`, `ONLINE`, `BUSY`, `DRAINING`, `BLOCKED`.
- `run_access` quyết định worker có được claim job hay chưa.
- `is_public` cho phép worker nhận job của user khác nhưng không làm thay đổi owner của job/session/result.
- `allowed_job_types` giới hạn worker nhận `OPEN_PRICE`, `EVERY_TICK` hoặc cả hai.
- Một worker không được claim đồng thời nhiều job.

### 3.4. `mt5_job_queue`

Chỉ giữ trách nhiệm hàng đợi và trạng thái thực thi.

- Job ID ngắn dạng `job-1`, `job-2`.
- Hai loại job: `OPEN_PRICE`, `EVERY_TICK`.
- Trạng thái: `PENDING`, `CLAIMED`, `RUNNING`, `DONE`, `FAILED`, `CANCELLED`.
- Lưu INI content, payload, priority, progress, worker đang claim, run ID, heartbeat, lease và lỗi.
- Every Tick bắt buộc tham chiếu `target_strategy_id_r`.
- Job có thể retry/delete độc lập mà không xóa result đã lưu.
- `run_id` được dùng để chống callback cũ hoặc callback trùng.
- Owner của queue/result/candidate/staging được suy ra qua session, không sao chép `user_id` sang từng bảng.

### 3.5. `mt5_optimize_results`

Đây là bảng kết quả Open Price. Mỗi row là một bộ tham số tối ưu hóa.

- `strategy_id`: mã strategy gốc, ví dụ `065DE30H1OB`.
- `strategy_id_r`: khóa nghiệp vụ duy nhất được sinh từ strategy và result ID.
- `summary_op`: JSONB bắt buộc, gồm `pass`, `inputs`, `metrics` của Open Price.
- `picked_watchlist`: user đánh dấu để theo dõi.
- `picked_bt`: user chọn để chạy Every Tick.
- `backtest_run_count`: đếm số lần bộ tham số đã hoàn thành Every Tick.

Các ràng buộc quan trọng:

- Open Price phải có đủ `pass`, `inputs`, `metrics`.
- Every Tick không ghi đè `summary_op`; kết quả được chèn sang `mt5_backtest_candidates`.

Điểm quan trọng về dữ liệu hiển thị:

- All Optimize Results luôn đọc metrics từ `summary_op`.
- All Backtest Candidates đọc từ `mt5_backtest_candidates`; Backtest Staging đọc từ `mt5_backtest_staging` và candidate được tham chiếu.
- Hai bộ số liệu không ghi đè nhau, giúp user so sánh Open Price với Every Tick.

### 3.6. `mt5_backtest_candidates`

Lưu mỗi lần Every Tick hoàn thành dưới dạng một candidate độc lập.

- Tham chiếu Open Price result bằng `optimize_result_id` và `strategy_id_r`.
- `summary_bt` chứa Settings và Results; `deals` chứa danh sách deals.
- Các chỉ số lọc thường dùng được chuẩn hóa thành cột typed và có index.
- `backtest_run_no` lưu thứ tự chạy lại của cùng bộ tham số.
- `source_run_id` lưu run ID nguồn và chống callback Every Tick trùng.
- Balance Drawdown dùng Balance Drawdown Maximal; P/D được tính từ Net Profit chia Balance Drawdown amount.

### 3.7. `mt5_backtest_staging`

Lưu lựa chọn cuối cùng trước khi sync sang bảng backtest.

- Mỗi `(session_id, strategy_id)` chỉ có một candidate hiện hành.
- Chọn candidate khác của cùng strategy sẽ cập nhật row hiện tại, không nhân bản staging.
- Lưu target/source table, trạng thái sync và thời gian sync.
- Chỉ tham chiếu candidate đã Every Tick thành công.

### 3.8. `mt5_logs`

Lưu structured application log của module MT5.

- Có thể liên kết theo session, job và worker.
- Mức log: `INFO`, `WARN`, `ERROR`.
- Context mở rộng bằng JSONB.
- Không lưu heartbeat hoặc raw stdout thành hàng loạt row gây phình bảng.

## 4. Quan hệ dữ liệu chính

```text
users
  ├── 1-N mt5_sessions
  ├── 1-N api_keys
  └── 1-N mt5_workers

mt5_sessions
  ├── 1-N mt5_job_queue
  ├── 1-N mt5_optimize_results
  ├── 1-N mt5_backtest_candidates
  ├── 1-N mt5_backtest_staging
  └── 1-N mt5_logs

mt5_optimize_results
  └── 1-N mt5_backtest_candidates

mt5_backtest_candidates
  └── 0-1 mt5_backtest_staging (lựa chọn hiện hành)

api_keys
  └── 1-N mt5_workers

mt5_workers
  ├── 1-N mt5_job_queue (job đã claim)
  └── 1-N mt5_logs
```

Queue không phải cha của result. Result thuộc trực tiếp session và user, vì vậy xóa job history không làm mất kết quả tối ưu hóa.

## 5. Luồng nghiệp vụ mới đã triển khai

### 5.1. Khởi tạo

1. User tạo API key.
2. Điền API key vào MT5 App Worker.
3. Worker verify key và đăng ký/heartbeat với backend.
4. Worker chỉ được claim job sau khi user/admin bật Allow.
5. Worker có thể để Private hoặc Public.

### 5.2. Open Price

1. User tạo hoặc chọn Optimization Session.
2. Tạo ZIP INI tại INI Config.
3. Upload và dispatch nhiều strategy vào Jobs Queue Process.
4. Worker claim job atomically và chạy Open Price.
5. Kết quả được upload theo chunk để tránh gom toàn bộ file lớn vào RAM.
6. Backend chỉ loại pass có toàn bộ output metric bằng 0; các pass còn lại được lưu vào `mt5_optimize_results`.
7. Job hoàn thành không làm result phụ thuộc artifact vật lý.

### 5.3. Chọn candidate và chạy Every Tick

1. All Optimize Results hiển thị toàn bộ Open Price results theo session.
2. User có thể xem dạng flat hoặc group by strategy.
3. Hỗ trợ filter, Top N, cluster và watchlist.
4. Khi user bấm icon Pick, hệ thống chọn bộ tham số và tạo ngay một Every Tick job tham chiếu đúng `strategy_id_r`; không còn bước mở My Backtest Candidates rồi bấm Start Backtest.
5. Every Tick hoàn thành sẽ chèn một row vào `mt5_backtest_candidates` và tăng `backtest_run_count` trên Open Price result cha.
6. `picked_bt` tự trở về false sau khi ingest Every Tick thành công.

### 5.4. Backtest Candidate và Staging

1. All Backtest Candidates chỉ đọc các row Every Tick trong `mt5_backtest_candidates`.
2. User có thể filter theo Profit, PF, Recovery, Trades, Balance DD, P/D, Sharpe, Largest Loss và Date Range.
3. Bảng có mini balance chart lazy-load; bảng hiện trước, chart nào tải xong trước hiện trước.
4. Modal chi tiết hiển thị balance chart, Settings và Results.
5. Metrics Every Tick có phần trăm chênh lệch so với Open Price để hỗ trợ so sánh.
6. User chọn một candidate sang Backtest Staging.
7. Chọn result khác của cùng strategy sẽ thay thế staging selection cũ.
8. Tại Backtest Staging, user chọn hoặc tạo bảng backtest rồi sync dữ liệu.

## 6. Giao diện mới

### 6.1. Điều hướng chính

MT5 Optimization được tổ chức giống Dashboard với bốn submenu:

- Setup Workers
- INI Config
- Optimize
- TPL Generator

Trong Optimize có bốn tab ngang:

- Jobs Queue Process
- All Optimize Results
- All Backtest Candidates
- Backtest Staging

### 6.2. Setup Workers

- Quản lý API key qua menu profile.
- Danh sách Worker Nodes và trạng thái realtime.
- Allow/Block worker, Drain, Delete.
- Bật/tắt Public/Private.
- Chọn loại job worker được nhận.
- Allow All Workers theo user.
- Hiển thị activity, current job, jobs claimed và last seen.

### 6.3. INI Config

- Giữ lại luồng tạo INI/ZIP đã sử dụng ổn định trước khi remake.
- Hỗ trợ upload bot folder, cấu hình tham số và xuất bundle để dispatch.
- Đã được nối với màn Jobs Queue Process.

### 6.4. Jobs Queue Process

- Tạo và theo dõi Open Price/Every Tick jobs.
- Hiển thị trạng thái, worker, progress, attempt, activity và lỗi.
- Hỗ trợ cancel, retry và delete.
- Job được phục hồi đúng trạng thái khi backend restart và lease hết hạn.

### 6.5. All Optimize Results

- Server-side pagination, filter và thống kê theo session.
- Hai chế độ All Passed và Group By Strategy.
- Expand strategy để lazy-load candidate của strategy đó.
- My OTM Watchlist và My Backtest Candidates.
- Top N và cluster chỉ áp dụng cho danh sách optimization, không tác động watchlist/candidate đã pick.
- Có số lần Every Tick đã chạy cho từng bộ tham số.
- Toàn bộ metrics trên bảng luôn lấy từ Open Price `summary_op`.

### 6.6. All Backtest Candidates

- Chỉ chứa các bộ tham số đã hoàn thành Every Tick.
- Hiển thị metrics typed và `summary_bt` từ `mt5_backtest_candidates`.
- Có Full Period, Custom Range và Auto Common Range.
- Mini balance chart lazy-load theo từng row.
- Modal chi tiết có chart, Settings và Results.
- Hiển thị tỷ lệ tăng/giảm của Profit, PF, Recovery, Sharpe, DD và Trades so với Open Price.
- Icon pick sang Staging được tách màu và biểu tượng khỏi icon pick candidate ở All Optimize Results.

### 6.7. Backtest Staging

- `mt5_backtest_staging` chỉ giữ một candidate được chọn trên mỗi strategy trong session.
- Hỗ trợ chọn target backtest table hoặc tạo bảng mới.
- Kiểm tra conflict và cho phép overwrite/skip.
- Sync deals, Settings và Results sang schema backtest hiện tại.
- Cập nhật `source_table`, `sync_status`, `synced_at` trên row staging sau khi sync thành công.

### 6.8. TPL Generator

- Giữ lại chức năng tạo TPL hiện có.
- Hỗ trợ Excel/EA folder, CSV mapping, preview và xuất file.
- Chưa thay đổi sâu trong đợt remake database này.

## 7. Độ bền và an toàn vận hành đã hoàn thành

- Claim job atomic, tránh hai worker lấy cùng một job.
- Một worker chỉ chạy một active job tại một thời điểm.
- `run_id` chống callback cũ và callback trùng.
- Heartbeat và lease phát hiện worker/job bị mất kết nối.
- Recovery đưa job về `PENDING`, `DONE` hoặc `FAILED` tùy trạng thái ingest và số lần thử.
- Callback Every Tick/Open Price kiểm tra đúng worker và run ID.
- Public worker không làm đổi owner dữ liệu.
- Open Price ingest theo chunk, transaction và idempotency.
- Every Tick callback trùng cùng run ID không tạo candidate trùng và không làm tăng sai `backtest_run_count`.
- Runtime artifact backend được cleanup sau khi job kết thúc.
- Schema được tự kiểm tra/tạo khi backend startup.
- Migration cho database cũ đã có phần gỡ schema legacy và tạo schema Session mới.

## 8. Kiểm thử đã thực hiện

- Đã chạy thực tế Open Price và lưu hàng nghìn parameter sets vào database.
- Đã chạy kiểm thử tích hợp Every Tick, xác nhận Settings, Results và Deals được chèn đúng candidate.
- Đã kiểm tra Open Price metrics không bị ghi đè sau Every Tick.
- Đã kiểm tra chọn watchlist, backtest candidate, staging và sync sang bảng backtest.
- Đã kiểm tra lazy chart, modal chi tiết và Date Range trên dữ liệu local.
- Đã kiểm tra worker Allow/Public, claim, heartbeat, retry và recovery.
- Có script `scripts/verifyMt5Optimization.js` kiểm tra luồng Open Price → full-zero filter → candidate → Every Tick và tự dọn dữ liệu test.
- Frontend production build và kiểm tra cú pháp backend đang pass.

## 9. Phần chưa chốt và rủi ro còn lại

### 9.1. Hiệu năng Date Range

Date Range hiện phải đọc Deals để tính lại metrics. Với hàng chục nghìn Every Tick results và Deals lớn, đây là điểm cần đo tải và tối ưu SQL/aggregation thêm. Mini chart đã lazy-load nên không chặn bảng, nhưng filter Date Range toàn session vẫn cần kiểm thử tải lớn.

### 9.2. Modal chi tiết

Modal chỉ tải khi user bấm icon mắt nên không gây tải đồng loạt. Tuy nhiên một candidate có số Deals cực lớn vẫn có thể tạo payload lớn; cần đặt giới hạn/downsample chart chi tiết sau khi có số liệu tải thực tế.

### 9.3. Batch sync Staging

Frontend hiện sync lần lượt từng strategy. Luồng đúng về dữ liệu nhưng với batch rất lớn có thể lâu hoặc gặp timeout. Nên chuyển thành background batch endpoint trước khi production sử dụng batch lớn.

### 9.4. Load test và observability

Chưa có kết quả benchmark chính thức cho hàng chục nghìn job, nhiều worker và nhiều user đồng thời. Cần đo:

- Tốc độ claim/heartbeat.
- Pool connection PostgreSQL.
- RAM Node khi ingest result lớn.
- Dung lượng `summary_op`, candidate `summary_bt`, `deals` và mức tăng database.
- Thời gian query pagination, grouped results và Date Range.

### 9.5. Migration production

Migration hiện là destructive đối với schema MT5 legacy. Trước khi chạy production cần xác nhận không cần giữ dữ liệu MT5 cũ hoặc phải export dữ liệu cần thiết, sau đó rehearsal trên bản sao database.

## 10. Kế hoạch hoàn thiện đề xuất

### Ưu tiên P0

1. Chạy end-to-end với worker deploy thật: Open Price → Every Tick → Staging → Sync.
2. Load test nhiều worker và ít nhất vài nghìn job liên tục.
3. Đo và tối ưu Date Range trên số lượng Every Tick result lớn.
4. Rehearsal migration trên bản sao production.
5. Kiểm tra cleanup backend, worker workspace và MT5 terminal sau job dài.

### Ưu tiên P1

1. Chuyển staging sync lớn sang background batch job.
2. Bổ sung dashboard vận hành cho queue latency, failed jobs, stale leases và DB size.
3. Đặt giới hạn payload/downsample cho modal chart khi Deals quá lớn.
4. Hoàn thiện retention policy cho queue/log/result theo quyết định nghiệp vụ.

## 11. Kết luận

Lần remake đã giải quyết phần lớn vấn đề kiến trúc của module cũ: database gọn hơn, quan hệ rõ hơn, job queue không còn chi phối dữ liệu nghiệp vụ; Open Price, Every Tick candidate và Staging được tách riêng nhưng vẫn liên kết để so sánh. Giao diện mới đã bám đúng luồng Session và các API lõi đã chạy xuyên suốt.

Module hiện đủ để tiếp tục kiểm thử nghiệp vụ và tải thực tế. Trước khi chốt production quy mô lớn, cần tập trung vào load test, Date Range, batch sync và migration rehearsal thay vì mở rộng thêm tính năng mới.
