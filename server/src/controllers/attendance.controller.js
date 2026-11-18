import { checkIn, checkOut, createAttendanceChallenge, getAttendanceHistory, getAttendanceReport, getLatestAttendance, verifyAttendanceFace, verifyAttendanceLocation } from '../services/attendance.service.js';
import { getAttendancePolicy, updateAttendancePolicy } from '../services/attendance-policy.service.js';
import { writeAudit } from '../services/audit.service.js';

export function createAttendanceController(config) {
  return {
    createChallenge: async (req, res) => res.status(201).json({ challenge: await createAttendanceChallenge(req.user, config) }),
    verifyLocation: async (req, res) => res.json(await verifyAttendanceLocation(req.user, req.validated.body, config)),
    verifyFace: async (req, res) => res.json(await verifyAttendanceFace(req.user, req.validated.body, config)),
    checkIn: async (req, res) => {
      const item = await checkIn(req.user, req.validated.body.challengeId);
      req.app.get('io')?.to(`org:${req.user.organizationId}:hr`).emit('attendance:checked_in', { attendanceId: item.id, employeeId: req.user.id, at: item.checkInAt });
      res.status(201).json({ item });
    },
    checkOut: async (req, res) => {
      const item = await checkOut(req.user);
      req.app.get('io')?.to(`org:${req.user.organizationId}:hr`).emit('attendance:checked_out', { attendanceId: item.id, employeeId: req.user.id, at: item.checkOutAt });
      res.json({ item });
    },
    today: async (req, res) => res.json({ item: await getLatestAttendance(req.user) }),
    history: async (req, res) => res.json(await getAttendanceHistory(req.user, req.validated.query)),
    report: async (req, res) => res.json(await getAttendanceReport(req.user, req.validated.query)),
    policy: async (req, res) => res.json(await getAttendancePolicy(req.user)),
    updatePolicy: async (req, res) => {
      const result = await updateAttendancePolicy(req.user, req.validated.body);
      await writeAudit({
        user: req.user,
        action: 'attendance.policy.updated',
        entityType: 'Organization',
        entityId: req.user.organizationId,
        metadata: result.policy,
      });
      res.json(result);
    },
  };
}
