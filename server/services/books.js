import { all, get, run, transaction } from '../db/index.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import * as present from './present.js';

export const CONDITIONS = ['new', 'like_new', 'good', 'fair'];
export const FORMATS = ['paperback', 'hardcover', 'ebook', 'audiobook'];
export const SORTS = ['relevance', 'newest', 'price_asc', 'price_desc', 'rating', 'popular', 'title'];
export const BOOK_STATUSES = ['draft', 'pending', 'active', 'rejected', 'archived'];

const SELECT_BOOK = `
  SELECT b.*, u.name AS seller_name, u.store_name, u.store_slug,
         c.name AS category_name, c.slug AS category_slug,
         r.rating_avg, r.review_count, s.units_sold
  FROM books b
  JOIN users u ON u.id = b.seller_id
  LEFT JOIN categories c ON c.id = b.category_id
  LEFT JOIN book_ratings r ON r.book_id = b.id
  LEFT JOIN book_sales s ON s.book_id = b.id`;

const likeEscape = (s) => String(s).replace(/[\\%_]/g, (m) => `\\${m}`);

/** Builds a WHERE clause from the filter set, optionally skipping one dimension (for facet counts). */
function buildFilters(f, skip = null) {
  const where = [];
  const params = [];

  where.push('b.status = ?');
  params.push(f.status || 'active');

  if (f.sellerId) { where.push('b.seller_id = ?'); params.push(f.sellerId); }
  if (f.storeSlug) { where.push('u.store_slug = ?'); params.push(f.storeSlug); }

  if (f.q) {
    const term = `%${likeEscape(f.q)}%`;
    where.push(`(b.title LIKE ? ESCAPE '\\' OR b.author LIKE ? ESCAPE '\\' OR b.isbn LIKE ? ESCAPE '\\'
                 OR b.description LIKE ? ESCAPE '\\' OR b.publisher LIKE ? ESCAPE '\\')`);
    params.push(term, term, term, term, term);
  }
  if (skip !== 'category' && f.category) { where.push('c.slug = ?'); params.push(f.category); }
  if (skip !== 'condition' && f.condition?.length) {
    where.push(`b.condition IN (${f.condition.map(() => '?').join(',')})`);
    params.push(...f.condition);
  }
  if (skip !== 'format' && f.format?.length) {
    where.push(`b.format IN (${f.format.map(() => '?').join(',')})`);
    params.push(...f.format);
  }
  if (skip !== 'language' && f.language) { where.push('b.language = ?'); params.push(f.language); }
  if (f.minPrice !== undefined) { where.push('b.price_cents >= ?'); params.push(Math.round(f.minPrice * 100)); }
  if (f.maxPrice !== undefined) { where.push('b.price_cents <= ?'); params.push(Math.round(f.maxPrice * 100)); }
  if (f.minRating) { where.push('COALESCE(r.rating_avg, 0) >= ?'); params.push(f.minRating); }
  if (f.mode === 'rent') where.push('b.rent_enabled = 1 AND b.rent_stock > 0');
  if (f.mode === 'buy') where.push('b.sale_enabled = 1');
  if (f.inStock) where.push('((b.sale_enabled = 1 AND b.stock > 0) OR (b.rent_enabled = 1 AND b.rent_stock > 0))');
  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

const orderBy = (sort, hasQuery) => {
  switch (sort) {
    case 'price_asc': return 'b.price_cents ASC, b.id DESC';
    case 'price_desc': return 'b.price_cents DESC, b.id DESC';
    case 'rating': return 'COALESCE(r.rating_avg,0) DESC, COALESCE(r.review_count,0) DESC, b.id DESC';
    case 'popular': return 'COALESCE(s.units_sold,0) DESC, b.views DESC, b.id DESC';
    case 'title': return 'b.title COLLATE NOCASE ASC';
    case 'newest': return "datetime(b.created_at) DESC, b.id DESC";
    default:
      return hasQuery
        ? 'COALESCE(s.units_sold,0) DESC, COALESCE(r.rating_avg,0) DESC, b.id DESC'
        : "datetime(b.created_at) DESC, b.id DESC";
  }
};

export function searchBooks(filters = {}) {
  const page = Math.max(1, Number(filters.page) || 1);
  const perPage = Math.min(48, Math.max(1, Number(filters.perPage) || 12));
  const { clause, params } = buildFilters(filters);
  const baseFrom = `FROM books b JOIN users u ON u.id = b.seller_id
     LEFT JOIN categories c ON c.id = b.category_id
     LEFT JOIN book_ratings r ON r.book_id = b.id
     LEFT JOIN book_sales s ON s.book_id = b.id ${clause}`;

  const total = get(`SELECT COUNT(*) AS c ${baseFrom}`, params).c;
  const rows = all(
    `SELECT b.*, u.name AS seller_name, u.store_name, u.store_slug, c.name AS category_name, c.slug AS category_slug,
            r.rating_avg, r.review_count, s.units_sold ${baseFrom}
     ORDER BY ${orderBy(filters.sort, Boolean(filters.q))} LIMIT ? OFFSET ?`,
    [...params, perPage, (page - 1) * perPage],
  );

  return {
    items: rows.map(present.book),
    page,
    perPage,
    total,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
    sort: filters.sort && SORTS.includes(filters.sort) ? filters.sort : 'relevance',
  };
}

export function searchFacets(filters = {}) {
  const facetQuery = (dimension, selectExpr, groupExpr) => {
    const { clause, params } = buildFilters(filters, dimension);
    return all(
      `SELECT ${selectExpr} AS value, COUNT(*) AS count
       FROM books b JOIN users u ON u.id = b.seller_id
       LEFT JOIN categories c ON c.id = b.category_id
       LEFT JOIN book_ratings r ON r.book_id = b.id
       LEFT JOIN book_sales s ON s.book_id = b.id
       ${clause} GROUP BY ${groupExpr} HAVING value IS NOT NULL ORDER BY count DESC, value ASC`,
      params,
    );
  };
  const { clause, params } = buildFilters(filters);
  const range = get(
    `SELECT MIN(b.price_cents) AS min, MAX(b.price_cents) AS max
     FROM books b JOIN users u ON u.id = b.seller_id
     LEFT JOIN categories c ON c.id = b.category_id
     LEFT JOIN book_ratings r ON r.book_id = b.id
     LEFT JOIN book_sales s ON s.book_id = b.id ${clause}`,
    params,
  );
  return {
    categories: facetQuery('category', 'c.slug', 'c.slug').map((r) => ({
      slug: r.value, count: r.count, name: get('SELECT name FROM categories WHERE slug = ?', [r.value])?.name || r.value,
    })),
    conditions: facetQuery('condition', 'b.condition', 'b.condition'),
    formats: facetQuery('format', 'b.format', 'b.format'),
    languages: facetQuery('language', 'b.language', 'b.language'),
    priceRange: { minCents: range?.min ?? 0, maxCents: range?.max ?? 0 },
  };
}

export function getBookRow(id) {
  return get(`${SELECT_BOOK} WHERE b.id = ?`, [id]);
}

export function getBook(id, { viewer = null, countView = false } = {}) {
  const row = getBookRow(id);
  if (!row) throw notFound('That book is no longer listed');
  const isOwner = viewer && (viewer.id === row.seller_id || viewer.role === 'admin');
  if (row.status !== 'active' && !isOwner) throw notFound('That book is no longer listed');
  if (countView && !isOwner) run('UPDATE books SET views = views + 1 WHERE id = ?', [id]);
  return present.book(row);
}

export function relatedBooks(book, limit = 4) {
  const rows = all(
    `${SELECT_BOOK} WHERE b.status = 'active' AND b.id <> ?
       AND (b.category_id IS ? OR b.author = ?)
     ORDER BY COALESCE(r.rating_avg,0) DESC, b.views DESC LIMIT ?`,
    [book.id, book.category?.id ?? null, book.author, limit],
  );
  if (rows.length >= limit) return rows.map(present.book);
  const fill = all(
    `${SELECT_BOOK} WHERE b.status = 'active' AND b.id <> ? ORDER BY COALESCE(s.units_sold,0) DESC LIMIT ?`,
    [book.id, limit],
  );
  const seen = new Set(rows.map((r) => r.id));
  for (const r of fill) {
    if (rows.length >= limit) break;
    if (!seen.has(r.id)) { rows.push(r); seen.add(r.id); }
  }
  return rows.map(present.book);
}

export const listSellerBooks = (sellerId, { status } = {}) =>
  all(
    `${SELECT_BOOK} WHERE b.seller_id = ? ${status ? 'AND b.status = ?' : ''} ORDER BY datetime(b.created_at) DESC, b.id DESC`,
    status ? [sellerId, status] : [sellerId],
  ).map(present.book);

const BOOK_FIELDS = [
  'title', 'author', 'isbn', 'description', 'category_id', 'condition', 'format', 'language', 'publisher',
  'published_year', 'pages', 'price_cents', 'sale_enabled', 'rent_enabled', 'rent_weekly_cents', 'stock',
  'rent_stock', 'cover_url',
];

const toRow = (data) => ({
  title: data.title,
  author: data.author,
  isbn: data.isbn ?? '',
  description: data.description ?? '',
  category_id: data.categoryId ?? null,
  condition: data.condition ?? 'good',
  format: data.format ?? 'paperback',
  language: data.language ?? 'English',
  publisher: data.publisher ?? '',
  published_year: data.publishedYear ?? null,
  pages: data.pages ?? null,
  price_cents: data.priceCents ?? 0,
  sale_enabled: data.saleEnabled === false ? 0 : 1,
  rent_enabled: data.rentEnabled ? 1 : 0,
  rent_weekly_cents: data.rentWeeklyCents ?? 0,
  stock: data.stock ?? 0,
  rent_stock: data.rentStock ?? 0,
  cover_url: data.coverUrl ?? '',
});

function assertListingRules(row) {
  if (!row.sale_enabled && !row.rent_enabled) {
    throw badRequest('Enable at least one of "for sale" or "for rent"', { saleEnabled: 'Pick sale, rent, or both' });
  }
  if (row.sale_enabled && row.price_cents <= 0) {
    throw badRequest('Set a sale price above zero', { priceCents: 'Sale price must be greater than 0' });
  }
  if (row.rent_enabled && row.rent_weekly_cents <= 0) {
    throw badRequest('Set a weekly rent price above zero', { rentWeeklyCents: 'Weekly rent must be greater than 0' });
  }
  if (row.category_id && !get('SELECT id FROM categories WHERE id = ?', [row.category_id])) {
    throw badRequest('Unknown category', { categoryId: 'Pick a category from the list' });
  }
}

export function createBook(seller, data) {
  const row = toRow(data);
  assertListingRules(row);
  const status = seller.role === 'admin' ? (data.status ?? 'active') : data.status === 'draft' ? 'draft' : 'pending';
  const cols = [...BOOK_FIELDS, 'seller_id', 'status', 'cover_seed'];
  const values = [...BOOK_FIELDS.map((f) => row[f]), seller.id, status, Math.floor(Math.random() * 100000)];
  const res = run(`INSERT INTO books (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, values);
  return present.book(getBookRow(Number(res.lastInsertRowid)));
}

export function updateBook(actor, id, data) {
  const existing = get('SELECT * FROM books WHERE id = ?', [id]);
  if (!existing) throw notFound('Listing not found');
  if (existing.seller_id !== actor.id && actor.role !== 'admin') throw forbidden('That listing belongs to another seller');

  const merged = toRow({
    title: data.title ?? existing.title,
    author: data.author ?? existing.author,
    isbn: data.isbn ?? existing.isbn,
    description: data.description ?? existing.description,
    categoryId: data.categoryId === undefined ? existing.category_id : data.categoryId,
    condition: data.condition ?? existing.condition,
    format: data.format ?? existing.format,
    language: data.language ?? existing.language,
    publisher: data.publisher ?? existing.publisher,
    publishedYear: data.publishedYear === undefined ? existing.published_year : data.publishedYear,
    pages: data.pages === undefined ? existing.pages : data.pages,
    priceCents: data.priceCents ?? existing.price_cents,
    saleEnabled: data.saleEnabled === undefined ? Boolean(existing.sale_enabled) : data.saleEnabled,
    rentEnabled: data.rentEnabled === undefined ? Boolean(existing.rent_enabled) : data.rentEnabled,
    rentWeeklyCents: data.rentWeeklyCents ?? existing.rent_weekly_cents,
    stock: data.stock === undefined ? existing.stock : data.stock,
    rentStock: data.rentStock === undefined ? existing.rent_stock : data.rentStock,
    coverUrl: data.coverUrl === undefined ? existing.cover_url : data.coverUrl,
  });
  assertListingRules(merged);

  // A seller editing a live listing sends it back through moderation; admins publish directly.
  let status = existing.status;
  if (data.status && (actor.role === 'admin' || ['draft', 'archived', 'pending'].includes(data.status))) {
    status = data.status;
  } else if (actor.role !== 'admin' && existing.status === 'rejected') {
    status = 'pending';
  }

  run(
    `UPDATE books SET ${BOOK_FIELDS.map((f) => `${f} = ?`).join(', ')}, status = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [...BOOK_FIELDS.map((f) => merged[f]), status, id],
  );
  return present.book(getBookRow(id));
}

export function deleteBook(actor, id) {
  const existing = get('SELECT * FROM books WHERE id = ?', [id]);
  if (!existing) throw notFound('Listing not found');
  if (existing.seller_id !== actor.id && actor.role !== 'admin') throw forbidden('That listing belongs to another seller');
  return transaction(() => {
    const sold = get('SELECT COUNT(*) AS c FROM order_items WHERE book_id = ?', [id]).c;
    const onLoan = get("SELECT COUNT(*) AS c FROM loans WHERE book_id = ? AND status = 'active'", [id]).c;
    if (onLoan) throw badRequest('This book is out on loan and cannot be removed yet');
    if (sold) {
      // Preserve order history: archive instead of destroying the row.
      run("UPDATE books SET status = 'archived', stock = 0, rent_stock = 0, updated_at = datetime('now') WHERE id = ?", [id]);
      return { archived: true };
    }
    run('DELETE FROM books WHERE id = ?', [id]);
    return { deleted: true };
  });
}

export function moderateBook(id, { status, note = '' }) {
  const existing = get('SELECT * FROM books WHERE id = ?', [id]);
  if (!existing) throw notFound('Listing not found');
  run("UPDATE books SET status = ?, moderation_note = ?, updated_at = datetime('now') WHERE id = ?", [status, note, id]);
  return present.book(getBookRow(id));
}

export const listCategories = () =>
  all(
    `SELECT c.*, (SELECT COUNT(*) FROM books b WHERE b.category_id = c.id AND b.status = 'active') AS book_count
     FROM categories c ORDER BY c.name ASC`,
  ).map(present.category);

export function createCategory({ name, slug, description = '', icon = 'book' }) {
  if (get('SELECT id FROM categories WHERE slug = ? OR name = ?', [slug, name])) {
    throw badRequest('A category with that name or slug already exists', { slug: 'Already in use' });
  }
  const res = run('INSERT INTO categories (name, slug, description, icon) VALUES (?,?,?,?)', [name, slug, description, icon]);
  return present.category(get('SELECT * FROM categories WHERE id = ?', [Number(res.lastInsertRowid)]));
}

export function updateCategory(id, data) {
  if (!get('SELECT id FROM categories WHERE id = ?', [id])) throw notFound('Category not found');
  run(
    `UPDATE categories SET name = COALESCE(?, name), slug = COALESCE(?, slug),
       description = COALESCE(?, description), icon = COALESCE(?, icon) WHERE id = ?`,
    [data.name ?? null, data.slug ?? null, data.description ?? null, data.icon ?? null, id],
  );
  return present.category(get('SELECT * FROM categories WHERE id = ?', [id]));
}

export function deleteCategory(id) {
  if (!get('SELECT id FROM categories WHERE id = ?', [id])) throw notFound('Category not found');
  run('DELETE FROM categories WHERE id = ?', [id]);
  return { deleted: true };
}

export const homeFeed = () => ({
  featured: all(
    `${SELECT_BOOK} WHERE b.status = 'active' AND COALESCE(r.review_count,0) > 0
     ORDER BY COALESCE(r.rating_avg,0) DESC, COALESCE(s.units_sold,0) DESC LIMIT 8`,
  ).map(present.book),
  newArrivals: all(`${SELECT_BOOK} WHERE b.status = 'active' ORDER BY datetime(b.created_at) DESC, b.id DESC LIMIT 8`).map(present.book),
  bestSellers: all(
    `${SELECT_BOOK} WHERE b.status = 'active' ORDER BY COALESCE(s.units_sold,0) DESC, b.views DESC LIMIT 8`,
  ).map(present.book),
  rentals: all(
    `${SELECT_BOOK} WHERE b.status = 'active' AND b.rent_enabled = 1 AND b.rent_stock > 0
     ORDER BY b.rent_weekly_cents ASC LIMIT 8`,
  ).map(present.book),
  categories: listCategories(),
  stats: {
    books: get("SELECT COUNT(*) AS c FROM books WHERE status = 'active'").c,
    sellers: get("SELECT COUNT(*) AS c FROM users WHERE role IN ('seller','admin') AND store_slug IS NOT NULL").c,
    readers: get('SELECT COUNT(*) AS c FROM users').c,
    reviews: get('SELECT COUNT(*) AS c FROM reviews').c,
  },
});

export const suggest = (q, limit = 6) => {
  if (!q || q.length < 2) return [];
  const term = `%${likeEscape(q)}%`;
  return all(
    `SELECT b.id, b.title, b.author FROM books b
     WHERE b.status = 'active' AND (b.title LIKE ? ESCAPE '\\' OR b.author LIKE ? ESCAPE '\\')
     ORDER BY CASE WHEN b.title LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END, b.title LIMIT ?`,
    [term, term, `${likeEscape(q)}%`, limit],
  ).map((r) => ({ id: r.id, title: r.title, author: r.author }));
};
