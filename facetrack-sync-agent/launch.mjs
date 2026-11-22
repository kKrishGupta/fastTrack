// Product integration only: foreground/AFK collection remains entirely in official ActivityWatch.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, open, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import { readState } from './state-store.mjs';
import { PROFILE_FILES, PROFILE_PORT } from './profile-config.mjs';
import { inspectActivityWatch } from './activitywatch.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const managed = process.argv.includes('--managed');
const stateDir = join(process.env.LOCALAPPDATA || root, 'FaceTrack', 'Monitoring');
const statePath = join(stateDir, '.state.json');
const lockPath = join(stateDir, 'launcher.lock');
const env = { ...process.env, FACETRACK_STATE_DIR: stateDir, FACETRACK_AW_PORT: String(PROFILE_PORT), AW_PROFILE: 'facetrack' };
const awOrigin = `http://127.0.0.1:${PROFILE_PORT}`;
const children = new Set();
let stopping = false, lock;
const run = (file, args, options = {}) => {
  const child = spawn(file, args, { env, cwd: root, stdio: 'inherit', windowsHide: true, ...options });
  children.add(child); child.once('exit', () => children.delete(child));
  return child;
};
const completed = (child) => new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code) => resolve(code)); });
async function verifyPackage() {
  const manifest = JSON.parse((await readFile(join(root, 'file-manifest.json'), 'utf8')).replace(/^\uFEFF/, ''));
  for (const entry of manifest) {
    const path = resolve(root, entry.path);
    if (!path.startsWith(`${root}\\`) || entry.path.includes('..')) throw new Error('Invalid package manifest');
    const bytes = await readFile(path);
    if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error('Installed files differ from the verified package. Reinstall FaceTrack Monitoring.');
  }
}
async function stopChildren() {
  for (const child of [...children]) if (child.pid) {
    if (process.platform === 'win32') await completed(spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })).catch(() => {});
    else child.kill('SIGTERM');
  }
}
async function assertUnusedPort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', () => reject(new Error(`Port ${PROFILE_PORT} is already in use. Close any other ActivityWatch instance, then retry. FaceTrack did not access or modify it.`))); server.listen(PROFILE_PORT, '127.0.0.1', resolve); });
  await new Promise((resolve) => server.close(resolve));
}
function watchHealth() {
  let failures = 0, busy = false;
  let finish;
  const promise = new Promise((resolve) => { finish = resolve; });
  const timer = setInterval(async () => {
    if (busy || stopping) return;
    busy = true;
    try {
      const response = await fetch(`${awOrigin}/api/0/buckets/`, { signal: AbortSignal.timeout(5000), redirect: 'error' });
      if (!response.ok) throw new Error('Local server unavailable');
      const buckets = Object.entries(await response.json());
      for (const type of ['currentwindow', 'afkstatus']) {
        const ids = buckets.filter(([,bucket]) => bucket.type === type).map(([id]) => id);
        if (!ids.length) throw new Error('Required official watcher missing');
        let fresh = false;
        for (const id of ids) {
          const events = await fetch(`${awOrigin}/api/0/buckets/${encodeURIComponent(id)}/events?limit=1`, { signal: AbortSignal.timeout(5000), redirect: 'error' });
          if (!events.ok) continue;
          const latest = (await events.json())[0];
          if (latest && Date.parse(latest.timestamp) + latest.duration * 1000 > Date.now() - 300_000) fresh = true;
        }
        if (!fresh) throw new Error('Official watcher heartbeat is stale');
      }
      failures = 0;
    } catch { if (++failures >= 3) { clearInterval(timer); finish('collector'); } }
    finally { busy = false; }
  }, 60_000);
  return { promise, stop: () => clearInterval(timer) };
}
async function configure() {
  const config = join(process.env.LOCALAPPDATA, 'activitywatch-facetrack', 'activitywatch-facetrack');
  for (const [name, content] of Object.entries(PROFILE_FILES)) {
    const path = join(config, name); await mkdir(dirname(path), { recursive: true }); await writeFile(path, content);
  }
}
async function waitForWatchers(child) {
  let lastError;
  for (let attempt = 0; attempt < 60 && !stopping && child.exitCode === null; attempt++) {
    try {
      await inspectActivityWatch(async (path) => {
        const response = await fetch(`${awOrigin}/api/0${path}`, { signal: AbortSignal.timeout(1000), redirect: 'error' });
        if (!response.ok) throw new Error(`ActivityWatch returned HTTP ${response.status}`);
        return response.json();
      });
      return;
    } catch (error) { lastError = error; }
    await delay(500);
  }
  throw new Error(`Bundled ActivityWatch watcher preflight failed. ${lastError?.message || 'Required watchers did not start.'}`);
}
async function main() {
  if (process.platform !== 'win32') throw new Error('The unified package supports Windows x64 only. Use index.mjs for development.');
  if (!process.stdin.isTTY && !managed) throw new Error('Open FaceTrack Monitoring from the Start menu.');
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  try { lock = await open(lockPath, 'wx'); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const owner = Number(await readFile(lockPath, 'utf8'));
    if (!Number.isSafeInteger(owner) || owner < 1) throw new Error('Invalid launcher lock. Contact support; no processes were stopped.');
    try { process.kill(owner, 0); throw new Error('FaceTrack Monitoring is already running. Open its existing console.'); }
    catch (probe) { if (probe.code !== 'ESRCH') throw probe; }
    await unlink(lockPath); lock = await open(lockPath, 'wx');
  }
  await lock.writeFile(String(process.pid)); await lock.sync();
  await verifyPackage();
  console.log('FaceTrack Monitoring — official ActivityWatch + FaceTrack synchronization');
  console.log('This visible window must remain open. Close it to stop FaceTrack-managed components.');
  try { await readState(statePath); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (managed) throw new Error('PAIRING_REQUIRED');
    console.log('Create a pairing code in your employee dashboard after reading the monitoring disclosure.');
    if (await completed(run(process.execPath, [join(root, 'bridge', 'index.mjs'), 'pair'])) !== 0) throw new Error('Enrollment was not completed. No collectors were started.');
  }
  await assertUnusedPort(); // Never adopt a server already on this port or a personal default profile.
  await configure();
  let crashes = 0;
  while (!stopping) {
    const aw = run(join(root, 'activitywatch', 'aw-qt.exe'), ['--profile', 'facetrack', '--no-gui', '--autostart-modules', 'aw-server,aw-watcher-window,aw-watcher-afk'], { stdio: 'ignore' });
    let ready = false;
    aw.on('error', (error) => console.error(`ActivityWatch launch failed: ${error.message}`));
    const exited = completed(aw).catch(() => -1);
    for (let attempt = 0; attempt < 60 && !stopping && aw.exitCode === null; attempt++) {
      try {
        const response = await fetch(`${awOrigin}/api/0/info`, { signal: AbortSignal.timeout(1000), redirect: 'error' });
        if (response.ok) { ready = true; break; }
      } catch { /* Readiness retries are bounded. */ }
      await delay(500);
    }
    if (!ready) { await stopChildren(); throw new Error('ActivityWatch did not become ready on its private loopback port. Check the ActivityWatch profile logs.'); }
    try { await waitForWatchers(aw); }
    catch (error) { await stopChildren(); throw error; }
    console.log(managed ? 'Official ActivityWatch is ready. The FaceTrack desktop application controls uploads.' : 'Official ActivityWatch is ready. The bridge is starting; P pauses uploads, R resumes, Q quits.');
    const bridge = run(process.execPath, [join(root, 'bridge', 'index.mjs'), 'run', ...(managed ? ['--managed'] : [])]);
    const health = watchHealth();
    const outcome = await Promise.race([completed(bridge).then(() => 'bridge'), exited.then(() => 'collector'), health.promise]);
    health.stop();
    await stopChildren();
    if (outcome === 'bridge' || stopping) break; // Exit/revocation must not trigger automatic re-enrollment.
    console.log('ActivityWatch stopped unexpectedly. Restarting owned components.');
    await delay(Math.min(30000, 1000 * 2 ** Math.min(crashes++, 5)));
    await assertUnusedPort();
  }
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopping = true; stopChildren().catch(() => {}); });
try { await main(); }
catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await stopChildren(); if (lock) { await lock.close(); await unlink(lockPath).catch(() => {}); } }
