import { describe, expect, it, vi } from 'vitest';

const writeAudit = vi.hoisted(() => vi.fn());
vi.mock('../src/services/audit.service.js', () => ({ writeAudit }));

import { requestFaceReenrollment, resolveFaceAdapter, startEnrollment } from '../src/services/enrollment.service.js';

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

  it('records an employee request to replace the original reference face', async () => {
    const user = {
      id: 'employee-1',
      organizationId: 'org-1',
      enrollmentStatus: 'complete',
      save: vi.fn().mockResolvedValue(undefined),
    };

    await expect(requestFaceReenrollment(user)).resolves.toBe(user);
    expect(user.faceReenrollmentRequestedAt).toBeInstanceOf(Date);
    expect(user.save).toHaveBeenCalledOnce();
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'face.reenrollment.requested',
      entityId: user.id,
    }));
  });
});
