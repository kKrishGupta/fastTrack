import crypto from 'node:crypto';
import { ApiError } from '../utils/api-error.js';

function encryptionKey(config) {
  const configuredKey = config.biometricKey && Buffer.from(config.biometricKey, 'base64');
  if (configuredKey?.length === 32) return configuredKey;
  return crypto.scryptSync(config.jwtSecret, 'facetrack-biometric-fallback', 32);
}

export function imageFromDataUrl(value) {
  const match = /^data:(image\/jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(value || '');
  if (!match) throw new ApiError(400, 'FACE_IMAGE_INVALID', 'A JPEG camera image is required');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length < 8_000 || bytes.length > 750_000) {
    throw new ApiError(400, 'FACE_IMAGE_INVALID', 'The camera image size is invalid');
  }
  return { bytes, mimeType: match[1] };
}

export function encryptBuffer(bytes, config) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(config), iv);
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return {
    encryptedData: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptBuffer(payload, config) {
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      encryptionKey(config),
      Buffer.from(payload.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(payload.encryptedData, 'base64')),
      decipher.final(),
    ]);
  } catch {
    throw new ApiError(500, 'BIOMETRIC_EVIDENCE_UNREADABLE', 'Encrypted biometric evidence could not be read');
  }
}

export function encryptJson(value, config) {
  const encrypted = encryptBuffer(Buffer.from(JSON.stringify(value), 'utf8'), config);
  return {
    encryptedTemplate: encrypted.encryptedData,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
  };
}
