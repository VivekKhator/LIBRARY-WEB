import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

const here = path.dirname(fileURLToPath(import.meta.url));
let db = null;

export function getDb() {
  if (db) return db;
  if (config.dbPath !== ':memory:') mkdirSync(path.dirname(config.dbPath), { recursive: true });
  db = new DatabaseSync(config.dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec(readFileSync(path.join(here, 'schema.sql'), 'utf8'));
  logger.debug('database ready', { path: config.dbPath });
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

/** Statement cache: node:sqlite statements are reusable and prepared lazily. */
const cache = new Map();
const prepare = (sql) => {
  let stmt = cache.get(sql);
  if (!stmt) {
    stmt = getDb().prepare(sql);
    cache.set(sql, stmt);
  }
  return stmt;
};
export const clearStatementCache = () => cache.clear();

const normalize = (params) => {
  if (params === undefined) return [];
  if (Array.isArray(params)) return params.map(sanitize);
  if (params && typeof params === 'object') {
    return [Object.fromEntries(Object.entries(params).map(([k, v]) => [k, sanitize(v)]))];
  }
  return [sanitize(params)];
};

// node:sqlite only binds null/number/bigint/string/Buffer.
const sanitize = (v) => {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object' && !Buffer.isBuffer(v)) return JSON.stringify(v);
  return v;
};

export const all = (sql, params) => prepare(sql).all(...normalize(params));
export const get = (sql, params) => prepare(sql).get(...normalize(params)) ?? null;
export const run = (sql, params) => prepare(sql).run(...normalize(params));
export const pluck = (sql, params) => {
  const row = get(sql, params);
  if (!row) return null;
  const keys = Object.keys(row);
  return keys.length ? row[keys[0]] : null;
};
export const exec = (sql) => getDb().exec(sql);

/** Synchronous transaction helper with savepoint nesting support. */
let depth = 0;
export function transaction(fn) {
  const database = getDb();
  const isNested = depth > 0;
  const name = `sp_${depth}`;
  depth += 1;
  database.exec(isNested ? `SAVEPOINT ${name}` : 'BEGIN');
  try {
    const result = fn();
    database.exec(isNested ? `RELEASE ${name}` : 'COMMIT');
    return result;
  } catch (err) {
    try {
      database.exec(isNested ? `ROLLBACK TO ${name}; RELEASE ${name}` : 'ROLLBACK');
    } catch (rollbackErr) {
      logger.error('rollback failed', { message: rollbackErr.message });
    }
    throw err;
  } finally {
    depth -= 1;
  }
}

export const nowIso = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
