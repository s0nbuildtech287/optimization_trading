# AI Chatbot — Khả năng và giới hạn

> Chatbot sử dụng OpenAI GPT (mặc định gpt-4o-mini, có thể chọn gpt-4o / gpt-4-turbo / gpt-3.5-turbo).
> Có khả năng gọi trực tiếp vào database và API thị trường — không chỉ trả lời chung chung.

---

## Những gì chatbot CÓ THỂ làm

### 1. Truy vấn và lọc strategies từ DB

Chatbot có tool `queryStrategies` — gọi thẳng vào database, không đoán mò.

Ví dụ câu hỏi được:
- "Có bao nhiêu strategy XAUUSD H1 có P/D > 5?"
- "Lọc strategy BTCUSD winrate >= 60%, profit factor >= 1.5"
- "Top 10 strategy theo Sharpe Ratio"
- "Strategy nào có drawdown < 10% và profit > $500k?"
- "Lọc strategy giai đoạn 2024-2025 có P/D > 3"
- "So sánh ETHUSD H1 vs H4"

Trả về: danh sách strategies kèm đầy đủ 12 chỉ số, thống kê tổng hợp từ toàn bộ kết quả (không chỉ sample).

---

### 2. Thống kê tổng quan portfolio

Chatbot có tool `getStrategyStats` — lấy phân bố toàn bộ DB.

Ví dụ câu hỏi được:
- "Tổng quan data backtest hiện tại"
- "Có bao nhiêu strategy theo từng symbol?"
- "Phân bố theo timeframe H1 vs H4"
- "Winrate trung bình toàn portfolio là bao nhiêu?"

---

### 3. Phân tích và xếp hạng danh sách strategies

Chatbot có tool `analyzeStrategyList` — tính score tổng hợp, nhận xét điểm mạnh/yếu.

Ví dụ câu hỏi được:
- "Phân tích chất lượng 20 strategy XAUUSD vừa lọc"
- "Strategy nào trong danh sách này đáng deploy nhất?"
- "Xếp hạng theo P/D và cho nhận xét"

---

### 4. Giá thị trường realtime

Chatbot có tool `getMarketPrice` — lấy giá live từ API.

Ví dụ câu hỏi được:
- "Giá vàng hiện tại là bao nhiêu?"
- "Giá BTC, ETH, dầu WTI?"
- "Giá cổ phiếu AAPL, TSLA?"
- "VNINDEX đang ở mức nào?"

---

### 5. Lịch sử giá

Chatbot có tool `getMarketHistory` — lấy dữ liệu N ngày gần nhất.

Ví dụ câu hỏi được:
- "Giá vàng 7 ngày qua biến động thế nào?"
- "Xu hướng dầu 1 tháng gần đây?"
- "BTC tuần trước cao nhất bao nhiêu?"

---

### 6. Tin tức thị trường

Chatbot có tool `getSymbolNews` — lấy tin tức mới nhất theo symbol.

Ví dụ câu hỏi được:
- "Tin tức mới nhất về vàng?"
- "Có sự kiện gì ảnh hưởng đến dầu gần đây?"
- "Tin tức BTC hôm nay"

---

### 7. Đọc và phân tích bài báo

Chatbot có tool `fetchArticleContent` — crawl nội dung từ URL.

Ví dụ câu hỏi được:
- "Phân tích bài báo này: [URL]"
- "Tóm tắt nội dung bài viết này cho tôi"

---

### 8. Giải thích chỉ số và tư vấn

Không cần tool — chatbot trả lời từ kiến thức được train sẵn về hệ thống.

Ví dụ câu hỏi được:
- "P/D ratio là gì? Tại sao quan trọng?"
- "Sharpe 2.5 có tốt không?"
- "Tôi nên filter strategy theo tiêu chí nào để deploy?"
- "Drawdown 15% có nguy hiểm không?"
- "Giải thích LR Correlation"
- "Cách đọc kết quả backtest MT5"

---

## Những gì chatbot KHÔNG làm được

| Không làm được | Lý do |
|---|---|
| Xem equity curve / chart của strategy | Không có tool render chart |
| Sync data mới từ Drive | Không có quyền trigger sync |
| Sửa/xóa data trong DB | Không có tool write |
| Dự đoán giá tương lai | Không phải nhiệm vụ của chatbot này |
| Tính toán position sizing / lot size | Chưa có tool |
| So sánh 2 strategy cụ thể side-by-side | Có thể query từng cái rồi so sánh thủ công |
| Lấy thống kê khi dùng date range | `full_statistics` chỉ available khi không có date range |

---

## Rate limit

- Tối đa **10 tin nhắn/phút** mỗi user
- Nếu vượt quá sẽ báo lỗi và cho biết thời gian chờ

---

## Cách chatbot hoạt động với DB

```
User hỏi: "Có bao nhiêu strategy XAUUSD P/D > 5?"
    ↓
Chatbot nhận diện → cần gọi queryStrategies
    ↓
Gọi tool: { symbol: "XAUUSD", pd: "5" }
    ↓
Backend query PostgreSQL → trả về:
  - total: 234 (tổng số khớp)
  - returned: 20 (sample)
  - full_statistics: { avg_pd: 8.3, avg_winrate: 34.2%, ... }
    ↓
Chatbot đọc full_statistics → trả lời chính xác dựa trên 234 strategies
```

**Quan trọng:** Chatbot dùng `full_statistics` (tính từ toàn bộ kết quả) chứ không đoán từ 20 sample — nên số liệu chính xác dù pageSize nhỏ.

---

## 12 chỉ số filter hỗ trợ

| Chỉ số | Tham số | Ví dụ |
|---|---|---|
| P/D Ratio | `pd` | "5" → P/D >= 5 |
| Net Profit | `totalNetProfit` | "100000" → >= $100k |
| Total Trades | `totalTrades` | "100" → >= 100 lệnh |
| Winrate | `winrate` | "60" → >= 60% |
| Profit Factor | `profitFactor` | "1.5" → >= 1.5 |
| Sharpe Ratio | `sharpeRatio` | "1.0" → >= 1.0 |
| Recovery Factor | `recoveryFactor` | "3" → >= 3 |
| LR Correlation | `lrCorrelation` | "0.9" → >= 0.9 |
| Drawdown % | `drawdown` | "20" → <= 20% |
| Largest Loss | `largestLossTrade` | "10000" → <= $10k |
| Risk-Reward | `riskRewardRatio` | "1.5" → >= 1.5 |
| Largest Profit Ratio | `largestProfitTradeRatio` | "30" → <= 30% |

Có thể kết hợp nhiều filter cùng lúc và lọc theo symbol, timeframe, loại lệnh (buy/sell), date range.
