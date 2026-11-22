
# ActivityWatch feasibility and compatibility audit

Date: 2026-11-21. This is Phase 1 research, not an implementation or redistribution approval. Repository baseline: `4364230`. Evidence labels follow [the repository audit](FACETRACK_EXISTING_SYSTEM_AUDIT.md).

## 1. Verified baseline and evidence boundaries

**VERIFIED locally:** `GET http://127.0.0.1:5600/api/0/info` reports ActivityWatch `v0.14.3`, testing=false. Bucket metadata contains `currentwindow` and `afkstatus`; no `web.tab.current` bucket was present. The FaceTrack working copy has no `.state.json`, so no current employee enrollment was established by this audit.

The official downloads page advertises Windows installers/ZIPs and Linux/macOS distributions. Upstream has both classic and newer Tauri-related components. This audit examines current documentation and named source files, which may contain changes newer than a pinned release. A release-specific binary manifest, commit-pinned submodules, checksums, signatures, supported Windows matrix and complete dependency SBOM remain **NOT VERIFIED**. Do not ship a moving `master` branch as a production dependency. [Official downloads](https://activitywatch.net/downloads/), [upstream changelog](https://docs.activitywatch.net/en/latest/changelog.html).

## 2. Feature compatibility matrix

| Requirement | Upstream evidence / limitation | Actual FaceTrack integration | Assessment |
| --- | --- | --- | --- |
| Foreground app / EXE | Windows helper uses foreground-window handle and process lookup, with WMI fallback | `normalizeEvents` persists `data.app` as `app` | VERIFIED, suitable foundation; benchmark edge cases |
| Executable identifier/path | Helper can retrieve a path, but emitted/event fields are a separate contract | FaceTrack retains app name, not full executable path/hash/signature | Partial; EXE basename is not a unique signed application identity |
| Window title | Window helper reads caption text | Optional `--include-titles`; default off | Implemented opt-in; policy/exclusions incomplete |
| Start/end and duration | Events provide timestamp and duration; end is derived | Agent clips segments; API validates and stores them | Implemented, approximate observations rather than payroll proof |
| Idle/AFK | AFK watcher observes input inactivity | `afk` / `not-afk` accepted | Implemented; not employee identity or productivity |
| Full browser URL/title | Official web extension observes active-tab properties | Domain only; no browser title/URL persistence | Full URL requirement is not implemented |
| Chrome / Edge | Official browser watcher supports Chromium browsers | Works only once extension supplies buckets | External integration required; validate stores/policies/profile behavior |
| Browser profiles | Browser extension is profile-installed; work vs personal routing must be defined | Agent discovers all supported local buckets without a work-profile allowlist | Needs refactoring and explicit profile approval |
| Screenshots | Capture API/component NOT FOUND in the inspected standard collectors/API/features | No screenshot component | Separate FaceTrack subsystem required |
| Cross-device cloud SaaS tenancy | Local collectors/API are not FaceTrack employee/org auth | Existing custom HTTPS bridge supplies tenancy | Reuse FaceTrack identity; do not expose AW remotely |
| One installer | Upstream distributes packaged modules; this does not merge them into one process | ZIP + Node + separately installed ActivityWatch | Requirement not satisfied today |
| Offline/restart durability | Local event storage can supply retry source data | Cursors exist, but no durable payload outbox; restart resets collection boundary | Existing bridge requires redesign |
| Categorization | ActivityWatch exposes its own categorization features | FaceTrack has no tenant rule model or classification computation | Do not assume upstream UI categories populate FaceTrack |

Foreground behavior is supported by [Windows helper source](https://raw.githubusercontent.com/ActivityWatch/aw-watcher-window/master/aw_watcher_window/windows.py). Platform coverage and the standard AFK default are described in [watcher documentation](https://docs.activitywatch.net/en/latest/watchers.html). FaceTrack's behavior is verified in `facetrack-sync-agent/activitywatch.mjs`, `server/src/validators/monitoring.schemas.js`, and `server/src/models/ActivityEvent.js`.

### Application accuracy limits

**INFERRED:** Polling can miss very short focus switches; captions may be empty, stale or sensitive; elevated applications/UWP containers/remote desktop/lock transitions require testing. EXE names can collide or be spoofed. Input inactivity is an availability observation, not proof of attention. Separate machines and browser profiles can overlap. Full executable paths may reveal usernames, so adding them requires a specific need and disclosure.

FaceTrack currently sums recorded duration rather than intersecting app intervals with non-AFK attendance intervals. Thus its app ranking cannot be labeled productive time or attendance hours. This conclusion comes from `activityReport` and the agent normalizer, not from an upstream marketing claim.

## 3. Browser URL tracking: supported path and restrictions

The official `aw-watcher-web` README identifies active-tab title, URL, audible and incognito properties. It explicitly distinguishes these from ordinary desktop window titles. The inspected Windows helper exposes app/window information, not a complete active-tab URL collector. Some current general documentation discusses URLs on other strategies/platforms; that is not evidence of reliable standard Windows coverage. [Official web watcher](https://raw.githubusercontent.com/ActivityWatch/aw-watcher-web/master/README.md).

**Conclusion:** Do not promise full URL tracking from one Windows EXE with no browser integration. An approved extension is the supported primary solution. UI-address-bar scraping may work for particular browser builds but was not validated and is not an acceptable reliability guarantee. Window captions do not reliably encode full URLs. Browser history scanning is neither proposed nor an equivalent active-tab signal.

Chrome native messaging allows an extension to communicate with a registered native host. It does not give a standalone host access to tabs. The official ActivityWatch web watcher currently communicates with its local ActivityWatch endpoint; native messaging would be a **new FaceTrack integration**, not an existing capability to assume. [Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging).

For company-managed machines, IT may deploy approved extensions through browser enterprise policy. Edge's policy has management/store restrictions, including restrictions on non-domain-joined Windows machines. The EXE installer must not silently bypass browser permissions or change security settings. For unmanaged machines, use an explicit extension setup step. [Edge extension policy](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/ExtensionInstallForcelist).

Proposed browser acceptance matrix: Chrome and Edge, each with one and multiple profiles; focused vs background/minimized windows; audio/video tabs; navigations within single-page apps; work vs personal profiles; extension disabled/reinstalled; private browsing; restart; offline; internal browser pages and extension-store restrictions. Unsupported/private contexts should produce **unknown/excluded**, never fabricated URLs. Do not claim private-profile detection from window titles.

Full URLs, if separately approved, should default to origin + normalized path with user info, query and fragment removed; finer query/path collection requires an explicit allowlist. Exclusion must happen on-device before queueing. The current `incognito` filter only protects marked browser events; it does not automatically redact incognito window captions or screenshots.

## 4. Local API and synchronization compatibility

The REST contract exposes `/api/0/info`, `/buckets/`, bucket event reads and heartbeat writes. Events use RFC3339 timestamps and seconds; event reads accept `start`, `end`, `limit` and return newest first. There is no documented offset cursor to assume. Bound time windows and splitting saturated reads are preferable to a fixed newest-N request that silently drops older records. API error bodies differ between Python and Rust implementations. [REST reference](https://docs.activitywatch.net/en/latest/api/rest.html).

The data model uses typed buckets and timestamp/duration events. Heartbeats merge compatible observations, so duration of an event can grow. Preserve source identity and handle settled/late updates instead of assuming every event is immutable. [Bucket/event model](https://docs.activitywatch.net/en/latest/buckets-and-events.html).

### Mapping into this repository — VERIFIED

| Local data | Current cloud mapping |
| --- | --- |
| `currentwindow` | `ActivityEvent.type`, `app`, optional `title` |
| `afkstatus` | `status` constrained to `afk` / `not-afk` |
| `web.tab.current` | `domain` extracted from HTTP(S) URL; other URL parts removed |
| Bucket/event identity | Source ID combines event ID and segment start; unique device/bucket/source index |
| Time range | <=300-second segments; <=500 events per upload; three-minute settling delay |
| Retry | `readEvents` splits 501-record saturated queries; server upserts; successful cursor writes are serialized and renamed atomically |

`readEvents` is a useful reusable adapter, but the current source does not provide a crash-safe payload queue. A terminal restart advances the consent boundary and can discard pending data. A fixed three-minute delay is also not sufficient for every possible AFK configuration or clock-skew condition. These are FaceTrack limitations, not verified ActivityWatch defects.

### Network/authentication boundary

ActivityWatch's default local API is unauthenticated and accessible to local processes. Current documentation describes optional API-key authentication for `aw-server-rust`, not Python `aw-server`; client/watcher compatibility must be checked before enabling it. It is still HTTP and is not suitable for direct public exposure. Use the FaceTrack HTTPS API for cloud communication. [ActivityWatch security](https://docs.activitywatch.net/en/latest/security.html).

Local SQLite data/config/log directories are component-specific. Documentation now describes named profiles (`AW_PROFILE` / launcher profile), but profile separation does not automatically avoid a port collision; profile server/client configuration must use an appropriate loopback port. Verify these options against the selected release. Prefer a dedicated FaceTrack profile rather than silently adopting an employee's existing personal ActivityWatch datastore. [Directories and profiles](https://docs.activitywatch.net/en/latest/directories.html).

## 5. Screenshot feasibility and proposed separate component

**NOT FOUND:** A native screenshot collector/API in the standard ActivityWatch features, inspected component bundle or this FaceTrack repository. Community extensions may exist; none was assessed or selected. The current screenshots mentioned in FaceTrack are neither a screen-capture feature nor a screenshot gallery: `FaceEvidence` stores camera verification images. [Core features](https://docs.activitywatch.net/en/latest/features.html), [bundle composition](https://raw.githubusercontent.com/ActivityWatch/activitywatch/master/.gitmodules).

**PROPOSED, subject to approval:** a FaceTrack Windows screen-capture service in the employee's interactive desktop session. Prefer a supported Windows capture API with explicit display/window selection and visible state. Windows Graphics Capture provides a system picker; validate desktop framework interop, HDR, multiple monitors and locked/protected surfaces on the selected Windows baseline. [Microsoft capture documentation](https://learn.microsoft.com/en-us/windows/apps/develop/media-authoring-processing/screen-capture).

| Control | Proposed behavior |
| --- | --- |
| Enablement | Off by default; organization policy plus a separate versioned employee screenshot disclosure/consent |
| Interval | Configurable bounded value, initially propose 5 minutes for a consenting pilot; no capture if policy unavailable/stale |
| Visible state | Tray/window indicator, last capture/upload, current exclusions and pause controls; no hidden mode |
| Permissions | Select authorized screens/windows and handle OS capture denial; do not assume every capture API automatically prompts |
| Privacy | Work-session-only option; excluded apps/sites; drop rather than upload when redaction cannot be guaranteed; no secure desktop/lock/private-profile capture |
| Queue | Encrypted local image files with transactional SQLite metadata, size/age limits, retry/expiry and delete-on-policy-revocation rules |
| Upload | Device-bound, short-lived upload authorization; backend-generated private key, content-type/size/checksum constraints, verification before publishing metadata |
| Storage | Private object storage; MongoDB contains metadata and authorization context only |
| Access | HR limited to its organization and approved scope; employee access policy explicit; audit view/download actions; short-lived authorized reads, no public gallery URLs |
| Retention | Server-enforced expiry plus object lifecycle/deletion/reconciliation; MongoDB TTL alone cannot delete image objects |

No screenshots were captured or uploaded during this audit.

## 6. Packaging, lifecycle and redistribution

Upstream's PyInstaller specification builds and collects separate components with native dependencies; it is not a recipe that combines everything into a dependency-free executable. The source-build guide lists Python/Poetry, UI Node tooling, optional Rust components and Windows packaging tools, including Inno Setup. These are build prerequisites; a properly built distribution can bundle runtimes so employees need not install build tools. [Build specification](https://raw.githubusercontent.com/ActivityWatch/activitywatch/master/aw.spec), [source-build guide](https://docs.activitywatch.net/en/latest/installing-from-source.html).

A FaceTrack installer should pin collector hashes, create a dedicated profile/config/loopback port, run as the signed-in employee, supervise only processes it owns, implement backoff/readiness checks and avoid starting duplicates. Existing ActivityWatch installs require explicit coexistence/adoption choice. Clean uninstall must stop owned children, revoke the device when online, handle offline revocation instructions, and apply approved local-data deletion policy. Signed update manifests and rollback must not overwrite pending outbox data.

### License evidence and limits

Inspected upstream license files identify **MPL-2.0** for the main repository and the named collectors/server/web watcher. This is not a claim that every bundled runtime/dependency has that license. Sources: [root license](https://raw.githubusercontent.com/ActivityWatch/activitywatch/master/LICENSE.txt), [window watcher](https://raw.githubusercontent.com/ActivityWatch/aw-watcher-window/master/LICENSE.txt), [AFK watcher](https://raw.githubusercontent.com/ActivityWatch/aw-watcher-afk/master/LICENSE.txt), [Python server](https://raw.githubusercontent.com/ActivityWatch/aw-server/master/LICENSE.txt), [web extension](https://raw.githubusercontent.com/ActivityWatch/aw-watcher-web/master/LICENSE).

MPL-covered files/notices and source availability obligations must be handled when distributing binaries or modifications; a separately authored FaceTrack application is not automatically relicensed merely by adjacent packaging. Final distribution terms still need review of the actual combination. The root license does not grant unrestricted trademark rights. This is an engineering compliance checklist, not a legal determination.

`aw-qt` declares PyQt6 dependencies. Riverbank's official licensing guidance distinguishes GPL and commercial PyQt licensing. Do not assume that the launcher is unrestricted because `aw-qt` itself declares MPL. Prefer evaluating minimal collector components without copying the Qt tray application, while still inventorying all transitive dependencies. [aw-qt manifest](https://raw.githubusercontent.com/ActivityWatch/aw-qt/master/pyproject.toml), [PyQt license FAQ](https://riverbankcomputing.com/commercial/license-faq).

Before redistribution: create a pinned component/SBOM manifest; preserve notices; provide corresponding covered-source access; review Python/Rust/native/installer/runtime licenses; verify original signatures/hashes; sign FaceTrack's own packages; publish update provenance. Exact release dependency licenses, code-signing certificate price and redistribution packaging have not yet been validated.

## 7. Feasibility decision

**Application/AFK foundation:** feasible and partly integrated. **Full URLs:** conditional on approved browser integration and profile/privacy rules. **Screenshots:** separate, presently absent. **One EXE download that installs a unified product:** feasible design candidate. **One file with no auxiliary processes or browser dependencies:** not demonstrated and must not be promised.

Proceed only after the architecture and privacy/packaging decisions in [FACETRACK_MONITORING_ARCHITECTURE.md](FACETRACK_MONITORING_ARCHITECTURE.md) are approved. Unavailable candidate source paths (an installer filename and web background filename) were not used as evidence; the verified build spec, license files and official API documentation were used instead. No binary installer was built or tested in this phase.
