import { afterEach, describe, expect, it, vi } from 'vitest';
import { Organization, User } from '../src/models.js';
import { authenticateCredentials, authenticateEmployeeCredentials } from '../src/services/auth.service.js';

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
