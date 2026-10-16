/** All money is handled as integer cents end-to-end; only formatting converts to decimals. */
export const toCents = (value) => Math.round(Number(value) * 100);
export const fromCents = (cents) => Number((cents / 100).toFixed(2));
export const round = (cents) => Math.round(cents);
export const pct = (cents, rate) => Math.round(cents * rate);
export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
export const formatCents = (cents, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format((cents || 0) / 100);
