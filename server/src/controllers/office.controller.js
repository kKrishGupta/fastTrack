import { assignOffice, createOffice, listAssignedOffices, listOffices } from '../services/office.service.js';
import { writeAudit } from '../services/audit.service.js';

export async function list(req, res) { res.json({ items: await listOffices(req.user) }); }
export async function create(req, res) {
  const item = await createOffice(req.user, req.validated.body);
  await writeAudit({ user: req.user, action: 'office.created', entityType: 'Office', entityId: item.id });
  res.status(201).json({ item });
}
export async function assign(req, res) {
  const item = await assignOffice(req.user, req.validated.params.id, req.validated.body);
  await writeAudit({ user: req.user, action: 'office.assignment.updated', entityType: 'OfficeAssignment', entityId: item.id });
  res.status(201).json({ item });
}
export async function listForEmployee(req, res) { res.json({ items: await listAssignedOffices(req.user) }); }
