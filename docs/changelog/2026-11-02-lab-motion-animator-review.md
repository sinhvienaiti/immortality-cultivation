# 02/11/2026 — Rà soát Bước 2 (nhân vật) của MOTION_PLAN trong lab

Người rà soát đối kháng cho làn nhân vật. Chỉ sửa `src/lab/anim/`. Không đụng
`src/kit`, `src/sim`, `src/content`, `src/view/skills` hay golden. Không commit.

## Lỗi đã xác nhận và đã sửa

Cách tìm: chạy lại chuỗi `lab-motion` (tốc của bước 1), ghi quaternion của cả
31 xương mỗi khung, rồi đo vận tốc góc từng xương. Bộ đo chỉ lưu xương nhanh
nhất mỗi khung, nên một số lỗi không hiện trong `metrics.json`.

1. **Đầu gối giật khi chân gần duỗi thẳng** (`foot-ik.ts`, `solve`). Khi đứng,
   chân Lam đã duỗi 96 % chiều dài. Ở độ duỗi đó, IK hai đốt xoay gối hàng chục
   độ cho mỗi cm thay đổi. Đo được bắp chân 1.562°/s khi xoay 180°, 1.957°/s khi
   xoay lúc gõ dash, 2.027°/s khi đáp sau dash, mỗi lần một khung.
   Sửa: soft IK, tầm với êm dần sau 97 % chiều dài (`SOFT_START`).
2. **Chân khóa bị kéo xa quá tầm với**. Đo được tỉ số hông–mắt cá 1,07 khi
   xoay tại chỗ, 1,13 khi bắt đầu đi, 1,35 khi đáp dash. Chân duỗi thẳng và
   mắt cá lệch 13,5 cm khỏi điểm khóa.
   Sửa: hạ pelvis tối đa 4 cm theo lò xo, chỉ phần mà chân khóa hoặc bước cần
   thêm so với chân clip (`lowerPelvis`, `DROP_*`). Chân không với tới cả khi đã
   hạ hết sẽ nhả và mờ dần về chân clip (`overreach`, `OVERREACH`). Có trễ để
   không khóa lại ngay (`RELOCK`), vì lần thử đầu khóa và nhả xen kẽ từng khung.
3. **Bước đặt lại chân quá nhanh**. Trước: nhấc chân, rồi lướt ngang trong 36 %
   thời gian bước, rồi hạ. Giờ chân lướt trên một cung trong 56 % thời gian
   (`STEP_RISE` 0,3, `STEP_ACROSS` 0,22), lúc đã cao 4 cm, nên tốc ngang đỉnh
   giảm 36 %.
4. **Chân xuyên đất**. Clip đi, đi ngang và đoạn chuyển từ dash về Idle đưa mắt
   cá hoặc bóng chân xuống dưới mặt đất tới 5 cm. IK không bao giờ giải dưới mặt
   đất nữa (`footY`). Lực đẩy lên đi qua lò xo half-life 0,025 s nên không tạo
   gãy khúc (`UNDER_HALFLIFE`).
5. **Đáp sau dash** (`animator.ts`, `updateDash` và `endDash`). Idle bắt đầu ngay
   lúc hạ xuống chứ không đợi chạm đất, nên chân với xuống trong lúc rơi. Trước
   đó, ngay khi chạm đất, đoạn chuyển từ tư thế co chân của dash kéo lê hai chân
   đã khóa khoảng 0,3 s. Trong 0,3 s sau khi đáp, chân chỉ khóa khi clip đã chậm
   lại dưới 0,5 m/s (`landHold`, `SETTLE_LOCK_MPS`). Đánh đổi: chân trượt về chỗ
   khoảng 30 cm như phanh, thay cho gối giật và chân duỗi bị lê.
6. **Đầu cứ nhìn mục tiêu dash mãi**. `dash()` không thả cái nhìn và cũng không
   đặt `lookHold`. Sau khi đáp, đầu và ngực vẫn quay −99° về chỗ cũ cho tới hành
   động sau. Tương tự, một chữ đang gõ dở mà bị hủy vì đi (`walkPath`) để lại cái
   nhìn bật mãi. Sửa: thả cái nhìn mỗi khung khi hết `lookHold` và không còn gồng.
   Dash thả cái nhìn lúc bắt đầu lướt. Khi gõ dash, cái nhìn giữ 0,6 s giữa hai
   phím.
7. **Look-at lật hướng** (`layers.ts`, `applyLook`). Khi thân đi sát qua mục
   tiêu, góc phương vị lật 180° trong một khung. Đích nhìn giờ êm dần về thẳng
   phía trước khi mục tiêu ở gần (0,4–1,2 m). Mục tiêu ở sau lưng thì chọn bên
   mà thân đang xoay (`turnHint`). Cái nhìn mờ hẳn thì góc chờ sẵn ở đích, nên
   khi bật lại không lò xo vụt qua góc cũ. Đầu nhanh nhất: 399 → 240°/s.
8. **Đặt lại không sạch trạng thái**.
   - `Locomotion.place` giữ `feetYaw` và `yawLead` cũ. Sau `__lab.reset()` lúc
     đang xoay, mục tiêu yaw bị kẹp theo hướng chân cũ, nên thân giật xoay ở
     khung đầu.
   - `Layers.reset` để `breathWeight` ở 0,3 nếu reset giữa đòn đánh.
   - `FootLock.reset` không xóa `lastMode` và `lockedNow`.
   - `Animator.place` không xóa `lookHold`, `turnLead` và yêu cầu chuyển tiếp
     đang treo.

   Kiểm bằng kịch bản reset giữa lúc xoay, giữa đòn K5 và giữa dash: yaw đứng
   yên 180°, vận tốc 0, thở 1, không còn cái nhìn.

## Số đo (`lab-motion.mjs`, cùng chuỗi; trước = `step2`, sau = `review-char`)

| Số | Tốc bước 1, 60 Hz | 120 Hz | Tốc hợp chân Lam |
|---|---|---|---|
| Chuyển clip vượt 1,5× | 2/26 → 2/26 | 5/26 → 4/26 | 2/26 → 2/26 |
| Tỉ số chuyển lớn nhất | 3,64 → 2,57 | 6,92 → 3,48 | 5,57 → 2,58 |
| Tỉ số khung lớn nhất (so đỉnh clip) | 98,8 → 40,3 | 113,2 → 40,9 | 92,9 → 37,9 |
| Xuyên đất | 1,81 % → 1,36 % | 1,72 % → 1,66 % | 1,81 % → 1,36 % |
| Trượt chân trụ p95 | 0,152 → 0,255 m/s | 0,253 → 0,335 | 0,114 → 0,117 |
| Khung trượt chân trụ vượt ngưỡng | 190 → 171 | 434 → 399 | 226 → 194 |
| Trượt chân (cả hai) p95 | 1,172 → 1,157 | 1,196 → 1,235 | 1,148 → 1,292 |

- Xuyên đất giờ chỉ còn ở cú đáp dash, do lò xo đẩy lên trễ một hai khung. Pha
  đi giảm từ 1,34 % xuống 0,64 %, pha dừng từ 0,74 % xuống 0,08 %.
- Trượt chân trụ p95 theo pha, tốc bước 1:
  - Giảm: đi và chạy 0,668 → 0,642; dừng 0,033 → 0,016; xoay 180° 0,109 →
    0,085; auto 0,065 → 0,030; K1 0,109 → 0,074.
  - Tăng: dash 0,708 → 1,978, chính là cú trượt phanh khi đáp ở mục 5. Đây là
    lý do p95 toàn chuỗi tăng.
- Đi ngang ở tốc Lam 0,522 → 1,134: chuyển động trượt vẫn y như trước (nhả khóa
  quá 18 cm khi tì trên bóng chân). Bộ đo chỉ tính chân thấp hơn, nên khi hai
  chân không còn xuyên đất thì nó chọn chân đang trượt sớm hơn.
- Bắp chân nhanh nhất, ngoài pha chạy:
  - Xoay 180°: 1.562 → khoảng 520°/s.
  - Xoay lúc gõ dash: 1.957 → khoảng 800°/s.
  - Đáp dash: 2.027 → khoảng 610°/s.
- Đầu nhanh nhất: 399 → 240°/s.

## Còn mở

- Bắt đầu đi vẫn vượt 1,5× (2,57). Đi ngang ở tốc bước 1 vẫn vượt (1,76, vì
  clip chạy 4,3× tốc gốc). Cần clip Start, Stop, Turn và Strafe nhanh (Quaternius
  UAL, chờ chủ dự án).
- Cú trượt phanh khi đáp dash (30 cm trong khoảng 0,2 s). Giám khảo nên xem
  `clip-follow-half.mp4` quanh khung 960–990.
- Pivot trên bóng chân trong đi ngang trôi 18–20 cm rồi mới nhả. Đây là thiết kế
  khóa của làn, chưa sửa.
- Chưa có hai giám khảo mù chấm (Bước 4).
