import { config, corsOrigins } from './config.js';
import { createDatabase } from './db/index.js';
import { createApp } from './app.js';

const db = await createDatabase();
const app = createApp({ db, config, corsOrigins });
const server = app.listen(config.PORT, config.HOST, () => {
  console.log(`ÖG Core escuchando en http://${config.HOST}:${config.PORT} (${db.driver})`);
});
async function shutdown(signal) {
  console.log(`\n${signal}: cerrando ÖG Core...`);
  server.close(async () => { await db.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
