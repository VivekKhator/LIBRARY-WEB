import { h, number, dateShort } from '../dom.js';
import { api } from '../api.js';
import { router } from '../main.js';
import { bookGrid } from '../components/book-card.js';
import { avatar, emptyState, pagination } from '../components/ui.js';

export default async function storePage(ctx) {
  const slug = ctx.params.slug;
  const page = Number(ctx.query.page) || 1;
  const sort = ctx.query.sort || 'newest';
  const data = await api.get(`/api/stores/${encodeURIComponent(slug)}`, { query: { page, sort, perPage: 12 } });
  const { seller, stats, books } = data;

  return h('div', { class: 'container stack-lg' },
    h('section', { class: 'store-hero' },
      avatar(seller.storeName || seller.name, { large: true }),
      h('div', null,
        h('h1', { style: { color: '#fff' } }, seller.storeName || seller.name),
        h('p', { style: { color: 'rgba(255,255,255,.85)', maxWidth: '52ch' } },
          seller.storeBio || `Books listed by ${seller.name}.`),
        h('p', { class: 'tiny', style: { color: 'rgba(255,255,255,.7)', marginTop: '6px' } },
          `Selling since ${dateShort(seller.memberSince)}`)),
      h('div', { class: 'store-hero__stats' },
        h('div', null, h('b', null, number(stats.listings)), h('span', null, 'Listings')),
        h('div', null, h('b', null, number(stats.unitsSold)), h('span', null, 'Books sold')),
        h('div', null, h('b', null, stats.rating.count ? `${stats.rating.average.toFixed(1)}★` : '—'), h('span', null, `${number(stats.rating.count)} reviews`)),
        h('div', null, h('b', null, number(stats.views)), h('span', null, 'Views')))),

    h('div', { class: 'results-head' },
      h('p', { class: 'muted small' }, `${number(books.total)} active listing(s)`),
      h('div', { class: 'row' },
        h('label', { class: 'label', for: 'store-sort' }, 'Sort'),
        h('select', {
          id: 'store-sort', class: 'select', style: { minWidth: '180px' },
          onChange: (e) => router.navigate(`/stores/${slug}?sort=${e.target.value}`),
        },
          [['newest', 'Newest'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['rating', 'Top rated'], ['title', 'Title A-Z']]
            .map(([value, label]) => h('option', { value, selected: sort === value }, label))))),

    books.items.length
      ? h('div', { class: 'stack-lg' },
        bookGrid(books.items),
        pagination({
          page: books.page,
          totalPages: books.totalPages,
          onChange: (p) => router.navigate(`/stores/${slug}?sort=${sort}&page=${p}`),
        }))
      : emptyState({
        title: 'This storefront has no live listings',
        body: 'Check back soon, or browse the wider catalogue.',
        iconName: 'store',
        action: h('a', { class: 'btn', href: '/browse' }, 'Browse all books'),
      }),
  );
}
