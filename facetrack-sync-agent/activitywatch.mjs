const configuredPort = typeof process !== 'undefined' ? process.env.FACETRACK_AW_PORT : undefined;
const awPort = /^\d{1,5}$/.test(configuredPort || '') && Number(configuredPort) <= 65535 ? configuredPort : '5600';
export const AW_BASE = `http://127.0.0.1:${awPort}/api/0`;
export const SUPPORTED_TYPES = new Set(['currentwindow', 'afkstatus', 'web.tab.current']);

export async function localJson(path, fetcher = fetch) {
  const response = await fetcher(`${AW_BASE}${path}`, { signal: AbortSignal.timeout(15_000), redirect: 'error' });
  if (!response.ok) throw new Error(`ActivityWatch returned HTTP ${response.status}. Check http://localhost:5600.`);
  return response.json();
}

export async function inspectActivityWatch(reader = localJson) {
  const buckets = await reader('/buckets/');
  if (!buckets || Array.isArray(buckets) || typeof buckets !== 'object') throw new Error('ActivityWatch returned an invalid bucket list');
  const types = new Set(Object.values(buckets).map((bucket) => bucket?.type));
  const missing = ['currentwindow', 'afkstatus'].filter((type) => !types.has(type));
  if (missing.length) throw new Error(`ActivityWatch is running, but required watcher data is missing: ${missing.join(', ')}. Start the window and AFK watchers, then retry.`);
  return { buckets, types: [...types].filter(Boolean) };
}

export async function readEvents(bucketId, start, end, reader = localJson, depth = 0) {
  const query = new URLSearchParams({ start: new Date(start).toISOString(), end: new Date(end).toISOString(), limit: '501' });
  const items = await reader(`/buckets/${encodeURIComponent(bucketId)}/events?${query}`);
  if (!Array.isArray(items)) throw new Error('ActivityWatch returned an invalid event list');
  if (items.length < 501) return items;
  // Split saturated intervals instead of silently dropping older events.
  if (end - start <= 1 || depth >= 24) throw new Error('Too many ActivityWatch events at one timestamp; cursor was not advanced');
  const middle = Math.floor((start + end) / 2);
  const left = await readEvents(bucketId, start, middle, reader, depth + 1);
  const right = await readEvents(bucketId, middle, end, reader, depth + 1);
  const unique = new Map();
  for (const event of [...left, ...right]) unique.set(String(event.id), event);
  return [...unique.values()];
}

export function normalizeEvents(bucket, events, start, end, includeTitles = false) {
  return events.flatMap((event) => {
    const originalStart = Date.parse(event.timestamp);
    const duration = Number(event.duration);
    if (!Number.isFinite(originalStart) || !Number.isFinite(duration) || duration < 0 || event.id == null) return [];
    const from = Math.max(start, originalStart);
    const to = Math.min(end, originalStart + duration * 1000);
    if (to <= from || event.data?.incognito) return [];
    const item = {
      bucketId: bucket.id, sourceId: `${event.id}:${new Date(start).toISOString()}`,
      type: bucket.type, timestamp: new Date(from).toISOString(), duration: (to - from) / 1000,
    };
    if (bucket.type === 'currentwindow') {
      if (!event.data?.app) return [];
      item.app = String(event.data.app).slice(0, 300);
      if (includeTitles) item.title = String(event.data.title || '').slice(0, 500);
    } else if (bucket.type === 'afkstatus') {
      if (!['afk', 'not-afk'].includes(event.data?.status)) return [];
      item.status = event.data.status;
    } else if (bucket.type === 'web.tab.current') {
      try {
        const url = new URL(event.data?.url);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return [];
        item.domain = url.hostname.toLowerCase().slice(0, 253);
        item.url = url.href.slice(0, 2048);
        item.title = String(event.data?.title || '').slice(0, 500);
      } catch { return []; }
    } else return [];
    return [item];
  });
}

export function validateServer(value) {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname.replace(/\/$/, ''))) {
    throw new Error('Use the FaceTrack API server origin, for example https://your-api.onrender.com');
  }
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new Error('FaceTrack requires HTTPS, except on localhost');
  return url.origin;
}
