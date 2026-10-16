import { all, get, getDb, run, transaction } from '../server/db/index.js';
import { hashPassword } from '../server/lib/auth-crypto.js';
import { slugify } from '../server/services/users.js';
import { BOOKS, CATEGORIES, REVIEW_TEXTS, USERS } from './seed-data.js';
import { logger } from '../server/lib/logger.js';

// Deterministic PRNG so the demo catalogue is identical on every machine.
let seedState = 1337;
const rand = () => {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296;
  return seedState / 4294967296;
};
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (min, max) => min + Math.floor(rand() * (max - min + 1));
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().replace('T', ' ').slice(0, 19);

export async function ensureSeed({ quiet = false } = {}) {
  getDb();
  const existing = get('SELECT COUNT(*) AS c FROM users').c;
  if (existing > 0) {
    if (!quiet) logger.info('database already seeded', { users: existing });
    return { seeded: false };
  }
  return seed({ quiet });
}

export function seed({ quiet = false } = {}) {
  getDb();
  seedState = 1337;
  const log = (msg, meta) => !quiet && logger.info(msg, meta);

  transaction(() => {
    for (const c of CATEGORIES) {
      run('INSERT OR IGNORE INTO categories (name, slug, description, icon) VALUES (?,?,?,?)', [c.name, c.slug, c.description, c.icon]);
    }

    // A public deployment should not ship with the published admin credentials.
    const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
    const adminPassword = process.env.SEED_ADMIN_PASSWORD;
    const seedUsers = USERS.map((u) =>
      u.role === 'admin' && (adminEmail || adminPassword)
        ? { ...u, email: adminEmail || u.email, password: adminPassword || u.password }
        : u);

    const userIds = {};
    for (const u of seedUsers) {
      const storeSlug = u.storeName ? slugify(u.storeName) : null;
      const res = run(
        `INSERT INTO users (email, password_hash, name, role, bio, store_name, store_slug, store_bio, created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [u.email, hashPassword(u.password), u.name, u.role, u.bio || '', u.storeName || null, storeSlug,
          u.storeBio || '', daysAgo(between(40, 400))],
      );
      userIds[u.email] = Number(res.lastInsertRowid);
    }

    const sellers = seedUsers.filter((u) => u.storeName).map((u) => userIds[u.email]);
    const categoryIds = Object.fromEntries(all('SELECT id, slug FROM categories').map((c) => [c.slug, c.id]));

    const bookIds = [];
    BOOKS.forEach((item, index) => {
      const sellerId = sellers[index % sellers.length];
      const rentEnabled = Boolean(item.rent);
      const isDigital = item.format === 'ebook' || item.format === 'audiobook';
      const res = run(
        `INSERT INTO books (seller_id, title, author, isbn, description, category_id, condition, format, language,
           publisher, published_year, pages, price_cents, sale_enabled, rent_enabled, rent_weekly_cents, stock,
           rent_stock, status, cover_seed, views, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?,?)`,
        [sellerId, item.title, item.author, item.isbn || '', item.description || '', categoryIds[item.category] || null,
          item.condition || 'good', item.format || 'paperback', 'English', item.publisher || '',
          item.year > 0 ? item.year : null, item.pages || null, Math.round(item.price * 100), 1,
          rentEnabled && !isDigital ? 1 : 0, Math.round((item.rent || 0) * 100),
          isDigital ? between(20, 99) : between(1, 9),
          rentEnabled && !isDigital ? between(2, 5) : 0,
          between(1000, 99999), between(12, 940), daysAgo(between(1, 120))],
      );
      bookIds.push(Number(res.lastInsertRowid));
    });

    // A couple of listings waiting in the moderation queue, plus one draft, so admin screens are populated.
    run(
      `INSERT INTO books (seller_id, title, author, description, category_id, condition, format, publisher,
         published_year, pages, price_cents, stock, status, cover_seed, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'pending', ?, ?)`,
      [sellers[1], 'Shadows of the Harbour', 'Elena Vasquez', 'Self-published literary thriller set in a fading port town.',
        categoryIds['mystery-thriller'], 'new', 'paperback', 'Harbour Press', 2024, 288, 1150, 3, between(1, 9999), daysAgo(2)],
    );
    run(
      `INSERT INTO books (seller_id, title, author, description, category_id, condition, format, publisher,
         published_year, pages, price_cents, stock, status, cover_seed, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'pending', ?, ?)`,
      [sellers[2], 'Compilers in Practice', 'Dev Shah', 'Course notes turned textbook on practical compiler construction.',
        categoryIds['technology'], 'new', 'hardcover', 'Shah Press', 2025, 410, 5400, 6, between(1, 9999), daysAgo(1)],
    );
    run(
      `INSERT INTO books (seller_id, title, author, description, category_id, condition, format, price_cents, stock,
         status, cover_seed, created_at) VALUES (?,?,?,?,?,?,?,?,?, 'draft', ?, ?)`,
      [sellers[1], 'Untitled Poetry Collection', 'M. Webb', 'Work in progress listing.', categoryIds['fiction'],
        'new', 'paperback', 900, 1, between(1, 9999), daysAgo(5)],
    );

    for (const c of [
      { code: 'WELCOME10', description: '10% off your first order', kind: 'percent', value: 10, min: 0, max: 1500 },
      { code: 'READMORE', description: '$5 off orders over $40', kind: 'fixed', value: 500, min: 4000, max: 0 },
      { code: 'STUDENT15', description: '15% off textbooks and rentals', kind: 'percent', value: 15, min: 2500, max: 3000 },
      { code: 'EXPIRED5', description: 'Lapsed promotion (kept for testing)', kind: 'fixed', value: 500, min: 0, max: 0, expired: true },
    ]) {
      run(
        `INSERT INTO coupons (code, description, kind, value, min_subtotal_cents, max_discount_cents, usage_limit, expires_at, active)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [c.code, c.description, c.kind, c.value, c.min, c.max, c.code === 'STUDENT15' ? 200 : 0,
          c.expired ? daysAgo(10) : null, 1],
      );
    }

    const customers = seedUsers.filter((u) => u.role === 'customer').map((u) => userIds[u.email]);

    // Reviews: spread across the catalogue, written by customers who did not list the book.
    let reviewCount = 0;
    bookIds.forEach((bookId, index) => {
      const howMany = index % 7 === 0 ? 0 : between(1, 4);
      const used = new Set();
      for (let i = 0; i < howMany; i++) {
        const userId = customers[(index + i * 3) % customers.length];
        if (used.has(userId)) continue;
        used.add(userId);
        const tpl = REVIEW_TEXTS[(index + i) % REVIEW_TEXTS.length];
        run(
          `INSERT OR IGNORE INTO reviews (book_id, user_id, rating, title, body, verified, created_at)
           VALUES (?,?,?,?,?,?,?)`,
          [bookId, userId, tpl.rating, tpl.title, tpl.body, i % 2, daysAgo(between(1, 90))],
        );
        reviewCount++;
      }
    });
    // Helpful votes so the "most helpful" sort has signal.
    for (const r of all('SELECT id, user_id FROM reviews')) {
      for (const voter of customers) {
        if (voter !== r.user_id && rand() > 0.6) {
          run('INSERT OR IGNORE INTO review_votes (review_id, user_id) VALUES (?,?)', [r.id, voter]);
        }
      }
    }

    for (const u of seedUsers.filter((x) => x.role === 'customer')) {
      run(
        `INSERT INTO addresses (user_id, label, full_name, line1, city, state, postal_code, country, phone, is_default)
         VALUES (?,?,?,?,?,?,?,?,?,1)`,
        [userIds[u.email], 'Home', u.name, `${between(10, 980)} ${pick(['Maple', 'Cedar', 'Harbour', 'Birch', 'Union'])} ${pick(['St', 'Ave', 'Rd'])}`,
          pick(['Portland', 'Austin', 'Chicago', 'Seattle', 'Boston']), pick(['OR', 'TX', 'IL', 'WA', 'MA']),
          String(between(10000, 99999)), 'United States', `+1 555 ${between(1000, 9999)}`],
      );
    }

    // Historical orders so dashboards, reviews ("verified"), and seller analytics have real data.
    const statuses = ['delivered', 'delivered', 'delivered', 'shipped', 'packed', 'paid'];
    for (let i = 0; i < 18; i++) {
      const userId = customers[i % customers.length];
      const address = get('SELECT * FROM addresses WHERE user_id = ? LIMIT 1', [userId]);
      const status = statuses[i % statuses.length];
      const placedAt = daysAgo(between(1, 45));
      const lineCount = between(1, 3);
      const chosen = [];
      for (let j = 0; j < lineCount; j++) {
        const bookId = bookIds[(i * 5 + j * 11) % bookIds.length];
        const bookRow = get('SELECT * FROM books WHERE id = ?', [bookId]);
        if (!bookRow || bookRow.seller_id === userId || chosen.some((c) => c.id === bookId)) continue;
        chosen.push({ id: bookId, row: bookRow, qty: between(1, 2) });
      }
      if (!chosen.length) continue;

      const subtotal = chosen.reduce((s, c) => s + c.row.price_cents * c.qty, 0);
      const shipping = subtotal >= 5000 ? 0 : 499;
      const tax = Math.round(subtotal * 0.08);
      const total = subtotal + shipping + tax;
      const orderNumber = `BB-${placedAt.slice(0, 10).replace(/-/g, '')}-${String(1000 + i).slice(-4)}`;
      const orderRes = run(
        `INSERT INTO orders (order_number, user_id, status, subtotal_cents, discount_cents, shipping_cents, tax_cents,
           total_cents, shipping_method, payment_brand, payment_last4, payment_ref, address_json, placed_at, updated_at)
         VALUES (?,?,?,?,0,?,?,?,?,?,?,?,?,?,?)`,
        [orderNumber, userId, status, subtotal, shipping, tax, total, pick(['standard', 'express']), 'Visa',
          String(between(1000, 9999)), `pay_seed_${i}`, JSON.stringify({
            label: 'Home', fullName: address.full_name, line1: address.line1, line2: '', city: address.city,
            state: address.state, postalCode: address.postal_code, country: address.country, phone: address.phone,
          }), placedAt, placedAt],
      );
      const orderId = Number(orderRes.lastInsertRowid);
      const fulfillment = status === 'delivered' ? 'delivered' : status === 'shipped' ? 'shipped' : status === 'packed' ? 'packed' : 'processing';
      for (const c of chosen) {
        run(
          `INSERT INTO order_items (order_id, book_id, seller_id, title, author, cover_seed, mode, quantity, rent_weeks,
             unit_cents, line_cents, fulfillment, created_at) VALUES (?,?,?,?,?,?, 'buy', ?,0,?,?,?,?)`,
          [orderId, c.id, c.row.seller_id, c.row.title, c.row.author, c.row.cover_seed, c.qty, c.row.price_cents,
            c.row.price_cents * c.qty, fulfillment, placedAt],
        );
      }
      run('INSERT INTO order_events (order_id, label, detail, created_at) VALUES (?,?,?,?)', [
        orderId, 'Order placed', `Payment authorized`, placedAt,
      ]);
      if (status !== 'paid') {
        run('INSERT INTO order_events (order_id, label, detail, created_at) VALUES (?,?,?,?)', [
          orderId, `Order ${fulfillment}`, 'Seller update', daysAgo(between(0, 3)),
        ]);
      }
      // Mark reviews from this buyer on these books as verified purchases.
      for (const c of chosen) {
        run('UPDATE reviews SET verified = 1 WHERE book_id = ? AND user_id = ?', [c.id, userId]);
      }
    }

    // Active and overdue loans so the borrowing side of the marketplace is demonstrable.
    const rentables = all("SELECT * FROM books WHERE rent_enabled = 1 AND rent_stock > 0 ORDER BY id LIMIT 6");
    rentables.forEach((bookRow, i) => {
      const userId = customers[i % customers.length];
      if (bookRow.seller_id === userId) return;
      const weeks = pick([1, 2, 4]);
      const startedDaysAgo = i === 0 ? weeks * 7 + 6 : between(1, weeks * 7 - 1);
      const started = daysAgo(startedDaysAgo);
      const due = daysAgo(startedDaysAgo - weeks * 7);
      run(
        `INSERT INTO loans (user_id, book_id, weeks, started_at, due_at, status, extensions) VALUES (?,?,?,?,?, 'active', ?)`,
        [userId, bookRow.id, weeks, started, due, 0],
      );
      run('UPDATE books SET rent_stock = rent_stock - 1 WHERE id = ?', [bookRow.id]);
    });

    // Wishlists + a live cart for the demo reader account.
    const reader = userIds['reader@bibliobazaar.test'];
    for (const bookId of [bookIds[3], bookIds[9], bookIds[20], bookIds[41]]) {
      run('INSERT OR IGNORE INTO wishlist_items (user_id, book_id) VALUES (?,?)', [reader, bookId]);
    }
    for (const u of customers) {
      run('INSERT OR IGNORE INTO wishlist_items (user_id, book_id) VALUES (?,?)', [u, bookIds[between(0, bookIds.length - 1)]]);
    }

    run('INSERT INTO notifications (user_id, kind, title, body, link, created_at) VALUES (?,?,?,?,?,?)', [
      reader, 'info', 'Welcome to BiblioBazaar', 'Browse the catalogue, borrow a title, or open your own storefront.', '/browse', daysAgo(3),
    ]);
    for (const sellerId of sellers) {
      run('INSERT INTO notifications (user_id, kind, title, body, link, created_at) VALUES (?,?,?,?,?,?)', [
        sellerId, 'info', 'Seller tools are live', 'Track revenue, fulfil orders and manage stock from your dashboard.', '/seller', daysAgo(4),
      ]);
    }

    log('seeded database', {
      users: seedUsers.length,
      books: bookIds.length + 3,
      reviews: reviewCount,
      orders: get('SELECT COUNT(*) AS c FROM orders').c,
      loans: get('SELECT COUNT(*) AS c FROM loans').c,
    });
  });

  return { seeded: true };
}

const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isDirectRun) {
  const result = await ensureSeed();
  if (!result.seeded) logger.info('nothing to do - run "npm run reset" to rebuild from scratch');
  process.exit(0);
}
