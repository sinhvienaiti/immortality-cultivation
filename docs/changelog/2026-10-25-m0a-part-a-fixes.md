# 25/10/2026 — M0a: sửa sau đánh giá độc lập phần A (đầu phần B)

Người làm: chủ tích hợp (vai bước 0), đầu phần B của `docs/games/tu-tien/M0A_PLAN.md` (repo cha). Đầu vào: `tmp/part-a/result.json` (báo cáo của bước 0, các làn 1a, 2, 3, 5, 8, và bản đánh giá độc lập: `review.issues`, `review.part_b_followups`, yêu cầu đổi của từng làn). Lượt này chỉ sửa đúng các mục được giao; với các mục đó được phép sửa tệp của mọi làn. Gốc: `947bc5a`. Chưa push (việc của người điều phối).

## Commit của lượt này

| # | Commit | Việc |
|---|---|---|
| 1 | `e6592c0` | `tests/boundary.test.ts` nhẹ I/O: mỗi tệp đọc, phân tích, phân giải một lần |
| 2 | `ee04107` | `vite.config.ts`: `cacheDir` trên đĩa riêng của WSL khi repo ở `/mnt/*`; xóa thư mục `deps_temp_*` cũ |
| 3 | `ee6321e` | Canon D48: nghiêng mặc định 55° trong `rules.ts` `CAMERA`, `renderer.ts` `VIEW` đọc số đó |
| 4 | `78d8202` | `docs/SYNC_DEBT.md`: 11 dòng chép còn thiếu |
| 5 | `96f66ef` | Hợp đồng: gộp *module augmentation* vào `types.ts`, `world.ts` import thẳng `onLearnAhead`, `SeatHeader.flashEX1000`, ghi Linh Dịch vào `LANES.md` |
| 6 | `54e1941` | Số của Làn 8 vào `rules.ts` `TINH_TU`; một bộ thử dự phòng có nhãn ở `src/content/data/`; bỏ sổ cái tạm |
| 7 | `36d59f5` | Một "khoảng cách tới Trận Tâm" (`field.ts`) cho mọi nơi gọi, test hòa điểm canon §23.3 |
| 8 | `328205d` | `TypingRules` đã biên dịch của kit ra khỏi trạng thái có băm; test không số thực chạy với `words.ts` thật |
| 9 | `cd69514` | `deck.ts`: từ nền khởi đầu lạnh chỉ từ cấp nền trở xuống |
| 10 | `6c08138` | Test ranh giới chặt hơn, có tự kiểm |
| 11 | `51ff7f1` | `AGENTS.md`, `LANES.md`, `docs/README.md`: canon tới D49, góc 55° |
| 12 | (commit chứa tệp này) | Changelog này |

Mỗi commit có mã đều xanh `pnpm check` trên `/mnt/d` (cây thật, không phải bản sao trong `/tmp`), dưới `flock /tmp/tg-heavy.lock`, `VITEST_MAX_THREADS=4`: 43 tệp / 405 test ở commit 1–6, 44 / 409 ở commit 7, 45 / 411 ở commit 8, 45 / 412 ở commit 9, 45 / 413 ở commit 10; mỗi lượt `verify-kit` 73 tệp khớp, `tsc --noEmit` sạch, `vite build` ra 3 trang; mỗi lượt khoảng 100–120 s. Commit 4, 11, 12 chỉ đổi tài liệu, nên cây mã là cây đã kiểm ở commit ngay trước.

## Từng vấn đề của bản đánh giá

| # | Mức | Vấn đề (tóm tắt) | Đã làm | Commit |
|---|---|---|---|---|
| 1 | lớn | `pnpm check` đỏ trên `/mnt/d`: ca "never reaches kit/feedback/audio-cues…" của test ranh giới đi lại cả đồ thị import cho mỗi gốc qua 9P (76 s so với giới hạn 5 s) | `read()` nhớ theo đường dẫn tuyệt đối, `specifiers()` nhớ theo từng `Source`, `resolveFile()` nhớ theo đường dẫn đã phân giải. Giữ nguyên mọi khẳng định. Cả tệp còn ~1 s trên `/mnt/d`; `pnpm check` xanh trên `/mnt/d` từ commit này | `e6592c0` |
| 2 | lớn | Góc camera trái D48: 1a giao 52° trước khi anh chốt 55° | `CAMERA.defaultTiltDeg = 55` (canon §21.1, D48); `VIEW.tiltDeg` đọc nó; FOV giữ 28° như đã ghi. Test khung camera chạy lại xanh ở 6 tỉ lệ (1920 × 1080, 1280 × 720, 1600 × 900, 1440 × 900, 2560 × 1080, 1024 × 768), thêm khẳng định góc mặc định. Ảnh bench ở 55° (Chrome for Testing trong WSL, 1280 × 720 và 1920 × 1080, `tmp/shots/fix/cam55-*.png`, đã xem): đủ sân, hai cổng, hai góc trời. Changelog Làn 1a không còn ghi 52° là đề xuất chờ duyệt | `ee6321e` |
| 3 | lớn | `SYNC_DEBT.md` thiếu 11 dòng chép | Thêm `crowd.ts`, `ic-bench.mjs`, `boss.ts`, `deck.ts`, `grading.ts`, `learning.ts`, `typing-pace.ts`, `pace-card.ts`, `learning-frame.ts`, `learn-ahead.ts`, `review-card.ts` theo lời yêu cầu đổi của Làn 1a, 3, 5; dòng "chỗ cố ý khác" của `deck.ts` giữ nguyên. Các commit sau cập nhật dòng `vite.config.ts`, `deck.ts`, `tests/boundary.test.ts` | `78d8202` |
| 4 | nhỏ | Test ranh giới còn lọt: storage qua thành viên, chỉ số; `Math['random']`, `process`, `Intl`, `toLocale*`…; `src/sim` import `src/local`; luật âm chỉ quét `src/**` | (a) `window.localStorage`, `globalThis.localStorage`, `self.sessionStorage`, `window?.localStorage`, `window['localStorage']`, `globalThis["indexedDB"]` đều tính là dùng storage. (b) Nhóm thuần cấm thêm `process`, `Intl`, `structuredClone`, `queueMicrotask`, `toLocale*`, mọi `Math[…]`; tệp kit mà nhóm thuần chạm tới được gọi `toLocale*` với locale viết sẵn (`kit/vocab/content-filter.ts` dùng `"en-US"`; không sửa kit, D44). (c) Trong `src/sim` chỉ `world.ts` (bộ chạy trận) được import `src/local`. (d) Luật âm quét `src`, `scripts`, `tests` và tệp cấu hình gốc. Mỗi luật có tự kiểm. Không có vi phạm thật trong cây | `6c08138` |
| 5 | nhỏ | Trạng thái có băm chứa 22 số thực (`TypingRules` đã biên dịch trong `words.sessions[*]`) | `hash.ts` thêm `STATIC_KEYS` (`rules`), bỏ qua ở mọi tầng trong `hashWorld`, `hashLocal`, `hashedFloats` (cách "khóa bỏ qua" của đề bài; `rules` là hằng `IC_RULES` của module). Test mới `tests/sim/core-no-floats.test.ts` chạy **Làn 2, 3, 5 thật** (gồm `words.ts` và phiên gõ của kit; chỉ Làn 4 còn stub là giả) 4 phút gõ theo kịch bản: 0 số thực trong phần có băm, đồng thời khẳng định phiên giữ đúng `IC_RULES` có số thực. Băm thế giới đổi (chưa có golden nào) | `328205d` |
| 6 | nhỏ | Hai định nghĩa "khoảng cách tới Trận Tâm" (`field.ts`, `targeting.ts`) | Chỉ còn `field.ts` `heartDistance`: thú đất theo trường hướng từ chỗ đứng, thú bay (đường trời hoặc loài bay, kể cả khi bị kéo xuống) và thú không có đường theo đường thẳng. `targeting.ts` `nearestToHeart`, `elites.ts`, `director.ts` đọc nó; `local/auto.ts` qua `nearestToHeart`. Test `tests/sim/core-heart-distance.test.ts` (trường hướng thật): đường trường hướng so với đường thẳng; hòa thì `beastId` nhỏ hơn bất kể thứ tự trong kho (hai cổng đối xứng, thú đất với thú bay); `nearestToHeart` = nhỏ nhất theo (khoảng cách, `beastId`) qua 20 seed; kiểm mã nguồn chỉ `field.ts` định nghĩa hàm | `36d59f5` |
| 7 | nhỏ | Hợp đồng chưa gộp: *augmentation* ở 7 tệp; `world.ts` ép kiểu namespace; `flashEX1000` ngoài kiểu đầu replay; Linh Dịch có thể hồi hai lần | Gộp mọi trường vào `types.ts` (giữ nguyên hình dạng, trường tùy chọn vẫn tùy chọn; `BeastActDef`, `BossActDef`, `FallbackStep` chuyển vào `types.ts`, tệp cũ tái xuất). `world.ts` import thẳng `onLearnAhead`. `SeatHeader.flashEX1000?` trong kiểu đầu replay, thêm một dòng ở canon §23.2 (repo cha, chưa commit). `LANES.md` ghi: `director.ts` áp Linh Dịch, Làn 4 **không** áp; thêm ghi chú ở M0A_PLAN §6.4 (repo cha, chưa commit) | `96f66ef` |
| 8 | nhỏ | Số luật của Làn 8 ở ngoài `rules.ts`; hai bộ từ dự phòng; sổ cái tạm thành mã chết | `TINH_TU` có `schedule`, `poolCaps`, `pretend`, `polysemyMinSenses`, `speedChoices`; `UNKNOWN_WPM` đọc `PACE.unknownWpm` (cùng 25 WPM, D18). Tên cũ giữ làm bí danh; mọi số không đổi (vẫn là đề xuất của Làn 8). `src/content/data/trial-set.ts` là **một** bộ thử dự phòng có nhãn (canon §25): phần bộ từ trận (cũ `src/typing/trial-deck.ts`) và phần Tĩnh Tu (cũ `src/tinh-tu/sim/trial-set.ts`), có `TRIAL_SET_LABEL`; `scripts/tinh-tu/make-trial-set.ts` sinh cả tệp. Chạy lại bộ sinh rồi so: cả hai phần trùng hệt bộ cũ (64 từ bộ trận, 3 bài, 264 từ chủ đề). Bỏ `src/tinh-tu/ui/ledger.ts`: trang và test dùng `createNewWordLedger` của Làn 3; `lessonCounted` sang `tinh-tu/sim/lesson.ts` | `54e1941` |
| 9 | nhỏ | Vài mục nghiệm thu ghi "xong" hơi rộng | Ghi lại là **một phần** ở mục dưới | (tệp này) |
| 10 | nhỏ | Tiêu chí cấp phát của §6.1 (heap ≤ 2 MB / 10 s) trượt; Làn 1a đề xuất chấm theo hồ sơ `ALLOC` | Không thuộc lượt này. Vẫn chờ anh hoặc chủ kế hoạch quyết trước phán quyết 1b; đề xuất của Làn 1a giữ nguyên (đề xuất của vòng này, chờ chủ dự án xác nhận). Làn 1b tìm nguồn 137–241 B/khung ở N 120 | — |
| 11 | nhỏ | HC4b so trên điểm đã kẹp: ở Nhập Môn bot gõ mọi chữ bằng bot Chuẩn (100 so với 100); đòn bẩy −3 → −5 của câu hỏi mở 11 không sửa được | Đề xuất ở mục "Đề xuất" dưới; thêm một dòng ở câu hỏi mở 11 của canon (repo cha, chưa commit) | — |
| 12 | nhỏ | Vite dev trong WSL trên `/mnt/d`: bộ tối ưu phụ thuộc đổi tên `node_modules/.vite/deps` lỗi EACCES, `bench.html` trắng | Trong WSL trên `/mnt/*`, `cacheDir` mặc định `$HOME/.cache/vite/immortality-cultivation` (`IC_VITE_CACHE_DIR` đổi được); nơi khác giữ mặc định của Vite. Đã xóa `node_modules/.vite/deps_temp_0cf03635` và `deps_temp_fff80b4d` (không nằm trong Git). Kiểm: Vite dev ở 127.0.0.1:3048 `--strictPort`, `/bench.html` (danh sách ca) và `?case=crowd-proc&q=low&count=60` vẽ đúng trong Chrome for Testing (WSL), 0 cảnh báo console, 0 ngoại lệ; bộ nhớ đệm nằm ở `~/.cache/vite/immortality-cultivation/deps`, không có `deps_temp_*` mới. `AGENTS.md` ghi cách này | `ee04107` |
| 13 | nhỏ | Từ nền khởi đầu lạnh có thể lấy từ cấp bằng hoặc cao hơn cấp hồ sơ | `byLevelFrom` cho từ nền chỉ đi từ cấp nền xuống (cấp nền trước, rồi các cấp thấp hơn); thiếu thì bộ từ nhỏ lại và `WordPicker` lặp sớm hơn, không mượn từ khó hơn (canon §17.1; theo đề xuất của bản đánh giá). Từ mới giữ thứ tự cũ. Test cũ "lấp cấp nền thiếu bằng cấp kế" đổi thành bộ từ nhỏ lại (25 từ nền + 8 từ mới); test mới: hồ sơ cấp 3 không bao giờ có từ cấp 3, 4 làm từ nền | `cd69514` |

Việc theo sau (followups) cũng làm trong lượt này: `AGENTS.md`, `LANES.md`, `docs/README.md` ghi canon tới D49 thay D01–D46 và góc mặc định 55° (`51ff7f1`).

## Nghiệm thu ghi lại là một phần

Bản đánh giá thấy các mục sau được ghi "xong" rộng hơn bằng chứng; nay ghi là **một phần**:

- **Làn 3, "một Cast cho mỗi `wordId`"** (M0A_PLAN §6.3): phím lặp và Esc đã có test; **tạm dừng và dừng hình** nằm ở app, chưa có test. Làn 7 chạy các ca CB6 tạm dừng, dừng hình sau khi có `startApp`.
- **Làn 5, "20 seed × mọi bot, 0 thú nhắm người thật"** (M0A_PLAN §6.5): đã chạy 20 seed với thú theo kịch bản, **chưa có bot**; bảo đảm hiện là cấu trúc (`TargetRef` không có loại người chơi). Làn 7 chạy lại với bot.
- **Làn 1a, "`pnpm test` xanh"**: lúc đó chỉ xanh trong bản sao ở `/tmp`; trên `/mnt/d` ca ranh giới đã quá giờ. Từ `e6592c0` `pnpm check` xanh trên `/mnt/d`.

## Đề xuất

- **HC4b so điểm phiên chưa kẹp** (đề xuất của vòng này, chờ chủ dự án xác nhận). Canon §18.4 chỉ ghi "điểm mỗi phiên của bot gõ mọi chữ thấp hơn bot Chuẩn cùng E" (báo cáo, không chấm), không nói điểm kẹp hay chưa kẹp. Phiên hoàn thành bị kẹp `clamp(40 + thô; 40; 100)`, nên ở Nhập Môn cả hai bot cùng chạm 100 (điểm thô: bot gõ mọi chữ 83,0, bot Chuẩn 105,6), và đòn bẩy −3 → −5 của câu hỏi mở 11 không làm điểm kẹp đổi (điểm thô vẫn ≥ 60). Đề xuất: báo cáo HC4b so **điểm thô chưa kẹp** (5 Minh + 2 Thường − 3 nhầm), và đòn bẩy của câu hỏi mở 11 xét trên điểm đó; điểm kẹp vẫn là điểm của người chơi. Theo số của lượt bot trong bản đánh giá (`tmp/review-part-a/tt-bots.log`, lượt này không chạy lại), điểm thô giữ đúng kỳ vọng ở cả hai bậc: Nhập Môn 83,0 < 105,6; Tham Ngộ 72,0 < 107,8. `scripts/tinh-tu/gates.ts` đã in cả điểm thô, nên chỉ cần đổi cách đọc báo cáo. Đã ghi một dòng vào câu hỏi mở 11 của canon (repo cha, chưa commit).
- **Bộ từ lạnh dưới 40 từ khi cấp nền thiếu** (theo đề xuất của bản đánh giá): khi cấp nền và các cấp thấp hơn có ít hơn 40 từ, bộ từ nhỏ hơn sàn 40 vì không có cách giữ sàn mà không mượn từ khó hơn hoặc vượt hạn mức từ mới. Với kho từ chung hiện tại (cấp 001 có hàng trăm từ) trường hợp này chỉ xảy ra trong test.

## Kiểm đã chạy

| Kiểm | Kết quả |
|---|---|
| `pnpm check` trên `/mnt/d` ở mỗi commit có mã (1, 2, 3, 5, 6, 7, 8, 9, 10) | Xanh mọi lần, số tệp và test như ở mục "Commit" |
| `tests/boundary.test.ts` riêng trên `/mnt/d` | ~1 s cả tệp (trước: 76 s một ca); sau commit 10: 13 ca, ~1,1 s |
| Test khung camera ở 55° (`tests/view/renderer.test.ts`) | 17/17, gồm 6 tỉ lệ |
| Ảnh bench ở 55° (Chrome for Testing, WSL; SwiftShader nên `valid: false`, chỉ kiểm chức năng) | Đã xem: đủ sân, hai cổng, góc trời ở 1280 × 720 và 1920 × 1080 |
| Vite dev `/bench.html` (cổng 3048 `--strictPort`) | Vẽ đúng, 0 lỗi console; Vite và Chrome đã tắt |
| Sinh lại bộ thử rồi so với hai bộ cũ (`tmp/fix/compare-trial.ts`) | Trùng hệt |
| `git diff --cached --check`, dòng LF | Sạch ở mọi commit |

**Chưa chạy** (thuộc làn khác hoặc cần máy GPU): đo GPU bench lại ở 55° (Làn 1b, Chrome Windows); `ic-camera-frame` (Làn 6, 7); `pnpm tt:bots` (số và dữ liệu Tĩnh Tu không đổi, đã so bằng máy, nhưng chưa chạy lại bot); kiểm "không thú nhắm người" với bot (Làn 7).

## Thay đổi ở repo cha (chưa commit)

- `docs/games/tu-tien/00-canon.md` §23.2: một dòng về `flashEX1000` (sàn Chớp) trong đầu replay.
- `docs/games/tu-tien/00-canon.md` câu hỏi mở 11: đề xuất HC4b so điểm chưa kẹp.
- `docs/games/tu-tien/M0A_PLAN.md` §6.4 mục 6: ghi chú Linh Dịch do `director.ts` áp, `formation.ts` không áp lại.

## Việc còn lại cho phần B (không thuộc lượt này)

- Làn 4: các hợp đồng đã được yêu cầu (`damageBeast` chỉ đặt `alive`/`hp`/`killedBy`, `resolveCast` không đổi thế giới khi trả `false`, `applyDown` chỉ lấy 5 % Trận Lực, bỏ qua `damageImmune`, `postureFromTypedHp`, `lastHitTick`, cơ quan đất bỏ qua `isAirborne`, Phong Ấn Võng đặt `hardUntil`, `pillarOnSegment` theo `radiusU`, `useWard` phát `ward block`); **không** áp Linh Dịch.
- Tích hợp (`startApp`, M0A_PLAN §6.9): ghi `seats[i].flashEX1000 = flashFloorFor(…)` vào đầu replay và các mục Làn 3 đã liệt kê.
- Làn 7: định nghĩa "chữ sống" cho HC2, chạy lại 20 seed "không thú nhắm người" với bot, CB6 tạm dừng và dừng hình, golden với mọi làn thật.
- Làn 1b: tiêu chí cấp phát mỗi khung (chờ quyết), đo lại ở 55°, phán quyết §20.4.
- Câu hỏi bố cục (Làn 2, 7, B9): Thiết Bối Xung đầu tiên trượt Trận Trụ tây; Nham Viên có thể đứng sau trụ.
- Ghi chú kế hoạch Làn 8 xin: `typeSeconds` ở `kit/typing/scorer.ts`, không ở `kit/typing/tempo.ts` (M0A_PLAN §6.8.1).
