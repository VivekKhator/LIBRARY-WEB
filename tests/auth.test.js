import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, makeClient, ACCOUNTS, uniqueEmail } from './helpers.js';

const server = await startTestServer('auth');
test.after(() => server.close());

test('health and meta endpoints describe the platform', async () => {
  const api = server.client();
  const health = await api.get('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.data.ok, true);

  const meta = await api.get('/api/meta');
  assert.equal(meta.status, 200);
  assert.ok(meta.data.commerce.taxRate > 0);
  assert.ok(meta.data.categories.length >= 5);
  assert.ok(meta.data.sorts.length >= 5);
  assert.ok(meta.data.promos.every((p) => typeof p.code === 'string'));
});

test('registration creates a session and rejects duplicates', async () => {
  const api = server.client();
  const email = uniqueEmail('new');
  const payload = await api.register({ name: 'New Reader', email, password: 'Password1' });
  assert.equal(payload.user.email, email);
  assert.equal(payload.user.role, 'customer');
  assert.ok(api.cookies.get('bb_session'), 'session cookie was not set');
  assert.ok(api.cookies.get('bb_csrf'), 'csrf cookie was not set');

  const second = makeClient(server.base);
  const dup = await second.post('/api/auth/register', { name: 'Clash', email, password: 'Password1' });
  assert.equal(dup.status, 409);
  assert.equal(dup.data.error.code, 'conflict');
});

test('registration validates name, email and password strength', async () => {
  const api = server.client();
  const res = await api.post('/api/auth/register', { name: 'A', email: 'nope', password: 'short' });
  assert.equal(res.status, 422);
  assert.deepEqual(Object.keys(res.data.error.fields).sort(), ['email', 'name', 'password']);

  const weak = await api.post('/api/auth/register', { name: 'Valid Name', email: uniqueEmail(), password: 'alllettersonly' });
  assert.equal(weak.status, 422);
  assert.match(weak.data.error.fields.password, /number/i);
});

test('login succeeds with correct credentials and fails otherwise', async () => {
  const api = server.client();
  const payload = await api.login(ACCOUNTS.reader.email, ACCOUNTS.reader.password);
  assert.equal(payload.user.email, ACCOUNTS.reader.email);
  assert.ok(Array.isArray(payload.wishlist));

  const bad = makeClient(server.base);
  const res = await bad.post('/api/auth/login', { email: ACCOUNTS.reader.email, password: 'wrong-password' });
  assert.equal(res.status, 401);
  assert.equal(res.data.error.code, 'unauthorized');

  const unknown = await bad.post('/api/auth/login', { email: uniqueEmail('ghost'), password: 'Password1' });
  assert.equal(unknown.status, 401, 'unknown accounts must not be distinguishable');
});

test('session endpoint reflects auth state and logout clears it', async () => {
  const api = server.client();
  const anonymous = await api.get('/api/auth/me');
  assert.equal(anonymous.data.user, null);

  await api.login(ACCOUNTS.reader.email, ACCOUNTS.reader.password);
  const me = await api.get('/api/auth/me');
  assert.equal(me.data.user.email, ACCOUNTS.reader.email);

  await api.logout();
  const after = await api.get('/api/auth/me');
  assert.equal(after.data.user, null);
});

test('state-changing requests require a matching CSRF token', async () => {
  const api = server.client();
  await api.login(ACCOUNTS.reader.email, ACCOUNTS.reader.password);

  const missing = await api.post('/api/cart/items', { bookId: 1 }, { headers: { 'X-CSRF-Token': '' } });
  assert.equal(missing.status, 403);

  const wrong = await api.post('/api/cart/items', { bookId: 1 }, { headers: { 'X-CSRF-Token': 'not-the-token' } });
  assert.equal(wrong.status, 403);
});

test('protected endpoints reject anonymous callers', async () => {
  const api = server.client();
  for (const path of ['/api/cart', '/api/orders', '/api/loans', '/api/wishlist', '/api/addresses', '/api/notifications']) {
    const res = await api.get(path);
    assert.equal(res.status, 401, `${path} should require auth`);
  }
});

test('profile and password can be updated, old password stops working', async () => {
  const api = server.client();
  const email = uniqueEmail('pw');
  await api.register({ name: 'Password Tester', email, password: 'Password1' });

  const profile = await api.patch('/api/auth/me', { name: 'Renamed Reader', bio: 'Reads at night.' });
  assert.equal(profile.data.user.name, 'Renamed Reader');

  const wrongCurrent = await api.post('/api/auth/password', { currentPassword: 'nope1234', newPassword: 'Newpass123' });
  assert.equal(wrongCurrent.status, 401);

  const changed = await api.post('/api/auth/password', { currentPassword: 'Password1', newPassword: 'Newpass123' });
  assert.equal(changed.status, 200);

  const fresh = makeClient(server.base);
  const oldLogin = await fresh.post('/api/auth/login', { email, password: 'Password1' });
  assert.equal(oldLogin.status, 401);
  const newLogin = await fresh.post('/api/auth/login', { email, password: 'Newpass123' });
  assert.equal(newLogin.status, 200);
});

test('sessions can be listed and revoked everywhere', async () => {
  const api = server.client();
  await api.login(ACCOUNTS.ben.email, ACCOUNTS.ben.password);
  const second = makeClient(server.base);
  await second.login(ACCOUNTS.ben.email, ACCOUNTS.ben.password);

  const list = await api.get('/api/auth/sessions');
  assert.ok(list.data.items.length >= 2);
  assert.equal(list.data.items.filter((s) => s.current).length, 1);

  await api.del('/api/auth/sessions');
  const afterOne = await api.get('/api/auth/me');
  assert.equal(afterOne.data.user, null);
  const afterTwo = await second.get('/api/auth/me');
  assert.equal(afterTwo.data.user, null, 'other devices should also be signed out');
});

test('suspended accounts cannot sign in', async () => {
  const admin = server.client();
  await admin.login(ACCOUNTS.admin.email, ACCOUNTS.admin.password);

  const victim = server.client();
  const email = uniqueEmail('suspend');
  const created = await victim.register({ name: 'To Suspend', email, password: 'Password1' });

  const res = await admin.patch(`/api/admin/users/${created.user.id}/status`, { status: 'suspended' });
  assert.equal(res.status, 200);

  const fresh = makeClient(server.base);
  const login = await fresh.post('/api/auth/login', { email, password: 'Password1' });
  assert.equal(login.status, 403);
  assert.match(login.data.error.message, /suspended/i);
});
