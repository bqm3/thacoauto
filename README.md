# THACO Appointment Board

Ứng dụng hiển thị lịch hẹn từ Google Sheet, mỗi màn hình có một đường dẫn và cấu hình riêng. Cấu hình và phiên đăng nhập được lưu trong MongoDB.

## Chạy ứng dụng

Yêu cầu Node.js 20 trở lên.

```bash
npm install
npm start
```

Sau đó mở:

- Quản trị: `http://localhost:8080/admin`
- Màn hình mẫu: `http://localhost:8080/thaco-hai-phong-01`

Ứng dụng cần các biến môi trường sau:

- `MONGODB_URI`: chuỗi kết nối MongoDB Atlas (bắt buộc).
- `MONGODB_DATABASE`: tên database, mặc định là `thaco_auto`.
- `ADMIN_PASSWORD`: mật khẩu quản trị; nếu bỏ trống sẽ dùng giá trị seed trong `config.json`.

Sao chép `.env.example` thành `.env`, sau đó có thể chạy local bằng `node --env-file=.env server.js`. Khi triển khai trên Vercel, thêm các biến này vào Project Environment Variables.

## Dữ liệu

Trong lần kết nối đầu tiên, dữ liệu từ `config.json` được dùng để khởi tạo MongoDB. Sau đó trang quản trị đọc và ghi trực tiếp vào MongoDB; file không bị ghi lại. Google Sheet phải được chia sẻ ở chế độ bất kỳ ai có liên kết đều có thể xem.

Có thể đổi cổng bằng biến môi trường `PORT`:

```powershell
$env:PORT = 3000
npm start
```
git push remote-b master
git push remote-b master:main --force