# Screenshot component evaluation - 2026-11-22

ActivityWatch v0.14.3 does not provide screenshot capture. FaceTrack keeps screenshots separate from ActivityWatch activity and from the existing face-recognition evidence subsystem.

| Candidate | Upstream capability and license | Decision |
| --- | --- | --- |
| ShareX | Maintained screenshot and interval-capture utility, GPL-3.0. [Project](https://github.com/ShareX/ShareX), [CLI](https://getsharex.com/docs/command-line-arguments.html), [license](https://github.com/ShareX/ShareX/blob/develop/LICENSE.txt) | Not bundled. Its existing file/action/upload workflow was not verified to enforce FaceTrack tenant identity, consent leases, encrypted offline storage, lock detection and private-profile exclusions. Bundling it would also add GPL redistribution obligations. |
| Greenshot | Maintained region/window capture utility, GPL-3.0. [Project](https://github.com/greenshot/greenshot), [capture guide](https://github.com/greenshot/greenshot/blob/main/docs/capture-user-guide.md), [license](https://github.com/greenshot/greenshot/blob/main/LICENSE) | Not bundled. It is suitable for employee-initiated captures but does not supply the complete FaceTrack interval/policy/private-storage workflow that was required. |
| Ever Gauzy / Cattr | Broader workforce-monitoring products with AGPL/SSPL licensing concerns identified in the product requirements | Not bundled or copied. No proprietary redistribution right was assumed. |

No evaluated component supplied the complete policy, consent, encryption, storage and audit contract without bringing a separate tracking product into the installer. The implementation therefore uses a minimal Windows capture adapter in the existing .NET tray shell. It calls Windows/.NET screen-copy APIs only when a fresh server policy says screenshots are enabled for a separately consenting device. It is not a foreground-window or AFK collector.

The adapter:

- skips the locked/secure desktop;
- checks excluded foreground applications before and after capture;
- supports primary-display or all-display policy;
- streams PNG bytes directly to the bundled Node bridge without a plaintext temporary image;
- stores offline bytes only in an AES-256-GCM encrypted SQLite queue with a 500 MiB limit and 72-hour maximum age;
- sends PNG bytes through the authenticated FaceTrack API; the backend validates PNG signature, exact byte length and SHA-256 before creating an authenticated Cloudinary asset;
- stores only metadata in MongoDB;
- issues one-minute signed Cloudinary gallery URLs and audits each HR/employee access request;
- removes expired objects through the backend retention job.

The capability reports disabled unless `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` are all present on the server. Employee consent and organization policy are both required. Automated tests use a mocked Cloudinary SDK and do not upload a real screenshot. A real consenting clean-VM capture, cross-tenant Cloudinary test and retention deletion acceptance test remain release blockers.
