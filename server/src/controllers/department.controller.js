import { createDepartment, listDepartments, updateDepartment } from '../services/department.service.js';
import { writeAudit } from '../services/audit.service.js';

export async function list(req, res) { res.json({ items: await listDepartments(req.user) }); }
export async function create(req, res) {
  const item = await createDepartment(req.user, req.validated.body);
  await writeAudit({ user: req.user, action: 'department.created', entityType: 'Department', entityId: item.id });
  res.status(201).json({ item });
}
export async function update(req, res) {
  const item = await updateDepartment(req.user, req.validated.params.id, req.validated.body);
  await writeAudit({ user: req.user, action: 'department.updated', entityType: 'Department', entityId: item.id });
  res.json({ item });
}
