import { describe, expect, it } from 'vitest';
import { deviceHealth, durationLabel } from './monitoring-data';

describe('monitoring presentation helpers', () => {
  const now = Date.parse('2026-11-23T10:00:00.000Z');

  it('distinguishes current, stale, disconnected, and paused devices', () => {
    expect(deviceHealth({ status: 'active', lastSeenAt: '2026-11-23T09:59:00.000Z' }, now).key).toBe('recent');
    expect(deviceHealth({ status: 'active', lastSeenAt: '2026-11-23T09:50:00.000Z' }, now).key).toBe('stale');
    expect(deviceHealth({ status: 'active', lastSeenAt: '2026-11-23T09:00:00.000Z' }, now).key).toBe('disconnected');
    expect(deviceHealth({ status: 'paused' }, now).key).toBe('paused');
  });

  it('reports expired enrollment separately from connectivity', () => {
    const state = deviceHealth({ status: 'pending', pairingExpiresAt: '2026-11-23T09:00:00.000Z' }, now);
    expect(state).toMatchObject({ key: 'enrollment', label: 'Code expired' });
  });

  it('formats usage durations without inflating seconds', () => {
    expect(durationLabel(3_661)).toBe('1h 1m');
    expect(durationLabel(42)).toBe('42s');
  });
});
