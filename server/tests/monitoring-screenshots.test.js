import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  config: vi.fn(), uploadStream: vi.fn(), destroy: vi.fn(), privateUrl: vi.fn(),
  create: vi.fn(), findOne: vi.fn(), getPolicy: vi.fn(), effective: vi.fn(), attendance: vi.fn(),
}));
vi.mock('cloudinary', () => ({ v2: {
  config: mocks.config,
  uploader: { upload_stream: mocks.uploadStream, destroy: mocks.destroy },
  utils: { private_download_url: mocks.privateUrl },
} }));
vi.mock('../src/models.js', () => ({ Attendance: { exists: mocks.attendance } }));
vi.mock('../src/models/ScreenshotCapture.js', () => ({ ScreenshotCapture: { create: mocks.create, findOne: mocks.findOne } }));
vi.mock('../src/services/monitoring-policy.service.js', () => ({ getPolicy: mocks.getPolicy, effectivePolicy: mocks.effective }));
vi.mock('../src/services/monitoring.service.js', () => ({ deviceScope: (user) => ({ organizationId: user.organizationId, ...(user.role === 'Employee' && { employeeId: user._id }) }) }));

import { getScreenshotAccess, requestUpload, uploadContent } from '../src/services/monitoring-screenshot.service.js';

const config = Object.freeze({ cloudinaryCloudName: 'tenant-cloud', cloudinaryApiKey: 'key', cloudinaryApiSecret: 'secret', cloudinaryScreenshotFolder: 'facetrack/screenshots' });
const device = { _id: '333333333333333333333333', organizationId: '222222222222222222222222', employeeId: '111111111111111111111111', status: 'active', collectAfter: '2026-01-01T00:00:00Z', screenshotConsentAt: new Date() };
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from('private screenshot bytes')]);
const input = { captureId: 'f8e6b01d-1269-4e34-b73f-aaf49af2ca13', capturedAt: new Date(Date.now() - 60_000).toISOString(), width: 100, height: 50,
  byteLength: png.length, sha256: 'd7dc4748455f514bd993b4ff7e3fb3c2b84fb05425f50d1ae3cb8f919591bb25' };

beforeEach(async () => {
  vi.resetAllMocks();
  const { createHash } = await import('node:crypto');
  input.sha256 = createHash('sha256').update(png).digest('hex');
  mocks.getPolicy.mockResolvedValue({ screenshotsEnabled: true });
  mocks.effective.mockReturnValue({ enabled: true, screenshotsEnabled: true, screenshotRetentionDays: 7, screenshotIntervalSeconds: 300, requireAttendance: false });
  mocks.destroy.mockResolvedValue({ result: 'ok' });
});

it('authorizes a server-proxied upload path under consent and policy', async () => {
  const item = { _id: '444444444444444444444444', ...input, cloudinaryPublicId: `facetrack/screenshots/${device.organizationId}/${device.employeeId}/day/${input.captureId}`,
    storageProvider: 'cloudinary', status: 'pending', employeeId: device.employeeId, deviceId: device._id };
  mocks.findOne.mockImplementation((query) => typeof query.captureId === 'string'
    ? { select: vi.fn().mockResolvedValue(null) }
    : { sort: () => ({ select: () => ({ lean: vi.fn().mockResolvedValue(null) }) }) });
  mocks.create.mockResolvedValue(item);
  const result = await requestUpload(device, input, config);
  expect(result.uploadPath).toBe(`/agent/screenshots/${input.captureId}/content`);
  expect(result).not.toHaveProperty('uploadUrl');
  expect(mocks.create.mock.calls[0][0]).toMatchObject({ storageProvider: 'cloudinary', sha256: input.sha256 });
});

it('validates PNG bytes and stores only an authenticated Cloudinary asset', async () => {
  const item = { _id: '444444444444444444444444', ...input, cloudinaryPublicId: 'facetrack/screenshots/tenant/capture', storageProvider: 'cloudinary', status: 'pending',
    organizationId: device.organizationId, employeeId: device.employeeId, deviceId: device._id, save: vi.fn() };
  mocks.findOne.mockReturnValue({ select: vi.fn().mockResolvedValue(item) });
  mocks.uploadStream.mockImplementation((options, callback) => ({ end: (bytes) => callback(null, {
    asset_id: 'asset', version: 7, bytes: bytes.length, resource_type: 'image', type: 'authenticated', format: 'png',
  }) }));
  const result = await uploadContent(device, input.captureId, png, 'image/png', config);
  expect(mocks.uploadStream.mock.calls[0][0]).toMatchObject({ type: 'authenticated', resource_type: 'image', overwrite: true });
  expect(item.status).toBe('available');
  expect(item.cloudinaryAssetId).toBe('asset');
  expect(item.save).toHaveBeenCalledOnce();
  expect(result.item.captureId).toBe(input.captureId);
});

it('rejects bytes that do not match the authorized digest', async () => {
  const item = { ...input, capturedAt: new Date(input.capturedAt), cloudinaryPublicId: 'facetrack/screenshots/tenant/capture', status: 'pending',
    organizationId: device.organizationId, employeeId: device.employeeId, deviceId: device._id };
  mocks.findOne.mockReturnValue({ select: vi.fn().mockResolvedValue(item) });
  await expect(uploadContent(device, input.captureId, Buffer.concat([png, Buffer.from('changed')]), 'image/png', config))
    .rejects.toMatchObject({ status: 409, code: 'SCREENSHOT_INTEGRITY_FAILED' });
  expect(mocks.uploadStream).not.toHaveBeenCalled();
});

it('tenant-scopes gallery access and issues a one-minute authenticated delivery URL', async () => {
  const item = { _id: '444444444444444444444444', ...input, cloudinaryPublicId: 'facetrack/screenshots/tenant/capture', status: 'available', employeeId: device.employeeId, deviceId: device._id };
  mocks.findOne.mockReturnValue({ select: vi.fn().mockResolvedValue(item) });
  mocks.privateUrl.mockReturnValue('https://res.cloudinary.com/private-signed-view');
  const user = { id: '555555555555555555555555', organizationId: device.organizationId, role: 'HR' };
  const result = await getScreenshotAccess(user, item._id, config);
  expect(mocks.findOne.mock.calls[0][0]).toMatchObject({ organizationId: device.organizationId, _id: item._id, status: 'available' });
  expect(mocks.privateUrl.mock.calls[0][2]).toMatchObject({ type: 'authenticated', expires_at: expect.any(Number) });
  expect(result.viewUrl).toContain('cloudinary.com');
});
