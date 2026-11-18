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

## Flujo de autenticación

1. El propietario se crea una sola vez mediante `/setup` y una clave secreta.
2. El usuario inicia sesión con email y contraseña.
3. Core emite JWT firmado.
4. El middleware verifica firma, emisor y vencimiento, y vuelve a consultar el usuario en la base.
5. Las rutas administrativas aplican autorización por rol.

## Evolución propuesta

1. Completar gestión de usuarios, roles y permisos granulares.
2. Añadir refresh tokens rotatorios y revocación de sesiones.
3. Añadir pruebas de integración con PostgreSQL real.
4. Añadir observabilidad, métricas y alertas.
5. Añadir panel privado administrativo.
6. Definir contrato de integración con Supabase/ÖG Social.
