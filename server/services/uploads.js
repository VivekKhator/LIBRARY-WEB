import { mkdirSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { badRequest } from '../lib/errors.js';
import { uuid } from '../lib/auth-crypto.js';

const TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};
const MAX_BYTES = 2 * 1024 * 1024;

/** Accepts a data URL from the browser, validates it, and stores it under /uploads. */
export function saveDataUrl(dataUrl) {
  const match = /^data:([a-z0-9/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(dataUrl || '').trim());
  if (!match) throw badRequest('Upload must be a base64 data URL', { file: 'Unsupported image data' });
  const [, mime, b64] = match;
  const ext = TYPES[mime.toLowerCase()];
  if (!ext) throw badRequest(`Unsupported image type: ${mime}`, { file: 'Use PNG, JPEG, WebP, GIF or SVG' });
  const buffer = Buffer.from(b64.replace(/\s/g, ''), 'base64');
  if (!buffer.length) throw badRequest('That image is empty', { file: 'Empty file' });
  if (buffer.length > MAX_BYTES) throw badRequest('Images must be 2MB or smaller', { file: 'File too large' });
  if (ext === 'svg' && /<script|onload=|javascript:/i.test(buffer.toString('utf8'))) {
    throw badRequest('SVG uploads may not contain scripts', { file: 'Unsafe SVG' });
  }
  mkdirSync(config.uploadDir, { recursive: true });
  const name = `${uuid()}.${ext}`;
  writeFileSync(path.join(config.uploadDir, name), buffer);
  return { url: `/uploads/${name}`, bytes: buffer.length, mime };
}

export function deleteUpload(url) {
  const name = path.basename(String(url || ''));
  if (!name || name.includes('..')) return false;
  const target = path.join(config.uploadDir, name);
  if (!existsSync(target)) return false;
  unlinkSync(target);
  return true;
}
