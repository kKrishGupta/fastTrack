import { z } from 'zod';
import { objectIdSchema, paginationSchema } from './common.schemas.js';

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:mm format');
const minutesFromTime = (value) => value.split(':').map(Number).reduce((hours, minutes) => (hours * 60) + minutes);

export const attendancePolicySchema = z.object({
  workingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7).refine((days) => new Set(days).size === days.length, 'Working days must be unique'),
  checkInWindowStart: timeSchema,
  checkInWindowEnd: timeSchema,
  expectedCheckOutTime: timeSchema,
  standardWorkMinutes: z.number().int().min(1).max(1440),
  overtimeEnabled: z.boolean(),
  overtimeAfterMinutes: z.number().int().min(1).max(1440),
}).superRefine((value, context) => {
  if (minutesFromTime(value.checkInWindowStart) >= minutesFromTime(value.checkInWindowEnd)) {
    context.addIssue({ code: 'custom', path: ['checkInWindowEnd'], message: 'Check-in window must end after it starts' });
  }
  if (minutesFromTime(value.expectedCheckOutTime) <= minutesFromTime(value.checkInWindowStart)) {
    context.addIssue({ code: 'custom', path: ['expectedCheckOutTime'], message: 'Expected checkout must be after check-in starts' });
  }
  if (value.overtimeEnabled && value.overtimeAfterMinutes < value.standardWorkMinutes) {
    context.addIssue({ code: 'custom', path: ['overtimeAfterMinutes'], message: 'Overtime threshold cannot be below standard working minutes' });
  }
});

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional(),
});

export const updateDepartmentSchema = createDepartmentSchema.partial().extend({
  active: z.boolean().optional(),
});

export const employeeQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  departmentId: objectIdSchema.optional(),
  officeId: objectIdSchema.optional(),
  enrollmentStatus: z.enum(['not_started', 'authorized', 'complete', 'disabled']).optional(),
});

export const inviteEmployeeSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  employeeCode: z.string().trim().min(2).max(40),
  departmentId: objectIdSchema.optional(),
  shiftId: objectIdSchema.optional(),
  jobTitle: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(30).optional(),
});

export const createOfficeSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  address: z.string().trim().max(500).optional(),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  radiusMeters: z.number().finite().min(25).max(5000),
});

export const updateOfficeSchema = createOfficeSchema.partial().extend({
  active: z.boolean().optional(),
}).superRefine((value, context) => {
  if ((value.latitude === undefined) !== (value.longitude === undefined)) {
    context.addIssue({
      code: 'custom',
      path: value.latitude === undefined ? ['latitude'] : ['longitude'],
      message: 'Latitude and longitude must be updated together',
    });
  }
  if (Object.keys(value).length === 0) {
    context.addIssue({ code: 'custom', message: 'At least one office field is required' });
  }
});

export const assignmentSchema = z
  .object({
    employeeId: objectIdSchema,
    validFrom: z.coerce.date().optional(),
    validUntil: z.coerce.date().optional(),
  })
  .refine(
    (value) => !value.validFrom || !value.validUntil || value.validUntil >= value.validFrom,
    { message: 'validUntil must be on or after validFrom', path: ['validUntil'] },
  );

export const attendanceReportQuerySchema = paginationSchema.extend({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  employeeId: objectIdSchema.optional(),
  officeId: objectIdSchema.optional(),
  departmentId: objectIdSchema.optional(),
  status: z.string().trim().max(40).optional(),
});
