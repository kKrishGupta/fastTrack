import { afterEach, describe, expect, it, vi } from 'vitest';
import { Attendance, Organization } from '../src/models.js';
import { getLatestAttendance } from '../src/services/attendance.service.js';

const user = { id: '111111111111111111111111', organizationId: '222222222222222222222222' };

function attendanceQuery(result) {
  return {
    populate: vi.fn().mockReturnThis(),
    sort: vi.fn().mockResolvedValue(result),
  };
}

afterEach(() => vi.restoreAllMocks());

describe('employee active attendance session', () => {
  it('returns an overnight active session before looking for a record on the new calendar date', async () => {
    const active = { _id: '333333333333333333333333', attendanceDate: '2026-11-22', sessionStatus: 'working' };
    vi.spyOn(Organization, 'findById').mockReturnValue({ select: vi.fn().mockResolvedValue({ timezone: 'Asia/Calcutta' }) });
    const find = vi.spyOn(Attendance, 'findOne').mockReturnValue(attendanceQuery(active));

    await expect(getLatestAttendance(user)).resolves.toBe(active);
    expect(find).toHaveBeenCalledOnce();
    expect(find).toHaveBeenCalledWith({ organizationId: user.organizationId, employeeId: user.id, sessionStatus: 'working' });
  });

  it('falls back to the latest record for today when no session is active', async () => {
    const completed = { _id: '444444444444444444444444', sessionStatus: 'completed' };
    vi.spyOn(Organization, 'findById').mockReturnValue({ select: vi.fn().mockResolvedValue({ timezone: 'Asia/Calcutta' }) });
    const find = vi.spyOn(Attendance, 'findOne')
      .mockReturnValueOnce(attendanceQuery(null))
      .mockReturnValueOnce(attendanceQuery(completed));

    await expect(getLatestAttendance(user)).resolves.toBe(completed);
    expect(find).toHaveBeenCalledTimes(2);
    expect(find.mock.calls[1][0]).toMatchObject({ organizationId: user.organizationId, employeeId: user.id, attendanceDate: expect.any(String) });
  });
});
