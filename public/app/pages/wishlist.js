import { h, icon, money, number, relative, mount } from '../dom.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { router } from '../main.js';
import { addToCart } from '../components/cart-actions.js';
import { asyncButton, badge, emptyState, spinner, stars } from '../components/ui.js';

export default async function wishlistPage() {
  const page = h('div', { class: 'container' });

  const load = async () => {
    const data = await api.get('/api/wishlist');
    store.setWishlist(data.items.map((entry) => entry.book.id));
    render(data.items);
  };

  const render = (items) => {
    mount(page, 
      h('div', { class: 'page-head' },
        h('div', { class: 'page-head__row' },
          h('div', null,
            h('h1', null, 'Wishlist'),
            h('p', { class: 'muted' }, `${number(items.length)} saved ${items.length === 1 ? 'book' : 'books'}`)),
          items.length
            ? asyncButton('Add all available to cart', async () => {
              let added = 0;
              for (const entry of items.filter((i) => i.available)) {
                try {
                  await addToCart({ book: entry.book, mode: entry.book.saleEnabled && entry.book.stock > 0 ? 'buy' : 'rent', rentWeeks: 2 });
                  added++;
                } catch { /* skip unavailable */ }
              }
              if (added) router.navigate('/cart');
              else store.warn('None of your saved books are currently available');
            }, { class: 'btn--ghost btn--sm' })
            : null)),

      items.length
        ? h('div', { class: 'panel' }, items.map((entry) => wishlistRow(entry, load)))
        : emptyState({
          title: 'Your wishlist is empty',
          body: 'Tap the heart on any listing to save it here and get it back in one click.',
          iconName: 'heart',
          action: h('a', { class: 'btn', href: '/browse' }, 'Browse books'),
        }),
    );
  };

  mount(page, spinner('Loading your wishlist…'));
  await load();
  return page;
}

function wishlistRow(entry, reload) {
  const book = entry.book;
  return h('div', { class: 'cart-line' },
    h('a', { class: 'cart-line__cover', href: `/books/${book.id}` },
      h('img', { src: book.coverUrl, alt: '', width: 72, height: 108, loading: 'lazy' })),
    h('div', { class: 'grow' },
      h('div', { class: 'cart-line__top' },
        h('div', null,
          h('a', { href: `/books/${book.id}`, class: 'strong' }, book.title),
          h('div', { class: 'faint' }, book.author),
          h('div', { class: 'row', style: { gap: '8px', marginTop: '6px' } },
            book.rating.count ? stars(book.rating.average, { showValue: true, count: book.rating.count }) : h('span', { class: 'faint tiny' }, 'No reviews'),
            entry.available ? badge('Available', 'success') : badge('Unavailable', 'danger')),
          h('div', { class: 'faint tiny', style: { marginTop: '4px' } }, `Saved ${relative(entry.addedAt)}`)),
        h('div', { style: { textAlign: 'right' } },
          h('div', { class: 'price price--sm' }, money(book.priceCents)),
          book.rentEnabled ? h('div', { class: 'price__rent' }, `${money(book.rentWeeklyCents)}/wk`) : null)),
      h('div', { class: 'cart-line__controls' },
        asyncButton([icon('cart', 14), ' Add to cart'], async () => {
          await addToCart({ book, mode: book.saleEnabled && book.stock > 0 ? 'buy' : 'rent', rentWeeks: 2 });
        }, { class: 'btn--sm', disabled: !entry.available }),
        asyncButton([icon('trash', 14), ' Remove'], async () => {
          await api.del(`/api/wishlist/${book.id}`);
          store.toggleWishlistLocal(book.id, false);
          store.toast('Removed from wishlist', 'success', 2200);
          await reload();
        }, { class: 'btn--quiet btn--sm' }))),
  );
}
