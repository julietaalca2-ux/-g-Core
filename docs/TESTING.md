# Pruebas de ÖG Core

## Ejecución (Node >= 20.11)
```
npm install            # genera package-lock.json (commitearlo)
npm run check
npm run test:report    # SQLite siempre; PostgreSQL se omite sin TEST_DATABASE_URL
npm run audit:deps
```
Las pruebas no necesitan `.env`: `test-support/env.js` define secretos solo para test.

## PostgreSQL real (base desechable)
```
docker run -d --name og-pg -e POSTGRES_USER=og -e POSTGRES_PASSWORD=og -e POSTGRES_DB=og_test -p 5432:5432 postgres:16
TEST_DATABASE_URL=postgres://og:og@127.0.0.1:5432/og_test npm run test:report
```
Cada ejecución usa un schema `ogtest_<hex>` creado y eliminado por la propia prueba; el adaptador se niega a eliminar cualquier schema que no cumpla `ogtest_<hex>`. Aun así, usar una base desechable y no apuntar a producción ni al Supabase de ÖG.

## Cobertura actual

**Suite compartida SQLite/PostgreSQL** (`test-support/api-suite.js`, misma lógica contra ambos motores):
setup (validación, clave incorrecta, creación, 409, índice único de propietario); login (correcto, incorrecto, inexistente con respuesta idéntica); /me (token válido, ausente, manipulado, otra clave, `alg: none`); administración (401/403/200, límite acotado, eventos de auditoría, usuario suspendido); robustez (JSON inválido → 400, cuerpo grande → 413, ruta inexistente → 404); rate limit de autenticación.

**Pruebas sin base de datos real** (`test/app.test.js`, base simulada):
- `/health` y versión; `/me` sin token → 401; helmet y ausencia de `x-powered-by`.
- CORS (con `node:http` para poder fijar `Origin`): origen permitido → `Access-Control-Allow-Origin`; origen bloqueado → 403 `CORS_BLOCKED` sin cabecera de permiso; coincidencia exacta (puerto, esquema, mayúsculas, subdominio engañoso, `null`); sin `Origin` → se atiende sin cabecera; preflight `OPTIONS` permitido → 204 con `GET,POST` y `Content-Type,Authorization`; preflight de `DELETE`/`PUT`/`PATCH` no se anuncia; preflight bloqueado → 403; un POST de origen bloqueado no llega al handler; método no permitido en petición real → 404 (CORS lo aplica el navegador, no el servidor).

**Seguridad y adaptador:** `test/security.test.js` (hashing, comparación en tiempo constante, tokens HS256) y `test/postgres-adapter.test.js` (pool simulado: migración, rollback, nombres de schema rechazados, limpieza acotada).

## Resultados reales
| Comprobación | Estado |
|---|---|
| `npm run check` (19 archivos .js) | Ejecutado en el entorno de desarrollo: correcto |
| `test/postgres-adapter.test.js` con `pg` simulado (5 pruebas) | Ejecutado: 5/5 correctas (lógica del adaptador, no PostgreSQL real) |
| Pruebas CORS ampliadas (`test/app.test.js`) | **Escritas, NO ejecutadas** (faltan express/cors/helmet) |
| `npm install` / `package-lock.json` | **Pendiente** (sin red al generar el ZIP) |
| Pruebas SQLite (`test/sqlite.test.js` y resto) | **Pendiente, no verificado** |
| Pruebas PostgreSQL real (`test/postgres.test.js`) | **Pendiente, no verificado** |
| `npm audit` | **Pendiente** |

Pegar aquí la salida de `npm run test:report` cuando se ejecute con dependencias instaladas.
