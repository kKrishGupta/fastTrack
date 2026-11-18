import { describe, expect, it } from 'vitest';
import {
  calculateAttendanceSummary,
  evaluateCheckInPolicy,
  normalizeAttendancePolicy,
} from '../src/services/attendance-policy.service.js';

const policy = normalizeAttendancePolicy({
  workingDays: [1, 2, 3, 4, 5],
  checkInWindowStart: '09:00',
  checkInWindowEnd: '09:30',
  expectedCheckOutTime: '18:00',
  standardWorkMinutes: 480,
  overtimeEnabled: true,
  overtimeAfterMinutes: 480,
});

describe('attendance policy', () => {
  it('allows check-in inside the configured local-time window', () => {
    const result = evaluateCheckInPolicy(policy, new Date('2026-11-18T03:45:00.000Z'), 'Asia/Kolkata');
    expect(result).toMatchObject({ canCheckIn: true, currentTime: '09:15', day: 'Wednesday' });
  });

  it('blocks check-in outside the window and on weekly off days', () => {
    expect(evaluateCheckInPolicy(policy, new Date('2026-11-18T04:15:00.000Z'), 'Asia/Kolkata').code)
      .toBe('CHECK_IN_WINDOW_CLOSED');
    expect(evaluateCheckInPolicy(policy, new Date('2026-11-22T03:45:00.000Z'), 'Asia/Kolkata').code)
      .toBe('NON_WORKING_DAY');
  });

  it('marks checkout before the planned time as an early exit', () => {
    const result = calculateAttendanceSummary({
      checkInAt: new Date('2026-11-18T03:45:00.000Z'),
      attendanceDate: '2026-11-18',
      policySnapshot: { ...policy, timezone: 'Asia/Kolkata' },
    }, new Date('2026-11-18T11:30:00.000Z'));
    expect(result).toEqual({
      workedMinutes: 465,
      regularMinutes: 465,
      overtimeMinutes: 0,
      earlyExitMinutes: 60,
      timingStatus: 'early_exit',
    });
  });

  it('calculates overtime only after the configured threshold and checkout time', () => {
    const result = calculateAttendanceSummary({
      checkInAt: new Date('2026-11-18T03:45:00.000Z'),
      attendanceDate: '2026-11-18',
      policySnapshot: { ...policy, timezone: 'Asia/Kolkata' },
    }, new Date('2026-11-18T13:00:00.000Z'));
    expect(result).toMatchObject({ workedMinutes: 555, regularMinutes: 480, overtimeMinutes: 75, earlyExitMinutes: 0, timingStatus: 'overtime' });
  });
});
