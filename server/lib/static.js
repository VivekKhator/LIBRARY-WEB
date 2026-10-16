import { createReadStream, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json',
};

/** Resolves a URL path inside root, refusing anything that escapes it. */
export function resolveSafe(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  if (decoded.includes('\0')) return null;
  const target = path.resolve(root, '.' + path.posix.normalize(decoded));
  const rootResolved = path.resolve(root);
  if (target !== rootResolved && !target.startsWith(rootResolved + path.sep)) return null;
  return target;
}

export function serveFile(ctx, filePath, { cacheControl, status = 200 } = {}) {
  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;

  const ext = path.extname(filePath).toLowerCase();
  const etag = `W/"${createHash('sha1').update(`${filePath}:${stat.size}:${stat.mtimeMs}`).digest('base64url')}"`;
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Last-Modified': stat.mtime.toUTCString(),
    ETag: etag,
    'Cache-Control': cacheControl || (ext === '.html' ? 'no-cache' : 'public, max-age=3600'),
  };
  if (ctx.setCookies.length) headers['Set-Cookie'] = ctx.setCookies;

  if (ctx.headers['if-none-match'] === etag) {
    ctx.responded = true;
    ctx.res.writeHead(304, { ETag: etag, 'Cache-Control': headers['Cache-Control'] });
    ctx.res.end();
    return true;
  }

  ctx.responded = true;
  ctx.res.writeHead(status, headers);
  if (ctx.method === 'HEAD') {
    ctx.res.end();
    return true;
  }
  createReadStream(filePath).pipe(ctx.res);
  return true;
}

export const fileExists = (p) => Boolean(p) && existsSync(p);
