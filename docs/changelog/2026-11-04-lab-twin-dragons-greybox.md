# Lab kỹ năng: hộp xám của Song Long Hí Châu (Twin Dragons, One Burning Pearl), 04/11/2026

**Lý do:** sáng 04/11 anh chọn hướng **"A · Song Long"** trong ba hướng chiêu rồng (`docs/games/tu-tien/skills/DRAGON_SKILL.md` ở repo cha, §3 A). Bước tiếp theo theo §6 bước 1 là **hộp xám**: đường đi và khối trúng trong sim và lab, không hình, rồi đo bằng bot các chỉ số của §2 luật 4. Thiết kế đã được ChatGPT và Gemini góp ý hai lượt chéo (`docs/games/tu-tien/skills/source/dragon-skill-*.md`); bản này dựng đúng kế hoạch đó.

**Tóm tắt:** Kiếm ô 2 có thêm một biến thể thử, `twin-pearl`, sau một cờ **tắt mặc định**. Bật cờ thì ô 2 phủ cả hai đường đất, cả hai đường trời và vùng trước Trận Tâm. Tắt cờ thì game giữ đúng từng byte như HEAD `1a78a82` (đã chứng minh ở mục 6).

## 1. Đã làm, theo commit

| Commit | Nội dung |
|---|---|
| `e91a787` | Sim: `src/content/data/twin-pearl.ts` (số thử), `src/sim/twin-pearl.ts` (đường, khối trúng, sổ trúng), `src/sim/skills.ts` (cờ, chuyển ô 2, bước mỗi tick), `tests/sim/twin-pearl.test.ts` (14 phép thử) |
| `7ee98f0` | Lab: `src/lab/twin-pearl-greybox.ts` (thế giới sim thật, triều thú dày, vẽ khối trúng bằng hình trong mờ, nhãn pha, số mỗi lần tung), `src/lab/skills-main.ts` (cờ `?key2=twin-pearl`, phím và nút, `__lab.twinPearl`, biên dịch sẵn, trễ mở âm thanh tới sau khung đầu) |

Không sửa canon, `docs/games/tu-tien/00-canon.md`, `school-kiem.ts`, `rules.ts`, `src/kit/**` hay game khác.

## 2. Cờ, và cách tung

- **Sim:** trường `swordKey2: "twin-pearl"` trong `ReplayHeader` (khai báo bằng `declare module` trong `src/sim/twin-pearl.ts`). Không có trường đó thì ô 2 vẫn là Nhất Tuyến Xuyên Vân.
  - `createSkillsState` chỉ thêm `skills.twinPearl` khi header xin cờ.
  - `resolveCast` gửi ô 2 sang `resolveTwinPearl`; `stepSkills` gọi `stepTwinPearl` sau đòn chờ và vùng.
  - Header mặc định (`createReplayHeader` của app, `testHeader` của test) không có trường này. App chưa có cách bật cờ.
- **Lab:** `/skills-lab.html?key2=twin-pearl`.
  - Phím `2`, hoặc nút "2 · Twin Dragons, One Burning Pearl · grey box (sim volumes)": tung ngay trên khung của phím.
  - `N`: đổ lại triều thú. `V`: thả Thiết Bối Lang Vương ở cổng A. `R`: dựng lại tất cả.
  - Từ script: `__lab.twinPearl.cast()`, `.reports()`, `.refill()`, `.boss()`, `.tick()`, `.alive()`.
- **Bot** (ngoài Git): biến thể `@twin-pearl` của `tmp/skill-reach/bot.ts`, ví dụ `node_modules/.bin/tsx tmp/skill-reach/bot.ts <thư mục> w45a97@twin-pearl 1 10`.
  - Header của trận có cờ.
  - Bot gõ từ ô 2 khi còn thú sống bất kỳ đâu, vì chiêu phủ cả sân.
  - Kết quả có thêm `twinCasts`: số liệu của từng lần tung.

## 3. Ánh xạ khung sang tick

Sim chạy 60 Hz (`SIM.tickHz`), đúng nhịp khung của tài liệu thiết kế. Vì vậy **khung Fn = tick thứ n sau tick Cast được giải** (một đổi một). F0 là tick của phím đúng cuối: Cast giải trong lệnh phím, rồi `stepSkills` cùng tick đánh luôn F0.

| Pha | Khung = tick sau F0 | Khối trúng trong sim | Loại đòn |
|---|---|---|---|
| Phóng | F0 | Hộp giữ 8 × 8 m trước Trận Tâm: x ±4 m, từ tâm (0; 0) lên 8 m về phía cổng | chạm |
| Phóng | F1–F2 | Hai hộp chạm, mỗi đường một hộp, quanh con thú gần Trận Tâm nhất của đường đó ngoài hộp giữ: dài 4 m theo đường, rộng 4,4 m; chọn ở F1 | chạm |
| Bay | F3–F42 | Hai đầu rồng chạy đường S trên mặt đất, từ điểm gặp lên tới cổng; thân là trụ r 1,4 m, cao 0,2–1,5 m; mẫu đường cách 0,5 m | hành lang |
| Bay | mỗi mẫu tới 54 tick sau khi đầu qua (0,9 s) | Vệt sau thân vẫn sát thương; mẫu cuối ở cổng qua lúc F42, cháy tới F96 | hành lang |
| Bay | F30–F50 | Đuôi quét mỗi đường trời, từ góc xa (±20; −18) vào mép Trận Tâm; trụ r 2,5 m, cao 2,5–6 m | hành lang |
| Bay | F3–F42, treo tới F51 | Ngọc bay từ kiếm tới điểm gặp | không trúng (chỉ hình) |
| Trúng | F43–F50 | Nhịp gầm: không có khối mới; vệt và đuôi trời vẫn trúng | |
| Trúng | F51–F71 | Hoa sen ở điểm gặp. Đầy ở hai cánh dài (rộng 4,4 m quanh đường gốc của mỗi đầu, dài 13 m từ điểm gặp) và trong hộp giữ; nửa ở phần còn lại trong r 9 m | hoa sen |
| Dư âm | F72–F96 | Chỉ còn vệt ở gần hai cổng | |
| Dư âm | tới F300 | Không trúng; chỉ có thời gian của lab | |

- Hoa sen sống 21 tick (F51–F71), đúng bằng khoảng trúng lại 20 tick cộng một. Nhờ vậy một con bị vệt trúng muộn tới F51 vẫn còn được nhận đòn hoa sen.
- Khối mặt đất chỉ trúng thú có độ cao ≤ 1,5 m. Khối trời chỉ trúng thú bay 2,5–6 m. Quạ (bay 4 m) vì vậy chỉ ăn đòn quét trời. Quạ bị Phong Ấn Võng kéo xuống đất thì thành thú mặt đất.

## 4. Đường đi lấy từ lưới đường

- **Mỗi đường** là chuỗi waypoint của trường dòng chảy (`field.ts`) từ cổng tới mép Trận Tâm:
  - cổng A: (−15; −17,75), khúc quanh trụ (−5,25; −9,25), mép (−0,99; −1,74);
  - cổng B đối xứng.
- **Điểm gặp** là trung điểm hai khúc quanh cuối của hai đường: **(0; −9,25)**. ChatGPT đề xuất tạm (0; −9) rồi "khớp theo lưới đường"; con số này là bản khớp đó.
  - Đường không có khúc quanh thì dùng điểm trên đường cách tâm 10 m.
  - Hình học được nhớ theo trường dòng chảy, nên dựng lại khi chướng ngại đổi. Nó là dữ liệu tĩnh, không nằm trong trạng thái được băm.
- **Đường S của đầu rồng:** điểm gặp → khúc quanh → cổng.
  - Đường thẳng dài 18,2 m; đường S dài **19,9 m**, nên đầu đi khoảng 0,51 m mỗi tick.
  - Mỗi đoạn chia số nửa sóng nguyên, khoảng 4 m mỗi nửa sóng. Độ lệch là 0,9 m × 4f(1 − f), xấp xỉ sin vì sim không dùng lượng giác. Lệch bằng 0 ở mỗi khúc quanh.
  - Hai đầu đối xứng gương, cùng phồng về phía cổng trước.
  - Tài liệu ghi "khoảng 26 m trong 40 khung": đó là khoảng cách thẳng từ người chơi tới cổng (25,8 m). Đề bài yêu cầu đầu rồng đi từ điểm gặp, nên đường ngắn hơn.

## 5. Số đã dùng (đều là số thử)

**Ngân sách sát thương giữ theo ô 2 hôm nay.** Đọc thẳng từ `school-kiem.ts`, không chép số:
- 2,5 W (225 máu ở K0) cho con trúng đầu tiên của lần tung;
- mỗi con khác tiếp theo −15 %, sàn 40 %. Thứ tự là thứ tự chạm lần đầu; trong một khối, con gần Trận Tâm nhất trước;
- Thế −20, hồi 8 s, từ 4–7 chữ: không đổi.

Số của tài liệu thiết kế chỉ chia phần của mỗi con theo loại đòn: **chạm 15 %, hành lang 45 %, hoa sen 40 %**. Hoa sen ngoài hai cánh và hộp giữ chỉ còn một nửa (20 %). Thế chia theo cùng tỉ lệ: 3, 9, 8.

Các luật khác:
- Mỗi con tối đa một đòn mỗi loại, các đòn cách nhau ≥ 20 tick, nên **tối đa 3 đòn một lần tung**.
- Mỗi khối mỗi tick là một đòn vùng (trần cụm bầy 60 % như mọi chiêu vùng).
- Đòn gõ bỏ qua giáp; M_q, M_hệ và nhóm cộng dồn áp như mọi chiêu.
- **Vương:** tối đa 1,5 W (135 máu ở K0) mỗi mã lần tung (`actionId` của Cast). Lần tung mới thì trần mới.
- Chiêu được giải khi trên sân có ít nhất một thú sống. Không có thú thì Cast giữ 3 s như mọi ô.

**Tổng một lần tung không có trần**, giống ô 2 hôm nay. Vì trúng nhiều con hơn nên tổng lớn hơn nhiều. Lúc khoảng 39 thú sống, trung bình mỗi lần tung gây 1 191 máu (13,2 W), trong khi ô 2 hôm nay trúng khoảng 2 con một lần.

## 6. Tắt cờ thì không đổi gì

**Golden:** `scripts/balance/golden.ts` vẫn là chỗ trống `TODO(lane-7)` nên repo chưa có test golden. Thay vào đó:
- Trước khi sửa sim, bot đo của SKILL_REACH chạy 9 hồ sơ × 4 seed (w30a97, w45a97, w60a97, w80a97, w45a90, standard, novice, fast, no-type) với `BOT_HASHES=1`. Mỗi trận ghi `hashWorld` và `hashLocal` sau mỗi 600 tick và lúc kết thúc (1 693 điểm băm), cùng toàn bộ số liệu của trận.
- Sau cả hai commit, chạy lại y hệt: **36/36 file kết quả trùng từng byte**.

**Test và build:**
- `vitest run`: 83 file, **767 test đạt**. Trước khi sửa là 753; thêm 14 test của `twin-pearl.test.ts`, gồm cả "tắt cờ: không có trường, ô 2 xếp đúng đòn đường thẳng".
- `node node_modules/typescript/bin/tsc --noEmit -p .`: sạch.
- `vite build`: đạt (`main`, `bench`, `tinh-tu`).
- `dist` không có mã lab: tìm `TwinPearlGreybox`, `twin-pearl-greybox`, `skills-main`, `skills-lab`, `LabHerd`, `window.__lab`, `keyToFirstHitMs` đều 0 kết quả. Mã sim của cờ có trong bản build (tắt sẵn).

## 7. Đo, phần đầu (bot 30–80 WPM, ngoài Git)

**Cách đo trận đông nhất** (`tmp/shots/dragon/greybox/dense.ts`):
1. Bot tắt cờ chơi từng trận (đúng game hôm nay).
2. Ở lúc đông nhất của mỗi đợt, dựng lại thế giới từ replay (`runLog`) và chỉ bật cờ trên bản sao này.
3. Tung ô 2 ngay tick đó, chạy tiếp khoảng 100 tick không lệnh nào khác, rồi đo.

6 hồ sơ (w30a97, w30a90, w45a97, w60a97, w60a90, w80a97) × 10 seed, 332 lần tung.

| Chỉ số (§2 luật 4) | Đích | ≥ 35 thú sống (30 lần) | 25–34 thú (125 lần) | 15–24 thú (177 lần) |
|---|---|---|---|---|
| Thú khác nhau bị trúng mỗi lần | 12–20 khi có khoảng 40 thú | **35,5** (32–44), 92 % số thú sống | 24,5 (18–32) | 19,1 (9–23) |
| Phần đường đi mỗi bên được phủ | | 100 % / 100 % | 100 % / 100 % | 100 % / 100 % |
| Sát thương trái/phải (cổng A/B), trung vị (min–max) | 40/60 tới 60/40 | 57/43 (41–67); 67 % số lần trong dải | 50/50 (18–76); 63 % | 54/46 (22–81); 49 % |
| Tỉ lệ quạ bị trúng | | 98 % (60/61) | 93 % | 100 % |
| Tới đòn đầu | ≤ 50 ms | F0 ở 27 lần, F1 ở 3 lần (0–17 ms) | F0 hoặc F1 | F0 hoặc F1 |
| Nhiều đòn nhất trên một con | ≤ 3 | 3 | 3 | 3 |

**Đọc bảng:**
- Tầm và hướng đã giải đúng lời anh: phủ trọn hai đường, hai cổng giữ cùng lúc, quạ bị quét, đòn đầu tức thì.
- **Số thú trúng vượt đích nhiều**: khoảng 9/10 số thú sống, so với đích 12–20.
- Chênh trái/phải ngoài dải ở khoảng một phần ba số lần. Lý do là số thú hai cổng lệch nhau lúc đó; chiêu phủ đều cả hai bên.

**Cả trận bật cờ, cùng hồ sơ** (`@twin-pearl`, 10 seed, các chỉ số của `BALANCE.md`). Mỗi ô: Thắng · S trung vị · P · I · Q trung vị · phe ta · phần ô 2 trong sát thương gõ.

| Hồ sơ | Tắt cờ (hôm nay) | Bật cờ |
|---|---|---|
| 30 WPM 97 % | 10 % · 0 · 71,0 % · 1,0 % · 77,4 % · 20,1 % · ô 2 25 % | **100 %** · 44,0 % · 47,3 % · 1,5 % · 59,1 % · 12,2 % · ô 2 **68 %** |
| 45 WPM 97 % | 0 % · 0 · 68,3 % · 0,5 % · 74,9 % · 17,8 % · 22 % | **100 %** · 46,8 % · 45,8 % · 2,4 % · 58,6 % · 10,8 % · **66 %** |
| 60 WPM 97 % | 0 % · 0 · 69,3 % · 0,6 % · 73,1 % · 15,9 % · 21 % | **100 %** · 56,2 % · 44,1 % · 3,4 % · 58,6 % · 9,9 % · **66 %** |
| 80 WPM 97 % | 30 % · 0 · 67,6 % · 0,8 % · 72,4 % · 14,9 % · 21 % | **100 %** · 59,2 % · 43,0 % · 2,5 % · 55,9 % · 9,3 % · **65 %** |
| Chuẩn (35 WPM 95 %) | 0 % · 0 · 72,3 % · 0,4 % · 76,7 % · 19,7 % · 24 % | **100 %** · 42,0 % · 49,5 % · 2,0 % · 61,3 % · 11,8 % · **67 %** |
| Mới (25 WPM 92 %) | 0 % · 0 · 74,5 % · 0,4 % · 83,1 % · 22,9 % · 28 % | **90 %** · 35,6 % · 52,2 % · 1,4 % · 64,2 % · 14,5 % · **69 %** |

- O luôn 0.
- Với số hôm nay, một chiêu ô 2 hồi 8 s gánh **khoảng 2/3 sát thương gõ**, và đưa mọi hồ sơ từ thua lên thắng 90–100 %. Rủi ro "ô 2 thành tuyệt kỹ thu nhỏ" của DRAGON_SKILL đã thành thật.
- P và Q đã về gần dải đích, nhưng S của người gõ nhanh (56–59 %) chạm mép trên dải Cân bằng.
- **Đây chưa phải cân bằng.** Phải cân cùng ngân sách, hồi chiêu và nhịp k, theo `BALANCE.md`.

## 8. Lab

**Hộp xám:**
- Lab chạy một thế giới sim thật với cờ bật, giữ ở chuẩn bị (không có đợt). Triều thú là của lab: khoảng 38 thú đất trên hai đường và 4 quạ, đổ thêm ở cổng mỗi 0,75 s. Trận Lực luôn đầy.
- Vẽ đúng khối của sim khi chúng sống, bằng hình xám trong mờ: hộp giữ, hộp chạm kèm tia từ kiếm, trụ đầu rồng, vệt sẫm dần theo tuổi, trụ trời, ngọc, đĩa và hai cánh hoa sen.
- Khối chỉ sống 1–2 tick thì để mờ thêm 0,3 s cho mắt kịp thấy.
- Thú là hộp xám; trúng lần 1, 2, 3 trong lần tung thì thành vàng, cam, đỏ; mỗi đòn lóe trắng 0,12 s.
- Có nhãn từng khối, dải pha ở trên (ví dụ "F34 · Travel: heads + sky sweeps (F30–F50)") và bảng số của lần tung cuối.
- Bầy đứng tạm cũ của lab ẩn trong chế độ này.

**Phím tới đòn đầu hiện trên màn:** đo từ `timeStamp` của phím tới lúc vẽ xong khung có đòn đầu, Chrome không giao diện, High, 1920 × 1080, khung rAF thật, phím thật qua CDP.
- Đo được **2,5–20 ms**, kể cả lần bấm đầu tiên của trang (10 lần trong `latency.json`, 6 lần trong `capture.json`, cùng thư mục bằng chứng dưới đây).
- Trước hai lần sửa, lần bấm đầu tốn 83–123 ms. Nguyên nhân không phải hộp xám: lần nhấn phím đầu tiên của trang tạo `AudioContext` của âm thanh lab (`sound.ts` `unlock`, 60–120 ms trên luồng chính).
- Nay việc tạo đó chờ tới sau khung của phím (`requestAnimationFrame` rồi `setTimeout`). Âm thanh lab vẫn mở: 34 file tìm thấy.
- Hình của hộp xám được biên dịch sẵn lúc nạp, cho cả bộ đệm của chuỗi hậu kỳ và màn hình.

**Bằng chứng** (ngoài Git, `games/immortality-cultivation/tmp/shots/dragon/greybox/`):
- `twin-pearl-greybox-sheet.jpg`: 10 khung F0, F1, F8, F20, F34, F42, F47, F52, F64, F90 ở camera chơi.
- `twin-pearl-greybox-3x-slow.mp4`: 20 khung trước phím và F0–F120 từng khung, chậm 3 lần.
- `numbers.json`, `measure/`: số bot; `golden-before/`, `golden-after/`: so tắt cờ; `capture.json`, `latency.json`: số của lab.
- Khung chụp thô đã xóa.

## 9. Chưa làm

- **Hình, VFX, âm thanh:** chưa có gì ngoài hình xám. Theo §6 bước 2–3: nghiên cứu mẫu rồng, ảnh nguồn đầu rồng 4 góc cho anh duyệt, ứng viên Firefly/Blender cho dải lửa, ngọc, hoa sen, dấu cháy, rồi âm thanh nhiều lớp.
- Nhịp gầm F43–F50, khựng đòn 50 ms, hạ nhạc nền, hiệu ứng màn hình theo bậc: đều là việc của phần nhìn, chưa dựng.
- **Cân bằng:**
  - số thú trúng gấp gần 2 lần đích 12–20;
  - ô 2 gánh 65–69 % sát thương gõ;
  - thắng 90–100 %.
  - Các nút có thể chỉnh, chưa đụng: bán kính thân, độ dài vệt, độ dài cánh và bán kính hoa sen, phần chia 15/45/40, sàn 40 %, trần tổng mỗi lần tung, hồi chiêu.
  - Cần anh quyết hướng trước khi cân.
- **Game thật:** app chưa có cách bật cờ; sim không phát `skill-fx` cho chiêu này (kiểu sự kiện chưa có giai đoạn nào hợp), nên bản game chỉ thấy số trúng chứ chưa thấy hình.
- `rulesHash` chưa phủ bảng `TWIN_PEARL`. Replay có cờ được nhận ra nhờ trường `swordKey2` trong header.
- Lab không giữ hồi chiêu 8 s, để anh bấm thử liên tục; trong sim và bot thì hồi chiêu vẫn đúng 8 s.
- Bot làn 7 (`scripts/balance/run.ts`) vẫn trống. Khi xong phải đo lại bằng nó.

## 10. Tái lập

Chạy từ `games/immortality-cultivation`:

| Việc | Lệnh |
|---|---|
| Test | `node_modules/.bin/vitest run tests/sim/twin-pearl.test.ts` (cả bộ: `node_modules/.bin/vitest run`) |
| So tắt cờ | `tmp/shots/dragon/greybox/golden-run.sh <thư mục>` rồi `cmp` với `golden-before/` |
| Đo lúc đông nhất và cả trận | `../../.local/bin/heavy.sh --cores=6 tmp/shots/dragon/greybox/measure.sh`, rồi `node tmp/shots/dragon/greybox/summarize.mjs` |
| Lab | máy chủ dev riêng (lượt này: `vite --port 3211`), mở `/skills-lab.html?key2=twin-pearl` |
| Chụp lab | `URL=http://127.0.0.1:3211/skills-lab.html ../../.local/bin/heavy.sh --gpu node src/kit/tools/cdp-run.mjs tmp/shots/dragon/greybox/capture.mjs --width=1920 --height=1080` (khung F0–F120 và 6 lần bấm thật) |
| Trễ phím | tương tự với `tmp/shots/dragon/greybox/latency-keys.mjs` |
