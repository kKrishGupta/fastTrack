import { describe, expect, it } from 'vitest';
import { resolveFaceAdapter } from '../src/services/enrollment.service.js';

describe('face enrollment adapter selection', () => {
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
});
