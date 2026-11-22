import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, cp, readdir, stat, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateServer } from '../facetrack-sync-agent/activitywatch.mjs';
import { assertRuntimeClosure, copyRuntimeClosure } from './payload.mjs';

const here = dirname(fileURLToPath(import.meta.url)), root = dirname(here);
const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const origin = validateServer(option('--server') || process.env.FACETRACK_SERVER);
if (!origin.startsWith('https:')) throw new Error('Installer server must use HTTPS');
const lock = JSON.parse(await readFile(join(here, 'dependencies.lock.json'), 'utf8'));
const cache = join(here, 'cache'), stage = join(here, 'stage');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function verifyManifest() {
  const manifest = JSON.parse(await readFile(join(stage, 'file-manifest.json'), 'utf8'));
  for (const entry of manifest) {
    if (entry.path.includes('..') || hash(await readFile(join(stage, entry.path))) !== entry.sha256) throw new Error('Staged payload integrity check failed');
  }
}
async function files(path) {
  const result = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Symlink in package input');
    if (entry.isDirectory()) result.push(...await files(join(path, entry.name)));
    else result.push(join(path, entry.name));
  }
  return result;
}
await mkdir(cache, { recursive: true });
if (!args.includes('--compile-only')) {
  if (args.includes('--refresh-bridge')) await verifyManifest();
  else await mkdir(stage); // Fail rather than accidentally mix old and new build payloads.
  for (const name of ['activitywatch', 'node']) {
    if (args.includes('--refresh-bridge')) continue;
    const pin = lock[name], archive = join(cache, `${name}-${pin.version}.zip`);
    let bytes;
    try { bytes = await readFile(archive); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const response = await fetch(pin.url, { signal: AbortSignal.timeout(300_000) });
      if (!response.ok) throw new Error(`${name} download failed: ${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer());
      if (hash(bytes) !== pin.sha256) throw new Error(`${name} download checksum mismatch`);
      await writeFile(archive, bytes);
    }
    if (hash(bytes) !== pin.sha256) throw new Error(`${name} archive checksum mismatch`);
    const expanded = join(cache, `${name}-expanded-${randomUUID()}`);
    const extracted = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      'Expand-Archive -LiteralPath $env:FACETRACK_ARCHIVE -DestinationPath $env:FACETRACK_EXPANDED -ErrorAction Stop'],
    { env: { ...process.env, FACETRACK_ARCHIVE: archive, FACETRACK_EXPANDED: expanded }, stdio: 'inherit' });
    if (extracted.status !== 0) throw new Error('Official archive extraction failed');
    const entry = (await files(expanded)).find((path) => path.endsWith(name === 'node' ? 'node.exe' : 'aw-qt.exe'));
    if (!entry) throw new Error(`Missing ${name} executable`);
    await cp(dirname(entry), join(stage, name), { recursive: true });
    console.log(`Staged official ${name} ${pin.version}; SHA-256 verified.`);
  }
  const bridge = join(stage, 'bridge'); await mkdir(bridge, { recursive: true });
  const bridgeModules = await copyRuntimeClosure(join(root, 'facetrack-sync-agent'), bridge);
  await assertRuntimeClosure(bridge);
  console.log(`Staged ${bridgeModules.length} bridge runtime modules from the verified import closure.`);
  await writeFile(join(bridge, 'connection.json'), JSON.stringify({ server: origin }));
  const desktopOutput = join(cache, `desktop-${randomUUID()}`);
  const desktopBuild = spawnSync('dotnet', [
    'publish', join(root, 'desktop', 'FaceTrack.Monitoring.Desktop', 'FaceTrack.Monitoring.Desktop.csproj'),
    '--configuration', 'Release', '--runtime', 'win-x64', '--self-contained', 'true', '--output', desktopOutput,
    '-p:PublishSingleFile=true', '-p:IncludeNativeLibrariesForSelfExtract=true', '-p:NuGetAudit=false', '-p:DebugType=None', '-p:DebugSymbols=false', '--nologo'
  ], { stdio: 'inherit' });
  if (desktopBuild.status !== 0) throw new Error('FaceTrack desktop status application build failed');
  await cp(join(desktopOutput, 'FaceTrackMonitoring.exe'), join(stage, 'FaceTrackMonitoring.exe'));
  await unlink(join(stage, 'FaceTrack Monitoring.cmd')).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  for (const name of ['dependencies.lock.json', 'THIRD_PARTY_NOTICES.md']) await cp(join(here, name), join(stage, name));
  const dotnetRoot = join(process.env.ProgramFiles || 'C:\\Program Files', 'dotnet');
  await cp(join(dotnetRoot, 'LICENSE.txt'), join(stage, 'DOTNET-LICENSE.txt'));
  await cp(join(dotnetRoot, 'ThirdPartyNotices.txt'), join(stage, 'DOTNET-THIRD-PARTY-NOTICES.txt'));
  const manifest = [];
  for (const path of await files(stage)) if (!path.endsWith('file-manifest.json')) manifest.push({ path: relative(stage, path), sha256: hash(await readFile(path)) });
  await writeFile(join(stage, 'file-manifest.json'), JSON.stringify(manifest, null, 2));
}
if (args.includes('--stage-only')) { console.log('Staging verified. Installer compilation has not run.'); process.exit(0); }
await verifyManifest();
await assertRuntimeClosure(join(stage, 'bridge'));
if (JSON.parse(await readFile(join(stage, 'bridge', 'connection.json'), 'utf8')).server !== origin) throw new Error('Staged server origin does not match');
if (!args.includes('--redistribution-reviewed') && !args.includes('--internal-test-build')) throw new Error('Staged only: complete the release license/source checklist, or explicitly request an unsigned internal test build.');
const nsis = args.includes('--nsis');
const compiler = args.includes('--compiler') ? option('--compiler') : nsis
  ? 'C:\\Program Files (x86)\\NSIS\\makensis.exe'
  : 'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe';
await stat(compiler);
await mkdir(join(here, 'output'), { recursive: true });
const result = spawnSync(compiler, nsis ? ['/V2', join(here, 'FaceTrackSetup.nsi')] : [join(here, 'FaceTrackSetup.iss')], { stdio: 'inherit' });
if (result.status !== 0) throw new Error('Installer compilation failed');
