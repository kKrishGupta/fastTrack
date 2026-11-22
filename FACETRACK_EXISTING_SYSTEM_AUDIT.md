# FaceTrack Pro — existing system audit

Audit started: 2026-11-21; documentation finalized: 2026-11-22 (Asia/Calcutta). Baseline: commit `4364230` on `main`. Scope: Phases 0–3; documentation and read-only verification, with no application-source changes or deployment.

Evidence labels: **VERIFIED** means observed in the cited repository files, commands or named upstream source; **INFERRED** means an engineering conclusion derived from that evidence; **NOT FOUND** means absent from the inspected first-party repository, not proof that something cannot exist outside it. Proposed files and designs are explicitly identified as proposals.

## 1. Executive audit summary

**VERIFIED:** This is an existing npm-workspace React/Express/Mongoose application with organization-owned employees, invitations, approved face enrollment, geofenced attendance, WFH approval and a recently added ActivityWatch monitoring proof of concept. Preserve those workflows. Relevant entry points are `client/src/main.jsx`, `client/src/app/App.jsx`, `server/src/server.js` and `server/src/app.js`.

**VERIFIED:** Monitoring already includes employee consent, one-use pairing codes, scoped device credentials, revocation, validated batch ingestion, heartbeat health, application/domain reports and employee/HR pages. See `createMonitoringRouter`, `MonitoringPage`, and `server/src/services/monitoring.service.js`. It is incorrect to describe all monitoring as missing.

**VERIFIED:** The current download is a ZIP of Node.js scripts and `.cmd` launchers. `createAgentArchive` in `client/src/utils/agent-download.js` does not include ActivityWatch, Node.js, a native desktop application or an installer. It therefore does not satisfy the manager's one-install requirement.

**INFERRED:** Recommend Option B: a Windows FaceTrack application and one installer supervising a pinned, minimal ActivityWatch collector distribution, with the existing API contract hardened rather than replaced. The recommendation, alternatives and approval gate are in [FACETRACK_MONITORING_ARCHITECTURE.md](FACETRACK_MONITORING_ARCHITECTURE.md).

## 2. Verified existing project architecture

### Technology and runtime evidence

Versions below are resolved from root `package-lock.json` (lockfile version 3), not just manifest ranges.

| Area | VERIFIED implementation |
| --- | --- |
| Workspace | Root `package.json`: `client` and `server`; no shared workspace package |
| Web | React 18.3.1, React Router, Vite 8.3.8, Axios, TanStack Query; `client/package.json` |
| Design | Tailwind/PostCSS plus substantial existing CSS; DM Sans/Manrope, forest/cream variables in `client/src/index.css`; Lucide icons and shared UI components |
| Maps | Leaflet/react-leaflet and `components/maps/OfficeMapPicker.jsx` |
| API | Express 4.22.3, Mongoose 8.24.10, Zod 4.6.7; ES modules in `server/package.json` |
| Authentication | jsonwebtoken 9.0.3, Argon2 0.41.1, cookie-parser; application JWT issuer `facetrack-pro` |
| Realtime dependency | Socket.IO server/client 4.8.1; server setup exists, frontend subscription code was NOT FOUND |
| Face path | AWS Rekognition SDK 3.1171.0; MediaPipe tasks-vision 1.2.3 for browser camera analysis |
| Other listed dependency | onnxruntime-node 1.31.1 is installed/listed, but an active ONNX inference path was NOT FOUND in `server/src` |
| Email | Resend 6.38.1 through `sendEmployeeInvitation` |
| Checks | Vitest 5.1.0, Supertest, built-in Node test runner, Vite production build |
| Local runtime observed | Node v24.5.0; npm 11.19.1 |
| Runtime declaration | Root permits Node >=20.19; server requires >=20.19 and <25. Align build/deploy agents to the server constraint; the root range alone is insufficient. |

Database engine/version, Atlas tier, actual cloud runtime version, paid hosting plans and production secret values are **NOT VERIFIED** by this source audit. Mongoose use verifies the MongoDB integration, not its operational configuration.

### Existing data flow

```mermaid
flowchart LR
  Employee[Employee browser] --> SPA[Existing React SPA]
  HR[HR browser] --> SPA
  SPA -->|Axios + session cookie + CSRF| Proxy[Vercel /api rewrite]
  Proxy --> API[Render Express API]
  API --> DB[(MongoDB through Mongoose)]
  API --> Rekognition[AWS Rekognition face comparison]
  API --> Resend[Resend invitation email]
  AW[Separately installed ActivityWatch] -->|Loopback HTTP| Agent[Visible Node sync agent]
  Agent -->|HTTPS + scoped bearer credential| Proxy
  API -. existing Socket.IO server; no monitoring subscriptions .-> SPA
```

The deployment topology is supported by both `vercel.json` files and `docs/deployment.md`. Earlier session deployment verification is historical evidence; no deployment or authenticated cloud inspection was performed for this audit.

## 3. Repository structure and integration points

The complete first-party file listing was enumerated with `rg --files --hidden`, excluding `.git`, dependency directories, generated `client/dist` and secret-file contents. Generated dependencies/build products were identified separately. No `AGENTS.md` or first-party `.github/workflows` configuration was found.

```text
Task3/
  package.json, package-lock.json, .env.example, .gitignore, README.md, vercel.json
  client/
    package.json, vite.config.js, vercel.json, index.html
    tailwind.config.js, postcss.config.js
    src/
      main.jsx, api.js, index.css
      app/App.jsx, app/queryClient.js
      context/AuthContext.jsx
      routes/ProtectedRoute.jsx, routes/EnrollmentRequiredRoute.jsx
      components/{auth,attendance,common,layout,maps,ui}/
      hooks/useAttendanceFlow.js, hooks/useFaceEnrollmentCamera.js
      pages/auth/{LoginPage,RegisterOrganizationPage,AcceptInvitePage}.jsx
      pages/hr/{AdminDashboardPage,EmployeesPage,DepartmentsPage,OfficesPage,AttendancePage,WfhApprovalsPage}.jsx
      pages/employee/{EmployeeDashboardPage,EnrollmentPage,WfhRequestsPage}.jsx
      pages/MonitoringPage.jsx
      services/{authService,hrService,attendanceService,enrollmentService,wfhService}.js
      styles/monitoring.css
      utils/{agent-download,zip,formatters}.js
  server/
    package.json, .env [values not exposed]
    scripts/rotate-jwt-secret.mjs
    src/
      server.js, app.js, models.js
      config/{env,database}.js
      routes/index.js, routes/{organization,session,employee,hr,attendance,monitoring}.routes.js
      controllers/{auth,employee,department,office,wfh,enrollment,attendance,monitoring}.controller.js
      services/{auth,employee,department,office,wfh,email,audit,enrollment,attendance,
                attendance-policy,geofence,face-provider,face-evidence,biometric-crypto,monitoring}.service.js
      models/{MonitoringDevice,ActivityEvent}.js
      middleware/{auth,validate,origin-protection,error-handler}.js
      validators/{auth,common,hr,wfh,enrollment,attendance,monitoring}.schemas.js
      sockets/setup-sockets.js
      utils/{api-error,async-handler,cookies,serializers,time}.js
    tests/ [14 test files, detailed below]
  facetrack-sync-agent/
    index.mjs, activitywatch.mjs, activitywatch.test.mjs, Connect.cmd, Start.cmd
  docs/{architecture,api,deployment,security,activitywatch}.md
```

Every brace-list above expands to existing files/directories observed in discovery. These are existing integration points, not proposed new modules.

| Exact file | Important functions/classes and reuse |
| --- | --- |
| `server/src/app.js` | `createApp`: existing Helmet, CORS, JSON size bound, cookie parsing and CSRF middleware |
| `server/src/routes/index.js` | `createApiRouter`: existing `/api/monitoring` mount alongside attendance and HR |
| `server/src/config/database.js` | `connectDatabase`, `disconnectDatabase`: shared Mongoose connection, 10-second selection timeout |
| `server/src/middleware/auth.js` | `createAuthenticate`, `requireRole`: authenticated actor/organization source |
| `server/src/services/auth.service.js` | `registerOrganization`, `authenticateCredentials`, `authenticateEmployeeCredentials`, `acceptInvitation` |
| `server/src/services/employee.service.js` | `inviteEmployee`, `listEmployees`, `deleteEmployee`, face-replacement authorization |
| `server/src/services/attendance.service.js` | `createAttendanceChallenge`, `verifyAttendanceLocation`, `verifyAttendanceFace`, `checkIn`, `checkOut` |
| `server/src/services/enrollment.service.js` | `resolveFaceAdapter`, `startEnrollment`, `saveEnrollmentCapture`, `completeEnrollment` |
| `server/src/services/face-provider.service.js` | `validateFaceImage`, `compareFaceImages`: actual AWS provider implementation |
| `server/src/services/attendance-policy.service.js` | `normalizeAttendancePolicy`, `assertCheckInAllowed`, `calculateAttendanceSummary` |
| `server/src/services/monitoring.service.js` | `deviceScope`, `createDevice`, `enrollDevice`, `authenticateDevice`, `listDevices`, `heartbeat`, `prepareEvents`, `ingestActivity`, `activityReport` |
| `server/src/controllers/monitoring.controller.js` | Request handlers; existing consent/admin audits; no screenshot handler |
| `server/src/services/audit.service.js` | `writeAudit`: reusable organization/actor event writer |
| `facetrack-sync-agent/activitywatch.mjs` | `localJson`, `readEvents`, `normalizeEvents`, `validateServer`: current collector adapter |
| `facetrack-sync-agent/index.mjs` | `pair`, `preview`, `run`: current visible pairing/synchronization lifecycle |
| `client/src/pages/MonitoringPage.jsx` | `MonitoringPage`, `Ranking`: shared role-aware monitoring screen and ranking bars |
| `client/src/utils/agent-download.js` | `createAgentArchive`, `downloadAgent`: ZIP generation from an explicit file list |
| `client/src/components/layout/{AdminLayout,EmployeeLayout}.jsx` | Existing monitoring navigation; attendance layout remains present |

### Database relationships

**VERIFIED:** Existing models use Mongoose ObjectIds; these are application references, not MongoDB-enforced foreign keys. `server/src/models.js` defines:

| Model | Organization/employee relationships |
| --- | --- |
| `Organization` | Workspace identity, timezone and embedded attendance settings |
| `User` | `organizationId`, HR/Employee role, employee code, department, enrollment and account state |
| `Department`, `Shift`, `Office` | Organization-owned; office has geospatial coordinates/radius |
| `OfficeAssignment` | Organization + employee + office; validity window |
| `WorkFromHomeRequest` | Organization + employee + date/location + reviewer/status |
| `EmployeeInvitation` | Organization + employee + inviter + hashed expiring token |
| `FaceProfile`, `EnrollmentSession` | Organization + employee; encrypted reference/template and staged captures |
| `AttendanceChallenge` | Organization + employee; state, expiry and location/face evidence |
| `VerificationEvent`, `FaceEvidence` | Organization + employee + challenge; FaceEvidence is encrypted camera JPEG data |
| `Attendance` | Organization + employee + office/WFH request + policy snapshot/session timestamps |
| `AuditLog` | Organization + actor + action/entity metadata |
| `MonitoringDevice` | Separate `server/src/models/MonitoringDevice.js`: organization + employee, consent, code/token hashes, status and health |
| `ActivityEvent` | Separate `server/src/models/ActivityEvent.js`: organization + employee + device + source identity/time/data fields |

Notable declared indexes: organization/email and organization/employee-code uniqueness; unique working attendance session; geospatial office/WFH indexes; TTL enrollment/challenge/face-evidence/activity expiry; device token/code partial unique indexes; activity unique `(deviceId,bucketId,sourceId)` and organization/employee/time index. Actual production index completion and MongoDB replica-set topology are **NOT VERIFIED**.

## 4. Current attendance and authentication flows

### Employee and organization onboarding — VERIFIED

1. `registerOrganization` creates an organization and HR account using a Mongoose transaction, hashes a password with Argon2id and signs a JWT. See `auth.service.js` and `organization.routes.js`.
2. HR uses `POST /api/hr/employees/invitations`; `inviteEmployee` creates/updates an invited organization-owned employee, revokes previous pending invitations, stores a random token hash and attempts Resend email delivery. The raw activation link is returned for authorized manual sharing; it is not the persisted database token.
3. `getInvitationPreview` and `acceptInvitation` verify the pending, unexpired token and active organization. Acceptance hashes the chosen password, activates the employee, authorizes enrollment, records biometric consent if supplied, consumes the invitation and establishes the web session.
4. `startEnrollment` / `saveEnrollmentCapture` / `completeEnrollment` collect Front/Left/Right/Up/Down poses. The AWS mode stores an encrypted front-reference image; the browser MediaPipe workflow supplies face/pose quality guidance. HR authorizes requested replacements; it is not automatic face replacement.
5. Monitoring is separate consent: `createDevice` requires the active employee session and `consent: true`; `enrollDevice` atomically exchanges the code for a device credential. Face consent does not imply screenshot or monitoring consent. Monitoring routes are not gated on completed face enrollment.

### Attendance — VERIFIED

`client/src/hooks/useAttendanceFlow.js` and `attendance.service.js` implement: create challenge → request fresh browser geolocation → verify assigned office or approved same-day WFH geofence → compare live face to enrolled reference → consume a single-use face-approved challenge at check-in → create working attendance session → check out and compute policy-based worked/regular/overtime/early-exit minutes. History and policy remain separate from monitoring data.

`FaceCheckModal.jsx` and `useFaceEnrollmentCamera.js` are camera/face UX, not desktop screenshot capture. AWS uses `DetectFacesCommand` and `CompareFacesCommand`. Test/demo adapters are explicitly conditional; liveness/PAD sufficient to resist replay is **NOT FOUND**. The code can enable demo evidence in production via `ALLOW_DEMO_FACE_ADAPTER`; production flag values were not audited.

### Authentication and authorization — VERIFIED

`setAuthCookies` in `utils/cookies.js` issues an HttpOnly access cookie and readable random CSRF cookie, Secure in production, SameSite=Lax, root path, lifetime from `AUTH_COOKIE_HOURS` (default 8). `createOriginProtection` validates origins and requires matching CSRF header/cookie for cookie-authenticated mutations. Axios supplies credentials/XSRF in `client/src/api.js`.

`createAuthenticate` verifies JWT issuer, then reloads the active user and active organization. `requireRole` enforces HR/Employee server-side. Client `ProtectedRoute` and `EnrollmentRequiredRoute` are UX guards rather than security boundaries. Employee login uses employee code + email + password; organization login is HR/workspace-scoped.

Device endpoints use their own opaque bearer credential, SHA-256 hashed on the API, bound to the enrolled employee/organization. `authenticateDevice` checks device state/expiry and active employee/organization on every request. A submitted event cannot override that mapping. No device credential-rotation endpoint, refresh-token flow or MFA implementation was found.

## 5. ActivityWatch compatibility assessment

See [ACTIVITYWATCH_FEASIBILITY_AUDIT.md](ACTIVITYWATCH_FEASIBILITY_AUDIT.md) for the sourced matrix. **VERIFIED locally:** ActivityWatch reports `v0.14.3`, testing=false, and `currentwindow`/`afkstatus` buckets. No browser bucket was returned. This project has no `facetrack-sync-agent/.state.json` at audit time, so live employee pairing on this copy is not established.

`normalizeEvents` currently shares EXE names, optional titles and website **domains only**, discards URL path/query/fragment/user information, excludes browser events marked incognito, and clips into bounded intervals. The schema does not store a full URL. This privacy behavior must not be described as full URL integration.

## 6. Single-EXE feasibility assessment

**VERIFIED:** No `.csproj`, Windows application project, Tauri/Electron configuration, installer project, code-signing/updater pipeline or collector-supervisor implementation was found. The current `.cmd` launchers do not install dependencies or supervise ActivityWatch processes.

**INFERRED:** One `FaceTrackSetup.exe` installing `FaceTrackAgent.exe` plus disclosed collector/runtime files is feasible; a physically single, dependency-free running binary is not established. Preserve the current prototype while a separately approved Windows project is introduced inside this repository.

## 7. Browser URL tracking limitations

**VERIFIED from current integration:** Window events do not supply browser URLs to FaceTrack; web events are normalized to domains. Full URL policy, per-profile enrollment, URL query redaction policy and managed browser deployment are missing.

**INFERRED:** Reliable active-tab URL support should use the approved browser extension on work profiles. A native EXE by itself cannot be promised equivalent coverage. Native messaging still requires browser integration. No browser history scanning or security bypass is proposed.

## 8. Monitoring feature gap matrix

The complete per-feature status, security implications and complexity are in [FACETRACK_MONITORING_GAP_ANALYSIS.md](FACETRACK_MONITORING_GAP_ANALYSIS.md). Core attendance, employee and organization features are implemented and must be preserved. Monitoring is partial; screenshots, classification, configurable organization monitoring policy, credential rotation, managed installation/update/uninstall and robust offline restart recovery are missing.

## 9. Security and licensing assessment

| ID / priority | Evidence and finding | Recommended follow-up; status |
| --- | --- | --- |
| S01 / High | `index.mjs` writes bearer credential in `.state.json`; file mode 0600 does not establish a Windows ACL or encrypt it. | OS-protected credential storage and explicit per-user ACLs. VERIFIED gap. |
| S02 / High | `run` resets the server's `collectAfter` at every new active run and clears cursors when that changes. No durable event outbox exists. | Distinguish a consent epoch from restart and persist retryable payloads transactionally. VERIFIED behavior; loss after outage/restart is INFERRED. |
| S03 / High | `/agent` limiter is 120/minute per IP before authentication; a normal cycle can make status + heartbeat + three bucket uploads. | At 15 devices × 2 cycles/minute × 5 requests ≈150/minute behind one NAT, throttling is plausible. Device-scoped limits plus broader IP/tenant budgets and a shared limiter store are needed. Capacity result is INFERRED, not a load test. |
| S04 / High | Organization settings in `models.js` cover attendance, not a monitoring policy. Monitoring retention is fixed at 30 days; titles are a local pairing flag. | Versioned organization privacy/collection policy enforced at ingestion and capture. VERIFIED gap. |
| S05 / High | No screenshot capture/model/object store/upload authorization/retention worker exists. | Add a separate opt-in subsystem; do not reuse camera-evidence blobs for screenshots. VERIFIED gap. |
| S06 / Medium | Token expiry is 90 days; revocation exists but credential rotation does not. | Add retry-safe rotation with hashed versioned credentials. VERIFIED. |
| S07 / Medium | Admin status changes/consent are audited, but `agentState` and monitoring report reads are not. Audit creation is separate from mutations. | Complete audit coverage and transaction/outbox semantics; define access-read policy. VERIFIED. |
| S08 / Medium | `ingestActivity` relies on a previously authenticated device snapshot. | Pause/revoke can race an already-running upload. Establish an ingestion epoch and explicit in-flight semantics. INFERRED concurrency risk. |
| S09 / Medium | Unique/TTL indexes are declared but no migration/awaited index-readiness procedure is present. | Verify actual indexes before accepting production traffic; TTL is not instantaneous. VERIFIED code; live index state NOT VERIFIED. |
| S10 / Medium | `activityReport` adds durations; application usage includes idle and multiple devices can overlap. It returns top 20 apps/sites and 50 recent records. | Use interval unions/AFK intersections and daily rollups; provide accurate denominators and timeline pagination. VERIFIED semantics, not productivity or payroll time. |
| S11 / Medium | A fixed three-minute finalization delay is used, while local AFK threshold is not negotiated. | Pin collector policy, handle configurable AFK thresholds and late updates. VERIFIED assumption; misclassification risk INFERRED. |
| S12 / Medium | Browser-incognito flag is filtered, but window events do not have reliable profile/incognito identity; opted-in window titles can still reveal sensitive context. | Apply app/title/profile exclusions before local persistence/capture; default minimize. VERIFIED structural limitation. |
| S13 / Medium | `setupSockets` joins org/role rooms; controllers also emit to `user:<id>`, but a corresponding user-room join/client listener was not found. Vercel rewrites only `/api` and SPA paths. | Validate transport/auth/rooms before promising realtime monitoring. VERIFIED gap. |
| S14 / Medium | `checkIn` consumes the challenge before attendance creation; `checkOut` marks completion before the summary update. | Fault-injection tests and transactional recovery, preserving current attendance behavior. VERIFIED ordering; inconsistent partial outcomes INFERRED. |
| S15 / Medium | `encryptionKey` falls back to deriving a biometric key from JWT secret; `secret:rotate` changes JWT alone. | Require an independent versioned biometric key and migration/rotation procedure before relevant deployments. VERIFIED risk path, not proof production uses it. |
| S16 / Medium | `errorHandler` logs original URL and raw error message; production error bodies suppress details. | Structured redaction, especially token-bearing invitation paths. Potential log disclosure is INFERRED; no leaked secret was observed. |
| S17 / Medium | `ALLOW_DEMO_FACE_ADAPTER` can be enabled in production; face evidence is not a proven liveness check. | Deployment verification and explicit demo labeling; do not infer identity assurance from capture completion. VERIFIED capability, production setting NOT VERIFIED. |
| S18 / Low | `docs/api.md` lists retired `/api/auth/*`; README invokes a nonexistent root `seed` script and root `.env` setup. | Correct documentation after approval. Actual routes are below; dotenv is loaded from process cwd (server workspace in normal npm workspace startup). VERIFIED inconsistency. |

Local environment review extracted **key names only**, never values. `server/.env` still contains retired `TEAMLOGGER_*` names and duplicate declaration names; these are not read by the current Zod schema. No cleanup was performed. No runtime TeamLogger implementation remains in `client/src` or `server/src`; historical tests/docs still name the retired provider.

Upstream MPL-2.0 and third-party packaging obligations require a release-specific SBOM. A top-level MPL license is not permission to disregard PyQt/Qt or other transitive licenses; see the feasibility document. Dependency-vulnerability database scanning, penetration testing and jurisdiction-specific legal review were not performed.

## 10. Recommended integration architecture

Reuse `User`, `Organization`, `MonitoringDevice`, `ActivityEvent`, existing RBAC, validation/audit conventions, React layouts and API namespace. Recommend a new per-user Windows desktop project to supervise collectors, store protected credentials and a durable outbox, with private screenshot object storage and only screenshot metadata in MongoDB. Keep monitoring observations separate from attendance decisions.

All new source modules described in the architecture document are **PROPOSED / NOT IMPLEMENTED**. Existing attendance pages and face-reference controls remain authoritative.

## 11. Exact file-by-file change plan

See the existing/proposed/preserve tables in [FACETRACK_MONITORING_ARCHITECTURE.md](FACETRACK_MONITORING_ARCHITECTURE.md). After approval only: create branch `feat/activitywatch-desktop-integration`, verify baseline, then implement protocol/policy → durable sync → desktop/collector packaging → reports/classification → optional screenshots/gallery → pilot hardening. Do not remove the current prototype until replacement acceptance and migration approval.

## 12. Testing strategy

Executed `npm.cmd run check` during this audit: **77 tests in 14 backend/download files passed; 6 Node agent tests passed; Vite production build passed**. Build output: main JS about 737.58 kB (223.46 kB gzip), with a >500 kB chunk warning. No lint/type-check script was found. `server` build is a syntax check of its entry point, not a server bundle.

Existing test files: `app.test.js`, `auth.service.test.js`, `config.test.js`, `employee.service.test.js`, `serializers.test.js`, `office.service.test.js`, `geofence.test.js`, `attendance-location-policy.test.js`, `attendance-policy.service.test.js`, `enrollment-adapter.test.js`, `biometric-crypto.service.test.js`, `email.service.test.js`, `monitoring.test.js`, `monitoring-download.test.js`; plus `facetrack-sync-agent/activitywatch.test.mjs`.

Monitoring database models are mocked in the current HTTP/service tests. There is no live multi-tenant MongoDB acceptance suite, desktop installer test suite, production credential-rotation test, screenshot security test or 1/5/15/50-device benchmark. Passing 83 tests is not evidence those scenarios passed. Add the acceptance/fault matrix in the architecture document after approval.

## 13. Deployment and cost considerations

`vercel.json` and `client/vercel.json` proxy `/api/*` to `https://fasttrack-phn7.onrender.com/api/*`; the web application uses a first-party API origin by default. `client/vite.config.js` proxies local API/socket paths to localhost:4000 unless configured otherwise. `server/src/server.js` opens the API after connecting MongoDB and installs Socket.IO. No Render Blueprint, containers or checked-in CI pipeline were found; deployment settings are documented in `docs/deployment.md` rather than enforced as code.

New screenshot binaries must bypass MongoDB and Render's application filesystem. Hosting tiers, quotas and bills have not been inspected. The priced scenario and sensitivity calculation in the architecture document show that a fully paid Vercel + API + managed database setup is likely above ₹2,000/month even before staffing/code-signing costs. That is an estimate, not a bill or budget promise.

## 14. Unresolved questions and blockers

1. Must the delivered EXE be a single **installer**, or literally the only file installed/running? The latter is not established feasible with separate ActivityWatch collectors.
2. Are machines company-managed, which Windows versions/architectures must be supported, and may approved browser policies be deployed to work profiles?
3. Are domains sufficient, or are URL paths required? What exclusions, capture intervals, screenshot retention, employee visibility and work-session boundaries are approved?
4. Which private storage provider/region, production database/hosting plans and signing/update trust model are approved?
5. Are monitoring and screenshots allowed only within checked-in attendance sessions? Existing monitoring does not enforce attendance coupling.
6. Who will supply consenting pilot accounts and managed test machines? This working copy is not paired, and its local browser watcher was not detected.
7. What measured service objectives and all-inclusive operating budget are accepted?

## 15. Approval checkpoint

**Stopped at audit/design.** Approve or revise Option B and the phased file plan before any implementation branch, schema migration, source-code change, employee enrollment or deployment. The instruction comes directly from the supplied master prompt: “Do not begin implementation until Phases 0–3 are complete and I approve the proposed architecture.”

The pre-existing formatting change in `server/package.json` was left untouched. This audit creates only the four requested Markdown deliverables. Generated ignored build output was refreshed by verification; no existing feature was removed.

## Appendix: verified API inventory

All paths are under `/api`. Route files are the source of truth; handlers use the corresponding controllers/services.

| Source | Actual endpoints and access |
| --- | --- |
| `routes/index.js` | Public `GET /health` |
| `organization.routes.js` | Rate-limited public `POST /organization/login`, `POST /organization/register` |
| `session.routes.js` | `POST /session/logout` idempotent; authenticated `GET /session/me` |
| `employee.routes.js` public | `POST /employee/login`, `GET /employee/invitations/:token`, `POST /employee/invitations/accept` |
| `employee.routes.js` employee | `GET /employee/offices`; `GET,POST /employee/wfh-requests`; `POST /employee/enrollment/start`, `/replacement-request`, `/capture`, `/complete` |
| `hr.routes.js` HR | `GET,POST /hr/departments`; `PATCH /hr/departments/:id`; `GET /hr/employees`; `POST /hr/employees/invitations`; `DELETE /hr/employees/:id/invitations`; `POST,DELETE /hr/employees/:id/face-reenrollment`; `DELETE /hr/employees/:id` |
| `hr.routes.js` HR continued | `GET,POST /hr/offices`; `PATCH /hr/offices/:id`; `POST /hr/offices/:id/assignments`; `GET,PUT /hr/attendance-policy`; `GET /hr/attendance`; `GET /hr/face-evidence`, `/hr/face-evidence/:id`; `GET /hr/wfh-requests`; `PATCH /hr/wfh-requests/:id` |
| `attendance.routes.js` employee | `POST /attendance/challenge`, `/verify-location`, `/verify-face`, `/check-in`, `/check-out`; `GET /attendance/policy`, `/today`, `/history` |
| `monitoring.routes.js` public | `GET /monitoring/info`; rate-limited one-use code exchange `POST /monitoring/enroll` |
| `monitoring.routes.js` session | `GET /monitoring/devices`, `PATCH /monitoring/devices/:id`, `GET /monitoring/report`; Employee-only `POST /monitoring/devices`; HR-only `GET /monitoring/employees` |
| `monitoring.routes.js` device bearer | `GET /monitoring/agent/status`; `POST /monitoring/agent/heartbeat`; `PATCH /monitoring/agent/state`; `POST /monitoring/agent/events` |

No screenshot, productivity-rule, organization monitoring-policy or device-key rotation API was found. The retired TeamLogger provisioning endpoint is absent.
