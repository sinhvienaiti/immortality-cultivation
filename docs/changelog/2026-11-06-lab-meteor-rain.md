# Lab: mưa sao băng nghiêng, phím M (canon D62, 06/11/2026)

Việc: `docs/work/tasks/slanted-meteor.md` (repo cha). Anh duyệt 05/11 22:20; bài học 1–3 của `REF_VIDEO_LESSONS_2026-11-05.md`.

- Phím **M** tung mưa sao băng theo hệ đang chọn (E). Có cho mọi hệ.
- **Đích và nhịp:**
  - tối đa 8 con quái, cụm dày nhất trước, mỗi con một sao băng;
  - quét từ trái sang phải, cú nọ cách cú kia 0,27 s;
  - cú đầu 0,2 s sau phím, cú cuối 2,09 s (≤ 2,5 s).
- **Ấn đánh dấu:** clip `groundMark` của hệ hiện dưới con quái 0,2 s trước cú.
- **Sao băng:**
  - rơi chéo 20° so với phương thẳng đứng, từ trời xuống đất trong 0,18 s;
  - đầu là lưỡi liềm của chính hệ (clip `<hệ>-crescent-sym`, hệ nào cũng có), cầm nguyên, mặt lồi đi trước theo hướng rơi;
  - sau đầu là vệt mềm ngắn 2 m, cắt từ dải năng lượng của chính lưỡi liềm đó.
- **Cú chạm và đất cháy:**
  - dùng `impact` và `aftermath` của bộ chất hệ: đòn xuống đất, vết cháy từ tranh tan bằng erosion, than hồng;
  - hệ không có hai hook đó (Kim) thì dùng clip `impact` của thư mục và ấn đất nằm lại 2 s.
- **Đánh trúng:** cùng đường đánh của phím 0–7 (slot `km`): số sát thương, phản ứng, chết, hit-stop, rung, kick, đèn, trạng thái của hệ.
- **Chưa có:**
  - Độc, Huyết, Không gian, Tinh tú, Quang không có clip `impact` hay `burst`, nên chỗ chạm chỉ có ấn, dư âm và đèn;
  - Ám không có `groundMark` nên không có ấn trước cú;
  - chưa chấm mù 8,5.
- Kiểm: test `tests/lab/meteor-rain.test.ts`. Chrome headless tung ở 6 hệ (Hỏa, Thủy, Lôi, Kim, Ám, Độc), 0 lỗi, mỗi lần 8 sao băng, 19 cú trúng.
