# Estado de ÖG Core

Versión: 0.1.3 (Fase 1 en curso, NO cerrada)
Estado: correcciones y pruebas escritas. **SQLite y PostgreSQL NO están verificados**: faltan dependencias (sin red al generar el ZIP) y no existe `package-lock.json`. Ver `docs/TESTING.md`.

## Cambios en 0.1.3 (fallo de `test/sqlite.test.js`)
**Causa real: no confirmada.** El resultado `test failed` en `test/sqlite.test.js:1:1` indica que el proceso de ese archivo terminó con error sin reportar subpruebas (típico de `process.exit`, excepción no capturada o error de importación). Sin acceso a red no pude instalar las dependencias ni reproducir el fallo en el entorno de desarrollo, y no tengo la salida original. Lo que sí se verificó: el SQL (`schema.sql`, índice único parcial, auditoría, `LIMIT`) y el adaptador funcionan sobre un motor SQLite real (usando `node:sqlite` mediante una capa de compatibilidad temporal; no es `better-sqlite3`).

Causas probables eliminadas o expuestas:
- `config.js` terminaba el proceso con `process.exit(1)` ante configuración inválida, sin que el motivo llegara al reporte de pruebas. Ahora `loadConfig()` lanza `ConfigError` con la lista de problemas, y `server.js` la muestra claramente.
- Las pruebas dependían del entorno (`DATABASE_DRIVER`, `.env`, variables de Codespaces). `test-support/env.js` ahora sobrescribe todas las variables y desactiva la lectura de `.env` (verificado con variables hostiles).
- `isUniqueViolation` en SQLite también reconoce el mensaje `UNIQUE constraint failed`.

Diagnóstico mejorado:
- `npm test` / `npm run test:report` ejecutan cada archivo de prueba directamente con `node` (no por el subproceso de `node --test`), así excepciones, salidas y errores de importación se ven completos; al final hay un resumen por archivo. `npm run test:raw` conserva el comportamiento anterior.
- `npm run doctor` comprueba Node, cada dependencia, `better-sqlite3` nativo (incluido el índice único parcial), la configuración de pruebas y el adaptador SQLite, e indica qué falla.
- La suite compartida informa método, ruta, estado y cuerpo recibido cuando un endpoint responde mal, y distingue "sin respuesta" (con causa de red) de un estado HTTP incorrecto.
- Nuevas pruebas: `test/config.test.js` (4) y estructura ampliada.

## Cambios en 0.1.2
- **Corregido:** en `migrate()` del adaptador PostgreSQL, una variable local `schema` ocultaba el parámetro `schema` (error TDZ). Ahora el DDL se llama `ddl`.
- Migración PostgreSQL dentro de una transacción (BEGIN/COMMIT/ROLLBACK) y con liberación garantizada de la conexión.
- Schema aislado de pruebas por opción de conexión (`-c search_path`), sin carreras; nombre validado con `/^ogtest_[a-f0-9]{6,32}$/`.
- `dropSchema()` solo elimina el schema `ogtest_*` creado por ese adaptador; se niega a tocar cualquier otro (no afecta otras bases ni schemas, incluido `public`).
- `npm run check` ahora revisa TODOS los `.js` de `src`, `test`, `test-support` y `scripts` (19 archivos).
- Nuevas pruebas unitarias del adaptador con pool simulado (`test/postgres-adapter.test.js`): migración, rollback, nombres de schema rechazados y limpieza acotada.
- Test de `/health` compara con la versión de `package.json` (ya no está fija).
- Pruebas de CORS ampliadas con `node:http` (preflight, método no permitido, sin Origin, `CORS_BLOCKED`, ausencia de `Access-Control-Allow-Origin`, coincidencia exacta de origen). Escritas pero **no ejecutadas**.
- Corregido el título engañoso de un subtest en la suite compartida y la cobertura descrita en `docs/TESTING.md`.
- Se conservan todas las correcciones de seguridad de 0.1.1.

Verificado realmente en el entorno de desarrollo: `npm run check` (19/19) y `test/postgres-adapter.test.js` (5/5) ejecutado con un módulo `pg` simulado (solo lógica del adaptador; no es PostgreSQL real).

## Cambios en 0.1.1
- Setup: comparación de clave en tiempo constante; índice único parcial que garantiza un solo propietario (protege contra setups simultáneos); auditoría de intentos denegados.
- Login: igualación de tiempo para usuarios inexistentes (anti-enumeración); auditoría de fallos; rate limit específico (`AUTH_RATE_LIMIT_MAX`).
- JWT fijado a HS256.
- Config: rechaza los valores de ejemplo `REEMPLAZAR...` para JWT_SECRET y CORE_SETUP_KEY.
- Errores: JSON inválido → 400, cuerpo grande → 413 (antes 500).
- SQLite en memoria para pruebas; schema aislado para PostgreSQL de pruebas.
- Suite compartida SQLite/PostgreSQL, pruebas de setup, auth, admin y seguridad.
- Versión de /health leída de package.json.

## Incluido
- Configuración con Zod y `.env.example`.
- Servidor Express y API v1.
- Adaptadores separados SQLite/PostgreSQL.
- Esquemas iniciales.
- Setup de propietario único.
- Login con bcrypt.
- JWT y middleware de autenticación.
- Autorización básica por roles.
- Auditoría básica.
- Helmet, CORS allowlist y rate limit.
- README, arquitectura, operaciones y roadmap.
- Pruebas Node test (ver docs/TESTING.md).

## No verificado en este entorno
No se ejecutó `npm install`, ni pruebas con PostgreSQL real, ni pruebas de carga o auditoría externa. Ejecutar en una máquina con Node 20.11+:
`npm install && npm run check && npm test`

## Pendiente
- Ejecutar `npm install`, generar y commitear package-lock.json.
- Ejecutar pruebas en SQLite y PostgreSQL reales y documentar resultados.
- `npm audit`.
- Completar gestión de usuarios y permisos granulares.
- Refresh tokens, revocación de sesiones y MFA.
- Rate limiting compartido para múltiples instancias.
- Panel privado administrativo.
- Revisión de seguridad independiente.
- Diseñar integración con `og-mobile` sin tocar producción.

## Restricción
No conectar a producción de ÖG ni modificar Supabase hasta aprobar la revisión y diseñar la estrategia de identidad.
