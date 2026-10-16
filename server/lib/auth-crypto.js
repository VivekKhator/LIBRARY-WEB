import { createHmac, randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { config } from '../config.js';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }).toString('hex');
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, salt, hash] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const derived = scryptSync(password, salt, hash.length / 2, { N: Number(N), r: Number(r), p: Number(p) });
    const expected = Buffer.from(hash, 'hex');
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** Session tokens: random secret sent to the client, only a keyed digest is persisted. */
export const newSessionToken = () => randomBytes(32).toString('base64url');
export const digestToken = (token) => createHmac('sha256', config.sessionSecret).update(token).digest('hex');
export const newCsrfToken = () => randomBytes(24).toString('base64url');
export const safeEqual = (a, b) => {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && timingSafeEqual(ab, bb);
};
export const sha256 = (input) => createHash('sha256').update(input).digest('hex');
export const uuid = () => randomBytes(16).toString('hex');
