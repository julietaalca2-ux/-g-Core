import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword, burnPasswordCheck, safeEqual } from '../security/passwords.js';
import { authenticate } from '../middleware/auth.js';
import { issueSession } from '../services/sessions.js';
import { emailSchema, displayNameSchema, passwordSchema, registerSchema, updateProfileSchema, changePasswordSchema, passwordConfirmSchema, validationError } from '../security/validation.js';

const setupSchema = z.object({ setupKey: z.string().min(24).max(256), email: emailSchema, password: passwordSchema, displayName: displayNameSchema });
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });
const publicUser = u => ({ id:u.id, email:u.email, display_name:u.display_name, role:u.role, status:u.status, created_at:u.created_at });
const fail = (res, status, code, message) => res.status(status).json({ error: { code, message } });

export function authRoutes(db, config) {
  const router = Router();
  const authLimiter = rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MS, limit: config.AUTH_RATE_LIMIT_MAX ?? 10,
    standardHeaders: 'draft-7', legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Demasiados intentos, probá más tarde' } }
  });
  const auth = authenticate(db);
  const maxFailures = config.LOGIN_MAX_FAILURES ?? 5;
  const lockMs = (config.LOGIN_LOCK_MINUTES ?? 15) * 60_000;

  /** Reconfirma la contraseña del usuario autenticado (operaciones sensibles). Devuelve la fila completa o null. */
  async function confirmPassword(userId, password) {
    const row = await db.findUserAuthById(userId);
    if (!row || !(await verifyPassword(password, row.password_hash))) return null;
    return row;
  }

  router.post('/setup', authLimiter, async (req, res, next) => {
    try {
      const parsed = setupSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json(validationError(parsed.error));
      if (!safeEqual(parsed.data.setupKey, config.CORE_SETUP_KEY)) {
        await db.writeAudit({ action:'owner.setup_denied' });
        return fail(res, 403, 'INVALID_SETUP_KEY', 'Clave de instalación incorrecta');
      }
      if (await db.countOwners() > 0) return fail(res, 409, 'ALREADY_INITIALIZED', 'El propietario inicial ya fue creado');
      let user;
      try {
        user = await db.createUser({ email:parsed.data.email, passwordHash:await hashPassword(parsed.data.password), displayName:parsed.data.displayName, role:'owner' });
      } catch (e) {
        // Índice único parcial: protege contra dos setups simultáneos.
        if (db.isUniqueViolation?.(e)) return fail(res, 409, 'ALREADY_INITIALIZED', 'El propietario inicial ya fue creado');
        throw e;
      }
      await db.writeAudit({ actorUserId:user.id, action:'owner.initialized', targetType:'user', targetId:user.id });
      res.status(201).json({ user, ...(await issueSession(db, config, user, req)) });
    } catch (e) { next(e); }
  });

  router.post('/register', authLimiter, async (req, res, next) => {
    try {
      if ((config.REGISTRATION_ENABLED ?? 'true') !== 'true') return fail(res, 403, 'REGISTRATION_DISABLED', 'El registro está deshabilitado');
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json(validationError(parsed.error));
      let user;
      try {
        user = await db.createUser({ email:parsed.data.email, passwordHash:await hashPassword(parsed.data.password), displayName:parsed.data.displayName, role:'user' });
      } catch (e) {
        if (db.isUniqueViolation?.(e)) return fail(res, 409, 'EMAIL_TAKEN', 'Ese correo ya está registrado');
        throw e;
      }
      await db.writeAudit({ actorUserId:user.id, action:'user.registered', targetType:'user', targetId:user.id });
      res.status(201).json({ user, ...(await issueSession(db, config, user, req)) });
    } catch (e) { next(e); }
  });

  router.post('/login', authLimiter, async (req, res, next) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json(validationError(parsed.error));
      const user = await db.findUserByEmail(parsed.data.email);
      let ok = false;
      if (user) ok = await verifyPassword(parsed.data.password, user.password_hash);
      else await burnPasswordCheck(parsed.data.password);
      const locked = Boolean(user?.locked_until) && new Date(user.locked_until) > new Date();
      if (!user || !ok || locked || user.status !== 'active') {
        // Cuenta bloqueada, suspendida o inexistente: misma respuesta que una contraseña incorrecta (sin enumeración).
        if (user && user.status === 'active' && !locked && !ok) {
          await db.registerLoginFailure(user.id, { max: maxFailures, lockUntil: new Date(Date.now() + lockMs).toISOString() });
          if ((user.failed_logins ?? 0) + 1 >= maxFailures) await db.writeAudit({ actorUserId:user.id, action:'auth.account_locked', targetType:'user', targetId:user.id });
        }
        await db.writeAudit({ actorUserId:user?.id ?? null, action:'auth.login_failed', targetType:user ? 'user' : null, targetId:user?.id ?? null, metadata: locked ? { reason:'locked' } : {} });
        return fail(res, 401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos');
      }
      await db.resetLoginFailures(user.id);
      const safeUser = publicUser(user);
      await db.writeAudit({ actorUserId:user.id, action:'auth.login', targetType:'user', targetId:user.id });
      res.json({ user:safeUser, ...(await issueSession(db, config, safeUser, req)) });
    } catch (e) { next(e); }
  });

  router.post('/logout', auth, async (req, res, next) => {
    try {
      await db.revokeSession(req.sessionId);
      await db.writeAudit({ actorUserId:req.user.id, action:'auth.logout', targetType:'user', targetId:req.user.id });
      res.json({ ok:true });
    } catch (e) { next(e); }
  });

  router.post('/logout-all', auth, async (req, res, next) => {
    try {
      const revoked = await db.revokeUserSessions(req.user.id);
      await db.writeAudit({ actorUserId:req.user.id, action:'auth.logout_all', targetType:'user', targetId:req.user.id, metadata:{ revoked } });
      res.json({ ok:true, revoked });
    } catch (e) { next(e); }
  });

  router.get('/me', auth, (req,res) => res.json({ user:req.user }));

  router.patch('/me', authLimiter, auth, async (req, res, next) => {
    try {
      const parsed = updateProfileSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json(validationError(parsed.error));
      const { displayName, email, currentPassword } = parsed.data;
      if (email !== undefined && !(await confirmPassword(req.user.id, currentPassword))) return fail(res, 403, 'INVALID_PASSWORD', 'Contraseña actual incorrecta');
      let user;
      try { user = await db.updateUserProfile(req.user.id, { displayName, email }); }
      catch (e) {
        if (db.isUniqueViolation?.(e)) return fail(res, 409, 'EMAIL_TAKEN', 'Ese correo ya está registrado');
        throw e;
      }
      await db.writeAudit({ actorUserId:req.user.id, action: email !== undefined && email !== req.user.email ? 'user.email_changed' : 'user.profile_updated', targetType:'user', targetId:req.user.id });
      res.json({ user });
    } catch (e) { next(e); }
  });

  router.post('/change-password', authLimiter, auth, async (req, res, next) => {
    try {
      const parsed = changePasswordSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json(validationError(parsed.error));
      if (!(await confirmPassword(req.user.id, parsed.data.currentPassword))) {
        await db.writeAudit({ actorUserId:req.user.id, action:'auth.password_change_failed', targetType:'user', targetId:req.user.id });
        return fail(res, 403, 'INVALID_PASSWORD', 'Contraseña actual incorrecta');
      }
      await db.updatePassword(req.user.id, await hashPassword(parsed.data.newPassword));
      const revoked = await db.revokeUserSessions(req.user.id, req.sessionId); // las demás sesiones dejan de valer
      await db.writeAudit({ actorUserId:req.user.id, action:'auth.password_changed', targetType:'user', targetId:req.user.id, metadata:{ revoked } });
      res.json({ ok:true, revokedSessions:revoked });
    } catch (e) { next(e); }
  });

  /** Desactivación voluntaria y reversible (solo un owner/admin puede reactivarla). */
  router.post('/account/deactivate', authLimiter, auth, async (req, res, next) => {
    try {
      const parsed = passwordConfirmSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json(validationError(parsed.error));
      if (req.user.role === 'owner') return fail(res, 403, 'OWNER_PROTECTED', 'La cuenta propietaria no puede desactivarse');
      if (!(await confirmPassword(req.user.id, parsed.data.password))) return fail(res, 403, 'INVALID_PASSWORD', 'Contraseña incorrecta');
      await db.setUserStatus(req.user.id, 'deactivated');
      await db.revokeUserSessions(req.user.id);
      await db.writeAudit({ actorUserId:req.user.id, action:'user.deactivated', targetType:'user', targetId:req.user.id });
      res.json({ ok:true });
    } catch (e) { next(e); }
  });

  /** Eliminación controlada e irreversible: se anonimizan los datos personales y se libera el correo; la fila se conserva por auditoría. */
  router.delete('/account', authLimiter, auth, async (req, res, next) => {
    try {
      const parsed = passwordConfirmSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json(validationError(parsed.error));
      if (req.user.role === 'owner') return fail(res, 403, 'OWNER_PROTECTED', 'La cuenta propietaria no puede eliminarse');
      if (!(await confirmPassword(req.user.id, parsed.data.password))) return fail(res, 403, 'INVALID_PASSWORD', 'Contraseña incorrecta');
      await db.revokeUserSessions(req.user.id);
      await db.softDeleteUser(req.user.id, { email:`deleted-${req.user.id}@deleted.invalid`, displayName:'Cuenta eliminada', passwordHash:await hashPassword(randomBytes(32).toString('hex')) });
      await db.writeAudit({ actorUserId:req.user.id, action:'user.deleted', targetType:'user', targetId:req.user.id, metadata:{ by:'self' } });
      res.json({ ok:true });
    } catch (e) { next(e); }
  });

  return router;
}
