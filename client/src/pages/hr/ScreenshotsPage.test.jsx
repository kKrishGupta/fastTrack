// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { screenshotDeviceLabel, screenshotStorageLabel } from './ScreenshotsPage';
import { ScreenshotsPage } from './ScreenshotsPage';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../api', () => ({ api: { get: mocks.get } }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'hr-user' } }) }));

describe('screenshot storage size label', () => {
  it('shows the enforced 30 KB limit for compressed JPEG captures', () => {
    expect(screenshotStorageLabel({ format: 'jpg', byteLength: 30_458 })).toBe('29.7 KB compressed (30 KB max)');
  });

  it('does not relabel retained legacy PNG captures as compressed', () => {
    expect(screenshotStorageLabel({ format: 'png', byteLength: 218 * 1024 })).toBe('218.0 KB');
  });
});

describe('screenshot device label', () => {
  it('uses populated device metadata when available', () => {
    expect(screenshotDeviceLabel({ deviceId: { name: 'Finance laptop', hostname: 'FIN-01' } })).toBe('Finance laptop');
  });

  it('keeps a safe fallback for older records', () => {
    expect(screenshotDeviceLabel({ deviceId: 'device-id' })).toBe('Device');
  });
});

describe('ScreenshotsPage thumbnails', () => {
  it('loads a signed authorized preview for each screenshot on the current page', async () => {
    mocks.get.mockImplementation(async (url) => {
      if (url === '/monitoring/employees') return { data: { items: [{ _id: 'employee-1', name: 'Jane' }] } };
      if (url === '/monitoring/devices') return { data: { items: [{ _id: 'device-1', name: 'Work laptop' }] } };
      if (url === '/monitoring/screenshots') return { data: { items: [{
        _id: 'capture-1', employeeId: { _id: 'employee-1', name: 'Jane' }, deviceId: { _id: 'device-1', name: 'Work laptop' },
        capturedAt: '2026-11-23T10:00:00.000Z', expiresAt: '2026-11-30T10:00:00.000Z', width: 1280, height: 720,
        byteLength: 29_000, format: 'jpg',
      }], total: 1, page: 1, pages: 1 } };
      if (url === '/monitoring/screenshots/capture-1/view') return { data: { viewUrl: 'https://images.example.test/signed-thumbnail' } };
      throw new Error(`Unexpected request: ${url}`);
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><ScreenshotsPage /></QueryClientProvider>);

    const image = await screen.findByAltText('Screenshot from Jane');
    expect(image.getAttribute('src')).toBe('https://images.example.test/signed-thumbnail');
    expect(screen.getAllByText('Work laptop').length).toBe(2);
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith('/monitoring/screenshots/capture-1/view'));
    client.clear();
  });
});
