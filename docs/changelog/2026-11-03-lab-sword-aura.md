# Lab kỹ năng: hào quang kiếm bay, Wind-Silk Mantle + sao mũi (03/11/2026, tối)

Lý do: lời anh chiều 03/11 ("vì sao các thanh kiếm đều chưa được xử lý để có hiệu ứng xung quanh thanh kiếm vậy… nhìn các thanh kiếm bay kiểu hơi thô"), rồi lựa chọn của anh tối 03/11: **"A + sao mũi của C"**, tức hướng A (Wind-Silk Mantle) cộng đúng một lớp của C là `TipStar`. Q3 anh trả lời **"Có, đổi"**: lưỡi Fire thành thép tối nóng mép, lửa liếm **quanh** lưỡi. Thiết kế: `docs/games/tu-tien/skills/SWORD_AURA.md` (repo cha), §3.A, hàng `TipStar`, §4, §5, §6, khối "Quyết định của anh" đầu §7.

Lượt này chỉ dựng trong lab (`/skills-lab.html`, trang dev, không vào bản build). Hào quang mặc định **tắt** (`?aura=off`): mọi thứ giữ đúng như trước. Bật bằng `?aura=a`, ô "Aura" trong bảng, hoặc phím `A`. Không đụng `src/kit/**`, `src/lab/cutin.ts`, game khác; không đổi vòng ngọc (Q4 còn mở).

**Texture vệt khí chưa được anh duyệt.** Bản dựng dùng mẫu 3 (Plate Feathers), mẫu mà lượt chuẩn bị đề xuất, sau cờ `?streak=1..4`. Anh chọn mẫu khác thì chỉ đổi số mặc định (`src/lab/skills-main.ts`, `AURA_STREAK`); không cần dựng lại gì. Tấm so 4 mẫu: `tmp/shots/sword-aura/streak/streak-candidates.jpg`.

## Đã làm, theo commit

| Bước (§5.3) | Commit | Nội dung |
|---|---|---|
| 1. Hợp đồng | `8275ba1` | `SwordAuraLook` (chỉ chất: mode, các vai màu, `deep`, `coreHdr`, mực premultiplied, độ cứng mép, dòng chảy, độ vỡ, tầm với, chập chờn, bản giảm chuyển động), `ElementKit.swordAura`, `BladeLook.heatFrom`, `TravelArgs.aura`, `StreamTravelArgs.aura`; `METAL_AURA`, `FIRE_AURA`; `AuraAnchors` đo từ GLB lúc nạp (96 nửa bề ngang lưỡi của `edgeField`, dải chắn, vòng ngọc, đốc); `SWORD_AURA_LOOK` và `applySwordAuraLook` (kẹp thân ≤ 0,85, giữ sắc) |
| Q3. Lưỡi Fire | `dfc1aa9` | `SWORD_LOOK.heatFrom` thành uniform ở cả shader lưỡi lẫn impostor; giá trị cũ 0,05 giữ đúng biểu thức hằng cũ nên trùng khít từng bit. `FIRE_BLADE` (`heatFrom` 0,55, `char` 0,4) là mặc định của Fire, cả khi bật lẫn tắt hào quang; `FIRE_FURNACE_BLADE` (0,05; 0,12) là lưỡi cũ, sau cờ `?bladeHeat=furnace` |
| 2. Phần chung | `f59a846` | `SwordAura` (một chủ do host tạo, chia cho phím 1 và phím 7): lịch sử từng thanh theo thời gian thế giới (tốc độ, tốc độ quay và phía rẽ trên màn, đồng hồ trúng đòn, pha dòng chảy, hướng sao và nhịp lấp lánh), đếm mật độ (§4.7), chia tầng Fire (≤ 14 thanh liếm lửa, kiếm giữa ≤ 8, ưu tiên thanh đang bổ rồi thanh sáng nhất), công tắc và cường độ từng lớp. Phím 1 và phím 7 đẩy tư thế đã vẽ của từng thanh. Lab: `?aura=off\|a`, ô "Aura", phím `A`, `__lab.aura`, `__lab.auraLayer`, `?motion=reduce` qua `resolveReducedMotion`, chấm hạng từ gõ bằng `gradeOf` |
| 3. Dải | `e250a8f` | `RibbonPool.setModed`: chương trình premultiplied thứ hai, chế độ theo từng dải (`aMode`): `light` tính đúng như chương trình sáng cũ với alpha 0, `silk` là lụa có alpha thật; `setSilk` (màu, bề ngang lụa, giới hạn chiều dài). `SilkTail`: phím 1 một dải lụa thay dải sáng và dải lụa cũ, 0,9 thanh; kiếm chủ phím 7 0,6 thanh. Fire giữ dải lửa sẵn có |
| 4. Impostor | `dff1234` | `MantleHalo` của kiếm xa: chương trình thứ hai của `SwordImpostors`, chỉ dùng khi bật hào quang (chương trình cũ giữ nguyên từng byte; bản đầu dùng chung một chương trình làm lệch 43 điểm ảnh tới 4/255 ở một khung khi tắt hào quang, do trình biên dịch sắp xếp lại phép tính). Trọng số theo từng thanh trong `iFx`. Meta `rollWidth`, `ringU`, `ringR` (script nướng ghi; JSON Clear Wind có sẵn được thêm từ atlas mặt nạ, không nướng lại) |
| 5–6. Hướng A, Metal và Fire | `cf6d669` | `aura-mantle.ts` (`WindSilkMantle`): `MantleSheath`, `MantleHull`, `TipStar`, nhịp lóe vòng ngọc theo hạng; Fire chia tầng; `element-fire.ts` bỏ vỏ lửa `sheathAt` khi hào quang bật, giữ tàn lửa, kiếm giữa liếm lửa rơi 8 tàn/giây; `__lab.auraSolo` (bay mẫu một thanh). Metal và Fire vào cùng một commit vì một bộ vẽ và một shader thẻ vẽ cả hai chất; lưỡi Q3 đã đi trước, riêng |
| Nhìn khung, lượt 1 | `d3c5c4d` | Đường may theo mép răng cưa của từng mảnh (mảnh đọc thành lông vũ), gom thành một chỉ ở một phần ba cuối lưỡi rồi khâu vào mũi kim; áo nhỏ nghiêng về phía sáng; đuôi kiếm giữa có sợi chỉ sáng; lụa sáng hơn; lưỡi lửa cao thấp theo từng đợt gió |
| 7. Công cụ đo | `95b05ac` | `src/lab/aura-gates.ts`: mặt nạ kiếm theo hình học, đếm chồng lớp, đồng hồ GPU từng lớp; `lab-sword-aura.mjs` `PLAN=dev\|owner\|solo\|gates\|hz\|smooth` |
| Sửa theo cổng | `6922420` | Vỏ ngược (`MantleHull`) vẽ đè lên lưỡi: LOD của Clear Wind cuốn mặt ngược chiều và lệch mặt so với model đủ. Nay quay chiều mặt khi thể tích có dấu âm, đẩy ra sau lưỡi 0,08 m như thẻ, mờ dần sát lưỡi |
| Sửa theo cổng | `c5267d0` | Metal giữ màu trên đá sáng (mảnh là vật chất 0,78, bạc chỉ ở đầu ngọn); Fire tránh vàng dành riêng (dải hổ phách nghiêng về cam, sắc ~32°); lụa nằm sau 0,12 m theo độ sâu; vỏ ngược chỉ còn mảnh; nhịp lóe vòng ngọc thành vòng mảnh |
PLACEHOLDER_LATER_COMMITS

## Hào quang gồm những gì

Mọi lớp: sáng và mực trong cùng một shader, trộn premultiplied; chỉ lõi mảnh được vượt 1 (đường may lúc phóng và lúc trúng ở f0–2, hạt lóe ≤ 1,5 px, lõi sao ≤ 2 px); thân ≤ 0,85; sàn bề ngang tính bằng px CSS × tỉ lệ điểm ảnh; chạy theo thời gian thế giới (dừng đòn thì đứng yên); không cấp phát mỗi khung; biên dịch sẵn lúc nạp.

- **`MantleSheath`** (kiếm chủ phím 7, kiếm phím 1, kiếm giữa): một lệnh vẽ instanced, mỗi thanh một thẻ dựng trên màn hình dọc trục kiếm, hình tính giải tích trong shader:
  - mép lưỡi lấy từ bảng bề ngang đo trên GLB, nên áo bắt đầu đúng **ngoài** mép; không lớp nào vẽ lên mặt lưỡi;
  - khe mực 1 px giữa thép và áo (đề xuất §2.7, anh nhận), ở mọi cỡ;
  - áo rộng 0,55 W mỗi bên. W là hai lần trung vị nửa bề ngang ở giữa lưỡi; bề ngang lớn nhất của bảng là phần loe ở gốc lưỡi Clear Wind (rộng gấp 1,5) và làm áo béo. Sàn 2 px CSS, 3 px lúc phóng và lúc trúng;
  - mảnh: 4 mỗi bên (Low, Medium: 3), so le nửa mảnh, nghiêng về trước ở mép áo thành đầu nhọn chữ V; mỗi mảnh một độ bóng riêng; khe cắt tối giữa các mảnh từ 50–70 px; `?plates=graded`: 3 mảnh lớn dần về mũi, gần cổ áo tan thành sợi;
  - thân mảnh vẽ bằng texture vệt khí, chảy từ mũi về đốc (0,6 + 0,04 v chiều dài lưỡi mỗi giây; 0,15 khi chờ); Medium thêm lớp vệt thứ hai, Ultra lớp thứ ba;
  - đường may: theo mép răng cưa của mảnh, rồi ở một phần ba cuối lưỡi gom thành một chỉ thẳng, hai bên khâu vào **mũi kim** dài 0,12 L quá mũi kiếm (hai rãnh nhập một của Clear Wind);
  - mép áo cuộn mây ở khe cổ áo (từ 70 px), vòng ngọc và chắn mây để trần;
  - **lấp lánh** (luật "Skill effects sparkle too"): hai hạt sáng mỗi bên chạy trên đường may từ cổ áo tới mũi kim trong ~0,35 s, mỗi ~1,6 s, lệch pha theo thanh; đầu mảnh lóe lần lượt (≤ 1 px HDR);
  - kiếm giữa: áo đổ thành **đuôi** sau đốc (0,35 L; 0,6 L khi bổ) có sợi chỉ sáng giữa, thay tia một khung cũ;
  - viền mực ngoài áo.
- **`MantleHull`** (kiếm chủ, High và Ultra): vỏ ngược dựng lúc nạp từ phần lưỡi của LOD (hàn đỉnh, pháp tuyến mượt), phồng 0,015 m + 1,5 px, chỉ vẽ mặt sau. Thẻ và vỏ chia nhau theo góc nhìn (thẻ = 1 − smoothstep(0,6; 0,85; \|hướng · tia nhìn\|)): kiếm chĩa vào camera thì vỏ thay thẻ, không chồng.
- **`SilkTail`**: lụa màu tua, có nếp gấp chạy theo nhịp rung, vệt bóng giữa, mép tối mỏng, bề ngang xoắn, nút hẹp ở đốc, cuối tan thành sợi; nằm sau 0,12 m theo độ sâu. Fire: dải lửa sẵn có.
- **`MantleHalo`** (kiếm xa, trong impostor): áo 2 px, khe mực, viền mực 1 px, mũi kim từ 60 px; Fire: viền than đứt khúc chập chờn 3–4 Hz.
- **`TipStar`** (lấy từ C): sao bốn cánh ở mũi + 0,02 L, gốc mũi kim; cánh dọc hướng bay 0,12 L (hướng mượt theo vận tốc trong ~4 khung), cánh ngang 0,04 L, lõi ≤ 2 px HDR, sao mực 1,3× trong cùng shader. Mức: chờ 0,4; phóng đủ sáng ngay f0; bay 0,6, lấp lánh lên 1 mỗi 1,4–2,2 s; trúng 1,6× cỡ, lõi 3,6 ở f0–2, co lại trong 6 khung; tắt trước lưỡi 4 khung. Kiếm chủ và phím 1 luôn có; kiếm giữa khi trên ngọn sóng sáng (≥ 0,7) hoặc khi bổ; không ở thanh đang dày đặc; Low chỉ kiếm chủ. Fire: "tia mặt trời", cánh là lá lửa quanh lõi trắng vàng.
- **Theo trạng thái** (§3.A): chờ theo ba bậc của mức gõ (0,4 / 0,7 / 1,0, thở ±8 % chu kỳ 2,4 s); phóng (mảnh mở từ cổ áo tới mũi trong 4 khung, bề ngang vọt 1,3× rồi về 1 ở f18, đường may thành lõi ở f0–2); bay đều; rẽ (từ ω 4 tới 10 rad/s: bên ngoài nở 1,6×, bên trong 0,7×, mảnh ngoài trượt cắt 0,5); bổ, trúng (f0–2 co 0,5× với đường may lõi, f3–13 trượt cắt hết cỡ, nở 1,4×, bị nhiễu ăn mòn, rồi xếp lại trong 12 khung nếu kiếm còn bay); tan trước lưỡi. Dày đặc (≥ 3 thanh trong 40 px): áo thu 0,8×.
- **Giảm chuyển động** (`?motion=reduce`): dòng chảy × 0,3, không thở, trượt cắt × 0,3, đỉnh đường may × 0,6, không hạt chạy, không lấp lánh, lửa chập chờn 2 Hz.
- **Fire** (chất lửa): kiếm chủ, kiếm phím 1 và ≤ 8 kiếm giữa có **lưỡi lửa liếm** ra ngoài viền: lưỡi nhọn, bị gió bạt về sau và bốc lên, cao thấp theo đợt, chập chờn 10 Hz, viền bồ hóng, thân son tới cam, dải hổ phách mảnh nghiêng về cam, gốc trắng vàng ≤ 1 px. Các kiếm giữa còn lại mặc **áo than hồng** (lớp bồ hóng, đường may nóng chảy ≤ 1 px, tàn lửa bò). Kiếm xa: viền than. ≤ 14 thanh liếm lửa mỗi khung. Khi bật hào quang, Fire bỏ vỏ lửa `sheathAt` (thay, không chồng, §4.6), giữ tàn lửa.
- **Nhịp lóe vòng ngọc** (§4.9): từ gõ đạt hạng `perfect` hoặc `flash` (chỉ khi gõ chữ, `?typed=1`) cho một vòng sáng mảnh ≤ 0,9 trong 8 khung quanh vòng ngọc của thanh vừa phóng. Không vẽ lên vòng ngọc.
- **Thay, không chồng** (§4.6), khi bật hào quang: phím 1 bỏ tia lóe chạy dọc lưỡi lúc chờ, sao lóe cưỡi mũi lúc bay, dải sáng và dải lụa cũ; giữ hạt rơi. Phím 7: kiếm giữa bỏ tia một khung sau đốc; kiếm xa giữ tia, tô màu lụa (Metal) hoặc than (Fire); kiếm chủ đổi dải sáng thành lụa (Metal).

## Trước và sau

PLACEHOLDER_BEFORE_AFTER

## Số đo (cổng §6)

Cách đo chung: lab, High, 1920 × 1080, DPR 1, đồng hồ cố định, máy M4. `lab-sword-aura.mjs PLAN=gates`: 23 khung (phím 7 F60–F160 mỗi 20 khung, gom và nhát kết F172, F184, F194, F207, phím 1 chờ và phóng ở tầm gần, phím 1 bay ở camera chơi, bay mẫu ở camera chơi và cận cảnh), trên ba nền: đá sáng `#d6d0c2`, nền giữa `#7c848b`, nền tối `#2a2c30`. Mỗi khung chụp hai lần **không cho thời gian trôi**: hào quang hiện và ẩn (`__lab.auraShow`), có bloom và bloom 0, cộng mặt nạ kiếm theo hình học (`__lab.swordMask`: lưỡi từ `bladeFrom` tới mũi, dải chắn có vòng ngọc, chuôi; kiếm chủ và kiếm giữa tách nhau). Phân tích: `tmp/shots/sword-aura/tools/gates.py`, `gatesum.py`; số liệu `tmp/shots/sword-aura/gates/g-*.json`, `sum-*.json`.

Định nghĩa:
- **Giữ lưỡi**: phần điểm ảnh lưỡi mà màu OKLab đổi ≤ 0,04 (không bloom). "Trong" là mặt nạ đã gọt 1 px (bỏ viền khử răng cưa).
- **Điểm ảnh hào quang**: chỗ khác hơn 0,10 giữa khung hiện và khung ẩn (có bloom).
- **Nhạt** (đá sáng): độ bão hòa < 0,2, độ sáng ≥ 0,8, và sáng hơn khung ẩn quá 0,05 độ chói: một lớp phim trắng, không phải đá sáng lộ qua chỗ hào quang mỏng.
- **Tối hơn nền** (đá tối): độ chói thấp hơn khung ẩn quá 0,05.
- **Màu dành riêng**: trong ±6° sắc, ±0,1 độ sáng HSL của `#FFB020`, `#FFC83A`, `#7FF5E0`, bão hòa ≥ 0,3. **Đỏ cảnh báo** như lượt Fire.

### Metal (trung vị / thấp nhất qua các khung; ba nền)

| Cổng (§6) | Ngưỡng | Phím 7 săn | Gom, nhát kết | Phím 1 chờ, phóng | Phím 1 bay | Bay mẫu, camera chơi | Bay mẫu, cận cảnh |
|---|---|---|---|---|---|---|---|
| Giữ lưỡi kiếm chủ | ≥ 90 % | 0,92–0,95 / **0,855** | 0,97 / 0,94 | 0,98 / 0,97 | 0,98 / 0,97 | 0,94 / **0,84** | 0,98 / 0,98 |
| Giữ lưỡi kiếm chủ, trong | | / 0,887 | / 0,954 | / 0,978 | / 1,0 | / **0,80** | / 1,0 |
| Giữ lưỡi kiếm giữa | ≥ 90 % | 0,93–0,96 / **0,891** | 0,92–0,94 / 0,914 | | | | |
| Giữ lưỡi kiếm giữa, trong | | / 0,915 | / 0,930 | | | | |
| Vòng ngọc và chắn, từng khung | ≥ 95 % | / **0,945** | / 0,958 | / 0,997 | / 0,995 | / 1,0 | / 1,0 |
| Hào quang phủ lưỡi, lớn nhất | ≤ 10 % | 10,1 % | 2,7 % | 2,0 % | 1,4 % | **14,9 %** | 1,8 % |
| Nhạt trên đá sáng | ≤ 10 % | 8,7 % / lớn nhất 9,9 % | 10,6 % / **10,8 %** | 7,5 % | 3,9 % | 9,9 % | **20,7 %** (khung trúng đòn F211) |
| Tối hơn nền, đá tối | ≤ 20 % | 1,5 % | 1,3 % | 17,0 % | 0 % | 0,1 % | 2,8 % |
| Màu dành riêng; đỏ cảnh báo | ≤ 3 %; 0 | 0; 0 | 0; 0 | 0; 0 | 0; 0 | 0; 0 | 0; 0 |
| Bloom: phần sáng > 1 thêm vào | ≤ +0,3 % khung | +0,02 % | +0,02 % | 0 | 0 | 0 | +0,03 % |
| Chữ gõ: điểm ảnh gần trắng, 70 % trên | ≤ +0,15 % khung | 0 | 0 | 0 | 0 | 0 | 0 |
| NaN/Inf trong bộ đệm bloom | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ≥ 3 phần hào quang chồng một điểm ảnh | | 0,6 % | 0,1 % | 0,1 % | 1,8 % | 0 | 0 |

### Fire

| Cổng (§6) | Ngưỡng | Phím 7 săn | Gom, nhát kết | Phím 1 chờ, phóng | Phím 1 bay | Bay mẫu, camera chơi | Bay mẫu, cận cảnh |
|---|---|---|---|---|---|---|---|
| Giữ lưỡi kiếm chủ | ≥ 90 % | 0,97 / 0,93 | 0,94 / **0,84** | 0,96 / 0,96 | 0,97 / 0,96 | 0,91–0,95 / **0,80** | 0,98 / 0,98 |
| Giữ lưỡi kiếm giữa | ≥ 90 % | **0,88**–0,90 / **0,815** | 0,92–0,94 / **0,85** | | | | |
| Vòng ngọc và chắn, từng khung | ≥ 95 % | / **0,938** | / **0,905** | / 0,997 | / **0,92** | / 1,0 | / 1,0 |
| Sắc thân lửa (trung vị); bão hòa | 15–30°; ≥ 0,5 | 21,3–22,4°; ≥ 0,73 | 21,6–23,8°; ≥ 0,76 | 21,2–24,7°; ≥ 0,60 | 15,8–22,0°; ≥ 0,52 | 21,7–24,0°; ≥ 0,71 | 21,4–24,1°; ≥ 0,56 |
| Hổ phách | ≤ 15 % | ≤ 0,6 % | ≤ 0,1 % | ≤ 1,8 % | 0 | ≤ 2,0 % | 0 |
| Màu dành riêng; đỏ cảnh báo | ≤ 3 %; 0 | ≤ 0,14 %; 0 | ≤ 0,1 %; 0 | ≤ 0,45 %; 0 | ≤ 0,73 %; 0 | 0; 0 | 0; 0 |
| Nhạt trên đá sáng | ≤ 10 % | 0,06 % | 0,07 % | 4,3 % | 1,2 % | 0,3 % | 0,2 % |
| Tối hơn nền, đá tối | ≤ 20 % | 11,0 % | 10,9 % | 2,9 % | 0,2 % | 2,0 % | 0 |
| Bloom thêm vào; chữ gõ; NaN | | ≤ +0,01 %; 0; 0 | ≤ +0,01 %; 0; 0 | 0; 0; 0 | 0; 0; 0 | 0; 0; 0 | 0; 0; 0 |

Đọc bảng:
- Chỗ không đạt về giữ lưỡi và vòng ngọc ở phím 7 **không do hào quang của chính thanh đó**. Bản đồ điểm ảnh (khung F80, F100, F120) cho thấy chỗ lưỡi đổi màu nằm dưới hào quang, lụa hoặc lửa của **thanh khác** bay ngay trước nó theo độ sâu: dòng sông 94 thanh có nhiều cặp kiếm bay song song, chồng lên nhau. Hào quang của chính thanh không vẽ lên mặt lưỡi (thẻ và vỏ nằm sau lưỡi 0,08 m, áo bắt đầu ngoài mép).
- Bay mẫu ở camera chơi, F40: thanh chờ sau vai chỉ ~35 px, lưỡi rộng ~3 px, gần như toàn bộ là viền khử răng cưa; khe mực và áo nằm ngay sát nên viền đổi màu. Đây là giới hạn của phép đo ở cỡ này.
- Nhạt trên đá sáng ở Metal sát ngưỡng (đường may và ngọn mảnh màu bạc nhạt là thiết kế). Khung trúng đòn F211 ở cận cảnh: đường may thành lõi HDR ở f0–2, bloom loang lên áo.
- Fire: thân lửa đúng dải cam son, không chạm vàng dành riêng, không nhạt; áo than hồng làm nền tối đi ~11 % trên đá tối (trong ngưỡng 20 %).
PLACEHOLDER_GATES_MORE

## Lựa chọn và lý do

- **Thân áo Metal sẫm hơn thiết kế.** §3.A ghi thân bạc lam `[0.30, 0.62, 0.85]`. Trên khung camera chơi, màu đó đọc thành thép nhạt bọc quanh lưỡi thép nhạt: kiếm béo ra, không thành áo khí. Đổi sang lam ngọc `[0.14, 0.45, 0.85]` (sắc ~207°), lòng mảnh lam thẫm `[0.025, 0.09, 0.30]` (vai `deep` mới của `SwordAuraLook`). Vẫn xa màu gõ `#7FF5E0` (169°), không tím, không vàng.
- **W lấy ở giữa lưỡi.** Bảng bề ngang đo được của Clear Wind loe 1,5 lần ở gốc lưỡi ngay sau chắn. Lấy bề ngang lớn nhất làm W thì áo béo hẳn. W = hai lần trung vị nửa bề ngang trong khoảng 25–75 % lưỡi.
- **Đường may theo mép mảnh.** Bản đầu cho đường may chạy thẳng ở mép ngoài cùng của áo: ở 70–130 px nó đọc thành một vỏ có viền, tức đúng rủi ro "viền phát sáng chung chung" (§3.A). Nay đường may đi theo mép răng cưa của từng mảnh, nên mảnh đọc thành lông vũ; chỉ một phần ba cuối lưỡi mới gom thành một chỉ thẳng khâu vào mũi kim.
- **Mảnh là vật chất.** Mảnh vẽ thuần ánh sáng cộng thì trên đá sáng thành dải bạc nhạt (bản đồ điểm ảnh nhạt của cổng). Mỗi mảnh có lớp mực 0,78 dưới nó, nên giữ màu của chính nó trên mọi nền.
- **Dải hổ phách của lửa nghiêng về cam** (sắc ~32°). Hổ phách thuần `#FFB703` (43°) nằm ngay trên vàng dành riêng `#FFB020` và `#FFC83A`: tới 9,8 % điểm ảnh hào quang trên đá sáng rơi vào vùng cấm (cổng ≤ 3 %).
- **Vỏ ngược dựng lúc nạp từ LOD**, không dựng trong Blender (§7 cho phép phương án này "nếu không đạt"). Lý do: thêm một media mới cần quy trình riêng, trong khi LOD có sẵn đã đúng hình; pháp tuyến mượt tính lúc nạp. Nhược điểm tìm ra khi đo: LOD lệch mặt và cuốn ngược chiều so với model đủ, nên vỏ đã vẽ đè lên lưỡi. Sửa ở `6922420`.
- **Kiếm xa dùng chương trình riêng khi bật hào quang.** Bản đầu thêm nhánh hào quang vào chính chương trình impostor: tắt hào quang vẫn lệch 43 điểm ảnh (tới 4/255) ở một khung. Nay chương trình cũ giữ nguyên từng byte, chương trình có quầng chỉ dùng khi bật.
- **Sao mũi lửa vẽ giải tích**, không dùng lá flipbook như §3.C gợi ý: một lá flipbook ở 8–12 px không đọc ra, còn hình lá tính trong shader thì sắc ở mọi cỡ và không tốn lệnh vẽ. Có thể đổi sang lá flipbook khi anh chọn xong kiểu lửa (FIRE_STYLE, hướng "Brushfire" cho thân lửa, "Starfire" cho tia lửa và sao).
- **Lưỡi lửa của áo** theo luật lửa chung (đầu nhọn trên lớp bồ hóng, dải màu theo bậc, lõi trắng ≤ 1 px), cùng tinh thần "Brushfire Calligraphy" anh vừa chọn cho thân lửa (FIRE_STYLE.md). Khi bộ lửa dùng chung của FIRE_STYLE vào, áo lửa nên dùng chung dải màu và nhịp tắt với nó.
- **Metal và Fire chung một commit** (`cf6d669`): một bộ vẽ, một shader thẻ cho cả hai chất. Lưỡi Q3 là commit riêng đi trước, như §5.3 yêu cầu.
- **Đo chi phí từng lớp:** `GpuTimer` cần `EXT_disjoint_timer_query_webgl2`. PLACEHOLDER_GPU

## Điểm để anh quyết

1. **Mẫu texture vệt khí.** Bản dựng dùng mẫu 3 (Plate Feathers). Anh chọn một trong 4 mẫu (`tmp/shots/sword-aura/streak/streak-candidates.jpg`); trong lab thử bằng `?aura=a&streak=1..4`.
2. **Mảnh đều hay mảnh không đều** (đề xuất §2.7 mục 2, dựng thành tùy chọn): `?plates=graded` so với mặc định. Tôi nghiêng về mảnh đều cho Metal (đọc ra lông vũ rõ hơn ở 70–130 px), nhưng chưa có giám khảo chấm.
3. **Lưỡi Fire (Q3):** `heatFrom` 0,55 và `char` 0,4 là điểm xuất phát. Ở camera chơi, lưỡi đọc thành thép xám nóng mép; khi tắt hào quang, dòng sông Fire chỉ còn mép nóng và vệt lửa (lưỡi furnace cũ từng mang lửa cho dòng sông). Anh xem cặp khung tắt hào quang: lưỡi mới và `?bladeHeat=furnace`.
4. **Màu thân áo Metal** đã sẫm hơn thiết kế (xem mục trên). Anh muốn bạc hơn hay giữ lam ngọc?
5. **Sao mũi** hiện nhỏ, đúng kích thước thiết kế (cánh dọc 0,12 L, ~12 px ở kiếm 100 px). Ở camera chơi nó chỉ là một điểm lóe. Nếu anh muốn sao rõ như bản phác C, cần nới cỡ hoặc độ sáng cánh (cánh đang ở trần 0,85).

## Chưa xong

- **Anh chưa xem, giám khảo chưa chấm.** Theo §5.6: anh chọn mẫu texture, rồi một lượt chấm hướng ở lab (hai giám khảo mù, so mốc thương mại); khi cả hai ≥ 7 thì gửi anh video demo; nghiệm thu 8,5 chỉ làm khi chiêu đã vào bản build chơi.
- **Chỉ phím 1 và phím 7.** K0, K2, K4, K5, thiên kiếm và kiếm cắm đất chưa mặc hào quang (§5.6 mục 1).
- **`MantleHull`** dựng từ LOD lúc nạp, chưa có vỏ Blender riêng 200–600 tam giác. Đạt yêu cầu không đè lưỡi sau `6922420`; hình vỏ ở góc nhìn dọc kiếm mới chỉ xem trên khung, chưa chấm.
- **Hạt sáng chạy trên đường may** chỉ có ở `MantleSheath`; vỏ ngược và quầng kiếm xa không có (kiếm xa: đúng thiết kế).
- **Q4 (vòng ngọc)** chưa đụng.
- **Tiếng:** bước mẫu không thêm tiếng riêng (§4.12).
- **`?plates=graded`** dựng xong nhưng chưa đo cổng riêng; số đo trên là mảnh đều.
PLACEHOLDER_TODO_MORE
