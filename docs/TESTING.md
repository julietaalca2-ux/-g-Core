# Pruebas de ÖG Core

## Ejecución (Node >= 20.11)
```
npm ci                  # instala exactamente lo fijado en package-lock.json
npm run check
npm run doctor         # diagnóstico del entorno (dependencias, SQLite nativo, configuración)
npm run test:report    # cada archivo por separado, errores completos; PostgreSQL se omite sin TEST_DATABASE_URL
node scripts/test.js sqlite   # solo los archivos cuyo nombre contenga "sqlite"
npm run audit:deps
```
`package-lock.json` debe conservarse junto con `package.json`. `npm ci` falla si no coinciden y no actualiza las versiones declaradas ni el lockfile. Las pruebas no necesitan `.env` y no lo leen: `test/support/env.js` sobrescribe las variables de entorno de la aplicación para usar SQLite en memoria. Para garantizar que PostgreSQL no se intente ejecutar, dejá `TEST_DATABASE_URL` sin definir.

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
- CORS (con `node:http` para poder fijar `Origin`): origen permitido → `Access-Control-Allow-Origin`; origen bloqueado → 403 `CORS_BLOCKED` sin cabecera de permiso; coincidencia exacta (puerto, esquema, mayúsculas, subdominio engañoso, `null`); sin `Origin` → se atiende sin cabecera; preflight `OPTIONS` permitido → 204 con `GET,POST,PATCH,DELETE` y `Content-Type,Authorization`; `PUT`/`TRACE` no se anuncian; preflight bloqueado → 403; un POST de origen bloqueado no llega al handler; método no permitido en petición real → 404 (CORS lo aplica el navegador, no el servidor).

**Configuración:** `test/config.test.js` (valores por defecto, secretos cortos o de ejemplo, PostgreSQL sin URL, entorno hermético).

**Estructura:** `test/structure.test.js` verifica que existan los archivos requeridos (incluido `scripts/check.js`) y que `package.json` apunte a ellos.

**Seguridad y adaptador:** `test/security.test.js` (hashing, comparación en tiempo constante, tokens HS256) y `test/postgres-adapter.test.js` (pool simulado: migración, rollback, nombres de schema rechazados, limpieza acotada).

**Fase 2 (v0.2.0)** — `test/support/accounts-suite.js` (SQLite y PostgreSQL con las mismas aserciones): registro (validaciones, duplicados, mass-assignment, registro deshabilitado); sesiones (logout, logout-all, token sin `sid`, sesión vencida/ajena, límite de sesiones); perfil y cambio de correo/contraseña (reconfirmación, revocación de otras sesiones); desactivación, reactivación y eliminación controlada (correo liberado, owner protegido); roles y jerarquía administrativa (401/403 en todas las rutas, admin vs owner, degradación inmediata, paginación y filtros, auditoría); bloqueo por intentos fallidos; rate limit. Además `test/permissions.test.js` (permisos y validación), `test/migration.test.js` (base 0.1.x → 0.2.0) y pruebas del adaptador PostgreSQL con pool simulado.

## Resultado de esta candidata

La verificación del paquete se hace en Node v24.22.3 con dependencias reales instaladas desde el lockfile. Los resultados deben repetirse en el entorno donde se vaya a desplegar; no equivalen a una revisión independiente ni declaran estable la versión.

| Comprobación | Resultado |
|---|---|
| `npm run check` | 29/29 archivos JavaScript con sintaxis correcta |
| `npm run test:report` | 53 pruebas aprobadas, 0 fallidas, 1 omitida |
| Prueba omitida | PostgreSQL real; se deja `TEST_DATABASE_URL` sin definir |
| Pruebas PostgreSQL con pool simulado | Ejecutadas; no sustituyen una base PostgreSQL real |
| `npm audit --omit=dev` | 1 alerta alta reportada para Zod por GHSA-mrhx-c7xc-m3w5 |
| Inicio de Express y dashboard por HTTP | Verificados en SQLite en memoria; rutas `/`, `/admin`, `/social`, `/app.css`, `/app.js` y `/health` respondieron 200 |

### Alerta de Zod

Se conserva Zod 3, fijado en `package-lock.json`; no se ejecutó `npm audit fix --force` ni se migró a Zod 4. GitHub aún lista GHSA-mrhx-c7xc-m3w5 como alta, pero CVE.org y NVD marcan el CVE asociado como rechazado. El código actual no define esquemas Zod de arrays, sets o maps y Express limita el cuerpo JSON a 32 KB. El escáner puede seguir reportando la alerta; esta observación no debe presentarse como una auditoría limpia. Referencias: [GHSA](https://github.com/advisories/GHSA-MRHX-C7XC-M3W5), [CVE.org](https://www.cve.org/CVERecord?id=CVE-2023-54404), [NVD](https://nvd.nist.gov/vuln/detail/CVE-2023-54404).

El test de límite de sesiones es secuencial; no se hizo una prueba de concurrencia para comprobar si inicios de sesión simultáneos pueden superar `MAX_ACTIVE_SESSIONS`.
