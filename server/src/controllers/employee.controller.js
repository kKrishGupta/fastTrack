import { deleteEmployee, inviteEmployee, listEmployees, revokeEmployeeInvitations } from '../services/employee.service.js';
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

export async function revokeInvitations(req, res) {
  const result = await revokeEmployeeInvitations(req.user, req.validated.params.id);
  await writeAudit({
    user: req.user,
    action: 'employee.invitation.revoked',
    entityType: 'User',
    entityId: result.employeeId,
    metadata: { revokedCount: result.revokedCount },
  });
  req.app.get('io')?.to(`org:${req.user.organizationId}:hr`).emit('employee:invitation_revoked', result);
  res.json(result);
}

export async function remove(req, res) {
  const result = await deleteEmployee(req.user, req.validated.params.id);
  req.app.get('io')?.to(`org:${req.user.organizationId}:hr`).emit('employee:deleted', { employeeId: result.employeeId });
  res.json({ removed: true, employeeId: result.employeeId });
}
