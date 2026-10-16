import { AppError, badRequest, notFound } from './errors.js';
import { parseCookies } from './cookies.js';

const MAX_BODY_BYTES = 6 * 1024 * 1024; // room for a base64 cover upload

export class Router {
  constructor() {
    this.routes = [];
    this.middlewares = [];
  }
  use(fn) {
    this.middlewares.push(fn);
    return this;
  }
  add(method, pattern, ...handlers) {
    this.routes.push({ method, ...compile(pattern), handlers });
    return this;
  }
  get(p, ...h) { return this.add('GET', p, ...h); }
  post(p, ...h) { return this.add('POST', p, ...h); }
  put(p, ...h) { return this.add('PUT', p, ...h); }
  patch(p, ...h) { return this.add('PATCH', p, ...h); }
  delete(p, ...h) { return this.add('DELETE', p, ...h); }

  mount(prefix, router) {
    for (const r of router.routes) {
      const pattern = (prefix + r.pattern).replace(/\/+$/, '') || '/';
      this.add(r.method, pattern, ...[...router.middlewares, ...r.handlers]);
    }
    return this;
  }

  match(method, pathname) {
    let pathExists = false;
    for (const route of this.routes) {
      const m = route.regex.exec(pathname);
      if (!m) continue;
      pathExists = true;
      if (route.method !== method) continue;
      const params = {};
      route.keys.forEach((k, i) => (params[k] = safeDecode(m[i + 1])));
      return { route, params };
    }
    return pathExists ? { methodNotAllowed: true } : null;
  }

  async handle(ctx) {
    const found = this.match(ctx.method, ctx.pathname);
    if (!found) throw notFound(`No API route for ${ctx.method} ${ctx.pathname}`);
    if (found.methodNotAllowed) throw new AppError(405, 'method_not_allowed', `${ctx.method} is not allowed here`);
    ctx.params = found.params;
    const chain = [...this.middlewares, ...found.route.handlers];
    let result;
    for (const fn of chain) {
      result = await fn(ctx);
      if (ctx.responded || result !== undefined) break;
    }
    return result;
  }
}

function compile(pattern) {
  const keys = [];
  const regexStr = pattern
    .split('/')
    .map((seg) => {
      if (!seg) return '';
      if (seg.startsWith(':')) {
        keys.push(seg.slice(1));
        return '/([^/]+)';
      }
      if (seg === '*') {
        keys.push('wildcard');
        return '/(.*)';
      }
      return '/' + seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return { pattern, regex: new RegExp(`^${regexStr || '/'}/?$`), keys };
}

const safeDecode = (v) => {
  try { return decodeURIComponent(v); } catch { return v; }
};

export async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw badRequest('Request body is too large (6MB limit)');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function parseJsonBody(req) {
  const type = req.headers['content-type'] || '';
  const buf = await readBody(req);
  if (!buf.length) return {};
  if (type.includes('application/json')) {
    try {
      const parsed = JSON.parse(buf.toString('utf8'));
      return parsed && typeof parsed === 'object' ? parsed : { value: parsed };
    } catch {
      throw badRequest('Request body is not valid JSON');
    }
  }
  if (type.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(buf.toString('utf8')));
  }
  throw badRequest(`Unsupported content type: ${type || 'none'}`);
}

/** Query string -> plain object, repeated keys become arrays. */
export function parseQuery(searchParams) {
  const out = {};
  for (const [k, v] of searchParams) {
    if (k in out) out[k] = [].concat(out[k], v);
    else out[k] = v;
  }
  return out;
}

export function makeContext(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  return {
    req,
    res,
    method: req.method,
    url,
    pathname: url.pathname.replace(/\/{2,}/g, '/'),
    query: parseQuery(url.searchParams),
    cookies: parseCookies(req.headers.cookie),
    headers: req.headers,
    ip: (req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'unknown').trim(),
    state: {},
    user: null,
    responded: false,
    setCookies: [],
    body: undefined,
    json(data, status = 200, headers = {}) {
      sendJson(this, status, data, headers);
    },
  };
}

export function sendJson(ctx, status, data, headers = {}) {
  if (ctx.responded) return;
  const payload = JSON.stringify(data === undefined ? null : data);
  ctx.responded = true;
  const all = {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    ...headers,
  };
  if (ctx.setCookies.length) all['Set-Cookie'] = ctx.setCookies;
  ctx.res.writeHead(status, all);
  ctx.res.end(payload);
}

export function sendRaw(ctx, status, body, headers = {}) {
  if (ctx.responded) return;
  ctx.responded = true;
  const all = { 'Content-Length': Buffer.byteLength(body), ...headers };
  if (ctx.setCookies.length) all['Set-Cookie'] = ctx.setCookies;
  ctx.res.writeHead(status, all);
  ctx.res.end(body);
}
