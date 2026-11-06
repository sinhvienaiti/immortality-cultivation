# Lab: chiêu duy trì theo nhịp gõ, phím C (canon D61, 06/11/2026)

Việc: `docs/work/tasks/channel-skill.md`, theo bảng "Claude kiểm và chốt" trong `docs/work/consult/streak-channel-gemini.md`.

- **Phím riêng C**, chưa chiếm ô 3 (ô 3 Kiếm vẫn là Hồi Kiếm Hộ Thân).
  - C mở luồng từ tay người chơi vào con quái gần nhất phía trước; lần mở này tính là từ đầu tiên.
  - C lần nữa là thêm một từ.
- **Từ nào gõ xong cũng nuôi luồng:** mọi từ của phím 0–7 (lab chấm hạng theo WPM: Hoàn hảo, hoặc Chớp khi nhanh), và phím C.
- **Mỗi từ:** 1 nhịp đập ngay khung của từ, rồi 4 tick trải trong 0,9 s, nhân theo hạng từ (Chớp 1,25; Hoàn hảo 1,10; Tốt 1; Khá 0,9). Tick của từ sau xếp nối sau tick của từ trước, giữ tối đa 6 từ phía trước. Sát thương tính theo từ, không theo giây.
- **Chỉ đứt khi:** từ ra SLOPPY (Shift+C trong lab), hoặc dừng lâu hơn max(2,5 s, 2 × nhịp phím).
- **Giữa hai từ:** còn một sợi mảnh 0,3 m, mờ hơn, không gây sát thương.
- **Quái chết:** luồng quét sang con gần nhất trong 6 m, trong 0,15 s; không còn con nào thì luồng tắt.
- **Hình, từ clip có sẵn của hệ:**
  - luồng là clip `ribbon` của hệ, không có thì là dải năng lượng lưỡi liềm của hệ;
  - luồng rộng 0,85 m, chảy từ tay về phía quái, sáng ≤ 0,6 trên quái (chữ quái vẫn trên cùng);
  - mỗi nhịp có thêm sáng một chút và `impact` của bộ chất ở con quái;
  - lúc mở có `release` của bộ chất ở tay;
  - lúc đứt, luồng tan bằng erosion 0,7 s.
- **Đánh trúng:** cùng đường đánh của phím 0–7 (slot `kc`): số theo `power`, đèn ở mỗi nhịp, trạng thái của hệ.
- **Chưa xong:**
  - ngân sách sát thương thật của ô và chuyện ô nào để vòng cân bằng;
  - luồng Hỏa và Ám mảnh hơn Thủy, vì clip ribbon của hai hệ này mảnh;
  - chưa chấm mù.
- Kiểm: `tests/lab/channel-skill.test.ts`. Chrome headless ở Thủy, Hỏa, Ám, 0 lỗi: 5 từ cho 5 nhịp và 20 tick, luồng quét sang con kế mỗi lần quái chết, đứt khi dừng.
