import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function createSqliteDatabase(filename) {
  const absolute = path.resolve(filename);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  const db = new Database(absolute);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const run = (sql, params = []) => db.prepare(sql).run(...params);
  const get = (sql, params = []) => db.prepare(sql).get(...params);
  const all = (sql, params = []) => db.prepare(sql).all(...params);

  return {
    driver: 'sqlite',
    async migrate() {
      const schema = fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
      db.exec(schema);
    },
    async countOwners() {
      return get("SELECT COUNT(*) AS count FROM users WHERE role = 'owner' AND status = 'active'").count;
    },
    async findUserByEmail(email) { return get('SELECT * FROM users WHERE email = ?', [email]); },
    async findUserById(id) { return get('SELECT id,email,display_name,role,status,created_at FROM users WHERE id = ?', [id]); },
    async createUser({ email, passwordHash, displayName, role }) {
      const user = { id: randomUUID(), email, password_hash: passwordHash, display_name: displayName, role, status: 'active', created_at: new Date().toISOString() };
      run('INSERT INTO users (id,email,password_hash,display_name,role,status,created_at) VALUES (?,?,?,?,?,?,?)',
        [user.id,user.email,user.password_hash,user.display_name,user.role,user.status,user.created_at]);
      return { id:user.id,email:user.email,display_name:user.display_name,role:user.role,status:user.status,created_at:user.created_at };
    },
    async writeAudit({ actorUserId=null, action, targetType=null, targetId=null, metadata={} }) {
      run('INSERT INTO audit_logs (id,actor_user_id,action,target_type,target_id,metadata,created_at) VALUES (?,?,?,?,?,?,?)',
        [randomUUID(),actorUserId,action,targetType,targetId,JSON.stringify(metadata),new Date().toISOString()]);
    },
    async listAudit(limit=50) {
      return all('SELECT id,actor_user_id,action,target_type,target_id,metadata,created_at FROM audit_logs ORDER BY created_at DESC LIMIT ?', [limit])
        .map(r => ({...r, metadata: JSON.parse(r.metadata)}));
    },
    async close() { db.close(); }
  };
}
