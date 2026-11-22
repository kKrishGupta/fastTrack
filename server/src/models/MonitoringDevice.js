import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, maxlength: 100 },
  hostname: { type: String, maxlength: 200 },
  status: { type: String, enum: ['pending', 'active', 'paused', 'revoked'], default: 'pending' },
  consentAt: { type: Date, required: true },
  consentVersion: { type: String, default: 'activitywatch-v1' },
  browserDetailsConsentAt: Date,
  screenshotConsentAt: Date,
  pairingHash: { type: String, select: false },
  pairingExpiresAt: Date,
  tokenHash: { type: String, select: false },
  previousTokenHash: { type: String, select: false },
  previousTokenExpiresAt: Date,
  rotationId: String,
  tokenGeneration: { type: Number, default: 1 },
  adminHold: { type: Boolean, default: false },
  employeePaused: { type: Boolean, default: false },
  tokenExpiresAt: Date,
  collectAfter: Date,
  lastSeenAt: Date,
  lastUploadAt: Date,
  activityWatchAvailable: Boolean,
  watchers: [{ type: String, enum: ['currentwindow', 'afkstatus', 'web.tab.current'] }],
  browserBuckets: [{ type: String, maxlength: 300 }],
}, { timestamps: true });
schema.index({ pairingHash: 1 }, { unique: true, partialFilterExpression: { pairingHash: { $type: 'string' } } });
schema.index({ tokenHash: 1 }, { unique: true, partialFilterExpression: { tokenHash: { $type: 'string' } } });

export const MonitoringDevice = mongoose.model('MonitoringDevice', schema);
