# 02/11/2026: VFX chiêu Kiếm mượt, không bật tắt phụt (MOTION_PLAN bước 3)

Chủ dự án, 02/11: animation của các chiêu thức phải mượt. Bước 3 sửa mọi chỗ bật, tắt, giật trong phụ lục B, theo thứ tự dễ thấy. Luật: alpha hay cỡ của một lớp không đổi quá 30 % trong 1 khung, trừ lóe đã khai báo (VFX_STANDARD §3.1 luật 5). Chỉ trong lab dev, không vào bản build.

## Đã làm

`src/view/skills/kiem.ts`:
- Mọi thanh kiếm đi qua `show()` và `settleBlades()`. Kiếm hiện thì lên cỡ bằng smoothstep trong 120 ms: khung đầu khoảng 5 %, mỗi khung đổi tối đa khoảng 21 % ở 60 Hz. Không dùng easeOutBack, vì khung đầu đã khoảng 50 %. Kiếm thôi hiện thì thu cỡ 120 ms từ tư thế cuối. Thẻ sáng của kiếm đi theo cùng mức hiện.
- K5 (Thiên Hà Kiếm Vũ):
  - Kiếm đã cắm giữ nguyên góc: pha của đợt chốt lúc bắt đầu lao, vòng quay chậm dần trong lúc lao (mục 1).
  - Trận đồ xoắn ốc và vành kiếm dùng chung một pha cộng dồn trên CPU. Tốc độ quay đổi bằng lò xo (0,35 → 1,1 rad/s, nửa đời 0,12 s), nên trận đồ không nhảy góc lúc nhả (mục 2).
  - Vòng 24 kiếm sau lưng vẫn quay, quay nhanh dần và thu cỡ trong 0,3 s (mục 3).
  - Lúc lao, hướng mũi kiếm nội suy bằng smoothstep và giữ lệch tiếp tuyến 2 %, nên roll luôn xác định. Vệt sáng rơi mờ dần trong lúc lao (mục 9).
- K2 (Nhất Tuyến):
  - Kiếm rời từ chỗ đang hiện ở tay (đã kéo về sau theo đà gồng của bước 2) và nhập vào đường trong 0,1 s. Trước đó nó nhảy 3,3 m trong 1 khung.
  - Kiếm chạy quá đích 0,5 m, chậm lại, rồi mờ và thu cỡ trong 0,25 s (mục 5).
- Đòn bay (đòn thường, K1):
  - Kiếm giữ hướng bay cuối lúc trúng, bám theo quái bị đẩy, lùi ra 0,2 m rồi thu cỡ (mục 6).
  - Kiếm K1 bay từ tư thế đang hiện, quay vào đường bay bằng slerp. Thanh đầu nghiêng dần về quái ở các phím cuối.
  - Đòn thường dùng lần lượt ba thanh, nên lần bắn nhanh thứ hai không cướp thanh còn đang tan trong vết thương.
- Vầng sáng sau lưng nhân với smoothstep trên 30 % đầu. Ấn bừng sáng lên tới đích trong vài khung. `auraBig` giảm cả khi rảnh (mục 7, mục 25).
- Trận đồ hiện theo tiến độ đã làm mượt (nửa đời 0,06 s), không nhảy theo từng phím. Mỗi chữ mới hiện dần 0,15 s. Bỏ chữ thì trận đồ mờ 0,25 s (mục 7, mục 11).
- Dash:
  - Vị trí nhân vật cập nhật trước khi vẽ các lớp quanh nó (mục 8).
  - Tốc độ tăng và giảm theo cung cosin. Khung đầu đi 8 cm thay vì 1,15 m; đỉnh 37 m/s thay vì 68,9 m/s ở khung đầu.
- Hộ thân, K1, K4:
  - Kiếm scale-in khi hiện.
  - Thanh đỡ đi tới điểm đỡ bằng lò xo tới hạn (nửa đời 35 ms), không nhảy 2 m.
  - Mở 0,15 s, đóng 0,4 s, kể cả khi hết lượt đỡ sớm. Cung đã dùng mờ dần.
  - Cột sáng, vòm và đĩa sáng của K4 lên và xuống theo `hold` (mục 10, 14, 15, 22).
- Sao ở mũi kiếm quay đều theo thời gian, không đổi góc ngẫu nhiên mỗi khung (mục 19). Chớp sáng (flare) sống tối thiểu 0,14 s, nên khung tắt cuối giảm dưới 30 %.
- Mọi tốc độ tính theo giây (lò xo exp, bộ đếm phát), nên 60 Hz và 120 Hz cho cùng hình (mục 17).

`src/view/skills/fxkit.ts`:
- `RibbonPool` lấy mẫu theo thời gian thế giới (1/60 s, nội suy theo đường đi của đầu), nên vệt dài như nhau ở mọi tần số khung và đứng yên trong hit-stop (mục 18).
  - `stop(i, 0,18 s)`: đầu vệt đứng lại, đuôi co vào và vệt mờ dần (mục 4). `kill` chỉ dùng khi reset.
  - Mỗi ribbon có fade-in riêng: mặc định 0,1 s, đòn bay dùng nửa thời gian bay. Vệt K1 0,1 s nếu fade-in 0,1 s thì dồn 31 % ánh sáng vào khung cuối; kiếm hộ thân rơi nhanh nếu fade-in 0,05 s thì dồn 46 %.
- `SpritePool` có `fadeIn` mặc định (smoothstep) cho lớp không phải lóe: đĩa tối, mực, khói, đĩa sáng nền. Lóe vẫn sáng nhất ở khung đầu. Đời sprite tắt theo `(1 − t³)²`, độ dốc bằng 0 ở cuối.
- Trận đồ dùng mép mềm (`revealSoft`, smoothstep) thay cho `step`. Cung hộ thân sáng theo số lẻ. `uPhase` do CPU cộng dồn (`GroundSigil.spin`).

`src/lab/feel.ts` và `src/lab/skills-main.ts`: rung camera bằng lò xo, hit-stop có lối thoát mượt, đèn chớp va chạm tự quản (mục 20, 23). Phần này do lần chạy trước của bước 3 làm, lần này chỉ đọc lại, không sửa thêm.

## Số đo (`tmp/shots/motion/`, kịch bản `lab-motion.mjs`, 45 WPM, `?fixed=1`)

Đếm "fair": một lần tăng được so với mức cao nhất mà lớp đạt trong 0,25 s sau đó. Vì vậy hiện dần từ 0 không bị tính là bật phụt, trừ khi một khung thêm quá 30 % mức đó. Số thô so với đỉnh đang chạy nên tính cả mọi lần hiện dần từ 0; số đó không phải luật.

| Số đo | Trước (`step3-base-fair`, VFX như mốc) | Sau (`step3-final`) |
|---|---|---|
| Lớp không phải lóe bật lên quá 30 %/khung, 60 Hz | 102 | 0 |
| Lớp không phải lóe tắt phụt, 60 Hz | 33 | 0 |
| Kiếm: hiện đủ cỡ / tắt đủ cỡ / đổi cỡ > 30 % | 37 / 27 / 22 | 0 / 0 / 0 |
| Kiếm: khung giật hướng > 30° (số đời) | 306 (304) | 0 (0) |
| Kiếm nhảy > 3 m trong 1 khung | 0 (với tay của bước 2: 1, K2) | 0 |
| Bật tắt, 120 Hz (`step3-base-120hz` → `step3-v2-120hz`) | 98 lên, 15 tắt, 306 khung kiếm giật | 0, 0, 0 |
| Mức Low / Ultra, 60 Hz | chưa đo | 0 / 0 |
| Lóe đã khai báo (được phép) | 85 | 82 |

Trước khi sửa, các lớp bật tắt nhiều nhất là ấn của nhân vật (20), thẻ sáng của kiếm (19), đĩa sáng nền (13), mực bắn (12), trận đồ lục giác (11) và đĩa tối (10).

## Kiểm tra

- `npx tsc --noEmit` qua (strict).
- `pnpm test`: 74 tệp, 675 test qua.
- `pnpm build` qua. `grep -r "skills-lab" dist` không ra gì; `uPhase` và `revealSoft` cũng không có trong `dist`. Chỉ `src/lab` import `src/view/skills`.
- `node src/kit/verify-kit.mjs` khớp 73 tệp. Không sửa `src/kit`, `src/sim`, `src/content` hay golden.
- Đã xem tờ khung: K5 (dải, lao, cắm, tan), vòng kiếm sau lưng, K2 (chạy, quá đích, thu), K1 (bay, trúng), hộ thân (mở, đóng). Tờ nằm trong `tmp/shots/motion/step3-final/sheets-vfx/`. Khung thô do lần này tạo đã xóa.

## Còn mở

- Quái trong lab (`herd.ts`, mục 21) vẫn bị đẩy lùi trong 1 khung, teo tới 45 % rồi biến mất, và hồi sinh bằng dịch chuyển tức thời. Phần này nằm ngoài `kiem.ts` và `fxkit.ts`.
- Ở cận cảnh 6 m, lóe nhả của K2, K5 và hộ thân trắng che kín nhân vật trong 2–4 khung; mốc cũng vậy. Ở camera chơi thì vừa. Cần giám khảo xem theo luật white-out.
- Bộ đo cộng năng lượng cả pool, nên không tách được một sprite bật trong pool đông. Để bù, pool không phải lóe có fade-in mặc định.
- Lab chạy dt biến thiên và tính tốc độ theo giây, đúng phụ lục C §2.7. Vòng lặp lab chưa có bộ tích lũy bước cố định kèm nội suy.

## Rà soát đối kháng (02/11/2026, chiều)

Kịch bản `lab-motion.mjs` chỉ ra mỗi chiêu một lần, nên các đường đè lên nhau chưa từng được đo. Tôi viết thêm `scripts/visual/scenarios/lab-stress.mjs`, gồm:
- hộ thân đỡ 3 đòn rồi đóng sớm, đòn thứ 4 trúng người;
- Phi Kiếm 4 lần cách nhau 0,15 s;
- `__lab.cast` không gõ chữ: K2 hai lần, K5 sau một lần K5 có gõ, dash hai lần, K4 hai lần;
- gõ lại chiêu khi lần trước còn chạy: hộ thân, K4, K5, K2. Lab không có hồi chiêu.

Trên mã của bước 3, phần đầu (chưa có gõ lại) ra 8 lần bật, 5 lần tắt và 10 lỗi kiếm. Phần gõ lại được thêm sau khi đã sửa vòng đầu, và ra thêm 2 lần bật, 12 lần tắt, 163 khung kiếm giật hướng và 85 lần kiếm nhảy.

Đã sửa, tất cả trong `src/view/skills/kiem.ts`:
- **Phi Kiếm bấm nhanh:** lần thứ 4 giành lưỡi của lần 1 khi lưỡi ấy còn đang thu trong vết thương. Lưỡi nhảy 7,9 m, giật 40° rồi tắt phụt. Nay có 6 ô lưỡi, mỗi lần lấy ô trống kế tiếp (`pickAutoSlot`).
- **K2 phóng lại khi lưỡi cũ còn mờ dần:** lưỡi mới lấy tư thế cuối của lưỡi cũ ở đầu xa nên bị kéo ngược 14 m về tay. Nay K2 luân phiên 2 ô lưỡi (`k2Next`), và chỉ chữ đã gõ mới cho lưỡi rời từ tay (`castTyped`).
- **Phóng không gõ chữ đặt lại độ mờ ấn về 0:** ấn đang hiện của K2, dash và K4 tắt phụt. Nay ấn nối tiếp từ độ mờ và mức hiện đang thấy (`invSmooth01`).
- **K5 không gõ:** đĩa tối 7,2 m bật trong 1 khung, và vòng 24 kiếm sau lưng hiện ra theo số đếm cũ. Nay đĩa tối hiện dần cùng ấn, và vòng kiếm theo đúng số đã gõ (0).
- **Ấn của nhân vật:**
  - Lúc phóng không gõ, ấn bật từ 0 lên 35 % trong 1 khung. Nay độ mờ tăng tối đa 1/0,15 s.
  - Phím đầu của chữ mới cắt vòng ấn đã khép về mức hào quang. Nay mức hiện được làm mượt theo cả hai chiều.
- **K4 phóng lại khi trận còn giữ:** 6 lưỡi nhảy 6,7 m, đĩa sáng và vòm tắt phụt. Nay K4 có 2 bộ 6 lưỡi; bộ cũ mờ tại chỗ, ánh sáng của trận cũ tan trong 0,3 s (`updateK4Old`).
- **Gõ lại khi chiêu cũ còn chạy:**
  - Hai bên cùng ghi vào một ấn, nên ấn lõm xuống ở phím đầu, và K5 vẽ hai đĩa tối rồi bỏ một đĩa lúc phóng. Nay chiêu đang chạy giữ ấn cho tới khi chữ mới được phóng (`running`, `sigilFree`). Nếu chiêu cũ kết thúc giữa chừng, ấn của chữ mới hiện dần từ 0.
- **Hộ thân phóng lại:** lưỡi bị đặt lên cao 4 m và góc quỹ đạo về 0 (nhảy 5 m, giật 167°), kết giới về 0. Nay hộ thân làm mới tại chỗ:
  - quỹ đạo và lưỡi giữ nguyên;
  - lưỡi đã đỡ đòn bật lò xo về chỗ của nó;
  - hộ thân đang đóng thì mở lại từ mức đang có.
- **K5 phóng lại:** lưỡi trên dải nhảy 3,5 m và giật 75°. Nay lưỡi cũ mờ tại chỗ rồi mới được dùng lại (`k5Old`); lưỡi mới phóng to dần theo độ hiện. Vòng kiếm sau lưng của chữ mới không còn bật lại đủ cỡ trong 1 khung.
- **Sao ở mũi K2:** sao 2,7 m tắt phụt ở cuối đường. Nay sao mờ dần trong 0,12 s sau đòn trúng.
- **Phòng hờ:**
  - `slerpDir` khi hai hướng ngược nhau: trước đây đi qua vector 0 rồi bật thẳng đứng.
  - Hướng giữ của đòn bay lấy từ chính đòn đó, không lấy của đòn trước mà bản ghi từng bay.
  - Hướng phóng được chuẩn hóa.
  - `reset()` đặt lại ô Phi Kiếm, độ mờ ấn, `chargeAge` và các bộ lưỡi.

| Số đo | Trước | Sau |
|---|---|---|
| `lab-stress` 60 Hz, phần đầu, mã bước 3: bật / tắt (fair) | 8 / 5 | 0 / 0 |
| `lab-stress` 60 Hz, phần đầu, mã bước 3: kiếm đổi cỡ / giật / nhảy | 2 / 1 / 7 | 0 / 0 / 0 |
| `lab-stress` 60 Hz, cả lượt, sau vòng sửa đầu: bật / tắt | 2 / 12 | 0 / 0 |
| `lab-stress` 60 Hz, cả lượt, sau vòng sửa đầu: kiếm đổi cỡ / giật / nhảy | 104 / 163 / 85 | 0 / 0 / 0 |
| `lab-stress` 120 Hz và Low | chưa đo | 0 ở mọi mục |
| `lab-motion` 60 Hz / 120 Hz / Low / Ultra (`review-final*`) | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 (lóe 82 / 73 / 69 / 82, như cũ) |
| Trắng xóa ở camera chơi, khung tối đa | 0,29 % | 0,30 % |
| Trắng xóa ở cận cảnh 6 m, khung tối đa (mốc bước 1: 12,9 %) | 9,5 % | 9,3 % |

Ở cận cảnh, các khung trắng trên 6 % tăng từ 16 lên 18. Hai khung thêm nằm ở lúc nhả K2, nhưng năng lượng VFX ở đó giống hệt trước. Ngay cả các khung trước lúc nhả cũng đã sáng hơn khoảng 10 %. Nguyên nhân là `src/lab/anim/animator.ts`, file một lần chạy khác sửa lúc 17:48, không phải VFX.

Ảnh và số đo nằm ở:
- `tmp/shots/motion/review-final/`: số đo, clip và tờ khung;
- `review-final/sheets-review/`: sao mũi K2 và lúc nhả K5;
- `review-stress-shots/sheets/`: Phi Kiếm, hộ thân, K4 và K5 phóng lại.

Khung thô do tôi tạo đã xóa.

Còn mở:
- Phóng lại K2 hoặc dash theo hướng khác khi chiêu cũ còn chạy: chỉ có một mesh ấn, nên ấn quay ngay sang hướng mới. Năng lượng không đổi nên bộ đo không bắt được.
- Trong game, hồi chiêu dài hơn đời hiệu ứng (K2 8 s, hộ thân 15 s, dash 8 s, K4 12 s), nên các lần phóng lại này chỉ xảy ra trong lab.
