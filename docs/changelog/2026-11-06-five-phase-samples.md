# 06/11/2026 · Hai chiêu mẫu đủ 5 pha (Hỏa) và thân sao chổi của sao băng

Việc: `docs/work/tasks/skill-five-phase-samples.md` (anh, 06/11 ~11:10: "cái chính là vfx khi tung chiêu, chiêu bay như nào, và vào quái sẽ ra sao, xung quanh chiêu đó animation sẽ như nào"). Chỉ trong lab (`skills-lab.html`), không vào bản chơi.

## Đã làm
- **Thân sao chổi (D62, mọi hệ có clip):** `src/lab/comet-head.ts`. Mỗi sao băng phím M vẽ clip `comet` của hệ: video 1080p lặp (một video cho cả loạt), thẻ ghim ở `head`, xoay theo `dir` nên đầu luôn đi trước theo hướng rơi; atlas khi không phát được video (`?video=0`); lớp thân `layer: body` (Ám, khói đen nền trắng) vẽ bằng atlas dưới lớp viền. Hệ chưa có clip `comet` giữ đầu lõi sáng và đuôi `ribbon` như trước. Sao băng rơi 0,3 s (trước 0,18 s) để thấy thân; cú đầu 0,45 s sau phím (dải phóng lên trời đi trước).
- **Đọc manifest:** `flipbook.ts` đọc `head` và `dir` của vai `comet` ở cả dạng cặp số lẫn dạng của lab-flipbooks (`head.uv`, `head.cellUv`, `dir.vec`).
- **Năm pha mẫu (Hỏa):** `src/lab/five-phase.ts`, công thức `FIRE_FIVE` (chỉ id clip của thư mục `fire`; không vẽ hình bằng mã).
  - Mẫu 1, phím M (sao băng): tụ lực khi gõ từ (xoáy `fire-charge-gather-w2` ở tay, ấn `fire-halo-seal-loop` xoay dưới chân, lấp lánh `fire-twinkle-set` hút vào, viền người sáng cam); phóng ở khung phím cuối (vòng `fire-halo-ring` từ khung đỉnh, lõi lấp lánh, sen lửa `fire-burst`, giật camera, dải `style-w2-fire-ribbon` phóng lên trời); bay (ấn xoay đánh dấu 0,2 s trước cú, sao chổi, đuôi dải lửa, lấp lánh); chạm (phun `fire-spark-spray-w2` trên thân, sen lửa và vòng `style-w2-fire-qi-burst` xoay dưới đất, quái lóe màu lửa 0,1 s, bị đẩy, cháy `fire-ground` trên thân 1,6 s, số, dừng hình theo bậc; chết cháy tan thành `dragonhold-embers` và tàn bay lên); dư âm (vết cháy `fire-ground-mark` từ tranh, tàn `fire-embers-rising-loop-w2`, khói nhạt `fire-smoke-roll-white-w2`, tan bằng ăn mòn trong 2,4 s).
  - Mẫu 2, phím 2 (lưỡi liềm): tụ lực (dải `strip-fire-sheath-flow-w2` bao lưỡi kiếm, lấp lánh xoáy quanh, ấn xoay); phóng ở mũi kiếm (vòng hào quang, sen lửa, vòng sóng quanh chân, giật camera); lưỡi liềm của anh (`fire-crescent-sym`, CrescentClip) bay thẳng 16 m ở 30 m/s với vệt mềm, bóng mờ, lấp lánh từ hai sừng; xuyên hàng quái, mỗi con trúng một lần (vệt chém in trên thân + như mẫu 1); cuối đường nhát lớn; dư âm là vết cháy kéo dọc đường chém.
- **Lab:** trong Hỏa, phím M và phím 2 chạy mẫu; `?typed=1` (hay ô "Typed charge") để thấy pha tụ lực khi gõ từ (M: 2 chữ ≈ 0,27 s ở 45 WPM; phím 2: 6 chữ); `?five=0` để so bản cũ; `__lab.five()`, `__lab.setTyped()`. `herd.hit` nhận độ dài lóe viền; `LabCaster.glow`; `HandSword.blade`.

## Số đo
- Từ phím tới phóng: cùng khung (0 khung thế giới).
- Khung chạm đầu của sao băng = đỉnh của chính nó (ánh thêm trong khung giữa camera cận: 0,073 ở khung chạm, sau đó 0,056–0,058; tỉ lệ 1,00).
- Test: 103 tệp, 1084 test qua; `tsc --noEmit` sạch.

## Chưa làm
- Khí nóng gợn quanh lưỡi liềm (méo không khí): lab chưa có lượt méo; để sau.
- Chữ trên quái ≥ 7:1: nhánh này chưa có thẻ chữ (mặt nạ thẻ ở `claude/lab-readability` chưa gộp), nên chưa đo.
- Lõi trắng ≤ 25 % bề ngang: chưa đo riêng.
