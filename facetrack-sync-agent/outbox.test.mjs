import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Outbox } from './outbox.mjs';

const epoch = '2026-01-01T00:00:00.000Z', end = '2026-01-01T00:05:00.000Z';
test('crash/reopen preserves queued payload and checkpoint; retries are stable until full ACK', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'facetrack-outbox-')), path = join(dir, 'queue.sqlite'), key = randomBytes(32).toString('base64');
  let box;
  try {
    box = new Outbox(path, key); box.reconcile(epoch);
    const events = [{ app: 'SECRET-WINDOW-TITLE', sourceId: '1:slice' }];
    box.stage('window', epoch, end, events); box.close();
    box = new Outbox(path, key); box.reconcile(epoch);
    assert.equal(box.cursor('window', epoch), end);
    await assert.rejects(box.flush(async () => { throw new Error('offline'); }));
    await assert.rejects(box.flush(async () => ({ accepted: 0, skipped: 0 })));
    assert.equal(box.stats().count, 1);
    await box.flush(async (batch) => { assert.deepEqual(batch, events); return { accepted: 1, skipped: 0 }; });
    assert.equal(box.stats().count, 0);
    box.close(); box = null;
    assert.equal((await readFile(path)).includes(Buffer.from('SECRET-WINDOW-TITLE')), false);
  } finally { box?.close(); await rm(dir, { recursive: true, force: true }); }
});
test('quota failure does not advance checkpoint and explicit new epoch removes old queue', () => {
  const box = new Outbox(':memory:', randomBytes(32).toString('base64'), { maxBytes: 1 });
  try {
    box.reconcile(epoch);
    assert.throws(() => box.stage('window', epoch, end, [{ app: 'Code.exe' }]));
    assert.equal(box.cursor('window', epoch), epoch);
    box.maxBytes = 10000; box.stage('window', epoch, end, []);
    assert.equal(box.reconcile(end), 1);
    assert.equal(box.stats().count, 0);
  } finally { box.close(); }
});
