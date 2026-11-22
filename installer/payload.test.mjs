import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { assertRuntimeClosure, copyRuntimeClosure, pruneActivityWatchSourceMaps, runtimeModuleClosure } from './payload.mjs';

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

test('ActivityWatch debug source maps are pruned without removing runtime assets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'facetrack-activitywatch-prune-'));
  const staticDirectory = join(root, 'aw-server', 'aw_server', 'static');
  try {
    await mkdir(join(staticDirectory, 'js'), { recursive: true });
    await writeFile(join(staticDirectory, 'js', 'app.js'), 'globalThis.ready = true;\n//# sourceMappingURL=app.js.map\n');
    await writeFile(join(staticDirectory, 'js', 'app.js.map'), '{"version":3}');
    await writeFile(join(staticDirectory, 'app.css'), 'body{color:black}\n/*# sourceMappingURL=app.css.map */\n');
    await writeFile(join(staticDirectory, 'app.css.map'), '{"version":3}');

    const result = await pruneActivityWatchSourceMaps(root);
    assert.deepEqual(result, { removedFiles: 2, removedBytes: 26, strippedReferences: 2 });
    assert.equal(await readFile(join(staticDirectory, 'js', 'app.js'), 'utf8'), 'globalThis.ready = true;\n');
    assert.equal(await readFile(join(staticDirectory, 'app.css'), 'utf8'), 'body{color:black}\n');
    await assert.rejects(readFile(join(staticDirectory, 'js', 'app.js.map')), { code: 'ENOENT' });
  } finally { await rm(root, { recursive: true, force: true }); }
});
