import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

const config = Object.freeze({
  clientOrigin: 'http://localhost:5173',
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
    expect(response.body.error.code).toBe('CSRF_REJECTED');
  });

  it('also applies origin protection to login requests', async () => {
    const response = await request(app)
      .post('/api/organization/login')
      .set('Origin', 'https://attacker.example')
      .send({ email: 'person@example.com', password: 'Password123!' });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_REJECTED');
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
