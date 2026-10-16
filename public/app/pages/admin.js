import { h, icon, money, number, dateShort, relative, titleCase, mount } from '../dom.js';
import { api } from '../api.js';
import { store } from '../store.js';

import { alert, applyFieldErrors, asyncButton, badge, barList, confirmDialog, emptyState, modal, pagination, spinner, sparkline, statCard, statusBadge } from '../components/ui.js';

const NAV = [
  { href: '/admin', label: 'Overview', icon: 'chart' },
  { href: '/admin/moderation', label: 'Moderation', icon: 'shield' },
  { href: '/admin/orders', label: 'Orders', icon: 'package' },
  { href: '/admin/users', label: 'Users', icon: 'user' },
  { href: '/admin/coupons', label: 'Promotions', icon: 'tag' },
  { href: '/admin/categories', label: 'Categories', icon: 'grid' },
];

const shell = (title, subtitle, content, actions = null) =>
  h('div', { class: 'container' },
    h('div', { class: 'page-head' },
      h('div', { class: 'page-head__row' },
        h('div', null,
          h('h1', null, title),
          subtitle ? h('p', { class: 'muted' }, subtitle) : null),
        actions)),
    h('div', { class: 'dash-layout' },
      h('aside', null,
        h('nav', { class: 'side-nav', 'aria-label': 'Admin sections' },
          NAV.map((item) =>
            h('a', { href: item.href, class: location.pathname === item.href ? 'is-active' : '' },
              icon(item.icon, 15), item.label)))),
      h('div', null, content)));

export default async function adminDashboard() {
  const d = await api.get('/api/admin/dashboard');

  const content = h('div', { class: 'stack-lg' },
    d.books.pending
      ? alert(`${d.books.pending} listing(s) are waiting for moderation.`, 'warn',
        h('a', { class: 'btn btn--sm', href: '/admin/moderation' }, 'Review now'))
      : null,
    d.loans.overdue
      ? alert(`${d.loans.overdue} loan(s) are overdue across the platform.`, 'info')
      : null,

    h('div', { class: 'stat-grid' },
      statCard({ label: 'Gross merchandise value', value: money(d.gmvCents), hint: `${number(d.orders)} paid order(s)` }),
      statCard({ label: 'Platform revenue', value: money(d.platformFeeCents), hint: '10% commission' }),
      statCard({ label: 'Average order value', value: money(d.aovCents), hint: 'Across all non-refunded orders' }),
      statCard({ label: 'Active listings', value: number(d.books.active), hint: `${number(d.books.total)} total · ${number(d.books.stock)} units in stock` })),

    h('div', { class: 'grid', style: { gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)' } },
      h('section', { class: 'panel' },
        h('div', { class: 'panel__head' }, h('h2', null, 'Revenue, last 14 days')),
        h('div', { class: 'panel__body' }, sparkline(d.revenueSeries))),
      h('section', { class: 'panel' },
        h('div', { class: 'panel__head' }, h('h2', null, 'Community')),
        h('div', { class: 'panel__body stack-sm' },
          row('Readers', number(d.users.total)),
          row('Sellers', number(d.users.sellers)),
          row('Admins', number(d.users.admins)),
          row('Suspended', number(d.users.suspended)),
          row('New this week', number(d.users.newThisWeek)),
          row('Reviews', `${number(d.reviews.c)}${d.reviews.avg ? ` · avg ${Number(d.reviews.avg).toFixed(1)}★` : ''}`),
          row('Active loans', number(d.loans.active)),
          row('Overdue loans', number(d.loans.overdue))))),

    h('div', { class: 'grid grid-2' },
      h('section', { class: 'panel' },
        h('div', { class: 'panel__head' }, h('h2', null, 'Top sellers by revenue')),
        h('div', { class: 'panel__body' },
          barList(d.topSellers.map((s) => ({
            label: s.name, value: s.revenueCents, href: s.slug ? `/stores/${s.slug}` : null,
          })), { formatter: money }))),
      h('section', { class: 'panel' },
        h('div', { class: 'panel__head' }, h('h2', null, 'Best selling titles')),
        h('div', { class: 'panel__body' },
          barList(d.topBooks.map((b) => ({ label: b.title, value: b.units, href: `/books/${b.id}` })), { formatter: (v) => `${v} sold` })))),

    h('div', { class: 'grid grid-2' },
      h('section', { class: 'panel' },
        h('div', { class: 'panel__head' }, h('h2', null, 'Orders by status')),
        h('div', { class: 'panel__body' },
          barList(d.orderStatus.map((s) => ({ label: titleCase(s.status), value: s.count })))),
      ),
      h('section', { class: 'panel' },
        h('div', { class: 'panel__head' }, h('h2', null, 'Catalogue by category')),
        h('div', { class: 'panel__body' },
          barList(d.categories.map((c) => ({ label: c.name, value: c.count }))))),
    ),

    h('section', { class: 'panel' },
      h('div', { class: 'panel__head' }, h('h2', null, 'Maintenance')),
      h('div', { class: 'panel__body row-between' },
        h('p', { class: 'muted small' }, 'Send due-soon and overdue reminders to every borrower now.'),
        asyncButton('Run loan reminder sweep', async () => {
          const res = await api.post('/api/admin/maintenance/loan-sweep');
          store.success(`Checked ${res.checked} loan(s), sent ${res.notified} reminder(s)`);
        }, { class: 'btn--ghost btn--sm' }))),
  );

  return shell('Admin console', 'Platform health, moderation and operations', content);
}

const row = (label, value) =>
  h('div', { class: 'row-between small' }, h('span', { class: 'muted' }, label), h('b', null, value));

export async function adminModeration() {
  const host = h('div');

  const load = async () => {
    mount(host, spinner());
    const data = await api.get('/api/admin/moderation');
    mount(host, 
      data.items.length
        ? h('div', { class: 'stack' }, data.items.map((book) => moderationCard(book, load)))
        : emptyState({ title: 'Nothing to moderate', body: 'Every listing has been reviewed.', iconName: 'check' }),
    );
  };

  await load();
  return shell('Listing moderation', 'Approve or reject listings submitted by sellers', host);
}

function moderationCard(book, reload) {
  const noteInput = h('input', { class: 'input', placeholder: 'Reason (shown to the seller)', name: 'note' });

  const decide = (status, label, variant) =>
    asyncButton(label, async () => {
      if (status === 'rejected' && !noteInput.value.trim()) {
        store.warn('Add a short reason so the seller can fix the listing');
        noteInput.focus();
        return;
      }
      await api.post(`/api/admin/books/${book.id}/moderate`, { status, note: noteInput.value.trim() });
      store.success(`Listing ${status}`);
      await reload();
    }, { class: variant });

  return h('article', { class: 'card card--pad stack' },
    h('div', { class: 'row-between' },
      h('div', { class: 'row', style: { gap: '12px' } },
        h('img', { src: book.coverUrl, alt: '', width: 56, height: 84, style: { borderRadius: '4px', objectFit: 'cover' } }),
        h('div', null,
          h('a', { href: `/books/${book.id}`, class: 'strong' }, book.title),
          h('div', { class: 'faint' }, `${book.author} · ${titleCase(book.format)} · ${titleCase(book.condition)}`),
          h('div', { class: 'row', style: { gap: '8px', marginTop: '6px' } },
            statusBadge(book.status),
            badge(money(book.priceCents), 'brand'),
            book.rentEnabled ? badge(`${money(book.rentWeeklyCents)}/wk`, 'accent') : null,
            badge(`${number(book.stock)} in stock`)))),
      h('div', { style: { textAlign: 'right' } },
        h('div', { class: 'small' }, book.seller.storeName),
        h('div', { class: 'faint tiny' }, `Submitted ${relative(book.createdAt)}`))),
    book.description ? h('p', { class: 'muted small clamp-3' }, book.description) : h('p', { class: 'faint small' }, 'No description provided.'),
    book.moderationNote ? alert(`Previous note: ${book.moderationNote}`, 'warn') : null,
    h('div', { class: 'row wrap' },
      noteInput,
      decide('active', 'Approve', ''),
      decide('rejected', 'Reject', 'btn--danger'),
      decide('archived', 'Archive', 'btn--ghost')),
  );
}

export async function adminUsers(ctx) {
  const host = h('div');
  const state = { q: ctx.query.q || '', role: ctx.query.role || '', status: ctx.query.status || '', page: Number(ctx.query.page) || 1 };

  const load = async () => {
    mount(host, spinner());
    const data = await api.get('/api/admin/users', {
      query: { q: state.q || undefined, role: state.role || undefined, status: state.status || undefined, page: state.page, perPage: 15 },
    });
    mount(host, 
      h('div', { class: 'panel' },
        h('div', { class: 'panel__head' },
          h('div', { class: 'row wrap' },
            h('input', {
              class: 'input', placeholder: 'Search name, email or store', value: state.q, style: { maxWidth: '260px' },
              onInput: (e) => { state.q = e.target.value; },
              onKeyDown: (e) => { if (e.key === 'Enter') { state.page = 1; load(); } },
            }),
            h('select', {
              class: 'select', style: { maxWidth: '150px' },
              onChange: (e) => { state.role = e.target.value; state.page = 1; load(); },
            }, [['', 'All roles'], ['customer', 'Customers'], ['seller', 'Sellers'], ['admin', 'Admins']]
              .map(([value, label]) => h('option', { value, selected: state.role === value }, label))),
            h('select', {
              class: 'select', style: { maxWidth: '150px' },
              onChange: (e) => { state.status = e.target.value; state.page = 1; load(); },
            }, [['', 'Any status'], ['active', 'Active'], ['suspended', 'Suspended']]
              .map(([value, label]) => h('option', { value, selected: state.status === value }, label))),
            h('button', { class: 'btn btn--ghost btn--sm', onClick: () => { state.page = 1; load(); } }, 'Apply')),
          h('span', { class: 'faint small' }, `${number(data.total)} user(s)`)),
        h('div', { class: 'table-wrap' },
          h('table', { class: 'table' },
            h('thead', null, h('tr', null,
              h('th', null, 'User'), h('th', null, 'Role'), h('th', null, 'Status'), h('th', null, 'Listings'),
              h('th', null, 'Orders'), h('th', null, 'Spend'), h('th', null, 'Joined'), h('th', null, ''))),
            h('tbody', null, data.items.map((user) => userRow(user, load))))),
        h('div', { class: 'panel__body' },
          pagination({ page: data.page, totalPages: data.totalPages, onChange: (p) => { state.page = p; load(); } }))),
    );
  };

  await load();
  return shell('Users', 'Roles, suspensions and account activity', host);
}

function userRow(user, reload) {
  const isSelf = user.id === store.user?.id;
  return h('tr', null,
    h('td', null,
      h('b', { class: 'small' }, user.name),
      h('div', { class: 'faint tiny' }, user.email),
      user.storeName ? h('div', { class: 'faint tiny' }, `Store: ${user.storeName}`) : null),
    h('td', null,
      h('select', {
        class: 'select', style: { minWidth: '120px' }, disabled: isSelf,
        onChange: async (e) => {
          try {
            await api.patch(`/api/admin/users/${user.id}/role`, { role: e.target.value });
            store.success(`${user.name} is now ${e.target.value}`);
            await reload();
          } catch (err) {
            store.error(err.message);
            await reload();
          }
        },
      }, ['customer', 'seller', 'admin'].map((role) =>
        h('option', { value: role, selected: user.role === role }, titleCase(role))))),
    h('td', null, statusBadge(user.status)),
    h('td', null, number(user.listingCount)),
    h('td', null, number(user.orderCount)),
    h('td', null, money(user.spendCents)),
    h('td', { class: 'faint tiny' }, dateShort(user.memberSince)),
    h('td', null,
      isSelf
        ? badge('You', 'brand')
        : asyncButton(user.status === 'active' ? 'Suspend' : 'Restore', async () => {
          const next = user.status === 'active' ? 'suspended' : 'active';
          const ok = await confirmDialog({
            title: next === 'suspended' ? `Suspend ${user.name}?` : `Restore ${user.name}?`,
            message: next === 'suspended'
              ? 'Their sessions end immediately and any active listings are archived.'
              : 'They regain access. Archived listings stay archived until they republish them.',
            confirmLabel: next === 'suspended' ? 'Suspend account' : 'Restore account',
            danger: next === 'suspended',
          });
          if (ok) {
            await api.patch(`/api/admin/users/${user.id}/status`, { status: next });
            store.success(next === 'suspended' ? 'Account suspended' : 'Account restored');
            await reload();
          }
        }, { class: user.status === 'active' ? 'btn--ghost btn--sm' : 'btn--sm' })));
}

export async function adminOrders(ctx) {
  const host = h('div');
  const state = { q: ctx.query.q || '', status: ctx.query.status || '', page: Number(ctx.query.page) || 1 };

  const load = async () => {
    mount(host, spinner());
    const data = await api.get('/api/admin/orders', {
      query: { q: state.q || undefined, status: state.status || undefined, page: state.page, perPage: 15 },
    });
    mount(host, 
      h('div', { class: 'panel' },
        h('div', { class: 'panel__head' },
          h('div', { class: 'row wrap' },
            h('input', {
              class: 'input', placeholder: 'Order number, customer or email', value: state.q, style: { maxWidth: '280px' },
              onInput: (e) => { state.q = e.target.value; },
              onKeyDown: (e) => { if (e.key === 'Enter') { state.page = 1; load(); } },
            }),
            h('select', {
              class: 'select', style: { maxWidth: '160px' },
              onChange: (e) => { state.status = e.target.value; state.page = 1; load(); },
            }, [['', 'All statuses'], ['paid', 'Paid'], ['packed', 'Packed'], ['shipped', 'Shipped'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled'], ['refunded', 'Refunded']]
              .map(([value, label]) => h('option', { value, selected: state.status === value }, label))),
            h('button', { class: 'btn btn--ghost btn--sm', onClick: () => { state.page = 1; load(); } }, 'Search')),
          h('span', { class: 'faint small' }, `${number(data.total)} order(s)`)),
        h('div', { class: 'table-wrap' },
          h('table', { class: 'table' },
            h('thead', null, h('tr', null,
              h('th', null, 'Order'), h('th', null, 'Customer'), h('th', null, 'Items'), h('th', null, 'Total'),
              h('th', null, 'Status'), h('th', null, 'Placed'), h('th', null, ''))),
            h('tbody', null, data.items.map((order) =>
              h('tr', null,
                h('td', null, h('a', { href: `/orders/${order.id}`, class: 'strong small' }, order.orderNumber)),
                h('td', null,
                  h('div', { class: 'small' }, order.customer?.name || '—'),
                  h('div', { class: 'faint tiny' }, order.customer?.email || '')),
                h('td', null, number(order.items.length)),
                h('td', null, h('b', null, money(order.totalCents))),
                h('td', null, statusBadge(order.status)),
                h('td', { class: 'faint tiny' }, dateShort(order.placedAt)),
                h('td', null, h('a', { class: 'btn btn--quiet btn--sm', href: `/orders/${order.id}` }, 'Open')))))),
        ),
        h('div', { class: 'panel__body' },
          pagination({ page: data.page, totalPages: data.totalPages, onChange: (p) => { state.page = p; load(); } }))),
    );
  };

  await load();
  return shell('All orders', 'Search, inspect and refund any order', host);
}

export async function adminCoupons() {
  const host = h('div');

  const load = async () => {
    mount(host, spinner());
    const data = await api.get('/api/admin/coupons');
    mount(host, 
      h('div', { class: 'panel' },
        h('div', { class: 'panel__head' },
          h('h2', null, `Promo codes (${number(data.items.length)})`),
          h('button', { class: 'btn btn--sm', onClick: () => openForm(null, load) }, icon('plus', 15), 'New code')),
        data.items.length
          ? h('div', { class: 'table-wrap' },
            h('table', { class: 'table' },
              h('thead', null, h('tr', null,
                h('th', null, 'Code'), h('th', null, 'Discount'), h('th', null, 'Conditions'), h('th', null, 'Used'),
                h('th', null, 'Expires'), h('th', null, 'Active'), h('th', null, ''))),
              h('tbody', null, data.items.map((coupon) => couponRow(coupon, load)))))
          : h('div', { class: 'panel__body' }, emptyState({ title: 'No promo codes', body: 'Create one to run a campaign.', iconName: 'tag' }))),
    );
  };

  await load();
  return shell('Promotions', 'Discount codes applied at checkout', host);
}

function couponRow(coupon, reload) {
  return h('tr', null,
    h('td', null, h('code', { class: 'strong' }, coupon.code), h('div', { class: 'faint tiny' }, coupon.description)),
    h('td', null, coupon.kind === 'percent' ? `${coupon.value}% off` : `${money(coupon.value)} off`),
    h('td', { class: 'faint tiny' },
      coupon.minSubtotalCents ? `Min spend ${money(coupon.minSubtotalCents)}` : 'No minimum',
      coupon.maxDiscountCents ? h('div', null, `Capped at ${money(coupon.maxDiscountCents)}`) : null),
    h('td', null, `${number(coupon.usedCount)}${coupon.usageLimit ? ` / ${number(coupon.usageLimit)}` : ''}`),
    h('td', { class: 'faint tiny' }, coupon.expiresAt ? dateShort(coupon.expiresAt) : 'Never'),
    h('td', null, coupon.active ? badge('Active', 'success') : badge('Paused', '')),
    h('td', null,
      h('div', { class: 'row', style: { gap: '4px' } },
        h('button', { class: 'btn btn--quiet btn--sm', onClick: () => openForm(coupon, reload) }, icon('edit', 14)),
        asyncButton(coupon.active ? 'Pause' : 'Resume', async () => {
          await api.patch(`/api/admin/coupons/${coupon.id}`, { active: !coupon.active });
          store.success(coupon.active ? 'Code paused' : 'Code resumed');
          await reload();
        }, { class: 'btn--quiet btn--sm' }),
        asyncButton(icon('trash', 14), async () => {
          const ok = await confirmDialog({
            title: `Delete ${coupon.code}?`, message: 'Existing orders keep their discount; the code stops working.',
            confirmLabel: 'Delete code', danger: true,
          });
          if (ok) {
            await api.del(`/api/admin/coupons/${coupon.id}`);
            store.success('Code deleted');
            await reload();
          }
        }, { class: 'btn--quiet btn--sm' }))));
}

function openForm(existing, reload) {
  const model = existing
    ? {
      code: existing.code, description: existing.description, kind: existing.kind, value: existing.value,
      minSubtotal: existing.minSubtotalCents / 100, maxDiscount: existing.maxDiscountCents / 100,
      usageLimit: existing.usageLimit, active: existing.active,
    }
    : { code: '', description: '', kind: 'percent', value: 10, minSubtotal: 0, maxDiscount: 0, usageLimit: 0, active: true };

  const input = (label, key, props = {}) =>
    h('div', { class: `field${props.full ? ' form-grid--full' : ''}` },
      h('label', { class: 'label' }, label),
      h('input', {
        class: 'input', name: key, type: props.type || 'text', value: model[key] ?? '',
        step: props.step, min: props.min, disabled: props.disabled,
        onInput: (e) => { model[key] = props.type === 'number' ? Number(e.target.value) : e.target.value; },
      }),
      props.hint ? h('span', { class: 'field__hint' }, props.hint) : null);

  const form = h('form', { class: 'form-grid', onSubmit: (e) => e.preventDefault() },
    input('Code', 'code', { disabled: Boolean(existing), hint: existing ? 'Codes cannot be renamed' : 'Letters, numbers and dashes' }),
    h('div', { class: 'field' },
      h('label', { class: 'label' }, 'Type'),
      h('select', {
        class: 'select', name: 'kind',
        onChange: (e) => { model.kind = e.target.value; },
      }, [['percent', 'Percentage off'], ['fixed', 'Fixed amount off']].map(([value, label]) =>
        h('option', { value, selected: model.kind === value }, label)))),
    input('Value', 'value', { type: 'number', min: '1', hint: 'Percent (1-90) or cents for fixed amounts' }),
    input('Minimum spend ($)', 'minSubtotal', { type: 'number', min: '0', step: '0.01' }),
    input('Maximum discount ($)', 'maxDiscount', { type: 'number', min: '0', step: '0.01', hint: '0 means uncapped' }),
    input('Usage limit', 'usageLimit', { type: 'number', min: '0', hint: '0 means unlimited' }),
    input('Description', 'description', { full: true }),
    h('label', { class: 'check form-grid--full' },
      h('input', { type: 'checkbox', checked: model.active, onChange: (e) => { model.active = e.target.checked; } }),
      h('span', null, 'Active and usable at checkout')));

  const dialog = modal({
    title: existing ? `Edit ${existing.code}` : 'New promo code',
    body: form,
    footer: [
      h('button', { class: 'btn btn--ghost', onClick: () => dialog.close() }, 'Cancel'),
      asyncButton(existing ? 'Save changes' : 'Create code', async () => {
        const payload = {
          description: model.description,
          kind: model.kind,
          value: Number(model.value),
          minSubtotalCents: Math.round(Number(model.minSubtotal || 0) * 100),
          maxDiscountCents: Math.round(Number(model.maxDiscount || 0) * 100),
          usageLimit: Number(model.usageLimit || 0),
          active: model.active,
        };
        try {
          if (existing) await api.patch(`/api/admin/coupons/${existing.id}`, payload);
          else await api.post('/api/admin/coupons', { ...payload, code: model.code });
          dialog.close();
          store.success(existing ? 'Code updated' : 'Code created');
          await reload();
        } catch (err) {
          if (err.fields) applyFieldErrors(form, err.fields);
          throw err;
        }
      }),
    ],
  });
}

export async function adminCategories() {
  const host = h('div');

  const refreshMeta = async () => {
    const meta = await api.get('/api/meta');
    store.setMeta(meta);
  };

  const load = async () => {
    mount(host, spinner());
    const data = await api.get('/api/categories');
    mount(host, 
      h('div', { class: 'panel' },
        h('div', { class: 'panel__head' },
          h('h2', null, `Categories (${number(data.items.length)})`),
          h('button', {
            class: 'btn btn--sm',
            onClick: () => openCategoryForm(null, load, refreshMeta),
          }, icon('plus', 15), 'New category')),
        h('div', { class: 'table-wrap' },
          h('table', { class: 'table' },
            h('thead', null, h('tr', null,
              h('th', null, 'Name'), h('th', null, 'Slug'), h('th', null, 'Description'),
              h('th', null, 'Live books'), h('th', null, ''))),
            h('tbody', null, data.items.map((category) => categoryRow(category, load, refreshMeta)))))),
    );
  };

  await load();
  return shell('Categories', 'How the catalogue is organised for shoppers', host);
}

function categoryRow(category, reload, refreshMeta) {
  const remove = asyncButton(icon('trash', 14), async () => {
    const ok = await confirmDialog({
      title: `Delete ${category.name}?`,
      message: category.bookCount
        ? `${category.bookCount} listing(s) will become uncategorised.`
        : 'This category is empty.',
      confirmLabel: 'Delete category',
      danger: true,
    });
    if (ok) {
      await api.del(`/api/admin/categories/${category.id}`);
      store.success('Category deleted');
      await refreshMeta();
      await reload();
    }
  }, { class: 'btn--quiet btn--sm' });

  return h('tr', null,
    h('td', null, h('b', { class: 'small' }, category.name)),
    h('td', null, h('code', { class: 'tiny' }, category.slug)),
    h('td', { class: 'faint tiny clamp-2' }, category.description || '\u2014'),
    h('td', null, number(category.bookCount)),
    h('td', null,
      h('div', { class: 'row', style: { gap: '4px' } },
        h('a', { class: 'btn btn--quiet btn--sm', href: `/browse?category=${category.slug}` }, icon('eye', 14)),
        h('button', {
          class: 'btn btn--quiet btn--sm',
          onClick: () => openCategoryForm(category, reload, refreshMeta),
        }, icon('edit', 14)),
        remove)));
}

function openCategoryForm(existing, reload, refreshMeta) {
  const model = existing
    ? { name: existing.name, slug: existing.slug, description: existing.description, icon: existing.icon }
    : { name: '', slug: '', description: '', icon: 'book' };

  const slugInput = h('input', {
    class: 'input', name: 'slug', value: model.slug,
    onInput: (e) => { model.slug = e.target.value; },
  });
  const nameInput = h('input', {
    class: 'input', name: 'name', value: model.name,
    onInput: (e) => {
      model.name = e.target.value;
      if (!existing) {
        model.slug = e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        slugInput.value = model.slug;
      }
    },
  });

  const form = h('form', { class: 'form-grid', onSubmit: (e) => e.preventDefault() },
    h('div', { class: 'field' }, h('label', { class: 'label' }, 'Name'), nameInput),
    h('div', { class: 'field' }, h('label', { class: 'label' }, 'Slug'), slugInput),
    h('div', { class: 'field form-grid--full' },
      h('label', { class: 'label' }, 'Description'),
      h('input', {
        class: 'input', name: 'description', value: model.description,
        onInput: (e) => { model.description = e.target.value; },
      })));

  const dialog = modal({
    title: existing ? `Edit ${existing.name}` : 'New category',
    body: form,
    footer: [
      h('button', { class: 'btn btn--ghost', onClick: () => dialog.close() }, 'Cancel'),
      asyncButton(existing ? 'Save' : 'Create', async () => {
        try {
          if (existing) await api.patch(`/api/admin/categories/${existing.id}`, model);
          else await api.post('/api/admin/categories', model);
          dialog.close();
          store.success(existing ? 'Category updated' : 'Category created');
          await refreshMeta();
          await reload();
        } catch (err) {
          if (err.fields) applyFieldErrors(form, err.fields);
          throw err;
        }
      }),
    ],
  });
}
