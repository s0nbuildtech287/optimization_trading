# Lưu trữ thiết kế MT5 Optimization trước khi xây lại

Ngày chốt: 16/09/2026

Trạng thái: tài liệu tham chiếu cho phiên bản cũ trước khi xóa module và thiết kế lại database. Nội dung được tổng hợp từ source backend, frontend và schema thực tế của database `pre_backtest` đang khai báo trong `.env`.

## 1. Phạm vi module cũ

Module MT5 Optimization cũ bao gồm:

- Upload bundle cấu hình và tách thành các job strategy.
- Queue Open Price, Every Tick và Full Pipeline.
- Worker API key, worker heartbeat, phân loại worker và public worker.
- Upload kết quả theo file hoặc theo chunk.
- Lưu toàn bộ kết quả optimize, kết quả backtest và artifact.
- OTM filter, Top N, gom cụm, refilter và cache kết quả OTM.
- Chọn candidate thủ công và lưu candidate được chọn.
- Rerun Open Price và requeue/recover job.
- Auto Every Tick theo batch, so sánh Open Price với Every Tick và sync vào backtest table.
- Tải INI, xuất XLSX, tạo TPL và upload EA folder.
- Theo dõi tiến độ, logs, notification, cleanup artifact và recovery sau restart/redeploy.

Module kiểm tra file optimization tại trang Get Strategy ID là chức năng kiểm tra file độc lập, không thuộc queue MT5 bị xóa.

Volume Optimization (`lot_threshold_*`) là module độc lập, không thuộc MT5 Optimization bị xóa.

## 2. Kiến trúc backend cũ

### 2.1. Điểm khởi động

`index.js` thực hiện các việc sau:

- Mount worker routes tại `/`.
- Mount admin routes tại `/api/mt5-optimization`.
- Mount công cụ TPL/EA tại `/api/mt5`.
- Mount OTM candidate selection tại `/api`.
- Tự tạo các bảng MT5 bằng `initMt5OptimizationTables()`.
- Tự tạo bảng candidate selection.
- Khôi phục OTM request còn dở sau restart.
- Khôi phục Auto Every Tick batch còn `PENDING` hoặc `RUNNING`.

### 2.2. Các lớp chính

- `src/dao/mt5OptimizationDao.js`: tạo schema MT5, indexes và sequence.
- `src/dao/otmCandidateSelectionDao.js`: CRUD candidate được user chọn.
- `src/service/mt5QueueService.js`: service trung tâm, quản lý queue, worker, artifact, Open Price, Every Tick, OTM config, batch và sync.
- `src/service/mt5QueueServiceSingleton.js`: singleton để toàn backend dùng chung queue và sweeper.
- `src/service/otmQueueService.js`: hàng đợi OTM chạy bằng worker thread, single-flight theo config hash.
- `src/workers/otmWorker.js`: lọc core gate, sort, cluster, stable filter và tạo candidate OTM.
- `src/routes/mt5OptimizationAdminRoute.js`: API dành cho giao diện có JWT.
- `src/routes/mt5OptimizationWorkerRoute.js`: API dành cho MT5 worker có API key.
- `src/controller/mt5Controller.js`: tạo TPL, kiểm tra đường dẫn, tìm expert, list bot folder và upload EA.
- `src/utils/mt5OptimizationAuth.js`: xác thực JWT/API key và ownership.
- `src/utils/idHelper.js`: sinh/parse OPR, OP, ET và OTM ID.
- `src/utils/convertMt5HtmlToXlsx.js`: chuyển report MT5 HTML sang XLSX.
- `src/utils/optimizeLogger.js`: format log riêng của optimize.

### 2.3. Quy ước ID

- OPR parent: `OPR-YYYYMMDD-XXXX`.
- Open Price child: `OP-YYYYMMDD-XXXX-YY-STRATEGYCODE`.
- Every Tick: `ET-YYYYMMDD-XXXX-YY-STRATEGYCODE-Cxxxxxx-Axx`.
- OTM request: `OTM-YYYYMMDD-XXXX`.
- Mỗi lần worker claim tạo `run_id` riêng dạng `run_<timestamp>_<uuid>`.

`run_id` dùng để từ chối callback cũ sau retry/redeploy. Worker chỉ được ghi kết quả khi job vẫn `running` và `run_id` trùng attempt hiện tại.

## 3. Database cũ

### 3.1. Bảng queue và worker

`mt5_worker_api_keys`

- Lưu API key plaintext, nhãn, worker name, owner, trạng thái, ngày dùng và ngày hết hạn.
- API key thuộc một user.

`mt5_workers`

- Khóa chính là worker name.
- Lưu owner, API key, heartbeat, current job, dispatch status, job type và `is_public`.
- Worker private chỉ nhận job cùng owner. Worker public có thể nhận job user khác nhưng ownership của job không đổi.

`mt5_job_queue`

- Bản ghi thực thi trung tâm cho parent/child Open Price và Every Tick.
- Lưu mode, status, priority, claimable, worker, `run_id`, heartbeat, retry, progress, artifact pointer, owner và summary optimize.
- Trạng thái chính: `pending`, `running`, `done`, `failed`, `cancelled`.

`mt5_job_logs`

- Event log theo `external_job_id`.
- Payload linh hoạt bằng JSONB.

### 3.2. Bảng kết quả và cấu hình

`mt5_optimize_results`

- Mỗi dòng là một pass/candidate Open Price.
- Lưu strategy, run, rank, result, profit, trades, payoff, drawdown, PF, recovery, Sharpe, P/D, params, raw row, cluster và fallback.
- Đây từng là bảng có nguy cơ bloat lớn do nhiều JSONB, update/delete và khối lượng candidate cao.

`mt5_optimize_configs`

- Lưu version filter và OTM config theo job.
- Mỗi job chỉ có một version `is_current = true`.
- Refilter tạo version mới và vô hiệu cache OTM cũ.

`mt5_otm_requests`

- Queue/cache kết quả OTM theo `external_job_id + config_hash`.
- Trạng thái: `QUEUED`, `RUNNING`, `READY`, `FAILED`, `CANCELLED`.
- Lưu options, result, metrics, heartbeat và timestamps.

`mt5_otm_candidate_selections`

- Lưu candidate user chọn thủ công.
- Unique theo user, source job và source result.
- Candidate có thể chuyển từ `SELECTED` sang `INVALID` khi rerun làm dataset cũ mất hiệu lực.

`mt5_backtest_results`

- Lưu kết quả Every Tick theo job: params, results và deals JSONB.
- Dùng để dựng lại export/sync mà không phụ thuộc artifact vật lý còn tồn tại.

### 3.3. Auto Every Tick

`mt5_auto_backtest_runs`

- Bảng gộp cả thông tin batch và từng candidate/attempt.
- Lưu batch, source job/result, rank, attempt, current/accepted Every Tick job, comparison, trạng thái, sync status, target backtest table và cấu hình filter.
- Cách gộp batch header và run detail trong cùng bảng là một trong các điểm cần thiết kế lại vì lặp dữ liệu và khó đặt khóa/ràng buộc rõ ràng.

### 3.4. Liên kết ra ngoài module

- Các bảng MT5 tham chiếu `users` qua owner/creator/API key.
- `strategy_metadata.active_every_tick_job_id` trỏ logic tới Every Tick job nhưng không có foreign key.
- `user_notifications` chứa event Open Price, Every Tick và Auto Every Tick bên cạnh notification của module khác.
- Auto Every Tick có thể ghi kết quả vào backtest table động và cập nhật `strategy_metadata`.

### 3.5. Schema thực tế trước khi xóa

Database `pre_backtest` có 10 bảng MT5:

- `mt5_auto_backtest_runs`
- `mt5_backtest_results`
- `mt5_job_logs`
- `mt5_job_queue`
- `mt5_optimize_configs`
- `mt5_optimize_results`
- `mt5_otm_candidate_selections`
- `mt5_otm_requests`
- `mt5_worker_api_keys`
- `mt5_workers`

Các sequence chính:

- `mt5_auto_backtest_runs_id_seq`
- `mt5_job_logs_id_seq`
- `mt5_job_queue_id_seq`
- `mt5_optimize_configs_id_seq`
- `mt5_optimize_results_id_seq`
- `mt5_otm_candidate_selections_id_seq`
- `mt5_worker_api_keys_id_seq`
- `seq_otm_request_id`

## 4. Luồng Open Price

1. User tạo/upload bundle từ frontend.
2. Backend lưu artifact tạm và tạo parent OPR.
3. Split tạo một OP child cho mỗi strategy.
4. Worker heartbeat và claim atomically một job phù hợp owner/job type/public policy.
5. Claim gắn worker, API key, `run_id`, start time và heartbeat.
6. Worker tải artifact, chạy MT5 Open Price với số `optimize_runs` cấu hình.
7. Worker upload result theo chunk/session để tránh body quá lớn và timeout proxy.
8. Backend merge chunk, upsert candidate và cập nhật summary ở queue.
9. Worker mark done/fail bằng đúng `run_id`.
10. OTM chỉ được tính khi frontend cần xem hoặc summary cần cập nhật.

Retry/requeue giữ dữ liệu nguồn trong database/artifact pointer và tạo attempt thực thi mới. Callback attempt cũ không được ghi đè attempt mới.

## 5. Luồng OTM và refilter

### 5.1. Core gate

Candidate chỉ được xét tiếp khi đạt tối thiểu:

- Profit từ 10.000 trở lên.
- Total trades từ 100 trở lên.

Candidate không đạt core gate không được đưa vào OTM Summary hoặc Auto Every Tick. Candidate fallback vẫn có thể được hiển thị/chọn nếu đã qua core gate nhưng không đạt filter nâng cao.

### 5.2. Filter và sort

- Filter được lưu version theo từng strategy/job.
- Hỗ trợ profit, trades, payoff, drawdown, PF, recovery, Sharpe, P/D và các cờ ổn định.
- Sort hỗ trợ cả tăng và giảm theo metric cấu hình.
- View mode gồm tất cả, Top N đại diện cụm và tất cả đại diện cụm.
- Cluster radius là khoảng cách phần trăm giữa bộ tham số; gom cụm phải thực hiện riêng từng strategy.

### 5.3. Queue OTM

- Dùng `config_hash` từ job, filter, sort, cluster và Top N.
- Request cùng job/config dùng single-flight, không chạy trùng.
- Concurrency cũ là 1 worker thread để bảo vệ PostgreSQL/Node.
- Heartbeat timeout mặc định 120 giây.
- Wall timeout mặc định 600 giây.
- Restart backend chuyển OTM `RUNNING` về `QUEUED` rồi chạy tiếp.
- Refilter xóa/vô hiệu cache OTM của đúng job, không bắt buộc refresh toàn bộ trang.

## 6. Luồng Every Tick

### 6.1. Chạy lẻ

- User chọn candidate từ OTM Results và yêu cầu export/chạy Every Tick.
- Backend dựng INI từ template và `params_json` trong database.
- Tạo ET job liên kết source job/result.
- Worker chạy mode Every Tick và upload report/deals/results.
- Kết quả được lưu vào `mt5_backtest_results`, vì vậy tải INI/rerun/sync không nên phụ thuộc vĩnh viễn vào ZIP vật lý.

### 6.2. Auto Every Tick batch

- Nguồn có thể là selected jobs, all done jobs hoặc watch list.
- Chế độ có thể chạy fixed candidates, lần lượt tới first passed hoặc toàn bộ candidate.
- Mỗi strategy chỉ sync candidate được user/system chấp nhận.
- Candidate không đạt core gate không được tạo item rỗng.
- Candidate Fail nhưng có dữ liệu hợp lệ vẫn có thể được user promote/manual select.
- Promote chỉ đổi dòng đại diện, chưa sync database.
- Sync Selected mới ghi vào target backtest table và cảnh báo khi strategy đã tồn tại trong chính target table.

### 6.3. Metrics Every Tick

- Profit = tổng Profit + Commission + Swap của deal giao dịch.
- Total trades trong fallback calculation = số deal giao dịch chia 2.
- Profit Factor = gross profit / absolute gross loss.
- Balance drawdown amount lấy chênh lệch lớn nhất từ peak balance tới running balance.
- Drawdown % = drawdown amount / peak balance.
- Recovery và P/D fallback đều dùng net profit / max balance drawdown amount.
- Sharpe fallback tính từ PnL ngày, annualized bằng căn bậc hai của 252.
- Largest Loss Trade là trị tuyệt đối của PnL âm lớn nhất.
- Khi report Every Tick có metric đầy đủ thì ưu tiên metric report; công thức fallback chỉ dùng khi cần dựng từ deals.

## 7. Phân quyền

- Job luôn thuộc owner đã tạo, kể cả worker public của user khác thực thi.
- User thường chỉ xem/sửa/xóa job, worker và API key thuộc mình.
- Admin xem và thao tác toàn bộ.
- Worker private nhận job cùng owner.
- Worker public có thể nhận job user khác khi dispatch bật và job claimable.
- Worker callback phải khớp API key, worker name, owner được claim và `run_id`.

## 8. Chống nghẽn Node và PostgreSQL

Các biện pháp đã có trong phiên bản cũ:

- OTM dùng worker thread, không chạy CPU nặng trực tiếp trên event loop.
- OTM concurrency giới hạn 1.
- Summary tải theo chunk nhỏ và frontend hiển thị dần.
- Candidate detail chỉ tải khi expand/mở modal.
- Passed count tải theo page/chunk thay vì quét toàn bộ job.
- `config_hash` và single-flight ngăn query OTM trùng.
- Upload kết quả lớn dùng session/chunk.
- Artifact conversion có queue, concurrency và giới hạn dung lượng.
- `run_id` chống callback cũ ghi nhầm.
- Sweeper có `_sweepInProgress` để không chồng chu kỳ.
- Các thao tác cleanup dùng `Promise.allSettled`; một tác vụ lỗi không dừng toàn sweeper.
- Pool PostgreSQL phải chừa kết nối cho dashboard/backtest; không dùng số kết nối bằng sát `max_connections` của PostgreSQL.
- Query dài phải có statement timeout và request hủy phải hủy query tương ứng.
- Delete All cũ có nguy cơ timeout/bloat vì xóa nhiều bảng lớn trong request; bản thiết kế mới cần background job hoặc partition/drop theo vòng đời.

## 9. Cache, logs và cleanup ổ đĩa

### 9.1. Backend artifact

- Root artifact: `backend/uploads/mt5_artifacts` theo cấu hình triển khai.
- Upload session tạm: `backend/uploads/mt5_queue_tmp`.
- Artifact source/result có pointer trong `mt5_job_queue`.
- Conversion queue xử lý tuần tự để tránh tăng RAM/CPU.
- Sweeper dọn upload session stale, artifact mồ côi, artifact job done và artifact job failed.
- Retention mặc định cũ là 24 giờ nhưng nhiều luồng đã có thể dựng lại từ database.
- Sau khi download INI, thư mục export tạm và các parent directory rỗng phải được xóa.

### 9.2. MT5 worker machine

- `C:\mt5work\job_inputs`: input đang chạy.
- `C:\mt5work\tmp`: patched INI và run tạm.
- `C:\mt5work\runs`: raw report và output theo `run_id`.
- `Tester\cache` và `Tester\logs`: dữ liệu MT5 terminal, có thể phình lớn.
- Cleanup chỉ xóa dữ liệu của job đã terminal; không xóa folder/run đang active.
- Với strategy có nhiều optimize runs, cache terminal nên được dùng lại trong toàn bộ các run của strategy rồi xóa sau khi strategy hoàn tất.
- File metadata `mt5_worker_data_cache.json` chỉ là nhãn trạng thái, không phải tick cache thật. Nếu cache terminal đã bị xóa thì metadata cũ phải bị xóa/invalid để không log sai `CACHE HIT`.
- Every Tick chạy sau này có thể phải preload lại; điều này ảnh hưởng thời gian, không được làm thay đổi kết quả nghiệp vụ.

## 10. Recovery khi restart/redeploy

- Job và progress bền vững nằm trong PostgreSQL, không chỉ trong RAM.
- Job `pending` tiếp tục được claim sau restart.
- Job `running` quá heartbeat được recover/fail/requeue theo policy.
- OTM `RUNNING` được đưa về `QUEUED` vì worker thread cũ không còn tồn tại.
- Auto Every Tick batch `PENDING/RUNNING` được resume.
- Upload/finalize dùng state file và idempotency để retry final chunk khi response bị mất.
- Worker heartbeat tách khỏi browser; mất Wi-Fi phía browser không làm worker dừng.

## 11. Giao diện frontend cũ

Route `/optimization` có sáu tab:

1. Setup Workers
   - Tạo/revoke/copy API key.
   - Xem worker nodes, online/busy, job type, public/private, drain/resume.
2. INI Config Generator
   - Đọc EA/MQ5, dựng input ranges và tạo INI.
3. Jobs Queue Process
   - Upload bundle, split strategy, xem queue health/progress, requeue/recover/delete/export CSV.
4. All Optimize Results
   - Bảng Open Price, Passed count, OTM Results từng strategy, OTM Summary, refilter và candidate selection.
5. All Backtest Candidates
   - Xem Auto Every Tick theo batch/all batches, promote candidate, comparison/delta, sync status/source table và sync selected.
6. TPL Generator
   - Upload EA folder, tìm expert, tạo và tải TPL.

### 11.1. Progressive loading

- Trang vào thẳng bảng, không chặn toàn màn hình bằng spinner lớn.
- Tên strategy và metrics xuất hiện cùng placeholder của từng dòng.
- Strategy/chunk nào trả về trước hiển thị trước.
- Expand chỉ tải candidate của strategy đang mở.
- Expand All chỉ tải trang hiện tại và cảnh báo khi số lượng lớn.
- User không được Start Every Tick khi candidate/config bắt buộc của selection đó chưa tải xong.
- Refilter một strategy cập nhật đúng row đó, không refresh toàn Summary Table.

### 11.2. Trạng thái hiển thị

- Selected: candidate đang làm dòng đại diện.
- Promote: đưa candidate lên dòng đại diện, không đồng nghĩa sync.
- Synced/chấm xanh: candidate thực sự đang tồn tại trong ít nhất một source backtest table được API xác nhận.
- Source table: tên các backtest table chứa candidate; chưa sync hiển thị `No info`.
- Pass/Fail: kết quả evaluator, độc lập với việc user manual select.

## 12. API cũ theo nhóm

### Admin/JWT

- Health, list/get/export/delete/requeue/recover/reassign/split job.
- Upload bundle và refilter.
- Worker list, allow/block, job type, public access, drain/resume/delete.
- Optimize Results detail/summary, OTM request status và OTM config.
- Rerun Open Price, export report, tải INI và quản lý result artifact.
- API key list/create/revoke.
- Auto Every Tick create/list/detail/date-range/cancel/delete/retry/select/clear/sync/note.

### Worker/API key

- Verify API key.
- Claim, bulk status, heartbeat, done và fail.
- Worker heartbeat/detail.
- Download input/result artifact.
- Upload result artifact thường hoặc theo chunk.
- Upload optimize results thường hoặc theo session/chunk/finalize.
- Upload backtest results.

### Công cụ và selection

- Save TPL, validate path, find expert, list bot folders, upload EA folder.
- List/add/remove/invalidate OTM candidate selections.
- Sync Every Tick result vào backtest table.

## 13. Những điểm cần giữ khi xây lại

- Ownership của job độc lập với worker thực thi.
- Public worker là opt-in.
- Claim atomically và có lease/heartbeat.
- Mỗi execution attempt có `run_id` bất biến.
- Callback idempotent và chống stale attempt.
- Upload lớn theo chunk, không giữ toàn file trong RAM.
- OTM lazy loading, single-flight, config version/hash và progressive rendering.
- Core gate tách khỏi filter nâng cao.
- Candidate selection và sync là hai hành động khác nhau.
- Dữ liệu nghiệp vụ đủ để dựng lại INI/export/rerun mà không phụ thuộc artifact vĩnh viễn.
- Cleanup chỉ tác động resource đã terminal; không đụng job active.
- Recovery sau redeploy dựa trên database state.
- Query nặng có timeout, cancellation và concurrency budget.

## 14. Những điểm phải thiết kế lại

- Chuẩn hóa rõ Job, Attempt, Artifact, Result, Candidate, Filter Version, Batch và Batch Item.
- Không gộp batch header và attempt detail trong cùng bảng.
- Mọi quan hệ bắt buộc phải có foreign key thật, không liên kết bằng text tùy ý khi có thể dùng khóa nội bộ.
- Tách immutable result khỏi mutable selection/status.
- Không nhét payload lớn lặp lại vào nhiều JSONB nếu có thể chuẩn hóa hoặc lưu object storage.
- Có chính sách partition/retention cho result/log khối lượng lớn.
- Delete job phải là tác vụ nền, quan sát được và không gây HTTP 524.
- Có bảng migration version chuẩn, không dựa vào một file SQL cộng dồn vừa tạo vừa sửa vừa xóa.
- Tách read model phục vụ UI khỏi transaction model; Summary không quét raw candidates mỗi lần mở trang.
- Định nghĩa state machine và unique constraints trước khi viết service.
- Đo connection budget cho dashboard, sync và MT5; không để một module chiếm hết pool.

## 15. Danh sách source cũ được tháo

Backend:

- Route/controller/DAO/service/worker/utils MT5 và OTM.
- Điểm mount, init/resume trong `index.js`.
- Endpoint sync Every Tick nằm trong `opRoute`/`opController`.
- Cột `active_every_tick_job_id` trong `strategy_metadata`.
- Notification helper riêng Open Price/Every Tick/Auto Every Tick.
- Knex config và dependency chỉ phục vụ queue MT5.
- SQL migration cũ có khả năng tái tạo bảng MT5.

Frontend:

- Route/menu `/optimization`.
- Toàn bộ `pages/optimization`.
- Toàn bộ `services/mt5`.
- OTM watch list API và các utility chỉ dành cho INI/bundle MT5.
- Config endpoint MT5 và helper đọc Auto Every Tick từ `api/order.js`.

Database hiện tại:

- Drop toàn bộ bảng/index/sequence MT5 trong database đang kết nối qua `.env`.
- Drop `strategy_metadata.active_every_tick_job_id`.
- Xóa notification có event/entity riêng MT5, giữ nguyên bảng notification dùng chung.

## 16. Điều kiện bắt đầu bản thiết kế mới

Trước khi code lại cần chốt ERD, state machine, cardinality, khóa chính/khóa ngoại, idempotency key, partition/retention, object storage policy, recovery policy và read model cho UI. Không tái sử dụng trực tiếp schema cũ chỉ vì giao diện cũ đang hoạt động.
