import pg from 'pg';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
const { Pool } = pg;

const SCHEMA_NAME = /^ogtest_[a-f0-9]{6,32}$/;
const PUBLIC = 'id,email,display_name,role,status,created_at,updated_at';
const now = () => new Date().toISOString();
/** Normaliza fechas (Date → ISO) para que ambos motores devuelvan el mismo formato. */
const norm = row => row && Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v]));
const MIGRATION_SQL = new URL('./schema.postgres.sql', import.meta.url);

/**
 * @param {string} connectionString
 * @param {{ schema?: string, pool?: object }} [options]
 *   schema: schema aislado SOLO para pruebas (debe cumplir /^ogtest_[a-f0-9]{6,32}$/).
 *   pool:   pool inyectado (pruebas unitarias sin base real).
 */
export async function createPostgresDatabase(connectionString, { schema, pool: injectedPool } = {}) {
  if (schema !== undefined && !SCHEMA_NAME.test(schema)) throw new Error('Nombre de schema de pruebas inválido');
  const pool = injectedPool ?? new Pool({
    connectionString,
    max: 10,
    ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: true } : undefined,
    // Se aplica en el arranque de cada conexión (sin carreras): el nombre ya está validado arriba.
    ...(schema ? { options: `-c search_path=${schema}` } : {})
  });
  const query = (sql, values = []) => pool.query(sql, values);
  return {
    driver: 'postgres',
    async migrate() {
      const ddl = fs.readFileSync(MIGRATION_SQL, 'utf8');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        if (schema) await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
        await client.query(ddl);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    isUniqueViolation(e) { return e?.code === '23505'; },
    /** Solo elimina el schema de pruebas creado por este adaptador; nunca otro. */
    async dropSchema() {
      if (!schema) return;
      if (!SCHEMA_NAME.test(schema)) throw new Error('Se niega a eliminar un schema que no es de pruebas');
      await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    },
    async countOwners() {
      const r = await query("SELECT COUNT(*)::int AS count FROM users WHERE role = 'owner' AND status = 'active'");
      return r.rows[0].count;
    },
    // ---- usuarios ----
    async setUserStatus(id, status) { await query('UPDATE users SET status = $1, updated_at = $2 WHERE id = $3', [status, now(), id]); },
    async findUserByEmail(email) { return norm((await query('SELECT * FROM users WHERE email = $1', [email])).rows[0]); },
    async findUserById(id) { return norm((await query(`SELECT ${PUBLIC} FROM users WHERE id = $1`, [id])).rows[0]); },
    async findUserAuthById(id) { return norm((await query('SELECT * FROM users WHERE id = $1', [id])).rows[0]); },
    async createUser({ email, passwordHash, displayName, role }) {
      const ts = now();
      const r = await query(`INSERT INTO users (id,email,password_hash,display_name,role,status,created_at,updated_at,password_changed_at) VALUES ($1,$2,$3,$4,$5,'active',$6,$6,$6) RETURNING ${PUBLIC}`,
        [randomUUID(), email, passwordHash, displayName, role, ts]);
      return norm(r.rows[0]);
    },
    async updateUserProfile(id, { displayName, email }) {
      const sets = ['updated_at = $1']; const params = [now()];
      if (displayName !== undefined) { params.push(displayName); sets.push(`display_name = $${params.length}`); }
      if (email !== undefined) { params.push(email); sets.push(`email = $${params.length}`); }
      params.push(id);
      return norm((await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING ${PUBLIC}`, params)).rows[0]);
    },
    async updatePassword(id, passwordHash) {
      await query('UPDATE users SET password_hash = $1, password_changed_at = $2, updated_at = $2, failed_logins = 0, locked_until = NULL WHERE id = $3', [passwordHash, now(), id]);
    },
    async setUserRole(id, role) { return norm((await query(`UPDATE users SET role = $1, updated_at = $2 WHERE id = $3 RETURNING ${PUBLIC}`, [role, now(), id])).rows[0]); },
    /** Eliminación controlada: conserva la fila (integridad de auditoría) pero borra datos personales y libera el correo. */
    async softDeleteUser(id, { email, displayName, passwordHash }) {
      await query("UPDATE users SET status = 'deleted', deleted_at = $1, updated_at = $1, email = $2, display_name = $3, password_hash = $4, failed_logins = 0, locked_until = NULL WHERE id = $5",
        [now(), email, displayName, passwordHash, id]);
    },
    async listUsers({ limit = 25, offset = 0, status, role } = {}) {
      const where = []; const params = [];
      if (status) { params.push(status); where.push(`status = $${params.length}`); } else where.push("status <> 'deleted'");
      if (role) { params.push(role); where.push(`role = $${params.length}`); }
      const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const total = (await query(`SELECT COUNT(*)::int AS count FROM users ${w}`, params)).rows[0].count;
      const items = (await query(`SELECT ${PUBLIC} FROM users ${w} ORDER BY created_at ASC, id ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset])).rows.map(norm);
      return { items, total };
    },
    // ---- bloqueo por intentos fallidos ----
    async registerLoginFailure(id, { max, lockUntil }) {
      await query('UPDATE users SET failed_logins = failed_logins + 1, locked_until = CASE WHEN failed_logins + 1 >= $1 THEN $2::timestamptz ELSE locked_until END WHERE id = $3', [max, lockUntil, id]);
    },
    async resetLoginFailures(id) { await query('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1 AND (failed_logins <> 0 OR locked_until IS NOT NULL)', [id]); },
    // ---- sesiones ----
    async createSession({ id = randomUUID(), userId, expiresAt, userAgent = null }) {
      await query('INSERT INTO sessions (id,user_id,created_at,expires_at,user_agent) VALUES ($1,$2,$3,$4,$5)', [id, userId, now(), expiresAt, userAgent]);
      return id;
    },
    async findSession(id) { return norm((await query('SELECT id,user_id,created_at,expires_at,revoked_at FROM sessions WHERE id = $1', [id])).rows[0]); },
    async revokeSession(id) { await query('UPDATE sessions SET revoked_at = $1 WHERE id = $2 AND revoked_at IS NULL', [now(), id]); },
    async revokeUserSessions(userId, exceptSessionId = null) {
      const r = await query('UPDATE sessions SET revoked_at = $1 WHERE user_id = $2 AND revoked_at IS NULL AND ($3::uuid IS NULL OR id <> $3::uuid)', [now(), userId, exceptSessionId]);
      return r.rowCount;
    },
    /** Limpia sesiones vencidas y deja como máximo `keep` activas (revoca las más antiguas). */
    async pruneSessions(userId, keep) {
      const ts = now();
      await query('DELETE FROM sessions WHERE user_id = $1 AND (expires_at <= $2 OR revoked_at IS NOT NULL)', [userId, ts]);
      await query('UPDATE sessions SET revoked_at = $1 WHERE id IN (SELECT id FROM sessions WHERE user_id = $2 AND revoked_at IS NULL ORDER BY created_at DESC, id DESC OFFSET $3)', [ts, userId, keep]);
    },
    async countActiveSessions(userId) {
      return (await query('SELECT COUNT(*)::int AS count FROM sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > $2', [userId, now()])).rows[0].count;
    },
    // ---- auditoría ----
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
