# Trading Quant System Backtest

> Nền tảng nghiên cứu định lượng và kiểm thử chiến lược giao dịch, kết nối toàn bộ quy trình từ dữ liệu backtest, tối ưu hóa MT5, phân tích hiệu suất đến lựa chọn chiến lược.

🌐 **Live website:** [backtestt.id.vn](https://backtestt.id.vn)
🧪 **Interactive demo:** [backtestt.id.vn/demo](https://backtestt.id.vn/demo)

---

## Tổng quan dự án

Trading Quant System Backtest được xây dựng để giải quyết một vấn đề thực tế: dữ liệu chiến lược thường nằm rời rạc trong file Excel, kết quả MT5, máy worker và các báo cáo thủ công. Điều này khiến việc so sánh, kiểm chứng và chọn chiến lược mất nhiều thời gian, đồng thời dễ xảy ra sai sót.

Hệ thống đưa các bước đó vào một workflow thống nhất:

~~~text
Strategy & Parameters
        ↓
Distributed MT5 Backtesting
        ↓
Data Validation & Normalization
        ↓
Performance / Risk / Behavior Analysis
        ↓
Candidate Selection
        ↓
Export, Review & Monitoring
~~~

Người dùng có thể theo dõi toàn bộ vòng đời của một chiến lược trên cùng một nền tảng thay vì thao tác thủ công qua nhiều công cụ riêng biệt.

## Điểm nổi bật

### 1. Quy trình nghiên cứu định lượng end-to-end

Hệ thống không chỉ hiển thị số liệu mà hỗ trợ đầy đủ các bước:

- Quản lý dữ liệu backtest và danh sách chiến lược.
- Lọc, so sánh và đánh giá hiệu suất.
- Kiểm tra rủi ro, hành vi và độ ổn định.
- Chạy tối ưu hóa Open Price và xác thực Every Tick.
- Theo dõi worker, hàng đợi, tiến độ và lịch sử job.
- Chọn candidate phù hợp và xuất cấu hình sử dụng tiếp.

### 2. MT5 Optimization phân tán

Khối MT5 Optimization được thiết kế theo mô hình queue và worker:

- Chia workload cho nhiều máy chạy MT5.
- Theo dõi heartbeat và trạng thái worker.
- Quản lý job Pending, Running, Done, Failed và Cancelled.
- Hỗ trợ retry, rerun và phục hồi tiến trình.
- Thu thập kết quả từ nhiều lần chạy về một nguồn dữ liệu thống nhất.
- Tách Open Price optimization và Every Tick validation.

Thiết kế này giúp các tác vụ nặng được xử lý ngoài web server, tránh làm nghẽn API và cho phép mở rộng thêm worker khi cần.

### 3. Dashboard phân tích chuyên sâu

Dashboard cung cấp nhiều góc nhìn thay vì chỉ xếp hạng theo lợi nhuận:

- Net Profit, Profit Factor, Drawdown, Recovery Factor và Sharpe Ratio.
- P/D Ratio và độ ổn định của chiến lược.
- Phân tích theo symbol, timeframe và thời gian.
- Risk flags và cảnh báo tập trung danh mục.
- Behavioral analysis: thiên lệch Buy/Sell, khoảng trống hoạt động, hành vi thoát lệnh.
- Comparative ranking giữa các strategy candidate.
- Equity/balance sparkline giúp nhận biết hình dạng tăng trưởng ngay trên bảng.

### 4. Kiểm tra và chuẩn hóa dữ liệu tự động

Hệ thống hỗ trợ kiểm tra dữ liệu đầu vào trước khi phân tích:

- Kiểm tra tên file, cấu trúc strategy và metadata.
- Phát hiện dữ liệu thiếu, file trống hoặc danh sách deal rỗng.
- Kiểm tra Swap, Volume và Comment.
- Phát hiện lỗi logic lệnh như mở chồng lệnh hoặc đóng quá nhanh.
- Gom nhóm lỗi cùng loại để báo cáo dễ đọc.
- Xuất báo cáo CSV/XLSX phục vụ rà soát.

### 5. Quản lý candidate có kiểm soát

Kết quả optimization được quản lý theo candidate cụ thể thay vì chỉ dựa vào rank:

- Lưu chính xác bộ tham số được chọn.
- Watch List cho các candidate đáng chú ý.
- So sánh Open Price và Every Tick.
- Theo dõi trạng thái Passed, Failed và Sync.
- Giữ lịch sử lựa chọn và kết quả theo batch.
- Hạn chế chọn nhầm candidate khi filter hoặc thứ hạng thay đổi.

### 6. Demo Mode tách biệt dữ liệu thật

Website có một workspace demo sử dụng chính giao diện sản phẩm:

- Không yêu cầu đăng nhập.
- Có mock data cho Dashboard, Risk, Behavior, Comparative Ranking, Orders, Strategies và MT5 Optimization.
- Tất cả thao tác ghi bị khóa.
- Demo không truy cập dữ liệu production.
- Sau khi đăng nhập, mỗi user chỉ làm việc với dữ liệu thuộc workspace của mình.

Điều này cho phép nhà tuyển dụng hoặc người đánh giá trải nghiệm sản phẩm ngay mà không cần được cấp tài khoản.

### 7. Thiết kế chú trọng độ ổn định

Một số quyết định kỹ thuật đáng chú ý:

- Background job thay cho HTTP request kéo dài.
- Queue giới hạn concurrency cho tác vụ nặng.
- Idempotency để tránh tạo job trùng.
- Resume job sau khi backend hoặc worker khởi động lại.
- Database-backed metadata giúp giảm phụ thuộc vào file tạm.
- Cleanup artifact/workspace để tránh dữ liệu cục bộ phình theo thời gian.
- Read-only mock layer độc lập với API production.

## Kiến trúc tổng quan

~~~mermaid
flowchart LR
    FE[React Web App] --> API[Express API]
    API --> DB[(PostgreSQL)]
    API --> Q[MT5 Job Queue]
    Q --> W1[MT5 Worker 1]
    Q --> W2[MT5 Worker 2]
    Q --> WN[MT5 Worker N]
    W1 --> MT5[MetaTrader 5]
    W2 --> MT5
    WN --> MT5
    MT5 --> API
    API --> FE
~~~

## Công nghệ sử dụng

| Thành phần | Công nghệ |
|---|---|
| Frontend | React 19, Vite, Material UI, React Router |
| Data visualization | Recharts, MUI X Charts, Lightweight Charts |
| Backend | Node.js, Express |
| Database | PostgreSQL, Sequelize, pg |
| MT5 integration | MQL5, EX5, INI configuration, distributed workers |
| Data processing | ExcelJS, SheetJS/XLSX, XML/HTML parsers |
| Authentication | JWT, bcrypt |
| Automation | Job queue, heartbeat, retry, background processing |
| AI integration | OpenAI API cho các tính năng phân tích/hỗ trợ |
| Deployment | Ubuntu VPS, Nginx, Cloudflare Tunnel/DNS |
| Tooling | ESLint, Prettier, Puppeteer, Swagger/OpenAPI |

## Cấu trúc repository

~~~text
optimization_trading/
├── backend/       # REST API, database, analytics và MT5 orchestration
├── front-end/     # React application, dashboard và Demo Mode
├── backup-mt5/    # MT5 utilities và công cụ hỗ trợ worker
├── deploy.js      # Script build/deploy tự động
└── README.md
~~~

Trong **backend/allbot** có thư viện EA mẫu gồm mã nguồn .mq5 và file đã compile .ex5, phục vụ quá trình tạo cấu hình và chạy optimization.

## Chạy dự án local

### Yêu cầu

- Node.js 20+
- PostgreSQL
- npm hoặc Yarn
- MetaTrader 5 trên máy worker nếu chạy optimization thực tế

### 1. Backend

~~~bash
cd backend
cp .env.example .env
npm install
npm start
~~~

Các biến môi trường chính:

~~~env
DATABASE_URL=postgresql://user:password@localhost:5432/database_name
CORS_ORIGIN=http://localhost:3456
PORT=5000
OPENAI_API_KEY=
~~~

### 2. Frontend

~~~bash
cd front-end
cp .env.example .env
npm install
npm start
~~~

~~~env
VITE_API_BASE_URL=http://localhost:5000
~~~

Frontend development server và backend cần được cấu hình CORS tương ứng.

### 3. Production build

~~~bash
cd front-end
npm run build
~~~

Repository cũng cung cấp **deploy.js** để tự động build và triển khai frontend/backend lên VPS đã cấu hình.

## Giá trị kỹ thuật thể hiện qua dự án

Dự án thể hiện khả năng xây dựng một sản phẩm có nhiều thành phần phối hợp:

- Thiết kế frontend dashboard với lượng dữ liệu và trạng thái lớn.
- Xây dựng REST API và tầng truy cập PostgreSQL.
- Orchestration tác vụ nền và worker phân tán.
- Xử lý file Excel, XML, INI và dữ liệu MT5.
- Thiết kế luồng có retry, idempotency, resume và cleanup.
- Tách biệt môi trường demo, user workspace và production.
- Triển khai ứng dụng thực tế qua VPS, Nginx và Cloudflare.

Đây là một hệ thống thiên về **data-intensive application**, **workflow automation** và **distributed processing**, không chỉ là một website CRUD thông thường.

## Lưu ý

Sản phẩm phục vụ nghiên cứu, backtesting và đánh giá chiến lược. Kết quả quá khứ không đảm bảo hiệu suất giao dịch trong tương lai và không được xem là lời khuyên tài chính.

---

Built as a practical quantitative research and trading-system engineering project.

