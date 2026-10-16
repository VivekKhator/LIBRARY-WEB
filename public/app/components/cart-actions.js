/** Single place where "add to cart" is implemented for both signed-in and guest shoppers. */
import { api } from '../api.js';
import { store } from '../store.js';

export async function addToCart({ book, mode = 'buy', quantity = 1, rentWeeks = 0 }) {
  if (store.isAuthed) {
    const cart = await api.post('/api/cart/items', { bookId: book.id, mode, quantity, rentWeeks });
    store.setCartCount(cart.count);
    store.success(mode === 'rent' ? `Rental of "${book.title}" added to your cart` : `"${book.title}" added to your cart`);
    return cart;
  }
  store.addGuestLine({ bookId: book.id, mode, quantity, rentWeeks });
  store.success(`"${book.title}" saved to your cart - sign in to check out`);
  return null;
}

export async function syncGuestCart() {
  const lines = store.guestCart;
  if (!lines.length || !store.isAuthed) return null;
  const cart = await api.post('/api/cart/merge', { items: lines });
  store.clearGuestCart();
  store.setCartCount(cart.count);
  return cart;
}

export async function refreshCartCount() {
  if (!store.isAuthed) {
    store.setCartCount(store.guestCart.reduce((n, l) => n + l.quantity, 0));
    return;
  }
  try {
    const cart = await api.get('/api/cart');
    store.setCartCount(cart.count);
  } catch { /* badge is non-critical */ }
}
