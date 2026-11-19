import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createAuthController } from '../controllers/auth.controller.js';
import { createEnrollmentController } from '../controllers/enrollment.controller.js';
import { listForEmployee } from '../controllers/office.controller.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/async-handler.js';
import { acceptInvitationSchema, employeeLoginSchema, invitationTokenParamsSchema } from '../validators/auth.schemas.js';
import { enrollmentCaptureSchema, enrollmentCompleteSchema } from '../validators/enrollment.schemas.js';
import * as wfh from '../controllers/wfh.controller.js';
import { createWfhRequestSchema, wfhQuerySchema } from '../validators/wfh.schemas.js';

export function createEmployeeRouter({ config, authenticate }) {
  const router = Router();
  const controller = createAuthController(config);
  const enrollment = createEnrollmentController(config);
  const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });

  router.post('/login', loginLimiter, validate(employeeLoginSchema), asyncHandler(controller.employeeLogin));
  router.get('/invitations/:token', validate(invitationTokenParamsSchema, 'params'), asyncHandler(controller.invitation));
  router.post('/invitations/accept', loginLimiter, validate(acceptInvitationSchema), asyncHandler(controller.acceptInvitation));
  router.use(authenticate, requireRole('Employee'));
  router.get('/offices', asyncHandler(listForEmployee));
  router.get('/wfh-requests', validate(wfhQuerySchema, 'query'), asyncHandler(wfh.employeeList));
  router.post('/wfh-requests', validate(createWfhRequestSchema), asyncHandler(wfh.create));
  router.post('/enrollment/start', asyncHandler(enrollment.start));
  router.post('/enrollment/capture', validate(enrollmentCaptureSchema), asyncHandler(enrollment.capture));
  router.post('/enrollment/complete', validate(enrollmentCompleteSchema), asyncHandler(enrollment.complete));
  return router;
}
