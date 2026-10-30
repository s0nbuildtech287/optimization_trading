# Behavior Analysis - Holding & Recovery

## Công dụng

Phát hiện hai hành vi nguy hiểm: giữ lệnh thua lâu hơn lệnh thắng và tăng volume sau chuỗi thua.

## HTR

```text
HTR = Average Losing Holding Time / Average Winning Holding Time
```

SQL dùng LAG(time) theo strategy rồi chỉ giữ dòng out; không join theo Order/Position ID.

- `HTR <= 1.5`: an toàn.
- `1.5 < HTR <= 2.0`: cảnh báo.
- `HTR > 2.0`: Loss Averse, gồng lỗ đáng kể.

## VEI

```text
VEI = Average Volume tại loss_streak_before_trade = 3 / Average Base Volume
```

- `VEI <= 1.0`: không tăng lot sau lỗ.
- `1.0 < VEI <= 1.2`: tăng nhẹ.
- `VEI > 1.2`: Martingale Risk.

Khi HTR > 2 và VEI > 1.2, trạng thái có thể là Critical Risk.

## Lưu ý

- Không đủ trade thắng hoặc thua thì HTR không đáng tin; UI phải biểu diễn thiếu dữ liệu rõ.
- VEI chỉ phản ánh mẫu chuỗi lỗ được nhận diện, không kết luận toàn bộ logic EA là Martingale.
