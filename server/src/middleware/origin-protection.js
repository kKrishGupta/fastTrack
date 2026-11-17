import { ApiError } from '../utils/api-error.js';
import { ACCESS_COOKIE, CSRF_COOKIE } from '../utils/cookies.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const PUBLIC_AUTH_MUTATIONS = new Set([
  '/api/organization/login',
  '/api/organization/register',
  '/api/employee/login',
  '/api/employee/invitations/accept',
]);

export function createOriginProtection(config) {
  const allowedOrigins = new Set(config.allowedOrigins || [config.clientOrigin]);
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();

    const origin = req.get('origin');
    if (origin && !allowedOrigins.has(origin.replace(/\/$/, ''))) {
      return next(new ApiError(403, 'CSRF_REJECTED', 'Untrusted request origin'));
    }

    // Public authentication flows have no trusted session yet, but still receive
    // strict origin validation above.
    if (PUBLIC_AUTH_MUTATIONS.has(req.path)) return next();

    if (!req.cookies?.[ACCESS_COOKIE]) return next();
    const cookieToken = req.cookies?.[CSRF_COOKIE];
    const headerToken = req.get('X-XSRF-TOKEN');
    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      return next(new ApiError(403, 'CSRF_REJECTED', 'Missing or invalid CSRF token'));
    }
    return next();
  };
}
