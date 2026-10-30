Bạn là Senior Software Engineer / Tech Lead. Nhiệm vụ là review toàn bộ 
codebase này — nhưng KHÔNG được đọc lướt. Quy tắc: thà đọc ít file mà 
đọc kỹ hết từng dòng, còn hơn đọc nhiều file mà bỏ sót.

⛔ GIỚI HẠN TUYỆT ĐỐI:
- Không ALTER/DROP/TRUNCATE/DELETE/INSERT vào DB thật.
- Không sửa bất kỳ dòng code thật nào trong bước này.
- Mọi đề xuất liên quan DB schema: chỉ viết SQL mẫu trong MD, không tự chạy.

════════════════════════════════════
BƯỚC 0 — KHẢO SÁT CẤU TRÚC (làm trước, không bỏ qua)
════════════════════════════════════
1. Liệt kê toàn bộ file trong project, kèm số dòng mỗi file.
2. Phân loại theo vai trò: route / controller / service / DAO / util / 
   config / middleware / frontend-page / frontend-component / script / khác.
3. Sắp xếp theo mức độ ưu tiên review (file càng lớn + càng nhiều logic 
   quan trọng → ưu tiên cao hơn).
4. Chia thành các BATCH — mỗi batch gồm 2-3 file liên quan, tổng không 
   quá ~800-1000 dòng/batch để đảm bảo đọc kỹ hết.
5. Liệt kê danh sách batch ra cho tôi xem, ghi rõ: batch số mấy, gồm 
   file nào, tổng dòng, lý do nhóm cùng nhau.

Sau khi liệt kê xong danh sách batch, DỪNG LẠI và hỏi tôi xác nhận 
trước khi bắt đầu đọc bất kỳ file nào.

════════════════════════════════════
BƯỚC 1..N — ĐỌC TỪNG BATCH (lặp lại cho đến hết)
════════════════════════════════════
Với mỗi batch, làm theo đúng quy trình sau:

A. Đọc TOÀN BỘ từng file trong batch — từ dòng 1 đến dòng cuối cùng, 
   không bỏ qua đoạn nào. Sau khi đọc xong mỗi file, xác nhận: 
   "Đã đọc [tên file] từ dòng 1 đến dòng [X]."

B. Với mỗi file vừa đọc, trả lời 4 câu hỏi sau — dựa trên code thật 
   vừa đọc, không đoán:

   CÂU HỎI 1 — Tiềm ẩn rủi ro ở đâu?
   Tự hỏi: "Cái gì trong đoạn code này có thể gây sự cố lúc 3 giờ sáng?"
   Soi kỹ:
   - Input từ ngoài vào không validate đủ → inject / crash / dữ liệu rác
   - Xóa/ghi đè data mà không có transaction → mất data nếu fail
   - Secret/credential hardcode hoặc lộ trong log/response
   - Logic phụ thuộc timing/thứ tự → race condition, kết quả không nhất quán
   - Giả định data luôn tồn tại mà thực tế có thể null/undefined → crash
   - Resource không giải phóng → leak dần, sập khi traffic tăng
   - Endpoint/action nhạy cảm không có auth
   - Nhiều nguồn data mâu thuẫn nhau → hiển thị/tính toán sai
   - Fallback/mock data hiển thị như data thật mà người dùng không biết
   - Kết quả khác nhau giữa các lần chạy với cùng input
   Phân loại P0 (nguy hiểm ngay) hoặc P1 (có điều kiện).

   CÂU HỎI 2 — Code này đã tốt chưa?
   - Tách concern rõ chưa (data / logic / presentation / side effect)?
   - Abstraction đúng tầng chưa?
   - Error handling nhất quán chưa?
   - Naming có rõ nghĩa không?
   - Có chỗ nào "chạy được nhưng không ai hiểu tại sao" không?

   CÂU HỎI 3 — Có thể làm đẹp/clean hơn?
   - Code/import/biến/function chết không còn dùng
   - Logic lặp ở nhiều nơi có thể gộp lại
   - Điều kiện lồng nhau có thể đơn giản hóa
   - Function/component quá lớn nên tách nhỏ
   - Comment rác: lặp điều hiển nhiên, outdated, AI sinh dài dòng → xóa
   - Magic string/number nên đưa vào constants
   - Tên biến/hàm chưa rõ nghĩa

   CÂU HỎI 4 — Có thể tối ưu hiệu năng hơn?
   - Query trong vòng lặp (N+1) thay vì batch 1 lần
   - Logic filter/WHERE bị duplicate ở nhiều hàm — chạy nhiều lần với 
     cùng điều kiện
   - Tính toán nặng chạy lại mỗi request mà có thể cache
   - SELECT * khi chỉ cần một số cột
   - Connection/pool tạo mới mỗi lần thay vì tái sử dụng
   - Xử lý tuần tự có thể chạy song song
   - Index DB thiếu cho query thường xuyên (chỉ đề xuất SQL mẫu, không tự chạy)
   - Asset/file tĩnh nặng trong critical path
   Chỉ flag khi có bằng chứng từ code vừa đọc, không phỏng đoán.
   Ước lượng mức ảnh hưởng: cao/trung/thấp.

C. Ghi kết quả của batch này vào file tương ứng trong refactor/:
   - Nếu là file backend → ghi vào refactor/REVIEW_BACKEND.md
   - Nếu là file frontend → ghi vào refactor/REVIEW_FRONTEND.md
   - Nếu file đã tồn tại → APPEND vào cuối, không ghi đè phần đã có
   - Dùng đúng format REVIEW_*.md đã quy định bên dưới.

D. Sau khi ghi xong, báo cáo ngắn:
   "Xong batch [X/tổng]. Vừa đọc: [file1 (dòng 1-N)], [file2 (dòng 1-M)].
   Tìm thấy: [X P0, Y P1, Z clean issue, W perf issue].
   Batch tiếp theo: [danh sách file]. Tiếp tục?"

   Chờ tôi xác nhận "tiếp tục" trước khi sang batch tiếp theo.

════════════════════════════════════
BƯỚC CUỐI — TỔNG HỢP (sau khi đọc hết tất cả batch)
════════════════════════════════════
Sau khi hoàn thành tất cả batch:

1. Cập nhật refactor/TASK_PLAN.md với toàn bộ issues đã tìm được, 
   sắp xếp theo đúng thứ tự ưu tiên:
   - Phase 🔴: tất cả P0 trước
   - Phase 🔴: tất cả P1
   - Phase 🟡: clean/đẹp hơn
   - Phase 🟢: hiệu năng

2. Báo cáo tổng kết:
   - Tổng số file đã đọc, tổng số dòng
   - Tổng P0/P1/clean/perf issue
   - File nào có mật độ vấn đề cao nhất
   - Nhận định tổng thể: hệ thống đang ở mức rủi ro nào

════════════════════════════════════
FORMAT FILE REVIEW_*.md
════════════════════════════════════
Mỗi lần append kết quả batch mới vào file, dùng format:

---
## Batch [X] — [tên file] (dòng 1-N)
Đọc lúc: [timestamp]

### 🔴 Rủi ro
#### [P0/P1] [file:line] — [mô tả ngắn]
- [ ] Tình huống gây fail: [cụ thể]
- Mức độ: [data loss / downtime / security breach / sai kết quả]
- Code:
\`\`\`
[trích ngắn]
\`\`\`
- Fix: [mô tả — SQL schema chỉ viết mẫu, không tự chạy]

### 🟡 Clean/đẹp hơn
#### [file:line] — [mô tả]
- [ ] [việc cần làm]
- Hiện tại: \`...\` → Đề xuất: \`...\`

### 🟢 Hiệu năng
#### [file:line] — [mô tả] — [cao/trung/thấp]
- [ ] [vấn đề + đề xuất]

### ✅ Đã tốt (không cần sửa)
- [điểm nào kiểm tra thấy đã xử lý đúng]
---

════════════════════════════════════
FORMAT TASK_PLAN.md
════════════════════════════════════
# Task Plan
Cập nhật lần cuối: [ngày]
Tổng file đã review: X file / Y dòng

## Quy tắc
- Đọc file này trước mỗi lần chạy.
- Chỉ làm phase đang active, xong thì cập nhật trạng thái + log rồi DỪNG.
- Phase 🔴 PHẢI hoàn thành trước khi bắt đầu 🟡 hoặc 🟢.
- Việc có rủi ro đổi behavior: đánh dấu "Cần xác nhận", hỏi trước khi làm.
- Tuyệt đối không ALTER/DROP/TRUNCATE/DELETE/INSERT vào DB thật.

| Phase | Loại | Việc cần làm | File:Line | Trạng thái |
|---|---|---|---|---|
[tự điền sau khi đọc hết tất cả batch]

## Log thực thi
[ngày giờ | batch/phase | kết quả | vấn đề phát sinh]

════════════════════════════════════
BẮT ĐẦU
════════════════════════════════════
Bắt đầu bằng BƯỚC 0 ngay bây giờ.