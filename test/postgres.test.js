import './support/env.js';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { createPostgresDatabase } from '../src/db/postgres.js';
import { runApiSuite } from './support/api-suite.js';
import { runAccountsSuite } from './support/accounts-suite.js';

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  test('[postgres] OMITIDO: definí TEST_DATABASE_URL para ejecutar estas pruebas', { skip: true }, () => {});
} else {
  // Cada prueba usa un schema aislado que se elimina al terminar; no toca otras tablas.
  const makeDb = async () => {
    const db = await createPostgresDatabase(url, { schema: 'ogtest_' + randomBytes(6).toString('hex') });
    await db.migrate();
    return db;
  };
  runApiSuite('postgres', makeDb);
  runAccountsSuite('postgres', makeDb);
}
