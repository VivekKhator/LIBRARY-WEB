import { h, icon, dateShort, relative, number, mount } from '../dom.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { router } from '../main.js';
import { applyFieldErrors, asyncButton, avatar, badge, confirmDialog, emptyState, modal, spinner, statusBadge, stars } from '../components/ui.js';

const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'addresses', label: 'Addresses' },
  { id: 'security', label: 'Security' },
  { id: 'reviews', label: 'My reviews' },
  { id: 'notifications', label: 'Notifications' },
];

export default async function accountPage(ctx) {
  const page = h('div', { class: 'container' });
  const body = h('div');
  let active = ctx.query.tab && TABS.some((t) => t.id === ctx.query.tab) ? ctx.query.tab : 'profile';

  const renderTab = async () => {
    mount(body, spinner());
    const user = store.user;
    const views = {
      profile: () => profileTab(user),
      addresses: () => addressesTab(),
      security: () => securityTab(),
      reviews: () => reviewsTab(),
      notifications: () => notificationsTab(),
    };
    mount(body, await views[active]());
  };

  const tabs = h('div', { class: 'tabs', style: { marginBottom: '20px' } },
    TABS.map((tab) =>
      h('button', {
        'aria-selected': String(active === tab.id),
        onClick: async (e) => {
          active = tab.id;
          router.setQuery({ tab: tab.id });
          tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b === e.currentTarget)));
          await renderTab();
        },
      }, tab.label)));

  mount(page, 
    h('div', { class: 'page-head' },
      h('div', { class: 'row', style: { gap: '14px' } },
        avatar(store.user?.name, { large: true }),
        h('div', null,
          h('h1', null, store.user?.name || 'Your account'),
          h('p', { class: 'muted' },
            store.user?.email,
            ' · ', statusBadge(store.user?.role || 'customer'),
            ' · member since ', dateShort(store.user?.memberSince))))),
    tabs,
    body,
  );
  await renderTab();
  return page;
}

function profileTab(user) {
  const model = { name: user.name, bio: user.bio || '' };
  const form = h('form', { class: 'stack', onSubmit: (e) => e.preventDefault() },
    h('div', { class: 'form-grid' },
      h('div', { class: 'field' },
        h('label', { for: 'name' }, 'Display name'),
        h('input', { class: 'input', id: 'name', name: 'name', value: model.name, onInput: (e) => { model.name = e.target.value; } })),
      h('div', { class: 'field' },
        h('label', { for: 'email' }, 'Email'),
        h('input', { class: 'input', id: 'email', value: user.email, disabled: true }),
        h('span', { class: 'field__hint' }, 'Contact support to change the email on an account.'))),
    h('div', { class: 'field' },
      h('label', { for: 'bio' }, 'About you'),
      h('textarea', {
        class: 'textarea', id: 'bio', name: 'bio', maxlength: '500', value: model.bio,
        placeholder: 'What do you read?', onInput: (e) => { model.bio = e.target.value; },
      })),
  );
  const save = asyncButton('Save profile', async () => {
    try {
      const res = await api.patch('/api/auth/me', model);
      store.setUser(res.user);
      store.success('Profile updated');
    } catch (err) {
      if (err.fields) applyFieldErrors(form, err.fields);
      throw err;
    }
  });

  const storeForm = store.isSeller ? storeSection(user) : sellerPrompt();

  return h('div', { class: 'stack-lg' },
    h('section', { class: 'panel' },
      h('div', { class: 'panel__head' }, h('h2', null, 'Profile')),
      h('div', { class: 'panel__body stack' }, form, h('div', { class: 'row' }, save))),
    storeForm,
  );
}

function storeSection(user) {
  const model = { storeName: user.storeName || '', storeBio: user.storeBio || '' };
  const form = h('form', { class: 'stack', onSubmit: (e) => e.preventDefault() },
    h('div', { class: 'field' },
      h('label', { for: 'storeName' }, 'Storefront name'),
      h('input', { class: 'input', id: 'storeName', name: 'storeName', value: model.storeName, onInput: (e) => { model.storeName = e.target.value; } })),
    h('div', { class: 'field' },
      h('label', { for: 'storeBio' }, 'Storefront description'),
      h('textarea', { class: 'textarea', id: 'storeBio', name: 'storeBio', value: model.storeBio, onInput: (e) => { model.storeBio = e.target.value; } })),
  );
  return h('section', { class: 'panel' },
    h('div', { class: 'panel__head' },
      h('h2', null, 'Your storefront'),
      user.storeSlug ? h('a', { class: 'btn btn--ghost btn--sm', href: `/stores/${user.storeSlug}` }, 'View public page') : null),
    h('div', { class: 'panel__body stack' },
      form,
      h('div', { class: 'row' },
        asyncButton('Save storefront', async () => {
          try {
            const res = await api.patch('/api/sellers/store', model);
            store.setUser(res.user);
            store.success('Storefront updated');
          } catch (err) {
            if (err.fields) applyFieldErrors(form, err.fields);
            throw err;
          }
        }),
        h('a', { class: 'btn btn--ghost', href: '/seller' }, 'Seller dashboard'))));
}

const sellerPrompt = () =>
  h('section', { class: 'panel' },
    h('div', { class: 'panel__head' }, h('h2', null, 'Start selling')),
    h('div', { class: 'panel__body row-between' },
      h('p', { class: 'muted' }, 'Open a storefront to list books for sale or rental.'),
      h('a', { class: 'btn', href: '/sell' }, icon('store', 16), 'Open a storefront')));

async function addressesTab() {
  const host = h('div');

  const load = async () => {
    const data = await api.get('/api/addresses');
    mount(host, 
      h('section', { class: 'panel' },
        h('div', { class: 'panel__head' },
          h('h2', null, 'Delivery addresses'),
          h('button', { class: 'btn btn--sm', onClick: () => openForm() }, icon('plus', 15), 'Add address')),
        data.items.length
          ? h('div', { class: 'panel__body stack-sm' },
            data.items.map((address) =>
              h('div', { class: 'address-option' },
                h('div', { class: 'grow' },
                  h('div', { class: 'row', style: { gap: '8px' } },
                    h('b', null, address.label), address.isDefault ? badge('Default', 'brand') : null),
                  h('div', { class: 'small muted' },
                    `${address.fullName}, ${address.line1}${address.line2 ? `, ${address.line2}` : ''}, ${address.city} ${address.state} ${address.postalCode}, ${address.country}`),
                  address.phone ? h('div', { class: 'faint tiny' }, address.phone) : null),
                h('div', { class: 'row', style: { gap: '6px' } },
                  address.isDefault
                    ? null
                    : asyncButton('Make default', async () => {
                      await api.patch(`/api/addresses/${address.id}`, { isDefault: true });
                      store.success('Default address updated');
                      await load();
                    }, { class: 'btn--quiet btn--sm' }),
                  h('button', { class: 'btn btn--quiet btn--sm', onClick: () => openForm(address) }, icon('edit', 14)),
                  asyncButton(icon('trash', 14), async () => {
                    const ok = await confirmDialog({
                      title: 'Delete this address?', message: `${address.label} — ${address.line1}`,
                      confirmLabel: 'Delete', danger: true,
                    });
                    if (ok) {
                      await api.del(`/api/addresses/${address.id}`);
                      store.success('Address deleted');
                      await load();
                    }
                  }, { class: 'btn--quiet btn--sm' })))))
          : h('div', { class: 'panel__body' },
            emptyState({ title: 'No addresses yet', body: 'Add one now or during checkout.', iconName: 'truck' }))),
    );
  };

  const openForm = (existing = null) => {
    const model = existing
      ? { ...existing }
      : { label: 'Home', fullName: store.user.name, line1: '', line2: '', city: '', state: '', postalCode: '', country: 'United States', phone: '', isDefault: false };
    const field = (label, key, opts = {}) =>
      h('div', { class: `field${opts.full ? ' form-grid--full' : ''}` },
        h('label', { class: 'label' }, label),
        h('input', {
          class: 'input', name: key, value: model[key] ?? '',
          onInput: (e) => { model[key] = e.target.value; },
        }));
    const form = h('form', { class: 'form-grid', onSubmit: (e) => e.preventDefault() },
      field('Label', 'label'),
      field('Full name', 'fullName'),
      field('Address line 1', 'line1', { full: true }),
      field('Address line 2', 'line2', { full: true }),
      field('City', 'city'),
      field('State / region', 'state'),
      field('Postal code', 'postalCode'),
      field('Country', 'country'),
      field('Phone', 'phone'),
      h('label', { class: 'check form-grid--full' },
        h('input', { type: 'checkbox', checked: Boolean(model.isDefault), onChange: (e) => { model.isDefault = e.target.checked; } }),
        h('span', null, 'Use as my default delivery address')));

    const dialog = modal({
      title: existing ? 'Edit address' : 'Add an address',
      body: form,
      footer: [
        h('button', { class: 'btn btn--ghost', onClick: () => dialog.close() }, 'Cancel'),
        asyncButton(existing ? 'Save address' : 'Add address', async () => {
          try {
            if (existing) await api.patch(`/api/addresses/${existing.id}`, model);
            else await api.post('/api/addresses', model);
            dialog.close();
            store.success(existing ? 'Address updated' : 'Address added');
            await load();
          } catch (err) {
            if (err.fields) applyFieldErrors(form, err.fields);
            throw err;
          }
        }),
      ],
    });
  };

  await load();
  return host;
}

async function securityTab() {
  const model = { currentPassword: '', newPassword: '' };
  const form = h('form', { class: 'stack', onSubmit: (e) => e.preventDefault() },
    h('div', { class: 'form-grid' },
      h('div', { class: 'field' },
        h('label', { for: 'currentPassword' }, 'Current password'),
        h('input', {
          class: 'input', type: 'password', id: 'currentPassword', name: 'currentPassword', autocomplete: 'current-password',
          onInput: (e) => { model.currentPassword = e.target.value; },
        })),
      h('div', { class: 'field' },
        h('label', { for: 'newPassword' }, 'New password'),
        h('input', {
          class: 'input', type: 'password', id: 'newPassword', name: 'newPassword', autocomplete: 'new-password',
          onInput: (e) => { model.newPassword = e.target.value; },
        }),
        h('span', { class: 'field__hint' }, 'At least 8 characters, including a letter and a number.'))));

  const sessions = await api.get('/api/auth/sessions');

  return h('div', { class: 'stack-lg' },
    h('section', { class: 'panel' },
      h('div', { class: 'panel__head' }, h('h2', null, 'Change password')),
      h('div', { class: 'panel__body stack' },
        form,
        h('div', { class: 'row' },
          asyncButton('Update password', async () => {
            try {
              await api.post('/api/auth/password', model);
              store.success('Password updated');
              form.querySelectorAll('input').forEach((input) => { input.value = ''; });
              model.currentPassword = '';
              model.newPassword = '';
            } catch (err) {
              if (err.fields) applyFieldErrors(form, err.fields);
              throw err;
            }
          })))),

    h('section', { class: 'panel' },
      h('div', { class: 'panel__head' },
        h('h2', null, 'Active sessions'),
        asyncButton('Sign out everywhere', async () => {
          const ok = await confirmDialog({
            title: 'Sign out of all devices?',
            message: 'You will need to sign in again on every device, including this one.',
            confirmLabel: 'Sign out everywhere', danger: true,
          });
          if (ok) {
            await api.del('/api/auth/sessions');
            store.setUser(null);
            store.success('Signed out of every device');
            router.navigate('/');
          }
        }, { class: 'btn--ghost btn--sm' })),
      h('div', { class: 'table-wrap' },
        h('table', { class: 'table' },
          h('thead', null, h('tr', null,
            h('th', null, 'Device'), h('th', null, 'IP'), h('th', null, 'Last active'), h('th', null, 'Expires'))),
          h('tbody', null, sessions.items.map((session) =>
            h('tr', null,
              h('td', null,
                h('span', { class: 'truncate', style: { maxWidth: '280px', display: 'inline-block' } }, session.userAgent || 'Unknown device'),
                session.current ? badge('This device', 'brand') : null),
              h('td', { class: 'faint' }, session.ip || '—'),
              h('td', null, relative(session.lastSeenAt)),
              h('td', { class: 'faint' }, dateShort(session.expiresAt))))))),
    ),
  );
}

async function reviewsTab() {
  const data = await api.get('/api/reviews/mine');
  if (!data.items.length) {
    return emptyState({
      title: 'You have not reviewed anything yet',
      body: 'Reviews help other readers judge condition and value.',
      iconName: 'sparkle',
      action: h('a', { class: 'btn', href: '/orders' }, 'See your orders'),
    });
  }
  return h('section', { class: 'panel' },
    h('div', { class: 'panel__head' }, h('h2', null, `Your reviews (${number(data.items.length)})`)),
    h('div', { class: 'panel__body stack' },
      data.items.map((review) =>
        h('article', { class: 'card card--pad' },
          h('div', { class: 'row-between' },
            h('div', null,
              h('a', { href: `/books/${review.bookId}`, class: 'strong' }, review.bookTitle),
              h('div', { class: 'faint tiny' }, `${relative(review.createdAt)}${review.verified ? ' · verified purchase' : ''}`)),
            h('div', { class: 'row', style: { gap: '8px' } },
              stars(review.rating),
              asyncButton(icon('trash', 14), async () => {
                const ok = await confirmDialog({
                  title: 'Delete this review?', message: `Your review of “${review.bookTitle}” will be removed.`,
                  confirmLabel: 'Delete review', danger: true,
                });
                if (ok) {
                  await api.del(`/api/reviews/${review.id}`);
                  store.success('Review deleted');
                  router.resolve({ scroll: false });
                }
              }, { class: 'btn--quiet btn--sm' }))),
          review.title ? h('b', null, review.title) : null,
          review.body ? h('p', { class: 'muted small' }, review.body) : null,
          h('div', { class: 'faint tiny' }, `${number(review.helpfulCount)} reader(s) found this helpful`)))));
}

async function notificationsTab() {
  const data = await api.get('/api/notifications');
  store.setNotifications(data);
  if (!data.items.length) {
    return emptyState({ title: 'No notifications', body: 'Order updates and loan reminders will show up here.', iconName: 'bell' });
  }
  return h('section', { class: 'panel' },
    h('div', { class: 'panel__head' },
      h('h2', null, `Notifications (${number(data.unread)} unread)`),
      data.unread
        ? asyncButton('Mark all read', async () => {
          const updated = await api.post('/api/notifications/read-all');
          store.setNotifications(updated);
          router.resolve({ scroll: false });
        }, { class: 'btn--ghost btn--sm' })
        : null),
    h('div', { class: 'panel__body stack-sm' },
      data.items.map((item) =>
        h('a', { class: `notif__item${item.read ? '' : ' is-unread'}`, href: item.link || '/account' },
          h('div', { class: 'row-between' },
            h('b', { class: 'small' }, item.title),
            h('span', { class: 'faint tiny' }, relative(item.createdAt))),
          item.body ? h('div', { class: 'muted small' }, item.body) : null))));
}
