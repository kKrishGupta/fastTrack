import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createAuthController } from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/async-handler.js';
import { loginSchema, registerOrganizationSchema } from '../validators/auth.schemas.js';

export function createOrganizationRouter({ config }) {
  const router = Router();
  const controller = createAuthController(config);
  const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });
  const registrationLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 5, standardHeaders: true, legacyHeaders: false });

  router.post('/login', loginLimiter, validate(loginSchema), asyncHandler(controller.organizationLogin));
  router.post('/register', registrationLimiter, validate(registerOrganizationSchema), asyncHandler(controller.registerOrganization));
  return router;
}
