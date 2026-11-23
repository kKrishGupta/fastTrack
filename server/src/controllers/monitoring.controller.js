import * as service from '../services/monitoring.service.js';
import { MonitoringDevice } from '../models/MonitoringDevice.js';
import { writeAudit } from '../services/audit.service.js';
import * as policy from '../services/monitoring-policy.service.js';
import { rotateCredential } from '../services/monitoring-credentials.service.js';
import * as reports from '../services/monitoring-reports.service.js';
import * as screenshots from '../services/monitoring-screenshot.service.js';
import { ApiError } from '../utils/api-error.js';

export async function create(req, res) {
  const result = await service.createDevice(req.user, req.validated.body);
  await writeAudit({ user: req.user, action: 'monitoring.consent', entityType: 'MonitoringDevice', entityId: result.item._id });
  res.set('Cache-Control', 'no-store').status(201).json(result);
}
export async function enroll(req, res) { res.set('Cache-Control', 'no-store').json(await service.enrollDevice(req.validated.body)); }
export async function list(req, res) { res.json(await service.listDevices(req.user, req.validated.query)); }
export async function employees(req, res) { res.json(await service.listMonitoringEmployees(req.user)); }
export async function heartbeat(req, res) { res.json(await service.heartbeat(req.device, req.validated.body)); }
export async function change(req, res) {
  const item = await service.changeDeviceState(service.deviceScope(req.user), req.validated.params.id, req.validated.body.status, req.user.role === 'HR' ? 'hr' : 'employee');
  await writeAudit({ user: req.user, action: `monitoring.${item.status}`, entityType: 'MonitoringDevice', entityId: item._id });
  res.json({ item });
}
export async function clean(req, res) {
  const item = await service.archiveRevokedDevice(req.user, req.validated.params.id);
  await writeAudit({ user: req.user, action: 'monitoring.device.cleaned', entityType: 'MonitoringDevice', entityId: item._id });
  res.status(204).end();
}
export async function grantConsent(req, res) {
  const item = await service.grantDeviceConsent(req.user, req.validated.params.id, req.validated.body);
  await writeAudit({ user: req.user, action: 'monitoring.device.screenshot-consent-granted', entityType: 'MonitoringDevice', entityId: item._id });
  res.json({ item });
}
export async function status(req, res) {
  await MonitoringDevice.updateOne({ _id: req.device._id }, { $set: { lastSeenAt: new Date() } });
  res.json({ item: service.publicDevice(req.device), policy: policy.effectivePolicy(await policy.getPolicy(req.device.organizationId), req.device,
    { screenshotsAvailable: screenshots.storageAvailable(req.app.get('config')) }), serverTime: new Date().toISOString() });
}
export async function agentState(req, res) {
  const item = await service.changeDeviceState({ employeeId: req.device.employeeId, organizationId: req.device.organizationId }, req.device._id, req.validated.body.status);
  await writeAudit({ user: { id: req.device.employeeId, organizationId: req.device.organizationId }, action: `monitoring.device.${item.status}`, entityType: 'MonitoringDevice', entityId: req.device._id });
  res.json({ item });
}
export async function ingest(req, res) { res.json(await service.ingestActivity(req.device, req.validated.body.events)); }
export async function report(req, res) { res.json(await service.activityReport(req.user, req.validated.query)); }
export async function getPolicy(req, res) { res.json({ item: await policy.getPolicy(req.user.organizationId) }); }
export async function putPolicy(req, res) {
  if (req.validated.body.screenshotsEnabled && !screenshots.storageAvailable(req.app.get('config'))) {
    throw new ApiError(409, 'SCREENSHOT_STORAGE_DISABLED', 'Screenshots cannot be enabled because this FaceTrack API has not detected the required private Cloudinary configuration');
  }
  const item = await policy.updatePolicy(req.user.organizationId, req.validated.body);
  await writeAudit({ user: req.user, action: 'monitoring.policy.updated', entityType: 'MonitoringPolicy', entityId: item._id });
  res.json({ item });
}
export async function rules(req, res) { res.json({ items: await policy.listRules(req.user.organizationId) }); }
export async function putRule(req, res) {
  const item = await policy.saveRule(req.user.organizationId, req.validated.body);
  await writeAudit({ user: req.user, action: 'monitoring.rule.updated', entityType: 'ProductivityRule', entityId: item._id });
  res.json({ item });
}
export async function removeRule(req, res) {
  await policy.deleteRule(req.user.organizationId, req.validated.params.id);
  await writeAudit({ user: req.user, action: 'monitoring.rule.deleted', entityType: 'ProductivityRule', entityId: req.validated.params.id });
  res.status(204).end();
}
export async function rotate(req, res) {
  const result = await rotateCredential(req.device, req.validated.body);
  await writeAudit({ user: { id: req.device.employeeId, organizationId: req.device.organizationId }, action: 'monitoring.device.credential-rotated', entityType: 'MonitoringDevice', entityId: req.device._id });
  res.json(result);
}
export async function revokeSelf(req, res) {
  await service.changeDeviceState({ organizationId: req.device.organizationId, employeeId: req.device.employeeId }, req.device._id, 'revoked');
  await writeAudit({ user: { id: req.device.employeeId, organizationId: req.device.organizationId }, action: 'monitoring.device.self-revoked', entityType: 'MonitoringDevice', entityId: req.device._id });
  res.json({ ok: true });
}
export async function summary(req, res) { res.json(await reports.summary(req.user, req.validated.query)); }
export async function timeline(req, res) { res.json(await reports.timeline(req.user, req.validated.query)); }
export async function requestScreenshotUpload(req, res) { res.json(await screenshots.requestUpload(req.device, req.validated.body, req.app.get('config'))); }
export async function uploadScreenshotContent(req, res) { res.json(await screenshots.uploadContent(req.device, req.validated.params.captureId, req.body, req.get('content-type'), req.app.get('config'))); }
export async function completeScreenshotUpload(req, res) { res.json(await screenshots.completeUpload(req.device, req.validated.body, req.app.get('config'))); }
export const screenshotStorageAvailable = screenshots.storageAvailable;
export async function listScreenshots(req, res) { res.json(await screenshots.listScreenshots(req.user, req.validated.query)); }
export async function viewScreenshot(req, res) {
  const result = await screenshots.getScreenshotAccess(req.user, req.validated.params.id, req.app.get('config'));
  await writeAudit({ user: req.user, action: 'monitoring.screenshot.viewed', entityType: 'ScreenshotCapture', entityId: result.item._id,
    metadata: { employeeId: result.item.employeeId, deviceId: result.item.deviceId } });
  res.json(result);
}
