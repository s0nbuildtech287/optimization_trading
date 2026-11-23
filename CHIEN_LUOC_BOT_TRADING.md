# TỔNG QUAN CHIẾN LƯỢC TOÀN BỘ BOT TRADING (SPOT & 6 BOTS FUTURES)

> Tài liệu kỹ thuật chi tiết về thuật toán, chỉ báo kỹ thuật, điều kiện vào/ra lệnh và cơ chế quản trị rủi ro của hệ thống Trading tự động.  
> Cập nhật: **Tháng 11/2026** — Môi trường vận hành: **Binance Live Stream (M15 / H4)**.

---

## MỤC LỤC
1. [Triết lý Thiết kế & Phân bổ Vốn ($100 / Bot)](#1-triết-lý-thiết-kế--phân-bổ-vốn-100--bot)
2. [Chiến lược Spot: Smart RSI DCA](#2-chiến-lược-spot-smart-rsi-dca)
3. [Bot 1 (Futures): Trend Pullback (EMA 200/50/21 + RSI)](#3-bot-1-futures-trend-pullback-ema-2005021--rsi)
4. [Bot 2 (Futures): Bollinger Reversion (Sideway Mean-Reversion)](#4-bot-2-futures-bollinger-reversion-sideway-mean-reversion)
5. [Bot 3 (Futures): Breakout Momentum (Donchian 20 + Vol Spike)](#5-bot-3-futures-breakout-momentum-donchian-20--vol-spike)
6. [Bot 4 (Futures): H4 Trend Sniper (Donchian 55 + EMA 50/200 - Turtle)](#6-bot-4-futures-h4-trend-sniper-donchian-55--ema-50200---turtle)
7. [Bot 5 (Futures): TTM Squeeze Breakout (Bollinger + Keltner Lò Xo)](#7-bot-5-futures-ttm-squeeze-breakout-bollinger--keltner-lò-xo)
8. [Bot 6 (Futures): Momentum Leader Scanner (Dòng tiền ROC 24h/6h)](#8-bot-6-futures-momentum-leader-scanner-dòng-tiền-roc-24h6h)
9. [Hệ thống Quản trị Rủi ro Danh mục & Phanh dừng Khẩn cấp](#9-hệ-thống-quản-trị-rủi-ro-danh-mục--phanh-dừng-khẩn-cấp)

---

## 1. Triết lý Thiết kế & Phân bổ Vốn ($100 / Bot)

Hệ thống được thiết kế theo mô hình **Đấu trường Đa chiến lược (Multi-Strategy Tournament)**:
* **Tính độc lập:** Mỗi con bot quản lý một ví ảo riêng với vốn khởi điểm cố định **$100.00 USDT**.
* **Đa dạng hóa phong cách:** Kết hợp hài hòa giữa **Trend Following** (ăn sóng dài), **Mean Reversion** (bắt biên sideway), **Breakout/Squeeze** (bắt nổ biến động), và **Momentum Rotation** (xoay trục theo coin dẫn dắt).
* **Bảo vệ tài khoản nhỏ:** Không sử dụng Martingale/nhồi lệnh vô tội vạ; mọi lệnh Futures đều có Stop Loss tự động theo độ biến động thực tế (ATR) và tỷ lệ Lời:Lỗ (Risk:Reward) tối thiểu từ 1:1.5 đến 1:2.5.

---

## 2. Chiến lược Spot: Smart RSI DCA

Chiến lược gom hàng giao ngay (Spot) an toàn, tích sản dựa trên vùng điều chỉnh quá bán và quản trị vốn theo từng đợt mua (Tranche).

* **Khung thời gian:** Nến 15 phút (M15).
* **Danh mục áp dụng (5 coin an toàn):** `BTCUSDT`, `ETHUSDT`, `SOLUSDT`, `BNBUSDT`, `PAXGUSDT`.
* **Kích thước 1 đợt mua (Tranche):** Mặc định $10.00 USDT (10% vốn ban đầu).
* **Đòn bẩy:** 1x (Giao ngay không vay nợ).

### 2.1. Điều kiện Mua gom (Buy Entry)
1. **Bộ lọc danh mục:** Coin phải nằm trong danh mục 5 mã được cấp phép.
2. **Tín hiệu Quá bán:** Chỉ báo $RSI(14) \le 35$.
3. **Quy tắc Gom thêm (DCA Rules - Khi đã có vị thế):**
   * **Quy tắc bước giá:** Giá hiện tại phải **thấp hơn ít nhất 3%** so với giá vốn trung bình (`avg_buy_price`) trước đó mới được mua tranche tiếp theo.
   * **Giới hạn số lần gom:** Tối đa **3 tranches** cho mỗi coin (tối đa $30 / coin), tránh việc dồn toàn bộ vốn vào 1 mã duy nhất.
   * **Phanh dừng DCA (DCA Stop):** Nếu vị thế đang âm sâu $\ge 5\%$ (gần chạm ngưỡng SL 6%), bot **tuyệt đối KHÔNG gom thêm** để tránh kịch bản "bắt dao rơi".

### 2.2. Điều kiện Thoát lệnh (Exit Rules)
* **Chốt lời (Take Profit):** Tự động bán sạch 100% khi lợi nhuận đạt $\ge \mathbf{+4.5\%}$ so với giá vốn trung bình.
* **Cắt lỗ (Stop Loss):** Tự động bán sạch 100% khi mức lỗ chạm $\le \mathbf{-6.0\%}$ so với giá vốn trung bình để bảo toàn vốn.

---

## 3. Bot 1 (Futures): Trend Pullback (EMA 200/50/21 + RSI)

Chiến lược đi theo dòng chảy xu hướng chính của thị trường và bắt điểm vào lệnh tại các nhịp hồi kỹ thuật lành mạnh.

* **Khung thời gian:** 15 phút (M15).
* **Đòn bẩy:** 3x (Isolated Margin).
* **Rủi ro mỗi lệnh:** 2% vốn ($2.00 / lệnh với vốn $100).
* **Danh mục theo dõi (5 coin):** `BTCUSDT`, `ETHUSDT`, `SOLUSDT`, `BNBUSDT`, `PAXGUSDT`.

### 3.1. Tín hiệu Mở vị thế LONG (Mua đuổi xu hướng tăng)
1. **Cấu trúc Xu hướng Tăng:**
   * Giá hiện tại nằm trên đường $EMA 200$ (`currentClose > ema200`).
   * Đường $EMA 50 > EMA 200$.
   * Độ dốc đường $EMA 200$ đang hướng lên (EMA200 hiện tại $\ge$ EMA200 cách đó 4 nến $\times 0.9998$).
2. **Nhịp hồi (Pullback) hợp lệ:**
   * Giá nến hiện tại chạm hoặc lùi về sát đường $EMA 21$ (trong biên độ $\pm 0.4\%$ quanh EMA21).
3. **Sức mạnh xung lực:**
   * $40 \le RSI(14) \le 65$ (nằm trong vùng điều chỉnh lành mạnh, chưa bị hưng phấn quá mua $> 70$).

### 3.2. Tín hiệu Mở vị thế SHORT (Đánh theo xu hướng giảm)
1. **Cấu trúc Xu hướng Giảm:** Giá $< EMA 200$, $EMA 50 < EMA 200$, độ dốc EMA 200 cắm xuống.
2. **Nhịp hồi lên (Pullback):** Giá giật lên sát đường $EMA 21$.
3. **Sức mạnh xung lực:** $35 \le RSI(14) \le 60$ (chưa bị quá bán $< 30$).

### 3.3. Quản trị Rủi ro & Mục tiêu
* **Stop Loss (SL):** Đặt tại $1.5 \times ATR(14)$ (tối thiểu 0.8% giá với crypto, 0.35% với PAXG).
* **Take Profit (TP):** Đặt tại tỷ lệ $\mathbf{R:R = 1:2.0}$ ($2.0 \times \text{Khoảng cách SL}$).
* **Kéo dời hòa vốn (Breakeven):** Khi giá đi được $1.2R$, tự động dời SL về điểm hòa vốn (`entry_price`).

---

## 4. Bot 2 (Futures): Bollinger Reversion (Sideway Mean-Reversion)

Chiến lược săn tìm lợi nhuận trong thị trường đi ngang (Sideway) bằng cách bắt nhịp đảo chiều khi giá chạm dải biên Bollinger Bands và hồi quy về giá trị trung bình.

* **Khung thời gian:** 15 phút (M15).
* **Đòn bẩy:** 3x.
* **Danh mục theo dõi (5 coin):** `BTCUSDT`, `ETHUSDT`, `SOLUSDT`, `BNBUSDT`, `PAXGUSDT`.

### 4.1. Bộ lọc Bắt buộc (Trend Filter)
* **Quy tắc ADX:** Chỉ báo $ADX(14)$ phải **$< 23$**.
* *Lý do:* Nếu $ADX \ge 23$, thị trường đang có xu hướng mạnh (Uptrend hoặc Downtrend dốc), dải Bollinger sẽ mở miệng chạy theo trend $\rightarrow$ Bắt đảo chiều lúc này rất dễ "cháy tài khoản". Bot sẽ đứng ngoài hoàn toàn.

### 4.2. Tín hiệu Vào lệnh
* **LONG (Bắt bật dải dưới):**
  * Giá nến trước hoặc nến này thọc thủng dải dưới $BB_{\text{Lower}} (20, 2)$.
  * Nến hiện tại rút chân đóng cửa trở lại bên trên $BB_{\text{Lower}}$.
  * $RSI(14) \le 38$ (xác nhận quá bán ngắn hạn).
* **SHORT (Bắt đảo chiều dải trên):**
  * Giá nến chọc thủng dải trên $BB_{\text{Upper}} (20, 2)$.
  * Nến hiện tại rụt cổ đóng cửa tụt lại dưới $BB_{\text{Upper}}$.
  * $RSI(14) \ge 62$ (xác nhận quá mua ngắn hạn).

### 4.3. Quản trị Rủi ro & Mục tiêu
* **Stop Loss:** $1.2 \times ATR(14)$.
* **Take Profit:** Mục tiêu chốt lời là trục giữa $SMA 20$ (Mean Reversion) hoặc tối thiểu $1.4R$ ($R:R \approx 1:1.5$).

---

## 5. Bot 3 (Futures): Breakout Momentum (Donchian 20 + Vol Spike)

Chiến lược săn các pha bùng nổ phá vỡ khỏi vùng tích lũy ngắn hạn đi kèm dòng tiền lớn.

* **Khung thời gian:** 15 phút (M15).
* **Đòn bẩy:** 3x.
* **Danh mục theo dõi (8 coin):** `BTCUSDT`, `ETHUSDT`, `SOLUSDT`, `BNBUSDT`, `PAXGUSDT`, `DOGEUSDT`, `NEARUSDT`, `AVAXUSDT`.

### 5.1. Tín hiệu Mở vị thế
* **LONG (Breakout phá đỉnh):**
  * Giá đóng cửa nến vượt qua đỉnh cao nhất của 20 nến trước đó (`currentClose > HighestHigh(20)`).
  * Khối lượng giao dịch bùng nổ: $Volume_{\text{nến}} \ge 1.5 \times SMA(Volume, 20)$.
  * **Lọc phá vỡ giả (False Breakout):** Nến breakout phải là nến xanh dứt khoát, giá đóng cửa nằm ở 45% nửa trên thân nến.
* **SHORT (Breakdown phá đáy):**
  * Giá đóng cửa nến thủng đáy thấp nhất của 20 nến trước đó (`currentClose < LowestLow(20)`).
  * Khối lượng $Volume_{\text{nến}} \ge 1.5 \times SMA(Volume, 20)$.
  * Nến đỏ dứt khoát, giá đóng cửa nằm ở 45% nửa dưới thân nến.

### 5.2. Quản trị Rủi ro & Mục tiêu
* **Stop Loss:** $1.4 \times ATR(14)$.
* **Take Profit:** Tỷ lệ $\mathbf{R:R = 1:2.0}$.
* **Breakeven:** Kéo SL về hòa vốn khi giá chạy được $1.2R$.

---

## 6. Bot 4 (Futures): H4 Trend Sniper (Donchian 55 + EMA 50/200 - Turtle)

Chiến lược săn sóng lớn dài hạn dựa trên hệ thống giao dịch huyền thoại **Turtle Trading (Rùa Biển Richard Dennis)** trên khung nến H4.

* **Khung thời gian:** 4 giờ (H4).
* **Đòn bẩy:** 3x.
* **Tần suất:** Ít lệnh (1–3 lệnh/tuần), nhưng mỗi lệnh đều giữ theo sóng lớn kéo dài nhiều ngày.
* **Danh mục theo dõi (6 coin):** `BTCUSDT`, `ETHUSDT`, `SOLUSDT`, `BNBUSDT`, `NEARUSDT`, `AVAXUSDT`.

### 6.1. Tín hiệu Vào lệnh
* **LONG:**
  * Giá đóng cửa nến H4 vượt đỉnh 55 nến H4 trước đó (tương đương đỉnh ~9 ngày).
  * Xác nhận xu hướng vĩ mô: $EMA 50 \ge EMA 200$ trên khung H4.
* **SHORT:**
  * Giá đóng cửa nến H4 thủng đáy 55 nến H4 trước đó.
  * Xác nhận xu hướng vĩ mô: $EMA 50 \le EMA 200$ trên khung H4.

### 6.2. Quản trị Rủi ro & Mục tiêu
* **Stop Loss:** $1.8 \times ATR(14)$ khung H4 (biên độ rộng để chịu được rung lắc nến H4).
* **Take Profit:** Mục tiêu sóng dài $\mathbf{R:R = 1:2.5}$.
* **Breakeven:** Dời SL về hòa vốn khi giá đạt $1.4R$.

---

## 7. Bot 5 (Futures): TTM Squeeze Breakout (Bollinger + Keltner Lò Xo)

Chiến lược kinh điển của huyền thoại John Carter, bắt trọn các pha tích lũy nén biên độ (Volatility Compression) trước khi bung nổ cực mạnh (Volatility Expansion).

* **Khung thời gian:** 15 phút (M15).
* **Đòn bẩy:** 3x.
* **Danh mục theo dõi (8 coin):** `BTCUSDT`, `ETHUSDT`, `SOLUSDT`, `BNBUSDT`, `DOGEUSDT`, `NEARUSDT`, `AVAXUSDT`, `XRPUSDT`.

### 7.1. Cơ chế Hoạt động (Hai Giai đoạn)
1. **Giai đoạn 1 — Lò xo bị nén chặt (The Squeeze On):**
   * Dải Bollinger Bands $(20, 2)$ co thắt lại và nằm gọn hoàn toàn bên trong dải Keltner Channel $(20, 1.5 \times ATR)$.
   * Thị trường cạn kiệt thanh khoản, nén biên độ ở mức cao nhất.
2. **Giai đoạn 2 — Lò xo bung nổ (The Squeeze Fires):**
   * Dải Bollinger Bands bất ngờ mở rộng bung ra ngoài dải Keltner Channel.
   * **LONG:** Nến xanh đóng vượt dải trên Keltner Channel kèm xung lực $Momentum > 0$.
   * **SHORT:** Nến đỏ đóng thủng dải dưới Keltner Channel kèm xung lực $Momentum < 0$.

### 7.2. Quản trị Rủi ro & Mục tiêu
* **Stop Loss:** $1.6 \times ATR(14)$ (đặt ngay tại trục giữa Keltner hoặc theo ATR).
* **Take Profit:** Tỷ lệ $\mathbf{R:R = 1:2.5}$.

---

## 8. Bot 6 (Futures): Momentum Leader Scanner (Dòng tiền ROC 24h/6h)

Chiến lược quét xoay trục dòng tiền (Capital Rotation), liên tục sàng lọc để chọn ra đồng coin dẫn dắt thị trường (Top Gainer/Leader) có gia tốc tăng trưởng mạnh nhất.

* **Khung thời gian:** 15 phút (M15).
* **Đòn bẩy:** 3x.
* **Danh mục theo dõi (10 coin rộng nhất):** `BTCUSDT`, `ETHUSDT`, `SOLUSDT`, `BNBUSDT`, `DOGEUSDT`, `NEARUSDT`, `AVAXUSDT`, `XRPUSDT`, `SUIUSDT`, `LINKUSDT`.

### 8.1. Các Chỉ số Định lượng (Quant Metrics)
1. **Tốc độ thay đổi giá 24h ($ROC_{24h}$):** Đo lường tỷ lệ % tăng/giảm giá so với 96 nến trước.
2. **Tốc độ thay đổi giá 6h ($ROC_{6h}$):** Đo lường tỷ lệ % tăng/giảm giá so với 24 nến gần nhất.
3. **Chỉ số Bùng nổ Khối lượng (Volume Ratio):** So sánh $SMA(Volume, 10)$ với $SMA(Volume, 50)$.

### 8.2. Tín hiệu Vào lệnh
* **LONG (Coin Dẫn sóng Tăng):**
  * $ROC_{24h} \ge \mathbf{+1.2\%}$ và $ROC_{6h} \ge \mathbf{+0.4\%}$.
  * $Volume_{\text{Ratio}} \ge 1.05$ (khối lượng ngắn hạn gấp ít nhất 1.05 lần trung bình).
  * Cấu trúc tăng giá: Giá nằm trên $EMA 20$ và $EMA 20 > EMA 50$.
* **SHORT (Coin Bị Xả Dẫn đầu):**
  * $ROC_{24h} \le \mathbf{-1.2\%}$ và $ROC_{6h} \le \mathbf{-0.4\%}$.
  * $Volume_{\text{Ratio}} \ge 1.05$.
  * Cấu trúc giảm giá: Giá nằm dưới $EMA 20$ và $EMA 20 < EMA 50$.

### 8.3. Quản trị Rủi ro & Mục tiêu
* **Stop Loss:** $1.6 \times ATR(14)$.
* **Take Profit:** Tỷ lệ $\mathbf{R:R = 1:2.5}$.
* **Breakeven:** Tự động khóa hòa vốn khi giá đi được $1.4R$.

---

## 9. Hệ thống Quản trị Rủi ro Danh mục & Phanh dừng Khẩn cấp

Tất cả các bot trên hệ thống đều tuân thủ các quy tắc bảo vệ vốn đa lớp:

1. **Khóa Tương quan (Correlation Lock):**
   * Trong nhóm coin có tính đồng pha cao (`BTC, ETH, SOL, BNB`), hệ thống chỉ cho phép mở tối đa **2 vị thế cùng chiều** tại một thời điểm. Tránh rủi ro bị quét đồng loạt khi thị trường đảo chiều bất ngờ.
2. **Quy mô Vị thế Cố định (Fixed Position Sizing):**
   * Ký quỹ mặc định: $15 USDT / vị thế (với đòn bẩy 3x, giá trị vị thế là $45 USDT).
   * Rủi ro chịu lỗ mỗi lệnh luôn được khống chế $\approx 2\%$ vốn ban đầu.
3. **Phanh Ngắt Mạch Tự động (Circuit Breaker):**
   * Nếu tài khoản của bất kỳ bot nào chạm ngưỡng sụt giảm vốn **Max Drawdown $\ge 15\%$**, hệ thống sẽ lập tức kích hoạt chế độ **TẠM DỪNG MỞ LỆNH** đối với bot đó để bảo toàn vốn và chờ rà soát.
4. **Cơ chế Kéo dời Hòa vốn (Breakeven Trailing):**
   * Khi vị thế có lãi vượt mức $1.2R - 1.4R$, hệ thống tự động dời Stop Loss về giá hòa vốn (`entry_price`). Nếu thị trường quay đầu, lệnh thoát với kết quả hòa phí thay vì biến lệnh thắng thành lệnh thua.
