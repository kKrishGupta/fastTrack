import { afterEach, describe, expect, it, vi } from 'vitest';
import { Organization, User } from '../src/models.js';
import { authenticateCredentials } from '../src/services/auth.service.js';

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

  it.each([
    ['organization login', 'HR'],
    ['employee login', 'Employee'],
  ])('restricts %s to the expected account role', async (_label, role) => {
    vi.spyOn(Organization, 'findOne').mockResolvedValue({ id: '507f1f77bcf86cd799439011' });
    const select = vi.fn().mockResolvedValue(null);
    const findUser = vi.spyOn(User, 'findOne').mockReturnValue({ select });

    await expect(authenticateCredentials(credentials, config, role)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(findUser).toHaveBeenCalledWith(expect.objectContaining({ role }));
  });
});
