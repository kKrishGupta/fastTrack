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

import { deleteEmployee, revokeEmployeeInvitations } from '../src/services/employee.service.js';

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
