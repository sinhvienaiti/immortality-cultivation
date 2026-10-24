# src/kit — chép từ `shared/game-kit`

Thư mục này do `node scripts/sync-game-kit.mjs --target games/<id>` ở repo cha tạo ra.

- **Không sửa tay.** Mọi file được kiểm sha256 theo `kit-manifest.json`.
- `node src/kit/verify-kit.mjs` báo lỗi khi một file khác bản kê. Lệnh `check` của game chạy nó.
- Muốn đổi kit: sửa ở `shared/game-kit`, chạy `pnpm kit:test`, rồi `pnpm kit:sync --target games/<id>`.
- Chọn module trong `kit.config.json` của game.
