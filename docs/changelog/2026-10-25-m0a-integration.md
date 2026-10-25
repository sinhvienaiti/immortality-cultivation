# 25/10/2026 — M0a: tích hợp (`startApp`)

Theo `docs/games/tu-tien/M0A_PLAN.md` §6.9 (repo cha) và canon §4.1, §5.1, §6.1, §6.4, §6.5, §17, §20.1, §20.2, §23.1, §23.2, D18, D41, D48. Người làm: chủ bước 0 (tích hợp). Lượt trước bị cắt giữa chừng không để lại tệp nào của tích hợp trong cây làm việc, nên lượt này viết từ đầu trên mã đã commit của các làn (tới `dc833d5` của Làn 1b). Commit mã: `64d059b`.

## Đã làm

### Trang `/` (`src/app/app.ts`, `src/main.ts`)

- Luồng: thẻ tốc độ (bỏ qua khi có `?wpm=` hoặc `.skill` đã đo, D18) → Học trước (từ mới của trận) → bày trận (cửa hàng chuột và chế độ cửa hàng `` ` ``, Enter bắt đầu) → 6 đợt, Thẻ Ôn lúc nghỉ → lặng → Thú Vương → Thu Hoạch (Enter chơi lại; thẳng hồ sơ đã đo nếu có). `src/main.ts` gọi `startApp` thay trang "Đang dựng".
- **Nạp trận** (canon §6.4, §17.1, §23.2): `loadDeckSource` của Làn 3 (kho từ ba cấp quanh hồ sơ, bản ghi qua portal trong 2 s, không portal thì khởi đầu lạnh, không kho từ thì bộ thử dự phòng có nhãn); `buildDeck` trên luồng riêng của seed; `remaining` của sổ cái thành `newWordAllowance`; đầu replay ghi trước tick 0, **có `flashEX1000`** (`flashFloorFor(profile, readPaceMemory())`, sàn Chớp 5 phiên, canon §6.5). `word-first-seen` → `take(wordId, Date.now(), channel)` → lưu `.newwords` ngay (`createLearning(... onLedgerChange)`), và lưu lại lúc hết trận.
- **Thứ tự khung** (Rồng LANES "Integration"): rút sự kiện → `learning.onEvents` → luồng app (`pace-update` sau đợt 1, Thẻ Ôn, kết thúc trận) → `onEvents` của mọi presenter → `frame` của mọi presenter (camera cố định, đặt trước mọi phép chiếu DOM) → vẽ. Presenter theo thứ tự: cảnh hộp xám của Làn 6 (`createGreyBoxView`: sân, thú, người chơi, báo đòn, hiệu ứng, hạt Linh Sa), móc âm im lặng, Bàn Quyết, khung học, HUD, thẻ đợt, dải cửa hàng, chế độ cửa hàng, Học trước, Thẻ Ôn, Thu Hoạch. Đồng hồ thế giới của vòng khung là `scene.worldDt` (dừng hình của hồ sơ phản hồi).
- **Danh sách nối của Làn 3:** `createLearning({ dryRun: false, ledger, now: Date.now, gloss, onLedgerChange })`; `learning.onEvents` trước các presenter; `flush` lúc ẩn trang, mất focus, hết đợt, hết trận; hồ sơ "chưa biết": `PaceMeter` của đợt 1 → `paceUpdateAfterWave1(…, paceFor)` gửi `pace-update` lúc hết đợt 1; hết trận (thắng, thua, rút lui) `finishMatch` cập nhật `.skill`; Học trước, Thẻ Ôn, Thu Hoạch, menu dừng là `KeyPanel` của bộ định tuyến; khung học bị che khi bảng học mở; `onImeSign` → dải IME.
- **Danh sách nối của Làn 6:** `applySkin`, `watchMotion`; `setViewInsets(viewInsets(w, h, cỡ chữ))` lúc dựng và mỗi lần đổi cỡ; `createShopMode` là `shop()` của bộ định tuyến, `onCursor` → `stage.highlightSlot`; menu mở từ Esc dự phòng, `onRetreat` → `results.show("retreat")`; khi đang đổi phím, `intercept` chuyển `event.code` cho `menu.bindKey`; `createSoundHooks` 16 tiếng ở Low, 32 ở bậc khác.
- **Sim đứng yên** khi Học trước hoặc Thẻ Ôn mở (đồng hồ nghỉ dừng theo), ở menu dừng, trên thẻ tốc độ, dưới màn focus (mất focus, tab ẩn: dừng ngay, không chờ khung sau) và trong 3-2-1 sau tạm dừng ở pha Bàn Quyết sống. Lúc đó chữ trên Bàn Quyết ẩn (không đọc trước từ khi dừng); hết trận cũng ẩn.
- **Bậc hình mặc định** (canon §20.1): `?q=`, rồi bậc trong `.settings`, rồi theo GPU (rời: High, Apple: Medium, còn lại và vẽ phần mềm: Low); sau 10 s chơi, khung vượt ngân sách chỉ hiện gợi ý hạ bậc, không tự hạ.
- **Chuột:** chuột phải trên sân → `move-to`; chuột trái lên thú (bán kính 44 px quanh tâm thú như view vẽ) → `soft-target`, lên đất → bỏ đích; điểm con trỏ trên sân là `aim` của phím chữ và đan phù.
- **Cờ URL:** `?q=low|medium|high`, `?seed=`, `?preset=relax|balanced|challenge|learn`, `?wpm=`, `?motion=full|reduce`, `?prelearn=0`, `?review=0`, `?speech=0`, `?guard=ward|dash`, `?tam=kiem-tam|tich-kiem`, `?speed=N` (chỉ bản dev, 0,25–16, luật không đổi), `?debug=1` → `window.__ic` (bản dev luôn có).

### Lệnh vào thế giới ngay, replay vẫn đúng (`src/app/match.ts`, mới)

- Lệnh (phím, bảng, cửa hàng) áp vào thế giới **ngay khi đến** và ghi kèm tick nó vào: phím tới Bàn Quyết ngay khung sau, kể cả lúc dừng hình (canon §6.1; "phím tới đòn ≤ 50 ms" của §20.2 đo từ `keydown` chữ cuối tới khung có nét thư pháp rời Bàn Quyết). Trước lệnh đầu tiên của một tick, lớp `local` chạy bước của tick đó, nên thứ tự luôn là thứ tự `runLog` của Làn 2 dựng lại: bước `local` (với đầu vào cục bộ của tick), lệnh của tick theo thứ tự, lệnh riêng của `local` (`auto`, `down`, `ward-use`), bước thế giới. Đầu vào cục bộ (`move-to`, `arrows`) chờ bước `local` kế và được ghi ở tick đó.
- Đuôi replay: `hashWorld`, `hashLocal` mỗi 600 tick và cuối trận (rút lui giữa một tick thì giữ mục của tick trọn gần nhất, vì `runLog` không dừng giữa tick được).
- `replayCheck`: dựng lại trận từ đầu replay và nhật ký qua đúng đường đó (kể cả tick đang dở), so cả hai mã băm; `official`: `runLog` của Làn 2 tới mục đuôi cuối, so với mã băm trận thật đã ghi ở đó.
- `src/app/loop.ts`: đồng hồ thế giới lấy từ dừng hình của view (`worldDt(dt, now)`), nhân `?speed=`; trần bước mỗi khung = 5 × tốc độ; một đối tượng `timing` dùng lại, không cấp phát mỗi khung.

### `window.__ic` cho kịch bản của Làn 7 (`src/app/debug.ts`, mới; bảng đủ ở `LANES.md` mục "Integration")

`state()`, `send(command)`, `action(name)`, `replayCheck()`, `replay()` (đầu, thân, đuôi: xuất cho B9), `hash()`, `frame()` (ic-camera-frame: 4 góc sân, 2 cổng, 2 lối vào đường trời ở độ cao thú bay được vẽ, Trận Tâm, và gốc, đỉnh **vị trí vẽ** của mọi thú qua `actors.locate`, theo yêu cầu của Làn 6), `foeSizes()` (ic-scale: cỡ px vẽ của mọi thú và người chơi), `words()`, `review()`, `events()` (đếm sự kiện, trạng thái Cast, thời gian nạp báo đòn ngắn nhất theo từng đòn cho ic-telegraphs, khung bị dừng hình, bộ trộn câm), `perf()` (khoảng khung TB, p95, max; phần CPU của khung; draw call; chuỗi GPU; phím → khung kế và chữ cuối → khung có nét Cast cho ic-hitstop-keys), `world()`, `local()`, `setSpeed(n)` (dev), `restart()`.

### Lưu v1 (`src/app/save.ts`)

`.skill` sau mỗi trận (`finishMatch` của Làn 3: `updateSkill` của kit, trần giảm 10 %); `.newwords` mỗi lần sổ cái `take` (`saveNewWords`, mới) và lúc hết trận; `.settings` từ menu (chuyển động, cỡ chữ, đổi phím: bộ định tuyến dựng lại với bảng phím mới). `.save` để M1. Tệp mẫu chuyển đổi đã có ở `tests/app/save-migrate.test.ts` từ bước 0.

### Test (`tests/app/`)

- `match-runner.test.ts` (4 ca): một người gõ theo kiểu trang (khung 1–3 tick, nhiều lệnh mỗi khung, lệnh đến sau khi `local` đã chạy, đi chuột phải, mũi tên, cửa hàng, Học trước, Thẻ Ôn, đan phù) qua 9.000 tick: mọi mục đuôi đều đúng với `runLog` của Làn 2; dựng lại qua cùng đường khớp cả lúc đang giữa tick; hai lượt cùng nhật ký ra cùng đuôi; bỏ một phím thì mã băm đổi; lệnh riêng của `local` có trong nhật ký và được làm lại khi dựng; không lệnh nào vào sau khi hết trận hay rút lui.
- `app-options.test.ts` (7 ca): cờ URL (kể cả `?speed=` chỉ ở bản dev), bậc theo chuỗi GPU, tiêu chí gợi ý hạ bậc, `flashEX1000` trong đầu replay (thứ tự trường), `saveNewWords`, vòng khung (dừng hình, tốc độ dev, trần bước, tạm dừng).
- `match-header.test.ts` giữ nguyên và vẫn xanh (không có `flashEX1000` thì ghế giữ đúng 3 trường như cũ).
- `vitest.config.ts`: thời hạn mặc định mỗi ca 20 s thay 5 s. Ca "Gọi Đàn … over 20 seeds" của Làn 5 chạy ~3 s riêng nhưng 5–8,5 s khi máy WSL bận (Chrome, bot của làn khác) và làm `pnpm check` đỏ ngẫu nhiên (Làn 6 đã báo; lượt `pnpm check` đầu của tích hợp cũng đỏ đúng ca này ở 5,08 s). Ca có thời hạn riêng giữ nguyên.

### Tài liệu

`LANES.md` (đường dẫn sở hữu thêm `src/app/{match,debug}.ts`; hợp đồng `createMatchRunner`, `replayCheck`; mục "Integration" viết lại với bảng `window.__ic`), `AGENTS.md` (trạng thái, trang `/`), `docs/README.md`.

## Kiểm đã chạy (25/10)

| Kiểm | Kết quả |
|---|---|
| `tsc --noEmit` cả repo trên `/mnt/d` | sạch |
| `vitest run tests/app` | 5 tệp, 35/35 xanh |
| `pnpm check` trên `/mnt/d` (cây làm việc thật, `flock /tmp/tg-heavy.lock`, `VITEST_MAX_THREADS=4`) | **Xanh**, 238 s: `verify-kit` khớp; 74 tệp test, **675/675**; `tsc --noEmit` sạch; `vite build` 3 trang. Lượt đầu đỏ đúng một ca không thuộc tích hợp (Làn 5, "Gọi Đàn … over 20 seeds", hết giờ 5,08 s khi máy bận); sau khi nâng thời hạn mặc định ở `vitest.config.ts` thì xanh |
| **Chơi trọn ải bằng bàn phím** (Vite WSL `127.0.0.1:3048 --strictPort`, Chrome for Testing trong WSL qua `src/kit/tools/cdp-run.mjs`, phím thật bằng CDP `Input.dispatchKeyEvent`, kịch bản tạm `tmp/integration/play.mjs` không commit), 1280 × 720, `?preset=relax&speed=3&seed=7`, thẻ tốc độ chọn "Chưa biết" bằng phím 1 | **Thắng** sau 217 s: Học trước 8 từ (một từ cố ý gõ sai rồi Enter); chế độ cửa hàng lúc bày trận (đặt Kiếm Thung, mua Hồi Xuân Đan) và mỗi lần nghỉ; Enter bắt đầu, Enter đi tiếp (Thư giãn chờ Enter); đi bằng mũi tên tới thú ngoài tầm; đan phù phím 1/2; 6 đợt, lặng, Thú Vương; Thẻ Ôn 15 câu (5 lần nghỉ × 3, đủ 3 kiểu, trả lời bằng phím chữ và phím 1/2/3); menu Esc giữa đợt 2: 0 tick trong 0,7 s, Esc đóng thì 3-2-1; `pace-update` sau đợt 1 (k 0,75 → 1,30); 455 thú hạ, 241 từ, 232 Cast `resolved`, 20 `held`, 9 `fizzled`, **0 Cast đôi**; Trận Lực 1.000; Thu Hoạch ★★★ với Sổ Từ 8 từ mới; hàng đợi học gửi 70, chặn 0; **`replayCheck` khớp** cả `hashWorld` và `hashLocal` ở tick 23.298 (`9c16278c` / `44f756c1`), `runLog` của Làn 2 cũng khớp; lúc đông nhất (34 thú) `frame()`: mọi góc, cổng, lối trời, Trận Tâm và cả 34 thú trong khung và trên dải Bàn Quyết; báo đòn ngắn nhất 1,4 s (Thiết Giáp Trư húc), Nham Viên 1,6 s, Thiết Bối Xung 10,7 s; **0 cảnh báo, 0 lỗi console, 0 ngoại lệ** |
| **Chơi trọn ải lần hai trên commit `64d059b`**, 1920 × 1080, `?preset=balanced&speed=3&seed=21`, thẻ tốc độ chọn 35 WPM bằng phím 5 | **Thắng** sau 399 s, Trận Lực 761 (★★★); 452 thú hạ, 283 từ, 267 Cast `resolved`, **0 Cast đôi**; Học trước 8 từ, Thẻ Ôn 15 câu; menu đợt 2: 0 tick, 3-2-1; `replayCheck` khớp ở tick 30.366 (`c47ff6af` / `949f08ac`), `runLog` cũng khớp; lúc đông nhất 37 thú: mọi điểm và mọi thú trong khung, trên dải Bàn Quyết; hết trận chữ Bàn Quyết ẩn; hàng đợi học gửi 70, chặn 0; **0 cảnh báo, 0 lỗi console, 0 ngoại lệ**; ảnh đã xem (đông ở đợt 4, Thú Vương với loạt Thiên Hà Kiếm Vũ, Thẻ Ôn "nghe rồi gõ", Thu Hoạch) |
| Đường còn lại, 1920 × 1080, `?wpm=35&prelearn=0&speed=2&seed=11` (`tmp/integration/paths.mjs`) | `?wpm=` bỏ qua thẻ tốc độ; phím soạn chữ IME (`Process`, 229) → dải IME, không gõ gì; chuột phải đi từ (0; 3) tới (5,5; −0,5); mất focus → màn focus, **0 tick trong 1 s**, một phím gỡ màn và 3-2-1; menu → Rút lui (Enter hai lần) → "Thu Hoạch · Rút lui" (`.skill` không đổi vì `?speed=2`); `replayCheck` khớp ở tick 21.024 (`runLog` cũng khớp); Enter → trận mới ở bày trận; 0 lỗi console, 0 ngoại lệ |
| Ảnh đã xem (`tmp/shots/integration/`, không vào Git) | thẻ tốc độ, Học trước, cửa hàng lúc bày trận và lúc nghỉ, đợt 1, Thẻ Ôn, menu, 3-2-1, đợt 4 (đông), Thú Vương (thanh Thế, "Thú Vương xuất hiện", Ấn), Thu Hoạch thắng; ở 1080p: dải IME, màn focus, menu hỏi rút lui, Thu Hoạch rút lui, trận mới. Bàn Quyết không bị panel nào che; chữ Bàn Quyết ẩn dưới menu, 3-2-1 và màn focus |
| Số khung | Chuỗi `renderer` là SwiftShader (trình duyệt WSL vẽ phần mềm): ~9 khung/s, nên **không phải số đo hiệu năng**; `ic-perf` trên GPU Dell là việc của Làn 7 |

Chưa chạy (việc của Làn 7 sau tích hợp): mọi kịch bản `ic-*` thật, `ic-perf` (GPU Dell), bot B1–B8, CB, HC, golden.

## Phát hiện khi chơi thử

1. **Một Nham Viên đứng ngoài tầm làm đợt không bao giờ hết.** Nham Viên dừng cách Trận Tâm 11 m để ném (PB-17). Từ chỗ đứng đầu trận (Tâm nhãn, 3 m nam Trận Tâm), một Nham Viên ở 11 m phía bắc cách người chơi ~13,7 m: ô 1 (12 m) và đánh nền (10 m) không tới, chỉ ô 2 và ô 5 (14 m) tới. Người chơi đứng lệch sang bên (kịch bản đầu của lượt này đứng ở (−6,5; 3), rồi (5,5; −0,5)) thì **không chiêu nào tới**: mọi Cast `held` rồi `fizzled`, đợt không hết, Trận Lực bị gặm từ 1.000 còn 288 (rồi 104 ở lượt 1080p) trong vài phút. Không kẹt cứng (đi bộ tới là xong, và Trận Lực cạn thì thua), nhưng bot "Đứng yên" (D46) và người mới có thể gặp. Chuyển cho Làn 5 và Làn 7 (mục "Yêu cầu đổi").
2. Kịch bản bot gõ cả từ một lượt (vài ms mỗi chữ) nên đo E rất cao: `pace-update` sau đợt 1 kẹp k ở 1,30 và mọi từ là Chớp. Đúng luật với số đo đó; với `?speed=` khác 1, app không cập nhật `.skill` (xem đề xuất 10).
3. Chữ đang bay lúc đợt kết thúc từng trả lời luôn câu đầu của Thẻ Ôn (thẻ mở cùng khung hết đợt). Đã sửa: Thẻ Ôn mở sau 0,8 s (đề xuất 2).

## Đề xuất của vòng này, chờ chủ dự án xác nhận

Canon và kế hoạch không có số hay luật cho các điểm sau; đã chọn phương án có cơ sở rõ nhất:

1. **Phát âm** ở Học trước (mỗi từ đọc một lần khi hiện), Thẻ Ôn "nghe rồi gõ" và nút nghe dùng giọng tiếng Anh của trình duyệt (`kit/speech`); `?speech=0` tắt. Lý do: canon §17 cần kiểu câu "nghe rồi gõ"; D26 và Q6 cấm âm tổng hợp của game (móc âm vẫn im lặng), không nói về phát âm từ; Rồng M0a cũng làm vậy. Không bao giờ tự phát giữa đợt.
2. Thẻ Ôn **tự mở 0,8 s sau khi hết đợt** (chờ nếu chế độ cửa hàng, menu hay màn focus đang mở; không mở nếu đợt kế đã báo); Esc đóng; `?review=0` tắt (canon §17: "tùy chọn, tắt được"; chưa có mục trong cài đặt).
3. Tiêu chí "vượt ngân sách" cho gợi ý hạ bậc (trang không tắt được vsync): phần CPU của khung có p95 vượt `TT_BUDGETS[bậc].cpuP95Us`, hoặc p95 khoảng khung vượt 1,5 × trung vị (rơi khung đều). Chỉ hiện một thông báo; không tự hạ, không ghi bậc vào `.settings`.
4. Hồ sơ chưa có cấp từ vựng dùng **cấp 1** (A1: từ nền lấy từ cấp này, canon §17.1).
5. Preset mặc định **Cân bằng**; `?preset=` đổi.
6. Loadout mặc định **Hộ thân + Kiếm Tâm**. Canon §12.1 cho chọn ô 3 và tâm pháp trước trận nhưng M0a chưa làn nào có bảng chọn: tạm dùng `?guard=`, `?tam=` (lệnh `loadout` của sim đã sẵn). Xem "Còn mở".
7. Chữ trên Bàn Quyết **ẩn khi dừng ở pha Bàn Quyết sống** (menu, màn focus, 3-2-1, thẻ tốc độ) và khi hết trận.
8. Màn focus cũng dừng đồng hồ bày trận (bày trận 20 s tự chạy).
9. Mỗi trận một seed ngẫu nhiên, trừ khi có `?seed=` (seed ghi trong đầu replay).
10. Bản dev với `?speed=` khác 1 **không cập nhật `.skill`** (giờ tường đo trên thế giới chạy nhanh hơn).
11. Mở trang khi trang chưa có focus: màn mờ "Bấm hoặc gõ phím bất kỳ để bắt đầu" (không dừng sim); phím đầu tiên gỡ nó và vẫn đi tiếp.
12. Thẻ tốc độ mở từ menu: chọn tốc độ khác thì chơi lại ải với tốc độ đó (như Rồng); chọn như cũ thì về trận với 3-2-1.

## Yêu cầu đổi gửi làn khác

- **Làn 6 (`ui/results.ts`) và Làn 4 (`sim/economy.ts`):** Thu Hoạch đang tính Thú Hạch là `wallet.thuHach` (giữ 50 % khi thua, rút lui), còn `matchThuHach(world, seat)` của Làn 4 tính theo canon (× hệ số preset, cộng Linh Sa dư tối đa 3, nửa khi thua). Đề nghị: Làn 4 cho `matchThuHach` nhận kết cục (rút lui cũng giữ 50 %, vì sim không biết rút lui: thế giới vẫn ở pha `wave`), Làn 6 dùng nó trong `harvestView`. Cùng ý với yêu cầu của Làn 4 gửi tích hợp ("Thu Hoạch reads matchThuHach"), nhưng hai tệp không thuộc tích hợp.
- **Làn 6 (`ui/shop-mode.ts`, `ui/shop-strip.ts`):** đọc tên, giá từ `SHOP_ITEMS`, `MECHANISM_DEFS`, `CONSUMABLE_DEFS` của Làn 4 và số hoàn của `sim/shop.ts` (yêu cầu của Làn 4 vẫn mở).
- **Làn 5 và Làn 7:** phát hiện 1 ở trên. Làn 7 kiểm bot "Đứng yên" hết được mọi đợt (đủ 20 seed); Làn 5 cân nhắc cho Nham Viên tiến lại khi đứng ném quá lâu, hoặc đặt điểm dừng 11 m tính từ đích mà vẫn trong 12 m của ô 1 từ Tâm nhãn (canon chưa có số; quyết định của chủ dự án).
- **Làn 7:** API `window.__ic` ở `LANES.md`. Kinh nghiệm từ kịch bản tạm: phím thật bằng CDP `Input.dispatchKeyEvent` (chữ: `keyDown` có `text`; phím lệnh: `rawKeyDown` với `code`); dòng bước của Thẻ Ôn kiểu chọn nghĩa có "(phím 1 / 2 / 3)" nên số câu là cặp "i / n" **cuối**; bot phải biết đi (mũi tên) tới thú ngoài tầm; `?speed=` chỉ có ở bản dev; ảnh và số khung từ Chrome trong WSL là SwiftShader.
- **Chưa làn nào giữ:** bảng chọn loadout trước trận (ô 3 Hộ thân hay Lưu Quang Bộ, tâm pháp; canon §12.1). Đề nghị giao Làn 6 (UI) ở vòng sửa M0a: hiện lúc bày trận, gửi lệnh `loadout`.

## Còn mở

- Đẩy commit (việc của người điều phối), rồi dời con trỏ submodule ở repo cha.
- Bảng chọn loadout (xem trên); các đề xuất 1–12 chờ chủ dự án.
- Kịch bản `ic-*` của Làn 7 trên trang thật; `ic-perf`, `ic-hitstop-keys` trên GPU Dell (Windows Chrome).
