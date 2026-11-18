import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { hashPassword, verifyPassword, burnPasswordCheck, safeEqual } from '../security/passwords.js';
import { signAccessToken } from '../security/tokens.js';
import { authenticate } from '../middleware/auth.js';

const setupSchema = z.object({
  setupKey: z.string().min(24).max(256),
  email: z.string().email().max(254).transform(v => v.toLowerCase()),
  password: z.string().min(12).max(128),
  displayName: z.string().trim().min(2).max(80)
});
const loginSchema = z.object({ email: z.string().email().max(254).transform(v => v.toLowerCase()), password: z.string().min(1).max(128) });
const publicUser = u => ({ id:u.id, email:u.email, display_name:u.display_name, role:u.role, status:u.status, created_at:u.created_at });

export function authRoutes(db, config) {
  const router = Router();
  const authLimiter = rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MS, limit: config.AUTH_RATE_LIMIT_MAX ?? 10,
    standardHeaders: 'draft-7', legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Demasiados intentos, probá más tarde' } }
  });

  router.post('/setup', authLimiter, async (req, res, next) => {
    try {
      const parsed = setupSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: { code:'VALIDATION_ERROR', details:parsed.error.flatten() } });
      if (!safeEqual(parsed.data.setupKey, config.CORE_SETUP_KEY)) {
        await db.writeAudit({ action:'owner.setup_denied' });
        return res.status(403).json({ error:{code:'INVALID_SETUP_KEY',message:'Clave de instalación incorrecta'} });
      }
      if (await db.countOwners() > 0) return res.status(409).json({ error:{code:'ALREADY_INITIALIZED',message:'El propietario inicial ya fue creado'} });
      let user;
      try {
        user = await db.createUser({ email:parsed.data.email, passwordHash:await hashPassword(parsed.data.password), displayName:parsed.data.displayName, role:'owner' });
      } catch (e) {
        // Índice único parcial: protege contra dos setups simultáneos.
        if (db.isUniqueViolation?.(e)) return res.status(409).json({ error:{code:'ALREADY_INITIALIZED',message:'El propietario inicial ya fue creado'} });
        throw e;
      }
      await db.writeAudit({ actorUserId:user.id, action:'owner.initialized', targetType:'user', targetId:user.id });
      res.status(201).json({ user, accessToken:signAccessToken(user), tokenType:'Bearer' });
    } catch (e) { next(e); }
  });

  router.post('/login', authLimiter, async (req, res, next) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error:{code:'VALIDATION_ERROR',details:parsed.error.flatten()} });
      const user = await db.findUserByEmail(parsed.data.email);
      let ok = false;
      if (user) ok = await verifyPassword(parsed.data.password, user.password_hash);
      else await burnPasswordCheck(parsed.data.password);
      if (!user || !ok || user.status !== 'active') {
        await db.writeAudit({ actorUserId:user?.id ?? null, action:'auth.login_failed', targetType:user ? 'user' : null, targetId:user?.id ?? null });
        return res.status(401).json({ error:{code:'INVALID_CREDENTIALS',message:'Correo o contraseña incorrectos'} });
      }
      const safeUser = publicUser(user);
      await db.writeAudit({ actorUserId:user.id, action:'auth.login', targetType:'user', targetId:user.id });
      res.json({ user:safeUser, accessToken:signAccessToken(safeUser), tokenType:'Bearer' });
    } catch (e) { next(e); }
  });

  router.get('/me', authenticate(db), (req,res) => res.json({ user:req.user }));
  return router;
}
