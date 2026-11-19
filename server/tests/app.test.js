import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

const config = Object.freeze({
  clientOrigin: 'http://localhost:5173',
  allowedOrigins: Object.freeze(['http://localhost:5173', 'http://127.0.0.1:5173']),
  jwtSecret: '12345678901234567890123456789012',
  authCookieHours: 8,
  challengeMinutes: 5,
  isProduction: false,
  trustProxy: false,
  allowTestFaceAdapter: true,
});

describe('Express application', () => {
  const app = createApp(config);

  it('reports health without requiring a database session', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('normalizes unknown API routes', async () => {
    const response = await request(app).get('/api/not-real');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  it('allows configured CORS origins with credentials', async () => {
    const origin = 'http://127.0.0.1:5173';
    const response = await request(app).get('/api/health').set('Origin', origin);
    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(origin);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('rejects origins that are not in the CORS allowlist', async () => {
    const response = await request(app).get('/api/health').set('Origin', 'https://attacker.example');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CORS_ORIGIN_REJECTED');
  });

  it('rejects cookie-authenticated mutations without a CSRF token', async () => {
    const response = await request(app)
      .post('/api/attendance/check-out')
      .set('Origin', config.clientOrigin)
      .set('Cookie', 'access_token=invalid');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_REJECTED');
  });

  it('rejects state changes from a foreign origin', async () => {
    const response = await request(app)
      .post('/api/attendance/check-out')
      .set('Origin', 'https://attacker.example');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CORS_ORIGIN_REJECTED');
  });

  it('also blocks foreign origins on login requests', async () => {
    const response = await request(app)
      .post('/api/organization/login')
      .set('Origin', 'https://attacker.example')
      .send({ email: 'person@example.com', password: 'Password123!' });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CORS_ORIGIN_REJECTED');
  });

  it('returns a structured message when organization sign-in is rate limited', async () => {
    const isolatedApp = createApp(config);
    let response;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      response = await request(isolatedApp)
        .post('/api/organization/login')
        .set('Origin', config.clientOrigin)
        .send({});
    }
    expect(response.status).toBe(429);
    expect(response.body.error).toEqual({
      code: 'AUTH_RATE_LIMITED',
      message: 'Too many sign-in attempts. Wait 15 minutes before trying again.',
    });
  });

  it('exposes organization registration under the organization namespace', async () => {
    const response = await request(app)
      .post('/api/organization/register')
      .set('Origin', config.clientOrigin)
      .send({ organizationName: '' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('exposes employee login under the employee namespace', async () => {
    const response = await request(app)
      .post('/api/employee/login')
      .set('Origin', config.clientOrigin)
      .send({});
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('exposes employee invitations only under the employee namespace', async () => {
    const response = await request(app).get('/api/organization/invitations/not-a-valid-token');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  it('does not expose the retired auth login endpoint', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Origin', config.clientOrigin)
      .send({});
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  it('keeps logout idempotent when the session is already missing', async () => {
    const response = await request(app)
      .post('/api/session/logout')
      .set('Origin', config.clientOrigin);
    expect(response.status).toBe(204);
  });
});
