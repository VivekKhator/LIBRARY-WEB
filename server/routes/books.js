import { Router, parseJsonBody, sendRaw } from '../lib/http.js';
import { validate } from '../lib/validate.js';
import * as books from '../services/books.js';
import * as reviews from '../services/reviews.js';
import { renderCoverSvg } from '../services/covers.js';
import { requireAuth, requireSeller } from '../middleware/auth.js';
import { notFound } from '../lib/errors.js';
import { get } from '../db/index.js';

const router = new Router();

const searchSchema = {
  q: { type: 'string', maxLength: 120 },
  category: { type: 'string', maxLength: 60 },
  condition: { type: 'array', of: 'string' },
  format: { type: 'array', of: 'string' },
  language: { type: 'string', maxLength: 40 },
  minPrice: { type: 'number', min: 0 },
  maxPrice: { type: 'number', min: 0 },
  minRating: { type: 'number', min: 0, max: 5 },
  mode: { type: 'enum', enum: ['buy', 'rent', 'any'] },
  inStock: { type: 'bool' },
  storeSlug: { type: 'string', maxLength: 60 },
  sort: { type: 'enum', enum: books.SORTS },
  page: { type: 'int', min: 1, default: 1 },
  perPage: { type: 'int', min: 1, max: 48, default: 12 },
};

const parseSearch = (query) => {
  const filters = validate(query, searchSchema);
  if (filters.condition) filters.condition = filters.condition.filter((c) => books.CONDITIONS.includes(c));
  if (filters.format) filters.format = filters.format.filter((f) => books.FORMATS.includes(f));
  if (filters.mode === 'any') delete filters.mode;
  return filters;
};

router.get('/', (ctx) => {
  const filters = parseSearch(ctx.query);
  const result = books.searchBooks(filters);
  if (ctx.query.facets === '1') result.facets = books.searchFacets(filters);
  result.filters = filters;
  return result;
});

router.get('/home', () => books.homeFeed());

router.get('/suggest', (ctx) => ({ items: books.suggest(String(ctx.query.q || '').trim()) }));

router.post('/', async (ctx) => {
  requireSeller(ctx);
  const body = await parseJsonBody(ctx.req);
  return { book: books.createBook(ctx.user, validateBookPayload(body, true)) };
});

router.get('/:id', (ctx) => {
  const id = Number(ctx.params.id);
  const book = books.getBook(id, { viewer: ctx.user, countView: true });
  return {
    book,
    related: books.relatedBooks(book),
    reviews: reviews.listReviews(id, { viewerId: ctx.user?.id || 0, perPage: 5 }),
    canReview: Boolean(ctx.user && ctx.user.id !== book.seller.id),
  };
});

router.get('/:id/cover.svg', (ctx) => {
  const row = get('SELECT id, title, author, cover_seed FROM books WHERE id = ?', [Number(ctx.params.id)]);
  const svg = renderCoverSvg(
    row
      ? { title: row.title, author: row.author, seed: row.cover_seed }
      : { title: 'Unknown title', author: 'BiblioBazaar', seed: 0 },
  );
  sendRaw(ctx, 200, svg, {
    'Content-Type': 'image/svg+xml; charset=utf-8',
    'Cache-Control': 'public, max-age=86400',
  });
});

router.patch('/:id', async (ctx) => {
  requireSeller(ctx);
  const body = await parseJsonBody(ctx.req);
  return { book: books.updateBook(ctx.user, Number(ctx.params.id), validateBookPayload(body, false)) };
});

router.delete('/:id', (ctx) => {
  requireSeller(ctx);
  return books.deleteBook(ctx.user, Number(ctx.params.id));
});

router.get('/:id/reviews', (ctx) => {
  const id = Number(ctx.params.id);
  if (!get('SELECT id FROM books WHERE id = ?', [id])) throw notFound('Book not found');
  const q = validate(ctx.query, {
    sort: { type: 'enum', enum: ['recent', 'helpful', 'highest', 'lowest'], default: 'helpful' },
    page: { type: 'int', min: 1, default: 1 },
    perPage: { type: 'int', min: 1, max: 20, default: 5 },
  });
  return reviews.listReviews(id, { ...q, viewerId: ctx.user?.id || 0 });
});

router.post('/:id/reviews', async (ctx) => {
  requireAuth(ctx);
  const body = await parseJsonBody(ctx.req);
  const data = validate(body, {
    rating: { type: 'int', required: true, min: 1, max: 5 },
    title: { type: 'string', maxLength: 120, default: '' },
    body: { type: 'text', maxLength: 2000, default: '' },
  });
  return { review: reviews.upsertReview(ctx.user, Number(ctx.params.id), data) };
});

function validateBookPayload(body, isCreate) {
  const req = (rule) => ({ ...rule, required: isCreate });
  return validate(body, {
    title: req({ type: 'string', minLength: 2, maxLength: 200 }),
    author: req({ type: 'string', minLength: 2, maxLength: 120 }),
    isbn: { type: 'string', maxLength: 20 },
    description: { type: 'text', maxLength: 5000 },
    categoryId: { type: 'int', min: 1, nullable: true },
    condition: { type: 'enum', enum: books.CONDITIONS },
    format: { type: 'enum', enum: books.FORMATS },
    language: { type: 'string', maxLength: 40 },
    publisher: { type: 'string', maxLength: 120 },
    publishedYear: { type: 'int', min: 1400, max: new Date().getFullYear() + 1 },
    pages: { type: 'int', min: 1, max: 20000 },
    priceCents: req({ type: 'int', min: 0, max: 10_000_00 }),
    saleEnabled: { type: 'bool' },
    rentEnabled: { type: 'bool' },
    rentWeeklyCents: { type: 'int', min: 0, max: 100_000 },
    stock: { type: 'int', min: 0, max: 10_000 },
    rentStock: { type: 'int', min: 0, max: 10_000 },
    coverUrl: { type: 'string', maxLength: 300 },
    status: { type: 'enum', enum: books.BOOK_STATUSES },
  });
}

export default router;
