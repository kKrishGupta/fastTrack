import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, unique: true },
  version: { type: Number, default: 1, min: 1 },
  enabled: { type: Boolean, default: true },
  includeTitles: { type: Boolean, default: false },
  browserEnabled: { type: Boolean, default: false },
  browserUrlMode: { type: String, enum: ['domain', 'origin', 'path', 'full'], default: 'domain' },
  browserTitleEnabled: { type: Boolean, default: false },
  approvedBrowserBuckets: [{ type: String, maxlength: 300 }],
  excludedApps: [{ type: String, maxlength: 300 }],
  excludedDomains: [{ type: String, maxlength: 253 }],
  requireAttendance: { type: Boolean, default: false },
  retentionDays: { type: Number, default: 30, min: 1, max: 90 },
  screenshotsEnabled: { type: Boolean, default: false },
  screenshotIntervalSeconds: { type: Number, default: 300, min: 60, max: 3600 },
  screenshotRetentionDays: { type: Number, default: 7, min: 1, max: 30 },
  screenshotDisplayMode: { type: String, enum: ['primary', 'all'], default: 'primary' },
  screenshotExcludedApps: [{ type: String, maxlength: 300 }],
}, { timestamps: true });
export const MonitoringPolicy = mongoose.model('MonitoringPolicy', schema);
