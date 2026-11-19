# ÖG Core

Núcleo backend independiente para ÖG. Esta versión 0.3.0 se entrega como **candidata a estable**, no como versión estable: todavía requiere revisión independiente y validación en el entorno de destino. La arquitectura es un **monolito modular**, una aplicación desplegable con módulos separados por responsabilidad; no es una infraestructura distribuida.

## Requisitos

- Node.js 20.11 o superior.
- npm.
- Para SQLite: no requiere servidor de base de datos.
- Para PostgreSQL: una instancia PostgreSQL accesible y una URL de conexión.

## Panel web Ög (v0.3.0)

El servidor ahora entrega una interfaz web responsive en `/` (también `/admin` y `/social`).
Incluye acceso del propietario inicial, login/registro, panel administrativo, estado HTTP,
listado y gestión de usuarios según permisos, auditoría, perfil básico y seguridad de sesiones.
Los archivos estáticos están en `public/` y se sirven desde el mismo origen que la API.

**Importante:** esta interfaz no implementa todavía publicaciones, comentarios, seguidores,
mensajería ni carga de medios. Esas funciones sociales requieren endpoints y módulos de producto
posteriores. El backend v0.2.0 se conserva como núcleo de identidad, sesiones, permisos y auditoría.

## Instalación rápida

```bash
cp .env.example .env
npm ci
```

`package-lock.json` fija las versiones resueltas para instalaciones reproducibles. `npm ci` usa ese lockfile y no debe reemplazarse por `npm install` para validar este paquete.

Generá dos secretos diferentes (uno para JWT y otro para el setup inicial). Por ejemplo, con Node:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Pegá un valor en `JWT_SECRET` y otro en `CORE_SETUP_KEY`. No compartas el `.env` ni lo subas a GitHub.

Para el primer arranque, dejá `DATABASE_DRIVER=sqlite`. Luego:

```bash
npm run check
npm run test:report
npm start
```

Servidor predeterminado: `http://127.0.0.1:8787`. Abrí esa dirección para usar la web.

## Inicializar propietario

La inicialización solo se permite mientras no exista un usuario con rol `owner`. Es una operación de un solo uso. Ejecutala desde un entorno confiable y no publiques la clave de setup.

```bash
curl -X POST http://127.0.0.1:8787/api/v1/auth/setup \
  -H "Content-Type: application/json" \
  -d '{"setupKey":"TU_CORE_SETUP_KEY","email":"admin@example.com","password":"UnaClaveLargaYUnica!2026","displayName":"Administrador ÖG"}'
```

La respuesta contiene un token de acceso. Guardalo de forma segura.

## API v1

Autenticación: `Authorization: Bearer TOKEN`. Errores: `{ "error": { "code", "message", "details?" } }`.

| Método | Ruta | Acceso | Función |
|---|---|---|---|
| GET | `/health` | Público | Estado del servicio |
| POST | `/api/v1/auth/setup` | Clave de setup, una vez | Crear propietario inicial |
| POST | `/api/v1/auth/register` | Público (`REGISTRATION_ENABLED`) | Crear cuenta (rol `user`) |
| POST | `/api/v1/auth/login` | Público | Iniciar sesión |
| POST | `/api/v1/auth/logout` | Sesión | Cerrar la sesión actual (invalida el token) |
| POST | `/api/v1/auth/logout-all` | Sesión | Cerrar todas las sesiones |
| GET | `/api/v1/auth/me` | Sesión | Consultar usuario autenticado |
| PATCH | `/api/v1/auth/me` | Sesión | Cambiar `displayName` y/o `email` (el correo exige `currentPassword`) |
| POST | `/api/v1/auth/change-password` | Sesión | `currentPassword` + `newPassword`; revoca las demás sesiones |
| POST | `/api/v1/auth/account/deactivate` | Sesión + `password` | Desactivar la propia cuenta (reversible por staff) |
| DELETE | `/api/v1/auth/account` | Sesión + `password` | Eliminar la propia cuenta (anonimiza datos, libera el correo) |
| GET | `/api/v1/admin/audit` | `audit:read` | Auditoría |
| GET | `/api/v1/admin/users` | `users:read` | Listar (`limit`, `offset`, `status`, `role`) |
| GET | `/api/v1/admin/users/:id` | `users:read` | Ver usuario |
| POST | `/api/v1/admin/users/:id/suspend` | `users:suspend` | Suspender (revoca sesiones) |
| POST | `/api/v1/admin/users/:id/reactivate` | `users:suspend` | Reactivar suspendido/desactivado |
| PATCH | `/api/v1/admin/users/:id/role` | `users:role` (solo owner) | Cambiar rol a `admin` o `user` |
| DELETE | `/api/v1/admin/users/:id` | `users:delete` | Eliminación controlada |

### Roles y permisos
- **owner** (único): todos los permisos. No puede desactivarse, eliminarse ni degradarse.
- **admin**: `audit:read`, `users:read`, `users:suspend`, `users:delete`, solo sobre usuarios con rol `user`.
- **user**: sin permisos administrativos.
Ningún actor administra a sí mismo por la vía administrativa. El rol se lee de la base en cada petición: un cambio de rol o una suspensión rigen de inmediato.

## PostgreSQL

1. Creá una base de datos vacía.
2. En `.env`, configurá `DATABASE_DRIVER=postgres`.
3. Configurá `DATABASE_URL` con una cadena de conexión protegida.
4. Iniciá el servicio. La migración inicial se ejecuta al arrancar.

No uses credenciales de producción hasta revisar permisos, backups, TLS y política de red. El adaptador PostgreSQL y el SQLite están separados; las migraciones se mantienen en archivos distintos.

## Estructura

```text
og-core/
├── src/
│   ├── app.js
│   ├── server.js
│   ├── config.js
│   ├── db/
│   ├── middleware/
│   ├── routes/
│   └── security/
├── test/
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
└── README.md
```

## Seguridad y límites conocidos de esta versión

- Contraseñas con bcrypt (12 rondas); política: 12–72 bytes, sin contraseñas comunes ni triviales.
- Sesiones persistentes: el JWT lleva un `sid` que se valida contra la tabla `sessions` en cada petición; cerrar sesión, cambiar contraseña, suspender o eliminar revoca de verdad. Máximo `MAX_ACTIVE_SESSIONS` por usuario.
- Bloqueo de cuenta tras `LOGIN_MAX_FAILURES` fallos durante `LOGIN_LOCK_MINUTES`; la respuesta es idéntica a una contraseña incorrecta (sin enumeración).
- Validación estricta con Zod (campos desconocidos rechazados: sin mass-assignment), rate limit en registro/login/operaciones sensibles, límite de cuerpo JSON.
- Operaciones sensibles (cambiar correo/contraseña, desactivar, eliminar) piden reconfirmar la contraseña.
- Helmet, CORS allowlist (GET, POST, PATCH, DELETE), consultas parametrizadas, auditoría de acciones de cuenta y administrativas (incluidos los intentos denegados).
- La ruta de setup queda cerrada después de crear el primer owner.
- `POST /auth/register` responde 409 si el correo existe (permite saber si un correo está registrado; mitigado por rate limit). Si no se quiere, desactivar el registro público.
- No hay todavía refresh tokens rotatorios (Fase 3), recuperación de contraseña, verificación de correo, MFA, cola de eventos ni métricas. El dashboard administrativo básico sí forma parte de v0.3.0. El token de acceso dura `JWT_EXPIRES_IN` (12 h por defecto).
- El rate limit es en memoria y por proceso; para varias instancias debe migrarse a un almacén compartido.
- La auditoría no es criptográficamente inmutable: los permisos de base de datos y backups deben protegerla.
- El primer owner debe crearse con acceso local o canal seguro. No expongas la clave de setup a Internet.
- Antes de producción se requieren pruebas de carga, revisión independiente de seguridad, TLS, backups probados, gestión de secretos y políticas operativas.

### Estado de la alerta de Zod 3

Este paquete conserva Zod 3 (`package-lock.json` fija la versión resuelta); no se migró a Zod 4. GitHub mantiene listado GHSA-mrhx-c7xc-m3w5 como alerta alta para versiones anteriores a 4.6.6, mientras que el CVE asociado fue rechazado por CVE.org y NVD. ÖG Core no define esquemas Zod de arrays, sets o maps y limita los cuerpos JSON a 32 KB. Esto describe el alcance observado, pero **no borra la alerta del escáner** ni sustituye una revisión de seguridad. Referencias: [GHSA](https://github.com/advisories/GHSA-MRHX-C7XC-M3W5), [CVE.org](https://www.cve.org/CVERecord?id=CVE-2023-54404).

## Conexión futura con ÖG

ÖG Core todavía no modifica ni reemplaza Supabase ni el frontend `og-mobile`. La integración debe hacerse después de revisar el código, definir qué sistema es la fuente de verdad para identidad y permisos, y diseñar una migración gradual. No dupliques autenticación entre Supabase y Core sin una estrategia explícita.

## Licencia

Uso privado del proyecto ÖG. No publicar secretos, datos personales ni bases de datos.


## Pruebas
Ver `docs/TESTING.md`. Instalación reproducible y verificación: `npm ci && npm run check && npm run test:report`. Las pruebas PostgreSQL reales requieren una base desechable explícitamente configurada mediante `TEST_DATABASE_URL`; no se conectan por defecto.
