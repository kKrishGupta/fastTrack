import mongoose from 'mongoose';
import { ActivityEvent } from '../models/ActivityEvent.js';
import { Attendance, Organization } from '../models.js';
import { deviceScope } from './monitoring.service.js';
import { getPolicy, listRules } from './monitoring-policy.service.js';
import { summarizeActivity } from './productivity.service.js';
import { ApiError } from '../utils/api-error.js';

function scopeFor(user, employeeId) {
  return { ...deviceScope(user), ...(user.role === 'HR' && employeeId && { employeeId: new mongoose.Types.ObjectId(employeeId) }) };
}
export async function summary(user, { employeeId, start, end }) {
  const scope = scopeFor(user, employeeId);
  const [events, policy, rules, organization] = await Promise.all([
    ActivityEvent.find({ ...scope, timestamp: { $gte: new Date(Date.parse(start) - 300_000), $lt: new Date(end) }, expiresAt: { $gt: new Date() } }).sort({ timestamp: 1 }).limit(100001).lean(),
    getPolicy(user.organizationId), listRules(user.organizationId), Organization.findOne({ _id: user.organizationId }).select('timezone').lean(),
  ]);
  if (events.length > 100000) throw new ApiError(413, 'REPORT_TOO_LARGE', 'Select one employee or a shorter period. This report exceeds the raw-event limit.');
  const attendance = policy.requireAttendance ? await Attendance.find({ ...scope, checkInAt: { $lt: new Date(end) },
    $or: [{ checkOutAt: null }, { checkOutAt: { $gt: new Date(start) } }] }).lean() : [];
  return { ...summarizeActivity(events, { start, end, rules, attendance, requireAttendance: policy.requireAttendance,
    timezone: organization?.timezone || 'UTC' }), start, end, policyVersion: policy.version };
}
export async function timeline(user, { employeeId, start, end, cursor, limit }) {
  const [cursorTime, cursorId] = cursor?.split('_') || [];
  const items = await ActivityEvent.find({ ...scopeFor(user, employeeId), timestamp: { $gte: new Date(start), $lt: new Date(end) },
    expiresAt: { $gt: new Date() }, ...(cursor && { $or: [{ timestamp: { $lt: new Date(cursorTime) } }, { timestamp: new Date(cursorTime), _id: { $lt: cursorId } }] }) })
    .sort({ timestamp: -1, _id: -1 }).limit(limit + 1).lean();
  const last = items[limit - 1];
  return { items: items.slice(0, limit), nextCursor: items.length > limit ? `${new Date(last.timestamp).toISOString()}_${last._id}` : null };
}
