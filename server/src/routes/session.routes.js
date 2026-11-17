import { Router } from 'express';
import { createAuthController } from '../controllers/auth.controller.js';
import { asyncHandler } from '../utils/async-handler.js';

export function createSessionRouter({ config, authenticate }) {
  const router = Router();
  const controller = createAuthController(config);

  // Logout must remain idempotent: an already-expired session should still clear
  // any residual cookies and return success instead of trapping the UI on a 401.
  router.post('/logout', asyncHandler(controller.logout));
  router.use(authenticate);
  router.get('/me', asyncHandler(controller.me));
  return router;
}
