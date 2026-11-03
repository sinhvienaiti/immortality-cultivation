# Lab kỹ năng: cut-in tuyệt kỹ hai khung (phong cách C), tiếng hô giọng nữ 3, video có tiếng (03/11/2026, buổi sáng)

Lý do, lời anh sáng 03/11 về cut-in cũ: "hình nhân vật đứng im, k khẩu hình, không cử chỉ, ánh mắt không thể hiện 1 chút nào về skill". Về tiếng hô: "hầu hết các âm đều đạt, chỉ có âm tiếng hô tôi vẫn chưa ưng về giọng". Sau hai vòng nghe, anh chốt tạm giọng nữ 3 và khen phần vang ("phần vang này làm tôi thấy khá thích, bạn nên chỉnh độ vang cho hay thêm chút nữa"). Anh chọn phong cách C cho cut-in.

Lab vẫn là trang dev, không vào bản build. Tranh và file âm là media trong `art-src`, không vào Git.

## Cut-in hai khung

- **Tranh:** ChatGPT (Chat, thinking High) vẽ 3 phong cách × 2 khung cùng bố cục: tụ lực (mắt khép, môi mím, giơ ấn kiếm) và hô (mắt mở sáng lam, miệng hô, ấn kiếm đẩy tới, kiếm trời chĩa xuống).
  - A là donghua 3D, B là anime cel, C là thủy mặc pha ánh sáng.
  - Tệp và prompt ở `art-src/skills/cutin/tt-cutin-<a|b|c>-<gather|shout>.v1-try1.{png,prompt.txt}`.
  - Anh chọn C. C cũng là bản giữ bố cục giữa hai khung tốt nhất.
- **Cách chạy** (`src/lab/cutin.ts`, `CutInSpec.art`):
  - dải chéo cao hơn (`ART_BAND`);
  - tranh phủ cả dải, mép trên mờ dần vào dải;
  - khung tụ lực đẩy nhẹ vào và trôi lên theo gió;
  - đúng `shoutAt` thì cắt sang khung hô: chớp sáng ở mặt, đẩy cận 1,07 rồi lắng, rung 8 px trong 0,18 s, vệt tốc độ chạy nhanh hơn, ấn đỏ đóng xuống cùng tiếng hô.
- **Trong lab** (`skills-main.ts`): tuyệt kỹ dùng C, giữ thế giới 1,7 s.
  - Chữ "天" của câu hô `callout-k5/01.ogg` bắt đầu ở khoảng 1,04–1,15 s, nên khung hô cắt ở 1,08 s.
  - Đổi file câu hô thì phải chỉnh lại `shoutAt`.
  - `?cutin=` ngắn hơn thì cắt sớm hơn (`shoutAt = min(1,08; 0,64 × thời lượng)`).

## Sửa sau hai vòng duyệt mã độc lập

Hai agent chỉ đọc, một soát đúng sai và thời điểm, một soát chi phí vẽ và bố cục ở 6 cỡ màn hình, tìm ra các lỗi sau (commit `31b0258`):

| Lỗi | Sửa |
|---|---|
| Tên chiêu đè ấn kiếm của nàng; ấn đỏ đè chữ "RAIN" ở màn hẹp hơn 16:9; tên tràn mép phải ở 16:10 và 4:3 | `fitTitle()`: đo bề ngang chữ một lần trong `start()`, căn phải, đặt sát mép dưới dải, thu nhỏ dần (6,2 % → 3,4 % chiều cao) tới khi không chạm vùng mặt và bàn tay của cả hai khung (`CutInFrame.keep`) |
| Tâm mặt khung hô của C nằm trên chân tóc, mặt nhảy 68 × 55 px khi cắt | neo cả hai khung giữa hai mắt: (0,306; 0,224) và (0,31; 0,235) |
| Chớp sáng và đẩy cận tính từ `shoutAt`, khung đầu chỉ còn 55–85 % độ mạnh | chốt thời điểm cắt ở khung đầu tiên hiện khung hô |
| Rung cả dải làm hở cột 3–6 px của thế giới ở mép màn hình | chỉ rung lớp tranh (tranh rộng hơn dải) |
| Khung hô ở độ mờ 0 nên chưa được vẽ trước khi cắt | để ở 0,4 %, giữ lại ảnh đã giải mã |
| Tên mất bóng đổ ngoài lúc chớp | giữ bóng đổ tối khi có tranh |
| Đọc `offsetWidth` mỗi khung | dùng bề ngang đã đo |
| Tiếng hô bị dao tốc độ ±4 %, chữ "天" xê dịch ±45 ms | bus giọng không bao giờ dao tốc độ |
| Bấm R giữa cut-in, tiếng hô vẫn chạy và chồng lên lần sau | `reset()` dừng các tiếng hô đang phát |
| 5 kịch bản đo cũ tính tuyệt kỹ theo 0,9 s | ghim `?cutin=0.9` |

Đã kiểm ở 1280×720, 1920×1080, 1440×900, 2560×1080, 1024×768 và 768×1024: mắt đứng yên qua cú cắt, chớp nằm ở mặt, tên chiêu không chạm bàn tay, ấn không đè chữ.

## Tiếng hô giọng nữ 3

Firefly Speech (model Adobe), tiếng Phổ thông, Brittney, cao độ +3, tốc độ 1,1. Xử lý gồm lọc "làm trong" rồi vang bằng phản hồi xung tự tạo; chi tiết và 4 kiểu vang ở `docs/games/tu-tien/skills/FIREFLY_BATCH_2026-11-03.md`. Gắn tạm, chờ anh chọn kiểu vang:

| Sự kiện | Câu | Vang |
|---|---|---|
| `callout` (chiêu nhỏ) | 喝！, 哈！ | Room (1,8 s) |
| `callout-k2`, `callout-guard`, `callout-k4` (mới trong `SOUND_IDS`) | 七星，列锋！; 不动。; 万锋——听诏！ | Grand Hall |
| `callout-k5`, `callout-k7` | 剑心所至，天地皆开！; 万剑——朝宗！ | Valley Echo |

## Video có tiếng

Chụp theo bước cố định thì không có âm thanh thật. Giờ lab ghi lại tiếng nó định phát:
- `__lab.soundRecord()` bật ghi, `__lab.soundTakes()` lấy danh sách: file, độ lớn theo bus, tốc độ, trái phải, hạ âm, trên đồng hồ lab (`src/lab/sound.ts`).
- `scripts/visual/mix-lab-sound.mjs` dựng lại tiếng bằng ffmpeg, mô phỏng `StereoPannerNode`, rồi ghép với khung hình.
- Video đầu tiên: tuyệt kỹ với cut-in C, `tmp/shots/cutin/tu-tien-ult-cutin-c-sound.mp4`, 1080p, 60 khung/s, 49 tiếng ghi được, −11 LUFS. Tiếng hô ở khung bấm phím, khung hô ở 1,40 s, nhát kết đúng 1,7 s sau.

## Vòng duyệt thứ hai (commit `757b669`)

Hai agent chỉ đọc kiểm lại các bản sửa và phần ghi tiếng, tìm thêm 12 điểm, đã sửa hết:

| Lỗi | Sửa |
|---|---|
| Bề ngang tên được đo trước khi phông 700 tải xong, nên cut-in đầu tiên mỗi lần mở trang xếp tên theo phông dự phòng | lab tải đúng phông 700; `start()` đo lại khi phông tải xong |
| Rung lớp tranh vẫn hở cột 5–6 px ở mép màn hình | rung vị trí ảnh bên trong khung, khung đứng yên |
| Màn dọc không có cỡ nào né được tay, hàm lấy cỡ cuối | lấy cỡ chồng lấn ít nhất |
| Dải khép mà tên đứng yên, mép dải cắt ngang chữ | tên trôi theo dải |
| `?cutin=0.05` lại hiện khung hô; ấn đóng trước cú đổi khung | dưới 0,6 s không dùng tranh; ấn không bao giờ đóng trước cú đổi |
| Khi đang ghi, reset không cắt câu hô trong bản trộn | ghi dấu dừng giọng, bản trộn cắt kèm fade 10 ms |
| Lần hạ âm lệch 4–15 ms, không có dốc | tính theo từng mẫu, dốc 12 ms xuống và 10 ms lên |
| Tiếng trúng gộp ghi trễ một khung; phép so khoảng cách mất khoảng 1/4 tiếng kiếm bay ngang | đồng hồ tăng sau cùng; so có sai số cho phép |
| Đường dẫn có `'` hoặc `=` làm hỏng lệnh trộn | mỗi file một đầu vào `-i`, không còn phải thoát ký tự |
| Tiếng mono lệch kênh to hơn 2,9 dB | áp đúng luật mono của Web Audio |
| Thời lượng mặc định cắt cụt tiếng dài | tính tới hết tiếng dài nhất, có fade cuối |

## Tranh C nét gấp đôi

Hai khung C được nâng lên 3671 × 1713 bằng **Firefly Upscaler** (Firefly web, Edit > Upscale, model của Adobe, chạy bằng Photoshop). Bản nâng thêm chi tiết thật (mi mắt, sợi tóc, vết nứt hào quang), trong khi phóng Lanczos 2× chỉ làm mờ. Tệp ở `art-src/skills/cutin/tt-cutin-c-{gather,shout}-up2x.v1-try1.jpg`, ghi chú nguồn bên cạnh.

## Còn mở

- **Kiểu vang:** anh chưa chọn.
- **Chấm mù:** chưa chấm mù 8,5 ở bản build chơi.
