import { AuditLog } from '../models.js';

export function writeAudit({ user, action, entityType, entityId, metadata = {} }) {
  return AuditLog.create({
    organizationId: user.organizationId,
    actorId: user.id,
    action,
    entityType,
    entityId,
    metadata,
  });
}
