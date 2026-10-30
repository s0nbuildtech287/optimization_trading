# Plan: Quản lý nhiều lần chạy Volume Optimization

## 1. Mục tiêu

Bổ sung khả năng chạy Volume Optimization theo một hoặc nhiều backtest table, đồng thời lưu và phân biệt rõ từng lần chạy.

Mục tiêu chính:

- Chạy toàn bộ backtest hoặc chỉ nhóm bảng user chọn.
- Lưu lại lịch sử các lần chạy.
- Biết chính xác mỗi kết quả thuộc lần chạy nào.
- Biết khoảng thời gian giao nhau của từng lần chạy.
- Hiển thị đúng tên lần chạy trên giao diện.
- Không trộn kết quả của các lần chạy có cấu hình hoặc date range khác nhau.
- Không thay đổi công thức tính toán Volume Optimization hiện tại.

## 2. Quy tắc nghiệp vụ

### 2.1. Data Source và Analysis Run là hai khái niệm riêng

`Data Source` xác định các bảng được chọn để chạy hoặc lọc:

- All Backtests
- Một backtest table
- Nhiều backtest table

`Analysis Run` xác định phiên bản kết quả của một lần chạy:

- Initial full analysis
- Recalculate backtest2-5
- Test volume cap 50

Không gộp nhiều lần chạy vào dropdown Data Source.

### 2.2. Khi bắt đầu một lần chạy

Frontend mở dialog yêu cầu:

- Run name.
- Một hoặc nhiều Data Source.
- Cấu hình Min Volume/Max Volume theo symbol hiện tại.

Nếu user chọn All Backtests, backend lấy toàn bộ data source đang enabled.

Nếu user chọn một hoặc nhiều bảng, backend chỉ xử lý các bảng đó.

### 2.3. Khoảng thời gian

Mỗi run có một khoảng thời gian giao nhau riêng:

```text
common_from = MAX(min_time của các source được chọn)
common_to   = MIN(max_time của các source được chọn)
```

Khoảng thời gian được lưu vào run-info và dùng làm nguồn hiển thị chính cho tooltip.

### 2.4. Kết quả cũ

Mặc định giữ lại lịch sử các run cũ.

Run mới không ghi đè run cũ vì sử dụng `analysis_run_id` khác nhau.

Giao diện mặc định chọn run mới nhất phù hợp với Data Source hiện tại.

Có thể bổ sung retention/delete run cũ ở phase sau, không tự xóa trong phase đầu.

## 3. Schema database

### 3.1. Bảng run-info

Tạo bảng mới:

```sql
CREATE TABLE IF NOT EXISTS lot_threshold_analysis_runs (
  id BIGSERIAL PRIMARY KEY,
  analysis_run_id VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  source_tables JSONB NOT NULL DEFAULT '[]'::jsonb,
  configs_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  time_begin TIMESTAMP,
  time_end TIMESTAMP,
  status VARCHAR(32) NOT NULL DEFAULT 'RUNNING',
  total_strategies INTEGER NOT NULL DEFAULT 0,
  succeeded_strategies INTEGER NOT NULL DEFAULT 0,
  failed_strategies INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  created_by INTEGER,
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

Indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_lot_analysis_runs_status
ON lot_threshold_analysis_runs(status);

CREATE INDEX IF NOT EXISTS idx_lot_analysis_runs_started_at
ON lot_threshold_analysis_runs(started_at DESC);
```

### 3.2. Thêm run id vào bảng chi tiết

Thêm `analysis_run_id` vào:

- `lot_threshold_analysis`
- `lot_threshold_final`

Các khóa nghiệp vụ mới:

```text
lot_threshold_analysis:
analysis_run_id + strategy_id + source_table + lot_threshold

lot_threshold_final:
analysis_run_id + strategy_id + source_table
```

Các câu lệnh ALTER/MIGRATION phải được xuất riêng để admin chủ động chạy hoặc được migration chính thức quản lý. Không tự động xóa dữ liệu cũ.

### 3.3. Tương thích dữ liệu cũ

Các dòng cũ chưa có `analysis_run_id` phải được gắn một run legacy, ví dụ:

```text
run-lot-01
```

Run legacy có thể lưu:

- `name = 'Initial analysis'`
- `source_tables = []`
- `time_begin/time_end` lấy từ dữ liệu cũ nếu xác định được.

Không làm mất dữ liệu cũ trong migration.

## 4. Backend changes

### Phase 1 — Run lifecycle

Tạo các DAO/service:

```text
createAnalysisRun()
updateAnalysisRunStatus()
getAnalysisRuns()
getAnalysisRunById()
```

Trạng thái đề xuất:

```text
RUNNING
COMPLETED
FAILED
CANCELLED
```

Sinh `analysis_run_id` dạng nghiệp vụ:

```text
LTA-YYYYMMDD-XXXX
```

### Phase 2 — Chạy theo source được chọn

Cập nhật API chạy:

```text
POST /api/lot-threshold/run
```

Body:

```json
{
  "name": "Recalculate backtest2-5",
  "sourceTables": [
    "backtest2",
    "backtest3",
    "backtest4",
    "backtest5"
  ],
  "configs": {}
}
```

Backend cần truyền `sourceTables` vào:

- `getStrategyList(sourceTables)`
- `getOverlapTimeRange(sourceTables)`
- `getSymbolMaxVolumes(sourceTables)`
- `getDealsForStrategy()` theo từng source table.

Nếu source là All Backtests thì resolve thành toàn bộ enabled source tables.

### Phase 3 — Lưu kết quả theo run

Tất cả insert/update kết quả phải nhận thêm `analysis_run_id`.

Không dùng `TRUNCATE` khi tạo run mới.

Run mới ghi các dòng mới với khóa run mới. Run cũ vẫn giữ nguyên.

Nếu retry cùng một run chưa hoàn tất, chỉ xóa dữ liệu thuộc đúng `analysis_run_id` đó trước khi chạy lại.

### Phase 4 — API đọc dữ liệu

Bổ sung:

```text
GET /api/lot-threshold/runs
GET /api/lot-threshold/runs/:analysisRunId
```

Cập nhật các API kết quả:

```text
GET /api/lot-threshold/optimal?analysisRunId=...
GET /api/lot-threshold/results?analysisRunId=...
```

Quy tắc fallback:

- Nếu có `analysisRunId`, bắt buộc query đúng run đó.
- Nếu không có, lấy run mới nhất phù hợp với source filter.
- Không tự trộn kết quả từ nhiều run khác nhau trong một response nếu không được yêu cầu rõ.

### Phase 5 — Date range và tooltip

Tooltip phải lấy `time_begin/time_end` từ run đang chọn.

Không lấy ngày từ dòng đầu tiên của bảng kết quả.

Nếu Data Source đang chứa nhiều run khác nhau, hiển thị rõ:

```text
Multiple analysis runs
```

hoặc yêu cầu user chọn một Analysis Run cụ thể.

## 5. Frontend changes

### 5.1. Dialog chạy tối ưu hóa

Khi bấm `Khởi chạy tối ưu hóa`, hiển thị dialog:

- Tên lần chạy.
- Multi-select Data Source.
- Cấu hình volume theo symbol.
- Khoảng source được chọn.

Tên run bắt buộc hoặc tự sinh tên mặc định nếu user bỏ trống.

### 5.2. Dropdown Analysis Run

Thêm dropdown riêng:

```text
Analysis Run
```

Option hiển thị:

```text
Recalculate backtest2-5
4 tables · 2026-09-07
2021-05-07 → 2026-02-27
```

Mặc định chọn run mới nhất phù hợp với Data Source.

### 5.3. Data Source filter

Giữ Data Source là bộ lọc bảng:

- All Backtests.
- Một bảng.
- Nhiều bảng.

Khi đổi Data Source:

- Giữ Analysis Run nếu run đó bao gồm source mới.
- Nếu không phù hợp, tự chuyển sang run mới nhất phù hợp.
- Nếu không có run phù hợp, hiển thị trạng thái chưa có dữ liệu.

### 5.4. Kết quả và biểu đồ

Mọi request lấy kết quả phải truyền `analysisRunId`.

Biểu đồ P/D chỉ hiển thị dữ liệu thuộc:

```text
analysisRunId + strategy_id + source_table
```

Ngôi sao vẫn dùng kết quả `lot_threshold_final` của run đang chọn.

Tooltip hiển thị:

```text
Run: Recalculate backtest2-5
Range: 2021-05-07 20:00:00 UTC
        → 2026-02-27 21:54:59 UTC
```

## 6. Công thức không thay đổi

Giữ nguyên toàn bộ thuật toán hiện tại:

- Lấy deal trong common range.
- Loại deal balance/non-trading theo logic hiện tại.
- Tạo volume levels từ volume thực tế.
- `Math.ceil(volume)`.
- Lọc `deal.volume <= lot_threshold`.
- `Trades = Math.floor(deals.length / 2)`.
- Tính Profit, Commission, Swap.
- Tính Max Drawdown hiện tại.
- `P/D = total_profit / max_drawdown`.
- Điều kiện hợp lệ:

```text
total_trades >= 100
max_drawdown >= 100000
```

- Chọn P/D cao nhất trong nhóm hợp lệ.
- Fallback khi không có mức hợp lệ.

Chỉ bổ sung `analysis_run_id` để phân biệt kết quả, không thay đổi cách tính.

## 7. Phân quyền

- User chỉ xem các run thuộc phạm vi dữ liệu/quyền hiện tại.
- Admin xem toàn bộ run.
- Khi tạo run, lưu `created_by`.
- Không cho user thường xóa run của user khác.

## 8. Kiểm thử bắt buộc

### Database

- Tạo bảng run-info.
- Backfill dữ liệu cũ thành legacy run.
- Kiểm tra khóa run không trùng.
- Kiểm tra kết quả cùng strategy/source nhưng khác run vẫn tồn tại độc lập.

### Backend

- Chạy All Backtests.
- Chạy một bảng.
- Chạy nhóm 2–3 bảng.
- Chạy lại nhóm đã từng chạy với dữ liệu strategy mới.
- Kiểm tra các bảng không được chọn không bị xóa.
- Kiểm tra retry cùng run không tạo duplicate.
- Kiểm tra range của từng run.
- Kiểm tra API không trộn kết quả giữa các run.

### Frontend

- Dialog nhập tên run.
- Dropdown run hiển thị đúng name/source/range.
- Đổi Data Source tự chọn run phù hợp.
- Biểu đồ chỉ hiển thị đúng run.
- Ngôi sao đúng theo `lot_threshold_final` của run.
- Tooltip không cộng sai timezone.
- All Backtests với nhiều range hiển thị cảnh báo rõ ràng.

### Regression

- Risk Analysis tab cũ.
- Volume Optimization hiện tại.
- Các API result/status cũ.
- Không ảnh hưởng các công thức Profit/P/D/DD/Trades.
- Không ảnh hưởng các luồng backtest khác.

## 9. Tiêu chí hoàn thành

- Mỗi lần chạy có `analysis_run_id` duy nhất.
- Có thể chạy một hoặc nhiều backtest table.
- Không dùng `TRUNCATE` toàn bộ khi chạy một nhóm bảng.
- Kết quả cũ không bị trộn với kết quả mới.
- Giao diện có Data Source và Analysis Run riêng.
- Tooltip hiển thị đúng range của run.
- Công thức Volume Optimization giữ nguyên.
- Các test database/backend/frontend đều pass.
