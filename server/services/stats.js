import { all, get } from '../db/index.js';
import { config } from '../config.js';

const dayKeys = (days) => {
  const out = [];
  for (let i = days - 1; i >= 0; i--) out.push(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10));
  return out;
};

const series = (rows, days) => {
  const map = new Map(rows.map((r) => [r.day, r]));
  return dayKeys(days).map((day) => ({
    day,
    revenueCents: map.get(day)?.revenue_cents || 0,
    orders: map.get(day)?.orders || 0,
  }));
};

export function sellerDashboard(sellerId) {
  const live = "o.status NOT IN ('cancelled','refunded') AND oi.fulfillment <> 'cancelled'";
  const totals = get(
    `SELECT COALESCE(SUM(oi.line_cents),0) AS revenue_cents, COALESCE(SUM(oi.quantity),0) AS units,
            COUNT(DISTINCT oi.order_id) AS orders
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE oi.seller_id = ? AND ${live}`,
    [sellerId],
  );
  const pending = get(
    `SELECT COUNT(*) AS c FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE oi.seller_id = ? AND oi.fulfillment IN ('processing','packed') AND o.status NOT IN ('cancelled','refunded')`,
    [sellerId],
  ).c;
  const listings = get(
    `SELECT COUNT(*) AS total,
            SUM(status = 'active') AS active, SUM(status = 'pending') AS pending,
            SUM(status = 'draft') AS draft, SUM(status = 'rejected') AS rejected,
            SUM(status = 'archived') AS archived,
            COALESCE(SUM(views),0) AS views,
            COALESCE(SUM(CASE WHEN status = 'active' THEN stock ELSE 0 END),0) AS stock
     FROM books WHERE seller_id = ?`,
    [sellerId],
  );
  const rating = get(
    `SELECT ROUND(AVG(r.rating),2) AS avg, COUNT(*) AS count FROM reviews r
     JOIN books b ON b.id = r.book_id WHERE b.seller_id = ?`,
    [sellerId],
  );
  const revenueRows = all(
    `SELECT date(o.placed_at) AS day, SUM(oi.line_cents) AS revenue_cents, COUNT(DISTINCT o.id) AS orders
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE oi.seller_id = ? AND ${live} AND date(o.placed_at) >= date('now','-13 days')
     GROUP BY day ORDER BY day`,
    [sellerId],
  );
  const topBooks = all(
    `SELECT b.id, b.title, b.author, COALESCE(SUM(oi.quantity),0) AS units, COALESCE(SUM(oi.line_cents),0) AS revenue_cents, b.views
     FROM books b LEFT JOIN order_items oi ON oi.book_id = b.id
       LEFT JOIN orders o ON o.id = oi.order_id AND o.status NOT IN ('cancelled','refunded')
     WHERE b.seller_id = ? GROUP BY b.id ORDER BY units DESC, b.views DESC LIMIT 5`,
    [sellerId],
  );
  const activeLoans = get(
    `SELECT COUNT(*) AS c FROM loans l JOIN books b ON b.id = l.book_id WHERE b.seller_id = ? AND l.status = 'active'`,
    [sellerId],
  ).c;

  const revenueCents = totals.revenue_cents;
  return {
    revenueCents,
    payoutCents: Math.round(revenueCents * (1 - config.commerce.platformFeeRate)),
    platformFeeCents: Math.round(revenueCents * config.commerce.platformFeeRate),
    units: totals.units,
    orders: totals.orders,
    pendingFulfillment: pending,
    activeLoans,
    listings: {
      total: listings.total || 0,
      active: listings.active || 0,
      pending: listings.pending || 0,
      draft: listings.draft || 0,
      rejected: listings.rejected || 0,
      archived: listings.archived || 0,
      views: listings.views || 0,
      stock: listings.stock || 0,
    },
    rating: { average: rating?.avg ? Number(rating.avg) : 0, count: rating?.count || 0 },
    revenueSeries: series(revenueRows, 14),
    topBooks: topBooks.map((b) => ({
      id: b.id, title: b.title, author: b.author, units: b.units, revenueCents: b.revenue_cents, views: b.views,
    })),
  };
}

export function adminDashboard() {
  const money = get(
    `SELECT COALESCE(SUM(total_cents),0) AS gmv, COUNT(*) AS orders, COALESCE(AVG(total_cents),0) AS aov
     FROM orders WHERE status NOT IN ('cancelled','refunded')`,
  );
  const users = get(
    `SELECT COUNT(*) AS total, SUM(role = 'seller') AS sellers, SUM(role = 'admin') AS admins,
            SUM(status = 'suspended') AS suspended,
            SUM(date(created_at) >= date('now','-7 days')) AS new_this_week FROM users`,
  );
  const books = get(
    `SELECT COUNT(*) AS total, SUM(status = 'active') AS active, SUM(status = 'pending') AS pending,
            SUM(status = 'rejected') AS rejected, COALESCE(SUM(stock),0) AS stock FROM books`,
  );
  const loans = get(
    `SELECT COUNT(*) AS total, SUM(status = 'active') AS active,
            SUM(status = 'active' AND datetime(due_at) < datetime('now')) AS overdue FROM loans`,
  );
  const revenueRows = all(
    `SELECT date(placed_at) AS day, SUM(total_cents) AS revenue_cents, COUNT(*) AS orders FROM orders
     WHERE status NOT IN ('cancelled','refunded') AND date(placed_at) >= date('now','-13 days')
     GROUP BY day ORDER BY day`,
  );
  const topSellers = all(
    `SELECT u.id, u.name, u.store_name, u.store_slug, COALESCE(SUM(oi.line_cents),0) AS revenue_cents,
            COALESCE(SUM(oi.quantity),0) AS units
     FROM users u JOIN order_items oi ON oi.seller_id = u.id
       JOIN orders o ON o.id = oi.order_id AND o.status NOT IN ('cancelled','refunded')
     GROUP BY u.id ORDER BY revenue_cents DESC LIMIT 5`,
  );
  const topBooks = all(
    `SELECT b.id, b.title, b.author, SUM(oi.quantity) AS units, SUM(oi.line_cents) AS revenue_cents
     FROM order_items oi JOIN books b ON b.id = oi.book_id
       JOIN orders o ON o.id = oi.order_id AND o.status NOT IN ('cancelled','refunded')
     GROUP BY b.id ORDER BY units DESC LIMIT 5`,
  );
  const statusBreakdown = all('SELECT status, COUNT(*) AS count FROM orders GROUP BY status');
  const categoryBreakdown = all(
    `SELECT c.name, COUNT(b.id) AS count FROM categories c
     LEFT JOIN books b ON b.category_id = c.id AND b.status = 'active' GROUP BY c.id ORDER BY count DESC`,
  );

  return {
    gmvCents: money.gmv,
    orders: money.orders,
    aovCents: Math.round(money.aov),
    platformFeeCents: Math.round(money.gmv * config.commerce.platformFeeRate),
    users: {
      total: users.total || 0,
      sellers: users.sellers || 0,
      admins: users.admins || 0,
      suspended: users.suspended || 0,
      newThisWeek: users.new_this_week || 0,
    },
    books: {
      total: books.total || 0,
      active: books.active || 0,
      pending: books.pending || 0,
      rejected: books.rejected || 0,
      stock: books.stock || 0,
    },
    loans: { total: loans.total || 0, active: loans.active || 0, overdue: loans.overdue || 0 },
    reviews: get('SELECT COUNT(*) AS c, ROUND(AVG(rating),2) AS avg FROM reviews'),
    revenueSeries: series(revenueRows, 14),
    topSellers: topSellers.map((s) => ({
      id: s.id, name: s.store_name || s.name, slug: s.store_slug, revenueCents: s.revenue_cents, units: s.units,
    })),
    topBooks: topBooks.map((b) => ({ id: b.id, title: b.title, author: b.author, units: b.units, revenueCents: b.revenue_cents })),
    orderStatus: statusBreakdown.map((r) => ({ status: r.status, count: r.count })),
    categories: categoryBreakdown.map((r) => ({ name: r.name, count: r.count })),
  };
}

export function storefront(slug) {
  const seller = get(
    `SELECT id, name, store_name, store_slug, store_bio, created_at FROM users
     WHERE store_slug = ? AND role IN ('seller','admin')`,
    [slug],
  );
  if (!seller) return null;
  const stats = get(
    `SELECT COUNT(*) AS listings, COALESCE(SUM(views),0) AS views FROM books WHERE seller_id = ? AND status = 'active'`,
    [seller.id],
  );
  const rating = get(
    `SELECT ROUND(AVG(r.rating),2) AS avg, COUNT(*) AS count FROM reviews r JOIN books b ON b.id = r.book_id WHERE b.seller_id = ?`,
    [seller.id],
  );
  const sold = get(
    `SELECT COALESCE(SUM(oi.quantity),0) AS units FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE oi.seller_id = ? AND o.status NOT IN ('cancelled','refunded')`,
    [seller.id],
  ).units;
  return {
    seller: {
      id: seller.id,
      name: seller.name,
      storeName: seller.store_name,
      storeSlug: seller.store_slug,
      storeBio: seller.store_bio,
      memberSince: seller.created_at,
    },
    stats: {
      listings: stats.listings,
      views: stats.views,
      unitsSold: sold,
      rating: { average: rating?.avg ? Number(rating.avg) : 0, count: rating?.count || 0 },
    },
  };
}
