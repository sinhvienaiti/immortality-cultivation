# 02/11/2026: lab kỹ năng đổi theo vũ khí đang trang bị

Theo canon D55 (chủ dự án, 02/11): kiếm quang của mọi chiêu là bản sao của món đang trang bị.

## Đã làm (chỉ trong lab dev, không vào bản build)

- `src/view/skills/weapons.ts`: danh sách 10 món đợt 1 theo `docs/games/tu-tien/skills/WEAPON_DESIGN.md` §6.
  - Mỗi món có tên tiếng Anh, tên Hán Việt, họ và hệ.
  - Màu nhấn lấy từ `SKILL_CATALOG.md` §1. Hỏa dùng dải lửa thật, không dùng đỏ của địch `#FF4A4A`.
  - Màu rãnh và bộ màu VFX suy ra theo luật bloom: quầng ≤ 0,9, lõi HDR 3–6, lõi trắng ≤ 30 %.
- `BladeSet` đổi được hình lưỡi khi đang chạy, vẫn một InstancedMesh, một draw call, không cấp phát mỗi khung.
  - Bộ nạp GLB gộp model thành một geometry theo quy ước của kiếm.
  - Khi chưa có file `/art-src/lab/models/weapons/<id>.glb` thì dùng thanh kiếm tạm.
- `KiemFx.setWeapon`: đổi màu mọi lớp trước đây cố định lam thép (thẻ sáng, ribbon, vệt, sprite, trận đồ trên đất, chớp sáng, tia lửa, màu trúng thú). Món không thuộc họ kiếm bị từ chối.
- Lab: cờ `?weapon=<id>`, ô chọn 4 kiếm, phím W, `window.__lab.setWeapon(id)`. Kịch bản chụp đọc biến `WEAPON`.

## Kiểm tra

- `tsc --noEmit` qua; vitest 74 tệp, 675 test qua.
- `pnpm build` qua, `dist` không chứa lab.
- Tờ khung K1 và K5 cho 4 kiếm ở `tmp/lab/weapons/sheet-<id>.jpg`: mỗi kiếm đúng màu hệ, không khung đen, NaN hay cháy trắng.

## Còn mở

- Cả 4 kiếm vẫn dùng thanh tạm, vì thiết kế vũ khí chưa đạt 8,5 và chủ dự án chưa duyệt, nên chưa có GLB.
- Ở camera chơi, hiệu ứng còn mờ và hiền. Theo D56 (02/11: hoành tráng kiểu anime và thần thoại, không như thật), VFX các chiêu cần nâng lên bùng nổ, có hào quang, trước khi chấm.
- Agent phản biện của lượt này bị dừng lúc 12:30 theo yêu cầu chủ dự án. Claude đã tự chạy lại tsc và test sau khi dừng.
