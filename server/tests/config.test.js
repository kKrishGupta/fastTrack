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

  it('allows the explicitly labelled demo evidence adapter in production', () => {
    const config = loadConfig({
      ...validEnvironment,
      NODE_ENV: 'production',
      CLIENT_ORIGIN: 'https://app.example.com',
      ALLOW_DEMO_FACE_ADAPTER: 'true',
    });
    expect(config.allowDemoFaceAdapter).toBe(true);
    expect(config.allowTestFaceAdapter).toBe(false);
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

  it('requires complete AWS face provider credentials and a 32-byte biometric key', () => {
    expect(() => loadConfig({
      ...validEnvironment,
      FACE_PROVIDER: 'aws-rekognition',
    })).toThrow(/AWS_REGION|AWS_ACCESS_KEY_ID|BIOMETRIC_KEY/);

    const config = loadConfig({
      ...validEnvironment,
      FACE_PROVIDER: 'aws-rekognition',
      AWS_REGION: 'ap-south-1',
      AWS_ACCESS_KEY_ID: 'AKIA1234567890123456',
      AWS_SECRET_ACCESS_KEY: '1234567890123456789012345678901234567890',
      BIOMETRIC_KEY: Buffer.alloc(32, 7).toString('base64'),
      FACE_SIMILARITY_THRESHOLD: '92',
    });
    expect(config.faceProvider).toBe('aws-rekognition');
    expect(config.faceSimilarityThreshold).toBe(92);
  });
});
