import { h, icon, money, number, dateShort, dateTime, titleCase, relative, mount } from '../dom.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { router } from '../main.js';
import {
  alert, asyncButton, badge, breadcrumbs, confirmDialog, emptyState, fulfillmentTrack, pagination, spinner,
  statusBadge, timeline,
} from '../components/ui.js';

const FILTERS = [
  { value: '', label: 'All orders' },
  { value: 'paid', label: 'Paid' },
  { value: 'packed', label: 'Packed' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default async function ordersPage(ctx) {
  const page = h('div', { class: 'container' });
  const status = ctx.query.status || '';
  const pageNum = Number(ctx.query.page) || 1;

  mount(page, spinner('Loading your orders…'));
  const data = await api.get('/api/orders', { query: { status: status || undefined, page: pageNum, perPage: 8 } });

  mount(page, 
    h('div', { class: 'page-head' },
      h('div', { class: 'page-head__row' },
        h('div', null,
          h('h1', null, 'Your orders'),
          h('p', { class: 'muted' }, `${number(data.total)} order(s) placed`)),
        h('a', { class: 'btn btn--ghost btn--sm', href: '/browse' }, 'Buy something else'))),

    h('div', { class: 'tabs', style: { marginBottom: '20px' } },
      FILTERS.map((filter) =>
        h('button', {
          'aria-selected': String(status === filter.value),
          onClick: () => router.navigate(filter.value ? `/orders?status=${filter.value}` : '/orders'),
        }, filter.label))),

    data.items.length
      ? h('div', { class: 'stack' },
        data.items.map(orderCard),
        pagination({
          page: data.page,
          totalPages: data.totalPages,
          onChange: (p) => router.navigate(`/orders?${new URLSearchParams({ ...(status ? { status } : {}), page: p })}`),
        }))
      : emptyState({
        title: status ? `No ${status} orders` : 'You have not ordered yet',
        body: 'When you buy or borrow a book it will appear here with its tracking status.',
        iconName: 'package',
        action: h('a', { class: 'btn', href: '/browse' }, 'Browse the catalogue'),
      }),
  );
  return page;
}

function orderCard(order) {
  return h('article', { class: 'order-card' },
    h('div', { class: 'order-card__head' },
      h('div', null,
        h('a', { href: `/orders/${order.id}`, class: 'strong' }, order.orderNumber),
        h('div', { class: 'faint tiny' }, `Placed ${dateShort(order.placedAt)} · ${relative(order.placedAt)}`)),
      h('div', { class: 'row', style: { gap: '8px' } },
        statusBadge(order.status),
        h('b', null, money(order.totalCents)))),
    h('div', { class: 'order-thumbs' },
      order.items.slice(0, 6).map((item) =>
        h('a', { href: `/books/${item.bookId}`, title: item.title },
          h('img', { src: item.coverUrl, alt: item.title, loading: 'lazy' }))),
      order.items.length > 6 ? h('span', { class: 'faint small' }, `+${order.items.length - 6} more`) : null),
    h('div', { class: 'row-between' },
      h('span', { class: 'small muted' },
        order.items.map((i) => i.title).slice(0, 2).join(', '),
        order.items.length > 2 ? ` and ${order.items.length - 2} more` : ''),
      h('a', { class: 'btn btn--ghost btn--sm', href: `/orders/${order.id}` }, 'View details')),
  );
}

export async function orderDetailPage(ctx) {
  const page = h('div', { class: 'container' });
  const id = Number(ctx.params.id);

  const load = async () => {
    const { order } = await api.get(`/api/orders/${id}`);
    render(order);
  };

  const render = (order) => {
    const canCancel = order.viewer.isOwner && ['paid', 'packed'].includes(order.status);
    const sellerLines = order.items.filter((item) => item.seller.id === store.user?.id);
    const canFulfil = (order.viewer.isSeller || order.viewer.isAdmin) && (sellerLines.length || order.viewer.isAdmin);

    mount(page, 
      breadcrumbs([{ label: 'Orders', href: '/orders' }, { label: order.orderNumber }]),
      ctx.query.placed ? alert('Payment confirmed - thank you! A confirmation is in your notifications.', 'success') : null,

      h('div', { class: 'page-head' },
        h('div', { class: 'page-head__row' },
          h('div', null,
            h('h1', null, `Order ${order.orderNumber}`),
            h('p', { class: 'muted' }, `Placed ${dateTime(order.placedAt)}`)),
          h('div', { class: 'row', style: { gap: '8px' } },
            statusBadge(order.status),
            canCancel
              ? asyncButton('Cancel order', async () => {
                const ok = await confirmDialog({
                  title: 'Cancel this order?',
                  message: 'Stock returns to the sellers and your payment is refunded to the original card.',
                  confirmLabel: 'Cancel order',
                  danger: true,
                });
                if (ok) {
                  await api.post(`/api/orders/${order.id}/cancel`, { reason: 'Cancelled by customer' });
                  store.success('Order cancelled and refunded');
                  await load();
                }
              }, { class: 'btn--ghost btn--sm' })
              : null,
            order.viewer.isOwner
              ? asyncButton('Buy again', async () => {
                const res = await api.post(`/api/orders/${order.id}/reorder`);
                store.setCartCount(res.cart.count);
                if (res.added) store.success(`${res.added} item(s) added back to your cart`);
                if (res.skipped.length) store.warn(res.skipped[0]);
                if (res.added) router.navigate('/cart');
              }, { class: 'btn--ghost btn--sm' })
              : null,
            order.viewer.isAdmin && !['refunded', 'cancelled'].includes(order.status)
              ? asyncButton('Refund', async () => {
                const ok = await confirmDialog({
                  title: 'Refund this order?',
                  message: 'The customer is refunded in full and notified. This cannot be undone.',
                  confirmLabel: 'Refund order',
                  danger: true,
                });
                if (ok) {
                  await api.post(`/api/admin/orders/${order.id}/refund`, { reason: 'Admin refund' });
                  store.success('Order refunded');
                  await load();
                }
              }, { class: 'btn--danger btn--sm' })
              : null))),

      h('div', { class: 'cart-layout' },
        h('div', { class: 'stack' },
          h('section', { class: 'panel' },
            h('div', { class: 'panel__head' }, h('h2', null, `Items (${order.items.length})`)),
            h('div', { class: 'panel__body--tight' },
              order.items.map((item) => orderLine(item, order, canFulfil, load)))),

          order.loans?.length
            ? h('section', { class: 'panel' },
              h('div', { class: 'panel__head' }, h('h2', null, 'Borrowed in this order')),
              h('div', { class: 'panel__body stack-sm' },
                order.loans.map((loan) =>
                  h('div', { class: 'row-between' },
                    h('div', null, h('b', null, loan.title), h('div', { class: 'faint tiny' }, `Due ${dateShort(loan.dueAt)}`)),
                    h('div', { class: 'row', style: { gap: '8px' } }, statusBadge(loan.status),
                      h('a', { class: 'btn btn--quiet btn--sm', href: '/loans' }, 'Manage')))),
              ))
            : null,

          h('section', { class: 'panel' },
            h('div', { class: 'panel__head' }, h('h2', null, 'Order history')),
            h('div', { class: 'panel__body' }, timeline(order.events))),
        ),

        h('aside', { class: 'summary stack' },
          h('div', { class: 'panel' },
            h('div', { class: 'panel__head' }, h('h2', null, 'Payment summary')),
            h('div', { class: 'panel__body' },
              h('div', { class: 'totals' },
                row('Subtotal', money(order.subtotalCents)),
                order.discountCents ? row(`Discount (${order.couponCode})`, `−${money(order.discountCents)}`, 'discount') : null,
                row('Shipping', order.shippingCents ? money(order.shippingCents) : 'Free'),
                row('Tax', money(order.taxCents)),
                row('Total paid', money(order.totalCents), 'total')),
              h('p', { class: 'faint tiny', style: { marginTop: '10px' } },
                `${order.payment.brand} ending ${order.payment.last4} · ${order.payment.ref}`))),

          h('div', { class: 'panel' },
            h('div', { class: 'panel__head' }, h('h2', null, 'Delivery')),
            h('div', { class: 'panel__body small' },
              h('b', null, order.address?.fullName || '—'),
              h('div', { class: 'muted' },
                [order.address?.line1, order.address?.line2, order.address?.city, order.address?.state, order.address?.postalCode, order.address?.country]
                  .filter(Boolean).join(', ')),
              order.address?.phone ? h('div', { class: 'faint tiny' }, order.address.phone) : null,
              h('hr', { class: 'divider', style: { margin: '12px 0' } }),
              h('div', { class: 'row', style: { gap: '6px' } }, icon('truck', 15), titleCase(order.shippingMethod), ' shipping'),
              order.notes ? h('p', { class: 'faint tiny', style: { marginTop: '8px' } }, `Note: ${order.notes}`) : null)),

          order.customer && !order.viewer.isOwner
            ? h('div', { class: 'panel' },
              h('div', { class: 'panel__head' }, h('h2', null, 'Customer')),
              h('div', { class: 'panel__body small' },
                h('b', null, order.customer.name),
                h('div', { class: 'muted' }, order.customer.email)))
            : null),
      ),
    );
  };

  mount(page, spinner('Loading order…'));
  await load();
  return page;
}

function orderLine(item, order, canFulfil, reload) {
  const isMine = item.seller.id === store.user?.id;
  const next = { processing: 'packed', packed: 'shipped', shipped: 'delivered' }[item.fulfillment];
  const showControls = canFulfil && (isMine || order.viewer.isAdmin) && item.fulfillment !== 'cancelled' && item.fulfillment !== 'delivered';

  return h('div', { class: 'cart-line' },
    h('a', { class: 'cart-line__cover', href: `/books/${item.bookId}` },
      h('img', { src: item.coverUrl, alt: '', width: 72, height: 108, loading: 'lazy' })),
    h('div', { class: 'grow' },
      h('div', { class: 'cart-line__top' },
        h('div', null,
          h('a', { href: `/books/${item.bookId}`, class: 'strong' }, item.title),
          h('div', { class: 'faint' }, item.author),
          h('div', { class: 'row', style: { gap: '6px', marginTop: '6px' } },
            badge(item.mode === 'rent' ? `Borrowed · ${item.rentWeeks} wk` : `Qty ${item.quantity}`, item.mode === 'rent' ? 'accent' : 'brand'),
            h('span', { class: 'faint tiny' }, `Sold by ${item.seller.storeName || item.seller.name}`))),
        h('div', { style: { textAlign: 'right' } },
          h('div', { class: 'price price--sm' }, money(item.lineCents)),
          h('div', { class: 'faint tiny' }, `${money(item.unitCents)} each`))),
      h('div', { style: { maxWidth: '330px', marginTop: '10px' } }, fulfillmentTrack(item.fulfillment)),
      showControls
        ? h('div', { class: 'row', style: { marginTop: '10px', gap: '8px' } },
          next
            ? asyncButton(`Mark ${next}`, async () => {
              await api.patch(`/api/orders/${order.id}/items/${item.id}`, { fulfillment: next });
              store.success(`Line marked ${next}`);
              await reload();
            }, { class: 'btn--sm' })
            : null,
          asyncButton('Cancel line', async () => {
            const ok = await confirmDialog({
              title: 'Cancel this line?',
              message: 'Stock returns to your listing and the customer is notified.',
              confirmLabel: 'Cancel line',
              danger: true,
            });
            if (ok) {
              await api.patch(`/api/orders/${order.id}/items/${item.id}`, { fulfillment: 'cancelled' });
              store.success('Line cancelled');
              await reload();
            }
          }, { class: 'btn--ghost btn--sm' }))
        : null),
  );
}

const row = (label, value, variant = '') =>
  h('div', { class: `totals__row${variant ? ` totals__row--${variant}` : ''}` }, h('span', null, label), h('span', null, value));
