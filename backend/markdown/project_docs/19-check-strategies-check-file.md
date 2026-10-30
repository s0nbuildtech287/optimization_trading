# Check Strategies - Check File Optimization

## Công dụng

Kiểm tra file optimization từ máy local hoặc Google Drive trước khi sync. Kết quả chia theo lỗi cấu trúc tên/bộ file và lỗi dữ liệu giao dịch.

## Nguồn kiểm tra

- Local Files: chọn file từ máy, kiểm tra phần có thể xử lý tại client/backend.
- Google Drive: nhập folder URL và chạy job nền có progress.

## Ngưỡng tùy chỉnh

- Min Net Profit mặc định 0.
- Min Total Trades mặc định 100.
- Max Loss Trade mặc định -20000; Largest Loss phải >= ngưỡng.
- Profit Factor phải > 1.0.

## Nhóm kiểm tra

### Group 1 - Tên file

- Viết hoa theo quy ước.
- Format `{BotId}{Symbol}{Timeframe}{OrderType}`.
- BotId 3 chữ số; timeframe H1/H4; direction OB/OS.

### Group 2 - Bộ file

- Mỗi BotId + Symbol đủ H1OB, H1OS, H4OB, H4OS.
- Không trùng tên.
- Phát hiện file/folder lạ và định dạng không hỗ trợ.

### Group 3 - Metadata/Results

- Symbol/timeframe/bot/direction khớp tên.
- AcceptBuy/AcceptSell đúng OB/OS.
- Net Profit, Total Trades, Largest Loss, PF đạt ngưỡng.
- Settings và Results không được rỗng.

### Group 4 - Deals

- Có Deals và có giao dịch.
- Không mở lệnh mới khi lệnh cũ chưa đóng theo rule kiểm tra.
- Không buy/buy hoặc sell/sell sai chuỗi.
- Không chia lệnh B2/B3 nếu bị cấm.
- Swap = 0, Volume > 0.
- Không giữ lệnh dưới 1 phút rồi đóng `_CO` theo rule.

## Kết quả và export

- Progress hiển thị processed/success/failed.
- Lọc theo nhóm lỗi.
- UI giới hạn số lỗi hiển thị khi quá lớn, nhưng CSV/Excel/JSON phải chứa đủ dữ liệu theo mô tả nút.

## Lưu ý

Validation chỉ đánh giá theo rule hiện tại; không chứng minh strategy có chất lượng đầu tư.
