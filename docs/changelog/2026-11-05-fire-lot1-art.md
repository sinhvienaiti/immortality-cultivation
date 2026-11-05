# Hỏa · Lô 1 dùng art có sẵn (05/11/2026)

Phiếu 277, 278 và 280, nền `ee3ee97` sau phiếu 264. Đổi lớp nhìn trong `element-fire.ts`; phiếu 278 sửa thời điểm vẽ chớp brush; phiếu 280 bổ sung tải texture lên GPU và biên dịch cả scene lúc nạp lab. Không đổi sim, canon hoặc cân bằng.

- `point()` dùng một thẻ `fire-twinkle-set`, một hàng ngẫu nhiên trong 8 hàng, đường kính đúng `2 × reach`, giữ thời gian sống của điểm cũ. Nhát kiếm sông vẫn dùng `reach = 0,38 × k`. Một luồng `Rand` riêng của view, seed `4409277`, giữ chuỗi ngẫu nhiên của các lớp còn lại nguyên vẹn.
- Vòng tay dùng `fire-halo-ring`, quay về camera, chạy một lần trong 0,3 giây. Vòng đất dùng `fire-halo-seal-loop`, nằm trên mặt phẳng XZ, sống 0,62 giây, bắt đầu xói ở 70 % tuổi thọ. Pool đã có xói ở mode `fire`; không dùng phương án mờ ba khung cuối.
- Vạch beam trong `finisher()` và cả beam/lớp heat-field trên vết cắt trong `cutSeam()` dùng `strip-fire-sheath-v2.rgba.png`, nằm phẳng, nhận `dir` và `span`, cuộn 0,5 chu kỳ/giây dọc vạch. Dùng bản `-v2` vì phiếu yêu cầu ưu tiên bản này khi có cả hai; bản này lấy khung 22 của nguồn, bản thường lấy khung 106. Các thẻ `fire-trail` có sẵn quanh vạch finisher vẫn giữ nguyên.
- Mặc định không đăng ký `FirePointPool`, hai `HeatRingPool` hoặc pool beam của Hỏa. Cờ dev `?fxcode=1` đăng ký và chạy lại các thân mã cũ. Thiếu art không bật ngầm hình vẽ bằng mã.
- Khởi phát tại khung sáng nhất: sao theo hàng `[3, 9, 9, 7, 11, 8, 12, 4]`, vòng tay khung 19, vòng đất khung 5. Các số lấy bằng trung bình ánh sáng tuyến tính Rec.709 trên từng ô atlas, không lấy `peakFrame` theo độ phủ trong JSON. Không fade-in, không delay; alpha ở tuổi 0 bằng 1. Vòng tay và sao chạy phần còn lại đến cuối clip trong đúng thời gian sống.
- Các atlas dùng `FlipbookPlayer.pool()` và thư viện `fire` hiện có. Metadata sao được chuẩn hóa trong bộ nhớ sang 8 biến thể, mỗi biến thể 16 khung; không sửa manifest. Dải tĩnh chưa có manifest trong `aura/strips`, nên nạp URL từ `player.base`, đợi `library("fire").load()`, rồi đăng ký một ô RGBA bằng `library.add()`. Không chép hoặc liên kết media vào worktree.
- Phép đặt phẳng và cuộn nằm trong `onBeforeCompile` riêng của hai pool mới; không sửa shader chung. Một mesh instanced cho mỗi pool; mọi mảng, options, vector và bộ sinh ngẫu nhiên được tái sử dụng; cuộn lấy đồng hồ từng thẻ của pool, không thêm cấp phát mỗi khung.

## Bổ sung phiếu 278

- Riêng pool `fx-fire-flash` bật `SpritePoolOptions.drawBeforeAge`: ghi dữ liệu ở tuổi hiện tại rồi mới tăng tuổi, đồng bộ với brush flipbook. Trước đây lần vẽ đầu đã tăng tuổi một khung. Tùy chọn mặc định tắt; các pool khác giữ hành vi cũ. Không đổi `BRUSH.flash`, màu, gain, hình hoặc các số của hiệu ứng.
- `prewarmFire()` đợi thư viện Hỏa, brush có mask v2 và dải tĩnh nạp xong, rồi biên dịch các vật liệu Hỏa, gồm cả bốn pool mới của 277. Lab gọi cùng chỗ làm ấm aura, cho cả buffer hậu kỳ và màn hình, trước `__lab.ready`. Giữ đúng render target đã yêu cầu dù lab vẽ trong lúc chờ ảnh; trả lại target và cờ `visible`, kể cả khi biên dịch lỗi. Không phát thẻ, tăng tuổi hoặc dùng ngẫu nhiên trong bước làm ấm.
- `fireImpact().ageTicks` cộng `0` sau `Math.round(...)`, loại bỏ `-0` ở khung đầu cho CDP; trạng thái chưa có đòn vẫn là `-1`.
- Sáu ca cũ kiểm pool mã được đặt `?fxcode=1` riêng từng ca, dọn global sau ca; mọi phép kiểm cũ giữ nguyên. Các ca mặc định còn lại tiếp tục đi đường art.

## Bổ sung phiếu 280

- `prewarmFire()` gọi `renderer.initTexture()` cho từng atlas của các pool Hỏa đang dùng, gồm brush, mask A/B, sao, vòng tay, vòng đất, dải và các clip cũ còn dùng. Mỗi thư viện được tải lên GPU khi `load()` của nó xong; dải nạp riêng được tải lên khi Promise riêng xong. Bước cuối quét sampler của các vật liệu Hỏa để gồm cả texture sprite, đất và sampler rỗng dùng chung. Không tải clip trong thư viện mà Hỏa không dùng.
- Texture dùng chung chỉ khởi tạo một lần trên mỗi renderer; phiên bản ảnh mới vẫn được tải lại. Sau khi tải xong, tạm hiện toàn bộ mesh Hỏa và gọi `renderer.compile(scene, camera)` một lần, với scene thật có ánh sáng và sương cùng render target của pipeline đang chạy (buffer bloom ở High/Ultra, màn hình ở Low/Medium). Không gọi render; trả lại mọi cờ `visible` và target, kể cả khi biên dịch lỗi.
- Lab gọi prewarm Hỏa một lần sau vòng prewarm aura, trước `__lab.ready`. `__lab.fireImpact()` thêm `prewarmed: boolean` và `textureIds: number[]` (ID texture Three.js, không lặp); đọc trạng thái không đổi hiệu ứng. Không đổi hình, thông số, đồng hồ hay luồng ngẫu nhiên.
- Test mới `tests/view/fire-prewarm.test.ts`: 5 ca, kiểm đủ atlas/mask/sampler, đúng 19 lần tải cho 19 texture riêng trong bộ giả có thêm texture đất, compile scene một lần, không render/phát thẻ/tăng tuổi, chờ brush và dải nạp muộn, khôi phục target/visibility, renderer riêng và thử lại khi tải lỗi.

**Kiểm 280:** kiểm kiểu qua; 5/5 test mới qua; toàn suite **998/1000 test qua, 91/92 tệp qua**. Hai ca prewarm của 278 trong `fire-lot1-art.test.ts` còn dùng renderer giả thiếu `initTexture` và đòi compile từng mesh. Tệp này không thuộc phạm vi ghi của 280: đã xin mở đúng hai ca, chưa nhận trả lời, nên giữ nguyên và chưa tuyên bố toàn suite đạt. Build wrapper 274 đổi đường dẫn trong bộ nhớ sang `/private/tmp/codex-280-dist` qua; grep không có `fxcode`; đã xóa build. Báo cáo: `docs/codex-queue/280-report.md` ở repo cha. Ngưỡng GPU ≤ 11,5 ms chờ Claude đo lại.

## Kiểm tra phiếu 277–278

`tsc --noEmit -p .` qua; toàn suite **995/995 test, 91/91 tệp** qua (mốc 985 + 6 test của 277 + 4 test của 278). `fire-lot1-art.test.ts` có 7 ca với clip giả; lượt 1–7 tối đa 17/256 thẻ sao, 158 lần phát, 0 thẻ rơi. Có kiểm prewarm đúng chương trình có mask, đợi dải, khôi phục target/visibility và giữ dữ liệu thẻ đang sống. `key1-flash-age0.test.ts` có 3 ca: đỉnh tuổi 0 qua tuổi 12, chớp chồng nhau/hit-stop/tái dùng slot/reset và pool không bật tùy chọn giữ hành vi cũ. Các test này kiểm dữ liệu, không đo pixel GPU.

Build API của wrapper 274 qua, thoát 0; grep bundle không có `fxcode`, đã xóa `/private/tmp/codex-278-dist`. Wrapper gốc khóa cứng thư mục 274 nên lệnh nguyên văn của phiếu bị từ chối; chỉ thay chuỗi đường dẫn sang 278 trong bộ nhớ, giữ nguyên cờ và kiểm cache sạch, không sửa wrapper trên đĩa. Lệnh tái lập và từng ca cũ: `docs/codex-queue/278-report.md` ở repo cha.

Chưa nghiệm thu hình ảnh hoặc GPU. Claude tiếp tục parity ONLY lô 1, perf, video trước/sau ở camera chơi và hai giám khảo mù ≥ 8,5 theo phiếu.

## Bổ sung phiếu 283 · Làm ấm phần chung

- Lab đợi các ảnh sprite, texture của kit và năm mặt nạ impact nạp xong. `ScreenFx.prewarmTextures()` tải mặt nạ lên GPU; `SkillNumbersImpl.prewarm()` tạo atlas số thật sau khi font nạp, dùng lại atlas đó ở các lần vẽ sau.
- `ElementStage.prewarm(kit, renderer, scene, target, textures)` dùng chung cho Hỏa và Kim. Lab chọn lần lượt hai nguyên tố trước `__lab.ready`, rồi trả lại nguyên tố ban đầu. Giữ prewarm Hỏa của 280 để đợi brush, mask và dải riêng; không cần sửa `element-fire.ts`.
- `prewarmScene()` tạm hiện các mesh của scene thật, gồm qi slash, các kiếm instanced và vật thể đổ bóng; tải các sampler, biên dịch biến thể màn hình và HDR. Mỗi lần gọi vẽ **đúng một khung** vào target **64×64**, sao chép định dạng, kiểu texture, không gian màu và MSAA của buffer bloom. Có hai lượt lúc nạp: một Hỏa, một Kim. Lượt render thật cũng chạy đường shadow map của các mesh có `castShadow`.
- Mẫu thẻ chỉ ghi tạm vào phần tử đầu của buffer GPU, ở tuổi 0; không gọi cast, emit, update, âm thanh hoặc sim. Atlas số dùng một trường số riêng. Trả lại visibility, culling, số instance, draw range, dữ liệu attribute và uniform bằng `finally`; gỡ mẫu số và giải phóng target kể cả khi lỗi. Pool rỗng vẫn có count 0; thẻ sống có sẵn giữ nguyên.
- `__lab.prewarmReport()` trả bản sao hai hồ sơ, mỗi hồ sơ có `element`, danh sách texture (`id`, tên/URL), chương trình WebGL (`id`, `name`, `cacheKey`), vật thể/vật liệu, target và số lượt render. Đọc không phát thẻ hoặc render; bản production không chứa `prewarmReport`.
- Test mới `tests/view/skill-prewarm-shared.test.ts`: **6 ca**, gồm Hỏa/Kim, upload mặt nạ và atlas số 1024×256, đúng một lượt render nhỏ mỗi lần gọi, mọi pool rỗng sau đó, nhánh lỗi upload/compile/render, bảo toàn thẻ sống/uniform/phiên bản texture và dùng lại atlas. Không sửa test cũ.

**Kiểm 283:** TypeScript qua; **1006/1006 test, 93/93 tệp** qua (mốc 1000 + 6 ca mới). Build bằng wrapper 274 với thư mục riêng `/private/tmp/codex-283-dist` qua; grep không có `prewarmReport`; đã xóa thư mục build. Chưa đo GPU: Claude đo lại cổng 7 cho cả Hỏa và Kim, khung bấm phím và khung trúng đầu ≤ 11,5 ms. Báo cáo ở repo cha: `docs/codex-queue/283-report.md`.
