# Lab kỹ năng: lớp hệ và Sword × Fire (03/11/2026)

Anh chốt sáng 03/11 (canon D59): người chơi chọn **hệ** riêng với vũ khí, và "khi người chơi kết hợp cả vũ khí và hệ, ví dụ hệ hoả, thì hiệu ứng của vũ khí chủ đạo phải là lửa". Rồi "cứ làm lần lượt theo như plan": Sword × Fire trước, Sword × Water sau, trên cùng hình. Cùng ngày anh nhắc: mọi **tên** (tệp, thư mục, id, mô-đun, định danh trong mã, tên chiêu, phụ đề video) bằng tiếng Anh, tiếng Việt chỉ ở phần văn xuôi.

Thiết kế: `docs/games/tu-tien/skills/ELEMENT_LAYER.md` (repo cha). Luật cứng: **thay, không chồng**. Chọn Fire thì vẽ chính hình đó bằng bộ chất Fire; lớp Metal không vẽ bên dưới.

Tệp này ghi theo phần. Phần 1 là nền mã (bước 0, 1, 3 và phần mã của bước 4 trong brief), phần 2 là Fire trên phím 1 và phím 7, phần 3 là lượt kiểm đối kháng, phần 4 là các sửa sau lượt kiểm, phần 5 là vòng 3 (lửa lưu lâu hơn theo lời anh và các điểm nhìn còn lại).

## Phần 1: nền mã

### Theo commit

| Bước | Commit | Nội dung |
|---|---|---|
| 0. Tên tiếng Anh | `07823ba` | `kiem.ts` thành `sword-skills.ts`, `van-kiem.ts` thành `myriad-swords.ts`. `KiemFx`, `KiemHost`, `KiemSlot`, `KiemTextures`, `KiemPresence`, `KiemOptions` thành `SwordSkillFx`, `SwordSkillHost`, `SwordSlot`, `SwordSkillTextures`, `SwordSkillPresence`, `SwordSkillOptions`. `VanKiem*` thành `MyriadSwords*`, `VAN_KIEM_*` thành `MYRIAD_SWORDS_*`; biến `van` của lab thành `myriad`. Không đổi hành vi |
| 1. Lớp hệ | `38f4f58` | Giao diện `ElementKit`, sổ đăng ký, bộ Metal, sân khấu dùng chung, `FlipbookPlayer`, lớp dấu trên đất, trạng thái trên thú. Chi tiết ngay dưới bảng |
| 3. Chọn hệ trong lab | `b92e217` | `?element=metal\|fire` (mặc định metal), ô **Element** trong bảng điều khiển, phím **E** đổi vòng các hệ đã đăng ký, `__lab.element(id)` (trả id đang dùng; không truyền id thì chỉ trả). Thêm `__lab.clip(folder, id, x, y, z, size)` để xem một clip flipbook trong ánh sáng của lab |
| 4. Tiếng theo hệ (phần mã) | `d5523e1` | `src/lab/sound.ts` tìm `<event>-<element>` trước rồi mới tới `<event>`, khi phát thật và khi ghi lại cho video |

**Bước 1, chi tiết:**
- `src/view/skills/element-kit.ts` (mới): hợp đồng của một bộ chất.
  - Dữ liệu: bảng màu theo từng ô chiêu (`palette`), dải màu (`ramp`: lõi, mép, thân, bồ hóng), ánh sáng của phím 7 (`stream`), vệt sau kiếm (`trail`), kiểu lưỡi kiếm (`blade`: `steel` hay `furnace` và màu đường mép), kết cấu thay theo lớp (`textures`), clip flipbook theo pha (`flipbooks`), dấu trên đất (`ground`), trạng thái trên thú (`foe`), điểm nhấn màn hình (`screen`), hậu tố tiếng (`sound`).
  - Móc theo pha (`attach(stage)` trả `{ sword, stream }`): mỗi móc đứng thay một lớp Metal. Móc trả `true` là đã vẽ lớp đó bằng hệ của nó, lớp Metal bỏ qua. Trả `false` hoặc không có móc thì lớp Metal vẽ, theo bảng màu của hệ. Nhờ vậy một hệ đang dựng có thể chỉ nhận vài ô chiêu.
- `element-metal.ts`: bộ **Metal** giữ nguyên màu đang có, chuyển từ hai tệp kiếm sang đây (bảng màu từng ô của D55 và đợt uy lực, lam và trắng của phím 7, vệt và đường mép). Không có móc: lớp Metal chính là các lớp gốc trong `sword-skills.ts` và `myriad-swords.ts`.
- `element-fire.ts`: **Fire** đã đăng ký nhưng tạm vẽ như Metal (`fallback: "metal"`). Đã có dải màu D54 (trắng vàng `#FFF1C9`, hổ phách `#FFB13C`, cam son `#FF7A2A`, bồ hóng `#2B1D18`; không dùng đỏ cảnh báo `#FF4A4A`) và hậu tố tiếng `fire`.
- `elements.ts`: sổ đăng ký (`elementById`, `elementKits`, `registerElement`, mặc định `metal`).
- `element-stage.ts` (`ElementStage`): sân khấu dùng chung cho `sword-skills.ts` và `myriad-swords.ts`. Bộ chất tạo lớp của riêng nó qua đây (pool sprite, ribbon, beam, clip, dấu trên đất). Sân khấu cập nhật, xóa, cấp số ngẫu nhiên gieo lại khi reset. Lớp rỗng thì ẩn, nên hệ chưa dùng không tốn lệnh vẽ nào.
- `flipbook.ts`: chép từ `games/dragon-hold/src/view/flipbook.ts` @`62f2f8c` (đã ghi `docs/SYNC_DEBT.md`).
  - Giữ: trộn khung theo thời gian, điểm neo, billboard xoay theo hướng bay, hạt mềm với mặt đất, chế độ `fire` (cộng sáng trên nền đen, đất tối theo `occlude`).
  - Thêm chế độ **`rgba`** cho clip có alpha thật: nhân alpha từng khung rồi mới trộn; tắt dần bằng ăn mòn từ chỗ mỏng về màu bồ hóng, không mờ trong suốt (tránh lớp màn cam của `DRAGON_FIRE_DIAGNOSIS`).
  - Manifest đặt theo thư mục từng hệ (`art-src/lab/vfx/<element>/manifest.json`). Đã đọc thử manifest Fire mà phần media vừa cắt: đủ 8 clip, `rgba` và `fire` đúng chế độ.
- `ground-decals.ts` (`GroundDecalPool`): dấu phẳng trên đất theo pool. Mọc ra từ tâm, nằm yên, rồi ăn mòn từ chỗ mỏng; có mép phát sáng nguội dần (than hồng của vết cháy).
- Trạng thái trên thú: `TargetField.status?(i, kind, seconds, rgb)`. Đàn thú của lab hiện nó thành viền sáng theo màu hệ, chập chờn với `burn` và `shocked`, mờ ở 30 % cuối. Metal không để trạng thái nào.
- `sword-material.ts`: `SWORD_LOOK` (màu đường mép, `mode`) dùng chung cho mọi kiếm chiêu và impostor; `applyBladeLook` đặt theo hệ. Nhánh shader `furnace` chưa có, dựng cùng Fire.
- `qi-slash.ts`: `setColours` cho nhát chém kết của phím 7.

### Móc nằm ở đâu

| Pha | `SwordHooks` (`sword-skills.ts`) | `StreamHooks` (`myriad-swords.ts`, phím 7) |
|---|---|---|
| Tụ lực | `chargeKey` (`keyBeat`, kèm các điểm vừa hiện: kiếm sau vai của phím 1, góc trận), `chargeFrame` (`updateAura`; ấn dưới chân vẫn là của hình) | |
| Phát chiêu | `release` (`releaseFlash`; `skill` là `"k7"` khi phím 7 bùng ở người thi triển), `launch` (thanh thứ hai, thứ ba của phím 1 rời vai) | |
| Bay | `travel` (`updateFlights`: tia ở mũi và những gì rơi rớt dọc đường); vệt lấy từ `trail` | `glint` (tia lóe và lấp lánh của dòng sông kiếm); vệt và rim lấy từ `stream` |
| Va chạm | `impact` (`impact`, `basicImpact`), `cut` (`slashAt`), `areaHit` (`strikeLight`), `areaBurst` (`burstAt`) | `strike` (`impactAt`), `leadStrike` (`leadImpact`), `slashSpark`, `cutSeam` (`cutReact`) |
| Dư âm | `aftermath` (đốm sáng trên đất và hạt bay lên) | `finisher` (vết mực và đường nứt sáng của nhát kết) |
| Thú | `death`; trạng thái từ `foe` | trạng thái từ `foe` |
| Mỗi khung, reset | `frame`, `reset` | `frame`, `reset` |

### Đăng ký một bộ chất

1. Viết bộ chất như `element-fire.ts`. Điền dữ liệu (`palette`, `stream`, `trail`, `blade`, `textures`, `flipbooks`, `ground`, `foe`, `screen`, `sound`) và bỏ `fallback`.
2. Thêm `attach(stage)`. Hàm này tạo pool, clip và dấu trên đất một lần lúc nạp:
   - pool sprite: `stage.pool(...)`;
   - clip: `stage.flipbooks.pool(kit.id, clipId, { mode })`;
   - dấu trên đất: `stage.decals(textureName)`.
   Hàm trả `{ sword: {...}, stream: {...} }`; móc nào vẽ lớp của mình thì trả `true`.
3. Bộ mới (không phải Fire) thì thêm vào `KITS` trong `elements.ts`, hoặc gọi `registerElement`. Lab tự hiện nó trong ô **Element**.
4. Tiếng: đặt tệp vào `art-src/lab/audio/<event>-<sound>/` và ghi vào `manifest.json`.

### Chứng minh Metal không đổi

- Kịch bản mới `scripts/visual/scenarios/lab-element-parity.mjs`:
  - nhịp cố định 60 Hz, DPR 1, 1920×1080, camera chơi;
  - 21 khung: phím 1 ở khung 2, 8, 20, 40, 70 sau phím (thêm 2, 8, 40 ở mức zoom gần), phím 7 ở 10, 40, 90, 150, 186, 194, 205, K5 ở 70, 90, 110, 140, 175, 230.
- Nền nhiễu: chụp hai lần cùng bản trước khi sửa thì giống hệt nhau (0 điểm ảnh khác).
- **Trước và sau lớp hệ (Metal): 21/21 khung giống hệt.** 0 điểm ảnh lệch quá 1 %, PAE 0, RMSE 0.
- `?element=fire` (đang vẽ như Metal) so với Metal: 21/21 khung giống hệt. Phép thử đơn vị còn cho thấy một bộ chất có móc nhưng từ chối mọi lớp vẫn vẽ đúng số sprite như Metal, nên việc chèn móc không làm lệch lớp Metal.
- Tấm so sánh: `tmp/shots/element-fire/sheet-before.jpg` và `sheet-after-metal.jpg`.
- Lưu ý khi so: chỉ so hai lần chạy cùng kế hoạch. `ONLY=` đổi các khung sau, vì đồng hồ của người thi triển và đàn thú chạy tiếp từ mục này sang mục kia.

### Thời gian khung, Metal (High, 1920×1080, DPR 1, M4)

- Kịch bản mới `scripts/visual/scenarios/lab-element-perf.mjs` đo phím 1, phím 7 (săn và nhát kết), K5 và lúc nghỉ.
- Máy đang chạy việc khác (tải 2,2–2,9), nên chạy xen kẽ bản bước 0 (cổng 3062) và bản sau (cổng 3061), bốn vòng, mỗi vòng 3–5 lượt.

p95 (ms), trung vị bốn vòng; số lệnh vẽ và tam giác trùng khít:

| Đoạn | Bước 0 | Sau lớp hệ | Lệnh vẽ |
|---|---|---|---|
| Nghỉ | 8,85 | 8,9 | 34 |
| Phím 1 | 9,25 | 9,15 | 48 |
| Phím 7, săn | 10,2 | 10,25 | 54 |
| Phím 7, nhát kết | 10,25 | 10,05 | 51 |
| K5, các đợt mưa | 10,45 | 10,5 | 54 |

- Chênh lệch ≤ 0,2 ms. Cùng một bản mà giữa hai vòng đã lệch tới ~1,5 ms.
- Đo riêng lúc nghỉ, 400 khung, xen kẽ ba lần:
  - bản bước 0: trung bình 9,5 / 8,0 / 8,35 ms;
  - bản sau: 8,3 / 8,1 / 7,7 ms;
  - CPU mỗi khung như nhau (~0,7 ms).
- Kết luận: không đổi, trong biên nhiễu.
- Số liệu thô: `tmp/shots/element-fire/perf-*.json`.

### Đã kiểm thêm

- Ô **Element** hiện "Fire (draws as metal until built)". Phím E đổi metal → fire → metal. `__lab.element('lava')` từ chối và giữ hệ đang dùng.
- Tiếng, ghi bằng `__lab.soundRecord()` với manifest thật trong `art-src/lab/audio`:
  - hệ Fire phát `release-k1-fire`, `impact-flesh-fire`, `impact-stone-fire`, `death-fire`, `release-k7-fire`, `flyby-fire`;
  - `callout` chưa có bản lửa nên về `callout`;
  - Metal phát đúng các tệp cũ.
- Clip RGBA mà phần media vừa cắt chạy qua `__lab.clip`:
  - `fire-burst` và `fire-ground` (chế độ `rgba`), `fire-sparks` (chế độ `fire`);
  - nền tối của lab và nền đá sáng `#d6d0c2`, khung 6 và 14;
  - không khung đen, không mép bị tách nền; thân cam vẫn cam trên cả hai nền;
  - bộ đệm bloom không có NaN hay Inf;
  - tấm: `tmp/shots/element-fire/check/clips-sheet.jpg`.
- `pnpm test` 715 bài xanh, gồm 12 bài mới:
  - `tests/view/element-layer.test.ts`: sổ đăng ký, dải màu Fire, manifest, vòng đời clip và dấu đất, móc của phím 1 và phím 7, trạng thái trên thú, `burst` của phím 7 mang `skill: "k7"`;
  - `tests/lab/sound-element.test.ts`.
- `tsc` và `pnpm build` xanh. Lab không vào `dist`: mã băm gói game không đổi, `main-XrAzOVU-.js` như trước.

### Còn lại cho phần dựng Fire

- Shader lưỡi `furnace`: đọc `SWORD_LOOK.mode` trong `sword-material.ts` và `real-swords.ts`.
- Chớp ấm khi trúng đòn mạnh và pass méo dùng chung: `ScreenAccent` đã có trong hợp đồng, phía `screen-fx.ts` chưa có.
- Nhát chém kết của phím 7 mới đổi được màu (`setColours`). Muốn thay hẳn bằng clip thì thêm móc `slash`.
- Những thứ chưa theo hệ:
  - viền lam của nạn nhân chính (`victims.ts`, `herd.ts`);
  - bóng trắng lam một khung của phím 1;
  - lớp của cổng trời K5 (K5 ngoài phạm vi Fire).
- `tileX` trong manifest Fire chưa được shader đọc.

### Tên tiếng Việt còn lại (ngoài phạm vi lần này)

- `src/view/swords.ts` (`VAN_KIEM`): bầy kiếm của game, không phải lab.
- `src/content/data/school-kiem.ts`.
- Trường sim `tichKiemPm`, `kiemTamReadyAt`, `lacKiemPct`, `kiemThungPct`: đổi chúng chạm tới trạng thái sim và hash vàng, nên làm trong lượt đổi tên riêng của game.
- `__lab.van()` giữ tên cho các kịch bản chụp cũ.

## Phần 2: Sword × Fire trên phím 1 và phím 7 (bước 2 của brief)

Hai chiêu giữ nguyên hình (đường bay, số kiếm, nhịp, bóng Clear Wind) và đổi hẳn chất sang lửa ở cả năm pha. Lớp Metal không vẽ bên dưới: mỗi lớp Metal của hai chiêu có một lớp lửa thay vào, hoặc vẫn là lớp gốc nhưng vẽ bằng bảng màu lửa (ấn dưới chân, vệt mảnh của kiếm sông).

### Theo commit

| Commit | Nội dung |
|---|---|
| `6d5b22e` | Hệ thống dùng chung cho chất lửa. Metal không đổi (số đo ở dưới) |
| `b9d9fd8` | Bộ `fire` trong `element-fire.ts`: dữ liệu, `attach(stage)`, móc cho phím 1 và phím 7; bỏ `fallback`. Bài test mới |
| `13b6d88` | Lab: điểm nhấn màn hình, đàn thú và cái chết theo hệ; kịch bản `lab-element-fire.mjs` |
| `b0d63fa` | Chỉnh lại sau lượt chụp đầu: dải lửa của vệt, tàn lửa bớt trắng, tia lửa ngả hổ phách |

### Hệ thống dùng chung (`6d5b22e`)

- `flipbook.ts`, chế độ **`heat`** (theo bản tóm tắt Gemini 12:40):
  - độ sáng của clip trên nền đen là nhiệt độ; dưới ~0,12 bị nhiễu bào mất, 0,12–0,35 là mép bồ hóng `#240715` alpha 0,85 (che nền sáng quanh lửa), 0,35–0,8 là thân son `#D93800` tới hổ phách `#FFB703` alpha 0,95, trên 0,8 là lõi trắng vàng `#FFFDF0` × 2,2, phần duy nhất bloom;
  - mờ dần thì nguội đi qua các dải rồi bị bào, không thành trong suốt;
  - `taper` (nguội từ đầu tới đuôi), `blur` (đọc atlas mềm hơn để các lỗ của dải lửa khép lại);
  - tuỳ chọn `span`: tấm xoay theo hướng có bề dài bằng một đoạn thế giới, co theo góc nhìn như lưỡi kiếm. Lần chụp đầu, tấm không co nên vỏ lửa chìa xa quá mũi kiếm khi kiếm bay chếch vào sâu màn hình.
- `fxkit.ts`, `RibbonPool.setFlame`: vệt vẽ bằng lửa thay vì ánh kiếm. Dải `dragonhold-flame-trail` chạy dọc vệt, đọc như nhiệt, nóng ở giữa và gần đầu, nguội và vỡ thành lưỡi lửa ở đuôi, nhân sẵn alpha. `setFlame(null)` trả về đúng vật liệu cũ.
- `sword-material.ts` và `real-swords.ts`, nhánh **`furnace`**: cùng thanh Clear Wind thật, thân tối như sắt nung (`char` 0,12), dải nhiệt cam từ sống ra lưỡi chập chờn theo thời gian, đường mép trắng vàng nóng chảy, ngọc thành than hồng. Có cho cả impostor của kiếm xa.
- `screen-fx.ts`, `setAccent` và `warm`: chớp ấm khi trúng đòn mạnh (nhân sáng thế giới về hổ phách trong ~0,16 s, không cộng một lớp màu, nên không thành màn sữa) và bảng màu của khung đồ hoạ (Fire: nền bồ hóng đỏ thẫm, giấy hổ phách nhạt, viền cam).
- `element-kit.ts`, `element-stage.ts`: `BladeLook.heat`, `char`; `TrailLook.flame`; `ScreenAccent.frames`; móc `waiting` (kiếm phím 1 chờ sau vai) và `StreamHooks.travel` (từng kiếm phím 7 mỗi khung); `ElementStage.accent` (bộ chất xin chớp ấm, lab trả lời bằng `ScreenFx.warm`) và `ElementStage.clip`.

### Fire vẽ gì (`b9d9fd8`)

| Pha | Phím 1 (Threefold Sword Command) | Phím 7 (Myriad Swords) |
|---|---|---|
| Tụ lực | Khi gõ (`?typed=1`): `fire-charge` tua theo mức gõ, vòng lửa xoắn chặt dần thành một điểm trắng vàng ở tay; mỗi phím hút một vòng tàn lửa vào tay; đá dưới chân tối dần; thanh kiếm hiện sau vai thì bùng lửa ở chỗ đó. Kiếm chờ cháy âm ỉ trong vỏ lửa | Lab luôn phát ngay (không có tụ lực khi gõ); nén nằm ở khúc gom kiếm của chính chiêu |
| Phát chiêu | Ngay khung phím: điểm trắng vàng và vòng áp suất ở tay, hoa sen lửa `fire-burst` (alpha thật) bùng sau lưng người thi triển, tia lửa, tàn lửa | Như phím 1 nhưng lớn hơn, thêm vết cháy dưới chân |
| Bay | Kiếm furnace, vỏ lửa (dải lửa ở chế độ `heat`, co theo lưỡi, đuôi nguội thành bồ hóng), vệt lửa, tàn lửa rơi lại | Kiếm sông là kiếm furnace kèm vệt mảnh theo tông lửa; sáu kiếm đầu có vỏ lửa và vệt lửa |
| Va chạm | Điểm trắng vàng, hoa sen lửa ở chân thú (phủ lên thú: thú bị đốt), tia lửa `fire-sparks` nhuộm hổ phách, tàn lửa `dragonhold-embers` ở chế độ `heat`; nhát cắt là một vầng trăng mảnh nóng chảy | Kiếm sông chỉ để điểm sáng, tia lửa và vài tàn lửa (không thành nồi lửa); kiếm đầu có hoa sen; nhát chém kết `QiSlash` theo màu lửa |
| Dư âm | Vết cháy có mép than hồng nguội dần, lửa thấp `fire-ground` cháy hết bằng ăn mòn rồi thành tàn lửa, 2–3 sợi khói bồ hóng (trộn thường), tàn lửa bay lên một lúc | Kiếm đầu đập đất: hoa sen cao, vết cháy, lửa thấp. Nhát kết để lại sẹo cháy dọc đường cắt: vết cháy, dòng lửa thấp `fire-trail`, năm đám lửa đất, một đường nứt nóng chảy, cháy theo thứ tự đầu nhát chém chạy qua |
| Thú | Trạng thái `burn` (viền cam chập chờn 1,4 s), bóng trúng đòn một khung trắng vàng, mép tan của thú màu đòn lửa; chết: bùng từ trong, ngọn lửa sụp xuống, tàn lửa và tro | Như phím 1 (cái chết của phím 7 trước là mực và linh quang, nay là tàn lửa và tro) |
| Màn hình | Chớp ấm ở thanh thứ ba | Chớp ấm ở kiếm đầu lớn và nhát kết; khung đồ hoạ theo bảng màu lửa |
| Tiếng | `release-k1-fire`, `impact-flesh-fire`, `impact-stone-fire`, `death-fire` | `release-k7-fire`, `flyby-fire`, `world-open-fire`, các tiếng va chạm và chết; `callout` về bản gốc |

Lựa chọn và lý do:
- Tàn lửa Dragonhold dùng chế độ `heat` chứ không cộng sáng: cộng sáng trên nền đá sáng bạc thành vệt trắng (tấm xem trước của phần media). Viền của tàn lửa nguội về đỏ than `#6A1606` thay vì gần đen, vì viền đen quanh sợi mảnh trông như vết mực.
- Kiếm sông của phím 7 không có vỏ lửa riêng: lượt chụp có ~90 tấm lửa trên sân đọc thành "tấm ván cháy" rối mắt. Kiếm furnace đã mang lửa; vệt mảnh theo tông lửa giữ được từng đường bay.
- `fire-trail` (yếu) chỉ dùng làm dòng lửa thấp trên sẹo nhát kết; `fire-ground` (phẳng) chỉ dùng nhỏ.
- Pass méo hơi nóng dùng chung **chưa dựng**: để lần sau. Ngân sách còn dư (Fire chỉ thêm ~0,2 ms ở phím 7, xem dưới), nhưng pass này dùng chung cho Fire, Water, Wind, nên dựng một lần cùng Water.

### Lab (`13b6d88`)

- Hệ có móc `death` thì vẽ cái chết của nó thay cho `death-fx.ts` (phím 1 trong `strike`, phím 7 và nạn nhân chính bị ghim trong lab): thay, không chồng.
- `herd.setElementLook` (bóng trúng đòn, viền nạn nhân chính) và `victims.setTone` (sao chạm, vòng đất, viền kiếm ghim) theo tông của hệ; Metal giữ đúng màu cũ.
- `screen.setAccent` theo `kit.screen`; `ElementStage` nhận `accent` của lab.
- `__lab.debugShow("fx", true)` trả lại đúng trạng thái hiện hay ẩn của từng lớp (trước đây nó bật mọi lớp, kể cả lớp rỗng và ấn đang ẩn).
- `scripts/visual/scenarios/lab-element-fire.mjs`: khung của phím 1 (camera chơi, zoom gần, gõ theo WPM), phím 7 (camera chơi, cận cảnh), `WORLD=1` chụp thêm cùng khung khi ẩn lớp VFX, số điểm ảnh không hữu hạn của bloom, thời gian phím tới VFX của máy dò.

### Số đo các cổng

Metal không đổi:
- Bản HEAD trước phần 2 (`b998dc5`, chạy từ bản sao) so với bản sau, `?element=metal`, 21 khung của `lab-element-parity.mjs`: 19 khung giống hệt từng bit; 2 khung phím 7 (khung 40 và 150) lệch đúng 1 điểm ảnh, 1/255 ở một kênh (làm tròn khi shader của impostor biên dịch lại). Ở fuzz 1 %: 21/21 bằng 0.

Thời gian khung (High, 1920×1080, DPR 1, M4, tải 3,4–4,3), 7 vòng xen kẽ Metal và Fire, 29 lượt mỗi hệ; p95 (ms), trung vị và trung bình các lượt:

| Đoạn | Metal | Fire | Fire − Metal | Lệnh vẽ Metal / Fire |
|---|---|---|---|---|
| Nghỉ | 8,9 / 8,71 | 8,9 / 8,79 | 0,0 / +0,08 | 34 / 34 |
| Phím 1 | 9,4 / 9,12 | 9,3 / 9,2 | −0,1 / +0,08 | 48 / 43 |
| Phím 7, săn | 10,3 / 10,16 | 10,5 / 10,39 | +0,2 / +0,23 | 54 / 55 |
| Phím 7, nhát kết | 10,4 / 10,41 | 10,2 / 10,16 | −0,2 / −0,25 | 51 / 56 |
| K5 | 10,6 / 10,4 | 10,6 / 10,37 | 0,0 / −0,03 | 54 / 53 |

- Cổng ≤ 0,85 ms: đạt ở cả ba đoạn (lớn nhất +0,23 ms, phím 7 săn).
- Trần 11,5 ms: trung vị p95 cao nhất 10,6 ms. Nhưng lượt tệ nhất vượt trần ở **cả hai hệ**: p95 nhát kết 14,0 (Metal) và 14,2 (Fire) ms, và một khung kẹt 330–650 ms trong cửa sổ nghỉ, phím 7 săn, K5 ở mọi lượt của cả hai hệ. Khung kẹt này đã có trong số đo của phần 1 (`perf-ab-*.json`), nên là của lab hoặc cách đo, không do Fire.
- Số liệu thô: `tmp/shots/element-fire/perf-fire-ab-{metal,fire}-{1..7}.json`.

Phím tới lúc thấy phát chiêu:
- Máy dò chuyển động: VFX 0 ms, thân 33 ms ở mọi lần phát của Fire (phím 1 ở camera chơi, zoom gần, gõ theo WPM; phím 7), như Metal.
- Theo điểm ảnh, khung ngay sau phím (16,7 ms) so với khung trước phím, quanh người thi triển: 4 061 điểm ảnh đổi sang màu lửa ở camera chơi (nền sáng 3 945, nền tối 4 781), 52 086 ở zoom gần, 10 334 với phím 7.

Bloom: 0 điểm ảnh NaN hay Inf ở cả 118 khung (nền giữa, sáng `#d6d0c2`, tối `#2a2c30`, cả Metal).

Thân lửa sau tone mapping (Neutral, exposure 0,72), đo trên ảnh chụp: điểm ảnh của hiệu ứng là chỗ khác hơn 0,12 so với cùng khung khi ẩn VFX; "thân" là sắc 10–60°, độ bão hòa ≥ 0,35:

| Nền | Khung | Sắc thân (trung vị) | Bão hòa thân (trung vị) | Thân / hiệu ứng | Màn cam (thân nhạt trên nền sáng) | Bạc màu (cam nhạt, không phải lõi) | Gần đỏ cảnh báo |
|---|---|---|---|---|---|---|---|
| Giữa `#7c848b` | 37 | 20,3–34,0° | 0,48–0,99 | 50–86 % | 0–4,7 % | 0,3–9,9 % | ≤ 1,7 % |
| Sáng `#d6d0c2` | 21 | 27,4–34,1° | 0,62–0,99 | 53–91 % | 0–18,2 % | 1,5–19 % | ≤ 1,3 % |
| Tối `#2a2c30` | 21 | 23,9–32,3° | 0,61–0,99 | 60–89 % | 0–3,9 % | 0,8–4,5 % | ≤ 1,8 % |

- Thân vẫn cam ở mọi nền; lõi trắng vàng chiếm 0–12 % điểm ảnh hiệu ứng.
- Nền tối: không khung đen, không mép tách nền (đã xem các tấm).
- Nền sáng: phần nhạt cao nhất (18 % thân ở khung 10 của phím 1, 13 % ở zoom gần) là vòng áp suất cộng sáng và mép mềm của hoa sen khi đang tắt; thân hoa sen vẫn đặc. "Gần đỏ cảnh báo" là mép son đang nguội, không phải lõi.
- Khung 200 của phím 7 (khung đồ hoạ đảo màu, giấy hổ phách) không tính.

Chữ gõ: trong game, chữ nằm ở thanh DOM ngoài canvas, VFX không phủ được. Đo thay: tỉ lệ điểm ảnh gần trắng (độ sáng > 0,92) ở 70 % trên của khung, cùng khung Fire và Metal. Fire cao hơn Metal ở 7/38 khung, tối đa 0,14 % (điểm sáng ở tay và mũi kiếm); cộng cả 38 khung: Fire 0,064, Metal 0,684 (0,185 nếu bỏ khung đảo màu trắng của Metal). Phần điểm ảnh vượt ngưỡng bloom (`__lab.bright`) cao hơn Metal ở 4/38 khung (tối đa 0,12 % khung, ở mũi kiếm và tay), cộng cả 38 khung: Fire 0,141, Metal 0,223.

Kiểm thử và build: `pnpm test` 720 bài xanh (thêm 5 bài Fire trong `tests/view/element-layer.test.ts`: màu ấm và xa đỏ cảnh báo, phím 1 thay lớp Metal và để `burn`, phím 7 theo lửa, `setFlame`, chế độ `heat`). `tsc` và `pnpm build` xanh; mã băm gói game không đổi (`main-XrAzOVU-.js`); không có mã lửa nào trong `dist`.

Tấm xem (`tmp/shots/element-fire/`): `sheet-metal-vs-fire.jpg` (cùng khung, Metal trái, Fire phải), `sheet-fire-charge.jpg` (tụ lực khi gõ), `sheet-fire-light.jpg`, `sheet-fire-dark.jpg`, `sheet-fire-k7-play.jpg`; số liệu `gates-fire.json`, `fire-*.json`.

### Chưa xong, nợ mở

- Chưa có giám khảo mù hay anh duyệt: mọi phần nhìn thấy ở đây là tạm, chưa qua 8,5.
- Vệt lửa của kiếm đầu phím 7 vẫn hơi phẳng (một dải cam viền tối); vỏ lửa đọc như kim loại nung hơn là lưỡi lửa liếm. Hướng tiếp: clip Firefly riêng cho vỏ lửa, hoặc dải nhiệt có lưỡi lửa rõ hơn.
- Vòng áp suất ở tay cộng sáng nên bạc trên nền sáng (đo ở trên); có thể đổi sang trộn thường.
- Pass méo hơi nóng dùng chung: chưa có (dựng cùng Water).
- Các chiêu khác (Phi Kiếm, K2, Hộ thân, Lưu Quang Bộ, K4, K5) dùng lớp Metal theo bảng màu lửa; vệt của chúng cũng thành lửa vì pool vệt dùng chung. Dựng Fire cho chúng là việc sau.
- Ấn dưới chân người thi triển vẫn là ấn Metal tô màu lửa.

## Phần 3: kiểm tra đối kháng Sword × Fire và video cho anh

Một lượt kiểm độc lập, không tin số của hai phần trên: tự chụp, tự đo, tự đọc mã. Hai lỗi rõ đã sửa, mỗi lỗi một commit; các điểm còn lại là chuyện nhìn, ghi để anh và giám khảo quyết.

### Đã sửa

- `c84a990` `fix(view)`: hoa sen lửa `fire-burst` thắp giữa không trung bị cắt thẳng ở gốc.
  - Chỗ xảy ra: lúc gõ, khi mỗi kiếm của phím 1 hiện sau vai (`chargeKey`), và lúc kiếm thứ hai, thứ ba rời vai (`launch`).
  - Nguyên nhân: không có đất che gốc, nên mép dưới của ô atlas cắt ngang lõi trắng nóng thành một đường ngang thẳng, thấy rõ trên cả nền sáng lẫn nền tối (`tmp/shots/element-fire/adv/evidence/lotus-root-cut-before.jpg`).
  - Sửa: hai chỗ này truyền độ cao của chính nó làm mặt đất mềm (`ground`), nên gốc tan dần thay vì bị cắt (`lotus-root-after-fix.jpg`).
  - Còn lại: gốc tan để lại một quầng trắng mờ ngắn. Hết đường cắt, nhưng chưa phải hình đẹp nhất.
  - Bài test mới trong `tests/view/element-layer.test.ts`: mọi hoa sen trên không phải có `ground` bằng độ cao của nó; bài này hỏng trên mã cũ.
- `a6b238d` `fix(visual)`: "khung kẹt 330–650 ms" mà phần 1 và phần 2 ghi là chưa rõ nguyên nhân thực ra là lỗi đo, không phải giật thật.
  - `step()` vẽ mà không chờ GPU. Vì vậy khung đầu tiên được bấm giờ sau nó phải gánh cả hàng đợi.
  - Đã kiểm: khung kẹt luôn nằm ở chỉ số 0 của cửa sổ đo (nghỉ 637 ms, phím 7 săn 142 ms). Sau một lần đồng bộ thì cửa sổ nghỉ cao nhất chỉ 10 ms.
  - `lab-element-perf.mjs` giờ bấm giờ khung cuối trước mỗi cửa sổ (`perf(1)`, độ dài dòng thời gian không đổi). Khung lớn nhất còn 10–18 ms, có một lần 36 ms ở K5 của Metal.
  - `lab-k5-perf.mjs` và `lab-power-perf.mjs` có thể dính cùng lỗi, chưa sửa.

### Các cổng, tự đo lại

- **Thay, không chồng.** Đếm số instance của từng lớp vẽ trong suốt phím 1 và phím 7, Metal so với Fire, qua móc `__THREE_DEVTOOLS__` của three; không sửa lab (`evidence/layers-metal-vs-fire.json`).
  - Phím 1, Fire: mọi pool sprite của Metal bằng 0. Còn lại là phần hình: ấn và vòng ấn, kiếm, ribbon (đã thành dải lửa).
  - Phím 7, Fire: các pool của `myriad-swords.ts` (`hits`, `stars`, `glitter`, `marks`, `scar`) bằng 0.
  - Còn vẽ bằng lớp Metal, đổi sang màu lửa: 88 tia vệt mảnh sau kiếm sông (`beams`, `trailCore` lửa), nhát chém kết `QiSlash`, đường cắt trên thú lớn (không có móc `cutSeam`), và cụm cắm kiếm của nạn nhân chính trong `victims.ts` (sao, vòng, vết mực).
  - Đây là đổi màu chứ không phải chồng lớp. Nhưng các phần đó chưa thành vật chất lửa.
- **Metal không đổi.** So `f5ef5bc` (trước lớp hệ, xuất bằng `git archive`, server riêng) với HEAD Metal: 19/21 khung giống hệt từng bit. Hai khung phím 7 (40 và 150) lệch đúng một điểm ảnh, 1/255. Ở fuzz 1 % thì 0. Khớp với phần 2.
  - Lần so đầu tiên lệch ở số sát thương. Nguyên nhân: server của bản xuất không phục vụ được phông `@fontsource` qua `node_modules` dạng symlink. Đây là lỗi dựng của riêng tôi, không phải hồi quy. Thêm `server.fs.allow` thì hết.
- **Thời gian khung**: High 1920×1080, DPR 1, M4, máy tải 3,5–6,3; 15 lượt mỗi hệ từ hai đợt A/B xen kẽ. Số ghi theo dạng trung vị / trung bình của p95, đơn vị ms.

| Đoạn | Metal | Fire | Fire − Metal |
|---|---|---|---|
| Nghỉ | 8,6 / 8,29 | 8,4 / 8,07 | −0,2 / −0,22 |
| Phím 1 | 9,2 / 9,13 | 9,0 / 8,73 | −0,2 / −0,39 |
| Phím 7 săn | 10,2 / 10,02 | 10,5 / 10,27 | +0,3 / +0,25 |
| Phím 7 nhát kết | 10,3 / 10,22 | 10,7 / 10,44 | +0,4 / +0,22 |
| K5 | 10,7 / 10,35 | 10,6 / 10,55 | −0,1 / +0,21 |

  - Cổng ≤ 0,85 ms: đạt theo số gộp.
  - Riêng đợt hai, nhát kết lệch đúng +0,85 theo trung vị và +0,43 theo trung bình. Nhát kết là chỗ sát cổng nhất: Fire vẽ thêm 5 lệnh (51 thành 56).
  - Trần 11,5 ms: 1/15 lượt Fire ở nhát kết lên 11,9 ms; Metal cao nhất đúng 11,5 ms.
- **Phím tới lúc phát chiêu**: máy dò cho VFX 0 ms, thân 33 ms ở cả năm lần phát của Fire, trên nền sáng và nền tối. Ngay khung sau phím, hiệu ứng đã có 5 847 điểm ảnh (nền sáng) và 7 086 (nền tối) ở camera chơi.
- **Bloom**: 0 điểm ảnh NaN hay Inf ở 76 khung (sáng `#d6d0c2`, tối `#2a2c30`).
- **Thân lửa sau tone mapping.** Điểm ảnh hiệu ứng là chỗ khác hơn 0,10 so với cùng khung khi ẩn VFX; "thân" là sắc 8–62° và độ bão hòa ≥ 0,45.
  - Sắc trung vị 20,8–34,5°, độ bão hòa trung vị 0,58–0,99, trên cả hai nền.
  - Thân đặc: không thấy màn cam trên thân.
  - Gần đỏ cảnh báo ≤ 0,6 % điểm ảnh hiệu ứng.
- **Màn cam trên nền sáng: tôi đo nặng hơn phần 2.**
  - Phần nhạt (sắc cam, độ bão hòa 0,10–0,45, sáng) chiếm tới 39 % điểm ảnh hiệu ứng khi phát chiêu, và 44–50 % suốt lúc gõ của phím 1 (67 % trên đá sáng).
  - Bản đồ điểm ảnh (`evidence/peach-map-*.jpg`) cho thấy gần hết phần đó là ấn và vòng ấn của phím 1: lớp hình của Metal, tô bằng bảng màu lửa, vẽ cộng sáng, nên trên đá sáng thành nét hồng cam nhạt. Phần còn lại là vòng áp suất cộng sáng lúc phát chiêu.
  - Thân lửa vẫn đặc. Phần 2 không thấy điều này vì chỉ tính "thân" từ độ bão hòa 0,35.
  - Nền tối: ≤ 13 % (trừ khung giấy đảo màu). Không khung đen, không mép tách nền.
- **Tiếng.** Bản ghi `takes` của video: nửa Metal phát `release-k1`, `impact-*`, `death`, `flyby`, `release-k7`, `world-*`; nửa Fire phát đúng bản `-fire` của từng sự kiện đó. `cast`, `callout` và `callout-k7` về bản gốc. 0 tệp thiếu.
- **Kiểm thử và build**: `pnpm test` 721 bài xanh (thêm 1 bài), `tsc` và `pnpm build` xanh. Mã băm gói game không đổi (`main-XrAzOVU-.js`); lab không vào `dist`.

### Điểm nhìn, chưa sửa (cho anh và giám khảo)

- Tàn lửa `dragonhold-embers` ở chế độ `heat`, cỡ 1,3–2,6 m, đọc thành một cục gai cam đặc (như con nhím biển). Khi nguội về `#6A1606` trên vết cháy hình sao đen, nó trông như vệt máu, rõ nhất ở dư âm trên đá sáng (`evidence/embers-urchin-light.jpg`, cột 2 của tấm ảnh tĩnh).
  - Brief ghi tàn lửa cộng sáng; phần 2 chọn `heat` để tránh sao trắng.
  - Đề xuất: cỡ nhỏ hơn nhiều, hoặc hạt tàn rời.
- Vết cháy `scorch_01` là hình sao gai đen, trên đá sáng đọc như vết mực.
- Ấn và vòng ấn của phím 1 là ấn Metal tô màu lửa: nét hồng cam nhạt (xem phần đo ở trên). Nên cho bộ hệ quyết màu ấn, hoặc vẽ ấn bằng vết cháy hay nét lửa có viền bồ hóng.
- Khung đồ hoạ đảo màu của Fire dùng giấy `paper [1.0, 0.84, 0.58]`. Cả màn hình thành màu da cam nhạt trong 2 khung; các tia ở khung tối là tia màu be.
- Dải lửa trên kiếm đầu của phím 7 trông như ống neon trắng kem. Vỏ lửa đọc như kim loại nung (phần 2 cũng ghi).
- Lúc mới gõ, vòng xoắn `fire-charge` mờ dần theo `alpha = vis` (độ trong suốt). Ở hai phím đầu, thân lửa vì thế bị nhìn xuyên.

### Video và ảnh cho anh

- `tmp/shots/element-fire/owner-metal-vs-fire-play.mp4`: 16,33 s (980 khung).
  - Camera chơi; phím 1 gõ ở 45 WPM rồi phím 7, Metal trước, Fire sau.
  - H.264 1920×1080 60 fps, tốc độ thật, có tiếng (AAC; mức trung bình −11,5 dB, đỉnh −0,2 dB).
  - Phụ đề tiếng Anh: "Sword × Metal / Sword × Fire", "Threefold Sword Command (key 1)", "Myriad Swords (key 7)".
- `tmp/shots/element-fire/owner-fire-close.mp4`: 11,67 s (700 khung), cùng định dạng và có tiếng.
  - Fire: phím 1 ở góc nhìn gần của người chơi, phím 1 với camera gần đặt trên chỗ trúng, rồi phím 7 với camera gần đặt trên sân.
- `tmp/shots/element-fire/stills-fire-light-dark.jpg`: va chạm và dư âm của phím 1 và phím 7, hàng trên trên đá sáng, hàng dưới trên đá tối.
- Bằng chứng và số liệu: `tmp/shots/element-fire/adv/` (`evidence/`, `perf*.json`, `fire-*.json`, `shots-par-*.json`). Khung thô của tôi đã xóa.

## Phần 4: sửa các điểm nhìn mà lượt kiểm 03/11 tìm ra

Sáu điểm nhìn của phần 3 (tàn lửa, vết cháy, ấn và vòng, khung đồ hoạ, tụ lực, lớp Metal tô màu ở phím 7) và lỗi đo của hai kịch bản đo thời gian. Mỗi mục một commit. Ngoài phạm vi, không đụng tới: chất của chính thanh kiếm bay (lưỡi furnace, vỏ lửa, vệt và ribbon, 88 tia vệt của phím 7, `real-swords.ts`, `blades.ts`), `src/lab/cutin.ts`, `src/kit/**`. Metal giữ nguyên từng bit (số đo ở dưới).

### Cách chụp và đo

- "Trước" là HEAD `867ba32` xuất bằng `git archive` sang thư mục riêng, server riêng không HMR (cổng 3091); "sau" là repo (cổng 3092). Cùng kịch bản, cùng khung.
- `lab-element-fire.mjs` có thêm `PLAN=fixes` (commit `ce2b8a1`): phím 1 ở camera chơi tới hết dư âm (khung 1–240), phím 1 với camera gần đặt trên chỗ trúng (`close:-0.3,-5.6,10`), phím 1 gõ theo WPM ở zoom gần (khung 10–74, gồm các phím đầu), phím 7 ở camera chơi và cận cảnh (khung 1–360, gồm khung đồ hoạ cục bộ F15, khung tối F197, khung đảo màu F201, nhát kết, đường cắt, cắm kiếm).
- High 1920×1080, DPR 1, đá sáng `#d6d0c2` và đá tối `#2a2c30`, `WORLD=1` (cùng khung khi ẩn lớp VFX).
- Điểm ảnh hiệu ứng: khác hơn 0,10 ở một kênh so với khung ẩn VFX (cách của phần 3, `gate.py`). Các lớp:
  - **nhạt** (pale): sắc 8–62°, độ bão hòa 0,10–0,45, độ sáng ≥ 0,62;
  - **thân**: sắc 8–62°, độ bão hòa ≥ 0,45, độ sáng ≥ 0,3;
  - **giống máu**: sắc < 15° hoặc > 345°, độ sáng < 0,55, thêm độ bão hòa ≥ 0,3 (ở điểm ảnh xám thì sắc không có nghĩa). Đây là định nghĩa của brief cộng một ngưỡng bão hòa; điểm ảnh gần đen có ánh đỏ (độ sáng 0,02–0,05) vẫn bị tính.
- Tỉ lệ tính trên điểm ảnh hiệu ứng của từng khung. "Gộp" là tổng điểm ảnh giống máu chia tổng điểm ảnh hiệu ứng của cả nhóm khung.

### Theo commit

| Mục | Commit | Nội dung |
|---|---|---|
| Kịch bản | `ce2b8a1` | `PLAN=fixes` cho ảnh trước và sau |
| 1. Tàn lửa | `33c083b` | `EmberPool` (`embers.ts`): tàn lửa rời, thay cục `dragonhold-embers` ở chế độ `heat` |
| 2. Vết cháy | `d744d8a` | Vết cháy thủ tục trong `GroundDecalPool` thay ngôi sao đen `scorch_01`; lửa tắt về than ấm thay vì bồ hóng tím |
| 3. Ấn và vòng | `6a732de`, `784cc6d` | `ElementKit.sigil` (`SigilLook`), nhánh `SOLID` của `GroundSigil`, `HeatRingPool` (`heat-rings.ts`) cho vòng áp suất; lớp lót ấm hơn một chút |
| 4. Khung đồ hoạ | `1249424` | `ScreenAccent.frames.roles`, chương trình `ROLES` của `ImpactPass` |
| 5. Tụ lực | `2b09491` | `FlipOptions.erode`: `fire-charge` hiện ra bằng ăn mòn |
| 6. Thay, không chồng (phím 7) | `756e4fc` | Móc `StreamHooks.slash`, `plant`; `FlameSlash` (`flame-slash.ts`), đường cắt cháy, cắm kiếm bằng lửa |
| 7. Đo thời gian | `379125c` | `lab-k5-perf.mjs`, `lab-power-perf.mjs` xả hàng đợi GPU trước mỗi cửa sổ |

### 1. Tàn lửa (`33c083b`)

- Trước: atlas `dragonhold-embers` vẽ ở chế độ `heat`, cỡ 1,3–2,6 m, thành một cục gai cam đặc, nguội về `#6A1606` trên ngôi sao đen: trên đá sáng đọc như vệt máu.
- Sau: `EmberPool` (`src/view/skills/embers.ts`), một lệnh vẽ, không cấp phát mỗi khung:
  - mỗi tàn lửa là một hạt rời 0,08–0,3 m (phần lớn nhỏ, vài hạt to), văng ra rồi được hơi nóng đẩy lên, đung đưa, chập chờn, kéo vệt theo hướng bay trên màn hình;
  - nguội từ trắng vàng sang hổ phách, cam, rồi cam tối `#AC5A1C` (sắc 26°) và co nhỏ dần đến hết (ease-out). Kênh xanh lá luôn ≥ 0,2 kênh đỏ, nên không bao giờ thành đỏ sẫm hay nâu đỏ;
  - hạt là một mảng đặc (premultiplied), nên trên đá sáng vẫn đậm màu. Chỉ khi còn nóng mới có một quầng cộng sáng mỏng; chỉ hạt nóng nhất mới vượt ngưỡng bloom;
  - mô phỏng giải tích trên GPU: mỗi hạt ghi một lần khi sinh, shader tính vị trí theo đồng hồ của sân khấu (giảm tốc chính xác, như nhau ở mọi nhịp khung, đứng yên khi hit-stop).
- Va chạm, phát chiêu, cái chết (chết thành tàn lửa), kiếm đầu phím 7 và tàn lửa bốc lên từ đất cháy đều dùng nó. `ElementStage.embers` tạo pool.
- Số đo, phím 1 dư âm (khung 60–240, camera chơi và camera gần):
  - giống máu lớn nhất: đá sáng 19,8 % → 0,4 %; đá tối 45,5 % → 5,6 %;
  - gộp: đá sáng 4,4 % → 0,1 %; đá tối 14,3 % → 1,8 %.
  - Từng khung: `k1-120` đá sáng 19,3 % → 0,02 %, đá tối 41,8 % → 0,8 %; `k1c-150` đá tối 28,9 % → 0,02 %.
- Phần còn lại trên đá tối là viền đen có ánh đỏ của vỏ lửa trên kiếm (ngoài phạm vi) và mép bồ hóng của hoa sen.

### 2. Vết cháy (`d744d8a`)

- Trước: `scorch_01` là ngôi sao gai đen alpha 0,85, trên đá sáng đọc như vết mực.
- Sau: `GroundDecalPool` có chế độ thủ tục khi `texture` là `null` (`GroundAftermath.texture: string | null`, `ElementStage.decals(null)`):
  - một vùng than mềm, không đều: lõi bị làm méo bằng nhiễu, mép bị nhiễu bào mòn, không có tia sao;
  - đậm ở giữa (than ấm `#2E2010`, alpha 0,6) rồi nhạt dần ra mép thành đá bị cháy nâu (alpha ~0,2), nên trên đá sáng tương phản thấp;
  - bên trong có vài đường nứt than hồng (thành ô Voronoi bị méo, cắt rời bằng nhiễu), đốm than và một viền sáng ở mép. Tất cả nguội từ vàng sang cam rồi tắt hẳn (`cool` 0,85), không để lại lưới nâu;
  - mọc ra từ giữa, rồi bị ăn mòn từ chỗ mỏng vào khi hết đời;
  - cỡ theo cú đánh: 1,9 r (lớn 2,4 r), nhỏ hơn trước một chút.
- Hoa sen lửa, lửa thấp trên đất, dòng lửa và vòng xoắn tụ lực giờ tắt dần về than ấm thay cho bồ hóng tím. Cam trộn về tím đi qua màu nâu đỏ; đó là nguồn thứ hai của các điểm ảnh giống máu ở dư âm.
- Số đo nằm chung với mục 1 (cùng khung dư âm). Ở `k1c-120`…`k1c-180` đá tối: 28–32 % → ≤ 0,03 %.

### 3. Ấn, vòng ấn và vòng áp suất (`6a732de`, `784cc6d`)

- Trước: ấn, các vòng của ấn và vòng áp suất lúc phát chiêu đều là ánh sáng cộng trong bảng màu lửa, nên trên đá sáng thành nét hồng cam nhạt.
- Sau: bộ hệ quyết chất của ấn (`ElementKit.sigil`, kiểu `SigilLook`):
  - Metal không có (vẫn là ánh sáng cộng như cũ);
  - Fire là `"solid"`: `GroundSigil.setSolid` bật nhánh `SOLID` trong shader. Mỗi nét nằm trên một lớp lót than gần trung tính (`#17140F`, alpha 0,8, trộn thường); thân nét phủ lên đá bằng màu son `#E0561A`, sáng dần về vàng `#FFAE34` khi ấn bùng; chỉ một đường mảnh ở giữa nét là cộng sáng (vàng nóng, HDR khi bùng). Vòng ngọc của Clear Wind cũng thành vật chất trên cùng lớp lót. Ấn hiện ra và tắt bằng ăn mòn, không mờ trong suốt;
  - nhánh `SOLID` nằm trong `#ifdef`: chương trình của Metal không đổi;
  - vòng dưới chân người thi triển (`presence.ts`) là một vòng của ấn, nên lab cho nó cùng chất, với lớp lót nhạt hơn (×0,35). Lót đậm thì phần toả rộng của nó thành một vành đen dưới chân;
  - lớp lót ban đầu là `#141211`. Trên đá tối, mép của nó có ánh đỏ gần đen (giống máu 5–10 % lúc gõ), nên `784cc6d` đổi sang `#17140F`, ấm hơn một chút. Phần nhạt trên đá sáng không đổi.
- Vòng áp suất: `HeatRingPool` (`src/view/skills/heat-rings.ts`), mô phỏng giải tích trên GPU, quay theo camera hoặc nằm trên đất. Đó là một dải son–vàng trên lớp bồ hóng, có đường nóng mảnh ở giữa; vòng mở ra nhanh, nguội dần, vỡ ra bằng ăn mòn ở cuối.
- Số đo trên đá sáng, phần nhạt (cách của lượt kiểm):

| Khung | Trước | Sau |
|---|---|---|
| Phát chiêu (`k1` 1, 3, 6; `k1t` 66, 68, 74; `k7` 1), lớn nhất / trung vị | 50,6 % / 35,3 % | **5,9 % / 4,0 %** |
| Lúc gõ (`k1t` 10–58), lớn nhất / trung vị | 52,3 % / 45,4 % | **5,2 % / 2,4 %** |
| `k1-006`, `k1t-026`, `k1t-058` | 35,3 %, 45,6 %, 52,3 % | 5,9 %, 0,9 %, 1,5 % |

- Đá tối: không mất màu. Thân nét đậm hơn: độ bão hòa trung vị của thân 0,91–0,98 (trước 0,57–0,91), phần nhạt 1,3–4,9 %.
- Thân lửa sau tone mapping ở các khung này: sắc trung vị 24–35°, độ bão hòa trung vị 0,89–0,98 trên đá sáng.

### 4. Khung đồ hoạ (`1249424`)

- Trước:
  - khung đảo màu của Fire dùng giấy `paper [1.0, 0.84, 0.58]`, nên trong 4 khung cả màn hình thành màu da cam nhạt;
  - các vụ nổ cục bộ (mỗi đòn chính) có mảng giấy màu be.
  - Trên đá sáng còn một lỗi: khung đọc "chỗ trúng" theo độ sáng, nên đá sáng bị coi là lõi và quầng.
- Sau: `ScreenAccent.frames.roles` (kiểu `FramePalette` trong `screen-fx.ts`) cho mỗi vai một màu riêng của hệ: tia tụ và chỗ trúng của khung tối; đường tụ, nét và viền của khung đảo màu.
  - Có `roles` thì `ImpactPass` dùng chương trình `ROLES`. Chương trình này đọc chỗ trúng từ ánh sáng bão hòa và lõi nóng nhất, không chỉ từ độ sáng.
  - Metal giữ chương trình cũ: F15, F197, F201 giống hệt từng bit.
- Fire:
  - khung tối: thế giới màu nâu bồ hóng (sắc 20°, không phải đỏ cảnh báo hay đỏ máu), tia tụ hổ phách, hình đen, ánh lửa vàng, chỗ trúng trắng nóng;
  - khung đảo màu và các vụ nổ cục bộ: nền son–hổ phách, ánh lửa thành hình bồ hóng tối, hình đen viền vàng, nét và vụ nổ mực bằng bồ hóng (sắc 20°).
- Lab dịch trước (prewarm) chương trình khi đổi hệ.
- Số đo (cả khung hình):

| Khung | Đá | Bão hòa TB trước → sau | Độ sáng TB trước → sau | Nhạt trước → sau |
|---|---|---|---|---|
| F197 tối, camera chơi | sáng | 0,785 → 0,867 | 0,097 → 0,155 | 2,2 % → 9,7 % |
| F201 đảo màu, camera chơi | sáng | 0,482 → 0,919 | 0,624 → 0,357 | 12,9 % → 0 % |
| F201 đảo màu, cận cảnh | sáng | 0,550 → 0,920 | 0,547 → 0,298 | 18,5 % → 0 % |
| F201 đảo màu, camera chơi | tối | 0,480 → 0,920 | 0,691 → 0,393 | 40,6 % → 0 % |

- Vụ nổ cục bộ `k1-008` đá sáng: nhạt 35,5 % → 10,2 %.
- Phần nhạt 7–10 % của khung tối là chỗ chuyển từ lõi trắng nóng sang quầng hổ phách quanh nhát chém. Màn hình không bị nhạt.

### 5. Tụ lực (`2b09491`)

- Trước: lúc mới gõ, `fire-charge` (clip RGBA có alpha thật) mờ dần theo `alpha = vis`, nên nhìn xuyên được thân lửa.
- Sau:
  - `FlipOptions.erode` (chế độ `rgba` của `flipbook.ts`, ghi vào `iAge.w`): sprite bị ăn mòn một phần, chỗ mỏng đi trước, alpha giữ nguyên độ đặc;
  - `chargeFrame` cho vòng xoắn hiện ra bằng `erode = 1 − vis` và một chút co giãn (0,8 → 1).
- Số đo trong khung quanh tay (`k1t` 10, 18, 26), phần nhạt trên đá sáng: 18,5 % / 16,2 % / 43,1 % → 1,9 % / 4,1 % / 2,1 %. Số này gồm cả phần ấn của mục 3 nằm trong khung đó. Trên ảnh, vòng xoắn đặc ngay từ phím đầu (tấm so sánh, hàng 5).

### 6. Thay, không chồng ở phím 7 (`756e4fc`)

- Trước: ba thứ vẫn là lớp Metal tô màu lửa:
  - nhát chém kết `QiSlash`;
  - đường cắt trên thú lớn (không có móc);
  - sao, vòng và vết mực nơi nạn nhân chính bị ghim kiếm (`victims.ts`).
- Móc mới:
  - `StreamHooks.slash`: `drawSlash` gọi mỗi khung khi nhát chém còn hiện, rồi gọi một lần với `fade = 0` khi nó hết. Móc trả `true` thì `QiSlash` ẩn;
  - `StreamHooks.plant`: `victims.setPlant(...)` trong lab; móc trả `true` thì không vẽ sao, vòng, vết mực;
  - `StreamSeamArgs` mang thêm hình học của đường cắt (điểm đầu, hướng, độ dài như Metal tính).
- Fire:
  - **Nhát chém lửa** (`FlameSlash`, `flame-slash.ts`): cùng dải và cùng hình trăng khuyết với `qi-slash.ts` (`QI_SLASH_VERTEX` dùng chung), vẽ như nhiệt độ:
    - sống trắng vàng sạch, thân cam, lưỡi lửa (nhiễu fbm bị làm méo) liếm ra ngoài với mép bồ hóng;
    - nóng hơn ở sau đầu nhát chém; đầu nhát chém nằm trong hình (trước đó nó vẽ thành ô vuông ở hai đầu dải);
    - nguội dần qua các dải rồi bị bào, không mờ trong suốt;
    - tàn lửa rơi ra sau đầu nhát chém.
  - **Đường cắt cháy**: đường nóng chảy mảnh, lưỡi lửa ở chế độ `heat` chạy dọc nó (dùng pool `dragonhold-flame-trail` với `dir` và `span`), tàn lửa.
  - **Cắm kiếm bằng lửa**: điểm trắng vàng, vòng lửa trên đất (`HeatRingPool` nằm trên đất), hoa sen lửa nhỏ, vết cháy thủ tục, tàn lửa. Thanh kiếm cắm (`BladeSet`) giữ nguyên, vì đó là chất của kiếm.
- Metal phím 7: 30 khung (camera chơi và cận cảnh, gồm nhát chém, cắm kiếm, khung đồ hoạ) giống hệt từng bit trước và sau.
- Số đo phím 7 (khung 205–360, nhát kết và sau đó):
  - nhạt trên đá sáng: lớn nhất 32,2 % → 18,7 %, trung vị 16,1 % → 12,0 %;
  - giống máu, gộp: đá sáng 0,9 % → 0,1 %; đá tối 3,1 % → 0,6 % (lớn nhất 45,2 % → 2,5 %).

### 7. Đo thời gian (`379125c`)

- `lab-k5-perf.mjs` và `lab-power-perf.mjs` dính đúng lỗi mà phần 3 đã sửa trong `lab-element-perf.mjs`: `step()` vẽ mà không chờ GPU, nên khung đầu tiên được bấm giờ gánh cả hàng đợi.
- Đo lại bằng bản cũ, `RUNS=2`, High 1920×1080, DPR 1:
  - `lab-power-perf`: khung lớn nhất của cửa sổ nghỉ 642 / 645 ms, phím 7 săn 139 / 145 ms, K5 346 / 342 ms;
  - `lab-k5-perf` (`full`): đỉnh K5 144 ms.
- Sửa: khung cuối trước mỗi cửa sổ được bấm giờ (`perf(1)`), độ dài dòng thời gian không đổi. Khung lớn nhất còn 10–11 ms (`lab-power-perf`) và 13,4 ms (đỉnh K5).

### Các cổng

- **Metal không đổi** (`lab-element-parity.mjs`, 21 khung, `?element=metal`; `867ba32` so với `379125c`): 21/21 giống hệt từng bit (AE 0, PAE 0, fuzz 1 % cũng 0). Thêm 30 khung phím 7 của `PLAN=fixes` (gồm khung đồ hoạ, nhát chém, cắm kiếm): giống hệt. Commit `784cc6d` sau đó chỉ đổi một màu của Fire. `parity-metal.json`.
- **Fire − Metal, p95** (High 1920×1080, DPR 1, M4, tải 2,4–4,0):
  - 6 vòng xen kẽ Metal và Fire, mỗi vòng `RUNS=2`, tức 12 lượt mỗi hệ;
  - `lab-element-perf.mjs` xả hàng đợi GPU trước mỗi cửa sổ.

| Đoạn | Metal (trung vị / TB) | Fire (trung vị / TB) | Fire − Metal | Lệnh vẽ Metal / Fire |
|---|---|---|---|---|
| Nghỉ | 8,45 / 8,28 | 8,40 / 7,98 | −0,05 / −0,30 | 34 / 34 |
| Phím 1 | 9,10 / 8,88 | 9,35 / 8,80 | +0,25 / −0,07 | 48 / 43 |
| Phím 7 săn | 10,15 / 9,84 | 9,85 / 9,62 | −0,30 / −0,22 | 54 / 54 |
| Phím 7 nhát kết | 9,85 / 9,85 | 9,40 / 9,86 | −0,45 / +0,01 | 51 / 54 |
| K5 | 10,20 / 10,10 | 10,20 / 9,78 | 0,00 / −0,32 | 54 / 53 |

  - Cổng ≤ 0,85 ms: đạt ở phím 1, phím 7 săn và nhát kết (lớn nhất +0,25 ms theo trung vị).
  - Trần 11,5 ms theo trung vị: đạt, cao nhất 10,2 ms.
  - Lượt tệ nhất vượt trần ở cả hai hệ: p95 nhát kết 12,8 ms (Metal) và 13,3 ms (Fire), mỗi hệ một lượt. Khung lớn nhất 14,4 ms (Metal) và 14,5 ms (Fire).
  - Số liệu: `perf/perf-{metal,fire}-{1..6}.json`, `perf/perf-summary.json`.
- **Phím tới lúc phát chiêu**: máy dò chuyển động cho VFX 0 ms, thân 33 ms ở cả năm lần phát của Fire (phím 1 camera chơi, camera gần, gõ theo WPM; phím 7 hai camera), trên cả đá sáng lẫn đá tối, như trước.
- **Bloom**: 0 điểm ảnh NaN hay Inf ở mọi khung (`maxNonFinite` 0, cả hai nền, trước và sau).
- **Thân lửa sau tone mapping**: sắc trung vị của thân 21–35°, độ bão hòa trung vị 0,59–0,98 ở mọi nhóm khung trên cả hai nền. Thân vẫn cam. Trước đó, ở dư âm có khung có sắc thân 13,7–17° (cục tàn lửa nguội đỏ).
- **Phần nhạt trên đá sáng**:
  - lúc phát chiêu ≤ 5,9 %, lúc gõ ≤ 5,2 %: đạt ≤ 15 %;
  - dư âm phím 1 ≤ 6,2 % (trước 78,6 %);
  - phím 7 lúc săn ≤ 19,1 % (trước 18,9 %);
  - khoảnh khắc trúng đòn của phím 1 ở camera gần (`k1c-008`) vẫn 53,6 %: xem phần còn lại.
- **Điểm ảnh giống máu** (gộp, trước → sau):

| Nhóm khung | Đá sáng | Đá tối |
|---|---|---|
| Phát chiêu | 1,0 % → 0,4 % | 6,8 % → 1,4 % |
| Lúc gõ | 1,1 % → 0,8 % | 4,3 % → 3,1 % |
| Phím 1 trúng đòn và bay | 0,3 % → 0,1 % | 2,5 % → 1,9 % |
| Phím 1 dư âm | 4,4 % → 0,1 % | 14,3 % → 1,8 % |
| Phím 7 săn | 1,7 % → 0,8 % | 2,0 % → 0,7 % |
| Phím 7 khung đồ hoạ | 0,04 % → 0,02 % | 2,6 % → 0,02 % |
| Phím 7 nhát kết và sau | 0,9 % → 0,1 % | 3,1 % → 0,6 % |

  - Lớn nhất ở một khung: đá sáng 19,8 % → 1,5 %; đá tối 45,5 % → 7,7 %.
  - Phần còn lại trên đá tối gần như toàn là điểm ảnh gần đen (độ sáng 0,02–0,05) ở mép bồ hóng của vỏ lửa và hoa sen, không đọc thành máu.
- **Kiểm thử và build**:
  - `pnpm test`: 728 bài xanh, 81 tệp (thêm 7 bài trong `tests/view/element-layer.test.ts`: tàn lửa, vết cháy thủ tục, ấn `SOLID` và vòng nhiệt, bảng màu khung đồ hoạ, `erode` của tụ lực, móc nhát chém, đường cắt và cắm kiếm của phím 7);
  - `tsc` và `pnpm build` xanh; `verify-kit` khớp 73 tệp;
  - mã băm mọi tệp JS của `dist` giống bản build của `867ba32` (`main-XrAzOVU-.js`, `swords-CpZ2rKAM.js`, …); không có mã lab hay mã Fire nào trong `dist`.

### Tấm ảnh và số liệu

- `tmp/shots/element-fire/fixes/sheet-before-after.jpg`: sáu hàng, một hàng một mục. Mỗi hàng có trước và sau trên đá sáng, rồi trước và sau trên đá tối:
  1. tàn lửa (`k1c-090`);
  2. vết cháy (`k1c-150`);
  3. ấn và vòng (`k1t-068`);
  4. khung đảo màu (`k7-201`);
  5. tụ lực (`k1t-010`);
  6. nhát chém, cắm kiếm và đất cháy của phím 7 (`k7c-205`).
- Số liệu trong `tmp/shots/element-fire/fixes/`:
  - `gates-{before,after}-{light,dark}.json`: từng khung;
  - `gates-summary.json`: theo nhóm;
  - `fire-{before,after}-{light,dark}.json`: phím tới VFX, bloom, trạng thái màn hình;
  - `parity-metal.json`, `perf/`.
- Khung thô của tôi đã xóa bằng tay (`tools/capture-prune` từ chối mọi đường dẫn trong `immortality-cultivation`).

### Còn lại

- Chưa có giám khảo mù hay anh duyệt. Mọi phần ở đây vẫn là tạm, chưa qua 8,5.
- Khoảnh khắc trúng đòn của phím 1 ở camera gần còn nhạt trên đá sáng (`k1c-008` 53,6 %). Nguồn:
  - bóng trúng đòn một khung màu trắng vàng của thú (`herd.setElementLook` trong lab);
  - các khung đầu còn mềm của hoa sen `fire-burst`;
  - mép lưỡi furnace (ngoài phạm vi).
  - Hướng sửa: bóng trúng đòn vàng đậm hơn, hoa sen bắt đầu từ khung đặc hơn.
- Phím 7 lúc săn và nhát kết vẫn có 7–19 % nhạt trên đá sáng: phần lớn là vệt mảnh của kiếm sông, lưỡi furnace và vỏ lửa (ngoài phạm vi, chờ thiết kế mới của kiếm bay).
- Nhát chém lửa đọc được là lửa, nhưng lưỡi lửa bên mép còn lổn nhổn. Muốn đẹp hơn thì dùng một clip Firefly dải lửa dọc nhát chém, hoặc thêm một lượt chỉnh nhiễu.
- Vòng lửa khi cắm kiếm và vòng áp suất là dải son đặc có đường nóng. Còn có thể thêm lưỡi lửa bốc lên từ vòng.
- Vết cháy thủ tục trên đá sáng đọc như đá bị cháy nâu xám. Nếu anh muốn vết cháy đậm chất "anime" hơn, có thể thêm vệt bồ hóng toả tia mềm (không phải ngôi sao).
- Pass méo hơi nóng dùng chung: vẫn để làm cùng Water.
- Các chiêu khác (Phi Kiếm, K2, Hộ thân, Lưu Quang Bộ, K4, K5) vẫn vẽ bằng lớp Metal theo bảng màu lửa; `SigilLook` mới chỉ áp cho ấn và vòng dưới chân.

### Kiểm tra lại (lượt kiểm đối kháng sau phần 4)

Một lượt kiểm độc lập, không tin số của phần 4: server riêng không HMR, `867ba32` xuất bằng `git archive` (thêm `server.fs.allow` cho `node_modules` dạng symlink), cùng `PLAN=fixes`, `WORLD=1`, đá sáng `#d6d0c2` và đá tối `#2a2c30`, High 1920×1080, DPR 1. Điểm ảnh hiệu ứng là chỗ khác hơn 0,10 so với khung ẩn VFX; "nhạt" và "thân" như phần 4; "giống máu" theo brief (sắc < 15° hoặc > 345°, độ sáng < 0,55) cộng độ bão hòa ≥ 0,2 để sắc có nghĩa. Số liệu: `tmp/shots/element-fire/fixes/recheck/`.

**Lỗi rõ đã sửa (mỗi lỗi một commit):**

| Commit | Lỗi | Số đo |
|---|---|---|
| `905d8c2` | `EmberPool` ghi đè ô cũ nhất dù tàn lửa còn sống: ở phím 7, 1 020 trên 2 408 tàn lửa biến mất trong một khung (nhảy hình). Nhu cầu đỉnh 1 854 hạt (High), 1 873 (Ultra), pool chỉ có 1 024 | Tìm ô trống trong 64 ô kế tiếp, đầy thì bỏ hạt mới (`dropped`); pool Fire 2 560. Sau sửa: 0 hạt bị cắt. Có test |
| `d2093bd` | `FlipbookPool` cũng ghi đè sprite còn sống: 29 trên 111 hoa sen `fire-burst` (chết, kiếm đầu) tắt ngang ở phím 7. Nhu cầu đỉnh 76 (phím 7), 88 (K5), pool 48 | Pool đầy thì bỏ sprite mới; `fire-burst` 96 ô; ghi vào `SYNC_DEBT.md`. Sau sửa: 0. Có test |
| `99771ab` | `SEAL_LIT` là `#FFAE34` nguyên, kênh đỏ 1,0, trái hợp đồng `SigilLook` (thân ấn và vòng ≤ 0,9 một kênh) | `#FFAE34` × 0,9 cho ấn, vòng dưới chân và hai pool vòng nhiệt. Có test trên mọi bộ chất |
| `322157b` | Nhát chém lửa: lõi HDR trắng vàng × 2,4 chiếm ~75 % bề rộng (thân, phần lõm vào và số hạng lưỡi lửa cộng dồn qua ngưỡng lõi), thành một dải kem trên đá sáng, trái mô tả của chính nó và luật "chỉ lõi mảnh mới bloom" | Đọc dải trăng khuyết từ một mip thô của mặt nạ (tâm và nửa bề rộng có trọng số, liền mạch dọc nhát chém): sống trắng vàng ở ~16 % giữa, thân hổ phách, mép son, viền bồ hóng, lưỡi lửa chỉ ở ngoài. Riêng nhát chém trên đá sáng: thân 7–22 % → 46–80 %, lõi 18–26 % → 0,3–13 %, nhạt 19–23 % → 1–17 %. Chỉ là shader, đo trên khung (không có test đơn vị) |

**Các cổng (đo trên `322157b`):**

- **Metal không đổi: đạt.** 85/85 khung giống hệt từng bit so với `867ba32` (21 khung `lab-element-parity` và 64 khung Metal của `PLAN=fixes`: gõ, khung đồ hoạ, nhát chém, cắm kiếm). Đo cả trước và sau bốn sửa trên.
- **Fire − Metal p95: đạt.** 6 vòng xen kẽ, `RUNS=2`, 12 lượt mỗi hệ, xả GPU trước mỗi cửa sổ, tải 3,3–5,1. Trung vị / trung bình: nghỉ +0,25 / +0,35, phím 1 +0,15 / +0,27, phím 7 săn +0,25 / +0,55, nhát kết −0,35 / +0,21, K5 +0,15 / +0,29 ms (cổng ≤ 0,85). Lúc nghỉ Fire không vẽ gì mà vẫn lệch +0,35: đó là mức nhiễu.
- **Trần 11,5 ms: đạt.** Trung vị p95 cao nhất 10,2 ms; lượt tệ nhất 11,3 ms (Fire, nhát kết), 10,7 ms (Metal). Khung lớn nhất 13,3 ms (Fire, nhát kết), 14,5 ms (Metal, nghỉ). Lệnh vẽ Metal / Fire: 34/34, 48/43, 54/54, 51/54, 54/53.
- **Phím tới phát chiêu: đạt.** VFX 0 ms, thân 33 ms ở cả 5 lần phát, hai nền.
- **Bloom: đạt.** 0 điểm ảnh NaN hay Inf ở 118 khung.
- **Thân lửa sau tone mapping: đạt.** Sắc trung vị 21,4–34,9°, độ bão hòa trung vị 0,55–0,99 ở mọi khung, hai nền; gần đỏ cảnh báo ≤ 0,31 %.
- **Thay, không chồng: đạt.** Đếm instance sống mỗi khung qua `__THREE_DEVTOOLS__`. Phím 1: 25/26 lớp VFX của Metal im lặng khi chọn Fire; còn lại là số sát thương (HUD) và phần hình (ấn và vòng dưới chân đã thành `SOLID`, ribbon thành dải lửa, kiếm). Phím 7: 25/27 im lặng; còn lại là impostor của kiếm xa và 88 tia vệt kiếm sông (ngoài phạm vi). `QiSlash` 0 khung (bản `867ba32`: 67), sao, vòng, vết mực của nạn nhân bị ghim 0.
- **Phần nhạt trên đá sáng ≤ 15 %: không đạt ở 6/59 khung.** Phát chiêu ≤ 5,9 %, lúc gõ ≤ 5,2 %, dư âm phím 1 ≤ 6,2 %, khung đồ hoạ ≤ 6,4 %: đạt. Không đạt: `k1c-008` 53,6 %, `k1c-040` 16,4 %, `k1-010` 15,2 % (trúng đòn phím 1), `k7c-060` 18,2 %, `k7c-090` 19,1 % (săn, chủ yếu vệt kiếm sông và lưỡi furnace, ngoài phạm vi), `k7c-215` 15,6 % (trước sửa nhát chém: 18,7 %; nhóm nhát kết trung vị 12,0 → 7,0 %).
  - Phần 4 kể bóng trúng đòn của thú là một nguồn của `k1c-008`. Bóng đó vẫn nhìn thấy nhạt, nhưng nó thuộc lớp actor nên có cả ở khung ẩn VFX và không nằm trong con số 53,6 %. Ẩn từng lớp ở `k1c-008`: hoa sen `fire-burst` (các khung đầu còn mềm, trong) gánh 50 % phần nhạt, dải lửa của vệt 6 %, chấm sáng `dot` 3 %; phần còn lại chưa tách (nhát cắt cộng sáng `cut`, khung đồ hoạ cục bộ).
- **Điểm ảnh giống máu: không đọc thành máu.** Đá sáng gộp 0,36 %, lớn nhất 1,6 % một khung. Đá tối gộp 1,04 %, lớn nhất 7,8 % (`k1-024`): đó là viền mảnh đỏ sẫm ở đầu lưỡi lửa của hoa sen và mép nét ấn (độ sáng 0,25–0,43). Nhìn trên khung không thấy vệt máu, mực hay hộp đen; không có đường cắt cứng.
- **Kiểm thử và build: đạt.** `pnpm test` 731/731 (81 tệp, thêm 3 bài), `tsc` và `pnpm build` xanh, `verify-kit` 73 tệp; `dist` vẫn là `main-XrAzOVU-.js`, `swords-CpZ2rKAM.js`, không có mã lab hay Fire.

**Điểm nhìn, chưa sửa (cho anh và giám khảo):**

- Trúng đòn phím 1 trên đá sáng còn nhạt (xem trên). Hướng: hoa sen bắt đầu từ khung đặc hơn hoặc hiện ra bằng ăn mòn như tụ lực; chấm sáng `dot` (trắng vàng × 4,2–4,5, rộng tới 1,15 m) thành lõi nhỏ cộng một quầng ≤ 0,9.
- Vòng áp suất ở tay là một vòng cam dày đều, viền bồ hóng, như vòng nhựa; vòng lửa khi cắm kiếm là một vòng cam mảnh. Cả hai còn đơn điệu.
- Khung đồ hoạ cục bộ của phím 1 và phím 7 là ngôi sao gai đen tâm trắng (cùng ngữ pháp với Metal), đọc như vết mực. Khung đảo màu son với vụ nổ bồ hóng cũng đọc như mực bắn.
- Quả cầu trắng lớn ở chỗ chết và chỗ cắm kiếm (`dot` × 3–3,2, 1,3 m), và đường nóng chảy của nhát kết (lõi × 4,5) toả bloom kem trên đá sáng.
- Vết cháy thủ tục trên đá sáng đọc như vệt bẩn nâu xám; trên đá tối thì đẹp (đường nứt than hồng).
- Trong lab: mép tan của thú màu san hô (sắc ~14°, sáng) có thể đọc như thịt sống; bóng trúng đòn trắng hồng của thú.
- Sống nhát chém mới hơi gợn theo mép xơ của mặt nạ; vẫn đọc là lõi nóng chảy.

**Video và ảnh (cho điều phối, chưa gửi anh):**

- `tmp/shots/element-fire/fixes/fire-fixed-play.mp4`: 8,17 s, camera chơi, phím 1 gõ ở 45 WPM rồi phím 7; H.264 1920×1080 60 fps, tốc độ thật, có tiếng (118 lượt; trung bình −10,8 dB, đỉnh 0,0 dB); 15,3 MiB.
- `tmp/shots/element-fire/fixes/fire-fixed-close.mp4`: 12,0 s, phím 1 gõ ở góc nhìn gần của người chơi, phím 1 gõ với camera gần trên chỗ trúng, phím 7 với camera gần trên sân; có tiếng (129 lượt; −12,2 / −0,3 dB); 25,3 MiB.
- Phụ đề tiếng Anh mỗi đoạn. `tmp/shots/element-fire/fixes/stills-fixed-light-dark.jpg`: cùng bố cục với `stills-fire-light-dark.jpg` (phím 1 F88, F180; phím 7 F186, F260).
- Bằng chứng: `recheck/evidence/` (nhát chém trước và sau, bản đồ điểm ảnh nhạt và giống máu, các điểm nhìn). Khung thô đã xóa bằng tay (`tools/capture-prune` từ chối đường dẫn trong `immortality-cultivation`); server và bản xuất đã dọn.

## Phần 5: vòng 3 của Sword × Fire, lửa lưu lâu hơn và các điểm nhìn còn lại

Anh xem hai video sau phần 4 và nhắn (03/11): "liệu có nên xử lý ngọn lửa bị ẩn chậm đi 1 chút k, chứ hình như tôi thấy hiệu ứng bị biến mất hơi nhanh". Đó là mục 0, làm trước và vào commit riêng. Các mục 1–7 là những điểm nhìn mà lượt kiểm lại sau phần 4 và lượt xem của điều phối còn thấy; chúng dựng trên nhịp mới của mục 0. Mục 8 là số đo để báo, không chặn.

Ngoài phạm vi, không đụng tới (thiết kế hào quang kiếm sẽ thay): chất của chính thanh kiếm bay (lưỡi furnace trong `sword-material.ts`, vỏ lửa `sheathAt`, vệt và ribbon, 88 tia vệt của phím 7, `real-swords.ts`, `blades.ts`), `src/lab/cutin.ts`, `src/kit/**`, các game khác. Metal giữ nguyên từng bit (số đo ở dưới).

### Cách chụp và đo

- "Trước" là HEAD `cff975b`, xuất bằng `git archive` sang `tmp/r3-before` (có `server.fs.allow` cho `node_modules` dạng symlink), server riêng không HMR cổng 3122. "Sau" là repo, cổng 3121, khởi động lại sau mỗi lần sửa mã. Lượt chạy dở trước đó đã để lại bản xuất và ảnh "trước" của `PLAN=fixes`; tôi đã so bản xuất với `git archive cff975b` (giống hệt) và kiểm đủ 123 ảnh mỗi nền, nên dùng lại.
- High, 1920×1080, DPR 1, đá sáng `#d6d0c2` và đá tối `#2a2c30`, `WORLD=1` (cùng khung khi ẩn lớp VFX).
- `PLAN=fixes` như phần 4 (59 khung). Thêm `PLAN=linger` (commit `a7e4784`): khung 0, 6, 12, 24, 36, 48, 60, 90, 120, 180 sau đòn trúng. Phím 1 ở camera gần và camera chơi tính từ đòn đầu (khung mà sự kiện `impact` đầu tiên của lab bắn, tìm bằng cách bước từng khung: khung 7 sau phím); phím 7 ở camera gần tính từ nhát kết (F192).
- Điểm ảnh hiệu ứng, "nhạt", "thân", "giống máu" định nghĩa như lượt kiểm lại của phần 4: khác hơn 0,10 so với khung ẩn VFX; nhạt là sắc 8–62°, độ bão hòa 0,10–0,45, độ sáng ≥ 0,62; giống máu là sắc < 15° hoặc > 345°, độ sáng < 0,55, độ bão hòa ≥ 0,2.
- Để biết lớp nào làm nhạt, tôi chụp cùng khung khi ẩn lần lượt từng lớp VFX (qua móc `__THREE_DEVTOOLS__`, không sửa lab) rồi đếm điểm ảnh nhạt mất đi.

### Theo commit

| Mục | Commit | Nội dung |
|---|---|---|
| Kịch bản | `a7e4784` | `PLAN=linger` cho dải thời gian trước và sau |
| 0. Lửa lưu lâu hơn | `000440d` | `flipbook.ts` ánh xạ thời gian hai tốc độ (`slowFrom`, `slowRate`, `frameAt`, `playLife`) và `setSharpen`; nhịp mới của mọi lớp lửa; giới hạn khi sân đông; pool lớn hơn |
| 1. Va chạm phím 1 bớt nhạt | `ee1a45d` | `FlipbookPool.setGrade` (đế trắng nóng của hoa sen thành vàng đặc, chỉ tim trắng nhất giữ trắng), gốc sprite tan bằng ăn mòn; hoa sen từ khung 2, lửa đất từ khung 3; nhát cắt thành vật chất (`SpritePoolOptions.matte`) |
| 2. Điểm lửa thay quả cầu trắng | `38c16a1`, `2623274` | `FirePointPool` (`fire-points.ts`); lõi nhỏ màu vàng ở commit sau |
| 3. Vòng có cấu trúc lửa | `ee67678` | `heat-rings.ts`: bề rộng đổi theo góc, lưỡi lửa liếm ra, đường nóng đứt đoạn, viền bồ hóng trong, nguội không đều; tàn lửa rơi từ vòng |
| 4. Khung đồ hoạ | `a0fb139` | `fireBurst`, `fireSparks` trong chương trình `ROLES` của `screen-fx.ts` |
| 5. Đất cháy | `3ea6a47` | Nhánh `PROCEDURAL` của `ground-decals.ts`: mép rõ mà không đều, vành nâu cháy, vòng than, tim tối |
| 6. Thú cháy | `e8776dc` | `FoeStatus.flash`, `.burn` (`element-kit.ts`), `LAB_BURN` trong `herd.ts`; tông màu đòn của Fire thành hổ phách |
| 7. Nhát chém lửa | `309db41` | Bảng dải (`measureBand`) cho sống liền mạch, lưỡi lửa đều và rõ; đường nóng chảy của nhát kết và đường cắt thành vàng ×2 |

### 0. Lửa lưu lâu hơn (`000440d`)

Nguyên tắc: pha bùng giữ nguyên (khung đầu ở đỉnh, cùng tốc độ tới đỉnh của clip, phím tới lúc phát chiêu không đổi), rồi đỉnh được giữ lâu hơn và lửa cháy lụi chậm, ăn mòn và nguội về than, không bao giờ mờ nhanh theo alpha.

- `flipbook.ts`:
  - ánh xạ thời gian hai tốc độ: tới khung `slowFrom` clip chạy ở `rate`, sau đó ở `slowRate` (`frameAt`, đời của sprite tính bằng `playLife`). Khung trộn theo thời gian (crossfade giữa hai khung kề nhau) đã có sẵn từ bản Dragonhold, nên clip chạy chậm không bị giật;
  - `setSharpen` (chế độ `rgba`): độ phủ đi qua một ngưỡng có nhiễu, nên khi hai khung đang trộn dở, hay ở lớp mờ mỏng của clip, sprite vẫn là vật chất hoặc bị ăn mòn hẳn, không thành màn nhìn xuyên trên đá sáng;
  - đã ghi vào `docs/SYNC_DEBT.md`.
- Nhịp trước → sau (tính từ tham số, kiểm bằng bài test và dải ảnh):

| Lớp | Trước | Sau |
|---|---|---|
| Hoa sen va chạm phím 1 | 0,67 s (khung 1–16 ở ×1,25) | 1,15 s: khung 2–7 ở ×1,25 (0,22 s), khung 7–15 ở ×0,48; ăn mòn từ 0,6 đời |
| Hoa sen phát chiêu | 0,60 s | 1,02 s |
| Hoa sen kiếm đầu phím 7 / cú đập đất của kiếm đầu | 0,64 / 0,73 s | 1,06 / 1,18 s |
| Hoa sen cắm kiếm | 0,60 s | 0,98 s |
| Ngọn lửa sụp khi chết | 0,35 s | 0,51 s |
| Hoa sen trên không (kiếm hiện, kiếm rời vai) | 0,56 / 0,49 s | 0,72 / 0,67 s |
| Lửa đất | 1,56 s | 2,94 s: vòm lưỡi lửa ngay, rồi co, tối dần và tàn thành than |
| Tàn lửa (bùng / bốc lên từ đất / văng) | 0,7–1,6 / 1,0–1,9 / 0,35–0,7 s | 0,9–2,0 / 1,3–2,4 / 0,44–0,88 s (sông phím 7: 0,39–0,77 s) |
| Tàn lửa bốc lên khi lửa đất tàn | từ 1,1 s | từ 1,9 s |
| Đất cháy (một đòn / nhát kết) | 3,4 / 4,2 s, ăn mòn từ 1,7 s | 5,2 / 5,6 s, ăn mòn từ 3,2 s; vết nứt than hồng nguội trong ~4 s |
| Nhát chém lửa | theo hình: 0,88 s | đồng hồ riêng sau khi quét: giữ 0,34 s, ăn mòn 0,6 s, hết ở 1,2 s (Metal giữ 0,22 s và 0,4 s) |
| Đường cắt cháy / lưỡi lửa dọc đường cắt | 0,6 / 0,5 s | 0,85 / 0,8 s |
| Đường nóng chảy của nhát kết / dòng lửa thấp | 2,4 / 2,0–2,5 s | 3,0 / 2,6–3,2 s |
| Vòng lửa cắm kiếm / vòng áp suất | 0,42 / 0,24 s | 0,62 / 0,30 s |
| Khói / tro | 1,3–1,8 / 1,1–1,8 s | 1,8–2,5 / 1,4–2,2 s |

- Phím 7 vẫn đọc được: quá 28 hoa sen đang sống thì hoa sen mới lưu ít hơn, tới nhịp cũ khi sân gấp đôi; lửa đất cũng vậy khi quá 12. Sông kiếm (đòn nhỏ) không có hoa sen, tàn lửa của nó chỉ dài thêm 10 %, ngắn hơn phím 1 và kiếm đầu. Trên khung phím 7 lúc săn (`k7c-090`, `k7c-150`, `k7-150`) thú và chữ số vẫn rõ, không thành màn lửa.
- Pool (đo bằng cách vá prototype của đúng các module lab dùng, phím 1, phím 7, K5, camera chơi):
  - `fire-burst` 96 → 128 ô (đỉnh 89 ở K5, 84 ở phím 7 Ultra);
  - `ash` 160 → 1 024: **trước vòng 3 pool tro đã đầy ở phím 7 và K5, bỏ ~610–680 vảy tro mỗi lần** (lỗi có sẵn); đỉnh nay 785–830;
  - mọi pool của Fire bỏ hoặc ghi đè 0 lần ở High và Ultra (`demand-after-{high,ultra}.json`): tàn lửa đỉnh 1 785 / 1 831 trên 2 560, điểm lửa 87 trên 256, đất cháy 32 trên 64, lửa đất 16 trên 32.
- Dải thời gian: `tmp/shots/element-fire/r3/sheet-linger.jpg`. Hàng trên: hoa sen, tàn lửa, lửa đất và đất cháy ở đòn đầu phím 1 (camera gần), đá sáng và đá tối, trước và sau. Hàng giữa: nhát chém lửa, đường cắt, cắm kiếm và lửa đất của nhát kết phím 7. Hàng dưới: phím 1 ở camera chơi.
  - Trước: hoa sen đầu đã vỡ ở 0,6 s và hết ở ~0,8 s; lửa đất hết ở ~1,5 s.
  - Sau: hoa sen còn đầy ở 0,6 s, cháy lụi tới ~1,15 s; lửa đất còn cháy ở 2 s, tàn ở ~3 s; nhát chém lửa còn thấy ở 1 s.

### 1. Va chạm phím 1 trên đá sáng (`ee1a45d`)

- Ẩn từng lớp ở `k1c-008`: hoa sen gánh 45 % phần nhạt, chấm trắng `dot` 33 %, lõi cộng sáng của nhát cắt 24 %, lửa đất 10 %, dải lửa của vệt (ngoài phạm vi) 12 %.
- Sửa:
  - `FlipbookPool.setGrade`: phần trắng nóng rộng của clip (độ trắng = kênh nhỏ nhất ÷ kênh lớn nhất) vẽ bằng vàng đặc (tuyến tính `[0,9, 0,5, 0,09]`, ≤ 0,9 một kênh); chỉ phần trắng nhất, sáng nhất (độ trắng > 0,9) còn trắng. Lõi mảnh nên chỉ lõi bloom;
  - gốc sprite tan vào đất cũng đi qua ngưỡng ăn mòn (trước đó là một dải nhìn xuyên dọc mặt đất);
  - hoa sen va chạm mở từ khung 2 (khung 1 chỉ là viền mỏng), cùng tốc độ; lửa đất từ khung 3 (các khung đầu là một chỏm vàng sáng phẳng);
  - nhát cắt: lưỡi liềm vật chất màu hổ phách–son (`SpritePoolOptions.matte`: alpha cắt rõ từ tấm mềm; chỉ pool nào xin mới biên dịch, chương trình của Metal không đổi) với một đường vàng mảnh bên trong, dưới ngưỡng bloom.
- Số đo (đá sáng, phần nhạt, khung của `PLAN=fixes`, gồm cả mục 2 và mục 6):

| Khung | Trước | Sau |
|---|---|---|
| `k1c-008` | 53,6 % | **4,5 %** |
| `k1c-040` | 16,4 % | 3,4 % |
| `k1-010` | 15,2 % | 1,6 % |
| Lớn nhất ở mọi khung trúng đòn và bay của phím 1 | 53,6 % | 4,5 % |

- Đá tối: lớn nhất 28,1 % → 2,8 %.

### 2. Điểm lửa thay quả cầu trắng (`38c16a1`, `2623274`)

- `FirePointPool` (`src/view/skills/fire-points.ts`), mô phỏng giải tích trên GPU, một lệnh vẽ, không cấp phát; pool đầy thì bỏ điểm mới, không cắt điểm đang sống:
  - một lõi nhỏ (≤ 0,3 m, phần duy nhất cộng sáng và HDR) trong một ngôi sao lưỡi lửa: tim hổ phách, nguội về son ở đầu lưỡi, viền bồ hóng mảnh; thân là vật chất (trộn thường, ≤ 0,9 một kênh) nên đậm trên đá sáng;
  - mỗi lưỡi một độ dài, hơi xoáy, mép rung; sáng đủ ngay khung đầu, lưỡi bắn ra trong ~60 ms, rồi nguội (lõi tắt trước, thân về than) và ăn mòn từ đầu lưỡi vào.
- Dùng ở va chạm phím 1 (tầm 0,75 m), phát chiêu, kiếm hiện và rời vai, cái chết (tới 1 m), kiếm đầu, đòn nhỏ của sông kiếm, cắm kiếm. Mọi điểm có tầm < 0,95 m, lõi < 0,3 m.
- Lần đầu lõi vẫn trắng ×3,2: ở nhát kết (`k7c-215`, 194 điểm cùng sống) bloom của lõi lại thành những quả cầu trắng, gánh 37 % phần nhạt của khung. Commit `2623274` đổi lõi thành vàng trắng `#FFE2A0`, ×0,45–1,35, bán kính 0,11–0,22 m, chỉ hiện khi còn nóng.
- `k7c-215` trên đá sáng: phần nhạt 15,6 % → 4,5 %; điểm ảnh trắng ánh hồng cả khung 22 276 → 3 033.

### 3. Vòng áp suất và vòng lửa cắm kiếm (`ee67678`)

- `heat-rings.ts` (chỉ Fire dùng):
  - bề rộng đổi theo góc (0,45–1,55 lần) và mép rung; nhiễu đi qua toạ độ của chính vòng tròn, không có đường nối;
  - lưỡi lửa liếm ra ngoài: 26 ô quanh vòng, mỗi ô một lưỡi dài tới ~1,9 lần bề rộng dải, ngắn lại khi nguội, nhọn đầu, rung và chập chờn, hổ phách ở gốc nguội về son ở ngọn;
  - đường nóng mảnh (phần duy nhất cộng sáng) đứt thành đoạn và tách ra khi nguội;
  - lớp bồ hóng dày ở mép trong, mảnh ở mép ngoài;
  - nguội không đều: có cung giữ sáng lâu hơn, cung nguội hơn vỡ trước;
  - dải nằm ở 0,68 của tấm (chừa chỗ cho lưỡi lửa).
- Bộ hệ cho tàn lửa rơi ra từ vòng khi nó mở: trong mặt phẳng camera ở tay, trên mặt đất quanh chỗ cắm kiếm.
- Vẫn là vật chất trên lớp bồ hóng nên đậm trên đá sáng: `k1t-068` phần nhạt 4,9 % → 4,2 %; `k1t-066` 2,9 % → 1,0 %.

### 4. Khung đồ hoạ (`a0fb139`)

- Chỉ trong chương trình `ROLES` (của Fire; khung của Metal vẫn chương trình cũ):
  - `fireBurst`: một chùm lưỡi lửa quanh chỗ trúng, mỗi lưỡi một độ dài, thuôn nhọn, liếm theo hình chữ S về ngọn, mép chập chờn, quanh một tim nhỏ, có viền;
  - `fireSparks`: những hạt tàn tròn thưa văng ra ngoài chùm.
- Khung cục bộ (F15): chính chùm đó, tim trắng vàng nhỏ, thân hổ phách, ngọn son, viền bồ hóng mảnh, tàn hổ phách. Thú bị trúng là bóng màu gỉ sẫm trong thân chùm (màu đen ở đó đọc thành vết mực), viền vàng; lưỡi liềm của đòn bằng vàng. Vẫn dài 3 khung.
- Khung đảo màu (F201): ở chỗ trúng là 16 bóng lưỡi lửa bằng bồ hóng mọc từ một khoảng trống quanh tim, cùng tàn lửa hổ phách trên nền son (ánh sáng của khung đảo màu là màu tối), thay cho vệt mực bắn.
- Không có khung nào nhạt: F15 phần nhạt 9,4 % → 7,7 % (đá sáng), F201 0 %.

### 5. Đất cháy (`3ea6a47`)

- Trước: than mềm, alpha 0,6 ở tim và ~0,2 ở mép; trên đá sáng đọc như vệt bẩn nâu xám.
- Sau (`ground-decals.ts`, nhánh `PROCEDURAL`, chỉ Fire dùng):
  - mép rõ nhưng không đều: một khối bị làm méo bằng nhiễu, viền phình thành thuỳ, không có tia nên không thành ngôi sao mực;
  - đặc tới tận mép (alpha của Fire 0,6 → 0,86, ở mép còn 0,78 phần đó);
  - một vành đá cháy nâu ấm có vệt toả ra từ chỗ đánh, một vòng than ngay trong mép, tim nâu bồ hóng tối với các đường nứt và đốm than hồng sáng rồi nguội như trước;
  - mọc ra từ tim, ăn mòn từ mép vào.
- Màu nâu giữ đủ tối để trên đá tối vẫn làm đá tối đi một chút (nâu sáng hơn thì trên đá tối đọc như vũng nước).
- Dư âm phím 1 (khung 60–240) trên đá sáng: phần nhạt lớn nhất 6,2 % → 2,2 %; giống máu gộp trên đá tối 1,84 % → 0,91 %. Trên ảnh, đất cháy trên đá sáng đọc rõ là đất cháy (tấm so sánh, hàng 5).

### 6. Thú cháy (`e8776dc`)

- Nguồn:
  - mép tan của thú trong lab là màu đòn cuối cùng, chuẩn hoá rồi lập phương (`herd.ts`). Màu đòn của sông kiếm Fire `0xf07020` thành `(2,4, 0,25, 0,01)`, tức màu san hô;
  - màu đòn của phím 1 là màu chớp của bảng màu pha về trắng; vành ×2,6 của nó và bóng một khung (lõi của dòng ×2,2) thành trắng hồng.
- Sửa (theo VFX_STANDARD §3, đòn mang màu kẻ tấn công):
  - `FoeStatus.flash` (ánh của bóng trúng đòn) và `.burn` (mép cháy khi giết: nóng, giữa, sâu, than) trong `element-kit.ts`;
  - Fire: bóng trúng đòn vàng hổ phách `[1,25, 0,58, 0,09]`; con thú bị giết cháy tan từ mép trắng vàng qua hổ phách tới cam, thân cháy thành than ngay sau mép (móc `death` vẫn rải tàn lửa và tro như trước);
  - `herd.ts` (chỉ lab): `LAB_BURN` chỉ biên dịch cho hệ có `burn`. Với Metal, chương trình sau tiền xử lý không đổi và mép vẫn theo màu kẻ giết. Đặt được cả trước lẫn sau khi model về;
  - màu đòn của Fire thành hổ phách: sông kiếm `0xf07020` → `0xffa030`, phím 1 → `0xffa030` (K5 `0xffb040`), nhát kết `0xffa850` → `0xff9a28` (mục 7).
- Game không dùng chung: thú trong game tan thành mực ở `crowd.ts`, tách khỏi bộ hệ, và Fire chưa vào bản build game. Dữ liệu của bộ hệ sẽ theo sang khi Fire vào game.
- Đếm cả khung (thú là lớp actor): điểm ảnh trắng ánh hồng `k1c-008` 40 113 → 184, `k1c-040` 11 043 → 413, `k7c-260` 7 443 → 29. Ở `k7c-260`, nạn nhân bị ghim cháy tan với mép vàng qua cam và than phía sau, không còn mép san hô (tấm so sánh, hàng 6).

### 7. Nhát chém lửa (`309db41`)

- Sống gợn vì mỗi điểm ảnh đọc tâm dải từ một mip thô của mặt nạ, theo các sợi xơ của nó. Lưỡi lửa lổn nhổn vì là nhiễu fbm.
- Sửa (`flame-slash.ts`):
  - bảng dải: tâm và nửa bề rộng của lưỡi liềm tại 128 điểm dọc cung, đo một lần từ ảnh của mặt nạ theo đúng cách shader làm, rồi làm mượt dọc cung bằng Gauss ±8 điểm. Mỗi điểm ảnh chỉ đọc một texture thay vì 24 lần đọc mip thô. Chưa đọc được ảnh (test, trước khi tải xong) thì shader tự đo như cũ;
  - lưỡi lửa ngoài mép nhìn thấy của lưỡi liềm (1,5 lần nửa bề rộng đo được): mỗi ô một lưỡi (96 ô dọc nhát chém, mỗi bên), dài 0,8–2,4 bề rộng mép (ngắn dần về hai đầu), nhọn, hơi đung đưa về ngọn, hơi ngả về sau, chập chờn, hổ phách ở gốc nguội về son, viền bồ hóng; chỉ ở sau đầu nhát chém;
  - dải vẽ rộng 1,7 lần lưỡi liềm để có chỗ cho lưỡi lửa; lưỡi liềm giữ nguyên cỡ.
- Đường nóng chảy của nhát kết và đường cắt trên thú lớn: vàng ×2 (trước là trắng vàng ×4,5 và ×3,6, rộng 0,42 m và 0,12 m, toả bloom kem trên đá sáng: 48 % phần nhạt của `k7c-215` sau mục 2); đường của nhát kết rộng 0,3 m.
- Nhóm nhát kết và sau đó trên đá sáng: phần nhạt lớn nhất 15,6 % → 4,9 %, trung vị 5,9 % → 1,3 %.

### Các cổng (đo sau cả 7 mục, `309db41`)

- **Metal không đổi: đạt.** 85/85 khung giống hệt từng bit so với `cff975b` (AE 0): 21 khung `lab-element-parity.mjs` (`?element=metal`, có K5 và các cái chết) và 64 khung Metal của `PLAN=fixes` (gõ, khung đồ hoạ, nhát chém, cắm kiếm).
- **Fire − Metal p95: đạt.** High 1920×1080, DPR 1, M4, tải 2,9–4,4; 6 vòng xen kẽ Metal và Fire, mỗi vòng `RUNS=2`, tức 12 lượt mỗi hệ; `lab-element-perf.mjs` xả hàng đợi GPU trước mỗi cửa sổ.

| Đoạn | Metal (trung vị / TB / tệ nhất) | Fire (trung vị / TB / tệ nhất) | Fire − Metal (trung vị / TB) | Lệnh vẽ Metal / Fire |
|---|---|---|---|---|
| Nghỉ | 8,70 / 8,18 / 9,0 | 8,70 / 8,07 / 9,5 | 0,00 / −0,11 | 34 / 34 |
| Phím 1 | 9,10 / 8,70 / 9,6 | 9,30 / 8,81 / 10,1 | +0,20 / +0,11 | 48 / 44 |
| Phím 7 săn | 10,30 / 9,98 / 10,9 | 10,40 / 9,72 / 11,1 | +0,10 / −0,26 | 54 / 55 |
| Phím 7 nhát kết | 10,55 / 10,61 / 13,8 | 10,55 / 10,23 / 13,7 | 0,00 / −0,38 | 51 / 55 |
| K5 | 10,60 / 9,93 / 10,9 | 10,50 / 9,93 / 11,0 | −0,10 / 0,00 | 54 / 57 |

  - Cổng ≤ 0,85 ms: đạt ở phím 1, phím 7 săn, nhát kết và K5 (lớn nhất +0,20 ms theo trung vị).
  - Trần 11,5 ms theo trung vị: đạt, cao nhất 10,55 ms.
  - Lượt tệ nhất của nhát kết vượt trần ở cả hai hệ (Metal 13,8, Fire 13,7 ms), như ở phần 4: đó là nhiễu của máy (tải 4,1–4,4 ở các lượt đó), không do Fire.
  - Khung lớn nhất: phím 1 của Fire có hai khung lẻ 17,0 và 14,5 ms ở 2/12 lượt (tải 4,1 và 3,6; p95 của hai lượt đó 10,1 và 9,9 ms). Metal lớn nhất 11,6 ms ở phím 1, 14,4 ms ở nhát kết. Chưa rõ nguồn hai khung lẻ đó; p95 không đổi.
  - Lệnh vẽ của Fire thêm 1–4 lệnh (điểm lửa, vòng, tàn lửa).
- **Phím tới phát chiêu: đạt.** Máy dò cho VFX 0 ms, thân 33 ms ở cả 8 lần phát của Fire (phím 1 camera chơi, camera gần, gõ theo WPM; phím 7 hai camera; phím 1 và phím 7 của `PLAN=linger`), trên cả hai nền, như trước.
- **Bloom: đạt.** 0 điểm ảnh NaN hay Inf ở mọi khung (`maxNonFinite` 0, hai nền, cả hai kế hoạch).
- **Thân lửa sau tone mapping: đạt.** Sắc trung vị của thân ở mọi khung 22,1–35,7° (đá sáng) và 21,9–35,4° (đá tối), trong khoảng 15–40°; gần đỏ cảnh báo 0 %.
- **Phần nhạt trên đá sáng ≤ 15 % ở mọi khung của phím 1 và nhát kết: đạt.**

| Nhóm khung (đá sáng) | Lớn nhất trước → sau | Trung vị trước → sau |
|---|---|---|
| Phát chiêu | 5,9 % → 4,6 % | 3,9 % → 1,5 % |
| Lúc gõ (`k1t` 10–58) | 5,2 % → 3,9 % | 2,4 % → 1,7 % |
| Phím 1 trúng đòn và bay (8–40) | **53,6 % → 4,5 %** | 10,0 % → 2,1 % |
| Phím 1 dư âm (60–240) | 6,2 % → 2,2 % | 0,4 % → 0,2 % |
| Phím 7 nhát kết và sau (194, 205–360) | **15,6 % → 4,9 %** | 5,9 % → 1,3 % |
| Phím 7 khung đồ hoạ (15, 197, 201) | 9,4 % → 7,7 % | 0,8 % → 0,5 % |
| Phím 7 săn (10–186, báo cáo) | 19,1 % → 16,3 % | 6,9 % → 5,2 % |

  - Đá tối: phím 1 trúng đòn 28,1 % → 2,8 %, mọi nhóm khác ≤ 8,3 % (săn).
  - Phím 7 lúc săn: `k7c-090` 16,3 %, `k7c-060` 14,4 %; phần lớn là vệt kiếm sông, lưỡi furnace và vỏ lửa (ngoài phạm vi).
- **Điểm ảnh giống máu** (gộp, lớn nhất một khung; trước → sau):

| Nhóm khung | Đá sáng | Đá tối |
|---|---|---|
| Phát chiêu | 0,38 % → 0,36 % (1,2 → 1,2 %) | 1,51 % → 1,17 % (4,6 → 2,6 %) |
| Lúc gõ | 0,84 % → 0,59 % (1,2 → 0,9 %) | 3,19 % → 2,49 % (4,4 → 3,2 %) |
| Phím 1 trúng đòn và bay | 0,08 % → 0,08 % (1,1 → 0,4 %) | 1,87 % → 1,49 % (7,7 → 4,9 %) |
| Phím 1 dư âm | 0,13 % → 0,07 % (0,4 → 0,3 %) | 1,84 % → 0,91 % (5,6 → 2,4 %) |
| Phím 7 săn | 0,96 % → 0,85 % (1,6 → 1,5 %) | 0,75 % → 0,57 % (1,5 → 1,1 %) |
| Phím 7 khung đồ hoạ | 0,06 % → 0,04 % (0,7 → 0,7 %) | 0,18 % → 0,06 % (1,6 → 0,7 %) |
| Phím 7 nhát kết và sau | 0,13 % → 0,17 % (1,3 → 1,2 %) | 0,72 % → 0,53 % (2,5 → 1,0 %) |

  - Thêm, đếm cả khung (thú là lớp actor): điểm ảnh san hô (sắc 0–20°, bão hoà 0,3–0,8, sáng) ở `k7c-215` 26 132 → 5 753, `k7c-260` 5 574 → 4 067; trắng ánh hồng `k1c-008` 40 113 → 184.
- **Không nhảy hình (pool tràn 0): đạt.** Mọi pool của Fire bỏ hay ghi đè 0 lần ở High và Ultra (phím 1, phím 7, K5). Trước vòng 3, pool tro (160) đã bỏ 612–677 vảy ở phím 7 và K5; nay 1 024 ô, đỉnh 830. Pool `splash` của K5 (lớp gốc, 160) bỏ 7 hạt cả trước lẫn sau: ngoài phạm vi Fire.
- **Kiểm thử và build: đạt.** `pnpm test` 737/737 (81 tệp; thêm 6 bài trong `tests/view/element-layer.test.ts`: nhịp lưu, va chạm phím 1, điểm lửa, vòng, thú, nhát chém; bài đất cháy sửa theo hình mới); `tsc` và `pnpm build` xanh; `verify-kit` 73 tệp; `dist` vẫn là `main-XrAzOVU-.js`, `swords-CpZ2rKAM.js`, không có mã lab hay Fire.

### 8. Đo thêm, không chặn

- Phím 7 với Fire ở Ultra (1920×1080, DPR 1, 3 vòng xen kẽ, 6 lượt mỗi hệ, tải 3,0–5,5): p95 trung vị và lượt tệ nhất:
  - săn: Fire 18,85 / 19,7 ms, Metal 18,70 / 19,3 ms;
  - nhát kết: Fire 20,65 / 22,8 ms, Metal 21,05 / 23,0 ms;
  - (để so: nghỉ 14,05 ms, phím 1 Fire 16,10 và Metal 14,80 ms, K5 Fire 18,90 và Metal 18,15 ms; mẫu nhỏ, phím 1 lệch +1,3 ms theo trung vị, +0,75 ms theo trung bình).
  - Ultra đắt hơn High ở cả hai hệ (nghỉ đã 14 ms), nên Ultra trên M4 không giữ 60 Hz với phím 7 dù Metal hay Fire.
- Nhu cầu pool ở phím 7 Ultra: hoa sen 84/128, tàn lửa 1 831/2 560, điểm lửa 73/256, đất cháy 32/64, lửa đất 16/32, tro 786/1 024; 0 bỏ.
- Nhát kết ở High, lượt tệ nhất: Fire 13,7 ms (khung lớn nhất 14,2), Metal 13,8 ms (14,4).

### Tấm ảnh và số liệu

- `tmp/shots/element-fire/r3/sheet-linger.jpg`: dải thời gian của mục 0 (khung 0, 6, 12, 24, 36, 48, 60, 90, 120, 180 sau đòn trúng), trước và sau, đá sáng và đá tối.
- `tmp/shots/element-fire/r3/sheet-before-after.jpg`: một hàng một mục (0 `k1h-h060`, 1 `k1c-008`, 2 `k7c-215`, 3 `k1t-068`, 4a `k7-015`, 4b `k7-201`, 5 `k1c-180`, 6 `k7c-260`, 7 `k7c-240`). Mỗi hàng có trước và sau trên đá sáng, rồi trước và sau trên đá tối.
- Số liệu trong `tmp/shots/element-fire/r3/`:
  - `gates-{before,after}-{light,dark}.json` (từng khung), `gates-summary.json` (theo nhóm);
  - `fire-{before,after,lb,la}-{light,dark}.json` (phím tới VFX, bloom, trạng thái màn hình);
  - `demand-{before,after}-{high,ultra}.json` (pool), `parity-metal.json`;
  - `perf-high/`, `perf-ultra/` (thời gian khung, `perf-summary.json`);
  - `evidence/iso/` (danh sách lớp khi ẩn từng lớp).
- Khung thô của tôi đã xoá (giữ tấm, JSON); server và bản xuất `tmp/r3-before` đã dọn.

### Còn lại

- Chưa có giám khảo mù hay anh duyệt: mọi phần ở đây vẫn là tạm, chưa qua 8,5. Cần video mới cho anh xem nhịp lưu lâu hơn (chưa làm trong lượt này).
- Phím 7 lúc săn trên đá sáng vẫn có khung nhạt quá 15 % (`k7c-090` 16,3 %, trước 19,1 %): phần lớn là vệt kiếm sông, lưỡi furnace và vỏ lửa, ngoài phạm vi (chờ thiết kế hào quang kiếm).
- Đất cháy trên đá tối đọc như đá nâu ấm hơi sáng hơn nền, có viền và vết nứt; trên đá sáng thì rõ là đất cháy. Muốn tối hơn trên đá tối thì cần một lượt trộn nhân (multiply) riêng cho vành nâu.
- Khung cục bộ hình chùm lưỡi lửa: đọc là lửa, nhưng các lưỡi cong cùng chiều nên hơi giống chong chóng hay bông hoa. Lưỡi lửa của nhát chém đều và rõ nhưng hơi giống hàng răng cưa; có thể thêm lưỡi phụ xen kẽ.
- Đuôi lửa đất (các khung cuối là vòm khói nâu) ở ~2,5–3 s trên đá sáng là một vòm nâu cam sẫm; đọc là lửa tàn, chưa đẹp nhất.
- Ở nhát kết, nhiều điểm lửa của các cái chết cùng lúc vẫn là những chấm vàng sáng (đã nhỏ và vàng, không còn quả cầu trắng).
- Pool `splash` của K5 (lớp gốc trong `sword-skills.ts`, 160 ô) bỏ 7 hạt khi K5 chạy với Fire; đó là lớp của K5, ngoài phạm vi Fire, và bỏ hạt mới chứ không cắt hạt đang sống.
- Pass méo hơi nóng dùng chung: vẫn để làm cùng Water.

### Kiểm tra lại (lượt kiểm đối kháng sau phần 5)

Một lượt kiểm độc lập, không tin số của phần 5: server riêng không HMR (HEAD cổng 3131; `cff975b` xuất bằng `git archive`, `node_modules`, `art-src`, `public` là symlink, có `server.fs.allow`, cổng 3132), High 1920×1080, DPR 1, cùng `PLAN=fixes`, `PLAN=linger`, `WORLD=1`, đá sáng `#d6d0c2` và đá tối `#2a2c30`. Điểm ảnh hiệu ứng là chỗ khác hơn 0,10 ở một kênh so với khung ẩn VFX; nhạt, thân, giống máu như phần 5 (HSV, độ sáng là kênh lớn nhất). Đời của từng lớp đo bằng cách vá prototype của đúng các module lab dùng (ghi `life` và `delay` của mỗi lần sinh, số bỏ và số ô còn sống bị ghi đè), số instance sống mỗi khung qua `__THREE_DEVTOOLS__`. Số liệu, tấm ảnh, video: `tmp/shots/element-fire/r3check/` (số trước lần sửa của tôi trong `prefix/`).

**Lỗi rõ đã sửa:**

| Commit | Lỗi | Số đo |
|---|---|---|
| `67b2026` | Lửa chạy chậm vẫn giật và có bóng ma: hoa sen nay chạy 8,6 khung clip một giây, mà độ phủ trộn rồi mới làm sắc nên phần sắp mất của mỗi khung clip mờ trong suốt cùng lúc ở cuối khoảng (`k1c` khung 85: các lưỡi lửa thành màn nhìn xuyên trên đá sáng, khung 86 biến mất 29 442 điểm ảnh), nhịp giật đều mỗi ~7 khung (khung 85–86, 92–93, 99–100, 106) | Giữa hai khung, độ phủ của từng điểm ảnh chuyển sang khung sau ở thời điểm riêng theo nhiễu của clip (qua hàm logistic để trải đều), màu vẫn trộn theo thời gian; chỉ pool có `setSharpen` (hoa sen, lửa đất của Fire). Đoạn hoa sen tàn (`k1c` 76–106, đá sáng): biến mất một khung lớn nhất 29 442 → 16 423 điểm ảnh, đỉnh / trung bình của độ đổi mỗi khung 1,82 → 1,50, không còn màn trong suốt. Có test. Nhịp 7 khung vẫn còn nhẹ (xem dưới) |

**Đời của lửa so với `cff975b` (lời nhắn của anh):** bùng vẫn tức thì (điểm ảnh thân lửa ở khung trúng đòn đầu, camera gần, đá sáng: 29 nghìn → 123 nghìn), rồi lưu lâu hơn:

| Lớp | `cff975b` | HEAD |
|---|---|---|
| Hoa sen va chạm phím 1 / phát chiêu / trên không / sụp khi chết | 0,67 / 0,60 / 0,49 / 0,35 s | 1,15 / 1,02 / 0,67 / 0,51 s |
| Lửa đất / đất cháy (một đòn, nhát kết) | 1,56 / 3,4, 4,2 s | 2,94 / 5,2, 5,6 s |
| Tàn lửa phím 1 (trung vị / lâu nhất), phím 7 (trung vị) | 1,27 / 1,90, 1,18 s | 1,58 / 2,39, 1,49 s |
| Nhát chém lửa (khung còn hiện, camera chơi) | 67 khung (F195–261) | 86 khung (F195–280) |
| Đường cắt: tia nóng / đường nóng chảy nhát kết / lưỡi lửa dọc đường cắt / dòng lửa thấp | 0,60 / 2,4 / ≤ 0,50 / 2,10–2,28 s | 0,85 / 3,0 / ≤ 0,80 / 2,61–2,91 s |
| Cắm kiếm: vòng lửa trên đất / hoa sen (tính từ tham số) / vết cháy | 0,42 / 0,60 / 3,4 s | 0,62 / 0,98 / 5,2 s |
| Vòng áp suất / khói / tro (lâu nhất) | 0,24 / 1,79 / 1,80 s | 0,30 / 2,49 / 2,20 s |

- Điểm ảnh thân lửa sau đòn đầu (camera gần, đá sáng): +2 s 33 nghìn → 115 nghìn, +3 s 4 nghìn → 38 nghìn; sau nhát kết phím 7: +2 s 54 nghìn → 171 nghìn, +3 s 1,8 nghìn → 38 nghìn.
- Ở sân phím 7 đông, hoa sen sụp khi chết ngắn nhất 0,30 s (trước 0,35 s), nhưng khung 14–15 của `fire-burst` trống nên lửa nhìn thấy vẫn bằng trước; không phải lỗi.
- Không che sân phím 7: lúc săn, hiệu ứng phủ ≤ 4,9 % màn hình ở camera chơi (trước ≤ 4,3 %); thú và chữ số vẫn rõ (`k7-150`, `k7c-150`). Sau nhát kết F260 phủ 7,7 % (trước 4,0 %) vì nhát chém còn cháy.

**Các cổng (đo trên `67b2026`):**

- **Metal không đổi: đạt.** 85/85 khung giống hệt từng byte so với `cff975b` (21 khung `lab-element-parity.mjs`, 64 khung Metal của `PLAN=fixes`), cả trước và sau `67b2026`. Lần chạy parity đầu tiên ngay sau khi khởi động lại server lệch ở 21 khung (116–16 158 điểm ảnh): kịch bản chỉ chờ 1,5 s cho texture, server nguội tải chậm hơn; chạy lại trên server đã nóng thì giống hệt. Đó là lỗi của kịch bản đo, không phải của game.
- **Fire − Metal p95: đạt.** 6 vòng xen kẽ, `RUNS=2`, 12 lượt mỗi hệ, xả GPU trước mỗi cửa sổ. Trung vị / trung bình: nghỉ +0,10 / +0,04, phím 1 +0,30 / +0,10, phím 7 săn +0,20 / +0,10, nhát kết +0,35 / −0,03, K5 +0,50 / +0,24 ms (cổng ≤ 0,85). Trước `67b2026` (cùng cách đo): −0,35 / −0,53, −0,40 / −0,64, −0,15 / −0,27, −0,40 / +0,04, +0,20 / −0,09. Lệnh vẽ Metal / Fire: 34/34, 48/44, 53/55, 51/55, 54/57.
- **Trần 11,5 ms: đạt.** Trung vị p95 cao nhất 8,3 ms (K5 Fire; trước `67b2026` 10,5 ms, máy lúc đó tải nặng hơn). Lượt tệ nhất 11,8 ms (Metal, nhát kết), Fire 10,0 ms; trước đó Fire 12,1, Metal 11,6 ms ở nhát kết. Khung lớn nhất Fire 10,8 ms (trước 14,8 ms, lúc săn).
- **Phím tới phát chiêu: đạt.** VFX 0 ms, thân 33 ms ở cả 8 lần phát của Fire, hai nền.
- **Bloom: đạt.** 0 điểm ảnh NaN hay Inf ở 178 khung.
- **Thân lửa sau tone mapping: đạt.** Sắc trung vị 22,1–35,7° (đá sáng), 21,9–35,4° (đá tối); gần đỏ cảnh báo 0 %.
- **Phần nhạt trên đá sáng ≤ 15 % ở mọi khung phím 1 và nhát kết: đạt.** Phím 1 lớn nhất 4,6 % (`k1-006`), nhát kết 4,9 % (`k7-215`), dải lưu 5,0 %, khung đồ hoạ 7,8 % (`k7-015`). Lúc săn `k7c-090` 17,2 % (chỉ báo: vệt kiếm sông, lưỡi furnace, ngoài phạm vi).
- **Điểm ảnh giống máu: không đọc thành máu.** Đá sáng gộp ≤ 0,84 %, lớn nhất một khung 1,5 %; đá tối gộp ≤ 2,5 % (lúc gõ), lớn nhất 3,6 % (`k1-040`, viền đỏ sẫm gần đen).
- **Không nhảy hình: đạt.** Ở High và Ultra (phím 1, phím 7, K5), mọi pool của Fire bỏ 0 và cắt 0 sprite còn sống. Đỉnh: hoa sen 89/128, lửa đất 16/32, đất cháy 32/64, vòng 7, tro ≤ 980/1 024 (gộp cả `splash` của K5, cùng texture). Chỉ pool `splash` 160 ô của K5 (lớp gốc) bỏ 7 hạt. Ở `cff975b` pool tro 160 ô bỏ 612 vảy ở phím 7 (677 ở K5, gộp cả `splash`): đúng như phần 5 nói.
- **Thay, không chồng: đạt.** Khi chọn Fire, 22/22 pool phát hạt của Metal (những pool có phát khi chọn Metal) im ở phím 1; ở phím 7 im 22/23, pool còn lại là 88 tia vệt kiếm sông một khung (ngoài phạm vi). Phần dùng chung: ấn và vòng dưới chân (cùng mesh, nhánh `SOLID`), kiếm, impostor kiếm.
- **Kiểm thử và build: đạt.** `pnpm test` 738/738 (81 tệp, thêm 1 bài). Lần chạy đầu khi máy tải 18 có một bài đo giờ của `src/sim` (`beasts-stage`, 0,72 so với 0,6 ms) trượt; chạy riêng 3/3 đạt, chạy lại cả bộ 738/738. `tsc`, `pnpm build` xanh, `verify-kit` 73 tệp; `dist` vẫn `main-XrAzOVU-.js`, `swords-CpZ2rKAM.js`, không có mã lab hay Fire.

**Điểm nhìn, chưa sửa (cho anh và giám khảo; ảnh trong `r3check/evidence/`):**

- Nhát chém lửa: các lưỡi lửa tam giác đều nhau đọc như lưỡi cưa hay sống lưng khủng long (`k7-240`, `k7c-215`). Ở ~4 khung cuối, nó nguội thành một dải bồ hóng tối có gạch đứt rồi tắt hẳn (`k7c` 266–270): gần như nhảy hình. Ẩn lớp `fx-flame-slash` ở khung 269 thì dải đó mất.
- Điểm lửa: ở kiếm đầu, đầu lưỡi bồ hóng mảnh cong như chân nhện (`k7c-090`); khi nguội thành sao biển hay chong chóng cam (`k7c-260`); ở chỗ cắm kiếm, lõi vàng vẫn toả thành một quả cầu sáng mềm ~90 điểm ảnh ở camera gần (ảnh tĩnh phím 7 F260).
- Vòng lửa trên đất khi cắm kiếm: các cung còn lại lúc vòng vỡ là những vệt son phẳng (`#C14801`, sắc 22°) nằm trên đá, ở camera gần đọc như vệt sơn đỏ hay vệt máu (`k7c-240`; ẩn lớp vòng thì mất).
- Lửa đất ở pha tàn là vòm cam phẳng có đáy thẳng, hai vòm chồng nhau như lát cam (`k1c-150`). Trên đá tối, đất cháy đọc như vũng nâu sáng hơn nền.
- Hoa sen lúc tàn: lưỡi lửa cuối nguội thành bóng lửa nâu gỉ, hơi xỉn (`k7c-150`).
- Sau `67b2026`, hoa sen chạy chậm vẫn có nhịp nhẹ mỗi ~7 khung (đỉnh / trung bình 1,50; trước 1,82). Mượt hẳn thì cần clip có nhiều khung hơn hoặc nội suy chuyển động giữa hai khung.

**Video và ảnh (cho điều phối, chưa gửi anh):**

- `tmp/shots/element-fire/r3check/fire-r3-play.mp4`: 14,3 s, camera chơi, phím 1 gõ ở 45 WPM (6 s, tới khi lửa đất tàn), rồi phím 7 (8,3 s, tới khi nhát chém và lửa đất của đường cắt tàn); H.264 1920×1080 60 fps, tốc độ thật, có tiếng (118 lượt; trung bình −12,8 dB, đỉnh −0,3 dB); 11,9 MiB.
- `tmp/shots/element-fire/r3check/fire-r3-close.mp4`: 19,0 s; phím 1 gõ ở góc nhìn gần của người chơi, phím 1 gõ với camera gần trên chỗ trúng, phím 7 với camera gần trên sân; có tiếng (128 lượt; −13,5 / −0,1 dB); 20,2 MiB.
- Mỗi đoạn một phụ đề tiếng Anh, không chồng nhau. `stills-r3-light-dark.jpg`: cùng bố cục với `fixes/stills-fixed-light-dark.jpg` (phím 1 F88, F180; phím 7 F186, F260; đá sáng và đá tối).
- Khung thô của tôi đã xoá (giữ tấm, JSON, video, `evidence/`); server và bản xuất `tmp/r3check-before` đã dọn.
