# Lab: âm Firefly mới cho bộ đếm, luồng khí, sao băng và D6–D8 (06/11/2026)

Việc: điều phối giao 06/11 ~09:05. Âm ở `art-src/lab/firefly-sprint-2026-11-05/sound/`. Chọn bản bằng số đo (đỉnh, LUFS, đầu, đuôi, có vỡ tiếng không); bảng số: `typing-game-review/captures/tu-tien/lab-sounds/measure-2026-11-06.md`. Anh nghe và chốt.

- **Cách phát:** `LabSound.playTake` và `loopTake` (`src/lab/sound.ts`) đi qua các bus, vang và bản ghi của lab. Mỗi bản có độ lợi đưa độ to tối đa về đúng tầng (`LAB_TAKES`), bỏ khoảng lặng đầu file để âm vang đúng khung sự kiện.
- **Bộ đếm (âm UI, khô, nhẹ):** từ sạch: tiếng tích ngọc (take 4); Chớp: chuông vàng (take 3); lên mốc 10/25/50/100: đàn tranh và chuông (take 3) thay tiếng tích; đứt chuỗi: nét bút mực (take 4, mờ dần từ 1,2 s). Khá: im.
- **Luồng khí, phím C:** mở luồng: tiếng bùng (take 2) và vòng lặp gầm (take 8, nối mối 0,25 s); mỗi từ: một nhịp dồn (take 3 và 6 luân phiên); giữa hai từ vòng lặp hạ xuống 55 %; đứt: tiếng tan (take 1), vòng lặp tắt theo 0,7 s erosion. Tick và tiếng phát chiêu chung của luồng không kêu nữa (nhịp đã có âm riêng).
- **Sao băng nghiêng, phím M:** take 2 cho ngôi đầu (vào giữa tiếng rít để tiếng nổ trùng lúc chạm), take 7 trọn vẹn cho ngôi cuối; giữa hai ngôi giữ tiếng trúng của lab. Tối đa 2 giọng.
- **Phím 9, D6–D8:** có âm riêng thay âm tuyệt kỹ tạm: D6 take 3 từ 0,35 s, D7 take 2 từ 0,8 s, D8 take 7 từ 0,08 s (`#t=` trong `sfx`).
- Kiểm: Chrome headless thời gian thật, mọi âm đều phát, 0 lỗi; 101 tệp, 1078 test qua.
