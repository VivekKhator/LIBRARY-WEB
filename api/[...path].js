/**
 * Vercel serverless entry point.
 *
 * Vercel has no persistent filesystem, so the SQLite database and uploads live in /tmp:
 * they are seeded on each cold start and are NOT shared between instances or restarts.
 * That is fine for a demo deployment; see DEPLOYMENT.md for the durable options.
 */
import { createApp } from '../server/app.js';
import { getDb } from '../server/db/index.js';
import { ensureSeed } from '../scripts/seed.js';

let handler = null;
let bootError = null;

async function boot() {
  if (handler || bootError) return;
  try {
    getDb();
    await ensureSeed({ quiet: true });
    handler = createApp();
  } catch (err) {
    bootError = err;
  }
}

const bootPromise = boot();

export default async function vercelHandler(req, res) {
  await bootPromise;

  if (bootError) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      error: {
        code: 'server_error',
        message: 'BiblioBazaar failed to start.',
        detail: String(bootError?.message || bootError),
      },
    }));
    return;
  }

  // Vercel rewrites preserve the original path on req.url; fall back to the
  // catch-all parameter if a platform ever hands us the rewritten path instead.
  if (!req.url || req.url.startsWith('/api/[')) {
    const segments = [].concat(req.query?.path || []);
    req.url = `/api/${segments.join('/')}`;
  }

  return handler(req, res);
}
