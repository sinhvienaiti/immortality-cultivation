# Lab kỹ năng: đợt "uy lực", lượt 2 (03/11/2026, rạng sáng)

Lý do: lượt 1 (`docs/changelog/2026-11-03-lab-power-pass.md`) được hai giám khảo mù chấm **5,8 và 5,5** (trần 8,5); anh chấm lab cũ khoảng 6. Anh muốn uy lực tu tiên áp đảo, kiểu anime/donghua, không phải tinh tế: "quá thiếu đi sự khủng bố của tu tiên". Hai giám khảo cùng thấy:
- ở cận cảnh, tuyệt kỹ và chiêu cả sân ra khỏi khung, chỉ còn nhân vật đứng trên sàn;
- "trời tối" không thấy (độ sáng chỉ từ 66 xuống 62), nhát kết là một lớp sương sữa, đòn thường và Ngự Kiếm Quyết nhuộm xanh cả màn như bộ lọc, không thấy rung hay khựng ở tốc độ thật;
- kiếm phím 7 là "đống que sáng" một màu bạc hà, không có thanh chủ, không có lõi nóng, mặt đất không được chiếu sáng;
- thú gần như không phản ứng, sau chiêu xoáy K5 còn đứng trắng bệch như lỗi;
- số sát thương quá nhiều, cỡ lộn xộn, số trắng mảnh lẫn vào kiếm sáng, có số bay ra ngoài sân, không có một con số tổng;
- cảnh cận đứng im như băng quảng cáo, nửa dải trống trơn, chữ Hán đứng trước tên tiếng Anh.

Lượt này sửa đúng sáu điểm đó theo thứ tự được giao. Không thiết kế lại hiệu ứng riêng của K1, K2, K4 (cả bộ chiêu đang làm lại theo `SKILL_CATALOG_V2.md`); phím 7 là mẫu cho chiêu săn cả sân ở ô 4 của trường phái Kiếm. Lab vẫn là trang dev, không vào bản build.

## Đã làm, theo commit

| Bước | Commit | Nội dung |
|---|---|---|
| 1. Chiêu lớn không rời khung | `3eba149` | `CameraZoom.holdWide` (`src/view/camera-zoom.ts`): khi phím 7, cảnh cận của tuyệt kỹ hoặc tuyệt kỹ đang chạy, khung nhìn lùi ra cả sân trong 0,25 s (smootherstep theo thời gian thật, nên chạy cả trong khựng đòn và lúc cảnh cận dừng thế giới), giữ ở đó, rồi về lại mức zoom của người chơi trong 0,5 s. Mức zoom người chơi muốn vẫn giữ nguyên, lăn chuột trong lúc giữ vẫn có tác dụng sau đó. Ở camera cả sân thì có một cú đẩy máy 6 % (`push`). Đo ở cận cảnh 12 m: F6 đã lùi 32 %, F20 ra hẳn cả sân, giữ tới lúc thu kiếm, F290 về lại cận cảnh |
| 2. Hiệu ứng màn hình thật | `9ef0287`, tài liệu cha `ad30c353` | `src/view/screen-fx.ts`: thế giới tối bằng cách **hạ đèn thế giới** (mặt trời, bán cầu, đèn chính, đèn viền, ánh sáng môi trường) qua móc mới `ScreenFxHost.worldLight`, nên mọi lớp VFX cộng sáng giữ nguyên độ sáng trên nền tối và đèn chớp của đòn đánh nổi hẳn lên; thêm viền tối quanh khung và rút màu những điểm ảnh ít bão hòa (thế giới), màu ngọc và lam ngọc của VFX giữ nguyên. Phím 7 và tuyệt kỹ (từ lúc vào cảnh cận, tức trước lúc phát) giữ đèn thế giới còn 55 %, mất 60 % màu; phím 7 tối sâu thêm một nhịp ngay trước nhát kết. Cao trào: chớp toàn màn sắc gọn trong 3 khung (0,42 rồi 0,19 rồi 0,05), mờ tỏa tâm 80 ms và viền màu 12 px hướng về giữa nhát chém hoặc tâm xoáy, rồi trả về khung tối để vết chém phát sáng. Đòn chính chỉ chớp tại chỗ trúng (một đĩa sáng mềm trong pass); đòn thường và Ngự Kiếm Quyết không bao giờ nhuộm hay làm tối cả màn. Rung 3 / 7 / 16 px (trước 2 / 4 / 8), khựng 50 ms ở chiêu, 100 ms ở cao trào tuyệt kỹ kèm 0,3× trong 280 ms, rung nền 2,6 px suốt lúc phím 7 săn. Bảng bậc trong `POWER_RESEARCH.md` đã sửa, kèm một câu lý do |
| 3. Thứ bậc và màu kiếm phím 7 | `851f13a` | `src/view/skills/van-kiem.ts`: 8 thanh rời tay ở F0 là **kiếm chủ** (mô hình đầy đủ Clear Wind, cùng GLB với kiếm trên tay): sau nhát đầu chúng bay lên sông kiếm và lớn dần tới 6,4 m (gấp 3,7 lần kiếm sông), có lõi trắng vàng dọc thân, viền ngọc hoặc lam ngọc đậm và vệt lụa dài thon; chúng bơi trên ngọn sóng, cứ 0,3 s một thanh lao xuống con mồi nặng ký nhất (tinh anh, Thú Vương) với vòng chấn, vũng sáng và cột sáng ngắn, rồi đứng giữa nét chém cuối. **Dòng giữa**: kiếm sông chạy trong 5 làn bện nhau theo đường cong của sông, 5–7 m/s, có vệt chuyển động; thân ngọc và lam ngọc, lõi trắng vàng, độ sáng chạy thành sóng dọc dòng (`BladeSet.tintGlow`: màu từng thanh nhuộm cả ánh phát sáng của gân kiếm; trước đây một màu phát sáng chung làm mọi thanh thành bạc hà). Mỗi đợt săn 14–20 thanh (trước 30–40), tách khỏi sông ở chỗ gần con mồi nhất thành một bó cong cùng phía. **Kim tuyến**: khoảng 320 đốm vàng trắng mỗi giây dọc sông. **Vũng sáng trên đất** dưới sông, dưới mỗi nhát trúng và dọc vết chém. Hai dải sáng của nhát kết hẹp lại, lõi nóng (lượt 1 rộng 3–4 m nên phủ sữa cả sân), thêm 60 tia lửa văng khỏi đường chém |
| 4. Thú phản ứng | `00749a0`, `10df51f` | `src/lab/herd.ts`, `src/lab/death-fx.ts`: đòn lớn (lực ≥ 0,95: kiếm chủ phím 7, Ngự Kiếm Quyết) đẩy thú trượt lùi 0,3–0,8 m theo hướng đòn và nằm lại đó (tinh anh một nửa, Thú Vương không bao giờ dời gốc). Ánh sáng nhát kết (nhát chém phím 7, lực 1,2; đợt cuối K5 qua `herd.launch`) hất thú nhỏ lên khoảng 1 m, lộn một vòng quanh giữa thân rồi đáp đứng thẳng, hoặc chết giữa không. Tinh anh choáng 0,22 s, nghiêng 17°, miễn nhiễm 0,26 s; Thú Vương chỉ nghiêng 4°. Cái chết xảy ra đúng khung đòn kết liễu: thân bị **cắt tan** trong 0,32 s từ một mặt cắt chéo dọc theo đòn ra hai phía, mép nóng màu đậm của người đánh; thân vỡ thành 12–26 tia linh khí, 4–8 mảnh sáng, để lại vết cháy trên đất và một vũng sáng ngắn |
| 5. Thứ bậc số sát thương | `df4e585` | `src/view/damage-compile.ts`, `src/view/hitfx.ts`: chiêu diện rộng gộp đòn trên thú nhỏ theo ô 8 m của sân trong 1 s, tinh anh và Thú Vương gộp theo từng con trong 1 s. Cỡ nói lên sức nặng: đòn lẻ nhỏ và ngắn (0,85, 0,45 s), gói gộp 1,15, cụm hoặc ô của nhát kết 1,9, đòn lớn hoặc chí mạng 2,5 với cú nảy mạnh (gấp 2,9 lần đòn nhỏ), và **một con số tổng** cỡ 4,2 ở giữa phía trên khung cho phím 7 và tuyệt kỹ, đếm dần lên trong lúc chiêu chạy và nảy ở nhát kết ("13.6K×396"). Một gói chỉ là chí mạng (vàng, to) khi ít nhất một phần ba số đòn trong gói là chí mạng (15 % chí mạng mỗi đòn làm gần như gói nào cũng vàng). Bộ chữ số của chiêu có viền tối 15 px trên một bóng tối mềm, không còn số trắng mảnh trên kiếm sáng. Số luôn nằm trong khung và trong mép xa, mép bên của sân ở độ sâu của con thú. Số của game giữ nguyên |
| 6. Cảnh cận có chuyển động | `4c7bc6f` | `src/lab/cutin.ts`, 0,9 s theo thời gian lab: một nhát mực vẩy mở dải từ trái sang phải (vệt quét mềm bị xé bởi mặt nạ vết bắn CC0 chạy theo mép) và hắt vệt mực đen ra ngoài mép dải; 18 vạch tốc độ chạy dọc độ dốc, vệt sáng băng qua, 26 đốm vàng trôi; một vệt lóe kiếm quét ngang tranh `kiem-nu.png` đã được anh duyệt (không vẽ nhân vật bằng mã) trong lúc tranh đẩy vào; hai mép là lá vàng có ánh chạy. Nửa phải được lấp: **tên tiếng Anh đứng đầu** (Cormorant Garamond 700, lá vàng, giãn chữ dần vào, gạch vàng kéo ra dưới), chữ Hán là thư pháp phụ ở trên (Ma Shan Zheng), một chữ Hán khổng lồ mờ làm nền, và **dấu triện đỏ** bốn chữ (cột phải đọc trước, nét in mòn nhờ mặt nạ đốm CC0) đóng xuống sau thư pháp ở 0,42 s, có nảy. 0,14 s cuối dải thu về đường giữa và chiêu phát |
| Giữ khung hình | `0bfc49f` | 9 thẻ sáng và vũng sáng dọc sông thay vì 12, 320 đốm mỗi giây thay vì 420, 12 tia khi thú nhỏ chết thay vì 16 |
| Móc thân cho phím 7 | `34e1b74` | Theo yêu cầu của làn chuyển động (`docs/changelog/2026-11-03-lab-motion-round3.md`): phím 7 gọi `caster.release("k7")`, thân diễn cử chỉ "hai ngón chỉ trời" riêng thay cho lệnh nhanh của Ngự Kiếm Quyết |

## Phát hiện

- **Thú trắng bệch đứng lại sau chiêu xoáy** không phải thú bị trúng mà là **thú hồi sinh**: 1,6 s sau khi chết, chúng mọc lại ngay giữa hố xoáy, tan vào với mép trắng xanh HDR (bloom làm cả thân trắng). Giờ mép hồi sinh là màu than hồng mờ, dưới ngưỡng bloom; sân vừa dọn giữ trống 3,2 s (1,6 s chỉ khi phím 7 đang chạy và cần lớp thú mới). Ảnh `k5-play-13-cleared` (một giây sau đợt cuối) cho thấy hố xoáy trống.
- **Mọi sprite "ground" của `fxkit` chưa từng hiện**: quad nằm trên đất có mặt quay xuống dưới, nên bị bỏ mặt sau khi nhìn từ trên. Vũng sáng, vòng đất và vết sẹo của phím 7 ở lượt 1 vì thế không ai thấy. Đã thêm tùy chọn `twoSided` và bật cho phím 7 và cái chết. Các lớp đất của chiêu Kiếm cũ (`groundGlow`, `groundRing`, `groundShock`, `groundDark`, `groundInk`, `twirl` trong `kiem.ts`) **vẫn tắt** để không đổi hình đã duyệt; nên bật khi làm lại bộ chiêu.
- **Một màu phát sáng chung** trên vật liệu kiếm (gân `#6fd8b4`) là lý do cả sông kiếm thành bạc hà dù đã gán màu từng thanh: màu thanh chỉ nhuộm phần thép, không nhuộm phần phát sáng.

## Số đo

Ảnh 1920×1080 ở camera chơi, đồng hồ cố định 60 Hz. Độ sáng là trung bình mức xám 0–255 của khung (ImageMagick). "Chỉ thế giới" là cùng khung đó vẽ lại khi ẩn lớp VFX (đèn và pass màn hình vẫn giữ). Kịch bản `scripts/visual/scenarios/lab-power-measure.mjs`.

| Mục | Lượt 1 | Lượt 2 | Mục tiêu |
|---|---|---|---|
| Độ sáng lúc nghỉ | 66,0 | 66,0 | |
| Phím 7, chỉ thế giới, lúc săn (F45–F186) | 59,8–60,7 (−9 %) | **36,5–38,3 (−42…−45 %)** | giảm 35–50 % |
| Phím 7, chỉ thế giới, nhịp nín trước nhát kết (F194) / ngay sau cao trào (F205) | 62,2 / 52,1 | 34,9 / 32,8 | |
| Phím 7, cả khung lúc săn | 87,7–90,0 | 57,7–61,6 | kiếm sáng trên nền tối |
| K5, chỉ thế giới, từ lúc phát tới đợt 3 | 71,2–73,2 | **39,3–40,5 (−39…−40 %)** | giảm 35–50 % |
| Số sát thương hiện ra mỗi lần phím 7 | 271 (+13 bị bỏ) | **61** (26 là tổng ô hoặc cụm, 8 bị bỏ): **−77 %** | khoảng −70 % |
| Số sát thương mỗi lần K5 | 31 | 32 | |
| Nhát trúng mỗi lần phím 7 / thú chết | 663 / 86 | 429 / 86 | |

- **Phím tới lúc ra chiêu**, bấm giữa một khựng đòn đang chạy (của Nhất Tuyến), đo trên bản HEAD `34e1b74` trong một worktree sạch: VFX 0 ms ở cả 8 chiêu; thân 33 ms (Lưu Quang Bộ không có mốc release); phím 7 giờ dùng cử chỉ riêng vẫn 33 ms. Cổng 50 ms đạt. File `tmp/shots/power-r2/latency.json`.
- **Thời gian khung** (High, 1920×1080, DPR ghim 1, M4, `lab-power-perf.mjs`, trung vị của 5 lượt, mỗi khung gồm CPU rồi đọc 1 điểm ảnh chờ GPU): nghỉ p95 8,7 ms; **phím 7 lúc săn p95 11,1 ms** (328 kiếm, 54 lệnh vẽ, 2,59 triệu tam giác); nhát kết p95 8,5 ms; **K5 p95 10,6 ms**. Ngân sách 12 ms: đạt, nhưng còn ít chỗ (lượt 1: 8,4 và 9,7 ms). Từng lượt đo lệch 1–2 ms vì Chrome của anh đang mở trên máy. File `tmp/shots/power-r2/perf-high.json`.
- `npx tsc --noEmit`, `vitest` (78 tệp, 702 bài) và `vite build` qua trên HEAD `34e1b74` trong worktree sạch. Grep `dist`: không có `skills-lab`, `VanKiem`, `kiem-nu`, `MILKY-WAY`, `Ma Shan Zheng`, `Cormorant Garamond`, `LabSound`, `SCREEN_TIERS`, `__lab`, `holdWide`, `tintGlow`, `worldLight`, `CutIn` (file `tmp/shots/power-r2/dist-grep.txt`). Bài kiểm mới: hiệu ứng màn hình (đèn thế giới, chớp tại chỗ, cao trào 3 khung, rung nền), camera (lùi ra trong 0,25 s rồi về đúng mức zoom người chơi, cú đẩy), số sát thương (gộp theo ô, cỡ theo sức nặng, chí mạng theo tỉ lệ, con số tổng).

## Ảnh và clip (trong `tmp/`, không vào Git)

- Tờ khung có chú thích, camera chơi và cận cảnh (`__lab.zoom(1)`): `tmp/shots/power-r2/sheets/after-{k1,k5,k7}-{play,zoom}.jpg`.
- Ảnh tĩnh 1920×1080: `tmp/shots/power-r2/stills/` (K1 trúng đòn, cảnh cận, K5 phát và đợt 3, sân trống một giây sau K5, phím 7 lúc săn, nét chém, cao trào F197, vết chém còn sáng F245, phím 7 ở cận cảnh F0 và F10).
- Clip 60 fps: `clips/power-sequence-60fps.mp4` (13 s: nghỉ, K1, K2, phím 7, K5 có cảnh cận), `clips/power-sequence-close-view-60fps.mp4` (cùng chuỗi ở cận cảnh: thấy camera lùi ra và về), `clips/key7-half-speed.mp4` (phím 7 nửa tốc độ, 8 s). Tờ tóm tắt khung của ba clip: `sheets/clip-*-contact.jpg`.
- Số đo: `luminance-before.json`, `luminance-after.json`, `measure-before.json`, `measure-after.json`.
- Ảnh và clip được phục vụ từ thư mục làm việc lúc 04:16–04:25, có cả phần làn chuyển động đang sửa dở trong `src/lab/caster.ts` và `src/lab/anim/**` (chưa commit). Hãy chấm hiệu ứng; thân nhân vật là việc của làn kia.
- Ảnh thô đã xóa tay (công cụ `tools/capture-prune` từ chối đường dẫn có `immortality-cultivation`), chỉ các thư mục thô của lượt này.

## Chưa xong, cần biết

- **Chưa có giám khảo chấm lượt 2.** Theo luật ba lần thử: nếu lượt 3 vẫn không tăng rõ, bàn hướng khác với ChatGPT trước lượt 4.
- **Bản thân xoáy K5 chưa đổi** (vẫn là một tấm phẳng trên đất, các quả cầu xanh khi trúng): thuộc phần làm lại bộ chiêu. K5 chỉ nhận các lớp chung: tối trước khi phát, camera, số và con số tổng, hất thú ở đợt cuối, cái chết mới, cảnh cận mới. Bước 3 không áp cho bầy kiếm K5 vì K5 nằm ở `kiem.ts`, không dùng chung mã với `van-kiem.ts`.
- **Tranh trong cảnh cận** vẫn là tranh tả thực đã được anh duyệt; hai giám khảo nói nó không khớp nhân vật chibi trên sân. Đây là quyết định của anh. **Dấu triện** hiện làm bằng CSS, phông và mặt nạ CC0; để đạt 8,5 có thể cần một ảnh dấu thật.
- **Low và Medium** (không qua composer) có tối thế giới (bằng đèn) và chớp toàn màn, không có viền tối, rút màu, chớp tại chỗ, mờ tỏa tâm hay viền màu.
- **Ngân sách khung còn ít** (11,1 / 12 ms ở phím 7). Nếu thêm lớp, cắt kim tuyến và thẻ sáng trước.
- **Làn chuyển động còn hai việc**: móc `caster.prime("auto", …)` 0,25 s trước đòn thường cần một đồng hồ đánh tự động, lab chưa có (phím 0 phát ngay), nên chưa làm. Năm yêu cầu gửi làn VFX trong changelog của làn đó (vòng sáng dưới chân, không chớp lên thân 6–8 khung đầu sau khi nhả, kiếm trên tay không tắt bật, kiếm K4 xuyên mũ trùm, chớp trắng của dash) không thuộc lượt này.
- Khi kiểm trên worktree sạch, Vite của worktree đã ghi đè bộ đệm `node_modules/.vite/deps` dùng chung lúc 04:27; máy chủ chụp của repo chính tối ưu lại lúc 04:28 (máy chủ 3018 vẫn trả `three.js` 200). Nếu trang lab của làn chuyển động không tải được, khởi động lại Vite của làn đó.
