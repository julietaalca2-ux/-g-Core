// Fase 2: cuentas, sesiones, roles y protecciones. Se ejecuta con las mismas aserciones contra SQLite y PostgreSQL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, expectStatus } from './api-suite.js';
import { config } from '../../src/config.js';

const SETUP_KEY = process.env.CORE_SETUP_KEY;
const PASSWORD = 'UnaClaveSegura-2026!';
const NEW_PASSWORD = 'OtraClaveSegura-2027!';
const A = '/api/v1/auth';
const ADM = '/api/v1/admin';

async function start(makeDb, t, overrides) {
  const db = await makeDb();
  const app = await boot(db, overrides);
  t.after(async () => { await app.close(); try { await db.dropSchema?.(); } finally { await db.close(); } });
  const { call } = app;
  const setup = async () => (await call('POST', `${A}/setup`, { body: { setupKey: SETUP_KEY, email: 'owner@og.test', password: PASSWORD, displayName: 'Owner' } })).json;
  const register = async (email, displayName = 'Persona') => {
    const r = await call('POST', `${A}/register`, { body: { email, password: PASSWORD, displayName } });
    expectStatus(r, 201, `registro de ${email}:`);
    return { id: r.json.user.id, token: r.json.accessToken, email };
  };
  const login = async (email, password = PASSWORD) => call('POST', `${A}/login`, { body: { email, password } });
  const actions = async owner => (await call('GET', `${ADM}/audit?limit=100`, { token: owner.accessToken })).json.items.map(i => i.action);
  return { db, call, setup, register, login, actions };
}

export function runAccountsSuite(label, makeDb) {
  test(`[${label}] registro: validaciones, unicidad de correo y mass-assignment`, async t => {
    const { call, register, db } = await start(makeDb, t);
    expectStatus(await call('POST', `${A}/register`, { body: {} }), 400);
    for (const bad of [
      { email: 'no-es-correo', password: PASSWORD, displayName: 'X Y' },
      { email: 'a@og.test', password: 'corta', displayName: 'X Y' },
      { email: 'a@og.test', password: 'password1234', displayName: 'X Y' },        // común
      { email: 'a@og.test', password: 'aaaaaaaaaaaaaaaa', displayName: 'X Y' },     // repetitiva
      { email: 'a@og.test', password: 'ñ'.repeat(40), displayName: 'X Y' },         // >72 bytes
      { email: 'a@og.test', password: PASSWORD, displayName: '<script>' },
      { email: 'a@og.test', password: PASSWORD, displayName: 'X' },
      { email: 'a@og.test', password: PASSWORD, displayName: 'Persona', role: 'owner' },   // campo no permitido
      { email: 'a@og.test', password: PASSWORD, displayName: 'Persona', status: 'active' }
    ]) expectStatus(await call('POST', `${A}/register`, { body: bad }), 400, JSON.stringify(bad));
    const r = await call('POST', `${A}/register`, { body: { email: 'Ana@OG.test', password: PASSWORD, displayName: ' Ana ' } });
    expectStatus(r, 201);
    assert.equal(r.json.user.email, 'ana@og.test');
    assert.equal(r.json.user.display_name, 'Ana');
    assert.equal(r.json.user.role, 'user');
    assert.equal(r.json.user.password_hash, undefined);
    assert.equal(JSON.stringify(r.json).includes('password'), false);
    const row = await db.findUserByEmail('ana@og.test');
    assert.notEqual(row.password_hash, PASSWORD);
    assert.match(row.password_hash, /^\$/);
    expectStatus(await call('POST', `${A}/register`, { body: { email: 'ANA@og.test', password: PASSWORD, displayName: 'Otra' } }), 409, 'correo duplicado:');
    assert.equal((await register('bea@og.test')).email, 'bea@og.test');
  });

  test(`[${label}] registro deshabilitable por configuración`, async t => {
    const { call } = await start(makeDb, t, { REGISTRATION_ENABLED: 'false' });
    const r = await call('POST', `${A}/register`, { body: { email: 'a@og.test', password: PASSWORD, displayName: 'Ana' } });
    expectStatus(r, 403);
    assert.equal(r.json.error.code, 'REGISTRATION_DISABLED');
  });

  test(`[${label}] sesiones: login, /me, logout, logout-all y token sin sesión`, async t => {
    const { call, register, login, db } = await start(makeDb, t);
    const u = await register('ana@og.test');
    expectStatus(await call('GET', `${A}/me`, { token: u.token }), 200);
    expectStatus(await call('POST', `${A}/logout`), 401);
    expectStatus(await call('POST', `${A}/logout`, { token: u.token }), 200);
    expectStatus(await call('GET', `${A}/me`, { token: u.token }), 401, 'token tras logout:');
    expectStatus(await call('POST', `${A}/logout`, { token: u.token }), 401);
    const a = (await login('ana@og.test')).json.accessToken;
    const b = (await login('ana@og.test')).json.accessToken;
    assert.notEqual(a, b);
    expectStatus(await call('GET', `${A}/me`, { token: a }), 200);
    expectStatus(await call('GET', `${A}/me`, { token: b }), 200);
    const all = await call('POST', `${A}/logout-all`, { token: a });
    expectStatus(all, 200);
    assert.equal(all.json.revoked, 2);
    expectStatus(await call('GET', `${A}/me`, { token: a }), 401);
    expectStatus(await call('GET', `${A}/me`, { token: b }), 401);
    // token con firma válida pero sin sesión (sin sid) o con sesión vencida o ajena
    const { default: jwt } = await import('jsonwebtoken');
    const sign = payload => jwt.sign(payload, config.JWT_SECRET, { algorithm: 'HS256', issuer: 'og-core', expiresIn: '15m' });
    expectStatus(await call('GET', `${A}/me`, { token: sign({ sub: u.id, role: 'user' }) }), 401, 'sin sid:');
    const past = await db.createSession({ userId: u.id, expiresAt: new Date(Date.now() - 1000).toISOString() });
    expectStatus(await call('GET', `${A}/me`, { token: sign({ sub: u.id, role: 'user', sid: past }) }), 401, 'sesión vencida:');
    const other = await register('otra@og.test');
    const mine = await db.createSession({ userId: other.id, expiresAt: new Date(Date.now() + 60000).toISOString() });
    expectStatus(await call('GET', `${A}/me`, { token: sign({ sub: u.id, role: 'user', sid: mine }) }), 401, 'sesión de otro usuario:');
    expectStatus(await call('GET', `${A}/me`, { token: sign({ sub: u.id, role: 'user', sid: 'no-es-uuid' }) }), 401, 'sid inválido:');
  });

  test(`[${label}] límite de sesiones simultáneas`, async t => {
    const { call, register, login, db } = await start(makeDb, t, { MAX_ACTIVE_SESSIONS: 2 });
    const u = await register('ana@og.test');
    const t2 = (await login('ana@og.test')).json.accessToken;
    const t3 = (await login('ana@og.test')).json.accessToken;
    expectStatus(await call('GET', `${A}/me`, { token: u.token }), 401, 'la más antigua se revoca:');
    expectStatus(await call('GET', `${A}/me`, { token: t2 }), 200);
    expectStatus(await call('GET', `${A}/me`, { token: t3 }), 200);
    assert.equal(await db.countActiveSessions(u.id), 2);
  });

  test(`[${label}] actualización de cuenta y cambio de contraseña`, async t => {
    const { call, register, login } = await start(makeDb, t);
    const u = await register('ana@og.test');
    const b = await register('bea@og.test');
    const other = (await login('ana@og.test')).json.accessToken;
    expectStatus(await call('PATCH', `${A}/me`, { token: u.token, body: {} }), 400);
    expectStatus(await call('PATCH', `${A}/me`, { token: u.token, body: { role: 'owner', displayName: 'Hack' } }), 400, 'mass-assignment:');
    expectStatus(await call('PATCH', `${A}/me`, { body: { displayName: 'Nada' } }), 401);
    const p = await call('PATCH', `${A}/me`, { token: u.token, body: { displayName: 'Ana María' } });
    expectStatus(p, 200);
    assert.equal(p.json.user.display_name, 'Ana María');
    assert.equal(p.json.user.role, 'user');
    expectStatus(await call('PATCH', `${A}/me`, { token: u.token, body: { email: 'nueva@og.test' } }), 400, 'email sin contraseña:');
    expectStatus(await call('PATCH', `${A}/me`, { token: u.token, body: { email: 'nueva@og.test', currentPassword: 'incorrecta-123' } }), 403);
    expectStatus(await call('PATCH', `${A}/me`, { token: u.token, body: { email: 'BEA@og.test', currentPassword: PASSWORD } }), 409, 'correo de otro:');
    const e = await call('PATCH', `${A}/me`, { token: u.token, body: { email: 'Nueva@OG.test', currentPassword: PASSWORD } });
    expectStatus(e, 200);
    assert.equal(e.json.user.email, 'nueva@og.test');
    expectStatus(await login('ana@og.test'), 401);
    expectStatus(await login('nueva@og.test'), 200);

    // cambio de contraseña
    const cp = body => call('POST', `${A}/change-password`, { token: u.token, body });
    expectStatus(await call('POST', `${A}/change-password`, { body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD } }), 401);
    expectStatus(await cp({}), 400);
    expectStatus(await cp({ currentPassword: 'incorrecta-123', newPassword: NEW_PASSWORD }), 403);
    expectStatus(await cp({ currentPassword: PASSWORD, newPassword: 'corta' }), 400);
    expectStatus(await cp({ currentPassword: PASSWORD, newPassword: PASSWORD }), 400, 'misma contraseña:');
    const ok = await cp({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expectStatus(ok, 200);
    assert.ok(ok.json.revokedSessions >= 1);
    expectStatus(await call('GET', `${A}/me`, { token: u.token }), 200, 'la sesión actual se conserva:');
    expectStatus(await call('GET', `${A}/me`, { token: other }), 401, 'las demás se revocan:');
    expectStatus(await login('nueva@og.test', PASSWORD), 401);
    expectStatus(await login('nueva@og.test', NEW_PASSWORD), 200);
    expectStatus(await call('GET', `${A}/me`, { token: b.token }), 200, 'otro usuario no se afecta:');
  });

  test(`[${label}] desactivación, reactivación y eliminación controlada`, async t => {
    const { call, setup, register, login, db, actions } = await start(makeDb, t);
    const owner = await setup();
    const u = await register('ana@og.test', 'Ana');
    // owner protegido
    expectStatus(await call('POST', `${A}/account/deactivate`, { token: owner.accessToken, body: { password: PASSWORD } }), 403);
    expectStatus(await call('DELETE', `${A}/account`, { token: owner.accessToken, body: { password: PASSWORD } }), 403);
    // desactivar
    expectStatus(await call('POST', `${A}/account/deactivate`, { token: u.token, body: {} }), 400);
    expectStatus(await call('POST', `${A}/account/deactivate`, { token: u.token, body: { password: 'incorrecta-123' } }), 403);
    expectStatus(await call('GET', `${A}/me`, { token: u.token }), 200, 'contraseña errónea no desactiva:');
    expectStatus(await call('POST', `${A}/account/deactivate`, { token: u.token, body: { password: PASSWORD } }), 200);
    expectStatus(await call('GET', `${A}/me`, { token: u.token }), 401);
    expectStatus(await login('ana@og.test'), 401);
    // reactivar (solo staff)
    expectStatus(await call('POST', `${ADM}/users/${u.id}/reactivate`, { token: owner.accessToken }), 200);
    const again = await login('ana@og.test');
    expectStatus(again, 200);
    // eliminar
    expectStatus(await call('DELETE', `${A}/account`, { token: again.json.accessToken, body: { password: 'incorrecta-123' } }), 403);
    expectStatus(await call('DELETE', `${A}/account`, { token: again.json.accessToken, body: { password: PASSWORD } }), 200);
    expectStatus(await call('GET', `${A}/me`, { token: again.json.accessToken }), 401);
    expectStatus(await login('ana@og.test'), 401);
    assert.equal(await db.findUserByEmail('ana@og.test'), undefined, 'el correo queda libre');
    const gone = await db.findUserById(u.id);
    assert.equal(gone.status, 'deleted');
    assert.equal(gone.display_name, 'Cuenta eliminada');
    assert.match(gone.email, /@deleted\.invalid$/);
    expectStatus(await call('POST', `${ADM}/users/${u.id}/reactivate`, { token: owner.accessToken }), 404, 'no se reactiva un usuario eliminado:');
    const re = await call('POST', `${A}/register`, { body: { email: 'ana@og.test', password: PASSWORD, displayName: 'Ana nueva' } });
    expectStatus(re, 201, 'el correo se puede volver a registrar:');
    assert.notEqual(re.json.user.id, u.id);
    const acts = await actions(owner);
    for (const a of ['user.registered', 'user.deactivated', 'admin.user_reactivated', 'user.deleted', 'auth.login']) assert.ok(acts.includes(a), `falta auditoría ${a}`);
  });

  test(`[${label}] roles, permisos y funciones administrativas`, async t => {
    const { call, setup, register, login, db, actions } = await start(makeDb, t);
    const owner = await setup();
    const ownerId = owner.user.id;
    const [u1, u2, u3, u4] = [await register('u1@og.test'), await register('u2@og.test'), await register('u3@og.test'), await register('u4@og.test')];
    const o = { token: owner.accessToken };

    // protección: sin token 401; usuario común 403 en TODAS las rutas administrativas
    const routes = [['GET', `${ADM}/users`], ['GET', `${ADM}/users/${u2.id}`], ['POST', `${ADM}/users/${u2.id}/suspend`], ['POST', `${ADM}/users/${u2.id}/reactivate`],
      ['PATCH', `${ADM}/users/${u2.id}/role`], ['DELETE', `${ADM}/users/${u2.id}`], ['GET', `${ADM}/audit`]];
    for (const [m, p] of routes) {
      expectStatus(await call(m, p), 401, `${m} ${p} sin token:`);
      expectStatus(await call(m, p, { token: u1.token, body: m === 'PATCH' ? { role: 'admin' } : undefined }), 403, `${m} ${p} como user:`);
    }
    // solo el propietario cambia roles; no se puede asignar 'owner'
    expectStatus(await call('PATCH', `${ADM}/users/${u1.id}/role`, { ...o, body: { role: 'owner' } }), 400, 'asignar owner:');
    expectStatus(await call('PATCH', `${ADM}/users/${u1.id}/role`, { ...o, body: {} }), 400);
    expectStatus(await call('PATCH', `${ADM}/users/${u1.id}/role`, { ...o, body: { role: 'admin' } }), 200);
    expectStatus(await call('PATCH', `${ADM}/users/${u3.id}/role`, { ...o, body: { role: 'admin' } }), 200);
    expectStatus(await call('PATCH', `${ADM}/users/${ownerId}/role`, { ...o, body: { role: 'user' } }), 403, 'el propietario no se degrada:');
    expectStatus(await call('PATCH', `${ADM}/users/no-es-uuid/role`, { ...o, body: { role: 'user' } }), 404);
    expectStatus(await call('PATCH', `${ADM}/users/00000000-0000-4000-8000-000000000000/role`, { ...o, body: { role: 'user' } }), 404);
    assert.equal(await db.countOwners(), 1);
    const admin = (await login('u1@og.test')).json.accessToken;
    const adm = { token: admin };
    expectStatus(await call('PATCH', `${ADM}/users/${u2.id}/role`, { ...adm, body: { role: 'admin' } }), 403, 'admin no cambia roles:');

    // listado: filtros, paginación y validación
    const list = await call('GET', `${ADM}/users`, adm);
    expectStatus(list, 200);
    assert.equal(list.json.total, 5);
    assert.ok(list.json.items.every(i => i.password_hash === undefined));
    assert.equal((await call('GET', `${ADM}/users?role=admin`, adm)).json.total, 2);
    assert.equal((await call('GET', `${ADM}/users?limit=2&offset=4`, adm)).json.items.length, 1);
    for (const q of ['limit=0', 'limit=1000', 'limit=abc', 'offset=-1', 'status=raro', 'role=dios']) expectStatus(await call('GET', `${ADM}/users?${q}`, adm), 400, q);
    expectStatus(await call('GET', `${ADM}/users/${u2.id}`, adm), 200);
    expectStatus(await call('GET', `${ADM}/users/xyz`, adm), 404);

    // jerarquía: el admin solo gestiona usuarios comunes
    for (const target of [ownerId, u3.id, u1.id]) {
      expectStatus(await call('POST', `${ADM}/users/${target}/suspend`, adm), 403, `admin suspende ${target}:`);
      expectStatus(await call('DELETE', `${ADM}/users/${target}`, adm), 403, `admin elimina ${target}:`);
    }
    // suspender / reactivar
    const s = await call('POST', `${ADM}/users/${u2.id}/suspend`, adm);
    expectStatus(s, 200);
    assert.equal(s.json.user.status, 'suspended');
    expectStatus(await call('GET', `${A}/me`, { token: u2.token }), 401, 'sesiones revocadas al suspender:');
    expectStatus(await login('u2@og.test'), 401);
    expectStatus(await call('POST', `${ADM}/users/${u2.id}/suspend`, adm), 409);
    expectStatus(await call('POST', `${ADM}/users/${u2.id}/reactivate`, adm), 200);
    expectStatus(await call('POST', `${ADM}/users/${u2.id}/reactivate`, adm), 409);
    expectStatus(await login('u2@og.test'), 200);
    // el propietario sí administra admins
    expectStatus(await call('POST', `${ADM}/users/${u3.id}/suspend`, o), 200);
    expectStatus(await call('POST', `${ADM}/users/${u3.id}/reactivate`, o), 200);
    // degradar: el cambio de rol rige de inmediato (el rol sale de la base, no del token)
    expectStatus(await call('PATCH', `${ADM}/users/${u1.id}/role`, { ...o, body: { role: 'user' } }), 200);
    expectStatus(await call('GET', `${ADM}/users`, adm), 403, 'ex-admin sin permisos:');
    // eliminar
    const del = await call('DELETE', `${ADM}/users/${u4.id}`, o);
    expectStatus(del, 200);
    expectStatus(await call('GET', `${A}/me`, { token: u4.token }), 401);
    expectStatus(await call('DELETE', `${ADM}/users/${u4.id}`, o), 404);
    assert.equal((await call('GET', `${ADM}/users`, o)).json.total, 4, 'los eliminados no aparecen por defecto');
    assert.equal((await call('GET', `${ADM}/users?status=deleted`, o)).json.total, 1);
    assert.equal((await call('GET', `${ADM}/users/${u4.id}`, o)).json.user.status, 'deleted');
    const acts = await actions(owner);
    for (const a of ['admin.user_role_changed', 'admin.user_suspended', 'admin.user_reactivated', 'admin.user_deleted', 'admin.action_denied']) assert.ok(acts.includes(a), `falta auditoría ${a}`);
  });

  test(`[${label}] bloqueo por intentos fallidos`, async t => {
    const { call, register, login, db, setup, actions } = await start(makeDb, t, { LOGIN_MAX_FAILURES: 3, LOGIN_LOCK_MINUTES: 15 });
    const owner = await setup();
    const u = await register('ana@og.test');
    const wrong = [];
    for (let i = 0; i < 3; i++) wrong.push(await login('ana@og.test', 'mala-clave-123'));
    assert.ok(wrong.every(r => r.status === 401));
    const locked = await login('ana@og.test'); // contraseña CORRECTA, pero cuenta bloqueada
    expectStatus(locked, 401, 'cuenta bloqueada:');
    assert.deepEqual(locked.json, wrong[0].json, 'mismo mensaje: no revela el bloqueo');
    assert.ok((await actions(owner)).includes('auth.account_locked'));
    // vencido el bloqueo vuelve a funcionar y el contador se reinicia
    await db.registerLoginFailure(u.id, { max: 1, lockUntil: new Date(Date.now() - 1000).toISOString() });
    expectStatus(await login('ana@og.test'), 200, 'bloqueo vencido:');
    expectStatus(await login('ana@og.test', 'mala-clave-123'), 401);
    expectStatus(await login('ana@og.test'), 200, 'un fallo aislado no bloquea:');
    // los fallos sobre usuarios inexistentes no crean estado
    expectStatus(await login('nadie@og.test', 'mala-clave-123'), 401);
  });

  test(`[${label}] rate limit en registro y operaciones sensibles`, async t => {
    const { call } = await start(makeDb, t, { AUTH_RATE_LIMIT_MAX: 3 });
    const s = [];
    for (let i = 0; i < 5; i++) s.push((await call('POST', `${A}/register`, { body: {} })).status);
    assert.deepEqual(s, [400, 400, 400, 429, 429]);
  });
}
