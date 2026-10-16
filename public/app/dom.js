/** Tiny hyperscript + formatting helpers. Everything is a real DOM node - no virtual DOM, no build step. */
const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'g', 'text', 'tspan', 'defs', 'linearGradient', 'stop', 'use', 'title']);

export function h(tag, props = null, ...children) {
  if (typeof tag === 'function') return tag({ ...(props || {}), children: children.flat(Infinity) });
  const el = SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class' || key === 'className') el.setAttribute('class', Array.isArray(value) ? value.filter(Boolean).join(' ') : value);
      else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
      else if (key === 'dataset') Object.assign(el.dataset, value);
      else if (key === 'html') el.innerHTML = value;
      else if (key === 'ref' && typeof value === 'function') value(el);
      else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key === 'value' && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) el.value = value;
      else if (key === 'checked' || key === 'disabled' || key === 'selected' || key === 'open' || key === 'required' || key === 'multiple') {
        if (value) el.setAttribute(key, '');
        el[key] = Boolean(value);
      } else el.setAttribute(key, value === true ? '' : String(value));
    }
  }
  append(el, children);
  return el;
}

export function append(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === true) continue;
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export const frag = (...children) => append(document.createDocumentFragment(), children);
export const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); return node; };
export const mount = (node, ...children) => append(clear(node), children);
export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Inline icon set (stroke-based, inherits currentColor). */
const ICONS = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm5.5 12.5L21 21',
  cart: 'M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.57L21 8H6M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm9 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  heart: 'M12 20s-7.5-4.6-7.5-9.4A4.1 4.1 0 0 1 12 7.8a4.1 4.1 0 0 1 7.5 2.8c0 4.8-7.5 9.4-7.5 9.4z',
  bell: 'M18 15V10a6 6 0 1 0-12 0v5l-2 3h16l-2-3zM10 21h4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm8 8c0-3.3-3.6-6-8-6s-8 2.7-8 6',
  book: 'M4 5h7a3 3 0 0 1 3 3v12a2.5 2.5 0 0 0-2.5-2.5H4zM20 5h-7a3 3 0 0 0-3 3v12a2.5 2.5 0 0 1 2.5-2.5H20z',
  package: 'M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 2 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.5-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 4a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.4l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 20 11a2 2 0 1 1 0 4z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  x: 'M6 6l12 12M18 6L6 18',
  check: 'M20 6L9 17l-5-5',
  chevronLeft: 'M15 18l-6-6 6-6',
  chevronRight: 'M9 18l6-6-6-6',
  chevronDown: 'M6 9l6 6 6-6',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  store: 'M3 9l2-5h14l2 5M3 9v11h18V9M3 9h18M9 20v-6h6v6',
  truck: 'M1 3h13v11H1zM14 7h4l3 3v4h-7M4.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm12 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  tag: 'M20.6 13.4L12 22l-9-9V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6',
  edit: 'M11 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-6M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z',
  eye: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  mail: 'M2 5h20v14H2zM2 5l10 7 10-7',
  arrowRight: 'M5 12h14M13 5l7 7-7 7',
  filter: 'M3 5h18M6 12h12M10 19h4',
  refresh: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  sparkle: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z',
};

export const icon = (name, size = 18, extra = {}) =>
  h('svg', {
    class: 'icon', width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', ...extra,
  }, h('path', { d: ICONS[name] || ICONS.book }));

export const starSvg = (fill) =>
  h('svg', { viewBox: '0 0 24 24', fill: fill ? 'currentColor' : 'none', stroke: 'currentColor', 'stroke-width': 1.5, 'aria-hidden': 'true' },
    h('path', { d: 'M12 2.5l3 6.1 6.7 1-4.8 4.7 1.1 6.7L12 17.8 5.9 21l1.2-6.7L2.3 9.6l6.7-1z' }));

// ---------- formatters ----------
export const money = (cents, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format((cents || 0) / 100);
export const number = (n) => new Intl.NumberFormat('en-US').format(n || 0);

export const dateShort = (value) => {
  const d = toDate(value);
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
};
export const dateTime = (value) => {
  const d = toDate(value);
  return d ? d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
};
export const relative = (value) => {
  const d = toDate(value);
  if (!d) return '—';
  const diff = Date.now() - d.getTime();
  const units = [['year', 31536e6], ['month', 2592e6], ['week', 6048e5], ['day', 864e5], ['hour', 36e5], ['minute', 6e4]];
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [unit, ms] of units) {
    if (Math.abs(diff) >= ms) return rtf.format(-Math.round(diff / ms), unit);
  }
  return 'just now';
};
/** SQLite stores naive UTC strings ("2026-01-02 03:04:05"); normalise before parsing. */
export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const text = String(value);
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text) ? text.replace(' ', 'T') + 'Z' : text;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const titleCase = (value) =>
  String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
export const initials = (name) =>
  String(name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
export const pluralize = (n, singular, plural = `${singular}s`) => `${number(n)} ${n === 1 ? singular : plural}`;
export const debounce = (fn, ms = 250) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
};
