# MÔ TẢ THUẬT TOÁN TỐI ƯU HÓA KHỐI LƯỢNG GIAO DỊCH (VOLUME OPTIMIZATION)

Tài liệu này giải thích cách hoạt động của thuật toán **Tối ưu hóa Khối lượng Giao dịch (Lot Threshold Analysis)** một cách đơn giản, dễ hiểu để báo cáo cấp quản lý.

---

## 1. Mục Tiêu của Thuật Toán

Trong giao dịch, không phải cứ vào lệnh với khối lượng (volume/lot) càng lớn thì càng hiệu quả. Đôi khi các lệnh quá lớn chỉ làm gia tăng rủi ro sụt giảm tài khoản (drawdown) mà không đem lại lợi nhuận tương xứng. 

Thuật toán này được tạo ra để:
* Tìm ra một **ngưỡng giới hạn khối lượng lệnh tối đa (Volume Cap)** phù hợp cho từng robot/chiến lược.
* **Tối đa hóa chỉ số hiệu quả P/D (Lợi nhuận / Mức sụt giảm lớn nhất)**: Đảm bảo robot kiếm được nhiều tiền nhất trên mỗi đơn vị rủi ro phải chấp nhận.
* Loại bỏ rủi ro "cháy tài khoản" do những lệnh quá cỡ gây ra.

---

## 2. Các Bước Thực Hiện Chi Tiết

Thuật toán thực hiện phân tích tự động qua 5 bước sau:

### Bước 1: Chọn khoảng thời gian phân tích chung
Để đảm bảo so sánh công bằng giữa tất cả robot, thuật toán tự động tìm ra khoảng thời gian giao nhau mà tất cả các robot đều đang hoạt động giao dịch tích cực. Mọi tính toán tối ưu hóa sau đó chỉ thực hiện trên khoảng thời gian chung này.

### Bước 2: Lấy lịch sử giao dịch thực tế
Hệ thống lấy toàn bộ lịch sử lệnh giao dịch thực tế của từng robot trong khoảng thời gian trên (sắp xếp theo thứ tự thời gian tăng dần để đảm bảo tính toán đúng diễn biến tài khoản thực tế).

### Bước 3: Tạo ra các mốc khối lượng thử nghiệm
Thay vì thử các con số ngẫu nhiên, hệ thống tự động quét các mốc khối lượng thực tế mà robot đã từng giao dịch.
* Thuật toán cũng tự động tính toán khối lượng tối đa cho phép của sàn giao dịch (Broker Cap) dựa trên dữ liệu phí hoa hồng an toàn để làm giới hạn trên.
* Sắp xếp các mốc khối lượng này theo thứ tự từ lớn đến nhỏ để chuẩn bị cho bước giả lập.

### Bước 4: Giả lập kết quả trên từng mốc khối lượng
Thuật toán chạy giả lập trong bộ nhớ để trả lời câu hỏi: *"Nếu trong quá khứ, chúng ta giới hạn không cho robot vào lệnh lớn hơn mức X lot, thì kết quả giao dịch bây giờ sẽ ra sao?"*

Với mỗi mốc khối lượng X, thuật toán lọc bỏ/cắt giảm các lệnh vượt quá X lot và tính toán lại các chỉ số:
1. **Lợi nhuận ròng:** Tổng tiền kiếm được (đã trừ phí hoa hồng và phí qua đêm).
2. **Sụt giảm tài khoản lớn nhất (Max Drawdown):** Mức sụt giảm sâu nhất của tài khoản từ đỉnh gần nhất trong suốt quá trình giao dịch.
3. **Tổng số giao dịch còn lại:** Số lượng lệnh robot thực hiện sau khi lọc khối lượng.
4. **Tỷ lệ thắng (Win Rate):** Phần trăm lệnh có lợi nhuận trên tổng số lệnh.
5. **Chỉ số P/D:** Bằng *Lợi nhuận ròng* chia cho *Sụt giảm tài khoản lớn nhất*. Đây là chỉ số quan trọng nhất để đánh giá hiệu quả.

### Bước 5: Lọc điều kiện an toàn và lựa chọn mốc tối ưu nhất
Từ danh sách kết quả giả lập, hệ thống tìm ra mốc tối ưu nhất dựa trên các quy tắc:

* **Điều kiện an toàn tối thiểu (Ràng buộc cứng):**
  1. Robot phải thực hiện **tối thiểu 100 giao dịch** (để tránh trường hợp robot chỉ giao dịch vài lệnh may mắn rồi dừng lại).
  2. Mức sụt giảm lớn nhất (Max Drawdown) phải đạt **tối thiểu 100,000 USD** (để tránh sai số tính toán khi mức sụt giảm quá nhỏ gần bằng 0).
  
* **Lựa chọn mốc tốt nhất:**
  * Chọn mốc khối lượng có **chỉ số P/D cao nhất**.
  * Nếu có nhiều mốc có P/D bằng nhau, ưu tiên chọn mốc đem lại **tổng lợi nhuận cao hơn**.
  
* **Cơ chế dự phòng (Fallback):**
  * Nếu không có mốc nào thỏa mãn điều kiện an toàn tối thiểu ở trên (ví dụ robot giao dịch quá ít), hệ thống sẽ giữ nguyên khối lượng giao dịch gốc ban đầu (không giới hạn) để tránh đưa ra các quyết định tối ưu hóa sai lệch.

---

## 3. Điểm Nổi Bật Về Mặt Công Nghệ & Hiệu Năng

* **Tốc độ xử lý siêu nhanh:** Toàn bộ quá trình giả lập hàng trăm mốc khối lượng cho mỗi robot được tính toán trực tiếp trên RAM (In-Memory), không cần gọi liên tục vào cơ sở dữ liệu nên chỉ mất vài mili-giây cho mỗi chiến lược.
* **Xử lý song song:** Hệ thống tự động chia tải cho hàng chục tiến trình chạy song song cùng lúc, cho phép quét và tối ưu hóa hàng trăm robot chỉ trong vòng vài giây.
* **Lưu trữ tối ưu:** Các kết quả tính toán được gom lại thành các gói dữ liệu lớn (Batch) rồi lưu vào cơ sở dữ liệu một lần duy nhất, tránh gây nghẽn mạng hoặc quá tải database.
