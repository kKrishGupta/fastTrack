import crypto from 'node:crypto';

export const ACCESS_COOKIE = 'access_token';
export const CSRF_COOKIE = 'XSRF-TOKEN';

function baseCookieOptions(config) {
  return {
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/',
  };
}

export function setAuthCookies(res, token, config) {
  const maxAge = config.authCookieHours * 60 * 60 * 1000;
  res.cookie(ACCESS_COOKIE, token, {
    ...baseCookieOptions(config),
    httpOnly: true,
    maxAge,
  });
  res.cookie(CSRF_COOKIE, crypto.randomBytes(32).toString('hex'), {
    ...baseCookieOptions(config),
    httpOnly: false,
    maxAge,
  });
}

export function clearAuthCookies(res, config) {
  res.clearCookie(ACCESS_COOKIE, { ...baseCookieOptions(config), httpOnly: true });
  res.clearCookie(CSRF_COOKIE, { ...baseCookieOptions(config), httpOnly: false });
}
