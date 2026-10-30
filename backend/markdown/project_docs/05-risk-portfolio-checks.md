# Risk Analysis - Portfolio Checks

## Công dụng

Portfolio Checks đánh giá rủi ro phát sinh khi ghép nhiều strategy, đặc biệt margin exposure và double exposure. Một strategy tốt riêng lẻ vẫn có thể làm danh mục nguy hiểm nếu trùng thời điểm, cùng symbol hoặc cùng chiều.

## Kiểm tra chính

- Margin Exposure hiện đếm COUNT(DISTINCT strategy_id) theo ngày; chưa tính lot hoặc margin tiền.
- Double Exposure xét deal mở: cùng base strategy, symbol và type buy/sell có cả H1 và H4 trong cùng ngày.
- Ngưỡng tham khảo trên UI: tỷ lệ trùng lặp an toàn `<= 5%` số ngày giao dịch.

## Công thức khái quát

```text
Overlap Rate (%) = tổng overlap days của các base strategy / tổng active days của các base strategy × 100
```

## Cách dùng

1. Chọn một hoặc nhiều nguồn.
2. Chọn date range đủ dài.
3. Xem summary trước, sau đó mở bảng cặp strategy/symbol.
4. Sắp xếp theo tỷ lệ overlap hoặc exposure để tìm điểm nóng.

## Lưu ý

- Đây là phân tích danh mục, không cộng đơn giản các drawdown riêng lẻ.
- Tỷ lệ thấp không đảm bảo margin an toàn nếu volume từng lệnh quá lớn.
