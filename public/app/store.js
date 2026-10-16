/** Minimal observable app state: session, cart badge, wishlist, notifications, toasts, theme, guest cart. */
const GUEST_CART_KEY = 'bb.guestCart';
const THEME_KEY = 'bb.theme';
const RECENT_KEY = 'bb.recent';

const readLocal = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
const writeLocal = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage may be unavailable in private mode */ }
};

class Store {
  constructor() {
    this.state = {
      session: { user: null, loaded: false },
      cartCount: 0,
      wishlist: new Set(),
      notifications: { unread: 0, items: [] },
      meta: null,
      toasts: [],
      theme: readLocal(THEME_KEY, null) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
      guestCart: readLocal(GUEST_CART_KEY, []),
      recent: readLocal(RECENT_KEY, []),
    };
    this.listeners = new Map();
    this.nextToastId = 1;
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(fn);
    return () => this.listeners.get(event).delete(fn);
  }

  emit(event, payload) {
    for (const fn of this.listeners.get(event) || []) {
      try {
        fn(payload, this.state);
      } catch (err) {
        console.error(`store listener failed for "${event}"`, err);
      }
    }
    if (event !== '*') this.emit('*', { event, payload });
  }

  // ---------- session ----------
  get user() { return this.state.session.user; }
  get isAuthed() { return Boolean(this.state.session.user); }
  get isSeller() { return ['seller', 'admin'].includes(this.state.session.user?.role); }
  get isAdmin() { return this.state.session.user?.role === 'admin'; }

  setUser(user) {
    this.state.session = { user: user || null, loaded: true };
    if (!user) {
      this.state.cartCount = 0;
      this.state.wishlist = new Set();
      this.state.notifications = { unread: 0, items: [] };
    }
    this.emit('session', this.state.session);
  }

  applySession(payload) {
    this.setUser(payload?.user || null);
    if (payload?.cart) this.setCartCount(payload.cart.count || 0);
    if (payload?.wishlist) this.setWishlist(payload.wishlist);
    if (payload?.notifications) this.setUnread(payload.notifications.unread || 0);
  }

  setCartCount(count) {
    this.state.cartCount = count;
    this.emit('cart', count);
  }

  setWishlist(ids) {
    this.state.wishlist = new Set(ids || []);
    this.emit('wishlist', this.state.wishlist);
  }

  toggleWishlistLocal(bookId, saved) {
    if (saved) this.state.wishlist.add(bookId);
    else this.state.wishlist.delete(bookId);
    this.emit('wishlist', this.state.wishlist);
  }

  setUnread(count) {
    this.state.notifications.unread = count;
    this.emit('notifications', this.state.notifications);
  }

  setNotifications(payload) {
    this.state.notifications = { unread: payload.unread || 0, items: payload.items || [] };
    this.emit('notifications', this.state.notifications);
  }

  setMeta(meta) {
    this.state.meta = meta;
    this.emit('meta', meta);
  }

  // ---------- theme ----------
  setTheme(theme) {
    this.state.theme = theme;
    writeLocal(THEME_KEY, theme);
    document.documentElement.dataset.theme = theme;
    this.emit('theme', theme);
  }

  toggleTheme() {
    this.setTheme(this.state.theme === 'dark' ? 'light' : 'dark');
  }

  // ---------- guest cart ----------
  get guestCart() { return this.state.guestCart; }

  addGuestLine(line) {
    const lines = [...this.state.guestCart];
    const existing = lines.find((l) => l.bookId === line.bookId && l.mode === line.mode);
    if (existing) {
      existing.quantity = Math.min(10, existing.quantity + (line.quantity || 1));
      if (line.mode === 'rent') {
        existing.quantity = 1;
        existing.rentWeeks = line.rentWeeks || existing.rentWeeks;
      }
    } else {
      lines.push({ ...line, quantity: line.mode === 'rent' ? 1 : line.quantity || 1 });
    }
    this.setGuestCart(lines);
  }

  updateGuestLine(bookId, mode, patch) {
    const lines = this.state.guestCart
      .map((l) => (l.bookId === bookId && l.mode === mode ? { ...l, ...patch } : l))
      .filter((l) => l.quantity > 0);
    this.setGuestCart(lines);
  }

  removeGuestLine(bookId, mode) {
    this.setGuestCart(this.state.guestCart.filter((l) => !(l.bookId === bookId && l.mode === mode)));
  }

  setGuestCart(lines) {
    this.state.guestCart = lines;
    writeLocal(GUEST_CART_KEY, lines);
    this.setCartCount(lines.reduce((n, l) => n + l.quantity, 0));
    this.emit('guestCart', lines);
  }

  clearGuestCart() {
    this.state.guestCart = [];
    writeLocal(GUEST_CART_KEY, []);
    this.emit('guestCart', []);
  }

  // ---------- recently viewed ----------
  pushRecent(book) {
    const entry = { id: book.id, title: book.title, author: book.author, priceCents: book.priceCents };
    const next = [entry, ...this.state.recent.filter((b) => b.id !== book.id)].slice(0, 8);
    this.state.recent = next;
    writeLocal(RECENT_KEY, next);
    this.emit('recent', next);
  }

  // ---------- toasts ----------
  toast(message, kind = 'info', timeout = 4200) {
    const toast = { id: this.nextToastId++, message, kind };
    this.state.toasts = [...this.state.toasts, toast];
    this.emit('toasts', this.state.toasts);
    if (timeout) setTimeout(() => this.dismissToast(toast.id), timeout);
    return toast.id;
  }

  success(message) { return this.toast(message, 'success'); }
  error(message) { return this.toast(message, 'error', 6000); }
  warn(message) { return this.toast(message, 'warn', 5200); }

  dismissToast(id) {
    this.state.toasts = this.state.toasts.filter((t) => t.id !== id);
    this.emit('toasts', this.state.toasts);
  }
}

export const store = new Store();
export const commerce = () => store.state.meta?.commerce || {
  taxRate: 0.08, freeShippingThresholdCents: 5000, maxQuantityPerItem: 10,
  rentWeekOptions: [1, 2, 3, 4, 8, 12], currency: 'USD',
  shippingMethods: [{ id: 'standard', label: 'Standard', days: '5-7 business days', priceCents: 499 }],
};

/** Client-side preview of the server's pricing rules (server stays authoritative at checkout). */
export function previewTotals(lines, { shippingMethod = 'standard', discountCents = 0 } = {}) {
  const rules = commerce();
  const subtotalCents = lines.reduce((sum, l) => sum + l.lineCents, 0);
  const needsShipping = lines.some((l) => !['ebook', 'audiobook'].includes(l.format));
  const method = rules.shippingMethods.find((m) => m.id === shippingMethod) || rules.shippingMethods[0];
  let shippingCents = needsShipping ? method.priceCents : 0;
  if (needsShipping && method.id === 'standard' && subtotalCents - discountCents >= rules.freeShippingThresholdCents) shippingCents = 0;
  const taxCents = Math.round(Math.max(0, subtotalCents - discountCents) * rules.taxRate);
  return {
    subtotalCents, discountCents, shippingCents, taxCents,
    totalCents: Math.max(0, subtotalCents - discountCents) + shippingCents + taxCents,
    needsShipping, shippingMethod: method.id,
    freeShippingApplied: needsShipping && method.id === 'standard' && shippingCents === 0,
  };
}
