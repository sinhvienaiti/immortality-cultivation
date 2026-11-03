# Lab kỹ năng: lớp hệ và Sword × Fire (03/11/2026)

Anh chốt sáng 03/11 (canon D59): người chơi chọn **hệ** riêng với vũ khí, và "khi người chơi kết hợp cả vũ khí và hệ, ví dụ hệ hoả, thì hiệu ứng của vũ khí chủ đạo phải là lửa". Rồi "cứ làm lần lượt theo như plan": Sword × Fire trước, Sword × Water sau, trên cùng hình. Cùng ngày anh nhắc: mọi **tên** (tệp, thư mục, id, mô-đun, định danh trong mã, tên chiêu, phụ đề video) bằng tiếng Anh, tiếng Việt chỉ ở phần văn xuôi.

Thiết kế: `docs/games/tu-tien/skills/ELEMENT_LAYER.md` (repo cha). Luật cứng: **thay, không chồng**. Chọn Fire thì vẽ chính hình đó bằng bộ chất Fire; lớp Metal không vẽ bên dưới.

Tệp này ghi theo phần. Phần 1 là nền mã (bước 0, 1, 3 và phần mã của bước 4 trong brief). Phần dựng hình Fire cho phím 1 và phím 7 ghi tiếp ở dưới khi xong.

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
