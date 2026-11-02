# 02/11/2026: vòng 2, làn va chạm (lab kỹ năng Kiếm)

Hai giám khảo mù chấm demo vòng 1 được 5,4 và 5,4. Điểm thấp nhất là khối lượng (5 và 4,5), trúng đòn (4 và 3,5) và đọc rõ ở camera chơi (5 và 5,5). Làn này sửa phần va chạm, đi sau làn diễn xuất. Mục tiêu là hai giám khảo mới chấm từ 7 trở lên. Phong cách theo D56: anime và thần thoại, bùng nổ, rực sáng, không tả thực.

Chỉ có trong lab dev: không vào bản build, không đụng `src/sim`, `src/content`, golden, `src/kit`, không có mã âm thanh. Chưa commit.

## Đã làm

### 1. Khối lượng (`kiem.ts`, `feel.ts`, `skills-main.ts`)

- **Dừng hình mỗi cú trúng**, thời gian thế giới ×0,05:
  - đòn thường và mỗi kiếm K1: 3 khung (50 ms);
  - K2, đỡ đòn của hộ thân, lúc K4 mở trận: 4 khung (67 ms);
  - nhịp K4 có trúng thú: 3 khung;
  - K5: hai đợt đầu 4 khung, đợt cuối 5 khung (83 ms).
- Dòng thời gian K1 và K5 chạy theo giờ thật, như K4 đã làm. Nhờ vậy cú dừng của đợt trước không đẩy kiếm hay đợt sau trễ so với tick canon.
- **Rung camera** (`CameraShake`, mới):
  - 0,1–0,2 m, tắt theo hàm mũ e-fold 40 ms (khoảng 5 % còn lại sau 120 ms);
  - dao động theo trục phải và trục lên của camera, bằng tổng sin cố định, nên chụp lặp lại được;
  - chạy theo giờ thật: thế giới đứng mà camera vẫn rung;
  - theo bậc: Low ×0,5, Medium ×0,75. Ở camera chơi, 0,2 m chỉ khoảng 4 px.
  - Cú đẩy camera theo hướng đòn (`CameraKick`) giữ nguyên.
- **Nứt đất dưới K5** (trận đồ mới loại `crack`):
  - mỗi đợt, tia nứt lởm chởm và mạng nứt Voronoi lan rộng thêm (55 %, 80 %, 100 % bán kính);
  - khe nứt bừng sáng trong vài khung rồi nguội;
  - đáy nứt tối, bụi nhạt quanh khe (không phủ lên khe);
  - tồn tại 6,5 s sau đợt cuối, tắt dần có ease 1 s.
- Lúc K4 mở trận cũng có một vết nứt nhỏ ở tâm.
- **Tia lửa ở mọi điểm trúng** (`hitSparks`): một đốm sáng nóng ở điểm chạm, các vệt tia kéo dài tỏa theo hướng đòn, và vài than hồng màu chiêu rơi theo cung. Trúng theo vùng (K4, K5): mỗi thú 4 vệt.
- Khi đòn của thú trúng người, `presence.ts` phát:
  - tia lửa và một vòng sáng đỏ màu phe địch ở ngực, phía đòn tới;
  - rung camera 0,12 m.

### 2. Lóe khi nhả chiêu (`releaseFlash`)

- Lóe lên trong 2–3 khung (smoothstep 40 ms) và tắt trong khoảng 5 khung, đặt ở bàn tay, lệch 0,22 m theo hướng ra đòn.
- Ngôi sao lớn và quầng màu chiêu được đẩy dọc tia nhìn ra sau chân nhân vật (`behindCaster`, hai kho mới `backGlow` và `backStar` không kéo về phía camera). Thân nhân vật vẽ đè lên vầng sáng của chính nó, nên vẫn đọc rõ ở cận cảnh 6 m.
- Cột sáng của chiêu bậc 3 trở lên đứng sau lưng, cách 0,8 m theo hướng nhìn, không còn cắt ngang người.
- Dash: các bóng sáng còn lại cũng nằm sau thân. Vệt dash hẹp lại (0,6 → 0,42 m), các vệt tốc độ mảnh hơn.
- Trắng xóa ở cận cảnh, khung lớn nhất: vòng 1 9,3 %, trước làn này 4,01 %, nay 0,79 %.

### 3. Tắt và hiện dần

- Mũi tên dash, xoắn ốc K5 và ấn dưới chân (lục mang trước đây) tắt trong khoảng 0,3 s, ease cả độ mờ lẫn cỡ (`fadeOutEased`). Trước là tuyến tính, hoặc rơi theo vầng sáng trong vài khung.
- Chữ bỏ dở cũng tắt có ease.
- Ấn dưới chân hiện dần tối đa trong 0,22 s, vẽ qua smoothstep.
- Hộ thân khép trong 0,35 s: kiếm, vòng, vòng xoáy và cung cùng mờ và nở ra; kiếm bay lên 0,5 m, rộng ra 0,45 m và quay nhanh dần.
- Kiếm và ánh lóe đầu tiên của K1, mọi lóe theo phím, và mọi lõi nổ của xoáy K5 (sao, quầng, vòng, cột sáng, lóe, tia) hiện dần qua ít nhất 3 khung. Thêm `BeamSpec.rise` cho chùm sáng; trợ hàm phát dùng chung đọc `riseS`.

### 4. K1 chờ và vệt K2

- **Kiếm K1 đang chờ** không còn đứng im:
  - mỗi thanh nhấp nhô theo pha riêng (6 cm, 2,7 Hz) và lắc nhẹ;
  - xoay chậm quanh trục lưỡi (thêm `roll` cho `show`);
  - sáng thở;
  - cứ 0,9 s có một ánh lóe chạy từ chuôi lên mũi.
- **Vệt K2 sau cú cắt** không còn là vệt mực đen:
  - đường cắt còn sáng một đường, có than hồng lấp lánh (`uHeat`), nguội theo e-fold 0,5 s;
  - rồi thành tro nhạt (`uAsh`, trộn thường, màu xám sáng);
  - than bay lên, tro mỏng bốc khói;
  - tắt trong 0,4 s, vệt nở rộng khi tắt;
  - mực chỉ còn vết cháy rất nhạt.
- K2 bừng sáng trong 0,1 s thay vì 0,06 s: không còn lớp mực bù năng lượng, nên 0,06 s dồn quá 30 % vào một khung.

### 5. Mỗi chiêu một hình và một màu

- **Ấn dưới chân có hình riêng từng chiêu** (`SEAL_SHAPE`, theo SKILL_CATALOG §2). Trước đây chiêu nào cũng một lục mang trắng.
  - K1: ba nét song song và đầu nhọn (≡>);
  - K2: một đường cắt, mũi hình thoi;
  - Hộ thân: ba cung quanh tâm, mỗi cung một kiếm;
  - Lưu Quang Bộ: hai điểm nối nét xiên, hai chữ V;
  - K4: lục giác và sáu kiếm chĩa vào tâm;
  - K5: ba nhánh xoắn quanh lõi tối.
- Ấn xoay theo hướng mặt. Khi đổi chiêu, hình cũ mờ đi trong 0,1 s, hình mới lên trong 0,15 s; màu chuyển với half-life 0,08 s.
- **Mỗi chiêu một màu trong bảng màu của vũ khí** (`skillGlow`, qua `glowOf`, nên luật bloom và luật lõi trắng vẫn giữ):
  - cách tạo: trộn viền với màu nhấn của vũ khí, làm đậm, xoay sắc độ (chỉ trong dải lam, không về ngọc hay đỏ), rồi nâng sáng;
  - Clear Wind: Phi Kiếm lam thép nhạt, K1 lam trời, K2 lam băng, hộ thân ngà sâm panh, Lưu Quang bạc nhạt, K4 lam hoàng gia, K5 lam ngọc tím;
  - mọi ấn, vệt, kiếm, quầng và lóe theo màu chiêu của nó; đường sáng của ấn lấy màu viền của chiêu (thêm 25 % trắng).
  - Winter Vein, Thunder Seal và Verdant Branch đổi theo cùng luật. Với Verdant Branch chỉ độ đậm thay đổi, không xoay sắc độ.

### 6. Thú trong lab (`herd.ts`)

- **Trúng đòn**:
  - lóe màu đòn;
  - bị đẩy bằng lò xo tới hạn (xa nhất sau khoảng 80 ms, về chỗ trong khoảng 0,4 s); không còn đẩy trong 1 khung;
  - ngả ra khỏi hướng đòn bằng lò xo dưới tới hạn (vượt đà một lần);
  - nén nhẹ, giữ thể tích.
- **Chết**: thân tan theo mặt nạ nhiễu, có viền sáng màu kẻ giết (thuộc tính từng instance `iDissolve`, `iEdge`), trong 0,6 s, không thu nhỏ. Bóng cũng tan theo (vật liệu bóng riêng).
- **K5 hút vào xoáy** (`KiemHost.pull`): thú trong vùng bị kéo vào tâm theo vòng xoáy, có ease vào và ra. Con đang chết bị kéo mạnh hơn và được nâng lên khi tan.
- **Hồi sinh**: thú tan ngược từ đất lên, viền xanh lạnh, trồi lên 0,25 m. Không còn dịch chuyển tức thời hay bật cỡ.
- Ở chế độ hành quân, thú tới tim trận thì tan ra rồi hiện lại ở cổng; khi đi có lắc nhẹ.

### 7. Kiếm bay

Vá chính vật liệu của `BladeSet` từ `kiem.ts` (`lightBlade`). Vẫn một draw call; đường GLB giữ nguyên.
- Thép đổi màu từ màu nhấn đậm ở chuôi tới nhạt ở mũi (nhuộm cả phản chiếu).
- Phát sáng của rail tăng dần về mũi.
- Viền sáng fresnel ≤ 0,9, sáng hơn khi lóe trúng (theo tint từng kiếm).
- Một đường lõi HDR mảnh dọc lòng kiếm. Kẹp trước `pow` (MSAA).

### 8. Đọc rõ nhân vật ở camera chơi (`presence.ts`, mới)

- Vòng sáng dưới chân (P7), đi theo nhân vật:
  - một vòng mảnh khử răng cưa bằng `fwidth`, ba vạch cung quay chậm (9 s một vòng), đĩa tối nền;
  - không đỏ, mép mềm;
  - lấy màu chiêu đang dùng.
- Viền sáng theo phím (P1):
  - fresnel lệch lên trên, gắn vào chính vật liệu của Lam, nối tiếp sau móc viền trúng đòn của `caster.ts` (không sửa `caster.ts`);
  - mức ≤ 0,9.
- Trạng thái:
  - đứng yên: thở theo chu kỳ 3 s;
  - đang gõ: sáng và nở theo tiến độ;
  - lúc nhả: bừng lên trong 2–3 khung rồi lắng trong khoảng 0,25 s;
  - trúng đòn: chùng xuống dưới 0,1 s.

## Số đo (`tmp/shots/motion/r2-impact/metrics-vs-round1.md`)

| Số đo | Vòng 1 | Trước làn này | Sau |
|---|---|---|---|
| Lớp VFX bật / tắt phụt | 0 / 0 | 0 / 0 | 0 / 0 |
| Lỗi kiếm (hiện, tắt, đổi cỡ, giật, nhảy) | 0 | 0 | 0 |
| Khung tư thế bind | 0 | 0 | 0 |
| Xoay gốc lớn nhất | 487 °/s | 277,6 °/s | 277,6 °/s |
| Phím cuối → thân nhả / → VFX | 33 / 0 ms | 33 / 0 ms | 33 / 0 ms |
| Trắng xóa camera chơi, khung lớn nhất | 0,30 % | 0,071 % | 0,025 % |
| Trắng xóa cận cảnh 6 m, khung lớn nhất | 9,3 % (18 khung > 6 %) | 4,01 % | 0,79 % (0 khung > 6 %) |
| Tay dang: chuỗi hỏng | 3 | 0 | 0 |

- 120 Hz, Low, Ultra: VFX bật/tắt 0/0, kiếm 0, bind 0, tay dang hỏng 0. Ở 120 Hz, phím cuối → thân nhả 42 ms.
- `lab-stress` ở 60 Hz, 120 Hz và Low: VFX 0/0, kiếm 0 trên 1.302 đời (Low 702), bind 0, xoay tối đa 290,1 °/s.
- Lóe đã khai báo tăng từ 82 lên 105, vì có thêm `backGlow`, `backStar`, tia lửa và vòng đỏ khi trúng người. Đây là lóe, được phép.
- Thời gian khung theo bậc (CPU + GPU, đồng bộ GPU mỗi khung):

  | Bậc | Trước (TB) | Sau (TB, hai lượt) | p95 trước → sau |
  |---|---|---|---|
  | Low | 5,1 ms | 4,6 / 5,8 ms | 7,5 → 6,8 / 8,4 |
  | Medium | 6,3 ms | 6,6 / 6,0 ms | 9,7 → 9,3 / 9,6 |
  | High | 6,3 ms | 6,6 / 6,5 ms | 9,0 → 9,3 / 10,0 |
  | Ultra | 6,5 ms | 6,4 / 6,4 ms | 9,7 → 8,9 / 9,7 |

  Hai lượt trên cùng mã lệch nhau tới 1,2 ms, lớn hơn chênh lệch trước và sau, nên chưa thấy tăng đo được. Mọi bậc dưới 14 ms ở khung tệ nhất.

## Kiểm tra

- `npx tsc --noEmit` (strict): qua.
- `pnpm test`: 74 tệp, 675 test qua, có `boundary.test`.
- `pnpm build` qua. `grep -r` trong `dist` không ra `skills-lab`, `MotionProbe`, `CasterPresence`, `presenceRing`, `lab-herd-dissolve`, `kiem-blade-light`, `skillGlow`, `hitSparks`, `SEAL_SHAPE`, `uAsh`, `fadeOutEased`.
- `node src/kit/verify-kit.mjs`: 73 tệp khớp manifest.
- Không cấp phát mỗi khung: biến tạm là thành viên dựng sẵn. `skillGlow` chỉ chạy lúc nạp và khi đổi vũ khí.
- Đã tự xem tờ đoạn ở camera chơi và cận cảnh, tờ đầy đủ khung chơi của K5, và các tờ thú ở cận cảnh: đòn thường từng khung, K2, K5 hút và tan với vết nứt, hồi sinh.

## Ảnh và clip (`tmp/shots/motion/r2-impact/`)

- `segments/`: 12 khung mỗi pha, camera chơi và cận cảnh.
- `sheets/`: tờ chuyển tiếp.
- `review-sheets/`: thú trúng đòn, dừng hình, đẩy lùi, tan, hút K5, nứt đất, hồi sinh.
- `clip-play-half.mp4`, `clip-play-60fps.mp4`, `clip-follow-half.mp4`, `clip-follow-60fps.mp4`.
- `metrics.json`, `wo-play.tsv`, `wo-follow.tsv`, các thư mục `120hz/`, `qlow/`, `qultra/`, `stress*/`, `perf.json`, `perf-2.json`, `perf-scenario.mjs`.
- Mốc thời gian khung trước làn này: `tmp/shots/motion/r2-impact-before/perf.json`.
- Khung thô do tôi chụp đã xóa.

## Còn mở

- **`skills-main.ts`**: ngoài đồng hồ và camera, có thêm vài dòng nối:
  - presence: tạo, `attach`, `update`, `hit`, `reset`;
  - móc `pull` sang `herd`;
  - tên lớp lóe cho bộ đo (`backGlow`, `backStar`, `hitSparks`, `hitRing`).
- **`blades.ts` không sửa**: vật liệu kiếm được vá từ `kiem.ts`.
- **Lab chưa có công tắc giảm chuyển động.** Các lớp mới đã chia theo VFX_STANDARD §3.8:
  - bỏ: rung camera;
  - giữ: vòng dưới chân, viền sáng, nứt đất;
  - làm dịu: tia lửa, kiếm K1 nhấp nhô.
- **Màu riêng từng chiêu chỉ rõ với Clear Wind và Thunder Seal.** Winter Vein và Verdant Branch có bảng màu hẹp, các chiêu chủ yếu khác nhau ở độ đậm; phân biệt nhờ hình ấn.
- **K5 ở cận cảnh 6 m** vẫn rất dày: 300 kiếm và nhánh xoắn sáng. Ấn K5 dưới chân (×1,5) lớn ở camera chơi.
- **Hộ thân màu ngà** đọc gần như trắng ấm. Cần giám khảo xem có đủ khác các chiêu lam không.
- Thú tạm không có clip, nên phản ứng chỉ là đẩy, ngả, nén và tan; chưa có gập thân theo xương.
- Thời gian khung đo trên Chrome headless có đồng bộ mỗi khung, nhiễu khoảng ±0,6 ms. Chưa đo bằng bench có thú đông của game.
- Chưa có hai giám khảo mới chấm. Chưa commit.
