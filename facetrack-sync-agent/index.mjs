import { readFile, mkdir, unlink } from 'node:fs/promises';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import readline from 'node:readline';
import { createInterface } from 'node:readline/promises';
import { AW_BASE, SUPPORTED_TYPES, inspectActivityWatch, localJson, normalizeEvents, readEvents, validateServer } from './activitywatch.mjs';
import { acknowledged, reconcileCheckpoint, retryDelay } from './checkpoint.mjs';
import { Outbox } from './outbox.mjs';
import { readState, writeState } from './state-store.mjs';
import { SAFE_POLICY, filterForPolicy } from './privacy.mjs';
import { ScreenshotOutbox } from './screenshot-outbox.mjs';

const installedStateDir = process.argv.includes('--installed-state') ? join(process.env.LOCALAPPDATA, 'FaceTrack', 'Monitoring') : process.env.FACETRACK_STATE_DIR;
const statePath = installedStateDir ? join(installedStateDir, '.state.json') : fileURLToPath(new URL('./.state.json', import.meta.url));
const command = process.argv[2] || 'run';
const managed = process.argv.includes('--managed');
let state;
let saveQueue = Promise.resolve();
function save() {
  const contents = JSON.stringify(state, null, 2);
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    await writeState(statePath, JSON.parse(contents));
  });
  return saveQueue;
}
async function api(path, options = {}) {
  const response = await fetch(`${state.server}/api/monitoring${path}`, {
    method: options.method || 'GET', redirect: 'error', signal: AbortSignal.timeout(20_000),
    headers: { 'Content-Type': 'application/json', ...(state.token && { Authorization: `Bearer ${state.token}` }) },
    ...(options.body && { body: JSON.stringify(options.body) }),
  });
  if (!response.ok) {
    let payload;
    try { payload = await response.json(); } catch { /* Server may return a non-JSON error. */ }
    const error = new Error(payload?.error?.message || `FaceTrack returned HTTP ${response.status}`);
    error.status = response.status;
    const retryAfter = response.headers.get('retry-after');
    error.retryAfterMs = /^\d+$/.test(retryAfter || '') ? Number(retryAfter) * 1000 : Math.max(0, Date.parse(retryAfter) - Date.now()) || 0;
    throw error;
  }
  return response.json();
}

async function uploadScreenshot(path, bytes, format = 'png') {
  const response = await fetch(`${state.server}/api/monitoring${path}`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60_000),
    headers: { 'Content-Type': format === 'jpg' ? 'image/jpeg' : 'image/png', Authorization: `Bearer ${state.token}` }, body: bytes,
  });
  if (!response.ok) {
    let payload;
    try { payload = await response.json(); } catch { /* The server may return a non-JSON error. */ }
    const error = new Error(payload?.error?.message || `FaceTrack screenshot upload returned HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function pair() {
  const serverArg = process.argv.indexOf('--server');
  let server = serverArg < 0 ? null : process.argv[serverArg + 1];
  if (!server) {
    try { server = JSON.parse((await readFile(new URL('./connection.json', import.meta.url), 'utf8')).replace(/^\uFEFF/, '')).server; }
    catch { throw new Error('Download the agent from your FaceTrack dashboard, or use pair --server https://your-api-server'); }
  }
  state = { server: validateServer(server), cursors: {}, includeTitles: process.argv.includes('--include-titles') };
  // The installed GUI starts its bundled collectors immediately after enrollment.
  // The compatibility bridge relies on an existing ActivityWatch installation and preflights it here.
  if (!installedStateDir) await inspectActivityWatch();
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('FaceTrack ActivityWatch pairing. Activity uploads begin only when you run this agent.');
    console.log('Uploads: application names, active/away intervals, website domains' + (state.includeTitles ? ', and window titles.' : '. Window titles are excluded.'));
    const code = (await prompt.question('Paste the one-time code from Employee > Activity monitoring: ')).trim();
    const result = await api('/enroll', { method: 'POST', body: { code, hostname: os.hostname() } });
    state.token = result.token;
    state.collectAfter = result.item.collectAfter;
    state.deviceId = result.item._id;
    await save();
    console.log('Device paired. Open Start.cmd or run: node index.mjs run');
    console.log('Keep .state.json private. It contains this device credential.');
  } finally { prompt.close(); }
}

async function preview() {
  const { buckets } = await inspectActivityWatch();
  const result = [];
  for (const [id, bucket] of Object.entries(buckets)) {
    if (!SUPPORTED_TYPES.has(bucket.type)) continue;
    const events = await localJson(`/buckets/${encodeURIComponent(id)}/events?limit=5`);
    result.push({ bucketId: id, type: bucket.type, recentEventCount: events.length });
  }
  console.log(JSON.stringify({ activityWatch: AW_BASE, buckets: result, uploads: false }, null, 2));
}

async function unpair() {
  try { state = await readState(statePath); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  state.server = validateServer(state.server);
  try { await api('/agent/revoke', { method: 'POST' }); }
  catch (error) {
    if (![401, 403].includes(error.status)) throw new Error('Online revocation failed. Revoke this device in the employee dashboard before deleting its local credentials.');
  }
  for (const name of ['.state.json', '.state.json.tmp', 'outbox.sqlite', 'outbox.sqlite-wal', 'outbox.sqlite-shm', 'screenshots.sqlite', 'screenshots.sqlite-wal', 'screenshots.sqlite-shm']) {
    await unlink(join(dirname(statePath), name)).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  }
  console.log('Device revoked; FaceTrack credentials and queued uploads removed. ActivityWatch local records remain under your control.');
}

const argument = (name) => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
async function enqueueScreenshot() {
  state = await readState(statePath);
  if (!state.policy?.enabled || !state.policy?.screenshotsEnabled || state.localPaused || Date.now() - Number(state.policyFetchedAt) > 120_000) throw new Error('Screenshot capture is not currently authorized');
  const capturedAt = new Date(argument('--captured-at'));
  const width = Number(argument('--width')), height = Number(argument('--height'));
  const format = argument('--format') || 'png';
  if (!Number.isFinite(+capturedAt) || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 32768 || height > 32768) throw new Error('Invalid screenshot metadata');
  if (!['png', 'jpg'].includes(format)) throw new Error('Screenshot format must be png or jpg');
  const chunks = []; let length = 0;
  const limit = format === 'jpg' ? 30 * 1024 : 10 * 1024 * 1024;
  for await (const chunk of process.stdin) { length += chunk.length; if (length > limit) throw new Error(`Screenshot exceeds the ${format === 'jpg' ? '30 KB' : '10 MB'} limit`); chunks.push(chunk); }
  const bytes = Buffer.concat(chunks);
  const validPng = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const validJpeg = bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
  if (format === 'png' ? !validPng : !validJpeg) throw new Error(`Screenshot bytes are not a valid ${format === 'jpg' ? 'JPEG' : 'PNG'} image`);
  const metadata = { captureId: randomUUID(), capturedAt: capturedAt.toISOString(), width, height, byteLength: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'), format };
  const queue = new ScreenshotOutbox(join(dirname(statePath), 'screenshots.sqlite'), state.outboxKey);
  try { queue.enqueue(metadata, bytes); } finally { queue.close(); }
  console.log(metadata.captureId);
}

async function run() {
  if (!process.stdin.isTTY && !managed) throw new Error('Run this compatibility agent in a visible interactive terminal so pause and stop controls are available.');
  state = await readState(statePath);
  state.outboxKey ||= randomBytes(32).toString('base64');
  await save();
  await mkdir(dirname(statePath), { recursive: true, mode: 0o700 });
  const outbox = new Outbox(join(dirname(statePath), 'outbox.sqlite'), state.outboxKey);
  const screenshotOutbox = new ScreenshotOutbox(join(dirname(statePath), 'screenshots.sqlite'), state.outboxKey);
  state.server = validateServer(state.server);
  console.log(`GrabLogger monitoring agent | ${state.server}`);
  console.log(managed ? 'Managed by the GrabLogger desktop status application.' : 'Visible test agent: p = pause uploads, r = resume, q = stop. Ctrl+C also stops uploads.');
  console.log('ActivityWatch keeps its own local records when this agent is paused or stopped.');
  console.log('Uploads are delayed by 3 minutes so ActivityWatch can finalize away status.');
  console.log(`Window titles: ${state.includeTitles ? 'included' : 'excluded'} | Retention: see your organization policy`);
  let stopped = false;
  let localPaused = Boolean(state.localPaused);
  let requested = localPaused ? 'paused' : null;
  let lastStatus = '';
  let lastBrowserDiagnostic = '';
  let failures = 0;
  let delay = 30_000;
  let wake;
  const stop = () => { stopped = true; wake?.(); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  const keyHandler = (text, key) => {
    text = text?.trim().toLowerCase();
    if (key?.ctrl && key.name === 'c' || text === 'q') return stop();
    if (text === 'p' || text === 'pause') { localPaused = true; state.localPaused = true; requested = 'paused'; save().catch((error) => console.error(error.message)); console.log('PAUSED locally. Sending pause to FaceTrack.'); wake?.(); }
    if (text === 'r' || text === 'resume') {
      if (!localPaused && lastStatus === 'MONITORING') { console.log('Monitoring is already active; resume was ignored.'); return; }
      requested = 'active'; console.log('Resume requested. Waiting for FaceTrack confirmation.'); wake?.();
    }
    if (text === 'quit') return stop();
  };
  let managedInput;
  if (process.stdin.isTTY) {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('keypress', keyHandler);
  } else if (managed) {
    managedInput = readline.createInterface({ input: process.stdin });
    managedInput.on('line', keyHandler);
  }
  try {
    while (!stopped) {
      try {
        state.localPaused = localPaused;
        await save();
        if (requested) {
          const desired = requested;
          await api('/agent/state', { method: 'PATCH', body: { status: desired } });
          if (requested === desired) { requested = null; localPaused = desired === 'paused'; }
        }
        let { item: device, policy = SAFE_POLICY, serverTime } = await api('/agent/status');
        if (serverTime && Math.abs(Date.parse(serverTime) - Date.now()) > 60_000) throw new Error('Computer clock differs from FaceTrack by more than one minute. Correct the clock before syncing.');
        state.policy = policy;
        state.policyFetchedAt = Date.now();
        state.localPaused = localPaused;
        reconcileCheckpoint(state, device);
        const dropped = outbox.reconcile(device.collectAfter);
        if (dropped) console.log(`Privacy boundary changed: discarded ${dropped} pending windows from the previous period.`);
        await save();
        const status = localPaused || device.status === 'paused' ? 'PAUSED' : 'MONITORING';
        if (status !== lastStatus) { console.log(`${new Date().toISOString()} ${status}`); lastStatus = status; }
        const screenshotPolicy = JSON.stringify({ enabled: status === 'MONITORING' && policy.enabled && policy.screenshotsEnabled,
          intervalSeconds: policy.screenshotIntervalSeconds, displayMode: policy.screenshotDisplayMode,
          excludedApps: policy.screenshotExcludedApps || [] });
        console.log(`FACETRACK_SCREENSHOT_POLICY ${screenshotPolicy}`);
        let buckets;
        try {
          buckets = await localJson('/buckets/');
        } catch (error) {
          await api('/agent/heartbeat', { method: 'POST', body: { activityWatchAvailable: false, watchers: [], browserBuckets: [] } });
          throw error;
        }
        const watchers = [...new Set(Object.values(buckets).map((bucket) => bucket.type).filter((type) => SUPPORTED_TYPES.has(type)))];
        const browserBuckets = Object.entries(buckets).filter(([, bucket]) => bucket.type === 'web.tab.current').map(([id]) => id).slice(0, 50);
        await api('/agent/heartbeat', { method: 'POST', body: { activityWatchAvailable: true, watchers, browserBuckets } });
        const browserDiagnostic = browserBuckets.length ? `Browser watcher detected: ${browserBuckets.join(', ')}` : 'Browser watcher not detected; website domains remain unavailable.';
        if (browserDiagnostic !== lastBrowserDiagnostic) { console.log(browserDiagnostic); lastBrowserDiagnostic = browserDiagnostic; }
        if (status === 'MONITORING' && policy.enabled) {
          const finalEnd = Date.now() - 180_000;
          let uploaded = 0;
          const upload = async (events) => {
            const filtered = filterForPolicy(events, policy, state.includeTitles);
            const result = await api('/agent/events', { method: 'POST', body: { events: filtered } });
            acknowledged(result, filtered.length);
            return { accepted: result.accepted, skipped: result.skipped + events.length - filtered.length };
          };
          const canSend = () => !stopped && !localPaused && !requested;
          if (policy.screenshotsEnabled) {
            const expiredScreenshots = screenshotOutbox.expire();
            if (expiredScreenshots) console.log(`Expired ${expiredScreenshots} encrypted screenshots after the 72-hour offline limit.`);
            for (const capture of screenshotOutbox.pending()) {
              if (!canSend()) break;
              const ticket = await api('/agent/screenshots/request-upload', { method: 'POST', body: capture.metadata });
              if (!ticket.alreadyUploaded) {
                if (!/^\/agent\/screenshots\/[0-9a-f-]{36}\/content$/.test(ticket.uploadPath || '')) throw new Error('FaceTrack returned an invalid screenshot upload path');
                await uploadScreenshot(ticket.uploadPath, capture.bytes, capture.metadata.format);
              }
              screenshotOutbox.remove(capture.captureId);
            }
          }
          const expired = outbox.expire();
          if (expired) console.log(`Expired ${expired} offline windows after the 72-hour queue limit.`);
          uploaded += await outbox.flush(upload, canSend); // Drain before polling so a full queue can recover.
          for (const [id, metadata] of Object.entries(buckets)) {
            if (!SUPPORTED_TYPES.has(metadata.type) || metadata.type === 'web.tab.current' && (!policy.browserEnabled || !policy.approvedBrowserBuckets?.includes(id))) continue;
            let start = Math.max(Date.parse(outbox.cursor(id, state.cursors[id] || device.collectAfter)), Date.parse(device.collectAfter));
            // Bounded work per tick; successful checkpoints survive restarts and outages.
            for (let count = 0; count < 12 && start < finalEnd && !stopped && !localPaused && !requested; count++) {
              const end = Math.min(start + 300_000, finalEnd);
              const events = filterForPolicy(normalizeEvents({ ...metadata, id }, await readEvents(id, start, end), start, end, state.includeTitles), policy, state.includeTitles);
              if (stopped || localPaused || requested) break;
              outbox.stage(id, new Date(start).toISOString(), new Date(end).toISOString(), events);
              if (stopped || localPaused || requested) break;
              start = end;
            }
          }
          uploaded += await outbox.flush(upload, canSend);
          console.log(`${new Date().toISOString()} Synced ${uploaded} activity segments. Pending windows: ${outbox.stats().count}.`);
        }
        failures = 0;
        delay = 30_000;
      } catch (error) {
        console.error(error.message);
        if (error.status === 401 || error.status === 403) { console.error('Stopped. Pair a new device if access was revoked or expired.'); break; }
        delay = retryDelay(failures++, error.retryAfterMs);
        console.error(`Will retry in ${Math.ceil(delay / 1000)} seconds. Unconfirmed uploads keep their previous checkpoint.`);
      }
      if (!stopped) await new Promise((resolve) => {
        const timer = setTimeout(() => { wake = null; resolve(); }, delay);
        wake = () => { clearTimeout(timer); wake = null; resolve(); };
      });
    }
  } finally {
    outbox.close();
    screenshotOutbox.close();
    state.localPaused = localPaused;
    await save();
    if (process.stdin.isTTY) { process.stdin.setRawMode(false); process.stdin.off('keypress', keyHandler); process.stdin.pause(); }
    managedInput?.close();
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    console.log('FaceTrack uploads stopped.');
  }
}

try {
  if (command === 'pair') await pair();
  else if (command === 'connect') { await pair(); await run(); }
  else if (command === 'preview') await preview();
  else if (command === 'run') await run();
  else if (command === 'unpair') await unpair();
  else if (command === 'enqueue-screenshot') await enqueueScreenshot();
  else throw new Error('Commands: connect, pair --server <origin> [--include-titles], run, preview, enqueue-screenshot');
} catch (error) {
  console.error(error.code === 'ENOENT' ? 'Agent is not paired. Use the pair command first.' : error.message);
  process.exitCode = 1;
}
