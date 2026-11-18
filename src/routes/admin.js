import { Router } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
export function adminRoutes(db) {
  const router = Router();
  router.get('/audit', authenticate(db), requireRoles('owner','admin'), async (req,res,next) => {
    try {
      const raw = Number.parseInt(req.query.limit ?? '50',10);
      const limit = Number.isFinite(raw) ? Math.min(100,Math.max(1,raw)) : 50;
      res.json({ items: await db.listAudit(limit) });
    } catch(e) { next(e); }
  });
  return router;
}
