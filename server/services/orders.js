import { all, get, run, transaction } from '../db/index.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { SHIPPING } from '../config.js';
import { computeTotals, rawCartRows, validateCoupon } from './cart.js';
import { authorize, refund } from './payments.js';
import { notify } from './notifications.js';
import { formatCents } from '../lib/money.js';
import * as present from './present.js';

const FULFILLMENT_ORDER = ['processing', 'packed', 'shipped', 'delivered'];
const ORDER_RANK = { paid: 0, packed: 1, shipped: 2, delivered: 3 };

const orderNumber = () => {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `BB-${stamp}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
};

const ITEMS_SELECT = `
  SELECT oi.*, u.name AS seller_name, u.store_name
  FROM order_items oi JOIN users u ON u.id = oi.seller_id
  WHERE oi.order_id = ? ORDER BY oi.id ASC`;

export function getOrder(viewer, id) {
  const row = get(
    `SELECT o.*, cu.name AS customer_name, cu.email AS customer_email
     FROM orders o JOIN users cu ON cu.id = o.user_id WHERE o.id = ?`,
    [id],
  );
  if (!row) throw notFound('Order not found');
  const items = all(ITEMS_SELECT, [id]);
  const isOwner = row.user_id === viewer.id;
  const isSeller = items.some((i) => i.seller_id === viewer.id);
  if (!isOwner && !isSeller && viewer.role !== 'admin') throw forbidden('That order belongs to someone else');
  const events = all('SELECT * FROM order_events WHERE order_id = ? ORDER BY id ASC', [id]);
  const visibleItems = isOwner || viewer.role === 'admin' ? items : items.filter((i) => i.seller_id === viewer.id);
  const dto = present.order(row, visibleItems, events);
  dto.loans = all('SELECT l.*, b.title, b.author FROM loans l JOIN books b ON b.id = l.book_id WHERE l.order_id = ? AND l.user_id = ?', [id, row.user_id])
    .map(present.loan);
  dto.viewer = { isOwner, isSeller, isAdmin: viewer.role === 'admin' };
  if (!isOwner && viewer.role !== 'admin') dto.customer = { id: row.user_id, name: row.customer_name, email: row.customer_email };
  return dto;
}

export function listOrders(userId, { status, page = 1, perPage = 10 } = {}) {
  const where = ['o.user_id = ?'];
  const params = [userId];
  if (status) { where.push('o.status = ?'); params.push(status); }
  const clause = `WHERE ${where.join(' AND ')}`;
  const total = get(`SELECT COUNT(*) AS c FROM orders o ${clause}`, params).c;
  const rows = all(
    `SELECT o.*, (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
     FROM orders o ${clause} ORDER BY datetime(o.placed_at) DESC, o.id DESC LIMIT ? OFFSET ?`,
    [...params, perPage, (page - 1) * perPage],
  );
  return {
    items: rows.map((row) => present.order(row, all(ITEMS_SELECT, [row.id]))),
    total,
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

export function listSellerOrders(sellerId, { status } = {}) {
  const rows = all(
    `SELECT DISTINCT o.*, cu.name AS customer_name, cu.email AS customer_email
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     JOIN users cu ON cu.id = o.user_id
     WHERE oi.seller_id = ? ${status ? 'AND oi.fulfillment = ?' : ''}
     ORDER BY datetime(o.placed_at) DESC, o.id DESC`,
    status ? [sellerId, status] : [sellerId],
  );
  return rows.map((row) => {
    const items = all(`${ITEMS_SELECT.replace('WHERE oi.order_id = ?', 'WHERE oi.order_id = ? AND oi.seller_id = ?')}`, [row.id, sellerId]);
    const dto = present.order(row, items);
    dto.sellerSubtotalCents = items.reduce((s, i) => s + (i.fulfillment === 'cancelled' ? 0 : i.line_cents), 0);
    return dto;
  });
}

export function listAllOrders({ status, q, page = 1, perPage = 20 } = {}) {
  const where = [];
  const params = [];
  if (status) { where.push('o.status = ?'); params.push(status); }
  if (q) {
    where.push('(o.order_number LIKE ? OR cu.email LIKE ? OR cu.name LIKE ?)');
    const term = `%${q}%`;
    params.push(term, term, term);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = get(`SELECT COUNT(*) AS c FROM orders o JOIN users cu ON cu.id = o.user_id ${clause}`, params).c;
  const rows = all(
    `SELECT o.*, cu.name AS customer_name, cu.email AS customer_email,
            (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
     FROM orders o JOIN users cu ON cu.id = o.user_id ${clause}
     ORDER BY datetime(o.placed_at) DESC, o.id DESC LIMIT ? OFFSET ?`,
    [...params, perPage, (page - 1) * perPage],
  );
  return {
    items: rows.map((row) => present.order(row, all(ITEMS_SELECT, [row.id]))),
    total, page, perPage, totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

/** Validates the cart against live stock/status. Returns priced lines ready to persist. */
export function prepareCheckout(userId) {
  const rows = rawCartRows(userId);
  if (!rows.length) throw badRequest('Your cart is empty');
  const problems = [];
  const lines = rows.map((row) => {
    const unitCents = row.mode === 'rent' ? row.rent_weekly_cents * row.rent_weeks : row.price_cents;
    const available = row.mode === 'rent' ? row.rent_stock : row.stock;
    if (row.status !== 'active') problems.push(`"${row.title}" is no longer listed`);
    else if (row.mode === 'buy' && !row.sale_enabled) problems.push(`"${row.title}" is no longer for sale`);
    else if (row.mode === 'rent' && !row.rent_enabled) problems.push(`"${row.title}" is no longer rentable`);
    else if (row.quantity > available) {
      problems.push(available === 0 ? `"${row.title}" is out of stock` : `Only ${available} copies of "${row.title}" left`);
    }
    return {
      cartItemId: row.id,
      bookId: row.book_id,
      sellerId: row.seller_id,
      title: row.title,
      author: row.author,
      coverSeed: row.cover_seed,
      coverUrl: row.cover_url,
      format: row.format,
      mode: row.mode,
      quantity: row.quantity,
      rentWeeks: row.rent_weeks,
      unitCents,
      lineCents: unitCents * row.quantity,
      book: { format: row.format },
    };
  });
  if (problems.length) throw badRequest(problems[0], { cart: problems });
  return lines;
}

export function checkout(user, payload) {
  const { shippingMethod = 'standard', couponCode = '', notes = '', payment = {}, addressId, address } = payload;
  if (!SHIPPING.has(shippingMethod)) throw badRequest('Pick a valid shipping method', { shippingMethod: 'Unknown method' });

  const shipTo = resolveAddress(user.id, addressId, address);
  const lines = prepareCheckout(user.id);
  const totals = computeTotals(lines, { couponCode, shippingMethod });
  const coupon = couponCode ? validateCoupon(couponCode, totals.subtotalCents) : null;
  const charge = authorize({ ...payment, amountCents: totals.totalCents });

  return transaction(() => {
    const number = orderNumber();
    const orderRes = run(
      `INSERT INTO orders (order_number, user_id, status, subtotal_cents, discount_cents, shipping_cents, tax_cents,
         total_cents, coupon_code, shipping_method, payment_brand, payment_last4, payment_ref, address_json, notes)
       VALUES (?,?,'paid',?,?,?,?,?,?,?,?,?,?,?,?)`,
      [number, user.id, totals.subtotalCents, totals.discountCents, totals.shippingCents, totals.taxCents,
        totals.totalCents, totals.couponCode, shippingMethod, charge.brand, charge.last4, charge.ref,
        JSON.stringify(shipTo), notes],
    );
    const orderId = Number(orderRes.lastInsertRowid);

    for (const line of lines) {
      const itemRes = run(
        `INSERT INTO order_items (order_id, book_id, seller_id, title, author, cover_seed, cover_url, mode, quantity,
           rent_weeks, unit_cents, line_cents) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [orderId, line.bookId, line.sellerId, line.title, line.author, line.coverSeed, line.coverUrl, line.mode,
          line.quantity, line.rentWeeks, line.unitCents, line.lineCents],
      );
      const itemId = Number(itemRes.lastInsertRowid);

      if (line.mode === 'buy') {
        const res = run('UPDATE books SET stock = stock - ? WHERE id = ? AND stock >= ?', [line.quantity, line.bookId, line.quantity]);
        if (!res.changes) throw badRequest(`"${line.title}" sold out while you were checking out`);
      } else {
        const res = run('UPDATE books SET rent_stock = rent_stock - ? WHERE id = ? AND rent_stock >= ?', [line.quantity, line.bookId, line.quantity]);
        if (!res.changes) throw badRequest(`The rental copy of "${line.title}" was just taken`);
        const dueAt = new Date(Date.now() + line.rentWeeks * 7 * 86_400_000).toISOString().replace('T', ' ').slice(0, 19);
        run('INSERT INTO loans (user_id, book_id, order_id, order_item_id, weeks, due_at) VALUES (?,?,?,?,?,?)', [
          user.id, line.bookId, orderId, itemId, line.rentWeeks, dueAt,
        ]);
      }
    }

    if (coupon) run('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?', [coupon.id]);
    run('DELETE FROM cart_items WHERE user_id = ?', [user.id]);
    addEvent(orderId, 'Order placed', `Payment ${charge.ref} authorized for ${formatCents(totals.totalCents)}`);

    notify(user.id, {
      kind: 'order',
      title: `Order ${number} confirmed`,
      body: `${lines.length} item(s) · ${formatCents(totals.totalCents)}`,
      link: `/orders/${orderId}`,
    });
    for (const sellerId of new Set(lines.map((l) => l.sellerId))) {
      const own = lines.filter((l) => l.sellerId === sellerId);
      notify(sellerId, {
        kind: 'sale',
        title: `New order: ${own.length} item(s)`,
        body: `${own.map((l) => l.title).join(', ')} · ${formatCents(own.reduce((s, l) => s + l.lineCents, 0))}`,
        link: `/seller/orders`,
      });
    }
    return getOrder(user, orderId);
  });
}

function resolveAddress(userId, addressId, inline) {
  if (addressId) {
    const row = get('SELECT * FROM addresses WHERE user_id = ? AND id = ?', [userId, addressId]);
    if (!row) throw badRequest('Pick a delivery address', { addressId: 'Address not found' });
    return present.address(row);
  }
  if (inline?.line1 && inline?.city && inline?.postalCode && inline?.fullName) {
    return {
      label: inline.label || 'Delivery',
      fullName: inline.fullName,
      line1: inline.line1,
      line2: inline.line2 || '',
      city: inline.city,
      state: inline.state || '',
      postalCode: inline.postalCode,
      country: inline.country || 'United States',
      phone: inline.phone || '',
    };
  }
  throw badRequest('A delivery address is required', { addressId: 'Choose or add an address' });
}

export const addEvent = (orderId, label, detail = '') =>
  run('INSERT INTO order_events (order_id, label, detail) VALUES (?,?,?)', [orderId, label, detail]);

function recomputeOrderStatus(orderId) {
  const items = all('SELECT fulfillment FROM order_items WHERE order_id = ?', [orderId]);
  const live = items.filter((i) => i.fulfillment !== 'cancelled');
  let status;
  if (!live.length) status = 'cancelled';
  else {
    const ranks = live.map((i) => FULFILLMENT_ORDER.indexOf(i.fulfillment));
    const min = Math.min(...ranks);
    status = ['paid', 'packed', 'shipped', 'delivered'][min];
  }
  run("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, orderId]);
  return status;
}

/** Seller/admin fulfillment transition for a single order line. */
export function updateFulfillment(actor, orderId, itemId, nextStatus) {
  const item = get('SELECT * FROM order_items WHERE id = ? AND order_id = ?', [itemId, orderId]);
  if (!item) throw notFound('Order line not found');
  if (item.seller_id !== actor.id && actor.role !== 'admin') throw forbidden('That order line belongs to another seller');
  if (!FULFILLMENT_ORDER.includes(nextStatus) && nextStatus !== 'cancelled') {
    throw badRequest('Unknown fulfillment status', { fulfillment: `Use one of ${[...FULFILLMENT_ORDER, 'cancelled'].join(', ')}` });
  }
  if (item.fulfillment === 'cancelled') throw badRequest('That line was cancelled and can no longer change');
  if (item.fulfillment === 'delivered' && nextStatus !== 'delivered') throw badRequest('Delivered lines cannot move backwards');
  if (nextStatus !== 'cancelled') {
    const from = FULFILLMENT_ORDER.indexOf(item.fulfillment);
    const to = FULFILLMENT_ORDER.indexOf(nextStatus);
    if (to < from) throw badRequest(`Cannot move a line from ${item.fulfillment} back to ${nextStatus}`);
  }

  return transaction(() => {
    run("UPDATE order_items SET fulfillment = ? WHERE id = ?", [nextStatus, itemId]);
    if (nextStatus === 'cancelled') restock(item);
    const order = get('SELECT * FROM orders WHERE id = ?', [orderId]);
    const status = recomputeOrderStatus(orderId);
    addEvent(orderId, `"${item.title}" marked ${nextStatus}`, `By ${actor.name}`);
    notify(order.user_id, {
      kind: 'order',
      title: `${item.title} is ${nextStatus}`,
      body: `Order ${order.order_number}`,
      link: `/orders/${orderId}`,
    });
    if (status === 'delivered') addEvent(orderId, 'Order delivered', 'All lines delivered');
    return getOrder(actor, orderId);
  });
}

function restock(item) {
  if (!item.book_id) return;
  if (item.mode === 'buy') run('UPDATE books SET stock = stock + ? WHERE id = ?', [item.quantity, item.book_id]);
  else {
    run('UPDATE books SET rent_stock = rent_stock + ? WHERE id = ?', [item.quantity, item.book_id]);
    run("DELETE FROM loans WHERE order_item_id = ? AND status = 'active'", [item.id]);
  }
}

/** Buyer-initiated cancellation, allowed until anything has shipped. */
export function cancelOrder(actor, orderId, reason = '') {
  const order = get('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (!order) throw notFound('Order not found');
  if (order.user_id !== actor.id && actor.role !== 'admin') throw forbidden('That order belongs to someone else');
  if (['cancelled', 'refunded'].includes(order.status)) throw badRequest('That order is already cancelled');
  if (['shipped', 'delivered'].includes(order.status)) {
    throw badRequest('This order has already shipped - start a return from the order page instead');
  }

  return transaction(() => {
    const items = all("SELECT * FROM order_items WHERE order_id = ? AND fulfillment <> 'cancelled'", [orderId]);
    for (const item of items) {
      run("UPDATE order_items SET fulfillment = 'cancelled' WHERE id = ?", [item.id]);
      restock(item);
    }
    if (order.coupon_code) run('UPDATE coupons SET used_count = MAX(0, used_count - 1) WHERE code = ?', [order.coupon_code]);
    const money = refund(order.payment_ref, order.total_cents);
    run("UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?", [orderId]);
    addEvent(orderId, 'Order cancelled', reason ? `Reason: ${reason}` : `Refund ${money.ref} issued`);
    notify(order.user_id, {
      kind: 'refund',
      title: `Order ${order.order_number} cancelled`,
      body: `${formatCents(order.total_cents)} refunded to your ${order.payment_brand} ending ${order.payment_last4}`,
      link: `/orders/${orderId}`,
    });
    for (const sellerId of new Set(items.map((i) => i.seller_id))) {
      notify(sellerId, { kind: 'order', title: `Order ${order.order_number} was cancelled`, body: 'Stock has been returned to your listings', link: '/seller/orders' });
    }
    return getOrder(actor, orderId);
  });
}

export function refundOrder(actor, orderId, reason = '') {
  if (actor.role !== 'admin') throw forbidden('Only admins can refund a delivered order');
  const order = get('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (!order) throw notFound('Order not found');
  if (order.status === 'refunded') throw badRequest('That order is already refunded');
  return transaction(() => {
    const money = refund(order.payment_ref, order.total_cents);
    run("UPDATE orders SET status = 'refunded', updated_at = datetime('now') WHERE id = ?", [orderId]);
    addEvent(orderId, 'Order refunded', reason || `Refund ${money.ref}`);
    notify(order.user_id, {
      kind: 'refund',
      title: `Refund issued for ${order.order_number}`,
      body: formatCents(order.total_cents),
      link: `/orders/${orderId}`,
    });
    return getOrder(actor, orderId);
  });
}

export const reorder = (userId, orderId) => {
  const order = get('SELECT * FROM orders WHERE id = ? AND user_id = ?', [orderId, userId]);
  if (!order) throw notFound('Order not found');
  const items = all('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
  return items
    .filter((i) => i.book_id)
    .map((i) => ({ bookId: i.book_id, mode: i.mode, quantity: i.quantity, rentWeeks: i.rent_weeks }));
};

export const ORDER_STATUSES = Object.keys(ORDER_RANK).concat(['cancelled', 'refunded']);
export { FULFILLMENT_ORDER };
