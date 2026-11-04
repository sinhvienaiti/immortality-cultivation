# Lab kỹ năng: camera xoay bằng O và cut-in mặt C3 (04/11/2026)

Chuyển bản vá chủ dự án đã thử tối 03/11 từ `tmp/owner-preview/` (gốc `9cb7bcd`) sang mã lab ở `1a78a82`, giữ nguyên các thay đổi hào quang kiếm vòng 1. Chỉ thay mã trong `src/lab/`; game vẫn dùng camera hiện có, lab không vào bản build.

## Camera xoay

- Phím **O** hoặc nút O trong bảng lab bật/tắt `LabOrbit`.
- Khi bật, kéo chuột trái trên sân để xoay đủ 360° quanh điểm camera nhìn xuống mặt đất; kéo dọc đổi góc cao, kẹp trong **4–89°**. Khoảng cách tới điểm nhìn được giữ nguyên.
- Con lăn, `=`, `-` và **Z** vẫn điều khiển zoom; khung rộng của chiêu lớn, rung và độ giật vẫn hoạt động. Bấm O lần nữa trả quyền điều khiển về camera lab bình thường.
- `LabOrbit` được chép nguyên từ bản xem, tái sử dụng ba vector trong `apply`, không tạo đối tượng mỗi khung. Khi tắt, `apply` trả về ngay.
- Trong vòng `frame`, góc xoay áp ngay sau `zoom.update` và trước `camBase.copy`, đúng như bản xem chủ dự án đã thử. Vì vậy độ giật và rung được cộng **lên tư thế đã xoay**, và `screen.applyCamera` vẫn lo phần lắc nghiêng và FOV.
  - Codex từng đặt chỗ gọi sau phần rung và giật, theo câu chữ của phiếu. Claude dời lại khi duyệt, vì đặt như vậy thì `apply` tính lại vị trí và nuốt mất độ giật.
  - Các góc kiểm tra cố định (`customCamera`, `followShown`) không đi qua nhánh này.

## Cut-in tuyệt kỹ

- Mặc định dùng phong cách **C**, khung hô **C3 — Radiant Resolve**: `tt-cutin-c-shout-e3-head-skin-up2x.v2-try1.png`.
- `?cutinArt=a|b|c` chọn phong cách tranh. `?cutinShout=c1|c2|c3|c4|b1|b2|b3` chọn mặt hô; nếu không chỉ định phong cách thì lấy phong cách của mặt hô.
- Thiếu hoặc sai `cutinShout` đều trở về **c3**. `cutinArt` hợp lệ được ưu tiên; nếu mặt hô khác phong cách đã chọn thì giữ khung hô gốc của phong cách đó và ghi cảnh báo console. Hai khung của A giữ nguyên.
- Thêm đúng các điểm neo mắt và hộp giữ mặt/bàn tay của B, cùng hộp giữ và bảng bảy mặt hô trong bản xem. Khung tụ lực C không đổi.
- `?cutin=` vẫn điều khiển thời lượng; dưới 0,6 giây không hiện tranh và không cắt khung, như trước.

## Cách thử khi Claude duyệt trình duyệt

1. Mở trang dev `skills-lab.html` không có cờ, bấm O, kéo ngang quanh sân rồi kéo dọc tới hai giới hạn. Thử zoom và chiêu 6/7 trong lúc xoay; bấm O để trở lại camera bình thường.
2. Bấm **6** để xem tuyệt kỹ mặc định C3; đối chiếu với bản xem đã chốt tối 03/11.
3. Thử `?cutinShout=c1`, `?cutinShout=b3`, `?cutinArt=b&cutinShout=b2`, `?cutinArt=a`, `?cutinShout=invalid` và `?cutinArt=c&cutinShout=invalid`. Hai URL sai mặt hô phải dùng C3; A giữ hai khung cũ.
4. Thử `?cutinArt=a&cutinShout=b3`: A vẫn dùng khung hô A. Thử `?cutin=0.05` để kiểm tra chế độ đo không hiện tranh.

Codex chỉ chạy kiểm tra không cần trình duyệt và bản build theo phiếu 255. Claude sẽ đọc diff, chạy lại các kiểm tra và duyệt O/C3 trong trình duyệt trước khi commit, gộp nhánh.
