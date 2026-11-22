import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readState, writeState } from './state-store.mjs';
test('device state roundtrips and Windows state does not contain plaintext credentials', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'facetrack-state-')), path = join(dir, 'state.json');
  try {
    await writeState(path, { token: 'TEST-ONLY-DEVICE-CREDENTIAL', cursors: {} });
    assert.deepEqual(await readState(path), { token: 'TEST-ONLY-DEVICE-CREDENTIAL', cursors: {} });
    if (process.platform === 'win32') {
      const saved = await readFile(path, 'utf8'); assert.ok(saved.startsWith('DPAPI:')); assert.equal(saved.includes('TEST-ONLY'), false);
    }
  } finally { await rm(dir, { force: true, recursive: true }); }
});
