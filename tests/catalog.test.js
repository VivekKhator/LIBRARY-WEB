import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, ACCOUNTS, uniqueEmail } from './helpers.js';

const server = await startTestServer('catalog');
test.after(() => server.close());

test('search returns paginated active listings', async () => {
  const api = server.client();
  const res = await api.get('/api/books?perPage=5');
  assert.equal(res.status, 200);
  assert.equal(res.data.items.length, 5);
  assert.ok(res.data.total > 20);
  assert.equal(res.data.page, 1);
  assert.ok(res.data.totalPages > 1);
  assert.ok(res.data.items.every((b) => b.status === 'active'), 'only active listings are public');
});

test('full-text search matches title, author and ISBN', async () => {
  const api = server.client();
  const byTitle = await api.get('/api/books?q=dune');
  assert.ok(byTitle.data.items.some((b) => /dune/i.test(b.title)));

  const byAuthor = await api.get('/api/books?q=le%20guin');
  assert.ok(byAuthor.data.items.some((b) => /Le Guin/i.test(b.author)));

  const byIsbn = await api.get('/api/books?q=9780735211292');
  assert.equal(byIsbn.data.items.length, 1);
  assert.match(byIsbn.data.items[0].title, /Atomic Habits/);

  const noMatch = await api.get('/api/books?q=zzzzznotabook');
  assert.equal(noMatch.data.total, 0);
});

test('filters narrow results and facets stay consistent', async () => {
  const api = server.client();
  const all = await api.get('/api/books?facets=1&perPage=48');
  const tech = await api.get('/api/books?category=technology&facets=1&perPage=48');
  assert.ok(tech.data.total > 0);
  assert.ok(tech.data.total < all.data.total);
  assert.ok(tech.data.items.every((b) => b.category.slug === 'technology'));

  const hardcover = await api.get('/api/books?format=hardcover&perPage=48');
  assert.ok(hardcover.data.items.every((b) => b.format === 'hardcover'));

  const cheap = await api.get('/api/books?maxPrice=10&perPage=48');
  assert.ok(cheap.data.items.every((b) => b.priceCents <= 1000));

  const rentable = await api.get('/api/books?mode=rent&perPage=48');
  assert.ok(rentable.data.items.every((b) => b.rentEnabled && b.rentStock > 0));

  const facetTotal = all.data.facets.categories.reduce((sum, c) => sum + c.count, 0);
  assert.ok(facetTotal <= all.data.total + 5, 'facet counts should track the result set');
  assert.ok(all.data.facets.priceRange.maxCents > all.data.facets.priceRange.minCents);
});

test('sorting honours price, title and rating', async () => {
  const api = server.client();
  const asc = await api.get('/api/books?sort=price_asc&perPage=20');
  const prices = asc.data.items.map((b) => b.priceCents);
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b));

  const desc = await api.get('/api/books?sort=price_desc&perPage=20');
  const descPrices = desc.data.items.map((b) => b.priceCents);
  assert.deepEqual(descPrices, [...descPrices].sort((a, b) => b - a));

  const byTitle = await api.get('/api/books?sort=title&perPage=20');
  const titles = byTitle.data.items.map((b) => b.title.toLowerCase());
  assert.deepEqual(titles, [...titles].sort());

  const rated = await api.get('/api/books?sort=rating&perPage=10');
  const ratings = rated.data.items.map((b) => b.rating.average);
  assert.deepEqual(ratings, [...ratings].sort((a, b) => b - a));
});

test('invalid query parameters are rejected with field errors', async () => {
  const api = server.client();
  const res = await api.get('/api/books?sort=nonsense');
  assert.equal(res.status, 422);
  assert.ok(res.data.error.fields.sort);

  const bad = await api.get('/api/books?page=abc');
  assert.equal(bad.status, 422);
});

test('book detail includes seller, reviews and related titles', async () => {
  const api = server.client();
  const list = await api.get('/api/books?q=pragmatic');
  const id = list.data.items[0].id;
  const res = await api.get(`/api/books/${id}`);
  assert.equal(res.status, 200);
  assert.equal(res.data.book.id, id);
  assert.ok(res.data.book.seller.storeName);
  assert.ok(Array.isArray(res.data.related));
  assert.ok(res.data.reviews.summary);
  assert.equal(res.data.canReview, false, 'anonymous visitors cannot review');

  const missing = await api.get('/api/books/999999');
  assert.equal(missing.status, 404);
});

test('viewing a book increments its view counter', async () => {
  const api = server.client();
  const before = (await api.get('/api/books/5')).data.book.views;
  await api.get('/api/books/5');
  const after = (await api.get('/api/books/5')).data.book.views;
  assert.ok(after > before, `views did not increase (${before} -> ${after})`);
});

test('generated cover art is served as SVG', async () => {
  const api = server.client();
  const res = await api.get('/api/books/1/cover.svg');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /image\/svg\+xml/);
  assert.match(res.data, /^<svg/);
});

test('suggestions respond to partial queries', async () => {
  const api = server.client();
  const res = await api.get('/api/books/suggest?q=atom');
  assert.ok(res.data.items.length >= 1);
  assert.ok(res.data.items.every((i) => i.id && i.title));

  const tooShort = await api.get('/api/books/suggest?q=a');
  assert.equal(tooShort.data.items.length, 0);
});

test('home feed returns every merchandising rail', async () => {
  const api = server.client();
  const res = await api.get('/api/books/home');
  for (const key of ['featured', 'newArrivals', 'bestSellers', 'rentals', 'categories']) {
    assert.ok(Array.isArray(res.data[key]) && res.data[key].length > 0, `${key} rail is empty`);
  }
  assert.ok(res.data.stats.books > 0);
});

test('storefront pages expose a seller and their listings', async () => {
  const api = server.client();
  const meta = await api.get('/api/books?perPage=1');
  const slug = meta.data.items[0].seller.storeSlug;
  const res = await api.get(`/api/stores/${slug}`);
  assert.equal(res.status, 200);
  assert.equal(res.data.seller.storeSlug, slug);
  assert.ok(res.data.books.items.every((b) => b.seller.storeSlug === slug));

  const missing = await api.get('/api/stores/no-such-store');
  assert.equal(missing.status, 404);
});

test('sellers can create listings that stay private until approved', async () => {
  const seller = server.client();
  await seller.login(ACCOUNTS.seller.email, ACCOUNTS.seller.password);

  const created = await seller.post('/api/books', {
    title: 'Testing in Practice',
    author: 'Quality Engineer',
    priceCents: 2599,
    stock: 3,
    condition: 'new',
    format: 'paperback',
    description: 'A book created by the API test suite.',
  });
  assert.equal(created.status, 200);
  assert.equal(created.data.book.status, 'pending');
  const id = created.data.book.id;

  const anon = server.client();
  assert.equal((await anon.get(`/api/books/${id}`)).status, 404, 'pending listings must be invisible');
  const search = await anon.get('/api/books?q=Testing%20in%20Practice');
  assert.equal(search.data.total, 0);

  const owner = await seller.get(`/api/books/${id}`);
  assert.equal(owner.status, 200, 'the owner can preview their own pending listing');

  const admin = server.client();
  await admin.login(ACCOUNTS.admin.email, ACCOUNTS.admin.password);
  const approved = await admin.post(`/api/admin/books/${id}/moderate`, { status: 'active' });
  assert.equal(approved.data.book.status, 'active');
  assert.equal((await anon.get(`/api/books/${id}`)).status, 200);
});

test('listing validation enforces pricing rules', async () => {
  const seller = server.client();
  await seller.login(ACCOUNTS.seller.email, ACCOUNTS.seller.password);

  const noPrice = await seller.post('/api/books', { title: 'No price', author: 'Someone', priceCents: 0 });
  assert.equal(noPrice.status, 400);
  assert.match(noPrice.data.error.message, /sale price/i);

  const rentNoPrice = await seller.post('/api/books', {
    title: 'Rent only', author: 'Someone', priceCents: 1000, saleEnabled: false, rentEnabled: true, rentWeeklyCents: 0,
  });
  assert.equal(rentNoPrice.status, 400);
  assert.match(rentNoPrice.data.error.message, /weekly rent/i);

  const neither = await seller.post('/api/books', {
    title: 'Nothing enabled', author: 'Someone', priceCents: 1000, saleEnabled: false, rentEnabled: false,
  });
  assert.equal(neither.status, 400);

  const badCategory = await seller.post('/api/books', { title: 'Bad cat', author: 'Someone', priceCents: 1000, categoryId: 9999 });
  assert.equal(badCategory.status, 400);
});

test('sellers cannot edit or delete another sellers listing', async () => {
  const seller = server.client();
  await seller.login(ACCOUNTS.seller.email, ACCOUNTS.seller.password);
  const mine = await seller.get('/api/sellers/listings');
  const myIds = new Set(mine.data.items.map((b) => b.id));

  const anyBook = (await seller.get('/api/books?perPage=48')).data.items.find((b) => !myIds.has(b.id));
  assert.ok(anyBook, 'expected a listing from another seller');

  const edit = await seller.patch(`/api/books/${anyBook.id}`, { priceCents: 1 });
  assert.equal(edit.status, 403);
  const remove = await seller.del(`/api/books/${anyBook.id}`);
  assert.equal(remove.status, 403);
});

test('customers cannot create listings', async () => {
  const api = server.client();
  await api.login(ACCOUNTS.reader.email, ACCOUNTS.reader.password);
  const res = await api.post('/api/books', { title: 'Nope', author: 'Nope', priceCents: 500 });
  assert.equal(res.status, 403);
});

test('a seller can open a storefront and immediately list', async () => {
  const api = server.client();
  await api.register({ name: 'Future Seller', email: uniqueEmail('seller'), password: 'Password1' });
  const applied = await api.post('/api/sellers/apply', { storeName: 'Test Street Books' });
  assert.equal(applied.status, 200);
  assert.equal(applied.data.user.role, 'seller');
  assert.equal(applied.data.user.storeSlug, 'test-street-books');

  const listing = await api.post('/api/books', { title: 'First Listing', author: 'Me', priceCents: 1500, stock: 1 });
  assert.equal(listing.status, 200);

  const dashboard = await api.get('/api/sellers/dashboard');
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.data.stats.listings.pending, 1);
});
