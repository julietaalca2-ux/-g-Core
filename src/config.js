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
  JWT_EXPIRES_IN: z.string().default('15m'),
  CORE_SETUP_KEY: z.string().min(24, 'CORE_SETUP_KEY debe tener al menos 24 caracteres')
    .refine(v => !PLACEHOLDER.test(v), 'CORE_SETUP_KEY sigue siendo el valor de ejemplo'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10)
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Configuración inválida:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}
if (parsed.data.DATABASE_DRIVER === 'postgres' && !parsed.data.DATABASE_URL) {
  console.error('DATABASE_URL es obligatorio cuando DATABASE_DRIVER=postgres');
  process.exit(1);
}
export const config = Object.freeze(parsed.data);
export const corsOrigins = config.CORS_ORIGINS.split(',').map(x => x.trim()).filter(Boolean);
