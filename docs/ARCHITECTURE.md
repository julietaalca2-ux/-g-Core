# Arquitectura inicial de ÖG Core

## Principio

Monolito modular primero; separación de servicios solo cuando métricas, equipos o límites operativos lo justifiquen.

## Módulos

- **HTTP/API:** Express, rutas versionadas bajo `/api/v1`.
- **Configuración:** validación estricta al arrancar.
- **Identidad:** setup inicial, login, consulta de identidad.
- **Seguridad:** hashing de contraseñas, JWT, autenticación y roles.
- **Datos:** adaptadores SQLite/PostgreSQL con interfaz común.
- **Auditoría:** eventos de inicialización y login, consulta restringida.
- **Operación:** health check, cierre ordenado y variables de entorno.

## Límites

El núcleo no contiene todavía lógica de publicaciones, historias, Loors ni archivos multimedia. Esas capacidades pertenecen a módulos de producto que se integrarán mediante contratos API.

## Flujo de autenticación (v0.2.0)

1. El propietario se crea una sola vez mediante `/setup`; el resto de usuarios con `/register`.
2. `/register`, `/setup` y `/login` crean una fila en `sessions` y emiten un JWT (HS256) con `sid`.
3. El middleware verifica firma, emisor y vencimiento; luego exige sesión vigente y no revocada, y usuario `active` (consulta la base en cada petición).
4. Las rutas aplican permisos (`security/permissions.js`) y, en acciones sobre otros usuarios, la jerarquía de roles (`canManageUser`).
5. Logout, cambio de contraseña, suspensión, desactivación y eliminación revocan sesiones.

Estados de cuenta: `active`, `suspended` (por staff), `deactivated` (voluntaria), `deleted` (anonimizada; la fila se conserva por integridad de auditoría).

## Evolución propuesta

1. Completar gestión de usuarios, roles y permisos granulares.
2. Añadir refresh tokens rotatorios y revocación de sesiones.
3. Añadir pruebas de integración con PostgreSQL real.
4. Añadir observabilidad, métricas y alertas.
5. Añadir panel privado administrativo.
6. Definir contrato de integración con Supabase/ÖG Social.
