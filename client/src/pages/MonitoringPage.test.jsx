/* @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MonitoringInstaller } from './MonitoringPage';

afterEach(cleanup);

describe('FaceTrack Monitoring installer publication', () => {
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
