# Lab kỹ năng: đợt "uy lực", lượt 3a — đặt lại hướng hình ảnh VFX, bước một (03/11/2026, buổi sáng)

Lý do: hai lượt sửa theo ghi chú của giám khảo cho điểm 5,8 / 5,5 rồi 5,4 / 5,4 (trần 8,5). Theo luật của anh "ba lần không tiến bộ thì bàn với ChatGPT", ChatGPT chẩn đoán và Claude đã chấp nhận (`docs/games/tu-tien/skills/source/vfx-diagnosis-chatgpt-2026-11-03.md` ở repo cha). Tóm tắt:
- mọi thứ bị đẩy về xám giữa: chớp toàn màn trong không gian tuyến tính, mờ tỏa tâm 80 ms, viền màu 12 px, những thân bạc hà cộng sáng to và trong mờ, bốn sắc độ tranh nhau;
- cách sửa là **thứ bậc độ sáng**: lõi trắng nhỏ, rồi một dải màu bão hòa hẹp, trên một nền tối và sạch;
- hiệu ứng phải là hình vẽ có chủ đích, không phải chồng thêm lớp.

Claude đang vẽ riêng sáu khung mục tiêu làm "hợp đồng hình ảnh". Lượt này làm phần **bớt đi** và phần kỹ thuật nền mà khung mục tiêu nào cũng cần (P0, P2, P3, P6, P7, P8 của ChatGPT). Bố cục tuyệt kỹ K5, bố cục cảnh cận và flipbook để lượt 3b, theo khung mục tiêu; K5 lượt này chỉ mất lớp sương xám qua mục P2. Không chạy giám khảo mù ở lượt này. Lab vẫn là trang dev, không vào bản build.

## Đã làm, theo commit

| Mục | Commit | Nội dung |
|---|---|---|
| P0. Kiểm chuỗi hậu kỳ | `f39a5ea` | `__lab.pipeline()` ghi lại thứ tự và không gian màu (High): **RenderPass** (cảnh HDR tuyến tính vào đích half-float của composer, chưa tone map, chưa sRGB) → **HdrProbe** (chỉ có ở lab, tắt trừ lúc đo) → **UnrealBloomPass** (ngưỡng 1, cường độ 0,45, bán kính 0,12) → **ScreenPass** (tuyến tính) → **OutputPass** (phơi sáng 0,72, Neutral, sRGB) → từ P2: **ImpactPass** trên giá trị hiển thị; sau đó lớp số sát thương (`renderer.addOverlay`) rồi DOM. Đích composer HalfFloat, MSAA 0 ở High (4 ở Ultra). `__lab.post()` vẽ lại đúng khung đó không bloom, không pass màn hình, đường cong tuyến tính thay Neutral, hoặc không sương; `__lab.hdr()` đọc bộ đệm tuyến tính lúc vào bloom (phân bố độ sáng, tỷ lệ điểm ảnh trên 1 và trên 4, đỉnh sáng dọc từng thanh kiếm phím 7 theo hạng, qua `VanKiemFx.poseOf`). Kịch bản `scripts/visual/scenarios/lab-power-r3a.mjs` (chế độ chain, frames có tự dò khung cao trào, numbers, victims, herostrip) |
| P2. Khung va chạm đồ họa | `8cfdd66` | `src/view/screen-fx.ts`: **bỏ** chớp toàn màn có màu (0,42), mờ tỏa tâm 80 ms, viền màu 12 px và đĩa sáng mềm tại chỗ. Pass mới `ImpactPass` đặt **sau OutputPass**, chạy trên giá trị hiển thị, chỉ bật trong đúng các khung của nó. **Khung tối**: thế giới thành bóng xanh đen, các hình (thú, Lam, kiếm trên tay: mặt nạ diễn viên do lab vẽ ở nửa độ phân giải, một vật liệu trơn, không đèn, không sương, không cập nhật bóng) đen hẳn, lõi đòn đánh trắng, viền xanh lam hẹp quanh lõi, tia tụ tâm xanh mờ. **Khung đảo**: nền giấy gần trắng, hình tối có đường viền xanh lam, lõi đòn và vết mực nứt thành nét mực, đường tụ tâm bằng mực. Rồi **trở về cứng**. Chiêu: 1 khung (tối); nhát kết phím 7: 2 (tối với trường vệt kiếm, đảo); cao trào K5: 3 (tối, tối, đảo); đòn chính của đòn thường và chiêu: **một khung cục bộ**, mảng đảo trong hình ngôi sao nổ, nét mực trăng lưỡi liềm chém theo hướng đòn. Mỗi khung ~1/60 s, ít nhất một khung vẽ, ở mọi tần số. Hình dạng là các mặt nạ vẽ tay điều phối viên gửi (`art-src/skills/impact-tex`, ChatGPT vẽ, trắng trên đen dùng làm alpha), xoay, co giãn, lật theo từng lần dùng; thiếu tệp thì khung cục bộ dùng ngôi sao tám tia bằng shader. Số sát thương và DOM vẽ sau composer nên không bao giờ bị đảo. Low và Medium (không có composer) không có khung đồ họa. Cường độ 0 tắt hết |
| P3. Ngữ pháp kiếm phím 7 | `fa289ca`, `9e108bd` | `src/view/skills/sword-grammar.ts` (mới): một dải quay về camera, vẽ từ gốc tới mũi trong **không gian màn hình** (bề rộng tính bằng px ở 1080p, có mức sàn, rộng hơn khi bề rộng thật lớn hơn), hình dáng vẽ trong shader, một lần vẽ instanced, alpha nhân trước (thân che được thứ phía sau, sống kiếm cộng sáng). **Kiếm chủ** (6): chuôi, đốc, cán vàng (chỗ vàng duy nhất), mép xanh đen, thân lam hai tông (mặt sáng, mặt tối), sống trắng cứng ≥ 2 px, mũi đi trước; 2,2 m khi rời tay (86–96 px ở camera chơi), 4,2 m trên sông (trung vị 145–176 px). **Kiếm giữa** (32 ở High, 24 / 16 ở mức thấp): không chuôi, sống trắng thon, thân lam, mép xanh đen hẹp, vệt ngắn phía sau ≥ 4 px (trung vị 70–80 px). **Vệt xa** (100 ở High, 64 / 40): vệt có hướng, đầu trắng nhạt dần thành lam, ở làn ngoài và phía trên sông. Ánh sáng sống kiếm là trắng ngả lam: đường cong tone map cho giữa thành trắng, quầng bloom nó tạo vẫn lam, nên thân kiếm không bị phủ trắng. `van-kiem.ts` giữ nguyên chuyển động, chọn mục tiêu, dòng thời gian; **bỏ** 328 bản GLB có chuôi vòng (2,6 triệu tam giác), sắc ngọc, bạc, vàng trên sông, thẻ hào quang và vệt cộng sáng, 9 thẻ sáng dọc sông, mọi vũng sáng trên đất, phần lớn kim tuyến (320 → 90 đốm/giây). Va chạm: vệt chém trắng hẹp, sao trắng, tia lửa trắng và lam, vòng lam mảnh; đòn kiếm chủ thêm vết cháy mực và cột sáng hẹp; đường nứt và hai dải sáng của nhát kết hẹp hơn, lõi nóng hơn; vệt lụa kiếm chủ là lõi mảnh trong viền lam đậm |
| P6. Tầng nạn nhân | `25db5b7` | `src/lab/victims.ts` (mới), `src/lab/herd.ts`: mỗi lần tung phím 7 hoặc K5. **Nạn nhân chính** (phím 7 tối đa 7: tới 4 trước nhát kết, cách nhau ≥ 0,3 s, phần còn lại ở nhát kết; K5 tối đa 6, tới 3 ở hai đợt đầu), thú nhỏ hoặc vừa, trong khung, cách nhau ≥ 2,4 m: đúng khung trúng đòn có **bóng trắng lam một khung** và một cú đẩy 0,4 m, rồi bị hất lên, xoay 1,25 vòng, giữ viền lam lúc bay và lúc nằm; khi rơi xuống, một thanh kiếm chủ dài 3,6 m **cắm xuyên** trong 80 ms, sao trắng chỗ chạm, vòng lam trên đất và vết cháy mực; giữ ~1 s rồi con bị giết mới tan, kèm vụ nổ chết (hoãn lại). **Nạn nhân phụ** (các đòn khác lực ≥ 0,85, đòn vùng của K5): **cùng nhảy lên** với mọi con trúng trong cùng khung, có chớp viền. **Nền** (đòn nhẹ của sông kiếm): chớp viền rồi tan. Ánh sáng nhát kết không còn tự hất mọi thú nhỏ; đợt cuối K5 không còn gọi `herd.launch` cho từng con |
| P7. Số sát thương | `fe9f730` | `src/view/damage-compile.ts`, `src/view/hitfx.ts`: đòn gộp theo từng đợt 125 ms của mỗi lần tung. Mỗi đợt tối đa **2 chí mạng hoặc tinh anh** và **4 nạn nhân đáng kể** (gói lớn nhất) có số riêng; gói dưới 15 % gói lớn nhất của lần tung đó (vi đòn) và mọi thứ vượt ngân sách chỉ cộng vào **một tổng chạy** (phím 7, K5, K2, K4; tổng thứ hai chạy cùng lúc nằm ở làn dưới). Đợt mới làm số nạn nhân cũ của cùng lần tung **mờ đi ngay** (0,12 s). Trường số giữ **tối đa 8** (`SKILL_NUMBER_CAP`: 2 tổng, 4 nạn nhân, 2 chí mạng/tinh anh; số mới vượt ngân sách loại số cũ nhất cùng loại, kể cả khi gộp biến số nạn nhân thành chí mạng), mọi nhãn cách mép khung ≥ 5 % và **không bao giờ nằm trên thẻ chữ** (`setWordTags`: dời xuống dưới thẻ, không được thì lên trên, không được nữa thì bỏ). Bỏ ô 8 m, cửa sổ vùng 1 s và tổng cụm của lượt 2. Có bài kiểm thử áp lực tự động |
| P8. Đòn thường | `e034487` | `src/view/skills/kiem.ts` cho Phi Kiếm (K0) và Ngự Kiếm Quyết (K1). **Tách ra ở tay**: sao nóng to hơn (2,1–2,6 m), 8 vạch tốc độ, hai vòng ấn bùng ở tay rồi xoay ra suốt đường bay, ấn dưới chân sáng lên (đòn thường giờ mang chữ của Kiếm: ấn tụ lực của nó); bỏ quầng mềm rộng phía sau cho hai chiêu này. **Thân bay**: chính thanh kiếm, 1,55 × 1,1 m (~75 px, trước 1,3), phủ **sống** của ngữ pháp kiếm (sống trắng ≥ 2 px, HDR 5, viền lam), mũi đi trước, vệt lõi trắng trong viền lam rộng ≥ 0,32 m (~14 px). **Trúng đích, lấy mục tiêu làm tâm**: sao trắng nóng và tia lóe chéo, vạch tốc độ ngắn, vòng lam mảnh trên đất và vòng quay về camera, tia lửa theo hướng đòn, mực bắn và vết mực; khung đồ họa cục bộ của màn hình (sao nổ, trăng lưỡi liềm) và **bóng trắng lam một khung** trên con thú (`herd.silhouette`); không còn quầng mềm rộng, không còn sao lớn màu viền. Tông Clear Wind của K0 và K1 thành trắng và lam (K1 trước là ngọc: "một vệt xanh lá") |

## Cổng và số đo

Ảnh 1920×1080, DPR 1, camera chơi, đồng hồ cố định 60 Hz, máy M4 (ANGLE Metal).

**P0, chuỗi hậu kỳ** (mức xám trung bình 0–255 của khung; `chain-before.json`, `chain-after.json`):

| Khung | Trò chơi | Không bloom | Không pass màn hình | Tuyến tính thay Neutral | Không sương |
|---|---|---|---|---|---|
| Nghỉ | 66,1 | 66,1 | 66,1 | 86,3 | 66,0 |
| Phím 7 săn F90, trước | 61,5 | 53,1 | 64,5 | 84,1 | 61,4 |
| Phím 7 săn F90, sau | 45,3 | 39,1 | 48,6 | 69,5 | 45,2 |
| Phím 7 cao trào C0, trước | **118,4** | 110,2 | **69,2** | 131,0 | 118,3 |
| Phím 7 cao trào C0, sau | 30,4 (khung tối) | 23,8 | 56,5 | 34,9 | 30,4 |
| K5 cao trào C0, trước | **103,0** | 101,3 | **47,8** | 116,7 | 103,0 |

Kết luận: chuỗi không tự tạo lớp sương xám. Neutral **làm tối** chứ không nâng xám (66 so với 86 khi tuyến tính), sương gần như không đổi gì (≤ 0,1), bloom thêm 0 lúc nghỉ và +8 lúc săn ở lượt 2 (+6 bây giờ). Lớp sương sữa ở cao trào lượt 2 là **pass màn hình** (chớp 0,42 + mờ + viền màu): +49 mức xám ở phím 7, +55 ở K5. Đã gỡ ở P2.

**HDR vào bloom** (đỉnh sáng dọc thân kiếm, trung vị): lượt 2 kiếm chủ 2,1 / kiếm sông 2,0 (dưới mục tiêu 4–8); bây giờ kiếm chủ 5,2 lúc săn, 6,2–7,5 ở cao trào; kiếm giữa 4,6 lúc săn, 5,3–5,9 ở cao trào; vệt xa ~1 (tầng nền, không bloom). Độ sáng tuyến tính trung bình lúc săn 0,098 (lượt 2: 0,167); điểm ảnh trên 1: 0,47 % (2,5 %).

**P2, thang xám ở cao trào** (đen ≤ 0,1, trắng ≥ 0,9, dải giữa rộng 0,1 lớn nhất trong khoảng 0,2–0,8; `gray-gate.json`):

| Khung | Trước: đen / trắng / dải giữa | Sau: đen / trắng / dải giữa |
|---|---|---|
| Phím 7 C0 | 1 % / 3 % / **76 %** | **81 %** / 2 % / 10 % |
| Phím 7 C+1 | 1 % / 4 % / 67 % | 8 % / **57 %** / 12 % |
| K5 C0 | 1 % / 0 % / **93 %** | **84 %** / 1 % / 11 % |
| K5 C+2 | 1 % / 1 % / 62 % | 7 % / **66 %** / 11 % |

Cổng đạt: các khung cao trào có đen thật và trắng thật, không còn một dải xám giữa phủ cả khung. Lưu ý: khung tối của K5 chỉ có ~1 % trắng (lõi xoáy nhỏ); trắng của K5 nằm ở khung đảo. Bố cục K5 là việc của lượt 3b.

**P3, đọc được khi tắt bloom**: kiếm chủ và kiếm giữa vẫn đọc ra từ bóng dáng, sống trắng, độ thon và hướng (`sheets/after-k7-bloom-on-off.jpg`; lượt 2 tắt bloom thì chỉ còn que bạc hà, `sheets/before-k7-bloom-on-off.jpg`). Kích thước ở camera chơi: kiếm chủ trung vị 145–176 px (≥ 35 px), kiếm giữa 70–80 px.

**P6, thấy được ở ảnh thu 25 %**: phím 7 có 7 nạn nhân chính (0,22 / 1,4 / 2,0 / 2,6 s và ba ở nhát kết), cú đẩy 13–18 px, quãng di chuyển lớn nhất 52–81 px ở 1080p (3–4,5 px và 13–20 px ở 25 %); K5 có 5, đẩy 12–15 px, di chuyển 37–73 px. Ở 25 %, ngôi sao nổ lúc trúng, kiếm cắm và thân viền lam đọc ra rõ (`sheets/after-k7-hero-victims-25pct.jpg`). Chưa tốt: nạn nhân chính trước nhát kết khó tách khỏi dòng kiếm đang chạy qua chỗ nó.

**P7, ≤ 8 số**: bài kiểm thử áp lực (`tests/view/skill-numbers-stress.test.ts`, 8 s: chiêu cả sân 2,5 s một lần, tuyệt kỹ chồng lên, đòn thường 6 khung một lần, ô 1 mỗi 40 khung, 12 thẻ chữ) kiểm từng khung: ≤ 8 số, ≤ 2 tổng, ≤ 4 nạn nhân, ≤ 2 chí mạng, cách mép ≥ 5 %, không đè thẻ chữ, tổng bằng đúng tổng đòn. Trong lab (phím 7, K5, K1 và đòn thường cùng lúc, 520 khung): nhiều nhất 7 số. Một lần phím 7 giữ tối đa 7 số (lượt 2: 61 số một lần, 11–16 cùng lúc).

**P8, đọc được ở camera chơi**: `sheets/before-after-k0-1080p.jpg`, `sheets/before-after-k0-close-crops.jpg`: lượt 2 trúng đích là một cục sáng mềm cỡ hai con thú; bây giờ là ngôi sao nổ đồ họa trên đúng con bị trúng, thân con đó lóe trắng một khung, rồi vòng lam mảnh.

**Hiệu năng** (High, 1080p, DPR 1, trung vị 5 lần, p95): nghỉ 8,4 ms; phím 7 săn **9,3 ms** (lượt 2: 10,5–11,1); phím 7 nhát kết **7,5 ms** (8,5–8,6); K5 các đợt **10,8 ms** (10,6–10,9). Giới hạn 11,5 ms: đạt. Thanh kiếm đang vẽ ở phím 7: 138 (lượt 2: 328).

**Độ trễ phím tới phát chiêu** (phím bấm giữa lúc đang khựng đòn): VFX 0 ms ở cả 8 ô, thân 33 ms. Giới hạn 50 ms: đạt.

**Kiểm tra**: `tsc` sạch; `pnpm test` 79 tệp, 703 bài đạt; `pnpm build` đạt; grep `dist` không thấy mã lab (`window.__lab`, `HdrProbe`, `VictimDirector`, `drawActorMask`, `skills-lab`, `impact-tex`, `art-src`, `heroVictim`, `lab-herd`, `IMPACT_FRAGMENT`, `shapeAt`, `SWORD_SPINE`, `uCyanLit`: 0 tệp; mẫu đối chứng `ic-hud`: 1 tệp; `tmp/shots/power-r3a/dist-grep.txt`).

## Ảnh

Trong `tmp/shots/power-r3a/` (bị bỏ qua khỏi Git; khung thô đã xóa):
- `sheets/before-after-{k7,k5,k0,k1}-1080p.jpg`: trước và sau, cùng khung;
- `sheets/before-climax-gray.jpg`, `sheets/after-climax-gray.jpg` và `gray/`: các khung cao trào ở thang xám;
- `sheets/before-k7-bloom-on-off.jpg`, `sheets/after-k7-bloom-on-off.jpg`: kiếm phím 7 bật và tắt bloom;
- `sheets/k7-peak-640x360.png` và `d640/`: thử thu nhỏ đỉnh phím 7 về 640×360;
- `sheets/chain-k7-climax.jpg`, `sheets/chain-k7-hunt.jpg`: cùng khung qua các biến thể của chuỗi;
- `sheets/after-k7-hero-victims-25pct.jpg`, `sheets/before-after-k0-close-crops.jpg`;
- số đo: `chain-*.json`, `frames-*.json`, `gray-gate.json`, `victims-p6.json`, `herostrip-p6.json`, `numbers-p7.json`, `perf-high.json`, `latency.txt`.

## Chưa xong, và khung mục tiêu cần quyết

- **Khối lượng của sông kiếm.** Thử 640×360 cho thấy thứ bậc sáng sạch hơn hẳn, nhưng sông kiếm giờ mỏng và thưa hơn lượt 2: bớt từ 328 xuống 138 vật thể làm mất cảm giác "vạn kiếm". Khung mục tiêu cần quyết sông kiếm đọc như **một hình khối** (một dải, một con rồng, một thiên hà) với bóng dáng và sống sáng chung, hay như nhiều thanh riêng; và mật độ cùng bề rộng của từng tầng.
- **Bố cục theo chiều đứng.** Cả phím 7 và K5 vẫn nằm phẳng trên mặt đất ở camera 55°; ChatGPT và cả hai giám khảo đều đòi trời, cột, mưa kiếm từ trên xuống. Lượt 3b.
- **Lúc nào dùng khung đồ họa.** Hiện là 1 khung cho nhát kết chiêu, 2 cho nhát kết phím 7, 3 cho K5, 1 khung cục bộ cho mọi đòn chính. Khung mục tiêu nên chốt hình dạng nào (tia, trường vệt kiếm, sao nổ, trăng lưỡi liềm, mực nứt) đi với chiêu nào, và có muốn khung −1 (vũ khí trắng, vạch tụ tâm) trước khung 0 không.
- **Kiếm chủ.** Hiện vẽ bằng shader (chuôi vàng, không vòng); mô hình Clear Wind có chuôi vòng mà giám khảo gọi là "chìa khóa". Khung mục tiêu nên chốt dáng kiếm chủ ở 35–190 px.
- **Nạn nhân chính trước nhát kết** dễ chìm trong dòng kiếm; có thể cần khoảng lặng quanh chỗ trúng hoặc một cú chém lớn hơn.
- **Chết và hồi sinh**: vụ nổ chết của `death-fx.ts` (tia linh khí và vũng sáng) vẫn là những quả cầu lam mềm sau nhát kết phím 7; chưa đổi ở lượt này.
- Low và Medium không có khung đồ họa (không có composer).
- K5, cảnh cận và flipbook: lượt 3b theo khung mục tiêu.
