# FaceTrack monitoring gap analysis

Baseline: commit `4364230`; audit started 2026-11-21. This is Phase 2 documentation. No functionality below is newly implemented by this audit. Source evidence is described in [the repository audit](FACETRACK_EXISTING_SYSTEM_AUDIT.md); upstream feasibility is assessed separately in [the compatibility audit](ACTIVITYWATCH_FEASIBILITY_AUDIT.md).

Status terms: **Implemented** = the inspected source supplies the feature; **Partial** = some behavior exists but does not meet the full requirement; **Missing** = NOT FOUND in the inspected application. These are source findings, not certification of production behavior. Complexity is a relative engineering estimate, not a delivery commitment: Low = bounded extension; Medium = several existing modules; High = new persistence/security/lifecycle subsystem; Very high = new subsystem plus platform/operational validation.

## Required feature matrix

| Requirement | Current verified status and evidence | Refactoring / external dependency | Security and correctness implications | Estimated complexity / priority |
| --- | --- | --- | --- | --- |
| Existing attendance | Implemented: `useAttendanceFlow`; `createAttendanceChallenge`, location/face verification, `checkIn`, `checkOut` | Preserve API and policy behavior; test fault recovery rather than replace | Monitoring records must not mark attendance, change hours or bypass geofence/face checks | Medium regression assurance; preserve |
| Face recognition | Implemented conditional AWS provider; explicit demo/test modes in `face-provider.service.js` / `resolveFaceAdapter` | Preserve Rekognition/reference-image integration; validate runtime configuration | Demo evidence is not identity matching; liveness not established; encrypted camera images are not screenshots | Medium assurance; preserve |
| Employee management | Implemented: `EmployeesPage`, HR routes, invitation and deletion services | Reuse employee IDs, invitation state and face-replacement controls | Employee deletion already purges monitoring metadata/events; future object deletion must be added safely | Low integration / High deletion extension; preserve |
| Organization management | Implemented registration and organization ownership in `models.js` | Extend existing org settings or a one-to-one monitoring policy; do not introduce a second tenant directory | Server derives organization from authenticated actor/device | Medium; preserve |
| Employee device enrollment | Implemented POC: `createDevice`, atomic `enrollDevice`; employee consent; 10-minute code | Add scoped permissions, policy version, device lifecycle and rotation; no enrollment before employee consent | Code is a bearer capability; never put it in URLs, logs or downloaded archives | Medium; pilot blocker for hardened lifecycle |
| Foreground EXE tracking | Implemented POC through `currentwindow` and `normalizeEvents` | External AW watcher; collector supervision and release pinning missing | EXE basename is not a unique trusted binary; inaccessible processes require unknown state | Medium; pilot hardening |
| Application duration | Partial: clipping and app totals in `activityReport` | Intersect with active/authorized intervals and handle device overlap | Current totals include idle and must not be treated as unique work time | High; reporting correctness blocker |
| Active/idle detection | Implemented POC: AFK watcher and `afkstatus` schema | Align collector threshold with server policy; test lock, sleep, RDP and clock transitions | AFK does not establish employee identity; unavailable watcher is not idle | Medium; pilot hardening |
| Window titles | Partial: optional local `--include-titles` | Server-enforced org policy plus on-device redaction/exclusions | Titles can expose documents, secrets or private-browser context | Medium; privacy blocker before enabling |
| Browser URLs | Partial: domain only; full URL field NOT FOUND | Official work-profile extension or approved managed integration; extend normalizer/model only after policy approval | Avoid personal-profile/hidden history collection; default redact user info/query/fragment; unknown when unsupported | High; externally dependent |
| Productive/unproductive app rules | Missing: no rule model, routes or classification service | Add organization-owned versioned rules and deterministic precedence | Classification is policy, not an objective productivity fact; unmatched should be neutral | High; after core reliability |
| Productive/unproductive URL rules | Missing: no browser rule engine | Begin with domains; path rules depend on approved browser data | Do not collect unnecessary URLs just to enable rules; bound pattern complexity | High; after browser-policy approval |
| Automatic screenshots | Missing: no capture worker | New desktop capture component and consent model, private storage/upload workflow | Separate capture permission; reject while paused/revoked; redact/drop before queueing | Very high; separate opt-in milestone |
| Employee online/offline status | Partial: `lastSeenAt`, watcher health, 120-second UI threshold | Distinguish device online, collector health, upload freshness, employee AFK and attendance state | Offline is not employee absence; use server receipt time for heartbeat | Medium; pilot hardening |
| Live activity updates | Partial: 30-second web/agent polling and ~3-minute settling delay | Socket.IO server exists, but monitoring events/subscriptions/production transport do not | Authorize org/user audiences; do not broadcast employee details or screenshot URLs globally | Medium–High; polling accepted only with explicit pilot SLA |
| Daily/weekly reports | Partial: rolling 24/72/168-hour query, top 20 apps/sites | Org-timezone calendar bins, active intersections, rollups and pagination/exports | Current sums overlap across devices/employees; define denominators and unknown time | High; reporting milestone |
| Employee timeline | Partial: 50 most recent records | Chronological bounded pagination, type/employee/device filters and overlap handling | A short recent list is not a complete auditable timeline | Medium; reporting milestone |
| Screenshot gallery | Missing | Extend existing React page/layout; create secure thumbnail/original authorization path | Existing face-evidence viewer must remain separate; audit reads; no public object URLs | High; screenshot milestone |
| Organization monitoring settings | Missing: only attendance settings exist; monitoring retention fixed at 30 days | Versioned policy: collection, schedules, URLs/titles, screenshots, pause, retention, exclusions, quotas | Server and desktop must enforce the same policy revision and fail safely | High; core architecture blocker |
| Multi-organization isolation | Implemented for inspected monitoring scope functions and role guards; operational assurance partial | Extend the same mapping to rules, rollups, screenshots and private objects | Current mock tests do not prove real cross-tenant MongoDB/object-store isolation | High assurance; every milestone |
| Offline synchronization | Partial: persisted cursors and retry upserts; no durable payload queue | Transactional outbox, bounded encrypted image queue, jitter/backoff and deterministic ACK/restart behavior | Current restart resets `collectAfter`; losing unsent observations is possible | High; pilot blocker |
| Secure monitoring permissions | Partial: HR/Employee roles, device bearer, consent and revocation | Add screenshot-specific privileges, rotation, protected local credentials and complete auditing | Device state snapshots permit in-flight pause/revoke races; set an explicit revocation SLA | High; core blocker |

## Additional cross-cutting gaps

| Item | Status / exact evidence | Required decision or change |
| --- | --- | --- |
| One employee installer | Missing; ZIP produced by `createAgentArchive`; launchers only invoke installed Node | Choose installer vs literal single-file requirement; bundle approved collectors/runtime |
| Collector process lifecycle | Missing in `facetrack-sync-agent/index.mjs`; reads a pre-existing loopback server only | Owned process supervision/readiness/backoff/duplicate detection; coexistence with personal AW |
| Protected credentials | Partial; API hashes tokens but local `.state.json` contains plaintext token | Windows DPAPI/current-user vault + ACL; no embedded organization-wide secret |
| Rotation | Missing; `tokenExpiresAt` and permanent revocation only | Retry-safe key version/rotation endpoint, overlap window and lost-response recovery |
| Crash consistency | Partial; atomic JSON rename protects checkpoint file, not a transactional event queue | Local SQLite outbox; ACK advances only a contiguous successfully stored boundary |
| Shared-NAT traffic | Inferred scale risk from 120/minute per-IP `/agent` limiter | Budget by authenticated device and tenant, with broad unauthenticated IP protection |
| Multi-instance API | No shared limiter store or background coordination found | Specify store/worker ownership, idempotent jobs and index migration readiness |
| Local collector isolation | Missing; hardcoded default 127.0.0.1:5600 and discovery of all supported buckets | Dedicated AW profile/port or explicit adoption; allowlist work browser profiles/buckets |
| At-rest data protection | Partial; face encryption exists, monitoring events/local AW data are not app-encrypted | Document DB/volume encryption, endpoint ACLs and threat boundaries; do not claim malware resistance |
| Retention deletion | ActivityEvent TTL exists; no screenshot objects exist yet | Capture-time expiration, immediate read denial, independent object lifecycle + reconciliation |
| Signed update/uninstall | Missing; no native package/updater pipeline | Signed manifest/package, rollback-safe migrations, clean stop/uninstall/revoke flow |
| Build/runtime alignment | Root allows newer Node than server's <25 bound; no CI workflow found | Pin tested server runtime and add approved branch CI after implementation approval |
| Documentation drift | README seed instructions and docs/api auth paths are stale | Correct docs without changing attendance/auth behavior |

## Priority sequence and migration constraints

1. **P0 — approve design:** browser/profile coverage, employee disclosure, screenshot policy, installer interpretation and operating budget.
2. **P1 — reliable activity pilot:** tenant-scoped versioned policy, credential rotation/storage, durable restart-safe outbox, rate limits, dedicated collectors and native visible desktop installation. Retain the current Node prototype as a fallback until acceptance; no silent migration of personal AW history.
3. **P2 — accurate reporting:** active/AFK intersections, device overlap, timezone daily/weekly rollups, neutral classification and complete timeline pagination. Preserve original attendance records and policy calculations.
4. **P3 — optional screenshots:** separate consent, on-device exclusions, private direct uploads, verified metadata, gallery authorization and deletion. Keep disabled if storage, consent or queue protection is unavailable.
5. **P4 — operating readiness:** signed update/uninstall, real multi-tenant integration tests, crash/revocation fault injection, and 1 → 5 → 15-device deployment. A 50-device test is a separate capacity gate, not an extrapolated pass.

No feature should be removed simply because a replacement is proposed. Existing biometric images, attendance history and monitoring credentials require explicit migration handling, and local personal ActivityWatch records are not to be imported without approval.

## Acceptance evidence now vs required later

**VERIFIED now:** the audit's `npm.cmd run check` passes 77 backend/download tests plus 6 agent tests and the production frontend build. Local AW metadata responds and identifies window/AFK watchers. The 1/5/15 pilot, native installer, screenshot uploads, real cross-organization database access, cloud-to-dashboard synchronization for a consenting employee and offline process-restart recovery are **NOT VERIFIED**.

**Required later:** test the actual executable distribution on clean and existing-install Windows machines; use real isolated MongoDB and private object storage test environments; test contradictory tenant IDs, disabled org/employee, credential rotation/revocation, replay/duplicate/out-of-order events, network partitions, disk full, clock skew, daylight-saving/calendar boundaries, collector crashes, RDP/lock/sleep and loss of capture permission. Record measurable acceptance thresholds rather than a generic “all tests passed.”

## Decision gate

This gap analysis authorizes no implementation. The proposed solution and file plan are in [FACETRACK_MONITORING_ARCHITECTURE.md](FACETRACK_MONITORING_ARCHITECTURE.md). Approval is required before branching, adding desktop code, changing schemas, capturing screenshots or deploying further monitoring changes.
