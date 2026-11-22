import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  deviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'MonitoringDevice', required: true, index: true },
  captureId: { type: String, required: true, maxlength: 36 },
  storageProvider: { type: String, enum: ['cloudinary'], default: 'cloudinary', required: true },
  cloudinaryPublicId: { type: String, required: true, select: false },
  cloudinaryAssetId: { type: String, select: false },
  cloudinaryVersion: { type: Number, select: false },
  format: { type: String, enum: ['png'], default: 'png' },
  status: { type: String, enum: ['pending', 'available'], default: 'pending', index: true },
  capturedAt: { type: Date, required: true, index: true },
  width: { type: Number, required: true, min: 1, max: 32768 },
  height: { type: Number, required: true, min: 1, max: 32768 },
  byteLength: { type: Number, required: true, min: 1, max: 10 * 1024 * 1024 },
  sha256: { type: String, required: true, select: false },
  expiresAt: { type: Date, required: true, index: true },
}, { timestamps: true });

schema.index({ deviceId: 1, captureId: 1 }, { unique: true });
schema.index({ organizationId: 1, employeeId: 1, capturedAt: -1 });
schema.index({ expiresAt: 1, status: 1 });

export const ScreenshotCapture = mongoose.model('ScreenshotCapture', schema);
