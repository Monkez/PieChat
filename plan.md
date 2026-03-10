\# Lộ trình Phát triển Nền tảng Chat (Matrix/Dendrite)

\*\*Mục tiêu:\*\* Xây dựng hệ thống chat cho 1.000 - 5.000 người dùng.

\*\*Công nghệ:\*\* Matrix Protocol (Backend: Dendrite), PostgreSQL, Nginx/Traefik.



\## Giai đoạn 1: Khởi tạo \& Chạy thử nghiệm Local (Tuần 1 - 2)

\* \*\*Mục tiêu:\*\* Cài đặt thành công Dendrite trên máy tính cá nhân và hiểu luồng hoạt động cơ bản.

\* \*\*Công việc:\*\*

&nbsp;   \* \[ ] Cài đặt Go (Golang) môi trường phát triển.

&nbsp;   \* \[ ] Clone source code Dendrite từ GitHub (`matrix-org/dendrite`).

&nbsp;   \* \[ ] Build Dendrite executable (Polylith hoặc Monolith). \*Lưu ý: Giai đoạn đầu nên dùng chế độ Monolith cho đơn giản.\*

&nbsp;   \* \[ ] Tạo file cấu hình `dendrite.yaml` cơ bản. Sinh cặp khóa riêng tư (Matrix keys) cho server.

&nbsp;   \* \[ ] Chạy thử nghiệm với SQLite (chỉ dùng cho test rải rác vài user).

&nbsp;   \* \[ ] Tạo 2 user nội bộ bằng script `create-account` và test nhắn tin 1-1 qua ứng dụng Element Web (chạy trên localhost).



\## Giai đoạn 2: Triển khai mạng LAN \& Tích hợp Client (Tuần 3 - 4)

\* \*\*Mục tiêu:\*\* Điện thoại/PC khác trong cùng mạng nội bộ (Ethernet/Wi-Fi) có thể kết nối và chat.

\* \*\*Công việc:\*\*

&nbsp;   \* \[ ] Tìm địa chỉ IP LAN của máy tính host (ví dụ: `192.168.1.x`).

&nbsp;   \* \[ ] Cấu hình Dendrite listen trên `0.0.0.0` thay vì `localhost`.

&nbsp;   \* \[ ] Mở port trên Firewall (mặc định là port 8008).

&nbsp;   \* \[ ] Cài đặt Element app trên điện thoại, trỏ homeserver URL về `http://192.168.1.x:8008`.

&nbsp;   \* \[ ] Test các tính năng: Gửi ảnh/video cơ bản, tạo group chat, gọi thoại WebRTC (nội bộ LAN).



\## Giai đoạn 3: Chuẩn bị hạ tầng Dữ liệu cho 1k - 5k User (Tuần 5 - 6)

\* \*\*Mục tiêu:\*\* Chuyển đổi kiến trúc dữ liệu để chịu tải thực tế, không dùng SQLite nữa.

\* \*\*Công việc:\*\*

&nbsp;   \* \[ ] Cài đặt PostgreSQL.

&nbsp;   \* \[ ] Cấu hình `dendrite.yaml` để kết nối với PostgreSQL.

&nbsp;   \* \[ ] Thiết lập Connection Pooling (ví dụ: dùng PgBouncer) để tránh quá tải database khi có hàng ngàn request đồng thời.

&nbsp;   \* \[ ] Tách biệt lưu trữ Media (ảnh, file): Chuyển sang dùng MinIO (S3-compatible) tự host để không làm đầy ổ cứng của App Server.



\## Giai đoạn 4: Đưa lên Môi trường Production (Tuần 7 - 8)

\* \*\*Mục tiêu:\*\* Public ra Internet, bảo mật và sẵn sàng đón người dùng.

\* \*\*Công việc:\*\*

&nbsp;   \* \[ ] Thuê VPS/Server (Cấu hình đề xuất cho 5k user: 4 Core CPU, 8GB RAM).

&nbsp;   \* \[ ] Đăng ký Domain và cấu hình bản ghi DNS (A record) trỏ về IP Public của VPS.

&nbsp;   \* \[ ] Setup Reverse Proxy: Dùng Nginx hoặc Traefik đứng trước Dendrite để quản lý luồng mạng.

&nbsp;   \* \[ ] Cài đặt SSL/TLS miễn phí qua Let's Encrypt (Bắt buộc để app mobile chấp nhận kết nối).

&nbsp;   \* \[ ] Cấu hình Push Notifications (Firebase Cloud Messaging / APNs) thông qua nền tảng Matrix (Sygnal) để tin nhắn tới khi app đóng.



\## Giai đoạn 5: Tùy biến Client \& Tối ưu (Tuần 9+)

\* \*\*Công việc:\*\*

&nbsp;   \* \[ ] Fork mã nguồn client (ví dụ: Element Android/iOS hoặc FluffyChat) để thay đổi UI/UX giống Zalo.

&nbsp;   \* \[ ] Load testing hệ thống với các công cụ tạo request giả lập.

&nbsp;   \* \[ ] Lên kế hoạch backup database (Cronjob dump Postgres) tự động hàng ngày.

