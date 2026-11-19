// Una base creada por ÖG Core 0.1.x debe migrar a 0.2.0 sin perder usuarios ni romper el login.
import './support/env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqliteDatabase } from '../src/db/sqlite.js';

const OLD_SCHEMA = `CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user', status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL);
CREATE TABLE audit_logs (id TEXT PRIMARY KEY, actor_user_id TEXT, action TEXT NOT NULL, target_type TEXT, target_id TEXT, metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
CREATE UNIQUE INDEX uniq_single_owner ON users(role) WHERE role = 'owner';`;

test('sqlite: migración 0.1.x → 0.2.0 conserva usuarios, agrega columnas y es idempotente', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'og-mig-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'old.sqlite');
  const old = new Database(file);
  old.exec(OLD_SCHEMA);
  old.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,?)').run('11111111-1111-4111-8111-111111111111', 'viejo@og.test', '$2a$hash', 'Viejo', 'owner', 'active', '2026-01-01T00:00:00.000Z');
  old.close();

  const db = createSqliteDatabase(file);
  await db.migrate(); await db.migrate();
  const u = await db.findUserByEmail('viejo@og.test');
  assert.equal(u.role, 'owner');
  assert.equal(u.failed_logins, 0);
  assert.equal(u.locked_until, null);
  assert.equal(await db.countOwners(), 1);
  const sid = await db.createSession({ userId: u.id, expiresAt: new Date(Date.now() + 60000).toISOString() });
  assert.equal((await db.findSession(sid)).user_id, u.id);
  await db.updatePassword(u.id, '$2a$nuevo');
  assert.ok((await db.findUserByEmail('viejo@og.test')).password_changed_at);
  await db.close();
});
