import { Router } from 'express';
import { z } from 'zod';
import { hashPassword, verifyPassword } from '../security/passwords.js';
import { signAccessToken } from '../security/tokens.js';
import { authenticate } from '../middleware/auth.js';

const setupSchema = z.object({
  setupKey: z.string().min(24),
  email: z.string().email().max(254).transform(v => v.toLowerCase()),
  password: z.string().min(12).max(128),
  displayName: z.string().trim().min(2).max(80)
});
const loginSchema = z.object({ email: z.string().email().transform(v => v.toLowerCase()), password: z.string().min(1).max(128) });

export function authRoutes(db, config) {
  const router = Router();
  router.post('/setup', async (req, res, next) => {
    try {
      const parsed = setupSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: { code:'VALIDATION_ERROR', details:parsed.error.flatten() } });
      if (parsed.data.setupKey !== config.CORE_SETUP_KEY) return res.status(403).json({ error:{code:'INVALID_SETUP_KEY',message:'Clave de instalación incorrecta'} });
      if (await db.countOwners() > 0) return res.status(409).json({ error:{code:'ALREADY_INITIALIZED',message:'El propietario inicial ya fue creado'} });
      const user = await db.createUser({ email:parsed.data.email, passwordHash:await hashPassword(parsed.data.password), displayName:parsed.data.displayName, role:'owner' });
      await db.writeAudit({ actorUserId:user.id, action:'owner.initialized', targetType:'user', targetId:user.id });
      res.status(201).json({ user, accessToken:signAccessToken(user), tokenType:'Bearer' });
    } catch (e) { next(e); }
  });
  router.post('/login', async (req, res, next) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error:{code:'VALIDATION_ERROR',details:parsed.error.flatten()} });
      const user = await db.findUserByEmail(parsed.data.email);
      if (!user || user.status !== 'active' || !(await verifyPassword(parsed.data.password,user.password_hash))) {
        return res.status(401).json({ error:{code:'INVALID_CREDENTIALS',message:'Correo o contraseña incorrectos'} });
      }
      const safeUser = { id:user.id,email:user.email,display_name:user.display_name,role:user.role,status:user.status,created_at:user.created_at };
      await db.writeAudit({ actorUserId:user.id, action:'auth.login', targetType:'user', targetId:user.id });
      res.json({ user:safeUser, accessToken:signAccessToken(safeUser), tokenType:'Bearer' });
    } catch (e) { next(e); }
  });
  router.get('/me', authenticate(db), (req,res) => res.json({ user:req.user }));
  return router;
}
