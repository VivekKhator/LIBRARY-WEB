import { h, icon, money, number, dateShort, relative, titleCase, mount } from '../dom.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { router } from '../main.js';
import { alert, applyFieldErrors, asyncButton, barList, confirmDialog, emptyState, spinner, sparkline, statCard, statusBadge, stars } from '../components/ui.js';
import { bookRow } from '../components/book-card.js';

const NAV = [
  { href: '/seller', label: 'Overview', icon: 'chart' },
  { href: '/seller/listings', label: 'Listings', icon: 'book' },
  { href: '/seller/orders', label: 'Orders', icon: 'package' },
  { href: '/seller/reviews', label: 'Reviews', icon: 'sparkle' },
];

const shell = (title, subtitle, content, actions = null) =>
  h('div', { class: 'container' },
    h('div', { class: 'page-head' },
      h('div', { class: 'page-head__row' },
        h('div', null, h('h1', null, title), subtitle ? h('p', { class: 'muted' }, subtitle) : null),
        actions)),
    h('div', { class: 'dash-layout' },
      h('aside', null,
        h('nav', { class: 'side-nav', 'aria-label': 'Seller sections' },
          NAV.map((item) =>
            h('a', {
              href: item.href,
              class: location.pathname === item.href ? 'is-active' : '',
            }, icon(item.icon, 15), item.label)),
          h('hr', { class: 'divider', style: { margin: '10px 0' } }),
          h('a', { href: '/seller/listings/new' }, icon('plus', 15), 'New listing'),
          store.user?.storeSlug ? h('a', { href: `/stores/${store.user.storeSlug}` }, icon('store', 15), 'Public storefront') : null)),
      h('div', null, content)));

export default async function sellerDashboard() {
  const page = h('div');
  const data = await api.get('/api/sellers/dashboard');
  const s = data.stats;

  const content = h('div', { class: 'stack-lg' },
    s.listings.pending
      ? alert(`${s.listings.pending} listing(s) are awaiting moderation and are not yet visible to buyers.`, 'info')
      : null,
    s.listings.rejected
      ? alert(`${s.listings.rejected} listing(s) were rejected. Open them to see the moderator note and resubmit.`, 'warn',
        h('a', { class: 'btn btn--ghost btn--sm', href: '/seller/listings?status=rejected' }, 'Review'))
      : null,

    h('div', { class: 'stat-grid' },
      statCard({ label: 'Gross revenue', value: money(s.revenueCents), hint: `${money(s.payoutCents)} payable after fees` }),
      statCard({ label: 'Units sold', value: number(s.units), hint: `${number(s.orders)} order(s)` }),
      statCard({
        label: 'Awaiting fulfilment', value: number(s.pendingFulfillment),
        hint: s.pendingFulfillment ? 'Needs packing or shipping' : 'All caught up',
        accent: s.pendingFulfillment ? 'var(--warn-fg)' : null,
      }),
      statCard({
        label: 'Seller rating',
        value: s.rating.count ? `${s.rating.average.toFixed(1)}★` : '—',
        hint: `${number(s.rating.count)} review(s)`,
      })),

    h('div', { class: 'grid', style: { gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)' } },
      h('section', { class: 'panel' },
        h('div', { class: 'panel__head' }, h('h2', null, 'Revenue, last 14 days')),
        h('div', { class: 'panel__body' }, sparkline(s.revenueSeries))),
      h('section', { class: 'panel' },
        h('div', { class: 'panel__head' }, h('h2', null, 'Catalogue')),
        h('div', { class: 'panel__body stack-sm' },
          detailRow('Active listings', number(s.listings.active)),
          detailRow('Pending review', number(s.listings.pending)),
          detailRow('Drafts', number(s.listings.draft)),
          detailRow('Archived', number(s.listings.archived)),
          detailRow('Units in stock', number(s.listings.stock)),
          detailRow('Books on loan', number(s.activeLoans)),
          detailRow('Listing views', number(s.listings.views))))),

    h('section', { class: 'panel' },
      h('div', { class: 'panel__head' }, h('h2', null, 'Best performing titles'), h('a', { class: 'btn btn--quiet btn--sm', href: '/seller/listings' }, 'All listings')),
      h('div', { class: 'panel__body' },
        s.topBooks.length
          ? barList(s.topBooks.map((book) => ({ label: book.title, value: book.units, href: `/books/${book.id}` })), { formatter: (v) => `${v} sold` })
          : h('p', { class: 'muted small' }, 'No sales yet - share your storefront link to get started.'))),

    h('div', { class: 'grid grid-2' },
      h('section', { class: 'panel' },
        h('div', { class: 'panel__head' }, h('h2', null, 'Recent orders'), h('a', { class: 'btn btn--quiet btn--sm', href: '/seller/orders' }, 'Manage')),
        h('div', { class: 'panel__body stack-sm' },
          data.recentOrders.length
            ? data.recentOrders.map((order) =>
              h('div', { class: 'row-between' },
                h('div', null,
                  h('a', { href: `/orders/${order.id}`, class: 'strong small' }, order.orderNumber),
                  h('div', { class: 'faint tiny' }, `${order.items.length} line(s) · ${relative(order.placedAt)}`)),
                h('div', { class: 'row', style: { gap: '8px' } }, statusBadge(order.status), h('b', { class: 'small' }, money(order.sellerSubtotalCents)))))
            : h('p', { class: 'muted small' }, 'No orders yet.'))),
      h('section', { class: 'panel' },
        h('div', { class: 'panel__head' }, h('h2', null, 'Latest reviews'), h('a', { class: 'btn btn--quiet btn--sm', href: '/seller/reviews' }, 'All')),
        h('div', { class: 'panel__body stack-sm' },
          data.recentReviews.length
            ? data.recentReviews.map((review) =>
              h('div', null,
                h('div', { class: 'row', style: { gap: '8px' } }, stars(review.rating), h('a', { href: `/books/${review.bookId}`, class: 'small truncate' }, review.bookTitle)),
                h('div', { class: 'faint tiny' }, `${review.author.name} · ${relative(review.createdAt)}`)))
            : h('p', { class: 'muted small' }, 'No reviews yet.')))),
  );

  mount(page, shell(
    store.user?.storeName || 'Seller dashboard',
    `Storefront overview${data.store ? ` · ${number(data.store.stats.listings)} live listing(s)` : ''}`,
    content,
    h('a', { class: 'btn', href: '/seller/listings/new' }, icon('plus', 16), 'New listing'),
  ));
  return page;
}

const detailRow = (label, value) =>
  h('div', { class: 'row-between small' }, h('span', { class: 'muted' }, label), h('b', null, value));

export async function sellerListings(ctx) {
  const page = h('div');
  const status = ctx.query.status || '';
  const host = h('div');

  const load = async () => {
    mount(host, spinner());
    const data = await api.get('/api/sellers/listings', { query: { status: status || undefined } });
    mount(host, 
      h('div', { class: 'tabs', style: { marginBottom: '16px' } },
        [['', 'All'], ['active', 'Active'], ['pending', 'Pending'], ['draft', 'Drafts'], ['rejected', 'Rejected'], ['archived', 'Archived']]
          .map(([value, label]) =>
            h('button', {
              'aria-selected': String(status === value),
              onClick: () => router.navigate(value ? `/seller/listings?status=${value}` : '/seller/listings'),
            }, label))),
      data.items.length
        ? h('div', { class: 'panel' },
          h('div', { class: 'table-wrap' },
            h('table', { class: 'table' },
              h('thead', null, h('tr', null,
                h('th', null, 'Book'), h('th', null, 'Price'), h('th', null, 'Stock'), h('th', null, 'Status'),
                h('th', null, 'Views'), h('th', null, 'Rating'), h('th', null, ''))),
              h('tbody', null, data.items.map((book) => listingRow(book, load))))))
        : emptyState({
          title: status ? `No ${status} listings` : 'You have no listings yet',
          body: 'Add your first book - it takes about a minute.',
          iconName: 'book',
          action: h('a', { class: 'btn', href: '/seller/listings/new' }, 'Create a listing'),
        }),
    );
  };

  await load();
  mount(page, shell('Your listings', 'Manage stock, prices and availability', host,
    h('a', { class: 'btn', href: '/seller/listings/new' }, icon('plus', 16), 'New listing')));
  return page;
}

function listingRow(book, reload) {
  const remove = asyncButton(icon('trash', 14), async () => {
    const ok = await confirmDialog({
      title: `Remove \u201c${book.title}\u201d?`,
      message: 'Listings with order history are archived instead of deleted so receipts stay intact.',
      confirmLabel: 'Remove listing',
      danger: true,
    });
    if (ok) {
      const res = await api.del(`/api/books/${book.id}`);
      store.success(res.archived ? 'Listing archived' : 'Listing deleted');
      await reload();
    }
  }, { class: 'btn--quiet btn--sm', title: 'Remove' });

  return h('tr', null,
    h('td', null, bookRow(book)),
    h('td', null,
      h('b', null, money(book.priceCents)),
      book.rentEnabled ? h('div', { class: 'faint tiny' }, `${money(book.rentWeeklyCents)}/wk`) : null),
    h('td', null,
      h('span', { class: book.stock ? '' : 'faint' }, `${number(book.stock)} sale`),
      book.rentEnabled ? h('div', { class: 'faint tiny' }, `${number(book.rentStock)} rental`) : null),
    h('td', null,
      statusBadge(book.status),
      book.moderationNote ? h('div', { class: 'faint tiny clamp-2', title: book.moderationNote }, book.moderationNote) : null),
    h('td', { class: 'faint' }, number(book.views)),
    h('td', null, book.rating.count ? stars(book.rating.average, { count: book.rating.count }) : h('span', { class: 'faint tiny' }, '\u2014')),
    h('td', null,
      h('div', { class: 'row', style: { gap: '4px' } },
        h('a', { class: 'btn btn--quiet btn--sm', href: `/seller/listings/${book.id}/edit`, title: 'Edit' }, icon('edit', 14)),
        h('a', { class: 'btn btn--quiet btn--sm', href: `/books/${book.id}`, title: 'View' }, icon('eye', 14)),
        remove)));
}

export async function sellerListingForm(ctx) {
  const page = h('div');
  const id = ctx.params.id ? Number(ctx.params.id) : null;
  const meta = store.state.meta;
  let existing = null;
  if (id) {
    const res = await api.get(`/api/books/${id}`);
    existing = res.book;
    if (existing.seller.id !== store.user.id && !store.isAdmin) {
      return shell('Not your listing', null, alert('That listing belongs to another seller.', 'error'));
    }
  }

  const model = {
    title: existing?.title || '',
    author: existing?.author || '',
    isbn: existing?.isbn || '',
    description: existing?.description || '',
    categoryId: existing?.category?.id || (meta?.categories?.[0]?.id ?? ''),
    condition: existing?.condition || 'good',
    format: existing?.format || 'paperback',
    language: existing?.language || 'English',
    publisher: existing?.publisher || '',
    publishedYear: existing?.publishedYear || '',
    pages: existing?.pages || '',
    price: existing ? (existing.priceCents / 100).toFixed(2) : '',
    saleEnabled: existing ? existing.saleEnabled : true,
    rentEnabled: existing ? existing.rentEnabled : false,
    rentWeekly: existing?.rentWeeklyCents ? (existing.rentWeeklyCents / 100).toFixed(2) : '',
    stock: existing ? existing.stock : 1,
    rentStock: existing ? existing.rentStock : 0,
    coverUrl: existing?.coverUrl?.startsWith('/uploads/') ? existing.coverUrl : '',
    status: existing?.status || 'pending',
  };

  const text = (label, key, props = {}) =>
    h('div', { class: `field${props.full ? ' form-grid--full' : ''}` },
      h('label', { class: 'label', for: `f-${key}` }, label, props.required ? ' *' : ''),
      props.tag === 'textarea'
        ? h('textarea', {
          class: 'textarea', id: `f-${key}`, name: key, value: model[key], maxlength: props.maxlength || 5000,
          placeholder: props.placeholder, onInput: (e) => { model[key] = e.target.value; },
        })
        : h('input', {
          class: 'input', id: `f-${key}`, name: key, type: props.type || 'text', value: model[key],
          placeholder: props.placeholder, min: props.min, max: props.max, step: props.step,
          onInput: (e) => { model[key] = props.type === 'number' ? e.target.value : e.target.value; },
        }),
      props.hint ? h('span', { class: 'field__hint' }, props.hint) : null);

  const select = (label, key, options) =>
    h('div', { class: 'field' },
      h('label', { class: 'label', for: `f-${key}` }, label),
      h('select', {
        class: 'select', id: `f-${key}`, name: key,
        onChange: (e) => { model[key] = e.target.value; },
      }, options.map((opt) =>
        h('option', { value: opt.value, selected: String(model[key]) === String(opt.value) }, opt.label))));

  const coverPreview = h('img', {
    class: 'preview-cover',
    src: model.coverUrl || (existing ? existing.coverUrl : '/assets/favicon.svg'),
    alt: 'Cover preview',
  });

  const fileInput = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return store.error('Images must be 2MB or smaller');
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read that file'));
      reader.readAsDataURL(file);
    });
    try {
      const res = await api.post('/api/sellers/uploads', { dataUrl });
      model.coverUrl = res.url;
      coverPreview.src = res.url;
      store.success('Cover uploaded');
    } catch (err) {
      store.error(err.message);
    }
  });

  const dropZone = h('div', {
    class: 'cover-drop',
    tabindex: '0',
    role: 'button',
    onClick: () => fileInput.click(),
    onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } },
    onDragOver: (e) => { e.preventDefault(); dropZone.classList.add('is-dragging'); },
    onDragLeave: () => dropZone.classList.remove('is-dragging'),
    onDrop: (e) => {
      e.preventDefault();
      dropZone.classList.remove('is-dragging');
      if (e.dataTransfer.files?.[0]) {
        fileInput.files = e.dataTransfer.files;
        fileInput.dispatchEvent(new Event('change'));
      }
    },
  }, icon('plus', 22), h('b', { class: 'small' }, 'Upload a cover image'), h('span', { class: 'tiny' }, 'PNG, JPEG or WebP up to 2MB. We generate one if you skip this.'));

  const rentFields = h('div', { class: 'form-grid' });
  const renderRentFields = () => {
    mount(rentFields, 
      model.rentEnabled
        ? h('div', { class: 'form-grid form-grid--full' },
          text('Weekly rent price ($)', 'rentWeekly', { type: 'number', min: '0', step: '0.01', required: true }),
          text('Rental copies', 'rentStock', { type: 'number', min: '0', step: '1' }))
        : null,
    );
  };
  renderRentFields();

  const form = h('form', { class: 'stack', onSubmit: (e) => e.preventDefault() },
    h('section', { class: 'panel' },
      h('div', { class: 'panel__head' }, h('h2', null, 'Book details')),
      h('div', { class: 'panel__body' },
        h('div', { class: 'form-grid' },
          text('Title', 'title', { required: true, full: true, placeholder: 'The Pragmatic Programmer' }),
          text('Author', 'author', { required: true, placeholder: 'Andrew Hunt' }),
          text('ISBN', 'isbn', { placeholder: '9780135957059', hint: '10 or 13 digits, optional' }),
          select('Category', 'categoryId', (meta?.categories || []).map((c) => ({ value: c.id, label: c.name }))),
          select('Condition', 'condition', (meta?.conditions || []).map((c) => ({ value: c.value, label: c.label }))),
          select('Format', 'format', (meta?.formats || []).map((f) => ({ value: f.value, label: f.label }))),
          text('Language', 'language'),
          text('Publisher', 'publisher'),
          text('Published year', 'publishedYear', { type: 'number', min: '1400', max: String(new Date().getFullYear() + 1) }),
          text('Pages', 'pages', { type: 'number', min: '1' }),
          text('Description', 'description', { tag: 'textarea', full: true, placeholder: 'Describe the book and the condition of your copy.' })))),

    h('section', { class: 'panel' },
      h('div', { class: 'panel__head' }, h('h2', null, 'Pricing and availability')),
      h('div', { class: 'panel__body stack' },
        h('div', { class: 'form-grid' },
          text('Sale price ($)', 'price', { type: 'number', min: '0', step: '0.01', required: true }),
          text('Copies in stock', 'stock', { type: 'number', min: '0', step: '1' })),
        h('label', { class: 'check' },
          h('input', {
            type: 'checkbox', checked: model.saleEnabled,
            onChange: (e) => { model.saleEnabled = e.target.checked; },
          }),
          h('span', null, h('b', null, 'Available to buy'), h('div', { class: 'faint tiny' }, 'Uncheck to make this a rental-only listing.'))),
        h('label', { class: 'check' },
          h('input', {
            type: 'checkbox', checked: model.rentEnabled,
            onChange: (e) => { model.rentEnabled = e.target.checked; renderRentFields(); },
          }),
          h('span', null, h('b', null, 'Available to borrow'), h('div', { class: 'faint tiny' }, 'Readers rent by the week and return the copy.'))),
        rentFields)),

    h('section', { class: 'panel' },
      h('div', { class: 'panel__head' }, h('h2', null, 'Cover image')),
      h('div', { class: 'panel__body row', style: { gap: '20px', alignItems: 'flex-start' } },
        coverPreview,
        h('div', { class: 'grow stack-sm' },
          dropZone,
          fileInput,
          model.coverUrl
            ? h('button', {
              class: 'btn btn--quiet btn--sm', type: 'button',
              onClick: () => { model.coverUrl = ''; coverPreview.src = '/assets/favicon.svg'; store.toast('Using a generated cover', 'info', 2200); },
            }, 'Use generated cover')
            : null))),
  );

  const save = async (status) => {
    const payload = {
      title: model.title,
      author: model.author,
      isbn: model.isbn || '',
      description: model.description || '',
      categoryId: model.categoryId ? Number(model.categoryId) : null,
      condition: model.condition,
      format: model.format,
      language: model.language || 'English',
      publisher: model.publisher || '',
      publishedYear: model.publishedYear ? Number(model.publishedYear) : undefined,
      pages: model.pages ? Number(model.pages) : undefined,
      priceCents: Math.round(Number(model.price || 0) * 100),
      saleEnabled: model.saleEnabled,
      rentEnabled: model.rentEnabled,
      rentWeeklyCents: model.rentEnabled ? Math.round(Number(model.rentWeekly || 0) * 100) : 0,
      stock: Number(model.stock || 0),
      rentStock: model.rentEnabled ? Number(model.rentStock || 0) : 0,
      coverUrl: model.coverUrl || '',
      status,
    };
    try {
      if (existing) {
        await api.patch(`/api/books/${existing.id}`, payload);
        store.success(status === 'draft' ? 'Draft saved' : 'Listing updated and queued for review');
      } else {
        await api.post('/api/books', payload);
        store.success(status === 'draft' ? 'Draft saved' : 'Listing submitted for review');
      }
      router.navigate('/seller/listings');
    } catch (err) {
      if (err.fields) applyFieldErrors(form, err.fields);
      store.error(err.message);
      throw err;
    }
  };

  const actions = h('div', { class: 'sticky-actions' },
    h('a', { class: 'btn btn--ghost', href: '/seller/listings' }, 'Cancel'),
    asyncButton('Save as draft', () => save('draft'), { class: 'btn--ghost' }),
    asyncButton(existing ? 'Save and submit' : 'Submit for review', () => save(store.isAdmin ? 'active' : 'pending')));

  mount(page, shell(
    existing ? `Edit “${existing.title}”` : 'New listing',
    existing
      ? `Status: ${titleCase(existing.status)}${existing.moderationNote ? ` · note: ${existing.moderationNote}` : ''}`
      : store.isAdmin ? 'Admin listings publish immediately.' : 'New listings are reviewed by a moderator before going live.',
    h('div', { class: 'stack' }, form, actions),
  ));
  return page;
}

export async function sellerOrders(ctx) {
  const page = h('div');
  const host = h('div');
  const status = ctx.query.status || '';

  const load = async () => {
    mount(host, spinner());
    const data = await api.get('/api/sellers/orders', { query: { status: status || undefined } });
    mount(host, 
      h('div', { class: 'tabs', style: { marginBottom: '16px' } },
        [['', 'All'], ['processing', 'To pack'], ['packed', 'To ship'], ['shipped', 'In transit'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled']]
          .map(([value, label]) =>
            h('button', {
              'aria-selected': String(status === value),
              onClick: () => router.navigate(value ? `/seller/orders?status=${value}` : '/seller/orders'),
            }, label))),
      data.items.length
        ? h('div', { class: 'stack' }, data.items.map((order) => sellerOrderCard(order, load)))
        : emptyState({
          title: status ? `Nothing ${status}` : 'No orders yet',
          body: 'Orders containing your listings appear here with fulfilment controls.',
          iconName: 'package',
        }),
    );
  };

  await load();
  mount(page, shell('Orders to fulfil', 'Move each line through packing, shipping and delivery', host));
  return page;
}

function sellerOrderCard(order, reload) {
  return h('article', { class: 'order-card' },
    h('div', { class: 'order-card__head' },
      h('div', null,
        h('a', { href: `/orders/${order.id}`, class: 'strong' }, order.orderNumber),
        h('div', { class: 'faint tiny' },
          `${order.customer?.name || 'Customer'} · ${dateShort(order.placedAt)} · ${titleCase(order.shippingMethod)} shipping`)),
      h('div', { class: 'row', style: { gap: '8px' } }, statusBadge(order.status), h('b', null, money(order.sellerSubtotalCents)))),
    h('div', { class: 'stack-sm' }, order.items.map((item) => {
      const next = { processing: 'packed', packed: 'shipped', shipped: 'delivered' }[item.fulfillment];
      return h('div', { class: 'row-between', style: { borderTop: '1px solid var(--border)', paddingTop: '10px' } },
        h('div', { class: 'row', style: { gap: '10px' } },
          h('img', { src: item.coverUrl, alt: '', width: 36, height: 54, style: { borderRadius: '4px', objectFit: 'cover' }, loading: 'lazy' }),
          h('div', null,
            h('b', { class: 'small' }, item.title),
            h('div', { class: 'faint tiny' },
              item.mode === 'rent' ? `Rental · ${item.rentWeeks} weeks` : `Qty ${item.quantity}`, ` · ${money(item.lineCents)}`))),
        h('div', { class: 'row', style: { gap: '6px' } },
          statusBadge(item.fulfillment),
          next
            ? asyncButton(`Mark ${next}`, async () => {
              await api.patch(`/api/orders/${order.id}/items/${item.id}`, { fulfillment: next });
              store.success(`Marked ${next}`);
              await reload();
            }, { class: 'btn--sm' })
            : null,
          item.fulfillment === 'processing'
            ? asyncButton('Cancel', async () => {
              const ok = await confirmDialog({
                title: 'Cancel this line?', message: 'Stock returns to your listing and the buyer is refunded for that line.',
                confirmLabel: 'Cancel line', danger: true,
              });
              if (ok) {
                await api.patch(`/api/orders/${order.id}/items/${item.id}`, { fulfillment: 'cancelled' });
                store.success('Line cancelled');
                await reload();
              }
            }, { class: 'btn--ghost btn--sm' })
            : null));
    })),
    h('div', { class: 'row' },
      h('a', { class: 'btn btn--quiet btn--sm', href: `/orders/${order.id}` }, 'Open order'),
      order.address ? h('span', { class: 'faint tiny' }, `Ship to ${order.address.city}, ${order.address.country}`) : null),
  );
}

export async function sellerReviews() {
  const page = h('div');
  const data = await api.get('/api/sellers/reviews');

  const card = (review) => h('article', { class: 'card card--pad' },
    h('div', { class: 'row-between' },
      h('div', { class: 'row', style: { gap: '10px' } },
        stars(review.rating),
        h('a', { href: `/books/${review.bookId}`, class: 'strong' }, review.bookTitle)),
      h('span', { class: 'faint tiny' }, relative(review.createdAt))),
    review.title ? h('b', null, review.title) : null,
    review.body ? h('p', { class: 'muted small' }, review.body) : null,
    h('div', { class: 'faint tiny' }, `${review.author.name}${review.verified ? ' \u00b7 verified purchase' : ''}`));

  const content = data.items.length
    ? h('div', { class: 'panel' }, h('div', { class: 'panel__body stack' }, data.items.map(card)))
    : emptyState({ title: 'No reviews yet', body: 'Reviews appear as buyers rate the books you sold.', iconName: 'sparkle' });

  mount(page, shell('Customer reviews', 'What buyers say about your listings', content));
  return page;
}
