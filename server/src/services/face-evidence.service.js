import { FaceEvidence } from '../models.js';
import { ApiError } from '../utils/api-error.js';
import { decryptBuffer } from './biometric-crypto.service.js';

export async function listFaceEvidence(user, { page = 1, limit = 50 } = {}) {
  const query = { organizationId: user.organizationId, active: true, expiresAt: { $gt: new Date() } };
  const [items, total] = await Promise.all([
    FaceEvidence.find(query)
      .populate('employeeId', 'name employeeCode email')
      .sort({ capturedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    FaceEvidence.countDocuments(query),
  ]);
  return { items, total, page, limit, pages: Math.ceil(total / limit) };
}

export async function getFaceEvidenceImage(user, evidenceId, config) {
  const evidence = await FaceEvidence.findOne({
    _id: evidenceId,
    organizationId: user.organizationId,
    active: true,
    expiresAt: { $gt: new Date() },
  }).select('+encryptedImage +iv +authTag');
  if (!evidence) {
    throw new ApiError(404, 'FACE_EVIDENCE_NOT_FOUND', 'Face evidence is unavailable or has expired');
  }
  const image = decryptBuffer({
    encryptedData: evidence.encryptedImage,
    iv: evidence.iv,
    authTag: evidence.authTag,
  }, config);
  return { evidence, image };
}
