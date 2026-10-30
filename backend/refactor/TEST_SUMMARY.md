🛡️ TỔNG HỢP PHẠM VI KIỂM THỬ (TEST COVERAGE SUMMARY)
Tệp tổng hợp phạm vi kiểm thử tự động phục vụ chiến dịch Refactor dự án LotusQuant
Biên soạn gửi: Đại ca Xuân Sơn

Bộ kiểm thử tự động tại thư mục backend/refactor/verify_test/ được thiết kế để khóa cứng toàn bộ hành vi, cấu trúc API và công thức tính toán của hệ thống. Dưới đây là tổng hợp chi tiết tất cả các phân hệ và kịch bản đã được viết mã kiểm thử thành công:


[1] PHẠM VI KIỂM THỬ BACKEND (API & DATABASE)

- Nhóm 1: Kiểm thử Cấu trúc & Định dạng API (api_contract.test.js)
  Mục tiêu: Đảm bảo cấu trúc phản hồi JSON của các API chính không bị thay đổi key, mất thuộc tính hay thay đổi kiểu dữ liệu.
  + Kịch bản 1: GET /api/strategies?page=1&pageSize=5 — Kiểm tra mảng dữ liệu danh sách chiến thuật mặc định.
  + Kịch bản 2: GET /api/strategies/ids — Kiểm tra danh sách rút gọn chỉ gồm strategy ID (dùng cho copy).
  + Kịch bản 3: GET /api/strategies/symbols/distinct — Kiểm tra danh sách các mã giao dịch (symbols) duy nhất trong DB.
  + Kịch bản 4: GET /api/strategies/statistics/summary — Kiểm tra cấu trúc bản ghi KPIs tổng quan của hệ thống.
  + Kịch bản 5: GET /api/dashboard — Kiểm tra dữ liệu tích hợp vẽ biểu đồ và bảng trên màn hình Overview Dashboard.
  + Kịch bản 6: GET /api/dashboard/risk-analysis — Kiểm tra dữ liệu đầu vào của các biểu đồ sụt giảm tài khoản (Risk Analysis).
  + Kịch bản 7: GET /api/dashboard/behavior-analysis — Kiểm tra dữ liệu heatmap giờ/ngày/tháng và các thông số hành vi bot (Behavior Analysis).
  + Kịch bản 8: GET /api/dashboard/comparative-ranking — Kiểm tra cấu trúc ma trận so sánh xếp hạng (Comparative Ranking).
  + Kịch bản 9: GET /api/data?tableName=backtest_temp1&page=1&pageSize=10 — Kiểm tra dữ liệu thô deals giao dịch của bảng backtest.
  + Kịch bản 10: GET /api/balance-chart/backtest_temp1/001BTCUSDH1OB — Kiểm tra dữ liệu mảng toạ độ điểm vẽ biểu đồ Equity Balance Chart.
  + Kịch bản 11: GET /api/market/prices — Kiểm tra dữ liệu giá thị trường (Market Watch).
  + Kịch bản 12: GET /api/market/news/BTCUSD — Kiểm tra API tin tức thị trường (News).

- Nhóm 2: Kiểm thử Công thức Toán học & Tính toán Động (calculations.test.js)
  Mục tiêu: Gọi trực tiếp mã nguồn tầng Service/DAO của Backend để khóa cứng các công thức toán tài chính thô, kiểm tra sai số dấu phẩy động.
  + Kịch bản 1: strategyMetadataDao.getStrategiesByTimeRange — Kiểm tra công thức tính toán động trong kỳ từ deals thô:
    * Tỉ lệ P/D (Profit/Drawdown Ratio) = total_profit / absolute(max_drawdown)
    * Tỉ lệ Win Rate = (winning_deals / total_deals) * 100
    * Mức độ sụt giảm tối đa (Max Drawdown)
  + Kịch bản 2: behaviorAnalysisService.getBehaviorStrategyDetail — Kiểm tra các chỉ số phân tích hành vi nâng cao:
    * HTR (Holding Time Ratio) = average_loss_trade_duration / average_win_trade_duration
    * Martingale Multiplier (Volume Escalation) = Tỉ lệ tăng khối lượng lệnh sau chuỗi thua liên tiếp (Base, 1 Loss, 2 Losses, 3 Losses...)
  + Kịch bản 3: riskAnalysisService.getRiskOverviewSummary — Kiểm tra tổng quan các cờ rủi ro (risk flags), số lượng bot vi phạm kỷ luật.
  + Kịch bản 4: dashboardDao.getDashboardOverview — Kiểm tra dữ liệu gộp tổng số tiền lãi, tổng phí commission, tổng swap thực tế.

- Nhóm 3: Kiểm thử Bộ lọc & Phân trang Query (filter_pagination.test.js)
  Mục tiêu: Đảm bảo refactor bộ dựng câu lệnh SQL (Query Builder) không làm lệch kết quả tìm kiếm, sắp xếp.
  + Kịch bản 1: Lọc đơn và lọc nhiều Symbols: Test lọc chiến thuật khớp chính xác theo symbol (BTCUSD) và danh sách nhiều symbols (BTCUSD, ETHUSD).
  + Kịch bản 2: Phân trang: Kiểm tra tham số page và pageSize cắt đúng dải dữ liệu phân trang.
  + Kịch bản 3: Sắp xếp (Sorting): Kiểm tra sắp xếp theo lợi nhuận giảm dần (totalNetProfit desc) và số lượng lệnh tăng dần (quantity asc).
  + Kịch bản 4: Toán tử lọc tĩnh: Test các toán tử so sánh lớn hơn hoặc bằng (>=), nhỏ hơn hoặc bằng (<=) trên các chỉ số profitFactor, sharpeRatio.
  + Kịch bản 5: Lọc khoảng giá trị (Ranges): Test bộ lọc trong khoảng [min : max] của Sharpe Ratio và Profit Factor.
  + Kịch bản 6: Bộ lọc phức hợp (Combo): Kết hợp đồng thời lọc Symbol + lọc Timeframe + lọc toán tử so sánh tĩnh.

- Nhóm 4: Kiểm thử Bảo mật & Ngoại lệ Edge Cases (edge_cases.test.js)
  Mục tiêu: Bảo vệ ứng dụng trước các lỗi dữ liệu không hợp lệ hoặc các cuộc tấn công SQL độc hại.
  + Kịch bản 1: Tham số rác: Truyền page=abc (NaN) không gây crash máy chủ, phản hồi mã lỗi kiểm soát được.
  + Kịch bản 2: Bảng không tồn tại: Lọc theo bảng rác non_existent_table trả về mảng rỗng [] an toàn thay vì crash query.
  + Kịch bản 3: Chống SQL Injection qua tên bảng: Thử chèn payload "DROP TABLE users;--". Cơ chế Parameterized Query hoạt động an toàn, bảng strategy_metadata không bị phá hoại.
  + Kịch bản 4: Chống SQL Injection qua bộ lọc: Thử chèn payload ' OR '1'='1 vào symbol. Hệ thống chặn đứng, trả về mảng rỗng, không rò rỉ dữ liệu.
  + Kịch bản 5: Transaction Rollback: Thực thi thử lệnh ghi trong một Transaction, sau đó gọi ROLLBACK và xác nhận DB khôi phục 100% về trạng thái cũ, không để lại dữ liệu rác.

- Nhóm 5: Kiểm thử Chịu tải Đồng thời DB (pool.test.js)
  Mục tiêu: Đảm bảo driver pg pool giải phóng kết nối chuẩn, không bị nghẽn.
  + Kịch bản 1: Giả lập chạy 40 truy vấn SQL song song đồng thời vào DB. Đảm bảo toàn bộ 40/40 phản hồi thành công dưới 1 giây, pool tái sử dụng kết nối tốt, không bị cạn kiệt (Connection Exhausted).


[2] PHẠM VI KIỂM THỬ FRONTEND (UI UTILS & LOGIC TRANSFORMS)

- Nhóm 6: Kiểm thử Logic Format & Trạng thái FE (frontend_logic.test.js)
  Mục tiêu: Trích xuất các hàm Javascript thuần của Frontend để test độc lập, đảm bảo giao diện hiển thị chuẩn xác.
  + Kịch bản 1: Định dạng hiển thị (order-format.js):
    * Hàm formatCurrency — Đảm bảo định dạng đúng chuẩn đô la Mỹ ($1,234.56), xử lý số âm (-$123.40) và hiển thị dấu gạch ngang (-) nếu dữ liệu null.
    * Hàm formatNumber — Định dạng số thập phân có làm tròn 2 chữ số.
    * Hàm formatDate — Định dạng chuỗi ngày ISO sang ngày đọc được (en-US).
    * Hàm getTypeColor và getDirectionColor — Gán đúng màu hiển thị MUI (success/error/primary/secondary).
  + Kịch bản 2: Lưu trữ trạng thái LocalStorage (dashboardTable.js):
    * Giả lập đối tượng window.localStorage để test đọc/ghi tên bảng đang chọn.
    * Đọc/ghi và parse khoảng thời gian lọc (startDate, endDate).
    * Kiểm tra cơ chế tự động khôi phục (fallback) khi môi trường Storage bị lỗi hoặc không có dữ liệu.
  + Kịch bản 3: Mô phỏng bộ lọc useTableState:
    * Kiểm tra hàm lọc tìm kiếm khớp một phần không phân biệt hoa thường.
    * Kiểm tra logic cắt mảng phân trang ngoài FE.
  + Kịch bản 4: Phân loại Directional Bias:
    * Test công thức tính toán tỉ lệ Buy % vs Sell % để gán nhãn trạng thái (DirectionalBias / One-Way Edge / Balanced) hiển thị ngoài biểu đồ.
  + Kịch bản 5: Biến đổi dữ liệu biểu đồ (Chart Data Transforms):
    * Hàm computeScaleFor (trích xuất từ overview.jsx) — Kiểm tra chia tỷ lệ tự động cho trục Y của Recharts (đơn vị triệu M hoặc tỷ B) và tính toán khoảng cách tick (step).
    * Hàm phân loại trạng thái rủi ro HTR & VEI (phục vụ biểu đồ Holding Time vs Volatility) — Trả về nhãn trạng thái (Critical Risk / Loss Averse / Martingale Risk / Excellent) tương ứng với cặp giá trị HTR và VEI.
