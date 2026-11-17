import { inviteEmployee, listEmployees } from '../services/employee.service.js';
import { writeAudit } from '../services/audit.service.js';

export async function list(req, res) { res.json(await listEmployees(req.user, req.validated.query)); }
export async function invite(req, res) {
  const { document, publicUser, invitation } = await inviteEmployee(
    req.user,
    req.validated.body,
    req.app.get('config'),
  );
  await writeAudit({ user: req.user, action: 'employee.invited', entityType: 'User', entityId: document.id });
  req.app.get('io')?.to(`org:${req.user.organizationId}:hr`).emit('employee:invited', { employeeId: document.id });
  res.status(201).json({ item: publicUser, invitation });
}
