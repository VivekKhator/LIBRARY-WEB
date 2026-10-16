import { all, get, run, transaction } from '../db/index.js';
import { badRequest, notFound } from '../lib/errors.js';
import { config } from '../config.js';
import * as present from './present.js';

const { maxQuantityPerItem, rentWeekOptions } = config.commerce;

const CART_SELECT = `
  SELECT ci.*, b.*, ci.id AS id, ci.mode AS mode, ci.quantity AS quantity, ci.rent_weeks AS rent_weeks,
         u.name AS seller_name, u.store_name, u.store_slug,
         c.name AS category_name, c.slug AS category_slug, r.rating_avg, r.review_count
  FROM cart_items ci
  JOIN books b ON b.id = ci.book_id
  JOIN users u ON u.id = b.seller_id
  LEFT JOIN categories c ON c.id = b.category_id
  LEFT JOIN book_ratings r ON r.book_id = b.id
  WHERE ci.user_id = ?
  ORDER BY ci.id ASC`;

export function rawCartRows(userId) {
  return all(CART_SELECT, [userId]);
}

/** Cart + derived totals. Lines that exceed available stock are reported, never silently dropped. */
export function getCart(userId, { couponCode = '', shippingMethod = 'standard' } = {}) {
  const rows = rawCartRows(userId);
  const items = rows.map((row) => {
    const item = present.cartItem({ ...row, id: row.id });
    item.issues = [];
    if (row.status !== 'active') item.issues.push('This listing is no longer available');
    if (item.mode === 'buy' && !row.sale_enabled) item.issues.push('No longer sold, only rented');
    if (item.mode === 'rent' && !row.rent_enabled) item.issues.push('No longer available to rent');
    if (item.quantity > item.availableStock) {
      item.issues.push(item.availableStock === 0 ? 'Out of stock' : `Only ${item.availableStock} left`);
    }
    return item;
  });
  const totals = computeTotals(items, { couponCode, shippingMethod });
  return { items, totals, count: items.reduce((n, i) => n + i.quantity, 0), hasIssues: items.some((i) => i.issues.length) };
}

export function computeTotals(items, { couponCode = '', shippingMethod = 'standard' } = {}) {
  const subtotalCents = items.reduce((sum, i) => sum + i.lineCents, 0);
  const coupon = couponCode ? validateCoupon(couponCode, subtotalCents) : null;
  const discountCents = coupon ? coupon.discountCents : 0;
  const needsShipping = items.some((i) => i.book?.format !== 'ebook' && i.book?.format !== 'audiobook');
  const method = config.commerce.shippingMethods.find((m) => m.id === shippingMethod) || config.commerce.shippingMethods[0];
  let shippingCents = needsShipping ? method.priceCents : 0;
  if (needsShipping && method.id === 'standard' && subtotalCents - discountCents >= config.commerce.freeShippingThresholdCents) {
    shippingCents = 0;
  }
  const taxCents = Math.round(Math.max(0, subtotalCents - discountCents) * config.commerce.taxRate);
  return {
    subtotalCents,
    discountCents,
    shippingCents,
    taxCents,
    totalCents: Math.max(0, subtotalCents - discountCents) + shippingCents + taxCents,
    couponCode: coupon ? coupon.code : '',
    couponDescription: coupon ? coupon.description : '',
    shippingMethod: method.id,
    freeShippingApplied: needsShipping && method.id === 'standard' && shippingCents === 0,
    needsShipping,
  };
}

export function validateCoupon(code, subtotalCents) {
  const row = get('SELECT * FROM coupons WHERE code = ? COLLATE NOCASE', [String(code).trim()]);
  if (!row) throw badRequest('That promo code is not valid', { couponCode: 'Unknown code' });
  if (!row.active) throw badRequest('That promo code is no longer active', { couponCode: 'Inactive code' });
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    throw badRequest('That promo code has expired', { couponCode: 'Expired code' });
  }
  if (row.usage_limit && row.used_count >= row.usage_limit) {
    throw badRequest('That promo code has reached its usage limit', { couponCode: 'Fully redeemed' });
  }
  if (subtotalCents < row.min_subtotal_cents) {
    throw badRequest(
      `Spend at least ${(row.min_subtotal_cents / 100).toFixed(2)} to use ${row.code}`,
      { couponCode: `Minimum subtotal is $${(row.min_subtotal_cents / 100).toFixed(2)}` },
    );
  }
  let discountCents = row.kind === 'percent' ? Math.round((subtotalCents * row.value) / 100) : row.value;
  if (row.max_discount_cents) discountCents = Math.min(discountCents, row.max_discount_cents);
  discountCents = Math.min(discountCents, subtotalCents);
  return { code: row.code, description: row.description, kind: row.kind, value: row.value, discountCents, id: row.id };
}

export function addToCart(userId, { bookId, mode = 'buy', quantity = 1, rentWeeks = 0 }) {
  const book = get('SELECT * FROM books WHERE id = ?', [bookId]);
  if (!book || book.status !== 'active') throw notFound('That book is not available');
  if (book.seller_id === userId) throw badRequest('You cannot order your own listing');
  if (mode === 'buy' && !book.sale_enabled) throw badRequest('This book is rent-only');
  if (mode === 'rent' && !book.rent_enabled) throw badRequest('This book is not available to rent');

  let weeks = 0;
  if (mode === 'rent') {
    weeks = Number(rentWeeks) || rentWeekOptions[0];
    if (!rentWeekOptions.includes(weeks)) {
      throw badRequest(`Rental length must be one of ${rentWeekOptions.join(', ')} weeks`, { rentWeeks: 'Unsupported rental length' });
    }
  }

  const available = mode === 'rent' ? book.rent_stock : book.stock;
  if (available <= 0) throw badRequest(mode === 'rent' ? 'No rental copies left' : 'This book is out of stock');

  return transaction(() => {
    const existing = get('SELECT * FROM cart_items WHERE user_id = ? AND book_id = ? AND mode = ?', [userId, bookId, mode]);
    const requested = Math.max(1, Number(quantity) || 1);
    const target = Math.min((existing?.quantity || 0) + requested, available, maxQuantityPerItem, mode === 'rent' ? 1 : maxQuantityPerItem);
    if (existing) {
      run('UPDATE cart_items SET quantity = ?, rent_weeks = ? WHERE id = ?', [target, weeks, existing.id]);
    } else {
      run('INSERT INTO cart_items (user_id, book_id, mode, quantity, rent_weeks) VALUES (?,?,?,?,?)', [
        userId, bookId, mode, target, weeks,
      ]);
    }
    return getCart(userId);
  });
}

export function updateCartItem(userId, itemId, { quantity, rentWeeks }) {
  const item = get('SELECT ci.*, b.stock, b.rent_stock FROM cart_items ci JOIN books b ON b.id = ci.book_id WHERE ci.user_id = ? AND ci.id = ?', [userId, itemId]);
  if (!item) throw notFound('That cart line is gone');
  const available = item.mode === 'rent' ? item.rent_stock : item.stock;
  let nextQty = item.quantity;
  if (quantity !== undefined) {
    nextQty = Number(quantity);
    if (nextQty <= 0) return removeCartItem(userId, itemId);
    const cap = item.mode === 'rent' ? 1 : Math.min(available, maxQuantityPerItem);
    if (nextQty > cap) {
      throw badRequest(
        item.mode === 'rent' ? 'One rental copy per title' : `Only ${Math.max(0, cap)} available`,
        { quantity: `Maximum is ${Math.max(1, cap)}` },
      );
    }
  }
  let weeks = item.rent_weeks;
  if (rentWeeks !== undefined && item.mode === 'rent') {
    weeks = Number(rentWeeks);
    if (!rentWeekOptions.includes(weeks)) throw badRequest('Unsupported rental length', { rentWeeks: 'Pick a listed duration' });
  }
  run('UPDATE cart_items SET quantity = ?, rent_weeks = ? WHERE id = ?', [nextQty, weeks, itemId]);
  return getCart(userId);
}

export function removeCartItem(userId, itemId) {
  const res = run('DELETE FROM cart_items WHERE user_id = ? AND id = ?', [userId, itemId]);
  if (!res.changes) throw notFound('That cart line is gone');
  return getCart(userId);
}

export function clearCart(userId) {
  run('DELETE FROM cart_items WHERE user_id = ?', [userId]);
  return getCart(userId);
}

/** Merges a guest cart (kept in localStorage) into the account on sign-in. */
export function mergeGuestCart(userId, lines = []) {
  for (const line of lines.slice(0, 40)) {
    try {
      addToCart(userId, {
        bookId: Number(line.bookId),
        mode: line.mode === 'rent' ? 'rent' : 'buy',
        quantity: Number(line.quantity) || 1,
        rentWeeks: Number(line.rentWeeks) || 0,
      });
    } catch {
      // Skip lines that are no longer purchasable; the rest of the merge still succeeds.
    }
  }
  return getCart(userId);
}
