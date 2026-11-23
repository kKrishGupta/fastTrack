import { Router, raw } from 'express';
import rateLimit from 'express-rate-limit';
import * as controller from '../controllers/monitoring.controller.js';
import { authenticateDevice, RETENTION_DAYS } from '../services/monitoring.service.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/async-handler.js';
import { agentStateSchema, createDeviceSchema, deviceConsentSchema, deviceParams, deviceStateSchema, deviceQuerySchema, enrollSchema, heartbeatSchema, ingestSchema, reportQuerySchema, policySchema, ruleSchema, rotationSchema, screenshotCaptureParams, screenshotCompleteSchema, screenshotQuerySchema, screenshotRequestSchema, timelineQuerySchema } from '../validators/monitoring.schemas.js';
import { MONITORING_INSTALLER_RELEASE } from '../config/monitoring-release.js';

export function createMonitoringRouter({ authenticate }) {
  const router = Router();
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/info', (req, res) => {
    const screenshotsAvailable = controller.screenshotStorageAvailable(req.app.get('config'));
    const installer = { ...MONITORING_INSTALLER_RELEASE, url: req.app.get('config').monitoringInstallerUrl || MONITORING_INSTALLER_RELEASE.url };
    res.json({ provider: 'ActivityWatch', protocolVersion: 1, agentVersion: '1.2.1', retentionDays: RETENTION_DAYS,
      activityWatchVersion: '0.14.3', browserWatcherVersion: '0.6.0',
      browserWatcherUrl: 'https://chromewebstore.google.com/detail/activitywatch-web-watcher/nglaklhklhcoonedhgnpgddginnjdadi',
      capabilities: { policies: true, summaries: true, timeline: true, browserWatcher: true, screenshots: screenshotsAvailable },
      screenshotStorage: {
        provider: 'cloudinary',
        configured: screenshotsAvailable,
        code: screenshotsAvailable ? 'READY' : 'SCREENSHOT_STORAGE_DISABLED',
        message: screenshotsAvailable
          ? 'Private authenticated screenshot storage is configured on this API.'
          : 'This FaceTrack API has not detected all three required Cloudinary environment variables. Configure them on this backend and restart or redeploy it.',
      },
      installer, installerUrl: installer.url });
  });
  router.post('/enroll', rateLimit({ windowMs: 15 * 60_000, limit: 20 }), validate(enrollSchema), asyncHandler(controller.enroll));
  router.use('/agent', rateLimit({ windowMs: 60_000, limit: 3000 }), asyncHandler(async (req, res, next) => {
    req.device = await authenticateDevice(/^Bearer ([A-Za-z0-9_-]{43})$/i.exec(req.get('authorization') || '')?.[1]);
    next();
  }), rateLimit({ windowMs: 60_000, limit: 600, keyGenerator: (req) => String(req.device._id) }));
  router.get('/agent/status', asyncHandler(controller.status));
  router.post('/agent/heartbeat', validate(heartbeatSchema), asyncHandler(controller.heartbeat));
  router.patch('/agent/state', validate(agentStateSchema), asyncHandler(controller.agentState));
  router.post('/agent/events', validate(ingestSchema), asyncHandler(controller.ingest));
  router.post('/agent/screenshots/request-upload', validate(screenshotRequestSchema), asyncHandler(controller.requestScreenshotUpload));
  router.post('/agent/screenshots/:captureId/content', validate(screenshotCaptureParams, 'params'), raw({ type: ['image/png', 'image/jpeg'], limit: '10mb' }), asyncHandler(controller.uploadScreenshotContent));
  router.post('/agent/screenshots/complete', validate(screenshotCompleteSchema), asyncHandler(controller.completeScreenshotUpload));
  router.post('/agent/credentials/rotate', validate(rotationSchema), asyncHandler(controller.rotate));
  router.post('/agent/revoke', asyncHandler(controller.revokeSelf));
  router.use(authenticate, requireRole('Employee', 'HR'));
  router.get('/devices', validate(deviceQuerySchema, 'query'), asyncHandler(controller.list));
  router.get('/employees', requireRole('HR'), asyncHandler(controller.employees));
  router.post('/devices', requireRole('Employee'), rateLimit({ windowMs: 60 * 60_000, limit: 10 }), validate(createDeviceSchema), asyncHandler(controller.create));
  router.patch('/devices/:id', validate(deviceParams, 'params'), validate(deviceStateSchema), asyncHandler(controller.change));
  router.delete('/devices/:id', validate(deviceParams, 'params'), asyncHandler(controller.clean));
  router.patch('/devices/:id/consent', requireRole('Employee'), validate(deviceParams, 'params'), validate(deviceConsentSchema), asyncHandler(controller.grantConsent));
  router.get('/report', validate(reportQuerySchema, 'query'), asyncHandler(controller.report));
  router.get('/summary', validate(reportQuerySchema, 'query'), asyncHandler(controller.summary));
  router.get('/timeline', validate(timelineQuerySchema, 'query'), asyncHandler(controller.timeline));
  router.get('/screenshots', validate(screenshotQuerySchema, 'query'), asyncHandler(controller.listScreenshots));
  router.get('/screenshots/:id/view', validate(deviceParams, 'params'), asyncHandler(controller.viewScreenshot));
  router.get('/policy', asyncHandler(controller.getPolicy));
  router.put('/policy', requireRole('HR'), validate(policySchema), asyncHandler(controller.putPolicy));
  router.get('/rules', asyncHandler(controller.rules));
  router.post('/rules', requireRole('HR'), validate(ruleSchema), asyncHandler(controller.putRule));
  router.delete('/rules/:id', requireRole('HR'), validate(deviceParams, 'params'), asyncHandler(controller.removeRule));
  return router;
}
