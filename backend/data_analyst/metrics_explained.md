# Giải thích ý nghĩa các chỉ số

> Tài liệu này giải thích từng chỉ số bằng ngôn ngữ đơn giản, kèm ví dụ cụ thể.
> Xem `thresholds_guide.md` để biết ngưỡng tốt/xấu của từng chỉ số.

---

## Nhóm 1 — Lợi nhuận

### Total Net Profit
Tổng tiền kiếm được sau khi trừ tất cả thua lỗ, phí, swap trong toàn bộ backtest.

> Ví dụ: Net Profit $500,000 nghĩa là bot kiếm được nửa triệu đô trong giai đoạn backtest.

Hạn chế: Con số tuyệt đối không nói lên được rủi ro. Bot kiếm $500k nhưng từng mất $400k trước khi recover thì không tốt bằng bot kiếm $300k mà chưa bao giờ mất quá $50k.

---

### Gross Profit / Gross Loss
- **Gross Profit:** Tổng tiền từ tất cả lệnh thắng
- **Gross Loss:** Tổng tiền mất từ tất cả lệnh thua
- **Net Profit = Gross Profit - Gross Loss**

> Ví dụ: Gross Profit $800k, Gross Loss $300k → Net Profit $500k

---

### Expected Payoff (Kỳ vọng toán học)
Trung bình mỗi lệnh kiếm được bao nhiêu tiền.

**Công thức:** Net Profit ÷ Total Trades

> Ví dụ: Net Profit $500k, 250 lệnh → Expected Payoff = $2,000/lệnh
> Nghĩa là trung bình mỗi lần bot vào lệnh, kỳ vọng kiếm được $2,000.

Đây là chỉ số quan trọng nhất để đánh giá hiệu quả thực tế — không bị ảnh hưởng bởi số lệnh nhiều hay ít.

---

### Profit Factor (PF)
Tỷ lệ tổng tiền thắng / tổng tiền thua.

**Công thức:** Gross Profit ÷ Gross Loss

> Ví dụ: PF = 1.66 nghĩa là cứ $1 thua thì kiếm được $1.66
> PF = 1.0 nghĩa là hòa vốn
> PF < 1.0 nghĩa là thua lỗ về dài hạn

Khác với Net Profit ở chỗ PF đo **tỷ lệ** chứ không phải số tuyệt đối — 2 bot cùng PF 1.5 thì có cùng "chất lượng" dù 1 bot kiếm $100k và bot kia kiếm $10M.

---

## Nhóm 2 — Rủi ro & Drawdown

### Balance Drawdown Maximal ($)
Mức sụt giảm balance lớn nhất tính bằng đô la, từ đỉnh cao nhất xuống đáy thấp nhất trong toàn bộ backtest.

> Ví dụ: Balance lên đỉnh $1,200,000 rồi rớt xuống $900,000 → Drawdown Maximal = $300,000

---

### Balance Drawdown Relative (%)
Mức sụt giảm lớn nhất tính bằng %, từ đỉnh xuống đáy.

**Công thức:** (Đỉnh - Đáy) ÷ Đỉnh × 100

> Ví dụ: Đỉnh $1,200,000, đáy $900,000 → Drawdown = 300k/1200k = 25%
> Nghĩa là tài khoản từng mất 25% giá trị từ đỉnh trước khi recover.

Đây là con số thực tế nhất để đánh giá rủi ro — nếu deploy với $100k thì worst case mất $25k.

---

### Balance Drawdown Absolute ($)
Mức sụt giảm balance so với **điểm xuất phát ban đầu** (không phải từ đỉnh).

> Ví dụ: Bắt đầu $1,000,000, balance từng xuống $920,000 → Absolute = $80,000
> Chỉ có ý nghĩa nếu bot từng lỗ so với vốn ban đầu.

Ít quan trọng hơn Maximal vì Maximal bắt được rủi ro ở bất kỳ thời điểm nào, không chỉ từ điểm xuất phát.

---

### Equity Drawdown
Tương tự Balance Drawdown nhưng tính cả lãi/lỗ của **lệnh đang mở**.

> Balance chỉ thay đổi khi đóng lệnh.
> Equity thay đổi liên tục theo giá thị trường.
> Equity Drawdown luôn ≥ Balance Drawdown vì tính cả lệnh đang lỗ chưa đóng.

---

### Recovery Factor (RF)
Đo khả năng bù lại drawdown — profit gấp bao nhiêu lần mức sụt giảm tệ nhất.

**Công thức:** Net Profit ÷ Balance Drawdown Maximal ($)

> Ví dụ: Net Profit $500k, Drawdown Maximal $100k → RF = 5
> Nghĩa là bot kiếm được gấp 5 lần mức thua tệ nhất.
> RF < 1 nghĩa là profit chưa bù được drawdown đã chịu.

---

### P/D Ratio
Tương tự Recovery Factor nhưng dùng drawdown tuyệt đối ($) thay vì drawdown tương đối (%).

**Công thức:** Net Profit ÷ Balance Drawdown Maximal ($)

> Thực ra P/D và RF dùng cùng công thức trong hệ thống này.
> P/D = 10 nghĩa là profit gấp 10 lần drawdown phải chịu.

Đây là **chỉ số ưu tiên số 1** vì nó trả lời câu hỏi: "Tôi phải chịu rủi ro bao nhiêu để kiếm được số tiền này?"

---

### Largest Loss Trade
Lệnh thua lớn nhất trong toàn bộ backtest, tính bằng đô la.

> Ví dụ: Largest Loss = -$12,000 nghĩa là lệnh tệ nhất mất $12,000.

Quan trọng khi xem kết hợp với Average Profit Trade:
- Nếu avg win = $2,000 và largest loss = $12,000 → 1 lệnh thua xóa 6 lệnh thắng
- Nếu avg win = $15,000 và largest loss = $12,000 → largest loss nhỏ hơn avg win → tốt

---

### Max Consecutive Losses
Chuỗi thua liên tiếp dài nhất.

> Ví dụ: Max Consecutive Losses = 15 nghĩa là bot từng thua 15 lệnh liên tiếp.

Ảnh hưởng trực tiếp đến margin — với lot cố định, 15 lệnh thua liên tiếp có thể rút cạn tài khoản trước khi bot có cơ hội recover.

---

## Nhóm 3 — Chất lượng & Ổn định

### Sharpe Ratio
Đo lợi nhuận so với mức biến động — equity có đều đặn không hay lên xuống thất thường.

**Công thức:** (Return - Risk Free Rate) ÷ Standard Deviation of Returns

> Sharpe = 2.0 nghĩa là mỗi đơn vị rủi ro chịu thì kiếm được 2 đơn vị lợi nhuận.
> Sharpe cao = equity đi lên đều, ít biến động.
> Sharpe thấp = equity lên xuống thất thường, profit không ổn định.

---

### LR Correlation (Linear Regression Correlation)
Đo mức độ tuyến tính của equity curve — đường equity có đi thẳng lên không hay zigzag.

> LR Correlation = 0.95 nghĩa là equity gần như đường thẳng đi lên.
> LR Correlation = 0.5 nghĩa là equity lên xuống không theo quy luật.

Equity tuyến tính = profit đều đặn = ít phụ thuộc vào may mắn.

---

### LR Standard Error
Đo mức độ lệch của equity so với đường thẳng hồi quy — càng nhỏ thì equity càng đều.

> LR Std Error cao + Sharpe thấp = UnstableProfit trap — profit do may mắn ngắn hạn.

---

### Z-Score
Đo tính ngẫu nhiên của chuỗi thắng/thua — có pattern không hay hoàn toàn ngẫu nhiên.

> Z-Score dương: xu hướng thắng sau thắng, thua sau thua (clustering)
> Z-Score âm: xu hướng đảo chiều sau mỗi lệnh
> Confidence % thấp (< 95%): không có ý nghĩa thống kê, bỏ qua

Với portfolio này avg confidence chỉ 52% → Z-Score gần như nhiễu, không dùng để ra quyết định.

---

### History Quality
% chất lượng tick data MT5 dùng để simulate backtest.

> 99% = MT5 có đủ tick data thực tế để simulate chính xác từng lệnh.
> 80% = 20% thời gian MT5 phải "đoán" giá — kết quả có thể sai lệch.
> "real ticks" = dùng tick data thực tế từ broker, thường chính xác hơn modeled.

---

## Nhóm 4 — Thống kê lệnh

### Total Trades
Tổng số lệnh đã đóng trong backtest.

> Quan trọng vì ít lệnh = kết quả không có ý nghĩa thống kê.
> Ngưỡng tối thiểu: 100 lệnh để đánh giá strategy.

---

### Winrate (Profit Trades %)
Tỷ lệ lệnh thắng / tổng lệnh đóng.

> Winrate 34% nghĩa là 34 trong 100 lệnh có profit dương.

**Quan trọng:** Winrate thấp không có nghĩa là xấu. Portfolio này avg 34% nhưng Expected Payoff $2,185/lệnh — thắng ít nhưng thắng lớn. Đây là đặc trưng của trend-following strategy.

---

### Average Profit Trade / Average Loss Trade
- **Avg Profit Trade:** Trung bình tiền kiếm được từ lệnh thắng
- **Avg Loss Trade:** Trung bình tiền mất từ lệnh thua

> Ví dụ: Avg Win $5,000, Avg Loss $2,000 → R:R = 2.5
> Nghĩa là mỗi lệnh thắng kiếm gấp 2.5 lần mỗi lệnh thua.

Portfolio này: Avg Win $18,310, Avg Loss $4,543 → R:R ≈ 4:1 — rất tốt.

---

### Largest Profit Trade
Lệnh thắng lớn nhất. Nếu quá lớn so với avg win thì profit đang phụ thuộc vào 1 lệnh may mắn.

---

### Avg / Min / Max Position Holding Time
Thời gian giữ lệnh trung bình / ngắn nhất / dài nhất.

> H1 strategy: avg 21 giờ — hợp lý
> H4 strategy: avg 38 giờ — hợp lý
> Nếu H4 giữ lệnh ngắn hơn H1 → TimeframeMismatch

---

## Nhóm 5 — Chỉ số nâng cao

### AHPR / GHPR
- **AHPR (Arithmetic HPR):** Lợi nhuận trung bình mỗi lệnh theo phép cộng
- **GHPR (Geometric HPR):** Lợi nhuận trung bình mỗi lệnh theo phép nhân (compound)

> GHPR < AHPR luôn luôn — khoảng cách càng lớn thì equity càng biến động.
> Dùng để tính optimal position sizing (Kelly Criterion).

---

### Correlation (Profits, MFE) / (Profits, MAE)
- **MFE (Maximum Favorable Excursion):** Lợi nhuận tối đa lệnh từng đạt trước khi đóng
- **MAE (Maximum Adverse Excursion):** Thua lỗ tối đa lệnh từng chịu trước khi đóng

> Correlation(Profits, MFE) cao: lệnh thắng lớn thường đạt MFE lớn — EA đang để lãi chạy tốt
> Correlation(Profits, MAE) âm: lệnh thắng thường có MAE nhỏ — EA không chịu lỗ nhiều trước khi thắng

---

### OnTester Result
Giá trị tùy chỉnh do EA tự tính và trả về khi kết thúc backtest. Mỗi EA có thể định nghĩa khác nhau — không có chuẩn chung.

---

## Tóm tắt mối quan hệ giữa các chỉ số

```
Net Profit
    ├── Gross Profit (tổng thắng)
    └── Gross Loss (tổng thua)
         └── Profit Factor = Gross Profit / Gross Loss

Net Profit
    └── Expected Payoff = Net Profit / Trades

Net Profit + Drawdown
    ├── Recovery Factor = Net Profit / Drawdown($)
    └── P/D Ratio = Net Profit / Drawdown($)   ← ưu tiên số 1

Equity Curve
    ├── Sharpe Ratio (ổn định vs biến động)
    ├── LR Correlation (tuyến tính)
    └── LR Standard Error (độ lệch)

Lệnh đơn
    ├── Winrate (% thắng)
    ├── Avg Win / Avg Loss (R:R ratio)
    ├── Largest Loss (rủi ro đơn lệnh)
    └── Max Consecutive Losses (rủi ro chuỗi)
```
