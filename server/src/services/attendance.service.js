import {
  Attendance,
  AttendanceChallenge,
  Office,
  OfficeAssignment,
  Organization,
  VerificationEvent,
  WorkFromHomeRequest,
} from '../models.js';
import { ApiError } from '../utils/api-error.js';
import { localDateKey } from '../utils/time.js';
import { assertCheckInAllowed, calculateAttendanceSummary, normalizeAttendancePolicy } from './attendance-policy.service.js';
import { assignmentIsValid, evaluateGeofence } from './geofence.service.js';

const CHALLENGE_STATES = Object.freeze({
  CREATED: 'created',
  LOCATION_VERIFIED: 'location_verified',
  FACE_VERIFIED: 'face_verified',
  CONSUMED: 'consumed',
  FAILED: 'failed',
});

function organizationFilter(user) {
  return { organizationId: user.organizationId };
}

function invalidChallenge(message = 'Challenge expired, reused, or invalid') {
  return new ApiError(409, 'CHALLENGE_INVALID', message);
}

export async function createAttendanceChallenge(user, config) {
  if (user.enrollmentStatus !== 'complete') {
    throw new ApiError(409, 'ENROLLMENT_REQUIRED', 'Complete approved face enrollment first');
  }
  const activeAttendance = await Attendance.exists({
    ...organizationFilter(user),
    employeeId: user.id,
    sessionStatus: 'working',
  });
  if (activeAttendance) {
    throw new ApiError(409, 'ALREADY_CHECKED_IN', 'An active work session already exists');
  }

  const organization = await Organization.findById(user.organizationId).select('attendanceSettings timezone');
  const policy = normalizeAttendancePolicy(organization?.attendanceSettings);
  assertCheckInAllowed(policy, new Date(), organization?.timezone || 'UTC');
  const configuredMinutes = organization?.attendanceSettings?.challengeMinutes;
  const minutes = Math.min(15, Math.max(1, configuredMinutes || config.challengeMinutes));
  const attendanceDate = localDateKey(new Date(), organization?.timezone || 'UTC');
  const approvedWfh = await WorkFromHomeRequest.findOne({
    ...organizationFilter(user),
    employeeId: user.id,
    requestDate: attendanceDate,
    status: 'approved',
    active: true,
  });
  const item = await AttendanceChallenge.create({
    ...organizationFilter(user),
    employeeId: user.id,
    workMode: approvedWfh ? 'WFH' : 'OFFICE',
    wfhRequestId: approvedWfh?.id,
    expiresAt: new Date(Date.now() + minutes * 60_000),
  });
  return { id: item.id, expiresAt: item.expiresAt, status: item.status, workMode: item.workMode, wfhRequestId: item.wfhRequestId };
}

export async function verifyAttendanceLocation(user, data, config = {}) {
  const challenge = await AttendanceChallenge.findOne({
    _id: data.challengeId,
    ...organizationFilter(user),
    employeeId: user.id,
    status: CHALLENGE_STATES.CREATED,
    expiresAt: { $gt: new Date() },
  });
  if (!challenge) throw invalidChallenge();

  const organization = await Organization.findById(user.organizationId).select('attendanceSettings timezone');
  let office;
  let wfhRequest;
  let locationTarget;
  if (challenge.workMode === 'WFH') {
    if (data.wfhRequestId && String(challenge.wfhRequestId) === data.wfhRequestId) {
      wfhRequest = await WorkFromHomeRequest.findOne({
        _id: challenge.wfhRequestId,
        ...organizationFilter(user),
        employeeId: user.id,
        status: 'approved',
        requestDate: localDateKey(new Date(), organization?.timezone || 'UTC'),
        active: true,
      });
    }
    if (wfhRequest) locationTarget = { name: wfhRequest.locationLabel || 'Approved WFH location', location: wfhRequest.location, radiusMeters: wfhRequest.radiusMeters };
  } else {
    const assignment = await OfficeAssignment.findOne({ officeId: data.officeId, employeeId: user.id, ...organizationFilter(user) });
    office = await Office.findOne({ _id: data.officeId, ...organizationFilter(user), active: true });
    if (office && assignment && assignmentIsValid(assignment)) locationTarget = office;
  }

  if (!locationTarget) {
    await AttendanceChallenge.updateOne(
      { _id: challenge.id, status: CHALLENGE_STATES.CREATED },
      { $set: { status: CHALLENGE_STATES.FAILED } },
    );
    await VerificationEvent.create({
      ...organizationFilter(user),
      employeeId: user.id,
      challengeId: challenge.id,
      type: 'location',
      outcome: 'failed',
      reason: challenge.workMode === 'WFH' ? 'WFH_NOT_APPROVED' : 'OFFICE_NOT_ALLOWED',
    });
    throw new ApiError(403, challenge.workMode === 'WFH' ? 'WFH_NOT_APPROVED' : 'OFFICE_NOT_ALLOWED', challenge.workMode === 'WFH' ? 'An approved WFH request for today is required' : 'No active office assignment');
  }

  const configuredAccuracy = organization?.attendanceSettings?.accuracyMax || 80;
  const developmentAccuracy = config.devLocationAccuracyMax || 150;
  const effectiveAccuracy = !config.isProduction && config.allowTestFaceAdapter
    ? Math.max(configuredAccuracy, developmentAccuracy)
    : configuredAccuracy;
  const result = evaluateGeofence({
    position: data.position,
    office: locationTarget,
    maxAccuracy: effectiveAccuracy,
  });
  const event = await VerificationEvent.create({
    ...organizationFilter(user),
    employeeId: user.id,
    challengeId: challenge.id,
    type: 'location',
    outcome: result.ok ? 'passed' : 'failed',
    reason: result.reason,
  });

  const nextStatus = result.ok ? CHALLENGE_STATES.LOCATION_VERIFIED : CHALLENGE_STATES.FAILED;
  const updated = await AttendanceChallenge.findOneAndUpdate(
    { _id: challenge.id, status: CHALLENGE_STATES.CREATED },
    {
      $set: {
        status: nextStatus,
        ...(result.ok && {
          ...(office && { officeId: office.id }),
          ...(wfhRequest && { wfhRequestId: wfhRequest.id }),
          locationEvidence: {
            verificationEventId: event.id,
            distance: result.distance,
            accuracy: data.position.accuracy,
            verifiedAt: new Date(),
          },
        }),
      },
    },
    { new: true },
  );
  if (!updated) throw invalidChallenge();
  if (!result.ok) {
    const messages = {
      ACCURACY_INSUFFICIENT: `Location accuracy is too low. Enable precise location and try again (required ${effectiveAccuracy} m or better)`,
      OUTSIDE_GEOFENCE: `You are outside the ${locationTarget.name} attendance area`,
      STALE_POSITION: 'The browser returned an old location. Try again to request a fresh position',
      INVALID_COORDINATES: 'The browser returned invalid location coordinates',
    };
    throw new ApiError(422, result.reason, messages[result.reason] || 'Location verification failed', {
      distanceMeters: Number.isFinite(result.distance) ? Math.round(result.distance) : null,
      accuracyMeters: Math.round(data.position.accuracy),
      requiredAccuracyMeters: effectiveAccuracy,
      developmentPolicy: effectiveAccuracy !== configuredAccuracy,
      officeRadiusMeters: locationTarget.radiusMeters,
      officeName: locationTarget.name,
    });
  }
  return {
    verified: true,
    distanceMeters: Math.round(result.distance),
    verificationEventId: event.id,
  };
}

export async function verifyAttendanceFace(user, data, config) {
  const challenge = await AttendanceChallenge.findOne({
    _id: data.challengeId,
    ...organizationFilter(user),
    employeeId: user.id,
    status: CHALLENGE_STATES.LOCATION_VERIFIED,
    expiresAt: { $gt: new Date() },
  });
  if (!challenge) throw invalidChallenge('A fresh location-approved challenge is required');

  const developmentEvidence =
    (data.evidence.adapter === 'development-test' &&
      data.evidence.challengeResponse === 'development-only') ||
    (data.evidence.adapter === 'browser-live' &&
      data.evidence.challengeResponse === 'completed');
  if (!config.allowTestFaceAdapter || config.isProduction || !developmentEvidence) {
    throw new ApiError(
      503,
      'FACE_MODEL_UNAVAILABLE',
      'The production face-verification provider is not configured',
    );
  }

  const event = await VerificationEvent.create({
    ...organizationFilter(user),
    employeeId: user.id,
    challengeId: challenge.id,
    type: 'face',
    outcome: 'passed',
    reason: 'DEVELOPMENT_ADAPTER',
  });
  const updated = await AttendanceChallenge.findOneAndUpdate(
    { _id: challenge.id, status: CHALLENGE_STATES.LOCATION_VERIFIED },
    {
      $set: {
        status: CHALLENGE_STATES.FACE_VERIFIED,
        faceEvidence: { verificationEventId: event.id, verifiedAt: new Date() },
      },
    },
    { new: true },
  );
  if (!updated) throw invalidChallenge();
  return { verified: true, verificationEventId: event.id };
}

export async function checkIn(user, challengeId) {
  const organization = await Organization.findById(user.organizationId).select('attendanceSettings timezone');
  if (!organization) throw new ApiError(404, 'ORGANIZATION_NOT_FOUND', 'Organization not found');
  const now = new Date();
  const policy = normalizeAttendancePolicy(organization.attendanceSettings);
  assertCheckInAllowed(policy, now, organization.timezone || 'UTC');

  const challenge = await AttendanceChallenge.findOneAndUpdate(
    {
      _id: challengeId,
      ...organizationFilter(user),
      employeeId: user.id,
      status: CHALLENGE_STATES.FACE_VERIFIED,
      expiresAt: { $gt: new Date() },
    },
    { $set: { status: CHALLENGE_STATES.CONSUMED } },
    { new: true },
  );
  if (!challenge) throw invalidChallenge('A verified single-use challenge is required');

  try {
    return await Attendance.create({
      ...organizationFilter(user),
      employeeId: user.id,
      departmentId: user.departmentId,
      officeId: challenge.officeId,
      workMode: challenge.workMode,
      wfhRequestId: challenge.wfhRequestId,
      attendanceDate: localDateKey(now, organization?.timezone || 'UTC'),
      checkInAt: now,
      timingStatus: 'working',
      policySnapshot: { ...policy, timezone: organization.timezone || 'UTC' },
      verificationEventIds: [
        challenge.locationEvidence?.verificationEventId,
        challenge.faceEvidence?.verificationEventId,
      ].filter(Boolean),
      locationVerification: {
        distanceMeters: challenge.locationEvidence?.distance,
        accuracyMeters: challenge.locationEvidence?.accuracy,
        verifiedAt: challenge.locationEvidence?.verifiedAt,
      },
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw new ApiError(409, 'ALREADY_CHECKED_IN', 'An active work session already exists');
    }
    throw error;
  }
}

export async function checkOut(user) {
  const now = new Date();
  const active = await Attendance.findOneAndUpdate(
    {
      ...organizationFilter(user),
      employeeId: user.id,
      sessionStatus: 'working',
    },
    { $set: { checkOutAt: now, sessionStatus: 'completed' } },
    { new: false },
  );
  if (!active) throw new ApiError(409, 'NO_ACTIVE_SESSION', 'No active work session');

  if (!active.policySnapshot?.timezone) {
    const organization = await Organization.findById(user.organizationId).select('attendanceSettings timezone');
    const policy = normalizeAttendancePolicy(organization?.attendanceSettings);
    active.policySnapshot = { ...policy, timezone: organization?.timezone || 'UTC' };
  }
  const summary = calculateAttendanceSummary(active, now);
  return Attendance.findByIdAndUpdate(
    active.id,
    { $set: { ...summary, policySnapshot: active.policySnapshot } },
    { new: true },
  );
}

export async function getLatestAttendance(user) {
  const organization = await Organization.findById(user.organizationId).select('timezone');
  const attendanceDate = localDateKey(new Date(), organization?.timezone || 'UTC');
  return Attendance.findOne({ ...organizationFilter(user), employeeId: user.id, attendanceDate })
    .populate('officeId', 'name address radiusMeters')
    .sort({ checkInAt: -1 });
}

export async function getAttendanceHistory(user, pagination) {
  const query = { ...organizationFilter(user), employeeId: user.id };
  const [items, total] = await Promise.all([
    Attendance.find(query)
      .populate('officeId', 'name address radiusMeters')
      .sort({ checkInAt: -1 })
      .skip((pagination.page - 1) * pagination.limit)
      .limit(pagination.limit),
    Attendance.countDocuments(query),
  ]);
  return { items, total, ...pagination, pages: Math.ceil(total / pagination.limit) };
}

export async function getAttendanceReport(user, filters) {
  const query = organizationFilter(user);
  if (filters.from || filters.to) {
    query.checkInAt = {
      ...(filters.from && { $gte: filters.from }),
      ...(filters.to && { $lte: filters.to }),
    };
  }
  if (filters.employeeId) query.employeeId = filters.employeeId;
  if (filters.officeId) query.officeId = filters.officeId;
  if (filters.departmentId) query.departmentId = filters.departmentId;
  if (filters.status) query.status = filters.status;

  const [items, total] = await Promise.all([
    Attendance.find(query)
      .populate('employeeId', 'name employeeCode')
      .populate('officeId', 'name')
      .sort({ checkInAt: -1 })
      .skip((filters.page - 1) * filters.limit)
      .limit(filters.limit),
    Attendance.countDocuments(query),
  ]);
  return { items, total, page: filters.page, limit: filters.limit, pages: Math.ceil(total / filters.limit) };
}
