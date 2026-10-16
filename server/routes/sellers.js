import { Router, parseJsonBody } from '../lib/http.js';
import { validate } from '../lib/validate.js';
import * as users from '../services/users.js';
import * as books from '../services/books.js';
import * as orders from '../services/orders.js';
import * as reviews from '../services/reviews.js';
import * as stats from '../services/stats.js';
import { saveDataUrl } from '../services/uploads.js';
import { privateUser } from '../services/present.js';
import { requireAuth, requireSeller } from '../middleware/auth.js';
import { notFound } from '../lib/errors.js';

const router = new Router();

router.post('/apply', async (ctx) => {
  requireAuth(ctx);
  const body = await parseJsonBody(ctx.req);
  const data = validate(body, {
    storeName: { type: 'string', required: true, minLength: 2, maxLength: 60, label: 'store name' },
    storeBio: { type: 'text', maxLength: 500, default: '' },
  });
  return { user: privateUser(users.becomeSeller(ctx.user.id, data)) };
});

router.patch('/store', async (ctx) => {
  requireSeller(ctx);
  const body = await parseJsonBody(ctx.req);
  const data = validate(body, {
    storeName: { type: 'string', minLength: 2, maxLength: 60 },
    storeBio: { type: 'text', maxLength: 500 },
  });
  return { user: privateUser(users.updateStore(ctx.user.id, data)) };
});

router.get('/dashboard', (ctx) => {
  requireSeller(ctx);
  return {
    stats: stats.sellerDashboard(ctx.user.id),
    recentOrders: orders.listSellerOrders(ctx.user.id).slice(0, 5),
    recentReviews: reviews.listSellerReviews(ctx.user.id, 5),
    store: stats.storefront(ctx.user.store_slug),
  };
});

router.get('/listings', (ctx) => {
  requireSeller(ctx);
  const q = validate(ctx.query, { status: { type: 'enum', enum: books.BOOK_STATUSES } });
  return { items: books.listSellerBooks(ctx.user.id, q) };
});

router.get('/orders', (ctx) => {
  requireSeller(ctx);
  const q = validate(ctx.query, { status: { type: 'enum', enum: [...orders.FULFILLMENT_ORDER, 'cancelled'] } });
  return { items: orders.listSellerOrders(ctx.user.id, q) };
});

router.get('/reviews', (ctx) => {
  requireSeller(ctx);
  return { items: reviews.listSellerReviews(ctx.user.id, 30) };
});

router.post('/uploads', async (ctx) => {
  requireSeller(ctx);
  const body = await parseJsonBody(ctx.req);
  const { dataUrl } = validate(body, { dataUrl: { type: 'string', required: true, maxLength: 4_000_000, label: 'image' } });
  return saveDataUrl(dataUrl);
});

export default router;

export const storeRouter = new Router()
  .get('/:slug', (ctx) => {
    const store = stats.storefront(ctx.params.slug);
    if (!store) throw notFound('Storefront not found');
    const q = validate(ctx.query, {
      sort: { type: 'enum', enum: books.SORTS, default: 'newest' },
      page: { type: 'int', min: 1, default: 1 },
      perPage: { type: 'int', min: 1, max: 48, default: 12 },
    });
    return { ...store, books: books.searchBooks({ ...q, storeSlug: ctx.params.slug }) };
  });
