import { Router, makeContext, sendJson, sendRaw } from './lib/http.js';
import { AppError, notFound, serverError } from './lib/errors.js';
import { logger } from './lib/logger.js';
import { config } from './config.js';
import { attachUser } from './middleware/auth.js';
import { fileExists, resolveSafe, serveFile } from './lib/static.js';
import path from 'node:path';

import metaRoutes from './routes/meta.js';
import authRoutes from './routes/auth.js';
import bookRoutes from './routes/books.js';
import commerceRoutes from './routes/commerce.js';
import sellerRoutes, { storeRouter } from './routes/sellers.js';
import adminRoutes from './routes/admin.js';

export function buildApiRouter() {
  const api = new Router();
  api.use(attachUser);
  api.mount('', metaRoutes);
  api.mount('/auth', authRoutes);
  api.mount('/books', bookRoutes);
  api.mount('', commerceRoutes);
  api.mount('/sellers', sellerRoutes);
  api.mount('/stores', storeRouter);
  api.mount('/admin', adminRoutes);
  return api;
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-XSS-Protection': '0',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; " +
    "script-src 'self'; connect-src 'self'; font-src 'self' data:; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
};

export function createApp() {
  const api = buildApiRouter();

  return async function handler(req, res) {
    const started = process.hrtime.bigint();
    const ctx = makeContext(req, res);
    const originalPath = ctx.pathname;
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);

    const finish = (status) => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      logger.info(`${ctx.method} ${originalPath} ${status} ${ms.toFixed(1)}ms`, ctx.user ? { user: ctx.user.id } : undefined);
    };

    try {
      if (ctx.method === 'OPTIONS') {
        res.writeHead(204, { Allow: 'GET,POST,PATCH,PUT,DELETE,OPTIONS' });
        res.end();
        return finish(204);
      }

      if (ctx.pathname === '/api' || ctx.pathname.startsWith('/api/')) {
        ctx.pathname = ctx.pathname.replace(/^\/api/, '') || '/';
        const result = await api.handle(ctx);
        if (!ctx.responded) sendJson(ctx, 200, result === undefined ? { ok: true } : result);
        return finish(res.statusCode);
      }

      if (ctx.pathname.startsWith('/uploads/')) {
        const target = resolveSafe(config.uploadDir, ctx.pathname.replace(/^\/uploads/, ''));
        if (fileExists(target) && serveFile(ctx, target, { cacheControl: 'public, max-age=604800' })) {
          return finish(res.statusCode);
        }
        throw notFound('File not found');
      }

      // Static assets, then SPA fallback so client-side routes deep-link correctly.
      const target = resolveSafe(config.publicDir, ctx.pathname);
      if (fileExists(target) && serveFile(ctx, target)) return finish(res.statusCode);

      if (ctx.method === 'GET' || ctx.method === 'HEAD') {
        const index = path.join(config.publicDir, 'index.html');
        if (fileExists(index) && serveFile(ctx, index, { cacheControl: 'no-cache' })) return finish(res.statusCode);
      }
      throw notFound(`Nothing at ${ctx.pathname}`);
    } catch (err) {
      const appErr = err instanceof AppError ? err : null;
      if (!appErr) logger.error('unhandled request error', { message: err?.message, stack: err?.stack?.split('\n')[1]?.trim() });
      const error = appErr || serverError(config.isProd ? undefined : err?.message);
      const headers = {};
      if (error.retryAfter) headers['Retry-After'] = String(error.retryAfter);
      if (ctx.responded) return finish(res.statusCode);
      const wantsJson =
        originalPath.startsWith('/api') ||
        (ctx.headers.accept || '').includes('application/json') ||
        ctx.method !== 'GET';
      if (wantsJson) sendJson(ctx, error.status, error.toJSON(), headers);
      else sendRaw(ctx, error.status, errorPage(error), { 'Content-Type': 'text/html; charset=utf-8', ...headers });
      return finish(error.status);
    }
  };
}

const errorPage = (error) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${error.status} - BiblioBazaar</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:16px/1.6 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#0f172a;color:#e2e8f0}
main{text-align:center;padding:2rem}h1{font-size:4rem;margin:0}a{color:#7dd3fc}</style></head>
<body><main><h1>${error.status}</h1><p>${error.message}</p><p><a href="/">Back to BiblioBazaar</a></p></main></body></html>`;
