import { Router, parseJsonBody } from '../lib/http.js';
import { validate, passwordRule } from '../lib/validate.js';
import { rateLimit } from '../lib/ratelimit.js';
import { config } from '../config.js';
import * as users from '../services/users.js';
import * as cart from '../services/cart.js';
import { wishlistIds } from '../services/wishlist.js';
import { listNotifications } from '../services/notifications.js';
import { privateUser } from '../services/present.js';
import { clearSessionCookies, requireAuth, setSessionCookies } from '../middleware/auth.js';

const router = new Router();

const sessionPayload = (ctx, user) => {
  const { items, count } = cart.getCart(user.id);
  const notes = listNotifications(user.id, { limit: 10 });
  return {
    user: privateUser(user),
    csrfToken: ctx.session?.csrf,
    cart: { count, items: items.length },
    wishlist: wishlistIds(user.id),
    notifications: { unread: notes.unread },
  };
};

router.post('/register', async (ctx) => {
  rateLimit({ ...config.rateLimits.register, key: `register:${ctx.ip}`, message: 'Too many sign-ups from this address' });
  const body = await parseJsonBody(ctx.req);
  const data = validate(body, {
    name: { type: 'string', required: true, minLength: 2, maxLength: 60 },
    email: { type: 'email', required: true, maxLength: 160 },
    password: passwordRule,
    guestCart: { type: 'array', default: [] },
  });
  const user = users.registerUser(data);
  const session = users.createSession(user.id, { userAgent: ctx.headers['user-agent'], ip: ctx.ip });
  setSessionCookies(ctx, session);
  ctx.session = { csrf: session.csrf };
  if (data.guestCart.length) cart.mergeGuestCart(user.id, data.guestCart);
  return { ...sessionPayload(ctx, user), created: true };
});

router.post('/login', async (ctx) => {
  rateLimit({ ...config.rateLimits.login, key: `login:${ctx.ip}`, message: 'Too many sign-in attempts. Wait a few minutes.' });
  const body = await parseJsonBody(ctx.req);
  const data = validate(body, {
    email: { type: 'email', required: true },
    password: { type: 'password', required: true },
    guestCart: { type: 'array', default: [] },
  });
  const user = users.authenticate(data);
  const session = users.createSession(user.id, { userAgent: ctx.headers['user-agent'], ip: ctx.ip });
  setSessionCookies(ctx, session);
  ctx.session = { csrf: session.csrf };
  if (data.guestCart.length) cart.mergeGuestCart(user.id, data.guestCart);
  return sessionPayload(ctx, user);
});

router.post('/logout', (ctx) => {
  if (ctx.session?.token) users.destroySession(ctx.session.token);
  clearSessionCookies(ctx);
  return { ok: true };
});

router.get('/me', (ctx) => {
  if (!ctx.user) return { user: null };
  return sessionPayload(ctx, ctx.user);
});

router.patch('/me', async (ctx) => {
  requireAuth(ctx);
  const body = await parseJsonBody(ctx.req);
  const data = validate(body, {
    name: { type: 'string', minLength: 2, maxLength: 60 },
    bio: { type: 'text', maxLength: 500 },
  });
  return { user: privateUser(users.updateProfile(ctx.user.id, data)) };
});

router.post('/password', async (ctx) => {
  requireAuth(ctx);
  const body = await parseJsonBody(ctx.req);
  const data = validate(body, {
    currentPassword: { type: 'password', required: true, label: 'current password' },
    newPassword: { ...passwordRule, label: 'new password' },
  });
  users.changePassword(ctx.user.id, data);
  return { ok: true, message: 'Password updated' };
});

router.get('/sessions', (ctx) => {
  requireAuth(ctx);
  return { items: users.listSessions(ctx.user.id, ctx.session?.tokenHash) };
});

router.delete('/sessions', (ctx) => {
  requireAuth(ctx);
  users.destroyAllSessions(ctx.user.id);
  clearSessionCookies(ctx);
  return { ok: true, message: 'Signed out of every device' };
});

export default router;
