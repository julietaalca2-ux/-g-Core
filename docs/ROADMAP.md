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


## Fase 1 (v0.1.3) — estado
- [x] Correcciones de seguridad del núcleo (código)
- [x] Pruebas escritas (setup, auth, admin, SQLite, PostgreSQL)
- [x] Corregido error TDZ en migrate() de PostgreSQL (v0.1.2)
- [x] `npm run check` cubre todos los .js
- [x] npm install en Codespaces (informado por el usuario)
- [ ] package-lock.json commiteado
- [ ] Causa confirmada del fallo de test/sqlite.test.js (ejecutar `npm run doctor` y `npm run test:report`)
- [ ] Resultados reales de pruebas SQLite
- [ ] Resultados reales de pruebas PostgreSQL
- [ ] npm audit

Siguiente: Fase 2 (arquitectura y bases de datos), tras aprobar los resultados de la Fase 1.

## Fase 2 (v0.2.0) — cuentas y accesos
- [x] Registro, correos únicos, hash bcrypt, login/logout, sesiones revocables
- [x] Endpoints privados protegidos, perfil, cambio de contraseña
- [x] Desactivación y eliminación controlada
- [x] Roles/permisos y funciones administrativas protegidas
- [x] Validaciones, bloqueo por intentos, rate limit, pruebas SQLite/PostgreSQL
- [ ] Ejecución real de la suite con dependencias reales y PostgreSQL real (ver docs/TESTING.md)

Siguiente (NO iniciado): Fase 3.
