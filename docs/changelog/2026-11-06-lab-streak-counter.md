# Lab: bộ đếm chuỗi từ, góc trên trái (canon D60, 06/11/2026)

Việc: `docs/work/tasks/streak-counter.md`. Anh chọn hàng mực vàng (05/11 22:45). Lớp ảnh do lab-flipbooks cắt, ở `art-src/lab/ui/streak-counter/`.

- Một con số to ở góc trên trái, đếm **từ sạch liên tiếp** (Tốt trở lên). Chỉ để nhìn, không đổi sát thương.
  - Lab đang hiện bảng điều khiển thì số đứng ngay bên phải bảng; `?ui=0` thì đứng sát góc.
  - Cao 20 % màn hình (140–230 px), đúng khung các tấm nền 538 × 788.
- **Số:** Cormorant Garamond nghiêng, ruột vàng, viền mực, như số sát thương; nằm giữa khoảng mực tối của tấm nền.
- **Mỗi từ sạch:** số nảy 122 % rồi về trong 0,4 s, bay ra một vảy vàng.
  - Chớp: hai tia vàng chéo nhau, ba vảy.
  - Hoàn hảo: một tia.
- **Khá (FAIR):** giữ chuỗi, không cộng, không đứt.
- **Ẩu (SLOPPY):** số tan như mực trong 1,4 s (nhòe, nhạt, có khói mực và giọt mực bay), rồi nền về mốc đầu. Không tắt bụp.
- Chuỗi không bao giờ đứt theo giờ.
- **Mốc 10 / 25 / 50 / 100:** tấm nền đổi dần sang mốc mới trong 0,35 s, kèm loạt vảy vàng và hai tia. Ở mốc 100 có thêm dải lụa.
- **Né chữ quái:** quái nào tới gần khung trong 40 px trên màn hình thì bộ đếm mờ còn 25 %.
- Mọi hình đều từ ảnh đã duyệt: 5 tấm nền, atlas 38 vảy, tia, giọt mực, khói, và dải lụa. Không vẽ hình nào bằng mã.
- **Phím trong lab:** mọi từ của phím 0–7 (theo hạng) và phím C đều đếm. K là một từ Chớp; Shift+K và Shift+C là từ Ẩu.
- **Chưa xong:**
  - mốc chưa nâng độ rực của chiêu (hào quang, hạt): cần nối vào hệ hào quang của từng chiêu;
  - chưa có âm lúc lên mốc;
  - chưa có tổng kết cuối đợt;
  - chưa chấm mù (hệ thống dùng chung, bar 9).
- Kiểm: `tests/lab/streak-counter.test.ts`. Chrome headless đi đủ các mốc 1, 9, 10, 25, 50, 100, rồi Khá giữ chuỗi, Ẩu tan, 0 lỗi.
