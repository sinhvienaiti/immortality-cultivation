# Vé nợ đồng bộ (canon D16, M0A_PLAN §10)

Mọi tệp chép từ game khác có một dòng `// Source: games/<repo>/<đường dẫn> @<commit> (adapted: …)`
và một dòng trong bảng dưới. Không import chéo repo. Chủ tệp này: bước 0 viết, **Làn 2 giữ** từ nay.

## Bảng chép

| Tệp của game | Tệp nguồn | Commit nguồn | Đổi gì khi chép |
|---|---|---|---|
| `vite.config.ts` | `games/dragon-hold/vite.config.ts` | `06cd4e6` | Cổng 3008, host mặc định `tutien.typing-game.local`, 3 trang (`index`, `bench`, `tinh-tu`), `server.watch.usePolling` khi `CHOKIDAR_USEPOLLING=1`; trong WSL trên `/mnt/*` đặt `cacheDir` ở đĩa riêng của WSL (`$HOME/.cache/vite/immortality-cultivation`, đổi bằng `IC_VITE_CACHE_DIR`) vì bộ tối ưu phụ thuộc đổi tên `node_modules/.vite/deps` lỗi EACCES |
| `src/app/contracts.ts` | `games/dragon-hold/src/app/contracts.ts` | `06cd4e6` | `FrameInfo.local` (lớp `local`), `LocalSink`; `Quality` lấy từ `content/types.ts` |
| `src/app/loop.ts` | `games/dragon-hold/src/app/loop.ts` | `06cd4e6` | Trả `LoopTiming`; app ghép `local` thành `FrameInfo` |
| `src/app/input-router.ts` | `games/dragon-hold/src/app/input-router.ts` | `06cd4e6` | Bảng phím canon §5.1 (không camera, không Alt); chế độ cửa hàng `` ` ``; lệnh mang `seat`, `origin`, `aim`; phím chữ chỉ thành lệnh khi Bàn Quyết sống; mũi tên thành `arrows` của `local`; chuột phải `move-to`, chuột trái `soft-target`; đổi phím theo `.settings` |
| `tests/boundary.test.ts` | `games/dragon-hold/tests/boundary.test.ts` | `06cd4e6` | Nhóm thuần thêm `src/local`, `src/tinh-tu/sim`; cấm thêm `fetch`, `indexedDB`, `XMLHttpRequest`, `WebSocket`, `process`, `Intl`, `toLocale*` (tệp kit được gọi với locale viết sẵn), `structuredClone`, `queueMicrotask`, `Math[…]`; cấm chạm tới `kit/feedback/audio-cues`, `kit/audio/dragon-voice` qua mọi chuỗi import (kể cả barrel) và cấm `OscillatorNode`, `createOscillator` ở mọi tệp của game ngoài `src/kit` (`src`, `scripts`, `tests`, cấu hình gốc); chỉ `src/app/storage.ts` chạm storage, kể cả qua thành viên (`window.localStorage`) và chỉ số (`globalThis["localStorage"]`); `src/sim` chỉ `world.ts` được import `src/local`; đọc, phân tích, phân giải mỗi tệp một lần (nhẹ I/O trên `/mnt/d`) |
| `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `index.html` | cùng tên trong `games/dragon-hold` | `06cd4e6` | JSON/YAML/HTML không có dòng `Source`. `package.json`: tên, mô tả, cổng 3008, lệnh `ic:*`, `tt:bots`, `visual` qua `src/kit/tools/cdp-run.mjs`, bỏ `@fontsource/cormorant-garamond`; `index.html`: `#ic-app`, `#ic-canvas`, `#ic-overlay`, `#ic-quyet`; các tệp khác giữ nguyên |
| `src/content/rules.ts` `TierRow` | `src/kit/three/stage.ts` `StageTier` (kit) | kit 0.1.0, commit cha `512033e9` | Khai lại cùng hình dạng vì `rules.ts` thuần không được import `three`; Làn 1 truyền `TT_TIERS` thẳng vào `Stage3D` |
| `src/sim/fixed.ts` (Làn 2) | `games/dragon-hold/src/sim/fixed.ts` | `06cd4e6` | Hằng số đọc từ `rules.ts` `SIM`; `mulDiv` làm tròn **nửa lên** bằng phép nguyên chính xác (canon §7.2, D38; Rồng dùng `Math.round` trên thương số thực); `msToTicks` cũng vậy; thêm `mulDivSym` (nửa xa số 0) cho di chuyển và hướng để hình đối xứng đông–tây; `isqrt` có bước chỉnh; `stepTowards`, `unitPm` |
| `src/sim/hash.ts` (Làn 2) | `games/dragon-hold/src/sim/hash.ts` | `06cd4e6` | Khóa bỏ qua chỉ ở tầng ngoài; vật có `hashState()` băm theo giá trị trả về (bộ điều nhịp, đồng hồ đo của kit); `hashWorld`, `hashLocal`, `hashedFloats` ở đây |
| `src/sim/events.ts` (Làn 2) | `games/dragon-hold/src/sim/events.ts` | `06cd4e6` | `EventSink` có `lastTick()`, `endTick()` cho lớp `local`; vượt trần thì bỏ sự kiện cũ với chi phí O(1) mỗi lần đẩy (Rồng dùng `shift()`) |
| `src/sim/world.ts` (Làn 2) | `games/dragon-hold/src/sim/world.ts` | `06cd4e6` | Thế giới canon §23.3 với trạng thái của mọi làn; thứ tự bước M0A_PLAN §3.2; `stepMatch` (lớp `local` chạy trước mỗi tick); `runLog` dựng `world` và `local` từ đầu replay canon §23.2 |
| `src/sim/waves.ts` (Làn 2) | `games/dragon-hold/src/sim/waves.ts` | `06cd4e6` | Pha canon §4.1 (bày trận 20 s, báo 5 s, nghỉ theo preset, lặng 8 s rồi Vương); giữ luật hết đợt; lọc giải tích theo W và D_ref (canon §13.1); đỉnh ngắn theo cách đo `peakLoad100` của Rồng (cửa sổ bận nhất) nhưng chia cho D_ref thay sức gõ 22,7 từ/phút |
| `src/sim/spawn.ts` (Làn 2) | `games/dragon-hold/src/sim/spawn.ts` | `06cd4e6` | Toán ra nguyên toán ở cổng của trường hướng; luật cổng 1,5 s / 0,6 s kẹp sau khi nhân 1 / k; trần thú sống 60 giữ toán ở cổng theo thứ tự hàng; `liveRoom` cho triệu hồi |
| `src/sim/director.ts` (Làn 2) | `games/dragon-hold/src/sim/director.ts` | `06cd4e6` | Nấc của canon §13.2 trên hàng chờ của game này (khoảng sinh, tinh anh, đỉnh, lặng, Linh Dịch); P, I, O theo canon §18.2 (I tính từ Trận Tâm, D46); trạng thái kit băm qua `hashState()` |
| `src/local/nav.ts` (Làn 2) | `games/typing-defense/src/sim/nav/{astar,grid,connectivity}.ts` | `43994b2` | Lưới 0,5 m của `sim/field.ts` theo u; ô chặn nới theo bán kính người chơi 0,4 m; kéo dây đường đi bằng tầm nhìn thẳng; tìm ô trống gần nhất khi bấm vào vật cản |
| `src/view/crowd.ts` (Làn 1) | `games/dragon-hold/src/view/crowd.ts` | `06cd4e6` | Lớp loài theo id của người gọi trên renderer của Làn 1; tô ramp; viền mực bật tắt được; bỏ bóng ma xuyên vật che; tan mực và đốm ngà; khe clip; ma trận instance ghi thẳng, không cấp phát mỗi khung; kiểu `vat`, `impostor` ở mốc 1b |
| `scripts/visual/scenarios/ic-bench.mjs` (Làn 1) | `games/dragon-hold/scripts/visual/scenarios/dh-bench.mjs` | `06cd4e6` | Ca HN0 của canon §20.3 trên `bench.html`; trung vị 3 lượt (`RUNS`); hợp lệ theo chuỗi `renderer`; hiệu từng phần và cột phần vượt; đo cấp phát (`ALLOC`); tự chứa, không import `lib/**` |
| `src/sim/boss.ts` (Làn 5) | `games/dragon-hold/src/sim/boss.ts` | `06cd4e6` | Chỉ lấy khung: đồng hồ chiêu riêng mỗi tướng, gồng (tướng đứng yên) rồi phát ở tick của nó; Tru Đàn và Thú Vương 3 pha viết mới theo canon §10.4–10.5 |
| `src/typing/deck.ts` (Làn 3) | `games/dragon-hold/src/typing/deck.ts` | `06cd4e6` | Canon §17.1, D35, PB-02: khởi đầu lạnh = ≤ 40 từ nền cờ `assumed` (chỉ lấy từ cấp nền trở xuống; thiếu thì bộ từ nhỏ lại, không mượn từ khó hơn) + từ mới trong hạn mức của sổ cái; nhóm thiếu từ thì thu nhỏ bộ từ tới sàn 40; nhận `WordRecord`, trả `DeckWord`; từ a–z 3–8 chữ. Hai nhánh bỏ đi: xem mục "Chỗ cố ý khác nguồn" |
| `src/typing/grading.ts` (Làn 3) | `games/dragon-hold/src/typing/grading.ts` | `06cd4e6` | Chỉ bảng canon §6.5 (không chuỗi, không M_c, không phần chuỗi của tướng); Chớp so với E của hồ sơ chính người chơi, sàn 5 phiên; trần hồ sơ D41; bảng hoạt động canon §17 |
| `src/app/learning.ts` (Làn 3) | `games/dragon-hold/src/app/learning.ts` | `06cd4e6` | Bảng hoạt động canon §17, `channel` ở mọi sự kiện; một sự kiện chấm mỗi từ từ `word-complete` của sim; nháp chạy thử cho bot và hàng đợi từ chối sự kiện của bot hay nháp (D43); `take` của sổ cái từ mới khi `word-first-seen` (canon §6.4); 3 loại câu Thẻ Ôn; bản ghi là `WordRecord` cho `typing/deck.ts`; không phát lại bằng Tab, không bản ghi chỉ trên máy, không hẹn giờ gom |
| `src/app/typing-pace.ts` (Làn 3) | `games/dragon-hold/src/app/typing-pace.ts` | `06cd4e6` | Canon §6.5, §7.5, D18, D41: hồ sơ ghế theo phần nghìn; hàng "chưa biết" 25 WPM với `pace-update` sau đợt 1; trần 10 % chỉ chiều giảm khi đủ tin; sàn Chớp từ 5 phiên cuối; E tính từ từ đã gõ xong với một `d` của `rules.ts` `PACE`; lưu chỉ qua `storage.ts` |
| `src/app/pace-card.ts` (Làn 3) | `games/dragon-hold/src/app/pace-card.ts` | `06cd4e6` | Canon §4.3, D18: hàng "chưa biết" (25 WPM, đo lại sau đợt 1, D41); các hàng lấy từ `paceChoices` của `typing-pace.ts`; phím riêng khi thẻ mở (đứng trước bộ định tuyến phím của trận): ↑ ↓, Enter, số |
| `src/ui/learning-frame.ts` (Làn 3) | `games/dragon-hold/src/ui/learning-frame.ts` | `06cd4e6` | Chỉ phần khung: theo cờ `hint` của từ đang khóa trong sim, nên nghĩa và IPA hiện đúng khi sự kiện ghi `hintUsed` (canon §17, HC7); nằm trên Bàn Quyết; Học trước và Thẻ Ôn tách sang `learn-ahead.ts`, `review-card.ts` |
| `src/ui/learn-ahead.ts` (Làn 3) | `games/dragon-hold/src/ui/learning-frame.ts` (`createPrelearn`) | `06cd4e6` | Là `KeyPanel` của bộ định tuyến phím; mỗi từ một lệnh `learn-ahead{seat, wordId, correct}` (Linh Sa mỗi từ đúng tính trong sim, canon §14.2); sự kiện học qua `app/learning.ts` (`review-card`, `hintUsed` true, không bao giờ là `recall`); không phát lại bằng Tab (Tab không dùng ở MVP, canon §5.1): nút nghe phát lại |
| `src/ui/review-card.ts` (Làn 3) | `games/dragon-hold/src/ui/learning-frame.ts` (`createReviewCard`) | `06cd4e6` | Ba loại câu của canon §17: nghe rồi gõ, đọc nghĩa rồi gõ, chọn nghĩa 1 trong 3 bằng phím 1/2/3; là `KeyPanel` của bộ định tuyến phím; mỗi câu trả lời một lệnh `review-card{seat, wordId, correct}`; chưa đặt chỗ theo `screen-zones.ts` của Làn 6; không phát lại bằng Tab |

## Chỗ cố ý khác nguồn (không "đồng bộ" ngược)

Các làn ghi thêm dòng khi chép (canon §17.1, D35, D44; M0A_PLAN §10):

- `src/typing/deck.ts` (Làn 3): bỏ nhánh hồ sơ trống gắn "known" cho 50 từ (dòng 89–92 của Rồng) và nhánh lấp chỗ `candidate.isNew ? "learning"` (dòng 101–105); khởi đầu lạnh dùng từ nền `assumed`.
- `src/view/feedback-profile.ts` (Làn 6): hồ sơ phản hồi cục bộ thay cho hồ sơ `tutien` trong kit (lên kit ở M0b).
- `src/view/walker-rig.ts` (Làn 1): chỉ lấy trộn clip và ổ cắm của `kit/three/hero.ts`, bỏ locomotion bay.
- `src/content/model-contracts.ts` (Làn 1): thay `MODEL_CONTRACTS` của kit cho nhân vật và thú.
- `src/sim/waves.ts` (Làn 2): giữ luật hết đợt của Rồng (mọi toán đã sinh và 0 thú sống), lặng trước Vương 8 s thay 12 s.
- `src/sim/spawn.ts` (Làn 2): **không** chép luật "khi luật cổng giữ một toán thì cả đợt chờ theo" của Rồng (phần D29 còn chờ anh duyệt ở Rồng); ở đây luật cổng chỉ giãn từng toán, các toán khác cổng vẫn ra (canon §13.1, §23.3).
- `src/sim/fixed.ts` (Làn 2): `mulDiv` làm tròn nửa lên bằng phép nguyên chính xác ở mọi bước (canon §7.2, D38), Rồng dùng `Math.round` trên thương số thực; di chuyển dùng `mulDivSym` (nửa xa số 0).
- `src/app/input-router.ts` (bước 0): không có phím camera, Alt, Shift+Enter của Rồng; phím chữ bị bỏ ngoài lúc Bàn Quyết sống.

## Sửa đang mở ở Rồng Giữ Ải lúc chép (`06cd4e6`, changelog 25/10)

- B1, B7 trượt Nhàn I (cả dải chung và dải D27).
- D27 (dải I ≤ 20 % ở Cân bằng) và phần luật cổng của D29: chờ anh.
- Hộp `box()` và `settle()` một lượt của `kit/feedback/numbers.ts` trôi so với kit (Làn 1 chép `number-field.ts` thì ghi lại).

## Luật

- Đầu mỗi vòng của M0a và M1, Làn 2 so commit nguồn với `games/dragon-hold` hiện tại (`git log` các tệp nguồn), ghi sửa nào cần đem sang và sửa nào không áp (game này đo Nhàn I khác, canon D14). Không tự kéo sửa mà không chạy lại golden và bot.
- Kit: M0a không sửa `shared/game-kit` (D44). Thứ cần cho kit để cục bộ và ghi ở đây; khi cả hai game dùng ổn định cùng một phần (đợt, sinh quái, báo trước, cơ quan, đám đông VAT), đề xuất đưa lên `shared/game-kit`.
