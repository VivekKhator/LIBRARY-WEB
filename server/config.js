import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');

// Minimal .env loader (no dependency). Existing process env always wins.
const envFile = path.join(ROOT, '.env');
if (existsSync(envFile)) {
  for (const raw of readFileSync(envFile, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const env = process.env.NODE_ENV || 'development';
const resolve = (p) => (p === ':memory:' || path.isAbsolute(p) ? p : path.join(ROOT, p));

export const config = {
  env,
  isProd: env === 'production',
  isTest: env === 'test',
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '0.0.0.0',
  dbPath: process.env.DB_PATH ? resolve(process.env.DB_PATH) : path.join(ROOT, 'data', 'library.db'),
  uploadDir: process.env.UPLOAD_DIR ? resolve(process.env.UPLOAD_DIR) : path.join(ROOT, 'data', 'uploads'),
  publicDir: path.join(ROOT, 'public'),
  sessionSecret: process.env.SESSION_SECRET || randomBytes(32).toString('hex'),
  sessionTtlDays: 30,
  logLevel: process.env.LOG_LEVEL || (env === 'test' ? 'silent' : 'info'),
  // Abuse protection. Generous in tests so suites are not throttled by their own fixtures.
  rateLimits: {
    register: { limit: Number(process.env.RATE_LIMIT_REGISTER || (env === 'test' ? 100000 : 10)), windowMs: 60 * 60 * 1000 },
    login: { limit: Number(process.env.RATE_LIMIT_LOGIN || (env === 'test' ? 100000 : 20)), windowMs: 10 * 60 * 1000 },
  },
  // Commerce rules (single source of truth, shared with the client via /api/meta)
  commerce: {
    currency: 'USD',
    taxRate: 0.08,
    freeShippingThresholdCents: 5000,
    shippingMethods: [
      { id: 'standard', label: 'Standard', days: '5-7 business days', priceCents: 499 },
      { id: 'express', label: 'Express', days: '2-3 business days', priceCents: 1299 },
      { id: 'overnight', label: 'Overnight', days: 'next business day', priceCents: 2499 },
    ],
    maxQuantityPerItem: 10,
    rentWeekOptions: [1, 2, 3, 4, 8, 12],
    maxRentExtensions: 2,
    lateFeePerDayCents: 50,
    platformFeeRate: 0.1,
  },
};

export const SHIPPING = new Map(config.commerce.shippingMethods.map((m) => [m.id, m]));
