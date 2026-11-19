import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { authRoutes } from './routes/auth.js';
import { adminRoutes } from './routes/admin.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

export function createApp({ db, config, corsOrigins }) {
  const app = express();
  if (config.TRUST_PROXY === 'true') app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: null
      }
    },
    hsts: config.NODE_ENV === 'production'
  }));
  // Un origen está permitido si (a) coincide exactamente con la lista normalizada (CORS_ORIGINS + origen propio) o
  // (b) es el mismo origen que el de esta petición (esquema + host): la web de ÖG se sirve desde el propio backend y el
  // navegador envía la cabecera Origin también en los POST del mismo origen. Un origen de otro sitio nunca coincide con
  // el Host al que apunta su petición, así que (b) no abre nada a terceros.
  const allowed = new Set(corsOrigins);
  const logged = new Set();
  const isSameOrigin = (req, origin) => {
    const host = req.get('host');
    return Boolean(host) && origin === `${req.protocol}://${host}`;
  };
  app.use((req, res, next) => cors({
    origin(origin, cb) {
      if (!origin || allowed.has(origin) || isSameOrigin(req, origin)) return cb(null, true);
      if (!logged.has(origin) && logged.size < 50) { // diagnóstico sin inundar los logs
        logged.add(origin);
        console.warn(`[CORS] Origen bloqueado: ${JSON.stringify(String(origin).slice(0, 200))}. Permitidos: ${JSON.stringify([...allowed])}`);
      }
      return cb(new Error('Origen no permitido por CORS'));
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600
  })(req, res, next));
  app.use(express.json({ limit:'32kb', strict:true }));
  app.use(rateLimit({ windowMs:config.RATE_LIMIT_WINDOW_MS, limit:config.RATE_LIMIT_MAX, standardHeaders:'draft-7', legacyHeaders:false }));
  app.get('/health', (_req,res) => res.json({
    status: 'ok',
    service: 'og-core',
    version,
    driver: db?.driver || config?.DATABASE_DRIVER || 'sqlite',
    timestamp: new Date().toISOString()
  }));
  const publicDir = join(dirname(fileURLToPath(import.meta.url)), '../public');
  const sendIndex = (_req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.sendFile(join(publicDir, 'index.html'));
  };
  app.get(['/', '/index.html', '/admin', '/social', '/dashboard', '/login', '/register', '/setup'], sendIndex);
  app.use(express.static(publicDir, {
    index: false,
    maxAge: config.NODE_ENV === 'production' ? '1h' : 0,
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
  }));
  app.use('/api/v1/auth', authRoutes(db,config));
  app.use('/api/v1/admin', adminRoutes(db));
  app.use((_req,res) => res.status(404).json({ error:{code:'NOT_FOUND',message:'Ruta no encontrada'} }));
  app.use((err,_req,res,_next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({error:{code:'INVALID_JSON',message:'JSON inválido'}});
    if (err.type === 'entity.too.large') return res.status(413).json({error:{code:'PAYLOAD_TOO_LARGE',message:'Cuerpo demasiado grande'}});
    if (err.message === 'Origen no permitido por CORS') return res.status(403).json({error:{code:'CORS_BLOCKED',message:'Origen no permitido'}});
    console.error('[og-core]', err);
    res.status(500).json({ error:{code:'INTERNAL_ERROR',message:'Error interno'} });
  });
  return app;
}
