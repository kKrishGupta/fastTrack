import http from 'node:http';
import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { loadConfig } from './config/env.js';
import { setupSockets } from './sockets/setup-sockets.js';
import { MonitoringDevice } from './models/MonitoringDevice.js';
import { ActivityEvent } from './models/ActivityEvent.js';
import { MonitoringPolicy } from './models/MonitoringPolicy.js';
import { ProductivityRule } from './models/ProductivityRule.js';
import { ScreenshotCapture } from './models/ScreenshotCapture.js';
import { purgeExpiredScreenshots } from './services/monitoring-screenshot.service.js';

const config = loadConfig();
await connectDatabase(config.mongoUri);
// Do not acknowledge ingestion before its uniqueness and retention indexes are ready.
await Promise.all([MonitoringDevice, ActivityEvent, MonitoringPolicy, ProductivityRule, ScreenshotCapture].map((model) => model.createIndexes()));

const app = createApp(config);
const server = http.createServer(app);
const io = setupSockets(server, config);
app.set('io', io);

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(config.port, () => {
    server.off('error', reject);
    console.log(`FaceTrack API listening on http://localhost:${config.port}`);
    resolve();
  });
});

let shuttingDown = false;
const screenshotRetentionTimer = setInterval(() => purgeExpiredScreenshots(config).catch((error) => console.error('Screenshot retention job failed', error)), 60 * 60_000);
screenshotRetentionTimer.unref();
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received; closing FaceTrack API`);
  io.close();
  clearInterval(screenshotRetentionTimer);
  await new Promise((resolve) => server.close(resolve));
  await disconnectDatabase();
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    try {
      await shutdown(signal);
      process.exit(0);
    } catch (error) {
      console.error('Graceful shutdown failed', error);
      process.exit(1);
    }
  });
}
