import { Router } from 'express';
import { createAuthenticate } from '../middleware/auth.js';
import { createAttendanceRouter } from './attendance.routes.js';
import { createEmployeeRouter } from './employee.routes.js';
import { createHrRouter } from './hr.routes.js';
import { createOrganizationRouter } from './organization.routes.js';
import { createSessionRouter } from './session.routes.js';
import { createMonitoringRouter } from './monitoring.routes.js';

export function createApiRouter(config) {
  const router = Router();
  const authenticate = createAuthenticate(config);
  const dependencies = { config, authenticate };
  router.get('/health', (req, res) => res.json({ status: 'ok' }));
  router.use('/organization', createOrganizationRouter(dependencies));
  router.use('/session', createSessionRouter(dependencies));
  router.use('/hr', createHrRouter(dependencies));
  router.use('/employee', createEmployeeRouter(dependencies));
  router.use('/attendance', createAttendanceRouter(dependencies));
  router.use('/monitoring', createMonitoringRouter(dependencies));
  return router;
}
