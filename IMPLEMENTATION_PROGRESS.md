# FaceTrack ActivityWatch integration - implementation status

Updated 2026-11-22 (Asia/Calcutta). The working tree continues the FaceTrack product and installer repair to v1.2.1. Existing attendance, face recognition, authentication, organization and employee management remain in place.

## Implemented

- Official unmodified ActivityWatch v0.14.3 Windows distribution, Node v24.22.3 bridge, separate `facetrack` data profile, visible .NET tray/enrollment controls and the hardened NSIS installer pipeline.
- ActivityWatch remains the only application/window and AFK collector. The bridge uses its REST API, event types and local database.
- DPAPI-protected device state, AES-256-GCM SQLite activity outbox, durable checkpoints, retry/backoff, stable deduplication identities, pause/HR hold/revocation, device health and policy filtering.
- Organization-scoped dashboard reports, daily summaries, timeline, productivity rules and active/AFK interpretation that does not alter attendance or payroll.
- Official ActivityWatch Web Watcher v0.6.0 guided Chrome/Edge work-profile setup, candidate-bucket diagnostics and exact HR approval. Port 5600 is used because the released extension has no custom-port setting. FaceTrack refuses an occupied port instead of adopting another ActivityWatch instance.
- Browser domain, origin, path, full URL-with-query and page-title policy modes. Domain-only is the default. URL/title modes require separate device consent; fragments, credentialed/non-HTTP URLs and incognito events are rejected.
- Separate screenshot capability in the existing desktop shell, disabled by default. It requires private Cloudinary storage, separate employee consent and HR policy. It skips the locked desktop and excluded foreground apps, supports primary/all displays, compresses captures to JPEG files no larger than 30 KB without a plaintext temp file, and uses an encrypted 72-hour offline queue.
- Screenshot uploads pass through the authenticated FaceTrack API. The backend verifies JPEG signature, 30 KB limit, byte length and SHA-256 metadata before accepting a private authenticated Cloudinary asset. MongoDB stores metadata only. Gallery URLs expire after one minute and are tenant-scoped. Retention deletion retries hourly.
- Silent uninstall now defaults to retaining dedicated ActivityWatch history and removes encrypted screenshot queues with other FaceTrack state.
- Installer repair (v1.2.1): Pruned 66 debug source maps saving ~3.3 MB; non-solid zlib compression prevents temp exhaustion; preflight disk space checks require 900 MB shared (650 MB install + 250 MB temp separate) returning error 112 on exhaustion; atomic staged installation verifies 3,362 payload hashes before committing; rollback on abort or failure preserves existing installations.

## Validation completed

- `npm.cmd run check`: **Backend, dashboard, agent, installer unit tests and Vite production build passed**.
- .NET Release build: zero warnings and zero errors.
- Installer stage: 3,362 files in the verified manifest, with debug source maps pruned.
- Final rebuilt internal artifact: `installer/output/FaceTrackSetup.exe`, FaceTrack Monitoring **1.2.1**, **185,387,850 bytes**, SHA-256 **`293DAF41AFC4839F33403BECEAEB1E192DD38606E719901FA6C21BF64567AB43`**, Authenticode **NotSigned**.
- Screenshot compression verification: a generated 1920×1080 desktop capture encoded to **30,458 bytes (29.7 KB), 640×360 JPEG**; server rejects new JPEG captures above 30 KB and the gallery displays the stored size and limit.
- Isolated silent fresh install returned 0; all 3,362 installed payload hashes matched; upgrade from previous install returned 0; preflight disk-space check verified error 112 abort.
- Desktop process launches cleanly (`FaceTrackMonitoring.exe --shutdown` returned 0).
- Normal silent uninstall removes the program directory, registration, shortcuts and preserves user data by default.

## Commercial release blockers

- No accessible Windows Sandbox or Hyper-V tooling exists on this PC. Clean-VM GUI install, reboot/login, crash/forced-close recovery and interactive uninstall are unverified.
- No real consenting employee pairing through deployed API -> MongoDB -> HR dashboard was performed.
- No real private bucket was supplied, so live upload/view/retention and cross-tenant object denial are unverified.
- The official extension was not installed into a real approved Chrome/Edge work profile. v0.6.0 cannot distinguish multiple browser profiles sharing the same bucket; ambiguous buckets must remain disabled.
- Authenticode signing, signed updates, final SBOM/corresponding-source/license review, and a measured 1 -> 5 -> 15 employee pilot remain open.
- CPU, memory, bandwidth and storage measurements are not available.
- Credential rotation exists server-side but is not automated by the bridge. In-memory API rate limits are not distributed across server instances.

No production deployment, Git push, real employee enrollment, browser-extension installation, screenshot capture or production secret modification occurred. The EXE is an unsigned internal-test artifact and is **not commercially ready**.

See [product integration](docs/activitywatch-product-integration.md), [validation evidence](docs/monitoring-validation.md), [employee guide](docs/employee-monitoring-installation.md), [HR guide](docs/hr-monitoring-guide.md) and [screenshot evaluation](docs/screenshot-components.md).
