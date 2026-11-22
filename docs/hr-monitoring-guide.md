# FaceTrack Monitoring — HR administrator guide

Use monitoring only for employees and devices covered by your organization’s disclosure, consent process and applicable policy. Activity observations do not alter attendance, payroll or biometric records.

## Pilot setup

1. Publish only a signed, hash-verified `FaceTrackSetup.exe` through the configured `MONITORING_INSTALLER_URL`.
2. Open **HR → Activity monitoring → Organization policy**.
3. Keep browser sharing and window titles disabled for the first application/AFK pilot.
4. Set retention, excluded applications/domains and whether reports must intersect actual attendance sessions.
5. Add exact application or domain productivity rules. Unmatched time remains neutral or unknown.
6. Ask the employee to read the disclosure, create their own one-use code and connect the approved work computer.

## Device and report interpretation

- **Connected** means the agent contacted FaceTrack recently. It is a health signal, not proof of work.
- **Last activity upload** shows synchronization recency. Network outages can delay data and recover from ActivityWatch’s local history.
- **Active** means a non-AFK observation exists. It does not automatically mean productive.
- **Idle/AFK** is an ActivityWatch away observation. Do not use it as payroll attendance.
- **Unknown** is retained when sources conflict or do not establish a foreground context.
- Simultaneous devices are unioned per employee to prevent double-counting.

HR can place a device on hold or revoke it. An employee resume cannot override an HR hold. Revocation rejects future device requests; the employee should also uninstall or disconnect the local app.

## Browser and screenshot boundary

Browser sharing remains off until IT installs official ActivityWatch Web Watcher v0.6.0 only in an approved Chrome/Edge work profile, observes its candidate bucket and adds that exact ID to policy. Domain-only is the default. Origin, path, query and page-title sharing require separate device consent; private/incognito and unsupported URL schemes are rejected. v0.6.0 cannot distinguish multiple profiles sharing the same browser bucket, so keep it disabled when provenance is ambiguous.

Screenshots remain unavailable until private object storage is configured. After configuration, enable them only for separately consenting devices, set interval/retention/display scope and list excluded application EXEs. HR gallery view URLs expire after one minute and every issuance is written to the audit log. Screenshot observations are separate from face evidence, attendance and payroll.

## Release gates

Before customer rollout, complete Authenticode signing, release-specific license/SBOM/source review, a clean-VM install/reboot/uninstall test, a real isolated-MongoDB tenant test and a consenting 1 → 5 → 15 employee pilot. Test 50 devices separately for API capacity and common-NAT rate limiting.
