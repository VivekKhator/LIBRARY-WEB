import http from 'node:http';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');

/** Boots an isolated server (own SQLite file) and returns a small HTTP client. */
export async function startTestServer(name = `test-${process.pid}`) {
  const dbPath = path.join(ROOT, 'data', `${name}.db`);
  removeDb(dbPath);

  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = dbPath;
  process.env.LOG_LEVEL = 'silent';
  process.env.SESSION_SECRET = 'test-secret-value-for-sessions-0123456789';

  const { getDb, closeDb, clearStatementCache } = await import('../server/db/index.js');
  const { createApp } = await import('../server/app.js');
  const { ensureSeed } = await import('../scripts/seed.js');

  getDb();
  await ensureSeed({ quiet: true });

  const server = http.createServer(createApp());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  return {
    base,
    client: () => makeClient(base),
    async close() {
      await new Promise((resolve) => server.close(resolve));
      closeDb();
      clearStatementCache();
      removeDb(dbPath);
    },
  };
}

function removeDb(dbPath) {
  for (const suffix of ['', '-wal', '-shm']) if (existsSync(dbPath + suffix)) rmSync(dbPath + suffix);
}

/** Cookie-aware client that mirrors how the browser calls the API (including CSRF). */
export function makeClient(base) {
  const cookies = new Map();

  const cookieHeader = () => [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

  const storeCookies = (response) => {
    const raw = response.headers.getSetCookie?.() || [];
    for (const entry of raw) {
      const [pair] = entry.split(';');
      const idx = pair.indexOf('=');
      const key = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (!value) cookies.delete(key);
      else cookies.set(key, value);
    }
  };

  async function request(method, pathname, body, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (cookies.size) headers.Cookie = cookieHeader();
    if (!['GET', 'HEAD'].includes(method) && cookies.has('bb_csrf') && !('X-CSRF-Token' in headers)) {
      headers['X-CSRF-Token'] = decodeURIComponent(cookies.get('bb_csrf'));
    }
    const response = await fetch(base + pathname, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });
    storeCookies(response);
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    return { status: response.status, data, headers: response.headers, ok: response.ok };
  }

  return {
    cookies,
    get: (p, o) => request('GET', p, undefined, o),
    post: (p, b, o) => request('POST', p, b ?? {}, o),
    patch: (p, b, o) => request('PATCH', p, b ?? {}, o),
    del: (p, b, o) => request('DELETE', p, b, o),
    async login(email, password) {
      const res = await request('POST', '/api/auth/login', { email, password });
      if (res.status !== 200) throw new Error(`login failed for ${email}: ${JSON.stringify(res.data)}`);
      return res.data;
    },
    async register(user) {
      const res = await request('POST', '/api/auth/register', user);
      if (res.status !== 200) throw new Error(`register failed: ${JSON.stringify(res.data)}`);
      return res.data;
    },
    logout: () => request('POST', '/api/auth/logout'),
  };
}

export const ACCOUNTS = {
  admin: { email: 'admin@bibliobazaar.test', password: 'Admin1234' },
  seller: { email: 'seller@bibliobazaar.test', password: 'Seller1234' },
  reader: { email: 'reader@bibliobazaar.test', password: 'Reader1234' },
  ben: { email: 'ben@bibliobazaar.test', password: 'Reader1234' },
};

export const GOOD_CARD = { cardNumber: '4242424242424242', cardName: 'Test Buyer', expMonth: 12, expYear: 2032, cvc: '123' };
export const DECLINED_CARD = { ...GOOD_CARD, cardNumber: '4000000000000002' };

export const uniqueEmail = (prefix = 'user') => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.local`;
