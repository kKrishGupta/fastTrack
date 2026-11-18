import { Organization } from '../models.js';
import { ApiError } from '../utils/api-error.js';
import { localDateKey } from '../utils/time.js';

export const DEFAULT_ATTENDANCE_POLICY = Object.freeze({
  workingDays: Object.freeze([1, 2, 3, 4, 5]),
  checkInWindowStart: '09:00',
  checkInWindowEnd: '09:30',
  expectedCheckOutTime: '18:00',
  standardWorkMinutes: 540,
  overtimeEnabled: true,
  overtimeAfterMinutes: 540,
});

const DAY_NAMES = Object.freeze(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);

export function timeToMinutes(value) {
  const [hours, minutes] = String(value || '').split(':').map(Number);
  return (hours * 60) + minutes;
}

export function normalizeAttendancePolicy(settings = {}) {
  return {
    workingDays: Array.isArray(settings.workingDays) && settings.workingDays.length
      ? [...settings.workingDays].sort((left, right) => left - right)
      : [...DEFAULT_ATTENDANCE_POLICY.workingDays],
    checkInWindowStart: settings.checkInWindowStart || DEFAULT_ATTENDANCE_POLICY.checkInWindowStart,
    checkInWindowEnd: settings.checkInWindowEnd || DEFAULT_ATTENDANCE_POLICY.checkInWindowEnd,
    expectedCheckOutTime: settings.expectedCheckOutTime || DEFAULT_ATTENDANCE_POLICY.expectedCheckOutTime,
    standardWorkMinutes: settings.standardWorkMinutes ?? DEFAULT_ATTENDANCE_POLICY.standardWorkMinutes,
    overtimeEnabled: settings.overtimeEnabled ?? DEFAULT_ATTENDANCE_POLICY.overtimeEnabled,
    overtimeAfterMinutes: settings.overtimeAfterMinutes ?? DEFAULT_ATTENDANCE_POLICY.overtimeAfterMinutes,
  };
}

export function zonedClock(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return { time: `${values.hour}:${values.minute}`, minutes: (Number(values.hour) * 60) + Number(values.minute) };
}

function localWeekday(date, timezone) {
  const dateKey = localDateKey(date, timezone);
  return { dateKey, weekday: new Date(`${dateKey}T12:00:00.000Z`).getUTCDay() };
}

export function evaluateCheckInPolicy(policyInput, date = new Date(), timezone = 'UTC') {
  const policy = normalizeAttendancePolicy(policyInput);
  const { dateKey, weekday } = localWeekday(date, timezone);
  const clock = zonedClock(date, timezone);
  const response = {
    date: dateKey,
    day: DAY_NAMES[weekday],
    weekday,
    currentTime: clock.time,
    isWorkingDay: policy.workingDays.includes(weekday),
    canCheckIn: false,
    code: null,
    message: '',
  };

  if (!response.isWorkingDay) {
    return { ...response, code: 'NON_WORKING_DAY', message: `${response.day} is not a scheduled working day` };
  }
  const startsAt = timeToMinutes(policy.checkInWindowStart);
  const endsAt = timeToMinutes(policy.checkInWindowEnd);
  if (clock.minutes < startsAt) {
    return { ...response, code: 'CHECK_IN_NOT_OPEN', message: `Check-in opens at ${policy.checkInWindowStart}` };
  }
  if (clock.minutes > endsAt) {
    return { ...response, code: 'CHECK_IN_WINDOW_CLOSED', message: `Check-in closed at ${policy.checkInWindowEnd}` };
  }
  return { ...response, canCheckIn: true, code: 'CHECK_IN_ALLOWED', message: `Check-in is open until ${policy.checkInWindowEnd}` };
}

export function calculateAttendanceSummary(attendance, checkOutAt = new Date()) {
  const checkInAt = new Date(attendance.checkInAt);
  const workedMinutes = Math.max(0, Math.round((checkOutAt.getTime() - checkInAt.getTime()) / 60_000));
  const snapshot = attendance.policySnapshot || {};
  const policy = normalizeAttendancePolicy(snapshot);
  const timezone = snapshot.timezone || 'UTC';
  const checkOutDate = localDateKey(checkOutAt, timezone);
  const checkOutClock = zonedClock(checkOutAt, timezone);
  const expectedCheckOut = timeToMinutes(policy.expectedCheckOutTime);
  const earlyExitMinutes = checkOutDate === attendance.attendanceDate
    ? Math.max(0, expectedCheckOut - checkOutClock.minutes)
    : 0;
  const overtimeMinutes = policy.overtimeEnabled && earlyExitMinutes === 0
    ? Math.max(0, workedMinutes - policy.overtimeAfterMinutes)
    : 0;
  const timingStatus = earlyExitMinutes > 0 ? 'early_exit' : overtimeMinutes > 0 ? 'overtime' : 'completed';

  return {
    workedMinutes,
    regularMinutes: Math.max(0, workedMinutes - overtimeMinutes),
    overtimeMinutes,
    earlyExitMinutes,
    timingStatus,
  };
}

export async function getAttendancePolicy(user, now = new Date()) {
  const organization = await Organization.findOne({ _id: user.organizationId, active: true })
    .select('attendanceSettings timezone');
  if (!organization) throw new ApiError(404, 'ORGANIZATION_NOT_FOUND', 'Organization not found');
  const policy = normalizeAttendancePolicy(organization.attendanceSettings);
  const timezone = organization.timezone || 'UTC';
  return { policy, timezone, today: evaluateCheckInPolicy(policy, now, timezone) };
}

export async function updateAttendancePolicy(user, data) {
  const updates = Object.fromEntries(
    Object.entries(data).map(([key, value]) => [`attendanceSettings.${key}`, value]),
  );
  const organization = await Organization.findOneAndUpdate(
    { _id: user.organizationId, active: true },
    { $set: updates },
    { new: true, runValidators: true },
  ).select('attendanceSettings timezone');
  if (!organization) throw new ApiError(404, 'ORGANIZATION_NOT_FOUND', 'Organization not found');
  const policy = normalizeAttendancePolicy(organization.attendanceSettings);
  const timezone = organization.timezone || 'UTC';
  return { policy, timezone, today: evaluateCheckInPolicy(policy, new Date(), timezone) };
}

export function assertCheckInAllowed(policy, date, timezone) {
  const evaluation = evaluateCheckInPolicy(policy, date, timezone);
  if (!evaluation.canCheckIn) {
    throw new ApiError(422, evaluation.code, evaluation.message, evaluation);
  }
  return evaluation;
}
