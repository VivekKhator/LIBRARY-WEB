import { all, get, run } from '../db/index.js';
import * as present from './present.js';

export function notify(userId, { kind = 'info', title, body = '', link = '' }) {
  if (!userId || !title) return null;
  const res = run('INSERT INTO notifications (user_id, kind, title, body, link) VALUES (?,?,?,?,?)', [
    userId, kind, title, body, link,
  ]);
  return Number(res.lastInsertRowid);
}

export function listNotifications(userId, { limit = 30 } = {}) {
  const rows = all('SELECT * FROM notifications WHERE user_id = ? ORDER BY datetime(created_at) DESC, id DESC LIMIT ?', [
    userId, Math.min(limit, 100),
  ]);
  const unread = get('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL', [userId]).c;
  return { items: rows.map(present.notification), unread };
}

export function markRead(userId, id) {
  run("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND id = ? AND read_at IS NULL", [userId, id]);
  return listNotifications(userId);
}

export function markAllRead(userId) {
  run("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL", [userId]);
  return listNotifications(userId);
}
