import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const organizationOwnedFields = {
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  active: { type: Boolean, default: true },
};

const schemaOptions = { timestamps: true };

const organizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true, unique: true },
    timezone: { type: String, default: 'Asia/Kolkata' },
    active: { type: Boolean, default: true },
    attendanceSettings: {
      accuracyMax: { type: Number, default: 80, min: 1, max: 10_000 },
      challengeMinutes: { type: Number, default: 5, min: 1, max: 15 },
      workingDays: { type: [Number], default: [1, 2, 3, 4, 5] },
      checkInWindowStart: { type: String, default: '09:00' },
      checkInWindowEnd: { type: String, default: '09:30' },
      expectedCheckOutTime: { type: String, default: '18:00' },
      standardWorkMinutes: { type: Number, default: 540, min: 1, max: 1440 },
      overtimeEnabled: { type: Boolean, default: true },
      overtimeAfterMinutes: { type: Number, default: 540, min: 1, max: 1440 },
    },
  },
  schemaOptions,
);

const departmentSchema = new Schema(
  {
    ...organizationOwnedFields,
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, maxlength: 500 },
  },
  schemaOptions,
);
departmentSchema.index({ organizationId: 1, name: 1 }, { unique: true });

const shiftSchema = new Schema(
  {
    ...organizationOwnedFields,
    name: { type: String, required: true, trim: true },
    startTime: { type: String, default: '09:00' },
    endTime: { type: String, default: '18:00' },
    graceMinutes: { type: Number, default: 15, min: 0 },
    workingDays: { type: [Number], default: [1, 2, 3, 4, 5] },
  },
  schemaOptions,
);

const userSchema = new Schema(
  {
    ...organizationOwnedFields,
    employeeCode: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: {
      type: String,
      required() { return this.status === 'active'; },
      select: false,
    },
    role: { type: String, enum: ['HR', 'Employee'], required: true },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department' },
    shiftId: { type: Schema.Types.ObjectId, ref: 'Shift' },
    jobTitle: { type: String, trim: true },
    status: { type: String, enum: ['active', 'inactive', 'invited'], default: 'active' },
    enrollmentStatus: {
      type: String,
      enum: ['not_started', 'authorized', 'complete', 'disabled'],
      default: 'not_started',
    },
    biometricConsentAt: Date,
    faceReenrollmentRequestedAt: Date,
    faceReenrollmentAuthorizedAt: Date,
    faceReenrollmentAuthorizedUntil: Date,
    faceReenrollmentAuthorizedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  schemaOptions,
);
userSchema.index({ organizationId: 1, email: 1 }, { unique: true });
userSchema.index(
  { organizationId: 1, employeeCode: 1 },
  { unique: true, partialFilterExpression: { employeeCode: { $type: 'string' } } },
);

const officeSchema = new Schema(
  {
    ...organizationOwnedFields,
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, maxlength: 500 },
    address: { type: String, trim: true, maxlength: 500 },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point', required: true },
      coordinates: {
        type: [Number],
        required: true,
        validate: {
          validator: (coordinates) =>
            coordinates.length === 2 &&
            coordinates.every(Number.isFinite) &&
            Math.abs(coordinates[0]) <= 180 &&
            Math.abs(coordinates[1]) <= 90,
          message: 'Office coordinates must be [longitude, latitude]',
        },
      },
    },
    radiusMeters: { type: Number, min: 25, max: 5000, required: true },
  },
  schemaOptions,
);
officeSchema.index({ location: '2dsphere' });
officeSchema.index({ organizationId: 1, name: 1 });

const officeAssignmentSchema = new Schema(
  {
    ...organizationOwnedFields,
    employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    officeId: { type: Schema.Types.ObjectId, ref: 'Office', required: true },
    validFrom: Date,
    validUntil: Date,
  },
  schemaOptions,
);
officeAssignmentSchema.index(
  { organizationId: 1, employeeId: 1, officeId: 1 },
  { unique: true },
);

const workFromHomeRequestSchema = new Schema(
  {
    ...organizationOwnedFields,
    employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    requestDate: { type: String, required: true },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    locationLabel: { type: String, trim: true, maxlength: 200 },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point', required: true },
      coordinates: { type: [Number], required: true },
    },
    radiusMeters: { type: Number, min: 100, max: 1000, default: 250 },
    requestedAccuracyMeters: { type: Number, min: 0 },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'cancelled'], default: 'pending', index: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    reviewNote: { type: String, trim: true, maxlength: 500 },
  },
  schemaOptions,
);
workFromHomeRequestSchema.index({ organizationId: 1, employeeId: 1, requestDate: 1 }, { unique: true });
workFromHomeRequestSchema.index({ location: '2dsphere' });

const faceProfileSchema = new Schema(
  {
    ...organizationOwnedFields,
    employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    encryptedTemplate: { type: String, required: true, select: false },
    iv: { type: String, select: false },
    authTag: { type: String, select: false },
    modelId: String,
    modelVersion: String,
    provider: { type: String, default: 'evidence-only' },
    referenceImageEncrypted: { type: String, select: false },
    referenceImageIv: { type: String, select: false },
    referenceImageAuthTag: { type: String, select: false },
    referenceMimeType: { type: String, enum: ['image/jpeg'] },
    status: { type: String, enum: ['active', 'revoked'], default: 'active' },
  },
  schemaOptions,
);
faceProfileSchema.index({ organizationId: 1, employeeId: 1 }, { unique: true });

const enrollmentSessionSchema = new Schema(
  {
    ...organizationOwnedFields,
    employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    adapter: { type: String, enum: ['aws-rekognition', 'development-test-only', 'demo-capture-evidence'] },
    status: { type: String, enum: ['active', 'complete', 'expired'], default: 'active', index: true },
    expiresAt: { type: Date, required: true },
    captures: [{
      _id: false,
      pose: { type: String, enum: ['Front', 'Left', 'Right', 'Up', 'Down'], required: true },
      frameHash: { type: String, required: true },
      encryptedFrame: { type: String, select: false },
      frameIv: { type: String, select: false },
      frameAuthTag: { type: String, select: false },
      frameMimeType: { type: String, enum: ['image/jpeg'] },
      quality: {
        brightness: Number,
        sharpness: Number,
        yaw: Number,
        pitch: Number,
        roll: Number,
      },
      capturedAt: { type: Date, default: Date.now },
    }],
  },
  schemaOptions,
);
enrollmentSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
enrollmentSessionSchema.index({ organizationId: 1, employeeId: 1, status: 1 });

const attendanceChallengeSchema = new Schema(
  {
    ...organizationOwnedFields,
    employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    officeId: { type: Schema.Types.ObjectId, ref: 'Office' },
    workMode: { type: String, enum: ['OFFICE', 'WFH'], default: 'OFFICE' },
    wfhRequestId: { type: Schema.Types.ObjectId, ref: 'WorkFromHomeRequest' },
    expiresAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ['created', 'location_verified', 'face_verified', 'consumed', 'failed'],
      default: 'created',
      index: true,
    },
    locationEvidence: {
      verificationEventId: { type: Schema.Types.ObjectId, ref: 'VerificationEvent' },
      distance: Number,
      accuracy: Number,
      verifiedAt: Date,
    },
    faceEvidence: {
      verificationEventId: { type: Schema.Types.ObjectId, ref: 'VerificationEvent' },
      evidenceId: { type: Schema.Types.ObjectId, ref: 'FaceEvidence' },
      provider: String,
      similarity: Number,
      threshold: Number,
      verifiedAt: Date,
    },
  },
  schemaOptions,
);
attendanceChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
attendanceChallengeSchema.index({ organizationId: 1, employeeId: 1, status: 1 });

const verificationEventSchema = new Schema(
  {
    ...organizationOwnedFields,
    employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    challengeId: { type: Schema.Types.ObjectId, ref: 'AttendanceChallenge' },
    type: { type: String, enum: ['location', 'face'], required: true },
    outcome: { type: String, enum: ['passed', 'failed'], required: true },
    reason: String,
    risk: { type: String, default: 'standard' },
    metadata: Schema.Types.Mixed,
  },
  schemaOptions,
);
verificationEventSchema.index({ organizationId: 1, employeeId: 1, createdAt: -1 });

const faceEvidenceSchema = new Schema(
  {
    ...organizationOwnedFields,
    employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    challengeId: { type: Schema.Types.ObjectId, ref: 'AttendanceChallenge', required: true },
    verificationEventId: { type: Schema.Types.ObjectId, ref: 'VerificationEvent' },
    encryptedImage: { type: String, required: true, select: false },
    iv: { type: String, required: true, select: false },
    authTag: { type: String, required: true, select: false },
    mimeType: { type: String, enum: ['image/jpeg'], required: true },
    provider: { type: String, required: true },
    matched: { type: Boolean, required: true },
    similarity: { type: Number, min: 0, max: 100 },
    threshold: { type: Number, min: 0, max: 100 },
    capturedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  schemaOptions,
);
faceEvidenceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
faceEvidenceSchema.index({ organizationId: 1, employeeId: 1, capturedAt: -1 });

const attendanceSchema = new Schema(
  {
    ...organizationOwnedFields,
    employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department' },
    officeId: { type: Schema.Types.ObjectId, ref: 'Office' },
    workMode: { type: String, enum: ['OFFICE', 'WFH'], default: 'OFFICE', index: true },
    wfhRequestId: { type: Schema.Types.ObjectId, ref: 'WorkFromHomeRequest' },
    attendanceDate: { type: String, required: true },
    checkInAt: { type: Date, required: true },
    checkOutAt: Date,
    status: { type: String, default: 'present' },
    sessionStatus: { type: String, enum: ['working', 'completed'], default: 'working' },
    verificationEventIds: [{ type: Schema.Types.ObjectId, ref: 'VerificationEvent' }],
    locationVerification: {
      distanceMeters: { type: Number, min: 0 },
      accuracyMeters: { type: Number, min: 0 },
      verifiedAt: Date,
    },
    faceVerification: {
      evidenceId: { type: Schema.Types.ObjectId, ref: 'FaceEvidence' },
      provider: String,
      similarity: Number,
      threshold: Number,
      verifiedAt: Date,
    },
    workedMinutes: { type: Number, min: 0 },
    regularMinutes: { type: Number, min: 0 },
    overtimeMinutes: { type: Number, min: 0, default: 0 },
    earlyExitMinutes: { type: Number, min: 0, default: 0 },
    timingStatus: {
      type: String,
      enum: ['working', 'completed', 'early_exit', 'overtime'],
      index: true,
    },
    policySnapshot: {
      timezone: String,
      workingDays: [Number],
      checkInWindowStart: String,
      checkInWindowEnd: String,
      expectedCheckOutTime: String,
      standardWorkMinutes: Number,
      overtimeEnabled: Boolean,
      overtimeAfterMinutes: Number,
    },
  },
  schemaOptions,
);
attendanceSchema.index(
  { organizationId: 1, employeeId: 1, sessionStatus: 1 },
  { unique: true, partialFilterExpression: { sessionStatus: 'working' } },
);
attendanceSchema.index({ organizationId: 1, checkInAt: -1 });

const auditLogSchema = new Schema(
  {
    ...organizationOwnedFields,
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: Schema.Types.ObjectId,
    metadata: Schema.Types.Mixed,
  },
  schemaOptions,
);
auditLogSchema.index({ organizationId: 1, createdAt: -1 });

const employeeInvitationSchema = new Schema(
  {
    ...organizationOwnedFields,
    employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    tokenHash: { type: String, required: true, unique: true, select: false },
    expiresAt: { type: Date, required: true, index: true },
    acceptedAt: Date,
    emailProviderId: String,
    emailSentAt: Date,
    status: {
      type: String,
      enum: ['pending', 'accepted', 'revoked', 'expired'],
      default: 'pending',
      index: true,
    },
  },
  schemaOptions,
);
employeeInvitationSchema.index({ organizationId: 1, employeeId: 1, status: 1 });

export const Organization = model('Organization', organizationSchema);
export const Department = model('Department', departmentSchema);
export const Shift = model('Shift', shiftSchema);
export const User = model('User', userSchema);
export const Office = model('Office', officeSchema);
export const OfficeAssignment = model('OfficeAssignment', officeAssignmentSchema);
export const WorkFromHomeRequest = model('WorkFromHomeRequest', workFromHomeRequestSchema);
export const FaceProfile = model('FaceProfile', faceProfileSchema);
export const EnrollmentSession = model('EnrollmentSession', enrollmentSessionSchema);
export const AttendanceChallenge = model('AttendanceChallenge', attendanceChallengeSchema);
export const VerificationEvent = model('VerificationEvent', verificationEventSchema);
export const FaceEvidence = model('FaceEvidence', faceEvidenceSchema);
export const Attendance = model('Attendance', attendanceSchema);
export const AuditLog = model('AuditLog', auditLogSchema);
export const EmployeeInvitation = model('EmployeeInvitation', employeeInvitationSchema);
