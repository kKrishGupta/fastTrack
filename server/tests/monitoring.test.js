import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const mocks = vi.hoisted(() => ({
  device: { create: vi.fn(), findOneAndUpdate: vi.fn(), findOne: vi.fn(), updateOne: vi.fn(), find: vi.fn() },
  event: { bulkWrite: vi.fn(), aggregate: vi.fn() },
  employee: { exists: vi.fn(), findOne: vi.fn(), find: vi.fn() },
  organization: { exists: vi.fn(), findOne: vi.fn() },
  policy: { getPolicy: vi.fn(), updatePolicy: vi.fn() },
}));
vi.mock('../src/models/MonitoringDevice.js', () => ({ MonitoringDevice: mocks.device }));
vi.mock('../src/models/ActivityEvent.js', () => ({ ActivityEvent: mocks.event }));
vi.mock('../src/models.js', async (original) => ({ ...await original(), User: mocks.employee, Organization: mocks.organization }));
vi.mock('../src/services/audit.service.js', () => ({ writeAudit: vi.fn() }));
vi.mock('../src/services/monitoring-policy.service.js', async (original) => ({ ...await original(),
  getPolicy: mocks.policy.getPolicy, updatePolicy: mocks.policy.updatePolicy }));

import { createApp } from '../src/app.js';
import { activityEventSchema } from '../src/validators/monitoring.schemas.js';
import { Outbox } from '../../facetrack-sync-agent/outbox.mjs';
import { normalizeEvents } from '../../facetrack-sync-agent/activitywatch.mjs';
import { activityReport, authenticateDevice, changeDeviceState, deviceScope, enrollDevice, hashSecret, ingestActivity, listDevices, prepareEvents } from '../src/services/monitoring.service.js';

const config = { clientOrigin: 'http://localhost:5173', jwtSecret: 'monitoring-test-secret-at-least-32-characters', trustProxy: false };
const employee = { _id: '111111111111111111111111', organizationId: '222222222222222222222222', role: 'Employee' };
const device = { _id: '333333333333333333333333', ...deviceScope(employee), status: 'active', collectAfter: new Date(Date.now() - 3600_000) };
const token = 'x'.repeat(43);
const event = () => ({ bucketId: 'window', sourceId: '7:slice', type: 'currentwindow', timestamp: new Date(Date.now() - 60_000).toISOString(), duration: 30, app: 'Code.exe' });
const sessionCookie = () => `access_token=${jwt.sign({ org: employee.organizationId }, config.jwtSecret, { subject: employee._id, issuer: 'facetrack-pro' })}; XSRF-TOKEN=test`;
const monitoringPolicy = { version: 1, enabled: true, includeTitles: false, browserEnabled: false, browserUrlMode: 'domain', browserTitleEnabled: false,
  approvedBrowserBuckets: [], excludedApps: [], excludedDomains: [], requireAttendance: false, retentionDays: 30, screenshotsEnabled: false,
  screenshotIntervalSeconds: 300, screenshotRetentionDays: 7, screenshotDisplayMode: 'primary', screenshotExcludedApps: [] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.device.findOne.mockResolvedValue(device);
  mocks.employee.exists.mockResolvedValue(true);
  mocks.organization.exists.mockResolvedValue(true);
  mocks.employee.findOne.mockResolvedValue(employee);
  mocks.organization.findOne.mockReturnValue({ select: vi.fn().mockResolvedValue({ _id: employee.organizationId }) });
  mocks.policy.getPolicy.mockResolvedValue(monitoringPolicy);
  mocks.policy.updatePolicy.mockImplementation(async (_organizationId, value) => ({ ...value, _id: '555555555555555555555555', version: value.version + 1 }));
});

describe('monitoring security and storage', () => {
  it('consumes pairing codes atomically and only stores a credential hash', async () => {
    mocks.device.findOneAndUpdate.mockResolvedValue(device);
    const result = await enrollDevice({ code: token, hostname: 'test-pc' });
    const [filter, update] = mocks.device.findOneAndUpdate.mock.calls[0];
    expect(filter).toMatchObject({ pairingHash: hashSecret(token), status: 'pending', pairingExpiresAt: { $gt: expect.any(Date) } });
    expect(update.$unset.pairingHash).toBe(1);
    expect(update.$set.tokenHash).toBe(hashSecret(result.token));
    expect(result.item.tokenHash).toBeUndefined();
    mocks.device.findOneAndUpdate.mockResolvedValue(null);
    await expect(enrollDevice({ code: token, hostname: 'test-pc' })).rejects.toMatchObject({ status: 401 });
  });
  it('rejects missing credentials, revoked devices and inactive employees', async () => {
    await expect(authenticateDevice('bad')).rejects.toMatchObject({ status: 401 });
    mocks.device.findOne.mockResolvedValueOnce(null);
    await expect(authenticateDevice(token)).rejects.toMatchObject({ status: 401 });
    mocks.employee.exists.mockResolvedValue(false);
    await expect(authenticateDevice(token)).rejects.toMatchObject({ status: 401 });
    expect(mocks.device.findOne).toHaveBeenCalledWith(expect.objectContaining({ $or: expect.arrayContaining([{ tokenHash: hashSecret(token) }]), status: { $in: ['active', 'paused'] } }));
  });
  it('scopes employee access to self and HR access to the organization', async () => {
    expect(deviceScope(employee)).toEqual({ organizationId: employee.organizationId, employeeId: employee._id });
    expect(deviceScope({ ...employee, role: 'HR' })).toEqual({ organizationId: employee.organizationId });
    mocks.device.findOneAndUpdate.mockResolvedValue(null);
    await expect(changeDeviceState(deviceScope(employee), device._id, 'revoked')).rejects.toMatchObject({ status: 404 });
    expect(mocks.device.findOneAndUpdate.mock.calls[0][0]).toMatchObject({ ...deviceScope(employee), _id: device._id });
  });
  it('rejects paused uploads and skips pre-consent activity', async () => {
    await expect(ingestActivity({ ...device, status: 'paused' }, [event()])).rejects.toMatchObject({ status: 409 });
    expect(mocks.event.bulkWrite).not.toHaveBeenCalled();
    expect(prepareEvents({ ...device, collectAfter: new Date() }, [event()])).toEqual([]);
  });
  it('rejects future events and applies retention from the event time', () => {
    expect(() => prepareEvents(device, [{ ...event(), timestamp: new Date(Date.now() + 120_000).toISOString() }])).toThrow('future');
    const [item] = prepareEvents(device, [event()]);
    expect(item.expiresAt.getTime() - item.timestamp.getTime()).toBe(30 * 86400_000);
  });
  it('upserts retry batches by device, bucket and source identity and excludes arbitrary payloads', async () => {
    const input = { ...event(), organizationId: 'attacker-org', url: 'https://secret.example/path', data: { token: 'secret' } };
    await ingestActivity(device, [input]);
    await ingestActivity(device, [input]);
    const operation = mocks.event.bulkWrite.mock.calls[0][0][0].updateOne;
    expect(operation.filter).toEqual({ deviceId: device._id, bucketId: input.bucketId, sourceId: input.sourceId });
    expect(operation.upsert).toBe(true);
    expect(operation.update.$set.organizationId).toBe(device.organizationId);
    expect(operation.update.$set.url).toBeUndefined();
    expect(operation.update.$set.data).toBeUndefined();
    expect(mocks.event.bulkWrite.mock.calls[1][0]).toEqual(mocks.event.bulkWrite.mock.calls[0][0]);
  });
  it('does not allow incomplete AFK, oversized or non-domain browser records', () => {
    expect(activityEventSchema.safeParse({ ...event(), duration: 301 }).success).toBe(false);
    expect(activityEventSchema.safeParse({ ...event(), type: 'afkstatus' }).success).toBe(false);
    expect(activityEventSchema.safeParse({ ...event(), type: 'web.tab.current', domain: 'https://secret.com/path' }).success).toBe(false);
  });
  it('keeps employee reports self-scoped even when another employee filter is supplied', async () => {
    mocks.event.aggregate.mockResolvedValue([{ applications: [], websites: [], presence: [], recent: [] }]);
    await activityReport(employee, { start: new Date(Date.now() - 86400_000).toISOString(), end: new Date().toISOString(), employeeId: '444444444444444444444444' });
    expect(mocks.event.aggregate.mock.calls[0][0][0].$match).toMatchObject(deviceScope(employee));
  });
  it('filters devices in MongoDB by employee without allowing employees to change their own scope', async () => {
    const chain = { select: vi.fn().mockReturnThis(), populate: vi.fn().mockReturnThis(), sort: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue([]) };
    mocks.device.find.mockReturnValue(chain);
    const selected = '444444444444444444444444';
    await listDevices({ ...employee, role: 'HR' }, { employeeId: selected });
    expect(mocks.device.find).toHaveBeenLastCalledWith({ organizationId: employee.organizationId, employeeId: selected });
    await listDevices(employee, { employeeId: selected });
    expect(mocks.device.find).toHaveBeenLastCalledWith(deviceScope(employee));
  });
});

describe('monitoring HTTP endpoints', () => {
  const app = createApp(config);
  it('identifies the deployed ActivityWatch protocol without exposing activity or credentials', async () => {
    const response = await request(app).get('/api/monitoring/info');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ provider: 'ActivityWatch', protocolVersion: 1, agentVersion: '1.2.1', retentionDays: 30, capabilities: { policies: true, screenshots: false },
      installerUrl: 'https://github.com/kKrishGupta/fastTrack/releases/download/v1.2.1-internal.2/FaceTrackSetup.exe',
      installer: { version: '1.2.1', sizeBytes: 185387799, sha256: 'a2c82098cfe9eac20cb318798f2db4ed3d81ac585b553b4cc7f057228a6e82d0', signed: false } });
    expect(response.body.screenshotStorage).toMatchObject({ provider: 'cloudinary', configured: false, code: 'SCREENSHOT_STORAGE_DISABLED' });
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('rejects enabling screenshots when this API lacks private storage', async () => {
    mocks.employee.findOne.mockResolvedValue({ ...employee, role: 'HR' });
    const response = await request(app).put('/api/monitoring/policy').set('Cookie', sessionCookie()).set('X-XSRF-TOKEN', 'test')
      .send({ ...monitoringPolicy, screenshotsEnabled: true });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('SCREENSHOT_STORAGE_DISABLED');
    expect(mocks.policy.updatePolicy).not.toHaveBeenCalled();
  });
  it('saves and returns an enabled screenshot policy when Cloudinary is configured', async () => {
    const configuredApp = createApp({ ...config, cloudinaryCloudName: 'cloud', cloudinaryApiKey: 'key', cloudinaryApiSecret: 'secret' });
    mocks.employee.findOne.mockResolvedValue({ ...employee, role: 'HR' });
    const response = await request(configuredApp).put('/api/monitoring/policy').set('Cookie', sessionCookie()).set('X-XSRF-TOKEN', 'test')
      .send({ ...monitoringPolicy, screenshotsEnabled: true });
    expect(response.status).toBe(200);
    expect(response.body.item).toMatchObject({ version: 2, screenshotsEnabled: true });
    expect(mocks.policy.updatePolicy).toHaveBeenCalledWith(employee.organizationId, expect.objectContaining({ screenshotsEnabled: true }));
  });
  it('requires authentication for the dashboard and agent upload', async () => {
    expect((await request(app).get('/api/monitoring/devices')).status).toBe(401);
    expect((await request(app).post('/api/monitoring/agent/events').send({ events: [] })).status).toBe(401);
  });
  it('requires explicit consent for a pairing code and CSRF for browser mutations', async () => {
    const noCsrf = await request(app).post('/api/monitoring/devices').set('Cookie', sessionCookie()).send({ name: 'PC', consent: true });
    expect(noCsrf.status).toBe(403);
    const noConsent = await request(app).post('/api/monitoring/devices').set('Cookie', sessionCookie()).set('X-XSRF-TOKEN', 'test').send({ name: 'PC', consent: false });
    expect(noConsent.status).toBe(400);
    expect(mocks.device.create).not.toHaveBeenCalled();
  });
  it('accepts bearer-only agent uploads without a browser session', async () => {
    const response = await request(app).post('/api/monitoring/agent/events').set('Authorization', `Bearer ${token}`).send({ events: [event()] });
    expect(response.status).toBe(200);
    expect(response.body.accepted).toBe(1);
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('syncs official-shaped events through a durable queue and the real HTTP schema/ingestion path', async () => {
    const box = new Outbox(':memory:', Buffer.alloc(32, 7).toString('base64'));
    const from = new Date(Date.now() - 120_000).toISOString(), to = new Date(Date.now() - 60_000).toISOString();
    try {
      box.reconcile(device.collectAfter.toISOString());
      const records = normalizeEvents({ id: 'window', type: 'currentwindow' }, [{ id: 1, timestamp: from, duration: 60, data: { app: 'Code.exe', title: 'excluded' } }], Date.parse(from), Date.parse(to));
      box.stage('window', from, to, records);
      await expect(box.flush(async () => { throw new Error('network disconnected'); })).rejects.toThrow('disconnected');
      expect(box.stats().count).toBe(1);
      mocks.device.findOne.mockResolvedValueOnce({ ...device, status: 'paused' });
      await expect(box.flush(async (events) => {
        const response = await request(app).post('/api/monitoring/agent/events').set('Authorization', `Bearer ${token}`).send({ events });
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        return response.body;
      })).rejects.toThrow('409');
      expect(box.stats().count).toBe(1);
      await box.flush(async (events) => {
        const response = await request(app).post('/api/monitoring/agent/events').set('Authorization', `Bearer ${token}`).send({ events });
        expect(response.status).toBe(200);
        return response.body;
      });
      expect(box.stats().count).toBe(0);
      const stored = mocks.event.bulkWrite.mock.calls[0][0][0].updateOne.update.$set;
      expect(stored).toMatchObject({ organizationId: employee.organizationId, employeeId: employee._id, app: 'Code.exe' });
      expect(stored.title).toBeUndefined();
    } finally { box.close(); }
  });
  it('requires sessions for new reports/policies and HR role for configuration writes', async () => {
    for (const path of ['/summary','/timeline','/policy','/rules']) expect((await request(app).get(`/api/monitoring${path}`)).status).toBe(401);
    expect((await request(app).put('/api/monitoring/policy').set('Cookie', sessionCookie()).set('X-XSRF-TOKEN', 'test').send({})).status).toBe(403);
    expect((await request(app).post('/api/monitoring/rules').set('Cookie', sessionCookie()).set('X-XSRF-TOKEN', 'test').send({})).status).toBe(403);
  });
  it('does not accept a credential without the Bearer scheme', async () => {
    const response = await request(app).get('/api/monitoring/agent/status').set('Authorization', token);
    expect(response.status).toBe(401);
  });
  it('no longer exposes the TeamLogger provisioning endpoint', async () => {
    mocks.employee.findOne.mockResolvedValue({ ...employee, role: 'HR' });
    const response = await request(app).post(`/api/hr/employees/${employee._id}/teamlogger/provision`).set('Cookie', sessionCookie()).set('X-XSRF-TOKEN', 'test').send({});
    expect(response.status).toBe(404);
  });
  it('creates pairing codes only for the consenting employee and never for HR', async () => {
    mocks.device.create.mockImplementation(async (fields) => ({ ...fields, _id: device._id }));
    const response = await request(app).post('/api/monitoring/devices').set('Cookie', sessionCookie()).set('X-XSRF-TOKEN', 'test').send({ name: 'Test computer', consent: true, employeeId: 'attacker' });
    expect(response.status).toBe(201);
    expect(response.body.code).toHaveLength(43);
    expect(response.body.item.pairingHash).toBeUndefined();
    expect(mocks.device.create.mock.calls[0][0]).toMatchObject({ employeeId: employee._id, organizationId: employee.organizationId, consentAt: expect.any(Date) });
    mocks.employee.findOne.mockResolvedValue({ ...employee, role: 'HR' });
    const forbidden = await request(app).post('/api/monitoring/devices').set('Cookie', sessionCookie()).set('X-XSRF-TOKEN', 'test').send({ name: 'Test', consent: true });
    expect(forbidden.status).toBe(403);
  });
  it('rejects oversized batches and report periods longer than seven days', async () => {
    const oversized = await request(app).post('/api/monitoring/agent/events').set('Authorization', `Bearer ${token}`).send({ events: Array.from({ length: 501 }, event) });
    expect(oversized.status).toBe(400);
    const report = await request(app).get('/api/monitoring/report').set('Cookie', sessionCookie()).query({ start: '2026-01-01T00:00:00Z', end: '2026-02-01T00:00:00Z' });
    expect(report.status).toBe(400);
  });
  it('requires device authentication and validates the watcher health heartbeat', async () => {
    expect((await request(app).post('/api/monitoring/agent/heartbeat').send({})).status).toBe(401);
    const invalid = await request(app).post('/api/monitoring/agent/heartbeat').set('Authorization', `Bearer ${token}`).send({ activityWatchAvailable: true, watchers: ['arbitrary-data'] });
    expect(invalid.status).toBe(400);
    const valid = await request(app).post('/api/monitoring/agent/heartbeat').set('Authorization', `Bearer ${token}`).send({ activityWatchAvailable: true, watchers: ['currentwindow', 'afkstatus', 'web.tab.current'], browserBuckets: ['aw-watcher-web-work', 'aw-watcher-web-work'] });
    expect(valid.status).toBe(200);
    expect(mocks.device.updateOne).toHaveBeenLastCalledWith({ _id: device._id }, { $set: { lastSeenAt: expect.any(Date), activityWatchAvailable: true, watchers: ['currentwindow', 'afkstatus', 'web.tab.current'], browserBuckets: ['aw-watcher-web-work'] } });
  });
  it('restricts employee directory access to HR in the same organization', async () => {
    const forbidden = await request(app).get('/api/monitoring/employees').set('Cookie', sessionCookie());
    expect(forbidden.status).toBe(403);
    const chain = { select: vi.fn().mockReturnThis(), sort: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue([{ _id: employee._id, name: 'Test Employee' }]) };
    mocks.employee.find.mockReturnValue(chain);
    mocks.employee.findOne.mockResolvedValue({ ...employee, role: 'HR' });
    const allowed = await request(app).get('/api/monitoring/employees').set('Cookie', sessionCookie());
    expect(allowed.status).toBe(200);
    expect(allowed.body.items[0].name).toBe('Test Employee');
    expect(mocks.employee.find).toHaveBeenCalledWith({ organizationId: employee.organizationId, role: 'Employee', active: true });
  });
  it('allows an employee to grant screenshot consent on an existing enrolled device', async () => {
    const deviceWithConsent = { ...device, screenshotConsentAt: new Date() };
    mocks.device.findOneAndUpdate.mockResolvedValue(deviceWithConsent);
    const response = await request(app)
      .patch(`/api/monitoring/devices/${device._id}/consent`)
      .set('Cookie', sessionCookie())
      .set('X-XSRF-TOKEN', 'test')
      .send({ screenshotConsent: true });
    expect(response.status).toBe(200);
    expect(response.body.item.screenshotConsentAt).toBeTruthy();
    // The update must be scoped to the employee's own org and userId
    const updateCall = mocks.device.findOneAndUpdate.mock.calls[0];
    expect(updateCall[0]).toMatchObject({ organizationId: employee.organizationId, employeeId: employee._id, _id: device._id });
    expect(updateCall[1].$set.screenshotConsentAt).toBeInstanceOf(Date);
  });
  it('prevents HR from granting screenshot consent (employee-only endpoint)', async () => {
    mocks.employee.findOne.mockResolvedValue({ ...employee, role: 'HR' });
    const response = await request(app)
      .patch(`/api/monitoring/devices/${device._id}/consent`)
      .set('Cookie', sessionCookie())
      .set('X-XSRF-TOKEN', 'test')
      .send({ screenshotConsent: true });
    expect(response.status).toBe(403);
    expect(mocks.device.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it('rejects screenshot consent grant with screenshotConsent: false or missing body', async () => {
    const badFalse = await request(app).patch(`/api/monitoring/devices/${device._id}/consent`)
      .set('Cookie', sessionCookie()).set('X-XSRF-TOKEN', 'test').send({ screenshotConsent: false });
    expect(badFalse.status).toBe(400);
    const badMissing = await request(app).patch(`/api/monitoring/devices/${device._id}/consent`)
      .set('Cookie', sessionCookie()).set('X-XSRF-TOKEN', 'test').send({});
    expect(badMissing.status).toBe(400);
    expect(mocks.device.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
