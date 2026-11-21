import { afterEach, describe, expect, it, vi } from 'vitest';
import argon2 from 'argon2';
import { EmployeeInvitation, Organization, User } from '../src/models.js';
import { acceptInvitation, authenticateCredentials, authenticateEmployeeCredentials } from '../src/services/auth.service.js';

const credentials = {
  workspaceSlug: 'acme-labs',
  email: 'person@example.com',
  password: 'Password123!',
};

const config = {
  jwtSecret: '12345678901234567890123456789012',
  authCookieHours: 8,
};

describe('role-specific authentication', () => {
  afterEach(() => vi.restoreAllMocks());

  it('activates an invited employee without contacting a monitoring provider or pairing a device', async () => {
    const organizationId = '507f1f77bcf86cd799439011';
    const user = { id: '507f1f77bcf86cd799439012', organizationId, role: 'Employee', status: 'invited', save: vi.fn() };
    const invitation = { organizationId, employeeId: user.id, email: credentials.email, expiresAt: new Date(Date.now() + 60_000), save: vi.fn() };
    vi.spyOn(EmployeeInvitation, 'findOne').mockResolvedValue(invitation);
    vi.spyOn(Organization, 'findOne').mockResolvedValue({ id: organizationId });
    vi.spyOn(User, 'findOne').mockResolvedValue(user);
    vi.spyOn(argon2, 'hash').mockResolvedValue('test-password-hash');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('External provider must not be called'));
    const result = await acceptInvitation({ token: 'invitation-token', password: credentials.password, biometricConsent: true }, { ...config, teamLoggerEnabled: true });
    expect(result.user.status).toBe('active');
    expect(invitation.status).toBe('accepted');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(user).not.toHaveProperty('teamLoggerStatus');
  });

  it('restricts organization login to HR accounts', async () => {
    vi.spyOn(Organization, 'findOne').mockResolvedValue({ id: '507f1f77bcf86cd799439011' });
    const select = vi.fn().mockResolvedValue(null);
    const findUser = vi.spyOn(User, 'findOne').mockReturnValue({ select });

    await expect(authenticateCredentials(credentials, config, 'HR')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(findUser).toHaveBeenCalledWith(expect.objectContaining({ role: 'HR' }));
  });

  it('uses employee code and email for employee login', async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const select = vi.fn().mockReturnValue({ limit });
    const findUsers = vi.spyOn(User, 'find').mockReturnValue({ select });

    await expect(authenticateEmployeeCredentials({
      employeeCode: '112',
      email: 'person@example.com',
      password: 'Password123!',
    }, config)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

    expect(findUsers).toHaveBeenCalledWith(expect.objectContaining({
      employeeCode: '112',
      email: 'person@example.com',
      role: 'Employee',
    }));
  });
});
