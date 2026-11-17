import { describe, expect, it } from 'vitest';
import { escapeRegExp, serializeUser } from '../src/utils/serializers.js';

describe('public serializers', () => {
  it('never returns password or organization internals', () => {
    const result = serializeUser({
      _id: '507f1f77bcf86cd799439011',
      name: 'Example User',
      email: 'person@example.com',
      role: 'Employee',
      passwordHash: 'secret-hash',
      organizationId: '507f1f77bcf86cd799439012',
    });
    expect(result.id).toBe('507f1f77bcf86cd799439011');
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('organizationId');
  });

  it('escapes user input before building a Mongo regular expression', () => {
    expect(escapeRegExp('A.*(B)')).toBe('A\\.\\*\\(B\\)');
  });
});
