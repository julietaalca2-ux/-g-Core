import { verifyAccessToken } from '../security/tokens.js';
import { hasPermission } from '../security/permissions.js';

const deny = (res, status, code, message) => res.status(status).json({ error: { code, message } });

export function authenticate(db) {
  return async (req, res, next) => {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) return deny(res, 401, 'UNAUTHENTICATED', 'Token requerido');
    let payload;
    try { payload = verifyAccessToken(token); } catch { return deny(res, 401, 'INVALID_TOKEN', 'Token inválido o vencido'); }
    try {
      if (!payload.sid) return deny(res, 401, 'INVALID_SESSION', 'Sesión inválida');
      const session = await db.findSession(payload.sid);
      if (!session || session.revoked_at || session.user_id !== payload.sub || new Date(session.expires_at) <= new Date()) return deny(res, 401, 'INVALID_SESSION', 'Sesión inválida');
      const user = await db.findUserById(payload.sub);
      if (!user || user.status !== 'active') return deny(res, 401, 'INVALID_SESSION', 'Sesión inválida');
      req.user = user; req.sessionId = session.id;
      next();
    } catch (e) { next(e); }
  };
}
export function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return deny(res, 403, 'FORBIDDEN', 'Permisos insuficientes');
    next();
  };
}
/** Exige un permiso concreto (ver security/permissions.js). */
export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user || !hasPermission(req.user.role, permission)) return deny(res, 403, 'FORBIDDEN', 'Permisos insuficientes');
    next();
  };
}
