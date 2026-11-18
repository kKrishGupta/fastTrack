import { Router } from 'express';
import * as departments from '../controllers/department.controller.js';
import * as employees from '../controllers/employee.controller.js';
import * as offices from '../controllers/office.controller.js';
import { createAttendanceController } from '../controllers/attendance.controller.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/async-handler.js';
import { idParamsSchema } from '../validators/common.schemas.js';
import { assignmentSchema, attendancePolicySchema, attendanceReportQuerySchema, createDepartmentSchema, createOfficeSchema, employeeQuerySchema, inviteEmployeeSchema, updateDepartmentSchema, updateOfficeSchema } from '../validators/hr.schemas.js';
import * as wfh from '../controllers/wfh.controller.js';
import { reviewWfhRequestSchema, wfhIdParamsSchema, wfhQuerySchema } from '../validators/wfh.schemas.js';

export function createHrRouter({ config, authenticate }) {
  const router = Router();
  const attendance = createAttendanceController(config);
  router.use(authenticate, requireRole('HR'));
  router.get('/departments', asyncHandler(departments.list));
  router.post('/departments', validate(createDepartmentSchema), asyncHandler(departments.create));
  router.patch('/departments/:id', validate(idParamsSchema, 'params'), validate(updateDepartmentSchema), asyncHandler(departments.update));
  router.get('/employees', validate(employeeQuerySchema, 'query'), asyncHandler(employees.list));
  router.post('/employees/invitations', validate(inviteEmployeeSchema), asyncHandler(employees.invite));
  router.delete('/employees/:id/invitations', validate(idParamsSchema, 'params'), asyncHandler(employees.revokeInvitations));
  router.delete('/employees/:id', validate(idParamsSchema, 'params'), asyncHandler(employees.remove));
  router.get('/offices', asyncHandler(offices.list));
  router.post('/offices', validate(createOfficeSchema), asyncHandler(offices.create));
  router.patch('/offices/:id', validate(idParamsSchema, 'params'), validate(updateOfficeSchema), asyncHandler(offices.update));
  router.post('/offices/:id/assignments', validate(idParamsSchema, 'params'), validate(assignmentSchema), asyncHandler(offices.assign));
  router.get('/attendance-policy', asyncHandler(attendance.policy));
  router.put('/attendance-policy', validate(attendancePolicySchema), asyncHandler(attendance.updatePolicy));
  router.get('/attendance', validate(attendanceReportQuerySchema, 'query'), asyncHandler(attendance.report));
  router.get('/face-evidence', validate(attendanceReportQuerySchema.pick({ page: true, limit: true }), 'query'), asyncHandler(attendance.faceEvidenceList));
  router.get('/face-evidence/:id', validate(idParamsSchema, 'params'), asyncHandler(attendance.faceEvidence));
  router.get('/wfh-requests', validate(wfhQuerySchema, 'query'), asyncHandler(wfh.organizationList));
  router.patch('/wfh-requests/:id', validate(wfhIdParamsSchema, 'params'), validate(reviewWfhRequestSchema), asyncHandler(wfh.review));
  return router;
}
