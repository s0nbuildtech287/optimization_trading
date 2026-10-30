# Tiến độ Frontend MT5 Optimization

## Tab Setup Workers

Đã đối chiếu và cập nhật chuẩn xác theo giao diện mẫu từ nhánh backtest_fe & backtest_be:

### 1. Khối 4 Thẻ Chỉ Số KPI Tổng Quan (Overview Metrics)
Bố trí 4 thẻ chỉ số ở đầu trang theo chuẩn giao diện Dashboard Overview với Ant Design Icons:
- Thẻ 1: Total Workers - Thống kê tổng số worker nodes hiện có trong hệ thống (kèm icon CloudServerOutlined).
- Thẻ 2: Worker Status - Thống kê chi tiết trạng thái hoạt động: số lượng Online (xanh lá), Draining (vàng) và Offline (xám) (kèm icon CheckCircleOutlined).
- Thẻ 3: Run Access - Thống kê phân quyền điều phối: số lượng Allowed (cho phép) và Blocked (bị chặn) (kèm icon SafetyCertificateOutlined).
- Thẻ 4: Activity Status - Thống kê trạng thái tải công việc: số lượng Busy (đang chạy job) và Idle (đang rảnh rỗi) (kèm icon ThunderboltOutlined).

### 2. Khối bộ lọc & Thao tác hàng loạt (Filters & Bulk Actions)
- Search Input: Tìm kiếm nhanh theo Worker Name, User ID, hoặc Current Job (hỗ trợ phím Enter để Apply).
- Dropdowns Bộ Lọc:
  - Username: Tất cả hoặc từng tài khoản người dùng (admin, nhultq, sonbx,...).
  - Worker Status: Online, Draining, Offline.
  - Job Type: ALL (Tím), OPTIMIZE (Cyan/Ngọc), BACKTEST (Xanh Dương).
- Nút Thao Tác Bộ Lọc:
  - Nút Apply: Áp dụng các điều kiện lọc đang chọn vào bảng Worker Nodes (kèm icon FilterOutlined).
  - Nút Reset: Khôi phục tất cả bộ lọc về trạng thái mặc định (kèm icon ClearOutlined).
- Tag đếm số lượng worker hiển thị thời gian thực (ví dụ: 6 / 6 Workers).
- Thao tác hàng loạt (Bulk Allow):
  - Thanh "Allow all workers for:" đi kèm dropdown chọn người dùng và nút "Allow All Workers".

### 3. Bảng Worker Nodes chuẩn 13 cột
1. WORKER NAME: Tên worker node font monospace in đậm (MT5-NODE-01, MT5-NODE-02,...).
2. USER ID: ID người sở hữu worker.
3. USERNAME: Username tài khoản sở hữu.
4. API KEY: Nhãn API Key định danh.
5. WORKER STATUS: Badge màu chuẩn: Online (xanh lá), Draining (vàng hổ phách), Offline (xám).
6. RUN ACCESS: Badge phân quyền: Allowed (xanh lá), Blocked (đỏ/cam).
7. SHARING: Switch gạt Public (xanh dương) / Private (xám) tương tác trực tiếp.
8. JOB TYPE: MUI Select Dropdown màu sắc phong phú, phân biệt rõ ràng:
   - ALL: Tím (#d3adf7 / #722ed1) trên nền mờ rgba(114, 46, 209, 0.18)
   - OPTIMIZE: Xanh ngọc (#13c2c2 / #08979c) trên nền mờ rgba(19, 194, 194, 0.16)
   - BACKTEST: Xanh dương (#69b1ff / #0958d9) trên nền mờ rgba(24, 144, 255, 0.16)
9. ACTIVITY: Badge hoạt động: Busy (vàng/cam), Idle (xanh lá).
10. CURRENT JOB: Mã job đang chạy (được highlight nổi bật) hoặc —.
11. JOBS CLAIMED: Tổng số job đã nhận.
12. LAST SEEN: Thời gian heartbeat tín hiệu gần nhất (9/17/2026, 09:30:12 AM).
13. ACTIONS:
    - Node đang chạy (Online/Draining): Nút Block / Allow (vàng/xanh lá), Drain (xanh dương), Delete (đỏ).
    - Node ngoại tuyến (Offline): Nhãn Offline + Nút Delete (đỏ).

### 4. Tối ưu Dark Mode & Trải nghiệm
- Độ tương phản cao cho Label, Switch, Dropdown và các nút hành động trên nền Dark Mode.
- Toàn bộ các nút thao tác, dropdown job type và switch đều có state tương tác mượt mà trên giao diện mock.

---

## Trang Quản Lý API Keys Độc Lập (/api-keys)

Mục API Keys được đặt độc lập trong menu Profile của người dùng (dưới mục View Profile), phục vụ quản lý thông tin xác thực, token và API access cho toàn bộ hệ thống (trading bots, data pipeline, webhooks, worker clusters,...):

### 1. Khối 4 Thẻ Chỉ Số KPI Tổng Quan
- Total API Keys: Tổng số API access key đã tạo trong toàn hệ thống (icon KeyOutlined).
- Active Keys: Số lượng key đang hoạt động (icon CheckCircleOutlined, màu xanh lá).
- Revoked Keys: Số lượng key đã bị thu hồi / vô hiệu hóa (icon StopOutlined, màu đỏ/xám).
- Users With Keys: Số lượng tài khoản người dùng duy nhất đang sở hữu key (icon UserOutlined, màu tím).

### 2. Khối Bộ Lọc & Thao Tác
- Ô tìm kiếm Search Input: Tìm kiếm theo Label, User, User ID, Masked Key hoặc Scope/Restriction (hỗ trợ phím Enter để Apply).
- Dropdown User: Lọc theo từng tài khoản sở hữu hoặc tất cả.
- Dropdown Status: Lọc theo All Statuses, Active, Revoked.
- Nút Apply: Áp dụng điều kiện lọc nhanh chóng (kèm icon FilterOutlined).
- Nút Reset: Khôi phục tất cả bộ lọc về mặc định (kèm icon ClearOutlined, tối ưu độ tương phản sáng trên Dark Mode).
- Nút Generate Key: Mở hộp thoại tạo mới API Access Key.

### 3. Bảng API Access Keys chuẩn 6 cột
1. LABEL: Nhãn định danh API Key, hiển thị mã masked (ví dụ: lq_live_••••9K2P) và nhãn Scope / Phân quyền dịch vụ (trade:execute, market:stream, analytics:read-write, worker:mt5-node-01,...).
2. USER: Tên tài khoản và User ID sở hữu key (avatar chữ cái đầu + badge ID).
3. STATUS: Badge Active (xanh lá) hoặc Revoked (đỏ/xám).
4. CREATED AT: Thời gian tạo key (YYYY-MM-DD HH:mm:ss).
5. LAST USED AT: Thời gian sử dụng gần nhất hoặc —.
6. ACTIONS:
   - Nút Copy Plaintext Key: Sao chép mã key vào clipboard và hiển thị thông báo thành công.
   - Nút Revoke / Active: Thu hồi hoặc kích hoạt lại key với popup xác nhận bảo mật (Confirm Modal).
   - Nút Delete: Xóa vĩnh viễn key với popup xác nhận an toàn.

### 4. Hộp Thoại Tạo Mới Key (Generate Modal)
- Form nhập: Label dịch vụ (bắt buộc) và Scope / Service Restriction (tùy chọn: trade:execute, data:stream, worker:node-01,...).
- Sau khi bấm Generate: Tự động tạo mã key mới chuẩn nền tảng (dạng lq_live_...) và hiển thị hộp cảnh báo bảo mật cùng nút Copy Key tiện lợi.

## Tab INI Config (/optimization/ini-config)

Đã hoàn thiện giao diện Trình Tạo Cấu Hình INI MT5 (INI Config Generator) kế thừa đầy đủ tính năng từ nhánh cũ:

### 1. Khối Quản Lý Bot (Bot Configuration Manager)
- Nút Upload Bot Folder: Tải lên toàn bộ thư mục chứa các file bot .mq5 của EA.
- Danh sách thẻ Bot: Hiển thị lưới bot dạng thẻ trực quan. Thẻ bot đang chọn được highlight viền xanh dương, bot đã lưu cấu hình có viền và icon xanh lá.
- Nút tải file INI cho từng bot: Nút icon cho phép nạp trực tiếp file .ini cấu hình sẵn cho bot tương ứng.
- Nút Clear All: Xóa toàn bộ danh sách bot đã upload và reset bộ nhớ localStorage.
- Nút Create All Configs: Hiển thị tổng số bot đã cấu hình và xuất toàn bộ file .ini dạng file nén ZIP.

### 2. Khối Cấu Hình Chi Tiết Bot Đang Chọn
- Khối chọn Symbols: Checkbox đa chọn danh sách cặp tiền / tài sản (BTCUSD, ETHUSD, XAUUSD, XAGUSD, USOIL, US500, DE30, HK50, JP225, STOXX50, UK100).
- Khối chọn Timeframes: Checkbox chọn khung thời gian H1, H4.
- Khối chọn Modes: Checkbox chọn hướng giao dịch Buy, Sell.

### 3. Bảng Cấu Hình Biến Tham Số (Variable Configuration Table)
- Bảng tham số chi tiết gồm các cột: OPT (Checkbox bật/tắt tối ưu), VARIABLE (Tên biến & kiểu dữ liệu), VALUE (Giá trị mặc định), START (Giá trị bắt đầu), STEP (Bước nhảy), STOP (Giá trị kết thúc).
- Hỗ trợ Enum MT5 chuyên sâu (ENUM_TIMEFRAME, ENUM_MA_METHOD, ENUM_APPLIED_PRICE, ENUM_APPLIED_VOLUME,...) với Select Dropdown trực quan.
- Tự động kiểm tra lỗi dải tối ưu (Start = Stop, Start > Stop với step dương,...) và hiển thị cảnh báo đỏ trực tiếp tại dòng biến.
- Phân trang tùy chỉnh qua CustomTablePagination (5, 10, 25, 50 dòng/trang).

### 4. Nút Thao Tác & Dialog Cảnh Báo
- Nút Optimize All / Don't Optimize All: Bật hoặc tắt nhanh cờ tối ưu hóa cho tất cả các biến.
- Nút Save Configuration: Lưu cấu hình hiện tại của bot vào bộ nhớ để chuẩn bị xuất file.
- Dialog Cảnh Báo Logic: Tự động phát hiện lỗi dải tham số khi bấm tạo configs và cung cấp lựa chọn Hủy sửa thủ công hoặc Bất chấp tiếp tục (Hệ thống tự sửa lỗi ngầm).

---
Ghi chú: Báo cáo được tự động cập nhật theo tiến độ chỉ đạo của Đại ca Xuân Sơn.
