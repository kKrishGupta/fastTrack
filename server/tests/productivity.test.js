import { expect, it } from 'vitest';
import { summarizeActivity } from '../src/services/productivity.service.js';
const start = '2026-01-01T00:00:00Z', end = '2026-01-01T00:10:00Z';
const event = (deviceId, type, data, seconds = 300, offset = 0) => ({ employeeId: 'employee', deviceId, type,
  timestamp: new Date(Date.parse(start) + offset * 1000), duration: seconds, ...data });
it('intersects app observation with AFK and defaults unknown rules to neutral', () => {
  const result = summarizeActivity([event('a', 'currentwindow', { app: 'Code.exe' }), event('a', 'afkstatus', { status: 'not-afk' }, 120),
    event('a', 'afkstatus', { status: 'afk' }, 180, 120)], { start, end });
  expect(result.totals).toMatchObject({ active: 120, idle: 180, neutral: 120, productive: 0 });
  expect(result.applications[0].seconds).toBe(120);
});
it('unions simultaneous devices and marks conflicting applications unknown', () => {
  const records = ['a', 'b'].flatMap((device) => [event(device, 'currentwindow', { app: device === 'a' ? 'Code.exe' : 'chrome.exe' }), event(device, 'afkstatus', { status: 'not-afk' })]);
  const result = summarizeActivity(records, { start, end });
  expect(result.totals.active).toBe(300);
  expect(result.totals.unknown).toBe(300);
  expect(result.applications).toEqual([]);
});
it('domain classification needs the same active foreground browser device', () => {
  const records = [event('a', 'currentwindow', { app: 'chrome.exe' }), event('a', 'afkstatus', { status: 'not-afk' }),
    event('a', 'web.tab.current', { domain: 'docs.example.com' })];
  const options = { start, end, rules: [{ kind: 'domain', match: 'example.com', classification: 'productive' }] };
  expect(summarizeActivity(records, options).totals.productive).toBe(300);
  expect(summarizeActivity(records.map((record) => record.type === 'web.tab.current' ? { ...record, deviceId: 'other' } : record), options).totals.productive).toBe(0);
});
it('requires attendance when configured and clips to the real session', () => {
  const result = summarizeActivity([event('a', 'currentwindow', { app: 'Code.exe' }), event('a', 'afkstatus', { status: 'not-afk' })],
    { start, end, requireAttendance: true, attendance: [{ employeeId: 'employee', checkInAt: '2026-01-01T00:01:00Z', checkOutAt: '2026-01-01T00:02:00Z' }] });
  expect(result.totals.active).toBe(60);
});
it('splits daily totals using organization timezone', () => {
  const result = summarizeActivity([event('a', 'currentwindow', { app: 'Code.exe' }), event('a', 'afkstatus', { status: 'not-afk' })],
    { start, end, timezone: 'America/New_York' });
  expect(result.days[0].date).toBe('2025-12-31');
});
