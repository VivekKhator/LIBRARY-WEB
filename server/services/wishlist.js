import { all, get, run } from '../db/index.js';
import { badRequest, notFound } from '../lib/errors.js';
import * as present from './present.js';

const WISHLIST_SELECT = `
  SELECT w.id AS wishlist_id, w.created_at AS added_at, b.*, u.name AS seller_name, u.store_name, u.store_slug,
         c.name AS category_name, c.slug AS category_slug, r.rating_avg, r.review_count
  FROM wishlist_items w
  JOIN books b ON b.id = w.book_id
  JOIN users u ON u.id = b.seller_id
  LEFT JOIN categories c ON c.id = b.category_id
  LEFT JOIN book_ratings r ON r.book_id = b.id
  WHERE w.user_id = ?
  ORDER BY w.id DESC`;

export const listWishlist = (userId) =>
  all(WISHLIST_SELECT, [userId]).map((row) => ({
    wishlistId: row.wishlist_id,
    addedAt: row.added_at,
    available: row.status === 'active' && (row.stock > 0 || row.rent_stock > 0),
    book: present.book(row),
  }));

export const wishlistIds = (userId) => all('SELECT book_id FROM wishlist_items WHERE user_id = ?', [userId]).map((r) => r.book_id);

export function addToWishlist(userId, bookId) {
  const book = get('SELECT id, seller_id, status FROM books WHERE id = ?', [bookId]);
  if (!book || book.status !== 'active') throw notFound('That book is not available');
  if (book.seller_id === userId) throw badRequest('That is your own listing');
  if (!get('SELECT 1 AS x FROM wishlist_items WHERE user_id = ? AND book_id = ?', [userId, bookId])) {
    run('INSERT INTO wishlist_items (user_id, book_id) VALUES (?,?)', [userId, bookId]);
  }
  return listWishlist(userId);
}

export function removeFromWishlist(userId, bookId) {
  const res = run('DELETE FROM wishlist_items WHERE user_id = ? AND book_id = ?', [userId, bookId]);
  if (!res.changes) throw notFound('That book was not on your wishlist');
  return listWishlist(userId);
}

export function toggleWishlist(userId, bookId) {
  const existing = get('SELECT 1 AS x FROM wishlist_items WHERE user_id = ? AND book_id = ?', [userId, bookId]);
  if (existing) {
    removeFromWishlist(userId, bookId);
    return { saved: false, items: listWishlist(userId) };
  }
  addToWishlist(userId, bookId);
  return { saved: true, items: listWishlist(userId) };
}
