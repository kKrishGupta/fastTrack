# Official ActivityWatch product integration

Implementation status: 2026-11-22. FaceTrack reuses the **official unmodified ActivityWatch v0.14.3 Windows x64 distribution** and the existing Node synchronization bridge. The .NET desktop component provides status, enrollment, lifecycle controls and the separately consented screenshot adapter; it does not replace ActivityWatch foreground-window or AFK collection. Face attendance, AWS Rekognition, employee/organization management and login contracts are preserved.

## Product boundary

`FaceTrackSetup.exe` installs official ActivityWatch files, official Node v24.22.3, the FaceTrack bridge and a self-contained FaceTrack status/tray application. It is one installation with multiple hidden internal processes. The employee uses a graphical wizard and desktop UI, with no terminal or separate runtime installation. An unsigned internal-test installer is compiled and isolated-install tested; signing and clean-VM acceptance are not verified. Do not publish it to customers until those checks and the redistribution checklist pass.

The pinned archive URLs, SHA-256 hashes and ActivityWatch submodule commits are in `installer/dependencies.lock.json`. Both downloaded archives were hash-verified. The official binaries' `--help` confirmed `aw-qt --profile`, `--no-gui`, explicit modules and watcher/server options. Full upstream archives are retained rather than extracting/rebranding selected collector code. Runtime libraries are bundled; employees need no separate Node/Python installation.

## Build and install

Developer prerequisites: Node 24 LTS, .NET 8 SDK, Windows x64, NSIS 3.13, a reviewed release license/source inventory and a code-signing process before production distribution. The earlier Inno source is retained for history, but current Inno releases request a commercial license; the reproducible build uses permissively licensed NSIS.

```powershell
npm.cmd ci
npm.cmd run check
node installer/build.mjs --server https://fasttrack-phn7.onrender.com --stage-only
# After source changes, refresh only the bridge after validating the existing stage:
node installer/build.mjs --server https://fasttrack-phn7.onrender.com --refresh-bridge --stage-only
# Unsigned internal QA artifact:
node installer/build.mjs --server https://fasttrack-phn7.onrender.com --compile-only --nsis --internal-test-build
# Commercial release only after the release dependency/source checklist is complete:
node installer/build.mjs --server https://fasttrack-phn7.onrender.com --compile-only --nsis --redistribution-reviewed
```

The first staging command deliberately requires a fresh `installer/stage`; it does not delete or overwrite an existing distribution. `--refresh-bridge` first checks the old staged inventory. Archives must match the committed pins. The .NET shell is published as one self-contained EXE and actual .NET license/third-party notice files are staged. Build cache, binaries and output are ignored by Git. Output is `installer/output/FaceTrackSetup.exe`. `--internal-test-build` explicitly creates an unsigned QA artifact. `--redistribution-reviewed` is a release assertion, not an automatic license audit or waiver. No signing certificate is embedded. Sign the final installer with your organization's release certificate; publish its hash and notices alongside it.

The Node build entry avoids requiring script-file execution in PowerShell; it invokes the standard archive extraction cmdlet without changing execution policy. The current PC blocks `.ps1` script files, so no PowerShell policy was changed.

Install as the participating employee. Start-on-login is optional and unchecked by default. Open **GrabLogger**. Before collectors start, an unpaired install asks inside the graphical app for the one-use code generated from Employee → Activity monitoring after disclosure/consent. No password or organization-wide key is installed. The window and tray icon show connection state and provide Pause uploads, Resume uploads, Stop monitoring, Start monitoring and Disconnect device. Closing the window leaves the visible tray indicator running; Exit stops the package-owned process tree. Internal Node/ActivityWatch consoles are hidden.

## Official component configuration and ownership

The package uses `AW_PROFILE=facetrack`, loopback `127.0.0.1:5600` and a separate `activitywatch-facetrack` platform directory. Port 5600 is required by the official browser watcher. The launcher refuses to start if it is occupied and never adopts or modifies another ActivityWatch instance. On the verified Windows platformdirs layout, data/config live under `%LOCALAPPDATA%\activitywatch-facetrack\activitywatch-facetrack`. Exact component TOML is in `facetrack-sync-agent/profile-config.mjs`. The classic Qt manager is reused in `--no-gui` mode; only `aw-server`, `aw-watcher-window` and `aw-watcher-afk` are enabled. The input watcher is **not** enabled. Window titles are excluded at the source in this unified package.

The launcher refuses an occupied port instead of adopting a personal server. It uses an exclusive launcher lock, checks the installed file inventory, starts the official manager, waits for local readiness, checks watcher freshness and restarts its own process tree with bounded backoff after repeated collector failures. It never kills an unrelated personal ActivityWatch process. The desktop shell is single-instance per Windows user and its local control pipe is restricted to the current user. Plain manifest hashes detect accidental changes; they do not replace signed installer/update authenticity. Reboot, abrupt process kills and full uninstall/update behavior still require the clean-machine pilot.

## Durable synchronization and privacy

The bridge reads the official REST API's buckets/events, keeps official event types, clips settled intervals and splits saturated queries. It adds no collector. Local SQLite outbox rows contain AES-256-GCM-encrypted payloads; staging events and advancing the read checkpoint happen in one transaction with FULL synchronous WAL. The AES key and device secret are protected by Windows current-user DPAPI. Package state is `%LOCALAPPDATA%\FaceTrack\Monitoring`; restrict this directory to its owner on shared machines. DPAPI does not protect against malware running as that user. Non-Windows development retains POSIX-restricted JSON state and is not the Windows production package.

Restarts preserve the collection boundary. Only explicit server resume/consent-boundary changes reset it; old-epoch queued windows are discarded with a visible message. Full server acknowledgment is required before removing a queued window; duplicate retries keep stable source identities and the existing MongoDB unique upsert key. Partial success can replay already accepted records safely. Retry uses exponential backoff/jitter and Retry-After. A clock difference greater than one minute stops synchronization rather than rewriting source timestamps.

Queue payload budget is 100 MiB and queued windows expire after 72 hours with a message. This is a payload budget, not a guaranteed total SQLite/WAL disk ceiling. Queue-full pauses polling without advancing the checkpoint, then drains on recovery. While the network is down, official ActivityWatch continues its own local database; on reconnection the bridge catches up from its persisted checkpoint. It does **not** claim to poll into the FaceTrack outbox while unable to refresh server authorization. ActivityWatch source retention and available disk determine recovery from long outages. A source DB deleted before polling cannot be reconstructed.

Policy filtering occurs before queueing and again before upload/server persistence. Browser sharing and titles default off. EXE/domain exclusions apply. Browser captions are always removed by the bridge because the window watcher cannot reliably identify private/personal profiles. A running or in-flight HTTP request can finish during pause/revoke; subsequent requests are rejected. Employee pause and HR hold are separate; neither actor's resume overrides the other's pause. Legacy paused devices without actor flags require an explicitly reviewed migration before rollout.

## Browser integration

Use the official, store-signed [ActivityWatch Web Watcher v0.6.0](https://github.com/ActivityWatch/aw-watcher-web/releases/tag/v0.6.0) only in separately authorized Chrome or Edge work profiles. The extension is not silently installed. Its released client targets ActivityWatch on port 5600. FaceTrack defaults to domain-only sharing. URL origin/path/query detail and page titles require organization policy plus device-level browser-details consent; fragments, credentialed URLs, non-HTTP URLs and incognito events are discarded.

IT must establish that a bucket contains only authorized work-profile data before adding its exact ID to `approvedBrowserBuckets`. Official v0.6.0 does not label Chrome/Edge profiles separately and profiles can share a bucket, so install it only in the approved work profile and keep browser sharing disabled when provenance is ambiguous. Application/AFK sharing works independently. Personal browser history is never scanned.

The bridge reports detected `web.tab.current` bucket IDs in its authenticated device heartbeat. HR sees these as **candidate** bucket IDs beside the device and can paste a separately verified work-profile ID into organization policy. Detection never enables browser collection or proves profile ownership automatically.

## Dashboard and API

Existing `/api/monitoring` endpoints retain their names/contracts. `/info` adds capability metadata and an optional `installerUrl`. The customer flow offers only the unified graphical installer; command-line files remain developer diagnostics. After compiling, signing and testing a release, set `MONITORING_INSTALLER_URL` on the server to its bare HTTPS download URL. Never point it at a missing or unverified installer. Deploy frontend and backend together only with deployment approval; this task does not deploy them.

Additional session APIs: `GET,PUT /policy` (PUT HR only), `GET,POST /rules` (POST HR only), `DELETE /rules/:id` (HR), `GET /summary`, `GET /timeline`, `GET /screenshots`, and `GET /screenshots/:id/view`. Agent APIs add screenshot upload request/completion, credential rotation and self-revocation. Screenshot view-link issuance is tenant-scoped and audited. Policy uses compare-and-swap revisions.

New reports union simultaneous devices per employee, intersect app context with non-AFK observations, label conflicting contexts unknown, optionally require actual attendance intervals and group days in the organization's timezone. App/domain observations never change payroll/attendance. The original raw-duration reports remain labeled separately. A summary is bounded to 100,000 events; select one employee/shorter period above that limit. History uses keyset pagination. Calendar-day bins are provided within a selected rolling period, not a separate payroll/calendar-week system.

The coarse agent IP limit is 3,000/minute, followed by 600/minute per authenticated device. These are per-process memory counters, not a distributed quota system. Test common-NAT and outage catch-up before 15-device rollout. Startup explicitly creates and awaits declared monitoring indexes before listening, including when automatic indexing is disabled. The database identity needs index-creation permission, and existing duplicates must be resolved before readiness.

## Uninstall and recovery

Uninstall first asks the desktop shell to stop its owned process tree and attempts device self-revocation. If offline, revoke the device from the employee dashboard. It removes FaceTrack credentials, encrypted activity/screenshot queues, program files, shortcuts, registration and optional login entry. It separately asks whether to delete dedicated FaceTrack-managed ActivityWatch history; silent uninstall defaults to retaining it. The default personal ActivityWatch profile is never removed. Isolated silent install, manifest validation and full silent uninstall passed; GUI/reboot testing still requires a clean VM.

## Validation and release blockers

### Separate screenshot capability

Screenshots are disabled unless all three server-only Cloudinary credentials are configured. The employee must separately consent during device enrollment and HR must enable a 60-3600 second interval, 1-30 day retention, display scope and application exclusions. The adapter refuses the locked/secure desktop, checks excluded foreground apps before and after capture, streams PNG bytes directly into an AES-256-GCM offline queue, and never writes screenshot bytes into MongoDB or face evidence. The agent uploads the PNG through its authenticated FaceTrack API connection. The backend rechecks tenant, device, consent, policy, optional attendance session and capture interval, then validates PNG signature, exact length and SHA-256 before creating an authenticated Cloudinary asset. Cloudinary credentials are never returned to the agent or browser. Signed gallery delivery links last one minute, issuance is tenant-scoped and audited, and the retention job destroys expired Cloudinary assets before deleting metadata.

Automated tests cover checkpoint persistence, encrypted outbox reopen, failed/partial ACK retry, quota behavior, DPAPI test-state roundtrip, policy filtering, normalization, HTTP ingestion, tenant-scoped query construction, role guards, rotation conflicts, interval calculations and employee dashboard rendering. MongoDB is mocked in the HTTP/service suites; these are not a real multi-tenant database penetration test. Local official v0.14.3 window/AFK metadata was reachable; no browser bucket was detected. No employee credential, actual activity payload or production secret was printed.

Before production: Authenticode signing, release-specific dependency/SBOM/source compliance, clean-machine GUI/reboot testing, actual consenting employee pairing, real isolated-MongoDB/S3 tenant tests and a measured 1 → 5 → 15 pilot. No monthly cost or end-to-end production success is promised. See [screenshot evaluation](screenshot-components.md).
