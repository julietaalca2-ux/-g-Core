// Pruebas unitarias del adaptador PostgreSQL con un pool simulado (NO sustituyen las pruebas con PostgreSQL real).
import '../test-support/env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresDatabase } from '../src/db/postgres.js';

function fakePool() {
  const log = [];
  const client = { query: async sql => { log.push(String(sql).trim().split('\n')[0].slice(0, 60)); return { rows: [] }; }, release: () => log.push('RELEASE') };
  return { log, pool: { connect: async () => client, query: async sql => { log.push('POOL ' + sql); return { rows: [] }; }, end: async () => {} } };
}

test('migrate() con schema de pruebas: no lanza TDZ y crea schema + DDL en una transacción', async () => {
  const { log, pool } = fakePool();
  const db = await createPostgresDatabase('postgres://x', { schema: 'ogtest_abcdef012345', pool });
  await db.migrate();
  assert.equal(log[0], 'BEGIN');
  assert.equal(log[1], 'CREATE SCHEMA IF NOT EXISTS ogtest_abcdef012345');
  assert.match(log[2], /CREATE TABLE/);
  assert.equal(log[3], 'COMMIT');
  assert.equal(log.at(-1), 'RELEASE');
});
test('migrate() sin schema: no crea schemas', async () => {
  const { log, pool } = fakePool();
  await (await createPostgresDatabase('postgres://x', { pool })).migrate();
  assert.ok(!log.some(l => l.includes('CREATE SCHEMA')));
});
test('migrate() hace ROLLBACK y libera la conexión si falla', async () => {
  const log = [];
  const client = { query: async sql => { log.push(String(sql).slice(0, 12)); if (/CREATE TABLE/.test(sql)) throw new Error('boom'); return {}; }, release: () => log.push('RELEASE') };
  const db = await createPostgresDatabase('postgres://x', { pool: { connect: async () => client, query: async () => ({}) } });
  await assert.rejects(db.migrate(), /boom/);
  assert.ok(log.includes('ROLLBACK')); assert.equal(log.at(-1), 'RELEASE');
});
test('nombres de schema peligrosos o ajenos a las pruebas se rechazan', async () => {
  for (const bad of ['public', 'ogtest_x; DROP SCHEMA public', 'og_prod', 'OGTEST_ABCDEF', '', 'ogtest_']) {
    await assert.rejects(createPostgresDatabase('postgres://x', { schema: bad, pool: fakePool().pool }), /inválido/, bad);
  }
});
test('dropSchema() solo elimina su propio schema de pruebas', async () => {
  const { log, pool } = fakePool();
  const db = await createPostgresDatabase('postgres://x', { schema: 'ogtest_abcdef012345', pool });
  await db.dropSchema();
  assert.deepEqual(log, ['POOL DROP SCHEMA IF EXISTS ogtest_abcdef012345 CASCADE']);
  const noSchema = fakePool();
  await (await createPostgresDatabase('postgres://x', { pool: noSchema.pool })).dropSchema();
  assert.deepEqual(noSchema.log, []); // sin schema de pruebas no ejecuta nada
});
