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

## Đợt 2: A1–A8 diện rộng ở phím 9

- Bảng `KEY9_SKILLS` chép từ `docs/work/tasks/clip-skills-expansion.json` (lab-flipbooks, 06/11): hình, bán kính, số điểm, các cú (cú đầu, rồi số giây sau nó), bậc, trạng thái, ấn, dư âm, file âm `tt-sfx-x-<id>/takeN.wav` (bảng chọn take nào thì phát take đó).
- **Chỗ đã sửa so với bảng (ghi lại theo lời điều phối):**
  - cú đầu của bảng là giờ phỏng đoán (0,2–0,4 s; clip đã sáng hết từ khung 0, không đo được khung chạm). Nay cú đầu rơi đúng khung đỉnh của clip theo luật nghiệm thu; các cú sau giữ đúng nhịp của bảng tính từ cú đầu;
  - bảng không ghi trạng thái kéo dài bao lâu, lab tạm dùng choáng 1 s, trói 1,8 s, chậm 2 s;
  - A2: vực chém chạy chéo 35° trên màn hình, tức 40° trên mặt đất ở camera 55°; nay là một đường qua giữa sân theo góc đó, không bắn từ người chơi;
  - A8: gai mọc từ mép sân quất vào trong, nên vòng khép từ mép vào tâm;
  - A5 quét cả vòng quanh tâm clip.
- **Khung chung thêm:**
  - hình trải theo chỗ clip đứng: clip cảnh đứng giữa sân, clip hình người đứng trên cụm quái dày nhất (A6);
  - cú `tick`: sát thương nhẹ, không hit-stop, không rung;
  - số sát thương theo `power` của cú;
  - hai phím dùng chung ấn đất, mỗi hệ một atlas.
- Phím 9 tung mục đang chọn, Shift+9 chọn mục kế. Mục chưa có dòng trong bảng (B, C, D) vẫn chỉ phát video.
- Kiểm: 1067 test qua. Chrome headless tung A1–A8, 0 lỗi; cú đầu lệch khung đỉnh của clip ≤ 1 khung. Bị trúng mỗi chiêu: A1 81 con, A2 30, A3 47 (7 điểm), A7 58 (7 điểm), các chiêu cả sân 68–87 con.

## Đợt 3: C1–C8 thần thú ở phím 9

- Thêm 8 dòng C1–C8 vào `KEY9_SKILLS`, cùng cách chép và cùng các chỗ sửa như đợt 2.
- **Hình `path` (C1 rồng, C3 chu tước): thân thần thú bay thật qua sân.**
  - Thẻ clip, cỡ 0,55 khung nhìn, bay từ mép này sang mép kia qua chỗ clip đứng trong 1 s.
  - C1 bay trái sang phải, C3 bay nam lên bắc, đúng dòng lối chơi.
  - Quái bị trúng đúng lúc thân bay tới nó, bị đẩy ra hai bên đường bay.
  - Ấn lửa hay ấn sét nằm dọc đường bay.
  - Riêng hình này cú đầu không đặt vào khung đỉnh của clip, mà vào lúc thân tới con quái đầu tiên (C3 khoảng 0,5 s).
- **C2 bạch hổ:** bốn vệt vuốt song song theo đường chéo 30° của clip, qua cụm quái dày nhất.
- **C4–C8 dùng hình có sẵn,** trải theo chỗ clip đứng:
  - C4: vòng quanh cụm quái, có ấn 0,2 s;
  - C5: 3 dấu móng;
  - C6: cả sân;
  - C7: vòng, chậm;
  - C8: quét cả vòng, choáng.
- Kiểm: 1068 test qua. Chrome headless tung C1–C8, 0 lỗi: C4 và C5 lệch khung đỉnh 0 khung, C2, C6, C7, C8 và rồng C1 lệch 1 khung. Bị trúng mỗi chiêu: rồng 39 con, hổ 69, chu tước 41, rùa 53, kỳ lân 40, côn bằng 87, bạch trạch 68, hồ 53.
