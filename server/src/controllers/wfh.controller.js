import { createWfhRequest, listEmployeeWfhRequests, listOrganizationWfhRequests, reviewWfhRequest } from '../services/wfh.service.js';
import { writeAudit } from '../services/audit.service.js';

export async function create(req, res) { const item = await createWfhRequest(req.user, req.validated.body); await writeAudit({ user: req.user, action: 'wfh.requested', entityType: 'WorkFromHomeRequest', entityId: item.id }); res.status(201).json({ item }); }
export async function employeeList(req, res) { res.json(await listEmployeeWfhRequests(req.user, req.validated.query)); }
export async function organizationList(req, res) { res.json(await listOrganizationWfhRequests(req.user, req.validated.query)); }
export async function review(req, res) { const item = await reviewWfhRequest(req.user, req.validated.params.id, req.validated.body); await writeAudit({ user: req.user, action: `wfh.${req.validated.body.decision}`, entityType: 'WorkFromHomeRequest', entityId: item.id }); res.json({ item }); }
