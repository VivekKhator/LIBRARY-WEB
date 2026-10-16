import { h, icon, money, number, mount, clear } from '../dom.js';
import { api } from '../api.js';
import { store, commerce } from '../store.js';
import { router } from '../main.js';
import { alert, applyFieldErrors, asyncButton } from '../components/ui.js';

export default async function sellPage() {
  const rules = commerce();
  const keepRate = Math.round((1 - (rules.platformFeeRate ?? 0.1)) * 100);

  if (store.isSeller) {
    return h('div', { class: 'container stack-lg' },
      h('div', { class: 'page-head' },
        h('h1', null, 'You are already selling'),
        h('p', { class: 'muted' }, `Your storefront is live${store.user.storeName ? `: ${store.user.storeName}` : ''}.`)),
      h('div', { class: 'row wrap' },
        h('a', { class: 'btn', href: '/seller' }, icon('chart', 17), 'Open dashboard'),
        h('a', { class: 'btn btn--ghost', href: '/seller/listings/new' }, icon('plus', 17), 'List a book'),
        store.user.storeSlug ? h('a', { class: 'btn btn--ghost', href: `/stores/${store.user.storeSlug}` }, 'View storefront') : null));
  }

  const model = { storeName: '', storeBio: '' };
  const errorHost = h('div');
  const form = h('form', { class: 'stack', onSubmit: (e) => { e.preventDefault(); submitBtn.click(); } },
    h('div', { class: 'field' },
      h('label', { for: 'storeName' }, 'Storefront name'),
      h('input', {
        class: 'input', id: 'storeName', name: 'storeName', required: true, maxlength: '60',
        placeholder: 'The Dog-Eared Shelf',
        onInput: (e) => { model.storeName = e.target.value; },
      }),
      h('span', { class: 'field__hint' }, 'This is what buyers see on every listing.')),
    h('div', { class: 'field' },
      h('label', { for: 'storeBio' }, 'About your shop (optional)'),
      h('textarea', {
        class: 'textarea', id: 'storeBio', name: 'storeBio', maxlength: '500',
        placeholder: 'What do you stock? How do you grade condition? How fast do you ship?',
        onInput: (e) => { model.storeBio = e.target.value; },
      })));

  const submitBtn = asyncButton('Open my storefront', async () => {
    clear(errorHost);
    if (!store.isAuthed) {
      store.warn('Create an account first - it takes a moment');
      return router.navigate(`/register?next=${encodeURIComponent('/sell')}`);
    }
    try {
      const res = await api.post('/api/sellers/apply', model);
      store.setUser(res.user);
      store.success('Storefront opened - list your first book');
      router.navigate('/seller/listings/new');
    } catch (err) {
      if (err.fields) applyFieldErrors(form, err.fields);
      mount(errorHost, alert(err.message, 'error'));
      throw err;
    }
  }, { class: 'btn--lg btn--block', type: 'submit' });
  form.appendChild(submitBtn);

  return h('div', { class: 'container stack-lg' },
    h('section', { class: 'hero' },
      h('div', { class: 'hero__inner' },
        h('div', null,
          h('span', { class: 'badge badge--accent' }, 'Sell on BiblioBazaar'),
          h('h1', { style: { marginTop: '12px' } }, 'Turn your shelves into a storefront'),
          h('p', null, `List in minutes, set your own prices, and keep ${keepRate}% of every sale. Offer books for purchase, weekly rental, or both.`),
          h('div', { class: 'hero__stats' },
            h('div', { class: 'hero__stat' }, h('b', null, `${keepRate}%`), h('span', null, 'You keep')),
            h('div', { class: 'hero__stat' }, h('b', null, number(store.state.meta?.counts?.books || 0)), h('span', null, 'Live listings')),
            h('div', { class: 'hero__stat' }, h('b', null, 'Weekly'), h('span', null, 'Payouts')))))),

    h('div', { class: 'cart-layout' },
      h('div', { class: 'stack' },
        h('section', { class: 'card card--pad' },
          h('h2', null, 'How selling works'),
          h('div', { class: 'how-grid', style: { marginTop: '16px' } },
            [
              ['Open your storefront', 'Pick a shop name. You get a public storefront page and a seller dashboard.'],
              ['List your books', 'Add title, author, condition and price. Choose sale, rental, or both, and set stock.'],
              ['We review new listings', 'A moderator approves listings before they go live, which keeps the catalogue trustworthy.'],
              ['Fulfil and get paid', `Mark orders packed, shipped and delivered. You keep ${keepRate}% of the sale price.`],
            ].map(([title, body], i) =>
              h('div', { class: 'how-step' }, h('b', null, String(i + 1)), h('h3', null, title), h('p', { class: 'muted small' }, body))))),

        h('section', { class: 'card card--pad' },
          h('h2', null, 'Fees and rules'),
          h('ul', { class: 'stack-sm', style: { marginTop: '12px' } },
            [
              `Platform fee: ${Math.round((rules.platformFeeRate ?? 0.1) * 100)}% of each sale, deducted from payouts.`,
              `Rental lengths available to buyers: ${(rules.rentWeekOptions || []).join(', ')} weeks.`,
              `Late fees on rentals: ${money(rules.lateFeePerDayCents)} per day, retained by the platform.`,
              'Buyers can cancel until a line is marked shipped; stock returns automatically.',
              'Listings you edit go back through moderation before being visible again.',
            ].map((text) => h('li', { class: 'row', style: { gap: '8px', alignItems: 'flex-start' } },
              icon('check', 16), h('span', { class: 'muted small' }, text))))),
      ),

      h('aside', { class: 'summary' },
        h('div', { class: 'panel' },
          h('div', { class: 'panel__head' }, h('h2', null, 'Open your storefront')),
          h('div', { class: 'panel__body stack' },
            errorHost,
            store.isAuthed ? null : alert('You will be asked to create an account first.', 'info'),
            form)))),
  );
}
