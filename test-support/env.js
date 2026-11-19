// Debe importarse ANTES que cualquier módulo de src/ (config.js lee process.env al cargarse).
// Entorno HERMÉTICO: se sobrescriben todas las variables relevantes para que ni el shell, ni un .env,
// ni variables de Codespaces (DATABASE_DRIVER, PORT, etc.) puedan alterar las pruebas.
import { devNull } from 'node:os';

Object.assign(process.env, {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: '8787',
  TRUST_PROXY: 'false',
  DATABASE_DRIVER: 'sqlite',
  SQLITE_PATH: ':memory:',
  DATABASE_URL: '',
  JWT_SECRET: 'test-only-jwt-secret-0123456789abcdef-xyz',
  JWT_EXPIRES_IN: '15m',
  CORE_SETUP_KEY: 'test-only-setup-key-0123456789abcdef',
  CORS_ORIGINS: 'http://localhost:3000',
  RATE_LIMIT_WINDOW_MS: '60000',
  RATE_LIMIT_MAX: '100',
  AUTH_RATE_LIMIT_MAX: '1000', // los tests de límite usan su propia app
  DOTENV_CONFIG_PATH: devNull // dotenv no debe leer ningún .env real durante las pruebas
});
