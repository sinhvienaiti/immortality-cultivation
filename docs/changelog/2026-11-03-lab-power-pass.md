# Lab kỹ năng: đợt "uy lực" (03/11/2026, đêm)

Lý do: anh thử lab và chấm VFX chiêu khoảng 6/10 (canon D58, 03/11 khoảng 01:30): phải chờ gồng mới ra chiêu, không có hiệu ứng màn ảnh, thiếu sự khủng bố của tu tiên, thiếu chiêu diện rộng (ví dụ của anh: kiếm bay gần cả map tự diệt quái), không thấy số sát thương, quái không phản ứng, chưa có âm thanh. Giám khảo mù CJ1 thêm: bảng màu gần như chỉ trắng và tím, kiếm bay thành ghim trắng, trận lục giác của K4 giống HUD khoa học viễn tưởng, va chạm là quả cầu bloom trắng.

Đợt này dựng **lớp uy lực dùng chung** cho mọi chiêu sau này (bộ chiêu đang được thiết kế lại song song từ nguồn Trung Quốc) và **một chiêu mẫu phủ cả sân**. Bảy chiêu cũ không thiết kế lại, chỉ sửa màu và cỡ kiếm. Công thức lấy từ [`POWER_RESEARCH.md`](../../../../docs/games/tu-tien/skills/POWER_RESEARCH.md). Lab vẫn là trang dev, không vào bản build.

## Đã làm, theo commit

| Bước | Commit | Nội dung |
|---|---|---|
| 1. Ra chiêu tức thì | `3cd207d` | Phím chiêu là phím đúng cuối cùng của từ: chiêu phát ngay khung đó, cắt khựng đòn đang chạy. Chế độ gõ (gồng theo chữ) giữ sau `?typed=1` và ô chọn "Typed charge" trên bảng |
| 2. Hiệu ứng màn hình | `ec05083` | `src/view/screen-fx.ts`, game dùng lại được: rung theo trauma² trên nhiễu mượt (tuyệt kỹ thêm nghiêng ≤ 0,1°), đẩy zoom (FOV, 2 % ở tuyệt kỹ), khựng đòn theo bậc và bị lệnh ra chiêu mới cắt, chậm thời gian bằng hệ số thời gian của thế giới, tối thế giới + chớp + tách màu chỉ ở mép trong **một** ShaderPass chèn ngay trước OutputPass (tìm chỉ số lúc chèn). Ánh sáng HDR của kiếm giữ độ sáng khi thế giới tối. DOM và số sát thương không bao giờ bị tối, mờ hay chớp. Một thanh cường độ 0–1 (trợ năng, `?fx=`). Số theo bảng bậc của POWER_RESEARCH |
| 3. Thú phản ứng | `1cb8de6` | Lóe viền (fresnel) 2–4 khung màu người đánh; giật lùi 5–30 cm theo hướng đòn; đòn thường khựng riêng con trúng; choáng 80 ms chỉ ở tinh anh và đòn lớn, miễn nhiễm 120 ms nên không bị khởi động lại; Thú Vương (tạm: Thiết Giáp Trư phóng to) không bao giờ dời gốc. Cái chết: tan có viền như cũ, thêm chớp sáng, sợi hồn bay lên, vệt mực văng, tinh anh vỡ thành 6 mảnh sáng (`src/lab/death-fx.ts`) |
| 4. Số sát thương | `eb16064` | Dùng `createDamageNumbers` của `hitfx.ts` (kit NumberField, sửa ở `hitfx.ts`): gộp mỗi mục tiêu trong 150 ms ("12.8K×6"), một số tổng ở giữa cụm khi ≥ 5 thú nhỏ trúng cùng một đòn, chí mạng to 128 % viền vàng, số thường màu ngà, nét dưới mang màu chiêu, đặt dưới-phải con thú (`src/view/damage-compile.ts`). Sát thương là số tạm theo canon §12.1 (1 W = 90 máu ở K0, `?realm=`), chí mạng 15 % có hạt giống |
| 5. Vạn Kiếm Triều Tông | `a4d4866`, `86b2eb5` | Phím 7 và nút trên bảng (`src/view/skills/van-kiem.ts`): F0 tám kiếm thật rời tay; trời tối và một đường may ngọc mở chéo bầu trời; 64 hạt kiếm bay lên, sông kiếm phủ gần 40 m (320 kiếm ở High, BladeSet và LOD của bầy); săn mỗi 100 ms 30–40 kiếm quay mũi về con mồi (sợi khóa mục tiêu hiện ~0,12 s) rồi lao xuống theo đường cong; giữ chỗ: thú thường 2, tinh anh 5, Thú Vương 10, con chết thì đổi đích, 18 % chọn con khác gần đó; kiếm tái dùng nên thấy ~700–800 nhát; F168 kiếm còn lại xoắn một vòng xếp thành một nét chéo khổng lồ; F192 nét chém đâm xuống, ánh sáng quét ra hai phía khắp sân, để lại vết mực và đường may ngọc nguội dần; rồi thu về. Màu Clear Wind: ngọc, lam ngọc, bạc, chút vàng, không tím. Bậc màn hình "chiêu", nhát kết mạnh bằng tuyệt kỹ |
| 6. Cảnh cận tuyệt kỹ | `471b5ec`, `b24cbcd` | K5 (phím 6): khoảng 1 s dừng cả thế giới lẫn giờ gõ, rồi chiêu mới phát. Dải xéo có tranh roster `kiem-nu.png` (D49) cắt vào mặt và vai, vệt sáng chạy dọc dải, mép ngọc chuyển vàng, chữ 天河劍雨 (Ma Shan Zheng) hiện như nét bút, tên MILKY-WAY SWORD RAIN (Cormorant Garamond). Chạy theo thời gian của lab nên ảnh chụp cố định lặp lại đúng. Hai phông OFL qua `@fontsource`, đã ghi vào `docs/games/THIRD_PARTY.md` |
| 7. Móc âm | `b71378c` | Bus sự kiện một khung (`src/lab/events.ts`): thân, VFX, âm, camera, khựng đòn cùng trả lời một sự kiện. `src/lab/sound.ts` nối cast, release theo chiêu, bay vụt (chỉ 8–12 kiếm gần nhất), va chạm theo chất (thịt, đá, linh; gộp 40 ms), chết, thế giới đổi (mở, lặng, cao trào, đóng), tiếng hô, vào file ở `art-src/lab/audio/<event-id>/` (wav hoặc ogg; im khi chưa có file). Chỉ phát file, không tổng hợp âm |
| 8. Sửa màu | `7147608` | Clear Wind: mỗi chiêu một màu riêng trong ngọc (hue ~150), lam ngọc (~195), bạc, chút vàng ở Hộ Thân; tránh màu chữ gõ (#7FF5E0) và bỏ tím. Kiếm bầy của Thiên Hà ×1,3, kiếm rơi của Lạc Kiếm Trận ×2,1 |

## Số đo

- **Phím tới lúc ra chiêu**, bấm ngay trong lúc khựng đòn của Nhất Tuyến đang chạy (máy dò chuyển động): VFX 0 ms ở cả 8 chiêu; thân 33 ms (Lưu Quang Bộ không có mốc release trong clip). Cổng 50 ms đạt. K5: cảnh cận hiện ngay khung bấm; chiêu đo từ lúc cảnh cận kết thúc. File: `tmp/shots/power/latency.txt`.
- **Thời gian khung** (High, 1920×1080, DPR ghim 1, M4, `scripts/visual/scenarios/lab-power-perf.mjs`, trung vị 3 lượt, mỗi khung gồm CPU rồi đọc 1 điểm ảnh chờ GPU): nghỉ p95 8,5 ms; phím 7 lúc săn p95 **8,6 ms** (303 kiếm trên màn, 46 lệnh vẽ, 2,35 triệu tam giác); nhát kết p95 8,1 ms; K5 p95 10,0 ms. Ngân sách High p95 ≤ 12 ms: đạt. File: `tmp/shots/power/perf-high.json`.
- **Cỡ kiếm bay ở camera chơi**, 1080p (`__lab.bladePx`): K5 p10 33 px, trung vị 45 px; K4 27/67 px; K1 26–40 px; K2 56 px; phím 7 p10 44 px, trung vị 68 px. Mọi kiếm bay ≥ 20 px.
- **Phím 7 với bầy thú lab** (87 con, có Thú Vương): ~680 lần lao, ~780 nhát trúng tính cả nhát kết, 85 con chết.
- **Âm** (chưa có file, im): một lượt K1 + phím 7 + K5 hỏi 94 tiếng va chạm thịt và 77 tiếng va chạm đá cho hơn 800 nhát (nhờ gộp 40 ms), 44 tiếng chết, 20 tiếng bay vụt.
- `npx tsc --noEmit`, `pnpm test` (76 tệp, 685 bài) và `pnpm build` đều qua. Grep `dist`: không có `skills-lab`, `VanKiem`, `kiem-nu`, `MILKY-WAY`, `Ma Shan Zheng`, `LabSound`, `SCREEN_TIERS`, `__lab` (file `tmp/shots/power/dist-grep.txt`).

## Ảnh và clip (trong `tmp/`, không vào Git)

- Trước và sau, camera chơi và `__lab.zoom(1)`: `tmp/shots/power/sheets/before-k1-*.jpg`, `before-k5-*.jpg`, `after-k1-*.jpg`, `after-k5-*.jpg` (có cảnh cận), `after-k7-*.jpg`.
- Clip 60 fps: `tmp/shots/power/power-sequence-60fps.mp4` (13 s, 12,8 MB: nghỉ, K1, K2, phím 7, K5 với cảnh cận); bảng tóm tắt khung `sheets/clip-seq-contact.jpg`.
- Clip nửa tốc độ phím 7: `tmp/shots/power/key7-half-speed.mp4` (8 s, 10,9 MB).
- Ảnh tĩnh độ phân giải đầy đủ: `tmp/shots/power/stills/`.
- Ảnh thô đã xóa sau khi làm bảng (công cụ `tools/capture-prune` từ chối đường dẫn có `immortality-cultivation`, nên xóa tay đúng các thư mục thô của đợt này).

## Chưa xong, cần biết

- **Chưa có giám khảo chấm**. Chưa có điểm 8,5 nào cho đợt này; ảnh và clip là để anh xem.
- **Chưa có file âm**: mọi móc âm im cho tới khi Claude tạo âm trong Firefly theo `WEAPON_AUDIO.md` và D58 (tiếng hô tiếng Trung, tiếng chiêu).
- **Không phát qua `SceneAudio` của kit được**: `src/kit/audio/scene-audio.ts` import `kit/audio/dragon-voice`, mà `tests/boundary.test.ts` cấm mọi tệp của game chạm tới. Lab chép phần phát file của nó (`src/lab/sound.ts`, dòng mới trong `docs/SYNC_DEBT.md`). Kit nên tách phần phát file khỏi `dragon-voice`.
- **Bầy thú lab "dày máu" ×2 khi phím 7 chạy** (một làn sóng thật đông hơn 87 con); bầy hồi sinh sau 1,6 s thay vì 2,5 s.
- Cảnh cận mới có ở K5; phím 7 là chiêu (không phải tuyệt kỹ) nên không có. Số sát thương khá dày ở phím 7.
- K4 vẫn là lục giác vạch thẳng (chỉ đổi màu sang ngọc); thiết kế lại thuộc danh mục chiêu mới.
- Khi thế giới tối, ánh sáng HDR giữ độ sáng nhưng phần sáng vừa của VFX cũng tối theo; ở Low và Medium (không qua composer) chỉ có tối và chớp, không có tách màu.
- Cử chỉ thân khi thi triển (D58 (8)) là làn khác; đợt này không đụng `src/lab/anim/**` và `src/lab/caster.ts`.
