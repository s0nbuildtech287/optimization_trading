# 📑 Tóm Tắt Cơ Chế Tính Điểm Priority (Strategy Score)

Hệ thống đánh giá sức khỏe chiến lược giao dịch tự động (EA) dựa trên thang điểm **100/100** (Hoàn hảo). Điểm số bị trừ dần nếu vi phạm các cờ rủi ro.

---

## 1. Luật Chí Mạng: Dính Cờ Đỏ = Về 0 Điểm (Bị Loại)

Nếu vi phạm bất kỳ cờ **Hard Flag** nào trong 8 lỗi dưới đây, chiến lược lập tức bị **loại bỏ ngay (0 điểm)**, cấm chạy live:

1.  **Expected Payoff $\le 0$** (Lợi nhuận trung bình mỗi lệnh âm).
2.  **Profit Factor $< 1.2$** (Biên lợi nhuận quá mỏng).
3.  **Recovery Factor $< 1.0$** (Lợi nhuận không bù nổi Drawdown lớn nhất).
4.  **P/D Ratio $< 1.0$** (Lợi nhuận ròng thấp hơn sụt giảm vốn lớn nhất).
5.  **Martingale Triple Flag** (Hành vi nhồi lệnh ngược xu hướng nguy hiểm).
6.  **Chuỗi thua liên tiếp $\ge 20$ lệnh** (Hệ thống gặp lỗi nghiêm trọng).
7.  **Đóng lệnh bằng End of Test $> 10\%$** (Hành vi "gồng lỗ" giả lập vô hạn).
8.  **Profit 12 tháng gần nhất âm** (Chiến lược đã lỗi thời).

---

## 2. Luật Điểm Trừ: Soft Flags (Trừ Điểm Tích Lũy)

Nếu không dính cờ chí mạng ở trên, chiến lược sẽ bị trừ điểm theo các lỗi Soft Flags phát hiện được:

*   **Trừ 20 điểm / cờ (Phạt Nặng): Nhóm Nhồi Lệnh Ẩn**
    *   *Mã cờ:* `#16`, `#17`, `#18`, `#19` (Nhồi lệnh gỡ gạc, lệnh thua đơn lẻ cực lớn).
*   **Trừ 15 điểm / cờ (Phạt Vừa): Nhóm Quá Tối Ưu (Overfit) & Lỗi Vận Hành**
    *   *Mã cờ:* `#12`, `#13`, `#15`, `#23`, `#24`, `#25` (Lợi nhuận theo mùa, giảm hiệu năng, mất tín hiệu live).
*   **Trừ 10 điểm / cờ (Phạt Nhẹ): Nhóm Thống Kê Yếu & Khó Chạy Live**
    *   *Mã cờ:* `#9`, `#10`, `#11`, `#14`, `#20`, `#21`, `#22` (Mẫu lệnh ít, giữ lệnh ngắn dưới 5 phút, spread/commission cao).

---

## 3. Phân Loại Để Deploy Giao Dịch

Dựa vào điểm số cuối cùng để đưa ra quyết định:

*   **🔵 Từ 80 - 100 điểm: ĐẠT (Passed)**
    *   *Hành động:* Đủ điều kiện an toàn, cho phép **Deploy Live trực tiếp**.
*   **🟡 Từ 50 - 79 điểm: CẢNH BÁO (Warning)**
    *   *Hành động:* Có rủi ro trung bình, chỉ nên **chạy thử tài khoản Cent / Demo**.
*   **🔴 Dưới 50 điểm hoặc dính cờ đỏ: LOẠI (Disqualified)**
    *   *Hành động:* Rủi ro cháy tài khoản, **Cấm giao dịch** thực tế.
