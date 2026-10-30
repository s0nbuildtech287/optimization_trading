# Báo cáo Kiến trúc Database – LotusQuant Optimize

## 1. Tổng quan Database

Database PostgreSQL hiện tại phục vụ hai hệ thống phân tích song song hoàn toàn độc lập nhau, cùng chia sẻ chung nguồn dữ liệu deal gốc.

---

## 2. Nguồn dữ liệu gốc

### Bảng base (BASE TABLE):

| Bảng | Loại | Mô tả |
|------|------|-------|
| `backtest_temp1` | BASE TABLE | Tập dữ liệu deals backtest lần 1 |
| `backtest_temp2` | BASE TABLE | Tập dữ liệu deals backtest lần 2 |

Schema chuẩn của cả hai bảng:
```sql
time        TIMESTAMP
deal        BIGINT
symbol      TEXT
type        TEXT        -- 'buy', 'sell', 'balance'
direction   TEXT        -- 'in', 'out'
volume      NUMERIC
price       NUMERIC
order       BIGINT
commission  NUMERIC
swap        NUMERIC
profit      NUMERIC
comment     TEXT
strategy_id TEXT
PRIMARY KEY (deal, strategy_id)
```

Mỗi dòng là một deal của một strategy, trên một symbol cụ thể.

---

## 3. Hệ thống 1 — LotusQuant App (Dự án hiện tại)

### 3.1 Kiến trúc

```
backtest_temp1 + backtest_temp2
        ↓ (UNION ALL)
    mv_all_backtest          ← Materialized View trung tâm
        ↓
  [Node.js Backend]
        ↓
  [React Frontend]
```

### 3.2 Materialized View trung tâm

`mv_all_backtest` — UNION ALL đơn giản của hai bảng, thêm cột `source_table`:

```sql
SELECT *, 'backtest_temp1' AS source_table FROM backtest_temp1
UNION ALL
SELECT *, 'backtest_temp2' AS source_table FROM backtest_temp2
```

### 3.3 Bảng metadata bổ sung

| Bảng | Mô tả |
|------|-------|
| `strategy_metadata` | Lưu settings, results JSON của từng strategy (parse từ file Excel/Google Drive) |
| `lot_threshold_analysis` | Phân tích ngưỡng volume tối ưu cho từng strategy |
| `lot_threshold_final` | Kết quả cuối: ngưỡng volume tối ưu tốt nhất (P/D cao nhất) |
| `user_preferences` | Preferences lọc của từng user |
| `system_logs` / `error_logs` | Log hệ thống |

### 3.4 Chức năng của hệ thống 1

| Chức năng | Mô tả |
|-----------|-------|
| Sync data | Đồng bộ file Excel từ Google Drive → parse deals → insert vào `backtest_temp1/2` |
| Strategy filter | Lọc strategies theo 12+ chỉ số (P/D, winrate, profit factor, drawdown...) |
| Date range filter | Tính toán động các chỉ số trong khoảng thời gian tùy chọn |
| Dashboard | Biểu đồ profit theo tháng, symbol, risk analysis, behavior analysis |
| Balance chart | Đường cong tài khoản của từng strategy |
| Chatbot AI | Phân tích dữ liệu qua GPT |

---

## 4. Hệ thống 2 — White Lotus Portfolio Management (Sếp xây dựng độc lập)

### 4.1 Mục tiêu

Hệ thống này không phục vụ app, mà phục vụ việc:
- Chuẩn hóa vốn (capital normalization) — quy đổi mỗi strategy về cùng một mức vốn chuẩn để so sánh công bằng
- Phân bổ vốn tối ưu — tính ra mỗi strategy cần giao dịch bao nhiêu lot để toàn portfolio đạt mức rủi ro target
- Báo cáo KPI tổng hợp — P/D, MDD, SQN score, Sharpe ratio của toàn bộ hệ thống White Lotus

### 4.2 Điều kiện lọc đầu vào (từ `lot_threshold_final`)

Chỉ những strategy thỏa mãn đồng thời:
- `best_pd >= 2` — chỉ số P/D tốt nhất của strategy phải ≥ 2
- `total_trades >= 100` — phải có ít nhất 100 lần giao dịch

### 4.3 Khoảng thời gian phân tích và điểm kết nối với `mv_all_backtest`

Bước đầu tiên của pipeline White Lotus có truy vấn vào `mv_all_backtest` để tính khoảng thời gian giao nhau:

```sql
WITH min_max_time_symbol_backtest_name AS (
  SELECT mv_all_backtest.source_table,
         mv_all_backtest.symbol,
         MIN("time") AS min_time,
         MAX("time") AS max_time
  FROM mv_all_backtest    -- ← Dùng mv_all_backtest ở đây
  GROUP BY source_table, symbol
)
```

Mục đích: tính `time_begin = MAX(min_time)` và `time_end = MIN(max_time)` để lấy giai đoạn mà mọi symbol đều có data, đảm bảo so sánh công bằng giữa các strategy.

Ví dụ nếu BTCUSD có data từ 2021-05 còn XAGUSD từ 2021-10, thì chỉ lấy giao nhau từ 2021-10 trở đi.

Sau bước này, data deal thực tế được lấy trực tiếp từ `backtest_temp1` / `backtest_temp2`, không đi qua `mv_all_backtest` nữa.

### 4.4 Pipeline 3 lớp chuẩn hóa vốn

```
Lớp 1: Chuẩn hóa theo Strategy
  strategy_tunning_rate = 1,000,000 / MDD_strategy
  → profit_x_tr = profit × strategy_tunning_rate
  (Mỗi strategy được scale lên như thể có vốn $1M)

        ↓

Lớp 2: Chuẩn hóa theo Symbol
  symbol_tunning_rate = 1,000,000 / MDD_symbol
  → profit_x_tr_str = profit_x_tr × symbol_tunning_rate
  (Mỗi nhóm symbol (BTCUSD, XAGUSD...) được scale lên $1M)

        ↓

Lớp 3: Chuẩn hóa theo System
  system_tunning_rate = 1,000,000 / MDD_system
  → profit_x_tr_str_sytr = profit_x_tr_str × system_tunning_rate
  (Toàn bộ hệ thống được scale lên $1M, sau đó White Lotus scale về $400K)
```

### 4.5 Danh sách Materialized Views

| View | Mô tả |
|------|-------|
| `backtest_temp1_upscale_by_st_tunning_rate` | backtest1 sau khi scale theo strategy (lớp 1) |
| `backtest_temp1_upscale_by_tr_str_sytr` | backtest1 sau khi scale cả 3 lớp |
| `backtest_temp2_upscale_by_st_tunning_rate` | backtest2 sau khi scale theo strategy (lớp 1) |
| `backtest_temp2_upscale_by_tr_str_sytr` | backtest2 sau khi scale cả 3 lớp |
| `white_lotus_drawdown` | Gộp backtest1+2 đã scale, tính cumulative profit & drawdown |
| `white_lotus_add_tunning_rate` | KPI cuối cùng của White Lotus portfolio (1 dòng duy nhất) |

### 4.6 Output của `white_lotus_add_tunning_rate`

View này trả về 1 dòng duy nhất chứa toàn bộ chỉ số của White Lotus portfolio sau khi đã chuẩn hóa vốn:

| Cột | Ý nghĩa |
|-----|---------|
| `total_profit_wl` | Tổng lợi nhuận toàn bộ White Lotus |
| `mdd` | Max Drawdown của White Lotus |
| `no_strategies` | Số strategies tham gia (4.658 strategies) |
| `total_trades` | Tổng số lần giao dịch (~1.5M trades) |
| `sqn_score` | System Quality Number — chỉ số chất lượng hệ thống (≈113, rất cao) |
| `pd` | P/D ratio tổng hợp (≈161) |
| `wl_tunning_rate` | 400,000 / MDD — tỷ lệ scale về vốn $400K |
| `sharpe_daily` | Sharpe ratio tính theo ngày |
| `sharpe_d_anualized` | Sharpe ratio annualized theo ngày |
| `sharpe_weekly` | Sharpe ratio tính theo tuần |
| `sharpe_w_annualized` | Sharpe ratio annualized theo tuần |

---

## 5. So sánh tổng quan hai hệ thống

| Tiêu chí | Hệ thống 1 (App) | Hệ thống 2 (White Lotus) |
|----------|-----------------|--------------------------|
| Mục đích | Tìm kiếm, lọc, phân tích strategy | Phân bổ vốn, báo cáo portfolio |
| Người dùng | Trader dùng qua web app | Sếp query trực tiếp |
| Cách truy cập | REST API → React UI | Trực tiếp trong PostgreSQL |
| Đơn vị phân tích | Từng strategy riêng lẻ | Toàn bộ portfolio gộp |
| View dùng | `mv_all_backtest` | `white_lotus_add_tunning_rate` |
| Kết quả | Nhiều dòng (mỗi strategy 1 dòng) | 1 dòng KPI tổng hợp |
| Liên kết nhau | Không trực tiếp | Không trực tiếp |

---

## 6. Quan hệ phụ thuộc dữ liệu

```
backtest_temp1 ────────────────────────────── backtest_temp2
│                                                     │
│ (UNION ALL)                             (UNION ALL) │
└─────────────────────┬───────────────────────────────┘
                      │
              mv_all_backtest              lot_threshold_final
              (Materialized View)         (Kết quả tối ưu volume)
              │                                  │
              ├── [LotusQuant App]               │
              │   (trung tâm mọi query)           │
              │                                  │
              └── (chỉ dùng để tính time range) ─┤
                                                 │
                  backtest_temp1_upscale_by_st_tunning_rate
                  backtest_temp2_upscale_by_st_tunning_rate
                  (lọc theo lot_threshold_final + time range)
                                  │
                  backtest_temp1_upscale_by_tr_str_sytr
                  backtest_temp2_upscale_by_tr_str_sytr
                  (scale theo symbol + system)
                                  │
                         white_lotus_drawdown
                         (gộp 2 backtest, tính drawdown)
                                  │
                     white_lotus_add_tunning_rate
                     (KPI cuối: 1 dòng tổng hợp)
                        [White Lotus Portfolio]
```

---

## 7. Kết luận

Hai hệ thống tách biệt về logic và mục đích, chỉ share:
- Cùng một PostgreSQL database
- Cùng nguồn data gốc (`backtest_temp1`, `backtest_temp2`)
- `mv_all_backtest` được White Lotus dùng 1 lần duy nhất để tính time range giao nhau
- Bảng `lot_threshold_final` (kết quả tối ưu volume) dùng chung

LotusQuant App hiện tại không cần biết và không cần động vào các White Lotus views. Đây là hai hệ thống độc lập phục vụ hai nhu cầu khác nhau trên cùng một bộ dữ liệu backtest.
