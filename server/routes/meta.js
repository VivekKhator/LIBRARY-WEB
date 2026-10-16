import { Router } from '../lib/http.js';
import { config } from '../config.js';
import * as books from '../services/books.js';
import { listPublicCoupons } from '../services/coupons.js';
import { get } from '../db/index.js';

const router = new Router();

router.get('/health', () => ({
  ok: true,
  env: config.env,
  uptimeSeconds: Math.round(process.uptime()),
  version: '1.0.0',
  time: new Date().toISOString(),
}));

router.get('/meta', () => ({
  commerce: config.commerce,
  conditions: [
    { value: 'new', label: 'New' },
    { value: 'like_new', label: 'Like new' },
    { value: 'good', label: 'Good' },
    { value: 'fair', label: 'Fair' },
  ],
  formats: [
    { value: 'paperback', label: 'Paperback' },
    { value: 'hardcover', label: 'Hardcover' },
    { value: 'ebook', label: 'eBook' },
    { value: 'audiobook', label: 'Audiobook' },
  ],
  sorts: [
    { value: 'relevance', label: 'Relevance' },
    { value: 'newest', label: 'Newest arrivals' },
    { value: 'price_asc', label: 'Price: low to high' },
    { value: 'price_desc', label: 'Price: high to low' },
    { value: 'rating', label: 'Top rated' },
    { value: 'popular', label: 'Most popular' },
    { value: 'title', label: 'Title A-Z' },
  ],
  bookStatuses: books.BOOK_STATUSES,
  fulfillmentStatuses: ['processing', 'packed', 'shipped', 'delivered', 'cancelled'],
  categories: books.listCategories(),
  promos: listPublicCoupons(),
  counts: {
    books: get("SELECT COUNT(*) AS c FROM books WHERE status = 'active'").c,
    sellers: get("SELECT COUNT(*) AS c FROM users WHERE store_slug IS NOT NULL").c,
  },
}));

router.get('/categories', () => ({ items: books.listCategories() }));

export default router;
