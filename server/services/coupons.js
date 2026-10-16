import { all, get, run } from '../db/index.js';
import { badRequest, notFound } from '../lib/errors.js';
import * as present from './present.js';

export const listCoupons = () => all('SELECT * FROM coupons ORDER BY active DESC, id DESC').map(present.coupon);

export const listPublicCoupons = () =>
  all(
    `SELECT * FROM coupons WHERE active = 1 AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
       AND (usage_limit = 0 OR used_count < usage_limit) ORDER BY value DESC LIMIT 3`,
  ).map((c) => ({ code: c.code, description: c.description, kind: c.kind, value: c.value, minSubtotalCents: c.min_subtotal_cents }));

export function createCoupon(data) {
  const code = String(data.code).trim().toUpperCase();
  if (get('SELECT id FROM coupons WHERE code = ? COLLATE NOCASE', [code])) {
    throw badRequest('That code already exists', { code: 'Already in use' });
  }
  if (data.kind === 'percent' && data.value > 90) throw badRequest('Percentage discounts cap at 90%', { value: 'Max 90' });
  const res = run(
    `INSERT INTO coupons (code, description, kind, value, min_subtotal_cents, max_discount_cents, usage_limit, expires_at, active)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [code, data.description || '', data.kind, data.value, data.minSubtotalCents || 0, data.maxDiscountCents || 0,
      data.usageLimit || 0, data.expiresAt || null, data.active === false ? 0 : 1],
  );
  return present.coupon(get('SELECT * FROM coupons WHERE id = ?', [Number(res.lastInsertRowid)]));
}

export function updateCoupon(id, data) {
  if (!get('SELECT id FROM coupons WHERE id = ?', [id])) throw notFound('Coupon not found');
  run(
    `UPDATE coupons SET description = COALESCE(?, description), kind = COALESCE(?, kind), value = COALESCE(?, value),
       min_subtotal_cents = COALESCE(?, min_subtotal_cents), max_discount_cents = COALESCE(?, max_discount_cents),
       usage_limit = COALESCE(?, usage_limit), expires_at = COALESCE(?, expires_at), active = COALESCE(?, active)
     WHERE id = ?`,
    [data.description ?? null, data.kind ?? null, data.value ?? null, data.minSubtotalCents ?? null,
      data.maxDiscountCents ?? null, data.usageLimit ?? null, data.expiresAt ?? null,
      data.active === undefined ? null : data.active ? 1 : 0, id],
  );
  return present.coupon(get('SELECT * FROM coupons WHERE id = ?', [id]));
}

export function deleteCoupon(id) {
  const res = run('DELETE FROM coupons WHERE id = ?', [id]);
  if (!res.changes) throw notFound('Coupon not found');
  return { deleted: true };
}
