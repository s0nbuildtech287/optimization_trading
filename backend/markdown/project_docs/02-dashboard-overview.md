# Dashboard - Overview

## Công dụng

Overview cung cấp ảnh chụp tổng thể về quy mô dữ liệu, hiệu suất, chất lượng strategy và xu hướng lợi nhuận. Đây là màn hình kiểm tra nhanh trước khi đi sâu vào Risk, Behavior hoặc Comparative Ranking.

## Bộ lọc chung

1. Chọn một hoặc nhiều Data Source trong thanh lọc Dashboard.
2. Chọn Full Period hoặc Date Range.
3. Nhấn refresh khi muốn bỏ cache và gọi dữ liệu mới.
4. Xác nhận nhãn nguồn dữ liệu và khoảng ngày trên các thành phần.

## Thành phần chính

- KPI Summary: Total Strategies, Total Trades, Net Profit, Win Rate, Profit Factor, Sharpe, Drawdown và các KPI tổng hợp.
- Monthly Profit: lợi nhuận theo tháng.
- Yearly Comparison: so sánh lợi nhuận theo năm.
- Top Stats: strategy/symbol có kết quả nổi bật.
- Breakdown: phân bổ theo symbol, timeframe, direction hoặc backtest.
- Behavior Summary: tóm tắt nhanh các tín hiệu hành vi.
- Comparative Summary: dữ liệu xếp hạng/so sánh rút gọn.

Các khối dùng API riêng và tải độc lập. Card nào có dữ liệu trước phải hiển thị trước; một chart chậm không được khóa toàn trang.

## Công thức cần đối chiếu

```text
Overview Total Profit = SUM(profit)
Overview Win Rate = COUNT(direction = out AND profit > 0) / COUNT(direction = out) × 100
Overview Average Profit / Deal = AVG(profit)
Commission và Swap được trả thành trường riêng
```

Các Average Risk Metrics lấy từ metadata Full Period của strategy có Total Trades >= 100, kể cả khi đang chọn Date Range. Card Total Net Profit hiện dùng SUM(profit), không cộng Commission và Swap.

## Lưu ý

- Dữ liệu sau sync chỉ được coi là mới khi tác vụ sync hoàn tất và cache liên quan đã được xóa.
- Không so sánh KPI Full Period từ metadata với KPI Date Range tính từ deal mà không ghi rõ phạm vi.
- Nếu không chọn nguồn, trạng thái đúng là yêu cầu chọn nguồn; không được hiển thị số 0 như dữ liệu thật.
