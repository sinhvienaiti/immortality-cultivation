# 06/11/2026 · Lab chiêu: chữ trên quái luôn đọc được (nhánh `claude/lab-readability`)

Việc điều phối giao sau lượt đo hiệu năng: đo độ tương phản chữ trên quái (cần ≥ 7:1) ở khung đỉnh của từng chiêu phím 8, 9, C, M. Chiêu nào dưới 7:1 thì hạ phần phủ sau khung chữ, giữ vẻ rực rỡ của chiêu.

## Thẻ chữ thay trong lab
Game chưa thiết kế thẻ chữ trên quái, nên lab thêm thẻ thay (`src/lab/word-tags.ts`).
- Bật bằng `?tags=1` hoặc phím T; mặc định tắt.
- Tối đa 24 thẻ, không chồng nhau, quái to và gần giữa trước.
- Mỗi thẻ đặt cách đầu quái 0,3 m.
- Màu thẻ lấy từ Dragonhold: chữ `#FFF4D6` trên nền `#231C17`. Nền đục 0,6 thay vì 0,9, để vẫn thấy con quái; `?tagPlate=` để đổi.

## Mặt nạ thẻ chữ
`src/view/skills/tag-mask.ts`: mặt nạ màn hình độ phân giải thấp (ô 8 px), mép mềm.
- **Đọc mặt nạ:**
  - Shader của `FlipbookPool` và `SpritePool` (bọc bằng `withTagMask`).
  - Khung đồ họa lúc đánh: chỉ khung tại chỗ và khung đảo sáng; khung tối giữ nguyên vì giúp chữ.
  - Ánh sáng tự phát trên thân bầy quái của lab.
- **Tác dụng:** sau thẻ, các lớp này chỉ giữ `TAG_KEEP` 0,3 ánh sáng; phần còn lại của chiêu sáng nguyên. Mặc định (không thẻ) mặt nạ không có tác dụng.
- **Theo từng chiêu:**
  - Trường mới `tagKeep` trong bảng `ClipSkill`, đặt 0,12 cho 15 chiêu mà ở 0,3 vẫn còn thẻ dưới 7:1. Mức này giữ trong 5 s sau phím.
  - Phím M dùng 0,12 khi đang rơi.
  - `?tagMask=0` tắt mặt nạ, `?tagKeep=` đổi mức chung.
- **Số sát thương:** né thẻ bằng luật sẵn có (`setWordTags`). Khi 24 thẻ kín chỗ, số tổng lớn có thể bị bỏ.

## Đo
- **Cách đo:** `scripts/visual/scenarios/lab-tag-readability.mjs` chụp mỗi chiêu hai ảnh ở cùng khung, một ảnh chỉ canvas và một ảnh có thẻ. `scripts/visual/tag-contrast.py` chấm điểm ảnh phân vị 90 sau mỗi thẻ, nền thẻ 0,6 và 0,9.
- **Trước:** 745/1824 thẻ dưới 7:1, tệ nhất 4,18:1.
- **Sau:** 0/1824, tệ nhất 7,06:1.
- **Theo nhóm:**
  - Phím 8: 291 → 0.
  - Phím 9: 392 → 0.
  - Phím C (14 hệ): 27 → 0.
  - Phím M (14 hệ): 35 → 0.

## Test
- `tests/view/tag-mask.test.ts` (mới).
- `flipbook-v2`: băm thân shader cũ bên trong lớp bọc, nên thân cũ vẫn giữ nguyên từng byte.
- `fire-prewarm`: tính thêm texture mặt nạ dùng chung.
