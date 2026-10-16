import { h, icon, money, number, titleCase, mount } from '../dom.js';
import { api } from '../api.js';
import { store, commerce, previewTotals } from '../store.js';
import { router } from '../main.js';
import { alert, asyncButton, badge, emptyState, spinner } from '../components/ui.js';

export default async function cartPage() {
  return store.isAuthed ? authedCart() : guestCart();
}

// ---------------------------------------------------------------- signed in
async function authedCart() {
  const page = h('div', { class: 'container' });
  const state = { couponCode: '', shippingMethod: 'standard', cart: null, couponError: '' };

  const load = async () => {
    state.cart = await api.get('/api/cart', {
      query: { couponCode: state.couponCode || undefined, shippingMethod: state.shippingMethod },
    });
    store.setCartCount(state.cart.count);
    render();
  };

  const updateLine = async (itemId, patch) => {
    state.cart = await api.patch(`/api/cart/items/${itemId}`, patch);
    store.setCartCount(state.cart.count);
    await load();
  };

  const removeLine = async (itemId, title) => {
    state.cart = await api.del(`/api/cart/items/${itemId}`);
    store.setCartCount(state.cart.count);
    store.toast(`Removed “${title}”`, 'success', 2600);
    await load();
  };

  const render = () => {
    const { items, totals, hasIssues } = state.cart;
    mount(page, 
      h('div', { class: 'page-head' },
        h('div', { class: 'page-head__row' },
          h('div', null,
            h('h1', null, 'Your cart'),
            h('p', { class: 'muted' }, items.length ? `${number(state.cart.count)} item(s) ready to check out` : 'Your cart is empty')),
          items.length
            ? asyncButton('Empty cart', async () => {
              state.cart = await api.del('/api/cart');
              store.setCartCount(0);
              await load();
            }, { class: 'btn--quiet btn--sm' })
            : null)),

      items.length
        ? h('div', { class: 'cart-layout' },
          h('div', { class: 'stack' },
            hasIssues ? alert('Some lines need attention before checkout.', 'warn') : null,
            h('div', { class: 'panel' }, items.map((item) => cartLine(item, { updateLine, removeLine })))),
          summaryPanel(state, totals, load))
        : emptyState({
          title: 'Nothing in your cart yet',
          body: 'Browse the catalogue and add a few titles, or borrow something for the week.',
          iconName: 'cart',
          action: h('a', { class: 'btn', href: '/browse' }, 'Browse books'),
        }),
    );
  };

  mount(page, spinner('Loading your cart…'));
  await load();
  return page;
}

function cartLine(item, { updateLine, removeLine }) {
  const rules = commerce();
  const max = Math.min(item.availableStock || 1, rules.maxQuantityPerItem || 10);

  const qtyBox = item.mode === 'buy'
    ? h('div', { class: 'qty' },
      h('button', {
        type: 'button', 'aria-label': 'Decrease quantity', disabled: item.quantity <= 1,
        onClick: () => updateLine(item.id, { quantity: item.quantity - 1 }),
      }, '−'),
      h('input', {
        type: 'number', min: '1', max: String(max), value: String(item.quantity), 'aria-label': `Quantity of ${item.book.title}`,
        onChange: (e) => updateLine(item.id, { quantity: Math.max(1, Math.min(max, Number(e.target.value) || 1)) }),
      }),
      h('button', {
        type: 'button', 'aria-label': 'Increase quantity', disabled: item.quantity >= max,
        onClick: () => updateLine(item.id, { quantity: item.quantity + 1 }),
      }, '+'))
    : h('select', {
      class: 'select', style: { maxWidth: '190px' }, 'aria-label': 'Rental length',
      onChange: (e) => updateLine(item.id, { rentWeeks: Number(e.target.value) }),
    }, (rules.rentWeekOptions || [1, 2, 4]).map((w) =>
      h('option', { value: w, selected: w === item.rentWeeks }, `${w} ${w === 1 ? 'week' : 'weeks'} — ${money(item.book.rentWeeklyCents * w)}`)));

  return h('div', { class: 'cart-line' },
    h('a', { class: 'cart-line__cover', href: `/books/${item.book.id}` },
      h('img', { src: item.book.coverUrl, alt: '', loading: 'lazy', width: 72, height: 108 })),
    h('div', { class: 'grow' },
      h('div', { class: 'cart-line__top' },
        h('div', null,
          h('a', { href: `/books/${item.book.id}`, class: 'strong' }, item.book.title),
          h('div', { class: 'faint' }, item.book.author),
          h('div', { class: 'row', style: { gap: '6px', marginTop: '6px' } },
            badge(item.mode === 'rent' ? `Borrow · ${item.rentWeeks} wk` : 'Purchase', item.mode === 'rent' ? 'accent' : 'brand'),
            badge(titleCase(item.book.condition)),
            h('span', { class: 'faint tiny' }, `Sold by ${item.book.seller.storeName}`))),
        h('div', { style: { textAlign: 'right' } },
          h('div', { class: 'price price--sm' }, money(item.lineCents)),
          item.quantity > 1 ? h('div', { class: 'faint tiny' }, `${money(item.unitCents)} each`) : null)),
      item.issues?.length
        ? h('div', { style: { marginTop: '8px' } }, item.issues.map((issue) => alert(issue, 'warn')))
        : null,
      h('div', { class: 'cart-line__controls' },
        qtyBox,
        h('button', { class: 'btn btn--quiet btn--sm', onClick: () => removeLine(item.id, item.book.title) }, icon('trash', 14), 'Remove'),
        item.mode === 'buy' && item.book.rentEnabled && item.book.rentStock > 0
          ? h('button', {
            class: 'btn btn--quiet btn--sm',
            onClick: async () => {
              await removeLine(item.id, item.book.title);
              await api.post('/api/cart/items', { bookId: item.book.id, mode: 'rent', rentWeeks: 2 });
              router.resolve({ scroll: false });
            },
          }, icon('refresh', 14), 'Switch to borrow')
          : null)),
  );
}

function summaryPanel(state, totals, reload) {
  const rules = commerce();
  const couponInput = h('input', {
    class: 'input', placeholder: 'Promo code', value: state.couponCode, 'aria-label': 'Promo code',
    onInput: (e) => { state.couponCode = e.target.value.trim(); },
  });

  return h('aside', { class: 'summary stack' },
    h('div', { class: 'panel' },
      h('div', { class: 'panel__head' }, h('h2', null, 'Order summary')),
      h('div', { class: 'panel__body stack' },
        h('div', { class: 'totals' },
          totalsRow('Subtotal', money(totals.subtotalCents)),
          totals.discountCents ? totalsRow(`Discount (${totals.couponCode})`, `−${money(totals.discountCents)}`, 'discount') : null,
          totalsRow(
            totals.freeShippingApplied ? 'Shipping (free)' : 'Shipping',
            totals.needsShipping ? (totals.shippingCents ? money(totals.shippingCents) : 'Free') : 'Not required',
          ),
          totalsRow(`Estimated tax (${Math.round(rules.taxRate * 100)}%)`, money(totals.taxCents)),
          totalsRow('Total', money(totals.totalCents), 'total')),

        !totals.freeShippingApplied && totals.needsShipping && totals.subtotalCents < rules.freeShippingThresholdCents
          ? h('p', { class: 'field__hint' },
            `Add ${money(rules.freeShippingThresholdCents - totals.subtotalCents)} more for free standard shipping.`)
          : null,

        h('div', { class: 'field' },
          h('label', { class: 'label' }, 'Promo code'),
          h('div', { class: 'row' },
            couponInput,
            asyncButton('Apply', async () => {
              if (!state.couponCode) return;
              try {
                await api.post('/api/cart/coupon', { code: state.couponCode });
                store.success('Promo code applied');
                await reload();
              } catch (err) {
                store.error(err.message);
                state.couponCode = '';
                await reload();
              }
            }, { class: 'btn--ghost' })),
          totals.couponCode
            ? h('span', { class: 'field__hint' }, `${totals.couponCode} — ${totals.couponDescription}`)
            : h('span', { class: 'field__hint' }, 'Try WELCOME10 for 10% off your first order')),

        h('a', {
          class: `btn btn--lg btn--block${state.cart.hasIssues ? ' is-disabled' : ''}`,
          href: '/checkout',
          'aria-disabled': String(Boolean(state.cart.hasIssues)),
          onClick: (e) => {
            if (state.cart.hasIssues) {
              e.preventDefault();
              store.warn('Resolve the flagged lines before checking out');
            } else {
              sessionStorage.setItem('bb.checkout', JSON.stringify({ couponCode: totals.couponCode, shippingMethod: state.shippingMethod }));
            }
          },
        }, 'Proceed to checkout ', icon('arrowRight', 16)),
        h('a', { class: 'btn btn--ghost btn--block', href: '/browse' }, 'Keep shopping'))),

    h('div', { class: 'card card--pad faint tiny stack-sm' },
      h('div', { class: 'row', style: { gap: '6px' } }, icon('shield', 14), 'Secure mock checkout - no real card is charged'),
      h('div', { class: 'row', style: { gap: '6px' } }, icon('truck', 14), `Free standard shipping over ${money(rules.freeShippingThresholdCents)}`),
      h('div', { class: 'row', style: { gap: '6px' } }, icon('refresh', 14), 'Cancel any order before it ships')),
  );
}

const totalsRow = (label, value, variant = '') =>
  h('div', { class: `totals__row${variant ? ` totals__row--${variant}` : ''}` },
    h('span', null, label), h('span', null, value));

// ---------------------------------------------------------------- guest
async function guestCart() {
  const page = h('div', { class: 'container' });
  const lines = store.guestCart;

  if (!lines.length) {
    mount(page, 
      h('div', { class: 'page-head' }, h('h1', null, 'Your cart')),
      emptyState({
        title: 'Your cart is empty',
        body: 'Add books while browsing - we will keep them here, then move them into your account when you sign in.',
        iconName: 'cart',
        action: h('a', { class: 'btn', href: '/browse' }, 'Browse books'),
      }));
    return page;
  }

  mount(page, spinner('Loading your cart…'));
  const books = await Promise.all(lines.map(async (line) => {
    try {
      const res = await api.get(`/api/books/${line.bookId}`);
      return { line, book: res.book };
    } catch {
      return { line, book: null };
    }
  }));

  const priced = books
    .filter((entry) => entry.book)
    .map(({ line, book }) => {
      const unitCents = line.mode === 'rent' ? book.rentWeeklyCents * (line.rentWeeks || 1) : book.priceCents;
      return { line, book, unitCents, lineCents: unitCents * line.quantity, format: book.format };
    });
  const missing = books.filter((entry) => !entry.book).length;
  const totals = previewTotals(priced);

  const guestLine = ({ line, book, unitCents, lineCents }) => {
    const controls = h('div', { class: 'cart-line__controls' },
      line.mode === 'buy'
        ? h('div', { class: 'qty' },
          h('button', {
            type: 'button', 'aria-label': 'Decrease quantity',
            onClick: () => {
              store.updateGuestLine(book.id, line.mode, { quantity: Math.max(0, line.quantity - 1) });
              router.resolve({ scroll: false });
            },
          }, '\u2212'),
          h('input', { type: 'number', value: String(line.quantity), readonly: true, 'aria-label': 'Quantity' }),
          h('button', {
            type: 'button', 'aria-label': 'Increase quantity',
            onClick: () => {
              store.updateGuestLine(book.id, line.mode, { quantity: Math.min(10, line.quantity + 1) });
              router.resolve({ scroll: false });
            },
          }, '+'))
        : null,
      h('button', {
        class: 'btn btn--quiet btn--sm',
        onClick: () => {
          store.removeGuestLine(book.id, line.mode);
          router.resolve({ scroll: false });
        },
      }, icon('trash', 14), 'Remove'));

    const header = h('div', { class: 'cart-line__top' },
      h('div', null,
        h('a', { href: `/books/${book.id}`, class: 'strong' }, book.title),
        h('div', { class: 'faint' }, book.author),
        h('div', { class: 'row', style: { gap: '6px', marginTop: '6px' } },
          badge(
            line.mode === 'rent' ? `Borrow \u00b7 ${line.rentWeeks || 1} wk` : 'Purchase',
            line.mode === 'rent' ? 'accent' : 'brand',
          ),
          line.quantity > 1 ? h('span', { class: 'faint tiny' }, `${money(unitCents)} each`) : null)),
      h('div', { class: 'price price--sm' }, money(lineCents)));

    return h('div', { class: 'cart-line' },
      h('a', { class: 'cart-line__cover', href: `/books/${book.id}` },
        h('img', { src: book.coverUrl, alt: '', width: 72, height: 108, loading: 'lazy' })),
      h('div', { class: 'grow' }, header, controls));
  };

  const summary = h('aside', { class: 'summary stack' },
    h('div', { class: 'panel' },
      h('div', { class: 'panel__head' }, h('h2', null, 'Estimated total')),
      h('div', { class: 'panel__body stack' },
        h('div', { class: 'totals' },
          totalsRow('Subtotal', money(totals.subtotalCents)),
          totalsRow('Shipping', totals.needsShipping ? (totals.shippingCents ? money(totals.shippingCents) : 'Free') : 'Not required'),
          totalsRow('Estimated tax', money(totals.taxCents)),
          totalsRow('Total', money(totals.totalCents), 'total')),
        h('a', { class: 'btn btn--lg btn--block', href: `/login?next=${encodeURIComponent('/cart')}` }, 'Sign in to check out'),
        h('a', { class: 'btn btn--ghost btn--block', href: '/register' }, 'Create an account'),
        h('p', { class: 'field__hint' }, 'Totals are confirmed by the server once you sign in.'))));

  mount(page, 
    h('div', { class: 'page-head' },
      h('h1', null, 'Your cart'),
      h('p', { class: 'muted' }, 'Saved on this device. Sign in to check out - your cart comes with you.')),
    missing ? alert(`${missing} saved item(s) are no longer available and were skipped.`, 'warn') : null,
    h('div', { class: 'cart-layout' },
      h('div', { class: 'panel' }, priced.map(guestLine)),
      summary),
  );
  return page;
}
