import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { MonitoringInsights } from '../../client/src/components/monitoring/MonitoringInsights.jsx';
vi.mock('../../client/src/api.js', () => ({ api: { get: vi.fn(() => { throw new Error('Unexpected network call'); }) } }));

it('renders employee summaries and history without exposing HR editing controls', () => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  const userId = 'employee';
  client.setQueryData(['monitoring','summary',userId,'',24], { totals: { active: 300, idle: 60, productive: 180, unproductive: 0, neutral: 120, unknown: 0 }, days: [{ date: '2026-01-01', active: 300 }], timezone: 'Asia/Kolkata' });
  client.setQueryData(['monitoring','timeline',userId,'',24], { pages: [{ items: [{ _id: 'event', type: 'currentwindow', app: 'Code.exe', duration: 60, timestamp: '2026-01-01T00:00:00Z' }], nextCursor: null }], pageParams: [null] });
  client.setQueryData(['monitoring','policy',userId], { version: 1, enabled: true, browserEnabled: false, retentionDays: 30 });
  client.setQueryData(['monitoring','rules',userId], []);
  const markup = renderToStaticMarkup(<QueryClientProvider client={client}><MonitoringInsights userId={userId} employeeId="" isHr={false} hours={24} /></QueryClientProvider>);
  expect(markup).toContain('Code.exe'); expect(markup).toContain('Asia/Kolkata'); expect(markup).toContain('Screenshots are unavailable');
  expect(markup).not.toContain('Save policy'); expect(markup).not.toContain('Save rule');
  client.clear();
});

it('keeps screenshots out of the HR monitoring insight panel', () => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  const userId = 'hr-user';
  client.setQueryData(['monitoring','summary',userId,'',24], { totals: { active: 0, idle: 0, productive: 0, unproductive: 0, neutral: 0, unknown: 0 }, days: [], timezone: 'UTC' });
  client.setQueryData(['monitoring','timeline',userId,'',24], { pages: [{ items: [], nextCursor: null }], pageParams: [null] });
  client.setQueryData(['monitoring','policy',userId], { version: 1, enabled: true, screenshotsEnabled: true, screenshotIntervalSeconds: 300, screenshotRetentionDays: 7, browserEnabled: false, retentionDays: 30, approvedBrowserBuckets: [], excludedApps: [], excludedDomains: [], screenshotDisplayMode: 'primary', screenshotExcludedApps: [] });
  client.setQueryData(['monitoring','rules',userId], []);
  const markup = renderToStaticMarkup(<QueryClientProvider client={client}><MonitoringInsights userId={userId} employeeId="" isHr={true} hours={24} screenshotsAvailable={true} screenshotStorage={{ configured: true }} /></QueryClientProvider>);
  expect(markup).not.toContain('Authorized screenshot gallery');
  expect(markup).not.toContain('/monitoring/screenshots');
  expect(markup).not.toContain('<img');
  expect(markup).toContain('Save policy');
  client.clear();
});
