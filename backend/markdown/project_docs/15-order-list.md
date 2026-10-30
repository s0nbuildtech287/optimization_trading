# Order List

## Công dụng

Order List hiển thị deal/order chi tiết của strategy và là lớp dữ liệu gốc để đối chiếu chart, KPI và thống kê tính động.

## Cách dùng

1. Chọn Backtest Table.
2. Chọn Strategy ID hoặc dùng bộ lọc.
3. Chọn thời gian nếu cần.
4. Xem danh sách deal và tổng số liệu.
5. Dùng tải file/log khi thao tác tương ứng hoàn tất.

## Các cột thường dùng

- Time, Deal, Order, Symbol.
- Type (buy/sell/balance), Direction (in/out).
- Volume, Price, Commission, Swap, Profit.
- Comment và Strategy ID.

## Quy tắc đối chiếu

```text
Total Orders = COUNT(*) sau khi bỏ balance
Total Profit = SUM(profit)
Total Commission = SUM(commission)
Total Swap = SUM(swap)
Win Rate = deal out có profit > 0 / tổng deal out × 100
```

Card Total Net Profit hiện hiển thị SUM(profit), không cộng Commission và Swap. Một trade có thể gồm deal vào và deal ra. Vì vậy số dòng Order List có thể lớn hơn Total Trades trên Strategies.

## Lưu ý

Không dùng số dòng DB làm Total Trades. Cần phân loại Direction/Type.
