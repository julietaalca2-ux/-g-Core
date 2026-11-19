# Estado de ÖG Core

Versión: 0.3.0 (Fase 2 backend + Interfaz web Dashboard v0.3.0)

## Alcance de la Fase 2 (implementado)
Registro y cuentas, correos únicos, bcrypt, login/logout con sesiones persistentes revocables (JWT con `sid`), endpoints privados protegidos, consulta/actualización de cuenta, cambio de contraseña, desactivación y eliminación controlada, roles y permisos (owner/admin/user), funciones administrativas protegidas con jerarquía, validación estricta, bloqueo por intentos fallidos, rate limit, auditoría, pruebas para SQLite y PostgreSQL. Ver README (API) y docs/TESTING.md.

## Verificación honesta
- Sin red al generar el ZIP: no se hizo `npm install`. Las pruebas pasaron (9/9 archivos) con dobles de dependencias y `zod` real; hay que repetirlas con dependencias reales.
- **PostgreSQL real NO verificado** (solo lógica con pool simulado). Ejecutar con `TEST_DATABASE_URL`.
- `package-lock.json` y `npm audit` siguen pendientes.

## Cambios respecto a 0.1.4
- Esquema: columnas `updated_at`, `deleted_at`, `password_changed_at`, `failed_logins`, `locked_until` y tabla `sessions`. Bases 0.1.x migran solas (probado en SQLite).
- Los tokens emitidos por 0.1.x dejan de valer (no tienen `sid`): hay que volver a iniciar sesión.
- CORS ahora permite PATCH y DELETE; las pruebas de CORS se actualizaron en consecuencia.
- `JWT_EXPIRES_IN` por defecto 12h (antes 15m): ahora las sesiones son revocables en servidor. Contraseñas: máx. 72 bytes (límite real de bcrypt).
- Nuevas variables: `REGISTRATION_ENABLED`, `LOGIN_MAX_FAILURES`, `LOGIN_LOCK_MINUTES`, `MAX_ACTIVE_SESSIONS`.

## Fuera de alcance (Fase 3 y posteriores)
Refresh tokens rotatorios, recuperación de contraseña, verificación de correo, MFA, panel, observabilidad.

## Restricción
No conectar a producción de ÖG ni modificar Supabase hasta aprobar la revisión y diseñar la estrategia de identidad.


## Entrega v0.3.0 — Interfaz web inicial
- Se agregó `public/index.html`, `public/app.css` y `public/app.js`.
- El servidor Express sirve la web desde el mismo origen (`/`, `/admin`, `/social`).
- La interfaz incluye setup del owner, login, registro, dashboard, usuarios, auditoría, API, perfil y cierre de sesiones.
- Se conserva el backend v0.2.0 y sus rutas; no se reemplaza SQLite ni PostgreSQL.
- Límite: no hay todavía feed social, publicaciones, comentarios, seguidores, chat ni multimedia.
- La interfaz muestra el estado HTTP real; el estado interno de la base no se consulta directamente desde el navegador.
