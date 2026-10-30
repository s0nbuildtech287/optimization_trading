# Check Strategies - Get Strategy ID

## Công dụng

Quét Google Drive folder để lấy danh sách tên sheet/Strategy ID, giúp kiểm tra nhanh danh mục trước khi sync.

## Quy trình

1. Cấp Viewer cho Service Accounts nếu là admin/vận hành nội bộ.
2. Dán Google Drive Folder URL.
3. Nhấn lấy danh sách.
4. Xem số lượng và danh sách Strategy ID.
5. Copy danh sách khi cần.

## Phân quyền Service Account

- Admin xem email thật và dùng Copy từng email/Copy tất cả.
- Role user chỉ thấy 8 địa chỉ giả dạng `Account N: @.iam.gserviceaccount.com` và không có nút copy email.
- Backend endpoint email chỉ cho admin.

## Lưu ý

Tên sheet tìm thấy chưa đồng nghĩa file đạt chuẩn hoặc đủ Settings/Results/Deals; dùng tab Check File Optimization để kiểm tra nội dung.
