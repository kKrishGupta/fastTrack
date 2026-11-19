import { describe, expect, it } from 'vitest';
import { resolveFaceAdapter, startEnrollment } from '../src/services/enrollment.service.js';

describe('face enrollment adapter selection', () => {
  it('prefers the configured production identity provider', () => {
    expect(resolveFaceAdapter({ faceProvider: 'aws-rekognition', isProduction: true })).toBe('aws-rekognition');
  });
  it('uses the test adapter only outside production', () => {
    expect(resolveFaceAdapter({ isProduction: false, allowTestFaceAdapter: true })).toBe('development-test-only');
    expect(() => resolveFaceAdapter({ isProduction: true, allowTestFaceAdapter: true })).toThrow(/disabled/i);
  });

  it('allows an explicitly enabled, clearly labelled demo evidence mode', () => {
    expect(resolveFaceAdapter({ isProduction: true, allowDemoFaceAdapter: true })).toBe('demo-capture-evidence');
  });

  it('fails closed when no adapter is configured', () => {
    expect(() => resolveFaceAdapter({ isProduction: true })).toThrow(/ALLOW_DEMO_FACE_ADAPTER/);
  });

  it('requires HR approval before replacing a completed face profile', async () => {
    await expect(startEnrollment({
      enrollmentStatus: 'complete',
      faceReenrollmentAuthorizedUntil: new Date(Date.now() - 1000),
    }, {
      isProduction: true,
      allowDemoFaceAdapter: true,
    })).rejects.toMatchObject({ code: 'FACE_REENROLLMENT_APPROVAL_REQUIRED', status: 403 });
  });
});
