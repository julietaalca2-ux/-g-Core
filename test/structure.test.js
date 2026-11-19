// Verifica que el proyecto esté completo (detecta archivos perdidos al subir/copiar el ZIP).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const REQUIRED = [
  'package.json', '.env.example', '.gitignore', 'README.md', 'ESTADO_DEL_PROYECTO.md',
  'docs/ROADMAP.md', 'docs/ARCHITECTURE.md', 'docs/OPERATIONS.md', 'docs/TESTING.md',
  'scripts/check.js', 'scripts/test.js', 'scripts/doctor.js',
  'public/index.html', 'public/app.css', 'public/app.js',
  'src/app.js', 'src/server.js', 'src/config.js',
  'src/db/index.js', 'src/db/sqlite.js', 'src/db/postgres.js', 'src/db/schema.sql', 'src/db/schema.postgres.sql',
  'src/middleware/auth.js', 'src/routes/auth.js', 'src/routes/admin.js',
  'src/security/passwords.js', 'src/security/tokens.js', 'src/security/permissions.js', 'src/security/validation.js', 'src/services/sessions.js',
  'test/support/env.js', 'test/support/api-suite.js', 'test/support/accounts-suite.js', 'test/permissions.test.js', 'test/migration.test.js',
  'test/app.test.js', 'test/security.test.js', 'test/sqlite.test.js', 'test/postgres.test.js', 'test/postgres-adapter.test.js', 'test/config.test.js', 'test/cors-register.test.js'
];

test('todos los archivos requeridos del proyecto existen', () => {
  const missing = REQUIRED.filter(f => !existsSync(new URL(f, root)));
  assert.deepEqual(missing, [], `Faltan archivos: ${missing.join(', ')}`);
});

test('package.json: scripts check/test apuntan a archivos existentes', () => {
  const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
  assert.equal(pkg.scripts.check, 'node scripts/check.js');
  assert.ok(existsSync(new URL('scripts/check.js', root)));
  assert.equal(pkg.scripts.test, 'node scripts/test.js');
  assert.ok(pkg.scripts['test:raw'].includes('node --test'));
  assert.equal(pkg.scripts.doctor, 'node scripts/doctor.js');
});

test('Node fijado a una versión con binarios de better-sqlite3 (evita que Render use un Node demasiado nuevo)', () => {
  const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
  assert.match(pkg.engines.node, /<23/);
  assert.equal(readFileSync(new URL('.node-version', root), 'utf8').trim(), '22');
});
