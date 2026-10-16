import { all, get, run } from '../db/index.js';
import { badRequest, notFound } from '../lib/errors.js';
import { destroyAllSessions, slugify } from './users.js';
import { notify } from './notifications.js';
import * as present from './present.js';

export function listUsers({ q, role, status, page = 1, perPage = 20 } = {}) {
  const where = [];
  const params = [];
  if (q) {
    where.push("(u.name LIKE ? OR u.email LIKE ? OR COALESCE(u.store_name, '') LIKE ?)");
    const term = `%${q}%`;
    params.push(term, term, term);
  }
  if (role) { where.push('u.role = ?'); params.push(role); }
  if (status) { where.push('u.status = ?'); params.push(status); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = get(`SELECT COUNT(*) AS c FROM users u ${clause}`, params).c;
  const rows = all(
    `SELECT u.*,
            (SELECT COUNT(*) FROM books b WHERE b.seller_id = u.id) AS listing_count,
            (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS order_count,
            (SELECT COALESCE(SUM(total_cents),0) FROM orders o WHERE o.user_id = u.id AND o.status NOT IN ('cancelled','refunded')) AS spend_cents
     FROM users u ${clause} ORDER BY u.id DESC LIMIT ? OFFSET ?`,
    [...params, perPage, (page - 1) * perPage],
  );
  return {
    items: rows.map((r) => ({
      ...present.privateUser(r),
      listingCount: r.listing_count,
      orderCount: r.order_count,
      spendCents: r.spend_cents,
    })),
    total, page, perPage, totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

export function setUserRole(actor, userId, role) {
  const user = get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) throw notFound('User not found');
  if (user.id === actor.id && role !== 'admin') throw badRequest('You cannot remove your own admin access');
  let slug = user.store_slug;
  let storeName = user.store_name;
  if ((role === 'seller' || role === 'admin') && !slug) {
    const base = slugify(user.name);
    slug = base;
    let n = 1;
    while (get('SELECT id FROM users WHERE store_slug = ?', [slug])) slug = `${base}-${++n}`;
    storeName = storeName || `${user.name}'s Books`;
  }
  run("UPDATE users SET role = ?, store_slug = ?, store_name = ?, updated_at = datetime('now') WHERE id = ?", [
    role, slug, storeName, userId,
  ]);
  notify(userId, { kind: 'account', title: `Your account role is now ${role}`, body: 'Updated by an administrator', link: '/account' });
  return present.privateUser(get('SELECT * FROM users WHERE id = ?', [userId]));
}

export function setUserStatus(actor, userId, status) {
  const user = get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) throw notFound('User not found');
  if (user.id === actor.id) throw badRequest('You cannot suspend your own account');
  run("UPDATE users SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, userId]);
  if (status === 'suspended') {
    destroyAllSessions(userId);
    run("UPDATE books SET status = 'archived' WHERE seller_id = ? AND status = 'active'", [userId]);
  }
  return present.privateUser(get('SELECT * FROM users WHERE id = ?', [userId]));
}

export const moderationQueue = () =>
  all(
    `SELECT b.*, u.name AS seller_name, u.store_name, u.store_slug, c.name AS category_name, c.slug AS category_slug,
            r.rating_avg, r.review_count
     FROM books b JOIN users u ON u.id = b.seller_id
     LEFT JOIN categories c ON c.id = b.category_id
     LEFT JOIN book_ratings r ON r.book_id = b.id
     WHERE b.status IN ('pending','rejected') ORDER BY b.status ASC, datetime(b.created_at) ASC`,
  ).map(present.book);
