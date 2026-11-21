import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as controller from '../controllers/monitoring.controller.js';
import { authenticateDevice, RETENTION_DAYS } from '../services/monitoring.service.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/async-handler.js';
import { agentStateSchema, createDeviceSchema, deviceParams, deviceStateSchema, deviceQuerySchema, enrollSchema, heartbeatSchema, ingestSchema, reportQuerySchema } from '../validators/monitoring.schemas.js';

export function createMonitoringRouter({ authenticate }) {
  const router = Router();
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/info', (req, res) => res.json({ provider: 'ActivityWatch', protocolVersion: 1, agentVersion: '1.1.0', retentionDays: RETENTION_DAYS }));
  router.post('/enroll', rateLimit({ windowMs: 15 * 60_000, limit: 20 }), validate(enrollSchema), asyncHandler(controller.enroll));
  router.use('/agent', rateLimit({ windowMs: 60_000, limit: 120 }), asyncHandler(async (req, res, next) => {
    req.device = await authenticateDevice(/^Bearer ([A-Za-z0-9_-]{43})$/i.exec(req.get('authorization') || '')?.[1]);
    next();
  }));
  router.get('/agent/status', asyncHandler(controller.status));
  router.post('/agent/heartbeat', validate(heartbeatSchema), asyncHandler(controller.heartbeat));
  router.patch('/agent/state', validate(agentStateSchema), asyncHandler(controller.agentState));
  router.post('/agent/events', validate(ingestSchema), asyncHandler(controller.ingest));
  router.use(authenticate, requireRole('Employee', 'HR'));
  router.get('/devices', validate(deviceQuerySchema, 'query'), asyncHandler(controller.list));
  router.get('/employees', requireRole('HR'), asyncHandler(controller.employees));
  router.post('/devices', requireRole('Employee'), rateLimit({ windowMs: 60 * 60_000, limit: 10 }), validate(createDeviceSchema), asyncHandler(controller.create));
  router.patch('/devices/:id', validate(deviceParams, 'params'), validate(deviceStateSchema), asyncHandler(controller.change));
  router.get('/report', validate(reportQuerySchema, 'query'), asyncHandler(controller.report));
  return router;
}
