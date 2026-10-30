# Đăng nhập và Profile

## Công dụng

Xác thực user bằng JWT và hiển thị thông tin tài khoản đang sử dụng. Role quyết định các thao tác quản trị và phạm vi dữ liệu được phép xem.

## Đăng nhập

1. Nhập username/email và password.
2. Khi thành công, frontend lưu `authToken` và thông tin user.
3. Các API bảo vệ gửi `Authorization: Bearer <token>`.
4. Token hết hạn hoặc nhận 401 sẽ đưa user về trang đăng nhập.

## Profile

- Xem username, email, fullname/avatar nếu schema có hỗ trợ.
- Xem role hiện tại.
- Cập nhật các trường được giao diện cho phép.
- Logout xóa token và user local.

## Phân quyền
- Admin: có quyền gọi các API quản trị theo route hiện tại.
- User: chỉ xem/thao tác nguồn được cấp; Service Account bị che bằng `*` và không có nút copy.
- User không được gọi trực tiếp API admin; backend phải trả 403.

## Lưu ý

Việc ẩn nút frontend không phải bảo mật đầy đủ; endpoint backend cũng phải kiểm tra role.
