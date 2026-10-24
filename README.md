# immortality-cultivation

**Tu Tiên Thủ Ải** (tên tạm): game gõ phím giữ ải 3D của portal Typing Game. Tu sĩ
trấn giữ Thanh Thạch Ải trước thú triều; gõ từ tiếng Anh vào Bàn Quyết (thanh
kỹ năng 5 ô) để xuất chiêu, đi lại trên sân bằng chuột phải hoặc mũi tên, đặt
cơ quan và dùng đan phù lúc nghỉ. Chơi một mình trước; đội 2–3 người với bot ở
các mốc sau.

- `gameId` `immortality-cultivation`, cổng dev **3008**, host `tutien.typing-game.local`.
- Submodule `games/immortality-cultivation` của repo cha (`typing-game`).
- Mốc hiện tại: **M0a** (hộp xám, bench 3D HN0, bản thử Tĩnh Tu). Bước 0 (khung
  repo, hợp đồng dữ liệu, lưu, test ranh giới, định tuyến phím) xong 25/10/2026.

## Tài liệu

- Thiết kế (tiếng Việt) ở repo cha: `docs/games/tu-tien/` — `00-canon.md` là nguồn
  chân lý duy nhất, `M0A_PLAN.md` là kế hoạch xây M0a.
- Trong repo này: [`AGENTS.md`](AGENTS.md) (luật làm việc, lệnh),
  [`LANES.md`](LANES.md) (làn, đường dẫn sở hữu, hợp đồng, sự kiện),
  [`docs/README.md`](docs/README.md), [`docs/SYNC_DEBT.md`](docs/SYNC_DEBT.md)
  (mã chép từ game khác), `docs/changelog/`.

## Chạy

Toolchain (git, node 24, pnpm 11) ở WSL; từ gốc repo cha:

```bash
source scripts/local-env.sh
cd games/immortality-cultivation
pnpm install
pnpm dev        # http://127.0.0.1:3008/ (bench.html, tinh-tu.html)
pnpm check      # kiểm sha256 kit, test, build
```

Repo cha: `pnpm dev:tutien` (portal + game qua nginx), `pnpm build:tutien`.
