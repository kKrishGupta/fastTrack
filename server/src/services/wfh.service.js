import { WorkFromHomeRequest } from '../models.js';
import { ApiError } from '../utils/api-error.js';

export async function createWfhRequest(user, data) {
  const today = new Date().toISOString().slice(0, 10);
  if (data.requestDate < today) throw new ApiError(400, 'WFH_DATE_INVALID', 'WFH cannot be requested for a past date');
  return WorkFromHomeRequest.findOneAndUpdate(
    { organizationId: user.organizationId, employeeId: user.id, requestDate: data.requestDate },
    {
      $set: {
        organizationId: user.organizationId,
        employeeId: user.id,
        requestDate: data.requestDate,
        reason: data.reason,
        locationLabel: data.locationLabel,
        location: { type: 'Point', coordinates: [data.position.longitude, data.position.latitude] },
        requestedAccuracyMeters: data.position.accuracy,
        radiusMeters: 250,
        status: 'pending',
        active: true,
      },
      $unset: { reviewedBy: 1, reviewedAt: 1, reviewNote: 1 },
    },
    { upsert: true, new: true, runValidators: true },
  );
}

export async function listEmployeeWfhRequests(user, filters) {
  const query = { organizationId: user.organizationId, employeeId: user.id };
  if (filters.status) query.status = filters.status;
  const [items, total] = await Promise.all([
    WorkFromHomeRequest.find(query).sort({ requestDate: -1 }).skip((filters.page - 1) * filters.limit).limit(filters.limit),
    WorkFromHomeRequest.countDocuments(query),
  ]);
  return { items, total, page: filters.page, limit: filters.limit, pages: Math.ceil(total / filters.limit) };
}

export async function listOrganizationWfhRequests(user, filters) {
  const query = { organizationId: user.organizationId };
  if (filters.status) query.status = filters.status;
  const [items, total] = await Promise.all([
    WorkFromHomeRequest.find(query).populate('employeeId', 'name email employeeCode jobTitle').sort({ createdAt: -1 }).skip((filters.page - 1) * filters.limit).limit(filters.limit),
    WorkFromHomeRequest.countDocuments(query),
  ]);
  return { items, total, page: filters.page, limit: filters.limit, pages: Math.ceil(total / filters.limit) };
}

export async function reviewWfhRequest(user, id, data) {
  const request = await WorkFromHomeRequest.findOneAndUpdate(
    { _id: id, organizationId: user.organizationId, status: 'pending', active: true },
    { status: data.decision, reviewNote: data.reviewNote, reviewedBy: user.id, reviewedAt: new Date() },
    { new: true, runValidators: true },
  ).populate('employeeId', 'name email employeeCode');
  if (!request) throw new ApiError(404, 'WFH_REQUEST_NOT_FOUND', 'Pending WFH request not found');
  return request;
}
