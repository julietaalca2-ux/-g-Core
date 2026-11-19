import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';
import { hashPassword } from '../../src/security/passwords.js';
import { config } from '../../src/config.js';

const SETUP_KEY = process.env.CORE_SETUP_KEY;
const PASSWORD = 'UnaClaveSegura-2026!';

/** Falla mostrando método, ruta y cuerpo recibido, para identificar rápido qué endpoint se comportó mal. */
function expectStatus(result, expected, what = '') {
  assert.equal(result.status, expected, `${what} esperado HTTP ${expected}, recibido ${result.status}; cuerpo: ${JSON.stringify(result.json)}`.trim());
}

async function boot(db, overrides = {}) {
  const cfg = { ...config, ...overrides };
  const app = createApp({ db, config: cfg, corsOrigins: ['http://localhost:3000'] });
  const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, { body, token, raw } = {}) => {
    let res;
    try {
      res = await fetch(base + path, {
      method,
      headers: { ...(body !== undefined || raw ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined)
      });
    } catch (e) {
      throw new Error(`${method} ${path} no obtuvo respuesta: ${e.message} (causa: ${e.cause?.code ?? e.cause?.message ?? 'desconocida'})`);
    }
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status, json };
  };
  return { call, close: () => new Promise(r => server.close(r)) };
}

/** Suite compartida: se ejecuta contra SQLite y contra PostgreSQL con las mismas aserciones. */
export function runApiSuite(label, makeDb) {
  test(`[${label}] flujo completo: setup, login, me, admin, seguridad`, async t => {
    const db = await makeDb();
    const app = await boot(db);
    t.after(async () => { await app.close(); try { await db.dropSchema?.(); } finally { await db.close(); } });
    const { call } = app;

    await t.test('setup: validación y clave incorrecta', async () => {
      expectStatus(await call('POST', '/api/v1/auth/setup', { body: {} }), 400);
      const weak = await call('POST', '/api/v1/auth/setup', { body: { setupKey: SETUP_KEY, email: 'o@og.test', password: 'corta', displayName: 'Owner' } });
      assert.equal(weak.status, 400);
      const bad = await call('POST', '/api/v1/auth/setup', { body: { setupKey: 'x'.repeat(30), email: 'o@og.test', password: PASSWORD, displayName: 'Owner' } });
      assert.equal(bad.status, 403);
      assert.equal(await db.countOwners(), 0);
    });

    let ownerToken;
    await t.test('setup: crea propietario y no filtra password_hash', async () => {
      const r = await call('POST', '/api/v1/auth/setup', { body: { setupKey: SETUP_KEY, email: 'Owner@OG.test', password: PASSWORD, displayName: 'Owner' } });
      expectStatus(r, 201, 'setup:');
      assert.equal(r.json.user.email, 'owner@og.test');
      assert.equal(r.json.user.role, 'owner');
      assert.equal(r.json.user.password_hash, undefined);
      ownerToken = r.json.accessToken;
    });

    await t.test('setup: segundo intento → 409', async () => {
      const r = await call('POST', '/api/v1/auth/setup', { body: { setupKey: SETUP_KEY, email: 'otro@og.test', password: PASSWORD, displayName: 'Otro' } });
      expectStatus(r, 409, 'segundo setup:');
    });

    await t.test('setup concurrente: el índice único impide un segundo propietario', async () => {
      await assert.rejects(db.createUser({ email: 'dup@og.test', passwordHash: await hashPassword(PASSWORD), displayName: 'Dup', role: 'owner' }));
      assert.equal(await db.countOwners(), 1);
    });

    await t.test('login: correcto, incorrecto, inexistente y mismo mensaje', async () => {
      const ok = await call('POST', '/api/v1/auth/login', { body: { email: 'OWNER@og.test', password: PASSWORD } });
      expectStatus(ok, 200, 'login correcto:');
      assert.ok(ok.json.accessToken);
      assert.equal(ok.json.user.password_hash, undefined);
      const wrong = await call('POST', '/api/v1/auth/login', { body: { email: 'owner@og.test', password: 'mala-clave-123' } });
      const ghost = await call('POST', '/api/v1/auth/login', { body: { email: 'nadie@og.test', password: 'mala-clave-123' } });
      assert.equal(wrong.status, 401);
      assert.equal(ghost.status, 401);
      assert.deepEqual(wrong.json, ghost.json);
    });

    await t.test('/me: token válido, ausente, manipulado y firmado con otra clave', async () => {
      assert.equal((await call('GET', '/api/v1/auth/me', { token: ownerToken })).json.user.email, 'owner@og.test');
      expectStatus(await call('GET', '/api/v1/auth/me'), 401);
      expectStatus(await call('GET', '/api/v1/auth/me', { token: ownerToken + 'x' }), 401);
      const { default: jwt } = await import('jsonwebtoken');
      const forged = jwt.sign({ sub: 'x', role: 'owner' }, 'otra-clave-completamente-distinta-0123456789', { issuer: 'og-core' });
      expectStatus(await call('GET', '/api/v1/auth/me', { token: forged }), 401);
      const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: 'x', role: 'owner', iss: 'og-core' })).toString('base64url') + '.';
      expectStatus(await call('GET', '/api/v1/auth/me', { token: none }), 401);
    });

    await t.test('admin: auditoría solo owner/admin, límites acotados', async () => {
      expectStatus(await call('GET', '/api/v1/admin/audit'), 401);
      const user = await db.createUser({ email: 'user@og.test', passwordHash: await hashPassword(PASSWORD), displayName: 'User', role: 'user' });
      const login = await call('POST', '/api/v1/auth/login', { body: { email: 'user@og.test', password: PASSWORD } });
      expectStatus(await call('GET', '/api/v1/admin/audit', { token: login.json.accessToken }), 403);
      const r = await call('GET', '/api/v1/admin/audit?limit=99999', { token: ownerToken });
      assert.equal(r.status, 200);
      assert.ok(r.json.items.length <= 100);
      const actions = r.json.items.map(i => i.action);
      for (const a of ['owner.initialized', 'owner.setup_denied', 'auth.login', 'auth.login_failed']) assert.ok(actions.includes(a), `falta auditoría ${a}`);
      assert.equal(typeof r.json.items[0].metadata, 'object');
      expectStatus(await call('GET', '/api/v1/admin/audit?limit=abc', { token: ownerToken }), 200);
      // usuario suspendido: ni login ni token existente
      await db.setUserStatus(user.id, 'suspended');
      expectStatus(await call('GET', '/api/v1/auth/me', { token: login.json.accessToken }), 401);
      expectStatus(await call('POST', '/api/v1/auth/login', { body: { email: 'user@og.test', password: PASSWORD } }), 401);
    });

    await t.test('robustez: JSON inválido → 400, cuerpo enorme → 413, ruta inexistente → 404', async () => {
      expectStatus(await call('POST', '/api/v1/auth/login', { raw: '{malo' }), 400);
      expectStatus(await call('POST', '/api/v1/auth/login', { raw: JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(40000) }) }), 413);
      expectStatus(await call('GET', '/no-existe'), 404);
    });
  });

  test(`[${label}] rate limit de autenticación`, async t => {
    const db = await makeDb();
    const app = await boot(db, { AUTH_RATE_LIMIT_MAX: 3 });
    t.after(async () => { await app.close(); try { await db.dropSchema?.(); } finally { await db.close(); } });
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await app.call('POST', '/api/v1/auth/login', { body: { email: 'x@og.test', password: 'mala-clave-123' } })).status);
    assert.deepEqual(statuses, [401, 401, 401, 429, 429]);
  });
}
