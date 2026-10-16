import { validationError } from './errors.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/**
 * Declarative request validator.
 * Rules: { type, required, default, min, max, minLength, maxLength, enum, pattern, items, of, label, custom }
 * Types: string | text | email | slug | int | number | bool | enum | array | object | date | isbn
 */
export function validate(input, schema, { stripUnknown = true } = {}) {
  const value = {};
  const errors = {};
  const source = input && typeof input === 'object' ? input : {};

  for (const [key, ruleRaw] of Object.entries(schema)) {
    const rule = typeof ruleRaw === 'string' ? { type: ruleRaw } : ruleRaw;
    const label = rule.label || key.replace(/_/g, ' ');
    let raw = source[key];

    if (isBlank(raw)) {
      if (rule.default !== undefined) {
        value[key] = typeof rule.default === 'function' ? rule.default() : rule.default;
        continue;
      }
      if (rule.required) {
        errors[key] = `${cap(label)} is required`;
        continue;
      }
      if (raw === null && rule.nullable) value[key] = null;
      continue;
    }

    try {
      const parsed = coerce(raw, rule, label);
      const message = check(parsed, rule, label);
      if (message) errors[key] = message;
      else value[key] = parsed;
    } catch (err) {
      errors[key] = err.message;
    }
  }

  if (!stripUnknown) for (const [k, v] of Object.entries(source)) if (!(k in schema)) value[k] = v;
  if (Object.keys(errors).length) throw validationError(errors);
  return value;
}

function coerce(raw, rule, label) {
  switch (rule.type) {
    case 'string':
    case 'text':
      return String(raw).trim();
    case 'email':
      return String(raw).trim().toLowerCase();
    case 'slug':
      return String(raw).trim().toLowerCase();
    case 'password':
      return String(raw);
    case 'int': {
      const n = Number(raw);
      if (!Number.isFinite(n) || !Number.isInteger(n)) throw new Error(`${cap(label)} must be a whole number`);
      return n;
    }
    case 'number': {
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new Error(`${cap(label)} must be a number`);
      return n;
    }
    case 'bool':
      if (typeof raw === 'boolean') return raw;
      if (raw === 'true' || raw === '1' || raw === 1) return true;
      if (raw === 'false' || raw === '0' || raw === 0) return false;
      throw new Error(`${cap(label)} must be true or false`);
    case 'enum':
      return String(raw);
    case 'array': {
      const arr = Array.isArray(raw) ? raw : String(raw).split(',').map((s) => s.trim()).filter(Boolean);
      if (!rule.of) return arr;
      return arr.map((item) => coerce(item, { type: rule.of }, label));
    }
    case 'object':
      if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
      throw new Error(`${cap(label)} must be an object`);
    case 'date': {
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) throw new Error(`${cap(label)} must be a valid date`);
      return d.toISOString();
    }
    case 'isbn':
      return String(raw).replace(/[\s-]/g, '').toUpperCase();
    default:
      return raw;
  }
}

function check(v, rule, label) {
  const L = cap(label);
  if (rule.type === 'email' && !EMAIL_RE.test(v)) return 'Enter a valid email address';
  if (rule.type === 'slug' && !SLUG_RE.test(v)) return `${L} may only contain lowercase letters, numbers and dashes`;
  if (rule.type === 'isbn' && !/^(?:\d{9}[\dX]|\d{13})$/.test(v)) return 'Enter a valid 10 or 13 digit ISBN';
  if (rule.enum && !rule.enum.includes(v)) return `${L} must be one of: ${rule.enum.join(', ')}`;
  if (typeof v === 'string') {
    if (rule.minLength && v.length < rule.minLength) return `${L} must be at least ${rule.minLength} characters`;
    if (rule.maxLength && v.length > rule.maxLength) return `${L} must be ${rule.maxLength} characters or fewer`;
    if (rule.pattern && !rule.pattern.test(v)) return rule.patternMessage || `${L} is not in the expected format`;
  }
  if (typeof v === 'number') {
    if (rule.min !== undefined && v < rule.min) return `${L} must be ${rule.min} or more`;
    if (rule.max !== undefined && v > rule.max) return `${L} must be ${rule.max} or less`;
  }
  if (Array.isArray(v)) {
    if (rule.minLength && v.length < rule.minLength) return `${L} needs at least ${rule.minLength} item(s)`;
    if (rule.maxLength && v.length > rule.maxLength) return `${L} allows at most ${rule.maxLength} item(s)`;
  }
  if (rule.custom) {
    const res = rule.custom(v);
    if (typeof res === 'string') return res;
  }
  return null;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Password policy shared by register / password change. */
export const passwordRule = {
  type: 'password',
  required: true,
  minLength: 8,
  maxLength: 128,
  label: 'password',
  custom: (v) => {
    if (!/[A-Za-z]/.test(v)) return 'Password must contain at least one letter';
    if (!/[0-9]/.test(v)) return 'Password must contain at least one number';
    return true;
  },
};
