import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { MonitoringDevice } from '../models/MonitoringDevice.js';
import { ActivityEvent } from '../models/ActivityEvent.js';
import { Attendance, Organization, User } from '../models.js';
import { effectivePolicy, filterEvents, getPolicy } from './monitoring-policy.service.js';
import { ApiError } from '../utils/api-error.js';

export const hashSecret = (value) => crypto.createHash('sha256').update(value).digest('hex');
const secret = () => crypto.randomBytes(32).toString('base64url');
export const RETENTION_DAYS = 30;

export function deviceScope(user) {
  return { organizationId: user.organizationId, ...(user.role === 'Employee' && { employeeId: user._id ?? user.id }) };
}

export async function createDevice(user, { name, browserDetailsConsent = false, screenshotConsent = false }) {
  const code = secret();
  const item = await MonitoringDevice.create({
    ...deviceScope(user), name, consentAt: new Date(), ...(browserDetailsConsent && { browserDetailsConsentAt: new Date() }),
    ...(screenshotConsent && { screenshotConsentAt: new Date() }),
    pairingHash: hashSecret(code), pairingExpiresAt: new Date(Date.now() + 10 * 60_000),
  });
  return { item: publicDevice(item), code, expiresAt: item.pairingExpiresAt };
}

export function publicDevice(item) {
  return Object.fromEntries(['_id', 'name', 'hostname', 'status', 'employeeId', 'consentAt', 'consentVersion', 'browserDetailsConsentAt', 'screenshotConsentAt',
    'pairingExpiresAt', 'tokenExpiresAt', 'collectAfter', 'lastSeenAt', 'lastUploadAt', 'activityWatchAvailable', 'watchers', 'browserBuckets', 'createdAt',
    'adminHold', 'employeePaused', 'tokenGeneration'].map((key) => [key, item[key]]));
}

export async function enrollDevice({ code, hostname }) {
  const token = secret();
  // Atomic exchange: a pairing code can be consumed exactly once.
  const item = await MonitoringDevice.findOneAndUpdate({
    pairingHash: hashSecret(code), status: 'pending', pairingExpiresAt: { $gt: new Date() },
  }, {
    $set: { hostname, status: 'active', tokenHash: hashSecret(token), tokenExpiresAt: new Date(Date.now() + 90 * 86400_000), collectAfter: new Date() },
    $unset: { pairingHash: 1, pairingExpiresAt: 1 },
  }, { new: true });
  if (!item) throw new ApiError(401, 'PAIRING_INVALID', 'Pairing code is expired or already used. Create a new device in FaceTrack.');
  return { item: publicDevice(item), token };
}

export async function authenticateDevice(token) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token || '')) throw new ApiError(401, 'DEVICE_AUTH_REQUIRED', 'Valid device credentials required');
  const now = new Date();
  const device = await MonitoringDevice.findOne({ $or: [
    { tokenHash: hashSecret(token) },
    { previousTokenHash: hashSecret(token), previousTokenExpiresAt: { $gt: now } },
  ], status: { $in: ['active', 'paused'] }, tokenExpiresAt: { $gt: now } });
  if (!device) throw new ApiError(401, 'DEVICE_INVALID', 'Device credentials expired or revoked');
  const [employee, organization] = await Promise.all([
    User.exists({ _id: device.employeeId, organizationId: device.organizationId, role: 'Employee', status: 'active', active: true }),
    Organization.exists({ _id: device.organizationId, active: true }),
  ]);
  if (!employee || !organization) throw new ApiError(401, 'DEVICE_INVALID', 'Employee or organization is inactive');
  device.presentedTokenHash = hashSecret(token);
  return device;
}

export async function listDevices(user, { employeeId } = {}) {
  const scope = { ...deviceScope(user), archivedAt: null };
  if (user.role === 'HR' && employeeId) scope.employeeId = employeeId;
  const items = await MonitoringDevice.find(scope).select('-__v').populate('employeeId', 'name employeeCode').sort({ createdAt: -1 }).limit(200).lean();
  return { items: items.map(publicDevice), limit: 200 };
}

export async function listMonitoringEmployees(user) {
  const items = await User.find({ organizationId: user.organizationId, role: 'Employee', active: true })
    .select('_id name employeeCode').sort({ name: 1 }).limit(1000).lean();
  return { items, limit: 1000 };
}

export async function heartbeat(device, data) {
  await MonitoringDevice.updateOne({ _id: device._id }, { $set: {
    lastSeenAt: new Date(), activityWatchAvailable: data.activityWatchAvailable,
    watchers: [...new Set(data.watchers)],
    browserBuckets: [...new Set(data.browserBuckets)],
  } });
  return { ok: true };
}

export async function grantDeviceConsent(user, id, { screenshotConsent }) {
  // Only the employee who owns the device can add consent on an already-enrolled device.
  const scope = { organizationId: user.organizationId, employeeId: user._id ?? user.id };
  const update = {};
  if (screenshotConsent) update.screenshotConsentAt = new Date();
  if (!Object.keys(update).length) throw new ApiError(400, 'NO_CONSENT_GRANTED', 'No consent field was provided');
  const item = await MonitoringDevice.findOneAndUpdate(
    { ...scope, _id: id, status: { $in: ['active', 'paused'] } },
    { $set: update },
    { new: true },
  );
  if (!item) throw new ApiError(404, 'DEVICE_NOT_FOUND', 'Device not found or not in an active state');
  return publicDevice(item);
}

export async function changeDeviceState(scope, id, status, actor = 'employee') {
  // Revocation is permanent. Re-enrollment requires a fresh employee consent.
  const pauseField = actor === 'hr' ? 'adminHold' : 'employeePaused';
  const otherField = actor === 'hr' ? 'employeePaused' : 'adminHold';
  const item = await MonitoringDevice.findOneAndUpdate({ ...scope, _id: id, status: { $in: ['active', 'paused', ...(status === 'revoked' ? ['pending'] : [])] } }, [
    { $set: { [pauseField]: status === 'paused' } },
    { $set: {
      status: status === 'revoked' ? 'revoked' : { $cond: [{ $or: [`$${pauseField}`, `$${otherField}`] }, 'paused', 'active'] },
      collectAfter: status === 'active' ? { $cond: [{ $and: [{ $eq: ['$status', 'paused'] }, { $not: [`$${otherField}`] }] }, new Date(), '$collectAfter'] } : '$collectAfter',
    } },
    ...(status === 'revoked' ? [{ $unset: ['tokenHash', 'previousTokenHash', 'pairingHash'] }] : []),
  ], { new: true });
  if (!item) throw new ApiError(404, 'DEVICE_NOT_FOUND', 'Device not found or no longer enrolled');
  return publicDevice(item);
}

export async function archiveRevokedDevice(user, id) {
  const item = await MonitoringDevice.findOneAndUpdate(
    { ...deviceScope(user), _id: id, status: 'revoked', archivedAt: null },
    { $set: { archivedAt: new Date() } },
    { new: true },
  );
  if (!item) throw new ApiError(404, 'DEVICE_NOT_FOUND', 'Only a revoked device can be cleaned');
  return publicDevice(item);
}

export function prepareEvents(device, events, now = new Date(), retentionDays = RETENTION_DAYS) {
  const floor = Math.max(new Date(device.collectAfter).getTime(), now.getTime() - retentionDays * 86400_000);
  return events.flatMap((event) => {
    const timestamp = Date.parse(event.timestamp);
    const end = timestamp + event.duration * 1000;
    if (timestamp > now.getTime() + 60_000 || end > now.getTime() + 60_000) throw new ApiError(400, 'EVENT_IN_FUTURE', 'Activity cannot be in the future');
    if (timestamp < floor || event.duration === 0) return [];
    // Only the documented fields are persisted. URLs, paths and arbitrary payloads are excluded.
    return [{
      organizationId: device.organizationId, employeeId: device.employeeId, deviceId: device._id,
      bucketId: event.bucketId, sourceId: event.sourceId, type: event.type,
      timestamp: new Date(timestamp), duration: event.duration,
      ...(event.type === 'currentwindow' && { app: event.app, title: event.title }),
      ...(event.type === 'web.tab.current' && { domain: event.domain, url: event.url, title: event.title }),
      ...(event.type === 'afkstatus' && { status: event.status }),
      expiresAt: new Date(timestamp + retentionDays * 86400_000),
    }];
  });
}

export async function ingestActivity(device, events) {
  if (device.status !== 'active') throw new ApiError(409, 'MONITORING_PAUSED', 'Monitoring is paused');
  const policy = effectivePolicy(await getPolicy(device.organizationId), device);
  let permitted = filterEvents(events, policy);
  if (policy.requireAttendance && permitted.length) {
    const earliest = new Date(Math.min(...permitted.map((event) => Date.parse(event.timestamp))));
    const sessions = await Attendance.find({ organizationId: device.organizationId, employeeId: device.employeeId,
      checkInAt: { $lte: new Date() }, $or: [{ checkOutAt: null }, { checkOutAt: { $gt: earliest } }] }).lean();
    permitted = permitted.filter((event) => sessions.some((session) => Date.parse(event.timestamp) >= +new Date(session.checkInAt)
      && Date.parse(event.timestamp) + event.duration * 1000 <= +(session.checkOutAt ? new Date(session.checkOutAt) : new Date())));
  }
  const items = prepareEvents(device, permitted, new Date(), policy.retentionDays);
  // Stable source keys make retries safe; heartbeat growth updates the same record.
  if (items.length) await ActivityEvent.bulkWrite(items.map((item) => ({ updateOne: {
    filter: { deviceId: device._id, bucketId: item.bucketId, sourceId: item.sourceId },
    update: { $set: item }, upsert: true,
  } })), { ordered: true });
  await MonitoringDevice.updateOne({ _id: device._id }, { $set: { lastSeenAt: new Date(), ...(items.length && { lastUploadAt: new Date() }) } });
  return { accepted: items.length, skipped: events.length - items.length };
}

export async function activityReport(user, { start, end, employeeId }) {
  const scope = deviceScope(user);
  if (user.role === 'HR' && employeeId) scope.employeeId = new mongoose.Types.ObjectId(employeeId);
  const from = new Date(start);
  const to = new Date(end);
  const result = await ActivityEvent.aggregate([
    { $match: { ...scope, timestamp: { $lt: to, $gte: new Date(from.getTime() - 300_000) }, expiresAt: { $gt: new Date() } } },
    { $set: { seconds: { $max: [0, { $divide: [{ $subtract: [
      { $min: [to, { $add: ['$timestamp', { $multiply: ['$duration', 1000] }] }] },
      { $max: [from, '$timestamp'] },
    ] }, 1000] }] } } },
    { $match: { seconds: { $gt: 0 } } },
    { $facet: {
      applications: [{ $match: { type: 'currentwindow' } }, { $group: { _id: '$app', seconds: { $sum: '$seconds' } } }, { $sort: { seconds: -1 } }, { $limit: 20 }],
      websites: [{ $match: { type: 'web.tab.current' } }, { $group: { _id: '$domain', seconds: { $sum: '$seconds' } } }, { $sort: { seconds: -1 } }, { $limit: 20 }],
      presence: [{ $match: { type: 'afkstatus' } }, { $group: { _id: '$status', seconds: { $sum: '$seconds' } } }],
      recent: [{ $sort: { timestamp: -1 } }, { $limit: 50 }, { $project: { app: 1, title: 1, domain: 1, url: 1, status: 1, type: 1, timestamp: 1, duration: '$seconds', deviceId: 1, employeeId: 1 } }],
    } },
  ]);
  return { ...result[0], start, end, retentionDays: RETENTION_DAYS };
}
