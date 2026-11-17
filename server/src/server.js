import http from 'node:http';
import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { loadConfig } from './config/env.js';
import { setupSockets } from './sockets/setup-sockets.js';

const config = loadConfig();
await connectDatabase(config.mongoUri);

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
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received; closing FaceTrack API`);
  io.close();
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
