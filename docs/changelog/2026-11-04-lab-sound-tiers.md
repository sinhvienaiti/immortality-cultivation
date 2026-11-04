# Âm lab: bậc to khi phát, đầu tiếng release-k7 và send vang chung (phiếu 269)

Ngày: **04/11/2026**. Trạng thái: **xong phần mã và kiểm bằng số; chưa nghe, chưa được chủ dự án duyệt; chưa commit**.

## Thay đổi

- Thêm `src/lab/sound-tiers.ts`: bậc T2–T6 và voice, gain chuẩn theo sự kiện, bus/master, mức send và bảng trim ghi sẵn. Trim bù gain tĩnh ở lần phát chuẩn; voice giữ 0 dB. `LabSound.play()` áp trim sau khi tìm bản theo nguyên tố, cho cả phát trực tiếp và bản ghi. Hệ số power, xô, tier và tốc độ giữ cách tính cũ.
- Nguồn đo nằm trong fixture của repo: giữ `id`, `mMax`, `tp` của đánh giá 04/11; riêng `release-k7` lấy từ `03a.ogg` theo `manifest.next.json`. `world-climax` bị trần true peak giới hạn, thiếu 1,6 LU so với đích −9; chưa dựng lại âm ở phiếu này.
- Chỉ tạo `release-k7/03a.ogg`: bỏ 0,109 s đầu của `03.ogg`, đặt lại PTS, fade-in 3 ms, Opus 128 kb/s, 48 kHz stereo. Đo sau mã hóa: dài 2,84725 s, attack 27 ms, −8,3 LUFS-M, −2,3 dBTP; +500 ms còn −10,3948 dB dưới đỉnh. Đạt cả năm chốt chặn. `manifest.next.json` chỉ đổi `release-k7` thành một take `03a.ogg`; manifest đang dùng và mọi take gốc giữ nguyên.
- Send chung rẽ sau panner, trước gain bus: delay 25 ms → highpass 200 Hz → convolver normalize → lowpass 6500 Hz → return 0,7 → master. Q của hai biquad là −3,0103 dB. Hush hạ cả return xuống 8 %, cùng ramp 12/10 ms với các bus. IR chưa nạp xong thì chỉ đường khô kêu.
- `SoundTake.send` bằng mức send chia gain bus; `gain` đã gồm trim và gain bus. Bộ trộn offline tách nhánh ướt, dùng nền im lặng hết độ dài đầu ra để giữ đuôi `afir`, áp S của Web Audio rồi cộng trước hush/master/limiter. Bản ghi cũ không có `send` vẫn là đường khô. Thiếu IR hoặc metadata mà có send thì báo lỗi. `--ir=<file>` dùng metadata `.json` cùng tên cạnh file IR; trong worktree không có art-src, truyền `--root` tới game thật khi trộn.
- IR `hall-a.wav` là PCM16 stereo, 48 kHz, 2,4 s, hạt giống cố định. S = **0,0085949610853689**, RT60 đo T30 = **2,1987286194219933 s**. Kiểm xung 2,5 s: onset mẫu 384 ở hai kênh; sai lệch năng lượng dưới 0,000001 dB.

**IR là bộ xử lý, không phải âm thay thế. Anh nghe và quyết IR này có đạt không.** Khi có IR thu thật CC0, thay cặp WAV/JSON của IR với S đo lại; đường phát và bộ trộn giữ cấu trúc này.

## Công cụ và kiểm

`scripts/audio/lab-sound-tiers.mjs` có `measure`, `attack`, `trims`, `ir`, `ir --check`. Mỗi lệnh ffmpeg được in trước khi chạy. `attack` chỉ nhận take được phiếu cho phép. Bốn file mới trong art-src được chặn ghi đè trừ `--force`; fixture luôn được ghi lại xác định và báo `created` / `changed` / `unchanged`. `ir --check` chỉ đọc file hiện có, tính lại S/RT60 và kiểm xung, không tạo lại IR.

- TypeScript: không lỗi.
- Vitest đúng cờ phiếu: trước **917/917**, sau **932/932**, thêm 15 test Node, không WebAudio; fixture đủ 34 sự kiện, gồm 10 bản `-fire`.
- Vite đúng cờ phiếu: thoát 0, đầu ra không chứa `SOUND_TRIM_DB` hoặc `hall-a`; đã xóa thư mục dựng tạm.
- `trims`: thoát 0, `fixture: unchanged`; `measure 03a.ogg`: qua năm chốt; `ir --check`: thoát 0, S và RT60 tính lại trùng JSON.
- Bộ trộn chạy thử được nhánh ướt, hush, bản ghi cũ và lỗi thiếu IR. MD5 manifest cùng sáu take k5/k7 gốc trước/sau trùng nhau.

## Còn mở cho Claude và chủ dự án

- **Không cắt `release-k5`**: giữ 01–03; vẫn dâng khoảng 2,1 s. Dựng lại từ stem hoặc quyết định giữ tiếng dâng là phiếu sau.
- Chưa chạy dev server, trình duyệt, quay cảnh hay nghe. Claude kiểm lại 1–7, thử manifest mới trên bản thử, đo từng sự kiện bằng bản trộn chỉ chứa take của sự kiện đó và gửi video có tiếng cho anh.
- Nghe `03.ogg` cạnh `03a.ogg` để quyết tiếng rút kiếm đầu có bị mất không; nghe IR trong cảnh thật. Chỉ gộp sau khi anh nghe.
- Voice chưa duck các bus khác; đỉnh bản trộn đủ có thể vượt cao trào. Master live chưa có limiter. Hai việc này, âm cut-in/tiếng hô/Song Long và lớp lấp lánh của Lửa đều ngoài phiếu 269.

Báo cáo đầy đủ, bảng trim và MD5: `docs/codex-queue/269-report.md` ở repo cha.
