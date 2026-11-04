# Va chạm phím 1 bản 2: lửa nét cọ có mặt nạ · phiếu 264

Đòn phím 1 của Fire mặc định dùng clip lửa nét cọ anh đã duyệt tối 04/11: thẻ có mặt nạ bám gốc tại điểm trúng, xoay theo hướng đòn trên màn hình trong giới hạn, nguội thành than với `rampCool = 1`. Đòn này có chớp vàng trắng và đèn đủ cường độ ở khung đầu, giữ tia lửa và than cho tới CX-F; bỏ hoa sen, chớp điểm lửa, vết cháy code và lửa đất. Khói mỏng và than bay lên của hậu pha vẫn giữ. Các ô khác và phím 7 giữ hành vi cũ.

Các số **TRIAL** của `BRUSH`: thư mục `fire/impact-k1-r2`, id `fire-impact-k1-r2`; chiều cao ô 3,0 m nhân cỡ đòn, hệ số xoay 0,6, giới hạn ±50°, `lift` 0,7, `softM` 0,2, `rampCool` 1, sức chứa 24, thứ tự vẽ 12. Chớp có cỡ đầu/cuối 0,6/0,5 m nhân cỡ đòn, đời 0,07 s, màu tuyến tính từ `#FFE2A0` nhân 2. Đèn có cường độ 4, nhân 1,5 ở đòn lớn. Không chỉnh hình, lịch mặt nạ hoặc các số này trong phiếu.

`?impact=brush|lotus` chọn bản mới hoặc khôi phục đòn hoa sen cũ, cùng thứ tự rút số ngẫu nhiên. Manifest của clip do Claude ghi ở `art-src`; thiếu thì đòn quay về hoa sen, đếm `missing` và cảnh báo một lần mỗi lần nạp module. Không thêm clip vào `FIRE.flipbooks` hoặc bản dựng game.

Lab có `__lab.fireImpact(mode?)` để đọc chế độ, trạng thái clip, bộ đếm đòn, tuổi thẻ theo tick thế giới và cường độ đèn. `__lab.fxSolo(prefix|null)` tách riêng lưới theo tiền tố tên rồi trả lại trạng thái hiện ban đầu, không trôi thời gian. `FlashLights` nhận `fresh` để bỏ lần giảm đầu tiên; người gọi cũ vẫn giảm như trước.

Kịch bản chụp thêm `PLAN=brush` ở camera cận và camera chơi, theo tuổi thẻ 0, 1, 2, 3, 4, 6, 9, 12, 15, 18, 21, 24. `LAYERS=brush,flash,lotus,point` chụp từng lớp và nền; `SCREEN=0` tắt xử lý màn hình sau mỗi lần reset. JSON mỗi khung thêm `fire`, `named` và tuổi thực ở kế hoạch mới. Kịch bản hiệu năng chờ clip tối đa 20 giây, ghi `impact` và `brushReady`.

Test mới `tests/view/key1-brush-impact.test.ts` kiểm manifest nguyên văn không đọc ảnh, phép xoay, sáu đòn chính/xuyên, lớp cũ đã tắt, uniform, đèn/chớp, tương đương hoa sen khi thiếu clip, các lớp giữ lại và tuổi đầu của đèn. Phiếu chỉ kiểm mã; Claude chạy trình duyệt, đo cổng và duyệt hình sau khi nhận.
