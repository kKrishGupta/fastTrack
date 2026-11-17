import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { Organization, User } from '../models.js';
import { ACCESS_COOKIE } from '../utils/cookies.js';

function readCookie(header, name) {
  if (!header) return undefined;
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator === -1) continue;
    if (pair.slice(0, separator).trim() === name) return decodeURIComponent(pair.slice(separator + 1).trim());
  }
  return undefined;
}

export function setupSockets(server, config) {
  const allowedOrigins = new Set(config.allowedOrigins || [config.clientOrigin]);
  const io = new Server(server, {
    cors: {
      origin: [...allowedOrigins],
      credentials: true,
    },
    allowRequest: (request, callback) => {
      const origin = request.headers.origin;
      callback(null, (origin && allowedOrigins.has(origin.replace(/\/$/, ''))) || (!config.isProduction && !origin));
    },
  });
  io.use(async (socket, next) => {
    try {
      const token = readCookie(socket.handshake.headers.cookie, ACCESS_COOKIE);
      const payload = jwt.verify(token, config.jwtSecret, { issuer: 'facetrack-pro' });
      const [user, organization] = await Promise.all([
        User.findOne({ _id: payload.sub, organizationId: payload.org, status: 'active', active: true }).select('organizationId role'),
        Organization.exists({ _id: payload.org, active: true }),
      ]);
      if (!user || !organization) return next(new Error('unauthorized'));
      socket.user = user;
      return next();
    } catch { return next(new Error('unauthorized')); }
  });
  io.on('connection', (socket) => {
    const audience = socket.user.role === 'HR' ? 'hr' : 'employee';
    socket.join(`org:${socket.user.organizationId}:${audience}`);
  });
  return io;
}
