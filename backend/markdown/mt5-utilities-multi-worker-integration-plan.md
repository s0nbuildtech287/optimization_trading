# Kế hoạch tích hợp MT5 Worker vào MT5 Utilities

## 1. Mục tiêu

Tích hợp MT5 Queue Worker vào ứng dụng `C:\Users\SonBx\Desktop\backup-mt5` để một ứng dụng MT5 Utilities có thể quản lý và chạy nhiều Terminal MT5 cùng lúc.

Worker độc lập tại `C:\Users\SonBx\Desktop\distributed-optimization` vẫn được giữ nguyên và tiếp tục hoạt động như một loại Worker riêng.

Kiến trúc được lựa chọn:

- React/TypeScript đảm nhiệm giao diện.
- Electron Main TypeScript quản lý cấu hình và vòng đời Worker.
- Python tiếp tục đảm nhiệm toàn bộ nghiệp vụ MT5.
- Mỗi Terminal Profile chạy một Python Worker Process độc lập.

Không viết lại lõi MT5 bằng TypeScript vì lõi Python hiện tại đã có queue claim, heartbeat, retry, parse kết quả, upload, cleanup và lưu Excel ổn định.

## 2. Phạm vi giữ nguyên

Không sửa hoặc loại bỏ các chức năng sau của MT5 Utilities:

- MT5 Log Watcher.
- Folder Backup.
- System Monitor.
- EA Scanner.
- MT5 History Sync.
- Các công cụ không liên quan đến Optimization Worker.

Không sửa hành vi của Worker độc lập trong `distributed-optimization`.

## 3. Giai đoạn 1 - Loại bỏ Optimization cũ

Loại bỏ riêng phần Optimization cũ trong `backup-mt5`:

1. Gỡ component `OptimizationTab` cũ trong renderer.
2. Gỡ các IPC cũ chỉ phục vụ pipeline local:
   - `optimize:run`.
   - `optimize:backtest`.
   - `optimize:full-workflow`.
   - `optimize:stop`.
   - `optimize:status`.
   - Các IPC chọn đường dẫn chỉ dùng riêng cho Optimization cũ.
3. Gỡ process map, process monitor, log stream và state chỉ phục vụ Optimization cũ.
4. Gỡ thư mục `backend/mt5Optimize` sau khi xác nhận không còn module nào khác tham chiếu.
5. Gỡ các API preload và type TypeScript không còn sử dụng.
6. Tạm hiển thị trạng thái `MT5 Workers đang được nâng cấp` trong thời gian thay thế.

Trước khi xóa phải tìm toàn bộ reference để không ảnh hưởng các tool MT5 khác.

## 4. Giai đoạn 2 - Đưa Worker Runtime mới vào ứng dụng

Tái sử dụng lõi Python đang hoạt động trong `distributed-optimization`, bao gồm:

- Claim job từ server.
- Xác thực API Key.
- Worker heartbeat và trạng thái Online/Offline.
- Chạy Open Price Optimization.
- Chạy Every Tick Backtest.
- Parse và upload Optimization Results.
- Parse và upload Backtest Results.
- Upload artifact theo chunk.
- Retry kết nối và retry job.
- Cleanup workspace, cache và log MT5.
- Tải và lưu file Excel vào Strategies Directory.

Python Worker được đóng gói thành `mt5_worker_runner.exe`. Electron gọi runner bằng `child_process.spawn()` và không yêu cầu người dùng cài Python.

MT5 Utilities không được phụ thuộc trực tiếp vào đường dẫn source `distributed-optimization` khi chạy production.

Nên có file version hoặc manifest cho Worker Runtime để kiểm soát phiên bản đang được tích hợp và tránh hai source bị lệch logic.

## 5. Giai đoạn 3 - Mô hình cấu hình

### 5.1. Cấu hình dùng chung

- Server URL.
- API Key.
- Heartbeat interval.
- Poll interval.
- Server health timeout.
- Retry defaults.

### 5.2. Cấu hình từng Terminal Profile

Mỗi profile có các trường:

```text
profile_id
worker_instance_id
profile_name
worker_name
mt5_path
terminal_data_path
strategies_dir
workspace_root
auto_start
status
```

Quy tắc nhận diện:

```text
Một Terminal Profile
= một worker_instance_id cố định
= một Python Worker Process
= một MT5 Terminal
= một workspace riêng
```

`worker_instance_id` được tạo một lần khi tạo profile và không thay đổi khi đổi Worker Name. Điều này bảo đảm đổi tên không tạo thêm Worker Node trong database.

Cấu hình phải được Electron Main lưu tại thư mục `app.getPath('userData')`, không phụ thuộc localStorage của renderer.

## 6. Giai đoạn 4 - Worker Supervisor

Electron Main quản lý Worker theo cấu trúc tương đương:

```text
Map<profile_id, ChildProcess>
```

Mỗi Worker Process có:

- PID riêng.
- Trạng thái riêng.
- Log riêng.
- Current Job riêng.
- Thời gian bắt đầu riêng.
- `worker_instance_id` riêng.

Supervisor phải hỗ trợ:

- Start một Worker.
- Stop một Worker.
- Restart một Worker.
- Start All.
- Stop All.
- Theo dõi process exit.
- Phân biệt user chủ động dừng và process bị crash.
- Gửi trạng thái Offline khi dừng.
- Dừng đúng process tree của profile.
- Không để một Worker lỗi làm tắt các Worker khác.
- Giới hạn log trong RAM để tránh ứng dụng phình bộ nhớ.

Khi đóng MT5 Utilities, ứng dụng phải dừng các Worker Process do nó quản lý và cố gắng gửi Offline heartbeat trước khi thoát.

## 7. Giai đoạn 5 - IPC và Preload

Xây IPC mới theo profile, không dùng IPC Optimization local cũ.

Nhóm IPC cần có:

- Lấy danh sách profile.
- Tạo profile.
- Cập nhật profile.
- Xóa profile.
- Nhân bản profile.
- Chọn `terminal64.exe`.
- Chọn Terminal Data Path.
- Chọn Strategies Directory.
- Test Server.
- Verify Identity.
- Start/Stop/Restart một profile.
- Start All/Stop All.
- Lấy trạng thái profile.
- Subscribe log theo `profile_id`.
- Xóa log hiển thị.

Renderer chỉ gọi API qua preload; không được trực tiếp spawn process hoặc đọc file cấu hình.

## 8. Giai đoạn 6 - Giao diện MT5 Workers

Giao diện mới đồng bộ phong cách của MT5 Utilities nhưng giữ cách sử dụng quen thuộc của Worker App hiện tại.

### 8.1. Connection & Identity

- Server URL.
- API Key.
- Test Server.
- Verify Identity.
- Hiển thị User ID và API Key Label sau khi xác thực.

### 8.2. Terminal Profiles

- Danh sách các Terminal Profile.
- Thêm profile.
- Xóa profile.
- Nhân bản profile.
- Bật/tắt Auto Start.
- Chọn `terminal64.exe`.
- Chọn Terminal Data Path.
- Chọn Strategies Save Directory.
- Hiển thị workspace tương ứng.

### 8.3. Trạng thái Worker

- Online/Offline.
- Starting/Stopping.
- Idle/Running.
- Current Job.
- Jobs Claimed nếu server cung cấp.
- Server Healthy/Offline.
- Start/Stop/Restart riêng.
- Start All/Stop All.

### 8.4. Worker Logs

- Chọn profile để xem log.
- Log phải được gắn đúng `profile_id`.
- Giới hạn số dòng log hiển thị.
- Hỗ trợ Clear và Copy.
- Không để log của profile này xuất hiện trong profile khác.

Không nhúng giao diện Tkinter hiện tại vào Electron. Chỉ tái sử dụng nghiệp vụ, nhãn trường và luồng thao tác.

## 9. Giai đoạn 7 - Cô lập nhiều Terminal

Để nhiều Terminal chạy đồng thời an toàn:

- Mỗi profile phải có workspace riêng, ví dụ:

```text
C:\mt5work\profiles\profile-1
C:\mt5work\profiles\profile-2
C:\mt5work\profiles\profile-3
```

- Không cho hai profile đang bật dùng chung `terminal_data_path`.
- Không cho hai profile đang bật dùng chung `workspace_root`.
- Cảnh báo khi nhiều profile dùng chung `terminal64.exe`.
- Khuyến nghị mỗi Terminal sử dụng bản cài hoặc portable riêng.
- Cleanup chỉ được tác động vào workspace và Terminal Data Path của đúng profile.
- Không dùng lệnh kill toàn bộ `terminal64.exe` hoặc `metatester64.exe`.
- Chỉ kill process khớp đúng executable/path/PID của profile.

Nếu hai profile dùng chung Terminal Data Path, hệ thống phải chặn Start thay vì chỉ cảnh báo.

## 10. Giai đoạn 8 - Đóng gói

1. Build Python runner bằng PyInstaller.
2. Đưa `mt5_worker_runner.exe` vào `extraResources` của Electron Builder.
3. Electron tự tìm runner theo hai môi trường:
   - Development.
   - Packaged production.
4. Bổ sung bước build Worker Runtime trước bước đóng gói Electron.
5. Kiểm tra installer chứa đầy đủ runner và dependency MT5.
6. Người dùng chỉ cần cài và mở MT5 Utilities.

## 11. Giai đoạn 9 - Kiểm thử

### 11.1. Một Worker

- Verify API Key thành công.
- Worker xuất hiện đúng trên web.
- Start/Stop cập nhật Online/Offline.
- Claim và chạy Open Price.
- Claim và chạy Every Tick.
- Upload kết quả thành công.
- Lưu Excel đúng Strategies Directory.
- Cleanup đúng sau khi job hoàn thành.

### 11.2. Nhiều Worker

- Chạy đồng thời hai đến ba Terminal.
- Mỗi profile xuất hiện thành một Worker Node riêng.
- Các Worker claim job độc lập.
- Log và trạng thái không bị trộn.
- Dừng một Worker không ảnh hưởng Worker khác.
- Một Worker lỗi không làm tắt các Worker còn lại.
- Không tranh chấp report, cache, workspace hoặc MT5 process.

### 11.3. Vòng đời và phục hồi

- Đổi Worker Name không tạo Worker mới.
- Mất mạng rồi kết nối lại.
- Server restart trong lúc Worker đang chờ.
- Worker Process crash.
- MT5 Process crash.
- Tắt MT5 Utilities khi Worker đang chạy.
- Khởi động lại ứng dụng với profile Auto Start.
- Rerun và requeue vẫn hoạt động.

### 11.4. Kiểm thử bảo toàn chức năng

- Log Watcher vẫn hoạt động.
- Folder Backup vẫn hoạt động.
- System Monitor vẫn hoạt động.
- EA Scanner vẫn hoạt động.
- History Sync vẫn hoạt động.
- Worker độc lập trong `distributed-optimization` vẫn kết nối và chạy job bình thường.

## 12. Thứ tự triển khai đề xuất

1. Lập danh sách reference của Optimization cũ.
2. Gỡ giao diện và IPC Optimization cũ, để placeholder.
3. Chuẩn hóa Worker Runtime và quy trình build runner.
4. Xây Profile Store trong Electron Main.
5. Xây Worker Supervisor.
6. Xây IPC và preload mới.
7. Xây giao diện MT5 Workers.
8. Bổ sung validation chống trùng Terminal/workspace.
9. Tích hợp runner vào Electron Builder.
10. Kiểm thử một Worker.
11. Kiểm thử nhiều Worker đồng thời.
12. Kiểm thử regression toàn bộ MT5 Utilities.
13. Đóng gói installer để tester sử dụng.

## 13. Tiêu chí hoàn thành

- Một MT5 Utilities quản lý được nhiều Terminal MT5.
- Mỗi profile tương ứng đúng một Worker Node trên web.
- Đổi tên Worker không tạo bản ghi Worker mới.
- Các Terminal chạy song song và không tranh chấp dữ liệu.
- Open Price và Every Tick hoạt động giống Worker độc lập hiện tại.
- Kết quả được upload và Excel được lưu đúng thư mục.
- Workspace, cache và logs được cleanup đúng profile.
- Không còn pipeline Optimization cũ trong MT5 Utilities.
- Các tool còn lại của MT5 Utilities không bị ảnh hưởng.
- Worker độc lập `distributed-optimization` vẫn hoạt động bình thường.
- Không yêu cầu thay đổi schema database hoặc API backend hiện tại.

