import { h, mount } from './dom.js';
import { store } from './store.js';
import { api } from './api.js';
import { Router } from './router.js';
import { header, footer, toastHost } from './components/layout.js';
import { syncGuestCart, refreshCartCount } from './components/cart-actions.js';
import { emptyState, spinner } from './components/ui.js';

import homePage from './pages/home.js';
import browsePage from './pages/browse.js';
import bookPage from './pages/book.js';
import storePage from './pages/store.js';
import cartPage from './pages/cart.js';
import checkoutPage from './pages/checkout.js';
import ordersPage, { orderDetailPage } from './pages/orders.js';
import loansPage from './pages/loans.js';
import wishlistPage from './pages/wishlist.js';
import { loginPage, registerPage } from './pages/auth.js';
import accountPage from './pages/account.js';
import sellPage from './pages/sell.js';
import sellerDashboard, { sellerListings, sellerListingForm, sellerOrders, sellerReviews } from './pages/seller.js';
import adminDashboard, { adminUsers, adminModeration, adminOrders, adminCoupons, adminCategories } from './pages/admin.js';

document.documentElement.dataset.theme = store.state.theme;

const app = document.getElementById('app');
const outlet = h('main', { id: 'main', tabindex: '-1' });

const requireAuth = (ctx) => (store.isAuthed ? null : `/login?next=${encodeURIComponent(ctx.path + ctx.search)}`);
const requireSeller = (ctx) => {
  const auth = requireAuth(ctx);
  if (auth) return auth;
  return store.isSeller ? null : '/sell';
};
const requireAdmin = (ctx) => {
  const auth = requireAuth(ctx);
  if (auth) return auth;
  return store.isAdmin ? null : '/';
};

const routes = [
  { path: '/', view: homePage, title: 'BiblioBazaar - buy, sell and borrow books' },
  { path: '/browse', view: browsePage, title: 'Browse the catalogue · BiblioBazaar' },
  { path: '/books/:id', view: bookPage, title: 'Book · BiblioBazaar' },
  { path: '/stores/:slug', view: storePage, title: 'Storefront · BiblioBazaar' },
  { path: '/cart', view: cartPage, title: 'Your cart · BiblioBazaar' },
  { path: '/checkout', view: checkoutPage, guard: requireAuth, title: 'Checkout · BiblioBazaar' },
  { path: '/orders', view: ordersPage, guard: requireAuth, title: 'Your orders · BiblioBazaar' },
  { path: '/orders/:id', view: orderDetailPage, guard: requireAuth, title: 'Order · BiblioBazaar' },
  { path: '/loans', view: loansPage, guard: requireAuth, title: 'Borrowed books · BiblioBazaar' },
  { path: '/wishlist', view: wishlistPage, guard: requireAuth, title: 'Wishlist · BiblioBazaar' },
  { path: '/login', view: loginPage, title: 'Sign in · BiblioBazaar' },
  { path: '/register', view: registerPage, title: 'Create an account · BiblioBazaar' },
  { path: '/account', view: accountPage, guard: requireAuth, title: 'Account · BiblioBazaar' },
  { path: '/sell', view: sellPage, title: 'Sell on BiblioBazaar' },
  { path: '/seller', view: sellerDashboard, guard: requireSeller, title: 'Seller dashboard · BiblioBazaar' },
  { path: '/seller/listings', view: sellerListings, guard: requireSeller, title: 'Your listings · BiblioBazaar' },
  { path: '/seller/listings/new', view: sellerListingForm, guard: requireSeller, title: 'New listing · BiblioBazaar' },
  { path: '/seller/listings/:id/edit', view: sellerListingForm, guard: requireSeller, title: 'Edit listing · BiblioBazaar' },
  { path: '/seller/orders', view: sellerOrders, guard: requireSeller, title: 'Seller orders · BiblioBazaar' },
  { path: '/seller/reviews', view: sellerReviews, guard: requireSeller, title: 'Seller reviews · BiblioBazaar' },
  { path: '/admin', view: adminDashboard, guard: requireAdmin, title: 'Admin · BiblioBazaar' },
  { path: '/admin/users', view: adminUsers, guard: requireAdmin, title: 'Users · Admin' },
  { path: '/admin/moderation', view: adminModeration, guard: requireAdmin, title: 'Moderation · Admin' },
  { path: '/admin/orders', view: adminOrders, guard: requireAdmin, title: 'Orders · Admin' },
  { path: '/admin/coupons', view: adminCoupons, guard: requireAdmin, title: 'Promotions · Admin' },
  { path: '/admin/categories', view: adminCategories, guard: requireAdmin, title: 'Categories · Admin' },
];

async function boot() {
  mount(app, h('div', { class: 'container' }, spinner('Loading BiblioBazaar…')));

  const [meta, session] = await Promise.all([
    api.get('/api/meta').catch(() => null),
    api.get('/api/auth/me').catch(() => ({ user: null })),
  ]);
  if (meta) store.setMeta(meta);
  store.applySession(session);

  if (store.isAuthed && store.guestCart.length) {
    try {
      await syncGuestCart();
      store.toast('Your saved cart was merged into your account', 'success');
    } catch { /* non-fatal */ }
  } else {
    await refreshCartCount();
  }

  const chrome = header(routerRef);
  const siteFooter = footer();
  const progress = h('div', { class: 'route-progress', 'aria-hidden': 'true' });
  mount(app, progress, chrome.element, outlet, siteFooter, toastHost());

  const router = new Router({
    outlet,
    routes,
    notFound: () =>
      h('div', { class: 'container' },
        emptyState({
          title: 'That page does not exist',
          body: 'The link may be out of date. Try the catalogue instead.',
          iconName: 'search',
          action: h('a', { class: 'btn', href: '/browse' }, 'Browse books'),
        })),
    onAfter: (ctx) => chrome.syncActive(ctx?.path || location.pathname, ctx?.search || location.search),
  });
  routerRef.navigate = (...args) => router.navigate(...args);
  routerRef.setQuery = (...args) => router.setQuery(...args);
  routerRef.resolve = (...args) => router.resolve(...args);
  window.__bbRouter = router;

  await router.resolve({ scroll: false });
  chrome.syncActive(location.pathname, location.search);
}

// Routes capture the router before it exists, so calls are proxied through this object.
const routerRef = {
  navigate: (path) => { location.href = path; },
  setQuery: () => {},
  resolve: () => {},
};
export const router = routerRef;

boot().catch((err) => {
  console.error('boot failed', err);
  mount(app,
    h('div', { class: 'container', style: { padding: '4rem 0' } },
      emptyState({
        title: 'BiblioBazaar could not start',
        body: err?.message || 'The server did not respond. Check that it is running and reload the page.',
        iconName: 'refresh',
        action: h('button', { class: 'btn', onClick: () => location.reload() }, 'Reload'),
      })));
});
