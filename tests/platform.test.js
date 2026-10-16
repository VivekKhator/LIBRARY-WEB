import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startTestServer, ACCOUNTS, GOOD_CARD, uniqueEmail } from './helpers.js';

const server = await startTestServer('platform');
test.after(() => server.close());

test('the SPA shell is served with security headers', async () => {
  const api = server.client();
  const res = await api.get('/');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.match(res.data, /<div id="app"/);
});

test('client-side routes fall back to the shell so deep links work', async () => {
  const api = server.client();
  for (const path of ['/browse', '/books/1', '/seller/listings/new', '/admin/users']) {
    const res = await api.get(path);
    assert.equal(res.status, 200, `${path} should serve the SPA shell`);
    assert.match(res.data, /<div id="app"/);
  }
});

test('static assets are served with caching validators', async () => {
  const api = server.client();
  const css = await api.get('/styles/tokens.css');
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type'), /text\/css/);
  const etag = css.headers.get('etag');
  assert.ok(etag, 'missing ETag');

  const cached = await api.get('/styles/tokens.css', { headers: { 'If-None-Match': etag } });
  assert.equal(cached.status, 304, 'conditional requests should return 304');

  const js = await api.get('/app/main.js');
  assert.match(js.headers.get('content-type'), /javascript/);
});

test('path traversal attempts never escape the public directory', async () => {
  const { resolveSafe } = await import('../server/lib/static.js');
  const root = '/srv/app/public';
  assert.equal(resolveSafe(root, '/../package.json'), '/srv/app/public/package.json');
  assert.equal(resolveSafe(root, '/%2e%2e/%2e%2e/etc/passwd'), '/srv/app/public/etc/passwd');
  assert.equal(resolveSafe(root, '/styles/../../server/config.js'), '/srv/app/public/server/config.js');
  assert.equal(resolveSafe(root, '/legit/file.css'), '/srv/app/public/legit/file.css');
  assert.equal(resolveSafe(root, '/bad\0byte'), null, 'null bytes are refused');

  // fetch() normalises "..", so send the raw path down a socket to exercise the server itself.
  const raw = (rawPath) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: Number(new URL(server.base).port), path: rawPath, method: 'GET' }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });

  for (const path of ['/../package.json', '/%2e%2e/package.json', '/styles/../../server/config.js', '/uploads/../../package.json']) {
    const res = await raw(path);
    assert.ok(!res.body.includes('"name": "bibliobazaar"'), `${path} leaked package.json`);
    assert.ok(!res.body.includes('sessionSecret'), `${path} leaked server source`);
    assert.ok(!res.body.includes('scrypt$'), `${path} leaked data`);
  }
  // The URL parser collapses ".." before routing, so such a request can only ever hit public/.
  assert.equal((await raw('/uploads/no-such-image.png')).status, 404, 'a missing upload is a 404, not the SPA shell');
});

test('unknown API routes and methods produce structured errors', async () => {
  const api = server.client();
  const missing = await api.get('/api/not-a-route');
  assert.equal(missing.status, 404);
  assert.equal(missing.data.error.code, 'not_found');

  const wrongMethod = await api.del('/api/books');
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.data.error.code, 'method_not_allowed');
});

test('malformed payloads are rejected cleanly', async () => {
  const api = server.client();
  const res = await fetch(`${server.base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"email": broken',
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, 'bad_request');

  const wrongType = await fetch(`${server.base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'email=x',
  });
  assert.equal(wrongType.status, 400);
});

test('login attempts are rate limited per address', async () => {
  // Limits are relaxed under NODE_ENV=test, so exercise the limiter directly.
  const { rateLimit, resetRateLimits } = await import('../server/lib/ratelimit.js');
  resetRateLimits();
  const key = `unit:${Math.random()}`;
  for (let i = 0; i < 3; i++) rateLimit({ key, limit: 3, windowMs: 1000 });
  assert.throws(() => rateLimit({ key, limit: 3, windowMs: 1000 }), (err) => err.status === 429);
  resetRateLimits();
});

test('user supplied content is escaped, not executed', async () => {
  const seller = server.client();
  await seller.login(ACCOUNTS.seller.email, ACCOUNTS.seller.password);
  const payload = '<img src=x onerror="alert(1)">';
  const created = await seller.post('/api/books', {
    title: `XSS ${payload}`, author: 'Injector', priceCents: 1000, stock: 1, description: payload,
  });
  assert.equal(created.status, 200);
  assert.equal(created.data.book.title, `XSS ${payload}`, 'content is stored verbatim and escaped at render time');

  const cover = await seller.get(`/api/books/${created.data.book.id}/cover.svg`);
  assert.ok(!cover.data.includes('<img src=x'), 'cover SVG must escape user content');
  assert.ok(cover.data.includes('&lt;img'), 'cover SVG should contain the escaped form');
});

test('SQL injection attempts are parameterised away', async () => {
  const api = server.client();
  const res = await api.get(`/api/books?q=${encodeURIComponent("'; DROP TABLE books; --")}`);
  assert.equal(res.status, 200);
  assert.equal(res.data.total, 0);

  const still = await api.get('/api/books?perPage=1');
  assert.ok(still.data.total > 0, 'the catalogue survived');

  const wildcard = await api.get('/api/books?q=%25');
  assert.equal(wildcard.data.total, 0, 'LIKE wildcards in user input are escaped');
});

test('session cookies are HttpOnly and SameSite', async () => {
  const res = await fetch(`${server.base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ACCOUNTS.reader.email, password: ACCOUNTS.reader.password }),
  });
  const cookies = res.headers.getSetCookie();
  const session = cookies.find((c) => c.startsWith('bb_session='));
  assert.ok(session, 'session cookie missing');
  assert.match(session, /HttpOnly/);
  assert.match(session, /SameSite=Lax/);
  assert.match(session, /Path=\//);
  const csrf = cookies.find((c) => c.startsWith('bb_csrf='));
  assert.ok(csrf && !/HttpOnly/.test(csrf), 'the CSRF cookie must be readable by the client');
});

test('password hashes and session tokens never leave the server', async () => {
  const api = server.client();
  const payload = await api.login(ACCOUNTS.reader.email, ACCOUNTS.reader.password);
  assert.ok(!JSON.stringify(payload).includes('scrypt$'), 'password hash leaked');

  const book = await api.get('/api/books/1');
  assert.ok(!JSON.stringify(book.data).includes('password'), 'book payload leaked credentials');

  const sessions = await api.get('/api/auth/sessions');
  assert.ok(sessions.data.items.every((s) => s.id.length <= 12), 'full session tokens must not be exposed');
});

test('concurrent checkouts cannot oversell the last copy', async () => {
  const seller = server.client();
  await seller.login(ACCOUNTS.seller.email, ACCOUNTS.seller.password);
  const created = await seller.post('/api/books', { title: 'Last Copy Standing', author: 'Race Condition', priceCents: 2000, stock: 1 });
  const admin = server.client();
  await admin.login(ACCOUNTS.admin.email, ACCOUNTS.admin.password);
  await admin.post(`/api/admin/books/${created.data.book.id}/moderate`, { status: 'active' });
  const bookId = created.data.book.id;

  const buyers = [];
  for (const prefix of ['racea', 'raceb']) {
    const api = server.client();
    await api.register({ name: 'Racer', email: uniqueEmail(prefix), password: 'Password1' });
    const address = await api.post('/api/addresses', {
      fullName: 'Racer', line1: '1 Race St', city: 'Reno', postalCode: '89501', country: 'United States',
    });
    await api.post('/api/cart/items', { bookId, quantity: 1 });
    buyers.push({ api, addressId: address.data.address.id });
  }

  const results = await Promise.all(buyers.map((b) => b.api.post('/api/checkout', { addressId: b.addressId, payment: GOOD_CARD })));
  const succeeded = results.filter((r) => r.status === 200);
  assert.equal(succeeded.length, 1, 'exactly one buyer should get the last copy');
  assert.equal(results.filter((r) => r.status === 400).length, 1);

  const after = await admin.get(`/api/books/${bookId}`);
  assert.equal(after.data.book.stock, 0, 'stock must never go negative');
});

test('seeding is idempotent and the database stays consistent', async () => {
  const { ensureSeed } = await import('../scripts/seed.js');
  const again = await ensureSeed({ quiet: true });
  assert.equal(again.seeded, false, 'seeding twice must not duplicate data');

  const { get } = await import('../server/db/index.js');
  const orphanItems = get('SELECT COUNT(*) AS c FROM order_items oi LEFT JOIN orders o ON o.id = oi.order_id WHERE o.id IS NULL').c;
  assert.equal(orphanItems, 0);
  const negativeStock = get('SELECT COUNT(*) AS c FROM books WHERE stock < 0 OR rent_stock < 0').c;
  assert.equal(negativeStock, 0);
  const brokenTotals = get(`
    SELECT COUNT(*) AS c FROM orders
    WHERE total_cents <> subtotal_cents - discount_cents + shipping_cents + tax_cents`).c;
  assert.equal(brokenTotals, 0, 'order totals must always add up');
});
