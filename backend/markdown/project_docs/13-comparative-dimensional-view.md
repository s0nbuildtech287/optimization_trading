# Comparative Ranking - Dimensional View

## Công dụng

So sánh hiệu suất theo các chiều Symbol, Timeframe và Direction nhằm tìm cấu hình thị trường phù hợp nhất.

## Thành phần

- H1 so với H4.
- OB (Buy) so với OS (Sell).
- Tổng hợp theo symbol.
- Profit, Sharpe, PF, P/D và Drawdown trung bình theo nhóm.

## Logic so sánh

Các metric nhóm hiện dùng AVG không trọng số theo strategy, kể cả Profit. H1/H4 winner dùng Avg Profit + Avg Sharpe × 1000 + Avg P/D × 1000; PF và Drawdown không tham gia phép chọn winner.

## Lưu ý

Trung bình không trọng số có thể khác portfolio metric tính trên toàn bộ deal.
