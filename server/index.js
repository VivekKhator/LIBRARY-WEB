import http from 'node:http';
import { createApp } from './app.js';
import { config } from './config.js';
import { getDb, closeDb } from './db/index.js';
import { logger } from './lib/logger.js';
import { sweepDueLoans } from './services/loans.js';
import { ensureSeed } from '../scripts/seed.js';

getDb();
await ensureSeed({ quiet: true });

const server = http.createServer(createApp());
server.keepAliveTimeout = 65_000;
server.headersTimeout = 70_000;

if (config.isProd) {
  if (!config.sessionSecretProvided) {
    logger.warn('SESSION_SECRET is not set: a new key is generated per boot, so every restart signs everyone out');
  }
  if (!process.env.SEED_ADMIN_PASSWORD) {
    logger.warn('Demo accounts are seeded with published passwords; set SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD before exposing this publicly');
  }
  if (config.isServerless) {
    logger.warn('Serverless filesystem detected: data in /tmp is per-instance and lost on cold start');
  }
}

server.listen(config.port, config.host, () => {
  logger.info(`BiblioBazaar listening on http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`, {
    env: config.env,
    db: config.dbPath,
  });
  try {
    const swept = sweepDueLoans();
    if (swept.notified) logger.info('loan reminders sent', swept);
  } catch (err) {
    logger.warn('loan sweep failed', { message: err.message });
  }
});

// Daily due-date sweep keeps borrow reminders flowing for long-running processes.
const daily = setInterval(() => {
  try {
    sweepDueLoans();
  } catch (err) {
    logger.warn('loan sweep failed', { message: err.message });
  }
}, 24 * 60 * 60 * 1000);
daily.unref?.();

const shutdown = (signal) => () => {
  logger.info(`${signal} received, shutting down`);
  server.close(() => {
    closeDb();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGINT', shutdown('SIGINT'));
process.on('SIGTERM', shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => logger.error('unhandled rejection', { message: String(reason) }));

export { server };
