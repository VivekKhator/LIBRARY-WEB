import { tooMany } from './errors.js';

/** Fixed-window in-memory limiter. Sufficient for a single-node deployment; swap for Redis when scaling out. */
const buckets = new Map();

export function rateLimit({ key, limit, windowMs, message }) {
  const now = Date.now();
  let entry = buckets.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    buckets.set(key, entry);
  }
  entry.count += 1;
  if (entry.count > limit) {
    throw tooMany(message || 'Too many attempts. Try again shortly.', Math.ceil((entry.resetAt - now) / 1000));
  }
  return { remaining: Math.max(0, limit - entry.count), resetAt: entry.resetAt };
}

export const resetRateLimits = () => buckets.clear();

// Opportunistic sweep so the map cannot grow unbounded.
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
}, 60_000);
sweep.unref?.();
