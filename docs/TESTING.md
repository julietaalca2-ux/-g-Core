# Pruebas de ÖG Core

## Ejecución (Node >= 20.11)
```
npm install            # genera package-lock.json (commitearlo)
npm run check
npm run doctor         # diagnóstico del entorno (dependencias, SQLite nativo, configuración)
npm run test:report    # cada archivo por separado, errores completos; PostgreSQL se omite sin TEST_DATABASE_URL
node scripts/test.js sqlite   # solo los archivos cuyo nombre contenga "sqlite"
npm run audit:deps
```
Las pruebas no necesitan `.env` y no lo leen: `test/support/env.js` sobrescribe todas las variables de entorno relevantes (entorno hermético).

Si un archivo falla sin detalle: `node test/sqlite.test.js` (ejecución directa) y `npm run doctor`.

## PostgreSQL real (base desechable)
```
docker run -d --name og-pg -e POSTGRES_USER=og -e POSTGRES_PASSWORD=og -e POSTGRES_DB=og_test -p 5432:5432 postgres:16
TEST_DATABASE_URL=postgres://og:og@127.0.0.1:5432/og_test npm run test:report
```
Cada ejecución usa un schema `ogtest_<hex>` creado y eliminado por la propia prueba; el adaptador se niega a eliminar cualquier schema que no cumpla `ogtest_<hex>`. Aun así, usar una base desechable y no apuntar a producción ni al Supabase de ÖG.

## Cobertura actual

**Suite compartida SQLite/PostgreSQL** (`test/support/api-suite.js`, misma lógica contra ambos motores):
setup (validación, clave incorrecta, creación, 409, índice único de propietario); login (correcto, incorrecto, inexistente con respuesta idéntica); /me (token válido, ausente, manipulado, otra clave, `alg: none`); administración (401/403/200, límite acotado, eventos de auditoría, usuario suspendido); robustez (JSON inválido → 400, cuerpo grande → 413, ruta inexistente → 404); rate limit de autenticación.

**Pruebas sin base de datos real** (`test/app.test.js`, base simulada):
- `/health` y versión; `/me` sin token → 401; helmet y ausencia de `x-powered-by`.
- CORS (con `node:http` para poder fijar `Origin`): origen permitido → `Access-Control-Allow-Origin`; origen bloqueado → 403 `CORS_BLOCKED` sin cabecera de permiso; coincidencia exacta (puerto, esquema, mayúsculas, subdominio engañoso, `null`); sin `Origin` → se atiende sin cabecera; preflight `OPTIONS` permitido → 204 con `GET,POST` y `Content-Type,Authorization`; preflight de `DELETE`/`PUT`/`PATCH` no se anuncia; preflight bloqueado → 403; un POST de origen bloqueado no llega al handler; método no permitido en petición real → 404 (CORS lo aplica el navegador, no el servidor).

**Configuración:** `test/config.test.js` (valores por defecto, secretos cortos o de ejemplo, PostgreSQL sin URL, entorno hermético).

**Estructura:** `test/structure.test.js` verifica que existan los archivos requeridos (incluido `scripts/check.js`) y que `package.json` apunte a ellos.

**Seguridad y adaptador:** `test/security.test.js` (hashing, comparación en tiempo constante, tokens HS256) y `test/postgres-adapter.test.js` (pool simulado: migración, rollback, nombres de schema rechazados, limpieza acotada).

**Fase 2 (v0.2.0)** — `test/support/accounts-suite.js` (SQLite y PostgreSQL con las mismas aserciones): registro (validaciones, duplicados, mass-assignment, registro deshabilitado); sesiones (logout, logout-all, token sin `sid`, sesión vencida/ajena, límite de sesiones); perfil y cambio de correo/contraseña (reconfirmación, revocación de otras sesiones); desactivación, reactivación y eliminación controlada (correo liberado, owner protegido); roles y jerarquía administrativa (401/403 en todas las rutas, admin vs owner, degradación inmediata, paginación y filtros, auditoría); bloqueo por intentos fallidos; rate limit. Además `test/permissions.test.js` (permisos y validación), `test/migration.test.js` (base 0.1.x → 0.2.0) y pruebas del adaptador PostgreSQL con pool simulado.

## Resultados reales
Entorno de generación de v0.2.0: **sin red**, por lo que no se pudo ejecutar `npm install`. Las pruebas se ejecutaron con Node 22 y `zod` real, usando dobles mínimos de `express`, `helmet`, `cors`, `express-rate-limit`, `bcryptjs`, `jsonwebtoken` y `better-sqlite3` (sobre `node:sqlite`) que NO se incluyen en el ZIP.

| Comprobación | Estado |
|---|---|
| `npm test` con dobles de dependencias (9/9 archivos; SQLite: 19 pruebas de la suite compartida) | Ejecutado: correcto |
| Pruebas de mutación (quitar revocación en logout/cambio de contraseña, jerarquía admin, validación de sesión, `.strict()`) | Ejecutado: las pruebas fallan como corresponde |
| `npm install` + `npm test` con dependencias reales | **Pendiente: ejecutar en tu máquina** |
| Pruebas PostgreSQL real (`TEST_DATABASE_URL`) | **Pendiente** (SQL y adaptador solo verificados con pool simulado) |
| `npm audit` | **Pendiente** |
