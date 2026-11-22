import { readState } from '../facetrack-sync-agent/state-store.mjs';
import { join } from 'node:path';

const localAppData = process.env.LOCALAPPDATA;
if (!localAppData) throw new Error('LOCALAPPDATA is unavailable');
const state = await readState(join(localAppData, 'FaceTrack', 'Monitoring', '.state.json'));
const response = await fetch(`${state.server}/api/monitoring/agent/status`, {
  redirect: 'error', signal: AbortSignal.timeout(30_000), headers: { Authorization: `Bearer ${state.token}` },
});
if (!response.ok) throw new Error(`FaceTrack device status returned HTTP ${response.status}`);
const remote = await response.json();
const bucketResponse = await fetch('http://127.0.0.1:5600/api/0/buckets/', { signal: AbortSignal.timeout(10_000), redirect: 'error' });
if (!bucketResponse.ok) throw new Error(`Bundled ActivityWatch returned HTTP ${bucketResponse.status}`);
const buckets = await bucketResponse.json();
const watcherEvidence = [];
for (const [id, bucket] of Object.entries(buckets)) {
  if (!['currentwindow', 'afkstatus'].includes(bucket.type)) continue;
  const events = await fetch(`http://127.0.0.1:5600/api/0/buckets/${encodeURIComponent(id)}/events?limit=1`, { signal: AbortSignal.timeout(10_000), redirect: 'error' });
  const latest = events.ok ? (await events.json())[0] : null;
  watcherEvidence.push({ id, type: bucket.type, latestTimestamp: latest?.timestamp, latestDuration: latest?.duration });
}
console.log(JSON.stringify({
  server: state.server,
  device: remote.item && {
    id: remote.item._id,
    status: remote.item.status,
    hostname: remote.item.hostname,
    collectAfter: remote.item.collectAfter,
    lastSeenAt: remote.item.lastSeenAt,
    lastUploadAt: remote.item.lastUploadAt || null,
    activityWatchAvailable: remote.item.activityWatchAvailable,
    watchers: remote.item.watchers,
  },
  acknowledgedCursors: state.cursors || {},
  watcherEvidence,
}, null, 2));
