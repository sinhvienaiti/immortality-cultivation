# 02/11/2026: demo di chuyển vòng 2 của lab kỹ năng

Làn diễn xuất, làn va chạm và hai lượt rà soát của vòng 2 đã xong. Bước này quay demo cuối của vòng 2 theo đúng cách vòng 1 để hai giám khảo mới chấm. Không sửa mã game hay mã lab, chỉ sửa công cụ chụp.

## Công cụ chụp (chỉ trong `scripts/visual`, không vào bản build)

- `motion-table.mjs` nhận thêm `--round1=<thư mục demo vòng 1>`. Khi có, bảng có ba cột cho mỗi tốc: mốc đóng băng → vòng 1 → vòng 2, ở 60 Hz và 120 Hz.
  - Các lượt `before-*` đọc trong thư mục demo, nếu không có thì đọc ở thư mục vòng 1.
  - Thêm dòng kiểm tra tay dang (`arms`). `--round1-arms=<metrics.json>` lấy số tay dang cho cột vòng 1, vì demo vòng 1 chưa có bộ kiểm tra này.
  - Thêm bảng `lab-stress` (vòng 1 và vòng 2) và bảng trắng xóa, nếu có `wo-play.tsv` và `wo-follow.tsv`.
  - Không có `--round1` thì bảng giữ nguyên như cũ: chạy lại trên số của `final/` cho `metrics-table.md` và `compare.json` giống từng byte.

## Lần chụp (`tmp/shots/motion/final2/`)

- Cùng chuỗi `lab-motion.mjs`, tốc hợp chân Lam, 45 WPM, đồng hồ cố định, 2.801 khung (46,7 s). Camera chơi và cận cảnh 55°, 6 m; 1920×1080 ở gốc thư mục, 1280×720 ở `720/`. Hai lượt cho số đo giống hệt nhau.
- Lượt chỉ đo trên mã hiện tại: tốc bước 1 ở 60 Hz và 120 Hz, tốc Lam ở 120 Hz, và `lab-stress`.
- Trắng xóa đo trên mọi khung thô trước khi xóa.
- Bảng số đo nằm trong `tmp/shots/motion/final2/metrics-table.md`. Đã xóa khung thô; giữ tờ, clip, metrics và bảng.

## Còn mở

- Chưa có hai giám khảo mới chấm. Chưa commit.
