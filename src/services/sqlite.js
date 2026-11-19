import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const PUBLIC = 'id,email,display_name,role,status,created_at,updated_at';
// Columnas agregadas en la Fase 2: SQLite no tiene ADD COLUMN IF NOT EXISTS, se comprueban con PRAGMA.
const PHASE2_USER_COLUMNS = {
  updated_at: 'TEXT', deleted_at: 'TEXT', password_changed_at: 'TEXT',
  failed_logins: 'INTEGER NOT NULL DEFAULT 0', locked_until: 'TEXT'
};

export function createSqliteDatabase(filename) {
  const inMemory = filename === ':memory:';
  const target = inMemory ? filename : path.resolve(filename);
  if (!inMemory) fs.mkdirSync(path.dirname(target), { recursive: true });
  const db = new Database(target);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const run = (sql, params = []) => db.prepare(sql).run(...params);
  const get = (sql, params = []) => db.prepare(sql).get(...params);
  const all = (sql, params = []) => db.prepare(sql).all(...params);
  const now = () => new Date().toISOString();

  return {
    driver: 'sqlite',
    async migrate() {
      const exists = get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'");
      if (exists) { // base 0.1.x existente: completar columnas antes de crear nada que dependa de ellas
        const have = new Set(all('PRAGMA table_info(users)').map(c => c.name));
        for (const [col, def] of Object.entries(PHASE2_USER_COLUMNS)) if (!have.has(col)) db.exec(`ALTER TABLE users ADD COLUMN ${col} ${def}`);
      }
      db.exec(fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
    },
    async countOwners() {
      return get("SELECT COUNT(*) AS count FROM users WHERE role = 'owner' AND status = 'active'").count;
    },
    isUniqueViolation(e) {
      return (typeof e?.code === 'string' && e.code.startsWith('SQLITE_CONSTRAINT')) || /UNIQUE constraint failed/i.test(String(e?.message ?? ''));
    },
    // ---- usuarios ----
    async setUserStatus(id, status) { run('UPDATE users SET status = ?, updated_at = ? WHERE id = ?', [status, now(), id]); },
    async findUserByEmail(email) { return get('SELECT * FROM users WHERE email = ?', [email]); },
    async findUserById(id) { return get(`SELECT ${PUBLIC} FROM users WHERE id = ?`, [id]); },
    async findUserAuthById(id) { return get('SELECT * FROM users WHERE id = ?', [id]); },
    async createUser({ email, passwordHash, displayName, role }) {
      const ts = now();
      const id = randomUUID();
      run('INSERT INTO users (id,email,password_hash,display_name,role,status,created_at,updated_at,password_changed_at) VALUES (?,?,?,?,?,?,?,?,?)',
        [id, email, passwordHash, displayName, role, 'active', ts, ts, ts]);
      return get(`SELECT ${PUBLIC} FROM users WHERE id = ?`, [id]);
    },
    async updateUserProfile(id, { displayName, email }) {
      const sets = ['updated_at = ?']; const params = [now()];
      if (displayName !== undefined) { sets.push('display_name = ?'); params.push(displayName); }
      if (email !== undefined) { sets.push('email = ?'); params.push(email); }
      run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
      return get(`SELECT ${PUBLIC} FROM users WHERE id = ?`, [id]);
    },
    async updatePassword(id, passwordHash) {
      const ts = now();
      run('UPDATE users SET password_hash = ?, password_changed_at = ?, updated_at = ?, failed_logins = 0, locked_until = NULL WHERE id = ?', [passwordHash, ts, ts, id]);
    },
    async setUserRole(id, role) { run('UPDATE users SET role = ?, updated_at = ? WHERE id = ?', [role, now(), id]); return get(`SELECT ${PUBLIC} FROM users WHERE id = ?`, [id]); },
    /** Eliminación controlada: conserva la fila (integridad de auditoría) pero borra datos personales y libera el correo. */
    async softDeleteUser(id, { email, displayName, passwordHash }) {
      const ts = now();
      run("UPDATE users SET status = 'deleted', deleted_at = ?, updated_at = ?, email = ?, display_name = ?, password_hash = ?, failed_logins = 0, locked_until = NULL WHERE id = ?",
        [ts, ts, email, displayName, passwordHash, id]);
    },
    async listUsers({ limit = 25, offset = 0, status, role } = {}) {
      const where = []; const params = [];
      if (status) { where.push('status = ?'); params.push(status); } else where.push("status <> 'deleted'");
      if (role) { where.push('role = ?'); params.push(role); }
      const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const total = get(`SELECT COUNT(*) AS count FROM users ${w}`, params).count;
      const items = all(`SELECT ${PUBLIC} FROM users ${w} ORDER BY created_at ASC, id ASC LIMIT ? OFFSET ?`, [...params, limit, offset]);
      return { items, total };
    },
    // ---- bloqueo por intentos fallidos ----
    async registerLoginFailure(id, { max, lockUntil }) {
      run('UPDATE users SET failed_logins = failed_logins + 1, locked_until = CASE WHEN failed_logins + 1 >= ? THEN ? ELSE locked_until END WHERE id = ?', [max, lockUntil, id]);
    },
    async resetLoginFailures(id) { run('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ? AND (failed_logins <> 0 OR locked_until IS NOT NULL)', [id]); },
    // ---- sesiones ----
    async createSession({ id = randomUUID(), userId, expiresAt, userAgent = null }) {
      run('INSERT INTO sessions (id,user_id,created_at,expires_at,user_agent) VALUES (?,?,?,?,?)', [id, userId, now(), expiresAt, userAgent]);
      return id;
    },
    async findSession(id) { return get('SELECT id,user_id,created_at,expires_at,revoked_at FROM sessions WHERE id = ?', [id]); },
    async revokeSession(id) { run('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', [now(), id]); },
    async revokeUserSessions(userId, exceptSessionId = null) {
      return run('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND id <> ?', [now(), userId, exceptSessionId ?? '']).changes;
    },
    /** Limpia sesiones vencidas y deja como máximo `keep` activas (revoca las más antiguas). */
    async pruneSessions(userId, keep) {
      const ts = now();
      run('DELETE FROM sessions WHERE user_id = ? AND (expires_at <= ? OR revoked_at IS NOT NULL)', [userId, ts]);
      run('UPDATE sessions SET revoked_at = ? WHERE id IN (SELECT id FROM sessions WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET ?)', [ts, userId, keep]);
    },
    async countActiveSessions(userId) {
      return get('SELECT COUNT(*) AS count FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?', [userId, now()]).count;
    },
    // ---- auditoría ----
    async writeAudit({ actorUserId=null, action, targetType=null, targetId=null, metadata={} }) {
      run('INSERT INTO audit_logs (id,actor_user_id,action,target_type,target_id,metadata,created_at) VALUES (?,?,?,?,?,?,?)',
        [randomUUID(),actorUserId,action,targetType,targetId,JSON.stringify(metadata),now()]);
    },
    async listAudit(limit=50) {
      return all('SELECT id,actor_user_id,action,target_type,target_id,metadata,created_at FROM audit_logs ORDER BY created_at DESC LIMIT ?', [limit])
        .map(r => ({...r, metadata: JSON.parse(r.metadata)}));
    },
    async close() { db.close(); }
  };
}
