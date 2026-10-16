import { forbidden, unauthorized } from '../lib/errors.js';
import { resolveSession } from '../services/users.js';
import { safeEqual } from '../lib/auth-crypto.js';
import { serializeCookie } from '../lib/cookies.js';
import { config } from '../config.js';

export const SESSION_COOKIE = 'bb_session';
export const CSRF_COOKIE = 'bb_csrf';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function setSessionCookies(ctx, { token, csrf, expiresAt }) {
  const base = { path: '/', secure: config.isProd, sameSite: 'Lax', expires: expiresAt };
  ctx.setCookies.push(serializeCookie(SESSION_COOKIE, token, { ...base, httpOnly: true }));
  ctx.setCookies.push(serializeCookie(CSRF_COOKIE, csrf, base));
}

export function clearSessionCookies(ctx) {
  const base = { path: '/', secure: config.isProd, sameSite: 'Lax', maxAge: 0 };
  ctx.setCookies.push(serializeCookie(SESSION_COOKIE, '', { ...base, httpOnly: true }));
  ctx.setCookies.push(serializeCookie(CSRF_COOKIE, '', base));
}

/** Resolves the session for every request and enforces double-submit CSRF on writes. */
export function attachUser(ctx) {
  const token = ctx.cookies[SESSION_COOKIE];
  const session = token ? resolveSession(token) : null;
  if (session) {
    ctx.user = session.user;
    ctx.session = { csrf: session.csrf, tokenHash: session.tokenHash, token };
  }
  if (!SAFE_METHODS.has(ctx.method) && ctx.user) {
    const header = ctx.headers['x-csrf-token'];
    if (!header || !safeEqual(header, session.csrf)) {
      throw forbidden('Your session token expired. Refresh the page and try again.');
    }
  }
}

export const requireAuth = (ctx) => {
  if (!ctx.user) throw unauthorized();
  if (ctx.user.status === 'suspended') throw forbidden('This account is suspended');
};

export const requireRole = (...roles) => (ctx) => {
  requireAuth(ctx);
  if (!roles.includes(ctx.user.role)) throw forbidden(`This area is for ${roles.join(' / ')} accounts`);
};

export const requireSeller = (ctx) => {
  requireAuth(ctx);
  if (!['seller', 'admin'].includes(ctx.user.role)) throw forbidden('Open a storefront to manage listings');
};
