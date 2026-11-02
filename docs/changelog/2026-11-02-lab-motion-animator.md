# 02/11/2026: Animator cục bộ cho nhân vật trong lab (MOTION_PLAN bước 2)

Chủ dự án, 02/11: "đảm bảo animation của các chiêu thức phải mượt, và lưu ý về animation của nhân vật cũng vậy, từng cử chỉ, yển chuyển của chân tay, cơ thể, đầu cũng cần phải xử lý thật mượt". Bước 2 làm phần nhân vật. Mọi thứ chỉ nằm trong lab dev `/skills-lab.html`, không vào bản build. Không sửa `src/view/skills/*`, `src/sim`, `src/content`, `src/kit`, golden.

## 1. Sửa lỗi P0: Lam quay lưng với hướng của chính nó

`lam.glb` nhìn về −z. Gốc nhân vật giờ xoay theo `hướng + π` (`animator.ts` `update`). Mốc so sánh được chạy lại với đúng lab bước 1 cộng một dòng sửa này: `tmp/shots/motion/baseline-facing/` (60 Hz, có tờ khung và clip), `baseline-facing-120hz/`, và `baseline-facing-m-*` (bộ đo đã thêm số `strikePct`). Mọi số "trước" dưới đây lấy từ các lượt này, không lấy từ `baseline/` cũ.

## 2. Lỗi gốc tìm thấy khi làm: mixer của three không ghi lại xương

`PropertyMixer.apply` của three 0.170 chỉ ghi xương khi giá trị trộn khác lần trước. Vì vậy track hằng (mọi track `ball_*` của Lam, kiểu STEP) và clip đang dừng (lúc gồng) không được ghi lại. Xương giữ IK, lớp cộng và độ lệch quán tính của khung trước, rồi cộng dồn. Đo được: `ball_l` lệch 171°, nhảy tới 10.280°/s mỗi lần về Idle.

Cách sửa: Animator lấy mẫu thẳng từ track (`ClipSampler`) và ghi mọi xương mỗi khung. `AnimationAction` chỉ còn để bộ đo biết clip nào đang chạy. Riêng sửa này đã hạ số lần chuyển clip vượt ngưỡng từ 14 xuống 4.

## 3. Đã làm (`src/lab/anim/`, `src/lab/caster.ts`)

- **Lỗi nền (2.1)**: không còn `finished`, `crossFadeTo` hay `reset()`. `clampWhenFinished = true`. Đòn trao cho Idle 0,1 s trước khi clip hết, và Idle chạy từ khung 0. Đánh lại cùng chiêu không giật.
- **Chuyển tiếp quán tính từng xương (2.2)**: `inertial.ts`, half-life theo kế hoạch: nhả 0,04 s, gồng 0,06, về Idle 0,09, dash 0,04 / 0,08, trúng đòn 0,03, đi 0,1–0,12.
- **Gồng theo gõ (2.3, §5.6)**:
  - Thời gian clip = tiến độ × (`release` − 54 ms), qua một lò xo thời gian. Phím cuối chạy tiếp clip, thân qua `release` sau 33 ms (≤ 50 ms).
  - Đoạn vung ×1,2, đoạn thu ×0,9. Kế hoạch ghi ×1,3, nhưng ×1,3 cộng quán tính vượt luật 1,5 × đỉnh clip; phụ lục C §2.9 cho phép 1,2–1,5.
  - K1 và K5 giữ dáng thu tới tick cuối của chiêu.
  - VFX vẫn phát từ `FX_HAND_R` sau khi cập nhật thân.
  - Lúc gõ, thân còn cuộn: thân trên xoay 30° ngược phía tay ra đòn, ngả 6°, khom tới 2,5 cm. Lò xo dưới tới hạn nên lúc nhả thân bật qua (lấy đà và theo đà).
- **Lấy mẫu lại 24 → 60 fps (2.4)**: `resample.ts`, quaternion bằng squad, vị trí bằng Catmull-Rom, làm trong bộ nhớ lúc tải.
- **Máy trạng thái (2.5)**:
  - Idle + Fidget mỗi 4–9 s; đi ↔ chạy trộn theo tốc độ, nhịp bước khớp mặt đất; đi ngang, lùi.
  - Bắt đầu và dừng bằng lò xo tốc độ và độ nghiêng thân.
  - Lệch quá 60° thì xoay tại chỗ.
  - Gồng, nhả, thu, dash; Hit là lớp cộng thân trên (vào 0,03 s, ra 0,25 s) kèm đẩy lò xo theo hướng đòn.
- **Clip còn thiếu**: Mesh2Motion (CC0) `Walk`, `Strafe_left`, `Strafe_right`, `Walk_Backwards`, chuyển sang xương Lam lúc tải (`retarget.ts`).
  - Đã xem tờ khung: Walk sạch (đỉnh 332°/s, không lật xương). Strafe hở vòng 3 cm và lật 19° ở mối nối; đã khép vòng.
  - Không dùng `Jog`: trên Lam chân xuyên đất 5,6 cm.
  - Xoay tại chỗ, bắt đầu và dừng không có clip; đều làm bằng thủ tục (chân bước, lò xo).
- **Clip tại chỗ không trượt chân** (`gait.ts`): Run của Lam là kiểu chạy hoạt hình, chân trụ lùi 0,5 m/s lúc chạm, 3 m/s giữa bước, 1,3 m/s lúc nhấc. Đi đều tốc độ thì luôn trượt. Lúc tải, pelvis được dời vài cm theo chu kỳ để chân trụ lùi đều một tốc độ (Run dời tối đa 12 cm, Walk 4 cm). Tốc mặt đất của clip đo lại sau bước này: Run 2,26 m/s, Walk 0,36 m/s ở tốc 1×.
- **Xoay và di chuyển (2.6)**:
  - Yaw dùng lò xo tới hạn, half-life 0,06 s; xoay tại chỗ 0,14 s.
  - Đứng yên thì thân không xoay quá chân trụ lạc hậu nhất 70°; chân bước theo. Quay 90° mất 0,82 s, quay 180° mất 1,05 s.
  - Vị trí có tăng và giảm tốc.
  - Dash: gõ thì khom dần. Lúc đi, Lam lướt cao 10 cm theo đường của kiem.ts (gốc hiện vào đường bằng ease 60 ms). Lúc hạ, khom 0,09 s.
- **Nhìn theo (2.7)**: lò xo 0,09 s; chia head 0,6, neck 0,4, phần vượt sang spine_03 0,2; kẹp 20°. Khi xoay tại chỗ đầu đi trước.
- **Khóa chân (2.8)**: `foot-ik.ts`.
  - IK hai đốt. Trục gập lấy từ đầu gối của clip, chuyển sang hướng mặt khi chân duỗi, nên không lật.
  - Coi là chạm khi chân thấp hơn 4,5 cm. Khi đi còn xét chân có đang vung tới không, vì Walk của Lam chỉ nhấc chân 5 cm.
  - Khóa xoay quanh gót, rồi quanh mũi khi gót nhấc. Chân nhả thì mờ dần trong không trung, bắt đầu từ chính vận tốc của nó.
  - Đứng thì bước đặt lại chân: nhấc 4,8 cm rồi mới đi ngang, chỗ đặt chốt lúc bắt đầu bước.
  - Chân Lam chỉ dài 0,37 m, nên khi đi, khóa lệch quá 18 cm thì nhả.
- **Lò xo phụ (2.9)**: `springs.ts`, viết riêng; không import `@pixiv/three-vrm-springbone` vì `boundary.test` cấm.
  - Đuôi (5 khớp), hai tai, `bag_r`. Bước cố định 60 Hz, tâm là gốc nhân vật.
  - Giới hạn góc lệch và tốc xoay đo trong khung xương đang chạy clip. Trước đây tai giật 2.268°/s lúc trúng đòn; nay không còn.
- **Lớp cộng (2.10)**: thở 0,25 Hz (spine 1°, xương đòn); giật lùi bằng lò xo 5 Hz, ζ 0,6.
- **Bộ đo** (`motion-probe.ts`): thêm `strikePct`, là khoảng cách lớn nhất giữa dáng gồng và dáng đòn trong 0,35 s sau lúc thân nhả. Số cũ `silhouettePct` đo đúng khung nhả, nhưng khung đó chỉ cách phím cuối 1–2 khung nên không thể đạt 15 %. Giữ cả hai số.

## 4. Số đo: trước (mốc đã sửa hướng mặt) và sau, cùng chuỗi, 45 WPM

Tốc của bước 1 (đi 1,4 m/s, chạy 3,4 m/s, đi ngang 1,4 m/s trong 3 m), 60 Hz. Trước: `baseline-facing-m-baseline/`. Sau: `step2/`, có tờ khung, clip và `strips/`, `compare/`.

| Số đo | Trước | Sau | Ngưỡng |
|---|---|---|---|
| Chuyển clip vượt 1,5 × đỉnh clip | 5/20 | 2/26 | 0 |
| Tỉ số lớn nhất lúc chuyển clip | 4,80 | 3,64 | ≤ 1,5 |
| Khung gần tư thế bind / RMS nhỏ nhất | 24 / 0° | 0 / 17,9° | 0 khung |
| Trượt chân trụ p95 | 1,42 m/s | 0,15 m/s | ≤ 0,05 |
| Khung chân trụ trượt > 0,05 m/s | 368/2.081 | 190/2.006 | 0 |
| Xuyên đất lớn nhất | 2,51 % | 1,82 % | ≤ 2 % |
| Xoay gốc lớn nhất / khung giật | 10.800°/s / 6 | 487°/s / 0 | không giật |
| Phím cuối → thân nhả | 17–817 ms, 3/7 vượt | 33 ms, 0/7 vượt | ≤ 50 ms |
| Dáng gồng khác đỉnh đòn (`strikePct`) dưới 15 % | 6/6 | 4/6 | 0 |
| Mối nối vòng lặp | Idle, Run 0 cm | mọi clip đi 0 cm | ≤ 1 cm |
| Trượt chân trụ p95 theo pha: đi và chạy / dừng / xoay 90° / xoay 180° / đi ngang / dash | 3,04 / 1,59 / 0,014 / 0,012 / 1,97 / 10,1 | 0,67 / 0,033 / 0,018 / 0,11 / 1,68 / 0,71 | ≤ 0,05 |

Tốc hợp với chân Lam (đi 0,6, chạy 3,0, đi ngang 0,45 m/s trong 1,5 m; mặc định của `lab-motion.mjs`): trượt chân trụ p95 từ 0,74 xuống 0,11 m/s; số khung vượt từ 478 xuống 226; chuyển clip vượt 1,5 × từ 5/20 xuống 2/26. Các pha: đi và chạy 2,61 → 0,47; dừng 1,57 → 0,085; xoay 90° 0,014 → 0,079; xoay 180° 0,012 → 0,11; đi ngang 0,64 → 0,52; dash 10,1 → 0,71.

Lượt 120 Hz (`step2-120hz/`): chuyển clip vượt 5/26 (trước 8/20), tỉ số lớn nhất 6,92 (trước 9,68), xoay gốc lớn nhất 513°/s (trước 21.600°/s), không khung nào gần bind.

Từng đòn sau khi sửa: thân nhả 33 ms sau phím cuối ở mọi chiêu. `strikePct`: đòn thường 11 %, K1 18 %, K2 18 %, hộ thân 6 %, K4 6 %, K5 12 %. Trước đó lần lượt 13, 13, 13, 8, 8, 10 %; lúc ấy dáng gồng chính là Idle vì thân không động khi gõ.

Số VFX trong `step2/metrics.json` đã gồm phần sửa của bước 3 (làn khác chạy song song). Chỉ dùng số nhân vật ở trên để so bước 2.

## 5. Còn mở

- **Bắt đầu đi và dừng còn vượt 1,5 ×.**
  - Bước đặt chân khi xoay rồi đi làm bắp chân quay 1.200–1.850°/s. Tỉ số so với đỉnh Walk chỉ 332°/s, nên ra 3,6 (tốc bước 1) hoặc 5,6 (tốc hợp chân Lam).
  - Dừng: 2,3 ×.
  - Lúc bắt đầu đi ngang: 1,8 ×.
  - Lượt 120 Hz: đánh liên tiếp 1,54 ×.
  - Cần clip Start, Stop, Turn thật (Quaternius UAL, chờ chủ dự án đồng ý tải) hoặc bước chân dài hơn mà không chậm việc xoay. Đã thử bước dài hơn: hạ tỉ số nhưng xoay 180° tràn sang pha sau.
- **Đi ngang ở 1,4 m/s trượt 1,68 m/s (p95).** Clip Strafe của Mesh2Motion trên Lam chỉ đi 0,33 m/s ở tốc 1×, nên 1,4 m/s là gấp 4,3 lần. Ở 0,45 m/s còn 0,52. Strafe là bước bắt chéo và hông xoay 45°: trên chân ngắn trông được nhưng chưa đẹp.
- **Dáng gồng khác đỉnh đòn dưới 15 % ở 4/6 chiêu.** Skill2 (hộ thân, K4) vung ngắn, nên dáng gồng (clip tới trước `release` 54 ms) gần dáng đòn. Muốn tương phản hơn thì cần lấy đà sâu hơn trong clip, hoặc làm lại đoạn gồng trong Blender (MOTION_PLAN bước 5).
- **Dash vẫn trượt 0,7 m/s (p95)** ở lúc vào và lúc hạ.
- **Run được dời pelvis tới 12 cm trong chu kỳ** để chân trụ đi đều. Trên tờ khung không thấy giật, nhưng giám khảo cần xem clip nửa tốc độ.
- **Xoay tại chỗ chậm hơn:** 90° mất 0,82 s, 180° mất 1,05 s, vì thân chờ chân bước. Trong chuỗi 40 s, xoay 180° vừa đủ 1 s trước khi đi ngang.
- **Chưa có clip Hit từ phía sau.** Trúng đòn dùng Hit cộng một hướng, kèm lò xo đẩy theo hướng đòn.
- Số "trượt mọi chân chạm" hầu như không đổi (1,59 → 1,17 m/s), vì bộ đo tính cả chân đang vung thấp dưới 4 cm của Walk. Số chân trụ mới là số đúng.
- Chưa có hai giám khảo mù chấm. Bước 4 làm việc đó.

## 6. Kiểm tra

- `npx tsc --noEmit` (strict) qua.
- `pnpm test`: 74 tệp, 675 test qua, có `boundary.test`.
- `pnpm build` qua. `grep -r "skills-lab" dist` không ra gì; `SpringChains`, `analyseGait`, `FootLock`, `MotionProbe`, `__labCaster` cũng không có trong `dist`.
- `node src/kit/verify-kit.mjs`: 73 tệp kit khớp manifest.
- Không sửa `src/kit`, `src/sim`, `src/content`, `src/view/skills`, golden.
- Không cài gói mới.
- Đã xem tờ khung và dải cận cảnh ở `step2/sheets`, `step2/strips`, `step2/compare`: không còn khung bind lúc về Idle (so `compare/attack-to-idle-before-after.jpg`), không thấy xương lật.
- Khung thô do tôi chụp đã xóa: `find … -newer <marker> -delete`, 10.056 JPEG (gồm 160 khung kiểm clip Mesh2Motion trên Lam). Giữ tờ khung, clip, số đo.

## 7. Tệp

- Mới: `src/lab/anim/gait.ts`, `src/lab/anim/springs.ts`, cùng các tệp khác trong `src/lab/anim/` (Animator, quán tính, lớp, di chuyển, khóa chân, lấy mẫu lại, chuyển clip, rig, toán).
- Bỏ: `src/lab/anim/spring-bones.ts`, bản chép từ VRM của lượt trước, thay bằng `springs.ts`.
- Sửa: `src/lab/caster.ts`, `src/lab/motion-probe.ts` (`strikePct`), `docs/SYNC_DEBT.md`, `../../docs/games/THIRD_PARTY.md` (dòng Mesh2Motion cho Tu Tiên).
- Clip CC0 chép vào `art-src/lab/anim/` (bị bỏ qua trong Git): `human-base-animations.glb`, `human-addon-animations.glb`.
