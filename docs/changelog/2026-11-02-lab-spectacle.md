# 02/11/2026: lab kỹ năng Kiếm theo phong cách hoành tráng (D56)

Theo D56 (chủ dự án, 02/11: "bùng nổ, đẹp, hào quang, thu hút của các phim anime hoặc các thần thoại"), bảy chiêu Kiếm trong lab dev được nâng từ kiểu "thật, hiền" lên kiểu anime và donghua: tụ lực có trận đồ và hào quang, tung đòn bùng nổ, kiếm quang có lõi nóng và quầng màu, trúng đòn nhiều lớp, có cột sáng cho đòn lớn, dư âm còn đọng lại.

Chỉ sửa phần hình (`src/view/skills`, `src/lab`, kịch bản chụp). Không đụng `src/sim`, `src/content`, golden. Không tạo hay tải thêm ảnh: chỉ dùng texture Kenney CC0 đã có trong `art-src/lab/tex` (thêm `circle_03`, `light_01`, `twirl_01`).

## Khối dựng mới (`fxkit.ts`)

- **`BeamPool`**: dải sáng quay theo trục, mặt hướng camera, một draw call. Lõi HDR mảnh nằm trong quầng màu ≤ 0,9, có gợn năng lượng chạy dọc. Dùng cho cột sáng, tia bung, vệt kiếm quang rơi, đường cắt của chiêu 2, vệt lướt.
- **Sprite một khung** (`life ≤ 0`): vẽ đúng một khung rồi mất, bất kể `dt`.
  - Sửa luôn lỗi cũ: lúc dừng hình, thẻ sáng của lưỡi kiếm (đời 0,02 s) chồng 3–4 lớp, sáng gấp 3–4 lần.
  - Đầu mỗi khung, `dropOneFrame()` (kho sprite và `BeamPool`) bỏ thẻ một khung đã vẽ trước khi phát thẻ mới, nên kho chỉ cần đủ chỗ cho thẻ của một khung.
- **Sprite camera kéo về phía camera** (`uPull`, mặc định 0,5 × cỡ): kéo dọc tia nhìn và thu cỡ theo cùng tỉ lệ, nên vị trí và cỡ trên màn giữ nguyên, chỉ độ sâu đổi. Quầng lớn sát đất không còn bị mặt đất cắt thành đường thẳng.
- **Kho ẩn khi rỗng, chỉ gửi phần đang dùng**: kho sprite, cột sáng và ribbon tắt `visible` khi không còn gì (renderer bỏ qua cả việc tải dữ liệu lẫn gắn shader), và chỉ gửi lên GPU các phần tử đang sống (một khoảng cập nhật dựng sẵn cho mỗi thuộc tính, không tạo đối tượng mỗi khung).
- **Cắt texture** (`crop`): đĩa mềm và vòng mỏng chỉ vẽ phần giữa của texture còn nhìn thấy, mép mờ dần về 0 theo vòng tròn. Quad nhỏ lại, hình giữ nguyên.
- **Mờ dần ở mặt đất** (`groundFade`): sprite camera mờ về 0 khi chạm đất, không bị đất cắt thành đường thẳng.
- **Ribbon có quầng riêng** (`setRim`): lõi nóng mảnh, quầng màu rộng. Bỏ vệt trắng đục.
- **Trận đồ trên đất**:
  - Thêm loại `seal`: ấn dưới chân người thi triển, gồm hai vòng, vành ký tự, lục mang tinh hai tam giác quay ngược nhau, đĩa mực tối bên dưới.
  - Lục giác thêm vành ký tự quanh tâm và nét tối viền dưới các nét sáng.
  - Thiên hà thêm vành ký tự ở rìa, một đường sáng sắc dọc mỗi cánh và bóng tối hai bên cánh.
  - Ánh sáng trận đồ được tới 0,87 mỗi kênh (trước 0,6).

## Màu theo vũ khí (`weapons.ts`)

Thêm màu `rim` cho quầng ngoài: màu nhấn của hệ đậm hơn (lũy thừa tuyến tính), kênh lớn nhất 0,86.

- Kim (Clear Wind): lấy lam thép của họ Kiếm `#A9B8C8`, không lấy vàng sâm panh. Bộ Kiếm vì thế không có vàng.
- Lôi: tím lam. Băng: lam băng. Mộc: xanh lá.

Mọi lớp mới đều đổi màu theo `setWeapon`. Đã chụp lại K1 và K5 với Thunder Seal và Verdant Branch.

## Từng chiêu

| Chiêu | Đã làm |
|---|---|
| Chung, pha A gồng | Ấn `seal` dưới chân, mở theo tiến độ gõ. Hai hào quang (`light_01`) quay ngược nhau sau lưng: đẩy dọc tia nhìn ra sau chân người thi triển, thân che quầng, quầng mờ dần ở mặt đất. Đĩa sáng trên đất đè lên đĩa mực tối. Đốm linh khí bay lên. Vệt sáng hội tụ về tay. Mỗi phím: sao lóe, vòng sóng trên đất, ấn bừng lên. K5 lớn gấp 1,5. |
| Chung, pha R tung đòn | Theo bậc: lóe lõi, sao hai lớp (sao màu lớn, sao HDR trắng ≤ 45 %), quầng, vòng sóng mặt camera, tia bung, tia lửa, đốm sáng, vòng mỏng và vòng dày trên đất trên đĩa mực, ấn bừng. Từ bậc 3 có cột sáng tại người thi triển. |
| Chung, pha I trúng | Sao hai lớp, sao chéo màu, quầng, vòng sóng, tia bung, tia lửa theo hướng đòn, nhát chém lưỡi liềm hai lớp, mực bắn và vết mực, đĩa tối. Đòn lớn có thêm cột sáng. Chiêu vùng dùng "trúng nhẹ" cho từng thú (sao, 2 tia lửa, mực) cộng một vụ nổ cỡ √N (theo VFX_STANDARD §3.3). Thú chết bốc thêm một sợi linh quang. |
| Chung, pha F dư âm | Đĩa sáng tắt dần và đốm linh khí bay lên 0,7–1,6 s (16 bộ phát dựng sẵn). |
| K0 Phi Kiếm | Tung đòn bậc 1, không bật ấn. Vệt kiếm quang rộng 0,24 m có quầng màu. Sao lóe ở mũi kiếm. Bụi sáng rơi dọc đường bay. Trúng đủ lớp. |
| K1 Ngự Kiếm Quyết | Mỗi kiếm hiện sau vai với một nét sáng dọc và sao lóe. Mỗi lần phóng: lóe, sao, vòng sóng, tia ở vai. Ba vệt kiếm quang. Kiếm thứ ba trúng có cột sáng. |
| K2 Nhất Tuyến Xuyên Vân | Vạch lúc gõ dịu hơn, để lúc tung đòn bùng hơn. Hai dải sáng (rộng 1,5 m và lõi 0,4 m) quét hết 14 m trong 0,2 s. Mũi kiếm có sao lớn. Không khí tách hai bên thành tia lửa. Lúc trúng có "đường cắt muộn": cả vạch bừng sáng, 9 nhát chém và sao dọc vạch, đầu xa nổ. Dư âm ở ba điểm. |
| K3A Hồi Kiếm Hộ Thân | Tung đòn bậc 3 có cột sáng và vòng sóng quanh thân. Ba kiếm quay có ribbon sáng bám theo. Có vòng kết giới, đĩa sáng trên đĩa tối và lưỡi liềm `twirl` xoay dưới chân. Đỡ đòn: trúng đủ lớp, nhát chém lớn, 7 tia, vòng đất, cột sáng ngắn, vòng sóng. |
| K3B Lưu Quang Bộ | Bốn vệt tốc độ quét theo người lướt. Năm tàn ảnh, mỗi cái là một quầng cao và một cột sáng thân người. Lúc đến: vòng đất, sao, 6 tia, bụi, dư âm. |
| K4 Lạc Kiếm Trận | Mỗi góc sáng lên kèm cột sáng ngắn. Sáu kiếm rơi kéo vệt sáng trời. Lúc mở trận: 6 cột sáng ở góc, vòng dày, 10 tia từ tâm, nổ ở tâm, dừng hình 30 ms (nhịp và lúc đóng trận tính theo thời gian thật, không bị dừng hình làm trễ). Lúc giữ trận: cột sáng ở góc phập phồng, vòm kết giới, đĩa tối. Mỗi nhịp: 3 dải kiếm quang chéo qua tâm, sao, vòng sóng trên đất. Đóng trận: đốm sáng ở góc, dư âm. |
| K5 Thiên Hà Kiếm Vũ | Lúc gõ: vùng tối dần (đĩa mực 0,45), linh khí bốc khỏi cả vùng, vòng 24 kiếm sau lưng sáng dần. Tung đòn bậc 5: cột sáng 13 m giữa trận, vòng sóng cả vùng, 16 dải kiếm quang bay từ tay vào trận. Lúc quay: 300 kiếm có quầng và lõi, sao lấp lánh trên các dải. Lúc lao xuống: mỗi kiếm kéo một vệt sáng trời (mưa kiếm quang). Mỗi đợt: 18 điểm trúng đất, nổ √N, vòng đất, vòng sóng, cột sáng (đợt cuối 15 m × 3 m, 18 tia lớn, dừng hình 70 ms). Kết: kiếm cắm đất vỡ thành đốm sáng, dư âm 1,6 s. |

Sửa thêm:

- Không cấp phát mỗi khung: danh sách pool và trận đồ dựng một lần; bỏ mảng tạo mỗi khung trong `update` và trong ngưỡng K1; bỏ closure `find` khi phóng kiếm.
- Màu rãnh lưỡi kiếm tăng 0,55 → 0,65. Đã thử 1,0, nhưng thanh kiếm tạm ngả vàng nên bỏ.
- Vòng mỏng cũ dùng `halo × 1,3` (vượt 0,9), nay ≤ 0,86. Bán kính các vòng giờ đúng theo hình thật của texture, kể cả vòng mặt camera (sau khi sửa `uPull`).
- Bậc chất lượng: xem "Sửa sau review" bên dưới.
- Kịch bản chụp:
  - Chiêu không có từ (K0) được bước thêm một khung trước ảnh "release". Trước đây ảnh này trống ở cả bộ cũ. Các mốc sau vẫn đếm từ lệnh tung chiêu, nên ảnh "impact" rơi đúng khung trúng (update 18).
  - Ảnh đỡ đòn của Hộ Thân giờ chụp đúng khung đỡ (bước tới khi tia địch chạm vòng; `__lab.boltActive()`). Bộ cũ chụp lúc tia còn đang bay.

## Số đo (1280 × 720, khung đỉnh, % cả khung)

**Các số trong bảng đo trước đợt sửa sau review.** Đợt sửa đổi hình: vòng mặt camera ở cận cảnh nhỏ lại đúng cỡ, hào quang nằm sau thân, đĩa và vòng được cắt, bậc Low gộp lớp. Cần chụp lại cả bộ trước khi dùng các số này.

Trắng xóa đo bằng hai cách: điểm ảnh có R, G, B đều ≥ 250, và độ sáng ≥ 0,95 (cách đo của VFX_STANDARD §3.6). Trần là 6 %.

| Chiêu | Camera chơi (RGB ≥ 250 / sáng ≥ 0,95) | Cận cảnh (RGB ≥ 250 / sáng ≥ 0,95) | Trước, sáng ≥ 0,95 (chơi / cận) |
|---|---|---|---|
| K0 | 0,007 / 0,029 | 0,093 / 0,394 | 0,011 / 0,120 |
| K1 | 0,036 / 0,104 | 0,281 / 1,098 | 0,017 / 0,204 |
| K2 | 0,106 / 0,410 | 0,559 / 1,891 | 0,217 / 1,161 |
| K3A | 0,041 / 0,159 | 1,046 / 4,357 | 0,072 / 2,302 |
| K3B | 0,035 / 0,129 | 0,917 / 2,894 | 0,039 / 0,787 |
| K4 | 0,066 / 0,365 | 0,524 / 2,655 | 0,256 / 1,709 |
| K5 | 0,140 / 0,694 | 0,429 / 3,517 | 0,394 / 1,767 |

- Thunder Seal: K5 cận cảnh 0,053 / 0,184; K1 bằng 0.
- Verdant Branch: K5 cận cảnh 0,024 / 1,566; K1 bằng 0.
- Khung đầu: mọi lóe, sao, vòng và cột sáng sinh ra đủ sáng ở tuổi 0. Sau một khung còn ≥ 97 % đỉnh, vì độ mờ là 1 − easeIn(t).
- Draw call do VFX: xem "Sửa sau review".
- Không có NaN hay khung đen: mọi `pow` nhận giá trị đã kẹp.
- `tsc --noEmit` qua. Vitest qua 74 tệp, 675 test. `pnpm build` qua, `grep -r skills-lab dist` không ra gì (chạy lại sau đợt sửa sau review, vẫn qua).

## Sửa sau review (02/11)

Mười lỗi review đã xác nhận, sửa trong `fxkit.ts`, `kiem.ts`, `skills-main.ts` và kịch bản chụp:

| Lỗi | Đã sửa |
|---|---|
| Thẻ sáng lưỡi kiếm nhấp nháy 30 Hz ở K5 (Medium trở lên): kho 420 chỗ còn giữ thẻ của khung trước | `dropOneFrame()` bỏ thẻ một khung đã vẽ ở đầu `KiemFx.update`, trước mọi lệnh phát; làm cả cho `BeamPool`. Chạy không cần GPU (tsx, đúng `KiemFx`): 300 lõi mỗi khung, đều, không còn dãy 300/120. |
| Mọi kho tải lại toàn bộ dữ liệu mỗi khung, kể cả khi rỗng | Kho rỗng: `visible = false`, không tải gì. Kho có hạt: chỉ gửi các phần tử đang sống. Ribbon: chỉ dựng, gửi và vẽ tới ribbon sống cao nhất (`setDrawRange`). Lúc nghỉ, chạy thử không còn thuộc tính nào được tải. |
| Quad trên đất quá cỡ so với hình nhìn thấy (đĩa tối K5 36 m) | Cắt texture: đĩa mực 0,64 (diện tích còn 41 %), đĩa sáng và quầng 0,56 (31 %), vòng mỏng 0,78 (61 %), đo alpha thật bằng ImageMagick. Đĩa tối K5 còn 23 m. Chưa đo lớp chồng ở khung đỉnh K5 (cần GPU). |
| Bậc chất lượng chưa giảm thật | Medium có `poolN` riêng (225). Các vòng lặp cố định đi qua `n()`: 18 điểm trúng đất K5, 9 nhát cắt muộn K2, tia lửa của "trúng nhẹ"; sao và mực của "trúng nhẹ" chỉ cho một phần số thú (một nửa ở Low). Bụi sáng theo kiếm bay, tia lửa tách khí K2, sao lấp lánh K5 phát theo tốc độ × `dt` × mật độ, không theo khung. Gộp kho cùng texture, blend, hướng: quầng, thẻ quầng lưỡi kiếm, tia lửa và đốm sáng (lab dùng chung `circle_05`) thành một kho. Bỏ kho `trace` không còn dùng. Low: một thẻ mỗi kiếm; không twirl, không hào quang thứ hai, không vòng sóng mặt camera khi bùng; vòng dày trên đất vẽ bằng vòng mỏng; lóe vẽ bằng sao; mực bắn vẽ bằng khói mực, vết mực bằng đĩa tối; ấn không bừng sau khi tung. |
| Hào quang "sau lưng" vẽ đè lên thân | Kho hào quang bỏ `uPull`. Quầng được đẩy dọc tia nhìn ra sau chân người thi triển 0,25 m (cỡ nhân cùng tỉ lệ, nên chỗ và cỡ trên màn không đổi), nên thân che nó. Phần dưới mặt đất mờ dần về 0 trong 0,15 m (`groundFade`), không có đường cắt. |
| `uPull` phóng to và đẩy lệch sprite trên màn | Kéo dọc tia nhìn và thu cỡ theo cùng tỉ lệ. Vòng kết giới Hộ Thân ở cận cảnh 11 m giờ đúng bán kính 2,25 m (trước to khoảng 1,4 lần). |
| Kịch bản chụp K0 lệch một khung | Với chiêu không có từ, các mốc đếm từ lệnh tung chiêu (`since` bắt đầu từ khung đã bước). |
| Dừng hình lúc mở K4 làm nhịp và lúc đóng trận trễ một khung | `KiemFx.update(dt, realDt)`; dòng thời gian K4 chạy theo `realDt` (lab truyền `dt` thật). Giữ dừng hình 30 ms. Chạy thử: nhịp ở +12, +41, +71…, đóng ở +300, như khi không có dừng hình. |
| Ribbon bị treo khi tung lại chiêu đang chạy | Hộ Thân, K2, Lưu Quang Bộ dừng ribbon cũ trước khi cấp ribbon mới. Chạy thử: tung Hộ Thân hai lần còn 3 ribbon sống, hết chiêu còn 0. |

Số nguồn vẽ lúc đông nhất, đếm bằng chạy thử không cần GPU (gõ ở 45 WPM rồi tung, có thú chết, texture như lab):

| Bậc | K0 | K1 | K2 | K3A | K3B | K4 | K5 |
|---|---|---|---|---|---|---|---|
| Low (trần 12) | 10 | 11 | 12 | 11 | 11 | 11 | 9 |
| High (trần 32) | 14 | 17 | 18 | 16 | 15 | 16 | 14 |

Tổng nguồn dựng sẵn: 26 (17 kho sprite, cột sáng, ribbon, lưỡi kiếm, 6 trận đồ), trước là 28. Với texture của lab, tia lửa và đốm sáng dùng chung kho quầng nên còn 24. Kho rỗng không vẽ.

Chưa làm: chưa chụp lại và chưa đo thời gian khung hay lớp chồng trên GPU (đợt này không chụp). Three 0.170 vẫn tạo một hàm so sánh mỗi lần tải theo khoảng; đó là code của three, không phải của lab.

## Tờ khung

Ở `tmp/lab/spectacle/` (không vào Git):

- `before-<chiêu>.jpg`, `after-<chiêu>.jpg`: hàng trên là camera chơi, hàng dưới là cận cảnh.
- `compare-<chiêu>.jpg`: bộ trước nằm trên bộ sau.
- `after-k1-<vũ khí>.jpg`, `after-k5-<vũ khí>.jpg` cho Thunder Seal và Verdant Branch.

Ảnh thô vẫn còn ở `raw-before/` (126 ảnh, 142 MB) và `raw-after/` (218 ảnh, 247 MB). Lý do: `tools/capture-prune/prune.mjs` từ chối mọi đường dẫn có `immortality-cultivation` (`protected-path`). Không xóa tay để khỏi lách lớp bảo vệ đó. Cần người điều phối quyết.

## Còn yếu, chưa chấm

- **Clear Wind gần như toàn trắng và lam rất nhạt.** Đây là màu đúng canon của hệ Kim, nhưng kém rực hơn Thunder Seal hay Verdant Branch. Anh có thể muốn lam thép đậm hơn cho Kiếm.
- **K0 và K1 ở camera chơi vẫn nhỏ.** Trúng đòn chỉ là quầng 2–3 m, kiếm dài khoảng 25 px. Thanh kiếm vẫn là kiếm tạm, chưa có GLB.
- **Kiếm tạm có rãnh màu sâm panh**, nên khi cắm đất trông như chữ thập kem (K5) và hơi ngả vàng. Cần model kiếm thật.
- **K2 trước đây vốn đã là một vạch sáng.** Bản mới mạnh hơn (dải sáng, đường cắt muộn) nhưng vẫn đọc như "tia laser" hơn là "kiếm khí lưỡi liềm".
- **Dư âm ở camera chơi còn nhạt.** Đốm sáng và đĩa sáng chỉ thấy rõ ở cận cảnh.
- **Chưa có lớp toàn màn**: không méo không khí, không ám màu viền màn cho chiêu cuối. Chưa có flipbook. Chỉ dùng texture Kenney.
- **Xanh lá của Verdant Branch khá tươi.** Cần anh xem có quá gần xanh ngọc (màu gõ chữ, §21.1) không.
- **Chưa đo thời gian khung.** Chưa có bản giảm chuyển động (lab chưa có công tắc). Chưa có âm thanh (M0a không có âm).
- **Chưa qua hai giám khảo mù ở mốc 8,5.** Đây mới là bản lab để anh xem hướng.

## Phản biện code (02/11, chiều)

Ba agent phản biện độc lập (hiệu năng, luật VFX, lỗi logic). Mỗi lỗi có một agent khác thử bác bỏ; 10 lỗi được xác nhận và đã sửa:
- K5 nháy 30 Hz: kho thẻ sáng lưỡi kiếm 420 chỗ không đủ, vì thẻ một khung của khung trước chỉ bị xóa sau khi khung mới phát. Thêm `dropOneFrame()` ở đầu `KiemFx.update`.
- Kho rỗng không còn tải dữ liệu lên GPU và không vẽ (`mesh.visible = false`). Kho có hạt chỉ tải phần đang dùng.
- Quad trên đất cắt theo vùng alpha thật của texture (bớt tô thừa).
- Bậc chất lượng giảm thật: Low 9–12 nguồn vẽ lúc đông nhất (trần 12), High 14–18 (trần 32).
- Hào quang sau lưng nằm sau chân người thi triển 0,25 m dọc tia nhìn, không còn đè lên thân.
- `uPull` kéo dọc tia nhìn và bù cỡ.
- Kịch bản chụp K0 hết lệch một khung; mốc K4 không còn trễ vì hit-stop của lab; ribbon không rò khi tung lại chiêu.

Kiểm lại sau khi sửa: `tsc` qua, vitest 675 test qua, chụp K5 và K1 (camera chơi và cận cảnh) không có khung đen, NaN hay lỗi hình. Trắng xóa cao nhất 0,33 % khung (K5 cận cảnh, lúc phát), trần 6 %. Các số trắng xóa ở bảng trên là của bản trước khi sửa.
