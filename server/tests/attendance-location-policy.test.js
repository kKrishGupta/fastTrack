import { describe, expect, it } from 'vitest';
import { resolveLocationAccuracyLimit } from '../src/services/attendance.service.js';

describe('attendance location accuracy policy', () => {
  it('keeps the organization limit in production mode', () => {
    expect(resolveLocationAccuracyLimit({ accuracyMax: 80 }, {
      isProduction: true,
      allowDemoFaceAdapter: false,
      devLocationAccuracyMax: 150,
    })).toBe(80);
  });

  it('uses the relaxed configured limit for an explicit deployed demo', () => {
    expect(resolveLocationAccuracyLimit({ accuracyMax: 80 }, {
      isProduction: true,
      allowDemoFaceAdapter: true,
      devLocationAccuracyMax: 150,
    })).toBe(150);
  });

  it('never makes a more permissive organization policy stricter', () => {
    expect(resolveLocationAccuracyLimit({ accuracyMax: 200 }, {
      allowDemoFaceAdapter: true,
      devLocationAccuracyMax: 150,
    })).toBe(200);
  });
});
