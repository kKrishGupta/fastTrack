import { readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import readline from 'node:readline';
import { createInterface } from 'node:readline/promises';
import { AW_BASE, SUPPORTED_TYPES, localJson, normalizeEvents, readEvents, validateServer } from './activitywatch.mjs';

const statePath = fileURLToPath(new URL('./.state.json', import.meta.url));
const command = process.argv[2] || 'run';
let state;
let saveQueue = Promise.resolve();
function save() {
  const contents = JSON.stringify(state, null, 2);
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    await writeFile(`${statePath}.tmp`, contents, { mode: 0o600 });
    await rename(`${statePath}.tmp`, statePath);
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
    throw error;
  }
  return response.json();
}

async function pair() {
  const serverArg = process.argv.indexOf('--server');
  if (serverArg < 0 || !process.argv[serverArg + 1]) throw new Error('Usage: node facetrack-sync-agent/index.mjs pair --server https://your-api.onrender.com');
  state = { server: validateServer(process.argv[serverArg + 1]), cursors: {}, includeTitles: process.argv.includes('--include-titles') };
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
    console.log('Device paired. Run: node facetrack-sync-agent/index.mjs run');
    console.log('Keep .state.json private. It contains this device credential.');
  } finally { prompt.close(); }
}

async function preview() {
  const buckets = await localJson('/buckets/');
  const result = [];
  for (const [id, bucket] of Object.entries(buckets)) {
    if (!SUPPORTED_TYPES.has(bucket.type)) continue;
    const events = await localJson(`/buckets/${encodeURIComponent(id)}/events?limit=5`);
    result.push({ bucketId: id, type: bucket.type, recentEventCount: events.length });
  }
  console.log(JSON.stringify({ activityWatch: AW_BASE, buckets: result, uploads: false }, null, 2));
}

async function run() {
  if (!process.stdin.isTTY) throw new Error('Run this proof-of-concept agent in a visible interactive terminal so pause and stop controls are available.');
  state = JSON.parse(await readFile(statePath, 'utf8'));
  state.server = validateServer(state.server);
  console.log(`FaceTrack monitoring agent | ${state.server}`);
  console.log('Visible test agent: p = pause uploads, r = resume, q = stop. Ctrl+C also stops uploads.');
  console.log('ActivityWatch keeps its own local records when this agent is paused or stopped.');
  console.log('Uploads are delayed by 3 minutes so ActivityWatch can finalize away status.');
  console.log(`Window titles: ${state.includeTitles ? 'included' : 'excluded'} | Retention: 30 days`);
  let stopped = false;
  let localPaused = Boolean(state.localPaused);
  let requested = localPaused ? 'paused' : null;
  let lastStatus = '';
  let sessionStarted = false;
  let wake;
  const stop = () => { stopped = true; wake?.(); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  const keyHandler = (text, key) => {
    if (key?.ctrl && key.name === 'c' || text === 'q') return stop();
    if (text === 'p') { localPaused = true; state.localPaused = true; requested = 'paused'; save().catch((error) => console.error(error.message)); console.log('PAUSED locally. Sending pause to FaceTrack.'); wake?.(); }
    if (text === 'r') { requested = 'active'; console.log('Resume requested. Waiting for FaceTrack confirmation.'); wake?.(); }
  };
  if (process.stdin.isTTY) {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('keypress', keyHandler);
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
        let { item: device } = await api('/agent/status');
        // A new visible run starts a new collection period; time while the agent was stopped is excluded.
        if (!sessionStarted && device.status === 'active' && !localPaused) {
          ({ item: device } = await api('/agent/state', { method: 'PATCH', body: { status: 'active' } }));
        }
        sessionStarted = true;
        state.localPaused = localPaused;
        if (state.collectAfter !== device.collectAfter) {
          state.collectAfter = device.collectAfter;
          state.cursors = {};
        }
        await save();
        const status = localPaused || device.status === 'paused' ? 'PAUSED' : 'MONITORING';
        if (status !== lastStatus) { console.log(`${new Date().toISOString()} ${status}`); lastStatus = status; }
        if (status === 'MONITORING') {
          const buckets = await localJson('/buckets/');
          const finalEnd = Date.now() - 180_000;
          let uploaded = 0;
          for (const [id, metadata] of Object.entries(buckets)) {
            if (!SUPPORTED_TYPES.has(metadata.type)) continue;
            let start = Math.max(Date.parse(state.cursors[id] || device.collectAfter), Date.parse(device.collectAfter));
            // Bounded work per tick; successful checkpoints survive restarts and outages.
            for (let count = 0; count < 12 && start < finalEnd && !stopped && !localPaused && !requested; count++) {
              const end = Math.min(start + 300_000, finalEnd);
              const events = normalizeEvents({ ...metadata, id }, await readEvents(id, start, end), start, end, state.includeTitles);
              if (stopped || localPaused || requested) break;
              for (let offset = 0; offset < events.length; offset += 500) {
                if (stopped || localPaused || requested) break;
                await api('/agent/events', { method: 'POST', body: { events: events.slice(offset, offset + 500) } });
                uploaded += Math.min(500, events.length - offset);
              }
              if (stopped || localPaused || requested) break;
              state.cursors[id] = new Date(end).toISOString();
              await save();
              start = end;
            }
          }
          console.log(`${new Date().toISOString()} Synced ${uploaded} activity segments.`);
        }
      } catch (error) {
        console.error(error.message);
        if (error.status === 401 || error.status === 403) { console.error('Stopped. Pair a new device if access was revoked or expired.'); break; }
        console.error('Will retry in 30 seconds. Unconfirmed uploads keep their previous checkpoint.');
      }
      if (!stopped) await new Promise((resolve) => {
        const timer = setTimeout(() => { wake = null; resolve(); }, 30_000);
        wake = () => { clearTimeout(timer); wake = null; resolve(); };
      });
    }
  } finally {
    state.localPaused = localPaused;
    await save();
    if (process.stdin.isTTY) { process.stdin.setRawMode(false); process.stdin.off('keypress', keyHandler); process.stdin.pause(); }
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    console.log('FaceTrack uploads stopped.');
  }
}

try {
  if (command === 'pair') await pair();
  else if (command === 'preview') await preview();
  else if (command === 'run') await run();
  else throw new Error('Commands: pair --server <origin> [--include-titles], run, preview');
} catch (error) {
  console.error(error.code === 'ENOENT' ? 'Agent is not paired. Use the pair command first.' : error.message);
  process.exitCode = 1;
}
