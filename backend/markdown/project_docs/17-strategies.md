# Strategies

## Công dụng

Tra cứu strategy metadata, Settings, Results, balance chart và lọc strategy theo chỉ số Full Period hoặc Date Range.

## Bộ lọc

- Data Source, Symbol, Timeframe, Direction.
- Net Profit, Total Trades, Win Rate.
- Drawdown theo tiền hoặc phần trăm.
- P/D, Profit Factor, Sharpe, Recovery Factor.
- Largest Loss Trade, LPT Ratio, Risk-Reward, LR Correlation.
- Analysis Run của Volume Optimization.

## Full Period và Date Range

- Full Period: ưu tiên chỉ số Results từ file MT5/metadata.
- Date Range: tính lại từ deal thuộc thời gian chọn.
- Cột Total Trades Full Period dùng Results MT5; Date Range dùng FLOOR(COUNT(dòng không phải balance) / 2). Date Range tính P/L bằng Profit + Commission + Swap.

## Dialog chi tiết

- Settings: cấu hình EA và Inputs.
- Results: chỉ số MT5 gốc.
- Chart: balance/equity tính từ chuỗi deal.
- Order details: dữ liệu lệnh liên quan.

## Lưu ý

Cache giúp tải nhanh nhưng phải bị invalidated sau thay đổi dữ liệu. Khi nghi ngờ, refresh server cache qua thao tác được cung cấp thay vì kết luận DB sai.
