import '../test-support/env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { createApp } from '../src/app.js';

const { version: PKG_VERSION } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const config = { TRUST_PROXY:'false', RATE_LIMIT_WINDOW_MS:60000, RATE_LIMIT_MAX:100, AUTH_RATE_LIMIT_MAX:10, CORE_SETUP_KEY:'test-setup-key-that-is-long-enough' };
const calls = { findUserByEmail: 0, writeAudit: 0 };
const db = { countOwners:async()=>1, findUserByEmail:async()=>{ calls.findUserByEmail++; return null; }, findUserById:async()=>null, writeAudit:async()=>{ calls.writeAudit++; }, listAudit:async()=>[] };
const start = async (t, origins=['http://localhost:3000']) => {
  const server = createApp({db,config,corsOrigins:origins}).listen(0,'127.0.0.1');
  await new Promise(r => server.once('listening', r));
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}`;
};

test('health endpoint reports service status and version', async t => {
  const r = await fetch(`${await start(t)}/health`);
  assert.equal(r.status,200);
  const body = await r.json();
  assert.equal(body.service,'og-core');
  assert.equal(body.version,PKG_VERSION);
});
test('protected profile endpoint rejects missing token', async t => {
  assert.equal((await fetch(`${await start(t)}/api/v1/auth/me`)).status,401);
});
test('helmet y sin x-powered-by', async t => {
  const r = await fetch(`${await start(t)}/health`);
  assert.equal(r.headers.get('x-powered-by'),null);
  assert.ok(r.headers.get('x-content-type-options'));
});

// ---- CORS: se usa node:http porque fetch no garantiza poder fijar el encabezado Origin ----
const ALLOWED = 'http://localhost:3000';
function httpCall(base, { method = 'GET', path = '/health', headers = {}, body } = {}) {
  const url = new URL(base + path);
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: url.hostname, port: url.port, path: url.pathname, method, headers }, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => { let json = null; try { json = JSON.parse(data); } catch {} resolve({ status: res.statusCode, headers: res.headers, json }); });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

test('CORS: origen permitido recibe Access-Control-Allow-Origin con ese origen', async t => {
  const r = await httpCall(await start(t), { headers: { Origin: ALLOWED } });
  assert.equal(r.status, 200);
  assert.equal(r.headers['access-control-allow-origin'], ALLOWED);
});

test('CORS: origen bloqueado → 403 CORS_BLOCKED y sin Access-Control-Allow-Origin', async t => {
  const r = await httpCall(await start(t), { headers: { Origin: 'http://evil.example' } });
  assert.equal(r.status, 403);
  assert.equal(r.json.error.code, 'CORS_BLOCKED');
  assert.equal(r.headers['access-control-allow-origin'], undefined);
});

test('CORS: la coincidencia de origen es exacta (variantes engañosas bloqueadas)', async t => {
  const base = await start(t);
  for (const origin of ['http://localhost:3001', 'http://localhost:3000.evil.com', 'https://localhost:3000', 'http://LOCALHOST:3000', 'null']) {
    const r = await httpCall(base, { headers: { Origin: origin } });
    assert.equal(r.status, 403, origin);
    assert.equal(r.headers['access-control-allow-origin'], undefined, origin);
  }
});

test('CORS: sin Origin (curl, servidor a servidor) se atiende y no se envía Allow-Origin', async t => {
  const r = await httpCall(await start(t));
  assert.equal(r.status, 200);
  assert.equal(r.headers['access-control-allow-origin'], undefined);
});

test('CORS: preflight OPTIONS desde origen permitido → 204 con métodos y cabeceras permitidos', async t => {
  const r = await httpCall(await start(t), { method: 'OPTIONS', path: '/api/v1/auth/login', headers: {
    Origin: ALLOWED, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,authorization'
  } });
  assert.equal(r.status, 204);
  assert.equal(r.headers['access-control-allow-origin'], ALLOWED);
  assert.equal(r.headers['access-control-allow-methods'], 'GET,POST');
  assert.equal(r.headers['access-control-allow-headers'], 'Content-Type,Authorization');
});

test('CORS: preflight de método no permitido no lo anuncia (el navegador lo bloqueará)', async t => {
  const base = await start(t);
  for (const method of ['DELETE', 'PUT', 'PATCH']) {
    const r = await httpCall(base, { method: 'OPTIONS', path: '/api/v1/admin/audit', headers: { Origin: ALLOWED, 'Access-Control-Request-Method': method } });
    const allowed = String(r.headers['access-control-allow-methods'] ?? '');
    assert.ok(!allowed.split(',').includes(method), `${method} no debe figurar en Allow-Methods (${allowed})`);
    assert.equal(allowed, 'GET,POST');
  }
});

test('CORS: preflight desde origen bloqueado → 403 CORS_BLOCKED sin cabeceras de permiso', async t => {
  const r = await httpCall(await start(t), { method: 'OPTIONS', path: '/api/v1/auth/login', headers: { Origin: 'http://evil.example', 'Access-Control-Request-Method': 'POST' } });
  assert.equal(r.status, 403);
  assert.equal(r.json.error.code, 'CORS_BLOCKED');
  assert.equal(r.headers['access-control-allow-origin'], undefined);
  assert.equal(r.headers['access-control-allow-methods'], undefined);
});

test('CORS: una petición POST de origen bloqueado no llega al handler (sin lectura de usuarios ni auditoría)', async t => {
  const base = await start(t);
  calls.findUserByEmail = 0; calls.writeAudit = 0;
  const body = JSON.stringify({ email: 'a@og.test', password: 'cualquiera-123' });
  const r = await httpCall(base, { method: 'POST', path: '/api/v1/auth/login', headers: { Origin: 'http://evil.example', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, body });
  assert.equal(r.status, 403);
  assert.equal(calls.findUserByEmail, 0);
  assert.equal(calls.writeAudit, 0);
});

test('CORS: método no permitido en petición real → 404 de la app (CORS solo lo aplica el navegador)', async t => {
  const r = await httpCall(await start(t), { method: 'DELETE', path: '/api/v1/auth/login', headers: { Origin: ALLOWED } });
  assert.equal(r.status, 404);
});
