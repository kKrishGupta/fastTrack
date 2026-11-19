import { afterEach, describe, expect, it, vi } from 'vitest';
import { provisionTeamLoggerEmployee } from '../src/services/teamlogger.service.js';

const config = {
  teamLoggerEnabled: true,
  teamLoggerApiKey: 'private-test-key',
  teamLoggerApiBaseUrl: 'https://api2.teamlogger.com',
  teamLoggerRequestTimeoutMs: 5000,
};

function employee(overrides = {}) {
  return {
    id: 'employee-1',
    email: 'employee@example.com',
    name: 'Example Employee',
    employeeCode: 'EMP-1',
    teamLoggerStatus: 'not_configured',
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('TeamLogger employee provisioning', () => {
  it('creates the provider user without exposing or reusing an application password', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: vi.fn().mockResolvedValue(JSON.stringify({ user: { id: 'tl-123' } })),
    });
    vi.stubGlobal('fetch', fetchMock);
    const target = employee();

    await expect(provisionTeamLoggerEmployee(target, config)).resolves.toBe(target);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(request.body);
    expect(url).toBe('https://api2.teamlogger.com/api/integration/create_user');
    expect(request.headers.Authorization).toBe('Bearer private-test-key');
    expect(body).toMatchObject({
      email: target.email,
      username: target.email,
      name: target.name,
      employeeCode: target.employeeCode,
    });
    expect(body.password).toEqual(expect.any(String));
    expect(body.password.length).toBeGreaterThan(30);
    expect(target.teamLoggerStatus).toBe('provisioned');
    expect(target.teamLoggerUserId).toBe('tl-123');
    expect(target.teamLoggerProvisionedAt).toBeInstanceOf(Date);
  });

  it('records a retryable failure when TeamLogger rejects provisioning', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: vi.fn().mockResolvedValue(JSON.stringify({ message: 'Invalid API credentials' })),
    }));
    const target = employee();

    await expect(provisionTeamLoggerEmployee(target, config)).rejects.toMatchObject({
      code: 'TEAMLOGGER_PROVISIONING_FAILED',
      status: 502,
    });
    expect(target.teamLoggerStatus).toBe('failed');
    expect(target.save).toHaveBeenCalledTimes(2);
  });
});
