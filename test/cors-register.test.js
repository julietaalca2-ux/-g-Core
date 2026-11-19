// Regresión del error "Origen no permitido" al registrar cuentas.
// Cubre los dos dominios reales de ÖG:
//   - https://g-core.onrender.com            → la web se sirve desde el propio backend (mismo origen)
//   - https://julietaalca2-ux.github.io      → GitHub Pages (origen distinto; CORS_ORIGINS puesto con barra final a propósito)
import './support/env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { createSqliteDatabase } from '../src/db/sqlite.js';
import { loadConfig, normalizeOrigin, parseOrigins, ConfigError } from '../src/config.js';

const RENDER = 'https://g-core.onrender.com';
const RENDER_HOST = 'g-core.onrender.com';
const PAGES = 'https://julietaalca2-ux.github.io';
const PASSWORD = 'UnaClaveSegura-2026!';

const baseEnv = {
  JWT_SECRET: 'test-only-jwt-secret-0123456789abcdef-xyz',
  CORE_SETUP_KEY: 'test-only-setup-key-0123456789abcdef',
  AUTH_RATE_LIMIT_MAX: '1000',
  RATE_LIMIT_MAX: '1000'
};

/** Arranca la app real (SQLite en memoria) con la configuración que produciría Render. */
async function start(t, env = {}) {
  const { config, corsOrigins } = loadConfig({ ...baseEnv, ...env });
  const db = createSqliteDatabase(':memory:');
  await db.migrate();
  const server = createApp({ db, config, corsOrigins }).listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  t.after(async () => { await new Promise(r => server.close(r)); await db.close?.(); });
  return { port: server.address().port, db, corsOrigins };
}

/** node:http permite fijar Origin y Host exactos (fetch no lo garantiza). */
function call(port, { method = 'GET', path = '/health', headers = {}, json } = {}) {
  const body = json !== undefined ? JSON.stringify(json) : undefined;
  const h = { ...headers };
  if (body) { h['Content-Type'] = 'application/json'; h['Content-Length'] = Buffer.byteLength(body); }
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers: h }, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => { let j = null; try { j = JSON.parse(data); } catch {} resolve({ status: res.statusCode, headers: res.headers, json: j }); });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

let n = 0;
const newUser = () => ({ email: `cors${++n}-${Date.now()}@og.test`, password: PASSWORD, displayName: 'Prueba CORS' });

// ───────────── Normalización de orígenes (configuración) ─────────────
test('normalizeOrigin: quita barra final, ruta y mayúsculas; rechaza comodín y basura', () => {
  assert.equal(normalizeOrigin('https://julietaalca2-ux.github.io/'), PAGES);
  assert.equal(normalizeOrigin('https://julietaalca2-ux.github.io/-g-Core/'), PAGES);
  assert.equal(normalizeOrigin('  HTTPS://JulietaAlca2-UX.github.io  '), PAGES);
  assert.equal(normalizeOrigin('https://g-core.onrender.com:443'), RENDER);
  assert.equal(normalizeOrigin('http://localhost:3000/'), 'http://localhost:3000');
  for (const bad of ['*', 'null', '', 'g-core.onrender.com', 'ftp://x.test', 'javascript:alert(1)', 'https://user:pw@x.test', undefined, 42]) {
    assert.equal(normalizeOrigin(bad), null, String(bad));
  }
});

test('parseOrigins: deduplica y falla con "*" o entradas inválidas (nunca abre CORS en silencio)', () => {
  assert.deepEqual(parseOrigins(`${PAGES}/, ${PAGES}, http://localhost:3000`), [PAGES, 'http://localhost:3000']);
  assert.throws(() => parseOrigins('*'), e => e instanceof ConfigError && /comodín/.test(e.message));
  assert.throws(() => parseOrigins(`${PAGES},no-es-un-origen`), e => e instanceof ConfigError && /no-es-un-origen/.test(e.message));
});

test('loadConfig: CORS_ORIGINS con barra final queda normalizado y RENDER_EXTERNAL_URL se agrega como origen propio', () => {
  const { corsOrigins } = loadConfig({ ...baseEnv, CORS_ORIGINS: `${PAGES}/`, RENDER_EXTERNAL_URL: `${RENDER}/` });
  assert.deepEqual(corsOrigins, [PAGES, RENDER]);
  const withPublic = loadConfig({ ...baseEnv, CORS_ORIGINS: PAGES, PUBLIC_URL: RENDER });
  assert.deepEqual(withPublic.corsOrigins, [PAGES, RENDER]);
  assert.throws(() => loadConfig({ ...baseEnv, CORS_ORIGINS: '*' }), /comodín/);
});

// ───────────── Dominio 1: Render (mismo origen: la web la sirve el propio backend) ─────────────
test('REGRESIÓN: POST /register desde https://g-core.onrender.com (mismo origen) → 201, incluso con CORS_ORIGINS solo de GitHub Pages', async t => {
  // Es exactamente el escenario del log: Origin=https://g-core.onrender.com y lista = ['https://julietaalca2-ux.github.io/'].
  const { port } = await start(t, { CORS_ORIGINS: `${PAGES}/`, TRUST_PROXY: 'true' });
  const r = await call(port, { method: 'POST', path: '/api/v1/auth/register', json: newUser(),
    headers: { Origin: RENDER, Host: RENDER_HOST, 'X-Forwarded-Proto': 'https' } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.headers['access-control-allow-origin'], RENDER);
  assert.ok(r.json.accessToken || r.json.token, 'debe devolver token de sesión');
});

test('POST /register desde Render también funciona con TRUST_PROXY=false si RENDER_EXTERNAL_URL está definido (lo fija Render)', async t => {
  const { port } = await start(t, { CORS_ORIGINS: PAGES, TRUST_PROXY: 'false', RENDER_EXTERNAL_URL: RENDER });
  const r = await call(port, { method: 'POST', path: '/api/v1/auth/register', json: newUser(), headers: { Origin: RENDER, Host: RENDER_HOST } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.headers['access-control-allow-origin'], RENDER);
});

test('preflight OPTIONS desde Render → 204 con métodos y cabeceras correctos', async t => {
  const { port } = await start(t, { CORS_ORIGINS: PAGES, TRUST_PROXY: 'true' });
  const r = await call(port, { method: 'OPTIONS', path: '/api/v1/auth/register', headers: {
    Origin: RENDER, Host: RENDER_HOST, 'X-Forwarded-Proto': 'https',
    'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
  assert.equal(r.status, 204);
  assert.equal(r.headers['access-control-allow-origin'], RENDER);
});

test('las peticiones sin Origin (GET del mismo origen, curl, health checks de Render) se atienden', async t => {
  const { port } = await start(t, { CORS_ORIGINS: PAGES });
  assert.equal((await call(port, { path: '/health' })).status, 200);
  const r = await call(port, { method: 'POST', path: '/api/v1/auth/register', json: newUser() });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.headers['access-control-allow-origin'], undefined);
});

// ───────────── Dominio 2: GitHub Pages (origen distinto) ─────────────
test('preflight OPTIONS desde GitHub Pages → 204 y Allow-Origin exacto (nunca "*")', async t => {
  const { port } = await start(t, { CORS_ORIGINS: `${PAGES}/` }); // barra final a propósito
  const r = await call(port, { method: 'OPTIONS', path: '/api/v1/auth/register', headers: {
    Origin: PAGES, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,authorization' } });
  assert.equal(r.status, 204);
  assert.equal(r.headers['access-control-allow-origin'], PAGES);
  assert.notEqual(r.headers['access-control-allow-origin'], '*');
  assert.equal(r.headers['access-control-allow-methods'], 'GET,POST,PATCH,DELETE');
  assert.equal(r.headers['access-control-allow-headers'], 'Content-Type,Authorization');
  assert.match(String(r.headers.vary), /Origin/i);
});

test('POST /register desde GitHub Pages → 201; luego login y /me con JWT siguen funcionando', async t => {
  const { port } = await start(t, { CORS_ORIGINS: `${PAGES}/` });
  const u = newUser();
  const reg = await call(port, { method: 'POST', path: '/api/v1/auth/register', json: u, headers: { Origin: PAGES } });
  assert.equal(reg.status, 201, JSON.stringify(reg.json));
  assert.equal(reg.headers['access-control-allow-origin'], PAGES);
  assert.equal(reg.json.user.role, 'user');

  const login = await call(port, { method: 'POST', path: '/api/v1/auth/login', json: { email: u.email, password: u.password }, headers: { Origin: PAGES } });
  assert.equal(login.status, 200, JSON.stringify(login.json));
  const token = login.json.accessToken || login.json.token;
  assert.ok(token);

  const me = await call(port, { path: '/api/v1/auth/me', headers: { Origin: PAGES, Authorization: `Bearer ${token}` } });
  assert.equal(me.status, 200);
  assert.equal(me.json.user.email, u.email);

  // un usuario normal sigue sin acceso administrativo
  const admin = await call(port, { path: '/api/v1/admin/users', headers: { Origin: PAGES, Authorization: `Bearer ${token}` } });
  assert.equal(admin.status, 403);
});

// ───────────── Lo que debe seguir bloqueado ─────────────
test('orígenes ajenos o engañosos siguen bloqueados (403) y no crean usuario', async t => {
  const { port, db } = await start(t, { CORS_ORIGINS: `${PAGES}/`, TRUST_PROXY: 'true', RENDER_EXTERNAL_URL: RENDER });
  const cases = [
    ['https://evil.example', { Host: RENDER_HOST, 'X-Forwarded-Proto': 'https' }],
    ['https://julietaalca2-ux.github.io.evil.com', {}],
    ['http://julietaalca2-ux.github.io', {}],                                   // esquema distinto
    ['https://julietaalca2-ux.github.io:8443', {}],                             // puerto distinto
    ['https://g-core.onrender.com.evil.com', { Host: RENDER_HOST, 'X-Forwarded-Proto': 'https' }],
    ['null', {}]
  ];
  for (const [origin, extra] of cases) {
    const u = newUser();
    const r = await call(port, { method: 'POST', path: '/api/v1/auth/register', json: u, headers: { Origin: origin, ...extra } });
    assert.equal(r.status, 403, origin);
    assert.equal(r.json.error.code, 'CORS_BLOCKED', origin);
    assert.equal(r.headers['access-control-allow-origin'], undefined, origin);
    assert.ok(!(await db.findUserByEmail(u.email)), `${origin}: no debe crear la cuenta`);
  }
});

test('un sitio ajeno no puede hacerse pasar por "mismo origen": el Origin debe coincidir con el Host de la petición', async t => {
  const { port } = await start(t, { CORS_ORIGINS: PAGES }); // sin RENDER_EXTERNAL_URL ni PUBLIC_URL
  const r = await call(port, { method: 'POST', path: '/api/v1/auth/register', json: newUser(), headers: { Origin: RENDER, Host: 'otro-host.example' } });
  assert.equal(r.status, 403);
  assert.equal(r.json.error.code, 'CORS_BLOCKED');
});

// ───────────── CSP y frontend ─────────────
test('CSP de Helmet: connect-src solo \'self\' (correcto: la web se sirve desde el mismo origen que la API)', async t => {
  const { port } = await start(t, { CORS_ORIGINS: PAGES });
  const r = await call(port, { path: '/' });
  const csp = String(r.headers['content-security-policy']);
  assert.match(csp, /connect-src 'self'(;|$)/);
  assert.doesNotMatch(csp, /connect-src[^;]*\*/);
  assert.match(String(r.headers['cache-control']), /no-store/); // index.html nunca queda en caché → no se sirve una versión antigua
});

test('frontend: la API se llama por ruta relativa y el HTML referencia los assets versionados (mismo origen que el backend)', () => {
  const js = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(js, /const API = '\/api\/v1';/);
  assert.match(html, /<script src="\/app\.js\?v=[\w.-]+" defer><\/script>/);
});
