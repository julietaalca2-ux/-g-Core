import { verifyAccessToken } from '../security/tokens.js';

export function authenticate(db) {
  return async (req, res, next) => {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Token requerido' } });
    try {
      const payload = verifyAccessToken(token);
      const user = await db.findUserById(payload.sub);
      if (!user || user.status !== 'active') return res.status(401).json({ error: { code: 'INVALID_SESSION', message: 'Sesión inválida' } });
      req.user = user;
      next();
    } catch {
      return res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Token inválido o vencido' } });
    }
  };
}
export function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Permisos insuficientes' } });
    next();
  };
}
