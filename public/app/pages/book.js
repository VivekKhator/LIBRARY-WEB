import { h, icon, money, number, titleCase, dateShort, relative, mount } from '../dom.js';
import { api } from '../api.js';
import { store, commerce } from '../store.js';
import { router } from '../main.js';
import { addToCart } from '../components/cart-actions.js';
import { bookGrid } from '../components/book-card.js';
import { alert, asyncButton, badge, breadcrumbs, conditionBadge, emptyState, modal, stars, saveButton, avatar } from '../components/ui.js';

export default async function bookPage(ctx) {
  const id = Number(ctx.params.id);
  const data = await api.get(`/api/books/${id}`);
  const book = data.book;
  store.pushRecent(book);

  const reviewsHost = h('div');
  const renderReviews = (payload) => mount(reviewsHost, reviewsSection(book, payload, renderReviews, data.canReview));
  renderReviews(data.reviews);

  return h('div', { class: 'container' },
    breadcrumbs([
      { label: 'Home', href: '/' },
      { label: 'Browse', href: '/browse' },
      book.category ? { label: book.category.name, href: `/browse?category=${book.category.slug}` } : null,
      { label: book.title },
    ].filter(Boolean)),

    book.status !== 'active'
      ? alert(`This listing is ${book.status} and is only visible to you.`, 'warn')
      : null,

    h('div', { class: 'book-detail' },
      h('div', { class: 'stack' },
        h('div', { class: 'book-detail__cover' },
          h('img', { src: book.coverUrl, alt: `Cover of ${book.title}`, width: 400, height: 600 })),
        h('div', { class: 'row', style: { justifyContent: 'center' } },
          store.user?.id === book.seller.id ? null : saveButton(book.id, { className: 'btn btn--ghost btn--block' }))),

      h('div', { class: 'stack-lg' },
        h('div', null,
          h('div', { class: 'row wrap', style: { gap: '8px', marginBottom: '10px' } },
            conditionBadge(book.condition),
            badge(titleCase(book.format)),
            book.rentEnabled && book.rentStock > 0 ? badge('Available to borrow', 'accent') : null,
            book.category ? badge(book.category.name, 'brand') : null),
          h('h1', { class: 'book-detail__title' }, book.title),
          h('p', { class: 'book-detail__author' }, 'by ', h('b', null, book.author)),
          h('div', { class: 'row wrap', style: { marginTop: '10px', gap: '14px' } },
            book.rating.count
              ? h('a', { href: '#reviews', class: 'row', style: { gap: '6px' } },
                stars(book.rating.average, { showValue: true, count: book.rating.count }))
              : h('span', { class: 'faint' }, 'No reviews yet'),
            h('span', { class: 'faint row', style: { gap: '4px' } }, icon('eye', 14), `${number(book.views)} views`),
            book.unitsSold ? h('span', { class: 'faint' }, `${number(book.unitsSold)} sold`) : null)),

        buyBox(book),

        book.description
          ? h('section', null, h('h2', null, 'About this copy'),
            h('p', { style: { marginTop: '8px', whiteSpace: 'pre-wrap' } }, book.description))
          : null,

        h('section', null,
          h('h2', null, 'Details'),
          h('dl', { class: 'spec-list', style: { marginTop: '12px' } },
            spec('Condition', titleCase(book.condition)),
            spec('Format', titleCase(book.format)),
            book.publisher ? spec('Publisher', book.publisher) : null,
            book.publishedYear ? spec('Published', String(book.publishedYear)) : null,
            book.pages ? spec('Pages', number(book.pages)) : null,
            spec('Language', book.language),
            book.isbn ? spec('ISBN', book.isbn) : null,
            spec('Listed', dateShort(book.createdAt)))),

        h('section', null,
          h('h2', null, 'Seller'),
          h('div', { class: 'seller-card', style: { marginTop: '12px' } },
            avatar(book.seller.storeName || book.seller.name),
            h('div', { class: 'grow' },
              h('b', null, book.seller.storeName || book.seller.name),
              h('div', { class: 'faint' }, `Sold and shipped by ${book.seller.name}`)),
            book.seller.storeSlug
              ? h('a', { class: 'btn btn--ghost btn--sm', href: `/stores/${book.seller.storeSlug}` }, 'Visit storefront')
              : null)),

        h('section', { id: 'reviews' }, reviewsHost),

        data.related.length
          ? h('section', null, h('h2', null, 'Readers also viewed'), h('div', { style: { marginTop: '12px' } }, bookGrid(data.related, { compact: true })))
          : null,
      )),
  );
}

const spec = (label, value) => h('div', { class: 'spec' }, h('dt', null, label), h('dd', null, value));

function buyBox(book) {
  const rules = commerce();
  const own = store.user?.id === book.seller.id;
  const canBuy = book.saleEnabled && book.stock > 0;
  const canRent = book.rentEnabled && book.rentStock > 0;
  let mode = canBuy ? 'buy' : 'rent';
  let weeks = rules.rentWeekOptions?.[1] ?? 2;
  let quantity = 1;

  const priceRow = h('div', { class: 'buy-box__price' });
  const stockRow = h('div');
  const controls = h('div', { class: 'stack-sm' });

  const renderPrice = () => {
    mount(priceRow, 
      mode === 'buy'
        ? h('span', { class: 'price' }, money(book.priceCents))
        : h('span', { class: 'price' }, money(book.rentWeeklyCents * weeks)),
      mode === 'buy'
        ? (book.rentEnabled ? h('span', { class: 'muted small' }, `or ${money(book.rentWeeklyCents)}/week to borrow`) : null)
        : h('span', { class: 'muted small' }, `${money(book.rentWeeklyCents)}/week × ${weeks} ${weeks === 1 ? 'week' : 'weeks'}`),
    );
    mount(stockRow, 
      mode === 'buy'
        ? (book.stock > 0
          ? h('span', { class: 'small', style: { color: 'var(--success-fg)' } }, `In stock · ${number(book.stock)} available`)
          : h('span', { class: 'small', style: { color: 'var(--danger-fg)' } }, 'Out of stock'))
        : (book.rentStock > 0
          ? h('span', { class: 'small', style: { color: 'var(--success-fg)' } }, `${number(book.rentStock)} rental ${book.rentStock === 1 ? 'copy' : 'copies'} available`)
          : h('span', { class: 'small', style: { color: 'var(--danger-fg)' } }, 'All rental copies are out')),
    );
    renderControls();
  };

  const qtyInput = h('input', { type: 'number', min: '1', max: String(Math.min(book.stock || 1, rules.maxQuantityPerItem || 10)), value: '1', 'aria-label': 'Quantity' });
  qtyInput.addEventListener('change', () => {
    const max = Math.min(book.stock || 1, rules.maxQuantityPerItem || 10);
    quantity = Math.max(1, Math.min(max, Number(qtyInput.value) || 1));
    qtyInput.value = String(quantity);
  });

  const renderControls = () => {
    mount(controls, 
      mode === 'buy'
        ? h('div', { class: 'row' },
          h('span', { class: 'label' }, 'Quantity'),
          h('div', { class: 'qty' },
            h('button', { type: 'button', 'aria-label': 'Decrease quantity', onClick: () => { qtyInput.value = String(Math.max(1, Number(qtyInput.value) - 1)); qtyInput.dispatchEvent(new Event('change')); } }, '−'),
            qtyInput,
            h('button', { type: 'button', 'aria-label': 'Increase quantity', onClick: () => { qtyInput.value = String(Number(qtyInput.value) + 1); qtyInput.dispatchEvent(new Event('change')); } }, '+')))
        : h('div', { class: 'field' },
          h('label', { class: 'label', for: 'weeks' }, 'Borrow for'),
          h('select', {
            id: 'weeks', class: 'select',
            onChange: (e) => { weeks = Number(e.target.value); renderPrice(); },
          }, (rules.rentWeekOptions || [1, 2, 4]).map((w) =>
            h('option', { value: w, selected: w === weeks }, `${w} ${w === 1 ? 'week' : 'weeks'} — ${money(book.rentWeeklyCents * w)}`)))),
    );
  };

  const modeToggle = canBuy && canRent
    ? h('div', { class: 'mode-toggle', role: 'group', 'aria-label': 'Purchase mode' },
      h('button', {
        type: 'button', 'aria-pressed': String(mode === 'buy'),
        onClick: (e) => {
          mode = 'buy';
          e.currentTarget.parentElement.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(i === 0)));
          renderPrice();
        },
      }, 'Buy it'),
      h('button', {
        type: 'button', 'aria-pressed': String(mode === 'rent'),
        onClick: (e) => {
          mode = 'rent';
          e.currentTarget.parentElement.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(i === 1)));
          renderPrice();
        },
      }, 'Borrow it'))
    : null;

  const addBtn = asyncButton(
    [icon('cart', 17), ' Add to cart'],
    async () => {
      await addToCart({ book, mode, quantity: mode === 'rent' ? 1 : quantity, rentWeeks: mode === 'rent' ? weeks : 0 });
    },
    { class: 'btn--lg grow', disabled: own || (!canBuy && !canRent) },
  );

  const buyNow = asyncButton('Buy now', async () => {
    await addToCart({ book, mode, quantity: mode === 'rent' ? 1 : quantity, rentWeeks: mode === 'rent' ? weeks : 0 });
    router.navigate(store.isAuthed ? '/checkout' : '/cart');
  }, { class: 'btn--accent btn--lg', disabled: own || (!canBuy && !canRent) });

  renderPrice();

  return h('div', { class: 'buy-box' },
    priceRow,
    stockRow,
    modeToggle,
    controls,
    own
      ? alert('This is your own listing. Manage it from your seller dashboard.', 'info',
        h('a', { class: 'btn btn--ghost btn--sm', href: `/seller/listings/${book.id}/edit` }, 'Edit'))
      : h('div', { class: 'row' }, addBtn, buyNow),
    h('div', { class: 'faint tiny row wrap', style: { gap: '14px' } },
      h('span', { class: 'row', style: { gap: '4px' } }, icon('truck', 14), `Free standard shipping over ${money(rules.freeShippingThresholdCents)}`),
      h('span', { class: 'row', style: { gap: '4px' } }, icon('shield', 14), 'Buyer protection on every order')),
  );
}

function reviewsSection(book, payload, rerender, canReview) {
  const summary = payload.summary;
  const refresh = async (sort = payload.sort || 'helpful', page = 1) => {
    const next = await api.get(`/api/books/${book.id}/reviews`, { query: { sort, page } });
    rerender({ ...next, sort });
  };

  const histogram = h('div', { class: 'histogram' },
    [5, 4, 3, 2, 1].map((star) => {
      const count = summary.histogram?.[star] || 0;
      const pct = summary.count ? Math.round((count / summary.count) * 100) : 0;
      return h('div', { class: 'histogram__row' },
        h('span', null, `${star} star`),
        h('div', { class: 'progress' }, h('div', { class: 'progress__bar', style: { width: `${pct}%` } })),
        h('span', null, number(count)));
    }));

  const openReviewForm = () => {
    if (!store.isAuthed) {
      store.warn('Sign in to write a review');
      return router.navigate(`/login?next=/books/${book.id}`);
    }
    const existing = payload.mine;
    let rating = existing?.rating || 0;
    const ratingInput = h('div', { class: 'rating-input', role: 'radiogroup', 'aria-label': 'Your rating' });
    const renderRating = () => {
      mount(ratingInput, 
        [1, 2, 3, 4, 5].map((value) =>
          h('button', {
            type: 'button', class: value <= rating ? 'is-on' : '', role: 'radio',
            'aria-checked': String(value === rating), 'aria-label': `${value} star${value > 1 ? 's' : ''}`,
            onClick: () => { rating = value; renderRating(); },
          }, h('svg', { viewBox: '0 0 24 24', fill: value <= rating ? 'currentColor' : 'none', stroke: 'currentColor', 'stroke-width': 1.5 },
            h('path', { d: 'M12 2.5l3 6.1 6.7 1-4.8 4.7 1.1 6.7L12 17.8 5.9 21l1.2-6.7L2.3 9.6l6.7-1z' })))));
    };
    renderRating();

    const titleInput = h('input', { class: 'input', name: 'title', maxlength: '120', placeholder: 'Sum it up in a line', value: existing?.title || '' });
    const bodyInput = h('textarea', { class: 'textarea', name: 'body', maxlength: '2000', placeholder: 'What did you make of the book and the condition it arrived in?' }, existing?.body || '');

    const dialog = modal({
      title: existing ? 'Edit your review' : `Review “${book.title}”`,
      body: h('div', { class: 'stack' },
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Your rating'), ratingInput),
        h('div', { class: 'field' }, h('label', { class: 'label' }, 'Headline'), titleInput),
        h('div', { class: 'field' }, h('label', { class: 'label' }, 'Review'), bodyInput)),
      footer: [
        existing
          ? asyncButton('Delete', async () => {
            await api.del(`/api/reviews/${existing.id}`);
            dialog.close();
            store.success('Review deleted');
            await refresh();
          }, { class: 'btn--ghost' })
          : null,
        h('button', { class: 'btn btn--ghost', onClick: () => dialog.close() }, 'Cancel'),
        asyncButton(existing ? 'Save changes' : 'Post review', async () => {
          if (!rating) return store.warn('Pick a star rating first');
          await api.post(`/api/books/${book.id}/reviews`, { rating, title: titleInput.value, body: bodyInput.value });
          dialog.close();
          store.success('Thanks for your review');
          await refresh();
        }),
      ].filter(Boolean),
    });
  };

  return h('div', { class: 'stack' },
    h('div', { class: 'row-between' },
      h('h2', null, 'Reviews'),
      canReview
        ? h('button', { class: 'btn btn--ghost btn--sm', onClick: openReviewForm }, payload.mine ? 'Edit your review' : 'Write a review')
        : null),

    summary.count
      ? h('div', { class: 'card card--pad' },
        h('div', { class: 'rating-summary' },
          h('div', { class: 'rating-summary__score' },
            h('b', null, Number(summary.average).toFixed(1)),
            stars(summary.average, { size: 'lg' }),
            h('div', { class: 'faint tiny' }, `${number(summary.count)} ${summary.count === 1 ? 'review' : 'reviews'}`)),
          histogram))
      : emptyState({ title: 'No reviews yet', body: canReview ? 'Be the first to review this copy.' : 'Sign in after a purchase to leave the first review.', iconName: 'sparkle' }),

    summary.count
      ? h('div', null,
        h('div', { class: 'row', style: { gap: '6px', margin: '4px 0 8px' } },
          h('span', { class: 'label' }, 'Sort reviews'),
          h('select', { class: 'select', style: { maxWidth: '180px' }, onChange: (e) => refresh(e.target.value) },
            [['helpful', 'Most helpful'], ['recent', 'Most recent'], ['highest', 'Highest rated'], ['lowest', 'Lowest rated']]
              .map(([value, label]) => h('option', { value, selected: (payload.sort || 'helpful') === value }, label)))),
        payload.items.map((review) => reviewCard(review, refresh)),
        payload.totalPages > 1
          ? h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '12px' } },
            Array.from({ length: payload.totalPages }, (_, i) =>
              h('button', {
                class: 'btn btn--quiet btn--sm', 'aria-current': payload.page === i + 1 ? 'page' : null,
                onClick: () => refresh(payload.sort, i + 1),
              }, String(i + 1))))
          : null)
      : null,
  );
}

function reviewCard(review, refresh) {
  const helpfulBtn = asyncButton(
    [icon('check', 14), ` Helpful (${number(review.helpfulCount)})`],
    async () => {
      if (!store.isAuthed) return store.warn('Sign in to vote on reviews');
      await api.post(`/api/reviews/${review.id}/helpful`);
      await refresh();
    },
    { class: 'btn--quiet btn--sm', 'aria-pressed': String(review.votedByMe) },
  );

  return h('article', { class: 'review' },
    h('div', { class: 'review__head' },
      avatar(review.author.name),
      h('div', { class: 'grow' },
        h('div', { class: 'row', style: { gap: '8px' } },
          h('b', null, review.author.name),
          review.verified ? badge('Verified purchase', 'success') : null,
          review.mine ? badge('Your review', 'brand') : null),
        h('div', { class: 'faint tiny' }, relative(review.createdAt))),
      stars(review.rating)),
    review.title ? h('b', null, review.title) : null,
    review.body ? h('p', { style: { marginTop: '4px', whiteSpace: 'pre-wrap' } }, review.body) : null,
    h('div', { class: 'row', style: { marginTop: '8px' } }, review.mine ? null : helpfulBtn),
  );
}
