import './support/env.js';
import { createSqliteDatabase } from '../src/db/sqlite.js';
import { runApiSuite } from './support/api-suite.js';

runApiSuite('sqlite', async () => {
  const db = createSqliteDatabase(':memory:');
  await db.migrate();
  return db;
});
