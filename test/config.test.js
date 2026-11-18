import '../test-support/env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, ConfigError } from '../src/config.js';

const ok = { JWT_SECRET: 'a'.repeat(40), CORE_SETUP_KEY: 'b'.repeat(30) };

test('loadConfig: valores por defecto y CORS parseado', () => {
  const { config, corsOrigins } = loadConfig({ ...ok, CORS_ORIGINS: 'http://a.test, http://b.test' });
  assert.equal(config.DATABASE_DRIVER, 'sqlite');
  assert.equal(config.PORT, 8787);
  assert.deepEqual(corsOrigins, ['http://a.test', 'http://b.test']);
});
test('loadConfig: secretos cortos o de ejemplo lanzan ConfigError con detalle legible', () => {
  for (const bad of [{ ...ok, JWT_SECRET: 'corto' }, { ...ok, JWT_SECRET: 'REEMPLAZAR_' + 'x'.repeat(40) }, { ...ok, CORE_SETUP_KEY: 'REEMPLAZAR_' + 'x'.repeat(40) }, {}]) {
    assert.throws(() => loadConfig(bad), e => e instanceof ConfigError && /JWT_SECRET|CORE_SETUP_KEY/.test(e.message));
  }
});
test('loadConfig: postgres exige DATABASE_URL', () => {
  assert.throws(() => loadConfig({ ...ok, DATABASE_DRIVER: 'postgres' }), /DATABASE_URL/);
  assert.equal(loadConfig({ ...ok, DATABASE_DRIVER: 'postgres', DATABASE_URL: 'postgres://x' }).config.DATABASE_DRIVER, 'postgres');
});
test('el entorno de pruebas es hermético (no depende del shell ni de .env)', () => {
  assert.equal(process.env.DATABASE_DRIVER, 'sqlite');
  assert.equal(process.env.NODE_ENV, 'test');
});
