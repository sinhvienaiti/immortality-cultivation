# 02/11/2026: demo di chuyển của lab kỹ năng (MOTION_PLAN bước 4)

Bước 2 (nhân vật) và bước 3 (VFX chiêu Kiếm) đã xong và đã rà soát. Bước này quay demo cuối để hai giám khảo mù chấm. Không sửa mã game hay mã lab, chỉ sửa công cụ chụp.

## Công cụ chụp (chỉ trong `scripts/visual`, không vào bản build)

- `scenarios/lab-motion.mjs`:
  - Vùng cắt của tờ chuyển tiếp nay tính theo `--width`, nên chụp 1920×1080 cho cùng bố cục với 1280×720.
  - Ghi thêm `frames.json` (vị trí nhân vật trên màn hình mỗi khung), để dựng lại tờ khi `raw/` còn.
  - Gọi `motion-segments.mjs` để làm tờ khung theo đoạn.
- `motion-segments.mjs` (mới): mỗi pha của chuỗi một tờ 12 khung ở camera chơi (một phần ba khung hình quanh nhân vật) và một tờ 12 khung ở cận cảnh 55°, 6 m.
  - Khung chia đều từ khung đầu tới khung cuối của pha.
  - Mẫu gần nhất được dời vào các mốc: đổi clip, phím cuối, đỉnh đòn (phím cuối + 0,15 s), trúng đòn, giật lùi (trúng đòn + 0,1 s).
  - Chạy riêng được: `node scripts/visual/motion-segments.mjs <thư mục lần chụp>`.
- `motion-table.mjs` (mới): bảng số đo trước và sau theo ngưỡng của bước 1. Đọc các lần chạy trong một thư mục demo, ghi `metrics-table.md` và `compare.json`.

## Lần chụp (`tmp/shots/motion/final/`)

- Demo ở tốc hợp chân Lam (đi 0,6, chạy 3,0, đi ngang 0,45 m/s), 45 WPM, 2.777 khung (46,3 s).
- Hai độ phân giải, camera chơi và cận cảnh:
  - 1920×1080 ở gốc thư mục;
  - 1280×720 ở `720/`.
- Hai lượt cho số đo giống hệt nhau (đồng hồ cố định).
- Mốc chạy lại trên bản lab bước 1 đóng băng (`tmp/motion-s2/baseline-facing-m`), cùng bộ đo: tốc bước 1, tốc Lam, 60 Hz và 120 Hz.
- `lab-stress.mjs` chạy lại trên mã cuối, vẫn 0 lớp bật/tắt và 0 lỗi kiếm.

## Còn mở

- Chuỗi dài 46,3 s, kế hoạch ghi 60 s. Đã giữ chuỗi cũ để số đo so được với mốc.
- Còn 4 nhóm ngưỡng chưa đạt:
  - 2 lần chuyển clip vượt 1,5 ×: bắt đầu đi 2,58; dừng 1,57;
  - trượt chân: chân trụ p95 0,117 m/s, cả hai chân p95 1,29 m/s;
  - dáng gồng khác đỉnh đòn dưới 15 % ở 4/6 chiêu (đo ở khung nhả: 6/6, về cấu trúc không đạt được);
  - 9 khung dash trên 15 m/s.
- Số chi tiết nằm trong `tmp/shots/motion/final/metrics-table.md`.
- Chưa có hai giám khảo mù chấm. Chưa commit.
