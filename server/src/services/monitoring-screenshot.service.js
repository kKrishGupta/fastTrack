import crypto from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import { Attendance } from '../models.js';
import { ScreenshotCapture } from '../models/ScreenshotCapture.js';
import { getPolicy, effectivePolicy } from './monitoring-policy.service.js';
import { deviceScope } from './monitoring.service.js';
import { ApiError } from '../utils/api-error.js';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_COMPRESSED_BYTES = 30 * 1024;

export const storageAvailable = (config) => Boolean(config.cloudinaryCloudName && config.cloudinaryApiKey && config.cloudinaryApiSecret);

function storage(config) {
  if (!storageAvailable(config)) throw new ApiError(503, 'SCREENSHOT_STORAGE_DISABLED', 'Private Cloudinary screenshot storage is not configured');
  cloudinary.config({ cloud_name: config.cloudinaryCloudName, api_key: config.cloudinaryApiKey, api_secret: config.cloudinaryApiSecret, secure: true });
  return cloudinary;
}

const publicCapture = (item) => Object.fromEntries([
  '_id', 'employeeId', 'deviceId', 'captureId', 'storageProvider', 'format', 'status', 'capturedAt', 'width', 'height', 'byteLength', 'expiresAt', 'createdAt',
].map((key) => [key, item[key]]));

async function authorizedPolicy(device, config, capturedAt) {
  const policy = effectivePolicy(await getPolicy(device.organizationId), device, { screenshotsAvailable: storageAvailable(config) });
  if (device.status !== 'active' || !policy.enabled || !policy.screenshotsEnabled) {
    throw new ApiError(409, 'SCREENSHOTS_DISABLED', 'Screenshot capture is paused, not consented to, or disabled by policy');
  }
  if (policy.requireAttendance) {
    const attended = await Attendance.exists({ organizationId: device.organizationId, employeeId: device.employeeId,
      checkInAt: { $lte: capturedAt }, $or: [{ checkOutAt: null }, { checkOutAt: { $gte: capturedAt } }] });
    if (!attended) throw new ApiError(409, 'SCREENSHOT_OUTSIDE_ATTENDANCE', 'Screenshot was captured outside an approved attendance session');
  }
  return policy;
}

function cloudinaryId(config, device, captureId, capturedAt) {
  return `${config.cloudinaryScreenshotFolder}/${device.organizationId}/${device.employeeId}/${capturedAt.toISOString().slice(0, 10)}/${captureId}`;
}

export async function requestUpload(device, input, config) {
  const capturedAt = new Date(input.capturedAt);
  const format = input.format === 'jpg' ? 'jpg' : 'png';
  const policy = await authorizedPolicy(device, config, capturedAt);
  const floor = Math.max(+new Date(device.collectAfter), Date.now() - policy.screenshotRetentionDays * 86400_000);
  if (+capturedAt < floor || +capturedAt > Date.now() + 60_000) throw new ApiError(400, 'SCREENSHOT_TIME_INVALID', 'Screenshot is outside the authorized collection period');

  let item = await ScreenshotCapture.findOne({ deviceId: device._id, captureId: input.captureId }).select('+cloudinaryPublicId +sha256');
  if (item) {
    if (item.sha256 !== input.sha256 || item.byteLength !== input.byteLength || (item.format || 'png') !== format) throw new ApiError(409, 'SCREENSHOT_ID_CONFLICT', 'Screenshot identifier was already used for different content');
    return { item: publicCapture(item), alreadyUploaded: item.status === 'available', uploadPath: item.status === 'available' ? undefined : `/agent/screenshots/${item.captureId}/content` };
  }

  const latest = await ScreenshotCapture.findOne({ deviceId: device._id, captureId: { $ne: input.captureId }, status: 'available' })
    .sort({ capturedAt: -1 }).select('capturedAt').lean();
  const minimumGap = Math.max(0, policy.screenshotIntervalSeconds * 1000 - 15000);
  if (latest && +capturedAt < +new Date(latest.capturedAt) + minimumGap) {
    throw new ApiError(429, 'SCREENSHOT_INTERVAL_NOT_ELAPSED', 'Screenshot was captured before the configured interval elapsed');
  }

  try {
    item = await ScreenshotCapture.create({ organizationId: device.organizationId, employeeId: device.employeeId, deviceId: device._id,
      ...input, format, capturedAt, storageProvider: 'cloudinary', cloudinaryPublicId: cloudinaryId(config, device, input.captureId, capturedAt),
      expiresAt: new Date(+capturedAt + policy.screenshotRetentionDays * 86400_000) });
  } catch (error) {
    if (error.code !== 11000) throw error;
    item = await ScreenshotCapture.findOne({ deviceId: device._id, captureId: input.captureId }).select('+cloudinaryPublicId +sha256');
    if (!item || item.sha256 !== input.sha256 || item.byteLength !== input.byteLength || (item.format || 'png') !== format) throw new ApiError(409, 'SCREENSHOT_ID_CONFLICT', 'Screenshot identifier was already used for different content');
  }
  return { item: publicCapture(item), alreadyUploaded: item.status === 'available', uploadPath: item.status === 'available' ? undefined : `/agent/screenshots/${item.captureId}/content` };
}

function uploadAuthenticated(client, item, bytes) {
  const format = item.format === 'jpg' ? 'jpg' : 'png';
  return new Promise((resolve, reject) => {
    const stream = client.uploader.upload_stream({ resource_type: 'image', type: 'authenticated', public_id: item.cloudinaryPublicId,
      format, overwrite: true, invalidate: false,
      context: { captureId: item.captureId, sha256: item.sha256, organizationId: String(item.organizationId), employeeId: String(item.employeeId), deviceId: String(item.deviceId) },
    }, (error, result) => error ? reject(error) : resolve(result));
    stream.end(bytes);
  });
}

export async function uploadContent(device, captureId, bytes, contentType, config) {
  const item = await ScreenshotCapture.findOne({ organizationId: device.organizationId, employeeId: device.employeeId, deviceId: device._id, captureId })
    .select('+cloudinaryPublicId +cloudinaryAssetId +cloudinaryVersion +sha256');
  if (!item) throw new ApiError(404, 'SCREENSHOT_NOT_FOUND', 'Screenshot upload was not requested');
  if (item.status === 'available') return { item: publicCapture(item), alreadyUploaded: true };
  const format = item.format === 'jpg' ? 'jpg' : 'png';
  const mimeType = contentType?.split(';', 1)[0].trim().toLowerCase();
  const validPng = Buffer.isBuffer(bytes) && bytes.length >= PNG_SIGNATURE.length && bytes.subarray(0, 8).equals(PNG_SIGNATURE);
  const validJpeg = Buffer.isBuffer(bytes) && bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
  if (format === 'jpg' ? mimeType !== 'image/jpeg' || !validJpeg || bytes.length > MAX_COMPRESSED_BYTES : mimeType !== 'image/png' || !validPng) {
    throw new ApiError(415, 'SCREENSHOT_FORMAT_INVALID', format === 'jpg'
      ? 'Screenshot content must be a JPEG image no larger than 30 KB' : 'Screenshot content must be a PNG image');
  }
  await authorizedPolicy(device, config, item.capturedAt);
  if (bytes.length !== item.byteLength || crypto.createHash('sha256').update(bytes).digest('hex') !== item.sha256) {
    throw new ApiError(409, 'SCREENSHOT_INTEGRITY_FAILED', 'Screenshot bytes did not match the authorized capture');
  }
  let result;
  try { result = await uploadAuthenticated(storage(config), item, bytes); }
  catch (error) { throw new ApiError(502, 'SCREENSHOT_STORAGE_FAILED', `Cloudinary rejected the private screenshot upload: ${error.message}`); }
  const expectedCloudinaryFormat = format === 'jpg' ? ['jpg', 'jpeg'] : ['png'];
  const storedSizeValid = format === 'jpg'
    ? result?.bytes === item.byteLength && result.bytes <= MAX_COMPRESSED_BYTES
    : result?.bytes === item.byteLength;
  if (result?.resource_type !== 'image' || result?.type !== 'authenticated' || !expectedCloudinaryFormat.includes(result?.format) || !storedSizeValid) {
    await storage(config).uploader.destroy(item.cloudinaryPublicId, { resource_type: 'image', type: 'authenticated', invalidate: true }).catch(() => {});
    throw new ApiError(502, 'SCREENSHOT_STORAGE_INVALID', 'Cloudinary did not confirm the expected private screenshot asset within the 30 KB storage limit');
  }
  item.cloudinaryAssetId = result.asset_id;
  item.cloudinaryVersion = result.version;
  item.status = 'available';
  await item.save();
  return { item: publicCapture(item) };
}

// Kept during rolling upgrades. Current agents send PNG bytes through uploadContent.
export async function completeUpload(device, { captureId }) {
  const item = await ScreenshotCapture.findOne({ organizationId: device.organizationId, employeeId: device.employeeId, deviceId: device._id, captureId });
  if (!item) throw new ApiError(404, 'SCREENSHOT_NOT_FOUND', 'Screenshot upload was not requested');
  if (item.status !== 'available') throw new ApiError(409, 'SCREENSHOT_UPLOAD_INCOMPLETE', 'Upload screenshot bytes through the FaceTrack API before completing the capture');
  return { item: publicCapture(item) };
}

export async function listScreenshots(user, query) {
  const scope = deviceScope(user);
  if (user.role === 'HR' && query.employeeId) scope.employeeId = query.employeeId;
  if (query.deviceId) scope.deviceId = query.deviceId;
  const filter = { ...scope, status: 'available', capturedAt: { $gte: new Date(query.start), $lt: new Date(query.end) }, expiresAt: { $gt: new Date() } };
  const [items, total] = await Promise.all([
    ScreenshotCapture.find(filter).select('-cloudinaryPublicId -cloudinaryAssetId -cloudinaryVersion -sha256')
      .populate('employeeId', 'name employeeCode')
      .populate('deviceId', 'name hostname')
      .sort({ capturedAt: -1, _id: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
    ScreenshotCapture.countDocuments(filter),
  ]);
  return { items: items.map(publicCapture), page: query.page, limit: query.limit, total, pages: Math.max(1, Math.ceil(total / query.limit)) };
}

export async function getScreenshotAccess(user, id, config) {
  const item = await ScreenshotCapture.findOne({ ...deviceScope(user), _id: id, status: 'available', expiresAt: { $gt: new Date() } }).select('+cloudinaryPublicId');
  if (!item?.cloudinaryPublicId) throw new ApiError(404, 'SCREENSHOT_NOT_FOUND', 'Screenshot not found');
  const expiresAt = Math.floor(Date.now() / 1000) + 60;
  const viewUrl = storage(config).utils.private_download_url(item.cloudinaryPublicId, item.format === 'jpg' ? 'jpg' : 'png', {
    resource_type: 'image', type: 'authenticated', expires_at: expiresAt, attachment: false,
  });
  return { item: publicCapture(item), viewUrl, expiresAt: new Date(expiresAt * 1000).toISOString() };
}

export async function purgeExpiredScreenshots(config, now = new Date()) {
  if (!storageAvailable(config)) return 0;
  const items = await ScreenshotCapture.find({ expiresAt: { $lte: now } }).select('+cloudinaryPublicId').limit(100);
  if (!items.length) return 0;
  const client = storage(config);
  let deleted = 0;
  for (const item of items) {
    try {
      if (item.cloudinaryPublicId) await client.uploader.destroy(item.cloudinaryPublicId, { resource_type: 'image', type: 'authenticated', invalidate: true });
      await ScreenshotCapture.deleteOne({ _id: item._id });
      deleted++;
    } catch (error) { console.error(`Screenshot retention delete failed for ${item._id}: ${error.message}`); }
  }
  return deleted;
}
