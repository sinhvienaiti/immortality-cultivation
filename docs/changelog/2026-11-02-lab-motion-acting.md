# 02/11/2026: diễn xuất thân cho chiêu Kiếm và nhân vật (vòng 2 làm mượt, làn diễn xuất)

Chủ dự án, 02/11: "đảm bảo animation của các chiêu thức phải mượt, và lưu ý về animation của nhân vật cũng vậy, từng cử chỉ, yển chuyển của chân tay, cơ thể, đầu cũng cần phải xử lý thật mượt". Phong cách theo canon D56: anime và thần thoại, bùng nổ, hào quang, không theo lối thật.

Hai giám khảo mù chấm demo vòng 1 được 5,4 và 5,4. Điểm từng hạng mục:
- theo đà 5,5 / 5,5;
- khối lượng 5 / 4,5;
- chuyển tiếp 5,5 / 6,5;
- trúng đòn 4 / 3,5;
- đi và đứng 6,5 / 6;
- đọc rõ 5 / 5,5;
- VFX mượt 6 / 6,5.

Vòng này nhắm từ 7 trở lên với hai giám khảo mới. Làn này lo phần diễn xuất của thân; làn va chạm chạy sau. Mọi thứ chỉ nằm trong lab dev `/skills-lab.html`, không vào bản build. Không sửa `src/view/skills/*`, `src/lab/feel.ts`, `src/lab/herd.ts`, `src/sim`, `src/content`, `src/kit` hay golden.

## 1. Đã làm

Lab chỉ có 8 clip của Lam (Idle, Run, Attack, Skill1, Skill2, Ult, Dash, Hit), thêm Walk và Strafe của Mesh2Motion. Vì vậy diễn xuất là một lớp thủ tục mới, `src/lab/anim/acting.ts`, đặt trên một đoạn clip:
- Dáng tay khai báo theo hệ nhân vật (trước, phải, trên) và áp trong không gian thế giới sau các lớp thân. Cánh tay trên rồi cẳng tay được xoay về hướng đích theo trọng số, nên trục cục bộ của rig không ảnh hưởng.
- Mọi đầu ra đều là lò xo. Hướng tay đi theo cung tròn lớn: góc còn lại là một lò xo tới hạn. Cách này bỏ được cú giật 6.600°/s khi tay vung từ sau ra trước, vì nội suy từng thành phần đi qua một vectơ gần 0.

### 1.1 Ba pha cho mọi chiêu
- **Lấy đà khi gõ.**
  - Dáng lấy đà tăng theo tiến độ gõ, tới 25–70 %.
  - Sau phím kế cuối, dáng hoàn tất trong khoảng 8 khung (lò xo nửa đời 0,035 s).
  - Trọng tâm hạ 5–6 cm, hông gập thêm 6–7°.
  - Tay kiếm kéo về sau: khuỷu ra sau và ra ngoài, bàn tay ở cạnh tai.
  - Thân xoay ngược 9–16°.
  - Móc nhỏ trong `skills-main.ts`: `caster.charge(…, letters − typed)`, để lab biết còn bao nhiêu phím.
- **Nhả ở phím cuối.**
  - Tay duỗi về mục tiêu: đi được 85 % đường trong 6 khung, xong trong khoảng 8 khung.
  - Thân xoay vào hướng chiêu 13–17°. Xoay và ngả đi qua lò xo dưới tới hạn (4,2 Hz, ζ 0,55), nên vung qua một chút rồi về.
  - Đầu nhìn mục tiêu.
  - Thân vẫn qua `release` của clip sau 33 ms (ngưỡng ≤ 50 ms). VFX vẫn phát từ `FX_HAND_R`, ở chỗ tay đang hiện.
- **Giữ, lắng, thu.**
  - Giữ dáng nhả 16–19 khung sau cú nhả. Riêng K1 giữ tới lưỡi thứ ba (+1,0 s), K5 giữ tới đợt cuối (+2,0 s), và mỗi nhịp có một cú dội nhỏ.
  - Sau đó vượt đà rồi lắng trong 0,3 s (lò xo 3,2 Hz, ζ 0,45).
  - Thu 0,5 s: tay hạ, thân lắng xuống.
  - Clip về Idle bằng quán tính nửa đời 0,065 s, tức khoảng 0,22 s tới 95 %.
  - Trong lúc giữ, clip gần như đứng ở điểm cực của nó.
- **Đọc rõ ở camera chơi.** Camera 55° nhìn từ sau lưng, nên mũ trùm che tay duỗi thẳng ra trước. Các dáng nhả vì vậy lệch tay ra ngoài và lên trên khoảng 20–30°: tay vẫn chỉ về phía mục tiêu và hiện ra bên cạnh đầu.

Dáng của từng chiêu (`MOVES` trong `acting.ts`):

| Chiêu | Lấy đà | Nhả | Sau đó |
|---|---|---|---|
| Phi Kiếm (auto) | không có chữ để gõ, chỉ có 50 ms đầu của clip | ngón kiếm chỉ ra, thân xoay vào | giữ 16 khung, lắng, thu |
| K1 Ngự Kiếm Quyết | ngón kiếm giơ cạnh tai, tay trái kết ấn trước ngực | chỉ mục tiêu | dội ở +0,5 s và +1,0 s (lưỡi 2, 3) |
| K2 Nhất Tuyến | cuộn sâu về hông phải, trọng tâm hạ 6 cm, tay trái dẫn hướng | đâm tới, thân ngả 16°, tay trái hất ra sau, lướt tới 0,18 m (chân bước theo) | không còn đoạn sau của Skill1 (vung tay trái, nhảy, đập xuống), nên không còn cú xoay gần 180° |
| Hộ thân | tay kiếm kéo về sau, hạ thấp | tư thế thủ: tay kiếm chéo trước thân (khuỷu chĩa ra ngoài), tay trái kết ấn giơ cạnh đầu, đứng thẳng ngực | giữ thế thủ 0,55 s rồi lắng, thu |
| K4 Lạc Kiếm Trận | tay kiếm giơ cao ra sau đầu, ngả ra sau | quét xuống, ra trước về phía trận, thân gập 18° | nhịp thứ hai lúc kiếm cắm (+0,2 s) |
| K5 Thiên Hà Kiếm Vũ | gom người thấp, hai tay ra sau (clip Ult) | hai tay tung lên trời hình chữ V, ngả ra sau, ngước nhìn trời, giữ 0,4 s (dáng cố ý) | tay kiếm chỉ xuống vùng mưa kiếm, dội theo từng đợt, rồi lắng, thu |

### 1.2 Bỏ dáng dang tay và cú xoay; thêm kiểm tra tay dang
- K5 không còn giữ hai tay dang khoảng 1,5 s. Sau 0,4 s chào trời, dáng chuyển sang chỉ huy rồi thu.
- K2 dừng clip ở điểm cực của cú đâm, không chạy phần còn lại của Skill1.
- Mới: `src/lab/anim/arm-check.ts`. Mỗi khung đo góc dang của từng cánh tay trên trong mặt phẳng trán của thân:
  - 0° là buông, 90° là ngang, 180° là giơ thẳng;
  - tay chỉ ra trước hay ra sau tính là 0°.
- Một khung bị gắn cờ khi cả hai tay quá 70°. Hỏng khi chuỗi khung bị cờ dài quá 3 khung ngoài dáng cố ý.
  - Dáng cố ý hiện chỉ có cú chào trời của K5, cộng 0,12 s tay hạ xuống khi chữ khác cắt ngang cú chào.
  - Kết quả đọc ở `__lab.metrics().arms`, qua móc trong `skills-main.ts`.
- Chạy (clip Run của Lam vung hai tay ra rất rộng): tay được kéo mềm về phía thân, tối đa khoảng 64°. Nhịp vung trước sau giữ nguyên (`limitArms`).

### 1.3 Hộ thân và K4 có dáng và nhịp riêng
- K4 chạy bản sao riêng của Attack (khóa clip `thrust`, `COPIES` trong `caster.ts`), không dùng chung Skill2 với hộ thân nữa.
  - Kiem.ts vẫn gọi `play("skill2")` cho K4. Lab bỏ qua lời gọi đó khi vừa tự nhả chiêu trong khung này (`strikeAgeS < 0,1`).
- Hộ thân dùng Skill2 (tay trái kết ấn) cộng tư thế thủ của lớp diễn xuất.

### 1.4 Dash
- **Lúc gõ:** thân nén dần.
- **Lúc lướt đi:**
  - Nén 5 khung: trọng tâm hạ 6 cm, ngả 14°.
  - Rồi lướt, ngả 26°, hai tay kéo ra sau.
  - Đuôi kéo dài phía sau nhờ `SpringChains.trailBoost` = 2,5 trong lúc lướt, vẫn trong giới hạn góc của từng khớp.
- **Bước hãm khi đáp:**
  - Khi đường dash chậm dưới 55 % đỉnh, chân với xuống theo dáng chạm đất bằng chân trước của Run.
  - Độ nâng chỉ rơi khi đường dash chậm dưới 20 %, nên không có chân bị kéo lê ở tốc cao.
  - Chân trước khóa ngay lúc chạm đất. Dáng giữ 0,2 s, ngả ra sau 12° (lò xo dưới tới hạn), hai tay đưa ra trước để giữ thăng bằng.
  - Sau đó về Idle: chân sau hạ xuống rồi bước lên.

### 1.5 Trúng đòn
- **Lệch theo hướng đòn** (cộng thêm lên tư thế):
  - Thân ngả khoảng 18° (đỉnh ở 60 ms, 3,2 Hz, ζ 0,6).
  - Đầu ngả khoảng 25° (đỉnh ở 50 ms, 4 Hz, ζ 0,5).
  - Hạ thêm 3 cm, hết trong khoảng 0,3 s.
- **Lùi 0,15 m trong 0,17 s.** Hai chân giữ khóa, rồi một chân bước lại.
- **Clip Hit:** chỉ còn lớp cộng nhẹ, trọng số 0,3.
- **Ánh viền đỏ trắng thay ánh đỏ phủ cả người:**
  - Trong `skills-main.ts` đã bỏ đèn đỏ cường độ 6 đặt trước người.
  - Ánh viền (1 − N·V)⁴ thêm vào phần phát sáng của vật liệu Lam (`onBeforeCompile`, chỉ trong lab).
  - Lên trong 2 khung, gần trắng. Tắt dần trong 0,2 s và nguội sang đỏ.

### 1.6 Di chuyển
- **Xoay:**
  - Hướng mặt đi theo một bộ bám có giới hạn tốc và gia tốc: ≤ 300°/s khi di chuyển, ≤ 250°/s khi xoay tại chỗ; gia tốc 34 rad/s², xoay tại chỗ 18 rad/s².
  - Bám xong thì qua một lò xo ngắn, rồi kẹp cứng ở 355°/s mỗi khung.
  - Vòng 1 xoay tới 487°/s. Khi đổi nửa đời lò xo, phần trễ 75° bị kéo về một lúc.
- **Bắt đầu đi:** thân nghiêng vào trong vòng rẽ theo tốc xoay, kể cả lúc còn chậm.
- **Dừng:** thân lắc qua điểm dừng rồi lắng (2,6 Hz, ζ 0,45, theo tốc vừa đi).
- **Xoay tại chỗ:**
  - Bước từng chân một, luôn có một chân chịu lực. Trước đây có khoảng 8 khung cả hai chân cùng trên không. Thời gian bước 0,3 s, chồng nhau 0,88.
  - Chỗ đặt chân đổi theo hướng xoay mới khi chân còn trên không, nên không đáp vào chỗ cũ rồi trượt khỏi tầm với.
  - Không bước khi chân kia chưa chạm đất.

## 2. Số đo: vòng 1 (cuối) so với vòng 2

Cùng chuỗi `lab-motion.mjs`, 45 WPM, tốc hợp chân Lam, 60 Hz, 1280×720. Cột vòng 1 là mã đã commit `ca730aa` cộng bộ kiểm tra tay dang, chạy lại (`r2-acting-before`). Các số khác trùng với `final/metrics-table.md`.

| Số đo | Vòng 1 | Vòng 2 | Ghi chú |
|---|---|---|---|
| VFX: lớp bật / tắt (fair) | 0 / 0 | 0 / 0 | giữ |
| Kiếm: hiện / tắt / đổi cỡ / giật / nhảy | 0/0/0/0/0 | 0/0/0/0/0 | giữ |
| Khung gần tư thế bind | 0 | 0 | giữ |
| Xoay gốc lớn nhất (°/s) | 487 | 277,6 | yêu cầu ≤ 360, cấm vượt 540 |
| Phím cuối → thân nhả, lớn nhất (ms) | 33 | 33 | ≤ 50 |
| Phím cuối → VFX (ms) | 0 | 0 | |
| Tay dang: khung có cờ / chuỗi hỏng / khung hỏng | 148 / 3 / 148 | 31 / 0 / 0 | còn lại chỉ là chào trời của K5, đã khai báo |
| Trắng xóa ở camera chơi, khung tối đa | 0,30 % (báo cáo vòng 1) | 0,07 % | ≤ 6 % |
| Trắng xóa ở cận cảnh 6 m, khung tối đa / khung > 6 % | 9,3 % (vòng 1, lần đo khác) | 3,98 % / 0 | |
| Xuyên đất lớn nhất (% chiều cao) | 1,36 | 1,03 | ≤ 2 |
| Khung chân trụ trượt > 0,05 m/s | 194 | 179 | |
| Trượt chân trụ p95 (m/s) | 0,117 | 0,188 | xấu đi, xem mục 4 |
| Chuyển clip vượt 1,5 × đỉnh clip | 2/26 | 6/27 | các cú nhả nhanh, xem mục 4 |
| Tỉ số chuyển clip lớn nhất | 2,58 | 2,67 | |
| Dáng gồng khác đỉnh đòn (strikePct, %): auto, K1, K2, hộ thân, K4, K5 | 11,4 · 18,6 · 17,6 · 6,2 · 6,3 · 12,1 | 13,3 · 14,6 · 18,4 · 4,7 · 18,9 · 15,7 | K4 tách khỏi hộ thân |

Trượt chân trụ p95 theo pha (m/s), vòng 1 → vòng 2:

| Pha | Vòng 1 | Vòng 2 |
|---|---|---|
| dash | 2,017 | 0,239 |
| dừng | 0,066 | 0,027 |
| xoay 90° | 0,037 | 0,015 |
| xoay 180° | 0,085 | 0,045 |
| K1 | 0,072 | 0,010 |
| auto | 0,030 | 0,020 |
| đi và chạy | 0,317 | 0,341 |
| đi ngang | 1,134 | 1,298 |
| K4 | 0,002 | 0,019 |
| trúng đòn | 0 | 0,004 |

Các lượt khác trên mã cuối:
- **120 Hz:**
  - Xoay tối đa 276,6°/s, phím cuối → thân 42 ms.
  - VFX 0/0, kiếm 0, bind 0, tay dang hỏng 0.
  - Trượt chân trụ p95 0,198 m/s (vòng 1: 0,318).
  - Chuyển clip vượt 7/27, tỉ số lớn nhất 2,60 (vòng 1: 4/26, 3,21).
- **Low:** như 60 Hz, VFX 0/0, kiếm 0.
- **Ultra:** như 60 Hz, VFX 0/0, kiếm 0.
- **`lab-stress.mjs`:**
  - VFX 0/0, kiếm 0 trên 1.302 đời, bind 0, tay dang hỏng 0, xoay tối đa 283,9°/s.
  - Tỉ số chuyển clip lớn nhất 4,99 (vòng 1: 4,10), do đầu gối phải lúc bấm auto liên tục, xem mục 4.

Tờ khung, clip và số đo nằm ở `tmp/shots/motion/r2-acting/`:
- `segments/` và `sheets/`;
- `clip-{play,follow}-{half,60fps}.mp4`;
- `metrics.json`, `metrics-vs-round1.md`, `wo-play.tsv`, `wo-follow.tsv`.

Lượt 120 Hz ở `r2-acting-120hz/`, Low ở `r2-acting-qlow/`, Ultra ở `r2-acting-qultra/`, stress ở `r2-acting/stress/`.

## 3. Kiểm tra
- `npx tsc --noEmit` (strict) qua.
- `pnpm test`: 74 tệp, 675 test qua, có `boundary.test`.
- `pnpm build` qua. `grep -r "skills-lab" dist` và `grep -r "MotionProbe" dist` không ra gì; `ArmCheck`, `labRim`, `lab-hit-rim` cũng không có.
- `node src/kit/verify-kit.mjs`: 73 tệp khớp manifest.
- Không cấp phát trong đường cập nhật mỗi khung. Không có mã âm thanh. Không cài gói, không tải tài sản.
- Đã xem:
  - tờ đoạn ở camera chơi và cận cảnh của mọi pha;
  - tờ chuyển tiếp ở lúc nhả và lúc trúng đòn;
  - tờ gỡ lỗi khung dày của K2, K4, K5, hộ thân, dash, trúng đòn.
- Khung thô do tôi chụp đã xóa (`find … -newer <marker> -delete`). Giữ tờ khung, clip và số đo.

## 4. Còn mở
- **Đọc rõ ở camera chơi.**
  - Nhân vật chỉ cao 35–40 px, và camera nhìn từ sau lưng. Mũ trùm che gần hết tay duỗi ra trước và cú chào trời của K5.
  - Phần đọc được: dáng ngả, xoay, tay chĩa ra ngoài, bước lướt và ánh viền khi trúng đòn.
  - Lúc nhả của K2, K5 và hộ thân, VFX ở cận cảnh vẫn che kín người trong 2–4 khung (làn va chạm).
- **Trượt chân trụ p95 tăng từ 0,117 lên 0,188 m/s.**
  - Hầu hết do đi ngang (1,13 → 1,30). Đó là lỗi cũ của clip Strafe: khóa xoay trên bóng chân trôi 18–20 cm rồi mới nhả.
  - Thêm phần đầu lúc bắt đầu đi, vì hướng mặt giờ xoay chậm hơn.
  - Các pha xoay, dừng, dash và chiêu đều giảm.
- **Cú nhả nhanh làm 4 lần chuyển clip vượt 1,5 × đỉnh clip** (1,66–2,27 ×; cẳng tay K2 4.029°/s). Trước khi đổi sang lò xo theo cung tròn, con số này là 4,4 ×. Muốn chậm hơn nữa thì cú nhả sẽ mất độ dứt khoát.
- **Bấm auto liên tục (stress):** đầu gối phải giật tới 7.400°/s. Lỗi này có từ vòng 1 (6.100°/s): khóa chân bật tắt ở ngưỡng 4,5 / 6 cm khi Attack nhấc chân, nay thêm phần hạ hông của lớp diễn xuất. Demo không bị.
- **Dáng gồng khác dáng nhả dưới 15 %:** khi đo ở khung nhả, cả 6/6 chiêu dưới 15 %; khi đo ở đỉnh đòn (`strikePct`), còn 3/6 (auto, K1, hộ thân). Hộ thân chỉ 4,7 %, vì tư thế thủ đổi tay nhiều nhưng các khớp khác đứng yên.
- **Trúng đòn mạnh:** thân 18° cộng đầu 25° làm mặt ngước gần thẳng lên camera trong 2–3 khung. Cần giám khảo xem có quá tay không.
- **Phi Kiếm không có chữ để gõ:** pha lấy đà chỉ còn 50 ms của clip.
- Clip Start, Stop, Turn và Strafe thật (Quaternius UAL) vẫn chờ chủ dự án đồng ý tải.
- Chưa có hai giám khảo mới chấm. Chưa commit.

## 5. Tệp
- **Mới:**
  - `src/lab/anim/acting.ts`;
  - `src/lab/anim/arm-check.ts`.
- **Sửa:**
  - `src/lab/anim/animator.ts`: nối lớp diễn xuất, nhịp chiêu, dash và bước hãm, trúng đòn, lắc khi dừng, nghiêng vào vòng rẽ;
  - `src/lab/anim/layers.ts`: áp dáng diễn xuất, Hit nhẹ hơn;
  - `src/lab/anim/locomotion.ts`: bộ bám hướng có giới hạn, `nudge`, tốc của đường dash;
  - `src/lab/anim/foot-ik.ts`: bước từng chân, đổi chỗ đặt chân giữa bước, không bước khi chân kia trên không;
  - `src/lab/anim/springs.ts`: `trailBoost`;
  - `src/lab/caster.ts`: clip `thrust`, chiêu theo ô, ánh viền, móc kiểm tra tay;
  - `src/lab/skills-main.ts`: móc tối thiểu: số phím còn lại, mục tiêu lúc nhả, bỏ đèn đỏ, `arms` trong `metrics()`;
  - `docs/SYNC_DEBT.md`.
