import { Department } from '../models.js';
import { ApiError } from '../utils/api-error.js';

export function listDepartments(user) {
  return Department.find({ organizationId: user.organizationId }).sort({ name: 1 });
}

export function createDepartment(user, data) {
  return Department.create({ ...data, organizationId: user.organizationId });
}

export async function updateDepartment(user, id, data) {
  const item = await Department.findOneAndUpdate(
    { _id: id, organizationId: user.organizationId },
    { ...data, updatedAt: new Date() },
    { new: true, runValidators: true },
  );
  if (!item) throw new ApiError(404, 'NOT_FOUND', 'Department not found');
  return item;
}
