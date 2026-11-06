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

## Vòng 2 · rộng hơn, mạnh hơn, mưa thiên thạch (anh 06/11 12:45, 12:50, 12:52)
Anh: "tôi muốn chiêu rộng hơn, mạnh mẽ hơn, hiệu ứng mạnh hơn khi va chạm, hiện tại nhìn vẫn hơi bé và cảm giác hơi yếu, nhất là thiên thạch"; "thiên thạch phải làm dạng mưa thiên thạch, rơi nhiều nơi trong map, và rơi trong khoảng 5-8s"; "cục thiên thạch cũng cần làm to hơn". Số theo nhật ký 12:45, 12:50 (thay phần sao băng của 12:45) và 12:52.

- **Mưa thiên thạch (phím M, mọi hệ; `src/lab/meteor-plan.ts`):**
  - Lịch rơi lập lúc bấm, từ một hạt giống (sau reset ra lại đúng trận mưa): 18–24 quả; quả đầu 0,45 s sau phím, quả cuối khoảng 6,45 s; cách nhau 0,2–0,4 s, có lệch ngẫu nhiên, dày ở giữa, thưa ở hai đầu.
  - Cỡ: khoảng 30 % quả lớn (thẻ 15 m, đầu khoảng 4,2 m; nổ 8 m; vòng sóng 11 m), 50 % quả vừa (đầu khoảng 3 m; nổ 5,5 m), 20 % quả nhỏ (đầu khoảng 2 m; nổ 3,5 m). Mở bằng một quả lớn; kết bằng quả lớn nhất (đầu khoảng 4,8 m; nổ 10 m; vòng sóng 12 m; dừng hình 0,12 s) vào cụm quái dày nhất.
  - Chọn chỗ rơi lúc quả bắt đầu rơi (quái đã đi): khoảng 60 % vào cụm dày nhất chưa bị đánh trong 1 s gần nhất (cách xa 5 m), còn lại rải trên sân (vùng quái đứng, nới 1,5 m).
  - Mỗi quả đánh mọi con trong bán kính theo cỡ (2,2 / 3,2 / 4,5 / 5,5 m), đẩy ra xa tâm nổ. Quái nhỏ dưới quả vừa trở lên bị hất văng 2–3 m theo đường cong (`herd.launch`). Quái lớn lảo đảo.
  - Màn hình theo từng quả: dừng hình 0,10 s ở quả đầu, 0,05 s ở quả lớn, 0,12 s ở quả cuối. Rung riêng từng quả, không cộng dồn thành rung liền (`ScreenFx.jolt` mới). Chớp ấm toàn màn 0,45–0,6 trong 2 khung ở quả lớn, bắt đầu sớm 20 ms (lúc chớp lên hết) để khung chạm đã đủ sáng. Camera giật xuống. Đèn chạm 4–12.
  - Không quá 6 vụ nổ cộng sáng cùng lúc: lịch cắt bớt đuôi vụ nổ cũ, đo được tối đa 6. Đất cháy tích dần, tối đa 12 mảng, đo được tối đa 10.
- **Đầu thiên thạch là khối đặc, sáng:** `comet-head.ts` vẽ quả cầu ở đầu clip `comet` lần thứ hai (đĩa quanh đầu, 0,6 ánh sáng, che đất phía sau 0,85). Mọi quả cùng hệ vẫn dùng chung một VideoTexture.
- **Vụ nổ Hỏa (`FivePhase.blast`, chỉ clip của hệ):**
  - Vòng `fire-halo-ring` chớp ở tâm, có lõi lấp lánh.
  - Sen lửa `fire-burst` phun từ đất, rộng bằng cỡ nổ. Bắt đầu từ khung sát đỉnh (khung chạm đã đủ sáng), giữ, rồi tàn bằng ăn mòn.
  - Phun `fire-spark-spray-w2`.
  - Sóng xung kích: vòng `style-w2-fire-qi-burst` nằm phẳng, lan tới 5–12 m trong khoảng 0,4 s.
  - `dragonhold-embers` cùng tia `fire-sparks` (màu ấm) văng ra; tàn lửa ném xa 3,5–8 m.
  - Đất cháy `fire-ground-burn-loop-w2` nằm phẳng 2,5 s, cùng vết cháy từ tranh, than và khói.
  - Mỗi quả chỉ 4 con gần nhất có phun tia trên thân, để khỏi chồng phun trên cả đám.
- **Lưỡi liềm (phím 2):**
  - Thẻ 3,6 → 4,2: hai sừng cách khoảng 7,5 m, dày hơn theo tỉ lệ. Vùng trúng ±3 m.
  - Mỗi con trúng nổ 3,6 m, vòng 4,5 m, tối đa một vụ mỗi 0,05 s.
  - Cuối đường nổ 6 m, vòng 8 m. Mọi con trong 3,2 m trúng thêm một đòn kết và bị hất văng.
- **Chữ trên quái:** trong lúc lưỡi liềm và các vụ nổ của nó còn trên màn (2,4 s), phần sáng sau thẻ chữ chỉ còn 0,12, như phím M. Đo bằng `scripts/visual/tag-contrast.py` với nền thẻ 0,6 của lab, thấp nhất:
  - mưa thiên thạch: quả đầu 8,27:1, quả thứ 10 9,52:1, quả cuối 10,13:1;
  - lưỡi liềm: khi xuyên 8,01:1, nổ cuối đường 7,64:1;
  - không thẻ nào dưới 7:1. Trước khi chỉnh, lưỡi liềm có 1 thẻ dưới 7:1 (5,84:1).
- **Sửa lỗi sau khi gộp readability:** mặt nạ thẻ đổi tên `main` của shader và thêm một `main` mới ở cuối, nên hai bản vá shader khai báo `uPivot` trước `main` bị lỗi biên dịch (đầu lõi sáng của sao băng tạm và đĩa đầu sao chổi). Nay khai báo ở đầu shader.
- **Kiểm:**
  - Hỏa và Thủy trên lab 3068: 21 quả, 160 đòn, 0 lỗi.
  - Khung chạm của vụ nổ đầu: đo ánh nổ riêng (bấm khô, không đòn, như vòng 1), bằng 97 % đỉnh của chính nó trong 0,2 s đầu (đỉnh trong 0,13 s đầu là chính khung chạm). Khi có đòn, số và lóe viền quái hiện ở khung sau, cộng thêm khoảng 30 %; phần đó thuộc đường đánh chung của lab, không phải vụ nổ.
  - Test: 106 tệp, 1097 test qua (thêm `tests/lab/meteor-plan.test.ts`, viết lại test sao băng cho mưa, thêm test lưỡi liềm nổ cuối đường); `tsc --noEmit` sạch.
- **Video cho anh:** `owner-review/2026-11-06/tu-tien/five-phase-samples/fire-meteor-five-phase-v2.mp4` (18,4 MB) và `fire-crescent-five-phase-v2.mp4` (10,3 MB), cùng hai tấm trước/sau.
- **Chưa:** âm `tt-sfx-el-fire-comet` chưa về (giữ tiếng sao băng cũ ở quả đầu và quả cuối, giữa là tiếng trúng của lab); hai giám khảo mù.
