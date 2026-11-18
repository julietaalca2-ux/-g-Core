# ÖG Core

Núcleo backend independiente para ÖG. Esta primera versión es un **monolito modular**: una aplicación desplegable con módulos separados por responsabilidad. No es todavía una infraestructura distribuida ni debe considerarse lista para producción sin revisión y pruebas en el entorno real.

## Requisitos

- Node.js 20.11 o superior.
- npm.
- Para SQLite: no requiere servidor de base de datos.
- Para PostgreSQL: una instancia PostgreSQL accesible y una URL de conexión.

## Instalación rápida

```bash
cp .env.example .env
npm install
```

Generá dos secretos diferentes (uno para JWT y otro para el setup inicial). Por ejemplo, con Node:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Pegá un valor en `JWT_SECRET` y otro en `CORE_SETUP_KEY`. No compartas el `.env` ni lo subas a GitHub.

Para el primer arranque, dejá `DATABASE_DRIVER=sqlite`. Luego:

```bash
npm run check
npm test
npm start
```

Servidor predeterminado: `http://127.0.0.1:8787`.

## Inicializar propietario

La inicialización solo se permite mientras no exista un usuario con rol `owner`. Es una operación de un solo uso. Ejecutala desde un entorno confiable y no publiques la clave de setup.

```bash
curl -X POST http://127.0.0.1:8787/api/v1/auth/setup \
  -H "Content-Type: application/json" \
  -d '{"setupKey":"TU_CORE_SETUP_KEY","email":"admin@example.com","password":"UnaClaveLargaYUnica!2026","displayName":"Administrador ÖG"}'
```

La respuesta contiene un token de acceso. Guardalo de forma segura.

## API v1

| Método | Ruta | Acceso | Función |
|---|---|---|---|
| GET | `/health` | Público | Estado del servicio |
| POST | `/api/v1/auth/setup` | Clave de setup, una sola vez | Crear propietario inicial |
| POST | `/api/v1/auth/login` | Público | Iniciar sesión |
| GET | `/api/v1/auth/me` | Bearer token | Consultar identidad propia |
| GET | `/api/v1/admin/audit` | Owner/Admin | Consultar auditoría |

Para `/api/v1/admin/audit` se usa `Authorization: Bearer TOKEN`.

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
└── README.md
```

## Seguridad y límites conocidos de esta versión

- Contraseñas con bcrypt (12 rondas).
- JWT de acceso de corta duración configurable.
- Middleware de autenticación y control de roles.
- Helmet, CORS allowlist, límite de tamaño JSON y rate limit básico.
- Consultas parametrizadas.
- Auditoría de inicialización y login.
- La ruta de setup queda cerrada después de crear el primer owner.
- No hay todavía refresh tokens, revocación inmediata de JWT, recuperación de contraseña, MFA, gestión completa de usuarios, cola de eventos, métricas avanzadas ni panel web.
- El rate limit es en memoria y por proceso; para varias instancias debe migrarse a un almacén compartido.
- La auditoría no es criptográficamente inmutable: los permisos de base de datos y backups deben protegerla.
- El primer owner debe crearse con acceso local o canal seguro. No expongas la clave de setup a Internet.
- Antes de producción se requieren pruebas de carga, revisión independiente de seguridad, TLS, backups probados, gestión de secretos y políticas operativas.

## Conexión futura con ÖG

ÖG Core todavía no modifica ni reemplaza Supabase ni el frontend `og-mobile`. La integración debe hacerse después de revisar el código, definir qué sistema es la fuente de verdad para identidad y permisos, y diseñar una migración gradual. No dupliques autenticación entre Supabase y Core sin una estrategia explícita.

## Licencia

Uso privado del proyecto ÖG. No publicar secretos, datos personales ni bases de datos.
