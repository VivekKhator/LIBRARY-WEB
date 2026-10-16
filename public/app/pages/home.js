import { h, icon, number } from '../dom.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { bookGrid } from '../components/book-card.js';
import { emptyState } from '../components/ui.js';

const section = (title, subtitle, books, link) =>
  books.length
    ? h('section', null,
      h('div', { class: 'section-head' },
        h('div', null, h('h2', null, title), subtitle ? h('p', null, subtitle) : null),
        link ? h('a', { class: 'btn btn--quiet', href: link }, 'See all ', icon('arrowRight', 15)) : null),
      bookGrid(books))
    : null;

export default async function homePage() {
  const feed = await api.get('/api/books/home');
  const promos = store.state.meta?.promos || [];
  const heroCovers = feed.bestSellers.slice(0, 3).concat(feed.newArrivals.slice(0, 3)).slice(0, 3);

  return h('div', { class: 'container stack-lg' },
    h('section', { class: 'hero' },
      h('div', { class: 'hero__inner' },
        h('div', null,
          h('span', { class: 'badge badge--accent' }, icon('sparkle', 14), ' A marketplace library'),
          h('h1', { style: { marginTop: '12px' } }, 'Buy, sell and borrow books from readers everywhere'),
          h('p', null,
            'Thousands of second-hand and new titles from independent sellers. Buy outright, or borrow by the week when you only need a book for a term.'),
          h('div', { class: 'hero__actions' },
            h('a', { class: 'btn btn--accent btn--lg', href: '/browse' }, icon('search', 18), 'Browse the catalogue'),
            h('a', { class: 'btn btn--ghost btn--lg', href: '/browse?mode=rent' }, icon('clock', 18), 'Books to borrow')),
          h('div', { class: 'hero__stats' },
            h('div', { class: 'hero__stat' }, h('b', null, number(feed.stats.books)), h('span', null, 'Live listings')),
            h('div', { class: 'hero__stat' }, h('b', null, number(feed.stats.sellers)), h('span', null, 'Sellers')),
            h('div', { class: 'hero__stat' }, h('b', null, number(feed.stats.readers)), h('span', null, 'Readers')),
            h('div', { class: 'hero__stat' }, h('b', null, number(feed.stats.reviews)), h('span', null, 'Reviews')))),
        h('div', { class: 'hero__shelf', 'aria-hidden': 'true' },
          heroCovers.map((book) => h('img', { src: book.coverUrl, alt: '', loading: 'lazy' }))))),

    promos.length
      ? h('div', { class: 'promo-strip' }, promos.map((promo) =>
        h('div', { class: 'promo' },
          h('code', null, promo.code),
          h('span', { class: 'tiny' }, promo.description))))
      : null,

    h('section', null,
      h('div', { class: 'section-head' }, h('h2', null, 'Browse by category')),
      h('div', { class: 'grid grid-3' }, feed.categories.map((cat) =>
        h('a', { class: 'cat-card', href: `/browse?category=${cat.slug}` },
          h('b', null, cat.name),
          h('span', null, `${number(cat.bookCount)} ${cat.bookCount === 1 ? 'book' : 'books'}`))))),

    section('New arrivals', 'Freshly listed by our sellers', feed.newArrivals, '/browse?sort=newest'),
    section('Best sellers', 'What readers are buying this month', feed.bestSellers, '/browse?sort=popular'),
    section('Available to borrow', 'Rent by the week - ideal for textbooks', feed.rentals, '/browse?mode=rent'),
    section('Highest rated', 'Loved by the community', feed.featured, '/browse?sort=rating'),

    feed.newArrivals.length ? null : emptyState({
      title: 'The shelves are empty',
      body: 'No active listings yet. Sign in as a seller and add the first book.',
      action: h('a', { class: 'btn', href: '/sell' }, 'Start selling'),
    }),

    h('section', null,
      h('div', { class: 'section-head' }, h('div', null, h('h2', null, 'How BiblioBazaar works'), h('p', null, 'Three ways to use the marketplace'))),
      h('div', { class: 'how-grid' },
        h('div', { class: 'how-step' },
          h('b', null, '1'), h('h3', null, 'Buy'),
          h('p', { class: 'muted small' }, 'Search by title, author or ISBN, filter by condition and price, then check out with a card. Every listing shows its seller and condition grade.')),
        h('div', { class: 'how-step' },
          h('b', null, '2'), h('h3', null, 'Borrow'),
          h('p', { class: 'muted small' }, `Rent eligible titles by the week. Track due dates, extend up to ${store.state.meta?.commerce?.maxRentExtensions ?? 2} times, and return when you are done.`)),
        h('div', { class: 'how-step' },
          h('b', null, '3'), h('h3', null, 'Sell'),
          h('p', { class: 'muted small' }, 'Open a storefront in a minute, list your shelf, and manage orders, stock and payouts from the seller dashboard.')))),

    h('section', { class: 'card card--pad', style: { textAlign: 'center' } },
      h('h2', null, 'Have books gathering dust?'),
      h('p', { class: 'muted', style: { maxWidth: '52ch', margin: '8px auto 20px' } },
        'List them in minutes and reach readers who are already searching. You keep ',
        h('b', null, `${Math.round((1 - (store.state.meta?.commerce?.platformFeeRate ?? 0.1)) * 100)}%`),
        ' of every sale.'),
      h('a', { class: 'btn btn--lg', href: '/sell' }, icon('store', 18), 'Open your storefront')),
  );
}
