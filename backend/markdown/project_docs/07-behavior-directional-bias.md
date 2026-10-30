# Behavior Analysis - Directional Bias

## Công dụng

Đánh giá strategy nghiêng về Buy hay Sell và so sánh hiệu quả hai chiều. Mục tiêu là phát hiện strategy chỉ có edge ở một chiều hoặc phụ thuộc mạnh vào xu hướng thị trường.

## Chỉ số

```text
Buy Profit = Total Net Profit của strategy OB
Sell Profit = Total Net Profit của strategy OS
Buy % = Buy Profit / (Buy Profit + Sell Profit) × 100
Sell % = Sell Profit / (Buy Profit + Sell Profit) × 100
Weak % = MIN(Buy Profit, Sell Profit) / MAX(Buy Profit, Sell Profit) × 100
```

Directional Bias ghép cặp OB/OS cùng base ID và cùng backtest table; trạng thái chính dựa trên profit, không dựa trên số trade. Buy/Sell Breakdown riêng mới đếm deal out. Nhiều lệnh một chiều không nhất thiết xấu nếu chiều đó có kết quả ổn định, nhưng cần được nhận diện.

## Trạng thái thường gặp

- Balanced: hai chiều tương đối cân bằng.
- Directional Bias: lệch đáng kể về một chiều.
- One-Way Edge: lợi thế chủ yếu đến từ một chiều.

## Lưu ý

Directional Bias là mô tả hành vi, không phải lệnh cấm deploy. Cần đọc cùng drawdown và seasonality.
