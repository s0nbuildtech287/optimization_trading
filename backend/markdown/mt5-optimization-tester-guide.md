# Hướng dẫn kiểm thử module MT5 Optimization

## 1. Phạm vi

Tài liệu này hướng dẫn tester sử dụng toàn bộ chức năng của module MT5:

- API Keys
- Setup Workers
- INI Config
- Optimization Session
- Jobs Queue Process
- All Optimize Results
- All Backtest Candidates
- Backtest Staging
- TPL Generator
- Thông báo MT5

Luồng chuẩn: tạo API Key → kết nối worker → Allow worker → tạo Session → tạo ZIP INI → chạy Optimize ( open price ) → chọn bộ tham số Backtest ( every tisk) → chọn candidate vào Staging → sync sang bảng backtest.

## 2. Chuẩn bị

Tester cần có tài khoản hợp lệ, MT5 App Worker, MetaTrader 5, thư mục EA chứa file .mq5, dữ liệu lịch sử của symbol và quyền trên bảng backtest đích.

Lần chạy đầu nên dùng 2 đến 4 strategy, một worker, OptimiRun Cycles bằng 1 và một Optimization Session mới.

## 3. Khái niệm

### Optimization Session

Session là phạm vi của một đợt MT5 Optimization, không phải phiên đăng nhập website. Jobs, Open Price results, Every Tick candidates và Staging đều phải thuộc session đang chọn.

### Open Price

Bước optimization ban đầu. MT5 sinh nhiều bộ tham số. Hệ thống lưu các kết quả hợp lệ vào All Optimize Results, trừ dòng có toàn bộ chỉ số kết quả bằng 0.

### Every Tick

Backtest chi tiết một bộ tham số. Kết quả thành công được lưu vào All Backtest Candidates cùng Settings, Results và Deals.

### Backtest Staging

Vùng chọn cuối trước khi sync. Trong một session, mỗi strategy chỉ có một candidate hiện hành trong Staging.

## 4. API Keys

Mở menu avatar và chọn API Keys.

### Tạo key

1. Nhấn Generate New API Key.
2. Nhập Key Name.
3. Có thể nhập Worker Scope Restrictions.
4. Xác nhận và copy key sang MT5 App Worker.

### Chức năng cần thử

- Reveal hoặc Hide key.
- Copy key.
- Revoke để vô hiệu hóa nhưng giữ bản ghi.
- Delete để xóa vĩnh viễn.
- Search và lọc Active, Revoked, Owner.
- Đổi Grid hoặc Table.
- Refresh danh sách.

Key Active phải Verify Identity thành công. Key Revoked hoặc đã xóa phải bị từ chối.

## 5. Setup Workers

Worker được đăng ký hoặc cập nhật khi MT5 App Worker Verify hay Start bằng API Key hợp lệ.

### Bộ lọc

- Username
- Worker Status
- Job Type
- Search

### Các cột

- Worker Name, User ID, Username, API Key
- Worker Status, Run Access, Sharing, Job Type
- Activity, Current Job, Jobs Claimed, Last Seen
- Actions

### Run Access

- Worker mới chưa được nhận job.
- Nhấn Allow để cho phép claim job.
- Allow All Workers áp dụng theo user được chọn.
- Drain ngăn nhận job mới.
- Delete phải xóa worker trong database. App đang chạy có thể đăng ký lại.

### Sharing và Job Type

- Private chỉ nhận job đúng phạm vi owner.
- Public có thể nhận job của user khác, nhưng job và kết quả vẫn thuộc người tạo.
- ALL nhận Open Price và Every Tick.
- OPTIMIZE hoặc OPEN_PRICE chỉ nhận optimization.
- BACKTEST hoặc EVERY_TICK chỉ nhận backtest chi tiết.

## 6. INI Config

1. Nhấn Upload Bot Folder và chọn thư mục có EA .mq5.
2. Chọn từng bot.
3. Chọn Symbol, Timeframe và Buy hoặc Sell.
4. Cấu hình Value, Start, Step, Stop và cờ Optimize.
5. Nhấn Save cho từng bot.
6. Nhấn Create All Configs.
7. Xác nhận và kiểm tra ZIP tải xuống.

Icon Load .ini trên từng bot nạp lại TesterInputs từ INI có sẵn.

Điều kiện hợp lệ:

- Có ít nhất một Symbol, Timeframe và Mode.
- Value, Start, Step và Stop không trống.
- Input bật Optimize không nên có Start bằng Stop.
- Chiều Step phải phù hợp Start và Stop.

Clear All chỉ xóa cấu hình trong localStorage trình duyệt, không xóa dữ liệu server.

## 7. Optimization Session

Dropdown Session dùng chung cho các tab Optimize.

### Tạo session

1. Mở dropdown.
2. Chọn Create New Session.
3. Nhập Session Name và Description nếu cần.
4. Xác nhận.

Session mới phải được chọn ngay và xuất hiện trong Jobs Queue Process.

Khi đổi session, Queue, Optimize Results, Backtest Candidates và Staging phải cùng đổi theo, không được trộn dữ liệu.

## 8. Jobs Queue Process

### Launch Optimization

1. Chọn session.
2. Upload ZIP INI.
3. Nhập OptimiRun Cycles.
4. Nhấn Launch Optimization.

Số Open Price jobs bằng số strategy nhân số cycles. Ví dụ 4 strategy và 2 cycles tạo 8 job.

### Trạng thái

- PENDING: chờ worker.
- CLAIMED: worker đã nhận.
- RUNNING: đang chạy.
- COMPLETED: hoàn thành.
- FAILED: thất bại.
- CANCELLED: đã hủy.

### Bộ lọc và layout

Lọc theo Search, Status, Mode, Symbol, Job Type, Worker và Owner.

- Combined: một bảng chung.
- Split: tách Open Price và Every Tick.
- Apply Filters: áp dụng.
- Reset: xóa bộ lọc.

### Actions

- Eye: xem progress, worker, lỗi và chi tiết.
- Cancel: hủy job.
- Retry: chạy lại job thất bại hoặc bị hủy.
- Delete: xóa job queue.
- Checkbox: Cancel hoặc Delete nhiều job.

Đóng modal xác nhận bằng Cancel không được làm thay đổi trạng thái job.

### Kết quả Open Price

- Job COMPLETED phải có result tương ứng.
- Stored Parameter Sets lớn hơn 0 nếu report có dữ liệu.
- Result xuất hiện ở All Optimize Results.
- Không được báo COMPLETED nếu upload result thất bại.

### Kết quả Every Tick

- Tên job có strategy và pass.
- Không cần Total Parameter Sets.
- Candidate xuất hiện ở All Backtest Candidates.
- Settings, Results và Deals có dữ liệu.
- Excel được lưu vào Strategies Save Directory nếu worker đã cấu hình.

## 9. All Optimize Results

Tab này luôn dùng dữ liệu Open Price từ summary_op, kể cả sau khi result đã chạy Every Tick.

### Chế độ xem

- All Passes: mỗi dòng là một bộ tham số.
- Group by Strategy: mỗi dòng cha là một strategy; mở rộng mới tải candidate chi tiết.

Các card tổng quan phải tính trên toàn bộ dữ liệu của Optimization Session đang chọn, không phụ thuộc trang hiện tại.

### Optimization Filter

Có Search, Symbol, Status, Backtest Runs và các khoảng Profit, Recovery Factor, Trades, Profit Factor, Drawdown, P/D, Sharpe, Top N và Cluster Radius.

Nhấn Apply Filter Rules để áp dụng.

- Top N lấy N kết quả đứng đầu theo Result Open Price trong từng strategy.
- Cluster Radius hạn chế các bộ tham số quá gần nhau.
- Trong My OTM Watchlist, Top N và Cluster Radius không lọc lại danh sách đã pick.

### Watchlist

- Icon ngôi sao thêm hoặc bỏ watchlist.
- Add to Watchlist thêm các dòng đã chọn.
- My OTM Watchlist chỉ hiển thị dòng đã theo dõi.
- Watchlist không tự chạy Every Tick.

### Chạy Every Tick

Nhấn icon pick hoặc Start Every Tick.

- Job được tạo ngay.
- Every Tick Running tăng.
- Không tạo trùng khi cùng result đang queued hoặc running.
- Khi hoàn thành, Backtest Runs tăng một.
- Result có thể chạy lại sau khi lần trước kết thúc.

Eye mở chi tiết Open Price. Download INI Config tạo INI từ dữ liệu đã lưu. Chỉ số ở tab này không bị thay bằng summary_bt.

## 10. All Backtest Candidates

Chỉ chứa candidate đã chạy Every Tick thành công.

### Chế độ xem

- All Passes
- Group by Strategy

Dòng cha và dòng mở rộng giữ chart nhỏ và phần trăm chênh lệch với Open Price cho chỉ số có thể so sánh.

Không so sánh Equity DD của Open Price với Balance DD của Every Tick vì đây là hai loại drawdown khác nhau.

### Backtest Performance Filters

- Net Profit
- Recovery Factor
- Trades
- Profit Factor
- Balance DD %
- P/D Ratio
- Sharpe Ratio
- Largest Loss Trade

Giá trị 0 hoặc trống nghĩa là chưa giới hạn.

### Date Range

- Full Period dùng Results MT5.
- Custom Range tính lại theo Deals trong khoảng ngày.
- Auto Common Range dùng khoảng chung để so sánh.

Công thức cần đối chiếu:

- P/D Every Tick = Net Profit / trị tuyệt đối Balance Drawdown Maximal.
- Balance DD % lấy từ Balance Drawdown Maximal Percentage.
- Khi tính từ deals, một trade thường gồm hai deal vào và ra.
- Largest Loss Trade là giao dịch lỗ lớn nhất và thường là số âm.

### Actions

- Eye: Balance Chart, Settings và Results.
- Staging icon: chọn candidate vào Backtest Staging.
- Delete: chỉ xóa candidate Every Tick, không xóa Open Price result hoặc dữ liệu đã sync.

Nếu candidate đang ở Staging bị xóa thì lựa chọn Staging của nó cũng bị loại.

### Auto Pick

1. Thiết lập filter.
2. Nhấn Apply Filters.
3. Nhấn Auto Pick.
4. Chọn thứ tự ưu tiên khi bằng nhau.
5. Chọn Keep Existing hoặc Replace.

Auto Pick chỉ đưa một candidate của mỗi strategy vào Staging.

## 11. Backtest Staging

Mỗi strategy trong session chỉ có một Final Staged Candidate.

Các cột chính: Strategy Final và Pass, Net Profit, P/D, Balance DD, Trades, Profit Factor, Recovery Factor, Largest Loss Trade, Chart và Actions.

### Actions

- Eye: xem Balance Chart, Settings và Results.
- Copy: copy cấu hình tham số.
- Remove: bỏ strategy khỏi Staging.
- Clear Staging: bỏ toàn bộ lựa chọn trong session.

Các thao tác này không xóa Open Price hoặc Every Tick source.

### Sync sang backtest

1. Chọn target table hoặc tạo bảng mới.
2. Chọn conflict mode.
3. Chọn strategy.
4. Nhấn Sync to Backtest Table.
5. Kiểm tra modal và xác nhận.

- Overwrite Existing ghi đè strategy đã có trong đúng bảng đích.
- Keep hoặc Skip Existing giữ bản cũ và chỉ thêm strategy chưa có.

Sau sync cần kiểm tra strategy xuất hiện ở Strategies với đúng Data Source, bảng backtest có Deals, strategy_metadata có Settings và Results, Dashboard đọc được dữ liệu và strategy khác không bị thay đổi.

## 12. TPL Generator

### Đầu vào

- Excel Folder chứa .xlsx Every Tick.
- EA Folder chứa .mq5, .ex5 hoặc .mqh.
- Backtest Group.
- Bot Variant Suffix tùy chọn.
- CSV tùy chọn để điền Risk Money và LotThreshold.

### Thao tác

1. Chọn Excel Folder và EA Folder.
2. Nhập Backtest Group, suffix và CSV nếu cần.
3. Nhấn Preview Templates.
4. Kiểm tra Filename, Symbol, Timeframe, Expert, Magic Number, Risk Money và LotThreshold.
5. Sửa trực tiếp giá trị.
6. Dùng Auto-Fill from CSV hoặc Only CSV-matched nếu cần.
7. Nhấn Generate Templates.
8. Kiểm tra ZIP và Generated Files.

Magic Number, Risk Money và LotThreshold không được trống khi Generate.

## 13. Thông báo

Bell icon có công tắc bật hoặc tắt thông báo MT5.

- Bật: nhận thông báo hoàn thành hoặc thất bại.
- Tắt: không tạo thông báo mới.
- Tắt thông báo không dừng job và không làm mất dữ liệu.

## 14. Quyền dữ liệu

- User thường thao tác dữ liệu trong phạm vi được cấp.
- Admin có phạm vi quản trị rộng hơn.
- Quyền sở hữu theo session hoặc Data Source, không theo worker thực thi.
- Public worker không cho chủ worker quyền xem dữ liệu user khác.

## 15. Kiểm tra nhất quán

Sau một luồng hoàn chỉnh, đối chiếu:

- Số Open Price jobs = strategy x cycles.
- Job COMPLETED có result.
- Open Price result có strategy, pass, summary_op và inputs.
- Every Tick candidate liên kết đúng optimize result.
- summary_bt có Settings và Results.
- deals không trống.
- Backtest Runs tăng đúng một lần.
- Callback trùng source run không làm tăng sai bộ đếm.
- Staging chỉ có một candidate mỗi session và strategy.
- Sync chỉ ghi candidate staging được chọn.
- Đổi session không trộn dữ liệu.

## 16. Lỗi thường gặp

### Verify worker báo 401

Kiểm tra API Key, trạng thái Active, Server URL và môi trường của key.

### Job đứng PENDING

Kiểm tra worker online, Run Access đã Allow, Job Type phù hợp, owner và worker đang polling.

### Open Price COMPLETED nhưng 0 rows

Nếu report không phải full 0 thì đây là lỗi. Thu thập Job ID, Run ID, strategy, report XML, log optimize_results_upload và Stored Parameter Sets.

### Every Tick xong nhưng không có candidate

Kiểm tra trạng thái job, upload result, Settings, Results, Deals và session.

### Không thấy kết quả

Kiểm tra session, Refresh, Reset filter, chế độ xem, My OTM Watchlist và mở strategy nếu đang Group by Strategy.

### Sync xong nhưng Strategies không thấy

Kiểm tra Data Source, Deals, strategy_metadata, filter trang Strategies và cache sau sync.

## 17. Checklist hồi quy

### API Key và Worker

- Tạo, copy, reveal, revoke, delete key.
- Verify key Active.
- Worker chưa Allow không nhận job.
- Worker nhận đúng Job Type.
- Drain và Delete hoạt động.
- Public không làm đổi owner job.

### INI và Queue

- Upload EA và Load INI.
- Sinh ZIP nhiều symbol, timeframe.
- Launch cycles 1 và 2.
- Cancel modal không đổi job khi chưa xác nhận.
- Retry và Delete hoạt động.

### Optimize Results

- All Passes và Group by Strategy nhất quán.
- Search, filter, Top N và cluster hoạt động.
- Watchlist đúng.
- Eye và Download INI hoạt động.
- Start Every Tick không tạo trùng khi đang chạy.

### Backtest Candidates

- Chỉ xuất hiện sau Every Tick thành công.
- Full Period, Custom Range và Common Range hoạt động.
- P/D dùng Balance Drawdown.
- Eye có chart, Settings, Results.
- Auto Pick chỉ chọn một candidate mỗi strategy.
- Delete không xóa Open Price result.

### Staging và Sync

- Chọn và thay candidate cùng strategy.
- Keep Existing và Replace hoạt động.
- Sync bảng mới và bảng đã có.
- Strategy đọc được ở Strategies.
- Remove và Clear không xóa source result.

### TPL

- Preview Excel và EA.
- Sửa Magic, Risk Money, LotThreshold.
- Auto-Fill CSV.
- Generate và tải ZIP.

## 18. Thông tin cần gửi khi báo bug

- Tài khoản và role.
- Môi trường.
- Optimization Session.
- Tab và chế độ xem.
- Job ID, Run ID hoặc Result ID.
- Strategy và Pass.
- Worker Name.
- Các bước tái hiện.
- Kết quả thực tế và mong đợi.
- Ảnh chụp.
- Log backend và MT5 App Worker.
- Request và response lỗi trong Network.

Không gửi API Key thật ra ngoài nhóm nội bộ.
