# Lab kỹ năng: kiếm thật trong mọi chiêu (03/11/2026, buổi sáng)

Lý do, lời anh sáng 03/11: "chất lượng chưa được, hình dải kiếm, kiếm to bạn có vẻ đang tự style chứ k sử dụng hình ảnh nên hình kiếm đang rất xấu… rõ ràng chúng ta đã có hình ảnh kiếm r, sao hình bạn dùng trong skill lại như kiểu là tự style ra vậy… còn về kỹ năng thì khá ổn r, hiện tại chỉ là chất lượng hình ảnh skill thôi".

Chẩn đoán: kiếm trong chiêu là hình vẽ bằng code, không phải thanh Clear Wind anh đã duyệt:
- dải kiếm phím 7 và mưa kiếm K5 là các dải màn hình vẽ trong shader (`sword-grammar.ts`: chuôi bạch kim, thân lam hai tông, sống trắng), cộng một dải ruy băng "thân sông" (`river-body.ts`);
- kiếm bay K0–K4 là lưới của model thật nhưng **bỏ UV, bỏ vật liệu**: một lớp thép chung tô dải màu từ chuôi tới mũi, phát sáng theo rail, phủ thêm thẻ sáng kéo dài dọc lưỡi (ống sáng) và dải "sống" trắng lam;
- bản LOD của bầy kiếm (`clear-wind-swarm.glb`) không có UV, vật liệu hay texture, nên mọi thanh là một hình tô phẳng;
- vòng kiếm quanh cổng trời K5 vẽ bằng shader.

Lượt này giữ nguyên vũ đạo, mục tiêu, dòng thời gian, khung va chạm, bố cục cổng trời, cái chết, số sát thương và camera của lượt 3. Không đụng cut-in, `src/lab/anim/**`, `src/lab/caster.ts`, `src/kit/**`. Lab vẫn là trang dev, không vào bản build.

## Đã làm, theo commit

| Bước | Commit | Nội dung |
|---|---|---|
| 1. LOD có texture | `1c930d4` | `scripts/models/blender/swarm_lod.py` viết lại: hàn lưới Tripo (bị tách theo đường may UV), giảm mặt bằng edge collapse **giữ UV và đường may** (Blender nội suy UV của từng góc khi gộp đỉnh), giữ base colour, ORM và normal map, thu về 1024. Clear Wind: **14.728 → 3.200 tam giác**, 1.588 đỉnh sau hàn, 2.067 cạnh đường may UV, tệp 1,37 MB. Đặt trọng số giữ đỉnh đường may làm việc giảm mặt dừng ở ~4.400 tam giác, trong khi bản không trọng số đã đặt texture đúng chỗ, nên tắt. Đã thử nướng normal map từ bản đủ (`--normal bake`, Cycles): ở 30–120 px không khác, nên giữ normal map gốc thu nhỏ. So sánh bản đủ với LOD dựng trong EEVEE dưới ánh sáng lookdev của lab rồi thu về chiều dài kiếm 120 / 60 / 30 px: RMSE 1,5 / 0,9 / 0,6 % (nhìn ngang), 1,3 / 0,9 / 0,6 % (ba phần tư từ trên); lưỡi, vòng ngọc rỗng, mây cuộn, hạt ngọc và đốc đọc như nhau (`tmp/shots/real-swords/lod/sheet-lod-30-60-120.jpg`) |
| 2. Atlas impostor | `cdccdd9` | `scripts/models/blender/bake_sword_impostor.py` (mới): chụp **model đủ thật** trong EEVEE, nền trong suốt, ánh sáng lookdev của lab (mặt trời 1,4, key 0,35, rim 0,3, hemisphere 0,45, HDRI misty_pines 0,45; đèn xoay theo camera để mọi hàng sáng như nhau trên màn hình), bốn góc quanh trục lưỡi: nhìn ngang, 30° và 60° ba phần tư từ trên, nhìn cạnh; ô 512 × 128 px, mũi bên phải. Thêm atlas mặt nạ cùng bố cục: R là trường mép lưỡi (0 ở sống, 1 ở mép), G là phần lưỡi. Ghi `clear-wind-impostor.png`, `-mask.png`, `.json` vào `art-src/lab/models/weapons/` (media, không vào Git) |
| 3. Kiếm thật trong mọi chiêu | `0a9d8b0`, `be5b0ee` | Chi tiết ngay dưới bảng |

**Bước 3, chi tiết:**
- `blades.ts`: ánh xạ GLB của vũ khí sang quy ước lưỡi kiếm **giữ UV và vật liệu PBR của chính nó** (base colour, ORM, normal). LOD dùng đúng phép ánh xạ của bản đủ, nên nằm cùng chỗ, cùng tỉ lệ. `BladeSet`: kiếm chủ vẽ bằng bản đủ, kiếm giữa bằng LOD. Mỗi khung chỉ gom các thanh đang hiện vào đầu bộ instance; trước đây mọi ô ẩn nằm dưới ô hiện cao nhất vẫn tốn đỉnh của một thanh 15 nghìn tam giác, K5 xuống từ 3,17 triệu còn 1,37 triệu tam giác. Thêm cách đặt kiếm theo cả chiều dài (từ đốc tới mũi).
- `sword-material.ts` (mới) vá vật liệu thật, chỉ thêm đúng những gì brief cho phép:
  - một đường mép trắng nóng hẹp dọc hai lưỡi (phần ngoài ~12 % mỗi nửa, tức ≤ 30 % bề rộng lưỡi, HDR, phần duy nhất được bloom); khi lưỡi nhỏ hơn một điểm ảnh, đường mép giữ đúng phần diện tích của nó, để không bloom trùm cả lưỡi thành ống trắng;
  - viền rim mềm theo màu chiêu (≤ 0,9);
  - ánh ngọc tự thân của vòng và hạt ngọc: mặt nạ màu đo trên map Tripo, chỉ lấp phần còn trống dưới ngưỡng bloom;
  - chớp khi trúng đòn;
  - tan vào ánh sáng bằng nhiễu (thay cho mờ alpha, kim loại đục không mờ được);
  - hệ số ánh sáng `SWORD_LIGHT`: khi hiệu ứng màn hình làm tối thế giới, lab nâng nó theo nghịch đảo, nên kiếm vẫn sáng như dưới ánh sáng cảnh bình thường.
  - Không tô màu lên texture, không thẻ sáng phủ lưỡi, không hình thay thế.
- `real-swords.ts` (mới): vẽ atlas impostor thành các tấm quay về camera, đặt dọc trục của từng thanh trên màn hình. Chiều dài lấy từ đốc và mũi đã chiếu; bề ngang lấy theo bề ngang thật ở độ sâu của nó, nên thanh nhìn từ đầu mũi ngắn lại chứ không mảnh đi. Alpha nhân trước; đường mép lấy từ atlas mặt nạ.
- **Kiếm (`kiem.ts`)**, cả thanh tính bằng bội số thanh trên tay 1,02 m:
  - Bản đủ: Phi Kiếm K0 (~2,7×), Ngự Kiếm K1 (ba thanh, ~2,35×), Nhất Tuyến K2 (~2,6–3×), Hộ thân (~2,4×), Lạc Kiếm Trận K4 (hệ số 2,1 → 1,7, ~3×), sáu thanh chủ của mưa K5 (3,06 m, 3×), các thanh chủ cắm đất, và **thiên kiếm** (20 m: thanh khổng lồ rơi từ tâm cổng là bố cục cao trào của lượt 3b, ngoại lệ duy nhất của khoảng 1,5–3×). Thiên kiếm có bộ riêng vẽ trong lượt trong suốt sau cổng trời, vì cổng vẽ đè lên cảnh nên kiếm đục sẽ nằm dưới nó.
  - LOD: 24 thanh vầng sau lưng khi gõ K5, kiếm mưa (2,45 m, 2,4×) và kiếm mưa cắm đất.
  - Impostor: 16 thanh quanh vành cổng trời; bỏ phần vẽ kiếm trong shader cổng, giữ khe tối, vành trắng nóng và vòng gai.
  - Vệt sau kiếm thành **vệt lam mảnh 0,14 m bắt đầu từ đốc** (trước là dải 0,32–0,42 m đặt ở chuôi, trùm lên cán).
  - Bỏ thẻ sáng dọc lưỡi và dải "sống".
  - Tia lóe ở mũi Phi Kiếm dời ra đúng mũi và nhỏ lại.
  - Cột sáng góc trận K4 mảnh lại (0,8 → 0,3 m).
  - Tia quét của K2 hẹp lại (1,5 → 0,5 m, lõi 0,16 m) và mờ dần ở đầu, nơi thanh kiếm chạy.
- **Phím 7 (`van-kiem.ts`)**:
  - 6 kiếm chủ dùng bản đủ (2,8 m khi rời tay, 3,06 m trên sông);
  - kiếm giữa dùng LOD (2,55 m), High có 24 thanh (trước 12);
  - kiếm xa dùng impostor (2,3 m), High có 64 thanh (trước 36);
  - bỏ dải thân sông: **sông giờ chính là các thanh kiếm thật bay trong năm làn bện**, sóng sáng chạy dọc dòng hiện trên đường mép;
  - mỗi thanh có vệt lam mảnh sau đốc; kiếm chủ giữ ruy băng của nó, mảnh lại.
- **Nạn nhân (`victims.ts`)**: thanh kiếm cắm xuyên là bản đủ (3,06 m, 3×), chớp lúc cắm, tan vào ánh sáng lúc hết.
- Đã xóa: `river-body.ts`, lớp `GraphicSwords`; `sword-grammar.ts` chỉ còn bảng màu cho các VFX quanh kiếm.
- Kịch bản chụp mới: `scripts/visual/scenarios/lab-real-swords.mjs`.

## Số đo

Mac mini M4 (ANGLE Metal), High, 1920×1080, DPR ghim 1, camera chơi, đồng hồ cố định; `lab-power-perf.mjs`, 5 lượt, trung vị của p95 (ms). Lúc đo máy có một tiến trình mã hóa video khác chạy, số dao động ±1–2 ms giữa các lượt.

| Cửa sổ | Lượt 3b (trước) | Kiếm thật | Ngân sách |
|---|---:|---:|---:|
| Nghỉ | 8,2 | 8,6 | |
| Phím 7, săn (F30–168) | 9,5 | 9,8 | ≤ 11,5 |
| Phím 7, nhát kết | 8,7 | 9,6 | ≤ 11,5 |
| K5, các đợt và cao trào | 9,5 | 10,0 (cửa sổ 180 khung) | ≤ 11,5 |

- Tam giác mỗi khung: phím 7 săn 1,39 triệu, nhát kết 1,28 triệu, K5 1,37 triệu (lúc nghỉ 1,07 triệu là bầy thú). Trước khi gom thanh hiện, K5 là 3,17 triệu và p95 13,1 ms.
- Draw call: 54 / 53 / 51 (trước 52 / 48 / 48).
- Từ phím tới lúc tung chiêu (`lab-power.mjs` PHASE=latency, có hit-stop đang chạy): VFX 0 ms, thân 33 ms ở mọi chiêu (cổng ≤ 50).
- Kích thước trên màn hình ở camera chơi, đo từ chuôi tới mũi, đơn vị px ở 1080p:
  - phím 7: kiếm chủ trung vị 97–130 (p10 35–100), kiếm giữa ~100 (p10 35–90), kiếm xa 88–98 (p10 35–86);
  - mưa K5: trung vị 43–49, p10 27–41;
  - tất cả ≥ 20 px.
- `tsc`, `pnpm test` (79 tệp, 703 bài) và `pnpm build` đều xanh. Grep bản build không thấy mã lab (`__lab.`, `skills-lab`, `art-src`, `real-swords`, `sword-material`, `KiemFx`, `VanKiem`).

## Ảnh và clip

Không vào Git, nằm trong `tmp/shots/real-swords/`:
- `sheets/<chiêu>-before-after-1080.jpg`: trước (lượt 3b, `cdefb7a`) trên, sau dưới, cùng khung, cùng camera. Các chiêu: k0, k1, k2, guard, k4, k5 và k5c (cận vùng K5), k7 và k7c (cận sông kiếm).
- `sheets/after-720.jpg`: K1, K5, phím 7 ở 1280×720.
- `lod/sheet-lod-30-60-120.jpg`: bản đủ đặt cạnh LOD.
- `impostor/atlas-check.png`: atlas và mặt nạ.
- `real-swords-seq-60fps.mp4`: K1, K2, phím 7, K5 có cut-in, camera chơi, 60 khung/s.

## Chưa làm, còn mở

- **Chưa chấm mù.** Kiếm thật trong chiêu chưa được hai giám khảo mù chấm ở bản build chơi, nên chưa đạt cổng 8,5. Anh xem ảnh và clip trước, rồi duyệt hoặc ghi chú.
- Độ sáng của impostor so với LOD mới chỉnh bằng mắt (`SwordImpostors.gain` = 1); chưa đo bằng số.
- Kiếm mưa K5 rơi thẳng đứng nên ở camera chơi chủ yếu đọc qua chuôi, vòng ngọc và cột sáng lúc chạm đất. Cột sáng lúc chạm đất là của lượt 3b, được giữ lại.
- Thiên kiếm dài 20 m, vượt khoảng 1,5–3× của brief, vì nó là bố cục cao trào lượt 3b. Anh muốn nhỏ lại thì sửa một hằng số `RAIN_COLOSSUS_M`.
- Các vũ khí chưa có GLB vẫn hiện thanh jian thay thế bằng thép trơn. Chỉ Clear Wind có model.
- `media.md5` chưa ghi tệp LOD mới và các atlas. Claude không chạy `pnpm media:push`.

## Kiểm tra lại (03/11/2026, khoảng 10:10)

Một lượt kiểm tra độc lập trên server riêng không HMR (cổng 3061), High, 1920×1080, DPR ghim 1:
- Ở camera chơi, cận cảnh và camera đặt sát từng vùng chiêu, mọi thanh kiếm đều là Clear Wind thật: K0, K1, K2, Hộ thân, K4, vầng kiếm khi gõ K5 (gõ thật ở 45 WPM), vòng kiếm quanh cổng trời, mưa kiếm, kiếm chủ cắm đất, thiên kiếm, phím 7 (kiếm chủ, kiếm giữa, kiếm xa). Không còn ống sáng, thanh tô phẳng hay dải thay cho kiếm. Lướt (phím 4) không có kiếm. Bản Low và Medium cũng vẽ kiếm thật, không lỗi.
- Sửa một lỗi (`sword-material.ts`): hệ số `SWORD_LIGHT` bù phần đèn thế giới bị làm tối, nhưng cũng nhân cả các đèn điểm của cú đánh, mà các đèn này không bao giờ bị làm tối. Trong phím 7 và K5, mỗi cú đánh vì thế chiếu lên kiếm sáng gấp 1,8–3,3 lần so với lên thú bên cạnh. Giờ đèn điểm vào shader ở 1 / hệ số, ra đúng cường độ của nó. Cận cảnh phím 7 F90: phần điểm ảnh HDR trên 1 giảm từ 4,5 % xuống 4,2 %.
- Số đo sau khi sửa (5 lượt, trung vị p95): phím 7 lúc săn 10,2 ms, nhát kết 10,9 ms, K5 (180 khung) 10,2 ms; ngân sách ≤ 11,5. Giá trị max 140–650 ms ở mỗi lượt là công việc GPU còn xếp hàng từ các khung `step()` trước đó, đổ vào lần đọc điểm ảnh đầu tiên của `perf()`, không phải giật thật. Lần tung chiêu đầu tiên trên trang mới mở: khung chậm nhất 46 ms (phím 0), không khung nào quá 50 ms.
- Từ phím tới lúc tung chiêu: VFX 0 ms, thân 33 ms ở mọi chiêu (lướt không có mốc release).
- Không có NaN hay Inf trong bộ đệm sáng của bloom: 2.680 khung lấy mẫu, mọi chiêu, High và Ultra, camera chơi và cận cảnh.
- Còn mở, không sửa:
  - Impostor nhân với `SWORD_LIGHT` dù ảnh nướng không bị làm tối. Khi màn tối lại, kiếm xa và vòng kiếm cổng trời sáng gấp 1/k so với ảnh nướng, trong khi kiếm lưới giữ nguyên. Hệ số gain 1 được chỉnh bằng mắt dưới đúng độ tối đó, nên cần đo trước khi đổi.
  - Ở cận cảnh phím 7, đường mép và lớp thép của kiếm chủ bloom thành vầng trắng; bản Low (không bloom) cho thấy rõ lõi ngọc và hoa văn. Đây là việc chỉnh hướng mỹ thuật cho anh quyết.
  - Vòng ngọc của model Tripo hiện ra màu bạc như crôm, còn ảnh đã duyệt là ngọc trắng viền vàng.
- Video cho anh xem: `tmp/shots/real-swords/owner-2026-11-03-play-60fps.mp4` (camera chơi, phím 0–5, 7, 6) và `owner-2026-11-03-close-60fps.mp4` (cận cảnh phím 1, 7, 6). Sheet so với ảnh đã duyệt: `tmp/shots/real-swords/stills-2026-11-03-sword-vs-art.jpg`.

## Dựng lại media

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P scripts/models/blender/swarm_lod.py -- \
  --input art-src/lab/models/weapons/clear-wind.glb --out art-src/lab/models/weapons/clear-wind-swarm.glb \
  --tris 3200 --sheet tmp/shots/real-swords/lod/final.png --report tmp/shots/real-swords/lod/report.json
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P scripts/models/blender/bake_sword_impostor.py -- \
  --input art-src/lab/models/weapons/clear-wind.glb --out art-src/lab/models/weapons --id clear-wind
```
