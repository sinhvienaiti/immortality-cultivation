# 03/11/2026: vòng 4 chuyển động của lab kỹ năng: dáng khóa tác giả trên người đại diện

Ba vòng chỉnh lớp thủ tục trên nhân vật mượn Lam không làm điểm giám khảo mù tăng: 5,4/5,4, rồi 6,1/6,5, rồi 5,3/5,7. Theo luật "ba lần thử thì bàn với ChatGPT", hai bên đã bàn một cách khác. Claude nhận bước 1 trong kế hoạch của ChatGPT:
- Kỹ thuật thủ tục (inertialization, IK, lò xo, probe) vẫn ổn.
- Lớp còn thiếu là các dáng khóa do người làm, thiết kế theo khung hình của camera.
- Lam đội mũ trùm, nên ở 30–70 px từ camera sau lưng 55° không bao giờ đọc được tay.

Vòng này làm một chiêu duy nhất: Lạc Kiếm Trận (ô k4, quét tung quạt kiếm). Chiêu chạy trên một người đại diện có tỉ lệ người, chỉ có thân và vật liệu phẳng.

Không đụng `src/lab/skills-main.ts`, `src/kit/**`, `src/view/**`, `herd.ts`, `death-fx.ts`, `cutin*.ts`. Lab chỉ chạy trên trang dev, không vào bản build.

Commit: `eb8698f` (người đại diện, động cơ dáng khóa, probe), `db727f2` (dáng v2), `bf39ccb` (dáng v3), `52d2a2f` (kịch bản chụp cho giám khảo).

## 1. Người đại diện (`?hero=human`)

- `src/lab/hero-select.ts` mới: hồ sơ rig cho từng nhân vật. Hồ sơ ghi tệp, tên clip, trục mặt trước, socket, tay cầm kiếm, chiều cao và màu. Mã chỉ đọc tên xương chuẩn. Lam vẫn là mặc định (`?hero=lam`).
- Người đại diện là người của Mesh2Motion: `art-src/lab/anim/human-base-animations.glb`, 13.757 tam giác, 66 khớp có ngón tay, CC0, đã ghi trong `docs/games/THIRD_PARTY.md`.
  - Cao 1,65 m, một vật liệu xám phẳng.
  - Mặt trước của mô hình là +z, nên mô hình được bọc trong một nửa vòng quay, để Animator thấy mặt trước −z như với Lam.
- Clip riêng chạy đúng như tác giả làm (cùng rig, không retarget):
  - Idle_A, Walk, Jog, Sprint;
  - Sword_Regular_A/B, Sword_Attack, Sword_Block;
  - Spell_Simple_Shoot, Hit_Chest;
  - Run_Anime cho dash;
  - các bước ngang và đi lùi.
- Thời điểm nhả của từng clip đánh được đo khi nạp: đỉnh tốc độ của tay nhanh hơn. `CLIP_RELEASE_S` được điền tại chỗ, nên lab đọc đúng số mà không cần sửa `skills-main.ts`.
- Idle là Idle_A. Idle_Sword là một thế ngồi chiến đấu sâu (hông 0,68 m trên 0,83), làm mọi dáng bị ngồi chồng lên ngồi.
- Socket lòng bàn tay FX_HAND_R và FX_HAND_L được thêm khi nạp.
- Kiếm Clear Wind nằm trong `hand_r`, với tay cầm riêng của hồ sơ (`hand-sword.ts` đọc `HERO.grip`).
- `body-proxy.ts`: bỏ một bàn tay thì bỏ luôn các ngón của nó. Không có sửa này, ngón của người đại diện đẩy kiếm ra khỏi chính nắm tay.
- Mọi chiêu khác vẫn chạy trên cả hai nhân vật (`tmp/r4/skills-check.mjs`): auto, k1, k2, hộ thân, dash, k4, k5, k7, đi bộ, trúng đòn. Không có lỗi. Lam diễn đúng như trước.

## 2. Dáng khóa (`src/lab/anim/key-pose.ts`)

- **Sáu dáng cho một chiêu:** sẵn sàng → lấy đà sớm → cuộn giữa → cuộn tối đa → nhả → theo đà.
- **Dữ liệu:** góc xoay xương theo tên chuẩn.
  - Mỗi góc là độ quay tuyệt đối từ tư thế nghỉ (T-pose) trong khung nhân vật: x sang phải, y lên, z ra sau; độ Euler, thứ tự 'YZX'.
  - Ngón tay tính theo xương cha. Xương đòn tính theo ngực.
  - Mỗi dáng còn có độ hạ hông (xuống, tới, phải) và một thế chân cho khóa chân.
  - Khi nạp, góc tuyệt đối đổi thành góc theo xương cha, để nội suy theo cung FK.
- **Cách tác giả viết dáng:** `fan-sweep-spec.ts` mô tả dáng bằng hướng của từng đốt tay và hướng lưỡi kiếm, theo cách camera đọc. `scripts/lab/bake-key-poses.ts` nướng spec thành `fan-sweep-poses.ts`; lúc chạy chỉ đọc tệp đã nướng. Trong lab, `__labPose.preview` cho thử spec mà không cần khởi động lại.
- **Theo chữ gõ:**
  - Mỗi phím đẩy cuộn thêm một bậc.
  - Giữa hai phím, cuộn vẫn bò tiếp tới 60 % bậc sau.
  - Một vòng giữ dáng luôn chạy, để không đoạn nào đứng hình: thân xoay nhẹ, tay kiếm vẽ hai nón (cánh tay và cẳng tay, hai nhịp không bội nhau), cổ tay rung nhẹ.
- **Phím cuối:**
  - Nhả ngay trên khung đó: 83 ms, đường cong bùng nổ ở đầu.
  - Giữ 0,1 s, theo đà 0,14 s, lắng 0,1 s.
  - Hồi về Idle trong 0,22 s.
- **Animator:** trạng thái "pose" chạy trên Idle.
  - Dáng khóa ghi sau các lớp thế giới và trước IK chân. Chân do IK hai đốt gập theo hông hạ; lò xo chạy sau cùng.
  - Lớp diễn xuất thủ tục đứng yên với chiêu này.
  - Một đòn trúng vẫn lộ ra, vì nó lấy bớt trọng số của dáng.

## 3. Đo theo khung hình camera (`src/lab/pose-probe.ts`, `__labPose`)

- Camera lấy từ `onBeforeRender` của chính mesh nhân vật, nên không cần móc vào `skills-main.ts`.
- Đỉnh của lưới skinned được chiếu trên CPU, nên bóng hình đo chính xác.
- Các số đo:
  - bề ngang bóng hình so với Idle;
  - khoảng cách trên màn hình từ lòng bàn tay và mũi kiếm tới bóng thân và đầu;
  - độ hạ hông;
  - cuộn (đường vai so với đường hông) sau mỗi phím;
  - đoạn đứng hình dài nhất trong lúc gõ (mọi điểm theo dõi nằm trong 2 % chiều cao nhân vật trên màn hình);
  - từ phím cuối tới khi thân động.
- Kịch bản chụp `scripts/visual/scenarios/lab-keypose.mjs` có ba chế độ: `metrics`, `test` (bộ kiểm tra mù) và `judge` (tờ cho giám khảo).

## 4. Ba phiên bản dáng và kiểm tra mù pha và hướng

Bộ kiểm tra gồm 96 mục:
- 72 ảnh tĩnh: 8 hướng trên màn hình × 3 pha × 3 cỡ (30, 50, 70 px);
- 24 dải 6 khung ở 50 px.

Ảnh chỉ có thân, tắt VFX, ẩn quái và vòng sáng dưới chân. Tên ảnh ngẫu nhiên, đáp án để ngoài thư mục ảnh. Cỡ 30 và 50 px lấy bằng khung nhìn nhỏ hơn ở camera toàn sân; 70 px lấy bằng zoom 0,19 ở 1080p. Ngưỡng đạt: pha ≥ 80 %, hướng ≥ 90 %.

| Bản | Người kiểm | Pha | Hướng (đúng ô) | Hướng ±45° | Ảnh tĩnh pha / hướng | Dải pha / hướng |
|---|---|---|---|---|---|---|
| v1: cú quét thuận tay, kiếm kéo về sau bên phải | 1 | 49 % | 41 % | 69 % | 36 % / 31 % | 88 % / 71 % |
| v2: lưỡi kiếm giơ cao nhắm mục tiêu | 2 | 75 % | 95 % | 100 % | 67 % / 96 % | 100 % / 92 % |
| v3: hồi chiêu đứng dậy, kiếm hạ | 3 | **97 %** | **96 %** | 96 % | 96 % / 96 % | 100 % / 96 % |
| v3 | 4 | **100 %** | **94 %** | 100 % | 100 % / 96 % | 100 % / 88 % |

Bài học từ từng bản:
- **v1:** ở 30–70 px, người xem đọc ảnh tĩnh theo đường lưỡi kiếm: kiếm chỉ đâu thì đòn đi đó. Kiếm kéo về sau vì thế chỉ đòn ngược hướng, và ảnh theo đà bị đọc thành nhả. v1 trượt rõ, nên không tốn thêm người kiểm thứ hai.
- **v2:** phân biệt pha bằng độ cao lưỡi kiếm, và lưỡi kiếm luôn nằm trên đường đòn:
  - lúc cuộn, kiếm giơ cao trên vai phải nhắm thẳng mục tiêu, ngón kiếm của tay kia chỉ cùng đường;
  - lúc nhả, một cú quét chéo hạ xuống, tay thẳng ngang nhắm mục tiêu trong thế lao người, tay kia hất về sau;
  - còn hỏng: ảnh hồi chiêu vẫn duỗi tay, nên bị đọc thành nhả (18 trên 32).
- **v3:** khi theo đà, thân đứng dậy khỏi thế lao, chân sau bước lên khép lại, tay kiếm hạ xuống với lưỡi vẫn trên đường đòn, nghiêng xuống khoảng 30°, tay kia buông xuống bên hông.

Điểm yếu còn lại của v3: lúc cuộn với hướng "xuống" (về phía camera), lưỡi kiếm chĩa vào camera nên co ngắn lại. Cả hai người kiểm đều sai cả 4 mục này.

## 5. Số đo v3 (`?typed=1`, 45 WPM, chữ 6 ký tự, 60 Hz, camera chơi, nhân vật cao 62 px)

| Mục | v3 | Luật |
|---|---|---|
| Phím cuối → sự kiện chiêu (VFX) | 0 ms (cùng khung) | ≤ 50 ms |
| Phím cuối → thân bắt đầu động | 0 khung | cùng khung hoặc khung sau |
| Phím cuối → 85 % đường nhả | 2 khung (33 ms) | nhả bùng nổ 50–100 ms |
| Bề ngang bóng hình so với Idle | cuộn 1,87 ×, nhả 2,2 ×, theo đà 1,34 × | ≥ 1,5 × |
| Hạ hông | 0,187 m = 23,8 % chiều cao hông (11,3 % chiều cao người) | 20–25 % |
| Cuộn theo phím | −3, −12, −14, −24, −30° (đỉnh 35° có vòng giữ) | 25–35°, lớn dần |
| Tay kiếm ngoài bóng thân | cuộn 0,22, nhả 0,33 chiều cao người | 0,20–0,35 |
| Tay kia ngoài bóng thân | cuộn 0,39, nhả 0,30 | 0,20–0,35 |
| Tay kiếm, px ở 30/50/70 | cuộn 6,7 / 11,1 / 15,6; nhả 10 / 16,7 / 23,4 | 6–10 / 10–18 / 14–24 |
| Tay kia, px ở 30/50/70 | cuộn 11,7 / 19,5 / 27,2; nhả 9 / 15 / 21 | như trên |
| Mũi kiếm, px ở 30/50/70 | cuộn 17,6 / 29,4 / 41,1; nhả 25,7 / 42,8 / 60 | ngoài bóng thân |
| Đoạn đứng hình dài nhất lúc gõ | 83 ms | ≤ ~100 ms |
| Hồi chiêu | 0,22 s (sau 0,34 s giữ, theo đà, lắng) | 120–250 ms |

Px ở 30/50/70 được tính từ px đo được nhân tỉ lệ chiều cao nhân vật (phép chiếu gần như afin ở cỡ này). Probe cũ báo `keyToBodyMs = −1` với chiêu dáng khóa, vì không có clip nhả; số "thân bắt đầu động" ở trên thay cho nó.

## 6. Giám khảo mù (VFX bật; camera chơi toàn sân, vùng quanh nhân vật và cận cảnh `__lab.zoom(1)`; so với Genshin, Star Rail, Wuthering Waves; không có số trên tờ)

| Hạng mục | Điểm |
|---|---|
| Lấy đà và theo đà | 4,5 |
| Khối lượng | 4,0 |
| Chuyển tiếp, độ mượt | 4,5 |
| Đọc rõ ở camera chơi | 5,0 |
| Cử chỉ khớp chiêu | 4,0 |
| Thân và VFX khớp nhịp | 5,5 |
| **Chung** | **4,6** |

Năm cách sửa của giám khảo, quan trọng nhất trước:
1. **Cuộn lớn dần thấy được theo từng phím.**
   - Kiếm bắt đầu thấp sau hông, mỗi phím nâng lên một bậc.
   - Thân xoắn ngược khỏi vùng đích, hông hạ thêm 10–15 %, trọng tâm về chân sau.
   - Ở dáng cuộn cuối, kiếm giương sau đầu.
   - Giám khảo thấy dáng hiện tại là một chữ V giữ nguyên 1,25 s.
2. **Nhả là một cú ném vào vùng đích.**
   - Hông xoay trước, rồi ngực, rồi cú quét từ trên đầu ra trước, kết thúc chỉ vào vùng.
   - Tay kia hất ra sau, chân trước đặt về phía vùng.
   - Một vệt nhòe 3–4 khung.
3. **VFX nối thân với vùng.**
   - Kiếm bay ra từ cung quét thành một vệt 100–150 ms tới vùng, thay cho cột sáng thẳng đứng.
   - Chớp sáng ở người thu nhỏ khoảng 50 % hoặc dời về phía vùng, để dáng đỉnh hiện 2–3 khung.
4. **Theo đà quá đường đòn.**
   - Thân xoay quá 10–15°, rồi về thế thủ trong 300–500 ms.
   - Cú xoay khi hồi chiêu trải trên 8–10 ô lưới, không gói trong 3.
5. **Bóng hình ở cỡ chơi.**
   - Người ngả 15–20° về phía vùng khi nhả, tay và kiếm duỗi rộng hơn.
   - Vòng sáng dưới chân mờ đi lúc gõ, thêm vệt mũi kiếm.

Lời nhắc trong tờ hỏi ghi sai ô của phím cuối (ô 41). Giám khảo tự tìm ra đúng ô 28 từ các khung hình, nên điểm không bị ảnh hưởng.

## 7. Kết luận về giả thuyết bước 1 của ChatGPT

**Giữ được một nửa.**
- **Đọc pha và hướng:** dáng khóa theo khung hình camera trên người đại diện đọc tốt hơn hẳn.
  - Ở 30–70 px, chỉ có thân, kiểm tra mù từ 49 % / 41 % lên 97–100 % / 94–96 %, qua ngưỡng 80 / 90 %.
  - Toàn bộ số đo theo luật dáng đều đạt.
- **Ấn tượng chung của giám khảo:** không lên.
  - 4,6, trong khi ChatGPT dự đoán 6,5–7,2 và vòng 3 được 5,3 / 5,7 trên toàn bộ chiêu. Hạng mục đọc rõ nhích từ 4,5 lên 5,0.
- **Vì sao:**
  - Ngôn ngữ dáng đã rõ, nhưng chuyển động giữa các dáng thiếu lực: không có chuỗi hông → ngực → tay, không có vệt nhòe, theo đà không quá đường đòn.
  - Có xung đột giữa hai mục tiêu. Bài kiểm tra mù thưởng cho lưỡi kiếm luôn nằm trên đường đòn. Giám khảo muốn lấy đà kiểu cổ điển, kiếm kéo ngược về sau đầu, mà chính kiểu này đã làm v1 trượt bài kiểm tra.
  - VFX che dáng đỉnh.
- **Hướng gợi ý cho lần sau (cần bàn tiếp):**
  - Kéo kiếm về sau đầu nhưng mũi vẫn chĩa lên và về phía đích, như cầm lao.
  - Dùng cú ném theo chuỗi khớp làm cú nhả.
  - Đưa yêu cầu VFX cho làn VFX.

## 8. Còn mở

- **Móc cho `skills-main.ts`:** không cần.
  - Chiêu k4 gọi `play("skill2")` ngay trong khung nhả. Lời gọi này bị bỏ qua nhờ `strikeAgeS` của trạng thái "pose".
  - Thời điểm nhả của người đại diện được điền vào `CLIP_RELEASE_S` trước khi lab đọc.
- **Idle_A cầm kiếm dựng đứng:** cổ tay của clip quay ngón cái lên. Dáng nghỉ vì thế giống đang giơ kiếm. Muốn sửa phải chỉnh tay cầm theo clip, hoặc dùng một Idle khác.
- **Cuộn hướng về camera:** lưỡi kiếm co ngắn và khó đọc hướng.
- **Gửi làn VFX:**
  - chớp sáng lúc nhả che tay kiếm và đầu trong 2–3 khung;
  - kiếm nên bay ra từ cung quét về vùng đích, thay cho cột sáng thẳng đứng;
  - vòng sáng dưới chân lấn át nhân vật lúc gõ.
- **`tools/capture-prune`:** công cụ từ chối đường dẫn của game này (`protected-path`). Khung thô vì thế được xóa bằng tay, chỉ các thư mục `raw/` và ảnh ghép tạm do chính vòng này tạo.

## 9. Tệp kết quả (`tmp/`, không vào Git)

- **Kiểm tra mù** (ảnh, đáp án `key.json`, câu trả lời của người kiểm trong `answers/`):
  - `tmp/shots/motion/r4-test-v1/`
  - `tmp/shots/motion/r4-test-v2/`
  - `tmp/shots/motion/r4-test-v3/`
  - Clip thật tốc độ của từng dải nằm trong `items-clips/`.
- **Giám khảo:**
  - tờ khung khóa: `tmp/shots/motion/r4-judge/sheets/k4-{field,play,close}.jpg`;
  - lưới từng 3 khung và báo cáo: `tmp/shots/motion/r4-judge/judge/`;
  - clip: `tmp/shots/motion/r4-judge/clips/k4-{field,play,close}-{60fps,half}.mp4`.
- **Số đo:** `tmp/shots/motion/r4-metrics-v3/metrics.json` và `frames.json` (cùng v1, v2 ở `r4-metrics`, `r4-metrics-v2`).
- **Ảnh dáng khi viết:** `tmp/shots/motion/r4-author{,-v2,-v3}/sheet.png`.
- **Kiểm tra các chiêu khác:** `tmp/shots/motion/r4-skills-{human,lam}/sheet.jpg`.
