import jwt from 'jsonwebtoken';
import { config } from '../config.js';
/** El token identifica la sesión (`sid`): la sesión se valida en la base en cada petición, así cerrar sesión realmente invalida el token. */
export function signAccessToken(user, sessionId) {
  return jwt.sign({ sub: user.id, role: user.role, ...(sessionId ? { sid: sessionId } : {}) }, config.JWT_SECRET, { algorithm: 'HS256', expiresIn: config.JWT_EXPIRES_IN, issuer: 'og-core' });
}
export function verifyAccessToken(token) {
  return jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'], issuer: 'og-core' });
}
export const tokenExpiresAt = token => new Date(jwt.decode(token).exp * 1000).toISOString();
