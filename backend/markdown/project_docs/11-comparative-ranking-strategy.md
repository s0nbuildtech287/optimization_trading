# Comparative Ranking - Ranking Strategy

## Công dụng

Xếp hạng strategy bằng nhiều chỉ số thay vì chỉ nhìn Net Profit. Tab hỗ trợ tìm kiếm, filter symbol/timeframe/direction/status và drill-down vào strategy.

## Composite Score

```text
Composite = SharpeNorm×16% + PFNorm×16% + RFNorm×16%
          + P/DNorm×18% + ConcentrationNorm×18%
          + EPNorm×8% + LRNorm×8%
```

Các thành phần được chuẩn hóa trước khi cộng. Điểm cao không có nghĩa mọi chỉ số đều cao; tester cần mở breakdown.

## Nội dung hàng xếp hạng

- Rank, Strategy ID, source.
- Composite và điểm thành phần.
- Net Profit, P/D, Sharpe, PF, RF, Expected Payoff, Drawdown.
- Hard/Soft risk status.

## Lưu ý

Không tự tính Composite từ giá trị đã làm tròn trên UI. Dùng dữ liệu API đầy đủ khi đối chiếu.
