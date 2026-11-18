import crypto from 'node:crypto';
import { EnrollmentSession, FaceProfile, User } from '../models.js';
import { ApiError } from '../utils/api-error.js';
import { writeAudit } from './audit.service.js';
import { encryptBuffer, encryptJson, imageFromDataUrl } from './biometric-crypto.service.js';
import { validateFaceImage } from './face-provider.service.js';

const POSES = ['Front', 'Left', 'Right', 'Up', 'Down'];
const SESSION_MINUTES = 15;

export function resolveFaceAdapter(config) {
  if (config.faceProvider === 'aws-rekognition') return 'aws-rekognition';
  if (!config.isProduction && config.allowTestFaceAdapter) return 'development-test-only';
  if (config.allowDemoFaceAdapter) return 'demo-capture-evidence';
  throw new ApiError(
    503,
    'FACE_MODEL_NOT_CONFIGURED',
    'Face enrollment is disabled. Configure a production face provider, or set ALLOW_DEMO_FACE_ADAPTER=true for a non-identifying demo',
  );
}

async function getActiveSession(user, sessionId) {
  const session = await EnrollmentSession.findOne({
    _id: sessionId,
    organizationId: user.organizationId,
    employeeId: user.id,
    status: 'active',
    expiresAt: { $gt: new Date() },
  }).select('+captures.encryptedFrame +captures.frameIv +captures.frameAuthTag');
  if (!session) throw new ApiError(404, 'ENROLLMENT_SESSION_INVALID', 'Enrollment session is missing or expired');
  return session;
}

export async function startEnrollment(user, config) {
  const adapter = resolveFaceAdapter(config);
  await EnrollmentSession.updateMany(
    { organizationId: user.organizationId, employeeId: user.id, status: 'active' },
    { $set: { status: 'expired' } },
  );
  const session = await EnrollmentSession.create({
    organizationId: user.organizationId,
    employeeId: user.id,
    adapter,
    expiresAt: new Date(Date.now() + SESSION_MINUTES * 60_000),
  });
  return { sessionId: session.id, expiresAt: session.expiresAt, adapter };
}

export async function saveEnrollmentCapture(user, payload, config) {
  const configuredAdapter = resolveFaceAdapter(config);
  const session = await getActiveSession(user, payload.sessionId);
  if (session.adapter && session.adapter !== configuredAdapter) {
    throw new ApiError(409, 'ENROLLMENT_CONFIGURATION_CHANGED', 'Face verification configuration changed. Reset enrollment and capture again');
  }
  const adapter = session.adapter || configuredAdapter;
  const expectedPose = POSES[session.captures.length];
  if (payload.pose !== expectedPose) {
    throw new ApiError(409, 'POSE_SEQUENCE_INVALID', `Capture ${expectedPose} before ${payload.pose}`);
  }
  const { bytes: frameBytes, mimeType } = imageFromDataUrl(payload.frame);
  if (adapter === 'aws-rekognition' && payload.pose === 'Front') {
    await validateFaceImage(frameBytes, config);
  }
  const referenceImage = adapter === 'aws-rekognition' && payload.pose === 'Front'
    ? encryptBuffer(frameBytes, config)
    : null;
  session.captures.push({
    pose: payload.pose,
    frameHash: crypto.createHash('sha256').update(frameBytes).digest('hex'),
    ...(referenceImage && {
      encryptedFrame: referenceImage.encryptedData,
      frameIv: referenceImage.iv,
      frameAuthTag: referenceImage.authTag,
      frameMimeType: mimeType,
    }),
    quality: payload.quality,
  });
  await session.save();
  return { captured: session.captures.length, nextPose: POSES[session.captures.length] ?? null };
}

export async function completeEnrollment(user, sessionId, config) {
  const configuredAdapter = resolveFaceAdapter(config);
  const session = await getActiveSession(user, sessionId);
  if (session.adapter && session.adapter !== configuredAdapter) {
    throw new ApiError(409, 'ENROLLMENT_CONFIGURATION_CHANGED', 'Face verification configuration changed. Reset enrollment and capture again');
  }
  const adapter = session.adapter || configuredAdapter;
  if (session.captures.length !== POSES.length || session.captures.some((item, index) => item.pose !== POSES[index])) {
    throw new ApiError(409, 'ENROLLMENT_INCOMPLETE', 'All five validated angles must be captured first');
  }
  const encrypted = encryptJson({
    version: 1,
    adapter,
    captures: session.captures.map(({ pose, frameHash, quality }) => ({ pose, frameHash, quality })),
  }, config);
  const frontCapture = session.captures.find((capture) => capture.pose === 'Front');
  if (adapter === 'aws-rekognition' && !frontCapture?.encryptedFrame) {
    throw new ApiError(409, 'REFERENCE_FACE_MISSING', 'Repeat enrollment to create a secure reference face');
  }
  const profile = await FaceProfile.findOneAndUpdate(
    { organizationId: user.organizationId, employeeId: user.id },
    {
      ...encrypted,
      organizationId: user.organizationId,
      employeeId: user.id,
      modelId: adapter,
      modelVersion: '1',
      provider: adapter,
      ...(frontCapture?.encryptedFrame && {
        referenceImageEncrypted: frontCapture.encryptedFrame,
        referenceImageIv: frontCapture.frameIv,
        referenceImageAuthTag: frontCapture.frameAuthTag,
        referenceMimeType: frontCapture.frameMimeType,
      }),
      status: 'active',
      active: true,
    },
    { new: true, upsert: true },
  );
  session.status = 'complete';
  await session.save();
  const updatedUser = await User.findByIdAndUpdate(user.id, { enrollmentStatus: 'complete' }, { new: true });
  await writeAudit({
    user,
    action: 'face.enrollment.completed',
    entityType: 'FaceProfile',
    entityId: profile.id,
    metadata: { adapter, captures: POSES },
  });
  return { user: updatedUser, adapter };
}
