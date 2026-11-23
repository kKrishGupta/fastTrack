// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MonitoringWorkspaceLayout } from '../../../components/monitoring/MonitoringWorkspaceLayout';
import { MonitoringOverviewPage } from './MonitoringOverviewPage';
import { MonitoringLivePage } from './MonitoringLivePage';
import { MonitoringHistoryPage } from './MonitoringHistoryPage';
import { MonitoringAnalyticsPage } from './MonitoringAnalyticsPage';
import { MonitoringDevicesPage } from './MonitoringDevicesPage';
import { MonitoringPoliciesPage } from './MonitoringPoliciesPage';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../../api', () => ({ api: { get: mocks.get, put: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'hr-user', role: 'HR' } }) }));

const policy = {
  version: 1, enabled: true, includeTitles: false, browserEnabled: false, browserUrlMode: 'domain', browserTitleEnabled: false,
  approvedBrowserBuckets: [], excludedApps: [], excludedDomains: [], requireAttendance: false, retentionDays: 30,
  screenshotsEnabled: false, screenshotIntervalSeconds: 300, screenshotRetentionDays: 7, screenshotDisplayMode: 'primary', screenshotExcludedApps: [],
};

function apiResponse(url) {
  if (url === '/monitoring/employees' || url === '/monitoring/devices') return { data: { items: [] } };
  if (url === '/monitoring/report') return { data: { applications: [], websites: [], presence: [], recent: [] } };
  if (url === '/monitoring/summary') return { data: { totals: {}, days: [] } };
  if (url === '/monitoring/timeline') return { data: { items: [], nextCursor: null } };
  if (url === '/monitoring/info') return { data: { capabilities: { screenshots: false }, screenshotStorage: { configured: false, message: 'Storage unavailable' } } };
  if (url === '/monitoring/policy') return { data: { item: policy } };
  if (url === '/monitoring/rules') return { data: { items: [] } };
  throw new Error(`Unexpected request: ${url}`);
}

function renderRoute(path) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/hr/monitoring" element={<MonitoringWorkspaceLayout />}>
      <Route index element={<MonitoringOverviewPage />} />
      <Route path="live" element={<MonitoringLivePage />} />
      <Route path="history" element={<MonitoringHistoryPage />} />
      <Route path="analytics" element={<MonitoringAnalyticsPage />} />
      <Route path="devices" element={<MonitoringDevicesPage />} />
      <Route path="policies" element={<MonitoringPoliciesPage />} />
    </Route>
  </Routes></MemoryRouter></QueryClientProvider>);
  return client;
}

afterEach(() => {
  cleanup();
  mocks.get.mockReset();
});

describe('HR monitoring routes', () => {
  const cases = [
    ['/hr/monitoring', 'Activity Monitoring'],
    ['/hr/monitoring/live', 'Live Activity'],
    ['/hr/monitoring/history', 'Activity History'],
    ['/hr/monitoring/analytics', 'Applications & Websites'],
    ['/hr/monitoring/devices', 'Devices & Computer Setup'],
    ['/hr/monitoring/policies', 'Monitoring Policies'],
  ];

  it.each(cases)('renders %s', async (path, heading) => {
    mocks.get.mockImplementation(async (url) => apiResponse(url));
    const client = renderRoute(path);
    expect(await screen.findByRole('heading', { name: heading, level: 1 })).toBeTruthy();
    client.clear();
  });
});
