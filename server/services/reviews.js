import { all, get, run, transaction } from '../db/index.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { notify } from './notifications.js';
import * as present from './present.js';

const REVIEW_SELECT = `
  SELECT r.*, u.name AS author_name, b.title AS book_title,
         (SELECT COUNT(*) FROM review_votes v WHERE v.review_id = r.id) AS helpful_count,
         (SELECT COUNT(*) FROM review_votes v WHERE v.review_id = r.id AND v.user_id = ?) AS voted_by_me
  FROM reviews r JOIN users u ON u.id = r.user_id JOIN books b ON b.id = r.book_id`;

const SORTS = {
  recent: 'datetime(r.created_at) DESC, r.id DESC',
  helpful: 'helpful_count DESC, datetime(r.created_at) DESC',
  highest: 'r.rating DESC, helpful_count DESC',
  lowest: 'r.rating ASC, helpful_count DESC',
};

export function listReviews(bookId, { viewerId = 0, sort = 'helpful', page = 1, perPage = 5 } = {}) {
  const order = SORTS[sort] || SORTS.helpful;
  const total = get('SELECT COUNT(*) AS c FROM reviews WHERE book_id = ?', [bookId]).c;
  const rows = all(
    `${REVIEW_SELECT} WHERE r.book_id = ? ORDER BY ${order} LIMIT ? OFFSET ?`,
    [viewerId || 0, bookId, perPage, (page - 1) * perPage],
  );
  const agg = get('SELECT * FROM book_ratings WHERE book_id = ?', [bookId]);
  return {
    items: rows.map((r) => present.review(r, viewerId)),
    total,
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
    summary: {
      average: agg?.rating_avg ? Number(agg.rating_avg) : 0,
      count: agg?.review_count || 0,
      histogram: { 5: agg?.stars5 || 0, 4: agg?.stars4 || 0, 3: agg?.stars3 || 0, 2: agg?.stars2 || 0, 1: agg?.stars1 || 0 },
    },
    mine: viewerId ? present.review(get(`${REVIEW_SELECT} WHERE r.book_id = ? AND r.user_id = ?`, [viewerId, bookId, viewerId]), viewerId) : null,
  };
}

const hasPurchased = (userId, bookId) =>
  Boolean(get(
    `SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.user_id = ? AND oi.book_id = ? AND o.status NOT IN ('cancelled','refunded') LIMIT 1`,
    [userId, bookId],
  ));

export function upsertReview(user, bookId, { rating, title = '', body = '' }) {
  const book = get('SELECT * FROM books WHERE id = ?', [bookId]);
  if (!book) throw notFound('Book not found');
  if (book.seller_id === user.id) throw forbidden('You cannot review your own listing');

  const existing = get('SELECT * FROM reviews WHERE book_id = ? AND user_id = ?', [bookId, user.id]);
  const verified = hasPurchased(user.id, bookId) ? 1 : 0;

  return transaction(() => {
    if (existing) {
      run("UPDATE reviews SET rating = ?, title = ?, body = ?, verified = ?, updated_at = datetime('now') WHERE id = ?", [
        rating, title, body, verified, existing.id,
      ]);
    } else {
      run('INSERT INTO reviews (book_id, user_id, rating, title, body, verified) VALUES (?,?,?,?,?,?)', [
        bookId, user.id, rating, title, body, verified,
      ]);
      notify(book.seller_id, {
        kind: 'review',
        title: `New ${rating}-star review on "${book.title}"`,
        body: title || body.slice(0, 80),
        link: `/books/${bookId}`,
      });
    }
    return present.review(get(`${REVIEW_SELECT} WHERE r.book_id = ? AND r.user_id = ?`, [user.id, bookId, user.id]), user.id);
  });
}

export function deleteReview(user, reviewId) {
  const review = get('SELECT * FROM reviews WHERE id = ?', [reviewId]);
  if (!review) throw notFound('Review not found');
  if (review.user_id !== user.id && user.role !== 'admin') throw forbidden('That review belongs to someone else');
  run('DELETE FROM reviews WHERE id = ?', [reviewId]);
  return { deleted: true };
}

export function toggleHelpful(user, reviewId) {
  const review = get('SELECT * FROM reviews WHERE id = ?', [reviewId]);
  if (!review) throw notFound('Review not found');
  if (review.user_id === user.id) throw badRequest('You cannot mark your own review helpful');
  const existing = get('SELECT 1 AS x FROM review_votes WHERE review_id = ? AND user_id = ?', [reviewId, user.id]);
  if (existing) run('DELETE FROM review_votes WHERE review_id = ? AND user_id = ?', [reviewId, user.id]);
  else run('INSERT INTO review_votes (review_id, user_id) VALUES (?,?)', [reviewId, user.id]);
  return present.review(get(`${REVIEW_SELECT} WHERE r.id = ?`, [user.id, reviewId]), user.id);
}

export const listMyReviews = (userId) =>
  all(`${REVIEW_SELECT} WHERE r.user_id = ? ORDER BY datetime(r.created_at) DESC`, [userId, userId])
    .map((r) => present.review(r, userId));

export const listSellerReviews = (sellerId, limit = 10) =>
  all(
    `${REVIEW_SELECT} WHERE b.seller_id = ? ORDER BY datetime(r.created_at) DESC LIMIT ?`,
    [0, sellerId, limit],
  ).map((r) => present.review(r));
