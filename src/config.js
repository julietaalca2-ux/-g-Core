import 'dotenv/config';
import { z } from 'zod';

const PLACEHOLDER = /^REEMPLAZAR/i;
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  DATABASE_DRIVER: z.enum(['sqlite', 'postgres']).default('sqlite'),
  SQLITE_PATH: z.string().default('./data/og-core.sqlite'),
  DATABASE_URL: z.string().optional().default(''),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres')
    .refine(v => !PLACEHOLDER.test(v), 'JWT_SECRET sigue siendo el valor de ejemplo'),
  JWT_EXPIRES_IN: z.string().default('12h'),
  CORE_SETUP_KEY: z.string().min(24, 'CORE_SETUP_KEY debe tener al menos 24 caracteres')
    .refine(v => !PLACEHOLDER.test(v), 'CORE_SETUP_KEY sigue siendo el valor de ejemplo'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  PUBLIC_URL: z.string().optional().default(''),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  REGISTRATION_ENABLED: z.enum(['true', 'false']).default('true'),
  LOGIN_MAX_FAILURES: z.coerce.number().int().min(1).max(100).default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  MAX_ACTIVE_SESSIONS: z.coerce.number().int().min(1).max(100).default(10)
});

/**
 * Normaliza un origen CORS a la forma exacta que envía el navegador en la cabecera Origin: esquema://host[:puerto]
 * (minúsculas, sin barra final, sin ruta). Así 'https://usuario.github.io/' y 'https://usuario.github.io/repo/'
 * pasan a 'https://usuario.github.io', que es lo que el navegador realmente envía (el origen nunca incluye ruta).
 * Devuelve null si el valor no es un origen http(s) válido.
 */
export function normalizeOrigin(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw === '*' || raw.toLowerCase() === 'null') return null;
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  return url.origin; // URL.origin ya viene en minúsculas, sin ruta y sin puerto por defecto
}

/** Convierte una lista separada por comas en orígenes normalizados y únicos. Rechaza '*' y entradas inválidas. */
export function parseOrigins(csv, name = 'CORS_ORIGINS') {
  const out = new Set();
  const problems = [];
  for (const item of String(csv ?? '').split(',').map(x => x.trim()).filter(Boolean)) {
    if (item === '*') { problems.push(`${name}: el comodín "*" no está permitido; indicá los orígenes exactos`); continue; }
    const origin = normalizeOrigin(item);
    if (!origin) problems.push(`${name}: "${item}" no es un origen http(s) válido (ejemplo: https://usuario.github.io)`);
    else out.add(origin);
  }
  if (problems.length) throw new ConfigError(problems);
  return [...out];
}

export class ConfigError extends Error {
  constructor(problems) {
    super('Configuración inválida de ÖG Core:\n' + problems.map(p => `  - ${p}`).join('\n'));
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

/** Valida variables de entorno. Lanza ConfigError (con el detalle) en vez de terminar el proceso en silencio. */
export function loadConfig(env = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(parsed.error.issues.map(i => `${i.path.join('.') || '(raíz)'}: ${i.message}`));
  }
  if (parsed.data.DATABASE_DRIVER === 'postgres' && !parsed.data.DATABASE_URL) {
    throw new ConfigError(['DATABASE_URL: es obligatorio cuando DATABASE_DRIVER=postgres']);
  }
  const config = Object.freeze(parsed.data);
  // El propio origen público del servicio (la web de ÖG se sirve desde el mismo dominio que la API) siempre es de confianza.
  // En Render, RENDER_EXTERNAL_URL lo define la plataforma automáticamente; PUBLIC_URL permite fijarlo a mano.
  const own = [config.PUBLIC_URL, env.RENDER_EXTERNAL_URL].filter(Boolean).map(v => {
    const o = normalizeOrigin(v);
    if (!o) throw new ConfigError([`PUBLIC_URL/RENDER_EXTERNAL_URL: "${v}" no es un origen http(s) válido`]);
    return o;
  });
  const corsOrigins = [...new Set([...parseOrigins(config.CORS_ORIGINS), ...own])];
  return { config, corsOrigins };
}

const loaded = loadConfig(process.env);
export const config = loaded.config;
export const corsOrigins = loaded.corsOrigins;
