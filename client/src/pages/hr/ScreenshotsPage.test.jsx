import { describe, expect, it } from 'vitest';
import { screenshotStorageLabel } from './ScreenshotsPage';

describe('screenshot storage size label', () => {
  it('shows the enforced 30 KB limit for compressed JPEG captures', () => {
    expect(screenshotStorageLabel({ format: 'jpg', byteLength: 30_458 })).toBe('29.7 KB compressed (30 KB max)');
  });

  it('does not relabel retained legacy PNG captures as compressed', () => {
    expect(screenshotStorageLabel({ format: 'png', byteLength: 218 * 1024 })).toBe('218.0 KB');
  });
});
