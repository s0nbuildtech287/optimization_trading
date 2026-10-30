# Optimization Trading

Monorepo lưu mã nguồn của hệ thống Optimization Trading:

- `backend/`: API, PostgreSQL DAO và MT5 optimization services.
- `front-end/`: giao diện web.
- `backup-mt5/`: MT5 Utilities/worker desktop application.

## Cấu hình

Sao chép `.env.example` thành `.env` trong từng ứng dụng cần chạy và tự điền credential của môi trường. Credential, service-account JSON, dữ liệu upload, log, binary và bản build không được lưu trong repository.

## Chạy local

Xem `README.md` và `package.json` trong từng thư mục con để cài dependency, chạy hoặc build ứng dụng tương ứng.

