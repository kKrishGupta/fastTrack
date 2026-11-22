import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

test('NSIS installer uses preflight, verified staging, rollback and non-solid compression', async () => {
  const source = await readFile(resolve('installer', 'FaceTrackSetup.nsi'), 'utf8');
  assert.match(source, /PRODUCT_VERSION "1\.2\.1"/);
  assert.match(source, /SetCompressor zlib/);
  assert.doesNotMatch(source, /SetCompressor \/SOLID/i);
  assert.match(source, /Call CheckDiskSpace/);
  assert.match(source, /SetErrorLevel 112/);
  assert.match(source, /\$INSTDIR\.__new-/);
  assert.match(source, /verify-payload\.mjs/);
  assert.match(source, /Rename "\$PreviousDir" "\$INSTDIR"/);
});

test('installed payload verifier detects missing, extra and modified modules', async () => {
  const root = await mkdtemp(join(tmpdir(), 'facetrack-payload-verify-'));
  try {
    const modulePath = join(root, 'index.mjs');
    const contents = 'export const ready = true;\n';
    await writeFile(modulePath, contents);
    await writeFile(join(root, 'file-manifest.json'), JSON.stringify([{
      path: 'index.mjs',
      sha256: createHash('sha256').update(contents).digest('hex'),
    }]));

    const verify = () => spawnSync(process.execPath, [resolve('installer', 'verify-payload.mjs'), root], { encoding: 'utf8' });
    assert.equal(verify().status, 0);
    await writeFile(modulePath, 'export const ready = false;\n');
    assert.notEqual(verify().status, 0);
    await writeFile(modulePath, contents);
    await writeFile(join(root, 'unexpected.mjs'), 'export {};\n');
    assert.notEqual(verify().status, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});
