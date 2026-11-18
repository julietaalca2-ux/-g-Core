import jwt from 'jsonwebtoken';
import { config } from '../config.js';
export function signAccessToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN, issuer: 'og-core' });
}
export function verifyAccessToken(token) {
  return jwt.verify(token, config.JWT_SECRET, { issuer: 'og-core' });
}
