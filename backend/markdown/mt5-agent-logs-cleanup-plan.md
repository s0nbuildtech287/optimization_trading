# Kế hoạch dọn log MT5 Local Tester Agents

## 1. Vấn đề thực tế

Khi MT5 chạy Open Price Optimization hoặc Every Tick, các local tester agent ghi log tại:

```text
%APPDATA%\MetaQuotes\Tester\<terminal-id>\Agent-127.0.0.1-<port>\logs
```

Ví dụ:

```text
C:\Users\trader\AppData\Roaming\MetaQuotes\Tester\
  D085EEB1265578A182C88E79F3167635\
    Agent-127.0.0.1-3000\logs
    Agent-127.0.0.1-3001\logs
    ...
    Agent-127.0.0.1-3080\logs
```

Mỗi `Agent-*` là một MT5 Local Tester Agent, thường tương ứng với một logical CPU và một local port. Đây không phải folder của từng job. Nhiều job và nhiều strategy sử dụng lại cùng pool agent, khiến log trong từng agent tiếp tục tăng.

Thực tế đo được khoảng 81 agent, mỗi agent có thể ghi khoảng 35–39 MB log/ngày. Tổng dung lượng có thể tăng gần 3 GB/ngày dù `C:\mt5work` và `Terminal\<id>\Tester` vẫn sạch.

Cleanup hiện tại mới xử lý:

- `C:\mt5work\runs`, `job_inputs`, `tmp`;
- temp upload/download bị bỏ lại;
- `Terminal\<terminal-id>\Tester\cache` và `Tester\logs`;
- report XML/HTML/PNG phát sinh trong terminal;
- artifact tạm trên backend.

Phần còn thiếu là log tại root dùng chung của MT5 Tester:

```text
%APPDATA%\MetaQuotes\Tester\<terminal-id>\Agent-*\logs
```

## 2. Mục tiêu

1. Dọn toàn bộ file log của đúng pool local agents thuộc terminal mà Worker đang quản lý.
2. Dọn ngay sau khi một job đã kết thúc và kết quả đã được backend tiếp nhận.
3. Có startup/periodic sweep để xử lý log còn sót do crash, mất điện hoặc Worker bị kill.
4. Không ảnh hưởng Open Price, Every Tick, rerun, Auto Every Tick, parse report, upload artifact hoặc dữ liệu trong database.
5. Không xoá market data trong `bases` và không xoá cấu trúc `Agent-*`.

## 3. Phạm vi được phép xoá

Chỉ xoá file và folder con nằm bên trong:

```text
%APPDATA%\MetaQuotes\Tester\<terminal-id>\Agent-127.0.0.1-*\logs
```

Có thể xoá:

- `*.log`;
- file log đã rotate;
- folder con tạm thời bên trong `logs`, nếu có và không còn bị process sử dụng.

Giữ nguyên:

- folder `Agent-127.0.0.1-*`;
- folder `logs` rỗng;
- `%APPDATA%\MetaQuotes\Tester\<terminal-id>\bases`;
- `Terminal\<terminal-id>\bases`;
- dữ liệu `.tkc`, `.hcc`, history và ticks;
- cấu hình agent/terminal;
- file của terminal hoặc worker khác.

## 4. Cách xác định đúng Agent root

Worker đã có `config.terminal_data_path`, ví dụ:

```text
C:\Users\trader\AppData\Roaming\MetaQuotes\Terminal\D085EEB1265578A182C88E79F3167635
```

Suy ra:

```text
terminal_id = terminal_data_path.name
metaquotes_root = terminal_data_path.parent.parent
agent_root = metaquotes_root / "Tester" / terminal_id
```

Kết quả:

```text
C:\Users\trader\AppData\Roaming\MetaQuotes\Tester\D085EEB1265578A182C88E79F3167635
```

Với portable mode hoặc layout khác:

- tiếp tục cleanup `terminal_data_path\Tester` bằng logic hiện có;
- chỉ cleanup global agent root khi đường dẫn suy ra đúng cấu trúc `MetaQuotes\Terminal\<terminal-id>`;
- nếu không xác định chắc chắn thì ghi warning và bỏ qua, không đoán đường dẫn.

## 5. Thay đổi Worker

### File chính

```text
distributed-optimization/src/mt5_local_worker/queue_worker.py
```

### Mở rộng helper hiện có

Mở rộng `cleanup_terminal_cache_and_logs()` hoặc tách helper nhỏ:

```text
resolve_mt5_agent_root(config)
cleanup_mt5_local_agent_logs(config, job_id, reason)
```

`cleanup_mt5_local_agent_logs()` thực hiện:

1. Resolve `agent_root`.
2. Kiểm tra `agent_root` nằm chính xác dưới `%APPDATA%\MetaQuotes\Tester` tương ứng với `terminal_id`.
3. Chỉ chọn directory có tên khớp `Agent-127.0.0.1-*`.
4. Với mỗi agent, resolve `<agent>\logs` và kiểm tra vẫn nằm trong agent root.
5. Xoá từng file/folder con trong `logs`, không xoá folder agent.
6. File bị khoá thì ghi warning và tiếp tục agent khác.
7. Thống kê số agent, file, directory và bytes đã giải phóng.

Không đọc nội dung log vào RAM trước khi xoá.

## 6. Thời điểm cleanup ngay sau job

Luồng an toàn:

```text
MT5/Strategy Tester kết thúc
  -> report được copy khỏi terminal
  -> metrics/deals được upload và lưu DB
  -> result artifact được upload/finalize
  -> backend chấp nhận mark_done hoặc mark_failed
  -> terminal64.exe và local metatester agents đã dừng
  -> cleanup workspace hiện tại
  -> cleanup Terminal Tester cache/logs hiện tại
  -> cleanup toàn bộ Agent-*\logs
```

Áp dụng cho:

- Open Price thông thường;
- Open Price rerun 1/5/10 lần;
- Every Tick đơn lẻ;
- Auto Every Tick theo batch;
- Watch List;
- job hoàn thành;
- job failed sau khi hết retry;
- job exception sau khi đã ghi nhận trạng thái và terminal không còn chạy.

Không cleanup giữa các optimization pass của cùng một job. Chỉ cleanup sau khi toàn bộ run/pass thuộc job đã kết thúc.

## 7. Kiểm tra process trước khi xoá

Cleanup chỉ được chạy khi Worker đã kết thúc phiên MT5 của job.

Nguyên tắc:

- không xoá khi job hiện tại còn `RUNNING`;
- không xoá trong lúc upload/parse/report copy;
- chờ ngắn sau khi terminal dừng để agent đóng file log;
- nếu log vẫn bị khoá, không kill mù process và không làm job thất bại;
- file bị khoá được để lại cho sweep sau.

Mỗi Worker phải dùng một `terminal_data_path` riêng. Nếu hai Worker dùng chung một terminal ID, không được cleanup log trong lúc Worker còn lại đang chạy.

## 8. Startup và periodic sweep

### Startup sweep

Khi Worker khởi động:

1. Xác định đúng agent root.
2. Xác nhận Worker chưa claim job.
3. Xác nhận terminal do Worker quản lý không còn phiên test đang chạy.
4. Dọn log agent còn sót.

Startup sweep không cần chờ 24 giờ nếu chắc chắn không có process sử dụng terminal/agents. Nếu không xác nhận được trạng thái an toàn thì chỉ dọn file cũ hơn retention đã cấu hình.

### Periodic sweep

Tích hợp vào vòng sweep workspace hiện có:

- chỉ chạy khi Worker idle;
- mặc định mỗi 30 phút cùng workspace sweep;
- bỏ qua nếu vừa claim job hoặc có terminal/tester đang chạy;
- dọn log còn sót mà cleanup sau job chưa xoá được.

Env đề xuất:

```text
MT5_AGENT_LOG_CLEANUP_ENABLED=true
MT5_AGENT_LOG_SWEEP_INTERVAL_SECONDS=1800
MT5_AGENT_LOG_FALLBACK_RETENTION_HOURS=24
```

`MT5_AGENT_LOG_CLEANUP_ENABLED=false` cho phép tắt nhanh nếu cần điều tra sự cố.

## 9. Logging

Khi thành công:

```text
[cleanup] MT5 agent logs cleaned job=OP-... reason=job_completed agents=81 files=81 dirs=0 bytes=3123456789
```

Khi không có dữ liệu:

```text
[cleanup] MT5 agent logs already clean job=ET-... agents=81
```

Khi bỏ qua:

```text
[cleanup] MT5 agent log cleanup skipped reason=terminal_active
[cleanup] MT5 agent log cleanup skipped reason=unsafe_agent_root path=...
```

Khi một file bị khoá:

```text
[cleanup] MT5 agent log item skipped path=... error=...
```

Cleanup lỗi chỉ ghi warning; không thay đổi trạng thái job đã hoàn thành.

## 10. Không thay đổi nghiệp vụ

Không sửa:

- cách upload/split ZIP;
- cách Worker claim và heartbeat;
- số lượng optimization run/pass;
- thuật toán Open Price/Every Tick;
- cách parse XML/HTML;
- cách lưu metrics, deals và params vào DB;
- logic OTM, Watch List, Auto Every Tick hoặc sync;
- dữ liệu market history trong `bases`.

Log agent chỉ phục vụ chẩn đoán kỹ thuật. Sau khi kết quả và lỗi tóm tắt đã gửi backend, việc xoá log không làm thay đổi kết quả.

## 11. Kiểm thử bắt buộc

### Open Price

1. Chạy một job optimization sử dụng nhiều local agents.
2. Xác nhận nhiều `Agent-*\logs` phát sinh dữ liệu.
3. Xác nhận report được parse và kết quả lưu DB đầy đủ.
4. Sau `mark_done`, xác nhận log trong tất cả agent đã được dọn.
5. Chạy job tiếp theo và xác nhận MT5 tự tạo log mới, job vẫn thành công.

### Every Tick

1. Chạy Every Tick đơn lẻ.
2. Chạy Auto Every Tick nhiều candidate.
3. Xác nhận mỗi job vẫn lưu metrics/deals đúng.
4. Xác nhận log được dọn sau từng job, không dọn giữa lúc job chạy.

### Failure và recovery

1. Mô phỏng job failed sau khi hết retry: lỗi tóm tắt còn trong backend, log file được dọn.
2. Kill Worker giữa job: startup sweep không xoá khi terminal còn active.
3. Để một log bị khoá: cleanup bỏ qua, periodic sweep xử lý lại sau.
4. Cấu hình terminal path sai: cleanup bỏ qua và không xoá ngoài root.

### Storage

1. Ghi nhận dung lượng agent root trước job.
2. Chạy job lớn với nhiều agent.
3. Ghi nhận dung lượng trước và sau cleanup.
4. Treo Worker 24–48 giờ và xác nhận dung lượng log không còn tăng theo cấp số GB/ngày.
5. Xác nhận `bases` và các file `.tkc/.hcc` không bị thay đổi bởi cleanup.

## 12. Tiêu chí nghiệm thu

- Tất cả `Agent-127.0.0.1-*\logs` của đúng terminal được dọn sau job.
- Không tạo thêm một agent folder theo từng strategy/job.
- Không xoá `bases`, history hoặc ticks.
- Không xoá log khi terminal/tester đang chạy.
- Không làm mất metrics/deals/report trước khi backend tiếp nhận.
- Cleanup lỗi không làm job chuyển từ `DONE` sang `FAILED`.
- Có startup và periodic sweep cho dữ liệu sót sau crash.
- Dung lượng log trên máy Worker không tiếp tục tăng vài GB mỗi ngày.

## 13. Thứ tự triển khai

1. Thêm helper resolve global MT5 agent root.
2. Thêm helper cleanup toàn bộ `Agent-*\logs` với path guard.
3. Gọi helper tại các điểm terminal job đã kết thúc hiện có.
4. Bổ sung startup sweep.
5. Bổ sung periodic idle sweep.
6. Thêm thống kê files/bytes được dọn.
7. Chạy test Open Price và Every Tick bằng source Python.
8. Sau khi nghiệm thu source, build lại Worker EXE và kiểm tra trên máy remote.

