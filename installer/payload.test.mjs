import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { assertRuntimeClosure, copyRuntimeClosure, runtimeModuleClosure } from './payload.mjs';

const source = resolve('facetrack-sync-agent');

test('installer bridge payload is the complete runtime import closure', async () => {
  const expected = await runtimeModuleClosure(source);
  assert.ok(expected.includes('index.mjs'));
  assert.ok(expected.includes('launch.mjs'));
  assert.ok(expected.includes('screenshot-outbox.mjs'));

  const root = await mkdtemp(join(tmpdir(), 'facetrack-installer-payload-'));
  try {
    const copied = await copyRuntimeClosure(source, root);
    assert.deepEqual(copied, expected);
    assert.deepEqual(await assertRuntimeClosure(root), expected);
    await unlink(join(root, 'screenshot-outbox.mjs'));
    await assert.rejects(assertRuntimeClosure(root), /screenshot-outbox\.mjs/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
