# Estado de ÖG Core

Versión: 0.1.0
Estado: base inicial generada; requiere instalación de dependencias y ejecución de pruebas en el entorno destino.

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
- Pruebas Node test para health, 401 y hashing.

## No verificado en este entorno
No se ejecutó `npm install`, ni pruebas con PostgreSQL real, ni pruebas de carga o auditoría externa. Ejecutar en una máquina con Node 20.11+:
`npm install && npm run check && npm test`

## Pendiente
- Revisar dependencias y fijar lockfile mediante `npm install`.
- Probar ambos motores de base de datos.
- Añadir tests de setup/login end-to-end.
- Completar gestión de usuarios y permisos granulares.
- Refresh tokens, revocación de sesiones y MFA.
- Rate limiting compartido para múltiples instancias.
- Panel privado administrativo.
- Revisión de seguridad independiente.
- Diseñar integración con `og-mobile` sin tocar producción.

## Restricción
No conectar a producción de ÖG ni modificar Supabase hasta aprobar la revisión y diseñar la estrategia de identidad.
