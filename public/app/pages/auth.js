import { h, icon, mount, clear } from '../dom.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { router } from '../main.js';
import { alert, applyFieldErrors, asyncButton } from '../components/ui.js';

const DEMO = [
  { label: 'Administrator', email: 'admin@bibliobazaar.test', password: 'Admin1234', note: 'Full console' },
  { label: 'Seller', email: 'seller@bibliobazaar.test', password: 'Seller1234', note: 'Storefront + orders' },
  { label: 'Reader', email: 'reader@bibliobazaar.test', password: 'Reader1234', note: 'Shopper view' },
];

const aside = () =>
  h('div', { class: 'auth-aside' },
    h('h2', null, 'A marketplace library'),
    h('ul', { class: 'stack', style: { marginTop: '16px' } },
      [
        ['cart', 'Buy second-hand and new books from independent sellers'],
        ['clock', 'Borrow titles by the week with automatic due-date reminders'],
        ['store', 'Open a storefront and manage listings, stock and orders'],
        ['shield', 'Cancel before dispatch, with refunds handled automatically'],
      ].map(([iconName, text]) =>
        h('li', { class: 'row', style: { gap: '12px', alignItems: 'flex-start' } },
          h('span', { class: 'empty__icon', style: { width: '36px', height: '36px', flex: 'none' } }, icon(iconName, 17)),
          h('span', { class: 'muted' }, text)))));

const demoPanel = (onPick) =>
  h('div', { class: 'demo-accounts' },
    h('span', { class: 'label' }, 'Demo accounts'),
    DEMO.map((account) =>
      h('div', { class: 'demo-account' },
        h('div', null,
          h('b', null, account.label),
          h('div', { class: 'faint tiny' }, `${account.email} · ${account.note}`)),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => onPick(account) }, 'Use'))));

export async function loginPage(ctx) {
  if (store.isAuthed) return redirectHome(ctx);
  const next = ctx.query.next || '/';
  const model = { email: '', password: '' };

  const emailInput = h('input', { class: 'input', id: 'email', name: 'email', type: 'email', autocomplete: 'email', required: true, placeholder: 'you@example.com' });
  const passwordInput = h('input', { class: 'input', id: 'password', name: 'password', type: 'password', autocomplete: 'current-password', required: true, placeholder: '••••••••' });
  const errorHost = h('div');

  const submit = async () => {
    clear(errorHost);
    try {
      const payload = await api.post('/api/auth/login', {
        email: emailInput.value.trim(),
        password: passwordInput.value,
        guestCart: store.guestCart,
      });
      store.applySession(payload);
      if (store.guestCart.length) store.clearGuestCart();
      store.success(`Welcome back, ${payload.user.name.split(' ')[0]}`);
      router.navigate(next);
    } catch (err) {
      if (err.fields) applyFieldErrors(form, err.fields);
      mount(errorHost, alert(err.message, 'error'));
      throw err;
    }
  };

  const form = h('form', {
    class: 'stack',
    onSubmit: (e) => { e.preventDefault(); submitBtn.click(); },
  },
    h('div', { class: 'field' }, h('label', { for: 'email' }, 'Email address'), emailInput),
    h('div', { class: 'field' }, h('label', { for: 'password' }, 'Password'), passwordInput),
  );
  const submitBtn = asyncButton('Sign in', submit, { class: 'btn--lg btn--block', type: 'submit' });
  form.appendChild(submitBtn);

  return h('div', { class: 'container' },
    h('div', { class: 'auth-layout' },
      h('div', { class: 'auth-card stack' },
        h('div', null, h('h1', null, 'Sign in'), h('p', { class: 'muted' }, 'Your cart and wishlist follow you in.')),
        errorHost,
        form,
        h('p', { class: 'small muted center' }, 'New here? ', h('a', { href: '/register' }, 'Create an account')),
        h('hr', { class: 'divider' }),
        demoPanel((account) => {
          emailInput.value = account.email;
          passwordInput.value = account.password;
          submitBtn.click();
        })),
      aside()));
}

export async function registerPage(ctx) {
  if (store.isAuthed) return redirectHome(ctx);
  const next = ctx.query.next || '/';
  const nameInput = h('input', { class: 'input', id: 'name', name: 'name', autocomplete: 'name', required: true, placeholder: 'Ada Lovelace' });
  const emailInput = h('input', { class: 'input', id: 'email', name: 'email', type: 'email', autocomplete: 'email', required: true, placeholder: 'you@example.com' });
  const passwordInput = h('input', { class: 'input', id: 'password', name: 'password', type: 'password', autocomplete: 'new-password', required: true, placeholder: 'At least 8 characters' });
  const strength = h('div', { class: 'progress', style: { marginTop: '6px' } }, h('div', { class: 'progress__bar', style: { width: '0%' } }));
  const strengthLabel = h('span', { class: 'field__hint' }, 'Use 8+ characters with a letter and a number.');
  const errorHost = h('div');

  passwordInput.addEventListener('input', () => {
    const value = passwordInput.value;
    let score = 0;
    if (value.length >= 8) score += 34;
    if (/[A-Za-z]/.test(value) && /\d/.test(value)) score += 33;
    if (value.length >= 12 || /[^A-Za-z0-9]/.test(value)) score += 33;
    const bar = strength.firstChild;
    bar.style.width = `${Math.min(100, score)}%`;
    bar.style.background = score < 40 ? 'var(--danger-fg)' : score < 80 ? 'var(--warn-fg)' : 'var(--success-fg)';
    strengthLabel.textContent = score < 40 ? 'Too weak' : score < 80 ? 'Reasonable' : 'Strong password';
  });

  const submit = async () => {
    clear(errorHost);
    try {
      const payload = await api.post('/api/auth/register', {
        name: nameInput.value.trim(),
        email: emailInput.value.trim(),
        password: passwordInput.value,
        guestCart: store.guestCart,
      });
      store.applySession(payload);
      if (store.guestCart.length) store.clearGuestCart();
      store.success('Account created - welcome to BiblioBazaar');
      router.navigate(next);
    } catch (err) {
      if (err.fields) applyFieldErrors(form, err.fields);
      mount(errorHost, alert(err.message, 'error'));
      throw err;
    }
  };

  const form = h('form', { class: 'stack', onSubmit: (e) => { e.preventDefault(); submitBtn.click(); } },
    h('div', { class: 'field' }, h('label', { for: 'name' }, 'Your name'), nameInput),
    h('div', { class: 'field' }, h('label', { for: 'email' }, 'Email address'), emailInput),
    h('div', { class: 'field' }, h('label', { for: 'password' }, 'Password'), passwordInput, strength, strengthLabel),
  );
  const submitBtn = asyncButton('Create account', submit, { class: 'btn--lg btn--block', type: 'submit' });
  form.appendChild(submitBtn);

  return h('div', { class: 'container' },
    h('div', { class: 'auth-layout' },
      h('div', { class: 'auth-card stack' },
        h('div', null, h('h1', null, 'Create your account'), h('p', { class: 'muted' }, 'Buy, borrow and sell - one account does all three.')),
        errorHost,
        form,
        h('p', { class: 'small muted center' }, 'Already registered? ', h('a', { href: '/login' }, 'Sign in')),
        h('p', { class: 'faint tiny center' }, 'Demo site: do not reuse a real password.')),
      aside()));
}

function redirectHome(ctx) {
  const next = ctx.query.next || '/';
  setTimeout(() => router.navigate(next, { replace: true }), 0);
  return h('div', { class: 'container' }, h('p', { class: 'muted' }, 'You are already signed in. Redirecting…'));
}
