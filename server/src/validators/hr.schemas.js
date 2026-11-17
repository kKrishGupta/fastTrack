import { z } from 'zod';
import { objectIdSchema, paginationSchema } from './common.schemas.js';

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
