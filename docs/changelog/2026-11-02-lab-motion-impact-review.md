# 02/11/2026: rà soát đối kháng làn va chạm, vòng 2 (lab kỹ năng Kiếm)

Rà lại toàn bộ thay đổi của làn va chạm (`2026-11-02-lab-motion-impact.md`): đọc diff `kiem.ts`, `fxkit.ts`, `feel.ts`, `herd.ts`, `skills-main.ts`, tệp mới `presence.ts`, so số đo với vòng 1 và với làn diễn xuất, xem tờ đoạn và tờ chuyển tiếp. Chỉ có trong lab dev, không đụng `src/sim`, `src/content`, `src/kit`, golden, không có mã âm thanh. Chưa commit.

## Lỗi đã xác nhận và đã sửa

1. **Dừng hình giữ chậm cú nhả của thân: phím cuối → thân 100 ms trong `lab-stress`** (cổng 50 ms, vòng 1 và làn diễn xuất đều 33 ms). Làn va chạm chỉ báo số của `lab-motion`. Cú đánh thường thứ ba trong chuỗi "đánh thường liên tiếp" nhả đúng lúc cú dừng 50 ms của cú trước còn giữ, nên thân chạy theo giờ thế giới ×0,05.
   - Sửa: `HitStop.cut()` (`feel.ts`) bỏ cú dừng còn giữ, không có đoạn ease ra; `skills-main.ts` gọi nó ngay trước mỗi `caster.release` (đánh thường, chữ gõ xong, `__lab.cast`). Thao tác của người chơi không bao giờ phải chờ cú dừng.
   - Sau sửa: `lab-stress` 60 Hz phím cuối → thân tối đa 33 ms, 0 chiêu vượt cổng.
2. **Vòng sáng dưới chân không có đồng hồ** (`presence.ts`): `uTime` của trận đồ "presence" không bao giờ tăng, nên ba vạch cung "9 s một vòng" đứng im. Sửa: `ring.tick(dt)` mỗi khung.
3. **Bừng sáng giả sau mỗi lần đặt lại lab** (`presence.ts`): `fx.reset()` đưa bộ đếm lần nhả về 0, còn `CasterPresence.reset()` giữ số cũ, nên khung kế tiếp tưởng có lần nhả mới. Sửa: sau đặt lại bộ đếm là −1, khung đầu chỉ đồng bộ; chỉ bừng khi bộ đếm tăng.
4. **Thú chết lúc đang hiện dần hoặc đang tan ở tim trận** (`herd.ts`): thân bật lại nguyên vẹn rồi mới tan, nhảy độ cao tới 0,25 m; ở chế độ hành quân, sau khi hồi sinh còn chạy tiếp phần tan dở rồi dịch chuyển về cổng. Sửa: cú đánh chết lưu độ tan và độ nâng đang hiện, cái chết đi tiếp từ đó; xóa trạng thái hiện dần và tan ở tim trận. Thú đang tan ở tim trận không còn là mục tiêu (nó sắp hiện lại ở cổng, kiếm bay theo sẽ giật hướng).
5. **Thú bị xoáy K5 hút mà đang tan thì rơi khoảng 0,4 m trong một khung** khi xoáy hết hạn (`herd.ts`): hết hạn xóa cờ "bị hút" của mọi con, nên độ nâng đổi từ +0,35 sang −0,08 × độ tan ngay lập tức. Sửa: con đang chết giữ cờ tới khi tan xong.
6. **Kiếm K1 đang chờ xoay quanh trục không giới hạn, rồi bật về 0 ở khung phóng** (`kiem.ts`): đường bay vẽ kiếm không có góc xoay. Bộ đo chỉ xét hướng mũi nên không bắt được. Sửa: kiếm chờ lắc ±0,75 rad, góc vẽ được làm mượt và về 0 trước khi phóng (kiếm đầu theo các phím cuối của chữ, hai kiếm sau ngay khi nhả).
7. **Viền sáng của kiếm bay vượt 0,9 khi không có lóe** (`kiem.ts`, `lightBlade`): tint thường trực 1,3–1,95 (kiếm K1 chờ, đai kiếm K5 1,6) đẩy viền lên khoảng 1,1–1,25, trái luật bloom (quầng và viền ≤ 0,9, chỉ lõi mảnh HDR). Sửa: tint ≤ 2 giữ viền ≤ 0,88; chỉ lóe trúng (tint > 2) mới vượt. Đường lõi HDR vẫn theo tint như cũ.
8. `palSlot` theo kịp `pal` khi đổi vũ khí và khi đặt lại (`use("auto")`).

## Đã soát, không phải lỗi

- Không cấp phát mỗi khung trong các đường cập nhật mới; `skillGlow` chỉ chạy lúc nạp hoặc khi đổi vũ khí.
- Không có nguồn NaN: mọi phép chia độ dài đều có chặn (`|| 1`, `> 1e-3`, `> 0.35`).
- `GroundSigil.place()` nay đặt lại cỡ: mọi chỗ đặt cỡ đều chạy sau `place()` trong cùng khung.
- Chùm sáng và sprite có `rise`/`fadeIn` vẫn hiện từ khung phát (các kho cập nhật sau khi phát); thẻ một khung bỏ qua `fadeIn`.
- Dòng thời gian K1, K4, K5 chạy theo giờ thật là cố ý: cú dừng không đẩy kiếm hay đợt sau trễ tick canon.

## Số đo sau sửa (`tmp/shots/motion/r2-review-impact/`)

| Số đo | Vòng 1 | Làn va chạm | Sau rà soát |
|---|---|---|---|
| `lab-motion` 60 Hz: VFX bật / tắt, kiếm, bind | 0/0, 0, 0 | 0/0, 0, 0 | 0/0, 0, 0 |
| Xoay gốc lớn nhất | 487 °/s | 277,6 °/s | 277,6 °/s |
| Phím cuối → thân / → VFX (`lab-motion` 60 Hz, 120 Hz) | 33 / 0, 42 ms | 33 / 0, 42 ms | 33 / 0, 42 ms |
| Phím cuối → thân, `lab-stress` 60 Hz / 120 Hz / Low | 33 ms (60 Hz; làn diễn xuất cũng 33) | **100 / 100 / 100 ms** (1 chiêu vượt) | 33 / 42 / 33 ms (0 vượt) |
| `lab-stress`: VFX bật / tắt, kiếm trên 1.302 đời (Low 702), bind | 0/0, 0, 0 | 0/0, 0, 0 | 0/0, 0, 0 |
| Trắng xóa lớn nhất: camera chơi / cận cảnh 6 m | 0,30 / 9,3 % | 0,025 / 0,79 % | 0,023 / 0,79 % (0 khung > 6 %) |
| Tay dang: chuỗi hỏng | 3 | 0 | 0 |

`tsc` strict qua; `pnpm test` 74 tệp, 675 test qua; `pnpm build` qua và `dist` không có `skills-lab`, `MotionProbe`, `CasterPresence`, `kiem-blade-light`, `k1Roll` cùng các tên lab khác; `verify-kit` 73 tệp khớp. Khung thô đã xóa; giữ tờ đoạn, tờ chuyển tiếp, clip và `metrics.json`.

## Còn mở (chuyển lại)

- Cổng chuyển clip trong `lab-stress` 8/46 → 9/46 vượt 1,5 × (calf_r ở các cú đánh thường liên tiếp và thrust → idle 1,58). Do cú dừng dời nhịp chân; thuộc làn diễn xuất, không phải cổng cứng của vòng 1.
- Gieo lại K2 khi vết tro cũ còn: tro và than của đường cũ nhảy sang đường mới trong khoảng 0,2 s (một trận đồ cho một đường, có từ vòng 1).
- K5 gieo lần hai ở chỗ khác khi vết nứt cũ chưa tắt (6,5 s): lần hai không có vết nứt.
- Lệch chuẩn đã ghi ở làn va chạm (dừng hình 3–5 khung, lóe nhả lên trong 2–3 khung) vẫn chờ ghi vào VFX_STANDARD hoặc sửa chuẩn.
