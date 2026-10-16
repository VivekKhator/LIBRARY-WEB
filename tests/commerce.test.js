import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, ACCOUNTS, GOOD_CARD, DECLINED_CARD, uniqueEmail } from './helpers.js';

const server = await startTestServer('commerce');
test.after(() => server.close());

/** Signs up a fresh shopper with a delivery address, so tests never fight over seeded state. */
async function shopper(prefix = 'shop') {
  const api = server.client();
  await api.register({ name: 'Test Shopper', email: uniqueEmail(prefix), password: 'Password1' });
  const address = await api.post('/api/addresses', {
    fullName: 'Test Shopper', line1: '1 Test Lane', city: 'Austin', state: 'TX', postalCode: '73301', country: 'United States',
  });
  return { api, addressId: address.data.address.id };
}

const findBook = async (api, query) => (await api.get(`/api/books?${query}&perPage=10`)).data.items[0];

test('cart add, update, remove and clear behave correctly', async () => {
  const { api } = await shopper('cart');
  const book = await findBook(api, 'mode=buy&inStock=true');

  const added = await api.post('/api/cart/items', { bookId: book.id, quantity: 2 });
  assert.equal(added.status, 200);
  assert.equal(added.data.count, 2);
  assert.equal(added.data.totals.subtotalCents, book.priceCents * 2);

  const again = await api.post('/api/cart/items', { bookId: book.id, quantity: 1 });
  assert.equal(again.data.items.length, 1, 'adding the same book merges into one line');
  assert.equal(again.data.count, 3);

  const itemId = again.data.items[0].id;
  const updated = await api.patch(`/api/cart/items/${itemId}`, { quantity: 1 });
  assert.equal(updated.data.count, 1);

  const removed = await api.del(`/api/cart/items/${itemId}`);
  assert.equal(removed.data.items.length, 0);

  await api.post('/api/cart/items', { bookId: book.id, quantity: 1 });
  const cleared = await api.del('/api/cart');
  assert.equal(cleared.data.count, 0);
});

test('cart enforces stock, quantity caps and self-purchase rules', async () => {
  const { api } = await shopper('limits');
  const book = await findBook(api, 'mode=buy&inStock=true');

  const tooMany = await api.post('/api/cart/items', { bookId: book.id, quantity: 999 });
  assert.equal(tooMany.status, 422, 'quantity above the API cap is rejected');

  await api.post('/api/cart/items', { bookId: book.id, quantity: 1 });
  const line = (await api.get('/api/cart')).data.items[0];
  const overStock = await api.patch(`/api/cart/items/${line.id}`, { quantity: Math.min(10, book.stock + 1) });
  if (book.stock < 10) {
    assert.equal(overStock.status, 400);
    assert.match(overStock.data.error.message, /available/i);
  }

  const seller = server.client();
  await seller.login(ACCOUNTS.seller.email, ACCOUNTS.seller.password);
  const own = (await seller.get('/api/sellers/listings?status=active')).data.items[0];
  const selfBuy = await seller.post('/api/cart/items', { bookId: own.id, quantity: 1 });
  assert.equal(selfBuy.status, 400);
  assert.match(selfBuy.data.error.message, /your own listing/i);
});

test('rental lines are limited to one copy and a supported duration', async () => {
  const { api } = await shopper('rent');
  const book = await findBook(api, 'mode=rent');

  const bad = await api.post('/api/cart/items', { bookId: book.id, mode: 'rent', rentWeeks: 7 });
  assert.equal(bad.status, 400);
  assert.match(bad.data.error.message, /rental length/i);

  const ok = await api.post('/api/cart/items', { bookId: book.id, mode: 'rent', rentWeeks: 2, quantity: 5 });
  assert.equal(ok.status, 200);
  const line = ok.data.items[0];
  assert.equal(line.quantity, 1, 'rentals are capped at one copy');
  assert.equal(line.lineCents, book.rentWeeklyCents * 2);
});

test('totals apply tax, shipping thresholds and coupons', async () => {
  const { api } = await shopper('totals');
  const cheap = await findBook(api, 'maxPrice=10&mode=buy&inStock=true');
  await api.post('/api/cart/items', { bookId: cheap.id, quantity: 1 });

  const standard = (await api.get('/api/cart?shippingMethod=standard')).data.totals;
  assert.equal(standard.shippingCents, 499, 'small orders pay standard shipping');
  assert.equal(standard.taxCents, Math.round(standard.subtotalCents * 0.08));
  assert.equal(standard.totalCents, standard.subtotalCents + standard.shippingCents + standard.taxCents);

  const express = (await api.get('/api/cart?shippingMethod=express')).data.totals;
  assert.equal(express.shippingCents, 1299);

  const expensive = await findBook(api, 'minPrice=60&mode=buy&inStock=true');
  await api.post('/api/cart/items', { bookId: expensive.id, quantity: 1 });
  const free = (await api.get('/api/cart?shippingMethod=standard')).data.totals;
  assert.equal(free.shippingCents, 0, 'free shipping above the threshold');
  assert.equal(free.freeShippingApplied, true);

  const coupon = (await api.get('/api/cart?couponCode=WELCOME10')).data.totals;
  assert.equal(coupon.couponCode, 'WELCOME10');
  assert.ok(coupon.discountCents > 0);
  assert.ok(coupon.discountCents <= 1500, 'WELCOME10 is capped at $15');
  assert.equal(coupon.taxCents, Math.round((coupon.subtotalCents - coupon.discountCents) * 0.08));
});

test('coupon validation covers unknown, expired and minimum-spend codes', async () => {
  const { api } = await shopper('coupons');
  const cheap = await findBook(api, 'maxPrice=10&mode=buy&inStock=true');
  await api.post('/api/cart/items', { bookId: cheap.id, quantity: 1 });

  const unknown = await api.post('/api/cart/coupon', { code: 'DOES-NOT-EXIST' });
  assert.equal(unknown.status, 400);

  const expired = await api.post('/api/cart/coupon', { code: 'EXPIRED5' });
  assert.equal(expired.status, 400);
  assert.match(expired.data.error.message, /expired/i);

  const minimum = await api.post('/api/cart/coupon', { code: 'READMORE' });
  assert.equal(minimum.status, 400);
  assert.match(minimum.data.error.message, /spend at least/i);

  const valid = await api.post('/api/cart/coupon', { code: 'welcome10' });
  assert.equal(valid.status, 200, 'codes are case-insensitive');
});

test('guest carts merge into the account on sign-in', async () => {
  const anon = server.client();
  const book = await findBook(anon, 'mode=buy&inStock=true');
  const email = uniqueEmail('merge');
  const payload = await anon.post('/api/auth/register', {
    name: 'Merging Shopper', email, password: 'Password1',
    guestCart: [{ bookId: book.id, mode: 'buy', quantity: 2 }],
  });
  assert.equal(payload.status, 200);
  assert.equal(payload.data.cart.count, 2, 'the guest cart followed the new account');
});

test('checkout charges, decrements stock, creates loans and clears the cart', async () => {
  const { api, addressId } = await shopper('checkout');
  const buyBook = await findBook(api, 'mode=buy&inStock=true');
  const rentBook = await findBook(api, 'mode=rent');
  await api.post('/api/cart/items', { bookId: buyBook.id, quantity: 2 });
  await api.post('/api/cart/items', { bookId: rentBook.id, mode: 'rent', rentWeeks: 2 });

  const preview = await api.get('/api/checkout/preview?shippingMethod=standard');
  assert.equal(preview.status, 200);
  assert.equal(preview.data.lines.length, 2);

  const res = await api.post('/api/checkout', { addressId, shippingMethod: 'standard', payment: GOOD_CARD });
  assert.equal(res.status, 200);
  const order = res.data.order;
  assert.match(order.orderNumber, /^BB-\d{8}-[A-Z0-9]{5}$/);
  assert.equal(order.status, 'paid');
  assert.equal(order.items.length, 2);
  assert.equal(order.payment.brand, 'Visa');
  assert.equal(order.payment.last4, '4242');
  assert.equal(order.totalCents, preview.data.totals.totalCents);
  assert.equal(order.loans.length, 1, 'renting creates a loan');
  assert.ok(order.events.length >= 1);

  const cart = await api.get('/api/cart');
  assert.equal(cart.data.count, 0, 'the cart is emptied after checkout');

  const afterBuy = await api.get(`/api/books/${buyBook.id}`);
  assert.equal(afterBuy.data.book.stock, buyBook.stock - 2, 'sale stock was decremented');
  const afterRent = await api.get(`/api/books/${rentBook.id}`);
  assert.equal(afterRent.data.book.rentStock, rentBook.rentStock - 1, 'rental stock was decremented');

  const notes = await api.get('/api/notifications');
  assert.ok(notes.data.items.some((n) => n.title.includes(order.orderNumber)));
});

test('declined cards leave no order behind', async () => {
  const { api, addressId } = await shopper('declined');
  const book = await findBook(api, 'mode=buy&inStock=true');
  await api.post('/api/cart/items', { bookId: book.id, quantity: 1 });

  const before = await api.get(`/api/books/${book.id}`);
  const res = await api.post('/api/checkout', { addressId, payment: DECLINED_CARD });
  assert.equal(res.status, 400);
  assert.match(res.data.error.fields.cardNumber, /declined/i);

  const orders = await api.get('/api/orders');
  assert.equal(orders.data.total, 0, 'a failed payment must not create an order');
  const cart = await api.get('/api/cart');
  assert.equal(cart.data.count, 1, 'the cart survives a failed payment');
  const after = await api.get(`/api/books/${book.id}`);
  assert.equal(after.data.book.stock, before.data.book.stock, 'stock is untouched');
});

test('checkout rejects invalid payment details and missing addresses', async () => {
  const { api, addressId } = await shopper('invalid');
  const book = await findBook(api, 'mode=buy&inStock=true');
  await api.post('/api/cart/items', { bookId: book.id, quantity: 1 });

  const badLuhn = await api.post('/api/checkout', { addressId, payment: { ...GOOD_CARD, cardNumber: '4242424242424241' } });
  assert.equal(badLuhn.status, 400);

  const expired = await api.post('/api/checkout', { addressId, payment: { ...GOOD_CARD, expYear: 2020 } });
  assert.equal(expired.status, 400);

  const noAddress = await api.post('/api/checkout', { payment: GOOD_CARD });
  assert.equal(noAddress.status, 400);
  assert.ok(noAddress.data.error.fields.addressId);

  const foreignAddress = await api.post('/api/checkout', { addressId: 999999, payment: GOOD_CARD });
  assert.equal(foreignAddress.status, 400);
});

test('checkout refuses an empty cart', async () => {
  const { api, addressId } = await shopper('empty');
  const res = await api.post('/api/checkout', { addressId, payment: GOOD_CARD });
  assert.equal(res.status, 400);
  assert.match(res.data.error.message, /cart is empty/i);
});

test('order cancellation restores stock, refunds and closes loans', async () => {
  const { api, addressId } = await shopper('cancel');
  const buyBook = await findBook(api, 'mode=buy&inStock=true');
  const rentBook = await findBook(api, 'mode=rent');
  await api.post('/api/cart/items', { bookId: buyBook.id, quantity: 1 });
  await api.post('/api/cart/items', { bookId: rentBook.id, mode: 'rent', rentWeeks: 1 });
  const order = (await api.post('/api/checkout', { addressId, payment: GOOD_CARD })).data.order;

  const loansBefore = await api.get('/api/loans');
  assert.ok(loansBefore.data.summary.active >= 1);

  const cancelled = await api.post(`/api/orders/${order.id}/cancel`, { reason: 'Changed my mind' });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.data.order.status, 'cancelled');
  assert.ok(cancelled.data.order.items.every((i) => i.fulfillment === 'cancelled'));

  const restored = await api.get(`/api/books/${buyBook.id}`);
  assert.equal(restored.data.book.stock, buyBook.stock, 'stock returned to the listing');
  const loansAfter = await api.get('/api/loans');
  assert.equal(loansAfter.data.summary.active, 0, 'the loan was withdrawn with the order');

  const again = await api.post(`/api/orders/${order.id}/cancel`);
  assert.equal(again.status, 400, 'cancelling twice is rejected');
});

test('orders cannot be cancelled once shipped', async () => {
  const { api, addressId } = await shopper('shipped');
  const seller = server.client();
  await seller.login(ACCOUNTS.seller.email, ACCOUNTS.seller.password);
  const sellerBook = (await seller.get('/api/sellers/listings?status=active')).data.items.find((b) => b.stock > 0);

  await api.post('/api/cart/items', { bookId: sellerBook.id, quantity: 1 });
  const order = (await api.post('/api/checkout', { addressId, payment: GOOD_CARD })).data.order;
  const itemId = order.items[0].id;

  await seller.patch(`/api/orders/${order.id}/items/${itemId}`, { fulfillment: 'packed' });
  const shipped = await seller.patch(`/api/orders/${order.id}/items/${itemId}`, { fulfillment: 'shipped' });
  assert.equal(shipped.data.order.status, 'shipped');

  const cancel = await api.post(`/api/orders/${order.id}/cancel`);
  assert.equal(cancel.status, 400);
  assert.match(cancel.data.error.message, /already shipped/i);
});

test('fulfilment transitions are ordered and access-controlled', async () => {
  const { api, addressId } = await shopper('fulfil');
  const seller = server.client();
  await seller.login(ACCOUNTS.seller.email, ACCOUNTS.seller.password);
  const sellerBook = (await seller.get('/api/sellers/listings?status=active')).data.items.find((b) => b.stock > 0);

  await api.post('/api/cart/items', { bookId: sellerBook.id, quantity: 1 });
  const order = (await api.post('/api/checkout', { addressId, payment: GOOD_CARD })).data.order;
  const itemId = order.items[0].id;

  const byBuyer = await api.patch(`/api/orders/${order.id}/items/${itemId}`, { fulfillment: 'shipped' });
  assert.equal(byBuyer.status, 403, 'buyers cannot fulfil their own order');

  const packed = await seller.patch(`/api/orders/${order.id}/items/${itemId}`, { fulfillment: 'packed' });
  assert.equal(packed.data.order.items[0].fulfillment, 'packed');

  const backwards = await seller.patch(`/api/orders/${order.id}/items/${itemId}`, { fulfillment: 'processing' });
  assert.equal(backwards.status, 400);

  await seller.patch(`/api/orders/${order.id}/items/${itemId}`, { fulfillment: 'shipped' });
  const delivered = await seller.patch(`/api/orders/${order.id}/items/${itemId}`, { fulfillment: 'delivered' });
  assert.equal(delivered.data.order.status, 'delivered');
});

test('orders are private to their buyer, sellers and admins', async () => {
  const { api, addressId } = await shopper('privacy');
  const book = await findBook(api, 'mode=buy&inStock=true');
  await api.post('/api/cart/items', { bookId: book.id, quantity: 1 });
  const order = (await api.post('/api/checkout', { addressId, payment: GOOD_CARD })).data.order;

  const stranger = server.client();
  await stranger.login(ACCOUNTS.ben.email, ACCOUNTS.ben.password);
  const peek = await stranger.get(`/api/orders/${order.id}`);
  assert.equal(peek.status, 403);

  const admin = server.client();
  await admin.login(ACCOUNTS.admin.email, ACCOUNTS.admin.password);
  const asAdmin = await admin.get(`/api/orders/${order.id}`);
  assert.equal(asAdmin.status, 200);
  assert.equal(asAdmin.data.order.viewer.isAdmin, true);
});

test('admins can refund an order', async () => {
  const { api, addressId } = await shopper('refund');
  const book = await findBook(api, 'mode=buy&inStock=true');
  await api.post('/api/cart/items', { bookId: book.id, quantity: 1 });
  const order = (await api.post('/api/checkout', { addressId, payment: GOOD_CARD })).data.order;

  const selfRefund = await api.post(`/api/admin/orders/${order.id}/refund`, { reason: 'please' });
  assert.equal(selfRefund.status, 403);

  const admin = server.client();
  await admin.login(ACCOUNTS.admin.email, ACCOUNTS.admin.password);
  const refunded = await admin.post(`/api/admin/orders/${order.id}/refund`, { reason: 'Damaged in transit' });
  assert.equal(refunded.data.order.status, 'refunded');

  const notes = await api.get('/api/notifications');
  assert.ok(notes.data.items.some((n) => /refund/i.test(n.title)));
});

test('reordering puts previous purchases back in the cart', async () => {
  const { api, addressId } = await shopper('reorder');
  const book = await findBook(api, 'mode=buy&inStock=true');
  await api.post('/api/cart/items', { bookId: book.id, quantity: 1 });
  const order = (await api.post('/api/checkout', { addressId, payment: GOOD_CARD })).data.order;

  const res = await api.post(`/api/orders/${order.id}/reorder`);
  assert.equal(res.status, 200);
  assert.equal(res.data.added, 1);
  assert.equal(res.data.cart.count, 1);
});
