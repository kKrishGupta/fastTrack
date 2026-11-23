/* @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '../api';
import { MonitoringInstaller, MonitoringPage } from './MonitoringPage';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'employee-1', role: 'Employee' } }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('GrabLogger installer publication', () => {
  it('shows the versioned installer link, size and checksum', () => {
    const installer = { version: '1.2.0', channel: 'internal-qa', filename: 'FaceTrackSetup.exe',
      url: 'https://example.test/releases/v1.2.0/FaceTrackSetup.exe', sizeBytes: 188720289,
      sha256: '899d419fa2fb6d34de6225eddea8862ffa949256b73a417165be398a70c24669', signed: false };
    const { container } = render(<MonitoringInstaller integration={{ installer, installerUrl: installer.url }} isHr />);
    expect(screen.getByRole('link', { name: /Download FaceTrackSetup\.exe/i }).getAttribute('href')).toBe(installer.url);
    expect(screen.getByText(/Version 1\.2\.0 · 180\.0 MB/).textContent).toContain('180.0 MB');
    expect(screen.getByText(installer.sha256)).toBeTruthy();
    expect(screen.getByRole('note').textContent).toMatch(/unsigned/i);
    expect(screen.queryByText(/Release channel/i)).toBeNull();
    expect(container.querySelector('.form-alert')).toBeNull();
  });

  it('keeps the unpublished explanation when the API has no installer', () => {
    render(<MonitoringInstaller integration={{}} isHr={false} />);
    expect(screen.getByRole('status').textContent).toContain('has not been published');
  });
});

describe('employee monitoring workspace', () => {
  it('keeps setup, consent and device controls without loading HR activity reports', async () => {
    const get = vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url === '/monitoring/info') return { data: {
        installer: { url: 'https://example.test/FaceTrackSetup.exe' },
        capabilities: { policies: true, screenshots: true },
      } };
      if (url === '/monitoring/devices') return { data: { items: [{
        _id: 'device-1', name: 'Work laptop', hostname: 'EMPLOYEE-PC', status: 'active',
        lastSeenAt: new Date().toISOString(), lastUploadAt: new Date().toISOString(),
        activityWatchAvailable: true, watchers: ['web.tab.current'], screenshotConsentAt: new Date().toISOString(),
      }, {
        _id: 'device-revoked', name: 'Revoked laptop', hostname: 'OLD-PC', status: 'revoked',
      }] } };
      throw new Error(`Unexpected employee monitoring request: ${url}`);
    });
    const remove = vi.spyOn(api, 'delete').mockResolvedValue({ data: null });
    const create = vi.spyOn(api, 'post').mockResolvedValue({ data: {
      item: { _id: 'device-new' }, code: 'pairing-code', expiresAt: new Date(Date.now() + 600_000).toISOString(),
    } });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/employee/monitoring']}><MonitoringPage /></MemoryRouter></QueryClientProvider>);

    expect(await screen.findByRole('heading', { name: 'Connect your computer' })).toBeTruthy();
    const masterConsent = await screen.findByLabelText(/Grant all monitoring permissions/i);
    const savePolicy = screen.getByRole('button', { name: /Save policy & create pairing code/i });
    expect(savePolicy.disabled).toBe(true);
    await userEvent.click(masterConsent);
    expect(savePolicy.disabled).toBe(false);
    await userEvent.click(savePolicy);
    await waitFor(() => expect(create).toHaveBeenCalledWith('/monitoring/devices', {
      name: 'My work computer', consent: true, browserDetailsConsent: true, screenshotConsent: true,
    }));
    expect(await screen.findByText('Work laptop')).toBeTruthy();
    expect(screen.getByText('Connected')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Pause/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Revoke/i })).toBeTruthy();
    expect(screen.getByText('Revoked laptop')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Clean' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('/monitoring/devices/device-revoked'));

    expect(screen.queryByText('Shared activity')).toBeNull();
    expect(screen.queryByText('Authorized activity and productivity')).toBeNull();
    expect(screen.queryByText('Activity history')).toBeNull();
    expect(screen.queryByText('Authorized screenshot gallery')).toBeNull();
    expect(screen.queryByText('Recent activity')).toBeNull();
    expect(get.mock.calls.some(([url]) => url === '/monitoring/report')).toBe(false);
  });
});
