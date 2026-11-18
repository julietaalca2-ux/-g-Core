import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { authRoutes } from './routes/auth.js';
import { adminRoutes } from './routes/admin.js';

export function createApp({ db, config, corsOrigins }) {
  const app = express();
  if (config.TRUST_PROXY === 'true') app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin(origin, cb) {
    if (!origin || corsOrigins.includes(origin)) return cb(null,true);
    return cb(new Error('Origen no permitido por CORS'));
  }, methods:['GET','POST'], allowedHeaders:['Content-Type','Authorization'] }));
  app.use(express.json({ limit:'32kb', strict:true }));
  app.use(rateLimit({ windowMs:config.RATE_LIMIT_WINDOW_MS, limit:config.RATE_LIMIT_MAX, standardHeaders:'draft-7', legacyHeaders:false }));
  app.get('/health', (_req,res) => res.json({ status:'ok', service:'og-core', version:'0.1.0', timestamp:new Date().toISOString() }));
  app.use('/api/v1/auth', authRoutes(db,config));
  app.use('/api/v1/admin', adminRoutes(db));
  app.use((_req,res) => res.status(404).json({ error:{code:'NOT_FOUND',message:'Ruta no encontrada'} }));
  app.use((err,_req,res,_next) => {
    if (err.message === 'Origen no permitido por CORS') return res.status(403).json({error:{code:'CORS_BLOCKED',message:'Origen no permitido'}});
    console.error('[og-core]', err);
    res.status(500).json({ error:{code:'INTERNAL_ERROR',message:'Error interno'} });
  });
  return app;
}
