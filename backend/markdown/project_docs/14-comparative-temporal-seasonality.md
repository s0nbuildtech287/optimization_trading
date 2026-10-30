# Comparative Ranking - Temporal & Seasonality

## Công dụng

Phân tích hiệu suất theo giờ, thứ, tháng, quý và năm để nhận biết seasonality, khoảng giao dịch tốt/xấu và độ ổn định dài hạn.

## Thành phần

- Heatmap theo giờ trong ngày.
- Heatmap theo thứ trong tuần.
- Heatmap theo tháng.
- Annual Stability theo strategy.
- Quarterly Seasonality Q1–Q4.

## Công thức

```text
Profit ô thời gian = SUM(profit) của deal out
Win Rate ô = deal out có profit > 0 / tổng deal out × 100
Quarter Profit = SUM(profit) của deal out trong quý
```

Q1: tháng 1–3; Q2: 4–6; Q3: 7–9; Q4: 10–12.

## Cách dùng

1. Chọn metric Profit hoặc Win Rate trên heatmap.
2. Hover để xem số liệu gốc.
3. Lọc stability/strategy trong bảng năm.
4. Chuyển chế độ tổng hợp hoặc từng năm ở quarterly.

## Lưu ý

Commission và Swap không được cộng trong heatmap hiện tại. Annual Stability chỉ xét năm 2019-2026 và stable khi ít nhất 5 năm có profit dương.
