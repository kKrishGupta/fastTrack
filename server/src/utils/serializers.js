const USER_FIELDS = [
  '_id',
  'employeeCode',
  'name',
  'email',
  'phone',
  'role',
  'departmentId',
  'shiftId',
  'jobTitle',
  'status',
  'enrollmentStatus',
  'biometricConsentAt',
  'active',
  'createdAt',
  'updatedAt',
];

export function serializeUser(user) {
  const source = typeof user?.toObject === 'function' ? user.toObject() : user;
  if (!source) return null;

  const result = {};
  for (const field of USER_FIELDS) {
    if (source[field] !== undefined) result[field] = source[field];
  }
  result.id = String(source._id ?? source.id);
  delete result._id;
  return result;
}

export function serializeOrganization(organization) {
  const source = typeof organization?.toObject === 'function'
    ? organization.toObject()
    : organization;
  if (!source) return null;

  return {
    id: String(source._id ?? source.id),
    name: source.name,
    slug: source.slug,
    timezone: source.timezone,
  };
}

export function serializeSessionUser(user, organization) {
  return {
    ...serializeUser(user),
    organization: serializeOrganization(organization),
  };
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
