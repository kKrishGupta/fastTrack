import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createOriginProtection } from './middleware/origin-protection.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { createApiRouter } from './routes/index.js';

export function createApp(config) {
  const app = express();
  app.disable('x-powered-by');
  app.set('config', config);
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: config.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(createOriginProtection(config));
  app.use('/api', createApiRouter(config));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
