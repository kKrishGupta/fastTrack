import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ policy: { findOne: vi.fn(), findOneAndUpdate: vi.fn() },
  rule: { findOneAndUpdate: vi.fn(), deleteOne: vi.fn() }, device: { findOneAndUpdate: vi.fn(), findOne: vi.fn() }, event: { find: vi.fn() } }));
vi.mock('../src/models/MonitoringPolicy.js', () => ({ MonitoringPolicy: mocks.policy }));
vi.mock('../src/models/ProductivityRule.js', () => ({ ProductivityRule: mocks.rule }));
vi.mock('../src/models/MonitoringDevice.js', () => ({ MonitoringDevice: mocks.device }));
vi.mock('../src/models/ActivityEvent.js', () => ({ ActivityEvent: mocks.event }));
import { deleteRule, saveRule, updatePolicy } from '../src/services/monitoring-policy.service.js';
import { rotateCredential } from '../src/services/monitoring-credentials.service.js';
import { timeline } from '../src/services/monitoring-reports.service.js';
import { changeDeviceState } from '../src/services/monitoring.service.js';
const organizationId = '222222222222222222222222', employeeId = '111111111111111111111111';
beforeEach(() => vi.resetAllMocks());
it('tenant-scopes rule writes/deletes and refuses missing or cross-tenant deletes', async () => {
  mocks.rule.findOneAndUpdate.mockResolvedValue({ _id: 'rule' });
  await saveRule(organizationId, { kind: 'app', match: 'Code.EXE', classification: 'productive' });
  expect(mocks.rule.findOneAndUpdate.mock.calls[0][0]).toEqual({ organizationId, kind: 'app', match: 'code.exe' });
  mocks.rule.deleteOne.mockResolvedValue({ deletedCount: 0 });
  await expect(deleteRule(organizationId, employeeId)).rejects.toMatchObject({ status: 404 });
  expect(mocks.rule.deleteOne).toHaveBeenCalledWith({ organizationId, _id: employeeId });
});
it('policy compare-and-swap rejects stale revisions and duplicate-key races', async () => {
  mocks.policy.findOneAndUpdate.mockRejectedValue({ code: 11000 });
  await expect(updatePolicy(organizationId, { version: 1, enabled: false })).rejects.toMatchObject({ status: 409 });
  expect(mocks.policy.findOneAndUpdate.mock.calls[0][0]).toEqual({ organizationId, version: 1 });
});
it('rotation binds to the presented current credential and makes exact replay safe', async () => {
  const device = { _id: '333333333333333333333333', organizationId, employeeId, presentedTokenHash: 'a'.repeat(64), tokenGeneration: 1 };
  const input = { rotationId: 'f8e6b01d-1269-4e34-b73f-aaf49af2ca13', nextTokenHash: 'b'.repeat(64) };
  mocks.device.findOneAndUpdate.mockResolvedValueOnce({ tokenGeneration: 2 }).mockResolvedValueOnce(null);
  mocks.device.findOne.mockResolvedValueOnce({ tokenGeneration: 2 });
  expect(await rotateCredential(device, input)).toEqual({ generation: 2 });
  expect(await rotateCredential(device, input)).toEqual({ generation: 2 });
  expect(mocks.device.findOneAndUpdate.mock.calls[0][0]).toMatchObject({ organizationId, employeeId, tokenHash: device.presentedTokenHash });
  mocks.device.findOne.mockResolvedValueOnce(null);
  await expect(rotateCredential(device, input)).rejects.toMatchObject({ status: 409 });
});
it('employee history ignores a forged employee filter and retains organization scope', async () => {
  const chain = { sort: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue([]) };
  mocks.event.find.mockReturnValue(chain);
  await timeline({ _id: employeeId, organizationId, role: 'Employee' }, { employeeId: '444444444444444444444444', start: '2026-01-01T00:00:00Z', end: '2026-01-02T00:00:00Z', limit: 50 });
  expect(mocks.event.find.mock.calls[0][0]).toMatchObject({ organizationId, employeeId });
});
it('employee resume changes only the employee pause flag and preserves an admin hold', async () => {
  mocks.device.findOneAndUpdate.mockResolvedValue({ status: 'paused', adminHold: true });
  const result = await changeDeviceState({ organizationId, employeeId }, employeeId, 'active');
  expect(result.status).toBe('paused');
  const pipeline = mocks.device.findOneAndUpdate.mock.calls[0][1];
  expect(pipeline[0]).toEqual({ $set: { employeePaused: false } });
  expect(pipeline[1].$set.status.$cond[0]).toEqual({ $or: ['$employeePaused', '$adminHold'] });
});
