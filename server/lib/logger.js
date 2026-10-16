import { config } from '../config.js';

const LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };
const threshold = LEVELS[config.logLevel] ?? LEVELS.info;

const emit = (level, msg, meta) => {
  if ((LEVELS[level] ?? 3) > threshold) return;
  const time = new Date().toISOString();
  const tail = meta && Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
  const line = `${time} ${level.toUpperCase().padEnd(5)} ${msg}${tail}`;
  if (level === 'error') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
};

export const logger = {
  error: (msg, meta) => emit('error', msg, meta),
  warn: (msg, meta) => emit('warn', msg, meta),
  info: (msg, meta) => emit('info', msg, meta),
  debug: (msg, meta) => emit('debug', msg, meta),
};
