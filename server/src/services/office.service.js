import { Office, OfficeAssignment, User } from '../models.js';
import { ApiError } from '../utils/api-error.js';
import { assignmentIsValid } from './geofence.service.js';

export function listOffices(user) {
  return Office.find({ organizationId: user.organizationId }).sort({ name: 1 });
}

export function createOffice(user, data) {
  const { latitude, longitude, ...rest } = data;
  return Office.create({
    ...rest,
    organizationId: user.organizationId,
    location: { type: 'Point', coordinates: [longitude, latitude] },
  });
}

export async function updateOffice(user, officeId, data) {
  const { latitude, longitude, ...rest } = data;
  const update = { ...rest };
  if (latitude !== undefined && longitude !== undefined) {
    update.location = { type: 'Point', coordinates: [longitude, latitude] };
  }

  const office = await Office.findOneAndUpdate(
    { _id: officeId, organizationId: user.organizationId },
    { $set: update },
    { new: true, runValidators: true },
  );
  if (!office) throw new ApiError(404, 'OFFICE_NOT_FOUND', 'Office not found');
  return office;
}

export async function assignOffice(user, officeId, data) {
  const [office, employee] = await Promise.all([
    Office.findOne({ _id: officeId, organizationId: user.organizationId }),
    User.findOne({
      _id: data.employeeId,
      organizationId: user.organizationId,
      role: 'Employee',
      active: true,
    }),
  ]);
  if (!office || !employee) {
    throw new ApiError(404, 'NOT_FOUND', 'Office or employee not found');
  }

  // An employee has one current attendance location. Preserve old rows for audit
  // history while making the newly selected office the only active assignment.
  await OfficeAssignment.updateMany(
    {
      organizationId: user.organizationId,
      employeeId: employee.id,
      officeId: { $ne: office.id },
      active: true,
    },
    { $set: { active: false } },
  );

  return OfficeAssignment.findOneAndUpdate(
    { organizationId: user.organizationId, officeId: office.id, employeeId: employee.id },
    {
      organizationId: user.organizationId,
      officeId: office.id,
      employeeId: employee.id,
      validFrom: data.validFrom,
      validUntil: data.validUntil,
      active: true,
    },
    { upsert: true, new: true, runValidators: true },
  );
}

export async function listAssignedOffices(user) {
  const assignments = await OfficeAssignment.find({
    organizationId: user.organizationId,
    employeeId: user.id,
    active: true,
  });
  const officeIds = assignments.filter((assignment) => assignmentIsValid(assignment)).map((item) => item.officeId);
  return Office.find({
    organizationId: user.organizationId,
    _id: { $in: officeIds },
    active: true,
  }).sort({ name: 1 });
}
