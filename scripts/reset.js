import { existsSync, rmSync } from 'node:fs';
import { config } from '../server/config.js';
import { clearStatementCache, closeDb } from '../server/db/index.js';
import { seed } from './seed.js';
import { logger } from '../server/lib/logger.js';

closeDb();
clearStatementCache();
for (const suffix of ['', '-wal', '-shm']) {
  const file = config.dbPath + suffix;
  if (existsSync(file)) rmSync(file);
}
logger.info('database removed', { path: config.dbPath });
seed();
logger.info('reset complete');
closeDb();
