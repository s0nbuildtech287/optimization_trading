# Hướng dẫn ngưỡng đánh giá chỉ số

> Mỗi chỉ số có 2 cột: **Lý thuyết chung** (chuẩn ngành trading) và **Data thực tế** (calibrated từ 7,450 strategies của Lotusquant).
> Khi 2 cột mâu thuẫn, ưu tiên dùng cột Data thực tế vì nó phản ánh đặc thù của portfolio này.

---

## 1. Profit Factor (PF)

**Định nghĩa:** Gross Profit / Gross Loss. Đo biên lợi nhuận — cứ $1 thua thì kiếm được bao nhiêu.

| Mức | Lý thuyết chung | Data thực tế (avg=1.66) |
|---|---|---|
| < 1.0 | ❌ Loại — thua lỗ về dài hạn | ❌ Không tồn tại trong DB (đã filter) |
| 1.0–1.2 | ⚠️ Nguy hiểm — biên quá mỏng | ⚠️ Dưới mức trung bình, 711 strategies (9.5%) |
| 1.2–1.5 | 🟡 Chấp nhận được | 🟡 Trung bình thấp |
| 1.5–2.0 | ✅ Tốt | ✅ Quanh mức avg (1.66) |
| > 2.0 | 🌟 Xuất sắc | 🌟 Top 16.5% portfolio |
| > 3.0 | 🌟 Rất hiếm, cần kiểm tra overfitting | 🌟 Rất hiếm |

---

## 2. Sharpe Ratio

**Định nghĩa:** Lợi nhuận / Độ lệch chuẩn lợi nhuận. Đo mức độ ổn định của equity — profit có đều đặn không hay lên xuống thất thường.

| Mức | Lý thuyết chung | Data thực tế (avg=2.11) |
|---|---|---|
| < 0 | ❌ Loại — thua lỗ | ❌ Không tồn tại |
| 0–0.5 | ❌ Rất kém | ❌ 335 strategies (4.5%) — cần loại |
| 0.5–1.0 | ⚠️ Dưới mức chấp nhận | ⚠️ 671 strategies thêm |
| 1.0–2.0 | ✅ Tốt (chuẩn ngành) | 🟡 Dưới avg của portfolio này |
| 2.0–3.0 | 🌟 Rất tốt | ✅ Quanh avg (2.11) — bình thường với portfolio này |
| > 3.0 | 🌟 Xuất sắc | 🌟 Top 16% portfolio |
| > 10 | ⚠️ Cần kiểm tra — có thể lỗi data | ⚠️ USOIL có Sharpe 42 — outlier, cần xem lại |

> **Lưu ý:** Portfolio này có Sharpe avg 2.11 — cao hơn chuẩn ngành nhiều. Ngưỡng "tốt" ở đây nên là > 2.0 thay vì > 1.0.

---

## 3. Recovery Factor (RF)

**Định nghĩa:** Net Profit / Max Drawdown. Đo khả năng bù lại drawdown — profit gấp bao nhiêu lần mức sụt giảm tệ nhất.

| Mức | Lý thuyết chung | Data thực tế (avg=3.69) |
|---|---|---|
| < 1.0 | ❌ Loại — profit chưa bù được drawdown | ❌ 656 strategies (8.8%) — cần loại |
| 1.0–2.0 | ⚠️ Yếu — vừa đủ bù | ⚠️ Dưới mức trung bình |
| 2.0–3.0 | 🟡 Chấp nhận được | 🟡 Dưới avg |
| 3.0–5.0 | ✅ Tốt | ✅ Quanh avg (3.69) |
| > 5.0 | 🌟 Xuất sắc | 🌟 Top 25% portfolio (1,871 strategies) |
| > 10 | 🌟 Rất hiếm, rất tốt | 🌟 Một số XAUUSD OB đạt 15–18 |

---

## 4. P/D Ratio (Profit/Drawdown)

**Định nghĩa:** Net Profit / Balance Drawdown Maximal ($). Khác RF ở chỗ dùng drawdown tuyệt đối ($) thay vì %. Đây là chỉ số **ưu tiên số 1** theo sếp.

| Mức | Lý thuyết chung | Data thực tế (avg=5.0, p50=3.88) |
|---|---|---|
| < 1.0 | ❌ Loại | ❌ 495 strategies (6.6%) |
| 1.0–3.0 | ⚠️ Yếu | ⚠️ 2,330 strategies (31.3%) — dưới p50 |
| 3.0–5.0 | 🟡 Trung bình | 🟡 Quanh p50 (3.88) |
| 5.0–10.0 | ✅ Tốt | ✅ Trên avg (5.0) — top 38% |
| > 10.0 | 🌟 Xuất sắc | 🌟 Top 10.4% (776 strategies) |
| > 20.0 | 🌟 Rất hiếm | 🌟 Chỉ vài chục strategies, top tier |

---

## 5. Drawdown % (Balance Drawdown Relative)

**Định nghĩa:** % sụt giảm tối đa từ đỉnh balance. Đo độ sâu rủi ro — tài khoản từng mất bao nhiêu % từ đỉnh.

| Mức | Lý thuyết chung | Data thực tế (avg=9.05%, p50=8.38%) |
|---|---|---|
| < 5% | 🌟 Rất an toàn | 🌟 Top 25% tốt nhất (dưới p25=6.38%) |
| 5–10% | ✅ Tốt — chấp nhận được | ✅ Bình thường với portfolio này (quanh p50) |
| 10–15% | 🟡 Cần chú ý | 🟡 Trên avg, p75=10.27% |
| 15–20% | ⚠️ Cao | ⚠️ Trên p90 (13.9%) — top 10% tệ nhất |
| 20–30% | ⚠️ Rất cao | ⚠️ 241 strategies (3.2%) |
| > 30% | ❌ Nguy hiểm | ❌ 55 strategies (0.7%) — cần loại |

> **Lưu ý:** Drawdown phải xem kết hợp với Profit. DD 15% với P/D = 20 vẫn tốt hơn DD 8% với P/D = 1.5.

---

## 6. Winrate

**Định nghĩa:** % lệnh thắng / tổng lệnh đóng.

| Mức | Lý thuyết chung | Data thực tế (avg=33.9%) |
|---|---|---|
| < 25% | ⚠️ Rất thấp — chuỗi thua dài | ⚠️ 997 strategies (13.4%) — dưới avg đáng kể |
| 25–35% | 🟡 Thấp nhưng bình thường với trend-following | ✅ Bình thường với portfolio này (quanh avg) |
| 35–50% | ✅ Trung bình | ✅ Tốt hơn avg |
| 50–70% | ✅ Cao | 🌟 Top 2% portfolio (chỉ 157 strategies) |
| > 70% | ⚠️ Rất cao — kiểm tra HighWinrateTrap | ⚠️ Max 72.3% — cần xem largestLoss |

> **Lưu ý quan trọng:** Portfolio này là low-winrate high-reward. Winrate 34% là bình thường, không phải xấu. Đừng so sánh với chuẩn scalping (winrate 60–80%).

---

## 7. Expected Payoff (Kỳ vọng toán học)

**Định nghĩa:** Net Profit / Total Trades. Trung bình mỗi lệnh kiếm được bao nhiêu $.

| Mức | Lý thuyết chung | Data thực tế (avg=$2,185, p10=$436) |
|---|---|---|
| ≤ 0 | ❌ Loại — thua tiền mỗi lệnh | ❌ 0 strategies trong DB |
| $1–$5 | ⚠️ Quá thấp — phí thực tế xóa hết | ⚠️ Chỉ 7 strategies |
| $5–$100 | 🟡 Thấp với CFD/forex | 🟡 Dưới p10 của portfolio này |
| $100–$500 | ✅ Chấp nhận được | 🟡 Dưới avg |
| $500–$2,000 | ✅ Tốt | ✅ Quanh avg |
| > $2,000 | 🌟 Xuất sắc | 🌟 Trên avg — top 50% portfolio |

---

## 8. LR Correlation (Linear Regression Correlation)

**Định nghĩa:** Mức độ tuyến tính của equity curve — 1.0 là đường thẳng đi lên hoàn hảo, 0 là ngẫu nhiên hoàn toàn.

| Mức | Lý thuyết chung | Data thực tế (avg≈0.85) |
|---|---|---|
| < 0.5 | ❌ Equity rất không đều | ❌ Cần loại |
| 0.5–0.7 | ⚠️ Kém | ⚠️ Cần xem xét |
| 0.7–0.8 | 🟡 Dưới mức chấp nhận | 🟡 Ngưỡng flag trong trap radar |
| 0.8–0.9 | ✅ Tốt | ✅ Bình thường |
| 0.9–0.95 | 🌟 Rất tốt | 🌟 Equity khá đều |
| > 0.95 | 🌟 Xuất sắc — equity gần như đường thẳng | 🌟 1,465 strategies (19.7%) |

---

## 9. Largest Loss Trade

**Định nghĩa:** Lệnh thua lớn nhất tuyệt đối ($). Đo rủi ro đơn lệnh.

| Mức | Lý thuyết chung | Data thực tế (p50=$10,335, p90=$15,868) |
|---|---|---|
| < $5,000 | 🌟 Rất an toàn | 🌟 Dưới p25 — top 25% tốt nhất |
| $5,000–$10,000 | ✅ Tốt | ✅ Dưới p50 |
| $10,000–$12,000 | 🟡 Bình thường | 🟡 Quanh p50–p75 — bình thường với portfolio này |
| $12,000–$16,000 | ⚠️ Cao | ⚠️ Trên p75, tiến về p90 |
| > $16,000 | ⚠️ Rất cao | ⚠️ Trên p90 — top 10% tệ nhất |
| > $20,000 | ❌ Nguy hiểm | ❌ 10 strategies — cần review riêng |

---

## 10. Max Consecutive Losses

**Định nghĩa:** Chuỗi thua liên tiếp dài nhất. Đo rủi ro margin call.

| Mức | Lý thuyết chung | Data thực tế (avg=12, p90=18) |
|---|---|---|
| < 5 | 🌟 Rất tốt | 🌟 Dưới avg đáng kể |
| 5–10 | ✅ Tốt | ✅ Dưới avg |
| 10–15 | 🟡 Bình thường | 🟡 Quanh avg (12) — bình thường với portfolio này |
| 15–20 | ⚠️ Cao | ⚠️ Trên avg, tiến về p90 |
| ≥ 20 | ❌ Nguy hiểm | ❌ 572 strategies (7.7%) — flag trong trap radar |

---

## 11. History Quality

**Định nghĩa:** % chất lượng tick data MT5 dùng để backtest. Ảnh hưởng trực tiếp đến độ chính xác kết quả.

| Mức | Ý nghĩa |
|---|---|
| < 80% | ❌ Kém — kết quả không đáng tin |
| 80–90% | ⚠️ Chấp nhận được nhưng có sai lệch |
| 90–95% | ✅ Tốt |
| 95–99% | 🌟 Rất tốt |
| 99–100% | 🌟 Xuất sắc — tick data đầy đủ |

> Data thực tế: avg 81.9%, 18.1% dưới 90%. Đây là điểm yếu của portfolio — nhiều file dùng "real ticks" thay vì modeled ticks.

---

## Tóm tắt nhanh — Bảng màu

| Chỉ số | ❌ Loại | ⚠️ Cảnh báo | ✅ Tốt | 🌟 Xuất sắc |
|---|---|---|---|---|
| Profit Factor | < 1.0 | 1.0–1.2 | 1.5–2.0 | > 2.0 |
| Sharpe Ratio | < 0.5 | 0.5–1.0 | 1.0–2.0 | > 2.0 |
| Recovery Factor | < 1.0 | 1.0–2.0 | 2.0–5.0 | > 5.0 |
| P/D Ratio | < 1.0 | 1.0–3.0 | 3.0–10.0 | > 10.0 |
| Drawdown % | > 30% | 15–30% | 5–15% | < 5% |
| Winrate* | < 25% | 25–35% | 35–50% | > 50% |
| Expected Payoff | ≤ 0 | $1–$5 | $100–$2,000 | > $2,000 |
| LR Correlation | < 0.7 | 0.7–0.8 | 0.8–0.95 | > 0.95 |
| Largest Loss | > $20k | $12k–$20k | $5k–$12k | < $5k |
| Consecutive Loss | ≥ 20 | 15–20 | 5–15 | < 5 |
| History Quality | < 80% | 80–90% | 90–99% | 99–100% |

*Winrate thấp không phải xấu với trend-following strategy — xem kết hợp với Expected Payoff.

---

## Nguyên tắc đọc chỉ số

**Không đọc chỉ số đơn lẻ.** Luôn xem ít nhất 3 chỉ số cùng lúc:

```
Ví dụ 1 — Trông tốt nhưng thực ra xấu:
  Winrate 70% ✅  →  nhưng Largest Loss $18k ⚠️  →  và PF 1.1 ⚠️
  Kết luận: HighWinrateTrap — thắng nhiều nhưng 1 lệnh thua xóa hết

Ví dụ 2 — Trông xấu nhưng thực ra tốt:
  Winrate 28% ⚠️  →  nhưng Expected Payoff $3,500 🌟  →  và P/D 8.5 🌟
  Kết luận: Trend-following tốt — thắng ít nhưng thắng lớn

Ví dụ 3 — Thực sự tốt:
  P/D 15 🌟  +  Drawdown 7% 🌟  +  Sharpe 3.5 🌟  +  RF 12 🌟
  Kết luận: Deploy ngay
```
