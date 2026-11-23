import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { findInstallerCompiler } from './compiler.mjs';

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
  assert.match(source, /PRODUCT_NAME "GrabLogger"/);
  assert.match(source, /InstallDir "\$LOCALAPPDATA\\Programs\\FaceTrack Monitoring"/);
  assert.match(source, /PRODUCT_EXE "FaceTrackMonitoring\.exe"/);
  assert.match(source, /PRODUCT_KEY "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\FaceTrackMonitoring"/);
  assert.match(source, /Software\\FaceTrack\\Monitoring/);
  assert.match(source, /CurrentVersion\\Run" "FaceTrackMonitoring"/);
  assert.match(source, /RMDir \/r "\$SMPROGRAMS\\FaceTrack Monitoring"/);
  assert.match(source, /--purge-state/);
});

test('installer compiler discovery supports PATH and explicit paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'facetrack-compiler-'));
  try {
    const bin = join(root, 'bin');
    await mkdir(bin);
    const compiler = join(bin, 'makensis.exe');
    await writeFile(compiler, 'test compiler');
    assert.equal(await findInstallerCompiler({ kind: 'nsis', env: { PATH: bin, ProgramFiles: join(root, 'pf'), ProgramFilesX86: join(root, 'pfx86') } }), compiler);
    assert.equal(await findInstallerCompiler({ kind: 'nsis', explicit: compiler }), compiler);
    await assert.rejects(
      findInstallerCompiler({ kind: 'nsis', explicit: join(root, 'missing.exe') }),
      /NSIS compiler was not found at the requested path/
    );
  } finally { await rm(root, { recursive: true, force: true }); }
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
