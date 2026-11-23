# GrabLogger — employee installation

This guide applies only to an approved company pilot. Read the monitoring disclosure in FaceTrack before connecting a device. The current repository artifact is unsigned and intended for internal testing; use a signed company download for a customer rollout.

## Install and connect

1. Sign in to FaceTrack and open **Activity monitoring**.
2. Read the disclosure and select the consent checkbox.
3. Choose **Create pairing code**. The code is one-use and expires.
4. Download and open `FaceTrackSetup.exe` from the company-approved FaceTrack link.
5. Complete the graphical wizard. **Start at sign-in** is optional and unchecked by default.
6. Open **GrabLogger**, paste the pairing code, and choose **Connect this computer**.

Collectors start only after successful enrollment. The application shows **Monitoring active**, **Uploads paused**, **Stopped**, or an error state. Internal ActivityWatch and Node processes do not show terminal windows.

## Controls

- **Pause uploads** requests a pause from FaceTrack. ActivityWatch retains local records while uploads are paused.
- **Resume uploads** resumes only when organization policy and any HR hold allow it.
- **Stop monitoring** stops the FaceTrack-owned collectors and synchronization process.
- **Start monitoring** starts them again without creating a new device.
- **Disconnect device** revokes the device credential and removes its pending FaceTrack upload queue. Dedicated ActivityWatch history remains locally owned by the employee.
- Closing the window keeps the visible tray indicator running. Use **Exit** from the tray menu to stop the FaceTrack-owned components.

FaceTrack uses a dedicated ActivityWatch profile on `127.0.0.1:5600`; it refuses to start if another application owns that port and does not adopt or delete personal ActivityWatch data. Browser data requires official Web Watcher v0.6.0 installed only in an approved Chrome/Edge work profile and exact HR bucket approval. Screenshots require a separate enrollment checkbox, configured private storage and an enabled policy; the tray log displays the interval. Locked screens and excluded apps are skipped.

## Troubleshooting

- **Enrollment failed:** create a new pairing code and confirm the computer can reach the FaceTrack API over HTTPS.
- **Port 5600 is already in use:** close the other ActivityWatch instance or ask IT which installation is authorized. FaceTrack will not reuse it automatically.
- **ActivityWatch did not become ready:** exit GrabLogger, reopen it, and send the displayed message to support. Never expose port 5600 to the network.
- **Device access revoked:** the device cannot upload. Ask HR whether a new approved pairing code is required.
- **Clock differs:** enable Windows automatic date/time and timezone, then retry.

## Uninstall

Use Windows **Installed apps → GrabLogger → Uninstall**. Uninstall stops owned processes, attempts online device revocation, removes the FaceTrack credential/queue and asks separately whether to delete the dedicated FaceTrack-managed ActivityWatch history. If the computer is offline, revoke the device from the employee dashboard as well. Personal ActivityWatch data is not removed.
