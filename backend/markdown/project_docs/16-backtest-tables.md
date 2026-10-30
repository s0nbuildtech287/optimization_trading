# Backtest Tables

## Công dụng

Quản lý các nguồn dữ liệu backtest: tạo bảng, sync từ Google Drive, update, summary, theo dõi lịch sử và xóa bảng.

## Quyền sở hữu

- Bảng do user tạo thuộc user đó.
- User thường chỉ thao tác bảng được cấp quyền/sở hữu.
- Admin có quyền quản trị theo policy hệ thống.
- Khi bảng bị xóa, ownership phải bị xóa; tên bảng được tạo lại sẽ thuộc người tạo mới.

## Các chế độ sync

- NEW RUN: làm sạch dữ liệu mục tiêu theo luồng xác nhận rồi nạp lại.
- UPDATE: cập nhật/bổ sung dữ liệu theo logic đồng bộ hiện tại.
- SUMMARY: chỉ quét cấu trúc ngoài Google Drive, không ghi DB và không cập nhật Backtest Information.

Summary kiểm tra tổng file, số asset, tổng file từng asset, folder/file lạ, định dạng sai và trùng tên.

## Backtest Information

- Owner.
- Last Status và Last Duration.
- Total Rows in DB: COUNT trực tiếp với LOWER(type) khác balance.
- Total Strategies: COUNT(DISTINCT strategy_id) trên cùng tập dòng, không phụ thuộc lịch sử log.
- Thời điểm/lần sync gần nhất.

## Sync và Stop Now

1. Chọn bảng và mode.
2. Nhập Drive URL, xác nhận đúng nguồn.
3. Bắt đầu sync; theo dõi progress/panel.
4. Có thể dùng Stop Now khi chọn nhầm.
5. Sau khi dừng, kiểm tra trạng thái job và dữ liệu đã ghi theo semantics của mode.

## Lưu ý

NEW RUN có tính phá hủy dữ liệu cũ theo xác nhận. Tester chỉ dùng bảng thử nghiệm.
