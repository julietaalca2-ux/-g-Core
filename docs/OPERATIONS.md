# Operación

## Desarrollo
`npm run dev`

## Verificación
`npm run check && npm test`

## Producción
- Ejecutar detrás de un proxy HTTPS administrado.
- Mantener `HOST=127.0.0.1` si el proxy corre en la misma máquina.
- Configurar `TRUST_PROXY=true` solo si existe un proxy confiable correctamente configurado.
- Usar secretos únicos y fuertes.
- Restringir la red de la base de datos.
- Configurar backups y probar restauración.
- No exponer SQLite en un volumen público.
- Supervisar logs y reinicios del proceso.

## Respuesta ante incidentes
- Revocar credenciales y rotar secretos comprometidos.
- Preservar logs relevantes.
- Revisar accesos administrativos y eventos de auditoría.
- Restaurar desde backup verificado si corresponde.
