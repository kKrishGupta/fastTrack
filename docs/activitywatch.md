# ActivityWatch integration

This integration adds employee-consented device enrollment, a visible Node.js sync agent, and HR/employee activity views. It does not deploy itself or change server secrets. Screenshot capture is outside this version.

ActivityWatch replaces the previous TeamLogger integration. Employee activation no longer contacts TeamLogger, its provisioning endpoint has been removed, and any remaining `TEAMLOGGER_*` environment variables are ignored. HR can open an employee's filtered report from **Employees > View activity** or **Manage > View ActivityWatch activity**. Device pairing still requires the employee's consent in their own workspace.

## Start FaceTrack

Use the existing MongoDB and API configuration. No new environment variables or third-party credentials are required. From the repository root:

```powershell
npm.cmd run check
npm.cmd run dev
```

For a production frontend build, run `npm.cmd run build`. Serve `client/dist` using the existing frontend hosting configuration and deploy the API using its existing process. Both components need the new code for monitoring to work. The API creates the monitoring collections and indexes through Mongoose's normal index setup; ensure production indexes are built before enrolling devices if automatic indexing is disabled.

## Pair a test computer

The deployed dashboard provides a **Download Windows agent** button in **Activity monitoring** for both roles. The ZIP contains six files: the two JavaScript modules, `Connect.cmd`, `Start.cmd`, `README.txt`, and a `connection.json` pointing to the current FaceTrack server. It contains no employee code, credential or `.env` file. Extract all files to a private folder. With ActivityWatch and Node.js 20.19+ installed, create a pairing code from the employee workspace and open `Connect.cmd`; it pairs and immediately starts the visible agent. Open `Start.cmd` on subsequent days. A full repository checkout and npm installation are not required for this download.

For developers using the repository, the equivalent commands are below.

1. Install and launch [ActivityWatch](https://activitywatch.net/downloads/). Confirm `http://localhost:5600` opens locally.
2. For website domains, install the official [browser watcher](https://docs.activitywatch.net/en/latest/watchers.html). Without it, application and AFK activity still work.
3. Sign into FaceTrack as the participating employee. Open **Activity monitoring** (`/employee/monitoring`). Read the disclosure, enter a device name, check the consent box, and create a pairing code.
4. In a visible PowerShell terminal on that employee's computer, from a copy of this project, run:

```powershell
# Use your API server origin; do not include /api.
npm.cmd run agent:pair -- --server https://YOUR-API-SERVER
# For a local FaceTrack API, use http://localhost:4000 instead.
```

5. Paste the one-time code when prompted. Codes expire in ten minutes. If a pairing response is lost, revoke the pending device and create another code.
6. Start the visible agent:

```powershell
npm.cmd run agent:start
```

Keep its terminal open. Press **P** to pause, **R** to resume, **Q** or **Ctrl+C** to stop. The employee and HR can also pause, resume, or permanently revoke devices in FaceTrack. Agent device status is refreshed at least once per normal 30-second cycle; the API rejects subsequent uploads while paused or revoked. A request already being processed may finish. Local pause prevents further batches immediately, including during an outage. If locally paused, resume from the terminal with R.

The agent needs Node.js 20.19+ and uses only built-in modules, so the `facetrack-sync-agent` folder can also be copied independently. Run its `index.mjs` with `node` in place of the npm shortcuts. It stores credentials and checkpoints in `facetrack-sync-agent/.state.json`, excluded from Git. Restrict that folder to the employee's OS account, especially on shared Windows computers; POSIX file modes alone do not set Windows ACLs. Never send or commit this file. Credentials expire after 90 days; revoke and pair again to renew.

Optional window-title sharing is selected at pairing time with `--include-titles`. Default pairing excludes titles. Application names and website domains remain visible. Domain extraction discards URL paths, query strings, fragments, usernames and passwords. Incognito browser events and non-HTTP URLs are skipped.

## Verify

```powershell
npm.cmd run agent:preview
Invoke-RestMethod "http://localhost:5600/api/0/buckets/"
```

Preview only reads local bucket metadata and event counts; it does not upload data. Use Chrome, VS Code, File Explorer and another app for at least five minutes. Open a few test websites. In FaceTrack, open **Activity monitoring** as the employee or HR. Allow approximately three minutes for recorded activity to settle and another 30 seconds for refresh. A browser bucket is required for the Websites section.

The dashboard shows application/website durations, active/away totals, device contact status and the 50 most recent events. HR can filter by employee, including employees who have not paired a device yet. Employee options are organization-scoped and limited to 1,000 names. Device filtering runs on the API before the 200-device limit. New agents send watcher-health heartbeats so the dashboard can show **ActivityWatch unavailable**, detect a missing browser watcher, and display the last successful activity upload. These health signals describe software connectivity rather than employee productivity. Reports cover up to seven days per request, and raw events expire after 30 days. MongoDB's TTL cleanup is asynchronous; expired records are excluded from reports immediately. Application time includes idle periods. Application, browser and presence durations are separate measures; totals across multiple devices or employees can overlap and must not be interpreted as unique working hours.

## Synchronization behavior

The agent reads only `http://127.0.0.1:5600/api/0`, discovers the three supported bucket types, clips records into intervals of at most five minutes, and uploads batches of at most 500 segments. It waits three minutes before syncing an interval so AFK transitions can settle. Saturated local event queries are split recursively rather than silently truncated. Failed uploads preserve the previous checkpoint and retry after 30 seconds. The server upserts by device, bucket and stable source key so replaying a batch updates the same records.

Enrollment, resume and each new visible agent run establish a new collection boundary. Older local history, paused intervals and time while the agent was stopped are excluded. The pending tail of roughly three minutes is also excluded if you stop or pause before it is uploaded. While a running agent loses network connectivity, it can retry from its last successful checkpoint on reconnection. Server retention still applies. Changes to ActivityWatch after a settled interval was uploaded are not revisited.

Closing this sync agent stops FaceTrack uploads, not ActivityWatch's own local recording. A device marked Offline means no recent agent contact; it does not prove an employee is away. The agent is a visible proof of concept, not a tamper-resistant employee attendance signal.

## API and access controls

| Method and path under `/api/monitoring` | Access |
| --- | --- |
| `GET /info` | Public deployment/protocol metadata; no activity or credentials |
| `POST /devices` | Employee session, CSRF, explicit consent; returns one-time code |
| `POST /enroll` | Rate-limited code exchange; returns scoped device credential once |
| `GET /devices` | Employee's devices or HR's organization; latest 200 |
| `GET /devices?employeeId=...` | HR's selected employee within their organization; employees remain self-scoped |
| `GET /employees` | HR-only directory in their organization; up to 1,000 names |
| `PATCH /devices/:id` | Same scope; pause, resume or permanent revoke |
| `GET /report?start=...&end=...&employeeId=...` | Employee's own records or HR's organization |
| `GET /agent/status` | Hashed bearer device credential; verifies active employee and organization |
| `POST /agent/heartbeat` | Device credential; records ActivityWatch availability and supported watcher types |
| `PATCH /agent/state` | Device credential; pause/resume own device |
| `POST /agent/events` | Device credential; validated, bounded, scoped batch |

Codes and credentials are cryptographically random, stored as SHA-256 hashes on the API, and omitted from device-list responses. Device enrollment and dashboard status changes are audited. Deleting an employee also purges their monitoring devices and activity in the existing deletion transaction. Employee/device IDs supplied inside an event cannot override the credential's mapping. Browser session mutations retain the existing CSRF and CORS protection. Remote synchronization requires HTTPS; HTTP is allowed only for local API development. Do not expose ActivityWatch's port publicly.

Protocol references: [ActivityWatch REST API](https://docs.activitywatch.net/en/latest/api/rest.html), [bucket and event model](https://docs.activitywatch.net/en/latest/buckets-and-events.html).

## Test scope

`npm.cmd run check` runs backend tests, download tests, agent tests and the production client build. Monitoring tests exercise code exchange, device authentication, tenant scopes, consent/CSRF, pause rejection, batch validation, source-key upserts, health heartbeats and HR directory access with mocked database models. Download tests verify archive structure, CRC checksums, allowed files, launch commands and per-site configuration without bundled credentials. Agent tests cover heartbeat clipping, stable keys, URL minimization, HTTPS enforcement and saturated queries. These do not replace a live MongoDB-to-dashboard test or a 1/5/15-employee load test. Complete those with consenting test accounts before production rollout.
