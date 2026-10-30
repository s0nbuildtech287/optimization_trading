# Thuật ngữ và công thức dùng chung

## Phạm vi dữ liệu

- Data Source / Backtest Table: một bảng backtest cụ thể thuộc một user.
- All Backtests: hợp nhất các bảng người dùng được phép truy cập bằng truy vấn `UNION ALL`; không phải dữ liệu trung bình giả lập.
- Full Period: dùng toàn bộ thời gian có trong nguồn dữ liệu.
- Date Range: chỉ tính deal nằm trong khoảng ngày được chọn; kết quả có thể khác chỉ số tĩnh trong metadata.
- Strategy: nhận diện bằng `strategy_id`; khi xem nhiều bảng phải kèm `backtest_table` để tránh nhầm hai strategy trùng ID.
- Trade và Deal: một trade hoàn chỉnh thường có deal vào và deal ra. Nhiều thống kê `Total Trades` đếm deal đóng (`Direction = out`), không đếm cả hai chân.

## Công thức lợi nhuận

```text
P/L có chi phí = Profit + Commission + Swap

Lưu ý: Overview, Monthly, Yearly và Behavior hiện dùng SUM(profit) ở nhiều query; Strategies Date Range, Comparative Date Range và Volume Optimization mới dùng Profit + Commission + Swap. Full Period đọc Results MT5.
```

## Win Rate

```text
Dashboard Win Rate = deal out có profit > 0 / tổng deal out × 100
Strategies Date Range Win Rate = dòng có P/L có chi phí dương / tổng dòng không phải balance × 100
```

Trade hòa vốn không được tính là trade thắng. Tester cần phân biệt số đã làm tròn trên UI với tỷ lệ gốc.

## Profit Factor

```text
Profit Factor = Gross Profit / |Gross Loss|
```

- `PF > 1`: tổng lãi lớn hơn tổng lỗ.
- Không có gross loss có thể được xử lý thành `null`, giá trị đặc biệt hoặc giới hạn tùy API; không tự suy diễn là lỗi.

## Drawdown

```text
Cumulative Profit(t) = tổng Net Profit đến thời điểm t
Running Peak(t) = giá trị lớn nhất của Cumulative Profit từ đầu đến t
Drawdown(t) = Running Peak(t) - Cumulative Profit(t)
Max Drawdown = max(Drawdown(t))
Drawdown (%) = Max Drawdown / Initial Deposit × 100
```

Với metadata MT5, UI có thể đọc trực tiếp `balanceDrawdownMaximal`, gồm giá trị tiền và phần trăm trong ngoặc.

## P/D Ratio và Recovery Factor

```text
P/D Ratio = Total Net Profit / Max Drawdown
Recovery Factor = Total Net Profit / Max Drawdown
```

Hai chỉ số có thể trùng về công thức trong dữ liệu tính động. Với file MT5, Recovery Factor có thể là giá trị MT5 cung cấp còn P/D được hệ thống tính lại từ Net Profit và Balance Maximal Drawdown.

## Sharpe Ratio

Trong tính động, hệ thống chuẩn hóa lợi nhuận theo chuỗi trade và độ lệch chuẩn. Ý nghĩa chung:

```text
Sharpe động = AVG(P/L) / STDDEV(P/L) × SQRT(số dòng / MAX(số năm dữ liệu, 0.1))
```

Sharpe càng cao thì lợi nhuận trên một đơn vị biến động càng tốt. Không so sánh hai Sharpe nếu phạm vi ngày hoặc tập strategy khác nhau.

## Largest Loss Trade

Full Period đọc Largest Loss Trade từ Results MT5. Date Range lấy MIN(Profit + Commission + Swap) trên dòng không phải balance. Trên UI thường hiển thị số âm. Điều kiện “không lỗ quá 20,000” tương đương:

```text
Largest Loss Trade >= -20,000
```

## Chỉ số hành vi

```text
HTR = Average Losing Holding Time / Average Winning Holding Time
VEI = Average Lot sau chuỗi 3 lệnh thua / Base Lot
Exit % = số trade thuộc lý do thoát / tổng trade đóng × 100
```

- HTR `<= 1.5`: an toàn; `(1.5, 2.0]`: cảnh báo; `> 2.0`: gồng lỗ đáng kể.
- VEI `<= 1.0`: an toàn; `(1.0, 1.2]`: cảnh báo; `> 1.2`: nguy cơ tăng lot/Martingale.

## Composite Score của Comparative Ranking

Sau khi từng thành phần được chuẩn hóa về thang điểm, điểm tổng hợp hiện tại dùng trọng số:

```text
Composite = Sharpe×16% + ProfitFactor×16% + RecoveryFactor×16%
          + P/D×18% + Concentration×18% + ExpectedPayoff×8%
          + LR Correlation×8%
```

Không được tính trực tiếp bằng các giá trị thô vì mỗi thành phần có hàm chuẩn hóa riêng.

## Làm tròn và dữ liệu thiếu

- `0` là một giá trị; `null`, `N/A`, `-` là thiếu dữ liệu hoặc không áp dụng.
- UI có thể làm tròn 2 chữ số; tổng các phần trăm sau làm tròn có thể lệch 0.01–0.1%.
- Khi mẫu quá nhỏ, chỉ số vẫn có thể tính được nhưng độ tin cậy thấp.
