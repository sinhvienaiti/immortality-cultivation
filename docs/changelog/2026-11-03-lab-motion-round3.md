# 03/11/2026: vòng 3 chuyển động của lab kỹ năng: bộ cử chỉ thi triển

Chủ dự án, 03/11/2026 khoảng 02:00: "phần animation cử chỉ tay, chân, cơ thể của nhân vật cũng nên được làm thật chi tiết, thật khớp khi thi triển" (canon D58 (8)). Vòng 2 được hai giám khảo mù chấm 6,1 và 6,5. Danh sách còn mở nằm ở mục "Kết quả vòng 2" của `docs/games/tu-tien/MOTION_PLAN.md` (repo cha).

Chỉ sửa `src/lab/anim/**`, `src/lab/caster.ts` và thêm kịch bản chụp `scripts/visual/scenarios/lab-gestures.mjs`. Không đụng `src/view/**`, `src/lab/skills-main.ts`, `herd.ts`, `src/kit/**`, `src/view/renderer.ts` hay `src/content/rules.ts`. Lab chỉ chạy trên trang dev, không vào bản build.

Commit: `e502e62` (bộ cử chỉ, bảng ánh xạ, sửa danh sách vòng 2), `e59e71b` (làm lại sau giám khảo đầu).

## 1. Bộ cử chỉ thi triển (`src/lab/anim/gestures.ts`, mới)

Bảy cử chỉ dùng lại được. Mỗi cử chỉ là dữ liệu: dáng toàn thân cho từng pha, dáng chân, bước lướt và cú quất đuôi.

| Cử chỉ | Lấy đà (lúc gõ) | Nhả (phím cuối) | Sau đó |
|---|---|---|---|
| Kiếm chỉ 剑指 (`swordSeal`) | Ngón kiếm giơ cạnh tai, tay trái kết ấn trước ngực, thân xoắn ngược, trọng tâm về chân sau | Hất ngón kiếm ra trước, chếch ra ngoài và lên; tay trái giật về hông; trọng tâm sang chân trước, chân trái nửa bước | Giữ, lắng, thu |
| Kiếm chỉ chỉ trời 敕令 (`skyLift`) | Ngón kiếm dựng thẳng trước mặt, tay trái đỡ | Hai ngón đẩy lên trên và ra trước đầu, tay trái vòng ra sau lưng, ngực mở, mắt nhìn sân | Tay quét ra trước chỉ huy kiếm săn |
| Vung tay tung quạt kiếm (`fanSweep`) | Tay kiếm cuộn cao qua vai trái, thân xoay trái, trọng tâm chân trái | Quét ngang sang phải ở tầm vai rồi chúc xuống vùng trận, tay trái hất ra sau, chân phải bước ra | Giữ tới nhịp kiếm cắm |
| Đâm cung bộ 弓步 (`bowThrust`) | Tay kiếm thu về hông phải, tay trái đưa ra dẫn hướng, cuộn sâu | Chân trái bước dài thành cung bộ, chân sau duỗi, gối trước khuỵu, tay đâm thẳng tuyến chếch ra cạnh mũ trùm, tay trái kéo về hông | Lắng, chân trước bước về |
| Hai tay chỉ trời (`overheadRaise`) | Gom thấp, hai tay ra sau, thân xoắn, chân mở rộng | Hai tay thẳng lên trời, ngực mở (dáng cố ý) | Tay kiếm đưa mưa kiếm xuống vùng |
| Thủ trụ mã bộ (`guardStance`) | Gom thấp, hai tay về hông | Mã bộ rộng, kiếm ngang trên đầu đỡ, tay trái mở ra cạnh sườn, thân vuông góc mục tiêu (dáng cố ý) | Giữ thế 0,55 s |
| Cúi thấp lướt (`dashCrouch`) | Nén thân theo chữ gõ | Nén sâu, lướt ngả 28° hai tay quét ra sau | Tiếp đất nén sâu |

Mỗi cử chỉ còn có:
- **Chuyển trọng tâm**: hông dời về chân trước hoặc chân bên (`shiftF`, `shiftR`).
- **Chân**: dáng chân là độ lệch của từng bàn chân so với chân của clip. `foot-ik.ts` nhận dáng chân và tự bước bằng IK hai đốt, mỗi bước có độ dài và độ nhấc riêng, luôn còn một chân trụ. Bước lướt có neo, nên chân sau của cung bộ đứng yên.
- **Cổ tay và đầu**: cổ tay theo hướng bàn tay (Lam không có xương ngón, nên `fingers` chỉ ghi dáng ngón cho rig có ngón sau này). Đầu nhìn mục tiêu và có độ ngước riêng.
- **Thân**: rút bớt phần xoay thân của clip nền (`square`), để độ xoắn của cử chỉ là thứ hiện ra.
- **Đuôi**: quất đuôi khi nhả.
- Biên độ thân và bước lướt nhân `GESTURE_GAIN` = 1,3 cho camera chơi.

Pha của cử chỉ:
- Lấy đà lớn dần theo chữ gõ tới phím cuối.
- Nhả trong ≤ 50 ms sau phím cuối, có một nhịp khuỵu ngắn.
- Giữ, vượt rồi lắng, rồi thu chiêu. Khi thu, tay về dáng Idle với trọng số đủ rồi mới thả.

## 2. Ánh xạ ô chiêu là dữ liệu

- `SLOT_GESTURES` (gestures.ts) ghi chiêu nào dùng cử chỉ nào, cùng nhịp riêng của chiêu: thời gian giữ, nhịp trúng, dáng cố ý, độ cao mục tiêu.
- `SLOT_CLIP` (caster.ts) ghi đoạn clip nền của từng chiêu.
- Ánh xạ hiện tại:
  - auto, k1 → kiếm chỉ;
  - k2 → cung bộ;
  - hộ thân → mã bộ;
  - dash → cúi lướt;
  - k4 → quạt kiếm;
  - k5 → chỉ trời;
  - k7 (Vạn Kiếm Triều Tông) → kiếm chỉ chỉ trời.
- Bộ chiêu mới đổi ô bằng `setSlotGesture`, không cần sửa mã.
- `caster.charge`, `caster.release` và `caster.prime` nhận mã ô dạng chuỗi, nên nhận được cả "k7".
- `caster.prime(slot, tx, tz, leadS)`: đánh thường tự phát được lấy đà trước khi phát, như một chữ được gõ.

## 3. Sửa danh sách vòng 2

- **Lấy đà cho đánh thường và K4**: có `prime` cho đánh thường. Đà lấy lớn dần theo chữ gõ, thân xoắn ngược sâu hơn, có nhịp khuỵu khi nhả.
- **Xoay ~150° trong 4 khung**: nguồn gốc là ngực, không phải gốc. Ngực từng quay 1.590 °/s, tức 82° trong 4 khung ở cú nhả K2. Nay hướng ngực và đầu bị giới hạn mềm ở 720 °/s (cap·dt·tanh). Chiêu có mục tiêu thì xoay sẵn trong lúc gõ; cú xoay khi ra chiêu được tối đa 600 °/s, có easing và bước chân nhanh hơn.
- **Biên độ ×1,3** ở camera chơi.
- **Trúng đòn**:
  - lên trong 3 khung, khựng 3 khung, rồi thu bằng lò xo có vượt nhẹ;
  - gối khuỵu 5 cm, hai tay hất ra;
  - hai chân nhảy lùi 0,28 m;
  - vòng đỏ ở ngực (`hit-ring.ts`);
  - clip Hit giảm còn 0,15.
- **Dash**:
  - bóng lưu ảnh màu xanh của Lam (`afterimage.ts`, 6 bản sao mesh skin, viền fresnel);
  - dáng lướt thấp hơn, tiếp đất nén sâu hơn.

  Lóe trắng phủ thân là VFX của làn khác.
- **Đuôi**: theo nhiều chuyển động của thân hơn. Nhánh đuôi có thêm quất khi nhả, tiếp đất, trúng đòn và dừng, và lắc theo nhịp bước khi đi.
- **Đầu và thân dẫn trước khi xoay**: thân dẫn 22 % phần còn phải xoay (tối đa 13°), đầu thêm 30 % (tối đa 18°).
- **Bước chỉnh thế khi dừng**: dừng lại thì thân ngả ra sau rồi lắc nhẹ ra trước, sau đó hai chân bước về chỗ đứng.
- **Sửa thêm**:
  - Sau một lần đi ngang, độ lệch hướng của bước ngang còn sót lại làm thân quay 194° theo đường dài. Đã sửa: tính giới hạn hướng chân trên cùng nhánh góc, và xóa độ lệch khi đứng.
  - Chuyển đi bộ sang chạy bật đầu ngửa 70°. Đã sửa: chọn dáng đi theo tốc độ đã làm mượt, và nới dải trộn. Nay chỉ còn 15°.
  - Thu chiêu từng làm cánh tay vung 95° trong 6 khung. Nay tay về dáng Idle trước rồi mới thả.

Blender 60 fps: không cần. Cú vung giờ do lò xo thủ tục chạy ở 60 Hz điều khiển (tay ngắm ở trọng số 1). Clip 24 fps chỉ làm nền, qua đoạn vung với tốc ×1,2 rồi đứng. Chỗ máy móc duy nhất đo được là cú bật lúc chuyển đi bộ sang chạy, và đã sửa trong mã.

Đo thân: `src/lab/anim/body-check.ts` đo tốc xoay của ngực và đầu, và số khung dẫn trước khi xoay. Kết quả nằm trong `__lab.metrics().arms.body`.

## 4. Số đo (`lab-motion.mjs`, `?typed=1`, 45 WPM, 60 Hz; trước = mã chuyển động vòng 2 ở HEAD `eb16064`)

| Mục | Trước | Sau | Ngưỡng |
|---|---|---|---|
| Phím cuối → thân nhả, lớn nhất | 33 ms | 33 ms (120 Hz: 42 ms) | ≤ 50 ms |
| Khung gần tư thế bind | 0 | 0 | 0 |
| Trượt chân trụ p95 | 0,188 m/s | 0,183 m/s | 0,05 |
| Trượt chân trụ p95 theo pha | đi 0,341 · dash 0,056 · trúng đòn 0,013 | đi 0,258 · dash 0,026 · trúng đòn 0,048 | 0,05 |
| Xoay gốc lớn nhất | 278 °/s | 433 °/s (xoay khi ra chiêu) | khung > 1.800 °/s: 0 |
| Xoay ngực / đầu lớn nhất | 1.590 / 1.588 °/s | 720 / 720 °/s | 720 |
| Ngực / đầu xoay nhiều nhất trong 4 khung | 82° / 82° | 48° / 47° | — |
| Ngực / đầu dẫn trước khi xoay | 0,7 / 3,3 khung | 4,4 / 8,9 khung | 4–6 |
| Chuyển clip vượt 1,5 × đỉnh clip | 3/27 (lớn nhất 2,56) | 5/28 (lớn nhất 2,56) | 0 |
| Tay dang hỏng | 0 | 0 | 0 |

Chuyển clip còn vượt: bắt đầu đi (có từ trước), dừng, cú nhả của đánh thường (1,56), bước cung bộ của K2 (1,64) và cú nhảy lùi khi trúng đòn (2,14). Mốc so là đỉnh clip Idle, nên bước chân thủ tục nào cũng vượt.

## 5. Giám khảo mù (thang 0–10, so với Genshin, Star Rail, Wuthering Waves)

| Hạng mục | Giám khảo 1 (bản đầu `e502e62`) | A (bản `e59e71b`) | B (bản `e59e71b`) |
|---|---|---|---|
| Lấy đà và theo đà | 5,5 | 5,5 | 6 |
| Khối lượng | 4,5 | 5,5 | 6 |
| Chuyển tiếp | 4,5 | 5 | 6 |
| Trúng đòn | 4 | 5 | 5 |
| Đi, xoay, đứng | 5 | 6 | 6,5 |
| Đọc rõ ở camera chơi | 3,5 | 4,5 | 4,5 |
| Cử chỉ khớp chiêu, chi tiết | 5 | 5,5 | 5,5 |
| **Chung** | **4,7** | **5,3** | **5,7** |

Chưa tới 7, nên chưa làm clip 60 fps cho chủ dự án. Bộ giám khảo này khác vòng 2 và chấm nặng phần đọc rõ ở camera chơi, nên không so trực tiếp với 6,1 và 6,5.

Điều cả hai giám khảo A và B cùng nói:
1. **Đọc rõ ở 50–70 px.** Camera từ sau lưng, nên mũ trùm che tay đưa ra trước.
   - Dáng cần đẩy gấp 1,5–2 lần: tay và kiếm thoát hẳn khỏi bóng thân, hông hạ 20–25 % chiều cao.
   - Giữ dáng nhả 6–8 khung trước khi VFX lên đỉnh.
2. **Lấy đà còn "đứng hình".** Cần một cú cuộn lớn dần theo chữ (xoắn 25–35°), mỗi phím thêm 2–3°, và dáng cực ở phím cuối.
3. **Trúng đòn chưa đủ toàn thân.** Cần hông lùi 10–15 cm, gối khuỵu, tay hất 20–30°, một bước loạng choạng rồi hồi trong 0,35–0,5 s.
4. **Giữ dáng chết, thoát giữ gấp.** Mọi dáng giữ cần thở và trôi 1–5°. K5 từ dáng giữ sang lắng chỉ mất khoảng 3 khung, cần 10–14 khung.
5. **Cử chỉ riêng chưa rõ.**
   - K5 hai tay chưa thật sự lên trên đầu.
   - K4 cần chuỗi hông → ngực → vai → tay, mỗi khâu cách nhau 2–3 khung.
   - K7 cần nâng tay lớn hơn và nhón chân.
   - Khi xoay, đầu cần dẫn 20–30°.

## 6. Còn mở

- **Móc cho `skills-main.ts`** (làn khác giữ file này):
  - phím 7 gọi `caster.release("k7", tx, tz)` thay cho `"k1"`;
  - đồng hồ đánh thường gọi `caster.prime("auto", tx, tz, 0.25)` 0,25 s trước khi phát.

  Bộ chụp hiện làm tạm hai việc này qua `__labCaster`.
- **Gửi làn VFX:**
  - làm tối hoặc đẩy vòng sáng dưới chân ra dưới thân nhân vật;
  - không phủ lóe lên thân trong 6–8 khung đầu sau khi nhả;
  - kiếm trên tay không tắt rồi bật lại (cần nhịp ném và bắt);
  - kiếm K4 xuyên mũ trùm;
  - lóe trắng của dash.
- **Theo luật ba lần thử:** vòng 1 được 5,4; vòng 2 được 6,1 và 6,5; vòng 3 được 4,7, rồi 5,3 và 5,7. Chưa có bước tăng rõ, nên trước lần thử thứ tư cần bàn với ChatGPT một cách khác. Ví dụ: góc camera cận cho cảnh ra chiêu, dáng đọc được từ phía sau, hoặc clip Blender riêng cho từng cử chỉ thay cho lớp thủ tục.
- **Công cụ `tools/capture-prune`** từ chối mọi đường dẫn có `immortality-cultivation` (`protected-path`). Vì vậy khung thô của các lượt chụp vòng 3 đã được xóa bằng tay, chỉ thư mục `raw/` do chính lượt này tạo.

## 7. Tệp kết quả

- Bộ chấm (tờ, dải khung, clip nửa tốc độ): `tmp/shots/motion/r3-judge2/judge/` (bản `e59e71b`) và `tmp/shots/motion/r3-judge1/judge/` (bản đầu).
- Clip liền: `tmp/shots/motion/r3-judge2/clips/all-{play,close}-{half,60fps}.mp4`.
- Số đo: `tmp/shots/motion/r3-before/`, `r3-try10/` (60 Hz), `r3-final-120/` (120 Hz).
