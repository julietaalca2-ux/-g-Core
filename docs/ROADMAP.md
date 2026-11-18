# Hoja de ruta

## v0.1.0 — Base inicial
- Servidor HTTP y API v1.
- Configuración validada.
- SQLite y PostgreSQL como adaptadores.
- Inicialización de owner, login y perfil.
- Autenticación JWT y roles básicos.
- Auditoría básica.
- Pruebas iniciales.

## Próximas versiones
- v0.2: gestión completa de usuarios, roles y permisos granulares.
- v0.3: sesiones persistentes, refresh token rotatorio y revocación.
- v0.4: integración probada con PostgreSQL y migraciones versionadas.
- v0.5: observabilidad, métricas, alertas y endurecimiento de seguridad.
- v0.6: panel privado de administración.
- v1.0: integración gradual con ÖG tras auditoría y plan de migración.


## Fase 1 (v0.1.2) — estado
- [x] Correcciones de seguridad del núcleo (código)
- [x] Pruebas escritas (setup, auth, admin, SQLite, PostgreSQL)
- [x] Corregido error TDZ en migrate() de PostgreSQL (v0.1.2)
- [x] `npm run check` cubre todos los .js
- [ ] npm install + package-lock.json
- [ ] Resultados reales de pruebas SQLite
- [ ] Resultados reales de pruebas PostgreSQL
- [ ] npm audit

Siguiente: Fase 2 (arquitectura y bases de datos), tras aprobar los resultados de la Fase 1.
