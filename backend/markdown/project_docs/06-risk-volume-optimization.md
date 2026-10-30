# Risk Analysis - Volume Optimization

## Công dụng

Volume Optimization thử nhiều ngưỡng lot/volume cho từng strategy, lưu toàn bộ candidate trong `lot_threshold_analysis` và lưu lựa chọn đang dùng trong `lot_threshold_final`. User có thể chọn một candidate khác làm phương án tối ưu.

## Luồng sử dụng

1. Chọn đúng Data Source.
2. Chọn Analysis Run thuộc chính xác tập nguồn hiện tại.
3. Nếu chưa có run, khởi chạy và đặt tên dễ nhận biết.
4. Chờ run hoàn tất rồi xem đường Profit, Drawdown/P-D theo lot threshold.
5. Nhấn điểm/đường trắng của candidate muốn chọn.
6. Xác nhận trong modal; ngôi sao chuyển sang candidate mới.

## Dữ liệu và ràng buộc

- Mỗi strategy có nhiều candidate analysis.
- Mỗi strategy trong một run chỉ có một candidate `the_chosen_one = true`.
- Bảng final chứa snapshot/chỉ số đầy đủ của lựa chọn hiện tại để phục vụ filter nhanh ở trang Strategies.
- Khi đổi lựa chọn, candidate mới thành chosen; candidate cũ trở thành false và final được cập nhật tương ứng.

## Công thức chính

```text
P/L = Profit + Commission + Swap
Net Profit = SUM(P/L) với Volume <= ngưỡng
Total Trades = FLOOR(số dòng / 2)
Win Rate = số dòng có P/L > 0 / tổng số dòng × 100
Max Drawdown = max(Running Peak - Cumulative Profit)
P/D = Net Profit / Max Drawdown

Candidate tự động phải có Total Trades >= 100 và Max Drawdown >= 100000; chọn P/D cao nhất, hòa thì chọn Profit cao hơn. Không có candidate đạt sẽ dùng fallback.
```

## Lưu ý

- Chọn candidate không chạy lại toàn bộ analysis; đây là đổi lựa chọn trong cùng run.
- Không so sánh candidate thuộc hai run khác nhau nếu nguồn hoặc date range khác nhau.
- Không xóa run đang được dùng khi chưa đánh giá ảnh hưởng tới filter đã lưu.
