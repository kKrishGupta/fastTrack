# API

All errors use `{ "error": { "code": "…", "message": "…" } }`.

- Auth: `POST /api/organization/login`, `POST /api/employee/login`, `POST /api/session/logout`, `GET /api/session/me`
- HR: `/api/hr/departments`, `/api/hr/employees`, `/api/hr/offices`, `/api/hr/attendance`
  - `DELETE /api/hr/employees/:id/invitations` revokes every pending activation token for an employee.
  - `DELETE /api/hr/employees/:id` permanently removes the employee and their organization-owned attendance, verification, enrollment, invitation, WFH, and office-assignment data.
  - `PATCH /api/hr/offices/:id` updates office details, active status, coordinates, and the 25–5,000 metre attendance radius.
- Employee: `GET /api/employee/offices`
- Monitoring: `/api/monitoring/devices`, `/api/monitoring/enroll`, `/api/monitoring/report` and device-authenticated `/api/monitoring/agent/*`. See [ActivityWatch setup and access controls](activitywatch.md).
- Monitoring extensions: session-authenticated `GET,PUT /api/monitoring/policy`, `GET,POST /api/monitoring/rules`, `DELETE /api/monitoring/rules/:id`, `GET /api/monitoring/summary`, `GET /api/monitoring/timeline`, `GET /api/monitoring/screenshots` and `GET /api/monitoring/screenshots/:id/view`; writes require HR, CSRF and organization scope. Device-only screenshot upload request plus `POST /api/monitoring/agent/screenshots/:captureId/content`, credential rotation and self-revocation preserve scoped enrollment. Screenshot bytes are validated by the API and stored as authenticated Cloudinary assets; delivery links are short-lived and audited. See the [protocol and release limitations](activitywatch-product-integration.md).
- Attendance: `POST /api/attendance/challenge`, `/verify-location`, `/verify-face`, `/check-in`, `/check-out`; `GET /today`, `/history`

`/verify-face` fails closed unless a production face adapter is configured. The deterministic development adapter requires non-production mode and `ALLOW_TEST_FACE_ADAPTER=true`.
