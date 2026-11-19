import { randomUUID } from 'node:crypto';
import { signAccessToken, tokenExpiresAt } from '../security/tokens.js';

/** Crea una sesión persistente y devuelve el token de acceso que la referencia. */
export async function issueSession(db, config, user, req) {
  await db.pruneSessions(user.id, (config.MAX_ACTIVE_SESSIONS ?? 10) - 1); // deja lugar para la nueva
  const sessionId = randomUUID();
  const accessToken = signAccessToken(user, sessionId);
  await db.createSession({ id: sessionId, userId: user.id, expiresAt: tokenExpiresAt(accessToken), userAgent: String(req.headers?.['user-agent'] ?? '').slice(0, 200) || null });
  return { accessToken, tokenType: 'Bearer', sessionId };
}
