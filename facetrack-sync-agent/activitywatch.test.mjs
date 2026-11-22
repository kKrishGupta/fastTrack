import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectActivityWatch, normalizeEvents, readEvents, validateServer } from './activitywatch.mjs';

const start = Date.parse('2026-11-21T10:00:00Z');
const bucket = { id: 'aw-window_test', type: 'currentwindow' };
const event = { id: 7, timestamp: new Date(start - 60_000).toISOString(), duration: 400, data: { app: 'Code.exe', title: 'private.env' } };

test('clips long heartbeats to the consent/checkpoint interval and excludes titles by default', () => {
  const [result] = normalizeEvents(bucket, [event], start, start + 300_000);
  assert.equal(result.duration, 300);
  assert.equal(result.timestamp, new Date(start).toISOString());
  assert.equal(result.title, undefined);
  assert.equal(normalizeEvents(bucket, [event], start, start + 300_000, true)[0].title, 'private.env');
});
test('retries use a stable key and separate intervals have different keys', () => {
  const make = (from) => normalizeEvents(bucket, [event], from, from + 10_000)[0];
  assert.equal(make(start).sourceId, make(start).sourceId);
  assert.notEqual(make(start).sourceId, make(start + 10_000).sourceId);
});
test('normalizes browser fields and drops incognito, credentialed and non-web URLs', () => {
  const web = { id: 'web', type: 'web.tab.current' };
  const make = (data) => ({ ...event, data });
  const result = normalizeEvents(web, [make({ url: 'https://example.com/private?token=abc#secret', title: 'Work page' }), make({ url: 'https://user:secret@example.com' }), make({ url: 'https://private.com', incognito: true }), make({ url: 'file:///private/file' })], start, start + 1000);
  assert.equal(result.length, 1);
  assert.equal(result[0].domain, 'example.com');
  assert.equal(result[0].url, 'https://example.com/private?token=abc#secret');
  assert.equal(result[0].title, 'Work page');
  assert.deepEqual(normalizeEvents(bucket, [{ ...event, duration: NaN }], start, start + 1000), []);
});
test('requires HTTPS for remote upload and rejects credentials, paths and query strings', () => {
  assert.equal(validateServer('https://test.onrender.com/'), 'https://test.onrender.com');
  assert.equal(validateServer('http://localhost:4000'), 'http://localhost:4000');
  for (const value of ['http://example.com', 'https://u:p@example.com', 'https://example.com/api', 'https://example.com?token=x']) assert.throws(() => validateServer(value));
});
test('pairing preflight requires official window and AFK watcher buckets', async () => {
  const healthy = await inspectActivityWatch(async () => ({ window: { type: 'currentwindow' }, afk: { type: 'afkstatus' } }));
  assert.deepEqual(healthy.types.sort(), ['afkstatus', 'currentwindow']);
  await assert.rejects(inspectActivityWatch(async () => ({ window: { type: 'currentwindow' } })), /afkstatus/);
  await assert.rejects(inspectActivityWatch(async () => []), /invalid bucket list/);
});
test('splits saturated API queries and deduplicates overlapping boundary events', async () => {
  let calls = 0;
  const reader = async (path) => {
    calls++;
    const query = new URL(`http://localhost${path}`).searchParams;
    const span = Date.parse(query.get('end')) - Date.parse(query.get('start'));
    return span > 1000 ? Array.from({ length: 501 }, (_, id) => ({ id })) : [{ id: 1 }, { id: 2 }];
  };
  assert.deepEqual(await readEvents('bucket/name', start, start + 2000, reader), [{ id: 1 }, { id: 2 }]);
  assert.equal(calls, 3);
});
test('does not advance silently when more than 500 events share one millisecond', async () => {
  await assert.rejects(readEvents('bucket', start, start + 1, async () => Array.from({ length: 501 }, (_, id) => ({ id }))), /cursor was not advanced/);
});
