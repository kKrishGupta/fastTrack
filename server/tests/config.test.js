import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';

const validEnvironment = {
  NODE_ENV: 'development',
  PORT: '4000',
  CLIENT_ORIGIN: 'http://localhost:5173',
  MONGODB_URI: 'mongodb://localhost:27017/facetrack_test',
  JWT_SECRET: '12345678901234567890123456789012',
};

describe('environment configuration', () => {
  it('coerces typed settings', () => {
    const config = loadConfig({ ...validEnvironment, ALLOW_TEST_FACE_ADAPTER: 'true' });
    expect(config.port).toBe(4000);
    expect(config.allowTestFaceAdapter).toBe(true);
  });

  it('requires HTTPS and disables the test face adapter in production', () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        NODE_ENV: 'production',
        ALLOW_TEST_FACE_ADAPTER: 'true',
      }),
    ).toThrow(/HTTPS|development face adapter/);
  });

  it('normalizes a Google App Password and requires both Gmail settings', () => {
    const config = loadConfig({
      ...validEnvironment,
      GMAIL_USER: 'mailer@example.com',
      GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop',
    });
    expect(config.gmailAppPassword).toBe('abcdefghijklmnop');

    expect(() => loadConfig({ ...validEnvironment, GMAIL_USER: 'mailer@example.com' })).toThrow(
      /GMAIL_APP_PASSWORD/,
    );
  });
});
