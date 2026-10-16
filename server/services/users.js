import { all, get, run, transaction } from '../db/index.js';
import { config } from '../config.js';
import { conflict, forbidden, notFound, unauthorized } from '../lib/errors.js';
import { digestToken, hashPassword, newCsrfToken, newSessionToken, verifyPassword } from '../lib/auth-crypto.js';
import * as present from './present.js';

const USER_COLUMNS = 'id, email, password_hash, name, role, status, bio, store_name, store_slug, store_bio, created_at, updated_at';

export const findUserById = (id) => get(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, [id]);
export const findUserByEmail = (email) => get(`SELECT ${USER_COLUMNS} FROM users WHERE email = ?`, [String(email).toLowerCase()]);
export const findStore = (slug) =>
  get(`SELECT ${USER_COLUMNS} FROM users WHERE store_slug = ? AND role IN ('seller','admin')`, [slug]);

export function registerUser({ email, password, name }) {
  if (findUserByEmail(email)) throw conflict('An account with that email already exists');
  const res = run('INSERT INTO users (email, password_hash, name) VALUES (?,?,?)', [
    email.toLowerCase(), hashPassword(password), name,
  ]);
  return findUserById(Number(res.lastInsertRowid));
}

export function authenticate({ email, password }) {
  const user = findUserByEmail(email);
  // Constant-ish work either way so a missing account is not distinguishable by timing.
  const ok = user ? verifyPassword(password, user.password_hash) : verifyPassword(password, hashPassword('decoy-value'));
  if (!user || !ok) throw unauthorized('Email or password is incorrect');
  if (user.status === 'suspended') throw forbidden('This account has been suspended. Contact support.');
  return user;
}

export function createSession(userId, { userAgent = '', ip = '' } = {}) {
  const token = newSessionToken();
  const csrf = newCsrfToken();
  const expiresAt = new Date(Date.now() + config.sessionTtlDays * 86_400_000).toISOString();
  run('INSERT INTO sessions (token_hash, user_id, csrf_token, user_agent, ip, expires_at) VALUES (?,?,?,?,?,?)', [
    digestToken(token), userId, csrf, String(userAgent).slice(0, 255), ip, expiresAt,
  ]);
  return { token, csrf, expiresAt };
}

export function resolveSession(token) {
  if (!token) return null;
  const hash = digestToken(token);
  const row = get(
    `SELECT s.token_hash, s.csrf_token, s.expires_at,
            u.id, u.email, u.password_hash, u.name, u.role, u.status, u.bio,
            u.store_name, u.store_slug, u.store_bio, u.created_at, u.updated_at
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
    [hash],
  );
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    run('DELETE FROM sessions WHERE token_hash = ?', [hash]);
    return null;
  }
  run("UPDATE sessions SET last_seen_at = datetime('now') WHERE token_hash = ?", [hash]);
  return { user: row, csrf: row.csrf_token, tokenHash: hash };
}

export const destroySession = (token) => run('DELETE FROM sessions WHERE token_hash = ?', [digestToken(token)]);
export const destroyAllSessions = (userId) => run('DELETE FROM sessions WHERE user_id = ?', [userId]);
export const listSessions = (userId, currentHash) =>
  all('SELECT token_hash, user_agent, ip, created_at, last_seen_at, expires_at FROM sessions WHERE user_id = ? ORDER BY datetime(last_seen_at) DESC', [userId]).map((s) => ({
    id: s.token_hash.slice(0, 12),
    current: s.token_hash === currentHash,
    userAgent: s.user_agent,
    ip: s.ip,
    createdAt: s.created_at,
    lastSeenAt: s.last_seen_at,
    expiresAt: s.expires_at,
  }));

export function updateProfile(userId, { name, bio }) {
  run("UPDATE users SET name = COALESCE(?, name), bio = COALESCE(?, bio), updated_at = datetime('now') WHERE id = ?", [
    name ?? null, bio ?? null, userId,
  ]);
  return findUserById(userId);
}

export function changePassword(userId, { currentPassword, newPassword }) {
  const user = findUserById(userId);
  if (!user) throw notFound('Account not found');
  if (!verifyPassword(currentPassword, user.password_hash)) throw unauthorized('Current password is incorrect');
  run("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?", [hashPassword(newPassword), userId]);
  return true;
}

export function becomeSeller(userId, { storeName, storeBio = '' }) {
  const user = findUserById(userId);
  if (!user) throw notFound('Account not found');
  const base = slugify(storeName);
  let slug = base;
  let n = 1;
  while (get('SELECT id FROM users WHERE store_slug = ? AND id <> ?', [slug, userId])) slug = `${base}-${++n}`;
  run(
    `UPDATE users SET store_name = ?, store_slug = ?, store_bio = ?,
       role = CASE WHEN role = 'admin' THEN 'admin' ELSE 'seller' END, updated_at = datetime('now') WHERE id = ?`,
    [storeName, slug, storeBio, userId],
  );
  return findUserById(userId);
}

export function updateStore(userId, { storeName, storeBio }) {
  const user = findUserById(userId);
  if (!user?.store_slug) throw forbidden('Open a storefront first');
  run("UPDATE users SET store_name = COALESCE(?, store_name), store_bio = COALESCE(?, store_bio), updated_at = datetime('now') WHERE id = ?", [
    storeName ?? null, storeBio ?? null, userId,
  ]);
  return findUserById(userId);
}

// ---------- addresses ----------
export const listAddresses = (userId) =>
  all('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC', [userId]).map(present.address);

export const getAddress = (userId, id) => get('SELECT * FROM addresses WHERE user_id = ? AND id = ?', [userId, id]);

export function createAddress(userId, data) {
  return transaction(() => {
    const count = get('SELECT COUNT(*) AS c FROM addresses WHERE user_id = ?', [userId]).c;
    const isDefault = data.isDefault || count === 0 ? 1 : 0;
    if (isDefault) run('UPDATE addresses SET is_default = 0 WHERE user_id = ?', [userId]);
    const res = run(
      `INSERT INTO addresses (user_id, label, full_name, line1, line2, city, state, postal_code, country, phone, is_default)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [userId, data.label, data.fullName, data.line1, data.line2 || '', data.city, data.state || '', data.postalCode,
        data.country, data.phone || '', isDefault],
    );
    return present.address(get('SELECT * FROM addresses WHERE id = ?', [Number(res.lastInsertRowid)]));
  });
}

export function updateAddress(userId, id, data) {
  const existing = getAddress(userId, id);
  if (!existing) throw notFound('Address not found');
  return transaction(() => {
    if (data.isDefault) run('UPDATE addresses SET is_default = 0 WHERE user_id = ?', [userId]);
    run(
      `UPDATE addresses SET label=COALESCE(?,label), full_name=COALESCE(?,full_name), line1=COALESCE(?,line1),
         line2=COALESCE(?,line2), city=COALESCE(?,city), state=COALESCE(?,state), postal_code=COALESCE(?,postal_code),
         country=COALESCE(?,country), phone=COALESCE(?,phone), is_default=COALESCE(?,is_default)
       WHERE user_id = ? AND id = ?`,
      [data.label ?? null, data.fullName ?? null, data.line1 ?? null, data.line2 ?? null, data.city ?? null,
        data.state ?? null, data.postalCode ?? null, data.country ?? null, data.phone ?? null,
        data.isDefault === undefined ? null : data.isDefault ? 1 : 0, userId, id],
    );
    return present.address(getAddress(userId, id));
  });
}

export function deleteAddress(userId, id) {
  const existing = getAddress(userId, id);
  if (!existing) throw notFound('Address not found');
  return transaction(() => {
    run('DELETE FROM addresses WHERE user_id = ? AND id = ?', [userId, id]);
    if (existing.is_default) {
      const next = get('SELECT id FROM addresses WHERE user_id = ? ORDER BY id DESC LIMIT 1', [userId]);
      if (next) run('UPDATE addresses SET is_default = 1 WHERE id = ?', [next.id]);
    }
    return true;
  });
}

export const slugify = (text) =>
  String(text).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'store';
