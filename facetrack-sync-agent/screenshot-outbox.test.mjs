import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { ScreenshotOutbox } from './screenshot-outbox.mjs';

test('screenshot queue encrypts bytes, preserves metadata and deletes only after acknowledgement', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'facetrack-shot-')), path = join(dir, 'queue.sqlite');
  const queue = new ScreenshotOutbox(path, randomBytes(32).toString('base64'));
  const captureId = randomUUID(), bytes = Buffer.from('not-a-real-png-secret');
  queue.enqueue({ captureId, capturedAt: new Date().toISOString(), width: 10, height: 10, byteLength: bytes.length, sha256: 'a'.repeat(64) }, bytes);
  assert.equal(queue.stats().count, 1);
  const raw = await readFile(path); assert.equal(raw.includes(bytes), false);
  const pending = queue.pending(); assert.equal(pending[0].captureId, captureId); assert.deepEqual(pending[0].bytes, bytes);
  queue.remove(captureId); assert.equal(queue.stats().count, 0);
  queue.close(); await rm(dir, { recursive: true, force: true });
});
