import pg from 'pg';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
const { Pool } = pg;

export async function createPostgresDatabase(connectionString) {
  const pool = new Pool({ connectionString, max: 10, ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: true } : undefined });
  const query = (sql, values=[]) => pool.query(sql, values);
  return {
    driver: 'postgres',
    async migrate() {
      const schema = fs.readFileSync(new URL('./schema.postgres.sql', import.meta.url), 'utf8');
      await query(schema);
    },
    async countOwners() {
      const r = await query("SELECT COUNT(*)::int AS count FROM users WHERE role = 'owner' AND status = 'active'");
      return r.rows[0].count;
    },
    async findUserByEmail(email) {
      const r = await query('SELECT * FROM users WHERE email = $1', [email]);
      return r.rows[0];
    },
    async findUserById(id) {
      const r = await query('SELECT id,email,display_name,role,status,created_at FROM users WHERE id = $1', [id]);
      return r.rows[0];
    },
    async createUser({ email, passwordHash, displayName, role }) {
      const values = [randomUUID(),email,passwordHash,displayName,role,'active',new Date().toISOString()];
      const r = await query('INSERT INTO users (id,email,password_hash,display_name,role,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,email,display_name,role,status,created_at', values);
      return r.rows[0];
    },
    async writeAudit({ actorUserId=null, action, targetType=null, targetId=null, metadata={} }) {
      await query('INSERT INTO audit_logs (id,actor_user_id,action,target_type,target_id,metadata,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [randomUUID(),actorUserId,action,targetType,targetId,JSON.stringify(metadata),new Date().toISOString()]);
    },
    async listAudit(limit=50) {
      const r = await query('SELECT id,actor_user_id,action,target_type,target_id,metadata,created_at FROM audit_logs ORDER BY created_at DESC LIMIT $1', [limit]);
      return r.rows.map(x => ({...x, metadata: typeof x.metadata === 'string' ? JSON.parse(x.metadata) : x.metadata}));
    },
    async close() { await pool.end(); }
  };
}
