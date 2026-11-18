import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/security/passwords.js';

test('password hashes are salted and verifiable', async () => {
  const hash = await hashPassword('UnaClaveSegura-2026!');
  assert.notEqual(hash, 'UnaClaveSegura-2026!');
  assert.equal(await verifyPassword('UnaClaveSegura-2026!',hash),true);
  assert.equal(await verifyPassword('incorrecta',hash),false);
});
