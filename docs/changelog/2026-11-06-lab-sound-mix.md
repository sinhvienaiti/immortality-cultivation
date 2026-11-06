# Lab: lượt trộn âm cho mọi chiêu (06/11/2026)

Việc: điều phối giao 06/11 ~10:00. Theo `game-art-pipeline` `references/audio.md` §5.4–5.5 và bài 11 của `REF_VIDEO_LESSONS_2026-11-05.md`. Bảng số trước/sau: nhật ký `docs/work/tasks/lab-castable-skills.md` (06/11 11:05).

- **Ba bậc:** thường (phím 0, 1, 3, 4, C), nặng (2, 5, M, phím 8 cột trụ, phím 9 không phải tuyệt kỹ), tuyệt kỹ (6, 7, phím 8 tuyệt kỹ, phím 9 tuyệt kỹ). Tiếng hô chiêu thường −6 dB, nặng −3 dB; tiếng phát chiêu phím 2 và 5 lên T5.
- **Phím 8, 9:** file Firefly đi qua bus của lab (vang, bản ghi, bộ giới hạn) thay cho thẻ `<audio>`, mỗi file về bậc của nó theo số đo (`FIREFLY_LEVELS`), tắt dần từ 3,6 s. Take 4 của Immortal Sword Progenitor gần như câm: dùng take 3.
- **Không chồng đuôi:** tối đa 6 tiếng trúng, 4 tiếng chết, 2 âm lớn cùng lúc; tiếng cũ nhất tắt dần.
- **Đỉnh:** dồn chiêu từng lên +3…+10 dBTP (lab không có bộ giới hạn, nên vỡ tiếng). Nay cả bản trộn hạ 3 dB và có bộ giới hạn; âm UI đi sau bộ giới hạn.
- **Hạ nhạc trước cú lớn:** bus nhạc (`?music=<url>`, lab chưa có nhạc), hạ 6–7 dB từ 0,3 s trước cú của phím 2, 5, 6, 7, M, 8, 9.
- **Chừa chỗ cho tiếng phím:** vang và vòng lặp khoét −3 dB ở 1–4 kHz.
- **Sửa số đo:** độ lợi âm Firefly của `1ef64be` tính lại bằng ebur128 (thước cũ sai; luồng khí và sao băng nhỏ hơn 6–7 dB).
- **Bản trộn offline** (`scripts/visual/mix-lab-sound.mjs`) làm y như khi chạy thật: chỗ bắt đầu trong file, tắt dần, giới hạn giọng, khoét 1–4 kHz trên vang, bus nhạc với `--music`, đầu ra thô với `--raw`.
- Kiểm: 103 tệp, 1086 test qua; Chrome headless thời gian thật, mọi âm phát, 0 lỗi.
