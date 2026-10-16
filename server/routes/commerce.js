import { Router, parseJsonBody } from '../lib/http.js';
import { validate } from '../lib/validate.js';
import { config } from '../config.js';
import * as cart from '../services/cart.js';
import * as orders from '../services/orders.js';
import * as loans from '../services/loans.js';
import * as users from '../services/users.js';
import * as wishlist from '../services/wishlist.js';
import * as reviews from '../services/reviews.js';
import * as notifications from '../services/notifications.js';
import { requireAuth } from '../middleware/auth.js';

const router = new Router();
router.use(requireAuth);

// ---------- cart ----------
router.get('/cart', (ctx) =>
  cart.getCart(ctx.user.id, { couponCode: ctx.query.couponCode || '', shippingMethod: ctx.query.shippingMethod || 'standard' }));

router.post('/cart/items', async (ctx) => {
  const body = await parseJsonBody(ctx.req);
  const data = validate(body, {
    bookId: { type: 'int', required: true, min: 1 },
    mode: { type: 'enum', enum: ['buy', 'rent'], default: 'buy' },
    quantity: { type: 'int', min: 1, max: config.commerce.maxQuantityPerItem, default: 1 },
    rentWeeks: { type: 'int', min: 0, max: 52, default: 0 },
  });
  return cart.addToCart(ctx.user.id, data);
});

router.patch('/cart/items/:id', async (ctx) => {
  const body = await parseJsonBody(ctx.req);
  const data = validate(body, {
    quantity: { type: 'int', min: 0, max: config.commerce.maxQuantityPerItem },
    rentWeeks: { type: 'int', min: 1, max: 52 },
  });
  return cart.updateCartItem(ctx.user.id, Number(ctx.params.id), data);
});

router.delete('/cart/items/:id', (ctx) => cart.removeCartItem(ctx.user.id, Number(ctx.params.id)));
router.delete('/cart', (ctx) => cart.clearCart(ctx.user.id));

router.post('/cart/merge', async (ctx) => {
  const body = await parseJsonBody(ctx.req);
  const data = validate(body, { items: { type: 'array', default: [] } });
  return cart.mergeGuestCart(ctx.user.id, data.items);
});

router.post('/cart/coupon', async (ctx) => {
  const body = await parseJsonBody(ctx.req);
  const { code } = validate(body, { code: { type: 'string', required: true, maxLength: 40 } });
  const current = cart.getCart(ctx.user.id);
  const coupon = cart.validateCoupon(code, current.totals.subtotalCents);
  return { coupon, totals: cart.computeTotals(current.items, { couponCode: coupon.code }) };
});

// ---------- checkout + orders ----------
router.get('/checkout/preview', (ctx) => {
  const lines = orders.prepareCheckout(ctx.user.id);
  const totals = cart.computeTotals(lines, {
    couponCode: ctx.query.couponCode || '',
    shippingMethod: ctx.query.shippingMethod || 'standard',
  });
  return { lines, totals, addresses: users.listAddresses(ctx.user.id), shippingMethods: config.commerce.shippingMethods };
});

router.post('/checkout', async (ctx) => {
  const body = await parseJsonBody(ctx.req);
  const data = validate(body, {
    addressId: { type: 'int', min: 1 },
    address: { type: 'object' },
    shippingMethod: { type: 'enum', enum: config.commerce.shippingMethods.map((m) => m.id), default: 'standard' },
    couponCode: { type: 'string', maxLength: 40, default: '' },
    notes: { type: 'text', maxLength: 500, default: '' },
    payment: { type: 'object', required: true },
  });
  const payment = validate(data.payment, {
    cardNumber: { type: 'string', required: true, maxLength: 25, label: 'card number' },
    cardName: { type: 'string', required: true, maxLength: 80, label: 'name on card' },
    expMonth: { type: 'int', required: true, min: 1, max: 12, label: 'expiry month' },
    expYear: { type: 'int', required: true, min: 2000, max: 2100, label: 'expiry year' },
    cvc: { type: 'string', required: true, maxLength: 4, label: 'CVC' },
  });
  return { order: orders.checkout(ctx.user, { ...data, payment }) };
});

router.get('/orders', (ctx) => {
  const q = validate(ctx.query, {
    status: { type: 'string', maxLength: 20 },
    page: { type: 'int', min: 1, default: 1 },
    perPage: { type: 'int', min: 1, max: 50, default: 10 },
  });
  return orders.listOrders(ctx.user.id, q);
});

router.get('/orders/:id', (ctx) => ({ order: orders.getOrder(ctx.user, Number(ctx.params.id)) }));

router.post('/orders/:id/cancel', async (ctx) => {
  const body = await parseJsonBody(ctx.req);
  const { reason } = validate(body, { reason: { type: 'text', maxLength: 200, default: '' } });
  return { order: orders.cancelOrder(ctx.user, Number(ctx.params.id), reason) };
});

router.post('/orders/:id/reorder', (ctx) => {
  const lines = orders.reorder(ctx.user.id, Number(ctx.params.id));
  let added = 0;
  const skipped = [];
  for (const line of lines) {
    try {
      cart.addToCart(ctx.user.id, line);
      added++;
    } catch (err) {
      skipped.push(err.message);
    }
  }
  return { added, skipped, cart: cart.getCart(ctx.user.id) };
});

router.patch('/orders/:id/items/:itemId', async (ctx) => {
  const body = await parseJsonBody(ctx.req);
  const { fulfillment } = validate(body, {
    fulfillment: { type: 'enum', enum: [...orders.FULFILLMENT_ORDER, 'cancelled'], required: true },
  });
  return { order: orders.updateFulfillment(ctx.user, Number(ctx.params.id), Number(ctx.params.itemId), fulfillment) };
});

// ---------- loans ----------
router.get('/loans', (ctx) => loans.listLoans(ctx.user.id, { status: ctx.query.status }));
router.post('/loans/:id/return', (ctx) => ({ loan: loans.returnLoan(ctx.user.id, Number(ctx.params.id)) }));
router.post('/loans/:id/extend', async (ctx) => {
  const body = await parseJsonBody(ctx.req);
  const { weeks } = validate(body, { weeks: { type: 'int', min: 1, max: 4, default: 1 } });
  return { loan: loans.extendLoan(ctx.user.id, Number(ctx.params.id), weeks) };
});

// ---------- wishlist ----------
router.get('/wishlist', (ctx) => ({ items: wishlist.listWishlist(ctx.user.id) }));
router.post('/wishlist/:bookId', (ctx) => wishlist.toggleWishlist(ctx.user.id, Number(ctx.params.bookId)));
router.delete('/wishlist/:bookId', (ctx) => ({ items: wishlist.removeFromWishlist(ctx.user.id, Number(ctx.params.bookId)) }));

// ---------- addresses ----------
const addressSchema = (required) => ({
  label: { type: 'string', maxLength: 40, default: required ? 'Home' : undefined },
  fullName: { type: 'string', required, minLength: 2, maxLength: 80, label: 'full name' },
  line1: { type: 'string', required, minLength: 3, maxLength: 120, label: 'address line 1' },
  line2: { type: 'string', maxLength: 120 },
  city: { type: 'string', required, minLength: 2, maxLength: 60 },
  state: { type: 'string', maxLength: 60 },
  postalCode: { type: 'string', required, minLength: 3, maxLength: 20, label: 'postal code' },
  country: { type: 'string', maxLength: 60, default: required ? 'United States' : undefined },
  phone: { type: 'string', maxLength: 30 },
  isDefault: { type: 'bool' },
});

router.get('/addresses', (ctx) => ({ items: users.listAddresses(ctx.user.id) }));
router.post('/addresses', async (ctx) => {
  const body = await parseJsonBody(ctx.req);
  return { address: users.createAddress(ctx.user.id, validate(body, addressSchema(true))) };
});
router.patch('/addresses/:id', async (ctx) => {
  const body = await parseJsonBody(ctx.req);
  return { address: users.updateAddress(ctx.user.id, Number(ctx.params.id), validate(body, addressSchema(false))) };
});
router.delete('/addresses/:id', (ctx) => {
  users.deleteAddress(ctx.user.id, Number(ctx.params.id));
  return { deleted: true, items: users.listAddresses(ctx.user.id) };
});

// ---------- reviews (owner actions) ----------
router.get('/reviews/mine', (ctx) => ({ items: reviews.listMyReviews(ctx.user.id) }));
router.delete('/reviews/:id', (ctx) => reviews.deleteReview(ctx.user, Number(ctx.params.id)));
router.post('/reviews/:id/helpful', (ctx) => ({ review: reviews.toggleHelpful(ctx.user, Number(ctx.params.id)) }));

// ---------- notifications ----------
router.get('/notifications', (ctx) => notifications.listNotifications(ctx.user.id));
router.post('/notifications/read-all', (ctx) => notifications.markAllRead(ctx.user.id));
router.post('/notifications/:id/read', (ctx) => notifications.markRead(ctx.user.id, Number(ctx.params.id)));

export default router;
