import { config } from '../config.js';
import { createSqliteDatabase } from './sqlite.js';
import { createPostgresDatabase } from './postgres.js';

export async function createDatabase() {
  const db = config.DATABASE_DRIVER === 'postgres'
    ? await createPostgresDatabase(config.DATABASE_URL)
    : createSqliteDatabase(config.SQLITE_PATH);
  await db.migrate();
  return db;
}
