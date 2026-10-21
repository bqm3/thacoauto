# THACO Appointment Board

Ứng dụng hiển thị lịch hẹn từ Google Sheet, mỗi màn hình có một đường dẫn và cấu hình riêng.

## Chạy ứng dụng

Yêu cầu Node.js 18 trở lên. Dự án không cần cài thêm package.

```bash
npm start
```

Sau đó mở:

- Quản trị: `http://localhost:8080/admin`
- Màn hình mẫu: `http://localhost:8080/thaco-hai-phong-01`

Mật khẩu mặc định là `123456`. Có thể đổi `adminPassword` trong `config.json`, hoặc đặt biến môi trường `ADMIN_PASSWORD` khi chạy server.

## Dữ liệu

Trang quản trị thêm, sửa và xóa trực tiếp các phần tử trong mảng `screens` của `config.json`. Google Sheet phải được chia sẻ ở chế độ bất kỳ ai có liên kết đều có thể xem.

Có thể đổi cổng bằng biến môi trường `PORT`:

```powershell
$env:PORT = 3000
npm start
```
