# API

All errors use `{ "error": { "code": "…", "message": "…" } }`.

- Auth: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- HR: `/api/hr/departments`, `/api/hr/employees`, `/api/hr/offices`, `/api/hr/attendance`
- Employee: `GET /api/employee/offices`
- Attendance: `POST /api/attendance/challenge`, `/verify-location`, `/verify-face`, `/check-in`, `/check-out`; `GET /today`, `/history`

`/verify-face` fails closed unless a production face adapter is configured. The deterministic development adapter requires non-production mode and `ALLOW_TEST_FACE_ADAPTER=true`.
