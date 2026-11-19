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

## CORS y dominios (Render + GitHub Pages)
- La web de ÖG (`public/`) la sirve el propio backend: `https://g-core.onrender.com` es **mismo origen** y siempre se permite
  (por coincidencia Origin/Host y por `RENDER_EXTERNAL_URL`, que Render define solo). En Render dejá `TRUST_PROXY=true`.
- `CORS_ORIGINS` solo debe listar **otros** sitios que llamen a la API desde el navegador, p. ej. `https://julietaalca2-ux.github.io`.
  Formato `esquema://host[:puerto]` **sin ruta**; se normaliza (minúsculas, sin barra final). `*` y valores inválidos hacen fallar el arranque con un mensaje claro.
- El navegador envía `Origin` también en los POST del mismo origen; por eso el propio dominio no puede faltar de la lista de confianza.
- El log de arranque muestra `[CORS] Orígenes permitidos` y cada origen bloqueado se registra una vez (`[CORS] Origen bloqueado`).
- GitHub Pages (`/-g-Core/`) hoy solo publica el README con Jekyll; no es la aplicación. La app funciona desde la URL de Render.
  Para servirla desde otro dominio habría que hacer que `public/app.js` use una URL absoluta de API (hoy usa `/api/v1` relativa).

## Respuesta ante incidentes
- Revocar credenciales y rotar secretos comprometidos.
- Preservar logs relevantes.
- Revisar accesos administrativos y eventos de auditoría.
- Restaurar desde backup verificado si corresponde.
