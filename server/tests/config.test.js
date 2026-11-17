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
    const config = loadConfig({
      ...validEnvironment,
      ALLOWED_ORIGINS: 'http://localhost:5173, http://127.0.0.1:5173/',
      ALLOW_TEST_FACE_ADAPTER: 'true',
    });
    expect(config.port).toBe(4000);
    expect(config.allowTestFaceAdapter).toBe(true);
    expect(config.allowedOrigins).toEqual([
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ]);
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

  it('accepts Resend settings and requires the API key and sender together', () => {
    const config = loadConfig({
      ...validEnvironment,
      RESEND_API_KEY: 're_test_123456789',
      RESEND_FROM_EMAIL: 'attendance@example.com',
    });
    expect(config.resendApiKey).toBe('re_test_123456789');
    expect(config.resendFromEmail).toBe('attendance@example.com');

    expect(() => loadConfig({ ...validEnvironment, RESEND_API_KEY: 're_test_123456789' })).toThrow(
      /RESEND_FROM_EMAIL/,
    );
  });
});
