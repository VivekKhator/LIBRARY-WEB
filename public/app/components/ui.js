/** Shared presentational components used across pages. */
import { h, icon, money, number, starSvg, titleCase, relative, initials, pluralize } from '../dom.js';
import { store } from '../store.js';
import { api } from '../api.js';

export const stars = (value, { size = 'sm', showValue = false, count = null } = {}) => {
  const rounded = Math.round((value || 0) * 2) / 2;
  const nodes = [];
  for (let i = 1; i <= 5; i++) nodes.push(starSvg(i <= Math.round(rounded)));
  return h('span', { class: 'rating-row' },
    h('span', { class: `stars${size === 'lg' ? ' stars--lg' : ''}`, role: 'img', 'aria-label': `${value || 0} out of 5 stars` }, nodes),
    showValue && value ? h('b', null, Number(value).toFixed(1)) : null,
    count !== null ? h('span', null, `(${number(count)})`) : null,
  );
};

export const badge = (text, variant = '') => h('span', { class: `badge${variant ? ` badge--${variant}` : ''}` }, text);

const CONDITION_VARIANT = { new: 'success', like_new: 'brand', good: 'info', fair: 'warn' };
export const conditionBadge = (condition) => badge(titleCase(condition), CONDITION_VARIANT[condition] || '');

const STATUS_VARIANT = {
  active: 'success', pending: 'warn', draft: '', rejected: 'danger', archived: '',
  paid: 'info', packed: 'info', shipped: 'brand', delivered: 'success', cancelled: 'danger', refunded: 'warn',
  processing: 'warn', returned: 'success', overdue: 'danger', suspended: 'danger',
  customer: '', seller: 'brand', admin: 'accent',
};
export const statusBadge = (status) => badge(titleCase(status), STATUS_VARIANT[status] ?? '');

export const alert = (message, variant = 'info', extra = null) =>
  h('div', { class: `alert alert--${variant}`, role: variant === 'error' ? 'alert' : 'status' },
    h('span', { class: 'grow' }, message), extra);

export const emptyState = ({ title, body, action = null, iconName = 'book' }) =>
  h('div', { class: 'empty' },
    h('div', { class: 'empty__icon' }, icon(iconName, 24)),
    h('h3', null, title),
    body ? h('p', { class: 'muted', style: { maxWidth: '42ch' } }, body) : null,
    action,
  );

export const spinner = (label = 'Loading') =>
  h('div', { class: 'row', style: { justifyContent: 'center', padding: '3rem 0' }, role: 'status' },
    h('div', { class: 'spinner' }), h('span', { class: 'muted' }, label));

export const skeletonGrid = (count = 8) =>
  h('div', { class: 'grid grid-books', 'aria-hidden': 'true' },
    Array.from({ length: count }, () =>
      h('div', { class: 'card', style: { overflow: 'hidden' } },
        h('div', { class: 'skeleton skeleton--cover' }),
        h('div', { style: { padding: '12px', display: 'grid', gap: '8px' } },
          h('div', { class: 'skeleton skeleton--text', style: { width: '85%' } }),
          h('div', { class: 'skeleton skeleton--text', style: { width: '55%' } }),
          h('div', { class: 'skeleton skeleton--text', style: { width: '35%' } })))));

export const avatar = (name, { large = false } = {}) =>
  h('div', { class: `avatar${large ? ' avatar--lg' : ''}`, 'aria-hidden': 'true' }, initials(name));

export const breadcrumbs = (trail) =>
  h('nav', { class: 'breadcrumbs', 'aria-label': 'Breadcrumb' },
    trail.flatMap((item, i) => [
      i > 0 ? h('span', { 'aria-hidden': 'true' }, '/') : null,
      item.href ? h('a', { href: item.href }, item.label) : h('span', { 'aria-current': 'page' }, item.label),
    ]));

export const pagination = ({ page, totalPages, onChange }) => {
  if (totalPages <= 1) return h('div');
  const nums = [];
  const push = (n) => nums.push(n);
  push(1);
  for (let n = page - 1; n <= page + 1; n++) if (n > 1 && n < totalPages) push(n);
  if (totalPages > 1) push(totalPages);
  const unique = [...new Set(nums)].sort((a, b) => a - b);

  const buttons = [];
  buttons.push(h('button', { onClick: () => onChange(page - 1), disabled: page <= 1, 'aria-label': 'Previous page' }, icon('chevronLeft', 16)));
  let last = 0;
  for (const n of unique) {
    if (n - last > 1) buttons.push(h('span', { class: 'faint', style: { padding: '0 4px' } }, '…'));
    buttons.push(h('button', {
      onClick: () => onChange(n),
      'aria-current': n === page ? 'page' : null,
      'aria-label': `Page ${n}`,
    }, String(n)));
    last = n;
  }
  buttons.push(h('button', { onClick: () => onChange(page + 1), disabled: page >= totalPages, 'aria-label': 'Next page' }, icon('chevronRight', 16)));
  return h('nav', { class: 'pagination', 'aria-label': 'Pagination' }, buttons);
};

export const field = ({ label, input, hint, error, id, full = false }) =>
  h('div', { class: `field${full ? ' form-grid--full' : ''}` },
    label ? h('label', { for: id }, label) : null,
    input,
    hint ? h('span', { class: 'field__hint' }, hint) : null,
    error ? h('span', { class: 'field__error' }, error) : null,
  );

/** Text/number/select/textarea input bound to a plain data object. */
export function boundInput(model, key, props = {}) {
  const { type = 'text', tag = 'input', options, ...rest } = props;
  const id = `f-${key}-${Math.random().toString(36).slice(2, 7)}`;
  const common = {
    id,
    name: key,
    class: tag === 'textarea' ? 'textarea' : tag === 'select' ? 'select' : 'input',
    value: model[key] ?? '',
    onInput: (e) => {
      model[key] = type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value;
      props.onChange?.(model[key]);
    },
    ...rest,
  };
  if (tag === 'select') {
    return h('select', { ...common, onChange: common.onInput },
      (options || []).map((opt) =>
        h('option', { value: opt.value, selected: String(model[key] ?? '') === String(opt.value) }, opt.label)));
  }
  if (tag === 'textarea') return h('textarea', common);
  return h('input', { ...common, type });
}

/** Button that shows a spinner while its async handler runs and surfaces field errors. */
export function asyncButton(label, handler, props = {}) {
  const btn = h('button', {
    class: `btn ${props.class || ''}`.trim(),
    type: props.type || 'button',
    disabled: props.disabled,
    ...Object.fromEntries(Object.entries(props).filter(([k]) => !['class', 'type', 'disabled'].includes(k))),
    onClick: async (event) => {
      if (btn.classList.contains('is-loading')) return;
      btn.classList.add('is-loading');
      btn.setAttribute('aria-busy', 'true');
      try {
        await handler(event);
      } catch (err) {
        if (err?.name !== 'AbortError') store.error(err?.message || 'Action failed');
      } finally {
        btn.classList.remove('is-loading');
        btn.removeAttribute('aria-busy');
      }
    },
  }, label);
  return btn;
}

export function modal({ title, body, footer, onClose, width }) {
  const backdrop = h('div', {
    class: 'modal-backdrop',
    role: 'presentation',
    onClick: (e) => { if (e.target === backdrop) close(); },
  });
  const dialog = h('div', {
    class: 'modal',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': typeof title === 'string' ? title : 'Dialog',
    style: width ? { width } : null,
  },
    h('div', { class: 'modal__head' },
      typeof title === 'string' ? h('h3', null, title) : title,
      h('button', { class: 'icon-btn', 'aria-label': 'Close dialog', onClick: () => close() }, icon('x', 18))),
    h('div', { class: 'modal__body' }, body),
    footer ? h('div', { class: 'modal__foot' }, footer) : null,
  );
  backdrop.appendChild(dialog);

  const onKey = (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') trapFocus(e, dialog);
  };
  function close() {
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
    onClose?.();
  }
  document.addEventListener('keydown', onKey);
  document.body.appendChild(backdrop);
  requestAnimationFrame(() => {
    const target = dialog.querySelector('input, select, textarea, button:not(.icon-btn)');
    target?.focus();
  });
  return { close, element: backdrop };
}

export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false, onConfirm }) {
  return new Promise((resolve) => {
    // `close()` fires onClose, so track the outcome to avoid resolving twice.
    let confirmed = false;
    const dialog = modal({
      title,
      body: h('p', null, message),
      footer: [
        h('button', { class: 'btn btn--ghost', onClick: () => dialog.close() }, 'Cancel'),
        asyncButton(confirmLabel, async () => {
          await onConfirm?.();
          confirmed = true;
          dialog.close();
        }, { class: danger ? 'btn--danger' : '' }),
      ],
      onClose: () => resolve(confirmed),
    });
  });
}

function trapFocus(event, container) {
  const focusables = [...container.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')];
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/** Applies server-side field errors to a rendered form. */
export function applyFieldErrors(form, fields = {}) {
  form.querySelectorAll('.field__error[data-generated]').forEach((el) => el.remove());
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  let first = null;
  for (const [name, message] of Object.entries(fields || {})) {
    const input = form.querySelector(`[name="${name}"]`);
    if (!input) continue;
    input.setAttribute('aria-invalid', 'true');
    const error = h('span', { class: 'field__error', 'data-generated': 'true' }, message);
    (input.closest('.field') || input.parentElement).appendChild(error);
    if (!first) first = input;
  }
  first?.focus();
  return Boolean(first);
}

export const sparkline = (series, { height = 200, valueKey = 'revenueCents', formatter = money } = {}) => {
  const points = series || [];
  if (points.length < 2) return h('p', { class: 'muted small' }, 'Not enough data yet.');
  const w = 600;
  const padL = 46;
  const padB = 22;
  const max = Math.max(...points.map((p) => p[valueKey]), 1);
  const stepX = (w - padL - 10) / (points.length - 1);
  const scaleY = (v) => height - padB - (v / max) * (height - padB - 14);
  const coords = points.map((p, i) => [padL + i * stepX, scaleY(p[valueKey])]);
  const line = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${coords.at(-1)[0].toFixed(1)},${height - padB} L${padL},${height - padB} Z`;

  return h('svg', { class: 'chart', viewBox: `0 0 ${w} ${height}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': 'Trend chart' },
    [0, 0.5, 1].map((ratio) => {
      const y = scaleY(max * ratio);
      return h('g', null,
        h('line', { class: 'grid-line', x1: padL, y1: y, x2: w - 8, y2: y }),
        h('text', { x: 4, y: y + 3 }, formatter(max * ratio)));
    }),
    h('path', { class: 'area', d: area }),
    h('path', { class: 'line', d: line }),
    coords.map(([x, y], i) => h('circle', { class: 'dot', cx: x, cy: y, r: i === coords.length - 1 ? 4 : 2.2 })),
    points.map((p, i) =>
      i % Math.ceil(points.length / 7) === 0
        ? h('text', { x: padL + i * stepX, y: height - 6, 'text-anchor': 'middle' }, p.day.slice(5))
        : null),
  );
};

export const barList = (rows, { formatter = number } = {}) => {
  if (!rows.length) return h('p', { class: 'muted small' }, 'No data yet.');
  const max = Math.max(...rows.map((r) => r.value), 1);
  return h('div', null, rows.map((row) =>
    h('div', { class: 'bar-row' },
      row.href ? h('a', { href: row.href, class: 'truncate' }, row.label) : h('span', { class: 'truncate' }, row.label),
      h('div', { class: 'bar' }, h('span', { style: { width: `${Math.max(2, (row.value / max) * 100)}%` } })),
      h('b', { class: 'tiny nowrap' }, formatter(row.value)))));
};

export const statCard = ({ label, value, hint, accent }) =>
  h('div', { class: 'stat' },
    h('span', { class: 'stat__label' }, label),
    h('b', { class: 'stat__value', style: accent ? { color: accent } : null }, value),
    hint ? h('span', { class: 'stat__hint' }, hint) : null);

export const timeline = (events) =>
  h('div', { class: 'timeline' }, events.map((event) =>
    h('div', { class: 'timeline__item' },
      h('b', { class: 'small' }, event.label),
      h('div', { class: 'faint' }, relative(event.createdAt), event.detail ? ` · ${event.detail}` : ''))));

export const fulfillmentTrack = (status) => {
  const steps = ['processing', 'packed', 'shipped', 'delivered'];
  if (status === 'cancelled') return badge('Cancelled', 'danger');
  const index = steps.indexOf(status);
  return h('div', null,
    h('div', { class: 'track' }, steps.map((_, i) => h('span', { class: `track__seg${i <= index ? ' is-done' : ''}` }))),
    h('div', { class: 'track__labels' }, steps.map((s) => h('span', null, s))));
};

/** Wishlist heart used on cards and detail pages; keeps local state in sync. */
export function saveButton(bookId, { className = 'book-card__save' } = {}) {
  const render = () => store.state.wishlist.has(bookId);
  const btn = h('button', {
    class: className,
    'aria-pressed': String(render()),
    'aria-label': render() ? 'Remove from wishlist' : 'Save to wishlist',
    title: render() ? 'Saved' : 'Save for later',
    onClick: async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!store.isAuthed) {
        store.warn('Sign in to save books to your wishlist');
        return;
      }
      try {
        const res = await api.post(`/api/wishlist/${bookId}`);
        store.toggleWishlistLocal(bookId, res.saved);
        store.toast(res.saved ? 'Saved to your wishlist' : 'Removed from your wishlist', 'success', 2600);
      } catch (err) {
        store.error(err.message);
      }
    },
  }, h('svg', { viewBox: '0 0 24 24', width: 18, height: 18, fill: render() ? 'currentColor' : 'none', stroke: 'currentColor', 'stroke-width': 1.8 },
    h('path', { d: 'M12 20s-7.5-4.6-7.5-9.4A4.1 4.1 0 0 1 12 7.8a4.1 4.1 0 0 1 7.5 2.8c0 4.8-7.5 9.4-7.5 9.4z' })));

  const sync = () => {
    const saved = render();
    btn.setAttribute('aria-pressed', String(saved));
    btn.setAttribute('aria-label', saved ? 'Remove from wishlist' : 'Save to wishlist');
    btn.querySelector('path').parentElement.setAttribute('fill', saved ? 'currentColor' : 'none');
  };
  store.on('wishlist', sync);
  return btn;
}

export { pluralize };
