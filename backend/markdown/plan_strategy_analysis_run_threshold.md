# Plan: Áp dụng Analysis Run và Lot Threshold cho Strategies tab

## 1. Mục tiêu nghiệp vụ

Cho phép Strategies tab hiển thị và tính lại kết quả strategy dựa trên một lần chạy Volume Optimization đã hoàn tất.

Khi user chọn một Analysis Run, hệ thống phải đồng thời áp dụng:

1. Khoảng thời gian `time_begin -> time_end` của Analysis Run.
2. `lot_threshold` tối ưu riêng của từng `strategy_id + source_table` trong Run đó.
3. Bộ deal còn lại sau khi lọc theo thời gian và volume.
4. Tính lại các metrics của Strategies tab từ dữ liệu deal đã lọc.

Điều kiện lọc volume hiện tại của Volume Optimization phải được giữ nguyên:

```text
Giữ deal nếu volume <= lot_threshold
Loại deal nếu volume > lot_threshold
```

Không được hiểu threshold là mức volume tối thiểu.

---

## 2. Hành vi sau khi triển khai

### 2.1. Không chọn Analysis Run

Giữ nguyên luồng hiện tại:

- Không lọc volume theo threshold.
- Không áp dụng time range của Analysis Run.
- Strategies tab dùng Full Period hoặc Date Range thủ công hiện tại.
- Không thay đổi kết quả cũ.

### 2.2. Có chọn Analysis Run

Ví dụ Run có:

```text
time_begin = 2021-05-07
time_end   = 2026-02-27
strategy   = 109BTCUSDH1OB
threshold  = 8 lots
```

Hệ thống chỉ dùng các deal thỏa:

```sql
type <> 'balance'
AND time >= time_begin
AND time <= time_end
AND volume <= 8
```

Sau đó tính lại metrics từ các deal còn lại.

Kết quả tại threshold tối ưu phải được lưu thành snapshot ngay trong lúc Analysis Run
hoàn tất. Strategies tab không được tính lại toàn bộ deals mỗi lần user mở trang.

### 2.3. Quan hệ Data Source và Analysis Run

Data Source là bộ lọc chính.

- Chọn `backtest_1`: chỉ hiển thị Run có `source_tables` đúng bằng `{backtest_1}`.
- Chọn `backtest_1 + backtest_2`: chỉ hiển thị Run có đúng cả hai bảng.
- Không được hiển thị Run của `{backtest_1 + backtest_2}` khi chỉ chọn `backtest_1`.
- Nếu không có Run phù hợp, dropdown Run để trạng thái rỗng và hiển thị thông báo rõ ràng.
- Không tự động chuyển Data Source sang Run khác.
- Khi đổi Data Source làm Run hiện tại không còn phù hợp, phải clear Run hiện tại.

So sánh source phải dùng tập đã normalize và sort, không phụ thuộc thứ tự chọn:

```text
backtest_1 + backtest_2
```

và:

```text
backtest_2 + backtest_1
```

được coi là cùng một tập nguồn.

---

## 3. Backend API

### 3.1. Mở rộng API Strategies

Bổ sung tham số tùy chọn:

```text
analysis_run_id
```

Ví dụ:

```text
GET /api/strategies?
  backtest_table=backtest_1,backtest_2&
  analysis_run_id=run-lot-02&
  page=1&
  pageSize=20
```

API Date Range cũng nhận cùng tham số:

```text
GET /api/strategies/by-time-range?
  backtest_table=backtest_1,backtest_2&
  analysis_run_id=run-lot-02&
  start_date=...&
  end_date=...
```

Nếu có `analysis_run_id`, backend phải lấy time range từ DB của Run. Không tin tưởng `start_date/end_date` do frontend gửi để thay thế range đã lưu của Run.

### 3.2. Kiểm tra Analysis Run

Backend phải kiểm tra:

1. Run tồn tại.
2. Run có trạng thái `COMPLETED`.
3. Run có `time_begin` và `time_end` hợp lệ.
4. `source_tables` của Run khớp chính xác với Data Source request.
5. Run có dữ liệu threshold.

Nếu không đạt điều kiện, trả lỗi nghiệp vụ rõ ràng, ví dụ:

```text
ANALYSIS_RUN_NOT_FOUND
ANALYSIS_RUN_NOT_COMPLETED
ANALYSIS_RUN_SOURCE_MISMATCH
ANALYSIS_RUN_NO_THRESHOLD_DATA
```

Không được silently fallback sang Full Period hoặc Run khác.

---

## 4. Truy vấn và liên kết dữ liệu

Nguồn threshold:

```text
lot_threshold_final
```

Khóa liên kết:

```text
analysis_run_id
strategy_id
source_table
```

Không chỉ join bằng `strategy_id`, vì cùng một strategy có thể xuất hiện ở nhiều bảng backtest.

Logic dữ liệu:

```sql
WITH selected_thresholds AS (
  SELECT
    analysis_run_id,
    strategy_id,
    source_table,
    lot_threshold
  FROM lot_threshold_final
  WHERE analysis_run_id = $1
), filtered_deals AS (
  SELECT
    d.*,
    t.lot_threshold
  FROM selected_backtest_table d
  INNER JOIN selected_thresholds t
    ON t.strategy_id = d.strategy_id
   AND t.source_table = d.source_table
  WHERE d.type <> 'balance'
    AND d.time >= $2
    AND d.time <= $3
    AND d.volume <= t.lot_threshold
)
SELECT ...
FROM filtered_deals
GROUP BY strategy_id, source_table;
```

Thực tế phải dùng whitelist tên bảng/backtest source hiện có. Không nội suy tên bảng trực tiếp từ input chưa validate.

---

## 5. Metrics phải tính lại

Khi Analysis Run được chọn, không lấy metrics Full Period từ `strategy_metadata.results`.

Các metrics phải tính lại từ filtered deals:

- Profit / Total Net Profit:

```text
SUM(profit + commission + swap)
```

- Trades:

```text
FLOOR(valid_deals.length / 2)
```

Giữ nguyên quy ước Trades hiện tại của hệ thống.

- Max Drawdown:

Tính lại theo equity/balance drawdown đang được Strategies Date Range sử dụng; không lấy lại giá trị cũ từ Full Period.

- Profit Factor:

```text
gross_profit / abs(gross_loss)
```

- Recovery Factor:

```text
net_profit / max_drawdown_amount
```

- Sharpe Ratio:

Sử dụng đúng công thức Date Range hiện tại của `strategyTimeRangeDao.js`.

- P/D Ratio:

```text
net_profit / max_drawdown_amount
```

- Win Rate và các metrics đang được Strategies tab hiển thị:

Tính lại từ cùng tập filtered deals, không trộn dữ liệu Full Period.

Nếu không có deal sau khi lọc:

- Trả trạng thái `NO_DATA_AFTER_THRESHOLD`.
- Metrics hiển thị `-` hoặc `null`.
- Không đánh giá strategy là Passed.

### 5.1. Lưu snapshot đầy đủ tại threshold tối ưu

`lot_threshold_final` hiện tại chỉ lưu một phần metrics. Để Strategies tab có thể
filter/sort đủ các chỉ số mà không quét lại hàng nghìn strategy, chỉ cần bổ sung các
cột metrics còn thiếu trực tiếp vào bảng final hiện tại.

```text
lot_threshold_final
```

Mỗi dòng đại diện cho một:

```text
analysis_run_id + strategy_id + source_table
```

Các cột metrics phải là cột số riêng, không gộp vào một JSONB metrics duy nhất:

```text
analysis_run_id
strategy_id
source_table
symbol
lot_threshold
profit
trades
drawdown
profit_factor
recovery_factor
sharpe_ratio
pd_ratio
largest_loss_trade
largest_profit_trade
largest_profit_trade_ratio
risk_reward_ratio
lr_correlation
avg_profit
avg_loss
winrate
time_begin
time_end
is_fallback
computed_at
```

Có thể có thêm `metadata_json` cho thông tin phụ như version công thức, số deal đầu
vào và initial deposit, nhưng JSONB không được dùng thay cho các cột metrics chính.

Trong lúc Volume Optimization chạy, sau khi xác định `bestResult` cho strategy:

1. Giữ nguyên việc ghi `lot_threshold_final` để Volume Optimization hoạt động như cũ.
2. Tính đủ toàn bộ metrics từ cùng tập deals đã lọc bởi time range và threshold.
3. Ghi toàn bộ metrics vào cùng dòng `lot_threshold_final`.
4. Dùng khóa duy nhất `(analysis_run_id, strategy_id, source_table)` để upsert an toàn.

Strategies tab khi có `analysis_run_id` chỉ đọc bảng snapshot này để filter, sort và
phân trang. Không load lại toàn bộ deals và không tính lại hàng loạt trong request UI.

Các công thức snapshot phải dùng chung với `strategyTimeRangeDao.js`:

- `volume <= lot_threshold`.
- `time >= time_begin` và `time <= time_end` theo quy ước hiện tại.
- Loại deal `balance`.
- Trades = `FLOOR(validDeals / 2)`.
- P/D = Net Profit / Max Drawdown Amount.
- Drawdown, PF, Recovery, Sharpe dùng cùng công thức Date Range hiện tại.
- Largest Loss Trade giữ đúng quy ước dấu hiện tại của Strategies tab.

Không được ghi snapshot vào `strategy_metadata.results`, vì đó là kết quả Full Period
gốc.

---

## 6. Fallback threshold

`lot_threshold_final` có thể chứa kết quả fallback qua cột `is_fallback`.

Quy tắc:

- Vẫn sử dụng threshold fallback nếu Run đã hoàn tất và threshold hợp lệ.
- Trả thêm metadata `is_fallback` để frontend hiển thị cảnh báo.
- Không tự chọn threshold của Run khác.
- Không tự dùng `SYMBOL_VOLUME_CAPS` thay cho threshold đã lưu của strategy.

---

## 7. Frontend Strategies tab

### 7.1. Data Source dropdown

Đổi sang cơ chế multi-select đồng bộ với Volume Optimization:

- Select một bảng.
- Select nhiều bảng.
- Select All dùng sentinel `all_backtests`.
- Hiển thị tên bảng đã chọn rõ ràng.
- Normalize và sort source trước khi gọi API.

Nên tái sử dụng component/helper chung thay vì copy logic dropdown ở nhiều tab.

### 7.2. Analysis Run dropdown

Thêm dropdown Analysis Run cạnh Data Source.

Dropdown chỉ hiển thị các Run có `source_tables` khớp chính xác với Data Source hiện tại.

Hiển thị:

```text
Volume OP 2026-09-08 08:36 "backtest_1 + backtest_2"
```

Khi chọn Run:

1. Lưu `analysis_run_id` vào state.
2. Lấy time range của Run từ API hoặc response Run list.
3. Gọi lại Strategies API.
4. Hiển thị badge cho biết đang áp dụng lot threshold.
5. Hiển thị mốc thời gian đang dùng.

Khi bỏ chọn Run:

- Xóa `analysis_run_id`.
- Quay lại Full Period hoặc Date Range thủ công hiện tại.

### 7.3. Hiển thị kết quả

Mỗi strategy cần có metadata:

```json
{
  "analysis_run_id": "run-lot-02",
  "analysis_run_name": "Volume OP 2026-09-08 08:36 \"backtest_1\"",
  "threshold_applied": 8,
  "is_fallback_threshold": false,
  "time_begin": "...",
  "time_end": "...",
  "metrics_mode": "ANALYSIS_RUN_THRESHOLD"
}
```

Không ghi đè kết quả Full Period trong DB. Đây là kết quả hiển thị/tính toán theo context của request.

---

## 8. Tương thích với các filter hiện tại

Các filter của Strategies tab vẫn hoạt động sau khi metrics được tính lại:

- Profit.
- Trades.
- Drawdown.
- Profit Factor.
- Recovery Factor.
- Sharpe Ratio.
- P/D Ratio.
- Largest Loss Trade.
- Symbol, timeframe, strategy search.

Thứ tự xử lý phải là:

```text
Source selection
→ Analysis Run validation
→ Time range filter
→ Volume threshold filter
→ Metrics calculation
→ Apply metric filters
→ Sort / paginate
```

Không lọc strategy trước bằng Full Period metrics rồi mới tính lại, vì có thể làm mất những strategy đạt điều kiện sau khi áp dụng threshold.

---

## 9. Hiệu năng và index

Kiểm tra hoặc bổ sung index phù hợp cho:

```text
lot_threshold_final(analysis_run_id, strategy_id, source_table)
lot_threshold_analysis_runs(analysis_run_id, status)
strategy_metadata(strategy_id, backtest_table)
```

Các bảng backtest cần index hỗ trợ:

```text
(strategy_id, time)
(strategy_id, time, volume)
```

Không load toàn bộ deals của tất cả strategy vào Node.js cùng lúc. Ưu tiên:

- Tính aggregate trong PostgreSQL.
- Phân trang ở cấp strategy.
- Chỉ lấy deals của các strategy thuộc page hiện tại.
- Giới hạn concurrency nếu cần xử lý nhiều strategy.

Cache key phải bao gồm:

```text
source set
analysis_run_id
time range
filter config
page
sort
```

Không dùng cache Full Period cho request có Analysis Run.

---

## 10. API response và lỗi nghiệp vụ

Response nên phân biệt rõ:

```json
{
  "mode": "ANALYSIS_RUN_THRESHOLD",
  "analysisRunId": "run-lot-02",
  "timeRange": {
    "from": "...",
    "to": "..."
  },
  "thresholdApplied": true,
  "data": [],
  "pagination": {}
}
```

Các trạng thái cần hỗ trợ:

- `FULL_PERIOD`.
- `DATE_RANGE`.
- `ANALYSIS_RUN_THRESHOLD`.
- `NO_DATA_AFTER_THRESHOLD`.
- `ANALYSIS_RUN_SOURCE_MISMATCH`.
- `ANALYSIS_RUN_NO_THRESHOLD_DATA`.

---

## 11. Không ảnh hưởng luồng cũ

Phải giữ nguyên khi:

- Không truyền `analysis_run_id`.
- User chỉ chọn một backtest table.
- User dùng Date Range thủ công.
- User dùng các filter Strategies cũ.
- Volume Optimization chạy lại một Analysis Run mới.
- Xóa Analysis Run.

Khi xóa Analysis Run đang được Strategies tab sử dụng:

- API trả trạng thái Run không tồn tại.
- Frontend clear Run hiện tại.
- Strategies tab quay về Full Period.
- Không xóa hoặc thay đổi `strategy_metadata.results` gốc.

---

## 12. Kế hoạch triển khai

### Phase 1 — Backend contract

- Thêm `analysis_run_id` vào API request.
- Thêm API lấy Analysis Runs theo source set.
- Validate exact source set và trạng thái Run.
- Chưa thay đổi công thức cũ.

### Phase 2 — Backend calculation

- Join `lot_threshold_final` theo đủ ba khóa.
- Áp dụng time range của Run.
- Lọc `volume <= lot_threshold`.
- Tính đủ metrics theo `strategyTimeRangeDao.js`.
- Lưu snapshot metrics dạng các cột riêng trực tiếp vào `lot_threshold_final`.
- Bổ sung trạng thái và metadata response.

### Phase 3 — Frontend Data Source/Run

- Đồng bộ multi-select Data Source.
- Thêm dropdown Analysis Run.
- Lọc Run theo exact source set.
- Clear Run khi source không khớp.
- Hiển thị context đang áp dụng.

### Phase 4 — Hiệu năng và cache

- Bổ sung/kiểm tra index.
- Cache key riêng cho Analysis Run.
- Strategies tab đọc snapshot, không tính lại toàn bộ theo page request.
- Chỉ dùng recalculation on-demand cho các Run cũ chưa có snapshot đầy đủ.

### Phase 5 — Regression test

- Full Period không thay đổi.
- Date Range thủ công không thay đổi.
- Một source + Run tương ứng.
- Nhiều source + Run tương ứng.
- Source không có Run.
- Strategy có fallback threshold.
- Strategy không có threshold.
- Không có deal sau khi lọc.
- Xóa Run đang được chọn.
- So sánh snapshot metrics với kết quả trực tiếp từ filtered deals.
- Kiểm tra Strategies tab không query lại toàn bộ deals khi snapshot đã tồn tại.

---

## 13. Tiêu chí nghiệm thu

- Threshold được join đúng theo `analysis_run_id + strategy_id + source_table`.
- Deal bị loại đúng khi `volume > threshold`.
- Deal ngoài time range bị loại.
- Metrics được tính lại từ filtered deals.
- P/D, DD, Profit, Trades và các metrics khác không lấy nhầm Full Period.
- Data Source và Analysis Run chỉ ghép được khi source set khớp chính xác.
- Không có Run phù hợp thì không tự fallback sang Run khác.
- Không chọn Run thì hệ thống hoạt động y hệt hiện tại.
- Không thay đổi dữ liệu gốc trong `strategy_metadata`.
- Không làm thay đổi công thức hoặc kết quả Volume Optimization hiện tại.
