# 02/11/2026: rà soát đối kháng làn diễn xuất (vòng 2 làm mượt)

Người rà soát đối kháng cho làn diễn xuất (`2026-11-02-lab-motion-acting.md`). Chỉ sửa `src/lab/` và `docs/`. Không đụng `src/view/skills`, `src/sim`, `src/content`, `src/kit`, golden hay game khác. Không có mã âm thanh, không tải tài sản. Không commit.

Cách tìm: đọc diff, chạy lại `lab-motion` và `lab-stress`, rồi viết hai kịch bản riêng (chỉ đo, không chụp) cho những đường demo không đi qua: chiêu nhả giữa lúc lướt dash, chữ gõ lúc đang đáp, đi ngay trong bước hãm, trúng đòn lúc K5 chào trời, K2 bấm nút sáu lần. Kịch bản thứ hai ghi quaternion thế giới của cánh tay và cẳng tay phải từng khung quanh cú nhả.

## 1. Lỗi đã xác nhận và đã sửa

1. **Dash để lại trạng thái** (`animator.ts`, `leaveDash`, `toIdle`, `charge`, `release`).
   - Phi Kiếm nhả giữa lúc lướt: `liftGoal` còn 0,1 m, nên nhân vật lơ lửng một gang tay mãi tới lần dash sau. Phi Kiếm tự bắn trong game, nên chuyện này sẽ gặp thường.
   - Gõ chữ lúc đang đáp: `brakeLeft` kẹt ở Infinity. Idle đứng yên ở khung 0 mãi, mỗi khung lại xin một chuyển tiếp, và mỗi lần bắt đầu đi thì pha bước bị đặt lại về 0.
   - Đi ngay trong bước hãm: `toIdle` bị gọi mỗi khung tới khi hết 0,2 s, pha bước bị đặt lại về 0 mỗi khung.
   - Sửa: chiêu gõ hay nhả đè lên dash thì độ nâng rơi, bước hãm kết thúc, chân lắng rồi mới khóa. `toIdle` luôn kết thúc bước hãm. Kiểm lại: gốc về 0 m, Idle chạy tiếp, bước đi chạy đúng nhịp.
2. **Cú lướt K2 và cú lùi khi trúng đòn dời vị trí logic** (`acting.ts`, `locomotion.ts`).
   - `nudge` cộng thẳng vào vị trí mà mã chiêu đọc. Bấm K2 sáu lần thì nhân vật dời 1,08 m; mỗi đòn trúng đẩy lùi 0,15 m vĩnh viễn. Canon §12.1 không cho K2 dời người, và trong game vị trí thuộc về sim.
   - Sửa: thành độ lệch chỉ của hình trên gốc hiển thị. K2 lướt 0,18 m trong 0,14 s, giữ suốt lúc chiêu giữ, về trong 0,5 s lúc thu. Trúng đòn lùi 0,15 m trong 0,17 s, giữ 0,12 s, về trong 0,45 s. Độ lệch không quá 0,3 m. Chân bước theo khi đi và khi về. Kiểm lại: sáu lần K2, vị trí logic dời 0 m.
3. **Chiêu bấm nút diễn nhầm chiêu** (`skills-main.ts`, `__lab.cast`). `KiemHost.play` chỉ báo tên clip, nên K4 (xin Skill2) diễn thành hộ thân và K1 (xin Attack) diễn thành Phi Kiếm. `lab-stress` bấm K4 hai lần đều ra dáng hộ thân. Sửa: lab nhả đúng ô chiêu trước khi gọi `fx.cast`.
4. **Tay ngắm lật trong một khung** (`acting.ts`, `aimArm`, `aimSegment`).
   - Kiểm tra "tay chưa hiện" đọc trọng số sau khi lò xo đã bước và đòi đích bằng 0. Vì vậy một cú ngắm mới quét vào từ hướng cũ của dáng trước, ngược với chú thích.
   - Sửa riêng chỗ đó thì lộ lỗi sâu hơn. Trọng số tăng dần trong lúc Attack tự vung tay khoảng 40°/khung, hướng clip và hướng ngắm lệch 130–150°. Trục của cú xoay một phần quay theo, nên cánh tay trên nhảy 142° trong một khung.
   - Dựng lại cú xoay ngắn nhất từ tay clip đang chạy ở mỗi khung làm xoắn quanh trục tay lật 178° trong một khung. Bàn tay, ổ VFX và tay áo lật theo.
   - Lúc gồng, trọng số chỉ một phần. Phép slerp theo cung ngắn nhất đổi phía khi góc xoay vượt 180°, nên cẳng tay nhảy 68° ở phím đầu của K1.
   - Sửa:
     - Cú ngắm mới bắt đầu đúng ở hướng tay clip và nhận đủ trọng số ngay, nên không có gì nhảy. Tay quay theo một cung tròn lớn.
     - Hướng xoay của tay ngắm được mang từ khung trước sang khung sau trong hệ nhân vật, và chỉ quay theo bước nhỏ của hướng ngắm.
     - Phần trộn với clip giữ trên cùng một bán cầu và đi dọc cú xoay đó, không theo cung ngắn nhất.
   - Kết quả: Phi Kiếm từ cánh tay trên 3.980°/s (2,67 × đỉnh clip) xuống cẳng tay 2.774°/s (1,86 ×). K1, K2 và K4 lúc nhả xuống dưới 1,5 ×.
5. **Đáp sau dash trượt chân và lơ lửng** (`animator.ts`, `updateDash`; `locomotion.ts`, `dashSlowerThan`, `dashPathSlowerThan`; `gait.ts`, `contact0`; `foot-ik.ts`, `clearance`).
   - Hai phép thử với xuống và rơi đọc đường dash logic. Đường này dừng sớm hơn gốc hiển thị khoảng 3 khung, vì gốc hiển thị trễ theo độ êm. Ngoài ra dáng chạm đất của Run với xuống thấp hơn dáng lướt khoảng 8 cm. Kết quả: chân trước chạm đất khi gốc còn chạy 6,8 m/s, chân trụ trượt 10,3 m/s (vòng 1: 5,0).
   - `updateDash` vẫn tua clip sau khi với xuống. "Dáng hãm giữ yên" thật ra là chu kỳ Run chạy tiếp dưới chân đang đáp, và chính nó đưa chân chạm đất.
   - `phase0` là lúc chân trái với xa nhất khi còn trên không, không phải lúc chạm đất. Giữ đúng khung đó thì hai chân lơ lửng 10 cm.
   - Chân đã chạm đất mà gốc còn nâng hơn 2 cm thì vẫn ở chế độ "off", chưa khóa, và trượt 3 khung.
   - Sửa:
     - Vẫn với xuống ở 55 % đỉnh đường logic như làn diễn xuất, nhưng gốc nâng lên 0,16 m trong lúc chân với.
     - Độ nâng chỉ rơi khi gốc hiển thị chậm dưới 8 % đỉnh.
     - Dáng hãm giữ đúng khung chân trái chạm đất (`contact0`, đo lúc nạp clip).
     - Chân nào xuống cách đất dưới 3 cm thì khóa ngay. Trong bước hãm không chờ lắng.
   - Kết quả: trượt chân trụ p95 của pha dash từ 0,239 xuống 0,056 m/s. Chân trước chạm đất khi gốc đã dừng: một khung 0,5 m/s rồi khóa. Trượt lớn nhất của pha dash từ 10,29 xuống 4,39 m/s; khung này là khung bật đi, đã có từ vòng 1.

## 2. Số đo: vòng 1, làn diễn xuất, sau rà soát

Cùng chuỗi `lab-motion.mjs`, 45 WPM, tốc hợp chân Lam, 60 Hz, 1280×720 (`tmp/shots/motion/r2-review-acting/`). Cột vòng 1 là `r2-acting-before` (commit `ca730aa` cộng bộ kiểm tra tay dang).

| Số đo | Vòng 1 | Làn diễn xuất | Sau rà soát |
|---|---|---|---|
| VFX: lớp bật / tắt (fair) | 0 / 0 | 0 / 0 | 0 / 0 |
| Kiếm: hiện / tắt / đổi cỡ / giật / nhảy | 0/0/0/0/0 | 0/0/0/0/0 | 0/0/0/0/0 |
| Khung gần tư thế bind | 0 | 0 | 0 |
| Xoay gốc lớn nhất (°/s) | 487 | 277,6 | 277,6 |
| Phím cuối → thân nhả, lớn nhất (ms) | 33 | 33 | 33 |
| Phím cuối → VFX (ms) | 0 | 0 | 0 |
| Chuyển clip vượt 1,5 × đỉnh clip | 2/26 | 6/27 | 3/27 |
| Tỉ số chuyển clip lớn nhất | 2,58 | 2,67 | 2,56 (idle → walk, có từ vòng 1) |
| Tay dang: khung cờ / chuỗi hỏng / khung hỏng | 148 / 3 / 148 | 31 / 0 / 0 | 33 / 0 / 0 |
| Xuyên đất lớn nhất (% chiều cao) | 1,36 | 1,03 | 1,03 |
| Trượt chân trụ p95 (m/s) | 0,117 | 0,188 | 0,188 |
| Khung chân trụ trượt > 0,05 m/s | 194 | 179 | 179 |
| Trượt chân trụ lớn nhất (m/s) | 4,96 | 10,29 | 4,39 |
| Trượt chân trụ p95 pha dash (m/s) | 2,017 | 0,239 | 0,056 |
| Chiêu có strikePct < 15 % | 4/6 | 3/6 | 2/6 (Phi Kiếm 13,3; hộ thân 4,4) |
| Trắng xóa, camera chơi, khung lớn nhất | 0,30 % | 0,07 % | 0,071 % |
| Trắng xóa, cận cảnh 6 m, khung lớn nhất / khung > 6 % | – | 3,98 % / 0 | 4,01 % / 0 |

Chuyển clip còn vượt 1,5 ×:
- idle → walk 2,56 và walk → idle 1,78: có từ vòng 1.
- Phi Kiếm 1,86: Phi Kiếm không có chữ gõ nên không có pha gồng.

Các lượt khác trên mã cuối:
- **120 Hz:** chuyển clip vượt 4/27 (làn diễn xuất 7/27), tỉ số lớn nhất 2,47. Xoay tối đa 276,6°/s, phím cuối → thân 42 ms. VFX 0/0, kiếm 0, bind 0, tay dang hỏng 0. Trượt chân trụ p95 pha dash 0,141 → 0,082.
- **Low và Ultra:** như 60 Hz. VFX 0/0, kiếm 0, bind 0, tay dang hỏng 0.
- **`lab-stress`:**
  - VFX 0/0, kiếm 0 trên 1.302 đời, bind 0, tay dang hỏng 0, xoay tối đa 290,1°/s.
  - Chuyển clip vượt 1,5 × từ 12/45 xuống 8/46.

## 3. Còn mở (không sửa trong lượt này)

- **Đầu gối phải giật khi bấm Phi Kiếm liên tục và khi K2 bấm lại** (`lab-stress`: bắp chân 7.352°/s và 5.975°/s; vòng 1: 6.100°/s). Nguyên nhân: Attack tự dậm chân phải rất nhanh, bị chạy lại mỗi 9 khung, cộng độ lệch quán tính. Một bước đặt lại chân xong cũng khóa chân ngay cả khi chân clip đang cách đất 8 cm, rồi nhả ở khung sau. Cả hai là mã vòng 1. Demo không bị.
- **Trượt chân trụ p95 0,117 → 0,188 m/s.** Lượt này không đổi các số đó. Phần lớn do đi ngang (1,13 → 1,30) và đi (0,317 → 0,341).
  - Đi ngang: khóa xoay trên bóng chân của clip Strafe trôi, lỗi cũ.
  - Đi: phần tăng nằm ở lúc tới nơi, không phải lúc bắt đầu đi. Khung trượt trong 1/6 cuối của pha tăng từ 3 lên 21.
  - Đã thử A/B bằng lò xo hướng cũ. Với bộ bám hướng mới, cú xoay trước khi đi chậm hơn, nên cả đoạn đi trễ 13 khung. Cú chuyển Run → Walk vì vậy rơi giữa lúc chân trái đang trụ: độ lệch khóa lên 0,14–0,17 m, chân nhả rồi trượt về chỗ chân clip trong khoảng 15 khung (0,2–1,8 m/s). Với lò xo cũ, chân giữ khóa suốt lúc tới nơi.
  - Cơ chế là cú đổi dáng đi của vòng 1 khi một chân đang khóa, nên chỉ ghi lại để làn sau sửa: đổi dáng đi theo chân trụ, hoặc đổi khi chân đó nhấc lên.
- **Nhịp dội của K1 và K5 chạy theo giờ thế giới (dừng hình), còn VFX chạy theo giờ thật.** Nếu dừng hình của chiêu khác rơi giữa lúc K1 hay K5 đang bay, nhịp dội trễ tới khoảng 3 khung.
- **K2 và trúng đòn:** trượt chân trụ lớn nhất của pha tăng (0,049 → 0,194 và 0,035 → 0,055 m/s), vì chân giờ bước hai lần: khi lướt hay lùi, rồi khi về. p95 vẫn dưới 0,05.
- Trúng đòn mạnh (thân 18°, đầu 25°) và việc đọc rõ ở camera chơi: chờ hai giám khảo mới.

## 4. Kiểm tra

- `npx tsc --noEmit` (strict) qua.
- `pnpm test`: 74 tệp, 675 test qua, có `boundary.test`.
- `node src/kit/verify-kit.mjs`: 73 tệp khớp.
- `pnpm build` qua. Grep `dist` không thấy `skills-lab`, `MotionProbe`, `ArmCheck`, `labRim`, `lab-hit-rim`, `aimSegment`, `turnPrev`, `dashPathSlowerThan`, `contact0`.
- Không cấp phát mỗi khung: mọi biến tạm là hằng của module hoặc mảng cấp sẵn.

## 5. Tệp

- `src/lab/anim/acting.ts`: độ lệch chỉ của hình; tay ngắm mang hướng xoay qua các khung, giữ bán cầu.
- `src/lab/anim/animator.ts`: `leaveDash`, `toIdle` kết thúc bước hãm, đáp dash, chế độ chân lúc đáp.
- `src/lab/anim/locomotion.ts`: bỏ `nudge`; tốc của đường dash hiển thị và đường logic.
- `src/lab/anim/gait.ts`: `contact0`.
- `src/lab/anim/foot-ik.ts`: `clearance()`.
- `src/lab/skills-main.ts`: `__lab.cast` nhả đúng ô chiêu.
- `docs/SYNC_DEBT.md`.
