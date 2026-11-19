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
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('[]'),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: vi.fn().mockResolvedValue(JSON.stringify({ data: { user: { guid: 'tl-123' } } })),
      });
    vi.stubGlobal('fetch', fetchMock);
    const target = employee();

    await expect(provisionTeamLoggerEmployee(target, config)).resolves.toBe(target);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api2.teamlogger.com/api/integration/list_users');
    const [url, request] = fetchMock.mock.calls[1];
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
      code: 'TEAMLOGGER_AUTHENTICATION_FAILED',
      status: 502,
    });
    expect(target.teamLoggerStatus).toBe('failed');
    expect(target.save).toHaveBeenCalledTimes(2);
  });

  it('explains when TeamLogger blocks the employee email domain', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('[]'),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: vi.fn().mockResolvedValue('EMAIL_DOMAIN_IS_NOT_WHITELISTED'),
      }));
    const target = employee();

    await expect(provisionTeamLoggerEmployee(target, config)).rejects.toMatchObject({
      code: 'EMAIL_DOMAIN_IS_NOT_WHITELISTED',
      status: 422,
      message: expect.stringMatching(/email domain/i),
      details: {
        statusCode: 400,
        providerMessage: 'EMAIL_DOMAIN_IS_NOT_WHITELISTED',
        retryable: false,
      },
    });
    expect(target.teamLoggerStatus).toBe('failed');
  });

  it('links an existing remote employee instead of creating a duplicate', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(JSON.stringify([{
        guid: 'existing-guid',
        email: ' Employee@Example.com ',
      }])),
    });
    vi.stubGlobal('fetch', fetchMock);
    const target = employee();

    await expect(provisionTeamLoggerEmployee(target, config)).resolves.toBe(target);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toContain('/api/integration/list_users');
    expect(target.teamLoggerStatus).toBe('provisioned');
    expect(target.teamLoggerUserId).toBe('existing-guid');
  });

  it('reconciles the GUID when create_user succeeds without returning one', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('[]'),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: vi.fn().mockResolvedValue(JSON.stringify({ success: true })),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue(JSON.stringify([{
          guid: 'reconciled-guid',
          email: 'employee@example.com',
        }])),
      });
    vi.stubGlobal('fetch', fetchMock);
    const target = employee();

    await expect(provisionTeamLoggerEmployee(target, config)).resolves.toBe(target);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(target.teamLoggerStatus).toBe('provisioned');
    expect(target.teamLoggerUserId).toBe('reconciled-guid');
  });

  it('coalesces concurrent provisioning attempts for the same employee', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('[]'),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: vi.fn().mockResolvedValue(JSON.stringify({ guid: 'single-guid' })),
      });
    vi.stubGlobal('fetch', fetchMock);
    const target = employee();

    const first = provisionTeamLoggerEmployee(target, config);
    const second = provisionTeamLoggerEmployee(target, config);
    await expect(Promise.all([first, second])).resolves.toEqual([target, target]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(target.teamLoggerUserId).toBe('single-guid');
  });
});
