/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() }));
vi.mock('../../api', () => ({ api }));

import { MonitoringInsights } from './MonitoringInsights';
import { MonitoringPolicyEditor } from './MonitoringPolicyEditor';

const policy = {
  version: 1,
  enabled: true,
  includeTitles: false,
  browserEnabled: false,
  browserUrlMode: 'domain',
  browserTitleEnabled: false,
  approvedBrowserBuckets: [],
  excludedApps: [],
  excludedDomains: [],
  requireAttendance: false,
  retentionDays: 30,
  screenshotsEnabled: false,
  screenshotIntervalSeconds: 300,
  screenshotRetentionDays: 7,
  screenshotDisplayMode: 'primary',
  screenshotExcludedApps: [],
};

function renderPolicy(props = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MonitoringPolicyEditor userId="hr-1" screenshotsAvailable {...props} /></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation(async (path) => ({ data: path === '/monitoring/policy' ? { item: policy } : { items: [] } }));
});
afterEach(cleanup);

describe('screenshot policy control', () => {
  it('explains why the checkbox is disabled when private storage is unavailable', async () => {
    renderPolicy({ screenshotsAvailable: false, screenshotStorage: { message: 'Cloudinary is missing on this API.' } });
    const checkbox = await screen.findByRole('checkbox', { name: /Enable screenshots only/i });
    expect(checkbox.disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('Cloudinary is missing on this API.');
  });

  it('keeps the checkbox selected after the policy is saved and refetched', async () => {
    let savedPolicy = policy;
    api.get.mockImplementation(async (path) => ({ data: path === '/monitoring/policy' ? { item: savedPolicy } : { items: [] } }));
    api.put.mockImplementation(async (_path, payload) => {
      savedPolicy = { ...payload, version: payload.version + 1 };
      return { data: { item: savedPolicy } };
    });
    const user = userEvent.setup();
    renderPolicy();
    const checkbox = await screen.findByRole('checkbox', { name: /Enable screenshots only/i });

    await user.click(checkbox);
    expect(checkbox.checked).toBe(true);
    await user.click(screen.getByRole('button', { name: /Save policy/i }));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/monitoring/policy', expect.objectContaining({ screenshotsEnabled: true })));
    await waitFor(() => expect(api.get.mock.calls.filter(([path]) => path === '/monitoring/policy').length).toBeGreaterThan(1));
    expect(screen.getByRole('checkbox', { name: /Enable screenshots only/i }).checked).toBe(true);
    expect(screen.getByRole('status').textContent).toContain('Policy saved.');
  });
});

describe('HR monitoring workspace', () => {
  it('does not duplicate the dedicated screenshot gallery route', async () => {
    api.get.mockImplementation(async (path) => {
      if (path === '/monitoring/summary') return { data: {
        totals: { active: 0, idle: 0, productive: 0, unproductive: 0, neutral: 0, unknown: 0 },
        days: [], timezone: 'Asia/Calcutta',
      } };
      if (path === '/monitoring/timeline') return { data: { items: [], nextCursor: null } };
      if (path === '/monitoring/policy') return { data: { item: policy } };
      if (path === '/monitoring/rules') return { data: { items: [] } };
      throw new Error(`Unexpected monitoring request: ${path}`);
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MonitoringInsights userId="hr-1" isHr hours={24} screenshotsAvailable /></QueryClientProvider>);

    expect(await screen.findByText('Authorized activity and productivity')).toBeTruthy();
    expect(await screen.findByText('Organization monitoring policy')).toBeTruthy();
    expect(screen.queryByText('Authorized screenshot gallery')).toBeNull();
    expect(api.get.mock.calls.some(([path]) => path === '/monitoring/screenshots')).toBe(false);
  });
});
