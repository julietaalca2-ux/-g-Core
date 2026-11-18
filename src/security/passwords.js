import bcrypt from 'bcryptjs';
import { createHash, timingSafeEqual } from 'node:crypto';
export const hashPassword = password => bcrypt.hash(password, 12);
export const verifyPassword = (password, hash) => bcrypt.compare(password, hash);

let dummyHash;
/** Compara contra un hash falso para igualar el tiempo de respuesta cuando el usuario no existe. */
export async function burnPasswordCheck(password) {
  dummyHash ??= await bcrypt.hash('og-core-dummy-password', 12);
  await bcrypt.compare(password, dummyHash);
}
/** Comparación de secretos en tiempo constante. */
export function safeEqual(a, b) {
  const ha = createHash('sha256').update(String(a)).digest();
  const hb = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}
