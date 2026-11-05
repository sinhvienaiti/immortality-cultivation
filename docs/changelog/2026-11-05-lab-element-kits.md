# Lab kỹ năng: bộ chất các hệ mới vẽ bằng clip Firefly (05/11/2026)

Anh (05/11 18:30): "tôi nghĩ bạn nên thêm 2 agent để xử lý cho hình ảnh vào lab dần đi cũng đc". Agent 1 (`docs/work/tasks/lab-flipbooks.md`, repo cha) cắt video Firefly tối 05/11 thành flipbook theo hệ. Việc này (agent 2, `docs/work/tasks/lab-element-kits.md`) viết mã để lab vẽ các chiêu Kiếm (phím 0–7) bằng chất liệu của từng hệ mới, từ những flipbook đó.

Thiết kế theo: `docs/games/tu-tien/skills/ELEMENT_LAYER.md` §1–3 (vũ khí cho hình, hệ cho chất; **thay, không chồng**), `PRODUCTION_LIST_2026-11-05.md` §3 và §7 (động từ, màu, lấp lánh từng hệ), `docs/games/VFX_STANDARD.md` (5 pha).

## Cách làm chung: `element-clips.ts`

- Mỗi hệ mới là một **bộ chất làm từ clip** (`clipKit`). Clip lấy theo `role` trong manifest của thư mục hệ (`art-src/lab/vfx/<hệ>/manifest.json`): `charge`, `release`, `ribbon`, `sheath`, `impact`, `burst`, `groundImpact`, `sparkle`, `slash`, `groundMark`. Đây là hợp đồng với agent 1; id clip không cần biết trước.
- Mỗi hook chỉ **đặt, định giờ và hoạt họa** vài lớp clip có sẵn (luật "không vẽ bằng mã" của AGENTS.md, lời anh 17:08 "tránh việc làm quá phức tạp"):
  - gom lực: clip `charge` cuộn theo tiến độ gõ ở tay, `sparkle` quanh tay; mỗi phím một lóe lấp lánh, kiếm hiện ra ở đâu thì `release` nhỏ ở đó;
  - phát chiêu: `release` ở tay, lấp lánh, ánh sáng; chiêu lớn (phím 7, bậc 3) thêm `burst` sau lưng và đòn xuống đất dưới chân;
  - bay: `sheath` quấn dọc lưỡi kiếm (tắt khi hào quang kiếm bật), lấp lánh rơi theo đường bay; `ribbon` làm vệt sau kiếm (`TrailLook.flame`, tô qua dải màu của hệ);
  - trúng: `impact` (đòn lớn: `burst`), lấp lánh, ánh sáng; nhát chém là `slash`; đòn diện rộng là `burst` trên một `groundImpact`;
  - dư âm: **mọi đòn chạm đất** (anh 17:08): `groundImpact` bật lên rồi `groundMark` nằm phẳng trên đất và tan dần; phím 7 (đòn của kiếm dẫn đầu, vết cắt kết, nạn nhân bị ghim) cũng vậy.
- **Thay, không chồng:** hook chỉ trả `true` khi clip của nó đã có. Vai trò chưa có clip thì trả `false`, lớp gốc vẽ theo bảng màu của hệ. Nhờ vậy bộ chất chạy được trước khi agent 1 xong; có clip mới thì tải lại lab là thấy.
- **Đánh nhanh, tan chậm:** clip một lần chạy tới khung đỉnh (`timing.peak` của manifest) trong 0,05–0,12 s, rồi giữ và tan trong thời lượng theo vai trò (`TIMES`: va chạm 0,9 s, nổ lớn 1,5 s, đòn xuống đất 1,3 s, dấu đất 2,8 s) nhân hệ số `linger` của hệ. Clip năm giây của Firefly không bao giờ chạy đúng độ dài gốc.
- **Chế độ vẽ:** mọi clip quay trên nền đen nên mặc định là `fire` (cộng sáng, giữ màu gốc của clip; `occlude` của hệ quyết định đất dưới clip tối đi bao nhiêu). Hệ là vật chất (Thủy, Thổ, Băng) che đất mạnh để thân thành khối, không thành màn sáng nhạt. Hệ Ám vẽ thân bằng `heat` (theo ghi chú của agent 1: cộng sáng làm mất phần đen), nên phần mờ của clip thành vật chất tím đen.
- **Dấu đất** nằm phẳng (vá shader như `groundCard` của Fire) và vẽ vuông: hình bầu dục vẽ xiên trong clip thành tròn dưới camera chơi.
- **Luật của từng hệ** (`ClipLook.hit`, ELEMENT_LAYER §2):

| Luật | Hệ | Đòn trúng thế nào |
|---|---|---|
| `flow` | Thủy, Phong | sóng hay áp suất của đòn chảy tiếp qua con thú theo hướng đánh |
| `strike` | Lôi, Quang, Tinh tú | lóe đánh dấu, một nhịp sau `ribbon` dựng đứng giáng từ trên xuống |
| `shatter` | Băng, Không gian | một lóe giữ con thú một nhịp, rồi va chạm vỡ ra |
| `crush` | Thổ | va chạm và một đòn xuống đất ngay dưới chân |
| `claim` | Mộc, Độc | rễ hay vũng độc chiếm đất dưới con thú ngay lúc trúng |
| `drain` | Huyết | lấp lánh chạy ngược về người ra chiêu |
| `burst` | Ám | nổ tại chỗ |

## Theo commit

| Commit | Nội dung |
|---|---|
| `6b1492a` | Bộ chung `element-clips.ts`, **Thủy** (`element-water.ts`). `flipbook.ts` đọc `role` và `timing.peak/holdEnd`; `element-kit.ts` thêm `ClipRole`, `ElementKit.roles` và 6 mã hệ mới; `element-stage.ts` tải thư mục hệ khi bộ chất vẽ theo vai trò. Lab: `__lab.clipKit()`; kịch bản quay `scripts/visual/scenarios/lab-element-kits.mjs`, script ghép video có chú thích `scripts/visual/element-kit-video.py` |
| `6775b72` | **Lôi** (`element-thunder.ts`) |
| `c0408ec` | Bốn luật mới (`shatter`, `crush`, `claim`, `drain`), `streamOf` và `auraOf` dựng sắc phím 7 và chất hào quang kiếm từ màu của hệ, 6 trạng thái trên thú mới (`devoured`, `judged`, `corroded`, `drained`, `rifted`, `starfall`) |
| `9f173b8` … `932de69` | Mỗi hệ một commit: Phong, Băng, Ám, Quang, Mộc, Thổ, Độc, Huyết, Không gian, Tinh tú |
| `c154f35` | Phím **8** của lab: cột trụ và tuyệt kỹ (`art-src/lab/vfx/ult/`) phát thành lớp video trên sân, đúng góc camera chơi, chưa nối vào sim (`src/lab/showcase.ts`, `__lab.showcase(id?)`) |

## Kiểm

- `tsc --noEmit -p .` sạch.
- Vitest toàn bộ qua (`--no-cache --configLoader runner --maxWorkers 4`). Test mới: `tests/view/element-clips.test.ts` (mọi hệ vẽ theo vai trò: chưa có clip thì lớp gốc vẽ y như Metal; có clip thì thay lớp Metal ở cả 5 pha và mỗi đòn chạm đất; phím 7), `tests/lab/showcase.test.ts`.
- Video từng hệ (phím 0–7 và cận cảnh đòn xuống đất của phím 1 và 5, đồng hồ cố định 60 Hz, quay 30 khung/giây) ở `typing-game-review/owner-review/2026-11-05/tu-tien/lab-elements/`. Dòng chú thích trên đầu khung ghi clip nào đã có và vai trò nào còn để lớp gốc vẽ.

## Chưa xong, ghi rõ

- Tối 05/11 mới có một phần clip của mỗi hệ (hàng video Firefly chạy tới khoảng 23:00); vai trò còn thiếu đang để lớp gốc vẽ theo bảng màu của hệ, nên các pha đó **chưa đẹp**. Có clip thì quay lại video là thấy, không cần sửa mã.
- Nhát chém cuối của phím 7 vẫn là lớp gốc (`QiSlash`) tô màu hệ; chưa thay bằng clip.
- Chưa đo khung hình (trần 0,85 ms mỗi hệ của ELEMENT_LAYER §5) và chưa chấm mù 8,5.
