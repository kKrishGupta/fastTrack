import { MonitoringDevice } from '../models/MonitoringDevice.js';
import { ApiError } from '../utils/api-error.js';

export async function rotateCredential(device, { rotationId, nextTokenHash }) {
  if (!/^[a-f\d]{64}$/.test(device.presentedTokenHash || '')) throw new ApiError(401, 'DEVICE_AUTH_REQUIRED', 'Authenticated device credential required');
  // Keep the replacement secret on the client. Compare-and-swap prevents concurrent rotation.
  const now = new Date();
  const item = await MonitoringDevice.findOneAndUpdate({
    _id: device._id, organizationId: device.organizationId, employeeId: device.employeeId,
    status: { $in: ['active', 'paused'] },
    tokenHash: device.presentedTokenHash,
    ...(device.tokenGeneration > 1 ? { tokenGeneration: device.tokenGeneration }
      : { $or: [{ tokenGeneration: 1 }, { tokenGeneration: { $exists: false } }] }),
    rotationId: { $ne: rotationId },
  }, [{ $set: { tokenHash: nextTokenHash, previousTokenHash: '$tokenHash',
    previousTokenExpiresAt: new Date(now.getTime() + 300_000), rotationId,
    tokenExpiresAt: new Date(now.getTime() + 90 * 86400_000), tokenGeneration: { $add: [{ $ifNull: ['$tokenGeneration', 1] }, 1] } } }], { new: true });
  if (item) return { generation: item.tokenGeneration };
  const prior = await MonitoringDevice.findOne({ _id: device._id, organizationId: device.organizationId,
    employeeId: device.employeeId, rotationId, tokenHash: nextTokenHash, status: { $in: ['active', 'paused'] } });
  if (prior) return { generation: prior.tokenGeneration };
  throw new ApiError(409, 'ROTATION_CONFLICT', 'Credential changed or device was revoked');
}
