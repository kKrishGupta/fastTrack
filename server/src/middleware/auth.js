import jwt from 'jsonwebtoken';
import { Organization, User } from '../models.js';
import { ApiError } from '../utils/api-error.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ACCESS_COOKIE } from '../utils/cookies.js';

export function createAuthenticate(config) {
  return asyncHandler(async (req, res, next) => {
    const token = req.cookies?.[ACCESS_COOKIE];
    if (!token) throw new ApiError(401, 'AUTH_REQUIRED', 'Authentication required');

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret, { issuer: 'facetrack-pro' });
    } catch {
      throw new ApiError(401, 'SESSION_INVALID', 'Session expired or invalid');
    }

    const [user, organization] = await Promise.all([
      User.findOne({
        _id: payload.sub,
        organizationId: payload.org,
        status: 'active',
        active: true,
      }),
      Organization.findOne({ _id: payload.org, active: true }).select('_id'),
    ]);
    if (!user || !organization) throw new ApiError(401, 'SESSION_INVALID', 'Session expired or invalid');

    req.user = user;
    return next();
  });
}

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(new ApiError(403, 'FORBIDDEN', 'Insufficient permission'));
  }
  return next();
};
