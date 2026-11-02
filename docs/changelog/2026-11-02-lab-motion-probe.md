# 02/11/2026: bộ đo chuyển động cho lab kỹ năng (MOTION_PLAN bước 1)

Chủ dự án, 02/11: chiêu thức và từng cử động tay chân, thân, đầu của nhân vật phải mượt. Bước 1 là đo trước, chưa làm mượt gì, để có mốc so sánh.

## Đã làm (chỉ trong lab dev, không vào bản build)

- `src/lab/motion-probe.ts`: mỗi khung đo sau lúc vẽ, không sửa file VFX hay clip nào.
  - Xương: vận tốc góc so với đỉnh của clip đang chạy (đỉnh lấy mẫu sẵn ở 240 Hz), khoảng cách RMS tới tư thế bind.
  - Gốc: tốc độ, gia tốc, tốc xoay.
  - Chân: trượt khi chạm (cao dưới 4 cm so với dáng Idle), xuyên đất.
  - VFX: năng lượng từng lớp (sprite, beam, ribbon, trận đồ) đọc từ thuộc tính và uniform của chính nó; lớp bật tắt quá 30 % mức đầy trong 1 khung; mỗi đời kiếm: hiện, tắt hay đổi cỡ quá 30 %, giật hướng quá 30°, nhảy quá 3 m.
  - Mốc: phím cuối, lúc VFX nhả (chớp đầu tiên), lúc thân nhả (clip qua `release`), đổi clip, đi, dừng, xoay, nhãn pha của kịch bản.
  - Không cấp phát trong đường cập nhật mỗi khung; đọc qua `window.__lab.metrics()`.
- `src/lab/caster.ts`: thêm clip Run và Hit; móc đi theo điểm (`walkPath`, `walkTo`, giữ hướng khi đi ngang) và xoay tức thì (`faceTo`). Cố ý chưa làm mượt để mốc trung thực. Báo đổi trạng thái cho bộ đo.
- `src/lab/skills-main.ts`: gắn bộ đo; `__lab.tick`, `step(n, dt)`, `walkPath`, `walkTo`, `faceTo`, `moving`, `mark`, `metrics`, `view('follow')` (cận cảnh 55°, cùng khung, không trôi thời gian); trúng đòn không đỡ thì chạy clip Hit.
- `scripts/visual/scenarios/lab-motion.mjs`: chuỗi của bước 4 ở 45 WPM, `?fixed=1`. Ghi `metrics.json`, tờ chuyển tiếp (6 khung quanh mỗi lần đổi trạng thái, hàng cận cảnh và hàng camera chơi), clip nửa tốc độ (30 fps) và clip 60 fps. `HZ=120` chạy lượt đo ở bước 1/120 s.

## Mốc hôm nay (`tmp/shots/motion/baseline/`, 2.420 khung, 40,3 s)

| Số đo | Mốc | Ngưỡng |
|---|---|---|
| Vận tốc góc lúc chuyển / đỉnh clip | lớn nhất 4,80 (Dash về Idle); 5/20 lần chuyển clip vượt | ≤ 1,5 |
| Về Idle sau mọi đòn một lần | 8/8 lần qua tư thế bind (RMS 0°, 3 khung gần bind mỗi lần) | không khung nào |
| Trượt chân khi chạm | p95 2,70 m/s; 420 khung vượt | ≤ 0,05 m/s |
| Xuyên đất | 2,51 % chiều cao (lúc vào Dash) | ≤ 2 % |
| Mối nối vòng lặp Idle, Run | 0 cm | ≤ 1 cm |
| Phím cuối tới VFX nhả | 0 ms | ≤ 50 ms |
| Phím cuối tới thân nhả | Attack, Skill1 17 ms; hộ thân 450 ms; K4 483 ms; K5 817 ms | ≤ 50 ms |
| Dáng gồng khác dáng nhả | 4,3–9,6 % (thân đứng Idle suốt lúc gõ) | ≥ 15 % |
| Xoay gốc | tức thì: 90° và 180° trong 1 khung (10.800°/s); 6 khung giật xoay | xoay có lò xo |
| Dịch gốc | Dash đi 1,15 m ngay khung đầu (68,9 m/s) | có đà |
| Lớp VFX | 33 lần tắt phụt, 123 lần bật phụt ở lớp không phải lóe | 0 |
| Kiếm bay | 337 đời: 37 hiện đủ cỡ, 27 tắt đủ cỡ, 22 đổi cỡ gắt, 306 khung giật hướng (K5 chiếm 300, tối đa 167°) | 0 |

Lượt 120 Hz (`metrics-120hz.json`): tỉ số lúc chuyển tăng gấp đôi (lớn nhất 9,68), đúng dấu hiệu của chỗ gãy thật.

## Lỗi tìm thấy, chưa sửa (mốc phải là lab hôm nay)

- **Nhân vật quay lưng với hướng của nó.** `caster.ts` `place()` coi mặt trước của model là +z, nhưng `lam.glb` nhìn về −z (mũi chân −z, tay phải ở +x). Khi ra đòn về phía quái, Lam quay mặt về camera; khi đi, Lam chạy giật lùi, nên chân chạm trượt khoảng gấp đôi tốc độ đi. Ảnh: `facing-north.png`, `facing-east.png`. Sửa một dòng ở đầu bước 2, rồi chạy lại mốc trước khi so.
- Những lỗi còn lại khớp với phụ lục B của MOTION_PLAN: tư thế bind khi hết clip, bỏ pha gồng, xoay và dash tức thì, kiếm K5 giật hướng, ribbon và vầng sáng tắt phụt.

## Kiểm tra

- `tsc --noEmit` qua; vitest 74 tệp, 675 test qua.
- `pnpm build` qua; `grep -r "skills-lab" dist` không ra gì, cũng không có mã của bộ đo.
- Đã xem tờ chuyển tiếp: Dash về Idle tay bật về trong 1 khung (#877 → #878); xoay 90° trong 1 khung.
- Khung thô đã xóa; giữ tờ khung, clip và số đo.
