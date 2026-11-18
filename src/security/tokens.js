import jwt from 'jsonwebtoken';
import { config } from '../config.js';
export function signAccessToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.JWT_SECRET, { algorithm: 'HS256', expiresIn: config.JWT_EXPIRES_IN, issuer: 'og-core' });
}
export function verifyAccessToken(token) {
  return jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'], issuer: 'og-core' });
}
