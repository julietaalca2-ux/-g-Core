import { Router } from 'express';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { canManageUser } from '../security/permissions.js';
import { hashPassword } from '../security/passwords.js';
import { idSchema, listUsersSchema, roleChangeSchema, validationError } from '../security/validation.js';
import { randomBytes } from 'node:crypto';

const fail = (res, status, code, message) => res.status(status).json({ error: { code, message } });

export function adminRoutes(db) {
  const router = Router();
  const guard = permission => [authenticate(db), requirePermission(permission)];

  router.get('/audit', guard('audit:read'), async (req,res,next) => {
    try {
      const raw = Number.parseInt(req.query.limit ?? '50',10);
      const limit = Number.isFinite(raw) ? Math.min(100,Math.max(1,raw)) : 50;
      res.json({ items: await db.listAudit(limit) });
    } catch(e) { next(e); }
  });

  router.get('/users', guard('users:read'), async (req,res,next) => {
    try {
      const parsed = listUsersSchema.safeParse(req.query);
      if (!parsed.success) return res.status(400).json(validationError(parsed.error));
      const { items, total } = await db.listUsers(parsed.data);
      res.json({ items, total, limit: parsed.data.limit, offset: parsed.data.offset });
    } catch(e) { next(e); }
  });

  /** Carga el usuario objetivo; responde 404 si el id es inválido o no existe (evita errores de UUID en PostgreSQL). */
  async function loadTarget(req, res) {
    const id = idSchema.safeParse(req.params.id);
    const target = id.success ? await db.findUserById(id.data) : null;
    if (!target) { fail(res, 404, 'USER_NOT_FOUND', 'Usuario no encontrado'); return null; }
    return target;
  }
  /** Acción de gestión: además del permiso, el actor debe poder administrar a ESTE usuario (jerarquía de roles). */
  async function loadManageable(req, res) {
    const target = await loadTarget(req, res);
    if (!target) return null;
    if (target.status === 'deleted') { fail(res, 404, 'USER_NOT_FOUND', 'Usuario no encontrado'); return null; }
    if (!canManageUser(req.user, target)) {
      await db.writeAudit({ actorUserId:req.user.id, action:'admin.action_denied', targetType:'user', targetId:target.id, metadata:{ method:req.method, path:req.path } });
      fail(res, 403, 'FORBIDDEN_TARGET', 'No podés administrar a este usuario');
      return null;
    }
    return target;
  }

  router.get('/users/:id', guard('users:read'), async (req,res,next) => {
    try { const t = await loadTarget(req,res); if (t) res.json({ user:t }); } catch(e) { next(e); }
  });

  router.post('/users/:id/suspend', guard('users:suspend'), async (req,res,next) => {
    try {
      const t = await loadManageable(req,res); if (!t) return;
      if (t.status !== 'active') return fail(res, 409, 'INVALID_STATE', `El usuario está ${t.status}`);
      await db.setUserStatus(t.id, 'suspended');
      await db.revokeUserSessions(t.id);
      await db.writeAudit({ actorUserId:req.user.id, action:'admin.user_suspended', targetType:'user', targetId:t.id });
      res.json({ user: await db.findUserById(t.id) });
    } catch(e) { next(e); }
  });

  router.post('/users/:id/reactivate', guard('users:suspend'), async (req,res,next) => {
    try {
      const t = await loadManageable(req,res); if (!t) return;
      if (!['suspended','deactivated'].includes(t.status)) return fail(res, 409, 'INVALID_STATE', `El usuario está ${t.status}`);
      await db.setUserStatus(t.id, 'active');
      await db.resetLoginFailures(t.id);
      await db.writeAudit({ actorUserId:req.user.id, action:'admin.user_reactivated', targetType:'user', targetId:t.id, metadata:{ from:t.status } });
      res.json({ user: await db.findUserById(t.id) });
    } catch(e) { next(e); }
  });

  router.patch('/users/:id/role', guard('users:role'), async (req,res,next) => {
    try {
      const parsed = roleChangeSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json(validationError(parsed.error));
      const t = await loadManageable(req,res); if (!t) return;
      if (t.role === parsed.data.role) return res.json({ user:t });
      const user = await db.setUserRole(t.id, parsed.data.role);
      await db.writeAudit({ actorUserId:req.user.id, action:'admin.user_role_changed', targetType:'user', targetId:t.id, metadata:{ from:t.role, to:parsed.data.role } });
      res.json({ user });
    } catch(e) { next(e); }
  });

  router.delete('/users/:id', guard('users:delete'), async (req,res,next) => {
    try {
      const t = await loadManageable(req,res); if (!t) return;
      await db.revokeUserSessions(t.id);
      await db.softDeleteUser(t.id, { email:`deleted-${t.id}@deleted.invalid`, displayName:'Cuenta eliminada', passwordHash:await hashPassword(randomBytes(32).toString('hex')) });
      await db.writeAudit({ actorUserId:req.user.id, action:'admin.user_deleted', targetType:'user', targetId:t.id });
      res.json({ ok:true });
    } catch(e) { next(e); }
  });

  return router;
}
