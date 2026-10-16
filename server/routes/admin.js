import { Router, parseJsonBody } from '../lib/http.js';
import { validate } from '../lib/validate.js';
import * as admin from '../services/admin.js';
import * as books from '../services/books.js';
import * as orders from '../services/orders.js';
import * as coupons from '../services/coupons.js';
import * as stats from '../services/stats.js';
import { sweepDueLoans } from '../services/loans.js';
import { requireRole } from '../middleware/auth.js';

const router = new Router();
router.use(requireRole('admin'));

router.get('/dashboard', () => stats.adminDashboard());

router.get('/users', (ctx) => {
  const q = validate(ctx.query, {
    q: { type: 'string', maxLength: 80 },
    role: { type: 'enum', enum: ['customer', 'seller', 'admin'] },
    status: { type: 'enum', enum: ['active', 'suspended'] },
    page: { type: 'int', min: 1, default: 1 },
    perPage: { type: 'int', min: 1, max: 100, default: 20 },
  });
  return admin.listUsers(q);
});

router.patch('/users/:id/role', async (ctx) => {
  const body = await parseJsonBody(ctx.req);
  const { role } = validate(body, { role: { type: 'enum', enum: ['customer', 'seller', 'admin'], required: true } });
  return { user: admin.setUserRole(ctx.user, Number(ctx.params.id), role) };
});

router.patch('/users/:id/status', async (ctx) => {
  const body = await parseJsonBody(ctx.req);
  const { status } = validate(body, { status: { type: 'enum', enum: ['active', 'suspended'], required: true } });
  return { user: admin.setUserStatus(ctx.user, Number(ctx.params.id), status) };
});

router.get('/moderation', () => ({ items: admin.moderationQueue() }));

router.post('/books/:id/moderate', async (ctx) => {
  const body = await parseJsonBody(ctx.req);
  const data = validate(body, {
    status: { type: 'enum', enum: ['active', 'rejected', 'archived', 'pending'], required: true },
    note: { type: 'text', maxLength: 300, default: '' },
  });
  return { book: books.moderateBook(Number(ctx.params.id), data) };
});

router.get('/orders', (ctx) => {
  const q = validate(ctx.query, {
    status: { type: 'string', maxLength: 20 },
    q: { type: 'string', maxLength: 80 },
    page: { type: 'int', min: 1, default: 1 },
    perPage: { type: 'int', min: 1, max: 100, default: 20 },
  });
  return orders.listAllOrders(q);
});

router.post('/orders/:id/refund', async (ctx) => {
  const body = await parseJsonBody(ctx.req);
  const { reason } = validate(body, { reason: { type: 'text', maxLength: 200, default: '' } });
  return { order: orders.refundOrder(ctx.user, Number(ctx.params.id), reason) };
});

router.get('/coupons', () => ({ items: coupons.listCoupons() }));

router.post('/coupons', async (ctx) => {
  const body = await parseJsonBody(ctx.req);
  const data = validate(body, {
    code: { type: 'string', required: true, minLength: 3, maxLength: 24, pattern: /^[A-Za-z0-9_-]+$/, patternMessage: 'Use letters, numbers, dashes' },
    description: { type: 'text', maxLength: 160, default: '' },
    kind: { type: 'enum', enum: ['percent', 'fixed'], required: true },
    value: { type: 'int', required: true, min: 1, max: 1_000_000 },
    minSubtotalCents: { type: 'int', min: 0, default: 0 },
    maxDiscountCents: { type: 'int', min: 0, default: 0 },
    usageLimit: { type: 'int', min: 0, default: 0 },
    expiresAt: { type: 'date' },
    active: { type: 'bool', default: true },
  });
  return { coupon: coupons.createCoupon(data) };
});

router.patch('/coupons/:id', async (ctx) => {
  const body = await parseJsonBody(ctx.req);
  const data = validate(body, {
    description: { type: 'text', maxLength: 160 },
    kind: { type: 'enum', enum: ['percent', 'fixed'] },
    value: { type: 'int', min: 1, max: 1_000_000 },
    minSubtotalCents: { type: 'int', min: 0 },
    maxDiscountCents: { type: 'int', min: 0 },
    usageLimit: { type: 'int', min: 0 },
    expiresAt: { type: 'date' },
    active: { type: 'bool' },
  });
  return { coupon: coupons.updateCoupon(Number(ctx.params.id), data) };
});

router.delete('/coupons/:id', (ctx) => coupons.deleteCoupon(Number(ctx.params.id)));

router.post('/categories', async (ctx) => {
  const body = await parseJsonBody(ctx.req);
  const data = validate(body, {
    name: { type: 'string', required: true, minLength: 2, maxLength: 60 },
    slug: { type: 'slug', required: true, minLength: 2, maxLength: 60 },
    description: { type: 'text', maxLength: 200, default: '' },
    icon: { type: 'string', maxLength: 30, default: 'book' },
  });
  return { category: books.createCategory(data) };
});

router.patch('/categories/:id', async (ctx) => {
  const body = await parseJsonBody(ctx.req);
  const data = validate(body, {
    name: { type: 'string', minLength: 2, maxLength: 60 },
    slug: { type: 'slug', minLength: 2, maxLength: 60 },
    description: { type: 'text', maxLength: 200 },
    icon: { type: 'string', maxLength: 30 },
  });
  return { category: books.updateCategory(Number(ctx.params.id), data) };
});

router.delete('/categories/:id', (ctx) => books.deleteCategory(Number(ctx.params.id)));

router.post('/maintenance/loan-sweep', () => sweepDueLoans());

export default router;
