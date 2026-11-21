import crypto from 'node:crypto';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { EmployeeInvitation, Organization, User } from '../models.js';
import { ApiError } from '../utils/api-error.js';
import { serializeOrganization } from '../utils/serializers.js';

function signAccessToken(user, config) {
  return jwt.sign(
    {
      sub: user.id,
      org: user.organizationId.toString(),
      role: user.role,
    },
    config.jwtSecret,
    {
      expiresIn: `${config.authCookieHours}h`,
      issuer: 'facetrack-pro',
    },
  );
}

function hashInvitationToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function requireActiveOrganization(organizationId) {
  const organization = await Organization.findOne({ _id: organizationId, active: true });
  if (!organization) {
    throw new ApiError(403, 'ORGANIZATION_INACTIVE', 'This organization workspace is not active');
  }
  return organization;
}

export async function authenticateCredentials({ workspaceSlug, email, password }, config, expectedRole) {
  const organization = await Organization.findOne({ slug: workspaceSlug, active: true });
  if (!organization) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid workspace, email, or password');
  }

  const user = await User.findOne({
    organizationId: organization.id,
    email,
    role: expectedRole,
    status: 'active',
    active: true,
  }).select('+passwordHash');
  if (!user?.passwordHash || !(await argon2.verify(user.passwordHash, password))) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid workspace, email, or password');
  }

  return { user, organization, token: signAccessToken(user, config) };
}

export async function authenticateEmployeeCredentials({ employeeCode, email, password }, config) {
  const candidates = await User.find({
    employeeCode,
    email,
    role: 'Employee',
    status: 'active',
    active: true,
  }).select('+passwordHash').limit(3);

  const matchingUsers = [];
  for (const candidate of candidates) {
    if (candidate.passwordHash && await argon2.verify(candidate.passwordHash, password)) {
      matchingUsers.push(candidate);
    }
  }
  if (matchingUsers.length !== 1) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid employee code, email, or password');
  }

  const user = matchingUsers[0];
  const organization = await requireActiveOrganization(user.organizationId);
  return { user, organization, token: signAccessToken(user, config) };
}

export async function registerOrganization(data, config) {
  if (await Organization.exists({ slug: data.workspaceSlug })) {
    throw new ApiError(409, 'WORKSPACE_TAKEN', 'That workspace ID is already in use');
  }

  let organization;
  try {
    organization = await Organization.create({
      name: data.organizationName,
      slug: data.workspaceSlug,
    });
    const passwordHash = await argon2.hash(data.password, { type: argon2.argon2id });
    const user = await User.create({
      organizationId: organization.id,
      name: data.adminName,
      email: data.email,
      passwordHash,
      role: 'HR',
      status: 'active',
      enrollmentStatus: 'disabled',
    });
    return { user, organization, token: signAccessToken(user, config) };
  } catch (error) {
    if (organization?.id) await Organization.deleteOne({ _id: organization.id });
    throw error;
  }
}

export async function getSessionOrganization(user) {
  return requireActiveOrganization(user.organizationId);
}

export async function getInvitationPreview(token) {
  const invitation = await EmployeeInvitation.findOne({
    tokenHash: hashInvitationToken(token),
    status: 'pending',
    active: true,
  }).populate('employeeId', 'name email employeeCode').populate('organizationId', 'name slug timezone active');

  if (!invitation || !invitation.employeeId || !invitation.organizationId?.active) {
    throw new ApiError(404, 'INVITATION_INVALID', 'This invitation is invalid or has already been used');
  }
  if (invitation.expiresAt <= new Date()) {
    invitation.status = 'expired';
    invitation.active = false;
    await invitation.save();
    throw new ApiError(410, 'INVITATION_EXPIRED', 'This invitation has expired. Ask your HR administrator for a new one');
  }

  return {
    email: invitation.email,
    employeeName: invitation.employeeId.name,
    employeeCode: invitation.employeeId.employeeCode,
    expiresAt: invitation.expiresAt,
    organization: serializeOrganization(invitation.organizationId),
  };
}

export async function acceptInvitation({ token, password, biometricConsent }, config) {
  const tokenHash = hashInvitationToken(token);
  const invitation = await EmployeeInvitation.findOne({
    tokenHash,
    status: 'pending',
    active: true,
  });
  if (!invitation) {
    throw new ApiError(404, 'INVITATION_INVALID', 'This invitation is invalid or has already been used');
  }
  if (invitation.expiresAt <= new Date()) {
    invitation.status = 'expired';
    invitation.active = false;
    await invitation.save();
    throw new ApiError(410, 'INVITATION_EXPIRED', 'This invitation has expired. Ask your HR administrator for a new one');
  }

  const organization = await requireActiveOrganization(invitation.organizationId);
  const user = await User.findOne({
    _id: invitation.employeeId,
    organizationId: invitation.organizationId,
    email: invitation.email,
    status: 'invited',
    active: true,
  });
  if (!user) {
    throw new ApiError(409, 'INVITATION_STATE_INVALID', 'This employee account can no longer be activated');
  }

  user.passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  user.status = 'active';
  user.enrollmentStatus = 'authorized';
  user.biometricConsentAt = biometricConsent ? new Date() : undefined;
  await user.save();

  invitation.status = 'accepted';
  invitation.active = false;
  invitation.acceptedAt = new Date();
  await invitation.save();

  return { user, organization, token: signAccessToken(user, config) };
}
