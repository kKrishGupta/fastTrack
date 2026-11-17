import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createOriginProtection } from './middleware/origin-protection.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { createApiRouter } from './routes/index.js';
import { ApiError } from './utils/api-error.js';

function createCorsOptions(config) {
  const allowedOrigins = new Set(config.allowedOrigins || [config.clientOrigin]);
  return {
    credentials: true,
    origin(origin, callback) {
      // Requests without an Origin header are server-to-server or same-origin.
      if (!origin || allowedOrigins.has(origin.replace(/\/$/, ''))) return callback(null, true);
      return callback(new ApiError(403, 'CORS_ORIGIN_REJECTED', 'Origin is not allowed by CORS'));
    },
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-XSRF-TOKEN'],
  };
}

export function createApp(config) {
  const app = express();
  app.disable('x-powered-by');
  app.set('config', config);
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors(createCorsOptions(config)));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(createOriginProtection(config));
  app.use('/api', createApiRouter(config));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
