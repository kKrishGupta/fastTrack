import * as service from '../services/monitoring.service.js';
import { MonitoringDevice } from '../models/MonitoringDevice.js';
import { writeAudit } from '../services/audit.service.js';

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
  const item = await service.changeDeviceState(service.deviceScope(req.user), req.validated.params.id, req.validated.body.status);
  await writeAudit({ user: req.user, action: `monitoring.${item.status}`, entityType: 'MonitoringDevice', entityId: item._id });
  res.json({ item });
}
export async function status(req, res) {
  await MonitoringDevice.updateOne({ _id: req.device._id }, { $set: { lastSeenAt: new Date() } });
  res.json({ item: service.publicDevice(req.device) });
}
export async function agentState(req, res) {
  res.json({ item: await service.changeDeviceState({ employeeId: req.device.employeeId, organizationId: req.device.organizationId }, req.device._id, req.validated.body.status) });
}
export async function ingest(req, res) { res.json(await service.ingestActivity(req.device, req.validated.body.events)); }
export async function report(req, res) { res.json(await service.activityReport(req.user, req.validated.query)); }
