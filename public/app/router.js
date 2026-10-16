/** History-API router with async views, guards, query parsing and scroll restoration. */
import { store } from './store.js';
import { h } from './dom.js';

// Requests in flight when the document is torn down reject as network errors; they are not real failures.
let unloading = false;
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { unloading = true; });
  window.addEventListener('beforeunload', () => { unloading = true; });
}

export class Router {
  constructor({ outlet, routes, onBefore, onAfter, notFound }) {
    this.outlet = outlet;
    this.routes = routes.map(compile);
    this.onBefore = onBefore;
    this.onAfter = onAfter;
    this.notFound = notFound;
    this.current = null;
    this.renderToken = 0;

    window.addEventListener('popstate', () => this.resolve({ restore: true }));
    document.addEventListener('click', (event) => this.interceptLink(event));
  }

  interceptLink(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest?.('a[href]');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!href || anchor.target === '_blank' || anchor.hasAttribute('download') || anchor.dataset.native === 'true') return;
    if (/^(https?:)?\/\//i.test(href) || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    if (href.startsWith('#')) return;
    event.preventDefault();
    this.navigate(href);
  }

  navigate(path, { replace = false, scroll = true } = {}) {
    const url = new URL(path, location.origin);
    const target = url.pathname + url.search + url.hash;
    if (target === location.pathname + location.search + location.hash) {
      return this.resolve({ scroll: false });
    }
    if (replace) history.replaceState({}, '', target);
    else history.pushState({}, '', target);
    return this.resolve({ scroll });
  }

  /** Updates the query string without re-mounting the page (used by filter UIs). */
  setQuery(params, { replace = true } = {}) {
    const url = new URL(location.href);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.delete(key);
      if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) continue;
      if (Array.isArray(value)) value.forEach((v) => url.searchParams.append(key, v));
      else url.searchParams.set(key, value);
    }
    const target = url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : '');
    if (replace) history.replaceState({}, '', target);
    else history.pushState({}, '', target);
  }

  match(pathname) {
    for (const route of this.routes) {
      const m = route.regex.exec(pathname.replace(/\/+$/, '') || '/');
      if (!m) continue;
      const params = {};
      route.keys.forEach((key, i) => (params[key] = decodeURIComponent(m[i + 1])));
      return { route, params };
    }
    return null;
  }

  async resolve({ scroll = true, restore = false } = {}) {
    const token = ++this.renderToken;
    const pathname = location.pathname;
    const query = Object.fromEntries(new URLSearchParams(location.search));
    const queryAll = new URLSearchParams(location.search);
    const found = this.match(pathname);
    const ctx = {
      path: pathname,
      params: found?.params || {},
      query,
      queryAll,
      router: this,
      search: location.search,
    };

    document.documentElement.dataset.route = 'loading';
    this.onBefore?.(ctx);

    if (!found) return this.render(this.notFound(ctx), token, scroll, restore);

    if (found.route.guard) {
      const redirect = found.route.guard(ctx);
      if (typeof redirect === 'string') {
        history.replaceState({}, '', redirect);
        return this.resolve({ scroll });
      }
    }

    try {
      const view = await found.route.view(ctx);
      if (token !== this.renderToken) return undefined; // a newer navigation won
      this.current = { ...ctx, route: found.route };
      document.title = typeof found.route.title === 'function' ? found.route.title(ctx) : found.route.title || 'BiblioBazaar';
      return this.render(view, token, scroll, restore);
    } catch (err) {
      if (token !== this.renderToken || unloading) return undefined;
      if (err?.name === 'AbortError') return undefined;
      console.error('route render failed', err);
      if (err?.status === 401) {
        store.toast('Please sign in to continue', 'warn');
        return this.navigate(`/login?next=${encodeURIComponent(pathname + location.search)}`, { replace: true });
      }
      return this.render(this.errorView(err, ctx), token, scroll, restore);
    }
  }

  render(view, token, scroll, restore) {
    if (token !== this.renderToken) return;
    this.outlet.replaceChildren(view);
    document.documentElement.dataset.route = 'ready';
    this.onAfter?.(this.current);
    if (scroll && !restore) window.scrollTo({ top: 0, behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' });
    const heading = this.outlet.querySelector('h1');
    if (heading) heading.setAttribute('tabindex', '-1');
  }

  errorView(err, ctx) {
    return h('div', { class: 'container' },
      h('div', { class: 'empty' },
        h('h1', null, err?.status === 404 ? 'Page not found' : 'Something went wrong'),
        h('p', { class: 'muted' }, err?.message || 'Unexpected error'),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onClick: () => this.resolve({ scroll: false }) }, 'Try again'),
          h('a', { class: 'btn btn--ghost', href: '/' }, 'Go home')),
      ));
  }
}

function compile(route) {
  const keys = [];
  const regexStr = route.path
    .split('/')
    .map((seg) => {
      if (!seg) return '';
      if (seg.startsWith(':')) {
        keys.push(seg.slice(1));
        return '/([^/]+)';
      }
      if (seg === '*') {
        keys.push('rest');
        return '/(.*)';
      }
      return '/' + seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return { ...route, keys, regex: new RegExp(`^${regexStr || '/'}$`) };
}
