import crypto from 'node:crypto';
import { EnrollmentSession, FaceProfile, User } from '../models.js';
import { ApiError } from '../utils/api-error.js';
import { writeAudit } from './audit.service.js';

const POSES = ['Front', 'Left', 'Right', 'Up', 'Down'];
const SESSION_MINUTES = 15;

export function resolveFaceAdapter(config) {
  if (!config.isProduction && config.allowTestFaceAdapter) return 'development-test-only';
  if (config.allowDemoFaceAdapter) return 'demo-capture-evidence';
  throw new ApiError(
    503,
    'FACE_MODEL_NOT_CONFIGURED',
    'Face enrollment is disabled. Configure a production face provider, or set ALLOW_DEMO_FACE_ADAPTER=true for a non-identifying demo',
  );
}

function encryptEvidenceTemplate(value, config) {
  const key = crypto.scryptSync(config.jwtSecret, 'facetrack-development-biometric-key', 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return {
    encryptedTemplate: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

async function getActiveSession(user, sessionId) {
  const session = await EnrollmentSession.findOne({
    _id: sessionId,
    organizationId: user.organizationId,
    employeeId: user.id,
    status: 'active',
    expiresAt: { $gt: new Date() },
  });
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
    expiresAt: new Date(Date.now() + SESSION_MINUTES * 60_000),
  });
  return { sessionId: session.id, expiresAt: session.expiresAt, adapter };
}

export async function saveEnrollmentCapture(user, payload, config) {
  resolveFaceAdapter(config);
  const session = await getActiveSession(user, payload.sessionId);
  const expectedPose = POSES[session.captures.length];
  if (payload.pose !== expectedPose) {
    throw new ApiError(409, 'POSE_SEQUENCE_INVALID', `Capture ${expectedPose} before ${payload.pose}`);
  }
  const frameBytes = Buffer.from(payload.frame.slice(payload.frame.indexOf(',') + 1), 'base64');
  if (frameBytes.length < 8_000) throw new ApiError(400, 'FRAME_INVALID', 'The captured camera frame is too small');
  session.captures.push({
    pose: payload.pose,
    frameHash: crypto.createHash('sha256').update(frameBytes).digest('hex'),
    quality: payload.quality,
  });
  await session.save();
  return { captured: session.captures.length, nextPose: POSES[session.captures.length] ?? null };
}

export async function completeEnrollment(user, sessionId, config) {
  const adapter = resolveFaceAdapter(config);
  const session = await getActiveSession(user, sessionId);
  if (session.captures.length !== POSES.length || session.captures.some((item, index) => item.pose !== POSES[index])) {
    throw new ApiError(409, 'ENROLLMENT_INCOMPLETE', 'All five validated angles must be captured first');
  }
  const encrypted = encryptEvidenceTemplate({
    version: 1,
    adapter,
    captures: session.captures.map(({ pose, frameHash, quality }) => ({ pose, frameHash, quality })),
  }, config);
  const profile = await FaceProfile.findOneAndUpdate(
    { organizationId: user.organizationId, employeeId: user.id },
    {
      ...encrypted,
      organizationId: user.organizationId,
      employeeId: user.id,
      modelId: adapter,
      modelVersion: '1',
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
