import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, ACCOUNTS, GOOD_CARD, uniqueEmail } from './helpers.js';

const server = await startTestServer('admin');
test.after(() => server.close());

const asAdmin = async () => {
  const api = server.client();
  await api.login(ACCOUNTS.admin.email, ACCOUNTS.admin.password);
  return api;
};

test('admin endpoints are closed to customers and sellers', async () => {
  const reader = server.client();
  await reader.login(ACCOUNTS.reader.email, ACCOUNTS.reader.password);
  const seller = server.client();
  await seller.login(ACCOUNTS.seller.email, ACCOUNTS.seller.password);
  const anon = server.client();

  for (const client of [reader, seller]) {
    for (const path of ['/api/admin/dashboard', '/api/admin/users', '/api/admin/moderation', '/api/admin/orders', '/api/admin/coupons']) {
      assert.equal((await client.get(path)).status, 403, `${path} should be admin-only`);
    }
  }
  assert.equal((await anon.get('/api/admin/dashboard')).status, 401);
});

test('dashboard aggregates platform metrics', async () => {
  const api = await asAdmin();
  const res = await api.get('/api/admin/dashboard');
  assert.equal(res.status, 200);
  const d = res.data;
  assert.ok(d.gmvCents > 0);
  assert.ok(d.orders > 0);
  assert.equal(d.platformFeeCents, Math.round(d.gmvCents * 0.1));
  assert.ok(d.users.total >= 10);
  assert.ok(d.books.active > 0);
  assert.ok(d.books.pending >= 1);
  assert.equal(d.revenueSeries.length, 14);
  assert.ok(Array.isArray(d.topSellers));
  assert.ok(Array.isArray(d.categories));
});

test('user administration supports search, filters, roles and suspension', async () => {
  const api = await asAdmin();
  const all = await api.get('/api/admin/users?perPage=50');
  assert.ok(all.data.total >= 10);
  assert.ok(all.data.items[0].email);
  assert.ok('spendCents' in all.data.items[0]);

  const sellers = await api.get('/api/admin/users?role=seller');
  assert.ok(sellers.data.items.every((u) => u.role === 'seller'));

  const search = await api.get('/api/admin/users?q=reader@bibliobazaar.test');
  assert.equal(search.data.items.length, 1);
  const target = search.data.items[0];

  const promoted = await api.patch(`/api/admin/users/${target.id}/role`, { role: 'seller' });
  assert.equal(promoted.data.user.role, 'seller');
  assert.ok(promoted.data.user.storeSlug, 'promoting to seller provisions a storefront');

  const restored = await api.patch(`/api/admin/users/${target.id}/role`, { role: 'customer' });
  assert.equal(restored.data.user.role, 'customer');

  const me = await api.get('/api/auth/me');
  const selfDemote = await api.patch(`/api/admin/users/${me.data.user.id}/role`, { role: 'customer' });
  assert.equal(selfDemote.status, 400, 'admins cannot demote themselves');
  const selfSuspend = await api.patch(`/api/admin/users/${me.data.user.id}/status`, { status: 'suspended' });
  assert.equal(selfSuspend.status, 400);

  const badRole = await api.patch(`/api/admin/users/${target.id}/role`, { role: 'wizard' });
  assert.equal(badRole.status, 422);
});

test('suspending a seller archives their active listings', async () => {
  const api = await asAdmin();
  const seller = server.client();
  const email = uniqueEmail('suspendseller');
  await seller.register({ name: 'Soon Suspended', email, password: 'Password1' });
  await seller.post('/api/sellers/apply', { storeName: 'Short Lived Books' });
  const listing = await seller.post('/api/books', { title: 'Will Be Archived', author: 'Nobody', priceCents: 1000, stock: 2 });
  await api.post(`/api/admin/books/${listing.data.book.id}/moderate`, { status: 'active' });

  const users = await api.get(`/api/admin/users?q=${encodeURIComponent(email)}`);
  const userId = users.data.items[0].id;
  await api.patch(`/api/admin/users/${userId}/status`, { status: 'suspended' });

  const after = await api.get(`/api/books/${listing.data.book.id}`);
  assert.equal(after.data.book.status, 'archived');

  const session = await seller.get('/api/auth/me');
  assert.equal(session.data.user, null, 'suspension ends active sessions');
});

test('moderation queue approves and rejects listings with notes', async () => {
  const api = await asAdmin();
  const seller = server.client();
  await seller.login(ACCOUNTS.seller.email, ACCOUNTS.seller.password);
  const created = await seller.post('/api/books', { title: 'Queue Candidate', author: 'Pending Person', priceCents: 1200, stock: 1 });
  const id = created.data.book.id;

  const queue = await api.get('/api/admin/moderation');
  assert.ok(queue.data.items.some((b) => b.id === id));

  const rejected = await api.post(`/api/admin/books/${id}/moderate`, { status: 'rejected', note: 'Needs better photos' });
  assert.equal(rejected.data.book.status, 'rejected');
  assert.equal(rejected.data.book.moderationNote, 'Needs better photos');

  // Editing a rejected listing resubmits it for review.
  const edited = await seller.patch(`/api/books/${id}`, { description: 'Now with a full description.' });
  assert.equal(edited.data.book.status, 'pending');

  const approved = await api.post(`/api/admin/books/${id}/moderate`, { status: 'active' });
  assert.equal(approved.data.book.status, 'active');

  const bad = await api.post(`/api/admin/books/${id}/moderate`, { status: 'banana' });
  assert.equal(bad.status, 422);
});

test('order administration lists, filters and searches', async () => {
  const api = await asAdmin();
  const all = await api.get('/api/admin/orders?perPage=50');
  assert.ok(all.data.total >= 10);
  assert.ok(all.data.items[0].customer.email);

  const delivered = await api.get('/api/admin/orders?status=delivered');
  assert.ok(delivered.data.items.every((o) => o.status === 'delivered'));

  const number = all.data.items[0].orderNumber;
  const found = await api.get(`/api/admin/orders?q=${encodeURIComponent(number)}`);
  assert.equal(found.data.items.length, 1);
  assert.equal(found.data.items[0].orderNumber, number);

  const byEmail = await api.get('/api/admin/orders?q=reader@bibliobazaar.test');
  assert.ok(byEmail.data.total >= 1);
});

test('coupon lifecycle works end to end', async () => {
  const api = await asAdmin();
  const code = `TEST${Date.now().toString().slice(-6)}`;

  const created = await api.post('/api/admin/coupons', {
    code, kind: 'percent', value: 20, description: 'API suite code', minSubtotalCents: 1000, maxDiscountCents: 500,
  });
  assert.equal(created.status, 200);
  assert.equal(created.data.coupon.code, code);

  const duplicate = await api.post('/api/admin/coupons', { code, kind: 'percent', value: 5 });
  assert.equal(duplicate.status, 400);

  const tooBig = await api.post('/api/admin/coupons', { code: `${code}B`, kind: 'percent', value: 95 });
  assert.equal(tooBig.status, 400);

  // The new code works at checkout.
  const shopper = server.client();
  await shopper.register({ name: 'Coupon Shopper', email: uniqueEmail('coupon'), password: 'Password1' });
  const book = (await shopper.get('/api/books?minPrice=20&mode=buy&inStock=true&perPage=5')).data.items[0];
  await shopper.post('/api/cart/items', { bookId: book.id, quantity: 1 });
  const totals = (await shopper.get(`/api/cart?couponCode=${code}`)).data.totals;
  assert.equal(totals.discountCents, 500, 'the discount cap applies');

  const paused = await api.patch(`/api/admin/coupons/${created.data.coupon.id}`, { active: false });
  assert.equal(paused.data.coupon.active, false);
  const rejected = await shopper.post('/api/cart/coupon', { code });
  assert.equal(rejected.status, 400);

  const removed = await api.del(`/api/admin/coupons/${created.data.coupon.id}`);
  assert.equal(removed.status, 200);
  assert.equal((await api.get('/api/admin/coupons')).data.items.some((c) => c.code === code), false);
});

test('coupon usage counters move with orders', async () => {
  const api = await asAdmin();
  const before = (await api.get('/api/admin/coupons')).data.items.find((c) => c.code === 'WELCOME10');

  const shopper = server.client();
  await shopper.register({ name: 'Counter Shopper', email: uniqueEmail('counter'), password: 'Password1' });
  const address = await shopper.post('/api/addresses', {
    fullName: 'Counter Shopper', line1: '9 Count Way', city: 'Reno', postalCode: '89501', country: 'United States',
  });
  const book = (await shopper.get('/api/books?mode=buy&inStock=true&perPage=5')).data.items[0];
  await shopper.post('/api/cart/items', { bookId: book.id, quantity: 1 });
  const order = (await shopper.post('/api/checkout', {
    addressId: address.data.address.id, couponCode: 'WELCOME10', payment: GOOD_CARD,
  })).data.order;
  assert.equal(order.couponCode, 'WELCOME10');

  const during = (await api.get('/api/admin/coupons')).data.items.find((c) => c.code === 'WELCOME10');
  assert.equal(during.usedCount, before.usedCount + 1);

  await shopper.post(`/api/orders/${order.id}/cancel`);
  const after = (await api.get('/api/admin/coupons')).data.items.find((c) => c.code === 'WELCOME10');
  assert.equal(after.usedCount, before.usedCount, 'cancelling releases the redemption');
});

test('category administration creates, edits and deletes', async () => {
  const api = await asAdmin();
  const slug = `test-shelf-${Date.now().toString().slice(-6)}`;
  const created = await api.post('/api/admin/categories', { name: `Test Shelf ${slug}`, slug, description: 'Suite created' });
  assert.equal(created.status, 200);

  const duplicate = await api.post('/api/admin/categories', { name: 'Another', slug });
  assert.equal(duplicate.status, 400);

  const badSlug = await api.post('/api/admin/categories', { name: 'Bad', slug: 'Not A Slug' });
  assert.equal(badSlug.status, 422);

  const updated = await api.patch(`/api/admin/categories/${created.data.category.id}`, { description: 'Updated text' });
  assert.equal(updated.data.category.description, 'Updated text');

  const listed = await api.get('/api/categories');
  assert.ok(listed.data.items.some((c) => c.slug === slug));

  const deleted = await api.del(`/api/admin/categories/${created.data.category.id}`);
  assert.equal(deleted.status, 200);
  assert.equal((await api.get('/api/categories')).data.items.some((c) => c.slug === slug), false);
});

test('seller dashboard reports revenue, stock and fulfilment backlog', async () => {
  const seller = server.client();
  await seller.login(ACCOUNTS.seller.email, ACCOUNTS.seller.password);
  const res = await seller.get('/api/sellers/dashboard');
  assert.equal(res.status, 200);
  const s = res.data.stats;
  assert.ok(s.revenueCents > 0);
  assert.equal(s.payoutCents, Math.round(s.revenueCents * 0.9));
  assert.ok(s.listings.active > 0);
  assert.equal(s.revenueSeries.length, 14);
  assert.ok(Array.isArray(res.data.recentOrders));
  assert.ok(res.data.store.stats.listings > 0);

  const orders = await seller.get('/api/sellers/orders');
  assert.ok(orders.data.items.length > 0);
  assert.ok(orders.data.items.every((o) => o.items.every((i) => i.seller.id)), 'sellers only see their own lines');
});

test('seller storefront details can be updated', async () => {
  const api = server.client();
  await api.register({ name: 'Store Editor', email: uniqueEmail('store'), password: 'Password1' });
  const notYet = await api.patch('/api/sellers/store', { storeName: 'Nope' });
  assert.equal(notYet.status, 403);

  await api.post('/api/sellers/apply', { storeName: 'Editable Books', storeBio: 'First bio' });
  const updated = await api.patch('/api/sellers/store', { storeBio: 'A revised description.' });
  assert.equal(updated.data.user.storeBio, 'A revised description.');
});

test('cover uploads validate type and size', async () => {
  const seller = server.client();
  await seller.login(ACCOUNTS.seller.email, ACCOUNTS.seller.password);

  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const ok = await seller.post('/api/sellers/uploads', { dataUrl: png });
  assert.equal(ok.status, 200);
  assert.match(ok.data.url, /^\/uploads\/[a-f0-9]+\.png$/);

  const fetched = await seller.get(ok.data.url);
  assert.equal(fetched.status, 200);

  const bogus = await seller.post('/api/sellers/uploads', { dataUrl: 'not-a-data-url' });
  assert.equal(bogus.status, 400);

  const wrongType = await seller.post('/api/sellers/uploads', { dataUrl: 'data:application/pdf;base64,JVBERi0=' });
  assert.equal(wrongType.status, 400);

  const unsafeSvg = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64')}`;
  const blocked = await seller.post('/api/sellers/uploads', { dataUrl: unsafeSvg });
  assert.equal(blocked.status, 400);

  const customer = server.client();
  await customer.login(ACCOUNTS.reader.email, ACCOUNTS.reader.password);
  assert.equal((await customer.post('/api/sellers/uploads', { dataUrl: png })).status, 403);
});
