// Diagnóstico del entorno: comprueba Node, dependencias, SQLite nativo y configuración de pruebas.
const out = (ok, msg) => console.log(`${ok ? '✔' : '✖'} ${msg}`);
let bad = 0;
const fail = (msg, e) => { bad++; out(false, `${msg}${e ? `: ${e.message ?? e}` : ''}`); };

const [major, minor] = process.versions.node.split('.').map(Number);
(major > 20 || (major === 20 && minor >= 11)) ? out(true, `Node ${process.versions.node}`) : fail(`Node ${process.versions.node} (se requiere >= 20.11)`);

for (const dep of ['express', 'helmet', 'cors', 'express-rate-limit', 'zod', 'bcryptjs', 'jsonwebtoken', 'dotenv', 'better-sqlite3', 'pg']) {
  try { await import(dep); out(true, `import ${dep}`); } catch (e) { fail(`import ${dep}`, e); }
}
try {
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(':memory:');
  db.exec('CREATE TABLE t(x); CREATE UNIQUE INDEX u ON t(x) WHERE x = 1; INSERT INTO t VALUES (1)');
  try { db.exec('INSERT INTO t VALUES (1)'); fail('el índice único parcial no se aplicó'); }
  catch (e) { out(/UNIQUE|CONSTRAINT/i.test(`${e.code} ${e.message}`), `SQLite nativo: índice único parcial funciona (${e.code})`); }
  db.close();
} catch (e) { fail('SQLite nativo (better-sqlite3)', e); }
try {
  await import('../test/support/env.js');
  const { loadConfig } = await import('../src/config.js');
  loadConfig(process.env); out(true, 'configuración de pruebas válida');
} catch (e) { fail('configuración de pruebas', e); }
try {
  const { createSqliteDatabase } = await import('../src/db/sqlite.js');
  const db = createSqliteDatabase(':memory:'); await db.migrate(); await db.migrate();
  out((await db.countOwners()) === 0, 'adaptador SQLite: migración idempotente y consultas básicas'); await db.close();
} catch (e) { fail('adaptador SQLite', e); }
console.log(bad ? `\n${bad} problema(s) detectado(s).` : '\nEntorno correcto.');
process.exit(bad ? 1 : 0);
