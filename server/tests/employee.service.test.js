import { beforeEach, describe, expect, it, vi } from 'vitest';

const models = vi.hoisted(() => {
  const deletable = () => ({ deleteMany: vi.fn() });
  return {
    Attendance: deletable(),
    AttendanceChallenge: deletable(),
    AuditLog: { ...deletable(), create: vi.fn() },
    Department: { exists: vi.fn() },
    EmployeeInvitation: { ...deletable(), updateMany: vi.fn(), find: vi.fn(), create: vi.fn() },
    EnrollmentSession: deletable(),
    FaceEvidence: deletable(),
    FaceProfile: deletable(),
    OfficeAssignment: { ...deletable(), find: vi.fn() },
    Organization: { findById: vi.fn() },
    User: {
      findOne: vi.fn(),
      deleteOne: vi.fn(),
      startSession: vi.fn(),
    },
    VerificationEvent: deletable(),
    WorkFromHomeRequest: deletable(),
  };
});

vi.mock('../src/models.js', () => models);

import { authorizeFaceReenrollment, deleteEmployee, revokeEmployeeInvitations, revokeFaceReenrollment } from '../src/services/employee.service.js';

function queryResult(value) {
  return {
    session: vi.fn().mockResolvedValue(value),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
}

const hr = { id: 'hr-1', organizationId: 'org-1' };
const employee = { id: 'employee-1', employeeCode: 'EMP-1' };

describe('employee membership administration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    models.User.findOne.mockReturnValue(queryResult(employee));
  });

  it('revokes only pending invitations in the HR organization', async () => {
    models.EmployeeInvitation.updateMany.mockResolvedValue({ modifiedCount: 2 });

    await expect(revokeEmployeeInvitations(hr, employee.id)).resolves.toEqual({
      employeeId: employee.id,
      revokedCount: 2,
    });
    expect(models.User.findOne).toHaveBeenCalledWith({
      _id: employee.id,
      organizationId: hr.organizationId,
      role: 'Employee',
    });
    expect(models.EmployeeInvitation.updateMany).toHaveBeenCalledWith(
      {
        organizationId: hr.organizationId,
        employeeId: employee.id,
        status: 'pending',
        active: true,
      },
      { status: 'revoked', active: false },
    );
  });

  it('grants completed employees a time-limited face change authorization', async () => {
    const completedEmployee = {
      ...employee,
      status: 'active',
      enrollmentStatus: 'complete',
      save: vi.fn().mockResolvedValue(undefined),
    };
    models.User.findOne.mockReturnValue(queryResult(completedEmployee));

    await expect(authorizeFaceReenrollment(hr, employee.id)).resolves.toBe(completedEmployee);
    expect(completedEmployee.faceReenrollmentAuthorizedBy).toBe(hr.id);
    expect(completedEmployee.faceReenrollmentAuthorizedAt).toBeInstanceOf(Date);
    expect(completedEmployee.faceReenrollmentAuthorizedUntil).toBeInstanceOf(Date);
    expect(completedEmployee.faceReenrollmentAuthorizedUntil.getTime() - completedEmployee.faceReenrollmentAuthorizedAt.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(completedEmployee.save).toHaveBeenCalledOnce();
  });

  it('immediately revokes a face change authorization', async () => {
    const authorizedEmployee = {
      ...employee,
      faceReenrollmentAuthorizedAt: new Date(),
      faceReenrollmentAuthorizedUntil: new Date(Date.now() + 60_000),
      faceReenrollmentAuthorizedBy: hr.id,
      save: vi.fn().mockResolvedValue(undefined),
    };
    models.User.findOne.mockReturnValue(queryResult(authorizedEmployee));

    await expect(revokeFaceReenrollment(hr, employee.id)).resolves.toBe(authorizedEmployee);
    expect(authorizedEmployee.faceReenrollmentAuthorizedAt).toBeUndefined();
    expect(authorizedEmployee.faceReenrollmentAuthorizedUntil).toBeUndefined();
    expect(authorizedEmployee.faceReenrollmentAuthorizedBy).toBeUndefined();
    expect(authorizedEmployee.save).toHaveBeenCalledOnce();
  });

  it('purges employee-owned records and writes the deletion audit in one transaction', async () => {
    const session = {
      withTransaction: vi.fn(async (operation) => operation()),
      endSession: vi.fn(),
    };
    models.User.startSession.mockResolvedValue(session);

    await expect(deleteEmployee(hr, employee.id)).resolves.toEqual({ employeeId: employee.id });

    const employeeFilter = { organizationId: hr.organizationId, employeeId: employee.id };
    for (const model of [
      models.EmployeeInvitation,
      models.OfficeAssignment,
      models.WorkFromHomeRequest,
      models.FaceProfile,
      models.FaceEvidence,
      models.EnrollmentSession,
      models.AttendanceChallenge,
      models.VerificationEvent,
      models.Attendance,
    ]) {
      expect(model.deleteMany).toHaveBeenCalledWith(employeeFilter, { session });
    }
    expect(models.User.deleteOne).toHaveBeenCalledWith({
      _id: employee.id,
      organizationId: hr.organizationId,
      role: 'Employee',
    }, { session });
    expect(models.AuditLog.create).toHaveBeenCalledWith([expect.objectContaining({
      organizationId: hr.organizationId,
      actorId: hr.id,
      action: 'employee.deleted',
      entityId: employee.id,
    })], { session });
    expect(session.endSession).toHaveBeenCalledOnce();
  });
});
