🛡️ BÁO CÁO SO SÁNH DỮ LIỆU & HỒI QUY (REGRESSION REPORT)
Thời gian chạy: 14:30:29 1/7/2026

[1] TỔNG QUAN HỆ THỐNG
- Trạng thái an toàn: 🟢 AN TOÀN
- Kết luận: Không phát hiện bất kỳ sự thay đổi behavior hoặc sai số dữ liệu nào. ĐỦ ĐIỀU KIỆN TIẾP TỤC REFACTOR.


[2] TRẠNG THÁI HIỂN THỊ CÁC TRANG & CHỨC NĂNG (VISUAL PAGES CHECKLIST)

- Liên kết API & Bộ lọc kết hợp ............................. [ 🟢 OK ]
  (Khóa cứng query SQL động và bộ xử lý tham số lọc nâng cao ngoài FE)

- Trang Overview (Dashboard Tổng quan) ...................... [ 🟢 OK ]
  (Kiểm chứng KPI thô, mảng dữ liệu đồ thị tổng quan tháng/năm khớp 100%)

- Trang Risk Analysis (Phân tích Rủi ro) ...................... [ 🟢 OK ]
  [Chi tiết hoạt động các Tab con]:
  + Risk View: Khóa hard/soft flags qua 'allFlags'
  + Strategy View: Khóa bảng thống kê flags từng Bot qua 'strategyView'
  + Portfolio Checks: Khóa biểu đồ exposure, Neutral Ratio qua 'portfolioChecks'
  + Volume Optimization: Khóa đường cong tối ưu hóa khối lượng qua 'volumeOptimization'

- Trang Behavior Analysis (Hành vi Bot) ..................... [ 🟢 OK ]
  [Chi tiết hoạt động các Tab con]:
  + Directional Bias: Khóa heatmap 24h, mốc Y-scale và bias status
  + Trading Activity: Khóa dữ liệu gap và bảng activity logs
  + Exit Behavior: Khóa biểu đồ tròn tỷ lệ TP, SL, cutoff
  + Holding & Recovery: Khóa biểu đồ phân tán Holding vs Volatility và HTR/VEI status

- Trang Comparative Ranking (Ma trận Xếp hạng) ............... [ 🟢 OK ]
  (Khóa cứng toàn bộ điểm Composite chuẩn hóa và mảng xếp hạng đa chỉ số thô)

- Trang Strategies (Danh sách chiến thuật) ................... [ 🟢 OK ]
  (Kiểm thử bộ lọc kết hợp phức tạp, phân trang và sắp xếp)

- Trang Order List (Danh sách deals giao dịch) ............... [ 🟢 OK ]
  (Kiểm chứng phân trang SQL thô và tính toán lợi nhuận ròng)

- Trang Market Watch (Theo dõi thị trường) .................. [ 🟢 OK ]
  (Kiểm tra API dữ liệu giá thị trường và thống kê zone hiệu năng theo symbol)

- Trang News (Tin tức thị trường) ........................... [ 🟢 OK ]
  (Kiểm tra API tin tức thị trường theo symbol)


[3] CHI TIẾT KẾT QUẢ TEST RUNNER
- api_contract.test.js ........................................ [ 🟢 PASS ]
- calculations.test.js ........................................ [ 🟢 PASS ]
- filter_pagination.test.js ................................... [ 🟢 PASS ]
- edge_cases.test.js .......................................... [ 🟢 PASS ]
- pool.test.js ................................................ [ 🟢 PASS ]
- frontend_logic.test.js ...................................... [ 🟢 PASS ]


[4] ĐỐI CHIẾU HỒI QUY SNAPSHOT (BASELINE vs LATEST)
- Tổng số lỗi lệch dữ liệu phát hiện: 0 lỗi.
- Kết luận đối chiếu: Tuyệt vời! Toàn bộ cấu trúc JSON và các chỉ số dấu phẩy động khớp 100% với dữ liệu đóng băng gốc.



[5] CHI TIẾT LOG LỖI RUNNER (NẾU CÓ)
Không có lỗi.