# Lab: phím 8 thành kỹ năng tung được lên bầy quái (06/11/2026, đợt 1)

Anh (06/11 00:05): "tạm thời chưa cần chấm, tôi sẽ là người chấm, bạn hãy bắt đầu triển khai từng cái vào lab để nó thành skill để tôi test là được". Việc: `docs/work/tasks/lab-castable-skills.md` (repo cha). Đợt 1: khung chung và 17 mục phím 8 (4 cột trụ, 13 tuyệt kỹ; tuyệt kỹ Ám bảng A chưa có clip, đã có dòng sẵn).

## Khung chung: `src/lab/clip-skills.ts`

- **Một bảng** `ClipSkill` (một dòng mỗi kỹ năng): clip, hệ, `shape` (point, multi, field, line, ring, sweep, path, cone), `radius`, `count`, `strikes` (khung clip và lực), `damage` (light, heavy, ult), `status` (stun, bind, slow), `mark`, `linger`, `guess` (ghi chỗ phỏng đoán). Tên, âm (`tt-sfx-pillar-*`, `tt-sfx-ult-*`) và màu đèn lấy từ danh mục phím 8 có sẵn (`showcase.ts`), không chép hai nơi.
- **Một bộ chạy** `ClipSkillRunner`, không có mã riêng cho từng kỹ năng:
  - chọn đích từ vị trí quái (gộp ô 8 m như phím 7; không có quái thì giữa sân). Cả 8 hình đã có cách chọn đích; đợt 1 dùng point, multi, field;
  - đặt clip đúng chỗ, đúng góc camera chơi (cột trụ đứng trên con quái được chọn);
  - đòn từ trời có ấn trên đất trước 0,2 s: clip `groundMark` của chính hệ, chỉ nạp đúng một atlas đó khi cần, không nạp cả thư mục hệ;
  - cú trúng rơi đúng khung đỉnh của clip (`timing.peak` trong manifest, qua bản đồ thời gian của clip: tới đỉnh trong 0,2 s rồi giữ và tàn); đòn diện rộng lan từ con quái gần tâm nhất, nên cú trúng đầu vẫn khớp khung đỉnh;
  - ấn ở lại 1,5–2,5 s rồi mòn dần.
- **Cùng đường đánh với phím 0–7:** `herd.hit`, sự kiện `impact` (số sát thương qua `DamageCompiler`, âm va chạm, phản ứng), sự kiện `death`, `screen.impact` theo bậc (kỹ năng hoặc tuyệt kỹ: rung và hit-stop), camera kick, đèn chạm. Bậc sát thương trong lab (tạm): nhẹ 0,4 W, nặng 1,2 W, tuyệt kỹ 2,0 W mỗi cú. Trạng thái: choáng và trói giữ quái đứng (`holdBeast`), chậm thì quái đi bằng 35 % (`herd.slow`, mới), viền màu hệ trên quái.
- Phím 8 tung mục đang chọn, Shift+8 chọn mục kế (chú thích hiện tên và thông số), danh sách "Kỹ năng (8)" chọn là tung luôn và ghi hình đánh, bán kính, số cú, bậc sát thương. Không hồi chiêu.

## Bảng đợt 1 (cú sau khung đỉnh là phỏng đoán, ghi trong `guess`)

| Kỹ năng | Hình | Bán kính | Cú (khung clip) | Bậc | Trạng thái | Ấn |
|---|---|---|---|---|---|---|
| Thunder Pillar | point | 2,2 m | đỉnh 0 | nặng | choáng 1 s | có |
| Thunder Field | multi 12 | 1,4 m | đỉnh 0 | nặng | choáng 0,8 s | có |
| Light Judgement | point | 3 m | đỉnh 0 | nặng | choáng 0,6 s | có |
| Fire Meteor | point | 3,6 m | đỉnh 16 | nặng | | có |
| 13 tuyệt kỹ | field | 30 m | đỉnh; vài cú sau trong đoạn giữ (Kim 12; Thủy 12; Hỏa 10, 18; Lôi 6, 12; Độc 8, 16, 24; Huyết 20; Không gian 8; Tinh tú 6, 12) | tuyệt kỹ | theo hệ: Mộc trói 2,2 s, Băng trói 3 s, Thủy và Độc chậm 2,5 s, Phong chậm 1,5 s… | Lôi, Quang, Tinh tú |

## Kiểm

- `tsc --noEmit -p .` sạch; Vitest 1066 test qua (test mới `tests/lab/clip-skills.test.ts`).
- Chrome headless, tung cả 17 mục ở camera chơi, 0 lỗi: phím tới khung phát chiêu là chính khung của phím (phát lệnh và ấn ngay trong lúc bấm, hiện ở khung kế tiếp); cú trúng đầu lệch khung đỉnh của clip 0–1 khung ở mọi kỹ năng; Thunder Field chia 12 điểm, trúng 49 con; tuyệt kỹ trúng cả 87 con.
