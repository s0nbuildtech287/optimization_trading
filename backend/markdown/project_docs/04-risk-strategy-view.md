# Risk Analysis - Strategy View

## Công dụng

Strategy View đảo chiều góc nhìn: thay vì xem từng loại rủi ro, tester xem từng strategy và toàn bộ Hard/Soft Flags của nó. Màn hình dùng để quyết định ưu tiên kiểm tra hoặc truy ngược về flag cụ thể.

## Nội dung

- Strategy ID và bảng nguồn.
- Số lượng Hard Flags và Soft Flags.
- Mức ưu tiên/risk status.
- Danh sách chỉ số hoặc điều kiện đã vi phạm.
- Tìm kiếm theo strategy và lọc theo priority/risk.

## Logic mức độ

- Có ít nhất một Hard Flag: strategy thuộc nhóm rủi ro cao/cần chặn tùy quy tắc UI.
- Không có Hard nhưng có Soft: cần theo dõi.
- Không có flag: trạng thái an toàn tương đối, không đồng nghĩa chắc chắn có lãi.
- Điểm phạt Soft Flag phụ thuộc loại flag; không giả định mọi Soft Flag có cùng trọng số.

## Cách dùng

1. Chọn nguồn và khoảng ngày.
2. Nhập Strategy ID hoặc lọc priority.
3. Mở một strategy để xem các flag.
4. Nhấn một risk item để quay lại Risk View và highlight đúng flag.

## Lưu ý

- Một số flag dựa trên metadata Full Period; một số dựa trên deal/date range. Tester phải xem chú thích của từng flag.
- Dữ liệu rỗng phải có thông báo rõ, không để spinner vô hạn.
