import { z } from 'zod';

const COMMON_PASSWORDS = new Set(['password1234', '123456789012', 'qwertyuiop12', 'contraseña123', 'contrasena1234', 'passwordpassword', '1234567890ab', 'administrator', 'letmein123456']);

export const emailSchema = z.string().trim().email().max(254).transform(v => v.toLowerCase());
export const displayNameSchema = z.string().trim().min(2).max(80).refine(v => !/[\u0000-\u001f\u007f<>]/.test(v), 'Caracteres no permitidos');
/** bcrypt solo usa los primeros 72 bytes: se limita por bytes para no truncar en silencio. */
export const passwordSchema = z.string().min(12, 'Mínimo 12 caracteres')
  .refine(v => Buffer.byteLength(v, 'utf8') <= 72, 'Máximo 72 bytes')
  .refine(v => !COMMON_PASSWORDS.has(v.toLowerCase()), 'Contraseña demasiado común')
  .refine(v => new Set(v).size >= 5, 'Contraseña demasiado repetitiva');
export const currentPasswordSchema = z.string().min(1).max(128);
export const idSchema = z.string().uuid();

export const registerSchema = z.object({ email: emailSchema, password: passwordSchema, displayName: displayNameSchema }).strict();
export const updateProfileSchema = z.object({
  displayName: displayNameSchema.optional(),
  email: emailSchema.optional(),
  currentPassword: currentPasswordSchema.optional()
}).strict().refine(v => v.displayName !== undefined || v.email !== undefined, 'Nada que actualizar')
  .refine(v => v.email === undefined || v.currentPassword !== undefined, { message: 'Cambiar el correo requiere currentPassword', path: ['currentPassword'] });
export const changePasswordSchema = z.object({ currentPassword: currentPasswordSchema, newPassword: passwordSchema }).strict()
  .refine(v => v.newPassword !== v.currentPassword, { message: 'La nueva contraseña debe ser distinta', path: ['newPassword'] });
export const passwordConfirmSchema = z.object({ password: currentPasswordSchema }).strict();
export const roleChangeSchema = z.object({ role: z.enum(['admin', 'user']) }).strict();
export const listUsersSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  status: z.enum(['active', 'suspended', 'deactivated', 'deleted']).optional(),
  role: z.enum(['owner', 'admin', 'user']).optional()
});

export const validationError = error => ({ error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos', details: error.flatten() } });
