# Behavior Analysis - Trading Activity

## Công dụng

Phân tích tần suất giao dịch, khoảng lặng và việc strategy có giao dịch sai khung thời gian thể hiện trong comment deal hay không.

## Nội dung

- Số trade theo giờ/ngày/tháng.
- Max gap giữa hai trade liên tiếp.
- Số tháng không có lệnh.
- Timeframe mismatch từ comment `_H1_` hoặc `_H4_`.
- Trạng thái hoạt động: ổn định, seasonal, volatile hoặc dormant.

## Công thức

```text
Max Gap = max(Time[n] - Time[n-1]) trên deal out
Zero Months = số tháng trong khoảng hoạt động - số tháng có deal
Strategy H1: Mismatch Ratio = H4 Count / H1 Count
Strategy H4: Mismatch Ratio = H1 Count / H4 Count
```

Critical khi gap >= 40 ngày hoặc có ít nhất 6 tháng rỗng. Mismatch là Severe từ ratio 3, TimeframeMismatch từ 1.5 và Moderate khi thấp hơn nhưng có mismatch.

## Lưu ý

Tháng không giao dịch có thể do chiến lược thiết kế theo mùa, không tự động là lỗi.
