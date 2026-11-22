import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  deviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'MonitoringDevice', required: true },
  bucketId: { type: String, required: true, maxlength: 300 },
  sourceId: { type: String, required: true, maxlength: 200 },
  type: { type: String, enum: ['currentwindow', 'afkstatus', 'web.tab.current'], required: true },
  timestamp: { type: Date, required: true },
  duration: { type: Number, required: true, min: 0, max: 300 },
  app: { type: String, maxlength: 300 },
  title: { type: String, maxlength: 500 },
  domain: { type: String, maxlength: 253 },
  url: { type: String, maxlength: 2048 },
  status: { type: String, enum: ['afk', 'not-afk'] },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });
schema.index({ deviceId: 1, bucketId: 1, sourceId: 1 }, { unique: true });
schema.index({ organizationId: 1, employeeId: 1, timestamp: -1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const ActivityEvent = mongoose.model('ActivityEvent', schema);
