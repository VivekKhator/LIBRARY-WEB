import { h, icon, money, titleCase } from '../dom.js';
import { conditionBadge, stars, saveButton, badge } from './ui.js';
import { addToCart } from './cart-actions.js';
import { store } from '../store.js';

export function bookCard(book, { compact = false } = {}) {
  const soldOut = book.stock <= 0 && book.rentStock <= 0;
  const rentOnly = !book.saleEnabled && book.rentEnabled;
  const own = store.user?.id === book.seller.id;

  const addButton = h('button', {
    class: 'btn btn--sm grow',
    disabled: soldOut || own,
    title: own ? 'This is your own listing' : soldOut ? 'Out of stock' : 'Add to cart',
    onClick: async (event) => {
      const btn = event.currentTarget;
      btn.classList.add('is-loading');
      try {
        await addToCart({ book, mode: rentOnly ? 'rent' : 'buy', rentWeeks: rentOnly ? 2 : 0 });
      } catch (err) {
        store.error(err.message);
      } finally {
        btn.classList.remove('is-loading');
      }
    },
  }, icon('cart', 15), soldOut ? 'Sold out' : rentOnly ? 'Borrow' : 'Add');

  return h('article', { class: 'book-card' },
    h('div', { class: 'book-card__cover' },
      h('a', { href: `/books/${book.id}`, 'aria-label': `${book.title} by ${book.author}` },
        h('img', { src: book.coverUrl, alt: `Cover of ${book.title}`, loading: 'lazy', width: 300, height: 450 })),
      h('div', { class: 'book-card__flags' },
        book.rentEnabled && book.rentStock > 0 ? badge('Rentable', 'accent') : null,
        book.status !== 'active' ? badge(titleCase(book.status), 'warn') : null,
        soldOut ? badge('Sold out', 'danger') : null),
      own ? null : saveButton(book.id)),
    h('div', { class: 'book-card__body' },
      h('h3', { class: 'book-card__title clamp-2' }, h('a', { href: `/books/${book.id}` }, book.title)),
      h('p', { class: 'book-card__author truncate' }, book.author),
      compact ? null : h('div', { class: 'row small', style: { gap: '8px' } },
        book.rating.count ? stars(book.rating.average, { showValue: true, count: book.rating.count }) : h('span', { class: 'faint' }, 'No reviews yet')),
      h('div', { class: 'book-card__meta' },
        h('div', null,
          h('span', { class: 'price' }, money(book.priceCents)),
          book.rentEnabled ? h('div', { class: 'price__rent' }, `${money(book.rentWeeklyCents)}/week rent`) : null),
        h('span', { style: { marginLeft: 'auto' } }, conditionBadge(book.condition)))),
    compact ? null : h('div', { class: 'book-card__actions' },
      addButton,
      h('a', { class: 'btn btn--ghost btn--sm', href: `/books/${book.id}` }, 'Details')),
  );
}

export const bookGrid = (books, options) =>
  h('div', { class: 'grid grid-books' }, books.map((book) => bookCard(book, options)));

export const bookRow = (book, extra = null) =>
  h('div', { class: 'row', style: { gap: '12px', alignItems: 'flex-start' } },
    h('a', { href: `/books/${book.id}`, style: { flex: 'none' } },
      h('img', { src: book.coverUrl || `/api/books/${book.id}/cover.svg`, alt: '', width: 44, height: 66, style: { borderRadius: '4px', objectFit: 'cover' }, loading: 'lazy' })),
    h('div', { class: 'grow' },
      h('a', { href: `/books/${book.id}`, class: 'strong' }, book.title),
      h('div', { class: 'faint' }, book.author)),
    extra);
