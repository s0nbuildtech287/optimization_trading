# Kế hoạch Manual Selection cho Volume Optimization

## 1. Mục tiêu

- Giữ nguyên ba bảng hiện tại:
  - `lot_threshold_analysis_runs`: thông tin và cấu hình của từng lần chạy.
  - `lot_threshold_analysis`: toàn bộ candidate volume và trạng thái `the_chosen_one` của từng strategy.
  - `lot_threshold_final`: read model chứa đầy đủ metrics của candidate đang được chọn để phục vụ filter nhanh.
- Giữ nguyên thuật toán tự động hiện tại làm lựa chọn mặc định.
- Cho phép user chọn một candidate khác trên biểu đồ P/D.
- Candidate được chọn thủ công phải cập nhật đầy đủ metrics trong `lot_threshold_final` để bộ lọc tại trang Strategies tiếp tục chính xác.
- Thêm `the_chosen_one` vào `lot_threshold_analysis` làm trạng thái lựa chọn gốc; `lot_threshold_final` phải được đồng bộ trong cùng transaction và chỉ đóng vai trò read model.

## 2. Quy tắc nghiệp vụ

### 2.1. Phạm vi duy nhất

Mỗi bộ khóa sau chỉ có đúng một kết quả final:

```text
analysis_run_id + strategy_id + source_table
```

Partial unique index tại analysis và khóa chính hiện tại của final cùng bảo đảm ràng buộc này.

Không áp dụng một lựa chọn duy nhất cho strategy trên toàn bộ lịch sử, vì mỗi Analysis Run có thể khác:

- Nguồn backtest.
- Khoảng thời gian phân tích.
- Cấu hình volume.
- Điều kiện lọc.

### 2.2. Các loại lựa chọn

- `AUTO`: đạt core gate và được thuật toán chọn P/D tốt nhất.
- `FALLBACK`: không candidate nào đạt core gate, hệ thống dùng fallback hiện tại.
- `MANUAL`: user chủ động chọn candidate khác.

### 2.3. Candidate được phép chọn

- Phải tồn tại trong `lot_threshold_analysis`.
- Phải thuộc đúng `analysis_run_id`, `strategy_id` và `source_table`.
- Chỉ được chọn một `lot_threshold` đã được phân tích; không cho nhập một mức volume tùy ý chưa được tính.
- User phải có quyền truy cập Analysis Run và toàn bộ source table của run.
- Candidate legacy thiếu metrics chi tiết không được chọn thủ công cho đến khi có đủ snapshot hoặc chạy lại Analysis Run.

## 3. Vấn đề dữ liệu hiện tại

`lot_threshold_analysis` hiện chỉ lưu:

- P/D.
- Total Profit.
- Max Drawdown.
- Total Trades.
- Winrate.

`lot_threshold_final` còn lưu thêm các metrics phục vụ filter Strategies:

- Profit Factor.
- Recovery Factor.
- Sharpe Ratio.
- Largest Loss Trade.
- Largest Profit Trade.
- Largest Profit Trade Ratio.
- Risk Reward Ratio.
- LR Correlation.
- Average Profit.
- Average Loss.

Vì vậy không được đổi final bằng cách chỉ cập nhật `lot_threshold`. Làm như vậy sẽ để metrics của candidate cũ đi cùng volume mới và làm sai kết quả filter.

## 4. Thay đổi database

### 4.1. Bổ sung trạng thái candidate được chọn

```sql
ALTER TABLE lot_threshold_analysis
ADD COLUMN the_chosen_one BOOLEAN NOT NULL DEFAULT FALSE;
```

Không dùng `UNIQUE (the_chosen_one)` vì boolean unique trên một cột sẽ chỉ cho phép tối đa một dòng `TRUE` và một dòng `FALSE` trên toàn bảng.

Ràng buộc đúng là partial unique index theo phạm vi strategy/run/source:

```sql
CREATE UNIQUE INDEX uq_chosen_one_per_strategy
ON lot_threshold_analysis (
  analysis_run_id,
  strategy_id,
  source_table
)
WHERE the_chosen_one = TRUE;
```

Index này bảo đảm **tối đa một** candidate `TRUE` trong mỗi nhóm. Việc bảo đảm nhóm thành công luôn có **đúng một** candidate được thực hiện trong transaction nghiệp vụ và được kiểm tra sau mỗi Analysis Run.

### 4.2. Bổ sung snapshot metrics cho candidate

Thêm vào `lot_threshold_analysis` các cột đang thiếu:

```sql
profit_factor NUMERIC,
recovery_factor NUMERIC,
sharpe_ratio NUMERIC,
largest_loss_trade NUMERIC,
largest_profit_trade NUMERIC,
largest_profit_trade_ratio NUMERIC,
risk_reward_ratio NUMERIC,
lr_correlation NUMERIC,
avg_profit NUMERIC,
avg_loss NUMERIC
```

Các lần chạy mới phải lưu đầy đủ metrics cho mọi candidate ngay trong `batchInsertResults()`.

### 4.3. Bổ sung metadata lựa chọn vào final

```sql
selection_type VARCHAR(16) NOT NULL DEFAULT 'AUTO',
selected_by INTEGER,
selected_at TIMESTAMP,
auto_lot_threshold INTEGER
```

Ý nghĩa:

- `selection_type`: nguồn lựa chọn hiện tại.
- `selected_by`: user thực hiện manual selection.
- `selected_at`: thời điểm lựa chọn.
- `auto_lot_threshold`: lưu đề xuất tự động ban đầu để hỗ trợ Reset to Auto và đối chiếu audit.

Thêm check constraint:

```sql
CHECK (selection_type IN ('AUTO', 'FALLBACK', 'MANUAL'))
```

### 4.4. Foreign key candidate

Sau khi kiểm tra dữ liệu mồ côi, thêm foreign key từ final về candidate:

```text
(analysis_run_id, strategy_id, source_table, lot_threshold)
    -> lot_threshold_analysis
(analysis_run_id, strategy_id, source_table, lot_threshold)
```

Foreign key bảo đảm final không thể trỏ đến một mức volume chưa tồn tại trong Analysis Run.

### 4.5. Index

Giữ primary key hiện tại của final và bổ sung index phục vụ lookup candidate:

```sql
CREATE INDEX ... ON lot_threshold_analysis
  (analysis_run_id, strategy_id, source_table, lot_threshold);
```

Primary key analysis hiện tại đã có đúng thứ tự này, vì vậy chỉ tạo index mới nếu kiểm tra thực tế cho thấy cần thiết; không tạo index trùng.

### 4.6. Dữ liệu legacy

- Backfill metadata của final hiện tại:
  - `is_fallback = TRUE` -> `selection_type = 'FALLBACK'`.
  - Còn lại -> `selection_type = 'AUTO'`.
  - `auto_lot_threshold = lot_threshold`.
- Backfill `the_chosen_one = TRUE` cho candidate khớp dòng final theo đủ bốn khóa.
- Kiểm tra không có nhóm nào có nhiều hơn một candidate `TRUE` trước khi tạo partial unique index.
- Backfill metrics vào analysis cho đúng candidate đang nằm trong final bằng join theo khóa đầy đủ.
- Các candidate cũ không được chọn trước đây sẽ vẫn thiếu metrics chi tiết.
- Frontend phải vô hiệu hóa Manual Select đối với candidate legacy thiếu metrics và hướng dẫn chạy lại Analysis Run.
- Không suy đoán hoặc tính lại metrics legacy từ dữ liệu backtest hiện tại vì dữ liệu nguồn có thể đã thay đổi so với lúc run.

## 5. Backend

### 5.1. DAO

File: `src/dao/lotThresholdDao.js`

- Mở rộng `batchInsertResults()` để lưu toàn bộ metrics.
- Mở rộng luồng auto để đánh dấu candidate được chọn `the_chosen_one = TRUE` và ghi final trong cùng transaction.
- Mở rộng `insertOptimalResult()` để ghi `selection_type`, `selected_by`, `selected_at`, `auto_lot_threshold`.
- Thêm hàm lấy chính xác một candidate theo khóa đầy đủ.
- Thêm hàm transaction `selectManualCandidate()`:
  1. Khóa dòng Analysis Run cần thao tác.
  2. Kiểm tra candidate tồn tại và đủ metrics.
  3. Khóa toàn bộ candidate thuộc đúng nhóm strategy/run/source.
  4. Đổi candidate cũ thành `the_chosen_one = FALSE`.
  5. Đổi candidate mới thành `the_chosen_one = TRUE`.
  6. `INSERT ... SELECT` candidate mới từ analysis sang final.
  7. `ON CONFLICT` cập nhật toàn bộ volume và metrics.
  8. Ghi `selection_type = 'MANUAL'`, user và thời gian.
  9. Commit; nếu bất kỳ bước nào lỗi thì rollback cả flag và final.
- Không nhận metrics từ request frontend.

### 5.2. Service

File: `src/service/lotThresholdService.js`

- Tách logic chọn tự động hiện tại thành một helper dùng chung.
- Khi chạy analysis:
  - Vẫn áp dụng core gate và tie-break hiện tại.
  - Đánh dấu đúng candidate tự động là `the_chosen_one = TRUE`.
  - Lưu candidate đó vào final với `AUTO` hoặc `FALLBACK` trong cùng transaction.
- Thêm service manual selection:
  - Kiểm tra quyền Analysis Run.
  - Chuẩn hóa identifiers.
  - Gọi transaction DAO.
  - Clear strategy cache liên quan.
- Thêm service Reset to Auto:
  - Ưu tiên candidate tại `auto_lot_threshold`.
  - Nếu candidate không còn hợp lệ thì chạy lại helper auto trên snapshot candidate của chính Analysis Run.
  - Chuyển flag `the_chosen_one` về candidate auto, upsert đầy đủ metrics và đổi `selection_type` về `AUTO` hoặc `FALLBACK` trong cùng transaction.

### 5.3. API

Đề xuất endpoint:

```http
PUT /api/lot-threshold/selection
```

Body:

```json
{
  "analysisRunId": "LTA-20260915-0001",
  "strategyId": "065DE30H1OB",
  "sourceTable": "backtest1",
  "lotThreshold": 20
}
```

Reset tự động:

```http
POST /api/lot-threshold/selection/reset
```

Không thay đổi response format của các endpoint hiện tại. API `/optimal` được bổ sung các field metadata lựa chọn theo hướng additive.

## 6. Frontend

### 6.1. Biểu đồ P/D

File: `front-end/src/pages/dashboard/risk-analysis/VolumeOptimizationTab.jsx`

- Ngôi sao lấy từ candidate có `the_chosen_one = TRUE`; API phải đối chiếu với final và báo lỗi nếu hai nguồn không khớp.
- Cho phép click vào một điểm candidate trên đường P/D.
- Sau khi click, mở modal xác nhận gồm:
  - Strategy.
  - Analysis Run.
  - Source table.
  - Volume cũ và volume mới.
  - P/D, Profit, Drawdown, Trades của hai candidate.
- Chỉ di chuyển ngôi sao sau khi API thành công; không optimistic update.
- Trong lúc cập nhật, khóa thao tác chọn tiếp trên cùng strategy.
- Hiển thị chip `Auto`, `Fallback` hoặc `Manual` cạnh kết quả optimal.
- Thêm nút `Reset to Auto` khi lựa chọn hiện tại là Manual.

### 6.2. Bảng optimal

- Dòng đang chọn cập nhật ngay sau khi API thành công.
- Không reload toàn bộ Analysis Run; chỉ refetch curve và optimal row của strategy vừa thay đổi.
- Giữ nguyên pagination và filter hiện tại.

### 6.3. Trang Strategies

File liên quan: `front-end/src/pages/strategy-input/StrategyFilters.jsx`

- Không thay đổi công thức hoặc filter.
- Sau manual selection, invalidation cache phải làm lần tải tiếp theo đọc metrics mới từ final.
- Dropdown Analysis Run vẫn chỉ hiển thị và lọc theo đúng run/source table hiện tại.

## 7. Đồng thời và tính đúng đắn

- Mọi manual selection phải chạy trong transaction.
- Khóa theo đúng nhóm `(analysis_run_id, strategy_id, source_table)` để hai user không ghi đè không kiểm soát.
- Partial unique index bảo đảm không thể có hai candidate `the_chosen_one = TRUE` trong cùng nhóm.
- Primary key final bảo đảm luôn chỉ có một dòng được chọn cho một strategy/run/source.
- Flag analysis và dòng final phải thay đổi hoặc rollback cùng nhau; không chấp nhận trạng thái chỉ cập nhật một phía.
- Response trả về chính dòng final sau commit.
- Không cho sửa selection khi Analysis Run đang `RUNNING` hoặc `FAILED`.
- Không cho user chọn candidate thuộc source table họ không sở hữu.
- Ghi log gồm lựa chọn cũ, lựa chọn mới, user và thời điểm.

## 8. Hiệu năng và khả năng mở rộng

- Trang Strategies tiếp tục đọc bảng final nhỏ, không quét toàn bộ candidate.
- Curve chỉ đọc candidate của một strategy trong một run qua primary key prefix.
- Không chạy `COUNT(*)` toàn bảng khi manual selection.
- Không reload toàn bộ danh sách optimal sau khi chọn một candidate.
- Với dữ liệu rất lớn, đánh giá partition/hash theo `analysis_run_id` riêng; không đưa partition vào migration đầu tiên nếu chưa có số liệu chứng minh cần thiết.

## 9. Migration an toàn

Triển khai theo thứ tự:

1. Thêm cột nullable và metadata mới, chưa thay đổi code đọc.
2. Deploy code ghi song song đầy đủ metrics cho các run mới.
3. Backfill final metadata và `the_chosen_one` cho selected candidate legacy.
4. Kiểm tra orphan, nhiều flag `TRUE`, nhóm không có flag và metrics null.
5. Thêm partial unique index, foreign key và check constraint.
6. Deploy API manual selection và frontend.
7. Sau nghiệm thu mới chuyển các cột bắt buộc sang `NOT NULL` nếu dữ liệu thực tế cho phép.

Không drop hoặc gộp `lot_threshold_analysis` và `lot_threshold_final` trong kế hoạch này.

## 10. Verification

### Backend

- Auto selection trước và sau thay đổi cho cùng input phải ra cùng volume và metrics.
- Manual chọn candidate khác cập nhật toàn bộ final metrics đúng candidate.
- Candidate cũ thành `FALSE`, candidate mới thành `TRUE`, final trỏ đúng candidate mới.
- Không thể chọn candidate khác run, strategy hoặc source table.
- Hai request đồng thời vẫn chỉ để lại một final row hợp lệ.
- Không thể tồn tại hai candidate `the_chosen_one = TRUE` trong cùng strategy/run/source.
- Reset to Auto khôi phục đúng đề xuất ban đầu.
- User thường chỉ thao tác được run/source thuộc quyền.

### Frontend

- Click candidate, xác nhận và ngôi sao chuyển đúng điểm.
- Hủy modal không thay đổi dữ liệu.
- API lỗi không di chuyển ngôi sao.
- Chip Manual/Auto/Fallback hiển thị đúng.
- StrategyFilters đọc đúng P/D, drawdown, PF, Sharpe, Recovery và Largest Loss của candidate mới.

### Regression

- Chạy Volume Optimization mới.
- Xem curve và optimal table.
- Filter Strategies theo Analysis Run.
- Xóa Analysis Run.
- Phân quyền admin/user và source table.

## 11. Tiêu chí hoàn thành

- Không thay đổi thuật toán auto hiện tại.
- `lot_threshold_analysis.the_chosen_one` là trạng thái lựa chọn gốc.
- Mỗi strategy/run/source chỉ có một final row.
- Mỗi strategy/run/source thành công có đúng một candidate `the_chosen_one = TRUE`.
- Flag `the_chosen_one` và final luôn đồng bộ sau commit.
- Manual selection không tạo metrics lai giữa hai candidate.
- Final vẫn là read model nhanh cho Strategies.
- Có audit và Reset to Auto.
- Migration chạy được trên production hiện tại mà không mất lịch sử.
