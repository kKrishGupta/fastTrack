import crypto from 'node:crypto';
import {
  Attendance,
  AttendanceChallenge,
  AuditLog,
  Department,
  EmployeeInvitation,
  EnrollmentSession,
  FaceProfile,
  FaceEvidence,
  OfficeAssignment,
  Organization,
  User,
  VerificationEvent,
  WorkFromHomeRequest,
} from '../models.js';
import { ApiError } from '../utils/api-error.js';
import { escapeRegExp, serializeUser } from '../utils/serializers.js';
import { sendEmployeeInvitation } from './email.service.js';
import { assignmentIsValid } from './geofence.service.js';

export async function listEmployees(user, filters) {
  const query = { organizationId: user.organizationId, role: 'Employee' };
  if (filters.departmentId) query.departmentId = filters.departmentId;
  if (filters.enrollmentStatus) query.enrollmentStatus = filters.enrollmentStatus;
  if (filters.search) {
    const search = new RegExp(escapeRegExp(filters.search), 'i');
    query.$or = [{ name: search }, { email: search }, { employeeCode: search }];
  }
  if (filters.officeId) {
    const assignments = await OfficeAssignment.find({
      organizationId: user.organizationId,
      officeId: filters.officeId,
      active: true,
    }).distinct('employeeId');
    query._id = { $in: assignments };
  }

  const skip = (filters.page - 1) * filters.limit;
  const [documents, total] = await Promise.all([
    User.find(query)
      .populate('departmentId', 'name')
      .skip(skip)
      .limit(filters.limit)
      .sort({ createdAt: -1 }),
    User.countDocuments(query),
  ]);
  const employeeIds = documents.map((document) => document._id);
  const [assignments, pendingInvitationEmployeeIds] = await Promise.all([
    OfficeAssignment.find({
      organizationId: user.organizationId,
      employeeId: { $in: employeeIds },
      active: true,
    }).populate('officeId', 'name address active'),
    EmployeeInvitation.find({
      organizationId: user.organizationId,
      employeeId: { $in: employeeIds },
      status: 'pending',
      active: true,
      expiresAt: { $gt: new Date() },
    }).distinct('employeeId'),
  ]);
  const officeByEmployee = new Map(
    assignments
      .filter((assignment) => assignmentIsValid(assignment) && assignment.officeId?.active)
      .map((assignment) => [String(assignment.employeeId), assignment.officeId]),
  );
  const employeesWithPendingInvitation = new Set(pendingInvitationEmployeeIds.map(String));

  return {
    items: documents.map((document) => ({
      ...serializeUser(document),
      assignedOffice: officeByEmployee.get(String(document._id)) ?? null,
      invitationPending: employeesWithPendingInvitation.has(String(document._id)),
    })),
    page: filters.page,
    limit: filters.limit,
    total,
    pages: Math.ceil(total / filters.limit),
  };
}

async function findOrganizationEmployee(user, employeeId, session) {
  const query = User.findOne({
    _id: employeeId,
    organizationId: user.organizationId,
    role: 'Employee',
  });
  if (session) query.session(session);
  const employee = await query;
  if (!employee) throw new ApiError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found');
  return employee;
}

export async function revokeEmployeeInvitations(user, employeeId) {
  const employee = await findOrganizationEmployee(user, employeeId);
  const result = await EmployeeInvitation.updateMany(
    {
      organizationId: user.organizationId,
      employeeId: employee.id,
      status: 'pending',
      active: true,
    },
    { status: 'revoked', active: false },
  );

  return {
    employeeId: employee.id,
    revokedCount: result.modifiedCount,
  };
}

export async function deleteEmployee(user, employeeId) {
  const session = await User.startSession();
  let deletedEmployee;

  try {
    await session.withTransaction(async () => {
      deletedEmployee = await findOrganizationEmployee(user, employeeId, session);
      const filter = {
        organizationId: user.organizationId,
        employeeId: deletedEmployee.id,
      };

      await EmployeeInvitation.deleteMany(filter, { session });
      await OfficeAssignment.deleteMany(filter, { session });
      await WorkFromHomeRequest.deleteMany(filter, { session });
      await FaceProfile.deleteMany(filter, { session });
      await FaceEvidence.deleteMany(filter, { session });
      await EnrollmentSession.deleteMany(filter, { session });
      await AttendanceChallenge.deleteMany(filter, { session });
      await VerificationEvent.deleteMany(filter, { session });
      await Attendance.deleteMany(filter, { session });
      await AuditLog.deleteMany({
        organizationId: user.organizationId,
        $or: [
          { actorId: deletedEmployee.id },
          { entityType: 'User', entityId: deletedEmployee.id },
        ],
      }, { session });
      await User.deleteOne({
        _id: deletedEmployee.id,
        organizationId: user.organizationId,
        role: 'Employee',
      }, { session });
      await AuditLog.create([{
        organizationId: user.organizationId,
        actorId: user.id,
        action: 'employee.deleted',
        entityType: 'User',
        entityId: deletedEmployee.id,
        metadata: { recordsPurged: true },
      }], { session });
    });
  } finally {
    await session.endSession();
  }

  return {
    employeeId: deletedEmployee.id,
  };
}

export async function inviteEmployee(user, data, config) {
  if (data.departmentId) {
    const department = await Department.exists({
      _id: data.departmentId,
      organizationId: user.organizationId,
      active: true,
    });
    if (!department) throw new ApiError(400, 'INVALID_DEPARTMENT', 'Department is not active');
  }

  let employee = await User.findOne({
    organizationId: user.organizationId,
    email: data.email,
  });
  if (employee && employee.status !== 'invited') {
    throw new ApiError(409, 'EMPLOYEE_EXISTS', 'An employee with this email already belongs to your organization');
  }

  if (employee) {
    Object.assign(employee, data, {
      role: 'Employee',
      enrollmentStatus: 'authorized',
      active: true,
    });
    await employee.save();
  } else {
    employee = await User.create({
      ...data,
      role: 'Employee',
      organizationId: user.organizationId,
      status: 'invited',
      enrollmentStatus: 'authorized',
    });
  }

  await EmployeeInvitation.updateMany(
    {
      organizationId: user.organizationId,
      employeeId: employee.id,
      status: 'pending',
    },
    { status: 'revoked', active: false },
  );

  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + config.employeeInviteHours * 60 * 60 * 1000);
  const invitation = await EmployeeInvitation.create({
    organizationId: user.organizationId,
    employeeId: employee.id,
    invitedBy: user.id,
    email: employee.email,
    tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
    expiresAt,
  });

  const inviteUrl = new URL('/employee/invitations/accept', config.clientOrigin);
  inviteUrl.searchParams.set('token', token);
  const organization = await Organization.findById(user.organizationId).select('name slug');
  if (!organization) throw new ApiError(404, 'ORGANIZATION_NOT_FOUND', 'Organization not found');

  let delivered = false;
  try {
    const emailProviderId = await sendEmployeeInvitation({
      config,
      invitationId: invitation.id,
      recipientEmail: employee.email,
      recipientName: employee.name,
      organizationName: organization.name,
      workspaceSlug: organization.slug,
      inviteUrl: inviteUrl.toString(),
      expiresAt,
    });
    invitation.emailProviderId = emailProviderId;
    invitation.emailSentAt = new Date();
    await invitation.save();
    delivered = true;
  } catch (error) {
    console.warn('Employee invitation email was not delivered; manual sharing is available', {
      code: error.code ?? 'INVITATION_EMAIL_FAILED',
      message: error.message,
      providerMessage: error.details?.providerMessage,
      statusCode: error.details?.statusCode,
      invitationId: invitation.id,
    });
  }

  return {
    document: employee,
    publicUser: serializeUser(employee),
    invitation: {
      email: employee.email,
      expiresAt,
      delivered,
      url: inviteUrl.toString(),
    },
  };
}
