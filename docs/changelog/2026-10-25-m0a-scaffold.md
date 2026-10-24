# 25/10/2026 — M0a bước 0: khung repo

Theo `docs/games/tu-tien/M0A_PLAN.md` §2 (repo cha) và canon §23. Người làm: người dựng khung (bước 0 / tích hợp).

## Đã làm

- **Khung repo** (chép từ Rồng Giữ Ải `06cd4e6`, ghi ở `docs/SYNC_DEBT.md`): `package.json` (cổng 3008 chỉ ở `dev`/`preview`, lệnh `ic:balance`, `ic:golden:update`, `ic:calibrate`, `tt:bots`, `visual` qua `src/kit/tools/cdp-run.mjs`; three 0.170.0 ghim), `pnpm-workspace.yaml`, `tsconfig.json`, `vitest.config.ts`, `vite.config.ts` (3 trang `index.html`, `bench.html`, `tinh-tu.html`; `allowedHosts` `tutien.typing-game.local`; chunk `three` riêng; `usePolling` khi `CHOKIDAR_USEPOLLING=1`), `.gitignore` (khối chặn media giữ nguyên, `dist/`, `tmp/`, `art-src/*`, `public/assets/**`), `kit.config.json` (12 mô-đun).
- **Kit:** đồng bộ lần đầu từ repo cha (`node scripts/sync-game-kit.mjs --target games/immortality-cultivation`, commit cha `512033e9`, kit 0.1.0, 73 tệp, không có thay đổi kit chưa commit). Không sửa `shared/game-kit` (D44).
- **Hợp đồng dữ liệu** `src/content/types.ts` (canon §23.3, PB-24, PB-36): id, `SimCommand`, `SimEvent`, `Cast`, `BeastDef`, `GeneralDef`, `BossDef`, `SkillDef`, `WaveDef`, `TelegraphDef`, `Ward`, `StageDef`, đầu replay (§23.2), `LocalInput`, `ReplayEntry`; **mọi trường của `World`** (thú, chữ, Cast, `ward`, nhãn, Trận Trụ, cơ quan, ví theo ghế, kho đan phù, Thế, báo đòn, Vương, sổ phần, `newWordAllowance`) và của lớp `local`.
- **Số luật** `src/content/rules.ts`: mọi khóa số của canon, mỗi khóa ghi mục canon (gồm `TT_TIERS` đủ 4 khóa, `TT_BUDGETS`, `REF_OUTPUT`, `CROWD_MODE`, `KEYS`), `quantizeOrigin` (100 mm, không bao giờ −0), `contentHash` cho `rulesHash`.
- **Lưu** `src/app/storage.ts`: nơi duy nhất chạm storage; 4 khóa `.save`, `.skill`, `.newwords`, `.settings`, mỗi khóa có hàm đọc, ghi, chuyển đổi; khe dự phòng `<khóa>.bak`; `.newwords` bỏ mục cũ hơn 20 phút khi ghi; `loadSkill` theo đối tượng và preset hiện tại; `gameStorage` cho khóa khác. `src/app/save.ts`: lưu sau trận (`.skill`, `.newwords`) và cài đặt.
- **App:** `contracts.ts` (`Presenter`, `FrameInfo.local`, `CommandSink`, `LocalSink`, `Projector`, `ActionHandler`, `Quality`), `loop.ts`, `input-router.ts` (thứ tự canon §5.1 và M0A_PLAN §6.9; chế độ cửa hàng bằng `` ` `` lúc bày trận và nghỉ; phím chữ chỉ thành lệnh `key` khi Bàn Quyết sống; mũi tên thành `arrows` của `local`, mở cửa hàng thì dừng đi; chuột phải `move-to`, chuột trái `soft-target`; đổi phím theo `.settings`), `app.ts` (nạp trận: đọc sổ cái một lần, `newWordAllowance`, bộ từ từ luồng riêng của seed, **đầu replay** canon §23.2, `matchRulesHash`; `startApp` để tích hợp).
- **Trang:** `/` hiện "Đang dựng"; `bench.html`, `tinh-tu.html` là khung trống của Làn 1, Làn 8.
- **Stub mọi tệp của các làn** (chữ ký xuất khẩu + `TODO(<làn>)`), theo bảng sở hữu của `LANES.md`.
- **Test:** `tests/boundary.test.ts` (nhóm thuần `src/sim`, `src/local`, `src/typing`, `src/content`, `src/tinh-tu/sim`, kể cả qua chuỗi import kit; cấm chạm `kit/feedback/audio-cues`, `kit/audio/dragon-voice` qua mọi chuỗi import, kể cả barrel; cấm `OscillatorNode`, `createOscillator`; chỉ `storage.ts` chạm storage; tự kiểm), `tests/app/save-migrate.test.ts` (tệp mẫu từng khóa), `tests/app/input-router.test.ts`, `tests/app/match-header.test.ts`.
- **Tài liệu:** `AGENTS.md`, `LANES.md` (bản tiếng Anh của mục 3–6 kế hoạch, cộng mục "bước 0 giao gì cho từng làn"), `README.md`, `docs/README.md`, `docs/SYNC_DEBT.md`.

## Kiểm đã chạy (25/10)

| Kiểm | Kết quả |
|---|---|
| `pnpm check` (sha256 kit, 36 test, `tsc --noEmit`, `vite build`) | Xanh; `dist/` có 3 trang, thay trang tạm. Vite báo "Generated an empty chunk: three" vì chưa tệp nào import three (hết khi Làn 1 dựng renderer) |
| Test ranh giới (12 ca, gồm luật cấm import âm tổng hợp và tự kiểm) | Xanh |
| `node scripts/sync-game-kit.mjs --check` (repo cha) | Xanh cho 4 game |
| Trình duyệt (Chrome for Testing trong WSL, Vite 3008 `--strictPort`): `/`, `/bench.html`, `/tinh-tu.html` | Cả 3 mở, đúng khung, 0 lỗi console, 0 tài nguyên lỗi; ảnh `tmp/shots/step0/*.png` đã xem |
| `node --test scripts/media/test/unit.test.mjs` | 26/26 xanh |
| `node scripts/validate-play-mode.mjs` | PASS (host `tutien.` có trong hợp đồng) |
| `node scripts/validate-space-integration.mjs` | Qua |
| `node --test portal/tests/learning-bridge.test.mjs` | 11/11 xanh (nhận `gameId` `immortality-cultivation`, từ chối origin sai) |

**Chưa chạy được ở bước này:** `https://tutien.typing-game.local` qua portal và một sự kiện học thử tới portal (cần anh chạy `pnpm setup:play` bằng sudo và thêm host vào hosts của Windows; agent không chạy).

## Nối repo cha (PB-22)

- Đã kiểm từng dòng của M0A_PLAN §2.3 (commit cha `6c44135b`, `f160d4bc`): `.gitmodules`, `portal/public/games.json`, test cầu học của portal, hai cấu hình nginx, `scripts/setup-nginx.sh`, `package.json` cha, `dev.sh`, `play.sh`, `scripts/{play,game-dir,bootstrap}.sh`, hai script kiểm, `media/media.config.json`, `AGENTS.md` cha, `docs/AGENT_SKILLS_SETUP.md`: đều có.
- Việc còn lại 1 (test media) và 3 (`dev:tutien:app` bỏ cờ cổng) đã làm ở `f160d4bc`. Việc 2 (`SPLIT_PLAN.md` §10: cổng 3008 và mục "Game thứ tư") và việc 4 (`docs/games/tu-tien/README.md`: "đang dựng M0a") đã sửa ở repo cha, **chưa commit** (để người điều phối commit).

## Quyết định nhỏ của bước 0

Đã chọn theo đề xuất (luật "làm theo đề xuất"); mục nào canon không có số thì là **đề xuất của vòng này, chờ chủ dự án xác nhận**:

1. Trường `summonMaxW` của canon §23.3 lưu theo w100 như mọi W trong dữ liệu (§7.1), nên tên trường là `summonMaxW100`.
2. `TT_TIERS`: DPR 1 và số hạt theo canon §20.2; **bloom tắt ở Low, bật từ Medium**, `tipsPerSide`/`trail` lấy số của kit — đề xuất của vòng này, chờ chủ dự án xác nhận (Làn 1 xác nhận bằng HN0).
3. Chế độ cửa hàng: `=`/`-` "bấm hai lần" tính trong 2 s (`SHOP_MODE.confirmMs`) — đề xuất của vòng này, chờ chủ dự án xác nhận. `NumpadEnter` làm Enter; đan phù 1/2/3 không nhận khi giữ Shift (canon "không phím phụ"); phím có Alt không là phím lệnh.
4. Khe dự phòng của canon §23.1 là khóa `<khóa>.bak` giữ giá trị tốt gần nhất.
5. Làn thêm trường riêng vào trạng thái của mình bằng *module augmentation* trong tệp của mình rồi báo Làn 2 (đúng luật "khai trong tệp của mình, dùng ở đó, rồi báo").
6. `EventSink.lastTick()`: lớp `local` đọc sự kiện của tick thế giới vừa xong mà không rút hàng đợi của app.
7. Bộ từ rút từ luồng RNG riêng của seed trận (`seed ^ 0x5eeddec0`), không đụng luồng của thế giới.
8. Test ranh giới đếm cả `import type` và chặn barrel `kit/feedback`, `kit/audio`, `kit/audio/scene-audio` (chúng dẫn tới `audio-cues`, `dragon-voice`): làn import thẳng tệp kit (`kit/feedback/tiers`, `kit/audio/mix`…).

## Việc tiếp

- Làn 1 (mốc 1a), Làn 2, Làn 3, Làn 5, Làn 8 bắt đầu trên stub theo `LANES.md`; Làn 4, 6, 7 theo kế hoạch.
- Anh: `pnpm setup:play` (sudo) và host Windows để kiểm `https://tutien.typing-game.local` qua portal.
