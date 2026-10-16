import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, ACCOUNTS, GOOD_CARD, uniqueEmail } from './helpers.js';

const server = await startTestServer('library');
test.after(() => server.close());

async function shopper(prefix = 'lib') {
  const api = server.client();
  await api.register({ name: 'Library Tester', email: uniqueEmail(prefix), password: 'Password1' });
  const address = await api.post('/api/addresses', {
    fullName: 'Library Tester', line1: '3 Loan Road', city: 'Boston', state: 'MA', postalCode: '02101', country: 'United States',
  });
  return { api, addressId: address.data.address.id };
}

async function borrow(prefix, weeks = 2) {
  const { api, addressId } = await shopper(prefix);
  const book = (await api.get('/api/books?mode=rent&perPage=10')).data.items[0];
  await api.post('/api/cart/items', { bookId: book.id, mode: 'rent', rentWeeks: weeks });
  const order = (await api.post('/api/checkout', { addressId, payment: GOOD_CARD })).data.order;
  const loans = await api.get('/api/loans');
  return { api, book, order, loan: loans.data.items.find((l) => l.bookId === book.id) };
}

test('borrowing produces an active loan with a due date', async () => {
  const { loan, book } = await borrow('borrow', 2);
  assert.ok(loan, 'loan was not created');
  assert.equal(loan.status, 'active');
  assert.equal(loan.weeks, 2);
  assert.equal(loan.bookId, book.id);
  assert.ok(loan.daysLeft > 10 && loan.daysLeft <= 14, `unexpected due window: ${loan.daysLeft}`);
});

test('returning a loan releases the rental copy and closes the loan', async () => {
  const { api, book, loan } = await borrow('return', 1);
  const during = await api.get(`/api/books/${book.id}`);

  const returned = await api.post(`/api/loans/${loan.id}/return`);
  assert.equal(returned.status, 200);
  assert.equal(returned.data.loan.status, 'returned');
  assert.equal(returned.data.loan.lateFeeCents, 0, 'no fee when returned on time');

  const after = await api.get(`/api/books/${book.id}`);
  assert.equal(after.data.book.rentStock, during.data.book.rentStock + 1);

  const twice = await api.post(`/api/loans/${loan.id}/return`);
  assert.equal(twice.status, 400);
});

test('loans can be extended up to the configured limit', async () => {
  const { api, loan } = await borrow('extend', 1);
  const first = await api.post(`/api/loans/${loan.id}/extend`, { weeks: 1 });
  assert.equal(first.status, 200);
  assert.ok(new Date(first.data.loan.dueAt) > new Date(loan.dueAt));
  assert.equal(first.data.loan.extensions, 1);

  const second = await api.post(`/api/loans/${loan.id}/extend`, { weeks: 2 });
  assert.equal(second.data.loan.extensions, 2);

  const third = await api.post(`/api/loans/${loan.id}/extend`, { weeks: 1 });
  assert.equal(third.status, 400);
  assert.match(third.data.error.message, /at most/i);
});

test('loans belong to their borrower only', async () => {
  const { loan } = await borrow('owner');
  const stranger = server.client();
  await stranger.login(ACCOUNTS.ben.email, ACCOUNTS.ben.password);
  const res = await stranger.post(`/api/loans/${loan.id}/return`);
  assert.equal(res.status, 403);
});

test('overdue loans report late fees and are surfaced by the sweep', async () => {
  const reader = server.client();
  await reader.login(ACCOUNTS.reader.email, ACCOUNTS.reader.password);
  const loans = await reader.get('/api/loans');
  const overdue = loans.data.items.find((l) => l.status === 'overdue');
  assert.ok(overdue, 'the seed should include an overdue loan');
  assert.ok(overdue.overdueDays > 0);
  assert.ok(loans.data.summary.outstandingFeesCents > 0);

  const admin = server.client();
  await admin.login(ACCOUNTS.admin.email, ACCOUNTS.admin.password);
  const sweep = await admin.post('/api/admin/maintenance/loan-sweep');
  assert.equal(sweep.status, 200);
  assert.ok(sweep.data.checked >= 1);

  const returned = await reader.post(`/api/loans/${overdue.id}/return`);
  assert.ok(returned.data.loan.lateFeeCents > 0, 'a late fee should be charged');
});

test('wishlist toggles, lists and rejects own listings', async () => {
  const api = server.client();
  await api.register({ name: 'Wisher', email: uniqueEmail('wish'), password: 'Password1' });
  const book = (await api.get('/api/books?perPage=5')).data.items[0];

  const saved = await api.post(`/api/wishlist/${book.id}`);
  assert.equal(saved.data.saved, true);
  assert.equal(saved.data.items.length, 1);

  const unsaved = await api.post(`/api/wishlist/${book.id}`);
  assert.equal(unsaved.data.saved, false);
  assert.equal(unsaved.data.items.length, 0);

  await api.post(`/api/wishlist/${book.id}`);
  const list = await api.get('/api/wishlist');
  assert.equal(list.data.items[0].book.id, book.id);
  assert.equal(typeof list.data.items[0].available, 'boolean');

  const removed = await api.del(`/api/wishlist/${book.id}`);
  assert.equal(removed.data.items.length, 0);
  const missing = await api.del(`/api/wishlist/${book.id}`);
  assert.equal(missing.status, 404);

  const seller = server.client();
  await seller.login(ACCOUNTS.seller.email, ACCOUNTS.seller.password);
  const own = (await seller.get('/api/sellers/listings?status=active')).data.items[0];
  const selfSave = await seller.post(`/api/wishlist/${own.id}`);
  assert.equal(selfSave.status, 400);
});

test('reviews are one per reader, editable and deletable', async () => {
  const api = server.client();
  await api.register({ name: 'Reviewer', email: uniqueEmail('review'), password: 'Password1' });
  const book = (await api.get('/api/books?perPage=5')).data.items[0];

  const created = await api.post(`/api/books/${book.id}/reviews`, { rating: 4, title: 'Solid', body: 'Good condition.' });
  assert.equal(created.status, 200);
  assert.equal(created.data.review.rating, 4);
  assert.equal(created.data.review.verified, false, 'no purchase means no verified badge');

  const updated = await api.post(`/api/books/${book.id}/reviews`, { rating: 5, title: 'Better than I thought' });
  assert.equal(updated.data.review.rating, 5);

  const list = await api.get(`/api/books/${book.id}/reviews`);
  const mine = list.data.items.filter((r) => r.author.name === 'Reviewer');
  assert.equal(mine.length, 1, 'a second review must update, not duplicate');

  const bad = await api.post(`/api/books/${book.id}/reviews`, { rating: 9 });
  assert.equal(bad.status, 422);

  const deleted = await api.del(`/api/reviews/${updated.data.review.id}`);
  assert.equal(deleted.status, 200);
});

test('buying a book marks the review as a verified purchase', async () => {
  const { api, addressId } = await shopper('verified');
  const book = (await api.get('/api/books?mode=buy&inStock=true&perPage=5')).data.items[0];
  await api.post('/api/cart/items', { bookId: book.id, quantity: 1 });
  await api.post('/api/checkout', { addressId, payment: GOOD_CARD });

  const review = await api.post(`/api/books/${book.id}/reviews`, { rating: 5, title: 'Arrived quickly' });
  assert.equal(review.data.review.verified, true);
});

test('sellers cannot review their own listing', async () => {
  const seller = server.client();
  await seller.login(ACCOUNTS.seller.email, ACCOUNTS.seller.password);
  const own = (await seller.get('/api/sellers/listings?status=active')).data.items[0];
  const res = await seller.post(`/api/books/${own.id}/reviews`, { rating: 5 });
  assert.equal(res.status, 403);
});

test('helpful votes toggle and exclude the author', async () => {
  const author = server.client();
  await author.register({ name: 'Vote Author', email: uniqueEmail('va'), password: 'Password1' });
  const book = (await author.get('/api/books?perPage=5')).data.items[1];
  const review = (await author.post(`/api/books/${book.id}/reviews`, { rating: 4, title: 'Helpful test' })).data.review;

  const self = await author.post(`/api/reviews/${review.id}/helpful`);
  assert.equal(self.status, 400);

  const voter = server.client();
  await voter.login(ACCOUNTS.ben.email, ACCOUNTS.ben.password);
  const up = await voter.post(`/api/reviews/${review.id}/helpful`);
  assert.equal(up.data.review.helpfulCount, 1);
  assert.equal(up.data.review.votedByMe, true);
  const down = await voter.post(`/api/reviews/${review.id}/helpful`);
  assert.equal(down.data.review.helpfulCount, 0);
});

test('review listing supports sorting and pagination', async () => {
  const api = server.client();
  const book = (await api.get('/api/books?sort=rating&perPage=1')).data.items[0];
  const helpful = await api.get(`/api/books/${book.id}/reviews?sort=helpful&perPage=2`);
  assert.equal(helpful.status, 200);
  assert.ok(helpful.data.items.length <= 2);
  assert.ok(helpful.data.summary.count >= 0);

  const highest = await api.get(`/api/books/${book.id}/reviews?sort=highest&perPage=5`);
  const ratings = highest.data.items.map((r) => r.rating);
  assert.deepEqual(ratings, [...ratings].sort((a, b) => b - a));

  const invalid = await api.get(`/api/books/${book.id}/reviews?sort=sideways`);
  assert.equal(invalid.status, 422);
});

test('addresses support create, update, default switching and delete', async () => {
  const api = server.client();
  await api.register({ name: 'Address Tester', email: uniqueEmail('addr'), password: 'Password1' });

  const first = await api.post('/api/addresses', {
    fullName: 'A Tester', line1: '1 First St', city: 'Denver', postalCode: '80014', country: 'United States',
  });
  assert.equal(first.data.address.isDefault, true, 'the first address becomes the default');

  const second = await api.post('/api/addresses', {
    label: 'Work', fullName: 'A Tester', line1: '2 Second St', city: 'Denver', postalCode: '80014',
    country: 'United States', isDefault: true,
  });
  const list = await api.get('/api/addresses');
  assert.equal(list.data.items.filter((a) => a.isDefault).length, 1, 'only one default at a time');
  assert.equal(list.data.items.find((a) => a.isDefault).id, second.data.address.id);

  const renamed = await api.patch(`/api/addresses/${first.data.address.id}`, { label: 'Parents' });
  assert.equal(renamed.data.address.label, 'Parents');

  const invalid = await api.post('/api/addresses', { fullName: 'x', line1: '', city: '', postalCode: '' });
  assert.equal(invalid.status, 422);

  const deleted = await api.del(`/api/addresses/${second.data.address.id}`);
  assert.equal(deleted.status, 200);
  const after = await api.get('/api/addresses');
  assert.equal(after.data.items.length, 1);
  assert.equal(after.data.items[0].isDefault, true, 'a remaining address is promoted to default');
});

test('notifications accumulate and can be marked read', async () => {
  const { api, addressId } = await shopper('notify');
  const book = (await api.get('/api/books?mode=buy&inStock=true&perPage=5')).data.items[0];
  await api.post('/api/cart/items', { bookId: book.id, quantity: 1 });
  await api.post('/api/checkout', { addressId, payment: GOOD_CARD });

  const list = await api.get('/api/notifications');
  assert.ok(list.data.unread >= 1);
  const first = list.data.items[0];

  const readOne = await api.post(`/api/notifications/${first.id}/read`);
  assert.equal(readOne.data.items.find((n) => n.id === first.id).read, true);

  const readAll = await api.post('/api/notifications/read-all');
  assert.equal(readAll.data.unread, 0);
});
