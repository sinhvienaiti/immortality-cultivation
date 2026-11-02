# Lab kỹ năng: Clear Wind cầm tay, kiếm tuệ, bầy kiếm LOD, dấu riêng của kiếm (03/11/2026)

Bối cảnh: anh chọn Clear Wind (Thanh Phong) làm kiếm chữ ký và duyệt một model thử Tripo từ nguồn `clearwind-src3q.v4-try1-pad.png` (thiết kế trưng bày `x5-clearwind-heirloom.v1-try1.png`). Model trong lab: `art-src/lab/models/weapons/clear-wind.glb` (Tripo v3.1, 14.728 tam giác, map màu, normal, ORM 4096; đã căn trục trong Blender). Mọi thay đổi chỉ ở phần hình (view) và lab dev-only; không chạm `src/sim`, `src/content`, golden, `src/kit`.

## 1. Kiếm trong tay

- `src/lab/hand-sword.ts` (mới): nhân vật đứng thay (Lam) cầm GLB đầy đủ với map gốc (màu, normal, roughness và metalness từ ORM), không dùng thép chung của kiếm bay. Dài 1,02 m, chuôi giữa nắm tay (`hand_r`), lưỡi theo bàn tay, hơi chúc xuống (`DEFAULT_GRIP`; chỉnh bằng `?grip=nghiêng,xoay,lệch,x,y,z` hoặc `__lab.setGrip`).
- Lõi ngọc nhạt sáng mềm: mặt nạ màu ngọc tính trên map màu (xanh lục nhạt, đo trên map của Tripo), tự phát sáng ≤ 0,86 mỗi kênh (không bloom), thở 3 s khi nghỉ, sáng lên theo tiến độ gõ (`KiemFx.presence`). Một đường lõi HDR mảnh dọc sống kiếm: 3,2 khi đang gõ, 4,6 lúc tung đòn rồi tắt dần (nằm trong khoảng 3–6 của luật bloom).
- Khi chính thanh kiếm bị phóng đi thì tay trống: `KiemFx.handAway` đúng cho Phi Kiếm (WEAPON_DESIGN §5: "Phi Kiếm là chính món") và Nhất Tuyến (từ phím đầu tới lúc lưỡi gập). Kiếm tan thành sáng từ mũi trong 0,1 s (dissolve có viền HDR 3,4, bóng đổ tan theo), quay về thì hiện lại từ đốc trong 0,24 s, có tia lóe và một vòng ngọc nhỏ khép quanh chuôi.
- Phi Kiếm giờ rời đi từ tay (trước đây từ sau vai), cho khớp ý "chính món".

## 2. Kiếm tuệ

- `src/lab/tassel.ts` (mới): dây chàm, một hạt ngọc, nút bạc nhỏ và 14 sợi lụa chàm sang xanh nhạt, dài 0,27 m, treo ở đốc. Chuỗi lò xo cục bộ (Verlet vị trí, 120 Hz cố định, kéo đốc theo đường đi trong khung, cản gió, trọng lực, uốn mềm, mặt đất, trần tốc độ, bước cuối "đi theo đầu" giữ đúng độ dài). Trong hit-stop không có bước nào thì tuệ đi cứng theo đốc (không tích vận tốc). Lụa phất theo tốc độ đốc. Khi kiếm rời tay, tuệ rút vào đốc.
- Kiểm (`__lab.hand()`, chạy đi, quay, 4 Phi Kiếm liên tiếp, K1, K2, Hộ thân, K4, K5, trúng đòn, lướt): độ vươn tối đa của đuôi tuệ = 1,00 lần chiều dài nghỉ ở mọi pha (trước khi thêm bước "đi theo đầu" là 1,9 khi đổi hướng gắt), bước đuôi lớn nhất mỗi khung luôn ≤ bước của đốc + 0,1 m. Không nổ ở hit-stop.

## 3. Bầy kiếm Thiên Hà và thời gian khung

Đo bằng `scripts/visual/scenarios/lab-k5-perf.mjs` (mới) trên Apple M4 (ANGLE Metal), Chrome headless, DPR 1, trung vị 3 lượt, mỗi khung = CPU rồi đọc 1 pixel chờ GPU (cận trên). Chi phí K5 = đỉnh K5 trừ lúc nghỉ, so với ngân sách con "kiếm, VFX" của canon §20.2 nhân hệ số M4 (High 3,5 ms; Low 2 × 2 = 4 ms) và trần p95 khung trên M4 (High 12 ms, Low 16 ms).

| Bậc, độ phân giải | Số kiếm | Hình bầy | Đỉnh p95 (ms) | Chi phí K5 p95 (ms) | Kết luận |
|---|---:|---|---:|---:|---|
| High 1920×1080 | 300 | GLB đầy đủ 14.728 tam giác (trước) | 15,2 | +7,1 | vượt (12 / 3,5) |
| High 1920×1080 | 500 | GLB đầy đủ (trước) | 19,3 | +10,7 | vượt |
| High 1920×1080 | 300 | LOD 1.998 tam giác (sau) | 9,1 | +1,0 | đạt |
| High 1920×1080 | 500 | LOD (sau) | 9,4 | +1,0 | đạt |
| Low 1280×720 | 150 | GLB đầy đủ (trước) | 7,6 | +3,4 | đạt sát (≤ 4) |
| Low 1280×720 | 150 | LOD (sau) | 4,7 | +0,4 | đạt |
| Low 1280×720 | 500 | GLB đầy đủ | 14,2 | +9,1 | vượt ngân sách con |
| Low 1280×720 | 500 | LOD | 5,8 | +1,4 | đạt |

Số thô: `tmp/shots/clearwind/perf/final-high-1080.json`, `final-low-720.json` (và lượt đầu `high-1080.json`, `low-720.json`, khớp ±1 ms).

Cân theo thứ tự của `docs/games/MODEL_QUALITY.md` §3:

1. Instancing: `BladeSet` vẽ mọi ô kiếm, cả ô ẩn (ma trận 0) — với GLB 14.728 tam giác, sân trống High đã p95 19,0 ms (17 triệu tam giác, `?trim=0`, `perf/high-1080-notrim.json`). Nay mỗi mesh chỉ vẽ tới kiếm hiện cao nhất: lúc nghỉ 8,1 ms.
2. LOD: bầy kiếm (K5) là mesh instanced riêng (`BladeSet` tách ở `POOL0`) vẽ bản giản lược `clear-wind-swarm.glb`; kiếm tay, kiếm hero (Ngự Kiếm, Nhất Tuyến, Hộ thân, Lạc Kiếm Trận, vòng kiếm sau lưng) giữ GLB đầy đủ. Không cần bước 3–5.

LOD dựng lúc build bằng `scripts/models/blender/swarm_lod.py` (Blender đã cài, không tải gì mới): hàn đường may UV, decimate collapse còn 1.998 tam giác (giữ sàn 2.000 dù bầy không bao giờ nhìn gần), chỉ vị trí và pháp tuyến, 42 KB. Ảnh so: `tmp/shots/clearwind/lod/cmp-2000.jpg` (lớn, 60 px, 25 px): lưỡi, vòng rỗng và đốc giữ nguyên; lỗ vòng còn mở; LOD còn làm phẳng chỗ gợn trên mặt lưỡi của Tripo. File LOD là media (art-src bị bỏ qua), không vào Git.

Nhận diện ở 25–60 px: mọi kiếm bay xoay mặt phẳng lưỡi về phía camera quanh trục của nó (`faceRoll` trong `settleBlades`, WEAPON_DESIGN §2 luật 4), nên vòng ngọc là chữ O chứ không phải một vạch; dải hộ thủ (tìm tự động, `guardBand`) có ánh ngọc mềm ở viền (≤ 0,73). Ngự Kiếm vẫn đung đưa quanh góc đó.

Bậc trong mã vẫn là 150 / 225 / 300 (Low / Medium / High); canon §20.2 ghi High 500. Với LOD, 500 kiếm ở High đo đạt (9,4 ms); nâng High lên 500 là quyết định của làn kỹ năng, chưa đổi ở đây. `?k5n=` đặt số kiếm khi đo (tối đa `K5_MAX` = 500).

## 4. Dấu riêng của Clear Wind trong các chiêu

Dữ liệu ở `weapons.ts`: `accent2` ngọc nhạt `#C4E2CF` (xanh lục xám, hue ~145°, xa màu gõ `#7FF5E0`), `motif` (vòng ngọc rỗng, mây như ý, vệt lụa; ngọc và bạc ≤ 0,86), `hold` (cầm tay, tuệ), `swarm`. Vũ khí khác không có `motif` nên không đổi gì.

- Ấn và trận đồ (`fxkit.ts`, `uMotif`, `uJade`): bốn vòng ngọc chạy trên vành ấn dưới chân (chữ ký của từng chiêu giữ nguyên ở giữa); Lạc Kiếm Trận có vòng ngọc ở sáu góc và ở tim; Thiên Hà có vòng ngọc quanh tim tối và ba cuộn mây như ý giữa các nhánh; Hộ thân có vòng ngọc ở ba khe; Nhất Tuyến có vòng ngọc ở cuối đường cắt và hai cuộn mây ở đầu; Lưu Quang Bộ có vòng ở chỗ rời đi.
- Chỗ trúng đòn: một vòng ngọc hai mép (bi) mở trên đất và hai cuộn mây bạc-ngọc xoáy ra (Low: chỉ vòng). Nổ vùng (cuối Nhất Tuyến, các đợt Thiên Hà) cũng có vòng lớn.
- Vệt lụa xanh nhạt phất phơ cạnh kiếm bay (Phi Kiếm, Ngự Kiếm, Nhất Tuyến), giống tuệ; sáng ≤ 0,9, không bloom, vệt kiếm quang giữ phần HDR. Kho ribbon 40 → 64.
- Màu từng chiêu của làn impact giữ nguyên (Phi Kiếm thép nhạt, K1 thép trời, K2 xanh băng, Hộ thân ngà, K4 thép hoàng gia, K5 tím ngọc bích); dấu ngọc chỉ là lớp mềm thêm vào.

## Kiểm tra

- `tsc --noEmit`, `pnpm test` (74 file, 675 test), `pnpm build`; `grep -r "skills-lab" dist`, `grep -r "MotionProbe" dist` (và tên file lab mới) không thấy gì; `node src/kit/verify-kit.mjs` OK.
- `lab-stress.mjs`: pop công bằng bật 0, tắt 0; kiếm: on, off, size, snap, jump đều 0 (1.302 lượt kiếm).
- `lab-motion.mjs` với kiếm tay (close-up 4 m): pop công bằng 0, kiếm 0 lỗi; sheet và clip ở `tmp/shots/clearwind/hand-lane/motion/`.
- `lab-skills.mjs WEAPON=clear-wind`, play và close: `tmp/shots/clearwind/hand-lane/skills-final/sheet-*.jpg`; cận cảnh tay: `orbit1/sheet.jpg`, `orbit2/sheet.jpg` (nghỉ, đang gõ, tung đòn).

## Còn mở

- Chưa có chấm mù 8,5: đây là bản thử trong lab cho anh xem, chưa phải phần được nhận.
- Tay và cổ tay của Lam (nhân vật đứng thay) giật mạnh ở chỗ đổi dáng đi gắt: 33–42° mỗi khung khi walk sang run, bàn tay nhảy 1,1 m một khung khi vào strafeR trên một đường đi gấp khúc. Kiếm dài 1 m làm lỗi này lộ rõ hơn; thuộc làn chuyển động (Animator), chưa sửa ở đây. Chuỗi đo `lab-motion.mjs` của làn đó (đường cong mượt) không gặp.
- Mặt lưỡi của model tay vẫn hơi gợn (từ lưới Tripo); bầy kiếm dùng LOD nên không thấy. Nếu anh muốn, có thể làm phẳng pháp tuyến vùng lưỡi trong shader của kiếm tay.
- Kiếm tuệ của 3 kiếm Ngự Kiếm (ngắn lại) và 6 kiếm Lạc Kiếm Trận (giảm mạnh) theo luật 7 của WEAPON_DESIGN chưa làm.

## Rà soát đối kháng (03/11/2026, sau bản trên)

Kiểm lại từng khẳng định của bản trên bằng số đo và sheet; năm lỗi được xác nhận và đã sửa.

### 1. Kiếm cầm tay xuyên người Lam (lỗi chính)

- Đo: `scripts/visual/scenarios/lab-hand-clip.mjs` (mới) gọi `__lab.handHits()` (mới, `src/lab/skills-main.ts`), bắn tia dọc lưỡi, hai mép, ngang hộ thủ và đốc vào lưới skinned của Lam, mỗi khung, qua chuỗi nghỉ, đi, chạy, quay, đi ngang, lùi và đủ 7 chiêu (1.592 khung). Bản trên: kiếm xuyên người ở **805/1.592 khung (50,6 %)**: xuyên túi đeo hông 100 % lúc nghỉ, xuyên đầu khi đi, chạy, quay. Quét 22 kiểu cầm cố định (nghiêng, lệch): không kiểu nào sạch (22–75 %; cầm ngược thì mũi cắm xuống đất).
- Sửa: cổ tay tự tránh thân. `src/lab/body-proxy.ts` (mới) dựng các khối con nhộng quanh từng xương từ chính lưới của Lam (đỉnh có trọng số ≥ 0,3, trục chính, bán kính phân vị 90, tối thiểu 5 cm), bỏ tay cầm và đuôi. `HandSword.keepClear` (`src/lab/hand-sword.ts:443`) mỗi khung xoay kiếm quanh chuôi ít nhất có thể (bình phương tối thiểu trên 7 điểm mẫu: đốc, hộ thủ, 5 điểm lưỡi; mặt đất cũng là ràng buộc), giữ độ lệch từ khung trước rồi nới dần về tay (0,22 s), tối đa 85°, tốc độ đổi tối đa 600°/s (10°/khung) nên không giật; vòng hộ thủ tự xoay phẳng theo thân khi sát người. Không cấp phát mỗi khung. `?clear=0` để so trước/sau.
- Kết quả: **43/1.592 khung (2,7 %)**, tất cả trong chiêu Hộ Thân, lúc nắm tay Lam đặt ngay dưới cằm (vòng hộ thủ hoặc đốc chạm cổ áo, mũ). Mọi pha di chuyển và 6 chiêu còn lại: 0. Tốc độ xoay trục kiếm: p50 1,2°/khung, p95 7,5, tối đa 23,4 (tay gốc: 22,8). Mũi kiếm luôn cao hơn mặt đất ≥ 0,26 m.

### 2. Bầy kiếm Thiên Hà phát ra ánh sáng âm (đốm vàng chanh)

- Thấy trên sheet K5 (đốm vàng ở cả bản trên). Đọc bộ đệm sáng của bloom: kênh xanh lam tới **−36**. Nguyên nhân: màu nhuộm kiếm > 1 làm F0 của kim loại > 1; trên bản sao nhỏ nhiều chi tiết, độ nhám hình học cao, số hạng đa tán xạ của three (F_avg / (1 − E_ms·F_avg)) đổi dấu. Mũ hình nộm phẳng nên trước đây không lộ.
- Sửa (`src/view/skills/kiem.ts:361`, `:394`): ánh sáng dùng F0 ≤ 1, phần sáng thêm của màu nhuộm trả lại thành hệ số nhân trên specular (giữ nguyên dáng chớp). Áp cho mọi kiếm.
- Kết quả: điểm ảnh vàng ở K5 (play, đợt 1): 848 → 0; cận cảnh: 1.028 → 0; không còn giá trị âm.

### 3. Ánh ngọc vượt ngưỡng bloom (khẳng định "≤ 0,86, không bloom" sai trên thực tế)

- Đo bộ đệm sáng của bloom (ngưỡng 1) quanh kiếm cầm tay: ngọc 0,86 thêm 192 điểm ảnh vượt ngưỡng so với chỉ thép (vật liệu sáng + 0,86 > 1).
- Sửa: ánh ngọc chỉ lấp phần còn trống dưới độ sáng 0,95 (`SWORD_CAP`, `src/lab/hand-sword.ts:108`; vòng ngọc trên kiếm bay, `src/view/skills/kiem.ts:397`). Chỉ đường lõi HDR dọc sống kiếm còn bloom (đúng luật).
- Kết quả: ngọc tối đa + thép 414 điểm vượt ngưỡng = đúng bằng chỉ thép (414). Đang gõ (thêm lõi 3,2): 1.399 (trước 1.734).

### 4. Vòng O không đọc được ở 25–60 px

- Cắt ảnh camera chơi 720p và 1080p: hộ thủ của Phi Kiếm bay (khoảng 40–60 px) là một cục trắng, kể cả khi tắt bloom. Màu nhuộm lúc phóng (1,8) làm vòng thép trắng xóa và hai thẻ sáng dọc lưỡi phủ lên lỗ.
- Sửa: vòng hộ thủ giữ màu thép khi nhuộm (`src/view/skills/kiem.ts:354`); với vũ khí có vòng (`ringGuard`), thẻ quầng và thẻ lõi bắt đầu sau hộ thủ (`src/view/skills/kiem.ts:2410`). Vũ khí khác không đổi.
- Kết quả: ở 1080p vòng hiện thành chữ O ngọc nhạt có lõi tối; ở 720p thành một nút vòng ngọc. Bầy 150–500 kiếm không đòi O (WEAPON_DESIGN §1, cấp bản sao).

### 5. Cấp phát mỗi khung trong BladeSet

- `addUpdateRange` của three tạo một object mỗi lần gọi: 4 object mỗi khung. Sửa: dùng lại hai object vùng tải cho mỗi mesh (`src/view/skills/blades.ts:502`, `:507`).

### Sửa thêm: khung xoè của kiếm tuệ

`src/lab/tassel.ts:405` mang khung từ khung trước sang (parallel transport) thay cho vectơ tham chiếu cố định đổi ở |d.y| = 0,9. Trong chuỗi đo, tuệ chưa lần nào lệch quá 26° nên lỗi này chưa lộ (độ vượt bước của sợi ≤ 4 mm trước và sau); đây là lỗi tiềm ẩn.

### Không phải lỗi (đã kiểm)

- Map gốc giữ nguyên: màu, normal, roughness, metalness đều 4096 (`__lab.hand().maps`); 14.728 tam giác; dài 1,02 m.
- Tuệ: độ vươn tối đa 1,00 ở mọi pha; không nổ ở hit-stop.
- Chỉ số chuyển động (`lab-motion.mjs`, close-up 4 m): pop công bằng 0/0, kiếm on/off/size/snap/jump 0 (335 lượt), khung gần bind 0, phím cuối tới lúc thân tung đòn tối đa 33 ms. Giống hệt `tmp/shots/motion/final2`.
- `lab-stress.mjs`: pop 0/0, kiếm 0 lỗi (1.302 lượt).
- Thời gian khung, bầy dùng LOD (Apple M4, p95, trung vị 3 lượt): High 1080p 300 kiếm 9,2 ms (phần K5 +1,2), 500 kiếm 9,5 ms (+1,0); Low 720p 150 kiếm 4,5 ms (~0), 500 kiếm 6,3 ms (+1,7). Đều trong trần (12/3,5 và 16/4).

### Còn mở sau rà soát

- Hộ Thân: nắm tay Lam đặt dưới cằm nên vòng hộ thủ hoặc đốc chạm cổ áo ở 43 khung (đã giới hạn xoay 85° để chuôi không trượt khỏi nắm tay). Cần clip cầm kiếm thật của nhân vật Kiếm tu.
- Khi chạy, lưỡi dựng đứng trước vai; không xuyên mũ nhưng có góc nhìn thấy lưỡi đi ngang mặt.
- Dissolve lúc ném và lúc về có viền HDR 3,4 trên một dải rộng (sáng như chớp tung đòn, 0,1 s và 0,24 s); chưa đổi.
- Mặt lưỡi kiếm cầm tay vẫn gợn nhẹ (lưới Tripo).

## Bộ chụp cho giám khảo mù (03/11/2026, sau rà soát)

Chỉ chụp và đo, không đổi kỹ năng hay kiếm. Hai thay đổi nhỏ cho việc chụp, đều trong lab (dev-only, không vào `dist`):

- `__lab.setOrbit(yaw, pitch, onSword)`: tham số thứ ba `onSword` đặt tâm quỹ đạo vào giữa thanh kiếm (từ mũi tới cuối đốc, lấy từ `HandSword.probeSegments`) thay cho nắm tay (`src/lab/skills-main.ts`).
- Kịch bản mới `scripts/visual/scenarios/lab-judge.mjs`: (a) turntable 8 góc quanh thanh kiếm đang cầm, một khung đứng yên trong ánh lookdev của lab; hai góc phía thân (270°, 315°) lùi xa 3,2 m và nhìn từ trên xuống 48°, vì quỹ đạo gần ở phía đó đi xuyên qua người Lam; (b) Lam đứng nghỉ ở close-up 6 m, 4 thời điểm của nhịp thở, quay ra sân và quay về camera; (c) 7 chiêu Kiếm, mỗi chiêu 12 khung (tụ lực, phóng, bay, trúng, dư âm) ở camera chơi và ở close-up của `lab-skills.mjs`. Sheet chỉ ghi tên pha, không ghi số đo.

Kết quả để trong `tmp/shots/clearwind/final/`: `sheets/` (16 sheet), `clip-1080/` (clip 1920 × 1080: 60 fps và nửa tốc, camera chơi và close-up 6 m; kèm `metrics.json`, `segments/`, `sheets/`), `perf/` (thời gian khung từng bậc lúc K5 đông nhất). Đã xóa ảnh thô.

Thời gian khung lúc K5 đông nhất, bầy LOD (Apple M4, ANGLE Metal; p95, trung vị 5 lượt, mỗi khung là CPU rồi chờ GPU nên là cận trên):

| Bậc | Độ phân giải | Số kiếm | Nghỉ p95 | Đỉnh K5 p95 | Phần K5 p95 | Draw call | Trần (p95 / phần K5) |
|---|---|---:|---:|---:|---:|---:|---|
| Low | 1280 × 720 | 150 | 4,7 ms | 4,2 ms | ~0 | 26 | 16 / 4 |
| Medium | 1600 × 900 | 225 (mã) | 5,9 ms | 7,2 ms | +1,3 | 43 | 12 / 3 |
| Medium | 1600 × 900 | 300 (canon) | 6,0 ms | 7,1 ms | +1,1 | 43 | 12 / 3 |
| High | 1920 × 1080 | 300 (mã) | 8,0 ms | 9,0 ms | +1,0 | 43 | 12 / 3,5 |
| High | 1920 × 1080 | 500 (canon) | 8,5 ms | 9,6 ms | +1,1 | 43 | 12 / 3,5 |
| Ultra (= High) | 1920 × 1080 | 300 | 8,5 ms | 9,0 ms | +0,5 | 43 | 12 / 3,5 |
| Ultra (= High) | 1920 × 1080 | 500 | 8,5 ms | 9,7 ms | +1,2 | 43 | 12 / 3,5 |

Mọi bậc đều trong trần. Lượt đo đầu (3 lượt) chạy lúc máy đang tải nặng (load ~5–6, Chrome của anh đang mở): High 500 kiếm ra 13,0 ms, Medium 225 ra 10,2 ms; High và Ultra cùng một hàng `TT_TIERS` mà lệch nhau 1,5–3 ms nên đó là nhiễu, đã đo lại 5 lượt. Khung chậm nhất (40–120 ms) luôn là khung đầu của cửa sổ đo: nó chờ phần GPU còn xếp hàng từ các bước chạy trước, không phải giật trong chiêu (200 khung sau lúc tung K5 không có khung nào quá 20 ms; `perf/spikes-high.json`).
