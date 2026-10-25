# Tài liệu Tu Tiên Thủ Ải

Tài liệu thiết kế đầy đủ nằm ở repo cha, thư mục `docs/games/tu-tien/` (từ gốc
repo này: `../../docs/games/tu-tien`). Thư mục giữ tên `tu-tien/` tới mốc M1,
khi tài liệu chuyển vào `docs/design/` của repo này (canon §0).

| Tệp (repo cha) | Nội dung |
|---|---|
| `00-canon.md` | Nguồn chân lý duy nhất: định danh, từ điển, sổ quyết định D01–D49 (D47 phong cách quý phái, D48 camera thấy toàn sân, nghiêng mặc định 55°, D49 danh sách nhân vật), luật, công thức, bảng số, bảng phím, cổng bot, ngân sách hiệu năng, hợp đồng dữ liệu (§23). Khi lệch, tệp này thắng |
| `M0A_PLAN.md` | Kế hoạch M0a và bản thử Tĩnh Tu: bước 0, làn, đường dẫn sở hữu, hợp đồng, thứ tự, nghiệm thu, cổng, cách đo GPU |
| `DANH_GIA_2026-10-24.md` | Lý do và đánh giá; chỗ khác canon thì canon thắng |
| `analysis/01–09` | Đầu vào và phản biện (đã áp vào canon) |
| `../BALANCE.md` | Khung cân bằng chung: dải đích, bot, cổng B1–B9 |
| `../SPLIT_PLAN.md` | Tách game, kit chung, portal, hạ tầng (§10: cổng 3008) |

Trong repo này:

- `AGENTS.md`: luật cho agent, lệnh chạy.
- `LANES.md`: làn, tệp mỗi làn giữ, hợp đồng giữa các hệ, danh sách lệnh và sự kiện, việc bước 0 đã giao cho từng làn.
- `src/content/types.ts`: hợp đồng dữ liệu (canon §23.3) — mọi trường của `World` và lớp `local`.
- `src/content/rules.ts`: số của luật, mỗi khóa trỏ về mục trong `00-canon.md`.
- `docs/SYNC_DEBT.md`: vé nợ đồng bộ — mã chép từ game khác, commit nguồn, chỗ cố ý khác nguồn.
- `docs/changelog/`: mỗi lần cập nhật một tệp `<ngày>-<chủ đề>.md` (M0a: `<ngày>-m0a-<làn>.md`).
