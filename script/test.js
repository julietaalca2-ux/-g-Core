// Ejecuta cada archivo de prueba por separado, DIRECTAMENTE con node (no mediante el subproceso de `node --test`),
// para que cualquier excepción, process.exit o error de importación se vea completo en pantalla.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const only = process.argv.slice(2);
const files = readdirSync(join(root, 'test')).filter(f => f.endsWith('.test.js')).sort()
  .filter(f => !only.length || only.some(o => f.includes(o)));

const pre = spawnSync(process.execPath, [join(root, 'scripts', 'check.js')], { stdio: 'inherit' });
if (pre.status !== 0) { console.error('\nNo se ejecutan las pruebas: corregí primero los problemas que informa la comprobación anterior.'); process.exit(1); }

const results = [];
for (const f of files) {
  console.log(`\n━━━ ${f} ━━━`);
  const r = spawnSync(process.execPath, ['--test-reporter=spec', join('test', f)], { cwd: root, stdio: 'inherit', env: process.env });
  const ok = r.status === 0;
  results.push({ f, ok, code: r.status, signal: r.signal });
  if (!ok) console.error(`\n✖ ${f} terminó con código ${r.status}${r.signal ? ` (señal ${r.signal})` : ''}. Si arriba no aparece el motivo, ejecutá: node scripts/doctor.js`);
}
console.log('\n━━━ Resumen ━━━');
for (const r of results) console.log(`${r.ok ? '✔' : '✖'} ${r.f}`);
const failed = results.filter(r => !r.ok).length;
console.log(`${results.length - failed}/${results.length} archivos de prueba correctos`);
process.exit(failed ? 1 : 0);
