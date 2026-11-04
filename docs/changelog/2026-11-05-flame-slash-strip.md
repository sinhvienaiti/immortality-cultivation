# 05/11/2026 · Nhát chém kết phím 7 hệ Hỏa dùng dải Firefly

Phiếu 275 thay hàng lưỡi lửa nhọn do mã vẽ bằng dải anh đã chọn: `art-src/lab/vfx/aura/strips/strip-fire-sheath.rgba.png`. Dải cuộn lùi về chuôi với tốc độ 0,5 chu kỳ/giây, lấy alpha để ghép nhiệt vào cùng ramp son–cam–vàng của thân, rồi điều biến màu bằng vân ảnh. Giữ hình trăng khuyết, bảng tâm/bề rộng, xương sống, đầu chạy, lịch xói và mờ.

`FlameSlash.set(...)` nhận hai đầu trong tọa độ thế giới và nửa bề rộng quy về 1080p, không nhận camera để đo chiều dài cung trên màn hình. Vì vậy dùng phương án dự phòng được phiếu cho phép: `k = 3`, ba chu kỳ dọc nhát chém; chưa khẳng định đã đo đúng tỷ lệ nguồn 2:1.

Texture dùng sRGB, alpha thẳng, lặp theo x, kẹp theo y và lọc mipmap. Khi ảnh chưa có kích thước hợp lệ hoặc nạp lỗi, shader dùng nguyên các phép tính lửa cũ. Cờ lab `?slash=tongues` giữ đường cũ để so A/B; mặc định dùng dải khi ảnh sẵn sàng.

Test Node kiểm hai nhánh shader, các phép tính cũ, uniform của `setStrip`, cờ mặc định và chuyển từ dự phòng sang ảnh đã nạp. Kiểm trình duyệt, parity hệ Kim và khung Hỏa không có nhát chém, cùng video 720p/1080p trên nền sáng/tối do Claude thực hiện sau; chưa nghiệm thu hình ảnh trong game.
