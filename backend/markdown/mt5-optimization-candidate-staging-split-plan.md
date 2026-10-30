# Kế hoạch tách MT5 Backtest Candidates và Backtest Staging

Ngày lập: 28/09/2026

Trạng thái: Đã triển khai schema, migration, backend, frontend và verify end-to-end ngày 28/09/2026.

## 1. Mục tiêu

Tách dữ liệu theo đúng ba giai đoạn nghiệp vụ:

1. `mt5_optimize_results`: kết quả Open Price và lựa chọn để theo dõi/chạy Every Tick.
2. `mt5_backtest_candidates`: kết quả Every Tick đầy đủ của từng lần chạy.
3. `mt5_backtest_staging`: candidate cuối cùng được chọn cho mỗi strategy trong session để sync sang bảng backtest.

Mục tiêu của thay đổi:

- Mỗi bảng chỉ chịu trách nhiệm cho một giai đoạn nghiệp vụ.
- Không còn dồn `summary_op`, `summary_bt`, `deals`, staging và sync vào một dòng lớn.
- Filter All Backtest Candidates chạy trực tiếp trên các cột typed và có index.
- Một bộ tham số có thể chạy Every Tick nhiều lần mà không ghi đè lịch sử cũ.
- Staging chỉ giữ lựa chọn hiện hành, không sao chép lại `summary_bt` và `deals`.
- Job ID tiếp tục chỉ phục vụ thực thi queue, không trở thành khóa nghiệp vụ của result/candidate/staging.

## 2. Tổng thể schema sau thay đổi

Module MT5 Optimization sẽ có 8 bảng:

| Bảng | Trách nhiệm |
| --- | --- |
| `mt5_sessions` | Workspace MT5 của user |
| `api_keys` | API key plaintext và scope |
| `mt5_workers` | Worker, heartbeat, quyền chạy và sharing |
| `mt5_job_queue` | Hàng đợi Open Price/Every Tick |
| `mt5_optimize_results` | Tất cả bộ tham số Open Price hợp lệ |
| `mt5_backtest_candidates` | Kết quả Every Tick theo từng lần chạy |
| `mt5_backtest_staging` | Candidate cuối cùng được chọn để sync |
| `mt5_logs` | Structured application log của module |

Quan hệ chính:

```text
users
  1 -> N mt5_sessions
  1 -> N api_keys
  1 -> N mt5_workers

mt5_sessions
  1 -> N mt5_job_queue
  1 -> N mt5_optimize_results
  1 -> N mt5_backtest_candidates
  1 -> N mt5_backtest_staging
  1 -> N mt5_logs

mt5_optimize_results
  1 -> N mt5_backtest_candidates

mt5_backtest_candidates
  1 -> 0..1 mt5_backtest_staging hiện hành
```

`mt5_backtest_staging` không phải bảng sao chép 1-1 của candidate. Nó là bảng lựa chọn hiện hành và trạng thái sync; payload Every Tick chỉ tồn tại một lần trong `mt5_backtest_candidates`.

## 3. Điều chỉnh `mt5_optimize_results`

### 3.1. Các cột giữ lại

- `id`
- `session_id`
- `strategy_id`
- `strategy_id_r`
- `summary_op`
- `picked_watchlist`
- `picked_bt`
- `backtest_run_count`
- `created_at`
- `updated_at`

`picked_watchlist` và `picked_bt` vẫn thuộc bảng này vì đây là lựa chọn được thực hiện trên kết quả Open Price.

`backtest_run_count` được giữ làm bộ đếm đọc nhanh cho bảng All Optimize Results. Nguồn sự thật vẫn là số candidate Every Tick đã insert thành công. Việc insert candidate và tăng counter phải nằm trong cùng transaction để không lệch dữ liệu.

### 3.2. Các cột chuyển khỏi bảng

- `picked_bt_staging`
- `summary_bt`
- `deals`
- `backtest_completed_at`
- `staging_target_table`
- `source_table`
- `sync_status`
- `synced_at`

Các index và constraint phụ thuộc những cột này cũng phải được gỡ khỏi `mt5_optimize_results`.

### 3.3. Trách nhiệm cuối cùng

`mt5_optimize_results` chỉ trả lời các câu hỏi:

- Session có những bộ tham số Open Price nào?
- Inputs và metrics Open Price của bộ đó là gì?
- User có đưa bộ đó vào watchlist hoặc chọn để chạy Every Tick không?
- Bộ đó đã hoàn thành Every Tick bao nhiêu lần?

## 4. Bảng `mt5_backtest_candidates`

### 4.1. Ý nghĩa

Mỗi dòng là một kết quả Every Tick hoàn chỉnh của một lần chạy cho một `strategy_id_r`.

Nếu cùng một bộ tham số được chạy Every Tick ba lần thì bảng có ba candidate, không ghi đè candidate cũ.

### 4.2. Cấu trúc đề xuất

```sql
CREATE TABLE mt5_backtest_candidates (
  id BIGSERIAL PRIMARY KEY,
  session_id VARCHAR(40) NOT NULL,
  optimize_result_id BIGINT NOT NULL,
  strategy_id VARCHAR(160) NOT NULL,
  strategy_id_r VARCHAR(220) NOT NULL,
  backtest_run_no INTEGER NOT NULL CHECK (backtest_run_no > 0),
  source_run_id UUID NOT NULL,

  summary_bt JSONB NOT NULL,
  deals JSONB NOT NULL,

  net_profit NUMERIC,
  total_trades INTEGER,
  balance_drawdown_percent NUMERIC,
  balance_drawdown_value NUMERIC,
  profit_factor NUMERIC,
  recovery_factor NUMERIC,
  sharpe_ratio NUMERIC,
  pd_ratio NUMERIC,
  largest_loss_trade NUMERIC,
  expected_payoff NUMERIC,

  backtest_completed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  FOREIGN KEY (
    optimize_result_id, session_id, strategy_id, strategy_id_r
  ) REFERENCES mt5_optimize_results(
    id, session_id, strategy_id, strategy_id_r
  ) ON DELETE CASCADE,

  UNIQUE (source_run_id),
  UNIQUE (optimize_result_id, backtest_run_no),
  UNIQUE (id, session_id, strategy_id)
);
```

Để composite foreign key trên hoạt động, `mt5_optimize_results` bổ sung unique key kỹ thuật:

```sql
ALTER TABLE mt5_optimize_results
  ADD CONSTRAINT uq_mt5_result_candidate_parent
  UNIQUE (id, session_id, strategy_id, strategy_id_r);
```

Ràng buộc này ngăn candidate tham chiếu một optimize result của session/strategy khác, kể cả khi service có lỗi truyền nhầm ID. Owner được xác định duy nhất qua `mt5_sessions.user_id`.

`source_run_id` lấy từ execution/run token của worker nhưng không tạo foreign key tới `mt5_job_queue`. Mục đích duy nhất là chống callback trùng làm insert hai candidate hoặc tăng `backtest_run_count` hai lần.

### 4.3. JSON và các cột metric

- `summary_bt` tiếp tục lưu toàn bộ cấu trúc canonical `{ settings, results }`, bao gồm Settings và đầy đủ các metrics MT5 trả về.
- `deals` tiếp tục lưu toàn bộ deal của lần Every Tick.
- Các metric thường filter/sort được trích thành cột typed.
- Các metric ít dùng vẫn chỉ nằm trong `summary_bt` để tránh bảng quá rộng.
- API detail trả `summary_bt + deals`; API list không được trả `deals`.

Các cột typed là nguồn cho Full Period filter/sort:

- `net_profit`
- `total_trades`
- `balance_drawdown_percent`
- `balance_drawdown_value`
- `profit_factor`
- `recovery_factor`
- `sharpe_ratio`
- `pd_ratio`
- `largest_loss_trade`
- `expected_payoff`

Quy tắc dữ liệu:

- Drawdown phải lấy Balance Drawdown Maximal, không lấy Equity Drawdown của Open Price.
- `pd_ratio` phải được tính bằng công thức canonical hiện tại từ Net Profit và Balance Drawdown Maximal.
- `largest_loss_trade` giữ giá trị có dấu như MT5 trả về.
- `total_trades` lấy từ Results. Khi tính lại theo Date Range từ Deals phải giữ quy ước một trade gồm hai deals.
- Backend canonicalize số liệu một lần rồi ghi `summary_bt` và các cột typed trong cùng transaction.

### 4.4. Index đề xuất

```sql
CREATE INDEX idx_mt5_bt_candidates_session_created
  ON mt5_backtest_candidates(session_id, created_at DESC, id DESC);

CREATE INDEX idx_mt5_bt_candidates_strategy
  ON mt5_backtest_candidates(session_id, strategy_id, created_at DESC);

CREATE INDEX idx_mt5_bt_candidates_result_run
  ON mt5_backtest_candidates(optimize_result_id, backtest_run_no DESC);

CREATE INDEX idx_mt5_bt_candidates_profit
  ON mt5_backtest_candidates(session_id, net_profit DESC, id DESC);

CREATE INDEX idx_mt5_bt_candidates_trades
  ON mt5_backtest_candidates(session_id, total_trades DESC, id DESC);

CREATE INDEX idx_mt5_bt_candidates_drawdown
  ON mt5_backtest_candidates(session_id, balance_drawdown_percent, id DESC);

CREATE INDEX idx_mt5_bt_candidates_pf
  ON mt5_backtest_candidates(session_id, profit_factor DESC, id DESC);

CREATE INDEX idx_mt5_bt_candidates_recovery
  ON mt5_backtest_candidates(session_id, recovery_factor DESC, id DESC);

CREATE INDEX idx_mt5_bt_candidates_sharpe
  ON mt5_backtest_candidates(session_id, sharpe_ratio DESC, id DESC);

CREATE INDEX idx_mt5_bt_candidates_pd
  ON mt5_backtest_candidates(session_id, pd_ratio DESC, id DESC);

CREATE INDEX idx_mt5_bt_candidates_largest_loss
  ON mt5_backtest_candidates(session_id, largest_loss_trade, id DESC);
```

Chỉ giữ index đã được API filter/sort thực sự sử dụng. Sau khi có `EXPLAIN ANALYZE` trên dữ liệu lớn, có thể bỏ index ít hiệu quả để giảm write amplification.

### 4.5. Giới hạn của Date Range

Tách metric thành cột giúp Full Period filter chạy bằng `WHERE` và index. Custom/Common Date Range vẫn phải tính lại từ `deals`; không được dùng các cột Full Period thay cho kết quả theo ngày.

Giai đoạn đầu tiếp tục lazy-load và chỉ tính trên candidate cần thiết. Sau load test, nếu Date Range toàn session vẫn chậm thì cần thiết kế bảng deal chuẩn hóa hoặc bảng aggregate riêng; không giải quyết bằng cách tạo thêm index trên JSON deals một cách mù quáng.

## 5. Bảng `mt5_backtest_staging`

### 5.1. Ý nghĩa

Mỗi session chỉ có tối đa một candidate hiện hành cho một strategy. Khi user chọn candidate khác, service cập nhật dòng staging hiện tại sang candidate mới.

Staging không lưu lại `summary_bt` hoặc `deals`; khi hiển thị hoặc sync sẽ join candidate bằng khóa chính.

### 5.2. Cấu trúc đề xuất

```sql
CREATE TABLE mt5_backtest_staging (
  id BIGSERIAL PRIMARY KEY,
  session_id VARCHAR(40) NOT NULL,
  strategy_id VARCHAR(160) NOT NULL,
  candidate_id BIGINT NOT NULL,
  target_table VARCHAR(255),
  source_table VARCHAR(255),
  sync_status VARCHAR(20) NOT NULL DEFAULT 'NOT_SYNCED'
    CHECK (sync_status IN ('NOT_SYNCED', 'SYNCING', 'SYNCED', 'SYNC_FAILED')),
  selected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  FOREIGN KEY (candidate_id, session_id, strategy_id)
    REFERENCES mt5_backtest_candidates(id, session_id, strategy_id)
    ON DELETE CASCADE,

  UNIQUE (session_id, strategy_id),

  CHECK (target_table IS NULL OR target_table ~ '^backtest[a-zA-Z0-9_]*$'),
  CHECK (source_table IS NULL OR source_table ~ '^backtest[a-zA-Z0-9_]*$')
);
```

Constraint bổ sung phải đảm bảo:

- `SYNCED` chỉ hợp lệ khi `source_table` và `synced_at` có giá trị.
- Trạng thái khác `SYNCED` không được giữ `source_table`/`synced_at` của candidate trước.
- Chọn candidate mới phải reset `target_table`, `source_table`, `sync_status` và `synced_at` trong cùng transaction.
- Trước khi sync, service vẫn kiểm tra bảng bắt đầu bằng `backtest`, tồn tại và user có quyền qua `data_source`.

Index:

```sql
CREATE INDEX idx_mt5_staging_session_updated
  ON mt5_backtest_staging(session_id, updated_at DESC);

CREATE INDEX idx_mt5_staging_sync_status
  ON mt5_backtest_staging(session_id, sync_status, updated_at DESC);
```

## 6. Luồng nghiệp vụ sau khi tách

### 6.1. Open Price

1. Worker chạy Open Price.
2. Backend loại kết quả full-zero.
3. Mỗi bộ tham số hợp lệ được insert vào `mt5_optimize_results`.
4. Watchlist và Backtest Pick vẫn cập nhật trên `mt5_optimize_results`.

### 6.2. Every Tick

1. User chọn `picked_bt = true` trên optimize result.
2. Backend tạo Every Tick job với `target_strategy_id_r`.
3. Worker trả Settings, Results và Deals.
4. Backend validate payload không rỗng, canonicalize metrics.
5. Trong một transaction:
   - Khóa optimize result tương ứng.
   - Chống trùng bằng `source_run_id`.
   - Insert một dòng mới vào `mt5_backtest_candidates`.
   - Tăng `backtest_run_count` đúng một lần.
   - Reset `picked_bt = false`.
6. Candidate mới xuất hiện ở All Backtest Candidates.

### 6.3. Staging

1. User bấm Pick Staging trên candidate.
2. Backend kiểm tra candidate thuộc đúng session/user.
3. Upsert `mt5_backtest_staging` theo `(session_id, strategy_id)`.
4. Candidate cũ tự mất trạng thái staging vì dòng staging đã trỏ sang candidate mới.
5. Không thay đổi hoặc sao chép payload candidate.

### 6.4. Sync backtest

1. User chọn target backtest table.
2. Backend lấy candidate qua staging.
3. Backend kiểm tra quyền bảng đích.
4. Settings, Results và Deals được sync transactionally sang module backtest.
5. Chỉ sau commit mới cập nhật staging thành `SYNCED`, ghi `source_table` và `synced_at`.

## 7. Thay đổi API và code backend

Giữ nguyên HTTP contract hiện có ở mức có thể để frontend không phải thay đổi toàn bộ cùng lúc.

Các nhóm cần sửa:

- Schema startup trong `src/dao/mt5OptimizationSchemaDao.js` tạo đủ 8 bảng theo đúng thứ tự phụ thuộc.
- DAO result chỉ truy vấn Open Price từ `mt5_optimize_results`.
- DAO candidate truy vấn `mt5_backtest_candidates`, join parent để lấy `summary_op` phục vụ so sánh delta.
- Every Tick completion chuyển từ `UPDATE mt5_optimize_results` sang transaction insert candidate.
- Detail/sparkline/date-range đọc `summary_bt` và `deals` từ candidate.
- Staging selection chuyển từ cờ boolean sang upsert bảng staging.
- Sync staging đọc candidate bằng FK và cập nhật trạng thái trên staging.
- Delete session tiếp tục cascade toàn bộ queue, optimize results, candidates, staging và logs.
- Delete optimize result cascade candidate và staging liên quan.
- Recovery/retry job không được tạo candidate trùng khi callback cũ gửi lại.
- Script `scripts/verifyMt5Optimization.js` phải kiểm tra cả ba tầng Open Price, Candidate và Staging.

Không tạo foreign key từ result/candidate/staging tới `mt5_job_queue`.

## 8. Thay đổi frontend

### All Optimize Results

- Nguồn metric luôn là `summary_op`.
- Giữ Watchlist, Backtest Pick và `backtest_run_count`.
- Không đọc `summary_bt`, Deals hoặc trạng thái staging từ optimize result.

### All Backtest Candidates

- Nguồn danh sách là `mt5_backtest_candidates`.
- Full Period filter/sort gửi trực tiếp các khoảng metric tới API.
- Delta so với Open Price lấy bằng join parent optimize result.
- Detail và chart dùng `candidate_id`, lazy-load `summary_bt + deals`.
- Pick Staging thao tác trên candidate ID.

### Backtest Staging

- Nguồn danh sách là `mt5_backtest_staging JOIN mt5_backtest_candidates`.
- Mỗi strategy/session chỉ hiển thị một dòng.
- Thay candidate không tạo dữ liệu Every Tick mới.
- Sync status và source table lấy từ staging, không lấy từ optimize result.

## 9. Chiến lược migration cho hai loại database

### 9.1. Database local hiện tại đã dùng schema remake 6 bảng

Mục tiêu: bảo toàn Session, queue, Open Price results, Every Tick results và staging hiện có.

Trình tự:

1. Dừng backend và toàn bộ worker để không có callback/claim mới trong lúc migrate.
2. Backup hoặc tạo snapshot database.
3. Preflight xác nhận schema đang là bản 6 bảng và thống kê:
   - Tổng `mt5_optimize_results`.
   - Số dòng có `summary_bt`.
   - Số dòng `picked_bt_staging = true`.
   - Số job đang `CLAIMED/RUNNING` phải bằng 0.
4. Tạo `mt5_backtest_candidates` và `mt5_backtest_staging`.
5. Backfill một candidate cho mỗi optimize result hiện có `summary_bt + deals`:
   - `backtest_run_no = GREATEST(backtest_run_count, 1)`.
   - `source_run_id` sinh UUID migration ổn định cho mỗi result.
   - Metric typed được parse từ `summary_bt.results` theo cùng canonical mapper của backend.
6. Backfill staging từ những dòng `picked_bt_staging = true` và candidate vừa tạo.
7. Chuyển `staging_target_table`, `source_table`, `sync_status`, `synced_at` sang staging.
8. Đối chiếu count và checksum nghiệp vụ.
9. Chỉ khi audit đạt mới drop cột/index/constraint cũ khỏi `mt5_optimize_results`.
10. Khởi động backend mới, chạy verify script rồi mới mở worker.

Giới hạn migration: schema cũ chỉ giữ payload Every Tick gần nhất trên mỗi optimize result. Nếu `backtest_run_count > 1`, migration chỉ tạo lại candidate gần nhất với `backtest_run_no` bằng counter hiện có; không thể phục hồi payload các lần chạy đã bị ghi đè trước đây.

### 9.2. Database chưa từng remake, còn schema MT5 legacy

Mục tiêu: bỏ toàn bộ cấu trúc MT5 legacy và tạo thẳng schema cuối 8 bảng.

Trình tự:

1. Dừng backend/worker.
2. Xác nhận dữ liệu MT5 legacy không cần giữ hoặc export trước khi xóa.
3. Drop toàn bộ bảng, sequence, trigger và function MT5 legacy theo đúng dependency order.
4. Drop cả các bảng remake dở nếu tồn tại để tránh trộn schema.
5. Tạo thẳng 8 bảng cuối cùng; không tạo schema 6 bảng trung gian.
6. Chạy audit table/column/FK/index/constraint.
7. Deploy backend và frontend mới.

### 9.3. Guard bắt buộc

Migration phải nhận diện và dừng ngay nếu database không thuộc một trong ba trạng thái:

- Fresh: chưa có bảng MT5.
- Current remake: có schema 6 bảng hiện tại.
- Legacy: có các bảng MT5 cũ đã biết.

Không được âm thầm trộn hai schema hoặc tự drop khi preflight không xác định được trạng thái.

## 10. Các file schema/migration bắt buộc cập nhật đồng bộ

### `src/dao/mt5OptimizationSchemaDao.js`

- Startup create cuối cùng phải là 8 bảng.
- Chỉ giữ `CREATE ... IF NOT EXISTS` cho database fresh.
- Không đặt ALTER migration runtime trong startup DAO.
- Nếu phát hiện schema cũ, log rõ yêu cầu chạy migration thay vì khởi động với schema nửa cũ nửa mới.

### `markdown/migration.md`

Bổ sung phần migration mới ở cuối file:

- Nhánh A: upgrade 6 -> 8, bảo toàn dữ liệu local hiện tại.
- Nhánh B: legacy/fresh -> schema 8 bảng cuối cùng.
- Có preflight, transaction, audit và câu lệnh rollback/snapshot guidance.
- Cập nhật phần teardown legacy để biết cả `mt5_backtest_candidates` và `mt5_backtest_staging`.

### `markdown/migration1.sql`

- Đổi mô tả từ schema 6 bảng thành schema 8 bảng.
- Tạo đúng final schema cho database fresh hoặc database đã teardown legacy.
- Không còn tạo các cột Every Tick/Staging trong `mt5_optimize_results`.
- Thêm audit trả về đúng 8 bảng và kiểm tra các FK/index quan trọng.

### `markdown/mt5-optimization-database-diagram.dbml`

- Thêm hai bảng candidate và staging.
- Xóa các cột đã chuyển khỏi optimize result.
- Thêm quan hệ Optimize Result 1-N Candidate.
- Thêm quan hệ Candidate tới Staging bằng composite ownership key.
- Cập nhật note từ 6 thành 8 bảng.

### Tài liệu liên quan

- Cập nhật `markdown/mt5-optimization-database-redesign-plan.md` để đánh dấu thiết kế 6 bảng đã được thay thế bởi kế hoạch này.
- Cập nhật progress report sau khi implementation và migration được verify.

## 11. Thứ tự triển khai

### Giai đoạn 1: Chốt schema và mapper

- Chốt tên bảng/cột/index.
- Chốt canonical mapping cho các metric typed.
- Chốt constraint JSON và trạng thái sync.

### Giai đoạn 2: Migration và startup schema

- Viết migration hai nhánh.
- Cập nhật `migration1.sql`, `migration.md`, startup DAO và DBML.
- Test migration trên bản sao local có dữ liệu.
- Test clean create trên database rỗng.
- Test legacy teardown/create trên schema cũ.

### Giai đoạn 3: DAO/service backend

- Tách query Open Price, Candidate và Staging.
- Chuyển callback Every Tick sang insert candidate idempotent.
- Chuyển staging sang upsert.
- Chuyển sync sang staging/candidate.
- Giữ response API tương thích ở những trường frontend đang dùng.

### Giai đoạn 4: Frontend

- Map API candidate theo `candidate_id`.
- Chuyển detail/chart/filter/date range sang nguồn candidate.
- Chuyển Backtest Staging sang bảng staging thật.
- Kiểm tra Open Price vẫn luôn dùng `summary_op`.

### Giai đoạn 5: Verify và tải lớn

- Chạy Open Price -> pick -> Every Tick nhiều lần -> staging -> sync.
- Test callback Every Tick trùng `source_run_id`.
- Test đổi staging liên tục và request đồng thời.
- Test filter/sort Full Period bằng `EXPLAIN ANALYZE`.
- Test Date Range không dùng nhầm metric Full Period.
- Kiểm tra list API không trả Deals.

## 12. Tiêu chí nghiệm thu

- Database cuối có đúng 8 bảng MT5.
- `mt5_optimize_results` không còn `summary_bt`, `deals` hoặc cột staging/sync.
- Một optimize result có thể có nhiều backtest candidates.
- Callback trùng không tạo candidate hoặc tăng counter hai lần.
- Full Period filter/sort chỉ query các cột typed của candidate.
- `summary_bt` vẫn giữ đầy đủ Settings, Results và các metrics chi tiết.
- Details/Chart chỉ tải Deals của candidate được mở.
- Một session/strategy chỉ có một staging hiện hành.
- Đổi staging không sao chép hoặc sửa payload candidate.
- Sync chỉ được đánh dấu thành công sau khi transaction bảng backtest commit.
- Local migration giữ được dữ liệu hiện tại.
- Database legacy tạo thẳng schema 8 bảng, không đi qua schema 6 bảng cũ.
- `migration.md`, `migration1.sql`, DBML và startup schema khớp tuyệt đối.

## 13. Quyết định cần giữ khi thực thi

- Không tạo quan hệ nghiệp vụ từ result/candidate/staging tới job queue.
- Không duplicate `summary_bt` và `deals` sang staging.
- Không filter metric thường xuyên bằng cách cast JSON ở mỗi request.
- Không tải Deals trong API danh sách.
- Không chạy ALTER ngầm trong startup backend.
- Không chạy migration khi còn worker/job active.
- Không drop dữ liệu local hiện tại trước khi backfill và audit đạt.

## 14. Kết quả triển khai

- Database local `pre_backtest` đã được làm sạch dữ liệu MT5 theo yêu cầu trước khi đổi schema.
- Migration PHẦN 24 đã chạy thành công, database hiện có đúng 8 bảng MT5.
- `mt5_optimize_results` không còn payload Every Tick hoặc trạng thái staging/sync.
- Every Tick insert vào `mt5_backtest_candidates`, chống callback trùng bằng `source_run_id`.
- Ownership đã được chuẩn hóa: `mt5_sessions.user_id` là nguồn duy nhất; queue, optimize result, candidate và staging không lưu lặp `user_id`.
- Khi chuyển owner session, toàn bộ job/result/candidate/staging tự đổi phạm vi truy cập theo session mà không phải update nhiều bảng.
- Staging dùng upsert theo `(session_id, strategy_id)` trong `mt5_backtest_staging`.
- Full Period filter/sort candidate đọc các cột typed có index; Date Range vẫn tính từ Deals.
- API và frontend đã chuyển sang endpoint `/backtest-candidates`.
- `migration.md`, `migration1.sql`, startup schema và DBML đã được cập nhật theo schema 8 bảng.
- `scripts/verifyMt5Optimization.js` đã kiểm tra Open Price, full-zero filter, Every Tick, idempotency, metric filter, counter, staging và cleanup.
- Frontend production build đã hoàn thành; chỉ còn các cảnh báo chunk/circular dependency có sẵn ngoài phạm vi thay đổi này.
