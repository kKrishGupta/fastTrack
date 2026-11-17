import { completeEnrollment, saveEnrollmentCapture, startEnrollment } from '../services/enrollment.service.js';
import { serializeUser } from '../utils/serializers.js';

export function createEnrollmentController(config) {
  return {
    start: async (req, res) => res.status(201).json(await startEnrollment(req.user, config)),
    capture: async (req, res) => res.status(201).json(await saveEnrollmentCapture(req.user, req.validated.body, config)),
    complete: async (req, res) => {
      const result = await completeEnrollment(req.user, req.validated.body.sessionId, config);
      res.json({ ...result, user: serializeUser(result.user) });
    },
  };
}
