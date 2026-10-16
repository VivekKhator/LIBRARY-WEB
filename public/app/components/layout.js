import { h, icon, debounce, relative, mount } from '../dom.js';
import { store } from '../store.js';
import { api } from '../api.js';
import { avatar } from './ui.js';

const NAV = [
  { href: '/browse', label: 'Browse' },
  { href: '/browse?mode=rent', label: 'Borrow' },
  { href: '/browse?sort=newest', label: 'New arrivals' },
  { href: '/sell', label: 'Sell books' },
];

export function header(router) {
  const cartCount = h('span', { class: 'icon-btn__count', hidden: store.state.cartCount === 0 }, String(store.state.cartCount));
  const bellCount = h('span', { class: 'icon-btn__count', hidden: store.state.notifications.unread === 0 }, String(store.state.notifications.unread));
  const navLinks = h('nav', { class: 'nav-links', 'aria-label': 'Main' },
    NAV.map((item) => h('a', { href: item.href, dataset: { nav: item.href } }, item.label)));
  const mobileNav = h('div', { class: 'mobile-nav' },
    NAV.map((item) => h('a', { class: 'chip', href: item.href }, item.label)));

  const searchInput = h('input', {
    class: 'input', type: 'search', placeholder: 'Search by title, author or ISBN…',
    'aria-label': 'Search the catalogue', autocomplete: 'off', name: 'q',
  });
  const suggestBox = h('div', { class: 'suggest', hidden: true, role: 'listbox' });

  const closeSuggest = () => { suggestBox.hidden = true; mount(suggestBox); };
  const runSuggest = debounce(async () => {
    const q = searchInput.value.trim();
    if (q.length < 2) return closeSuggest();
    try {
      const res = await api.get('/api/books/suggest', { query: { q } });
      if (!res.items.length) return closeSuggest();
      mount(suggestBox, res.items.map((item) =>
        h('button', {
          class: 'suggest__item', type: 'button', role: 'option',
          onMouseDown: (e) => {
            e.preventDefault();
            closeSuggest();
            searchInput.value = '';
            router.navigate(`/books/${item.id}`);
          },
        }, h('b', null, item.title), h('span', { class: 'faint' }, ` — ${item.author}`))));
      suggestBox.hidden = false;
    } catch { closeSuggest(); }
  }, 220);

  const searchForm = h('form', {
    class: 'searchbar', role: 'search',
    onSubmit: (e) => {
      e.preventDefault();
      const q = searchInput.value.trim();
      closeSuggest();
      router.navigate(q ? `/browse?q=${encodeURIComponent(q)}` : '/browse');
    },
  },
    h('span', { class: 'searchbar__icon' }, icon('search', 17)),
    searchInput,
    suggestBox,
  );
  searchInput.addEventListener('input', runSuggest);
  searchInput.addEventListener('blur', () => setTimeout(closeSuggest, 120));
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSuggest(); });

  // ---------- notifications ----------
  const notifMenu = h('div', { class: 'menu notif', hidden: true });
  const notifButton = h('button', {
    class: 'icon-btn', 'aria-label': 'Notifications', 'aria-haspopup': 'true', 'aria-expanded': 'false',
    onClick: async () => {
      const opening = notifMenu.hidden;
      closeAllMenus();
      notifMenu.hidden = !opening;
      notifButton.setAttribute('aria-expanded', String(opening));
      if (!opening) return;
      mount(notifMenu, h('p', { class: 'muted small', style: { padding: '12px' } }, 'Loading…'));
      try {
        const res = await api.get('/api/notifications');
        store.setNotifications(res);
        renderNotifications(res);
      } catch (err) {
        mount(notifMenu, h('p', { class: 'small', style: { padding: '12px' } }, err.message));
      }
    },
  }, icon('bell', 19), bellCount);

  const renderNotifications = (res) => {
    mount(notifMenu,
      h('div', { class: 'row-between', style: { padding: '4px 8px 8px' } },
        h('span', { class: 'menu__label', style: { padding: 0 } }, 'Notifications'),
        res.unread
          ? h('button', {
            class: 'btn btn--quiet btn--sm',
            onClick: async () => {
              const updated = await api.post('/api/notifications/read-all');
              store.setNotifications(updated);
              renderNotifications(updated);
            },
          }, 'Mark all read')
          : null),
      res.items.length
        ? res.items.map((item) =>
          h('a', {
            class: `notif__item${item.read ? '' : ' is-unread'}`,
            href: item.link || '/account',
            onClick: async () => {
              notifMenu.hidden = true;
              if (!item.read) {
                const updated = await api.post(`/api/notifications/${item.id}/read`);
                store.setNotifications(updated);
              }
            },
          },
            h('b', { class: 'small' }, item.title),
            item.body ? h('div', { class: 'faint clamp-2' }, item.body) : null,
            h('div', { class: 'tiny faint' }, relative(item.createdAt))))
        : h('p', { class: 'muted small', style: { padding: '12px' } }, 'Nothing new right now.'));
  };

  // ---------- account menu ----------
  const accountMenu = h('div', { class: 'menu', hidden: true });
  const accountButton = h('button', {
    class: 'icon-btn', 'aria-label': 'Account menu', 'aria-haspopup': 'true', 'aria-expanded': 'false',
    onClick: () => {
      const opening = accountMenu.hidden;
      closeAllMenus();
      accountMenu.hidden = !opening;
      accountButton.setAttribute('aria-expanded', String(opening));
      if (opening) renderAccountMenu();
    },
  }, icon('user', 19));

  const renderAccountMenu = () => {
    const user = store.user;
    mount(accountMenu,
      user
        ? [
          h('div', { class: 'row', style: { padding: '8px 10px 12px' } },
            avatar(user.name),
            h('div', { class: 'grow' },
              h('b', { class: 'small truncate' }, user.name),
              h('div', { class: 'tiny faint truncate' }, user.email))),
          h('div', { class: 'menu__sep' }),
          h('a', { href: '/account' }, icon('settings', 16), 'Account settings'),
          h('a', { href: '/orders' }, icon('package', 16), 'My orders'),
          h('a', { href: '/loans' }, icon('clock', 16), 'My borrowed books'),
          h('a', { href: '/wishlist' }, icon('heart', 16), 'Wishlist'),
          h('div', { class: 'menu__sep' }),
          store.isSeller
            ? h('a', { href: '/seller' }, icon('store', 16), 'Seller dashboard')
            : h('a', { href: '/sell' }, icon('store', 16), 'Start selling'),
          store.isAdmin ? h('a', { href: '/admin' }, icon('shield', 16), 'Admin console') : null,
          h('div', { class: 'menu__sep' }),
          h('button', {
            onClick: async () => {
              accountMenu.hidden = true;
              await api.post('/api/auth/logout');
              store.setUser(null);
              store.success('Signed out');
              router.navigate('/');
            },
          }, icon('logout', 16), 'Sign out'),
        ]
        : [
          h('div', { class: 'menu__label' }, 'Welcome'),
          h('a', { href: '/login' }, icon('user', 16), 'Sign in'),
          h('a', { href: '/register' }, icon('plus', 16), 'Create an account'),
          h('div', { class: 'menu__sep' }),
          h('a', { href: '/browse' }, icon('book', 16), 'Browse the catalogue'),
          h('a', { href: '/sell' }, icon('store', 16), 'Sell your books'),
        ]);
  };

  const themeButton = h('button', {
    class: 'icon-btn', 'aria-label': 'Toggle dark mode',
    onClick: () => {
      store.toggleTheme();
      mount(themeButton, icon(store.state.theme === 'dark' ? 'sun' : 'moon', 18));
    },
  }, icon(store.state.theme === 'dark' ? 'sun' : 'moon', 18));

  const closeAllMenus = () => {
    notifMenu.hidden = true;
    accountMenu.hidden = true;
    notifButton.setAttribute('aria-expanded', 'false');
    accountButton.setAttribute('aria-expanded', 'false');
  };

  const authActions = h('div', { class: 'row', style: { gap: '6px' } });
  const renderAuthActions = () => {
    mount(authActions, store.isAuthed
      ? [
        h('div', { class: 'menu-anchor' }, notifButton, notifMenu),
        h('div', { class: 'menu-anchor' }, accountButton, accountMenu),
      ]
      : [
        h('a', { class: 'btn btn--quiet', href: '/login' }, 'Sign in'),
        h('div', { class: 'menu-anchor' }, accountButton, accountMenu),
      ]);
  };
  renderAuthActions();

  const el = h('header', { class: 'site-header' },
    h('div', { class: 'container' },
      h('div', { class: 'site-header__bar' },
        h('a', { class: 'brand', href: '/', 'aria-label': 'BiblioBazaar home' },
          h('span', { class: 'brand__mark', 'aria-hidden': 'true' }, 'BB'),
          h('span', { class: 'brand__text' }, 'BiblioBazaar', h('small', null, 'Marketplace Library'))),
        navLinks,
        searchForm,
        h('div', { class: 'header-actions' },
          themeButton,
          h('a', { class: 'icon-btn', href: '/wishlist', 'aria-label': 'Wishlist' }, icon('heart', 19)),
          h('a', { class: 'icon-btn', href: '/cart', 'aria-label': 'Cart' }, icon('cart', 19), cartCount),
          authActions)),
      mobileNav),
  );

  document.addEventListener('click', (event) => {
    if (!el.contains(event.target)) closeAllMenus();
  });

  store.on('cart', (count) => {
    cartCount.textContent = String(count);
    cartCount.hidden = count === 0;
  });
  store.on('notifications', (notes) => {
    bellCount.textContent = String(notes.unread);
    bellCount.hidden = notes.unread === 0;
  });
  store.on('session', () => {
    renderAuthActions();
    closeAllMenus();
  });

  return {
    element: el,
    syncActive(path, search) {
      const current = path + (search || '');
      el.querySelectorAll('[data-nav]').forEach((link) => {
        const href = link.dataset.nav;
        const active = href === current || (href === '/browse' && path === '/browse' && !search);
        link.classList.toggle('is-active', Boolean(active));
      });
      if (path !== '/browse') searchInput.value = '';
      else searchInput.value = new URLSearchParams(search).get('q') || '';
    },
  };
}

export function footer() {
  const year = new Date().getFullYear();
  return h('footer', { class: 'site-footer' },
    h('div', { class: 'container' },
      h('div', { class: 'site-footer__grid' },
        h('div', null,
          h('a', { class: 'brand', href: '/' },
            h('span', { class: 'brand__mark', 'aria-hidden': 'true' }, 'BB'),
            h('span', { class: 'brand__text' }, 'BiblioBazaar')),
          h('p', { class: 'faint', style: { marginTop: '10px', maxWidth: '30ch' } },
            'A marketplace library: buy and sell second-hand books, or borrow by the week.')),
        h('div', null, h('h4', null, 'Shop'),
          h('a', { href: '/browse' }, 'All books'),
          h('a', { href: '/browse?mode=rent' }, 'Available to borrow'),
          h('a', { href: '/browse?sort=rating' }, 'Top rated'),
          h('a', { href: '/browse?sort=price_asc' }, 'Cheapest first')),
        h('div', null, h('h4', null, 'Sell'),
          h('a', { href: '/sell' }, 'Open a storefront'),
          h('a', { href: '/seller' }, 'Seller dashboard'),
          h('a', { href: '/seller/listings/new' }, 'List a book')),
        h('div', null, h('h4', null, 'Account'),
          h('a', { href: '/orders' }, 'Orders'),
          h('a', { href: '/loans' }, 'Borrowed books'),
          h('a', { href: '/wishlist' }, 'Wishlist'),
          h('a', { href: '/account' }, 'Settings'))),
      h('div', { class: 'site-footer__bottom' },
        h('span', null, `© ${year} BiblioBazaar. A demonstration marketplace - no real payments are processed.`),
        h('span', null, h('a', { href: '/api/health', dataset: { native: 'true' }, target: '_blank', rel: 'noreferrer' }, 'API status')))),
  );
}

export function toastHost() {
  const host = h('div', { class: 'toasts', role: 'region', 'aria-live': 'polite', 'aria-label': 'Notifications' });
  store.on('toasts', (toasts) => {
    mount(host, toasts.map((toast) =>
      h('div', { class: `toast toast--${toast.kind}` },
        h('span', { class: 'grow small' }, toast.message),
        h('button', { class: 'toast__close', 'aria-label': 'Dismiss', onClick: () => store.dismissToast(toast.id) }, '×'))));
  });
  return host;
}
