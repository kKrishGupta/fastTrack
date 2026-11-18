import { Router } from 'express';
import { createAttendanceController } from '../controllers/attendance.controller.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/async-handler.js';
import { challengeSchema, checkInSchema, faceVerificationSchema, historyQuerySchema, locationVerificationSchema } from '../validators/attendance.schemas.js';

export function createAttendanceRouter({ config, authenticate }) {
  const router = Router();
  const controller = createAttendanceController(config);
  router.use(authenticate, requireRole('Employee'));
  router.post('/challenge', validate(challengeSchema), asyncHandler(controller.createChallenge));
  router.post('/verify-location', validate(locationVerificationSchema), asyncHandler(controller.verifyLocation));
  router.post('/verify-face', validate(faceVerificationSchema), asyncHandler(controller.verifyFace));
  router.post('/check-in', validate(checkInSchema), asyncHandler(controller.checkIn));
  router.post('/check-out', asyncHandler(controller.checkOut));
  router.get('/policy', asyncHandler(controller.policy));
  router.get('/today', asyncHandler(controller.today));
  router.get('/history', validate(historyQuerySchema, 'query'), asyncHandler(controller.history));
  return router;
}
