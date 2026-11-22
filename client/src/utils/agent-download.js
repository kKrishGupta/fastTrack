import agent from '../../../facetrack-sync-agent/index.mjs?raw';
import activitywatch from '../../../facetrack-sync-agent/activitywatch.mjs?raw';
import checkpoint from '../../../facetrack-sync-agent/checkpoint.mjs?raw';
import outbox from '../../../facetrack-sync-agent/outbox.mjs?raw';
import privacy from '../../../facetrack-sync-agent/privacy.mjs?raw';
import screenshotOutbox from '../../../facetrack-sync-agent/screenshot-outbox.mjs?raw';
import stateStore from '../../../facetrack-sync-agent/state-store.mjs?raw';
import connect from '../../../facetrack-sync-agent/Connect.cmd?raw';
import start from '../../../facetrack-sync-agent/Start.cmd?raw';
import { createTextZip } from './zip';

export function createAgentArchive(server) {
  const url = new URL(server);
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== server || url.username || url.password) throw new Error('Invalid FaceTrack server origin');
  return createTextZip([
    { name: 'index.mjs', contents: agent },
    { name: 'activitywatch.mjs', contents: activitywatch },
    { name: 'checkpoint.mjs', contents: checkpoint },
    { name: 'outbox.mjs', contents: outbox },
    { name: 'privacy.mjs', contents: privacy },
    { name: 'screenshot-outbox.mjs', contents: screenshotOutbox },
    { name: 'state-store.mjs', contents: stateStore },
    { name: 'Connect.cmd', contents: connect.replace(/\r?\n/g, '\r\n') },
    { name: 'Start.cmd', contents: start.replace(/\r?\n/g, '\r\n') },
    { name: 'connection.json', contents: JSON.stringify({ server }, null, 2) },
    { name: 'README.txt', contents: `FaceTrack ActivityWatch agent\r\n\r\nServer: ${server}\r\n\r\n1. Install ActivityWatch and Node.js 24 LTS.\r\n2. Extract all files to a private folder.\r\n3. In your employee dashboard, give consent and create a pairing code.\r\n4. Open Connect.cmd and paste the code. Keep the terminal open.\r\n5. On subsequent days, open Start.cmd.\r\n\r\nP: pause uploads. R: resume. Q: stop. Allow about three minutes for activity.\r\nApplication names and presence are shared. Website domains require separately approved work buckets. Titles are excluded by default.\r\nPause only stops FaceTrack uploads; ActivityWatch continues its own local recording.\r\nWindows state is protected to your OS account. The encrypted outbox preserves pending uploads across restarts. Keep all state files private.\r\n` },
  ]);
}

export function downloadAgent(server) {
  const bytes = createAgentArchive(server);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'FaceTrack-ActivityWatch-Agent.zip';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
