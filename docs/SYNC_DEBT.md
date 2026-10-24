# Vé nợ đồng bộ (canon D16, M0A_PLAN §10)

Mọi tệp chép từ game khác có một dòng `// Source: games/<repo>/<đường dẫn> @<commit> (adapted: …)`
và một dòng trong bảng dưới. Không import chéo repo. Chủ tệp này: bước 0 viết, **Làn 2 giữ** từ nay.

## Bảng chép

| Tệp của game | Tệp nguồn | Commit nguồn | Đổi gì khi chép |
|---|---|---|---|
| `vite.config.ts` | `games/dragon-hold/vite.config.ts` | `06cd4e6` | Cổng 3008, host mặc định `tutien.typing-game.local`, 3 trang (`index`, `bench`, `tinh-tu`), `server.watch.usePolling` khi `CHOKIDAR_USEPOLLING=1` |
| `src/app/contracts.ts` | `games/dragon-hold/src/app/contracts.ts` | `06cd4e6` | `FrameInfo.local` (lớp `local`), `LocalSink`; `Quality` lấy từ `content/types.ts` |
| `src/app/loop.ts` | `games/dragon-hold/src/app/loop.ts` | `06cd4e6` | Trả `LoopTiming`; app ghép `local` thành `FrameInfo` |
| `src/app/input-router.ts` | `games/dragon-hold/src/app/input-router.ts` | `06cd4e6` | Bảng phím canon §5.1 (không camera, không Alt); chế độ cửa hàng `` ` ``; lệnh mang `seat`, `origin`, `aim`; phím chữ chỉ thành lệnh khi Bàn Quyết sống; mũi tên thành `arrows` của `local`; chuột phải `move-to`, chuột trái `soft-target`; đổi phím theo `.settings` |
| `tests/boundary.test.ts` | `games/dragon-hold/tests/boundary.test.ts` | `06cd4e6` | Nhóm thuần thêm `src/local`, `src/tinh-tu/sim`; cấm thêm `fetch`, `indexedDB`, `XMLHttpRequest`, `WebSocket`; cấm chạm tới `kit/feedback/audio-cues`, `kit/audio/dragon-voice` qua mọi chuỗi import (kể cả barrel); cấm `OscillatorNode`, `createOscillator`; chỉ `src/app/storage.ts` chạm storage |
| `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `index.html` | cùng tên trong `games/dragon-hold` | `06cd4e6` | JSON/YAML/HTML không có dòng `Source`. `package.json`: tên, mô tả, cổng 3008, lệnh `ic:*`, `tt:bots`, `visual` qua `src/kit/tools/cdp-run.mjs`, bỏ `@fontsource/cormorant-garamond`; `index.html`: `#ic-app`, `#ic-canvas`, `#ic-overlay`, `#ic-quyet`; các tệp khác giữ nguyên |
| `src/content/rules.ts` `TierRow` | `src/kit/three/stage.ts` `StageTier` (kit) | kit 0.1.0, commit cha `512033e9` | Khai lại cùng hình dạng vì `rules.ts` thuần không được import `three`; Làn 1 truyền `TT_TIERS` thẳng vào `Stage3D` |

## Chỗ cố ý khác nguồn (không "đồng bộ" ngược)

Các làn ghi thêm dòng khi chép (canon §17.1, D35, D44; M0A_PLAN §10):

- `src/typing/deck.ts` (Làn 3): bỏ nhánh hồ sơ trống gắn "known" cho 50 từ (dòng 89–92 của Rồng) và nhánh lấp chỗ `candidate.isNew ? "learning"` (dòng 101–105); khởi đầu lạnh dùng từ nền `assumed`.
- `src/view/feedback-profile.ts` (Làn 6): hồ sơ phản hồi cục bộ thay cho hồ sơ `tutien` trong kit (lên kit ở M0b).
- `src/view/walker-rig.ts` (Làn 1): chỉ lấy trộn clip và ổ cắm của `kit/three/hero.ts`, bỏ locomotion bay.
- `src/content/model-contracts.ts` (Làn 1): thay `MODEL_CONTRACTS` của kit cho nhân vật và thú.
- `src/sim/waves.ts` (Làn 2): giữ luật hết đợt của Rồng (mọi toán đã sinh và 0 thú sống), lặng trước Vương 8 s thay 12 s.
- `src/app/input-router.ts` (bước 0): không có phím camera, Alt, Shift+Enter của Rồng; phím chữ bị bỏ ngoài lúc Bàn Quyết sống.

## Sửa đang mở ở Rồng Giữ Ải lúc chép (`06cd4e6`, changelog 25/10)

- B1, B7 trượt Nhàn I (cả dải chung và dải D27).
- D27 (dải I ≤ 20 % ở Cân bằng) và phần luật cổng của D29: chờ anh.
- Hộp `box()` và `settle()` một lượt của `kit/feedback/numbers.ts` trôi so với kit (Làn 1 chép `number-field.ts` thì ghi lại).

## Luật

- Đầu mỗi vòng của M0a và M1, Làn 2 so commit nguồn với `games/dragon-hold` hiện tại (`git log` các tệp nguồn), ghi sửa nào cần đem sang và sửa nào không áp (game này đo Nhàn I khác, canon D14). Không tự kéo sửa mà không chạy lại golden và bot.
- Kit: M0a không sửa `shared/game-kit` (D44). Thứ cần cho kit để cục bộ và ghi ở đây; khi cả hai game dùng ổn định cùng một phần (đợt, sinh quái, báo trước, cơ quan, đám đông VAT), đề xuất đưa lên `shared/game-kit`.
