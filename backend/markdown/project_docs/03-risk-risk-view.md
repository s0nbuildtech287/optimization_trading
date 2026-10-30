# Risk Analysis - Risk View (Hard & Soft Flags)

## Công dụng

Risk View gom các dấu hiệu rủi ro theo loại để tester và người vận hành biết vì sao một strategy bị cấm deploy hoặc cần theo dõi. Có thể mở từng flag để xem danh sách strategy vi phạm và chuyển sang Strategy View.

## Hard Flags

Hard Flag là điều kiện nghiêm trọng. Các nhóm hiện có gồm:

- Expected Payoff `<= 0`.
- Profit Factor `< 1.2` với mẫu từ 100 trade.
- Recovery Factor `< 1.0`.
- P/D Ratio `< 1.0` với mẫu từ 100 trade.
- Martingale Triple Flag: Win Rate >= 50%, |Largest Loss| >= 15000 và Drawdown >= 20%.
- End of Test exit `> 10%`.
- Largest Loss / Net Profit `>= 70%`.
- Lợi nhuận 12 tháng gần nhất âm.

## Soft Flags

Soft Flag là cảnh báo cần xem thêm, ví dụ:

- Tiêu đề Profit outlier trên `5σ`, nhưng code hiện chỉ kiểm tra |Largest Loss| >= 30000 và không tính sigma.
- Mẫu ít nhưng profit/trade cao bất thường.
- LR Correlation `< 0.8`.
- Sharpe trong khoảng (0, 0.5); code không kiểm tra Standard Error.
- Seasonal Dependency và Performance Decay hiện có định nghĩa nhưng hàm test backend trả false.
- Drawdown kéo dài, PF cao nhưng DD cao, lot tăng vọt.
- Commission bất thường, holding time quá ngắn, strategy im lặng.
- Win rate decay, dormancy, thin edge, chuỗi thua dài.

## Cách dùng

1. Chọn nguồn và date range.
2. Mở nhóm Hard hoặc Soft.
3. Nhấn một flag để xem danh sách strategy và giá trị gây vi phạm.
4. Dùng tìm kiếm trong bảng chi tiết.
5. Nhấn strategy để chuyển sang Strategy View với strategy đó được chọn.

## Lưu ý

- Hard Flag không tự động xóa strategy; đây là lớp đánh giá.
- “Không có vi phạm” khác “chưa tải dữ liệu”.
- Một chỉ số thiếu không được tự động coi là 0 để gắn cờ nếu backend quy định bỏ qua `null`.
