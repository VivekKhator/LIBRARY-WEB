import { store } from './store.js';

export class ApiError extends Error {
  constructor(status, payload) {
    const body = payload?.error || {};
    super(body.message || `Request failed (${status})`);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code || 'error';
    this.fields = body.fields || null;
  }
}

const readCookie = (name) =>
  document.cookie.split('; ').find((c) => c.startsWith(`${name}=`))?.split('=').slice(1).join('=');

async function request(method, path, { body, query, signal } = {}) {
  const url = new URL(path, location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) continue;
      if (Array.isArray(value)) value.forEach((v) => url.searchParams.append(key, v));
      else url.searchParams.set(key, value);
    }
  }
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && method !== 'HEAD') {
    const csrf = readCookie('bb_csrf');
    if (csrf) headers['X-CSRF-Token'] = decodeURIComponent(csrf);
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, { error: { code: 'network', message: 'Network unavailable - check your connection.' } });
  }

  if (response.status === 204) return null;
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: { code: 'bad_response', message: 'Server returned an unexpected response' } };
    }
  }
  if (!response.ok) {
    if (response.status === 401 && store.state.session.user) store.setUser(null);
    throw new ApiError(response.status, payload);
  }
  return payload;
}

export const api = {
  get: (path, options) => request('GET', path, options),
  post: (path, body, options) => request('POST', path, { ...options, body: body ?? {} }),
  patch: (path, body, options) => request('PATCH', path, { ...options, body: body ?? {} }),
  put: (path, body, options) => request('PUT', path, { ...options, body: body ?? {} }),
  del: (path, body, options) => request('DELETE', path, { ...options, body }),
};
