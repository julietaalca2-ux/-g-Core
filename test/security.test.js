import '../test-support/env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, safeEqual } from '../src/security/passwords.js';
import { signAccessToken, verifyAccessToken } from '../src/security/tokens.js';

test('password hashes are salted and verifiable', async () => {
  const hash = await hashPassword('UnaClaveSegura-2026!');
  assert.notEqual(hash, 'UnaClaveSegura-2026!');
  assert.notEqual(hash, await hashPassword('UnaClaveSegura-2026!'));
  assert.equal(await verifyPassword('UnaClaveSegura-2026!', hash), true);
  assert.equal(await verifyPassword('incorrecta', hash), false);
});
test('safeEqual compara en tiempo constante y con longitudes distintas', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abcd'), false);
});
test('access token: firma y verifica con HS256 e issuer', () => {
  const t = signAccessToken({ id: 'u1', role: 'user' });
  const p = verifyAccessToken(t);
  assert.equal(p.sub, 'u1'); assert.equal(p.iss, 'og-core');
  assert.throws(() => verifyAccessToken(t.slice(0, -2) + 'xx'));
});
