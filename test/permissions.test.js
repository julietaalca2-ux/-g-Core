import './support/env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { hasPermission, canManageUser, PERMISSIONS, ROLES } from '../src/security/permissions.js';
import { registerSchema, changePasswordSchema, updateProfileSchema, listUsersSchema } from '../src/security/validation.js';

test('permisos por rol: owner > admin > user', () => {
  assert.deepEqual([...ROLES], ['owner', 'admin', 'user']);
  assert.ok(hasPermission('owner', 'users:role'));
  assert.ok(!hasPermission('admin', 'users:role'));
  assert.ok(hasPermission('admin', 'audit:read'));
  assert.equal(PERMISSIONS.user.length, 0);
  assert.ok(!hasPermission('desconocido', 'audit:read'));
  assert.ok(!hasPermission(undefined, 'audit:read'));
});
test('canManageUser: jerarquía, sin autogestión y propietario intocable', () => {
  const owner = { id: '1', role: 'owner' }, admin = { id: '2', role: 'admin' }, admin2 = { id: '3', role: 'admin' }, user = { id: '4', role: 'user' };
  assert.ok(canManageUser(owner, admin) && canManageUser(owner, user) && canManageUser(admin, user));
  assert.ok(!canManageUser(admin, admin2) && !canManageUser(admin, owner) && !canManageUser(user, user) && !canManageUser(user, admin));
  assert.ok(!canManageUser(owner, owner) && !canManageUser(admin, admin));
  assert.ok(!canManageUser(null, user) && !canManageUser(owner, null));
});
test('validación: contraseñas, campos desconocidos y paginación', () => {
  const ok = { email: 'A@B.co', password: 'UnaClaveSegura-2026!', displayName: 'Ana' };
  assert.equal(registerSchema.parse(ok).email, 'a@b.co');
  assert.equal(registerSchema.safeParse({ ...ok, role: 'owner' }).success, false);
  assert.equal(registerSchema.safeParse({ ...ok, password: 'x'.repeat(73) }).success, false);
  assert.equal(registerSchema.safeParse({ ...ok, password: 'é'.repeat(37) }).success, false); // 74 bytes
  assert.equal(changePasswordSchema.safeParse({ currentPassword: 'a', newPassword: 'a' }).success, false);
  assert.equal(updateProfileSchema.safeParse({ email: 'x@y.co' }).success, false);
  assert.equal(updateProfileSchema.safeParse({ displayName: 'Ana' }).success, true);
  assert.deepEqual(listUsersSchema.parse({}), { limit: 25, offset: 0 });
  assert.equal(listUsersSchema.safeParse({ limit: '101' }).success, false);
});
