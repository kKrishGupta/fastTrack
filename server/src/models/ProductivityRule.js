import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  kind: { type: String, enum: ['app', 'domain'], required: true },
  match: { type: String, required: true, maxlength: 300 },
  classification: { type: String, enum: ['productive', 'unproductive', 'neutral'], required: true },
}, { timestamps: true });
schema.index({ organizationId: 1, kind: 1, match: 1 }, { unique: true });
export const ProductivityRule = mongoose.model('ProductivityRule', schema);
