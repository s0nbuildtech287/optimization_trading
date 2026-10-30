# Behavior Analysis - Exit Behavior

## Công dụng

Cho biết trade được đóng bởi Take Profit, Stop Loss, Close Order chủ động hay End of Test. Tỷ lệ thoát giúp phát hiện strategy phụ thuộc vào việc kết thúc backtest hoặc cắt lỗ quá nhiều.

## Nhóm lý do thoát

- TP: Take Profit.
- SL: Stop Loss.
- CO: logic đóng lệnh chủ động của EA.
- EoT: đóng do kết thúc giai đoạn test.
- Other: comment không khớp bốn nhóm trên và vẫn nằm trong mẫu số.

## Công thức

```text
Reason Rate (%) = Closed Trades có reason / Total Closed Trades × 100
```

Flag đáng chú ý:

- EoT `> 10%`: phụ thuộc điểm kết thúc backtest.
- SL Heavy: tỷ trọng Stop Loss cao theo ngưỡng hiển thị.

## Lưu ý

Backend nhận SL khi comment bắt đầu `sl `, TP khi bắt đầu `tp `, CO khi kết thúc `_CO`, và EoT theo `end of test`. Bốn tỷ lệ có thể không đủ 100% vì Other không được hiển thị thành nhóm chính.
